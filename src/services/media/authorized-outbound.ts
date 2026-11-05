import path from "node:path"
import FormData from "form-data"
import { loadOutboundMediaFromUrl } from "openclaw/plugin-sdk/outbound-media"
import type { DingtalkConfig } from "../../types/index.ts"
import { DINGTALK_API, DINGTALK_OAPI, getAccessToken, getOapiAccessToken } from "../../utils/index.ts"
import { dingtalkHttp, dingtalkOapiHttp } from "../../utils/http-client.ts"

type Access = { localRoots?: readonly string[]; readFile?: (filePath: string) => Promise<Buffer>; workspaceDir?: string }
/** Consume the host's media capability, never reopen a model-authored path with fs. */
export async function sendAuthorizedMedia(params: {
  config: DingtalkConfig; target: string; mediaUrl: string; mediaAccess?: Access;
  mediaLocalRoots?: readonly string[]; mediaReadFile?: (path: string) => Promise<Buffer>;
}) {
  const read = params.mediaAccess?.readFile ?? params.mediaReadFile
  const roots = params.mediaAccess?.localRoots ?? params.mediaLocalRoots
  if (!read || !roots?.length) throw new Error("Host-authorized file reader and roots are required")
  if (/^[a-z][a-z0-9+.-]*:/i.test(params.mediaUrl) && !params.mediaUrl.startsWith("file:")) throw new Error("This file delivery accepts authorized local files only")
  const loaded = await loadOutboundMediaFromUrl(params.mediaUrl, { maxBytes: 20 * 1024 * 1024, optimizeImages: false,
    mediaAccess: { ...params.mediaAccess, localRoots: roots, readFile: read } })
  const filename = path.basename(loaded.fileName || params.mediaUrl)
  if (!filename || /[\r\n\0]/.test(filename)) throw new Error("Invalid attachment filename")
  const isImage = /^image\/(png|jpeg|gif|webp|bmp)$/.test(loaded.contentType ?? "")
  if (isImage && loaded.buffer.length > 10 * 1024 * 1024) throw new Error("Image exceeds DingTalk size limit")
  const oapiToken = await getOapiAccessToken(params.config)
  if (!oapiToken) throw new Error("DingTalk upload authentication unavailable")
  const form = new FormData(); form.append("media", loaded.buffer, { filename, contentType: loaded.contentType || "application/octet-stream" })
  const uploaded = await dingtalkOapiHttp.post(`${DINGTALK_OAPI}/media/upload?access_token=${oapiToken}&type=${isImage ? "image" : "file"}`, form,
    { headers: form.getHeaders(), timeout: 60_000 })
  const mediaId = uploaded.data?.media_id
  if (typeof mediaId !== "string" || !mediaId) throw new Error("DingTalk did not acknowledge media upload")
  const token = await getAccessToken(params.config)
  const group = params.target.startsWith("group:") || params.target.startsWith("cid")
  const target = params.target.replace(/^(group|user):/, "")
  const body = { robotCode: String(params.config.clientId), msgKey: isImage ? "sampleImageMsg" : "sampleFile",
    msgParam: JSON.stringify(isImage ? { photoURL: mediaId } : { mediaId, fileName: filename, fileType: path.extname(filename).slice(1) || "file" }),
    ...(group ? { openConversationId: target } : { userIds: [target] }) }
  const sent = await dingtalkHttp.post(`${DINGTALK_API}/v1.0/robot/${group ? "groupMessages/send" : "oToMessages/batchSend"}`, body,
    { headers: { "x-acs-dingtalk-access-token": token, "Content-Type": "application/json" }, timeout: 15_000 })
  if (typeof sent.data?.processQueryKey !== "string" || !sent.data.processQueryKey) throw new Error("DingTalk did not acknowledge file delivery; do not retry automatically")
  return { ok: true, usedAICard: false, processQueryKey: sent.data.processQueryKey }
}
