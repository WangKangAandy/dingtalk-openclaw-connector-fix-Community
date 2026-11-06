import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

// Load the built package and the real pinned OpenClaw SDK; no Vitest module mocks.
test('built plugin loads the real SDK and refuses learning without trusted scope services', async t => {
  t.diagnostic(`Node ${process.version}, ${process.platform}/${process.arch}, require(esm)=${process.features.require_module}`)
  assert.equal(process.features.require_module, true,
    'The OpenClaw schema loader requires synchronous require(esm). Use the supported Node version without --no-experimental-require-module.')
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-package-'))
  const hooks = new Map()
  const tools = new Map()
  let channel
  const methods = new Map()
  const warnings = []
  try {
    const { default: register } = await import('../../dist/index.mjs')
    const config = { agents: { defaults: { workspace } },
      skills: { workshop: { autonomous: { mode: 'off' } } },
      channels: { 'dingtalk-connector': { memoryScope: { scopedLearning: { enabled: true } } } } }
    register({ config, runtime: {}, source: 'scoped-package-smoke',
      logger: { info() {}, warn(message) { warnings.push(message) }, error() {}, debug() {} },
      registerChannel(value) {channel=value.plugin}, registerGatewayMethod(name,handler,options) {methods.set(name,{handler,options})}, registerHook() {},
      registerTool(factory, options) { tools.set(options?.name,{ factory, options }) },
      on(name, callback, options) { hooks.set(name, [...(hooks.get(name) ?? []), { callback, options }]) },
    })
    assert.equal(tools.has('scoped_skill_workshop'),false)
    assert.equal(tools.has('scoped_memory'),false)
    assert.equal(tools.get('dingtalk_ask_user_question')?.factory.contextVersion,2)
    assert.equal(typeof channel?.approvalCapability?.nativeRuntime?.availability?.isConfigured,'function')
    assert.equal(channel.approvalCapability.authorizeActorAction({cfg:config,accountId:'default',senderId:'unconfigured',approvalKind:'exec',action:'approve'}).authorized,false)
    assert.equal(methods.get('dingtalk-connector.turns.inspect')?.options?.scope,'operator.admin')
    assert.ok(warnings.some(message => message.includes('trusted scope services required')))
    const manifest = JSON.parse(fs.readFileSync(new URL('../../openclaw.plugin.json', import.meta.url), 'utf8'))
    assert.ok(manifest.contracts.tools.includes('scoped_skill_workshop'))
    assert.ok(manifest.contracts.tools.includes('dingtalk_ask_user_question'))
  } finally {
    for (const hook of hooks.get('gateway_stop') ?? []) hook.callback({})
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})
