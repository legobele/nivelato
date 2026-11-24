import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRepo } from '../App';
import { useT } from '../i18n';
import { mountPhotoEditor } from '../core/photoEditor';
import markup from '../ui/photoMarkup';
import '../photo.css';
import { toFracStr } from '../core/leveling';
import type { Job } from '../data/types';

const DICT = {
  es: { title: 'Foto con medidas', subDefault: 'Alinea el marco con la abertura', resetFrame: 'Marco', usePhoto: 'Usar esta foto', emptyText: 'Agrega una foto del hueco para marcar las medidas.', takePhoto: 'Tomar foto', fromGallery: 'Elegir de galería', toolLine: 'Línea', toolArrow: 'Flecha', toolText: 'Texto', undo: 'Deshacer', textTitle: 'Texto', labelInputLabel: 'Texto de la etiqueta', cancel: 'Cancelar', add: 'Agregar' },
  en: { title: 'Photo with measurements', subDefault: 'Align the frame with the opening', resetFrame: 'Frame', usePhoto: 'Use this photo', emptyText: 'Add a photo of the opening to mark the measurements.', takePhoto: 'Take photo', fromGallery: 'Choose from gallery', toolLine: 'Line', toolArrow: 'Arrow', toolText: 'Text', undo: 'Undo', textTitle: 'Text', labelInputLabel: 'Label text', cancel: 'Cancel', add: 'Add' },
} as const;

/** Fake sample imagery for the demo: a drawn window opening, no real photo. */
function sampleDataUrl(): string {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const g = c.getContext('2d')!;
  g.fillStyle = '#8b7d6b'; g.fillRect(0, 0, 1200, 900);
  for (let i = 0; i < 900; i += 60) { g.fillStyle = i % 120 ? '#85776a' : '#92846f'; g.fillRect(0, i, 1200, 60); }
  g.fillStyle = '#d9e6ee'; g.fillRect(380, 170, 440, 560);
  g.strokeStyle = '#4a4a4a'; g.lineWidth = 14; g.strokeRect(380, 170, 440, 560);
  g.lineWidth = 8; g.beginPath(); g.moveTo(600, 170); g.lineTo(600, 730); g.moveTo(380, 450); g.lineTo(820, 450); g.stroke();
  return c.toDataURL('image/jpeg', 0.9);
}

export function Photo() {
  const r = useRepo(); const { t } = useT(); const nav = useNavigate(); const [sp] = useSearchParams();
  const ref = useRef<HTMLDivElement>(null); const h = useRef<ReturnType<typeof mountPhotoEditor> | null>(null);
  const [job, setJob] = useState<Job | null>(null); const [msg, setMsg] = useState('');
  const lang = (document.documentElement.lang === 'en' ? 'en' : 'es') as 'es' | 'en'; const jid = sp.get('job');
  useEffect(() => { if (jid) r.job(jid).then((j) => setJob(j)); }, [r, jid]);
  useEffect(() => {
    const root = ref.current!; const d = DICT[lang];
    root.querySelectorAll('[data-i18n]').forEach((el) => { const k = el.getAttribute('data-i18n') as keyof typeof d; if (d[k]) el.textContent = d[k]; });
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => { const k = el.getAttribute('data-i18n-ph') as keyof typeof d; if (d[k]) el.setAttribute('placeholder', d[k]); });
    const hd = mountPhotoEditor({ lang, onDone: async (dataUrl, annotations) => {
      try { if (!r.writable || !jid) { const a = document.createElement('a'); a.href = dataUrl; a.download = 'nivelato-medidas.jpg'; a.click(); setMsg(t('photoDownloaded')); } else { await r.setAnnotatedPhoto(jid, dataUrl, annotations, h.current?.original() ?? null); nav('/medidas/' + jid); return; } } catch (e: any) { setMsg(e.message); }
      h.current?.ack();
    } });
    h.current = hd; (window as any).__photo = hd; return () => hd.destroy();
  }, [lang]); // eslint-disable-line
  useEffect(() => { if (!job || !h.current) return; const w = job.paredes;
    h.current.setMeasurements({ anchoBot: job.hueco.anchoBot, anchoTop: job.hueco.anchoTop, altoIzq: job.hueco.altoIzq, altoDer: job.hueco.altoDer, paredIzq: job.desniveles.paredIzq, paredDer: job.desniveles.paredDer, techo: job.desniveles.techo, piso: job.desniveles.piso, paredIzqRaw: w.izq.desnivel, paredDerRaw: w.der.desnivel, techoRaw: w.techo.desnivel, pisoRaw: w.piso.desnivel, customer: job.customer, offsetSigned: Object.fromEntries((['izq', 'der', 'techo', 'piso'] as const).map((k, i) => [['paredIzq', 'paredDer', 'techo', 'piso'][i], (w[k] as any).desnivelAB ? (((w[k] as any).desnivelAB > 0 ? '+' : '-') + toFracStr(Math.abs((w[k] as any).desnivelAB))) : ''])), annotations: (job as any).annotations });
    { const src = job.photo || (job as any).originalPhoto; if (src) h.current.loadDataUrl(src); } }, [job]);
  return (<div className="photo-root"><div ref={ref} dangerouslySetInnerHTML={{ __html: markup }} style={{ height: '100%' }} />
    <div className="photo-float">
      {r.mode === 'demo' && <button className="header-btn" onClick={() => h.current?.loadDataUrl(sampleDataUrl())}>{t('sampleImage')}</button>}
      <button className="header-btn" onClick={() => nav(jid ? '/medidas/' + jid : -1 as any)}>{t('back')}</button></div>
    {msg && <div role="status" style={{ position: 'fixed', bottom: 56, left: 0, right: 0, textAlign: 'center', zIndex: 60, color: '#fff' }}>{msg}</div>}</div>);
}
