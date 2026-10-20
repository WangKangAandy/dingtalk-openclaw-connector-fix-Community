/**
 * tsdown emits flat dist/*.mjs; resolveBundledTemplatesDir then looks for
 * dist/templates next to those chunks. Copy seed assets there so gateway and
 * admin 1:1 test-send (dist/org-events-runtime) share one bundle — no src fallback.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "src", "org-events", "templates");
const to = path.join(root, "dist", "templates");

if (!fs.existsSync(from)) {
  console.error(`[copy-org-events-templates] missing source: ${from}`);
  process.exit(1);
}

fs.mkdirSync(to, { recursive: true });
for (const name of fs.readdirSync(from)) {
  fs.copyFileSync(path.join(from, name), path.join(to, name));
}
console.log(`[copy-org-events-templates] ${from} -> ${to}`);
