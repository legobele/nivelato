import { forwardRef } from 'react';
import { OFF_KEYS, PAIRS, offsetResult, toFracStr, wfTotal, wfTyped, type WF, type WallKey } from '../core/leveling';
import type { GraphData } from './Graph';

/* Graph with the inputs ON it. One SVG, one coordinate system: every chip is placed against the
   drawn frame and joined to its edge by a leader line, so the numbers sit on the geometry. */
export type ChipKey = 'W' | 'H' | WallKey;
const VW = 400, VH = 470, FX0 = 112, FX1 = 288, FY0 = 82, FY1 = 382;
export const chipOrder: ChipKey[] = ['W', 'H', 'L', 'R', 'T', 'B'];
interface P { g: GraphData; base: { W: WF; H: WF }; rd: Record<WallKey, { a: WF; b: WF }>; baseOk: boolean; wallOk: (k: WallKey) => boolean; active: ChipKey | null; onPick: (k: ChipKey) => void; labels: Record<ChipKey, string> }
export const GraphEntry = forwardRef<SVGSVGElement, P>(({ g, base, rd, baseOk, wallOk, active, onPick, labels }, ref) => {
  const spanW = Math.max(g.w, g.anchoTop, 1), spanH = Math.max(g.h, g.altoDer, 1);
  const s = Math.min((FX1 - FX0) / spanW, (FY1 - FY0) / spanH);
  const ox = (FX0 + FX1) / 2 - (spanW * s) / 2, oy = (FY0 + FY1) / 2 + (spanH * s) / 2;
  const X = (x: number) => ox + x * s, Y = (y: number) => oy - y * s;
  const BL = [X(0), Y(0)], BR = [X(g.w), Y(0)], TL = [X(0), Y(g.h)], TR = [X(g.anchoTop), Y(g.altoDer)];
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const edge: Record<WallKey, number[]> = { L: mid(BL, TL), R: mid(BR, TR), T: mid(TL, TR), B: mid(BL, BR) };
  const frameMidY = (FY0 + FY1) / 2;
  const pos: Record<ChipKey, { x: number; y: number; w: number; h: number; ax: number; ay: number }> = {
    T: { x: VW / 2 - 46, y: 8, w: 92, h: 58, ax: VW / 2, ay: 66 },
    B: { x: VW / 2 - 100, y: FY1 + 16, w: 92, h: 58, ax: VW / 2 - 54, ay: FY1 + 16 },
    W: { x: VW / 2 + 8, y: FY1 + 16, w: 92, h: 42, ax: 0, ay: 0 },
    L: { x: 6, y: frameMidY - 4, w: 92, h: 58, ax: 98, ay: frameMidY + 25 },
    H: { x: 6, y: FY0 + 2, w: 92, h: 42, ax: 0, ay: 0 },
    R: { x: VW - 98, y: frameMidY - 29, w: 92, h: 58, ax: VW - 98, ay: frameMidY },
  };
  const text = (k: ChipKey): [string, string, string] => {
    if (k === 'W' || k === 'H') { const ok = baseOk || !wfErr(base[k]); return [labels[k], ok && wfTyped(base[k]) ? toFracStr(wfTotal(base[k])) : '?', '']; }
    const [pa, pb] = PAIRS[k]; const r = wallOk(k) ? offsetResult(k, { a: wfTotal(rd[k].a), b: wfTotal(rd[k].b) }) : null;
    return [`${pa} + ${pb}`, `${wfTyped(rd[k].a) ? toFracStr(wfTotal(rd[k].a)) : '?'} → ${wfTyped(rd[k].b) ? toFracStr(wfTotal(rd[k].b)) : '?'}`, r ? r.slabel : ''];
  };
  const wfErr = (v: WF) => !(wfTyped(v) && wfTotal(v) > 0);
  const done = (k: ChipKey) => (k === 'W' || k === 'H' ? !wfErr(base[k]) : wallOk(k));
  const edges: [WallKey, number[], number[]][] = [['B', BL, BR], ['L', BL, TL], ['R', BR, TR], ['T', TL, TR]];
  const dir = (k: WallKey) => (wallOk(k) ? offsetResult(k, { a: wfTotal(rd[k].a), b: wfTotal(rd[k].b) })! : null);
  return (
    <svg ref={ref} className="gentry" viewBox={`0 0 ${VW} ${VH}`} role="group" aria-label="Graph">
      <rect x={FX0 - 8} y={FY0 - 8} width={FX1 - FX0 + 16} height={FY1 - FY0 + 16} rx="10" fill="none" stroke="rgba(255,255,255,.08)" />
      <polygon points={[[X(0), Y(0)], [X(g.w), Y(0)], [X(g.w), Y(g.h)], [X(0), Y(g.h)]].map((p) => p.join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,.28)" strokeDasharray="5 5" />
      <polygon points={[BL, BR, TR, TL].map((p) => p.join(',')).join(' ')} fill="rgba(91,157,255,.10)" />
      {edges.map(([k, p, q]) => <line key={k} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={active === k ? '#fafafa' : '#5b9dff'} strokeWidth={active === k ? 4 : 2.5} strokeLinecap="round" />)}
      {OFF_KEYS.map((k) => { const p = pos[k]; const e = edge[k]; const ax = k === 'T' ? p.ax : k === 'B' ? p.ax : p.ax; const ay = p.ay;
        return <line key={'l' + k} x1={ax} y1={ay} x2={e[0]} y2={e[1]} stroke="rgba(255,255,255,.25)" strokeDasharray="2 3" />; })}
      {OFF_KEYS.map((k) => { const r = dir(k); if (!r || !r.val) return null; const e = edge[k]; const dx = k === 'L' ? 8 : k === 'R' ? -8 : 0, dy = k === 'T' ? 16 : k === 'B' ? -8 : 0;
        return <text key={'d' + k} x={e[0] + dx} y={e[1] + dy} textAnchor={k === 'L' ? 'start' : k === 'R' ? 'end' : 'middle'} fontSize="13" fontFamily="JetBrains Mono" fill="#5b9dff">{r.dir}</text>; })}
      {chipOrder.map((k) => { const p = pos[k]; const [l1, l2, l3] = text(k); const on = active === k, ok = done(k);
        return (
          <g key={k} data-chip={k} role="button" tabIndex={0} aria-label={l1} style={{ cursor: 'pointer' }} onClick={() => onPick(k)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(k))}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx="12" fill="#16161a" stroke={on ? '#fafafa' : ok ? 'rgba(34,197,94,.6)' : 'rgba(255,255,255,.3)'} strokeWidth={on ? 2 : 1.2} strokeDasharray={ok || on ? undefined : '4 3'} />
            <text x={p.x + p.w / 2} y={p.y + 16} textAnchor="middle" fontSize="11" fill="#a8a8b0" fontFamily="Inter">{l1}</text>
            <text x={p.x + p.w / 2} y={p.y + 34} textAnchor="middle" fontSize="14" fontWeight="600" fill="#fafafa" fontFamily="JetBrains Mono" {...(l2.length * 8.6 > p.w - 10 ? { textLength: p.w - 10, lengthAdjust: 'spacingAndGlyphs' } : {})}>{l2}</text>
            {l3 && <text x={p.x + p.w / 2} y={p.y + 50} textAnchor="middle" fontSize="12" fill="#5b9dff" fontFamily="JetBrains Mono">{l3}</text>}
          </g>);
      })}
    </svg>
  );
});
