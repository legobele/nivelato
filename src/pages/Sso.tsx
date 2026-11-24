import { useEffect, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../data/live';
import { useT } from '../i18n';
import { parseSso, redirectUriIsAllowed, completeHandoff } from '../core/sso';
export function Sso() {
  const { t } = useT(); const [P] = useState(() => parseSso(location.search, location.hash));
  const [state, setState] = useState<'idle' | 'working' | 'failed'>(P.ctoken ? 'working' : 'idle');
  useEffect(() => {
    if (!P.ctoken) return;
    const hp = P;
    history.replaceState(null, '', location.pathname + '#/sso'); // the token never stays in the address bar
    completeHandoff(hp, { signInWithCustomToken: async (tk) => { if (!auth) throw new Error('no auth'); return signInWithCustomToken(auth, tk); }, navigate: () => { location.hash = '#/'; location.reload(); } }).then((r) => { if (r === 'failed') setState('failed'); }); // preview: lands in the React app, not legacy /dashboard.html
  }, []);
  let msg = P.ctoken ? (state === 'failed' ? t('ssoFailed') : t('ssoCompleting')) : t('ssoRequestedBy') + ' ' + P.clientId;
  let err = '';
  if (!P.ctoken) { if (!P.redirectUri) err = t('ssoMissing'); else if (!redirectUriIsAllowed(P.redirectUri)) err = t('ssoDenied'); }
  return (<div className="login"><div className="card" style={{ textAlign: 'center' }}><h1 style={{ marginBottom: 16 }}>Nivelato</h1>
    <p style={{ marginBottom: 16, wordBreak: 'break-word' }}>{msg}</p>
    {err && <p style={{ color: 'var(--bad)' }} role="alert">{err}</p>}
    {!P.ctoken && !err && <><button className="btn pri" style={{ width: '100%' }} disabled>{t('ssoContinue')}</button><p className="dim" style={{ marginTop: 12 }}>{t('ssoPreview')}</p></>}
    {state === 'failed' && <a className="btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} href="#/">{t('ssoBack')}</a>}
    </div></div>);
}
