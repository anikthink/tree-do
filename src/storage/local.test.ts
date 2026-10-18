// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY, loadState, saveState } from './local';

describe('local storage', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is saved, so the app starts from the sample day', () => {
    expect(loadState()).toBeNull();
  });

  it('round-trips a saved plan', () => {
    const plan = { dayStart: 4, lines: [{ id: 'l1', name: 'Work' }], tasks: [{ id: 't1', title: 'Get up' }] };
    saveState(plan);
    expect(loadState()).toEqual(plan);
  });

  it('ignores corrupt or incomplete data instead of crashing', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadState()).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dayStart: 4 }));
    expect(loadState()).toBeNull();
  });
});
