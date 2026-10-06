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
