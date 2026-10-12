/* Referrer-aware back button, shared by the settings tier pages.
 *
 * Her spec: the Back button on user settings used to ride history.back(),
 * which in practice dumped people back on Company settings because that
 * is where the "Mi cuenta" link lives. Instead, the page you came FROM
 * is saved when you navigate into a settings page, and Back returns
 * there. Falls back to the dashboard panel.
 *
 * Storage pick: sessionStorage, not a cookie. The codebase keeps its UI
 * state in web storage (panel width, language, compact mode), and the
 * referrer only has meaning for the current tab's navigation session:
 * sessionStorage dies with the tab, so a stale referrer can never trap
 * a later visit, and nothing extra rides along on every request the
 * way a cookie would. The value is consumed (read + removed) on load.
 *
 * Safety: the saved value is only honored if it resolves to a
 * same-origin path on a small allowlist of app destinations, and never
 * to the page itself. document.referrer gets the same checks as a
 * fallback for navigations no click handler saw (for example the
 * /company/users bounce for non-managers).
 *
 * Generalization (wave 3): the consume side used to run only on
 * /account/settings, so company/settings.html and updates.html each
 * carried an inline copy of the same logic. The PAGES table below is
 * the whole per-page difference: storage key (pages that own one),
 * allowlist, back-button selector, and how "never self" is checked.
 * A page opts in by including this script, exactly as before; the
 * inline copies are gone. Each page keeps the outcomes it had:
 *
 * - /account/settings: key niv:settings-referrer, exposed save hook
 *   nivSaveSettingsReferrer, [data-niv-to-settings] clicks also save,
 *   back button matched by .niv-btn-back, onclick removed on apply.
 * - /company/settings: its own key niv:company-settings-referrer and
 *   hook nivSaveCompanySettingsReferrer (the saved key belongs to the
 *   company settings visit, never the account one), the widest
 *   allowlist (it also allows /account/settings and /users), back
 *   button matched by .niv-btn-back.
 * - /company/updates: no storage key at all. This page never owned a
 *   saved referrer; it only mirrors its allowlist against
 *   document.referrer, and it must not touch the settings keys, which
 *   belong to the settings visits. Its "never self" check compares
 *   path + search, as its inline copy did, so a referrer to this page
 *   with a different query string is still honored.
 */
(function () {
  var FALLBACK = '/dashboard.html?view=home';

  var PAGES = {
    '/account/settings': {
      key: 'niv:settings-referrer',
      saveName: 'nivSaveSettingsReferrer',
      allowed: ['/', '/dashboard.html', '/company/users', '/company/settings', '/company/updates', '/photo.html'],
      selector: '.niv-btn-back',
      removeOnclick: true,
      selfByPath: true
    },
    '/company/settings': {
      key: 'niv:company-settings-referrer',
      saveName: 'nivSaveCompanySettingsReferrer',
      allowed: ['/', '/dashboard.html', '/company/users', '/company/updates', '/account/settings', '/users', '/photo.html'],
      selector: '.niv-btn-back',
      removeOnclick: false,
      selfByPath: true
    },
    '/company/updates': {
      key: null,
      saveName: null,
      allowed: ['/', '/dashboard.html', '/company/users', '/company/settings', '/company/updates', '/photo.html'],
      selector: '#btn-back',
      removeOnclick: false,
      selfByPath: false
    }
  };

  function pageFor(path) {
    return Object.prototype.hasOwnProperty.call(PAGES, path) ? PAGES[path] : null;
  }

  function cleanTarget(cfg, raw) {
    if (!raw) return null;
    try {
      var u = new URL(raw, window.location.origin);
      if (u.origin !== window.location.origin) return null;
      if (cfg.selfByPath) {
        if (u.pathname === window.location.pathname) return null;
      } else if (u.pathname + u.search === window.location.pathname + window.location.search) {
        return null;
      }
      if (cfg.allowed.indexOf(u.pathname) === -1) return null;
      return u.pathname + u.search;
    } catch (e) { return null; }
  }

  function saveFor(cfg) {
    try {
      sessionStorage.setItem(cfg.key, window.location.pathname + window.location.search);
    } catch (e) { /* storage unavailable: the fallback chain still works */ }
  }

  // Exposed for JS-driven navigations (dashboard account popup button,
  // the /company/users redirect for non-managers, and the company
  // settings equivalent). Each hook saves under its own page's key.
  Object.keys(PAGES).forEach(function (path) {
    var cfg = PAGES[path];
    if (cfg.key && cfg.saveName) {
      window[cfg.saveName] = function () { saveFor(cfg); };
    }
  });

  // Capture: any click that navigates into a keyed settings page
  // records the page it happened on, under that page's key. Capture
  // phase, so it runs before the target's own navigation handler.
  // A [data-niv-to-settings] element means Account settings, as before,
  // and takes precedence over the anchor destination.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var dest = null;
    var a = t.closest('a[href]');
    if (a) {
      try { dest = new URL(a.getAttribute('href'), window.location.origin).pathname; } catch (err) { dest = null; }
    }
    if (dest !== '/account/settings' && t.closest('[data-niv-to-settings]')) dest = '/account/settings';
    var cfg = dest ? pageFor(dest) : null;
    if (cfg && cfg.key) saveFor(cfg);
  }, true);

  // Consume: only on a page in the table.
  var cfg = pageFor(window.location.pathname);
  if (!cfg) return;
  var target = null;
  if (cfg.key) {
    try {
      var saved = sessionStorage.getItem(cfg.key);
      if (saved) {
        sessionStorage.removeItem(cfg.key); // one-shot: never trap a later visit
        target = cleanTarget(cfg, saved);
      }
    } catch (e) { /* ignore */ }
  }
  if (!target) target = cleanTarget(cfg, document.referrer);
  if (!target) target = FALLBACK;
  var apply = function () {
    var btn = cfg.selector.charAt(0) === '#'
      ? document.getElementById(cfg.selector.slice(1))
      : document.querySelector(cfg.selector);
    if (btn) {
      btn.setAttribute('href', target);
      if (cfg.removeOnclick) btn.removeAttribute('onclick');
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
