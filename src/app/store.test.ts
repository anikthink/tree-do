import { describe, expect, it } from 'vitest';
import { fixedClock } from '../domain/time';
import { createStore, initialState } from './store';

describe('store', () => {
  it('notifies subscribers of plan changes until they unsubscribe', () => {
    const store = createStore(initialState({ dayStart: 4, lines: [], tasks: [] }, fixedClock('2026-10-19T07:40'), false));
    const seen: string[] = [];
    const off = store.subscribe(c => seen.push(c));
    store.notify('plan');
    off();
    store.notify('plan');
    expect(seen).toEqual(['plan']);
  });
});
