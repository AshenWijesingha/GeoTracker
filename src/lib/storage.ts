// Client-side helpers: tracker ID generation, device fingerprinting and
// geolocation wrappers, plus thin async wrappers over the Firestore services.
//
// Offline support is provided by Firestore's persistent IndexedDB cache (see
// firebase.ts), so the old localStorage mirror is no longer needed: writes made
// offline are queued and replayed automatically.

import {
  getTrackersFromFirebase,
  getTrackerFromFirebase,
  createTrackerInFirebase,
  getOrCreateTrackerInFirebase,
  addLocationToTrackerInFirebase,
  deleteTrackerFromFirebase,
  type LocationExtras,
} from './firebase-services';
import type { DeviceInfo, LocationData, Tracker } from './types';

export type { DeviceInfo, LocationData, Tracker } from './types';

export function generateTrackingId(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return 'track_' + window.crypto.randomUUID();
  }
  return 'track_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}

// ==========================================
// Firebase-backed async API
// ==========================================

export const getTrackersAsync = (): Promise<Tracker[]> => getTrackersFromFirebase();

export const getTrackerAsync = (trackingId: string): Promise<Tracker | null> =>
  getTrackerFromFirebase(trackingId);

export const createTrackerAsync = (name: string): Promise<Tracker | null> =>
  createTrackerInFirebase(name, generateTrackingId());

export const getOrCreateTrackerAsync = (trackingId: string, name?: string): Promise<Tracker | null> =>
  getOrCreateTrackerInFirebase(trackingId, name);

export const addLocationToTrackerAsync = (
  trackingId: string,
  location: LocationData,
  extras?: LocationExtras,
): Promise<boolean> => addLocationToTrackerInFirebase(trackingId, location, extras);

export const deleteTrackerAsync = (trackingId: string): Promise<boolean> =>
  deleteTrackerFromFirebase(trackingId);

// ==========================================
// Device helpers
// ==========================================

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return { browser: 'Unknown', os: 'Unknown', platform: 'Unknown', screen: 'Unknown', userAgent: 'Unknown' };
  }

  const userAgent = navigator.userAgent;

  // Edge/Opera/Samsung include "Chrome" in their UA so check them first.
  let browser = 'Unknown';
  if (userAgent.includes('Edg')) browser = 'Edge';
  else if (userAgent.includes('OPR') || userAgent.includes('Opera')) browser = 'Opera';
  else if (userAgent.includes('SamsungBrowser')) browser = 'Samsung Internet';
  else if (userAgent.includes('Firefox') || userAgent.includes('FxiOS')) browser = 'Firefox';
  else if (userAgent.includes('Chrome') || userAgent.includes('CriOS')) browser = 'Chrome';
  else if (userAgent.includes('Safari')) browser = 'Safari';

  // Mobile OSes first: Android UAs contain "Linux", iOS UAs contain "Mac".
  let os = 'Unknown';
  const isIPadOS = /Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1;
  if (userAgent.includes('Android')) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(userAgent) || isIPadOS) os = 'iOS';
  else if (userAgent.includes('Win')) os = 'Windows';
  else if (userAgent.includes('CrOS')) os = 'ChromeOS';
  else if (userAgent.includes('Mac')) os = 'MacOS';
  else if (userAgent.includes('Linux')) os = 'Linux';

  const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) || isIPadOS;

  return {
    browser,
    os,
    platform: navigator.platform || (isMobile ? 'Mobile' : 'Unknown'),
    screen: `${window.screen.width} x ${window.screen.height}`,
    userAgent,
  };
}

let ipPromise: Promise<string> | null = null;

/** Public IP address, fetched once per page load and cached. */
export function getIPAddress(): Promise<string> {
  if (!ipPromise) {
    ipPromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
        clearTimeout(timer);
        const data = await response.json();
        return typeof data.ip === 'string' ? data.ip : 'Unavailable';
      } catch {
        ipPromise = null; // allow a retry later
        return 'Unavailable';
      }
    })();
  }
  return ipPromise;
}

export function getCurrentPosition(options?: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 5000,
      ...options,
    });
  });
}

export function getGeolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location access denied. Allow location permission for this site in your browser settings, then press Retry.';
    case error.POSITION_UNAVAILABLE:
      return 'Location information is unavailable. Make sure location services (GPS) are switched on.';
    case error.TIMEOUT:
      return 'Location request timed out. Move to an open area and try again.';
    default:
      return 'An unknown location error occurred.';
  }
}
