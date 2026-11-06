import { expect, it } from "vitest"
import { resolveScopedLearnCommand as resolve } from "../../src/memory-scope/scoped-workshop/learn-command.ts"
const configured = { meta: { migrations: { skillWorkshopPlugin: true } }, plugins: { entries: { "skill-workshop": { enabled: false }, "dingtalk-scoped-workshop": { enabled: true } } } }
it.each(["/learn", "/learn list", "/learn view example", "/learn undo example"])("leaves native %s intact only when the replacement is selected", text => {
  expect(resolve(text, configured)).toBeNull()
  expect(resolve(text, {})).toMatchObject({ kind: "reply", text: expect.stringContaining("未执行") })
})
it("does not select a replacement while the original could still own the tool", () => {
  expect(resolve("/learn", { plugins: { entries: { "dingtalk-scoped-workshop": { enabled: true } } } })).toMatchObject({ kind: "reply" })
  expect(resolve("/learn", { plugins: configured.plugins })).toMatchObject({ kind: "reply" })
})
it.each(["/learner", "please /learn", "/learn/list", "/new", "hello"])("preserves unrelated input %s", text => { expect(resolve(text, {})).toBeNull() })
