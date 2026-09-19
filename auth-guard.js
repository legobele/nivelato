// auth-guard.js — protects index.html, injects user context, saves jobs to Firestore
import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, setDoc, updateDoc, deleteDoc, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";
import { makePermChecker } from './permissions.js';
import { ensureFlowClaims, routeAfterGate } from './geo.js';

let currentUser = null;
let currentUserData = null;
let _can = () => false;
// UID seen on the last auth callback — used to detect silent identity switches.
let _prevUid = null;
// flowGate runs once per page-load for returning sessions (login.html already
// gates fresh logins). Guarded + non-breaking: if functions aren't deployed
// yet, ensureFlowClaims resolves { ok:false } and we continue as before.
let _flowGateDone = false;

// Loud, XSS-safe banner shown when the ambient Firebase identity changes
// mid-session (shared device / another tab signed in or out). Records must
// never be silently stamped with the wrong user.
function showIdentityChangedBanner(email) {
  if (document.getElementById('nivelato-identity-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'nivelato-identity-banner';
  banner.setAttribute('role', 'alert');
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
    'background:#c92a2a', 'color:#fff', 'padding:12px 16px',
    'font:600 14px/1.45 Inter,system-ui,-apple-system,sans-serif',
    'text-align:center', 'box-shadow:0 2px 14px rgba(0,0,0,0.3)'
  ].join(';');
  const msg = document.createElement('span');
  msg.textContent = '\u26a0\ufe0f La sesi\u00f3n cambi\u00f3 a ' + (email || 'otra cuenta') + '. Recarga si no fuiste t\u00fa.';
  const btn = document.createElement('button');
  btn.textContent = 'Recargar';
  btn.style.cssText = 'margin-left:12px;background:#fff;color:#c92a2a;border:none;border-radius:6px;padding:6px 14px;font:700 13px Inter,system-ui,sans-serif;cursor:pointer;';
  btn.addEventListener('click', () => window.location.reload());
  banner.appendChild(msg);
  banner.appendChild(btn);
  document.body.appendChild(banner);
}

// Best-effort purge of leftover Firebase Auth persistence keys, so a logout
// can never leave a session behind even if signOut() itself fails.
function purgeAuthRemnants() {
  for (const storeName of ['localStorage', 'sessionStorage']) {
    try {
      const store = window[storeName];
      const doomed = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.indexOf('firebase:authUser') === 0) doomed.push(k);
      }
      doomed.forEach((k) => store.removeItem(k));
    } catch (_) { /* storage unavailable — nothing to purge */ }
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  // Never silently continue on an identity switch: warn loudly instead.
  if (_prevUid && _prevUid !== user.uid) {
    showIdentityChangedBanner(user.email);
  }
  _prevUid = user.uid;
  currentUser = user;
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  currentUserData = userDoc.data();

  // make permission checker available globally
  _can = makePermChecker(currentUserData);
  window._can = _can;
  window._currentUser = currentUser;
  window._currentUserData = currentUserData;

  // Geo-flow gate for returning sessions: mint/refresh claims, route
  // block/review verdicts to the PR-only blocked screens. Runs once.
  if (!_flowGateDone) {
    _flowGateDone = true;
    ensureFlowClaims().then((gate) => {
      if (gate.ok && !gate.cached && routeAfterGate(gate.verdict, gate.reason)) return;
    });
  }

  // inject user info into header
  const logo = document.getElementById('app-logo');
  if (logo) logo.textContent = 'Nivelato';

  // show dashboard link if user has viewDashboard permission.
  // Dedupe: this callback can re-fire, and blindly appending piles up links.
  if (_can('viewDashboard')) {
    const header = document.getElementById('app-header');
    if (header && !header.querySelector('#nivelato-dashboard-link, a[href="dashboard.html"]')) {
      const dashBtn = document.createElement('a');
      dashBtn.id = 'nivelato-dashboard-link';
      dashBtn.href = 'dashboard.html';
      dashBtn.style.cssText = 'font-size:12px;color:#1971c2;text-decoration:none;font-weight:600;margin-right:4px;';
      dashBtn.textContent = 'Dashboard';
      header.insertBefore(dashBtn, header.lastChild);
    }
  }

  // account selector (replaces old bare "Salir" pill — single sign-out now)
  if (typeof window.initAccountSelector === 'function') {
    window.initAccountSelector({ user, userData: currentUserData });
  }

  // Releer el doc del usuario cada 5 min: si un admin desactiva la cuenta
  // mid-session, mostrar la pantalla de pendiente en vez de errores raros.
  if (window._userRefreshTimer) clearInterval(window._userRefreshTimer);
  window._userRefreshTimer = setInterval(async () => {
    try {
      const s = await getDoc(doc(db, 'users', user.uid));
      if (!s.exists()) return;
      const d = s.data();
      if (d.disabled === true) {
        clearInterval(window._userRefreshTimer);
        showPendingScreen();
      } else {
        // refrescar permisos en caliente por si el rol cambió
        currentUserData = d;
        _can = makePermChecker(currentUserData);
        window._can = _can;
        window._currentUserData = currentUserData;
      }
    } catch (_) { /* sin conexión — reintentar en el próximo ciclo */ }
  }, 5 * 60 * 1000);
});
window.addEventListener('pagehide', () => { if (window._userRefreshTimer) clearInterval(window._userRefreshTimer); });

window._doLogout = async () => {
  // Sign out BEFORE navigating. The timeout race guarantees a hanging
  // signOut() can never wedge the logout flow; remnants are purged anyway.
  try {
    await Promise.race([
      signOut(auth),
      new Promise((_, reject) => setTimeout(() => reject(new Error('signOut timeout')), 4000)),
    ]);
  } catch (_) { /* fall through to purge + navigate */ }
  purgeAuthRemnants();
  window.location.href = 'login.html';
};

// data URL → Blob: evita el ~33% de sobrecarga base64 de uploadString en
// fotos anotadas de varios MB (subidas más rápidas, menos superficie para
// que el sweep de drafts coma un share en curso).
function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mime = (header.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Pantalla de "cuenta pendiente": si un admin desactiva la cuenta
// mid-session, esto reemplaza a los confusos errores de permiso.
function showPendingScreen() {
  if (document.getElementById('nivelato-pending-screen')) return;
  window._pendingSignOut = () => window._doLogout();
  document.body.innerHTML = '<div id="nivelato-pending-screen" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;font-family:Inter,sans-serif;gap:16px;padding:32px;text-align:center"><div style="font-size:48px">⏳</div><h2 style="color:#212529">Cuenta pendiente de aprobación</h2><p style="color:#868e96;max-width:320px">Tu cuenta está siendo revisada. El administrador del taller te dará acceso en breve.</p><button onclick="window._pendingSignOut()" style="padding:12px 28px;background:#1971c2;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">Cerrar sesión</button></div>';
}

// saveJob — called from adhd.js on share
//
// Ordering: the temp (draft) job doc is created FIRST, then the photo is
// uploaded to Storage under the job's real id, then the job is finalized.
// A 5s heartbeat keeps the draft alive while this tab lives; if the tab
// dies mid-flow the heartbeat stops and the next dashboard load sweeps the
// stale draft (doc + photo) — so a photo can never exist without its job.
// The draft carries finalizing:true from birth: the sweep respects it, so
// a slow upload on a bad connection (heartbeat throttled in a background
// tab) can't be mistaken for a dead tab.
window.saveJobToFirestore = async (jobData) => {
  if (!currentUser || !currentUserData) throw new Error('No autenticado');
  if (!_can('createMeasurements')) throw new Error('No tienes permiso para crear medidas');
  const orgId = currentUserData.orgId;
  const jobsCol = collection(db, 'orgs', orgId, 'jobs');

  // 1. temp job first (finalizing:true desde el nacimiento — ver sweep)
  const jobRef = await addDoc(jobsCol, {
    ...jobData,
    annotatedPhoto: null,
    status: 'draft',
    finalizing: true,
    draftHeartbeat: serverTimestamp(),
    installerUid:  currentUser.uid,
    installerName: currentUserData.name || currentUser.email,
    installerRole: currentUserData.role,
    orgId,
    createdAt: serverTimestamp()
  });
  const photoPath = `annotated/${orgId}/${jobRef.id}.jpg`;

  // 2. phone home every 5s while this tab is alive
  const heartbeat = setInterval(() => {
    updateDoc(jobRef, { draftHeartbeat: serverTimestamp() }).catch(() => {});
  }, 5000);

  try {
    let annotatedPhoto = jobData.annotatedPhoto || null;
    if (annotatedPhoto && annotatedPhoto.startsWith('data:image')) {
      const blob = dataUrlToBlob(annotatedPhoto);
      await uploadBytes(ref(storage, photoPath), blob, { contentType: blob.type || 'image/jpeg' });
      annotatedPhoto = await getDownloadURL(ref(storage, photoPath));
    }
    // 3. finalize — no longer a draft
    await updateDoc(jobRef, {
      ...(annotatedPhoto ? { annotatedPhoto } : {}),
      status: 'complete',
      draftHeartbeat: deleteField(),
      finalizing: deleteField(),
    });
  } catch (e) {
    // flow died: remove the temp job + any partial upload, no orphans
    try { await deleteDoc(jobRef); } catch (_) {}
    try { await deleteObject(ref(storage, photoPath)); } catch (_) {}
    throw e;
  } finally {
    clearInterval(heartbeat);
  }
  console.log('[Nivelato] Job saved to Firestore');
};

// Sweep stale drafts left behind by tabs that died mid-share.
// - Umbral de 10 min sin heartbeat (30s era demasiado agresivo: una subida
//   de varios MB con mala señal supera los 30s fácil, y el móvil congela
//   el setInterval del heartbeat en pestañas en segundo plano).
// - finalizing == true: la subida sigue en curso aunque el heartbeat esté
//   congelado — se respeta con una gracia extra de 30 min; pasado eso se
//   barre igual (era una pestaña muerta, no una subida lenta).
// - Filtrado por installerUid en el servidor, no en el cliente.
// Runs on dashboard init; scoped to my own drafts.
const SWEEP_STALE_MS = 10 * 60 * 1000;
const SWEEP_FINALIZING_GRACE_MS = 30 * 60 * 1000;
window.sweepStaleDrafts = async (db, orgId, uid) => {
  try {
    const { query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
    const snap = await getDocs(query(
      collection(db, 'orgs', orgId, 'jobs'),
      where('status', '==', 'draft'),
      where('installerUid', '==', uid)
    ));
    const now = Date.now();
    for (const d of snap.docs) {
      const j = d.data();
      const hb = j.draftHeartbeat && j.draftHeartbeat.toDate ? j.draftHeartbeat.toDate().getTime() : 0;
      const grace = j.finalizing === true ? SWEEP_FINALIZING_GRACE_MS : SWEEP_STALE_MS;
      if (now - hb < grace) continue; // vivo, o subida en curso — no tocar
      try { await deleteDoc(d.ref); } catch (_) {}
      try { await deleteObject(ref(storage, `annotated/${orgId}/${d.id}.jpg`)); } catch (_) {}
      console.log('[Nivelato] swept stale draft', d.id);
    }
  } catch (e) {
    console.warn('[Nivelato] draft sweep failed:', e.message);
  }
};
