/* Ported 1:1 from sso.html: redirect allowlist, `next` sanitizing and handoff parameter parsing. */
export const ALLOWED_REDIRECT_ORIGINS = new Set([
  'https://legobele.github.io', 'https://app.nivelatolabs.com', 'https://dashboard.nivelatolabs.com',
  'https://nivelato-app.firebaseapp.com', 'https://nivelato-app.web.app',
]);
export const SSO_NEXT_ORIGINS = ['https://app.nivelatolabs.com', 'https://dashboard.nivelatolabs.com'];
export function redirectUriIsAllowed(uri: unknown): boolean {
  if (typeof uri !== 'string' || !uri.trim()) return false;
  uri = (uri as string).trim(); const s = uri as string;
  if (s.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(s)) { let u: URL; try { u = new URL(s); } catch { return false; } if (u.protocol !== 'https:') return false; return ALLOWED_REDIRECT_ORIGINS.has(u.origin); }
  if (/[\s\\]/.test(s)) return false;
  return true;
}
export function sanitizeNext(n: unknown): string | null {
  if (typeof n !== 'string' || !(n = n.trim())) return null; const s = n as string;
  if (s.charAt(0) === '/') { if (s.charAt(1) === '/' || /[\s\\]/.test(s)) return null; return s; }
  try { const u = new URL(s); if (u.protocol !== 'https:') return null; if (SSO_NEXT_ORIGINS.indexOf(u.origin) === -1) return null; return u.toString(); } catch { return null; }
}
export interface SsoParams { ctoken: string | null; next: string | null; redirectUri: string | null; clientId: string }
export function parseSso(search: string, hash: string): SsoParams {
  const p = new URLSearchParams(search); const h = hash.replace(/^#\/?(sso)?\??/, '');
  const f = new URLSearchParams(h);
  return { ctoken: f.get('ctoken') || p.get('ctoken'), next: f.get('next') || p.get('next'), redirectUri: p.get('redirect_uri') || f.get('redirect_uri'), clientId: p.get('client_id') || f.get('client_id') || 'Aplicación externa' };
}
export const isSsoUrl = (search: string, hash: string) => /^#\/?sso(\?|$)/.test(hash) || /(^#|&)ctoken=/.test(hash) || new URLSearchParams(search).has('ctoken') || /sso\.html$/.test(location.pathname);
