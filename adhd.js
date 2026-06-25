// adhd.js — Nivelato logic + canvas engine

// ─── FRACTION HELPERS ──────────────────────────────────────────────────────
function readVal(wholeId, fracId) {
  // Allow override via _embedData for embedded graphs (dashboard)
  if (window._embedData && window._embedData[wholeId] !== undefined) {
    return window._embedData[wholeId];
  }
  const whole = parseFloat(document.getElementById(wholeId)?.value) || 0;
  const frac  = parseFloat(document.getElementById(fracId)?.value)  || 0;
  return whole + frac;
}

function parseLabelValue(str) {
  if (!str || str === 'Nivel' || str === '—') return 0;
  var m = str.match(/([\d\/\. ]+)"/);
  if (!m) return 0;
  var parts = m[1].trim().split(' ');
  var val = 0;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].includes('/')) { var f = parts[i].split('/'); val += parseFloat(f[0])/parseFloat(f[1]); }
    else val += parseFloat(parts[i]) || 0;
  }
  return val;
}

function setVal(wholeId, fracId, decimal) {
  const whole = Math.floor(Math.abs(decimal));
  const frac  = Math.abs(decimal) - whole;
  const sixteenths = Math.round(frac * 16);
  const fracVal = sixteenths / 16;
  const wholeEl = document.getElementById(wholeId);
  const fracEl = document.getElementById(fracId);
  if (wholeEl) wholeEl.value = whole || '';
  if (fracEl) {
    const options = Array.from(fracEl.options);
    let closest = options[0];
    let minDiff = Infinity;
    for (const opt of options) {
      const v = parseFloat(opt.value);
      const diff = Math.abs(v - fracVal);
      if (diff < minDiff) { minDiff = diff; closest = opt; }
    }
    fracEl.value = closest.value;
  }
}

function toFracStr(decimal) {
  if (decimal === 0) return '0"';
  const whole = Math.floor(Math.abs(decimal));
  const frac  = Math.abs(decimal) - whole;
  const sixteenths = Math.round(frac * 16);
  const sign = decimal < 0 ? '-' : '';
  if (sixteenths === 0)  return `${sign}${whole}"`;
  if (sixteenths === 16) return `${sign}${whole + 1}"`;
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const g = gcd(sixteenths, 16);
  const n = sixteenths / g, d = 16 / g;
  if (whole === 0) return `${sign}${n}/${d}"`;
  return `${sign}${whole} ${n}/${d}"`;
}

// ─── STEP STATE ────────────────────────────────────────────────────────────
let currentStep = 0;
const TOTAL_STEPS = 6;
let _historyPushed = 0;

function getLingerView(leavingStep) {
  if (leavingStep === 2) {
    const hasA = readVal('pI-a-whole','pI-a-frac') > 0;
    const hasB = readVal('pI-b-whole','pI-b-frac') > 0;
    if (hasA && hasB) return { focusX: 0.0, focusY: 0.5, zoom: 2.2 };
    if (hasA)         return { focusX: 0.0, focusY: 1.0, zoom: 3.0 };
    if (hasB)         return { focusX: 0.0, focusY: 0.0, zoom: 3.0 };
  }
  if (leavingStep === 3) {
    const hasA = readVal('pD-a-whole','pD-a-frac') > 0;
    const hasB = readVal('pD-b-whole','pD-b-frac') > 0;
    if (hasA && hasB) return { focusX: 1.0, focusY: 0.5, zoom: 2.2 };
    if (hasA)         return { focusX: 1.0, focusY: 1.0, zoom: 3.0 };
    if (hasB)         return { focusX: 1.0, focusY: 0.0, zoom: 3.0 };
  }
  if (leavingStep === 4) {
    const hasA = readVal('t-a-whole','t-a-frac') > 0;
    const hasB = readVal('t-b-whole','t-b-frac') > 0;
    if (hasA && hasB) return { focusX: 0.5, focusY: 0.0, zoom: 2.2 };
    if (hasA)         return { focusX: 0.0, focusY: 0.0, zoom: 3.0 };
    if (hasB)         return { focusX: 1.0, focusY: 0.0, zoom: 3.0 };
  }
  if (leavingStep === 5) {
    const hasA = readVal('p-a-whole','p-a-frac') > 0;
    const hasB = readVal('p-b-whole','p-b-frac') > 0;
    if (hasA && hasB) return { focusX: 0.5, focusY: 1.0, zoom: 2.2 };
    if (hasA)         return { focusX: 0.0, focusY: 1.0, zoom: 3.0 };
    if (hasB)         return { focusX: 1.0, focusY: 1.0, zoom: 3.0 };
  }
  return null;
}

function goStep(n, skipHistory) {
  userZoomed = false; // reset auto-focus on each step transition
  const leavingStep = currentStep;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('step-' + n)?.classList.add('active');
  currentStep = n;
  document.getElementById('step-num').textContent = n;
  const pct = Math.max(0, ((n + 1) / TOTAL_STEPS) * 100);
  document.getElementById('progress-bar').style.width = pct + '%';
  recalcAll();
  if (n === TOTAL_STEPS) renderSummary();

  if (!skipHistory) {
    history.pushState({ step: n }, '', '#step-' + n);
    _historyPushed++;
  }

  const linger = getLingerView(leavingStep);
  if (linger && n !== TOTAL_STEPS && !userZoomed) {
    const W  = canvas.width  / window.devicePixelRatio;
    const H  = canvas.height / window.devicePixelRatio;
    const gr = getGlassRect();
    const wx = gr.x + linger.focusX * gr.w;
    const wy = gr.y + linger.focusY * gr.h;
    vpTarget.scale = linger.zoom;
    vpTarget.x = W / 2 - wx * linger.zoom;
    vpTarget.y = H / 2 - wy * linger.zoom;
    if (animFrame) cancelAnimationFrame(animFrame);
    smoothAnimate();
    setTimeout(() => animateCanvas(n), 800);
  } else {
    if (!userZoomed) animateCanvas(n);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextStep() { if (currentStep < TOTAL_STEPS) goStep(currentStep + 1); }
function prevStep() { if (currentStep > -1)          goStep(currentStep - 1); }

window.addEventListener('popstate', function(e) {
  if (e.state && typeof e.state.step === 'number') {
    const targetStep = e.state.step;
    if (targetStep >= 0 && targetStep <= TOTAL_STEPS && targetStep !== currentStep) {
      document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('step-' + targetStep)?.classList.add('active');
      currentStep = targetStep;
      document.getElementById('step-num').textContent = targetStep;
      const pct = (targetStep / TOTAL_STEPS) * 100;
      document.getElementById('progress-bar').style.width = pct + '%';
      recalcAll();
      if (targetStep === TOTAL_STEPS) renderSummary();
      if (!userZoomed) animateCanvas(targetStep);
    }
  }
});

// ─── CALCULATIONS ──────────────────────────────────────────────────────────
let results = {};

function calcDesnivel_wall(a, b) {
  const diff = a - b;
  if (Math.abs(diff) < 0.001) return { val: 0, dir: 'NIVEL', label: 'Nivel', raw: 0 };
  const val = Math.abs(diff);
  const arrow = diff > 0 ? '⟩' : '⟨';
  return { val: val, dir: arrow, label: arrow + ' ' + toFracStr(val), raw: diff };
}

function calcDesnivel_horiz(a, b) {
  const diff = a - b;
  if (Math.abs(diff) < 0.001) return { val: 0, dir: 'NIVEL', label: 'Nivel', raw: 0 };
  const val = Math.abs(diff);
  // offset on LEFT reference: if right is higher the ceiling drops on left = ↓
  const dir = diff > 0 ? "↓" : "↑";
  return { val: val, dir: dir, label: dir + ' ' + toFracStr(val), raw: diff };
}

function recalcAll() {
  const pI_A = readVal('pI-a-whole', 'pI-a-frac');
  const pI_B = readVal('pI-b-whole', 'pI-b-frac');
  const pD_A = readVal('pD-a-whole', 'pD-a-frac');
  const pD_B = readVal('pD-b-whole', 'pD-b-frac');
  const t_A  = readVal('t-a-whole',  't-a-frac');
  const t_B  = readVal('t-b-whole',  't-b-frac');
  const p_A  = readVal('p-a-whole',  'p-a-frac');
  const p_B  = readVal('p-b-whole',  'p-b-frac');

  results.paredIzq = calcDesnivel_wall(pI_A, pI_B);
  results.paredDer = calcDesnivel_wall(pD_A, pD_B);
  // Fix right wall arrow direction: lean-in on right wall means ← not →
  if (results.paredDer.raw > 0) {
    results.paredDer.dir = '\u27e8';
    results.paredDer.label = '\u27e8 ' + toFracStr(results.paredDer.val);
  } else if (results.paredDer.raw < 0) {
    results.paredDer.dir = '\u27e9';
    results.paredDer.label = '\u27e9 ' + toFracStr(results.paredDer.val);
  }
  results.techo = calcDesnivel_horiz(t_A, t_B);
  results.piso  = calcDesnivel_horiz(p_A, p_B);
  // Floor direction is opposite of ceiling: bigger left = floor rises right (↑)
  if (results.piso.raw > 0) {
    results.piso.dir = '\u2191';
    results.piso.label = '\u2191 ' + toFracStr(results.piso.val);
  } else if (results.piso.raw < 0) {
    results.piso.dir = '\u2193';
    results.piso.label = '\u2193 ' + toFracStr(results.piso.val);
  }
  const anchoBot = readVal('hueco-ancho-bot-whole','hueco-ancho-bot-frac') || 0;
  const altoIzq  = readVal('hueco-alto-izq-whole', 'hueco-alto-izq-frac')  || 0;

  // Computed dimensions from desniveles
  // Top width = bottom width - left wall lean - right wall lean
  // Right height = left height - ceiling tilt - floor tilt
  results.anchoTop = anchoBot > 0 ? anchoBot - results.paredIzq.raw - results.paredDer.raw : 0;
  results.altoDer  = altoIzq > 0  ? altoIzq - results.techo.raw - results.piso.raw : 0;

  updatePill('desn-pared-izq', results.paredIzq);
  updatePill('desn-pared-der', results.paredDer);
  updatePill('desn-techo',     results.techo);
  updatePill('desn-piso',      results.piso);


  drawCanvas();
}

function updatePill(id, result) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = result.label;
  if (result.val > 0) el.classList.add('has-value');
  else el.classList.remove('has-value');
}

// ─── VALIDATION ────────────────────────────────────────────────────────────
const TOLERANCE = 0.0625;

function runValidation() {
  const warnings = [];
  const pI_A = readVal('pI-a-whole','pI-a-frac'), pI_B = readVal('pI-b-whole','pI-b-frac');
  const pD_A = readVal('pD-a-whole','pD-a-frac'), pD_B = readVal('pD-b-whole','pD-b-frac');
  const t_A  = readVal('t-a-whole', 't-a-frac'),  t_B  = readVal('t-b-whole', 't-b-frac');
  const p_A  = readVal('p-a-whole', 'p-a-frac'),  p_B  = readVal('p-b-whole', 'p-b-frac');
  const anchoBot = readVal('hueco-ancho-bot-whole','hueco-ancho-bot-frac');
  const altoIzq  = readVal('hueco-alto-izq-whole', 'hueco-alto-izq-frac');
  const anyEntered = pI_A||pI_B||pD_A||pD_B||t_A||t_B||p_A||p_B;
  if (!anyEntered) return [];

  if ((pI_A > 0||pI_B > 0) && (pD_A > 0||pD_B > 0)) {
    const offsetIzq = pI_A - pI_B;
    const offsetDer = pD_A - pD_B;
    if (Math.abs(offsetIzq - offsetDer) > TOLERANCE) {}
  }
  if ((t_A > 0||t_B > 0) && (p_A > 0||p_B > 0)) {
    const offsetTecho = t_A - t_B;
    const offsetPiso  = p_A - p_B;
  }
  if ((pI_A||pI_B||pD_A||pD_B||p_A||p_B) && t_A === 0 && t_B === 0)
    warnings.push('⚠ Faltan niveles de arriba — mide del láser arriba en punto A (izq) y punto B (der)');
  if (anyEntered && (anchoBot === 0 || altoIzq === 0))
    warnings.push('⚠ Falta medida base del hueco — ingresa Ancho Abajo y Alto Izquierda');
  return warnings;
}

// ─── AUTO-FIX ACTIONS ──────────────────────────────────────────────────────
function autoFix(warningText) {
  if (warningText.includes('Paredes no cuadran')) {
    const pI_A = readVal('pI-a-whole','pI-a-frac');
    const pI_B = readVal('pI-b-whole','pI-b-frac');
    const raw   = pI_A - pI_B;
    const pD_A  = document.getElementById('pD-a-whole');
    const pD_B  = document.getElementById('pD-b-whole');
    if (pD_A && pD_B) {
      const absRaw = Math.abs(raw);
      const whole  = Math.floor(absRaw);
      const frac   = absRaw - whole;
      const fracStr = frac < 0.001 ? '0' : frac < 0.14 ? '1/8' : frac < 0.2 ? '3/16' :
                      frac < 0.27 ? '1/4' : frac < 0.39 ? '3/8' : frac < 0.52 ? '1/2' :
                      frac < 0.64 ? '5/8' : frac < 0.77 ? '3/4' : frac < 0.89 ? '7/8' : '0';
      pD_A.value = whole || '';
      pD_B.value = '';
      document.getElementById('pD-a-frac').value = fracStr;
      document.getElementById('pD-b-frac').value = '0';
      recalcAll();
      goStep(2);
    }
    return;
  }
  if (warningText.includes('Arriba/Abajo no cuadran')) {
    const t_A = readVal('t-a-whole','t-a-frac');
    const t_B = readVal('t-b-whole','t-b-frac');
    const raw  = t_A - t_B;
    const pA   = document.getElementById('p-a-whole');
    const pB   = document.getElementById('p-b-whole');
    if (pA && pB) {
      const absRaw = Math.abs(raw);
      const whole  = Math.floor(absRaw);
      const frac   = absRaw - whole;
      const fracStr = frac < 0.001 ? '0' : frac < 0.14 ? '1/8' : frac < 0.2 ? '3/16' :
                      frac < 0.27 ? '1/4' : frac < 0.39 ? '3/8' : frac < 0.52 ? '1/2' :
                      frac < 0.64 ? '5/8' : frac < 0.77 ? '3/4' : frac < 0.89 ? '7/8' : '0';
      pA.value = whole || '';
      pB.value = '';
      document.getElementById('p-a-frac').value = fracStr;
      document.getElementById('p-b-frac').value = '0';
      recalcAll();
      goStep(4);
    }
    return;
  }
  if (warningText.includes('Faltan niveles de arriba')) {
    goStep(3);
    return;
  }
  if (warningText.includes('Falta medida base')) {
    goStep(0);
    return;
  }
}

let _lastWarnings = [];

function renderValidation() {
  const el = document.getElementById('validation-block');
  if (!el) return;
  const warnings = runValidation();
  _lastWarnings = warnings;
  if (warnings.length === 0) {
    el.textContent = '✓ Medidas OK';
    el.className = 'val-ok';
  } else {
    el.innerHTML = warnings.map(function(w, i) {
      return '<div style="margin-bottom:6px">' + w + ' <button data-widx="' + i + '" class="arreglar-btn" style="margin-left:8px;padding:2px 10px;border-radius:12px;border:none;background:#e07b00;color:#fff;font-size:12px;cursor:pointer;font-weight:600">Arreglar →</button></div>';
    }).join('');
    el.className = 'val-warn';
    el.querySelectorAll('.arreglar-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { autoFix(_lastWarnings[+btn.dataset.widx] || ''); });
    });
  }
}

// ─── SUMMARY ───────────────────────────────────────────────────────────────
function renderSummary() {
  const anchoBot = readVal('hueco-ancho-bot-whole','hueco-ancho-bot-frac');
  const altoIzq  = readVal('hueco-alto-izq-whole', 'hueco-alto-izq-frac');
  const anchoTop = results.anchoTop || 0;
  const altoDer  = results.altoDer  || 0;
  const set = function(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; };
  set('res-area', (anchoBot > 0 ? toFracStr(anchoBot) : '—') + ' × ' + (altoIzq > 0 ? toFracStr(altoIzq) : '—') + ' (base)');
  set('res-pared-izq', results.paredIzq?.label || '—');
  set('res-pared-der', results.paredDer?.label || '—');
  set('res-techo',     results.techo?.label    || '—');
  set('res-piso',      results.piso?.label     || '—');
  renderValidation();
}

// ─── SHARE ─────────────────────────────────────────────────────────────────
function showShare() {
  const warnings = runValidation();
  if (warnings.length > 0) {
    const ok = confirm('Hay advertencias en las medidas:\n\n' + warnings.join('\n') + '\n\n¿Continuar de todas formas?');
    if (!ok) return;
  }
  const block = document.getElementById('share-block');
  if (block) block.classList.remove('hidden');
  setTimeout(function() {
    if (block) block.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 50);
  _saveCurrentJob(warnings);
}

function _saveCurrentJob(warnings) {
  if (typeof window.saveJobToFirestore !== 'function') return;
  const anchoBot = readVal('hueco-ancho-bot-whole','hueco-ancho-bot-frac');
  const altoIzq  = readVal('hueco-alto-izq-whole', 'hueco-alto-izq-frac');
  const anchoTop = results.anchoTop || 0;
  const altoDer  = results.altoDer  || 0;
  const notas = document.getElementById('notas-field')?.value || '';
  const customer = document.getElementById('customer-name')?.value || '';
  const project = document.getElementById('project-name')?.value || '';
  const location = document.getElementById('location-name')?.value || '';
  const jobData = {
    hueco: { anchoBot: anchoBot, altoIzq: altoIzq, anchoTop: anchoTop, altoDer: altoDer },
    desniveles: {
      paredIzq: results.paredIzq?.label || null,
      paredDer: results.paredDer?.label || null,
      techo:    results.techo?.label    || null,
      piso:     results.piso?.label     || null,
    },
    customer: customer,
    project: project,
    location: location,
    warnings: warnings || [],
    notas: notas
  };
  window.saveJobToFirestore(jobData).then(function() {
    const el = document.getElementById('save-status');
    if (el) { el.style.display = 'block'; setTimeout(function() { el.style.display = 'none'; }, 4000); }
    const overlay = document.createElement('div');
    overlay.innerHTML='☁️ Guardado en la nube';overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(25,135,84,0.92);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;animation:fadeInOut 2.2s ease forwards;'
    overlay.style.cssText = 'position:fixed; inset:0; z-index:9999; background:rgba(25,135,84,0.92); color:#fff; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:700; letter-spacing:0.02em; animation: fadeInOut 2.2s ease forwards;';
    if (!document.getElementById('nube-anim-style')) {
      const style = document.createElement('style');
      style.id = 'nube-anim-style';
      style.textContent = '@keyframes fadeInOut { 0%{opacity:0;transform:scale(0.95)} 15%{opacity:1;transform:scale(1)} 75%{opacity:1} 100%{opacity:0;transform:scale(1.03)} }';
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
    setTimeout(function() { overlay.remove(); }, 2200);
  }).catch(function(e) {
    console.error('[Nivelato] save failed:', e);
    const overlay = document.createElement('div');
    overlay.innerHTML = '⚠️ Error al guardar';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:9999; background:rgba(220,53,69,0.92); color:#fff; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:700; animation: fadeInOut 2.2s ease forwards;';
    document.body.appendChild(overlay);
    setTimeout(function() { overlay.remove(); }, 2200);
  });
}

function buildShareText() {
  const notas    = document.getElementById('notas-field')?.value?.trim();
  const anchoBot = readVal('hueco-ancho-bot-whole','hueco-ancho-bot-frac');
  const altoIzq  = readVal('hueco-alto-izq-whole', 'hueco-alto-izq-frac');
  const anchoTop = results.anchoTop || 0;
  const altoDer  = results.altoDer  || 0;
  const warnings = runValidation();
  const lines = [
    'NIVELATO — MEDIDAS',
    'HUECO BASE: ' + (anchoBot > 0 ? toFracStr(anchoBot) : '—') + ' × ' + (altoIzq > 0 ? toFracStr(altoIzq) : '—'),
    'HUECO CALC: ' + (anchoTop > 0 ? toFracStr(anchoTop) : '—') + ' × ' + (altoDer > 0 ? toFracStr(altoDer) : '—'),
    '─────────────────',
    'ARRIBA:    ' + (results.techo?.label    || '—'),
    'ABAJO:     ' + (results.piso?.label     || '—'),
    'PARED IZQ: ' + (results.paredIzq?.label || '—'),
    'PARED DER: ' + (results.paredDer?.label || '—'),
  ];
  if (warnings.length > 0) { lines.push('─────────────────'); warnings.forEach(function(w) { lines.push('⚠ ' + w); }); }
  if (notas) lines.push('NOTAS: ' + notas);
  return lines.join('\n');
}

function shareViaSMS()      { window.location.href = 'sms:?body=' + encodeURIComponent(buildShareText()); }
function shareViaWhatsApp() { window.open('https://wa.me/?text=' + encodeURIComponent(buildShareText()), '_blank'); }

// ─── CANVAS ENGINE ─────────────────────────────────────────────────────────
let canvas  = document.getElementById('drawing-canvas');
let ctx     = canvas?.getContext('2d');

let vp = { x: 0, y: 0, scale: 1 };
let vpTarget = { x: 0, y: 0, scale: 1 };
let animFrame = null;

function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap) return;
  canvas.width  = wrap.offsetWidth  * window.devicePixelRatio;
  canvas.height = wrap.offsetHeight * window.devicePixelRatio;
  canvas.style.width  = wrap.offsetWidth  + 'px';
  canvas.style.height = wrap.offsetHeight + 'px';
  drawCanvas();
}

const STEP_VIEWS = [
  { focusX: 0.5, focusY: 0.5, zoom: 0.72 }, // step 0 - cliente
  { focusX: 0.5, focusY: 0.5, zoom: 0.72 }, // step 1 - hueco
  { focusX: 0.0, focusY: 0.5, zoom: 3.2  }, // step 2 - pared izq
  { focusX: 1.0, focusY: 0.5, zoom: 3.2  }, // step 3 - pared der
  { focusX: 0.5, focusY: 0.0, zoom: 3.2  }, // step 4 - arriba
  { focusX: 0.5, focusY: 1.0, zoom: 3.2  }, // step 5 - abajo
  { focusX: 0.5, focusY: 0.5, zoom: 0.72 }, // step 6 - resumen
];

function getGlassRect() {
  const W = canvas.width  / window.devicePixelRatio;
  const H = canvas.height / window.devicePixelRatio;
  const ancho = readVal('hueco-ancho-bot-whole','hueco-ancho-bot-frac') || 48;
  const alto  = readVal('hueco-alto-izq-whole', 'hueco-alto-izq-frac')  || 36;
  const aspect = ancho / alto;
  const padding = 60;
  let gW = W - padding * 2;
  let gH = gW / aspect;
  if (gH > H - padding * 2) { gH = H - padding * 2; gW = gH * aspect; }
  const gX = (W - gW) / 2;
  const gY = (H - gH) / 2;
  return { x: gX, y: gY, w: gW, h: gH };
}

function animateCanvas(step) {
  const sv  = STEP_VIEWS[step] || STEP_VIEWS[0];
  const W   = canvas.width  / window.devicePixelRatio;
  const H   = canvas.height / window.devicePixelRatio;
  const gr  = getGlassRect();

  let zoom = sv.zoom;

  if (step === TOTAL_STEPS) {
    const padFit = 48;
    const fitZoomX = (W - padFit * 2) / gr.w;
    const fitZoomY = (H - padFit * 2) / gr.h;
    zoom = Math.min(fitZoomX, fitZoomY, 1.0);
  }

  const wx = gr.x + sv.focusX * gr.w;
  const wy = gr.y + sv.focusY * gr.h;

  vpTarget.scale = zoom;
  vpTarget.x = W / 2 - wx * zoom;
  vpTarget.y = H / 2 - wy * zoom;

  if (animFrame) cancelAnimationFrame(animFrame);
  smoothAnimate();
}

function smoothAnimate() {
  const ease = 0.1;
  vp.x     += (vpTarget.x     - vp.x)     * ease;
  vp.y     += (vpTarget.y     - vp.y)     * ease;
  vp.scale += (vpTarget.scale - vp.scale) * ease;

  drawCanvas();

  const dx = Math.abs(vp.x - vpTarget.x);
  const dy = Math.abs(vp.y - vpTarget.y);
  const ds = Math.abs(vp.scale - vpTarget.scale);
  if (dx > 0.1 || dy > 0.1 || ds > 0.001) {
    animFrame = requestAnimationFrame(smoothAnimate);
  } else {
    vp.x = vpTarget.x; vp.y = vpTarget.y; vp.scale = vpTarget.scale;
    drawCanvas();
  }
}

function drawCanvas() {
  const dpr = window.devicePixelRatio;
  const W   = canvas.width  / dpr;
  const H   = canvas.height / dpr;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(vp.x, vp.y);
  ctx.scale(vp.scale, vp.scale);

  const gr  = getGlassRect();
  const sc  = vp.scale;

  // ── read values ──
  const anchoBot = readVal('hueco-ancho-bot-whole','hueco-ancho-bot-frac') || 48;
  const altoIzq  = readVal('hueco-alto-izq-whole', 'hueco-alto-izq-frac')  || 36;
  const pI_A   = readVal('pI-a-whole','pI-a-frac');
  const pI_B   = readVal('pI-b-whole','pI-b-frac');
  const pD_A   = readVal('pD-a-whole','pD-a-frac');
  const pD_B   = readVal('pD-b-whole','pD-b-frac');
  const t_A    = readVal('t-a-whole', 't-a-frac');
  const t_B    = readVal('t-b-whole', 't-b-frac');
  const p_A    = readVal('p-a-whole', 'p-a-frac');
  const p_B    = readVal('p-b-whole', 'p-b-frac');

  // ── compute desnivel offsets (in pixels) ──
  // These represent how much the ROUGH OPENING deviates from the LEVEL reference
  // Positive = wall leans IN (toward center), negative = wall leans OUT
  const EXAG = Math.min(gr.w, gr.h) * 0.15;
  const clamp = function(v, lim) { return Math.max(-lim, Math.min(lim, v)); };

  const pIMax = Math.max(pI_A, pI_B, 1);
  const pDMax = Math.max(pD_A, pD_B, 1);
  const tMax  = Math.max(t_A,  t_B,  1);
  const pMax  = Math.max(p_A,  p_B,  1);

  // Left wall desnivel: pI_A vs pI_B
  // If pI_A > pI_B: bottom is further out = top leans IN = top shifts RIGHT (toward center)
  const leftOffsetTop    = clamp(((pI_A - pI_B) / pIMax) * EXAG, EXAG);
  const leftOffsetBottom = 0;

  // Right wall desnivel: pD_A vs pD_B  
  // If pD_A > pD_B: bottom is further out = top leans IN = top shifts LEFT (toward center)
  const rightOffsetTop    = -clamp(((pD_A - pD_B) / pDMax) * EXAG, EXAG);
  const rightOffsetBottom = 0;

  // Ceiling desnivel: t_A vs t_B — LEFT is 0,0, offset is on RIGHT
  const topOffsetLeft  = 0;
  const topOffsetRight = clamp(((t_A - t_B) / tMax) * EXAG * (gr.h / gr.w), EXAG);

  // Floor desnivel: p_A vs p_B — LEFT is 0,0, offset is on RIGHT
  const bottomOffsetLeft  = 0;
  const bottomOffsetRight = clamp(-((p_A - p_B) / pMax) * EXAG * (gr.h / gr.w), EXAG);

  // ── LEVEL REFERENCE rectangle (dashed) = where the straight frame goes ──
  const levelTL = { x: gr.x, y: gr.y };
  const levelTR = { x: gr.x + gr.w, y: gr.y };
  const levelBR = { x: gr.x + gr.w, y: gr.y + gr.h };
  const levelBL = { x: gr.x, y: gr.y + gr.h };

  // ── ROUGH OPENING (solid blue) = actual deformed wall opening ──
  const roughTL = { x: gr.x + leftOffsetTop,    y: gr.y + topOffsetLeft };
  const roughTR = { x: gr.x + gr.w + rightOffsetTop,   y: gr.y + topOffsetRight };
  const roughBR = { x: gr.x + gr.w + rightOffsetBottom, y: gr.y + gr.h + bottomOffsetRight };
  const roughBL = { x: gr.x + leftOffsetBottom,  y: gr.y + gr.h + bottomOffsetLeft };

  // Draw level reference (dashed gray rectangle)
  ctx.save();
  ctx.setLineDash([5 / sc, 5 / sc]);
  ctx.strokeStyle = '#adb5bd';
  ctx.lineWidth = 1.5 / sc;
  ctx.beginPath();
  ctx.moveTo(levelTL.x, levelTL.y);
  ctx.lineTo(levelTR.x, levelTR.y);
  ctx.lineTo(levelBR.x, levelBR.y);
  ctx.lineTo(levelBL.x, levelBL.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Draw rough opening (solid blue shape)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(roughTL.x, roughTL.y);
  ctx.lineTo(roughTR.x, roughTR.y);
  ctx.lineTo(roughBR.x, roughBR.y);
  ctx.lineTo(roughBL.x, roughBL.y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(25, 113, 194, 0.08)';
  ctx.fill();
  ctx.strokeStyle = '#1971c2';
  ctx.lineWidth = 2 / sc;
  ctx.stroke();
  ctx.restore();

  // ── draw desnivel arrows showing gap between level and rough ──
  // Left edge: gap between level left edge and rough left edge
  drawDesnivelArrow(ctx, levelTL, levelBL, roughTL, roughBL, 'left', results.paredIzq, sc);
  // Right edge
  drawDesnivelArrow(ctx, levelTR, levelBR, roughTR, roughBR, 'right', results.paredDer, sc);
  // Top edge
  drawDesnivelArrow(ctx, levelTL, levelTR, roughTL, roughTR, 'top', results.techo, sc);
  // Bottom edge
  drawDesnivelArrow(ctx, levelBL, levelBR, roughBL, roughBR, 'bottom', results.piso, sc);

  // ── step highlight ──
  drawStepHighlight(ctx, roughTL, roughTR, roughBL, roughBR, currentStep, sc);

    // ── dimension labels: show all 4 calculated measurements ──
  const anchoTop = results.anchoTop || anchoBot;
  const altoDer  = results.altoDer  || altoIzq;

  // Bottom width (base)
  if (anchoBot > 0) drawDimLine(ctx, roughBL.x, roughBL.y + 24/sc, roughBR.x, roughBR.y + 24/sc, toFracStr(anchoBot), sc);
  // Top width (calculated)
  if (anchoBot > 0) drawDimLine(ctx, roughTL.x, roughTL.y - 24/sc, roughTR.x, roughTR.y - 24/sc, toFracStr(anchoTop), sc);
  // Left height (base)
  if (altoIzq > 0) drawDimLine(ctx, roughTL.x - 24/sc, roughTL.y, roughBL.x - 24/sc, roughBL.y, toFracStr(altoIzq), sc, true);
  // Right height (calculated)
  if (altoIzq > 0) drawDimLine(ctx, roughTR.x + 24/sc, roughTR.y, roughBR.x + 24/sc, roughBR.y, toFracStr(altoDer), sc, true);

  ctx.restore();
  ctx.restore();
}

function drawDimLine(ctx, x1, y1, x2, y2, label, scale, vertical) {
  vertical = vertical || false;
  const tickLen = 6 / scale;
  ctx.save();
  ctx.strokeStyle = '#adb5bd';
  ctx.lineWidth = 1 / scale;
  ctx.setLineDash([3 / scale, 3 / scale]);
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (!vertical) {
    ctx.beginPath(); ctx.moveTo(x1, y1 - tickLen); ctx.lineTo(x1, y1 + tickLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2 - tickLen); ctx.lineTo(x2, y2 + tickLen); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(x1 - tickLen, y1); ctx.lineTo(x1 + tickLen, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2 - tickLen, y2); ctx.lineTo(x2 + tickLen, y2); ctx.stroke();
  }
  ctx.fillStyle = '#495057';
  ctx.font = 'bold ' + (12 / scale) + 'px Inter, system-ui, sans-serif';
  if (!vertical) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, (x1 + x2) / 2, y1 - 2 / scale);
  } else {
    ctx.save(); ctx.translate((x1 + x2) / 2, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, 0, -2 / scale);
    ctx.restore();
  }
  ctx.restore();
}

function drawDesnivelArrow(ctx, levelP1, levelP2, roughP1, roughP2, side, result, scale) {
  const HAS_DESNIVEL = (result && result.val > 0);
  const COLOR = HAS_DESNIVEL ? '#e67700' : '#868e96';
  const ARROW_HEAD = 8 / scale;
  const fs = 12 / scale;
  const PAD = 18 / scale;

  ctx.save();

  // Compute the offset at the "active" end of the edge
  // For vertical edges (left/right): offset is horizontal at the TOP
  // For horizontal edges (top/bottom): offset is vertical at the RIGHT
  let offsetPx, arrowX, arrowY, labelX, labelY;

  if (side === 'left') {
    // Left edge: offset at top = roughTL.x - levelTL.x
    offsetPx = roughP1.x - levelP1.x;
    arrowY = levelP1.y + (levelP2.y - levelP1.y) * 0.10; // arrow at mid
    arrowX = levelP1.x;
    labelX = Math.min(levelP1.x, roughP1.x) - PAD;
    labelY = arrowY;
  } else if (side === 'right') {
    // Right edge: offset at top = roughTR.x - levelTR.x
    offsetPx = roughP1.x - levelP1.x;
    arrowY = levelP1.y + (levelP2.y - levelP1.y) * 0.10;
    arrowX = levelP1.x;
    labelX = Math.max(levelP1.x, roughP1.x) + PAD;
    labelY = arrowY;
  } else { // top / bottom — offset at RIGHT end (P2)
    offsetPx = roughP2.y - levelP2.y;
    arrowX = levelP2.x;
    arrowY = levelP2.y;
    labelX = arrowX;
    labelY = side === 'top'
      ? Math.min(levelP2.y, roughP2.y) - PAD
      : Math.max(levelP2.y, roughP2.y) + PAD;
  }

  const MIN_VISUAL = 0.5 / scale;
  if (Math.abs(offsetPx) < MIN_VISUAL && !HAS_DESNIVEL) {
    ctx.restore();
    return;
  }

  // Draw arrow from level position to rough position
  if (Math.abs(offsetPx) > MIN_VISUAL) {
    let ax2, ay2;
    if (side === 'left' || side === 'right') {
      ax2 = arrowX + offsetPx;
      ay2 = arrowY;
    } else {
      ax2 = arrowX;
      ay2 = arrowY + offsetPx;
    }

    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(ax2, ay2);
    ctx.strokeStyle = COLOR;
    ctx.lineWidth = 1.8 / scale;
    ctx.stroke();

        // Tick + measurement label at the offset point
    const tickLen = 4 / scale;
    ctx.fillStyle = COLOR;
    ctx.font = "bold " + (11 / scale) + "px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (side === "left" || side === "right") {
      ctx.beginPath();
      ctx.moveTo(ax2, ay2 - tickLen);
      ctx.lineTo(ax2, ay2 + tickLen);
      ctx.stroke();
      ctx.textAlign = side === "left" ? "right" : "left";
      ctx.fillText(HAS_DESNIVEL ? result.label : "", ax2 + (side === "left" ? -14/scale : 14/scale), ay2);
    } else {
      ctx.beginPath();
      ctx.moveTo(ax2 - tickLen, ay2);
      ctx.lineTo(ax2 + tickLen, ay2);
      ctx.stroke();
      ctx.textBaseline = side === "top" ? "bottom" : "top";
      ctx.fillText(HAS_DESNIVEL ? result.label : "", ax2, ay2 + (side === "top" ? -14/scale : 14/scale));
    }
  }
  ctx.restore();
}

// ── step highlight: glow the active edge ──
function drawStepHighlight(ctx, TL, TR, BL, BR, step, sc) {
  if (step === 0 || step === 5) return;
  ctx.save();
  ctx.strokeStyle = '#f59f00';
  ctx.lineWidth = 4 / sc;
  ctx.shadowColor = '#f59f00';
  ctx.shadowBlur = 8 / sc;
  ctx.beginPath();
  if (step === 2) { ctx.moveTo(TL.x, TL.y); ctx.lineTo(BL.x, BL.y); }
  else if (step === 3) { ctx.moveTo(TR.x, TR.y); ctx.lineTo(BR.x, BR.y); }
  else if (step === 4) { ctx.moveTo(TL.x, TL.y); ctx.lineTo(TR.x, TR.y); }
  else if (step === 5) { ctx.moveTo(BL.x, BL.y); ctx.lineTo(BR.x, BR.y); }
  ctx.stroke();
  ctx.restore();
}

// ─── PER-FIELD FOCUS VIEWS ───────────────────────────────────────────────
const FIELD_VIEWS = {
  'pI-a-whole': { focusX: 0.0, focusY: 1.0, zoom: 4.8 },
  'pI-a-frac':  { focusX: 0.0, focusY: 1.0, zoom: 4.8 },
  'pI-b-whole': { focusX: 0.0, focusY: 0.0, zoom: 4.8 },
  'pI-b-frac':  { focusX: 0.0, focusY: 0.0, zoom: 4.8 },
  'pD-a-whole': { focusX: 1.0, focusY: 1.0, zoom: 4.8 },
  'pD-a-frac':  { focusX: 1.0, focusY: 1.0, zoom: 4.8 },
  'pD-b-whole': { focusX: 1.0, focusY: 0.0, zoom: 4.8 },
  'pD-b-frac':  { focusX: 1.0, focusY: 0.0, zoom: 4.8 },
  't-a-whole': { focusX: 0.0, focusY: 0.0, zoom: 4.8 },
  't-a-frac':  { focusX: 0.0, focusY: 0.0, zoom: 4.8 },
  't-b-whole': { focusX: 1.0, focusY: 0.0, zoom: 4.8 },
  't-b-frac':  { focusX: 1.0, focusY: 0.0, zoom: 4.8 },
  'p-a-whole': { focusX: 0.0, focusY: 1.0, zoom: 4.8 },
  'p-a-frac':  { focusX: 0.0, focusY: 1.0, zoom: 4.8 },
  'p-b-whole': { focusX: 1.0, focusY: 1.0, zoom: 4.8 },
  'p-b-frac':  { focusX: 1.0, focusY: 1.0, zoom: 4.8 },
  'hueco-ancho-bot-whole': { focusX: 0.5, focusY: 0.9, zoom: 0.85 },
  'hueco-ancho-bot-frac':  { focusX: 0.5, focusY: 0.9, zoom: 0.85 },
  'hueco-alto-izq-whole':  { focusX: 0.1, focusY: 0.5, zoom: 0.85 },
  'hueco-alto-izq-frac':   { focusX: 0.1, focusY: 0.5, zoom: 0.85 },
  'hueco-ancho-top-whole': { focusX: 0.5, focusY: 0.1, zoom: 0.85 },
  'hueco-ancho-top-frac':  { focusX: 0.5, focusY: 0.1, zoom: 0.85 },
  'hueco-alto-der-whole':  { focusX: 0.9, focusY: 0.5, zoom: 0.85 },
  'hueco-alto-der-frac':   { focusX: 0.9, focusY: 0.5, zoom: 0.85 },
};

let activeFieldId = null;

function focusField(fieldId) {
  const sv = FIELD_VIEWS[fieldId];
  if (!sv) return;
  activeFieldId = fieldId;
  const W  = canvas.width  / window.devicePixelRatio;
  const H  = canvas.height / window.devicePixelRatio;
  const gr = getGlassRect();
  const wx = gr.x + sv.focusX * gr.w;
  const wy = gr.y + sv.focusY * gr.h;
  vpTarget.scale = sv.zoom;
  vpTarget.x = W / 2 - wx * sv.zoom;
  vpTarget.y = H / 2 - wy * sv.zoom;
  if (animFrame) cancelAnimationFrame(animFrame);
  smoothAnimate();
}

function blurField() {
  activeFieldId = null;
  animateCanvas(currentStep);
}

// ─── WIRE UP INPUTS ────────────────────────────────────────────────────────
document.addEventListener('input',  function(e) { if (['input','select'].includes(e.target.tagName.toLowerCase())) recalcAll(); });
document.addEventListener('change', function(e) { if (['input','select'].includes(e.target.tagName.toLowerCase())) recalcAll(); });

document.addEventListener('focusin', function(e) {
  const id = e.target.id;
  if (FIELD_VIEWS[id]) focusField(id);
});

document.addEventListener('focusout', function(e) {
  const id = e.target.id;
  if (FIELD_VIEWS[id]) blurField();
});

document.addEventListener('mouseover', function(e) {
  const col = e.target.closest('.input-col');
  if (!col) return;
  const inp = col.querySelector('input[type="number"]');
  if (inp && FIELD_VIEWS[inp.id]) focusField(inp.id);
});

document.addEventListener('mouseout', function(e) {
  const col = e.target.closest('.input-col');
  if (!col) return;
  const related = e.relatedTarget;
  if (!related || !col.contains(related)) blurField();
});

window.addEventListener('resize', resizeCanvas);

// ─── DRAG TO PAN ──────────────────────────────────────────────────────────
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let vpAtDrag  = { x: 0, y: 0 };

if (canvas) {
canvas.addEventListener('mousedown', function(e) {
  if (e.button !== 0) return;
  isDragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  vpAtDrag  = { x: vp.x, y: vp.y };
  canvas.style.cursor = 'grabbing';
});
window.addEventListener('mousemove', function(e) {
  if (!isDragging) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  vp.x = vpAtDrag.x + dx; vp.y = vpAtDrag.y + dy;
  vpTarget.x = vp.x; vpTarget.y = vp.y;
  userZoomed = true;
  drawCanvas();
});
window.addEventListener('mouseup', function() { isDragging = false; canvas.style.cursor = 'grab'; });
canvas.style.cursor = 'grab';

// ─── TOUCH + ZOOM HANDLING ───
let userZoomed   = false;
let touchDragStart = null;
let lastPinchDist  = null;

function applyZoom(cx, cy, factor) {
  const clampedFactor = Math.max(0.85, Math.min(1.18, factor));
  userZoomed = true;
  const newScale = Math.max(0.3, Math.min(10, vp.scale * clampedFactor));
  const sf = newScale / vp.scale;
  vp.x = cx - sf * (cx - vp.x);
  vp.y = cy - sf * (cy - vp.y);
  vp.scale = newScale;
  vpTarget.x = vp.x; vpTarget.y = vp.y; vpTarget.scale = vp.scale;
  drawCanvas();
}

canvas.addEventListener('touchstart', function(e) {
  if (e.touches.length === 1) {
    touchDragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, vpx: vp.x, vpy: vp.y };
    lastPinchDist = null;
  } else if (e.touches.length === 2) {
    touchDragStart = null;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastPinchDist = Math.sqrt(dx*dx + dy*dy);
  }
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  if (e.touches.length === 1 && touchDragStart) {
    const dx = e.touches[0].clientX - touchDragStart.x;
    const dy = e.touches[0].clientY - touchDragStart.y;
    vp.x = touchDragStart.vpx + dx;
    vp.y = touchDragStart.vpy + dy;
    vpTarget.x = vp.x; vpTarget.y = vp.y;
    userZoomed = true;
    drawCanvas();
  } else if (e.touches.length === 2 && lastPinchDist !== null) {
    const dx   = e.touches[0].clientX - e.touches[1].clientX;
    const dy   = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const rect = canvas.getBoundingClientRect();
    const cx   = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
    const cy   = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
    applyZoom(cx, cy, 1 + (dist / lastPinchDist - 1) * 0.3);
    lastPinchDist = dist;
  }
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
  if (e.touches.length === 0) { touchDragStart = null; lastPinchDist = null; }
  if (e.touches.length < 2)   { lastPinchDist = null; }
}, { passive: true });

// mouse wheel zoom
canvas.addEventListener('wheel', function(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  applyZoom(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.03 : 0.97);
}, { passive: false });

// 🏳️‍⚧️ trans rights — built with love by benj & deepseek v4 flash
} // end if (canvas)

// reset zoom button
window.resetZoom = function() { userZoomed = false; animateCanvas(currentStep); };

// ─── INIT ──────────────────────────────────────────────────────────────────
if (canvas) {
  resizeCanvas();
  history.replaceState({ step: 0 }, '', '#step-0');
  goStep(0, true);
}

function resetZoom() {
  if (window.zoomLevel > 1 || window.panX || window.panY) {
    window.zoomLevel = 1;
    window.panX = 0;
    window.panY = 0;
    if (typeof drawCanvas === 'function') drawCanvas();
    var btn = document.getElementById('reset-zoom-btn');
    if (btn) btn.style.display = 'none';
  }
}

window.embedGraph = function(cvs, data) {
  if (!cvs || !data) return;
  // Extract numeric values from labels ignoring direction arrows.
  // The offset math uses positive magnitudes: rightHeight = leftHeight - tcv - psv
  function ev(s) {
    if (!s || s === 'Nivel' || s === '—') return 0;
    var m = s.match(/(\d+)\s*(?:(\d+)\/(\d+))?/);
    return m ? (parseInt(m[1])||0) + ((parseInt(m[2])||0)/(parseInt(m[3])||1)) : 0;
  }
  var pIv = ev(data.pIL);
  var pDv = ev(data.pDL);
  var tcv = ev(data.tL);
  var psv = ev(data.pL);
  // Set override data so drawCanvas reads these instead of DOM inputs
  window._embedData = {
    'hueco-ancho-bot-whole': data.anchoBot || 36,
    'hueco-alto-izq-whole': data.altoIzq || 84,
    'pI-a-whole': pIv,
    'pI-b-whole': 0,
    'pD-a-whole': pDv,
    'pD-b-whole': 0,
    't-a-whole': tcv,
    't-b-whole': 0,
    'p-a-whole': psv,
    'p-b-whole': 0,
  };
  window.results = {
    paredIzq: { raw: pIv, dir: "", label: data.pIL || "Nivel" },
    paredDer: { raw: pDv, dir: "", label: data.pDL || "Nivel" },
    techo: { raw: tcv, dir: "", label: data.tL || "Nivel" },
    piso: { raw: psv, dir: "", label: data.pL || "Nivel" }
  };
  // Draw directly on modal canvas
  var dctx = cvs.getContext('2d');
  var W = cvs.width, H = cvs.height;
  dctx.clearRect(0,0,W,H);
  dctx.fillStyle = '#f8faff';
  dctx.fillRect(0,0,W,H);
  var sc = 1;
  var ox = 0, oy = 0;
  dctx.save();
  dctx.translate(W/2 + ox, H/2 + oy);
  dctx.scale(sc, sc);
  dctx.translate(-W/2, -H/2);
  var pad = 72;
  var bx = pad, by = pad, bw = W - pad*2, bh = H - pad*2;
  var EXAG = Math.min(bw, bh) * 0.15;
  var clamp = function(v, lim) { return Math.max(-lim, Math.min(lim, v)); };
  var pIMax = Math.max(pIv, 1);
  var pDMax = Math.max(pDv, 1);
  var tMax = Math.max(tcv, 1);
  var pMax = Math.max(psv, 1);
  var leftOffsetTop = clamp(((pIv) / pIMax) * EXAG, EXAG);
  var rightOffsetTop = -clamp(((pDv) / pDMax) * EXAG, EXAG);
  var topOffsetRight = clamp(((tcv) / tMax) * EXAG * (bh / bw), EXAG);
  var bottomOffsetRight = clamp(-((psv) / pMax) * EXAG * (bh / bw), EXAG);
  var roughTL = { x: bx + leftOffsetTop, y: by };
  var roughTR = { x: bx + bw + rightOffsetTop, y: by + topOffsetRight };
  var roughBR = { x: bx + bw + rightOffsetTop, y: by + bh + bottomOffsetRight };
  var roughBL = { x: bx + leftOffsetTop, y: by + bh };
  dctx.beginPath();
  dctx.moveTo(roughTL.x, roughTL.y);
  dctx.lineTo(roughTR.x, roughTR.y);
  dctx.lineTo(roughBR.x, roughBR.y);
  dctx.lineTo(roughBL.x, roughBL.y);
  dctx.closePath();
  dctx.fillStyle = 'rgba(144,194,255,0.25)';
  dctx.fill();
  dctx.strokeStyle = '#1971c2';
  dctx.lineWidth = 2.5;
  dctx.stroke();
  dctx.strokeStyle = 'rgba(0,0,0,0.08)';
  dctx.lineWidth = 1;
  dctx.setLineDash([4,4]);
  dctx.strokeRect(bx, by, bw, bh);
  dctx.setLineDash([]);
  var anchoBot = data.anchoBot || 36;
  var altoIzq = data.altoIzq || 84;
  var anchoTop = anchoBot - pIv - pDv;
  var altoDer = altoIzq - tcv - psv;
  if (anchoBot > 0) {
    dctx.strokeStyle = '#adb5bd';
    dctx.lineWidth = 1;
    dctx.setLineDash([3,3]);
    dctx.beginPath();
    dctx.moveTo(roughBL.x, roughBL.y + 24);
    dctx.lineTo(roughBR.x, roughBR.y + 24);
    dctx.stroke();
    dctx.setLineDash([]);
    dctx.beginPath();
    dctx.moveTo(roughBL.x, roughBL.y + 24 - 6);
    dctx.lineTo(roughBL.x, roughBL.y + 24 + 6);
    dctx.stroke();
    dctx.beginPath();
    dctx.moveTo(roughBR.x, roughBR.y + 24 - 6);
    dctx.lineTo(roughBR.x, roughBR.y + 24 + 6);
    dctx.stroke();
    dctx.fillStyle = '#495057';
    dctx.font = 'bold 12px Inter, system-ui, sans-serif';
    dctx.textAlign = 'center';
    dctx.textBaseline = 'bottom';
    dctx.fillText(anchoBot + '"', (roughBL.x + roughBR.x) / 2, roughBR.y + 24 - 2);
  }
  if (anchoBot > 0) {
    dctx.strokeStyle = '#adb5bd';
    dctx.lineWidth = 1;
    dctx.setLineDash([3,3]);
    dctx.beginPath();
    dctx.moveTo(roughTL.x, roughTL.y - 24);
    dctx.lineTo(roughTR.x, roughTR.y - 24);
    dctx.stroke();
    dctx.setLineDash([]);
    dctx.beginPath();
    dctx.moveTo(roughTL.x, roughTL.y - 24 - 6);
    dctx.lineTo(roughTL.x, roughTL.y - 24 + 6);
    dctx.stroke();
    dctx.beginPath();
    dctx.moveTo(roughTR.x, roughTR.y - 24 - 6);
    dctx.lineTo(roughTR.x, roughTR.y - 24 + 6);
    dctx.stroke();
    dctx.fillStyle = '#495057';
    dctx.font = 'bold 12px Inter, system-ui, sans-serif';
    dctx.textAlign = 'center';
    dctx.textBaseline = 'bottom';
    dctx.fillText(anchoTop + '"', (roughTL.x + roughTR.x) / 2, roughTR.y - 24 - 2);
  }
  if (altoIzq > 0) {
    dctx.strokeStyle = '#adb5bd';
    dctx.lineWidth = 1;
    dctx.setLineDash([3,3]);
    dctx.beginPath();
    dctx.moveTo(roughTL.x - 24, roughTL.y);
    dctx.lineTo(roughBL.x - 24, roughBL.y);
    dctx.stroke();
    dctx.setLineDash([]);
    dctx.beginPath();
    dctx.moveTo(roughTL.x - 24 - 6, roughTL.y - 6);
    dctx.lineTo(roughTL.x - 24 + 6, roughTL.y + 6);
    dctx.stroke();
    dctx.beginPath();
    dctx.moveTo(roughBL.x - 24 - 6, roughBL.y - 6);
    dctx.lineTo(roughBL.x - 24 + 6, roughBL.y + 6);
    dctx.stroke();
    dctx.fillStyle = '#495057';
    dctx.font = 'bold 12px Inter, system-ui, sans-serif';
    dctx.textAlign = 'center';
    dctx.textBaseline = 'bottom';
    dctx.fillText(altoIzq + '"', (roughTL.x + roughBL.x) / 2 - 24, roughBL.y - 2);
  }
  if (altoIzq > 0) {
    dctx.strokeStyle = '#adb5bd';
    dctx.lineWidth = 1;
    dctx.setLineDash([3,3]);
    dctx.beginPath();
    dctx.moveTo(roughTR.x + 24, roughTR.y);
    dctx.lineTo(roughBR.x + 24, roughBR.y);
    dctx.stroke();
    dctx.setLineDash([]);
    dctx.beginPath();
    dctx.moveTo(roughTR.x + 24 - 6, roughTR.y - 6);
    dctx.lineTo(roughTR.x + 24 + 6, roughTR.y + 6);
    dctx.stroke();
    dctx.beginPath();
    dctx.moveTo(roughBR.x + 24 - 6, roughBR.y - 6);
    dctx.lineTo(roughBR.x + 24 + 6, roughBR.y + 6);
    dctx.stroke();
    dctx.fillStyle = '#495057';
    dctx.font = 'bold 12px Inter, system-ui, sans-serif';
    dctx.textAlign = 'center';
    dctx.textBaseline = 'bottom';
    dctx.fillText(altoDer + '"', (roughTR.x + roughBR.x) / 2 + 24, roughBR.y - 2);
  }
  dctx.restore();
};
  
