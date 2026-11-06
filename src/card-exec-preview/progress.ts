/** A projection of public Host events. Does not run tools or decide approvals. */
export type ProgressOutcome = "ended" | "failed" | "cancelled";
type Status = "running" | "completed" | "failed" | "cancelled" | "ended" | "waiting" | "resolved";
export type PublicProgressEvent = {
  itemId?: string; toolCallId?: string; approvalId?: string;
  name?: string; kind?: string; phase?: string; status?: string; exitCode?: number | null;
  hideFromChannelProgress?: boolean; suppressChannelProgress?: boolean;
};
type Item = { label: string; status: Status; kind: "tool" | "approval" | "plan" };
const MAX_ITEMS = 128;
const SHOWN_ITEMS = 8;
const statusText: Record<Status, string> = {
  running: "执行中", completed: "已完成", failed: "失败", cancelled: "已取消",
  ended: "已结束，结果未确认", waiting: "等待审批", resolved: "审批已响应",
};
const categories: Record<string, string> = {
  exec: "命令执行", bash: "命令执行", shell: "命令执行", terminal: "命令执行", shell_command: "命令执行",
  run_command: "命令执行", commandexecution: "命令执行", command: "命令执行", process: "命令执行",
  read: "文件读取", read_file: "文件读取", readfile: "文件读取",
  write: "文件修改", edit: "文件修改", apply_patch: "文件修改", write_file: "文件修改", filechange: "文件修改", patch: "文件修改",
  glob: "文件搜索", grep: "文件搜索", search: "文件搜索", list: "文件搜索", ls: "文件搜索",
  web_search: "网页检索", web_fetch: "网页检索", websearch: "网页检索", webfetch: "网页检索",
  agent: "协作 Agent", task: "协作 Agent", delegate_task: "协作 Agent", collabagenttoolcall: "协作 Agent",
  mcptoolcall: "MCP 工具调用", dynamictoolcall: "扩展工具调用",
};
export function publicToolLabel(name?: string, kind?: string): string {
  const value = typeof name === "string" && name.length <= 256 ? name.toLowerCase() : "";
  const type = typeof kind === "string" && kind.length <= 256 ? kind.toLowerCase() : "";
  if (value.startsWith("mcp__")) return "MCP 工具调用";
  return (Object.hasOwn(categories, value) ? categories[value] : undefined)
    || (Object.hasOwn(categories, type) ? categories[type] : undefined) || "工具调用";
}
const id = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 && value.length <= 256
  && !/[\x00-\x1f]/.test(value) ? value : undefined;
const finished = (s: Status) => !["running", "waiting"].includes(s);
function eventStatus(p: PublicProgressEvent, command: boolean): Status {
  const status = typeof p.status === "string" ? p.status.toLowerCase() : "";
  const phase = typeof p.phase === "string" ? p.phase.toLowerCase() : "";
  if ([status, phase].some(s => ["cancelled", "canceled", "aborted", "interrupted"].includes(s))) return "cancelled";
  if ([status, phase].some(s => ["failed", "error", "failure", "denied"].includes(s))) return "failed";
  const ended = [status, phase].some(s => ["end", "ended", "completed", "complete", "done", "success", "succeeded"].includes(s));
  if (command && ended && Number.isInteger(p.exitCode)) return p.exitCode === 0 ? "completed" : "failed";
  if ([status, phase].some(s => ["completed", "complete", "done", "success", "succeeded"].includes(s))) return "completed";
  if (ended) return "ended";
  return "running";
}

export class PublicProgress {
  private items = new Map<string, Item>();
  private aliases = new Map<string, string>();
  private hidden = new Set<string>();
  private sealed = false;
  private saturated = false;
  private muted = false;

  private accept(p: PublicProgressEvent, source: "tool" | "item" | "command" | "approval"): void {
    if (!p || this.sealed || this.muted) return;
    const approval = source === "approval" || p.kind === "approval";
    const keys = approval
      ? [id(p.approvalId)].filter(Boolean).map(k => `approval:${k}`)
      : [id(p.toolCallId) && `tool:${p.toolCallId}`, id(p.itemId) && `item:${p.itemId}`].filter(Boolean) as string[];
    const label = approval ? "操作审批" : source === "command" ? "命令执行" : publicToolLabel(p.name, p.kind);
    // Missing IDs allow only a category-level running indicator, never an
    // association of an arbitrary completion with a previous anonymous call.
    if (!keys.length) {
      if (p.hideFromChannelProgress || p.suppressChannelProgress) {
        this.items.clear(); this.muted = true; return;
      }
      if (eventStatus(p, source === "command") !== "running") return;
      this.put(`anonymous:${label}`, { label, status: approval ? "waiting" : "running", kind: approval ? "approval" : "tool" });
      return;
    }
    const existingKeys = [...new Set(keys.map(k => this.aliases.get(k)).filter(Boolean))] as string[];
    const key = existingKeys[0] ?? keys[0];
    // Host may associate itemId and toolCallId after their initial events.
    // If this joins two displayed rows, preserve any terminal fact over a start.
    for (const duplicate of existingKeys.slice(1)) {
      const a = this.items.get(key), b = this.items.get(duplicate);
      if (b && (!a || !finished(a.status) && finished(b.status))) this.items.set(key, b);
      this.items.delete(duplicate);
      for (const [alias, value] of this.aliases) if (value === duplicate) this.aliases.set(alias, key);
    }
    if (p.hideFromChannelProgress || p.suppressChannelProgress || keys.some(k => this.hidden.has(k))) {
      if (this.hidden.size + keys.length > MAX_ITEMS * 2) { this.items.clear(); this.muted = true; return; }
      for (const k of keys) this.hidden.add(k);
      this.hidden.add(key); this.items.delete(key); return;
    }
    if (this.hidden.has(key)) return;
    if (!this.items.has(key) && this.items.size >= MAX_ITEMS) { this.saturated = true; return; }
    for (const k of keys) {
      if (this.aliases.size >= MAX_ITEMS * 2 && !this.aliases.has(k)) { this.saturated = true; return; }
      this.aliases.set(k, key);
    }
    const previous = this.items.get(key);
    let status = eventStatus(p, source === "command");
    if (approval) {
      const decided = [p.phase, p.status].some(s => ["resolved", "approved", "allowed", "denied", "rejected"].includes(s || ""));
      status = decided ? "resolved" : status === "running" ? "waiting" : status === "completed" ? "ended" : status;
    }
    if (previous && finished(previous.status)
      && !(previous.status === "ended" && ["completed", "failed", "cancelled", "resolved"].includes(status))) return;
    this.put(key, { label: previous?.label === "工具调用" ? label : previous?.label || label, status, kind: approval ? "approval" : "tool" });
  }
  private put(key: string, item: Item) {
    if (!this.items.has(key) && this.items.size >= MAX_ITEMS) { this.saturated = true; return; }
    this.items.set(key, item);
  }
  tool(p: PublicProgressEvent) { this.accept(p, "tool"); }
  item(p: PublicProgressEvent) { this.accept(p, "item"); }
  command(p: PublicProgressEvent) { this.accept(p, "command"); }
  approval(p: PublicProgressEvent) { this.accept(p, "approval"); }
  plan() { if (!this.sealed && !this.muted) this.put("plan", { label: "计划", status: "running", kind: "plan" }); }
  finish(outcome: ProgressOutcome = "ended") {
    if (this.sealed) return;
    this.sealed = true;
    for (const [key, item] of this.items) if (!finished(item.status)) {
      this.items.set(key, { ...item, status: outcome });
    }
  }
  text(): string {
    const items = [...this.items.values()];
    const lines = items.slice(-SHOWN_ITEMS).map(item => `${item.label} · ${statusText[item.status]}`);
    if (items.length > SHOWN_ITEMS || this.saturated) lines.unshift("仅展示最近的执行状态");
    return lines.join("\n");
  }
  summary(): string {
    const items = [...this.items.values()].filter(i => i.kind === "tool");
    if (!items.length) return this.items.size ? "处理状态已更新" : "";
    const counts = new Map<Status, number>();
    for (const item of items) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
    return [...counts].map(([status, count]) => `${statusText[status]} ${count}`).join(" · ");
  }
}
