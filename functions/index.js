// functions/index.js — Nivelato flowGate + home-region monitor.
//
// Spec: nivelato-geo-flows-spec.md §4, §8.2, §10, §11 (phases 1–2).
// Phase 3 (Stripe checkout + provisioning webhook) is NOT scaffolded yet —
// see GEO_FLOWS.md. Nothing here is deployed; see GEO_FLOWS.md for deploy steps.
//
// flowGate contract (client):
//   const gate = httpsCallable(functions, 'flowGate');
//   const { data } = await gate({ timezone, appVersionCode });
//   // data: { verdict: 'allow'|'review'|'block', flow, geoOk, licenseStatus, reason? }
//   await getIdToken(auth.currentUser, true); // pick up the minted claims
//
// Claims minted on the ID token:
//   { orgId, role, flow, geoOk, licenseStatus, versionCode }
// firestore.rules / storage.rules enforce org data access off these claims —
// the client can lie, the token can't.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const functions = require('firebase-functions');
const { Resend } = require('resend');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Email pipeline - Resend, sender noreply@nivelatolabs.com.
//
// API key: functions config `resend.api_key`
//   firebase functions:config:set resend.api_key=<REDACTED_CREDENTIALS>
// (documented in EMAIL_PIPELINE.md). Falls back to RESEND_API_KEY env
// (emulator / .env). The key NEVER lives in source.
//
// BYOB design (2026-10-05): notification delivery is CALLABLE-based, not
// Firestore-trigger-based. A shop on their own Firebase project never
// touches the central project's Firestore, so triggers on the central
// project would silently miss their events. Instead the app reports events
// explicitly (reportQuoteEvent / requestWelcomeEmail) to these callables,
// which run on the central project and send via Resend. The app gates on
// notification_prefs client-side; these functions are a dumb pipe with
// rate limits, so a hostile client can at worst spam its own address.
// ---------------------------------------------------------------------------
const FROM_EMAIL = 'Nivelato <noreply@nivelatolabs.com>';

function resendClient() {
  const key = (functions.config().resend && functions.config().resend.api_key)
    || process.env.RESEND_API_KEY || '';
  if (!key) throw new HttpsError('failed-precondition', 'Email service not configured.');
  return new Resend(key);
}

async function sendEmail({ to, subject, html, text }) {
  const resend = resendClient();
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text || undefined,
  });
  if (error) {
    console.error('[email] resend error', error);
    throw new HttpsError('internal', 'No se pudo enviar el correo.');
  }
  return data; // { id }
}

// Simple per-key daily caps in Firestore (collection emailRateLimits).
// Keyed by purpose+recipient+date so one actor can't spam anyone.
async function checkRateLimit(key, cap) {
  const ref = db.doc(`emailRateLimits/${key}`);
  const ok = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? (snap.data().count || 0) : 0;
    if (count >= cap) return false;
    tx.set(ref, {
      count: count + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (!ok) throw new HttpsError('resource-exhausted', 'Demasiados correos, intenta más tarde.');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) throw new HttpsError('invalid-argument', 'Correo inválido.');
  return e;
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function emailShell(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head>`
    + `<body style="font-family:Inter,system-ui,sans-serif;background:#F0F2F5;margin:0;padding:24px;">`
    + `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:18px;padding:32px;box-shadow:0 2px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08);">`
    + `<div style="font-size:20px;font-weight:700;color:#1971C2;margin-bottom:4px;">Nivelato</div>`
    + `<div style="font-size:16px;font-weight:700;color:#212529;margin:12px 0 8px;">${title}</div>`
    + `<div style="font-size:14px;color:#495057;line-height:1.6;">${bodyHtml}</div>`
    + `<div style="margin-top:24px;font-size:12px;color:#868E96;">Este correo sale de una dirección automática, no respondas a este mensaje.</div>`
    + `</div></body></html>`;
}

// ---------------------------------------------------------------------------
// requestWelcomeEmail - callable. The app calls this right after signup
// (after creating notification_prefs defaults) so the welcome email fires
// on BOTH the default backend and BYOB shops. Rate-limited per address.
// Says hi so you don't have to.
// ---------------------------------------------------------------------------
exports.requestWelcomeEmail = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  const data = request.data || {};
  const email = cleanEmail(data.email);
  const name = String(data.name || '').trim().slice(0, 80);
  const today = new Date().toISOString().slice(0, 10);
  await checkRateLimit(`welcome:${email}:${today}`, 3);
  const greeting = name ? `Hola ${esc(name)},` : 'Hola,';
  const html = emailShell('Bienvenido a Nivelato', `
    <p>${greeting}</p>
    <p>Tu cuenta está lista. Con Nivelato puedes medir en el taller, armar cotizaciones con tu lista de precios y enviarlas como PDF, todo desde el teléfono.</p>
    <p>Si tu taller usa su propio proyecto de Firebase, todo sigue igual: los datos viven allá, los correos salen de acá.</p>
    <p>¿Preguntas? Escríbenos a <a href="mailto:lebron@nivelatolabs.com" style="color:#1971C2;">lebron@nivelatolabs.com</a>.</p>
    <p>¡A medir!</p>`);
  await sendEmail({
    to: email,
    subject: 'Bienvenido a Nivelato',
    html,
    text: `${greeting} Tu cuenta de Nivelato está lista. Mide, cotiza y envía PDFs desde el teléfono.`,
  });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// requestPasswordReset - callable. Generates the reset link with the Admin
// SDK (central project) and sends it from noreply@nivelatolabs.com, bypassing
// Firebase's default firebaseapp.com sender.
// For when the password is gone and so is your memory of it.
//
// BYOB note: the link can only be minted for users in the CENTRAL project.
// If the email isn't found here, the function throws 'not-found' and the
// app falls back to the client SDK sendPasswordResetEmail (default sender).
// ---------------------------------------------------------------------------
exports.requestPasswordReset = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  const data = request.data || {};
  const email = cleanEmail(data.email);
  const today = new Date().toISOString().slice(0, 10);
  await checkRateLimit(`reset:${email}:${today}`, 5);
  let link;
  try {
    link = await admin.auth().generatePasswordResetLink(email);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'Esta cuenta no está en el servidor central (¿usas un backend propio?).');
    }
    console.error('[email] reset link failed', e.message);
    throw new HttpsError('internal', 'No se pudo generar el enlace.');
  }
  const html = emailShell('Restablece tu contraseña', `
    <p>Hola,</p>
    <p>Pediste restablecer tu contraseña de Nivelato. Toca el botón para elegir una nueva:</p>
    <p style="margin:20px 0;"><a href="${esc(link)}" style="display:inline-block;background:#1971C2;color:#fff;font-weight:600;padding:12px 28px;border-radius:12px;text-decoration:none;">Restablecer contraseña</a></p>
    <p>Si no pediste esto, ignora este correo, tu contraseña no cambia.</p>`);
  await sendEmail({
    to: email,
    subject: 'Restablece tu contraseña de Nivelato',
    html,
    text: `Pediste restablecer tu contraseña de Nivelato. Usa este enlace: ${link} Si no lo pediste, ignora este correo.`,
  });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// reportQuoteEvent - callable. The app reports quote lifecycle events here;
// this function sends the notification email. Types:
// 'created' | 'updated' | 'ready' (enviada).
//
// Two recipient modes (BYOB design):
//  - Fan-out (default backend): the app passes {companyId} and this
//    function resolves recipients server-side via the Admin SDK: company
//    members minus the actor, each gated on their OWN notification_prefs
//    doc (toggle off = no email). This is the true "notify per prefs".
//  - Direct (BYOB shops): the central project cannot read the shop's
//    Firestore, so the app resolves the recipient list itself and passes
//    {to}. Per-user prefs can't be honored cross-project here; the shop's
//    app notifies the team (documented in EMAIL_PIPELINE.md).
// ---------------------------------------------------------------------------
const QUOTE_EVENT_COPY = {
  created: { subject: (n) => `Nueva cotización ${n}`, title: 'Nueva cotización' },
  updated: { subject: (n) => `Cotización ${n} actualizada`, title: 'Cotización actualizada' },
  ready: { subject: (n) => `Cotización ${n} enviada`, title: 'Cotización enviada al cliente' },
};
const QUOTE_PREF_KEY = { created: 'newProject', updated: 'projectEdit', ready: 'quoteReady' };

async function sendQuoteEmail(to, type, fields) {
  const { numero, cliente, company, total, actor } = fields;
  const copy = QUOTE_EVENT_COPY[type];
  const lines = [
    `<p>${type === 'created' ? 'Se creó' : type === 'updated' ? 'Se actualizó' : 'Se marcó como enviada'} la cotización <b>${esc(numero)}</b>${cliente ? ` para <b>${esc(cliente)}</b>` : ''}.</p>`,
  ];
  if (company) lines.push(`<p>Taller: ${esc(company)}</p>`);
  if (total) lines.push(`<p>Total: <b>$${esc(total)}</b></p>`);
  if (actor) lines.push(`<p>Hecho por: ${esc(actor)}</p>`);
  await sendEmail({
    to,
    subject: copy.subject(numero),
    html: emailShell(copy.title, lines.join('')),
    text: `${copy.title}: ${numero}${cliente ? ' para ' + cliente : ''}${total ? ', total $' + total : ''}.`,
  });
}

exports.reportQuoteEvent = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  const data = request.data || {};
  const type = String(data.type || '');
  if (!QUOTE_EVENT_COPY[type]) throw new HttpsError('invalid-argument', 'Tipo de evento inválido.');
  const numero = String(data.quoteNumero || '').slice(0, 40) || 'sin número';
  const fields = {
    numero,
    cliente: String(data.clienteNombre || '').slice(0, 120),
    company: String(data.companyName || '').slice(0, 120),
    total: data.total != null && data.total !== '' ? String(data.total).slice(0, 40) : null,
    actor: String(data.actorName || '').slice(0, 80),
  };
  const today = new Date().toISOString().slice(0, 10);
  const actorUid = request.auth ? request.auth.uid : null;

  // Direct mode (BYOB): single explicit recipient.
  if (data.to) {
    const to = cleanEmail(data.to);
    await checkRateLimit(`quote:${type}:${to}:${today}`, 20);
    await sendQuoteEmail(to, type, fields);
    return { ok: true, mode: 'direct' };
  }

  // Fan-out mode (default backend): resolve via Admin SDK, gate per prefs.
  const companyId = String(data.companyId || '').trim();
  if (!companyId) throw new HttpsError('invalid-argument', 'Falta companyId o to.');
  const compSnap = await db.doc(`companies/${companyId}`).get();
  if (!compSnap.exists) throw new HttpsError('not-found', 'Compañía no encontrada.');
  const members = compSnap.data().members || {};
  const prefKey = QUOTE_PREF_KEY[type];
  let sent = 0;
  for (const uid of Object.keys(members)) {
    if (actorUid && uid === actorUid) continue;
    try {
      const [uSnap, pSnap] = await Promise.all([
        db.doc(`users/${uid}`).get(),
        db.doc(`notification_prefs/${uid}`).get(),
      ]);
      const email = uSnap.exists ? String(uSnap.data().email || '').trim().toLowerCase() : '';
      if (!EMAIL_RE.test(email)) continue;
      const prefs = pSnap.exists ? pSnap.data() : {};
      if (prefs[prefKey] === false) continue; // toggle off = no email
      await checkRateLimit(`quote:${type}:${email}:${today}`, 20);
      await sendQuoteEmail(email, type, fields);
      sent++;
    } catch (e) {
      console.warn('[email] fanout skip', uid, e.message);
    }
  }
  return { ok: true, mode: 'fanout', sent };
});

// ---------------------------------------------------------------------------
// IP intelligence provider. Knows where you are before you do.
// ip-api.com free tier (45 req/min, no key): countryCode + proxy/hosting flags.
// IPINFO_TOKEN env var optionally overrides with ipinfo.io (paid tier).
// If all providers fail, lookups fail CLOSED to `review` — never `allow`,
// never `block` (we can't prove anything without intel).
// ---------------------------------------------------------------------------
const IPINFO_TOKEN = process.env.IPINFO_TOKEN || '';

async function ipIntel(ip) {
  // Loopback / emulator callers have no meaningful geo.
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') ||
      ip.startsWith('192.168.') || ip.startsWith('172.16.')) {
    return { ok: false, reason: 'private-ip' };
  }
  // Paid override: ipinfo.io with privacy flags.
  if (IPINFO_TOKEN) {
    try {
      const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}?token=${IPINFO_TOKEN}`);
      if (!res.ok) return { ok: false, reason: `provider-http-${res.status}` };
      const j = await res.json();
      const p = j.privacy || {};
      // NOTE (2026-10-09): `hosting` excluded from the block trigger.
      // It false-positives on mobile carrier CGNAT and business ISP ranges
      // (company networks kept getting flagged). `proxy`/`vpn`/`tor`/`relay`
      // are the reliable anonymizer signals. `hosting` stays in flags for
      // triage logging.
      return {
        ok: true,
        country: j.country || null,
        region: j.region || null,
        untrusted: Boolean(p.vpn || p.proxy || p.tor || p.relay),
        flags: {
          vpn: Boolean(p.vpn), proxy: Boolean(p.proxy), tor: Boolean(p.tor),
          relay: Boolean(p.relay), hosting: Boolean(p.hosting),
        },
        rawCountry: j.country || null,
      };
    } catch (e) {
      return { ok: false, reason: 'provider-error' };
    }
  }
  // Free default: ip-api.com (no key, countryCode + proxy/hosting).
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,region,proxy,hosting,query`);
    if (!res.ok) return { ok: false, reason: `provider-http-${res.status}` };
    const j = await res.json();
    if (j.status !== 'success') return { ok: false, reason: 'provider-fail' };
    // NOTE (2026-10-09): `hosting` excluded from the block trigger — see above.
    // ip-api.com's hosting flag fires on mobile carriers and business ISPs.
    return {
      ok: true,
      country: j.countryCode || null,      // 'PR', 'US', ...
      region: j.region || null,
      untrusted: Boolean(j.proxy),
      flags: { vpn: false, proxy: Boolean(j.proxy), tor: false, relay: false, hosting: Boolean(j.hosting) },
      rawCountry: j.countryCode || null,
    };
  } catch (e) {
    return { ok: false, reason: 'provider-error' };
  }
}

// Apple's iCloud Private Relay egress ranges are published by Apple;
// ipinfo's `privacy.relay` flag already covers them. No carve-out per
// Giulia (2026-09-19): relay egress on the QGI flow = hard block.

// ---------------------------------------------------------------------------
// flowGate — the authority for flow/geo/license. Callable, auth required.
// ---------------------------------------------------------------------------
exports.flowGate = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'flowGate requires a signed-in user.');
  }
  const uid = request.auth.uid;
  const data = request.data || {};
  const clientTimezone = typeof data.timezone === 'string' ? data.timezone : null;
  const appVersionCode = Number.isInteger(data.appVersionCode) ? data.appVersionCode : 0;

  // 1. Load user + org (admin SDK bypasses rules — this IS the authority).
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    throw new HttpsError('failed-precondition', 'No user profile yet.');
  }
  let user = userSnap.data();
  if (user.disabled) {
    // Add User invites: a pending joiner (disabled === true, exactly —
    // 'rejected' is a string and never auto-applies) whose sign-in email
    // has a pending invite in their org gets the invite's role +
    // permission overrides applied here and is activated in place, so
    // invited users skip the manual approval queue. No invite (or any
    // error applying it) keeps the normal block below.
    const applied = user.disabled === true
      ? await applyPendingInvite(uid, user, request.auth.token)
      : null;
    if (!applied) {
      // Pending/rejected users get no claims and no geo verdict beyond this.
      return { verdict: 'block', reason: 'account-disabled', flow: null, geoOk: false, licenseStatus: null };
    }
    user = applied;
  }
  const orgId = user.orgId;
  if (!orgId) throw new HttpsError('failed-precondition', 'User has no org.');
  const orgSnap = await db.doc(`orgs/${orgId}`).get();
  if (!orgSnap.exists) throw new HttpsError('failed-precondition', 'Org not found.');
  const org = orgSnap.data();
  const flow = org.flow || null; // fail closed on unknown flow below
  const licenseStatus = org.licenseStatus || 'active';

  // B1 hardening: the user doc is created CLIENT-side at signup, so never
  // mint claims off its role/orgId alone. Cross-check server-side:
  //  - role must be a known role, else it falls back to 'medidor';
  //  - 'owner' is minted ONLY when the org doc's ownerId is this user
  //    (an attacker who hand-crafts role:'owner' on someone else's org
  //    gets permission-denied instead of admin claims).
  const KNOWN_ROLES = ['owner', 'supervisor', 'medidor', 'cotizador'];
  const claimedRole = KNOWN_ROLES.includes(user.role) ? user.role : 'medidor';
  if (claimedRole === 'owner' && org.ownerId !== uid) {
    throw new HttpsError('permission-denied',
      'Role does not match org ownership.');
  }

  // 2. Server-observed IP → geo + trust flags.
  const callerIp = request.rawRequest ? request.rawRequest.ip : null;
  const intel = await ipIntel(callerIp);
  const country = intel.ok ? intel.country : null;
  const inPR = country === 'PR';
  const untrustedIp = intel.ok && intel.untrusted;

  // 3. Timezone corroboration (client-reported, never decisive alone).
  //    Expected zones for a PR-geolocated client: America/Puerto_Rico AND
  //    America/La_Paz. La Paz is not an error: Windows' San Juan zone
  //    (SA Western Standard Time) shares UTC-4 with Bolivia and its
  //    canonical IANA mapping resolves to America/La_Paz, so browsers on
  //    correctly configured PR Windows machines report La Paz. Do not
  //    "fix" this back to Puerto_Rico-only — that misread is what locked
  //    QGI out on 2026-10-12.
  const PR_EXPECTED_ZONES = ['America/Puerto_Rico', 'America/La_Paz'];
  const tzMismatch = clientTimezone && intel.ok && inPR && !PR_EXPECTED_ZONES.includes(clientTimezone);

  // 4. Verdict.
  let verdict = 'review';
  let reason = 'default-review';
  let geoOk = false;
  let tzMismatchLogged = false;

  if (flow !== 'qgi' && flow !== 'external') {
    verdict = 'block'; reason = 'unknown-flow'; // fail closed on unclassified orgs
  } else if (licenseStatus === 'canceled' || licenseStatus === 'suspended') {
    verdict = 'block'; reason = 'billing-suspended'; geoOk = true; // billing block, not geo
  } else if (flow === 'qgi') {
    // FAIL CLOSED: any untrusted-IP signal on the QGI flow is a hard block.
    // No GPS downgrade, no review-first leniency, no relay carve-out.
    if (untrustedIp) {
      verdict = 'block'; reason = 'untrusted-ip-qgi';
    } else if (!intel.ok) {
      verdict = 'review'; reason = `no-intel:${intel.reason}`;
    } else if (inPR) {
      if (tzMismatch) {
        // Log-only (policy 2026-10-12): reaching this branch means the IP
        // intel exists and is trusted (untrusted IPs hard-block above,
        // missing intel reviews above), so a disagreeing client timezone
        // on a clean PR IP is corroboration noise, not a lockout signal.
        // Record it in geoReviews at step 6, but allow — mirrors the
        // external flow's log-only philosophy (section 8.7). tzMismatch
        // still counts toward review/block whenever the IP is untrusted
        // or intel is missing; those paths never reach this branch.
        verdict = 'allow'; reason = 'pr-clean-tz-logged'; geoOk = true;
        tzMismatchLogged = true;
      }
      else { verdict = 'allow'; reason = 'pr-clean'; geoOk = true; }
    } else {
      // Non-PR geo on a QGI user: traveling employee — logged, NOT blocked (§8.6).
      verdict = 'allow'; reason = 'qgi-travel-logged'; geoOk = true;
    }
  } else { // flow === 'external'
    // Fail-open-ish: VPN flags on external are log-only, never blocking (§8.7).
    if (!intel.ok) { verdict = 'review'; reason = `no-intel:${intel.reason}`; }
    else { verdict = 'allow'; reason = inPR ? 'external-pr-flagged' : 'external-clean'; geoOk = true; }
    // NOTE: inPR on an external org feeds the exclusivity monitor (§8.2) via
    // lastSeenRegion — it does not block the individual login.
  }

  // 5. Persist geo state on the user doc (region-level only, never precise GPS).
  const geoStatus = verdict === 'allow' ? 'verified' : verdict; // 'verified'|'review'|'blocked'
  await db.doc(`users/${uid}`).set({
    geoStatus: verdict === 'block' ? 'blocked' : geoStatus,
    lastGeoCheck: admin.firestore.FieldValue.serverTimestamp(),
    ...(country ? { lastSeenRegion: country } : {}),
  }, { merge: true });

  // 5b. Home region: the region detected at signup (this gate runs in the
  // same login flow, right after account creation) becomes the account's
  // home region. Set-once: an already-set homeRegion is never overwritten
  // here. The QR upgrade flow (redeemUpgradeLink) is the backfill for
  // accounts this never ran for; it follows the same set-once rule.
  if (country && !user.homeRegion) {
    await db.doc(`users/${uid}`).set({ homeRegion: country }, { merge: true });
  }
  if (country && orgId && !org.homeRegion) {
    await db.doc(`orgs/${orgId}`).set({ homeRegion: country }, { merge: true });
  }

  // 6. Review verdicts land in Giulia's triage queue. Log-only tz
  //    mismatches are written to the same collection with the same
  //    signals (the mismatch stays on record), but with status 'logged'
  //    so they never enter the triage queue.
  if (verdict === 'review' || tzMismatchLogged) {
    await db.collection('geoReviews').add({
      uid, orgId, reason: tzMismatchLogged ? 'tz-mismatch' : reason,
      signals: {
        country, untrustedIp, flags: intel.flags || null,
        clientTimezone, tzMismatch: Boolean(tzMismatch), callerIpTruncated: callerIp ? 'present' : 'absent',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: verdict === 'review' ? 'open' : 'logged',
    });
  }

  // 7. Mint claims. licenseStatus passes through so rules can enforce the
  //    past-due read-only grace (rules: read ok on past_due, write denied).
  const claims = {
    orgId,
    role: claimedRole,
    flow,
    geoOk,
    licenseStatus,
    versionCode: appVersionCode,
  };
  await admin.auth().setCustomUserClaims(uid, claims);

  // UI version tag for this org (feeds the client's update heuristics).
  const uiVersionDoc = await readOrgUiVersion(orgId);
  const uiVersion = uiVersionDoc ? uiVersionDoc.tag : null;

  return { verdict, flow, geoOk, licenseStatus, reason, uiVersion };
});

// ---------------------------------------------------------------------------
// UI version tagging — backend updates version-tag the UI scheme per org.
// Tag format: v{semver}-{theme}-{orgId}  (e.g. v1.1.1-darkmode-qgc)
// See UI_VERSIONING.md for the full spec.
// ---------------------------------------------------------------------------

const UI_THEMES = ['darkmode', 'light'];

function buildUiTag(semver, theme, orgId) {
  const v = String(semver || '').trim().replace(/^v/, '');
  const t = UI_THEMES.includes(theme) ? theme : 'darkmode';
  const o = String(orgId || '').trim();
  return `v${v}-${t}-${o}`;
}

function parseUiTag(tag) {
  const m = String(tag || '').trim().match(/^v([^-]+)-([^-]+)-(.+)$/);
  if (!m) return null;
  return { semver: m[1], theme: m[2], orgId: m[3] };
}

async function readOrgUiVersion(orgId) {
  try {
    const snap = await db.doc(`config/ui_versions/orgs/${orgId}`).get();
    return snap.exists ? snap.data() : null;
  } catch (_) {
    return null;
  }
}

// setUiVersion — callable, owner role required. Sets the UI version tag for
// an org. Called by the backend deploy pipeline after a release.
// Params: { orgId, semver, theme }
exports.setUiVersion = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'setUiVersion requires a signed-in user.');
  }
  const uid = request.auth.uid;
  const data = request.data || {};
  const orgId = typeof data.orgId === 'string' ? data.orgId.trim() : '';
  const semver = typeof data.semver === 'string' ? data.semver.trim().replace(/^v/, '') : '';
  const theme = typeof data.theme === 'string' ? data.theme.trim() : 'darkmode';

  if (!orgId) throw new HttpsError('invalid-argument', 'orgId is required.');
  if (!/^\d+\.\d+\.\d+$/.test(semver)) {
    throw new HttpsError('invalid-argument', 'semver must look like 1.1.1.');
  }
  if (!UI_THEMES.includes(theme)) {
    throw new HttpsError('invalid-argument', 'theme must be darkmode or light.');
  }

  // Owner-only: the caller must own the org.
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) throw new HttpsError('failed-precondition', 'No user profile.');
  const user = userSnap.data();
  if (user.orgId !== orgId) {
    throw new HttpsError('permission-denied', 'You do not belong to this org.');
  }
  const orgSnap = await db.doc(`orgs/${orgId}`).get();
  if (!orgSnap.exists) throw new HttpsError('failed-precondition', 'Org not found.');
  if (orgSnap.data().ownerId !== uid && user.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Only the org owner can set the UI version.');
  }

  const tag = buildUiTag(semver, theme, orgId);
  const doc = {
    tag, semver, theme, orgId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: uid,
  };
  await db.doc(`config/ui_versions/orgs/${orgId}`).set(doc, { merge: true });

  // Keep the global latest pointer fresh.
  const globalRef = db.doc('config/ui_versions');
  const globalSnap = await globalRef.get();
  const cur = globalSnap.exists ? globalSnap.data().latestSemver : null;
  if (!cur || compareSemver(semver, cur) > 0) {
    await globalRef.set({
      latestSemver: semver,
      releasedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return { tag, semver, theme, orgId };
});

// Numeric semver compare: returns 1 if a > b, -1 if a < b, 0 if equal.
function compareSemver(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// homeRegionMonitor — scheduled exclusivity watchdog (§8.2).
// Every 6h: for each external org, look at active users' lastSeenRegion over
// the trailing 14 days; if >30% resolve to PR → open a geoReviews case and
// mark the org for review. Majority-over-time, never a single ping.
// ---------------------------------------------------------------------------
const EXCLUSIVITY_WINDOW_DAYS = 14;
const EXCLUSIVITY_PR_THRESHOLD = 0.30; // >30% of active users PR-resolved → case

exports.homeRegionMonitor = onSchedule(
  { region: 'us-central1', schedule: 'every 6 hours', memory: '256MiB' },
  async () => {
    const cutoff = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - EXCLUSIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    );
    const orgsSnap = await db.collection('orgs').where('flow', '==', 'external').get();
    let casesOpened = 0;
    for (const orgDoc of orgsSnap.docs) {
      const orgId = orgDoc.id;
      const usersSnap = await db.collection('users')
        .where('orgId', '==', orgId)
        .where('lastGeoCheck', '>=', cutoff)
        .get();
      if (usersSnap.empty) continue;
      let prCount = 0;
      usersSnap.forEach((u) => {
        if ((u.data().lastSeenRegion || '') === 'PR') prCount++;
      });
      const ratio = prCount / usersSnap.size;
      if (ratio > EXCLUSIVITY_PR_THRESHOLD) {
        await db.collection('geoReviews').add({
          uid: null,
          orgId,
          reason: 'exclusivity-violation',
          signals: {
            prUserRatio: ratio, prUsers: prCount,
            activeUsers: usersSnap.size, windowDays: EXCLUSIVITY_WINDOW_DAYS,
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'open',
        });
        casesOpened++;
      }
    }
    return { casesOpened, orgsScanned: orgsSnap.size };
  }
);

// ---------------------------------------------------------------------------
// Upgrade link pairing (QR) — web mints, the Android app redeems.
//
// Flow: a signed-in web user opens "Mejorar plan" on the dashboard. The web
// computes a stable fingerprint of the PC (SHA-1 over hardware/browser
// signals) and calls createUpgradeLink, which stores an upgradeLinks doc and
// returns a QR (SVG) of:
//
//     nivelato://upgrade/<fp>?t=<token>
//
// The fingerprint IDENTIFIES the web machine (same PC, same hash, forever);
// it is low-entropy and public by design, so it authorizes NOTHING. The
// token authorizes the binding: 192-bit random, doc-id keyed, 10-minute
// TTL, single-use, attempt-capped. The app opens the link, and once the user
// is signed in there, NivelatoCloud calls redeemUpgradeLink over HTTPS with
// { token, fp, email, deviceUuid }. The server checks the token, the
// fingerprint, and that the app account email matches the web account email
// on the record; then it links the device to the account and sets the home
// region if unset. The purchase itself still happens in the app (Play
// Billing) and the tier syncs back to users/{uid} via the existing
// syncTierToAccount path.
//
// Home region source: the country the SERVER observes for the web request
// (ipIntel, same derivation flowGate uses), captured at mint time on the
// link record. "Home region" in this system is orgs/{orgId}.homeRegion;
// it is set only when empty, and mirrored onto users/{uid}.homeRegion for
// org-less personal accounts (also only when empty).
// ---------------------------------------------------------------------------
const UPGRADE_LINK_TTL_MS = 10 * 60 * 1000;
const UPGRADE_LINK_MAX_ATTEMPTS = 5;

exports.createUpgradeLink = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'createUpgradeLink requires a signed-in user.');
  }
  const uid = request.auth.uid;
  const email = String((request.auth.token && request.auth.token.email) || '').trim().toLowerCase();
  const fp = String((request.data && request.data.fp) || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(fp)) {
    throw new HttpsError('invalid-argument', 'Huella del equipo inválida.');
  }
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    throw new HttpsError('failed-precondition', 'No user profile yet.');
  }
  const user = userSnap.data();
  if (user.disabled) {
    throw new HttpsError('permission-denied', 'Cuenta deshabilitada.');
  }
  const orgId = user.orgId || null;

  // Region for the home-region default: server-observed IP country, exactly
  // the way flowGate derives it. Country-level only, never precise location.
  const callerIp = request.rawRequest ? request.rawRequest.ip : null;
  const intel = await ipIntel(callerIp);
  const region = intel.ok ? (intel.country || null) : null;

  // Reuse a live link for the same account + machine: repeat visits from
  // the same PC produce the same pairing while the token is still valid.
  const now = Date.now();
  let token = null;
  let expiresAtMs = 0;
  const existing = await db.collection('upgradeLinks')
    .where('uid', '==', uid).where('fp', '==', fp).where('usedAt', '==', null)
    .limit(5).get();
  existing.forEach((d) => {
    const data = d.data();
    const exp = data.expiresAt && data.expiresAt.toMillis ? data.expiresAt.toMillis() : 0;
    if (!token && exp > now) { token = d.id; expiresAtMs = exp; }
  });
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url'); // 192-bit, unguessable
    expiresAtMs = now + UPGRADE_LINK_TTL_MS;
    await db.doc(`upgradeLinks/${token}`).set({
      uid, email: email || null, orgId, fp, region,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
      usedAt: null, attempts: 0, deviceUuid: null,
    });
  }
  const url = `nivelato://upgrade/${fp}?t=${token}`;
  let qrSvg = null;
  try {
    const QRCode = require('qrcode');
    qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 240 });
  } catch (e) {
    console.error('[upgradeLink] QR render failed', e);
    qrSvg = null;
  }
  return { url, qrSvg, expiresAt: expiresAtMs };
});

exports.redeemUpgradeLink = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  // No Firebase Auth on this call by design: the caller is the native app
  // (authed against the nivelato-android project, not this one). The
  // single-use token IS the credential; fp + account email must match the
  // record, and failed attempts burn the token.
  const data = request.data || {};
  const token = String(data.token || '');
  const fp = String(data.fp || '').trim().toLowerCase();
  const email = String(data.email || '').trim().toLowerCase();
  const deviceUuid = String(data.deviceUuid || '').trim();
  // App version reported by the redeeming build (linked-devices freshness).
  const appVersionName = typeof data.appVersionName === 'string' && /^[A-Za-z0-9._-]{1,32}$/.test(data.appVersionName)
    ? data.appVersionName : '';
  const appVersionCode = Number.isInteger(data.appVersionCode) ? data.appVersionCode : 0;
  if (!token || !/^[0-9a-f]{40}$/.test(fp) || !EMAIL_RE.test(email) || !deviceUuid || deviceUuid.length > 128) {
    throw new HttpsError('invalid-argument', 'Datos de vinculación incompletos.');
  }
  const ref = db.doc(`upgradeLinks/${token}`);
  const link = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Enlace no encontrado o expirado.');
    const rec = snap.data();
    if (rec.usedAt) throw new HttpsError('failed-precondition', 'Este enlace ya fue usado.');
    const exp = rec.expiresAt && rec.expiresAt.toMillis ? rec.expiresAt.toMillis() : 0;
    if (exp <= Date.now()) throw new HttpsError('deadline-exceeded', 'El enlace expiró. Genera uno nuevo desde la web.');
    const attempts = (rec.attempts || 0) + 1;
    if (attempts > UPGRADE_LINK_MAX_ATTEMPTS) {
      tx.update(ref, { attempts, usedAt: admin.firestore.FieldValue.serverTimestamp(), burnReason: 'too-many-attempts' });
      throw new HttpsError('resource-exhausted', 'Demasiados intentos. Genera un enlace nuevo desde la web.');
    }
    if (rec.fp !== fp || (rec.email && rec.email !== email)) {
      tx.update(ref, { attempts });
      throw new HttpsError('permission-denied', 'El enlace no coincide con esta cuenta o este equipo.');
    }
    tx.update(ref, {
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
      attempts,
      deviceUuid,
      redeemedEmail: email,
    });
    return rec;
  });

  const uid = link.uid;
  const orgId = link.orgId || null;

  // Link the device to the account on the backend.
  await db.doc(`users/${uid}`).set({
    linkedDevices: admin.firestore.FieldValue.arrayUnion(deviceUuid),
    lastLinkedDevice: deviceUuid,
    lastDeviceLinkAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  const deviceRef = db.doc(`devices/${deviceUuid}`);
  const deviceFields = {
    uid, email, fp, via: 'upgrade-link', orgId,
    linkedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (appVersionName) {
    deviceFields.appVersionName = appVersionName;
    deviceFields.appVersionCode = appVersionCode;
    deviceFields.versionReportedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await deviceRef.set(deviceFields, { merge: true });
  // Renameable display name: initialize ONCE. A re-link must never wipe a
  // name the user already gave the device (renameDevice owns the field).
  const devSnap = await deviceRef.get();
  if (!devSnap.exists || typeof (devSnap.data() || {}).displayName !== 'string') {
    await deviceRef.set({ displayName: '' }, { merge: true });
  }
  // Notification (data layer): the device-linked event lands in the user's
  // notifications. Best effort: a notification failure never fails a redeem.
  try {
    await pushNotification(uid, {
      type: 'device',
      title: 'Dispositivo vinculado',
      body: 'Un dispositivo se vinculó a tu cuenta desde la web.',
      data: { deviceUuid },
    });
  } catch (e) {
    console.error('[notifications] device-linked write failed', e);
  }

  // Home region: set only if unset (org field is the system's home region;
  // mirror onto the user doc for org-less personal accounts).
  let homeRegionSet = null;
  if (link.region) {
    if (orgId) {
      const orgRef = db.doc(`orgs/${orgId}`);
      const orgSnap = await orgRef.get();
      if (orgSnap.exists && !orgSnap.data().homeRegion) {
        await orgRef.set({ homeRegion: link.region }, { merge: true });
        homeRegionSet = link.region;
      }
    }
    const uSnap = await db.doc(`users/${uid}`).get();
    if (uSnap.exists && !uSnap.data().homeRegion) {
      await db.doc(`users/${uid}`).set({ homeRegion: link.region }, { merge: true });
      homeRegionSet = homeRegionSet || link.region;
    }
  }
  return { ok: true, homeRegionSet };
});

// ---------------------------------------------------------------------------
// Linked devices + notifications — DATA LAYER ONLY (v1.1).
//
// The dashboard UI for both is PARKED until Giulia's dashboard redesign
// lands; everything below is the backend those screens will read, built on
// the existing registries (no parallel device store):
//
//   devices/{deviceUuid}   — written by redeemUpgradeLink (QR pairing):
//     { uid, email, fp, via, orgId, linkedAt, displayName,
//       appVersionName, appVersionCode, versionReportedAt }
//     orgId is the company context the device was linked under (null =
//     personal account). displayName is the user-renameable label (''
//     means unnamed; clients fall back to a model/version label).
//
//   users/{uid}/notifications/{id} — the notification record:
//     { type: 'device'|'update'|'account'|'org', title, body,
//       data: { ...refs (deviceUuid, orgId, version) }, createdAt,
//       readAt: null | Timestamp }
//     Producers call pushNotification(); readers use listNotifications.
//     Wired producer today: device-linked (in redeemUpgradeLink).
//     Update notices still surface via updates.html / app_updates and are
//     NOT duplicated here yet; device-outdated warnings are derived at
//     read time by listLinkedDevices (outdated flag), not stored.
// ---------------------------------------------------------------------------

// Dotted-numeric version compare ("1.1.0" vs "1.0"): -1 / 0 / 1.
function compareVersionNames(a, b) {
  const pa = String(a || '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '').split('.').map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// Current release versionName from the app_updates pointer (Job A config).
async function latestAppVersionName() {
  const snap = await db.doc('app_updates/latest').get();
  if (!snap.exists) return '';
  const v = (snap.data() || {}).version;
  return typeof v === 'string' ? v : '';
}

// A linked device is outdated when its last reported versionName is older
// than the current release. A device that never reported a version (linked
// by a build predating the field) counts as outdated.
function deviceIsOutdated(device, latestVersion) {
  if (!latestVersion) return false;
  if (!device.appVersionName) return true;
  return compareVersionNames(device.appVersionName, latestVersion) < 0;
}

// The caller's linked devices, grouped by company context (orgId, with
// 'personal' for org-less links). Each entry carries its renameable
// displayName, last reported app version, and the outdated warning flag.
exports.listLinkedDevices = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'listLinkedDevices requires a signed-in user.');
  }
  const uid = request.auth.uid;
  const latest = await latestAppVersionName();
  const snap = await db.collection('devices').where('uid', '==', uid).get();
  const groups = {};
  snap.forEach((d) => {
    const dev = d.data() || {};
    const key = dev.orgId || 'personal';
    if (!groups[key]) groups[key] = [];
    groups[key].push({
      uuid: d.id,
      displayName: typeof dev.displayName === 'string' ? dev.displayName : '',
      email: dev.email || null,
      via: dev.via || null,
      linkedAt: dev.linkedAt && dev.linkedAt.toMillis ? dev.linkedAt.toMillis() : null,
      appVersionName: dev.appVersionName || null,
      appVersionCode: dev.appVersionCode || null,
      outdated: deviceIsOutdated(dev, latest),
    });
  });
  return { latestVersion: latest || null, groups };
});

// Shared device-rename validation + write (renameDevice and
// renameMemberDevice): the device uuid must be present and sane; the
// display name is trimmed, capped at 60 chars, and must not end up
// empty.
function parseDeviceRenameArgs(data) {
  const deviceUuid = String((data && data.deviceUuid) || '').trim();
  const displayName = String((data && data.displayName) || '').trim().slice(0, 60);
  if (!deviceUuid || deviceUuid.length > 128) {
    throw new HttpsError('invalid-argument', 'Dispositivo inválido.');
  }
  if (!displayName) {
    throw new HttpsError('invalid-argument', 'El nombre no puede estar vacío.');
  }
  return { deviceUuid, displayName };
}

async function writeDeviceDisplayName(deviceUuid, displayName) {
  await db.doc(`devices/${deviceUuid}`).set({ displayName }, { merge: true });
  return { ok: true, displayName };
}

// Rename a linked device. Only the owning account can rename its devices.
exports.renameDevice = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'renameDevice requires a signed-in user.');
  }
  const uid = request.auth.uid;
  const { deviceUuid, displayName } = parseDeviceRenameArgs(request.data);
  const ref = db.doc(`devices/${deviceUuid}`);
  const snap = await ref.get();
  if (!snap.exists || (snap.data() || {}).uid !== uid) {
    throw new HttpsError('not-found', 'Dispositivo no encontrado.');
  }
  return writeDeviceDisplayName(deviceUuid, displayName);
});

// Shared org-scoped member authorization (listUserDevices and
// renameMemberDevice): the caller must have a profile in an org, the
// target user must belong to that same org, and when caller !== target
// the caller must be the org owner (org doc ownerId === caller, or the
// caller's user doc role === 'owner'). ownerDenyMessage lets each
// callable phrase the owner-only denial for its own action. Returns
// { caller, orgId }.
async function authorizeOrgMemberAccess(callerUid, targetUid, ownerDenyMessage) {
  const callerSnap = await db.doc(`users/${callerUid}`).get();
  if (!callerSnap.exists) throw new HttpsError('failed-precondition', 'No user profile.');
  const caller = callerSnap.data();
  const orgId = caller.orgId || null;
  if (!orgId) {
    throw new HttpsError('permission-denied', 'Tu cuenta no pertenece a una empresa.');
  }
  const targetSnap = await db.doc(`users/${targetUid}`).get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');
  if ((targetSnap.data() || {}).orgId !== orgId) {
    throw new HttpsError('permission-denied', 'Ese usuario no pertenece a tu empresa.');
  }
  if (callerUid !== targetUid) {
    const orgSnap = await db.doc(`orgs/${orgId}`).get();
    const org = orgSnap.exists ? orgSnap.data() : {};
    if (org.ownerId !== callerUid && caller.role !== 'owner') {
      throw new HttpsError('permission-denied', ownerDenyMessage);
    }
  }
  return { caller, orgId };
}

// A company member's linked devices, for the Users screen device panel.
// listLinkedDevices above is caller-scoped and cannot serve this: the
// panel shows ANOTHER member's devices, and devices/{id} is not
// client-readable by rules, so the read has to happen here.
//
// Auth rule (same owner check as setUiVersion): the caller must be
// signed in, belong to the same org as the target user, and be either
// the target themselves or the org owner (org doc ownerId === caller,
// or the caller's user doc role === 'owner'). Only devices linked
// under that org context are returned.
exports.listUserDevices = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'listUserDevices requires a signed-in user.');
  }
  const callerUid = request.auth.uid;
  const targetUid = String((request.data && request.data.uid) || '').trim();
  if (!targetUid || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'Falta el usuario.');
  }
  const { orgId } = await authorizeOrgMemberAccess(callerUid, targetUid,
    'Solo el dueño de la empresa puede ver los dispositivos de su equipo.');
  const latest = await latestAppVersionName();
  // Single-field query (like listLinkedDevices) + in-code org filter:
  // a two-field where would need a composite index for no benefit.
  const snap = await db.collection('devices').where('uid', '==', targetUid).get();
  const devices = [];
  snap.forEach((d) => {
    const dev = d.data() || {};
    if ((dev.orgId || null) !== orgId) return;
    devices.push({
      uuid: d.id,
      displayName: typeof dev.displayName === 'string' ? dev.displayName : '',
      brand: dev.brand || null,
      model: dev.model || null,
      email: dev.email || null,
      via: dev.via || null,
      linkedAt: dev.linkedAt && dev.linkedAt.toMillis ? dev.linkedAt.toMillis() : null,
      appVersionName: dev.appVersionName || null,
      appVersionCode: dev.appVersionCode || null,
      outdated: deviceIsOutdated(dev, latest),
    });
  });
  devices.sort((a, b) => (b.linkedAt || 0) - (a.linkedAt || 0));
  return { latestVersion: latest || null, orgId, devices, total: devices.length, limit: 5 };
});

// Rename a company member's linked device. The org-scoped counterpart
// to renameDevice: same name validation and write (parseDeviceRenameArgs
// / writeDeviceDisplayName), but authorization follows the
// listUserDevices rule via authorizeOrgMemberAccess instead of device
// ownership alone, so the org owner can rename a member's device from
// the Users screen. The device must belong to the target user and be
// linked under the caller's org context (the only devices the panel
// ever shows); anything else reads as not-found, like renameDevice.
// renameDevice itself is unchanged and stays device-owner-only.
exports.renameMemberDevice = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'renameMemberDevice requires a signed-in user.');
  }
  const callerUid = request.auth.uid;
  const targetUid = String((request.data && request.data.uid) || '').trim();
  if (!targetUid || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'Falta el usuario.');
  }
  const { deviceUuid, displayName } = parseDeviceRenameArgs(request.data);
  const { orgId } = await authorizeOrgMemberAccess(callerUid, targetUid,
    'Solo el dueño de la empresa puede renombrar los dispositivos de su equipo.');
  const ref = db.doc(`devices/${deviceUuid}`);
  const snap = await ref.get();
  const dev = snap.exists ? (snap.data() || {}) : null;
  if (!dev || dev.uid !== targetUid || (dev.orgId || null) !== orgId) {
    throw new HttpsError('not-found', 'Dispositivo no encontrado.');
  }
  return writeDeviceDisplayName(deviceUuid, displayName);
});

// The one write path for notifications. Server-side producers only;
// clients never write this subcollection directly.
async function pushNotification(uid, { type, title, body, data }) {
  const ref = db.collection(`users/${uid}/notifications`).doc();
  await ref.set({
    type: type || 'account',
    title: String(title || ''),
    body: String(body || ''),
    data: data || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    readAt: null,
  });
  return ref.id;
}

exports.listNotifications = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'listNotifications requires a signed-in user.');
  }
  const uid = request.auth.uid;
  const snap = await db.collection(`users/${uid}/notifications`)
    .orderBy('createdAt', 'desc').limit(50).get();
  const items = [];
  let unreadCount = 0;
  snap.forEach((d) => {
    const n = d.data() || {};
    const read = !!n.readAt;
    if (!read) unreadCount++;
    items.push({
      id: d.id,
      type: n.type || 'account',
      title: n.title || '',
      body: n.body || '',
      data: n.data || {},
      createdAt: n.createdAt && n.createdAt.toMillis ? n.createdAt.toMillis() : null,
      read,
    });
  });
  return { items, unreadCount };
});

exports.markNotificationRead = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'markNotificationRead requires a signed-in user.');
  }
  const uid = request.auth.uid;
  const col = db.collection(`users/${uid}/notifications`);
  const id = String((request.data && request.data.id) || '').trim();
  const all = !!(request.data && request.data.all);
  const now = admin.firestore.FieldValue.serverTimestamp();
  if (all) {
    const snap = await col.where('readAt', '==', null).limit(200).get();
    const batch = db.batch();
    snap.forEach((d) => batch.set(d.ref, { readAt: now }, { merge: true }));
    await batch.commit();
    return { ok: true, marked: snap.size };
  }
  if (!id) {
    throw new HttpsError('invalid-argument', 'Falta el id de la notificación.');
  }
  const ref = col.doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Notificación no encontrada.');
  }
  await ref.set({ readAt: now }, { merge: true });
  return { ok: true, marked: 1 };
});

// ---------------------------------------------------------------------------
// qgcLogin — Quality Glazing Contractors company login.
// The QGC tier is NEVER sold via Play. An employee signs in with their own
// account (email verified), calls this callable, and the server stamps
// company claims.
//
// QGC = inside Puerto Rico (per Giulia 2026-09-26): callers whose geo
// resolves outside PR are rejected — Ultra is their path. Callers in PR
// are AUTO-ADDED to the qgc-roster on first login; the roster is the
// registry, geo is the gate.
//
// Roster: collection `qgc-roster`, doc id = lowercase email, e.g.
//   qgc-roster/maria@qualityglazingpr.com  { name: "María", addedAt: <ts> }
// Merges with existing claims (flowGate's org/geo claims survive).
// ---------------------------------------------------------------------------
exports.qgcLogin = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  const token = request.auth.token || {};
  const email = String(token.email || '').trim().toLowerCase();
  if (!email) {
    throw new HttpsError('failed-precondition', 'This account has no email address.');
  }
  const provider = token.firebase ? token.firebase.sign_in_provider : null;
  const verified = token.email_verified === true || provider === 'google.com';
  if (!verified) {
    throw new HttpsError('failed-precondition', 'Verify your email first.');
  }
  // Geo gate: QGC is the Puerto Rico path. Outside PR → Ultra, not QGC.
  const callerIp = request.rawRequest ? request.rawRequest.ip : null;
  const intel = await ipIntel(callerIp);
  if (!intel.ok) {
    throw new HttpsError('failed-precondition',
      "Couldn't verify you're in Puerto Rico right now — try again in a bit.");
  }
  if (intel.country !== 'PR') {
    throw new HttpsError('failed-precondition',
      'QGC is Puerto Rico only. Ultra is the path outside PR.');
  }
  // Auto-enroll: anyone in PR who enters via QGC login lands on the roster.
  const data = request.data || {};
  const ref = db.doc(`qgc-roster/${email}`);
  const rosterSnap = await ref.get();
  if (!rosterSnap.exists) {
    await ref.set({
      name: String(data.name || '').trim() || null,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
      autoAdded: true,
    });
  }
  const uid = request.auth.uid;
  const existing = (await admin.auth().getUser(uid)).customClaims || {};
  await admin.auth().setCustomUserClaims(uid, {
    ...existing,
    qgc: true,
    tier: 'QGC',
    company: 'Quality Glazing Contractors',
  });
  return { ok: true, tier: 'QGC', company: 'Quality Glazing Contractors', email };
});

// ---------------------------------------------------------------------------
// provisionBundleKey — server-side bundle decryption key broker.
//
// The Android APK ships the webapp ONLY as AES-256-GCM ciphertext and holds
// NO key material. At boot, the app's KeyBroker calls this callable; the
// server verifies App Check (Play Integrity) + Firebase Auth, looks up the
// per-version salt that push-salt.js published to nivelato_config/config,
// derives the bundle key from the master secret (Secret Manager — never in
// the repo, never in the APK), and returns it for this session only.
//
// Key derivation MUST match tools/gen-bundle.js exactly:
//   bundleKey = SHA-256(HMAC-SHA256(master, "nivelato-bundle-v<vc><salt>"))
//   davKey    = SHA-256(HMAC-SHA256(master, "nivelato-dav-v<vc><salt>"))
// (davKey keeps the legacy formula so existing encrypted WebDAV stores keep
// working after the master moves server-side.)
//
// Rate limit: 30 grants/uid/day (fail closed past the cap). Grants are
// counted, never logged with the key.
// ---------------------------------------------------------------------------
const BUNDLE_MASTER_SECRET = defineSecret('BUNDLE_MASTER_SECRET');
const KEY_GRANTS_PER_DAY = 30;

function deriveBundleKeys(master, versionCode, salt) {
  const h = (label) => {
    const mac = crypto.createHmac('sha256', master);
    mac.update(label);
    return crypto.createHash('sha256').update(mac.digest()).digest();
  };
  return {
    bundleKey: h(`nivelato-bundle-v${versionCode}${salt}`).toString('base64'),
    davKey: h(`nivelato-dav-v${versionCode}${salt}`).toString('base64'),
  };
}

exports.provisionBundleKey = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    enforceAppCheck: true, // Play Integrity token required — no token, no key
    secrets: [BUNDLE_MASTER_SECRET],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }
    const uid = request.auth.uid;
    const data = request.data || {};
    const versionCode = Number.isInteger(data.versionCode) ? data.versionCode : 0;
    const versionName = typeof data.versionName === 'string' ? data.versionName : '';
    if (!versionCode || !versionName || !/^[A-Za-z0-9._-]{1,32}$/.test(versionName)) {
      throw new HttpsError('invalid-argument', 'versionCode + versionName required.');
    }

    // The salt must be the one push-salt.js published at build time for this
    // versionName — the client can't just invent one.
    const cfgSnap = await db.doc('nivelato_config/config').get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    const salt = cfg[`v-key-${versionName}`];
    if (typeof salt !== 'string' || !salt) {
      throw new HttpsError('failed-precondition', 'Unknown app version.');
    }

    // Daily per-uid grant cap (transactional).
    const today = new Date().toISOString().slice(0, 10);
    const grantRef = db.doc(`keyGrants/${uid}`);
    const granted = await db.runTransaction(async (tx) => {
      const snap = await tx.get(grantRef);
      const d = snap.exists ? snap.data() : {};
      if (d.date === today && (d.count || 0) >= KEY_GRANTS_PER_DAY) return false;
      tx.set(grantRef, {
        date: today,
        count: d.date === today ? (d.count || 0) + 1 : 1,
        lastGrantAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return true;
    });
    if (!granted) {
      throw new HttpsError('resource-exhausted', 'Too many key requests today.');
    }

    const master = BUNDLE_MASTER_SECRET.value();
    if (!master) {
      throw new HttpsError('internal', 'Key service misconfigured.');
    }
    const keys = deriveBundleKeys(master, versionCode, salt);
    return { bundleKey: keys.bundleKey, davKey: keys.davKey, versionCode, versionName };
  }
);

// ---------------------------------------------------------------------------
// mintSsoToken — cross-origin SSO handoff for login.nivelatolabs.com.
//
// The web login page lives on login.nivelatolabs.com but the app lives on
// app.nivelatolabs.com, and Firebase Auth sessions are origin-scoped. After
// a successful sign-in on the login page, the client calls this with its
// session and gets back a short-lived custom token for the SAME uid, which
// it hands to app.nivelatolabs.com/sso.html; that page signs in there with
// signInWithCustomToken. Rate-limited: 100 mints per uid per day (page loads
// with a persisted session each burn one via the auto-handoff).
// 100, because 30 turned out to be "one monday afternoon of login loops".
// ---------------------------------------------------------------------------
exports.mintSsoToken = onCall(
  { region: 'us-central1', memory: '256MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }
    const uid = request.auth.uid;
    const today = new Date().toISOString().slice(0, 10);
    const grantRef = db.doc(`ssoGrants/${uid}`);
    const granted = await db.runTransaction(async (tx) => {
      const snap = await tx.get(grantRef);
      const d = snap.exists ? snap.data() : {};
      if (d.date === today && (d.count || 0) >= 100) return false;
      tx.set(grantRef, {
        date: today,
        count: d.date === today ? (d.count || 0) + 1 : 1,
        lastMintAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return true;
    });
    if (!granted) {
      throw new HttpsError('resource-exhausted', 'Too many sign-in handoffs today.');
    }
    const customToken = await admin.auth().createCustomToken(uid);
    return { customToken };
  }
);

// ---------------------------------------------------------------------------
// devPing — backend status for the dev options panel (login page).
// Restricted to the closed-testing allowlist (same gate as the panel).
// Returns server time + the deployed function inventory so the panel's
// Backend section always reflects what's actually deployed.
// NOTE: keep DEV_FUNCTION_INVENTORY in sync when adding/removing functions.
// Yes, this comment is load-bearing.
const DEV_FUNCTION_INVENTORY = [
  { name: 'mintSsoToken', type: 'callable', region: 'us-central1' },
  { name: 'flowGate', type: 'callable', region: 'us-central1' },
  { name: 'qgcLogin', type: 'callable', region: 'us-central1' },
  { name: 'requestWelcomeEmail', type: 'callable', region: 'us-central1' },
  { name: 'requestPasswordReset', type: 'callable', region: 'us-central1' },
  { name: 'reportQuoteEvent', type: 'callable', region: 'us-central1' },
  { name: 'setUiVersion', type: 'callable', region: 'us-central1' },
  { name: 'provisionBundleKey', type: 'callable', region: 'us-central1' },
  { name: 'applyCompanyUpdate', type: 'callable', region: 'us-central1' },
  { name: 'requestTravelVerification', type: 'callable', region: 'us-central1' },
  { name: 'redeemTravelVerification', type: 'callable', region: 'us-central1' },
  { name: 'createUpgradeLink', type: 'callable', region: 'us-central1' },
  { name: 'redeemUpgradeLink', type: 'callable', region: 'us-central1' },
  { name: 'devPing', type: 'callable', region: 'us-central1' },
  { name: 'processAccountDeletion', type: 'firestore-trigger', region: 'us-central1' },
  { name: 'homeRegionMonitor', type: 'scheduled', region: 'us-central1' },
  { name: 'pendingUpdateWatcher', type: 'scheduled', region: 'us-central1' },
];
exports.devPing = onCall(
  { region: 'us-central1', memory: '256MiB' },
  async (request) => {
    const email = (request.auth && request.auth.token && request.auth.token.email || '').toLowerCase();
    if (!request.auth || !email) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }
    const allow = await db.doc(`devAllowlist/${email}`).get();
    if (!allow.exists) {
      throw new HttpsError('permission-denied', 'Not enrolled in closed testing.');
    }
    return {
      ok: true,
      now: new Date().toISOString(),
      project: 'nivelato-app',
      functions: DEV_FUNCTION_INVENTORY,
    };
  }
);

// ---------------------------------------------------------------------------
// processAccountDeletion — executes APPROVED account-deletion requests (B2).
//
// End-to-end flow:
//   1. The user taps "Solicitar eliminación de cuenta" in settings.html
//      (Mi cuenta tab) → writes `deleteRequestedAt` on their own
//      users/{uid} doc. firestore.rules allow the user to touch ONLY that
//      field (no self-approved deletion, no self-escalation).
//   2. An org owner sees the request in the Taller tab ("Solicitudes de
//      eliminación") and approves → stamps `deleteApprovedAt`
//      (owner-only write per rules) — or rejects → clears deleteRequestedAt.
//   3. THIS trigger fires on the approval transition and wipes, via the
//      Admin SDK (which bypasses rules — this function IS the authority):
//        a. the user's jobs: orgs/{orgId}/jobs where installerUid == uid,
//           plus each job's annotated photo in Storage
//           (annotated/{orgId}/{jobId}.jpg);
//        b. the users/{uid} profile doc;
//        c. the Firebase Auth account (email/password identity gone);
//        d. their qgc-roster entry, if any (best effort).
//
// It acts ONLY on the null→set transition of deleteApprovedAt, so unrelated
// user-doc updates never double-fire, and an already-processed doc can never
// re-trigger (the doc is deleted in step b). Self-service instant deletion is
// intentionally NOT offered: deletion needs an owner's approval first.
// ---------------------------------------------------------------------------
exports.processAccountDeletion = onDocumentUpdated(
  { document: 'users/{userId}', region: 'us-central1' },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : {};
    const after = event.data.after.exists ? event.data.after.data() : {};
    const uid = event.params.userId;
    if (!after.deleteApprovedAt
        || before.deleteApprovedAt === after.deleteApprovedAt) {
      return null; // not an approval transition — ignore
    }
    const orgId = after.orgId || before.orgId;
    const result = { jobsDeleted: 0, photosDeleted: 0, rosterRemoved: false };

    // a. Jobs + annotated photos.
    if (orgId) {
      const jobsSnap = await db.collection('orgs').doc(orgId).collection('jobs')
        .where('installerUid', '==', uid).get();
      const bucket = admin.storage().bucket();
      let batch = db.batch();
      let pending = 0;
      for (const j of jobsSnap.docs) {
        batch.delete(j.ref);
        try {
          await bucket.file(`annotated/${orgId}/${j.id}.jpg`).delete();
          result.photosDeleted++;
        } catch (e) {
          // 404 = no photo was ever uploaded for this job; anything else is
          // worth a line in the logs but must not abort the wipe.
          if (e.code !== 404) {
            console.warn('[deletion] photo delete failed', j.id, e.message);
          }
        }
        result.jobsDeleted++;
        if (++pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
      }
      if (pending > 0) await batch.commit();
    }

    // b. Profile doc.
    await db.doc(`users/${uid}`).delete();

    // c. Firebase Auth account. Logged loudly on failure — the profile and
    //    jobs are already gone, so an operator can finish this by hand.
    try {
      await admin.auth().deleteUser(uid);
    } catch (e) {
      console.error('[deletion] AUTH DELETE FAILED for', uid, e.message);
    }

    // d. qgc-roster entry (best effort).
    const email = String(after.email || before.email || '').trim().toLowerCase();
    if (email) {
      try {
        await db.doc(`qgc-roster/${email}`).delete();
        result.rosterRemoved = true;
      } catch (e) {
        console.warn('[deletion] roster cleanup failed', email, e.message);
      }
    }

    console.log('[deletion] account wiped', uid, JSON.stringify(result));
    return result;
  }
);

// ---------------------------------------------------------------------------
// In-app company update engine — v0.9 -> v1.0 data migration.
//
// The app reads app_updates/latest (public read) to learn an update exists.
// The owner then EITHER taps "Aplicar actualización" (applyCompanyUpdate,
// migrates immediately) OR defers it — the app writes a `pendingUpdate` flag
// on the org doc and pendingUpdateWatcher runs the same migration later,
// but ONLY when nobody from that org is online (zero users with a fresh
// presence beacon).
//
// Both paths call runCompanyMigration(orgId, appliedBy). It is idempotent:
// if orgs/{orgId}.dataVersion is already '1.0' it returns { ok: true,
// already: true } and touches nothing. NEVER call it against a real org by
// hand; do not deploy it casually — the coordinator owns deploy.
// ---------------------------------------------------------------------------
const CURRENT_DATA_VERSION = '1.0';
const PREVIOUS_DATA_VERSION = '0.9';

const NOTIF_UPDATE_DEFAULTS = {
  welcomeEmail: true,
  newProject: true,
  projectEdit: true,
  quoteReady: true,
};

// Role -> permission map, derived from permissions.js ROLE_FALLBACK at the
// repo root. owner gets every PERM_DEFS key; unknown roles fall back to
// medidor (same policy as flowGate's known-role fallback).
const PERM_UPDATE_KEYS = [
  'viewDashboard', 'createMeasurements', 'viewOwnMeasurements',
  'editOwnMeasurements', 'viewOthersMeasurements', 'editOthersMeasurements',
  'managePriceList', 'createQuotes', 'approveQuotes', 'userManagement',
];
const ROLE_PERM_UPDATE_DEFAULTS = {
  supervisor: {
    viewDashboard: true, createMeasurements: true, viewOwnMeasurements: true,
    editOwnMeasurements: true, viewOthersMeasurements: true,
    editOthersMeasurements: true, managePriceList: true, createQuotes: true,
    approveQuotes: true, userManagement: false,
  },
  medidor: {
    viewDashboard: true, createMeasurements: true, viewOwnMeasurements: true,
    editOwnMeasurements: true, viewOthersMeasurements: true,
    editOthersMeasurements: false, managePriceList: false,
    createQuotes: false, approveQuotes: false, userManagement: false,
  },
  cotizador: {
    viewDashboard: true, createMeasurements: false, viewOwnMeasurements: true,
    editOwnMeasurements: false, viewOthersMeasurements: true,
    editOthersMeasurements: false, managePriceList: false, createQuotes: true,
    approveQuotes: false, userManagement: false,
  },
};
function roleDefaultPermissionsForUpdate(role) {
  if (role === 'owner') {
    const all = {};
    for (const k of PERM_UPDATE_KEYS) all[k] = true;
    return all;
  }
  const r = ROLE_PERM_UPDATE_DEFAULTS[role] ? role : 'medidor';
  return { ...ROLE_PERM_UPDATE_DEFAULTS[r] };
}

// Presence helper for the watcher: users whose presence/beacon.lastSeen is
// within 5 minutes count as online. Missing beacons = offline (never throws).
async function countOnlineUsers(orgId) {
  const usersSnap = await db.collection('users').where('orgId', '==', orgId).get();
  const cutoff = Date.now() - 5 * 60 * 1000;
  let online = 0;
  for (const u of usersSnap.docs) {
    try {
      const bSnap = await db.doc(`users/${u.id}/presence/beacon`).get();
      if (!bSnap.exists) continue;
      const ts = bSnap.data().lastSeen;
      const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
      if (ms >= cutoff) online++;
    } catch (e) {
      // Transient read error — treat as offline, never fail the scan.
    }
  }
  return online;
}

// The migration. appliedBy is a uid or the string 'scheduler'.
// Returns { ok: true, version: '1.0', steps, userCount } — steps are honest
// labels of the five actions below, in run order.
async function runCompanyMigration(orgId, appliedBy) {
  const orgRef = db.doc(`orgs/${orgId}`);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    throw new HttpsError('not-found', 'Organización no encontrada.');
  }
  if (orgSnap.data().dataVersion === CURRENT_DATA_VERSION) {
    return { ok: true, already: true };
  }
  const steps = [];

  // All org members; 'rejected' accounts are dead weight and don't count.
  const usersSnap = await db.collection('users').where('orgId', '==', orgId).get();
  const members = [];
  for (const u of usersSnap.docs) {
    if (u.data().disabled === 'rejected') continue;
    members.push(u);
  }
  const userCount = members.length;

  let batch = db.batch();
  let pending = 0;
  const flush = async () => {
    if (pending > 0) { await batch.commit(); batch = db.batch(); pending = 0; }
  };

  // 1. Version stamp + clear the deferred flag (if any).
  batch.set(orgRef, {
    dataVersion: CURRENT_DATA_VERSION,
    pendingUpdate: admin.firestore.FieldValue.delete(),
  }, { merge: true });
  pending++;
  steps.push('Version stamped');

  // 2. Recompute the member count (implicit '0.9' orgs never had a live one).
  batch.set(orgRef, { userCount }, { merge: true });
  pending++;
  steps.push('Users counted');

  // 3. Backfill role-default permissions for users missing the field.
  // 4. Ensure every member has a notification_prefs doc — create with
  //    defaults only when it doesn't exist; existing prefs are never
  //    overwritten.
  for (const u of members) {
    const d = u.data();
    if (!d.permissions) {
      batch.set(u.ref, {
        permissions: roleDefaultPermissionsForUpdate(d.role),
      }, { merge: true });
      pending++;
    }
    try {
      const pRef = db.doc(`notification_prefs/${u.id}`);
      const pSnap = await pRef.get();
      if (!pSnap.exists) {
        await pRef.set({
          ...NOTIF_UPDATE_DEFAULTS,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    } catch (e) {
      console.warn('[update] notification prefs ensure failed', u.id, e.message);
    }
    if (pending >= 400) await flush();
  }
  steps.push('Permissions backfilled');
  steps.push('Notification prefs ensured');
  await flush();

  // 5. Record the run in the org's update history.
  await orgRef.collection('updateHistory').doc(CURRENT_DATA_VERSION).set({
    version: CURRENT_DATA_VERSION,
    appliedAt: admin.firestore.FieldValue.serverTimestamp(),
    appliedBy,
    steps,
    userCount,
  });
  steps.push('History recorded');

  console.log('[update] migration applied', orgId, 'by', appliedBy,
    `(${userCount} users)`);
  return { ok: true, version: CURRENT_DATA_VERSION, steps, userCount };
}

// ---------------------------------------------------------------------------
// applyCompanyUpdate - callable. The owner applies the pending app update
// from inside the app. Owner-only with flowGate-style hardening: the
// caller's role must be 'owner' AND the org's ownerId must be the caller
// (a hand-crafted role:'owner' on someone else's org gets permission-denied,
// not a migration). Rate-limited to 5 runs per org per day.
// ---------------------------------------------------------------------------
exports.applyCompanyUpdate = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para aplicar la actualización.');
  }
  const uid = request.auth.uid;
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    throw new HttpsError('failed-precondition', 'No tienes perfil de usuario.');
  }
  const user = userSnap.data();
  if (user.role !== 'owner') {
    throw new HttpsError('permission-denied',
      'Solo el dueño del taller puede aplicar la actualización.');
  }
  const orgId = user.orgId;
  if (!orgId) throw new HttpsError('failed-precondition', 'No tienes taller asignado.');
  const orgSnap = await db.doc(`orgs/${orgId}`).get();
  if (!orgSnap.exists) {
    throw new HttpsError('failed-precondition', 'Taller no encontrado.');
  }
  // flowGate-style hardening: honor role 'owner' only when the org's
  // ownerId is this user.
  if (orgSnap.data().ownerId !== uid) {
    throw new HttpsError('permission-denied',
      'Tu rol no coincide con el dueño del taller.');
  }
  const today = new Date().toISOString().slice(0, 10);
  try {
    await checkRateLimit(`update:${orgId}:${today}`, 5);
  } catch (e) {
    if (e.code === 'resource-exhausted') {
      throw new HttpsError('resource-exhausted',
        'Ya aplicaste la actualización demasiadas veces hoy, intenta mañana.');
    }
    throw e;
  }
  const result = await runCompanyMigration(orgId, uid);
  if (result.already) return { ok: true, already: true };
  return result;
});

// ---------------------------------------------------------------------------
// pendingUpdateWatcher — scheduled deferred-update runner.
// Every 15 minutes: for each org carrying a `pendingUpdate` flag (deferred
// by the owner), count online members via presence beacons. Migrate only
// when ZERO members are online — nobody gets their data touched mid-shift.
// Logs one line per org processed.
// ---------------------------------------------------------------------------
exports.pendingUpdateWatcher = onSchedule(
  { region: 'us-central1', schedule: 'every 15 minutes', memory: '256MiB' },
  async () => {
    const orgsSnap = await db.collection('orgs').get();
    let processed = 0;
    let migrated = 0;
    for (const orgDoc of orgsSnap.docs) {
      const data = orgDoc.data();
      if (!('pendingUpdate' in data) || data.pendingUpdate == null) continue;
      processed++;
      if (data.dataVersion === CURRENT_DATA_VERSION) {
        // Stale flag: migration already landed some other way. Clear it.
        await orgDoc.ref.update({
          pendingUpdate: admin.firestore.FieldValue.delete(),
        });
        console.log('[update] org', orgDoc.id, ': pendingUpdate cleared, already at',
          CURRENT_DATA_VERSION);
        continue;
      }
      const online = await countOnlineUsers(orgDoc.id);
      if (online > 0) {
        console.log('[update] org', orgDoc.id, ': deferring migration,',
          online, 'user(s) online');
        continue;
      }
      const res = await runCompanyMigration(orgDoc.id, 'scheduler');
      // runCompanyMigration deletes pendingUpdate as part of step 1.
      migrated++;
      console.log('[update] org', orgDoc.id, ': migrated to', CURRENT_DATA_VERSION,
        'by scheduler,', res.userCount, 'users');
    }
    return { processed, migrated };
  }
);


// ---------------------------------------------------------------------------
// Travel verification - QGC employees outside PR.
//
// A QGC-trusted device outside Puerto Rico can request a 30-day travel grant
// via an email verification link. Two callables:
//
//   requestTravelVerification({ email })
//     - Auth required. The email must belong to the caller and the caller's
//       users/{uid} doc must have isQGC: true.
//     - Generates a single-use token (1h expiry), stores it in
//       travel_tokens/{token}, and emails a magic link:
//         https://login.nivelatolabs.com/?travel_verify=<token>
//     - Rate-limited: 3 requests per user per day.
//
//   redeemTravelVerification({ token })
//     - Public (the token IS the credential - it's a magic link).
//     - Validates and burns the token in a transaction, then returns
//       { validUntil } where validUntil = Date.now() + 30 days (epoch ms).
//     - Records the grant on users/{uid}.travelGrant for server-side audit.
// ---------------------------------------------------------------------------
const TRAVEL_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const TRAVEL_GRANT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// # autism has occured in this function
exports.requestTravelVerification = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Inicia sesión primero.');
  }
  const uid = request.auth.uid;
  const email = cleanEmail(request.data && request.data.email);

  // The email must belong to the caller.
  const callerEmail = (request.auth.token && request.auth.token.email || '').toLowerCase();
  if (callerEmail !== email) {
    throw new HttpsError('permission-denied', 'El correo no coincide con tu sesión.');
  }

  // Must be a QGC user.
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists || userSnap.data().isQGC !== true) {
    throw new HttpsError('permission-denied', 'Solo empleados de QGC pueden solicitar acceso de viaje.');
  }

  const today = new Date().toISOString().slice(0, 10);
  await checkRateLimit(`travel:${uid}:${today}`, 3);

  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  await db.doc(`travel_tokens/${token}`).set({
    uid,
    email,
    createdAt: now,
    expiresAt: now + TRAVEL_TOKEN_TTL_MS,
    used: false,
  });

  const link = `https://login.nivelatolabs.com/?travel_verify=${token}`;
  const html = emailShell('Acceso de viaje - Nivelato', `
    <p>Hola,</p>
    <p>Solicitaste un enlace de acceso para usar Nivelato fuera de Puerto Rico por hasta 30 días.</p>
    <p style="text-align:center;margin:24px 0;"><a href="${esc(link)}" style="display:inline-block;background:#1971C2;color:#fff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:999px;">Activar acceso de viaje</a></p>
    <p>Este enlace es de un solo uso y vence en 1 hora. Si no lo solicitaste, ignora este correo.</p>`);
  await sendEmail({
    to: email,
    subject: 'Tu enlace de acceso de viaje - Nivelato',
    html,
    text: `Solicitaste acceso de viaje para Nivelato (30 días fuera de PR). Actívalo aquí (1 solo uso, vence en 1 hora): ${link}`,
  });
  return { ok: true };
});

exports.redeemTravelVerification = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  const token = String((request.data && request.data.token) || '').trim();
  if (!/^[0-9a-f]{64}$/.test(token)) {
    throw new HttpsError('invalid-argument', 'invalid-travel-token');
  }
  const ref = db.doc(`travel_tokens/${token}`);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false };
    const d = snap.data();
    if (d.used === true) return { ok: false };
    if (Date.now() > (d.expiresAt || 0)) return { ok: false };
    tx.update(ref, { used: true, usedAt: Date.now() });
    return { ok: true, uid: d.uid, email: d.email };
  });
  if (!result.ok) {
    throw new HttpsError('invalid-argument', 'invalid-travel-token');
  }
  const validUntil = Date.now() + TRAVEL_GRANT_MS;
  await db.doc(`users/${result.uid}`).set({
    travelGrant: {
      validUntil,
      grantedAt: Date.now(),
      tokenId: token.slice(0, 12),
    },
  }, { merge: true });
  return { validUntil };
});

// ---------------------------------------------------------------------------
// Company invites (Add User flow) — orgs/{orgId}/invites/{email}.
//
// Membership still works exactly like it always has: the org has a
// joinCode, the joiner signs up and creates their user doc pinned to
// role 'medidor' + disabled (firestore.rules), and the owner approves.
// An invite is a pre-approval the owner writes ahead of time (client
// write, owner-only + shape-pinned in firestore.rules) binding an email
// to a role + permission overrides. It is applied when the invitee joins:
//
//   - flowGate (above) calls applyPendingInvite for pending joiners, so
//     the first sign-in after signup activates the account with the
//     invite's role/permissions already on it.
//   - The manual approval path (company/settings approveRequest) checks
//     for an invite too, as a fallback.
//
// sendCompanyInviteEmail is the only piece that had to be a callable:
// the Resend key is server-side. It verifies the caller owns the org and
// that a pending invite exists for the address before sending, and
// rides the same rate limiter as the other email callables.
// ---------------------------------------------------------------------------
const INVITE_ROLES = ['medidor', 'supervisor', 'cotizador']; // never 'owner'
const INVITE_PERM_KEYS = [
  'viewDashboard', 'createMeasurements', 'viewOwnMeasurements',
  'editOwnMeasurements', 'viewOthersMeasurements', 'editOthersMeasurements',
  'managePriceList', 'createQuotes', 'approveQuotes', 'userManagement',
];
const INVITE_ROLE_LABELS = {
  medidor: 'Técnico medidor',
  supervisor: 'Supervisor',
  cotizador: 'Cotizador',
};

// Applies a pending invite to a freshly-joined (disabled) user doc.
// Returns the updated user object on success, null when there is no
// applicable invite or anything fails (caller keeps the pending block).
async function applyPendingInvite(uid, user, token) {
  try {
    const email = String((token && token.email) || user.email || '')
      .trim().toLowerCase();
    const orgId = user.orgId;
    if (!email || !orgId) return null;
    const invRef = db.doc(`orgs/${orgId}/invites/${email}`);
    const invSnap = await invRef.get();
    if (!invSnap.exists) return null;
    const inv = invSnap.data();
    if (inv.status !== 'pending') return null;

    const patch = { disabled: false };
    // Belt and braces: an invite can never grant 'owner', whatever a
    // hand-edited doc claims (rules already pin the role set).
    if (INVITE_ROLES.includes(inv.role)) patch.role = inv.role;
    if (inv.permissions && typeof inv.permissions === 'object') {
      const clean = {};
      for (const k of INVITE_PERM_KEYS) {
        if (typeof inv.permissions[k] === 'boolean') clean[k] = inv.permissions[k];
      }
      if (Object.keys(clean).length) patch.permissions = clean;
    }
    await db.doc(`users/${uid}`).update(patch);
    await invRef.update({
      status: 'accepted',
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      acceptedUid: uid,
    });
    console.log('[invite] applied for', email, 'org', orgId);
    return { ...user, ...patch };
  } catch (e) {
    console.error('[invite] apply failed:', e && e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// sendCompanyInviteEmail - callable. Sends the invite email (org name,
// role, join code, signup link) for an invite the owner already created
// from the Add User flow. Does NOT create the invite itself.
// ---------------------------------------------------------------------------
exports.sendCompanyInviteEmail = onCall({ region: 'us-central1', memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  const uid = request.auth.uid;
  const data = request.data || {};
  const orgId = String(data.orgId || '');
  const email = cleanEmail(data.email);
  if (!orgId) throw new HttpsError('invalid-argument', 'Falta la empresa.');

  const callerSnap = await db.doc(`users/${uid}`).get();
  if (!callerSnap.exists) {
    throw new HttpsError('failed-precondition', 'No user profile yet.');
  }
  const caller = callerSnap.data();
  if (caller.disabled || caller.role !== 'owner' || caller.orgId !== orgId) {
    throw new HttpsError('permission-denied', 'Only the company owner can send invites.');
  }

  const invSnap = await db.doc(`orgs/${orgId}/invites/${email}`).get();
  if (!invSnap.exists || invSnap.data().status !== 'pending') {
    throw new HttpsError('failed-precondition', 'There is no pending invite for that email.');
  }
  const invite = invSnap.data();

  const orgSnap = await db.doc(`orgs/${orgId}`).get();
  const org = orgSnap.exists ? orgSnap.data() : {};
  const orgName = String(org.name || 'tu taller');
  const joinCode = String(org.joinCode || orgId);
  const roleLabel = INVITE_ROLE_LABELS[invite.role] || 'Técnico medidor';

  const today = new Date().toISOString().slice(0, 10);
  await checkRateLimit(`invite:${orgId}:${email}:${today}`, 5);

  const html = emailShell(`Invitación a ${esc(orgName)}`, `
    <p>Hola,</p>
    <p>Te invitaron a unirte a <b>${esc(orgName)}</b> en Nivelato con el rol de <b>${esc(roleLabel)}</b>.</p>
    <p>Crea tu cuenta con este mismo correo e ingresa el código del taller cuando te lo pida:</p>
    <p style="font-size:22px;font-weight:700;letter-spacing:0.12em;color:#1971C2;">${esc(joinCode)}</p>
    <p><a href="https://login.nivelatolabs.com/" style="color:#1971C2;">Crear mi cuenta en Nivelato</a></p>
    <p>Tu acceso se activa automáticamente al registrarte con este correo, sin esperar aprobación.</p>`);
  await sendEmail({
    to: email,
    subject: `Invitación a ${orgName} en Nivelato`,
    html,
    text: `Te invitaron a unirte a ${orgName} en Nivelato con el rol de ${roleLabel}. Crea tu cuenta con este correo en https://login.nivelatolabs.com/ e ingresa el código del taller: ${joinCode}. Tu acceso se activa automáticamente al registrarte.`,
  });
  return { ok: true };
});
