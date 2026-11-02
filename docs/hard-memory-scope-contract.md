# Hard memory scope and scoped learning

Status: implementation in progress; no production rollout or hard-isolation claim yet.
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

| Layer | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Identity | Shared authority and real Gateway admission-adapter mapping preserve native ID case | Full production handler mapping and missing metadata under actual host execution |
| Session | Hashed routing uses exact trusted IDs; shared-private and split-group modes rejected | Real host metadata propagation and steering tests |
| Memory | Separate private SQLite namespaces with revision CAS, tombstones and bounded literal search | Full ingress/host execution and recall behavior |
| Learning | Restricted public runner, same grants, versioned store and cross-process CAS | Actual foreground/background hook chain under hard policy |
| Tool boundary | Host SDK has trusted requester and invocation guard | Actual execution rejection, not just schema filtering; no native search, filesystem, exec, sessions or plugin bypass |
| Context | Legacy injection removed; real foreground provider sentinel checks passed; shared USER profile rejected | Background provider requests and full production handler |
| Lifecycle | Actual host reset/delete interrupt work and invalidate retained leases | Full ingress cancellation and stop cases |
| Existing data | No automatic import, mapping, migration or compatibility fallback | Existing files remain untouched; new scopes begin in private storage |
| Media | Host path uploads blocked; delayed callbacks retain the restriction across reload | Real channel delivery still separate from local callback/file-stream tests |
| Operations | No production action | Bounded resources, corruption failure, deletion/index cleanup, audit without private contents |

## Verified building blocks (2026-11-02)

- Authority/admission: 16 Node tests cover exact IDs, shared groups, immutable grants, no model/session-derived authority, source/child lifetime separation, missing host fields, bounded admission capacity and hashed session routing.
- ScopedMemoryStore: nine real SQLite tests, including two simultaneous child processes competing for the same group revision (exactly one commits). Separate namespace databases provide CRUD, literal lexical search, bounded listing, tombstones, monotonic revisions and final-effect authority checks. Restart, corrupt files, identity substitution, hardlinks/junctions and resource bounds are covered. This is not yet semantic/vector recall parity.
- Strict TypeScript check passes with official @types/node 24. The repository's previous @types/node 20 does not declare node:sqlite; no handwritten permissive module declaration is used.
- The connector now wires trusted ingress to one runtime shared by memory and Workshop. Local handler tests pass; real Gateway ingress is still being validated. No production environment was changed.
- Real admission-adapter integration passed six turns on the isolated test host (evidence `/tmp/hard-ingress-probe-h_pvodq_`): Alice writes, Bob and case-distinct alice read no record; two senders share GroupOne, GroupTwo reads no record. A real OpenClaw dispatcher, local scripted provider and per-session Docker containers were used. Native read/exec could not access the host-private sentinel, and no root MEMORY sentinel reached the provider. This first run rebuilt inbound context with the production adapter; it did not yet run the entire message handler or a live DingTalk Stream.
- Full production message-handler integration passed seven turns (`/tmp/hard-ingress-probe-dt21ts58`), including `/new` retaining the user's durable memory. Real Gateway/Docker, handler, tools and reply/card formatting ran; only DingTalk HTTP adapters were substituted. A nonempty shared USER.md was rejected before any provider call. Host `session_end` precedes `before_reset`; both revoke old authority while preserving only the current still-unbound ingress capability. Existing grants are never renewed. Unit regressions additionally reject external resets, already-bound resets, duplicate dispatch and callbacks that inherit async context after dispatch ends.
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
