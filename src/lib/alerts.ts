'use client';

import { withBasePath } from './paths';

// Audible alarm (Web Audio, no asset files) and browser notifications used for
// SOS and battery alerts on the dashboard.

let audioCtx: AudioContext | null = null;
let alarmTimer: ReturnType<typeof setInterval> | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => undefined);
  return audioCtx;
}

/** Call from a user gesture so later alarms are allowed to play. */
export function unlockAudio(): void {
  getAudioContext();
}

export function beep(frequency = 880, durationMs = 180, volume = 0.25): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
}

/** Repeating two-tone siren until stopAlarm() is called. */
export function startAlarm(): void {
  if (alarmTimer) return;
  const pattern = () => {
    beep(988, 220);
    setTimeout(() => beep(740, 220), 260);
  };
  pattern();
  alarmTimer = setInterval(pattern, 1200);
}

export function stopAlarm(): void {
  if (alarmTimer) clearInterval(alarmTimer);
  alarmTimer = null;
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function notify(title: string, body: string, tag?: string): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    // Prefer the service worker so notifications also work on Android.
    if (navigator.serviceWorker?.controller) {
      void navigator.serviceWorker.ready.then((reg) =>
        reg.showNotification(title, { body, tag, icon: withBasePath('/icons/icon-192.png'), badge: withBasePath('/icons/icon-192.png') }),
      );
      return;
    }
    new Notification(title, { body, tag });
  } catch {
    // Some browsers throw when constructing Notification outside a SW.
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // unsupported
  }
}
