/* Leveling core: typed PORT of flow.html (toFracStr, offsetResult, derivedDims).
   Logic is kept line-for-line; GRAPH_MODULE_PLAN.md says never "fix in passing".
   Convention: signed = -(a - b) (end minus start along A->B), stored as
   offsetConvention 'end-minus-start-v1'. Arrow depends on wall. */
export type WallKey = 'L' | 'R' | 'T' | 'B';
export const OFF_KEYS: WallKey[] = ['L', 'R', 'T', 'B'];
export const DIMS_MAX = 1000;
export interface Reading { a: number; b: number }
export interface OffsetResult { val: number; dir: string; label: string; dlabel: string; raw: number; signed: number; slabel: string }

export function toFracStr(decimal: number): string {
  if (decimal === 0) return '0"';
  const whole = Math.floor(Math.abs(decimal));
  const frac = Math.abs(decimal) - whole;
  const sixteenths = Math.round(frac * 16);
  const sign = decimal < 0 ? '-' : '';
  if (sixteenths === 0) return `${sign}${whole}"`;
  if (sixteenths === 16) return `${sign}${whole + 1}"`;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(sixteenths, 16);
  const n = sixteenths / g, d = 16 / g;
  if (whole === 0) return `${sign}${n}/${d}"`;
  return `${sign}${whole} ${n}/${d}"`;
}

export function offsetResult(key: WallKey, c: Reading | null): OffsetResult | null {
  if (!c) return null;
  const diff = c.a - c.b;
  if (Math.abs(diff) < 0.001) return { val: 0, dir: 'NIVEL', label: 'Nivel', raw: 0, signed: 0, slabel: '0"', dlabel: 'Nivel' };
  const val = Math.abs(diff);
  let arrow: string;
  if (key === 'L') arrow = diff > 0 ? '→' : '←';
  else if (key === 'R') arrow = diff > 0 ? '←' : '→';
  else if (key === 'T') arrow = diff > 0 ? '↓' : '↑';
  else arrow = diff > 0 ? '↑' : '↓';
  const signed = -diff;
  const slabel = (signed > 0 ? '+' : '-') + toFracStr(val);
  return { val, dir: arrow, label: arrow + ' ' + toFracStr(val), dlabel: arrow + ' ' + toFracStr(val) + ' (' + slabel + ')', raw: diff, signed, slabel };
}

export function derivedDims(dims: { w: number; h: number }, off: Record<WallKey, Reading>) {
  const izq = offsetResult('L', off.L)!, der = offsetResult('R', off.R)!, techo = offsetResult('T', off.T)!, piso = offsetResult('B', off.B)!;
  return {
    anchoTop: Math.max(0, dims.w - izq.raw - der.raw),
    altoDer: Math.max(0, dims.h - techo.raw - piso.raw),
  };
}

/** Parse "40", "40 1/2", "40.5", 40" into inches. Returns null when invalid. */
export function parseInches(s: string): number | null {
  const t = s.trim().replace(/["”]/g, '');
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?$/) ;
  if (m) { const v = parseFloat(m[1]) + (m[2] ? parseInt(m[2]) / parseInt(m[3]) : 0); return v <= DIMS_MAX ? v : null; }
  const f = t.match(/^(\d+)\/(\d+)$/);
  if (f && +f[2] > 0) return +f[1] / +f[2];
  return null;
}

/* ---- whole + sixteenths entry, same validation rules as flow.html ---- */
export interface WF { whole: string; frac: string }
export const SIXTEENTHS = ['0', '0.0625', '0.125', '0.1875', '0.25', '0.3125', '0.375', '0.4375', '0.5', '0.5625', '0.625', '0.6875', '0.75', '0.8125', '0.875', '0.9375'];
export const wfTotal = (v: WF) => (parseFloat(v.whole) || 0) + (parseFloat(v.frac) || 0);
export const wfTyped = (v: WF) => v.whole.trim() !== '';
/** null when valid; otherwise error key. allowZero: offsets may be 0, base dims may not. */
export function wfError(v: WF, allowZero: boolean): 'err' | 'errWhole' | 'errMax' | null {
  const frac = parseFloat(v.frac) || 0; const s = v.whole.trim();
  if (s === '') return frac > 0 ? 'errWhole' : 'err';
  const whole = Number(s);
  if (!Number.isFinite(whole) || whole < 0) return 'err';
  if (!Number.isInteger(whole)) return 'errWhole';
  if (whole === 0 && frac > 0) return 'errWhole';
  if (!allowZero && whole + frac <= 0) return 'err';
  if (whole + frac > DIMS_MAX) return 'errMax';
  return null;
}
export const fromNumber = (n: number): WF => { const w = Math.floor(n); const f = Math.round((n - w) * 16); return f === 16 ? { whole: String(w + 1), frac: '0' } : { whole: String(w), frac: SIXTEENTHS[f] }; };
/** Corner readings: A bottom-left, B top-left, C bottom-right, D top-right. L=A+B, R=C+D, T=B+D, B=A+C. */
export const PAIRS: Record<WallKey, [string, string]> = { L: ['A', 'B'], R: ['C', 'D'], T: ['B', 'D'], B: ['A', 'C'] };
