import type { ReactNode } from 'react';
import type { Job } from '../data/types';
import { OFF_KEYS, offsetResult, toFracStr, type WallKey, type Reading } from '../core/leveling';

/* NEW SVG renderer (the legacy canvas renderers are not ported; no pixel parity claimed). */
export interface GraphData { w: number; h: number; anchoTop: number; altoDer: number; off: Partial<Record<WallKey, Reading>> }
export function jobGraph(j: Job): GraphData {
  return { w: j.hueco.anchoBot, h: j.hueco.altoIzq, anchoTop: j.hueco.anchoTop, altoDer: j.hueco.altoDer, off: { L: j.paredes.izq, R: j.paredes.der, T: j.paredes.techo, B: j.paredes.piso } };
}
export function Graph({ g, active, labels = true }: { g: GraphData; active?: WallKey | null; labels?: boolean }) {
  const W = 640, H = 440, pad = labels ? 78 : 30;
  const span = Math.max(g.w, g.anchoTop, 1), spanH = Math.max(g.h, g.altoDer, 1);
  const s = Math.min((W - pad * 2) / span, (H - pad * 2) / spanH);
  const ox = (W - Math.max(g.w, g.anchoTop) * s) / 2;
  const X = (x: number) => ox + x * s, Y = (y: number) => H - pad - y * s;
  const BL = [X(0), Y(0)], BR = [X(g.w), Y(0)], TL = [X(0), Y(g.h)], TR = [X(g.anchoTop), Y(g.altoDer)];
  const ref = [[X(0), Y(0)], [X(g.w), Y(0)], [X(g.w), Y(g.h)], [X(0), Y(g.h)]];
  const edges: [WallKey, number[], number[]][] = [['B', BL, BR], ['L', BL, TL], ['R', BR, TR], ['T', TL, TR]];
  const lab = (k: WallKey, p: number[], q: number[]): ReactNode => {
    const r = g.off[k] ? offsetResult(k, g.off[k]!) : null; if (!r) return null;
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const dx = k === 'L' ? -12 : k === 'R' ? 12 : 0, dy = k === 'T' ? -16 : k === 'B' ? 24 : -4;
    return <text key={k} x={mx + dx} y={my + dy} textAnchor={k === 'L' ? 'end' : k === 'R' ? 'start' : 'middle'} fill={r.val ? '#5b9dff' : '#22c55e'} fontFamily="JetBrains Mono" fontSize="14">{r.val ? r.dir + ' ' + toFracStr(r.val) : 'Nivel'}</text>;
  };
  return (
    <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Graph">
      <polygon points={ref.map((p) => p.join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,.3)" strokeDasharray="6 6" />
      <polygon points={[BL, BR, TR, TL].map((p) => p.join(',')).join(' ')} fill="rgba(91,157,255,.08)" />
      {edges.map(([k, p, q]) => <line key={k} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#5b9dff" strokeWidth={active === k ? 4 : 2.5} strokeLinecap="round" />)}
      {labels && edges.map(([k, p, q]) => lab(k, p, q))}
      {labels && <>
        <text x={(BL[0] + BR[0]) / 2} y={H - 22} textAnchor="middle" fill="#fafafa" fontFamily="JetBrains Mono" fontSize="15">{toFracStr(g.w)}</text>
        <text x={(TL[0] + TR[0]) / 2} y={Math.min(TL[1], TR[1]) - 34} textAnchor="middle" fill="#a8a8b0" fontFamily="JetBrains Mono" fontSize="15">{toFracStr(g.anchoTop)}</text>
        <text x={(BL[0] + TL[0]) / 2 - 12} y={(BL[1] + TL[1]) / 2 + 16} textAnchor="end" fill="#fafafa" fontFamily="JetBrains Mono" fontSize="15">{toFracStr(g.h)}</text>
        <text x={(BR[0] + TR[0]) / 2 + 12} y={(BR[1] + TR[1]) / 2 + 16} textAnchor="start" fill="#a8a8b0" fontFamily="JetBrains Mono" fontSize="15">{toFracStr(g.altoDer)}</text></>}
    </svg>
  );
}
export { OFF_KEYS };
