/** Opt-in AI Card execution-process preview (non-invasive projection). */

export type CardExecPreviewConfigInput = {
  cardProcessVar?: string;
  cardReasoningVar?: string;
};

export type ResolvedCardExecPreviewConfig = {
  /** True when process and/or reasoning vars are configured. */
  enabled: boolean;
  processVar?: string;
  reasoningVar?: string;
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
  const processVar = trimVar(config?.cardProcessVar);
  const reasoningVar = trimVar(config?.cardReasoningVar);
  return {
    enabled: Boolean(processVar || reasoningVar),
    ...(processVar ? { processVar } : {}),
    ...(reasoningVar ? { reasoningVar } : {}),
  };
}

function trimVar(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t || undefined;
}
