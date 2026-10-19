// Desktop branch placement. Pack whole subtrees so later forks cannot cut through them.
import { forksOf, seqList, type TodayNetwork } from '../domain/network';
import { isLeftover } from '../domain/rules';
import { pad2 } from '../domain/time';
import type { Line, Task } from '../domain/types';
import { mkEdge, type Pt } from './geometry';
import type { Station, Terminus } from './layout';
import { metaFor } from './status';

interface Stop extends Station { width: number; height: number }
interface Track { from: string; to: string; points: Pt[]; color: string; under?: boolean }
interface Block { stops: Stop[]; tracks: Track[]; ends: Terminus[] }
interface Rect { x: number; y: number; w: number; h: number }
const COL = 186, LANE = 96;
const box = (s: Stop): Rect => ({ x: s.x - s.width / 2 - 6, y: s.y - 18 - s.height, w: s.width + 12, h: s.height + 10 });
const dot = (s: Stop): Rect => ({ x: s.x - 10, y: s.y - 10, w: 20, h: 20 });
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inside = (p: Pt, b: Rect): boolean => p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h;
function segments(p: Pt[]): [Pt, Pt][] { return p.slice(1).map((b, i) => [p[i], b]); }
function cross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const ax = b[0] - a[0], ay = b[1] - a[1], bx = d[0] - c[0], by = d[1] - c[1];
  const dx = c[0] - a[0], dy = c[1] - a[1], den = ax * by - ay * bx;
  if (Math.abs(den) < 1e-7) {
    if (Math.abs(dx * ay - dy * ax) > 1e-7) return false;
    const k = Math.abs(ax) > Math.abs(ay) ? 0 : 1;
    return Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k])) - Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k])) > .1;
  }
  const t = (dx * by - dy * bx) / den, u = (dx * ay - dy * ax) / den;
  return t > 1e-5 && t < 1 - 1e-5 && u > 1e-5 && u < 1 - 1e-5;
}
function through(points: Pt[], b: Rect): boolean {
  const corners: Pt[] = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x, b.y]];
  return segments(points).some(([a, c]) => inside(a, b) || inside(c, b) || segments(corners).some(([d, e]) => cross(a, c, d, e)));
}
function collides(a: Block, b: Block): boolean {
  for (const n of a.stops) {
    for (const p of b.stops) if (overlap(box(n), box(p)) || overlap(box(n), dot(p)) || overlap(dot(n), box(p)) || overlap(dot(n), dot(p))) return true;
    for (const e of b.tracks) if (through(e.points, box(n)) || (e.from !== n.key && e.to !== n.key && through(e.points, dot(n)))) return true;
  }
  for (const p of b.stops) for (const e of a.tracks) if (through(e.points, box(p)) || (e.from !== p.key && e.to !== p.key && through(e.points, dot(p)))) return true;
  for (const e of a.tracks) for (const f of b.tracks) for (const [p, q] of segments(e.points)) for (const [r, s] of segments(f.points)) {
    const shared = e.from === f.from && (e.under || f.under) && p[1] === q[1] && r[1] === s[1] && p[1] === r[1] && p[1] === e.points[0][1];
    if (!shared && cross(p, q, r, s)) return true;
  }
  return false;
}
const block = (): Block => ({ stops: [], tracks: [], ends: [] });
function merge(a: Block, b: Block): void { a.stops.push(...b.stops); a.tracks.push(...b.tracks); a.ends.push(...b.ends); }
function move(b: Block, dx: number, dy: number): Block {
  const stops = b.stops.map(s => ({ ...s, x: s.x + dx, y: s.y + dy }));
  const point = ([x, y]: Pt): Pt => [x + dx, y + dy];
  return { stops, tracks: b.tracks.map(e => ({ ...e, points: e.points.map(point) })), ends: b.ends.map(e => ({ ...e, x: e.x + dx, y: e.y + dy, from: stops.find(s => s.key === e.from.key) ?? e.from, stub: e.stub.map(point) })) };
}

/** Label measurements use the renderer's largest desktop font size, independent of zoom/state. */
export function desktopLayout(net: TodayNetwork, ic: Station): { stations: Station[]; edges: ReturnType<typeof mkEdge>[]; termini: Terminus[] } {
  const ctx = typeof document !== 'undefined' && typeof CanvasRenderingContext2D !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  const measure = (text: string, size: number): number => {
    if (ctx) { ctx.font = `600 ${size}px Figtree, sans-serif`; return ctx.measureText(text).width; }
    return text.length * size * .55;
  };
  const stop = (t: Task, line: Line, idx: number, base: string): Stop => {
    const s: Stop = { key: t.id, t, line, x: 0, y: 0, side: 'a', idx, label: base ? `${base}/${idx + 1}` : pad2(idx + 1), old: isLeftover(t, net.today), width: 0, height: 0 };
    const rows: string[] = []; let row = '';
    for (const word of t.title.split(' ')) { const next = row ? `${row} ${word}` : word; if (row && measure(next, 18.9) > 150) { rows.push(row); row = word; } else row = next; }
    rows.push(row);
    const meta = metaFor(s) + (t.time ? ' · in 90 min' : '');
    s.width = Math.max(...rows.map(r => measure(r, 18.9)), measure(meta, 15.4));
    s.height = rows.length * 23.8 + (meta ? 21 : 0);
    return s;
  };
  const track = (a: Station, b: Station, points: Pt[], under = false): Track => ({ from: a.key, to: b.key, color: b.line.color, points, under });
  const focus = net.lines.slice(1), above = focus.filter((_, i) => i % 2 === 0), below = focus.filter((_, i) => i % 2 === 1);
  const junctionTask = net.order.find(t => t.id === net.junction);
  const junctionWidth = junctionTask ? stop(junctionTask, net.lines[0], 0, '').width : 0;
  const peelBase = Math.max(58, junctionWidth / 2 + 18);
  const departure = peelBase + Math.max(above.length, below.length) * 13 + 18;
  function pack(list: Task[], line: Line, base = '', gap = 0): Block {
    const m = block(); let x = 0;
    list.forEach((t, i) => {
      const n = stop(t, line, i, base), prev = m.stops.at(-1);
      if (prev) x = Math.max(x, prev.x + COL, prev.x + prev.width / 2 + n.width / 2 + 32);
      if (prev?.key === net.junction && focus.length) x = Math.max(x, prev.x + departure + n.width / 2 + 24);
      if (t.id === net.junction) x += gap;
      n.x = x; m.stops.push(n);
      if (prev) m.tracks.push(track(prev, n, [[prev.x, 0], [x, 0]]));
      x += COL;
    });
    const trunk = [...m.stops];
    if (trunk.length) { const end = trunk.at(-1)!; m.ends.push({ line, x: end.x, y: 0, empty: false, from: end, vertical: false, branch: !!base, stub: [[end.x, 0], [end.x + 30, 0]] }); }
    for (let i = list.length - 1; i >= 0; i--) {
      const root = trunk[i], forks = forksOf(net.seqs, line.id, root.key);
      for (let j = forks.length - 1; j >= 0; j--) {
        const sub = pack(seqList(net.seqs, line.id, forks[j]), line, root.label);
        if (!sub.stops.length) continue;
        let best: Block | undefined, score = Infinity;
        // An upper category prefers branches toward the center; Upkeep prefers above.
        const preferred = above.includes(line) ? 1 : -1;
        for (let lane = 1; ; lane++) {
          for (const sign of [preferred, -preferred]) {
            const dy = sign * lane * LANE, peel = Math.max(root.key === net.junction ? departure : 0, sign < 0 ? root.width / 2 + 18 : 0) + j * 16;
            const dx = root.x + Math.max(COL, peel + 88 + sub.stops[0].width / 2 + 22);
            const candidate = move(sub, dx, dy), first = candidate.stops[0];
            candidate.tracks.unshift(track(root, first, [[root.x, 0], [root.x + peel, 0], [root.x + peel + 88, sign * (lane === 1 ? Math.abs(dy) : 88)], [root.x + peel + 88, dy], [first.x, dy]], true));
            if (collides(candidate, m)) continue;
            const stops = [...m.stops, ...candidate.stops];
            const height = Math.max(...stops.map(s => s.y)) - Math.min(...stops.map(s => box(s).y));
            const cost = height * .1 + lane * 200 + (sign !== preferred ? 100 : 0);
            if (cost < score) { best = candidate; score = cost; }
          }
          if (best && lane >= 3) break;
        }
        merge(m, best!);
      }
    }
    return m;
  }
  const up = net.lines[0], trunk = seqList(net.seqs, up.id, 'trunk');
  let local = pack(trunk, up);
  // Early branches must finish before the shared category turnoffs.
  const ji = trunk.findIndex(t => t.id === net.junction);
  if (ji > 0) {
    const ids = new Set<string>();
    const collect = (list: Task[]): void => { for (const t of list) { ids.add(t.id); forksOf(net.seqs, up.id, t.id).forEach(k => collect(seqList(net.seqs, up.id, k))); } };
    trunk.slice(0, ji).forEach(t => forksOf(net.seqs, up.id, t.id).forEach(k => collect(seqList(net.seqs, up.id, k))));
    const early = local.stops.filter(s => ids.has(s.key));
    const junction = local.stops.find(s => s.key === net.junction)!;
    if (early.length) { const right = Math.max(...early.map(s => s.x + s.width / 2)) + 40; if (right > junction.x) local = pack(trunk, up, '', right - junction.x); }
  }
  const all = move(local, 150, 0);
  const j = all.stops.find(s => s.key === net.junction) ?? ic;
  if (all.stops.length) all.tracks.unshift(track(ic, all.stops[0], [[0, 0], [150, 0]]));
  else all.ends.push({ line: up, x: 90, y: 0, empty: true, from: ic, vertical: false, branch: false, stub: [[0, 0], [120, 0]] });
  for (const [lines, sign] of [[above, -1], [below, 1]] as const) {
    let last = 0;
    lines.forEach((line, k) => {
      const part = pack(seqList(net.seqs, line.id, 'trunk'), line), px = j.x + peelBase + (lines.length - 1 - k) * 13;
      for (let row = 0; ; row++) {
        const y = last + sign * (150 + row * 40), candidate = move(part, Math.max(j.x + COL, px + (part.stops[0]?.width ?? 0) / 2 + 24), y), first = candidate.stops[0];
        const points: Pt[] = [[j.x, j.y], [px, j.y], [px, y], [first?.x ?? j.x + COL - 30, y]];
        if (first) candidate.tracks.unshift(track(j, first, points, true));
        else { candidate.tracks.push({ from: j.key, to: '', color: line.color, points, under: true }); candidate.ends.push({ line, x: j.x + COL - 60, y, empty: true, from: j, vertical: false, branch: false, stub: points }); }
        if (collides(candidate, all)) continue;
        merge(all, candidate); last = y; break;
      }
    });
  }
  return { stations: all.stops, edges: all.tracks.filter(e => e.to).map(e => ({ ...mkEdge(e.points, e.color, e.to), under: e.under })), termini: all.ends };
}
