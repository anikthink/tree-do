// Station meta as panel HTML / text.
import type { AppState } from '../app/store';
import type { Station } from '../map/layout';
import { metaBits, metaFor, stateWord } from '../map/status';
import { esc } from './dom';

export function metaHtml(st: AppState, s: Station, withState = false): string {
  const bits = metaBits(s).map(b => b.mono ? `<span class="mono">${esc(b.v)}</span>` : esc(b.v));
  if (withState) bits.push(esc(stateWord(st, s)));
  return bits.join(' · ');
}
export function metaText(st: AppState, s: Station): string {
  return [metaFor(s), stateWord(st, s)].filter(Boolean).join(' · ');
}
