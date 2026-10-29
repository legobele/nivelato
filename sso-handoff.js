// sso-handoff.js — cross-origin session handoff between the Nivelato app
// surfaces (app.nivelatolabs.com <-> dashboard.nivelatolabs.com).
//
// Firebase Auth sessions are origin-scoped: being signed in on one surface
// says nothing on the other, so a raw cross-origin link lands on a surface
// whose auth guard bounces to the login page — which (deliberately, since
// 2026-10-06) never adopts its own existing session, forcing the user to
// type their credentials a second time just to cross between the dashboard
// and the wizard. This helper performs the same mint-and-hand-off the
// login page runs after sign-in (login.html's ssoHandoff), but starting
// from the CURRENT surface's live session: mint a custom token for our own
// uid, hand it to the destination origin's sso.html, which signs in there
// and lands on the destination. Any failure falls back to a plain
// navigation (the pre-fix behavior), so a handoff bug can never wedge a
// button.

const MINT_URL = 'https://us-central1-nivelato-app.cloudfunctions.net/mintSsoToken';

export async function handoffTo(destUrl) {
  const dest = new URL(destUrl, window.location.href);
  // Same origin: nothing to hand off, just go.
  if (dest.origin === window.location.origin) {
    window.location.href = dest.toString();
    return;
  }
  try {
    // Lazy import, same pattern dashboard.html uses for niv-user.js: this
    // module must stay side-effect-free at load, and the binding code may
    // run before firebase-config.js has been imported by the host page.
    const { auth } = await import('./firebase-config.js');
    // Wait for the persisted session to resolve before reading currentUser,
    // so an early click can't mistake "not restored yet" for "signed out".
    if (typeof auth.authStateReady === 'function') await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) throw new Error('no-session');
    // Direct fetch with an explicit ID token, NOT httpsCallable: the
    // callable client bound to a second Firebase app instance never sees
    // the signed-in user and never attaches the Authorization header
    // (→ 401 "Sign in first."). Same pattern and rationale as login.html's
    // ssoHandoff.
    const idToken = await user.getIdToken(true);
    const resp = await fetch(MINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
      body: JSON.stringify({ data: {} })
    });
    const body = await resp.json().catch(() => null);
    const token = body && body.result && body.result.customToken;
    if (!token) throw new Error('no-custom-token');
    window.location.href = dest.origin + '/sso.html#ctoken=' + encodeURIComponent(token)
      + '&next=' + encodeURIComponent(dest.toString());
  } catch (e) {
    // Never wedge a navigation on the handoff: worst case is the old
    // behavior (the destination guard sends the user to login).
    window.location.href = dest.toString();
  }
}

// Bind a click on #id to a handed-off navigation to destUrl. The element
// keeps its normal href/onclick-free behavior when JS is unavailable only
// if the caller left one in place; this handler takes over when present.
export function handoffOnClick(id, destUrl) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', (ev) => { ev.preventDefault(); handoffTo(destUrl); });
}
