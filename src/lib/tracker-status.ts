import { TRACKING_CONFIG, type GeoPoint } from './geo';
import type { LocationData, Tracker } from './types';

export type TrackerLiveStatus = 'sos' | 'live' | 'paused' | 'stopped' | 'offline' | 'waiting';

export function getTrackerStatus(tracker: Tracker, now = Date.now()): TrackerLiveStatus {
  if (tracker.sos?.active) return 'sos';
  if (tracker.status === 'stopped') return 'stopped';
  if (tracker.status === 'paused') return 'paused';
  if (!tracker.lastSeen) return 'waiting';
  return now - new Date(tracker.lastSeen).getTime() <= TRACKING_CONFIG.onlineWindowMs ? 'live' : 'offline';
}

export const STATUS_LABEL: Record<TrackerLiveStatus, string> = {
  sos: '🚨 SOS',
  live: '● Live',
  paused: '❚❚ Paused',
  stopped: '■ Stopped',
  offline: '○ Offline',
  waiting: '◌ Waiting',
};

/** Merge legacy embedded locations with sub-collection points, de-duplicated. */
export function mergeHistory(legacy: LocationData[], points: LocationData[]): GeoPoint[] {
  if (legacy.length === 0) return points;
  const seen = new Set<string>();
  const out: GeoPoint[] = [];
  for (const p of [...legacy, ...points]) {
    const key = `${p.timestamp}|${p.latitude}|${p.longitude}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
