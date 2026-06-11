import { sendProactive } from "../services/messaging/index.ts";
import type { DenialCacheEntry } from "./denial-cache.ts";
import type { NotifyContext } from "./types.ts";

function proactiveTarget(ctx: NotifyContext) {
  return ctx.isDirect
    ? { userId: ctx.senderId }
    : { openConversationId: ctx.conversationId };
}

export async function sendProactiveMarkdown(
  ctx: NotifyContext,
  text: string,
  title?: string,
): Promise<void> {
  try {
    await sendProactive(ctx.config, proactiveTarget(ctx), text, {
      msgType: "markdown",
      title,
      useAICard: false,
      fallbackToNormal: true,
      atUserIds: ctx.isDirect ? undefined : [ctx.senderId],
      log: ctx.log,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.log?.warn?.(`[DingTalk][dws-oauth] proactive send failed: ${msg}`);
  }
}

export async function pushBlockedMessage(
  ctx: NotifyContext,
  entry: Pick<DenialCacheEntry, "denialReason" | "message">,
): Promise<void> {
  if (entry.denialReason === "user_not_allowed") {
    const text = [
      "您的钉钉账号已完成验证，但组织 **未将您加入 CLI 授权人员名单**，无法继续操作。",
      "",
      `- 账号：\`${ctx.senderId}\``,
      "- 请联系管理员在「开发者设置」中加入 CLI 授权名单",
      "- 添加完成后请回复「已加名单请重试」",
    ].join("\n");
    await sendProactiveMarkdown(ctx, text, "CLI 授权");
    return;
  }

  const stderrSummary = entry.message.trim() || "登录被拒绝，请联系管理员处理。";
  await sendProactiveMarkdown(
    ctx,
    `${stderrSummary}\n\n如需重试，请回复「已加名单请重试」或联系管理员处理后重新发送需求。`,
    "CLI 授权",
  );
}

export async function pushExpiredMessage(ctx: NotifyContext): Promise<void> {
  const text = [
    "上一次钉钉授权已超时（授权码约 15 分钟内有效）。",
    "",
    "请重新发送您的需求以获取新的授权链接。",
  ].join("\n");
  await sendProactiveMarkdown(ctx, text, "授权超时");
}

export async function pushAuthLinkMessage(params: {
  config: NotifyContext["config"];
  isDirect: boolean;
  conversationId: string;
  senderId: string;
  verificationUrl: string;
  userCode?: string;
  log?: NotifyContext["log"];
}): Promise<void> {
  const { config, isDirect, conversationId, senderId, verificationUrl, userCode, log } = params;
  const codeLine = userCode ? `\n授权码：\`${userCode}\`（15 分钟内有效）` : "";
  const text = [
    "需要您本人完成钉钉授权后才能继续。",
    codeLine,
    "",
    verificationUrl,
    "",
    "请使用 **本人** 钉钉扫码。完成后直接发送您的原问题即可。",
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n");

  const target = isDirect ? { userId: senderId } : { openConversationId: conversationId };

  try {
    await sendProactive(config, target, text, {
      msgType: "markdown",
      title: "钉钉授权",
      useAICard: false,
      fallbackToNormal: true,
      atUserIds: isDirect ? undefined : [senderId],
      log,
    });
    log?.info?.(`[DingTalk][dws-oauth] pushed auth link to senderId=${senderId}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.warn?.(`[DingTalk][dws-oauth] failed to push auth link: ${msg}`);
  }
}

export async function pushMismatchMessage(ctx: NotifyContext): Promise<void> {
  await sendProactiveMarkdown(
    ctx,
    "授权失败：扫码账号与当前钉钉用户不一致。请**本人**使用钉钉扫码，勿转发授权链接给他人。",
    "授权失败",
  );
}

export async function pushLoginSuccessMessage(ctx: NotifyContext): Promise<void> {
  await sendProactiveMarkdown(
    ctx,
    "钉钉授权成功。请重新发送您的需求以继续处理。",
    "授权成功",
  );
}
