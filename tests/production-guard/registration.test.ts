import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { registerProductionWriteGuard } from "../../src/production-guard/register.ts"

describe("production write guard registration", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it("blocks DingTalk production writes and leaves non-DingTalk sessions alone", async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "production-guard-register-"))
    tempDirs.push(workspace)
    fs.mkdirSync(path.join(workspace, "knowledge/departments"), { recursive: true })
    const hooks = new Map<string, Function>()
    const api = {
      config: {
        session: { dmScope: "per-account-channel-peer" },
        agents: { defaults: { workspace } },
        channels: {
          "dingtalk-connector": {
            productionWriteGuard: {
              enabled: true,
              paths: ["knowledge/departments"],
            },
          },
        },
      },
      on(name: string, handler: Function) { hooks.set(name, handler) },
      logger: { info() {} },
    }

    registerProductionWriteGuard(api as never)
    const handler = hooks.get("before_tool_call")
    expect(handler).toBeTypeOf("function")
    const blocked = await handler!({ toolName: "write", params: { path: "knowledge/departments/faq.md" } }, {
      sessionKey: "agent:main:dingtalk-connector:default:direct:user-1",
    })
    expect(blocked).toMatchObject({
      block: true,
      blockReason: "该操作涉及生产知识库修改，钉钉机器人不允许直接执行。请通过知识管理后台或正式变更流程处理。",
    })

    const allowed = await handler!({ toolName: "write", params: { path: "tmp/draft.md" } }, {
      sessionKey: "agent:main:telegram:default:direct:user-1",
    })
    expect(allowed).toBeUndefined()
  })
})
