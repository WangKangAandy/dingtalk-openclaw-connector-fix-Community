import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DingtalkConfigSchema } from "../../src/config/schema.ts";
import { createOrgEventListener } from "../../src/org-events/dispatcher.ts";
import { DeliveryStore, deliveryKey } from "../../src/org-events/idempotency.ts";
import { attachOrgEvents } from "../../src/org-events/index.ts";
import { parseOrgEventFrame, parseUserAddOrg } from "../../src/org-events/parse.ts";
import {
  ensureOnboardingContent,
  onboardingDir,
  readOnboardingEnabled,
  renderOnboardingTemplate,
} from "../../src/org-events/template.ts";

const tmpDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "org-events-"));
  tmpDirs.push(dir);
  return dir;
}

function enableOnboarding(stateDir: string): void {
  const dir = onboardingDir(stateDir);
  ensureOnboardingContent(dir);
  fs.writeFileSync(path.join(dir, "settings.json"), `${JSON.stringify({ enabled: true }, null, 2)}\n`);
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("org-events content", () => {
  it("seeds the editable copies once and leaves later edits in place", () => {
    const stateDir = tempDir();
    const dir = onboardingDir(stateDir);
    ensureOnboardingContent(dir);
    expect(readOnboardingEnabled(dir)).toBe(false);
    expect(fs.existsSync(path.join(dir, "new-employee.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "city-contacts.png"))).toBe(true);

    fs.writeFileSync(path.join(dir, "new-employee.md"), "嗨，{{name}}，自定义文案");
    fs.writeFileSync(path.join(dir, "settings.json"), `${JSON.stringify({ enabled: true })}\n`);
    ensureOnboardingContent(dir);
    expect(fs.readFileSync(path.join(dir, "new-employee.md"), "utf8")).toBe("嗨，{{name}}，自定义文案");
    expect(readOnboardingEnabled(dir)).toBe(true);
  });

  it("rejects orgEvents on the channel schema", () => {
    expect(() => DingtalkConfigSchema.parse({ orgEvents: { enabled: true } })).toThrow();
  });
});

describe("org-events parse and template", () => {
  it("reads user ids from the common payload shapes", () => {
    expect(parseUserAddOrg({ UserId: ["u1", "u2"], name: "Ada" })).toEqual({
      userIds: ["u1", "u2"],
      name: "Ada",
    });
    expect(parseUserAddOrg({ userId: ["u3"] }).userIds).toEqual(["u3"]);
  });

  it("parses a stream frame", () => {
    const frame = parseOrgEventFrame({
      headers: { eventType: "user_add_org", eventId: "evt-1" },
      data: JSON.stringify({ userId: "staff-9", name: "宁" }),
    });
    expect(frame).toMatchObject({
      eventType: "user_add_org",
      eventId: "evt-1",
      userIds: ["staff-9"],
      name: "宁",
    });
  });

  it("fills the name and drops an empty greeting comma", () => {
    expect(renderOnboardingTemplate("嗨，{{name}}，欢迎新同学", { name: "宁" })).toBe("嗨，宁，欢迎新同学");
    expect(renderOnboardingTemplate("嗨，{{name}}，欢迎新同学", {})).toBe("嗨，欢迎新同学");
  });
});

describe("org-events delivery", () => {
  it("sends once and skips a duplicate event", async () => {
    const dir = tempDir();
    enableOnboarding(dir);
    const send = vi.fn(async () => undefined);
    const store = new DeliveryStore(path.join(dir, "acc.json"));
    const listener = createOrgEventListener({
      accountId: "acc",
      stateDir: dir,
      store,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      send,
    });

    const message = {
      headers: { eventType: "user_add_org", eventId: "evt-1" },
      data: JSON.stringify({ userId: "staff-1", name: "宁" }),
    };
    expect(listener(message)).toEqual({ status: "SUCCESS" });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0]).toMatchObject({
      userId: "staff-1",
      title: "新人指引",
    });
    expect(send.mock.calls[0][0].content).toContain("宁");
    expect(send.mock.calls[0][0].content).toContain("入职指引清单");
    expect(send.mock.calls[0][0].content).toContain("问题反馈");
    expect(send.mock.calls[0][0].content).toMatch(/city-contacts\.png/);

    listener(message);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.claim(deliveryKey("user_add_org", "evt-1", "staff-1"))).toBe(false);
  });

  it("sends the document chosen in settings", async () => {
    const dir = tempDir();
    enableOnboarding(dir);
    const onboarding = onboardingDir(dir);
    fs.writeFileSync(path.join(onboarding, "extra.md"), "嗨，{{name}}，另一份指引");
    fs.writeFileSync(
      path.join(onboarding, "settings.json"),
      `${JSON.stringify({ enabled: true, document: "extra.md" }, null, 2)}\n`,
    );
    const send = vi.fn(async () => undefined);
    const listener = createOrgEventListener({
      accountId: "acc",
      stateDir: dir,
      store: new DeliveryStore(path.join(dir, "acc.json")),
      send,
    });
    listener({
      headers: { eventType: "user_add_org", eventId: "evt-pick" },
      data: JSON.stringify({ userId: ["staff-3"], name: "宁" }),
    });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0].content).toBe("嗨，宁，另一份指引");
  });

  it("sends the edited onboarding document", async () => {
    const dir = tempDir();
    enableOnboarding(dir);
    fs.writeFileSync(path.join(onboardingDir(dir), "new-employee.md"), "嗨，{{name}}，改过的指引");
    const send = vi.fn(async () => undefined);
    const listener = createOrgEventListener({
      accountId: "acc",
      stateDir: dir,
      store: new DeliveryStore(path.join(dir, "acc.json")),
      send,
    });

    listener({
      headers: { eventType: "user_add_org", eventId: "evt-edit" },
      data: JSON.stringify({ userId: ["staff-2"], name: "宁" }),
    });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0].content).toBe("嗨，宁，改过的指引");
  });

  it("fills the greeting from the directory when the event has only userId", async () => {
    const dir = tempDir();
    enableOnboarding(dir);
    const send = vi.fn(async () => undefined);
    const listener = createOrgEventListener({
      accountId: "acc",
      stateDir: dir,
      store: new DeliveryStore(path.join(dir, "acc.json")),
      lookupName: async () => "Andy Wang",
      send,
    });

    listener({
      headers: { eventType: "user_add_org", eventId: "evt-name" },
      data: JSON.stringify({ userId: ["643274850"] }),
    });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0].content).toContain("嗨，Andy Wang，欢迎新同学加入MT大家庭");
    expect(send.mock.calls[0][0].content).toContain("[HR制度](https://alidocs.dingtalk.com/i/desktop/folders/2MObva6QBXJwO2ymKYeUmJn4qY5Pr0y1)");
    expect(send.mock.calls[0][0].content).toContain("问题反馈");
    expect(send.mock.calls[0][0].content).toMatch(/!\[[^\]]*\]\([^)]*city-contacts\.png\)/);
    expect(send.mock.calls[0][0].content).not.toContain("](./city-contacts.png)");
  });

  it("does not send when onboarding is off", async () => {
    const dir = tempDir();
    const send = vi.fn(async () => undefined);
    const listener = createOrgEventListener({
      accountId: "acc",
      stateDir: dir,
      store: new DeliveryStore(path.join(dir, "acc.json")),
      send,
    });

    listener({
      headers: { eventType: "user_add_org", eventId: "evt-off" },
      data: JSON.stringify({ userId: ["staff-1"] }),
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(send).not.toHaveBeenCalled();
    expect(readOnboardingEnabled(onboardingDir(dir))).toBe(false);
  });

  it("registers a listener and keeps the event subscription", () => {
    const client = {
      config: {
        subscriptions: [
          { type: "EVENT", topic: "*" },
          { type: "CALLBACK", topic: "/v1.0/im/bot/messages/get" },
        ],
      },
      registerAllEventListener: vi.fn(),
    };
    attachOrgEvents({
      client,
      accountId: "acc",
      stateDir: tempDir(),
      send: vi.fn(async () => undefined),
    });
    expect(client.registerAllEventListener).toHaveBeenCalledTimes(1);
    expect(client.config.subscriptions.some((item) => item.type === "EVENT")).toBe(true);
  });
});
