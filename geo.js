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

/** True when the current ID token already carries flowGate claims. */
export async function hasFlowClaims() {
  try {
    const r = await getIdTokenResult(auth.currentUser, false);
    return Boolean(r.claims && r.claims.flow);
  } catch (_) {
    return false;
  }
}

/**
 * Call flowGate, then refresh the ID token so firestore.rules sees the new
 * claims. Resolves { ok:true, verdict, flow, geoOk, licenseStatus, reason }.
 * If functions aren't deployed yet (or the call fails), resolves { ok:false }
 * and callers continue with legacy behavior — NEVER hard-breaks the app.
 */
export async function ensureFlowClaims({ appVersionCode = 0 } = {}) {
  try {
    if (!auth.currentUser) return { ok: false };
    if (await hasFlowClaims()) return { ok: true, cached: true };
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
