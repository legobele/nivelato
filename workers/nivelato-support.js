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
// /dev is the landing for the app's dev-environment interstitial
// ("See support.nivelatolabs.com/dev for info and guidance"). It carries
// real guidance (m29): what the dev flag means, that it is an alarm
// state, and the exit (Ctrl+Alt+B toggles the mark off on the Nivelato
// page that shows the red screen).
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
  + 'h1{font-size:22px;margin:0 0 10px;letter-spacing:.02em}p{font-size:15px;color:#a7a7ad;line-height:1.6;margin:0 0 18px;text-align:left}'
  + 'a{color:#4dabf7}.lang-toggle{position:fixed;top:14px;right:14px;background:transparent;border:1px solid rgba(255,255,255,0.35);border-radius:999px;color:#f5f5f7;font-family:ui-monospace,monospace;font-size:.78rem;letter-spacing:.08em;padding:7px 14px;cursor:pointer}.lang-toggle:hover{border-color:#f5f5f7}</style></head>'
  + '<body><button class="lang-toggle" aria-label="Switch language / Cambiar idioma">ES</button><div class="card"><h1 data-i18n="dev.h1">DEV ENVIRONMENT DETECTED</h1>'
  + '<p data-i18n="dev.body">This device or account has been marked as a development (dev) environment in Nivelato. The red DEV ENVIRONMENT DETECTED screen is an alarm state, not an error and not a punishment.</p>'
  + '<p data-i18n="dev.meaning">While the dev flag is active, some action restrictions can be lifted, such as permission restrictions, and using a dev environment strongly increases the risk of data loss. Do not do real production work while the flag is on.</p>'
  + '<p data-i18n="dev.exit">To exit: go back to the Nivelato page where you see the red screen, and press Ctrl+Alt+B. That toggles the environment mark off and dismisses the screen. Press it once and check that the red screen is gone before pressing it again, because the same keys cycle the mark.</p>'
  + '<a href="/" data-i18n="dev.back">Back to the help center</a></div>'
  + '<script>' + 'var I18N = { en: { "meta.title": "Dev environment — Nivelato Support", "dev.h1": "DEV ENVIRONMENT DETECTED", "dev.body": "This device or account has been marked as a development (dev) environment in Nivelato. The red DEV ENVIRONMENT DETECTED screen is an alarm state, not an error and not a punishment.", "dev.meaning": "While the dev flag is active, some action restrictions can be lifted, such as permission restrictions, and using a dev environment strongly increases the risk of data loss. Do not do real production work while the flag is on.", "dev.exit": "To exit: go back to the Nivelato page where you see the red screen, and press Ctrl+Alt+B. That toggles the environment mark off and dismisses the screen. Press it once and check that the red screen is gone before pressing it again, because the same keys cycle the mark.", "dev.back": "Back to the help center" }, es: { "meta.title": "Entorno dev — Soporte de Nivelato", "dev.h1": "ENTORNO DEV DETECTADO", "dev.body": "Este dispositivo o cuenta ha sido marcado como un entorno de desarrollo (dev) en Nivelato. La pantalla roja de ENTORNO DEV DETECTADO es un estado de alarma, no un error ni un castigo.", "dev.meaning": "Mientras la marca dev está activa, algunas restricciones de acciones pueden levantarse, como las restricciones de permisos, y usar un entorno dev aumenta fuertemente el riesgo de pérdida de datos. No hagas trabajo real de producción mientras la marca esté activa.", "dev.exit": "Para salir: vuelve a la página de Nivelato donde ves la pantalla roja y presiona Ctrl+Alt+B. Eso desactiva la marca de entorno y cierra la pantalla. Presiónala una vez y verifica que la pantalla roja ya no esté antes de presionarla otra vez, porque las mismas teclas cambian la marca.", "dev.back": "Volver al centro de ayuda" } }; var FORCED_LANG = null; var LANG_KEY = \'nivelato-lang\'; function currentLang() { try { var cm = (\'; \' + document.cookie).match(/; nivelato-login-lang=(es|en)(?:;|$)/); if (cm) return cm[1]; } catch (e) {} try { var saved = localStorage.getItem(LANG_KEY); if (saved === \'en\' || saved === \'es\') return saved; } catch (e) {} if (FORCED_LANG) return FORCED_LANG; var nav = (navigator.language || \'en\').toLowerCase(); return nav.indexOf(\'es\') === 0 ? \'es\' : \'en\'; } function applyLang(l) { var dict = I18N[l] || I18N.en; document.documentElement.lang = l; if (dict[\'meta.title\']) document.title = dict[\'meta.title\']; document.querySelectorAll(\'[data-i18n]\').forEach(function (el) { var k = el.getAttribute(\'data-i18n\'); if (dict[k] !== undefined) el.innerHTML = dict[k]; }); document.querySelectorAll(\'.lang-toggle\').forEach(function (b) { b.textContent = (l === \'en\') ? \'ES\' : \'EN\'; }); try { localStorage.setItem(LANG_KEY, l); } catch (e) {} } document.querySelectorAll(\'.lang-toggle\').forEach(function (b) { b.addEventListener(\'click\', function () { var cur = document.documentElement.lang === \'es\' ? \'es\' : \'en\'; applyLang(cur === \'en\' ? \'es\' : \'en\'); }); }); applyLang(currentLang());' + '</' + 'script></body></html>';

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
  // /dashboard.html lives on the dashboard subdomain (Giulia, 2026-10-29):
  // bounce the file path there with a permanent redirect, query preserved.
  if (path === "/dashboard.html") {
    return Response.redirect("https://dashboard.nivelatolabs.com/" + url.search, 301);
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
