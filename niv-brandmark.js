// niv-brandmark.js — brand watermark overlay for app surfaces.
//
// Giulia's spec (Oct 17, 2026): free-tier accounts on web get the
// Nivelato Labs logo as a tiled watermark across the app content
// area, to deter casual screenshotting and brand any leaked shot.
// The tile is the FULL lockup — Breakout mark + "Nivelato Labs"
// wordmark — with a "DO NOT SHARE" notice line under the lockup
// inside each tile.
//
// Dark-background treatment (Oct 17, 2026, Giulia: "Its not
// readable on dark BGs"): the first tile filled the wordmark with
// the raw brand gradient — whose tail is dark purple #8202ff —
// at 0.07-0.09 overlay opacity, so over the app's dark surfaces
// (and the flow's dark mountain layer) the text washed out to
// illegibility. A watermark that cannot be read fails its whole
// purpose. The tile is now tuned for dark first: the wordmark and
// notice render in white with a thin dark halo (paint-order
// stroke, so the same tile also survives the app's light
// elements), the mark keeps the gradient but with lightened
// stops, and overlay opacity is 0.15 free / 0.17 dev — present
// and readable at a glance, still under the content's contrast.
// The brand assets themselves keep the exact colorway stops; the
// lightening is a watermark-only legibility adjustment.
//
// Honest limit, also in DESIGN_SYSTEM_LABS.md: no web technology
// can literally prevent screenshots. This deters casual captures
// and makes leaked screenshots visibly branded/confidential.
//
// Three-state gating, in precedence order:
//   1. DEV  — signed-in email is the dev account (DEV_EMAIL below):
//      same tile system plus a "DEV" distinction in the notice
//      line ("DO NOT SHARE · DEV"). Beats tier.
//   2. PAID — tier is one of PAID_TIERS, or the org is an exempt
//      full-access org (EXEMPT_ORGS, mirroring QUOTES_DISABLED_ORGS
//      in permissions.js — the QGC org has no tiers and full
//      access): NO watermark.
//   3. FREE — anything else (including a missing tier, which the
//      rest of the app also defaults to 'free'): watermark on.
//
// Signals come ONLY from data the front end already has at the
// call site: the signed-in user's email (Firebase auth) and
// users/{uid}.tier + orgId (the same doc dashboard.html and
// flow.html already read). No billing, entitlement, or plan data
// is read or changed here beyond that existing tier string.
//
// Usage (call once the page has resolved the signed-in user):
//   NivBrandmark.apply({ email: user.email, tier: userData.tier,
//                        orgId: userData.orgId });
// Returns 'dev' | 'free' | null (null = no watermark), and mirrors
// the state onto <html data-niv-brandmark="dev|free|off">.
//
// NOT related to flow.html's loadWatermark() — that one is the
// testing-channel version stamp (#flow-watermark). Different
// system, different element, no shared names.

(function () {
  var DEV_EMAIL = 'legobele@gmail.com';
  var PAID_TIERS = ['ultra', 'pro', 'qgc'];
  // Mirrors QUOTES_DISABLED_ORGS in permissions.js: orgs where
  // tiers do not apply and access is full. Keep the two in sync.
  var EXEMPT_ORGS = ['NJBBG5'];

  var OVERLAY_ID = 'niv-brandmark-overlay';
  var TILE_W = 340;
  var TILE_H = 224;

  // Mark gradient stops for the TILE: the approved colorway
  // (#fee800 -> #ff0e0e -> #ff0d88 -> #8202ff) with the dark end
  // lifted so it survives dark backgrounds — same hues, higher
  // lightness. The yellow start is already at full brightness
  // and stays exact. (Logo assets keep the exact stops; this is
  // only the watermark tile.)
  var STOPS =
    '<stop offset="0" stop-color="#fee800"/>' +
    '<stop offset="0.333" stop-color="#ff3333"/>' +
    '<stop offset="0.667" stop-color="#ff339e"/>' +
    '<stop offset="1" stop-color="#a64dff"/>';

  // Halo for tile text: a thin dark stroke painted UNDER the
  // white fill (paint-order:stroke). On dark surfaces the white
  // does the work; on the app's light elements (white buttons,
  // pale chips) the halo keeps the letters outlined and readable.
  var TEXT_HALO = 'paint-order="stroke" stroke="rgba(8,8,12,0.65)" stroke-linejoin="round"';

  // One tile: Breakout mark (paths identical to
  // logo-concepts/concept-3-breakout-gradient.svg) + wordmark +
  // notice. Built as an SVG string and used as a repeating CSS
  // background, so the overlay is two DOM nodes total and scrolls
  // for free (position: fixed). The wordmark renders in a system
  // bold sans: SVG background images cannot load webfonts, so the
  // tile cannot use Anybody — noted in DESIGN_SYSTEM_LABS.md.
  function tileURI(dev) {
    var notice = dev ? 'DO NOT SHARE · DEV' : 'DO NOT SHARE';
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + TILE_W + '" height="' + TILE_H + '" viewBox="0 0 ' + TILE_W + ' ' + TILE_H + '">' +
      '<defs>' +
      '<linearGradient id="bmgMark" gradientUnits="userSpaceOnUse" x1="20" y1="94" x2="74" y2="28">' + STOPS + '</linearGradient>' +
      '</defs>' +
      '<g transform="translate(17,32) scale(0.58)" fill="none" stroke="url(#bmgMark)" stroke-width="6.5">' +
      '<path d="M55 20 H20 V84 H84 V43" stroke-linejoin="miter"/>' +
      '<path d="M80 -1 L84.5 13.5 L99 18 L84.5 22.5 L80 37 L75.5 22.5 L61 18 L75.5 13.5 Z" stroke-linejoin="bevel"/>' +
      '</g>' +
      '<text x="94" y="76" font-family="Archivo, Arial, Helvetica, sans-serif" font-size="29" font-weight="800" fill="#ffffff" stroke-width="1.6" ' + TEXT_HALO + '>Nivelato Labs</text>' +
      '<text x="19" y="142" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="15" letter-spacing="5" fill="#ffffff" stroke-width="1" ' + TEXT_HALO + '>' + notice + '</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  var CSS =
    '#' + OVERLAY_ID + '{position:fixed;inset:0;z-index:800;pointer-events:none;overflow:hidden;}' +
    '#' + OVERLAY_ID + ' .niv-bm-tiles{position:absolute;inset:-55%;background-repeat:repeat;transform:rotate(-22deg);}' +
    '#' + OVERLAY_ID + '[data-mode="free"] .niv-bm-tiles{opacity:0.15;}' +
    '#' + OVERLAY_ID + '[data-mode="dev"] .niv-bm-tiles{opacity:0.17;}';

  function ensureStyle() {
    if (document.getElementById('niv-brandmark-css')) return;
    var st = document.createElement('style');
    st.id = 'niv-brandmark-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function render(mode) {
    var old = document.getElementById(OVERLAY_ID);
    if (old) old.remove();
    document.documentElement.setAttribute('data-niv-brandmark', mode || 'off');
    if (!mode) return;
    ensureStyle();
    var ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.setAttribute('data-mode', mode);
    ov.setAttribute('aria-hidden', 'true');
    var tiles = document.createElement('div');
    tiles.className = 'niv-bm-tiles';
    tiles.style.backgroundImage = 'url("' + tileURI(mode === 'dev') + '")';
    tiles.style.backgroundSize = TILE_W + 'px ' + TILE_H + 'px';
    ov.appendChild(tiles);
    document.body.appendChild(ov);
  }

  function apply(opts) {
    opts = opts || {};
    var email = String(opts.email || '').trim().toLowerCase();
    var tier = String(opts.tier == null || opts.tier === '' ? 'free' : opts.tier).trim().toLowerCase();
    var orgId = opts.orgId || '';
    var mode;
    if (email === DEV_EMAIL) {
      mode = 'dev';
    } else if (PAID_TIERS.indexOf(tier) !== -1 || EXEMPT_ORGS.indexOf(orgId) !== -1) {
      mode = null;
    } else {
      mode = 'free';
    }
    if (document.body) {
      render(mode);
    } else {
      document.addEventListener('DOMContentLoaded', function () { render(mode); });
    }
    return mode;
  }

  window.NivBrandmark = { apply: apply };
})();
