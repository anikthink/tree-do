// The sample day a new user (or "Reset demo") starts from.
import { addDays, parseYmd } from './time';
import type { Plan, Task } from './types';

export function seed(today: string): Plan {
  const tomorrow = addDays(today, 1), dow = parseYmd(today).getDay();
  let n = 0;
  const T = (line: string, title: string, extra: Partial<Task> = {}): Task => ({ id: 't' + (++n), line, title, order: n, from: null, fork: 0, repeat: null, time: null, date: null, someday: false, doneOn: null, lastDone: null, skip: null, ...extra });
  const fix = (tasks: Task[]): Task[] => {
    const pk = tasks.find(t => t.title === 'Pack the kitchen');
    tasks.forEach(t => { if (t.from === 'PK' && pk) t.from = pk.id; });
    return tasks;
  };
  return {
    dayStart: 4,
    lines: [
      { id: 'l1', code: 'L1', name: 'Work', pal: 0 },
      { id: 'l2', code: 'L2', name: 'Health', pal: 1 },
      { id: 'l3', code: 'L3', name: 'Home move', pal: 2 },
    ],
    tasks: fix([
      T('up', 'Get up', { repeat: { type: 'daily' }, anchor: true }),
      T('up', 'Make the bed', { repeat: { type: 'daily' }, anchor: true }),
      T('up', 'Take meds', { repeat: { type: 'daily' }, time: '08:00' }),
      T('up', 'Water + breakfast', { repeat: { type: 'daily' } }),
      T('up', 'Inbox, 10 minutes', { repeat: { type: 'weekdays' } }),
      T('up', 'Pay electricity bill', { date: today }),
      T('up', 'Dishes', { repeat: { type: 'daily' } }),
      T('up', 'Water the plants', { repeat: { type: 'every', n: 3 }, lastDone: addDays(today, -3) }),
      T('up', 'Laundry', { repeat: { type: 'weekly', days: [dow] } }),
      T('l1', 'Open laptop'),
      T('l1', 'Write a 3-item plan'),
      T('l1', 'Team standup', { time: '10:30', date: today }),
      T('l1', 'Work 25 min on the report'),
      T('l1', 'Send report draft'),
      T('l1', 'Answer one email', { from: 't11' }),         // branch off "Write a 3-item plan"
      T('l1', "Reply to Sam's text", { from: 't11' }),
      T('l2', 'Walk around the block', { repeat: { type: 'daily' } }),
      T('l2', 'Stretch 10 min', { repeat: { type: 'weekdays' }, time: '18:00' }),
      T('l2', 'Book GP appointment'),
      T('l3', 'Sort the mail pile'),
      T('l3', 'Get 5 boxes'),
      T('l3', 'Pack the bookshelf'),
      T('l3', 'Call the movers', { date: tomorrow }),
      T('l3', 'Measure the sofa', { someday: true }),
      T('l3', 'Pack the kitchen', { from: 't21' }),          // branch off "Get 5 boxes"
      T('l3', 'Wrap the glasses', { from: 'PK' }),            // sub-branch off "Pack the kitchen"
      T('l3', 'Label the boxes', { from: 't21' }),
    ]),
  };
}
