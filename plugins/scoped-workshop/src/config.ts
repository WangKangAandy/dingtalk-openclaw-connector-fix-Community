import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts"
export const PLUGIN_ID = "dingtalk-scoped-workshop"
export function resolveSkillWorkshopConfig(config?: OpenClawConfig) {
  const raw = config?.plugins?.entries?.[PLUGIN_ID]?.config as { autonomous?: { mode?: string } } | undefined
  return { autonomous: { mode: raw?.autonomous?.mode === "auto" ? "auto" : "off" } }
}
export function assertReplacement(config: OpenClawConfig) {
  if (config.meta?.migrations?.skillWorkshopPlugin !== true) {
    throw new Error("Migrate the pre-plugin Skill Workshop policy before selecting the scoped replacement")
  }
  if (config.plugins?.entries?.["skill-workshop"]?.enabled !== false) {
    throw new Error("Disable bundled skill-workshop explicitly before enabling dingtalk-scoped-workshop")
  }
}
