/**
 * AI Card 流式响应模块
 * 支持 AI Card 创建、流式更新、完成
 */

import type { DingtalkConfig } from "../../types/index.ts";
import { DINGTALK_API, getAccessToken } from "../../utils/token.ts";
import { dingtalkHttp } from "../../utils/http-client.ts";

// ============ 全局 AI Card 活跃注册表 ============
// 用于让 outbound.sendText（message 工具）能感知当前会话是否有活跃的 AI Card，
// 并将消息路由到 streamAICard 而非发送独立的 DingTalk 消息气泡。
// key: openConversationId（群聊对话 ID，如 "cidXXXX"）
const _activeCardRegistry = new Map<string, AICardInstance>();

export function registerActiveCard(openConversationId: string, card: AICardInstance): void {
  _activeCardRegistry.set(openConversationId, card);
}

export function unregisterActiveCard(openConversationId: string): void {
  _activeCardRegistry.delete(openConversationId);
}

export function getActiveCardForConversation(openConversationId: string): AICardInstance | null {
  return _activeCardRegistry.get(openConversationId) ?? null;
}

// ============ 常量 ============

const DEFAULT_CARD_TEMPLATE_ID = "02fcf2f4-5e02-4a85-b672-46d1f715543e.schema";
const DEFAULT_CARD_CONTENT_VAR = "msgContent";

/**
 * 钉钉卡片 API 的最大 QPS（官方限制约 40 次/秒）。
 * 保守取 20，为 createAICardForTarget / finishAICard 等非流式调用留余量。
 */
const CARD_API_MAX_QPS = 20;

/** QPS 限流退避时长（ms），遇到 403 QpsLimit 后暂停发送 */
const QPS_BACKOFF_DURATION_MS = 2_000;

/** finalize（isFinalize=true）最多尝试次数（含首次） */
const FINALIZE_MAX_ATTEMPTS = 3;

/** finalize 重试基础间隔（ms）；第 n 次重试等待 n * BASE */
const FINALIZE_RETRY_BASE_MS = 500;

function newStreamingGuid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============ 全局令牌桶限流器 ============

/**
 * 全局令牌桶限流器，所有 streamAICard 调用共享。
 *
 * 解决的问题：每个 reply-dispatcher 实例有独立的 500ms 节流间隔，
 * 但多个会话并发时总 QPS 会叠加超过钉钉 API 限制（40 次/秒），
 * 导致频繁触发 403 QpsLimit 错误。
 *
 * 工作原理：
 * - 令牌桶以 CARD_API_MAX_QPS 的速率补充令牌
 * - 每次 API 调用前消耗一个令牌，无令牌时等待
 * - 遇到 QpsLimit 错误时触发退避，暂停所有调用
 */
const cardRateLimiter = {
  /** 当前可用令牌数 */
  tokens: CARD_API_MAX_QPS,
  /** 上次令牌补充时间 */
  lastRefillTime: Date.now(),
  /** QPS 退避截止时间（遇到限流错误后设置） */
  backoffUntil: 0,
  /**
   * 串行化锁：保证并发的 waitForToken 被一个一个处理。
   * 否则多个并发调用会同时通过 `tokens < 1` 检查并各自扣减，
   * 令牌桶会被并发击穿，导致实际 QPS 远超 CARD_API_MAX_QPS。
   */
  _queueTail: Promise.resolve() as Promise<unknown>,

  /**
   * 补充令牌：按时间流逝恢复令牌数
   */
  refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(
        CARD_API_MAX_QPS,
        this.tokens + elapsedSeconds * CARD_API_MAX_QPS,
      );
      this.lastRefillTime = now;
    }
  },

  /**
   * 等待直到有可用令牌，或退避期结束
   * @returns 等待的毫秒数（0 表示无需等待）
   *
   * 通过 `_queueTail` 将所有并发调用串行化，确保 token 扣减真正生效。
   */
  async waitForToken(): Promise<number> {
    const prev = this._queueTail;
    let release!: () => void;
    this._queueTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await prev;
    } catch {
      /* 忽略前序错误，只用于串行等待 */
    }

    try {
      let totalWaitMs = 0;

      // 如果处于退避期，先等待退避结束
      const now = Date.now();
      if (now < this.backoffUntil) {
        const backoffWaitMs = this.backoffUntil - now;
        await sleep(backoffWaitMs);
        totalWaitMs += backoffWaitMs;
      }

      this.refill();

      // 如果没有可用令牌，等待直到有令牌
      if (this.tokens < 1) {
        const waitMs = Math.ceil(((1 - this.tokens) / CARD_API_MAX_QPS) * 1000);
        await sleep(waitMs);
        totalWaitMs += waitMs;
        this.refill();
      }

      this.tokens -= 1;
      return totalWaitMs;
    } finally {
      release();
    }
  },

  /**
   * 触发退避：遇到 QpsLimit 错误时调用
   */
  triggerBackoff(): void {
    const backoffEnd = Date.now() + QPS_BACKOFF_DURATION_MS;
    this.backoffUntil = backoffEnd;
    // 清空令牌，退避期结束后重新补充
    this.tokens = 0;
    this.lastRefillTime = backoffEnd;
  },
};

/** 简单的 sleep 工具函数 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 判断错误是否为钉钉 QPS 限流错误。
 *
 * 导出给上层调用（如 reply-dispatcher），用于在错误处理时区分
 * 「瞬时可恢复错误」与「真正的发送失败」，避免把 QPS 限流这种
 * 内部已自动退避重试、后续会自动恢复的错误展示为用户可见的
 * 「消息发送失败」提示。
 */
export function isQpsLimitError(err: any): boolean {
  const errorCode = err?.response?.data?.code;
  return (
    err?.response?.status === 403 &&
    typeof errorCode === "string" &&
    errorCode.includes("QpsLimit")
  );
}

/**
 * 判断请求结果是否不确定：客户端没有拿到 HTTP 响应，但请求可能已经被
 * DingTalk 接收（例如 AggregateError、超时或连接在响应前断开）。
 * 这类错误不能立即发送文字兜底，否则会出现 Card 和文字各发一份。
 */
export function isAmbiguousCardError(err: any): boolean {
  if (err instanceof AggregateError) return true;
  // 已拿到 HTTP 响应 → 成败明确（含 4xx/5xx）
  if (err?.response) return false;
  if (err?.request) return true;
  return (
    typeof err?.code === "string" &&
    ["ECONNABORTED", "ETIMEDOUT", "ECONNRESET", "ERR_NETWORK"].includes(err.code)
  );
}

/** 已有 HTTP 4xx 且不是 QPS：重试不会成功，应立刻交给文字降级。 */
function isDefiniteClientError(err: any): boolean {
  const status = err?.response?.status;
  return typeof status === "number" && status >= 400 && status < 500 && !isQpsLimitError(err);
}

/** AI Card 状态 */
const AICardStatus = {
  PROCESSING: "1",
  INPUTING: "2",
  FINISHED: "3",
  EXECUTING: "4",
  FAILED: "5",
} as const;

/** AI Card 实例接口 */
export interface AICardInstance {
  cardInstanceId: string;
  accessToken: string;
  tokenExpireTime: number;
  inputingStarted: boolean;
}

/** AI Card 投放目标类型 */
export type AICardTarget =
  | { type: "user"; userId: string }
  | { type: "group"; openConversationId: string };

// ============ Markdown 格式修正 ============

/**
 * 确保 Markdown 表格前有空行，否则钉钉无法正确渲染表格
 */
function ensureTableBlankLines(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  const tableDividerRegex = /^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?\s*$/;
  const tableRowRegex = /^\s*\|?.*\|.*\|?\s*$/;

  const isDivider = (line: string) =>
    line &&
    typeof line === "string" &&
    line.includes("|") &&
    tableDividerRegex.test(line);

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const nextLine = lines[i + 1] ?? "";

    if (
      tableRowRegex.test(currentLine) &&
      isDivider(nextLine) &&
      i > 0 &&
      lines[i - 1].trim() !== "" &&
      !tableRowRegex.test(lines[i - 1])
    ) {
      result.push("");
    }

    result.push(currentLine);
  }
  return result.join("\n");
}

// ============ AI Card 相关 ============

/**
 * 构建卡片投放请求体
 */
export function buildDeliverBody(
  cardInstanceId: string,
  target: AICardTarget,
  robotCode: string,
): any {
  const base = { outTrackId: cardInstanceId, userIdType: 1 };

  if (target.type === "group") {
    return {
      ...base,
      openSpaceId: `dtv1.card//IM_GROUP.${target.openConversationId}`,
      imGroupOpenDeliverModel: {
        robotCode,
      },
    };
  }

  return {
    ...base,
    openSpaceId: `dtv1.card//IM_ROBOT.${target.userId}`,
    imRobotOpenDeliverModel: {
      spaceType: 'IM_ROBOT',
      robotCode,
      extension: {
        dynamicSummary: 'true',
      },
    },
  };
}

/**
 * 通用 AI Card 创建函数
 */
export async function createAICardForTarget(
  config: DingtalkConfig,
  target: AICardTarget,
  log?: any,
): Promise<AICardInstance | null> {
  const targetDesc =
    target.type === "group"
      ? `群聊 ${target.openConversationId}`
      : `用户 ${target.userId}`;

  const cardTemplateId = config.cardTemplateId || DEFAULT_CARD_TEMPLATE_ID;

  try {
    const token = await getAccessToken(config);
    const cardInstanceId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    log?.info?.(
      `[DingTalk][AICard] 开始创建卡片：${targetDesc}, outTrackId=${cardInstanceId}, templateId=${cardTemplateId}`,
    );

    // 1. 创建卡片实例
    const createBody = {
      cardTemplateId: cardTemplateId,
      outTrackId: cardInstanceId,
      cardData: {
          cardParamMap: {
              config: JSON.stringify({ autoLayout: true }),
          }
      },
      callbackType: "STREAM",
      imGroupOpenSpaceModel: { supportForward: true },
      imRobotOpenSpaceModel: { supportForward: true },
    };

    const createResp = await dingtalkHttp.post(
      `${DINGTALK_API}/v1.0/card/instances`,
      createBody,
      {
        headers: {
          "x-acs-dingtalk-access-token": token,
          "Content-Type": "application/json",
        },
      },
    );

    // 2. 投放卡片
    const deliverBody = buildDeliverBody(
      cardInstanceId,
      target,
      String(config.clientId ?? ""),
    );

    const deliverResp = await dingtalkHttp.post(
      `${DINGTALK_API}/v1.0/card/instances/deliver`,
      deliverBody,
      {
        headers: {
          "x-acs-dingtalk-access-token": token,
          "Content-Type": "application/json",
        },
      },
    );

    // 记录 token 过期时间（钉钉 token 有效期 2 小时）
    const tokenExpireTime = Date.now() + 2 * 60 * 60 * 1000;
    
    return { cardInstanceId, accessToken: token, tokenExpireTime, inputingStarted: false };
  } catch (err: any) {
    log?.error?.(
      `[DingTalk][AICard] 创建卡片失败 (${targetDesc}): ${err.message}`,
    );
    if (err.response) {
      log?.error?.(
        `[DingTalk][AICard] 错误响应：status=${err.response.status}`,
      );
    }
    return null;
  }
}

/**
 * 确保 Token 有效（自动刷新过期的 Token）
 */
async function ensureValidToken(
  card: AICardInstance,
  config: DingtalkConfig,
): Promise<string> {
  // 如果 token 即将过期（提前 5 分钟刷新）
  if (Date.now() > card.tokenExpireTime - 5 * 60 * 1000) {
    const newToken = await getAccessToken(config);
    card.accessToken = newToken;
    card.tokenExpireTime = Date.now() + 2 * 60 * 60 * 1000;
  }
  return card.accessToken;
}

export type StreamAICardResult = { written: boolean };

/**
 * partial：QPS 再试一次，仍失败则 skipped，不抛。
 * finalize：4xx（非 QPS）立即抛；其余按 FINALIZE_MAX_ATTEMPTS 重试后抛最后一次错误。
 */
async function runCardPut(options: {
  finished: boolean;
  label: string;
  log?: any;
  put: () => Promise<{ status?: number }>;
  beforeRetry?: () => void;
}): Promise<"ok" | "skipped"> {
  const { finished, label, log, put, beforeRetry } = options;

  try {
    const resp = await put();
    log?.info?.(`[DingTalk][AICard] ${label} 响应：status=${resp?.status}`);
    return "ok";
  } catch (err: any) {
    if (!finished) {
      if (isQpsLimitError(err)) {
        cardRateLimiter.triggerBackoff();
        log?.warn?.(
          `[DingTalk][AICard] ${label} 触发 QPS 限流，退避 ${QPS_BACKOFF_DURATION_MS}ms 后重试`,
        );
        await cardRateLimiter.waitForToken();
        beforeRetry?.();
        try {
          const retryResp = await put();
          log?.info?.(`[DingTalk][AICard] ${label} 重试成功：status=${retryResp?.status}`);
          return "ok";
        } catch (retryErr: any) {
          log?.warn?.(
            `[DingTalk][AICard] ${label} 重试仍失败，静默跳过：${retryErr?.message || String(retryErr)}`,
          );
          return "skipped";
        }
      }
      log?.warn?.(
        `[DingTalk][AICard] ${label} 失败，静默跳过：${err?.message || String(err)}`,
      );
      return "skipped";
    }

    if (isDefiniteClientError(err)) {
      log?.error?.(
        `[DingTalk][AICard] ${label} 客户端错误，不再重试：${err?.message || String(err)}`,
      );
      throw err;
    }

    let lastErr: any = err;
    for (let attempt = 2; attempt <= FINALIZE_MAX_ATTEMPTS; attempt++) {
      if (isQpsLimitError(lastErr)) {
        cardRateLimiter.triggerBackoff();
      }
      const delayMs = FINALIZE_RETRY_BASE_MS * (attempt - 1);
      log?.warn?.(
        `[DingTalk][AICard] ${label} finalize 失败 (${attempt - 1}/${FINALIZE_MAX_ATTEMPTS - 1})，${delayMs}ms 后重试：${lastErr?.message || String(lastErr)}`,
      );
      await sleep(delayMs);
      await cardRateLimiter.waitForToken();
      beforeRetry?.();
      try {
        const retryResp = await put();
        log?.info?.(
          `[DingTalk][AICard] ${label} finalize 重试成功 (attempt=${attempt})：status=${retryResp?.status}`,
        );
        return "ok";
      } catch (retryErr: any) {
        lastErr = retryErr;
        if (isDefiniteClientError(lastErr)) {
          log?.error?.(
            `[DingTalk][AICard] ${label} 客户端错误，停止重试：${lastErr?.message || String(lastErr)}`,
          );
          throw lastErr;
        }
      }
    }
    log?.error?.(
      `[DingTalk][AICard] ${label} finalize 重试耗尽：${lastErr?.message || String(lastErr)}`,
    );
    throw lastErr;
  }
}

/**
 * 流式更新 AI Card 内容
 *
 * 内置全局令牌桶限流：所有会话共享同一速率限制。
 * - 中间更新（finished=false）：失败返回 written=false（含 INPUTING），等下次 partial 用 isFull 覆盖。
 * - finalize（finished=true）：INPUTING 与 streaming 共用重试；4xx（非 QPS）立即抛出。
 */
export async function streamAICard(
  card: AICardInstance,
  content: string,
  finished: boolean = false,
  config?: DingtalkConfig,
  log?: any,
  /** 覆盖默认变量名，优先级：contentVar > config.cardProcessVar > config.cardContentVar */
  contentVar?: string,
): Promise<StreamAICardResult> {
  const varName = contentVar
    || (config?.cardProcessVar as string)
    || (config?.cardContentVar as string)
    || DEFAULT_CARD_CONTENT_VAR;
  // 防御 null card（createAICardForTarget 失败返回 null，调用方可能用 as any 绕过类型检查）
  if (!card) {
    log?.warn?.(`[DingTalk][AICard] streamAICard 收到 null card，跳过更新`);
    return { written: false };
  }
  // 确保 token 有效
  if (config) {
    await ensureValidToken(card, config);
  }
  if (!card.inputingStarted) {
    // 等待全局限流令牌（INPUTING 状态切换也消耗 QPS）
    const inputingWaitMs = await cardRateLimiter.waitForToken();
    if (inputingWaitMs > 0) {
      log?.debug?.(`[DingTalk][AICard] INPUTING 等待限流令牌 ${inputingWaitMs}ms`);
    }

    const statusBody = {
      outTrackId: card.cardInstanceId,
      cardData: {
        cardParamMap: {
          flowStatus: AICardStatus.INPUTING,
          [varName]: content,
          staticMsgContent: "",
          sys_full_json_obj: JSON.stringify({
            order: [varName],
          }),
          config: JSON.stringify({ autoLayout: true }),
        },
      },
    };
    const putInputing = () =>
      dingtalkHttp.put(`${DINGTALK_API}/v1.0/card/instances`, statusBody, {
        headers: {
          "x-acs-dingtalk-access-token": card.accessToken,
          "Content-Type": "application/json",
        },
      });
    const inputingResult = await runCardPut({
      finished,
      label: "INPUTING",
      log,
      put: putInputing,
    });
    if (inputingResult === "skipped") {
      return { written: false };
    }
    card.inputingStarted = true;
  }

  const fixedContent = ensureTableBlankLines(content);
  const body = {
    outTrackId: card.cardInstanceId,
    guid: newStreamingGuid(),
    key: varName,
    content: fixedContent,
    isFull: true,
    isFinalize: finished,
    isError: false,
  };

  const putStreaming = () =>
    dingtalkHttp.put(`${DINGTALK_API}/v1.0/card/streaming`, body, {
      headers: {
        "x-acs-dingtalk-access-token": card.accessToken,
        "Content-Type": "application/json",
      },
    });

  // 等待全局限流令牌
  const streamWaitMs = await cardRateLimiter.waitForToken();
  if (streamWaitMs > 0) {
    log?.debug?.(`[DingTalk][AICard] streaming 等待限流令牌 ${streamWaitMs}ms`);
  }

  log?.info?.(
    `[DingTalk][AICard] PUT /v1.0/card/streaming contentLen=${content.length} isFinalize=${finished}`,
  );
  const streamResult = await runCardPut({
    finished,
    label: "streaming",
    log,
    put: putStreaming,
    beforeRetry: () => {
      body.guid = newStreamingGuid();
    },
  });
  return { written: streamResult === "ok" };
}

/**
 * 完成 AI Card
 */
export async function finishAICard(
  card: AICardInstance,
  content: string,
  config?: DingtalkConfig,
  log?: any,
  /** 写入内容变量名（默认 cardContentVar） */
  contentVar?: string,
): Promise<void> {
  const varName = contentVar
    || (config?.cardContentVar as string)
    || DEFAULT_CARD_CONTENT_VAR;
  // 确保 token 有效
  if (config) {
    await ensureValidToken(card, config);
  }
  const fixedContent = ensureTableBlankLines(content);
  log?.info?.(
    `[DingTalk][AICard] 开始 finish，最终内容长度=${fixedContent.length}`,
  );

  await streamAICard(card, fixedContent, true, config, log);

  const body = {
    outTrackId: card.cardInstanceId,
    cardData: {
      cardParamMap: {
        flowStatus: AICardStatus.FINISHED,
        [varName]: fixedContent,
        staticMsgContent: "",
        sys_full_json_obj: JSON.stringify({
          order: [varName],
        }),
        config: JSON.stringify({ autoLayout: true }),
      },
    },
    cardUpdateOptions: { updateCardDataByKey: true },
  };

  const putFinished = () =>
    dingtalkHttp.put(`${DINGTALK_API}/v1.0/card/instances`, body, {
      headers: {
        "x-acs-dingtalk-access-token": card.accessToken,
        "Content-Type": "application/json",
      },
    });

  try {
    // Wait for a rate-limiter token before the FINISHED PUT call to avoid
    // exceeding QPS limits when multiple conversations finish concurrently.
    await cardRateLimiter.waitForToken();
    const finishResp = await putFinished();
    log?.info?.(
      `[DingTalk][AICard] FINISHED 响应：status=${finishResp.status}`,
    );
  } catch (err: any) {
    if (isQpsLimitError(err)) {
      // FINISHED 失败会让卡片卡在"思考中"状态（loading 动画不消失），
      // 是最影响用户体验的失败路径，必须退避重试一次以兜底。
      cardRateLimiter.triggerBackoff();
      log?.warn?.(
        `[DingTalk][AICard] FINISHED 触发 QPS 限流，退避 ${QPS_BACKOFF_DURATION_MS}ms 后重试`,
      );
      try {
        await cardRateLimiter.waitForToken();
        const retryResp = await putFinished();
        log?.info?.(
          `[DingTalk][AICard] FINISHED 重试成功：status=${retryResp.status}`,
        );
        return;
      } catch (retryErr: any) {
        log?.error?.(
          `[DingTalk][AICard] FINISHED 重试失败：${retryErr.message}`,
        );
      }
    } else {
      log?.error?.(`[DingTalk][AICard] FINISHED 更新失败：${err.message}`);
    }
  }
}
