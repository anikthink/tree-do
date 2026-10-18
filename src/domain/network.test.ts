import { describe, expect, it } from 'vitest';
import { buildNetwork, lineStates } from './network';
import { markDone } from './rules';
import { seed } from './seed';
import { task } from './test-helpers';
import type { Plan } from './types';

const TODAY = '2026-10-19';   // a Monday
const fresh = (): Plan => seed(TODAY);
const byTitle = (plan: Plan, title: string) => {
  const t = plan.tasks.find(x => x.title === title);
  if (!t) throw new Error('no task ' + title);
  return t;
};
const tick = (plan: Plan, ...titles: string[]) => titles.forEach(n => markDone(byTitle(plan, n), TODAY));
const statesOf = (plan: Plan) => {
  const net = buildNetwork(plan, TODAY);
  const s = lineStates(net, TODAY);
  return (title: string) => s[byTitle(plan, title).id];
};

describe("today's network", () => {
  it('puts only what is due today on the map', () => {
    const plan = fresh();
    const net = buildNetwork(plan, TODAY);
    const titles = net.order.map(t => t.title);
    expect(titles).toContain('Laundry');                  // weekly on today's weekday
    expect(titles).toContain('Water the plants');         // every 3 days, last done 3 days ago
    expect(titles).not.toContain('Call the movers');      // tomorrow
    expect(titles).not.toContain('Measure the sofa');     // someday
    expect(net.order).toHaveLength(25);
  });
  it('orders depth-first: a branch point comes before its branch', () => {
    const plan = fresh();
    const titles = buildNetwork(plan, TODAY).order.map(t => t.title);
    expect(titles.slice(0, 2)).toEqual(['Get up', 'Make the bed']);
    expect(titles.indexOf('Answer one email')).toBe(titles.indexOf('Write a 3-item plan') + 1);
    expect(titles.indexOf('Wrap the glasses')).toBe(titles.indexOf('Pack the kitchen') + 1);
  });
  it('the junction is the last "starts the day" task on Upkeep', () => {
    const plan = fresh();
    expect(buildNetwork(plan, TODAY).junction).toBe(byTitle(plan, 'Make the bed').id);
    plan.tasks.forEach(t => { t.anchor = false; });
    expect(buildNetwork(plan, TODAY).junction).toBeNull();
  });
});

describe('task states', () => {
  it('unlocks in order: only the first task is ready at the start', () => {
    const plan = fresh();
    let s = statesOf(plan);
    expect(s('Get up')).toBe('avail');
    expect(s('Make the bed')).toBe('locked');
    expect(s('Take meds')).toBe('locked');
    tick(plan, 'Get up');
    s = statesOf(plan);
    expect(s('Get up')).toBe('done');
    expect(s('Make the bed')).toBe('avail');
    expect(s('Take meds')).toBe('locked');
  });
  it('focus lists wait for the morning tasks, then all open together', () => {
    const plan = fresh();
    tick(plan, 'Get up');
    let s = statesOf(plan);
    ['Open laptop', 'Walk around the block', 'Sort the mail pile'].forEach(n => expect(s(n)).toBe('locked'));
    tick(plan, 'Make the bed');
    s = statesOf(plan);
    ['Take meds', 'Open laptop', 'Walk around the block', 'Sort the mail pile'].forEach(n => expect(s(n)).toBe('avail'));
    expect(s('Write a 3-item plan')).toBe('locked');
  });
  it('without a morning junction the focus lists are open from the start', () => {
    const plan = fresh();
    plan.tasks.forEach(t => { t.anchor = false; });
    expect(statesOf(plan)('Open laptop')).toBe('avail');
  });
  it('a branch opens once its root is done', () => {
    const plan = fresh();
    tick(plan, 'Get up', 'Make the bed', 'Open laptop');
    let s = statesOf(plan);
    expect(s('Write a 3-item plan')).toBe('avail');
    expect(s('Answer one email')).toBe('locked');
    tick(plan, 'Write a 3-item plan');
    s = statesOf(plan);
    expect(s('Answer one email')).toBe('avail');
    expect(s('Team standup')).toBe('avail');               // the trunk carries on too
    expect(s("Reply to Sam's text")).toBe('locked');
  });
  it('sub-branches wait for their own root', () => {
    const plan = fresh();
    tick(plan, 'Get up', 'Make the bed', 'Sort the mail pile', 'Get 5 boxes');
    let s = statesOf(plan);
    expect(s('Pack the kitchen')).toBe('avail');
    expect(s('Wrap the glasses')).toBe('locked');
    tick(plan, 'Pack the kitchen');
    s = statesOf(plan);
    expect(s('Wrap the glasses')).toBe('avail');
  });
  it('skip-ahead: ticking a later task keeps the earlier ones ready (even before the morning is done)', () => {
    const plan = fresh();
    tick(plan, 'Send report draft');
    const s = statesOf(plan);
    expect(s('Send report draft')).toBe('done');
    ['Open laptop', 'Write a 3-item plan', 'Team standup', 'Work 25 min on the report'].forEach(n => expect(s(n)).toBe('avail'));
    expect(s('Answer one email')).toBe('locked');          // its root isn't done
    expect(s('Make the bed')).toBe('locked');              // other lines are unaffected
  });
  it('a branch whose root is off the map joins the nearest visible stop (or the line)', () => {
    const plan = fresh();
    const root = byTitle(plan, 'Write a 3-item plan');
    root.date = '2026-10-21';                              // not today
    const net = buildNetwork(plan, TODAY);
    const email = byTitle(plan, 'Answer one email');
    expect(net.seqs.l1?.trunk?.map(t => t.title)).toContain('Answer one email');
    expect(lineStates(net, TODAY)[email.id]).toBeDefined();
  });
  it('a finished one-off with an unfinished branch stays on the map as done', () => {
    const plan: Plan = { dayStart: 4, lines: [], tasks: [] };
    const root = task({ doneOn: '2026-10-18' }), child = task({ from: root.id });
    plan.tasks.push(root, child);
    const net = buildNetwork(plan, TODAY);
    expect(net.order.map(t => t.id)).toEqual([root.id, child.id]);
    const s = lineStates(net, TODAY);
    expect([s[root.id], s[child.id]]).toEqual(['done', 'avail']);
  });
});
