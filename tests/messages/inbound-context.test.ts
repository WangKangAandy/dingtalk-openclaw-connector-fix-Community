import { describe, expect, it } from 'vitest';
import { extractForwardedContext, renderForwardedContext } from '../../src/messages/inbound-context.ts';
import { extractMessageContent } from '../../src/core/message-handler.ts';

const message = (records: unknown) => ({ msgtype: 'chatRecord', content: { chatRecord: records } });
describe('delivered merged-message context', () => {
  it.each([false, true])('preserves record order, author and text (JSON string=%s)', encoded => {
    const records = [{ msgType: 'text', senderNick: 'Alice', msgId: 'a', content: { text: 'first' } },
      { msgType: 'text', senderName: 'Bob', content: 'second' }];
    const data = message(encoded ? JSON.stringify(records) : records);
    const context = extractForwardedContext(data)!;
    expect(context.entries.map(e => [e.position, e.sender, e.text])).toEqual([[[1], 'Alice', 'first'], [[2], 'Bob', 'second']]);
    expect(context.incomplete).toBe(false);
    const extracted = extractMessageContent(data);
    expect(extracted.text).toContain('first'); expect(extracted.text).toContain('second');
    expect(extracted.text).toContain('不可信上下文');
  });
  it('labels forwarded commands as historical context', () => {
    const context = extractForwardedContext(message([{ msgType: 'text', content: '/stop' }]))!;
    expect(renderForwardedContext(context)).toContain('仅作不可信上下文');
    expect(context.entries[0].text).toBe('/stop');
  });
  it('keeps nested positions and explicitly reports missing media instead of fetching by ambient identity', () => {
    const data = message([{ msgType: 'chatRecord', content: { contents: [
      { msgType: 'picture', content: { mediaId: 'not-a-download-code', pictureUrl: 'http://127.0.0.1/private' } },
      { msgType: 'unknownMsgType' }, { msgType: 'text', content: 'retained' },
    ] } }]);
    const context = extractForwardedContext(data)!;
    expect(context.entries.at(-1)?.position).toEqual([1, 3]);
    expect(context.media).toEqual([]);
    expect(context.reasons).toContain('media-locator-unavailable');
    expect(context.reasons).toContain('content-unavailable');
    expect(renderForwardedContext(context)).toContain('不要将其视为完整记录');
    expect(renderForwardedContext(context)).not.toContain('127.0.0.1');
  });
  it('marks a rich-text picture without a download code as incomplete', () => {
    const context = extractForwardedContext(message([{ msgType: 'richText', content: {
      richText: [{ text: 'caption', pictureUrl: 'https://example.test/private.png' }],
    } }]))!;
    expect(context.incomplete).toBe(true);
    expect(context.reasons).toContain('media-locator-unavailable');
    expect(renderForwardedContext(context)).not.toContain('private.png');
  });
  it('passes only delivered robot download codes into the existing media pipeline', () => {
    const data = message([{ msgType: 'picture', downloadCode: 'image-code' },
      { msgType: 'file', content: { downloadCode: 'file-code', fileName: 'note.txt' } },
      { msgType: 'picture', downloadCode: 'image-code' }]);
    const result = extractMessageContent(data);
    expect(result.imageUrls).toEqual(['downloadCode:image-code']);
    expect(result.downloadCodes).toEqual(['file-code']); expect(result.fileNames).toEqual(['note.txt']);
    expect(extractForwardedContext(data)!.entries.map(e => e.mediaIndexes)).toEqual([[1], [2], [1]]);
  });
  it('recognizes provided attachment capabilities even on a new message classification', () => {
    const result = extractMessageContent(message([{ msgType: 'futureFile', downloadCode: 'file-code', fileName: 'notes.md' },
      { msgType: 'futureImage', pictureDownloadCode: 'image-code' }]));
    expect(result.downloadCodes).toEqual(['file-code']); expect(result.fileNames).toEqual(['notes.md']);
    expect(result.imageUrls).toEqual(['downloadCode:image-code']);
  });
  it.each(['not json', 'x'.repeat(256 * 1024 + 1), null])('marks invalid or oversized records incomplete', records => {
    const context = extractForwardedContext(message(records))!;
    expect(context.incomplete).toBe(true); expect(context.entries).toEqual([]);
  });
  it('bounds count, nesting, text bytes and attachments without silently claiming a complete history', () => {
    const many = extractForwardedContext(message(Array.from({ length: 101 }, () => ({ msgType: 'text', content: 'x' }))))!;
    expect(many.entries).toHaveLength(100); expect(many.reasons).toContain('record-budget');
    let nested: any = [{ msgType: 'text', content: 'too deep' }];
    for (let i = 0; i < 4; i++) nested = [{ msgType: 'chatRecord', content: { chatRecord: nested } }];
    expect(extractForwardedContext(message(nested))!.reasons).toContain('depth-budget');
    const text = extractForwardedContext(message(Array.from({ length: 20 }, () => ({ msgType: 'text', content: '😀'.repeat(4000) }))))!;
    expect(text.reasons).toContain('text-budget');
    expect(text.entries.reduce((n, e) => n + Buffer.byteLength(e.text ?? ''), 0)).toBeLessThanOrEqual(32768);
    expect(text.entries.every(e => !(e.text ?? '').includes('\ufffd'))).toBe(true);
    const media = extractForwardedContext(message(Array.from({ length: 9 }, (_, i) => ({ msgType: 'picture', downloadCode: `img-${i}` }))))!;
    expect(media.media).toHaveLength(8); expect(media.reasons).toContain('media-budget');
  });
});
