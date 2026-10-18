// The Plan tab (timetable): every list and rule, editable in plain words. Rows swipe left for Branch / Delete,
// and drag by their grip to another place (any list, any branch).
import type { App } from '../app/context';
import type { Store } from '../app/store';
import { MAX_FOCUS, allLines } from '../domain/lines';
import { parse, parseContext, ruleSource, ruleText } from '../domain/parse';
import { canPlace, removeTask, taskById } from '../domain/rules';
import { pad2 } from '../domain/time';
import type { Task } from '../domain/types';
import { closestEl, elementOf, esc, type Dom } from './dom';
import { installDrag } from './drag';
import { icon } from './icons';

export function createPlanView(store: Store, dom: Dom, app: App) {
  const st = store.state, ttBody = dom.ttBody;

  const ttOpen = (): boolean => st.sheet.tab === 'tt' && st.sheet.snap === 'full' && !st.hold.key;
  function openTimetable(focusId?: string): void {
    app.setTab('tt'); if (st.sheet.snap !== 'full') app.setSnap('full');
    const el = focusId ? ttBody.querySelector(`[data-id="${focusId}"] input.title`) : null;
    if (el instanceof HTMLInputElement) { el.focus({ preventScroll: true }); setTimeout(() => el.closest('.trow')?.scrollIntoView({ block: 'center' }), 0); }
    else dom.tabTT.focus();
  }
  function renderTimetable(): void {
    if (drag.busy()) return;
    const plan = st.plan, lines = allLines(plan);
    const parts: string[] = [];
    parts.push(`<p class="tt-intro">The map only shows today. This is the plan it's built from. Edit a rule in plain words:
      <code>every day 8am</code>, <code>first thing</code>, <code>weekdays</code>, <code>every 3 days</code>, <code>every mon and thu</code>, <code>tomorrow</code>, <code>on friday 14:00</code>, <code>someday</code>, <code>once</code>.
      Drag a task by its grip to move it. Swipe it left to branch or delete.</p>`);
    lines.forEach(l => {
      const pool = plan.tasks.filter(t => t.line === l.id && !t.someday);
      const ids = new Set(pool.map(t => t.id));
      const rows: [Task, number][] = [];
      const walk = (list: Task[], depth: number): void => list.sort((a, b) => a.order - b.order).forEach(t => {
        rows.push([t, depth]);
        const forks = [...new Set(pool.filter(c => c.from === t.id).map(c => c.fork || 0))].sort();
        forks.forEach(f => walk(pool.filter(c => c.from === t.id && (c.fork || 0) === f), depth + 1));
      });
      walk(pool.filter(t => !t.from || !ids.has(t.from)), 0);
      parts.push(`<div class="tline" data-line="${l.id}">
        <div class="tline-h"><span class="ldot" style="background:${l.color}"></span>
        ${l.upkeep ? `<input value="Upkeep" disabled aria-label="List name">` : `<input class="lname-in" value="${esc(l.name)}" aria-label="List name">`}
        ${l.upkeep ? '' : `<button class="ib" type="button" data-act="dropline" title="Remove list" aria-label="Remove ${esc(l.name)} list">${icon('close', 16)}</button>`}</div>
        ${rows.length ? rows.map(([t, d]) => rowHtml(t, d)).join('') : '<div class="empty">No tasks in this list.</div>'}</div>`);
    });
    const some = plan.tasks.filter(t => t.someday);
    parts.push(`<div class="tline"><div class="tline-h"><span class="ldot" style="background:#C5CBD3"></span><input value="Someday" disabled aria-label="Someday"></div>
      ${some.length ? some.map(t => rowHtml(t, 0)).join('') : '<div class="empty">Nothing parked. Hold a task and pick “Someday” to park it here.</div>'}</div>`);
    const focusCount = plan.lines.length;
    parts.push(`<div class="tt-foot">
      <div class="row"><button class="lbtn primary" id="addLine" type="button" ${focusCount >= MAX_FOCUS ? 'disabled' : ''}>${icon('plus', 16)}New list</button>
      <span class="note">${focusCount >= MAX_FOCUS ? `${MAX_FOCUS} lists is the most. Remove one to add another.` : `<span class="mono">${focusCount}/${MAX_FOCUS}</span> lists`}</span></div>
      <label>Day starts at <select id="dayStart">${[0, 2, 3, 4, 5, 6].map(h => `<option value="${h}" ${plan.dayStart === h ? 'selected' : ''}>${pad2(h)}:00</option>`).join('')}</select></label>
      <div class="row"><button class="lbtn quiet" id="resetBtn" type="button">Reset demo</button></div>
    </div>`);
    ttBody.innerHTML = parts.join('');
  }
  function rowHtml(t: Task, depth: number): string {
    const d = t.someday ? 0 : depth;
    const ops = t.someday
      ? `<button class="ib" type="button" data-act="today" title="Bring back to today" aria-label="Bring ${esc(t.title)} back to today">${icon('back', 17)}</button>`
      : `<button class="ib" type="button" data-act="up" title="Earlier in the list" aria-label="Move ${esc(t.title)} earlier">${icon('up', 17)}</button>
         <button class="ib" type="button" data-act="down" title="Later in the list" aria-label="Move ${esc(t.title)} later">${icon('down', 17)}</button>`;
    return `<div class="trow" data-id="${t.id}" style="--open:${t.someday ? 76 : 152}px;--ind:${d * 18}px">
      <div class="acts">${t.someday ? '' : `<button class="act br" type="button" data-act="branch" aria-label="Start a branch off ${esc(t.title)}">Branch</button>`}<button class="act del" type="button" data-act="del" aria-label="Delete ${esc(t.title)}">Delete</button></div>
      <div class="slide">${t.someday ? '' : `<span class="grip" title="Drag to move">${icon('grip', 16)}</span>`}
        <span class="tw">${d ? `<span class="br">${icon('corner', 15)}</span>` : ''}<input class="title" value="${esc(t.title)}" aria-label="Task name${d ? ', on a branch' : ''}"></span>
        <input class="rule" value="${esc(ruleText(t, st.today))}" data-src="${esc(ruleSource(t, st.today))}" aria-label="When (type in plain words)">
        <span class="ops">${ops}<button class="ib" type="button" data-act="more" aria-expanded="false" title="Branch or delete (or swipe left)" aria-label="More actions for ${esc(t.title)}">${icon('more', 18)}</button></span>
      </div></div>`;
  }
  function setRowOpen(row: HTMLElement | null, open: boolean): void {
    ttBody.querySelectorAll('.trow.open').forEach(r => { if (r !== row) { r.classList.remove('open'); const m = r.querySelector('[data-act="more"]'); if (m) m.setAttribute('aria-expanded', 'false'); } });
    if (!row) return;
    row.classList.toggle('open', open);
    const m = row.querySelector('[data-act="more"]'); if (m) m.setAttribute('aria-expanded', String(open));
  }
  const rowTask = (el: Element): Task | undefined => {
    const row = closestEl(el, '.trow');
    return row?.dataset.id ? taskById(st.plan.tasks, row.dataset.id) : undefined;
  };
  ttBody.addEventListener('focusin', e => {
    const r = elementOf(e.target)?.closest('input.rule');
    if (r instanceof HTMLInputElement) { r.value = r.dataset.src ?? ''; r.select(); }
    if (elementOf(e.target)?.closest('.acts')) setRowOpen(closestEl(e.target, '.trow'), true);    // keyboard reaches Branch / Delete too
  });
  ttBody.addEventListener('focusout', e => {   // restore pretty rule text if nothing changed; close a row the focus left
    const r = elementOf(e.target)?.closest('input.rule');
    if (r instanceof HTMLInputElement) { const t = rowTask(r); if (t && r.value === r.dataset.src) r.value = ruleText(t, st.today); }
    const row = closestEl(e.target, '.trow');
    const next = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    if (row && row.classList.contains('open') && !row.contains(next) && next) setRowOpen(row, false);
  });
  ttBody.addEventListener('keydown', e => {
    const el = elementOf(e.target);
    if (e.key === 'Enter' && el instanceof HTMLInputElement) el.blur();
    if (e.key === 'Escape' && el?.closest('.trow.open')) {
      e.stopPropagation(); const row = closestEl(el, '.trow'); setRowOpen(row, false);
      const more = row?.querySelector('[data-act="more"]'); if (more instanceof HTMLElement) more.focus();
    }
  });
  ttBody.addEventListener('change', e => {
    const el = e.target;
    const plan = st.plan;
    if (el instanceof HTMLSelectElement && el.id === 'dayStart') { plan.dayStart = +el.value; app.replan({ instant: true }); return; }
    if (!(el instanceof HTMLInputElement)) return;
    if (el.classList.contains('lname-in')) {
      const id = closestEl(el, '.tline')?.dataset.line;
      const l = plan.lines.find(x => x.id === id);
      if (l && el.value.trim()) { l.name = el.value.trim(); app.replan({ instant: true }); app.renderLegend(); }
      return;
    }
    const t = rowTask(el); if (!t) return;
    if (el.classList.contains('title')) { if (el.value.trim()) { t.title = el.value.trim(); app.replan({ instant: true }); } return; }
    if (el.classList.contains('rule')) {
      const v = el.value.trim().toLowerCase();
      const p = parse('x ' + v, parseContext(plan, st.today));
      t.repeat = p.repeat; t.time = p.time; t.someday = p.someday; t.date = p.date; t.skip = null; t.anchor = p.anchor && t.line === 'up';
      if (/^once\b/.test(v)) { t.repeat = null; }
      app.replan({ instant: true });
    }
  });
  ttBody.addEventListener('click', e => {
    if (swipeClick) { swipeClick = false; return; }
    const b = closestEl(e.target, 'button'); if (!b) return;
    const plan = st.plan;
    if (b.id === 'resetBtn') { app.resetDemo(); return; }
    if (b.id === 'addLine') {
      if (plan.lines.length >= MAX_FOCUS) return;
      const used = plan.lines.map(l => l.pal); const pal = [0, 1, 2, 3, 4].find(p => !used.includes(p)) ?? 0;
      const n = Math.max(0, ...plan.lines.map(l => +l.code.slice(1))) + 1;
      plan.lines.push({ id: 'l' + Date.now().toString(36), code: 'L' + n, name: 'New list', pal });
      app.replan({ instant: true }); app.renderLegend();
      const ins = ttBody.querySelectorAll('.lname-in'); const last = ins[ins.length - 1];
      if (last instanceof HTMLInputElement) { last.focus(); last.select(); }
      return;
    }
    const act = b.dataset.act;
    if (act === 'dropline') {
      const id = closestEl(b, '.tline')?.dataset.line; const l = plan.lines.find(x => x.id === id);
      if (!l) return;
      app.snapshot();
      plan.tasks.filter(t => t.line === id).forEach(t => { t.line = 'up'; t.someday = true; });
      plan.lines = plan.lines.filter(x => x.id !== id);
      app.replan({ instant: true }); app.renderLegend();
      app.toast('✕', `${l.name} list removed. Its tasks are parked under Someday.`, true);
      return;
    }
    const row = closestEl(b, '.trow'); const t = rowTask(b); if (!row || !t) return;
    if (act === 'more') {
      const open = !row.classList.contains('open'); setRowOpen(row, open);
      const first = row.querySelector('.act'); if (open && first instanceof HTMLElement) first.focus();
      return;
    }
    if (act === 'del') { app.snapshot(); removeTask(plan, t); app.replan({ instant: true }); app.toast('✕', `“${t.title}” removed.`, true); }
    if (act === 'branch') { app.startBranch(t.id); return; }
    if (act === 'today') { t.someday = false; t.date = null; app.replan(); }
    if (act === 'up' || act === 'down') {
      const sib = plan.tasks.filter(x => x.line === t.line && !x.someday && (x.from || null) === (t.from || null) && (x.fork || 0) === (t.fork || 0)).sort((a, b) => a.order - b.order);
      const i = sib.indexOf(t), j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= sib.length) return;
      [t.order, sib[j].order] = [sib[j].order, t.order];
      app.replan({ instant: true });
      const again = ttBody.querySelector(`[data-id="${t.id}"] [data-act="${act}"]`); if (again instanceof HTMLElement) again.focus();
    }
  });
  // swipe a row left to reveal Branch / Delete (touch, pen or mouse)
  let sw: { slide: HTMLElement; row: HTMLElement; id: number; x: number; y: number; base: number; dir: 'x' | null; dx: number } | null = null;
  let swipeClick = false;
  const openWidth = (row: HTMLElement): number => parseFloat(getComputedStyle(row).getPropertyValue('--open'));
  ttBody.addEventListener('pointerdown', e => {
    const slide = closestEl(e.target, '.slide'); if (!slide || e.button !== 0 || closestEl(e.target, '.grip')) return;
    const row = closestEl(slide, '.trow'); if (!row) return;
    sw = { slide, row, id: e.pointerId, x: e.clientX, y: e.clientY, base: row.classList.contains('open') ? -openWidth(row) : 0, dir: null, dx: 0 };
  });
  ttBody.addEventListener('pointermove', e => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.dir) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        sw.dir = 'x';
        const active = document.activeElement;
        if (sw.slide.contains(active) && active instanceof HTMLElement) active.blur();
        const sel = getSelection(); if (sel) sel.removeAllRanges();
        sw.slide.querySelectorAll('input').forEach(i => { i.scrollLeft = 0; });
        try { sw.slide.setPointerCapture(sw.id); } catch { /* not capturable */ }
        setRowOpen(sw.row, sw.row.classList.contains('open'));
      } else if (Math.abs(dy) > 8) { sw = null; return; }
    }
    if (sw.dir === 'x') {
      e.preventDefault(); sw.dx = dx;
      const open = openWidth(sw.row);
      sw.slide.style.transform = `translateX(${Math.max(-open - 24, Math.min(0, sw.base + dx))}px)`;
    }
  });
  function endSwipe(e: PointerEvent): void {
    if (!sw || e.pointerId !== sw.id) return;
    if (sw.dir === 'x') {
      const open = openWidth(sw.row);
      sw.slide.style.transform = '';
      setRowOpen(sw.row, sw.base + sw.dx < -open / 2);
      swipeClick = true; setTimeout(() => { swipeClick = false; }, 0);
    }
    sw = null;
  }
  ttBody.addEventListener('pointerup', endSwipe);
  ttBody.addEventListener('pointercancel', endSwipe);
  ttBody.addEventListener('dragstart', e => { if (sw && sw.dir) e.preventDefault(); });

  // drag by the grip: drop it next to any task in any list (not onto its own branch)
  const drag = installDrag({
    root: ttBody, scroller: dom.scroll, handle: '.grip', grip: true, row: '.trow',
    idOf: row => row.dataset.id,
    targets: id => {
      const t = taskById(st.plan.tasks, id);
      return [...ttBody.querySelectorAll<HTMLElement>('.tline[data-line] .trow[data-id]')].filter(r => {
        const target = r.dataset.id ? taskById(st.plan.tasks, r.dataset.id) : undefined;
        return !!t && !!target && canPlace(st.plan.tasks, t, target);
      });
    },
    drop: (id, targetId, where) => app.place(id, targetId, where),
  });

  return { ttOpen, openTimetable, renderTimetable };
}
