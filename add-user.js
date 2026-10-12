// add-user.js — Add User flow for companies (Users view).
//
// Self-contained module: injects its own styles and DOM, bootstraps on
// users.html, and exposes window.NivelatoAddUser for other pages.
//
// How it maps onto the existing membership mechanism (no parallel system):
//   - Membership = a users/{uid} doc with orgId + role + disabled, and
//     the org's joinCode is how joiners find the company. That is all
//     unchanged.
//   - "Adding" a user = the owner writes an invite doc at
//     orgs/{orgId}/invites/{email} carrying the chosen role and the
//     permission OVERRIDES (same users/{uid}.permissions shape the
//     user-detail panel edits; role defaults come from permissions.js).
//   - The invite email goes through the sendCompanyInviteEmail callable
//     (Resend pipeline, includes the join code).
//   - When the invitee signs up and first signs in, flowGate applies
//     the invite server-side (role + permissions + activation). The
//     manual approval queue in company/settings applies it too, as a
//     fallback. Until then the invite sits in the pending list below
//     the team list, where the owner can resend or revoke it.
//
// Owner-only, matching firestore.rules: the button and list only mount
// for role 'owner', and the rules enforce the same server-side... in
// rules-land. Strings ship in EN + ES; language follows the signed-in
// user's saved language (users/{uid}.language), defaulting to EN.

import { auth, db, centralFunctions } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import {
  getDoc, getDocs, doc, setDoc, updateDoc, deleteDoc,
  collection, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-functions.js";
import { PERM_DEFS, makePermChecker, orgHasQuotes } from './permissions.js';

const PERM_KEYS = PERM_DEFS.map(d => d.key);
const QUOTE_KEYS = ['managePriceList', 'createQuotes', 'approveQuotes'];
const ROLES = ['medidor', 'supervisor', 'cotizador'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PERM_LABELS = {
  en: {
    viewDashboard: 'View dashboard',
    createMeasurements: 'Create measurements',
    viewOwnMeasurements: 'View own measurements',
    editOwnMeasurements: 'Edit own measurements',
    viewOthersMeasurements: "View others' measurements",
    editOthersMeasurements: "Edit others' measurements",
    managePriceList: 'Manage price list',
    createQuotes: 'Create quotes',
    approveQuotes: 'Approve quotes',
    userManagement: 'Manage users'
  },
  es: Object.fromEntries(PERM_DEFS.map(d => [d.key, d.label]))
};
const ROLE_LABELS = {
  en: { medidor: 'Measuring technician', supervisor: 'Supervisor', cotizador: 'Quoter' },
  es: { medidor: 'Técnico medidor', supervisor: 'Supervisor', cotizador: 'Cotizador' }
};
const STR = {
  en: {
    addUser: 'Add user',
    pendingInvites: 'Pending invites',
    modalTitle: 'Add a user',
    modalSub: 'Invite someone to {org}. They sign up with this email and their access activates automatically, no approval wait.',
    emailLabel: 'Email',
    emailPh: 'name@company.com',
    roleLabel: 'Role',
    permsLabel: 'Permissions',
    permsNote: 'Starts from the role defaults. Only the changes you make here are saved with the invite.',
    continueBtn: 'Continue',
    backBtn: 'Back',
    sendBtn: 'Send invite',
    sending: 'Sending...',
    confirmTitle: 'Check the invite',
    confirmPermsOn: 'Permissions on',
    confirmPermsNone: 'None',
    confirmJoinNote: 'The email includes the company join code ({code}). Share it directly too if the email does not arrive.',
    errEmail: 'Enter a valid email.',
    errGeneric: 'Something went wrong: {msg}',
    alreadyMember: 'That email is already on the team.',
    alreadyPendingMember: 'That person already signed up and is waiting for approval. This invite applies the role and permissions below at their next sign-in.',
    alreadyInvited: 'This email already has a pending invite. Sending again replaces its role and permissions.',
    alreadyAccepted: 'That email already joined through an invite.',
    doneTitle: 'Invite sent',
    doneBody: '{email} can sign up now. Their access activates automatically with the role and permissions you picked.',
    doneFailTitle: 'Invite saved, email not sent',
    doneFailBody: 'The invite is ready, but the email could not be sent. Share the join code {code} with {email} directly and ask them to sign up with that same email.',
    doneBtn: 'Done',
    close: 'Close',
    resend: 'Resend',
    revoke: 'Revoke',
    invitedOn: 'Invited {date}',
    copyCode: 'Copy code',
    copied: 'Copied'
  },
  es: {
    addUser: 'Agregar usuario',
    pendingInvites: 'Invitaciones pendientes',
    modalTitle: 'Agregar un usuario',
    modalSub: 'Invita a alguien a {org}. Se registra con este correo y su acceso se activa automáticamente, sin esperar aprobación.',
    emailLabel: 'Correo electrónico',
    emailPh: 'nombre@empresa.com',
    roleLabel: 'Rol',
    permsLabel: 'Permisos',
    permsNote: 'Parte de los permisos del rol. Solo los cambios que hagas aquí se guardan con la invitación.',
    continueBtn: 'Continuar',
    backBtn: 'Atrás',
    sendBtn: 'Enviar invitación',
    sending: 'Enviando...',
    confirmTitle: 'Revisa la invitación',
    confirmPermsOn: 'Permisos activos',
    confirmPermsNone: 'Ninguno',
    confirmJoinNote: 'El correo incluye el código del taller ({code}). Compártelo directamente también si el correo no llega.',
    errEmail: 'Ingresa un correo válido.',
    errGeneric: 'Algo salió mal: {msg}',
    alreadyMember: 'Ese correo ya está en el equipo.',
    alreadyPendingMember: 'Esa persona ya se registró y está esperando aprobación. Esta invitación aplica el rol y los permisos siguientes en su próximo inicio de sesión.',
    alreadyInvited: 'Este correo ya tiene una invitación pendiente. Enviar de nuevo reemplaza su rol y permisos.',
    alreadyAccepted: 'Ese correo ya se unió con una invitación.',
    doneTitle: 'Invitación enviada',
    doneBody: '{email} ya puede registrarse. Su acceso se activa automáticamente con el rol y los permisos que elegiste.',
    doneFailTitle: 'Invitación guardada, correo no enviado',
    doneFailBody: 'La invitación está lista, pero el correo no se pudo enviar. Comparte el código del taller {code} con {email} directamente y pídele que se registre con ese mismo correo.',
    doneBtn: 'Listo',
    close: 'Cerrar',
    resend: 'Reenviar',
    revoke: 'Revocar',
    invitedOn: 'Invitado el {date}',
    copyCode: 'Copiar código',
    copied: 'Copiado'
  }
};

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

let ctx = null; // { uid, userData, orgId, orgData, lang }
const t = (key, vars) => {
  let s = (STR[ctx ? ctx.lang : 'en'] || STR.en)[key] || key;
  if (vars) for (const k of Object.keys(vars)) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
};
const permLabel = (k) => (PERM_LABELS[ctx.lang] || PERM_LABELS.en)[k] || k;
const roleLabel = (r) => (ROLE_LABELS[ctx.lang] || ROLE_LABELS.en)[r] || r;

function injectCss() {
  if (document.getElementById('add-user-css')) return;
  const st = document.createElement('style');
  st.id = 'add-user-css';
  st.textContent = `
  .au-add-btn {
    display: block; width: 100%; padding: 13px 16px; border-radius: 9999px;
    border: 1.5px solid var(--line, #2a2a2e); background: transparent;
    color: var(--text, #f1f1f2); font-size: 14px; font-weight: 600;
    font-family: inherit; cursor: pointer;
  }
  .au-add-btn:hover { border-color: var(--faint, #6d6d74); }
  .au-invites { margin-top: 8px; }
  .au-invites-title {
    font-size: 13px; font-weight: 600; color: var(--faint, #6d6d74);
    text-transform: uppercase; letter-spacing: .12em; padding: 4px 6px 0;
  }
  .au-invite-card {
    border: 1.5px dashed var(--line, #2a2a2e); border-radius: var(--radius-md, 18px);
    padding: 12px 14px; margin-top: 10px;
  }
  .au-invite-email { font-size: 14px; font-weight: 600; word-break: break-all; }
  .au-invite-sub { font-size: 12px; color: var(--muted, #9a9aa0); margin-top: 2px; }
  .au-invite-actions { display: flex; gap: 8px; margin-top: 10px; }
  .au-mini-btn {
    flex: 1; padding: 8px 10px; border-radius: 9999px; font-size: 13px; font-weight: 600;
    border: 1.5px solid var(--line, #2a2a2e); background: transparent;
    color: var(--text, #f1f1f2); font-family: inherit; cursor: pointer;
  }
  .au-mini-btn:hover { border-color: var(--faint, #6d6d74); }
  .au-mini-btn.danger { color: #f0a3a3; }
  .au-mini-btn:disabled { opacity: .5; cursor: default; }
  .au-overlay {
    position: fixed; inset: 0; z-index: 900; background: rgba(0,0,0,.62);
    display: flex; align-items: center; justify-content: center; padding: 18px;
  }
  .au-panel {
    width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto;
    background: var(--card, #101013); border: 1.5px solid var(--line, #2a2a2e);
    border-radius: var(--radius-lg, 28px); padding: 26px 26px 22px;
    color: var(--text, #f1f1f2); font-family: Inter, -apple-system, 'Segoe UI', sans-serif;
  }
  .au-head { display: flex; align-items: flex-start; gap: 12px; }
  .au-title { font-size: 19px; font-weight: 700; flex: 1; }
  .au-x {
    flex: none; width: 34px; height: 34px; border-radius: 50%;
    border: 1.5px solid var(--line, #2a2a2e); background: transparent;
    color: var(--text, #f1f1f2); font-size: 15px; cursor: pointer; font-family: inherit;
  }
  .au-sub { font-size: 13px; color: var(--muted, #9a9aa0); line-height: 1.5; margin: 6px 0 18px; }
  .au-field { margin-bottom: 16px; }
  .au-field label {
    display: block; font-size: 12px; font-weight: 600;
    color: var(--muted, #9a9aa0); margin-bottom: 6px;
    text-transform: uppercase; letter-spacing: .08em;
  }
  .au-field input, .au-field select {
    width: 100%; padding: 12px 14px; font-size: 14px; font-family: inherit;
    color: var(--text, #f1f1f2); background: var(--bg, #0d0d0f);
    border: 1.5px solid var(--line, #2a2a2e); border-radius: var(--radius-sm, 12px);
    box-sizing: border-box;
  }
  .au-field input:focus, .au-field select:focus {
    outline: none; border-color: var(--blue, #1e9df0);
  }
  .au-note { font-size: 12px; color: var(--faint, #6d6d74); line-height: 1.5; margin: 4px 0 10px; }
  .au-warn {
    font-size: 13px; line-height: 1.5; border-radius: var(--radius-sm, 12px);
    padding: 10px 12px; margin-bottom: 14px; display: none;
    border: 1.5px solid #6b5510; background: #221c07; color: #f2d38a;
  }
  .au-warn.show { display: block; }
  .au-error {
    font-size: 13px; line-height: 1.5; border-radius: var(--radius-sm, 12px);
    padding: 10px 12px; margin-bottom: 14px; display: none;
    border: 1.5px solid #5c2121; background: #1c0f0f; color: #f0a3a3;
  }
  .au-error.show { display: block; }
  .au-perm-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 9px 0; border-bottom: 1px solid var(--line-soft, #1f1f23); font-size: 14px;
  }
  .au-perm-row:last-of-type { border-bottom: 0; }
  .au-toggle {
    position: relative; width: 52px; height: 30px; flex: none;
    border-radius: 9999px; border: 0; background: #3a3a40;
    cursor: pointer; transition: background .15s; padding: 0;
  }
  .au-toggle .knob {
    position: absolute; top: 3px; left: 3px; width: 24px; height: 24px;
    border-radius: 50%; background: #fff; transition: left .15s;
  }
  .au-toggle.on { background: var(--green, #51cf66); }
  .au-toggle.on .knob { left: 25px; }
  .au-actions { display: flex; gap: 10px; margin-top: 20px; }
  .au-btn {
    flex: 1; padding: 13px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600;
    border: 1.5px solid var(--line, #2a2a2e); background: transparent;
    color: var(--text, #f1f1f2); font-family: inherit; cursor: pointer;
  }
  .au-btn:hover { border-color: var(--faint, #6d6d74); }
  .au-btn.primary {
    background: linear-gradient(135deg, #2dd4bf, #1e9df0);
    border-color: transparent; color: #06281f;
  }
  .au-btn:disabled { opacity: .55; cursor: default; }
  .au-summary { border: 1.5px solid var(--line, #2a2a2e); border-radius: var(--radius-md, 18px); padding: 16px; }
  .au-sum-row { display: flex; gap: 10px; font-size: 14px; padding: 6px 0; }
  .au-sum-row .k { flex: none; width: 110px; color: var(--muted, #9a9aa0); font-size: 13px; }
  .au-sum-row .v { min-width: 0; word-break: break-all; }
  .au-done-icon { font-size: 40px; text-align: center; margin: 8px 0 4px; }
  `;
  document.head.appendChild(st);
}

// ---- permission state ------------------------------------------------
// The modal edits OVERRIDES only, exactly like the user-detail panel:
// a key lands in the invite's permissions map only when it differs from
// the role default (permissions.js fallback for a bare { role } doc).
function roleDefaults(role) {
  const checker = makePermChecker({ role, orgId: ctx.orgId, permissions: {} });
  const out = {};
  for (const k of PERM_KEYS) out[k] = !!checker(k);
  return out;
}
function applicableKeys() {
  return orgHasQuotes({ orgId: ctx.orgId })
    ? PERM_KEYS
    : PERM_KEYS.filter(k => !QUOTE_KEYS.includes(k));
}

// ---- modal -----------------------------------------------------------
let modalState = null; // { email, role, overrides: {}, existing: null|'pending'|'accepted' }

function closeModal() {
  const ov = document.getElementById('au-overlay');
  if (ov) ov.remove();
  modalState = null;
  document.removeEventListener('keydown', auEsc);
}
function auEsc(e) { if (e.key === 'Escape') closeModal(); }

async function checkEmailState(email) {
  // Returns { member: 'active'|'pending'|null, invite: 'pending'|'accepted'|null }
  const out = { member: null, invite: null };
  try {
    const qs = await getDocs(query(collection(db, 'users'), where('orgId', '==', ctx.orgId)));
    qs.forEach((d) => {
      const m = d.data();
      if (String(m.email || '').trim().toLowerCase() === email) {
        // 'rejected' (string) counts as no membership here: re-activating
        // a rejected account stays a manual owner decision, and the
        // invite alone must never do it (flowGate enforces the same).
        if (m.disabled === true) out.member = 'pending';
        else if (!m.disabled) out.member = 'active';
      }
    });
  } catch (_) { /* guard is best-effort */ }
  try {
    const inv = await getDoc(doc(db, 'orgs', ctx.orgId, 'invites', email));
    if (inv.exists()) out.invite = inv.data().status || null;
  } catch (_) { /* same */ }
  return out;
}

function renderPermToggles(container) {
  const defaults = roleDefaults(modalState.role);
  container.innerHTML = applicableKeys().map((k) => {
    const on = modalState.overrides[k] !== undefined ? modalState.overrides[k] : defaults[k];
    return `<div class="au-perm-row">
      <span>${escapeHtml(permLabel(k))}</span>
      <button type="button" class="au-toggle${on ? ' on' : ''}" data-key="${escapeHtml(k)}"
        aria-pressed="${on}" aria-label="${escapeHtml(permLabel(k))}"><span class="knob"></span></button>
    </div>`;
  }).join('');
  container.querySelectorAll('.au-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      const def = roleDefaults(modalState.role)[key];
      const cur = modalState.overrides[key] !== undefined ? modalState.overrides[key] : def;
      const next = !cur;
      if (next === def) delete modalState.overrides[key];
      else modalState.overrides[key] = next;
      renderPermToggles(container);
    });
  });
}

function openAddUserModal() {
  if (!ctx || ctx.userData.role !== 'owner') return;
  injectCss();
  closeModal();
  modalState = { email: '', role: 'medidor', overrides: {}, existing: null };
  const orgName = (ctx.orgData && ctx.orgData.name) || 'Nivelato';
  const ov = document.createElement('div');
  ov.className = 'au-overlay';
  ov.id = 'au-overlay';
  ov.innerHTML = `
  <div class="au-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(t('modalTitle'))}">
    <div class="au-head">
      <div class="au-title">${escapeHtml(t('modalTitle'))}</div>
      <button type="button" class="au-x" id="au-close" aria-label="${escapeHtml(t('close'))}">✕</button>
    </div>
    <div id="au-step-1">
      <p class="au-sub">${escapeHtml(t('modalSub', { org: orgName }))}</p>
      <div class="au-warn" id="au-warn"></div>
      <div class="au-error" id="au-error"></div>
      <div class="au-field">
        <label for="au-email">${escapeHtml(t('emailLabel'))}</label>
        <input id="au-email" type="email" autocomplete="off" placeholder="${escapeHtml(t('emailPh'))}" />
      </div>
      <div class="au-field">
        <label for="au-role">${escapeHtml(t('roleLabel'))}</label>
        <select id="au-role">
          ${ROLES.map(r => `<option value="${r}">${escapeHtml(roleLabel(r))}</option>`).join('')}
        </select>
      </div>
      <div class="au-field">
        <label>${escapeHtml(t('permsLabel'))}</label>
        <p class="au-note">${escapeHtml(t('permsNote'))}</p>
        <div id="au-perms"></div>
      </div>
      <div class="au-actions">
        <button type="button" class="au-btn primary" id="au-continue">${escapeHtml(t('continueBtn'))}</button>
      </div>
    </div>
    <div id="au-step-2" style="display:none"></div>
    <div id="au-step-3" style="display:none"></div>
  </div>`;
  document.body.appendChild(ov);
  document.addEventListener('keydown', auEsc);
  ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(); });
  document.getElementById('au-close').addEventListener('click', closeModal);

  const emailInput = document.getElementById('au-email');
  const roleSel = document.getElementById('au-role');
  const permsBox = document.getElementById('au-perms');
  renderPermToggles(permsBox);
  roleSel.addEventListener('change', () => {
    modalState.role = roleSel.value;
    modalState.overrides = {};
    renderPermToggles(permsBox);
  });

  document.getElementById('au-continue').addEventListener('click', async () => {
    const email = emailInput.value.trim().toLowerCase();
    const err = document.getElementById('au-error');
    const warn = document.getElementById('au-warn');
    err.classList.remove('show');
    warn.classList.remove('show');
    if (!EMAIL_RE.test(email)) {
      err.textContent = t('errEmail');
      err.classList.add('show');
      return;
    }
    modalState.email = email;
    const state = await checkEmailState(email);
    if (state.member === 'active') {
      err.textContent = t('alreadyMember');
      err.classList.add('show');
      return;
    }
    if (state.invite === 'accepted') {
      err.textContent = t('alreadyAccepted');
      err.classList.add('show');
      return;
    }
    const notes = [];
    if (state.member === 'pending') notes.push(t('alreadyPendingMember'));
    if (state.invite === 'pending') notes.push(t('alreadyInvited'));
    modalState.existing = state.invite;
    renderConfirm(notes.join(' '));
  });
  emailInput.focus();
}

function renderConfirm(warnText) {
  const step1 = document.getElementById('au-step-1');
  const step2 = document.getElementById('au-step-2');
  const defaults = roleDefaults(modalState.role);
  const enabled = applicableKeys()
    .filter(k => (modalState.overrides[k] !== undefined ? modalState.overrides[k] : defaults[k]));
  const joinCode = (ctx.orgData && ctx.orgData.joinCode) || ctx.orgId;
  step1.style.display = 'none';
  step2.style.display = '';
  step2.innerHTML = `
    <p class="au-sub">${escapeHtml(t('confirmTitle'))}</p>
    ${warnText ? `<div class="au-warn show">${escapeHtml(warnText)}</div>` : ''}
    <div class="au-error" id="au-error-2"></div>
    <div class="au-summary">
      <div class="au-sum-row"><span class="k">${escapeHtml(t('emailLabel'))}</span><span class="v">${escapeHtml(modalState.email)}</span></div>
      <div class="au-sum-row"><span class="k">${escapeHtml(t('roleLabel'))}</span><span class="v">${escapeHtml(roleLabel(modalState.role))}</span></div>
      <div class="au-sum-row"><span class="k">${escapeHtml(t('confirmPermsOn'))}</span><span class="v">${enabled.length ? enabled.map(k => escapeHtml(permLabel(k))).join(', ') : escapeHtml(t('confirmPermsNone'))}</span></div>
    </div>
    <p class="au-note" style="margin-top:12px">${escapeHtml(t('confirmJoinNote', { code: joinCode }))}</p>
    <div class="au-actions">
      <button type="button" class="au-btn" id="au-back">${escapeHtml(t('backBtn'))}</button>
      <button type="button" class="au-btn primary" id="au-send">${escapeHtml(t('sendBtn'))}</button>
    </div>`;
  document.getElementById('au-back').addEventListener('click', () => {
    step2.style.display = 'none';
    step1.style.display = '';
  });
  document.getElementById('au-send').addEventListener('click', sendInvite);
}

async function sendInvite() {
  const sendBtn = document.getElementById('au-send');
  const err = document.getElementById('au-error-2');
  err.classList.remove('show');
  sendBtn.disabled = true;
  sendBtn.textContent = t('sending');
  const email = modalState.email;
  const ref = doc(db, 'orgs', ctx.orgId, 'invites', email);
  try {
    // Re-invite of a pending invite replaces it (delete + create: the
    // rules only let owners change an invite's status in place).
    if (modalState.existing === 'pending') await deleteDoc(ref);
    await setDoc(ref, {
      email,
      role: modalState.role,
      permissions: { ...modalState.overrides },
      status: 'pending',
      createdBy: ctx.uid,
      createdAt: serverTimestamp()
    });
  } catch (e) {
    err.textContent = t('errGeneric', { msg: e.message || 'unknown error' });
    err.classList.add('show');
    sendBtn.disabled = false;
    sendBtn.textContent = t('sendBtn');
    return;
  }
  let emailOk = true;
  try {
    const send = httpsCallable(centralFunctions, 'sendCompanyInviteEmail');
    await send({ orgId: ctx.orgId, email });
  } catch (_) { emailOk = false; }
  renderDone(emailOk);
  refreshInvites();
}

function renderDone(emailOk) {
  document.getElementById('au-step-2').style.display = 'none';
  const step3 = document.getElementById('au-step-3');
  const joinCode = (ctx.orgData && ctx.orgData.joinCode) || ctx.orgId;
  step3.style.display = '';
  step3.innerHTML = emailOk ? `
    <div class="au-done-icon">✅</div>
    <p class="au-sub" style="text-align:center">${escapeHtml(t('doneTitle'))}</p>
    <p class="au-note" style="text-align:center">${escapeHtml(t('doneBody', { email: modalState.email }))}</p>
    <div class="au-actions"><button type="button" class="au-btn primary" id="au-done">${escapeHtml(t('doneBtn'))}</button></div>`
  : `
    <div class="au-done-icon">⚠️</div>
    <p class="au-sub" style="text-align:center">${escapeHtml(t('doneFailTitle'))}</p>
    <p class="au-note" style="text-align:center">${escapeHtml(t('doneFailBody', { email: modalState.email, code: joinCode }))}</p>
    <div class="au-actions">
      <button type="button" class="au-btn" id="au-copy">${escapeHtml(t('copyCode'))}</button>
      <button type="button" class="au-btn primary" id="au-done">${escapeHtml(t('doneBtn'))}</button>
    </div>`;
  document.getElementById('au-done').addEventListener('click', closeModal);
  const copyBtn = document.getElementById('au-copy');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(joinCode); copyBtn.textContent = t('copied'); }
    catch (_) { /* clipboard unavailable: the code is in the text above */ }
  });
}

// ---- pending invites list ---------------------------------------------
async function refreshInvites() {
  const box = document.getElementById('au-invites');
  if (!box || !ctx) return;
  let invites = [];
  try {
    const qs = await getDocs(query(
      collection(db, 'orgs', ctx.orgId, 'invites'),
      where('status', '==', 'pending')
    ));
    invites = qs.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  } catch (e) {
    console.warn('[Nivelato] could not load invites:', e.message);
    box.innerHTML = '';
    return;
  }
  if (!invites.length) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="au-invites-title">${escapeHtml(t('pendingInvites'))} (${invites.length})</div>
    ${invites.map((inv) => {
      const when = inv.createdAt && inv.createdAt.toDate
        ? inv.createdAt.toDate().toLocaleDateString() : '';
      return `<div class="au-invite-card">
        <div class="au-invite-email">${escapeHtml(inv.email || inv.id)}</div>
        <div class="au-invite-sub">${escapeHtml(roleLabel(inv.role))}${when ? ' · ' + escapeHtml(t('invitedOn', { date: when })) : ''}</div>
        <div class="au-invite-actions">
          <button type="button" class="au-mini-btn" data-resend="${escapeHtml(inv.id)}">${escapeHtml(t('resend'))}</button>
          <button type="button" class="au-mini-btn danger" data-revoke="${escapeHtml(inv.id)}">${escapeHtml(t('revoke'))}</button>
        </div>
      </div>`;
    }).join('')}`;
  box.querySelectorAll('[data-resend]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const send = httpsCallable(centralFunctions, 'sendCompanyInviteEmail');
        await send({ orgId: ctx.orgId, email: btn.getAttribute('data-resend') });
        btn.textContent = '✓';
      } catch (_) { btn.disabled = false; }
    });
  });
  box.querySelectorAll('[data-revoke]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await updateDoc(doc(db, 'orgs', ctx.orgId, 'invites', btn.getAttribute('data-revoke')), { status: 'revoked' });
        refreshInvites();
      } catch (_) { btn.disabled = false; }
    });
  });
}

// ---- bootstrap ----------------------------------------------------------
function mount() {
  injectCss();
  const col = document.querySelector('.users-col');
  if (!col) return;
  const title = col.querySelector('.users-title');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'au-add-btn';
  btn.id = 'au-add-btn';
  btn.textContent = '+ ' + t('addUser');
  btn.addEventListener('click', openAddUserModal);
  if (title) title.after(btn); else col.prepend(btn);
  const box = document.createElement('div');
  box.className = 'au-invites';
  box.id = 'au-invites';
  col.appendChild(box);
  refreshInvites();
  if (new URLSearchParams(window.location.search).get('addUser') === '1') {
    openAddUserModal();
  }
  if (pendingAddUserMsg) {
    pendingAddUserMsg = false;
    openAddUserModal();
  }
}

// El panel (dashboard) incrusta esta pagina y puede pedir la apertura del
// flujo de agregar por postMessage cuando el marco ya cargo sin el
// parametro ?addUser=1. Solo se honran mensajes del mismo origen.
let pendingAddUserMsg = false;
window.addEventListener('message', (e) => {
  if (e.origin !== window.location.origin) return;
  if (!e.data || e.data.type !== 'nivelato:addUser') return;
  if (window.NivelatoAddUser) openAddUserModal();
  else pendingAddUserMsg = true;
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return;
    const userData = snap.data();
    if (!userData || userData.role !== 'owner' || !userData.orgId) return;
    let orgData = {};
    try {
      const orgSnap = await getDoc(doc(db, 'orgs', userData.orgId));
      if (orgSnap.exists()) orgData = orgSnap.data();
    } catch (_) { /* name/code fall back gracefully */ }
    ctx = {
      uid: user.uid,
      userData,
      orgId: userData.orgId,
      orgData,
      lang: (userData.language === 'es' || userData.language === 'en') ? userData.language : (() => { try { const ck = (document.cookie.match(/(?:^|; )nivelato-login-lang=(es|en)/) || [])[1]; if (ck) return ck; const ls = window.localStorage.getItem('nivelato-login-lang'); if (ls === 'es' || ls === 'en') return ls; } catch (e) {} return 'es'; })()
    };
    window.NivelatoAddUser = { open: openAddUserModal, refreshInvites };
    mount();
  } catch (e) {
    console.warn('[Nivelato] add-user bootstrap failed:', e.message);
  }
});
