// Dates and the clock. Days are local `YYYY-MM-DD` strings; the "service day" starts at `dayStart` (default 4am).

/** Where "now" comes from. Injected so tests (and the `?now=` debug flag) can pin it. */
export type Clock = () => Date;

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LONG = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Debug: `?now=2026-10-19T07:40` pins the clock to that moment; it keeps ticking from there. */
export function clockFromQuery(search: string, realNow: () => number = Date.now): Clock {
  const v = new URLSearchParams(search).get('now');
  const d = v ? new Date(v) : null;
  const offset = d && !isNaN(d.getTime()) ? d.getTime() - realNow() : 0;
  return () => new Date(realNow() + offset);
}

/** A clock stuck at one moment (tests). */
export function fixedClock(at: string | Date): Clock {
  const ms = new Date(at).getTime();
  return () => new Date(ms);
}

export const pad2 = (n: number): string => String(n).padStart(2, '0');
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function diffDays(a: string, b: string): number {
  return Math.round((parseYmd(a).getTime() - parseYmd(b).getTime()) / 864e5);
}

/** The service day starts at `dayStart` o'clock, so 01:30 still counts as "yesterday". */
export function serviceDay(dayStart: number, d: Date): string {
  return ymd(new Date(d.getTime() - dayStart * 3600e3));
}

export const minutesOf = (d: Date): number => d.getHours() * 60 + d.getMinutes();

/** A timed task with no length of its own lasts this long on the week. */
export const DEFAULT_MINS = 30;
/** Minutes since midnight → `HH:MM` (24:00 for the end of the day). */
export const hhmm = (m: number): string => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
/** "10:30–11:15" when it has a length, else "10:30". */
export function timeRange(time: string, duration?: number | null): string {
  return duration ? `${time}–${hhmm(Math.min(24 * 60, toMin(time) + duration))}` : time;
}
/** "45 min", "2h", "1h 30m". */
export function durationText(m: number): string {
  return m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
}

/** `HH:MM` → minutes since midnight. */
export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Friendly day: Today / Tomorrow / Yesterday, a weekday within the week, else "Mon 26 Oct". */
export function niceDate(dateStr: string, today: string): string {
  const dd = diffDays(dateStr, today);
  if (dd === 0) return 'Today';
  if (dd === 1) return 'Tomorrow';
  if (dd === -1) return 'Yesterday';
  const d = parseYmd(dateStr);
  return dd > 1 && dd < 7 ? DOW[d.getDay()] : `${DOW[d.getDay()]} ${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
}

/** Header date, e.g. "Mon 19 Oct". */
export function shortDate(day: string): string {
  const d = parseYmd(day);
  return `${DOW[d.getDay()]} ${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
}
