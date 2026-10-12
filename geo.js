// geo.js — client geo routing + flowGate contract.
// Spec: nivelato-geo-flows-spec.md §4.1, §6, §10.
//
// Country detection here is ROUTING ONLY (which UI to render). Enforcement is
// server-side in the flowGate callable — the client can lie, the token can't.
// Unknown/unreachable geo defaults to the EXTERNAL experience (§6.3): never
// accidentally expose the QGI invite path to an unverifiable visitor.

import { auth } from './firebase-config.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";
import { getIdToken, getIdTokenResult } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

/** Country code ('PR', 'US', ...) or null when undetectable. */
export async function detectCountry(timeoutMs = 4000) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch('https://ipapi.co/country/', { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const cc = (await res.text()).trim().toUpperCase();
    return cc && cc !== 'UNDEFINED' ? cc : null;
  } catch (_) {
    return null;
  }
}

/** 'qgi' for PR, 'external' for everywhere else AND unknown geo (§6.3). */
export function flowModeForCountry(cc) {
  return cc === 'PR' ? 'qgi' : 'external';
}

/** The current ID token's flowGate claims, or null when absent/unreadable. */
async function currentFlowClaims() {
  try {
    const r = await getIdTokenResult(auth.currentUser, false);
    const c = r && r.claims;
    return c && c.flow ? c : null;
  } catch (_) {
    return null;
  }
}

/** True when the current ID token already carries flowGate claims. */
export async function hasFlowClaims() {
  return (await currentFlowClaims()) !== null;
}

/**
 * Call flowGate, then refresh the ID token so firestore.rules sees the new
 * claims. Resolves { ok:true, verdict, flow, geoOk, licenseStatus, reason }.
 * If functions aren't deployed yet (or the call fails), resolves { ok:false }
 * and callers continue with legacy behavior — NEVER hard-breaks the app.
 *
 * Cached claims short-circuit ONLY when geoOk === true. A cached geoOk false
 * verdict is not final: it is what flowGate mints fail-closed when the
 * IP-intel provider can't vouch for the caller (verdict 'review'), and
 * because custom claims persist on the account, treating it as final would
 * poison the account forever — claim-gated reads would stay
 * permission-denied across every login and device. So a poisoned cache
 * re-runs flowGate and refreshes the token once per page load; the fresh
 * verdict returns WITHOUT the cached flag, so callers route on it exactly
 * like a first-time verdict. If that re-check itself errors, we fall back to
 * the existing claims (fail soft — the retry just happens next page load).
 */
export async function ensureFlowClaims({ appVersionCode = 0 } = {}) {
  let existing = null;
  try {
    if (!auth.currentUser) return { ok: false };
    existing = await currentFlowClaims();
    if (existing && existing.geoOk === true) {
      return {
        ok: true, cached: true,
        flow: existing.flow, geoOk: true,
        licenseStatus: existing.licenseStatus ?? null,
      };
    }
    const fns = getFunctions(auth.app, 'us-central1');
    const gate = httpsCallable(fns, 'flowGate');
    const { data } = await gate({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      appVersionCode,
    });
    await getIdToken(auth.currentUser, true);
    return { ok: true, ...data };
  } catch (e) {
    console.warn('[geo] flowGate unavailable, continuing without claims:', e.code || e.message);
    if (existing) {
      return {
        ok: true, cached: true, stale: true,
        flow: existing.flow, geoOk: existing.geoOk === true,
        licenseStatus: existing.licenseStatus ?? null,
      };
    }
    return { ok: false };
  }
}

/**
 * Route post-gate. Returns true when it navigated away.
 * block → geo-blocked.html (PR-only surface); review → pending screen.
 */
export function routeAfterGate(verdict, reason) {
  if (verdict === 'block') {
    const r = reason === 'billing-suspended' ? 'billing'
      : reason === 'external-pr' ? 'pr-external' : 'vpn';
    window.location.href = `geo-blocked.html?reason=${encodeURIComponent(r)}`;
    return true;
  }
  if (verdict === 'review') {
    window.location.href = 'geo-blocked.html?reason=review';
    return true;
  }
  return false;
}
