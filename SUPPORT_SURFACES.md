# Nivelato Support Surfaces: Design

Status: Phase 0 design, written 2026-10-12. Implementation follows this doc
phase by phase. Rules changes in this program are DRAFTED ONLY (see the
rules patch section at the end): Firestore security rules are frozen
pending a forensics verdict owned by another agent. Nothing in this doc
deploys rules.

Surfaces:

| Host | Purpose | Audience |
| --- | --- | --- |
| beta.nivelatolabs.com | Beta enrollment, beta settings, beta channel adoption, priority feedback | Signed-in users and company owners |
| testing.nivelatolabs.com | Testing track status: what is on internal/closed testing, how to join, staff feedback inbox | Public info; staff view gated |
| debug.nivelatolabs.com | Version truth surface: backend stamp, release registry, company version and downgrade path | Public info; company actions owner-gated in the app |
| remote.nivelatolabs.com | Time-boxed Nivelato Labs support access by one-time code | Company owners (accept/revoke) and Nivelato Labs staff (generate) |

All UI is EN + ES (toggle stored per browser, Spanish default, matching
the rest of the product). No em dashes in any user-facing copy.

## 1. Routing and hosting

Decision: one Cloudflare Worker per host, mirroring the existing
app.nivelatolabs.com pattern exactly (nivelato-app-proxy). NOT one shared
worker: every existing subdomain (app, login, dashboard, updates, apply,
faq, start, go) already has its own service-worker-format script and its
own route, so a failure or a bad deploy on one surface can never take
down another, and app.nivelatolabs.com behavior is untouched.

Per host, the live change set is identical in shape to the existing ones:

- DNS: proxied A record `<host>` -> `192.0.2.1` (the placeholder origin
  every other worker-fronted subdomain uses; the worker intercepts all
  traffic on the route, the origin is never reached).
- Route: `<host>/*` -> worker script `nivelato-<name>`.
- Script names: `nivelato-beta`, `nivelato-testing`, `nivelato-debug`,
  `nivelato-remote-support`. The name `nivelato-remote` is NOT reused: it
  already exists and serves go.nivelatolabs.com (the private link
  system). Touching it is out of scope.

Worker behavior (all four): service-worker format (modules format 400s
on raw API upload, per the app proxy's hard-won note). The worker maps
clean URLs to files in this repo on GitHub raw, which tracks `main`
within seconds:

- Host root and page paths map to a per-surface directory in this repo:
  `beta/`, `testing/`, `debug/`, `remote/`.
- Clean URLs: `/enroll` -> `beta/enroll.html`, `/enroll/company` ->
  `beta/enroll-company.html`, `/` -> `<dir>/index.html`.
- Shared root assets (`firebase-config.js`, `niv-dark.css`, `geo.js`,
  `press-yaoi.js`, images, `manifest.json`) are proxied from the repo
  root, same as the app proxy does, so the surfaces use the product's
  real design tokens and Firebase setup instead of copies.
- HTML 404s fall back to a plain "not found" response; no Pages fallback
  (these directories exist only in the repo, not in the Pages build).

Geo availability: the app proxy's 451 block (BR / EU member states /
California) applies to `beta` and `remote` (interactive surfaces that
touch company data, same policy as the app). It does NOT apply to
`testing` and `debug`: they are public information surfaces, and a
company that cannot use the service can still legitimately need the
downgrade documentation. This is a deliberate, documented divergence.

Rollback per host: delete the route (traffic stops instantly), then
optionally delete the DNS record and the script. The repo directories
can stay; without a route nothing is served.

## 2. Auth model (all surfaces)

Same Firebase project (`nivelato-app`), same client setup
(`firebase-config.js`, Firebase JS SDK 10.11.0, ES modules), same sign-in
methods as login.html: email/password and Google popup.

- Sessions are per-origin (Firebase Auth persists in the origin's
  IndexedDB), so a user signs in once per surface. This is a known,
  accepted v1 cost: wiring the login subdomain's custom-token SSO
  handoff (mintSsoToken / sso.html) to arbitrary subdomains is a bigger
  change than these surfaces justify on day one. TODO in section 8.
- Google sign-in requires each new host in the Firebase Auth authorized
  domains list. That is a console action (Authentication -> Settings ->
  Authorized domains): add `beta.nivelatolabs.com`,
  `testing.nivelatolabs.com`, `debug.nivelatolabs.com`,
  `remote.nivelatolabs.com`. Email/password sign-in works without it.
  Flagged as a manual step in the delivery report.
- Authorization (who may do what) is never decided client-side alone:
  the client checks are UX. Enforcement is Firestore rules (existing,
  for enrollment) or staff/owner-gated callables (new code, section 5
  and 6).
- A page that needs an account shows a signed-out state with a sign-in
  form; it never redirects in a loop and never bounces to another
  subdomain.

Roles referenced below: org roles are the existing ones (`owner`,
`supervisor`, `cotizador`, `medidor`) on `users/{uid}.role` with
`users/{uid}.orgId`. Nivelato Labs staff is defined in section 6.2.

## 3. Version registry (backend bookkeeping)

Why: the backend must be able to state, at any moment, (1) the source
commit it is running and (2) its user-visible friendly version, so
clients can load the UI and components that match the backend they are
talking to. This kills the version-skew class of bugs (stale service
worker or cache rendering against a newer backend, and the reverse).

### 3.1 Build on the existing machinery, do not replace it

The existing UI-version system (UI_VERSIONING.md, `setUiVersion`,
deployed 2026-10-12) already provides:

- `config/ui_versions` (global doc): `latestSemver`, `releasedAt`,
  `changelog`.
- `config/ui_versions/orgs/{orgId}`: per-org UI tag
  `v{semver}-{theme}-{orgid}`, set by the owner-only `setUiVersion`
  callable, surfaced to clients through flowGate.

The registry EXTENDS this home instead of creating a parallel one:

- `config/ui_versions` gains backend stamp fields (written by the
  stamping tool, section 3.3):
  - `backendCommit` (string, full GitHub SHA of the web repo `main`
    commit the backend is serving; the web app IS GitHub raw, so the
    commit is the deploy's identity)
  - `backendFriendlyVersion` (string, e.g. `1.1.0`)
  - `backendStampedAt` (timestamp)
  - `backendStampedBy` (string: `deploy`, `backfill`, or a uid)
- `config/ui_versions/releases/{releaseId}` (NEW subcollection): the
  release ledger. One doc per shipped release:
  - `platform`: `web` | `android`
  - `commit` (web) or `versionCode` (android, number)
  - `friendlyVersion` (string or null when unknown, see backfill)
  - `channel`: `stable` | `beta` (section 4.3)
  - `stampedAt`, `stampedBy`
  - `backfilled`: boolean, true for retroactive entries
  - `notes` (string, optional)
  - Doc ids are deterministic and idempotent: `web-<sha first 12>` and
    `android-<versionCode>`, so re-running a stamp never duplicates.
- Public projection: `config/` has no client-read rule today (default
  deny; the registry is written and read server-side). So the stamping
  tool ALSO mirrors the current stamps into the already-public
  `app_updates` collection, following the `app_updates/latest`
  precedent (public read, console/function-only write):
  - `app_updates/backend`: `{ platform: 'web', commit, friendlyVersion,
    channel, stampedAt, backfilled }`
  - `app_updates/android`: `{ platform: 'android', versionCode,
    friendlyVersion, channel, stampedAt, backfilled }`
  Clients and the debug/testing surfaces read the projection today,
  with zero rules changes. The drafted rules patch (section 7) adds a
  public read for `config/ui_versions` itself so the projection can be
  retired later if desired.

### 3.2 Friendly version ownership

The friendly version is a product release name shared across platforms
(today: `1.1.0` for both web and Android). Its source of truth going
forward is a `VERSION` file at the repo root containing exactly the
friendly version string. The stamping tool reads it by default; a
release that bumps the friendly version edits that one file.

### 3.3 Stamping: a commit cannot ship unstamped

Tool: `tools/stamp-backend-version.js` (Node, no firebase-admin
dependency; Firestore REST with the firebase CLI token, the same
pattern as `tools/seed-app-updates.js`; run on the laptop that has the
CLI logged in).

- Web stamp (run as the LAST step of every web deploy, after the push):
  `node tools/stamp-backend-version.js --platform web
  [--commit <sha>] [--friendly <v>] [--channel stable|beta]`
  Default commit is `git rev-parse HEAD`. Writes: the global doc's
  backend fields, the ledger doc `web-<sha12>`, and the
  `app_updates/backend` projection.
- Android stamp (run when a build is published to a track):
  `--platform android --version-code 79 --friendly 1.2.0
  --channel beta` writes ledger doc `android-79` and the
  `app_updates/android` projection.
- Deploy-flow rule (process, documented here and in the tool header):
  the push/deploy sequence is not done until the stamp is written. The
  debug surface compares the registry commit against GitHub `main`
  HEAD and shows an "unstamped commit" warning, which makes a missed
  stamp visible instead of silent.

### 3.4 Client consumption contract

- Web client at boot: read `app_updates/backend` (public). It carries
  the backend commit and friendly version the backend believes it is
  running. A client that knows its own expected friendly version (from
  `nivelato_config/version`, the existing public floor doc) can detect
  skew: friendly major.minor mismatch -> show the existing update
  banner pattern instead of rendering against the wrong backend.
- `getBackendVersion` callable (NEW, code shipped in this program,
  deploy pending with the functions batch): returns the canonical
  registry state (global doc + latest ledger entries per platform and
  channel) for surfaces that want more than the projection.
- Consumers: debug.nivelatolabs.com (primary: stamp display, skew
  check, downgrade tooling), testing.nivelatolabs.com (what is on
  which track/channel), the beta adoption flow (from/to versions are
  read from the registry, never typed by a client).

### 3.5 Retroactive backfill (done with this program)

Written by the stamping tool with `stampedBy: 'backfill'` and
`backfilled: true`. Web entries carry their commit; friendly version
1.1.0 for the 2026-10-12 deploys (they shipped with the Android 1.1.0
release). The pre-registry web state (43c9783, the `main` HEAD before
2026-10-12) gets `friendlyVersion: null`: its friendly version was
never recorded anywhere and is not invented here.

| platform | id | commit / versionCode | friendly | channel |
| --- | --- | --- | --- | --- |
| web | web-43c97832b21f | 43c9783 | null (pre-registry) | stable |
| web | web-d59871c... | d59871c | 1.1.0 | stable |
| web | web-a20ef46... | a20ef46 | 1.1.0 | stable |
| web | web-08961d8... | 08961d8 | 1.1.0 | stable |
| android | android-75 | 75 | 1.1.0 | stable |
| android | android-76 | 76 | 1.1.0 | stable |
| android | android-77 | 77 | 1.1.0 | stable |
| android | android-78 | 78 | 1.1.0 | stable |

Current pointers after backfill: global `backendCommit` = 08961d8 (the
newest web commit at backfill time; the next real deploy stamp
overwrites it), `app_updates/backend` mirrors it, `app_updates/android`
mirrors versionCode 78 / 1.1.0.

## 4. Phase 1: beta.nivelatolabs.com

Pages (repo dir `beta/`):

- `/` and `/settings`: enrollment state for the signed-in user (and
  their company, if any), links to enroll/unenroll, beta channel state
  for owners, feedback entry point.
- `/enroll`: individual enrollment. Signed-in only. Writes
  `users/{uid}` merge: `{ betaEnrolled: true, betaEnrolledAt:
  serverTimestamp, betaChannel: 'beta' }`.
- `/unenroll`: clears the same fields (`betaEnrolled: false`,
  `betaChannel: 'stable'`). Company enrollment is separate and owner
  controlled; unenrolling personally does not unenroll the company.
- `/enroll/company`: company enrollment. Owner only (client UX check on
  `users/{uid}.role == 'owner'` plus `orgs/{orgId}.ownerId == uid`;
  rules enforce the real boundary). Writes `orgs/{orgId}` merge:
  `{ betaEnrolled: true, beta: { enrolledAt, enrolledBy } }`. Unenroll
  for the company lives here too.

Why these writes are legal TODAY under the frozen rules:

- User self-update: the users update rule pins `role`, `orgId`,
  `permissions`, `disabled`, geo fields as unchanged for self-edits.
  `betaEnrolled`/`betaEnrolledAt`/`betaChannel` are not pinned, so a
  signed-in user may set them on their own doc right now.
- Org update: the owner path (`canWriteOrgData` + role owner +
  ownerId) pins `flow`, `versionPolicy`, `licenseStatus`, `dataVersion`
  unchanged. `betaEnrolled`/`beta` are not pinned, so the owner may
  set them right now.

The drafted rules patch (section 7) later pins these fields properly
(owner-only for the org fields, self-only for the user fields) instead
of relying on them merely being unpinned.

### 4.3 Channels: stable vs beta (no parallel store)

Channels are modeled inside the existing version machinery:

- Release descriptors and ledger entries carry `channel: 'stable' |
  'beta'` (section 3.1).
- Pointers: `app_updates/latest` remains the stable pointer.
  `app_updates/beta-latest` is the beta pointer, same shape
  (`{ version, updatedAt }` plus registry fields), created by the
  stamping tool the first time a beta release is stamped. It does not
  exist until a real beta exists; the UI says so honestly.
- A company's channel is `orgs/{orgId}.updateChannel` (`'stable'`
  default, `'beta'` after adoption). A user's personal beta enrollment
  (4.1) and a company's channel are different facts: enrollment says
  "this person/company participates in the beta program"; the channel
  says "this company's installs target beta versions". Company
  enrollment is a precondition for adoption.

### 4.4 Beta update adoption (owner only)

Flow:

1. A beta version is published (stamped with `--channel beta`; the
   beta pointer moves).
2. Surfaces: the company settings Updates area (the existing updates
   UI reads `app_updates/latest` today; the beta-aware read is: if the
   org's channel is beta, ALSO read `app_updates/beta-latest`) and the
   beta surface `/settings` page for enrolled companies. Non-owners see
   at most "your company is on the beta channel" text. The Adopt
   control renders for owners only.
3. The owner confirms. The client calls `setOrgUpdateChannel({
   channel: 'beta' })` (NEW callable, section 7.4): it re-verifies
   owner (user doc role owner AND org ownerId, the same double check
   as `applyCompanyUpdate`), reads from/to versions from the pointers
   server-side, writes `orgs/{orgId}.updateChannel`, and appends the
   record to `orgs/{orgId}/channelHistory/{autoId}`: `{ fromChannel,
   toChannel, fromVersion, toVersion, by (uid), byEmail, at }`.
4. Effect: the company's clients consult the beta pointer in the
   existing update flow (banner / updates page), exactly as they
   consult `latest` today. Rollback is the same call with
   `channel: 'stable'`, recorded the same way; it is the channel-level
   half of the downgrade story in section 5.3.

Until the callable is deployed, the beta surface shows adoption as
"prepared, pending backend deploy" for owners instead of a dead
button. Enrollment itself (4.1/4.2) works today and is not gated on
the callable.

### 4.5 Priority feedback

- Entry points: the beta surface (`/settings` and a `/feedback` page)
  and, by design, any in-app feedback affordance later. v1 ships the
  beta surface form: category (`bug` | `idea` | `help` | `other`),
  free text, optional contact email prefilled from the account.
- Submission goes through `submitFeedback` (NEW callable): it derives
  everything trustable server-side: uid/email from auth, orgId from
  the user doc, `priority` = (user betaEnrolled OR org betaEnrolled),
  `channel` from the org's `updateChannel` (default stable),
  `versionStamp` = the current registry projection read server-side
  (`{ friendlyVersion, backendCommit }` plus the org channel pointer
  version). The client sends only `{ category, text }`. It writes
  `feedback/{autoId}`: `{ orgId, uid, email, category, text, priority,
  channel, versionStamp, status: 'new', createdAt }`.
- Nivelato Labs side: `listPriorityFeedback({ onlyPriority })` (staff
  gated, section 6.2) powers a simple staff inbox on
  testing.nivelatolabs.com/staff: priority items first, flag visible,
  org and version stamp shown. This is deliberately separate from any
  general feedback: the query filters on the server-derived `priority`
  field.
- `feedback` has no client rules at all: default deny. Drafted patch
  keeps it that way (function-mediated only).

## 5. Phase 2 and 3: testing and debug

### 5.1 testing.nivelatolabs.com

Static-but-accurate beats fake-live. The page is rendered client-side
from public reads only:

- `app_updates/latest` + the descriptor doc: current stable version,
  its public description and extended description. `internalNotes` is
  NEVER rendered (it is internal by convention, and this surface does
  not read it into the DOM at all).
- `app_updates/android` + `app_updates/backend` projections: what
  testers are actually running per platform.
- `app_updates/beta-latest` when it exists: the beta channel's current
  version; when absent, the page says no beta is published yet.
- How to join: internal testing via the Play internal track (testers
  list managed in Play Console; the page explains the invite flow and
  points personal enrollment to beta.nivelatolabs.com), closed testing
  status from the registry (0/12 testers production gate is a Play
  Console fact, stated as text with its date, not fetched).
- `/staff`: the priority feedback inbox (4.5), staff gated.

### 5.2 debug.nivelatolabs.com

The version truth surface:

- Backend stamp: reads `app_updates/backend` (commit, friendly
  version, stamped at, backfilled?) and compares the commit against
  GitHub `main` HEAD (public API, client-side). States: `stamped`
  (equal), `unstamped commit on main` (main is ahead: a deploy shipped
  without its stamp), `registry behind` impossible to distinguish from
  unstamped; the page words it as "main has moved since the last
  stamp".
- Release ledger summary via `getBackendVersion` when deployed; until
  then, the two projection docs.
- Company version panel (signed-in): the caller's org `dataVersion`,
  UI tag (flowGate/`config/ui_versions/orgs/{orgId}` via the existing
  machinery), `updateChannel`, and which descriptor the org would be
  offered (stable vs beta pointer).

### 5.3 The downgrade path, as it actually exists today

Investigated, not invented. What a company can do TODAY:

1. Defer an update: the owner sets `pendingUpdate` on the org doc from
   the updates UI; `pendingUpdateWatcher` applies the data migration
   later, only when nobody is online. This is deferral, not downgrade.
2. UI version tag: the owner-only `setUiVersion` callable accepts any
   valid semver, including an older one, and re-tags the org's UI
   version. This is the only true "go back" knob that exists, and it
   moves the tag, not the data.
3. Channel rollback: once 4.4 is deployed, an owner on the beta
   channel can roll back to stable (recorded). Before that deploy,
   there is no client channel to roll back from.

What does NOT exist (TODOs, not fiction):

- There is NO data downgrade. `runCompanyMigration` is one-way
  (0.9 -> 1.0) and idempotent; no reverse migration is written, and
  `dataVersion` is pinned against client writes. A company that needs
  its data back on 0.9 needs a server-side intervention by Nivelato
  Labs (which is one of the things the remote support system in
  section 6 is FOR, performed by staff, by hand, audited).
- There is NO Android app downgrade distribution. Play does not
  downgrade installed apps; an older AAB can only go to a test track.
- `versionPolicy` is console/function-only and is not a downgrade
  mechanism; it is not presented as one.

The debug surface documents exactly this, and the help docs gain a
matching section (ayuda.html, new section "Versiones y volver a una
version anterior") written to the same facts. The help repo is THIS
repo: ayuda.html is served at legobele.github.io/nivelato/ayuda.html.
Its Pages pipeline has been wedged since 2026-10-06; the section is
committed anyway and the wedge is reported, not worked around.

...[truncated 20367 chars]
## 6. Phase 4: remote.nivelatolabs.com (support access)

The critical system. Design bar: a support session must be at least as
safe as handing a trusted employee a borrowed login for two hours,
and strictly more accountable. If any part cannot meet the bar, that
part does not ship.

### 6.1 Flow

1. A company hits a problem and contacts Nivelato Labs (any channel:
   phone, email, in person). While talking, the support person
   generates a code (6.3) from the staff page
   (remote.nivelatolabs.com/staff). Optionally they bind it to the
   company's orgId when they know it.
2. The support person reads the code to the company. The company's
   OWNER opens remote.nivelatolabs.com and enters it
   (`acceptSupportCode`). Entering the code IS the consent: nobody can
   accept a code into an org they do not own.
3. A session opens for a fixed TTL of 2 hours. While it is open: the
   support identity has near-admin access to that ONE org's data under
   the rules patch (6.5); a live indicator shows on the remote surface
   for every member of the org who visits it, and the org doc carries
   a server-stamped `supportSession` summary for any client to read;
   the owner can revoke instantly (`revokeSupportSession`); the
   support person can end it early.
4. Expiry is automatic: rules compare `expiresAt` against
   `request.time` on every access, so an expired session is dead even
   if nobody sweeps it. A scheduled sweeper
   (`supportSessionSweeper`, every 5 minutes) closes out records,
   clears the org indicator, and writes the closing audit entry.

### 6.2 The staff gate (concrete)

A caller is Nivelato Labs staff iff EITHER:

- their ID token carries the custom claim `nivelatoStaff == true`, OR
- a doc `staffAllowlist/{email}` exists (email = the token's verified
  email; console-managed, exactly like the existing `devAllowlist`
  pattern).

Every staff callable checks this server-side via the Admin SDK
(`isStaff(auth)` helper in functions). Bootstrap: the first staff
emails are added by hand in the Firebase Console (one doc per email in
`staffAllowlist`, or a claim set via the Admin SDK). There is no
self-service path to staff, ever, and the gate is checked on every
call, not cached in a client.

### 6.3 Codes

- Generated ONLY by `createSupportCode` (staff gated). The plaintext
  code (10 characters, Crockford base32, grouped 5-5 for reading over
  the phone) is returned ONCE to the staff member and shown to them;
  it is never stored, logged, or emailed by the system.
- Stored: `supportCodes/{codeId}` with `codeHash` = SHA-256 hex of the
  normalized code, `supportUid`, `supportEmail`, `orgId` (nullable
  bind), `createdAt`, `expiresAt` (30 minutes to be entered),
  `status: 'pending' | 'used' | 'expired' | 'void'`, `usedAt`,
  `usedByOrg`, `usedByUid`. Client rules: no access at all
  (function-only collection, like `upgradeLinks`).
- Acceptance is a transaction: look up by hash, require
  `status == 'pending'`, `expiresAt > now`, and (if bound)
  `orgId == caller's org`. Burn on use (single-use). Rate limited per
  org and per caller using the codebase's existing `checkRateLimit`
  pattern (accept attempts: small daily budget per org; a wrong code
  is indistinguishable from a typo, so failures are generic:
  "code invalid or expired").

### 6.4 Elevation mechanism: session doc, NOT custom claims (justified)

Chosen: a rules-checked session document at a deterministic path.

- `supportAccess/{orgId}__{supportUid}` (top-level collection; the doc
  id is exactly org id + `__` + support uid). Fields: `orgId`,
  `supportUid`, `supportEmail`, `status: 'active' | 'revoked' |
  'expired'`, `createdAt`, `expiresAt`, `codeId`, `acceptedBy`
  (owner uid), `acceptedByEmail`.
- Written ONLY by callables via the Admin SDK (activation, revoke,
  sweep). Client rules for the collection: no reads, no writes.
- Rules helper (drafted patch, 6.5): `supportSession(orgId)` gets
  exactly this doc for `request.auth.uid`; `hasActiveSupport(orgId)`
  is true iff it exists, `status == 'active'`, and
  `expiresAt > request.time`. Because the path is deterministic,
  rules can get() it: Firestore rules cannot query, and this design
  never asks them to.

Why not custom claims:

- Claims are per-USER, not per-org-per-session. A claim like
  `supportOrg: X` could encode one org, but concurrent sessions,
  revocation, and expiry all fight the token model: claims change
  only on token refresh (up to an hour of lag), so "revoke instantly"
  is impossible with claims alone. Giulia's spec says the company can
  revoke instantly; claims cannot do that. The session doc can:
  flipping `status` denies the very next request.
- Claims are invisible to the company. The session doc doubles as the
  audit anchor and the indicator source.
- Blast radius: a leaked support token with claims is a skeleton key
  until refresh; a leaked token with the session-doc model is bounded
  by the doc's status and 2h expiry, and the company can kill it.

Cost accepted: one extra get() per rules evaluation on org paths that
offer a support branch. Org data reads already pay get() costs for
claims validation (`myUser()`, `orgFlow()`); one more is in family.

### 6.5 What the support identity can and cannot do (rules patch)

The drafted patch adds a support branch beside the member branches.
The support branch NEVER widens the deny list:

CAN (while session active, this org only):

- Read org doc, jobs, projects, member user docs, invites (read),
  notifications: the diagnostic surface.
- Create/update jobs and projects (fixing stuck data is the point).
- Update member user docs' operational fields (e.g. clear a stuck
  flag), subject to the cannot list.
- Append audit entries (6.6) for their own actions.
- Read the org's `supportSessions` history and `channelHistory`.

CANNOT (hard deny list, enforced in the patch by construction: the
support branch simply does not grant these, and pinned-field checks
apply to it):

- Delete the company (org delete stays owner-only; support branch has
  no delete).
- Delete ANY document: the support branch grants no delete anywhere
  (jobs, projects, users, invites included). Diagnosis rarely needs
  deletion; irreversible actions are the line.
- Delete or deactivate users: user delete is already globally denied
  for clients; `disabled` on a member doc cannot be changed by the
  support branch, and `processAccountDeletion` approvals
  (`deleteApprovedAt`) stay owner-only.
- Billing changes: `licenseStatus` stays pinned unchanged (the patch
  keeps the existing pin for the support branch); there is no
  client billing surface to grant.
- Ownership transfer: `orgs.ownerId` and `users.role/orgId` are
  immutable under the support branch; support cannot set anyone's
  role to `owner`, cannot change the owner's doc at all.
- Change the org's `flow`, `versionPolicy`, `dataVersion` (existing
  pins, kept).
- Touch geo fields on users (`geoStatus`, `lastGeoCheck`,
  `lastSeenRegion`): support access is consented and geo-independent;
  letting it mint geo state would corrupt the flowGate layer.
- Manage support sessions other than their own, modify or delete
  audit entries (append-only), read or write `supportCodes`,
  `supportAccess`, `staffAllowlist`, `geoReviews`, `upgradeLinks`,
  `devices` (all function/console-only, unchanged).
- Grant themselves anything: the session doc is function-written;
  there is no client path that creates one.

### 6.6 Audit log

`orgs/{orgId}/supportAudit/{entryId}`, append-only.

- Written by: (a) the callables, server-side, for every lifecycle
  event (code created is staff-side only and NOT in the company log;
  accepted, revoked, expired, channel changes during a session), and
  (b) the remote console client, in the same batch as each mutation it
  performs under a session: `{ sessionId, actor (support uid),
  actorEmail, action: 'create' | 'update', collection, docId,
  summary, at }`.
- Rules (drafted): create allowed only for the session's support uid
  while their session is active, with `actor == request.auth.uid`;
  update/delete denied to everyone; read allowed for the org owner
  and for members with the `userManagement` permission (they are the
  people who would review an incident).
- Honest limits, stated here so nobody oversells this log:
  - Firestore rules cannot log READS. The log covers mutations and
    lifecycle events, not views. Mitigations: 2h TTL, named support
    identity, live indicator, owner revocation.
  - A staff member abusing a raw SDK client (not the console) could
    mutate without writing an audit entry. The console is the only
    supported staff tool, staff are named individuals on an allowlist,
    and the session itself is always logged. Closing this hole fully
    would require callable-mediated data access for everything, which
    is noted as a future hardening step, not v1 scope.

### 6.7 Company experience (remote.nivelatolabs.com)

- Signed-out and member states explain what the page is.
- Owner state: code entry form, active session card (who, since when,
  expires at, big Revoke button), past sessions list (from
  `supportSessions`), audit log viewer (reads `supportAudit`).
- Any-member state while a session is active: a clear banner: "Nivelato
  Labs support session active: <email>, until <time>. Your company
  owner can end it at any time from this page."
- Staff state (`/staff`): generate a code (optional org bind from the
  org list the staff member can look up in console; v1 takes the orgId
  as typed input), list of own live sessions, end-session buttons.
  The staff page refuses non-staff accounts (server-verified via the
  code callables failing closed; the page checks the claim/allowlist
  through a callable ping, never by trusting the client alone).

### 6.8 What ships now vs at the elevation switch

Ships as code in this program: both pages, all callables
(`createSupportCode`, `acceptSupportCode`, `revokeSupportSession`,
`endSupportSession`, `supportSessionSweeper`, `getSupportStatus`), the
session/audit data writes those callables perform (Admin SDK bypasses
rules, so lifecycle works the moment functions deploy).

The ELEVATION SWITCH is the drafted rules patch (section 7): until it
is reviewed and deployed (after the rules freeze lifts), an accepted
session exists, is visible, is audited, and can be revoked, but the
support identity's direct Firestore access to org data remains denied
by the current rules. That is the safe failure mode, and it is the
state this program intentionally leaves behind: everything up to the
switch, nothing past it.

## 7. Consolidated DRAFTED rules patch (NOT deployed)

One patch, reviewed as one unit when the freeze lifts. Full text is
kept in `firestore.rules.proposed-support` next to `firestore.rules`
so it can be diffed. Summary of its rules deltas vs the live rules:

- New helpers: `staffDoc()`, plus in the org scope
  `supportAccessPath(orgId)`, `supportSessionDoc(orgId)`,
  `hasActiveSupport(orgId)`.
- New matches, all client-denied (function-only): `/supportCodes/{id}`,
  `/supportAccess/{id}`, `/staffAllowlist/{email}` (get own entry
  allowed for signed-in users, mirroring `devAllowlist`), `/feedback/{id}`
  (no client access; function-mediated).
- `orgs/{orgId}`: support branch on get/update (update keeps every
  existing pin plus `ownerId` unchanged); NO support delete.
  New subcollection matches: `supportSessions/{id}` (read: owner,
  members with userManagement, or the session's support uid; write:
  function-only), `supportAudit/{id}` (create: active session support
  uid with actor pin; read: owner + userManagement; update/delete:
  denied), `channelHistory/{id}` (read: owner; write: function-only).
- `orgs/{orgId}/jobs` and `/projects`: support branch on read/create/
  update; NO support delete.
- `users/{userId}`: support branch on get/list for members of the
  session's org; update branch with role/orgId/geo/deletion pins
  (role may not become `owner`; the org owner's own doc is excluded).
- `config/ui_versions` and its `orgs`/`releases` subcollections:
  public read (retires the need for the app_updates projection);
  writes stay function/console-only.
- `betaEnrolled`/`beta`/`updateChannel` pins: user beta fields
  self-only; org beta fields + `updateChannel` owner-only (today they
  are merely unpinned; the patch makes the boundary explicit).
- 7.4 Callable inventory (code shipped, deploy pending as one batch):
  `getBackendVersion`, `setOrgUpdateChannel`, `submitFeedback`,
  `listPriorityFeedback`, `createSupportCode`, `acceptSupportCode`,
  `revokeSupportSession`, `endSupportSession`, `getSupportStatus`,
  `supportSessionSweeper` (scheduled).

## 8. Open items and manual steps

1. Firebase Console: add the four hosts to Auth authorized domains
   (Google sign-in). Manual, one minute.
2. Functions deploy of the section 7.4 batch: one command, owned by
   the normal deploy flow, after the forensics verdict. Until then:
   enrollment works, adoption/feedback/remote lifecycle are coded and
   dark.
3. Rules patch deploy: after the freeze lifts, reviewed against the
   forensics outcome. This is the remote elevation switch.
4. TODO (future): SSO handoff from login.nivelatolabs.com to these
   surfaces (kill the per-origin sign-in); callable-mediated support
   data access (full audit including reads); dashboard banner reading
   `orgs.supportSession` (dashboard.html is owned by other work right
   now; the field and its shape are specified in 6.1 so the dashboard
   can pick it up without backend changes).
