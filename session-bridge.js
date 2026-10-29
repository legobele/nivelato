// session-bridge.js — browser glue for the shared session cookie system
// (design: ~/workspace/nivelato-session/DESIGN.md; decisions:
// session-bridge-core.js).
//
// The guards on the product origins (auth-guard.js for the app,
// dashboard.html's own listeners) call into this module instead of
// bouncing straight to the login page: a shared cookie on
// .nivelatolabs.com may silently restore this origin's session through
// the origin's own worker (POST /__session/exchange), which is the only
// first-party place an HttpOnly cookie can be read.
//
// Everything here is best-effort by construction: any failure resolves
// to the pre-bridge behavior (bounce to login / proceed with the local
// session), so a bridge bug can never wedge sign-in or sign-out.

import {
  parseCompanions,
  attemptsInWindow,
  decideGuardAction,
  cookieNeedsIssue,
  buildSignOutPlan,
} from './session-bridge-core.js';

const FN_BASE = 'https://us-central1-nivelato-app.cloudfunctions.net';
const ATTEMPTS_KEY = 'niv_xchg_attempts';

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('bridge-timeout')), ms)),
  ]);
}

// Dependency-injectable factory: the page uses the default singleton
// below; the node tests build bridges with fakes. Defaults touch window
// only when called, never at import time.
export function createSessionBridge(deps = {}) {
  const d = {
    fetchFn: deps.fetchFn || ((url, opts) => fetch(url, opts)),
    readCookies: deps.readCookies || (() => document.cookie || ''),
    storage: deps.storage || (() => { try { return window.sessionStorage; } catch (_) { return null; } })(),
    now: deps.now || (() => Date.now()),
    origin: deps.origin || (() => window.location.origin),
    timeoutMs: deps.timeoutMs || 6000,
    getAuth: deps.getAuth || (async () => {
      const { auth } = await import('./firebase-config.js');
      if (auth && typeof auth.authStateReady === 'function') {
        try { await auth.authStateReady(); } catch (_) { /* fall through */ }
      }
      return auth;
    }),
    signInWithCustomToken: deps.signInWithCustomToken || (async (auth, token) => {
      const m = await import('https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js');
      return m.signInWithCustomToken(auth, token);
    }),
  };

  function readAttempts() {
    try {
      const raw = d.storage && d.storage.getItem(ATTEMPTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return attemptsInWindow(Array.isArray(arr) ? arr : [], d.now());
    } catch (_) { return []; }
  }

  function recordAttempt() {
    try {
      const arr = readAttempts();
      arr.push(d.now());
      if (d.storage) d.storage.setItem(ATTEMPTS_KEY, JSON.stringify(arr));
    } catch (_) { /* ledger is best-effort; server caps are the backstop */ }
  }

  function clearAttempts() {
    try { if (d.storage) d.storage.removeItem(ATTEMPTS_KEY); } catch (_) {}
  }

  // POST to one of this origin's worker session endpoints. The session
  // cookie rides along automatically (same-origin request); JS never
  // sees its value.
  async function workerCall(path, body) {
    return d.fetchFn(d.origin() + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // Establish (or re-issue) the shared cookie from the CURRENT origin's
  // live session. Used after credential sign-in on the login origin and
  // by healLocalSession for restores. Never throws.
  async function establishSessionCookie() {
    try {
      const auth = await d.getAuth();
      const user = auth && auth.currentUser;
      if (!user) return false;
      const idToken = await user.getIdToken();
      const resp = await withTimeout(workerCall('/__session/set', { idToken }), d.timeoutMs);
      return !!(resp && resp.ok);
    } catch (_) { return false; }
  }

  // No-local-session guard branch. Returns 'exchanged' when a session
  // was silently restored (the caller's auth callback will refire with
  // the user), or 'bounce' for the ordinary login redirect.
  async function restoreSession() {
    const companions = parseCompanions(d.readCookies());
    const action = decideGuardAction({
      hasUser: false, lastSignInMs: 0,
      flag: companions.flag, tombMs: companions.tombMs,
      attempts: readAttempts(), nowMs: d.now(),
    });
    if (action !== 'exchange') return 'bounce';
    // Record BEFORE the attempt: a crash or hang mid-exchange still
    // counts against the tab's budget.
    recordAttempt();
    try {
      const resp = await withTimeout(workerCall('/__session/exchange'), d.timeoutMs);
      if (!resp || !resp.ok) return 'bounce';
      const body = await resp.json().catch(() => null);
      const token = body && body.customToken;
      if (!token) return 'bounce';
      const auth = await d.getAuth();
      await d.signInWithCustomToken(auth, token);
      clearAttempts();
      return 'exchanged';
    } catch (_) {
      return 'bounce';
    }
  }

  // Local-user guard branch. Returns:
  //  'sign-out-local' — a tombstone postdates this sign-in: the caller
  //     must sign the local session out and bounce (its own signOut
  //     wiring owns that).
  //  'proceed' — session is consistent; cookie re-issue handled here.
  async function healLocalSession(user) {
    const companions = parseCompanions(d.readCookies());
    const lastSignInMs = user && user.metadata && user.metadata.lastSignInTime
      ? (Date.parse(user.metadata.lastSignInTime) || 0) : 0;
    const action = decideGuardAction({
      hasUser: true, lastSignInMs,
      flag: companions.flag, tombMs: companions.tombMs,
      attempts: [], nowMs: d.now(),
    });
    if (action === 'sign-out-local') return 'sign-out-local';
    if (action === 'proceed-reissue' || cookieNeedsIssue(companions, d.now())) {
      await establishSessionCookie();
    }
    return 'proceed';
  }

  // Sign-out, steps 1-2 of buildSignOutPlan() ('clear-cookie-endpoint',
  // 'revoke-sessions-function'). The caller then performs
  // 'local-sign-out' with its own wedging-proof implementation and
  // navigates. The optional thenLocal callback runs last, inside the
  // same call, so tests can pin the full order. Never throws.
  async function clearSessionEverywhere(thenLocal) {
    const done = [];
    let idToken = null;
    try {
      const auth = await d.getAuth();
      if (auth && auth.currentUser) idToken = await auth.currentUser.getIdToken();
    } catch (_) { /* token is for steps 2; step 1 works without it */ }
    try {
      await withTimeout(workerCall('/__session/clear'), 3000);
      done.push('clear-cookie-endpoint');
    } catch (_) { /* best-effort: revocation below still kills exchanges */ }
    if (idToken) {
      try {
        await withTimeout(d.fetchFn(FN_BASE + '/revokeUserSessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
          body: JSON.stringify({}),
        }), 3000);
        done.push('revoke-sessions-function');
      } catch (_) { /* best-effort: tombstone still signs other origins out */ }
    }
    if (typeof thenLocal === 'function') {
      try { await thenLocal(); done.push('local-sign-out'); } catch (_) {}
    }
    return done;
  }

  return {
    establishSessionCookie,
    restoreSession,
    healLocalSession,
    clearSessionEverywhere,
    buildSignOutPlan,
  };
}

const _default = createSessionBridge();
export const establishSessionCookie = (...a) => _default.establishSessionCookie(...a);
export const restoreSession = (...a) => _default.restoreSession(...a);
export const healLocalSession = (...a) => _default.healLocalSession(...a);
export const clearSessionEverywhere = (...a) => _default.clearSessionEverywhere(...a);
