import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TurnStore, type TurnIdentity } from '../../src/turn-state/store.ts';
import { markTurnExecution, recordDelivery, runTrackedTurn, setTurnStoreFactoryForTest } from '../../src/turn-state/runtime.ts';
import { installDeliveryTracking, receiptKind } from '../../src/turn-state/transport.ts';

const identity: TurnIdentity = { accountId: 'account', botId: 'robot', conversationId: 'group', messageId: 'message', senderId: 'sender' };
let dir: string, file: string, store: TurnStore;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-ledger-')); file = path.join(dir, 'turns.sqlite');
  store = new TurnStore(file); setTurnStoreFactoryForTest(() => store);
});
afterEach(() => { setTurnStoreFactoryForTest(); try { store.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); });
const receipt = () => store.claim(identity).record;

describe('durable turn admission', () => {
  it('claims a business message once even when protocol IDs or handler instances change', async () => {
    const execute = vi.fn(async () => { markTurnExecution('running'); markTurnExecution('settled'); });
    expect(await runTrackedTurn(identity, execute)).toBe('handled');
    expect(await runTrackedTurn(identity, execute)).toBe('duplicate');
    const reopened = new TurnStore(file);
    try { expect(reopened.claim(identity).claimed).toBe(false); } finally { reopened.close(); }
    expect(execute).toHaveBeenCalledOnce(); expect(receipt().execution).toBe('settled');
  });
  it('retains an unclosed receipt after a crash without replaying the operation', () => {
    const { key } = store.claim(identity); store.execution(key, 'running');
    const reopened = new TurnStore(file);
    try {
      expect(reopened.claim(identity).claimed).toBe(false);
      expect(reopened.snapshot(key)?.reviewRequired).toBe(true);
      expect(() => reopened.execution(key, 'settled')).toThrow(/owned/);
    } finally { reopened.close(); }
  });
  it('isolates equal message IDs across bots, accounts, conversations and senders', () => {
    expect(store.claim(identity).claimed).toBe(true);
    for (const field of ['botId', 'accountId', 'conversationId', 'senderId'] as const) {
      expect(store.claim({ ...identity, [field]: 'other' }).claimed).toBe(true);
    }
  });
  it('blocks malformed identities before invoking the handler', async () => {
    const handler = vi.fn();
    await expect(runTrackedTurn({ ...identity, messageId: '' }, handler)).rejects.toThrow(/trusted/);
    expect(handler).not.toHaveBeenCalled();
  });
  it('checks capacity before committing a new receipt, and never evicts uncertain work', () => {
    // Fixture populates this private test DB directly to exercise the public claim.
    const { DatabaseSync } = require('node:sqlite');
    const writer = new DatabaseSync(file);
    writer.exec('BEGIN');
    const add = writer.prepare("INSERT INTO turns VALUES(?,?,'unknown','needs_review',1,0,0)");
    for (let i = 0; i < 10000; i++) add.run(String(i), 'crashed');
    writer.exec('COMMIT'); writer.close();
    expect(() => store.claim(identity)).toThrow(/capacity/);
    const verify = new DatabaseSync(file);
    expect(verify.prepare('SELECT COUNT(*) AS n FROM turns').get().n).toBe(10000); verify.close();
  });
  it('does not allow callbacks to send after the handler has closed', async () => {
    let later!: () => Promise<void>;
    const send = vi.fn(async () => ({ ok: true }));
    await runTrackedTurn(identity, async () => {
      const { AsyncResource } = await import('node:async_hooks');
      const resource = new AsyncResource('fixture');
      later = () => resource.runInAsyncScope(async () => { await recordDelivery('text', send, r => r.ok); });
    });
    await expect(later()).rejects.toThrow(/not sent/); expect(send).not.toHaveBeenCalled();
  });
});

describe('execution and delivery evidence', () => {
  it('does not treat a created placeholder as a delivered answer', async () => {
    await runTrackedTurn(identity, async () => {
      await recordDelivery('placeholder', async () => ({}), () => true);
      markTurnExecution('running'); markTurnExecution('settled');
    });
    expect(store.snapshot(receipt().key)).toMatchObject({ execution: 'settled', delivery: 'not_observed' });
  });
  it('retains interrupted work while pruning old closed handled receipts', () => {
    let now = 1000;
    const retained = new TurnStore(path.join(dir, 'retention.sqlite'), () => now);
    try {
      const old = retained.claim(identity); retained.execution(old.key, 'settled'); retained.finish(old.key);
      const unknown = retained.claim({ ...identity, messageId: 'unknown' }); retained.execution(unknown.key, 'running');
      now += 9 * 24 * 3600000;
      retained.claim({ ...identity, messageId: 'new' });
      expect(retained.get(old.key)).toBeUndefined(); expect(retained.snapshot(unknown.key)?.reviewRequired).toBe(true);
    } finally { retained.close(); }
  });
  it('keeps a settled Host dispatch distinct from accepted delivery', async () => {
    await runTrackedTurn(identity, async () => {
      markTurnExecution('running');
      await recordDelivery('text', async () => ({ accepted: true }), r => r.accepted);
      markTurnExecution('settled');
    });
    const record = store.snapshot(receipt().key)!;
    expect(record.execution).toBe('settled'); expect(record.attempts).toMatchObject([{ kind: 'text', state: 'accepted' }]);
    expect(record.reviewRequired).toBe(false);
  });
  it('retains unknown delivery even when a caller swallows the timeout and returns', async () => {
    await runTrackedTurn(identity, async () => {
      markTurnExecution('running');
      try { await recordDelivery('text', async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); }, () => true); } catch {}
      markTurnExecution('settled');
    });
    const record = store.snapshot(receipt().key)!;
    expect(record.execution).toBe('settled'); expect(record.attempts[0].state).toBe('unknown');
    expect(record.disposition).toBe('needs_review');
  });
  it('stops a fallback send after an uncertain request instead of risking duplicate replies', async () => {
    const fallback = vi.fn(async () => ({}));
    await runTrackedTurn(identity, async () => {
      try { await recordDelivery('text', async () => { throw new Error('response lost'); }, () => true); } catch {}
      await expect(recordDelivery('text', fallback, () => true)).rejects.toMatchObject({ deliveryUnknown: true });
    });
    expect(fallback).not.toHaveBeenCalled();
  });
  it('does not classify HTTP 408 as proof of rejection', async () => {
    await runTrackedTurn(identity, async () => {
      try { await recordDelivery('text', async () => { throw { response: { status: 408 } }; }, () => true); } catch {}
    });
    expect(store.snapshot(receipt().key)?.attempts[0].state).toBe('unknown');
  });
  it('allows an explicit fallback after a definite rejection and records both facts', async () => {
    await runTrackedTurn(identity, async () => {
      try { await recordDelivery('card', async () => { throw { response: { status: 403 } }; }, () => true); } catch {}
      await recordDelivery('text', async () => 1, () => true);
    });
    expect(store.snapshot(receipt().key)?.attempts.map(a => a.state)).toEqual(['failed', 'accepted']);
  });
  it('marks execution interrupted if the handler throws while work is running', async () => {
    await expect(runTrackedTurn(identity, async () => { markTurnExecution('running'); throw new Error('fixture'); })).rejects.toThrow('fixture');
    expect(store.snapshot(receipt().key)).toMatchObject({ execution: 'unknown', disposition: 'needs_review', closed: 1 });
  });
  it('keeps concurrent message contexts separate', async () => {
    await Promise.all([1, 2].map(n => runTrackedTurn({ ...identity, messageId: String(n) }, async () => {
      markTurnExecution('running'); await Promise.resolve();
      await recordDelivery('text', async () => n, () => true); markTurnExecution(n === 1 ? 'settled' : 'failed');
    })));
    for (const n of [1, 2]) {
      const row = store.claim({ ...identity, messageId: String(n) }).record;
      expect(row.execution).toBe(n === 1 ? 'settled' : 'failed'); expect(store.snapshot(row.key)?.attempts).toHaveLength(1);
    }
  });
  it('does not send when the durable pending receipt cannot be written', async () => {
    const send = vi.fn(async () => ({ accepted: true }));
    await expect(runTrackedTurn(identity, async () => {
      store.close();
      await recordDelivery('text', send, r => r.accepted);
    })).rejects.toMatchObject({ deliveryUnknown: true });
    expect(send).not.toHaveBeenCalled();
    const reopened = new TurnStore(file);
    try { expect(reopened.claim(identity).claimed).toBe(false); } finally { reopened.close(); }
    // Replace the closed instance before the shared test cleanup.
    try { setTurnStoreFactoryForTest(); } catch {}
  });
});

describe('real transport decorator with a fake network boundary', () => {
  it('checks exact routes and does not mistake progress, uploads or reactions for answer delivery', () => {
    expect(receiptKind('put', 'https://api.dingtalk.com/v1.0/card/streaming', { isFinalize: false })).toBeUndefined();
    expect(receiptKind('post', 'https://api.dingtalk.com/v1.0/robot/emotion/reply', {})).toBeUndefined();
    expect(receiptKind('post', 'https://api.dingtalk.com/v1.0/oauth2/accessToken', {})).toBeUndefined();
    expect(receiptKind('post', 'https://api.dingtalk.com/v1.0/card/instances', {})).toBe('placeholder');
  });
  it.each([{ errcode: 403 }, { success: false }, { code: 'Forbidden' }])('records HTTP 200 business rejection: %j', data => {
    const client = { post: vi.fn(async () => ({ status: 200, data })), put: vi.fn() }; installDeliveryTracking(client);
    return runTrackedTurn(identity, async () => {
      await expect(client.post('https://oapi.dingtalk.com/robot/send?sessionWebhook=PRIVATE', { msgtype: 'text', text: { content: 'PRIVATE' } })).rejects.toMatchObject({ deliveryRejected: true });
    }).then(() => {
      expect(store.snapshot(receipt().key)?.attempts[0].state).toBe('failed');
      expect(fs.readFileSync(file).includes(Buffer.from('PRIVATE'))).toBe(false);
      if (fs.existsSync(file+'-wal')) expect(fs.readFileSync(file+'-wal').includes(Buffer.from('PRIVATE'))).toBe(false);
    });
  });
  it('does not call a processQueryKey-free response successful', async () => {
    const client = { post: vi.fn(async () => ({ status: 200, data: {} })), put: vi.fn() }; installDeliveryTracking(client);
    await expect(runTrackedTurn(identity, async () => {
      await client.post('https://api.dingtalk.com/v1.0/robot/groupMessages/send', {});
    })).rejects.toMatchObject({ deliveryUnknown: true });
    expect(store.snapshot(receipt().key)?.reviewRequired).toBe(true);
  });
});
