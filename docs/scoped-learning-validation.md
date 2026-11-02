# Scoped learning validation ledger

Host: OpenClaw 2026.10.9; Node 24.22.1. Local Windows tests and isolated WSL test device 790442262. No production rollout or access to 192.168.3.183.

## Current merge gate: prepared sandbox fact missing from the stock host

The finite foreground tool cap and strict `before_agent_run` gate now refuse both an ordinary CLI and a CLI with exact-cap MCP support before launch. Actual-handler evidence is `/tmp/hard-ingress-probe-ddqvg6i7` and `/tmp/hard-ingress-probe-2dyq2h1d`; the latter also confirms the refusal reaches the local platform delivery adapter. These are negative-path passes, not overall acceptance.

Stock OpenClaw 2026.10.9 reports `sandboxed: false` to this hook even for sandboxed built-in attempts. The strict gate therefore also refuses normal operation. A separate host fix is under review against source `8b18b5578f66eab1501cba4cef2310d88bfb9a41`: propagate the prepared sandbox into the attempt snapshot consumed by hooks. Both normal foreground/background operation and the API-to-CLI fallback must pass on that built host before acceptance. Do not weaken the gate or describe prior positive tests as results for the strict-gate revision.

Local `npm test` with the strict gate (`b95c5cf`, fixture/docs follow-up `3bad958`) passes 391/391 Vitest tests in 76.23 seconds; guidance passes 20 with one Windows file-symlink privilege skip. Host facts are mocked in these unit tests. The last remote green CI remains `5c95152` (Scoped learning 41435668868, guidance 41435669043), which predates the strict gate and does not validate the proposed host fix.

The host regression's unmodified baseline reproduces both errors through the existing full attempt composition: a prepared sandbox produces `false`, and stale caller sandbox input produces `true` despite preparation returning no sandbox. Both fail specifically at the hook's sandbox-fact assertion. The corrected fixture returns only `{ outcome: "pass" }` on acceptance, as required by the host contract; an earlier fixture incorrectly included `reason` on that path. Baseline Vitest took 273.99 seconds after cold worker compilation. The matching fixed-source run and built-host integration remain pending; this baseline is failure evidence, not a passing host test.

CI run 41424972678 (Ubuntu and Windows) and guidance run 41424972681 succeeded for `573ead4`. Those green checks do not cover the subsequently discovered ordinary CLI execution path.

At `bbf2173`, local Vitest passes 389/389, authority/storage tests 44/44, both strict TypeScript configurations pass, build and real dist/SDK smoke pass. Guidance has 20 passes and one Windows file-symlink privilege skip. An earlier concurrent local run timed out while importing the SDK in an unrelated handler test; model/runtime SDK entrypoints now load only on hard-scope admission, and the complete test command passes without increasing its timeout.

The actual handler plus automatic review rerun `/tmp/learning-ingress-probe-pligrqki` passes five denied inputs before provider access and seven foreground/review cases, including reset and cross-scope checks. Real builtin compaction and complete CRUD evidence is recorded below. None establishes confinement for every host execution route.

Before the finite-cap/final-gate changes, the ordinary CLI acceptance probe failed: both the default route and explicit provider runtime `openclaw` reached the host and read a fixture-owned file outside the sandbox. Public harness, subscription-CLI and sandbox configuration checks alone permitted that route. See [the contract investigation](hard-memory-scope-contract.md). PR #18 remains Draft until the positive and negative execution gates pass together; neither a CLI-name blacklist nor a forged builtin session owner meets the contract.

## Confirmed at bdb12d2

| Evidence | Result | Scope |
| --- | --- | --- |
| npm test | 384/384 Vitest; guidance 20 pass, 1 Windows file-symlink privilege skip | Includes real storage and hook scheduling, with mocked host/model where specified |
| test:scope-authority | 37/37 | Real Node SQLite, separate writer processes, CAS contention and killed-writer recovery |
| strict TypeScript | Both scoped-learning and hard-memory configs pass | Installed public SDK types |
| build and package smoke | Build pass; smoke 1/1 | Actual dist import and SDK schema registration |
| deferred media multipart | 2/2, included in npm test | Positive control reads real file; restricted callback cannot read it after leaving original async context/config change; platform HTTP substituted |
| host-probe default | Pass | Actual Gateway restricted tool execution, reset/delete work interruption; test-owned grant |
| host-probe real model | Five decision cases pass, saved content inspected | DeepSeek review of actual verified CSV fixture evidence; bounded sample, no general quality claim |
| learning-ingress-probe | Six foreground-to-idle-review cases pass | Actual Gateway/Docker, locally registered channel, deterministic model protocol fixture; production admission and tools |

The six learning-ingress cases cover first-session learning by Alice, no private recall for Bob or lowercase alice, shared group learning/recall by another member, and no recall from another group. The provider request capture contains no other-scope or root MEMORY sentinels. Exactly two procedures are stored under private host state.

## Actual handler validation after e33be0f

The same six cases passed through actual `handleDingTalkMessageInternal`, production dispatcher/card formatting and local platform HTTP adapters. A seventh case then passed: `/new` retained Alice's own durable memory and learned procedure, completed the foreground tool calls and ran the next automatic review without creating another procedure. All seven used actual Gateway/Docker and private storage. Only model protocol and platform HTTP were deterministic fixtures; no Stream socket or live DingTalk send was used.

The reset fix was independently reviewed and its 12 admission tests and scoped strict TypeScript check passed locally. Both real host hooks (`session_end` followed by `before_reset`) must preserve only the current active, still-unbound ingress capability. Already issued grants never have their lease refreshed; admin resets, foreign/ended dispatch and inherited late callbacks revoke instead.

An evidence audit found that the earlier USER rejection used the narrower adapter, and the fixture resolved identity before entering the production handler. These checks were moved out of the handler path. Five negative cases now execute the actual handler: missing sender, conversation or tenant, conflicting tenant, and a nonempty shared USER profile. All fail before any provider POST; an independent provider-entry counter catches even malformed unexpected requests. The same run then passes all seven foreground/review cases. Test HTTP remains local.

## Failures found and repaired

- A direct RPC runner test passed while the actual idle scheduler failed with GatewayDrainingError after the foreground returned. The timer inherited a completed foreground admission. Use public lifecycle.runInBackgroundContext both when installing the timer and delivering each callback; retain session work admission and all source/write guards. The same six-case real host fixture then passed.
- Previously, retaining an invocation guard or released native memory audience could not authorize later work. Background uses an independent latest-session lease and host work admission; no private host authority is fabricated.
- A real file/multipart positive control demonstrated why hiding host paths alone was insufficient. Delayed dispatcher callbacks now retain the hard media restriction independently of ambient context and later configuration changes.
- The initial real-model positive sample included an unsupported generalization. Review evidence instructions were tightened; a later CSV case matched executed fixtures. Tool success and semantic quality remain separate assertions.

## Test-device evidence directories

These directories are on the isolated WSL test device, not on a production host:

- `/tmp/scoped-host-probe-bvy5t2ed`: restricted runner, forbidden operations and lifecycle probe.
- `/tmp/scoped-host-probe-y71zmhiq`: real-model decisions and generated procedure content.
- `/tmp/learning-ingress-probe-z26gxie6`: failing idle scheduler before the managed background fix.
- `/tmp/learning-ingress-probe-wfr67vik`: passing six-case automatic learning chain after the fix.
- `/tmp/hard-ingress-probe-dt21ts58`: collaborator's actual handler memory/USER/reset seven-case pass.
- `/tmp/learning-ingress-probe-rxninl7_`: actual handler, foreground and automatic review six-case pass.
- `/tmp/learning-ingress-probe-wf9zsp8j`: actual handler seven-case pass, adding `/new` with durable memory and Workshop recall followed by automatic review.
- `/tmp/learning-ingress-probe-70phve0i`: actual handler five rejection cases followed by all seven foreground/review cases; no adapter-level prevalidation masks handler behavior.

The committed scripts print their fresh evidence directories, capture provider requests and results, and use temporary state/config/ports. Container cleanup is limited to each fixture's own prefix and matching mount root. See [reproduction commands](scoped-learning.md#可复现验证).

## Outstanding acceptance

The expanded actual-handler fixture passed nine turns at `/tmp/hard-ingress-probe-zzz_0xox`: a real idle lifecycle event preserves the newly admitted request and durable memory; a public `sessions.patch(execHost=gateway)` after tool construction is refused at the final execution gate. Daily rollover has local lifecycle tests, not a clock-day integration run. The same active, unbound ingress rule never renews an issued grant.

After these changes, local validation passed 385 Vitest tests, 43 native authority/SQLite tests, guidance 20 pass with 1 Windows symlink-privilege skip, both strict TypeScript projects, build and built-SDK smoke. This evidence is separate from remote CI.

Built-in same-turn auto-compaction passed at `/tmp/hard-ingress-probe-obz03c9a`: a provider overflow triggered real summarization, a public `after_compaction` event and a successful same-turn scoped memory read. The physical session did not change. Custom context engines or harnesses that replace the physical session are not verified; their lifecycle event still revokes authority. No compaction exception or lease refresh was introduced. Plugin disposal additionally revokes captured foreground/background grants even if the Gateway and config are unchanged.

A local transport adapter test does not prove live DingTalk Stream authentication or delivery. No native warm-fork/cache parity, untested execution-harness confinement or broad model-quality equivalence is asserted.

Remote CI and local results are independent. The fork workflows initially required maintainer approval; their latest result must be checked on GitHub rather than inferred from local tests. The PR remains Draft during joint acceptance.
