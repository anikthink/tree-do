import { describe, expect, it } from 'vitest';
import { markDone } from './rules';
import { task } from './test-helpers';
import type { Plan } from './types';
import { HISTORY_DAYS, dayItems, logDone, pruneHistory, runsOn, slotSchedule, unlogDone, weekDays } from './week';

const MON = '2026-10-19', TUE = '2026-10-20', WED = '2026-10-21', THU = '2026-10-22', SAT = '2026-10-24', SUN = '2026-10-25';
const plan = (tasks = [task()]): Plan => ({ dayStart: 4, lines: [{ id: 'l1', code: 'L1', name: 'Work', pal: 0 }], tasks });

describe('weekDays', () => {
  it('next: today and the six days after it', () => {
    expect(weekDays(WED, 'next')).toEqual([WED, THU, '2026-10-23', SAT, SUN, '2026-10-26', '2026-10-27']);
  });
  it('week: Monday to Sunday around today', () => {
    expect(weekDays(WED, 'week')[0]).toBe(MON);
    expect(weekDays(WED, 'week')[6]).toBe(SUN);
    expect(weekDays(MON, 'week')[0]).toBe(MON);
    expect(weekDays(SUN, 'week')[0]).toBe(MON);           // Sunday ends the week
  });
});

describe('runsOn (later days)', () => {
  it('never today or earlier: those come from the live map and the log', () => {
    const t = task({ repeat: { type: 'daily' } });
    expect(runsOn(t, WED, WED)).toBe(false);
    expect(runsOn(t, TUE, WED)).toBe(false);
    expect(runsOn(t, THU, WED)).toBe(true);
  });
  it('follows weekday and weekly rules', () => {
    expect(runsOn(task({ repeat: { type: 'weekdays' } }), SAT, WED)).toBe(false);
    expect(runsOn(task({ repeat: { type: 'weekdays' } }), THU, WED)).toBe(true);
    expect(runsOn(task({ repeat: { type: 'weekly', days: [0] } }), SUN, WED)).toBe(true);
    expect(runsOn(task({ repeat: { type: 'weekly', days: [0] } }), SAT, WED)).toBe(false);
  });
  it('every N days counts on from the last time, or from today if it is due now', () => {
    const doneMon = task({ repeat: { type: 'every', n: 3 }, lastDone: MON });
    expect(runsOn(doneMon, THU, WED)).toBe(true);
    expect(runsOn(doneMon, SUN, WED)).toBe(true);
    expect(runsOn(doneMon, SAT, WED)).toBe(false);
    const overdue = task({ repeat: { type: 'every', n: 3 }, lastDone: '2026-10-10' });
    expect(runsOn(overdue, SAT, WED)).toBe(true);           // due today, so next in three days
    expect(runsOn(overdue, THU, WED)).toBe(false);
  });
  it('one-offs show on their date; undated ones stay on today', () => {
    expect(runsOn(task({ date: SAT }), SAT, WED)).toBe(true);
    expect(runsOn(task(), THU, WED)).toBe(false);
    expect(runsOn(task({ date: SAT, someday: true }), SAT, WED)).toBe(false);
  });
  it('a skipped day is skipped', () => {
    expect(runsOn(task({ repeat: { type: 'daily' }, skip: THU }), THU, WED)).toBe(false);
  });
});

describe('dayItems', () => {
  it('today: live states, a branch right after the task it hangs off', () => {
    const a = task({ line: 'l1', title: 'A' }), b = task({ line: 'l1', title: 'B' }), c = task({ line: 'l1', title: 'C', from: a.id });
    markDone(a, WED);
    const items = dayItems(plan([a, b, c]), WED, WED);
    expect(items.map(i => [i.title, i.state, i.from])).toEqual([['A', 'done', null], ['C', 'ready', a.id], ['B', 'ready', null]]);
  });
  it('later days: projected tasks, all later', () => {
    const items = dayItems(plan([task({ line: 'l1', title: 'Standup', repeat: { type: 'weekdays' }, time: '10:30' }), task({ line: 'l1', title: 'Dentist', date: SAT })]), SAT, WED);
    expect(items.map(i => [i.title, i.state])).toEqual([['Dentist', 'later']]);
  });
  it('earlier days: what the log says was done, Upkeep first', () => {
    const p = plan([]), work = task({ line: 'l1', title: 'Report' }), up = task({ line: 'up', title: 'Get up' });
    logDone(p, work, MON); logDone(p, up, MON);
    expect(dayItems(p, MON, WED).map(i => [i.title, i.state, i.live])).toEqual([['Get up', 'done', false], ['Report', 'done', false]]);
    expect(dayItems(p, TUE, WED)).toEqual([]);
  });
});

describe('the done-log', () => {
  it('logs once per task per day and forgets on undo', () => {
    const p = plan([]), t = task();
    logDone(p, t, MON); logDone(p, t, MON);
    expect(p.history?.[MON]).toHaveLength(1);
    unlogDone(p, t.id, MON);
    expect(p.history?.[MON]).toEqual([]);
  });
  it(`keeps ${HISTORY_DAYS} days`, () => {
    const p = plan([]), t = task();
    logDone(p, t, '2026-10-07'); logDone(p, t, '2026-10-08'); logDone(p, t, MON);
    pruneHistory(p, WED);
    expect(Object.keys(p.history ?? {})).toEqual(['2026-10-08', MON]);
  });
});

describe('slotSchedule (adding on the week)', () => {
  const words = { repeat: null, date: null, time: null, someday: false };
  it('takes the slot\'s day and time', () => {
    expect(slotSchedule(words, { day: SAT, time: '14:30' }, WED)).toEqual({ date: SAT, time: '14:30' });
    expect(slotSchedule(words, { day: SAT, time: null }, WED)).toEqual({ date: SAT, time: null });
  });
  it('today needs no date (a one-off with none is today\'s)', () => {
    expect(slotSchedule(words, { day: WED, time: '09:00' }, WED)).toEqual({ date: null, time: '09:00' });
  });
  it('the words win: a typed time, a repeat, a day or someday', () => {
    expect(slotSchedule({ ...words, time: '15:00' }, { day: SAT, time: '09:00' }, WED).time).toBe('15:00');
    expect(slotSchedule({ ...words, repeat: { type: 'daily' } }, { day: SAT, time: null }, WED).date).toBeNull();
    expect(slotSchedule({ ...words, date: SUN }, { day: SAT, time: null }, WED).date).toBe(SUN);
    expect(slotSchedule({ ...words, someday: true }, { day: SAT, time: null }, WED).date).toBeNull();
  });
});
