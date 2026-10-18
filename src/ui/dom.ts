// The shell's elements (src/app/shell.html), looked up once and typed.

function byId<T extends HTMLElement>(id: string, kind: { new (): T; prototype: T }): T {
  const el = document.getElementById(id);
  if (!(el instanceof kind)) throw new Error(`Tree-do: #${id} is missing from the shell`);
  return el;
}

export type Dom = ReturnType<typeof getDom>;

export function getDom() {
  const div = HTMLElement, btn = HTMLButtonElement;
  return {
    map: byId('map', HTMLCanvasElement),
    topDate: byId('topDate', div), topCount: byId('topCount', div),
    a11y: byId('a11y', HTMLUListElement), live: byId('live', div),
    ctrl: byId('ctrl', div), zoomIn: byId('zoomIn', btn), zoomOut: byId('zoomOut', btn), fitBtn: byId('fitBtn', btn),
    sheet: byId('sheet', div), grab: byId('grab', btn), peek: byId('peek', div), scroll: byId('scroll', div),
    sDate: byId('sDate', div), sCount: byId('sCount', div), tabTT: byId('tab-tt', btn),
    tabBtns: [...document.querySelectorAll('.tab')].filter((b): b is HTMLButtonElement => b instanceof HTMLButtonElement),
    next: byId('next', div),
    undoBar: byId('undoBar', div), undoTag: byId('undoTag', div), undoMsg: byId('undoMsg', div), undoBtn: byId('undoBtn', btn),
    addBox: byId('addBox', div), addInput: byId('addInput', HTMLInputElement), chips: byId('chips', div),
    todayList: byId('todayList', div), ttBody: byId('ttBody', div), lines: byId('lines', div),
    hold: byId('hold', div), holdHead: byId('holdHead', div), hacts: byId('hacts', div), hrule: byId('hrule', div),
  };
}

/** The element an event happened on (or null for non-element targets). */
export const elementOf = (t: EventTarget | null): Element | null => (t instanceof Element ? t : null);

/** The closest matching HTML element. */
export function closestEl(t: EventTarget | null, selector: string): HTMLElement | null {
  const el = elementOf(t)?.closest(selector);
  return el instanceof HTMLElement ? el : null;
}

export function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** Move focus without scrolling, if it's focusable. */
export function focusEl(el: Element | null | undefined): void {
  if (el instanceof HTMLElement || el instanceof SVGElement) el.focus({ preventScroll: true });
}
