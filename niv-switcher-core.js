// niv-switcher-core.js — pure list/render logic for the account context
// switcher (design: nivelato-dashboard-batch/account-switcher-spec.md).
// No imports, no browser globals: this file runs identically in the page
// (via niv-switcher.js) and under node for the unit tests, so the list
// logic that ships is the logic that is tested.

// Escape ALL user-controlled strings before innerHTML interpolation
// (org names are owner-controlled — stored XSS discipline, same as
// account-selector.js).
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function initials(name, email) {
  const base = String(name || email || '?').trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function roleLabel(role, lang) {
  const map = lang === 'en'
    ? { owner: 'Owner / Admin', cotizador: 'Quoter', supervisor: 'Supervisor', medidor: 'Measuring technician' }
    : { owner: 'Dueño / Admin', cotizador: 'Cotizador', supervisor: 'Supervisor', medidor: 'Técnico medidor' };
  return map[role] || role || '';
}

export function switcherStrings(lang) {
  if (lang === 'en') {
    return {
      title: 'Switch account',
      personal: 'Personal',
      personalCreateHint: 'Tap to create your personal account',
      loading: 'Loading accounts…',
      error: 'Could not load your accounts.',
      empty: 'No accounts available.',
      confirmSwitch: (name) => `Switch to ${name}? The app will reload and any unsent work will be lost.`,
      confirmCreatePersonal: 'Create your personal account and switch to it? The app will reload and any unsent work will be lost.',
      switchFailed: 'Could not switch accounts. Check your connection and try again.',
    };
  }
  return {
    title: 'Cambiar de cuenta',
    personal: 'Personal',
    personalCreateHint: 'Toca para crear tu cuenta personal',
    loading: 'Cargando cuentas…',
    error: 'No se pudieron cargar tus cuentas.',
    empty: 'No hay cuentas disponibles.',
    confirmSwitch: (name) => `¿Cambiar a ${name}? La app se recargará y el trabajo sin enviar se perderá.`,
    confirmCreatePersonal: '¿Crear tu cuenta personal y cambiar a ella? La app se recargará y el trabajo sin enviar se perderá.',
    switchFailed: 'No se pudo cambiar de cuenta. Revisa tu conexión e inténtalo de nuevo.',
  };
}

// Normalize a listMyContexts response into row models. The server is
// the authority (it already drops disabled memberships and dead orgs);
// the disabled filter here is defense in depth only. A personal-create
// row is appended when no personal context exists yet.
export function contextRows(data) {
  const rows = [];
  const contexts = (data && Array.isArray(data.contexts)) ? data.contexts : [];
  let hasPersonal = false;
  for (const c of contexts) {
    if (!c || !c.orgId || c.disabled === true) continue;
    if (c.isPersonal) hasPersonal = true;
    rows.push({
      kind: 'org',
      orgId: c.orgId,
      name: c.name || c.orgId,
      role: c.role || '',
      isPersonal: !!c.isPersonal,
      active: !!c.active,
    });
  }
  const personal = (data && data.personal) || { exists: false };
  if (!hasPersonal && personal.exists && personal.orgId) {
    rows.push({
      kind: 'org', orgId: personal.orgId, name: personal.name || '',
      role: 'owner', isPersonal: true, active: false,
    });
    hasPersonal = true;
  }
  if (!hasPersonal) rows.push({ kind: 'create-personal' });
  return rows;
}

export function renderContextsHtml(data, lang) {
  const T = switcherStrings(lang);
  const rows = contextRows(data);
  if (!rows.length) {
    return `<div class="niv-switcher-title">${escapeHtml(T.title)}</div>`
      + `<div class="niv-switcher-msg">${escapeHtml(T.empty)}</div>`;
  }
  const body = rows.map((r) => {
    if (r.kind === 'create-personal') {
      return `<button class="niv-switcher-row" data-create-personal="1">`
        + `<span class="niv-switcher-avatar personal">${escapeHtml(initials(T.personal))}</span>`
        + `<span class="niv-switcher-meta"><span class="niv-switcher-name">${escapeHtml(T.personal)}</span>`
        + `<span class="niv-switcher-role">${escapeHtml(T.personalCreateHint)}</span></span></button>`;
    }
    const roleText = r.isPersonal ? T.personal : roleLabel(r.role, lang);
    return `<button class="niv-switcher-row" data-switch-org="${escapeHtml(r.orgId)}"${r.active ? ' disabled aria-current="true"' : ''}>`
      + `<span class="niv-switcher-avatar${r.isPersonal ? ' personal' : ''}">${escapeHtml(initials(r.name))}</span>`
      + `<span class="niv-switcher-meta"><span class="niv-switcher-name">${escapeHtml(r.name)}</span>`
      + `<span class="niv-switcher-role">${escapeHtml(roleText)}</span></span>`
      + (r.active ? `<span class="niv-switcher-check" aria-hidden="true">✓</span>` : '')
      + `</button>`;
  }).join('');
  return `<div class="niv-switcher-title">${escapeHtml(T.title)}</div>`
    + `<div class="niv-switcher-list">${body}</div>`;
}

export function renderLoadingHtml(lang) {
  const T = switcherStrings(lang);
  return `<div class="niv-switcher-title">${escapeHtml(T.title)}</div>`
    + `<div class="niv-switcher-msg">${escapeHtml(T.loading)}</div>`;
}

export function renderErrorHtml(lang) {
  const T = switcherStrings(lang);
  return `<div class="niv-switcher-title">${escapeHtml(T.title)}</div>`
    + `<div class="niv-switcher-msg">${escapeHtml(T.error)}</div>`;
}
