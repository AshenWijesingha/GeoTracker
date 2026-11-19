'use client';

// Adaptive, battery-friendly location sharing for the tracked device.
//
// Instead of polling getCurrentPosition() + re-fetching the IP every 15 s, the
// hook keeps a single watchPosition() subscription and decides per fix whether
// it is worth uploading:
//   • moving      → at most one upload every `movingIntervalMs`
//   • stationary  → one heartbeat every `idleIntervalMs`
//   • GPS jitter  → movements below `minDistanceMeters` are ignored
// Device info and IP are sent once per session, battery only when it changes.
// Firestore's offline cache queues uploads while the phone has no signal.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addLocationToTrackerAsync,
  getCurrentPosition,
  getDeviceInfo,
  getGeolocationErrorMessage,
  getIPAddress,
  getOrCreateTrackerAsync,
} from './storage';
import { updateTrackerState } from './firebase-services';
import { TRACKING_CONFIG, distanceMeters, isValidLatLng } from './geo';
import type { BatteryInfo, LocationData, MotionState } from './types';

export type TrackingPhase = 'idle' | 'starting' | 'tracking' | 'paused' | 'stopped' | 'error';

interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

const SESSION_TRAIL_LIMIT = 300;

function storageKey(kind: string, id: string) {
  return `geotracker:${kind}:${id}`;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode) – preference simply isn't remembered
  }
}

export function hasStoredConsent(trackingId: string): boolean {
  return safeGet(storageKey('consent', trackingId)) === '1';
}

export function wasPaused(trackingId: string): boolean {
  return safeGet(storageKey('paused', trackingId)) === '1';
}

function positionToLocation(position: GeolocationPosition, battery: number | null): LocationData {
  const { coords } = position;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    timestamp: new Date(position.timestamp || Date.now()).toISOString(),
    speed: coords.speed ?? null,
    heading: coords.heading ?? null,
    altitude: coords.altitude ?? null,
    battery,
  };
}

export function useLiveTracking(trackingId: string | null) {
  const [phase, setPhase] = useState<TrackingPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<LocationData | null>(null);
  const [trail, setTrail] = useState<LocationData[]>([]);
  const [uploads, setUploads] = useState(0);
  const [pending, setPending] = useState(0);
  const [lastUpload, setLastUpload] = useState<Date | null>(null);
  const [motion, setMotion] = useState<MotionState>('moving');
  const [battery, setBattery] = useState<BatteryInfo | null>(null);
  const [online, setOnline] = useState(true);
  const [keepAwake, setKeepAwakeState] = useState(false);
  const [ip, setIp] = useState<string>('Detecting…');

  const watchIdRef = useRef<number | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUploadedRef = useRef<LocationData | null>(null);
  const lastUploadAtRef = useRef(0);
  const lastMovementAtRef = useRef(Date.now());
  const currentRef = useRef<LocationData | null>(null);
  const batteryRef = useRef<BatteryInfo | null>(null);
  const lastSentBatteryRef = useRef<BatteryInfo | null>(null);
  const motionRef = useRef<MotionState>('moving');
  const sentDeviceRef = useRef(false);
  const trackerReadyRef = useRef<Promise<unknown> | null>(null);
  const phaseRef = useRef<TrackingPhase>('idle');
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const uploadingRef = useRef(false);

  const setPhaseBoth = useCallback((p: TrackingPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const ensureTracker = useCallback(() => {
    if (!trackingId) return Promise.resolve(null);
    if (!trackerReadyRef.current) {
      trackerReadyRef.current = getOrCreateTrackerAsync(trackingId).catch((e) => {
        trackerReadyRef.current = null;
        throw e;
      });
    }
    return trackerReadyRef.current;
  }, [trackingId]);

  const upload = useCallback(
    async (fix: LocationData) => {
      if (!trackingId || uploadingRef.current) return;
      uploadingRef.current = true;
      lastUploadedRef.current = fix;
      lastUploadAtRef.current = Date.now();
      setTrail((prev) => {
        const next = prev.length >= SESSION_TRAIL_LIMIT ? prev.slice(-SESSION_TRAIL_LIMIT + 1) : prev.slice();
        next.push(fix);
        return next;
      });

      const extras: Parameters<typeof addLocationToTrackerAsync>[2] = { motion: motionRef.current };
      if (!sentDeviceRef.current) {
        extras.device = getDeviceInfo();
        const address = await getIPAddress();
        if (address !== 'Unavailable') extras.ip = address;
      }
      const b = batteryRef.current;
      if (b && (!lastSentBatteryRef.current || lastSentBatteryRef.current.level !== b.level || lastSentBatteryRef.current.charging !== b.charging)) {
        extras.battery = b;
      }

      setPending((n) => n + 1);
      uploadingRef.current = false;
      try {
        await ensureTracker();
        // Resolves once the server acknowledged the write. While offline the
        // write stays queued in IndexedDB and resolves after reconnecting.
        await addLocationToTrackerAsync(trackingId, fix, extras);
        if (extras.device) sentDeviceRef.current = true;
        if (extras.battery) lastSentBatteryRef.current = extras.battery;
        setUploads((n) => n + 1);
        setLastUpload(new Date());
        setError(null);
      } catch (e) {
        console.error('Location upload failed:', e);
        setError('Could not sync your location. Retrying automatically…');
      } finally {
        setPending((n) => Math.max(0, n - 1));
      }
    },
    [trackingId, ensureTracker],
  );

  const handleFix = useCallback(
    (position: GeolocationPosition, { force = false } = {}) => {
      if (phaseRef.current !== 'tracking' && phaseRef.current !== 'starting') return;
      const fix = positionToLocation(position, batteryRef.current?.level ?? null);
      if (!isValidLatLng(fix.latitude, fix.longitude)) return;

      currentRef.current = fix;
      setCurrent(fix);
      if (phaseRef.current === 'starting') setPhaseBoth('tracking');
      setError(null);

      const now = Date.now();
      const last = lastUploadedRef.current;
      const elapsed = now - lastUploadAtRef.current;
      const moved = last ? distanceMeters(last, fix) : Infinity;
      const meaningfulMove = moved >= Math.max(TRACKING_CONFIG.minDistanceMeters, Math.min(fix.accuracy, 50) * 0.5);

      if (meaningfulMove) lastMovementAtRef.current = now;
      const nextMotion: MotionState =
        now - lastMovementAtRef.current > TRACKING_CONFIG.stationaryAfterMs ? 'stationary' : 'moving';
      if (nextMotion !== motionRef.current) {
        motionRef.current = nextMotion;
        setMotion(nextMotion);
      }

      // A much less accurate fix shortly after a good one is usually a bad
      // network/wifi fix; skip it unless it is time for a heartbeat.
      const poorFix =
        fix.accuracy > TRACKING_CONFIG.maxAcceptableAccuracy && last !== null && last.accuracy < fix.accuracy;

      const shouldUpload =
        force ||
        last === null ||
        (meaningfulMove && !poorFix && elapsed >= TRACKING_CONFIG.movingIntervalMs) ||
        elapsed >= TRACKING_CONFIG.idleIntervalMs;

      if (shouldUpload) void upload(fix);
    },
    [setPhaseBoth, upload],
  );

  const handleError = useCallback(
    (err: GeolocationPositionError) => {
      setError(getGeolocationErrorMessage(err));
      if (err.code === err.PERMISSION_DENIED) {
        stopWatching();
        setPhaseBoth('error');
      } else if (!currentRef.current) {
        setPhaseBoth('error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setPhaseBoth],
  );

  const heartbeat = useCallback(async () => {
    if (phaseRef.current !== 'tracking') return;
    if (Date.now() - lastUploadAtRef.current < TRACKING_CONFIG.idleIntervalMs - 1000) return;
    try {
      const pos = await getCurrentPosition({ maximumAge: 15_000, timeout: 20_000 });
      handleFix(pos, { force: true });
    } catch {
      // Fall back to re-sending the last known fix so "last seen" stays fresh.
      if (currentRef.current) void upload({ ...currentRef.current, timestamp: new Date().toISOString() });
    }
  }, [handleFix, upload]);

  function stopWatching() {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  }

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      setPhaseBoth('error');
      return;
    }
    stopWatching();
    watchIdRef.current = navigator.geolocation.watchPosition((p) => handleFix(p), handleError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 30_000,
    });
    heartbeatRef.current = setInterval(() => void heartbeat(), TRACKING_CONFIG.idleIntervalMs / 2);
  }, [handleFix, handleError, heartbeat, setPhaseBoth]);

  const start = useCallback(() => {
    if (!trackingId) return;
    safeSet(storageKey('consent', trackingId), '1');
    safeSet(storageKey('paused', trackingId), null);
    setError(null);
    setPhaseBoth('starting');
    lastUploadedRef.current = null;
    lastUploadAtRef.current = 0;
    void ensureTracker()
      ?.then(() => updateTrackerState(trackingId, { status: 'active' }))
      .catch(() => undefined);
    startWatching();
  }, [trackingId, ensureTracker, startWatching, setPhaseBoth]);

  const pause = useCallback(() => {
    if (!trackingId) return;
    stopWatching();
    safeSet(storageKey('paused', trackingId), '1');
    setPhaseBoth('paused');
    void updateTrackerState(trackingId, { status: 'paused' }).catch(() => undefined);
  }, [trackingId, setPhaseBoth]);

  const stop = useCallback(() => {
    if (!trackingId) return;
    stopWatching();
    safeSet(storageKey('consent', trackingId), null);
    safeSet(storageKey('paused', trackingId), null);
    setPhaseBoth('stopped');
    void updateTrackerState(trackingId, { status: 'stopped' }).catch(() => undefined);
  }, [trackingId, setPhaseBoth]);

  /** Immediately acquire and upload a fresh fix. */
  const refresh = useCallback(async () => {
    if (phaseRef.current !== 'tracking') return;
    try {
      const pos = await getCurrentPosition({ maximumAge: 0 });
      handleFix(pos, { force: true });
    } catch (e) {
      if (e instanceof GeolocationPositionError) setError(getGeolocationErrorMessage(e));
    }
  }, [handleFix]);

  const setKeepAwake = useCallback(async (value: boolean) => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
    if (!value) {
      await wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
      setKeepAwakeState(false);
      return;
    }
    if (!nav.wakeLock) {
      setError('Keeping the screen awake is not supported by this browser.');
      return;
    }
    try {
      wakeLockRef.current = await nav.wakeLock.request('screen');
      setKeepAwakeState(true);
    } catch {
      setKeepAwakeState(false);
    }
  }, []);

  // Battery monitoring
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
    if (!nav.getBattery) return;
    let manager: BatteryManagerLike | null = null;
    const read = () => {
      if (!manager) return;
      const info: BatteryInfo = {
        level: Math.round(manager.level * 100) / 100,
        charging: manager.charging,
        updatedAt: new Date().toISOString(),
      };
      const prev = batteryRef.current;
      batteryRef.current = info;
      setBattery(info);
      // Push meaningful changes right away (charging toggled or ≥5 % change).
      const significant =
        !prev || prev.charging !== info.charging || Math.abs(prev.level - info.level) >= 0.05;
      if (significant && trackingId && phaseRef.current === 'tracking') {
        lastSentBatteryRef.current = info;
        void updateTrackerState(trackingId, { battery: info }).catch(() => undefined);
      }
    };
    nav
      .getBattery()
      .then((m) => {
        manager = m;
        read();
        m.addEventListener('levelchange', read);
        m.addEventListener('chargingchange', read);
      })
      .catch(() => undefined);
    return () => {
      manager?.removeEventListener('levelchange', read);
      manager?.removeEventListener('chargingchange', read);
    };
  }, [trackingId]);

  // Accelerometer hint: wake from "stationary" as soon as the device moves.
  useEffect(() => {
    let last: { x: number; y: number; z: number } | null = null;
    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      if (last) {
        const delta = Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z);
        if (delta > 1.5 && motionRef.current === 'stationary') {
          lastMovementAtRef.current = Date.now();
          motionRef.current = 'moving';
          setMotion('moving');
        }
      }
      last = { x: a.x, y: a.y, z: a.z };
    };
    window.addEventListener('devicemotion', onMotion, { passive: true });
    return () => window.removeEventListener('devicemotion', onMotion);
  }, []);

  // Online/offline + visibility handling
  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (phaseRef.current === 'tracking') void heartbeat();
      // Wake locks are released when the page is hidden; re-acquire.
      if (wakeLockRef.current?.released) void setKeepAwake(true);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [heartbeat, setKeepAwake]);

  useEffect(() => {
    getIPAddress().then(setIp);
  }, []);

  // Restore previous session state for this tracker.
  useEffect(() => {
    if (!trackingId) return;
    if (wasPaused(trackingId)) setPhaseBoth('paused');
    else if (hasStoredConsent(trackingId)) start();
    return () => stopWatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackingId]);

  return {
    phase,
    error,
    current,
    trail,
    uploads,
    pending,
    lastUpload,
    motion,
    battery,
    online,
    ip,
    keepAwake,
    start,
    pause,
    resume: start,
    stop,
    refresh,
    setKeepAwake,
  };
}
