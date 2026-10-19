// The cross-module calls the panel, map and actions make on each other, wired by the engine.
import type { TaskEdit, Where } from '../domain/rules';
import type { Task } from '../domain/types';
import type { Slot } from '../domain/week';
import type { Snap, Tab } from './store';

export type MoveKind = 'later' | 'tomorrow' | 'someday' | 'undone' | 'delete';
export interface SnapOpts { instant?: boolean; v?: number }
export interface CloseOpts { to?: Snap; v?: number; focus?: boolean }

export interface App {
  // plan actions
  replan(opts?: { instant?: boolean }): void;
  snapshot(): void;
  undo(): void;
  activate(key: string): void;
  move(key: string, how: MoveKind): void;
  /** Put a task right before or after another (its list and branch). */
  place(id: string, targetId: string, where: Where): void;
  resetDemo(): void;
  /** Change a task from the week's editor. */
  edit(id: string, e: TaskEdit): void;
  /** Add a task typed into a slot on the week (null if there was nothing to add). */
  addAt(text: string, slot: Slot, line: string | null): Task | null;
  // sheet + views
  setSnap(name: Snap, opts?: SnapOpts): void;
  setTab(tab: Tab): void;
  applyH(h: number): void;
  sheetH(): number;
  sheetExpanded(): boolean;
  // panel
  refreshHud(): void;
  renderList(): void;
  renderLegend(): void;
  renderChips(): void;
  renderTimetable(): void;
  /** The Hours / Days views, when one is showing. */
  renderWeek(): void;
  ttOpen(): boolean;
  openTimetable(focusId?: string): void;
  openMenu(key: string): void;
  closeMenu(opts?: CloseOpts): void;
  startBranch(key: string): void;
  toast(tag: string, msg: string, canUndo?: boolean): void;
  say(msg: string): void;
  placeNotice(): void;
  // camera
  ensureVisible(key: string): void;
  keepStartClear(instant?: boolean): void;
  initialView(): void;
}
