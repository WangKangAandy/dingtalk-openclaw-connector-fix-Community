import { createChannelApprovalNativeRuntimeAdapterAsync, type ChannelApprovalNativeRuntimeSpecAsync, type PendingApprovalView } from 'openclaw/plugin-sdk/approval-handler-runtime';
import { approvalAccount, matchesApprovalSource, supportsApprovalKind, APPROVAL_KINDS } from './policy.ts';
import { assertApprovalContext, deliverApprovalCard, retireApprovalEntry, updateApprovalCard, type ApprovalEntry } from './controls.ts';

function describe(view:PendingApprovalView,request:Parameters<ChannelApprovalNativeRuntimeSpecAsync<string,string,ApprovalEntry>['presentation']['buildPendingPayload']>[0]['request']):string {
  const facts=request.request;
  const display={approvalId:view.approvalId,kind:view.approvalKind,title:view.title,description:view.description,
    // Host display views may abbreviate long commands. Use the actual request
    // fields for approval content and reject over-budget cards in full.
    ...'command' in facts?{command:facts.command}: {},
    ...'commandArgv' in facts?{argv:facts.commandArgv}: {},
    ...'commandText' in view?{cwd:view.cwd,host:view.host,nodeId:view.nodeId,envKeys:view.envKeys}: {},
    ...'warningText' in view?{warning:view.warningText}: {},
    ...'scope' in view?{scope:view.scope}: {},
    ...'detail' in facts?{detail:facts.detail}: {},
    ...'proposalHash' in facts?{proposalHash:facts.proposalHash}: {},
    metadata:view.metadata,expiresAt:new Date(view.expiresAtMs).toISOString()};
  const content=JSON.stringify(display,null,2);
  // Never offer an approval for a silently truncated command or warning.
  if(content.length>24_000)throw new Error('Approval detail exceeds native card limit; use OpenClaw approval UI');
  return `请核对 OpenClaw 提供的完整审批内容。批准只代表授权，不代表执行成功。\n\n${content}`;
}
const spec:ChannelApprovalNativeRuntimeSpecAsync<string,string,ApprovalEntry,ApprovalEntry,string>={
  eventKinds:APPROVAL_KINDS,
  availability:{
    isConfigured({context,accountId}) {try{assertApprovalContext(context);return context.accountId===accountId&&approvalAccount(context.readConfig(),accountId)?.botId===context.botId;}catch{return false;}},
    shouldHandle({context,request,approvalKind}) {try{assertApprovalContext(context);const cfg=context.readConfig();return approvalAccount(cfg,context.accountId)?.botId===context.botId&&supportsApprovalKind(cfg,approvalKind)
      &&matchesApprovalSource(request,context.accountId);}catch{return false;}},
  },
  presentation:{
    buildPendingPayload:({view,request})=>describe(view,request),
    buildResolvedResult:({view})=>({kind:'update',payload:view.approvalKind==='system-agent'&&view.terminalStatus
      ?'OpenClaw 已关闭此审批。':view.decision==='deny'?'OpenClaw 已记录拒绝。':'OpenClaw 已记录批准；这不代表操作已经执行成功。'}),
    buildExpiredResult:()=>({kind:'update',payload:'审批已过期。'}),
  },
  transport:{
    prepareTarget({context,plannedTarget,request,approvalKind}) {
      assertApprovalContext(context);
      const cfg=context.readConfig(), account=approvalAccount(cfg,context.accountId);
      const to=plannedTarget.target.to;
      if(!account||!supportsApprovalKind(cfg,approvalKind)||!matchesApprovalSource(request,context.accountId)
        ||plannedTarget.surface!=='approver-dm'||!to.startsWith('user:')||!account.approvers.includes(to.slice(5)))return null;
      return {dedupeKey:JSON.stringify([context.accountId,to]),target:to.slice(5)};
    },
    async deliverPending({context,view,preparedTarget,pendingPayload,request}) {
      assertApprovalContext(context);
      return deliverApprovalCard({context,view,reviewerId:preparedTarget,description:pendingPayload,allowedDecisions:request.request.allowedDecisions});
    },
    updateEntry:({entry,payload})=>updateApprovalCard(entry,payload),
  },
  interactions:{
    bindPending:({entry})=>entry,
    unbindPending:({entry})=>retireApprovalEntry(entry),
    cancelDelivered:async({entry})=>{retireApprovalEntry(entry);await updateApprovalCard(entry,'此审批卡已失效。');},
    clearPendingActions:async({entry})=>{retireApprovalEntry(entry);await updateApprovalCard(entry,'此审批卡已关闭。');},
  },
};
export const nativeApprovalRuntime=createChannelApprovalNativeRuntimeAdapterAsync(spec);
