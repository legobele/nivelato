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
