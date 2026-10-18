// Where Tree-do keeps its data in Phase 1: the browser's localStorage.
// This is the one seam Phase 2 replaces with Convex (load on sign-in, save through mutations).

export const STORAGE_KEY = 'tree-do:v1';

/** The saved plan: lists, tasks and settings. Typed loosely until the engine is split up. */
export type SavedState = { dayStart: number; lines: unknown[]; tasks: unknown[]; [k: string]: unknown };

export function loadState(storage: Storage = localStorage): SavedState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && Array.isArray(s.tasks) && Array.isArray(s.lines) ? s : null;
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
