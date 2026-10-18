// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY, loadState, saveState } from './local';

describe('local storage', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is saved, so the app starts from the sample day', () => {
    expect(loadState()).toBeNull();
  });

  it('round-trips a saved plan', () => {
    const plan = {
      dayStart: 4,
      lines: [{ id: 'l1', code: 'L1', name: 'Work', pal: 0 }],
      tasks: [{ id: 't1', line: 'up', title: 'Get up', order: 1, from: null, fork: 0, repeat: { type: 'daily' as const }, time: null, date: null, someday: false, doneOn: null, lastDone: null, skip: null }],
    };
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
