export const THEME_STORAGE_KEY = 'geotracker:theme';

/**
 * Runs in <head> before first paint so the page never flashes the wrong
 * theme. Kept as a string because it is injected with a <script> tag.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}})();`;
