import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRepo } from '../App';
import { useT, type K } from '../i18n';
import type { Job } from '../data/types';
import { Graph, jobGraph } from '../ui/Graph';
import { toFracStr } from '../core/leveling';
const fmt = (t: number) => new Date(t).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-US' : 'es-PR', { day: 'numeric', month: 'short' });
export function JobRow({ j }: { j: Job }) {
  const { t } = useT();
  return <Link to={`/medidas/${j.id}`} className="row"><div className="t"><b>{j.customer || t('noCust')}</b><span>{j.project}{j.area ? ' · ' + j.area : ''}</span></div>
    <span className="mono dim">{toFracStr(j.hueco.anchoBot)} × {toFracStr(j.hueco.altoIzq)}</span><span className="dim nw">{fmt(j.createdAt)}</span></Link>;
}
export function Measures() {
  const r = useRepo(); const { t } = useT(); const [jobs, setJobs] = useState<Job[]>([]); const [q, setQ] = useState('');
  useEffect(() => { r.jobs().then(setJobs); }, [r]);
  const f = jobs.filter((j) => (j.customer + j.project + j.location + j.area).toLowerCase().includes(q.toLowerCase()));
  return (<><div className="head"><h1>{t('history')}</h1></div>
    {!r.can('viewOthersMeasurements') && <div className="banner">{t('mine')}</div>}
    <div className="field"><input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} /></div>
    <div className="card">{f.length ? f.map((j) => <JobRow key={j.id} j={j} />) : <p className="dim">{t('none')}</p>}</div></>);
}
export function MeasureDetail() {
  const { id } = useParams(); const r = useRepo(); const { t } = useT(); const [j, setJ] = useState<Job | null | undefined>(undefined);
  useEffect(() => { r.job(id!).then(setJ); }, [r, id]);
  if (j === undefined) return null;
  if (!j || (j.installerUid && j.installerUid !== r.me.uid && !r.can('viewOthersMeasurements'))) return <p>{t('notFound')}</p>;
  const legacy = j.offsetConvention !== 'end-minus-start-v1';
  const walls: [K, keyof Job['paredes']][] = [['left', 'izq'], ['right', 'der'], ['top', 'techo'], ['bottom', 'piso']];
  const lab: Record<string, string | null> = { izq: j.desniveles.paredIzq, der: j.desniveles.paredDer, techo: j.desniveles.techo, piso: j.desniveles.piso };
  return (<>
    <div className="head"><h1>{j.customer || t('noCust')}</h1><Link className="btn sm" to="/medidas">{t('back')}</Link></div>
    <p className="dim" style={{ marginTop: -12 }}>{[j.project, j.area, j.location].filter(Boolean).join(' · ')}</p>
    <div className="grid g2"><Graph g={jobGraph(j)} />
      <div className="card"><div className="wc">{walls.map(([n, k]) => { const p = j.paredes[k]; const ab = !legacy && p.desnivelAB ? ` (${p.desnivelAB > 0 ? '+' : '-'}${toFracStr(Math.abs(p.desnivelAB))})` : '';
        return <div className="wcard" key={k}><h3>{t(n)}</h3><dl><dt>A</dt><dd>{toFracStr(p.a)}</dd><dt>B</dt><dd>{toFracStr(p.b)}</dd><dt>{t('offset')}</dt><dd>{lab[k]}{ab}</dd></dl></div>; })}</div>
      {(j.annotatedPhoto || j.photo) && <img src={(j.annotatedPhoto || j.photo)!} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 12 }} />}
      <p className="dim" style={{ marginBottom: 0 }}>{legacy ? t('legacy') : t('abTo')}</p></div></div></>);
}
