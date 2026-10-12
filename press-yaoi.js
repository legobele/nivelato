// press-yaoi.js — type "yaoi" fast anywhere outside a form field and a
// "press me for yaoi" button appears at a random spot in the viewport.
// Clicking it opens AO3 in a new tab and the button goes away. Esc also
// dismisses it. Re-typing the sequence while it is visible just moves it.
// No persistence, no analytics, no mercy.
(function () {
  var SEQUENCE = 'yaoi';
  var WINDOW_MS = 1500; // the whole sequence must land inside this window
  var BUTTON_ID = 'press-yaoi-btn';

  var presses = []; // [{ key, t }]

  function isFormField(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
  }

  function dismiss() {
    var btn = document.getElementById(BUTTON_ID);
    if (btn) btn.remove();
  }

  function summon() {
    var btn = document.getElementById(BUTTON_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = BUTTON_ID;
      btn.type = 'button';
      btn.textContent = 'press me for yaoi';
      btn.style.cssText = [
        'position:fixed',
        'z-index:2147483000',
        'padding:12px 22px',
        'border:none',
        'border-radius:9999px',
        'background:#ff8cc6',
        'color:#1a1a1e',
        'font:600 15px Inter,-apple-system,"Segoe UI",sans-serif',
        'cursor:pointer',
        'box-shadow:0 10px 32px rgba(0,0,0,.5)',
        'white-space:nowrap'
      ].join(';');
      btn.addEventListener('click', function () {
        window.open('https://archiveofourown.org', '_blank');
        dismiss();
      });
      document.body.appendChild(btn);
    }
    // Random spot inside the viewport, clamped so the whole button fits.
    var margin = 12;
    var maxLeft = Math.max(margin, window.innerWidth - btn.offsetWidth - margin);
    var maxTop = Math.max(margin, window.innerHeight - btn.offsetHeight - margin);
    btn.style.left = (margin + Math.random() * (maxLeft - margin)) + 'px';
    btn.style.top = (margin + Math.random() * (maxTop - margin)) + 'px';
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { dismiss(); return; }
    if (e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isFormField(e.target)) return;
    if (!e.key || e.key.length !== 1) return;

    var now = Date.now();
    presses.push({ key: e.key.toLowerCase(), t: now });
    // Keep only presses that can still belong to an in-window sequence.
    presses = presses.filter(function (p) { return now - p.t <= WINDOW_MS; });
    if (presses.length < SEQUENCE.length) return;

    var recent = presses.slice(-SEQUENCE.length);
    var typed = recent.map(function (p) { return p.key; }).join('');
    if (typed === SEQUENCE && recent[recent.length - 1].t - recent[0].t <= WINDOW_MS) {
      presses = [];
      summon();
    }
  });
})();
