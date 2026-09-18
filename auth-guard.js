// auth-guard.js — protects index.html, injects user context, saves jobs to Firestore
import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";
import { makePermChecker } from './permissions.js';

let currentUser = null;
let currentUserData = null;
let _can = () => false;
// UID seen on the last auth callback — used to detect silent identity switches.
let _prevUid = null;

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
});

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

// saveJob — called from adhd.js on share
window.saveJobToFirestore = async (jobData) => {
  if (!currentUser || !currentUserData) throw new Error('No autenticado');
  if (!_can('createMeasurements')) throw new Error('No tienes permiso para crear medidas');
  const orgId = currentUserData.orgId;

  // If an annotated photo was attached, upload it to Storage first.
  // Falls back to embedding the data URL directly if upload fails (e.g. rules not deployed yet).
  let annotatedPhoto = jobData.annotatedPhoto || null;
  if (annotatedPhoto && annotatedPhoto.startsWith('data:image')) {
    try {
      const jobRefDoc = doc(collection(db, 'orgs', orgId, 'jobs'));
      const photoPath = `annotated/${orgId}/${jobRefDoc.id}.jpg`;
      await uploadString(ref(storage, photoPath), annotatedPhoto, 'data_url');
      annotatedPhoto = await getDownloadURL(ref(storage, photoPath));
    } catch (e) {
      console.warn('[Nivelato] Storage upload failed, embedding data URL:', e.message);
      annotatedPhoto = jobData.annotatedPhoto; // keep data URL
    }
  }

  await addDoc(collection(db, 'orgs', orgId, 'jobs'), {
    ...jobData,
    annotatedPhoto,
    installerUid:  currentUser.uid,
    installerName: currentUserData.name || currentUser.email,
    installerRole: currentUserData.role,
    orgId,
    createdAt: serverTimestamp()
  });
  console.log('[Nivelato] Job saved to Firestore');
};
