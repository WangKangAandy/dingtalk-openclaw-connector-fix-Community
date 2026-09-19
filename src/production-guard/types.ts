export type ProductionWriteGuardConfig = {
  enabled: boolean
  paths: string[]
  blockUnknownMutationTools: boolean
}

export type ProductionGuardDecision =
  | { action: "allow" }
  | { action: "block"; reason: string }
