// The add field: type a task in plain words, see what was understood as chips, Enter adds.
// Branch mode: the next tasks go on a branch off a chosen task.
import type { App } from '../app/context';
import type { Store } from '../app/store';
import { lineById } from '../domain/lines';
import { parse, parseContext, repeatShort } from '../domain/parse';
import { isDueToday, nextOrder, taskById } from '../domain/rules';
import { niceDate } from '../domain/time';
import type { Task } from '../domain/types';
import { elementOf, esc, type Dom } from './dom';
import { icon } from './icons';

const ADD_PH = 'Add a task…  e.g. stretch every day 9am';

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
  function renderChips(): void {
    const v = addInput.value.trim();
    const from = branchFrom();
    const parts: string[] = [];
    if (from) parts.push(`<span class="chip branch">${icon('branch', 14)}<span class="bt">Branch off ${esc(from.title)}</span><button type="button" data-x aria-label="Cancel branch">${icon('close', 12)}</button></span>`);
    if (!v) {
      parts.push(from ? '<span class="hint">Type the first task. Esc to cancel.</span>'
        : '<span class="hint">Type it the way you\'d say it, e.g. <code>stretch daily 9am #health</code>.</span>');
      chips.innerHTML = parts.join(''); return;
    }
    const p = parse(v, parseContext(st.plan, st.today));
    if (from) p.line = from.line;
    const l = lineById(st.plan, p.line);
    if (!l) return;
    parts.push(`<span class="chip line" style="background:${l.tint};color:${l.text}"><span class="ldot" style="background:${l.color}"></span>${esc(l.name)}</span>`);
    if (p.someday) parts.push(`<span class="chip">${icon('archive', 13)}Someday</span>`);
    else if (p.repeat) parts.push(`<span class="chip">${icon('repeat', 13)}${repeatShort(p.repeat)}</span>`);
    else parts.push(`<span class="chip">${icon('calendar', 13)}${p.date ? niceDate(p.date, st.today) : 'Today'}</span>`);
    if (p.time) parts.push(`<span class="chip t">${p.time}</span>`);
    if (p.anchor) parts.push('<span class="chip">Starts the day</span>');
    parts.push(`<span class="hint">${p.lineGuess && !from ? '<code>#work</code> puts it in the Work list · ' : ''}Enter adds</span>`);
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
    const line = from ? from.line : p.line;
    const t: Task = { id: 't' + Date.now().toString(36), line, title: p.title, order: nextOrder(st.plan.tasks),
      from: from ? from.id : null, fork, anchor: p.anchor && !from && line === 'up', repeat: p.repeat, time: p.time, date: p.date, someday: p.someday, doneOn: null, lastDone: null, skip: null };
    st.plan.tasks.push(t);
    addInput.value = ''; renderChips();
    app.replan();
    const name = lineById(st.plan, t.line)?.name ?? '';
    if (t.someday) app.toast('+', `“${t.title}” parked for someday. It's in the plan.`, true);
    else if (!isDueToday(t, st.today)) app.toast('+', `“${t.title}” added to ${name}. First run: ${t.date ? niceDate(t.date, st.today).toLowerCase() : 'its next day'}.`, true);
    else { app.toast('+1', from ? `“${t.title}” added to the branch. Keep typing to extend it, Esc when done.` : `“${t.title}” added to ${name}.`, true); app.ensureVisible(t.id); }
  });

  return { startBranch, renderChips };
}
