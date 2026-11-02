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
| Session | Old code accepts shared session routing | Reject routing that mixes scopes; preserve group sharing; prevent steering across private scopes |
| Memory | Legacy workspace Markdown plus prompt rules | Scoped provider/store with CAS, read/search/list/delete, restart persistence, index separation |
| Learning | PR #18 store and background runner | Use same grant/namespace; revoke on reset/config changes; concurrent group CAS and undo |
| Tool boundary | Host SDK has trusted requester and invocation guard | Actual execution rejection, not just schema filtering; no native search, filesystem, exec, sessions or plugin bypass |
| Context | Old bootstrap injects Markdown | No cross-scope bootstrap, transcripts, caches, background recall, or learned skill snippets |
| Lifecycle | Grant delegation contract | Actual host reset, stop, expiry, retry and detached-run tests |
| Migration | Old paths can collide after lowercasing/sanitizing | Explicit reviewed mapping; ambiguous paths quarantined; no silent automatic merge |
| Operations | No production action | Bounded resources, corruption failure, deletion/index cleanup, audit without private contents |

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
