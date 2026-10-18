// Test helper: a task with defaults.
import type { Task } from './types';

let n = 0;
export function task(extra: Partial<Task> = {}): Task {
  n++;
  return { id: 'x' + n, line: 'up', title: 'Task ' + n, order: n, from: null, fork: 0, repeat: null, time: null, date: null, someday: false, doneOn: null, lastDone: null, skip: null, ...extra };
}
