#!/usr/bin/env node
// tools/fix-personal-profile.js: one-off data fix for a personal
// account that has a Firebase Auth user but no users/{uid} profile doc
// (the state the Google "Añadir cuenta personal" sign-in leaves behind:
// valid session, dashboard dead-ends on "No se encontró tu perfil").
//
// It performs EXACTLY the writes the ensurePersonalProfile callable
// performs (functions/index.js): create the personal org (org of one,
// external flow) and the users/{uid} profile pointing at it, with the
// server-side membership recorded. If the profile already exists, it
// only fills a missing orgId/personalOrgId the same way the callable's
// repair branch does; a profile that already has an org is reported
// and left untouched.
//
// DRY-RUN BY DEFAULT: prints the planned writes and exits. Pass
// --apply to actually write. Once the functions deploy that carries
// ensurePersonalProfile ships, this script is unnecessary: the
// dashboard bootstrap creates the profile on the user's next sign-in.
// Keep it for pre-deploy repair or for accounts that cannot sign in.
//
//   node tools/fix-personal-profile.js --email=legobele@gmail.com
//   node tools/fix-personal-profile.js --email=legobele@gmail.com --apply
//
// Auth: set GOOGLE_APPLICATION_CREDENTIALS to a service-account key
// with Firestore + Auth admin on the nivelato-app project, or pass
// --service-account=path. NEVER run with --apply without Giulia's
// explicit approval.

const admin = require('firebase-admin');

function usage() {
  console.log('Usage: node tools/fix-personal-profile.js --email=<email> [--apply] [--service-account=path]');
  console.log('  Default is --dry-run. --apply performs real Firestore writes.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0); }
  const apply = args.includes('--apply');
  const emailArg = args.find((a) => a.startsWith('--email='));
  const email = emailArg ? emailArg.split('=').slice(1).join('=').trim().toLowerCase() : '';
  if (!email) {
    console.error('ERROR: --email=<email> is required (the Auth account to repair).');
    usage();
    process.exit(1);
  }
  const saArg = args.find((a) => a.startsWith('--service-account='));
  const saPath = saArg ? saArg.split('=')[1] : process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!saPath) {
    console.error('ERROR: no service account. Set GOOGLE_APPLICATION_CREDENTIALS or --service-account=path.');
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
  const db = admin.firestore();
  const ts = admin.firestore.FieldValue.serverTimestamp;
  const plan = [];

  // The uid comes from the Auth record at apply time (never guessed):
  // the email identifies the account, Auth returns its uid.
  const authUser = await admin.auth().getUserByEmail(email);
  const uid = authUser.uid;
  const tokenName = authUser.displayName || email.split('@')[0] || 'Personal';
  console.log(`Auth account: ${email} -> uid ${uid}`);

  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();

  if (userSnap.exists) {
    const user = userSnap.data();
    if (user.orgId) {
      console.log(`users/${uid} already has orgId ${user.orgId}. Nothing to do.`);
      return;
    }
    // Repair branch: profile without a context (mirrors the callable).
    let orgId = user.personalOrgId || null;
    if (orgId) {
      const orgSnap = await db.doc(`orgs/${orgId}`).get();
      if (!orgSnap.exists) orgId = null;
    }
    if (!orgId) {
      const orgRef = db.collection('orgs').doc();
      orgId = orgRef.id;
      plan.push({
        ref: `orgs/${orgId}`,
        write: {
          name: String(user.name || user.displayName || tokenName).slice(0, 80),
          ownerId: uid, joinCode: orgId, flow: 'external',
          versionPolicy: 'external-hybrid', licenseStatus: 'active',
          trialSavesUsed: 0, isPersonal: true, personalOwnerUid: uid,
          createdAt: '<serverTimestamp>',
        },
        _apply: async () => orgRef.set({
          name: String(user.name || user.displayName || tokenName).slice(0, 80),
          ownerId: uid, joinCode: orgId, flow: 'external',
          versionPolicy: 'external-hybrid', licenseStatus: 'active',
          trialSavesUsed: 0, isPersonal: true, personalOwnerUid: uid,
          createdAt: ts(),
        }),
      });
    }
    const patch = { orgId, personalOrgId: orgId };
    if (!user.role) patch.role = 'owner';
    if (user.disabled === undefined) patch.disabled = false;
    plan.push({
      ref: `users/${uid}`,
      write: { ...patch, memberships: { [orgId]: { role: patch.role || user.role || 'owner', joinedAt: '<serverTimestamp>' } } },
      _apply: async () => {
        await userRef.update(patch);
        await userRef.set(
          { memberships: { [orgId]: { role: patch.role || user.role || 'owner', joinedAt: ts() } } },
          { merge: true });
      },
    });
  } else {
    // Create branch: personal org + profile, the callable's payload.
    const name = String(tokenName).slice(0, 80);
    const orgRef = db.collection('orgs').doc();
    const orgId = orgRef.id;
    plan.push({
      ref: `orgs/${orgId}`,
      write: {
        name, ownerId: uid, joinCode: orgId, flow: 'external',
        versionPolicy: 'external-hybrid', licenseStatus: 'active',
        trialSavesUsed: 0, isPersonal: true, personalOwnerUid: uid,
        createdAt: '<serverTimestamp>',
      },
      _apply: async () => orgRef.set({
        name, ownerId: uid, joinCode: orgId, flow: 'external',
        versionPolicy: 'external-hybrid', licenseStatus: 'active',
        trialSavesUsed: 0, isPersonal: true, personalOwnerUid: uid,
        createdAt: ts(),
      }),
    });
    plan.push({
      ref: `users/${uid}`,
      write: {
        email, name, displayName: name, role: 'owner',
        orgId, personalOrgId: orgId, disabled: false, tier: 'free',
        geoStatus: 'pending',
        memberships: { [orgId]: { role: 'owner', joinedAt: '<serverTimestamp>' } },
        createdAt: '<serverTimestamp>',
      },
      _apply: async () => userRef.set({
        email, name, displayName: name, role: 'owner',
        orgId, personalOrgId: orgId, disabled: false, tier: 'free',
        geoStatus: 'pending',
        memberships: { [orgId]: { role: 'owner', joinedAt: ts() } },
        createdAt: ts(),
      }),
    });
  }

  console.log(apply ? '\nAPPLYING writes:' : '\nPLANNED writes (dry run, nothing written):');
  for (const step of plan) {
    console.log(`\n  ${step.ref}`);
    console.log('  ' + JSON.stringify(step.write, null, 2).replace(/\n/g, '\n  '));
  }
  if (!apply) {
    console.log('\nDry run only. Re-run with --apply (and Giulia\'s go) to write.');
    return;
  }
  for (const step of plan) await step._apply();
  console.log('\nDone. The account now has a personal profile; the next dashboard load should pass flowGate and land normally.');
}

main().catch((e) => { console.error('ERROR:', e && e.message ? e.message : e); process.exit(1); });
