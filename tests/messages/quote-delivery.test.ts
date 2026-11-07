import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const http = vi.hoisted(() => ({ put: vi.fn(), post: vi.fn() }));
vi.mock('../../src/utils/http-client.ts', () => ({ dingtalkHttp: http, dingtalkOapiHttp: http, dingtalkUploadHttp: http }));
vi.mock('../../src/utils/token.ts', () => ({ DINGTALK_API: 'https://api.dingtalk.com', getAccessToken: async () => 'fixture', getOapiAccessToken: async () => null }));
import { QuoteBodyStore, setQuoteBodyStoreForTest, type QuoteScope } from '../../src/utils/quote-body-store.ts';
import { createAICardForTarget, finishAICard, type AICardInstance } from '../../src/services/messaging/card.ts';
import { sendProactive } from '../../src/services/messaging.ts';

const scope: QuoteScope = { accountId: 'bot', botId: 'client', sessionKey: 's', targetKind: 'group', targetId: 'group-A' };
const config = { clientId: 'client', clientSecret: 'fixture', cardContentVar: 'content' } as any;
let dir: string, store: QuoteBodyStore;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quote-delivery-'));
  store = new QuoteBodyStore(path.join(dir, 'cache.json')); setQuoteBodyStoreForTest(store);
  http.put.mockReset(); http.post.mockReset();
  http.put.mockResolvedValue({ status: 200, data: {} });
  http.post.mockResolvedValue({ status: 200, data: {} });
});
afterEach(() => { setQuoteBodyStoreForTest(null); fs.rmSync(dir, { recursive: true, force: true }); });
const card = (): AICardInstance => ({ cardInstanceId: 'card', accessToken: 'fixture', tokenExpireTime: Date.now() + 3600000,
  inputingStarted: true, quoteScope: scope });

it('captures only a route matching the actual robot and card recipient', async () => {
  const own = await createAICardForTarget(config, { type: 'group', openConversationId: 'group-A' }, undefined, scope);
  expect(own?.quoteScope).toEqual(scope);
  const foreign = await createAICardForTarget(config, { type: 'group', openConversationId: 'group-B' }, undefined, scope);
  expect(foreign?.quoteScope).toBeUndefined();
  const otherBot = await createAICardForTarget({ ...config, clientId: 'other' }, { type: 'group', openConversationId: 'group-A' }, undefined, scope);
  expect(otherBot?.quoteScope).toBeUndefined();
});
it('does not cache an in-flight final draft; caches only after its streaming write returns', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  http.put.mockImplementation(async (url: string) => {
    if (url.includes('/card/streaming')) await pending;
    return { status: 200, data: {} };
  });
  const finish = finishAICard(card(), 'final confirmed body', config);
  await vi.waitFor(() => expect(http.put).toHaveBeenCalled());
  expect(store.lookup(scope, { cardInstanceId: 'card' })).toBeNull();
  release(); await finish;
  expect(store.lookup(scope, { cardInstanceId: 'card' })).toBe('final confirmed body');
});
it.each([{ response: { status: 403, data: {} } }, { code: 'ETIMEDOUT', request: {} }])('does not cache a failed or unknown draft', async error => {
  http.put.mockRejectedValue(Object.assign(new Error('fixture write failure'), error));
  await expect(finishAICard(card(), 'unsent', config)).rejects.toThrow();
  expect(store.lookup(scope, { cardInstanceId: 'card' })).toBeNull();
});
it('does not confuse HTTP 200 business rejection with a confirmed body', async () => {
  http.put.mockResolvedValue({ status: 200, data: { success: false } });
  await expect(finishAICard(card(), 'rejected', config)).rejects.toThrow('rejected');
  expect(store.lookup(scope, { cardInstanceId: 'card' })).toBeNull();
});
it('stores normal replies by receipt ID only when the route and response agree', async () => {
  http.post.mockResolvedValue({ status: 200, data: { processQueryKey: 'receipt' } });
  await sendProactive(config, { openConversationId: 'group-A' }, 'delivered', { useAICard: false, quoteScope: scope });
  expect(store.lookup(scope, { processQueryKey: 'receipt' })).toBe('delivered');
  await sendProactive(config, { openConversationId: 'group-B' }, 'foreign', { useAICard: false, quoteScope: scope });
  expect(store.lookup(scope, { processQueryKey: 'receipt' })).toBe('delivered');
  http.post.mockResolvedValue({ status: 200, data: { processQueryKey: 'bad', success: false } });
  await sendProactive(config, { openConversationId: 'group-A' }, 'rejected', { useAICard: false, quoteScope: scope });
  expect(store.lookup(scope, { processQueryKey: 'bad' })).toBeNull();
});
