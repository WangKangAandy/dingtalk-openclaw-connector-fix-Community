import { createHash } from 'node:crypto';
import type { OpenClawConfig } from 'openclaw/plugin-sdk/config-contracts';
import type { ChannelApprovalKind } from 'openclaw/plugin-sdk/approval-handler-runtime';
import { resolveDingtalkAccount } from '../config/accounts.ts';

export const APPROVAL_CHANNEL = 'dingtalk-connector';
export const APPROVAL_KINDS = ['exec', 'plugin', 'system-agent'] as const;
export function approvalAccount(cfg: OpenClawConfig, accountId?: string | null) {
  if (!accountId) return undefined;
  const account = resolveDingtalkAccount({cfg,accountId});
  const settings = account.config.nativeApprovals;
  if (!account.enabled || !account.configured || !account.clientId || !account.clientSecret || settings?.enabled !== true) return undefined;
  const approvers = [...new Set(settings.approvers ?? [])];
  if (!approvers.length || approvers.length > 20 || approvers.some(id => typeof id !== 'string' || !id || id !== id.trim()
    || id === '*' || id.length > 256 || /[\u0000-\u001f]/.test(id))) return undefined;
  const botId = String(account.clientId);
  return { accountId:account.accountId, botId, approvers, templateId:settings.cardTemplateId,
    config:{...account.config,clientId:account.clientId,clientSecret:account.clientSecret},
    fingerprint:createHash('sha256').update(JSON.stringify([account.accountId,botId,approvers,settings.cardTemplateId])).digest('hex'),
  };
}

export function supportsApprovalKind(cfg: OpenClawConfig, kind: ChannelApprovalKind): boolean {
  // This Host explicitly gates channels which cannot enforce its newer
  // per-plugin reviewer policy. Do not advertise that capability without it.
  return APPROVAL_KINDS.includes(kind) && !(kind === 'plugin' && Object.hasOwn(cfg.approvals?.plugin ?? {}, APPROVAL_CHANNEL));
}
export function matchesApprovalSource(request: {request:{turnSourceChannel?: string | null;turnSourceAccountId?: string | null}}, accountId: string): boolean {
  return request.request.turnSourceChannel === APPROVAL_CHANNEL && request.request.turnSourceAccountId === accountId;
}
