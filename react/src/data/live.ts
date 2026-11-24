/* Live adapter: READ-ONLY against the production Firestore schema (orgs/{org}/jobs, customers; companies/{id}/priceList).
   The preview build never writes production data. saveJob throws until the cutover is approved. */
import { initializeApp } from 'firebase/app';
import { initializeAuth, browserSessionPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, collection, getDocs, getDoc, doc, query, orderBy, limit, where } from 'firebase/firestore';
import type { Repo, Job, Member } from './types';
import { makePermChecker } from '../core/permissions';

// Public Firebase web config, copied from the app's own firebase-config.js (web keys are not secrets; Firestore rules enforce access).
const PUBLIC_WEB_KEY = "AIzaSyDLOcT2LkztypbqUNmAX6dEdNW9INMxkVw";
const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || PUBLIC_WEB_KEY, authDomain: 'nivelato-app.firebaseapp.com', projectId: 'nivelato-app',
  storageBucket: 'nivelato-app.firebasestorage.app', messagingSenderId: '759893408531', appId: '1:759893408531:web:696e2da5f004a3bac5f8e6',
};
export const liveEnabled = Boolean(cfg.apiKey);
// Named app + session-only persistence: the preview never shares or keeps a sign-in with any other app on the same origin.
const app = liveEnabled ? initializeApp(cfg, 'nivelato-react-preview') : null;
export const auth = app ? initializeAuth(app, { persistence: browserSessionPersistence }) : null;
export const signIn = (e: string, p: string) => signInWithEmailAndPassword(auth!, e, p);
export const logOut = () => signOut(auth!);
export const watchAuth = (cb: (u: User | null) => void) => (auth ? onAuthStateChanged(auth, cb) : (cb(null), () => {}));

const RO = "No disponible en la vista previa.";
const ts = (v: any) => (v?.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);
export async function liveRepo(user: User): Promise<Repo> {
  const db = getFirestore(app!);
  const meSnap = await getDoc(doc(db, 'users', user.uid));
  const orgId = meSnap.data()?.orgId as string;
  const org = await getDoc(doc(db, 'orgs', orgId));
  const me = { uid: user.uid, ...(meSnap.data()) , orgId } as any; const can = makePermChecker(me);
  const toJob = (d: any): Job => ({ id: d.id, ...d.data(), createdAt: ts(d.data().createdAt) } as Job);
  return {
    mode: 'live', writable: false, me, can, orgName: org.data()?.name ?? 'Organización', joinCode: (org.data()?.joinCode as string) || orgId,
    jobs: async () => (await getDocs(can('viewOthersMeasurements') ? query(collection(db, 'orgs', orgId, 'jobs'), orderBy('createdAt', 'desc'), limit(200)) : query(collection(db, 'orgs', orgId, 'jobs'), where('installerUid', '==', user.uid), limit(200)))).docs.map(toJob).filter((j) => j.status !== 'draft'),
    job: async (id) => { const s = await getDoc(doc(db, 'orgs', orgId, 'jobs', id)); return s.exists() ? toJob(s) : null; },
    customers: async () => { const js = (await getDocs(can('viewOthersMeasurements') ? query(collection(db, 'orgs', orgId, 'jobs'), limit(500)) : query(collection(db, 'orgs', orgId, 'jobs'), where('installerUid', '==', user.uid), limit(500)))).docs.map(toJob); const m = new Map<string, any>(); for (const j of js) { if (!j.customer) continue; const c = m.get(j.customer) ?? { id: j.customerId ?? encodeURIComponent(j.customer), nombre: j.customer, jobs: 0, last: 0 }; c.jobs++; c.last = Math.max(c.last, j.createdAt); m.set(j.customer, c); } return [...m.values()]; },
    projects: async () => { const js = (await getDocs(can('viewOthersMeasurements') ? query(collection(db, 'orgs', orgId, 'jobs'), limit(500)) : query(collection(db, 'orgs', orgId, 'jobs'), where('installerUid', '==', user.uid), limit(500)))).docs.map(toJob); const m = new Map<string, any>(); for (const j of js) { if (!j.project) continue; const k = j.customer + '|' + j.project; const p = m.get(k) ?? { id: k, name: j.project, customer: j.customer, jobs: 0 }; p.jobs++; m.set(k, p); } return [...m.values()]; },
    quotes: async () => (await getDocs(query(collection(db, 'companies', orgId, 'quotes'), orderBy('creadoEl', 'desc')))).docs.map((d) => { const x: any = d.data(); return { id: d.id, ...x, cliente: typeof x.cliente === 'string' ? { nombre: x.cliente } : x.cliente || { nombre: '' }, empresa: x.empresa || {}, lineas: x.lineas || [], descuento: x.descuento || { tipo: 'ninguno', valor: 0 }, totales: x.totales || { subtotal: 0, descuento: 0, tasaIVU: 0, montoIVU: 0, total: 0 }, creadoEl: ts(x.creadoEl), emitidaEl: ts(x.emitidaEl) || undefined, validaHasta: ts(x.validaHasta) || undefined } as any; }),
    saveQuote: async () => { throw new Error(RO); }, setQuoteState: async () => { throw new Error(RO); },
    notifications: async () => { const r: any = await httpsCallable(getFunctions(app!, 'us-central1'), 'listNotifications')({}); return ((r.data?.items) || []).map((n: any) => ({ ...n, createdAt: ts(n.createdAt) })); },
    markRead: async () => { throw new Error(RO); }, deleteNotif: async () => { throw new Error(RO); },
    members: async () => (await getDocs(collection(db, 'users'))).docs.map((d) => ({ uid: d.id, ...d.data() }) as Member).filter((m: any) => (m as any).orgId === orgId),
    priceList: async () => (await getDocs(collection(db, 'companies', orgId, 'priceList'))).docs.map((d) => ({ id: d.id, ...d.data() }) as any),
    savePrice: async () => { throw new Error(RO); }, deletePrice: async () => { throw new Error(RO); },
    company: async () => { const d: any = (await getDoc(doc(db, 'companies', orgId))).data() || {}; const aj = d.ajustes || {}; return { empresa: { nombre: d.nombre || '', direccion: d.direccion || '', telefono: d.telefono || '', email: d.email || '', logoUrl: d.logoUrl || '' }, tasaIVU: aj.tasaIVU != null ? Number(aj.tasaIVU) : 0.115, validezDias: aj.validezDias != null ? Number(aj.validezDias) : 30, prefijo: aj.prefijoFolio }; },
    workshopQr: { status: async () => ((await httpsCallable(getFunctions(app!, 'us-central1'), 'getWorkshopEnrollmentTokenStatus')({ orgId })).data as any), mint: async () => { throw new Error('Unavailable in preview'); } },
    invites: async () => { if (!can('userManagement')) return []; return (await getDocs(collection(db, 'orgs', orgId, 'invites'))).docs.map((d) => ({ email: d.id, ...d.data(), createdAt: ts(d.data().createdAt) }) as any); },
    sendInvite: async () => { throw new Error(RO); }, revokeInvite: async () => { throw new Error(RO); },
    updateName: async () => { throw new Error(RO); }, updateOrgName: async () => { throw new Error(RO); },
    addCustomer: async () => { throw new Error(RO); }, addProject: async () => { throw new Error(RO); },
    saveJob: async () => { throw new Error('La vista previa React no escribe datos de producción.'); },
  };
}
