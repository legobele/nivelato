import { useEffect, useState } from 'react';
import { useRepo } from '../App';
import { useT, type K } from '../i18n';
import { PERM_KEYS, makePermChecker } from '../core/permissions';
import type { Invite } from '../data/types';
const ROLES = ['medidor', 'supervisor', 'cotizador'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function AddUser({ onChange }: { onChange: () => void }) {
  const r = useRepo(); const { t } = useT(); const [open, setOpen] = useState(false); const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [email, setEmail] = useState(''); const [role, setRole] = useState<(typeof ROLES)[number]>('medidor'); const [ov, setOv] = useState<Record<string, boolean>>({}); const [err, setErr] = useState('');
  const [list, setList] = useState<Invite[]>([]); const load = () => r.invites().then(setList).catch(() => setList([])); useEffect(() => { load(); }, [r]);
  if (r.me.role !== 'owner') return null;
  const def = makePermChecker({ role, tier: 'ultra', orgId: r.me.orgId }); const eff = (k: (typeof PERM_KEYS)[number]) => (ov[k] !== undefined ? ov[k] : def(k));
  const reset = () => { setOpen(false); setStep('form'); setEmail(''); setRole('medidor'); setOv({}); setErr(''); };
  const toggle = (k: (typeof PERM_KEYS)[number]) => { const v = !eff(k); const n = { ...ov }; if (v === def(k)) delete n[k]; else n[k] = v; setOv(n); };
  const next = () => { if (!EMAIL_RE.test(email.trim())) { setErr(t('errEmail')); return; } setErr(''); setStep('confirm'); };
  const send = async () => { try { await r.sendInvite({ email, role, permissions: ov }); await load(); onChange(); setStep('done'); setErr(''); } catch (e: any) { setErr(e.message === 'member' ? t('alreadyMember') : e.message === 'email' ? t('errEmail') : e.message); setStep('form'); } };
  const dup = list.some((x) => x.email === email.trim().toLowerCase());
  const on = PERM_KEYS.filter((k) => eff(k));
  return (<>
    <div className="row" style={{ border: 0, paddingLeft: 0 }}><button className="btn pri sm" disabled={!r.writable} title={r.writable ? undefined : t('unavailable')} onClick={() => setOpen(true)}>{t('addUser')}</button></div>
    {open && <div className="card" style={{ marginBottom: 16 }} role="dialog" aria-label={t('addUser')}>
      {step === 'form' && <>
        <div className="field"><label htmlFor="au-e">{t('email')}</label><input id="au-e" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err} /></div>
        <div className="field"><label htmlFor="au-r">{t('role')}</label><select id="au-r" value={role} onChange={(e) => { setRole(e.target.value as any); setOv({}); }}>{ROLES.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></div>
        <label>{t('permsLabel')}</label><p className="dim" style={{ marginTop: 0 }}>{t('permsNote')}</p>
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>{PERM_KEYS.map((k) => <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}><input type="checkbox" checked={eff(k)} onChange={() => toggle(k)} />{t(('perm_' + k) as K)}{ov[k] !== undefined && <span className="pill">*</span>}</label>)}</div>
        {dup && <p className="dim">{t('alreadyInvited')}</p>}{err && <p role="alert" style={{ color: 'var(--bad)' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8 }}><button className="btn pri" onClick={next}>{t('next')}</button><button className="btn" onClick={reset}>{t('cancel')}</button></div></>}
      {step === 'confirm' && <>
        <h2>{t('checkInvite')}</h2><p><b>{email.trim()}</b> · {t(role as K)}</p><p className="dim">{t('permsLabel')}: {on.length ? on.map((k) => t(('perm_' + k) as K)).join(', ') : t('permsNone')}</p>
        {r.joinCode && <p className="dim">{t('joinCode')}: <span className="mono">{r.joinCode}</span></p>}
        {err && <p role="alert" style={{ color: 'var(--bad)' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8 }}><button className="btn pri" onClick={send}>{t('sendInvite')}</button><button className="btn" onClick={() => setStep('form')}>{t('prev')}</button></div></>}
      {step === 'done' && <><h2>{t('inviteSaved')}</h2><p><b>{email.trim()}</b> {t('inviteBody')}</p><button className="btn pri" onClick={reset}>{t('close')}</button></>}
    </div>}
    {list.length > 0 && <div className="card" style={{ marginTop: 16 }}><h2 style={{ marginBottom: 4 }}>{t('pendingInvites')}</h2>{list.map((x) => <div className="row" key={x.email}><div className="t"><b>{x.email}</b><span>{t(x.role as K)} · {t('invitedOn')} {new Date(x.createdAt).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-US' : 'es-PR', { day: 'numeric', month: 'short' })}</span></div>
      <button className="btn sm" disabled={!r.writable} onClick={async () => { await r.sendInvite({ email: x.email, role: x.role, permissions: x.permissions }); load(); }}>{t('resend')}</button><button className="btn sm" disabled={!r.writable} onClick={async () => { await r.revokeInvite(x.email); load(); }}>{t('revoke')}</button></div>)}</div>}
  </>);
}
