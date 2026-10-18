# Tree-do

A to-do app for ADHD brains, drawn as a map. Each day starts on one line: Upkeep (get up, make the bed). Your lists branch off it. Finishing a task opens the next one, and a little train runs down the line to it.

- **Ready now / Later / Done**, with a round checkbox to tick tasks off.
- **Type tasks the way you'd say them:** `stretch daily 9am #health`, `call mum friday`, `water plants every 3 days`, `laundry every sunday` (repeats, times, days and lists are picked up).
- **Branches:** any task can start a branch, and branches can branch again.
- **Hold a task** for: later today, tomorrow, someday, do it now (skip ahead), branch, edit, delete. Everything can be undone.
- **No overdue pile.** The map is rebuilt each morning (your day starts at 4am by default): unfinished one-off tasks carry over quietly and repeats come back on their days.
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
index.html            page shell + fonts
src/main.tsx          React entry
src/App.tsx           mounts the app shell and starts the engine
src/app/shell.html    the panel, map canvas and controls (markup)
src/app/engine.ts     map layout + drawing, day rules, parser, panel behaviour
src/storage/local.ts  saving (browser localStorage for now)
src/styles.css        the Calm design
```

## Status

- **Phase 1 (this):** runs locally and saves in the browser. The engine is carried over unchanged from the design prototype.
- **Next:**
  - split the engine into typed `domain/`, `map/` and `ui/` modules;
  - store data in Convex, with sign-in and sync across devices;
  - deploy on Vercel.
