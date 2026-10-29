// session-bridge-core.js — pure decision logic for the shared session
// cookie system (see ~/workspace/nivelato-session/DESIGN.md). No imports,
// no browser globals: this file runs identically in the page (via
// session-bridge.js) and under node for the unit tests, so the guard
// policy that ships is the policy that is tested.

export const SESSION_COOKIE = 'niv_session';
export const FLAG_COOKIE = 'niv_sess_flag';
export const IAT_COOKIE = 'niv_sess_iat';

// Loop guard (DESIGN.md §6): at most this many silent-exchange attempts
// per tab per window; needing more means something downstream is bouncing
// us, and the correct move is the ordinary login bounce.
export const EXCHANGE_MAX_ATTEMPTS = 2;
export const EXCHANGE_WINDOW_MS = 60 * 1000;

// Cookie re-issue throttle (DESIGN.md §5): at most once per 24 h per
// browser, piggybacked on guard resolutions.
export const REISSUE_AFTER_MS = 24 * 60 * 60 * 1000;

// Parse the JS-readable companion cookies out of a Cookie header /
// document.cookie string. Returns { flag: null | '1' | 'out', tombMs,
// iatMs }. The HttpOnly session cookie itself is never visible here and
// never parsed here.
export function parseCompanions(cookieString) {
  const out = { flag: null, tombMs: 0, iatMs: 0 };
  if (typeof cookieString !== 'string' || !cookieString) return out;
  const parts = cookieString.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    if (name === FLAG_COOKIE) {
      if (value === '1') out.flag = '1';
      else if (value.indexOf('out:') === 0) {
        out.flag = 'out';
        out.tombMs = parseInt(value.slice(4), 10) || 0;
      }
    } else if (name === IAT_COOKIE) {
      out.iatMs = parseInt(value, 10) || 0;
    }
  }
  return out;
}

// Prune an attempt ledger (array of unix-ms timestamps) to the current
// window and report how many attempts remain inside it.
export function attemptsInWindow(attempts, nowMs) {
  if (!Array.isArray(attempts)) return [];
  return attempts.filter((t) => typeof t === 'number' && nowMs - t < EXCHANGE_WINDOW_MS);
}

// THE guard decision. Pure function of the observed state; the glue in
// session-bridge.js executes the returned action.
//
// state: {
//   hasUser: boolean,
//   lastSignInMs: number,   // user.metadata.lastSignInTime, epoch ms (0 if unknown)
//   flag: null | '1' | 'out',
//   tombMs: number,         // tombstone time when flag === 'out'
//   attempts: number[],     // this tab's exchange attempt ledger
//   nowMs: number,
// }
// returns: 'proceed' | 'proceed-reissue' | 'sign-out-local' |
//          'exchange' | 'bounce'
export function decideGuardAction(state) {
  const nowMs = state.nowMs;
  if (state.hasUser) {
    if (state.flag === 'out') {
      // A sign-out happened somewhere. If it postdates this origin's
      // sign-in, this local session is exactly the asymmetric leftover
      // the tombstone exists to kill. If it predates the sign-in, this
      // origin signed in after that sign-out but its cookie-set failed:
      // heal by re-issuing, don't punish.
      return state.tombMs > (state.lastSignInMs || 0) ? 'sign-out-local' : 'proceed-reissue';
    }
    return 'proceed';
  }
  // No local user. Only a live flag justifies spending an exchange.
  if (state.flag !== '1') return 'bounce';
  const recent = attemptsInWindow(state.attempts, nowMs);
  if (recent.length >= EXCHANGE_MAX_ATTEMPTS) return 'bounce';
  return 'exchange';
}

// Should the bridge re-issue the cookie for a live local session?
// Yes when there is no flag (rollout / cookie blocked earlier / set call
// failed) or the issue stamp is older than the throttle window. A
// tombstone is NOT healed here; decideGuardAction owns that case.
export function cookieNeedsIssue(companions, nowMs) {
  if (!companions || companions.flag === 'out') return false;
  if (companions.flag !== '1') return true;
  return nowMs - (companions.iatMs || 0) >= REISSUE_AFTER_MS;
}

// The sign-out sequence, as data, so tests can pin the order:
// the shared cookie dies first (while we still hold a token), the
// server revocation second (it needs the token too), and only then the
// local sign-out that makes the token unrecoverable.
export function buildSignOutPlan() {
  return ['clear-cookie-endpoint', 'revoke-sessions-function', 'local-sign-out'];
}
