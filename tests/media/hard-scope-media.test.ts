import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureOutboundMediaPolicy, withOutboundMediaPolicy, automaticMediaBlocked, bindOutboundMediaCallbacks, BLOCKED_MEDIA_NOTICE } from '../../src/services/media/outbound-policy.ts';
import { uploadMediaToDingTalk, extractVideoMetadata, extractVideoThumbnail,
  processVideoMarkers, processAudioMarkers, processFileMarkers, processRawMediaPaths } from '../../src/services/media.ts';
import { processLocalImages } from '../../src/services/media/image.ts';
import { uploadAndReplaceFileMarkers } from '../../src/services/media/file.ts';
import { processVideoMarkers as modularVideo, extractVideoMetadata as modularMetadata } from '../../src/services/media/video.ts';
import { processAudioMarkers as modularAudio } from '../../src/services/media/audio.ts';
import { sendMediaToDingTalk } from '../../src/services/messaging.ts';
import { createOutboundMediaChannel } from '../../src/services/media/outbound.ts';

let root: string, privateFile: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-boundary-'));
  privateFile = path.join(root, 'other-user.txt');
  fs.writeFileSync(privateFile, 'PRIVATE_OTHER_USER_SENTINEL');
  configureOutboundMediaPolicy(true);
});
afterEach(() => { vi.restoreAllMocks(); configureOutboundMediaPolicy(false); fs.rmSync(root, { recursive: true, force: true }); });

it('rejects host upload and metadata reads before filesystem inspection or network', async () => {
  const stat = vi.spyOn(fs, 'statSync'), exists = vi.spyOn(fs, 'existsSync'), read = vi.spyOn(fs, 'createReadStream');
  for (const action of [
    () => uploadMediaToDingTalk(privateFile, 'file', 'fixture-token'),
    () => extractVideoMetadata(privateFile),
    () => modularMetadata(privateFile),
    () => extractVideoThumbnail(privateFile, path.join(root, 'thumbnail.png')),
    () => sendMediaToDingTalk({ config: {} as any, target: 'Alice', mediaUrl: privateFile }),
  ]) await expect(action()).rejects.toThrow(BLOCKED_MEDIA_NOTICE);
  expect(stat).not.toHaveBeenCalled(); expect(exists).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
});

it('keeps all text/card/async media parsers from interpreting model paths as file authority', async () => {
  const exists = vi.spyOn(fs, 'existsSync'), read = vi.spyOn(fs, 'createReadStream');
  const marker = (kind: string) => `[DINGTALK_${kind}]${JSON.stringify({ path: privateFile })}[/DINGTALK_${kind}]`;
  for (const [process, kind] of [[processVideoMarkers, 'VIDEO'], [modularVideo, 'VIDEO'],
    [processAudioMarkers, 'AUDIO'], [modularAudio, 'AUDIO'], [processFileMarkers, 'FILE'], [uploadAndReplaceFileMarkers, 'FILE']] as const) {
    expect(await process(marker(kind), '', {} as any, 'fixture-token')).toContain(BLOCKED_MEDIA_NOTICE);
  }
  expect(await processLocalImages(`![](file://${privateFile})`, 'fixture-token')).toContain(BLOCKED_MEDIA_NOTICE);
  expect(await processRawMediaPaths(` ${privateFile} `, {} as any, 'fixture-token')).toContain(BLOCKED_MEDIA_NOTICE);
  expect(await processRawMediaPaths('ordinary answer', {} as any, 'fixture-token')).toBe('ordinary answer');
  expect(exists).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
});

it('rejects payload attachments including empty-body replies and retains restriction after reload', async () => {
  const log = { error: vi.fn() };
  const channel = createOutboundMediaChannel({ config: {} as any, isDirect: true, senderId: 'Alice', conversationId: 'dm', log });
  configureOutboundMediaPolicy(false);
  const payload = { mediaUrls: [privateFile, 'file:///other/user/private.txt', 'https://example.com/media.png'] };
  expect(channel.blockedNotice(payload)).toBe(BLOCKED_MEDIA_NOTICE);
  expect(channel.remember(payload, '')).toBe(0);
  await channel.flush();
  expect(log.error).toHaveBeenCalledWith(BLOCKED_MEDIA_NOTICE);
});

it('keeps old asynchronous turns restricted after reload without contaminating unrelated contexts', async () => {
  configureOutboundMediaPolicy(false);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve });
  const pending = withOutboundMediaPolicy(true, async () => {
    await gate;
    await withOutboundMediaPolicy(false, async () => {
      expect(automaticMediaBlocked()).toBe(true);
      await expect(uploadMediaToDingTalk(privateFile, 'file', 'fixture-token')).rejects.toThrow(BLOCKED_MEDIA_NOTICE);
    });
  });
  expect(automaticMediaBlocked()).toBe(false);
  configureOutboundMediaPolicy(true); configureOutboundMediaPolicy(false);
  release(); await pending;
  expect(automaticMediaBlocked()).toBe(false);
});

it('binds callbacks invoked from a new async chain after reload', async () => {
  const callbacks = withOutboundMediaPolicy(true, () => bindOutboundMediaCallbacks({
    deliver: async () => uploadMediaToDingTalk(privateFile, 'file', 'fixture-token'),
    onIdle: async () => processLocalImages(`![](file://${privateFile})`, 'fixture-token'),
  }, automaticMediaBlocked()));
  configureOutboundMediaPolicy(false);
  expect(automaticMediaBlocked()).toBe(false);
  await expect(callbacks.deliver()).rejects.toThrow(BLOCKED_MEDIA_NOTICE);
  expect(await callbacks.onIdle()).toContain(BLOCKED_MEDIA_NOTICE);
  expect(automaticMediaBlocked()).toBe(false);
});
