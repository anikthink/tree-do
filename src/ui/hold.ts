// Hold a task (or right-click): the sheet becomes that task's actions.
import type { App, CloseOpts, MoveKind } from '../app/context';
import type { Store } from '../app/store';
import { isDesk } from '../app/viewport';
import { vstate } from '../map/status';
import { closestEl, esc, focusEl, type Dom } from './dom';
import { metaHtml } from './format';
import { icon, type IconName } from './icons';

type MenuKey = MoveKind | 'done' | 'branch' | 'edit';
const MOVES: readonly MoveKind[] = ['later', 'tomorrow', 'someday', 'undone', 'delete'];
const asMove = (k: string | undefined): MoveKind | null => MOVES.find(m => m === k) ?? null;

export function createHoldMenu(store: Store, dom: Dom, app: App) {
  const st = store.state, hold = st.hold;
  const { sheet: sheetEl, holdHead, hacts } = dom;

  function openMenu(key: string): void {
    const s = st.map.byKey[key]; if (!s || !s.t) return;
    if (!hold.key) { hold.prev = st.sheet.snap; hold.returnTo = document.activeElement; }
    hold.key = key;
    const t = s.t, v = vstate(st, key), l = s.line;
    const items: [MenuKey, string, IconName, string, string][] = [];
    if (v === 'done') items.push(['undone', 'Not done yet', 'undo', 'primary', 'Reopen it']);
    else items.push(['done', v === 'locked' ? 'Do it now (skip ahead)' : 'Done', 'check', 'primary', v === 'locked' ? 'Tasks before it stay open' : '']);
    if (v !== 'done') {
      items.push(['later', 'Later today', 'later', '', 'End of its list']);
      items.push(['tomorrow', t.repeat ? 'Skip today' : 'Tomorrow', 'calendar', '', t.repeat ? 'Back tomorrow' : '']);
      items.push(['someday', t.repeat ? 'Pause' : 'Someday', t.repeat ? 'pause' : 'archive', '', '']);
    }
    items.push(['branch', 'Branch from here', 'branch', '', '']);
    items.push(['edit', 'Edit in plan', 'list', '', '']);
    items.push(['delete', 'Delete', 'trash', 'danger', '']);
    dom.hrule.style.background = l.color;
    holdHead.innerHTML = `<div class="txt"><span class="lpill" style="background:${l.tint};color:${l.text}"><span class="ldot" style="background:${l.color}"></span>${esc(l.name)}</span>
      <div class="t"></div><div class="m">${metaHtml(st, s, true)}</div></div>
      <button class="hclose" type="button" aria-label="Close task actions">${icon('close', 16)}</button>`;
    const title = holdHead.querySelector('.t'); if (title) title.textContent = t.title;
    hacts.innerHTML = items.map(([k, label, ic, cls, sub]) =>
      `${k === 'delete' ? '<div class="hsep" role="separator"></div>' : ''}<button type="button" role="menuitem" class="hact ${cls}" data-k="${k}"><span class="ic">${icon(ic, 20)}</span>${label}${sub ? `<span class="sub">${sub}</span>` : ''}</button>`).join('');
    sheetEl.classList.add('mode-hold'); sheetEl.classList.remove('is-full');
    app.setSnap('half');
    focusEl(hacts.querySelector('button'));
    if (!isDesk(st.view)) app.ensureVisible(key);
    app.say(`${t.title}. Task actions.`);
  }
  function closeMenu(opts: CloseOpts = {}): void {
    if (!hold.key) return;
    hold.key = null; sheetEl.classList.remove('mode-hold');
    app.setSnap(opts.to || hold.prev, { v: opts.v });
    const back = hold.returnTo;
    if (opts.focus !== false && back && document.contains(back) && back !== document.body) focusEl(back);
  }
  dom.hold.addEventListener('click', e => {
    if (closestEl(e.target, '.hclose')) { closeMenu(); return; }
    const b = closestEl(e.target, '.hact'); if (!b) return;
    const key = hold.key, k = b.dataset.k;
    if (!key) return;
    if (k === 'edit') { closeMenu({ focus: false, to: 'full' }); app.openTimetable(key); return; }
    if (k === 'branch') { closeMenu({ focus: false, to: 'half' }); app.startBranch(key); return; }
    closeMenu();
    const how = asMove(k);
    if (k === 'done') app.activate(key); else if (how) app.move(key, how);
  });
  hacts.addEventListener('keydown', e => {
    const bs = [...hacts.querySelectorAll('button')]; const i = bs.findIndex(b => b === document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  });
  // tapping anywhere outside the sheet puts the actions away (and that tap does nothing else)
  document.addEventListener('pointerdown', e => {
    const tg = e.target instanceof Node ? e.target : null;
    if (hold.key && !sheetEl.contains(tg)) { hold.swallowPtr = tg === dom.map; closeMenu({ focus: false }); }
  }, true);

  return { openMenu, closeMenu };
}
