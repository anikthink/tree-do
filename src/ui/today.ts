// The Today view: header date + count, the "next up" row in the peek, and the Ready now / Later / Done lists.
import type { App } from '../app/context';
import type { Store } from '../app/store';
import { allLines } from '../domain/lines';
import { canPlace, isDone, taskById } from '../domain/rules';
import { minutesOf, pad2, shortDate, toMin } from '../domain/time';
import type { Station } from '../map/layout';
import { countdown, metaFor, vstate } from '../map/status';
import { closestEl, esc, focusEl, type Dom } from './dom';
import { metaHtml, metaText } from './format';
import { installDrag } from './drag';
import { TICK, icon } from './icons';

type RowKind = 'open' | 'enroute' | 'locked' | 'done';

export function createTodayView(store: Store, dom: Dom, app: App) {
  const st = store.state;
  const { next: nextEl, todayList } = dom;

  function checkHtml(s: Station, kind: RowKind): string {
    const l = s.line, style = `--c:${l.color};--tint:${l.tint}`;
    if (kind === 'done') return `<span class="check is-done" style="${style}" aria-hidden="true"><span class="box">${TICK}</span></span>`;
    return `<button class="check ${kind}" type="button" data-done="${s.key}" style="${style}" ${kind === 'enroute' ? 'disabled' : ''} aria-label="${kind === 'locked' ? 'Done early' : 'Done'}: ${esc(s.t?.title)}"><span class="box">${TICK}</span></button>`;
  }
  // Ticking a checkbox is the signature moment: fill, draw the check, then the map follows.
  let ticking = false;
  function tickThen(btn: HTMLElement, key: string): void {
    if (ticking || btn.classList.contains('ticking')) return;
    if (st.reducedMotion) { app.activate(key); return; }
    ticking = true; btn.classList.add('ticking');
    setTimeout(() => { ticking = false; app.activate(key); }, 380);
  }
  /** Leads with the soonest timed task that is ready (or just started), else the first ready one. */
  function lead(open: Station[]): Station | undefined {
    const m = minutesOf(st.clock());
    const timeOf = (s: Station): number => toMin(s.t?.time ?? '');
    return open.filter(s => s.t?.time && timeOf(s) - m > -30).sort((a, b) => timeOf(a) - timeOf(b))[0];
  }
  let nextSig = '';
  function renderNext(list: Station[], doneN: number): void {
    const open = list.filter(s => vstate(st, s.key) === 'open');
    const m = minutesOf(st.clock());
    const timed = lead(open);
    let html: string, sig: string, quiet = false, title = '';
    if (list.length && doneN === list.length) {
      sig = 'complete' + list.length;
      html = `<span class="check is-done" style="--c:#2F7CF6" aria-hidden="true"><span class="box">${TICK}</span></span><div class="txt"><div class="nm">All done for today</div><div class="tm"><span class="mono">${list.length}/${list.length}</span> tasks ticked off</div></div>`;
    } else if (timed || open.length) {
      const s = timed || open[0], l = s.line;
      const others = open.length - 1;
      title = s.t?.title ?? '';
      let tm = `<span class="ldot" style="background:${l.color}"></span>${esc(l.name)}`;
      if (s.t?.time) {
        const d = toMin(s.t.time) - m;
        const when = d > 0 ? (d >= 60 ? `in ${Math.floor(d / 60)}h ${pad2(d % 60)}` : `in ${d} min`) : 'now';
        tm += ` · <span class="mono">${s.t.time}</span> ${when}`;
      }
      sig = s.key + '|' + tm + '|' + others;
      html = `<button class="check" type="button" data-key="${s.key}" style="--c:${l.color};--tint:${l.tint}" aria-label="Done: ${esc(title)}"><span class="box">${TICK}</span></button>
        <div class="txt"><div class="nm"></div><div class="tm">${tm}</div></div>${others > 0 ? `<button class="more" type="button" data-open aria-label="Show all ${others + 1} ready tasks">+${others}</button>` : ''}`;
    } else {
      const approaching = st.anims.length > 0;
      quiet = true;
      sig = approaching ? 'approach' : (list.length ? 'wait' : 'none');
      html = `<span class="check wait" aria-hidden="true"><span class="box"></span></span><div class="txt">
        <div class="nm">${approaching ? 'Opening next…' : list.length ? 'Nothing ready right now' : 'Nothing planned today'}</div>
        <div class="tm">${approaching ? 'Ready in a moment' : list.length ? 'Pull up for the plan' : 'Add a task below'}</div></div>`;
    }
    if (sig === nextSig) return;
    const hadFocus = nextEl.contains(document.activeElement);
    nextSig = sig; nextEl.innerHTML = html; nextEl.classList.toggle('quiet', quiet);
    nextEl.style.animation = 'none'; void nextEl.offsetWidth; nextEl.style.animation = '';
    const nm = nextEl.querySelector('.nm:empty'); if (nm) nm.textContent = title;
    if (hadFocus) focusEl(nextEl.querySelector('button') || dom.grab);
  }
  nextEl.addEventListener('click', e => {
    if (closestEl(e.target, '[data-open]')) { app.setTab('today'); app.setSnap('half'); return; }
    const b = closestEl(e.target, '.check[data-key]'); if (b?.dataset.key) tickThen(b, b.dataset.key);
  });

  function rowFor(s: Station, kind: RowKind): string {
    const l = s.line, title = s.t?.title ?? '';
    const meta = `<span class="ldot" style="background:${l.color}"></span>${esc(l.name)}${metaFor(s) ? ' · ' + metaHtml(st, s) : ''}${kind === 'enroute' ? ' · Opening next' : ''}${countdown(st, s) ? ' · ' + countdown(st, s) : ''}`;
    return `<div class="srow ${kind === 'enroute' ? 'locked' : kind}" data-id="${s.key}">${checkHtml(s, kind)}
      <button class="main" type="button" data-hold="${s.key}" aria-label="${esc(title)}, ${esc(l.name)}, ${esc(metaText(st, s).toLowerCase())}. Open task actions."><span class="tx"><span class="t">${esc(title)}</span><span class="m">${meta}</span></span>${icon('more', 18)}</button></div>`;
  }
  let stale = false;   // a refresh came in mid-drag; render once it ends
  function renderToday(list: Station[]): void {
    if (drag.busy()) { stale = true; return; }
    stale = false;
    const groups: { open: Station[]; ahead: Station[]; done: Station[] } = { open: [], ahead: [], done: [] };
    list.forEach(s => { const v = vstate(st, s.key); if (v === 'done') groups.done.push(s); else if (v === 'open') groups.open.push(s); else groups.ahead.push(s); });
    const active = document.activeElement;
    const focusSel = active instanceof HTMLElement && todayList.contains(active)
      ? (active.dataset.done ? `[data-done="${active.dataset.done}"]` : active.dataset.hold ? `[data-hold="${active.dataset.hold}"]` : null) : null;
    const first = lead(groups.open) || groups.open[0];
    if (first) groups.open = [first, ...groups.open.filter(s => s !== first)];
    todayList.innerHTML = `
      <section class="grp"><h3>Ready now <span class="n">${groups.open.length}</span></h3>
        ${groups.open.length ? groups.open.map((s, i) => rowFor(s, 'open').replace('class="srow open"', i === 0 ? 'class="srow open first"' : 'class="srow open"')).join('') : `<p class="empty">${list.length && !groups.ahead.length ? 'All done for today.' : st.anims.length ? 'Opening next…' : 'Nothing ready right now.'}</p>`}</section>
      ${groups.ahead.length + groups.done.length ? `<button class="morebtn" type="button" data-full><span>${groups.ahead.length} coming up · ${groups.done.length} done</span>${icon('chevUp', 18)}</button>` : ''}
      <section class="grp more"><h3>Later <span class="n">${groups.ahead.length}</span></h3>
        ${groups.ahead.length ? groups.ahead.map(s => rowFor(s, st.states[s.key] === 'avail' ? 'enroute' : 'locked')).join('') : '<p class="empty">Nothing waiting.</p>'}</section>
      <section class="grp more"><h3>Done <span class="n">${groups.done.length}</span></h3>
        ${groups.done.length ? groups.done.map(s => rowFor(s, 'done')).join('') : '<p class="empty">Nothing yet. The first one is the hardest.</p>'}</section>`;
    if (focusSel) focusEl(todayList.querySelector(focusSel) || dom.addInput);
  }
  todayList.addEventListener('click', e => {
    const d = closestEl(e.target, '[data-done]'); if (d) { if (d.dataset.done) tickThen(d, d.dataset.done); return; }
    if (closestEl(e.target, '[data-full]')) { app.setSnap('full'); app.setTab('today'); return; }
    const h = closestEl(e.target, '[data-hold]'); if (h?.dataset.hold) app.openMenu(h.dataset.hold);
  });
  todayList.addEventListener('contextmenu', e => {
    const h = closestEl(e.target, '[data-hold]'); if (!h?.dataset.hold) return;
    e.preventDefault(); if (!drag.busy()) app.openMenu(h.dataset.hold);
  });
  // drag a task onto another to put it right before or after it (any list, any branch)
  const drag = installDrag({
    root: todayList, scroller: dom.scroll, handle: '.main', grip: false, row: '.srow',
    idOf: row => row.dataset.id,
    targets: id => {
      const t = taskById(st.plan.tasks, id);
      return [...todayList.querySelectorAll<HTMLElement>('.srow[data-id]')].filter(r => {
        const target = r.dataset.id ? taskById(st.plan.tasks, r.dataset.id) : undefined;
        return !!t && !!target && canPlace(st.plan.tasks, t, target);
      });
    },
    drop: (id, targetId, where) => app.place(id, targetId, where),
    held: id => app.openMenu(id),
    cancelled: () => { if (stale) app.refreshHud(); },
  });

  function refreshHud(): void {
    const list = st.map.stations.filter(s => s.t && !s.old);
    const doneN = list.filter(s => s.t && isDone(s.t, st.today)).length;
    const date = shortDate(st.today);
    dom.topDate.textContent = date;
    dom.topCount.textContent = `${doneN}/${list.length}`;
    dom.topCount.setAttribute('aria-label', `${doneN} of ${list.length} tasks done`);
    dom.sDate.textContent = date;
    dom.sCount.textContent = `${doneN}/${list.length}`; dom.sCount.setAttribute('aria-label', `${doneN} of ${list.length} tasks done`);
    renderNext(list, doneN);
    renderToday(list);
    allLines(st.plan).forEach(l => {
      const el = document.getElementById('cnt-' + l.id); if (!el) return;
      const all = list.filter(s => s.line.id === l.id);
      el.textContent = `${all.filter(s => s.t && isDone(s.t, st.today)).length}/${all.length}`;
    });
  }
  return { refreshHud };
}
