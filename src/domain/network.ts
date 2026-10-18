// Today's network, independent of drawing: which tasks are on the map, how they hang together
// (lines, branches, the morning junction) and the state of each one (done / ready / later).
import { allLines } from './lines';
import { isDone, onTodaysMap, taskById } from './rules';
import type { Line, LineState, Plan, Task } from './types';

/** Per line: sequence key → its tasks in order. `trunk` is the line itself; `<taskId>|<fork>` is a branch off that task. */
export type Seqs = Record<string, Record<string, Task[] | undefined>>;

export interface TodayNetwork {
  today: string;
  /** Upkeep first, then the focus lists. */
  lines: Line[];
  visible: Set<string>;
  seqs: Seqs;
  /** Every task on the map, depth-first (a branch point always comes before its branch). */
  order: Task[];
  /** The last "starts the day" task on Upkeep's trunk: the focus lists branch off (and wait for) it. */
  junction: string | null;
}

/** Branch keys hanging off task `id` on line `lineId`, in drawing order. */
export function forksOf(seqs: Seqs, lineId: string, id: string): string[] {
  return Object.keys(seqs[lineId] ?? {}).filter(k => k.startsWith(id + '|')).sort();
}

export function seqList(seqs: Seqs, lineId: string, key: string): Task[] {
  return seqs[lineId]?.[key] ?? [];
}

export function buildNetwork(plan: Plan, today: string): TodayNetwork {
  const lines = allLines(plan);
  const tasks = plan.tasks;
  const visible = new Set(tasks.filter(t => onTodaysMap(t, tasks, today)).map(t => t.id));
  // If a task's branch point isn't on today's map, it joins the nearest one that is (or the line itself).
  const effFrom = (t: Task): string | null => {
    let f = t.from, guard = 0;
    while (f && !visible.has(f) && guard++ < 50) { const p = taskById(tasks, f); f = p ? p.from : null; }
    const ft = f ? taskById(tasks, f) : undefined;
    return f && ft && ft.line === t.line ? f : null;
  };
  const seqKey = (t: Task): string => { const f = effFrom(t); return f ? `${f}|${f === t.from ? (t.fork || 0) : 0}` : 'trunk'; };
  const seqs: Seqs = {};
  lines.forEach(l => { seqs[l.id] = {}; });
  tasks.filter(t => visible.has(t.id) && seqs[t.line]).sort((a, b) => a.order - b.order).forEach(t => {
    const line = seqs[t.line];
    if (!line) return;
    const k = seqKey(t);
    (line[k] ??= []).push(t);
  });
  const order: Task[] = [];
  const place = (lineId: string, list: Task[]): void => list.forEach(t => {
    order.push(t);
    forksOf(seqs, lineId, t.id).forEach(k => place(lineId, seqList(seqs, lineId, k)));
  });
  lines.forEach(l => place(l.id, seqList(seqs, l.id, 'trunk')));
  let junction: string | null = null;
  seqList(seqs, 'up', 'trunk').forEach(t => { if (t.anchor) junction = t.id; });
  return { today, lines, visible, seqs, order, junction };
}

/**
 * Per-task state. Order is a suggestion, not a lock: a task is ready if it's the next one in its sequence,
 * or anything further down is already done (skip ahead). A branch waits for its root; the focus lists wait
 * for the morning junction on Upkeep.
 */
export function lineStates(net: TodayNetwork, today: string): Record<string, LineState | undefined> {
  const res: Record<string, LineState | undefined> = {};
  interface Seq { lineId: string; root: string | null; list: Task[] }
  const seqOf = new Map<string, Seq>();
  Object.entries(net.seqs).forEach(([lineId, seqs]) => Object.entries(seqs).forEach(([k, list]) => {
    if (!list) return;
    const seq: Seq = { lineId, root: k === 'trunk' ? null : k.split('|')[0], list };
    list.forEach(t => seqOf.set(t.id, seq));
  }));
  const handled = new Set<Seq>();
  net.order.forEach(task => {
    const seq = seqOf.get(task.id);
    if (!seq || handled.has(seq)) return;
    handled.add(seq);
    const rootDone = seq.root ? res[seq.root] === 'done' : (seq.lineId === 'up' || !net.junction || res[net.junction] === 'done');
    let maxDone = -1;
    seq.list.forEach((t, j) => { if (isDone(t, today)) maxDone = j; });
    seq.list.forEach((t, j) => { res[t.id] = isDone(t, today) ? 'done' : (j <= maxDone + 1 && (rootDone || maxDone >= 0) ? 'avail' : 'locked'); });
  });
  return res;
}
