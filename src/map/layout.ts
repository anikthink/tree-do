// Where everything sits on the map. Desktop: rows running left → right off the Upkeep spine.
// Phone: every list is its own column, all running down.
import { IC } from '../domain/lines';
import { forksOf, seqList, type TodayNetwork } from '../domain/network';
import { isLeftover } from '../domain/rules';
import { pad2 } from '../domain/time';
import type { Line, Task } from '../domain/types';
import { COLW_V } from '../app/viewport';
import { mkEdge, type Edge, type Pt } from './geometry';

/** A stop on the map: a task, or the "Today" start (`t: null`, key `IC`). */
export interface Station {
  key: string;
  t: Task | null;
  line: Line;
  x: number;
  y: number;
  /** Where its label sits: above, left or right. */
  side: 'a' | 'l' | 'r';
  idx: number;
  label: string;
  /** A one-off finished on an earlier day, kept for an unfinished branch. */
  old?: boolean;
  /** Phone: right edge of its column (labels wrap before it). */
  colR?: number;
}
export interface Terminus {
  line: Line;
  x: number;
  y: number;
  empty: boolean;
  from: Station;
  vertical: boolean;
  branch: boolean;
  stub: Pt[];
}
export interface Bounds { x0: number; y0: number; x1: number; y1: number }
export interface Column { line: Line; x: number }

export interface MapLayout {
  stations: Station[];
  byKey: Record<string, Station | undefined>;
  edges: Edge[];
  edgeTo: Record<string, Edge | undefined>;
  termini: Terminus[];
  bounds: Bounds;
  vertical: boolean;
  cols: Column[];
}

export function emptyLayout(): MapLayout {
  return { stations: [], byKey: {}, edges: [], edgeTo: {}, termini: [], bounds: { x0: 0, y0: 0, x1: 0, y1: 0 }, vertical: false, cols: [] };
}

export function layoutMap(net: TodayNetwork, vertical: boolean): MapLayout {
  const { lines, seqs, today } = net;
  const stations: Station[] = [], edges: Edge[] = [], termini: Terminus[] = [];
  const cols: Column[] = [];
  const ic: Station = { key: 'IC', t: null, line: IC, x: 0, y: 0, side: vertical ? 'r' : 'l', idx: -1, label: '00' };
  stations.push(ic);
  const up = lines[0], focus = lines.slice(1);
  let J: Station = ic;
  const findJunction = (): void => { J = (net.junction && stations.find(s => s.key === net.junction)) || ic; };

  if (!vertical) {
    // Desktop: Upkeep is the spine through the middle, running left → right from Today.
    // At the junction the focus lines peel off on parallel tracks — alternately above and below — and run right
    // on their own rows. A branch drops 45° to its own row just below its line.
    const ROW = 150, SUB = 100, COL = 186, X0 = 150;
    const heightOf = (l: Line): number => Object.keys(seqs[l.id] ?? {}).filter(k => k !== 'trunk').length * SUB;   // one row per branch
    const doLine = (l: Line, lineY: number, startX: number, firstCorners: (x: number, y: number) => Pt[], fromSt: Station): void => {
      let sub = 0;
      const place = (list: Task[], sx: number, rowY: number, from: Station, labelBase: string, isTrunk: boolean): void => {
        let prev = from;
        list.forEach((t, j) => {
          const st: Station = { key: t.id, t, line: l, x: sx + j * COL, y: rowY, side: 'a', idx: j,
            label: labelBase ? `${labelBase}/${j + 1}` : pad2(j + 1), old: isLeftover(t, today) };
          stations.push(st);
          let corners: Pt[];
          if (isTrunk && j === 0) corners = firstCorners(st.x, rowY);
          else if (prev.y !== rowY) corners = [[prev.x, prev.y], [prev.x + (rowY - prev.y), rowY], [st.x, rowY]];
          else corners = [[prev.x, prev.y], [st.x, rowY]];
          const e = mkEdge(corners, l.color, st.key);
          if (isTrunk && j === 0 && fromSt !== ic) e.under = true;   // shares the Upkeep track before peeling off
          edges.push(e);
          prev = st;
          forksOf(seqs, l.id, t.id).forEach(k => { sub++; place(seqList(seqs, l.id, k), st.x + COL, lineY + sub * SUB, st, st.label, false); });
        });
        const endX = list.length ? prev.x : sx - 60;
        termini.push({ line: l, x: endX, y: rowY, empty: !list.length, from: prev, vertical: false, branch: !isTrunk,
          stub: list.length ? [[prev.x, rowY], [prev.x + 30, rowY]] : firstCorners(endX + 30, rowY) });
      };
      place(seqList(seqs, l.id, 'trunk'), startX, lineY, fromSt, '', true);
    };
    doLine(up, 0, X0, (x, ry) => [[0, 0], [x, ry]], ic);
    findJunction();
    // alternate: 1st focus line just above, 2nd just below, 3rd above that, 4th below that
    const above = focus.filter((_, i) => i % 2 === 0), below = focus.filter((_, i) => i % 2 === 1);
    let topEdge = 0;                       // top of the spine's block
    // Focus lines share the Upkeep track for a moment after the junction, then peel off.
    // The nearest line peels off last (furthest right), so no track ever crosses another.
    const peel = (k: number, n: number): number => J.x + 58 + (n - 1 - k) * 13;
    above.forEach((l, k) => {
      const lineY = topEdge - ROW - heightOf(l), px = peel(k, above.length);
      doLine(l, lineY, J.x + COL, (x, ry) => [[J.x, J.y], [px, J.y], [px, ry], [x, ry]], J);
      topEdge = lineY;
    });
    let bottomEdge = heightOf(up);         // bottom of the spine's block (its own branches sit below it)
    below.forEach((l, k) => {
      const lineY = bottomEdge + ROW, px = peel(k, below.length);
      doLine(l, lineY, J.x + COL, (x, ry) => [[J.x, J.y], [px, J.y], [px, ry], [x, ry]], J);
      bottomEdge = lineY + heightOf(l);
    });
  } else {
    // Phone: every list is its own column, side by side, all running down — like a route chart.
    // Upkeep leaves Today in the left column. At the junction the focus lists cross over as a small bundle
    // (furthest column on top, so nothing crosses), then turn down into their own columns.
    // Labels sit to the right of each stop, inside its column. A branch steps 22px in with a short diagonal.
    const STEP = 84, BX = 22, BUN = 12;
    const n = focus.length;
    const gap = n ? 20 + n * BUN : 0;                  // room under the junction for the crossing bundle
    const trunkUp = seqList(seqs, up.id, 'trunk');
    let jIdx = -1; trunkUp.forEach((t, i) => { if (t.anchor) jIdx = i; });
    const doCol = (l: Line, ci: number, firstCorners: (y: number) => Pt[], y0: number, gapAt: number): void => {
      const x0 = ci * COLW_V;
      let cur = y0;
      cols.push({ line: l, x: x0 });
      const place = (list: Task[], x: number, from: Station, labelBase: string, isTrunk: boolean): void => {
        let prev = from;
        list.forEach((t, j) => {
          const st: Station = { key: t.id, t, line: l, x, y: cur, side: 'r', idx: j, colR: x0 + COLW_V - 8,
            label: labelBase ? `${labelBase}/${j + 1}` : pad2(j + 1), old: isLeftover(t, today) };
          stations.push(st);
          let corners: Pt[];
          if (isTrunk && j === 0) corners = firstCorners(st.y);
          else if (prev.x !== x) corners = [[prev.x, prev.y], [prev.x, prev.y + 30], [x, prev.y + 30 + (x - prev.x)], [x, st.y]];   // clear of the label above
          else corners = [[prev.x, prev.y], [x, st.y]];
          const e = mkEdge(corners, l.color, st.key);
          if (isTrunk && j === 0 && ci > 0) e.under = true;   // shares the bundle before turning into its column
          edges.push(e);
          prev = st;
          cur += STEP;
          if (isTrunk && j === gapAt) cur += gap;
          forksOf(seqs, l.id, t.id).forEach(k => { place(seqList(seqs, l.id, k), x + BX, st, st.label, false); });
        });
        if (!list.length) {
          termini.push({ line: l, x, y: cur, empty: true, from: prev, vertical: true, branch: !isTrunk, stub: [...firstCorners(cur), [x, cur + 20]] });
        } else {
          termini.push({ line: l, x, y: prev.y, empty: false, from: prev, vertical: true, branch: !isTrunk, stub: [[x, prev.y], [x, prev.y + 30]] });
        }
      };
      place(seqList(seqs, l.id, 'trunk'), x0, ic, '', true);
    };
    doCol(up, 0, y0 => [[0, 0], [0, y0]], STEP, jIdx);
    findJunction();
    const firstY = (J === ic ? 0 : J.y) + STEP + gap;   // focus lists start level with the next Upkeep stop
    focus.forEach((l, i) => {
      const x = (i + 1) * COLW_V, d = 26 + (n - 1 - i) * BUN;
      doCol(l, i + 1, y0 => [[J.x, J.y], [J.x, J.y + 20], [J.x + d, J.y + 20 + d], [x - 20, J.y + 20 + d], [x, J.y + 40 + d], [x, y0]], firstY, -1);
    });
  }
  const byKey: Record<string, Station | undefined> = {}; stations.forEach(s => { byKey[s.key] = s; });
  const edgeTo: Record<string, Edge | undefined> = {}; edges.forEach(e => { edgeTo[e.to] = e; });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number): void => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  stations.forEach(s => grow(s.x, s.y));
  termini.forEach(tm => grow(tm.x + (tm.vertical ? 0 : (tm.branch ? 80 : 175)), tm.y + (tm.vertical ? 60 : 0)));
  if (!vertical) { x0 -= 110; y0 -= 95; x1 += 20; y1 += 30; }
  else { x0 = -22; y0 -= 24; x1 = Math.max(...cols.map(c => c.x)) + COLW_V; y1 += 40; }
  return { stations, byKey, edges, edgeTo, termini, bounds: { x0, y0, x1, y1 }, vertical, cols };
}
