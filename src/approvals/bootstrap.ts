import { registerChannelRuntimeContext } from 'openclaw/plugin-sdk/channel-runtime-context';
import type { ChannelRuntimeContextKey } from 'openclaw/plugin-sdk/channel-runtime-context';
import { getDingtalkRuntime } from '../runtime.ts';
import { approvalAccount, APPROVAL_CHANNEL } from './policy.ts';
import { createApprovalAccountContext, disposeApprovalAccount, type ApprovalAccountContext } from './controls.ts';

type Registry=Parameters<typeof registerChannelRuntimeContext>[0]['channelRuntime'];
export function createApprovalAccountLifecycle(params:{accountId:string;channelRuntime:Registry;abortSignal:AbortSignal;log?:{warn?:(text:string)=>void}}) {
  if(!params.channelRuntime?.runtimeContexts)throw new Error('Native approvals require the Host channel runtime context registry');
  let context:ApprovalAccountContext|undefined;
  let registration:{dispose:()=>void}|null|undefined;
  const dispose=()=>{if(context)disposeApprovalAccount(context);context=undefined;registration?.dispose();registration=undefined;};
  const key:ChannelRuntimeContextKey={channelId:APPROVAL_CHANNEL,accountId:params.accountId,capability:'approval.native'};
  const setConnected=(connected:boolean)=>{
    if(!connected){dispose();return;}
    if(context||params.abortSignal.aborted)return;
    const readConfig=()=>structuredClone(getDingtalkRuntime().config.current());
    const account=approvalAccount(readConfig(),params.accountId);
    if(!account)return;
    context=createApprovalAccountContext({accountId:params.accountId,botId:account.botId,readConfig,log:params.log});
    registration=registerChannelRuntimeContext({...key,channelRuntime:params.channelRuntime,context,abortSignal:params.abortSignal});
    if(!registration){dispose();throw new Error('Native approval runtime registration failed');}
  };
  params.abortSignal.addEventListener('abort',dispose,{once:true});
  return {setConnected,dispose:()=>{params.abortSignal.removeEventListener('abort',dispose);dispose();}};
}
