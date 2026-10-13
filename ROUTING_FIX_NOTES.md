# Routing fix notes (QA swarm wave 2, lane W2)

Status: in-repo fixes landed on branch fix/w2-routing. Worker changes
listed below are still required for full production effect. They are
written here because the three workers that front the app, login, and
dashboard hosts live outside this repo (see SSO_COOKIE_MIGRATION.md,
section 1.6) and cannot be edited from a repo commit.

## How hosting actually works for this repo

1. GitHub Pages deploys the whole repo (.github/workflows/static.yml).
   Pages serves file paths, extensionless .html paths (for example
   /updates for updates.html, /company/settings for
   company/settings.html), and directory index.html files.
2. Three Cloudflare Workers, maintained outside this repo and deployed
   through the Cloudflare API, front the production hosts:
   nivelato-app-proxy (app.nivelatolabs.com), nivelato-login
   (login.nivelatolabs.com), and nivelato-dashboard
   (dashboard.nivelatolabs.com). They intercept some paths, apply the
   geo availability block (HTTP 451), answer other paths with a bare
   plain text 404, and fall through to a stale legacy index.html (the
   "Paso 1 de 8" wizard, console banner "nivelato v1.0.0, commit
   68fe412") for clean routes they do not map.
3. The workers in this repo under workers/ only front the beta,
   testing, debug, remote, and support subdomains. Their pattern is the
   house pattern: an explicit ROUTES table mapping clean URLs to repo
   files fetched from GitHub raw, with response headers rebuilt from
   scratch (never pass raw.githubusercontent.com headers through: raw
   serves everything as text/plain).

## B2: clean URL settings and updates routes

In-repo fix (directory index stubs, following the ayuda.html redirect
stub convention: meta refresh plus location.replace, query string and
hash preserved):

| Clean URL | Stub file | Redirect target |
| --- | --- | --- |
| /account/settings | account/settings/index.html | /settings.html |
| /company/updates | company/updates/index.html | /updates.html |
| /settings | settings/index.html | /settings.html |
| /company (m11 fallback) | company/index.html | /dashboard.html |

/settings.html is the deliberate target for both settings stubs:
nav-referrer.js already carries a /settings.html alias entry with the
same storage key and allowlist as /account/settings, so the referrer
aware Back button runs on arrival. /updates and /updates.html already
worked and are unchanged.

Verified split between hosts (production curl, 3 tries each, bodies
hashed): dashboard.nivelatolabs.com already serves both routes
correctly (/account/settings returned settings.html 3/3, /company/updates
returned updates.html 3/3), so nivelato-dashboard needs no change for
B2. app.nivelatolabs.com served the legacy wizard for both routes on
every non geo-blocked try. The worker changes below are therefore
nivelato-app-proxy only:

Worker changes still required (nivelato-app-proxy):

1. Add explicit routes before any fallback or 404 handling:
   "/account/settings" and "/settings" and "/settings.html" serve
   settings.html with content type text/html; "/company/updates"
   serves updates.html with content type text/html. Serving the stub
   files above for the two clean routes is an acceptable equivalent.
2. Remove the explicit bare 404 for /settings (and /settings.html)
   recorded in SSO_COOKIE_MIGRATION.md section 1.6. That intercept
   fires before the origin, so no repo file can fix /settings on
   app.nivelatolabs.com until it is gone.
3. Stop falling through to the legacy index.html wizard for unmapped
   clean routes under /account/ and /company/. An honest 404 is better
   than the wizard; the routes in item 1 are better than both.
4. Known leftover, not part of B2: nav-referrer.js has no /updates.html
   entry (finding m10), so Back from the updates page still falls back
   to the dashboard home. The /company/updates entry exists and works
   once the worker maps that route directly to updates.html.

## M38: login.nivelatolabs.com/company/qgc served as text/plain

No in-repo fix exists. login.html already implements the deep link: it
matches location.pathname against /^\/company\/([A-Za-z0-9_-]+)\/?$/
(login.html, deep link init) and opens that company sign in screen.
The page never executes because nivelato-login serves the response
with "content-type: text/plain; charset=utf-8" and status 200, for any
company id. A repo stub under company/qgc/ would never be reached: the
login worker intercepts /company/* on that host before the origin,
and login.html has no query parameter form of the deep link to
redirect to.

Worker change required (nivelato-login only): when the /company/<id>
route serves login.html, rebuild the response headers the way the
in-repo workers do (workers/nivelato-support.js is the reference):
set "content-type: text/html; charset=utf-8" and
"cache-control: no-store" for HTML, and do not forward the upstream
raw.githubusercontent.com content type. The likely root cause is a
content type lookup keyed on the request path: /company/qgc has no
file extension, so the lookup misses and defaults to text/plain,
while / and /login.html hit the .html case.

## m11: dashboard console 404s for /company and the users embed

The failing fetch does not live in editable code on this branch:

1. "Error cargando usuarios embebidos:
   https://app.nivelatolabs.com/company/users?embed=users" (x2 to 3 per
   load). That exact log string does not exist anywhere in repo main.
   The closest and only matching call site in dashboard.html is the
   users embed iframe: ADMIN_URL = '/company/users?embed=users'
   (dashboard.html, users embed IIFE, constant ADMIN_URL, around line
   4441 at commit e81d00c), assigned to iframe#users-embed-frame via
   setMode() in the same IIFE, reached through window._ensureUsersFrame
   and window._openUsersAdmin. Coordinator: give this call site to the
   dashboard agent. If production logging carries that string, the
   production dashboard build differs from repo main, which also
   explains item 2.
2. Three 404s for https://app.nivelatolabs.com/company on a normal
   dashboard load. No fetch, iframe, or navigation to bare /company
   exists in repo main. The only consumer of the route is the
   window.NIVELATO_ROUTE === 'company' branch in dashboard.html
   (initCompanyView, around line 1655 at commit e81d00c), which runs
   only when the worker serves dashboard.html at /company and injects
   that variable.
3. Routing half fixed in-repo: company/index.html (see the B2 table)
   gives bare /company a 200 redirect stub wherever the origin is
   consulted, and /company/users already resolves at the origin to
   company/users.html. On the app host both paths still depend on the
   worker edits in the B2 section: the app worker must map /company to
   dashboard.html with the NIVELATO_ROUTE injection (as the dashboard
   worker is documented to do) and /company/users to
   company/users.html, instead of 404ing them.

## p1: favicon and touch icons

Fixed in-repo at the repo root, derived from the existing branded
icon-512.png (opaque, theme color #1a1a2e):

1. favicon.ico: multi size ICO (16, 32, 48). Browsers request
   /favicon.ico by default on every host, so this alone clears the
   app wide 404.
2. apple-touch-icon.png and apple-touch-icon-precomposed.png: 180x180
   PNG, the default iOS request paths.
3. settings.html and updates.html now declare rel="icon" and
   rel="apple-touch-icon" links next to the manifest link.

Not done here, one line for the dashboard agent: dashboard.html still
declares no rel="icon" link. The root favicon.ico covers the browser
default request and the tab icon, but adding
<link rel="icon" href="/favicon.ico" /> beside its manifest link
(dashboard.html, around line 12 at commit e81d00c) makes it explicit.

Worker note: none needed. Production already proxies extensioned root
assets (favicon.ico and apple-touch-icon.png returned Pages style 404
responses before this fix, not worker text/plain 404s), so the new
root files will be served as soon as the Pages deploy lands.
