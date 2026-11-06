import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCheckAndMarkDingtalkMessage = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerDebug = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());

class FakeSocket extends EventEmitter {
  readyState = 1;
  ping = vi.fn();
}

class FakeDWClient extends EventEmitter {
  static nextConnectError: any = null;
  static latestInstance: FakeDWClient | null = null;
  socket = new FakeSocket();
  callback: ((res: any) => Promise<void>) | null = null;
  disconnect = vi.fn(async () => undefined);
  connect = vi.fn(async () => {
    if (FakeDWClient.nextConnectError) {
      const err = FakeDWClient.nextConnectError;
      FakeDWClient.nextConnectError = null;
      throw err;
    }
    return undefined;
  });
  socketCallBackResponse = vi.fn();
  registerCallbackListener = vi.fn((_: string, cb: any) => {
    this.callback = cb;
  });
  constructor(_: any) {
    super();
    FakeDWClient.latestInstance = this;
  }
}

vi.mock("dingtalk-stream", () => ({
  DWClient: FakeDWClient,
  TOPIC_ROBOT: "topic_robot",
  TOPIC_CARD: "topic_card",
}));

vi.mock("../../src/utils/utils-legacy.ts", () => ({
  checkAndMarkDingtalkMessage: mockCheckAndMarkDingtalkMessage,
}));

vi.mock("../../src/utils/logger.ts", () => ({
  createLoggerFromConfig: () => ({
    info: mockLoggerInfo,
    debug: mockLoggerDebug,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  }),
}));

describe("core/connection", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    FakeDWClient.nextConnectError = null;
    FakeDWClient.latestInstance = null;
    // 默认首次处理：返回 false（未重复）
    mockCheckAndMarkDingtalkMessage.mockReturnValue(false);
  });

  function createOpts(overrides?: Partial<any>) {
    const account = {
      accountId: "acc-1",
      clientId: "1234567890",
      clientSecret: "abcdefghij",
      config: { debug: false },
    };
    return {
      cfg: {} as any,
      account: { ...account, ...(overrides?.account ?? {}) },
      runtime: {
        log: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      abortSignal: overrides?.abortSignal,
      messageHandler: overrides?.messageHandler ?? vi.fn(async () => undefined),
      onStatusChange: overrides?.onStatusChange,
    };
  }

  it("throws when credentials are missing", async () => {
    const { monitorSingleAccount } = await import("../../src/core/connection");
    await expect(
      monitorSingleAccount(
        createOpts({
          account: { clientId: "", clientSecret: "" },
        }),
      ),
    ).rejects.toThrow("Missing credentials");
  });

  it("throws when credentials format is too short", async () => {
    const { monitorSingleAccount } = await import("../../src/core/connection");
    await expect(
      monitorSingleAccount(
        createOpts({
          account: { clientId: "123", clientSecret: "456" },
        }),
      ),
    ).rejects.toThrow("Invalid credentials format");
  });

  it("handles message callback and resolves on abort", async () => {
    const { monitorSingleAccount } = await import("../../src/core/connection");
    const controller = new AbortController();
    const messageHandler = vi.fn(async () => undefined);

    const running = monitorSingleAccount(
      createOpts({
        abortSignal: controller.signal,
        messageHandler,
      }),
    );

    // DWClient is imported dynamically in connection.ts; allow a few ticks for instantiation.
    let client: FakeDWClient | null = null;
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      client = FakeDWClient.latestInstance;
      if (client) break;
    }
    expect(client).toBeTruthy();

    await client!.callback?.({
      headers: { messageId: "m1" },
      data: JSON.stringify({
        conversationType: "1",
        senderNick: "u",
        senderStaffId: "u1",
        conversationId: "c1",
        msgId: "m1",
        sessionWebhook: "http://webhook",
        text: { content: "hello" },
      }),
    });

    expect(client!.socketCallBackResponse).toHaveBeenCalledWith("m1", { success: true });
    // 协议层去重：首次消息时 checkAndMarkDingtalkMessage 应被调用（传入 accountId + messageId，返回 false）
    expect(mockCheckAndMarkDingtalkMessage).toHaveBeenCalledWith("acc-1", "m1", undefined);    expect(messageHandler).toHaveBeenCalledTimes(1);

    // 模拟重复消息：checkAndMarkDingtalkMessage 返回 true，应跳过处理
    mockCheckAndMarkDingtalkMessage.mockReturnValue(true);
    await client!.callback?.({
      headers: { messageId: "m1" },
      data: JSON.stringify({ sessionWebhook: "http://webhook" }),
    });
    expect(messageHandler).toHaveBeenCalledTimes(1);

    controller.abort();
    await running;
    expect(client!.disconnect).toHaveBeenCalled();
  });

  it("rejects (not unhandled) when connect() fails", async () => {
    const { monitorSingleAccount } = await import("../../src/core/connection");
    FakeDWClient.nextConnectError = new Error("connection refused");

    await expect(
      monitorSingleAccount(createOpts()),
    ).rejects.toThrow("Failed to connect to DingTalk Stream: connection refused");
  });

  it("rejects with 400 message when connect() fails with status 400", async () => {
    const { monitorSingleAccount } = await import("../../src/core/connection");
    const err = new Error("Request failed with status code 400");
    (err as any).response = { status: 400, data: { message: "invalid_client" } };
    FakeDWClient.nextConnectError = err;

    await expect(
      monitorSingleAccount(createOpts()),
    ).rejects.toThrow("Bad Request (400)");
  });

  async function withSockets(run: (args: { client: FakeDWClient; controller: AbortController; status: ReturnType<typeof vi.fn> }) => Promise<void>) {
    const { monitorSingleAccount } = await import("../../src/core/connection");
    const initialListeners = new Map(['exit', 'SIGINT', 'SIGTERM'].map(name => [name, new Set(process.listeners(name))]));
    const controller = new AbortController(), status = vi.fn();
    const running = monitorSingleAccount(createOpts({ abortSignal: controller.signal, onStatusChange: status }));
    await vi.waitFor(() => expect(status).toHaveBeenCalledWith(expect.objectContaining({ connected: true })));
    const client = FakeDWClient.latestInstance!;
    client.connect.mockImplementation(async () => { client.socket = new FakeSocket(); });
    status.mockClear(); vi.useFakeTimers();
    try { await run({ client, controller, status }); }
    finally {
      controller.abort(); await running; vi.useRealTimers();
      for (const [name, previous] of initialListeners) for (const listener of process.listeners(name)) {
        if (!previous.has(listener)) process.removeListener(name, listener as any);
      }
    }
  }
  it("ignores old socket close and SYSTEM disconnect after replacement", async () => {
    await withSockets(async ({ client, status }) => {
      const old = client.socket;
      old.emit('message', JSON.stringify({ type: 'SYSTEM', headers: { topic: 'disconnect' } }));
      await vi.advanceTimersByTimeAsync(0);
      const current = client.socket; expect(current).not.toBe(old);
      status.mockClear(); client.disconnect.mockClear();
      old.emit('close', 1006, 'late');
      old.emit('message', JSON.stringify({ type: 'SYSTEM', headers: { topic: 'disconnect' } }));
      old.emit('pong'); await vi.advanceTimersByTimeAsync(0);
      expect(client.connect).toHaveBeenCalledTimes(2);
      expect(client.disconnect).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalled();
      expect(client.socket).toBe(current);
    });
  });
  it("rechecks queued close work after another reconnect replaced its socket", async () => {
    await withSockets(async ({ client, status }) => {
      const old = client.socket;
      old.emit('message', JSON.stringify({ type: 'SYSTEM', headers: { topic: 'disconnect' } }));
      old.readyState = 3; old.emit('close', 1006);
      // Drain microtasks without the queued close timer.
      for (let i = 0; i < 12; i++) await Promise.resolve();
      const current = client.socket; expect(current).not.toBe(old);
      status.mockClear(); client.disconnect.mockClear();
      await vi.advanceTimersByTimeAsync(0);
      expect(client.connect).toHaveBeenCalledTimes(2);
      expect(client.disconnect).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalled();
      expect(client.socket).toBe(current);
    });
  });
  it("still reconnects once for a current close and attaches listeners to the replacement", async () => {
    await withSockets(async ({ client, status }) => {
      const old = client.socket; old.readyState = 3; old.emit('close', 1012);
      expect(status).toHaveBeenCalledWith({ connected: false });
      await vi.advanceTimersByTimeAsync(0);
      expect(client.connect).toHaveBeenCalledTimes(2);
      expect(client.socket.listenerCount('close')).toBe(1);
      expect(client.socket.listenerCount('pong')).toBe(1);
      client.socket.readyState = 3; client.socket.emit('close', 1012);
      await vi.advanceTimersByTimeAsync(0);
      expect(client.connect).toHaveBeenCalledTimes(3);
    });
  });
  it("does not reconnect a queued close after abort", async () => {
    await withSockets(async ({ client, controller }) => {
      client.socket.readyState = 3; client.socket.emit('close', 1006);
      controller.abort(); await vi.advanceTimersByTimeAsync(0);
      expect(client.connect).toHaveBeenCalledTimes(1);
    });
  });
  it("does not duplicate lifecycle listeners when the SDK retains its socket object", async () => {
    await withSockets(async ({ client }) => {
      const socket = client.socket;
      client.connect.mockImplementation(async () => {});
      socket.emit('message', JSON.stringify({ type: 'SYSTEM', headers: { topic: 'disconnect' } }));
      await vi.advanceTimersByTimeAsync(0);
      expect(client.connect).toHaveBeenCalledTimes(2);
      expect(socket.listenerCount('close')).toBe(1); expect(socket.listenerCount('message')).toBe(1); expect(socket.listenerCount('pong')).toBe(1);
    });
  });
  it("does not publish online or leave a newly opened socket after an in-flight reconnect is aborted", async () => {
    await withSockets(async ({ client, controller, status }) => {
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      client.connect.mockImplementation(async () => { await pending; client.socket = new FakeSocket(); });
      client.socket.emit('message', JSON.stringify({ type: 'SYSTEM', headers: { topic: 'disconnect' } }));
      for (let i = 0; i < 6; i++) await Promise.resolve();
      expect(client.connect).toHaveBeenCalledTimes(2);
      controller.abort(); const prior = client.disconnect.mock.calls.length;
      release(); await vi.advanceTimersByTimeAsync(0);
      expect(client.disconnect.mock.calls.length).toBe(prior + 1);
      expect(status).not.toHaveBeenCalledWith(expect.objectContaining({ connected: true }));
    });
  });
});
