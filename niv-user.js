// niv-user.js — shared per-user client wiring (ES module).
//
// window.NivUser exposes two things page workers can call from the
// sign-in landing points (login.html postAuthRedirect, sso.html,
// dashboard.html onAuthStateChanged):
//
//   import('./niv-user.js').then(m => m.maybeSendLoginAlert(user)).catch(() => {});
//   // or, once any page has loaded this module:
//   window.NivUser.maybeSendLoginAlert(user);
//
//   const lang = await window.NivUser.resolveLang(user.uid);
//   window.NivUser.applyResolvedLang(lang);
//
// LOGIN ALERTS (replaces the old welcome-email pref semantics):
//   Pref field: notification_prefs/{uid}.loginAlert (boolean).
//   DEFAULT: ON. This follows the repo's existing defaults pattern
//   (settings NOTIF_DEFAULTS and the server fan-out both treat a
//   missing doc / missing field as all-toggles-on; only an explicit
//   `false` opts out). The old `welcomeEmail` field is NO LONGER READ
//   by any consumer after this change; stored values are left in
//   place untouched (no data deletion), they are simply inert.
//   The actual send lives server-side in the `reportLoginAlert`
//   callable (functions/index.js): the in-app notification write path
//   (pushNotification -> users/{uid}/notifications) is server-only and
//   the Resend key never leaves the server, so no honest client-only
//   send exists. This module is the gate + trigger: it checks the pref
//   against the ACTIVE backend (so BYOB shops' own prefs are honored),
//   dedupes per sign-in session, and calls the callable via
//   centralFunctions (email always flows through the central project,
//   same as every other notification). If the callable is not deployed
//   yet, the call fails soft: nothing throws, no alert is sent, the
//   app continues. Worst case for this client-side trigger is a
//   skipped alert, never a spurious one the server did not dedupe.
//
// LANGUAGE RESOLVER (Giulia's locked order):
//   1. users/{uid}.language ('es' | 'en' only)
//   2. the nivelato-login-lang chain: localStorage, then the
//      nivelato-login-lang cookie (the cookie is the cross-subdomain
//      mirror of the same key; localStorage wins where both exist,
//      matching login.html's detectLang)
//   3. 'es'
//   Company language is NOT in this chain: it only seeds a brand-new
//   user's language at signup and is never consulted for an existing
//   user. This module does not touch that seeding.

import { auth, db, centralFunctions } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";

const LANG_KEY = 'nivelato-login-lang';
const SETTINGS_COOKIE = 'niv-settings';

function validLang(v) {
  return v === 'es' || v === 'en' ? v : null;
}

function langFromLocalStorage() {
  try { return validLang(window.localStorage.getItem(LANG_KEY)); } catch (_) { return null; }
}

function langFromCookie() {
  try {
    const m = document.cookie.match(new RegExp('(?:^|; )' + LANG_KEY + '=(es|en)(?:;|$)'));
    return m ? m[1] : null;
  } catch (_) { return null; }
}

function writeCookie(name, value) {
  try {
    document.cookie = name + '=' + value
      + '; Domain=.nivelatolabs.com; Path=/; SameSite=Lax; Max-Age=31536000';
  } catch (_) { /* cookies unavailable: fail soft */ }
}

/**
 * Resolve the user's language in the locked order (see header).
 * uid may be null/omitted (signed-out surfaces): the DB step is
 * skipped and the local chain decides. Never throws.
 */
export async function resolveLang(uid) {
  if (uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const fromDb = snap.exists() ? validLang((snap.data() || {}).language) : null;
      if (fromDb) return fromDb;
    } catch (_) { /* fall through to the local chain */ }
  }
  return langFromLocalStorage() || langFromCookie() || 'es';
}

/**
 * Apply a resolved language to this device's surfaces:
 *  - If window.NivSettings is loaded, hand the language to it (it owns
 *    the niv-settings cookie). Its API shape is not fixed yet on this
 *    base, so the known method names are probed defensively.
 *  - Otherwise (or if it exposes none of them), write the niv-settings
 *    cookie directly with the shared attributes
 *    (Domain=.nivelatolabs.com; Path=/; SameSite=Lax), merging `lang`
 *    into any existing JSON value so other settings keys survive.
 *  - Mirror into the nivelato-login-lang localStorage + cookie chain
 *    (same write login.html's adoptDbLang performs) and stamp the
 *    document language. Never throws.
 */
export function applyResolvedLang(lang) {
  const l = validLang(lang) || 'es';
  let handedOff = false;
  try {
    const ns = window.NivSettings;
    if (ns) {
      for (const fn of ['setLang', 'applyLang', 'setLanguage', 'set']) {
        if (typeof ns[fn] === 'function') { ns[fn](l); handedOff = true; break; }
      }
    }
  } catch (_) { handedOff = false; }
  if (!handedOff) {
    let settings = {};
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + SETTINGS_COOKIE + '=([^;]*)'));
      if (m) {
        const parsed = JSON.parse(decodeURIComponent(m[1]));
        if (parsed && typeof parsed === 'object') settings = parsed;
      }
    } catch (_) { settings = {}; }
    settings.lang = l;
    try { writeCookie(SETTINGS_COOKIE, encodeURIComponent(JSON.stringify(settings))); } catch (_) {}
  }
  try { window.localStorage.setItem(LANG_KEY, l); } catch (_) { /* ignore */ }
  writeCookie(LANG_KEY, l);
  try { document.documentElement.setAttribute('lang', l); } catch (_) { /* ignore */ }
  return l;
}

const alertStampKey = (uid) => 'niv-login-alert:' + uid;

/**
 * Fire the login alert for a genuine sign-in, at most once per sign-in
 * session. Call ONLY from sign-in landing points (right after a real
 * signIn* resolves / first authenticated landing), never from token
 * refresh handlers. `user` is the Firebase User (or null to use
 * auth.currentUser). The sign-in is identified by
 * user.metadata.lastSignInTime, which only a genuine sign-in moves;
 * the server dedupes on the same key plus a minimum-interval stamp,
 * so repeat calls for the same sign-in (login page + SSO handoff +
 * dashboard landing) collapse into one alert.
 *
 * Resolves a result object, never rejects:
 *   { sent: true, email, inApp } | { sent: false, reason }
 * reasons: 'no-user' | 'no-signin-stamp' | 'pref-off' |
 *          'deduped-session' | 'callable-failed' | server reasons
 *          ('deduped', 'pref-off', 'no-email', ...)
 */
export async function maybeSendLoginAlert(user, opts) {
  const u = user || (auth && auth.currentUser);
  if (!u || !u.uid) return { sent: false, reason: 'no-user' };
  const sessionKey = (u.metadata && u.metadata.lastSignInTime) || null;
  if (!sessionKey) return { sent: false, reason: 'no-signin-stamp' };

  // Client dedupe for this browser session (the server stamp is the
  // cross-device / cross-origin authority; sessionStorage is per
  // origin, so the login -> SSO -> dashboard chain relies on it).
  try {
    if (window.sessionStorage.getItem(alertStampKey(u.uid)) === sessionKey) {
      return { sent: false, reason: 'deduped-session' };
    }
    window.sessionStorage.setItem(alertStampKey(u.uid), sessionKey);
  } catch (_) { /* storage unavailable: server dedupe still applies */ }

  // Pref gate against the ACTIVE backend (BYOB shops keep prefs in
  // their own project; the central callable cannot see them). Missing
  // doc or missing field = ON (existing defaults pattern); the legacy
  // welcomeEmail field is deliberately NOT consulted.
  try {
    const pSnap = await getDoc(doc(db, 'notification_prefs', u.uid));
    if (pSnap.exists() && (pSnap.data() || {}).loginAlert === false) {
      return { sent: false, reason: 'pref-off' };
    }
  } catch (_) { /* unreadable prefs: fail soft, server re-checks its copy */ }

  try {
    const lang = await resolveLang(u.uid);
    const call = httpsCallable(centralFunctions, 'reportLoginAlert');
    const { data } = await call({
      sessionKey,
      lang,
      timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { return ''; } })(),
      device: (() => { try { return String(navigator.userAgent || '').slice(0, 120); } catch (_) { return ''; } })(),
      ...(opts && opts.orgId ? { orgId: String(opts.orgId).slice(0, 128) } : {}),
    });
    return data || { sent: false, reason: 'empty-response' };
  } catch (e) {
    // Not deployed yet / offline / rejected: release the session stamp
    // so a later landing point in this session can retry, and fail
    // soft. A login alert must never break a sign-in.
    try { window.sessionStorage.removeItem(alertStampKey(u.uid)); } catch (_) {}
    return { sent: false, reason: 'callable-failed', error: (e && e.code) || String(e) };
  }
}

const NivUser = { resolveLang, applyResolvedLang, maybeSendLoginAlert };
if (typeof window !== 'undefined') window.NivUser = NivUser;
export default NivUser;
