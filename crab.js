// crab.js — hold Ctrl+Alt and type "crab": crab-emoji rain.
// Changes nothing. Bumps a backend odometer (stats/easter-eggs.crab) so the
// crab-button press count is visible. Web-only easter egg. Load-bearing whimsy.
import { db } from './firebase-config.js';
import { doc, setDoc, increment } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

let buf = '';

function crabRain() {
  if (!document.getElementById('niv-crabfall-style')) {
    const st = document.createElement('style');
    st.id = 'niv-crabfall-style';
    const spin = Math.random() > 0.5 ? '360deg' : '-360deg';
    st.textContent = '@keyframes niv-crabfall{to{transform:translateY(112vh) rotate(' + spin + ')}}';
    document.head.appendChild(st);
  }
  const n = 36;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.textContent = '🦀';
    s.setAttribute('aria-hidden', 'true');
    const size = 18 + Math.random() * 26;
    s.style.cssText = 'position:fixed;top:-60px;left:' + (Math.random() * 100).toFixed(2) + 'vw;' +
      'font-size:' + size.toFixed(0) + 'px;z-index:2147483647;pointer-events:none;' +
      'animation:niv-crabfall ' + (1.6 + Math.random() * 1.4).toFixed(2) + 's ease-in ' +
      (Math.random() * 0.5).toFixed(2) + 's forwards;';
    document.documentElement.appendChild(s);
    setTimeout(() => s.remove(), 3600);
  }
  // odometer — fire and forget, never blocks the bit
  setDoc(doc(db, 'stats', 'easter-eggs'), { crab: increment(1) }, { merge: true })
    .catch(() => {});
}

document.addEventListener('keydown', (e) => {
  const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.isComposing) return;
  if (!(e.ctrlKey && e.altKey)) { buf = ''; return; }
  const k = (e.key || '').toLowerCase();
  if (k.length !== 1) return;
  buf = (buf + k).slice(-4);
  if (buf === 'crab') { buf = ''; crabRain(); }
});
