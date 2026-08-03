// bread.js — Ctrl+Alt+B to fill the graph with a bread
// Covers the graph area with bread.webp, cropped to the shape of the graph.
(function () {
  const KEY = 'nivelato-bread';
  let enabled = localStorage.getItem(KEY) === '1';
  let img = null;
  let imgSrc = null;
  let queue = [];

  function load(cb) {
    if (imgSrc === 'bread.webp') { if (cb) cb(); return; }
    img = new Image();
    img.onload = () => { imgSrc = 'bread.webp'; queue.forEach(q => q()); queue = []; if (cb) cb(); };
    img.onerror = () => { imgSrc = 'broken'; queue.forEach(q => q()); queue = []; if (cb) cb(); };
    img.src = 'bread.webp';
  }

  function draw(ctx, w, h) {
    if (!enabled) return;
    if (imgSrc === 'broken') return;
    if (imgSrc !== 'bread.webp') { queue.push(() => draw(ctx, w, h)); if (!img) load(); return; }
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingQuality = 'high';
    // cover-fit: fill the whole graph area, cropped to shape
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function toggle() {
    enabled = !enabled;
    localStorage.setItem(KEY, enabled ? '1' : '0');
    document.dispatchEvent(new CustomEvent('breadchange'));
    load(function () {});
  }

  window.BREAD = {
    toggle: toggle,
    isOn: function () { return enabled; },
    draw: draw,
    load: load
  };

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.altKey && (e.key === 'B' || e.key === 'b')) {
      const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      toggle();
    }
  });
})();
