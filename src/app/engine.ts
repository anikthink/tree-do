// Tree-do engine: the composition root. It loads the plan into the store, builds the map and the panel
// modules, wires them together and runs the frame loop. React (App.tsx) hosts the shell and calls startTreeDo().
import { buildNetwork, lineStates } from '../domain/network';
import { seed } from '../domain/seed';
import { clockFromQuery, serviceDay } from '../domain/time';
import { createCamera } from '../map/camera';
import { createRenderer } from '../map/draw';
import { installMapInput } from '../map/input';
import { layoutMap } from '../map/layout';
import { finishTrains, seedArrived } from '../map/trains';
import { loadState, loadView, saveState } from '../storage/local';
import { createA11yList } from '../ui/a11y';
import { createAddField } from '../ui/add';
import { getDom } from '../ui/dom';
import { createHoldMenu } from '../ui/hold';
import { installKeyboard } from '../ui/keyboard';
import { createKeyView } from '../ui/key';
import { createNotice } from '../ui/notice';
import { createPlanView } from '../ui/plan';
import { createSheet } from '../ui/sheet';
import { createTodayView } from '../ui/today';
import { createViews } from '../ui/views';
import { createWeekView } from '../ui/week';
import { createActions } from './actions';
import type { App } from './context';
import { createStore, initialState } from './store';
import { isVertical, isWide, measureSafeInsets } from './viewport';

let started = false;

export function startTreeDo(): void {
  if (started) return;            // React StrictMode mounts twice in dev; the engine owns global listeners
  started = true;

  // ---- state: the saved plan (or the sample day) in one store; saving listens for plan changes
  const clock = clockFromQuery(location.search);
  const plan = loadState() ?? seed(serviceDay(4, clock()));
  const reducedMotion = !!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = createStore(initialState(plan, clock, reducedMotion, loadView()));
  store.subscribe(change => { if (change === 'plan') saveState(store.state.plan); });
  const st = store.state, view = st.view;

  /** Rebuild today's network and map from the plan. */
  function rebuild(): void {
    st.today = serviceDay(st.plan.dayStart, st.clock());
    st.net = buildNetwork(st.plan, st.today);
    st.map = layoutMap(st.net, isVertical(window.innerWidth, window.innerHeight));
    st.states = lineStates(st.net, st.today);
  }

  // ---- modules, wired through `app` (each call is resolved when it runs, so creation order doesn't matter)
  const dom = getDom();
  const ctx = dom.map.getContext('2d');
  if (!ctx) throw new Error('Tree-do: canvas 2D is not available');
  const safe = measureSafeInsets();
  view.safeT = safe.top; view.safeB = safe.bottom;

  const app: App = {
    replan: o => actions.replan(o), snapshot: () => actions.snapshot(), undo: () => actions.undo(),
    activate: k => actions.activate(k), move: (k, how) => actions.move(k, how), place: (id, to, w) => actions.place(id, to, w),
    resetDemo: () => actions.resetDemo(), addAt: (text, slot, line) => actions.addAt(text, slot, line), edit: (id, e) => actions.edit(id, e),
    setSnap: (n, o) => sheet.setSnap(n, o), setTab: t => views.setTab(t), applyH: h => sheet.applyH(h),
    sheetH: () => sheet.sheetH(), sheetExpanded: () => sheet.sheetExpanded(),
    refreshHud: () => today.refreshHud(), renderList: () => a11y.renderList(), renderLegend: () => key.renderLegend(),
    renderChips: () => add.renderChips(), renderTimetable: () => planView.renderTimetable(), renderWeek: () => week.render(), ttOpen: () => planView.ttOpen(),
    openTimetable: id => planView.openTimetable(id), openMenu: k => hold.openMenu(k), closeMenu: o => hold.closeMenu(o),
    startBranch: k => add.startBranch(k), toast: (tag, msg, u) => notice.toast(tag, msg, u), say: m => notice.say(m),
    placeNotice: () => notice.placeNotice(),
    ensureVisible: k => camera.ensureVisible(k), keepStartClear: i => camera.keepStartClear(i), initialView: () => camera.initialView(),
  };
  const actions = createActions(store, app, rebuild);
  const camera = createCamera(store, { expanded: () => sheet.sheetExpanded(), height: () => sheet.sheetH() });
  const renderer = createRenderer(store, ctx);
  const sheet = createSheet(store, dom, app);
  const views = createViews(store, dom, app);
  const add = createAddField(store, dom, app);
  const hold = createHoldMenu(store, dom, app);
  const planView = createPlanView(store, dom, app);
  installKeyboard(store, dom, app);
  const today = createTodayView(store, dom, app);
  const key = createKeyView(store, dom, app);
  const notice = createNotice(store, dom, app);
  const a11y = createA11yList(store, dom, app);
  const week = createWeekView(store, dom, app);
  installMapInput(store, dom, camera, renderer.labelRects, app);

  // ---- viewport
  function resize(): void {
    const wasVertical = st.map.vertical;
    view.dpr = Math.min(window.devicePixelRatio || 1, 3);
    view.W = window.innerWidth; view.H = window.innerHeight;
    dom.map.width = Math.round(view.W * view.dpr); dom.map.height = Math.round(view.H * view.dpr);
    if (isVertical(window.innerWidth, window.innerHeight) !== wasVertical) { rebuild(); st.anims = []; st.userMoved = false; }
    if (!st.userMoved) camera.initialView();
  }
  window.addEventListener('resize', () => { setTimeout(() => {
    const wasPinned = document.body.classList.contains('pinned');
    document.body.classList.toggle('pinned', isWide(view));
    sheet.setSnap(wasPinned && !isWide(view) ? 'peek' : st.sheet.snap, { instant: true });
    if (!st.userMoved) camera.initialView();
  }, 90); });
  let rt: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 60); });

  // ---- clock: countdowns tick, and at day start the map quietly rebuilds for the new day
  setInterval(actions.tick, 20000);

  // ---- frame loop
  function arrive(k: string, now: number): void {
    st.arrived.add(k);
    const s = st.map.byKey[k];
    if (s) st.dings.push({ x: s.x, y: s.y, color: s.line.color, t0: now, big: true });
    today.refreshHud();
  }
  function update(now: number): void {
    finishTrains(st, now, arrive);
    camera.step();
  }

  // ---- boot
  view.W = window.innerWidth; view.H = window.innerHeight;
  rebuild(); seedArrived(st);
  resize(); camera.initialView();
  document.body.classList.toggle('pinned', isWide(view));
  sheet.setSnap('peek', { instant: true }); key.renderLegend(); a11y.renderList(); today.refreshHud(); add.renderChips(); week.setMode(st.week.mode);
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('600 13.5px Figtree'), document.fonts.load('500 11px Figtree'), document.fonts.load('400 12px "Geist Mono"')]).then(() => { if (!st.userMoved) camera.initialView(); }).catch(() => {});
  }
  function frame(now: number): void { update(now); renderer.draw(now); requestAnimationFrame(frame); }
  // Trains must always arrive, even if animation frames are throttled (background tab, battery saver).
  setInterval(() => { if (st.anims.length) update(performance.now()); }, 250);
  requestAnimationFrame(frame);
}
