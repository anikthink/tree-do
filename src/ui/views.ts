// The header's view tabs: Today, Plan and Key.
import type { App } from '../app/context';
import type { Store, Tab } from '../app/store';
import type { Dom } from './dom';

const tabOf = (b: HTMLElement): Tab => (b.dataset.tab === 'tt' ? 'tt' : b.dataset.tab === 'key' ? 'key' : 'today');

export function createViews(store: Store, dom: Dom, app: App) {
  const st = store.state, tabBtns = dom.tabBtns;
  function setTab(tab: Tab): void {
    st.sheet.tab = tab; dom.sheet.dataset.tab = tab;
    tabBtns.forEach(b => { const on = tabOf(b) === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    if (tab === 'tt') app.renderTimetable();
    dom.scroll.scrollTop = 0;
  }
  tabBtns.forEach((b, i) => {
    // views live in the header: Plan and Key open the panel fully; Today opens it to the list
    b.addEventListener('click', () => {
      const t = tabOf(b);
      if (st.hold.key) app.closeMenu({ focus: false });
      setTab(t);
      if (t !== 'today' && st.sheet.snap !== 'full') app.setSnap('full');
      else if (t === 'today' && st.sheet.snap === 'peek') app.setSnap('half');
    });
    b.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
      e.preventDefault(); const nb = tabBtns[(i + d + tabBtns.length) % tabBtns.length]; setTab(tabOf(nb)); nb.focus();
    });
  });
  return { setTab };
}
