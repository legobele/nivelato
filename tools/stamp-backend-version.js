#!/usr/bin/env node
// tools/stamp-backend-version.js: stamps the backend version registry
// (design: SUPPORT_SURFACES.md section 3).
//
// The registry lives in config/ui_versions (extended from the existing
// UI-version machinery) with a public projection in app_updates/backend
// and app_updates/android (app_updates is public-read today, so clients
// and the debug/testing surfaces can read the stamp with no rules
// change). Every deploy ends with a stamp: a commit must not ship
// unstamped.
//
// Usage (run on the laptop that has the firebase CLI logged in):
//   node tools/stamp-backend-version.js --platform web [--commit <sha>]
//        [--friendly 1.1.0] [--channel stable|beta] [--by deploy]
//   node tools/stamp-backend-version.js --platform android
//        --version-code 79 [--friendly 1.2.0] [--channel beta]
//   node tools/stamp-backend-version.js --backfill
//        (writes the retroactive history from SUPPORT_SURFACES.md 3.5)
//
// Auth: reads %USERPROFILE%\.config\configstore\firebase-tools.json and
// uses tokens.access_token (the firebase CLI's stored token).
// No firebase-admin dependency; Firestore REST only.
//
// Writes for a web stamp:
//   config/ui_versions            (merge: backendCommit,
//                                  backendFriendlyVersion,
//                                  backendStampedAt, backendStampedBy)
//   config/ui_versions/releases/web-<sha12>   (ledger, idempotent)
//   app_updates/backend           (public projection)
// Writes for an android stamp:
//   config/ui_versions/releases/android-<versionCode>   (ledger)
//   app_updates/android           (public projection)
// The --backfill mode writes ONLY ledger docs and projections for the
// historical entries, plus the global pointer at the newest web entry.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ID = 'nivelato-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}`
  + '/databases/(default)/documents';

function loadAccessToken() {
  const profile = process.env.USERPROFILE || process.env.HOME || '';
  const cfgPath = path.join(profile, '.config', 'configstore', 'firebase-tools.json');
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch (e) {
    console.error(`ERROR: can't read firebase CLI token file: ${cfgPath}`);
    console.error('Log in first with `firebase login`.');
    process.exit(1);
  }
  const token = cfg && cfg.tokens && cfg.tokens.access_token;
  if (!token) {
    console.error(`ERROR: no tokens.access_token in ${cfgPath}. Run \`firebase login\` first.`);
    process.exit(1);
  }
  return token;
}

// --- Firestore REST value format ----------------------------------------
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toValue(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toValue(v);
  return fields;
}

async function rest(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${method} ${url}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

// Upsert a doc at an arbitrary path ('app_updates/backend',
// 'config/ui_versions/releases/web-abc'). POST create; on 409 PATCH
// with an updateMask over exactly the provided fields (never a bare
// PATCH: without a mask Firestore replaces the whole document).
async function upsertPath(token, docPath, data) {
  const slash = docPath.lastIndexOf('/');
  const parent = docPath.slice(0, slash);
  const docId = docPath.slice(slash + 1);
  const body = { fields: toFields(data) };
  const mask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  try {
    await rest('POST', `${BASE}/${parent}?documentId=${encodeURIComponent(docId)}`, token, body);
    console.log(`created  ${docPath}`);
  } catch (e) {
    if (!String(e.message).startsWith('HTTP 409')) throw e;
    await rest('PATCH', `${BASE}/${docPath}?${mask}`, token, body);
    console.log(`updated  ${docPath}`);
  }
}

// Merge fields into a doc that must already exist (the global
// config/ui_versions doc). PATCH with updateMask only: other fields
// (latestSemver, changelog) are never touched.
async function mergePath(token, docPath, data) {
  const body = { fields: toFields(data) };
  const mask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  await rest('PATCH', `${BASE}/${docPath}?${mask}`, token, body);
  console.log(`merged   ${docPath} (${Object.keys(data).join(', ')})`);
}

// --- stamps ------------------------------------------------------------

async function stampWeb(token, { commit, friendly, channel, by, backfilled, stampedAt, notes }) {
  const at = stampedAt || new Date();
  await mergePath(token, 'config/ui_versions', {
    backendCommit: commit,
    backendFriendlyVersion: friendly,
    backendStampedAt: at,
    backendStampedBy: by,
  });
  await upsertPath(token, `config/ui_versions/releases/web-${commit.slice(0, 12)}`, {
    platform: 'web', commit, friendlyVersion: friendly, channel,
    stampedAt: at, stampedBy: by, backfilled: !!backfilled,
    ...(notes ? { notes } : {}),
  });
  await upsertPath(token, 'app_updates/backend', {
    platform: 'web', commit, friendlyVersion: friendly, channel,
    stampedAt: at, stampedBy: by, backfilled: !!backfilled,
  });
}

async function stampAndroid(token, { versionCode, friendly, channel, by, backfilled, stampedAt, notes }) {
  const at = stampedAt || new Date();
  await upsertPath(token, `config/ui_versions/releases/android-${versionCode}`, {
    platform: 'android', versionCode, friendlyVersion: friendly, channel,
    stampedAt: at, stampedBy: by, backfilled: !!backfilled,
    ...(notes ? { notes } : {}),
  });
  await upsertPath(token, 'app_updates/android', {
    platform: 'android', versionCode, friendlyVersion: friendly, channel,
    stampedAt: at, stampedBy: by, backfilled: !!backfilled,
  });
}

// Retroactive history (SUPPORT_SURFACES.md 3.5). Web entries use their
// exact commit dates. Android entries: ship dates as recorded in the
// project history; stampedAt is the backfill time for android 75 (its
// exact ship date was never recorded) and the entry notes say so.
async function backfill(token) {
  const web = [
    { commit: '43c9783861b4003e51be414324653f306f6f041b', friendly: null,
      at: new Date('2026-10-09T16:40:36-04:00'),
      notes: 'Pre-registry main HEAD (2026-10-09). Friendly version was never recorded; not invented.' },
    { commit: 'd59871ce5b141e28657a57bcb6261d62d9489e8f', friendly: '1.1.0',
      at: new Date('2026-10-12T13:01:04Z'),
      notes: 'Web deploy 2026-10-12: dashboard redesign, QR upgrade flow, free tier, invites, notifications, geo heal.' },
    { commit: 'a20ef465334f1e783df5fd2bfe255c2b92e72cca', friendly: '1.1.0',
      at: new Date('2026-10-12T13:04:15Z'),
      notes: 'Join code card de-inlined; SW cache v13.' },
    { commit: '08961d82715943beb4fd94d4385a99a4a9dfb185', friendly: '1.1.0',
      at: new Date('2026-10-12T13:13:47Z'),
      notes: 'Floating shell spacing token; SW cache v14.' },
  ];
  // Oldest first so the global pointer ends at the newest entry.
  for (const w of web) {
    if (w.friendly === null) {
      // Ledger only: the global pointer must never claim a friendly
      // version we do not know. The pointer is set by the next entry.
      await upsertPath(token, `config/ui_versions/releases/web-${w.commit.slice(0, 12)}`, {
        platform: 'web', commit: w.commit, friendlyVersion: null,
        channel: 'stable', stampedAt: w.at, stampedBy: 'backfill',
        backfilled: true, notes: w.notes,
      });
    } else {
      await stampWeb(token, {
        commit: w.commit, friendly: w.friendly, channel: 'stable',
        by: 'backfill', backfilled: true, stampedAt: w.at, notes: w.notes,
      });
    }
  }
  const android = [
    { versionCode: 75, friendly: '1.1.0', notes: 'Closed-testing era build (reused for closed test). Exact ship date not recorded.' },
    { versionCode: 76, friendly: '1.1.0', notes: 'Live on internal testing 2026-10-06 (cert pin fix).', at: new Date('2026-10-06T12:00:00-04:00') },
    { versionCode: 77, friendly: '1.1.0', notes: 'Published to internal testing 2026-10-12.', at: new Date('2026-10-12T10:47:00-04:00') },
    { versionCode: 78, friendly: '1.1.0', notes: 'Published to internal testing 2026-10-12 (salts re-keyed by versionCode; PR restricted boot mode).', at: new Date('2026-10-12T13:22:00-04:00') },
  ];
  for (const a of android) {
    await stampAndroid(token, {
      versionCode: a.versionCode, friendly: a.friendly, channel: 'stable',
      by: 'backfill', backfilled: true, stampedAt: a.at, notes: a.notes,
    });
  }
  console.log('Backfill done.');
}

// --- main ---------------------------------------------------------------

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  const token = loadAccessToken();
  if (process.argv.includes('--backfill')) {
    await backfill(token);
    console.log('Done.');
    return;
  }
  const platform = arg('platform') || 'web';
  const channel = arg('channel') || 'stable';
  const by = arg('by') || 'deploy';
  let friendly = arg('friendly');
  if (!friendly) {
    try {
      friendly = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();
    } catch (_) { /* caller must pass --friendly */ }
  }
  if (!friendly) {
    console.error('ERROR: no friendly version (pass --friendly or add a VERSION file).');
    process.exit(1);
  }
  if (platform === 'web') {
    let commit = arg('commit');
    if (!commit) {
      commit = execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..') })
        .toString().trim();
    }
    await stampWeb(token, { commit, friendly, channel, by, backfilled: false });
  } else if (platform === 'android') {
    const versionCode = Number(arg('version-code'));
    if (!Number.isInteger(versionCode) || versionCode <= 0) {
      console.error('ERROR: --version-code <n> is required for android stamps.');
      process.exit(1);
    }
    await stampAndroid(token, { versionCode, friendly, channel, by, backfilled: false });
  } else {
    console.error(`ERROR: unknown platform ${platform}`);
    process.exit(1);
  }
  console.log('Done.');
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
