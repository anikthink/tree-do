// Screen size and the breakpoints shared by the map and the panel.

export interface Viewport {
  W: number;
  H: number;
  dpr: number;
  /** env(safe-area-inset-top / bottom), measured once at start. */
  safeT: number;
  safeB: number;
}

/** Sheet height when collapsed (handle 16 + header 36 + preview row 48). */
export const PEEK = 100;
/** Desktop card / pinned panel width. */
export const CARD_W = 344;
/** Phone columns: column width and the sticky column-name row. */
export const COLW_V = 150;
export const HEAD_V = 34;

export const isDesk = (v: Viewport): boolean => v.W >= 760;
/** Wide desktop: the sheet is pinned open as a full-height panel and the map sits to its right. */
export const isWide = (v: Viewport): boolean => v.W >= 1100 && v.W > v.H * 1.1;
/** Phones (and tall windows) draw lists as columns. */
export const isVertical = (w: number, h: number): boolean => w < 760 || h > w * 1.15;
export const headTop = (v: Viewport): number => Math.max(6, v.safeT + 4);
export const mapTopV = (v: Viewport): number => headTop(v) + HEAD_V + 6;

export function measureSafeInsets(): { top: number; bottom: number } {
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none';
  document.body.appendChild(p);
  const bottom = p.getBoundingClientRect().height || 0;
  p.style.height = 'env(safe-area-inset-top)';
  const top = p.getBoundingClientRect().height || 0;
  p.remove();
  return { top, bottom };
}
