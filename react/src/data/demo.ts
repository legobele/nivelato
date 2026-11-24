import type { Repo, Job, Customer } from './types';
import { qLineSubtotal, qTotals, type QLine } from '../core/quotes';
import type { Quote, Notif, PriceItem } from './types';
import { makePermChecker } from '../core/permissions';
import { offsetResult, derivedDims, OFF_KEYS, type WallKey, type Reading } from '../core/leveling';

function mk(id: string, customer: string, project: string, location: string, area: string, w: number, h: number, off: Record<WallKey, Reading>, daysAgo: number, uid = 'u3'): Job {
  const r = Object.fromEntries(OFF_KEYS.map((k) => [k, offsetResult(k, off[k])!])) as Record<WallKey, ReturnType<typeof offsetResult> & {}>;
  const d = derivedDims({ w, h }, off);
  const p = (k: WallKey) => ({ ...off[k], desnivel: r[k].raw, desnivelAB: r[k].signed });
  return { id, customer, customerId: encodeURIComponent(customer), project, location, area, status: 'complete', installerUid: uid, installerName: uid === 'u3' ? 'Medidor demo' : 'Otro medidor', createdAt: Date.now() - daysAgo * 864e5, notas: '',
    hueco: { anchoBot: w, altoIzq: h, ...d },
    desniveles: { paredIzq: r.L.label, paredDer: r.R.label, techo: r.T.label, piso: r.B.label },
    paredes: { izq: p('L'), der: p('R'), techo: p('T'), piso: p('B') }, offsetConvention: 'end-minus-start-v1' };
}
const seed: Job[] = [
  mk('j1', 'Residencia Ortiz', 'Ventanas sala', 'Dorado', 'Sala', 72, 60, { L: { a: 3, b: 3.25 }, R: { a: 2, b: 2 }, T: { a: 4, b: 3.5 }, B: { a: 1, b: 1 } }, 0),
  mk('j2', 'Residencia Ortiz', 'Puerta principal', 'Dorado', 'Entrada', 36, 84, { L: { a: 10, b: 12 }, R: { a: 5, b: 4.5 }, T: { a: 6, b: 6 }, B: { a: 2, b: 2.125 } }, 1),
  mk('j3', 'Farmacia Central', 'Vitrina frontal', 'Bayamón', 'Fachada', 120, 96, { L: { a: 1.5, b: 1.5 }, R: { a: 3, b: 2.75 }, T: { a: 2, b: 2.25 }, B: { a: 0.5, b: 0.5 } }, 3, 'u9'),
  mk('j4', 'Condominio Vista Mar', 'Baño 4B', 'Carolina', 'Baño', 30, 48, { L: { a: 2, b: 2.5 }, R: { a: 2, b: 2 }, T: { a: 1, b: 1 }, B: { a: 3, b: 3.25 } }, 6),
];
const L = (d: string, c: number, p: number, m: 'porUnidad' | 'porPieCuadrado', a?: number): QLine => { const l: QLine = { lineaId: Math.random().toString(36).slice(2, 8), descripcion: d, cantidad: c, precioUnitario: p, modeloPrecio: m, areaPie2: a }; l.subtotalLinea = qLineSubtotal(l); return l; };
const mkq = (id: string, numero: string, nombre: string, estado: Quote['estado'], lineas: QLine[], days: number): Quote => ({ id, numero, cliente: { nombre, telefono: '787-555-0100', email: 'cliente@example.test', direccion: 'Calle Demo 12, Dorado' }, empresa: { nombre: 'Taller Demo', direccion: 'Carr. 693, Dorado', telefono: '787-555-0142', email: 'taller@example.test' }, estado, lineas, descuento: { tipo: 'ninguno', valor: 0 }, totales: qTotals(lineas, null, 0.115), validezDias: 30, notas: '', creadoEl: Date.now() - days * 864e5, emitidaEl: Date.now() - days * 864e5, validaHasta: Date.now() - days * 864e5 + 30 * 864e5, version: 1 });
let prices: PriceItem[] = [
  { id: 'p1', nombre: 'Vidrio templado 1/4"', unidad: 'pie2', precio: 14.5, activo: true, tipo: 'vidrio', modeloPrecio: 'porPieCuadrado', grosor: '1/4' },
  { id: 'p2', nombre: 'Marco aluminio', unidad: 'pieza', precio: 6.25, activo: true, tipo: 'herraje', modeloPrecio: 'porUnidad' },
  { id: 's1', nombre: 'Sacabocados estándar', unidad: 'unidad', precio: 18, activo: true, tipo: 'sacabocados', modeloPrecio: 'porUnidad' },
  { id: 'b1', nombre: 'Barreno', unidad: 'unidad', precio: 7.5, activo: true, tipo: 'barreno', modeloPrecio: 'porUnidad' },
  { id: 'p3', nombre: 'Instalación', unidad: 'hora', precio: 45, activo: true, tipo: 'manoDeObra', modeloPrecio: 'porUnidad' }];
export function demoRepo(): Repo {
  const team: import('./types').Member[] = [
      { uid: 'u1', name: 'Dueño demo', email: 'owner@example.test', role: 'owner' },
      { uid: 'u2', name: 'Supervisor demo', email: 'sup@example.test', role: 'supervisor' },
      { uid: 'u3', name: 'Medidor demo', email: 'med@example.test', role: 'medidor' },
      { uid: 'u5', name: 'Cotizador demo', email: 'quote@example.test', role: 'cotizador' },
      { uid: 'u4', name: 'Nuevo ingreso', email: 'new@example.test', role: 'pending' }]; let orgName = 'Taller Demo'; let demoTok: import('../core/workshopQr').QrToken | null = null; let inv: import('./types').Invite[] = []; let jobs = [...seed]; const xc: string[] = []; const xp: { customer: string; name: string }[] = [];
  let quotes: Quote[] = [mkq('q1', 'TAL-2026-1001', 'Residencia Ortiz', 'enviada', [L('Vidrio templado 1/4"', 2, 14.5, 'porPieCuadrado', 30), L('Instalación', 3, 45, 'porUnidad')], 2), mkq('q2', 'TAL-2026-1002', 'Farmacia Central', 'aprobada', [L('Vidrio templado 1/4"', 1, 14.5, 'porPieCuadrado', 80)], 8)];
  let notifs: Notif[] = [{ id: 'n1', type: 'device', title: 'Nuevo inicio de sesión', body: 'Medidor demo inició sesión en un dispositivo nuevo.', createdAt: Date.now() - 36e5, read: false }, { id: 'n2', type: 'update', title: 'Nueva versión disponible', createdAt: Date.now() - 864e5, read: true }];
  const me: any = { uid: 'u3', name: 'Medidor demo', role: 'owner', tier: 'ultra', orgId: 'demo', permissions: {} };
  return {
    mode: 'demo', writable: true, joinCode: 'DEMO-4821', get orgName() { return orgName; },
    company: async () => ({ empresa: { nombre: orgName, direccion: 'Carr. 693, Dorado', telefono: '787-555-0142', email: 'taller@example.test' }, tasaIVU: 0.115, validezDias: 30 }),
    workshopQr: { status: async () => demoTok ? { status: 'pending', createdAt: demoTok.createdAt, expiresAt: demoTok.expiresAt } : { status: 'none' }, mint: async () => { const QR = await import('qrcode'); const id = Math.random().toString(36).slice(2, 10); const url = 'https://nivelatolabs.com/join?demo=' + id; demoTok = { url, qrSvg: await QR.toString(url, { type: 'svg', margin: 0 }), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() }; return demoTok; } },
    invites: async () => (me.role === 'owner' ? inv : []),
    sendInvite: async (i) => { if (me.role !== 'owner') throw new Error('No permission'); const e = i.email.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('email'); if (team.some((m) => m.email.toLowerCase() === e)) throw new Error('member'); inv = [{ ...i, email: e, createdAt: Date.now() }, ...inv.filter((x) => x.email !== e)]; },
    revokeInvite: async (e) => { if (me.role !== 'owner') throw new Error('No permission'); inv = inv.filter((x) => x.email !== e); },
    updateName: async (n) => { n = n.trim(); if (!n) throw new Error('name'); me.name = n; },
    updateOrgName: async (n) => { if (me.role !== 'owner') throw new Error('No permission'); n = n.trim(); if (!n) throw new Error('name'); orgName = n; },
     me, setRole: (r) => { me.role = r; }, can: (k) => makePermChecker(me)(k),
    jobs: async () => (makePermChecker(me)('viewOthersMeasurements') ? jobs : jobs.filter((j) => j.installerUid === me.uid)), job: async (id) => jobs.find((j) => j.id === id) ?? null,
    customers: async () => {
      const m = new Map<string, Customer>();
      for (const j of jobs) { const c = m.get(j.customer) ?? { id: j.customerId ?? j.customer, nombre: j.customer, jobs: 0, last: 0 }; c.jobs++; c.last = Math.max(c.last, j.createdAt); m.set(j.customer, c); }
      for (const n of xc) if (!m.has(n)) m.set(n, { id: encodeURIComponent(n), nombre: n, jobs: 0, last: Date.now() });
      return [...m.values()];
    },
    addCustomer: async (n) => { n = n.trim(); if (!n) throw new Error('name'); if (xc.includes(n) || jobs.some((j) => j.customer === n)) throw new Error('dup'); xc.push(n); },
    addProject: async (c, n) => { n = n.trim(); if (!n || !c) throw new Error('name'); if (xp.some((p) => p.customer === c && p.name === n) || jobs.some((j) => j.customer === c && j.project === n)) throw new Error('dup'); xp.push({ customer: c, name: n }); },
    projects: async () => { const m = new Map<string, any>(); for (const j of jobs) { if (!j.project) continue; const k = j.customer + '|' + j.project; const p = m.get(k) ?? { id: k, name: j.project, customer: j.customer, jobs: 0 }; p.jobs++; m.set(k, p); } for (const x of xp) { const k = x.customer + '|' + x.name; if (!m.has(k)) m.set(k, { id: k, name: x.name, customer: x.customer, jobs: 0 }); } return [...m.values()]; },
    quotes: async () => quotes,
    saveQuote: async (q) => { if (!makePermChecker(me)('createQuotes')) throw new Error('No permission'); const id = 'q' + (quotes.length + 1); const pref = (q.empresa.nombre || 'NIV').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'NIV'; quotes = [{ ...q, id, numero: pref + '-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000), estado: 'borrador', creadoEl: Date.now(), version: 1 }, ...quotes]; return id; },
    setQuoteState: async (id, e) => { quotes = quotes.map((q) => (q.id === id ? { ...q, estado: e } : q)); },
    notifications: async () => notifs, markRead: async (id) => { notifs = notifs.map((n) => (n.id === id ? { ...n, read: true } : n)); }, deleteNotif: async (id) => { notifs = notifs.filter((n) => n.id !== id); },
    members: async () => team,
    priceList: async () => prices.map((x) => ({ ...x })),
    savePrice: async (p) => { if (!makePermChecker(me)('managePriceList')) throw new Error('No permission'); const i = prices.findIndex((x) => x.id === p.id); if (i >= 0) prices[i] = { ...p }; else prices.push({ ...p }); },
    deletePrice: async (id) => { if (!makePermChecker(me)('managePriceList')) throw new Error('No permission'); prices = prices.filter((x) => x.id !== id); },
    saveJob: async (j) => { if (!makePermChecker(me)('createMeasurements')) throw new Error('No permission'); const id = 'j' + (jobs.length + 1); jobs = [{ ...j, id, createdAt: Date.now(), status: 'complete', installerUid: me.uid, installerName: 'Medidor demo' }, ...jobs]; return id; },
  };
}
