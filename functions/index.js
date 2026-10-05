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
// IP intelligence provider (pluggable).
// Default: ipinfo.io — free tier 50k lookups/mo, returns privacy flags
// (vpn/proxy/tor/relay/hosting) in one call. Set IPINFO_TOKEN env var
// (use `firebase functions:config` / .env). Phase 2 wires the paid tier.
// If no provider is configured, lookups fail CLOSED to `review` — never
// `allow`, never `block` (we can't prove anything without intel).
// ---------------------------------------------------------------------------
const IPINFO_TOKEN = process.env.IPINFO_TOKEN || '';

async function ipIntel(ip) {
  // Loopback / emulator callers have no meaningful geo.
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') ||
      ip.startsWith('192.168.') || ip.startsWith('172.16.')) {
    return { ok: false, reason: 'private-ip' };
  }
  if (!IPINFO_TOKEN) return { ok: false, reason: 'no-provider-configured' };
  try {
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}?token=${IPINFO_TOKEN}`);
    if (!res.ok) return { ok: false, reason: `provider-http-${res.status}` };
    const j = await res.json();
    const p = j.privacy || {};
    return {
      ok: true,
      country: j.country || null,          // 'PR', 'US', ...
      region: j.region || null,
      untrusted: Boolean(p.vpn || p.proxy || p.tor || p.relay || p.hosting),
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
  const user = userSnap.data();
  if (user.disabled) {
    // Pending/rejected users get no claims and no geo verdict beyond this.
    return { verdict: 'block', reason: 'account-disabled', flow: null, geoOk: false, licenseStatus: null };
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
  const tzMismatch = clientTimezone && intel.ok && inPR && clientTimezone !== 'America/Puerto_Rico';

  // 4. Verdict.
  let verdict = 'review';
  let reason = 'default-review';
  let geoOk = false;

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
      if (tzMismatch) { verdict = 'review'; reason = 'tz-mismatch'; }
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

  // 6. Review verdicts land in Giulia's triage queue.
  if (verdict === 'review') {
    await db.collection('geoReviews').add({
      uid, orgId, reason,
      signals: {
        country, untrustedIp, flags: intel.flags || null,
        clientTimezone, tzMismatch: Boolean(tzMismatch), callerIpTruncated: callerIp ? 'present' : 'absent',
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'open',
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

  return { verdict, flow, geoOk, licenseStatus, reason };
});

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
