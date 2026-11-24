/* Live adapter: READ-ONLY against the production Firestore schema (orgs/{org}/jobs, customers; companies/{id}/priceList).
   The preview build never writes production data. saveJob throws until the cutover is approved. */
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, collection, getDocs, getDoc, doc, query, orderBy, limit, where } from 'firebase/firestore';
import type { Repo, Job, Member } from './types';
import { makePermChecker } from '../core/permissions';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: 'nivelato-app.firebaseapp.com', projectId: 'nivelato-app',
  storageBucket: 'nivelato-app.firebasestorage.app', messagingSenderId: '759893408531', appId: '1:759893408531:web:696e2da5f004a3bac5f8e6',
};
export const liveEnabled = Boolean(cfg.apiKey);
const app = liveEnabled ? initializeApp(cfg) : null;
export const auth = app ? getAuth(app) : null;
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
    mode: 'live', writable: false, me, can, orgName: org.data()?.name ?? 'Organización',
    jobs: async () => (await getDocs(can('viewOthersMeasurements') ? query(collection(db, 'orgs', orgId, 'jobs'), orderBy('createdAt', 'desc'), limit(200)) : query(collection(db, 'orgs', orgId, 'jobs'), where('installerUid', '==', user.uid), limit(200)))).docs.map(toJob).filter((j) => j.status !== 'draft'),
    job: async (id) => { const s = await getDoc(doc(db, 'orgs', orgId, 'jobs', id)); return s.exists() ? toJob(s) : null; },
    customers: async () => { const js = (await getDocs(can('viewOthersMeasurements') ? query(collection(db, 'orgs', orgId, 'jobs'), limit(500)) : query(collection(db, 'orgs', orgId, 'jobs'), where('installerUid', '==', user.uid), limit(500)))).docs.map(toJob); const m = new Map<string, any>(); for (const j of js) { if (!j.customer) continue; const c = m.get(j.customer) ?? { id: j.customerId ?? encodeURIComponent(j.customer), nombre: j.customer, jobs: 0, last: 0 }; c.jobs++; c.last = Math.max(c.last, j.createdAt); m.set(j.customer, c); } return [...m.values()]; },
    projects: async () => { const js = (await getDocs(can('viewOthersMeasurements') ? query(collection(db, 'orgs', orgId, 'jobs'), limit(500)) : query(collection(db, 'orgs', orgId, 'jobs'), where('installerUid', '==', user.uid), limit(500)))).docs.map(toJob); const m = new Map<string, any>(); for (const j of js) { if (!j.project) continue; const k = j.customer + '|' + j.project; const p = m.get(k) ?? { id: k, name: j.project, customer: j.customer, jobs: 0 }; p.jobs++; m.set(k, p); } return [...m.values()]; },
    quotes: async () => (await getDocs(query(collection(db, 'companies', orgId, 'quotes'), orderBy('creadoEl', 'desc')))).docs.map((d) => ({ id: d.id, ...d.data(), creadoEl: ts(d.data().creadoEl) }) as any),
    saveQuote: async () => { throw new Error(RO); }, setQuoteState: async () => { throw new Error(RO); },
    notifications: async () => { const r: any = await httpsCallable(getFunctions(app!, 'us-central1'), 'listNotifications')({}); return ((r.data?.items) || []).map((n: any) => ({ ...n, createdAt: ts(n.createdAt) })); },
    markRead: async () => { throw new Error(RO); }, deleteNotif: async () => { throw new Error(RO); },
    members: async () => (await getDocs(collection(db, 'users'))).docs.map((d) => ({ uid: d.id, ...d.data() }) as Member).filter((m: any) => (m as any).orgId === orgId),
    priceList: async () => { const cid = org.data()?.companyId; if (!cid) return []; return (await getDocs(collection(db, 'companies', cid, 'priceList'))).docs.map((d) => ({ id: d.id, ...d.data() }) as any); },
    saveJob: async () => { throw new Error('La vista previa React no escribe datos de producción.'); },
  };
}
