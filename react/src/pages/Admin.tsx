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
  const r = useRepo(); const { t } = useT(); const [p, setP] = useState<PriceItem[]>([]);
  useEffect(() => { r.priceList().then(setP); }, [r]);
  return (<><div className="head"><h1>{t('prices')}</h1></div><div className="card"><table><thead><tr><th>{t('price')}</th><th>{t('unit')}</th><th>{t('amount')}</th></tr></thead><tbody>
    {p.map((x) => <tr key={x.id}><td>{x.nombre}</td><td>{x.unidad}</td><td className="mono">${Number(x.precio).toFixed(2)}</td></tr>)}</tbody></table>
    {!p.length && <p className="dim">{t('none')}</p>}</div></>);
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
    <div className="row"><div className="t"><b>{t('org')}</b><span>{r.orgName}</span></div></div>
    <div className="row"><div className="t"><b>{t('version')}</b><span className="mono">2.0.0-preview.4</span></div></div>
    <div className="row"><button className="btn" onClick={onLogout}>{t('logout')}</button></div></div></>);
}
