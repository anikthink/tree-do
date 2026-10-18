import { describe, expect, it } from 'vitest';
import { canPlace, hasPending, inheritSchedule, isDone, isDueToday, markDone, onTodaysMap, placeNear, pruneFinished, putOffToTomorrow, removeTask, reopen } from './rules';
import { task } from './test-helpers';

const MON = '2026-10-19', TUE = '2026-10-20', SAT = '2026-10-24', SUN = '2026-10-25', PREV_SUN = '2026-10-18';

describe('repeats', () => {
  it('daily runs every day', () => {
    const t = task({ repeat: { type: 'daily' } });
    [MON, SAT, SUN].forEach(d => expect(isDueToday(t, d)).toBe(true));
  });
  it('weekdays runs Monday to Friday', () => {
    const t = task({ repeat: { type: 'weekdays' } });
    expect(isDueToday(t, MON)).toBe(true);
    expect(isDueToday(t, SAT)).toBe(false);
    expect(isDueToday(t, SUN)).toBe(false);
  });
  it('weekly runs on its days', () => {
    const t = task({ repeat: { type: 'weekly', days: [0, 4] } });
    expect(isDueToday(t, SUN)).toBe(true);
    expect(isDueToday(t, '2026-10-22')).toBe(true);   // Thu
    expect(isDueToday(t, MON)).toBe(false);
  });
  it('every N days counts from the last time it was done', () => {
    const t = task({ repeat: { type: 'every', n: 3 }, lastDone: '2026-10-16' });
    expect(isDueToday(t, '2026-10-18')).toBe(false);
    expect(isDueToday(t, MON)).toBe(true);
    expect(isDueToday(task({ repeat: { type: 'every', n: 3 } }), MON)).toBe(true);   // never done: due
  });
  it('stays on the map (done) the day it was ticked, even if its rule says not today', () => {
    const t = task({ repeat: { type: 'every', n: 3 }, lastDone: MON, doneOn: MON });
    expect(isDueToday(t, MON)).toBe(true);
    expect(isDone(t, MON)).toBe(true);
    expect(isDone(t, TUE)).toBe(false);          // a repeat is fresh again the next day
    expect(isDueToday(t, TUE)).toBe(false);
  });
});

describe('one-offs', () => {
  it('unfinished one-offs carry over quietly (no overdue pile)', () => {
    expect(isDueToday(task({ date: PREV_SUN }), MON)).toBe(true);
    expect(isDueToday(task(), MON)).toBe(true);
  });
  it('planned for later: not shown before its day', () => {
    expect(isDueToday(task({ date: TUE }), MON)).toBe(false);
    expect(isDueToday(task({ date: TUE }), TUE)).toBe(true);
  });
  it('finished on an earlier day: gone, and pruned from the plan', () => {
    const t = task({ doneOn: PREV_SUN });
    expect(isDueToday(t, MON)).toBe(false);
    expect(isDone(t, MON)).toBe(true);
    expect(pruneFinished([t], MON)).toEqual([]);
  });
  it('a finished one-off stays while a branch off it is unfinished', () => {
    const root = task({ doneOn: PREV_SUN });
    const child = task({ from: root.id });
    expect(hasPending(root, [root, child])).toBe(true);
    expect(onTodaysMap(root, [root, child], MON)).toBe(true);
    expect(pruneFinished([root, child], MON)).toEqual([root, child]);
    child.doneOn = PREV_SUN;
    expect(pruneFinished([root, child], MON)).toEqual([]);
  });
});

describe('someday and skip', () => {
  it('someday tasks are never due', () => {
    expect(isDueToday(task({ someday: true }), MON)).toBe(false);
    expect(isDueToday(task({ someday: true, repeat: { type: 'daily' } }), MON)).toBe(false);
  });
  it('putting a repeat off skips just today; a one-off moves to tomorrow', () => {
    const r = task({ repeat: { type: 'daily' } });
    putOffToTomorrow(r, MON);
    expect(r.skip).toBe(MON);
    expect(isDueToday(r, MON)).toBe(false);
    expect(isDueToday(r, TUE)).toBe(true);
    const o = task();
    putOffToTomorrow(o, MON);
    expect(o.date).toBe(TUE);
    expect(isDueToday(o, MON)).toBe(false);
  });
});

describe('ticking and deleting', () => {
  it('markDone / reopen keep lastDone in step for repeats', () => {
    const t = task({ repeat: { type: 'every', n: 2 }, lastDone: PREV_SUN });
    markDone(t, MON);
    expect([t.doneOn, t.lastDone]).toEqual([MON, MON]);
    reopen(t, MON);
    expect([t.doneOn, t.lastDone]).toEqual([null, null]);
  });
  it('deleting a task re-attaches its branches where it was', () => {
    const a = task(), b = task({ from: a.id, fork: 1 }), c = task({ from: b.id });
    const plan = { dayStart: 4, lines: [], tasks: [a, b, c] };
    removeTask(plan, b);
    expect(plan.tasks).toEqual([a, c]);
    expect([c.from, c.fork]).toEqual([a.id, 1]);
  });
});

describe('placing a task next to another', () => {
  const sorted = (ts: ReturnType<typeof task>[]) => [...ts].sort((a, b) => a.order - b.order).map(t => t.id);
  it('after: joins the same list and branch, right behind it', () => {
    const a = task({ id: 'a', line: 'l1', order: 1 }), b = task({ id: 'b', line: 'l1', order: 2, from: 'a', fork: 1 }), c = task({ id: 'c', line: 'l1', order: 3, from: 'a', fork: 1 });
    const n = task({ id: 'n', line: 'up', order: 9 });
    const all = [a, b, c, n];
    placeNear(all, n, b, 'after');
    expect(n).toMatchObject({ line: 'l1', from: 'a', fork: 1 });
    expect(sorted(all)).toEqual(['a', 'b', 'n', 'c']);
  });
  it('before: takes its place and pushes it down', () => {
    const a = task({ id: 'a', order: 1 }), b = task({ id: 'b', order: 2 }), n = task({ id: 'n', order: 3 });
    const all = [a, b, n];
    placeNear(all, n, a, 'before');
    expect(sorted(all)).toEqual(['n', 'a', 'b']);
  });
  it('moving to another list brings its branches along', () => {
    const a = task({ id: 'a', line: 'l1', anchor: true }), b = task({ id: 'b', line: 'l1', from: 'a' }), c = task({ id: 'c', line: 'l1', from: 'b' });
    const home = task({ id: 'h', line: 'l3' }), other = task({ id: 'o', line: 'l1' });
    const all = [a, b, c, home, other];
    placeNear(all, a, home, 'after');
    expect([a.line, b.line, c.line, other.line]).toEqual(['l3', 'l3', 'l3', 'l1']);
    expect(a.anchor).toBe(false);
  });
  it("can't go next to itself or onto its own branch", () => {
    const a = task({ id: 'a' }), b = task({ id: 'b', from: 'a' }), c = task({ id: 'c', from: 'b' }), d = task({ id: 'd' });
    const all = [a, b, c, d];
    expect(canPlace(all, a, a)).toBe(false);
    expect(canPlace(all, a, c)).toBe(false);
    expect(canPlace(all, a, d)).toBe(true);
    expect(canPlace(all, c, a)).toBe(true);
  });
  it('a task with no schedule of its own runs on the same days', () => {
    const laundry = task({ repeat: { type: 'weekly', days: [0] } });
    const fold = task();
    inheritSchedule(fold, laundry, MON);
    expect(fold.repeat).toEqual({ type: 'weekly', days: [0] });
    expect(fold.repeat).not.toBe(laundry.repeat);
    const plants = task({ repeat: { type: 'every', n: 3 }, lastDone: PREV_SUN });
    const mist = task();
    inheritSchedule(mist, plants, MON);
    expect(mist).toMatchObject({ repeat: { type: 'every', n: 3 }, lastDone: PREV_SUN });
    const own = task({ repeat: { type: 'daily' } });
    inheritSchedule(own, laundry, MON);
    expect(own.repeat).toEqual({ type: 'daily' });
    const later = task(); inheritSchedule(later, task({ date: TUE }), MON);
    expect(later.date).toBe(TUE);
  });
});
