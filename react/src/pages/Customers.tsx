import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRepo } from '../App';
import { useT } from '../i18n';
import type { Customer, Job } from '../data/types';
import { JobRow } from './Measures';
export function Customers() {
  const r = useRepo(); const { t } = useT(); const [c, setC] = useState<Customer[]>([]);
  useEffect(() => { r.customers().then(setC); }, [r]);
  return (<><div className="head"><h1>{t('customers')}</h1></div><div className="card">
    {c.map((x) => <Link to={'/clientes/' + encodeURIComponent(x.id)} className="row" key={x.id}><div className="t"><b>{x.nombre}</b><span>{x.jobs} {x.jobs === 1 ? t('job') : t('jobs')}</span></div></Link>)}
    {!c.length && <p className="dim">{t('none')}</p>}</div></>);
}
export function CustomerDetail() {
  const { id } = useParams(); const r = useRepo(); const { t } = useT(); const [j, setJ] = useState<Job[]>([]);
  useEffect(() => { r.jobs().then((a) => setJ(a.filter((x) => (x.customerId ?? encodeURIComponent(x.customer)) === id))); }, [r, id]);
  return (<><div className="head"><h1>{j[0]?.customer ?? t('customers')}</h1>
    {r.can('createMeasurements') && <Link className="btn pri sm" to="/nueva">{t('newMeasure')}</Link>}<Link className="btn sm" to="/clientes">{t('back')}</Link></div>
    <div className="card">{j.map((x) => <JobRow key={x.id} j={x} />)}{!j.length && <p className="dim">{t('none')}</p>}</div></>);
}
