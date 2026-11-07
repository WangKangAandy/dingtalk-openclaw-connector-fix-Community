/**
 * 钉钉消息业务处理器
 * 
 * 职责：
 * - 处理钉钉消息的业务逻辑
 * - 支持多种消息类型：text、richText、picture、audio、video、file
 * - 媒体文件下载和上传（图片、语音、视频、文件）
 * - 会话上下文构建和管理
 * - 消息分发（AI Card、命令处理、主动消息）
 * - Policy 检查（DM 白名单、群聊策略）
 * 
 * 核心功能：
 * - 消息内容提取和归一化
 * - 媒体文件本地缓存管理
 * - 钉钉 API 调用（accessToken、文件下载）
 * - 与 OpenClaw 框架集成（bindings、runtime）
 */
// 类型定义
interface ClawdbotConfig {
  [key: string]: any;
}

interface RuntimeEnv {
  log?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  debug?: (...args: any[]) => void;
  info?: (...args: any[]) => void;
  [key: string]: any;
}

interface HistoryEntry {
  role: string;
  content: string;
  [key: string]: any;
}
import type { ResolvedDingtalkAccount, DingtalkConfig } from "../types/index.ts";
import { 
  buildSessionContext,
  getAccessToken,
  getOapiAccessToken,
  DINGTALK_API,
  DINGTALK_OAPI,
  addEmotionReply,
  recallEmotionReply,
} from "../utils/utils-legacy.ts";
import { resolveAgentWorkspaceDir } from "../utils/agent.ts";
import { extractQuotedMsgText } from "../utils/quote-message.ts";
import { rememberQuoteBody, type QuoteScope } from "../utils/quote-body-store.ts";
import { currentMessageText, extractForwardedContext, renderForwardedContext } from "../messages/inbound-context.ts";
import { markTurnExecution, markTurnUncertain, withDeliveryPurpose, runTrackedTurn } from "../turn-state/runtime.ts";
import { isAbortRequestText, isBtwRequestText } from 'openclaw/plugin-sdk/reply-runtime';
import { abortConversationRuns, withConversationRun, bindConversationCallbacks, QUESTION_PAUSE_REASON, interruptedExecution } from './conversation-run.ts';
import { dispatchDingtalkBtw } from './btw-dispatch.ts';
import { createHostTurnLifecycle } from './host-turn-lifecycle.ts';
import { withDingtalkQuestionContext, invalidatePendingQuestionsForScope } from '../questions/index.ts';
import { beginQuestionTurn, isCurrentQuestionTurn, questionTurnScope } from '../questions/turns.ts';
import { QUESTION_BINDING } from '../questions/context.ts';
import { resolveDingtalkAccount } from '../config/accounts.ts';
import { 
  processLocalImages, 
  processVideoMarkers, 
  processAudioMarkers, 
  uploadAndReplaceFileMarkers
} from "../services/media/index.ts";
import { sendProactive, type AICardTarget } from "../services/messaging/index.ts";
import { finishAICard, type AICardInstance } from "../services/messaging/card.ts";
import {
  applyWebhookTextAt,
  resolveGroupMention,
} from "../utils/group-mention.ts";
import { createDingtalkReplyDispatcher } from "../reply-dispatcher.ts";
import { withOutboundMediaPolicy } from "../services/media/outbound-policy.ts";
import { normalizeSlashCommand } from "../utils/session.ts";
import { resolveScopedLearnCommand } from "../memory-scope/scoped-workshop/learn-command.ts";
import { getDingtalkRuntime } from "../runtime.ts";
import { getHardScopeRuntime, hardScopeEnabled } from "../memory-scope/hard-runtime.ts";
import { runtimeToolsEnabled, scopeContextSelected } from "../memory-scope/scope-policy.js";
import { resolveInboundScope } from "../memory-scope/inbound.ts";
import { dingtalkHttp } from '../utils/http-client.ts';
import { createLoggerFromConfig } from '../utils/index.ts';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============ 类型定义 ============

export type DingtalkReactionCreatedEvent = {
  type: "reaction_created";
  channelId: string;
  messageId: string;
  userId: string;
  emoji: string;
};

export type MonitorDingtalkAccountOpts = {
  cfg: ClawdbotConfig;
  account: ResolvedDingtalkAccount;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
};

// ============ Agent 路由解析 ============
// SDK 会自动处理 bindings 解析，无需手动实现

// ============ 消息内容提取 ============

interface ExtractedMessage {
  text: string;
  messageType: string;
  imageUrls: string[];
  downloadCodes: string[];
  fileNames: string[];
  atDingtalkIds: string[];
  atMobiles: string[];
  /** interactiveCard 消息中提取的文档链接（biz_custom_action_url），用于下游 URL 路由 */
  interactiveCardUrl?: string;
  /** actionCard 消息中提取的操作链接（单个时直接存储），用于下游 URL 路由 */
  actionCardUrl?: string;
}

/**
 * 解析 data.content 字段：可能是对象，也可能是 JSON 字符串（钉钉部分 API 版本会将 content 序列化为字符串）。
 * 返回解析后的对象，或 null（字段不存在 / 无法解析）。
 */
function resolveContent(data: any): any | null {
  const raw = data?.content;
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // 非 JSON 字符串，忽略
    }
  }
  return null;
}

/**
 * 从 richText 列表中提取媒体附件（图片 downloadCode）。
 * 兼容新结构（content.richText）和旧结构（richText.richTextList）。
 */
function extractRichTextMediaAttachments(
  data: any,
  content: any,
): { imageUrls: string[]; downloadCodes: string[]; fileNames: string[] } {
  const imageUrls: string[] = [];
  const downloadCodes: string[] = [];
  const fileNames: string[] = [];

  // 兼容新结构 content.richText 和旧结构 richText.richTextList
  const richList: any[] =
    content?.richText ||
    data?.richText?.richTextList ||
    [];

  for (const item of richList) {
    if (item.pictureUrl) {
      imageUrls.push(item.pictureUrl);
    }
    if (item.downloadCode) {
      const itemType: string = item.type || '';
      if (itemType === 'picture' || !itemType) {
        imageUrls.push(`downloadCode:${item.downloadCode}`);
      } else if (itemType === 'video') {
        downloadCodes.push(item.downloadCode);
        fileNames.push(item.fileName || 'video.mp4');
      } else if (itemType === 'audio') {
        downloadCodes.push(item.downloadCode);
        fileNames.push(item.fileName || 'audio.amr');
      } else if (itemType === 'file') {
        downloadCodes.push(item.downloadCode);
        fileNames.push(item.fileName || '文件');
      }
    }
  }

  return { imageUrls, downloadCodes, fileNames };
}

/**
 * 从 repliedMsg 中提取媒体附件（用于 reply 类型消息）。
 */
function extractRepliedMsgMediaAttachments(
  repliedMsg: any,
): { imageUrls: string[]; downloadCodes: string[]; fileNames: string[] } {
  const imageUrls: string[] = [];
  const downloadCodes: string[] = [];
  const fileNames: string[] = [];

  if (!repliedMsg) return { imageUrls, downloadCodes, fileNames };

  const msgType = repliedMsg.msgType || 'text';

  let contentObj: any = null;
  const rawContent = repliedMsg.content;
  if (rawContent && typeof rawContent === 'object') {
    contentObj = rawContent;
  } else if (typeof rawContent === 'string') {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === 'object') contentObj = parsed;
    } catch {
      // 忽略
    }
  }

  switch (msgType) {
    case 'picture':
    case 'video':
    case 'audio': {
      const code = contentObj?.downloadCode;
      if (code) {
        if (msgType === 'picture') {
          imageUrls.push(`downloadCode:${code}`);
        } else {
          downloadCodes.push(code);
          fileNames.push(contentObj?.fileName || (msgType === 'video' ? 'video.mp4' : 'audio.amr'));
        }
      }
      break;
    }
    case 'file': {
      const code = contentObj?.downloadCode;
      if (code) {
        downloadCodes.push(code);
        fileNames.push(contentObj?.fileName || '文件');
      }
      break;
    }
    case 'richText': {
      const richList: any[] = contentObj?.richText || [];
      for (const item of richList) {
        if (item.downloadCode) {
          imageUrls.push(`downloadCode:${item.downloadCode}`);
        }
      }
      break;
    }
    default:
      break;
  }

  return { imageUrls, downloadCodes, fileNames };
}

export function extractMessageContent(data: any, quoteScope?: QuoteScope): ExtractedMessage {
  const msgtype = data.msgtype || 'text';
  const forwarded = extractForwardedContext(data);
  if (forwarded) {
    return {
      text: renderForwardedContext(forwarded), messageType: 'chatRecord',
      imageUrls: forwarded.media.filter(m => m.kind === 'picture').map(m => `downloadCode:${m.downloadCode}`),
      downloadCodes: forwarded.media.filter(m => m.kind !== 'picture').map(m => m.downloadCode),
      fileNames: forwarded.media.filter(m => m.kind !== 'picture').map(m => m.fileName || `forwarded.${m.kind === 'audio' ? 'amr' : m.kind === 'video' ? 'mp4' : 'bin'}`),
      atDingtalkIds: [], atMobiles: [],
    };
  }
  switch (msgtype) {
    case 'text': {
      const atDingtalkIds = data.text?.at?.atDingtalkIds || [];
      const atMobiles = data.text?.at?.atMobiles || [];

      const bodyText = data.text?.content?.trim() || '';

      // 检测引用消息（isReplyMsg + repliedMsg 在 data.text 对象内）
      const hasReply = !!data.text?.isReplyMsg;
      const quotedText = extractQuotedMsgText(data.text, 3, data, quoteScope);
      const text = quotedText ? `${bodyText}\n${quotedText}` : bodyText;

      // 提取引用消息中的媒体附件（图片/视频/音频/文件）
      const repliedMsgInText = data.text?.repliedMsg;
      const { imageUrls, downloadCodes, fileNames } = extractRepliedMsgMediaAttachments(repliedMsgInText);

      // 从引用消息的文本内容中提取 URL，触发链接路由（如 alidocs 文档链接）
      // 场景：用户引用了一条含链接的文本消息，并追问"这个文档内容是什么"
      let interactiveCardUrl: string | undefined;
      if (hasReply && repliedMsgInText) {
        const repliedContentObj = typeof repliedMsgInText.content === 'object'
          ? repliedMsgInText.content
          : (() => { try { return JSON.parse(repliedMsgInText.content); } catch { return null; } })();
        const repliedText = repliedContentObj?.text || repliedMsgInText.text || '';
        const extractedUrl = extractFirstUrlFromText(repliedText);
        if (extractedUrl) {
          interactiveCardUrl = extractedUrl;
        }
      }

      return {
        text,
        messageType: hasReply ? 'reply' : 'text',
        imageUrls,
        downloadCodes,
        fileNames,
        atDingtalkIds,
        atMobiles,
        interactiveCardUrl,
      };
    }
    case 'richText': {
      // 兼容 content 为 JSON 字符串的情况
      const content = resolveContent(data);
      const textParts: string[] = [];

      // 兼容新结构 content.richText 和旧结构 richText.richTextList
      const richList: any[] =
        content?.richText ||
        data?.richText?.richTextList ||
        [];

      for (const item of richList) {
        const isSkillItem = item.type === 'skill' || !!item.skillData;

        if (item.text && !isSkillItem) {
          textParts.push(item.text);
        }

        if (isSkillItem && item.skillData) {
          // 将 skillData 转换为 <skill> 标签，供下游识别斜杠命令
          const skillId = item.skillData.skillId || '';
          const displayName = item.skillData.displayName || '';
          const iconUrl = item.skillData.iconUrl || '';
          const skillTag = iconUrl
            ? `<skill data-id="${skillId}" data-name="${displayName}" icon="${iconUrl}">`
            : `<skill data-id="${skillId}" data-name="${displayName}">`;
          textParts.push(skillTag);
        }

        if (item.pictureUrl) {
          // pictureUrl 在 imageUrls 里处理，文本部分不需要占位
        }
      }

      // 检测引用消息（isReplyMsg + repliedMsg 在 content 对象内）
      const hasReply = !!content?.isReplyMsg;
      const quotedText = extractQuotedMsgText(content, 3, data, quoteScope);
      if (quotedText) textParts.push(quotedText);

      const richTextMedia = extractRichTextMediaAttachments(data, content);

      // 同时提取引用消息中的媒体附件（richText 引用图片场景）
      const repliedMsgInRichText = content?.repliedMsg;
      const repliedMedia = extractRepliedMsgMediaAttachments(repliedMsgInRichText);

      const imageUrls = [...richTextMedia.imageUrls, ...repliedMedia.imageUrls];
      const downloadCodes = [...richTextMedia.downloadCodes, ...repliedMedia.downloadCodes];
      const fileNames = [...richTextMedia.fileNames, ...repliedMedia.fileNames];

      const text =
        textParts.join('') ||
        (imageUrls.length > 0 ? '[图片]' : downloadCodes.length > 0 ? '[媒体文件]' : '[富文本消息]');

      return {
        text,
        messageType: hasReply ? 'reply' : 'richText',
        imageUrls,
        downloadCodes,
        fileNames,
        atDingtalkIds: [],
        atMobiles: [],
      };
    }
    case 'picture': {
      const content = resolveContent(data);
      const downloadCode = content?.downloadCode || '';
      const pictureUrl = content?.pictureUrl || '';
      const imageUrls: string[] = [];
      const downloadCodes: string[] = [];

      if (pictureUrl) {
        imageUrls.push(pictureUrl);
      }
      if (downloadCode) {
        downloadCodes.push(downloadCode);
      }

      return { text: '[图片]', messageType: 'picture', imageUrls, downloadCodes, fileNames: [], atDingtalkIds: [], atMobiles: [] };
    }
    case 'audio': {
      const content = resolveContent(data);
      // 兼容旧结构 /audio/recognition
      const recognition =
        content?.recognition ||
        data?.audio?.recognition ||
        '[语音消息]';
      const audioDownloadCode = content?.downloadCode || '';
      const audioFileName = content?.fileName || 'audio.amr';
      const downloadCodes: string[] = [];
      const fileNames: string[] = [];
      if (audioDownloadCode) {
        downloadCodes.push(audioDownloadCode);
        fileNames.push(audioFileName);
      }
      return {
        text: recognition,
        messageType: 'audio',
        imageUrls: [],
        downloadCodes,
        fileNames,
        atDingtalkIds: [],
        atMobiles: [],
      };
    }
    case 'video': {
      const content = resolveContent(data);
      const videoDownloadCode = content?.downloadCode || '';
      const videoFileName = content?.fileName || 'video.mp4';
      const downloadCodes: string[] = [];
      const fileNames: string[] = [];
      if (videoDownloadCode) {
        downloadCodes.push(videoDownloadCode);
        fileNames.push(videoFileName);
      }
      return {
        text: '[视频]',
        messageType: 'video',
        imageUrls: [],
        downloadCodes,
        fileNames,
        atDingtalkIds: [],
        atMobiles: [],
      };
    }
    case 'file': {
      const content = resolveContent(data);
      // 兼容旧结构 /file/fileName
      const fileName = content?.fileName || data?.file?.fileName || '文件';
      const downloadCode = content?.downloadCode || '';
      const downloadCodes: string[] = [];
      const fileNames: string[] = [];
      if (downloadCode) {
        downloadCodes.push(downloadCode);
        fileNames.push(fileName);
      }
      return { text: `[文件: ${fileName}]`, messageType: 'file', imageUrls: [], downloadCodes, fileNames, atDingtalkIds: [], atMobiles: [] };
    }
    case 'markdown': {
      // 钉钉 markdown 消息内容在 data.text.content（与 text 类型一致），不在 data.content
      const text = data.text?.content?.trim() || resolveContent(data)?.text?.trim() || '[markdown消息]';
      return { text, messageType: 'markdown', imageUrls: [], downloadCodes: [], fileNames: [], atDingtalkIds: [], atMobiles: [] };
    }
    case 'actionCard': {
      const content = resolveContent(data);
      const title = content?.title?.trim() || '';
      const body = content?.text?.trim() || '';
      // 提取操作链接列表
      const actionUrlItems: any[] = content?.actionUrlItemList || [];
      const actionUrls = actionUrlItems
        .map((item: any) => item.actionUrl?.trim())
        .filter((url: string) => !!url);

      const sections: string[] = [];
      if (title) sections.push(title);
      if (body) sections.push(body);
      if (actionUrls.length > 0) {
        const linkSection =
          actionUrls.length === 1
            ? `操作链接：${actionUrls[0]}`
            : `操作链接：\n- ${actionUrls.join('\n- ')}`;
        sections.push(linkSection);
      }

      const text = sections.length > 0 ? sections.join('\n\n') : '[actionCard消息]';
      // 单个操作链接时作为 actionCardUrl 传给下游做 URL 路由
      const actionCardUrl = actionUrls.length === 1 ? actionUrls[0] : undefined;
      return { text, messageType: 'actionCard', imageUrls: [], downloadCodes: [], fileNames: [], atDingtalkIds: [], atMobiles: [], actionCardUrl };
    }
    case 'interactiveCard': {
      // 交互式卡片消息（通常是文档分享）
      const content = resolveContent(data);
      // 兼容 content 字段不存在时直接从顶层取（repliedMsg 透传场景）
      const interactiveCardUrl =
        (content?.biz_custom_action_url || data?.biz_custom_action_url || '').trim() || undefined;
      if (interactiveCardUrl) {
        const text = `收到交互式卡片链接：${interactiveCardUrl}`;
        return { text, messageType: 'interactiveCard', imageUrls: [], downloadCodes: [], fileNames: [], atDingtalkIds: [], atMobiles: [], interactiveCardUrl };
      }
      return { text: '[interactiveCard消息]', messageType: 'interactiveCard', imageUrls: [], downloadCodes: [], fileNames: [], atDingtalkIds: [], atMobiles: [] };
    }
    case 'reply': {
      // 显式 reply 类型（部分钉钉版本直接发 msgtype=reply）
      // 优先从 data.text 取引用容器，取不到再从 content 取
      const replyContainer = data.text || resolveContent(data);
      const bodyText = data.text?.content?.trim() || '';
      const quotedText = extractQuotedMsgText(replyContainer, 3, data, quoteScope);
      const text = quotedText ? `${bodyText}\n${quotedText}` : bodyText || '[引用消息]';

      // 提取引用中的媒体附件
      const repliedMsg = data.text?.repliedMsg || resolveContent(data)?.repliedMsg;
      const { imageUrls, downloadCodes, fileNames } = extractRepliedMsgMediaAttachments(repliedMsg);

      return { text, messageType: 'reply', imageUrls, downloadCodes, fileNames, atDingtalkIds: [], atMobiles: [] };
    }
    default:
      return {
        text: data.text?.content?.trim() || `[${msgtype}消息]`,
        messageType: msgtype,
        imageUrls: [],
        downloadCodes: [],
        fileNames: [],
        atDingtalkIds: [],
        atMobiles: [],
      };
  }
}

// ============ 卡片链接路由 system prompt ============

/**
 * 从文本内容中提取第一个 HTTP/HTTPS URL。
 * 用于处理引用消息文本里直接粘贴链接的场景（如引用一条含 alidocs 链接的文本消息）。
 */
function extractFirstUrlFromText(text: string): string | null {
  const urlMatch = text.match(/https?:\/\/[^\s\u3000\u3001\uff0c\u3002\uff01\uff1f"'<>]+/);
  return urlMatch ? urlMatch[0].trim() : null;
}

/**
 * 从正文/富文本拼接串中提取首个钉钉文档（alidocs）链接。
 * 典型场景：群聊里用户直接粘贴 alidocs URL，无 interactiveCard / 无结构化 repliedMsg。
 */
function extractFirstAlidocsUrlFromText(text: string): string | null {
  if (!text || !text.includes('alidocs.dingtalk.com')) return null;
  const re = /https?:\/\/[^\s\u3000\u3001\uff0c\u3002\uff01\uff1f"'<>]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const candidate = m[0].trim();
    try {
      const u = new URL(candidate);
      if (u.hostname !== 'alidocs.dingtalk.com') continue;
      const path = u.pathname;
      if (path === '/...' || /^\/\.{3}$/.test(path)) continue;
      return candidate;
    } catch {
      // ignore malformed URL
    }
  }
  return null;
}

/**
 * 根据消息中的 interactiveCardUrl / actionCardUrl / 正文中的 alidocs 链接构建链接路由 system prompt。
 * 对齐 Rust agent_support.rs 的 build_link_routing_prompt 逻辑，并扩展「纯文本 URL」以避免误用 web_fetch：
 * - alidocs.dingtalk.com → 使用当前发言人的受控 DWS doc 工具读取
 * - 其他 URL → 使用 read_url 读取
 * 返回 null 表示无需注入额外 prompt。
 *
 * @param plainTextHaystack 附件/文件解析等合并进 userContent 后的全文。
 */
function buildLinkRoutingPrompt(content: ExtractedMessage, plainTextHaystack?: string): string | null {
  const interactiveCardUrl = content.interactiveCardUrl?.trim();
  const actionCardUrl = content.actionCardUrl?.trim();
  const mergedPlain = [content.text || '', plainTextHaystack || ''].filter(Boolean).join('\n');
  const fromPlainText = extractFirstAlidocsUrlFromText(mergedPlain);

  const linkUrl = interactiveCardUrl || actionCardUrl || fromPlainText;
  if (!linkUrl) return null;

  const fromStructuredCard = Boolean(interactiveCardUrl || actionCardUrl);
  const cardKind = interactiveCardUrl
    ? 'interactive card'
    : actionCardUrl
      ? 'action card'
      : 'message text';

  let host: string | null = null;
  try {
    host = new URL(linkUrl).hostname;
  } catch {
    // URL 解析失败，当作普通链接处理
  }

  if (host === 'alidocs.dingtalk.com') {
    const lead = fromStructuredCard
      ? `The inbound DingTalk message is an ${cardKind} with a document link.`
      : `The inbound DingTalk message includes an alidocs.dingtalk.com URL in the message text (pasted link, @mention line, or rich text).`;
    return [
      lead,
      `Linked URL: ${linkUrl}`,
      `This URL is hosted on \`alidocs.dingtalk.com\`.`,
      `Use \`dingtalk_dws\` with its \`doc\` product capability. Pass CLI arguments without the dws executable or a profile; the host binds the current sender.`,
      `If that tool is unavailable or authorization fails, explain the access failure. Do not run shell dws or use a default profile.`,
      `Never switch to browser-based reading for this link. Browser incompatibility or markdown export limitations are not final answers.`,
      `Do not use \`read_url\` or \`web_fetch\` for this link (unauthenticated HTTP will hit the DingTalk login redirect).`,
      `Reply to the DingTalk user with a concise summary of the linked document content.`,
    ].join('\n');
  }

  const lead = fromStructuredCard
    ? `The inbound DingTalk message is an ${cardKind} with a link.`
    : `The inbound DingTalk message includes a URL in the message text.`;
  return [
    lead,
    `Linked URL: ${linkUrl}`,
    `For this URL, you MUST use \`read_url\` to inspect the linked content before answering.`,
    `Do not use DingTalk business tools for this link.`,
    `Reply to the DingTalk user with a concise summary of the linked content.`,
  ].join('\n');
}

// ============ 图片下载 ============

export async function downloadImageToFile(
  downloadUrl: string,
  _agentWorkspaceDir: string,
  log?: any,
): Promise<string | null> {
  try {
    log?.info?.(`开始下载图片: ${downloadUrl.slice(0, 100)}...`);
    const resp = await dingtalkHttp.get(downloadUrl, {
      proxy: false, // 禁用代理，避免 PAC 文件影响

      headers: {
        'Content-Type': undefined, // 删除默认的 Content-Type 请求头，让 OSS 签名验证通过
      },
      responseType: 'arraybuffer',
      timeout: 30_000,
    });

    const buffer = Buffer.from(resp.data);
    const contentType = resp.headers['content-type'] || 'image/jpeg';
    const ext = contentType.includes('png') ? '.png' : contentType.includes('gif') ? '.gif' : contentType.includes('webp') ? '.webp' : '.jpg';
    const mediaDir = path.join(os.homedir(), '.openclaw', 'media', 'inbound');
    fs.mkdirSync(mediaDir, { recursive: true });
    const tmpFile = path.join(mediaDir, `openclaw-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    fs.writeFileSync(tmpFile, buffer);

    log?.info?.(`图片下载成功: size=${buffer.length} bytes, type=${contentType}, path=${tmpFile}`);
    return tmpFile;
  } catch (err: any) {
    log?.error?.(`图片下载失败: ${err.message}`);
    return null;
  }
}

export async function downloadMediaByCode(
  downloadCode: string,
  config: DingtalkConfig,
  agentWorkspaceDir: string,
  log?: any,
): Promise<string | null> {
  try {
    const token = await getAccessToken(config);
    log?.info?.(`通过 downloadCode 下载媒体: ${downloadCode.slice(0, 30)}...`);

    const resp = await dingtalkHttp.post(
      `${DINGTALK_API}/v1.0/robot/messageFiles/download`,
      { downloadCode, robotCode: String(config.clientId) },
      {
        headers: { 'x-acs-dingtalk-access-token': token, 'Content-Type': 'application/json' },
        timeout: 30_000,
      },
    );

    const downloadUrl = resp.data?.downloadUrl;
    if (!downloadUrl) {
      log?.warn?.(`downloadCode 换取 downloadUrl 失败: ${JSON.stringify(resp.data)}`);
      return null;
    }

    return downloadImageToFile(downloadUrl, agentWorkspaceDir, log);
  } catch (err: any) {
    log?.error?.(`downloadCode 下载失败: ${err.message}`);
    return null;
  }
}

export async function getFileDownloadUrl(
  downloadCode: string,
  fileName: string,
  config: DingtalkConfig,
  log?: any,
): Promise<string | null> {
  try {
    const token = await getAccessToken(config);
    log?.info?.(`获取文件下载链接: ${fileName}`);

    const resp = await dingtalkHttp.post(
      `${DINGTALK_API}/v1.0/robot/messageFiles/download`,
      { downloadCode, robotCode: String(config.clientId) },
      {
        headers: { 'x-acs-dingtalk-access-token': token, 'Content-Type': 'application/json' },
        timeout: 30_000,
      },
    );

    const downloadUrl = resp.data?.downloadUrl;
    if (!downloadUrl) {
      log?.warn?.(`downloadCode 换取 downloadUrl 失败: ${JSON.stringify(resp.data)}`);
      return null;
    }

    log?.info?.(`获取下载链接成功: ${fileName}`);
    return downloadUrl;
  } catch (err: any) {
    log?.error?.(`获取下载链接失败: ${err.message}`);
    return null;
  }
}

// ============ 文件下载和解析 ============

/**
 * 下载文件到本地
 */
export async function downloadFileToLocal(
  downloadUrl: string,
  fileName: string,
  _agentWorkspaceDir: string,
  log?: any,
): Promise<string | null> {
  try {
    log?.info?.(`开始下载文件: ${fileName}`);
    const resp = await dingtalkHttp.get(downloadUrl, {
      proxy: false, // 禁用代理，避免 PAC 文件影响
      headers: {
        'Content-Type': undefined, // 删除默认的 Content-Type 请求头，让 OSS 签名验证通过
      },
      responseType: 'arraybuffer',
      timeout: 60_000, // 文件可能较大，增加超时时间
    });

    const buffer = Buffer.from(resp.data);
    const mediaDir = path.join(os.homedir(), '.openclaw', 'media', 'inbound');
    fs.mkdirSync(mediaDir, { recursive: true });
    
    // 安全过滤文件名
    const sanitizeFileName = (name: string): string => {
      // 移除路径分隔符，防止目录遍历攻击
      let safe = name.replace(/[/\\]/g, '_');
      // 移除或替换危险字符
      safe = safe.replace(/[<>:"|?*\x00-\x1f]/g, '_');
      // 移除开头的点，防止隐藏文件
      safe = safe.replace(/^\.+/, '');
      // 限制长度
      if (safe.length > 200) {
        const ext = path.extname(safe);
        const base = path.basename(safe, ext);
        safe = base.substring(0, 200 - ext.length) + ext;
      }
      // 如果处理后为空，使用默认名称
      if (!safe) {
        safe = 'unnamed_file';
      }
      return safe;
    };
    
    // 保留原始文件名，但添加时间戳避免冲突
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    const timestamp = Date.now();
    const safeBaseName = sanitizeFileName(baseName);
    const safeFileName = `${safeBaseName}-${timestamp}${ext}`;
    const localPath = path.join(mediaDir, safeFileName);
    
    fs.writeFileSync(localPath, buffer);
    log?.info?.(`文件下载成功: ${fileName}, size=${buffer.length} bytes, path=${localPath}`);
    return localPath;
  } catch (err: any) {
    log?.error?.(`downloadFileToLocal 异常: ${err.message}\n${err.stack}`);
    return null;
  }
}

/**
 * 解析 Word 文档 (.docx)
 */
async function parseDocxFile(filePath: string, log?: any): Promise<string | null> {
  try {
    log?.info?.(`开始解析 Word 文档: ${filePath}`);

    let mammoth: any;
    try {
      mammoth = (await import('mammoth')).default;
    } catch {
      log?.warn?.('mammoth 库未安装，无法解析 .docx 文件。请运行: npm install mammoth');
      return null;
    }

    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    
    if (text) {
      log?.info?.(`Word 文档解析成功: ${filePath}, 文本长度=${text.length}`);
      return text;
    } else {
      log?.warn?.(`Word 文档解析结果为空: ${filePath}`);
      return null;
    }
  } catch (err: any) {
    log?.error?.(`Word 文档解析失败: ${filePath}, error=${err.message}`);
    return null;
  }
}

/**
 * 解析 PDF 文档
 */
async function parsePdfFile(filePath: string, log?: any): Promise<string | null> {
  try {
    log?.info?.(`开始解析 PDF 文档: ${filePath}`);

    let pdfParseV1: any;
    let pdfParseV2: any;
    try {
      const mod = await import('pdf-parse');
      if (mod.PDFParse) {
        pdfParseV2 = mod.PDFParse; // v2.x API
      } else if (mod.default) {
        pdfParseV1 = mod.default; // v1.x API
      } else {
        throw new Error('pdf-parse module format not recognized');
      }
    } catch {
      log?.warn?.('pdf-parse 库未安装，无法解析 .pdf 文件。请运行: npm install pdf-parse');
      return null;
    }

    const buffer = fs.readFileSync(filePath);
    let text: string;
    let numPages: number | undefined;

    if (pdfParseV2) {
      const parser = new pdfParseV2({ data: buffer });
      const result = await parser.getText();
      text = (result.text ?? '').trim();
      numPages = result.total;
      parser.destroy?.();
    } else {
      const data = await pdfParseV1(buffer);
      text = (data.text ?? '').trim();
      numPages = data.numpages;
    }

    if (text) {
      log?.info?.(`PDF 文档解析成功: ${filePath}, 文本长度=${text.length}, 页数=${numPages}`);
      return text;
    } else {
      log?.warn?.(`PDF 文档解析结果为空: ${filePath}`);
      return null;
    }
  } catch (err: any) {
    log?.error?.(`PDF 文档解析失败: ${filePath}, error=${err.message}`);
    return null;
  }
}

/**
 * 读取纯文本文件
 */
async function readTextFile(filePath: string, log?: any): Promise<string | null> {
  try {
    log?.info?.(`开始读取文本文件: ${filePath}`);
    const text = fs.readFileSync(filePath, 'utf-8').trim();
    
    if (text) {
      log?.info?.(`文本文件读取成功: ${filePath}, 文本长度=${text.length}`);
      return text;
    } else {
      log?.warn?.(`文本文件内容为空: ${filePath}`);
      return null;
    }
  } catch (err: any) {
    log?.error?.(`文本文件读取失败: ${filePath}, error=${err.message}`);
    return null;
  }
}

/**
 * 根据文件类型解析文件内容
 */
async function parseFileContent(
  filePath: string,
  fileName: string,
  log?: any,
): Promise<{ content: string | null; type: 'text' | 'binary' }> {
  const ext = path.extname(fileName).toLowerCase();
  
  // Word 文档
  if (['.docx', '.doc'].includes(ext)) {
    const content = await parseDocxFile(filePath, log);
    return { content, type: 'text' };
  }
  
  // PDF 文档
  if (ext === '.pdf') {
    const content = await parsePdfFile(filePath, log);
    return { content, type: 'text' };
  }
  
  // 纯文本文件
  if (['.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.csv', '.log', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.sh', '.bat'].includes(ext)) {
    const content = await readTextFile(filePath, log);
    return { content, type: 'text' };
  }
  
  // 二进制文件（不解析）
  return { content: null, type: 'binary' };
}

// ============ 消息处理 ============

interface HandleMessageParams {
  accountId: string;
  config: DingtalkConfig;
  data: any;
  sessionWebhook: string;
  runtime?: RuntimeEnv;
  log?: any;
  cfg: ClawdbotConfig;
  /** 队列繁忙时预先创建的 AI Card，处理时直接复用而非新建，实现"占位→更新"效果 */
  preCreatedCard?: AICardInstance;
  /** 队列繁忙时已在入队阶段提前贴上了思考中表情，内部处理时跳过重复贴表情 */
  emotionAlreadyAdded?: boolean;
  /** Internal resume contract, never populated from a card callback's target fields. */
  questionResume?: { agentId: string; sessionKey: string; assertCurrent: () => void; onAdmitted: () => void };
}

/**
 * 内部消息处理函数（实际执行消息处理逻辑）
 */
export async function handleDingTalkMessageInternal(params: HandleMessageParams): Promise<void> {
  // Media delivery is an independent channel policy, not a memory side effect.
  return withOutboundMediaPolicy(params.config.blockAutomaticMedia === true, () => processDingTalkMessageInternal(params));
}

async function processDingTalkMessageInternal(params: HandleMessageParams): Promise<void> {
  const { accountId, config, data, sessionWebhook, runtime, cfg } = params;

  const log = createLoggerFromConfig(config, `DingTalk:${accountId}`);

  const content = extractMessageContent(data);
  if (!content.text && content.imageUrls.length === 0 && content.downloadCodes.length === 0) return;

  const isDirect = data.conversationType === '1';
  const senderId = data.senderStaffId || data.senderId;
  const senderName = data.senderNick || 'Unknown';
  const groupMention = resolveGroupMention({
    isDirect,
    senderStaffId: data.senderStaffId,
    senderNick: data.senderNick,
  });


  // ===== DM Policy 检查 =====
  if (isDirect) {
    const dmPolicy = config.dmPolicy || 'open';
    const allowFrom: (string | number)[] = config.allowFrom || [];
    
    // 处理 pairing 策略（暂不支持，当作 open 处理并记录警告）
    if (dmPolicy === 'pairing') {
      log?.warn?.(`dmPolicy="pairing" 暂不支持，将按 "open" 策略处理`);
      // 继续执行，不拦截
    }
    
    // 处理 allowlist 策略
    if (dmPolicy === 'allowlist') {
      if (!senderId) {
        log?.warn?.(`DM 被拦截: senderId 为空`);
        return;
      }
      
      // 规范化 senderId 和 allowFrom 进行比较（支持 string 和 number 类型）
      const normalizedSenderId = String(senderId);
      const normalizedAllowFrom = allowFrom.map(id => String(id));
      
      // 白名单为空时拦截所有（虽然 Schema 验证会阻止这种情况，但代码层面也要防御）
      if (normalizedAllowFrom.length === 0) {
        log?.warn?.(`[DingTalk] DM 被拦截: allowFrom 白名单为空，拒绝所有请求`);
        
        try {
          await withDeliveryPurpose("error_notice", () => sendProactive(config, { userId: senderId }, '抱歉，此机器人的访问白名单配置有误。请联系管理员检查配置。', {
            msgType: 'text',
            useAICard: false,
            fallbackToNormal: true,
            log,
          }));
        } catch (err: any) {
          log?.error?.(`[DingTalk] 发送 DM 配置错误提示失败: ${err.message}`);
        }
        return;
      }
      
      // 检查是否在白名单中
      if (!normalizedAllowFrom.includes(normalizedSenderId)) {
        log?.warn?.(`DM 被拦截: senderId=${senderId} (${senderName}) 不在白名单中`);
        
        try {
          await withDeliveryPurpose("error_notice", () => sendProactive(config, { userId: senderId }, '抱歉，您暂无权限使用此机器人。如需开通权限，请联系管理员。', {
            msgType: 'text',
            useAICard: false,
            fallbackToNormal: true,
            log,
          }));
        } catch (err: any) {
          log?.error?.(`发送 DM 拦截提示失败: ${err.message}`);
        }
        return;
      }
    }
  }

  // ===== 群聊 Policy 检查 =====
  if (!isDirect) {
    const groupPolicy = config.groupPolicy || 'open';
    const conversationId = data.conversationId;
    const groupAllowFrom: (string | number)[] = config.groupAllowFrom || [];

    // 处理 disabled 策略
    if (groupPolicy === 'disabled') {
      log?.warn?.(`群聊被拦截: groupPolicy=disabled`);
      
      try {
        await withDeliveryPurpose("error_notice", () => sendProactive(config, { openConversationId: conversationId }, '抱歉，此机器人暂不支持群聊功能。', {
          msgType: 'text',
          useAICard: false,
          fallbackToNormal: true,
          log,
        }));
      } catch (err: any) {
        log?.error?.(`发送群聊 disabled 提示失败: ${err.message}`);
      }
      return;
    }

    // 处理 allowlist 策略
    if (groupPolicy === 'allowlist') {
      if (!conversationId) {
        log?.warn?.(`群聊被拦截: conversationId 为空`);
        return;
      }
      
      // 规范化 conversationId 和 groupAllowFrom 进行比较（支持 string 和 number 类型）
      const normalizedConversationId = String(conversationId);
      const normalizedGroupAllowFrom = groupAllowFrom.map(id => String(id));
      
      // 白名单为空时拦截所有（虽然 Schema 验证会阻止这种情况，但代码层面也要防御）
      if (normalizedGroupAllowFrom.length === 0) {
        log?.warn?.(`群聊被拦截: groupAllowFrom 白名单为空，拒绝所有请求`);
        
        try {
          await withDeliveryPurpose("error_notice", () => sendProactive(config, { openConversationId: conversationId }, '抱歉，此机器人的群组访问白名单配置有误。请联系管理员检查配置。', {
            msgType: 'text',
            useAICard: false,
            fallbackToNormal: true,
            log,
          }));
        } catch (err: any) {
          log?.error?.(`发送群聊配置错误提示失败: ${err.message}`);
        }
        return;
      }
      
      // 检查是否在白名单中
      if (!normalizedGroupAllowFrom.includes(normalizedConversationId)) {
        log?.warn?.(`群聊被拦截: conversationId=${conversationId} 不在 groupAllowFrom 白名单中`);
        
        try {
          await withDeliveryPurpose("error_notice", () => sendProactive(config, { openConversationId: conversationId }, '抱歉，此群组暂无权限使用此机器人。如需开通权限，请联系管理员。', {
            msgType: 'text',
            useAICard: false,
            fallbackToNormal: true,
            log,
          }));
        } catch (err: any) {
          log?.error?.(`发送群聊 allowlist 提示失败: ${err.message}`);
        }
        return;
      }
    }
  }

  // 构建会话上下文
  const sessionContext = buildSessionContext({
    accountId,
    senderId,
    senderName,
    conversationType: data.conversationType,
    conversationId: data.conversationId,
    groupSubject: data.conversationTitle,
    separateSessionByConversation: config.separateSessionByConversation,
    groupSessionScope: config.groupSessionScope,
    sharedMemoryAcrossConversations: config.sharedMemoryAcrossConversations,
  });

  // ===== 解析 agentId 和工作空间路径（在 sessionContext 之后，确保 chatType 与会话隔离策略一致）=====
  // 使用 sessionContext.peerId 进行匹配（真实的 conversationId/senderId，与 match.peer.id 语义一致）。
  // 注意：不能使用 sessionContext.sessionPeerId，它受 sharedMemoryAcrossConversations 等配置影响，
  // 可能被设为 accountId，导致不同群/用户的消息匹配到同一个 binding，路由错误。
  let matchedAgentId: string | null = null;
  if (cfg.bindings && cfg.bindings.length > 0) {
    for (const binding of cfg.bindings) {
      const match = binding.match;
      if (match.channel && match.channel !== "dingtalk-connector") continue;
      if (match.accountId && match.accountId !== accountId) continue;
      if (match.peer) {
        if (match.peer.kind && match.peer.kind !== sessionContext.chatType) continue;
        if (match.peer.id && match.peer.id !== '*' && match.peer.id !== sessionContext.peerId) continue;
      }
      matchedAgentId = binding.agentId;
      break;
    }
  }
  if (!matchedAgentId) {
    matchedAgentId = cfg.defaultAgent || 'main';
  }

  // Runtime-only tools keep the channel's existing route. Scoped storage owns
  // its isolated route, but both paths bind the same trusted inbound sender.
  const scoped = hardScopeEnabled(cfg, matchedAgentId);
  const buildRoutedSessionKey = () => {
    const dmScope = cfg.session?.dmScope || 'per-channel-peer';
    log?.info?.(`🔍 构建 sessionKey 前的参数: agentId=${matchedAgentId}, channel=dingtalk-connector, accountId=${accountId}, chatType=${sessionContext.chatType}, sessionPeerId=${sessionContext.sessionPeerId}, dmScope=${dmScope}`);
    return getDingtalkRuntime().channel.routing.buildAgentSessionKey({
      agentId: matchedAgentId!, channel: 'dingtalk-connector', accountId,
      peer: { kind: sessionContext.chatType, id: sessionContext.sessionPeerId }, dmScope,
    });
  };
  const runtimeOnlySessionKey = !scoped && runtimeToolsEnabled(cfg) ? buildRoutedSessionKey() : undefined;
  // Admission follows channel access checks. Raw platform IDs never come from message text.
  const trustedAdmission = (scoped || runtimeOnlySessionKey) ? (() => {
    const input = resolveInboundScope(data, accountId, matchedAgentId!, config);
    return getHardScopeRuntime().admit(input, () => config, {
      routedSessionKey: runtimeOnlySessionKey,
      deferSupersession: true,
    });
  })() : undefined;

  const sessionKey = trustedAdmission?.sessionKey ?? buildRoutedSessionKey();
  log?.info?.(`路由解析完成: agentId=${matchedAgentId}, sessionKey=${sessionKey}`);

  // Only the current message can control the Host. Access and final scoped
  // routing above are shared with normal messages; quoted text is never parsed.
  const command = normalizeSlashCommand(currentMessageText(data));
  const control = isAbortRequestText(command) ? 'stop' : isBtwRequestText(command) ? 'btw' : undefined;
  if (params.questionResume) {
    try {
      params.questionResume.assertCurrent();
      if (params.questionResume.agentId !== matchedAgentId || params.questionResume.sessionKey !== sessionKey) {
        throw new Error('问题的原始路由已变更，请重新提问');
      }
      params.questionResume.onAdmitted();
    } catch (error) { trustedAdmission?.discardPending(); throw error; }
  }
  const questionScope = questionTurnScope(accountId, String(config.clientId ?? ''), data.conversationId, senderId);
  const questionToken = control === 'btw' ? '' : beginQuestionTurn(questionScope);
  if (control !== 'btw') void invalidatePendingQuestionsForScope({accountId,conversationId:data.conversationId,senderId})
    .catch(() => log.warn?.('旧问题卡状态更新失败'));
  if (control) {
    trustedAdmission?.activate(control === 'stop');
    if (control === 'stop') abortConversationRuns(accountId, sessionKey);
    const core = getDingtalkRuntime();
    const text = control === 'stop' ? '/stop' : command;
    const to = isDirect ? senderId : data.conversationId;
    const options = {
      cfg,
      ctx: core.channel.reply.finalizeInboundContext({
        ...trustedAdmission?.context,
        Body: text, BodyForAgent: text, RawBody: text, CommandBody: text,
        From: senderId, To: to, SessionKey: sessionKey, AccountId: accountId,
        ChatType: sessionContext.chatType, SenderId: senderId, SenderName: senderName,
        Provider: 'dingtalk-connector', Surface: 'dingtalk-connector', MessageSid: data.msgId,
        CommandSource: 'text', CommandAuthorized: true,
        OriginatingChannel: 'dingtalk-connector', OriginatingTo: to,
      }),
      dispatcherOptions: bindConversationCallbacks({
        deliver: async (payload: { text?: string }) => {
          if (!payload.text) return;
          await sendProactive(config, isDirect ? { userId: senderId } : { openConversationId: to }, payload.text, {
            msgType: 'markdown', title: control === 'btw' ? '旁路问答' : '停止生成',
            useAICard: false, fallbackToNormal: true, log,
          });
        },
        onError: () => { markTurnUncertain(); log.error?.('Host 控制消息派发失败'); },
      }),
      replyOptions: { ...trustedAdmission?.replyOptions },
      dispatchReplyFromConfig: core.channel.reply.dispatchReplyFromConfig,
    };
    const dispatch = () => control === 'btw' ? dispatchDingtalkBtw(options)
      : core.channel.reply.dispatchReplyWithBufferedBlockDispatcher(options);
    try {
      markTurnExecution('running');
      await (trustedAdmission ? trustedAdmission.run(dispatch) : dispatch());
      markTurnExecution('settled');
    } finally { trustedAdmission?.release(); }
    return;
  }

  return withConversationRun({ accountId, sessionKey }, async (run) => {
  const assertResumedTurnCurrent = () => {
    if (params.questionResume && !isCurrentQuestionTurn(questionScope, questionToken)) throw new Error('新消息已使回答续聊失效');
  };
  const hostTurn = createHostTurnLifecycle(run.controller.signal, () => { assertResumedTurnCurrent(); trustedAdmission?.activate(); });
  try {

  const quoteScope: QuoteScope = {
    accountId, botId: String(config.clientId ?? ""), sessionKey,
    targetKind: isDirect ? "user" : "group", targetId: isDirect ? senderId : data.conversationId,
  };
  // Hydrate only after admission and trusted session routing. Extraction before
  // this point is structural and cannot consult persistent quote bodies.
  content.text = extractMessageContent(data, quoteScope).text;

  // 获取 Agent 工作空间路径
  const agentWorkspaceDir = scoped
    ? getDingtalkRuntime().agent.resolveAgentWorkspaceDir(cfg, matchedAgentId)
    : resolveAgentWorkspaceDir(cfg, matchedAgentId);
  log?.info?.(`Agent 工作空间路径: ${agentWorkspaceDir}`);

  // 构建消息内容
  // ✅ 使用 normalizeSlashCommand 归一化新会话命令
  const rawText = currentMessageText(data);
  // Keep only the current text, never recursively cache synthesized quote wrappers.
  if (rawText) rememberQuoteBody(quoteScope, { msgId: data.msgId, processQueryKey: data.processQueryKey }, rawText);
  
  // 归一化命令（将 /reset、/clear、新会话 等别名统一为 /new）
  const normalizedText = normalizeSlashCommand(rawText);
  // Native /learn targets the global Workshop. Resolve here, after channel access checks,
  // while leaving all learning operations on the normal policy-filtered foreground tool path.
  const learnCommand = scopeContextSelected(cfg, { agentId: matchedAgentId })
    ? resolveScopedLearnCommand(normalizedText, cfg, matchedAgentId) : null;
  if (learnCommand?.kind === 'reply') {
      if (params.preCreatedCard) {
        await finishAICard(params.preCreatedCard, learnCommand.text, config, log);
      } else {
        await sendProactive(config, isDirect ? { userId: senderId } : { openConversationId: data.conversationId }, learnCommand.text, {
          msgType: 'text', useAICard: false, fallbackToNormal: true, log,
        });
      }
    return;
  }
  let userContent = (content.text === rawText ? normalizedText : content.text) || (content.imageUrls.length > 0 ? '请描述这张图片' : '');

  // ===== 养成系统命令拦截 =====
  try {
    const { GamificationEngine, isGamificationCommand } = await import('../game-xiyou/index.ts');
    if (isGamificationCommand(rawText)) {
      const engine = GamificationEngine.getInstanceForUser(senderId);
      // /西游 命令始终可用（用于开关切换），其他命令需要 enabled
      const isToggleCommand = rawText.trim().startsWith('/西游');
      if (isToggleCommand || engine.isEnabled()) {
        const response = engine.handleCommand(rawText);
        if (response) {
          log?.info?.(`[DingTalk][Gamification] 处理养成系统命令: ${rawText.slice(0, 20)}`);
          await sendProactive(config, isDirect ? { userId: senderId } : { openConversationId: data.conversationId }, response, {
            useAICard: true,
            fallbackToNormal: true,
            log,
          });
          return;
        }
      }
    }
  } catch (gamErr: any) {
    log?.warn?.(`[DingTalk][Gamification] 命令处理失败: ${gamErr?.message || gamErr}`);
  }

  // ===== 图片下载到本地文件 =====
  const imageLocalPaths: string[] = [];
  
  log?.info?.(`处理消息: accountId=${accountId}, data= ${JSON.stringify(data, null, 2)}, sender=${senderName}, text=${content.text.slice(0, 50)}...`);
  
  // 处理 imageUrls（来自富文本消息）
  for (let i = 0; i < content.imageUrls.length; i++) {
    const url = content.imageUrls[i];
    try {
      log?.info?.(`处理图片 ${i + 1}/${content.imageUrls.length}: ${url.slice(0, 50)}...`);
      
      if (url.startsWith('downloadCode:')) {
        const code = url.slice('downloadCode:'.length);
        const localPath = await downloadMediaByCode(code, config, agentWorkspaceDir, log);
        if (localPath) {
          imageLocalPaths.push(localPath);
          log?.info?.(`图片下载成功 ${i + 1}/${content.imageUrls.length}`);
        } else {
          log?.warn?.(`图片下载失败 ${i + 1}/${content.imageUrls.length}`);
        }
      } else {
        const localPath = await downloadImageToFile(url, agentWorkspaceDir, log);
        if (localPath) {
          imageLocalPaths.push(localPath);
          log?.info?.(`图片下载成功 ${i + 1}/${content.imageUrls.length}`);
        } else {
          log?.warn?.(`图片下载失败 ${i + 1}/${content.imageUrls.length}`);
        }
      }
    } catch (err: any) {
      log?.error?.(`图片下载异常 ${i + 1}/${content.imageUrls.length}: ${err.message}`);
    }
  }

  // 处理 downloadCodes（来自 picture 消息，fileNames 为空的是图片）
  for (let i = 0; i < content.downloadCodes.length; i++) {
    const code = content.downloadCodes[i];
    const fileName = content.fileNames[i];
    if (!fileName) {
      try {
        log?.info?.(`处理 downloadCode 图片 ${i + 1}/${content.downloadCodes.length}`);
        const localPath = await downloadMediaByCode(code, config, agentWorkspaceDir, log);
        if (localPath) {
          imageLocalPaths.push(localPath);
          log?.info?.(`downloadCode 图片下载成功 ${i + 1}/${content.downloadCodes.length}`);
        } else {
          log?.warn?.(`downloadCode 图片下载失败 ${i + 1}/${content.downloadCodes.length}`);
        }
      } catch (err: any) {
        log?.error?.(`downloadCode 图片下载异常 ${i + 1}/${content.downloadCodes.length}: ${err.message}`);
      }
    }
  }
  
  log?.info?.(`图片下载完成: 成功=${imageLocalPaths.length}, 总数=${content.imageUrls.length + content.downloadCodes.filter((_, i) => !content.fileNames[i]).length}`);
  const missingImages = content.imageUrls.length + content.downloadCodes.filter((_, i) => !content.fileNames[i]).length - imageLocalPaths.length;
  if (missingImages > 0) userContent += `\n\n[附件读取结果] ${missingImages} 张图片未成功读取；不要根据缺失图片臆测内容。`;



  // ===== 文件附件处理：自动下载并解析内容 =====
  const fileContentParts: string[] = [];
  for (let i = 0; i < content.downloadCodes.length; i++) {
    const code = content.downloadCodes[i];
    const fileName = content.fileNames[i];
    if (!fileName) continue;

    try {
      log?.info?.(`处理文件附件 ${i + 1}/${content.downloadCodes.length}: ${fileName}`);
      
      // 获取下载链接
      const downloadUrl = await getFileDownloadUrl(code, fileName, config, log);
      if (!downloadUrl) {
        fileContentParts.push(`⚠️ 文件获取失败: ${fileName}`);
        continue;
      }

      // 下载文件到本地
      const localPath = await downloadFileToLocal(downloadUrl, fileName, agentWorkspaceDir, log);
      if (!localPath) {
        fileContentParts.push(`⚠️ 文件下载失败: ${fileName}\n🔗 [点击下载](${downloadUrl})`);
        continue;
      }

      // 识别文件类型
      const ext = path.extname(fileName).toLowerCase();
      let fileType = '文件';
      
      if (['.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm'].includes(ext)) {
        fileType = '视频';
      } else if (['.mp3', '.wav', '.aac', '.ogg', '.m4a', '.flac', '.wma'].includes(ext)) {
        fileType = '音频';
      } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(ext)) {
        fileType = '图片';
      } else if (['.txt', '.md', '.json', '.xml', '.yaml', '.yml', '.csv', '.log', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.sh', '.bat'].includes(ext)) {
        fileType = '文本文件';
      } else if (['.docx', '.doc'].includes(ext)) {
        fileType = 'Word 文档';
      } else if (ext === '.pdf') {
        fileType = 'PDF 文档';
      } else if (['.xlsx', '.xls'].includes(ext)) {
        fileType = 'Excel 表格';
      } else if (['.pptx', '.ppt'].includes(ext)) {
        fileType = 'PPT 演示文稿';
      } else if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
        fileType = '压缩包';
      }

      // 解析文件内容
      const parseResult = await parseFileContent(localPath, fileName, log);
      
      if (parseResult.type === 'text' && parseResult.content) {
        // 文本类文件：将内容注入到上下文（即使解析成功也给出文件路径）
        const contentPreview = parseResult.content.length > 200 
          ? parseResult.content.slice(0, 200) + '...' 
          : parseResult.content;
        
        fileContentParts.push(
          `📄 **${fileType}**: ${fileName}\n` +
          `✅ 已解析文件内容（${parseResult.content.length} 字符）\n` +
          `💾 已保存到本地: ${localPath}\n` +
          `📝 内容预览:\n\`\`\`\n${contentPreview}\n\`\`\`\n\n` +
          `📋 完整内容:\n${parseResult.content}`
        );
        log?.info?.(`文件解析成功: ${fileName}, 内容长度=${parseResult.content.length}`);
      } else if (parseResult.type === 'text' && !parseResult.content) {
        // 文本类文件但解析失败
        fileContentParts.push(
          `📄 **${fileType}**: ${fileName}\n` +
          `⚠️ 文件解析失败，已保存到本地\n` +
          `💾 本地路径: ${localPath}\n` +
          `🔗 [点击下载](${downloadUrl})`
        );
        log?.warn?.(`文件解析失败: ${fileName}`);
      } else {
        // 二进制文件：只保存到磁盘
        // 特殊处理音频文件的语音识别文本
        if (fileType === '音频' && content.text && content.text !== '[语音消息]') {
          fileContentParts.push(
            `🎤 **${fileType}**: ${fileName}\n` +
            `📝 语音识别: ${content.text}\n` +
            `💾 已保存到本地: ${localPath}\n` +
            `🔗 [点击下载](${downloadUrl})`
          );
        } else {
          fileContentParts.push(
            `📎 **${fileType}**: ${fileName}\n` +
            `💾 已保存到本地: ${localPath}\n` +
            `🔗 [点击下载](${downloadUrl})`
          );
        }
        log?.info?.(`二进制文件已保存: ${fileName}, path=${localPath}`);
      }
    } catch (err: any) {
      log?.error?.(`文件处理异常: ${fileName}, error=${err.message}`);
      fileContentParts.push(`⚠️ 文件处理失败: ${fileName}`);
    }
  }

  if (fileContentParts.length > 0) {
    const fileText = fileContentParts.join('\n\n');
    userContent = userContent ? `${userContent}\n\n${fileText}` : fileText;
  }

  if (!userContent && imageLocalPaths.length === 0) return;

  // ===== 贴处理中表情 =====
  // 若队列繁忙时已在入队阶段提前贴过表情，此处跳过，避免重复贴
  if (!params.emotionAlreadyAdded) {
    addEmotionReply(config, data, log).catch(err => {
      log?.warn?.(`贴表情失败: ${err.message}`);
    });
  }

  // ===== 异步模式：立即回执 + 后台执行 + 主动推送结果 =====
  const asyncMode = config.asyncMode === true;
  log?.info?.(`asyncMode 检测: config.asyncMode=${config.asyncMode}, asyncMode=${asyncMode}`);
  
  const proactiveTarget = isDirect
    ? { userId: senderId }
    : { openConversationId: data.conversationId };

  if (asyncMode) {
    log?.info?.(`进入异步模式分支`);
    const ackText = config.ackText || '🫡 任务已接收，处理中...';
    try {
      await withDeliveryPurpose("placeholder", () => sendProactive(config, proactiveTarget, ackText, {
        msgType: 'text',
        useAICard: false,
        fallbackToNormal: true,
        log,
      }));
    } catch (ackErr: any) {
      log?.warn?.(`Failed to send acknowledgment: ${ackErr?.message || ackErr}`);
    }
  }

  // ===== 使用 SDK 的 dispatchReplyFromConfig =====
  let disposeReply: (() => Promise<void>) | undefined;
  try {
    const core = getDingtalkRuntime();
    
    // 构建消息体（添加图片）
    // Keep feedback tied to the user's text; all host command inputs use the translated request.
    const userPrompt = userContent;
    if (learnCommand?.kind === 'prompt') userContent = learnCommand.text;
    let finalContent = userContent;
    if (imageLocalPaths.length > 0) {
      const imageMarkdown = imageLocalPaths.map(p => `![image](file://${p})`).join('\n');
      finalContent = finalContent ? `${finalContent}\n\n${imageMarkdown}` : imageMarkdown;
    }

    const linkRoutingPrompt = buildLinkRoutingPrompt(content, userContent);
    if (linkRoutingPrompt) {
      finalContent = finalContent
        ? `${finalContent}\n\n${linkRoutingPrompt}`
        : linkRoutingPrompt;
      log?.info?.(`注入卡片链接路由指令: ${linkRoutingPrompt.slice(0, 100)}...`);
    }

    // 构建 envelope 格式的消息
    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
    const envelopeFrom = isDirect ? senderId : `${data.conversationId}:${senderId}`;
    
    const body = core.channel.reply.formatAgentEnvelope({
      channel: "DingTalk",
      from: envelopeFrom,
      timestamp: new Date(),
      envelope: envelopeOptions,
      body: finalContent,
    });

    // 构建 inbound context，使用解析后的 sessionKey
    log?.info?.(`开始构建 inbound context...`);
    
    // ✅ 计算正确的 To 字段
    const toField = isDirect ? senderId : data.conversationId;
    log?.info?.(`构建 inbound context: isDirect=${isDirect}, senderId=${senderId}, conversationId=${data.conversationId}, To=${toField}`);

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      ...trustedAdmission?.context,
      GatewayRunToolBindings:{...trustedAdmission?.context?.GatewayRunToolBindings,[QUESTION_BINDING]:run.runId},
      Body: body,
      BodyForAgent: finalContent,
      RawBody: learnCommand?.kind === 'prompt' ? learnCommand.text : rawText,
      CommandBody: learnCommand?.kind === 'prompt' ? learnCommand.text : normalizedText,
      From: senderId,
      To: toField,  // ✅ 修复：单聊用 senderId，群聊用 conversationId
      SessionKey: sessionKey,  // ✅ 使用手动匹配的 sessionKey
      AccountId: accountId,
      ChatType: sessionContext.chatType,
      GroupSubject: isDirect ? undefined : data.conversationTitle,
      SenderName: senderName,
      SenderId: senderId,
      Provider: "dingtalk-connector" as const,
      Surface: "dingtalk-connector" as const,
      MessageSid: data.msgId,
      Timestamp: Date.now(),
      CommandAuthorized: true,
      OriginatingChannel: "dingtalk-connector" as const,
      OriginatingTo: toField,  // ✅ 修复：应该使用 toField，而不是 accountId
      // 当前机器人的加密身份（用于多机器人协作时让上层 Agent 引用 / 互相 @）
      BotChatbotUserId: data.chatbotUserId,
      BotChatbotCorpId: data.chatbotCorpId,
    } as any);

    // 创建 reply dispatcher options，由 Host buffered dispatcher 接管创建与 settle
    run.controller.signal.throwIfAborted();
    assertResumedTurnCurrent();
    const { dispatcherOptions, replyOptions, getAsyncModeResponse, flushOutboundMedia, dispose } = createDingtalkReplyDispatcher({
      cfg,
      agentId: matchedAgentId,  // ✅ 使用手动匹配的 agentId
      runtime: runtime as RuntimeEnv,
      conversationId: data.conversationId,
      senderId,
      groupMention,
      isDirect,
      accountId,
      messageCreateTimeMs: Date.now(),
      sessionWebhook: data.sessionWebhook,
      asyncMode,
      preCreatedCard: params.preCreatedCard,
      sessionKey,
      // User-visible inbound only — never system/identity wrappers on finalContent.
      userPrompt,
      corpId: data.chatbotCorpId,
      abortSignal: run.controller.signal,
      hostDeferredPending: hostTurn.pending,
      wasHostDeferred: hostTurn.wasDeferred,
    });
    disposeReply = dispose;

    // Host API（OpenClaw 2026.8.1+）：dispatchReplyWithBufferedBlockDispatcher
    const dispatch = async () => {
      try { return await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
        ctx: ctxPayload,
        cfg,
        dispatcherOptions,
        // 使用 Host 注入的低层 Channel 派发入口，使 interrupt 能越过仍在执行的旧回合。
        dispatchReplyFromConfig: core.channel.reply.dispatchReplyFromConfig,
        // Force "automatic" delivery so OpenClaw streams text directly through
        // the dispatcher for both DM and group chat. Without this, OpenClaw
        // defaults to "message_tool_only" for group chats, which suppresses
        // onPartialReply and makes the AI Card receive no content, resulting
        // in "任务执行完成（无文本输出）". DingTalk's AI Card handles its own
        // delivery mode, so the message tool is not needed here.
        replyOptions: {
          ...replyOptions,
          ...trustedAdmission?.replyOptions,
          runId: run.runId,
          abortSignal: run.controller.signal,
          turnAdoptionLifecycle: hostTurn.lifecycle,
          sourceReplyDeliveryMode: "automatic",
        },
      }); } finally { await hostTurn.wait(); }
    };

    // Capture only original platform identity. Callback params cannot replace
    // the sender, account, session, media, quote, or command envelope.
    const originalData = Object.fromEntries(['conversationType','conversationId','senderStaffId','senderId','senderNick',
      'chatbotCorpId','senderCorpId','robotCode','chatbotUserId','sessionWebhook','conversationTitle']
      .filter(key => data[key] !== undefined).map(key => [key,data[key]]));
    const botId = String(config.clientId ?? '');
    markTurnExecution("running");
    const dispatchResult = await withDingtalkQuestionContext({
      accountId, agentId: matchedAgentId, sessionKey, bindingToken:run.runId, conversationId: data.conversationId, senderId,
      isDirect, config: {...config}, log,
      isCurrent: () => isCurrentQuestionTurn(questionScope,questionToken),
      captureSourceGuard: trustedAdmission ? toolContext => getHardScopeRuntime().services.admissions.captureSourceGuard(toolContext) : undefined,
      stopCurrentGeneration: () => { run.controller.abort(QUESTION_PAUSE_REASON); },
      resume: async (answer, questionId) => {
        const assertCurrent = () => { if (!isCurrentQuestionTurn(questionScope,questionToken)) throw new Error('问题已失效'); };
        assertCurrent();
        const latestCfg = structuredClone(getDingtalkRuntime().config.current());
        const latestAccount = resolveDingtalkAccount({cfg:latestCfg,accountId});
        if (!latestAccount.enabled || !latestAccount.configured || latestAccount.accountId !== accountId
          || String(latestAccount.clientId ?? '') !== botId) throw new Error('问题的机器人配置已变更');
        let admitted = false;
        const messageId = `question-answer:${questionId}`;
        const result = await runTrackedTurn({accountId,botId,conversationId:originalData.conversationId,
          senderId,messageId}, () => handleDingTalkMessage({
            accountId, cfg:latestCfg, config:{...latestAccount.config,clientId:latestAccount.clientId,clientSecret:latestAccount.clientSecret},
            data:{...originalData,msgtype:'text',text:{content:answer},msgId:messageId},
            sessionWebhook: originalData.sessionWebhook || sessionWebhook, runtime, log,
            questionResume:{agentId:matchedAgentId,sessionKey,assertCurrent,onAdmitted:()=>{admitted=true;}},
          }));
        if (result !== 'handled' || !admitted) throw new Error('回答未获准继续会话');
      },
    }, () => trustedAdmission ? trustedAdmission.run(dispatch) : dispatch());
    // "settled" records that the Host dispatch returned, not that the user's
    // business objective succeeded or a reply reached DingTalk.
    markTurnExecution(run.controller.signal.aborted ? interruptedExecution(run.controller.signal) : "settled");
    if (run.controller.signal.aborted) return;

    const { queuedFinal, counts } = dispatchResult;

    log.info?.(`[DingTalk][dispatch] dispatchReplyFromConfig 完成: queuedFinal=${queuedFinal}, counts=${JSON.stringify(counts)}`);

    // ===== 异步模式：主动推送最终结果 =====
    if (asyncMode) {
      try {
        const fullResponse = getAsyncModeResponse();
        const oapiToken = await getOapiAccessToken(config);
        let finalText = fullResponse;

        if (oapiToken) {
          finalText = await processLocalImages(finalText, oapiToken, log);

          const mediaTarget: AICardTarget = isDirect
            ? { type: 'user', userId: senderId }
            : { type: 'group', openConversationId: data.conversationId };
          
          // ✅ 处理 Markdown 标记格式的媒体文件
          finalText = await processVideoMarkers(
            finalText,
            '',
            config,
            oapiToken,
            log,
            true,  // ✅ 使用主动 API 模式
            mediaTarget
          );
          finalText = await processAudioMarkers(
            finalText,
            '',
            config,
            oapiToken,
            log,
            true,  // ✅ 使用主动 API 模式
            mediaTarget
          );
          finalText = await uploadAndReplaceFileMarkers(
            finalText,
            '',
            config,
            oapiToken,
            log,
            true,  // ✅ 使用主动 API 模式
            mediaTarget
          );

          // ✅ 处理裸露的本地文件路径（绕过 OpenClaw SDK 的 bug）
          const { processRawMediaPaths } = await import('../services/media');
          finalText = await processRawMediaPaths(
            finalText,
            config,
            oapiToken,
            log,
            mediaTarget
          );
        }

        const textToSend = finalText.trim() || '✅ 任务执行完成（无文本输出）';
        const title =
          textToSend.split('\n')[0]?.replace(/^[#*\s\->]+/, '').trim() || '消息';
        await sendProactive(config, proactiveTarget, textToSend, {
          msgType: 'markdown',
          title,
          quoteScope,
          useAICard: false,
          fallbackToNormal: true,
          log,
        });
        await flushOutboundMedia(fullResponse);
      } catch (asyncErr: any) {
        if (run.controller.signal.aborted) { markTurnExecution(interruptedExecution(run.controller.signal)); return; }
        markTurnUncertain();
        const errMsg = `⚠️ 任务执行失败: ${asyncErr?.message || asyncErr}`;
        try {
          await withDeliveryPurpose("error_notice", () => sendProactive(config, proactiveTarget, errMsg, {
            msgType: 'text',
            useAICard: false,
            fallbackToNormal: true,
            log,
          }));
        } catch (sendErr: any) {
          log?.error?.(`错误通知发送失败: ${sendErr?.message || sendErr}`);
        }
      }
    }

  } catch (err: any) {
    if (run.controller.signal.aborted) { markTurnExecution(interruptedExecution(run.controller.signal)); return; }
    markTurnUncertain();
    if (params.questionResume) throw err;
    log?.error?.(`SDK dispatch 失败: ${err.message}`);
    
    // 降级：发送错误消息
    try {
      const token = await getAccessToken(config);
      const body: any = {
        msgtype: 'text',
        text: { content: `抱歉，处理请求时出错: ${err.message}` },
      };
      applyWebhookTextAt(body, groupMention);
      
      await withDeliveryPurpose("error_notice", () => dingtalkHttp.post(sessionWebhook, body, {
        headers: { 'x-acs-dingtalk-access-token': token, 'Content-Type': 'application/json' },
      }));
    } catch (fallbackErr: any) {
      log?.error?.(`错误消息发送也失败: ${fallbackErr.message}`);
    }
  } finally {
    await disposeReply?.();
  }

  } catch (error) {
    if (run.controller.signal.aborted) { markTurnExecution(interruptedExecution(run.controller.signal)); return; }
    throw error;
  } finally {
    trustedAdmission?.discardPending();
    try { await recallEmotionReply(config, data, log); }
    catch { log.warn?.('撤回处理中表情失败'); }
  }
  });
}

/** OpenClaw owns session queueing and interrupt; keep the receipt alive through dispatch. */
export async function handleDingTalkMessage(params: HandleMessageParams): Promise<void> {
  await handleDingTalkMessageInternal(params);
}
