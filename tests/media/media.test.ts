import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/media.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/media.ts')>();
  return {
    ...actual,
    uploadMediaToDingTalk: vi.fn(async (filePath: string) => ({
      mediaId: `@mid:${filePath}`,
      cleanMediaId: 'mid',
      downloadUrl: `https://down.dingtalk.com/media/mid`,
    })),
  };
});

import {
  BARE_IMAGE_PATH_RE,
  rewriteExplicitMediaTokens,
  toLocalPath,
} from '../../src/services/media/common.ts';
import { processLocalImages } from '../../src/services/media/image.ts';
import { uploadMediaToDingTalk } from '../../src/services/media.ts';

describe('media helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toLocalPath', () => {
    it.each([
      ['file:///tmp/image.png', '/tmp/image.png'],
      ['file:///C:/Users/a.png', '/C:/Users/a.png'],
      ['MEDIA:/var/folders/ab/cd/image.png', '/var/folders/ab/cd/image.png'],
      ['attachment:///Users/test/image.png', '/Users/test/image.png'],
      ['/Users/测试/图片%20一.png', '/Users/测试/图片 一.png'],
      ['/tmp/a.png', '/tmp/a.png'],
      ['', ''],
    ] as const)('"%s" -> "%s"', (raw, expected) => {
      expect(toLocalPath(raw)).toBe(expected);
    });

    it('should return raw when decodeURIComponent throws', () => {
      const invalid = '/path/%XXinvalid.png';
      expect(toLocalPath(invalid)).toBe(invalid);
    });
  });

  describe('rewriteExplicitMediaTokens', () => {
    it('wraps a bare OpenClaw MEDIA: image line as markdown', () => {
      const src =
        '工资单查询二维码如下：\n\nMEDIA:/home/mccxadmin/.openclaw/media/inbound/payroll_qrcode.png';
      expect(rewriteExplicitMediaTokens(src)).toBe(
        '工资单查询二维码如下：\n\n![](MEDIA:/home/mccxadmin/.openclaw/media/inbound/payroll_qrcode.png)',
      );
    });

    it('does not wrap unprefixed absolute paths (v0.8.9)', () => {
      const src = '路径是 /home/mccxadmin/.openclaw/media/inbound/payroll_qrcode.png';
      expect(rewriteExplicitMediaTokens(src)).toBe(src);
    });

    it('does not double-wrap markdown that already uses MEDIA:', () => {
      const src = '![](MEDIA:/tmp/a.png)';
      expect(rewriteExplicitMediaTokens(src)).toBe(src);
    });

    it('wraps file:// and attachment:// image tokens', () => {
      expect(rewriteExplicitMediaTokens('see file:///tmp/a.png')).toBe(
        'see ![](file:///tmp/a.png)',
      );
      expect(rewriteExplicitMediaTokens('see attachment:///tmp/b.jpg')).toBe(
        'see ![](attachment:///tmp/b.jpg)',
      );
    });

    it('strips wrapping backticks around MEDIA: tokens', () => {
      expect(rewriteExplicitMediaTokens('`MEDIA:/tmp/a.png`')).toBe(
        '![](MEDIA:/tmp/a.png)',
      );
    });
  });

  describe('BARE_IMAGE_PATH_RE', () => {
    it('does not parse MEDIA: as Windows drive A:', () => {
      const re = new RegExp(BARE_IMAGE_PATH_RE.source, BARE_IMAGE_PATH_RE.flags);
      const hits = [...'MEDIA:/tmp/a.png'.matchAll(re)].map((m) => m[0]);
      expect(hits.some((s) => /A:/i.test(s))).toBe(false);
    });
  });

  describe('processLocalImages', () => {
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    it('should return original content when oapiToken is null', async () => {
      const content = 'hello ![img](/tmp/a.png)';
      const result = await processLocalImages(content, null, log);
      expect(result).toBe(content);
      expect(log.warn).toHaveBeenCalled();
    });

    it('should return empty string when content is empty', async () => {
      const result = await processLocalImages('', 'token', log);
      expect(result).toBe('');
    });

    it('uploads rewritten MEDIA: tokens', async () => {
      const content = 'MEDIA:/home/mccxadmin/.openclaw/media/inbound/payroll_qrcode.png';
      const result = await processLocalImages(content, 'token', log);
      expect(uploadMediaToDingTalk).toHaveBeenCalledWith(
        'MEDIA:/home/mccxadmin/.openclaw/media/inbound/payroll_qrcode.png',
        'image',
        'token',
        20 * 1024 * 1024,
        log,
      );
      expect(result).toBe(
        '![](@mid:MEDIA:/home/mccxadmin/.openclaw/media/inbound/payroll_qrcode.png)',
      );
    });

    it('does not upload unprefixed bare png paths', async () => {
      const content = '/home/mccxadmin/.openclaw/media/inbound/payroll_qrcode.png';
      const result = await processLocalImages(content, 'token', log);
      expect(uploadMediaToDingTalk).not.toHaveBeenCalled();
      expect(result).toBe(content);
    });

    it('uploads markdown images already in the body at their original position', async () => {
      const png = '/home/mccxadmin/.openclaw/media/inbound/hr003-qrcode.png';
      const content = `扫码：\n\n![](${png})\n\n人工解答对接人：Penny`;
      const result = await processLocalImages(content, 'token', log);
      expect(uploadMediaToDingTalk).toHaveBeenCalled();
      expect(result).toBe(
        `扫码：\n\n![](@mid:${png})\n\n人工解答对接人：Penny`,
      );
    });
  });
});
