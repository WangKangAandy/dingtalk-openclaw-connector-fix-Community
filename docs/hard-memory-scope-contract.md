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
| Identity | Shared authority module and adversarial unit tests | Real admitted DingTalk event to host tool-context mapping, including missing metadata |
| Session | Hashed routing uses exact trusted IDs; shared-private and split-group modes rejected | Real host metadata propagation and steering tests |
| Memory | Separate private SQLite namespaces with revision CAS, tombstones and bounded literal search | Full ingress/host execution and recall behavior |
| Learning | Restricted public runner, same grants, versioned store and cross-process CAS | Actual foreground/background hook chain under hard policy |
| Tool boundary | Host SDK has trusted requester and invocation guard | Actual execution rejection, not just schema filtering; no native search, filesystem, exec, sessions or plugin bypass |
| Context | Legacy workspace injection/sync removed; native memory and unscoped skills blocked by admission | Cross-scope sentinels absent from foreground and background provider requests |
| Lifecycle | Actual host reset/delete interrupt work and invalidate retained leases | Full ingress cancellation and stop cases |
| Existing data | No automatic import, mapping, migration or compatibility fallback | Existing files remain untouched; new scopes begin in private storage |
| Media | Host path uploads blocked; delayed callbacks retain the restriction across reload | Real channel delivery still separate from local callback/file-stream tests |
| Operations | No production action | Bounded resources, corruption failure, deletion/index cleanup, audit without private contents |

## Verified building blocks (2026-11-02)

- Authority/admission: 16 Node tests cover exact IDs, shared groups, immutable grants, no model/session-derived authority, source/child lifetime separation, missing host fields, bounded admission capacity and hashed session routing.
- ScopedMemoryStore: nine real SQLite tests, including two simultaneous child processes competing for the same group revision (exactly one commits). Separate namespace databases provide CRUD, literal lexical search, bounded listing, tombstones, monotonic revisions and final-effect authority checks. Restart, corrupt files, identity substitution, hardlinks/junctions and resource bounds are covered. This is not yet semantic/vector recall parity.
- Strict TypeScript check passes with official @types/node 24. The repository's previous @types/node 20 does not declare node:sqlite; no handwritten permissive module declaration is used.
- The connector now wires trusted ingress to one runtime shared by memory and Workshop. Local handler tests pass; real Gateway ingress is still being validated. No production environment was changed.

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
