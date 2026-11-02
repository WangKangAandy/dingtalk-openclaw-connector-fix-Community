import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

// Load the built package and the real pinned OpenClaw SDK; no Vitest module mocks.
test('built plugin registers the declared scoped tool and authority-gated prompt hook', async t => {
  t.diagnostic(`Node ${process.version}, ${process.platform}/${process.arch}, require(esm)=${process.features.require_module}`)
  assert.equal(process.features.require_module, true,
    'The OpenClaw schema loader requires synchronous require(esm). Use the supported Node version without --no-experimental-require-module.')
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-package-'))
  const hooks = new Map()
  let tool
  try {
    const { default: register } = await import('../../dist/index.mjs')
    const config = { agents: { defaults: { workspace } },
      skills: { workshop: { autonomous: { mode: 'off' } } },
      channels: { 'dingtalk-connector': { memoryScope: { scopedLearning: { enabled: true } } } } }
    register({ config, runtime: {}, source: 'scoped-package-smoke',
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      registerChannel() {}, registerGatewayMethod() {}, registerHook() {},
      registerTool(factory, options) { tool = { factory, options } },
      on(name, callback, options) { hooks.set(name, [...(hooks.get(name) ?? []), { callback, options }]) },
    })
    assert.equal(tool.options.name, 'scoped_skill_workshop')
    assert.equal(tool.factory.contextVersion, 2)
    assert.ok(hooks.get('before_prompt_build').some(hook => hook.options.requiresToolAuthority === true))
    const ctx = { agentId: 'main', sessionKey: 'agent:main:dingtalk-connector:direct:package-user',
      sessionId: 'smoke', workspaceDir: workspace, assertInvocationCurrent() {} }
    const scoped = tool.factory.create(ctx)
    assert.equal(scoped.parameters.type, 'object')
    assert.deepEqual(JSON.parse((await scoped.execute('list', { action: 'list' })).content[0].text), [])
    await scoped.execute('save', { action: 'save', expectedRevision: null, skill: {
      name: 'inspect-request', description: 'Inspect a request trace', body: 'Correlate the trace, verify the failing hop.', files: {},
    } })
    assert.equal(JSON.parse((await scoped.execute('list', { action: 'list' })).content[0].text)[0].name, 'inspect-request')
    const manifest = JSON.parse(fs.readFileSync(new URL('../../openclaw.plugin.json', import.meta.url), 'utf8'))
    assert.ok(manifest.contracts.tools.includes(scoped.name))
  } finally {
    for (const hook of hooks.get('gateway_stop') ?? []) hook.callback({})
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})
