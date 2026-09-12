import { extractStorageKeyFromUrl, generateUniqueKey } from './r2';

describe('extractStorageKeyFromUrl', () => {
  it('keeps dotted WhatsApp product video keys', () => {
    const url =
      'https://pub-27d923fc51bd45e38b833c532297d281.r2.dev/videos/home/20260911-eaeedd21-whatsapp-video-2026-09-11-at-2.01.33-pm.mp4?v=1789125280582';
    expect(extractStorageKeyFromUrl(url)).toBe(
      'videos/home/20260911-eaeedd21-whatsapp-video-2026-09-11-at-2.01.33-pm.mp4',
    );
  });
});

describe('generateUniqueKey', () => {
  it('uses .mp4 for WhatsApp filenames that contain extra dots', () => {
    const key = generateUniqueKey(
      'videos/home',
      'WhatsApp Video 2026-09-11 at 2.01.33 PM.mp4',
      'video/mp4',
    );
    expect(key.startsWith('videos/home/')).toBe(true);
    expect(key.endsWith('.mp4')).toBe(true);
    expect(key).toContain('whatsapp-video-2026-09-11-at-2-01-33-pm');
    expect(key).not.toMatch(/\.01\./);
  });
});
