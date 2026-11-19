import { describe, expect, it } from 'vitest';
import {
  classifyBattery,
  computeStats,
  distanceMeters,
  extractTrackerId,
  formatDistance,
  formatDuration,
  formatFixAge,
  isValidLatLng,
  pointsToCSV,
  pointsToGPX,
  sanitizeText,
  slugify,
  type GeoPoint,
} from '../src/lib/geo';
import { getTrackerStatus, mergeHistory } from '../src/lib/tracker-status';
import type { Tracker } from '../src/lib/types';

const p = (lat: number, lng: number, t: string, extra: Partial<GeoPoint> = {}): GeoPoint => ({
  latitude: lat,
  longitude: lng,
  accuracy: 5,
  timestamp: t,
  ...extra,
});

describe('distanceMeters', () => {
  it('is zero for identical points', () => {
    expect(distanceMeters(p(10, 10, ''), p(10, 10, ''))).toBe(0);
  });

  it('matches a known distance (1° latitude ≈ 111.2 km)', () => {
    expect(distanceMeters(p(0, 0, ''), p(1, 0, ''))).toBeCloseTo(111_195, -2);
  });

  it('handles the antimeridian', () => {
    expect(distanceMeters(p(0, 179.9999, ''), p(0, -179.9999, ''))).toBeLessThan(30);
  });
});

describe('isValidLatLng', () => {
  it('accepts valid and rejects invalid coordinates', () => {
    expect(isValidLatLng(6.9, 79.8)).toBe(true);
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, -181)).toBe(false);
    expect(isValidLatLng(NaN, 0)).toBe(false);
    expect(isValidLatLng('1', 0)).toBe(false);
  });
});

describe('computeStats', () => {
  it('sums distance, ignores jitter and bad spikes', () => {
    const pts = [
      p(0, 0, '2026-01-01T00:00:00Z'),
      p(0, 0.00001, '2026-01-01T00:00:10Z'), // ~1 m jitter → ignored
      p(0, 0.01, '2026-01-01T00:10:00Z'), // ~1.1 km in 10 min
      p(10, 10, '2026-01-01T00:10:01Z'), // teleport → ignored
    ];
    const s = computeStats(pts);
    expect(s.points).toBe(4);
    expect(s.distanceMeters).toBeGreaterThan(1000);
    expect(s.distanceMeters).toBeLessThan(1200);
    expect(s.maxSpeedKmh).toBeLessThan(300);
    expect(s.durationMs).toBe(601_000);
  });

  it('handles empty input', () => {
    expect(computeStats([])).toMatchObject({ points: 0, distanceMeters: 0, durationMs: 0 });
  });
});

describe('formatters', () => {
  it('formats distance', () => {
    expect(formatDistance(12.4)).toBe('12 m');
    expect(formatDistance(1234)).toBe('1.23 km');
    expect(formatDistance(25_000)).toBe('25.0 km');
  });

  it('formats duration', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(65_000)).toBe('1m 5s');
    expect(formatDuration(3_660_000)).toBe('1h 1m');
  });

  it('formats fix age', () => {
    const now = Date.parse('2026-01-01T00:10:00Z');
    expect(formatFixAge('2026-01-01T00:09:58Z', now)).toBe('just now');
    expect(formatFixAge('2026-01-01T00:09:00Z', now)).toBe('1m ago');
    expect(formatFixAge(null, now)).toBe('never');
  });
});

describe('classifyBattery', () => {
  it('classifies thresholds', () => {
    expect(classifyBattery(0.5)).toBe('ok');
    expect(classifyBattery(0.2)).toBe('low');
    expect(classifyBattery(0.05)).toBe('critical');
    expect(classifyBattery(0.05, true)).toBe('charging');
    expect(classifyBattery(undefined)).toBe('unknown');
  });
});

describe('sanitizeText', () => {
  it('strips control characters and limits length', () => {
    expect(sanitizeText('  hi\u0000 there\n\n ')).toBe('hi there');
    expect(sanitizeText('x'.repeat(600)).length).toBe(500);
  });
});

describe('exports', () => {
  const pts = [p(1.5, 2.5, '2026-01-01T00:00:05Z', { battery: 0.5 }), p(1, 2, '2026-01-01T00:00:00Z')];

  it('CSV is sorted and has a header', () => {
    const lines = pointsToCSV(pts).trim().split('\n');
    expect(lines[0]).toContain('timestamp,latitude,longitude');
    expect(lines[1].startsWith('2026-01-01T00:00:00Z,1,2')).toBe(true);
    expect(lines[2]).toContain(',50');
  });

  it('GPX escapes the track name', () => {
    const gpx = pointsToGPX(pts, 'A & <B>');
    expect(gpx).toContain('<name>A &amp; &lt;B&gt;</name>');
    expect(gpx.match(/<trkpt/g)).toHaveLength(2);
  });

  it('slugifies file names', () => {
    expect(slugify('Family Trip #1!')).toBe('family-trip-1');
    expect(slugify('***')).toBe('tracker');
  });
});

describe('extractTrackerId', () => {
  it('accepts raw IDs and tracking URLs', () => {
    expect(extractTrackerId('track_123e4567-e89b-12d3-a456-426614174000')).toBe('track_123e4567-e89b-12d3-a456-426614174000');
    expect(extractTrackerId('https://x.io/GeoTracker/track/?id=track_abcdefgh')).toBe('track_abcdefgh');
    expect(extractTrackerId('../../etc')).toBeNull();
    expect(extractTrackerId('')).toBeNull();
  });
});

describe('tracker status', () => {
  const base: Tracker = { id: 't', name: 'n', created: '2026-01-01T00:00:00Z', locations: [] };
  const now = Date.parse('2026-01-01T01:00:00Z');

  it('derives status', () => {
    expect(getTrackerStatus(base, now)).toBe('waiting');
    expect(getTrackerStatus({ ...base, lastSeen: '2026-01-01T00:59:30Z' }, now)).toBe('live');
    expect(getTrackerStatus({ ...base, lastSeen: '2026-01-01T00:30:00Z' }, now)).toBe('offline');
    expect(getTrackerStatus({ ...base, status: 'paused' }, now)).toBe('paused');
    expect(
      getTrackerStatus({ ...base, status: 'paused', sos: { active: true, triggeredAt: '2026-01-01T00:59:00Z' } }, now),
    ).toBe('sos');
  });

  it('merges legacy and new history without duplicates', () => {
    const a = p(1, 1, '2026-01-01T00:00:00Z');
    const b = p(2, 2, '2026-01-01T00:01:00Z');
    expect(mergeHistory([a], [a, b])).toHaveLength(2);
    expect(mergeHistory([], [b])).toEqual([b]);
  });
});
