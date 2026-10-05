// presence.js — online-presence beacon (client-side ES module).
//
// INTEGRATION (2 lines):
//   import { startPresence } from './presence.js';
//   startPresence(user.uid);   // call once right after login
//
// (Optional) to list who's online in the org:
//   import { getOnlineUsers } from './presence.js';
//   const online = await getOnlineUsers(orgId); // [{ uid, name, role, isSelf }]
//
// The beacon lives at users/{uid}/presence/beacon = { lastSeen, route }.
// firestore.rules only allow writing those two fields, and only to your own
// beacon. The server-side pendingUpdateWatcher counts a user as online when
// their beacon's lastSeen is within the last 5 minutes.

import { db, auth } from './firebase-config.js';
import { doc, setDoc, getDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const BEACON_INTERVAL_MS = 2 * 60 * 1000; // ping every 2 minutes
const ONLINE_WINDOW_MS = 5 * 60 * 1000;    // lastSeen within 5 min = online

function currentRoute() {
  if (typeof window !== 'undefined' && window.NIVELATO_ROUTE) {
    return String(window.NIVELATO_ROUTE);
  }
  if (typeof location !== 'undefined') return location.pathname;
  return '';
}

// Writes the beacon immediately, then every 2 min, plus once on pagehide.
// Returns a stop() function for cleanup (e.g. on logout).
export function startPresence(uid) {
  if (!uid) return () => {};
  let timer = null;
  const ping = () => {
    try {
      setDoc(doc(db, 'users', uid, 'presence', 'beacon'), {
        lastSeen: serverTimestamp(),
        route: currentRoute(),
      }, { merge: true }).catch(() => {});
    } catch (e) {
      // offline or not ready — the next interval retries
    }
  };
  ping();
  timer = setInterval(ping, BEACON_INTERVAL_MS);
  const onHide = () => ping();
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onHide);
  return () => {
    if (timer) clearInterval(timer);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onHide);
  };
}

// Lists org members whose beacon is fresh (lastSeen within 5 min).
// Missing beacon docs are treated as offline — handled gracefully.
export async function getOnlineUsers(orgId) {
  const out = [];
  if (!orgId) return out;
  const selfUid = auth && auth.currentUser ? auth.currentUser.uid : null;
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  const qs = await getDocs(query(collection(db, 'users'), where('orgId', '==', orgId)));
  for (const u of qs.docs) {
    let online = false;
    try {
      const bSnap = await getDoc(doc(db, 'users', u.id, 'presence', 'beacon'));
      const ts = bSnap.exists ? bSnap.data().lastSeen : null;
      const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
      online = ms >= cutoff;
    } catch (e) {
      // beacon missing or not readable — treat as offline
    }
    if (!online) continue;
    const d = u.data();
    out.push({
      uid: u.id,
      name: d.name || d.email || 'Sin nombre',
      role: d.role || 'medidor',
      isSelf: u.id === selfUid,
    });
  }
  return out;
}
