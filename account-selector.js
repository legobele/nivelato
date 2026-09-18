// account-selector.js — shared header account menu (main app + dashboard)
// Loaded as a classic script. auth-guard.js / dashboard.js must call
// window.initAccountSelector({ user, userData }) once Firebase auth resolves.
import { signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

let _menuOpen = false;

// Best-effort purge of leftover Firebase Auth persistence keys, so a logout
// can never leave a session behind even if signOut() itself fails.
function purgeAuthRemnants() {
  for (const storeName of ['localStorage', 'sessionStorage']) {
    try {
      const store = window[storeName];
      const doomed = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.indexOf('firebase:authUser') === 0) doomed.push(k);
      }
      doomed.forEach((k) => store.removeItem(k));
    } catch (_) { /* storage unavailable — nothing to purge */ }
  }
}

// Sign out BEFORE navigating. The timeout race guarantees a hanging signOut()
// can never wedge the logout flow; remnants are purged regardless.
async function hardSignOut() {
  try {
    await Promise.race([
      signOut(auth),
      new Promise((_, reject) => setTimeout(() => reject(new Error('signOut timeout')), 4000)),
    ]);
  } catch (_) { /* fall through to purge + navigate */ }
  purgeAuthRemnants();
}

function injectStyles() {
  if (document.getElementById("account-selector-styles")) return;
  const s = document.createElement("style");
  s.id = "account-selector-styles";
  s.textContent = `
  .acct-menu-wrap { position: relative; display: inline-flex; align-items: center; }
  .acct-trigger {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--accent-light, #e7f5ff);
    border: 1px solid var(--accent, #1971c2);
    color: var(--accent, #1971c2);
    font-family: inherit; font-size: 12px; font-weight: 600;
    padding: 4px 10px; border-radius: 20px; cursor: pointer;
    max-width: 180px;
  }
  .acct-trigger:active { transform: scale(0.98); }
  .acct-avatar {
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--accent, #1971c2); color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; flex-shrink: 0;
  }
  .acct-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .acct-caret { font-size: 9px; opacity: 0.7; }
  .acct-dropdown {
    position: absolute; top: calc(100% + 8px); right: 0;
    min-width: 220px; background: #fff;
    border: 1px solid var(--grey-200, #e9ecef);
    border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,0.14);
    padding: 6px; z-index: 50; display: none;
  }
  .acct-dropdown.open { display: block; }
  .acct-dropdown::before {
    content: ""; position: absolute; top: -6px; right: 16px;
    width: 12px; height: 12px; background: #fff;
    border-left: 1px solid var(--grey-200, #e9ecef);
    border-top: 1px solid var(--grey-200, #e9ecef);
    transform: rotate(45deg);
  }
  .acct-info { padding: 10px 12px; border-bottom: 1px solid var(--grey-100, #f1f3f5); }
  .acct-info .nm { font-size: 14px; font-weight: 700; color: var(--grey-900, #212529); }
  .acct-info .em { font-size: 12px; color: var(--grey-600, #868e96); margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .acct-info .rl { font-size: 11px; font-weight: 600; color: var(--accent, #1971c2);
    text-transform: capitalize; margin-top: 4px; }
  .acct-item {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 10px 12px; border: none; background: none; cursor: pointer;
    font-family: inherit; font-size: 13px; font-weight: 500; color: var(--grey-700, #495057);
    border-radius: 8px; text-align: left;
  }
  .acct-item:hover { background: var(--grey-50, #f8f9fa); }
  .acct-item.danger { color: var(--red, #c92a2a); }
  .acct-item.danger:hover { background: var(--red-bg, #fff5f5); }
  `;
  document.head.appendChild(s);
}

function initials(name, email) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function roleLabel(role) {
  const map = {
    owner: "Dueño / Admin",
    cotizador: "Cotizador",
    supervisor: "Supervisor",
    medidor: "Técnico medidor",
  };
  return map[role] || role || "";
}

function closeMenu() {
  const dd = document.getElementById("acct-dropdown");
  if (dd) dd.classList.remove("open");
  _menuOpen = false;
}

function buildMenu({ user, userData }) {
  injectStyles();
  const header = document.getElementById("app-header") || document.querySelector("header");
  if (!header) return;

  // Avoid double-injecting
  if (document.getElementById("acct-menu-wrap")) return;

  const wrap = document.createElement("div");
  wrap.id = "acct-menu-wrap";
  wrap.className = "acct-menu-wrap";

  const displayName = userData?.name || user.displayName || user.email || "Usuario";
  const email = user.email || "";

  wrap.innerHTML = `
    <button class="acct-trigger" id="acct-trigger" aria-haspopup="true" aria-expanded="false">
      <span class="acct-avatar">${initials(displayName, email)}</span>
      <span class="acct-name">${displayName.split(" ")[0]}</span>
      <span class="acct-caret">▼</span>
    </button>
    <div class="acct-dropdown" id="acct-dropdown" role="menu">
      <div class="acct-info">
        <div class="nm">${displayName}</div>
        ${email ? `<div class="em">${email}</div>` : ""}
        <div class="rl">${roleLabel(userData?.role)}</div>
      </div>
      <button class="acct-item" id="acct-settings" role="menuitem" onclick="window.location.href='settings.html'">⚙️ Ajustes</button>
      <button class="acct-item danger" id="acct-signout" role="menuitem">Salir / Cerrar sesión</button>
    </div>
  `;

  // Insert into .header-right if present (dashboard), else append to header.
  // On the main app we keep the existing insertion point (before Dashboard link).
  const right = header.querySelector('.header-right');
  const dashLink = header.querySelector('a[href="dashboard.html"]');
  if (dashLink) header.insertBefore(wrap, dashLink);
  else if (right) right.appendChild(wrap);
  else header.appendChild(wrap);

  const trigger = wrap.querySelector("#acct-trigger");
  const dropdown = wrap.querySelector("#acct-dropdown");

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    _menuOpen = !_menuOpen;
    dropdown.classList.toggle("open", _menuOpen);
    trigger.setAttribute("aria-expanded", String(_menuOpen));
  });

  dropdown.querySelector("#acct-signout").addEventListener("click", async () => {
    closeMenu();
    await hardSignOut();
    window.location.href = "login.html";
  });

  document.addEventListener("click", (e) => {
    if (_menuOpen && !wrap.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && _menuOpen) closeMenu();
  });
}

window.initAccountSelector = ({ user, userData }) => {
  buildMenu({ user, userData });
};
