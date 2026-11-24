import { useCallback, useEffect, useState } from 'react';
import { useRepo } from '../App';
import { useT } from '../i18n';
import { qrView, type QrToken, type QrView } from '../core/workshopQr';

export function WorkshopQr() {
  const r = useRepo(); const { t } = useT();
  const key = 'niv_workshop_qr_' + r.me.orgId;
  const [view, setView] = useState<QrView | null>(null); const [tok, setTok] = useState<QrToken | null>(null); const [msg, setMsg] = useState(''); const [copied, setCopied] = useState(false);
  const read = (): QrToken | null => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
  const check = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try { const st = await r.workshopQr.status(); const s = read(); const v = qrView(st, s); setView(v); setTok(v === 'ours' ? s : null); } catch { /* transient: keep what is shown */ }
  }, [r]);
  useEffect(() => { check(); const i = setInterval(check, 20000); return () => clearInterval(i); }, [check]);
  if (!r.can('userManagement') || !view) return null;
  const mint = async () => { setMsg(''); try { const d = await r.workshopQr.mint(); try { sessionStorage.setItem(key, JSON.stringify(d)); } catch { /* ignore */ } setTok(d); setView('ours'); } catch (e: any) { setMsg(t('qrFail') + ' ' + (e?.message || '')); } };
  const ro = !r.writable; const when = tok?.expiresAt ? new Date(tok.expiresAt).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-US' : 'es-PR') : '';
  const note = view === 'none' ? t('qrNone') : view === 'elsewhere' ? t('qrElsewhere') : t('qrSpent');
  return (<div className="card workshop-qr" style={{ marginBottom: 16 }}>
    <div className="tile" style={{ display: 'grid', gap: 10, justifyItems: 'center', textAlign: 'center' }}>
      {view === 'ours' && tok ? <>
        {tok.qrSvg ? <div className="tile-qr" style={{ width: 200, background: '#fff', padding: 8, borderRadius: 8 }} role="img" aria-label="QR" dangerouslySetInnerHTML={{ __html: tok.qrSvg }} /> : <p className="mono" style={{ wordBreak: 'break-all' }}>{tok.url}</p>}
        <b>{t('qrHead')}</b><span className="dim">{t('qrOnce')}</span><span className="dim">{t('qrNoEmail')}</span>{when && <span className="dim">{t('qrExpires')} {when}</span>}
        <div style={{ display: 'flex', gap: 8 }}><button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(tok.url); setCopied(true); } catch { /* ignore */ } }}>{copied ? t('qrCopied') : t('qrCopy')}</button><button className="btn sm" disabled={ro} onClick={mint}>{t('qrAnother')}</button></div>
      </> : <>
        <div aria-hidden style={{ width: 160, height: 160, border: '2px dashed var(--line, #444)', borderRadius: 8 }} />
        <span className="dim">{note}</span>
        <button className="btn pri sm" disabled={ro} onClick={mint}>{view === 'none' ? t('qrGen') : t('qrAnother')}</button>
      </>}
      {ro && <span className="dim">{t('qrUnavailable')}</span>}
      {msg && <span role="alert" className="err">{msg}</span>}
    </div></div>);
}
