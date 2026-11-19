// Pure geolocation helpers shared by the tracker device and the dashboard.
// Nothing in this file touches the DOM or Firebase so it can be unit tested.

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
  battery?: number | null;
}

/** Tracking tuning, modelled on the adaptive polling of the reference tracker. */
export const TRACKING_CONFIG = {
  /** Minimum time between two uploads while the device is moving. */
  movingIntervalMs: 5_000,
  /** Heartbeat upload while the device is stationary (keeps "last seen" fresh). */
  idleIntervalMs: 60_000,
  /** Movement smaller than this (metres) is treated as GPS jitter. */
  minDistanceMeters: 8,
  /** Fixes worse than this accuracy (metres) are ignored unless nothing better arrives. */
  maxAcceptableAccuracy: 150,
  /** Device counts as stationary after this long without meaningful movement. */
  stationaryAfterMs: 30_000,
  /** A tracker that has not reported for this long is shown as offline. */
  onlineWindowMs: 2 * 60_000,
  /** Battery thresholds (fraction 0..1). */
  lowBattery: 0.2,
  criticalBattery: 0.1,
  /** Hold duration for the SOS button. */
  sosHoldMs: 2_000,
  /** Number of history points loaded for the selected tracker on the dashboard. */
  historyLimit: 500,
} as const;

const EARTH_RADIUS_M = 6_371_000;

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Great-circle distance in metres (haversine). */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Sort points chronologically (oldest first) without mutating the input. */
export function sortByTime<T extends { timestamp: string }>(points: readonly T[]): T[] {
  return [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

export interface TrackStats {
  points: number;
  distanceMeters: number;
  durationMs: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
}

/**
 * Summarise a track. Segments shorter than the jitter threshold, or implausibly
 * fast (> 300 km/h, typically a bad fix), are ignored for distance and speed.
 */
export function computeStats(points: readonly GeoPoint[]): TrackStats {
  const sorted = sortByTime(points);
  let distance = 0;
  let maxSpeed = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const d = distanceMeters(prev, cur);
    const dt = (new Date(cur.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
    if (d < TRACKING_CONFIG.minDistanceMeters) continue;
    const kmh = dt > 0 ? (d / dt) * 3.6 : 0;
    if (kmh > 300) continue;
    distance += d;
    if (kmh > maxSpeed) maxSpeed = kmh;
  }
  const durationMs =
    sorted.length > 1
      ? new Date(sorted[sorted.length - 1].timestamp).getTime() -
        new Date(sorted[0].timestamp).getTime()
      : 0;
  const avgSpeedKmh = durationMs > 0 ? distance / 1000 / (durationMs / 3_600_000) : 0;
  return {
    points: sorted.length,
    distanceMeters: distance,
    durationMs,
    avgSpeedKmh,
    maxSpeedKmh: maxSpeed,
  };
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 2 : 1)} km`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Human friendly "time since" label, e.g. "just now", "45s ago", "3m ago". */
export function formatFixAge(timestamp: string | number | Date | null | undefined, now = Date.now()): string {
  if (timestamp === null || timestamp === undefined) return 'never';
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return 'unknown';
  const diff = Math.max(0, now - t);
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export type BatteryState = 'unknown' | 'ok' | 'low' | 'critical' | 'charging';

export function classifyBattery(level: number | null | undefined, charging?: boolean | null): BatteryState {
  if (level === null || level === undefined || !Number.isFinite(level)) return 'unknown';
  if (charging) return 'charging';
  if (level <= TRACKING_CONFIG.criticalBattery) return 'critical';
  if (level <= TRACKING_CONFIG.lowBattery) return 'low';
  return 'ok';
}

/** Strip control characters, collapse whitespace and cap length for chat text. */
export function sanitizeText(input: string, maxLength = 500): string {
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function pointsToCSV(points: readonly GeoPoint[]): string {
  const header = ['timestamp', 'latitude', 'longitude', 'accuracy_m', 'speed_mps', 'heading_deg', 'altitude_m', 'battery_pct'];
  const rows = sortByTime(points).map((p) =>
    [
      p.timestamp,
      p.latitude,
      p.longitude,
      p.accuracy,
      p.speed ?? '',
      p.heading ?? '',
      p.altitude ?? '',
      p.battery !== null && p.battery !== undefined ? Math.round(p.battery * 100) : '',
    ]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n') + '\n';
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function pointsToGPX(points: readonly GeoPoint[], name: string): string {
  const trkpts = sortByTime(points)
    .filter((p) => isValidLatLng(p.latitude, p.longitude))
    .map((p) => {
      const ele = typeof p.altitude === 'number' ? `<ele>${p.altitude}</ele>` : '';
      return `      <trkpt lat="${p.latitude}" lon="${p.longitude}">${ele}<time>${xmlEscape(p.timestamp)}</time></trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoTracker" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${xmlEscape(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

/** File-system safe slug for export file names. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'tracker'
  );
}

/** Accepts either a raw tracker ID or a full tracking URL and returns the ID. */
export function extractTrackerId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const id = url.searchParams.get('id');
    if (id) return isValidTrackerId(id) ? id : null;
  } catch {
    // not a URL
  }
  return isValidTrackerId(trimmed) ? trimmed : null;
}

export function isValidTrackerId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(id);
}
