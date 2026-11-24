import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRepo } from '../App';
import { useT } from '../i18n';
import type { Job, Notif, Project } from '../data/types';
import { AddForm } from '../ui/AddForm';
import { JobRow } from './Measures';
export function Projects() {
  const r = useRepo(); const { t } = useT(); const [p, setP] = useState<Project[]>([]);
  const [cs, setCs] = useState<string[]>([]); const [cu, setCu] = useState(''); const load = () => r.projects().then(setP); useEffect(() => { load(); r.customers().then((a) => { setCs(a.map((x) => x.nombre)); setCu((v) => v || a[0]?.nombre || ''); }); }, [r]);
  return (<><div className="head"><h1>{t('projects')}</h1></div><AddForm label={t('newProject')} writable={r.writable} onCreate={async (n) => { await r.addProject(cu, n); await load(); }} extra={<div className="field"><label htmlFor="pc">{t('customer')}</label><select id="pc" value={cu} onChange={(e) => setCu(e.target.value)}>{cs.map((c) => <option key={c}>{c}</option>)}</select></div>} /><div className="card">{p.map((x) => <Link key={x.id} to={'/proyectos/' + encodeURIComponent(x.id)} className="row"><div className="t"><b className="pname">{x.name}</b><span>{x.customer}</span></div><span className="dim">{x.jobs} {x.jobs === 1 ? t('job') : t('jobs')}</span></Link>)}{!p.length && <p className="dim">{t('none')}</p>}</div></>);
}
export function ProjectDetail() {
  const { id } = useParams(); const r = useRepo(); const { t } = useT(); const [j, setJ] = useState<Job[]>([]);
  const [cust, name] = decodeURIComponent(id!).split('|');
  useEffect(() => { r.jobs().then((a) => setJ(a.filter((x) => x.customer === cust && x.project === name))); }, [r, id]);
  return (<><div className="head"><h1>{name}</h1><Link className="btn sm" to="/proyectos">{t('back')}</Link></div><p className="dim" style={{ marginTop: -12 }}>{cust}</p><div className="card">{j.map((x) => <JobRow key={x.id} j={x} />)}</div></>);
}
export function Notifications() {
  const r = useRepo(); const { t } = useT(); const [n, setN] = useState<Notif[] | null>(null); const [err, setErr] = useState('');
  const load = () => r.notifications().then(setN).catch(() => setN([]));
  useEffect(() => { load(); }, [r]);
  const act = async (f: () => Promise<void>) => { try { await f(); await load(); } catch (e: any) { setErr(e.message); } };
  const dot: Record<string, string> = { device: '#8e9bb5', update: '#e5b567' };
  return (<><div className="head"><h1>{t('notifications')}</h1>{n && <span className="dim">{n.filter((x) => !x.read).length} {t('unread')}</span>}</div>{err && <div className="banner">{err}</div>}
    <div className="card">{(n ?? []).map((x) => <div key={x.id} className="row" style={{ opacity: x.read ? 0.65 : 1 }}><span style={{ width: 8, height: 8, borderRadius: 8, background: x.read ? 'transparent' : dot[x.type] || '#a8a8b0', flex: 'none' }} />
      <div className="t" onClick={() => r.writable && act(() => r.markRead(x.id))} style={{ cursor: r.writable ? 'pointer' : 'default' }}><b style={{ whiteSpace: 'normal' }}>{x.title}</b>{x.body && <span>{x.body}</span>}</div>
      <button className="btn sm" disabled={!r.writable} onClick={() => act(() => r.deleteNotif(x.id))} aria-label={t('del')}>{t('del')}</button></div>)}
      {n && !n.length && <p className="dim">{t('noNotifs')}</p>}</div></>);
}
