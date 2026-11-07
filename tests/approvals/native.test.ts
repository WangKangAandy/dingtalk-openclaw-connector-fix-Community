import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const http=vi.hoisted(()=>({post:vi.fn(),put:vi.fn()}));
vi.mock('../../src/utils/http-client.ts',()=>({dingtalkHttp:http}));
vi.mock('../../src/utils/token.ts',()=>({DINGTALK_API:'https://api.dingtalk.com',getAccessToken:vi.fn(async()=>'fixture')}));
import { createChannelApprovalHandlerFromCapability } from 'openclaw/plugin-sdk/approval-handler-runtime';
import { resolveApprovalOverGateway } from 'openclaw/plugin-sdk/approval-gateway-runtime';
import { nativeApprovalCapability } from '../../src/approvals/capability.ts';
import { createApprovalAccountContext, disposeApprovalAccount, handleApprovalCallback } from '../../src/approvals/controls.ts';
import { DingtalkConfigBaseSchema } from '../../src/config/schema.ts';

const accountId='acc-1';
let cfg:any;
const contexts:ReturnType<typeof createApprovalAccountContext>[]=[];
const handlers:NonNullable<Awaited<ReturnType<typeof createChannelApprovalHandlerFromCapability>>>[]=[];
beforeEach(()=>{
  vi.clearAllMocks();
  cfg={channels:{'dingtalk-connector':{accounts:{[accountId]:{clientId:'fixture-robot',clientSecret:'fixture-secret',nativeApprovals:{enabled:true,approvers:['reviewer-a','reviewer-b']}}}}},
    approvals:{exec:{enabled:true,mode:'session'},plugin:{enabled:true,mode:'session'}}};
  http.post.mockResolvedValue({status:200,data:{success:true,result:{deliverResults:[{success:true}]}}});
  http.put.mockResolvedValue({status:200,data:{success:true}});
});
afterEach(async()=>{for(const handler of handlers.splice(0))await handler.stop();for(const context of contexts.splice(0))await disposeApprovalAccount(context);vi.useRealTimers();});
function request(kind:'exec'|'plugin'|'system-agent'='exec') {
  const source={agentId:'main',sessionKey:'agent:main:dingtalk-connector:direct:fixture',turnSourceChannel:'dingtalk-connector',turnSourceAccountId:accountId,
    turnSourceTo:'user:requester',allowedDecisions:['allow-once','deny']};
  return {id:randomUUID(),approvalKind:kind,createdAtMs:Date.now(),expiresAtMs:Date.now()+60_000,
    request:kind==='exec'?{...source,command:'echo fixture',cwd:'/fixture'}:kind==='plugin'?{...source,pluginId:'fixture-plugin',title:'Read fixture',description:'Request fixture access'}
      :{...source,title:'Apply fixture',description:'Update fixture',command:'fixture command',proposalHash:'fixture',sessionId:'fixture-session'}} as any;
}
async function fixture(req=request(),resolve?:any) {
  const resolver=resolve??vi.fn(async(params:any,beforeSubmit:()=>unknown)=>{beforeSubmit();return {applied:true,approval:{id:params.approvalId,status:'allowed',presentation:{kind:params.approvalKind}}};});
  const context=createApprovalAccountContext({accountId,botId:'fixture-robot',readConfig:()=>cfg,resolve:resolver});contexts.push(context);
  const handler=await createChannelApprovalHandlerFromCapability({capability:nativeApprovalCapability,label:'dingtalk-test',clientDisplayName:'fixture',channel:'dingtalk-connector',channelLabel:'DingTalk',cfg,accountId,context});
  expect(handler).not.toBeNull();handlers.push(handler!);
  await handler!.handleRequested(req);
  return {req,resolver,context,handler:handler!};
}
function callback(index=0,actor?:string,decision:unknown='allow-once') {
  const body=http.post.mock.calls[index][1];
  return {accountId,data:{outTrackId:body.outTrackId,userId:actor??body.openSpaceId.split('IM_ROBOT.')[1],
    content:{cardPrivateData:{actionIds:[body.cardData.cardParamMap.question_id],params:{form:{decision}}}}}};
}

describe('actual minimum Host approval runtime with mock DingTalk transport',()=>{
  it.each(['exec','plugin','system-agent'] as const)('routes %s only to explicit approver DMs and resolves the saved canonical identity',async kind=>{
    const {req,resolver,handler}=await fixture(request(kind));
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(http.post.mock.calls.map(c=>c[1].openSpaceId)).toEqual(['dtv1.card//IM_ROBOT.reviewer-a','dtv1.card//IM_ROBOT.reviewer-b']);
    expect(http.post.mock.calls[0][1].imRobotOpenSpaceModel.supportForward).toBe(false);
    const input=callback();
    expect(await handleApprovalCallback(input)).toBe('allowed');
    await handleApprovalCallback(input);
    expect(resolver).toHaveBeenCalledOnce();
    expect(resolver.mock.calls[0][0]).toMatchObject({approvalId:req.id,approvalKind:kind,senderId:'reviewer-a',accountId,decision:'allow-once',channel:'dingtalk-connector'});
    await handler.handleResolved({id:req.id,decision:'allow-once',ts:Date.now(),request:req.request} as any);
  });
  it('rejects other accounts, nonreviewers, missing platform actor and actions the Host did not offer',async()=>{
    const {resolver}=await fixture();
    expect(await handleApprovalCallback({...callback(),accountId:'other'})).toBe('forbidden');
    expect(await handleApprovalCallback(callback(0,'intruder'))).toBe('forbidden');
    const forged:any=callback();delete forged.data.userId;forged.data.content.cardPrivateData.params.userId='reviewer-a';
    expect(await handleApprovalCallback(forged)).toBe('forbidden');
    expect(await handleApprovalCallback(callback(0,undefined,'allow-always'))).toBe('invalid');
    const badAction:any=callback();badAction.data.content.cardPrivateData.actionIds=['fake'];
    expect(await handleApprovalCallback(badAction)).toBe('forbidden');
    expect(resolver).not.toHaveBeenCalled();
  });
  it.each(['reviewers','robot','disabled'])('revalidates %s on click',async change=>{
    const {resolver}=await fixture();
    const account=cfg.channels['dingtalk-connector'].accounts[accountId];
    if(change==='reviewers')account.nativeApprovals.approvers=['reviewer-b'];
    if(change==='robot')account.clientId='replacement-robot';
    if(change==='disabled')account.nativeApprovals.enabled=false;
    expect(await handleApprovalCallback(callback())).toBe('invalidated');
    expect(resolver).not.toHaveBeenCalled();
  });
  it('never retries an unknown resolution, including clicks on another reviewer copy',async()=>{
    const resolver=vi.fn(async()=>{throw new Error('response lost after applying decision');});
    await fixture(request(),resolver);
    expect(await handleApprovalCallback(callback())).toBe('unknown');
    expect(await handleApprovalCallback(callback())).toBe('unknown');
    expect(await handleApprovalCallback(callback(1))).toBe('unknown');
    expect(resolver).toHaveBeenCalledOnce();
  });
  it('serializes competing reviewer clicks and displays the Host winning decision rather than the clicked value',async()=>{
    let release!:(value:any)=>void;
    const result=new Promise<any>(done=>{release=done});
    const resolver=vi.fn(async(_params:any,beforeSubmit:()=>unknown)=>{beforeSubmit();return result;});
    const {req}=await fixture(request(),resolver);
    const first=handleApprovalCallback(callback());
    expect(await handleApprovalCallback(callback(1))).toBe('submitting');
    release({applied:false,approval:{id:req.id,status:'denied',presentation:{kind:'exec'}}});
    expect(await first).toBe('denied');expect(resolver).toHaveBeenCalledOnce();
    await vi.waitFor(()=>expect(http.put.mock.calls.some(c=>c[1].cardData.cardParamMap.question_desc==='OpenClaw 已记录拒绝。')).toBe(true));
  });
  it('does not overwrite a Host expiration with a late unknown callback result',async()=>{
    let reject!:(error:Error)=>void;
    const response=new Promise<any>((_done,fail)=>{reject=fail});
    const {req,handler}=await fixture(request(),vi.fn(async()=>response));
    const pending=handleApprovalCallback(callback());
    await handler.handleExpired(req.id);
    reject(new Error('late timeout'));expect(await pending).toBe('unknown');
    expect(http.put.mock.calls.some(c=>c[1].cardData.cardParamMap.question_desc.includes('结果未确认'))).toBe(false);
    expect(await handleApprovalCallback(callback())).toBe('expired');
  });
  it('uses a late canonical response to correct local expiration without reopening controls',async()=>{
    let release!:(value:any)=>void;
    const response=new Promise<any>(done=>{release=done});
    const {req,handler}=await fixture(request(),vi.fn(async()=>response));
    const pending=handleApprovalCallback(callback());
    await handler.handleExpired(req.id);
    release({applied:true,approval:{id:req.id,status:'allowed',presentation:{kind:'exec'}}});
    expect(await pending).toBe('allowed');
    await vi.waitFor(()=>expect(http.put.mock.calls.at(-1)![1].cardData.cardParamMap.question_desc).toContain('已记录批准'));
    expect(http.put.mock.calls.at(-1)![1].cardData.cardParamMap.card_status).toBe('resolved');
    expect(await handleApprovalCallback(callback())).toBe('expired');
  });
  it('does not offer buttons when the full approval detail exceeds the native presentation budget',async()=>{
    const req=request();req.request.command='x'.repeat(30_000);
    const resolver=vi.fn();await expect(fixture(req,resolver)).rejects.toThrow(/detail exceeds/);
    expect(http.post).not.toHaveBeenCalled();expect(resolver).not.toHaveBeenCalled();
  });
  it('checks liveness again at the final Gateway submission boundary',async()=>{
    const resolver=vi.fn(async(_params:any,beforeSubmit:()=>unknown)=>{
      cfg.channels['dingtalk-connector'].accounts[accountId].nativeApprovals.enabled=false;
      beforeSubmit();throw Error('must not submit');
    });
    await fixture(request(),resolver);
    expect(await handleApprovalCallback(callback())).toBe('invalidated');
  });
  it('does not activate an unconfirmed card and rejects stale controls after runtime disposal',async()=>{
    http.post.mockRejectedValueOnce(new Error('timeout'));
    const {context,resolver}=await fixture();
    expect(await handleApprovalCallback(callback())).toBe('expired');
    await disposeApprovalAccount(context);
    expect(await handleApprovalCallback(callback(1))).toBe('expired');
    expect(resolver).not.toHaveBeenCalled();
  });
  it('does not resend unknown card deliveries when the same Host request is repeated',async()=>{
    http.post.mockRejectedValue(new Error('delivery timeout'));
    const {req,handler,resolver}=await fixture();
    expect(http.post).toHaveBeenCalledTimes(2);
    await handler.handleRequested(req);
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(resolver).not.toHaveBeenCalled();
  });
  it('does not adopt other channels, accounts or unsupported scoped plugin reviewer policy',async()=>{
    const wrong=request();wrong.request.turnSourceAccountId='other';await fixture(wrong);
    const other=request();other.request.turnSourceChannel='slack';await fixture(other);
    cfg.approvals.plugin['dingtalk-connector']={approvers:['reviewer-a']};await fixture(request('plugin'));
    expect(http.post).not.toHaveBeenCalled();
  });
  it('expired and dismissed cards cannot approve, and dismiss does not mean deny',async()=>{
    vi.useFakeTimers();const {resolver}=await fixture();
    const dismiss:any=callback();dismiss.data.content.cardPrivateData.params={user_cancel:true};
    expect(await handleApprovalCallback(dismiss)).toBe('dismissed');
    await vi.advanceTimersByTimeAsync(60_001);
    expect(await handleApprovalCallback(callback(1))).toBe('expired');
    expect(resolver).not.toHaveBeenCalled();
  });
});

it('requires explicit reviewers when enabled; neither empty config nor wildcard grants approval',()=>{
  expect(DingtalkConfigBaseSchema.safeParse({nativeApprovals:{enabled:true}}).success).toBe(false);
  expect(DingtalkConfigBaseSchema.safeParse({nativeApprovals:{enabled:true,approvers:['*']}}).success).toBe(false);
  expect(nativeApprovalCapability.authorizeActorAction!({cfg:{},accountId,senderId:'owner',action:'approve',approvalKind:'exec'}).authorized).toBe(false);
});
it('uses the actual SDK canonical resolve RPC with an explicit owner kind and platform reviewer',async()=>{
  const id=randomUUID();const request=vi.fn(async()=>({applied:true,approval:{id,status:'denied',presentation:{kind:'exec'}}}));
  await resolveApprovalOverGateway({cfg,approvalId:id,approvalKind:'exec',decision:'deny',channel:'dingtalk-connector',accountId,
    senderId:'reviewer-a',gatewayRuntime:{request} as any});
  expect(request).toHaveBeenCalledWith('approval.resolve',{id,kind:'exec',decision:'deny',reviewer:{channel:'dingtalk-connector',accountId,senderId:'reviewer-a'}},expect.anything());
});
