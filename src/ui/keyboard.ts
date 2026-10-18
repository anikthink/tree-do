// Global keys: Esc steps the sheet down (or closes the hold menu); N jumps to the add field.
import type { App } from '../app/context';
import type { Snap, Store } from '../app/store';
import { isWide } from '../app/viewport';
import { elementOf, type Dom } from './dom';

export function installKeyboard(store: Store, dom: Dom, app: App): void {
  const st = store.state, sheet = st.sheet;
  const snapNow = (): Snap => sheet.snap;
  document.addEventListener('keydown', e => {
    const inField = !!elementOf(e.target)?.matches('input, select, textarea');
    if (e.key === 'Escape') {
      if (st.hold.key) { e.preventDefault(); app.closeMenu(); return; }
      if (!inField && sheet.snap !== 'peek' && !isWide(st.view)) {
        e.preventDefault(); app.setSnap(sheet.snap === 'full' ? 'half' : 'peek');
        if (dom.sheet.contains(document.activeElement) && snapNow() === 'peek') dom.grab.focus();   // setSnap just changed it
        return;
      }
    }
    if (e.key === 'n' && !inField && !st.hold.key && !e.metaKey && !e.ctrlKey) {
      e.preventDefault(); if (sheet.snap === 'peek') app.setSnap('half'); dom.scroll.scrollTop = 0; dom.addInput.focus({ preventScroll: true });
    }
  });
}
