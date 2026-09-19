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

## Open items (still Giulia's call)
- Travel grace: spec suggests 30 days of sustained non-PR presence → review case.
- Price points: $29/major/org + $4/user/mo is Lux's proposal — veto/adjust anytime.
- Stripe: tentative, pending the conversation with her mother (18+ account holder).
- `geoReviews` triage: console-only for now; dashboard UI is future work.
- Owner past-due banner (30d grace, 3-day snooze): UI not built yet — Phase 3.
