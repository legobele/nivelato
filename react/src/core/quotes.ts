/* Port of dashboard.html qRound2 / qAreaPie2 / qLineSubtotal / qTotals (same formulas). */
export const qRound2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
export const qAreaPie2 = (anchoIn: number, altoIn: number) => qRound2((Number(anchoIn) || 0) * (Number(altoIn) || 0) / 144);
export interface QLine { lineaId: string; descripcion: string; cantidad: number; precioUnitario: number; modeloPrecio: 'porUnidad' | 'porPieCuadrado'; areaPie2?: number; subtotalLinea?: number }
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
