// irs.js — window.irs(): puts you on hold for a random amount of time.
// window.unirs(): unholds you, at the cost of signing in again.
// Inspired by a real 39-minute hold. The trauma is load-bearing.
// Bumps the odometer (stats/easter-eggs.irs).
import { db, auth } from './firebase-config.js';
import { doc, setDoc, increment } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js';

var holdTimer = null, tickInt = null, holdOv = null;

var HOLD_MSGS = [
  'Your call is important to us.',
  'Please continue to hold.',
  'The average hold time is 39 minutes.',
  'Have you tried turning it off and on again?',
  '\u266A \u266A \u266A'
];

function fmt(s) {
  var m = Math.floor(s / 60), ss = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
}

function endHold(completed) {
  if (tickInt) clearInterval(tickInt);
  if (holdTimer) clearTimeout(holdTimer);
  tickInt = holdTimer = null;
  if (!holdOv) return;
  var ov = holdOv;
  holdOv = null;
  if (completed) {
    ov.innerHTML = '<div style="font-size:18px;font-style:italic;padding:0 32px;text-align:center;">' +
      'Thank you for your patience.<br>Your call has been disconnected.</div>';
    setTimeout(function () { ov.remove(); }, 3000);
  } else {
    ov.remove();
  }
}

window.irs = function () {
  if (holdOv) return 'already on hold. obviously.';
  var waitMs = 30000 + Math.floor(Math.random() * 150000); // 30s–180s. you don't get to know.
  holdOv = document.createElement('div');
  holdOv.id = 'niv-irs';
  holdOv.setAttribute('aria-hidden', 'true');
  holdOv.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#3a3a3c;color:#fff;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';
  holdOv.innerHTML =
    '<div id="niv-irs-timer" style="font-size:15px;color:#a7a7b3;">00:00</div>' +
    '<div style="font-size:34px;font-weight:600;margin:8px 0 24px;">1 (800) 829-1040</div>' +
    '<div style="border:1px solid #636366;border-radius:20px;padding:10px 20px;font-size:14px;">' +
    '\u266A \u266A \u266A \u266A \u266A</div>' +
    '<div id="niv-irs-msg" style="margin-top:24px;font-size:13px;color:#a7a7b3;font-style:italic;"></div>' +
    '<div style="margin-top:8px;font-size:11px;color:#8e8e93;">run window.unirs() to hang up (at a cost)</div>';
  document.documentElement.appendChild(holdOv);
  var start = Date.now(), msgI = 0, lastMsgSec = -1;
  var tick = function () {
    var elapsed = Math.floor((Date.now() - start) / 1000);
    var tEl = document.getElementById('niv-irs-timer');
    if (tEl) tEl.textContent = fmt(elapsed);
    var mEl = document.getElementById('niv-irs-msg');
    if (mEl && elapsed % 20 === 0 && elapsed !== lastMsgSec) {
      lastMsgSec = elapsed;
      mEl.textContent = HOLD_MSGS[msgI++ % HOLD_MSGS.length];
    }
  };
  tickInt = setInterval(tick, 1000);
  tick();
  holdTimer = setTimeout(function () { endHold(true); }, waitMs);
  setDoc(doc(db, 'stats', 'easter-eggs'), { irs: increment(1) }, { merge: true })
    .catch(function () {});
  return 'you are now on hold. good luck.';
};

window.unirs = function () {
  if (!holdOv) return "you're not on hold.";
  endHold(false);
  signOut(auth).catch(function () {});
  return 'unheld. you have been signed out. sign in again, peasant.';
};
