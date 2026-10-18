// The Key tab: the lists with today's counts (the map legend is static markup in the shell).
import type { App } from '../app/context';
import type { Store } from '../app/store';
import { allLines } from '../domain/lines';
import type { Dom } from './dom';

export function createKeyView(store: Store, dom: Dom, app: App) {
  function renderLegend(): void {
    const box = dom.lines;
    box.innerHTML = '';
    allLines(store.state.plan).forEach(l => {
      const row = document.createElement('div'); row.className = 'lrow';
      row.innerHTML = `<span class="bar" style="background:${l.color}"></span><span class="lname"></span><span class="cnt" id="cnt-${l.id}"></span>`;
      const name = row.querySelector('.lname'); if (name) name.textContent = l.name;
      box.appendChild(row);
    });
    app.refreshHud();
  }
  return { renderLegend };
}
