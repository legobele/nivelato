import { useState } from 'react';
import { useT } from '../i18n';

// Isolated preview of three legacy pages: apply-pr-company.html (account
// request), blocked.html and geo-blocked.html. Copy and validation rules
// follow the legacy files. Submitting is disabled: the legacy page writes a
// request to Firestore, and the server-side flowGate and IP lookup that pick
// the geo-blocked variant are not part of the preview.
export const gateKind = (hash: string) => (/^#\/solicitar/.test(hash) ? 'apply' : /^#\/sin-acceso/.test(hash) ? 'blocked' : /^#\/bloqueado/.test(hash) ? 'geo' : null);

const GEO: Record<string, { es: [string, string, string]; en: [string, string, string] }> = {
  vpn: { es: ['Acceso restringido', 'Nivelato es de uso exclusivo de Quality Glass en Puerto Rico. Si crees que esto es un error, escríbenos.', 'Volver'], en: ['Access restricted', 'Nivelato is exclusively for Quality Glass in Puerto Rico. If you think this is a mistake, contact us.', 'Back'] },
  'pr-external': { es: ['No disponible en Puerto Rico', 'En PR, Nivelato es exclusivo de Quality Glass. Usa el acceso de QGI.', 'Ir al acceso de QGI'], en: ['Not available in Puerto Rico', 'In PR, Nivelato is exclusive to Quality Glass. Use the QGI login.', 'Go to the QGI login'] },
  review: { es: ['Cuenta en revisión', 'Estamos verificando tu acceso. Te avisaremos pronto.', 'Volver'], en: ['Account under review', "We're verifying your access. We'll notify you soon.", 'Back'] },
  billing: { es: ['Suscripción vencida', 'Tu suscripción está vencida. Habla con el dueño del taller para reactivarla.', 'Volver'], en: ['Subscription lapsed', 'Your subscription has lapsed. Ask the shop owner to reactivate it.', 'Back'] },
};

const wrap: any = { minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' };

function Blocked() {
  const { lang } = useT();
  const es = lang === 'es';
  return <div style={wrap}><div style={{ maxWidth: 360 }}>
    <h2>{es ? 'Sin acceso al panel' : 'No access to the dashboard'}</h2>
    <p className="dim" style={{ margin: '12px 0 20px', lineHeight: 1.6 }}>{es ? 'No tienes permisos para ver el panel de administración. Si crees que esto es un error, contacta al administrador del taller.' : "You don't have permission to view the admin dashboard. If you think this is a mistake, contact the shop administrator."}</p>
    <a className="btn pri" href="#/">{es ? 'Volver a la app' : 'Back to the app'}</a></div></div>;
}

function Geo() {
  const { lang } = useT();
  const q = (location.hash.split('?')[1] || '');
  const reason = new URLSearchParams(q).get('reason') || '';
  const v = (GEO[reason] || GEO.vpn)[lang];
  return <div style={wrap}><div style={{ maxWidth: 360 }}>
    <h2>{v[0]}</h2><p className="dim" style={{ margin: '12px 0 20px', lineHeight: 1.6 }}>{v[1]}</p>
    <a className="btn pri" href="#/">{v[2]}</a>
    <p className="dim" style={{ marginTop: 16, fontSize: 12 }}>{lang === 'es' ? 'Vista previa: la variante sale del parámetro reason (vpn, pr-external, review, billing). En producción la elige el servidor.' : 'Preview: the variant comes from the reason parameter (vpn, pr-external, review, billing). In production the server picks it.'}</p></div></div>;
}

import { validateApply, type F } from '../core/apply';
const SEL: Record<string, [string, string][]> = {
  volume: [['lt10week', 'Menos de 10 por semana'], ['10to30week', '10 a 30 por semana'], ['30to100week', '30 a 100 por semana'], ['gt100week', 'Más de 100 por semana']],
  timeline: [['asap', 'Inmediatamente'], ['1to3', 'En 1 a 3 meses'], ['3to6', 'En 3 a 6 meses'], ['exploring', 'Solo estamos explorando']],
  hearAbout: [['referral', 'Recomendación de otra empresa'], ['search', 'Búsqueda en internet'], ['social', 'Redes sociales'], ['qgc', 'Recomendación de otro taller de cristales'], ['other', 'Otro']],
};
const BIZ: [string, string, string][] = [['glass', 'Taller de cristales', 'Instalación, fabricación o venta de cristales y aluminio'], ['contractor', 'Contratista general', 'Construcción, remodelación o proyectos generales'], ['other', 'Otro oficio', 'Especifica abajo']];
const TIER: [string, string, string][] = [['pro', 'Pro', 'Dashboard limitado: cada técnico ve sus propias medidas'], ['ultra', 'Ultra', 'Dashboard completo: todas las medidas, cotizaciones y equipo']];

function Apply() {
  const { t } = useT();
  const [f, setF] = useState<F>({}); const [err, setErr] = useState<Record<string, string>>({}); const [tried, setTried] = useState(false);
  const set = (k: string, v: string) => { const n = { ...f, [k]: v }; setF(n); if (tried) setErr(validateApply(n)); };
  const Field = ({ k, label, req = true, type = 'text', ph, max }: any) => <div className="field"><label htmlFor={k}>{label}{req && ' *'}</label>
    <input id={k} type={type} maxLength={max} placeholder={ph} value={f[k] || ''} onChange={(e) => set(k, e.target.value)} aria-invalid={!!err[k]} />
    {err[k] && <div role="alert" style={{ color: '#ff9a9e', fontSize: 13, marginTop: 4 }}>{err[k]}</div>}</div>;
  const Sel = ({ k, label }: any) => <div className="field"><label htmlFor={k}>{label} *</label><select id={k} value={f[k] || ''} onChange={(e) => set(k, e.target.value)}><option value="">Selecciona…</option>{SEL[k].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    {err[k] && <div role="alert" style={{ color: '#ff9a9e', fontSize: 13, marginTop: 4 }}>{err[k]}</div>}</div>;
  const Radios = ({ k, label, opts }: any) => <div className="field"><label>{label} *</label>{opts.map(([v, l, d]: string[]) => <label key={v} className="card radio-card" style={{ textAlign: "left", display: 'flex', gap: 10, margin: '6px 0', cursor: 'pointer', borderColor: f[k] === v ? 'var(--tx)' : undefined }}><input type="radio" name={k} checked={f[k] === v} onChange={() => set(k, v)} /><span><b>{l}</b><br /><span className="dim">{d}</span></span></label>)}
    {err[k] && <div role="alert" style={{ color: '#ff9a9e', fontSize: 13 }}>{err[k]}</div>}</div>;
  const submit = (e: any) => { e.preventDefault(); setTried(true); setErr(validateApply(f)); };
  const ok = tried && Object.keys(err).length === 0;
  return <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 18px 60px' }}>
    <h1>Solicita una cuenta para tu empresa</h1>
    <p className="dim" style={{ margin: '10px 0 18px', lineHeight: 1.6 }}>Actualmente las cuentas de empresa en Puerto Rico se activan por solicitud. Completa el formulario y evaluamos tu caso. Si todo está en orden, te contactamos con los próximos pasos.</p>
    <div className="banner">{t('unavailable')} Las solicitudes no se envían desde esta vista previa.</div>
    <form onSubmit={submit} noValidate>
      <fieldset style={{ border: 0, padding: 0 }}><legend><h3>Empresa</h3></legend>
        <Field k="legalName" label="Nombre legal de la empresa" max={160} />
        <Field k="dba" label="Nombre comercial (DBA)" req={false} max={160} ph="Si opera con un nombre distinto al legal" />
        <Radios k="bizType" label="Tipo de negocio" opts={BIZ} />
        {f.bizType === 'other' && <Field k="bizTypeOther" label="Especifica el oficio" max={120} />}
        <Field k="addrStreet" label="Dirección física - Calle" max={160} />
        <div className="g2"><Field k="addrCity" label="Ciudad / Pueblo" max={80} /><Field k="addrZip" label="Código postal" max={10} ph="00901" /></div></fieldset>
      <fieldset style={{ border: 0, padding: 0 }}><legend><h3>Contacto</h3></legend>
        <Field k="contactName" label="Nombre completo" max={120} />
        <div className="g2"><Field k="contactRole" label="Puesto / Cargo" max={80} ph="Ej. Dueño, Gerente, Estimador" /><Field k="contactPhone" label="Teléfono" type="tel" max={20} ph="787-555-0100" /></div>
        <Field k="contactEmail" label="Correo electrónico" type="email" max={160} /></fieldset>
      <fieldset style={{ border: 0, padding: 0 }}><legend><h3>Operación</h3></legend>
        <div className="g2"><Field k="employees" label="Total de empleados" type="number" /><Field k="technicians" label="Técnicos de campo que usarían la app" type="number" /></div>
        <div className="field"><label htmlFor="currentProcess">¿Cómo miden actualmente? *</label><textarea id="currentProcess" maxLength={2000} placeholder="Ej. Cinta métrica y papel, luego pasamos las medidas a Excel..." value={f.currentProcess || ''} onChange={(e) => set('currentProcess', e.target.value)} />{err.currentProcess && <div role="alert" style={{ color: '#ff9a9e', fontSize: 13 }}>{err.currentProcess}</div>}</div>
        <Sel k="volume" label="Volumen estimado de medidas" />
        <Radios k="tier" label="Plan de interés" opts={TIER} />
        <Sel k="timeline" label="¿Cuán pronto lo necesitan?" /><Sel k="hearAbout" label="¿Cómo se enteraron de Nivelato?" />
        <div className="field"><label htmlFor="notes">Notas adicionales</label><textarea id="notes" maxLength={2000} placeholder="Cualquier otra cosa que debamos saber…" value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></div></fieldset>
      <button type="submit" className="btn pri">Enviar solicitud</button>
      {ok && <p role="status" className="dim" style={{ marginTop: 12 }}>El formulario es válido. {t('unavailable')} No se envió nada.</p>}
      <p className="dim" style={{ marginTop: 14, fontSize: 13 }}>Al enviar aceptas que usemos estos datos para evaluar tu solicitud. Revisamos cada solicitud manualmente. Te contactamos al correo o teléfono indicado.</p>
    </form></div>;
}

export function Gate({ kind }: { kind: 'apply' | 'blocked' | 'geo' }) { return kind === 'apply' ? <Apply /> : kind === 'blocked' ? <Blocked /> : <Geo />; }
