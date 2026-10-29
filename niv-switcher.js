// niv-switcher.js — account context switcher glue (ES module).
// Design: nivelato-dashboard-batch/account-switcher-spec.md.
//
// One login, many contexts: the switcher lists the contexts the server
// vouches for (listMyContexts), and a switch rewrites the ACTIVE context
// server-side (switchOrgContext) — no sign-out, no sign-in, the shared
// session cookie (uid-bound, org-blind) is never touched. After the
// server switch, flowGate runs DIRECTLY (never through the
// ensureFlowClaims cache, which would short-circuit on the previous
// context's claims) so the new context's geo/license claims are minted
// fresh, the ID token is force-refreshed, and the page reloads: the
// reload is the isolation mechanism, because every surface opens its
// listeners against orgs/{orgId} at load.
//
// The pure list/render logic lives in niv-switcher-core.js. Firebase is
// reached only through lazy imports inside the default deps (the
// session-bridge.js pattern), so this file imports cleanly under node
// and createSwitcher(deps) can be driven end to end with fakes.

import {
  switcherStrings,
  renderContextsHtml,
  renderLoadingHtml,
  renderErrorHtml,
} from './niv-switcher-core.js';

function resolveLang() {
  try {
    const m = document.cookie.match(/(?:^|; )nivelato-login-lang=(es|en)/);
    if (m) return m[1];
    return localStorage.getItem('nivelato-login-lang') === 'en' ? 'en' : 'es';
  } catch { return 'es'; }
}

async function defaultCallFn(name, data) {
  const [{ auth }, fnsMod] = await Promise.all([
    import('./firebase-config.js'),
    import('https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js'),
  ]);
  const fns = fnsMod.getFunctions(auth.app, 'us-central1');
  const res = await fnsMod.httpsCallable(fns, name)(data || {});
  return res && res.data;
}

async function defaultForceToken() {
  const [{ auth }, authMod] = await Promise.all([
    import('./firebase-config.js'),
    import('https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js'),
  ]);
  if (auth && auth.currentUser) await authMod.getIdToken(auth.currentUser, true);
}

async function defaultRouteGate(verdict, reason) {
  try {
    const geo = await import('./geo.js');
    return geo.routeAfterGate(verdict, reason);
  } catch { return false; }
}

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('niv-switcher-styles')) return;
  const s = document.createElement('style');
  s.id = 'niv-switcher-styles';
  s.textContent = `
  .niv-switcher { padding: 2px 0 2px; }
  .niv-switcher-title {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 11px; font-weight: 700; letter-spacing: .06em;
    text-transform: uppercase; opacity: .55; padding: 6px 12px 4px;
    color: var(--niv-text, #f5f5f7);
  }
  .niv-switcher-list {
    display: flex; flex-direction: column; gap: 2px;
    max-height: 232px; overflow-y: auto; overscroll-behavior: contain;
  }
  .niv-switcher-row {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 8px 12px; border: none; background: none; cursor: pointer;
    font-family: 'Inter', system-ui, sans-serif; font-size: 13px;
    color: var(--niv-text, #f5f5f7); border-radius: 8px; text-align: left;
  }
  .niv-switcher-row:hover { background: var(--niv-surface-2, rgba(255,255,255,.06)); }
  .niv-switcher-row[disabled] { cursor: default; }
  .niv-switcher-row[disabled]:hover { background: none; }
  .niv-switcher-avatar {
    width: 30px; height: 30px; border-radius: 50%;
    background: #1971c2; color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; flex-shrink: 0;
  }
  .niv-switcher-avatar.personal { background: #7048c9; }
  .niv-switcher-meta { min-width: 0; flex: 1; display: flex; flex-direction: column; }
  .niv-switcher-name {
    font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .niv-switcher-role { font-size: 11px; opacity: .65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .niv-switcher-check { font-size: 13px; color: #51cf66; flex-shrink: 0; }
  .niv-switcher-msg {
    font-family: 'Inter', system-ui, sans-serif;
    padding: 8px 12px; font-size: 12px; opacity: .7; color: var(--niv-text, #f5f5f7);
  }
  .niv-switcher-divider {
    height: 1px; background: var(--niv-border-soft, rgba(255,255,255,.09)); margin: 6px 4px;
  }
  `;
  document.head.appendChild(s);
}

export function createSwitcher(deps = {}) {
  const d = {
    callFn: deps.callFn || defaultCallFn,
    forceToken: deps.forceToken || defaultForceToken,
    routeGate: deps.routeGate || defaultRouteGate,
    confirmFn: deps.confirmFn || ((msg) => window.confirm(msg)),
    alertFn: deps.alertFn || ((msg) => window.alert(msg)),
    reload: deps.reload || (() => window.location.reload()),
    lang: deps.lang || resolveLang,
  };

  // Post-switch sequence: fresh claims for the NEW context first
  // (block/review verdicts route away, like at login), then a forced
  // token refresh, then the reload that re-resolves everything.
  async function afterContextChange() {
    try {
      const gate = await d.callFn('flowGate', {
        timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })(),
        appVersionCode: 0,
      });
      if (gate && gate.verdict && await d.routeGate(gate.verdict, gate.reason)) {
        return 'routed';
      }
    } catch (_) { /* baseline claims from the switch stand; geo.js re-verifies next load */ }
    try { await d.forceToken(); } catch (_) { /* reload still re-resolves */ }
    d.reload();
    return 'reloaded';
  }

  async function doSwitch(orgId) {
    await d.callFn('switchOrgContext', { orgId });
    return afterContextChange();
  }

  async function switchTo(orgId, name) {
    const T = switcherStrings(d.lang());
    if (!d.confirmFn(T.confirmSwitch(name || ''))) return 'cancelled';
    try {
      return await doSwitch(orgId);
    } catch (_) {
      d.alertFn(T.switchFailed);
      return 'failed';
    }
  }

  async function createPersonal() {
    const T = switcherStrings(d.lang());
    if (!d.confirmFn(T.confirmCreatePersonal)) return 'cancelled';
    try {
      const res = await d.callFn('createPersonalContext', {});
      if (!res || !res.orgId) throw new Error('no-org');
      // Org-less users were activated inside their new personal context
      // by the callable itself; everyone else still has to switch.
      if (res.switchedIn) return await afterContextChange();
      return await doSwitch(res.orgId);
    } catch (_) {
      d.alertFn(T.switchFailed);
      return 'failed';
    }
  }

  async function mountInto(container) {
    if (!container) return 'no-container';
    injectStyles();
    const lang = d.lang();
    container.innerHTML = renderLoadingHtml(lang);
    let data;
    try {
      data = await d.callFn('listMyContexts', {});
    } catch (_) {
      container.innerHTML = renderErrorHtml(lang);
      return 'error';
    }
    container.innerHTML = renderContextsHtml(data, lang);
    container.querySelectorAll('[data-switch-org]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nameEl = btn.querySelector('.niv-switcher-name');
        switchTo(btn.getAttribute('data-switch-org'), nameEl ? nameEl.textContent : '');
      });
    });
    container.querySelectorAll('[data-create-personal]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        createPersonal();
      });
    });
    return 'mounted';
  }

  return { mountInto, switchTo, createPersonal, doSwitch, afterContextChange };
}

const _default = createSwitcher();
export const mountInto = (el) => _default.mountInto(el);
export const switchTo = (orgId, name) => _default.switchTo(orgId, name);
export const createPersonal = () => _default.createPersonal();

// Dashboard sidebar popup: the switcher section lives at the top of the
// canonical account popup and loads lazily on first open.
function autoMountDashboardPopup() {
  try {
    const popup = document.getElementById('niv-account-popup');
    if (!popup || document.getElementById('niv-switcher-popup')) return;
    injectStyles();
    const sec = document.createElement('div');
    sec.className = 'niv-switcher';
    sec.id = 'niv-switcher-popup';
    popup.insertBefore(sec, popup.firstChild);
    const divider = document.createElement('div');
    divider.className = 'niv-switcher-divider';
    popup.insertBefore(divider, sec.nextSibling);
    let loaded = false;
    const card = document.getElementById('niv-account-card');
    if (card) {
      card.addEventListener('click', () => {
        if (!loaded) { loaded = true; _default.mountInto(sec); }
      });
    }
  } catch (_) { /* a page without the popup just skips the switcher */ }
}

if (typeof window !== 'undefined') {
  window.NivSwitcher = {
    mountInto,
    switchTo,
    createPersonal,
    createSwitcher,
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoMountDashboardPopup);
    } else {
      autoMountDashboardPopup();
    }
  }
}
