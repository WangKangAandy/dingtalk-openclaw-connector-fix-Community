import { describe, it, expect, vi } from 'vitest';
import { withConversationRun, abortConversationRuns, bindConversationCallbacks, withCancelledCardClose } from '../../src/core/conversation-run.ts';
import { installDeliveryTracking } from '../../src/turn-state/transport.ts';

describe('conversation output cancellation', () => {
  it('gates actual requests from callbacks invoked by another turn and after closure', async () => {
    const send = vi.fn(async () => ({status:200, data:{errcode:0}}));
    const client = {post:send, put:send}; installDeliveryTracking(client);
    let later!: () => Promise<unknown>;
    const scope={accountId:'a',sessionKey:'s'};
    await withConversationRun(scope, async () => {
      later=bindConversationCallbacks({send:() => client.post('https://oapi.dingtalk.com/robot/send', {msgtype:'text'})}).send;
      await later();
      abortConversationRuns('other','s'); await later();
      abortConversationRuns('a','other'); await later();
      await withConversationRun({accountId:'other',sessionKey:'s'}, async () => {
        abortConversationRuns('a','s');
        expect(() => later()).toThrow(/abort/i);
      });
      expect(() => client.put('https://api.dingtalk.com/v1.0/card/streaming', {isFinalize:false})).toThrow(/abort/i);
      await withCancelledCardClose(() => client.put('https://api.dingtalk.com/v1.0/card/streaming', {isFinalize:true}));
    });
    expect(() => later()).toThrow(/closed/i);
    expect(send).toHaveBeenCalledTimes(4);
  });
});
