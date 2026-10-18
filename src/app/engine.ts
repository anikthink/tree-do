// @ts-nocheck
// Tree-do engine: the map (layout, drawing, trains, camera), the day rules, the plain-words parser
// and the Calm panel, carried over unchanged from the prototype. Phase 1 keeps it as one module so the
// app behaves exactly like the prototype; later phases split it (domain/, map/, ui/) and type it.
import { loadState, saveState } from '../storage/local';

let started = false;

export function startTreeDo(): void {
  if (started) return;            // React StrictMode mounts twice in dev; the engine owns global listeners
  started = true;
  'use strict';

  // ================================================================ time
  // Debug: ?now=2026-10-19T07:40 pins the clock (it keeps ticking from there).
  const qs = new URLSearchParams(location.search);
  const clockOffset = (() => { const v = qs.get('now'); const d = v ? new Date(v) : null; return d && !isNaN(d) ? d - Date.now() : 0; })();
  const NOW = () => new Date(Date.now() + clockOffset);
  const pad2 = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOW_LONG = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diffDays(a, b) { return Math.round((parseYmd(a) - parseYmd(b)) / 864e5); }
  // The service day starts at S.dayStart (default 04:00), so 01:30 still counts as "yesterday".
  function serviceDay(d = NOW()) { const x = new Date(d.getTime() - S.dayStart * 3600e3); return ymd(x); }
  function minutesNow() { const d = NOW(); return d.getHours() * 60 + d.getMinutes(); }
  function toMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
  function nice(dateStr) {
    const today = serviceDay(); const dd = diffDays(dateStr, today);
    if (dd === 0) return 'Today'; if (dd === 1) return 'Tomorrow'; if (dd === -1) return 'Yesterday';
    const d = parseYmd(dateStr);
    return dd > 1 && dd < 7 ? DOW[d.getDay()] : `${DOW[d.getDay()]} ${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
  }

  // ================================================================ icons (small line icons, 24 grid)
  const ICON_P = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    undo: '<path d="M4 4v5h5"/><path d="M4.6 9A8 8 0 1 1 4 13"/>',
    later: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 20h14"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    archive: '<rect x="3.5" y="4.5" width="17" height="5" rx="1.5"/><path d="M5.5 9.5V18a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9.5"/><path d="M10 13.5h4"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    branch: '<circle cx="7" cy="5.5" r="2"/><circle cx="7" cy="18.5" r="2"/><circle cx="17" cy="8" r="2"/><path d="M7 7.5v9"/><path d="M17 10c0 4-4 4.5-8.6 7.2"/>',
    list: '<path d="M9 7h11M9 12h11M9 17h11"/><path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke-width="2.4"/>',
    trash: '<path d="M4 7h16"/><path d="M10 7V4.5h4V7"/><path d="M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    up: '<path d="M12 19V5M6.5 10.5L12 5l5.5 5.5"/>',
    down: '<path d="M12 5v14M6.5 13.5L12 19l5.5-5.5"/>',
    more: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="2.8"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    repeat: '<path d="M17 3l3 3-3 3"/><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4"/>',
    chevUp: '<path d="M6.5 14.5L12 9l5.5 5.5"/>',
    corner: '<path d="M7 4v7a3 3 0 0 0 3 3h9"/><path d="M15.5 10.5L19 14l-3.5 3.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  };
  const icon = (n, sz = 18) => `<svg class="i" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_P[n]}</svg>`;
  const TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.6 8.3l2.9 2.9 5.9-6.2"/></svg>';

  // ================================================================ data
  // Calm: one quiet slate maintenance line, four clear focus colours (amber-free).
  // text = a darker shade for words in the line's colour (>= 4.5:1 on white and on its tint); tint = 10% of the colour on white.
  const PALETTE = [
    { color: '#2F7CF6', ink: '#fff', text: '#1F62D0', tint: '#EAF2FF' },   // blue
    { color: '#14A38B', ink: '#fff', text: '#0B7563', tint: '#E8F6F3' },   // teal
    { color: '#F2645A', ink: '#fff', text: '#C13D33', tint: '#FDF0EF' },   // coral
    { color: '#8B6CF0', ink: '#fff', text: '#6446C8', tint: '#F3EDFE' },   // violet
    { color: '#C2569E', ink: '#fff', text: '#9C3577', tint: '#F9EEF5' },   // plum
  ];
  const UPKEEP = { id: 'up', code: 'UP', name: 'Upkeep', color: '#5B6B7F', ink: '#fff', text: '#4A5868', tint: '#EFF0F2', upkeep: true };
  const MAX_FOCUS = 4;
  const IC = { code: 'IC', name: 'Today', color: '#1C2430', ink: '#fff', text: '#1C2430', tint: '#F4F6F9' };

  function seed() {
    const today = serviceDay(), tomorrow = addDays(today, 1), dow = parseYmd(today).getDay();
    let n = 0; const T = (line, title, extra = {}) => ({ id: 't' + (++n), line, title, order: n, from: null, fork: 0, repeat: null, time: null, date: null, someday: false, doneOn: null, lastDone: null, skip: null, ...extra });
    const fix = tasks => { const pk = tasks.find(t => t.title === 'Pack the kitchen'); tasks.forEach(t => { if (t.from === 'PK') t.from = pk.id; }); return tasks; };
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

  let S = loadState();
  if (!S) { S = { dayStart: 4 }; S = seed(); }
  function save() { saveState(S); }

  function lineById(id) {
    if (id === 'up') return UPKEEP;
    const l = S.lines.find(x => x.id === id); if (!l) return null;
    const p = PALETTE[l.pal % PALETTE.length];
    return { ...l, color: p.color, ink: p.ink, text: p.text, tint: p.tint };
  }
  function allLines() { return [UPKEEP, ...S.lines.map(l => lineById(l.id))]; }   // the day starts on Upkeep
  function taskById(id) { return S.tasks.find(t => t.id === id); }

  // ---- what runs today
  function isDueToday(t, today) {
    if (t.someday) return false;
    if (t.skip === today) return false;
    if (!t.repeat) {
      if (t.doneOn && t.doneOn !== today) return false;     // finished on an earlier day: gone
      if (t.date && t.date > today) return false;           // planned for later: not yet
      return true;                                          // unfinished one-offs simply carry over
    }
    if (t.doneOn === today) return true;
    const dow = parseYmd(today).getDay();
    switch (t.repeat.type) {
      case 'daily': return true;
      case 'weekdays': return dow >= 1 && dow <= 5;
      case 'weekly': return (t.repeat.days || []).includes(dow);
      case 'every': return !t.lastDone || diffDays(today, t.lastDone) >= (t.repeat.n || 1);
    }
    return true;
  }
  const isDone = (t, today) => t.doneOn === today || (!t.repeat && !!t.doneOn);
  // a stop still matters if anything branching off it is unfinished
  function hasPending(t, seen = new Set()) {
    if (seen.has(t.id)) return false; seen.add(t.id);
    return S.tasks.some(c => c.from === t.id && !c.someday && ((c.repeat || !c.doneOn) || hasPending(c, seen)));
  }

  // ================================================================ geometry
  function roundPolyline(c, r) {
    const out = [c[0]];
    for (let i = 1; i < c.length - 1; i++) {
      const P = c[i], A = c[i - 1], Bp = c[i + 1];
      const l1 = Math.hypot(P[0] - A[0], P[1] - A[1]), l2 = Math.hypot(Bp[0] - P[0], Bp[1] - P[1]);
      if (l1 < 0.01 || l2 < 0.01) continue;
      const d1 = [(P[0] - A[0]) / l1, (P[1] - A[1]) / l1], d2 = [(Bp[0] - P[0]) / l2, (Bp[1] - P[1]) / l2];
      const theta = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
      if (theta < 0.01) { out.push(P); continue; }
      const t = Math.min(r * Math.tan(theta / 2), l1 / 2, l2 / 2);
      const a = [P[0] - d1[0] * t, P[1] - d1[1] * t], b = [P[0] + d2[0] * t, P[1] + d2[1] * t];
      out.push(a);
      for (let k = 1; k <= 8; k++) {
        const u = k / 8, iu = 1 - u;
        out.push([iu * iu * a[0] + 2 * iu * u * P[0] + u * u * b[0], iu * iu * a[1] + 2 * iu * u * P[1] + u * u * b[1]]);
      }
    }
    out.push(c[c.length - 1]);
    return out;
  }
  function mkEdge(corners, color, toKey) {
    const pts = corners.length > 2 ? roundPolyline(corners, 26) : corners;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, len: cum[cum.length - 1], color, to: toKey };
  }
  function pointAt(e, s) {
    s = Math.max(0, Math.min(e.len, s));
    let i = 1;
    while (i < e.pts.length - 1 && e.cum[i] < s) i++;
    const a = e.pts[i - 1], b = e.pts[i];
    const seg = (e.cum[i] - e.cum[i - 1]) || 1;
    const u = (s - e.cum[i - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  function subPts(e, s0, s1) {
    const out = [pointAt(e, s0)];
    for (let i = 0; i < e.pts.length; i++) if (e.cum[i] > s0 && e.cum[i] < s1) out.push(e.pts[i]);
    out.push(pointAt(e, s1));
    return out;
  }

  // ================================================================ today's network (rebuilt whenever the plan changes)
  // Stations: { key, t (task) | null for the interchange, line, x, y, side, idx }
  let NET = { stations: [], byKey: {}, edges: [], edgeTo: {}, termini: [], bounds: null, vertical: false };
  let TODAY = serviceDay();

  function build() {
    TODAY = serviceDay();
    const vertical = isVertical();
    const lines = allLines();
    const stations = [], edges = [], termini = [];
    let icSpan = null;
    const cols = [];
    const ic = { key: 'IC', t: null, line: IC, x: 0, y: 0, side: vertical ? 'r' : 'l', idx: -1, label: '00' };
    stations.push(ic);

    // What's on today's map: stops due today, plus finished one-offs that still have an unfinished branch hanging off them.
    const vis = new Set(S.tasks.filter(t => isDueToday(t, TODAY) || (!t.repeat && t.doneOn && !t.someday && t.doneOn < TODAY && hasPending(t))).map(t => t.id));
    // If a stop's branch point isn't on today's map, it joins the nearest one that is (or the line itself).
    const effFrom = t => { let f = t.from, guard = 0; while (f && !vis.has(f) && guard++ < 50) { const p = taskById(f); f = p ? p.from : null; } return f && taskById(f) && taskById(f).line === t.line ? f : null; };
    const seqKey = t => { const f = effFrom(t); return f ? `${f}|${f === t.from ? (t.fork || 0) : 0}` : 'trunk'; };
    const seqs = {};   // line → { key → [tasks] }
    lines.forEach(l => { seqs[l.id] = {}; });
    S.tasks.filter(t => vis.has(t.id) && seqs[t.line]).sort((a, b) => a.order - b.order).forEach(t => {
      const k = seqKey(t); (seqs[t.line][k] = seqs[t.line][k] || []).push(t);
    });
    const forksOf = (l, id) => Object.keys(seqs[l.id]).filter(k => k.startsWith(id + '|')).sort();

    // The day is one line: Upkeep leaves Today, and every focus line branches off it at the junction —
    // the last "starts the day" stop (Make the bed). No such stop today? They branch straight from Today.
    const up = lines[0], focus = lines.slice(1);
    let J = ic;
    const findJunction = () => {
      const trunk = stations.filter(st => st.t && st.line === up && st.idx >= 0 && !st.label.includes('/'));
      const anchors = trunk.filter(st => st.t.anchor);
      J = anchors.length ? anchors[anchors.length - 1] : ic;
    };

    if (!vertical) {
      // Desktop: Upkeep is the spine through the middle, running left → right from Today.
      // At the junction the focus lines peel off on parallel tracks — alternately above and below — and run right
      // on their own rows. A branch drops 45° to its own row just below its line.
      const ROW = 150, SUB = 100, COL = 186, X0 = 150;
      const heightOf = l => Object.keys(seqs[l.id]).filter(k => k !== 'trunk').length * SUB;   // one row per branch
      const doLine = (l, lineY, startX, firstCorners, fromSt) => {
        let sub = 0;
        const place = (list, sx, rowY, from, labelBase, isTrunk) => {
          let prev = from;
          list.forEach((t, j) => {
            const st = { key: t.id, t, line: l, x: sx + j * COL, y: rowY, side: 'a', idx: j,
              label: labelBase ? `${labelBase}/${j + 1}` : pad2(j + 1), old: !t.repeat && t.doneOn && t.doneOn < TODAY };
            stations.push(st);
            let corners;
            if (isTrunk && j === 0) corners = firstCorners(st.x, rowY);
            else if (prev.y !== rowY) corners = [[prev.x, prev.y], [prev.x + (rowY - prev.y), rowY], [st.x, rowY]];
            else corners = [[prev.x, prev.y], [st.x, rowY]];
            const e = mkEdge(corners, l.color, st.key);
            if (isTrunk && j === 0 && fromSt !== ic) e.under = true;   // shares the Upkeep track before peeling off
            edges.push(e);
            prev = st;
            forksOf(l, t.id).forEach(k => { sub++; place(seqs[l.id][k], st.x + COL, lineY + sub * SUB, st, st.label, false); });
          });
          const endX = list.length ? prev.x : sx - 60;
          termini.push({ line: l, x: endX, y: rowY, empty: !list.length, from: prev, vertical: false, branch: !isTrunk,
            stub: list.length ? [[prev.x, rowY], [prev.x + 30, rowY]] : firstCorners(endX + 30, rowY) });
        };
        place(seqs[l.id].trunk || [], startX, lineY, fromSt, '', true);
      };
      doLine(up, 0, X0, (x, ry) => [[0, 0], [x, ry]], ic);
      findJunction();
      // alternate: 1st focus line just above, 2nd just below, 3rd above that, 4th below that
      const above = focus.filter((_, i) => i % 2 === 0), below = focus.filter((_, i) => i % 2 === 1);
      let topEdge = 0;                       // top of the spine's block
      // Focus lines share the Upkeep track for a moment after the junction, then peel off.
      // The nearest line peels off last (furthest right), so no track ever crosses another.
      const peel = (k, n) => J.x + 58 + (n - 1 - k) * 13;
      above.forEach((l, k) => {
        const lineY = topEdge - ROW - heightOf(l), px = peel(k, above.length);
        doLine(l, lineY, J.x + COL, (x, ry) => [[J.x, J.y], [px, J.y], [px, ry], [x, ry]], J);
        topEdge = lineY;
      });
      let bottomEdge = heightOf(up);         // bottom of the spine's block (its own branches sit below it)
      below.forEach((l, k) => {
        const lineY = bottomEdge + ROW, px = peel(k, below.length);
        doLine(l, lineY, J.x + COL, (x, ry) => [[J.x, J.y], [px, J.y], [px, ry], [x, ry]], J);
        bottomEdge = lineY + heightOf(l);
      });
    } else {
      // Phone: every list is its own column, side by side, all running down — like a route chart.
      // Upkeep leaves Today in the left column. At the junction the focus lists cross over as a small bundle
      // (furthest column on top, so nothing crosses), then turn down into their own columns.
      // Labels sit to the right of each stop, inside its column. A branch steps 22px in with a short diagonal.
      const STEP = 84, BX = 22, BUN = 12;
      const n = focus.length;
      const gap = n ? 20 + n * BUN : 0;                  // room under the junction for the crossing bundle
      const trunkUp = seqs[up.id].trunk || [];
      let jIdx = -1; trunkUp.forEach((t, i) => { if (t.anchor) jIdx = i; });
      const doCol = (l, ci, firstCorners, y0, gapAt) => {
        const x0 = ci * COLW_V;
        let cur = y0;
        cols.push({ line: l, x: x0 });
        const place = (list, x, from, labelBase, isTrunk) => {
          let prev = from;
          list.forEach((t, j) => {
            const st = { key: t.id, t, line: l, x, y: cur, side: 'r', idx: j, colR: x0 + COLW_V - 8,
              label: labelBase ? `${labelBase}/${j + 1}` : pad2(j + 1), old: !t.repeat && t.doneOn && t.doneOn < TODAY };
            stations.push(st);
            let corners;
            if (isTrunk && j === 0) corners = firstCorners(st.y);
            else if (prev.x !== x) corners = [[prev.x, prev.y], [prev.x, prev.y + 30], [x, prev.y + 30 + (x - prev.x)], [x, st.y]];   // clear of the label above
            else corners = [[prev.x, prev.y], [x, st.y]];
            const e = mkEdge(corners, l.color, st.key);
            if (isTrunk && j === 0 && ci > 0) e.under = true;   // shares the bundle before turning into its column
            edges.push(e);
            prev = st;
            cur += STEP;
            if (isTrunk && j === gapAt) cur += gap;
            forksOf(l, t.id).forEach(k => { place(seqs[l.id][k], x + BX, st, st.label, false); });
          });
          if (!list.length) {
            termini.push({ line: l, x, y: cur, empty: true, from: prev, vertical: true, branch: !isTrunk, stub: [...firstCorners(cur), [x, cur + 20]] });
          } else {
            termini.push({ line: l, x, y: prev.y, empty: false, from: prev, vertical: true, branch: !isTrunk, stub: [[x, prev.y], [x, prev.y + 30]] });
          }
        };
        place(seqs[l.id].trunk || [], x0, ic, '', true);
      };
      doCol(up, 0, y0 => [[0, 0], [0, y0]], STEP, jIdx);
      findJunction();
      const firstY = (J === ic ? 0 : J.y) + STEP + gap;   // focus lists start level with the next Upkeep stop
      focus.forEach((l, i) => {
        const x = (i + 1) * COLW_V, d = 26 + (n - 1 - i) * BUN;
        doCol(l, i + 1, y0 => [[J.x, J.y], [J.x, J.y + 20], [J.x + d, J.y + 20 + d], [x - 20, J.y + 20 + d], [x, J.y + 40 + d], [x, y0]], firstY, -1);
      });
    }
    const byKey = {}; stations.forEach(s => { byKey[s.key] = s; });
    const edgeTo = {}; edges.forEach(e => { edgeTo[e.to] = e; });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    stations.forEach(s => grow(s.x, s.y));
    termini.forEach(tm => grow(tm.x + (tm.vertical ? 0 : (tm.branch ? 80 : 175)), tm.y + (tm.vertical ? 60 : 0)));
    if (icSpan) { grow(0, icSpan[0] - 20); grow(0, icSpan[1] + 20); }
    if (!vertical) { x0 -= 110; y0 -= 95; x1 += 20; y1 += 30; }
    else { x0 = -22; y0 -= 24; x1 = Math.max(...cols.map(c => c.x)) + COLW_V; y1 += 40; }
    NET = { stations, byKey, edges, edgeTo, termini, bounds: { x0, y0, x1, y1 }, vertical, icSpan, seqs, cols, junction: J === ic ? null : J.key };
  }
  const COLW_V = 150, HEAD_V = 34;   // phone: column width, sticky column-name row
  let safeT = 0;
  const headTop = () => Math.max(6, safeT + 4);
  const mapTopV = () => headTop() + HEAD_V + 6;
  function isVertical() { const w = window.innerWidth, h = window.innerHeight; return w < 760 || h > w * 1.15; }

  // ---- per-line station states. Order is a suggestion, not a lock:
  // a stop is "open" if it's the next one, or if anything further down the line is already done (express).
  function lineStates() {
    const res = {};
    // stations were placed depth-first, so a branch point always gets its state before its branch
    const bySeq = {};
    Object.entries(NET.seqs).forEach(([lid, seqs]) => Object.entries(seqs).forEach(([k, list]) => { bySeq[lid + '#' + k] = { root: k === 'trunk' ? null : k.split('|')[0], list }; }));
    const order = NET.stations.filter(s => s.t).map(s => s.key);
    const seqOf = {}; Object.entries(bySeq).forEach(([sk, v]) => v.list.forEach(t => { seqOf[t.id] = sk; }));
    const doneSeq = new Set();
    order.forEach(key => {
      const sk = seqOf[key]; if (doneSeq.has(sk)) return; doneSeq.add(sk);
      const { root, list } = bySeq[sk];
      const lineId = sk.split('#')[0];
      // focus lines hang off the Upkeep junction, so they open once you've passed it
      const rootDone = root ? res[root] === 'done' : (lineId === 'up' || !NET.junction || res[NET.junction] === 'done');
      let maxDone = -1;
      list.forEach((t, j) => { if (isDone(t, TODAY)) maxDone = j; });
      list.forEach((t, j) => { res[t.id] = isDone(t, TODAY) ? 'done' : (j <= maxDone + 1 && (rootDone || maxDone >= 0) ? 'avail' : 'locked'); });
    });
    return res;
  }
  let LS = {};
  const arrived = new Set();        // stations whose track has been painted
  function vstate(key) {
    if (key === 'IC') return 'done-ic';
    const st = LS[key];
    if (st === 'done') return 'done';
    if (st === 'avail' && arrived.has(key)) return 'open';
    return 'locked';
  }
  function seedArrived() { arrived.clear(); Object.keys(LS).forEach(k => { if (LS[k] !== 'locked') arrived.add(k); }); }

  // Anything that just became reachable gets a train.
  function dispatchTrains(now, fromKey) {
    let i = 0;
    const lineOrder = NET.stations.filter(s => s.t);
    lineOrder.forEach(s => {
      if (LS[s.key] !== 'locked' && !arrived.has(s.key) && !anims.some(a => a.e.to === s.key)) {
        const e = NET.edgeTo[s.key];
        if (!e) { arrived.add(s.key); return; }
        anims.push({ e, t0: now + (RM ? 0 : 200 + i * 140), dur: RM ? 0 : Math.min(1500, 520 + e.len * 1.5) });
        i++;
      }
    });
  }

  // ================================================================ state for animation
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let anims = [], dings = [];
  const popAt = {}, shakeAt = {};
  let hoverKey = null, focusedKey = null;

  // ================================================================ canvas / camera
  const cv = document.getElementById('map');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const cam = { s: 1, ox: 0, oy: 0 };
  let camTarget = null, userMoved = false;
  // The map sits behind a sheet: on phones it's pulled up from the bottom, on desktop it's a card docked bottom-left.
  const PEEK = 100, CARD_W = 344;   // handle 16 + header 36 + preview row 48   // compact (Linear-like density)
  const isDesk = () => W >= 760;
  // Wide desktop: the sheet is pinned open as a full-height panel and the map sits to its right.
  const isWide = () => W >= 1100 && W > H * 1.1;
  let safeB = 0;
  (() => { const p = document.createElement('div'); p.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none';
    document.body.appendChild(p); safeB = p.getBoundingClientRect().height || 0;
    p.style.height = 'env(safe-area-inset-top)'; safeT = p.getBoundingClientRect().height || 0; p.remove(); })();
  function insets() {
    // Desktop frames the map above the peeking card; when the card grows, keepStartClear() slides the map right.
    if (isWide()) return { top: 54, bottom: 16, left: 16 + CARD_W + 12, right: 18 };
    return isDesk() ? { top: 54, bottom: 16 + PEEK + 16, left: 0, right: 18 }
                    : { top: 44, bottom: PEEK + safeB + 8, left: 0, right: 0 };        // clear of the peeking sheet
  }
  function fitCam() {
    const B = NET.bounds, I = insets();
    const top = I.top + 8, bot = I.bottom + 12, padL = I.left + (NET.vertical ? 8 : 18), padR = I.right + (NET.vertical ? 8 : 18);
    const aw = W - padL - padR, ah = H - top - bot;
    const bw = B.x1 - B.x0, bh = B.y1 - B.y0;
    let s = Math.min(aw / bw, ah / bh, 1.15);
    if (NET.vertical) {
      // Columns: real size (names 13.5px), Upkeep at the left; if the first ready task sits in a column further right,
      // slide just far enough to bring that column in.
      s = 1;
      const c = { s, ox: 6 - B.x0 * s, oy: mapTopV() - B.y0 * s };
      const ready = NET.stations.find(st => st.t && LS[st.key] === 'avail' && !isDone(st.t, TODAY));
      if (ready) {
        const col = NET.cols.find(k => k.line === ready.line);
        if (col && (col.x + COLW_V) * s + c.ox > W - 4) c.ox = W - 4 - (col.x + COLW_V) * s;
      }
      return clampCam(c);
    }
    return { s, ox: padL + (aw - bw * s) / 2 - B.x0 * s, oy: top + (ah - bh * s) / 2 - B.y0 * s };
  }
  // Phone columns: keep the map inside its bounds (rubber-banding past them while dragging).
  function camLimits(s) {
    const B = NET.bounds, I = insets();
    const maxOx = 6 - B.x0 * s; let minOx = W - 6 - B.x1 * s; if (minOx > maxOx) minOx = maxOx;
    const maxOy = mapTopV() - B.y0 * s; let minOy = H - I.bottom - 8 - B.y1 * s; if (minOy > maxOy) minOy = maxOy;
    return { minOx, maxOx, minOy, maxOy };
  }
  function clampCam(c) {
    if (!NET.vertical) return c;
    const L = camLimits(c.s);
    return { s: c.s, ox: Math.max(L.minOx, Math.min(L.maxOx, c.ox)), oy: Math.max(L.minOy, Math.min(L.maxOy, c.oy)) };
  }
  function rubber(v, lo, hi) { return v > hi ? hi + (v - hi) * 0.35 : v < lo ? lo - (lo - v) * 0.35 : v; }
  function homeView() {
    const f = fitCam(), I = insets();
    if (!NET.vertical && f.s < 0.42) {
      const avail = H - I.top - I.bottom;
      const s = Math.max(f.s, Math.min(0.7, (avail - 60) / (NET.bounds.y1 - NET.bounds.y0)));
      return { s, ox: I.left + 18 - NET.bounds.x0 * s, oy: I.top + (avail - 30) / 2 - ((NET.bounds.y0 + NET.bounds.y1) / 2) * s };
    }
    return f;
  }
  function initialView() { Object.assign(cam, homeView()); camTarget = null; keepStartClear(true); }
  // The docked card must never sit on the start of the map (Today). If it would, slide the map right, same zoom.
  function keepStartClear(instant) {
    if (!isDesk() || isWide() || !NET.byKey.IC) return;
    const expanded = sheetExpanded(), base = camTarget || cam;
    if (!expanded) { if (!userMoved && !instant) camTarget = homeView(); return; }
    const ic = NET.byKey.IC, lp = (NET.vertical ? 30 : 115) * base.s;
    const sx = ic.x * base.s + base.ox, sy = ic.y * base.s + base.oy;
    const cardRight = 16 + CARD_W + 20, cardTop = H - 16 - sheetH() - 30;
    if (sx - lp < cardRight && sy > cardTop) {
      const t = { s: base.s, ox: base.ox + (cardRight - (sx - lp)), oy: base.oy };
      if (instant) Object.assign(cam, t); else camTarget = t;
    }
  }
  function resize() {
    const wasVertical = NET.vertical;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (isVertical() !== wasVertical) { build(); LS = lineStates(); anims = []; userMoved = false; }
    if (!userMoved) initialView();
  }
  function toWorld(sx, sy) { return [(sx - cam.ox) / cam.s, (sy - cam.oy) / cam.s]; }
  function clampS(s) { return Math.max(0.25, Math.min(2.6, s)); }
  function zoomAt(sx, sy, f) {
    const ns = clampS(cam.s * f);
    const [wx, wy] = toWorld(sx, sy);
    cam.s = ns; cam.ox = sx - wx * ns; cam.oy = sy - wy * ns;
    if (NET.vertical) Object.assign(cam, clampCam(cam));
    userMoved = true; camTarget = null;
  }
  // the part of the screen the sheet isn't covering
  function mapView() {
    const I = insets(), desk = isDesk();
    if (desk) return sheetExpanded() ? { left: 16 + CARD_W + 16, right: W - I.right, top: I.top, bottom: H - 16 }
                                     : { left: 0, right: W - I.right, top: I.top, bottom: H - I.bottom };
    const bottom = H - sheetH();
    return { left: 0, right: W, top: I.top, bottom: Math.max(I.top + 120, bottom) };
  }
  function ensureVisible(key) {
    const s = NET.byKey[key]; if (!s) return;
    const v = mapView();
    const sx = s.x * cam.s + cam.ox, sy = s.y * cam.s + cam.oy;
    const L = v.left + 60, R = v.right - 60, T = v.top + 40, Bm = v.bottom - 40;
    if (sx < L || sx > R || sy < T || sy > Bm) {
      camTarget = NET.vertical
        ? clampCam({ s: cam.s, ox: sx < L || sx > W - 150 ? v.left + 28 - s.x * cam.s : cam.ox, oy: (T + Bm) / 2 - s.y * cam.s })
        : { s: cam.s, ox: (L + R) / 2 - s.x * cam.s, oy: (T + Bm) / 2 - s.y * cam.s };
      userMoved = true;
    }
  }

  // ================================================================ drawing helpers
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function strokePts(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
  function solid(pts, color) {
    ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; strokePts(pts);
    ctx.strokeStyle = color; ctx.lineWidth = 5; strokePts(pts);
  }
  // planned track: a thin, quiet grey line
  function dashed(pts) {
    ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#D5D9E0'; ctx.lineWidth = 2; strokePts(pts);
  }
  function setFont(weight, size, family) { ctx.font = `${weight} ${size}px ${family}`; }
  const NAME_FONT = (w, s) => setFont(w, s || 13.5, 'Figtree');
  const META_FONT = (w, s) => setFont(w, s || 11, 'Figtree');
  function wrap(text, maxW) {
    const words = text.split(' '); const lines = []; let cur = '';
    words.forEach(w => { const tryS = cur ? cur + ' ' + w : w; if (ctx.measureText(tryS).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryS; });
    if (cur) lines.push(cur);
    return lines;
  }
  const easeIO = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const easeOut = p => 1 - Math.pow(1 - p, 3);
  const easeBack = p => { const c = 1.25; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lineTextColor = line => line.text || line.color;

  // ================================================================ draw
  const labelRects = {};
  const animTo = key => anims.find(a => a.e.to === key);
  function drawEdges(now) {
    const solids = [];
    [...NET.edges.filter(e => e.under), ...NET.edges.filter(e => !e.under)].forEach(e => {
      const a = animTo(e.to);
      if (a) {
        const p = Math.max(0, Math.min(1, (now - a.t0) / Math.max(1, a.dur)));
        const s = easeIO(p) * e.len;
        if (s < e.len) dashed(subPts(e, s, e.len));
        if (s > 0) solids.push([subPts(e, 0, s), e.color]);
      } else if (vstate(e.to) !== 'locked') solids.push([e.pts, e.color]);
      else dashed(e.pts);
    });
    solids.forEach(([p, c]) => solid(p, c));
  }
  // Termini: a small rounded pill with the line's name, in its colour on a 10% tint.
  const labelK = () => Math.max(1, Math.min(1.4, 0.95 / cam.s));
  function drawTermini() {
    const k = labelK();
    NET.termini.forEach(tm => {
      const l = tm.line;
      const live = !tm.empty && vstate(tm.from.key) !== 'locked';
      if (live) solid(tm.stub, l.color); else dashed(tm.stub);
      if (tm.branch) return;
      const end = tm.stub[tm.stub.length - 1];
      setFont(600, 11.5 * k, 'Figtree');
      const w = Math.ceil(ctx.measureText(l.name).width) + 20 * k, h = 22 * k;
      const bx = tm.vertical ? end[0] - 11 * k : end[0] + 10, by = tm.vertical ? end[1] + 8 : end[1] - h / 2;
      rr(bx, by, w, h, h / 2); ctx.fillStyle = l.tint; ctx.fill();
      ctx.fillStyle = l.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(l.name, bx + 10 * k, by + h / 2 + 0.5);
      if (tm.empty) {
        META_FONT(500, 11 * k); ctx.fillStyle = '#6B7480'; ctx.textBaseline = 'top';
        ctx.fillText('Nothing today', bx + (tm.vertical ? w + 8 : 10), tm.vertical ? by + 4 : by + h + 5);
      }
    });
  }
  function stationPos(s, now) {
    let x = s.x, y = s.y; const sh = shakeAt[s.key];
    if (sh != null && !RM) { const p = (now - sh) / 460; if (p < 1) { const d = Math.sin(p * Math.PI * 6) * 5 * (1 - p); if (NET.vertical) y += d; else x += d; } }
    return [x, y];
  }
  // The check: three points, drawn as a stroke so it can be "ticked" in.
  const TICK_PTS = [[-3.1, 0.2], [-0.9, 2.4], [3.3, -2.3]];
  const TICK_LEN = Math.hypot(2.2, 2.2) + Math.hypot(4.2, 4.7);
  function drawStation(s, now) {
    const isIC = !s.t, st = isIC ? 'ic' : vstate(s.key), col = s.line.color;
    const [x, y] = stationPos(s, now);
    const hov = hoverKey === s.key;
    ctx.save(); ctx.translate(x, y); ctx.setLineDash([]);
    if (st === 'ic') {
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#1C2430'; ctx.stroke();
    } else if (st === 'locked') {
      const r = hov ? 4.5 : 3.5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 1.75; ctx.strokeStyle = hov ? '#8E97A3' : '#BFC6CF'; ctx.stroke();
    } else if (st === 'open') {
      // boarding: white with a ring in the line's colour, breathing very slightly
      const ph = RM ? 0 : ((now + s.x * 2.3 + s.y * 1.7) % 2600) / 2600;
      const b = 1 + 0.09 * (0.5 - 0.5 * Math.cos(ph * Math.PI * 2));
      const r = (hov ? 6.5 : 5.5) * b;
      ctx.beginPath(); ctx.arc(0, 0, r + 3.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
    } else {
      // done: a filled circle that "gets ticked" — fill settles in, then the check draws itself
      const pa = popAt[s.key];
      const p = pa != null && !RM ? clamp01((now - pa) / 520) : 1;
      const r = 7, sc = p < 1 ? 0.72 + 0.28 * easeBack(clamp01(p / 0.42)) : 1;
      ctx.beginPath(); ctx.arc(0, 0, r + 1.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r * sc, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      const cp = easeOut(clamp01((p - 0.28) / 0.6));
      if (cp > 0) {
        ctx.beginPath(); ctx.moveTo(...TICK_PTS[0]); ctx.lineTo(...TICK_PTS[1]); ctx.lineTo(...TICK_PTS[2]);
        if (cp < 1) ctx.setLineDash([TICK_LEN * cp, TICK_LEN]);
        ctx.lineWidth = 1.9; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (focusedKey === s.key) { ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = '#2F7CF6'; ctx.stroke(); }
    ctx.restore();
  }
  // Quiet meta: time and repeat only, plus a countdown when something is close.
  function metaBits(s) {
    const t = s.t; if (!t) return [];
    const bits = [];
    if (t.time) bits.push({ v: t.time, mono: true });
    if (t.repeat) bits.push({ v: repeatShort(t.repeat) });
    return bits;
  }
  function metaFor(s) { return metaBits(s).map(b => b.v).join(' · '); }
  function countdown(s) {
    if (!s.t || !s.t.time || vstate(s.key) !== 'open') return '';
    const d = toMin(s.t.time) - minutesNow();
    if (d > 0 && d <= 90) return `in ${d} min`; if (d <= 0 && d > -30) return 'now';
    return '';
  }
  function stateWord(s) {
    if (!s.t) return 'Today';
    const st = vstate(s.key);
    if (st === 'done') return 'Done';
    if (st === 'open') { const c = countdown(s); return c ? c[0].toUpperCase() + c.slice(1) : 'Ready now'; }
    return LS[s.key] === 'avail' ? 'Opening next' : 'Later';
  }
  function drawLabel(s, now) {
    const st = s.t ? vstate(s.key) : 'ic';
    const [x0, y0s] = stationPos(s, now);
    const title = s.t ? s.t.title : 'Today';
    const maxW = NET.vertical ? (s.colR ? s.colR - s.x - 15 : 120) : 150;
    // keep names 13–14px on screen when the whole map is zoomed out to fit
    const k = labelK();
    const nameW = st === 'ic' ? 700 : st === 'open' ? 600 : 500, nameS = (st === 'ic' ? 14 : 13.5) * k;
    NAME_FONT(nameW, nameS);
    const lines = wrap(title, maxW);
    const cd = s.t ? countdown(s) : '';
    const meta = [metaFor(s), cd].filter(Boolean).join(' · ');
    // phone columns: meta wraps at its dots so it never spills into the next column
    let metaLines = meta ? [meta] : [];
    if (meta && NET.vertical) {
      META_FONT(500, 11 * k); metaLines = [];
      meta.split(' · ').forEach(b => { const n = metaLines.length, tryS = n ? metaLines[n - 1] + ' · ' + b : b;
        if (n && ctx.measureText(tryS).width <= maxW) metaLines[n - 1] = tryS; else metaLines.push(b); });
      NAME_FONT(nameW, nameS);
    }
    const lh = 17 * k, mh = metaLines.length * 15 * k, blockH = lines.length * lh + mh;
    let x = x0, align = 'center', y0;
    switch (s.side) {
      case 'a': y0 = y0s - 13 - blockH; break;
      case 'l': y0 = y0s - blockH / 2; align = 'right'; x = x0 - 18; break;
      case 'r': y0 = y0s - blockH / 2 + 1; align = 'left'; x = x0 + (s.t ? 15 : 19); break;
    }
    ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
    ctx.fillStyle = st === 'done' ? '#6B7480' : st === 'locked' ? (hoverKey === s.key ? '#1C2430' : '#3F4856') : '#1C2430';
    let mw = 0;
    lines.forEach((ln, i) => {
      const yy = y0 + i * lh;
      ctx.lineWidth = 4 * k; ctx.strokeStyle = '#fff'; ctx.strokeText(ln, x, yy); ctx.fillText(ln, x, yy);
      mw = Math.max(mw, ctx.measureText(ln).width);
    });
    if (meta) {
      META_FONT(500, 11 * k);
      ctx.fillStyle = st === 'open' && cd ? lineTextColor(s.line) : '#6B7480';
      metaLines.forEach((ml, i) => {
        const yy = y0 + lines.length * lh + k + i * 15 * k;
        ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(ml, x, yy); ctx.fillText(ml, x, yy);
        mw = Math.max(mw, ctx.measureText(ml).width);
      });
    }
    const rx = align === 'center' ? x - mw / 2 : align === 'right' ? x - mw : x;
    labelRects[s.key] = [rx - 4, y0 - 4, mw + 8, blockH + 8];
  }
  // The train: a small rounded white capsule outlined in the line's colour, with a faint shadow.
  function drawTrains(now) {
    anims.forEach(a => {
      if (now < a.t0) return;
      const p = Math.min(1, (now - a.t0) / Math.max(1, a.dur));
      const [x, y, ang] = pointAt(a.e, easeIO(p) * a.e.len);
      ctx.save(); ctx.translate(x, y + 1.5); ctx.rotate(ang);
      rr(-13, -6.5, 26, 13, 6.5); ctx.fillStyle = 'rgba(15,23,42,.10)'; ctx.fill();
      ctx.restore();
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      rr(-12, -5.5, 24, 11, 5.5); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = a.e.color; ctx.stroke();
      ctx.beginPath(); ctx.arc(5.5, 0, 1.8, 0, Math.PI * 2); ctx.fillStyle = a.e.color; ctx.fill();
      ctx.restore();
    });
  }
  // Arrival (and ticks): one soft ring that widens and fades.
  function drawDings(now) {
    dings = dings.filter(d => now - d.t0 < 650);
    dings.forEach(d => {
      const p = Math.max(0, (now - d.t0) / 650);
      const r = 9 + easeOut(p) * (d.big ? 18 : 10);
      ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.globalAlpha = 0.45 * (1 - p); ctx.lineWidth = 1.75; ctx.strokeStyle = d.color; ctx.stroke(); ctx.globalAlpha = 1;
    });
  }
  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.ox, dpr * cam.oy);
    drawEdges(now);
    drawTermini();
    NET.stations.forEach(s => drawStation(s, now));
    drawTrains(now);
    drawDings(now);
    NET.stations.forEach(s => drawLabel(s, now));
    if (NET.vertical) drawColumnHeads();
  }
  // Phone: a sticky row of column names over the map; it follows the map sideways.
  function drawColumnHeads() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const top = headTop(), h = HEAD_V;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, top + h - 6);
    const g = ctx.createLinearGradient(0, top + h - 6, 0, top + h + 6);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, top + h - 6, W, 12);
    setFont(600, 11.5, 'Figtree'); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    NET.cols.forEach(c => {
      const tw = Math.ceil(ctx.measureText(c.line.name).width), w = tw + 26, ch = 22;
      const sx = c.x * cam.s + cam.ox, bx = sx - 11, by = top + (h - ch) / 2 - 2;
      if (bx > W || bx + w < 0) return;
      rr(bx, by, w, ch, 7); ctx.fillStyle = '#F4F6F9'; ctx.fill();
      ctx.beginPath(); ctx.arc(sx, by + ch / 2, 3.5, 0, Math.PI * 2); ctx.fillStyle = c.line.color; ctx.fill();
      ctx.fillStyle = '#1C2430'; ctx.fillText(c.line.name, sx + 9, by + ch / 2 + 0.5);
    });
  }

  // ================================================================ logic
  function update(now) {
    if (anims.length) {
      const fin = anims.filter(a => now >= a.t0 + a.dur);
      if (fin.length) { anims = anims.filter(a => now < a.t0 + a.dur); fin.forEach(a => arrive(a.e.to, now)); }
    }
    if (camTarget) {
      const k = RM ? 1 : 0.18;
      cam.s += (camTarget.s - cam.s) * k; cam.ox += (camTarget.ox - cam.ox) * k; cam.oy += (camTarget.oy - cam.oy) * k;
      if (Math.abs(camTarget.ox - cam.ox) < 0.5 && Math.abs(camTarget.oy - cam.oy) < 0.5 && Math.abs(camTarget.s - cam.s) < 0.002) { Object.assign(cam, camTarget); camTarget = null; }
    }
  }
  function arrive(key, now) {
    arrived.add(key);
    const s = NET.byKey[key];
    if (s) dings.push({ x: s.x, y: s.y, color: s.line.color, t0: now, big: true });
    refreshHud();
  }

  // Rebuild today's network after any change to the plan, then send trains to whatever opened.
  function replan(opts = {}) {
    // one-off stops finished on an earlier day are history: they leave the plan quietly
    const day = serviceDay();
    S.tasks = S.tasks.filter(t => t.repeat || !t.doneOn || t.doneOn >= day || hasPending(t));
    build();
    LS = lineStates();
    // drop arrivals for stations that no longer exist or became locked again
    [...arrived].forEach(k => { if (!LS[k] || LS[k] === 'locked') arrived.delete(k); });
    anims = anims.filter(a => NET.edgeTo[a.e.to] && LS[a.e.to] !== 'locked').map(a => ({ ...a, e: NET.edgeTo[a.e.to] }));
    if (opts.instant) seedArrived(); else dispatchTrains(performance.now());
    save();
    refreshHud(); renderList();
    if (ttOpen()) renderTimetable();
  }

  function removeTask(t) {
    S.tasks.forEach(c => { if (c.from === t.id) { c.from = t.from; c.fork = t.fork || 0; } });
    S.tasks = S.tasks.filter(x => x !== t);
  }
  // ---- undo
  let undoSnap = null;
  function snapshot() { undoSnap = JSON.stringify(S); }
  function undo() {
    if (!undoSnap) return;
    S = JSON.parse(undoSnap); undoSnap = null;
    replan({ instant: true });
    toast('↺', 'Undone.');
  }

  // ---- tap: finish a stop (the whole point). Order is a suggestion; tapping ahead runs an express.
  const LEAF = ['Done. That one counts.', 'Done. Nice, steady progress.', 'Done for now. Good work.', 'Done. Take a breath if you need one.'];
  let leafIx = 0;
  function activate(key) {
    const now = performance.now();
    const s = NET.byKey[key]; if (!s || !s.t) return;
    const st = vstate(key);
    if (st === 'done') { dings.push({ x: s.x, y: s.y, color: s.line.color, t0: now, big: false }); say(`${s.t.title}: already done. Hold it to undo.`); return; }
    if (LS[key] === 'avail' && !arrived.has(key)) return; // train still on its way
    const express = st === 'locked';
    snapshot();
    s.t.doneOn = TODAY; if (s.t.repeat) s.t.lastDone = TODAY;
    if (express) arrived.delete(key);
    popAt[key] = now; shakeAt[key] = null;
    dings.push({ x: s.x, y: s.y, color: s.line.color, t0: now, big: true });
    const before = new Set(Object.keys(LS).filter(k => LS[k] !== 'locked'));
    replan();
    const opened = Object.keys(LS).filter(k => LS[k] === 'avail' && !before.has(k)).map(k => NET.byKey[k].t.title);
    const dueTotal = NET.stations.filter(x => x.t && !x.old).length, doneN = NET.stations.filter(x => x.t && !x.old && isDone(x.t, TODAY)).length;
    if (doneN === dueTotal) toast(`${doneN}/${dueTotal}`, 'All done for today.', true);
    else if (express) toast('EXPRESS', `“${s.t.title}” done early. The tasks before it are still open.`, true);
    else if (s.t.anchor && NET.stations.filter(x => x.t && x.t.anchor).every(x => isDone(x.t, TODAY)) && S.lines.length)
      toast('GO', 'Morning done. Everything else is open now.', true);
    else if (opened.length) toast(`+${opened.length}`, opened.length === 1 ? `Next up: ${opened[0]}.` : `Next up: ${opened.join(' and ')}.`, true);
    else toast('✓', LEAF[leafIx++ % LEAF.length], true);
  }

  // ---- hold: the few things you can do to a stop
  function move(key, how) {
    const t = taskById(key); if (!t) return;
    snapshot();
    const today = TODAY, maxOrder = Math.max(0, ...S.tasks.map(x => x.order));
    let msg = '';
    switch (how) {
      case 'later': t.order = maxOrder + 1; msg = `“${t.title}” moved to the end of its list.`; break;
      case 'tomorrow': if (t.repeat) { t.skip = today; msg = `Skipping “${t.title}” today. Back tomorrow.`; } else { t.date = addDays(today, 1); msg = `“${t.title}” is off today's map. Back tomorrow.`; } break;
      case 'someday': t.someday = true; msg = `“${t.title}” parked for someday. It's in the plan.`; break;
      case 'undone': t.doneOn = null; if (t.repeat && t.lastDone === today) t.lastDone = null; msg = `“${t.title}” is open again.`; break;
      case 'delete': removeTask(t); msg = `“${t.title}” removed.`; break;
    }
    replan();
    toast(how === 'delete' ? '✕' : how === 'undone' ? '↺' : '→', msg, true);
  }

  // ================================================================ natural-language add
  const DAYRE = '(sun|mon|tue|wed|thu|fri|sat)[a-z]*';
  function dowIndex(w) { return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(w.slice(0, 3).toLowerCase()); }
  function parse(input) {
    let s = ' ' + input + ' ';
    const out = { title: '', line: null, repeat: null, time: null, date: null, someday: false, anchor: false, lineGuess: false };
    const take = (re, fn) => { const m = s.match(re); if (m) { fn(m); s = s.replace(m[0], ' '); return true; } return false; };
    take(/\s#([\w-]+)/i, m => {
      const q = m[1].toLowerCase();
      const l = allLines().find(l => l.name.toLowerCase().replace(/\s+/g, '').startsWith(q) || l.code.toLowerCase() === q || (q === 'admin' || q === 'chores' || q === 'maint') && l.upkeep);
      out.line = l ? l.id : null;
    });
    // repeats
    take(/\s(every\s?day|daily|each day)\b/i, () => { out.repeat = { type: 'daily' }; }) ||
    take(/\s(every\s+weekday|weekdays|on weekdays)\b/i, () => { out.repeat = { type: 'weekdays' }; }) ||
    take(/\severy\s+(\d+)\s+days?\b/i, m => { out.repeat = { type: 'every', n: Math.max(1, +m[1]) }; }) ||
    take(/\severy\s+other\s+day\b/i, () => { out.repeat = { type: 'every', n: 2 }; }) ||
    take(new RegExp(`\\severy\\s+${DAYRE}((?:\\s*(?:,|and|&)\\s*${DAYRE})*)`, 'i'), m => {
      const days = (m[0].match(new RegExp(DAYRE, 'gi')) || []).map(dowIndex).filter(d => d >= 0);
      out.repeat = { type: 'weekly', days: [...new Set(days)] };
    }) ||
    take(/\s(weekly|every\s+week)\b/i, () => { out.repeat = { type: 'weekly', days: [parseYmd(serviceDay()).getDay()] }; });
    take(/\s(first thing|starts? the day|to start the day)\b/i, () => { out.anchor = true; });
    // time
    take(/\s(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i, m => {
      let h = +m[1] % 12; if (m[3].toLowerCase() === 'pm') h += 12; out.time = `${pad2(h)}:${pad2(+(m[2] || 0))}`;
    }) ||
    take(/\s(?:at\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/i, m => { out.time = `${pad2(+m[1])}:${m[2]}`; }) ||
    take(/\sat\s+(\d{1,2})\b/i, m => { let h = +m[1]; if (h < 7) h += 12; out.time = `${pad2(h)}:00`; }) ||
    take(/\s(noon|midday)\b/i, () => { out.time = '12:00'; });
    // day
    const today = serviceDay();
    take(/\s(someday|some day|eventually|one day)\b/i, () => { out.someday = true; }) ||
    take(/\stomorrow\b/i, () => { out.date = addDays(today, 1); }) ||
    take(/\s(today|tonight)\b/i, () => { out.date = null; }) ||
    take(/\snext week\b/i, () => { const d = parseYmd(today); const add = ((8 - d.getDay()) % 7) || 7; out.date = addDays(today, add); });
    // a weekday: full names anywhere ("call mum friday"), short names only after "on" (so "sunscreen" stays a word)
    if (!out.repeat && !out.date && !out.someday) {
      let dayWord = null;
      take(/\s(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, m => { dayWord = m[1]; }) ||
      take(/\son\s+(sun|mon|tue|wed|thu|fri|sat)\b/i, m => { dayWord = m[1]; });
      if (dayWord) {
        const want = dowIndex(dayWord), d = parseYmd(today).getDay();
        let add = (want - d + 7) % 7; if (add === 0) add = 7;
        out.date = addDays(today, add);
      }
    }
    let title = s.replace(/\s+/g, ' ').trim().replace(/\s(at|on)$/i, '').trim();
    out.title = title ? title[0].toUpperCase() + title.slice(1) : '';
    if (!out.line) { out.lineGuess = true; out.line = (out.repeat || out.anchor) ? 'up' : (S.lines[0] ? S.lines[0].id : 'up'); }
    return out;
  }
  function repeatShort(r) {
    if (!r) return '';
    switch (r.type) {
      case 'daily': return 'Daily';
      case 'weekdays': return 'Weekdays';
      case 'every': return r.n === 1 ? 'Daily' : `Every ${r.n} days`;
      case 'weekly': return (r.days || []).length === 7 ? 'Daily' : (r.days || []).map(d => DOW[d]).join(', ') || 'Weekly';
    }
    return '';
  }
  function ruleText(t) {
    const bits = [];
    if (t.someday) bits.push('Someday');
    else if (t.repeat) bits.push(repeatShort(t.repeat));
    else bits.push(t.date && t.date > TODAY ? nice(t.date) : 'Once');
    if (t.time) bits.push(t.time);
    if (t.anchor) bits.push('Starts the day');
    if (t.repeat && t.skip === TODAY) bits.push('Skipped today');
    if (!t.repeat && t.doneOn) bits.push('Done');
    return bits.join(' · ');
  }
  function ruleSource(t) {   // editable natural-language form of a task's rule
    const bits = [];
    if (t.someday) bits.push('someday');
    else if (t.repeat) {
      const r = t.repeat;
      bits.push(r.type === 'daily' ? 'every day' : r.type === 'weekdays' ? 'weekdays' : r.type === 'every' ? `every ${r.n} days`
        : 'every ' + (r.days || []).map(d => DOW_LONG[d]).join(' and '));
    } else if (t.date && t.date > TODAY) bits.push(diffDays(t.date, TODAY) === 1 ? 'tomorrow' : 'on ' + DOW_LONG[parseYmd(t.date).getDay()]);
    else bits.push('once');
    if (t.time) bits.push(t.time);
    if (t.anchor) bits.push('first thing');
    return bits.join(' ');
  }

  // ================================================================ the pocket sheet: snap points + spring
  const sheetEl = document.getElementById('sheet'), grab = document.getElementById('grab'), ctrlEl = document.getElementById('ctrl');
  const peekEl = document.getElementById('peek'), scrollEl = document.getElementById('scroll');
  const SNAPS = ['peek', 'half', 'full'];
  let snap = 'peek', sheetTab = 'today';
  const sp = { h: PEEK, v: 0, target: PEEK, from: PEEK, raf: 0, last: 0 };
  const SPRING_K = 380, ZETA = 0.74, OVERSHOOT = 0.06;   // ζ 0.74 ≈ 3% natural overshoot; hard-capped at 6%

  function snapH(name) {
    if (isWide()) return H - 32;                         // pinned: always the full panel
    const desk = isDesk(), peek = PEEK + (desk ? 0 : safeB);
    const full = Math.max(peek, desk ? H - 16 - 62 : H - 50);
    if (name === 'peek') return peek;
    if (name === 'full') return full;
    if (holdKey) {   // hold: tall enough for every action row
      const need = 30 + document.getElementById('holdHead').offsetHeight + document.getElementById('hacts').scrollHeight + 6;
      return Math.min(full, Math.max(need, 260));
    }
    return Math.min(full, desk ? Math.min(480, H * 0.62) : Math.round(Math.max(340, H * 0.56)));
  }
  function sheetH() { return sp.target; }
  function sheetExpanded() { return !!holdKey || snap !== 'peek'; }
  function applyH(h) {
    sp.h = h;
    sheetEl.style.height = h.toFixed(1) + 'px';
    sheetEl.classList.toggle('is-full', !holdKey && (isWide() || h > (snapH('half') + snapH('full')) / 2));
    if (isDesk()) { ctrlEl.style.bottom = ''; ctrlEl.classList.remove('hidden'); }
    else { ctrlEl.style.bottom = (h + 12) + 'px'; ctrlEl.classList.toggle('hidden', h > H * 0.6); }
    placeNotice();
  }
  function springTo(target, v0) {
    sp.target = target; sp.from = sp.h; if (v0 != null) sp.v = v0;
    if (RM) { sp.v = 0; if (sp.raf) cancelAnimationFrame(sp.raf); sp.raf = 0; applyH(target); return; }
    if (!sp.raf) { sp.last = performance.now(); sp.raf = requestAnimationFrame(springStep); }
  }
  function springStep(now) {
    const dt = Math.min(0.034, Math.max(0.001, (now - sp.last) / 1000)); sp.last = now;
    const c = 2 * ZETA * Math.sqrt(SPRING_K), n = 4, h = dt / n;
    let x = sp.h, v = sp.v;
    for (let i = 0; i < n; i++) { const a = -SPRING_K * (x - sp.target) - c * v; v += a * h; x += v * h; }
    const lim = Math.max(2, Math.abs(sp.target - sp.from) * OVERSHOOT);
    if (sp.target >= sp.from && x > sp.target + lim) { x = sp.target + lim; v = Math.min(0, v); }
    if (sp.target < sp.from && x < sp.target - lim) { x = sp.target - lim; v = Math.max(0, v); }
    if (Math.abs(x - sp.target) < 0.35 && Math.abs(v) < 6) { x = sp.target; v = 0; }
    sp.v = v; applyH(x);
    sp.raf = (x === sp.target && v === 0) ? 0 : requestAnimationFrame(springStep);
  }
  // Keep the spring honest when frames are throttled.
  setInterval(() => { if (sp.raf && performance.now() - sp.last > 300) { cancelAnimationFrame(sp.raf); sp.raf = 0; sp.v = 0; applyH(sp.target); } }, 300);

  const SNAP_WORD = { peek: 'collapsed', half: 'half open', full: 'fully open' };
  function setSnap(name, opts = {}) {
    if (isWide() && !holdKey) name = 'full';             // pinned open on wide screens
    snap = name; sheetEl.dataset.snap = name;
    grab.setAttribute('aria-expanded', String(name !== 'peek'));
    grab.setAttribute('aria-label', holdKey ? 'Close task actions' : `Sheet ${SNAP_WORD[name]}. Activate to ${name === 'full' ? 'collapse' : 'expand'}; arrow keys move it.`);
    const target = snapH(name);
    if (opts.instant) { if (sp.raf) cancelAnimationFrame(sp.raf); sp.raf = 0; sp.v = 0; sp.target = target; applyH(target); keepStartClear(true); return; }
    springTo(target, opts.v);
    keepStartClear();
  }
  function cycleSnap() {
    if (holdKey) { closeMenu(); return; }
    if (isWide()) return;
    setSnap(SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length]);
  }

  // handle: drag with pointer events, tap to cycle, keyboard via the button
  let gd = null, suppressClick = false;
  grab.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    try { grab.setPointerCapture(e.pointerId); } catch (_) {}
    if (sp.raf) { cancelAnimationFrame(sp.raf); sp.raf = 0; }
    sp.v = 0;
    gd = { id: e.pointerId, y: e.clientY, h: sp.h, moved: false, samples: [[performance.now(), sp.h]] };
  });
  grab.addEventListener('pointermove', e => {
    if (!gd || e.pointerId !== gd.id) return;
    const dy = e.clientY - gd.y;
    if (!gd.moved && Math.abs(dy) > 5) { gd.moved = true; grab.classList.add('dragging'); }
    if (!gd.moved) return;
    const lo = snapH('peek'), hi = holdKey ? snapH('half') : snapH('full');
    let h = gd.h - dy;
    if (h > hi) h = hi + (h - hi) * 0.25;            // rubber band past the ends
    if (h < lo) h = lo - (lo - h) * 0.25;
    applyH(h);
    gd.samples.push([performance.now(), h]); if (gd.samples.length > 6) gd.samples.shift();
  });
  function endGrab(e, cancel) {
    if (!gd || e.pointerId !== gd.id) return;
    const g = gd; gd = null; grab.classList.remove('dragging');
    if (!g.moved) return;                              // a tap: the click handler cycles
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
    if (cancel) { setSnap(snap); return; }
    const [t0, h0] = g.samples[0], [t1, h1] = g.samples[g.samples.length - 1];
    const vel = t1 > t0 ? (h1 - h0) / ((t1 - t0) / 1000) : 0;   // px/s, positive = up
    const proj = sp.h + vel * 0.16;
    const options = holdKey ? ['peek', 'half'] : SNAPS;
    let best = options[0], bd = Infinity;
    options.forEach(n => { const d = Math.abs(snapH(n) - proj); if (d < bd) { bd = d; best = n; } });
    if (holdKey && best === 'peek') { closeMenu({ to: 'peek', v: vel }); return; }
    setSnap(best, { v: Math.max(-2600, Math.min(2600, vel)) });
  }
  grab.addEventListener('pointerup', e => endGrab(e, false));
  grab.addEventListener('pointercancel', e => endGrab(e, true));
  grab.addEventListener('click', () => { if (suppressClick) { suppressClick = false; return; } cycleSnap(); });
  grab.addEventListener('keydown', e => {
    const i = SNAPS.indexOf(snap);
    if (e.key === 'ArrowUp' && !holdKey) { e.preventDefault(); setSnap(SNAPS[Math.min(2, i + 1)]); }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (holdKey) closeMenu({ to: 'peek' }); else setSnap(SNAPS[Math.max(0, i - 1)]); }
  });

  // tabs (full only)
  const tabBtns = [...document.querySelectorAll('.tab')];
  function setTab(tab) {
    sheetTab = tab; sheetEl.dataset.tab = tab;
    tabBtns.forEach(b => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    if (tab === 'tt') renderTimetable();
    scrollEl.scrollTop = 0;
  }
  tabBtns.forEach((b, i) => {
    // views live in the header: Plan and Key open the panel fully; Today opens it to the list
    b.addEventListener('click', () => {
      const t = b.dataset.tab;
      if (holdKey) closeMenu({ focus: false });
      setTab(t);
      if (t !== 'today' && snap !== 'full') setSnap('full');
      else if (t === 'today' && snap === 'peek') setSnap('half');
    });
    b.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
      e.preventDefault(); const nb = tabBtns[(i + d + tabBtns.length) % tabBtns.length]; setTab(nb.dataset.tab); nb.focus();
    });
  });

  // ================================================================ add field
  const addInput = document.getElementById('addInput'), addBox = document.getElementById('addBox'), chips = document.getElementById('chips');
  const ADD_PH = 'Add a task…  e.g. stretch every day 9am';
  addInput.placeholder = ADD_PH;
  let addFrom = null, addFork = null;   // when set, the next stops go on a branch off this station
  function startBranch(key) {
    const t = taskById(key); if (!t) return;
    addFrom = key; addFork = null;
    setTab('today'); if (snap === 'peek' || snap === 'full') setSnap('half');
    addInput.value = ''; addInput.placeholder = 'First task on the branch…';
    renderChips(); addInput.focus({ preventScroll: true }); scrollEl.scrollTop = 0;
  }
  function clearBranch() { addFrom = null; addFork = null; addInput.placeholder = ADD_PH; renderChips(); }
  function renderChips() {
    const v = addInput.value.trim();
    const from = addFrom && taskById(addFrom);
    const parts = [];
    if (from) parts.push(`<span class="chip branch">${icon('branch', 14)}<span class="bt">Branch off ${esc(from.title)}</span><button type="button" data-x aria-label="Cancel branch">${icon('close', 12)}</button></span>`);
    if (!v) {
      parts.push(from ? '<span class="hint">Type the first task. Esc to cancel.</span>'
        : '<span class="hint">Type it the way you\'d say it, e.g. <code>stretch daily 9am #health</code>.</span>');
      chips.innerHTML = parts.join(''); return;
    }
    const p = parse(v);
    if (from) p.line = from.line;
    const l = lineById(p.line);
    parts.push(`<span class="chip line" style="background:${l.tint};color:${l.text}"><span class="ldot" style="background:${l.color}"></span>${esc(l.name)}</span>`);
    if (p.someday) parts.push(`<span class="chip">${icon('archive', 13)}Someday</span>`);
    else if (p.repeat) parts.push(`<span class="chip">${icon('repeat', 13)}${repeatShort(p.repeat)}</span>`);
    else parts.push(`<span class="chip">${icon('calendar', 13)}${p.date ? nice(p.date) : 'Today'}</span>`);
    if (p.time) parts.push(`<span class="chip t">${p.time}</span>`);
    if (p.anchor) parts.push('<span class="chip">Starts the day</span>');
    parts.push(`<span class="hint">${p.lineGuess && !from ? '<code>#work</code> puts it in the Work list · ' : ''}Enter adds</span>`);
    chips.innerHTML = parts.join('');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  chips.addEventListener('click', e => { if (e.target.closest('[data-x]')) { addInput.value = ''; clearBranch(); addInput.focus(); } });
  addInput.addEventListener('input', renderChips);
  addInput.addEventListener('focus', () => { if (snap === 'peek' && !holdKey) setSnap('half'); });
  addInput.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== addInput && !addInput.value && !chips.contains(document.activeElement)) clearBranch(); }, 150); });
  addInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); addInput.value = ''; clearBranch(); addInput.blur(); return; }
    if (e.key !== 'Enter') return;
    const p = parse(addInput.value.trim());
    if (!p.title) { toast('?', 'Type what the task is, e.g. "stretch every day 9am #health".'); return; }
    snapshot();
    const from = addFrom && taskById(addFrom);
    let fork = 0;
    if (from) {
      // keep adding to the branch you just started; a fresh "branch from here" on a stop that already has one starts another
      fork = addFork != null ? addFork : Math.max(-1, ...S.tasks.filter(x => x.from === from.id).map(x => x.fork || 0)) + 1;
      addFork = fork;
    }
    const t = { id: 't' + Date.now().toString(36), line: from ? from.line : p.line, title: p.title, order: Math.max(0, ...S.tasks.map(x => x.order)) + 1,
      from: from ? from.id : null, fork, anchor: p.anchor && !from && (from ? from.line : p.line) === 'up', repeat: p.repeat, time: p.time, date: p.date, someday: p.someday, doneOn: null, lastDone: null, skip: null };
    S.tasks.push(t);
    addInput.value = ''; renderChips();
    replan();
    const l = lineById(t.line);
    if (t.someday) toast('+', `“${t.title}” parked for someday. It's in the plan.`, true);
    else if (!isDueToday(t, TODAY)) toast('+', `“${t.title}” added to ${l.name}. First run: ${t.date ? nice(t.date).toLowerCase() : 'its next day'}.`, true);
    else { toast('+1', from ? `“${t.title}” added to the branch. Keep typing to extend it, Esc when done.` : `“${t.title}” added to ${l.name}.`, true); ensureVisible(t.id); }
  });

  // ================================================================ hold: the sheet becomes the stop's actions
  const holdEl = document.getElementById('hold'), holdHead = document.getElementById('holdHead'), hacts = document.getElementById('hacts'), hrule = document.getElementById('hrule');
  let holdKey = null, holdReturn = null, holdPrev = 'peek', swallowPtr = false;
  function openMenu(key) {
    const s = NET.byKey[key]; if (!s || !s.t) return;
    if (!holdKey) { holdPrev = snap; holdReturn = document.activeElement; }
    holdKey = key;
    const t = s.t, st = vstate(key), l = s.line;
    const items = [];
    if (st === 'done') items.push(['undone', 'Not done yet', 'undo', 'primary', 'Reopen it']);
    else items.push(['done', st === 'locked' ? 'Do it now (skip ahead)' : 'Done', 'check', 'primary', st === 'locked' ? 'Tasks before it stay open' : '']);
    if (st !== 'done') {
      items.push(['later', 'Later today', 'later', '', 'End of its list']);
      items.push(['tomorrow', t.repeat ? 'Skip today' : 'Tomorrow', 'calendar', '', t.repeat ? 'Back tomorrow' : '']);
      items.push(['someday', t.repeat ? 'Pause' : 'Someday', t.repeat ? 'pause' : 'archive', '', '']);
    }
    items.push(['branch', 'Branch from here', 'branch', '', '']);
    items.push(['edit', 'Edit in plan', 'list', '', '']);
    items.push(['delete', 'Delete', 'trash', 'danger', '']);
    hrule.style.background = l.color;
    holdHead.innerHTML = `<div class="txt"><span class="lpill" style="background:${l.tint};color:${l.text}"><span class="ldot" style="background:${l.color}"></span>${esc(l.name)}</span>
      <div class="t"></div><div class="m">${metaHtml(s, true)}</div></div>
      <button class="hclose" type="button" aria-label="Close task actions">${icon('close', 16)}</button>`;
    holdHead.querySelector('.t').textContent = t.title;
    hacts.innerHTML = items.map(([k, label, ic, cls, sub]) =>
      `${k === 'delete' ? '<div class="hsep" role="separator"></div>' : ''}<button type="button" role="menuitem" class="hact ${cls}" data-k="${k}"><span class="ic">${icon(ic, 20)}</span>${label}${sub ? `<span class="sub">${sub}</span>` : ''}</button>`).join('');
    sheetEl.classList.add('mode-hold'); sheetEl.classList.remove('is-full');
    setSnap('half');
    hacts.querySelector('button').focus({ preventScroll: true });
    if (!isDesk()) ensureVisible(key);
    say(`${t.title}. Task actions.`);
  }
  function closeMenu(opts = {}) {
    if (!holdKey) return;
    holdKey = null; sheetEl.classList.remove('mode-hold');
    setSnap(opts.to || holdPrev, { v: opts.v });
    if (opts.focus !== false && holdReturn && holdReturn.focus && document.contains(holdReturn) && holdReturn !== document.body) holdReturn.focus({ preventScroll: true });
  }
  holdEl.addEventListener('click', e => {
    if (e.target.closest('.hclose')) { closeMenu(); return; }
    const b = e.target.closest('.hact'); if (!b) return;
    const key = holdKey, k = b.dataset.k;
    if (k === 'edit') { closeMenu({ focus: false, to: 'full' }); openTimetable(key); return; }
    if (k === 'branch') { closeMenu({ focus: false, to: 'half' }); startBranch(key); return; }
    closeMenu();
    if (k === 'done') activate(key); else move(key, k);
  });
  hacts.addEventListener('keydown', e => {
    const bs = [...hacts.querySelectorAll('button')]; const i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  });
  // tapping anywhere outside the sheet puts the actions away (and that tap does nothing else)
  document.addEventListener('pointerdown', e => {
    if (holdKey && !sheetEl.contains(e.target)) { swallowPtr = e.target === cv; closeMenu({ focus: false }); }
  }, true);

  // ================================================================ timetable tab (where the complexity lives)
  const ttBody = document.getElementById('ttBody');
  function ttOpen() { return sheetTab === 'tt' && snap === 'full' && !holdKey; }
  function openTimetable(focusId) {
    setTab('tt'); if (snap !== 'full') setSnap('full');
    const el = focusId && ttBody.querySelector(`[data-id="${focusId}"] input.title`);
    if (el) { el.focus({ preventScroll: true }); setTimeout(() => el.closest('.trow').scrollIntoView({ block: 'center' }), 0); }
    else document.getElementById('tab-tt').focus();
  }
  function closeTimetable() { setTab('today'); }
  function renderTimetable() {
    const lines = allLines();
    const parts = [];
    parts.push(`<p class="tt-intro">The map only shows today. This is the plan it's built from. Edit a rule in plain words:
      <code>every day 8am</code>, <code>first thing</code>, <code>weekdays</code>, <code>every 3 days</code>, <code>every mon and thu</code>, <code>tomorrow</code>, <code>on friday 14:00</code>, <code>someday</code>, <code>once</code>.
      Swipe a task left to branch or delete.</p>`);
    lines.forEach(l => {
      const pool = S.tasks.filter(t => t.line === l.id && !t.someday);
      const ids = new Set(pool.map(t => t.id));
      const tasks = [];
      const walk = (list, depth) => list.sort((a, b) => a.order - b.order).forEach(t => {
        t._depth = depth; tasks.push(t);
        const forks = [...new Set(pool.filter(c => c.from === t.id).map(c => c.fork || 0))].sort();
        forks.forEach(f => walk(pool.filter(c => c.from === t.id && (c.fork || 0) === f), depth + 1));
      });
      walk(pool.filter(t => !t.from || !ids.has(t.from)), 0);
      parts.push(`<div class="tline" data-line="${l.id}">
        <div class="tline-h"><span class="ldot" style="background:${l.color}"></span>
        ${l.upkeep ? `<input value="Upkeep" disabled aria-label="List name">` : `<input class="lname-in" value="${esc(l.name)}" aria-label="List name">`}
        ${l.upkeep ? '' : `<button class="ib" type="button" data-act="dropline" title="Remove list" aria-label="Remove ${esc(l.name)} list">${icon('close', 16)}</button>`}</div>
        ${tasks.length ? tasks.map(rowHtml).join('') : '<div class="empty">No tasks in this list.</div>'}</div>`);
    });
    const some = S.tasks.filter(t => t.someday);
    parts.push(`<div class="tline"><div class="tline-h"><span class="ldot" style="background:#C5CBD3"></span><input value="Someday" disabled aria-label="Someday"></div>
      ${some.length ? some.map(rowHtml).join('') : '<div class="empty">Nothing parked. Hold a task and pick “Someday” to park it here.</div>'}</div>`);
    const focusCount = S.lines.length;
    parts.push(`<div class="tt-foot">
      <div class="row"><button class="lbtn primary" id="addLine" type="button" ${focusCount >= MAX_FOCUS ? 'disabled' : ''}>${icon('plus', 16)}New list</button>
      <span class="note">${focusCount >= MAX_FOCUS ? `${MAX_FOCUS} lists is the most. Remove one to add another.` : `<span class="mono">${focusCount}/${MAX_FOCUS}</span> lists`}</span></div>
      <label>Day starts at <select id="dayStart">${[0, 2, 3, 4, 5, 6].map(h => `<option value="${h}" ${S.dayStart === h ? 'selected' : ''}>${pad2(h)}:00</option>`).join('')}</select></label>
      <div class="row"><button class="lbtn quiet" id="resetBtn" type="button">Reset demo</button></div>
    </div>`);
    ttBody.innerHTML = parts.join('');
  }
  function rowHtml(t) {
    const d = t.someday ? 0 : (t._depth || 0);
    const ops = t.someday
      ? `<button class="ib" type="button" data-act="today" title="Bring back to today" aria-label="Bring ${esc(t.title)} back to today">${icon('back', 17)}</button>`
      : `<button class="ib" type="button" data-act="up" title="Earlier in the list" aria-label="Move ${esc(t.title)} earlier">${icon('up', 17)}</button>
         <button class="ib" type="button" data-act="down" title="Later in the list" aria-label="Move ${esc(t.title)} later">${icon('down', 17)}</button>`;
    return `<div class="trow" data-id="${t.id}" style="--open:${t.someday ? 76 : 152}px">
      <div class="acts">${t.someday ? '' : `<button class="act br" type="button" data-act="branch" aria-label="Start a branch off ${esc(t.title)}">Branch</button>`}<button class="act del" type="button" data-act="del" aria-label="Delete ${esc(t.title)}">Delete</button></div>
      <div class="slide" style="--ind:${d * 18}px">
        <span class="tw">${d ? `<span class="br">${icon('corner', 15)}</span>` : ''}<input class="title" value="${esc(t.title)}" aria-label="Task name${d ? ', on a branch' : ''}"></span>
        <input class="rule" value="${esc(ruleText(t))}" data-src="${esc(ruleSource(t))}" aria-label="When (type in plain words)">
        <span class="ops">${ops}<button class="ib" type="button" data-act="more" aria-expanded="false" title="Branch or delete (or swipe left)" aria-label="More actions for ${esc(t.title)}">${icon('more', 18)}</button></span>
      </div></div>`;
  }
  function setRowOpen(row, open) {
    ttBody.querySelectorAll('.trow.open').forEach(r => { if (r !== row) { r.classList.remove('open'); const m = r.querySelector('[data-act="more"]'); if (m) m.setAttribute('aria-expanded', 'false'); } });
    if (!row) return;
    row.classList.toggle('open', open);
    const m = row.querySelector('[data-act="more"]'); if (m) m.setAttribute('aria-expanded', String(open));
  }
  ttBody.addEventListener('focusin', e => {
    const r = e.target.closest('input.rule'); if (r) { r.value = r.dataset.src; r.select(); }
    if (e.target.closest('.acts')) setRowOpen(e.target.closest('.trow'), true);    // keyboard reaches Branch / Delete too
  });
  ttBody.addEventListener('focusout', e => {   // restore pretty rule text if nothing changed; close a row the focus left
    const r = e.target.closest && e.target.closest('input.rule');
    if (r) { const t = taskById(r.closest('.trow').dataset.id); if (t && r.value === r.dataset.src) r.value = ruleText(t); }
    const row = e.target.closest && e.target.closest('.trow');
    if (row && row.classList.contains('open') && !row.contains(e.relatedTarget) && e.relatedTarget) setRowOpen(row, false);
  });
  ttBody.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
    if (e.key === 'Escape' && e.target.closest('.trow.open')) { e.stopPropagation(); const row = e.target.closest('.trow'); setRowOpen(row, false); row.querySelector('[data-act="more"]').focus(); }
  });
  ttBody.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'dayStart') { S.dayStart = +el.value; replan({ instant: true }); return; }
    if (el.classList.contains('lname-in')) { const l = S.lines.find(x => x.id === el.closest('.tline').dataset.line); if (l && el.value.trim()) { l.name = el.value.trim(); replan({ instant: true }); renderLegend(); } return; }
    const row = el.closest('.trow'); if (!row) return; const t = taskById(row.dataset.id); if (!t) return;
    if (el.classList.contains('title')) { if (el.value.trim()) { t.title = el.value.trim(); replan({ instant: true }); } return; }
    if (el.classList.contains('rule')) {
      const v = el.value.trim().toLowerCase();
      const p = parse('x ' + v);
      t.repeat = p.repeat; t.time = p.time; t.someday = p.someday; t.date = p.date; t.skip = null; t.anchor = p.anchor && t.line === 'up';
      if (/^once\b/.test(v)) { t.repeat = null; }
      replan({ instant: true });
    }
  });
  ttBody.addEventListener('click', e => {
    if (swipeClick) { swipeClick = false; return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'resetBtn') { resetDemo(); return; }
    if (b.id === 'addLine') {
      if (S.lines.length >= MAX_FOCUS) return;
      const used = S.lines.map(l => l.pal); const pal = [0, 1, 2, 3, 4].find(p => !used.includes(p)) ?? 0;
      const n = Math.max(0, ...S.lines.map(l => +l.code.slice(1))) + 1;
      S.lines.push({ id: 'l' + Date.now().toString(36), code: 'L' + n, name: 'New list', pal });
      replan({ instant: true }); renderLegend();
      const ins = ttBody.querySelectorAll('.lname-in'); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); }
      return;
    }
    const act = b.dataset.act;
    if (act === 'dropline') {
      const id = b.closest('.tline').dataset.line; const l = S.lines.find(x => x.id === id);
      snapshot();
      S.tasks.filter(t => t.line === id).forEach(t => { t.line = 'up'; t.someday = true; });
      S.lines = S.lines.filter(x => x.id !== id);
      replan({ instant: true }); renderLegend();
      toast('✕', `${l.name} list removed. Its tasks are parked under Someday.`, true);
      return;
    }
    const row = b.closest('.trow'); const t = row && taskById(row.dataset.id); if (!t) return;
    if (act === 'more') { const open = !row.classList.contains('open'); setRowOpen(row, open); if (open) row.querySelector('.act').focus(); return; }
    if (act === 'del') { snapshot(); removeTask(t); replan({ instant: true }); toast('✕', `“${t.title}” removed.`, true); }
    if (act === 'branch') { startBranch(t.id); return; }
    if (act === 'today') { t.someday = false; t.date = null; replan(); }
    if (act === 'up' || act === 'down') {
      const sib = S.tasks.filter(x => x.line === t.line && !x.someday && (x.from || null) === (t.from || null) && (x.fork || 0) === (t.fork || 0)).sort((a, b) => a.order - b.order);
      const i = sib.indexOf(t), j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= sib.length) return;
      [t.order, sib[j].order] = [sib[j].order, t.order];
      replan({ instant: true });
      const again = ttBody.querySelector(`[data-id="${t.id}"] [data-act="${act}"]`); if (again) again.focus();
    }
  });
  // swipe a row left to reveal Branch / Delete (touch, pen or mouse)
  let sw = null, swipeClick = false;
  ttBody.addEventListener('pointerdown', e => {
    const slide = e.target.closest('.slide'); if (!slide || e.button !== 0) return;
    const row = slide.closest('.trow');
    sw = { slide, row, id: e.pointerId, x: e.clientX, y: e.clientY, base: row.classList.contains('open') ? -parseFloat(getComputedStyle(row).getPropertyValue('--open')) : 0, dir: null, dx: 0 };
  });
  ttBody.addEventListener('pointermove', e => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.dir) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { sw.dir = 'x'; if (sw.slide.contains(document.activeElement)) document.activeElement.blur(); const sel = getSelection(); if (sel) sel.removeAllRanges(); sw.slide.querySelectorAll('input').forEach(i => { i.scrollLeft = 0; }); try { sw.slide.setPointerCapture(sw.id); } catch (_) {} setRowOpen(sw.row, sw.row.classList.contains('open')); }
      else if (Math.abs(dy) > 8) { sw = null; return; }
    }
    if (sw.dir === 'x') {
      e.preventDefault(); sw.dx = dx;
      const open = parseFloat(getComputedStyle(sw.row).getPropertyValue('--open'));
      sw.slide.style.transform = `translateX(${Math.max(-open - 24, Math.min(0, sw.base + dx))}px)`;
    }
  });
  function endSwipe(e) {
    if (!sw || e.pointerId !== sw.id) return;
    if (sw.dir === 'x') {
      const open = parseFloat(getComputedStyle(sw.row).getPropertyValue('--open'));
      sw.slide.style.transform = '';
      setRowOpen(sw.row, sw.base + sw.dx < -open / 2);
      swipeClick = true; setTimeout(() => { swipeClick = false; }, 0);
    }
    sw = null;
  }
  ttBody.addEventListener('pointerup', endSwipe);
  ttBody.addEventListener('pointercancel', endSwipe);
  ttBody.addEventListener('dragstart', e => { if (sw && sw.dir) e.preventDefault(); });

  document.addEventListener('keydown', e => {
    const inField = e.target.matches && e.target.matches('input, select, textarea');
    if (e.key === 'Escape') {
      if (holdKey) { e.preventDefault(); closeMenu(); return; }
      if (!inField && snap !== 'peek' && !isWide()) { e.preventDefault(); setSnap(snap === 'full' ? 'half' : 'peek'); if (sheetEl.contains(document.activeElement) && snap === 'peek') grab.focus(); return; }
    }
    if (e.key === 'n' && !inField && !holdKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault(); if (snap === 'full' && sheetTab !== 'today') setTab('today'); if (snap === 'peek') setSnap('half'); addInput.focus({ preventScroll: true });
    }
  });

  // ================================================================ HUD: top label, next stop, today's list
  const topDate = document.getElementById('topDate'), topCount = document.getElementById('topCount');
  const nextEl = document.getElementById('next'), todayList = document.getElementById('todayList');
  const DOW_T = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function metaHtml(s, withState) {
    const bits = metaBits(s).map(b => b.mono ? `<span class="mono">${esc(b.v)}</span>` : esc(b.v));
    if (withState) bits.push(esc(stateWord(s)));
    return bits.join(' · ');
  }
  function metaText(s) { return [metaFor(s), stateWord(s)].filter(Boolean).join(' · '); }
  function checkHtml(s, kind) {
    const l = s.line, style = `--c:${l.color};--tint:${l.tint}`;
    if (kind === 'done') return `<span class="check is-done" style="${style}" aria-hidden="true"><span class="box">${TICK}</span></span>`;
    return `<button class="check ${kind}" type="button" data-done="${s.key}" style="${style}" ${kind === 'enroute' ? 'disabled' : ''} aria-label="${kind === 'locked' ? 'Done early' : 'Done'}: ${esc(s.t.title)}"><span class="box">${TICK}</span></button>`;
  }
  // Ticking a checkbox is the signature moment: fill, draw the check, then the map follows.
  let ticking = false;
  function tickThen(btn, key) {
    if (ticking || !btn || btn.classList.contains('ticking')) return;
    if (RM) { activate(key); return; }
    ticking = true; btn.classList.add('ticking');
    setTimeout(() => { ticking = false; activate(key); }, 380);
  }
  let nextSig = '';
  function renderNext(st, doneN) {
    const open = st.filter(s => vstate(s.key) === 'open');
    const m = minutesNow();
    const timed = open.filter(s => s.t.time && toMin(s.t.time) - m > -30).sort((a, b) => toMin(a.t.time) - toMin(b.t.time))[0];
    let html, sig, quiet = false;
    if (st.length && doneN === st.length) {
      sig = 'complete' + st.length;
      html = `<span class="check is-done" style="--c:#2F7CF6" aria-hidden="true"><span class="box">${TICK}</span></span><div class="txt"><div class="nm">All done for today</div><div class="tm"><span class="mono">${st.length}/${st.length}</span> tasks ticked off</div></div>`;
    } else if (timed || open.length) {
      const s = timed || open[0], l = s.line;
      const others = open.length - 1;
      let tm = `<span class="ldot" style="background:${l.color}"></span>${esc(l.name)}`;
      if (s.t.time) {
        const d = toMin(s.t.time) - m;
        const when = d > 0 ? (d >= 60 ? `in ${Math.floor(d / 60)}h ${pad2(d % 60)}` : `in ${d} min`) : 'now';
        tm += ` · <span class="mono">${s.t.time}</span> ${when}`;
      }
      sig = s.key + '|' + tm + '|' + others;
      html = `<button class="check" type="button" data-key="${s.key}" style="--c:${l.color};--tint:${l.tint}" aria-label="Done: ${esc(s.t.title)}"><span class="box">${TICK}</span></button>
        <div class="txt"><div class="nm"></div><div class="tm">${tm}</div></div>${others > 0 ? `<button class="more" type="button" data-open aria-label="Show all ${others + 1} ready tasks">+${others}</button>` : ''}`;
    } else {
      const approaching = anims.length > 0;
      quiet = true;
      sig = approaching ? 'approach' : (st.length ? 'wait' : 'none');
      html = `<span class="check wait" aria-hidden="true"><span class="box"></span></span><div class="txt">
        <div class="nm">${approaching ? 'Opening next…' : st.length ? 'Nothing ready right now' : 'Nothing planned today'}</div>
        <div class="tm">${approaching ? 'Ready in a moment' : st.length ? 'Pull up for the plan' : 'Add a task below'}</div></div>`;
    }
    if (sig === nextSig) return;
    const hadFocus = nextEl.contains(document.activeElement);
    nextSig = sig; nextEl.innerHTML = html; nextEl.classList.toggle('quiet', quiet);
    nextEl.style.animation = 'none'; void nextEl.offsetWidth; nextEl.style.animation = '';
    const nm = nextEl.querySelector('.nm:empty'); if (nm) nm.textContent = NET.byKey[sig.split('|')[0]].t.title;
    if (hadFocus) { const b = nextEl.querySelector('button'); (b || grab).focus({ preventScroll: true }); }
  }
  nextEl.addEventListener('click', e => {
    if (e.target.closest('[data-open]')) { setTab('today'); setSnap('half'); return; }
    const b = e.target.closest('.check[data-key]'); if (b) tickThen(b, b.dataset.key);
  });

  function rowFor(s, kind) {
    const l = s.line;
    const meta = `<span class="ldot" style="background:${l.color}"></span>${esc(l.name)}${metaFor(s) ? ' · ' + metaHtml(s) : ''}${kind === 'enroute' ? ' · Opening next' : ''}${countdown(s) ? ' · ' + countdown(s) : ''}`;
    return `<div class="srow ${kind === 'enroute' ? 'locked' : kind}">${checkHtml(s, kind)}
      <button class="main" type="button" data-hold="${s.key}" aria-label="${esc(s.t.title)}, ${esc(l.name)}, ${esc(metaText(s).toLowerCase())}. Open task actions."><span class="tx"><span class="t">${esc(s.t.title)}</span><span class="m">${meta}</span></span>${icon('more', 18)}</button></div>`;
  }
  function renderToday(st) {
    const groups = { open: [], ahead: [], done: [] };
    st.forEach(s => { const v = vstate(s.key); if (v === 'done') groups.done.push(s); else if (v === 'open') groups.open.push(s); else groups.ahead.push(s); });
    const active = document.activeElement, focusSel = todayList.contains(active) ? (active.dataset.done ? `[data-done="${active.dataset.done}"]` : active.dataset.hold ? `[data-hold="${active.dataset.hold}"]` : null) : null;
    const m = minutesNow();
    const lead = groups.open.filter(s => s.t.time && toMin(s.t.time) - m > -30).sort((a, b) => toMin(a.t.time) - toMin(b.t.time))[0] || groups.open[0];
    if (lead) groups.open = [lead, ...groups.open.filter(s => s !== lead)];
    todayList.innerHTML = `
      <section class="grp"><h3>Ready now <span class="n">${groups.open.length}</span></h3>
        ${groups.open.length ? groups.open.map((s, i) => rowFor(s, 'open').replace('class="srow open"', i === 0 ? 'class="srow open first"' : 'class="srow open"')).join('') : `<p class="empty">${st.length && !groups.ahead.length ? 'All done for today.' : anims.length ? 'Opening next…' : 'Nothing ready right now.'}</p>`}</section>
      ${groups.ahead.length + groups.done.length ? `<button class="morebtn" type="button" data-full><span>${groups.ahead.length} coming up · ${groups.done.length} done</span>${icon('chevUp', 18)}</button>` : ''}
      <section class="grp more"><h3>Later <span class="n">${groups.ahead.length}</span></h3>
        ${groups.ahead.length ? groups.ahead.map(s => rowFor(s, LS[s.key] === 'avail' ? 'enroute' : 'locked')).join('') : '<p class="empty">Nothing waiting.</p>'}</section>
      <section class="grp more"><h3>Done <span class="n">${groups.done.length}</span></h3>
        ${groups.done.length ? groups.done.map(s => rowFor(s, 'done')).join('') : '<p class="empty">Nothing yet. The first one is the hardest.</p>'}</section>`;
    if (focusSel) { const el = todayList.querySelector(focusSel); (el || addInput).focus({ preventScroll: true }); }
  }
  todayList.addEventListener('click', e => {
    const d = e.target.closest('[data-done]'); if (d) { tickThen(d, d.dataset.done); return; }
    if (e.target.closest('[data-full]')) { setSnap('full'); setTab('today'); return; }
    const h = e.target.closest('[data-hold]'); if (h) openMenu(h.dataset.hold);
  });
  todayList.addEventListener('contextmenu', e => { const h = e.target.closest('[data-hold]'); if (h) { e.preventDefault(); openMenu(h.dataset.hold); } });

  function refreshHud() {
    const st = NET.stations.filter(s => s.t && !s.old);
    const doneN = st.filter(s => isDone(s.t, TODAY)).length;
    const d = parseYmd(TODAY);
    topDate.textContent = `${DOW_T[d.getDay()]} ${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
    topCount.textContent = `${doneN}/${st.length}`;
    topCount.setAttribute('aria-label', `${doneN} of ${st.length} tasks done`);
    document.getElementById('sDate').textContent = topDate.textContent;
    const sc = document.getElementById('sCount'); sc.textContent = `${doneN}/${st.length}`; sc.setAttribute('aria-label', `${doneN} of ${st.length} tasks done`);
    renderNext(st, doneN);
    renderToday(st);
    allLines().forEach(l => {
      const el = document.getElementById('cnt-' + l.id); if (!el) return;
      const all = st.filter(s => s.line.id === l.id);
      el.textContent = `${all.filter(s => isDone(s.t, TODAY)).length}/${all.length}`;
    });
  }

  // ================================================================ key tab
  const linesBox = document.getElementById('lines');
  function renderLegend() {
    linesBox.innerHTML = '';
    allLines().forEach(l => {
      const row = document.createElement('div'); row.className = 'lrow';
      row.innerHTML = `<span class="bar" style="background:${l.color}"></span><span class="lname"></span><span class="cnt" id="cnt-${l.id}"></span>`;
      row.querySelector('.lname').textContent = l.name;
      linesBox.appendChild(row);
    });
    refreshHud(true);
  }

  // ================================================================ undo bar (lives in the peek area) + live region
  const undoBar = document.getElementById('undoBar'), undoTag = document.getElementById('undoTag'), undoMsg = document.getElementById('undoMsg');
  const live = document.getElementById('live');
  let toastTimer = null;
  const TAG_ICON = { '✓': 'check', 'GO': 'check', 'EXPRESS': 'arrow', '↺': 'undo', '✕': 'trash', '→': 'arrow', '+': 'plus', '?': 'info', 'NEW': 'undo', 'NEW DAY': 'sun' };
  // The notice floats beside the sheet (never over the next stop): next to the card on desktop, just above the sheet on phones.
  function placeNotice() {
    if (!undoBar) return;
    const st = undoBar.style;
    if (isDesk()) { st.left = (16 + CARD_W + 16) + 'px'; st.right = 'auto'; st.width = Math.min(380, W - CARD_W - 120) + 'px'; st.bottom = '20px'; st.top = 'auto'; }
    else if (sp.h > H * 0.6) { st.left = '12px'; st.right = '12px'; st.width = 'auto'; st.top = '52px'; st.bottom = 'auto'; }
    else {
      st.left = '12px'; st.right = '12px'; st.width = 'auto'; st.bottom = (sp.h + 10) + 'px'; st.top = 'auto';
      // phones: while a notice shows above the sheet, the map controls step up above it
      if (undoBar.classList.contains('show')) ctrlEl.style.bottom = (sp.h + 10 + undoBar.offsetHeight + 10) + 'px';
    }
  }
  function toast(tag, msg, canUndo) {
    const num = /^[+\d]/.test(tag) && tag !== '+';
    undoTag.className = 'tg' + (num ? ' num' : (tag === '✕' || tag === '?' || tag === '↺' ? ' neutral' : ''));
    undoTag.innerHTML = num ? esc(tag) : icon(TAG_ICON[tag] || 'check', 16);
    undoMsg.textContent = msg;
    const can = !!canUndo && !!undoSnap;
    undoBar.classList.toggle('can-undo', can);
    undoBar.classList.remove('show'); void undoBar.offsetWidth; undoBar.classList.add('show'); placeNotice();
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, can ? 8000 : 3200);
    say(msg);
  }
  function hideToast() {
    const hadFocus = undoBar.contains(document.activeElement);
    undoBar.classList.remove('show'); undoSnap = null; applyH(sp.h);   // controls drop back down
    if (hadFocus) { const b = nextEl.querySelector('button'); (b || grab).focus({ preventScroll: true }); }
  }
  document.getElementById('undoBtn').addEventListener('click', () => { clearTimeout(toastTimer); undoBar.classList.remove('show'); applyH(sp.h); undo(); });
  document.body.appendChild(undoBar);   // lives outside the sheet so it never covers the next stop
  function say(msg) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); }

  // ================================================================ accessible station list
  const list = document.getElementById('a11y');
  function renderList() {
    list.innerHTML = '';
    const st = NET.stations.filter(s => s.t);
    st.forEach((s, ix) => {
      const li = document.createElement('li'); const b = document.createElement('button');
      b.type = 'button'; b.dataset.key = s.key;
      const v = vstate(s.key);
      const desc = v === 'done' ? 'done' : (v === 'open' || LS[s.key] === 'avail') ? 'ready, press Enter to finish' : 'coming up, press Enter to finish it anyway';
      b.textContent = `${s.line.name}: ${s.t.title}${s.t.time ? ' at ' + s.t.time : ''}${s.t.repeat ? ', repeats ' + repeatShort(s.t.repeat).toLowerCase() : ''}: ${desc}. Press M for more.`;
      b.addEventListener('click', () => activate(s.key));
      b.addEventListener('focus', () => { focusedKey = s.key; ensureVisible(s.key); });
      b.addEventListener('blur', () => { if (focusedKey === s.key) focusedKey = null; });
      b.addEventListener('keydown', e => {
        let n = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = st[(ix + 1) % st.length];
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = st[(ix - 1 + st.length) % st.length];
        if (n) { e.preventDefault(); const nb = list.querySelector(`[data-key="${n.key}"]`); if (nb) nb.focus(); }
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10') || e.key === 'm') { e.preventDefault(); openMenu(s.key); }
      });
      li.appendChild(b); list.appendChild(li);
    });
  }

  // ================================================================ pointer input: tap = finish, hold = options, drag = pan
  function hit(sx, sy) {
    if (NET.vertical && sy < headTop() + HEAD_V) return null;   // the column-name row sits over the map
    const [wx, wy] = toWorld(sx, sy);
    const rad = Math.max(20, 16 / cam.s);
    let best = null, bd = Infinity;
    NET.stations.forEach(s => { if (!s.t) return; const d = Math.hypot(wx - s.x, wy - s.y); if (d < rad && d < bd) { bd = d; best = s.key; } });
    if (best) return best;
    for (const s of NET.stations) {
      if (!s.t) continue;
      const r = labelRects[s.key];
      if (r && wx >= r[0] && wx <= r[0] + r[2] && wy >= r[1] && wy <= r[1] + r[3]) return s.key;
    }
    return null;
  }
  const pts = new Map();
  let drag = null, pinch = null, holdTimer = null;
  cv.addEventListener('pointerdown', e => {
    if (swallowPtr) { swallowPtr = false; return; }
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      drag = { x: e.clientX, y: e.clientY, ox: cam.ox, oy: cam.oy, moved: false, held: false };
      const key = e.button === 0 ? hit(e.clientX, e.clientY) : null;
      clearTimeout(holdTimer);
      if (key) holdTimer = setTimeout(() => { if (drag && !drag.moved) { drag.held = true; if (navigator.vibrate) navigator.vibrate(12); openMenu(key, e.clientX, e.clientY); } }, 480);
    }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: cam.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ox: cam.ox, oy: cam.oy };
      if (drag) drag.moved = true; clearTimeout(holdTimer);
    }
  });
  cv.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const ns = clampS(pinch.s * d / pinch.d);
      const wx = (pinch.mx - pinch.ox) / pinch.s, wy = (pinch.my - pinch.oy) / pinch.s;
      cam.s = ns; cam.ox = mx - wx * ns; cam.oy = my - wy * ns; userMoved = true; camTarget = null;
      return;
    }
    if (drag && pts.has(e.pointerId)) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; clearTimeout(holdTimer); cv.classList.add('dragging'); }
      if (drag.moved) {
        if (NET.vertical) { const L = camLimits(cam.s); cam.ox = rubber(drag.ox + dx, L.minOx, L.maxOx); cam.oy = rubber(drag.oy + dy, L.minOy, L.maxOy); }
        else { cam.ox = drag.ox + dx; cam.oy = drag.oy + dy; }
        userMoved = true; camTarget = null;
      }
      return;
    }
    if (e.pointerType === 'mouse') { hoverKey = hit(e.clientX, e.clientY); cv.style.cursor = hoverKey ? 'pointer' : ''; }
  });
  function endPtr(e, cancel) {
    const wasDrag = drag;
    pts.delete(e.pointerId); clearTimeout(holdTimer);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      cv.classList.remove('dragging');
      if (NET.vertical && wasDrag && wasDrag.moved) { const c = clampCam(cam); if (c.ox !== cam.ox || c.oy !== cam.oy) camTarget = c; }   // spring back
      if (!cancel && wasDrag && !wasDrag.moved && !wasDrag.held && e.button === 0) { const key = hit(e.clientX, e.clientY); if (key) activate(key); }
      drag = null;
    }
  }
  cv.addEventListener('pointerup', e => endPtr(e, false));
  cv.addEventListener('pointercancel', e => endPtr(e, true));
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag) hoverKey = null; });
  cv.addEventListener('contextmenu', e => { e.preventDefault(); const key = hit(e.clientX, e.clientY); if (key) openMenu(key, e.clientX, e.clientY); });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (NET.vertical && !e.ctrlKey) { Object.assign(cam, clampCam({ s: cam.s, ox: cam.ox - e.deltaX, oy: cam.oy - e.deltaY })); userMoved = true; camTarget = null; return; }
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  function viewCenter() { const v = mapView(); return [(v.left + v.right) / 2, (v.top + v.bottom) / 2]; }
  document.getElementById('fitBtn').addEventListener('click', () => { camTarget = fitCam(); userMoved = true; });
  document.getElementById('zoomIn').addEventListener('click', () => zoomAt(...viewCenter(), 1.25));
  document.getElementById('zoomOut').addEventListener('click', () => zoomAt(...viewCenter(), 0.8));
  function resetDemo() {
    snapshot(); S = seed(); arrived.clear(); anims = []; userMoved = false;
    replan({ instant: true }); renderLegend(); initialView();
    toast('NEW', 'Demo plan restored.', true);
  }
  window.addEventListener('resize', () => { setTimeout(() => {
    const wasPinned = document.body.classList.contains('pinned');
    document.body.classList.toggle('pinned', isWide());
    setSnap(wasPinned && !isWide() ? 'peek' : snap, { instant: true });
    if (!userMoved) initialView();
  }, 90); });
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 60); });

  // ---- clock: countdowns tick, and at day start the map quietly rebuilds for the new day
  setInterval(() => {
    if (serviceDay() !== TODAY) { arrived.clear(); anims = []; replan({ instant: true }); toast('NEW DAY', 'Fresh map for today. Yesterday is done with.'); }
    else refreshHud();
  }, 20000);

  // ================================================================ boot
  W = window.innerWidth; H = window.innerHeight;
  build(); LS = lineStates(); seedArrived();
  resize(); initialView();
  document.body.classList.toggle('pinned', isWide());
  setSnap('peek', { instant: true }); renderLegend(); renderList(); refreshHud(true); renderChips();
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('600 13.5px Figtree'), document.fonts.load('500 11px Figtree'), document.fonts.load('400 12px "Geist Mono"')]).then(() => { if (!userMoved) initialView(); }).catch(() => {});
  }
  function frame(now) { update(now); draw(now); requestAnimationFrame(frame); }
  // Trains must always arrive, even if animation frames are throttled (background tab, battery saver).
  setInterval(() => { if (anims.length) update(performance.now()); }, 250);
  requestAnimationFrame(frame);
}
