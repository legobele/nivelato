/* Referrer-aware back button for Account settings.
 *
 * Her spec: the Back button on user settings used to ride history.back(),
 * which in practice dumped people back on Company settings because that
 * is where the "Mi cuenta" link lives. Instead, the page you came FROM
 * is saved when you navigate into Account settings, and Back returns
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
 * to the settings page itself. document.referrer gets the same checks
 * as a fallback for navigations no click handler saw (for example the
 * /company/users bounce for non-managers).
 */
(function () {
  var KEY = 'niv:settings-referrer';
  var SETTINGS_PATH = '/account/settings';
  var FALLBACK = '/dashboard.html?view=home';
  var ALLOWED = ['/', '/dashboard.html', '/company/users', '/company/settings', '/company/updates', '/photo.html'];

  function cleanTarget(raw) {
    if (!raw) return null;
    try {
      var u = new URL(raw, window.location.origin);
      if (u.origin !== window.location.origin) return null;
      if (ALLOWED.indexOf(u.pathname) === -1) return null;
      return u.pathname + u.search;
    } catch (e) { return null; }
  }

  function save() {
    try {
      sessionStorage.setItem(KEY, window.location.pathname + window.location.search);
    } catch (e) { /* storage unavailable: the fallback chain still works */ }
  }
  // Exposed for JS-driven navigations (dashboard account popup button,
  // the /company/users redirect for non-managers).
  window.nivSaveSettingsReferrer = save;

  // Capture: any click that navigates into Account settings records the
  // page it happened on. Capture phase, so it runs before the target's
  // own navigation handler.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var dest = null;
    var a = t.closest('a[href]');
    if (a) {
      try { dest = new URL(a.getAttribute('href'), window.location.origin).pathname; } catch (err) { dest = null; }
    }
    if (dest !== SETTINGS_PATH && t.closest('[data-niv-to-settings]')) dest = SETTINGS_PATH;
    if (dest === SETTINGS_PATH) save();
  }, true);

  // Consume: only on the Account settings page itself.
  if (window.location.pathname !== SETTINGS_PATH) return;
  var target = null;
  try {
    var saved = sessionStorage.getItem(KEY);
    if (saved) {
      sessionStorage.removeItem(KEY); // one-shot: never trap a later visit
      target = cleanTarget(saved);
    }
  } catch (e) { /* ignore */ }
  if (!target) target = cleanTarget(document.referrer);
  if (!target) target = FALLBACK;
  var apply = function () {
    var btn = document.querySelector('.btn-back');
    if (btn) {
      btn.setAttribute('href', target);
      btn.removeAttribute('onclick');
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
