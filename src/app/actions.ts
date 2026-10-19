// What the user does to the plan: tick, move, undo, reset. Every change ends in replan(),
// which rebuilds today's map, sends trains to whatever opened, and notifies the store (which saves).
import { lineById } from '../domain/lines';
import { parse, parseContext, repeatShort } from '../domain/parse';
import { type TaskEdit, type Where, canPlace, editTask, inheritSchedule, isDone, markDone, nextOrder, placeNear, pruneFinished, putOffToTomorrow, removeTask, reopen, taskById } from '../domain/rules';
import { seed } from '../domain/seed';
import { niceDate, serviceDay } from '../domain/time';
import { type Task, isPlan } from '../domain/types';
import { type Slot, logDone, pruneHistory, slotSchedule, unlogDone } from '../domain/week';
import { dispatchTrains, seedArrived } from '../map/trains';
import { vstate } from '../map/status';
import type { App, MoveKind } from './context';
import type { Store } from './store';

const LEAF = ['Done. That one counts.', 'Done. Nice, steady progress.', 'Done for now. Good work.', 'Done. Take a breath if you need one.'];

export function createActions(store: Store, app: App, rebuild: () => void) {
  const st = store.state;
  let leafIx = 0;

  function replan(opts: { instant?: boolean } = {}): void {
    // one-off stops finished on an earlier day are history: they leave the plan quietly
    const day = serviceDay(st.plan.dayStart, st.clock());
    st.plan.tasks = pruneFinished(st.plan.tasks, day);
    pruneHistory(st.plan, day);
    rebuild();
    // drop arrivals for stations that no longer exist or became locked again
    [...st.arrived].forEach(k => { const s = st.states[k]; if (!s || s === 'locked') st.arrived.delete(k); });
    st.anims = st.anims.flatMap(a => { const e = st.map.edgeTo[a.e.to]; return e && st.states[a.e.to] !== 'locked' ? [{ ...a, e }] : []; });
    if (opts.instant) seedArrived(st); else dispatchTrains(st, performance.now());
    store.notify('plan');
    app.refreshHud(); app.renderList(); app.renderWeek();
    if (app.ttOpen()) app.renderTimetable();
  }

  function snapshot(): void { st.undoSnap = JSON.stringify(st.plan); }
  function undo(): void {
    if (!st.undoSnap) return;
    const restored: unknown = JSON.parse(st.undoSnap);
    st.undoSnap = null;
    if (!isPlan(restored)) return;
    st.plan = restored;
    replan({ instant: true });
    app.toast('↺', 'Undone.');
  }

  // tap: finish a stop (the whole point). Order is a suggestion; tapping ahead runs an express.
  function activate(key: string): void {
    const now = performance.now();
    const s = st.map.byKey[key]; if (!s || !s.t) return;
    const t = s.t;
    const v = vstate(st, key);
    if (v === 'done') { st.dings.push({ x: s.x, y: s.y, color: s.line.color, t0: now, big: false }); app.say(`${t.title}: already done. Hold it to undo.`); return; }
    if (st.states[key] === 'avail' && !st.arrived.has(key)) return; // train still on its way
    const express = v === 'locked';
    snapshot();
    markDone(t, st.today);
    logDone(st.plan, t, st.today);
    if (express) st.arrived.delete(key);
    st.popAt[key] = now; st.shakeAt[key] = null;
    st.dings.push({ x: s.x, y: s.y, color: s.line.color, t0: now, big: true });
    const before = new Set(Object.keys(st.states).filter(k => st.states[k] !== 'locked'));
    replan();
    const opened = Object.keys(st.states).filter(k => st.states[k] === 'avail' && !before.has(k)).map(k => st.map.byKey[k]?.t?.title ?? '');
    const onMap = st.map.stations.filter(x => x.t && !x.old);
    const dueTotal = onMap.length, doneN = onMap.filter(x => x.t && isDone(x.t, st.today)).length;
    if (doneN === dueTotal) app.toast(`${doneN}/${dueTotal}`, 'All done for today.', true);
    else if (express) app.toast('EXPRESS', `“${t.title}” done early. The tasks before it are still open.`, true);
    else if (t.anchor && st.map.stations.filter(x => x.t && x.t.anchor).every(x => x.t && isDone(x.t, st.today)) && st.plan.lines.length)
      app.toast('GO', 'Morning done. Everything else is open now.', true);
    else if (opened.length) app.toast(`+${opened.length}`, opened.length === 1 ? `Next up: ${opened[0]}.` : `Next up: ${opened.join(' and ')}.`, true);
    else app.toast('✓', LEAF[leafIx++ % LEAF.length], true);
  }

  // hold: the few things you can do to a stop
  function move(key: string, how: MoveKind): void {
    const t = taskById(st.plan.tasks, key); if (!t) return;
    snapshot();
    const today = st.today;
    let msg = '';
    switch (how) {
      case 'later': t.order = nextOrder(st.plan.tasks); msg = `“${t.title}” moved to the end of its list.`; break;
      case 'tomorrow': putOffToTomorrow(t, today); msg = t.repeat ? `Skipping “${t.title}” today. Back tomorrow.` : `“${t.title}” is off today's map. Back tomorrow.`; break;
      case 'someday': t.someday = true; msg = `“${t.title}” parked for someday. It's in the plan.`; break;
      case 'undone': reopen(t, today); unlogDone(st.plan, t.id, today); msg = `“${t.title}” is open again.`; break;
      case 'delete': removeTask(st.plan, t); msg = `“${t.title}” removed.`; break;
    }
    replan();
    app.toast(how === 'delete' ? '✕' : how === 'undone' ? '↺' : '→', msg, true);
  }

  function resetDemo(): void {
    snapshot();
    st.plan = seed(serviceDay(st.plan.dayStart, st.clock()));
    st.arrived.clear(); st.anims = []; st.userMoved = false;
    replan({ instant: true }); app.renderLegend(); app.initialView();
    app.toast('NEW', 'Demo plan restored.', true);
  }

  /** The clock tick: at day start the map quietly rebuilds for the new day; otherwise countdowns refresh. */
  function tick(): void {
    if (serviceDay(st.plan.dayStart, st.clock()) !== st.today) {
      st.arrived.clear(); st.anims = []; replan({ instant: true });
      app.toast('NEW DAY', 'Fresh map for today. Yesterday is done with.');
    } else { app.refreshHud(); app.renderWeek(); }
  }

  /** Dragged into place: right before or after another task, in its list and on its branch. */
  function place(id: string, targetId: string, where: Where): void {
    const t = taskById(st.plan.tasks, id), target = taskById(st.plan.tasks, targetId);
    if (!t || !target || !canPlace(st.plan.tasks, t, target)) return;
    snapshot();
    placeNear(st.plan.tasks, t, target, where);
    replan({ instant: true });
    app.toast('↕', `“${t.title}” moved ${where} “${target.title}”.`, true);
  }

  /** Typed into a slot on the week: the slot's day and time unless the words say otherwise; `line` is the list picked there. */
  function addAt(text: string, slot: Slot, line: string | null): Task | null {
    const p = parse(text, parseContext(st.plan, st.today));
    if (!p.title) return null;
    snapshot();
    const { date, time } = slotSchedule(p, slot, st.today);
    const target = p.place ? taskById(st.plan.tasks, p.place.id) : undefined;
    const t: Task = { id: 't' + Date.now().toString(36), line: p.lineGuess && line && lineById(st.plan, line) ? line : p.line, title: p.title, order: 0,
      from: null, fork: 0, repeat: p.repeat, time, date, someday: p.someday, doneOn: null, lastDone: null, skip: null };
    t.anchor = p.anchor && t.line === 'up';
    if (target && p.place) { t.line = target.line; t.from = target.from; t.fork = target.fork || 0; inheritSchedule(t, target, st.today); placeNear(st.plan.tasks, t, target, p.place.where); }
    else t.order = nextOrder(st.plan.tasks);
    st.plan.tasks.push(t);
    replan();
    const when = t.someday ? 'for someday' : t.repeat ? repeatShort(t.repeat).toLowerCase() : niceDate(t.date ?? st.today, st.today).replace(/^(Today|Tomorrow)$/, m => m.toLowerCase());
    app.toast('+', `“${t.title}” added to ${lineById(st.plan, t.line)?.name ?? 'its list'}, ${when}${t.time ? ' at ' + t.time : ''}.`, true);
    return t;
  }

  /** Changed in the week's editor: name, list, day, time, repeat. */
  function edit(id: string, e: TaskEdit): void {
    const t = taskById(st.plan.tasks, id); if (!t) return;
    snapshot();
    editTask(st.plan.tasks, t, e, st.today);
    replan({ instant: true });
    app.toast('✓', `“${t.title}” updated.`, true);
  }

  return { replan, snapshot, undo, activate, move, place, resetDemo, tick, addAt, edit };
}
