/** Public host facts used for lifetime checks; no identity is inferred from these values. */
export type ScopeSessionFacts = Readonly<{
  agentId: string
  sessionKey: string
  sessionId: string
}>

export type ScopeSessionEntry = {
  sessionId?: string
  lifecycleRevision?: string
  archived?: boolean
  archivedAt?: number
  permissionMode?: unknown
  toolOverrides?: unknown
  [key: string]: unknown
}

export type CaptureScopeSessionLease = (facts: ScopeSessionFacts) => () => void

/**
 * readLatest must use the public host getSessionEntry(readConsistency:"latest") API,
 * not a JSON transcript, a cached hook object, or inferred session-key components.
 * Background execution is admitted separately by the host's native fork lifecycle.
 */
export function captureScopeSessionLease(
  facts: ScopeSessionFacts,
  readLatest: () => ScopeSessionEntry | undefined,
): () => void {
  const expected = Object.freeze({ ...facts })
  const entry = readLatest()
  if (!expected.agentId || !expected.sessionKey || !expected.sessionId || !entry
    || entry.sessionId !== expected.sessionId
    || (entry.lifecycleRevision !== undefined && (typeof entry.lifecycleRevision !== "string" || !entry.lifecycleRevision))
    || entry.archived === true || entry.archivedAt !== undefined) throw new Error("Cannot capture a current host session lease")
  // The official SessionEntry contract permits an absent initial revision. It is
  // an exact generation value, NOT a wildcard: undefined -> UUID on the first
  // reset invalidates this lease even when the host preserves sessionId.
  const revision = entry.lifecycleRevision
  const policy = JSON.stringify([entry.permissionMode ?? null, entry.toolOverrides ?? null])
  let revoked = false
  return () => {
    if (revoked) throw new Error("Host session lease revoked")
    try {
      const current = readLatest()
      if (!current || current.sessionId !== expected.sessionId || current.lifecycleRevision !== revision
        || current.archived === true || current.archivedAt !== undefined
        || JSON.stringify([current.permissionMode ?? null, current.toolOverrides ?? null]) !== policy) {
        throw new Error("Host session incarnation or policy changed")
      }
    } catch (error) { revoked = true; throw error }
  }
}
