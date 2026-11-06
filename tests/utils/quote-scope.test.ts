import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { QuoteBodyStore, setQuoteBodyStoreForTest, type QuoteScope } from '../../src/utils/quote-body-store.ts';
import { extractQuotedMsgText } from '../../src/utils/quote-message.ts';

const scope: QuoteScope = { accountId: 'account', botId: 'robot', sessionKey: 'session', targetKind: 'group', targetId: 'group-A' };
const dirs: string[] = [];
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-scope-'));
  dirs.push(dir);
  const file = path.join(dir, 'cache.json');
  const store = new QuoteBodyStore(file);
  setQuoteBodyStoreForTest(store);
  return { file, store };
}
afterEach(() => { setQuoteBodyStoreForTest(null); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('quote identity boundaries', () => {
  it('persists exact references but isolates account, bot, agent session and physical recipient', () => {
    const { file, store } = fixture();
    store.remember(scope, { msgId: 'message', processQueryKey: 'receipt' }, 'A only', { title: 'Shared title' });
    const reopened = new QuoteBodyStore(file);
    expect(reopened.lookup(scope, { msgId: 'message' })).toBe('A only');
    for (const other of [
      { ...scope, accountId: 'other' }, { ...scope, botId: 'other' },
      { ...scope, sessionKey: 'other' }, { ...scope, targetId: 'group-B' }, { ...scope, targetKind: 'user' as const },
    ]) expect(reopened.lookup(other, { processQueryKey: 'receipt' })).toBeNull();
  });
  it('never recovers a title-only quote, even within the same scope', () => {
    const { store } = fixture();
    store.remember(scope, { msgId: 'message-a' }, 'Shared title\nprivate fixture', { title: 'Shared title' });
    const input = { isReplyMsg: true, repliedMsg: { msgType: 'text', content: { text: 'Shared title' } } };
    expect(extractQuotedMsgText(input, 3, undefined, scope)).not.toContain('private fixture');
    input.repliedMsg.content = { text: 'Shared title' };
    expect(extractQuotedMsgText(input, 3, { originalMsgId: 'message-a' })).not.toContain('private fixture');
    expect(extractQuotedMsgText(input, 3, { originalMsgId: 'message-a' }, scope)).toContain('private fixture');
  });
  it('rejects conflicting identifiers instead of using the first match', () => {
    const { store } = fixture();
    store.remember(scope, { processQueryKey: 'receipt-a', msgId: 'message-a' }, 'A');
    store.remember(scope, { processQueryKey: 'receipt-b', msgId: 'message-b' }, 'B');
    expect(store.lookup(scope, { msgId: 'message-a', processQueryKey: 'receipt-b' })).toBeNull();
    const text = extractQuotedMsgText({ isReplyMsg: true, repliedMsg: { msgType: 'interactiveCard', msgId: 'message-b' } },
      3, { originalProcessQueryKey: 'receipt-a' }, scope);
    expect(text).toContain('[interactiveCard消息]');
    store.remember(scope, { processQueryKey: 'receipt-c', msgId: 'message-a' }, 'C');
    expect(store.lookup(scope, { msgId: 'message-a' })).toBeNull();
  });
  it('does not reuse the outer reference ID to hydrate a nested reference', () => {
    const { store } = fixture();
    store.remember(scope, { processQueryKey: 'outer' }, 'Outer cached content');
    const text = extractQuotedMsgText({ isReplyMsg: true, repliedMsg: {
      msgType: 'text', content: { text: 'Structural outer', isReplyMsg: true,
        repliedMsg: { msgType: 'interactiveCard', content: {} } },
    } }, 3, { originalProcessQueryKey: 'outer' }, scope);
    expect(text).toContain('Structural outer');
    expect(text).not.toContain('Outer cached content');
  });
  it('ignores the legacy unscoped file format and malformed records', () => {
    const { file, store } = fixture();
    fs.writeFileSync(file, JSON.stringify({ byKey: { message: { text: 'legacy', savedAt: Date.now() } } }));
    expect(store.lookup(scope, { msgId: 'message' })).toBeNull();
    fs.writeFileSync(file, JSON.stringify({ version: 1, records: [null, {}, { scope, ids: ['message'], text: {}, savedAt: Date.now() }] }));
    expect(store.lookup(scope, { msgId: 'message' })).toBeNull();
  });
  it('expires records and bounds Unicode bodies with an explicit incomplete flag', () => {
    const { file, store } = fixture();
    store.remember(scope, { msgId: 'long' }, 'x'.repeat(5999) + '😀' + 'tail');
    const record = store.lookupRecord(scope, { msgId: 'long' });
    expect(record?.truncated).toBe(true);
    expect(record?.text).toBe('x'.repeat(5999));
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.records[0].savedAt = Date.now() - 25 * 60 * 60 * 1000;
    fs.writeFileSync(file, JSON.stringify(data));
    expect(store.lookup(scope, { msgId: 'long' })).toBeNull();
  });
  it('does not index a record without a trustworthy scope or identifier', () => {
    const { store } = fixture();
    store.remember({ ...scope, sessionKey: '' }, { msgId: 'message' }, 'invalid');
    store.remember(scope, {}, 'title-only', { title: 'Shared title' });
    expect(store.lookup(scope, { msgId: 'message' })).toBeNull();
  });
});
