// How a station reads right now (drawn state, countdown, meta text). Shared by the map and the panel.
import { repeatShort } from '../domain/parse';
import { minutesOf, toMin } from '../domain/time';
import type { AppState } from '../app/store';
import type { Station } from './layout';

/** Drawn state: a ready task only shows as open once its train has arrived. */
export type VState = 'done-ic' | 'done' | 'open' | 'locked';

export function vstate(st: AppState, key: string): VState {
  if (key === 'IC') return 'done-ic';
  const s = st.states[key];
  if (s === 'done') return 'done';
  if (s === 'avail' && st.arrived.has(key)) return 'open';
  return 'locked';
}

export interface MetaBit { v: string; mono?: boolean }
/** Quiet meta: time and repeat only. */
export function metaBits(s: Station): MetaBit[] {
  const t = s.t; if (!t) return [];
  const bits: MetaBit[] = [];
  if (t.time) bits.push({ v: t.time, mono: true });
  if (t.repeat) bits.push({ v: repeatShort(t.repeat) });
  return bits;
}
export const metaFor = (s: Station): string => metaBits(s).map(b => b.v).join(' · ');

/** "in 20 min" / "now" when a ready timed task is close. */
export function countdown(st: AppState, s: Station): string {
  if (!s.t || !s.t.time || vstate(st, s.key) !== 'open') return '';
  const d = toMin(s.t.time) - minutesOf(st.clock());
  if (d > 0 && d <= 90) return `in ${d} min`; if (d <= 0 && d > -30) return 'now';
  return '';
}

export function stateWord(st: AppState, s: Station): string {
  if (!s.t) return 'Today';
  const v = vstate(st, s.key);
  if (v === 'done') return 'Done';
  if (v === 'open') { const c = countdown(st, s); return c ? c[0].toUpperCase() + c.slice(1) : 'Ready now'; }
  return st.states[s.key] === 'avail' ? 'Opening next' : 'Later';
}
