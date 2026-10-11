/**
 * Runs before first paint (inline, nonce-protected) to apply the saved or
 * system theme without a light/dark flash.
 */
export const THEME_STORAGE_KEY = "theme";

export const THEME_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
