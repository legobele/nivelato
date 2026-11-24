// @ts-nocheck
/* Port of photo.html (annotated photo with measurements). The canvas engine, geometry, hit-testing, loupe and the
   annotation payload {v:1, strokes, dimLabels, corners} are kept 1:1 from the source so saved annotations stay compatible.
   Differences: Firebase auth/gate and window.postMessage transport are replaced by callbacks (opts.onDone, handle.setMeasurements, handle.ack). */
export interface PhotoOpts { lang: 'es' | 'en'; onDone: (dataUrl: string, annotations: unknown) => void }
export function mountPhotoEditor(opts: PhotoOpts) {
const offs: Array<() => void> = [];
const on = (t: any, ev: string, fn: any) => { t.addEventListener(ev, fn); offs.push(() => t.removeEventListener(ev, fn)); };
const LANGX = opts.lang;
// ── i18n: same resolution as the app (cookie nivelato-login-lang ->
// localStorage nivelato-login-lang -> navigator.language); the head
// boot script already resolved it into window.__photoLang + <html lang>.
const LANG = opts.lang;
const L = (es, en) => (LANG === 'en' ? en : es);
const I18N = {
  es: {
    docTitle: 'Nivelato - Foto con medidas', title: 'Foto con medidas',
    subDefault: 'Alinea el marco con la abertura', resetFrame: 'Marco', usePhoto: 'Usar esta foto',
    emptyText: 'Agrega una foto del hueco para marcar las medidas.',
    takePhoto: 'Tomar foto', fromGallery: 'Elegir de galería',
    canvasLabel: 'Foto del hueco con marco de medidas',
    toolLine: 'Línea', toolArrow: 'Flecha', toolText: 'Texto', undo: 'Deshacer',
    textTitle: 'Texto', labelInputLabel: 'Texto de la etiqueta', cancel: 'Cancelar', add: 'Agregar'
  },
  en: {
    docTitle: 'Nivelato - Photo with measurements', title: 'Photo with measurements',
    subDefault: 'Align the frame with the opening', resetFrame: 'Frame', usePhoto: 'Use this photo',
    emptyText: 'Add a photo of the opening to mark the measurements.',
    takePhoto: 'Take photo', fromGallery: 'Choose from gallery',
    canvasLabel: 'Photo of the opening with measurement frame',
    toolLine: 'Line', toolArrow: 'Arrow', toolText: 'Text', undo: 'Undo',
    textTitle: 'Text', labelInputLabel: 'Label text', cancel: 'Cancel', add: 'Add'
  }
};
const canvas = document.getElementById('photo-canvas');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const hintBar = document.getElementById('hint-bar');
const btnDone = document.getElementById('btn-done');
const btnDoneLabel = document.getElementById('btn-done-label');
const btnReset = document.getElementById('btn-reset');
const loupeCanvas = document.getElementById('loupe-canvas');
const loupeCtx = loupeCanvas.getContext('2d');
const LOUPE = 160;
const LOUPE_ZOOM = 3;

let img = null;
let baseW = 0, baseH = 0;
let scale = 1;
let corners = null;
let dragging = null;
let activePointer = null;
let measurements = {};
let currentTool = 'none';        // 'none' | 'line' | 'arrow' | 'text'
let drawingShape = null;         // { type, a } while drawing a line/arrow
let customStrokes = [];          // custom line/arrow/text annotations (image px)
let pendingLabel = null;         // { type, a, b } waiting on modal
let quickLabels = [];
let frameNorm = null;
let offsetLabels = { paredIzq: '', paredDer: '', techo: '', piso: '' };
// Dimension-label placement: pos = image-px center once the user drags
// the label off its edge midpoint (null = follow the edge), scale =
// label text size multiplier. Part of the saved annotations payload.
let dimLabels = {
  bottom: { pos: null, scale: 1 }, top: { pos: null, scale: 1 },
  left: { pos: null, scale: 1 }, right: { pos: null, scale: 1 }
};
// Annotation selection / dragging (custom strokes + dimension labels)
let selected = null;       // { kind: 'stroke', index } | { kind: 'dim', key }
let annoDrag = null;       // active move/resize drag state
let hitBoxes = { strokes: {}, dims: {} };  // label boxes from the last interactive render
let pendingAnnotations = null;             // annotations handed in before a photo loads

// ── helpers ──
function setHint(t) { hintBar.textContent = t; }
const HINT_DEFAULT = () => L('Arrastra los puntos de las esquinas para alinear el marco. Usa las herramientas para añadir líneas o texto.', 'Drag the corner points to align the frame. Use the tools to add lines or text.');
const HINT_SELECTED = () => L('Seleccionado: arrastra para mover. Arrastra el punto de la esquina de la etiqueta para cambiar su tamaño.', 'Selected: drag to move. Drag the label corner handle to resize it.');

function toImageCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function fmtInches(v) {
  if (!v && v !== 0) return null;
  const whole = Math.floor(v);
  const frac = v - whole;
  let s = '';
  const map = [[0.5,'1/2'],[0.25,'1/4'],[0.75,'3/4'],[0.333,'1/3'],[0.667,'2/3'],[0.125,'1/8'],[0.375,'3/8'],[0.625,'5/8'],[0.875,'7/8'],[0.0625,'1/16'],[0.1875,'3/16'],[0.3125,'5/16'],[0.4375,'7/16'],[0.5625,'9/16'],[0.6875,'11/16'],[0.8125,'13/16'],[0.9375,'15/16']];
  for (const [f, str] of map) {
    if (Math.abs(frac - f) < 0.03) { s = str; break; }
  }
  if (!s && frac > 0.02) s = Math.round(frac * 16) + '/16';
  return (whole > 0 || !s) ? (whole + (s ? ' ' + s : '')) : s;
}

// ── frame geometry ──
// The draggable frame is the BASE rectangle: axis-aligned, with the
// anchoBot x altoIzq aspect of the measurement. The OFFSET outline is a
// second polygon derived from the base on every render (never baked
// into the initial corners, which is what made the frame load skewed):
// the same base+offsets polygon the Dimensions diagram computes, with
// signed raw offsets in inches (paredIzq.raw = pI_A - pI_B, etc.):
//   anchoTop = anchoBot - paredIzq.raw - paredDer.raw
//   altoDer  = altoIzq  - techo.raw    - piso.raw
// Offset shifts are drawn at TRUE inch scale (raw * px-per-inch of the
// base rect), and each nonzero offset also gets a badge with its saved
// label at the moved corner, so offsets are marked even when the true
// shift is sub-pixel.
function computeFrameNorm(m) {
  const pIv = m.paredIzq || 0, pDv = m.paredDer || 0, tcv = m.techo || 0, psv = m.piso || 0;
  const anchoBot = m.anchoBot || 36;
  const altoIzq  = m.altoIzq  || 84;
  const anchoTop = m.anchoTop || Math.max(0, anchoBot - pIv - pDv);
  const altoDer  = m.altoDer  || Math.max(0, altoIzq - tcv - psv);
  return { anchoBot, anchoTop, altoIzq, altoDer, pI: pIv, pD: pDv, t: tcv, p: psv };
}

function rectCorners() {
  const g = frameNorm || computeFrameNorm(measurements);
  const ratio = (g.anchoBot > 0 && g.altoIzq > 0) ? (g.altoIzq / g.anchoBot) : 1;
  let w = baseW * 0.72;
  let h = w * ratio;
  if (h > baseH * 0.72) { h = baseH * 0.72; w = h / ratio; }
  const x = (baseW - w) / 2, y = (baseH - h) / 2;
  return {
    TL: { x: x, y: y }, TR: { x: x + w, y: y },
    BR: { x: x + w, y: y + h }, BL: { x: x, y: y + h }
  };
}

function offsetQuad(cn) {
  const g = frameNorm;
  if (!g) return { TL: cn.TL, TR: cn.TR, BR: cn.BR, BL: cn.BL };
  const xs = [cn.TL.x, cn.TR.x, cn.BR.x, cn.BL.x];
  const ys = [cn.TL.y, cn.TR.y, cn.BR.y, cn.BL.y];
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const ppx = g.anchoBot > 0 ? w / g.anchoBot : 0;   // px per inch, horizontal
  const ppy = g.altoIzq > 0 ? h / g.altoIzq : 0;     // px per inch, vertical
  // sign convention matches the main graph / embedGraph: paredIzq raw>0
  // moves the top-left corner right, paredDer raw>0 moves the top-right
  // corner left, techo raw>0 moves the top-right corner down, piso
  // raw>0 moves the bottom-right corner up.
  return {
    TL: { x: cn.TL.x + g.pI * ppx, y: cn.TL.y },
    TR: { x: cn.TR.x - g.pD * ppx, y: cn.TR.y + g.t * ppy },
    BR: { x: cn.BR.x, y: cn.BR.y - g.p * ppy },
    BL: { x: cn.BL.x, y: cn.BL.y }
  };
}

// ── rendering ──
const LINE_COLOR = '#f59f00';
const LINE_WIDTH = 5;
const TEXT_COLOR = '#ffffff';
const PILL_COLOR = 'rgba(0,0,0,0.75)';
const FILL_COLOR = 'rgba(255,255,255,0.08)';

function pillPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawLabel(c, text, x, y, angle, size) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  c.font = 'bold ' + size + 'px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const w = c.measureText(text).width;
  pillPath(c, -w/2 - 8, -size/2 - 6, w + 16, size + 12, 7);
  c.fillStyle = PILL_COLOR;
  c.fill();
  c.fillStyle = TEXT_COLOR;
  c.fillText(text, 0, 1);
  c.restore();
  return { cx: x, cy: y, w: w + 16, h: size + 12, angle: angle || 0 };
}

// hit test against a (possibly rotated) label box returned by drawLabel
function pointInBox(p, box) {
  if (!box) return false;
  const dx = p.x - box.cx, dy = p.y - box.cy;
  const cos = Math.cos(-(box.angle || 0)), sin = Math.sin(-(box.angle || 0));
  const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
  return Math.abs(lx) <= box.w / 2 && Math.abs(ly) <= box.h / 2;
}

// LABEL SIZE: a readable fixed size in image px, scaled to the photo.
// ~36px on a 1400px image, ~22px on a 700px image → always legible.
function labelFontSize() {
  return Math.max(22, baseW * 0.026);
}

// dimension line with offset, label parallel & centered on the edge
// unless the user dragged it (dimKey entry in dimLabels carries the
// override position and the text scale for that edge's label)
function drawDimLinePx(c, a, b, off, label, dimKey) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const perp = { x: -Math.sin(ang), y: Math.cos(ang) };
  const o = off * Math.hypot(baseW, baseH) * 0.035;
  const a2 = { x: a.x + perp.x * o, y: a.y + perp.y * o };
  const b2 = { x: b.x + perp.x * o, y: b.y + perp.y * o };
  c.strokeStyle = LINE_COLOR;
  c.lineWidth = LINE_WIDTH;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(a2.x, a2.y);
  c.lineTo(b2.x, b2.y);
  c.stroke();
  // end ticks
  const tlen = Math.max(8, labelFontSize() * 0.4);
  c.lineWidth = 3;
  for (const p of [a2, b2]) {
    c.beginPath();
    c.moveTo(p.x - tlen * Math.cos(ang - Math.PI/2), p.y - tlen * Math.sin(ang - Math.PI/2));
    c.lineTo(p.x + tlen * Math.cos(ang - Math.PI/2), p.y + tlen * Math.sin(ang - Math.PI/2));
    c.stroke();
  }
  if (label) {
    const mid = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 };
    const dl = dimKey ? dimLabels[dimKey] : null;
    const center = (dl && dl.pos) ? dl.pos : mid;
    const size = labelFontSize() * (dl ? dl.scale : 1);
    const box = drawLabel(c, label, center.x, center.y, (dl && dl.pos) ? 0 : ang, size);
    if (c === ctx && dimKey) hitBoxes.dims[dimKey] = box;
  }
}

function drawArrowLine(c, a, b, label, plain, labelScale, recIndex) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  c.strokeStyle = LINE_COLOR;
  c.lineWidth = LINE_WIDTH;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.stroke();
  if (!plain) {
    // arrowhead
    const head = Math.max(14, labelFontSize() * 0.6);
    c.beginPath();
    c.moveTo(b.x, b.y);
    c.lineTo(b.x - head * Math.cos(ang - 0.45), b.y - head * Math.sin(ang - 0.45));
    c.moveTo(b.x, b.y);
    c.lineTo(b.x - head * Math.cos(ang + 0.45), b.y - head * Math.sin(ang + 0.45));
    c.stroke();
  }
  if (label) {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const box = drawLabel(c, label, mid.x, mid.y, ang, labelFontSize() * (labelScale || 1));
    if (c === ctx && recIndex != null) hitBoxes.strokes[recIndex] = box;
  }
}

function drawTextAnno(c, s, recIndex) {
  const box = drawLabel(c, s.label, s.x, s.y, 0, labelFontSize() * (s.labelScale || 1));
  if (c === ctx && recIndex != null) hitBoxes.strokes[recIndex] = box;
}

function quadPath(c, q) {
  const pts = [q.TL, q.TR, q.BR, q.BL];
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) c.lineTo(pts[i].x, pts[i].y);
  c.closePath();
}

function renderFrame(c, cn, opts) {
  const g = frameNorm || computeFrameNorm(measurements);
  const oq = offsetQuad(cn);

  // BASE outline: the level rectangle (dashed light gray, same
  // reference treatment as the Dimensions diagram)
  c.save();
  c.setLineDash([Math.max(6, baseW * 0.008), Math.max(5, baseW * 0.006)]);
  quadPath(c, cn);
  c.strokeStyle = 'rgba(230,230,235,0.85)';
  c.lineWidth = Math.max(2, LINE_WIDTH * 0.6);
  c.lineJoin = 'round';
  c.stroke();
  c.restore();

  // OFFSET outline: the actual opening after the saved offsets
  quadPath(c, oq);
  c.fillStyle = FILL_COLOR;
  c.fill();
  c.strokeStyle = LINE_COLOR;
  c.lineWidth = LINE_WIDTH;
  c.lineJoin = 'round';
  c.stroke();

  // Offset badges: a connector from the base corner to the moved
  // corner plus the offset's saved label, for every nonzero offset.
  const badge = (basePt, offPt, raw, label, dx, dy) => {
    if (!raw || !label || label === 'Nivel') return;
    c.save();
    c.strokeStyle = LINE_COLOR;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(basePt.x, basePt.y);
    c.lineTo(offPt.x, offPt.y);
    c.stroke();
    // Signed labels ("... (+2\")") are longer: for the right-edge badges
    // (dx > 0) place them inside the frame, to the left of the corner, so
    // they stay clear of the dimension line and the corner handle.
    let px = offPt.x + dx, py = offPt.y + dy;
    if (dx > 0 && label.indexOf('(') >= 0) {
      c.font = 'bold ' + (labelFontSize() * 0.82) + 'px system-ui, sans-serif';
      px = offPt.x - c.measureText(label).width / 2 - bd * 0.9;
      py = offPt.y + (dy > 0 ? bd * 0.2 + dy : -bd * 1.6);
    }
    drawLabel(c, label, px, py, 0, labelFontSize() * 0.82);
    c.restore();
  };
  const bd = labelFontSize() * 1.1;
  badge(cn.TL, oq.TL, g.pI, offsetLabels.paredIzq, 0, -bd);
  badge(cn.TR, oq.TR, g.pD, offsetLabels.paredDer, bd, -bd);
  badge(cn.TR, oq.TR, g.t, offsetLabels.techo, bd, bd);
  badge(cn.BR, oq.BR, g.p, offsetLabels.piso, bd, 0);

  // Dimension labels on ALL four edges, each with its actual value:
  // base bottom = anchoBot, offset top = anchoTop, base left =
  // altoIzq, offset right = altoDer. Lines sit just outside the edge.
  const dimLabel = (v) => { const s = fmtInches(v); return (s === null || v <= 0) ? null : s + '"'; };
  drawDimLinePx(c, cn.BL, cn.BR, 1, dimLabel(g.anchoBot), 'bottom');
  drawDimLinePx(c, oq.TL, oq.TR, -1, dimLabel(g.anchoTop), 'top');
  drawDimLinePx(c, cn.TL, cn.BL, 1, dimLabel(g.altoIzq), 'left');
  drawDimLinePx(c, oq.TR, oq.BR, -1, dimLabel(g.altoDer), 'right');

  if (opts && opts.handles) drawHandles(c);
}

function drawHandles(c) {
  const r = Math.max(10, baseW * 0.018);
  for (const k of ['TL', 'TR', 'BR', 'BL']) {
    const p = corners[k];
    c.beginPath();
    c.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fill();
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.fillStyle = '#fff';
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = LINE_COLOR;
    c.stroke();
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(p.x - r * 0.6, p.y); c.lineTo(p.x + r * 0.6, p.y);
    c.moveTo(p.x, p.y - r * 0.6); c.lineTo(p.x, p.y + r * 0.6);
    c.stroke();
  }
}

function drawStrokes(c, interactive) {
  customStrokes.forEach((s, i) => {
    if (s.type === 'line' || s.type === 'arrow') drawArrowLine(c, s.a, s.b, s.label, s.type === 'line', s.labelScale || 1, interactive ? i : null);
    else if (s.type === 'text') drawTextAnno(c, s, interactive ? i : null);
  });
}

// the label box of the current selection, from the last render
function selectedBox() {
  if (!selected) return null;
  if (selected.kind === 'stroke') return hitBoxes.strokes[selected.index] || null;
  if (selected.kind === 'dim') return hitBoxes.dims[selected.key] || null;
  return null;
}

// resize handle anchor: the label box's bottom-right corner, in the
// box's rotated frame
function resizeHandlePoint(box) {
  const cos = Math.cos(box.angle || 0), sin = Math.sin(box.angle || 0);
  return {
    x: box.cx + (box.w / 2) * cos - (box.h / 2) * sin,
    y: box.cy + (box.w / 2) * sin + (box.h / 2) * cos
  };
}

function drawSelectionOverlay() {
  const box = selectedBox();
  if (!box) return;
  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(box.angle || 0);
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(-box.w / 2 - 4, -box.h / 2 - 4, box.w + 8, box.h + 8);
  ctx.setLineDash([]);
  // resize handle (bottom-right)
  ctx.beginPath();
  ctx.arc(box.w / 2, box.h / 2, Math.max(7, labelFontSize() * 0.32), 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = LINE_COLOR;
  ctx.stroke();
  ctx.restore();
}

function redraw() {
  hitBoxes = { strokes: {}, dims: {} };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, baseW, baseH);
  if (corners) renderFrame(ctx, corners, { handles: true });
  drawStrokes(ctx, true);
  // in-progress shape
  if (drawingShape) {
    drawArrowLine(ctx, drawingShape.a, drawingShape.b, null, drawingShape.type === 'line');
  }
  drawSelectionOverlay();
}

// ── corner init / reset ──
function resetCorners() {
  if (!frameNorm) frameNorm = computeFrameNorm(measurements);
  corners = rectCorners();
  redraw();
}

// ── annotation persistence ──
// The marked-photo payload returned to the wizard keeps its original
// { type, dataUrl } shape; annotations ride along as an extra field
// the wizard may store and hand back on a later NIVELATO_MEASUREMENTS
// message (payload.annotations) to restore placement and sizes.
// Backward compatible both ways: old wizards ignore the extra field,
// and a payload without annotations restores nothing.
function serializeAnnotations() {
  return JSON.parse(JSON.stringify({
    v: 1,
    strokes: customStrokes,
    dimLabels: dimLabels,
    corners: corners
  }));
}

function restoreAnnotations(data) {
  if (!data || typeof data !== 'object') return false;
  let changed = false;
  if (Array.isArray(data.strokes)) {
    customStrokes = data.strokes.filter(s => {
      if (!s || typeof s !== 'object') return false;
      if (s.type === 'text') return typeof s.x === 'number' && typeof s.y === 'number' && typeof s.label === 'string';
      if (s.type === 'line' || s.type === 'arrow') return s.a && s.b && typeof s.a.x === 'number' && typeof s.b.x === 'number';
      return false;
    }).map(s => {
      const out = Object.assign({}, s);
      out.labelScale = (typeof s.labelScale === 'number' && s.labelScale > 0) ? s.labelScale : 1;
      return out;
    });
    changed = true;
  }
  if (data.dimLabels && typeof data.dimLabels === 'object') {
    for (const k of ['bottom', 'top', 'left', 'right']) {
      const d = data.dimLabels[k];
      if (d && typeof d === 'object') {
        dimLabels[k] = {
          pos: (d.pos && typeof d.pos.x === 'number' && typeof d.pos.y === 'number') ? { x: d.pos.x, y: d.pos.y } : null,
          scale: (typeof d.scale === 'number' && d.scale > 0) ? d.scale : 1
        };
      }
    }
    changed = true;
  }
  if (data.corners && img && data.corners.TL && data.corners.BR) {
    corners = data.corners;
    changed = true;
  }
  selected = null;
  if (changed && img) redraw();
  return changed;
}

// ── annotation hit testing (image px) ──
function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hitAnnotation(p) {
  // resize handle of the current selection wins over everything
  const box = selectedBox();
  if (box) {
    const hp = resizeHandlePoint(box);
    if (Math.hypot(p.x - hp.x, p.y - hp.y) <= Math.max(14, 22 / scale)) return { mode: 'resize' };
  }
  // custom strokes, topmost (last drawn) first
  for (let i = customStrokes.length - 1; i >= 0; i--) {
    const s = customStrokes[i];
    if (hitBoxes.strokes[i] && pointInBox(p, hitBoxes.strokes[i])) return { mode: 'move', sel: { kind: 'stroke', index: i } };
    if ((s.type === 'line' || s.type === 'arrow') && distToSegment(p, s.a, s.b) <= Math.max(10, 20 / scale)) {
      return { mode: 'move', sel: { kind: 'stroke', index: i } };
    }
  }
  // dimension labels
  for (const k of ['bottom', 'top', 'left', 'right']) {
    if (hitBoxes.dims[k] && pointInBox(p, hitBoxes.dims[k])) return { mode: 'move', sel: { kind: 'dim', key: k } };
  }
  return null;
}

// ── image loading ──
document.getElementById('btn-camera').addEventListener('click', () => {
  document.getElementById('file-input-camera').click();
});
document.getElementById('btn-gallery').addEventListener('click', () => {
  document.getElementById('file-input-gallery').click();
});

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB — dataURL buffering costs ~1.37x the raw bytes

function showLoadError(msg) {
  const box = document.getElementById('load-error');
  box.textContent = msg;
  box.style.display = 'block';
  // only resurface the empty state if there is no photo loaded yet;
  // a failed re-pick keeps the current photo and just hints the error
  if (!img) document.getElementById('empty-state').style.display = 'flex';
  setHint(msg);
}

function clearLoadError() {
  const box = document.getElementById('load-error');
  box.textContent = '';
  box.style.display = 'none';
}

['file-input-camera', 'file-input-gallery'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('change', (e) => {
    const f = e.target.files[0];
    el.value = '';
    if (!f) return;
    clearLoadError();
    // accept="image/*" is advisory — validate client-side before buffering
    // the whole file into memory as base64 (~1.37x the file size).
    if (f.type && !f.type.startsWith('image/')) {
      showLoadError(L('No se pudo leer la foto: el archivo no es una imagen (', 'Could not read the photo: the file is not an image (') + f.type + ').');
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      showLoadError(L('No se pudo leer la foto: el archivo pesa más de 25 MB (', 'Could not read the photo: the file is larger than 25 MB (') + Math.round(f.size / 1048576) + ' MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => loadImage(ev.target.result);
    reader.onerror = () => showLoadError(L('No se pudo leer la foto: error al abrir el archivo.', 'Could not read the photo: error opening the file.'));
    try {
      reader.readAsDataURL(f);
    } catch (err) {
      showLoadError(L('No se pudo leer la foto: ', 'Could not read the photo: ') + (err && err.message ? err.message : err));
    }
  });
});

function loadImage(dataUrl) {
  const im = new Image();
  im.onerror = () => showLoadError(L('No se pudo leer la foto: el archivo está dañado o usa un formato no compatible (p. ej. HEIC).', 'Could not read the photo: the file is damaged or uses an unsupported format (e.g. HEIC).'));
  im.onload = () => {
    clearLoadError();
    img = im;
    baseW = im.naturalWidth;
    baseH = im.naturalHeight;
    const maxEdge = 1600;
    if (Math.max(baseW, baseH) > maxEdge) {
      const r = maxEdge / Math.max(baseW, baseH);
      baseW = Math.round(baseW * r);
      baseH = Math.round(baseH * r);
    }
    canvas.width = baseW;
    canvas.height = baseH;
    fitCanvas();
    canvas.style.display = 'block';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('toolbar').style.display = 'flex';
    btnDone.disabled = false;
    btnReset.disabled = false;
    resetCorners();
    // annotations handed in with the measurements (restore path)
    if (pendingAnnotations) { restoreAnnotations(pendingAnnotations); pendingAnnotations = null; }
    setHint(HINT_DEFAULT());
  };
  im.src = dataUrl;
}

// ── canvas fit: CONTAIN fit inside the stage. The canvas backing store
// is the (capped) photo pixel size and the CSS size is the same aspect
// scaled by min(availW/baseW, availH/baseH), so the photo is never
// stretched: portrait and landscape both letterbox. Pointer mapping in
// toImageCoords divides by the canvas's displayed rect, so overlay and
// frame coordinates stay true to the displayed photo. ──
function fitCanvas() {
  if (!img) return;
  const stageRect = stage.getBoundingClientRect();
  const pad = 8;
  const availW = Math.max(1, stageRect.width - pad);
  const availH = Math.max(1, stageRect.height - pad);
  scale = Math.min(availW / baseW, availH / baseH);
  canvas.style.width = (baseW * scale) + 'px';
  canvas.style.height = (baseH * scale) + 'px';
  canvas.style.aspectRatio = baseW + ' / ' + baseH;
}
on(window, 'resize', fitCanvas);
on(window, 'orientationchange', () => setTimeout(fitCanvas, 100));

// ── hit testing / dragging ──
function hitHandle(e) {
  if (!corners) return null;
  const p = toImageCoords(e);
  const tol = 26 / scale;
  let best = null, bestD = tol;
  for (const k of ['TL', 'TR', 'BR', 'BL']) {
    const hp = corners[k];
    const d = Math.hypot(hp.x - p.x, hp.y - p.y);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

// ── loupe: sample the actual displayed canvas region ──
function showLoupe(clientX, clientY) {
  if (!img) return;
  loupeCanvas.style.display = 'block';
  const rawP = toImageCoords({ clientX, clientY });
  // clamp to the image bounds: the loupe must never sample past the edges.
  // (dragged corners are clamped identically, so the crosshair always shows
  // the handle's true position, even when the finger slides off the photo)
  const p = {
    x: Math.max(0, Math.min(baseW, rawP.x)),
    y: Math.max(0, Math.min(baseH, rawP.y))
  };
  const r = LOUPE / 2;
  loupeCanvas.width = LOUPE;
  loupeCanvas.height = LOUPE;
  loupeCtx.clearRect(0, 0, LOUPE, LOUPE);
  loupeCtx.save();
  loupeCtx.beginPath();
  loupeCtx.arc(r, r, r - 2, 0, Math.PI * 2);
  loupeCtx.clip();
  // sample from the DISPLAYED canvas, not the full-res img: the pointer
  // mapping, the frame, and the strokes all live in canvas-pixel space,
  // so the magnifier shows exactly what's under the finger (before, it
  // sampled the unscaled photo and the crosshair drifted off the handles
  // on any photo larger than 1600px — i.e. every real phone photo)
  const srcR = LOUPE / (2 * LOUPE_ZOOM * scale);
  loupeCtx.drawImage(canvas,
    p.x - srcR, p.y - srcR, srcR * 2, srcR * 2,
    0, 0, LOUPE, LOUPE);
  loupeCtx.restore();
  // crosshair (lines only — no circle)
  loupeCtx.strokeStyle = 'rgba(255,255,255,0.9)';
  loupeCtx.lineWidth = 1;
  loupeCtx.beginPath();
  loupeCtx.moveTo(r, r - 9); loupeCtx.lineTo(r, r + 9);
  loupeCtx.moveTo(r - 9, r); loupeCtx.lineTo(r + 9, r);
  loupeCtx.stroke();
  // position
  let lx = clientX + 26, ly = clientY - LOUPE - 14;
  if (lx + LOUPE > window.innerWidth) lx = clientX - LOUPE - 26;
  if (ly < 0) ly = clientY + 26;
  loupeCanvas.style.left = lx + 'px';
  loupeCanvas.style.top = ly + 'px';
  loupeCanvas.style.width = LOUPE + 'px';
  loupeCanvas.style.height = LOUPE + 'px';
}

function hideLoupe() {
  loupeCanvas.style.display = 'none';
}

// ── annotation drag helpers ──
function currentLabelScale(sel) {
  if (!sel) return 1;
  if (sel.kind === 'dim') return dimLabels[sel.key].scale;
  const s = customStrokes[sel.index];
  return s ? (s.labelScale || 1) : 1;
}

function snapshotSelection(sel) {
  if (sel.kind === 'dim') {
    const d = dimLabels[sel.key];
    const box = hitBoxes.dims[sel.key];
    return {
      pos: d.pos ? { x: d.pos.x, y: d.pos.y } : (box ? { x: box.cx, y: box.cy } : null),
      scale: d.scale
    };
  }
  const s = customStrokes[sel.index];
  if (!s) return null;
  if (s.type === 'text') return { x: s.x, y: s.y, labelScale: s.labelScale || 1 };
  return {
    a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y },
    labelScale: s.labelScale || 1
  };
}

function applyAnnoDrag(p) {
  if (!annoDrag) return;
  const dx = p.x - annoDrag.start.x, dy = p.y - annoDrag.start.y;
  const sel = annoDrag.sel, orig = annoDrag.orig;
  if (annoDrag.mode === 'resize') {
    const ns = Math.max(0.5, Math.min(3, annoDrag.origScale + dx / (labelFontSize() * 5)));
    if (sel.kind === 'dim') dimLabels[sel.key].scale = ns;
    else { const s = customStrokes[sel.index]; if (s) s.labelScale = ns; }
    redraw();
    return;
  }
  if (!orig) return;
  if (sel.kind === 'dim') {
    if (orig.pos) dimLabels[sel.key].pos = { x: orig.pos.x + dx, y: orig.pos.y + dy };
  } else {
    const s = customStrokes[sel.index];
    if (!s) return;
    if (s.type === 'text') { s.x = orig.x + dx; s.y = orig.y + dy; }
    else { s.a = { x: orig.a.x + dx, y: orig.a.y + dy }; s.b = { x: orig.b.x + dx, y: orig.b.y + dy }; }
  }
  redraw();
}

// ── pointer handlers ──
canvas.addEventListener('pointerdown', (e) => {
  if (!img) return;
  e.preventDefault();
  const p = toImageCoords(e);
  if (currentTool === 'line' || currentTool === 'arrow') {
    drawingShape = { type: currentTool, a: p, b: p };
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    showLoupe(e.clientX, e.clientY);
    return;
  }
  if (currentTool === 'text') {
    pendingLabel = { type: 'text', a: p };
    openLabelModal(L('Texto', 'Text'), []);
    return;
  }
  // annotation select / move / resize (no drawing tool active):
  // annotations were previously baked into the redraw with no
  // hit-testing, so placed items could never be selected or moved.
  if (currentTool === 'none') {
    const hit = hitAnnotation(p);
    if (hit && hit.mode === 'resize' && selected) {
      annoDrag = { mode: 'resize', sel: selected, start: p, origScale: currentLabelScale(selected) };
      activePointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (hit && hit.sel) {
      selected = hit.sel;
      annoDrag = { mode: 'move', sel: hit.sel, start: p, orig: snapshotSelection(hit.sel) };
      activePointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      setHint(HINT_SELECTED());
      redraw();
      return;
    }
    if (selected) { selected = null; redraw(); }
  }
  // frame corner drag (default)
  const h = hitHandle(e);
  if (h) {
    dragging = h;
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    setHint(L('Arrastra para mover la esquina', 'Drag to move the corner'));
    showLoupe(e.clientX, e.clientY);
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!img) return;
  if (annoDrag && e.pointerId === activePointer) {
    e.preventDefault();
    applyAnnoDrag(toImageCoords(e));
    return;
  }
  if (drawingShape && e.pointerId === activePointer) {
    e.preventDefault();
    drawingShape.b = toImageCoords(e);
    redraw();
    showLoupe(e.clientX, e.clientY);
    return;
  }
  if (!dragging || e.pointerId !== activePointer) return;
  e.preventDefault();
  const p = toImageCoords(e);
  corners[dragging] = { x: Math.max(0, Math.min(baseW, p.x)), y: Math.max(0, Math.min(baseH, p.y)) };
  redraw();
  showLoupe(e.clientX, e.clientY);
});

function endPointer(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  hideLoupe();
  if (annoDrag) {
    // placement/size now live in customStrokes / dimLabels, which
    // serializeAnnotations() includes in the saved payload
    annoDrag = null;
    redraw();
    setHint(HINT_DEFAULT());
    return;
  }
  if (drawingShape) {
    const len = Math.hypot(drawingShape.b.x - drawingShape.a.x, drawingShape.b.y - drawingShape.a.y);
    if (len > 8) {
      pendingLabel = { type: drawingShape.type, a: drawingShape.a, b: drawingShape.b };
      openLabelModal(drawingShape.type === 'arrow' ? L('Etiqueta de flecha', 'Arrow label') : L('Etiqueta de línea', 'Line label'), quickLabels);
    }
    drawingShape = null;
    redraw();
    return;
  }
  if (dragging) {
    dragging = null;
    setHint(HINT_DEFAULT());
  }
}
canvas.addEventListener('pointerup', endPointer);
// pointercancel (OS-level cancellation, e.g. a phone call or palm gesture)
// must clear the same drag state or the loupe/drag sticks forever
canvas.addEventListener('pointercancel', endPointer);

// ── label modal ──
function openLabelModal(title, chips) {
  document.getElementById('label-title').textContent = title;
  const chipBox = document.getElementById('quick-chips');
  chipBox.innerHTML = '';
  (chips || []).forEach(l => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l;
    b.onclick = () => { document.getElementById('label-input').value = l; };
    chipBox.appendChild(b);
  });
  document.getElementById('label-input').value = '';
  document.getElementById('label-modal').classList.add('open');
  setTimeout(() => document.getElementById('label-input').focus(), 50);
}

function closeLabelModal() {
  document.getElementById('label-modal').classList.remove('open');
  pendingLabel = null;
  redraw();
}
on(document, 'keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('label-modal').classList.contains('open')) {
    closeLabelModal();
  } else if (e.key === 'Escape' && selected) {
    selected = null;
    redraw();
  }
});

document.getElementById('btn-label-ok').addEventListener('click', () => {
  const val = document.getElementById('label-input').value.trim();
  document.getElementById('label-modal').classList.remove('open');
  if (!pendingLabel) return;
  const pl = pendingLabel;
  pendingLabel = null;
  if (pl.type === 'text') {
    // text without content is pointless — drop it
    if (!val) { redraw(); return; }
    customStrokes.push({ type: 'text', x: pl.a.x, y: pl.a.y, label: val, labelScale: 1 });
  } else {
    // line/arrow persist even without a label
    customStrokes.push({ type: pl.type, a: pl.a, b: pl.b, label: val || null, labelScale: 1 });
  }
  redraw();
});
document.getElementById('btn-label-cancel').addEventListener('click', () => {
  closeLabelModal();
});

// ── toolbar ──
document.querySelectorAll('.tool-btn[data-tool]').forEach(b => {
  b.addEventListener('click', () => {
    selected = null;
    if (img) redraw();
    if (currentTool === b.dataset.tool) {
      currentTool = 'none';
      b.classList.remove('active');
      setHint(HINT_DEFAULT());
      return;
    }
    currentTool = b.dataset.tool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    setHint({
      line: L('Arrastra para dibujar una línea de medida', 'Drag to draw a measurement line'),
      arrow: L('Arrastra para dibujar una flecha', 'Drag to draw an arrow'),
      text: L('Toca la foto para agregar texto', 'Tap the photo to add text')
    }[currentTool]);
  });
});
document.getElementById('btn-undo').addEventListener('click', () => {
  if (customStrokes.length) { customStrokes.pop(); selected = null; redraw(); }
});

btnReset.addEventListener('click', () => {
  if (!img) return;
  resetCorners();
  setHint(L('Marco restablecido', 'Frame reset'));
});

// ── done → composite + send back ──
const DONE_ACK_TIMEOUT_MS = 5000;
let doneAckTimer = null;

function restoreDoneButton() {
  btnDone.disabled = false;
  if (btnDoneLabel) btnDoneLabel.textContent = L('Usar esta foto', 'Use this photo'); else btnDone.textContent = L('Usar esta foto', 'Use this photo');
  if (doneAckTimer) { clearTimeout(doneAckTimer); doneAckTimer = null; }
}

btnDone.addEventListener('click', () => {
  if (!img) return;
  btnDone.disabled = true;
  if (btnDoneLabel) btnDoneLabel.textContent = L('Generando…', 'Generating…'); else btnDone.textContent = L('Generando…', 'Generating…');
  const out = document.createElement('canvas');
  out.width = baseW; out.height = baseH;
  const octx = out.getContext('2d');
  octx.drawImage(img, 0, 0, baseW, baseH);
  if (corners) renderFrame(octx, corners, { handles: false });
  drawStrokes(octx, false);
  const dataUrl = out.toDataURL('image/jpeg', 0.9);
  // annotations extension: placement + sizes of every label/annotation
  // and the frame corners, so the wizard can persist them with the
  // photo and hand them back for a later edit (see restoreAnnotations)
  const annotations = serializeAnnotations();
  try {
    opts.onDone(dataUrl, annotations);
    doneAckTimer = setTimeout(() => {
      restoreDoneButton();
      setHint(L('Parece que la foto no llegó al destino. Toca "Usar esta foto" para reintentar.', 'It looks like the photo did not reach its destination. Tap "Use this photo" to try again.'));
    }, DONE_ACK_TIMEOUT_MS);
  } catch (e) {
    restoreDoneButton();
    alert(L('Error al enviar la foto: ', 'Error sending the photo: ') + e.message);
  }
});

// ── measurements handoff from the flow ──
const handleMessage = (e) => {
  // Only the app itself may inject data into this page: messages are
  // accepted from the app origin only, never from any window reference.
  if (e.origin !== location.origin) return;
  if (e.data && e.data.type === 'NIVELATO_PHOTO_ACK') {
    restoreDoneButton();
    return;
  }
  if (e.data && e.data.type === 'NIVELATO_MEASUREMENTS') {
    // Offset values: the wizard already sends the four offset labels
    // (paredIzq/paredDer/techo/piso, e.g. '→ 1/4"'), whose arrow sign +
    // magnitude give the signed raw inches. EXTENSION (backward
    // compatible, all optional): numeric raws win over label parsing
    // when present, as e.data.offsets.{paredIzq,paredDer,techo,piso},
    // e.data.paredes.{izq,der,techo,piso}.desnivel (the saved-job
    // shape), or flat e.data.paredIzqRaw / paredDerRaw / techoRaw /
    // pisoRaw. e.data.annotations restores a saved annotations payload.
    const numRaw = (flat, offKey, paredKey) => {
      if (typeof e.data[flat] === 'number') return e.data[flat];
      if (e.data.offsets && typeof e.data.offsets[offKey] === 'number') return e.data.offsets[offKey];
      if (e.data.paredes && e.data.paredes[paredKey] && typeof e.data.paredes[paredKey].desnivel === 'number') return e.data.paredes[paredKey].desnivel;
      return null;
    };
    const rawOrLabel = (num, label, negCh) => (num !== null ? num : labelSign(label, negCh) * parseLabel(label));
    measurements = {
      anchoBot: e.data.anchoBot,
      anchoTop: e.data.anchoTop,
      altoIzq: e.data.altoIzq,
      altoDer: e.data.altoDer,
      paredIzq: rawOrLabel(numRaw('paredIzqRaw', 'paredIzq', 'izq'), e.data.paredIzq, '←'),
      paredDer: rawOrLabel(numRaw('paredDerRaw', 'paredDer', 'der'), e.data.paredDer, '→'),
      techo: rawOrLabel(numRaw('techoRaw', 'techo', 'techo'), e.data.techo, '↑'),
      piso: rawOrLabel(numRaw('pisoRaw', 'piso', 'piso'), e.data.piso, '↓')
    };
    // Optional signed A->B value (e.data.offsetSigned, e.g. '+2"'): appended
    // to the badge text; older senders omit it and keep the plain label.
    const sg = e.data.offsetSigned || {};
    const withSigned = (lab, k) => (lab && lab !== 'Nivel' && typeof sg[k] === 'string' && sg[k]) ? lab + ' (' + sg[k] + ')' : (lab || '');
    offsetLabels = {
      paredIzq: withSigned(e.data.paredIzq, 'paredIzq'), paredDer: withSigned(e.data.paredDer, 'paredDer'),
      techo: withSigned(e.data.techo, 'techo'), piso: withSigned(e.data.piso, 'piso')
    };
    if (e.data.annotations) {
      if (img) restoreAnnotations(e.data.annotations);
      else pendingAnnotations = e.data.annotations;
    }
    quickLabels = [];
    const push = (v) => { if (v) quickLabels.push(v); };
    push(e.data.anchoBot ? fmtInches(e.data.anchoBot) + '"' : null);
    push(e.data.anchoTop ? fmtInches(e.data.anchoTop) + '"' : null);
    push(e.data.altoIzq ? fmtInches(e.data.altoIzq) + '"' : null);
    push(e.data.altoDer ? fmtInches(e.data.altoDer) + '"' : null);
    push(e.data.paredIzq); push(e.data.paredDer); push(e.data.techo); push(e.data.piso);
    if (e.data.customer) quickLabels.push(e.data.customer);
    document.getElementById('header-sub').textContent = L('Medidas cargadas - alinea el marco', 'Measurements loaded - align the frame');
    frameNorm = computeFrameNorm(measurements);
    if (img) {
      // a restored annotations payload carries its own frame corners;
      // only re-derive the initial rectangle when none arrived
      if (e.data.annotations && corners) redraw();
      else resetCorners();
      setHint(HINT_DEFAULT());
    }
  }
};

function parseLabel(s) {
  if (!s) return 0;
  // "47 1/4"" → 47.25 · "1/4"" → 0.25 (fraction may have no whole part)
  const m = s.match(/(?:(\d+)\s+)?(\d+)\/(\d+)|(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  if (m[2] !== undefined) return (parseInt(m[1]) || 0) + (parseInt(m[2]) / parseInt(m[3]));
  return parseFloat(m[4]) || 0;
}

// Direction arrows give the sign (same convention as the main app).
function labelSign(s, negCh) { return (s && s.indexOf(negCh) !== -1) ? -1 : 1; }
return {
  setMeasurements: (data: any) => handleMessage({ origin: location.origin, data: { type: 'NIVELATO_MEASUREMENTS', ...data } }),
  ack: () => handleMessage({ origin: location.origin, data: { type: 'NIVELATO_PHOTO_ACK' } }),
  loadDataUrl: (u: string) => loadImage(u),
  state: () => ({ hasImage: !!img, baseW, baseH, hasFrame: !!corners, strokes: customStrokes.length, corners, frameNorm }),
  destroy: () => { offs.forEach((f) => f()); try { clearTimeout(doneAckTimer); } catch (e) {} },
};
}
