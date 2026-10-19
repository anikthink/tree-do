// The hidden, keyboard- and screen-reader-friendly list of today's tasks (mirrors the map).
import type { App } from '../app/context';
import type { Store } from '../app/store';
import { repeatShort } from '../domain/parse';
import { timeRange } from '../domain/time';
import { vstate } from '../map/status';
import type { Dom } from './dom';

export function createA11yList(store: Store, dom: Dom, app: App) {
  const st = store.state, list = dom.a11y;
  function renderList(): void {
    list.innerHTML = '';
    const stations = st.map.stations.filter(s => s.t);
    stations.forEach((s, ix) => {
      const t = s.t; if (!t) return;
      const li = document.createElement('li'); const b = document.createElement('button');
      b.type = 'button'; b.dataset.key = s.key;
      const v = vstate(st, s.key);
      const desc = v === 'done' ? 'done' : (v === 'open' || st.states[s.key] === 'avail') ? 'ready, press Enter to finish' : 'coming up, press Enter to finish it anyway';
      b.textContent = `${s.line.name}: ${t.title}${t.time ? ' at ' + timeRange(t.time, t.duration).replace('–', ' to ') : ''}${t.repeat ? ', repeats ' + repeatShort(t.repeat).toLowerCase() : ''}: ${desc}. Press M for more.`;
      b.addEventListener('click', () => app.activate(s.key));
      b.addEventListener('focus', () => { st.focusedKey = s.key; app.ensureVisible(s.key); });
      b.addEventListener('blur', () => { if (st.focusedKey === s.key) st.focusedKey = null; });
      b.addEventListener('keydown', e => {
        let n = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = stations[(ix + 1) % stations.length];
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = stations[(ix - 1 + stations.length) % stations.length];
        if (n) { e.preventDefault(); const nb = list.querySelector(`[data-key="${n.key}"]`); if (nb instanceof HTMLElement) nb.focus(); }
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10') || e.key === 'm') { e.preventDefault(); app.openMenu(s.key); }
      });
      li.appendChild(b); list.appendChild(li);
    });
  }
  return { renderList };
}
