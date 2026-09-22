import os from "node:os"
import path from "node:path"
import fs from "node:fs"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { evaluateProductionWrite } from "../../src/production-guard/policy.ts"

const workspace = path.join(os.tmpdir(), "xiaomo-production-guard-workspace")
const production = "knowledge/departments"
const config = {
  enabled: true,
  paths: [production],
  blockUnknownMutationTools: true,
}
const dingTalkSession = "agent:main:dingtalk-connector:default:direct:user-1"

function evaluate(toolName: string, toolParams: Record<string, unknown>, sessionKey = dingTalkSession) {
  return evaluateProductionWrite({
    toolName,
    toolParams,
    sessionKey,
    workspaceDir: workspace,
    config,
    scopeOptions: { accountIds: ["default"], requireAccountForDirect: true },
  })
}

describe("production write guard", () => {
  beforeAll(() => fs.mkdirSync(path.join(workspace, production), { recursive: true }))
  afterAll(() => fs.rmSync(workspace, { recursive: true, force: true }))

  it("blocks file mutations under configured production paths", () => {
    expect(evaluate("write", { path: `${production}/faq.md` }).action).toBe("block")
    expect(evaluate("edit", { file_path: `${production}/faq.md` }).action).toBe("block")
    expect(evaluate("apply_patch", { path: `${production}/faq.md` }).action).toBe("block")
  })

  it("allows file mutations outside production paths", () => {
    expect(evaluate("write", { path: "tmp/draft.md" }).action).toBe("allow")
  })

  it("blocks production-targeting and unknown command mutations", () => {
    expect(evaluate("exec", { command: `rm ${path.join(workspace, production, "faq.md")}` }).action).toBe("block")
    expect(evaluate("exec", { command: "rm /tmp/draft.md" }).action).toBe("block")
    expect(evaluate("exec", { command: "python update.py" }).action).toBe("block")
    expect(evaluate("exec", {}).action).toBe("block")
    expect(evaluate("musa_sync", { source: production }).action).toBe("block")
  })

  it("allows non-production read commands and read-only sessions", () => {
    expect(evaluate("exec", { command: "ls -la /tmp" }).action).toBe("allow")
    expect(evaluate("exec", { command: "true" }).action).toBe("allow")
    expect(evaluate("exec", { command: `grep -n Site ${production}/faq.md` }).action).toBe("allow")
    expect(evaluate("exec", { command: "echo probe" }).action).toBe("allow")
    expect(evaluate("read", { path: `${production}/faq.md` }).action).toBe("allow")
    expect(evaluate("write", { path: `${production}/faq.md` }, "agent:main:telegram:default:direct:user-1").action).toBe("allow")
  })

  it("allows dws commands while rejecting shell-composed commands", () => {
    expect(evaluate("exec", { command: "dws auth status --format json" }).action).toBe("allow")
    expect(evaluate("exec", { command: "dws calendar list" }).action).toBe("allow")
    expect(evaluate("exec", { command: "dws doc search --query test" }).action).toBe("allow")
  })

  it("fails closed for malformed DingTalk sessions and unsafe write targets", () => {
    expect(evaluate("write", { path: `${production}/faq.md` }, "agent:main:dingtalk-connector").action).toBe("block")
    expect(evaluate("write", {}).action).toBe("block")
  })
})
