// audit.js — the console cannot see your other tabs. chrome said no.
// This has never stopped it from having questions about the .gov one.
// Strikes once per page load, at a random moment, with escalating suspicion.
(function () {
  var done = false;
  function say(msg) {
    console.log('%c' + msg, 'color:#ff8cc6;font-style:italic;font-size:12px;');
  }
  function interrogate() {
    if (done) return;
    done = true;
    var lines = [
      "psst.",
      "the .gov tab. we need to talk about the .gov tab.",
      "full disclosure: we can't actually see your other tabs. chrome said no.",
      "which is honestly more suspicious. what are you hiding.",
      "blink twice if the IRS got you."
    ];
    var t = 0;
    lines.forEach(function (line) {
      t += 1200 + Math.random() * 1800;
      setTimeout(function () { say(line); }, t);
    });
  }
  // Random moment between 30s and 75s after load. Once. No warnings.
  setTimeout(interrogate, 30000 + Math.random() * 45000);
})();
