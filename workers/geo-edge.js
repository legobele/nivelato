// workers/geo-edge.js — Phase 2 edge routing (NOT DEPLOYED).
// Spec: nivelato-geo-flows-spec.md §4.1, §6, §11.
//
// A Cloudflare Worker in front of the GitHub Pages site. Reads
// request.cf.country (free, reliable country-level geo) and decides which
// experience a visitor gets. ROUTING ONLY — never trusted for enforcement;
// flowGate (Cloud Functions) is the authority at auth time.
//
// Deploy (Giulia, when ready):
//   1. `npm i -g wrangler && wrangler login`
//   2. Route the worker to the Pages domain (e.g. legobele.github.io/nivelato/*)
//   3. No secrets needed — cf.country is free on every plan.
//
// Behavior:
//   PR        → set cookie nl_flow=qgi, serve the QGI landing
//   other     → set cookie nl_flow=external, serve the external landing
//   unknown   → external (safer: never expose the QGI invite path to an
//               unverifiable visitor — spec §6.3)
// login.html ALSO does its own client-side detection as a fallback, so the
// site works correctly even before this worker is deployed.

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const country = (request.cf && request.cf.country) || null;

    // Only route entry points; deep links pass through untouched.
    const entryPaths = ['/', '/index.html', '/login.html'];
    const isEntry = entryPaths.some((p) => url.pathname.endsWith(p));
    if (!isEntry) return fetch(request);

    const flow = country === 'PR' ? 'qgi' : 'external';
    const res = await fetch(request);
    const out = new Response(res.body, res);
    // 24h cookie; login.html prefers it over its own ipapi.co lookup.
    out.headers.append(
      'Set-Cookie',
      `nl_flow=${flow}; Path=/; Max-Age=86400; SameSite=Lax`
    );
    out.headers.set('X-Nivelato-Flow', flow);
    if (country) out.headers.set('X-Nivelato-Country', country);
    return out;
  },
};
