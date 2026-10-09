import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bundledTemplate = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "templates",
  "new-employee.md",
);

export function renderOnboardingTemplate(
  markdown: string,
  fields: { name?: string; userId?: string },
): string {
  const name = fields.name?.trim() ?? "";
  const userId = fields.userId?.trim() ?? "";
  let text = markdown.replaceAll("{{userId}}", userId).replaceAll("{{name}}", name);
  if (!name) {
    text = text.replace(/你好，/g, "你好");
    text = text.replace(/你好\s*，/g, "你好");
    text = text.replace(/你好\s*,/g, "你好,");
    text = text.replace(/嗨，\s*，/g, "嗨，");
  }
  return text;
}

/** Turn ./images beside the template into absolute paths so sendProactive can upload them. */
export function resolveTemplateImages(markdown: string, baseDir: string): string {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (full, alt: string, raw: string) => {
    const target = raw.trim();
    if (/^(https?:|file:|MEDIA:|attachment:)/i.test(target) || path.isAbsolute(target)) return full;
    return `![${alt}](${path.resolve(baseDir, target)})`;
  });
}

export function loadTemplate(templatePath?: string): string {
  const target = templatePath?.trim() || bundledTemplate;
  const markdown = fs.readFileSync(target, "utf8");
  return resolveTemplateImages(markdown, path.dirname(target));
}

export function bundledTemplatePath(): string {
  return bundledTemplate;
}
