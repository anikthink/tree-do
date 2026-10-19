// The add field: type a task in plain words, see what was understood as chips, Enter adds.
// Branch mode: the next tasks go on a branch off a chosen task.
// "after <task>" / "before <task>" puts it right next to that task (same list and branch, same days).
import type { App } from '../app/context';
import type { Store } from '../app/store';
import { lineById } from '../domain/lines';
import { type Parsed, parse, parseContext, repeatShort } from '../domain/parse';
import { inheritSchedule, isDueToday, nextOrder, placeNear, taskById } from '../domain/rules';
import { durationText, niceDate, timeRange } from '../domain/time';
import type { Task } from '../domain/types';
import { elementOf, esc, type Dom } from './dom';
import { icon } from './icons';

const ADD_PH = 'Add a task…  e.g. stretch every day 9am';
const WHERE_WORD = { after: 'After', before: 'Before' } as const;

export function createAddField(store: Store, dom: Dom, app: App) {
  const st = store.state;
  const { addInput, chips } = dom;
  addInput.placeholder = ADD_PH;
  const branchFrom = (): Task | undefined => (st.add.from ? taskById(st.plan.tasks, st.add.from) : undefined);

  function startBranch(key: string): void {
    const t = taskById(st.plan.tasks, key); if (!t) return;
    st.add.from = key; st.add.fork = null;
    app.setTab('today'); if (st.sheet.snap === 'peek' || st.sheet.snap === 'full') app.setSnap('half');
    addInput.value = ''; addInput.placeholder = 'First task on the branch…';
    renderChips(); addInput.focus({ preventScroll: true }); dom.scroll.scrollTop = 0;
  }
  function clearBranch(): void { st.add.from = null; st.add.fork = null; addInput.placeholder = ADD_PH; renderChips(); }
  /** The task as it would be added (not yet in the plan, not yet ordered). In branch mode, "after …" is ignored. */
  function draft(p: Parsed, from: Task | undefined): { t: Task; target: Task | undefined } {
    const target = !from && p.place ? taskById(st.plan.tasks, p.place.id) : undefined;
    const t: Task = { id: 't' + Date.now().toString(36), line: from ? from.line : p.line, title: p.title, order: 0,
      from: from ? from.id : null, fork: 0, repeat: p.repeat, time: p.time, duration: p.duration, date: p.date, someday: p.someday, doneOn: null, lastDone: null, skip: null };
    if (target) { t.line = target.line; t.from = target.from; t.fork = target.fork || 0; inheritSchedule(t, target, st.today); }
    t.anchor = p.anchor && !from && t.line === 'up';
    return { t, target };
  }
  function renderChips(): void {
    const v = addInput.value.trim();
    const from = branchFrom();
    const parts: string[] = [];
    if (from) parts.push(`<span class="chip branch">${icon('branch', 14)}<span class="bt">Branch off ${esc(from.title)}</span><button type="button" data-x aria-label="Cancel branch">${icon('close', 12)}</button></span>`);
    if (!v) {
      parts.push(from ? '<span class="hint">Type the first task. Esc to cancel.</span>'
        : '<span class="hint">Type it the way you\'d say it, e.g. <code>stretch daily 9am #health</code> or <code>fold clothes after laundry</code>.</span>');
      chips.innerHTML = parts.join(''); chips.classList.toggle('idle', !from); return;
    }
    chips.classList.remove('idle');
    const p = parse(v, parseContext(st.plan, st.today));
    const { t, target } = draft(p, from);
    const l = lineById(st.plan, t.line);
    if (!l) return;
    parts.push(`<span class="chip line" style="background:${l.tint};color:${l.text}"><span class="ldot" style="background:${l.color}"></span>${esc(l.name)}</span>`);
    if (target && p.place) parts.push(`<span class="chip">${icon('corner', 13)}${WHERE_WORD[p.place.where]} ${esc(target.title)}</span>`);
    if (t.someday) parts.push(`<span class="chip">${icon('archive', 13)}Someday</span>`);
    else if (t.repeat) parts.push(`<span class="chip">${icon('repeat', 13)}${repeatShort(t.repeat)}</span>`);
    else parts.push(`<span class="chip">${icon('calendar', 13)}${t.date ? niceDate(t.date, st.today) : 'Today'}</span>`);
    if (t.time) parts.push(`<span class="chip t">${timeRange(t.time, t.duration)}</span>`);
    else if (t.duration) parts.push(`<span class="chip t">${durationText(t.duration)}</span>`);
    if (t.anchor) parts.push('<span class="chip">Starts the day</span>');
    parts.push(`<span class="hint">${p.lineGuess && !from && !target ? '<code>#work</code> puts it in the Work list · ' : ''}Enter adds</span>`);
    chips.innerHTML = parts.join('');
  }
  chips.addEventListener('click', e => { if (elementOf(e.target)?.closest('[data-x]')) { addInput.value = ''; clearBranch(); addInput.focus(); } });
  addInput.addEventListener('input', renderChips);
  addInput.addEventListener('focus', () => { if (st.sheet.snap === 'peek' && !st.hold.key) app.setSnap('half'); });
  addInput.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== addInput && !addInput.value && !chips.contains(document.activeElement)) clearBranch(); }, 150); });
  addInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); addInput.value = ''; clearBranch(); addInput.blur(); return; }
    if (e.key !== 'Enter') return;
    const p = parse(addInput.value.trim(), parseContext(st.plan, st.today));
    if (!p.title) { app.toast('?', 'Type what the task is, e.g. "stretch every day 9am #health".'); return; }
    app.snapshot();
    const from = branchFrom();
    let fork = 0;
    if (from) {
      // keep adding to the branch you just started; a fresh "branch from here" on a stop that already has one starts another
      fork = st.add.fork != null ? st.add.fork : Math.max(-1, ...st.plan.tasks.filter(x => x.from === from.id).map(x => x.fork || 0)) + 1;
      st.add.fork = fork;
    }
    const { t, target } = draft(p, from);
    if (from) t.fork = fork;
    if (target && p.place) placeNear(st.plan.tasks, t, target, p.place.where);
    else t.order = nextOrder(st.plan.tasks);
    st.plan.tasks.push(t);
    addInput.value = ''; renderChips();
    app.replan();
    const name = lineById(st.plan, t.line)?.name ?? '';
    const where = target && p.place ? `${p.place.where} “${target.title}”` : `to ${name}`;
    if (t.someday) app.toast('+', `“${t.title}” parked for someday. It's in the plan.`, true);
    else if (!isDueToday(t, st.today)) app.toast('+', `“${t.title}” added ${where}. First run: ${t.date ? niceDate(t.date, st.today).toLowerCase() : 'its next day'}.`, true);
    else { app.toast('+1', from ? `“${t.title}” added to the branch. Keep typing to extend it, Esc when done.` : `“${t.title}” added ${where}.`, true); app.ensureVisible(t.id); }
  });

  return { startBranch, renderChips };
}
