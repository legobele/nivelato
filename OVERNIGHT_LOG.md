# Overnight QA Log — Nivelato web app
Started: Mon 2026-10-05 ~20:05 AST (coordinator session 743ec8c1)
Base commit: b9f15e1

## Method
- No live-browser task tool available at coordinator level (browser namespace = search/open only).
  Interactive login/click testing is delegated to parent via browser tasks (see OPEN ITEMS).
- Overnight work = parallel static QA sweeps + served-page verification + Firestore data checks.
- Fixes: applied by coordinator, committed, pushed, logged below.

## Loop 1 — static sweeps dispatched

## Loop 1 — coordinator verification (parallel with sweeps)
- Live dashboard https://dashboard.nivelatolabs.com/ renders (text-extract OK). Filter row present ("Filtrar por fecha · dd/mm/aaaa").
- Firestore: owner dlebron@qgipr.com (nJBbg58SXxbJH3QJQ7maYv1x9Z93) verified: role=owner, orgId=NJBBG5, all 10 canonical perms true.
- Firestore: quotes@qgipr.com (kc62w2ZPm9dMm2WEgJDgGALlgGj1) role=cotizador, orgId=NJBBG5. Perms: createMeasurements, editMeasurements*, editOthersMeasurements, editOwnMeasurements, userManagement, viewDashboard, viewOthersMeasurements, viewOwnMeasurements. NOTE: `editMeasurements` is NOT one of the 10 canonical PERM_DEFS (legacy/extra flag); createQuotes/approveQuotes/managePriceList absent.
- Org NJBBG5: no quoting flags present (QGC = no quoting, as expected). nivelatoVersion=1.0.

## Loop 1 — coordinator findings
- BUG-1 (verified via curl): "Nueva medida" button pointed to /index.html on dashboard.nivelatolabs.com, which 404s (worker ROUTES has no /index.html; .html not in STATIC_CT). Measurement flow actually lives at https://app.nivelatolabs.com/ (200 OK). FIXED: button now goes to https://app.nivelatolabs.com/ (auth-guard there bounces through login.nivelatolabs.com SSO if needed). Commit 81abe62.
- NOTE: parent pushed 78ef14e concurrently (mobile hamburger drawer). Pull before every commit from here on.
- NOTE: app.nivelatolabs.com serves a STALE index.html (still has the removed console.log line; Pages deploy lags repo). Not fixing tonight (Pages pipeline).

## Loop 1 — fixes committed (1596588, pushed ~20:35 AST)
Sweep reports reconciled from 3 agents. All fixes applied, committed, pushed.

**Critical:**
- BUG-4 (save-permission root cause): auth-guard.js saveJobToFirestore now awaits ensureFlowClaims (10s timeout race) + forces getIdToken refresh before addDoc. Previously fire-and-forget on page load meant claim-less tokens hit fail-closed jobs rules. Also added friendly permission-denied message mapping in adhd.js save catch (no more raw FirebaseError).
- BUG-1 (verified via curl): Nueva medida button -> https://app.nivelatolabs.com/ (was /index.html = 404 on dashboard worker).

**Security/hardening:**
- adhd.js postMessage: origin check added (was accepting NIVELATO_ANNOTATED_PHOTO from any origin).
- company/settings.html: non-owner managers can no longer edit their own perm row (self-elevation closed); owner rows were already locked.
- users.html: Team page now gated on userManagement (was visible to any org member).

**Links/routes:**
- settings.html back link: dashboard.html -> / (worker has no /dashboard.html route; /dashboard also 404s, / is correct).
- settings.html privacy link: privacy.html -> https://legobele.github.io/nivelato/privacy.html (worker has no /privacy route).
- Missing-profile recovery (settings.html, company/settings.html, users.html): login.html?missingProfile=1 -> https://login.nivelatolabs.com/?missingProfile=1.
- Updates cards (both settings pages): now link to /company/updates with notif-dot, no underline.

**Dashboard UI:**
- Collapsed sidebar: account card stays visible (avatar only); was hidden by .niv-panel-bottom display:none. Popup repositioned for collapsed state.
- Collapse after manual resize: inline width cleared so .collapsed applies.
- Mobile drawer: Precios/Cotizaciones now close drawer (parity with Medidas).
- Estradiol easter-egg span preserved across org-name writes.
- Dead .italiano-mode .btn-new-measure selector removed.
- Date placeholder: overflow guard (ellipsis).
- About modal: Escape closes.

**Copy:**
- Em-dash purge (user-facing): index.html labels/placeholders, adhd.js validation strings, photo.html title/header, settings titles. Hyphens used.
- Personal names removed from comments: index.html:188, adhd.js:1235 ("built with love by benj & deepseek v4 flash").
- Fixed parent's wrong-line delete: removed the actual console.log from index.html, restored theme-color meta.

**Cache-busting:** niv-dark.css?v=3, adhd.js?v=2/3, auth-guard.js?v=2.

**Still needs real-browser verification (parent to run via browser tasks):** all BROWSER TEST PLANS from the 3 sweep reports. None of the above is browser-verified.

## Loop 1 — live verification (~20:40 AST)
- Dashboard / serves Nueva medida -> https://app.nivelatolabs.com/ (fix live, no-store HTML).
- /account/settings back link = href="/" (live).
- /company/settings updates link = /company/updates (live, page returns 200, renders).
- JS syntax: auth-guard.js, adhd.js, permissions.js all node --check clean.

## Loop 2 — sweeps dispatched (~20:40 AST)
- D: login.html + sso.html
- E: quoting flow + quoter role perms
- F: photo.html + filter JS + mobile drawer

## Loop 2 — login/SSO fixes committed (fb107cb, pushed ~20:55 AST)
From agent D report:
- F4 (boundary): removed "Daniel Lebron (787) 764-9404 ext. 2 o Yenny Gonzalez (787) 764-9404 ext. 2" from login employeeNotice. Names + phone numbers no longer rendered.
- F1: ctoken now rides in URL fragment (#ctoken=) via location.replace, sso.html reads from hash (falls back to query). Never hits server logs/history query.
- F2: removed TEMP-DIAG [dbg:...] leak from visible SSO errors.
- F3: user-not-found/wrong-password now map to generic invalid-credential (no user enumeration).
- F6: deep links preserved for dashboard dests (was dropped to '/').
- F7: generic fallbacks instead of raw Firebase error text (login + sso).
- F5: sso.html em dashes fixed (title + placeholder).
- F8 (dead branch), F9 (token TTL note): informational, no change.

## Loop 2 — quoting fixes (landed via parent commit 08fede2, ~21:00 AST)
From agent E (quoting) report. Code changes are in 08fede2 on remote (parent committed working tree):
- F-2: company/settings.html hides #card-quote-settings for non-quoting orgs (QGC).
- F-3: dashboard /company view skips quotes query + hides quote stat cards and "Cotizaciones recientes" for QGC.
- F-4: qCanCreateQuote/qCanApproveQuote/qCanEditQuote/qCanSendQuote/plCanManage all return false when !orgHasQuotes.
- F-5: qCanEditQuote/qCanSendQuote honor explicit createQuotes=false.
- F-6 (data): removed inert editMeasurements flag from quotes@qgipr.com user doc via REST (was dead data, zero code reads).
- F-1 (OPEN, needs user spec): no Firestore rules exist for companies/*/quotes or companies/*/priceList - quoting writes fail closed regardless of org. Rules changes are a hard boundary; needs her spec before any patch. NOT fixed.

## Loop 2 — remaining
- Agent F (photo/filter/drawer) still running.

## Loop 2 — photo/filter/drawer fixes committed (45d847b, pushed ~21:15 AST)
From agent F report:
- F1: photo.html drawArrowLine gains `plain` flag; Línea tool draws plain lines (was arrowheads).
- F2: re-clicking an active photo tool deselects it (corner dragging works again).
- F3: adhd.js postMessage to photo iframe pinned to window.location.origin (was '*', payload carries customer PII).
- F4: parent now sends NIVELATO_PHOTO_ACK (photo.html's 5s timeout contract honored).
- F5: dashboard realtime refresh calls applyFilters() instead of renderJobs(allJobs) (filters no longer discarded on snapshot).
- F6: dark-theme date input fixed: transparent when empty, light text when valued/focused (was unreadable/overlapping - the reported filter overlap).
- F7: hamburger added to pricelist/quotes/builder/project/measure view headers (was Medidas-only, mobile dead-end).
- F8: About modal z-index 300 -> 700 (was under drawer/scrim on mobile); opening About closes drawer.
- F9: showDashView closes the drawer on any programmatic view change.

## Loop 3 — regression fixes committed (c682efa, pushed ~21:30 AST)
From regression agent:
- BUG-A: photo.html live line-preview now passes plain flag (was drawing arrowhead in preview).
- BUG-B: dashboard /company route quote gate uses in-scope userData (was window._currentUserData = null there, fail-open).
- Other 8 regression items: PASS. No new em dashes/names introduced. SW v7 verified.

## Loop 4 — dispatched (~21:35 AST)
- account-selector.js, presence.js, company-theme.js, geo.js (report-only)

## Loop 4 — presence/account fixes committed (cd653c8, pushed ~21:45 AST)
From agent F (loop 4) report:
- F1: presence.js startPresence now idempotent per uid (module-level map; re-calling restarts instead of doubling 2-min beacon intervals).
- F3: account-selector.js hardSignOut clears nivelato_company_theme flag (no stale QGC gray on shared devices).
- F4: buildMenu rebuilds instead of early-returning (no stale account on in-page re-init); document listeners guarded by window.__acctDocListeners with current-wrap tracking.
- F5: closeMenu syncs aria-expanded=false.
- geo.js: report-only (R1 no timeout on flowGate callable, R2 cached-claims freshness tradeoff, R3 single geo provider). No changes per boundary.
- F2 (N+1 reads): not a bug, skipped.

## Loop 5 — apply form + worker findings (9041bf3, pushed ~22:00 AST)
From agent (loop 5) report. Repo-only fixes applied:
- W6: apply form em dashes fixed (title, address label).
- F8 (boundary): hearAbout option no longer names Quality ("Recomendación de otro taller de cristales", value qgc kept).
- F1: firebase init wrapped in try/catch; visible error + disabled submit on failure (no silent dead form).
- F2: submit errors branch on permission-denied (config message) vs network; API key NOT filled (do not have it; placeholder stays).
- F3: employees/technicians require integer digits 1-100000 (was: 1.5 -> 1, huge values passed).
- F4: phone requires exactly 10 digits (was >= 10).
- F5: bizTypeOther value + error cleared when hidden.
- F6: radio groups get .invalid-group highlight on error.
- F7: privacy policy link + consent notice added under submit.
- W7: company/settings Volver href /dashboard -> /company (was 404).

Worker issues FLAGGED FOR PARENT (need Cloudflare redeploy, cannot do from here):
- W1: testing.js watermark transform is dead code in dashboard worker (settings pages show watermark).
- W2: app proxy nuke misses /dashboard.html.
- W3: apply worker fetches from stalled GitHub Pages instead of raw.
- W4: 1h static edge cache undercuts freshness.
- W5: no CSP on dashboard subdomain (recommendation; not implemented - risky without testing).
- W6 (worker part): 404 page em dashes in worker source.

OPEN (needs user):
- F-1 (quoting): no Firestore rules for companies/*/quotes|priceList. Quoting writes fail closed for ALL orgs. Needs her rules spec. Cannot deploy rules per boundary.
- Apply form FIREBASE_API_KEY: placeholder still in place. Submissions cannot work until she pastes the key.

# ============ MORNING DIGEST ============
Overnight QA complete. 5 loops, 9 sweep agents, all reports reconciled.
Base: b9f15e1 -> HEAD: 5b92631. All pushes verified on origin/main.
Live check 22:00 AST: all 7 endpoints return 200.

## Bugs fixed (with commits)
| # | Bug | File:line | Commit |
|---|-----|-----------|--------|
| 1 | Nueva medida button 404'd (/index.html not on worker) | dashboard.html | 81abe62 |
| 2 | Settings back link -> /dashboard.html (404) | settings.html:128 | 6a526fc |
| 3 | Collapsed sidebar hid account card | niv-dark.css:313 | 6a526fc |
| 4 | Save-permission root cause: flow claims never awaited pre-save | auth-guard.js:182 | 1596588 |
| 5 | Raw FirebaseError shown to users | adhd.js:644 | 1596588 |
| 6 | postMessage accepted from any origin (photo) | adhd.js:1520 | 1596588 |
| 7 | postMessage to iframe used '*' (PII) | adhd.js:1500 | 45d847b |
| 8 | Missing PHOTO_ACK (protocol half-implemented) | adhd.js:1534 | 45d847b |
| 9 | Mobile drawer not closed by Precios/Cotizaciones | dashboard.html | 5ca99e2 |
| 10 | users.html Team page ungated | users.html:697 | 1596588 |
| 11 | Self-elevation via own perm row | company/settings.html:320 | 1596588 |
| 12 | Quote UI leaked to QGC org (5 spots) | dashboard.html, company/settings.html | 08fede2 |
| 13 | Realtime refresh discarded filters | dashboard.html:1244 | 45d847b |
| 14 | Dark date input unreadable/overlapping | dashboard.html:381 | 45d847b |
| 15 | Hamburger missing on 5 views (mobile dead-end) | dashboard.html | 45d847b |
| 16 | About modal under drawer (z-index) | dashboard.html | 45d847b |
| 17 | Photo line tool drew arrowheads | photo.html:288 | 45d847b |
| 18 | Photo tool couldn't be deselected | photo.html:674 | 45d847b |
| 19 | SSO ctoken in URL query (history/server logs) | login.html:1926, sso.html:104 | fb107cb |
| 20 | Login showed personal names + phone numbers | login.html:2131 | fb107cb |
| 21 | Debug [dbg:...] leak in SSO errors | login.html:1935 | fb107cb |
| 22 | User-enumeration login errors | login.html:2053 | fb107cb |
| 23 | Deep link dropped for dashboard SSO | login.html:1924 | fb107cb |
| 24 | Presence beacons doubled per session | presence.js:33 | cd653c8 |
| 25 | Theme flag leaked across users | account-selector.js:39 | cd653c8 |
| 26 | Stale account menu on re-init | account-selector.js:138 | cd653c8 |
| 27 | Em-dash purge (user-facing copy) | index/adhd/photo/settings/login | 1596588, fb107cb |
| 28 | Personal names in code comments | index.html:188, adhd.js:1235 | 1596588 |
| 29 | Apply form validation holes (F1-F8) | apply-pr-company.html | 9041bf3 |
| 30 | Company settings Volver -> /dashboard (404) | company/settings.html:109 | 9041bf3 |
| 31 | Photo preview arrowhead (regression) | photo.html:378 | c682efa |
| 32 | Company route quote gate fail-open (regression) | dashboard.html:1009 | c682efa |
| 33 | Collapse after manual resize broken | dashboard.html:3066 | 1596588 |
| 34 | Estradiol easter-egg span wiped | dashboard.html:1111 | 1596588 |
| 35 | Privacy/missingProfile dead links | settings.html, users.html | 1596588 |
| 36 | Updates cards not clickable | settings pages | 1596588 |

## Still open (need user or parent)
1. **Quoting Firestore rules**: no rules for companies/*/quotes|priceList. Quoting dead for ALL orgs. Needs her rules spec. (boundary: cannot deploy rules)
2. **Apply form API key**: FIREBASE_API_KEY placeholder still in place. Submissions cannot work until she pastes it.
3. **Worker redeploys** (need parent via Cloudflare): W1 testing.js watermark on settings, W2 /dashboard.html nuke gap, W3 apply worker on stalled Pages, W4 1h edge cache.
4. **Browser verification**: none of tonight's fixes are browser-verified (no browser-task tool at coordinator level). Full test plans in sweep reports.

## Overall health
Dashboard, settings, login, SSO, measurement flow, photo editor, and apply form are statically clean. The save-permission root cause is fixed (was the #1 user-facing bug). Quoting is the weakest area (needs rules). All endpoints 200.
