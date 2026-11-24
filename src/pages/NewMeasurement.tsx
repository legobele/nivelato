import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepo } from '../App';
import { useT, type K } from '../i18n';
import { Graph } from '../ui/Graph';
import { GraphEntry, type ChipKey } from '../ui/GraphEntry';
import { OFF_KEYS, PAIRS, SIXTEENTHS, derivedDims, fromNumber, offsetResult, toFracStr, wfError, wfTotal, wfTyped, type WF, type WallKey } from '../core/leveling';

type Key = ChipKey;
const E: WF = { whole: '', frac: '0' };
const errKey = (e: 'err' | 'errWhole' | 'errMax' | null): K => (e === 'errWhole' ? 'offErrWhole' : e === 'errMax' ? 'offErrMax' : 'offErr');

function WFField({ label, v, on, id, autoFocus }: { label: string; v: WF; on: (v: WF) => void; id: string; autoFocus?: boolean }) {
  const { t } = useT();
  return <div className="field"><label htmlFor={id}>{label}</label><div className="wf">
    <input id={id} type="number" min={0} step={1} inputMode="numeric" placeholder={t('whole')} value={v.whole} autoFocus={autoFocus} onChange={(e) => on({ ...v, whole: e.target.value })} />
    <select aria-label={t('fraction')} value={v.frac} onChange={(e) => on({ ...v, frac: e.target.value })}>{SIXTEENTHS.map((f, i) => <option key={f} value={f}>{i === 0 ? '-' : fracLabel(i)}</option>)}</select></div></div>;
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const fracLabel = (n: number) => `${n / gcd(n, 16)}/${16 / gcd(n, 16)}`;

export function NewMeasurement() {
  const repo = useRepo(); const go = useNavigate(); const { t } = useT();
  const canCreate = repo.can('createMeasurements');
  const [mode, setMode] = useState<'direct' | 'guided'>('direct');
  const [step, setStep] = useState(0); // guided: 0 details 1 base 2-5 walls 6 summary
  const [info, setInfo] = useState({ customer: '', project: '', location: '', area: '' });
  const [base, setBase] = useState<{ W: WF; H: WF }>({ W: E, H: E });
  const [rd, setRd] = useState<Record<WallKey, { a: WF; b: WF }>>({ L: { a: E, b: E }, R: { a: E, b: E }, T: { a: E, b: E }, B: { a: E, b: E } });
  const [edit, setEdit] = useState<Key | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<{ decided: boolean; url: string | null }>({ decided: false, url: null });
  const svgRef = useRef<SVGSVGElement>(null); const sheetRef = useRef<HTMLDivElement>(null);

  const w = wfTotal(base.W), h = wfTotal(base.H);
  const baseOk = !wfError(base.W, false) && !wfError(base.H, false);
  const wallOk = (k: WallKey) => !wfError(rd[k].a, true) && !wfError(rd[k].b, true);
  const allOk = baseOk && OFF_KEYS.every(wallOk);
  const off = useMemo(() => Object.fromEntries(OFF_KEYS.map((k) => [k, { a: wfTotal(rd[k].a), b: wfTotal(rd[k].b) }])) as any, [rd]);
  const d = allOk ? derivedDims({ w, h }, off) : { anchoTop: w, altoDer: h };
  const g = { w: w || 36, h: h || 84, anchoTop: baseOk ? d.anchoTop : w || 36, altoDer: baseOk ? d.altoDer : h || 84, off: Object.fromEntries(OFF_KEYS.filter(wallOk).map((k) => [k, off[k]])) };
  const infoOk = info.customer.trim() !== '' && info.location.trim() !== '';
  const firstErr = () => { for (const k of ['W', 'H'] as const) { if (wfError(base[k], false)) return 'dimsErr' as K; } for (const k of OFF_KEYS) { const e = wfError(rd[k].a, true) || wfError(rd[k].b, true); if (e) return errKey(e); } return null; };

  const setWall = (k: WallKey, which: 'a' | 'b', v: WF) => setRd({ ...rd, [k]: { ...rd[k], [which]: v } });
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const p = (k: WallKey) => { const r = offsetResult(k, off[k])!; return { ...off[k], desnivel: r.raw, desnivelAB: r.signed }; };
      const L = offsetResult('L', off.L)!, R = offsetResult('R', off.R)!, T = offsetResult('T', off.T)!, B = offsetResult('B', off.B)!;
      const id = await repo.saveJob({ ...info, customerId: encodeURIComponent(info.customer), notas: '', annotatedPhoto: photo.url, offsetConvention: 'end-minus-start-v1',
        hueco: { anchoBot: w, altoIzq: h, ...d }, desniveles: { paredIzq: L.label, paredDer: R.label, techo: T.label, piso: B.label },
        paredes: { izq: p('L'), der: p('R'), techo: p('T'), piso: p('B') } });
      go('/medidas/' + id);
    } catch (e: any) { setErr(e.message || ''); }
    setBusy(false);
  };
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && setEdit(null); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, []);
  useEffect(() => {
    const vv = window.visualViewport; const root = document.documentElement;
    const fit = () => {
      if (!edit) { root.style.removeProperty('--sheet-bottom'); root.style.removeProperty('--graph-max-h'); return; }
      const kb = vv ? Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)) : 0;
      root.style.setProperty('--sheet-bottom', kb + 'px');
      const sh = sheetRef.current; const svg = svgRef.current; if (!sh || !svg) return;
      const visH = vv ? vv.height : window.innerHeight; const avail = Math.max(180, visH - sh.offsetHeight - 24);
      if (window.innerWidth <= 820) {
        root.style.setProperty('--graph-max-h', avail + 'px');
        const top = svg.getBoundingClientRect().top + window.scrollY; window.scrollTo({ top: Math.max(0, top - 8), behavior: 'auto' });
      } else root.style.removeProperty('--graph-max-h');
    };
    const id = setTimeout(fit, 60); vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit);
    return () => { clearTimeout(id); vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); if (!edit) { root.style.removeProperty('--sheet-bottom'); root.style.removeProperty('--graph-max-h'); } };
  }, [edit]);
  const pickPhoto = (f?: File | null) => { if (!f) return; const rd_ = new FileReader(); rd_.onload = () => { const img = new Image(); img.onload = () => { const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); setPhoto({ decided: true, url: c.toDataURL('image/jpeg', 0.85) }); }; img.src = String(rd_.result); }; rd_.readAsDataURL(f); };
  const photoBox = <div className="field"><label>{t('photo')}</label>{photo.url && <img src={photo.url} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: 8 }} />}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><label className="btn sm" style={{ margin: 0, cursor: 'pointer', color: 'var(--tx)' }}>{photo.url ? t('changePhoto') : t('addPhoto')}<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} /></label>
      {!photo.decided && <button className="btn sm" onClick={() => setPhoto({ decided: true, url: null })}>{t('skip')}</button>}
      {photo.url && <button className="btn sm" onClick={() => setPhoto({ decided: false, url: null })}>{t('removePhoto')}</button>}</div></div>;
  if (!canCreate) return <p className="dim">{t('noPerm')}</p>;

  const names: Record<WallKey, K> = { L: 'left', R: 'right', T: 'top', B: 'bottom' };
  const editor = () => {
    if (!edit) return null;
    const fields = edit === 'W' || edit === 'H'
      ? [{ id: 'e1', label: t(edit === 'W' ? 'width' : 'height'), v: base[edit], on: (v: WF) => setBase({ ...base, [edit]: v }) }]
      : [{ id: 'e1', label: `${PAIRS[edit][0]} · ${t(edit === 'L' || edit === 'R' ? 'wallA' : 'hA')}`, v: rd[edit].a, on: (v: WF) => setWall(edit, 'a', v) },
         { id: 'e2', label: `${PAIRS[edit][1]} · ${t(edit === 'L' || edit === 'R' ? 'wallB' : 'hB')}`, v: rd[edit].b, on: (v: WF) => setWall(edit, 'b', v) }];
    return <><div className="sheet" ref={sheetRef} role="dialog" aria-label="edit">{fields.map((f, i) => <WFField key={f.id} {...f} autoFocus={i === 0} />)}
      <button className="btn pri" style={{ width: '100%' }} onClick={() => setEdit(null)}>{t('done')}</button></div></>;
  };
  const summaryRows = <table><tbody>{OFF_KEYS.map((k) => <tr key={k}><td>{t(names[k])}</td><td className="mono nw">{wallOk(k) ? offsetResult(k, off[k])!.dlabel : '?'}</td></tr>)}</tbody></table>;
  const detailsForm = <>{(['customer', 'project', 'location', 'area'] as const).map((f) => <div className="field" key={f}><label htmlFor={f}>{t(f)}</label><input id={f} value={info[f]} onChange={(e) => setInfo({ ...info, [f]: e.target.value })} /></div>)}</>;
  const saveBtn = <><div className="dim" style={{ marginBottom: 8 }}>{!repo.writable ? t('readOnly') : firstErr() && t(firstErr()!)}</div>{err && <p style={{ color: 'var(--bad)' }}>{err}</p>}
    <button className="btn pri" style={{ width: '100%' }} disabled={busy || !repo.writable || !allOk || !infoOk || !photo.decided} onClick={save}>{t('save')}</button></>;

  return (<>
    <div className="head"><h1>{t('newMeasure')}</h1>
      <div className="seg" role="tablist"><button role="tab" aria-selected={mode === 'direct'} className={mode === 'direct' ? 'on' : ''} onClick={() => setMode('direct')}>{t('tapGraph')}</button>
        <button role="tab" aria-selected={mode === 'guided'} className={mode === 'guided' ? 'on' : ''} onClick={() => setMode('guided')}>{t('guided')}</button></div></div>
    {mode === 'direct' ? <div className={'grid g2' + (edit ? ' pad-edit' : '')}>
      <div className="card" style={{ order: 2 }}>{detailsForm}{photoBox}<p className="dim">{t('directIntro')}</p>{summaryRows}<div style={{ height: 12 }} />{saveBtn}</div>
      <div className="sticky" style={{ order: 1 }}><GraphEntry ref={svgRef} g={g} base={base} rd={rd} baseOk={baseOk} wallOk={wallOk} active={edit} onPick={(k) => setEdit(k)}
        labels={{ W: t('width'), H: t('height'), L: '', R: '', T: '', B: '' }} />{editor()}</div></div>
    : <div className="grid g2"><div className="card">
        <div className="steps">{[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        {step === 0 && detailsForm}
        {step === 1 && <div className="pair"><WFField id="gw" label={t('width')} v={base.W} on={(v) => setBase({ ...base, W: v })} /><WFField id="gh" label={t('height')} v={base.H} on={(v) => setBase({ ...base, H: v })} /></div>}
        {step >= 2 && step <= 5 && (() => { const k = OFF_KEYS[step - 2]; const v = k === 'L' || k === 'R';
          return <><h2 style={{ marginBottom: 14 }}>{t(names[k])}</h2><div className="pair"><WFField id="ga" label={`${PAIRS[k][0]} · ${t(v ? 'wallA' : 'hA')}`} v={rd[k].a} on={(x) => setWall(k, 'a', x)} /><WFField id="gb" label={`${PAIRS[k][1]} · ${t(v ? 'wallB' : 'hB')}`} v={rd[k].b} on={(x) => setWall(k, 'b', x)} /></div>
            <p className="dim">{t('offset')}: <b className="mono">{wallOk(k) ? offsetResult(k, off[k])!.dlabel : '-'}</b></p></>; })()}
        {step === 6 && <><h2>{info.customer}</h2>{summaryRows}<div style={{ height: 12 }} />{saveBtn}</>}
        {step < 6 && <div style={{ display: 'flex', gap: 10, marginTop: 8 }}><button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>{t('prev')}</button>
          <button className="btn pri" style={{ flex: 1 }} disabled={step === 0 ? !infoOk : step === 1 ? !baseOk : !wallOk(OFF_KEYS[step - 2])} onClick={() => setStep(step + 1)}>{t('next')}</button></div>}
        {step === 6 && <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setStep(5)}>{t('prev')}</button>}</div>
        <Graph g={g} active={step >= 2 && step <= 5 ? OFF_KEYS[step - 2] : null} /></div>}
  </>);
}
export { fromNumber };
