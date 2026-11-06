/**
 * 测试环境设置
 *
 * 全局 setup，由 vitest.config.ts 的 setupFiles 引入。
 *
 * 全局 axios mock：
 * http-client.ts 在模块加载时立即调用 axios.create()，因此所有测试文件
 * 的 axios mock 必须提供 create 方法，否则会抛出 "default.create is not a function"。
 * 在此统一提供全局 mock，各测试文件可在此基础上覆盖具体的 get/post 行为。
 */
import { vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TurnStore } from '../src/turn-state/store.ts';
import { setTurnStoreFactoryForTest } from '../src/turn-state/runtime.ts';
import { QuoteBodyStore, setQuoteBodyStoreForTest } from '../src/utils/quote-body-store.ts';
let turnTestDir: string | undefined;
let quoteTestDir: string | undefined;
beforeEach(() => {
  quoteTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dingtalk-quote-test-'));
  setQuoteBodyStoreForTest(new QuoteBodyStore(path.join(quoteTestDir, 'quotes.json')));
  setTurnStoreFactoryForTest(() => {
    turnTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dingtalk-turn-test-'));
    return new TurnStore(path.join(turnTestDir, 'turns.sqlite'));
  });
});
afterEach(() => {
  setQuoteBodyStoreForTest(null);
  if (quoteTestDir) fs.rmSync(quoteTestDir, {recursive: true, force: true});
  quoteTestDir = undefined;
  setTurnStoreFactoryForTest();
  if (turnTestDir) fs.rmSync(turnTestDir, { recursive: true, force: true });
  turnTestDir = undefined;
});

vi.mock('openclaw/plugin-sdk/core', () => ({}));
vi.mock('openclaw/plugin-sdk/config-contracts', () => ({}));
vi.mock('openclaw/plugin-sdk/channel-setup', () => ({
  defineChannelSetupContract: (spec: unknown) => spec,
}));
vi.mock('openclaw/plugin-sdk/channel-config-schema', () => ({
  buildChannelConfigSchema: (schema: unknown) => schema,
}));
vi.mock('openclaw/plugin-sdk/channel-secret-basic-runtime', () => ({
  createSimpleChannelSecretContract: (spec: Record<string, unknown>) => ({
    ...spec,
    secretTargetRegistryEntries: [],
    collectRuntimeConfigAssignments: () => ({}),
  }),
}));
vi.mock('openclaw/plugin-sdk/runtime-store', () => ({
  createPluginRuntimeStore: ({ errorMessage }: { errorMessage: string }) => {
    let runtimeValue: unknown = null;
    return {
      setRuntime: (next: unknown) => {
        runtimeValue = next;
      },
      clearRuntime: () => {
        runtimeValue = null;
      },
      tryGetRuntime: () => runtimeValue,
      getRuntime: () => {
        if (runtimeValue === null) {
          throw new Error(errorMessage);
        }
        return runtimeValue;
      },
    };
  },
}));
vi.mock('openclaw/plugin-sdk/agent-scope-runtime', () => ({
  resolveAgentConfig: () => undefined,
}));
vi.mock('openclaw/plugin-sdk/channel-outbound', () => ({
  createReplyPrefixOptions: () => ({ onModelSelected: () => undefined }),
  createTypingCallbacks: () => ({
    onActive: () => undefined,
    onIdle: () => undefined,
    onCleanup: () => undefined,
  }),
  logTypingFailure: () => undefined,
}));
// Lightweight handler fixtures; tests/core/btw-dispatch.test.ts un-mocks this
// module and exercises the actual minimum Host SDK, including policy hooks.
vi.mock('openclaw/plugin-sdk/reply-runtime', () => ({
  isAbortRequestText: (text: string) => text.trim() === '/stop',
  isBtwRequestText: (text: string) => /^\/btw(?:\s|$)/i.test(text.trim()),
}));
vi.mock('openclaw/plugin-sdk/setup', () => ({
  promptSingleChannelSecretInput: vi.fn(),
}));
vi.mock('openclaw/plugin-sdk/runtime-config-snapshot', () => ({
  getRuntimeConfig: () => ({}),
}));

vi.mock('axios', () => {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    request: vi.fn(),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
    defaults: { headers: { common: {} } },
  };

  return {
    default: {
      create: vi.fn(() => ({ ...mockInstance })),
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
    },
  };
});
