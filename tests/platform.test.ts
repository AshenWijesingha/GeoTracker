import { describe, expect, it } from 'vitest';
import { detectPlatform } from '../src/lib/platform';

describe('detectPlatform', () => {
  it('detects Android phones', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131 Mobile')).toBe('android');
  });

  it('detects iPhone', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')).toBe('ios');
  });

  it('detects iPadOS, which reports a Mac user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5, 'MacIntel')).toBe('ios');
  });

  it('treats a Mac without touch as desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0, 'MacIntel')).toBe('desktop');
  });

  it('treats Windows as desktop', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131')).toBe('desktop');
  });
});
