// Drawing the map: tracks, termini, stations, labels, trains and the phone's sticky column names.
import type { Store } from '../app/store';
import { HEAD_V, headTop } from '../app/viewport';
import type { Line } from '../domain/types';
import { clamp01, dashed, easeBack, easeIO, easeOut, rr, setFont, solid, wrap } from './canvas';
import { subPts } from './geometry';
import type { Station } from './layout';
import { countdown, metaFor, vstate } from './status';
import { drawDings, drawTrains } from './trains';

/** Label hit boxes in world coordinates: [x, y, w, h], refreshed every frame. */
export type LabelRects = Record<string, [number, number, number, number] | undefined>;

// The check: three points, drawn as a stroke so it can be "ticked" in.
const TICK_PTS: [number, number][] = [[-3.1, 0.2], [-0.9, 2.4], [3.3, -2.3]];
const TICK_LEN = Math.hypot(2.2, 2.2) + Math.hypot(4.2, 4.7);
const lineTextColor = (line: Line): string => line.text || line.color;
/** How long ticking a task takes to fill its track in solid. */
const FILL_MS = 450;

export function createRenderer(store: Store, ctx: CanvasRenderingContext2D) {
  const st = store.state, view = st.view, cam = st.cam;
  const labelRects: LabelRects = {};
  const NAME_FONT = (w: number, s?: number): void => setFont(ctx, w, s || 13.5, 'Figtree');
  const META_FONT = (w: number, s?: number): void => setFont(ctx, w, s || 11, 'Figtree');
  const animTo = (key: string) => st.anims.find(a => a.e.to === key);
  // keep names 13–14px on screen when the whole map is zoomed out to fit
  const labelK = (): number => Math.max(1, Math.min(1.4, 0.95 / cam.s));

  // Track is dashed until the task it leads to is done: grey while later, the line's colour once ready
  // (a train paints it in as it runs). Ticking a task fills its track in solid.
  function drawEdges(now: number): void {
    type Piece = [ReturnType<typeof subPts>, string, number];
    const ready: Piece[] = [], solids: Piece[] = [];
    const NET = st.map;
    [...NET.edges.filter(e => e.under), ...NET.edges.filter(e => !e.under)].forEach(e => {
      const v = vstate(st, e.to);
      if (v === 'done' || v === 'done-ic') {
        const pa = st.popAt[e.to];
        const p = pa == null || st.reducedMotion ? 1 : clamp01((now - pa) / FILL_MS);
        const s = easeOut(p) * e.len;
        if (s < e.len) ready.push([subPts(e, s, e.len), e.color, s]);
        if (s > 0) solids.push([subPts(e, 0, s), e.color, 0]);
        return;
      }
      const a = animTo(e.to);
      if (a) {
        const p = clamp01((now - a.t0) / Math.max(1, a.dur));
        const s = easeIO(p) * e.len;
        if (s < e.len) dashed(ctx, subPts(e, s, e.len), undefined, s);
        if (s > 0) ready.push([subPts(e, 0, s), e.color, 0]);
      } else if (v === 'open') ready.push([e.pts, e.color, 0]);
      else dashed(ctx, e.pts);
    });
    ready.forEach(([p, c, o]) => dashed(ctx, p, c, o));
    solids.forEach(([p, c]) => solid(ctx, p, c));
  }
  // Termini: a small rounded pill with the line's name, in its colour on a 10% tint.
  function drawTermini(): void {
    const k = labelK();
    st.map.termini.forEach(tm => {
      const l = tm.line;
      const v = tm.empty ? 'locked' : vstate(st, tm.from.key);
      if (v === 'done' || v === 'done-ic') solid(ctx, tm.stub, l.color); else dashed(ctx, tm.stub);
      if (tm.branch) return;
      const end = tm.stub[tm.stub.length - 1];
      setFont(ctx, 600, 11.5 * k, 'Figtree');
      const w = Math.ceil(ctx.measureText(l.name).width) + 20 * k, h = 22 * k;
      const bx = tm.vertical ? end[0] - 11 * k : end[0] + 10, by = tm.vertical ? end[1] + 8 : end[1] - h / 2;
      rr(ctx, bx, by, w, h, h / 2); ctx.fillStyle = l.tint; ctx.fill();
      ctx.fillStyle = l.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(l.name, bx + 10 * k, by + h / 2 + 0.5);
      if (tm.empty) {
        META_FONT(500, 11 * k); ctx.fillStyle = '#6B7480'; ctx.textBaseline = 'top';
        ctx.fillText('Nothing today', bx + (tm.vertical ? w + 8 : 10), tm.vertical ? by + 4 : by + h + 5);
      }
    });
  }
  function stationPos(s: Station, now: number): [number, number] {
    let x = s.x, y = s.y; const sh = st.shakeAt[s.key];
    if (sh != null && !st.reducedMotion) { const p = (now - sh) / 460; if (p < 1) { const d = Math.sin(p * Math.PI * 6) * 5 * (1 - p); if (st.map.vertical) y += d; else x += d; } }
    return [x, y];
  }
  function drawStation(s: Station, now: number): void {
    const isIC = !s.t, v = isIC ? 'ic' : vstate(st, s.key), col = s.line.color;
    const [x, y] = stationPos(s, now);
    const hov = st.hoverKey === s.key;
    ctx.save(); ctx.translate(x, y); ctx.setLineDash([]);
    if (v === 'ic') {
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#1C2430'; ctx.stroke();
    } else if (v === 'locked') {
      const r = hov ? 4.5 : 3.5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 1.75; ctx.strokeStyle = hov ? '#8E97A3' : '#BFC6CF'; ctx.stroke();
    } else if (v === 'open') {
      // boarding: white with a ring in the line's colour, breathing very slightly
      const ph = st.reducedMotion ? 0 : ((now + s.x * 2.3 + s.y * 1.7) % 2600) / 2600;
      const b = 1 + 0.09 * (0.5 - 0.5 * Math.cos(ph * Math.PI * 2));
      const r = (hov ? 6.5 : 5.5) * b;
      ctx.beginPath(); ctx.arc(0, 0, r + 3.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
    } else {
      // done: a filled circle that "gets ticked" — fill settles in, then the check draws itself
      const pa = st.popAt[s.key];
      const p = pa != null && !st.reducedMotion ? clamp01((now - pa) / 520) : 1;
      const r = 7, sc = p < 1 ? 0.72 + 0.28 * easeBack(clamp01(p / 0.42)) : 1;
      ctx.beginPath(); ctx.arc(0, 0, r + 1.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r * sc, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      const cp = easeOut(clamp01((p - 0.28) / 0.6));
      if (cp > 0) {
        ctx.beginPath(); ctx.moveTo(...TICK_PTS[0]); ctx.lineTo(...TICK_PTS[1]); ctx.lineTo(...TICK_PTS[2]);
        if (cp < 1) ctx.setLineDash([TICK_LEN * cp, TICK_LEN]);
        ctx.lineWidth = 1.9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (st.focusedKey === s.key) { ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = '#2F7CF6'; ctx.stroke(); }
    ctx.restore();
  }
  function drawLabel(s: Station, now: number): void {
    const v = s.t ? vstate(st, s.key) : 'ic';
    const [x0, y0s] = stationPos(s, now);
    const title = s.t ? s.t.title : 'Today';
    const maxW = st.map.vertical ? (s.colR ? s.colR - s.x - 15 : 120) : 150;
    const k = labelK();
    const nameW = v === 'ic' ? 700 : v === 'open' ? 600 : 500, nameS = (v === 'ic' ? 14 : 13.5) * k;
    NAME_FONT(nameW, nameS);
    const lines = wrap(ctx, title, maxW);
    const cd = s.t ? countdown(st, s) : '';
    const meta = [metaFor(s), cd].filter(Boolean).join(' · ');
    // phone columns: meta wraps at its dots so it never spills into the next column
    let metaLines = meta ? [meta] : [];
    if (meta && st.map.vertical) {
      META_FONT(500, 11 * k); metaLines = [];
      meta.split(' · ').forEach(b => { const n = metaLines.length, tryS = n ? metaLines[n - 1] + ' · ' + b : b;
        if (n && ctx.measureText(tryS).width <= maxW) metaLines[n - 1] = tryS; else metaLines.push(b); });
      NAME_FONT(nameW, nameS);
    }
    const lh = 17 * k, mh = metaLines.length * 15 * k, blockH = lines.length * lh + mh;
    let x = x0, align: CanvasTextAlign = 'center', y0 = 0;
    switch (s.side) {
      case 'a': y0 = y0s - 13 - blockH; break;
      case 'l': y0 = y0s - blockH / 2; align = 'right'; x = x0 - 18; break;
      case 'r': y0 = y0s - blockH / 2 + 1; align = 'left'; x = x0 + (s.t ? 15 : 19); break;
    }
    ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
    ctx.fillStyle = v === 'done' ? '#6B7480' : v === 'locked' ? (st.hoverKey === s.key ? '#1C2430' : '#3F4856') : '#1C2430';
    let mw = 0;
    lines.forEach((ln, i) => {
      const yy = y0 + i * lh;
      ctx.lineWidth = 4 * k; ctx.strokeStyle = '#fff'; ctx.strokeText(ln, x, yy); ctx.fillText(ln, x, yy);
      mw = Math.max(mw, ctx.measureText(ln).width);
    });
    if (meta) {
      META_FONT(500, 11 * k);
      ctx.fillStyle = v === 'open' && cd ? lineTextColor(s.line) : '#6B7480';
      metaLines.forEach((ml, i) => {
        const yy = y0 + lines.length * lh + k + i * 15 * k;
        ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(ml, x, yy); ctx.fillText(ml, x, yy);
        mw = Math.max(mw, ctx.measureText(ml).width);
      });
    }
    const rx = align === 'center' ? x - mw / 2 : align === 'right' ? x - mw : x;
    labelRects[s.key] = [rx - 4, y0 - 4, mw + 8, blockH + 8];
  }
  // Phone: a sticky row of column names over the map; it follows the map sideways.
  function drawColumnHeads(): void {
    const { W, dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const top = headTop(view), h = HEAD_V;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, top + h - 6);
    const g = ctx.createLinearGradient(0, top + h - 6, 0, top + h + 6);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, top + h - 6, W, 12);
    setFont(ctx, 600, 11.5, 'Figtree'); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    st.map.cols.forEach(c => {
      const tw = Math.ceil(ctx.measureText(c.line.name).width), w = tw + 26, ch = 22;
      const sx = c.x * cam.s + cam.ox, bx = sx - 11, by = top + (h - ch) / 2 - 2;
      if (bx > W || bx + w < 0) return;
      rr(ctx, bx, by, w, ch, 7); ctx.fillStyle = '#F4F6F9'; ctx.fill();
      ctx.beginPath(); ctx.arc(sx, by + ch / 2, 3.5, 0, Math.PI * 2); ctx.fillStyle = c.line.color; ctx.fill();
      ctx.fillStyle = '#1C2430'; ctx.fillText(c.line.name, sx + 9, by + ch / 2 + 0.5);
    });
  }
  function draw(now: number): void {
    const { W, H, dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.ox, dpr * cam.oy);
    drawEdges(now);
    drawTermini();
    st.map.stations.forEach(s => drawStation(s, now));
    drawTrains(ctx, st, now);
    drawDings(ctx, st, now);
    st.map.stations.forEach(s => drawLabel(s, now));
    if (st.map.vertical) drawColumnHeads();
  }
  return { draw, labelRects };
}
