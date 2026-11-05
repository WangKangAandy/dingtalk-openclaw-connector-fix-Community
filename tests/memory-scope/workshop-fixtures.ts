import { admitScope, SCOPE_OPERATIONS, type AdmittedScopeInput } from "../../src/memory-scope/authority.ts"

/** Test-owned admission. Production callers must use the connector's shared ScopeServices. */
export function fixtureGrant(overrides: Partial<AdmittedScopeInput> = {}) {
  return admitScope({ tenantId: "test-tenant", accountId: "test-account", agentId: "main", senderId: "alice",
    chatType: "direct", conversationId: "dm-alice", sessionKey: "test-session", sessionId: "test-incarnation",
    assertCurrent() {}, operations: SCOPE_OPERATIONS, ...overrides })
}
