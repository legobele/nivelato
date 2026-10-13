/* niv-envmark.js - environment marking system for sign-in surfaces
 * (Giulia's boards, Oct 12 2026).
 *
 * Four pieces, all driven by the device-level environment mark:
 *
 * 1. Hidden PRODUCTION-env toggle on sign-in cards. A footer hint lives
 *    at the BOTTOM-LEFT of every inner sign-in card (login, add-another-
 *    account, join-company/company sign-in), VISIBLE ONLY after the
 *    browser presses CTRL+ALT+D (reveal chord). Hidden by default.
 *    Verbatim hint: "Press CTRL+ALT+B to TOGGLE marking account being
 *    signed into & device as a PRODUCTION env".
 * 2. CTRL+ALT+B chord ladder: unset -> prod -> dev -> unset.
 *    When setting prod it also marks the account being signed into: the
 *    account is not authed yet at chord time, so the mark is keyed by the
 *    email typed into the card's email field. Setting dev records the
 *    pending beta intent (see the beta cascade note below).
 * 3. Dev-flag interstitial: when a dev flag is detected, a FULL-SCREEN
 *    solid red interstitial pops up: "DEV ENVIRONMENT DETECTED!!!!" /
 *    "See support.nivelatolabs.com/dev for info and guidance". The
 *    interstitial renders on pages that opt in (data-envmark-interstitial
 *    on <body>). Ctrl+Alt+B clears the dev flag, which dismisses it.
 * 4. Dev flag at sign-in: an ADDITIONAL STEP modal over the sign-in page
 *    when a submit happens with the dev flag active. Ctrl+Alt+B turns the
 *    flag off; Ctrl+Alt+Shift+B dismisses the modal only. Continue is RED
 *    (proceeding is the dangerous action); Cancel is the safe default.
 *
 * Storage (all through NivSettings domain cookies, the single settings
 * system; localStorage mirrors are kept by niv-settings.js itself):
 *   'niv-env-mark'     'prod' | 'dev' | unset
 *   'niv-env-accounts' JSON array of emails marked production
 * A ?env=dev|prod|none query param sets the mark transiently (the test
 * path for the alarm state); the script persists it to the cookie.
 *
 * Rail warning cards (flow rail, under the sections, above the user chip):
 * - DEV card (red): verbatim alarm text + support link, while dev active.
 * - BETA card (black): verbatim "You are on a beta version..." while the
 *   channel resolves to beta. Both rendered by renderRailCards().
 *
 * Beta cascade (Giulia, Oct 12 2026): "activate the beta flag" = the chord
 * must flip the beta channel as part of the dev mark, not just set a label.
 * - Setting the DEV mark ALSO enables the beta update channel at USER level:
 *   the account being marked gets beta versions. Recorded pre-auth as a
 *   pending intent ('niv-env-pending-beta': { email, companyId, companyName,
 *   companyBetaYes }), because the sign-in page has no auth yet.
 * - On company sign-in (QGC mode / company-account sign-in), setting the dev
 *   mark additionally PROMPTS whether to enable beta at COMPANY level. The
 *   org's channel changes only on an explicit Yes, and only after sign-in.
 * - Application happens post-auth (login.html's postAuthRedirect calls
 *   NivEnvMark.getPendingBeta() / clearPendingBeta()): users/{uid} gets
 *   { betaEnrolled: true, betaEnrolledAt, betaChannel: 'beta' }; on a
 *   confirmed company opt-in the org is enrolled in beta and the
 *   setOrgUpdateChannel callable adopts the beta channel. All best-effort,
 *   never blocks sign-in. Email must match the signed-in account or the
 *   intent is dropped (ambiguity = no write).
 * - The mark itself remains an alarm, never an authorization fact: no
 *   server-side gate may trust it.
 *
 * Version-routing rule (recorded Oct 12): signed-out surfaces resolve
 * LATEST, signed-in surfaces resolve channel. resolveLatestVersion() is
 * the resolver signed-out surfaces must use; today no signed-out surface
 * displays a version, so nothing is repointed yet. "Latest" =
 * app_updates/beta-latest, the newest shipped projection.
 *
 * Classic script, no modules, no build step. Include AFTER niv-settings.js:
 *   <script src="/niv-settings.js"></script>
 *   <script src="/niv-envmark.js"></script>
 * Card participation: any element with [data-envmark-card] gets the
 * footer. Submit interception: any form inside a [data-envmark-card],
 * plus buttons listed in window.NivEnvMarkConfig.signinButtons. Pages
 * whose forms are not sign-ins (e.g. the company application page) set
 * window.NivEnvMarkConfig = { interceptSubmits: false } to get the
 * footer + chords without the dev sign-in modal.
 * Interstitial: <body data-envmark-interstitial>.
 * It never throws, on any host, in any storage mode.
 */
(function () {
  'use strict';
  if (window.NivEnvMark) return;

  var MARK_KEY = 'niv-env-mark';
  var ACCT_KEY = 'niv-env-accounts';
  var REVEAL_KEY = 'niv-envmark-revealed';
  var DEV_URL = 'https://support.nivelatolabs.com/dev';

  /* ---------------------------------------------------------------- */
  /* storage                                                           */
  /* ---------------------------------------------------------------- */
  function lsGet(k) {
    try { var v = window.localStorage.getItem(k); return v === null ? null : v; }
    catch (_) { return null; }
  }
  function lsSet(k, v) {
    try { window.localStorage.setItem(k, v); } catch (_) { /* ignore */ }
  }
  function isMark(v) { return v === 'prod' || v === 'dev'; }

  function getMark() {
    try {
      if (window.NivSettings && window.NivSettings.get) {
        var v = window.NivSettings.get(MARK_KEY);
        if (isMark(v)) return v;
      }
    } catch (_) { /* fall through to mirror */ }
    var l = lsGet(MARK_KEY);
    return isMark(l) ? l : '';
  }
  function setMark(v) {
    if (v !== '' && !isMark(v)) return false;
    var ok = false;
    try {
      if (window.NivSettings && window.NivSettings.set) {
        if (v === '') ok = window.NivSettings.remove ? !!window.NivSettings.remove(MARK_KEY) : false;
        else ok = !!window.NivSettings.set(MARK_KEY, v);
      }
    } catch (_) { ok = false; }
    try { if (v === '') window.localStorage.removeItem(MARK_KEY); else lsSet(MARK_KEY, v); } catch (_) { /* ignore */ }
    if (v === 'dev') {
      /* Beta cascade: the dev mark flips the beta channel for the account
       * being marked (recorded pre-auth; applied post-auth). On a company
       * card it also offers the company-wide opt-in prompt. */
      recordPendingBeta();
    } else if (v === '') {
      /* Mark cleared before sign-in: the pending intent dies with it. */
      clearPendingBeta();
      betaPromptedKey = null;
      dismissBetaPrompt();
    }
    emitChange();
    refreshAll();
    if (v === 'dev') maybePromptCompanyBeta();
    return ok;
  }
  function getAccounts() {
    var raw = null;
    try { if (window.NivSettings && window.NivSettings.get) raw = window.NivSettings.get(ACCT_KEY); } catch (_) { /* ignore */ }
    if (!raw) raw = lsGet(ACCT_KEY);
    if (!raw) return [];
    try {
      var a = JSON.parse(raw);
      return Array.isArray(a) ? a.filter(function (e) { return typeof e === 'string'; }) : [];
    } catch (_) { return []; }
  }
  function setAccounts(list) {
    list = list.slice(0, 60);
    while (list.length > 1 && JSON.stringify(list).length > 2900) list.shift();
    var json = JSON.stringify(list);
    var ok = false;
    try { if (window.NivSettings && window.NivSettings.set) ok = !!window.NivSettings.set(ACCT_KEY, json); } catch (_) { ok = false; }
    lsSet(ACCT_KEY, json);
    return ok;
  }
  function addAccount(email) {
    email = String(email || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 1) return false;
    var list = getAccounts();
    if (list.indexOf(email) >= 0) return true;
    list.push(email);
    return setAccounts(list);
  }
  function isDev() { return getMark() === 'dev'; }
  function isProd() { return getMark() === 'prod'; }

  /* ---------------------------------------------------------------- */
  /* beta cascade: pending intent (pre-auth) + company prompt          */
  /* ---------------------------------------------------------------- */
  /* The chord fires on a signed-out page: no auth, no Firestore write
   * is possible. So the cascade records a PENDING intent keyed by the
   * account being signed into; login.html applies it post-auth. */
  var BETA_PENDING_KEY = 'niv-env-pending-beta';
  function getPendingBeta() {
    var raw = null;
    try { if (window.NivSettings && window.NivSettings.get) raw = window.NivSettings.get(BETA_PENDING_KEY); } catch (_) { /* ignore */ }
    if (!raw) raw = lsGet(BETA_PENDING_KEY);
    if (!raw) return null;
    try { var o = JSON.parse(raw); return (o && typeof o === 'object') ? o : null; } catch (_) { return null; }
  }
  function setPendingBeta(p) {
    var json = '';
    try { json = JSON.stringify(p || {}); } catch (_) { json = '{}'; }
    try { if (window.NivSettings && window.NivSettings.set) window.NivSettings.set(BETA_PENDING_KEY, json); } catch (_) { /* ignore */ }
    lsSet(BETA_PENDING_KEY, json);
  }
  function clearPendingBeta() {
    try { if (window.NivSettings && window.NivSettings.remove) window.NivSettings.remove(BETA_PENDING_KEY); } catch (_) { /* ignore */ }
    try { window.localStorage.removeItem(BETA_PENDING_KEY); } catch (_) { /* ignore */ }
  }
  function visibleCard() {
    try {
      var cards = document.querySelectorAll('[data-envmark-card]');
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].offsetParent !== null) return cards[i];
      }
    } catch (_) { /* ignore */ }
    return null;
  }
  /* Company-account sign-in card: the branded QGC-mode surface. Carries
   * data-company-id (login.html renders it). */
  function visibleCompanyCard() {
    try {
      var cards = document.querySelectorAll('.company-single[data-envmark-card]');
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].offsetParent !== null) return cards[i];
      }
    } catch (_) { /* ignore */ }
    return null;
  }
  function cardEmail(card) {
    try {
      var em = card.querySelector('input[type="email"]');
      if (em && em.value && String(em.value).trim()) return String(em.value).trim().toLowerCase();
    } catch (_) { /* ignore */ }
    return '';
  }
  function cardCompanyInfo(card) {
    var id = '', name = '';
    try { id = card.getAttribute('data-company-id') || ''; } catch (_) { /* ignore */ }
    try { var t = card.querySelector('.company-title'); if (t && t.textContent.trim()) name = t.textContent.trim(); } catch (_) { /* ignore */ }
    if (!name) { try { var a = card.querySelector('.account-name'); if (a && a.textContent.trim()) name = a.textContent.trim(); } catch (_) { /* ignore */ } }
    return { id: id, name: name || id };
  }
  function recordPendingBeta() {
    var card = visibleCard();
    var company = visibleCompanyCard();
    var info = company ? cardCompanyInfo(company) : { id: '', name: '' };
    setPendingBeta({
      email: card ? cardEmail(card) : '',
      companyId: info.id,
      companyName: info.name,
      companyBetaYes: null, /* answered by the company prompt, below */
      at: Date.now()
    });
  }

  var changeListeners = [];
  function onChange(cb) { if (typeof cb === 'function') changeListeners.push(cb); }
  function emitChange() {
    for (var i = 0; i < changeListeners.length; i++) {
      try { changeListeners[i](getMark()); } catch (_) { /* ignore */ }
    }
    try { document.dispatchEvent(new CustomEvent('niv-envmark-change', { detail: getMark() })); } catch (_) { /* ignore */ }
  }

  /* ---------------------------------------------------------------- */
  /* language: own dict, page-language resolution                     */
  /* ---------------------------------------------------------------- */
  var STR = {
    es: {
      footerHint: 'Presiona CTRL+ALT+B para MARCAR o DESMARCAR la cuenta a la que entras y este dispositivo como un entorno de PRODUCCIÓN',
      modalTitle: 'Paso adicional de inicio de sesión',
      modalSub: 'Sigue las instrucciones de la página de abajo.',
      modalWarn: 'ADVERTENCIA!!!!!!! Estás iniciando sesión con una marca de entorno DEV activa. Esto significa que ciertas restricciones de acciones serán levantadas, como las restricciones de permisos. Usar un entorno dev aumenta fuertemente tu riesgo de pérdida de datos.',
      modalInstr: 'Presiona CTRL+ALT+B para desactivar esta marca, o CTRL+ALT+SHIFT+B para descartar.',
      modalPrompt: '¿Seguro que quieres iniciar sesión?',
      modalGo: 'Continuar',
      modalCancel: 'Cancelar',
      betaPromptTitle: '¿Activar la beta para toda la empresa?',
      betaPromptBody: 'Marcaste DEV en el inicio de sesión de {company}. Esto activa el canal beta de actualizaciones para tu cuenta cuando inicies sesión. ¿Activarlo también para toda la empresa? El canal de la empresa solo cambia si eliges Sí, y solo después de iniciar sesión con una cuenta que pueda administrar la empresa.',
      betaPromptYes: 'Sí, activar la beta para la empresa',
      betaPromptNo: 'No, solo mi cuenta',
      devTitle: 'DEV ENVIRONMENT DETECTED!!!!',
      devSub: 'Ver support.nivelatolabs.com/dev para información y ayuda',
      devExit: 'Presiona CTRL+ALT+B para desactivar esta marca y cerrar esta pantalla.',
      prodState: 'Marca actual: entorno de PRODUCCIÓN',
      betaTitle: 'ADVERTENCIA!!!',
      betaBody: 'Estás en una versión beta de Nivelato. NO USES ESTA VERSIÓN EN UN ENTORNO PROD!!!!!!!!!!!!!!! ESPERA PÉRDIDA DE DATOS O PROBLEMAS'
    },
    en: {
      footerHint: 'Press CTRL+ALT+B to TOGGLE marking account being signed into & device as a PRODUCTION env',
      modalTitle: 'Additional sign-in step',
      modalSub: 'Follow the instructions on the page below.',
      modalWarn: 'WARNING!!!!!!! You are signing in with a DEV ENVIRONMENT FLAG active. This means certain restrictions on actions will be lifted, such as permission restrictions. Using a dev environment heavily increases your risk of data loss.',
      modalInstr: 'Press CTRL+ALT+B to turn off this flag, or CTRL+ALT+SHIFT+B to dismiss.',
      modalPrompt: 'Are you sure you would like to sign in?',
      modalGo: 'Continue',
      modalCancel: 'Cancel',
      betaPromptTitle: 'Enable beta for the whole company?',
      betaPromptBody: 'You set the DEV mark on the {company} sign-in. This enables the beta update channel for your account after you sign in. Also enable beta for the whole company? The company\'s channel only changes if you choose Yes — and only after you sign in with an account that can manage the company.',
      betaPromptYes: 'Yes, enable beta for the company',
      betaPromptNo: 'No, just my account',
      devTitle: 'DEV ENVIRONMENT DETECTED!!!!',
      devSub: 'See support.nivelatolabs.com/dev for info and guidance',
      devExit: 'Press CTRL+ALT+B to turn off this flag and dismiss this screen.',
      prodState: 'Current mark: PRODUCTION env',
      betaTitle: 'WARNING!!!',
      betaBody: 'You are on a beta version of Nivelato. DO NOT USE THIS VERSION ON A PROD ENV!!!!!!!!!!!!!!! EXPECT DATA LOSS OR ISSUES'
    }
  };
  function lang() {
    try {
      if (window.NivSettings && window.NivSettings.getLang) {
        var l = window.NivSettings.getLang();
        if (l === 'es' || l === 'en') return l;
      }
    } catch (_) { /* ignore */ }
    try {
      var d = (document.documentElement.getAttribute('lang') || '').toLowerCase();
      if (d === 'es' || d === 'en') return d;
    } catch (_) { /* ignore */ }
    try {
      var n = (navigator.language || '').toLowerCase();
      if (n === 'en' || n.indexOf('en-') === 0) return 'en';
    } catch (_) { /* ignore */ }
    return 'es';
  }
  function t(k) {
    var d = STR[lang()] || STR.es;
    if (d[k] !== undefined) return d[k];
    return STR.es[k] !== undefined ? STR.es[k] : k;
  }

  /* ---------------------------------------------------------------- */
  /* injected CSS                                                      */
  /* ---------------------------------------------------------------- */
  var CSS = [
    '[data-envmark-card]{position:relative;}',
    /* pointer-events:none (M33): the strip sits over the bottom of the
     * card and must never click-block the sign-in submit under it. */
    '.niv-envmark-footer{position:absolute;left:12px;bottom:8px;right:12px;pointer-events:none;',
    'font-size:11px;line-height:1.5;color:#8a8a94;text-align:left;z-index:5;}',
    '.niv-envmark-footer-state{display:block;font-weight:700;color:#c9c9d2;}',
    '.niv-envmark-interstitial .exit{font-size:15px;margin:14px 0 0;line-height:1.55;}',
    '.flow-envcard-prod{background:#17171a;color:#f2f1ec;border:1px solid #2e2e38;',
    'border-radius:12px;padding:14px;margin:0 0 10px;font-size:13px;line-height:1.55;font-weight:700;}',
    '.niv-envmark-modal-veil{position:fixed;inset:0;z-index:99990;display:none;',
    'align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:18px;}',
    '.niv-envmark-modal-veil.open{display:flex;}',
    '.niv-envmark-modal{width:100%;max-width:440px;background:#141416;color:#f2f1ec;',
    'border:1px solid #2e2e38;border-radius:14px;padding:26px 24px;text-align:center;}',
    '.niv-envmark-modal h2{font-size:21px;margin:0 0 6px;}',
    '.niv-envmark-modal .sub{font-size:13.5px;color:#9a9aa5;margin:0 0 16px;}',
    '.niv-envmark-warn{background:#c81e1e;color:#fff;border-radius:10px;',
    'font-size:14.5px;line-height:1.6;padding:16px;margin:0 0 14px;text-align:left;font-weight:600;}',
    '.niv-envmark-instr{font-size:13.5px;color:#c9c9d2;margin:0 0 16px;line-height:1.55;}',
    '.niv-envmark-prompt{font-size:16px;margin:0 0 18px;}',
    '.niv-envmark-go{display:block;width:100%;border:none;border-radius:999px;',
    'background:#c81e1e;color:#fff;font:600 15.5px system-ui,sans-serif;',
    'padding:13px 18px;cursor:pointer;margin-bottom:10px;}',
    '.niv-envmark-cancel{display:block;width:100%;background:transparent;',
    'border:1px solid #3a3a44;border-radius:999px;color:#f2f1ec;',
    'font:600 15.5px system-ui,sans-serif;padding:13px 18px;cursor:pointer;}',
    '.niv-envmark-interstitial{position:fixed;inset:0;z-index:99999;display:none;',
    'align-items:center;justify-content:center;background:#c81e1e;color:#fff;',
    'text-align:center;padding:24px;}',
    '.niv-envmark-interstitial.open{display:flex;}',
    '.niv-envmark-interstitial h1{font-size:34px;margin:0 0 14px;letter-spacing:.02em;}',
    '.niv-envmark-interstitial a{color:#fff;font-size:17px;}',
    '.flow-envcard-beta{background:#000;color:#fff;border:1px solid #2e2e38;',
    'border-radius:12px;padding:14px;margin:0 0 10px;font-size:13px;line-height:1.55;}',
    '.flow-envcard-beta strong{display:block;font-size:15px;margin-bottom:6px;}',
    '.flow-envcard-dev{background:#c81e1e;color:#fff;border-radius:12px;',
    'padding:14px;margin:0 0 10px;font-size:13px;line-height:1.55;}',
    '.flow-envcard-dev strong{display:block;font-size:15px;margin-bottom:6px;}',
    '.flow-envcard-dev a{color:#fff;}',
    '#flow-env-cards:empty{display:none;}'
  ].join('\n');
  function injectCss() {
    if (document.getElementById('niv-envmark-css')) return;
    var s = document.createElement('style');
    s.id = 'niv-envmark-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------------------------------------------------------------- */
  /* footer hint (reveal chord)                                        */
  /* ---------------------------------------------------------------- */
  /* Re-entrancy guard: our own DOM writes (footer/modal/interstitial/
   * rail cards) must not re-trigger the MutationObserver below, or the
   * renderer spins forever. */
  var inOwnWrite = false;
  function isRevealed() { return lsGet(REVEAL_KEY) === '1'; }
  /* Idempotent and non-destructive (M34, env side): revealing an already
   * revealed footer is a no-op. It never clears the mark, the pending
   * beta intent, or any other setting. */
  function setRevealed() {
    if (isRevealed()) { paintFooters(); return; }
    lsSet(REVEAL_KEY, '1'); paintFooters();
  }
  function ensureFooters() {
    if (inOwnWrite) return;
    inOwnWrite = true;
    try {
      var cards = document.querySelectorAll('[data-envmark-card]');
      for (var i = 0; i < cards.length; i++) {
        if (!cards[i].querySelector('[data-envmark-footer]')) {
          var f = document.createElement('div');
          f.className = 'niv-envmark-footer';
          f.setAttribute('data-envmark-footer', '');
          cards[i].appendChild(f);
        }
      }
      paintFooters();
    } finally { inOwnWrite = false; }
    /* A company card rendered while the dev mark was already active
     * (?env=dev at boot): backfill the pending intent, then prompt. */
    refreshPendingBeta();
  }
  function paintFooters() {
    var revealed = isRevealed();
    var hint = t('footerHint');
    var prod = isProd();
    var els = document.querySelectorAll('[data-envmark-footer]');
    for (var i = 0; i < els.length; i++) {
      /* The hint keeps its own span so the verified verbatim string is
       * never rewritten; the PROD state (m28) is an added sibling line,
       * shown while the prod mark is active. */
      var hintEl = els[i].querySelector('[data-envmark-hint]');
      var stateEl = els[i].querySelector('[data-envmark-state]');
      if (!hintEl) {
        hintEl = document.createElement('span');
        hintEl.setAttribute('data-envmark-hint', '');
        els[i].appendChild(hintEl);
      }
      if (!stateEl) {
        stateEl = document.createElement('span');
        stateEl.className = 'niv-envmark-footer-state';
        stateEl.setAttribute('data-envmark-state', '');
        els[i].appendChild(stateEl);
      }
      if (hintEl.textContent !== hint) hintEl.textContent = hint;
      var state = prod ? t('prodState') : '';
      if (stateEl.textContent !== state) stateEl.textContent = state;
      stateEl.style.display = prod ? '' : 'none';
      /* Visible after the reveal chord, and also while prod is active
       * so setting prod has visible feedback (m28). */
      var want = (revealed || prod) ? '' : 'none';
      if (els[i].style.display !== want) els[i].style.display = want;
    }
  }

  /* ---------------------------------------------------------------- */
  /* chord ladder                                                     */
  /* ---------------------------------------------------------------- */
  function captureAccountFromCard() {
    try {
      var cards = document.querySelectorAll('[data-envmark-card]');
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].offsetParent === null) continue;
        var em = cards[i].querySelector('input[type="email"]');
        if (em && em.value) { addAccount(em.value); return; }
      }
    } catch (_) { /* ignore */ }
  }
  /* CTRL+ALT+B ladder (M30): unset -> prod -> dev -> unset, so DEV is
   * reachable by keyboard and the beta intent that hangs off setMark('dev')
   * is recorded. In the dev sign-in modal the same chord turns the dev
   * flag off (dev -> unset, the last ladder step). */
  function toggleB() {
    var m = getMark();
    if (m === 'dev') {
      /* turning the flag off also retires the dev sign-in modal: the
       * warning it carries is moot once the flag is gone */
      closeModal();
      setMark('');
    } else if (m === 'prod') {
      setMark('dev');
    } else { setMark('prod'); captureAccountFromCard(); }
    refreshAll();
  }
  /* CTRL+ALT+SHIFT+B: dismiss the dev modal only; the flag stays. */
  function dismissOnly() { closeModal(); }

  /* ---------------------------------------------------------------- */
  /* dev sign-in modal (additional step)                               */
  /* ---------------------------------------------------------------- */
  var modalEl = null;
  var pendingProceed = null;
  function buildModal() {
    var veil = document.createElement('div');
    veil.className = 'niv-envmark-modal-veil';
    veil.id = 'niv-envmark-modal';
    veil.setAttribute('role', 'alertdialog');
    veil.setAttribute('aria-modal', 'true');
    veil.innerHTML =
      '<div class="niv-envmark-modal">' +
      '<h2 data-em="modalTitle"></h2>' +
      '<p class="sub" data-em="modalSub"></p>' +
      '<div class="niv-envmark-warn" data-em="modalWarn"></div>' +
      '<p class="niv-envmark-instr" data-em="modalInstr"></p>' +
      '<p class="niv-envmark-prompt" data-em="modalPrompt"></p>' +
      '<button type="button" class="niv-envmark-go" data-em="modalGo"></button>' +
      '<button type="button" class="niv-envmark-cancel" data-em="modalCancel"></button>' +
      '</div>';
    inOwnWrite = true;
    try { document.body.appendChild(veil); } finally { inOwnWrite = false; }
    var go = veil.querySelector('.niv-envmark-go');
    var cancel = veil.querySelector('.niv-envmark-cancel');
    go.addEventListener('click', function () {
      var p = pendingProceed;
      closeModal();
      if (typeof p === 'function') { try { p(); } catch (_) { /* ignore */ } }
    });
    cancel.addEventListener('click', closeModal);
    veil.addEventListener('click', function (e) { if (e.target === veil) closeModal(); });
    modalEl = veil;
    return veil;
  }
  function paintModal() {
    if (!modalEl || inOwnWrite) return;
    inOwnWrite = true;
    try {
      var els = modalEl.querySelectorAll('[data-em]');
      for (var i = 0; i < els.length; i++) {
        var v = t(els[i].getAttribute('data-em'));
        if (els[i].textContent !== v) els[i].textContent = v;
      }
    } finally { inOwnWrite = false; }
  }
  function openModal(proceed) {
    pendingProceed = proceed || null;
    if (!modalEl) buildModal();
    paintModal();
    modalEl.classList.add('open');
  }
  function closeModal() {
    pendingProceed = null;
    if (modalEl) modalEl.classList.remove('open');
  }
  function isModalOpen() { return !!(modalEl && modalEl.classList.contains('open')); }

  /* ---------------------------------------------------------------- */
  /* company-beta prompt (QGC mode): enable beta for the whole company?*/
  /* ---------------------------------------------------------------- */
  /* Asked once per (company, account) while the dev mark is set. The
   * org's channel changes ONLY on an explicit Yes, applied post-auth by
   * login.html (the callable enforces ownership server-side). Veil click
   * or Esc counts as "just my account": conservative by design. */
  var betaPromptEl = null;
  var betaPromptedKey = null;
  function buildBetaPrompt() {
    var veil = document.createElement('div');
    veil.className = 'niv-envmark-modal-veil';
    veil.id = 'niv-envmark-betaprompt';
    veil.setAttribute('role', 'alertdialog');
    veil.setAttribute('aria-modal', 'true');
    veil.innerHTML =
      '<div class="niv-envmark-modal">' +
      '<h2 data-bp="betaPromptTitle"></h2>' +
      '<p class="niv-envmark-instr" data-bp="betaPromptBody" style="text-align:left"></p>' +
      '<button type="button" class="niv-envmark-go" data-bp="betaPromptYes" style="background:#1f7a33"></button>' +
      '<button type="button" class="niv-envmark-cancel" data-bp="betaPromptNo"></button>' +
      '</div>';
    inOwnWrite = true;
    try { document.body.appendChild(veil); } finally { inOwnWrite = false; }
    function answer(yes) {
      var p = getPendingBeta();
      if (p) { p.companyBetaYes = !!yes; setPendingBeta(p); }
      veil.classList.remove('open');
    }
    veil.querySelector('.niv-envmark-go').addEventListener('click', function () { answer(true); });
    veil.querySelector('.niv-envmark-cancel').addEventListener('click', function () { answer(false); });
    veil.addEventListener('click', function (e) { if (e.target === veil) answer(false); });
    betaPromptEl = veil;
    return veil;
  }
  function paintBetaPrompt() {
    if (!betaPromptEl || inOwnWrite) return;
    inOwnWrite = true;
    try {
      var p = getPendingBeta() || {};
      var els = betaPromptEl.querySelectorAll('[data-bp]');
      for (var i = 0; i < els.length; i++) {
        var v = t(els[i].getAttribute('data-bp'));
        v = String(v).replace('{company}', p.companyName || p.companyId || '');
        if (els[i].textContent !== v) els[i].textContent = v;
      }
    } finally { inOwnWrite = false; }
  }
  function maybePromptCompanyBeta() {
    if (getMark() !== 'dev') return;
    var company = visibleCompanyCard();
    if (!company) return;
    var p = getPendingBeta();
    if (!p || !p.companyId) return;
    if (typeof p.companyBetaYes === 'boolean') return;
    var key = p.companyId + '|' + (p.email || '');
    if (betaPromptedKey === key) return;
    betaPromptedKey = key;
    if (!betaPromptEl) buildBetaPrompt();
    paintBetaPrompt();
    betaPromptEl.classList.add('open');
  }
  function dismissBetaPrompt() {
    if (!betaPromptEl || !betaPromptEl.classList.contains('open')) return;
    var p = getPendingBeta();
    if (p) { p.companyBetaYes = false; setPendingBeta(p); }
    betaPromptEl.classList.remove('open');
  }
  function isBetaPromptOpen() { return !!(betaPromptEl && betaPromptEl.classList.contains('open')); }
  /* Late fill: ?env=dev (or any programmatic set) can land before the card
   * renders. When cards appear, backfill blanks without clobbering an
   * already-answered company choice, then offer the company prompt. */
  function refreshPendingBeta() {
    if (getMark() !== 'dev') return;
    var p = getPendingBeta();
    if (!p) { recordPendingBeta(); maybePromptCompanyBeta(); return; }
    var card = visibleCard();
    var company = visibleCompanyCard();
    var email = card ? cardEmail(card) : '';
    var info = company ? cardCompanyInfo(company) : { id: '', name: '' };
    var changed = false;
    /* M35: the intent email is not a one-time snapshot. If the card now
     * shows a different non-empty email (the natural order is mark first,
     * type second), follow the card so post-auth enrollment matches the
     * account actually being signed into. */
    if (email && p.email !== email) { p.email = email; changed = true; }
    if (!p.companyId && info.id) { p.companyId = info.id; p.companyName = info.name; changed = true; }
    if (changed) setPendingBeta(p);
    maybePromptCompanyBeta();
  }

  function interceptSubmit(form, ev) {
    if (!isDev()) return;
    if (form.__envmarkConfirmed) { form.__envmarkConfirmed = false; return; }
    ev.preventDefault();
    ev.stopPropagation();
    openModal(function () {
      form.__envmarkConfirmed = true;
      try { form.requestSubmit(); } catch (_) {
        try { form.submit(); } catch (_) { /* ignore */ }
      }
    });
  }
  function wireInterception() {
    var cfg = window.NivEnvMarkConfig || {};
    if (cfg.interceptSubmits !== false) {
      document.addEventListener('submit', function (ev) {
        var f = ev.target;
        if (!f || f.tagName !== 'FORM') return;
        if (!f.closest || !f.closest('[data-envmark-card]')) return;
        interceptSubmit(f, ev);
      }, true);
    }
    var btns = cfg.signinButtons || [];
    for (var i = 0; i < btns.length; i++) {
      (function (sel) {
        var b = document.querySelector(sel);
        if (!b || b.__envmarkWired) return;
        b.__envmarkWired = true;
        b.addEventListener('click', function (ev) {
          if (!isDev()) return;
          if (b.__envmarkConfirmed) { b.__envmarkConfirmed = false; return; }
          ev.preventDefault();
          ev.stopPropagation();
          var nativeClick = b.click.bind(b);
          openModal(function () {
            b.__envmarkConfirmed = true;
            try { nativeClick(); } catch (_) { /* ignore */ }
          });
        }, true);
      })(btns[i]);
    }
  }

  /* ---------------------------------------------------------------- */
  /* full-screen dev interstitial (opt-in pages only)                  */
  /* ---------------------------------------------------------------- */
  function renderInterstitial() {
    if (!document.body || !document.body.hasAttribute('data-envmark-interstitial')) return;
    if (inOwnWrite) return;
    inOwnWrite = true;
    try {
      var el = document.getElementById('niv-envmark-interstitial');
      if (!el) {
        el = document.createElement('div');
        el.id = 'niv-envmark-interstitial';
        el.className = 'niv-envmark-interstitial';
        el.setAttribute('role', 'alert');
        document.body.appendChild(el);
      }
      if (isDev()) {
        var html = '<div><h1>' + escapeHtml(t('devTitle')) + '</h1>' +
          '<a href="' + DEV_URL + '">' + escapeHtml(t('devSub')) + '</a>' +
          '<p class="exit">' + escapeHtml(t('devExit')) + '</p></div>';
        if (el.__emHtml !== html) { el.innerHTML = html; el.__emHtml = html; }
        el.classList.add('open');
      } else {
        el.classList.remove('open');
      }
    } finally { inOwnWrite = false; }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------------------------------------------------------- */
  /* flow rail warning cards                                           */
  /* ---------------------------------------------------------------- */
  var channelProvider = null;
  function setChannelProvider(fn) { channelProvider = fn; }
  function currentChannel() {
    try { if (typeof channelProvider === 'function') return String(channelProvider() || ''); } catch (_) { /* ignore */ }
    return '';
  }
  function renderRailCards() {
    var host = document.getElementById('flow-env-cards');
    if (!host || inOwnWrite) return;
    inOwnWrite = true;
    try {
      var html = '';
      if (isProd()) {
        html += '<div class="flow-envcard-prod">' + escapeHtml(t('prodState')) + '</div>';
      }
      if (currentChannel() === 'beta') {
        html += '<div class="flow-envcard-beta"><strong>' + escapeHtml(t('betaTitle')) + '</strong>' +
          escapeHtml(t('betaBody')) + '</div>';
      }
      if (isDev()) {
        html += '<div class="flow-envcard-dev"><strong>' + escapeHtml(t('devTitle')) + '</strong>' +
          '<a href="' + DEV_URL + '">' + escapeHtml(t('devSub')) + '</a></div>';
      }
      if (host.__emHtml !== html) { host.innerHTML = html; host.__emHtml = html; }
    } finally { inOwnWrite = false; }
  }

  /* ---------------------------------------------------------------- */
  /* version-routing rule: signed-out surfaces resolve LATEST          */
  /* ---------------------------------------------------------------- */
  /* "Latest" = app_updates/beta-latest, the newest shipped projection.
   * Signed-out surfaces (login, sign-up, support) must use this, never a
   * channel projection. Signed-in surfaces keep channel resolution. */
  var FALLBACK_VERSION = '1.1.0'; /* mirrors repo-root VERSION */
  function resolveLatestVersion(db, fs) {
    return new Promise(function (resolve) {
      try {
        fs.getDoc(fs.doc(db, 'app_updates', 'beta-latest')).then(function (s) {
          try {
            if (s && s.exists && s.exists()) {
              var d = s.data() || {};
              var v = d.friendlyVersion || d.version;
              if (v) { resolve(String(v)); return; }
            }
          } catch (_) { /* ignore */ }
          resolve(FALLBACK_VERSION);
        }, function () { resolve(FALLBACK_VERSION); });
      } catch (_) { resolve(FALLBACK_VERSION); }
    });
  }

  /* ---------------------------------------------------------------- */
  /* chords + boot                                                     */
  /* ---------------------------------------------------------------- */
  function refreshAll() {
    paintFooters();
    paintModal();
    paintBetaPrompt();
    renderInterstitial();
    renderRailCards();
  }
  /* Editable-focus guard (M34, env side): the chords must not fire while
   * the user is typing in a field. On login this also stops the reveal
   * chord from colliding with typing in the email and password inputs. */
  function isEditableTarget(e) {
    try {
      var el = e && e.target;
      if (!el) return false;
      if (el.isContentEditable) return true;
      var tag = String(el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select';
    } catch (_) { return false; }
  }
  /* Key identity: prefer e.key, but fall back to e.code (m27). On macOS,
   * Option+B produces the glyph "∫" as e.key while e.code stays "KeyB";
   * the same applies to Option+D. */
  function chordKey(e) {
    var k = String((e && e.key) || '').toLowerCase();
    if (k === 'b' || k === 'd') return k;
    if (e && e.code === 'KeyB') return 'b';
    if (e && e.code === 'KeyD') return 'd';
    return k;
  }
  document.addEventListener('keydown', function (e) {
    var k0 = String(e.key || '').toLowerCase();
    if (k0 === 'escape' && isBetaPromptOpen()) { e.preventDefault(); dismissBetaPrompt(); return; }
    if (!e.ctrlKey || !e.altKey) return;
    if (isEditableTarget(e)) return;
    var k = chordKey(e);
    if (k === 'd') { e.preventDefault(); setRevealed(); return; }
    if (k !== 'b') return;
    e.preventDefault();
    if (e.shiftKey) dismissOnly();
    else toggleB();
  });
  /* M35: typing the email after the mark was set updates the pending
   * beta intent (refreshPendingBeta follows the visible card email). */
  document.addEventListener('input', function (e) {
    try {
      var el = e && e.target;
      if (el && String(el.type || '').toLowerCase() === 'email') refreshPendingBeta();
    } catch (_) { /* ignore */ }
  }, true);
  function applyQueryEnv() {
    try {
      var q = new URLSearchParams(window.location.search).get('env');
      if (q === 'dev') setMark('dev');
      else if (q === 'prod') setMark('prod');
      else if (q === 'none') setMark('');
    } catch (_) { /* ignore */ }
  }
  function observe() {
    try {
      var mo = new MutationObserver(function () { ensureFooters(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) { /* ignore */ }
    try {
      var lo = new MutationObserver(function () { refreshAll(); });
      lo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    } catch (_) { /* ignore */ }
  }
  /* M32 (env side): late hosts. The MutationObserver in observe() already
   * calls ensureFooters() when a [data-envmark-card] host is added, and
   * these bounded retries cover hosts added by a renderer that settles
   * without a further mutation we can see. This only ever fills hosts
   * that already carry the attribute; it never creates a host, so it
   * cannot mask a renderer that drops the attribute. The sign-in modal
   * needs nothing on this side: interception is a document-level submit
   * listener keyed on a form inside [data-envmark-card], so it works as
   * soon as such a host exists. */
  function scheduleFooterRetries() {
    var delays = [250, 1000, 2500];
    for (var i = 0; i < delays.length; i++) {
      (function (ms) {
        try { setTimeout(function () { ensureFooters(); }, ms); } catch (_) { /* ignore */ }
      })(delays[i]);
    }
  }
  function boot() {
    injectCss();
    applyQueryEnv();
    ensureFooters();
    wireInterception();
    renderInterstitial();
    renderRailCards();
    observe();
    scheduleFooterRetries();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.NivEnvMark = {
    getMark: getMark,
    setMark: setMark,
    isDev: isDev,
    isProd: isProd,
    toggleB: toggleB,
    dismissOnly: dismissOnly,
    getAccounts: getAccounts,
    addAccount: addAccount,
    getPendingBeta: getPendingBeta,
    clearPendingBeta: clearPendingBeta,
    setChannelProvider: setChannelProvider,
    renderRailCards: renderRailCards,
    resolveLatestVersion: resolveLatestVersion,
    onChange: onChange,
    t: t,
    lang: lang,
    refresh: refreshAll,
    isModalOpen: isModalOpen
  };
})();
