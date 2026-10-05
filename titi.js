// titi.js — hover over anything for 5 seconds and the console turns into
// your puerto rican titi asking about your love life. you were warned.
// Desktop only (touchscreens don't hover, titis don't care).
(function () {
  var lastX = -1, lastY = -1, stillSince = Date.now(), cooldownUntil = 0;
  var DWELL_MS = 5000, COOLDOWN_MS = 180000; // 5s stare, then 3min of peace
  function say(m) {
    console.log('%c' + m, 'color:#ffb3d9;font-style:italic;font-size:12px;');
  }
  function titi() {
    var lines = [
      "mira, llevas un rato peg\u00e1 ah\u00ed mirando eso.",
      "\u00bfy el novio pa' cu\u00e1ndo, ah?",
      "\u00bfo es novia? que aqu\u00ed no se juzga, dime la verdad.",
      "tu prima ya va por el segundo muchacho y t\u00fa... mirando una pantalla."
    ];
    var t = 0;
    lines.forEach(function (l) {
      t += 1400 + Math.random() * 1200;
      setTimeout(function () { say(l); }, t);
    });
  }
  document.addEventListener('pointermove', function (e) {
    if (Math.hypot(e.clientX - lastX, e.clientY - lastY) > 12) {
      lastX = e.clientX; lastY = e.clientY;
      stillSince = Date.now();
    }
  });
  setInterval(function () {
    var now = Date.now();
    if (lastX < 0) return;
    if (now - stillSince > DWELL_MS && now > cooldownUntil) {
      cooldownUntil = now + COOLDOWN_MS;
      stillSince = now;
      titi();
    }
  }, 1000);
})();
