// company-theme.js — decides whether the QGC gray theme applies.
// QGC users get the depressing gray; everyone else gets standard Nivelato.
// Plain script (no modules): load it early in <head> so the fast path runs
// before first paint. Pages call window.applyCompanyTheme(userData) after
// loading users/{uid}, or window.applyCompanyThemeFromAuth(auth) to fall
// back to ID-token claims when they never load the user doc.
(function () {
  var FLAG = 'nivelato_company_theme';

  function readFlag() {
    try { return localStorage.getItem(FLAG); } catch (_) { return null; }
  }
  function writeFlag(v) {
    try { localStorage.setItem(FLAG, v); } catch (_) { /* ignore */ }
  }

  function setQgc(on) {
    var apply = function () {
      if (on) document.body.classList.add('qgc-theme');
      else document.body.classList.remove('qgc-theme');
    };
    if (document.body) apply();
    else document.addEventListener('DOMContentLoaded', apply);
    writeFlag(on ? 'qgc' : 'standard');
  }

  function isQgcUser(userData) {
    if (!userData) return false;
    return userData.isQGC === true || userData.company === 'qgc';
  }

  // Pages call this after loading users/{uid}. Source of truth.
  window.applyCompanyTheme = function (userData) {
    setQgc(isQgcUser(userData));
  };

  // Fallback for pages that never load the user doc: claims.flow === 'qgi'
  // is the QGC/PR flow. Call with the page's Firebase auth instance once
  // it's initialized (or rely on onAuthStateChanged having fired already).
  window.applyCompanyThemeFromAuth = function (auth) {
    try {
      if (!auth || !auth.currentUser) return;
      auth.currentUser.getIdTokenResult().then(function (res) {
        var claims = (res && res.claims) || {};
        setQgc(claims.flow === 'qgi');
      }).catch(function () { /* keep current */ });
    } catch (_) { /* keep current */ }
  };

  // Fast path: returning QGC users skip the flash of standard UI.
  // Runs at parse time. If the flag disagrees with the real user doc, the
  // page's applyCompanyTheme call corrects it right after auth loads.
  if (readFlag() === 'qgc') {
    var fast = function () { document.body.classList.add('qgc-theme'); };
    if (document.body) fast();
    else document.addEventListener('DOMContentLoaded', fast);
  }

  window.__companyTheme = { setQgc: setQgc, readFlag: readFlag };
})();
