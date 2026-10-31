import { createRequire as nodeCreateRequire } from "node:module";
import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";

/**
 * 自实现的运行时存储工厂。OpenClaw 2026.8.1+ 提供 createPluginRuntimeStore；
 * 解析失败时回退到本地实现，避免扩展目录裸说明符加载失败。
 */
function createRuntimeStore<T>(errorMessage: string) {
  let runtimeValue: T | null = null;

  return {
    setRuntime: (next: T): void => {
      runtimeValue = next;
    },
    clearRuntime: (): void => {
      runtimeValue = null;
    },
    tryGetRuntime: (): T | null => {
      return runtimeValue;
    },
    getRuntime: (): T => {
      if (runtimeValue === null) {
        throw new Error(errorMessage);
      }
      return runtimeValue;
    },
  };
}

function createDingtalkRuntimeStore() {
  try {
    const require_ = nodeCreateRequire(import.meta.url);
    const { createPluginRuntimeStore } = require_("openclaw/plugin-sdk/runtime-store");
    return createPluginRuntimeStore<PluginRuntime>({
      pluginId: "dingtalk-connector",
      errorMessage: "DingTalk runtime not initialized",
    });
  } catch {
    return createRuntimeStore<PluginRuntime>("DingTalk runtime not initialized");
  }
}

const { setRuntime: setDingtalkRuntime, getRuntime: getDingtalkRuntime } =
  createDingtalkRuntimeStore();

export { getDingtalkRuntime, setDingtalkRuntime };
