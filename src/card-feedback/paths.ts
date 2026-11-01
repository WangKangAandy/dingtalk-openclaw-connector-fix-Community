import os from "node:os";
import path from "node:path";

/** Append-only feedback log under the OpenClaw mutable state directory. */
export const CARD_FEEDBACK_LOG_NAME = "dingtalk-card-feedback.jsonl";

/**
 * Resolve OpenClaw mutable state dir.
 * Precedence: OPENCLAW_STATE_DIR > $OPENCLAW_HOME/.openclaw > ~/.openclaw
 */
export function resolveOpenClawStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENCLAW_STATE_DIR?.trim();
  if (override) return override;
  const home = env.OPENCLAW_HOME?.trim() || os.homedir();
  return path.join(home, ".openclaw");
}

export function resolveCardFeedbackLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveOpenClawStateDir(env), CARD_FEEDBACK_LOG_NAME);
}
