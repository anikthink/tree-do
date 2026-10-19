// The week: what falls on each of seven days. Today comes from today's network (its live states),
// later days are projected from each task's rule, and earlier days come from the done-log.
import { allLines } from './lines';
import { buildNetwork, lineStates } from './network';
import { isLeftover } from './rules';
import { addDays, diffDays, parseYmd } from './time';
import type { Plan, Task } from './types';

/** `next`: today and the six days after it. `week`: Monday to Sunday around today. */
export type WeekRange = 'next' | 'week';
export type DayState = 'done' | 'ready' | 'later';

export interface DayItem {
  id: string;
  line: string;
  title: string;
  time: string | null;
  duration: number | null;
  /** The task it branches off, when that one is on the same day. */
  from: string | null;
  state: DayState;
  /** Still in the plan. Earlier days can list finished one-offs that have since left it. */
  live: boolean;
}

/** A place on the week to add a task: a day, and a time unless it went in the Anytime tray. */
export interface Slot { day: string; time: string | null; duration?: number | null }

/** Words typed into a slot on the week: the slot gives the day and time, unless the words say otherwise ("every monday", "3pm"). */
export function slotSchedule(p: { repeat: Task['repeat']; date: string | null; time: string | null; duration: number | null; someday: boolean }, slot: Slot, today: string): { date: string | null; time: string | null; duration: number | null } {
  const ownDay = !!(p.repeat || p.someday || p.date);
  return { date: ownDay ? p.date : slot.day > today ? slot.day : null, time: p.time ?? slot.time,
    duration: p.time ? p.duration : p.duration ?? slot.duration ?? null };   // a typed time brings its own length (or none)
}

/** How long the done-log keeps a day: enough for last week's Monday to show in this week's view. */
export const HISTORY_DAYS = 14;

export function weekDays(today: string, range: WeekRange): string[] {
  const start = range === 'next' ? today : addDays(today, -((parseYmd(today).getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Does `t` run on `day`, a day after today? Projected from its rule, as if today goes to plan. */
export function runsOn(t: Task, day: string, today: string): boolean {
  if (day <= today || t.someday || t.skip === day) return false;
  if (!t.repeat) return !t.doneOn && t.date === day;      // undated one-offs stay on today (they carry over)
  const dow = parseYmd(day).getDay();
  switch (t.repeat.type) {
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekly': return (t.repeat.days || []).includes(dow);
    case 'every': {
      const n = Math.max(1, t.repeat.n || 1);
      let first = t.lastDone ? addDays(t.lastDone, n) : today;
      if (first < today) first = today;                     // an overdue repeat is due today; count on from there
      return day >= first && diffDays(day, first) % n === 0;
    }
  }
  return false;
}

/** Each list's tasks in order, a branch right after the task it hangs off. */
function depthFirst<T extends { id: string; line: string; from: string | null }>(items: T[], lineIds: string[]): T[] {
  const out: T[] = [];
  const kids = (id: string | null, line: string): T[] => items.filter(x => x.line === line && x.from === id);
  const place = (list: T[]): void => list.forEach(x => { out.push(x); place(kids(x.id, x.line)); });
  lineIds.forEach(l => place(kids(null, l)));
  return out;
}

export function dayItems(plan: Plan, day: string, today: string): DayItem[] {
  const lineIds = allLines(plan).map(l => l.id);
  if (day < today) {
    const live = new Set(plan.tasks.map(t => t.id));
    const done = (plan.history?.[day] ?? []).filter(e => lineIds.includes(e.line));
    return lineIds.flatMap(l => done.filter(e => e.line === l).map(e => ({ ...e, duration: e.duration ?? null, from: null, state: 'done' as const, live: live.has(e.id) })));
  }
  const toItem = (t: Task, state: DayState, on: Set<string>): DayItem =>
    ({ id: t.id, line: t.line, title: t.title, time: t.time, duration: t.duration ?? null, from: t.from && on.has(t.from) ? t.from : null, state, live: true });
  if (day === today) {
    const net = buildNetwork(plan, today), states = lineStates(net, today);
    const list = net.order.filter(t => !isLeftover(t, today));
    const on = new Set(list.map(t => t.id));
    return list.map(t => toItem(t, states[t.id] === 'done' ? 'done' : states[t.id] === 'avail' ? 'ready' : 'later', on));
  }
  const list = plan.tasks.filter(t => lineIds.includes(t.line) && runsOn(t, day, today)).sort((a, b) => a.order - b.order);
  const on = new Set(list.map(t => t.id));
  return depthFirst(list.map(t => toItem(t, 'later', on)), lineIds);
}

// ---- the done-log

export function logDone(plan: Plan, t: Task, day: string): void {
  const history = plan.history ??= {};
  history[day] = [...(history[day] ?? []).filter(e => e.id !== t.id), { id: t.id, line: t.line, title: t.title, time: t.time, duration: t.duration ?? null }];
}
export function unlogDone(plan: Plan, id: string, day: string): void {
  const list = plan.history?.[day];
  if (plan.history && list) plan.history[day] = list.filter(e => e.id !== id);
}
export function pruneHistory(plan: Plan, today: string): void {
  const history = plan.history;
  if (history) Object.keys(history).forEach(d => { if (diffDays(today, d) >= HISTORY_DAYS) delete history[d]; });
}
