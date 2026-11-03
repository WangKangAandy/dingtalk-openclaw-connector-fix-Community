# Scoped memory and learning contract

The filename is retained for existing links. PR18 implements connector-owned data scoping, not a mandatory host sandbox profile. See [setup and configuration ownership](scoped-setup.md) and the [validation ledger](scoped-learning-validation.md).

## Identity and data boundary

- Direct chat: tenant + connector account + Agent + exact native sender ID.
- Group chat: tenant + account + Agent + exact native conversation ID. Members of that group share memory/procedures; the sender is audit attribution.
- Preserve ID case and Unicode. Route with a collision-resistant hash before host session-key normalization. No identity comes from model arguments, nicknames, paths, or parsing a session key.
- Memory and Workshop use the same `ScopeServices`. Foreground tools receive invocation child grants; background review receives a source-derived work grant with an independent host session lease.
- Grants are in-process WeakMap capabilities, not serializable credentials. Recheck them at the final storage operation. Revoke on reset/end, changed authority, cancellation, disposal and task completion.
- SQLite locking and revision CAS protect concurrent changes; immutable Workshop bundles and bounded history provide undo. A final model message is never a storage command.

## Host integration

The supported integration uses the public builtin runner, trusted tool bindings/context v2, final run gate and host-managed background lifecycle. A missing or conflicting binding cannot fall back to unscoped data. No host memory audience is fabricated. ACP/CLI adapters are not declared compatible merely because they offer tools; their capability propagation needs separate proof.

The connector excludes unscoped USER/MEMORY bootstrap data from applicable DingTalk turns and uses only scoped tools for its durable data. The target Agent must deny native `skill_workshop`, preventing native foreground learning and new native background reviews. Existing unscoped learned files require an operator migration/classification decision because disabling automatic learning does not stop discovery.

On the validated release integration, native memory-provider hooks and pre-compaction flush cannot safely be treated as disabled by hiding search tools. `plugins.slots.memory=none` and `agents.defaults.compaction.memoryFlush.enabled=false` are explicit **Gateway-wide** prerequisites. Setup previews those effects and requires additional opt-in to change them. This affects other channels' native memory and must not be described as a target-Agent-only change. Global autonomous learning is not changed.

Configuration/runtime capability errors stop scoped admission with a diagnostic. Ordinary allowed tools do not get a connector-owned static allowlist. The detached reviewer does: only `scoped_skill_workshop` is allowed, with cancellation, tool binding, one-mutation and revision checks. Native shell execution is not required for scoped storage.

## Deployment ownership

Sandbox enablement, backend, scope, `workspaceAccess`, bind mounts, exec/elevated, public knowledge and other tool policies remain OpenClaw configuration. `none`, `ro`, `rw` and public read-only binds are not refused solely by this feature. Context `sandboxed` is not an identity credential and is not a scoped-data prerequisite.

Private plugin state is outside the ordinary agent workspace by default. That location is not a security boundary against arbitrary host processes. An operator must not expose private stores through unrelated tools/mounts when relying on filesystem isolation. This connector guarantees authorization at its own memory/Workshop interfaces, not hostile multi-tenant isolation across every host tool.

Public operator guidance can be shared. Generic file sharing is independent of scoped memory: a public reference directory may be mounted read-only while users retain separate plugin namespaces. Bootstrap injection, copied seed files and live mounts have different semantics.

Automatic media delivery is independent of `memoryScope`; the channel's optional `blockAutomaticMedia` setting can deny it. The custom dispatcher does not gain a new sandbox-export capability in this PR. Existing media paths remain subject to their host/channel deployment trust; a model string is not a new authorization grant.

## Acceptance

Verify private-user/group scope, exact IDs, foreground/background grants, reset/restart/late-callback rejection, CAS and undo. Verify current parent/head behavior using the real handler, Gateway, local model fixture and Docker where applicable. Check host configuration independence with off/none/ro/rw and a read-only knowledge bind, alongside public read-only and private task-write observations. Verify native Workshop exclusion while its global auto setting remains on.

Setup tests must prove read-only planning, explicit global-change opt-in, preserved denies/settings, no old-data deletion, unsupported-schema handling, configuration-race detection, reload failure reporting and restart-required reporting. Live DingTalk authentication/delivery and arbitrary other runtime/plugin compatibility are separate acceptance levels.
