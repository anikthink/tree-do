// The week views beside the panel: Hours (a time grid, untimed tasks in an Anytime tray) and Days (a row per day,
// each folding to a strip of tiny lines). A task's circle ticks it (today); the rest of it opens an editor.
// Click an empty time (or a day's +) to add a task right there, like a calendar.
import type { App } from '../app/context';
import type { Mode, Store } from '../app/store';
import { allLines, lineById } from '../domain/lines';
import { parse, parseContext, repeatShort } from '../domain/parse';
import { DOW, minutesOf, niceDate, pad2, parseYmd, shortDate, toMin } from '../domain/time';
import { taskById } from '../domain/rules';
import type { Line, Repeat } from '../domain/types';
import { type DayItem, type Slot, dayItems, slotSchedule, weekDays } from '../domain/week';
import { saveView } from '../storage/local';
import { closestEl, esc, type Dom } from './dom';
import { TICK, icon } from './icons';

const MODES: readonly Mode[] = ['map', 'hours', 'days'];
const asMode = (v: string | undefined): Mode => MODES.find(m => m === v) ?? 'map';
/** Hours: one hour's height. Days: one stop's row height and a branch's indent. */
const HH = 44, RH = 32, IND = 20;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATE_WORD: Record<DayItem['state'], string> = { done: 'done', ready: 'ready now', later: 'later' };

interface Day { day: string; items: DayItem[]; rel: 'past' | 'today' | 'later' }

export function createWeekView(store: Store, dom: Dom, app: App) {
  const st = store.state, wk = st.week;
  const { week: root, modeBtns } = dom;
  let scrollTo: 'now' | null = 'now';   // open on the current hour and today's column
  /** The task being added on the week: where, and the list picked for it (null: whatever the words say). */
  let compose: (Slot & { line: string | null }) | null = null;

  const lineOf = (id: string): Line | null => lineById(st.plan, id);
  const vars = (l: Line): string => `--c:${l.color};--tx:${l.text};--tint:${l.tint}`;
  const mark = (s: DayItem['state']): string => `<span class="wm ${s}" aria-hidden="true">${s === 'done' ? TICK : ''}</span>`;
  /**
   * A task on the week: its circle ticks it off (today only; ticking a done one reopens it), the rest opens the editor.
   * Earlier days are a record; a task still in the plan can be edited from there too.
   */
  function itemTag(d: Day, it: DayItem, cls: string, body: string, style = ''): string {
    const l = lineOf(it.line); if (!l) return '';
    const label = `${esc(it.title)}, ${esc(l.name)}${it.time ? ', ' + it.time : ''}, ${STATE_WORD[it.state]}`;
    const tick = d.rel === 'today'
      ? `<button type="button" class="wmb" data-tick="${it.id}" aria-label="${it.state === 'done' ? 'Not done yet' : 'Done'}: ${esc(it.title)}">${mark(it.state)}</button>`
      : `<span class="wmb">${mark(it.state)}</span>`;
    const main = d.rel !== 'past' || it.live
      ? `<button type="button" class="wbody" data-open="${it.id}" data-on="${d.day}" aria-label="${label}. Edit.">${body}</button>`
      : `<span class="wbody" aria-label="${label}">${body}</span>`;
    return `<div class="${cls} ${it.state}" data-item="${it.id}@${d.day}" style="${vars(l)}${style}">${tick}${main}</div>`;
  }
  const dayName = (d: Day): string => {
    const diff = Math.round((parseYmd(d.day).getTime() - parseYmd(st.today).getTime()) / 864e5);
    return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : DOW[parseYmd(d.day).getDay()];
  };
  function rangeLabel(days: string[]): string {
    const a = parseYmd(days[0]), b = parseYmd(days[6]);
    return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MON[b.getMonth()]}` : `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]}`;
  }
  const doneCount = (items: DayItem[]): string => `${items.filter(i => i.state === 'done').length}/${items.length}`;

  function head(days: string[]): string {
    const opt = (r: string, label: string) => `<button type="button" role="radio" data-range="${r}" aria-checked="${wk.range === r}" tabindex="${wk.range === r ? 0 : -1}">${label}</button>`;
    return `<header class="wk-head"><h2 class="wk-title">${rangeLabel(days)}</h2>${wk.mode === 'hours' ? '<span class="wk-hint">Click a time to add a task</span>' : ''}
      <div class="wk-seg" role="radiogroup" aria-label="Days shown">${opt('next', 'Next 7 days')}${opt('week', 'This week')}</div></header>`;
  }

  // ---------- Hours
  function hours(days: Day[]): string {
    const timed = days.flatMap(d => d.items.filter(i => i.time).map(i => toMin(i.time ?? '')));
    const h0 = Math.min(7, ...timed.map(m => Math.floor(m / 60))), h1 = Math.max(22, ...timed.map(m => Math.floor(m / 60) + 1));
    const top = (m: number): number => (m - h0 * 60) / 60 * HH;
    const lines = (d: Day) => [...new Set(d.items.filter(i => !i.time).map(i => i.line))];
    let h = `<div class="hv${wk.tray ? ' tray-open' : ''}" style="--hh:${HH}px;--rows:${h1 - h0}"><div class="hv-scroll" data-scroll><div class="hv-grid" data-h0="${h0}">`;
    // day heads
    h += '<div class="hv-corner"></div>' + days.map(d => { const p = parseYmd(d.day);
      return `<div class="hv-dh ${d.rel}"><span>${dayName(d)}</span><b class="mono">${p.getDate()}</b></div>`; }).join('');
    // Anytime tray: one chip per list, opening to its tasks
    h += `<div class="hv-tl"><button type="button" data-tray aria-expanded="${wk.tray}">Anytime ${icon('chevUp', 14)}</button></div>`;
    days.forEach(d => {
      h += `<div class="hv-tc ${d.rel}"${d.rel === 'past' ? '' : ` data-tray-day="${d.day}"`}>`;
      lines(d).forEach(id => {
        const l = lineOf(id); if (!l) return;
        const its = d.items.filter(i => !i.time && i.line === id), n = its.filter(i => i.state === 'done').length;
        const tone = n === its.length ? 'done' : its.some(i => i.state === 'ready') ? 'ready' : 'later';
        h += `<button type="button" class="hv-chip ${tone}" data-tray style="${vars(l)}" aria-expanded="${wk.tray}"><span class="ldot" style="background:${l.color}"></span><span class="nm">${esc(l.name)}</span><span class="mono">${n}/${its.length}</span></button>`;
        h += `<div class="hv-list">${its.map(it => itemTag(d, it, 'hv-li', `<span class="tt">${esc(it.title)}</span>`)).join('')}</div>`;
      });
      if (compose && compose.day === d.day && !compose.time) h += '<div class="hv-ghost chip">New task</div>';
      if (d.rel === 'past') { if (!d.items.some(i => !i.time)) h += '<span class="hv-none">Nothing logged</span>'; }
      else h += `<button type="button" class="hv-add" data-add-day="${d.day}" aria-label="Add a task on ${shortDate(d.day)}">${icon('plus', 13)}Add</button>`;
      h += '</div>';
    });
    // the grid
    h += '<div class="hv-gut">';
    for (let hr = h0 + 1; hr < h1; hr++) h += `<span class="mono" style="top:${(hr - h0) * HH}px">${String(hr).padStart(2, '0')}:00</span>`;
    h += '</div>';
    days.forEach(d => {
      h += `<div class="hv-col ${d.rel}"${d.rel === 'past' ? '' : ` data-col-day="${d.day}"`}>`;
      if (compose && compose.day === d.day && compose.time) h += `<div class="hv-ghost" style="top:${top(toMin(compose.time)) + 2}px"><span>New task</span><span class="mono">${compose.time}</span></div>`;
      // tasks at the same time sit side by side
      const evs = d.items.filter(i => i.time).sort((a, b) => toMin(a.time ?? '') - toMin(b.time ?? ''));
      const lane: number[] = [], ends: number[] = [];
      evs.forEach((e, i) => { const m = toMin(e.time ?? ''); let k = ends.findIndex(x => x <= m); if (k < 0) k = ends.length; ends[k] = m + 60; lane[i] = k; });
      const lanes = Math.max(1, ends.length);
      evs.forEach((e, i) => {
        h += itemTag(d, e, 'hv-ev', `<span class="tt">${esc(e.title)}</span><span class="tm mono">${e.time}</span>`,
          `;top:${top(toMin(e.time ?? '')) + 2}px;left:calc(${lane[i]} * 100% / ${lanes} + 4px);width:calc(100% / ${lanes} - 8px)`);
      });
      if (d.rel === 'today') {
        const m = minutesOf(st.clock());
        if (m >= h0 * 60 && m <= h1 * 60) h += `<div class="hv-now" style="top:${top(m)}px" aria-hidden="true"><span class="mono">${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}</span></div>`;
      }
      h += '</div>';
    });
    return h + '</div></div></div>';
  }

  // ---------- Days
  /** A list's stops as tiny circles on a line. */
  function mini(items: DayItem[], l: Line): string {
    const g = 12, w = (items.length - 1) * g + 10;
    let s = `<svg width="${w}" height="10" aria-hidden="true">`;
    items.forEach((it, j) => {
      const x = j * g + 5;
      if (j) s += `<line x1="${x - g}" y1="5" x2="${x}" y2="5" stroke="${it.state === 'later' ? '#C5CBD3' : l.color}" stroke-width="2"${it.state === 'done' ? '' : ' stroke-dasharray="2 2"'}/>`;
      s += it.state === 'done' ? `<circle cx="${x}" cy="5" r="4" fill="${l.color}"/>` : `<circle cx="${x}" cy="5" r="3.4" fill="#fff" stroke="${it.state === 'ready' ? l.color : '#C5CBD3'}" stroke-width="1.6"/>`;
    });
    return s + '</svg>';
  }
  /** One list's stops for a day: rows plus the track behind them (branches curve off the task they hang off). */
  function column(d: Day, l: Line): string {
    const its = d.items.filter(i => i.line === l.id), at = new Map(its.map((it, i) => [it.id, i]));
    const depth = (it: DayItem): number => { let n = 0, f = it.from; while (f && at.has(f) && n < 12) { n++; f = its[at.get(f) ?? 0].from; } return n; };
    const ds = its.map(depth), x = (k: number): number => 10 + k * IND, y = (i: number): number => i * RH + RH / 2;
    let svg = '';
    its.forEach((it, i) => {
      let j = -1;
      for (let k = i - 1; k >= 0; k--) if (its[k].from === it.from) { j = k; break; }
      const p = it.from ? at.get(it.from) : undefined;
      const stroke = it.state === 'later' ? '#C5CBD3' : l.color, dash = it.state === 'done' ? '' : ' stroke-dasharray="4 4"';
      let path = '';
      if (j >= 0) path = `M${x(ds[i])} ${y(j)}V${y(i)}`;
      else if (p != null) path = `M${x(ds[p])} ${y(p)}V${y(i) - 8}Q${x(ds[p])} ${y(i)} ${x(ds[p]) + 8} ${y(i)}H${x(ds[i])}`;
      if (path) svg += `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"${dash}/>`;
    });
    const rows = its.map((it, i) => itemTag(d, it, 'dv-stop', `<span class="tt">${esc(it.title)}</span>${it.time ? `<span class="tm mono">${it.time}</span>` : ''}`, `;padding-left:${ds[i] * IND}px`)).join('');
    return `<div class="dv-col" style="${vars(l)}"><h3><span class="ldot" style="background:${l.color}"></span>${esc(l.name)}<span class="mono">${doneCount(its)}</span></h3>
      <div class="dv-stops"><svg class="dv-track" width="100%" height="${its.length * RH}" aria-hidden="true">${svg}</svg>${rows}</div></div>`;
  }
  const isOpen = (day: string): boolean => wk.open.has(day) !== (day === st.today);   // today starts open
  function days(list: Day[]): string {
    return `<div class="dv" data-scroll>${list.map(d => {
      const ids = [...new Set(d.items.map(i => i.line))], ls = ids.map(lineOf).filter((l): l is Line => !!l), open = isOpen(d.day);
      const n = d.items.filter(i => i.state === 'done').length;
      const note = d.rel === 'past' ? (n ? `${n} done` : 'Nothing logged')
        : d.rel === 'today' ? `<span class="mono">${n}/${d.items.length}</span> · ${d.items.filter(i => i.state === 'ready').length} ready now`
        : d.items.length ? `<span class="mono">${d.items.length}</span> planned` : 'Nothing planned';
      return `<section class="dv-day ${d.rel}${open ? ' open' : ''}"><div class="dv-head">
        <button type="button" class="dv-sum" data-day="${d.day}" aria-expanded="${open}">
          <span class="dv-date"><b class="mono">${parseYmd(d.day).getDate()}</b><span>${dayName(d)}</span></span>
          <span class="dv-lines">${ls.map(l => `<span class="dv-ml">${mini(d.items.filter(i => i.line === l.id), l)}${esc(l.name)}</span>`).join('')}</span>
          <span class="dv-note">${note}</span><span class="dv-chev">${icon('chevUp', 16)}</span></button>
        ${d.rel === 'past' ? '' : `<button type="button" class="dv-add" data-add-day="${d.day}" aria-label="Add a task on ${shortDate(d.day)}" title="Add a task">${icon('plus', 16)}</button>`}</div>
        <div class="dv-body"><div class="dv-in">${ls.length ? `<div class="dv-grid">${ls.map(l => column(d, l)).join('')}</div>` : `<p class="dv-empty">${d.rel === 'past' ? 'Nothing was logged on this day.' : 'Nothing planned yet. Use + to add something.'}</p>`}</div></div>
      </section>`; }).join('')}</div>`;
  }

  // ---------- render + events
  function render(): void {
    if (wk.mode === 'map' || !st.today) return;
    const list: Day[] = weekDays(st.today, wk.range).map(day => ({ day, items: dayItems(st.plan, day, st.today), rel: day < st.today ? 'past' : day === st.today ? 'today' : 'later' }));
    const old = root.querySelector<HTMLElement>('[data-scroll]'), keep = old ? [old.scrollLeft, old.scrollTop] : null;
    const focusSel = (() => { const a = document.activeElement; if (!(a instanceof HTMLElement) || !root.contains(a)) return null;
      for (const k of ['tick', 'open', 'day', 'range']) if (a.dataset[k]) return `[data-${k}="${a.dataset[k]}"]`; return a.dataset.tray != null ? '[data-tray]' : null; })();
    root.innerHTML = head(list.map(d => d.day)) + (wk.mode === 'hours' ? hours(list) : days(list));
    const sc = root.querySelector<HTMLElement>('[data-scroll]');
    if (sc && scrollTo === 'now') {
      scrollTo = null;
      const now = sc.querySelector<HTMLElement>('.hv-now'), col = sc.querySelector<HTMLElement>('.hv-dh.today');
      if (now) sc.scrollTop = Math.max(0, now.offsetTop - 2 * HH);
      if (col) sc.scrollLeft = Math.max(0, col.offsetLeft - 52);
    } else if (sc && keep) { sc.scrollLeft = keep[0]; sc.scrollTop = keep[1]; }
    if (focusSel) root.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
    if (compose || editing) place();
  }

  // ---------- adding and editing: a small popover next to the slot or the task, like a calendar's
  // Adding takes plain words (the slot gives the day and time); editing has a field for each thing.
  let editing: { id: string; day: string; line: string } | null = null;
  const box = document.createElement('div');
  box.className = 'wk-new'; box.hidden = true;
  box.setAttribute('role', 'dialog');
  document.body.appendChild(box);
  const field = <T extends HTMLElement>(sel: string): T | null => box.querySelector<T>(sel);
  const listsHtml = (line: string): string => allLines(st.plan).map(l => `<button type="button" role="radio" data-line="${l.id}" aria-checked="${l.id === line}" style="--c:${l.color};--tint:${l.tint};--tx:${l.text}"><span class="ldot" style="background:${l.color}"></span>${esc(l.name)}</button>`).join('');
  const isOpenPop = (): boolean => !box.hidden && !!(compose || editing);

  /** Adding: what the words plus the slot add up to, for the header line and the list picker. */
  function preview(): void {
    const input = field<HTMLInputElement>('.wn-input'), whenEl = field('.wn-when'), listsEl = field('.wn-lists'), addBtn = field<HTMLButtonElement>('.wn-add');
    if (!compose || !input || !whenEl || !listsEl || !addBtn) return;
    const p = parse(input.value.trim(), parseContext(st.plan, st.today));
    const { date, time } = slotSchedule(p, compose, st.today);
    const line = p.lineGuess && compose.line ? compose.line : p.line;
    const day = p.someday ? 'Someday' : p.repeat ? repeatShort(p.repeat) : `${niceDate(date ?? st.today, st.today)}${date && niceDate(date, st.today).length < 4 ? ' ' + parseYmd(date).getDate() : ''}`;
    whenEl.innerHTML = `${icon(p.repeat ? 'repeat' : 'calendar', 14)}<span>${esc(day)}</span>${time ? `<span class="mono">${time}</span>` : '<span class="any">Anytime</span>'}`;
    listsEl.innerHTML = listsHtml(line);
    addBtn.disabled = !p.title;
  }
  function place(): void {
    if (!isOpenPop()) return;
    const a = editing ? root.querySelector(`[data-item="${editing.id}@${editing.day}"]`)
      : compose ? root.querySelector('.hv-ghost') ?? root.querySelector(`[data-add-day="${compose.day}"]`) : null;
    const r = (a ?? root).getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight, w = box.offsetWidth, h = box.offsetHeight;
    let left: number, top: number;
    if (W < 760) { left = 8; top = r.bottom + 6; if (top + h > H - 8) top = Math.max(8, r.top - h - 6); }
    else {
      left = r.right + 8; if (left + w > W - 8) left = r.left - w - 8;
      left = Math.max(8, left); top = Math.min(Math.max(8, r.top - 8), H - h - 8);
    }
    box.style.left = left + 'px'; box.style.top = Math.max(8, top) + 'px';
  }
  function openCompose(slot: Slot): void {
    closePop();
    compose = { ...slot, line: null };
    if (wk.mode === 'days') { if (slot.day === st.today) wk.open.delete(slot.day); else wk.open.add(slot.day); }
    render();
    box.className = 'wk-new'; box.setAttribute('aria-label', 'New task');
    box.innerHTML = `<div class="wn-when"></div>
      <input class="wn-input" type="text" autocomplete="off" spellcheck="false" enterkeyhint="done" placeholder="New task" aria-label="New task">
      <div class="wn-lists" role="radiogroup" aria-label="List"></div>
      <div class="wn-foot"><span class="hint">Type it like <code>call mum 3pm #home</code></span><button class="wn-add" type="button" data-act="add">Add</button></div>`;
    preview();
    box.hidden = false; place();
    field<HTMLInputElement>('.wn-input')?.focus({ preventScroll: true });
  }

  /** Editing: the repeat choices, keeping a task's own "every N days" or weekly days on offer. */
  function repeatOptions(r: Repeat | null): string {
    const days = r?.type === 'weekly' ? r.days : null, n = r?.type === 'every' ? r.n : 2;
    const opts: [string, string][] = [['none', "Doesn't repeat"], ['daily', 'Every day'], ['weekdays', 'Weekdays'],
      ['weekly', days?.length ? `Every week on ${days.map(d => DOW[d]).join(', ')}` : 'Every week on this day'], ['every', `Every ${n} days`]];
    const cur = r ? r.type : 'none';
    return opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
  }
  function openEdit(id: string, day: string): void {
    const t = taskById(st.plan.tasks, id); if (!t) return;
    closePop();
    editing = { id, day, line: t.line };
    box.className = 'wk-new edit'; box.setAttribute('aria-label', `Edit ${t.title}`);
    const date = t.repeat ? '' : t.date && t.date > st.today ? t.date : st.today;
    box.innerHTML = `<input class="wn-input" type="text" data-f="title" autocomplete="off" spellcheck="false" aria-label="Name">
      <div class="wn-row">
        <label class="wn-f"><span>Day</span><input type="date" data-f="date" min="${st.today}" value="${date}"${t.repeat && t.repeat.type !== 'weekly' ? ' disabled' : ''}></label>
        <label class="wn-f"><span>Time</span><span class="wn-time"><input type="time" data-f="time" step="300" value="${t.time ?? ''}"><button type="button" data-act="anytime" title="No set time">Anytime</button></span></label>
      </div>
      <label class="wn-f"><span>Repeats</span><select data-f="repeat">${repeatOptions(t.repeat)}</select></label>
      <div class="wn-lists" role="radiogroup" aria-label="List">${listsHtml(t.line)}</div>
      <div class="wn-foot"><button type="button" class="wn-del" data-act="delete">Delete</button><button class="wn-add" type="button" data-act="save">Save</button></div>`;
    const title = field<HTMLInputElement>('[data-f="title"]'); if (title) title.value = t.title;
    syncTime();
    box.hidden = false; place();
    title?.focus({ preventScroll: true }); title?.select();
  }
  function syncTime(): void {
    const time = field<HTMLInputElement>('[data-f="time"]'), any = field('[data-act="anytime"]');
    any?.classList.toggle('on', !time?.value);
  }
  function save(): void {
    if (!editing) return;
    const t = taskById(st.plan.tasks, editing.id); if (!t) { closePop(); return; }
    const val = (f: string): string => field<HTMLInputElement | HTMLSelectElement>(`[data-f="${f}"]`)?.value ?? '';
    const date = val('date') || null, kind = val('repeat');
    const dow = parseYmd(date ?? st.today).getDay();
    const repeat: Repeat | null = kind === 'daily' ? { type: 'daily' } : kind === 'weekdays' ? { type: 'weekdays' }
      : kind === 'weekly' ? { type: 'weekly', days: t.repeat?.type === 'weekly' && (!date || t.repeat.days.includes(dow)) ? t.repeat.days : [dow] }
      : kind === 'every' ? { type: 'every', n: t.repeat?.type === 'every' ? t.repeat.n : 2 } : null;
    const id = editing.id, e = { title: val('title'), line: editing.line, time: val('time') || null, date, repeat };
    closePop();
    app.edit(id, e);
  }
  function closePop(opts: { focus?: boolean } = {}): void {
    if (!compose && !editing) return;
    const back = editing ? `[data-item="${editing.id}@${editing.day}"] [data-open]` : compose ? `[data-add-day="${compose.day}"]` : '';
    compose = null; editing = null; box.hidden = true;
    root.querySelectorAll('.hv-ghost').forEach(g => g.remove());   // not a re-render: a click may be landing on the grid
    if (opts.focus && back) root.querySelector<HTMLElement>(back)?.focus({ preventScroll: true });
  }
  function submit(): void {
    if (!compose) return;
    const text = field<HTMLInputElement>('.wn-input')?.value.trim() ?? '';
    const t = app.addAt(text, { day: compose.day, time: compose.time }, compose.line);
    if (!t) { field<HTMLInputElement>('.wn-input')?.focus(); return; }
    closePop(); render();
  }
  box.addEventListener('input', e => { if (compose && closestEl(e.target, '.wn-input')) preview(); if (closestEl(e.target, '[data-f="time"]')) syncTime(); });
  box.addEventListener('change', e => {
    const sel = closestEl(e.target, '[data-f="repeat"]');
    if (sel instanceof HTMLSelectElement) { const d = field<HTMLInputElement>('[data-f="date"]'); if (d) { d.disabled = sel.value !== 'none' && sel.value !== 'weekly'; if (!d.disabled && !d.value) d.value = st.today; } }
  });
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop({ focus: true }); return; }
    if (e.key === 'Enter' && closestEl(e.target, 'input')) { e.preventDefault(); if (editing) save(); else submit(); }
  });
  box.addEventListener('click', e => {
    const l = closestEl(e.target, '[data-line]');
    if (l?.dataset.line) {
      if (compose) { compose.line = l.dataset.line; preview(); field<HTMLInputElement>('.wn-input')?.focus(); }
      if (editing) { editing.line = l.dataset.line; box.querySelectorAll('[data-line]').forEach(b => b.setAttribute('aria-checked', String(b === l))); }
      return;
    }
    const act = closestEl(e.target, '[data-act]')?.dataset.act;
    if (act === 'add') submit();
    if (act === 'save') save();
    if (act === 'anytime') { const time = field<HTMLInputElement>('[data-f="time"]'); if (time) time.value = ''; syncTime(); }
    if (act === 'delete' && editing) { const id = editing.id; closePop(); app.move(id, 'delete'); }
  });
  document.addEventListener('pointerdown', e => { if ((compose || editing) && !box.contains(e.target instanceof Node ? e.target : null)) closePop(); }, true);
  root.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);

  /** An empty spot in a day's column: the half hour under the pointer. */
  function slotAt(col: HTMLElement, clientY: number): Slot | null {
    const day = col.dataset.colDay, h0 = Number(col.closest<HTMLElement>('[data-h0]')?.dataset.h0 ?? 0);
    if (!day) return null;
    const m = Math.min(23 * 60 + 30, h0 * 60 + Math.max(0, Math.floor((clientY - col.getBoundingClientRect().top) / (HH / 2))) * 30);
    return { day, time: `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}` };
  }

  function setMode(m: Mode, opts: { focus?: boolean } = {}): void {
    const was = wk.mode;
    wk.mode = m; document.body.dataset.mode = m; root.hidden = m === 'map';
    modeBtns.forEach(b => { const on = asMode(b.dataset.mode) === m; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && opts.focus) b.focus(); });
    saveView({ mode: m, range: wk.range });
    if (m !== was) scrollTo = 'now';
    render();
    if (m === 'map' && was !== 'map') app.initialView();
  }
  modeBtns.forEach((b, i) => {
    b.addEventListener('click', () => setMode(asMode(b.dataset.mode)));
    b.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
      e.preventDefault(); setMode(asMode(modeBtns[(i + d + modeBtns.length) % modeBtns.length].dataset.mode), { focus: true });
    });
  });

  // ticking runs the checkbox's fill first, like the panel, then the map (and every view) follows
  let ticking = false;
  root.addEventListener('click', e => {
    const tk = closestEl(e.target, '[data-tick]');
    if (tk?.dataset.tick) {
      const id = tk.dataset.tick, item = tk.closest('[data-item]');
      if (item?.classList.contains('done')) { app.move(id, 'undone'); return; }
      if (ticking) return;
      if (st.reducedMotion) { app.activate(id); return; }
      ticking = true; item?.classList.add('ticking');
      setTimeout(() => { ticking = false; app.activate(id); render(); }, 320);
      return;
    }
    const op = closestEl(e.target, '[data-open]'); if (op?.dataset.open && op.dataset.on) { openEdit(op.dataset.open, op.dataset.on); return; }
    if (closestEl(e.target, '[data-tray]')) { wk.tray = !wk.tray; render(); return; }
    const dy = closestEl(e.target, '[data-day]');
    if (dy?.dataset.day) { const d = dy.dataset.day; if (wk.open.has(d)) wk.open.delete(d); else wk.open.add(d); render(); return; }
    const rg = closestEl(e.target, '[data-range]');
    if (rg) { wk.range = rg.dataset.range === 'week' ? 'week' : 'next'; saveView({ mode: wk.mode, range: wk.range }); scrollTo = 'now'; render(); return; }
    const ad = closestEl(e.target, '[data-add-day]'); if (ad?.dataset.addDay) { openCompose({ day: ad.dataset.addDay, time: null }); return; }
    const col = closestEl(e.target, '[data-col-day]'); if (col) { const s = slotAt(col, e.clientY); if (s) openCompose(s); return; }
    const tc = closestEl(e.target, '[data-tray-day]'); if (tc?.dataset.trayDay) openCompose({ day: tc.dataset.trayDay, time: null });
  });
  root.addEventListener('keydown', e => {
    const rg = closestEl(e.target, '[data-range]');
    if (rg && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); wk.range = wk.range === 'next' ? 'week' : 'next'; saveView({ mode: wk.mode, range: wk.range }); render();
      root.querySelector<HTMLElement>(`[data-range="${wk.range}"]`)?.focus(); }
  });
  root.addEventListener('contextmenu', e => {
    const tk = closestEl(e.target, '[data-tick]'); if (!tk?.dataset.tick) return;
    e.preventDefault(); app.openMenu(tk.dataset.tick);
  });

  return { render, setMode };
}
