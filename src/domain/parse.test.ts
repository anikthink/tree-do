import { describe, expect, it } from 'vitest';
import { parse, parseContext, repeatShort, ruleSource, ruleText } from './parse';
import { seed } from './seed';
import { task } from './test-helpers';

const TODAY = '2026-10-19';   // a Monday
const ctx = parseContext(seed(TODAY), TODAY);
const p = (s: string) => parse(s, ctx);

describe('plain-words parser', () => {
  it('stretch daily 9am #health', () => {
    expect(p('stretch daily 9am #health')).toEqual({
      title: 'Stretch', line: 'l2', repeat: { type: 'daily' }, time: '09:00', date: null, someday: false, anchor: false, lineGuess: false, place: null,
    });
  });
  it('call mum friday → this Friday, first list', () => {
    expect(p('call mum friday')).toMatchObject({ title: 'Call mum', date: '2026-10-23', repeat: null, line: 'l1', lineGuess: true });
  });
  it('water plants every 3 days → a repeat on Upkeep', () => {
    expect(p('water plants every 3 days')).toMatchObject({ title: 'Water plants', repeat: { type: 'every', n: 3 }, line: 'up' });
  });
  it('laundry every sunday → weekly on Sunday', () => {
    expect(p('laundry every sunday')).toMatchObject({ title: 'Laundry', repeat: { type: 'weekly', days: [0] }, date: null });
    expect(p('gym every mon and thu').repeat).toEqual({ type: 'weekly', days: [1, 4] });
  });
  it('"sunscreen" stays a word, not a date', () => {
    expect(p('sunscreen')).toMatchObject({ title: 'Sunscreen', date: null, repeat: null });
    expect(p('buy sunscreen on sat').date).toBe('2026-10-24');   // short names only count after "on"
  });
  it('first thing → starts the day, on Upkeep', () => {
    expect(p('meditate first thing')).toMatchObject({ title: 'Meditate', anchor: true, line: 'up' });
  });
  it('times, days and someday', () => {
    expect(p('dentist at 3').time).toBe('15:00');
    expect(p('lunch noon').time).toBe('12:00');
    expect(p('review 14:30').time).toBe('14:30');
    expect(p('pay rent tomorrow').date).toBe('2026-10-20');
    expect(p('plan trip next week').date).toBe('2026-10-26');
    expect(p('call mum monday').date).toBe('2026-10-26');      // the same weekday means next week
    expect(p('learn piano someday')).toMatchObject({ title: 'Learn piano', someday: true });
    expect(p('pack #home').line).toBe('l3');
    expect(p('sweep #chores').line).toBe('up');
  });
  it('after / before <task> places it next to that task', () => {
    expect(p('open curtains after make the bed')).toMatchObject({ title: 'Open curtains', place: { id: 't2', where: 'after' } });
    expect(p('fold clothes right after Laundry')).toMatchObject({ title: 'Fold clothes', place: { id: 't9', where: 'after' } });
    expect(p('drink water before take meds')).toMatchObject({ title: 'Drink water', place: { id: 't3', where: 'before' } });
    // the task's name is taken first, so its words aren't read as a day, time or tag
    expect(p('fold clothes after laundry every sunday 9am')).toMatchObject({ title: 'Fold clothes', repeat: { type: 'weekly', days: [0] }, time: '09:00', place: { id: 't9' } });
    expect(p("thank sam after reply to sam's text")).toMatchObject({ title: 'Thank sam', place: { id: 't16' } });
    expect(p('stretch after walk around the block #work')).toMatchObject({ title: 'Stretch', place: { id: 't17' } });
  });
  it('"after" only counts when it names a task', () => {
    expect(p('call mum after work')).toMatchObject({ title: 'Call mum after work', place: null });
    expect(p('afternoon nap')).toMatchObject({ title: 'Afternoon nap', place: null });
    expect(p('rest after dishesx')).toMatchObject({ title: 'Rest after dishesx', place: null });
  });
  it('falls back to Upkeep when there are no focus lists', () => {
    const empty = parseContext({ dayStart: 4, lines: [], tasks: [] }, TODAY);
    expect(parse('read', empty)).toMatchObject({ line: 'up', lineGuess: true });
  });
});

describe('rule text', () => {
  it('repeatShort', () => {
    expect(repeatShort({ type: 'every', n: 1 })).toBe('Daily');
    expect(repeatShort({ type: 'every', n: 3 })).toBe('Every 3 days');
    expect(repeatShort({ type: 'weekly', days: [1, 4] })).toBe('Mon, Thu');
    expect(repeatShort({ type: 'weekly', days: [] })).toBe('Weekly');
    expect(repeatShort(null)).toBe('');
  });
  it('ruleText and ruleSource describe a task, and ruleSource parses back to the same rule', () => {
    const t = task({ repeat: { type: 'weekdays' }, time: '08:00', anchor: true, skip: TODAY });
    expect(ruleText(t, TODAY)).toBe('Weekdays · 08:00 · Starts the day · Skipped today');
    expect(ruleSource(t, TODAY)).toBe('weekdays 08:00 first thing');
    expect(parse('x ' + ruleSource(t, TODAY), ctx)).toMatchObject({ repeat: { type: 'weekdays' }, time: '08:00', anchor: true });
    const later = task({ date: '2026-10-23' });
    expect(ruleText(later, TODAY)).toBe('Fri');
    expect(ruleSource(later, TODAY)).toBe('on friday');
    expect(parse('x on friday', ctx).date).toBe('2026-10-23');
    expect(ruleText(task({ doneOn: TODAY }), TODAY)).toBe('Once · Done');
  });
});
