export function isGoogleTagScript(src) {
  try {
    const url = new URL(src);
    return url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js';
  } catch { return false; }
}
