import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRepo } from '../App';
import { useT, type K } from '../i18n';
import type { Member, PriceItem } from '../data/types';
export function Team() {
  const r = useRepo(); const { t } = useT(); const [m, setM] = useState<Member[]>([]);
  useEffect(() => { r.members().then(setM); }, [r]);
  return (<><div className="head"><h1>{t('users')}</h1><Link className="btn sm" to="/ajustes">{t('back')}</Link></div><div className="card">
    {m.map((x) => <div className="row" key={x.uid}><div className="t"><b>{x.name}</b><span>{x.email}</span></div><span className={'pill' + (x.role === 'pending' ? '' : ' ok')}>{t(x.role as K)}</span></div>)}</div></>);
}
export function Prices() {
  const r = useRepo(); const { t } = useT(); const [p, setP] = useState<PriceItem[]>([]); const [err, setErr] = useState('');
  const [nn, setNn] = useState({ nombre: '', unidad: 'pie²', precio: '' });
  const load = () => r.priceList().then(setP);
  useEffect(() => { load(); }, [r]);
  const act = async (f: () => Promise<void>) => { setErr(''); try { await f(); await load(); } catch (e: any) { setErr(e.message); } };
  const ro = !r.writable;
  return (<><div className="head"><h1>{t('prices')}</h1></div>{err && <div className="banner">{err}</div>}<div className="card"><table><thead><tr><th>{t('price')}</th><th>{t('unit')}</th><th>{t('amount')}</th><th>{t('active')}</th><th /></tr></thead><tbody>
    {p.map((x) => <tr key={x.id}><td>{x.nombre}</td><td>{x.unidad}</td>
      <td><input aria-label={t('amount')} className="mono" style={{ width: 90 }} disabled={ro} defaultValue={Number(x.precio).toFixed(2)} onFocus={(e) => e.target.select()} onBlur={(e) => { const raw = e.target.value.trim(); const v = raw === '' ? NaN : Number(raw); if (Number.isFinite(v) && v >= 0 && v !== x.precio) act(() => r.savePrice({ ...x, precio: v })); else e.target.value = Number(x.precio).toFixed(2); }} /></td>
      <td><input type="checkbox" aria-label={t('active')} disabled={ro} checked={x.activo} onChange={(e) => act(() => r.savePrice({ ...x, activo: e.target.checked }))} /></td>
      <td><button className="btn sm" disabled={ro} onClick={() => act(() => r.deletePrice(x.id))}>{t('remove')}</button></td></tr>)}</tbody></table>
    {!p.length && <p className="dim">{t('none')}</p>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
      <input aria-label={t('price')} placeholder={t('price')} style={{ flex: 2, minWidth: 140 }} disabled={ro} value={nn.nombre} onChange={(e) => setNn({ ...nn, nombre: e.target.value })} />
      <input aria-label={t('unit')} placeholder={t('unit')} style={{ width: 80 }} disabled={ro} value={nn.unidad} onChange={(e) => setNn({ ...nn, unidad: e.target.value })} />
      <input aria-label={t('amount')} placeholder="0.00" inputMode="decimal" style={{ width: 90 }} disabled={ro} value={nn.precio} onChange={(e) => setNn({ ...nn, precio: e.target.value })} />
      <button className="btn pri" disabled={ro || !nn.nombre.trim() || !(Number(nn.precio) >= 0) || nn.precio.trim() === ''} onClick={() => act(async () => { await r.savePrice({ id: 'p' + Date.now(), nombre: nn.nombre.trim(), unidad: nn.unidad.trim() || 'pie²', precio: Number(nn.precio), activo: true }); setNn({ nombre: '', unidad: 'pie²', precio: '' }); })}>{t('addItem')}</button></div>
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
    <div className="row"><div className="t"><b>{t('account')}</b><span>{r.me.name}{(r.me as any).email ? ' · ' + (r.me as any).email : ''}</span></div><span className="pill ok">{t(r.me.role as K)}</span></div>
    <div className="row"><div className="t"><b>{t('company')}</b><span>{r.orgName}</span></div></div>
    <div className="row"><div className="t"><b>{t('ivuRate')}</b><span className="mono">11.5%</span></div></div>
    <div className="row"><div className="t"><b>{t('version')}</b><span className="mono">2.0.0-preview.4</span></div></div>
    <div className="row"><button className="btn" onClick={onLogout}>{t('logout')}</button></div></div></>);
}
