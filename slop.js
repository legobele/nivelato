// slop.js — press "a" then "i" in rapid succession and the page shows you
// exactly what it thinks of ai slop. then it reloads. as a treat.
// (Skips keystrokes inside inputs — your password is safe from judgment.)
(function () {
  var lastA = 0;
  var WINDOW_MS = 400;
  document.addEventListener('keydown', function (e) {
    var tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.isComposing) return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var k = (e.key || '').toLowerCase();
    var now = Date.now();
    if (k === 'a') { lastA = now; return; }
    if (k === 'i' && now - lastA < WINDOW_MS) {
      lastA = 0;
      slop();
    } else {
      lastA = 0;
    }
  });
  function slop() {
    var ov = document.createElement('div');
    ov.setAttribute('aria-hidden', 'true');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0c0c0e;' +
      'display:flex;align-items:center;justify-content:center;';
    var p = document.createElement('div');
    p.textContent = 'your ai slop bores me';
    p.style.cssText = 'color:#f2f1ec;font-size:22px;font-style:italic;text-align:center;padding:0 24px;';
    ov.appendChild(p);
    document.documentElement.appendChild(ov);
    setTimeout(function () { location.reload(); }, 1400);
  }
})();
