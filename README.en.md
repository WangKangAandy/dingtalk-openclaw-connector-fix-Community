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

## 🔧 Recent Updates

| Date | Tag | Update |
|------|------|--------|
| 2026-10-14 | 🖼️ | **OpenClaw outbound images** — `![](...)` in the body goes on the card; standalone `MEDIA:` / `mediaUrl` waits for the card/body then `sendMedia`; unprefixed bare paths stay text |
| 2026-10-13 | 📣 | **Group reply @ sender (`at-sender`)** — group replies mention the person who @mentioned the bot; see [at-sender](#-group-reply--senderat-sender) |
| 2026-10-12 | 🧭 | **AI Card execution process preview (`card-exec-preview`)** — opt-in tools/plan/reasoning; see [card-exec-preview](#-ai-card-execution-process-preview-card-exec-preview) |
| 2026-10-12 | 👍 | **AI Card like/dislike feedback (`card-feedback`)** — button callbacks attach to the assistant turn; see [card-feedback](#-ai-card-like-dislike-feedback-card-feedback) |
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

- 🔧 OpenClaw outbound images go through this connector (Agent / skill chooses the form):
  - `![alt](url-or-local-path)` in the body: inline on the AI Card
  - Standalone `MEDIA:` or `payload.mediaUrl`: wait for the card/body, then `sendMedia`
  - Unprefixed `/home/a.png` stays text (v0.8.9)
  - ⚠️ DingTalk will not emit images by itself; use a prompt / skill:

    ```
    Please write a DingTalk image sending skill following this approach: use markdown to send images, with image captions for rich text; direct URLs or local paths can be embedded directly in markdown, and if local paths contain spaces, rename to remove spaces first before sending.
    ```

- 🎨 Custom AI Card template support for user-prebuilt cards (with copy button), uses official default card if not set.
- 📣 **Group reply @ sender (`at-sender`)** — group replies mention the sender (see section below).
- 👍 **Like/dislike feedback (`card-feedback`)** — card button callbacks attach to the assistant turn (see section below).
- 🧭 **Execution process preview (`card-exec-preview`)** — optional tools/plan/reasoning projection (see section below).

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
| `cardProcessVar` | Optional process summary var; enabling this and/or `cardReasoningVar` turns on exec preview |
| `cardReasoningVar` | Optional reasoning var; written only when upstream `onReasoningStream` fires |
| `cardToolVar` | Tool output var when exec preview is off; raw command dump is skipped when `cardProcessVar` is set |
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

Listen for card callbacks on the existing Stream (`/v1.0/card/instances/callback`) and attach like/dislike onto the **same assistant message** (bound by `cardInstanceId`).

| Item | Description |
|------|-------------|
| Enable | Use a custom template with like/dislike buttons; finish state writes `cardFeedbackStatusKey=0` for gray icons |
| Template | Button `actionId`s must match `cardLikeActionId` / `cardDislikeActionId` |
| Binding | Register `outTrackId → session` on deliver; stamp `cardInstanceId` on the assistant row at finish |
| Non-invasive | No second Stream; behavior unchanged without a feedback-capable template |

### 🧭 AI Card execution process preview (`card-exec-preview`)

Opt-in: project tool starts, plan updates, commands, and optional reasoning into the card process area (prose for status, fenced blocks for commands). Body still streams only to `cardContentVar`.

Recommended template `616459cb-a388-4001-9b65-fbb2665ff94c.schema` (process/reasoning vars, scrollable process area while executing; also includes [like/dislike](#-ai-card-like-dislike-feedback-card-feedback) buttons).

| Item | Description |
|------|-------------|
| Enable | Non-empty `cardProcessVar` and/or `cardReasoningVar`, and streaming AI Card left on; otherwise zero cost |
| Writes | Process/reasoning use `PUT /card/instances` (not streaming) on the same per-card write chain as body updates |
| Gate | First body write marks `contentStarted` and flushes buffered process/reasoning; no more `flowStatus=4` afterward |
| Suppress | With process var set, suppress default tool-progress spam; process is markdown (prose status, every command in a fence), never dumped into `cardToolVar` |

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

When several people share one DingTalk bot, OpenClaw’s default `AGENTS.md` / root `MEMORY.md` semantics (global daily, freely edit root MEMORY) conflict with per-user isolation. This fork’s **`memory-scope` module** (`src/memory-scope/`) handles that.

#### Layered memory

| Layer | Path | Content |
|-------|------|---------|
| Root | `workspace/MEMORY.md` | Architecture/discipline (marked section only); agents must not append |
| Scope | `memory/users/{id}/` or `memory/groups/{cid}/` | Session-specific preferences |
| Topic issues | `memory/dingtalk-issue.md`, etc. | Pitfall handbooks (agent writes) |

Bootstrap injects **both** root and scope `MEMORY.md` (distinguished by full path).

#### Mechanisms

| Mechanism | Role |
|-----------|------|
| `register` sync | Replace marked sections in `MEMORY.md` / `AGENTS.md` on each gateway start; first-time AGENTS migrate from legacy OpenClaw text |
| `agent:bootstrap` | Inject root + scoped `MEMORY.md`; create scope file if missing |
| `before_prompt_build` | Prepend **Session memory paths** (3 lines) only |

**Constraint model (Phase 1):** no `before_tool_call` / tool-guard — rules in marked sections + bootstrap + minimal path prompt.

**Directory layout:**

| Scenario | Path |
|----------|------|
| Direct chat | `memory/users/{senderId}/MEMORY.md`, `memory/users/{senderId}/YYYY-MM-DD.md` |
| Group chat | `memory/groups/{conversationId}/...` |
| Per-sender in group (`groupSessionScope: group_sender`) | `memory/groups/{conversationId}/users/{senderId}/...` |

**Config (enabled by default):**

```json
"channels": {
  "dingtalk-connector": {
    "memoryScope": {
      "enabled": true,
      "syncRootMemoryRules": true,
      "syncAgentsMemoryRules": true
    }
  }
}
```

| Option | Meaning |
|--------|---------|
| `enabled: false` | Disable memory-scope; OpenClaw default global `MEMORY.md` |
| `syncRootMemoryRules: false` | Do not sync `MEMORY.md` marked section |
| `syncAgentsMemoryRules: false` | Do not sync `AGENTS.md` memory marked sections |

**Verify at gateway startup:**

```
[dingtalk-connector][memory-scope] synced root MEMORY.md rules section
[dingtalk-connector][memory-scope] synced AGENTS.md memory marked sections
[dingtalk-connector][memory-scope] registered (enabled=true, syncRootMemoryRules=true, syncAgentsMemoryRules=true)
```

**Phase 1 note:** `memory_search` still indexes the whole workspace; cross-scope retrieval discipline is in the `MEMORY.md` marked section.

Agent-facing rules: `skills/dingtalk-channel-rules/SKILL.md`.

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
| memory-scope | Layered memory plus `MEMORY.md` rule sync |
| OpenClaw dist patch | `openclaw-patch/` |
| Community dws OAuth | Login chain |
| Maintenance | Community maintained, continuously tracking official updates |

---

## Requirements & Installation

Before you start, make sure you have:

- **OpenClaw**: Installed and running properly. Visit the [OpenClaw website](https://openclaw.ai/) for details.
- **Version**: OpenClaw ≥ **2026.4.9**. Check with `openclaw -v`.
- **dws CLI & dws skill** (required for DingTalk business APIs): this connector **no longer bundles** `dws-cli`. The **community edition** pairs with [WangKangAandy/dingtalk-workspace-cli](https://github.com/WangKangAandy/dingtalk-workspace-cli) (per-sender OAuth). Running `npm install` in the connector directory **auto-clones/updates the fork, installs the skill to `~/.openclaw/skills/dws`, and builds the CLI to `~/.local/bin/dws`** (requires git; Go needed for CLI build).

> If below this version, upgrade with: `npm install -g openclaw`

### Automatic dws install (recommended)

```bash
cd ~/.openclaw/extensions/dingtalk-connector   # or your clone path
npm install
dws --version   # ensure ~/.local/bin is on PATH
```

Optional env vars:

| Variable | Purpose |
|----------|---------|
| `DWS_SKIP_AUTO_INSTALL=1` | Skip auto-install |
| `DWS_COMMUNITY_REF=main` | Git branch/tag (default: `main`) |

### Manual install (offline or when postinstall was skipped)

```bash
git clone https://github.com/WangKangAandy/dingtalk-workspace-cli.git ~/.openclaw/vendor/dingtalk-workspace-cli
cd ~/.openclaw/vendor/dingtalk-workspace-cli
go build -o ~/.local/bin/dws ./cmd
node /path/to/dingtalk-connector/scripts/install-community-dws.js
```

**Do not** use `npm i -g dingtalk-workspace-cli` (upstream open-dingtalk package; incompatible with this connector).

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