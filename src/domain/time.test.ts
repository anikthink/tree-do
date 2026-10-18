import { describe, expect, it } from 'vitest';
import { addDays, clockFromQuery, diffDays, fixedClock, minutesOf, niceDate, serviceDay, shortDate, toMin } from './time';

describe('service day', () => {
  it('starts at 4am: 03:59 still counts as yesterday, 04:00 is the new day', () => {
    expect(serviceDay(4, new Date(2026, 9, 19, 3, 59))).toBe('2026-10-18');
    expect(serviceDay(4, new Date(2026, 9, 19, 4, 0))).toBe('2026-10-19');
    expect(serviceDay(4, new Date(2026, 9, 19, 23, 59))).toBe('2026-10-19');
  });
  it('follows the dayStart setting (midnight start = calendar day)', () => {
    expect(serviceDay(0, new Date(2026, 9, 19, 1, 30))).toBe('2026-10-19');
    expect(serviceDay(6, new Date(2026, 9, 19, 5, 59))).toBe('2026-10-18');
  });
  it('rolls over months and years', () => {
    expect(serviceDay(4, new Date(2026, 10, 1, 2, 0))).toBe('2026-10-31');
    expect(serviceDay(4, new Date(2027, 0, 1, 3, 0))).toBe('2026-12-31');
  });
  it('rolls over as an injected clock passes 4am', () => {
    let ms = new Date(2026, 9, 20, 3, 59, 30).getTime();
    const clock = () => new Date(ms);
    expect(serviceDay(4, clock())).toBe('2026-10-19');
    ms += 60_000;
    expect(serviceDay(4, clock())).toBe('2026-10-20');
  });
});

describe('clock', () => {
  it('?now= pins the clock to a moment and keeps ticking from there', () => {
    let real = 1_000_000;
    const clock = clockFromQuery('?now=2026-10-19T07:40', () => real);
    expect(clock().getTime()).toBe(new Date('2026-10-19T07:40').getTime());
    real += 90_000;
    expect(minutesOf(clock())).toBe(7 * 60 + 41);
  });
  it('ignores a missing or invalid ?now=', () => {
    expect(clockFromQuery('', () => 42)().getTime()).toBe(42);
    expect(clockFromQuery('?now=nonsense', () => 42)().getTime()).toBe(42);
  });
  it('fixedClock stays put', () => {
    const c = fixedClock('2026-10-19T07:40');
    expect(c().getTime()).toBe(c().getTime());
  });
});

describe('date helpers', () => {
  it('adds and diffs days across month ends and DST', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-11-02', '2026-10-25')).toBe(8);
  });
  it('minutes helpers', () => {
    expect(toMin('08:30')).toBe(510);
    expect(minutesOf(new Date(2026, 9, 19, 18, 5))).toBe(1085);
  });
  it('friendly dates', () => {
    const today = '2026-10-19'; // Monday
    expect(niceDate(today, today)).toBe('Today');
    expect(niceDate('2026-10-20', today)).toBe('Tomorrow');
    expect(niceDate('2026-10-18', today)).toBe('Yesterday');
    expect(niceDate('2026-10-23', today)).toBe('Fri');
    expect(niceDate('2026-10-26', today)).toBe('Mon 26 Oct');
    expect(shortDate(today)).toBe('Mon 19 Oct');
  });
});
