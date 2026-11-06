import type { ChannelPlugin } from 'openclaw/plugin-sdk/core';
import { createLazyChannelApprovalNativeRuntimeAdapter } from 'openclaw/plugin-sdk/approval-handler-adapter-runtime';
import { approvalAccount, matchesApprovalSource, supportsApprovalKind, APPROVAL_CHANNEL, APPROVAL_KINDS } from './policy.ts';
import { assertApprovalContext } from './controls.ts';

type Capability=NonNullable<ChannelPlugin['approvalCapability']>;
export const nativeApprovalCapability:Capability={
  authorizeActorAction({cfg,accountId,senderId,approvalKind,request}) {
    const account=approvalAccount(cfg,accountId);
    return {authorized:Boolean(account && senderId && account.approvers.includes(senderId)
      && supportsApprovalKind(cfg,approvalKind) && (!request||matchesApprovalSource(request,account.accountId)))};
  },
  getActionAvailabilityState:({cfg,accountId,approvalKind})=>({kind:approvalAccount(cfg,accountId)
    && (!approvalKind||supportsApprovalKind(cfg,approvalKind))?'enabled':'disabled'}),
  getExecInitiatingSurfaceState:({cfg,accountId})=>({kind:approvalAccount(cfg,accountId)?'enabled':'disabled'}),
  native:{
    describeDeliveryCapabilities:({cfg,accountId,approvalKind,request})=>({
      enabled:Boolean(approvalAccount(cfg,accountId)&&accountId&&supportsApprovalKind(cfg,approvalKind)&&matchesApprovalSource(request,accountId)),
      preferredSurface:'approver-dm',supportsOriginSurface:false,supportsApproverDmSurface:true,notifyOriginWhenDmOnly:false,
    }),
    resolveApproverDmTargets:({cfg,accountId,approvalKind,request})=>{
      const account=approvalAccount(cfg,accountId);
      if(!account||!supportsApprovalKind(cfg,approvalKind)||!matchesApprovalSource(request,account.accountId))return [];
      return account.approvers.map(id=>({to:`user:${id}`}));
    },
  },
  nativeRuntime:createLazyChannelApprovalNativeRuntimeAdapter({
    capabilityBoundary:true,eventKinds:APPROVAL_KINDS,
    load:async()=>(await import('./runtime.ts')).nativeApprovalRuntime,
    isConfigured:({context,accountId})=>{
      try{assertApprovalContext(context);return context.accountId===accountId&&approvalAccount(context.readConfig(),accountId)?.botId===context.botId;}catch{return false;}
    },
    shouldHandle:({context,accountId,approvalKind,request})=>{
      try{assertApprovalContext(context);const cfg=context.readConfig();return context.accountId===accountId
        && approvalAccount(cfg,accountId)?.botId===context.botId&&supportsApprovalKind(cfg,approvalKind)&&matchesApprovalSource(request,context.accountId);
      }catch{return false;}
    },
  }),
  describeExecApprovalSetup:()=>`配置 channels.${APPROVAL_CHANNEL}.nativeApprovals.enabled=true 和明确的 approvers 工号列表；审批卡只发私聊。`,
};
