// Drag a row to move its task: it lands right before or after the row you drop it on.
// Rows you can also tap (Today) start dragging once a mouse moves a few pixels, or after a short hold on touch,
// so a swipe still scrolls. A grip (Plan) starts at once on any pointer.
import type { Where } from '../domain/rules';
import { closestEl } from './dom';

export interface DragSpec {
  root: HTMLElement;
  /** Scrolls while the row is held near its top or bottom edge. */
  scroller: HTMLElement;
  /** Where a drag can start. */
  handle: string;
  /** True: starts on press (a grip). False: after a move, or a hold on touch (a row that also takes taps). */
  grip: boolean;
  /** The row a handle belongs to, and its task id. */
  row: string;
  idOf(row: HTMLElement): string | undefined;
  /** The rows the task can be dropped next to, in screen order. */
  targets(id: string): HTMLElement[];
  drop(id: string, targetId: string, where: Where): void;
  /** Touch: held without moving, then let go. */
  held?(id: string): void;
  /** The drag ended without a drop. */
  cancelled?(): void;
}

const HOLD_MS = 300, MOUSE_SLOP = 5, TOUCH_SLOP = 8, EDGE = 56;

export function installDrag(spec: DragSpec) {
  const { root, scroller } = spec;
  interface Drag {
    id: string; row: HTMLElement; pointerId: number; touch: boolean;
    x0: number; y0: number; top0: number; y: number;
    on: boolean; moved: boolean; timer?: ReturnType<typeof setTimeout>;
    targets: HTMLElement[]; target: HTMLElement | null; where: Where; raf: number;
  }
  let d: Drag | null = null;

  function begin(): void {
    if (!d) return;
    d.on = true;
    d.targets = spec.targets(d.id).filter(r => r.offsetParent !== null);
    d.row.classList.add('dragging'); root.classList.add('is-dragging');
    try { root.setPointerCapture(d.pointerId); } catch { /* pointer already gone */ }
    const active = document.activeElement;
    if (active instanceof HTMLElement && d.row.contains(active)) active.blur();
    getSelection()?.removeAllRanges();
    if (d.touch) navigator.vibrate?.(8);
    const loop = (): void => { if (!d?.on) return; autoScroll(); d.raf = requestAnimationFrame(loop); };
    d.raf = requestAnimationFrame(loop);
    update();
  }
  function autoScroll(): void {
    if (!d) return;
    const r = scroller.getBoundingClientRect();
    const up = r.top + EDGE - d.y, down = d.y - (r.bottom - EDGE);
    const v = up > 0 ? -Math.min(up, EDGE) / EDGE * 12 : down > 0 ? Math.min(down, EDGE) / EDGE * 12 : 0;
    if (v) { scroller.scrollTop += v; update(); }
  }
  function update(): void {
    if (!d) return;
    d.row.style.transform = `translateY(${d.y - d.y0 + scroller.scrollTop - d.top0}px)`;
    // the nearest row; its upper half drops before it, its lower half after
    let best: HTMLElement | null = null, bestDist = Infinity, where: Where = 'after';
    for (const r of d.targets) {
      const b = r.getBoundingClientRect();
      const dist = d.y < b.top ? b.top - d.y : d.y > b.bottom ? d.y - b.bottom : 0;
      if (dist < bestDist) { bestDist = dist; best = r; where = d.y < b.top + b.height / 2 ? 'before' : 'after'; }
    }
    if (best !== d.target || where !== d.where) {
      d.target?.classList.remove('drop-before', 'drop-after');
      best?.classList.add(where === 'before' ? 'drop-before' : 'drop-after');
      d.target = best; d.where = where;
    }
  }
  function end(drop: boolean): void {
    if (!d) return;
    const g = d; d = null;
    clearTimeout(g.timer);
    if (!g.on) return;
    cancelAnimationFrame(g.raf);
    g.row.classList.remove('dragging'); g.row.style.transform = '';
    g.target?.classList.remove('drop-before', 'drop-after');
    root.classList.remove('is-dragging');
    try { root.releasePointerCapture(g.pointerId); } catch { /* not captured */ }
    swallowClick();
    const targetId = g.target ? spec.idOf(g.target) : undefined;
    if (!g.moved && g.touch && spec.held) spec.held(g.id);
    else if (drop && g.moved && targetId) { spec.drop(g.id, targetId, g.where); return; }
    spec.cancelled?.();
  }
  // the click that follows a drag isn't a tap
  function swallowClick(): void {
    const stop = (e: Event): void => { e.stopPropagation(); e.preventDefault(); };
    root.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => root.removeEventListener('click', stop, { capture: true }), 400);
  }

  root.addEventListener('pointerdown', e => {
    if (d || e.button !== 0) return;
    const h = closestEl(e.target, spec.handle); if (!h || !root.contains(h)) return;
    const row = closestEl(h, spec.row); const id = row && spec.idOf(row); if (!row || !id) return;
    d = { id, row, pointerId: e.pointerId, touch: e.pointerType === 'touch', x0: e.clientX, y0: e.clientY, top0: scroller.scrollTop, y: e.clientY,
      on: false, moved: false, targets: [], target: null, where: 'after', raf: 0 };
    if (spec.grip) { e.preventDefault(); begin(); }
    else if (d.touch) d.timer = setTimeout(begin, HOLD_MS);
  });
  root.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.pointerId) return;
    d.y = e.clientY;
    const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    if (!d.on) {
      if (d.touch) { if (dist > TOUCH_SLOP) end(false); }   // it's a scroll
      else if (dist > MOUSE_SLOP) begin();
      return;
    }
    e.preventDefault();
    if (dist > TOUCH_SLOP) d.moved = true;
    update();
  });
  root.addEventListener('pointerup', e => { if (d && e.pointerId === d.pointerId) end(true); });
  root.addEventListener('pointercancel', e => { if (d && e.pointerId === d.pointerId) end(false); });
  // once a touch drag has started, the finger moves the row, not the list
  root.addEventListener('touchmove', e => { if (d?.on) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', e => { if (d?.touch) e.preventDefault(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && d?.on) { e.stopPropagation(); end(false); } }, { capture: true });

  return { busy: (): boolean => d !== null };
}
