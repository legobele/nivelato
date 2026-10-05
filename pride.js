// pride.js — every june, the page counts your visits and reminds you it's
// illegal to not be gay. Run window.gayGayGay() in the console to comply.
// (The crab enforces this with love.)
(function () {
  var now = new Date();
  var year = now.getFullYear();
  var KEY_N = 'nl_pride_visits', KEY_Y = 'nl_pride_year', KEY_C = 'nl_pride_compliant';
  window.gayGayGay = function () {
    try {
      localStorage.setItem(KEY_C, String(year));
    } catch (_) { /* compliance is a state of mind */ }
    console.log('%c compliance certified. the crab is proud of you. ',
      'background:linear-gradient(90deg,#E40303,#FF8C00,#FFED00,#008026,#24408E,#732982);' +
      'color:#fff;font-weight:bold;padding:4px 10px;border-radius:6px;');
    return '\u{1F3F3}\uFE0F\u200D\u{1F308}\u{1F980}';
  };
  if (now.getMonth() !== 5) return; // not june. the law is asleep.
  var visits = 1;
  try {
    if (localStorage.getItem(KEY_Y) !== String(year)) {
      localStorage.setItem(KEY_Y, String(year));
      localStorage.setItem(KEY_N, '0');
    }
    visits = parseInt(localStorage.getItem(KEY_N) || '0', 10) + 1;
    localStorage.setItem(KEY_N, String(visits));
  } catch (_) { /* private mode gets one (1) visit */ }
  var compliant = false;
  try { compliant = localStorage.getItem(KEY_C) === String(year); } catch (_) {}
  if (compliant) return;
  console.log('%c june visit #' + visits + ". reminder: it's illegal to not be gay. ",
    'background:#732982;color:#fff;font-weight:bold;padding:4px 10px;border-radius:6px;');
  console.log('%c run window.gayGayGay() to certify compliance. ',
    'color:#FF8C00;font-style:italic;');
})();
