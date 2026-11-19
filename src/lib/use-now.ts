'use client';

import { useEffect, useState } from 'react';

/** Re-renders the caller every `intervalMs` (pauses while the tab is hidden). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const startTimer = () => {
      if (timer) clearInterval(timer);
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') startTimer();
      else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    startTimer();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
  return now;
}
