# Tree-do

A to-do app for ADHD brains, drawn as a map. Each day starts on one line: Upkeep (get up, make the bed). Your lists branch off it. Finishing a task opens the next one, and a little train runs down the line to it.

- **Ready now / Later / Done**, with a round checkbox to tick tasks off.
- **Type tasks the way you'd say them:** `stretch daily 9am #health`, `call mum friday`, `water plants every 3 days`, `laundry every sunday` (repeats, times, days and lists are picked up).
- **Put it in the right place:** `fold clothes after laundry` (or `before …`) adds it right next to that task, on the same list and branch and on the same days. You can also drag any task to a new spot: hold and drag in the Today lists, or use the grip in Plan.
- **Branches:** any task can start a branch, and branches can branch again.
- **The map:** the track to a task stays dashed until it's done (grey while it's later, in the list's colour when it's ready), then fills in solid when you tick it.
- **Hold a task** for: later today, tomorrow, someday, do it now (skip ahead), branch, edit, delete. Everything can be undone.
- **No overdue pile.** The map is rebuilt each morning (your day starts at 4am by default): unfinished one-off tasks carry over quietly and repeats come back on their days.
- **The week:** switch from the Map to **Hours** (a calendar grid for timed tasks, everything else in an Anytime tray) or **Days** (a row per day, each folding to a strip of tiny lines). Show the next 7 days or this week (Mon–Sun); earlier days list what you ticked off. Tick today's tasks right there; tap a later one to edit it in the plan.
- **Layout:** on desktop the panel is pinned beside a left-to-right map; on phones lists become columns and the panel is a pull-up sheet.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Tip: add `?now=2026-10-19T07:40` to the URL to pretend it's a different time (useful for testing the 4am rollover and timed tasks).

## Where things are

```
index.html               page shell + fonts
src/main.tsx             React entry
src/App.tsx              mounts the app shell and starts the engine
src/app/shell.html       the panel, map canvas and controls (markup)
src/app/engine.ts        composition root: loads the plan, wires the modules, runs the frame loop
src/app/store.ts         the one typed app state + change/notify (saving subscribes to plan changes)
src/app/actions.ts       tick, move, undo, reset, replan (every plan change goes through here)
src/app/context.ts       the cross-module calls (App interface) the engine wires up
src/app/viewport.ts      breakpoints and sizes shared by map and panel

src/domain/              pure, unit-tested; no DOM
  types.ts               Task, List ("line"), Repeat, Plan (= saved state)
  time.ts                clock (incl. ?now=), dates, service day (4am start), friendly dates
  rules.ts               what's due today, done, carry-over / pruning, skip
  parse.ts               plain-words parser, rule text
  lines.ts               lists and their colours
  network.ts             today's network: what's on the map, branches, junction, task states
  week.ts                the week: what falls on each day (projected rules, the done-log)
  seed.ts                the sample day

src/map/                 the canvas map
  layout.ts              desktop rows / phone columns
  geometry.ts            track geometry
  draw.ts, canvas.ts     drawing
  status.ts              how a station reads (ready / later / done, countdown, meta)
  trains.ts              trains and arrival rings
  camera.ts              fitting, panning limits, easing
  input.ts               tap / hold / drag / pinch / wheel, zoom buttons

src/ui/                  the panel
  sheet.ts               snap points, spring, pinned panel
  drag.ts                drag a row to move its task (Today and Plan)
  views.ts               Today / Plan / Key tabs
  today.ts               header count, next-up row, Ready now / Later / Done
  add.ts                 add field (above every view), chips, branch mode, "after …" placement
  plan.ts                the Plan tab (timetable)
  key.ts                 the Key tab
  hold.ts                hold menu
  notice.ts              notice / undo bar, live region
  a11y.ts                hidden keyboard / screen-reader task list
  keyboard.ts            global keys (Esc, N)
  week.ts                Map / Hours / Days switch, and the Hours and Days views
  dom.ts, icons.ts, format.ts   element lookup, icons, meta HTML

src/storage/local.ts     saving (browser localStorage under `tree-do:v1`; the last view under `tree-do:view`)
src/styles.css           the Calm design
```

## Status

- **Phase 1 (this):** runs locally and saves in the browser. The prototype engine is split into typed `domain/`, `map/` and `ui/` modules with the same behaviour and look.
- **Next:**
  - store data in Convex (subscribe to the store's `plan` changes, as `engine.ts` does for localStorage), with sign-in and sync across devices;
  - deploy on Vercel.

## License

[AGPL-3.0](LICENSE). You're free to use, study, change and share Tree-do. If you run a modified version as a service for others, you must make your source available under the same license.
