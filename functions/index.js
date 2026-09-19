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
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

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
    role: user.role || 'medidor',
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
