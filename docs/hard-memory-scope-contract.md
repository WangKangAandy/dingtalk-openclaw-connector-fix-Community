# Hard memory scope and scoped learning

Status: implementation in progress; no production rollout or hard-isolation claim yet.
Blocking acceptance result: ordinary registered CLI backends can pass the public sandbox/harness checks and execute on the host. Keep this feature/PR unaccepted until the actual execution route is constrained; see the reproducible CLI gate below.
Base: connector GitHub main b1d393f. Related work: PR #18 scoped learning.

## Product invariants

- Direct chat: private memory and procedures keyed by tenant, connector account, agent and exact native sender ID.
- Group chat: shared group memory and procedures keyed by tenant, account, agent and exact native conversation ID. Sender remains audit attribution, not a group partition.
- Private and group namespaces never implicitly merge. Public guidance is separately deployed, read-only to ordinary runs.
- Never infer permission from a nickname, model argument, session-key parsing, a path, or an identity string converted to lowercase.
- Session identity determines lifetime, not durable memory ownership. Reset revokes old capabilities without deleting authorized durable memory.
- Missing/ambiguous identity, unsupported host capability, cancellation, or changed admission fails closed.

## Shared module contract

`authority.ts` owns the identity tuple, full SHA-256 namespace and in-process grants.
`admitScope` is called ONLY by a verified runtime adapter after channel admission. It does not validate a raw network event itself.
`assertScopeGrant` gates each read, search, list, write and delete. Store operations must recheck at the final synchronous effect/disclosure boundary.
`delegateScope` permits a background task to retain the exact source namespace with narrower operations; source revocation and task cancellation remain effective.
Grants are held in a WeakMap; serialized values and copied objects convey no authority. They are not OpenClaw native MemoryAudience objects and must never be cast into that API.

## Implementation map and acceptance gates

| Layer | Current evidence | Boundary / remaining acceptance |
| --- | --- | --- |
| Identity | Exact ID/Unicode/delimiter tests; actual handler positive and five rejection cases | No live Stream authentication claim |
| Session | Hashed routing, actual host metadata propagation, shared group and case-distinct private turns | In-flight interruption uses captured-grant and host-work tests; no live concurrent Stream claim |
| Memory | Real SQLite CRUD/search/list/delete, reopen, CAS and process contention; full CRUD through actual handler | Literal search; no vector/index parity claim |
| Learning | Actual handler foreground-to-idle-review; same grants; versioned store and cross-process CAS | Real-model samples are bounded evidence, not broad semantic-quality parity |
| Tool boundary | Real read/exec host sentinel rejection; public session exec override rejected after tool creation; restricted runner attack probe | Ordinary CLI host execution bypass reproduced; hard-isolation acceptance fails |
| Context | Foreground/background provider sentinel checks; actual handler USER rejection before provider invocation | Public operator guidance must not contain private facts |
| Lifecycle | Actual host reset/delete cancellation; same-turn /new and idle recall; built-in auto-compaction; disposal regression | Daily boundary has local tests; physical-successor custom engines remain unverified and revoked |
| Existing data | Legacy injection/import removed; new private stores; existing unscoped profile/learned skills refused | No migration or compatibility fallback |
| Media | Real multipart positive control and delayed-callback host-read denial | Sandbox media export and live platform delivery not implemented/verified by these tests |
| Operations | Storage bounds, corruption refusal, deletion/search cleanup and process-crash recovery tests | No production action; latest PR CI must be checked separately |

## Verified building blocks (2026-11-02)

- Authority/admission: 22 Node tests cover exact IDs, shared groups, immutable grants, no model/session-derived authority, source/child lifetime separation, missing host fields, bounded admission capacity, lifecycle rollover and hashed session routing.
- ScopedMemoryStore: ten real SQLite tests, including two simultaneous child processes competing for the same group revision (exactly one commits). Separate namespace databases provide CRUD, literal lexical search, bounded listing, tombstones, monotonic revisions and final-effect authority checks. Restart, corrupt files/schema/metadata/sequence, identity substitution, hardlinks/junctions and resource bounds are covered. This is not yet semantic/vector recall parity.
- Strict TypeScript check passes with official @types/node 24. The repository's previous @types/node 20 does not declare node:sqlite; no handwritten permissive module declaration is used.
- The connector wires trusted ingress to one runtime shared by memory and Workshop. Actual handler/Gateway foreground and automatic-review paths have passed in isolated fixtures; execution-runtime admission remains under review. No production environment was changed.
- Real admission-adapter integration passed six turns on the isolated test host (evidence `/tmp/hard-ingress-probe-h_pvodq_`): Alice writes, Bob and case-distinct alice read no record; two senders share GroupOne, GroupTwo reads no record. A real OpenClaw dispatcher, local scripted provider and per-session Docker containers were used. Native read/exec could not access the host-private sentinel, and no root MEMORY sentinel reached the provider. This first run rebuilt inbound context with the production adapter; it did not yet run the entire message handler or a live DingTalk Stream.
- Full production message-handler integration passed seven turns (`/tmp/hard-ingress-probe-dt21ts58`), including `/new` retaining the user's durable memory. Real Gateway/Docker, handler, tools and reply/card formatting ran; only DingTalk HTTP adapters were substituted. A nonempty shared USER.md was rejected before any provider call. Host `session_end` precedes `before_reset`; both revoke old authority while preserving only the current still-unbound ingress capability. Existing grants are never renewed. Unit regressions additionally reject external resets, already-bound resets, duplicate dispatch and callbacks that inherit async context after dispatch ends.
- Expanded handler integration passed nine turns (`/tmp/hard-ingress-probe-zzz_0xox`): a real one-minute idle rollover emitted `session_end(reason=idle)` and the new turn read the same private memory. Public `sessions.patch` changed `execHost` to `gateway` after ingress and tool construction; the final execution gate refused the native exec before it could read a host sentinel. Normal idle/daily rollover uses the same active, unbound ingress rule as new/reset; daily has local lifecycle coverage, not a wall-clock day-boundary test. Deleted/shutdown/restart/unknown/compaction events do not preserve pending authority.
- Built-in same-turn auto-compaction passed (`/tmp/hard-ingress-probe-obz03c9a`): an injected provider context-overflow response caused actual host summarization and `after_compaction(compactedCount=2)`, followed by a successful scoped read in the same turn. No root memory reached the summary provider. This host path kept its physical session; custom engines that create a physical successor are not covered by this result, and no compaction exception was added to authority revocation.
- Plugin disposal explicitly stops the shared scope services, even without a configuration change or Gateway stop. The regression checks captured memory tools, source grants and background grants all fail after disposal; repeated teardown is harmless.
- Full CRUD through the production handler passed together with built-in compaction (`/tmp/hard-ingress-probe-rlisavb4`, ten positive turns). The scripted provider creates a record, searches and lists it, uses the returned revision to update it, reads that update, deletes using the updated revision, and verifies empty search/list with a retained CAS tombstone. Assertions check actual tool results, increasing revisions and actor attribution. The same run verifies private/group isolation, case-distinct identities, reset recall, and shared USER.md rejection through the actual handler before any provider request. DingTalk HTTP delivery is still substituted.
- Independent multipart tests exercise real filesystem streams and media processors: a positive control proves the old unconfined path can read a file; a hard-scoped dispatcher created in one async context and invoked after reload from another context reads no file and uploads no multipart content. It produces an explicit attachment-not-sent notice. Platform HTTP/card sends are substituted locally.

## Current host configuration and operational boundary

Use the supported host's actual configuration schema. On OpenClaw 2026.10.9, native search is `memory.search`, with overrides at `agents.entries.<id>.memory.search`; `agents.defaults.memorySearch` and `agents.list` are not the current schema. The implementation uses the public SDK config type rather than a permissive substitute.

Hard scope is opt-in. In addition to `channels.dingtalk-connector.memoryScope.enabled: true`, admission requires:

- `plugins.slots.memory: "none"` to stop native memory hooks as well as native tools.
- Effective `memory.search.enabled: false`; `agents.defaults.compaction.memoryFlush.enabled: false`.
- `skills.workshop.autonomous.mode: "off"`; scoped learning is configured independently.
- `agents.defaults.skipOptionalBootstrapFiles` contains `"USER.md"`, and the shared workspace's root `USER.md` is absent or an empty regular file. Skipping template generation alone does not stop the host copying an existing profile into a sandbox. Existing personal profiles are never automatically migrated or reclassified as public guidance.
- Connector conversation/prompt hook permission and internal bootstrap hooks. Root MEMORY/USER and paths beneath memory are excluded from the scoped bootstrap.
- A per-session Docker/Podman sandbox, `workspaceAccess: "none"`, a finite permitted tool list, no additional host mounts, no elevated/host execution, no host browser control, and no host-wide session access. The public host confinement resolver checks the effective policy, including host session overrides; the connector repeats this refusal check before native tool execution.
- No unscoped learned files in that agent's automatically discovered `workshop-skills` directory.

AGENTS, SOUL and IDENTITY are deliberately shared operator guidance, not private memory. Operators must not put private user facts into these public documents. Connector storage remains outside all model-visible sandbox mounts. DWS or other programs must be provisioned through an appropriate sandbox image and separately scoped credentials; mounting the host's shared credential directories is not an accepted shortcut.

The custom reply dispatcher does not currently receive an authorized sandbox media-export reader. Therefore model-authored local paths and automatic attachment payloads do not authorize host reads in hard mode. The connector keeps the text reply and reports that the attachment was not sent. This restriction also applies to deferred callbacks after reload. It does not claim that sandbox media export has been implemented.

`tests/memory-scope/ingress-probe/run.py` supplies a reproducible isolated configuration, creates its own state/workspaces/containers, validates configuration with the real CLI and only cleans containers whose unique prefix and mount match the test directory. It requires an existing `node:22-alpine` image and local test dependencies. Platform delivery, actual Stream authentication and real-model learning quality are separate evidence levels.

To exercise the full handler on that isolated Linux host, first run `node tests/memory-scope/ingress-probe/build.mjs "$PWD/handler-bundle.mjs"`, then `python3 tests/memory-scope/ingress-probe/run.py --handler`. The bundle is test-only and must not be published. Omit `--handler` for the narrower adapter probe. Host SDK imports stay external so the running host supplies the actual contracts.

Add `--lifecycle` to also perform the public session-execution override attack and wait 62 seconds for a real idle rollover. The fixture asserts the actual idle lifecycle event rather than assuming a reset must change `sessionId`; this host can preserve the ID while changing the lifecycle revision.

Add `--compaction` to trigger one provider overflow response after a larger completed turn. The fixture uses the supported `keepRecentTokens: 512` setting, observes a real summary request and the public `after_compaction` event, then verifies the current turn's scoped memory result. It never fabricates a compaction hook or edits the host session database.

### Blocking ordinary CLI route acceptance

Run `python3 tests/memory-scope/ingress-probe/run.py --handler --cli-routing` after rebuilding the handler bundle. This opt-in test registers an ordinary test CLI named `fixture-shell`, explicitly configures its provider runtime as `openclaw`, and dispatches through the production message handler. The CLI only reads the test's own temporary `host-private.txt` and writes its own placement marker. Acceptance requires an explicit hard-scope refusal before any CLI execution or provider request. The test exits nonzero if the marker exists; it is not an expected-failure pass or part of the default green unit-test count.

On the isolated OpenClaw 2026.10.9 host, `/tmp/hard-ingress-probe-i73idp7z` failed this gate: the actual handler returned a completed reply while the CLI read the host sentinel. The public harness resolver returned `openclaw`, subscription dispatch eligibility returned no result, and sandbox authority returned `sandboxed: true, workspaceAccess: none`. A separate adapter/real dispatcher run reproduced it both with and without explicit provider `agentRuntime: {id: "openclaw"}`. Thus neither the harness name nor a negative subscription check proves ordinary CLI confinement.

The host's channel runner independently calls its CLI classifier before executing a candidate. Configuring `openclaw` suppresses an implicit CLI alias but does not suppress a provider that is itself a registered CLI. Public `createSessionEntry` also correctly refuses the connector claiming ownership of the built-in `openclaw` harness; forging session metadata is not a fix. The remaining integration needs a host-owned complete execution-route confinement check or an admitted per-turn runtime restriction, applied to fallback and resumed candidates as well as the initial selection. No production change or private host import was made for this investigation.

## Discovered host lifetime gap — do not weaken the gate

Installed 2026.10.9 runtime inspection shows resolveEmbeddedAttemptMemoryAudience creates an audience only when a native memory provider and admitted session are available. Its attempt finally block calls releaseMemoryAudience. The audience validator rejects a released record, including released ancestors.

Therefore merely retaining HookContext.assertMemoryAudienceCurrent does NOT prove background authorization survives foreground completion. ScopeAdmissions.sourceGrant requires an independent session lease captured through public synchronous getSessionEntry(readConsistency:"latest"). The lease checks exact sessionId and optional lifecycleRevision, archive status and session tool policy; undefined is an exact initial generation, not a wildcard. A reset retaining sessionId still revokes it. Background work uses public runWithWorkAdmission for reset/delete cancellation. services.withSourceWork supplies a child grant bounded by caller and host cancellation and revokes it on completion. Store paths come from public resolveStorePath(config.session.store, {agentId}) with the admitted agent, never a parsed key or tool argument. A real Gateway probe verified initial sessions, reset/delete interruption and old-lease rejection; it used a test-owned grant and does not prove trusted ingress end to end.

Host hook chatId can be derived from the session routing key. With collision-resistant hashed routing it is not necessarily the raw native conversation ID. Preserve the native ID in channel-owned out-of-band metadata and validate it against the immutable admission; do not use a hash-shaped chatId as proof of a platform conversation.

## Host integration investigation

OpenClaw 2026.10.9 tool context includes trusted requesterSenderId, nativeChannelId, agentAccountId and assertInvocationCurrent. Its native memory audience currently represents owner-private or conversation; neither should be fabricated for per-user memory.
First verify existing public context/binding propagation with a real runtime. Add a minimal host API only for gaps proven by runtime evidence. A model-side userId or a session-to-latest-user mutable map is not an acceptable substitute.

Dedicated scoped tools alone do not isolate a process with unrestricted read/exec access to the store. The implementation must enforce a restricted/sandboxed execution boundary or move storage behind a separately authorized service. A prompt or file-path hook is insufficient. Native session memory, background recall and bootstrap need the same scope boundary.

## Required full-flow tests

1. A and B direct chats: independent CRUD/search/list, same key safe, B cannot use A references.
2. A and B in the same group: shared records and procedures with correct author attribution; another group sees neither.
3. Different tenant/account/agent, case-sensitive IDs, colon/slash/underscore and Unicode collisions.
4. Forged userId/scope/path, absent admission, copied grants, stale grants and broadened delegation all rejected.
5. Concurrent group edits use expected revision; stale background result cannot overwrite a foreground correction or undo.
6. Reset, config disable, stop and cancellation invalidate captured capabilities at final read/commit.
7. Restart/reindex preserve namespaces; incomplete/corrupt storage never silently becomes empty storage.
8. Adversarial real runtime tools: native memory, file tools, exec/code mode, sessions, delegation and unknown plugin tools cannot bypass isolation.
9. Memory and learning use the same identity and scope; old files are not implicitly imported or indexed.
10. Test evidence distinguishes unit, real plugin/host integration, model run and real DingTalk delivery. No production deployment in this task.
