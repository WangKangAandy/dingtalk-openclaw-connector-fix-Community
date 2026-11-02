import { assertScopeGrant, type ScopeGrant, type ScopeOperation } from "../authority.ts"
import type { ScopeServices } from "../services.ts"
import { WorkshopStore } from "./storage.ts"

export const WORKSHOP_OPERATIONS: readonly ScopeOperation[] = ["workshop.read", "workshop.list", "workshop.write", "workshop.delete"]

/** Scope comes exclusively from an admitted grant; session strings are only correlation keys. */
export function workshopBinding(services: ScopeServices, grant: ScopeGrant) {
  services.assertCurrent()
  assertScopeGrant(grant, "workshop.read")
  const store = new WorkshopStore(services.storageRoot, grant)
  return { key: `${grant.namespace}\0${grant.sessionKey}\0${grant.sessionId}`, store, grant }
}
