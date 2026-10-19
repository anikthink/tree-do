// The plan's data: what Tree-do saves (under `tree-do:v1`) and what Phase 2 will store in Convex.
// The code calls a user's lists "lines" (they are drawn as lines on the map).

/** How a task repeats. `days` are weekday indexes, 0 = Sunday. */
export type Repeat =
  | { type: 'daily' }
  | { type: 'weekdays' }
  | { type: 'weekly'; days: number[] }
  | { type: 'every'; n: number };

/** Dates are local service days as `YYYY-MM-DD`; times are `HH:MM`. */
export interface Task {
  id: string;
  /** Line (list) id: `up` for Upkeep, otherwise a {@link List} id. */
  line: string;
  title: string;
  /** Sort key within its line (global counter; only the relative order matters). */
  order: number;
  /** The task this one branches off, or null for the line's trunk. */
  from: string | null;
  /** Which branch off `from` (a task can start several branches). */
  fork: number;
  /** "Starts the day" (Upkeep only): the focus lists open once the last of these is done. */
  anchor?: boolean;
  repeat: Repeat | null;
  time: string | null;
  /** One-offs: planned for this day (not shown before it). */
  date: string | null;
  someday: boolean;
  /** The service day it was ticked off. */
  doneOn: string | null;
  /** Repeats: the last day it was done (drives "every N days"). */
  lastDone: string | null;
  /** Repeats: skipped for this one day. */
  skip: string | null;
}

/** A focus list as saved. `pal` picks its colours from the palette. */
export interface List {
  id: string;
  code: string;
  name: string;
  pal: number;
}

/** A line ready to draw: a list (or Upkeep, or the Today start) with its colours resolved. */
export interface Line {
  id: string;
  code: string;
  name: string;
  pal?: number;
  color: string;
  ink: string;
  /** A darker shade for words in the line's colour. */
  text: string;
  /** 10% of the colour on white. */
  tint: string;
  upkeep?: boolean;
}

/** Everything that is saved: lists, tasks and settings. */
export interface Plan {
  /** Hour the day starts (0–6); before it, it still counts as yesterday. */
  dayStart: number;
  lines: List[];
  tasks: Task[];
  /** What was ticked off on each past day (the week view's earlier days). Kept for two weeks; older plans have none. */
  history?: Record<string, DoneEntry[] | undefined>;
}
export type SavedState = Plan;

/** A task as it was when ticked off. A copy, because finished one-offs leave the plan the next day. */
export interface DoneEntry {
  id: string;
  line: string;
  title: string;
  time: string | null;
}

/** A task's place on today's map: finished, ready to do, or later in its line. */
export type LineState = 'done' | 'avail' | 'locked';

/** Shallow check used when reading saved or snapshotted data (the same check Phase 1 shipped with). */
export function isPlan(v: unknown): v is Plan {
  return typeof v === 'object' && v !== null && 'tasks' in v && Array.isArray(v.tasks) && 'lines' in v && Array.isArray(v.lines);
}
