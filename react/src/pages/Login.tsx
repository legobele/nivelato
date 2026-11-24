import { useState } from 'react';
import { useT } from '../i18n';
import { signIn } from '../data/live';
export function Login({ onDemo, live }: { onDemo: () => void; live: boolean }) {
  const { t } = useT(); const [e, setE] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  return (
    <div className="login"><form className="card" onSubmit={async (ev) => { ev.preventDefault(); setBusy(true); setErr(''); try { await signIn(e, p); } catch { setErr(t('badLogin')); } setBusy(false); }}>
      <h1 style={{ marginBottom: 20 }}>Nivelato</h1>
      <div className="field"><label htmlFor="e">{t('email')}</label><input id="e" type="email" autoComplete="username" value={e} onChange={(x) => setE(x.target.value)} disabled={!live} /></div>
      <div className="field"><label htmlFor="p">{t('password')}</label><input id="p" type="password" autoComplete="current-password" value={p} onChange={(x) => setP(x.target.value)} disabled={!live} /></div>
      {err && <p style={{ color: 'var(--bad)' }}>{err}</p>}
      <button className="btn pri" style={{ width: '100%' }} disabled={!live || busy}>{t('enter')}</button>
      <button type="button" className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onDemo}>{t('demoBtn')}</button>
      {!live && <p className="dim">Sin configuración de Firebase en esta compilación.</p>}
    </form></div>
  );
}
