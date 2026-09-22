#!/usr/bin/env node
/**
 * Minimal in-place edit of resolveToolErrorWarningPolicy for openclaw@2026.7.1-2.
 * Prefer hashed-filename discovery via apply.sh; this script only mutates one file.
 */
import fs from "node:fs";

const target = process.argv[2];
if (!target) {
  console.error("usage: apply-in-place.mjs <payloads-bundle.js>");
  process.exit(2);
}

const src = fs.readFileSync(target, "utf8");

const oldBlock = `	if (params.lastToolError.mutatingAction ?? isLikelyMutatingToolName(params.lastToolError.toolName)) return {
		showWarning: !params.hasUserFacingErrorReply && !params.hasUserFacingFailureAcknowledgement,
		includeDetails
	};
	if (isExecLikeToolName(params.lastToolError.toolName) && !includeDetails) return {
		showWarning: false,
		includeDetails
	};
	return {
		showWarning: !params.hasUserFacingReply && !isRecoverableToolError(params.lastToolError.error),
		includeDetails
	};`;

const newBlock = `	// Exec/bash: a successful user-facing reply is recovery proof (upstream #103574).
	// Must run before the mutating-tool branch — exec is classified as mutating in 2026.7.1-2.
	if (isExecLikeToolName(params.lastToolError.toolName)) return {
		showWarning: !params.hasUserFacingReply,
		includeDetails
	};
	if (params.lastToolError.mutatingAction ?? isLikelyMutatingToolName(params.lastToolError.toolName)) return {
		showWarning: !params.hasUserFacingErrorReply && !params.hasUserFacingFailureAcknowledgement,
		includeDetails
	};
	return {
		showWarning: !params.hasUserFacingReply && !isRecoverableToolError(params.lastToolError.error),
		includeDetails
	};`;

if (!src.includes(oldBlock)) {
  console.error("expected policy block not found; refuse to patch");
  process.exit(1);
}
if (src.includes("successful user-facing reply is recovery proof")) {
  console.error("patch marker already present");
  process.exit(1);
}

fs.writeFileSync(target, src.replace(oldBlock, newBlock));
console.log("rewrote", target);
