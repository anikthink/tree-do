// Trains: when a task becomes reachable, a train runs down the track to it; arriving paints the track.
import type { AppState } from '../app/store';
import { easeIO, easeOut, rr } from './canvas';
import { pointAt, type Edge } from './geometry';

export interface Anim { e: Edge; t0: number; dur: number }
/** A soft ring that widens and fades (arrivals and ticks). */
export interface Ding { x: number; y: number; color: string; t0: number; big: boolean }

/** Everything already reachable counts as arrived (no trains): start-up, undo, edits. */
export function seedArrived(st: AppState): void {
  st.arrived.clear();
  Object.keys(st.states).forEach(k => { if (st.states[k] !== 'locked') st.arrived.add(k); });
}

/** Anything that just became reachable gets a train. */
export function dispatchTrains(st: AppState, now: number): void {
  let i = 0;
  const RM = st.reducedMotion;
  st.map.stations.filter(s => s.t).forEach(s => {
    if (st.states[s.key] !== 'locked' && !st.arrived.has(s.key) && !st.anims.some(a => a.e.to === s.key)) {
      const e = st.map.edgeTo[s.key];
      if (!e) { st.arrived.add(s.key); return; }
      st.anims.push({ e, t0: now + (RM ? 0 : 200 + i * 140), dur: RM ? 0 : Math.min(1500, 520 + e.len * 1.5) });
      i++;
    }
  });
}

/** Retire trains that have arrived. */
export function finishTrains(st: AppState, now: number, arrive: (key: string, now: number) => void): void {
  if (!st.anims.length) return;
  const fin = st.anims.filter(a => now >= a.t0 + a.dur);
  if (fin.length) { st.anims = st.anims.filter(a => now < a.t0 + a.dur); fin.forEach(a => arrive(a.e.to, now)); }
}

/** The train: a small rounded white capsule outlined in the line's colour, with a faint shadow. */
export function drawTrains(ctx: CanvasRenderingContext2D, st: AppState, now: number): void {
  st.anims.forEach(a => {
    if (now < a.t0) return;
    const p = Math.min(1, (now - a.t0) / Math.max(1, a.dur));
    const [x, y, ang] = pointAt(a.e, easeIO(p) * a.e.len);
    ctx.save(); ctx.translate(x, y + 1.5); ctx.rotate(ang);
    rr(ctx, -13, -6.5, 26, 13, 6.5); ctx.fillStyle = 'rgba(15,23,42,.10)'; ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    rr(ctx, -12, -5.5, 24, 11, 5.5); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = a.e.color; ctx.stroke();
    ctx.beginPath(); ctx.arc(5.5, 0, 1.8, 0, Math.PI * 2); ctx.fillStyle = a.e.color; ctx.fill();
    ctx.restore();
  });
}

/** Arrival (and ticks): one soft ring that widens and fades. */
export function drawDings(ctx: CanvasRenderingContext2D, st: AppState, now: number): void {
  st.dings = st.dings.filter(d => now - d.t0 < 650);
  st.dings.forEach(d => {
    const p = Math.max(0, (now - d.t0) / 650);
    const r = 9 + easeOut(p) * (d.big ? 18 : 10);
    ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
    ctx.globalAlpha = 0.45 * (1 - p); ctx.lineWidth = 1.75; ctx.strokeStyle = d.color; ctx.stroke(); ctx.globalAlpha = 1;
  });
}
