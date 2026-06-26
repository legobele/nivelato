import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getDoc, doc, setDoc, collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// ── embedGraph — standalone copy to avoid loading adhd.js ──
// Extract only the numeric value from a label, ignoring direction arrows.
// The math convention in the graph already determines the sign:
//   rightHeight = leftHeight - ceilingOffset - floorOffset
// where ceilingOffset and floorOffset are always positive magnitudes.
function extractValue(s) {
  if (!s || s === 'Nivel' || s === '—') return 0;
  var m = s.match(/(\d+)\s*(?:(\d+)\/(\d+))?/);
  if (!m) return 0;
  return (parseInt(m[1]) || 0) + ((parseInt(m[2])||0) / (parseInt(m[3])||1));
}

window.embedGraph = function(cvs, data) {
  if (!cvs || !data) return;
  var pIv = extractValue(data.pIL);
  var pDv = extractValue(data.pDL);
  var tcv = extractValue(data.tL);
  var psv = extractValue(data.pL);
  window._embedData = {
    'hueco-ancho-bot-whole': data.anchoBot || 36,
    'hueco-alto-izq-whole': data.altoIzq || 84,
    'pI-a-whole': pIv, 'pI-b-whole': 0,
    'pD-a-whole': pDv, 'pD-b-whole': 0,
    't-a-whole': tcv, 't-b-whole': 0,
    'p-a-whole': psv, 'p-b-whole': 0,
  };
  window.results = {
    paredIzq: { raw: pIv, dir: "", label: data.pIL || "Nivel" },
    paredDer: { raw: pDv, dir: "", label: data.pDL || "Nivel" },
    techo: { raw: tcv, dir: "", label: data.tL || "Nivel" },
    piso: { raw: psv, dir: "", label: data.pL || "Nivel" }
  };
  var dctx = cvs.getContext('2d');
  var W = cvs.width, H = cvs.height;
  dctx.clearRect(0,0,W,H);
  dctx.fillStyle = '#f8faff';
  dctx.fillRect(0,0,W,H);
  var sc = 1, ox = 0, oy = 0;
  dctx.save();
  dctx.translate(W/2 + ox, H/2 + oy);
  dctx.scale(sc, sc);
  dctx.translate(-W/2, -H/2);
  var pad = 72, bx = pad, by = pad, bw = W - pad*2, bh = H - pad*2;
  var EXAG = Math.min(bw, bh) * 0.15;
  var clamp = function(v, lim) { return Math.max(-lim, Math.min(lim, v)); };
  var pIMax = Math.max(pIv, 1), pDMax = Math.max(pDv, 1);
  var tMax = Math.max(tcv, 1), pMax = Math.max(psv, 1);
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
  var anchoBot = data.anchoBot || 36, altoIzq = data.altoIzq || 84;
  var anchoTop = anchoBot - pIv - pDv, altoDer = altoIzq - tcv - psv;
  if (anchoBot > 0) {
    var byOff = 24;
    dctx.strokeStyle = '#adb5bd'; dctx.lineWidth = 1; dctx.setLineDash([3,3]);
    dctx.beginPath(); dctx.moveTo(roughBL.x, roughBL.y + byOff); dctx.lineTo(roughBR.x, roughBR.y + byOff); dctx.stroke(); dctx.setLineDash([]);
    dctx.beginPath(); dctx.moveTo(roughBL.x, roughBL.y + byOff - 6); dctx.lineTo(roughBL.x, roughBL.y + byOff + 6); dctx.stroke();
    dctx.beginPath(); dctx.moveTo(roughBR.x, roughBR.y + byOff - 6); dctx.lineTo(roughBR.x, roughBR.y + byOff + 6); dctx.stroke();
    dctx.fillStyle = '#495057'; dctx.font = 'bold 12px Inter, system-ui, sans-serif'; dctx.textAlign = 'center'; dctx.textBaseline = 'top';
    dctx.fillText(anchoBot + '"', (roughBL.x + roughBR.x) / 2, Math.max(roughBL.y, roughBR.y) + byOff + 10);
  }
  if (anchoBot > 0) {
    var tyOff = 24;
    dctx.strokeStyle = '#adb5bd'; dctx.lineWidth = 1; dctx.setLineDash([3,3]);
    dctx.beginPath(); dctx.moveTo(roughTL.x, roughTL.y - tyOff); dctx.lineTo(roughTR.x, roughTR.y - tyOff); dctx.stroke(); dctx.setLineDash([]);
    dctx.beginPath(); dctx.moveTo(roughTL.x, roughTL.y - tyOff - 6); dctx.lineTo(roughTL.x, roughTL.y - tyOff + 6); dctx.stroke();
    dctx.beginPath(); dctx.moveTo(roughTR.x, roughTR.y - tyOff - 6); dctx.lineTo(roughTR.x, roughTR.y - tyOff + 6); dctx.stroke();
    dctx.fillStyle = '#495057'; dctx.font = 'bold 12px Inter, system-ui, sans-serif'; dctx.textAlign = 'center'; dctx.textBaseline = 'bottom';
    dctx.fillText(anchoTop + '"', (roughTL.x + roughTR.x) / 2, Math.min(roughTL.y, roughTR.y) - tyOff - 10);
  }
  if (altoIzq > 0) {
    var lxOff = 24;
    var lyMid = (roughTL.y + roughBL.y) / 2;
    dctx.strokeStyle = '#adb5bd'; dctx.lineWidth = 1; dctx.setLineDash([3,3]);
    dctx.beginPath(); dctx.moveTo(roughTL.x - lxOff, roughTL.y); dctx.lineTo(roughBL.x - lxOff, roughBL.y); dctx.stroke(); dctx.setLineDash([]);
    dctx.beginPath(); dctx.moveTo(roughTL.x - lxOff - 6, roughTL.y - 6); dctx.lineTo(roughTL.x - lxOff + 6, roughTL.y + 6); dctx.stroke();
    dctx.beginPath(); dctx.moveTo(roughBL.x - lxOff - 6, roughBL.y - 6); dctx.lineTo(roughBL.x - lxOff + 6, roughBL.y + 6); dctx.stroke();
    dctx.fillStyle = '#495057'; dctx.font = 'bold 12px Inter, system-ui, sans-serif'; dctx.textAlign = 'right'; dctx.textBaseline = 'middle';
    dctx.fillText(altoIzq + '"', Math.min(roughTL.x, roughBL.x) - lxOff - 10, lyMid);
  }
  if (altoIzq > 0) {
    var rxOff = 24;
    var ryMid = (roughTR.y + roughBR.y) / 2;
    dctx.strokeStyle = '#adb5bd'; dctx.lineWidth = 1; dctx.setLineDash([3,3]);
    dctx.beginPath(); dctx.moveTo(roughTR.x + rxOff, roughTR.y); dctx.lineTo(roughBR.x + rxOff, roughBR.y); dctx.stroke(); dctx.setLineDash([]);
    dctx.beginPath(); dctx.moveTo(roughTR.x + rxOff - 6, roughTR.y - 6); dctx.lineTo(roughTR.x + rxOff + 6, roughTR.y + 6); dctx.stroke();
    dctx.beginPath(); dctx.moveTo(roughBR.x + rxOff - 6, roughBR.y - 6); dctx.lineTo(roughBR.x + rxOff + 6, roughBR.y + 6); dctx.stroke();
    dctx.fillStyle = '#495057'; dctx.font = 'bold 12px Inter, system-ui, sans-serif'; dctx.textAlign = 'left'; dctx.textBaseline = 'middle';
    dctx.fillText(altoDer + '"', Math.max(roughTR.x, roughBR.x) + rxOff + 10, ryMid);
  }
  dctx.restore();
};

  let allJobs = [];
let currentUser;

  if (typeof onAuthStateChanged === "undefined") {
    const dl = document.querySelector(".loading");
    if(dl) dl.textContent = "Conectando...";
    setTimeout(() => { if (typeof onAuthStateChanged === "undefined") window.location.href = "./index.html"; }, 3000);
  } else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    // check if account is pending approval
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if (userSnap.exists() && userSnap.data().disabled === true) {
      window._pendingSignOut = async () => { await signOut(auth); window.location.href = 'login.html'; };
      document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;font-family:Inter,sans-serif;gap:16px;padding:32px;text-align:center"><div style="font-size:48px">⏳</div><h2 style="color:#212529">Cuenta pendiente de aprobación</h2><p style="color:#868e96;max-width:320px">Tu cuenta está siendo revisada. El administrador del taller te dará acceso en breve.</p><button onclick="window._pendingSignOut()" style="padding:12px 28px;background:#1971c2;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">Cerrar sesión</button></div>';
      return;
    }
    currentUser = user;
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data();
    const DASH_ROLES = ['owner', 'cotizador', 'supervisor'];
    if (!userData || !DASH_ROLES.includes(userData.role||userData.installerRole)) {
      window.location.href = 'index.html'; return;
    }
    // supervisor and measurer can also create new measurements
    const canMeasure = ['owner', 'supervisor', 'measurer'].includes(userData.role);
    window._canMeasure = canMeasure;
    const orgId = userData.orgId;
    // load org name
    const btnNew = document.getElementById('btn-new-measure');
    if (btnNew && window._canMeasure) btnNew.style.display = 'block';
    const orgDoc = await getDoc(doc(db, 'orgs', orgId));
    const orgName = orgDoc.data()?.name || orgId;
    document.getElementById('org-name-badge').textContent = orgName;
    document.getElementById('dash-subtitle').textContent = `${orgName} · ${userData.role === 'owner' ? 'Administrador' : 'Cotizaciones'}`;
    // show join code for owners
    if (userData.role === 'owner') {
      const jcs = document.getElementById('join-code-section');
      jcs.style.display = 'flex';
      document.getElementById('join-code-display').textContent = orgId;
    }

    // load jobs
    window._db = db; window._orgId = orgId;
    const jobsRef = collection(db, 'orgs', orgId, 'jobs');
    const q = query(jobsRef, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    allJobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // populate installer filter
    const installers = [...new Set(allJobs.map(j => j.installerName).filter(Boolean))];
    const sel = document.getElementById('filter-installer');
    installers.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      sel.appendChild(opt);
    });
    // populate customer filter
    const customers = [...new Set(allJobs.map(j => j.customer).filter(Boolean))];
    const custSel = document.getElementById('filter-customer');
    customers.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      custSel.appendChild(opt);
    });

    renderJobs(allJobs);
  });
  }

  window.applyFilters = () => {
    const date = document.getElementById('filter-date').value;
    const installer = document.getElementById('filter-installer').value;
    const customer = document.getElementById('filter-customer').value;
    let filtered = allJobs;
    if (date) {
      filtered = filtered.filter(j => {
        if (!j.createdAt) return false;
        const d = j.createdAt.toDate ? j.createdAt.toDate() : new Date(j.createdAt);
        return d.toISOString().slice(0,10) === date;
      });
    }
    if (installer) filtered = filtered.filter(j => j.installerName === installer);
    if (customer) filtered = filtered.filter(j => j.customer === customer);
    renderJobs(filtered);
  };

  function renderJobs(jobs) {
    const list = document.getElementById('job-list');
    // stats
    const today = new Date().toISOString().slice(0,10);
    const todayCount = allJobs.filter(j => {
      if (!j.createdAt) return false;
      const d = j.createdAt.toDate ? j.createdAt.toDate() : new Date(j.createdAt);
      return d.toISOString().slice(0,10) === today;
    }).length;
    const warnCount = allJobs.filter(j => j.warnings && j.warnings.length > 0).length;
    document.getElementById('stat-total').textContent = allJobs.length;
    document.getElementById('stat-today').textContent = todayCount;
    document.getElementById('stat-warn').textContent  = warnCount;

    if (jobs.length === 0) {
      list.innerHTML = '<div class="empty-state">No hay medidas registradas aún.</div>';
      return;
    }
    list.innerHTML = jobs.map((job, i) => {
      const date = job.createdAt?.toDate ? job.createdAt.toDate() : new Date(job.createdAt || Date.now());
      const dateStr = date.toLocaleDateString('es-PR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const hasWarn = job.warnings && job.warnings.length > 0;
      const tag = hasWarn
        ? `<span class="job-tag tag-warn">⚠ Advertencias</span>`
        : `<span class="job-tag tag-ok">✓ OK</span>`;
      const hueco = job.hueco ? `${(job.hueco.anchoBot||job.hueco.anchoBottom||job.hueco.ancho||'?')}" × ${(job.hueco.altoIzq||job.hueco.altoLeft||job.hueco.alto||'?')}"` : '—';
      return `
        <div class="job-card" onclick="openJob(${i})">
          <div class="job-card-top">
            <div class="job-title">${job.installerName || 'Técnico'} ${tag}</div>
            <div class="job-date">${dateStr}</div>
          </div>
          <div class="job-meta">
            <span>📐 ${hueco}</span>
            <span>👤 ${job.installerName || '—'}</span>
            ${job.customer ? `<span>🏢 ${job.customer}</span>` : ''}
            ${job.notas ? `<span>📝 ${job.notas.slice(0,30)}${job.notas.length>30?'…':''}</span>` : ''}
          </div>
        </div>`;
    }).join('');
    window._jobs = jobs;
  }

  window._currentJobIdx = null;
  window.openJob = (i) => {
    window._currentJobIdx = i;
    const job = window._jobs[i];
    const date = job.createdAt?.toDate ? job.createdAt.toDate() : new Date(job.createdAt || Date.now());
    const dateStr = date.toLocaleDateString('es-PR', { day:'2-digit', month:'short', year:'numeric' }) + ' ' + date.toLocaleTimeString('es-PR', { hour:'2-digit', minute:'2-digit' });
    document.getElementById('modal-title').textContent = `Medida — ${job.installerName || 'Técnico'}`;
    const row = (l,v) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`;
    const sec = (t) => `<div class="detail-section-title">${t}</div>`;
    let html = '';
    html += sec('General');
    html += row('Técnico', job.installerName || '—');
    html += row('Fecha', dateStr);
    html += row('Cliente', job.customer || '—');
    html += row('Proyecto', job.project || '—');
    html += row('Ubicación', job.location || '—');
    html += sec('Hueco (Abertura)');
    if (job.hueco) {
      // Compute dimensions from desniveles if stored computed values are missing
      var _pIv = extractValue(job.desniveles && job.desniveles.paredIzq);
      var _pDv = extractValue(job.desniveles && job.desniveles.paredDer);
      var _tcv = extractValue(job.desniveles && job.desniveles.techo);
      var _psv = extractValue(job.desniveles && job.desniveles.piso);
      var _anchoBot = (job.hueco.anchoBot || job.hueco.anchoAbajo || job.hueco.anchoBottom || job.hueco.ancho || 0);
      var _altoIzq = (job.hueco.altoIzq || job.hueco.altoIzquierda || job.hueco.alto || 0);
      var _computedAnchoTop = _anchoBot > 0 ? _anchoBot - _pIv - _pDv : 0;
      var _computedAltoDer = _altoIzq > 0 ? _altoIzq - _tcv - _psv : 0;

      html += row('Ancho superior', (job.hueco.anchoTop || job.hueco.anchoSuperior || _computedAnchoTop) ? (job.hueco.anchoTop || job.hueco.anchoSuperior || _computedAnchoTop) + '"' : '—');
      html += row('Ancho inferior', (job.hueco.anchoBot||job.hueco.anchoAbajo||job.hueco.anchoBottom) ? (job.hueco.anchoBot||job.hueco.anchoAbajo||job.hueco.anchoBottom) + '"' : '—');
      html += row('Alto izquierdo', (job.hueco.altoIzq||job.hueco.altoIzquierda) ? (job.hueco.altoIzq||job.hueco.altoIzquierda) + '"' : (job.hueco.alto ? job.hueco.alto + '"' : '—'));
      html += row('Alto derecho',   (job.hueco.altoDer || job.hueco.altoDerecha || _computedAltoDer) ? (job.hueco.altoDer || job.hueco.altoDerecha || _computedAltoDer) + '"' : '—');
    } else { html += row('Hueco', '—'); }
    html += sec('Desniveles');
    html += row('Pared Izq.', job.desniveles?.paredIzq || '—');
    html += row('Pared Der.', job.desniveles?.paredDer || '—');
    html += row('Techo',      job.desniveles?.techo    || '—');
    html += row('Piso',       job.desniveles?.piso     || '—');
    if (job.warnings && job.warnings.length > 0) {
      html += `<div style="margin-top:12px;padding:10px 14px;background:#fff3bf;border-radius:8px;font-size:13px;color:#e67700">${job.warnings.map(w=>`⚠ ${w}`).join('<br>')}</div>`;
    }
    if (job.notas) html += `<div class="modal-notes">📝 ${job.notas}</div>`;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('open');
    window.embedGraph(document.getElementById('modal-canvas'), {
      anchoBot: job.hueco?.anchoBot || 36,
      altoIzq: job.hueco?.altoIzq || 84,
      pIL: job.desniveles?.paredIzq || 'Nivel',
      pDL: job.desniveles?.paredDer || 'Nivel',
      tL: job.desniveles?.techo || 'Nivel',
      pL: job.desniveles?.piso || 'Nivel'
    });
  };

  window.deleteCurrentJob = async () => {
    const i = window._currentJobIdx;
    if (i === null || i === undefined) return;
    const job = window._jobs[i];
    if (!confirm(`¿Eliminar la medida de ${job.installerName || 'este técnico'}? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteDoc(doc(db, 'orgs', window._orgId, 'jobs', job.id));
      document.getElementById('modal-overlay').classList.remove('open');
      // remove from local array and re-render
      allJobs = allJobs.filter(j => j.id !== job.id);
      window._currentJobIdx = null;
      applyFilters();
    } catch(e) {
      alert('Error al eliminar: ' + e.message);
    }
  };

  window.closeModal = (e) => {
    if (!e || e.target === document.getElementById('modal-overlay')) {
      document.getElementById('modal-overlay').classList.remove('open');
    }
  };

  window.copyJoinCode = () => {
    const code = document.getElementById('join-code-display').textContent;
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('copy-btn');
      btn.textContent = '✓ Copiado';
      setTimeout(() => btn.textContent = '📋 Copiar', 2000);
    });
  };

  window.doLogout = async () => {
    await signOut(auth);
    window.location.href = 'login.html';
  };