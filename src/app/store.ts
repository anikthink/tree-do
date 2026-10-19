// The one mutable app state, plus a small change/notify hook.
// Phase 1 subscribes localStorage to 'plan' changes; Phase 2 plugs Convex in at the same place.
import type { TodayNetwork } from '../domain/network';
import type { Clock } from '../domain/time';
import type { LineState, Plan } from '../domain/types';
import type { WeekRange } from '../domain/week';
import { emptyLayout, type MapLayout } from '../map/layout';
import type { Anim, Ding } from '../map/trains';
import { PEEK, type Viewport } from './viewport';

export type Snap = 'peek' | 'half' | 'full';
export type Tab = 'today' | 'tt' | 'key';
/** What fills the screen beside the panel: today's map, or the week as hours or as days. */
export type Mode = 'map' | 'hours' | 'days';
export interface Cam { s: number; ox: number; oy: number }
export interface Spring { h: number; v: number; target: number; from: number; raf: number; last: number }

export interface AppState {
  /** The saved plan (lists, tasks, settings). Replaced wholesale by undo / reset. */
  plan: Plan;
  clock: Clock;
  reducedMotion: boolean;
  /** Today's service day, the network built from the plan, its layout and each task's state. */
  today: string;
  net: TodayNetwork;
  map: MapLayout;
  states: Record<string, LineState | undefined>;
  /** Stations whose track has been painted (a train has arrived). */
  arrived: Set<string>;
  anims: Anim[];
  dings: Ding[];
  popAt: Record<string, number | null | undefined>;
  shakeAt: Record<string, number | null | undefined>;
  hoverKey: string | null;
  focusedKey: string | null;
  view: Viewport;
  cam: Cam;
  camTarget: Cam | null;
  /** The user panned or zoomed, so don't re-fit the map on its own. */
  userMoved: boolean;
  sheet: { snap: Snap; tab: Tab; spring: Spring };
  /** The hold menu: the task it's open for, where focus returns, and the snap to go back to. */
  hold: { key: string | null; returnTo: Element | null; prev: Snap; swallowPtr: boolean };
  /** Branch mode in the add field: new tasks go on a branch off `from`. */
  add: { from: string | null; fork: number | null };
  /** JSON of the plan before the last change, while its Undo is on offer. */
  undoSnap: string | null;
  /** The week views: which one shows, which seven days, the days opened in Days, and the Anytime tray in Hours. */
  week: { mode: Mode; range: WeekRange; open: Set<string>; tray: boolean };
}

export type Change = 'plan';
export interface Store {
  readonly state: AppState;
  subscribe(fn: (change: Change) => void): () => void;
  notify(change: Change): void;
}

export function initialState(plan: Plan, clock: Clock, reducedMotion: boolean, view: { mode: Mode; range: WeekRange } = { mode: 'map', range: 'next' }): AppState {
  return {
    plan, clock, reducedMotion,
    today: '',
    net: { today: '', lines: [], visible: new Set(), seqs: {}, order: [], junction: null },
    map: emptyLayout(),
    states: {},
    arrived: new Set(), anims: [], dings: [], popAt: {}, shakeAt: {},
    hoverKey: null, focusedKey: null,
    view: { W: 0, H: 0, dpr: 1, safeT: 0, safeB: 0 },
    cam: { s: 1, ox: 0, oy: 0 }, camTarget: null, userMoved: false,
    sheet: { snap: 'peek', tab: 'today', spring: { h: PEEK, v: 0, target: PEEK, from: PEEK, raf: 0, last: 0 } },
    hold: { key: null, returnTo: null, prev: 'peek', swallowPtr: false },
    add: { from: null, fork: null },
    undoSnap: null,
    week: { ...view, open: new Set(), tray: false },
  };
}

export function createStore(state: AppState): Store {
  const listeners = new Set<(change: Change) => void>();
  return {
    state,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    notify(change) { listeners.forEach(fn => fn(change)); },
  };
}
