/** Base path the app is served from (e.g. "/GeoTracker" on GitHub Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** Prefix a public asset path with the deployment base path. */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Absolute URL of the app root on the current origin. */
export function appBaseUrl(): string {
  if (typeof window === 'undefined') return BASE_PATH;
  return window.location.origin + BASE_PATH;
}

/** Where the Android APK and its metadata are published (see deploy.yml). */
export const APK_PATH = '/downloads/GeoTracker.apk';
export const APK_INFO_PATH = '/downloads/android.json';

/** Source repository, for release builds and setup docs. */
export const REPO_URL = 'https://github.com/AshenWijesingha/GeoTracker';
