# 当前策略调整的验证（2026-11-03）

本轮将用户级 scope 与宿主沙箱／挂载策略解耦，新增显式 setup。当前实现已在 [Scoped learning CI 41600238775](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/actions/runs/41600238775) 的提交 `526841978c59004e3e352ffe4373db097297aa14` 上通过：

- Windows / Ubuntu、Node 24.22.1：主测试、权限／存储测试、17 项配置向导测试、两套严格 TypeScript、构建及真实 dist/SDK smoke。
- 两个系统均通过实际 OpenClaw CLI/schema 的 setup dry-run，确认没有保存配置或 reload。
- 原版 npm OpenClaw 2026.10.9、实际 production handler → Gateway：`off`、`none`、`ro`、`rw`、`none + knowledge:ro` 五组都通过 9 个前台场景、8 次后台复盘、4 个无效身份拒绝。覆盖不同用户、大小写不同 ID、同群共享／跨群隔离、`/new`、字面 `/learn` 保存及避免重复复盘。
- 公共知识组实际读取 `/knowledge/public.txt`，拒绝写入原件，并成功写入独立 `/workspace` 任务文件。
- 目标 Agent 拒绝原生 `skill_workshop`，全局 `skills.workshop.autonomous.mode` 保持 `auto`。无需补丁宿主的 `sandboxed=true` 投影。
- 额外真实激活流程：通过正式 `dingtalk-connector scope setup --agents main --learning --apply`，官方 CLI 保存配置并确认 connector reload，随后重新通过同一完整隔离流程，且 sandbox 配置不变。

此 run 的 Gateway job 上传了终端日志、结果 JSON、配置验证与实际 setup 回执。模型协议和钉钉 HTTP 是本地 fixture；普通钉钉 Stream 未启动。此前本机一次实际 CLI 探针在输出配置后超时，记录为本机失败；没有把输出存在当成执行成功。干净 Windows/Ubuntu runner 上相同正式 CLI 流程已通过。

未验证 live Stream/OAuth/真实钉钉平台投递，不承诺对任意宿主 exec／恶意插件的 OS 隔离。

## 以下是调整前的历史证据

以下记录针对旧的强制沙箱策略，保留用于溯源；其中 none／禁挂载／sandboxed 必须 true／全局 Workshop off／自动附件拒绝不再是当前运行要求。当前配置以 [scoped-setup](scoped-setup.md) 为准。

# Scoped learning validation ledger

Host: OpenClaw 2026.10.9; Node 24.22.1. Local Windows tests and isolated WSL test device 790442262. No production rollout or access to 192.168.3.183.

## Final validation on the patched host (2026-11-03)

Positive and negative execution gates pass together on source-built OpenClaw 2026.10.9 `887774ae20b9dc38a0947cbbe9536f8a864aaa7d` and its matching built SDK. The [release-based branch](https://github.com/WangKangAandy/openclaw/tree/fix/prepared-sandbox-hook-context-2026.10.9) preserves this tested tree. The [upstream fix PR](https://github.com/openclaw/openclaw/pull/191205) targets a different main tree and requires separate validation. Stock 2026.10.9 still misreports the prepared sandbox and remains unsupported for this strict policy. The feature stays off by default; no production rollout was performed.

CI at `9f789c90daa0cd9615e3fe02d3d656e8e542a2a1` passes: [Scoped learning 41463837855](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/actions/runs/41463837855) and [guidance 41463837830](https://github.com/WangKangAandy/dingtalk-openclaw-connector-fix-Community/actions/runs/41463837830). Windows/Linux pass 391 main tests, 44 authority/storage tests, the 47-test hard-memory subset, both strict TypeScript projects, build and built-SDK smoke. The final literal-command fixture is `d260398a6880874a18ad0d12df47646c10a918b0`; its production source is unchanged from that CI head. Later fixture/docs commits require their own CI status. A repeated authority audit passes 44/44, preserving exact case/Unicode IDs, missing-identity refusal and the shared memory/Workshop grant.

Host `887774ae` passes the complete affected test file, 28/28 without skips (Vitest 39.17 s; wrapper 67.84 s). The two new full-attempt cases take 159/169 ms and assert actual prompt admission/blocking. Both fail on the unmodified release baseline in opposite directions. Changed-file typed lint passes (17.36 s), the affected strict TypeScript graph passes (73.11 s), and official `qaRuntime` build passes (71.16 s). This runtime profile is not a release/UI build. Independent autoreview produced no report after API connection failures (`reviewer_unavailable`); a collaborator separately reviewed the source and fixture corrections. Unavailable automated review is not a pass.

Actual production handler + Gateway + Docker results on that built host:

| Scenario | Test-device evidence | Result |
| --- | --- | --- |
| Memory CRUD, private/group isolation, USER.md refusal, builtin compaction | `/tmp/hard-ingress-probe-s0dctv4w` | Ten positive turns; eleven actual sandboxed hooks; one real compaction |
| Automatic learning, reset and five invalid ingress inputs | `/tmp/learning-ingress-probe-lde0yen_` | Seven foreground/review cases; fourteen actual sandboxed hooks |
| Literal `/learn`, persisted revision and subsequent Bob isolation | `/tmp/learning-ingress-probe-oc77_lhf` | Nine foreground cases, eight reviews, five rejected inputs; exit 0 in 67.22 s |
| Ordinary CLI | `/tmp/hard-ingress-probe-303bl_3x` | Refused before executable launch |
| Exact-tool-cap MCP CLI | `/tmp/hard-ingress-probe-n99s0cnb` | Refused before launch; explicit refusal delivery |
| Real HTTP 503 then CLI fallback | `/tmp/hard-ingress-probe-lwle7lka` | Seven builtin sandboxed attempts; CLI hook false and refused before launch |
| Idle rollover and late host execution override | `/tmp/hard-ingress-probe-3np66c_e` | Eleven turns pass, including real 62-second idle and final tool-boundary refusal |

The literal-command test verifies the translated `/learn` request and real list/view/save receipts. Manual save intentionally suppresses same-turn automatic review; the final assertion checks no duplicate review after later Bob cases finish. The first fixture (`/tmp/learning-ingress-probe-06caktow`) saved correctly but incorrectly waited for duplicate review. Only that expectation changed, not product scheduling. Gateway cleanup completed successfully.

Model protocol and platform HTTP are local fixtures. This does not prove live DingTalk Stream/OAuth/platform delivery, native warm-fork/cache parity or broad model quality. Daily rollover has local lifecycle tests; custom engines replacing the physical session remain unverified and revoke authority. Sandbox media export remains unsupported. Evidence below is historical and must not replace the final-head results above.

## Historical investigation before patched-host acceptance

The finite foreground tool cap and strict `before_agent_run` gate now refuse both an ordinary CLI and a CLI with exact-cap MCP support before launch. Actual-handler evidence is `/tmp/hard-ingress-probe-ddqvg6i7` and `/tmp/hard-ingress-probe-2dyq2h1d`; the latter also confirms the refusal reaches the local platform delivery adapter. These are negative-path passes, not overall acceptance.

Stock OpenClaw 2026.10.9 reports `sandboxed: false` to this hook even for sandboxed built-in attempts. The strict gate therefore also refuses normal operation. Separate host commit `e4416bae104bc8bd542f2d75dba26af974eaec74`, based on `8b18b5578f66eab1501cba4cef2310d88bfb9a41`, propagates the prepared sandbox into the attempt snapshot consumed by hooks. Both normal foreground/background operation and the API-to-CLI fallback must pass on that built host before acceptance. Do not weaken the gate or describe prior positive tests as results for the strict-gate revision.

Local `npm test` with the strict gate (`b95c5cf`, fixture/docs follow-up `3bad958`) passes 391/391 Vitest tests in 76.23 seconds; guidance passes 20 with one Windows file-symlink privilege skip. Host facts are mocked in these unit tests. The last remote green CI remains `5c95152` (Scoped learning 41435668868, guidance 41435669043), which predates the strict gate and does not validate the proposed host fix.

The host regression's unmodified baseline reproduces both errors through the existing full attempt composition: a prepared sandbox produces `false`, and stale caller sandbox input produces `true` despite preparation returning no sandbox. Both fail specifically at the hook's sandbox-fact assertion. The corrected fixture returns only `{ outcome: "pass" }` on acceptance, as required by the host contract; an earlier fixture incorrectly included `reason` on that path. Baseline Vitest took 273.99 seconds after cold worker compilation. The matching fixed-source run passes both cases, including the actual prompt-call assertions (2 pass, 26 filtered out; 401.36 seconds). The first fixed run timed out during fixture preload before any assertion; the passing command uses `--hookTimeout 360000` for that import, without changing repository defaults or product timeouts. Local typed lint/typecheck were interrupted after available Windows memory dropped below 400 MB and are not counted as passes. Their replacement checks and the built-host integration run in a fresh isolated WSL checkout; neither existing host installation nor production is modified.

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
