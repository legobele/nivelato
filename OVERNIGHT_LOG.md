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
