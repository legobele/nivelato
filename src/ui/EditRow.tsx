import { useState } from 'react';
import { useT } from '../i18n';
export function EditRow({ label, value, sub, canEdit, writable, onSave }: { label: string; value: string; sub?: string; canEdit: boolean; writable: boolean; onSave: (v: string) => Promise<void> }) {
  const { t } = useT(); const [ed, setEd] = useState(false); const [v, setV] = useState(value); const [err, setErr] = useState('');
  const save = async () => { if (!v.trim()) { setErr(t('nameReq')); return; } try { await onSave(v); setEd(false); setErr(''); } catch (e: any) { setErr(e.message === 'name' ? t('nameReq') : e.message); } };
  if (!ed) return (<div className="row"><div className="t"><b>{label}</b><span>{value}{sub ? ' · ' + sub : ''}</span></div>{canEdit && <button className="btn sm" disabled={!writable} title={writable ? undefined : t('unavailable')} onClick={() => { setV(value); setEd(true); }}>{t('edit')}</button>}</div>);
  return (<div className="row" style={{ flexWrap: 'wrap' }}><div className="field" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}><label htmlFor={'er' + label}>{label}</label><input id={'er' + label} autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-invalid={!!err} style={err ? { borderColor: 'var(--bad)' } : undefined} />{err && <div role="alert" style={{ color: 'var(--bad)', fontSize: 12, marginTop: 4 }}>{err}</div>}</div>
    <button className="btn pri sm" onClick={save}>{t('save2')}</button><button className="btn sm" onClick={() => { setEd(false); setErr(''); }}>{t('cancel')}</button></div>);
}
