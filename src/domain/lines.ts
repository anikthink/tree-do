// Lines (lists) and their colours. Calm: one quiet slate maintenance line, four clear focus colours (amber-free).
import type { Line, List, Plan } from './types';

/** text = a darker shade for words in the line's colour (>= 4.5:1 on white and on its tint); tint = 10% of the colour on white. */
export const PALETTE = [
  { color: '#2F7CF6', ink: '#fff', text: '#1F62D0', tint: '#EAF2FF' },   // blue
  { color: '#14A38B', ink: '#fff', text: '#0B7563', tint: '#E8F6F3' },   // teal
  { color: '#F2645A', ink: '#fff', text: '#C13D33', tint: '#FDF0EF' },   // coral
  { color: '#8B6CF0', ink: '#fff', text: '#6446C8', tint: '#F3EDFE' },   // violet
  { color: '#C2569E', ink: '#fff', text: '#9C3577', tint: '#F9EEF5' },   // plum
];
/** The maintenance line every day starts on. */
export const UPKEEP: Line = { id: 'up', code: 'UP', name: 'Upkeep', color: '#5B6B7F', ink: '#fff', text: '#4A5868', tint: '#EFF0F2', upkeep: true };
/** The start of the map ("Today"). */
export const IC: Line = { id: 'IC', code: 'IC', name: 'Today', color: '#1C2430', ink: '#fff', text: '#1C2430', tint: '#F4F6F9' };
export const MAX_FOCUS = 4;

export function resolveList(l: List): Line {
  const p = PALETTE[l.pal % PALETTE.length];
  return { ...l, color: p.color, ink: p.ink, text: p.text, tint: p.tint };
}
export function lineById(plan: Plan, id: string): Line | null {
  if (id === 'up') return UPKEEP;
  const l = plan.lines.find(x => x.id === id);
  return l ? resolveList(l) : null;
}
/** Upkeep first (the day starts on it), then the focus lists. */
export function allLines(plan: Plan): Line[] {
  return [UPKEEP, ...plan.lines.map(resolveList)];
}
