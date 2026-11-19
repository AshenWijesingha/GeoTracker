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
