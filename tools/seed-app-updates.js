#!/usr/bin/env node
// tools/seed-app-updates.js — seeds the app_updates collection for the
// in-app update engine (functions: applyCompanyUpdate / pendingUpdateWatcher).
//
// Writes two docs:
//   app_updates/1.0    — the update descriptor the app shows in its banner
//   app_updates/latest — pointer the app polls (public read via firestore.rules)
//
// Run on the laptop that has the firebase CLI logged in:
//   node tools/seed-app-updates.js
//
// Auth: reads %USERPROFILE%\.config\configstore\firebase-tools.json and uses
// tokens.access_token (the firebase CLI's stored token). No firebase-admin
// dependency — it goes through the Firestore REST API. If a doc already
// exists it is overwritten via PATCH (updateMask over all fields).

const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'nivelato-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}`
  + '/databases/(default)/documents';

// --- auth ---------------------------------------------------------------
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

// POST with documentId (create); on 409 the doc exists — PATCH overwrite it.
async function upsertDoc(token, collection, docId, data) {
  const createUrl = `${BASE}/${collection}?documentId=${encodeURIComponent(docId)}`;
  const body = { fields: toFields(data) };
  try {
    await rest('POST', createUrl, token, body);
    console.log(`created  ${collection}/${docId}`);
  } catch (e) {
    if (!String(e.message).startsWith('HTTP 409')) throw e;
    const mask = Object.keys(data)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join('&');
    await rest('PATCH', `${BASE}/${collection}/${encodeURIComponent(docId)}?${mask}`, token, body);
    console.log(`updated  ${collection}/${docId}`);
  }
}

async function main() {
  const token = loadAccessToken();
  const now = new Date();

  await upsertDoc(token, 'app_updates', '1.0', {
    version: '1.0',
    title: 'Nivelato v1.0',
    notes: 'Company data migration: version stamping, user count recompute, '
      + 'permission and notification backfills. No data is deleted.',
    requiresMigration: true,
    createdAt: now,
  });

  await upsertDoc(token, 'app_updates', 'latest', {
    version: '1.0',
    updatedAt: now,
  });

  console.log('Done.');
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
