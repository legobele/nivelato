import { AddUser } from '../ui/AddUser';
import { JoinCode } from '../ui/JoinCode';
import { EditRow } from '../ui/EditRow';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRepo } from '../App';
import { useT, type K } from '../i18n';
import type { Member, PriceItem } from '../data/types';
export function Team() {
  const r = useRepo(); const { t } = useT(); const [m, setM] = useState<Member[]>([]);
  useEffect(() => { r.members().then(setM); }, [r]);
  return (<><div className="head"><h1>{t('users')}</h1><Link className="btn sm" to="/ajustes">{t('back')}</Link></div><JoinCode /><AddUser onChange={() => r.members().then(setM)} /><div className="card">
    {m.map((x) => <div className="row" key={x.uid}><div className="t"><b>{x.name}</b><span>{x.email}</span></div><span className={'pill' + (x.role === 'pending' ? '' : ' ok')}>{t(x.role as K)}</span></div>)}</div></>);
}
export function Prices() {
  const r = useRepo(); const { t } = useT(); const [p, setP] = useState<PriceItem[]>([]); const [err, setErr] = useState(''); const [bad, setBad] = useState<Record<string, string>>({}); const [draft, setDraft] = useState<Record<string, string>>({});
  const [nn, setNn] = useState({ nombre: '', unidad: 'pie²', precio: '' });
  const load = () => r.priceList().then(setP);
  useEffect(() => { load(); }, [r]);
  const act = async (f: () => Promise<void>) => { setErr(''); try { await f(); await load(); } catch (e: any) { setErr(e.message); } };
  const ro = !r.writable;
  return (<><div className="head"><h1>{t('prices')}</h1></div>{err && <div className="banner">{err}</div>}<div className="card"><div style={{ overflowX: 'auto' }}><table className="ptable"><thead><tr><th>{t('price')}</th><th>{t('unit')}</th><th>{t('amount')}</th><th>{t('active')}</th><th /></tr></thead><tbody>
    {p.map((x) => <tr key={x.id}><td>{x.nombre}</td><td>{x.unidad}</td>
      <td><input aria-label={t('amount')} aria-invalid={bad[x.id] !== undefined} className="mono" style={{ width: 80, borderColor: bad[x.id] !== undefined ? 'var(--bad)' : undefined }} disabled={ro} value={bad[x.id] ?? draft[x.id] ?? Number(x.precio).toFixed(2)} inputMode="decimal"
        onFocus={(e) => e.target.select()}
        onChange={(e) => { const raw = e.target.value; setDraft({ ...draft, [x.id]: raw }); const ok = raw.trim() !== '' && /^\d+(\.\d{1,2})?$/.test(raw.trim()); const nb = { ...bad }; if (ok) delete nb[x.id]; else nb[x.id] = raw; setBad(nb); }}
        onBlur={() => { const raw = (draft[x.id] ?? '').trim(); if (draft[x.id] === undefined || bad[x.id] !== undefined) return; const v = Number(raw); const nd = { ...draft }; delete nd[x.id]; setDraft(nd); if (v !== x.precio) act(() => r.savePrice({ ...x, precio: v })); }} />
        {bad[x.id] !== undefined && <div role="alert" style={{ color: 'var(--bad)', fontSize: 12, marginTop: 4 }}>{t('badAmount')}</div>}</td>
      <td><input type="checkbox" aria-label={t('active')} disabled={ro} checked={x.activo} onChange={(e) => act(() => r.savePrice({ ...x, activo: e.target.checked }))} /></td>
      <td><button className="btn sm" aria-label={t('remove')} title={t('remove')} style={{ padding: '0 12px', minWidth: 44 }} disabled={ro} onClick={() => act(() => r.deletePrice(x.id))}>×</button></td></tr>)}</tbody></table></div>
    {!p.length && <p className="dim">{t('none')}</p>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
      <input aria-label={t('price')} placeholder={t('price')} style={{ flex: 2, minWidth: 140 }} disabled={ro} value={nn.nombre} onChange={(e) => setNn({ ...nn, nombre: e.target.value })} />
      <input aria-label={t('unit')} placeholder={t('unit')} style={{ width: 80 }} disabled={ro} value={nn.unidad} onChange={(e) => setNn({ ...nn, unidad: e.target.value })} />
      <input aria-label={t('amount')} placeholder="0.00" inputMode="decimal" style={{ width: 90 }} disabled={ro} value={nn.precio} onChange={(e) => setNn({ ...nn, precio: e.target.value })} />
      <button className="btn pri" disabled={ro || !nn.nombre.trim() || !/^\d+(\.\d{1,2})?$/.test(nn.precio.trim())} onClick={() => act(async () => { await r.savePrice({ id: 'p' + Date.now(), nombre: nn.nombre.trim(), unidad: nn.unidad.trim() || 'pie²', precio: Number(nn.precio), activo: true }); setNn({ nombre: '', unidad: 'pie²', precio: '' }); })}>{t('addItem')}</button></div>
    {ro && <p className="dim" style={{ marginTop: 10 }}>{t('readOnly')}</p>}</div></>);
}
export function SettingsPage({ onLogout, refresh }: { onLogout: () => void; refresh: () => void }) {
  const r = useRepo(); const { t, lang, setLang } = useT();
  return (<><div className="head"><h1>{t('settings')}</h1></div><div className="card">
    <Link className="row" to="/proyectos"><div className="t"><b>{t('projects')}</b></div></Link>
    {(r.can('createQuotes') || r.can('approveQuotes')) && <Link className="row" to="/cotizaciones"><div className="t"><b>{t('quotes')}</b></div></Link>}
    {r.can('managePriceList') && <Link className="row" to="/precios"><div className="t"><b>{t('prices')}</b></div></Link>}
    {r.can('userManagement') && <Link className="row" to="/equipo"><div className="t"><b>{t('users')}</b></div></Link>}
    <div className="row"><div className="t"><b>{t('language')}</b></div><div className="seg"><button className={lang === 'es' ? 'on' : ''} onClick={() => setLang('es')}>ES</button><button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button></div></div>
    {r.setRole && <div className="row"><div className="t"><b>{t('role')}</b></div><select style={{ width: 160 }} aria-label={t('role')} value={r.me.role} onChange={(e) => { r.setRole!(e.target.value); refresh(); }}>{(['owner', 'supervisor', 'medidor', 'cotizador'] as const).map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></div>}
    <div className="row"><div className="t"><b>{t('italiano')}</b></div><span className="dim">nivelato</span></div>
    <EditRow key={'n' + r.me.name} label={t('fullName')} value={r.me.name ?? ''} sub={(r as any).me.email} canEdit writable={r.writable} onSave={async (v) => { await r.updateName(v); refresh(); }} />
    <div className="row"><div className="t"><b>{t('account')}</b></div><span className="pill ok">{t(r.me.role as K)}</span></div>
    <EditRow key={'o' + r.orgName} label={t('company')} value={r.orgName} canEdit={r.me.role === 'owner'} writable={r.writable} onSave={async (v) => { await r.updateOrgName(v); refresh(); }} />
    <div className="row"><div className="t"><b>{t('ivuRate')}</b><span className="mono">11.5%</span></div></div>
    <div className="row"><div className="t"><b>{t('version')}</b><span className="mono">2.0.0-preview.8</span></div></div>
    <div className="row"><button className="btn" onClick={onLogout}>{t('logout')}</button></div></div></>);
}
