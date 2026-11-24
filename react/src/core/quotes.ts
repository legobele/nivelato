/* Port of dashboard.html qRound2 / qAreaPie2 / qLineSubtotal / qTotals (same formulas). */
export const qRound2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
export const qAreaPie2 = (anchoIn: number, altoIn: number) => qRound2((Number(anchoIn) || 0) * (Number(altoIn) || 0) / 144);
export interface QLine { lineaId: string; descripcion: string; cantidad: number; precioUnitario: number; modeloPrecio: 'porUnidad' | 'porPieCuadrado' | ''; areaPie2?: number; anchoIn?: number; altoIn?: number; subtotalLinea?: number; tipo?: '' | 'personalizado' | 'sacabocados' | 'barreno'; itemRef?: unknown; medicionRef?: { jobId: string; medidaId: string; fuente: string }; forma?: string; dimensiones?: Record<string, number>; posicion?: { xIn?: number; yIn?: number; etiqueta?: string } }
export const fmtUnit = (u: string) => (u === 'pie2' ? 'pie²' : u);
export const formaLabel = (f?: string) => ({ circular: 'Circular', rectangular: 'Rectangular', ranura: 'Ranura', semicircular: 'Semicircular', personalizada: 'Personalizada' } as Record<string, string>)[f || ''] || f || '';
const inch = (v: number) => String(Math.round(v * 10000) / 10000) + '"';
export const dimStr = (l: Pick<QLine, 'forma' | 'dimensiones'>) => { const d = l.dimensiones || {}; if (l.forma === 'circular') return d.diametroIn ? ' Ø ' + inch(d.diametroIn) : ''; if (l.forma === 'rectangular' || l.forma === 'ranura') return d.anchoIn && d.largoIn ? ' ' + inch(d.anchoIn) + ' × ' + inch(d.largoIn) : ''; if (l.forma === 'semicircular') return d.radioIn ? ' radio ' + inch(d.radioIn) : ''; return (d as any).detalle ? ' ' + (d as any).detalle : ''; };
export const lineDetail = (l: QLine) => { if (l.tipo === 'sacabocados' || l.tipo === 'barreno') { let s = (formaLabel(l.forma) + dimStr(l)).trim(); if (l.posicion?.etiqueta) s += ' · ' + l.posicion.etiqueta; return s; } const d: string[] = []; if (l.anchoIn != null && l.altoIn != null) d.push(l.anchoIn + '\" × ' + l.altoIn + '\"'); if (l.areaPie2 != null) d.push(l.areaPie2 + ' pie²'); return d.join(' · '); };
/** Legacy buildLineFromInputs for sacabocados/barreno: returns an error key or the line. */
export function buildSacaLine(kind: 'sacabocados' | 'barreno', f: { forma: string; dim: Record<string, string>; x: string; y: string; et: string; cant: string; item?: { id: string; nombre: string; precio: number } | null; precio: string }): { err: string } | { line: QLine } {
  const n = (v: string) => { const x = Number(v); return Number.isFinite(x) && v.trim() !== '' ? x : 0; };
  const forma = kind === 'barreno' ? 'circular' : f.forma; const dimensiones: Record<string, any> = {};
  if (forma === 'circular') { dimensiones.diametroIn = n(f.dim.diametro); if (!(dimensiones.diametroIn > 0)) return { err: 'sqDiam' }; }
  else if (forma === 'rectangular' || forma === 'ranura') { dimensiones.anchoIn = n(f.dim.ancho); dimensiones.largoIn = n(f.dim.largo); if (!(dimensiones.anchoIn > 0) || !(dimensiones.largoIn > 0)) return { err: 'sqAncho' }; }
  else if (forma === 'semicircular') { dimensiones.radioIn = n(f.dim.radio); if (!(dimensiones.radioIn > 0)) return { err: 'sqRadio' }; }
  else { dimensiones.detalle = (f.dim.detalle || '').trim(); if (!dimensiones.detalle) return { err: 'sqDetalle' }; }
  const cantidad = n(f.cant); if (!(cantidad >= 1)) return { err: 'sqCant' };
  const precioUnitario = f.item ? f.item.precio : n(f.precio); if (!(precioUnitario > 0)) return { err: 'sqPrecio' };
  const line: QLine = { lineaId: Math.random().toString(36).slice(2, 8), tipo: kind, forma, dimensiones, posicion: { xIn: n(f.x), yIn: n(f.y), etiqueta: f.et.trim() }, cantidad, precioUnitario, modeloPrecio: 'porUnidad', itemRef: f.item ? f.item.id : null, descripcion: (f.item ? f.item.nombre : formaLabel(forma) + ' (manual)') + dimStr({ forma, dimensiones }) };
  (line as any).precioManual = !f.item; line.subtotalLinea = qLineSubtotal(line); return { line };
}
export function qLineSubtotal(l: QLine) {
  const cant = Number(l.cantidad) || 0, pu = Number(l.precioUnitario) || 0;
  if (l.modeloPrecio === 'porPieCuadrado') return qRound2(cant * pu * (Number(l.areaPie2) || 0));
  return qRound2(cant * pu);
}
export type Descuento = { tipo: 'ninguno' | 'porciento' | 'monto'; valor: number };
export function qTotals(lineas: QLine[], descuento: Descuento | null, tasaIVU: number) {
  const subtotal = qRound2((lineas || []).reduce((a, l) => a + (Number(l.subtotalLinea) || 0), 0));
  let desc = 0;
  if (descuento && descuento.tipo === 'porciento') desc = qRound2(subtotal * (Number(descuento.valor) || 0) / 100);
  else if (descuento && descuento.tipo === 'monto') desc = qRound2(Number(descuento.valor) || 0);
  if (desc > subtotal) desc = subtotal;
  const base = qRound2(subtotal - desc);
  const tasa = Number(tasaIVU); const tasaOk = Number.isFinite(tasa) && tasa >= 0 ? tasa : 0;
  const montoIVU = qRound2(base * tasaOk);
  return { subtotal, descuento: desc, tasaIVU: tasaOk, montoIVU, total: qRound2(base + montoIVU) };
}
