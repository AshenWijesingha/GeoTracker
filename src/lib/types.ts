import type { GeoPoint } from './geo';

export interface DeviceInfo {
  browser: string;
  os: string;
  platform: string;
  screen: string;
  userAgent: string;
}

/** A single location fix. `deviceInfo`/`ip` only exist on legacy (v2) records. */
export interface LocationData extends GeoPoint {
  deviceInfo?: DeviceInfo;
  ip?: string;
}

export interface BatteryInfo {
  level: number; // 0..1
  charging: boolean;
  updatedAt: string;
}

export interface SosInfo {
  active: boolean;
  triggeredAt: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  acknowledgedAt?: string | null;
}

export type SharingStatus = 'active' | 'paused' | 'stopped';
export type MotionState = 'moving' | 'stationary';

export interface Tracker {
  id: string;
  name: string;
  created: string;
  updatedAt?: string;
  userId?: string;
  /**
   * Legacy embedded history (v2). New fixes are stored in the
   * `trackers/{id}/points` sub-collection so the tracker document stays small.
   */
  locations: LocationData[];
  lastLocation?: LocationData | null;
  lastSeen?: string | null;
  locationCount?: number;
  device?: DeviceInfo | null;
  ip?: string | null;
  battery?: BatteryInfo | null;
  status?: SharingStatus;
  motion?: MotionState;
  sos?: SosInfo | null;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'owner' | 'device';
  senderName: string;
  createdAt: string;
  pending?: boolean;
}
