// The week views beside the panel: Hours (a time grid, untimed tasks in an Anytime tray) and Days (a row per day,
// each folding to a strip of tiny lines). Today's tasks can be ticked here; later ones open in the plan.
import type { App } from '../app/context';
import type { Mode, Store } from '../app/store';
import { lineById } from '../domain/lines';
import { DOW, minutesOf, parseYmd, toMin } from '../domain/time';
import type { Line } from '../domain/types';
import { type DayItem, dayItems, weekDays } from '../domain/week';
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

  const lineOf = (id: string): Line | null => lineById(st.plan, id);
  const vars = (l: Line): string => `--c:${l.color};--tx:${l.text};--tint:${l.tint}`;
  const mark = (s: DayItem['state']): string => `<span class="wm ${s}" aria-hidden="true">${s === 'done' ? TICK : ''}</span>`;
  /** Today's tasks tick (or, once done, open their actions); later ones open in the plan; earlier ones are a record. */
  function itemTag(d: Day, it: DayItem, cls: string, inner: string, style = ''): string {
    const l = lineOf(it.line); if (!l) return '';
    const label = `${esc(it.title)}, ${esc(l.name)}${it.time ? ', ' + it.time : ''}, ${STATE_WORD[it.state]}`;
    const s = `style="${vars(l)}${style}"`;
    if (d.rel === 'today') return `<button type="button" class="${cls} ${it.state}" data-tick="${it.id}" ${s} aria-label="${label}. ${it.state === 'done' ? 'Open task actions' : 'Tick off'}.">${inner}</button>`;
    if (d.rel === 'later' || it.live) return `<button type="button" class="${cls} ${it.state}" data-edit="${it.id}" ${s} aria-label="${label}. Edit in plan.">${inner}</button>`;
    return `<div class="${cls} ${it.state}" ${s} aria-label="${label}">${inner}</div>`;
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
    return `<header class="wk-head"><h2 class="wk-title">${rangeLabel(days)}</h2>
      <div class="wk-seg" role="radiogroup" aria-label="Days shown">${opt('next', 'Next 7 days')}${opt('week', 'This week')}</div></header>`;
  }

  // ---------- Hours
  function hours(days: Day[]): string {
    const timed = days.flatMap(d => d.items.filter(i => i.time).map(i => toMin(i.time ?? '')));
    const h0 = Math.min(7, ...timed.map(m => Math.floor(m / 60))), h1 = Math.max(22, ...timed.map(m => Math.floor(m / 60) + 1));
    const top = (m: number): number => (m - h0 * 60) / 60 * HH;
    const lines = (d: Day) => [...new Set(d.items.filter(i => !i.time).map(i => i.line))];
    let h = `<div class="hv${wk.tray ? ' tray-open' : ''}" style="--hh:${HH}px;--rows:${h1 - h0}"><div class="hv-scroll" data-scroll><div class="hv-grid">`;
    // day heads
    h += '<div class="hv-corner"></div>' + days.map(d => { const p = parseYmd(d.day);
      return `<div class="hv-dh ${d.rel}"><span>${dayName(d)}</span><b class="mono">${p.getDate()}</b></div>`; }).join('');
    // Anytime tray: one chip per list, opening to its tasks
    h += `<div class="hv-tl"><button type="button" data-tray aria-expanded="${wk.tray}">Anytime ${icon('chevUp', 14)}</button></div>`;
    days.forEach(d => {
      h += `<div class="hv-tc ${d.rel}">`;
      lines(d).forEach(id => {
        const l = lineOf(id); if (!l) return;
        const its = d.items.filter(i => !i.time && i.line === id), n = its.filter(i => i.state === 'done').length;
        const tone = n === its.length ? 'done' : its.some(i => i.state === 'ready') ? 'ready' : 'later';
        h += `<button type="button" class="hv-chip ${tone}" data-tray style="${vars(l)}" aria-expanded="${wk.tray}"><span class="ldot" style="background:${l.color}"></span><span class="nm">${esc(l.name)}</span><span class="mono">${n}/${its.length}</span></button>`;
        h += `<div class="hv-list">${its.map(it => itemTag(d, it, 'hv-li', `${mark(it.state)}<span class="tt">${esc(it.title)}</span>`)).join('')}</div>`;
      });
      if (!d.items.some(i => !i.time)) h += `<span class="hv-none">${d.rel === 'past' ? 'Nothing logged' : 'Nothing'}</span>`;
      h += '</div>';
    });
    // the grid
    h += '<div class="hv-gut">';
    for (let hr = h0 + 1; hr < h1; hr++) h += `<span class="mono" style="top:${(hr - h0) * HH}px">${String(hr).padStart(2, '0')}:00</span>`;
    h += '</div>';
    days.forEach(d => {
      h += `<div class="hv-col ${d.rel}">`;
      // tasks at the same time sit side by side
      const evs = d.items.filter(i => i.time).sort((a, b) => toMin(a.time ?? '') - toMin(b.time ?? ''));
      const lane: number[] = [], ends: number[] = [];
      evs.forEach((e, i) => { const m = toMin(e.time ?? ''); let k = ends.findIndex(x => x <= m); if (k < 0) k = ends.length; ends[k] = m + 60; lane[i] = k; });
      const lanes = Math.max(1, ends.length);
      evs.forEach((e, i) => {
        h += itemTag(d, e, 'hv-ev', `${mark(e.state)}<span class="tt">${esc(e.title)}</span><span class="tm mono">${e.time}</span>`,
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
    const rows = its.map((it, i) => itemTag(d, it, 'dv-stop', `${mark(it.state)}<span class="tt">${esc(it.title)}</span>${it.time ? `<span class="tm mono">${it.time}</span>` : ''}`, `;padding-left:${ds[i] * IND + 3}px`)).join('');
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
      return `<section class="dv-day ${d.rel}${open ? ' open' : ''}">
        <button type="button" class="dv-sum" data-day="${d.day}" aria-expanded="${open}">
          <span class="dv-date"><b class="mono">${parseYmd(d.day).getDate()}</b><span>${dayName(d)}</span></span>
          <span class="dv-lines">${ls.map(l => `<span class="dv-ml">${mini(d.items.filter(i => i.line === l.id), l)}${esc(l.name)}</span>`).join('')}</span>
          <span class="dv-note">${note}</span><span class="dv-chev">${icon('chevUp', 16)}</span></button>
        <div class="dv-body"><div class="dv-in">${ls.length ? `<div class="dv-grid">${ls.map(l => column(d, l)).join('')}</div>` : `<p class="dv-empty">${d.rel === 'past' ? 'Nothing was logged on this day.' : 'Nothing planned. Add a task with a day, like “call mum friday”.'}</p>`}</div></div>
      </section>`; }).join('')}</div>`;
  }

  // ---------- render + events
  function render(): void {
    if (wk.mode === 'map' || !st.today) return;
    const list: Day[] = weekDays(st.today, wk.range).map(day => ({ day, items: dayItems(st.plan, day, st.today), rel: day < st.today ? 'past' : day === st.today ? 'today' : 'later' }));
    const old = root.querySelector<HTMLElement>('[data-scroll]'), keep = old ? [old.scrollLeft, old.scrollTop] : null;
    const focusSel = (() => { const a = document.activeElement; if (!(a instanceof HTMLElement) || !root.contains(a)) return null;
      for (const k of ['tick', 'edit', 'day', 'range']) if (a.dataset[k]) return `[data-${k}="${a.dataset[k]}"]`; return a.dataset.tray != null ? '[data-tray]' : null; })();
    root.innerHTML = head(list.map(d => d.day)) + (wk.mode === 'hours' ? hours(list) : days(list));
    const sc = root.querySelector<HTMLElement>('[data-scroll]');
    if (sc && scrollTo === 'now') {
      scrollTo = null;
      const now = sc.querySelector<HTMLElement>('.hv-now'), col = sc.querySelector<HTMLElement>('.hv-dh.today');
      if (now) sc.scrollTop = Math.max(0, now.offsetTop - 2 * HH);
      if (col) sc.scrollLeft = Math.max(0, col.offsetLeft - 52);
    } else if (sc && keep) { sc.scrollLeft = keep[0]; sc.scrollTop = keep[1]; }
    if (focusSel) root.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
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
      const id = tk.dataset.tick;
      if (tk.classList.contains('done')) { app.openMenu(id); return; }
      if (ticking) return;
      if (st.reducedMotion) { app.activate(id); return; }
      ticking = true; tk.classList.add('ticking');
      setTimeout(() => { ticking = false; app.activate(id); render(); }, 320);
      return;
    }
    const ed = closestEl(e.target, '[data-edit]'); if (ed?.dataset.edit) { app.openTimetable(ed.dataset.edit); return; }
    if (closestEl(e.target, '[data-tray]')) { wk.tray = !wk.tray; render(); return; }
    const dy = closestEl(e.target, '[data-day]');
    if (dy?.dataset.day) { const d = dy.dataset.day; if (wk.open.has(d)) wk.open.delete(d); else wk.open.add(d); render(); return; }
    const rg = closestEl(e.target, '[data-range]');
    if (rg) { wk.range = rg.dataset.range === 'week' ? 'week' : 'next'; saveView({ mode: wk.mode, range: wk.range }); scrollTo = 'now'; render(); }
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
