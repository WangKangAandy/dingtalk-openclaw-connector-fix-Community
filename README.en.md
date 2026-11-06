<div align="center">
  <img alt="DingTalk" src="https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-openclaw-connector/main/docs/images/dingtalk.svg" width="72" height="72" />
  <h1>dingtalk-openclaw-connector（Community Maintained Fork）</h1>
  <p>Community maintained fork of the official <strong>v0.8.20</strong> release, tracking and fixing bugs the official team hasn't addressed.<br/>
  Identical to the official release in functionality — only community-critical fixes applied.</p>

  <p>
    <a href="https://www.npmjs.com/package/@dingtalk-real-ai/dingtalk-connector"><img src="https://img.shields.io/npm/v/@dingtalk-real-ai/dingtalk-connector.svg?style=flat&colorA=18181B&colorB=28CF8D" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/@dingtalk-real-ai/dingtalk-connector"><img src="https://img.shields.io/npm/dm/@dingtalk-real-ai/dingtalk-connector.svg?style=flat&colorA=18181B&colorB=28CF8D" alt="npm downloads" /></a>
    <a href="https://github.com/jeikl/dingtalk-openclaw-connector-fix-Community/blob/main/LICENSE"><img src="https://img.shields.io/github/license/jeikl/dingtalk-openclaw-connector-fix-Community.svg?style=flat&colorA=18181B&colorB=28CF8D" alt="license" /></a>
  </p>

  <p>
    <a href="README.md">🇨🇳 简体中文</a> •
    <a href="CHANGELOG.md">Changelog</a> •
    <a href="https://openclaw.ai/">OpenClaw Website</a>
  </p>
</div>

---

## Scoped memory and learning

Scope follows trusted DingTalk identity: private users and shared groups. This feature does not own sandbox, mount or ordinary tool policy. Installation never enables it or edits host settings. Use explicit `scope check` / `scope setup`; setup previews by default and Gateway-wide native-memory changes require separate opt-in. See the [feature-by-feature setup and maintenance guide](docs/scoped-setup.md) for changes, old data, reload, media and host boundaries.


## 🔧 Recent Updates

Editable OpenClaw/DWS guidance is optional: installing or upgrading the connector does not enable it automatically. An administrator explicitly runs `guidance setup` to provision rules, configure the official `agent-guidance` plugin, and reload it. Existing files are skipped unless `--overwrite-rules` is supplied. Add Markdown to the dedicated directory without code changes. See [setup and maintenance](docs/agent-guidance.md).

| Date | Tag | Update |
|------|------|--------|
| 2026-10-14 | 📝 | **Fix occasional missing line breaks** — DingTalk cards sometimes ignored newlines and collapsed multiple lines into one |
| 2026-10-14 | 🖼️ | **OpenClaw outbound images** — `![](...)` in the body goes on the card; standalone `MEDIA:` / `mediaUrl` waits for the card/body then `sendMedia`; Agent form is in `dingtalk-channel-rules` |
| 2026-10-13 | 📣 | **Group reply @ sender (`at-sender`)** — group replies mention the person who @mentioned the bot; see [at-sender](#-group-reply--senderat-sender) |
| 2026-10-12 | 🧭 | **AI Card execution process preview (`card-exec-preview`)** — opt-in public tool states; see [card-exec-preview](#-ai-card-execution-process-preview-card-exec-preview) |
| 2026-10-12 | 👍 | **AI Card like/dislike feedback (`card-feedback`)** — button callbacks append to a dedicated JSONL; see [card-feedback](#-ai-card-like-dislike-feedback-card-feedback) |
| 2026-10-09 | 👋 | **Enterprise event subscription (`org-events`)** — listen for configured org events on the existing Stream. Off by default. Includes a new-hire note for `user_add_org`. See [org-events](#enterprise-event-subscription-org-events) |
| 2026-06-08 | 🛡️ | **OpenClaw edit param validation (`edit-empty-oldtext`)** — dist patch for empty `oldText` misreport; see `openclaw-patch/2026.5.7/edit-empty-oldtext/` |
| 2026-06-03 | 🔒 | **Per-user / per-group long-term memory isolation (`memory-scope`)** — multi-user DingTalk bots no longer share workspace root `MEMORY.md`; see [memory-scope](#-per-user-long-term-memory-memory-scope) below |
| 2026-05-14 | ✨ | Markdown image support for direct URLs and local paths, no download required |
| 2026-05-11 | 🔧 | AI Card flashing and repeated re-rendering caused by duplicate intermediate messages after Agent multi-round loop completes |
| 2026-05-11 | 🐛 | OpenClaw 4.29+ causing DingTalk plugin to show "✅ 任务执行完成（无文本输出）" in group chat @Agent |
| 2026-05-08 | 🌐 | WebSocket phantom reconnect caused by unregistered Pong listener, from [PR #566](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/pull/566) by [Majorshi](https://github.com/Majorshi) |

Full update log: [FIXES.md](FIXES.md)（[🇨🇳 中文](FIXES.en.md)）

---

## ✨ Enhanced Features

- 🔧 OpenClaw outbound images go through this connector. Agent form is in bundled skill `dingtalk-channel-rules` (`![]()` in the body on the card; standalone `MEDIA:` uses `sendMedia`; unprefixed bare paths stay text).

- 🎨 Custom AI Card template support for user-prebuilt cards (with copy button), uses official default card if not set.
- 📣 **Group reply @ sender (`at-sender`)** — group replies mention the sender (see section below).
- 👍 **Like/dislike feedback (`card-feedback`)** — card button callbacks append to a dedicated JSONL (see section below).
- 🧭 **Execution process preview (`card-exec-preview`)** — optional public tool-state projection (see section below).

```json
"channels": {
  "dingtalk-connector": {
    "enabled": true,
    "clientId": "your-clientId",
    "clientSecret": "your-clientSecret",
    "cardTemplateId": "616459cb-a388-4001-9b65-fbb2665ff94c.schema",
    "cardContentVar": "content",
    "cardProcessVar": "process",
    "cardReasoningVar": "reasoning",
    "cardLikeActionId": "ai_res_like",
    "cardDislikeActionId": "ai_res_dislike",
    "cardFeedbackStatusKey": "like"
  }
}
```

| Parameter | Description |
|-----------|-------------|
| `cardTemplateId` | AI Card template ID, uses official default if not set |
| `cardContentVar` | Final response content variable, defaults to `msgContent` (**only** streaming body key) |
| `cardProcessVar` | Optional public tool categories and states; no command arguments |
| `cardReasoningVar` | Existing template name; now contains public state counts, never internal reasoning |
| `cardToolVar` | Public progress variable when cardProcessVar is absent; no raw tool output |
| `cardLikeActionId` | Like button `actionId`, default `ai_res_like` |
| `cardDislikeActionId` | Dislike button `actionId`, default `ai_res_dislike` |
| `cardFeedbackStatusKey` | Finish-state feedback field, default `like` (`0`/`1`/`-1`) |

> Card template must be created in [DingTalk Open Platform](https://open.dingtalk.com/) with matching variable fields. Body streams only via `cardContentVar`; process/reasoning never fall back onto the streaming body key.

### 📣 Group reply @ sender (`at-sender`)

When someone @mentions the bot in a group, the reply @mentions that person (blue @ + notification). Uses inbound `senderStaffId` / `senderNick` on the existing group reply exits. No new config.

| Item | Description |
|------|-------------|
| Enable | On by default; DMs are not @mentioned |
| AI Card | Deliver `imGroupOpenDeliverModel.atUserIds` (notification); create `cardAtUserIds` plus `@nick` in the body (in-card blue @). Queue ACK reuses the same card |
| Fallback | sessionWebhook text/markdown also sets `at.atUserIds` and appends `@userid` in the body |
| Prerequisite | Robot published to production (inbound includes `senderStaffId`); never @ with the encrypted `senderId` |

### 👍 AI Card like/dislike feedback (`card-feedback`)

Listen for card callbacks on the existing Stream (`/v1.0/card/instances/callback`) and append Q&A snapshots plus like/dislike events to a **dedicated JSONL** (joined by `cardId` / `outTrackId`) for offline analysis. Does **not** patch OpenClaw SQLite / `sessions.json` / transcripts.

Log path: `$OPENCLAW_STATE_DIR/dingtalk-card-feedback.jsonl` (falls back to `$OPENCLAW_HOME/.openclaw` or `~/.openclaw`). Two record types:

- `answer` — written when the card finishes, with this turn's `userPrompt`, the text actually shown as `assistantText`, and `status` (`completed` | `failed` | `interrupted`)
- `feedback` — one append per like/dislike callback; `eventId` identifies retries; user re-ratings keep history (dedupe by `eventId` at analysis time; latest rating by card+user)

| Item | Description |
|------|-------------|
| Enable | Use a custom template with like/dislike buttons; finish state writes `cardFeedbackStatusKey=0` for gray icons |
| Template | Button `actionId`s must match `cardLikeActionId` / `cardDislikeActionId` |
| Join | Optional short-lived `cardId → session` enrichment; feedback still persists when the cache is gone |
| Persist | `dingtalk-card-feedback.jsonl` only; prefer local append then ACK (ACK means received, not analyzed) |
| Non-invasive | No second Stream; behavior unchanged without a feedback-capable template |

### 🧭 AI Card execution process preview (`card-exec-preview`)

Public Host tool/item/approval events are projected as fixed categories and observed states. Command arguments, tool output, arbitrary tool names, and internal reasoning are never sent to process variables. The existing `cardReasoningVar` field now contains public state counts.

| Item | Behavior |
|---|---|
| Enable | Configure cardProcessVar, cardToolVar, or cardReasoningVar and leave streaming on; process takes precedence over tool |
| Correlation | Host toolCallId/itemId identifies a tool; events without IDs only produce category-level running indicators |
| Result | Explicit success means completed; an end without a result remains unconfirmed; an approval response is not execution success |
| Ordering | Late running events cannot reopen a terminal item; a confirmed result may refine an unconfirmed end before the turn closes |
| Delivery | Coalesced trailing updates and the terminal snapshot share the card write chain; progress settles before body finalization |
| Bounds | At most 128 retained items and 8 displayed entries, with an omission notice; projection failure never reruns the model |
| Variables | Process/summary variables must not collide with body, feedback, or reserved fields |

Existing templates keep their field names; no digital-employee identity is needed. Tools without public events do not receive invented progress. API projection is not proof of client rendering or business success.

### Enterprise event subscription (`org-events`)

Listen for enterprise events on the existing bot Stream. No second connection, and nothing is written to `openclaw.json`.

Events provided:

| Event | Behavior |
|------|----------|
| `user_add_org` (employee added) | When the switch is on, send that person one Markdown DM. No agent turn, no session or memory file |

`user_add_org` details:

| Item | Description |
|------|-------------|
| Switch | `enabled` in `~/.openclaw/dingtalk-org-events/onboarding/settings.json`. Read again on each event, so the gateway does not restart. A missing file is created as `false` |
| Copy | `new-employee.md` and `city-contacts.png` in that directory. The first run copies them from the bundled `templates/`. Later publishes leave this directory alone |
| Roster | Section 3 uses `city-contacts.png` beside the note. After upload, its mediaId goes in the same Markdown `![]()`, and the whole note is sent as an interactive card |
| Name | The official payload only has `userId`. `user/get` fills `name` into `嗨，{{name}}，`. Requires app permission `qyapi_get_member`. If lookup fails, the greeting stays `嗨，欢迎新同学…` |
| Idempotency | `~/.openclaw/dingtalk-org-events/<accountId>.json` |

```json
{ "enabled": true }
```

### 🔒 Per-user long-term memory (`memory-scope`)

The current implementation derives authority from trusted DingTalk ingress. Private chats use tenant, connector account, agent and exact sender ID; groups share a namespace based on tenant, account, agent and exact conversation ID. IDs retain case. Models cannot choose a scope or host path.

`scoped_memory` provides facts/preferences with revision-checked CRUD and literal search. `scoped_skill_workshop` stores reusable procedures with background review and undo. Both use the same admission and session lifetime.

Scope requires trusted identity and compatible host bindings/lifecycle. Sandbox, mounts, ordinary tools and media policy remain independent. Native memory/learning conflicts are handled explicitly during setup; Gateway-wide changes require separate administrator opt-in.

Explicitly enable `channels.dingtalk-connector.memoryScope.enabled`; it defaults to off, and the flag alone does not satisfy admission. See the [hard scope contract](docs/hard-memory-scope-contract.md) and [scoped learning](docs/scoped-learning.md) for the implementation and evidence limits. See the current validation ledger for measured coverage; historical hard-sandbox results are not evidence for the revised policy.

Legacy session-key identity parsing, workspace memory-rule synchronization and the `syncRootMemoryRules` / `syncAgentsMemoryRules` options have been removed. Existing MEMORY/AGENTS files are not rewritten or automatically imported.

---

## Why Fork?

Due to the sluggish pace of the official DingTalk connector's updates and bug fixes, this repository was forked to keep up with critical fixes.

**Bugs fixed using Claude Code (official AI model) to ensure maximum fix quality.**

Community contributions (features & bug fixes) are always welcome — submit a PR anytime!

---

## Differences from Official

| Item | Description |
|------|-------------|
| Base | Official v0.8.20, fully identical features |
| Fixes | Bugs the official team hasn't addressed (see recent fixes above) |
| Enterprise event subscription | Org events on the existing Stream. The new-hire switch is `~/.openclaw/dingtalk-org-events/onboarding/settings.json`, off by default |
| Event provided: employee added | `user_add_org`. When the switch is on, send the new hire a Markdown DM |
| memory-scope | Trusted admission, private storage and restricted learning; integration validation in progress |
| OpenClaw dist patch | `openclaw-patch/` |
| Community dws OAuth | Login chain |
| Maintenance | Community maintained, continuously tracking official updates |

---

## Requirements & Installation

Before you start, make sure you have:

- **OpenClaw**: Installed and running properly. Visit the [OpenClaw website](https://openclaw.ai/) for details.
- **Version**: OpenClaw ≥ **2026.4.9**. Check with `openclaw -v`.
- **dws CLI** (required for DingTalk business APIs): same as the [official connector](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector), doctor only accepts `dws --version` on PATH. Install official [dingtalk-workspace-cli](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli).

> If below this version, upgrade with: `npm install -g openclaw`

### Install dws (same as official connector)

```bash
npm install -g dingtalk-workspace-cli
# or
curl -fsSL https://raw.githubusercontent.com/DingTalk-Real-AI/dingtalk-workspace-cli/main/scripts/install.sh | sh
dws --version
dws auth login          # local browser
# dws auth login --device  # SSH / headless: give the user the URL
```

The requester must sign in themselves (`dws auth login`, or `--device` when headless). Business commands need the exact `dws --profile <chatbotCorpId>:<senderStaffId>`. If the trusted corpId is missing or `profile list` has no such identity, stop — do not guess from the login list, and do not use the machine default. Do not run `auth login --sender-id`.

---

## Uninstall Official Plugin (avoid conflicts)

Remove the official plugin before installing this version:

```bash
# List installed plugins
openclaw plugins list

# Uninstall official version
openclaw plugins uninstall dingtalk-connector

# Restart to apply changes
openclaw gateway restart
```

---

## Manual Build & Deployment

This version requires manual compilation (community fix, not published to npm):

```bash
# 1. Clone repo
git clone https://github.com/jeikl/dingtalk-openclaw-connector-fix-Community.git
cd dingtalk-openclaw-connector-fix-Community

# 2. Install, build & pack

# npm
npm install
npm run build
npm pack

# or pnpm
pnpm install
pnpm run build
pnpm pack

# 3. Install to OpenClaw and restart (built artifact in current dir)
npx openclaw plugins install ./dingtalk-real-ai-dingtalk-connector-0.8.20-fix6.tgz
npx openclaw gateway restart
```

---

## Usage Guide

[OpenClaw DingTalk Plugin User Guide](https://alidocs.dingtalk.com/i/nodes/2Amq4vjg89GEno0zfPqoPGqdV3kdP0wQ?utm_scene=team_space)

---

## Advanced Documentation

- [Manual Setup Guide](docs/DINGTALK_MANUAL_SETUP.md) — Configure credentials manually
- [DingTalk DEAP Agent Integration](docs/DEAP_AGENT_GUIDE.en.md) — Local device operation capabilities
- [Multi-Agent Routing](docs/MULTI_AGENT_SETUP.md) — Bind multiple bots to different Agents
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Installation and usage issue resolution
- [Official README（中文）](README_DINGTALK_OFFICIAL.md)
- [Official README（English）](README_DINGTALK_OFFICIAL_en.md)

---

## Contributing

Community contributions are welcome! If you find a bug or have feature suggestions, please submit an [Issue](https://github.com/jeikl/dingtalk-openclaw-connector-fix-Community/issues) or Pull Request.

---

## License

This project is licensed under the [MIT](LICENSE) License.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/jeikl/dingtalk-openclaw-connector-fix-Community/issues)
- **Changelog**: [CHANGELOG.md](CHANGELOG.md)
