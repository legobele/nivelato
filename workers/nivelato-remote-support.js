// nivelato-remote-support.js — remote.nivelatolabs.com
// Remote support sessions: company code entry, session state, audit log; staff code generator.
// Serves the surface's pages from GitHub raw (repo legobele/nivelato,
// dir remote/), same pattern as nivelato-app-proxy: raw tracks main
// within seconds. Service-worker format (modules format 400s on raw
// API upload). Design: SUPPORT_SURFACES.md section 1.
var RAW = "https://raw.githubusercontent.com/legobele/nivelato/main";
var DIR = "remote";
var ROUTES = {"/": "/index.html", "/staff": "/staff.html"};
var GEO_BLOCK = true;

var GEO_BLOCK_COUNTRIES = [
  "BR",
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE"
];
var GEO_BLOCK_US_REGIONS = ["CA"];
var GEO_BLOCKED_HTML =
  '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>Nivelato no disponible en tu región</title>'
  + '<style>body{font-family:Inter,system-ui,sans-serif;background:#0e0e10;margin:0;display:flex;align-items:center;justify-content:center;min-height:100dvh;padding:24px;box-sizing:border-box}'
  + '.card{background:#17171a;border-radius:18px;padding:36px 32px;max-width:420px;text-align:center}'
  + 'h1{font-size:20px;color:#f5f5f7;margin:0 0 10px}p{font-size:14px;color:#a7a7ad;line-height:1.6;margin:0}'
  + '.logo{font-size:22px;font-weight:700;color:#f5f5f7;margin-bottom:16px}</style></head>'
  + '<body><div class="card"><div class="logo">Nivelato</div>'
  + '<h1>Nivelato no está disponible en tu región</h1>'
  + '<p>Por ahora el servicio no se ofrece en tu país o estado. Si crees que esto es un error, intenta de nuevo desde otra conexión. Gracias por tu interés.</p>'
  + '</div></body></html>';

function geoBlockedResponse() {
  return new Response(GEO_BLOCKED_HTML, {
    status: 451,
    headers: { "content-type": "text/html;charset=UTF-8", "cache-control": "no-store" }
  });
}

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
  if (GEO_BLOCK) {
    var cf = request.cf || {};
    if (GEO_BLOCK_COUNTRIES.indexOf(cf.country) !== -1) return geoBlockedResponse();
    if (cf.country === "US"
      && (GEO_BLOCK_US_REGIONS.indexOf(cf.regionCode) !== -1 || cf.region === "California")) {
      return geoBlockedResponse();
    }
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
    // Shared root asset (firebase-config.js, niv-dark.css, press-yaoi.js,
    // images, manifest.json): proxied from the repo root, like the app
    // proxy does.
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
