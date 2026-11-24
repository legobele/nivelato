import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRepo } from '../App';
import { useT } from '../i18n';
import type { Job, Project } from '../data/types';
import { JoinCode } from '../ui/JoinCode';
import { IPlus } from '../ui/Icons';
import { JobRow } from './Measures';
export function Home() {
  const r = useRepo(); const { t } = useT(); const [jobs, setJobs] = useState<Job[]>([]); const [n, setN] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]); const [members, setMembers] = useState(0); const [unread, setUnread] = useState(0);
  useEffect(() => {
    r.jobs().then(setJobs); r.customers().then((c) => setN(c.length)); r.projects().then(setProjects).catch(() => {});
    if (r.can('userManagement')) r.members().then((m) => setMembers(m.length)).catch(() => {});
    r.notifications().then((x) => setUnread(x.filter((i) => !i.read).length)).catch(() => {});
  }, [r]);
  const day = new Date(); day.setHours(0, 0, 0, 0);
  const today = jobs.filter((j) => j.createdAt >= day.getTime()).length;
  const stats: [number, string][] = [[projects.length, t('projects')], [jobs.length, t('measures')], [today, t('today')], ...(r.can('userManagement') ? [[members, t('users')] as [number, string]] : []), [n, t('customers')], [unread, t('unread')]];
  return (<>
    <div className="head"><h1>{t('panel')}</h1></div><JoinCode />
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 16 }}>
      {stats.map(([v, l]) => <div className="card stat" key={l}><b>{v}</b><span className="mono">[ {l.toUpperCase()} ]</span></div>)}
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
      {r.can('createMeasurements') && <Link className="btn pri" to="/nueva"><IPlus />{t('newMeasure')}</Link>}
      {r.can('createQuotes') && <Link className="btn" to="/cotizaciones/nueva"><IPlus />{t('newQuote')}</Link>}
    </div>
    <div className="grid g2">
      <div className="card"><div className="head" style={{ marginBottom: 4 }}><h2 style={{ flex: 1 }}>{t('recentProjects')}</h2><Link className="btn sm" to="/proyectos">{t('all')}</Link></div>
        {projects.slice(0, 5).map((p) => <Link key={p.id} to={'/proyectos/' + encodeURIComponent(p.id)} className="row"><div className="t"><b className="pname">{p.name}</b><span>{p.customer}</span></div></Link>)}
        {!projects.length && <p className="dim">{t('noProjects')}</p>}</div>
      <div className="card"><div className="head" style={{ marginBottom: 4 }}><h2 style={{ flex: 1 }}>{t('recent')}</h2><Link className="btn sm" to="/medidas">{t('all')}</Link></div>
        {jobs.slice(0, 5).map((j) => <JobRow key={j.id} j={j} />)}</div>
    </div>
  </>);
}
