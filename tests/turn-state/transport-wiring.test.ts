import { expect, it, vi } from 'vitest';
const network = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => ({ post: network.post, put: network.put }) } }));
import { dingtalkHttp } from '../../src/utils/http-client.ts';
import { runTrackedTurn, setTurnStoreFactoryForTest } from '../../src/turn-state/runtime.ts';
import { TurnStore } from '../../src/turn-state/store.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

it('production HTTP client records swallowed network failure and blocks its later fallback', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transport-wiring-'));
  const store = new TurnStore(path.join(dir, 'turns.sqlite'));
  setTurnStoreFactoryForTest(() => store);
  const identity = { accountId: 'acc', botId: 'bot', conversationId: 'conversation', senderId: 'sender', messageId: 'message' };
  network.post.mockRejectedValueOnce(Object.assign(new Error('network timeout'), { code: 'ETIMEDOUT' }));
  try {
    await runTrackedTurn(identity, async () => {
      try { await dingtalkHttp.post('https://api.dingtalk.com/v1.0/robot/groupMessages/send', { msgParam: 'PRIVATE' }); } catch {}
      await expect(dingtalkHttp.post('https://oapi.dingtalk.com/robot/send?sessionWebhook=PRIVATE', { msgtype: 'text' })).rejects.toMatchObject({ deliveryUnknown: true });
    });
    const key = store.claim(identity).key;
    expect(store.snapshot(key)).toMatchObject({ disposition: 'needs_review', attempts: [{ kind: 'text', state: 'unknown' }] });
    expect(network.post).toHaveBeenCalledTimes(1);
  } finally { setTurnStoreFactoryForTest(); fs.rmSync(dir, { recursive: true, force: true }); }
});
