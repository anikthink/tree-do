// Track geometry: rounded polylines and walking along them.

export type Pt = [number, number];

export interface Edge {
  pts: Pt[];
  /** Cumulative length at each point. */
  cum: number[];
  len: number;
  color: string;
  /** Station key the edge leads to. */
  to: string;
  /** Drawn first: shares another line's track before peeling off. */
  under?: boolean;
}

export function roundPolyline(c: Pt[], r: number): Pt[] {
  // Shared departures and adjacent routing legs can repeat a corner. Remove
  // duplicates before rounding so they cannot erase a real bend on either side.
  c = c.filter((p, i) => !i || p[0] !== c[i - 1][0] || p[1] !== c[i - 1][1]);
  const out: Pt[] = [c[0]];
  for (let i = 1; i < c.length - 1; i++) {
    const P = c[i], A = c[i - 1], Bp = c[i + 1];
    const l1 = Math.hypot(P[0] - A[0], P[1] - A[1]), l2 = Math.hypot(Bp[0] - P[0], Bp[1] - P[1]);
    if (l1 < 0.01 || l2 < 0.01) continue;
    const d1 = [(P[0] - A[0]) / l1, (P[1] - A[1]) / l1], d2 = [(Bp[0] - P[0]) / l2, (Bp[1] - P[1]) / l2];
    const theta = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
    if (theta < 0.01) { out.push(P); continue; }
    const t = Math.min(r * Math.tan(theta / 2), l1 / 2, l2 / 2);
    const a: Pt = [P[0] - d1[0] * t, P[1] - d1[1] * t], b: Pt = [P[0] + d2[0] * t, P[1] + d2[1] * t];
    out.push(a);
    for (let k = 1; k <= 8; k++) {
      const u = k / 8, iu = 1 - u;
      out.push([iu * iu * a[0] + 2 * iu * u * P[0] + u * u * b[0], iu * iu * a[1] + 2 * iu * u * P[1] + u * u * b[1]]);
    }
  }
  out.push(c[c.length - 1]);
  return out;
}

export function mkEdge(corners: Pt[], color: string, toKey: string): Edge {
  const pts = corners.length > 2 ? roundPolyline(corners, 26) : corners;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1], color, to: toKey };
}

/** Point and heading at distance `s` along the edge. */
export function pointAt(e: Edge, s: number): [number, number, number] {
  s = Math.max(0, Math.min(e.len, s));
  let i = 1;
  while (i < e.pts.length - 1 && e.cum[i] < s) i++;
  const a = e.pts[i - 1], b = e.pts[i];
  const seg = (e.cum[i] - e.cum[i - 1]) || 1;
  const u = (s - e.cum[i - 1]) / seg;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[1] - a[1], b[0] - a[0])];
}

/** The part of the edge between distances s0 and s1. */
export function subPts(e: Edge, s0: number, s1: number): Pt[] {
  const p0 = pointAt(e, s0), p1 = pointAt(e, s1);
  const out: Pt[] = [[p0[0], p0[1]]];
  for (let i = 0; i < e.pts.length; i++) if (e.cum[i] > s0 && e.cum[i] < s1) out.push(e.pts[i]);
  out.push([p1[0], p1[1]]);
  return out;
}
