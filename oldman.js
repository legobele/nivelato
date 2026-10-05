// oldman.js — window.oldManYellsAtCloud(): the simpsons meme, fullscreen,
// for 10 seconds. Bumps the odometer (stats/easter-eggs.oldManYellsAtCloud).
// No further questions. The cloud has been warned.
// (Image loads from raw.githubusercontent — the Pages deploy pipeline is
// stalled, so repo-relative would serve a stale copy. Same trick as login.html.)
import { db } from './firebase-config.js';
import { doc, setDoc, increment } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

var OLD_MAN_URL = 'https://raw.githubusercontent.com/legobele/nivelato/main/old-man-yells-at-cloud.jpg';

window.oldManYellsAtCloud = function () {
  if (document.getElementById('niv-oldman')) return 'already yelling.';
  var ov = document.createElement('div');
  ov.id = 'niv-oldman';
  ov.setAttribute('aria-hidden', 'true');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;' +
    'display:flex;align-items:center;justify-content:center;cursor:pointer;';
  var img = document.createElement('img');
  img.src = OLD_MAN_URL;
  img.alt = 'old man yells at cloud';
  img.style.cssText = 'max-width:100vw;max-height:100vh;object-fit:contain;';
  ov.appendChild(img);
  // Click to dismiss early. The old man respects consent.
  ov.addEventListener('click', function () { ov.remove(); });
  document.documentElement.appendChild(ov);
  setTimeout(function () { ov.remove(); }, 10000);
  // odometer — fire and forget, never blocks the bit
  setDoc(doc(db, 'stats', 'easter-eggs'), { oldManYellsAtCloud: increment(1) }, { merge: true })
    .catch(function () {});
  return 'the cloud has been yelled at.';
};
