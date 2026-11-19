'use client';

import { useEffect } from 'react';
import { withBasePath } from '@/lib/paths';

/** Registers the service worker (production builds only, to keep dev fresh). */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register(withBasePath('/sw.js'), { scope: withBasePath('/') })
        .catch((err) => console.warn('Service worker registration failed:', err));
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
