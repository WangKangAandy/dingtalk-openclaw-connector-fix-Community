import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

// Load the built package and the real pinned OpenClaw SDK; no Vitest module mocks.
test('built connector loads the real SDK without registering a learning engine', async t => {
  t.diagnostic(`Node ${process.version}, ${process.platform}/${process.arch}, require(esm)=${process.features.require_module}`)
  assert.equal(process.features.require_module, true,
    'The OpenClaw schema loader requires synchronous require(esm). Use the supported Node version without --no-experimental-require-module.')
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-package-'))
  const hooks = new Map()
  let tool
  const warnings = []
  try {
    const { default: register } = await import('../../dist/index.mjs')
    const config = { agents: { defaults: { workspace } },
      skills: { workshop: { autonomous: { mode: 'off' } } },
      channels: { 'dingtalk-connector': { memoryScope: { enabled: false } } } }
    register({ config, runtime: {}, source: 'scoped-package-smoke',
      logger: { info() {}, warn(message) { warnings.push(message) }, error() {}, debug() {} },
      registerChannel() {}, registerGatewayMethod() {}, registerHook() {},
      registerTool(factory, options) { tool = { factory, options } },
      on(name, callback, options) { hooks.set(name, [...(hooks.get(name) ?? []), { callback, options }]) },
    })
    assert.equal(tool, undefined)
    const manifest = JSON.parse(fs.readFileSync(new URL('../../openclaw.plugin.json', import.meta.url), 'utf8'))
    assert.equal(manifest.contracts.tools.includes('scoped_skill_workshop'), false)
    assert.equal(manifest.contracts.tools.includes('skill_workshop'), false)
    const replacement = JSON.parse(fs.readFileSync(new URL('../../plugins/scoped-workshop/openclaw.plugin.json', import.meta.url), 'utf8'))
    assert.deepEqual(replacement.contracts.tools, ['skill_workshop'])
    assert.equal(replacement.agentSkillsDir, undefined, 'Do not globally discover all private scopes')
  } finally {
    for (const hook of hooks.get('gateway_stop') ?? []) hook.callback({})
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})
