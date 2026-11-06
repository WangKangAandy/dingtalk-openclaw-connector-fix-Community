import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store"
let runtime: PluginRuntime | undefined
export function setWorkshopRuntime(value: PluginRuntime) { runtime = value }
export function getWorkshopRuntime(): PluginRuntime {
  if (!runtime) throw new Error("Scoped Workshop is not registered")
  return runtime
}
export function workshopLog() {
  const log = getWorkshopRuntime().logging.getChildLogger({ plugin: "dingtalk-scoped-workshop" })
  return { debug: (s: string) => log.debug?.(s), warn: (s: string) => log.warn(s), info: (s: string) => log.info(s) }
}
