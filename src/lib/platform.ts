'use client';

import { useEffect, useState } from 'react';

export type Platform = 'android' | 'ios' | 'desktop';

export function detectPlatform(ua: string, maxTouchPoints = 0, platform = ''): Platform {
  if (/Android/i.test(ua)) return 'android';
  // iPadOS reports itself as a Mac with a touch screen.
  if (/iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

/** The visitor's platform, or null until it is known on the client. */
export function usePlatform(): Platform | null {
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => {
    setPlatform(detectPlatform(navigator.userAgent, navigator.maxTouchPoints, navigator.platform));
  }, []);
  return platform;
}
