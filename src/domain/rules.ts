// The day rules: what is due today, what counts as done, and what carries over.
import { addDays, diffDays, parseYmd } from './time';
import type { Plan, Task } from './types';

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
