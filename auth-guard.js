// auth-guard.js — protects index.html, injects user context, saves jobs to Firestore
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { makePermChecker } from './permissions.js';

let currentUser = null;
let currentUserData = null;
let _can = () => false;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
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

  // show dashboard link if user has viewDashboard permission
  if (_can('viewDashboard')) {
    const header = document.getElementById('app-header');
    if (header) {
      const dashBtn = document.createElement('a');
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
  await signOut(auth);
  window.location.href = 'login.html';
};

// saveJob — called from adhd.js on share
window.saveJobToFirestore = async (jobData) => {
  if (!currentUser || !currentUserData) throw new Error('No autenticado');
  if (!_can('createMeasurements')) throw new Error('No tienes permiso para crear medidas');
  const orgId = currentUserData.orgId;
  await addDoc(collection(db, 'orgs', orgId, 'jobs'), {
    ...jobData,
    installerUid:  currentUser.uid,
    installerName: currentUserData.name || currentUser.email,
    installerRole: currentUserData.role,
    orgId,
    createdAt: serverTimestamp()
  });
  console.log('[Nivelato] Job saved to Firestore');
};
