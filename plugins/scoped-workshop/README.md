# Scoped Skill Workshop

An independent replacement for the bundled OpenClaw Skill Workshop, based on upstream main `dad4fc1a037821f2e503df81fe43171bf61af656`. The DingTalk connector authenticates channel identity and supplies a revocable scoped data capability. This plugin owns `skill_workshop`, `/learn` guidance and the upstream review scheduler. OpenClaw owns `runForkedTurn`, transcript anchoring, source requester facts, sandbox policy and cancellation.

Do not run this plugin alongside the bundled `skill-workshop`. Migrate pre-plugin Workshop policy (`meta.migrations.skillWorkshopPlugin: true` after checking the historical policy, or OpenClaw Doctor), then disable the bundled plugin explicitly. Without that marker current main ignores a disabled entry from an old config. Enable `dingtalk-scoped-workshop`, grant its conversation/prompt hooks, and allow `skill_workshop` for the target agent and sandbox. Do not mount private plugin state into the script sandbox. The connector's old `scopedLearning.mode` and timer settings do not configure this plugin.

```json5
{
  plugins: { entries: {
    "skill-workshop": { enabled: false },
    "dingtalk-scoped-workshop": {
      enabled: true,
      hooks: { allowConversationAccess: true, allowPromptModification: true },
      config: { autonomous: { mode: "auto" } }
    }
  } }
}
```

Install the compatible connector as the declared peer dependency. Build with `npm run build:workshop` at the connector checkout root. This is a development candidate until its pinned-main Gateway and WSL acceptance are complete; a successful package build is not that acceptance.

Private chats address the exact tenant/account/agent/user scope. Group members share only their group's scope; audit attribution remains the current sender. Existing PR18 stored bundles and revision history are reused. No agent-wide learned directory is registered or copied into all sessions.

The native action vocabulary is `list`, `view`, `create`, `patch`, `write_file`, `remove_file`, `archive`, `restore`. `restore` undoes the latest change to the named skill. This version does not expose native propose-mode drafts, version-ID restore, the global Workshop CLI/UI library or cross-scope maintenance. It must not claim those features are unchanged.

Automatic review defaults to `off`; set `auto` explicitly to use the inherited 10-iteration/30-second-idle scheduler. A review may abstain and never has to save. The initiating user's restriction against learning remains binding in the review prompt. This does not claim a universal natural-language consent parser. Explicit writes and background writes use the same storage authorization, revisions and input validation. The connector neither schedules another review nor writes from an assistant's final text.
