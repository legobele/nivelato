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

/* Handoff flows with injected dependencies, so behavior is testable with mocks and no real token. */
export interface HandoffDeps { signInWithCustomToken(token: string): Promise<unknown>; navigate(url: string): void }
export async function completeHandoff(p: SsoParams, d: HandoffDeps, fallback = '/dashboard.html'): Promise<'ok' | 'failed' | 'none'> {
  if (!p.ctoken) return 'none';
  try { await d.signInWithCustomToken(p.ctoken); d.navigate(sanitizeNext(p.next) || fallback); return 'ok'; } catch { return 'failed'; }
}
export interface ExternalDeps { getIdToken(): Promise<string>; userDoc(): Promise<{ name?: string; role?: string; orgId?: string }>; user: { uid: string; email?: string | null; displayName?: string | null }; navigate(url: string): void }
/* Legacy "sign in with Nivelato" for external apps: the allowlist gate runs BEFORE any token is minted. */
export async function redirectExternal(redirectUri: string | null, d: ExternalDeps): Promise<'ok' | 'denied' | 'failed'> {
  if (!redirectUri || !redirectUriIsAllowed(redirectUri)) return 'denied';
  try {
    const token = await d.getIdToken(); const u = await d.userDoc();
    const payload = { token, uid: d.user.uid, name: u.name || d.user.displayName || '', email: d.user.email || '', role: u.role || '', orgId: u.orgId || '' };
    d.navigate(redirectUri + (redirectUri.includes('?') ? '&' : '?') + 'nivelato_token=' + encodeURIComponent(JSON.stringify(payload)));
    return 'ok';
  } catch { return 'failed'; }
}
