// The notice / undo bar (floats beside the sheet, never over the next task) and the screen-reader live region.
import type { App } from '../app/context';
import type { Store } from '../app/store';
import { CARD_W, isDesk } from '../app/viewport';
import { esc, focusEl, type Dom } from './dom';
import { icon, type IconName } from './icons';

const TAG_ICON: Record<string, IconName | undefined> = { '✓': 'check', 'GO': 'check', 'EXPRESS': 'arrow', '↺': 'undo', '✕': 'trash', '→': 'arrow', '+': 'plus', '?': 'info', 'NEW': 'undo', 'NEW DAY': 'sun' };

export function createNotice(store: Store, dom: Dom, app: App) {
  const st = store.state, view = st.view, sp = st.sheet.spring;
  const { undoBar, undoTag, undoMsg, ctrl, live } = dom;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  // The notice floats beside the sheet (never over the next stop): next to the card on desktop, just above the sheet on phones.
  function placeNotice(): void {
    const s = undoBar.style;
    if (isDesk(view)) { s.left = (16 + CARD_W + 16) + 'px'; s.right = 'auto'; s.width = Math.min(380, view.W - CARD_W - 120) + 'px'; s.bottom = '20px'; s.top = 'auto'; }
    else if (sp.h > view.H * 0.6) { s.left = '12px'; s.right = '12px'; s.width = 'auto'; s.top = '52px'; s.bottom = 'auto'; }
    else {
      s.left = '12px'; s.right = '12px'; s.width = 'auto'; s.bottom = (sp.h + 10) + 'px'; s.top = 'auto';
      // phones: while a notice shows above the sheet, the map controls step up above it
      if (undoBar.classList.contains('show')) ctrl.style.bottom = (sp.h + 10 + undoBar.offsetHeight + 10) + 'px';
    }
  }
  function say(msg: string): void { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); }
  function toast(tag: string, msg: string, canUndo?: boolean): void {
    const num = /^[+\d]/.test(tag) && tag !== '+';
    undoTag.className = 'tg' + (num ? ' num' : (tag === '✕' || tag === '?' || tag === '↺' ? ' neutral' : ''));
    undoTag.innerHTML = num ? esc(tag) : icon(TAG_ICON[tag] || 'check', 16);
    undoMsg.textContent = msg;
    const can = !!canUndo && !!st.undoSnap;
    undoBar.classList.toggle('can-undo', can);
    undoBar.classList.remove('show'); void undoBar.offsetWidth; undoBar.classList.add('show'); placeNotice();
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, can ? 8000 : 3200);
    say(msg);
  }
  function hideToast(): void {
    const hadFocus = undoBar.contains(document.activeElement);
    undoBar.classList.remove('show'); st.undoSnap = null; app.applyH(sp.h);   // controls drop back down
    if (hadFocus) focusEl(dom.next.querySelector('button') || dom.grab);
  }
  dom.undoBtn.addEventListener('click', () => { clearTimeout(toastTimer); undoBar.classList.remove('show'); app.applyH(sp.h); app.undo(); });
  document.body.appendChild(undoBar);   // lives outside the sheet so it never covers the next stop

  return { toast, say, placeNotice };
}
