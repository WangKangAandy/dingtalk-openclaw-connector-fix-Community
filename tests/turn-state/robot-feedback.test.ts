import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const net = vi.hoisted(()=>({post:vi.fn(),token:vi.fn(async()=> 'fixture-token')}));
vi.mock('../../src/utils/token.ts',()=>({getAccessToken:net.token,DINGTALK_API:'https://api.dingtalk.com'}));
vi.mock('../../src/utils/http-client.ts',()=>({dingtalkHttp:{post:net.post}}));
import { robotTurnFeedback } from '../../src/turn-state/robot-feedback.ts';
import { TurnStore } from '../../src/turn-state/store.ts';
import { runTrackedTurn,markTurnExecution,recordDelivery,setTurnStoreFactoryForTest } from '../../src/turn-state/runtime.ts';
import { DingtalkConfigSchema } from '../../src/config/schema.ts';
afterEach(()=>{net.post.mockReset();net.token.mockReset();net.token.mockResolvedValue('fixture-token');});
it('declares the feedback opt-in for both shared and account-specific configuration',()=>{
  expect(DingtalkConfigSchema.parse({messageStatusFeedback:true,accounts:{office:{messageStatusFeedback:false}}})).toMatchObject({messageStatusFeedback:true,accounts:{office:{messageStatusFeedback:false}}});
});

it('opts in explicitly and uses only trusted robot credentials and the triggering message',async()=>{
  expect(robotTurnFeedback({clientId:'bot'} as any,{msgId:'m',conversationId:'c'})).toBeUndefined();
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'robot-feedback-'));
  const file=path.join(dir,'turns.sqlite');const store=new TurnStore(file);setTurnStoreFactoryForTest(()=>store);
  net.post.mockResolvedValue({status:200,data:{}});
  const identity={accountId:'a',botId:'bot',conversationId:'c',messageId:'m',senderId:'u'};
  const config={clientId:'bot',messageStatusFeedback:true};
  const data={msgId:'m',conversationId:'c',robotCode:'forged'};
  const observer=robotTurnFeedback(config as any,data)!;
  // The callback can outlive its caller's mutable objects; capture the target.
  data.conversationId='changed-after-admission';data.msgId='changed-after-admission';config.clientId='changed-after-admission';
  try {
    await runTrackedTurn(identity,async()=>{
      markTurnExecution('running');await new Promise(resolve=>setTimeout(resolve,0));
      await recordDelivery('text',async()=>1,()=>true);markTurnExecution('settled');
    },{observer});
    const calls=net.post.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for(const [url,body,options] of calls){
      expect(url).toMatch(/\/robot\/emotion\/(reply|recall)$/);
      expect(body).toMatchObject({robotCode:'bot',openMsgId:'m',openConversationId:'c',emotionType:2});
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(body.textEmotion.text).toBe(body.emotionName);
      expect(JSON.stringify(body)).not.toContain('forged');
    }
    const snapshot=store.snapshot(store.claim(identity).key)!;
    expect(snapshot.feedback).toMatchObject({desired:'submitted',applied:'submitted',outcome:'accepted'});
    expect(snapshot.delivery).toBe('accepted');
    expect(snapshot.attempts).toHaveLength(1); // Reactions never count as answers.
    expect(fs.readFileSync(file+'-wal').includes(Buffer.from('fixture-token'))).toBe(false);
  } finally {setTurnStoreFactoryForTest();fs.rmSync(dir,{recursive:true,force:true});}
});
it('records a reaction rejection without changing the answer result or replaying the model',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'robot-feedback-'));
  const store=new TurnStore(path.join(dir,'turns.sqlite'));setTurnStoreFactoryForTest(()=>store);
  net.post.mockResolvedValue({status:200,data:{code:'Forbidden'}});
  const identity={accountId:'a',botId:'bot',conversationId:'c',messageId:'m',senderId:'u'};
  const model=vi.fn(async()=>{markTurnExecution('running');await recordDelivery('text',async()=>1,()=>true);markTurnExecution('settled');});
  try {
    await runTrackedTurn(identity,model,{observer:robotTurnFeedback({clientId:'bot',messageStatusFeedback:true} as any,{msgId:'m',conversationId:'c'})});
    expect(model).toHaveBeenCalledOnce();expect(net.post).toHaveBeenCalledOnce();
    const snapshot=store.snapshot(store.claim(identity).key)!;
    expect(snapshot).toMatchObject({execution:'settled',delivery:'accepted',reviewRequired:false});
    expect(snapshot.feedback).toMatchObject({outcome:'failed'});
  } finally {setTurnStoreFactoryForTest();fs.rmSync(dir,{recursive:true,force:true});}
});
