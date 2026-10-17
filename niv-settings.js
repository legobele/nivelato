/* niv-settings.js - the single settings system for Nivelato web.
 *
 * Mandate: ALL user settings are respected across ALL pages. Storage used to
 * be per-origin localStorage (and per-page keys), so a preference set on one
 * subdomain was invisible on the next. This file is the one system every
 * page should read and write through: cookies on Domain=.nivelatolabs.com,
 * Path=/, SameSite=Lax, Max-Age=31536000 (one year), with localStorage kept
 * only as a mirror for readers that have not migrated yet (see MIRRORS).
 *
 * Classic script, no modules, no build step. Load it in <head>:
 *   <script src="/niv-settings.js"></script>
 * It attaches window.NivSettings and never throws, on any host, in any
 * storage mode (private browsing, file://, blocked cookies included).
 *
 * ---------------------------------------------------------------------------
 * PRE-PAINT BOOT (niv-settings-boot usage notes)
 * ---------------------------------------------------------------------------
 * External scripts cannot be trusted to run before first paint on every
 * shell, so pages that paint chrome from a preference (compact sidebar,
 * language) paste this tiny inline snippet in <head> BEFORE their CSS and
 * body markup. It reads the cookie synchronously, no dependency on this
 * file, and marks <html>; the page reconciles the <html> classes with its
 * body-level classes once the body exists (dashboard.html already has a
 * body-level reader at line 931; next-wave work points it at <html> or at
 * the cookie and deletes the localStorage read).
 *
 *   <script>
 *   try{var c='; '+document.cookie;var cm=c.match(/; niv-compact-sidebar=([01])(?:;|$)/);if(cm&&cm[1]==='1')document.documentElement.classList.add('niv-compact');var lm=c.match(/; nivelato-login-lang=(es|en)(?:;|$)/);if(lm)document.documentElement.lang=lm[1];}catch(e){}
 *   </script>
 *
 * After paint, load this file and call NivSettings.getCompact() /
 * NivSettings.getLang() as the source of truth; the snippet is only a
 * first-paint bridge, never a second store.
 *
 * ---------------------------------------------------------------------------
 * MIGRATION TABLE - every UI preference found in the repo at dad1deb
 * (evidence: grep -rn "localStorage|sessionStorage|document.cookie")
 * ---------------------------------------------------------------------------
 * IN THIS SYSTEM (cookie is the source of truth after adoption):
 *
 * 1. Language (es|en)
 *    Today: localStorage 'nivelato-login-lang' on the login origin
 *      (login.html:963 STORE_KEY, read :972, written :1041 and :1059;
 *      settings.html:385 read, :404 written; dashboard.html:3649 read),
 *      PLUS a cookie of the same name written only by login
 *      (login.html:968, Domain=.nivelatolabs.com) and read only by
 *      geo-blocked.html:124. Firestore users/{uid}.language sits above
 *      both on login/settings (settings.html:380-384) and is unchanged:
 *      pages that load the user doc still let the DB win and then call
 *      setLang() with the DB value.
 *    Cookie: 'nivelato-login-lang' (LOCKED name, do not rename; the
 *      geo-blocked.html:124 regex depends on the raw es|en value).
 *    Mirror: localStorage 'nivelato-login-lang' kept (see MIRRORS).
 *
 * 2. Compact sidebar (1|0)
 *    Today: localStorage 'niv-compact-sidebar' only. Written by the
 *      settings toggle (settings.html:458 KEY, read :461, written :463);
 *      read pre-paint by dashboard.html:931.
 *    Cookie: 'niv-compact-sidebar' (LOCKED name).
 *    Mirror: localStorage 'niv-compact-sidebar' kept (see MIRRORS).
 *
 * 3. Panel width (integer px, 220 to 520: the clamp dashboard enforces)
 *    Today: localStorage 'niv-panel-width' (dashboard.html:4036 WKEY,
 *      read :4039, written :4075 and :4089).
 *    Cookie: 'niv-panel-width'. Mirror: localStorage kept (dashboard
 *      still reads it there); next wave migrates the reader.
 *
 * 4. Panel nav sections open/closed (JSON object, small)
 *    Today: localStorage 'niv-panel-sections' (dashboard.html:3728 read,
 *      :3729 written; second copy :4005 read, :4020 written).
 *    Cookie: 'niv-panel-sections'. Mirror: localStorage kept. Values are
 *      capped at 3000 chars so the JSON can never blow the per-cookie
 *      size limit; oversize writes are refused (return false).
 *
 * 5. Standalone-tools language (es|en), legacy key 'niv-lang'
 *    Today: localStorage 'niv-lang', read and toggled independently by
 *      beta/index.html:145, beta/enroll.html:99, beta/unenroll.html:82,
 *      beta/enroll-company.html:106, beta/feedback.html:101,
 *      testing/index.html:108, testing/staff.html:93,
 *      debug/index.html:134, remote/index.html:149, remote/staff.html:104.
 *      These pages disagree with the main app language today.
 *    Cookie: 'niv-lang' in the allowlist so the value at least travels
 *      across origins, mirrored to localStorage 'niv-lang'.
 *    Next wave: these pages should switch to getLang() /
 *      'nivelato-login-lang' and this legacy key should be retired.
 *
 * OUT OF SCOPE (explicitly NOT settings cookies; do not migrate here):
 *
 * 6. Company theme flag 'nivelato_company_theme' (qgc|standard):
 *    company-theme.js:8 FLAG (read :11, written :14), written by
 *    login.html:2481, removed on logout by account-selector.js:46.
 *    NOT a user preference: it is a cache of an auth-derived fact
 *    (users/{uid}.isQGC / company, or the flow=qgi claim) that
 *    company-theme.js rewrites on every load. Deriving UI from a
 *    user-writable cookie would let anyone flip the QGC theme (and any
 *    logic that trusts it) by hand. Stays localStorage, stays derived.
 * 7. Estradiol / pink mode 'nivelato-estradiol' (estradiol.js:6, read
 *    :39, written :14): the source of truth is already cross-device,
 *    Firestore users/{uid} settings.estradiol (estradiol.js save and
 *    load); localStorage is its offline cache. A cookie would be a
 *    third store for one fact. Out of scope for v1; candidate for a
 *    later allowlist entry fed BY the DB value, never user-set here.
 * 8. Fun toggles 'nivelato-bread' (bread.js:4, read :5, written :35)
 *    and 'nivelato-italiano' (italiano.js:5, read :6, written :123):
 *    easter-egg modes, deliberately per-origin novelties, no cross-page
 *    expectation. Out of scope for v1; trivial allowlist additions
 *    (1|0) if Giulia ever wants them to follow her across pages.
 * 9. Pride counters 'nl_pride_visits' / 'nl_pride_year' /
 *    'nl_pride_compliant' (pride.js:7, read/written :10, :20-28):
 *    counters and a joke-compliance flag, not settings.
 * 10. 'nl_lang_db' flag (login.html:999 read, :1056 and :1484 written;
 *    settings.html:405 written): bookkeeping meaning "the language was
 *    saved to the DB from this browser". It is only true of the login
 *    origin's session; a shared cookie would claim it on origins where
 *    it never happened. Stays localStorage on login/settings.
 * 11. BYOB backend config 'nivelato_backend_config' (firebase-config.js
 *    :26, read :31, written :126, removed :131): a full Firebase web
 *    config JSON. Too big for a cookie, per-device by design, and it
 *    must never ride along on every request. Stays localStorage.
 * 12. Wizard draft 'nivelato_wizard_draft_v1' (adhd.js:210, written
 *    :232-236, read :243, removed :270): in-progress form data, can
 *    embed a photo data URL. Data, not a setting; far over cookie size.
 * 13. Used-accounts picker 'nivelato_used_accounts' (login.html:1244,
 *    read :1248, written :1261): other people's emails who signed in on
 *    this device. Device-local by design; emails must not be copied
 *    into a cookie that is sent to every subdomain on every request.
 * 14. QGC device trust 'nivelato_qgc_authed' (login.html:1217, read
 *    :1219, written :1222) and travel grant
 *    'nivelato_qgc_travel_until' (login.html:1230, read :1232,
 *    written :1236): security-adjacent device state that gates geo
 *    bypass. Deliberately NOT promoted to a domain cookie; widening
 *    its reach is a security decision, not a settings refactor.
 * 15. Dev panel keys 'nl_dev_geo', 'nl_dev_company', 'nl_dev_unlocked'
 *    and the nl_dev_* family (login.html:1496-1500 helpers, :1649-1653
 *    revert sweep, :1808, read :3205 and :3241): developer overrides
 *    for geo/company testing. Per-origin on purpose; a domain cookie
 *    would leak test overrides into every surface.
 * 16. sessionStorage, all of it, stays sessionStorage (ephemeral by
 *    design, none of it is a setting): 'niv_country' geo cache
 *    (pr-ultra.js:23, :34), 'nivelato_last_handoff' SSO timing guard
 *    (login.html:1952, :1977), 'niv:settings-referrer' one-shot back
 *    target (nav-referrer.js:23, :40, :66-68; that file's header
 *    already documents why it is not a cookie).
 * 17. 'nl_flow' cookie (set by workers/geo-edge.js:36-39, read by
 *    login.html:1208): already a cookie, owned by the geo edge worker,
 *    24h routing signal, not a user setting. Untouched by this file.
 * 18. Firebase Auth persistence keys ('firebase:authUser*', purged by
 *    auth-guard.js:47-55, account-selector.js:24-32,
 *    settings.html:438-445): owned by the Firebase SDK. Never touch.
 *
 * ---------------------------------------------------------------------------
 * MIRRORS - exactly which localStorage mirrors set() keeps, and why
 * ---------------------------------------------------------------------------
 * The cookie is the source of truth. On load this file ADOPTS: for each
 * known key, if the cookie is absent but a valid localStorage value
 * exists, the value is copied INTO the cookie. An existing cookie is
 * never overwritten by a localStorage value; when both exist and
 * disagree, the cookie wins and the mirror is re-synced FROM the cookie
 * (this is what makes a preference set on the login origin show up for
 * dashboard's localStorage readers on their own origin).
 *
 * set() keeps writing these localStorage mirrors, same key names:
 *   - 'nivelato-login-lang' : login i18n detectLang reads localStorage
 *     (login.html:972), settings.html:385 reads it as fallback, and
 *     dashboard.html:3649 (NIV_LANG) reads it. Drop this mirror only
 *     after all three read the cookie / call getLang().
 *   - 'niv-compact-sidebar' : dashboard.html:931 reads it pre-paint and
 *     settings.html:461 initialises its toggle from it. Drop after the
 *     boot snippet above replaces the :931 reader and the toggle uses
 *     getCompact()/setCompact().
 *   - 'niv-panel-width'     : dashboard.html:4039 reads it. Drop after
 *     that reader calls get('niv-panel-width').
 *   - 'niv-panel-sections'  : dashboard.html:3728 and :4005 read it.
 *     Drop after those readers call get('niv-panel-sections').
 *   - 'niv-lang'            : the ten beta/testing/debug/remote pages
 *     listed in row 5 read it directly. Drop when they move to
 *     getLang() and row 5 is retired.
 * No other mirrors exist. When cookies are unusable on a host (see
 * FALLBACK), localStorage stops being a mirror and becomes the store;
 * the API and semantics do not change.
 *
 * ---------------------------------------------------------------------------
 * FALLBACK - hosts where Domain=.nivelatolabs.com is invalid
 * ---------------------------------------------------------------------------
 * Writes are verified by reading the cookie back. If a write with the
 * Domain attribute does not stick (localhost, file://, an unrelated
 * staging host), the write is retried host-only (no Domain). If that
 * does not stick either, the value lands in localStorage under the same
 * key, and if localStorage also throws, in an in-memory map for the
 * life of the page. getBackend() reports which layer is live:
 * 'cookie-domain', 'cookie-host', 'localstorage', or 'memory'.
 * Nothing in this file throws, ever; failures degrade, they do not break
 * the host page.
 *
 * ---------------------------------------------------------------------------
 * API - window.NivSettings
 * ---------------------------------------------------------------------------
 *   getLang()            -> 'es' | 'en' ('es' default, the product default
 *                           every existing reader already falls back to)
 *   setLang(v)           -> bool; validates es|en, persists, mirrors,
 *                           applies to the document (see below)
 *   getCompact()         -> bool
 *   setCompact(bool)     -> bool; persists 1|0, mirrors, fires niv:compact
 *   get(key)             -> string | null, allowlist keys only
 *   set(key, value)      -> bool, allowlist keys only, per-key validation
 *   remove(key)          -> bool, allowlist keys only; expires the cookie
 *                           (both Domain and host-only forms) and clears
 *                           the localStorage mirror
 *   applyLangToDocument(lang?) -> the lang applied; sets <html lang> and
 *                           dispatches a 'niv:lang' CustomEvent on
 *                           document with detail { lang }. With no
 *                           argument it applies the stored language.
 *                           Pages re-render their strings on 'niv:lang'.
 *   applyCompactToDocument(bool?) -> toggles the 'niv-compact' class on
 *                           <html> (the boot-snippet hook) and dispatches
 *                           'niv:compact' on document, detail { compact }.
 *                           Page-specific panel DOM stays the page's job.
 *   getBackend()         -> fallback layer name (see FALLBACK)
 *   KEYS                 -> the locked cookie names
 *   ALLOWLIST            -> array of keys get/set/remove accept
 *
 * Generic get/set are restricted to ALLOWLIST on purpose: a settings
 * cookie is sent on every request to every subdomain, so arbitrary keys
 * (drafts, emails, configs, trust flags) must never be able to sneak
 * into it. Adding a future preference means adding one DEFS entry here
 * (validator + mirror flag), not calling set() with a new string.
 *
 * Values are encodeURIComponent-encoded on write and decoded on read.
 * The locked values (es, en, 1, 0) encode to themselves, so the legacy
 * raw-value readers (geo-blocked.html:124 regex, login.html:968 format)
 * keep working byte for byte.
 *
 * Test hooks: NivSettings._internal exposes the pure cookie-string
 * helpers (parseCookieString, buildCookieString, buildDeleteString) so
 * the logic can be unit-tested in node without a DOM.
 */
(function (global) {
  'use strict';

  var COOKIE_DOMAIN = '.nivelatolabs.com';
  var COOKIE_ATTRS = 'Path=/; SameSite=Lax; Max-Age=31536000';
  var PROBE_KEY = 'niv-settings-probe';
  var MAX_COOKIE_VALUE = 3000;

  /* ------------------------------------------------------------------ */
  /* Pure cookie-string helpers (no DOM access; node-testable)           */
  /* ------------------------------------------------------------------ */

  function parseCookieString(str) {
    var out = {};
    if (!str || typeof str !== 'string') return out;
    var parts = str.split(';');
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (eq < 0) continue;
      var name = parts[i].slice(0, eq).replace(/^\s+|\s+$/g, '');
      if (!name) continue;
      var raw = parts[i].slice(eq + 1).replace(/^\s+|\s+$/g, '');
      var val = raw;
      try { val = decodeURIComponent(raw); } catch (e) { /* keep raw */ }
      out[name] = val;
    }
    return out;
  }

  function buildCookieString(name, value, useDomain) {
    var s = name + '=' + encodeURIComponent(String(value)) + '; ' + COOKIE_ATTRS;
    if (useDomain) s += '; Domain=' + COOKIE_DOMAIN;
    return s;
  }

  function buildDeleteString(name, useDomain) {
    var s = name + '=; Path=/; SameSite=Lax; Max-Age=0';
    if (useDomain) s += '; Domain=' + COOKIE_DOMAIN;
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Setting definitions: the allowlist                                  */
  /* ------------------------------------------------------------------ */

  function isLang(v) { return v === 'es' || v === 'en'; }
  function isBool10(v) { return v === '1' || v === '0'; }
  function isPanelWidth(v) {
    if (!/^\d+$/.test(v)) return false;
    var n = parseInt(v, 10);
    return n >= 220 && n <= 520;
  }
  function isPanelSections(v) {
    if (typeof v !== 'string' || v.length > MAX_COOKIE_VALUE) return false;
    try {
      var p = JSON.parse(v);
      return !!p && typeof p === 'object' && !Array.isArray(p);
    } catch (e) { return false; }
  }
  function normalizeBool(v) {
    if (v === true || v === 1 || v === '1') return '1';
    if (v === false || v === 0 || v === '0') return '0';
    return null;
  }

  /* lsKey: localStorage key mirrored on set (same name today for every
   * in-scope key). mirror: keep the mirror until the readers listed in
   * the header migrate. normalize: optional input coercion run before
   * validate. */
  var DEFS = {
    'nivelato-login-lang': {
      validate: isLang, lsKey: 'nivelato-login-lang', mirror: true,
      normalize: function (v) { return String(v).toLowerCase(); }
    },
    'niv-compact-sidebar': {
      validate: isBool10, lsKey: 'niv-compact-sidebar', mirror: true,
      normalize: normalizeBool
    },
    'niv-panel-width': {
      validate: isPanelWidth, lsKey: 'niv-panel-width', mirror: true,
      normalize: function (v) { return String(v); }
    },
    'niv-panel-sections': {
      validate: isPanelSections, lsKey: 'niv-panel-sections', mirror: true,
      normalize: function (v) {
        return typeof v === 'string' ? v : JSON.stringify(v);
      }
    },
    'niv-lang': {
      validate: isLang, lsKey: 'niv-lang', mirror: true,
      normalize: function (v) { return String(v).toLowerCase(); }
    },
    /* Environment marks (niv-envmark.js, Giulia's boards Oct 12 2026):
     * - 'niv-env-mark': 'prod' | 'dev' | unset. Device-level environment
     *   mark. Ctrl+Alt+B on a sign-in card toggles the production mark;
     *   a 'dev' mark triggers the dev-flag alarm state (full-screen
     *   interstitial in the app, additional sign-in step on auth pages).
     *   Set transiently by ?env=dev|prod|none (test path), persisted to
     *   the cookie by the script. SECURITY NOTE: this is a client-side,
     *   user-writable marker. The UI treats a dev mark as an alarm and
     *   the modal states the risk, but no server-side gate may trust it
     *   as an authorization fact (same reason company theme stays out
     *   of the cookie system).
     * - 'niv-env-accounts': JSON array of email strings, the accounts
     *   marked production at sign-in time (the account is not authed
     *   yet when the chord is pressed, so the mark is keyed by the
     *   email typed into the sign-in field). Capped like
     *   niv-panel-sections; deduped by the writer. */
    'niv-env-mark': {
      validate: function (v) { return v === 'prod' || v === 'dev'; },
      lsKey: 'niv-env-mark', mirror: true, normalize: function (v) { return String(v).toLowerCase(); }
    },
    'niv-env-accounts': {
      validate: function (v) {
        if (typeof v !== 'string' || v.length > MAX_COOKIE_VALUE) return false;
        try {
          var a = JSON.parse(v);
          return Array.isArray(a) && a.every(function (e) { return typeof e === 'string' && e.length <= 320; });
        } catch (e) { return false; }
      },
      lsKey: 'niv-env-accounts', mirror: true,
      normalize: function (v) { return typeof v === 'string' ? v : JSON.stringify(v); }
    },
    /* Pending beta intent (niv-envmark.js beta cascade, M37): the DEV
     * mark records { email, companyId, companyName, companyBetaYes, at }
     * pre-auth on the sign-in origin and login.html applies it post-auth,
     * which can be on another subdomain, so it must travel in the domain
     * cookie like every other setting here, not only in the localStorage
     * mirror. JSON object string, capped like the other JSON settings.
     * Same security note as 'niv-env-mark': a client-side record of a
     * user action, never an authorization fact. */
    'niv-env-pending-beta': {
      validate: function (v) {
        if (typeof v !== 'string' || v.length > MAX_COOKIE_VALUE) return false;
        try {
          var o = JSON.parse(v);
          return !!o && typeof o === 'object' && !Array.isArray(o);
        } catch (e) { return false; }
      },
      lsKey: 'niv-env-pending-beta', mirror: true,
      normalize: function (v) { return typeof v === 'string' ? v : JSON.stringify(v); }
    }
  };
  var ALLOWLIST = Object.keys(DEFS);

  function defFor(key) {
    return Object.prototype.hasOwnProperty.call(DEFS, key) ? DEFS[key] : null;
  }

  function validateValue(key, value) {
    var def = defFor(key);
    if (!def || value === null || value === undefined) return null;
    var v = def.normalize ? def.normalize(value) : String(value);
    if (v === null || v === undefined) return null;
    return def.validate(v) ? v : null;
  }

  /* ------------------------------------------------------------------ */
  /* Storage primitives: every access wrapped, nothing throws            */
  /* ------------------------------------------------------------------ */

  var memoryStore = {};
  var backend = null; /* resolved lazily by probe() / first write */

  function doc() {
    try { return global.document || null; } catch (e) { return null; }
  }
  function ls() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }
  function lsGet(key) {
    var s = ls(); if (!s) return null;
    try { return s.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    var s = ls(); if (!s) return false;
    try { s.setItem(key, value); return true; } catch (e) { return false; }
  }
  function lsRemove(key) {
    var s = ls(); if (!s) return;
    try { s.removeItem(key); } catch (e) { /* ignore */ }
  }

  function readCookieRaw(name) {
    var d = doc(); if (!d) return null;
    var str;
    try { str = d.cookie; } catch (e) { return null; }
    var map = parseCookieString(str || '');
    return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : null;
  }

  function writeCookieRaw(name, value, useDomain) {
    var d = doc(); if (!d) return false;
    try { d.cookie = buildCookieString(name, value, useDomain); }
    catch (e) { return false; }
    return readCookieRaw(name) === String(value);
  }

  function deleteCookieRaw(name) {
    var d = doc(); if (!d) return;
    try { d.cookie = buildDeleteString(name, true); } catch (e) { /* ignore */ }
    try { d.cookie = buildDeleteString(name, false); } catch (e) { /* ignore */ }
  }

  /* Host plausibility for the Domain attribute: nivelatolabs.com itself
   * or any subdomain of it. Anything else skips straight to host-only so
   * localhost and staging never pay for a doomed write. */
  function domainPlausible() {
    var d = doc();
    var host = '';
    try { host = (d && d.location && d.location.hostname) ||
                 (global.location && global.location.hostname) || ''; }
    catch (e) { host = ''; }
    return host === 'nivelatolabs.com' ||
           /\.nivelatolabs\.com$/.test(host);
  }

  /* Resolve the live backend once: probe with the Domain attribute when
   * plausible, then host-only, then localStorage, then memory. The probe
   * cookie is deleted immediately and is never a DEFS key. */
  function probe() {
    if (backend !== null) return backend;
    if (domainPlausible() && writeCookieRaw(PROBE_KEY, '1', true)) {
      backend = 'cookie-domain';
    } else if (writeCookieRaw(PROBE_KEY, '1', false)) {
      backend = 'cookie-host';
    } else if (lsSet(PROBE_KEY, '1')) {
      lsRemove(PROBE_KEY);
      backend = 'localstorage';
    } else {
      backend = 'memory';
    }
    if (backend === 'cookie-domain' || backend === 'cookie-host') {
      deleteCookieRaw(PROBE_KEY);
    }
    return backend;
  }

  /* Persist one already-validated value. Returns true when the value is
   * readable back from SOME layer (cookie preferred). Also maintains the
   * backend record so getBackend() reflects the layer actually in use. */
  function persist(key, value) {
    var mode = probe();
    if (mode === 'cookie-domain') {
      if (writeCookieRaw(key, value, true)) return true;
      if (writeCookieRaw(key, value, false)) { backend = 'cookie-host'; return true; }
    } else if (mode === 'cookie-host') {
      if (writeCookieRaw(key, value, false)) return true;
    }
    if (lsSet(key, value)) {
      if (mode !== 'cookie-domain' && mode !== 'cookie-host') backend = 'localstorage';
      return true;
    }
    memoryStore[key] = value;
    if (mode !== 'cookie-domain' && mode !== 'cookie-host') backend = 'memory';
    return true;
  }

  function readStored(key) {
    var fromCookie = readCookieRaw(key);
    if (fromCookie !== null) return fromCookie;
    var fromLs = lsGet(key);
    if (fromLs !== null) return fromLs;
    return Object.prototype.hasOwnProperty.call(memoryStore, key)
      ? memoryStore[key] : null;
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  function fire(name, detail) {
    var d = doc(); if (!d) return;
    var ev = null;
    try {
      var CE = global.CustomEvent;
      if (typeof CE === 'function') ev = new CE(name, { detail: detail });
    } catch (e) { ev = null; }
    if (!ev) {
      try {
        ev = d.createEvent('CustomEvent');
        ev.initCustomEvent(name, false, false, detail);
      } catch (e2) { ev = null; }
    }
    if (!ev) { ev = { type: name, detail: detail }; }
    try { d.dispatchEvent(ev); } catch (e3) { /* no listeners, no problem */ }
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  function get(key) {
    var def = defFor(key);
    if (!def) return null;
    var raw = readStored(key);
    if (raw === null) return null;
    return validateValue(key, raw);
  }

  function set(key, value) {
    var def = defFor(key);
    if (!def) return false;
    var v = validateValue(key, value);
    if (v === null) return false;
    if (String(value).length > MAX_COOKIE_VALUE && key !== 'niv-panel-sections') {
      return false;
    }
    var ok = persist(key, v);
    if (def.mirror) lsSet(def.lsKey, v);
    return ok;
  }

  function remove(key) {
    var def = defFor(key);
    if (!def) return false;
    deleteCookieRaw(key);
    lsRemove(def.lsKey);
    delete memoryStore[key];
    return true;
  }

  function applyLangToDocument(lang) {
    var l = isLang(lang) ? lang : getLang();
    var d = doc();
    if (d && d.documentElement) {
      try { d.documentElement.setAttribute('lang', l); } catch (e) { /* ignore */ }
      try { d.documentElement.lang = l; } catch (e2) { /* ignore */ }
    }
    fire('niv:lang', { lang: l });
    return l;
  }

  function applyCompactToDocument(compact) {
    var on = (compact === undefined) ? getCompact() : !!compact;
    var d = doc();
    if (d && d.documentElement && d.documentElement.classList) {
      try { d.documentElement.classList.toggle('niv-compact', on); }
      catch (e) { /* ignore */ }
    }
    fire('niv:compact', { compact: on });
    return on;
  }

  function getLang() {
    return get('nivelato-login-lang') || 'es';
  }

  function setLang(v) {
    var l = validateValue('nivelato-login-lang', v);
    if (l === null) return false;
    if (!set('nivelato-login-lang', l)) return false;
    applyLangToDocument(l);
    return true;
  }

  function getCompact() {
    return get('niv-compact-sidebar') === '1';
  }

  function setCompact(on) {
    if (!set('niv-compact-sidebar', on ? '1' : '0')) return false;
    applyCompactToDocument(!!on);
    return true;
  }

  function getBackend() { return probe(); }

  /* ------------------------------------------------------------------ */
  /* Adoption + mirror reconciliation on first load                      */
  /* ------------------------------------------------------------------ */

  function adopt() {
    for (var i = 0; i < ALLOWLIST.length; i++) {
      var key = ALLOWLIST[i];
      var def = DEFS[key];
      var cookieVal = readCookieRaw(key);
      var validCookie = (cookieVal === null) ? null : validateValue(key, cookieVal);
      if (validCookie !== null) {
        /* Cookie exists: it wins. Re-sync the mirror FROM the cookie so
         * legacy localStorage readers on THIS origin see the value that
         * was set on another origin. Never the other way round. */
        if (def.mirror && lsGet(def.lsKey) !== validCookie) {
          lsSet(def.lsKey, validCookie);
        }
        continue;
      }
      var lsVal = def.lsKey ? lsGet(def.lsKey) : null;
      var validLs = (lsVal === null) ? null : validateValue(key, lsVal);
      if (validLs !== null) {
        /* Cookie absent, localStorage has a value: adopt it upward. */
        persist(key, validLs);
      }
    }
    /* Reflect the resolved language on <html> immediately (attribute
     * only; the niv:lang event is reserved for explicit changes, so
     * listeners registered later are not fired into the void). */
    var lang = getLang();
    var d = doc();
    if (d && d.documentElement) {
      try { d.documentElement.setAttribute('lang', lang); } catch (e) { /* ignore */ }
      try { d.documentElement.lang = lang; } catch (e2) { /* ignore */ }
    }
  }

  var api = {
    get: get,
    set: set,
    remove: remove,
    getLang: getLang,
    setLang: setLang,
    getCompact: getCompact,
    setCompact: setCompact,
    applyLangToDocument: applyLangToDocument,
    applyCompactToDocument: applyCompactToDocument,
    getBackend: getBackend,
    KEYS: {
      lang: 'nivelato-login-lang',
      compact: 'niv-compact-sidebar',
      panelWidth: 'niv-panel-width',
      panelSections: 'niv-panel-sections',
      legacyLang: 'niv-lang'
    },
    ALLOWLIST: ALLOWLIST.slice(),
    _internal: {
      parseCookieString: parseCookieString,
      buildCookieString: buildCookieString,
      buildDeleteString: buildDeleteString,
      DEFS: DEFS
    }
  };

  global.NivSettings = api;

  try { adopt(); } catch (e) { /* adoption is best effort, never fatal */ }
})(typeof window !== 'undefined' ? window : this);
