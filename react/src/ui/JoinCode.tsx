import { useState } from 'react';
import { useRepo } from '../App';
import { useT } from '../i18n';
export function JoinCode() {
  const r = useRepo(); const { t } = useT(); const [done, setDone] = useState(false);
  if (!r.can('userManagement') || !r.joinCode) return null;
  const copy = async () => {
    let ok = false; try { await navigator.clipboard.writeText(r.joinCode!); ok = true; } catch { const ta = document.createElement('textarea'); ta.value = r.joinCode!; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch {} ta.remove(); }
    if (ok) { setDone(true); setTimeout(() => setDone(false), 1500); }
  };
  return (<div className="card join-code" style={{ marginBottom: 16 }}><div className="row" style={{ border: 0 }}><div className="t"><b>{t('joinCode')}</b><span className="mono join-code-code" style={{ fontSize: 20, letterSpacing: 2 }}>{r.joinCode}</span></div><button className="btn sm" onClick={copy}>{done ? t('copied') : t('copy')}</button></div><p className="dim" style={{ margin: '0 8px 8px' }}>{t('joinNote')}</p></div>);
}
