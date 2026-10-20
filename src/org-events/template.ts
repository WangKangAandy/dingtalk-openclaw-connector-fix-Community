import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ONBOARDING_TITLE = "新人指引";
export const ONBOARDING_SEED_FILES = ["new-employee.md", "city-contacts.png"] as const;

export function defaultStateDir(): string {
  return path.join(os.homedir(), ".openclaw", "dingtalk-org-events");
}

export function onboardingDir(stateDir: string): string {
  return path.join(stateDir, "onboarding");
}

export function renderOnboardingTemplate(
  markdown: string,
  fields: { name?: string },
): string {
  const name = fields.name?.trim() ?? "";
  const text = markdown.replaceAll("{{name}}", name);
  return name ? text : text.replace(/嗨，\s*，/g, "嗨，");
}

/** Turn ./images beside the template into absolute paths so the sender can upload them. */
export function resolveTemplateImages(markdown: string, baseDir: string): string {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt: string, raw: string) => {
    const target = raw.trim();
    if (/^(https?:|file:|MEDIA:|attachment:)/i.test(target) || path.isAbsolute(target)) return full;
    return `![${alt}](${path.resolve(baseDir, target)})`;
  });
}

/**
 * Locate bundled seed templates.
 * - Gateway + admin 1:1 test-send load dist (via dist/org-events-runtime.mjs) → dist/templates
 * - Dev / unit tests may resolve beside src/org-events → ./templates
 * - Fallback to packaged src/org-events/templates when dist/templates is missing.
 */
export function resolveBundledTemplatesDir(opts?: { here?: string }): string | null {
  const base = opts?.here ?? here;
  const candidates = [
    path.join(base, "templates"),
    path.join(base, "org-events", "templates"),
    path.join(base, "..", "templates"),
    path.join(base, "..", "src", "org-events", "templates"),
    path.join(base, "..", "..", "src", "org-events", "templates"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "new-employee.md"))) return dir;
  }
  return null;
}

/** Best-effort seed copy: never throw when the bundled asset is absent. */
export function copySeedIfMissing(from: string, to: string): boolean {
  if (fs.existsSync(to)) return false;
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

/**
 * Seed the editable copies once. Later publishes do not overwrite this directory.
 * Missing bundled assets (common when dist forgot to copy templates/) must not block
 * delivery if the editable markdown already exists — live docs may be text-only.
 */
export function ensureOnboardingContent(
  dir: string,
  opts?: { bundledDir?: string | null },
): void {
  fs.mkdirSync(dir, { recursive: true });
  const bundled =
    opts && "bundledDir" in opts ? opts.bundledDir ?? null : resolveBundledTemplatesDir();
  if (bundled) {
    for (const name of ONBOARDING_SEED_FILES) {
      copySeedIfMissing(path.join(bundled, name), path.join(dir, name));
    }
  }
  const settingsPath = path.join(dir, "settings.json");
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, `${JSON.stringify({ enabled: false }, null, 2)}\n`);
  }
  const markdownPath = path.join(dir, "new-employee.md");
  if (!fs.existsSync(markdownPath)) {
    throw new Error(
      `onboarding template missing: ${markdownPath}` +
        (bundled ? "" : " (bundled templates dir not found beside dist/ or src/)"),
    );
  }
}

export function readOnboardingEnabled(dir: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8")) as { enabled?: unknown };
    return raw.enabled === true;
  } catch {
    return false;
  }
}

export function loadOnboardingTemplate(dir: string): string {
  const markdown = fs.readFileSync(path.join(dir, "new-employee.md"), "utf8");
  return resolveTemplateImages(markdown, dir);
}
