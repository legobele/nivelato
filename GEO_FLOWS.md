# Nivelato — Geo Flows rollout (branch `feat/geo-flows`)

Implements spec phases 1–2 as code. Spec (final):
`~/workspace/goals/nivelato-10-agent-qa-test/files/nivelato-geo-flows-spec.md`

## What's on this branch

| Area | Files |
|---|---|
| `flowGate` callable + `homeRegionMonitor` schedule | `functions/index.js`, `functions/package.json` |
| Claim-based rules | `firestore.rules`, `storage.rules` |
| QGI backfill (dry-run default) | `tools/backfill-qgi.js` |
| Geo-gated login/signup UI | `login.html` (rewritten, mode-driven), `geo.js` |
| PR-only blocked screens (final copy, spec §14) | `geo-blocked.html` |
| Returning-session gate hook | `auth-guard.js` (guarded, non-breaking) |
| Phase 2 edge routing (NOT deployed) | `workers/geo-edge.js` |
| Deploy wiring | `firebase.json` (functions source added) |

Client behavior before the functions deploy: `ensureFlowClaims()` fails soft
(`{ ok:false }`) and the app continues exactly as today — this branch is safe
to merge before the backend exists. Claims only start enforcing once
`flowGate` is deployed AND the new rules are published.

## Deploy order (Giulia's approvals needed — nothing below is done)

### 1. Backfill (Phase 0) — needs Giulia's explicit go-ahead
```bash
node tools/backfill-qgi.js                                   # dry run first, review output
node tools/backfill-qgi.js --apply --service-account=key.json  # REAL writes
```
Marks `orgs/NJBBG5` as QGI flow + the 4 real users verified + creates
`nivelato_config/version`. Writes to **prod Firestore** — do not run casually.

### 2. Deploy functions (Phase 1) — needs IPINFO_TOKEN decision
```bash
cd functions && npm install   # deps already vendored in functions/node_modules
firebase functions:config:set ipinfo.token="<IPINFO_TOKEN>"  # or .env — pick one
firebase deploy --only functions
```
`flowGate` region: `us-central1`. Without `IPINFO_TOKEN`, lookups fail closed
to `review` (safe, but every login lands in the triage queue — get the token).

### 3. Publish rules (Phase 1) — needs Giulia's explicit go-ahead
```bash
firebase deploy --only firestore:rules,storage
```
⚠️ Point of no return for old clients: tokens minted before `flowGate` carry
no claims, and the new rules fail closed on claim-less org access. In practice
every login calls `ensureFlowClaims()` first, so users self-heal on next
login — but anyone with a stale session mid-use will get permission errors
until they re-authenticate. Deploy functions first, rules second.

### 4. Edge worker (Phase 2) — optional, site works without it
`wrangler login` → deploy `workers/geo-edge.js` on the Pages domain route.
Until then, `login.html` falls back to its own `ipapi.co` lookup.

### 5. Phase 3 — NOT started (needs the Stripe/mother conversation)
Stripe Checkout + provisioning webhook + license sync + trial/past-due
enforcement UI. The client currently self-provisions trial orgs (pinned
`trialing` fields in the rules so a client can't mint a paid org).

## Update 2026-11-09: travel grant reimplementation (Giulia's ruling, source only, NOT deployed)

The 30-day travel grant is now an account-level input to the gate, not a
browser artifact:

- `redeemTravelVerification` already wrote the grant server-side to
  `users/{uid}.travelGrant { validUntil, grantedAt, tokenId }`. That write
  is unchanged, and `requestTravelVerification`'s `isQGC: true` requirement
  is unchanged.
- `flowGate` now reads the grant via `travelGrantActive()` in
  `functions/index.js`. For the QGI flow only: when IP intel is entirely
  missing (provider error, outage, unresolvable egress IP) and the account
  holds an active grant (`validUntil` in the future), the verdict is
  `allow` with reason `travel-grant-intel-missing` and normal claims,
  instead of `review`. Each such override writes a `geoReviews` entry with
  status `logged` and the grant expiry in its signals, so overrides stay
  auditable after the fact.
- The grant does NOT override the untrusted-IP hard block. VPN, proxy,
  tor, and iCloud Private Relay flags still block a QGI user, grant or
  not (reaffirms the 2026-09-19 no-carve-out ruling). Trusted intel
  geolocating outside PR was already `allow` (`qgi-travel-logged`) and is
  unchanged, as is the external flow.
- `login.html`: the sign-in travel detour (`companyNeedsTravel`) now
  consults the account grant (a `getDoc` on the signed-in user's own doc)
  in addition to the device cache, so a grant earned on one device or
  browser is honored on a new one at sign-in. `localStorage`
  (`nivelato_qgc_travel_until`) remains as a per-device cache and is
  refreshed from the server value whenever it is read; an expired grant
  detours exactly as before. Page-boot mode selection still reads only the
  local cache (no signed-in user exists yet at boot); the account check
  happens at the detour decision point, where a user is signed in.

Ship steps still pending Giulia's ship word (nothing below is done):
1. Commit and push `main` (the workers serve GitHub raw, so the push is
   the hosting deploy for `login.html`). The same commit must carry an
   `sw.js` CACHE bump: `login.html` is in the precache list. Assign the
   CACHE number at ship time per the deploy skill's sequencing rules,
   never from a branch note.
2. Deploy the function by name only:
   `firebase deploy --only functions:flowGate`. Never a bare
   `functions` deploy (deletion guard; orphan functions stay live).
3. Stamp the backend version and run the live verification pass from the
   deploy skill (raw marker checks plus a browser pass of the travel
   detour on a fresh browser profile).

## Open items (still Giulia's call)
- Travel grace: spec suggests 30 days of sustained non-PR presence → review case.
- Price points: $29/major/org + $4/user/mo is Lux's proposal — veto/adjust anytime.
- Stripe: tentative, pending the conversation with her mother (18+ account holder).
- `geoReviews` triage: console-only for now; dashboard UI is future work.
- Owner past-due banner (30d grace, 3-day snooze): UI not built yet — Phase 3.
