// gay.js — hold Ctrl+Alt and type "gay": full-screen gay-flag flashbang.
// Changes nothing. Bumps a backend odometer (stats/easter-eggs.gay) so the
// gay-button press count is visible. Web-only easter egg. Pure vibes.
import { db } from './firebase-config.js';
import { doc, setDoc, increment } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

const FLAG = ['#E40303', '#FF8C00', '#FFED00', '#008026', '#24408E', '#732982'];
let buf = '';

function flashbang() {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;' +
    'display:flex;flex-direction:column;animation:niv-gayflash .85s ease-out forwards;';
  for (const c of FLAG) {
    const s = document.createElement('div');
    s.style.cssText = 'flex:1;background:' + c + ';';
    el.appendChild(s);
  }
  if (!document.getElementById('niv-gayflash-style')) {
    const st = document.createElement('style');
    st.id = 'niv-gayflash-style';
    st.textContent = '@keyframes niv-gayflash{' +
      '0%{opacity:0;filter:brightness(4)}' +
      '12%{opacity:1;filter:brightness(2.2)}' +
      '35%{filter:brightness(1)}' +
      '80%{opacity:1}100%{opacity:0}}';
    document.head.appendChild(st);
  }
  document.documentElement.appendChild(el);
  setTimeout(() => el.remove(), 900);
  // odometer — fire and forget, never blocks the bit
  setDoc(doc(db, 'stats', 'easter-eggs'), { gay: increment(1) }, { merge: true })
    .catch(() => {});
}

document.addEventListener('keydown', (e) => {
  const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.isComposing) return;
  if (!(e.ctrlKey && e.altKey)) { buf = ''; return; }
  const k = e.key && e.key.toLowerCase();
  if (!k || k.length !== 1) { buf = ''; return; }
  buf = (buf + k).slice(-3);
  if (buf === 'gay') { buf = ''; flashbang(); }
});
