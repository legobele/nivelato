import type { Reading } from '../core/leveling';
import type { QLine, Descuento, qTotals } from '../core/quotes';
import type { UserData, PermKey } from '../core/permissions';
export interface Job {
  photo?: string | null; annotatedPhoto?: string | null;
  id: string; customer: string; customerId?: string; project: string; location: string; area: string;
  status: 'draft' | 'complete'; installerUid?: string; installerName: string; createdAt: number; notas: string;
  hueco: { anchoBot: number; altoIzq: number; anchoTop: number; altoDer: number };
  desniveles: { paredIzq: string | null; paredDer: string | null; techo: string | null; piso: string | null };
  paredes: { izq: Reading & { desnivel: number; desnivelAB?: number }; der: Reading & { desnivel: number; desnivelAB?: number }; techo: Reading & { desnivel: number; desnivelAB?: number }; piso: Reading & { desnivel: number; desnivelAB?: number } };
  offsetConvention?: string;
}
export interface Customer { id: string; nombre: string; jobs: number; last: number }
export interface Member { uid: string; name: string; email: string; role: 'owner' | 'supervisor' | 'medidor' | 'cotizador' | 'pending'; }
export interface PriceItem { id: string; nombre: string; unidad: string; precio: number; activo: boolean }
export interface Notif { id: string; type: string; title: string; body?: string; createdAt: number; read: boolean }
export interface Quote { id: string; numero: string; cliente: string; estado: 'borrador' | 'enviada' | 'aprobada' | 'rechazada'; lineas: QLine[]; descuento: Descuento; totales: ReturnType<typeof qTotals>; validezDias: number; notas: string; creadoEl: number }
export interface Project { id: string; name: string; customer: string; jobs: number }
export interface Repo {
  mode: 'demo' | 'live';
  writable: boolean;
  me: UserData;
  setRole?(r: string): void;
  can(k: PermKey): boolean;
  orgName: string;
  jobs(): Promise<Job[]>;
  job(id: string): Promise<Job | null>;
  customers(): Promise<Customer[]>;
  members(): Promise<Member[]>;
  priceList(): Promise<PriceItem[]>;
  savePrice(p: PriceItem): Promise<void>;
  deletePrice(id: string): Promise<void>;
  projects(): Promise<Project[]>;
  quotes(): Promise<Quote[]>;
  saveQuote(q: Omit<Quote, 'id' | 'creadoEl' | 'numero' | 'estado'>): Promise<string>;
  setQuoteState(id: string, e: Quote['estado']): Promise<void>;
  notifications(): Promise<Notif[]>;
  markRead(id: string): Promise<void>;
  deleteNotif(id: string): Promise<void>;
  addCustomer(name: string): Promise<void>;
  addProject(customer: string, name: string): Promise<void>;
  saveJob(j: Omit<Job, 'id' | 'createdAt' | 'status' | 'installerName'>): Promise<string>;
}
