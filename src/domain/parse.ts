// The plain-words parser ("stretch daily 9am #health") and the rule text shown in the plan.
import { allLines } from './lines';
import { DOW, DOW_LONG, addDays, diffDays, niceDate, pad2, parseYmd } from './time';
import type { Line, Plan, Repeat, Task } from './types';

/** What the parser needs to know about the world. */
export interface ParseContext {
  /** All lines, Upkeep first (for `#work`-style tags). */
  lines: readonly Line[];
  /** Where an untagged one-off goes (the first focus list), or null if there is none. */
  defaultLine: string | null;
  /** The service day the words are relative to. */
  today: string;
}

export interface Parsed {
  title: string;
  line: string;
  repeat: Repeat | null;
  time: string | null;
  date: string | null;
  someday: boolean;
  anchor: boolean;
  /** No `#tag` matched, so `line` is a guess. */
  lineGuess: boolean;
}

export function parseContext(plan: Plan, today: string): ParseContext {
  return { lines: allLines(plan), defaultLine: plan.lines[0] ? plan.lines[0].id : null, today };
}

const DAYRE = '(sun|mon|tue|wed|thu|fri|sat)[a-z]*';
const dowIndex = (w: string): number => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(w.slice(0, 3).toLowerCase());

export function parse(input: string, ctx: ParseContext): Parsed {
  let s = ' ' + input + ' ';
  const out: Parsed = { title: '', line: '', repeat: null, time: null, date: null, someday: false, anchor: false, lineGuess: false };
  let line: string | null = null;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void): boolean => {
    const m = s.match(re);
    if (m) { fn(m); s = s.replace(m[0], ' '); return true; }
    return false;
  };
  take(/\s#([\w-]+)/i, m => {
    const q = m[1].toLowerCase();
    const l = ctx.lines.find(l => l.name.toLowerCase().replace(/\s+/g, '').startsWith(q) || l.code.toLowerCase() === q || (q === 'admin' || q === 'chores' || q === 'maint') && l.upkeep);
    line = l ? l.id : null;
  });
  // repeats
  take(/\s(every\s?day|daily|each day)\b/i, () => { out.repeat = { type: 'daily' }; }) ||
  take(/\s(every\s+weekday|weekdays|on weekdays)\b/i, () => { out.repeat = { type: 'weekdays' }; }) ||
  take(/\severy\s+(\d+)\s+days?\b/i, m => { out.repeat = { type: 'every', n: Math.max(1, +m[1]) }; }) ||
  take(/\severy\s+other\s+day\b/i, () => { out.repeat = { type: 'every', n: 2 }; }) ||
  take(new RegExp(`\\severy\\s+${DAYRE}((?:\\s*(?:,|and|&)\\s*${DAYRE})*)`, 'i'), m => {
    const days = (m[0].match(new RegExp(DAYRE, 'gi')) || []).map(dowIndex).filter(d => d >= 0);
    out.repeat = { type: 'weekly', days: [...new Set(days)] };
  }) ||
  take(/\s(weekly|every\s+week)\b/i, () => { out.repeat = { type: 'weekly', days: [parseYmd(ctx.today).getDay()] }; });
  take(/\s(first thing|starts? the day|to start the day)\b/i, () => { out.anchor = true; });
  // time
  take(/\s(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i, m => {
    let h = +m[1] % 12; if (m[3].toLowerCase() === 'pm') h += 12; out.time = `${pad2(h)}:${pad2(+(m[2] || 0))}`;
  }) ||
  take(/\s(?:at\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/i, m => { out.time = `${pad2(+m[1])}:${m[2]}`; }) ||
  take(/\sat\s+(\d{1,2})\b/i, m => { let h = +m[1]; if (h < 7) h += 12; out.time = `${pad2(h)}:00`; }) ||
  take(/\s(noon|midday)\b/i, () => { out.time = '12:00'; });
  // day
  const today = ctx.today;
  take(/\s(someday|some day|eventually|one day)\b/i, () => { out.someday = true; }) ||
  take(/\stomorrow\b/i, () => { out.date = addDays(today, 1); }) ||
  take(/\s(today|tonight)\b/i, () => { out.date = null; }) ||
  take(/\snext week\b/i, () => { const d = parseYmd(today); const add = ((8 - d.getDay()) % 7) || 7; out.date = addDays(today, add); });
  // a weekday: full names anywhere ("call mum friday"), short names only after "on" (so "sunscreen" stays a word)
  if (!out.repeat && !out.date && !out.someday) {
    let dayWord: string | null = null;
    take(/\s(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, m => { dayWord = m[1]; }) ||
    take(/\son\s+(sun|mon|tue|wed|thu|fri|sat)\b/i, m => { dayWord = m[1]; });
    if (dayWord) {
      const want = dowIndex(dayWord), d = parseYmd(today).getDay();
      let add = (want - d + 7) % 7; if (add === 0) add = 7;
      out.date = addDays(today, add);
    }
  }
  const title = s.replace(/\s+/g, ' ').trim().replace(/\s(at|on)$/i, '').trim();
  out.title = title ? title[0].toUpperCase() + title.slice(1) : '';
  if (line) out.line = line;
  else { out.lineGuess = true; out.line = (out.repeat || out.anchor) ? 'up' : (ctx.defaultLine ?? 'up'); }
  return out;
}

/** Short label for a repeat: Daily, Weekdays, Every 3 days, "Mon, Thu". */
export function repeatShort(r: Repeat | null): string {
  if (!r) return '';
  switch (r.type) {
    case 'daily': return 'Daily';
    case 'weekdays': return 'Weekdays';
    case 'every': return r.n === 1 ? 'Daily' : `Every ${r.n} days`;
    case 'weekly': return (r.days || []).length === 7 ? 'Daily' : (r.days || []).map(d => DOW[d]).join(', ') || 'Weekly';
  }
  return '';
}

/** The rule as shown in the plan, e.g. "Daily · 08:00 · Starts the day". */
export function ruleText(t: Task, today: string): string {
  const bits: string[] = [];
  if (t.someday) bits.push('Someday');
  else if (t.repeat) bits.push(repeatShort(t.repeat));
  else bits.push(t.date && t.date > today ? niceDate(t.date, today) : 'Once');
  if (t.time) bits.push(t.time);
  if (t.anchor) bits.push('Starts the day');
  if (t.repeat && t.skip === today) bits.push('Skipped today');
  if (!t.repeat && t.doneOn) bits.push('Done');
  return bits.join(' · ');
}

/** The rule as editable plain words (what the parser reads back), e.g. "every day 08:00 first thing". */
export function ruleSource(t: Task, today: string): string {
  const bits: string[] = [];
  if (t.someday) bits.push('someday');
  else if (t.repeat) {
    const r = t.repeat;
    bits.push(r.type === 'daily' ? 'every day' : r.type === 'weekdays' ? 'weekdays' : r.type === 'every' ? `every ${r.n} days`
      : 'every ' + (r.days || []).map(d => DOW_LONG[d]).join(' and '));
  } else if (t.date && t.date > today) bits.push(diffDays(t.date, today) === 1 ? 'tomorrow' : 'on ' + DOW_LONG[parseYmd(t.date).getDay()]);
  else bits.push('once');
  if (t.time) bits.push(t.time);
  if (t.anchor) bits.push('first thing');
  return bits.join(' ');
}
