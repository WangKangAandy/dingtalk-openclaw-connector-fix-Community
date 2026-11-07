import { beforeEach, describe, expect, it, vi } from "vitest";
import { withConversationRun, bindConversationCallbacks, assertConversationOutputActive } from '../../src/core/conversation-run.ts';
import { runTrackedTurn, recordDelivery } from '../../src/turn-state/runtime.ts';
import { registerActiveCard, unregisterActiveCard } from '../../src/services/messaging/card.ts';

const mockSendText = vi.hoisted(() => vi.fn());
const mockSendMedia = vi.hoisted(() => vi.fn());
const mockProbe = vi.hoisted(() => vi.fn());
const mockResolveAccount = vi.hoisted(() => vi.fn());
const mockMonitorProvider = vi.hoisted(() => vi.fn());
const mockHostConfig = vi.hoisted(() => vi.fn());
vi.mock('../../src/runtime.ts',()=>({getDingtalkRuntime:()=>({config:{current:mockHostConfig}})}));

vi.mock("../../src/services/messaging/index.ts", () => ({
  sendTextToDingTalk: mockSendText,
  sendMediaToDingTalk: mockSendMedia,
}));

vi.mock("../../src/probe.ts", () => ({
  probeDingtalk: mockProbe,
}));

vi.mock("../../src/config/accounts.ts", () => ({
  resolveDingtalkAccount: mockResolveAccount,
  resolveDingtalkCredentials: vi.fn(),
  listDingtalkAccountIds: vi.fn().mockReturnValue(["main"]),
  resolveDefaultDingtalkAccountId: vi.fn().mockReturnValue("main"),
}));

vi.mock("../../src/core/provider.ts", () => ({
  monitorDingtalkProvider: mockMonitorProvider,
}));

describe("channel plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAccount.mockReturnValue({
      accountId: "main",
      enabled: true,
      configured: true,
      clientId: "id",
      clientSecret: "secret",
      config: { debug: false, allowFrom: ["user1"], groupPolicy: "open" },
    });
    mockSendText.mockResolvedValue({ ok: true, processQueryKey: "pqk-1" });
    mockSendMedia.mockResolvedValue({ ok: true, processQueryKey: "pqk-media" });
    mockProbe.mockResolvedValue({ ok: true, botName: "bot-1" });
    mockMonitorProvider.mockResolvedValue(undefined);
  });

  it("loads plugin metadata and base capabilities", async () => {
    const { dingtalkPlugin } = await import("../../src/channel");
    const plugin = dingtalkPlugin as any;
    expect(plugin.id).toBe("dingtalk-connector");
    expect(plugin.capabilities.media).toBe(true);
    expect(plugin.meta.label).toBe("DingTalk");
  });

  it("config helpers update account flags", async () => {
    const { dingtalkPlugin } = await import("../../src/channel");
    const plugin = dingtalkPlugin as any;
    const cfg = { channels: { "dingtalk-connector": { accounts: { a1: {} } } } } as any;

    const updatedDefault = plugin.config.setAccountEnabled({
      cfg,
      accountId: "__default__",
      enabled: false,
    });
    const updatedDefaultChannel = updatedDefault.channels["dingtalk-connector"] as any;
    const defaultEnabled =
      updatedDefaultChannel.enabled ??
      updatedDefaultChannel.accounts?.["__default__"]?.enabled;
    expect(defaultEnabled).toBe(false);

    const updatedNamed = plugin.config.setAccountEnabled({
      cfg,
      accountId: "a1",
      enabled: true,
    });
    expect(updatedNamed.channels["dingtalk-connector"].accounts.a1.enabled).toBe(true);
  });

  it("outbound chunker and sendText/sendMedia work", async () => {
    const { dingtalkPlugin } = await import("../../src/channel");
    const plugin = dingtalkPlugin as any;
    const chunks = plugin.outbound.chunker("a\nbb\nccc", 4);
    expect(chunks).toEqual(["a\nbb", "ccc"]);

    const textRes = await plugin.outbound.sendText({
      cfg: {} as any,
      to: "user1",
      text: "hello",
      accountId: "main",
    } as any);
    expect(textRes.messageId).toBe("pqk-1");

    const mediaRes = await plugin.outbound.sendMedia({
      cfg: {} as any,
      to: "user1",
      mediaUrl: "/tmp/a.png",
      text: "hello",
      accountId: "main",
    } as any);
    expect(mediaRes.messageId).toBe("pqk-media");
  });

  it("sendMedia validates required parameters", async () => {
    const { dingtalkPlugin } = await import("../../src/channel");
    const plugin = dingtalkPlugin as any;
    await expect(
      plugin.outbound.sendMedia({
        cfg: {} as any,
        to: "" as any,
        mediaUrl: "/tmp/a.png",
        accountId: "main",
      } as any),
    ).rejects.toThrow("Invalid 'to' parameter");

    await expect(
      plugin.outbound.sendMedia({
        cfg: {} as any,
        to: "user1",
        mediaUrl: "" as any,
        accountId: "main",
      } as any),
    ).rejects.toThrow("Invalid 'mediaUrl' parameter");
  });
  it('sends a Host background reply despite an old active card or closed predecessor context', async () => {
    const { dingtalkPlugin } = await import('../../src/channel');
    const plugin=dingtalkPlugin as any;
    let later!:()=>Promise<any>;
    const send=()=>plugin.outbound.sendText({cfg:{},to:'cid-background',text:'queued answer',accountId:'main'});
    await runTrackedTurn({accountId:'main',botId:'bot',conversationId:'cid-background',senderId:'alice',messageId:'old'},
      ()=>withConversationRun({accountId:'main',sessionKey:'old-session'},async()=>{later=bindConversationCallbacks({send}).send;}));
    registerActiveCard('cid-background',{cardInstanceId:'old-card'} as any);
    mockSendText.mockImplementationOnce(async()=>{
      assertConversationOutputActive();
      return recordDelivery('text',async()=>({ok:true,processQueryKey:'real-receipt'}),()=>true);
    });
    try {
      expect((await later()).messageId).toBe('real-receipt');
      expect(mockSendText).toHaveBeenCalledTimes(1);
    } finally {unregisterActiveCard('cid-background');}
  });
  it('honors the Host signal even when it changes during preparation, and never reports fake success', async () => {
    const {dingtalkPlugin}=await import('../../src/channel');
    const plugin=dingtalkPlugin as any;
    const abort=new AbortController();
    const request={cfg:{},to:'alice',text:'answer',accountId:'main',signal:abort.signal};
    mockSendText.mockImplementationOnce(async()=>{abort.abort(); assertConversationOutputActive(); return {ok:true,processQueryKey:'must-not-send'};});
    await expect(plugin.outbound.sendText(request)).rejects.toMatchObject({name:'AbortError'});
    mockSendText.mockClear();
    await expect(plugin.outbound.sendText(request)).rejects.toMatchObject({name:'AbortError'});
    expect(mockSendText).not.toHaveBeenCalled();
    mockSendText.mockResolvedValueOnce({ok:false});
    await expect(plugin.outbound.sendText({...request,signal:undefined})).rejects.toThrow(/not confirmed/);
    mockSendMedia.mockResolvedValueOnce({ok:true});
    await expect(plugin.outbound.sendMedia({...request,signal:undefined,mediaUrl:'test'})).rejects.toThrow(/not confirmed/);
  });

  it("gateway.startAccount delegates to monitor provider", async () => {
    const { dingtalkPlugin } = await import("../../src/channel");
    const plugin = dingtalkPlugin as any;
    const ctx = {
      cfg: {},
      accountId: "main",
      runtime: { log: { info: vi.fn() } },
      abortSignal: new AbortController().signal,
      setStatus: vi.fn(),
      log: { info: vi.fn(), error: vi.fn() },
    } as any;

    await plugin.gateway.startAccount(ctx);
    expect(mockMonitorProvider).toHaveBeenCalledTimes(1);
    expect(ctx.setStatus).toHaveBeenCalled();
  });
  it("status.probeAccount delegates to probeDingtalk", async () => {
    const { dingtalkPlugin } = await import("../../src/channel");
    const plugin = dingtalkPlugin as any;
    await plugin.status.probeAccount({
      account: { accountId: "main", clientId: "id", clientSecret: "secret" },
    } as any);
    expect(mockProbe).toHaveBeenCalledWith({
      clientId: "id",
      clientSecret: "secret",
      accountId: "main",
    });
  });
});
