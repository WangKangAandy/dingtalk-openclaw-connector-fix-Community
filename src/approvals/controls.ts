import { randomUUID } from 'node:crypto';
import type { OpenClawConfig } from 'openclaw/plugin-sdk/config-contracts';
import type { PendingApprovalView, ChannelApprovalKind } from 'openclaw/plugin-sdk/approval-handler-runtime';
import type { ApprovalResolveResult } from 'openclaw/plugin-sdk/approval-gateway-runtime';
import type { ExecApprovalDecision } from 'openclaw/plugin-sdk/approval-runtime';
import { approvalAccount, APPROVAL_CHANNEL, supportsApprovalKind } from './policy.ts';
import { DINGTALK_API, getAccessToken } from '../utils/token.ts';
import { dingtalkHttp } from '../utils/http-client.ts';
import { withoutTrackedTurn } from '../turn-state/runtime.ts';
import { withHostOutbound } from '../core/conversation-run.ts';
import { DEFAULT_QUESTION_TEMPLATE_ID, parseQuestionCallback } from '../questions/index.ts';

export type ApprovalDecisionInput = {cfg:OpenClawConfig;approvalId:string;approvalKind:ChannelApprovalKind;
  decision:ExecApprovalDecision;channel:string;accountId:string;senderId:string};
type Resolver = (input:ApprovalDecisionInput, beforeSubmit:()=>OpenClawConfig)=>Promise<ApprovalResolveResult>;
export type ApprovalAccountContext = {accountId:string;botId:string;alive:boolean;readConfig:()=>OpenClawConfig;
  resolve:Resolver;log?:{warn?:(text:string)=>void}};
const contexts = new WeakSet<ApprovalAccountContext>();
const deliveryAttempts = new WeakMap<ApprovalAccountContext,Map<string,number>>();
const controls = new Map<string,ApprovalEntry>();
const attempts = new Map<string,'submitting'|'unknown'|'terminal'>();
const PREFIX='dingtalk_approval_';
type State='creating'|'pending'|'submitting'|'unknown'|'terminal';
export type ApprovalEntry = {outTrackId:string;actionId:string;requestId:string;kind:ChannelApprovalKind;reviewerId:string;
  expiresAt:number;fingerprint:string;context:ApprovalAccountContext;config:NonNullable<ReturnType<typeof approvalAccount>>['config'];
  decisions:ExecApprovalDecision[];state:State;timer?:ReturnType<typeof setTimeout>;writes:Promise<void>};

export function createApprovalAccountContext(input:Omit<ApprovalAccountContext,'alive'|'resolve'> & {resolve?:Resolver}) {
  const context:ApprovalAccountContext={...input,alive:true,resolve:input.resolve ?? (async (params,beforeSubmit)=>{
    const {resolveApprovalOverGateway}=await import('openclaw/plugin-sdk/approval-gateway-runtime');
    return resolveApprovalOverGateway({...params,cfg:beforeSubmit()});
  })};
  contexts.add(context);
  deliveryAttempts.set(context,new Map());
  return context;
}
export function assertApprovalContext(value:unknown): asserts value is ApprovalAccountContext {
  if (!value || !contexts.has(value as ApprovalAccountContext) || !(value as ApprovalAccountContext).alive) throw new Error('Native approval context is unavailable');
}
function key(entry:ApprovalEntry) {return JSON.stringify([entry.context.accountId,entry.kind,entry.requestId]);}
function currentAccount(entry:ApprovalEntry) {
  assertApprovalContext(entry.context);
  const cfg=entry.context.readConfig();
  const account=approvalAccount(cfg,entry.context.accountId);
  if(!account || account.botId!==entry.context.botId || account.fingerprint!==entry.fingerprint
    || !account.approvers.includes(entry.reviewerId) || !supportsApprovalKind(cfg,entry.kind)) throw new Error('Approval policy changed');
  return {cfg,account};
}
const detached=<T>(run:()=>Promise<T>)=>withoutTrackedTurn(()=>withHostOutbound(undefined,run));
function assertApiAccepted(response:any) {
  const data=response?.data, code=data?.errcode??data?.code, result=data?.result??data;
  if (!(response?.status>=200 && response.status<300) || data?.success===false || result?.success===false
    || code!==undefined && ![0,'0','OK'].includes(code)
    || result?.deliverResults?.some((r:any)=>r.success===false)) throw new Error('Native approval card delivery unconfirmed');
}

/** All updates are fixed status copy. An unconfirmed mutation is never retried. */
export function updateApprovalCard(entry:ApprovalEntry, text:string):Promise<void> {
  const next=entry.writes.catch(()=>{}).then(()=>detached(async()=>{
    const token=await getAccessToken(entry.config);
    assertApiAccepted(await dingtalkHttp.put(`${DINGTALK_API}/v1.0/card/instances`,{outTrackId:entry.outTrackId,
      cardData:{cardParamMap:{card_status:'resolved',question_desc:text,form_btn_text:'已关闭'}},
      cardUpdateOptions:{updateCardDataByKey:true}}, {headers:{'x-acs-dingtalk-access-token':token}}));
  })).catch(()=>{entry.context.log?.warn?.('审批卡状态更新未确认；不会重发决定');});
  entry.writes=next;
  return next;
}
export function retireApprovalEntry(entry:ApprovalEntry):void {
  entry.state='terminal'; if(entry.timer)clearTimeout(entry.timer);controls.delete(entry.outTrackId);
  if(![...controls.values()].some(other=>key(other)===key(entry)))attempts.delete(key(entry));
}
export function disposeApprovalAccount(context:ApprovalAccountContext):Promise<void> {
  context.alive=false;contexts.delete(context);
  deliveryAttempts.delete(context);
  const updates:Promise<void>[]=[];
  for(const entry of [...controls.values()])if(entry.context===context){retireApprovalEntry(entry);updates.push(updateApprovalCard(entry,'连接已关闭，此审批卡已失效。'));}
  return Promise.all(updates).then(()=>{});
}
export function approvalCallbackRecognized(data:unknown):boolean {
  const id=parseQuestionCallback(data).outTrackId;
  return typeof id==='string' && id.startsWith(PREFIX);
}

export async function deliverApprovalCard(params:{context:ApprovalAccountContext;view:PendingApprovalView;reviewerId:string;description:string;allowedDecisions?:readonly ExecApprovalDecision[]|null}):Promise<ApprovalEntry> {
  assertApprovalContext(params.context);
  if(controls.size>=512)throw new Error('Native approval card capacity reached');
  const cfg=params.context.readConfig(), account=approvalAccount(cfg,params.context.accountId);
  if(!account || account.botId!==params.context.botId || !account.approvers.includes(params.reviewerId)
    || !supportsApprovalKind(cfg,params.view.approvalKind))throw new Error('Approval recipient is not configured');
  const decisions=[...new Set(params.view.actions.filter(a=>a.kind!=='command').map(a=>a.decision))]
    .filter((d):d is ExecApprovalDecision=>['allow-once','allow-always','deny'].includes(d)
      && (params.allowedDecisions==null||params.allowedDecisions.includes(d)));
  if(!decisions.length || !Number.isSafeInteger(params.view.expiresAtMs) || params.view.expiresAtMs<=Date.now())throw new Error('Approval has no live decisions');
  const deliveries=deliveryAttempts.get(params.context)!;
  for(const [id,expires] of deliveries)if(expires<=Date.now())deliveries.delete(id);
  const deliveryKey=JSON.stringify([params.view.approvalKind,params.view.approvalId,params.reviewerId]);
  if(deliveries.has(deliveryKey))throw new Error('Native approval delivery already attempted; no automatic resend');
  if(deliveries.size>=512)throw new Error('Native approval delivery budget reached');
  deliveries.set(deliveryKey,params.view.expiresAtMs);
  const entry:ApprovalEntry={context:params.context,config:account.config,fingerprint:account.fingerprint,
    outTrackId:`${PREFIX}${randomUUID()}`,actionId:randomUUID(),requestId:params.view.approvalId,kind:params.view.approvalKind,
    reviewerId:params.reviewerId,expiresAt:params.view.expiresAtMs,decisions,state:'creating',writes:Promise.resolve()};
  controls.set(entry.outTrackId,entry);
  entry.timer=setTimeout(()=>{retireApprovalEntry(entry);void updateApprovalCard(entry,'审批已过期，请查看 OpenClaw 当前审批状态。');},Math.min(entry.expiresAt-Date.now(),2_147_483_647));
  entry.timer.unref?.();
  try {
    await detached(async()=>{
      const token=await getAccessToken(entry.config);
      currentAccount(entry);
      if(entry.state!=='creating'||entry.expiresAt<=Date.now())throw new Error('Approval expired during preparation');
      const labels:Record<ExecApprovalDecision,string>={'allow-once':'仅允许一次','allow-always':'始终允许（修改后续权限）',deny:'拒绝'};
      assertApiAccepted(await dingtalkHttp.post(`${DINGTALK_API}/v1.0/card/instances/createAndDeliver`,{
        cardTemplateId:account.templateId||DEFAULT_QUESTION_TEMPLATE_ID,outTrackId:entry.outTrackId,
        cardData:{cardParamMap:{question_id:entry.actionId,question_title:'OpenClaw 审批',question_desc:params.description,
          card_status:'pending',form_btn_text:'提交审批决定',selected_text:'',selected_values:'[]',
          form:JSON.stringify({fields:[{name:'decision',type:'CHECKBOX_GROUP',label:'审批决定',required:true,
            options:decisions.map(value=>({value,text:labels[value]}))}]})}},callbackType:'STREAM',userIdType:1,
        imRobotOpenSpaceModel:{supportForward:false},openSpaceId:`dtv1.card//IM_ROBOT.${entry.reviewerId}`,
        imRobotOpenDeliverModel:{spaceType:'IM_ROBOT',robotCode:entry.context.botId,extension:{dynamicSummary:'true'}}
      },{headers:{'x-acs-dingtalk-access-token':token}}));
    });
    currentAccount(entry);
    if(entry.state!=='creating'||entry.expiresAt<=Date.now())throw new Error('Approval expired during delivery');
    entry.state='pending';return entry;
  } catch(error) {retireApprovalEntry(entry);void updateApprovalCard(entry,'此审批卡未被激活，请查看 OpenClaw 当前审批状态。');throw error;}
}

export async function handleApprovalCallback(input:{accountId:string;data:unknown}):Promise<string> {
  const parsed=parseQuestionCallback(input.data);
  if(typeof parsed.outTrackId!=='string'||!parsed.outTrackId.startsWith(PREFIX))return 'not-handled';
  const entry=controls.get(parsed.outTrackId);
  if(!entry)return 'expired';
  if(input.accountId!==entry.context.accountId||parsed.userId!==entry.reviewerId||parsed.questionId!==entry.actionId)return 'forbidden';
  if(entry.expiresAt<=Date.now()){retireApprovalEntry(entry);await updateApprovalCard(entry,'审批已过期。');return 'expired';}
  if(entry.state!=='pending')return entry.state;
  let policy:ReturnType<typeof currentAccount>;
  try{policy=currentAccount(entry);}catch{retireApprovalEntry(entry);await updateApprovalCard(entry,'审批配置已变更，此卡已失效。');return 'invalidated';}
  if(parsed.params.user_cancel===true||parsed.params.user_cancel==='true'){
    retireApprovalEntry(entry);await updateApprovalCard(entry,'已关闭此卡；审批请求仍由 OpenClaw 管理。');return 'dismissed';
  }
  let form=parsed.params.form;
  if(typeof form==='string'){if(form.length>2048)return 'invalid';try{form=JSON.parse(form);}catch{return 'invalid';}}
  if(!form||typeof form!=='object'||Array.isArray(form)||Object.keys(form).some(k=>k!=='decision'))return 'invalid';
  const raw=form.decision;
  const decision=Array.isArray(raw)&&raw.length===1?raw[0]:raw;
  if(typeof decision!=='string'||!entry.decisions.includes(decision as ExecApprovalDecision))return 'invalid';
  const attemptKey=key(entry);
  if(attempts.has(attemptKey))return attempts.get(attemptKey)!;
  attempts.set(attemptKey,'submitting');entry.state='submitting';
  try{
    const result=await entry.context.resolve({cfg:policy.cfg,approvalId:entry.requestId,approvalKind:entry.kind,
      decision:decision as ExecApprovalDecision,channel:APPROVAL_CHANNEL,accountId:entry.context.accountId,senderId:entry.reviewerId},()=>{
        try{
          if(entry.state!=='submitting'||!controls.has(entry.outTrackId)||entry.expiresAt<=Date.now())throw new Error('Approval closed');
          return currentAccount(entry).cfg;
        }catch{throw Object.assign(new Error('Approval changed before submission'),{approvalNotSubmitted:true});}
      });
    const approval=result?.approval;
    if(!approval||approval.id!==entry.requestId||approval.presentation?.kind!==entry.kind
      || !['allowed','denied','expired','cancelled'].includes(approval.status))throw new Error('Approval result is unconfirmed');
    attempts.set(attemptKey,'terminal');
    const description=approval.status==='allowed'?'OpenClaw 已记录批准；这不代表操作已经执行成功。'
      :approval.status==='denied'?'OpenClaw 已记录拒绝。':'OpenClaw 已关闭此审批。';
    const entries=[...controls.values()].filter(item=>key(item)===attemptKey);
    // A local expiry can race with an earlier accepted Gateway decision. The
    // canonical response still corrects this card, without reopening actions.
    if(!entries.includes(entry))entries.push(entry);
    for(const item of entries){retireApprovalEntry(item);void updateApprovalCard(item,description);}
    return approval.status;
  }catch(error:any){
    if(error?.approvalNotSubmitted){retireApprovalEntry(entry);await updateApprovalCard(entry,'审批状态或配置已变更，未提交决定。');return 'invalidated';}
    // A timeout can occur after the Host applied a decision. Do not resolve again.
    if(controls.has(entry.outTrackId)){
      attempts.set(attemptKey,'unknown');entry.state='unknown';
      await updateApprovalCard(entry,'决定提交结果未确认，请在 OpenClaw 核查；此卡不会重复提交。');
    }
    return 'unknown';
  }
}
