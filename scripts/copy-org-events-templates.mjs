/**
 * tsdown emits flat dist/*.mjs; import.meta.url then resolves templates next to those
 * chunks as dist/templates/. Copy seed assets there so gateway auto-send matches
 * admin test-send (which loads src/org-events/templates via tsx).
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
