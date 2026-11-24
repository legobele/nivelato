import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';
export function AddForm({ label, writable, onCreate, extra }: { label: string; writable: boolean; onCreate: (name: string) => Promise<void>; extra?: ReactNode }) {
  const { t } = useT(); const [open, setOpen] = useState(false); const [v, setV] = useState(''); const [err, setErr] = useState('');
  if (!open) return <button className="btn pri sm" disabled={!writable} title={writable ? undefined : t('unavailable')} onClick={() => setOpen(true)}>{label}</button>;
  const go = async () => { if (!v.trim()) { setErr(t('nameReq')); return; } try { await onCreate(v); setV(''); setErr(''); setOpen(false); } catch (e: any) { setErr(e.message === 'dup' ? t('dupName') : e.message === 'name' ? t('nameReq') : e.message); } };
  return (<div className="card" style={{ marginBottom: 16 }}>{extra}<div className="field"><label htmlFor="af">{label}</label><input id="af" autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-invalid={!!err} style={err ? { borderColor: 'var(--bad)' } : undefined} /></div>
    {err && <p style={{ color: 'var(--bad)' }} role="alert">{err}</p>}
    <div style={{ display: 'flex', gap: 8 }}><button className="btn pri" onClick={go}>{t('create')}</button><button className="btn" onClick={() => { setOpen(false); setErr(''); }}>{t('cancel')}</button></div></div>);
}
