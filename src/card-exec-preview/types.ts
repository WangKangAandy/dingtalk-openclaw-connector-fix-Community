/** Opt-in AI Card execution-process preview (non-invasive projection). */

export type CardExecPreviewConfigInput = {
  cardProcessVar?: string;
  cardReasoningVar?: string;
  cardToolVar?: string;
  cardContentVar?: string;
  cardFeedbackStatusKey?: string;
};

export type ResolvedCardExecPreviewConfig = {
  /** Existing templates may name the public summary variable "reasoning". */
  enabled: boolean;
  processVar?: string;
  summaryVar?: string;
};

export type CardExecPreviewLog = {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
};

export function resolveCardExecPreviewConfig(
  config?: CardExecPreviewConfigInput | null,
): ResolvedCardExecPreviewConfig {
  const processVar = trimVar(config?.cardProcessVar) || trimVar(config?.cardToolVar);
  const summaryVar = trimVar(config?.cardReasoningVar);
  const reserved = new Set([trimVar(config?.cardContentVar) || "msgContent", trimVar(config?.cardFeedbackStatusKey) || "like",
    "flowStatus", "config", "staticMsgContent", "sys_full_json_obj", "__proto__", "constructor", "prototype"]);
  if ([processVar, summaryVar].some(v => v && reserved.has(v)) || processVar && processVar === summaryVar) {
    throw new Error("AI Card progress variables must be distinct from the body, feedback and reserved variables");
  }
  return {
    enabled: Boolean(processVar || summaryVar),
    ...(processVar ? { processVar } : {}),
    ...(summaryVar ? { summaryVar } : {}),
  };
}

function trimVar(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (t.length > 128 || /[\x00-\x1f]/.test(t)) throw new Error("AI Card progress variable name is invalid");
  return t || undefined;
}
