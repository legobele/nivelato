/* niv-drag.js: shell owned, pointer based drag layer for assigning a
   measurement ("order") to a project by dragging it onto the sidebar.

   Why pointer events and a host layer: native HTML5 drag does not cross
   iframes and does not work on touch. The sidebar lives in an iframe on
   module host pages (modules/sidebar.html) and as a native panel in
   dashboard.html. One host layer serves both:

   - Drag sources: measurement cards/rows in the host document (the
     dashboard measurement list, the native panel Medidas rows, home and
     project measure rows) and Medidas rows inside the sidebar module.
     A module source posts niv:dragstart {measureId, label} (see
     modules/README.md); the host then raises a transparent shield over
     every sidebar iframe so all later pointer events stay in the host.
   - Drop zones: native project rows are read from the native panel DOM;
     module zones arrive as niv:dropzones {zones, scrollRegion} in
     module coordinates and are converted with the iframe rect.
     Highlights are painted natively, or sent back as niv:draghover.
   - The "Nuevo proyecto" / "New project" zone exists only while a drag
     is active (niv:dragactive broadcast for the module; a host created
     element for the native panel), below all other projects. Dropping
     there runs the existing new project flow first (the dashboard
     np modal when present, otherwise a mirror of it collecting name
     and customer), then assigns. Cancelling the name step cancels the
     whole drop with no write.
   - The write follows the existing assignment write in dashboard.html
     (saveEdit): updateDoc on orgs/{orgId}/jobs/{measureId}. The payload
     carries the two project fields the job doc model already uses:
     project (the project name string, exactly what the job edit writes)
     and projectId (the project doc id, the key the project view and the
     project counters filter on; without it a dropped measurement would
     never appear inside its project). Project creation follows the
     existing pattern (saveNewProject): addDoc on
     orgs/{orgId}/projects with {name, customer, memberUids: [],
     createdAt: serverTimestamp(), createdBy}.
   - Hot zones: while dragging, a pointer parked within HOT_BAND_PX of
     the top or bottom edge of a projects scroll region scrolls it.
     Speed ramps with proximity to the edge, from 25 percent of
     MAX_SCROLL_PX_S at the band edge to MAX_SCROLL_PX_S at the region
     edge. Scrolling runs for module regions (via niv:dragscroll ticks)
     and the native panel alike, only while dragging, and the rAF loop
     is cancelled on drop or cancel so no timer outlives the drag.
   - Esc, pointercancel and dropping outside any zone cancel cleanly:
     ghost and shields are removed, highlights cleared, zones hidden,
     no write. A failed write surfaces a non fatal toast in the app
     status style and leaves the assignment unchanged.

   Test seam: window.NivDrag.setAdapter({ assign, createProject })
   replaces the Firestore data path (used by the headless fixtures);
   the default adapter uses window._db / window._currentOrgId /
   window._orgId that dashboard.html publishes, and imports the same
   Firestore build the dashboard module uses. */
(function () {
  'use strict';
  if (window.NivDrag) return;

  var HOT_BAND_PX = 48;
  var MAX_SCROLL_PX_S = 420;
  var THRESHOLD_PX = 6;

  var STRINGS = {
    es: { newProject: 'Nuevo proyecto', assigned: 'Medida asignada', assignError: 'No se pudo asignar la medida', createError: 'No se pudo crear el proyecto', nameRequired: 'El nombre es obligatorio.', nameLabel: 'Nombre *', customerLabel: 'Cliente', create: 'Crear proyecto', cancel: 'Cancelar' },
    en: { newProject: 'New project', assigned: 'Measurement assigned', assignError: 'Could not assign the measurement', createError: 'Could not create the project', nameRequired: 'Name is required.', nameLabel: 'Name *', customerLabel: 'Customer', create: 'Create project', cancel: 'Cancel' }
  };
  function lang() {
    try { if (window.NivSettings && typeof window.NivSettings.getLang === 'function') return window.NivSettings.getLang() === 'en' ? 'en' : 'es'; } catch (e) {}
    try { var v = window.localStorage.getItem('nivelato-login-lang'); if (v === 'en') return 'en'; } catch (e) {}
    try { var m = document.cookie.match(/(?:^|; )nivelato-login-lang=([^;]*)/); if (m && decodeURIComponent(m[1]) === 'en') return 'en'; } catch (e) {}
    return 'es';
  }
  function L(key) { var t = STRINGS[lang()]; return (t && t[key]) || STRINGS.es[key] || key; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------------- injected styles (tokens only) ---------------- */
  var css = [
    '.niv-drag-ghost{position:fixed;z-index:100000;pointer-events:none;max-width:240px;padding:8px 12px;border:1px solid var(--niv-border,#dee2e6);border-radius:10px;background:var(--niv-surface,#fff);color:var(--niv-text,#212529);font-family:Inter,system-ui,sans-serif;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.35);opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.niv-drag-shield{position:fixed;z-index:99990;background:transparent}',
    '[data-niv-drag-zone].niv-drag-hover{background:var(--niv-surface-2,#f1f3f5)!important;outline:2px solid var(--niv-accent,#1971c2);outline-offset:-2px}',
    '.niv-drag-new-native{display:none;align-items:center;justify-content:center;gap:6px;margin-top:6px;padding:10px 12px;border:1.5px dashed var(--niv-border,#ced4da);border-radius:10px;color:var(--niv-text-dim,#868e96);font-size:13px;font-weight:600;text-align:center;font-family:Inter,system-ui,sans-serif}',
    'body.niv-drag-on .niv-drag-new-native{display:flex}',
    '.niv-drag-new-native.niv-drag-hover{background:var(--niv-surface-2,#f1f3f5);outline:2px solid var(--niv-accent,#1971c2);outline-offset:-2px;color:var(--niv-text,#212529)}',
    '.job-card[data-niv-drag-src],.niv-panel-item[data-niv-drag-src],.niv-home-row[data-niv-drag-src],.niv-proj-measure[data-niv-drag-src]{opacity:.45}',
    '.job-card,.niv-panel-item,.niv-home-row,.niv-proj-measure{touch-action:none}',
    '#niv-drag-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:100001;padding:10px 18px;border-radius:999px;background:var(--niv-surface-2,#1e1e22);color:var(--niv-text,#f5f5f7);border:1px solid var(--niv-border,rgba(255,255,255,.28));font-family:Inter,system-ui,sans-serif;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.35);display:none}',
    '#niv-drag-toast.niv-drag-toast-error{border-color:var(--niv-red,#e5484d)}',
    '.niv-drag-np-overlay{position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}',
    '.niv-drag-np-modal{background:var(--niv-surface,#fff);color:var(--niv-text,#212529);border:1px solid var(--niv-border,#dee2e6);border-radius:14px;padding:20px;width:min(440px,92vw);font-family:Inter,system-ui,sans-serif}',
    '.niv-drag-np-modal .np-title{font-size:17px;font-weight:700;margin-bottom:12px}',
    '.niv-drag-np-modal label{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--niv-text-dim,#868e96);margin:12px 0 4px}',
    '.niv-drag-np-modal input{width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid var(--niv-border,#dee2e6);border-radius:6px;font-size:13px;font-family:inherit;background:var(--niv-surface-2,#f8f9fa);color:inherit}',
    '.niv-drag-np-modal .np-error{display:none;color:var(--niv-red,#e5484d);font-size:13px;margin-top:10px}',
    '.niv-drag-np-modal .np-actions{display:flex;gap:8px;margin-top:16px}',
    '.niv-drag-np-modal button{flex:1;padding:10px;border-radius:8px;border:1px solid var(--niv-border,#dee2e6);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;background:var(--niv-surface-2,#f1f3f5);color:inherit}',
    '.niv-drag-np-modal button.np-create{background:var(--niv-accent,#1971c2);color:#fff;border-color:transparent}'
  ].join('\n');
  var styleEl = document.createElement('style');
  styleEl.id = 'niv-drag-style';
  styleEl.textContent = css;
  (document.head || document.documentElement).appendChild(styleEl);

  /* ---------------- toast (non fatal status surface) ---------------- */
  var toastTimer = null;
  function toast(msg, isError) {
    var el = document.getElementById('niv-drag-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'niv-drag-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle('niv-drag-toast-error', !!isError);
    el.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.display = 'none'; }, 3400);
  }

  /* ---------------- data path (adapter) ---------------- */
  var adapter = { assign: null, createProject: null };
  function assignPayload(project) { return { project: project.name, projectId: project.id }; }
  function projectDocData(name, customer, uid, ts) {
    return { name: name, customer: customer || '', memberUids: [], createdAt: ts, createdBy: uid || '' };
  }
  function fsLib() { return import('https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js'); }
  function orgId() { return window._currentOrgId || window._orgId || null; }
  async function defaultAssign(measureId, project) {
    var db = window._db;
    var oid = orgId();
    if (!db || !oid) throw new Error('no-data-path');
    var fs = await fsLib();
    await fs.updateDoc(fs.doc(db, 'orgs', oid, 'jobs', measureId), assignPayload(project));
  }
  async function defaultCreateProject(data) {
    var db = window._db;
    var oid = orgId();
    if (!db || !oid) throw new Error('no-data-path');
    var fs = await fsLib();
    var uid = window._currentUser && window._currentUser.uid ? window._currentUser.uid : '';
    var ref = await fs.addDoc(fs.collection(db, 'orgs', oid, 'projects'),
      projectDocData(data.name, data.customer, uid, fs.serverTimestamp()));
    return { id: ref.id, name: data.name };
  }
  function doAssign(measureId, project) {
    return adapter.assign ? adapter.assign(measureId, project, assignPayload(project)) : defaultAssign(measureId, project);
  }
  function doCreateProject(data) {
    return adapter.createProject ? adapter.createProject(data) : defaultCreateProject(data);
  }

  /* ---------------- new project flow ----------------
     Preferred: the dashboard's own np modal (window.openNewProject +
     #np-name / #np-customer / window.saveNewProject), with the save
     and close functions wrapped for this one drop so the created
     project id can be learned and the assignment chained. The wrapper
     creates through the same fields as saveNewProject, closes the
     modal like it does and reloads the panel list (loadProjects).
     Fallback (module host pages, fixtures): a mirror modal collecting
     the same two fields, then doCreateProject. Either way, cancelling
     resolves null and nothing is written. */
  function createViaDashboardModal() {
    return new Promise(function (resolve) {
      var overlay = document.getElementById('np-modal-overlay');
      var nameEl = document.getElementById('np-name');
      var custEl = document.getElementById('np-customer');
      var errEl = document.getElementById('np-error');
      var origSave = window.saveNewProject;
      var origClose = window.closeNewProject;
      var settled = false;
      function cleanup() {
        if (window.saveNewProject === wrappedSave) window.saveNewProject = origSave;
        if (window.closeNewProject === wrappedClose) window.closeNewProject = origClose;
      }
      function settle(v) { if (!settled) { settled = true; cleanup(); resolve(v); } }
      async function wrappedSave() {
        var name = (nameEl.value || '').trim();
        var customer = (custEl.value || '').trim();
        if (!name) { if (typeof origSave === 'function') return origSave(); return; }
        try {
          var proj = await doCreateProject({ name: name, customer: customer });
          overlay.classList.remove('open');
          if (typeof window.loadProjects === 'function') { try { await window.loadProjects(); } catch (e) {} }
          settle(proj);
        } catch (e) {
          if (errEl) { errEl.textContent = L('createError') + ': ' + (e && e.message ? e.message : 'error'); errEl.style.display = 'block'; }
        }
      }
      function wrappedClose(e) {
        var wasOpen = overlay.classList.contains('open');
        if (typeof origClose === 'function') origClose(e);
        if (wasOpen && !overlay.classList.contains('open')) settle(null);
      }
      window.saveNewProject = wrappedSave;
      window.closeNewProject = wrappedClose;
      window.openNewProject();
    });
  }
  function createViaMirrorModal() {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'niv-drag-np-overlay';
      overlay.innerHTML =
        '<div class="niv-drag-np-modal" role="dialog" aria-modal="true">' +
        '<div class="np-title">' + esc(L('newProject')) + '</div>' +
        '<label for="niv-drag-np-name">' + esc(L('nameLabel')) + '</label>' +
        '<input id="niv-drag-np-name" maxlength="120" autocomplete="off" />' +
        '<label for="niv-drag-np-customer">' + esc(L('customerLabel')) + '</label>' +
        '<input id="niv-drag-np-customer" maxlength="120" autocomplete="off" />' +
        '<div class="np-error" id="niv-drag-np-error"></div>' +
        '<div class="np-actions"><button type="button" class="np-create" id="niv-drag-np-create">' + esc(L('create')) + '</button>' +
        '<button type="button" id="niv-drag-np-cancel">' + esc(L('cancel')) + '</button></div></div>';
      document.body.appendChild(overlay);
      var nameEl = overlay.querySelector('#niv-drag-np-name');
      var custEl = overlay.querySelector('#niv-drag-np-customer');
      var errEl = overlay.querySelector('#niv-drag-np-error');
      var settled = false;
      function settle(v) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey, true);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); settle(null); } }
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('pointerdown', function (e) { if (e.target === overlay) settle(null); });
      overlay.querySelector('#niv-drag-np-cancel').addEventListener('click', function () { settle(null); });
      overlay.querySelector('#niv-drag-np-create').addEventListener('click', async function () {
        var name = (nameEl.value || '').trim();
        var customer = (custEl.value || '').trim();
        if (!name) { errEl.textContent = L('nameRequired'); errEl.style.display = 'block'; return; }
        try {
          var proj = await doCreateProject({ name: name, customer: customer });
          settle(proj);
        } catch (e) {
          errEl.textContent = L('createError') + ': ' + (e && e.message ? e.message : 'error');
          errEl.style.display = 'block';
        }
      });
      setTimeout(function () { nameEl.focus(); }, 60);
    });
  }
  function createProjectFlow() {
    if (!adapter.createProject && typeof window.openNewProject === 'function' &&
        document.getElementById('np-modal-overlay') && document.getElementById('np-name')) {
      return createViaDashboardModal();
    }
    return createViaMirrorModal();
  }

  /* ---------------- module (iframe) plumbing ---------------- */
  function sidebarIframes() {
    return Array.prototype.slice.call(document.querySelectorAll('iframe')).filter(function (f) {
      var src = f.getAttribute('src') || '';
      return src.indexOf('sidebar') !== -1 || f.classList.contains('niv-sidebar-frame');
    });
  }
  function allIframes() { return Array.prototype.slice.call(document.querySelectorAll('iframe')); }
  function postTo(iframe, msg) {
    try { if (iframe.contentWindow) iframe.contentWindow.postMessage(Object.assign({ niv: 1 }, msg), window.location.origin); } catch (e) {}
  }
  function broadcast(msg) {
    sidebarIframes().forEach(function (f) { postTo(f, msg); });
    // A harness may embed the module without the shell bridge classes:
    // fall back to every iframe when none is recognised as a sidebar.
    if (!sidebarIframes().length) allIframes().forEach(function (f) { postTo(f, msg); });
  }
  function targets() {
    var s = sidebarIframes();
    return s.length ? s : allIframes();
  }

  /* ---------------- zones ---------------- */
  function parseOnclickId(el, fnName) {
    var oc = el.getAttribute('onclick') || '';
    var m = oc.match(new RegExp(fnName + "\\('([^']+)'\\)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function ensureNativeNewZone() {
    var existing = document.getElementById('niv-drag-new-native');
    if (existing) return existing;
    var body = document.getElementById('niv-snav-projects-body');
    var list = document.getElementById('niv-panel-projects');
    if (!body || !list) return null;
    var z = document.createElement('div');
    z.id = 'niv-drag-new-native';
    z.className = 'niv-drag-new-native';
    z.setAttribute('data-niv-new-zone', '1');
    z.textContent = '+ ' + L('newProject');
    body.appendChild(z);
    return z;
  }
  function clipRect(r, clip) {
    if (!clip) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    var left = Math.max(r.left, clip.left), top = Math.max(r.top, clip.top);
    var right = Math.min(r.right, clip.right), bottom = Math.min(r.bottom, clip.bottom);
    if (right <= left || bottom <= top) return null;
    return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
  }
  function nativeZones() {
    var zones = [];
    var list = document.getElementById('niv-panel-projects');
    var bodyEl = document.getElementById('niv-panel-body');
    var clip = bodyEl ? bodyEl.getBoundingClientRect() : null;
    if (list) {
      list.querySelectorAll('.niv-panel-item').forEach(function (el) {
        var id = parseOnclickId(el, 'openProject');
        if (!id) return;
        /* Rows scrolled out of the panel body are visually clipped by
           it; their raw rects must not hit test outside the region. */
        var rect = clipRect(el.getBoundingClientRect(), clip);
        if (!rect) return;
        var span = el.querySelector('span');
        zones.push({ kind: 'native', id: id, name: span ? span.textContent.trim() : el.textContent.trim(), el: el, rect: rect });
      });
    }
    var nz = ensureNativeNewZone();
    if (nz && document.body.classList.contains('niv-drag-on')) {
      zones.push({ kind: 'native', id: 'new', name: L('newProject'), el: nz, rect: nz.getBoundingClientRect() });
    }
    return zones;
  }
  function nativeScrollRegion() {
    var el = document.getElementById('niv-panel-body');
    return el ? { kind: 'native', el: el, rect: el.getBoundingClientRect() } : null;
  }

  /* ---------------- drag state ---------------- */
  var state = null;
  /* state: { measureId, label, pointerId, startX, startY, dragging,
     sourceEl, moduleSource (iframe|null), shields: [], ghost,
     moduleZones: Map(iframe -> {zones, scrollRegion}), hover,
     raf, lastT } */
  var suppressNextClick = false;

  function makeGhost(label) {
    var g = document.createElement('div');
    g.className = 'niv-drag-ghost';
    g.id = 'niv-drag-ghost';
    g.textContent = label || '';
    g.style.display = 'none';
    document.body.appendChild(g);
    return g;
  }
  function raiseShields() {
    var shields = [];
    targets().forEach(function (f) {
      var r = f.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      var sh = document.createElement('div');
      sh.className = 'niv-drag-shield';
      sh.setAttribute('data-niv-shield-for', f.getAttribute('src') || '');
      sh.style.left = r.left + 'px';
      sh.style.top = r.top + 'px';
      sh.style.width = r.width + 'px';
      sh.style.height = r.height + 'px';
      document.body.appendChild(sh);
      shields.push(sh);
    });
    return shields;
  }
  function moveGhost(x, y) {
    if (!state || !state.ghost) return;
    state.ghost.style.display = 'block';
    state.ghost.style.left = (x + 14) + 'px';
    state.ghost.style.top = (y + 14) + 'px';
  }

  function moduleZoneList() {
    var out = [];
    if (!state) return out;
    state.moduleZones.forEach(function (data, iframe) {
      var fr = iframe.getBoundingClientRect();
      var frameRect = { left: fr.left, top: fr.top, right: fr.right, bottom: fr.bottom };
      var sr = data.scrollRegion;
      var srRect = sr ? { left: fr.left + sr.x, top: fr.top + sr.y, right: fr.left + sr.x + sr.width, bottom: fr.top + sr.y + sr.height } : null;
      (data.zones || []).forEach(function (z) {
        if (!z.rect) return;
        var raw = { left: fr.left + z.rect.x, top: fr.top + z.rect.y, right: fr.left + z.rect.x + z.rect.width, bottom: fr.top + z.rect.y + z.rect.height, width: z.rect.width, height: z.rect.height };
        /* Rows scrolled out of the module scroll region are clipped
           by it visually; hit test only where the zone is visible:
           inside the scroll region and inside the iframe. */
        var rect = clipRect(raw, srRect);
        if (rect) rect = clipRect(rect, frameRect);
        if (!rect) return;
        out.push({ kind: 'module', iframe: iframe, id: z.id, name: z.name || (z.id === 'new' ? L('newProject') : z.id), rect: rect });
      });
    });
    return out;
  }
  function hitTest(x, y) {
    var zones = nativeZones().concat(moduleZoneList());
    for (var i = 0; i < zones.length; i++) {
      var r = zones[i].rect;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return zones[i];
    }
    return null;
  }
  function sameHover(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.kind === b.kind && a.id === b.id && a.iframe === b.iframe;
  }
  function setHover(zone) {
    if (!state || sameHover(state.hover, zone)) return;
    var prev = state.hover;
    if (prev && prev.kind === 'native' && prev.el) prev.el.classList.remove('niv-drag-hover');
    if (prev && prev.kind === 'module' && prev.iframe) postTo(prev.iframe, { type: 'niv:draghover', zoneId: null });
    state.hover = zone;
    if (zone && zone.kind === 'native' && zone.el) zone.el.classList.add('niv-drag-hover');
    if (zone && zone.kind === 'module' && zone.iframe) postTo(zone.iframe, { type: 'niv:draghover', zoneId: zone.id });
  }

  /* Hot zone auto scroll: one rAF loop for the life of the drag. */
  function scrollRegions() {
    var regs = [];
    var nr = nativeScrollRegion();
    if (nr) regs.push(nr);
    if (state) {
      state.moduleZones.forEach(function (data, iframe) {
        if (!data.scrollRegion) return;
        var fr = iframe.getBoundingClientRect();
        var r = data.scrollRegion;
        regs.push({ kind: 'module', iframe: iframe, rect: { left: fr.left + r.x, top: fr.top + r.y, right: fr.left + r.x + r.width, bottom: fr.top + r.y + r.height } });
      });
    }
    return regs;
  }
  function scrollStep(now) {
    if (!state || !state.dragging) return;
    var dt = Math.min(64, now - (state.lastT || now)) / 1000;
    state.lastT = now;
    var x = state.lastX, y = state.lastY;
    if (typeof x === 'number' && typeof y === 'number' && dt > 0) {
      var regs = scrollRegions();
      for (var i = 0; i < regs.length; i++) {
        var r = regs[i].rect;
        if (x < r.left || x > r.right || y < r.top - HOT_BAND_PX || y > r.bottom + HOT_BAND_PX) continue;
        var dy = 0;
        if (y < r.top + HOT_BAND_PX && y >= r.top - HOT_BAND_PX) {
          var fTop = Math.max(0, Math.min(1, (r.top + HOT_BAND_PX - y) / HOT_BAND_PX));
          dy = -MAX_SCROLL_PX_S * (0.25 + 0.75 * fTop) * dt;
        } else if (y > r.bottom - HOT_BAND_PX && y <= r.bottom + HOT_BAND_PX) {
          var fBot = Math.max(0, Math.min(1, (y - (r.bottom - HOT_BAND_PX)) / HOT_BAND_PX));
          dy = MAX_SCROLL_PX_S * (0.25 + 0.75 * fBot) * dt;
        }
        if (dy !== 0) {
          if (regs[i].kind === 'native') regs[i].el.scrollTop += dy;
          else postTo(regs[i].iframe, { type: 'niv:dragscroll', dy: Math.round(dy * 100) / 100 });
        }
        break;
      }
    }
    state.raf = requestAnimationFrame(scrollStep);
  }

  function startDrag() {
    if (!state || state.dragging) return;
    state.dragging = true;
    document.body.classList.add('niv-drag-on');
    ensureNativeNewZone();
    var nz = document.getElementById('niv-drag-new-native');
    if (nz) nz.textContent = '+ ' + L('newProject');
    state.ghost = makeGhost(state.label);
    state.shields = raiseShields();
    broadcast({ type: 'niv:dragactive', on: true });
    broadcast({ type: 'niv:dropzones-request' });
    state.lastT = performance.now();
    state.raf = requestAnimationFrame(scrollStep);
  }
  function endDragVisuals() {
    if (!state) return;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = null;
    setHover(null);
    broadcast({ type: 'niv:dragactive', on: false });
    broadcast({ type: 'niv:draghover', zoneId: null });
    if (state.ghost && state.ghost.parentNode) state.ghost.parentNode.removeChild(state.ghost);
    (state.shields || []).forEach(function (sh) { if (sh.parentNode) sh.parentNode.removeChild(sh); });
    if (state.sourceEl) state.sourceEl.removeAttribute('data-niv-drag-src');
    document.body.classList.remove('niv-drag-on');
    document.querySelectorAll('.niv-drag-hover').forEach(function (el) { el.classList.remove('niv-drag-hover'); });
  }
  function cancelDrag() {
    if (!state) return;
    endDragVisuals();
    state = null;
  }
  async function finishDrop(zone) {
    var s = state;
    var measureId = s.measureId;
    endDragVisuals();
    state = null;
    suppressNextClick = true;
    try {
      if (zone.id === 'new') {
        var proj = await createProjectFlow();
        if (!proj) return; /* name step cancelled: whole drop cancels */
        await doAssign(measureId, proj);
      } else {
        await doAssign(measureId, { id: zone.id, name: zone.name });
      }
      toast(L('assigned'));
    } catch (e) {
      toast(L('assignError') + ': ' + (e && e.message ? e.message : 'error'), true);
    }
  }

  /* ---------------- source detection (host document) ---------------- */
  function measureFromElement(el) {
    var t = el;
    var panelItem = t.closest ? t.closest('#niv-panel-measures .niv-panel-item, #home-measures .niv-home-row, .niv-proj-measure') : null;
    if (panelItem) {
      var id = parseOnclickId(panelItem, 'openMeasure');
      if (id) return { measureId: id, label: panelItem.textContent.trim().replace(/\s+/g, ' '), el: panelItem };
    }
    var card = t.closest ? t.closest('.job-card') : null;
    if (card) {
      var mid = null;
      var oc = card.getAttribute('onclick') || '';
      var m = oc.match(/openJob\((\d+)\)/);
      if (m && Array.isArray(window._jobs) && window._jobs[Number(m[1])]) mid = window._jobs[Number(m[1])].id;
      if (!mid) {
        var list = card.parentNode;
        if (list) {
          var idx = Array.prototype.indexOf.call(list.querySelectorAll('.job-card'), card);
          if (idx >= 0 && Array.isArray(window._jobs) && window._jobs[idx]) mid = window._jobs[idx].id;
        }
      }
      if (mid) {
        var title = card.querySelector('.job-title');
        return { measureId: mid, label: (title ? title.textContent : card.textContent).trim().replace(/\s+/g, ' '), el: card };
      }
    }
    return null;
  }

  document.addEventListener('pointerdown', function (e) {
    if (state) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest && e.target.closest('a, button, input, select, textarea, .cust-link')) return;
    var found = measureFromElement(e.target);
    if (!found) return;
    state = {
      measureId: found.measureId, label: found.label, pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY,
      dragging: false, sourceEl: found.el, moduleSource: null,
      shields: [], ghost: null, moduleZones: new Map(), hover: null, raf: null, lastT: 0
    };
    found.el.setAttribute('data-niv-drag-src', '1');
  }, true);

  function dragMoveTo(x, y) {
    if (!state) return;
    state.lastX = x; state.lastY = y;
    if (!state.dragging) {
      var dx = x - state.startX, dy = y - state.startY;
      if (Math.hypot(dx, dy) < THRESHOLD_PX) return;
      startDrag();
    }
    moveGhost(x, y);
    setHover(hitTest(x, y));
  }
  function dragUpAt(x, y) {
    if (!state) return;
    if (!state.dragging) { cancelDrag(); return; }
    var zone = hitTest(x, y);
    suppressNextClick = true;
    if (zone) finishDrop(zone);
    else cancelDrag();
  }
  document.addEventListener('pointermove', function (e) {
    if (!state) return;
    if (state.moduleSource) return; /* module forwards its own moves */
    if (e.pointerId !== state.pointerId) return;
    if (state.dragging && e.cancelable) e.preventDefault();
    dragMoveTo(e.clientX, e.clientY);
  }, { capture: true, passive: false });

  function onPointerEnd(e) {
    if (!state || state.moduleSource) return;
    if (e.pointerId !== state.pointerId) return;
    dragUpAt(e.clientX, e.clientY);
  }
  document.addEventListener('pointerup', onPointerEnd, true);
  document.addEventListener('pointercancel', function (e) {
    if (state && !state.moduleSource && e.pointerId === state.pointerId) cancelDrag();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state) { cancelDrag(); }
  }, true);

  document.addEventListener('click', function (e) {
    /* Swallow exactly the synthetic click the browser fires for the
       pointerup that ended a drag, so a drop does not also open the
       dragged card or the zone underneath. Later clicks pass. */
    if (suppressNextClick) { suppressNextClick = false; e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ---------------- messages from the module ---------------- */
  window.addEventListener('message', function (ev) {
    if (ev.origin !== window.location.origin) return;
    var d = ev.data;
    if (!d || d.niv !== 1 || typeof d.type !== 'string') return;
    var iframe = null;
    targets().forEach(function (f) { if (f.contentWindow === ev.source) iframe = f; });
    if (!iframe) return;
    if (d.type === 'niv:dragstart') {
      if (state) return;
      if (!d.measureId) return;
      state = {
        measureId: String(d.measureId), label: String(d.label || ''), pointerId: -1,
        startX: 0, startY: 0, lastX: null, lastY: null,
        dragging: false, sourceEl: null, moduleSource: iframe,
        shields: [], ghost: null, moduleZones: new Map(), hover: null, raf: null, lastT: 0
      };
      startDrag();
      /* The gesture continues in the host: the module pointer has no
         pointerId the host can match, so the host tracks the next
         pointer sequence generically. Adopt the first host pointer
         that moves over a shield as this drag's pointer. */
      state.pointerId = -1;
    } else if (d.type === 'niv:dragmove') {
      if (state && state.moduleSource === iframe && typeof d.x === 'number' && typeof d.y === 'number') {
        var fr1 = iframe.getBoundingClientRect();
        dragMoveTo(fr1.left + d.x, fr1.top + d.y);
      }
    } else if (d.type === 'niv:dragup') {
      if (state && state.moduleSource === iframe && typeof d.x === 'number' && typeof d.y === 'number') {
        var fr2 = iframe.getBoundingClientRect();
        dragUpAt(fr2.left + d.x, fr2.top + d.y);
      }
    } else if (d.type === 'niv:dropzones') {
      if (state) state.moduleZones.set(iframe, { zones: d.zones || [], scrollRegion: d.scrollRegion || null });
    } else if (d.type === 'niv:dragcancel') {
      if (state) cancelDrag();
    }
  });

  window.NivDrag = {
    setAdapter: function (a) { if (a) { if (a.assign) adapter.assign = a.assign; if (a.createProject) adapter.createProject = a.createProject; } },
    _assignPayload: assignPayload,
    _projectDocData: projectDocData,
    _config: { hotBandPx: HOT_BAND_PX, maxScrollPxS: MAX_SCROLL_PX_S, thresholdPx: THRESHOLD_PX },
    _state: function () { return state; },
    _cancel: cancelDrag
  };
})();
