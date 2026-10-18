// Pointer input on the map: tap = finish, hold = options, drag = pan, pinch / wheel = zoom; plus the zoom buttons.
import type { App } from '../app/context';
import type { Store } from '../app/store';
import { HEAD_V, headTop } from '../app/viewport';
import type { Dom } from '../ui/dom';
import { clampS, rubber, type Camera } from './camera';
import type { LabelRects } from './draw';

export function installMapInput(store: Store, dom: Dom, camera: Camera, labelRects: LabelRects, app: App): void {
  const st = store.state, cam = st.cam, cv = dom.map;

  function hit(sx: number, sy: number): string | null {
    if (st.map.vertical && sy < headTop(st.view) + HEAD_V) return null;   // the column-name row sits over the map
    const [wx, wy] = camera.toWorld(sx, sy);
    const rad = Math.max(20, 16 / cam.s);
    let best: string | null = null, bd = Infinity;
    st.map.stations.forEach(s => { if (!s.t) return; const d = Math.hypot(wx - s.x, wy - s.y); if (d < rad && d < bd) { bd = d; best = s.key; } });
    if (best) return best;
    for (const s of st.map.stations) {
      if (!s.t) continue;
      const r = labelRects[s.key];
      if (r && wx >= r[0] && wx <= r[0] + r[2] && wy >= r[1] && wy <= r[1] + r[3]) return s.key;
    }
    return null;
  }

  const pts = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; ox: number; oy: number; moved: boolean; held: boolean } | null = null;
  let pinch: { d: number; s: number; mx: number; my: number; ox: number; oy: number } | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;

  cv.addEventListener('pointerdown', e => {
    if (st.hold.swallowPtr) { st.hold.swallowPtr = false; return; }
    try { cv.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      drag = { x: e.clientX, y: e.clientY, ox: cam.ox, oy: cam.oy, moved: false, held: false };
      const key = e.button === 0 ? hit(e.clientX, e.clientY) : null;
      clearTimeout(holdTimer);
      if (key) holdTimer = setTimeout(() => { if (drag && !drag.moved) { drag.held = true; if (navigator.vibrate) navigator.vibrate(12); app.openMenu(key); } }, 480);
    }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: cam.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ox: cam.ox, oy: cam.oy };
      if (drag) drag.moved = true; clearTimeout(holdTimer);
    }
  });
  cv.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ns = clampS(pinch.s * d / pinch.d);
      const wx = (pinch.mx - pinch.ox) / pinch.s, wy = (pinch.my - pinch.oy) / pinch.s;
      cam.s = ns; cam.ox = mx - wx * ns; cam.oy = my - wy * ns; st.userMoved = true; st.camTarget = null;
      return;
    }
    if (drag && pts.has(e.pointerId)) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; clearTimeout(holdTimer); cv.classList.add('dragging'); }
      if (drag.moved) {
        if (st.map.vertical) { const L = camera.camLimits(cam.s); cam.ox = rubber(drag.ox + dx, L.minOx, L.maxOx); cam.oy = rubber(drag.oy + dy, L.minOy, L.maxOy); }
        else { cam.ox = drag.ox + dx; cam.oy = drag.oy + dy; }
        st.userMoved = true; st.camTarget = null;
      }
      return;
    }
    if (e.pointerType === 'mouse') { st.hoverKey = hit(e.clientX, e.clientY); cv.style.cursor = st.hoverKey ? 'pointer' : ''; }
  });
  function endPtr(e: PointerEvent, cancel: boolean): void {
    const wasDrag = drag;
    pts.delete(e.pointerId); clearTimeout(holdTimer);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      cv.classList.remove('dragging');
      if (st.map.vertical && wasDrag && wasDrag.moved) { const c = camera.clampCam(cam); if (c.ox !== cam.ox || c.oy !== cam.oy) st.camTarget = c; }   // spring back
      if (!cancel && wasDrag && !wasDrag.moved && !wasDrag.held && e.button === 0) { const key = hit(e.clientX, e.clientY); if (key) app.activate(key); }
      drag = null;
    }
  }
  cv.addEventListener('pointerup', e => endPtr(e, false));
  cv.addEventListener('pointercancel', e => endPtr(e, true));
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag) st.hoverKey = null; });
  cv.addEventListener('contextmenu', e => { e.preventDefault(); const key = hit(e.clientX, e.clientY); if (key) app.openMenu(key); });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (st.map.vertical && !e.ctrlKey) { Object.assign(cam, camera.clampCam({ s: cam.s, ox: cam.ox - e.deltaX, oy: cam.oy - e.deltaY })); st.userMoved = true; st.camTarget = null; return; }
    camera.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  dom.fitBtn.addEventListener('click', () => { st.camTarget = camera.fitCam(); st.userMoved = true; });
  dom.zoomIn.addEventListener('click', () => camera.zoomAt(...camera.viewCenter(), 1.25));
  dom.zoomOut.addEventListener('click', () => camera.zoomAt(...camera.viewCenter(), 0.8));
}
