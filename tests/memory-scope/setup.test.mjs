import assert from 'node:assert/strict';
import test from 'node:test';
import { planScope, setupScope, runScopeCli, createScopeCli } from '../../bin/scope-setup.js';

const initial = () => ({
  channels: { 'dingtalk-connector': { enabled: true, clientSecret: 'DO_NOT_PRINT', memoryScope: {} } },
  agents: { entries: { main: { tools: { deny: ['browser'] }, sandbox: { workspaceAccess: 'ro', docker: { binds: ['/docs:/knowledge:ro'] } } }, other: { tools: { allow: ['exec'] } } } },
  skills: { workshop: { autonomous: { mode: 'auto' } } },
  plugins: { slots: { memory: 'memory-core' }, entries: { other: { config: { secret: 'DO_NOT_PRINT' } } } },
});
function merge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    target[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(target[key] ?? {}, value) : value;
  }
  return target;
}
function fixture(config = initial()) {
  const calls = [], output = [];
  const cli = {
    state: structuredClone(config),
    async read() { calls.push('read'); return structuredClone(this.state); },
    async inspect() { calls.push('inspect'); },
    async inspectAgent() { return {}; },
    async validate() { calls.push('validate'); },
    async patch(patch) { calls.push('patch'); merge(this.state, patch); },
    async reload() { calls.push('reload'); return { ok: true, restartRequired: false, runtime: { pluginIds: ['dingtalk-connector'] } }; },
  };
  return { cli, calls, output, io: { log: s => output.push(s), error: s => output.push(s) } };
}

test('read-only plan is focused, preserves sandbox/other Agents/global learning and prints no secrets', async () => {
  const f = fixture(); const before = structuredClone(f.cli.state);
  const plan = await setupScope({ agents: ['main'], learning: true }, f.cli, f.io);
  assert.deepEqual(f.cli.state, before);
  assert.equal(f.calls.includes('patch'), false);
  assert.deepEqual(plan.patch.agents.entries.main.tools.deny, ['browser', 'skill_workshop']);
  assert.equal(plan.patch.agents.entries.other, undefined);
  assert.equal(plan.patch.agents.entries.main.sandbox, undefined);
  assert.equal(plan.patch.skills, undefined);
  assert.equal(plan.globalChanges.length, 2);
  assert.equal(f.output.join('').includes('DO_NOT_PRINT'), false);
});
test('global memory changes require explicit opt-in before any write', async () => {
  const f = fixture();
  await assert.rejects(setupScope({ agents: ['main'], apply: true }, f.cli, f.io), /accept-global-memory-changes/);
  assert.equal(f.calls.includes('patch'), false);
});
test('apply merges selected fields, waits for reload and repeated setup preserves user policy', async () => {
  const f = fixture(); const sandbox = structuredClone(f.cli.state.agents.entries.main.sandbox);
  await setupScope({ agents: ['main'], learning: true, apply: true, acceptGlobalMemoryChanges: true }, f.cli, f.io);
  assert.deepEqual(f.cli.state.agents.entries.main.sandbox, sandbox);
  assert.equal(f.cli.state.plugins.entries.other.config.secret, 'DO_NOT_PRINT');
  assert.equal(f.cli.state.skills.workshop.autonomous.mode, 'auto');
  const after = structuredClone(f.cli.state);
  await setupScope({ apply: true }, f.cli, f.io);
  assert.deepEqual(f.cli.state, after);
  assert.equal(await runScopeCli(['check'], f.io, f.cli), 0);
});
for (const [name, mutate] of [
  ['global plugin deny', c => { c.plugins.deny = ['dingtalk-connector']; }],
  ['plugin allowlist', c => { c.plugins.allow = ['other']; }],
  ['explicit hook denial', c => { c.plugins.entries['dingtalk-connector'] = { hooks: { allowPromptInjection: false } }; }],
  ['scoped tool denial', c => { c.agents.entries.main.tools.deny.push('scoped_memory'); }],
  ['group_sender routing', c => { c.channels['dingtalk-connector'].groupSessionScope = 'group_sender'; }],
]) test(`setup does not override ${name}`, async () => {
  const f = fixture(); mutate(f.cli.state);
  await assert.rejects(setupScope({ agents: ['main'], apply: true, acceptGlobalMemoryChanges: true }, f.cli, f.io), /blocked/);
  assert.equal(f.calls.includes('patch'), false);
});
test('old globally discovered skills require operator migration; workspace profiles are not deleted', async () => {
  const f = fixture(); f.cli.inspectAgent = async () => ({ learnedFiles: true, sharedProfile: true });
  await assert.rejects(setupScope({ agents: ['main'], apply: true }, f.cli, f.io), /blocked/);
  assert.ok(f.output.join('').includes('never moves/deletes'));
  assert.equal(f.calls.includes('patch'), false);
});
test('unsupported schema prevents writes; racing policy changes prevent stale array merges', async () => {
  const f = fixture(); f.cli.validate = async () => { throw Error('unsupported schema'); };
  await assert.rejects(setupScope({ agents: ['main'], apply: true, acceptGlobalMemoryChanges: true }, f.cli, f.io), /schema/);
  assert.equal(f.calls.includes('patch'), false);
  f.cli.validate = async () => { f.cli.state.agents.entries.main.tools.deny.push('exec'); };
  await assert.rejects(setupScope({ agents: ['main'], apply: true, acceptGlobalMemoryChanges: true }, f.cli, f.io), /changed during setup/);
  assert.equal(f.calls.includes('patch'), false);
});
test('saved config is not claimed active after a failed reload', async () => {
  const f = fixture(); f.cli.reload = async () => ({ ok: false });
  await assert.rejects(setupScope({ agents: ['main'], apply: true, acceptGlobalMemoryChanges: true }, f.cli, f.io), /may be saved/);
  assert.equal(f.cli.state.channels['dingtalk-connector'].memoryScope.enabled, true);
});
test('restart-required receipt is reported without restarting the Gateway', async () => {
  const f = fixture(); f.cli.reload = async () => ({ ok: true, restartRequired: true, runtime: { pluginIds: ['dingtalk-connector'] } });
  await setupScope({ agents: ['main'], apply: true, acceptGlobalMemoryChanges: true }, f.cli, f.io);
  assert.ok(f.output.join('').includes('requires a Gateway restart'));
});
test('CLI check cannot apply; missing Agents and empty targets never silently create a target', async () => {
  const f = fixture();
  assert.equal(await runScopeCli(['check', '--apply'], f.io, f.cli), 1);
  assert.throws(() => planScope(initial(), { agents: [] }), /Specify/);
  assert.ok(planScope(initial(), { agents: ['unknown'] }).errors.length);
});
test('adapter uses official patch dry-run and stdin without a shell or full-config write', async () => {
  const calls = [];
  const cli = createScopeCli(async (args, stdin) => { calls.push({ args, stdin }); return { stdout: '{}', stderr: '' }; });
  const patch = { channels: { 'dingtalk-connector': { memoryScope: { enabled: true } } } };
  await cli.validate(patch); await cli.patch(patch); await cli.reload();
  assert.deepEqual(calls[0], { args: ['config', 'patch', '--stdin', '--dry-run'], stdin: JSON.stringify(patch) });
  assert.deepEqual(calls[2].args, ['plugins', 'reload', 'dingtalk-connector', '--wait', '--json']);
});
