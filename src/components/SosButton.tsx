'use client';

// Hold-to-trigger emergency button. Holding for 2 s (configurable) prevents
// accidental alerts; releasing early cancels. Works with mouse, touch and
// keyboard (hold Space/Enter).

import { useCallback, useEffect, useRef, useState } from 'react';
import { TRACKING_CONFIG } from '@/lib/geo';
import { vibrate } from '@/lib/alerts';
import { Siren } from 'lucide-react';
import styles from './SosButton.module.css';

interface SosButtonProps {
  active: boolean;
  disabled?: boolean;
  onTrigger: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}

export default function SosButton({ active, disabled, onTrigger, onCancel }: SosButtonProps) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (startRef.current === null) return;
    const p = Math.min(1, (performance.now() - startRef.current) / TRACKING_CONFIG.sosHoldMs);
    setProgress(p);
    if (p >= 1 && !firedRef.current) {
      firedRef.current = true;
      vibrate([200, 100, 200]);
      void onTrigger();
      reset();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onTrigger, reset]);

  const begin = useCallback(() => {
    if (disabled || active || startRef.current !== null) return;
    firedRef.current = false;
    startRef.current = performance.now();
    vibrate(50);
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, active, tick]);

  useEffect(() => reset, [reset]);

  if (active) {
    return (
      <div className={styles.activeBox} role="alert">
        <div className={styles.activeTitle}>
          <Siren size={20} aria-hidden="true" /> SOS sent
        </div>
        <p>Your tracker owner has been alerted with your location. This is not a call to emergency services — if you are in danger, call your local emergency number.</p>
        <button type="button" className={`btn btn-secondary ${styles.cancelBtn}`} onClick={() => void onCancel()}>
          I&apos;m safe — cancel SOS
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.sos}
      disabled={disabled}
      style={{ ['--progress' as string]: `${progress * 360}deg` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        begin();
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      onPointerLeave={reset}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') reset();
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Emergency SOS. Press and hold for 2 seconds to alert the tracker owner."
    >
      <span className={styles.ring} aria-hidden="true" />
      <span className={styles.label}>
        SOS
        <small>{progress > 0 ? 'Keep holding' : 'Hold 2 s'}</small>
      </span>
    </button>
  );
}
