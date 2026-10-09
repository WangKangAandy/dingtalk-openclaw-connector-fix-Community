import type { DingtalkConfig } from "../types/index.ts";
import type { OrgEventLog } from "./types.ts";

const LOCAL_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;

/** Official markdown accepts a mediaId or a public URL in the same message as the text. */
async function inlineUploadedImages(
  content: string,
  config: DingtalkConfig,
  log: OrgEventLog | undefined,
): Promise<string> {
  const matches = [...content.matchAll(LOCAL_IMAGE)];
  const pending = matches.filter((match) => {
    const target = match[2].trim();
    return !/^https?:/i.test(target) && !target.startsWith("@");
  });
  if (pending.length === 0) return content;

  const { getOapiAccessToken } = await import("../utils/index.ts");
  const { uploadMediaToDingTalk } = await import("../services/media.ts");
  const oapiToken = await getOapiAccessToken(config);
  if (!oapiToken) throw new Error("onboarding image upload needs an oapi token");

  let result = content;
  for (const match of pending) {
    const [full, alt, raw] = match;
    const uploaded = await uploadMediaToDingTalk(raw.trim(), "image", oapiToken, 10 * 1024 * 1024, log);
    if (!uploaded?.mediaId) throw new Error(`onboarding image upload failed: ${raw.trim()}`);
    result = result.replace(full, `![${alt}](${uploaded.mediaId})`);
  }
  return result;
}

export async function deliverOrgEvent(
  config: DingtalkConfig,
  log: OrgEventLog | undefined,
  params: { userId: string; content: string; title: string },
): Promise<void> {
  const { sendProactive } = await import("../services/messaging.ts");
  const text = await inlineUploadedImages(params.content, config, log);
  const images = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  log?.info?.(`[org-events] markdown images: ${images.join(", ") || "(none)"}`);
  await sendProactive(config, { userId: params.userId }, text, {
    msgType: "markdown",
    title: params.title,
    useAICard: true,
    log,
  });
}
