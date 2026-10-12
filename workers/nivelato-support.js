// nivelato-support.js — support.nivelatolabs.com
// Canonical home of the Nivelato help center (Centro de ayuda), moved
// here 2026-10-12 from legobele.github.io/nivelato/ayuda.html (ayuda.html
// in the repo is now a redirect stub to this host; the stub goes live
// whenever the repo's wedged Pages pipeline next succeeds).
// Serves the help page from GitHub raw (repo legobele/nivelato, dir
// support/), same freshness pattern as nivelato-beta: raw tracks main
// within seconds, and response headers are rebuilt from scratch so
// raw's text/plain + sandbox CSP never reach the browser.
// The page's relative assets (niv-dark.css, company-theme.js,
// press-yaoi.js, icon-192.png, manifest.json, privacy.html) live at the
// repo root and are proxied from there, like the beta worker does.
// /dev is a stub landing for the app's dev-environment interstitial
// ("See support.nivelatolabs.com/dev for info and guidance") — it
// exists so that link is not born dead; real guidance copy comes later.
// Service-worker format (modules format 400s on raw API upload).
var RAW = "https://raw.githubusercontent.com/legobele/nivelato/main";
var DIR = "support";
var ROUTES = {"/": "/index.html", "/ayuda.html": "/index.html"};

var DEV_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>Dev environment — Nivelato Support</title>'
  + '<style>body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#0e0e10;color:#f5f5f7;margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}'
  + '.card{background:#17171a;border:1px solid rgba(255,255,255,0.14);border-radius:18px;padding:36px 32px;max-width:440px;text-align:center}'
  + 'h1{font-size:22px;margin:0 0 10px;letter-spacing:.02em}p{font-size:15px;color:#a7a7ad;line-height:1.6;margin:0 0 18px}'
  + 'a{color:#4dabf7}.lang-toggle{position:fixed;top:14px;right:14px;background:transparent;border:1px solid rgba(255,255,255,0.35);border-radius:999px;color:#f5f5f7;font-family:ui-monospace,monospace;font-size:.78rem;letter-spacing:.08em;padding:7px 14px;cursor:pointer}.lang-toggle:hover{border-color:#f5f5f7}</style></head>'
  + '<body><button class="lang-toggle" aria-label="Switch language / Cambiar idioma">ES</button><div class="card"><h1 data-i18n="dev.h1">DEV ENVIRONMENT DETECTED</h1>'
  + '<p data-i18n="dev.body">Info and guidance for dev-flagged devices and accounts will live here.</p>'
  + '<a href="/" data-i18n="dev.back">Back to the help center</a></div>'
  + '<script>' + 'var I18N = { en: { "meta.title": "Dev environment — Nivelato Support", "dev.h1": "DEV ENVIRONMENT DETECTED", "dev.body": "Info and guidance for dev-flagged devices and accounts will live here.", "dev.back": "Back to the help center" }, es: { "meta.title": "Entorno dev — Soporte de Nivelato", "dev.h1": "ENTORNO DEV DETECTADO", "dev.body": "La información y la guía para dispositivos y cuentas marcados como dev vivirán aquí.", "dev.back": "Volver al centro de ayuda" } }; var FORCED_LANG = null; var LANG_KEY = \'nivelato-lang\'; function currentLang() { try { var saved = localStorage.getItem(LANG_KEY); if (saved === \'en\' || saved === \'es\') return saved; } catch (e) {} if (FORCED_LANG) return FORCED_LANG; var nav = (navigator.language || \'en\').toLowerCase(); return nav.indexOf(\'es\') === 0 ? \'es\' : \'en\'; } function applyLang(l) { var dict = I18N[l] || I18N.en; document.documentElement.lang = l; if (dict[\'meta.title\']) document.title = dict[\'meta.title\']; document.querySelectorAll(\'[data-i18n]\').forEach(function (el) { var k = el.getAttribute(\'data-i18n\'); if (dict[k] !== undefined) el.innerHTML = dict[k]; }); document.querySelectorAll(\'.lang-toggle\').forEach(function (b) { b.textContent = (l === \'en\') ? \'ES\' : \'EN\'; }); try { localStorage.setItem(LANG_KEY, l); } catch (e) {} } document.querySelectorAll(\'.lang-toggle\').forEach(function (b) { b.addEventListener(\'click\', function () { var cur = document.documentElement.lang === \'es\' ? \'es\' : \'en\'; applyLang(cur === \'en\' ? \'es\' : \'en\'); }); }); applyLang(currentLang());' + '</' + 'script></body></html>';

var CT = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf"
};

addEventListener("fetch", function (event) {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  var url = new URL(request.url);
  var path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path === "/dev") {
    return new Response(DEV_HTML, {
      status: 200,
      headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" }
    });
  }
  var target = null;
  if (Object.prototype.hasOwnProperty.call(ROUTES, path)) {
    target = RAW + "/" + DIR + ROUTES[path];
  } else if (/\.[a-z0-9]+$/i.test(path)) {
    // Shared root asset (niv-dark.css, company-theme.js, press-yaoi.js,
    // images, manifest.json, privacy.html): proxied from the repo root,
    // like the beta worker does.
    target = RAW + path;
  }
  if (!target) {
    return new Response("No encontrado.", {
      status: 404, headers: { "content-type": "text/plain;charset=UTF-8" }
    });
  }
  var upstream;
  try {
    upstream = await fetch(target + url.search, { redirect: "manual" });
  } catch (e) {
    return new Response("Nivelato no disponible ahora mismo. Intenta de nuevo.", {
      status: 502, headers: { "content-type": "text/plain;charset=UTF-8" }
    });
  }
  if (upstream.status === 404) {
    return new Response("No encontrado.", {
      status: 404, headers: { "content-type": "text/plain;charset=UTF-8" }
    });
  }
  var dot = target.lastIndexOf(".");
  var ct = CT[target.slice(dot).toLowerCase()] || "application/octet-stream";
  var headers = new Headers();
  headers.set("content-type", ct);
  headers.set("cache-control", ct.indexOf("text/html") === 0 ? "no-store" : "public, max-age=300");
  return new Response(upstream.body, { status: upstream.status, headers: headers });
}
