export interface UserSettings {
  updateInterval: number;
  accuracyMode: 'high' | 'balanced' | 'low';
  dataRetention: 'never' | '7' | '30' | '90';
  mapProvider: 'google' | 'osm';
}

export const DEFAULT_SETTINGS: UserSettings = {
  updateInterval: 15,
  accuracyMode: 'balanced',
  dataRetention: 'never',
  mapProvider: 'osm',
};

const STORAGE_KEY = 'geotracker_settings';

export function getSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
