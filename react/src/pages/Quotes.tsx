import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useRepo } from '../App';
import { useT, type K } from '../i18n';
import type { Job, PriceItem, Quote } from '../data/types';
import { qAreaPie2, qLineSubtotal, qTotals, type QLine, type Descuento } from '../core/quotes';
const money = (n: number) => '$' + n.toFixed(2);
export function QuoteList() {
  const r = useRepo(); const { t } = useT(); const [q, setQ] = useState<Quote[]>([]);
  useEffect(() => { r.quotes().then(setQ); }, [r]);
  return (<><div className="head"><h1>{t('quotes')}</h1>{r.can('createQuotes') && <Link className="btn pri" to="/cotizaciones/nueva">{t('newQuote')}</Link>}</div>
    <div className="card">{q.map((x) => <Link key={x.id} to={'/cotizaciones/' + x.id} className="row"><div className="t"><b>{x.cliente}</b><span>{x.numero}</span></div><span className="mono nw">{money(x.totales.total)}</span><span className={'pill' + (x.estado === 'aprobada' ? ' ok' : '')}>{t(x.estado as K)}</span></Link>)}
      {!q.length && <p className="dim">{t('none')}</p>}</div></>);
}
export function QuoteDetail() {
  const { id } = useParams(); const r = useRepo(); const { t } = useT(); const [q, setQ] = useState<Quote | null | undefined>(undefined); const [err, setErr] = useState('');
  const load = () => r.quotes().then((a) => setQ(a.find((x) => x.id === id) ?? null));
  useEffect(() => { load(); }, [r, id]);
  const set = async (e: Quote['estado']) => { try { await r.setQuoteState(id!, e); await load(); } catch (x: any) { setErr(x.message); } };
  if (q === undefined) return null; if (!q) return <p>{t('notFound')}</p>;
  const T = q.totales;
  return (<><div className="head"><h1>{q.numero}</h1><Link className="btn sm" to="/cotizaciones">{t('back')}</Link></div>
    <p className="dim" style={{ marginTop: -12 }}>{q.cliente} · <span className={'pill' + (q.estado === 'aprobada' ? ' ok' : '')}>{t(q.estado as K)}</span></p>
    <div className="card"><table><thead><tr><th>{t('item')}</th><th>{t('qty')}</th><th>{t('amount')}</th></tr></thead><tbody>
      {q.lineas.map((l) => <tr key={l.lineaId}><td>{l.descripcion}{l.modeloPrecio === 'porPieCuadrado' ? <span className="dim"> · {l.areaPie2} pie²</span> : null}</td><td className="mono">{l.cantidad}</td><td className="mono nw">{money(l.subtotalLinea ?? 0)}</td></tr>)}</tbody></table>
      <div className="tot"><span>{t('subtotal')}</span><b className="mono">{money(T.subtotal)}</b></div>
      {T.descuento > 0 && <div className="tot"><span>{t('discount')}</span><b className="mono">−{money(T.descuento)}</b></div>}
      <div className="tot"><span>{t('ivu')} ({Math.round(T.tasaIVU * 1000) / 10}%)</span><b className="mono">{money(T.montoIVU)}</b></div>
      <div className="tot big"><span>{t('total')}</span><b className="mono">{money(T.total)}</b></div>
      {err && <p style={{ color: 'var(--bad)' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {q.estado === 'borrador' && r.can('createQuotes') && <button className="btn pri" disabled={!r.writable} onClick={() => set('enviada')}>{t('send')}</button>}
        {q.estado === 'enviada' && r.can('approveQuotes') && <><button className="btn pri" disabled={!r.writable} onClick={() => set('aprobada')}>{t('approve')}</button><button className="btn" disabled={!r.writable} onClick={() => set('rechazada')}>{t('reject')}</button></>}</div></div></>);
}
export function QuoteBuilder() {
  const r = useRepo(); const { t } = useT(); const go = useNavigate();
  const [items, setItems] = useState<PriceItem[]>([]); const [jobs, setJobs] = useState<Job[]>([]);
  const [cliente, setCliente] = useState(''); const [lines, setLines] = useState<QLine[]>([]);
  const [desc, setDesc] = useState<Descuento>({ tipo: 'ninguno', valor: 0 }); const [tasa, setTasa] = useState('0.115'); const [val, setVal] = useState('30'); const [notas, setNotas] = useState(''); const [job, setJob] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { r.priceList().then((p) => setItems(p.filter((i) => i.activo))); r.jobs().then(setJobs); }, [r]);
  if (!r.can('createQuotes')) return <p className="dim">{t('noPerm')}</p>;
  const sel = jobs.find((j) => j.id === job);
  const add = (it: PriceItem) => { const pie = (it as any).modeloPrecio === 'porPieCuadrado' || it.unidad === 'pie²' || it.unidad === 'pie2'; const l: QLine = { lineaId: Math.random().toString(36).slice(2, 8), descripcion: it.nombre, cantidad: 1, precioUnitario: it.precio, modeloPrecio: pie ? 'porPieCuadrado' : 'porUnidad', areaPie2: pie && sel ? qAreaPie2(sel.hueco.anchoBot, sel.hueco.altoIzq) : pie ? 0 : undefined }; l.subtotalLinea = qLineSubtotal(l); setLines([...lines, l]); };
  const upd = (i: number, p: Partial<QLine>) => setLines(lines.map((l, k) => { if (k !== i) return l; const n = { ...l, ...p }; n.subtotalLinea = qLineSubtotal(n); return n; }));
  const T = useMemo(() => qTotals(lines, desc, Number(tasa)), [lines, desc, tasa]);
  const save = async () => { if (!cliente.trim()) { setErr(t('customer')); return; } if (!lines.length) { setErr(t('addLine')); return; } try { const id = await r.saveQuote({ cliente: cliente.trim(), lineas: lines, descuento: desc, totales: T, validezDias: Math.max(1, Math.round(Number(val) || 30)), notas }); go('/cotizaciones/' + id); } catch (e: any) { setErr(e.message); } };
  return (<><div className="head"><h1>{t('newQuote')}</h1><Link className="btn sm" to="/cotizaciones">{t('back')}</Link></div>
    <div className="grid g2"><div className="card">
      <div className="field"><label htmlFor="qc">{t('customer')}</label><input id="qc" value={cliente} onChange={(e) => setCliente(e.target.value)} /></div>
      <div className="field"><label htmlFor="qm">{t('fromMeasure')}</label><select id="qm" value={job} onChange={(e) => { setJob(e.target.value); const jj = jobs.find((x) => x.id === e.target.value); if (jj) setLines(lines.map((l) => { if (l.modeloPrecio !== 'porPieCuadrado') return l; const n = { ...l, areaPie2: qAreaPie2(jj.hueco.anchoBot, jj.hueco.altoIzq) }; n.subtotalLinea = qLineSubtotal(n); return n; })); }}><option value="">{t('noMeasure')}</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.customer} · {j.project}</option>)}</select></div>
      <label>{t('addLine')}</label><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>{items.map((i) => <button key={i.id} className="btn sm" onClick={() => add(i)}>{i.nombre}</button>)}</div>
      <div className="pair"><div className="field"><label htmlFor="qd">{t('discount')}</label><select id="qd" value={desc.tipo} onChange={(e) => setDesc({ tipo: e.target.value as any, valor: desc.valor })}><option value="ninguno">{t('none2')}</option><option value="porciento">{t('pct')}</option><option value="monto">{t('amt')}</option></select></div>
        <div className="field"><label htmlFor="qv">&nbsp;</label><input id="qv" inputMode="decimal" disabled={desc.tipo === 'ninguno'} value={desc.valor || ''} onChange={(e) => setDesc({ ...desc, valor: Number(e.target.value) || 0 })} /></div></div>
      <div className="pair"><div className="field"><label htmlFor="qt">{t('rate')}</label><input id="qt" inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} /></div><div className="field"><label htmlFor="qe">{t('valid')}</label><input id="qe" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} /></div></div>
      <div className="field"><label htmlFor="qn">{t('notes')}</label><textarea id="qn" style={{ minHeight: 70, padding: 12 }} value={notas} onChange={(e) => setNotas(e.target.value)} /></div></div>
      <div className="card"><table><thead><tr><th>{t('item')}</th><th>{t('qty')}</th><th>{t('amount')}</th></tr></thead><tbody>
        {lines.map((l, i) => <tr key={l.lineaId}><td>{l.descripcion}{l.modeloPrecio === 'porPieCuadrado' && <div><label className="dim" style={{ margin: 0 }}>pie²</label><input style={{ minHeight: 34, width: 90 }} inputMode="decimal" value={l.areaPie2 ?? ''} onChange={(e) => upd(i, { areaPie2: Number(e.target.value) || 0 })} /></div>}</td>
          <td><input style={{ minHeight: 40, width: 64 }} inputMode="decimal" value={l.cantidad} onChange={(e) => upd(i, { cantidad: Number(e.target.value) || 0 })} aria-label={t('qty')} /></td><td className="mono nw">{money(l.subtotalLinea ?? 0)}</td></tr>)}</tbody></table>
        <div className="tot"><span>{t('subtotal')}</span><b className="mono">{money(T.subtotal)}</b></div>{T.descuento > 0 && <div className="tot"><span>{t('discount')}</span><b className="mono">−{money(T.descuento)}</b></div>}
        <div className="tot"><span>{t('ivu')}</span><b className="mono">{money(T.montoIVU)}</b></div><div className="tot big"><span>{t('total')}</span><b className="mono">{money(T.total)}</b></div>
        {err && <p style={{ color: 'var(--bad)' }}>{err}</p>}<button className="btn pri" style={{ width: '100%', marginTop: 12 }} disabled={!r.writable} onClick={save}>{t('saveQuote')}</button></div></div></>);
}
