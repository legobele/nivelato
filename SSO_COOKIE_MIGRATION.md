# SSO to Cookie Session Migration: Design

Status: design only. No code in this document has been implemented.
Directive (Giulia, 2026-10-12): rip the custom SSO system out and replace
it with cookies. This document inventories what exists, designs the
replacement, answers the browser-behavior question underneath the
directive, and stages a reversible migration.

Scope note: this covers the WEB SSO only (login.nivelatolabs.com handing
sessions to app.nivelatolabs.com and dashboard.nivelatolabs.com). The
Android device custom-token flow (issueBootToken with ?auth=1, which
mints `dev_<uuid>` custom tokens for the native app) is a different
system that happens to share vocabulary. It is out of scope and must not
be disturbed by anything proposed here.

---

## 1. Inventory: the SSO system as it exists today

### 1.1 The mint: `mintSsoToken` (functions/index.js)

- Callable function, region us-central1. Requires an authenticated
  caller, then returns `admin.auth().createCustomToken(uid)` for the
  caller's own uid: a Firebase custom token for the same identity.
- Rate limit: 100 mints per uid per day, tracked in the Firestore doc
  `ssoGrants/{uid}` (transactional counter, same pattern as the bundle
  key grants). The comment in the source records why it is 100 and not
  30: persisted sessions re-mint on page loads, and 30 was "one monday
  afternoon of login loops".
- It has no other inputs and no other outputs. It exists for exactly one
  reason: Firebase Auth web sessions are stored per origin (IndexedDB /
  localStorage under that origin), so being signed in on
  login.nivelatolabs.com means nothing on app.nivelatolabs.com. The
  custom token is the portable credential that bootstraps a real
  Firebase session on the destination origin.

### 1.2 The producer: login.html

- `ssoHandoff(defaultNext)` (login.html, "Cross-origin SSO handoff"
  section) runs after every successful sign-in and after the flowGate
  verdict routing in `postAuthRedirect()`.
- It calls the callable endpoint directly over fetch with an explicit
  `Authorization: Bearer <idToken>` header (not via httpsCallable;
  a code comment explains the callable client was bound to a second
  Firebase app instance and never attached auth).
- On success it navigates, via `window.location.replace`, to
  `<destOrigin>/sso.html#ctoken=<customToken>&next=<dest>`. The token
  travels in the URL fragment.
- Destination choice in `postAuthRedirect()`: QGC org (NJBBG5) owners
  and cotizadores go to `https://dashboard.nivelatolabs.com/`, other QGC
  roles to `https://app.nivelatolabs.com/`, everyone else to the
  dashboard subdomain. A `next` query param on the login URL can
  override, sanitized by `sanitizeNext()` against `SSO_ORIGINS`
  (app + dashboard origins; relative paths also allowed).
- Loop breaker: before handing off, `postAuthRedirect()` checks
  sessionStorage `nivelato_last_handoff`; a handoff within the last 60
  seconds aborts with a "login loop" error instead of minting again.
  This exists because the handoff can bounce (destination rejects the
  session, user lands back on login, login hands off again).
- Sign-out landing: `?signout=1` on login.html kills the login origin's
  own Firebase session (see 1.5).

### 1.3 The consumer: sso.html

One file, two unrelated flows:

**Consumer mode (the live handoff).** Reads `ctoken` from the URL
fragment (or query), calls `signInWithCustomToken`, then
`location.replace` to the sanitized `next` (default `/dashboard.html`).
`next` is validated by a second, separate sanitizer in this file
against `SSO_NEXT_ORIGINS` (app + dashboard). On failure it shows an
error and offers a button back to login.nivelatolabs.com. This is the
flow every current login passes through.

**Legacy "Sign in with Nivelato" mode (redirect_uri flow).** With no
ctoken, the page acts as a mini OAuth-ish provider: it takes
`redirect_uri` + `client_id`, gates the redirect against
`ALLOWED_REDIRECT_ORIGINS` (legobele.github.io, app, dashboard,
nivelato-app.firebaseapp.com, nivelato-app.web.app), signs the user in
(Google popup), then redirects to the redirect_uri with a
`nivelato_token` query param containing a JSON payload: the user's
fresh Firebase ID token plus uid, name, email, role, orgId.

Evidence about this legacy flow's liveness: a repo-wide search finds
**no consumer of `nivelato_token` anywhere**. The only producer is
sso.html itself. No page in this repo reads it, and ayuda.html (the
help page also served from GitHub Pages) contains no auth code at all.
Whether anything outside this repo consumes it is an open question for
Giulia (see section 5); inside the repo it is dead weight carrying a
live ID token in a URL.

### 1.4 Everyone who bounces to login (the return path)

Every protected page runs the same pattern: `onAuthStateChanged` fires
with no local user, so the page navigates to
`https://login.nivelatolabs.com/?next=<full current URL>`. Confirmed in:

- dashboard.html (two listeners)
- auth-guard.js (protects index.html)
- users.html, settings.html, updates.html, photo.html
- company/settings.html

After sign-in, login.html sanitizes `next` and hands the session to
that destination's origin via sso.html. So the SSO system is on the
critical path of every cold load of every app page on a fresh origin.

### 1.5 Sign-out today

- account-selector.js (the account menu on app pages): the sign-out
  item navigates to `https://login.nivelatolabs.com/?signout=1`. The
  local SDK session on the app origin is handled around that flow;
  auth-guard.js additionally has `purgeAuthRemnants()`, a best-effort
  sweep deleting `firebase:authUser*` keys from local/session storage
  so a failed signOut cannot leave a session behind.
- The login page on `?signout=1` signs out its own Firebase session.
- There is no server-side revocation step: nothing calls
  revokeRefreshTokens, and there is no shared artifact to kill. Each
  origin's session dies separately, which is precisely the seam a
  shared cookie has to close (see 2.5).

### 1.6 Serving layer (the workers)

Three Cloudflare Workers (service-worker format, maintained outside
this repo and deployed via the Cloudflare API) proxy the subdomains
from GitHub raw / Cloudflare Pages:

- nivelato-login.js (login.nivelatolabs.com): serves login.html; its
  header comment documents the SSO handoff as the reason the login
  origin exists.
- nivelato-app-proxy.js (app.nivelatolabs.com): serves the app; also
  302s `/login` and `/login.html` to login.nivelatolabs.com, 404s
  `/settings` and `/dashboard` paths on the app origin, and applies the
  edge geo availability block (BR / EU / CA get an HTTP 451 page).
- nivelato-dashboard.js (dashboard.nivelatolabs.com): route table maps
  `/sso` and `/sso.html` to sso.html, plus the company routes
  (`/company/users`, `/company/settings`, `/company/updates`) that
  serve users.html / company/settings.html / updates.html.

Two consequences for this design: (a) every app subdomain already has a
worker in front of it that can host session endpoints and forward
cookies; (b) worker changes are a separate deployment surface from this
repo and must be listed as their own migration step.

Also in the blast radius: sw.js precaches `./sso.html` (line 15 of the
precache list), so retiring sso.html requires a precache edit and a
CACHE version bump under the repo's manual-bump convention.

### 1.7 Adjacent systems that are NOT web SSO

- **flowGate / geo claims** (geo.js, functions/index.js): runs after
  sign-in on login (before the handoff) and again on app pages via
  `ensureFlowClaims()`. Verdicts route to geo-blocked.html (block /
  review). It reads and mints Firebase custom CLAIMS, not sessions. The
  cookie migration does not change it; it only changes what happens
  before it (how the page got its local Firebase session). It stays in
  the consumer list because login's post-auth sequence is
  gate first, handoff second; under cookies it becomes gate first,
  direct navigation second.
- **Android device tokens**: issueBootToken's `dev_<uuid>` custom
  tokens and `nivelato_control/blocklist`. Out of scope, untouched.
- **Support sessions** (SUPPORT_SURFACES.md, remote.nivelatolabs.com):
  Firestore session documents for support elevation. Unrelated
  mechanism, unrelated lifetime. Untouched.
- **The language cookie**: login.html already writes
  `nivelato-login-lang` as a `Domain=.nivelatolabs.com; Path=/;
  SameSite=Lax` cookie (script-written via document.cookie), and
  geo-blocked.html on other subdomains already reads it. This is a
  working in-production proof that domain-scoped cookies cross
  Nivelato's subdomains today. It is also a cautionary example: being
  script-written, Safari caps it at 7 days regardless of its 1-year
  Max-Age (see 3.3).
- **New support surfaces** (beta/, testing/, debug/ directories): each
  currently carries its own on-origin Firebase sign-in form
  (signInWithEmailAndPassword / Google popup on that subdomain). They
  are SSO-shaped problems the current system never solved; under the
  cookie design they get signed-in state via exchange like every other
  subdomain (see 2.3).

### 1.8 What breaks if SSO vanished today

Delete mintSsoToken + sso.html with no replacement and: every login
ends at the login page (the handoff fails, `ssoFailed()` shows, user
stays on the form); every app page on an origin without a pre-existing
local Firebase session bounces to login forever (the loop breaker is
the only thing that makes it stop moving); the new beta/testing/debug
surfaces keep working only because they sign in locally. In short, the
SSO system is load-bearing for the entire multi-subdomain layout, and
the migration must replace the load path, not just remove it.

---

## 2. Cookie design

### 2.1 Shape

One session cookie:

```
Name:     niv_session
Domain:   .nivelatolabs.com
Path:     /
Secure:   yes
HttpOnly: yes
SameSite: Lax
Max-Age:  per the persistence choice made at sign-in (see 2.4)
```

Plus one deliberately non-secret hint cookie, script-readable:

```
Name:     niv_session_hint
Value:    1
Domain:   .nivelatolabs.com   Path: /   SameSite: Lax   Secure: yes
HttpOnly: NO (pages read it to decide whether an exchange attempt is
          worth making; it authorizes nothing)
Max-Age:  mirrors niv_session
```

### 2.2 What the cookie carries: a Firebase session cookie

Three candidates were considered:

1. **Opaque session id + server-side session store** (Firestore docs).
   Full control (per-session revocation, device lists), but it means
   building and securing a session store, a lookup on every exchange,
   and cleanup jobs, to replicate what Firebase already operates.
2. **A custom-signed JWT** (our own keys, our own claims). Full
   control, but we own key rotation, algorithm hygiene, and every
   verification bug, forever.
3. **A Firebase Admin session cookie** (`createSessionCookie` /
   `verifySessionCookie`, firebase-admin is already a dependency at
   ^13). Google signs it, the Admin SDK verifies it, its lifetime
   model (5 minutes to 14 days) is built in, and revocation hooks
   into `revokeRefreshTokens` with `verifySessionCookie(cookie,
   true)`. 

**Decision: option 3.** The cookie value is a Firebase session cookie
minted from the user's ID token. It is a credential, so it is HttpOnly
and never touches JavaScript, URLs, logs, or storage.

What the cookie is NOT: it is not a Firebase client session, and it
never reaches Firestore. Firestore rules continue to see exactly what
they see today: the per-origin Firebase SDK session and its claims
(including flowGate claims). The cookie is a handoff and re-entry
layer between origins, replacing the URL-fragment custom token, not a
replacement for Firebase identity. Section 2.3 is where the two meet.

### 2.3 Endpoints (all new, all behind the existing workers)

One HTTPS Cloud Function, working name `webSession`, with three
actions selected by path. It must be an HTTPS (onRequest) function,
not a callable, because it needs to read Cookie headers and write
Set-Cookie headers. Each subdomain worker gains three routes that
proxy to it, forwarding the Cookie header on the way in and the
Set-Cookie header on the way out:

- `POST /__session/mint` (login worker only)
  Called by login.html right after a successful Firebase sign-in,
  same-origin, with `Authorization: Bearer <idToken>` (the same
  explicit-header pattern ssoHandoff uses today, for the same
  second-app-instance reason). The function verifies the ID token,
  reads the requested lifetime (see 2.4), calls
  `createSessionCookie`, and responds with Set-Cookie for both
  cookies. No body of consequence.
- `POST /__session/exchange` (app, dashboard, and later
  beta/testing/debug/remote workers)
  Called by a page on that origin when the SDK reports no local user
  but `niv_session_hint` is present. The request is same-origin, so
  the browser attaches `niv_session` automatically; the worker
  forwards it; the function runs `verifySessionCookie(cookie, true)`
  (revocation-checked) and returns `{ customToken }` for that uid.
  The page calls `signInWithCustomToken` and proceeds exactly as it
  does today after an SSO landing. No redirect, no URL token, no
  intermediate page.
- `POST /__session/clear` (every worker)
  Expires both cookies (Set-Cookie with Max-Age=0, same Domain/Path)
  and calls `revokeRefreshTokens(uid)` for the session's uid, so the
  session cookie fails revocation checks immediately on every origin,
  not just at natural expiry.

Why the worker proxy is load-bearing and not ceremony: if the page
called the function's cloudfunctions.net URL directly, that request
would be cross-site relative to the page, and the Set-Cookie /
Cookie handling would fall into the third-party cookie regime
(blocked outright in Safari and Firefox, being phased out in Chrome).
Same-origin worker routes keep every cookie read and write in a
first-party context. This is the single most important implementation
detail in the design.

Rate limiting: mint is authenticated and per-uid (reuse the
transactional counter pattern; a small daily cap, since mint now
happens once per sign-in instead of once per page load, the ssoGrants
100/day budget is generous headroom). Exchange is unauthenticated by
design (the cookie IS the credential) and should be capped per IP at
the worker, with failures returning a plain 401 and no detail.

### 2.4 Lifetime and refresh

Firebase caps session cookies at 14 days. Map that onto the choice
login.html already offers ("save login on this device?", which today
selects browserLocalPersistence vs browserSessionPersistence for the
SDK):

- **Save login: yes** → `Max-Age` 14 days (the Firebase maximum).
- **Save login: no** → `Max-Age` 1 day. (A true browser-session cookie,
  no Max-Age at all, is the stricter option; mobile browsers keep
  "session" cookies alive across restarts often enough that the
  1-day explicit cap is the more honest behavior. Giulia's call, see
  section 5.)

Expiry is absolute from mint in v1: exchange does not slide it. When
the cookie dies, the next cold load on any origin finds no hint
cookie, bounces to login, and the user signs in again, which is
exactly today's behavior for an expired SDK session. Sliding renewal
(re-minting on exchange when the underlying login-origin session is
still alive) is a clean v2, deliberately excluded so v1's semantics
stay auditable.

### 2.5 Sign-out and revocation

Sign-out becomes one action with three effects, replacing today's
per-origin patchwork:

1. Current origin calls `/__session/clear`: cookies expired on the
   whole domain at once, and refresh tokens revoked server-side, so
   the session is dead on origins the user is not even looking at.
2. Current origin signs out its local Firebase SDK session (and the
   existing purgeAuthRemnants sweep stays as belt and braces).
3. The existing landing on `login.nivelatolabs.com/?signout=1` stays,
   so the login origin also drops its SDK session; the login page
   additionally calls clear (idempotent) in case it is reached with a
   live cookie.

Revocation granularity is per user, not per device: revoking refresh
tokens kills that user's session cookies everywhere. For a
single-company, small-team product that is the correct blast radius
for a sign-out or a compromise response, but it is a real semantic and
is listed in section 5.

Theft posture, stated plainly: an HttpOnly cookie cannot be read by
XSS, and SameSite=Lax plus the fact that all state-changing app
operations run through the Firebase SDK (Authorization headers, not
cookies) means the cookie's exposure surface is the exchange endpoint
alone. A stolen cookie yields exchanges until expiry or revocation,
which is the same exposure class as today's persisted SDK sessions;
the 14-day cap and revocation are the mitigations.

### 2.6 Who verifies what

- **Sensitive operations**: unchanged. Firestore rules + function
  auth checks on Firebase ID tokens and claims. The cookie is never
  an input to an authorization decision about data.
- **Session endpoints**: the function, via Admin SDK verification.
  This is the only place the cookie is a credential.
- **Workers**: dumb proxies in v1. They forward cookies and could
  later verify the session JWT at the edge (session cookies are
  Google-signed JWTs; public keys are published and cacheable) for
  cheap routing decisions, but no v1 behavior depends on worker-side
  verification, and no worker decision should ever be the only gate
  on data.
- **Client pages**: read only the hint cookie. Presence of a hint
  means "try exchange once"; anything else means "bounce to login".

---

## 3. Browser-reality analysis

### 3.1 The headline answer

Giulia's worry, as posed: won't browsers throw this down because
dashboard.nivelatolabs.com looks like a third-party domain?

**No. Subdomain to subdomain is same-site, and the cookie is
first-party in every Nivelato context.** The distinction that matters:

- An **origin** is scheme + host + port. login, app, and dashboard
  are three different origins. That is why Firebase Auth storage does
  not cross between them, and why SSO exists at all.
- A **site** is scheme + registrable domain (eTLD+1). All three hosts
  sit under nivelatolabs.com, over https, so they are one site.
- Cookies are scoped by **domain, not origin**. A cookie set with
  `Domain=.nivelatolabs.com` is sent to every subdomain of
  nivelatolabs.com, on navigations and (with credentials mode) on
  fetches. "Third-party cookie" rules engage only when the cookie's
  site differs from the top-level page's site. That never happens
  between Nivelato subdomains.

This is not theoretical: the `nivelato-login-lang` domain cookie
already does exactly this in production today (written on the login
origin, read by geo-blocked.html on other subdomains). The design
changes the cookie's contents and durability, not its reach.

### 3.2 SameSite=Lax in Nivelato's actual traffic

- Inter-subdomain navigation (login → dashboard, app → login
  sign-out, every `?next=` return): same-site, top-level. The cookie
  is sent under any SameSite value, including Strict. Lax is not even
  being exercised here.
- Same-origin fetches to `/__session/*`: same-origin; cookies attach
  by default in modern fetch. Unaffected by SameSite.
- Where Lax actually earns its keep: a link into a Nivelato subdomain
  from a genuinely external site (an email client, a search result)
  is a cross-site top-level GET navigation, and Lax still sends the
  cookie, so a signed-in user arriving from email lands signed in.
  Lax withholds the cookie from cross-site POSTs and subresource
  loads, which no Nivelato flow uses inbound.
- Why not SameSite=None: None exists to make a cookie available in
  cross-site contexts (embeds, third-party widgets). Nivelato has no
  such consumer, and None would opt the session cookie into the
  third-party regime that browsers are actively dismantling, for
  zero benefit.

### 3.3 Safari / ITP

ITP's famous caps target two things:

- **Script-written cookies** (set via document.cookie) are capped at
  7 days, and at 24 hours in some link-decoration cases. The existing
  language cookie is in this class: its written Max-Age is one year,
  its Safari reality is a week.
- **Cookies from domains classified as trackers**, and storage purge
  after long periods without first-party interaction.

A server-set, HttpOnly cookie delivered in a Set-Cookie response
header during a first-party interaction is in neither blast radius:
it is not subject to the 7-day script cap, and nivelatolabs.com is a
site the user actively visits and signs in on, not a cross-site
tracker. This is the concrete reason the design insists on
server-set cookies via worker routes instead of a cheaper
"login.html writes the token with document.cookie" hack: the cheap
version inherits the 7-day cap and dies quietly in
...[truncated 8844 chars]