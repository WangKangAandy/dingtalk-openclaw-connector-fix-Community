/**
 * 媒体处理公共常量和路径工具
 */

/** 文本文件扩展名 */
export const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.html', '.css',
  '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.sh', '.bat', '.csv',
]);

/** 图片文件扩展名 */
export const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|bmp|webp|tiff|svg)$/i;

/** 本地图片路径正则表达式（跨平台） */
export const LOCAL_IMAGE_RE =
  /!\[([^\]]*)\]\(((?:file:\/\/|MEDIA:|attachment:\/\/)[^)]+|\/(?:tmp|var|private|Users|home|root)[^)]+|[A-Za-z]:[\\/][^)]+)\)/g;

/** 纯文本图片路径（0.8.9 起不用于自动转图）。Windows 盘符要求前面不是字母，避免吃掉 `MEDIA:` 的 `A:`。 */
export const BARE_IMAGE_PATH_RE =
  /`?((?:\/(?:tmp|var|private|Users|home|root)\/[^\s`'",)]+|(?<![A-Za-z])[A-Za-z]:[\\/][^\s`'",)]+)\.(?:png|jpg|jpeg|gif|bmp|webp))`?/gi;

/**
 * 把 OpenClaw 裸 `MEDIA:` / `file://` / `attachment://` 图片标记改写成 `![](...)`，
 * 再交给 LOCAL_IMAGE_RE。已在 `](` 里的不重复包；无前缀裸路径不改（v0.8.9）。
 */
export function rewriteExplicitMediaTokens(content: string): string {
  if (!content) return content;
  return content.replace(
    /(?<!]\()`?((?:MEDIA:|file:\/\/\/?|attachment:\/\/)[^\s)`]+?\.(?:png|jpg|jpeg|gif|bmp|webp))`?/gi,
    '![]($1)',
  );
}

/** 视频标记正则表达式 */
export const VIDEO_MARKER_PATTERN = /\[DINGTALK_VIDEO\](.*?)\[\/DINGTALK_VIDEO\]/gs;

/** 音频标记正则表达式 */
export const AUDIO_MARKER_PATTERN = /\[DINGTALK_AUDIO\](.*?)\[\/DINGTALK_AUDIO\]/gs;

/** 文件标记正则表达式 */
export const FILE_MARKER_PATTERN = /\[DINGTALK_FILE\](.*?)\[\/DINGTALK_FILE\]/gs;

/**
 * 去掉 file:// / MEDIA: / attachment:// 前缀，得到实际的绝对路径
 */
export function toLocalPath(raw: string): string {
  let filePath = raw;
  if (filePath.startsWith('file://')) filePath = filePath.replace('file://', '');
  else if (filePath.startsWith('MEDIA:')) filePath = filePath.replace('MEDIA:', '');
  else if (filePath.startsWith('attachment://')) filePath = filePath.replace('attachment://', '');

  try {
    filePath = decodeURIComponent(filePath);
  } catch {
    // 解码失败则保持原样
  }
  return filePath;
}
