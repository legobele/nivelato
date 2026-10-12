// pr-ultra.js — PR localization rule for static web surfaces.
//
// In Puerto Rico the Ultra tier does not exist: it is not shown, not
// purchasable, and not referenced. Pages opt in by marking Ultra content
// with [data-ultra] and loading this script; for PR visitors those
// elements are removed from the DOM. Elements with [data-ultra-alt] are
// PR-only variants (hidden by default via inline style) and are revealed
// instead.
//
// Detection is the same ipapi.co country lookup geo.js uses (routing/UI
// only; enforcement is server-side). Unknown or unreachable geo defaults
// to the EXTERNAL experience (geo spec §6.3): Ultra stays visible, so a
// failed lookup can never hide a real product from a real customer.
(function () {
  function apply(isPR) {
    if (!isPR) return;
    var nodes = document.querySelectorAll('[data-ultra]');
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
    var alts = document.querySelectorAll('[data-ultra-alt]');
    for (var j = 0; j < alts.length; j++) alts[j].style.display = '';
  }
  var cached = null;
  try { cached = sessionStorage.getItem('niv_country'); } catch (e) { /* private mode */ }
  if (cached) { apply(cached === 'PR'); return; }
  var done = false;
  var ctl = ('AbortController' in window) ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 4000);
  fetch('https://ipapi.co/country/', ctl ? { signal: ctl.signal } : {})
    .then(function (res) { return res.ok ? res.text() : ''; })
    .then(function (text) {
      if (done) return; done = true; clearTimeout(timer);
      var cc = (text || '').trim().toUpperCase();
      if (cc && cc !== 'UNDEFINED') {
        try { sessionStorage.setItem('niv_country', cc); } catch (e) { /* ignore */ }
        apply(cc === 'PR');
      }
    })
    .catch(function () { /* sin geo: experiencia externa por defecto */ });
})();
