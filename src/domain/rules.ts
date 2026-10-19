// The day rules: what is due today, what counts as done, and what carries over.
import { addDays, diffDays, parseYmd } from './time';
import type { Plan, Repeat, Task } from './types';

export function taskById(tasks: readonly Task[], id: string): Task | undefined {
  return tasks.find(t => t.id === id);
}

/** Does this task run on `today`? Unfinished one-offs simply carry over; there is no overdue pile. */
export function isDueToday(t: Task, today: string): boolean {
  if (t.someday) return false;
  if (t.skip === today) return false;
  if (!t.repeat) {
    if (t.doneOn && t.doneOn !== today) return false;     // finished on an earlier day: gone
    if (t.date && t.date > today) return false;           // planned for later: not yet
    return true;                                          // unfinished one-offs simply carry over
  }
  if (t.doneOn === today) return true;
  const dow = parseYmd(today).getDay();
  switch (t.repeat.type) {
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekly': return (t.repeat.days || []).includes(dow);
    case 'every': return !t.lastDone || diffDays(today, t.lastDone) >= (t.repeat.n || 1);
  }
  return true;
}

export const isDone = (t: Task, today: string): boolean => t.doneOn === today || (!t.repeat && !!t.doneOn);

/** A task still matters if anything branching off it is unfinished. */
export function hasPending(t: Task, tasks: readonly Task[], seen: Set<string> = new Set()): boolean {
  if (seen.has(t.id)) return false;
  seen.add(t.id);
  return tasks.some(c => c.from === t.id && !c.someday && ((!!c.repeat || !c.doneOn) || hasPending(c, tasks, seen)));
}

/** A one-off finished on an earlier day (kept on the map only while a branch off it is unfinished). */
export const isLeftover = (t: Task, today: string): boolean => !t.repeat && !!t.doneOn && t.doneOn < today;

/** On today's map: due today, or a finished one-off that still has an unfinished branch hanging off it. */
export function onTodaysMap(t: Task, tasks: readonly Task[], today: string): boolean {
  return isDueToday(t, today) || (isLeftover(t, today) && !t.someday && hasPending(t, tasks));
}

/** One-off tasks finished on an earlier day are history: they leave the plan quietly. */
export function pruneFinished(tasks: Task[], day: string): Task[] {
  return tasks.filter(t => t.repeat || !t.doneOn || t.doneOn >= day || hasPending(t, tasks));
}

/** Delete a task; its branches re-attach where it was. */
export function removeTask(plan: Plan, t: Task): void {
  plan.tasks.forEach(c => { if (c.from === t.id) { c.from = t.from; c.fork = t.fork || 0; } });
  plan.tasks = plan.tasks.filter(x => x !== t);
}

export function markDone(t: Task, today: string): void {
  t.doneOn = today;
  if (t.repeat) t.lastDone = today;
}
export function reopen(t: Task, today: string): void {
  t.doneOn = null;
  if (t.repeat && t.lastDone === today) t.lastDone = null;
}
/** Repeats skip today; one-offs move to tomorrow. */
export function putOffToTomorrow(t: Task, today: string): void {
  if (t.repeat) t.skip = today;
  else t.date = addDays(today, 1);
}
export const nextOrder = (tasks: readonly Task[]): number => Math.max(0, ...tasks.map(x => x.order)) + 1;

export type Where = 'before' | 'after';

/** Is `t` the task `ancestorId`, or somewhere on a branch hanging off it? */
export function isWithin(tasks: readonly Task[], t: Task, ancestorId: string): boolean {
  let cur: Task | undefined = t, guard = 0;
  while (cur && guard++ < 100) {
    if (cur.id === ancestorId) return true;
    cur = cur.from ? taskById(tasks, cur.from) : undefined;
  }
  return false;
}

/** Can `t` move next to `target`? Not next to itself, and not onto one of its own branches. */
export const canPlace = (tasks: readonly Task[], t: Task, target: Task): boolean => target !== t && !isWithin(tasks, target, t.id);

/** A task placed next to another, with no schedule of its own, runs on the same days. */
export function inheritSchedule(t: Task, target: Task, today: string): void {
  if (t.repeat || t.date || t.someday) return;
  t.someday = target.someday;
  if (target.repeat) {
    t.repeat = structuredClone(target.repeat);
    if (target.repeat.type === 'every') t.lastDone = target.lastDone;   // keep "every N days" in step
  } else if (target.date && target.date > today) t.date = target.date;
}

/**
 * Put `t` right before or after `target`, in the same list and on the same branch.
 * Orders are one global counter, so everything from the slot onwards shifts down by one.
 * Branches off `t` move with it, even to another list.
 */
export function placeNear(tasks: readonly Task[], t: Task, target: Task, where: Where): void {
  if (t.line !== target.line) tasks.forEach(x => { if (x !== t && isWithin(tasks, x, t.id)) x.line = target.line; });   // its branches come along
  t.line = target.line; t.from = target.from; t.fork = target.fork || 0;
  if (t.anchor && t.line !== 'up') t.anchor = false;   // only Upkeep starts the day
  const at = where === 'after' ? target.order + 1 : target.order;
  tasks.forEach(x => { if (x !== t && x.order >= at) x.order++; });
  t.order = at;
}

/** What the week's editor can change. */
export interface TaskEdit {
  title: string;
  line: string;
  time: string | null;
  /** One-offs: the day (today or earlier means today). Ignored for repeats. */
  date: string | null;
  repeat: Repeat | null;
}

/**
 * Apply an edit. A repeat has no date; a one-off planned for today or earlier simply runs today.
 * Moving to another list puts the task at the end of that list's trunk, and its branches come along.
 */
export function editTask(tasks: readonly Task[], t: Task, e: TaskEdit, today: string): void {
  const title = e.title.trim();
  if (title) t.title = title;
  t.time = e.time;
  t.someday = false;
  if (e.repeat) {
    if (JSON.stringify(e.repeat) !== JSON.stringify(t.repeat)) t.skip = null;
    t.repeat = e.repeat; t.date = null;
  } else {
    if (t.repeat) { t.repeat = null; t.lastDone = null; t.skip = null; if (t.doneOn && t.doneOn !== today) t.doneOn = null; }
    t.date = e.date && e.date > today ? e.date : null;
  }
  if (e.line !== t.line) {
    tasks.forEach(x => { if (x !== t && isWithin(tasks, x, t.id)) x.line = e.line; });
    t.line = e.line; t.from = null; t.fork = 0; t.order = nextOrder(tasks);
    if (t.line !== 'up') t.anchor = false;
  }
}
