// The panel as a sheet: snap points (peek / half / full) with a spring, dragged by its handle.
// On wide screens it is pinned open beside the map.
import type { App, SnapOpts } from '../app/context';
import type { Snap, Store } from '../app/store';
import { PEEK, isDesk, isWide } from '../app/viewport';
import type { Dom } from './dom';

export const SNAPS: Snap[] = ['peek', 'half', 'full'];
const SPRING_K = 380, ZETA = 0.74, OVERSHOOT = 0.06;   // ζ 0.74 ≈ 3% natural overshoot; hard-capped at 6%
const SNAP_WORD: Record<Snap, string> = { peek: 'collapsed', half: 'half open', full: 'fully open' };

export function createSheet(store: Store, dom: Dom, app: App) {
  const st = store.state, view = st.view, sp = st.sheet.spring, sheet = st.sheet;
  const { sheet: sheetEl, grab, ctrl: ctrlEl } = dom;

  function snapH(name: Snap): number {
    const H = view.H;
    if (isWide(view)) return H - 32;                         // pinned: always the full panel
    const desk = isDesk(view), peek = PEEK + (desk ? 0 : view.safeB);
    const full = Math.max(peek, desk ? H - 16 - 62 : H - 50);
    if (name === 'peek') return peek;
    if (name === 'full') return full;
    if (st.hold.key) {   // hold: tall enough for every action row
      const need = 30 + dom.holdHead.offsetHeight + dom.hacts.scrollHeight + 6;
      return Math.min(full, Math.max(need, 260));
    }
    return Math.min(full, desk ? Math.min(480, H * 0.62) : Math.round(Math.max(340, H * 0.56)));
  }
  const sheetH = (): number => sp.target;
  const sheetExpanded = (): boolean => !!st.hold.key || sheet.snap !== 'peek';
  function applyH(h: number): void {
    sp.h = h;
    sheetEl.style.height = h.toFixed(1) + 'px';
    sheetEl.classList.toggle('is-full', !st.hold.key && (isWide(view) || h > (snapH('half') + snapH('full')) / 2));
    if (isDesk(view)) { ctrlEl.style.bottom = ''; ctrlEl.classList.remove('hidden'); }
    else { ctrlEl.style.bottom = (h + 12) + 'px'; ctrlEl.classList.toggle('hidden', h > view.H * 0.6); }
    app.placeNotice();
  }
  function springTo(target: number, v0?: number): void {
    sp.target = target; sp.from = sp.h; if (v0 != null) sp.v = v0;
    if (st.reducedMotion) { sp.v = 0; if (sp.raf) cancelAnimationFrame(sp.raf); sp.raf = 0; applyH(target); return; }
    if (!sp.raf) { sp.last = performance.now(); sp.raf = requestAnimationFrame(springStep); }
  }
  function springStep(now: number): void {
    const dt = Math.min(0.034, Math.max(0.001, (now - sp.last) / 1000)); sp.last = now;
    const c = 2 * ZETA * Math.sqrt(SPRING_K), n = 4, h = dt / n;
    let x = sp.h, v = sp.v;
    for (let i = 0; i < n; i++) { const a = -SPRING_K * (x - sp.target) - c * v; v += a * h; x += v * h; }
    const lim = Math.max(2, Math.abs(sp.target - sp.from) * OVERSHOOT);
    if (sp.target >= sp.from && x > sp.target + lim) { x = sp.target + lim; v = Math.min(0, v); }
    if (sp.target < sp.from && x < sp.target - lim) { x = sp.target - lim; v = Math.max(0, v); }
    if (Math.abs(x - sp.target) < 0.35 && Math.abs(v) < 6) { x = sp.target; v = 0; }
    sp.v = v; applyH(x);
    sp.raf = (x === sp.target && v === 0) ? 0 : requestAnimationFrame(springStep);
  }
  // Keep the spring honest when frames are throttled.
  setInterval(() => { if (sp.raf && performance.now() - sp.last > 300) { cancelAnimationFrame(sp.raf); sp.raf = 0; sp.v = 0; applyH(sp.target); } }, 300);

  function setSnap(name: Snap, opts: SnapOpts = {}): void {
    if (isWide(view) && !st.hold.key) name = 'full';             // pinned open on wide screens
    sheet.snap = name; sheetEl.dataset.snap = name;
    grab.setAttribute('aria-expanded', String(name !== 'peek'));
    grab.setAttribute('aria-label', st.hold.key ? 'Close task actions' : `Sheet ${SNAP_WORD[name]}. Activate to ${name === 'full' ? 'collapse' : 'expand'}; arrow keys move it.`);
    const target = snapH(name);
    if (opts.instant) { if (sp.raf) cancelAnimationFrame(sp.raf); sp.raf = 0; sp.v = 0; sp.target = target; applyH(target); app.keepStartClear(true); return; }
    springTo(target, opts.v);
    app.keepStartClear();
  }
  function cycleSnap(): void {
    if (st.hold.key) { app.closeMenu(); return; }
    if (isWide(view)) return;
    setSnap(SNAPS[(SNAPS.indexOf(sheet.snap) + 1) % SNAPS.length]);
  }

  // handle: drag with pointer events, tap to cycle, keyboard via the button
  let gd: { id: number; y: number; h: number; moved: boolean; samples: [number, number][] } | null = null, suppressClick = false;
  grab.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    try { grab.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    if (sp.raf) { cancelAnimationFrame(sp.raf); sp.raf = 0; }
    sp.v = 0;
    gd = { id: e.pointerId, y: e.clientY, h: sp.h, moved: false, samples: [[performance.now(), sp.h]] };
  });
  grab.addEventListener('pointermove', e => {
    if (!gd || e.pointerId !== gd.id) return;
    const dy = e.clientY - gd.y;
    if (!gd.moved && Math.abs(dy) > 5) { gd.moved = true; grab.classList.add('dragging'); }
    if (!gd.moved) return;
    const lo = snapH('peek'), hi = st.hold.key ? snapH('half') : snapH('full');
    let h = gd.h - dy;
    if (h > hi) h = hi + (h - hi) * 0.25;            // rubber band past the ends
    if (h < lo) h = lo - (lo - h) * 0.25;
    applyH(h);
    gd.samples.push([performance.now(), h]); if (gd.samples.length > 6) gd.samples.shift();
  });
  function endGrab(e: PointerEvent, cancel: boolean): void {
    if (!gd || e.pointerId !== gd.id) return;
    const g = gd; gd = null; grab.classList.remove('dragging');
    if (!g.moved) return;                              // a tap: the click handler cycles
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    if (cancel) { setSnap(sheet.snap); return; }
    const [t0, h0] = g.samples[0], [t1, h1] = g.samples[g.samples.length - 1];
    const vel = t1 > t0 ? (h1 - h0) / ((t1 - t0) / 1000) : 0;   // px/s, positive = up
    const proj = sp.h + vel * 0.16;
    const options: Snap[] = st.hold.key ? ['peek', 'half'] : SNAPS;
    let best = options[0], bd = Infinity;
    options.forEach(n => { const d = Math.abs(snapH(n) - proj); if (d < bd) { bd = d; best = n; } });
    if (st.hold.key && best === 'peek') { app.closeMenu({ to: 'peek', v: vel }); return; }
    setSnap(best, { v: Math.max(-2600, Math.min(2600, vel)) });
  }
  grab.addEventListener('pointerup', e => endGrab(e, false));
  grab.addEventListener('pointercancel', e => endGrab(e, true));
  grab.addEventListener('click', () => { if (suppressClick) { suppressClick = false; return; } cycleSnap(); });
  grab.addEventListener('keydown', e => {
    const i = SNAPS.indexOf(sheet.snap);
    if (e.key === 'ArrowUp' && !st.hold.key) { e.preventDefault(); setSnap(SNAPS[Math.min(2, i + 1)]); }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (st.hold.key) app.closeMenu({ to: 'peek' }); else setSnap(SNAPS[Math.max(0, i - 1)]); }
  });

  return { snapH, sheetH, sheetExpanded, applyH, setSnap };
}
