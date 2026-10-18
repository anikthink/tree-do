// Small canvas drawing helpers and easings.
import type { Pt } from './geometry';

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
export function strokePts(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
/** Painted track: the line's colour on a white casing. */
export function solid(ctx: CanvasRenderingContext2D, pts: Pt[], color: string): void {
  ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; strokePts(ctx, pts);
  ctx.strokeStyle = color; ctx.lineWidth = 5; strokePts(ctx, pts);
}
/** Planned track: a thin, quiet grey line. */
export function dashed(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#D5D9E0'; ctx.lineWidth = 2; strokePts(ctx, pts);
}
export function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number, family: string): void {
  ctx.font = `${weight} ${size}px ${family}`;
}
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' '); const lines: string[] = []; let cur = '';
  words.forEach(w => { const tryS = cur ? cur + ' ' + w : w; if (ctx.measureText(tryS).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryS; });
  if (cur) lines.push(cur);
  return lines;
}
export const easeIO = (p: number): number => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
export const easeOut = (p: number): number => 1 - Math.pow(1 - p, 3);
export const easeBack = (p: number): number => { const c = 1.25; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
