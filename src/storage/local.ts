// Where Tree-do keeps its data in Phase 1: the browser's localStorage.
// This is the one seam Phase 2 replaces with Convex (load on sign-in, save through mutations).
import type { Mode } from '../app/store';
import { isPlan, type SavedState } from '../domain/types';
import type { WeekRange } from '../domain/week';

export type { SavedState };
export const STORAGE_KEY = 'tree-do:v1';

export function loadState(storage: Storage = localStorage): SavedState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s: unknown = JSON.parse(raw);
    return isPlan(s) ? s : null;
  } catch {
    return null;   // corrupt or unavailable storage: start from the sample day
  }
}

export function saveState(state: SavedState, storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked (private mode): keep working in memory
  }
}

/** Which view was last open (a device preference, so it stays out of the plan). */
export const VIEW_KEY = 'tree-do:view';
export interface ViewPref { mode: Mode; range: WeekRange }

export function loadView(storage: Storage = localStorage): ViewPref {
  try {
    const v: unknown = JSON.parse(storage.getItem(VIEW_KEY) ?? 'null');
    const o = typeof v === 'object' && v !== null ? v as Record<string, unknown> : {};
    return { mode: o.mode === 'hours' || o.mode === 'days' ? o.mode : 'map', range: o.range === 'week' ? 'week' : 'next' };
  } catch {
    return { mode: 'map', range: 'next' };
  }
}
export function saveView(v: ViewPref, storage: Storage = localStorage): void {
  try { storage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* keep it in memory */ }
}
