#!/usr/bin/env node
// tools/backfill-qgi.js — Phase 0 grandfathering (nivelato-geo-flows-spec §7).
//
// Marks the 4 real QGI users + org orgs/NJBBG5 as QGI flow, and creates
// nivelato_config/version. DRY-RUN BY DEFAULT — prints the planned writes
// and exits. Pass --apply to actually write.
//
//   node tools/backfill-qgi.js                 # dry run (default)
//   node tools/backfill-qgi.js --apply         # REAL writes
//
// Auth: set GOOGLE_APPLICATION_CREDENTIALS to a service-account key with
// Firestore admin on the nivelato-app project, or pass --service-account=path.
// NEVER run against prod without Giulia's explicit approval.

const admin = require('firebase-admin');

const QGI_ORG_ID = 'NJBBG5';
const QGI_USERS = [
  'oficinas@qgipr.com',
  'quotes@qgipr.com',   // Yenny Gonzalez
  'dlebron@qgipr.com',  // Daniel Lebrón (owner)
  'john@nivelatoqgipr.com',
];

function usage() {
  console.log('Usage: node tools/backfill-qgi.js [--apply] [--service-account=path]');
  console.log('  Default is --dry-run. --apply performs real Firestore writes.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0); }
  const apply = args.includes('--apply');
  const saArg = args.find((a) => a.startsWith('--service-account='));
  const saPath = saArg ? saArg.split('=')[1] : process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!saPath) {
    console.error('ERROR: no service account. Set GOOGLE_APPLICATION_CREDENTIALS or --service-account=path.');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  const db = admin.firestore();
  const ts = admin.firestore.FieldValue.serverTimestamp();

  const plan = [];

  // 1. QGI org
  const orgRef = db.doc(`orgs/${QGI_ORG_ID}`);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    console.error(`ERROR: org ${QGI_ORG_ID} does not exist — refusing to create it.`);
    process.exit(1);
  }
  plan.push({
    ref: `orgs/${QGI_ORG_ID}`,
    write: { flow: 'qgi', versionPolicy: 'qgi', licenseStatus: 'active', homeRegion: 'PR' },
    current: { flow: orgSnap.data().flow, versionPolicy: orgSnap.data().versionPolicy,
               licenseStatus: orgSnap.data().licenseStatus, homeRegion: orgSnap.data().homeRegion },
  });

  // 2. QGI users (looked up by email — never by uid guess)
  for (const email of QGI_USERS) {
    const q = await db.collection('users').where('email', '==', email).limit(1).get();
    if (q.empty) {
      plan.push({ ref: `users/<${email}>`, error: 'NOT FOUND — skipped' });
      continue;
    }
    const doc = q.docs[0];
    plan.push({
      ref: `users/${doc.id} (${email})`,
      write: { geoStatus: 'verified', lastSeenRegion: 'PR', lastGeoCheck: '<serverTimestamp>' },
      current: { geoStatus: doc.data().geoStatus, lastSeenRegion: doc.data().lastSeenRegion },
    });
  }

  // 3. Version config doc
  const verRef = db.doc('nivelato_config/version');
  const verSnap = await verRef.get();
  plan.push({
    ref: 'nivelato_config/version',
    write: verSnap.exists ? '<exists — skipped>' : {
      mainlineLatest: '1.0.0', mainlineLatestCode: 1,
      securityChannels: { qgi: 1 }, note: 'created by backfill-qgi.js',
    },
    current: verSnap.exists ? '<exists>' : '<absent>',
  });

  // Report
  console.log(`\n=== QGI backfill plan (${apply ? 'APPLY MODE' : 'DRY RUN'}) ===`);
  for (const p of plan) {
    console.log(`\n• ${p.ref}`);
    if (p.error) { console.log(`  !! ${p.error}`); continue; }
    console.log(`  current: ${JSON.stringify(p.current)}`);
    console.log(`  write:   ${JSON.stringify(p.write)}`);
  }

  if (!apply) {
    console.log('\nDry run — no writes performed. Re-run with --apply to execute.');
    process.exit(0);
  }

  console.log('\nApplying writes...');
  await orgRef.set(plan[0].write, { merge: true });
  for (const email of QGI_USERS) {
    const q = await db.collection('users').where('email', '==', email).limit(1).get();
    if (q.empty) continue;
    await q.docs[0].ref.set(
      { geoStatus: 'verified', lastSeenRegion: 'PR', lastGeoCheck: ts }, { merge: true });
  }
  if (!verSnap.exists) {
    await verRef.set({
      mainlineLatest: '1.0.0', mainlineLatestCode: 1,
      securityChannels: { qgi: 1 }, note: 'created by backfill-qgi.js',
    });
  }
  console.log('Done.');
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
