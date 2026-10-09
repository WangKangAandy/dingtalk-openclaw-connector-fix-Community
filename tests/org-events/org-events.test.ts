import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DingtalkConfigSchema } from "../../src/config/schema.ts";
import { resolveOrgEventsConfig } from "../../src/org-events/config.ts";
import { createOrgEventListener } from "../../src/org-events/dispatcher.ts";
import { DeliveryStore, deliveryKey } from "../../src/org-events/idempotency.ts";
import { attachOrgEvents } from "../../src/org-events/index.ts";
import { parseOrgEventFrame, parseUserAddOrg } from "../../src/org-events/parse.ts";
import { renderOnboardingTemplate } from "../../src/org-events/template.ts";

const tmpDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "org-events-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("org-events config", () => {
  it("stays off unless enabled", () => {
    const resolved = resolveOrgEventsConfig({});
    expect(resolved.enabled).toBe(false);
    expect(resolved.events.user_add_org?.handler).toBe("onboarding");
  });

  it("keeps the master switch and a single event switch apart", () => {
    const resolved = resolveOrgEventsConfig({
      orgEvents: {
        enabled: true,
        events: { user_add_org: { handler: "onboarding", enabled: false } },
      },
    });
    expect(resolved.enabled).toBe(true);
    expect(resolved.events.user_add_org?.enabled).toBe(false);
  });

  it("merges a JSON event table over the default rule", () => {
    const dir = tempDir();
    const configFile = path.join(dir, "org-events.json");
    fs.writeFileSync(
      configFile,
      JSON.stringify({
        events: {
          user_add_org: { handler: "onboarding", title: "欢迎", enabled: true },
        },
      }),
    );
    const resolved = resolveOrgEventsConfig(
      { orgEvents: { enabled: true, configFile, templatePath: path.join(dir, "custom.md") } },
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.events.user_add_org).toMatchObject({ title: "欢迎", handler: "onboarding" });
    expect(resolved.templatePath).toBe(path.join(dir, "custom.md"));
  });

  it("accepts orgEvents on the channel schema", () => {
    const out = DingtalkConfigSchema.parse({
      orgEvents: {
        enabled: true,
        events: { user_add_org: { handler: "onboarding", title: "新人指引" } },
      },
    });
    expect(out.orgEvents?.enabled).toBe(true);
    expect(out.orgEvents?.events?.user_add_org?.handler).toBe("onboarding");
  });
});

describe("org-events parse and template", () => {
  it("reads user ids from the common payload shapes", () => {
    expect(parseUserAddOrg({ UserId: ["u1", "u2"], name: "Ada" })).toEqual({
      userIds: ["u1", "u2"],
      name: "Ada",
    });
    expect(parseUserAddOrg({ bizData: JSON.stringify({ userId: "u3" }) }).userIds).toEqual(["u3"]);
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

  it("fills placeholders and drops an empty name", () => {
    const source = "你好 {{name}}, 欢迎加入摩尔线程~\n{{userId}}";
    expect(renderOnboardingTemplate(source, { name: "宁", userId: "u1" })).toBe(
      "你好 宁, 欢迎加入摩尔线程~\nu1",
    );
    expect(renderOnboardingTemplate(source, { userId: "u1" })).toBe("你好, 欢迎加入摩尔线程~\nu1");
  });
});

describe("org-events delivery", () => {
  it("sends once and skips a duplicate event", async () => {
    const dir = tempDir();
    const send = vi.fn(async () => undefined);
    const store = new DeliveryStore(path.join(dir, "acc.json"));
    const listener = createOrgEventListener({
      accountId: "acc",
      store,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      send,
      config: resolveOrgEventsConfig(
        {
          orgEvents: {
            enabled: true,
            stateDir: dir,
            events: { user_add_org: { handler: "onboarding", title: "新人指引" } },
          },
        },
      ),
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
    expect(send.mock.calls[0][0].content).toContain("小摩同学");

    listener(message);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.claim(deliveryKey("user_add_org", "evt-1", "staff-1"))).toBe(false);
  });

  it("fills the greeting from the directory when the event has only userId", async () => {
    const dir = tempDir();
    const send = vi.fn(async () => undefined);
    const listener = createOrgEventListener({
      accountId: "acc",
      store: new DeliveryStore(path.join(dir, "acc.json")),
      lookupName: async () => "Andy Wang",
      send,
      config: resolveOrgEventsConfig({
        orgEvents: {
          enabled: true,
          stateDir: dir,
          events: { user_add_org: { handler: "onboarding", title: "新人指引" } },
        },
      }),
    });

    listener({
      headers: { eventType: "user_add_org", eventId: "evt-name" },
      data: JSON.stringify({ userId: ["643274850"] }),
    });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0].content).toContain("你好 Andy Wang, 欢迎加入摩尔线程~");
  });

  it("does not send when the master switch is off", async () => {
    const send = vi.fn(async () => undefined);
    const client = {
      config: { subscriptions: [{ type: "EVENT", topic: "*" }] },
      registerAllEventListener: vi.fn(),
    };
    const result = attachOrgEvents({
      client,
      accountId: "acc",
      channelConfig: { orgEvents: { enabled: false } },
      send,
    });
    expect(result.enabled).toBe(false);
    expect(client.registerAllEventListener).not.toHaveBeenCalled();
    expect(client.config.subscriptions).toEqual([]);
  });

  it("registers a listener when enabled", () => {
    const client = {
      config: {
        subscriptions: [
          { type: "EVENT", topic: "*" },
          { type: "CALLBACK", topic: "/v1.0/im/bot/messages/get" },
        ],
      },
      registerAllEventListener: vi.fn(),
    };
    const result = attachOrgEvents({
      client,
      accountId: "acc",
      channelConfig: { orgEvents: { enabled: true, stateDir: tempDir() } },
      send: vi.fn(async () => undefined),
    });
    expect(result.enabled).toBe(true);
    expect(client.registerAllEventListener).toHaveBeenCalledTimes(1);
    expect(client.config.subscriptions.some((item) => item.type === "EVENT")).toBe(true);
  });
});
