import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bundledDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");

export const ONBOARDING_TITLE = "新人指引";

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

function copyIfMissing(from: string, to: string): void {
  if (!fs.existsSync(to)) fs.copyFileSync(from, to);
}

/** Seed the editable copies once. Later publishes do not overwrite this directory. */
export function ensureOnboardingContent(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  copyIfMissing(path.join(bundledDir, "new-employee.md"), path.join(dir, "new-employee.md"));
  copyIfMissing(path.join(bundledDir, "city-contacts.png"), path.join(dir, "city-contacts.png"));
  const settingsPath = path.join(dir, "settings.json");
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, `${JSON.stringify({ enabled: false }, null, 2)}\n`);
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
