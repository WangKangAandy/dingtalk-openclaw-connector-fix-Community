import { normalizeAccountId } from "../sdk/helpers.ts";
import { z } from "zod";
import { scopedLearningSchema } from "../memory-scope/scoped-workshop/config.ts";
export { z };
import { buildSecretInputSchema, hasConfiguredSecretInput } from "../secret-input.ts";

const DmPolicySchema = z.enum(["open", "pairing", "allowlist"]);
const GroupPolicySchema = z.enum(["open", "allowlist", "disabled"]);

const ToolPolicySchema = z
  .object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  })
  .strict()
  .optional();

/**
 * Group session scope for routing DingTalk group messages.
 * - "group" (default): one session per group chat
 * - "group_sender": one session per (group + sender)
 */
const GroupSessionScopeSchema = z
  .enum(["group", "group_sender"])
  .optional();

/**
 * Group reply mode for DingTalk group messages.
 * - "aicard" (default): use AI Card with streaming support
 * - "text": use plain text reply (supports @bot mentions, no AI Card)
 * - "markdown": use markdown reply (supports @bot mentions, no AI Card)
 *
 * When set to "text" or "markdown", group messages will be sent as
 * plain text/markdown instead of AI Card. This enables bots to @mention
 * each other in multi-Agent group scenarios.
 *
 * ⚠️ Warning: enabling text/markdown mode disables AI Card in group chats.
 */
const GroupReplyModeSchema = z
  .enum(["aicard", "text", "markdown"])
  .optional();

/**
 * Dingtalk tools configuration.
 * Controls which tool categories are enabled.
 */
const DingtalkToolsConfigSchema = z
  .object({
    docs: z.boolean().optional(), // Document operations (default: true)
    media: z.boolean().optional(), // Media upload operations (default: true)
  })
  .strict()
  .optional();

/** Optional dingmbw OAuth app for dws spawn (path 2). Robot credentials stay in clientId/clientSecret. */
const DwsAppConfigSchema = z
  .object({
    clientId: z.union([z.string(), z.number()]).optional(),
    clientSecret: z.string().optional(),
  })
  .strict()
  .optional();

export const DingtalkGroupSchema = z
  .object({
    requireMention: z.boolean().optional(),
    tools: ToolPolicySchema,
    enabled: z.boolean().optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    systemPrompt: z.string().optional(),
    groupSessionScope: GroupSessionScopeSchema,
  })
  .strict();

const DingtalkSharedConfigShape = {
  dmPolicy: DmPolicySchema.optional(),
  allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
  groupPolicy: GroupPolicySchema.optional(),
  groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
  requireMention: z.boolean().optional(),
  groups: z.record(z.string(), DingtalkGroupSchema.optional()).optional(),
  historyLimit: z.number().int().min(0).optional(),
  textChunkLimit: z.number().int().positive().optional(),
  mediaMaxMb: z.number().positive().optional(),
  tools: DingtalkToolsConfigSchema,
  typingIndicator: z.boolean().optional(),
  resolveSenderNames: z.boolean().optional(),
  separateSessionByConversation: z.boolean().optional(),
  sharedMemoryAcrossConversations: z.boolean().optional(),
  /** Scoped plugin data; host sandbox and mount choices are independent. */
  memoryScope: z
    .object({
      enabled: z.boolean().optional(),
      agents: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)).min(1).optional(),
      scopedLearning: scopedLearningSchema.optional(),
    })
    .strict()
    .optional(),
  groupSessionScope: GroupSessionScopeSchema,
  asyncMode: z.boolean().optional(),
  ackText: z.string().optional(),
  endpoint: z.string().optional(), // DWClient gateway endpoint
  debug: z.boolean().optional(), // DWClient debug mode
  enableMediaUpload: z.boolean().optional(),
  blockAutomaticMedia: z.boolean().optional(),
  systemPrompt: z.string().optional(),
  groupReplyMode: GroupReplyModeSchema,
  /** AI Card 模板 ID，不填则使用官方默认模板 */
  cardTemplateId: z.string().optional(),
  /** AI Card 最终内容变量名，对应卡片模板中的变量字段，不填默认 msgContent */
  cardContentVar: z.string().optional().default("msgContent"),
  /**
   * AI Card 执行过程变量名（可选能力增强）。
   * 配置公开工具进度；只展示固定类别与可信状态，不展示命令参数。
   */
  cardProcessVar: z.string().optional(),
  /**
   * AI Card 公开状态汇总变量名（保留模板字段名）。
   * 只写计数与公开状态，不订阅或输出内部推理。
   */
  cardReasoningVar: z.string().optional(),
  /** AI Card 公开工具状态变量；未设置 cardProcessVar 时使用，不输出原始工具结果 */
  cardToolVar: z.string().optional(),
  /** 自定义 AI 卡片点赞按钮 actionId，默认 ai_res_like */
  cardLikeActionId: z.string().optional(),
  /** 自定义 AI 卡片点踩按钮 actionId，默认 ai_res_dislike */
  cardDislikeActionId: z.string().optional(),
  /** 官方 AI 卡片操作区共用 ActionID，默认 sys_action_like_component */
  cardOfficialFeedbackActionId: z.string().optional(),
  /** 卡片上表示赞踩状态的变量名，默认 like */
  cardFeedbackStatusKey: z.string().optional(),
  dwsApp: DwsAppConfigSchema,
};

/**
 * Per-account configuration.
 * All fields are optional - missing fields inherit from top-level config.
 */
export const DingtalkAccountConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    name: z.string().optional(), // Display name for this account
    clientId: z.union([z.string(), z.number()]).optional(),
    clientSecret: buildSecretInputSchema().optional(),
    /**
     * Encrypted DingTalk identity of this bot, used by other agents to @-mention
     * this bot in group messages. Fill from log line `[BotIdentity] chatbotUserId=...`
     * after the bot has received at least one group/DM message.
     */
    chatbotUserId: z.string().optional(),
    chatbotCorpId: z.string().optional(),
    ...DingtalkSharedConfigShape,
  })
  .strict();

/**
 * Base schema (ZodObject) without superRefine, used for JSON Schema generation (Web UI).
 * superRefine turns the schema into ZodEffects which is not compatible with buildChannelConfigSchema.
 */
export const DingtalkConfigBaseSchema = z
  .object({
    enabled: z.boolean().optional(),
    defaultAccount: z.string().optional(),
    // Top-level credentials (backward compatible for single-account mode)
    clientId: z.union([z.string(), z.number()]).optional(),
    clientSecret: buildSecretInputSchema().optional(),
    ...DingtalkSharedConfigShape,
    dmPolicy: DmPolicySchema.optional().default("open"),
    groupPolicy: GroupPolicySchema.optional().default("open"),
    requireMention: z.boolean().optional().default(true),
    separateSessionByConversation: z.boolean().optional().default(true),
    sharedMemoryAcrossConversations: z.boolean().optional().default(false),
    groupSessionScope: GroupSessionScopeSchema.optional().default("group"),
    // Multi-account configuration
    accounts: z.record(z.string(), DingtalkAccountConfigSchema.optional()).optional(),
  })
  .strict();

export const DingtalkConfigSchema = DingtalkConfigBaseSchema.superRefine((value, ctx) => {
    const defaultAccount = value.defaultAccount?.trim();
    if (defaultAccount && value.accounts && Object.keys(value.accounts).length > 0) {
      const normalizedDefaultAccount = normalizeAccountId(defaultAccount);
      if (!Object.prototype.hasOwnProperty.call(value.accounts, normalizedDefaultAccount)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["defaultAccount"],
          message: `channels.dingtalk-connector.defaultAccount="${defaultAccount}" does not match a configured account key`,
        });
      }
    }

    // Validate dmPolicy and allowFrom consistency
    if (value.dmPolicy === "allowlist") {
      const allowFrom = value.allowFrom ?? [];
      if (allowFrom.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowFrom"],
          message:
            'channels.dingtalk-connector.dmPolicy="allowlist" requires channels.dingtalk-connector.allowFrom to contain at least one entry',
        });
      }
    }
    
    // Validate groupPolicy and groupAllowFrom consistency
    if (value.groupPolicy === "allowlist") {
      const groupAllowFrom = value.groupAllowFrom ?? [];
      if (groupAllowFrom.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["groupAllowFrom"],
          message:
            'channels.dingtalk-connector.groupPolicy="allowlist" requires channels.dingtalk-connector.groupAllowFrom to contain at least one entry',
        });
      }
    }
  });
