import { describe, expect, it } from 'vitest';
import { buildNetwork } from '../domain/network';
import { seed } from '../domain/seed';
import { task } from '../domain/test-helpers';
import type { Plan } from '../domain/types';
import { layoutMap, type MapLayout } from './layout';
import type { Pt } from './geometry';
const TODAY = '2026-10-19';
function crossing(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const ax = b[0] - a[0], ay = b[1] - a[1], bx = d[0] - c[0], by = d[1] - c[1];
  const den = ax * by - ay * bx;
  if (Math.abs(den) < 1e-7) return false;
  const dx = c[0] - a[0], dy = c[1] - a[1];
  const t = (dx * by - dy * bx) / den, u = (dx * ay - dy * ax) / den;
  return t > 1e-5 && t < 1 - 1e-5 && u > 1e-5 && u < 1 - 1e-5;
}
function check(map: MapLayout, plan: Plan): void {
  const net = buildNetwork(plan, TODAY);
  expect(new Set(map.stations.map(s => s.key))).toEqual(new Set(['IC', ...net.visible]));
  for (const t of net.order) {
    const s = map.byKey[t.id]!, e = map.edgeTo[t.id]!;
    expect(e.pts.at(-1)).toEqual([s.x, s.y]);
    expect(Number.isFinite(e.len)).toBe(true);
  }
  const crossings: string[] = [];
  for (let i = 0; i < map.edges.length; i++) for (let j = i + 1; j < map.edges.length; j++) {
    const a = map.edges[i], b = map.edges[j];
    for (let k = 1; k < a.pts.length; k++) for (let l = 1; l < b.pts.length; l++) {
      if (crossing(a.pts[k - 1], a.pts[k], b.pts[l - 1], b.pts[l])) crossings.push(`${a.to} crosses ${b.to}`);
    }
  }
  expect(crossings).toEqual([]);
}
function screenshot(): Plan {
  const titles = ['Get up', 'Make the bed', 'Open curtains', 'Shower', 'Dishes', 'Assemble bookshelf', 'Sweep kitchen & living room', 'Fold clothes'];
  const tasks = titles.map((title, order) => task({ id: 't' + order, title, order, anchor: order === 2 }));
  tasks.push(...['Steps 1–10', 'Unload old shelf', 'Steps 11–13'].map((title, i) => task({ id: 'b' + i, title, order: 8 + i, from: 't5' })));
  tasks.push(task({ id: 'mop', title: 'Mop', from: 't6', order: 11 }));
  return { dayStart: 4, lines: [], tasks };
}
describe('balanced diagonal desktop layout', () => {
  it('keeps the spine and bookshelf sequence horizontal, with forks on both sides', () => {
    const plan = screenshot();
    plan.tasks.find(t => t.id === 't6')!.title = 'Sweep';
    plan.tasks.find(t => t.id === 't7')!.title = 'Fold';
    const map = layoutMap(buildNetwork(plan, TODAY), false);
    check(map, plan);
    expect(plan.tasks.filter(t => !t.from).every(t => map.byKey[t.id]!.y === 0)).toBe(true);
    expect(map.byKey.mop!.y).toBeLessThan(0);
    expect(map.byKey.b0!.y).toBeGreaterThan(0);
    expect(map.byKey.b1!.y).toBe(map.byKey.b0!.y);
    expect(map.byKey.b2!.y).toBe(map.byKey.b0!.y);
    expect(map.edgeTo.b0!.pts[0]).toEqual([map.byKey.t5!.x, 0]);
  });
  it('places the seeded full map without crossings', () => { const plan = seed(TODAY); check(layoutMap(buildNetwork(plan, TODAY), false), plan); });
  it.each([0, 1, 2, 3, 5, 6])('handles siblings and nested forks at trunk position %i', index => {
    const plan = screenshot();
    plan.lines = [{ id: 'work', name: 'Work', code: 'WK', pal: 0 }, { id: 'health', name: 'Health', code: 'HE', pal: 1 }];
    plan.tasks.push(task({ line: 'work', title: 'Review changes' }), task({ line: 'health', title: 'Take a walk' }));
    for (let f = 1; f <= 3; f++) {
      const id = 'extra' + f;
      plan.tasks.push(task({ id, from: 't' + index, fork: f, title: 'Additional branch ' + f }));
      plan.tasks.push(task({ from: id, title: 'Nested branch task' }));
    }
    const net = buildNetwork(plan, TODAY), map = layoutMap(net, false);
    check(map, plan);
    expect(layoutMap(net, false)).toEqual(map);
  });
  it('keeps empty lists available and phone columns vertical', () => {
    const plan: Plan = { dayStart: 4, tasks: [], lines: [{ id: 'work', name: 'Work', code: 'WK', pal: 0 }] };
    const net = buildNetwork(plan, TODAY), map = layoutMap(net, false);
    expect(map.termini).toHaveLength(2);
    expect(map.termini.every(t => t.empty)).toBe(true);
    const phone = layoutMap(buildNetwork(screenshot(), TODAY), true);
    expect(phone.vertical).toBe(true);
    expect(phone.stations.filter(s => s.t && !s.t.from).every(s => s.x === 0)).toBe(true);
  });
});
