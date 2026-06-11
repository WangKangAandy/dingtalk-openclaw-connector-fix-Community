# DingTalk static inject plan (频道纪律静态注入)

> Canonical copy for connector repo.  
> Workspace mirror: `~/.openclaw/workspace/docs/dingtalk-static-inject-plan.md`  
> Status: planned · Updated: 2026-05-22

See the workspace document for the full Chinese plan (sections 1–12): goals, inject file layout, `INJECT_SOURCES`, phases, acceptance, rollback, and `alwaysActive` findings.

## Quick summary

1. Move **dingtalk-channel-rules** from Skill → `inject/AGENTS.dingtalk-rules.md` merged into `AGENTS.md` (`<!-- DINGTALK-RULES:BEGIN/END -->`).
2. Distill **dingtalk-issues** hard rules → `inject/AGENTS.dingtalk-issues.md` (`<!-- DINGTALK-ISSUES:BEGIN/END -->`); keep full log in workspace `dingtalk-issues.md`.
3. Run **inject-manager** on plugin `register()` (same pattern as openclaw-musa).
4. Remove **skills/dingtalk-channel-rules**; keep **dws-cli** and **dingtalk-troubleshoot**.
5. Keep dynamic prompts in **message-handler.ts** (Bot Context, DWS Context, link routing).

## Implementation checklist (connector)

- [ ] `src/utils/inject-manager.ts`
- [ ] `inject/AGENTS.dingtalk-rules.md`
- [ ] `inject/AGENTS.dingtalk-issues.md`
- [ ] `inject/README.md`
- [ ] `index.ts` → `ensureAllInjected(workspace, injectDir)`
- [ ] `DINGTALK_AUTO_INJECT=false` escape hatch
- [ ] Tests for block merge
- [ ] CHANGELOG entry; remove deprecated skill
