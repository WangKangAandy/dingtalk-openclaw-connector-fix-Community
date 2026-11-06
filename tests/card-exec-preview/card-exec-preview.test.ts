import { afterEach, describe, expect, it, vi } from "vitest";
const writes = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../src/services/messaging/card.ts", () => ({ AICardStatus: { EXECUTING: "4" }, updateAICardParams: writes }));
import { PublicProgress } from "../../src/card-exec-preview/progress.ts";
import { createCardExecPreviewController } from "../../src/card-exec-preview/update.ts";
import { resolveCardExecPreviewConfig } from "../../src/card-exec-preview/types.ts";
import { buildCardExecPreviewHooks } from "../../src/card-exec-preview/attach.ts";
const card = { cardInstanceId: "card", accessToken: "fixture", tokenExpireTime: Infinity, inputingStarted: false };
afterEach(() => { writes.mockReset(); writes.mockResolvedValue(undefined); vi.useRealTimers(); });
const create = (getCard: () => typeof card | null = () => card, config = { cardProcessVar: "process", cardReasoningVar: "summary" }) =>
  createCardExecPreviewController({ config: resolveCardExecPreviewConfig(config), getCard, dingtalkConfig: {} as any });
const last = () => writes.mock.calls.at(-1)?.[1] as any;

describe("public Host progress facts", () => {
  it("keeps one tool row across start, command and item aliases", () => {
    const p = new PublicProgress();
    p.tool({ toolCallId: "tool", name: "exec", phase: "start" });
    p.item({ itemId: "item", toolCallId: "tool", name: "exec", phase: "start" });
    p.command({ itemId: "item", phase: "end", exitCode: 0 });
    expect(p.text()).toBe("命令执行 · 已完成"); expect(p.summary()).toBe("已完成 1");
  });
  it("merges separately observed item/tool identifiers when the Host links them", () => {
    const p = new PublicProgress();
    p.tool({ toolCallId: "a", name: "read" }); p.item({ itemId: "b", name: "read", status: "completed" });
    p.item({ itemId: "b", toolCallId: "a", name: "read", phase: "start" });
    expect(p.text()).toBe("文件读取 · 已完成");
  });
  it.each([undefined, null])("an end without a result is unknown (exitCode=%s)", exitCode => {
    const p = new PublicProgress(); p.command({ itemId: "c", phase: "start" });
    p.command({ itemId: "c", phase: "end", exitCode });
    expect(p.text()).toBe("命令执行 · 已结束，结果未确认");
  });
  it.each([[0, "已完成"], [1, "失败"], [-1, "失败"]])("interprets a known command exit code %s", (exitCode, status) => {
    const p = new PublicProgress(); p.command({ itemId: "c", phase: "end", exitCode: exitCode as number });
    expect(p.text()).toBe(`命令执行 · ${status}`);
  });
  it("does not expose any arbitrary name, ID, command, output, plan or reasoning", () => {
    const p = new PublicProgress();
    p.tool({ toolCallId: "PRIVATE-ID", name: "arbitrary SECRET name", args: { token: "SECRET" } } as any);
    p.command({ itemId: "PRIVATE-CMD", title: "curl --token SECRET", output: "SECRET", cwd: "SECRET" } as any);
    p.plan();
    expect(p.text()).not.toMatch(/SECRET|PRIVATE|curl/);
    expect(p.text()).toContain("工具调用"); expect(p.text()).toContain("命令执行");
  });
  it("accepts a later confirmed result after an unconfirmed end, but not a late start", () => {
    const p = new PublicProgress(); p.command({ itemId: "a", phase: "end" });
    p.command({ itemId: "a", phase: "start" }); expect(p.text()).toContain("结果未确认");
    p.command({ itemId: "a", phase: "end", exitCode: 0 }); expect(p.text()).toBe("命令执行 · 已完成");
  });
  it.each(["__proto__", "constructor", "toString"])("does not treat inherited property %s as a public tool label", name => {
    const p = new PublicProgress(); p.tool({ toolCallId: 'a', name });
    expect(p.text()).toBe('工具调用 · 执行中');
  });
  it("respects suppression on linked events and clears already shown progress", () => {
    const p = new PublicProgress();
    p.tool({ toolCallId: "a", name: "read" });
    p.item({ itemId: "b", toolCallId: "a", hideFromChannelProgress: true });
    p.command({ itemId: "b", phase: "end", exitCode: 0 });
    expect(p.text()).toBe("");
    p.item({ suppressChannelProgress: true }); p.tool({ toolCallId: "unrelated", name: "exec" });
    expect(p.text()).toBe("");
  });
  it("never overwrites a terminal tool with a late running or conflicting result", () => {
    const p = new PublicProgress(); p.item({ itemId: "a", name: "read", status: "failed" });
    p.item({ itemId: "a", name: "read", status: "running" });
    p.item({ itemId: "a", status: "completed" }); p.finish();
    expect(p.text()).toBe("文件读取 · 失败");
    p.tool({ toolCallId: "late", name: "write" }); expect(p.text()).not.toContain("文件修改");
  });
  it.each(["ended", "failed", "cancelled"] as const)("settles pending tools as %s without changing confirmed results", outcome => {
    const p = new PublicProgress(); p.tool({ toolCallId: "a", name: "read" });
    p.item({ toolCallId: "b", name: "write", status: "completed" }); p.finish(outcome);
    expect(p.text()).toContain("文件修改 · 已完成"); expect(p.text()).not.toContain("执行中");
    expect(p.text()).toContain(outcome === "ended" ? "结果未确认" : outcome === "failed" ? "失败" : "已取消");
  });
  it("does not infer a successful tool execution from an approval decision", () => {
    const p = new PublicProgress(); p.approval({ approvalId: "a", phase: "pending" });
    expect(p.text()).toBe("操作审批 · 等待审批");
    p.approval({ approvalId: "a", phase: "update", status: "approved" });
    expect(p.text()).toBe("操作审批 · 审批已响应"); expect(p.summary()).not.toContain("已完成");
  });
  it("bounds retained items and anonymizes ID-less events rather than joining unrelated results", () => {
    const p = new PublicProgress(); p.tool({ name: "read" }); p.tool({ name: "read", status: "completed" });
    expect(p.text()).toBe("文件读取 · 执行中");
    for (let i = 0; i < 1000; i++) p.tool({ toolCallId: String(i), name: "read" });
    expect(p.text().split("\n")).toHaveLength(9); expect(p.text()).toContain("仅展示最近");
    expect(p.summary()).toBe("执行中 128");
  });
});

describe("card projection lifecycle", () => {
  it("does not subscribe to raw reasoning or tool result hooks", () => {
    const config = resolveCardExecPreviewConfig({ cardProcessVar: "process", cardReasoningVar: "summary" });
    const controller = create(); const hooks = buildCardExecPreviewHooks({ config, controller });
    expect(hooks.onToolStart).toBe(controller.onToolStart); expect(hooks.onItemEvent).toBe(controller.onItemEvent);
    expect(hooks.onApprovalEvent).toBe(controller.onApprovalEvent);
    expect(hooks.onReasoningStream).toBeUndefined(); expect(hooks.onToolResult).toBeUndefined();
  });
  it("does not emit an executing status for empty, hidden or invalid events", async () => {
    const c = create(); c.onToolStart(null as any); c.onItemEvent({ itemId: 'hidden', hideFromChannelProgress: true });
    await c.markClosed(); expect(writes).not.toHaveBeenCalled();
  });
  it("flushes tools buffered before card creation without waiting for a model answer", () => {
    let target: typeof card | null = null; const c = create(() => target);
    c.onToolStart({ toolCallId: "a", name: "read" }); expect(writes).not.toHaveBeenCalled();
    target = card; c.onCardReady(card);
    expect(last().params.process).toBe("文件读取 · 执行中"); expect(last().flowStatus).toBe("4");
  });
  it("schedules the latest throttled state even when no further event arrives", async () => {
    vi.useFakeTimers(); const c = create();
    c.onToolStart({ toolCallId: "a", name: "read" });
    c.onItemEvent({ toolCallId: "a", status: "completed" });
    expect(writes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(last().params.process).toBe("文件读取 · 已完成");
    expect(last().flowStatus).toBeUndefined();
    await c.markClosed();
  });
  it("flushes a final state before returning, cancels timers and rejects late events", async () => {
    vi.useFakeTimers(); const c = create();
    c.onToolStart({ toolCallId: "a", name: "exec" }); c.onToolStart({ toolCallId: "b", name: "read" });
    await c.markClosed("cancelled");
    expect(last().params.process).toContain("已取消"); expect(last().params.summary).toBe("已取消 2");
    const count = writes.mock.calls.length;
    c.onCommandOutput({ itemId: "late", phase: "start" }); await c.markClosed("failed");
    await vi.advanceTimersByTimeAsync(3000); expect(writes).toHaveBeenCalledTimes(count);
  });
  it("never reverts body flowStatus to EXECUTING after content started", async () => {
    const c = create(); c.prepareContentStream(card);
    c.onToolStart({ toolCallId: "a", name: "read" }); await c.markClosed();
    expect(writes.mock.calls.every(call => !(call[1] as any).flowStatus)).toBe(true);
    expect(last().params.process).toContain("结果未确认");
  });
  it("does not throw or repeat a tool when the progress projection fails", async () => {
    const c = create(); c.onToolStart({ toolCallId: "a", name: "read" });
    writes.mockRejectedValueOnce(new Error('private service diagnostic'));
    await expect(c.markClosed()).resolves.toBeUndefined();
    expect(writes).toHaveBeenCalledTimes(2);
  });
  it("maps tool/reasoning template variables to public facts and rejects collisions", () => {
    expect(resolveCardExecPreviewConfig({ cardToolVar: "tool" })).toEqual({ enabled: true, processVar: "tool" });
    expect(resolveCardExecPreviewConfig({ cardReasoningVar: "summary" })).toEqual({ enabled: true, summaryVar: "summary" });
    expect(resolveCardExecPreviewConfig({})).toEqual({ enabled: false });
    for (const config of [{ cardProcessVar: "msgContent" }, { cardProcessVar: "like" }, { cardReasoningVar: "flowStatus" },
      { cardProcessVar: "shared", cardReasoningVar: "shared" }, { cardProcessVar: "body", cardContentVar: "body" }]) {
      expect(() => resolveCardExecPreviewConfig(config)).toThrow(/distinct/);
    }
    expect(() => resolveCardExecPreviewConfig({ cardProcessVar: 'x'.repeat(129) })).toThrow(/invalid/);
  });
});
