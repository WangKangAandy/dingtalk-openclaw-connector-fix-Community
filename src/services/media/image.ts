/**
 * 图片处理模块
 * 支持图片上传、本地路径处理
 */

// 本地类型定义
interface Logger {
  info?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
  debug?: (...args: any[]) => void;
  [key: string]: any;
}

import {
  LOCAL_IMAGE_RE,
  rewriteExplicitMediaTokens,
} from './common.ts';
import {uploadMediaToDingTalk} from '../media.ts'
/**
 * 扫描内容中的本地图片路径，上传到钉钉并替换为标准 Markdown 图片语法
 *
 * 先把 OpenClaw 裸 `MEDIA:` / `file://` / `attachment://` 改写成 `![](...)`，
 * 再上传本地文件并替换为 ![文案](mediaId)。
 * 无前缀的裸路径（如 `/home/a.png`）不转图（v0.8.9）。
 * payload.mediaUrl 是附件通道，不在这里折进正文。
 */
export async function processLocalImages(
  content: string,
  oapiToken: string | null,
  log?: Logger,
): Promise<string> {
  let result = content;
  if (!oapiToken) {
    log?.warn?.(`[DingTalk][Media] 无 oapiToken，跳过图片后处理`);
    return result;
  }

  result = rewriteExplicitMediaTokens(result);

  // 匹配 markdown 图片语法 ![alt](path)（含刚改写的 MEDIA: 标记）
  const mdMatches = [...result.matchAll(LOCAL_IMAGE_RE)];
  if (mdMatches.length > 0) {
    log?.info?.(`[DingTalk][Media] 检测到 ${mdMatches.length} 个 markdown 图片，开始上传...`);
    for (const match of mdMatches) {
      const [fullMatch, alt, rawPath] = match;
      const cleanPath = rawPath.replace(/\\ /g, ' ');
      const uploaded = await uploadMediaToDingTalk(cleanPath, 'image', oapiToken, 20 * 1024 * 1024, log);
      const mediaId = uploaded?.mediaId;
      if (mediaId) {
        const replacement = `![${alt}](${mediaId})`;
        result = result.replace(fullMatch, replacement);
        log?.info?.(`[DingTalk][Media] 图片已替换为 Markdown 格式: ${replacement}`);
      }
    }
  }

  return result;
}
