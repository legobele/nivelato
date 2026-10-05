// ao3.js — window.ao3(): every image on the page becomes an AO3 iframe
// for 2 minutes, then everything is restored like nothing happened.
// AO3 sends X-Frame-Options: SAMEORIGIN, so what you actually get is
// 2 minutes of little boxes where AO3 said no. The bit is the bit.
// Bumps the odometer (stats/easter-eggs.ao3).
import { db } from './firebase-config.js';
import { doc, setDoc, increment } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

window.ao3 = function () {
  var imgs = Array.prototype.slice.call(document.images);
  if (!imgs.length) return 'no images to ruin.';
  var saved = [];
  imgs.forEach(function (img) {
    var r = img.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width));
    var h = Math.max(1, Math.round(r.height));
    var f = document.createElement('iframe');
    f.src = 'https://archiveofourown.org/';
    f.title = 'ao3';
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'width:' + w + 'px;height:' + h + 'px;border:1px solid #f2f1ec;';
    saved.push({ parent: img.parentNode, img: img, frame: f });
    img.parentNode.replaceChild(f, img);
  });
  setTimeout(function () {
    saved.forEach(function (s) {
      if (s.frame.parentNode === s.parent) s.parent.replaceChild(s.img, s.frame);
    });
  }, 120000);
  setDoc(doc(db, 'stats', 'easter-eggs'), { ao3: increment(1) }, { merge: true })
    .catch(function () {});
  return imgs.length + ' image(s) sent to ao3 for 2 minutes.';
};
