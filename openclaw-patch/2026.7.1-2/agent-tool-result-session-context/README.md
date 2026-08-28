# Agent Tool Result Session Context Patch

Version-bound patch for OpenClaw `2026.7.1-2`. It forwards the existing trusted
`agentId`, `sessionId`, `sessionKey`, and `runId` into the OpenClaw
`AgentToolResultMiddleware` context without changing tool execution or result construction.

Apply to a temporary copy first:

```bash
./apply.sh /tmp/openclaw-2026.7.1-2
```

The script checks the installed package version and unique bundle anchors, creates
side-by-side `.dingtalk-memory-scope.bak` backups, applies the patch idempotently,
runs `node --check`, and verifies two concurrent contexts. It never restarts Gateway.

Rollback by restoring each recorded `.dingtalk-memory-scope.bak` file to its original
name, then run the verifier to confirm the patched anchors are absent before restarting.
