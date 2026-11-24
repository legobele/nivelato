import { Photo } from './pages/Photo';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import type { Repo } from './data/types';
import { demoRepo } from './data/demo';
import { liveEnabled, liveRepo, logOut, watchAuth } from './data/live';
import { LangProvider, useT } from './i18n';
import { IBell, IHome, IRuler, IUsers, ITag, ICog } from './ui/Icons';
import { Sso } from './pages/Sso';
import { isSsoUrl } from './core/sso';
import { Gate, gateKind } from './pages/Gate';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Measures, MeasureDetail } from './pages/Measures';
import { NewMeasurement } from './pages/NewMeasurement';
import { Customers, CustomerDetail } from './pages/Customers';
import { QuoteList, QuoteDetail, QuoteBuilder, QuotePrint } from './pages/Quotes';
import { Projects, ProjectDetail, Notifications } from './pages/More';
import { Team, Prices, SettingsPage } from './pages/Admin';

const Ctx = createContext<Repo>(null as any);
export const useRepo = () => useContext(Ctx);
const nav = [
  { to: '/', k: 'panel', I: IHome, end: true }, { to: '/medidas', k: 'measures', I: IRuler },
  { to: '/clientes', k: 'customers', I: IUsers }, { to: '/proyectos', k: 'projects', I: IRuler }, { to: '/cotizaciones', k: 'quotes', I: ITag, perm: 'quote' }, { to: '/notificaciones', k: 'notifications', I: IBell }, { to: '/precios', k: 'prices', I: ITag, perm: 'managePriceList' }, { to: '/ajustes', k: 'settings', I: ICog }] as const;

export function App() { return <LangProvider><Inner /></LangProvider>; }
function Inner() {
  const { t } = useT(); const sso = isSsoUrl(location.search, location.hash); const [, bump] = useState(0);
  useEffect(() => { const h = () => bump((n) => n + 1); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [booting, setBooting] = useState(true);
  const demo = new URLSearchParams(location.search).has('demo') || sessionStorage.getItem('niv-demo') === '1';
  useEffect(() => {
    if (demo) { sessionStorage.setItem('niv-demo', '1'); setRepo(demoRepo()); setBooting(false); return; }
    return watchAuth(async (u) => { setRepo(u ? await liveRepo(u) : null); setBooting(false); });
  }, [demo]);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => { const a = () => setOnline(true), b = () => setOnline(false); addEventListener('online', a); addEventListener('offline', b); return () => { removeEventListener('online', a); removeEventListener('offline', b); }; }, []);
  const out = useMemo(() => async () => { sessionStorage.removeItem('niv-demo'); if (liveEnabled) await logOut().catch(() => {}); setRepo(null); }, []);
  if (sso) return <Sso />;
  const gk = gateKind(location.hash); if (gk) return <Gate kind={gk} />;
  if (booting) return null;
  if (!repo) return <Login onDemo={() => { sessionStorage.setItem('niv-demo', '1'); setRepo(demoRepo()); }} live={liveEnabled} />;
  const items = nav.filter((n: any) => !n.perm || (n.perm === 'quote' ? repo.can('createQuotes') || repo.can('approveQuotes') : repo.can(n.perm)));
  return (
    <Ctx.Provider value={repo}>
      <div className="shell">
        <aside className="side">
          <div className="brand">Nivelato<small>{repo.orgName}</small></div>
          {items.map(({ to, k, I, ...r }) => <NavLink key={to} to={to} end={(r as any).end} className={({ isActive }) => 'nav' + (isActive ? ' on' : '')}><I />{t(k)}</NavLink>)}
          <div className="grow" />
          <button className="nav" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={out}>{t('logout')}</button>
        </aside>
        <main className="main">
          {!online && <div className="banner" role="status">{t('offline')}</div>}
          {repo.mode === 'demo' && <div className="banner">{t('demoBanner')}</div>}
          {!repo.writable && repo.mode === 'live' && <div className="banner">{t('readOnly')}</div>}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/medidas" element={<Measures />} />
            <Route path="/medidas/:id" element={<MeasureDetail />} />
            <Route path="/foto" element={<Photo />} />
            <Route path="/nueva" element={<NewMeasurement />} />
            <Route path="/clientes" element={<Customers />} />
            <Route path="/proyectos" element={<Projects />} /><Route path="/proyectos/:id" element={<ProjectDetail />} />
            <Route path="/cotizaciones" element={<QuoteList />} /><Route path="/cotizaciones/nueva" element={<QuoteBuilder />} /><Route path="/cotizaciones/:id/imprimir" element={<QuotePrint />} /><Route path="/cotizaciones/:id" element={<QuoteDetail />} />
            <Route path="/notificaciones" element={<Notifications />} />
            <Route path="/clientes/:id" element={<CustomerDetail />} />
            <Route path="/precios" element={repo.can('managePriceList') ? <Prices /> : <Navigate to="/" />} />
            <Route path="/equipo" element={repo.can('userManagement') ? <Team /> : <Navigate to="/ajustes" />} />
            <Route path="/ajustes" element={<SettingsPage onLogout={out} refresh={() => bump((n) => n + 1)} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <nav className="tabs">{items.filter((n) => ['/', '/medidas', '/clientes', '/notificaciones', '/ajustes'].includes(n.to)).map(({ to, k, I, ...r }) => <NavLink key={to} to={to} end={(r as any).end} className={({ isActive }) => (isActive ? 'on' : '')}><I />{t(k)}</NavLink>)}</nav>
      </div>
    </Ctx.Provider>
  );
}
