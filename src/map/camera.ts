// The camera: fitting the map around the panel, panning limits on phones, easing to targets.
import { isDone } from '../domain/rules';
import type { Cam, Store } from '../app/store';
import { CARD_W, COLW_V, PEEK, isDesk, isWide, mapTopV } from '../app/viewport';

/** What the camera needs to know about the sheet covering part of the map. */
export interface SheetMetrics { expanded(): boolean; height(): number }
export interface Insets { top: number; bottom: number; left: number; right: number }
export interface MapView { left: number; right: number; top: number; bottom: number }

export const clampS = (s: number): number => Math.max(0.25, Math.min(2.6, s));
/** Rubber-band past the ends. */
export const rubber = (v: number, lo: number, hi: number): number => v > hi ? hi + (v - hi) * 0.35 : v < lo ? lo - (lo - v) * 0.35 : v;

export type Camera = ReturnType<typeof createCamera>;

export function createCamera(store: Store, sheet: SheetMetrics) {
  const st = store.state, view = st.view, cam = st.cam;

  function insets(): Insets {
    // Desktop frames the map above the peeking card; when the card grows, keepStartClear() slides the map right.
    if (isWide(view)) return { top: 54, bottom: 16, left: 16 + CARD_W + 12, right: 18 };
    return isDesk(view) ? { top: 54, bottom: 16 + PEEK + 16, left: 0, right: 18 }
                        : { top: 44, bottom: PEEK + view.safeB + 8, left: 0, right: 0 };        // clear of the peeking sheet
  }
  function fitCam(): Cam {
    const NET = st.map, B = NET.bounds, I = insets(), W = view.W, H = view.H;
    const top = I.top + 8, bot = I.bottom + 12, padL = I.left + (NET.vertical ? 8 : 18), padR = I.right + (NET.vertical ? 8 : 18);
    const aw = W - padL - padR, ah = H - top - bot;
    const bw = B.x1 - B.x0, bh = B.y1 - B.y0;
    let s = Math.min(aw / bw, ah / bh, 1.15);
    if (NET.vertical) {
      // Columns: real size (names 13.5px), Upkeep at the left; if the first ready task sits in a column further right,
      // slide just far enough to bring that column in.
      s = 1;
      const c = { s, ox: 6 - B.x0 * s, oy: mapTopV(view) - B.y0 * s };
      const ready = NET.stations.find(x => x.t && st.states[x.key] === 'avail' && !isDone(x.t, st.today));
      if (ready) {
        const col = NET.cols.find(k => k.line === ready.line);
        if (col && (col.x + COLW_V) * s + c.ox > W - 4) c.ox = W - 4 - (col.x + COLW_V) * s;
      }
      return clampCam(c);
    }
    return { s, ox: padL + (aw - bw * s) / 2 - B.x0 * s, oy: top + (ah - bh * s) / 2 - B.y0 * s };
  }
  // Phone columns: keep the map inside its bounds (rubber-banding past them while dragging).
  function camLimits(s: number) {
    const B = st.map.bounds, I = insets();
    const maxOx = 6 - B.x0 * s; let minOx = view.W - 6 - B.x1 * s; if (minOx > maxOx) minOx = maxOx;
    const maxOy = mapTopV(view) - B.y0 * s; let minOy = view.H - I.bottom - 8 - B.y1 * s; if (minOy > maxOy) minOy = maxOy;
    return { minOx, maxOx, minOy, maxOy };
  }
  function clampCam(c: Cam): Cam {
    if (!st.map.vertical) return c;
    const L = camLimits(c.s);
    return { s: c.s, ox: Math.max(L.minOx, Math.min(L.maxOx, c.ox)), oy: Math.max(L.minOy, Math.min(L.maxOy, c.oy)) };
  }
  function homeView(): Cam {
    const f = fitCam(), I = insets(), B = st.map.bounds;
    if (!st.map.vertical && f.s < 0.42) {
      const avail = view.H - I.top - I.bottom;
      const s = Math.max(f.s, Math.min(0.7, (avail - 60) / (B.y1 - B.y0)));
      return { s, ox: I.left + 18 - B.x0 * s, oy: I.top + (avail - 30) / 2 - ((B.y0 + B.y1) / 2) * s };
    }
    return f;
  }
  function initialView(): void { Object.assign(cam, homeView()); st.camTarget = null; keepStartClear(true); }
  // The docked card must never sit on the start of the map (Today). If it would, slide the map right, same zoom.
  function keepStartClear(instant?: boolean): void {
    const ic = st.map.byKey.IC;
    if (!isDesk(view) || isWide(view) || !ic) return;
    const expanded = sheet.expanded(), base = st.camTarget || cam;
    if (!expanded) { if (!st.userMoved && !instant) st.camTarget = homeView(); return; }
    const lp = (st.map.vertical ? 30 : 115) * base.s;
    const sx = ic.x * base.s + base.ox, sy = ic.y * base.s + base.oy;
    const cardRight = 16 + CARD_W + 20, cardTop = view.H - 16 - sheet.height() - 30;
    if (sx - lp < cardRight && sy > cardTop) {
      const t = { s: base.s, ox: base.ox + (cardRight - (sx - lp)), oy: base.oy };
      if (instant) Object.assign(cam, t); else st.camTarget = t;
    }
  }
  function toWorld(sx: number, sy: number): [number, number] { return [(sx - cam.ox) / cam.s, (sy - cam.oy) / cam.s]; }
  function zoomAt(sx: number, sy: number, f: number): void {
    const ns = clampS(cam.s * f);
    const [wx, wy] = toWorld(sx, sy);
    cam.s = ns; cam.ox = sx - wx * ns; cam.oy = sy - wy * ns;
    if (st.map.vertical) Object.assign(cam, clampCam(cam));
    st.userMoved = true; st.camTarget = null;
  }
  // the part of the screen the sheet isn't covering
  function mapView(): MapView {
    const I = insets(), W = view.W, H = view.H;
    if (isDesk(view)) return sheet.expanded() ? { left: 16 + CARD_W + 16, right: W - I.right, top: I.top, bottom: H - 16 }
                                              : { left: 0, right: W - I.right, top: I.top, bottom: H - I.bottom };
    const bottom = H - sheet.height();
    return { left: 0, right: W, top: I.top, bottom: Math.max(I.top + 120, bottom) };
  }
  function viewCenter(): [number, number] { const v = mapView(); return [(v.left + v.right) / 2, (v.top + v.bottom) / 2]; }
  function ensureVisible(key: string): void {
    const s = st.map.byKey[key]; if (!s) return;
    const v = mapView();
    const sx = s.x * cam.s + cam.ox, sy = s.y * cam.s + cam.oy;
    const L = v.left + 60, R = v.right - 60, T = v.top + 40, Bm = v.bottom - 40;
    if (sx < L || sx > R || sy < T || sy > Bm) {
      st.camTarget = st.map.vertical
        ? clampCam({ s: cam.s, ox: sx < L || sx > view.W - 150 ? v.left + 28 - s.x * cam.s : cam.ox, oy: (T + Bm) / 2 - s.y * cam.s })
        : { s: cam.s, ox: (L + R) / 2 - s.x * cam.s, oy: (T + Bm) / 2 - s.y * cam.s };
      st.userMoved = true;
    }
  }
  /** Ease toward the target, one frame. */
  function step(): void {
    const target = st.camTarget;
    if (!target) return;
    const k = st.reducedMotion ? 1 : 0.18;
    cam.s += (target.s - cam.s) * k; cam.ox += (target.ox - cam.ox) * k; cam.oy += (target.oy - cam.oy) * k;
    if (Math.abs(target.ox - cam.ox) < 0.5 && Math.abs(target.oy - cam.oy) < 0.5 && Math.abs(target.s - cam.s) < 0.002) { Object.assign(cam, target); st.camTarget = null; }
  }
  return { insets, fitCam, camLimits, clampCam, homeView, initialView, keepStartClear, toWorld, zoomAt, mapView, viewCenter, ensureVisible, step };
}
