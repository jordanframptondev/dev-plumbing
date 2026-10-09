# Plan 7: Present, and the Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- **Part A: Present,** the last piece of v1. The Whiteboard Defense's third mode is a hand-drawn whiteboard that draws the project's own drawings one step at a time, with a caption to say out loud and marker notes, in seven chapters.
- **Part B: the follow-ups** the user asked for on 2026-10-08:
  - built-in type ids are reserved;
  - the finalizer's pack stays small on a big plan;
  - settled Plan changes catch the items up;
  - an item shows what a re-import changed;
  - Plan 5's smaller leftovers.

**Architecture:**
- **Part A:**
  - **Core:** the defense gains an optional `presenter`, written by the same whiteboard subagent in the same `dp_whiteboard` call, and checked whole by `saveDefense` against the project's drawings. The pack gains `drawings`: for each drawing the subagent may use, the parts it may reveal, as typed refs.
  - **Web:** a Present tab beside Study and Practice. It's lazily loaded, so Rough.js and Motion stay out of the main bundle. It lays a drawing out (ELK for diagrams and tables, a pure sequence layout for system flows), draws it with a seeded Rough.js generator, and animates each newly revealed part with Motion. A Full screen button covers the window.
- **Part B** changes:
  - `loadConfig`, `POST /api/rules` and `PUT /api/rules/:file` (reserved ids);
  - `finalizePack` and `finalizer.md` (files to Read, clipped bodies);
  - `/open` and the re-import (a catch-up re-import after settled Plan changes, and lines when one waits);
  - a re-import's copy of each item it changed, and a core diff of that against the version snapshot, shown in the thread;
  - the update recovery notes and leftover folders;
  - the re-import's labels and traces;
  - parking a removed item's resolved thread.

**Tech Stack:** the stack of Plans 1–6, plus two new web dependencies, pinned exactly: `roughjs` 4.6.6 (MIT) and `motion` 13.4.2 (MIT). Motion 13.4.2 is the newest release at least two weeks old; 14.0.0 is six days old. Motion's own packages are pinned too, by pnpm overrides in `pnpm-workspace.yaml`, to the versions `framer-motion@13.4.2` names: `framer-motion` 13.4.2, `motion-dom` 13.4.2 and `motion-utils` 13.3.0. Without them, Motion's ranges would bring 13.5.x releases under two weeks old.

**Spec:** `SPEC.md` (repo root). Read:
- for Part A, §12 (Present), §13.1 (`presenter`), §16 (the whiteboard canvas and responsive) and §18;
- for Part B, §7, §10.5 and §15.4, with Plan 5's decisions in `docs/superpowers/plans/2026-10-05-plan-5-bring-changes-in.md`.

`docs/how-it-works.md` explains how the plugin, the service and the app fit together.

## What Plans 1–6 left in place

- **The defense:**
  - `whiteboard/defense.json` is parsed by `whiteboardDefenseSchema` (`core/src/schemas/whiteboard.ts`). That's a plain `z.object`, so unknown keys are stripped, and a file that fails the schema reads as no defense.
  - `saveDefense` (`core/src/store/whiteboard.ts`) checks the raw payload whole, lists every problem with `nothingSaved(problems, WHITEBOARD_RETRY)`, and then builds the stored defense **field by field**, so a new field must be copied there.
  - `MAX_DEFENSE_CHARS` is 120,000.
  - `defenseDiagramItemIds(dir, types)` lists the diagram items a defense may name.
  - `whiteboardPack` (`core/src/store/context.ts`) inlines `data` only for diagram items, clips bodies to 800 characters, and gives each item's `file`.
  - The agent is `plugin/agents/whiteboard.md`, whose exact phrases `mcp/test/plugin.test.ts` asserts. Its budget is about 40,000 characters of JSON.
  - The real smoke run wrote a level 3 defense of 25,493 characters, from a pack of 14,997.
- **Drawings** (`core/src/schemas/data.ts`):
  - `DiagramData { kind, groups, nodes, edges }`: node, edge and group ids are each unique within their own list, but a node and an edge may share an id, and two items reuse ids freely.
  - `FlowData { kind: 'user'|'system'|'both', lanes?, steps: { n, from?, to?, label } }`.
  - `TableDiff { model, change, fields[] }`.
  - `parseData(kind, data)`.
  - **On the web:**
    - `layoutDiagram(data, direction)` (`web/src/diagram/layout.ts`) is async ELK and returns absolute coordinates (`DiagramLayout`).
    - `SequenceView` computes its layout inside the component.
    - `relationshipStrip(tables)` (`web/src/pages/visual/DatabaseScreen.tsx`) is a pure function from tables to a `DiagramData` (node ids are model names, edge ids `${model}.${field}`).
- **The page:**
  - `DefensePage.tsx` has `DefenseMode = 'study' | 'practice'` (`?mode=`, validated in `router.tsx`), `DefenseViewProps`, and Practice's page-owned place, keyed by defense id.
  - The page frame is `max-w-[80ch]`.
  - Practice's key handler sets the house rules: ignore keys while typing in a field; leave Space and Enter to focused controls; arrows are global.
  - Nothing in `src` is lazily loaded except ELK. The built main chunk is 728 kB and ELK 1.4 MB.
- **The theme** (`web/src/theme/tokens.css`):
  - the tokens are `--canvas` (white, or `#1e1e1d` at night), `--text` (ink), `--slate`, `--seal`, `--moss`, `--mist` and `--separator`, and there's no `--ink`;
  - `theme/palette.test.ts` scans `.ts`, `.tsx` and `.css` for Tailwind palette classes, the `bg-linear|radial|conic|gradient-` utilities and `#FFFFE3`.
- **Tests:**
  - jsdom has no `matchMedia` and no SVG geometry.
  - Web tests mock the router with `pages/visual/testkit.tsx`.
  - The e2e helpers include `importProject`, `defenseInput()`, `writeDefense()` and `noSideScroll`.
- **Plan 5:**
  - `PLAN_CHANGES_TYPE` lives in `core/src/planChanges.ts`, and `DEFENSE_TYPE` in `core/src/defenseType.ts`. `loadConfig` appends each unless the user has a rules file of that id that loads; that's Plan 5's "theirs wins".
  - **Updates:** `updatePlan` journals an update; `recoverUnfinishedUpdate(dir)` returns `{ recovered, keptChanged, setAside }`, which nothing shows the user; a changed draft sets `docs/versions/v<n>.unfinished-<stamp>/` aside.
  - **Re-import:** `writeImportBatch`'s re-import matches items by key, flags changes ("Changed in the plan's v<n>."), parks removed ones, and adds a question to an idle or your-turn thread as an `opening` message (labelled "raised when the plan was imported" in `MessageList.tsx`). `importPack.reimport` carries `{ from, to, changes, conflicts, existing }`. `finishImport` ends an import.
  - **Plan changes and parking:** Plan changes items hold `conflict`. `setParked` refuses a resolved thread unless its item is `removedIn`.
- **Finalize:**
  - `finalizePack` (`core/src/store/context.ts`) inlines `rules`, the whole `draft`, `previousFinal` and every item's full `body`.
  - `finalizer.md` describes those fields.
  - `mcp/test/bridge.integration.test.ts` checks `rules` matches `/^# Finalize spec rules/`.

## Decisions this plan makes

Review these. Each one is the plan's reading of the spec, or of the user's choices, where they leave room.

### Part A: Present

1. **The same subagent writes the presenter, in the same call.**
   - `dp_whiteboard`'s defense gains `presenter`. `saveDefense` checks it with the rest, and a problem in it refuses the whole defense, as any other does.
   - It's **required** in a new payload, so every defense written from now on can be presented.
   - It's **optional** in the stored schema, so a defense saved before Plan 7 still reads. Its Present tab says so and offers Regenerate.
   - The subagent's budget grows by about 12,000 characters. `MAX_DEFENSE_CHARS` stays 120,000.
   - A Claude Code session that was open while the user updated keeps the old agents, so its whiteboard subagent sends no presenter and is refused. The README's update note says to restart open sessions (Task 11).
2. **Seven fixed chapters, in order.** They're Purpose, System flow, Data and source of truth, States, Security, Failure and retries, and Rollback and blast radius (§12), with ids `purpose`, `flow`, `data`, `states`, `security`, `failure` and `rollback`.
   - The service fills in the titles, as it does for sections.
   - Each chapter has 1–8 steps. A chapter the plan doesn't touch still gets one step saying so.
3. **Each chapter picks one drawing, or none** (the user's choice). It can draw:
   - **a diagram item** (`{ kind: 'diagram', itemId }`), from `defenseDiagramItemIds`;
   - **the project's tables** (`{ kind: 'tables' }`), meaning every database item that isn't parked, drawn as the relationship strip;
   - **a system flow** (`{ kind: 'flow', itemId }`), meaning a flows item whose `kind` is `system` or `both`, drawn as a sequence;
   - **nothing** (`null`): the step's notes are written on the board as a list.
4. **Reveal refs are typed, so they're never ambiguous.**
   - A diagram offers `node:<id>`, `edge:<id>` and `group:<id>`.
   - The tables offer `table:<model>` and `link:<model>.<field>`, which are the strip's node and edge ids.
   - A flow offers `lane:<id>` and `step:<n>`.
   - Each step's `reveal` **adds** parts to what earlier steps in the chapter already drew.
   - A note's `near` is a ref already on the board at that step, or `""` for a note written at the board's foot.
   - **What a reveal brings onto the board** (core's `brings`, followed through, and the web's `shownAt` agree, so the web never draws less than core counts on the board: both take the tables from every enabled database-screen type, in item-id order, and neither offers nor draws a group with no boxes):
     - an edge or a link brings its two ends;
     - a box (a node) brings its group, so a group is drawn once any of its boxes is shown;
     - a flow step brings the lanes it goes from and to;
     - an explicit `group:` reveal draws only the group's outline, not its boxes.
   - Only explicit reveals count as "already revealed": revealing a part an earlier reveal brought along is allowed.
   - `saveDefense` refuses, listing every problem in the order of Task 1 (the missing line alone, or the size, the order line, then each chapter in order: missing, doubled, its drawing, its steps and notes):
     - a ref that isn't in the chapter's drawing;
     - a ref revealed twice in a chapter;
     - a `near` that isn't on the board yet;
     - any `reveal` in a chapter with no drawing.
5. **The pack lists what may be drawn.** `whiteboardPack.drawings` gives `{ drawing, title, parts: { ref, label }[] }[]` (`drawingOptions`) for each drawable thing: every diagram item, the tables (when there are any) and every system flow. This keeps the pack small for flows and tables, which otherwise aren't inline.
   - The tables' drawing is titled "Tables". A link's label is `<model>.<field> → <target>`. A flow step's label names the lanes it joins, `<from label> → <to label>: <label>` (or `<lane label>: <label>` with one lane, `<label>` with none), so the subagent can tell what a step brings without the flow's data. Every part's label is cut to 120 characters, ending "…".
   - A diagram item whose data doesn't parse is still an option, with no parts, since a section's `diagramItemId` may name it. A group with no boxes isn't a part: the layout drops it, so revealing it would draw nothing.
6. **The look** (the user's choice: rough lines, clean type).
   - **The board:** the canvas colour (`var(--canvas)`, white, or night in dark mode), with a faint dot grid drawn as an SVG `<pattern>` of `var(--separator)` dots every 20 px. It's not a CSS gradient (SPEC §16 never allows gradients).
   - **Lines:** boxes, arrows, lifelines and marker loops are drawn with a Rough.js **generator** (`rough.generator().toPaths`), seeded from a hash of the ref, so a drawing looks the same every time and in tests.
   - **Colours:** structure is in ink (`var(--text)`), and the tables drawing in slate (`var(--slate)`). Each note is in its own ink: `ink` is `var(--text)`, `slate` is `var(--slate)`, `seal` is `var(--seal)` and `moss` is `var(--moss)`. A note's marker loop (a rough ellipse around its `near`) is in the note's ink.
   - **Labels, notes and captions** are in the system font. No handwriting font, and no font download.
   - **Nothing moves between steps.** A chapter's frame (its viewBox) is worked out once: everything the chapter shows by its last step, with every note and marker ring it places, and a margin. So a chapter that shows 10 boxes of an 80-box diagram draws them large, and the drawing never moves or changes size from step to step. Notes are placed step by step, each step's new notes against what's on the board then, what later steps bring, group labels, and the notes and rings placed before, and they stay where they are. A note near a ref with several shapes (a lane) rings its box.
7. **Motion draws what's new.**
   - Each newly revealed path animates `pathLength` from 0 to 1, about 0.6 s per part with a stagger of `Math.min(0.15, 2.4 / n)` s for `n` new parts, so a big step starts its last part within 2.4 s. Notes fade in.
   - **Replay** redraws the current chapter from step 1, with animation.
   - **Going back a step** shows that step's board at once, with no animation.
   - **With `prefers-reduced-motion`** (Motion's `useReducedMotion()`), everything shows at once.
8. **Present sits inside the page, with a Full screen button** (the user's choice).
   - **The controls:**
     - a third Segmented option, Present (`?mode=present`);
     - the board, as wide as the page column and, in the page, as tall as its chapter's frame makes it (`aspect-ratio: <frame w> / <frame h>`, `min-height: 220px`, `max-height: calc(100dvh - 220px)`), so a wide drawing isn't a thin band in a tall box and what's under it moves only between chapters, never between steps;
     - under it, `Step <i> of <n>` with the caption to say out loud;
     - ◀ ▶ buttons (44 px square on a phone), Replay and Full screen;
     - a chapters list, beside the board from 1100 px, above it as a `<select>` below that.
   - **Keys:**
     - ← → step, across chapter ends;
     - Home and End go to the first and last step of the chapter;
     - Esc leaves full screen;
     - none of them while typing in a field.
   - **In view:** opening Present (the tab, or `?mode=present`) scrolls its top, the chapter's heading row, into view once (`scrollIntoView({ block: 'start' })`), so at 1280 x 800 the board, the caption and ◀ ▶ are on screen together. Steps and chapters don't scroll.
   - **Full screen** is a fixed overlay over the whole window, with the same board and controls. Where the browser has the Fullscreen API, it also enters browser full screen. Esc or the ✕ button leaves both. While it's up, everything outside it is `inert`, and Tab goes round its own controls, so the focus never lands on a control hidden under it.
   - **Full screen on a short screen** (under 500 px tall, a phone held sideways) is three rows with nothing to scroll: the chapters menu, the title and ✕; the board; then the step, the caption (two lines at most), ◀ ▶ and Replay.
   - **The place** (chapter and step) lives in `DefensePage`, keyed by defense id, as Practice's does, so switching modes keeps it.
   - **On a phone held upright,** a line says "Turn your phone sideways, then press Full screen." The board fits the width and pinch-zooms (§16).
   - **The frame:** Present widens the page's frame to `max-w-[1180px]`, in Present only; Study and Practice keep `80ch`. Nothing in Present is a primary button.
   - **In full screen** the board fills the height that's left, and ✕ ("Leave full screen") takes the focus.
   - **An old defense:** a defense with no presenter, or one with zero chapters, reads as written before Present (`PresentView` and `DefensePage` both check `!presenter?.chapters.length`). Its Present says so, and **Regenerate** is the page's one primary button while Present is open.
   - **Coming back** to Present at a step past the first (from Study, say) shows that step at once, not partly drawn again.
   - **If Present's chunk can't load** (a tab left open across an upgrade), an error boundary says "Present couldn't load. Reload the page." in its place.
9. **Present's code loads only when needed.** `PresentView` is `React.lazy`, inside `PresentBoundary`, so Rough.js and Motion are in their own chunk. The ELK chunk loads when the first diagram is laid out, as it does today.
10. **Not in Present:**
    - Ask Claude about a step;
    - Export of the presenter;
    - Study or Practice changes;
    - drawing user flows (storyboards), mockups or phases. A user flow or a mockup can be named in a caption or a note only.

### Part B: the follow-ups

11. **Built-in ids are reserved** (the user's choice; it changes Plan 5's "a user's plan-changes.md wins").
    - A rules file whose id is `plan-changes` or `defense` is reported as a config problem and ignored, unread, and the built-in type is used. The problem is `{ file: 'plumbing/<file>', message }`, shown as ``plumbing/${file}: The id "${id}" is kept for dev-plumbing's built-in ${title} type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.`` It says what to do, since a file's id must equal its name and the app can't rename or delete a file. The message starts with a capital, because the Rules page's "Files with problems" shows it on its own line.
    - The Rules page and Settings already list config problems.
    - **+ Plumbing type** (`POST /api/rules`) refuses either id with a 400, ``The id "${id}" is kept for dev-plumbing's built-in ${title} type. Pick another.``, and writes nothing.
    - **Saving** `plan-changes.md` or `defense.md` from the Rules page's editor (`PUT /api/rules/:file`) is refused with a 400 and the config problem's own message (`reservedIdProblem`), and writes nothing.
12. **The finalizer's pack stays small.** It gets the whiteboard pack's fix:
    - `finalizePack` gives `rulesFile`, `draftFile` and `previousFinalFile` (an absolute path, or null) in place of `rules`, `draft` and `previousFinal`;
    - it clips each item's `body` to 800 characters with Read-the-file wording, and gives each item's `file`;
    - `finalizer.md` Reads the three files first, a long one in parts (with offset and limit), and Reads the `file` of every item whose body is cut short before it writes that item's part: the final is what gets built, so it's never written from the first 800 characters;
    - the service resolves `rulesFile` as `whiteboardRulesFile` does (the user's `outputs/finalize.md`, else the shipped default);
    - a test holds a 40-item pack under 60,000 characters of JSON.
13. **Settled Plan changes catch the items up** (the user's choice). When the current version's update had conflicts, every Plan changes item of that version is resolved or parked, and settling them changed the draft, the next `/dev-plumbing` re-imports once to bring that in.
    - **"Changed the draft"** is read from the Plan changes threads of v<n> themselves (`settledEdits`): at least one has an applied, not undone, `history/` entry with markdown edits (`change.md` not empty). Keep my draft has none, and parking applies nothing, so Keep my draft everywhere never runs one, whatever else the user answered. (Comparing the whole draft with `merged.md` would count every other answer the user accepted.)
    - **What it does:** the update's re-import again (every importable type, matched by key, new items added, removed ones parked), but `importPack.reimport` gets `catchUp: true`. Its `changes` is only what settling did: each of those edits as a small diff of `find` (`- ` lines) and `replace` (`+ ` lines) under `@@ <the passage's heading>` (the item's `mdAnchor`). The user's answers to other items never reach the importers. Its `conflicts` is empty, and its `from`/`to` are both `n`. A changed item is flagged "Changed in the plan's v<n>." as after the update, and its thread says "Updated to match your settled Plan changes." in place of "Updated from the plan's v<n>.".
    - **The bookkeeping:**
      - `project.caughtUp` (a version number) records it when the catch-up starts, so it runs once per version;
      - it runs only on `/open`'s `reopened` path with a `windowId`, after **Not now** too (Not now only declines a newer version; the catch-up is this one's), and not on a project just created or just updated;
      - it waits while anything is with Claude, importing or finalizing, as an update does, and while an update's journal is still there. When it's due but has to wait for Claude, `/open`'s `next` says "Your settled Plan changes still need a re-import. It waits until Claude has answered: run /dev-plumbing again then.", so the user knows to run `/dev-plumbing` again;
      - a re-import that was cut short (15 (c)) is finished first, in the same `/open`, and the catch-up then waits for a later `/dev-plumbing`, and says so.
    - **What the user sees:**
      - `/open`'s `next` starts with "Your settled Plan changes touch the plan's items. Re-importing to catch them up.";
      - the Plan changes list says "Your Plan changes are settled. Run /dev-plumbing to catch the items up." exactly when the next `/dev-plumbing` would run it, apart from what's under way: the current version had conflicts, every Plan changes item of it is settled, settling changed the draft, and `caughtUp` is below it (`catchUpWaiting`, as `ProjectHome.catchUpDue`). So after **Keep my draft** everywhere, the line never shows, whatever else was answered.
14. **An item shows what a re-import changed** (the user's choice: view only).
    - **Only what the re-import did** (the user's choice). When `reimportItem` changes an item, it also writes the item exactly as it left it to `docs/versions/v<n>/reimported/<id>.json`, with an atomic write, beside v<n>'s `merged.md`. A catch-up's re-import of v<n> overwrites it, so the view runs from before v<n> to after the last re-import of v<n>. A change accepted afterwards isn't in it.
    - `itemVersionChange(dir, itemId, types)` compares the item's copy in `docs/versions/v<n-1>/items/` with that `reimported/<id>.json`, for the newest version `n` whose re-import changed it: from its flags ("Changed in the plan's v<n>."), its thread's line ("Updated from the plan's v<n>.") or its `reimported/` copies, since answering a thread clears the flags and a catch-up's line names no version. It returns `{ version, since, summary, body, fields, drawing }`, each part a `DiffSegment[]` or null when unchanged.
    - **Without a `reimported/` copy** (an item re-imported before Plan 7) it falls back to the item as it is now, with `since: true`, and the view's heading says `Changed since before v${n}` in place of `What v${n} changed`.
    - **Plan 5's rollback is unchanged.** The copies are written by the re-import, after the update committed, so no update journal lists them. Putting an update to v<n+1> back leaves them in v<n> (`removeSnapshot` removes v<n>'s folder only when it's empty), and `setAside` moves `reimported/` back to v<n> with `merged.md`.
    - The fields are diffed as `key: value` lines. The drawing is diffed as a summary line before and after (`dataSummary`, now exported), not as JSON, with `dataChangeSummary`'s phrases ("1 box added, 1 line added") after the new line, so a relabel still shows. No data reads "No drawing", and data that doesn't parse "A drawing that can't be read".
    - The thread view shows it collapsed, with `DiffView`, or "Nothing else changed." when all four are null.
15. **Plan 5's smaller leftovers** (the user picked all four):
    - **(a) Recovered updates are told.** `/open` calls `recoverUnfinishedUpdate` itself, first in each of its project locks (`putBackFirst`), and keeps `recoveryLines` of what it did; `planChange` and `updatePlan` are unchanged, and find nothing left to put back. `/open`'s `next` starts with "An earlier update to v<n> didn't finish, and was put back." When files were kept, it adds "Your own changes to <files> were kept, and your files from before the update are in <setAside>." (`setAside` moves the v<n> snapshot: the plan and draft from before the update, the only copy of that draft once the update's merge is in it.) An update that can't be put back yet now fails `/open` on every path (Plan 5's ConflictError), `update: false` included. The raw Node error at `update.ts`'s stale-snapshot read becomes a ConflictError: "The update couldn't read docs/versions/v<n> (<reason>). Run /dev-plumbing to try again."
    - **(b) Leftover folders.**
      - The Versions page lists `docs/versions/v<n>.unfinished-*` folders, under "Left over from updates that didn't finish", each as its name and `v<n>'s plan and draft from before the update · set aside <time>`, with Remove and a `window.confirm` that says what goes: `Remove ${name}? It holds your v${n} plan and draft from before an update that didn't finish. They're deleted.`
      - `DELETE /api/projects/:repo/:id/versions/leftovers/:name` removes only a folder whose name matches `^v[1-9][0-9]*\.unfinished-[0-9TZ-]+(-[0-9]+)?$`, under the lock.
      - Nothing is removed automatically.
    - **(c) Re-import labels and traces.**
      - Every opening message a re-import writes, on a changed item's thread or a new item's, records `raisedIn: <n>`, and `MessageList` says "raised in the plan's v<n>".
      - A re-import cut short records `project.importIncomplete: string[]`, the type ids whose batch never came. The project header (on every project page) shows "The v<n> re-import didn't finish for <titles>. Run /dev-plumbing to try again.", and the next `/dev-plumbing` re-imports those types (they're put back in `importPending`) and tells the user "The v<n> re-import didn't finish for <titles>. Finishing it now." It runs after **Not now** too, since Not now answers the new version's question, and before the catch-up.
      - **A cut-short catch-up stays a catch-up.** `finishImport` records `importIncompleteCatchUp: true` beside `importIncomplete` when `reimporting.catchUp` is set, and the resume sets `reimporting.catchUp` from it, so the types that didn't finish get the settled edits, not the update's changes again. (`caughtUp` was set when the catch-up started, so nothing else would bring them.)
      - **When it waits:** while `updateRefusal` holds the resume back (a thread with Claude, say), `/open`'s `next` says "The v<n> re-import still needs to finish for <titles>. It waits until Claude has answered: run /dev-plumbing again then."
      - **Once on its own.** `finishImport` counts the cuts in `importIncompleteTries`. A version's re-import is resumed once; cut short again (2), `/open` doesn't run it but says "The v<n> re-import didn't finish again for <titles>. Run /dev-plumbing to try again.", the header says the same, and the count goes back to 1, so the next `/dev-plumbing`, run after the user is told, tries once more. `importDone` drops the three fields once every batch is in, and an update or a catch-up, which re-import every type, starts without them.
    - **(d) Parking a removed item's resolved thread.** `ThreadView` offers Park on a resolved thread whose item was removed from the plan; core already allows exactly that. Other resolved threads still can't be parked (`setParked`'s rule is unchanged).

## Global Constraints

Everything in Plans 1–6's Global Constraints still applies:
- **Platform:** Node `>=22.12`, pnpm `10.x`, TypeScript `strict`, ESM.
- **The public repo stays generic.** Examples use the made-up "Acme" app, with no real company names, personal paths or emails.
- **The config folder** is `~/.dev-plumbing/`, overridable with `DEV_PLUMBING_HOME`. Never overwrite a user's config file except through an explicit **Reset to default** or **Detect again**.
- **Writes are atomic** (`writeFileAtomic` / `writeJsonAtomic`). The service is the only writer of the projects folder, always under the project's lock.
- **Subagents** get only `Read`, `Grep`, `Glob` and their dp tools.
- **The service** binds `127.0.0.1` with the Host, token and same-origin guard.
- **The Ink wash theme,** exactly per §16:
  - colour only as dots, text, thin lines and small markers;
  - no tinted boxes, gradients or glows;
  - tokens only;
  - one primary button per screen;
  - sentence-case copy;
  - one column under 768 px, with no sideways scrolling.
- **Tests:**
  - Tests clean up their temp folders.
  - They never touch the real `~/.dev-plumbing`, never run the real `launchctl`, never install plugins and never use port 4545.
  - e2e runs on 45459 and the smoke test on 45461.
- **Commits:** every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, passed as a second `-m`, whatever model wrote it.
- **Worktree:** work in a git worktree, never in the main checkout.

New in this plan:
- **Dependencies** (`packages/web` only), pinned with no range: `"roughjs": "4.6.6"` and `"motion": "13.4.2"`. Motion's own packages are pinned by pnpm overrides in `pnpm-workspace.yaml`: `framer-motion: 13.4.2`, `motion-dom: 13.4.2` and `motion-utils: 13.3.0`, the versions `framer-motion@13.4.2` names. Everything in the tree is at least two weeks old (published by 2026-09-23). Nothing else is new.
- **Names:**
  - the chapter ids `purpose`, `flow`, `data`, `states`, `security`, `failure` and `rollback`;
  - the drawing kinds `diagram`, `tables` and `flow`;
  - the ref prefixes `node:`, `edge:`, `group:`, `table:`, `link:`, `lane:` and `step:`;
  - `?mode=present`;
  - the project fields `caughtUp`, `reimporting.catchUp`, `importIncomplete`, `importIncompleteCatchUp` and `importIncompleteTries`;
  - the folder `docs/versions/v<n>/reimported/` (a re-import's copy of each item it changed);
  - the message field `raisedIn`;
  - the pack fields `drawings`, `chapters`, `rulesFile`, `draftFile`, `previousFinalFile`, a finalize item's `file`, and `reimport.catchUp`;
  - the view fields `ProjectHome.catchUpDue`, `ProjectHome.importIncomplete` (with `again`), `ThreadDetail.versionChange` (with `since`) and `VersionsView.leftovers`;
  - the route `DELETE /api/projects/:repo/:id/versions/leftovers/:name`;
  - the test ids `present`, `present-*`, `board`, `board-grid`, `board-shape`, `board-note`, `catch-up-due`, `version-change`, `leftovers-list`, `leftover-row` and `import-incomplete`.
- **Limits:**
  - the presenter has exactly 7 chapters, each with 1–8 steps;
  - a caption is 1–300 characters;
  - `reveal` holds at most 40 refs per step;
  - each step has 0–4 notes, of 1–120 characters, with `near` up to 120;
  - the presenter is at most 20,000 characters of JSON, and the whiteboard agent is asked to keep it under about 12,000;
  - a drawing part's label is at most 120 characters;
  - a finalize item's `body` is cut to 800 characters, as the whiteboard pack's are;
  - a step's new parts draw `Math.min(0.15, 2.4 / n)` s apart;
  - a cut-short re-import is resumed on its own once (`importIncompleteTries` under 2).
- **Exact copy, used verbatim:**
  - **The chapter titles:** "Purpose", "System flow", "Data and source of truth", "States", "Security", "Failure and retries", "Rollback and blast radius".
  - **Save problems** (in `saveDefense`'s list, `nothingSaved`):
    - "presenter is missing. Send the seven chapters too."
    - `presenter: the presenter is ${n} characters of JSON; the most is 20,000.`
    - `presenter.chapters: ${id} is missing.`
    - `presenter.chapters: ${id} is there more than once.`
    - `presenter: chapters must come in this order: purpose, flow, data, states, security, failure, rollback.`
    - `${where}: there's no diagram item "${itemId}". Use one of: ${ids}.`
    - `${where}: there's no system flow "${itemId}". Use one of: ${ids}.`
    - `${where}: this project has no tables to draw.`
    - `${where} step ${s}: "${ref}" isn't in this drawing.`
    - `${where} step ${s}: "${ref}" was already revealed in step ${t}.`
    - `${where} step ${s}: this chapter draws nothing, so leave reveal empty.`
    - `${where} step ${s} note ${k}: "${near}" isn't on the board yet.`

    `${where}` is `presenter.chapters: ${id}`, and `s`, `t` and `k` count from 1. When there are no candidates, `Use one of: …` becomes `There are none, so pick another drawing or none.`
  - **The page:**
    - the segmented option "Present";
    - `Step ${i} of ${n}`; "Replay"; "Full screen"; "Leave full screen"; "Previous step"; "Next step" (the aria labels of ◀ ▶);
    - the chapters list's label "Chapters";
    - "This defense was written before Present. Regenerate it to present it.";
    - "Turn your phone sideways, then press Full screen.";
    - "Nothing to draw in this chapter.";
    - "Drawing…" (while Present's code or a board loads);
    - "Present couldn't load. Reload the page." (when Present's chunk doesn't load);
    - a chapter's heading, and its entry in the chapters list, `${n}. ${title}`.
  - **The drawings:** "Tables" (the tables' title); a link's label `${model}.${field} → ${target}`.
  - **The agents:**
    - `whiteboard.md`: "Keep the presenter under about 12,000 characters of JSON.";
    - `finalizer.md`: "Before you write anything, Read `rulesFile` and `draftFile`, each one whole (in parts, with offset and limit, when it's long), and `previousFinalFile` when it isn't null." and "Read the `file` of every item whose body is cut short before you write its part of the final.";
    - `dp_whiteboard`'s description ends "…the release concerns, the checklist, and the presenter's seven chapters."
  - **Reserved ids:**
    - the config problem's message, ``The id "${id}" is kept for dev-plumbing's built-in ${title} type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.``, shown as `plumbing/${file}: <message>`, and `PUT /api/rules/:file`'s 400 for such a file;
    - `POST /api/rules`'s 400, ``The id "${id}" is kept for dev-plumbing's built-in ${title} type. Pick another.``
  - **Catch-up:**
    - "Your settled Plan changes touch the plan's items. Re-importing to catch them up.";
    - "Your settled Plan changes still need a re-import. It waits until Claude has answered: run /dev-plumbing again then." (`/open`'s `next`, when it waits);
    - "Your Plan changes are settled. Run /dev-plumbing to catch the items up." (the Plan changes list);
    - "Updated to match your settled Plan changes." (a caught-up item's thread).
  - **What changed:**
    - `What v${n} changed`, or `Changed since before v${n}` without the re-import's copy;
    - "Summary", "Details", "Fields", "Drawing";
    - "Nothing else changed.";
    - "No drawing" and "A drawing that can't be read" (a drawing's summary line before or after).
  - **Recovery:**
    - `An earlier update to v${n} didn't finish, and was put back.`;
    - `Your own changes to ${files} were kept, and your files from before the update are in ${setAside}.`;
    - `The update couldn't read docs/versions/v${n} (${reason}). Run /dev-plumbing to try again.`
  - **Leftovers:**
    - "Left over from updates that didn't finish";
    - "Remove";
    - `v${n}'s plan and draft from before the update · set aside ${time}` (a row's second line);
    - `Remove ${name}? It holds your v${n} plan and draft from before an update that didn't finish. They're deleted.` (the confirm);
    - 404 "That folder isn't a leftover from an update.".
  - **Re-import:**
    - `raised in the plan's v${n}`;
    - `The v${n} re-import didn't finish for ${titles}. Run /dev-plumbing to try again.` (the project header);
    - `The v${n} re-import didn't finish again for ${titles}. Run /dev-plumbing to try again.` (the project header, and `/open`'s `next`, once it was cut short twice);
    - `The v${n} re-import didn't finish for ${titles}. Finishing it now.` (`/open`'s `next`);
    - `The v${n} re-import still needs to finish for ${titles}. It waits until Claude has answered: run /dev-plumbing again then.` (`/open`'s `next`, when it waits).

    `${titles}` is `andList` of the type titles: "a", "a and b", "a, b and c".

## Review Focus

These five situations aren't the main path, but they're the most likely to hurt someone using this. Each has a test in the task named.

1. **A presenter that points at the wrong things.**
   - Refs that don't exist in the drawing, a ref revealed twice, a note near something not drawn yet, a drawing that doesn't exist or is parked, a chapter missing or out of order: each is refused whole, with every problem listed, and the last saved defense stays as it was.
   - A defense saved before Plan 7, with no presenter, still reads, and Present says so.

   Tested in Task 1 ("a presenter is checked against the project's own drawings").
2. **The board after the plan moved on.** A presenter names a drawing whose data changed after it was saved (the defense is then Out of date): a ref that no longer exists is skipped, the rest is drawn, and the board never crashes. A drawing that's gone, or no longer parses, shows "Nothing to draw in this chapter." with the notes. Tested in Task 4 ("a stale presenter still draws what it can").
3. **Keys and focus.**
   - ← → never fire while typing in a field.
   - Esc leaves full screen and returns focus to the Full screen button.
   - Focused buttons keep Space and Enter.
   - Leaving the page while in full screen leaves browser full screen too.
   - While full screen is up, the page under it is inert, and Tab from its last control comes back to ✕.

   Tested in Task 4: "Present's keys leave fields and focused controls alone" (`PresentView.test.tsx`), and `present.spec.ts`'s "Present draws the plan a step at a time, chapter by chapter, and Full screen covers the window", which leaves the page in full screen, and tabs round it.
4. **Re-imports that run when they shouldn't, or twice.**
   - The catch-up runs once per version, only when every Plan changes item of that version is settled and settling one of them changed the draft, never while anything is with Claude or importing, and not at all after Keep my draft everywhere, whatever else was answered. Its importers get only the settled edits.
   - A re-import cut short is finished by the next `/dev-plumbing` for only the types that didn't finish, as a catch-up again when it was one, and only once on its own.

   Tested in Task 7 ("the catch-up runs once, and only when it should"). The cut-short re-import, and that it's finished before a catch-up, are tested in Task 10.
5. **Removing files.** The leftovers route removes only a folder whose name matches the `.unfinished-` pattern, inside that project's `docs/versions/`. A name with `..`, a slash, `v2` itself or any other folder is a 404, and nothing is removed. Tested in Task 9 ("only a leftover folder can be removed").

---

## File Structure

```
dev-plumbing/
  SPEC.md                                   # Task 11: §7's tree, §12 Present as built, §13.1 presenter
  pnpm-workspace.yaml                       # Task 3: overrides pin framer-motion, motion-dom, motion-utils
  plugin/agents/whiteboard.md               # Task 2: the presenter step
  plugin/agents/finalizer.md                # Task 6: Read rulesFile, draftFile, previousFinalFile, and every clipped item's file
  plugin/agents/importer.md                 # Task 7: the catch-up re-import
  packages/
    core/src/
      schemas/whiteboard.ts                 # Task 1: presenter schemas, PRESENT_CHAPTERS, chapterIds, limits
      schemas/drawings.ts                   # Task 1: pure (the web imports it): tablesDrawing, relationTarget, parseRef,
                                            #   drawingKey, drawingParts, refKinds/RefKind, DrawingPart/Option/Parts
      schemas/project.ts                    # Tasks 7, 10: reimporting.catchUp, caughtUp; importIncomplete, importIncompleteCatchUp,
                                            #   importIncompleteTries
      schemas/loop.ts                       # Task 10: a Claude message's raisedIn
      schemas/views.ts                      # Tasks 7–10: ProjectHome.catchUpDue; ItemVersionChange (with since) and
                                            #   ThreadDetail.versionChange; Leftover, VersionsView, andList;
                                            #   ProjectHome.importIncomplete (with again)
      store/drawings.ts                     # Task 1: drawingOptions, projectDrawings, drawnItems, TABLES_TITLE
      store/whiteboard.ts                   # Task 1: saveDefense checks and keeps the presenter
      store/context.ts                      # Tasks 2, 6, 7, 8: whiteboardPack.drawings and chapters; finalizePack files
                                            #   and clipped bodies; importPack's catch-up (the settled edits); dataSummary
                                            #   exported
      config.ts                             # Task 5: reserved ids (RESERVED_TYPE_IDS, reservedType, reservedIdProblem)
      planChanges.ts, defenseType.ts        # Task 5: doc comments
      store/update.ts                       # Tasks 7–10: settledEdits, catchUpWaiting, catchUpDue, startCatchUp; setAside
                                            #   keeps reimported/ with its version; the recovery note's version,
                                            #   recoveryLines, the plain error, listLeftovers, removeLeftover;
                                            #   IncompleteImport, resumeIncompleteImport, and updatePlan starts clean
      store/importItems.ts                  # Tasks 7, 8, 10: a catch-up's thread line; reimportedRel and the reimported/
                                            #   copies; raisedIn; importIncomplete, its catch-up flag and its tries
      store/projects.ts                     # Tasks 7, 10: ProjectHome.catchUpDue, importIncomplete
      store/versionChange.ts                # Task 8: itemVersionChange (the reimported/ copy, or since)
      store/detail.ts                       # Task 8: the thread detail carries versionChange
      index.ts                              # exports
    service/src/
      routes/claude.ts                      # Tasks 6, 7, 9, 10: /context finalize files; /open's recovery lines,
                                            #   unfinished re-import and catch-up, and the lines when they wait
      routes/config.ts                      # Task 5: POST /api/rules and PUT /api/rules/:file refuse a reserved id
      routes/versions.ts                    # Task 9: leftovers list and DELETE
      app.ts                                # Task 9: versionRoutes takes the runtime
    mcp/src/tools.ts                        # Task 2: dp_whiteboard's description names the presenter
    web/
      package.json                          # Task 3: roughjs, motion
      src/diagram/sequenceLayout.ts         # Task 3: pure layout, SequenceView uses it
      src/diagram/SequenceView.tsx          # Task 3: uses sequenceLayout
      src/pages/visual/DatabaseScreen.tsx   # Task 1: relationshipStrip calls core's tablesDrawing
      src/pages/defense/present/rough.ts    # Task 3: seeded generator, toPaths, roughMarker
      src/pages/defense/present/Board.tsx   # Task 3: draws a laid-out drawing with reveal and notes; chapterBoard frames
                                            #   the chapter and places its notes once
      src/pages/defense/present/boardLayout.ts  # Task 3: drawing → layout (ELK or sequence) with ref → shapes
      src/pages/defense/present/PresentView.tsx # Task 4: chapters, steps, captions, controls, full screen
                                            #   (useInertOutside, the short-screen rows)
      src/pages/defense/DefensePage.tsx     # Task 4: Present mode, lazy in PresentBoundary, place state, wider frame
      src/pages/defense/testkit.ts          # Task 4: presenter()
      src/router.tsx                        # Task 4: ?mode=present
      src/pages/ListScreen.tsx, TypeView.tsx    # Task 7: the Plan changes "Your Plan changes are settled…" line
      src/pages/VersionChange.tsx           # Task 8: What v<n> changed (or Changed since before v<n>)
      src/pages/ThreadView.tsx              # Tasks 8, 10: What v<n> changed; Park on removed resolved
      src/pages/MessageList.tsx             # Task 10: raised in the plan's v<n>
      src/pages/ProjectHeader.tsx           # Task 10: the re-import that didn't finish (again)
      src/components/AnswerForm.tsx         # Task 10: canPark's comment
      src/api/client.ts                     # Task 9: VersionsView, removeLeftover
      src/pages/versions/VersionsPage.tsx   # Task 9: leftovers
      e2e/claude.ts                         # Task 1: defenseInput() has a presenter
      e2e/present.spec.ts                   # Tasks 4, 11: Present; the smoke's look at it on a real board
      e2e/plan-update.spec.ts               # Task 8: What v2 changed
  scripts/smoke-user.mjs smoke-claude.sh    # Task 11: presenter, what the update left (followUps), the finalizer's
                                            #   pack size and Reads (failing the run), presenter refusals
  scripts/smoke-present.mjs                 # Task 11: Present drawn from the run's presenter, in Playwright
  smoke/RESULTS.md README.md docs/how-it-works.md   # Task 11
```

## Contracts

The exact names and types the tasks share. A task's implementer sees only their own task, so every cross-task name is fixed here.

### Core: the presenter (Task 1)

```ts
// schemas/whiteboard.ts
export const PRESENT_CHAPTERS = [
  { id: 'purpose', title: 'Purpose' },
  { id: 'flow', title: 'System flow' },
  { id: 'data', title: 'Data and source of truth' },
  { id: 'states', title: 'States' },
  { id: 'security', title: 'Security' },
  { id: 'failure', title: 'Failure and retries' },
  { id: 'rollback', title: 'Rollback and blast radius' },
] as const;
export type PresentChapterId = (typeof PRESENT_CHAPTERS)[number]['id'];
export const chapterIds = PRESENT_CHAPTERS.map((c) => c.id) as [PresentChapterId, ...PresentChapterId[]];   // for z.enum
export const noteInkValues = ['ink', 'slate', 'seal', 'moss'] as const;
export type NoteInk = (typeof noteInkValues)[number];
export const MAX_PRESENTER_CHARS = 20_000;
export const drawingSchema = z.union([
  z.object({ kind: z.literal('diagram'), itemId: z.string().min(1) }),
  z.object({ kind: z.literal('tables') }),
  z.object({ kind: z.literal('flow'), itemId: z.string().min(1) }),
]).nullable();
export type Drawing = z.infer<typeof drawingSchema>;
export const presentStepSchema = z.object({
  caption: z.string().trim().min(1).max(300),
  reveal: z.array(z.string().min(1).max(200)).max(40),
  notes: z.array(z.object({ near: z.string().max(120), text: z.string().trim().min(1).max(120), ink: z.enum(noteInkValues) })).max(4).default([]),
});
export type PresentStep = z.infer<typeof presentStepSchema>;
/** What the subagent sends (no titles). */
export const presenterInputSchema = z.object({
  chapters: z.array(z.object({ id: z.string(), drawing: drawingSchema, steps: z.array(presentStepSchema).min(1).max(8) })).max(10),
});
/** Stored: exactly PRESENT_CHAPTERS, in order, with titles. */
export const presenterSchema = z.object({
  chapters: z.array(z.object({ id: z.enum(chapterIds), title: z.string(), drawing: drawingSchema, steps: z.array(presentStepSchema) })),
});
export type Presenter = z.infer<typeof presenterSchema>;
// defenseInputSchema gains: presenter: presenterInputSchema.optional()   (absence is saveDefense's own problem line)
// whiteboardDefenseSchema gains: presenter: presenterSchema.optional()
```

```ts
// schemas/drawings.ts: pure, so the web imports it from @dev-plumbing/core/schemas (the package root pulls in node:fs)
/** The parts of a drawing that `reveal` and `near` may name, with their labels, in drawing order. */
export type DrawingPart = { ref: string; label: string };
/** Every drawable thing of this project, for the pack and for checking. */
export type DrawingOption = { drawing: NonNullable<Drawing>; title: string; parts: DrawingPart[] };
/** A drawing's parts, and what revealing each one also puts on the board (Decision 4), by ref. */
export type DrawingParts = { parts: DrawingPart[]; brings: Record<string, string[]> };
export const refKinds = ['node', 'edge', 'group', 'table', 'link', 'lane', 'step'] as const;
export type RefKind = (typeof refKinds)[number];
/** The model a field points at, or null (the Database screen's rule, moved here). */
export function relationTarget(field: TableDiff['fields'][number], table: TableDiff, models: Set<string>): string | null;
/** Tables as one DiagramData (the web's relationshipStrip, moved here): node ids are model names, edge ids `${model}.${field}`; null under 2 boxes is NOT applied here: one table still draws. */
export function tablesDrawing(tables: TableDiff[]): DiagramData;
/** `node:a` -> { kind: 'node', id: 'a' }; null when the prefix is unknown, or nothing follows it. Only the first colon splits. */
export function parseRef(ref: string): { kind: RefKind; id: string } | null;
export function drawingKey(d: NonNullable<Drawing>): string;   // 'diagram:<itemId>' | 'tables' | 'flow:<itemId>'
export function drawingParts(source: { kind: 'diagram'; data: DiagramData } | { kind: 'tables'; tables: TableDiff[] } | { kind: 'flow'; data: FlowData }): DrawingParts;

// store/drawings.ts: reads the project
export const TABLES_TITLE = 'Tables';
export type ProjectDrawing = DrawingOption & { brings: DrawingParts['brings'] };
/** Items of enabled types, not parked, with data, in id order, by their type's data kind. defenseDiagramItemIds is `.diagram`'s ids. */
export async function drawnItems(dir: string, types: PlumbingType[]): Promise<{ diagram: Item[]; database: Item[]; flows: Item[] }>;
export async function projectDrawings(dir: string, types: PlumbingType[]): Promise<ProjectDrawing[]>;   // what saveDefense checks against
export async function drawingOptions(dir: string, types: PlumbingType[]): Promise<DrawingOption[]>;     // the same, without brings
```

- **Diagram parts:** `node:<id>` (label = the node label), `edge:<id>` (label = the edge label, else `<from label> → <to label>`) and `group:<id>` for each group that holds a box.
- **Tables:**
  - The parts are `table:<model>` and `link:<model>.<field>`, where a link is a field whose type names another drawn table (the strip's rule).
  - The tables drawing is `{ kind: 'tables' }` when at least one database item that isn't parked has valid data.
  - The web keeps `relationshipStrip`'s "null under 2 boxes" for the Database screen, by calling `tablesDrawing` and checking the node count itself.
- **Flow parts:** `lane:<id>` and `step:<n>`, a step labelled `<from label> → <to label>: <label>` (one lane: `<lane label>: <label>`; none: `<label>`). Only flows of kind `system` or `both`, not parked, with lanes.
- **The diagram items** are exactly `defenseDiagramItemIds`.

`saveDefense`:
- requires `presenter` (with the exact "presenter is missing" line);
- checks it, adding the problems to the same list;
- stores it with titles from `PRESENT_CHAPTERS`, in that order.

A chapter's `drawing` must be one of `drawingOptions` (`drawingKey` equality).

### Core: the pack (Task 2)

```ts
// WhiteboardPack gains:
drawings: DrawingOption[];                              // = drawingOptions(dir, types)
chapters: { id: PresentChapterId; title: string }[];   // = PRESENT_CHAPTERS
```

`whiteboard.md` gains a step for the presenter, its JSON shape in the example, and a budget line: "Keep the presenter under about 12,000 characters of JSON." `dp_whiteboard`'s description adds "and the presenter's seven chapters".

### Web: drawing the board (Task 3)

```ts
// diagram/sequenceLayout.ts — pure; SequenceView uses it (no visual change)
export const ROW_H = 44;   // one step's row
export type SequenceLayout = {
  width: number; height: number;
  lanes: { id: string; label: string; status: NodeStatus; x: number; headY: number; headW: number; headH: number; lifeTop: number; lifeBottom: number }[];
  /** `label` is "<n>. <label>", already cut to fit; `top` is the row's top; the label sits at labelX, labelY with `anchor`. */
  steps: { n: number; shape: 'arrow' | 'loop' | 'note'; x1: number; x2: number; y: number; top: number; label: string; labelX: number; labelY: number; anchor: 'start' | 'middle' | 'end' }[];
};
export function sequenceLayout(flow: FlowData): SequenceLayout;
// pages/defense/present/boardLayout.ts
/** One drawable shape on the board, keyed by ref: what to draw, and where a note's marker goes. A ref may have several
 *  shapes, which show together: a lane is its head (a box) and its lifeline (a line). */
export type BoardShape =
  | { ref: string; kind: 'box'; x: number; y: number; w: number; h: number; label: string; dashed: boolean }
  | { ref: string; kind: 'line'; points: { x: number; y: number }[]; label?: string; labelX?: number; labelY?: number;   // labelY: the text's baseline
      anchor?: 'start' | 'middle' | 'end'; arrow: boolean; dashed: boolean; ends: string[] }
  | { ref: string; kind: 'group'; x: number; y: number; w: number; h: number; label: string; members: string[] };
export type Board = { width: number; height: number; shapes: BoardShape[]; tone: 'ink' | 'slate' };
/** Lays a chapter's drawing out. Diagrams and tables use layoutDiagram (ELK, 'RIGHT'); flows use sequenceLayout. */
export async function layoutBoard(drawing: NonNullable<Drawing>, data: unknown): Promise<Board | null>;   // null: nothing it can draw
/** What's on the board after `step` (0-based): the step refs so far that the board has, plus each shown line's ends
 *  (a flow step's are its lanes) and each group with a shown member. Nothing without a board. */
export function shownAt(board: Board | null, steps: PresentStep[], step: number): Set<string>;
// pages/defense/present/rough.ts
export type RoughPath = { d: string; stroke: string; strokeWidth: number };
export function seedOf(ref: string): number;                                       // 1..2^31-1, stable
export function roughShape(shape: BoardShape, stroke: string): RoughPath[];        // generator().toPaths, seeded from the ref
export function roughMarker(around: { x: number; y: number; w: number; h: number }, key: string, stroke: string): RoughPath[];   // a note's ellipse
// pages/defense/present/Board.tsx
export type BoardNote = PresentStep['notes'][number] & { step: number };
export const INK: Record<NoteInk, string>;   // ink, slate, seal, moss → var(--text), var(--slate), var(--seal), var(--moss)
/** A note on the board: the part it rings (`mark`), its wrapped `lines`, and its text's box (`at`). */
export type PlacedNote = { note: BoardNote; key: string; mark: Box; lines: string[]; at: Box };
/** A chapter worked out once (memoised on the board and the steps), so nothing moves between steps: every note placed
 *  step by step and kept where it is, the foot list, and one frame (viewBox) round what the chapter shows by its last
 *  step, its rings and its notes, with a margin. */
export type ChapterBoard = { placed: PlacedNote[]; listed: BoardNote[]; frame: Box | null };
export function chapterBoard(board: Board | null, steps: PresentStep[]): ChapterBoard;
export function BoardView(props: {
  board: Board | null;
  steps: PresentStep[];      // the chapter's steps
  step: number;              // the step on show (0-based): what it adds (over shownAt of the step before) and its notes are the new ones
  animate: boolean; replayKey: number;
  message?: string | null;   // a line on the board: "Drawing…" or "Nothing to draw in this chapter."
  fill?: boolean;            // full screen: the board takes the height it's given
});   // in the page: aspect-ratio from the frame, min-height 220px, max-height calc(100dvh - 220px); the SVG fits the
      // frame (xMidYMid meet); data-testid board (data-animate), board-grid, board-shape (data-ref), board-note
      // (data-near; an li in the foot list)
```
(`Box` is `{ x, y, w, h }`.)

### Web: Present (Task 4)

- **`DefenseMode`** gains `'present'`. `validateSearch` keeps `practice` and `present`; anything else is `study`.
- **`PresentPlace = { chapter: number; step: number }`.** `DefensePage` holds it, keyed by defense id, as it does `PracticePlace`.
- **`PresentView`** takes `PresentViewProps = DefenseViewProps & { place: PresentPlace; onPlace(p: PresentPlace): void }`. It's a named export, loaded with `lazy(() => import('./present/PresentView').then((m) => ({ default: m.PresentView })))`, with a "Drawing…" fallback, inside `PresentBoundary` (`DefensePage.tsx`), an error boundary that says "Present couldn't load. Reload the page.".
- **`useInertOutside(ref, on)`** (`PresentView.tsx`): while full screen is on, every sibling of the overlay and of each of its ancestors, up to `<body>`, is `inert`, and exactly those marks come off after.
- **The board's data comes from the item.** It uses `api.thread(repo, project, 't-' + itemId)` for a diagram or flow, as Study's `DiagramItem` does. For tables, it uses `api.typeItems(repo, project, typeId)` for every type of the project home whose `screen` is `database` (`useQueries`; the home lists enabled types only): every database item that isn't parked, with data, in item-id order, as core's `drawnItems` has them.
- **Test ids:**
  - `present`, `present-chapters`, `present-step`, `present-caption`;
  - `present-prev`, `present-next`, `present-replay`, `present-fullscreen`;
  - `present-overlay`, `present-landscape-hint`, `present-old`;
  - `board`, `board-shape`, `board-note`.

### Core and service: the follow-ups (Tasks 5–10)

```ts
// Task 5, config.ts
const RESERVED_TYPE_IDS = new Map<string, PlumbingType>([['plan-changes', PLAN_CHANGES_TYPE], ['defense', DEFENSE_TYPE]]);   // module-private
export function reservedType(id: string): PlumbingType | undefined;   // for loadConfig and the service's POST /api/rules
export function reservedIdProblem(id: string): string | null;          // the config problem's message; PUT /api/rules/:file refuses with it
// Task 6, store/context.ts
// FinalizePack: rules → rulesFile: string; draft → draftFile: string; previousFinal → previousFinalFile: string | null;
//   items[].body clipped to 800 with '… (clipped: Read file for the rest)'; items[].file: string (set in planItems)
export async function finalizePack(o: { dir: string; types: PlumbingType[]; profile?: RepoProfile; rulesFile: string }): Promise<FinalizePack>;
// Task 7
// project.json gains: caughtUp: z.number().int().min(2).optional(); project.reimporting gains catchUp?: boolean
// store/update.ts
export type SettledEdit = { heading: string | null; find: string; replace: string };
/** What settling v<n>'s Plan changes did: the md edits of their threads' applied, not undone, history/ entries, each
 *  under its passage's heading (the item's mdAnchor). A catch-up's importPack.reimport.changes is these, as a small diff. */
export async function settledEdits(dir: string, n: number): Promise<SettledEdit[]>;
/** The version a catch-up is waiting for, writing nothing and ignoring work in progress: the current version had
 *  conflicts, every Plan changes item of it is resolved or parked, settledEdits isn't empty, and caughtUp is below it.
 *  ProjectHome.catchUpDue is this, not null. */
export async function catchUpWaiting(dir: string): Promise<number | null>;
/** catchUpWaiting, once nothing is in the way: null while an update's journal exists or updateRefusal says anything. Under the lock. */
export async function catchUpDue(dir: string): Promise<number | null>;
/** Starts the catch-up re-import: importPending = importable types, reimporting = { version: n, from: status, catchUp: true },
 *  importBy = windowId, caughtUp = n. Refuses a project that's importing. */
export async function startCatchUp(dir: string, o: { version: number; types: PlumbingType[]; windowId: string; now?: Date }): Promise<{ importTypes: string[] }>;
// ImportPack.reimport gains catchUp: boolean; ProjectHome gains catchUpDue: boolean
// store/importItems.ts: reimportItem takes reimporting ({ version, catchUp? }); a catch-up writes "Updated to match your
//   settled Plan changes." on a changed item's thread, and keeps the flag "Changed in the plan's v<n>."
// Task 8: schemas/views.ts (so the web imports it), store/importItems.ts and store/versionChange.ts
export type ItemVersionChange = { version: number; since: boolean; summary: DiffSegment[] | null; body: DiffSegment[] | null; fields: DiffSegment[] | null; drawing: DiffSegment[] | null };
export const reimportedRel: (n: number, itemId: string) => string;   // docs/versions/v<n>/reimported/<id>.json, written by reimportItem
export async function itemVersionChange(dir: string, itemId: string, types: PlumbingType[]): Promise<ItemVersionChange | null>;
export function dataSummary(item: Item, type: PlumbingType | undefined): string | null;   // store/context.ts, now exported
// ThreadDetail gains: versionChange: ItemVersionChange | null
// Task 9: schemas/views.ts
export type Leftover = { name: string; version: number; at: string };
export type VersionsView = { versions: VersionSummary[]; leftovers: Leftover[] };   // GET …/versions
export function andList(parts: string[]): string;   // "a", "a and b", "a, b and c"
// Task 9: store/update.ts
export type UpdateRecovery = { recovered: boolean; keptChanged: string[]; setAside: string | null; version: number | null };   // version added
export function recoveryLines(note: UpdateRecovery): string[];   // the exact copy, [] when nothing was recovered
export const NOT_A_LEFTOVER = "That folder isn't a leftover from an update.";
export async function listLeftovers(dir: string): Promise<Leftover[]>;
export async function removeLeftover(dir: string, name: string): Promise<void>;   // StoreError NOT_A_LEFTOVER (404) for anything not matching
// Task 10
// messages: raisedIn: z.number().int().min(2).optional() on a Claude message (every opening a re-import writes)
// project.json gains importIncomplete: z.array(z.string()).optional()   (type ids)
//   importIncompleteCatchUp: z.boolean().optional(); importIncompleteTries: z.number().int().min(1).optional()
// ProjectHome gains importIncomplete: { version: number; titles: string[]; again: boolean } | null
export type IncompleteImport = { kind: 'resumed' | 'waits' | 'again'; version: number; importTypes: string[] };
/** Re-imports just the types of importIncomplete, as a re-import of the current version (a catch-up again when it was
 *  one): `resumed`. `waits`, writing nothing, while updateRefusal says anything; `again` once it was cut short twice
 *  (tries back to 1). Null while importing, or with nothing to finish. Under the lock. */
export async function resumeIncompleteImport(dir: string, o: { types: PlumbingType[]; now?: Date }): Promise<IncompleteImport | null>;
```

- **`/open`, in order** (`service/src/routes/claude.ts`):
  1. **Recovery first in every lock.** Task 9's `putBackFirst()` runs `recoverUnfinishedUpdate` at the start of each of `/open`'s project locks (the update check, the unfinished re-import, the catch-up and the bookkeeping), and keeps the `recoveryLines`.
  2. **The update check** (Plan 5), unchanged otherwise.
  3. **The unfinished re-import** (Task 10): when the project wasn't just created and no update ran, `resumeIncompleteImport` under the lock; when it resumes, this window is marked seen and claims the import there. It runs after **Not now** too. When it waits, or was cut short twice, it says so.
  4. **The catch-up** (Task 7): only on the `reopened` path, with a `windowId`, after **Not now** too, and not when an update ran. `catchUpDue` then `startCatchUp` under the lock, with the window marked seen. When it's due but `updateRefusal` holds it back (`catchUpWaiting` isn't null), it says it waits. When step 3 resumed, the project is importing, so the catch-up waits for a later `/dev-plumbing`, and says so: one `/open` starts at most one of the two.
  5. **The bookkeeping** (Plans 1–6): clones, requeues, and `claimImport` for this window.
- **One `telling(lines, next)` helper** (Task 7, beside `updatedLine`) puts the lines first in `next`, as one "Tell the user" sentence; Tasks 9 and 10 use it and don't add another. The lines come in this order: the recovery lines (Task 9), `tell` (Plan 5), the catch-up line (Task 7), the unfinished re-import's line (Task 10: "Finishing it now.", "It waits…" or "didn't finish again"), then Task 7's `waits` (the catch-up waits). On `plan-changed` and `updated`, the recovery lines come first too.
- **The catch-up's `importTypes`** are returned as an update's are.

---

### Task 1: The presenter: its shape, the project's drawings, and checking it on save

The defense gains `presenter`: Present's seven chapters, which the whiteboard subagent sends in the same `dp_whiteboard` call (Task 2 tells it how). `saveDefense` requires it, checks it whole against the project's own drawings with the rest of the defense (Review Focus 1), and stores it with the chapters' titles, while a defense saved before Present still reads. The Database screen's relationship strip moves into core as `tablesDrawing`, so the app draws the tables and the service checks a presenter by one rule.

**Files:**
- Create:
  - `packages/core/src/schemas/drawings.ts`: the pure part (typed refs, a drawing's parts, `tablesDrawing` with `relationTarget`, `parseRef`, `drawingKey`)
  - `packages/core/src/store/drawings.ts`: the project's drawings (`drawnItems`, `projectDrawings`, `drawingOptions`)
  - `packages/core/test/drawings.test.ts`
- Modify:
  - `packages/core/src/schemas/whiteboard.ts` (the presenter's schemas and constants)
  - `packages/core/src/schemas/index.ts` and `packages/core/src/index.ts` (exports)
  - `packages/core/src/store/whiteboard.ts` (`saveDefense` checks and stores the presenter; `defenseDiagramItemIds` reads through `drawnItems`)
  - `packages/core/test/fixtures.ts` (`validDefenseInput()` and `storedDefense()` gain a presenter)
  - `packages/web/src/pages/visual/DatabaseScreen.tsx` (uses core's `tablesDrawing`)
  - `packages/web/e2e/claude.ts` (`defenseInput()` gains a presenter)
- Test:
  - `packages/core/src/schemas/whiteboard.test.ts`
  - `packages/core/test/drawings.test.ts`
  - `packages/core/test/whiteboard.test.ts` (the Review Focus test "a presenter is checked against the project's own drawings")
  - `packages/web/src/pages/visual/database.test.tsx` (its strip and `relationTarget` tests move to `drawings.test.ts`)

**Where the drawings code lives.** The Contracts put `tablesDrawing`, `parseRef` and `drawingKey` in `store/drawings.ts`. But the web imports only `@dev-plumbing/core/schemas`: the package root pulls in `node:fs`, so the browser bundle can't import anything from `store/`. The Database screen (here) and the Present board (Tasks 3 and 4) need those functions, so the pure ones live in `schemas/drawings.ts` and are exported from `@dev-plumbing/core/schemas`, and so from `@dev-plumbing/core` too. `store/drawings.ts` holds `drawingOptions`, which reads the project. The web imports `tablesDrawing`, `parseRef`, `drawingKey`, `DrawingPart` and `DrawingOption` from `@dev-plumbing/core/schemas`.

**Interfaces:**
- Consumes, from Plans 1–6:
  - `parseData`, `dataKindOf` and `displayStatus`, and the types `DiagramData`, `FlowData`, `TableDiff`, `Item` and `PlumbingType` (`core/src/schemas`);
  - `readItems` and `readThreads` (`store/io.ts`);
  - in `store/whiteboard.ts`: `isObject`, `nothingSaved`, `WHITEBOARD_RETRY` and `saveDefense`'s problem list;
  - in the tests: `pair`, `seedProject`, `listType`, `TYPES` and `removeTempDirs`, and `whiteboard.test.ts`'s own `types`, `T0`–`T2`, `RETRY` and `refusal`.
- Produces, as the header's Contracts (the presenter's schemas and `drawingOptions` exactly), plus the helpers they're built from:
  ```ts
  // schemas/whiteboard.ts: PRESENT_CHAPTERS, PresentChapterId, noteInkValues, NoteInk, MAX_PRESENTER_CHARS, drawingSchema,
  // Drawing, presentStepSchema, PresentStep, presenterInputSchema, presenterSchema and Presenter, as the Contracts, and:
  export const chapterIds: [PresentChapterId, ...PresentChapterId[]]; // PRESENT_CHAPTERS' ids, for z.enum
  // defenseInputSchema gains presenter: presenterInputSchema.optional() (saveDefense requires it in its own words)
  // whiteboardDefenseSchema gains presenter: presenterSchema.optional()

  // schemas/drawings.ts: pure, exported from @dev-plumbing/core/schemas
  export type DrawingPart = { ref: string; label: string };
  export type DrawingOption = { drawing: NonNullable<Drawing>; title: string; parts: DrawingPart[] };
  /** A drawing's parts, and what revealing each one also puts on the board. */
  export type DrawingParts = { parts: DrawingPart[]; brings: Record<string, string[]> };
  export const refKinds = ['node', 'edge', 'group', 'table', 'link', 'lane', 'step'] as const;
  export type RefKind = (typeof refKinds)[number];
  export function relationTarget(field: TableDiff['fields'][number], table: TableDiff, models: Set<string>): string | null;
  export function tablesDrawing(tables: TableDiff[]): DiagramData;
  export function parseRef(ref: string): { kind: RefKind; id: string } | null;
  export function drawingKey(d: NonNullable<Drawing>): string;
  export function drawingParts(source: { kind: 'diagram'; data: DiagramData } | { kind: 'tables'; tables: TableDiff[] } | { kind: 'flow'; data: FlowData }): DrawingParts;

  // store/drawings.ts: exported from @dev-plumbing/core
  export const TABLES_TITLE = 'Tables';
  export type ProjectDrawing = DrawingOption & { brings: DrawingParts['brings'] };
  export async function drawnItems(dir: string, types: PlumbingType[]): Promise<{ diagram: Item[]; database: Item[]; flows: Item[] }>;
  export async function projectDrawings(dir: string, types: PlumbingType[]): Promise<ProjectDrawing[]>;
  export async function drawingOptions(dir: string, types: PlumbingType[]): Promise<DrawingOption[]>;
  ```
- **Rules:**
  - **A drawing's parts,** in drawing order (`drawingParts`):
    - a diagram: each node as `node:<id>` (labelled with its label), then each edge as `edge:<id>` (its label, or `<from label> → <to label>` when it has none), then each group that has at least one box as `group:<id>`. A group with no boxes isn't offered: the layout drops it, so there'd be nothing to draw;
    - the tables: `tablesDrawing(tables)`'s boxes as `table:<id>` (the box's label, such as `OldLog (removed)`), then its lines as `link:<model>.<field>` (labelled `<model>.<field> → <the model it points at>`);
    - a flow: each lane as `lane:<id>`, then each step, in `n` order, as `step:<n>`, labelled with the lanes it joins and its label: `<from label> → <to label>: <label>`, `<lane label>: <label>` when only one end is a lane of the flow, and just `<label>` when neither is. So the subagent can tell which lanes a step brings without the flow's data.

    Each label is cut to 120 characters, ending "…", so a flow of long steps doesn't swell the pack.
  - **What revealing a part brings** (`brings`): an edge or a link its two ends, a box in a group its `group:` ref, and a flow step the lanes it goes from and to (each once, and only lanes the flow has). Tasks 3 and 4 draw by the same rule: a line brings its `ends`, and a group shows once a member does.
  - **`drawnItems`**: the items of enabled types, not parked, with `data`, in id order, split by their type's `dataKindOf` into `diagram`, `database` and `flows`. `defenseDiagramItemIds` now returns `drawnItems(dir, types).diagram`'s ids: the same rule as before, kept in one place, so the drawings never import `store/whiteboard.ts` (which would be a cycle).
  - **`projectDrawings`**, in this order:
    - each diagram item, titled with the item's title. One whose data doesn't parse is still there, with no parts, because `diagramItemId` may name it too;
    - `{ kind: 'tables' }`, titled "Tables", when at least one database item's data parses: those tables, in item-id order, drawn together;
    - each flow of kind `system` or `both` with at least one lane, titled with the item's title. A user flow is a storyboard, which Present doesn't draw.

    `drawingOptions` is the same, without `brings`. A chapter's `drawing` must be one of them by `drawingKey`.
  - **`saveDefense`** adds the presenter's problems after the checklist's, in this order:
    1. `presenter is missing. Send the seven chapters too.`, and nothing else about the presenter, when `presenter` is undefined;
    2. `presenter: the presenter is ${n} characters of JSON; the most is 20,000.`, when `JSON.stringify(presenter).length` is over `MAX_PRESENTER_CHARS` (`n` with commas, as the defense's own size line);
    3. `presenter: chapters must come in this order: purpose, flow, data, states, security, failure, rollback.`, when an id isn't one of the seven, or the first copies of the ids aren't in that order;
    4. then for each of the seven chapters, in order, with `where` = `presenter.chapters: ${id}`:
       - `${where} is missing.` and `${where} is there more than once.`;
       - for each copy of it, its drawing: `${where}: there's no diagram item "${itemId}". …`, `${where}: there's no system flow "${itemId}". …` (each ending `Use one of: <the project's ids of that kind>.`, or `There are none, so pick another drawing or none.`), or `${where}: this project has no tables to draw.`. A drawing the project doesn't have, or one the schema refuses, ends that copy's checks: its steps aren't checked against it;
       - then, step by step (`s` from 1): `${where} step ${s}: this chapter draws nothing, so leave reveal empty.` once for a step that reveals anything in a chapter that draws nothing; otherwise, for each ref, `${where} step ${s}: "${ref}" isn't in this drawing.` or `${where} step ${s}: "${ref}" was already revealed in step ${t}.` (`t` is the step that first revealed it, which may be `s` itself);
       - and for each note (`k` from 1) whose `near` isn't `""`: `${where} step ${s} note ${k}: "${near}" isn't on the board yet.` when it isn't on the board after that step. The board holds the refs revealed so far and everything they bring, and nothing in a chapter that draws nothing.

       The same line from two copies of a doubled chapter is listed once, as with the sections.
  - **What's stored:** `presenter: { chapters }`, one per `PRESENT_CHAPTERS` entry in that order, each `{ id, title, drawing, steps }` from the parsed payload (captions and notes trimmed; `notes` is `[]` when left out). Every defense saved from now on has one; `whiteboardDefenseSchema` keeps it optional, so a `defense.json` without one still reads.
- **The fixtures,** which later tasks reuse:
  - `validDefenseInput().presenter` has the seven chapters in order, each with `drawing: null`, so it's valid in any project: the core fixtures' projects have no diagram item, or `architecture-system`, and the service's has `architecture-reminders`. Each has one step, except `flow` with two. Every `reveal` is `[]`, and the notes are all at the board's foot (`near: ''`): `purpose` (ink), `flow` step 2 (seal), `data` (slate), `security` (seal) and `rollback` (moss). `states` and `failure` have none. Every step has `notes` written out (empty or not), so `defenseInputSchema.parse(validDefenseInput())` equals it.
  - `storedDefense().presenter` is that presenter as saved: the same chapters with their `PRESENT_CHAPTERS` titles. A test that wants an old defense takes it out (`const { presenter: _p, ...old } = storedDefense()`).
  - `web/e2e/claude.ts`'s `defenseInput().presenter` has the seven chapters, each `drawing: null` with one step and `reveal: []`. `data`, `failure` and `rollback` each have one note at the board's foot.
  - Every other test that sends a defense uses these, so it carries a valid presenter: `whiteboard-routes.test.ts`, `service/test/whiteboard.test.ts`, `bridge.integration.test.ts`, `tools.test.ts` and the e2e specs through `writeDefense`. None needs changing. A test that builds a defense of its own with `{ ...validDefenseInput(), … }` keeps the presenter.

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/schemas/whiteboard.test.ts`, replace the imports below `vitest`:
```ts
import { storedDefense, validDefenseInput } from '../../test/fixtures';
import {
  BASIS_LABELS,
  DEFENSE_PARTS,
  DEFENSE_SECTIONS,
  defenseInputSchema,
  LEVEL_NAMES,
  practiceSchema,
  sectionIds,
  SEVERITY_LABELS,
  whiteboardDefenseSchema,
  whiteboardRequestSchema,
} from './whiteboard';
```
with:
```ts
import { storedDefense, validDefenseInput } from '../../test/fixtures';
import {
  BASIS_LABELS,
  chapterIds,
  DEFENSE_PARTS,
  DEFENSE_SECTIONS,
  defenseInputSchema,
  LEVEL_NAMES,
  MAX_PRESENTER_CHARS,
  noteInkValues,
  practiceSchema,
  PRESENT_CHAPTERS,
  presenterInputSchema,
  presenterSchema,
  sectionIds,
  SEVERITY_LABELS,
  whiteboardDefenseSchema,
  whiteboardRequestSchema,
} from './whiteboard';
```
and add these three tests just before `it('keeps one request, in one of three states', …)`:
```ts
  it('has seven Present chapters in order, four inks for notes, and a presenter of at most 20,000 characters', () => {
    expect(PRESENT_CHAPTERS.map((c) => [c.id, c.title])).toEqual([
      ['purpose', 'Purpose'],
      ['flow', 'System flow'],
      ['data', 'Data and source of truth'],
      ['states', 'States'],
      ['security', 'Security'],
      ['failure', 'Failure and retries'],
      ['rollback', 'Rollback and blast radius'],
    ]);
    expect(chapterIds).toEqual(['purpose', 'flow', 'data', 'states', 'security', 'failure', 'rollback']);
    expect(noteInkValues).toEqual(['ink', 'slate', 'seal', 'moss']);
    expect(MAX_PRESENTER_CHARS).toBe(20_000);
    expect(validDefenseInput().presenter!.chapters.map((c) => c.id)).toEqual(chapterIds);
  });

  it("takes a presenter's chapters, drawings and steps, trimming what's written, and refuses what's past its limits", () => {
    const chapter = (over: Record<string, unknown> = {}) => ({ id: 'flow', drawing: null, steps: [{ caption: 'It runs daily.', reveal: [] }], ...over });
    const step = (over: Record<string, unknown> = {}) => ({ caption: 'It runs daily.', reveal: [], ...over });
    // Notes default to none; captions and notes are trimmed; a drawing is a diagram item, the tables, a flow or null.
    const parsed = presenterInputSchema.parse({
      chapters: [
        chapter({ steps: [step({ caption: '  It runs daily.  ', reveal: ['node:job'], notes: [{ near: 'node:job', text: ' once a day ', ink: 'seal' }] }), step({ caption: 'Then it sends.' })] }),
        chapter({ drawing: { kind: 'diagram', itemId: 'architecture-system' } }),
        chapter({ drawing: { kind: 'tables', itemId: 'database-reminder' } }),
        chapter({ drawing: { kind: 'flow', itemId: 'flows-send' } }),
      ],
    });
    expect(parsed.chapters[0].steps).toEqual([
      { caption: 'It runs daily.', reveal: ['node:job'], notes: [{ near: 'node:job', text: 'once a day', ink: 'seal' }] },
      { caption: 'Then it sends.', reveal: [], notes: [] },
    ]);
    expect(parsed.chapters.map((c) => c.drawing)).toEqual([null, { kind: 'diagram', itemId: 'architecture-system' }, { kind: 'tables' }, { kind: 'flow', itemId: 'flows-send' }]);
    // Any chapter id is taken here: saveDefense says which are missing, doubled or out of order.
    expect(presenterInputSchema.safeParse({ chapters: [chapter({ id: 'intro' })] }).success).toBe(true);

    const input = validDefenseInput();
    const paths = (...chapters: unknown[]) => problemPaths({ ...input, presenter: { chapters } });
    const note = { near: '', text: 'Careful.', ink: 'seal' };
    expect(paths(chapter({ steps: [] }))).toEqual(['presenter.chapters.0.steps']);
    expect(paths(chapter({ steps: Array.from({ length: 9 }, () => step()) }))).toEqual(['presenter.chapters.0.steps']);
    expect(paths(chapter({ drawing: { kind: 'mockup', itemId: 'ui-card' } }))).toEqual(['presenter.chapters.0.drawing']);
    expect(paths(chapter({ drawing: { kind: 'diagram' } }))).toEqual(['presenter.chapters.0.drawing']);
    expect(paths(chapter({ drawing: undefined }))).toEqual(['presenter.chapters.0.drawing']);
    expect(paths(chapter({ steps: [step({ caption: '  ' })] }))).toEqual(['presenter.chapters.0.steps.0.caption']);
    expect(paths(chapter({ steps: [step({ caption: 'x'.repeat(301) })] }))).toEqual(['presenter.chapters.0.steps.0.caption']);
    expect(paths(chapter({ steps: [step({ reveal: Array.from({ length: 41 }, (_, i) => `node:n${i}`) })] }))).toEqual(['presenter.chapters.0.steps.0.reveal']);
    expect(paths(chapter({ steps: [step({ notes: [note, note, note, note, note] })] }))).toEqual(['presenter.chapters.0.steps.0.notes']);
    expect(paths(chapter({ steps: [step({ notes: [{ ...note, text: 'x'.repeat(121) }] })] }))).toEqual(['presenter.chapters.0.steps.0.notes.0.text']);
    expect(paths(chapter({ steps: [step({ notes: [{ ...note, near: 'x'.repeat(121) }] })] }))).toEqual(['presenter.chapters.0.steps.0.notes.0.near']);
    expect(paths(chapter({ steps: [step({ notes: [{ ...note, ink: 'red' }] })] }))).toEqual(['presenter.chapters.0.steps.0.notes.0.ink']);
    expect(paths(...Array.from({ length: 11 }, () => chapter()))).toEqual(['presenter.chapters']);
    // A missing presenter is saveDefense's own line, so the schema takes a defense without one.
    const { presenter: _presenter, ...without } = input;
    expect(problemPaths(without)).toEqual([]);
  });

  it('reads a stored defense with its presenter, and one saved before Present without one', () => {
    const defense = storedDefense();
    expect(defense.presenter!.chapters.map((c) => c.title)).toEqual(PRESENT_CHAPTERS.map((c) => c.title));
    expect(whiteboardDefenseSchema.parse(JSON.parse(JSON.stringify(defense)))).toEqual(defense);
    const { presenter: _presenter, ...old } = defense;
    const parsed = whiteboardDefenseSchema.parse(JSON.parse(JSON.stringify(old)));
    expect(parsed).toEqual(old);
    expect(parsed.presenter).toBeUndefined();
    // A stored chapter is one of the seven.
    expect(presenterSchema.safeParse({ chapters: [{ id: 'intro', title: 'Intro', drawing: null, steps: [] }] }).success).toBe(false);
  });
```

Create `packages/core/test/drawings.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { drawingKey, drawingParts, parseRef, relationTarget, tablesDrawing, type DiagramData, type FlowData, type Item, type PlumbingType, type TableDiff, type Thread } from '../src/schemas';
import { drawingOptions, projectDrawings } from '../src/store/drawings';
import { defenseDiagramItemIds } from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const types: PlumbingType[] = [
  ...TYPES,
  listType('database', { title: 'Database', screen: 'database', order: 2 }),
  listType('flows', { title: 'Flows', screen: 'flows', order: 4 }),
  listType('sketches', { title: 'Sketches', screen: 'diagram', order: 8, enabled: false }),
];
const DIAGRAM: DiagramData = {
  kind: 'system',
  groups: [{ id: 'aws', label: 'AWS' }],
  nodes: [
    { id: 'job', label: 'Daily reminder job', group: 'aws', status: 'new' },
    { id: 'db', label: 'Postgres', group: 'aws', status: 'unchanged' },
    { id: 'mailer', label: 'Mailer', status: 'external' },
  ],
  edges: [
    { id: 'reads', from: 'job', to: 'db', label: 'finds due subscriptions' },
    { id: 'sends', from: 'job', to: 'mailer' },
  ],
};
const reminder: TableDiff = {
  model: 'RestockReminder',
  change: 'new',
  fields: [
    { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
    { name: 'subscriptionId', type: 'String', change: 'added' },
    { name: 'subscription', type: 'Subscription', change: 'added', note: 'The subscription it reminds about.' },
    { name: 'sentAt', type: 'DateTime', change: 'added', default: 'now()' },
  ],
  schemaDiff: '+model RestockReminder {\n+  id String @id @default(cuid())\n+  sentAt DateTime @default(now())\n+}',
  migration: [{ kind: 'additive', text: 'Create the RestockReminder table.' }],
};
const subscription: TableDiff = {
  model: 'Subscription',
  change: 'changed',
  fields: [
    { name: 'id', type: 'String', change: 'unchanged' },
    { name: 'customerId', type: 'String', change: 'unchanged' },
    { name: 'customer', type: 'Customer', change: 'unchanged' },
    { name: 'status', type: 'SubscriptionStatus', change: 'unchanged' },
    { name: 'remindDaysBefore', type: 'Int', change: 'added', default: '5' },
    { name: 'reminders', type: 'RestockReminder[]', change: 'added' },
    { name: 'legacyNote', type: 'String?', change: 'removed' },
  ],
  schemaDiff: ' model Subscription {\n+  remindDaysBefore Int @default(5)\n-  legacyNote String?\n }',
};
const SEND: FlowData = {
  kind: 'system',
  lanes: [
    { id: 'job', label: 'Reminder job', status: 'new' },
    { id: 'mailer', label: 'Mailer', status: 'external' },
    { id: 'customer', label: 'Customer', status: 'unchanged' },
  ],
  // Written out of order: the parts come in step order.
  steps: [
    { n: 2, from: 'mailer', to: 'customer', label: 'Emails the customer' },
    { n: 1, from: 'job', to: 'mailer', label: 'Hands over the reminder' },
    { n: 3, label: 'Logs it' },
  ],
};

/** An item with a drawing, and its thread. */
const drawn = (id: string, o: Parameters<typeof pair>[1] & { data: unknown }) => {
  const p = pair(id, o);
  return { item: { ...p.item, data: o.data }, thread: p.thread };
};

/**
 * A diagram item with a group, one with no drawing yet and one whose drawing doesn't parse; two tables with links and a
 * parked one; a system flow, a flow of both kinds, a user flow and a system flow with no lanes; and a drawing of a
 * type that's turned off.
 */
async function seed(): Promise<string> {
  const pairs: { item: Item; thread: Thread }[] = [
    drawn('architecture-system', { type: 'architecture', title: 'System view', data: DIAGRAM }),
    pair('architecture-later', { type: 'architecture', title: 'Later view' }),
    drawn('architecture-broken', { type: 'architecture', title: 'Broken view', data: { kind: 'system', nodes: [] } }),
    drawn('database-reminder', { type: 'database', title: 'Reminder table', data: reminder }),
    drawn('database-subscription', { type: 'database', title: 'Subscription table', data: subscription }),
    drawn('database-old', { type: 'database', title: 'Old log', status: 'parked', data: { ...reminder, model: 'OldLog' } }),
    drawn('flows-send', { type: 'flows', title: 'Sending a reminder', data: SEND }),
    drawn('flows-reorder', { type: 'flows', title: 'Reordering', data: { kind: 'both', lanes: [{ id: 'app', label: 'App', status: 'changed' }], steps: [{ n: 1, from: 'app', to: 'app', label: 'Reorders' }] } }),
    drawn('flows-browse', { type: 'flows', title: 'Browsing', data: { kind: 'user', steps: [{ n: 1, label: 'Opens the reminder' }] } }),
    drawn('flows-bare', { type: 'flows', title: 'No lanes', data: { kind: 'system', steps: [{ n: 1, label: 'Runs' }] } }),
    drawn('sketches-old', { type: 'sketches', title: 'Old sketch', data: DIAGRAM }),
  ];
  return seedProject({ pairs });
}

describe("a project's drawings", () => {
  it('offers each diagram item, the tables that are not parked, and each system flow with lanes', async () => {
    const dir = await seed();
    const options = await drawingOptions(dir, types);
    expect(options.map((o) => [drawingKey(o.drawing), o.title])).toEqual([
      ['diagram:architecture-broken', 'Broken view'],
      ['diagram:architecture-system', 'System view'],
      ['tables', 'Tables'],
      ['flow:flows-reorder', 'Reordering'],
      ['flow:flows-send', 'Sending a reminder'],
    ]);
    // The diagram items are exactly the ones a section's diagramItemId may name. One whose drawing doesn't parse has
    // nothing to reveal.
    expect(options.flatMap((o) => (o.drawing.kind === 'diagram' ? [o.drawing.itemId] : []))).toEqual(await defenseDiagramItemIds(dir, types));
    expect(options[0].parts).toEqual([]);
    expect(options[1]).toEqual({
      drawing: { kind: 'diagram', itemId: 'architecture-system' },
      title: 'System view',
      parts: [
        { ref: 'node:job', label: 'Daily reminder job' },
        { ref: 'node:db', label: 'Postgres' },
        { ref: 'node:mailer', label: 'Mailer' },
        { ref: 'edge:reads', label: 'finds due subscriptions' },
        // A line with no label is named by its ends.
        { ref: 'edge:sends', label: 'Daily reminder job → Mailer' },
        { ref: 'group:aws', label: 'AWS' },
      ],
    });
    // The two tables that aren't parked, drawn together, with the model they point at.
    expect(options[2]).toEqual({
      drawing: { kind: 'tables' },
      title: 'Tables',
      parts: [
        { ref: 'table:RestockReminder', label: 'RestockReminder' },
        { ref: 'table:Subscription', label: 'Subscription' },
        { ref: 'table:Customer', label: 'Customer' },
        { ref: 'link:RestockReminder.subscription', label: 'RestockReminder.subscription → Subscription' },
        { ref: 'link:Subscription.customer', label: 'Subscription.customer → Customer' },
        { ref: 'link:Subscription.reminders', label: 'Subscription.reminders → RestockReminder' },
      ],
    });
    // A step says which lanes it joins, so a note near a lane can be placed without the flow's data.
    expect(options[4].parts).toEqual([
      { ref: 'lane:job', label: 'Reminder job' },
      { ref: 'lane:mailer', label: 'Mailer' },
      { ref: 'lane:customer', label: 'Customer' },
      { ref: 'step:1', label: 'Reminder job → Mailer: Hands over the reminder' },
      { ref: 'step:2', label: 'Mailer → Customer: Emails the customer' },
      { ref: 'step:3', label: 'Logs it' },
    ]);
    // What saveDefense checks with also knows what each part brings onto the board.
    expect((await projectDrawings(dir, types)).map((d) => ({ drawing: d.drawing, title: d.title, parts: d.parts }))).toEqual(options);
  });

  it('has no tables to draw when every table is parked, and nothing at all in a plain project', async () => {
    const parked = await seedProject({ pairs: [drawn('database-old', { type: 'database', title: 'Old log', status: 'parked', data: reminder })] });
    expect(await drawingOptions(parked, types)).toEqual([]);
    expect(await drawingOptions(await seedProject({ pairs: [pair('q1')] }), types)).toEqual([]);
  });
});

describe('the parts of a drawing', () => {
  it('names each part by a typed ref and brings along what it needs: a line its ends, a step its lanes, a box its group', () => {
    expect(drawingParts({ kind: 'diagram', data: DIAGRAM }).brings).toEqual({
      'node:job': ['group:aws'],
      'node:db': ['group:aws'],
      'edge:reads': ['node:job', 'node:db'],
      'edge:sends': ['node:job', 'node:mailer'],
    });
    expect(drawingParts({ kind: 'tables', tables: [reminder, subscription] }).brings).toEqual({
      'link:RestockReminder.subscription': ['table:RestockReminder', 'table:Subscription'],
      'link:Subscription.customer': ['table:Subscription', 'table:Customer'],
      'link:Subscription.reminders': ['table:Subscription', 'table:RestockReminder'],
    });
    // A step on one lane brings that lane once; a step on no lane brings nothing.
    const loop: FlowData = { ...SEND, steps: [...SEND.steps, { n: 4, from: 'job', to: 'job', label: 'Waits a day' }] };
    expect(drawingParts({ kind: 'flow', data: loop }).brings).toEqual({
      'step:1': ['lane:job', 'lane:mailer'],
      'step:2': ['lane:mailer', 'lane:customer'],
      'step:4': ['lane:job'],
    });
    // A step from or to one lane only is labelled with that lane.
    const oneEnd = drawingParts({ kind: 'flow', data: { ...SEND, steps: [{ n: 1, from: 'mailer', label: 'Retries' }] } });
    expect(oneEnd.parts.at(-1)).toEqual({ ref: 'step:1', label: 'Mailer: Retries' });
    // A group with no boxes isn't offered: the layout drops it, so revealing it would draw nothing.
    const empty = drawingParts({ kind: 'diagram', data: { ...DIAGRAM, groups: [...DIAGRAM.groups, { id: 'later', label: 'Later' }] } });
    expect(empty.parts.map((p) => p.ref)).toEqual(['node:job', 'node:db', 'node:mailer', 'edge:reads', 'edge:sends', 'group:aws']);
  });

  it('cuts a long label to 120 characters', () => {
    const long = 'Sends the reminder by email, and by SMS when the customer asked for it, then logs it. '.repeat(3);
    const [, , step] = drawingParts({ kind: 'flow', data: { ...SEND, lanes: SEND.lanes!.slice(0, 2), steps: [{ n: 1, from: 'job', to: 'mailer', label: long }] } }).parts;
    expect(step.label).toHaveLength(120);
    expect(step.label).toBe(`${`Reminder job → Mailer: ${long}`.slice(0, 119)}…`);
  });
});

describe('the tables drawing', () => {
  it('draws each table, the models they point at, and a line per relation, and skips enums', () => {
    const strip = tablesDrawing([reminder, subscription, { ...reminder, model: 'OldLog', change: 'removed', fields: [], migration: [] }]);
    expect(strip.nodes).toEqual([
      { id: 'RestockReminder', label: 'RestockReminder', status: 'new' },
      { id: 'Subscription', label: 'Subscription', status: 'changed' },
      { id: 'OldLog', label: 'OldLog (removed)', status: 'changed' },
      { id: 'Customer', label: 'Customer', status: 'unchanged' },
    ]);
    expect(strip.edges.map((e) => [e.id, e.from, e.to, e.label])).toEqual([
      ['RestockReminder.subscription', 'RestockReminder', 'Subscription', 'subscription'],
      ['Subscription.customer', 'Subscription', 'Customer', 'customer'],
      ['Subscription.reminders', 'Subscription', 'RestockReminder', 'reminders'],
    ]);
  });

  it('still draws one table on its own', () => {
    expect(tablesDrawing([{ ...reminder, fields: [{ name: 'id', type: 'String', change: 'added' }] }])).toEqual({
      kind: 'system',
      groups: [],
      nodes: [{ id: 'RestockReminder', label: 'RestockReminder', status: 'new' }],
      edges: [],
    });
  });

  it('only counts a single model field as a relation with its foreign key', () => {
    const models = new Set(['Subscription']);
    expect(relationTarget({ name: 'status', type: 'SubscriptionStatus', change: 'unchanged' }, subscription, models)).toBeNull();
    expect(relationTarget({ name: 'customer', type: 'Customer', change: 'unchanged' }, subscription, models)).toBe('Customer');
    expect(relationTarget({ name: 'orders', type: 'Order[]', change: 'added' }, subscription, models)).toBe('Order');
    expect(relationTarget({ name: 'when', type: 'DateTime?', change: 'added' }, subscription, models)).toBeNull();
  });
});

describe('refs', () => {
  it('reads each of the seven prefixes, and nothing else', () => {
    expect(['node:job', 'edge:e1', 'group:aws', 'table:RestockReminder', 'link:Subscription.customer', 'lane:mailer', 'step:3'].map(parseRef)).toEqual([
      { kind: 'node', id: 'job' },
      { kind: 'edge', id: 'e1' },
      { kind: 'group', id: 'aws' },
      { kind: 'table', id: 'RestockReminder' },
      { kind: 'link', id: 'Subscription.customer' },
      { kind: 'lane', id: 'mailer' },
      { kind: 'step', id: '3' },
    ]);
    // Only the first colon splits: a diagram's own ids may hold one.
    expect(parseRef('node:a:b')).toEqual({ kind: 'node', id: 'a:b' });
    for (const bad of ['job', 'box:job', 'node:', ':job', 'Node:job', '']) expect(parseRef(bad), bad).toBeNull();
  });

  it('keys each drawing', () => {
    expect(drawingKey({ kind: 'diagram', itemId: 'architecture-system' })).toBe('diagram:architecture-system');
    expect(drawingKey({ kind: 'tables' })).toBe('tables');
    expect(drawingKey({ kind: 'flow', itemId: 'flows-send' })).toBe('flow:flows-send');
  });
});
```

In `packages/core/test/whiteboard.test.ts`, replace the import from `'../src/schemas'`:
```ts
import { itemSchema, type DefenseInput, type DiagramData, type Item, type Practice, type WhiteboardRequest } from '../src/schemas';
```
with:
```ts
import { itemSchema, MAX_PRESENTER_CHARS, PRESENT_CHAPTERS, type DefenseInput, type DiagramData, type Item, type Practice, type WhiteboardRequest } from '../src/schemas';
```
replace the import from `'./fixtures'`:
```ts
import { DRAFT, pair, seedProject, storedDefense, TYPES, validDefenseInput } from './fixtures';
```
with:
```ts
import { DRAFT, listType, pair, seedProject, storedDefense, TYPES, validDefenseInput } from './fixtures';
```
and add this block between `describe('checking the defense before it is saved', …)` and `describe('a defense out of date', …)`:
```ts
describe("the defense's presenter", () => {
  const presentTypes = [...types, listType('database', { title: 'Database', screen: 'database', order: 2 }), listType('flows', { title: 'Flows', screen: 'flows', order: 4 })];
  /** Two boxes in a group, one outside it, and a line to each. */
  const BOARD: DiagramData = {
    kind: 'system',
    groups: [{ id: 'aws', label: 'AWS' }],
    nodes: [
      { id: 'job', label: 'Daily reminder job', group: 'aws', status: 'new' },
      { id: 'db', label: 'Postgres', group: 'aws', status: 'unchanged' },
      { id: 'mailer', label: 'Mailer', status: 'external' },
    ],
    edges: [
      { id: 'reads', from: 'job', to: 'db', label: 'finds due subscriptions' },
      { id: 'sends', from: 'job', to: 'mailer' },
    ],
  };
  /** A project with a diagram item drawn as BOARD, a parked diagram item, a user flow, and no tables or system flows. */
  async function presentSeed(): Promise<string> {
    const diagram = pair('architecture-system', { type: 'architecture', title: 'System overview', status: 'resolved' });
    diagram.item.data = BOARD;
    const parked = pair('architecture-old', { type: 'architecture', title: 'Old overview', status: 'parked' });
    parked.item.data = BOARD;
    const browse = pair('flows-browse', { type: 'flows', title: 'Browsing', status: 'resolved' });
    browse.item.data = { kind: 'user', steps: [{ n: 1, label: 'Opens the reminder' }] };
    return seedProject({ pairs: [diagram, parked, browse, pair('q1', { title: 'Who gets reminders?' })] });
  }
  /** A presenter the project above can draw: System flow and Security draw the diagram, the rest draw nothing. */
  const GOOD = {
    chapters: [
      // Notes may be left out, and a caption is trimmed.
      { id: 'purpose', drawing: null, steps: [{ caption: '  Customers forget to reorder, so a daily job reminds them.  ', reveal: [] }] },
      {
        id: 'flow',
        drawing: { kind: 'diagram', itemId: 'architecture-system' },
        steps: [
          // The job's group comes with it, and a line's ends with the line.
          { caption: 'Each morning the job wakes up.', reveal: ['node:job'], notes: [{ near: 'group:aws', text: 'one region', ink: 'slate' }] },
          { caption: 'It finds the subscriptions due soon.', reveal: ['edge:reads'], notes: [{ near: 'node:db', text: 'billing owns the renewal date', ink: 'slate' }] },
          { caption: 'And hands each reminder to the mailer.', reveal: ['edge:sends'], notes: [{ near: 'node:mailer', text: 'runs twice? → one per subscription per day', ink: 'seal' }] },
        ],
      },
      { id: 'data', drawing: null, steps: [{ caption: 'The reminders table records what was sent.', reveal: [], notes: [{ near: '', text: 'source of truth: the reminders table', ink: 'slate' }] }] },
      { id: 'states', drawing: null, steps: [{ caption: 'A subscription is due, or reminded today.', reveal: [] }] },
      { id: 'security', drawing: { kind: 'diagram', itemId: 'architecture-system' }, steps: [{ caption: 'Only the job talks to the mailer.', reveal: ['edge:sends'], notes: [{ near: 'group:aws', text: 'inside the account', ink: 'moss' }] }] },
      { id: 'failure', drawing: null, steps: [{ caption: 'A failed send is tried again on the next run.', reveal: [] }] },
      { id: 'rollback', drawing: null, steps: [{ caption: 'Turn the job off: nothing else depends on it.', reveal: [], notes: [{ near: '', text: 'blast radius: reminder emails only', ink: 'moss' }] }] },
    ],
  };
  /** A step at the schema's limits: a 300-character caption and four 120-character notes at the board's foot. */
  const fullStep = (n: number) => ({
    caption: `${n}. ${'Say this part out loud. '.repeat(20)}`.slice(0, 300),
    reveal: [],
    notes: Array.from({ length: 4 }, (_, k) => ({ near: '', text: `${k + 1}. ${'Mark this on the board. '.repeat(10)}`.slice(0, 120), ink: 'ink' })),
  });
  const fullSteps = Array.from({ length: 8 }, (_, i) => fullStep(i + 1));

  it("a presenter is checked against the project's own drawings", async () => {
    const dir = await presentSeed();
    const request0 = await requestWhiteboard(dir, { now: T0 });
    await pickUpWhiteboard(dir, 'w-a', T1);
    await saveDefense(dir, { requestId: request0.id, defense: validDefenseInput(), types: presentTypes, now: T2 });
    const before = await fs.readFile(projectFiles(dir).defense, 'utf8');
    const request = await requestWhiteboard(dir);
    const writing = await pickUpWhiteboard(dir, 'w-a');
    const save = (presenter: unknown) => refusal(saveDefense(dir, { requestId: request.id, defense: { ...validDefenseInput(), presenter }, types: presentTypes }));

    // Every kind of problem at once.
    const bad = {
      chapters: [
        // A chapter that draws nothing reveals nothing.
        { id: 'purpose', drawing: null, steps: [{ caption: 'Why it exists.', reveal: ['node:job'] }] },
        {
          id: 'flow',
          drawing: { kind: 'diagram', itemId: 'architecture-system' },
          steps: [
            // A box the drawing doesn't have, and a note near one that isn't drawn yet.
            { caption: 'The job.', reveal: ['node:job', 'node:queue'], notes: [{ near: 'node:mailer', text: 'external', ink: 'seal' }] },
            // A box revealed again. The line brings the mailer, so the note is fine now.
            { caption: 'It sends.', reveal: ['edge:sends', 'node:job'], notes: [{ near: 'node:mailer', text: 'retries are theirs', ink: 'seal' }] },
          ],
        },
        // States comes before Data, and draws a parked item.
        { id: 'states', drawing: { kind: 'diagram', itemId: 'architecture-old' }, steps: [{ caption: 'Due or reminded.', reveal: ['node:job'] }] },
        // The project has no tables, and its only flow is a user's.
        { id: 'data', drawing: { kind: 'tables' }, steps: [{ caption: 'The reminders table.', reveal: ['table:RestockReminder'] }] },
        { id: 'security', drawing: { kind: 'flow', itemId: 'flows-browse' }, steps: fullSteps },
        // Failure and retries is missing, and Rollback is there twice: with all these long steps, it's too big.
        { id: 'rollback', drawing: null, steps: fullSteps },
        { id: 'rollback', drawing: null, steps: fullSteps },
      ],
    };
    const size = JSON.stringify(bad).length;
    expect(size).toBeGreaterThan(MAX_PRESENTER_CHARS);
    expect(await save(bad)).toEqual({
      type: 'InputError',
      message: [
        RETRY,
        `- presenter: the presenter is ${size.toLocaleString('en-US')} characters of JSON; the most is 20,000.`,
        '- presenter: chapters must come in this order: purpose, flow, data, states, security, failure, rollback.',
        '- presenter.chapters: purpose step 1: this chapter draws nothing, so leave reveal empty.',
        '- presenter.chapters: flow step 1: "node:queue" isn\'t in this drawing.',
        '- presenter.chapters: flow step 1 note 1: "node:mailer" isn\'t on the board yet.',
        '- presenter.chapters: flow step 2: "node:job" was already revealed in step 1.',
        '- presenter.chapters: data: this project has no tables to draw.',
        '- presenter.chapters: states: there\'s no diagram item "architecture-old". Use one of: architecture-system.',
        '- presenter.chapters: security: there\'s no system flow "flows-browse". There are none, so pick another drawing or none.',
        '- presenter.chapters: failure is missing.',
        '- presenter.chapters: rollback is there more than once.',
      ].join('\n'),
    });
    expect(await fs.readFile(projectFiles(dir).defense, 'utf8')).toBe(before);
    expect(await readWhiteboardRequest(dir)).toEqual(writing);

    // A defense with no presenter is refused too, in its own words.
    const { presenter: _presenter, ...without } = validDefenseInput();
    expect(await refusal(saveDefense(dir, { requestId: request.id, defense: without, types: presentTypes }))).toEqual({
      type: 'InputError',
      message: `${RETRY}\n- presenter is missing. Send the seven chapters too.`,
    });
    expect(await fs.readFile(projectFiles(dir).defense, 'utf8')).toBe(before);
    expect(await readWhiteboardRequest(dir)).toEqual(writing);

    // A valid one is saved with the chapters' titles, in order.
    const saved = await saveDefense(dir, { requestId: request.id, defense: { ...validDefenseInput(), presenter: GOOD }, types: presentTypes });
    expect(saved.presenter!.chapters.map((c) => [c.id, c.title])).toEqual(PRESENT_CHAPTERS.map((c) => [c.id, c.title]));
    expect(saved.presenter!.chapters[0].steps).toEqual([{ caption: 'Customers forget to reorder, so a daily job reminds them.', reveal: [], notes: [] }]);
    expect(saved.presenter!.chapters[1]).toEqual({ id: 'flow', title: 'System flow', drawing: { kind: 'diagram', itemId: 'architecture-system' }, steps: GOOD.chapters[1].steps });
    expect(await readDefense(dir)).toEqual(saved);
    expect(await readWhiteboardRequest(dir)).toBeNull();

    // A defense saved before Present, with no presenter, still reads.
    const { presenter: _saved, ...old } = saved;
    await writeDefense(dir, old);
    expect(await readDefense(dir)).toEqual(old);
    expect((await readDefense(dir))!.presenter).toBeUndefined();
  });
});
```

In `packages/web/src/pages/visual/database.test.tsx`, the strip's drawing and `relationTarget` are core's now, tested in `drawings.test.ts`. Replace the first import:
```ts
import type { TableDiff } from '@dev-plumbing/core/schemas';
```
with:
```ts
import { tablesDrawing, type TableDiff } from '@dev-plumbing/core/schemas';
```
replace:
```ts
import { DatabaseScreen, migrationHeadline, relationshipStrip, relationTarget, TableCard } from './DatabaseScreen';
```
with:
```ts
import { DatabaseScreen, migrationHeadline, relationshipStrip, TableCard } from './DatabaseScreen';
```
and replace the whole `describe('the relationship strip', …)` block (its three tests, "draws each table, the models they point at, and a line per relation, and skips enums", "is left out with fewer than two boxes" and "only counts a single model field as a relation with its foreign key") with:
```ts
describe('the relationship strip', () => {
  // How the tables are drawn is core's tablesDrawing, tested there. The screen leaves out a strip of fewer than two boxes.
  it("is core's tables drawing", () => {
    expect(relationshipStrip([reminder, subscription])).toEqual(tablesDrawing([reminder, subscription]));
  });

  it('is left out with fewer than two boxes', () => {
    expect(relationshipStrip([{ ...reminder, fields: [{ name: 'id', type: 'String', change: 'added' }] }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/src/schemas/whiteboard.test.ts packages/core/test/drawings.test.ts packages/core/test/whiteboard.test.ts packages/web/src/pages/visual/database.test.tsx`
Expected: FAIL.
- `drawings.test.ts` doesn't load: `Error: Cannot find module '../src/store/drawings'`.
- The three new schema tests fail on what isn't there yet (`TypeError: Cannot read properties of undefined (reading 'map')`, `(reading 'parse')` and `(reading 'chapters')`).
- "a presenter is checked against the project's own drawings" fails: `TypeError: expected value must be number or bigint, received "undefined"` (`MAX_PRESENTER_CHARS`).
- "is core's tables drawing" fails: `TypeError: tablesDrawing is not a function`.

The other tests in those files still pass.

- [ ] **Step 3: The presenter's schemas, and the pure drawing helpers**

In `packages/core/src/schemas/whiteboard.ts`, add the presenter's constants and schemas between `defenseTableSchema` and `defenseInputSchema`. Replace:
```ts
export type DefenseTable = z.infer<typeof defenseTableSchema>;

/** What the whiteboard subagent sends with dp_whiteboard. */
```
with:
```ts
export type DefenseTable = z.infer<typeof defenseTableSchema>;

/** Present's seven chapters (spec §12), in order. The subagent sends their ids; the service fills in the titles. */
export const PRESENT_CHAPTERS = [
  { id: 'purpose', title: 'Purpose' },
  { id: 'flow', title: 'System flow' },
  { id: 'data', title: 'Data and source of truth' },
  { id: 'states', title: 'States' },
  { id: 'security', title: 'Security' },
  { id: 'failure', title: 'Failure and retries' },
  { id: 'rollback', title: 'Rollback and blast radius' },
] as const;
export type PresentChapterId = (typeof PRESENT_CHAPTERS)[number]['id'];
export const chapterIds = PRESENT_CHAPTERS.map((c) => c.id) as [PresentChapterId, ...PresentChapterId[]];
/** A note's marker: ink for structure, slate for data, seal for a risk, moss for what's safe. */
export const noteInkValues = ['ink', 'slate', 'seal', 'moss'] as const;
export type NoteInk = (typeof noteInkValues)[number];
/** A presenter is at most this many characters of JSON. */
export const MAX_PRESENTER_CHARS = 20_000;
/** What a chapter draws: a diagram item, the project's tables, a system flow, or nothing (null). */
export const drawingSchema = z
  .union([
    z.object({ kind: z.literal('diagram'), itemId: z.string().min(1) }),
    z.object({ kind: z.literal('tables') }),
    z.object({ kind: z.literal('flow'), itemId: z.string().min(1) }),
  ])
  .nullable();
export type Drawing = z.infer<typeof drawingSchema>;
/**
 * One step of a chapter: the caption to say out loud, the parts of the chapter's drawing it adds to the board (typed
 * refs such as node:job, see schemas/drawings.ts), and up to four marker notes. A note's `near` is a part already on
 * the board, or "" for a note written at the board's foot.
 */
export const presentStepSchema = z.object({
  caption: z.string().trim().min(1).max(300),
  reveal: z.array(z.string().min(1).max(200)).max(40),
  notes: z.array(z.object({ near: z.string().max(120), text: z.string().trim().min(1).max(120), ink: z.enum(noteInkValues) })).max(4).default([]),
});
export type PresentStep = z.infer<typeof presentStepSchema>;
/** What the subagent sends (no titles). Missing, doubled and out-of-order chapters: saveDefense says so. */
export const presenterInputSchema = z.object({
  chapters: z.array(z.object({ id: z.string(), drawing: drawingSchema, steps: z.array(presentStepSchema).min(1).max(8) })).max(10),
});
/** Stored: exactly PRESENT_CHAPTERS, in order, with titles. */
export const presenterSchema = z.object({
  chapters: z.array(z.object({ id: z.enum(chapterIds), title: z.string(), drawing: drawingSchema, steps: z.array(presentStepSchema) })),
});
export type Presenter = z.infer<typeof presenterSchema>;

/** What the whiteboard subagent sends with dp_whiteboard. */
```
In `defenseInputSchema`, replace:
```ts
  // Empty when the rules file has a checklist: the service copies that one (saveDefense).
  checklist: z.array(z.string().trim().min(1).max(300)).max(40),
});
```
with:
```ts
  // Empty when the rules file has a checklist: the service copies that one (saveDefense).
  checklist: z.array(z.string().trim().min(1).max(300)).max(40),
  // Required: saveDefense says so in its own words, so a missing one is listed with the rest.
  presenter: presenterInputSchema.optional(),
});
```
and in `whiteboardDefenseSchema`, replace:
```ts
  exportedTo: z.object({ clone: z.string(), path: z.string(), at: z.string() }).optional(),
});
```
with:
```ts
  exportedTo: z.object({ clone: z.string(), path: z.string(), at: z.string() }).optional(),
  /** Present's chapters. A defense saved before Present has none, and still reads. */
  presenter: presenterSchema.optional(),
});
```

Create `packages/core/src/schemas/drawings.ts`. `relationTarget` and the strip's body are `DatabaseScreen.tsx`'s, moved as they are; the strip no longer returns null under two boxes (the Database screen keeps that rule, Step 7):
```ts
import type { DiagramData, FlowData, TableDiff } from './data';
import type { Drawing } from './whiteboard';

// What Present may draw (spec §12): a diagram item, the project's tables or a system flow. A presenter's steps name the
// parts of a drawing by typed refs, so an id is never ambiguous: node:, edge: and group: for a diagram, table: and
// link: for the tables, lane: and step: for a flow. These are pure, so the web draws a board by the same rules the
// service checks a presenter with. store/drawings.ts reads a project's own drawings.

/** A part of a drawing that a step's `reveal` and a note's `near` may name, with its label. */
export type DrawingPart = { ref: string; label: string };
/** A drawing this project has, for the whiteboard subagent's pack and for checking a presenter. */
export type DrawingOption = { drawing: NonNullable<Drawing>; title: string; parts: DrawingPart[] };
/**
 * A drawing's parts, in drawing order, and what revealing each one also puts on the board (`brings`, by ref): a line
 * its two ends, a flow step the lanes it goes between, and a box the group it's in.
 */
export type DrawingParts = { parts: DrawingPart[]; brings: Record<string, string[]> };

export const refKinds = ['node', 'edge', 'group', 'table', 'link', 'lane', 'step'] as const;
export type RefKind = (typeof refKinds)[number];

/** A part's label is cut to this many characters (ending "…"), so a flow of long steps doesn't swell the pack. */
const LABEL_MAX = 120;
const clipLabel = (label: string) => (label.length <= LABEL_MAX ? label : `${label.slice(0, LABEL_MAX - 1)}…`);

type Field = TableDiff['fields'][number];

const PRISMA_SCALARS = new Set(['String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes']);

/** The model a field points at, or null. Enums look like models, so a field counts as a relation only when its type is
 *  another of the tables, a list (`Order[]`), or comes with a matching foreign key (`customer Customer` + `customerId`). */
export function relationTarget(field: Field, table: TableDiff, models: Set<string>): string | null {
  const written = field.type.trim().split(/\s+/)[0] ?? '';
  const base = written.replace(/\?$/, '').replace(/\[\]$/, '');
  if (!/^[A-Z]\w*$/.test(base) || PRISMA_SCALARS.has(base)) return null;
  if (models.has(base) || written.endsWith('[]')) return base;
  return table.fields.some((f) => f.name === `${field.name}Id`) ? base : null;
}

/**
 * The tables as one diagram, the Database screen's relationship strip: a box per table (removed ones marked), unchanged
 * boxes for the models they point at, and a line per relation. Box ids are model names, and line ids
 * `${model}.${field}`. One table still draws: the Database screen leaves out a strip of fewer than two boxes itself.
 */
export function tablesDrawing(tables: TableDiff[]): DiagramData {
  const models = new Set(tables.map((t) => t.model));
  const nodes = new Map<string, DiagramData['nodes'][number]>();
  for (const t of tables) {
    if (nodes.has(t.model)) continue;
    nodes.set(t.model, { id: t.model, label: t.change === 'removed' ? `${t.model} (removed)` : t.model, status: t.change === 'new' ? 'new' : 'changed' });
  }
  const edges = new Map<string, DiagramData['edges'][number]>();
  const related = new Set<string>();
  for (const t of tables) {
    for (const f of t.fields) {
      if (f.change === 'removed') continue;
      const to = relationTarget(f, t, models);
      if (!to || to === t.model) continue;
      if (!models.has(to)) related.add(to);
      const id = `${t.model}.${f.name}`;
      if (!edges.has(id)) edges.set(id, { id, from: t.model, to, label: f.name });
    }
  }
  for (const m of [...related].sort()) nodes.set(m, { id: m, label: m, status: 'unchanged' });
  return { kind: 'system', groups: [], nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** `node:job` -> { kind: 'node', id: 'job' }. Null when the prefix isn't one of the seven, or nothing follows it. */
export function parseRef(ref: string): { kind: RefKind; id: string } | null {
  const at = ref.indexOf(':');
  if (at < 0) return null;
  const kind = ref.slice(0, at);
  const id = ref.slice(at + 1);
  return (refKinds as readonly string[]).includes(kind) && id ? { kind: kind as RefKind, id } : null;
}

/** One key per drawing: 'diagram:<itemId>', 'tables' or 'flow:<itemId>'. Two drawings are the same when their keys are. */
export function drawingKey(d: NonNullable<Drawing>): string {
  return d.kind === 'tables' ? 'tables' : `${d.kind}:${d.itemId}`;
}

/**
 * A diagram's boxes, then its lines, then its groups that hold a box, as refs: node:/edge: for a diagram, table:/link:
 * for the tables. A group with no boxes is left out: the layout drops it, so revealing it would draw nothing.
 */
function boxesAndLines(d: DiagramData, box: 'node' | 'table', line: 'edge' | 'link'): DrawingParts {
  const labels = new Map(d.nodes.map((n) => [n.id, n.label]));
  const parts: DrawingPart[] = [];
  const brings: Record<string, string[]> = {};
  for (const n of d.nodes) {
    parts.push({ ref: `${box}:${n.id}`, label: clipLabel(n.label) });
    if (n.group !== undefined) brings[`${box}:${n.id}`] = [`group:${n.group}`];
  }
  for (const e of d.edges) {
    // A diagram's line is named by its label, else by its ends; a link by its field and the table it points at.
    const label = line === 'link' ? `${e.id} → ${e.to}` : e.label?.trim() ? e.label : `${labels.get(e.from) ?? e.from} → ${labels.get(e.to) ?? e.to}`;
    parts.push({ ref: `${line}:${e.id}`, label: clipLabel(label) });
    brings[`${line}:${e.id}`] = [`${box}:${e.from}`, `${box}:${e.to}`];
  }
  const held = new Set(d.nodes.flatMap((n) => (n.group === undefined ? [] : [n.group])));
  for (const g of d.groups) if (held.has(g.id)) parts.push({ ref: `group:${g.id}`, label: clipLabel(g.label) });
  return { parts, brings };
}

/**
 * The parts of a drawing, from its data: a diagram's boxes (node:), lines (edge:) and groups (group:); the tables'
 * boxes (table:) and links (link:), drawn as tablesDrawing draws them; a flow's lanes (lane:), then its steps (step:<n>)
 * in step order, each labelled with the lanes it joins ("Job → Mailer: Hands over the reminder"), since the pack
 * doesn't carry a flow's data.
 */
export function drawingParts(source: { kind: 'diagram'; data: DiagramData } | { kind: 'tables'; tables: TableDiff[] } | { kind: 'flow'; data: FlowData }): DrawingParts {
  if (source.kind === 'diagram') return boxesAndLines(source.data, 'node', 'edge');
  if (source.kind === 'tables') return boxesAndLines(tablesDrawing(source.tables), 'table', 'link');
  const lanes = source.data.lanes ?? [];
  const laneIds = new Set(lanes.map((l) => l.id));
  const laneLabel = new Map(lanes.map((l) => [l.id, l.label]));
  const parts: DrawingPart[] = lanes.map((l) => ({ ref: `lane:${l.id}`, label: clipLabel(l.label) }));
  const brings: Record<string, string[]> = {};
  for (const s of [...source.data.steps].sort((a, b) => a.n - b.n)) {
    const from = s.from === undefined ? undefined : laneLabel.get(s.from);
    const to = s.to === undefined ? undefined : laneLabel.get(s.to);
    const joins = from !== undefined && to !== undefined ? `${from} → ${to}: ` : from !== undefined || to !== undefined ? `${from ?? to}: ` : '';
    parts.push({ ref: `step:${s.n}`, label: clipLabel(`${joins}${s.label}`) });
    const ends = [...new Set([s.from, s.to])].filter((id): id is string => id !== undefined && laneIds.has(id));
    if (ends.length) brings[`step:${s.n}`] = ends.map((id) => `lane:${id}`);
  }
  return { parts, brings };
}
```

In `packages/core/src/schemas/index.ts`, add after `export * from './whiteboard';`:
```ts
export * from './drawings';
```

- [ ] **Step 4: The project's drawings**

Create `packages/core/src/store/drawings.ts`:
```ts
import { dataKindOf, displayStatus, drawingParts, parseData, type DrawingOption, type DrawingParts, type Item, type PlumbingType } from '../schemas';
import { readItems, readThreads } from './io';

// The drawings of a plumbing project that Present may draw: every diagram item, the tables of its database items
// (drawn together, as the Database screen's relationship strip), and its system flows. The whiteboard subagent's pack
// lists them (whiteboardPack.drawings), and saveDefense checks a presenter against them.

/** The title of the tables' drawing. */
export const TABLES_TITLE = 'Tables';

/** A drawing of this project, with what revealing each of its parts also puts on the board. */
export type ProjectDrawing = DrawingOption & { brings: DrawingParts['brings'] };

/**
 * The items that draw, by what they draw: items of enabled types, not parked, with a drawing, in id order. The
 * diagram items are the ones a section's diagramItemId may name (defenseDiagramItemIds).
 */
export async function drawnItems(dir: string, types: PlumbingType[]): Promise<{ diagram: Item[]; database: Item[]; flows: Item[] }> {
  const [{ values: items }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const statusByThread = new Map(threads.map((t) => [t.id, displayStatus(t)]));
  const kindOf = new Map(types.filter((t) => t.enabled).map((t) => [t.id, dataKindOf(t)]));
  const drawn = items.filter((i) => i.data !== undefined && statusByThread.get(i.threadId) !== 'parked').sort((a, b) => a.id.localeCompare(b.id));
  const of = (kind: 'diagram' | 'database' | 'flows') => drawn.filter((i) => kindOf.get(i.type) === kind);
  return { diagram: of('diagram'), database: of('database'), flows: of('flows') };
}

/**
 * Every drawing of this project, in this order:
 * - each diagram item, by its title. One whose data doesn't parse is still there, with no parts, as diagramItemId may
 *   still name it;
 * - the tables, titled TABLES_TITLE, when at least one database item's data parses: those tables, drawn together;
 * - each flow of kind system or both that has lanes, by its title. A user flow is a storyboard, not drawn here.
 */
export async function projectDrawings(dir: string, types: PlumbingType[]): Promise<ProjectDrawing[]> {
  const drawn = await drawnItems(dir, types);
  const drawings: ProjectDrawing[] = [];
  for (const item of drawn.diagram) {
    const parsed = parseData('diagram', item.data);
    const { parts, brings } = parsed.ok ? drawingParts({ kind: 'diagram', data: parsed.data }) : { parts: [], brings: {} };
    drawings.push({ drawing: { kind: 'diagram', itemId: item.id }, title: item.title, parts, brings });
  }
  const tables = drawn.database.flatMap((item) => {
    const parsed = parseData('database', item.data);
    return parsed.ok ? [parsed.data] : [];
  });
  if (tables.length) drawings.push({ drawing: { kind: 'tables' }, title: TABLES_TITLE, ...drawingParts({ kind: 'tables', tables }) });
  for (const item of drawn.flows) {
    const parsed = parseData('flows', item.data);
    if (!parsed.ok || parsed.data.kind === 'user' || !parsed.data.lanes?.length) continue;
    drawings.push({ drawing: { kind: 'flow', itemId: item.id }, title: item.title, ...drawingParts({ kind: 'flow', data: parsed.data }) });
  }
  return drawings;
}

/** What the whiteboard subagent may draw: projectDrawings, each with its parts and their labels. */
export async function drawingOptions(dir: string, types: PlumbingType[]): Promise<DrawingOption[]> {
  return (await projectDrawings(dir, types)).map(({ drawing, title, parts }) => ({ drawing, title, parts }));
}
```

In `packages/core/src/index.ts`, replace:
```ts
export * from './store/whiteboard';
```
with:
```ts
export * from './store/whiteboard';
export * from './store/drawings';
```

- [ ] **Step 5: `saveDefense` checks and keeps the presenter**

In `packages/core/src/store/whiteboard.ts`, replace the imports from `'../defenseType'` down to `'./finalize'`:
```ts
import { DEFENSE, defenseThreadIds } from '../defenseType';
import {
  DEFENSE_SECTIONS,
  dataKindOf,
  defenseInputSchema,
  displayStatus,
  practiceSchema,
  sectionIds,
  severityValues,
  whiteboardDefenseSchema,
  whiteboardRequestSchema,
  type DefenseInput,
  type PlumbingProject,
  type PlumbingType,
  type Practice,
  type ProjectHome,
  type WhiteboardDefense,
  type WhiteboardRequest,
} from '../schemas';
import { stable } from './changes';
import { changesSinceFinal } from './checklist';
import { activeDecisions } from './decisions';
import { draftHash } from './finalize';
```
with:
```ts
import { DEFENSE, defenseThreadIds } from '../defenseType';
import {
  chapterIds,
  DEFENSE_SECTIONS,
  defenseInputSchema,
  displayStatus,
  drawingKey,
  MAX_PRESENTER_CHARS,
  practiceSchema,
  PRESENT_CHAPTERS,
  sectionIds,
  severityValues,
  whiteboardDefenseSchema,
  whiteboardRequestSchema,
  type DefenseInput,
  type PlumbingProject,
  type PlumbingType,
  type Practice,
  type PresentChapterId,
  type ProjectHome,
  type WhiteboardDefense,
  type WhiteboardRequest,
} from '../schemas';
import { stable } from './changes';
import { changesSinceFinal } from './checklist';
import { activeDecisions } from './decisions';
import { drawnItems, projectDrawings, type ProjectDrawing } from './drawings';
import { draftHash } from './finalize';
```

`defenseDiagramItemIds` keeps its doc comment and reads through `drawnItems`. Replace its body:
```ts
export async function defenseDiagramItemIds(dir: string, types: PlumbingType[]): Promise<string[]> {
  const [{ values: items }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const statusByThread = new Map(threads.map((t) => [t.id, displayStatus(t)]));
  const diagramTypes = new Set(types.filter((t) => t.enabled && dataKindOf(t) === 'diagram').map((t) => t.id));
  return items
    .filter((i) => diagramTypes.has(i.type) && statusByThread.get(i.threadId) !== 'parked' && i.data !== undefined)
    .map((i) => i.id)
    .sort((a, b) => a.localeCompare(b));
}
```
with:
```ts
export async function defenseDiagramItemIds(dir: string, types: PlumbingType[]): Promise<string[]> {
  return (await drawnItems(dir, types)).diagram.map((i) => i.id);
}
```
(`readItems`, `readThreads` and `displayStatus` are still used by `inputsHashFor`.)

Add the presenter's checks just before `const severityRank = …`, after `repeats`:
```ts
/** How a refused drawing ends: the ones the project has, or that it has none. */
const candidates = (ids: string[]) => (ids.length ? `Use one of: ${ids.join(', ')}.` : 'There are none, so pick another drawing or none.');

/**
 * The project's drawing a chapter names: null for a chapter that draws nothing, and undefined when it names one the
 * project doesn't have (its line is added to `problems`) or one the schema refuses.
 */
function chapterDrawing(where: string, drawing: unknown, drawings: ProjectDrawing[], problems: string[]): ProjectDrawing | null | undefined {
  if (drawing === null) return null;
  if (!isObject(drawing)) return undefined;
  if (drawing.kind === 'tables') {
    const tables = drawings.find((d) => d.drawing.kind === 'tables');
    if (!tables) problems.push(`${where}: this project has no tables to draw.`);
    return tables;
  }
  const { kind, itemId } = drawing;
  if ((kind !== 'diagram' && kind !== 'flow') || typeof itemId !== 'string') return undefined;
  const key = drawingKey({ kind, itemId });
  const found = drawings.find((d) => drawingKey(d.drawing) === key);
  if (!found) {
    const ids = drawings.flatMap((d) => (d.drawing.kind === kind ? [d.drawing.itemId] : []));
    problems.push(`${where}: there's no ${kind === 'diagram' ? 'diagram item' : 'system flow'} "${itemId}". ${candidates(ids)}`);
  }
  return found;
}

/**
 * One chapter's drawing and steps. Each step reveals only parts of the chapter's drawing, each once in the chapter, and
 * none when it draws nothing. Each note is near a part already on the board at its step, or "" for the board's foot.
 * The board holds what the steps so far revealed and what that brought along: a line's ends, a flow step's lanes, and
 * a box's group. A drawing the project doesn't have is its own line, and its steps aren't checked against it.
 */
function chapterProblems(where: string, chapter: Record<string, unknown>, drawings: ProjectDrawing[]): string[] {
  const problems: string[] = [];
  const drawing = chapterDrawing(where, chapter.drawing, drawings, problems);
  if (drawing === undefined) return problems;
  const parts = new Set(drawing?.parts.map((p) => p.ref));
  const revealedIn = new Map<string, number>();
  const board = new Set<string>();
  const draw = (ref: string) => {
    if (board.has(ref)) return;
    board.add(ref);
    for (const more of drawing?.brings[ref] ?? []) draw(more);
  };
  (Array.isArray(chapter.steps) ? chapter.steps : []).forEach((step, i) => {
    if (!isObject(step)) return;
    const s = i + 1;
    const reveal = Array.isArray(step.reveal) ? step.reveal.filter((ref): ref is string => typeof ref === 'string') : [];
    if (drawing === null && reveal.length) problems.push(`${where} step ${s}: this chapter draws nothing, so leave reveal empty.`);
    for (const ref of drawing ? reveal : []) {
      const t = revealedIn.get(ref);
      if (!parts.has(ref)) problems.push(`${where} step ${s}: "${ref}" isn't in this drawing.`);
      else if (t !== undefined) problems.push(`${where} step ${s}: "${ref}" was already revealed in step ${t}.`);
      else {
        revealedIn.set(ref, s);
        draw(ref);
      }
    }
    (Array.isArray(step.notes) ? step.notes : []).forEach((note, k) => {
      if (isObject(note) && typeof note.near === 'string' && note.near !== '' && !board.has(note.near)) {
        problems.push(`${where} step ${s} note ${k + 1}: "${note.near}" isn't on the board yet.`);
      }
    });
  });
  return problems;
}

/**
 * What the schema can't say about the presenter: that it's there; its size; the seven chapters, each once and in
 * order; and each chapter against this project's own drawings (chapterProblems). Read from the payload as sent, as the
 * sections are, so these are listed alongside the schema's own problems.
 */
function presenterProblems(defense: unknown, drawings: ProjectDrawing[]): string[] {
  const presenter = isObject(defense) ? defense.presenter : undefined;
  if (presenter === undefined) return ['presenter is missing. Send the seven chapters too.'];
  const problems: string[] = [];
  const size = JSON.stringify(presenter).length;
  if (size > MAX_PRESENTER_CHARS) problems.push(`presenter: the presenter is ${size.toLocaleString('en-US')} characters of JSON; the most is 20,000.`);
  const chapters = isObject(presenter) && Array.isArray(presenter.chapters) ? presenter.chapters.filter(isObject) : [];
  // Each chapter's place among the seven, -1 for an id that isn't one. A doubled chapter counts where it first comes.
  const places = chapters.map((c) => chapterIds.indexOf(c.id as PresentChapterId));
  const firsts = places.filter((n, i) => places.indexOf(n) === i);
  if (places.includes(-1) || firsts.some((n, i) => i > 0 && n < firsts[i - 1])) {
    problems.push('presenter: chapters must come in this order: purpose, flow, data, states, security, failure, rollback.');
  }
  for (const id of chapterIds) {
    const where = `presenter.chapters: ${id}`;
    const found = chapters.filter((c) => c.id === id);
    if (found.length === 0) problems.push(`${where} is missing.`);
    if (found.length > 1) problems.push(`${where} is there more than once.`);
    for (const chapter of found) problems.push(...chapterProblems(where, chapter, drawings));
  }
  // A doubled chapter with the same problem in both copies says it once.
  return [...new Set(problems)];
}
```

Replace the first paragraph of `saveDefense`'s doc comment:
```ts
 * Saves the subagent's defense for a request that's writing: ConflictError for any other id or state. The whole
 * payload is checked first (the schema, then its size, then the sections, claims, tables and diagram items, then
 * repeated questions, then the checklist) and any problem refuses all of it, listing every problem: nothing is written,
 * the last saved defense stays as it was, and the request stays writing so the subagent can send it again. Otherwise
 * the defense gets its ids (q1…, c1…, k1…, w-…), the section titles and order, its concerns most severe first, and
 * basedOn from the request; defense.json is written, then request.json removed.
```
with:
```ts
 * Saves the subagent's defense for a request that's writing: ConflictError for any other id or state. The whole
 * payload is checked first (the schema, then its size, then the sections, claims, tables and diagram items, then
 * repeated questions, then the checklist, then the presenter against the project's own drawings) and any problem
 * refuses all of it, listing every problem: nothing is written, the last saved defense stays as it was, and the request
 * stays writing so the subagent can send it again. Otherwise the defense gets its ids (q1…, c1…, k1…, w-…), the
 * section titles and order, its concerns most severe first, the presenter's chapter titles, and basedOn from the
 * request; defense.json is written, then request.json removed.
```

In `saveDefense`, replace:
```ts
    problems.push(...repeats(sent.checklist, 'checklist', 'line'));
  }
  if (problems.length || !parsed.success) throw nothingSaved(problems, WHITEBOARD_RETRY);
```
with:
```ts
    problems.push(...repeats(sent.checklist, 'checklist', 'line'));
  }
  problems.push(...presenterProblems(o.defense, await projectDrawings(dir, o.types)));
  if (problems.length || !parsed.success) throw nothingSaved(problems, WHITEBOARD_RETRY);
```
replace:
```ts
  const sections = new Map(input.sections.map((s) => [s.id, s]));
  const defense: WhiteboardDefense = {
```
with:
```ts
  const sections = new Map(input.sections.map((s) => [s.id, s]));
  // presenterProblems saw to it: the presenter is there, with each chapter once.
  const chapters = new Map((input.presenter?.chapters ?? []).map((c) => [c.id, c]));
  const defense: WhiteboardDefense = {
```
and replace:
```ts
    checklist: (fromRules ?? input.checklist).map((text, i) => ({ id: `k${i + 1}`, text })),
  };
  await writeDefense(dir, defense);
```
with:
```ts
    checklist: (fromRules ?? input.checklist).map((text, i) => ({ id: `k${i + 1}`, text })),
    presenter: {
      chapters: PRESENT_CHAPTERS.map(({ id, title }) => {
        const c = chapters.get(id)!;
        return { id, title, drawing: c.drawing, steps: c.steps };
      }),
    },
  };
  await writeDefense(dir, defense);
```

- [ ] **Step 6: The fixtures carry a presenter**

Without this, every existing test that saves `validDefenseInput()` is refused with "presenter is missing", and every `storedDefense()` comparison misses the presenter.

In `packages/core/test/fixtures.ts`, replace:
```ts
import {
  DEFENSE_SECTIONS,
  type DefenseInput,
```
with:
```ts
import {
  DEFENSE_SECTIONS,
  PRESENT_CHAPTERS,
  type DefenseInput,
```
In `validDefenseInput`'s doc comment, replace:
```ts
 * A whole Whiteboard Defense of the Restock reminders plan, as the whiteboard subagent sends it: all ten sections in
 * order, each with a claim (security's second claim is unknown, and data has a source-of-truth table), three questions,
 * a high and an info concern, and the 20 checklist lines of the shipped rules file.
```
with:
```ts
 * A whole Whiteboard Defense of the Restock reminders plan, as the whiteboard subagent sends it: all ten sections in
 * order, each with a claim (security's second claim is unknown, and data has a source-of-truth table), three questions,
 * a high and an info concern, the 20 checklist lines of the shipped rules file, and a presenter: the seven chapters in
 * order, each drawing nothing (so it's valid in any project), with one step each but two in System flow, and notes at
 * the board's foot.
```
At the end of `validDefenseInput`, replace:
```ts
    checklist: [...DEFENSE_CHECKLIST],
  };
}
```
with:
```ts
    checklist: [...DEFENSE_CHECKLIST],
    presenter: {
      chapters: [
        {
          id: 'purpose',
          drawing: null,
          steps: [{ caption: 'Customers run out before they reorder, so a daily job reminds them a few days ahead.', reveal: [], notes: [{ near: '', text: 'one reminder per subscription', ink: 'ink' }] }],
        },
        {
          id: 'flow',
          drawing: null,
          steps: [
            { caption: 'Each morning the job reads the subscriptions due within five days.', reveal: [], notes: [] },
            { caption: 'It hands each reminder to the mailer and logs it.', reveal: [], notes: [{ near: '', text: 'runs twice? → the log stops a second email', ink: 'seal' }] },
          ],
        },
        {
          id: 'data',
          drawing: null,
          steps: [{ caption: 'Billing owns the renewal date; the reminders table records what was sent.', reveal: [], notes: [{ near: '', text: 'source of truth: the reminders table', ink: 'slate' }] }],
        },
        { id: 'states', drawing: null, steps: [{ caption: 'A subscription is not due yet, due, or reminded today.', reveal: [], notes: [] }] },
        {
          id: 'security',
          drawing: null,
          steps: [{ caption: 'Reminders go only to the address on the subscription.', reveal: [], notes: [{ near: '', text: 'unsubscribe token? not decided', ink: 'seal' }] }],
        },
        { id: 'failure', drawing: null, steps: [{ caption: 'When the mailer is down the send fails, and the next run tries again.', reveal: [], notes: [] }] },
        {
          id: 'rollback',
          drawing: null,
          steps: [{ caption: 'Turn the job off: nothing else depends on it.', reveal: [], notes: [{ near: '', text: 'blast radius: reminder emails only', ink: 'moss' }] }],
        },
      ],
    },
  };
}
```
In `storedDefense`'s doc comment, replace:
```ts
 * validDefenseInput() as saveDefense saves it: the section titles, ids q1–q3, c1–c2 (the high concern first) and
 * k1–k20, id w-test, and based on the draft at v1. `overrides` replace whole fields.
```
with:
```ts
 * validDefenseInput() as saveDefense saves it: the section titles, ids q1–q3, c1–c2 (the high concern first) and
 * k1–k20, the presenter's chapter titles, id w-test, and based on the draft at v1. `overrides` replace whole fields.
```
and in `storedDefense`, replace:
```ts
    checklist: input.checklist.map((text, i) => ({ id: `k${i + 1}`, text })),
    ...overrides,
```
with:
```ts
    checklist: input.checklist.map((text, i) => ({ id: `k${i + 1}`, text })),
    presenter: {
      chapters: PRESENT_CHAPTERS.map(({ id, title }) => {
        const c = input.presenter!.chapters.find((chapter) => chapter.id === id)!;
        return { id, title, drawing: c.drawing, steps: c.steps };
      }),
    },
    ...overrides,
```

In `packages/web/e2e/claude.ts`, replace:
```ts
const claim = (text: string, basis = 'known') => ({ text, basis });

/**
 * A whole Whiteboard Defense, as the whiteboard subagent sends it with dp_whiteboard: level 2, all ten sections, three
 * questions, two concerns (high, then informational) and no checklist, since the service copies the rules file's 20
 * lines. Security model's second claim (security.1) is Unknown, so it can go to Questions; Data and state has a table,
 * and Whiteboard diagram a text drawing.
 */
```
with:
```ts
const claim = (text: string, basis = 'known') => ({ text, basis });
/** A Present chapter that draws nothing: one step, its caption, and its notes at the board's foot. */
const chapter = (id: string, caption: string, notes: { text: string; ink: string }[] = []) => ({
  id,
  drawing: null,
  steps: [{ caption, reveal: [], notes: notes.map((n) => ({ near: '', ...n })) }],
});

/**
 * A whole Whiteboard Defense, as the whiteboard subagent sends it with dp_whiteboard: level 2, all ten sections, three
 * questions, two concerns (high, then informational) and no checklist, since the service copies the rules file's 20
 * lines. Security model's second claim (security.1) is Unknown, so it can go to Questions; Data and state has a table,
 * and Whiteboard diagram a text drawing. Its presenter has the seven chapters, each drawing nothing with one step, so
 * it's valid in any project.
 */
```
and at the end of `defenseInput()`, replace:
```ts
    checklist: [],
  };
}
```
with:
```ts
    checklist: [],
    presenter: {
      chapters: [
        chapter('purpose', 'A daily job reminds customers before an item runs out.'),
        chapter('flow', 'The job runs at 9:00, picks the subscriptions that are due and sends each an SMS.'),
        chapter('data', 'Each reminder sent is a row in the reminders table.', [{ text: 'source of truth: the reminders table', ink: 'slate' }]),
        chapter('states', 'A subscription is not due, due, or reminded today.'),
        chapter('security', 'Only the job sends reminders.'),
        chapter('failure', 'A second run would send every reminder again.', [{ text: 'runs twice? → one per subscription per day', ink: 'seal' }]),
        chapter('rollback', 'Turn the job off: nothing else depends on it.', [{ text: 'blast radius: reminder SMS only', ink: 'moss' }]),
      ],
    },
  };
}
```

- [ ] **Step 7: The Database screen draws core's tables**

In `packages/web/src/pages/visual/DatabaseScreen.tsx`, replace the first import:
```ts
import { migrationKindValues, type DataChecks, type DiagramData, type TableDiff, type TypeItemRow } from '@dev-plumbing/core/schemas';
```
with:
```ts
import { migrationKindValues, tablesDrawing, type DataChecks, type DiagramData, type TableDiff, type TypeItemRow } from '@dev-plumbing/core/schemas';
```
and replace everything from `const PRISMA_SCALARS = …` down to the end of `relationshipStrip` (`PRISMA_SCALARS`, `relationTarget` and `relationshipStrip`, which moved to core) with:
```ts
/** The relationship strip: core's tablesDrawing, which Present draws too, left out with fewer than two boxes. */
export function relationshipStrip(tables: TableDiff[]): DiagramData | null {
  const strip = tablesDrawing(tables);
  return strip.nodes.length < 2 ? null : strip;
}
```
`type Field` stays: `FieldRow` uses it. The screen is unchanged.

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run packages/core/src/schemas/whiteboard.test.ts packages/core/test/drawings.test.ts packages/core/test/whiteboard.test.ts packages/web/src/pages/visual/database.test.tsx`
Expected: PASS (9, 9, 23 and 7 tests).

Run:
```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e database defense
pnpm test:e2e
```
Expected: PASS.
- `pnpm test` runs 928 tests on main at db81477 plus this task (12 more than before: 3 schema tests, 9 in `drawings.test.ts` and the Review Focus test, less the strip test that moved). Every existing test that saves or reads a defense passes unchanged, through the fixtures.
- `bridge.integration.test.ts`'s whiteboard round trip saves `validDefenseInput()`, presenter and all.
- The e2e runs check that the Database screen's strip is unchanged and that the defense specs still save `defenseInput()` with its presenter.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/schemas/whiteboard.ts packages/core/src/schemas/drawings.ts packages/core/src/schemas/index.ts packages/core/src/store/drawings.ts packages/core/src/store/whiteboard.ts packages/core/src/index.ts packages/core/test/fixtures.ts packages/core/src/schemas/whiteboard.test.ts packages/core/test/drawings.test.ts packages/core/test/whiteboard.test.ts packages/web/src/pages/visual/DatabaseScreen.tsx packages/web/src/pages/visual/database.test.tsx packages/web/e2e/claude.ts
git commit -m "feat(core): the Whiteboard Defense carries a presenter, checked against the project's own drawings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The whiteboard subagent writes the presenter

The whiteboard subagent's pack gains what Present may draw (`drawings`, exactly the drawings `saveDefense` checks against) and the seven `chapters`, and `whiteboard.md` gains a step that writes the presenter from them, in the same `dp_whiteboard` call. `dp_whiteboard`'s description names the presenter.

**Files:**
- Modify:
  - `packages/core/src/store/context.ts` (`WhiteboardPack.drawings` and `chapters`)
  - `plugin/agents/whiteboard.md` (the presenter step, the pack's new fields, the example and the budget)
  - `packages/mcp/src/tools.ts` (`dp_whiteboard`'s description)
- Test:
  - `packages/core/test/whiteboardPack.test.ts`
  - `packages/mcp/test/plugin.test.ts`
  - `packages/mcp/test/tools.test.ts`
  - `packages/mcp/test/bridge.integration.test.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `drawingOptions` (`store/drawings.ts`), `PRESENT_CHAPTERS`, `PresentChapterId` and `DrawingOption` (`core/src/schemas`), and `validDefenseInput().presenter` (seven chapters, each `drawing: null`).
  - From Plans 1–6: `whiteboardPack` and its tests' `seed()`, `types`, `profile` and `RULES_FILE`; `parseFrontMatter` and `read` in `plugin.test.ts`; the bridge test's `json` and `http`.
- Produces, as the header's Contracts:
  ```ts
  // WhiteboardPack gains:
  drawings: DrawingOption[];                              // = drawingOptions(dir, types)
  chapters: { id: PresentChapterId; title: string }[];   // = PRESENT_CHAPTERS
  ```
  - `whiteboard.md` gains step 9 (the presenter), whose budget line is "Keep the presenter under about 12,000 characters of JSON.". The old steps 9 and 10 become 10 and 11, and step 5's budget says the 40,000 is "besides the presenter".
  - `dp_whiteboard`'s description says "…the release concerns, the checklist, and the presenter's seven chapters."
- **Size:** on the big plan of `whiteboardPack.test.ts` (40 items with long bodies, five 6-box, 5-line diagrams), the pack goes from about 54,100 to 57,100 characters of JSON: the five drawings are 2,741 and the chapters 292. That's still under the 60,000 the test holds it to.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/whiteboardPack.test.ts`, replace:
```ts
import { DEFENSE_SECTIONS, repoProfileSchema, type Item, type PlumbingType, type Thread } from '../src/schemas';
```
with:
```ts
import { DEFENSE_SECTIONS, PRESENT_CHAPTERS, repoProfileSchema, type Item, type PlumbingType, type Thread } from '../src/schemas';
```
replace:
```ts
import { defenseMarkdown } from '../src/store/defenseMarkdown';
```
with:
```ts
import { defenseMarkdown } from '../src/store/defenseMarkdown';
import { drawingOptions } from '../src/store/drawings';
```
The seeded table gets a `schemaDiff`, so its data parses and the tables can be drawn (nothing else reads it). Replace:
```ts
const TABLE = { model: 'RestockReminder', change: 'new', fields: [{ name: 'sentAt', type: 'DateTime', change: 'added' }] };
```
with:
```ts
const TABLE = { model: 'RestockReminder', change: 'new', fields: [{ name: 'sentAt', type: 'DateTime', change: 'added' }], schemaDiff: '+model RestockReminder {\n+  sentAt DateTime\n+}' };
```
Add this test just before `it("carries the last defense's questions and unknowns, so a regenerate can keep their wording", …)`:
```ts
  it("lists what Present's chapters may draw, as the presenter is checked, and the seven chapters", async () => {
    const dir = await seed();
    const pack = await whiteboardPack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.chapters).toEqual(PRESENT_CHAPTERS.map((c) => ({ id: c.id, title: c.title })));
    // The diagram and the table; not the parked diagram, the diagram not drawn yet, or the user flow.
    expect(pack.drawings).toEqual([
      { drawing: { kind: 'diagram', itemId: 'architecture-system' }, title: 'System view', parts: [{ ref: 'node:job', label: 'Reminder job' }] },
      { drawing: { kind: 'tables' }, title: 'Tables', parts: [{ ref: 'table:RestockReminder', label: 'RestockReminder' }] },
    ]);
    expect(pack.drawings).toEqual(await drawingOptions(dir, types));
  });
```
In "stays small on a big plan: 40 items with long bodies, five of them drawn", replace:
```ts
    expect(pack.items.filter((i) => i.data !== null)).toHaveLength(5);
    expect(JSON.stringify(pack).length).toBeLessThan(60_000);
```
with:
```ts
    expect(pack.items.filter((i) => i.data !== null)).toHaveLength(5);
    // Present may draw each of the five, with its six boxes and five lines.
    expect(pack.drawings.map((d) => d.parts.length)).toEqual([11, 11, 11, 11, 11]);
    expect(JSON.stringify(pack).length).toBeLessThan(60_000);
```
and in "works with no profile", replace:
```ts
    expect(pack.diagramItemIds).toEqual([]);
  });
});
```
with:
```ts
    expect(pack.diagramItemIds).toEqual([]);
    expect(pack.drawings).toEqual([]);
    expect(pack.chapters).toHaveLength(7);
  });
});
```

In `packages/mcp/test/plugin.test.ts`, add this test just before `it("detects a repo profile again when the user asks, keeping the user's own settings", …)`. The whiteboard agent's existing test keeps all its phrases (step 5 still says "Keep the whole defense under about 40,000 characters of JSON"):
```ts
  it("has the whiteboard agent write the presenter's seven chapters from the pack's drawings", () => {
    const agent = parseFrontMatter(read('plugin/agents/whiteboard.md')).content;
    for (const s of [
      '`drawings`',
      '`chapters`',
      '`purpose`, `flow`, `data`, `states`, `security`, `failure` and `rollback`',
      '**Pick a drawing for each chapter** from `drawings`',
      '`{ "kind": "tables" }`',
      'or `null` when none fits',
      '**Give each chapter 1 to 8 steps,** in the order you\'d draw it on a whiteboard',
      'Revealing a line (`edge:` or `link:`) also draws its two ends',
      'its `reveal` is always `[]`',
      'what the engineer says out loud',
      '`near` set to `""`',
      '`seal` for a risk',
      'Keep the presenter under about 12,000 characters of JSON.',
      '"presenter": {',
      'send all ten sections and all seven chapters',
    ]) {
      expect(agent).toContain(s);
    }
  });
```

In `packages/mcp/test/tools.test.ts`, at the end of "serves the whiteboard subagent's pack, sends its defense, and a bad basis is refused by the service with every problem listed", replace:
```ts
    expect(whiteboard.inputSchema.properties?.defense).toMatchObject({ type: 'object', description: 'The whole defense: see your instructions for its shape' });
```
with:
```ts
    expect(whiteboard.inputSchema.properties?.defense).toMatchObject({ type: 'object', description: 'The whole defense: see your instructions for its shape' });
    expect(whiteboard.description).toContain("the release concerns, the checklist, and the presenter's seven chapters");
```

In `packages/mcp/test/bridge.integration.test.ts`, in "hands a Whiteboard Defense request to the window and takes the defense back", replace:
```ts
  expect(pack.basedOn).toEqual({ doc: 'draft', version: 2 });
  expect(fs.readFileSync(pack.documentFile, 'utf8').length).toBeGreaterThan(0);
  // A bad basis and a missing section come back from the service together, in one refusal.
  const input = validDefenseInput();
  const bad = { ...input, sections: input.sections.filter((s) => s.id !== 'summary').map((s) => (s.id === 'data' ? { ...s, claims: [{ text: 'Perhaps.', basis: 'maybe' }] } : s)) };
```
with:
```ts
  expect(pack.basedOn).toEqual({ doc: 'draft', version: 2 });
  expect(fs.readFileSync(pack.documentFile, 'utf8').length).toBeGreaterThan(0);
  // Present's seven chapters, and what they may draw: this plan's only items are questions, so nothing.
  expect(pack.chapters.map((c: { id: string }) => c.id)).toEqual(['purpose', 'flow', 'data', 'states', 'security', 'failure', 'rollback']);
  expect(pack.drawings).toEqual([]);
  // A bad basis, a missing section and a drawing the project doesn't have come back from the service together, in one refusal.
  const input = validDefenseInput();
  const presenter = { chapters: input.presenter!.chapters.map((c) => (c.id === 'flow' ? { ...c, drawing: { kind: 'diagram' as const, itemId: 'architecture-system' } } : c)) };
  const bad = {
    ...input,
    sections: input.sections.filter((s) => s.id !== 'summary').map((s) => (s.id === 'data' ? { ...s, claims: [{ text: 'Perhaps.', basis: 'maybe' }] } : s)),
    presenter,
  };
```
replace:
```ts
  expect(problems).toContain('- sections: summary is missing.');
```
with:
```ts
  expect(problems).toContain('- sections: summary is missing.');
  expect(problems).toContain('- presenter.chapters: flow: there\'s no diagram item "architecture-system". There are none, so pick another drawing or none.');
```
and replace the test's last line:
```ts
  expect(view).toMatchObject({ request: null, defense: { basedOn: { kind: 'plan', doc: 'draft', version: 2 } }, stale: null });
```
with:
```ts
  expect(view).toMatchObject({ request: null, defense: { basedOn: { kind: 'plan', doc: 'draft', version: 2 } }, stale: null });
  // The presenter is saved with its chapters' titles, in order.
  expect(view.defense.presenter.chapters.map((c: { title: string }) => c.title)).toEqual([
    'Purpose',
    'System flow',
    'Data and source of truth',
    'States',
    'Security',
    'Failure and retries',
    'Rollback and blast radius',
  ]);
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/whiteboardPack.test.ts packages/mcp/test/plugin.test.ts packages/mcp/test/tools.test.ts`
Expected: FAIL, 5 tests:
- `whiteboardPack.test.ts`: the new test (`expected undefined to deeply equal [ { id: 'purpose', … } … ]`), "stays small on a big plan" (`Cannot read properties of undefined (reading 'map')`) and "works with no profile" (`expected undefined to deeply equal []`);
- `plugin.test.ts`: the new test (``expected '…' to contain '`drawings`'``);
- `tools.test.ts`: the description doesn't name the presenter.

- [ ] **Step 3: The pack lists the drawings and the chapters**

In `packages/core/src/store/context.ts`, in the import from `'../schemas'`, replace:
```ts
  parseData,
  sectionFor,
```
with:
```ts
  parseData,
  PRESENT_CHAPTERS,
  sectionFor,
```
replace:
```ts
  type DisplayStatus,
  type Item,
```
with:
```ts
  type DisplayStatus,
  type DrawingOption,
  type Item,
```
and replace:
```ts
  type PlumbingType,
  type RepoProfile,
```
with:
```ts
  type PlumbingType,
  type PresentChapterId,
  type RepoProfile,
```
Then replace:
```ts
import { defenseMarkdown } from './defenseMarkdown';
```
with:
```ts
import { defenseMarkdown } from './defenseMarkdown';
import { drawingOptions } from './drawings';
```

In the `WhiteboardPack` type, replace:
```ts
  /** The items a section's diagramItemId may name: exactly the ones saveDefense accepts (defenseDiagramItemIds). */
  diagramItemIds: string[];
```
with:
```ts
  /** The items a section's diagramItemId may name: exactly the ones saveDefense accepts (defenseDiagramItemIds). */
  diagramItemIds: string[];
  /**
   * What a Present chapter may draw (drawingOptions): each diagram item, the tables, and each system flow, with the
   * parts a step may reveal, as typed refs, and their labels. saveDefense checks the presenter against exactly these.
   */
  drawings: DrawingOption[];
  /** Present's seven chapters, in order. The presenter has each once. */
  chapters: { id: PresentChapterId; title: string }[];
```

Replace `whiteboardPack`'s doc comment:
```ts
 * conventions, sensitive data, schema and apps, the sections to fill, the diagrams it may name, and the last defense's
 * wording. `rulesFile` is the rules file the service picked: the user's, or the shipped one.
```
with:
```ts
 * conventions, sensitive data, schema and apps, the sections to fill, the diagrams it may name, what Present's
 * chapters may draw and the chapters, and the last defense's wording. `rulesFile` is the rules file the service
 * picked: the user's, or the shipped one.
```
In its result, replace:
```ts
    diagramItemIds: await defenseDiagramItemIds(o.dir, o.types),
```
with:
```ts
    diagramItemIds: await defenseDiagramItemIds(o.dir, o.types),
    drawings: await drawingOptions(o.dir, o.types),
    chapters: PRESENT_CHAPTERS.map((c) => ({ id: c.id, title: c.title })),
```

- [ ] **Step 4: The whiteboard agent writes the presenter**

In `plugin/agents/whiteboard.md`, step 1 points at the JSON's new step number. Replace:
```markdown
It describes its output as Markdown; you send the same content as JSON (step 9), so the service can check it and the app can show it.
```
with:
```markdown
It describes its output as Markdown; you send the same content as JSON (step 10), so the service can check it and the app can show it.
```
Add the pack's two new fields after `diagramItemIds`. Replace:
```markdown
   - `diagramItemIds`: the items whose drawing is a diagram, which `diagramItemId` may name.
```
with:
```markdown
   - `diagramItemIds`: the items whose drawing is a diagram, which `diagramItemId` may name.
   - `drawings`: what Present may draw (step 9): each diagram item, the project's tables and each system flow, each with its `drawing` (what a chapter names to draw it), its `title`, and its `parts`, the pieces a step may reveal, each with its `ref` and `label`.
   - `chapters`: Present's seven chapters, in order, with their ids and titles.
```
In step 5, replace:
```markdown
Keep the whole defense under about 40,000 characters of JSON: one or two sentences a claim, usually 3–8 claims a section.
```
with:
```markdown
Keep the whole defense under about 40,000 characters of JSON besides the presenter (step 9): one or two sentences a claim, usually 3–8 claims a section.
```
Then replace everything from the line that starts ``9. Call `dp_whiteboard` once`` to the end of the file (the old steps 9 and 10) with the new steps 9 to 11. Step 10's lines are indented four spaces, under its two-digit number:
````markdown
9. **The presenter** (`presenter`): Present, the whiteboard the engineer talks through out loud, chapter by chapter. Send every one of `chapters`, once each, in that order, by its `id`: `purpose`, `flow`, `data`, `states`, `security`, `failure` and `rollback`.
   - **Pick a drawing for each chapter** from `drawings`, as its `drawing`, written exactly as listed (`{ "kind": "diagram", "itemId": … }`, `{ "kind": "tables" }` or `{ "kind": "flow", "itemId": … }`), or `null` when none fits. System flow usually draws the main diagram or a system flow, and Data and source of truth the tables. Chapters may draw the same drawing. With no `drawings`, every `drawing` is `null`.
   - **Give each chapter 1 to 8 steps,** in the order you'd draw it on a whiteboard. A step's `reveal` adds a few parts of the chapter's drawing to the board, by their `ref` from that drawing's `parts`, each once in a chapter (at most 40 a step). Revealing a line (`edge:` or `link:`) also draws its two ends, a flow step (`step:`) its lanes (its label starts with them, as in `Job → Mailer: Hands over the reminder`), and a box its group. When a chapter's `drawing` is `null`, its `reveal` is always `[]`.
   - **A step's `caption`** is what the engineer says out loud at that step: one or two plain sentences, at most 300 characters, from what the defense says.
   - **Notes** (`notes`, at most 4 a step) are short marker notes, at most 120 characters, each `near` a part already on the board (its `ref`), or with `near` set to `""` to write it at the board's foot. Each has an `ink`: `seal` for a risk (such as "runs twice? → one per subscription per day"), `slate` for data, `moss` for what's safe, and `ink` for structure.
   - A chapter the plan doesn't touch still gets one step saying so. User flows, mockups and phases aren't drawn: name them in a caption or a note.
   - Keep the presenter under about 12,000 characters of JSON.
10. Call `dp_whiteboard` once with `repo`, `project`, `request` and the whole defense as `defense`, shaped like this:
    ```json
    {
      "level": 2,
      "levelReasons": ["A daily job sends messages to customers."],
      "sections": [
        { "id": "summary", "claims": [{ "text": "The plan adds a daily job that reminds customers before an item runs out.", "basis": "known" }] },
        { "id": "diagram", "claims": [{ "text": "The job reads subscriptions, then sends each reminder.", "basis": "known" }], "diagram": "Daily job\n ↓\nSubscriptions table\n ↓\nSMS sender", "diagramItemId": "architecture-reminder-job" },
        { "id": "data", "claims": [{ "text": "The reminders table is the record of what was sent.", "basis": "inferred" }], "tables": [{ "title": "Source of truth", "columns": ["State", "Lives in"], "rows": [["Reminder sent", "reminders table"]] }] }
      ],
      "questions": [{ "q": "What happens if the job runs twice?", "a": "The plan doesn't say what stops a second send.", "basis": "unknown" }],
      "concerns": [{ "severity": "high", "text": "Nothing stops a rerun from sending every reminder again.", "basis": "inferred" }],
      "checklist": [],
      "presenter": {
        "chapters": [
          { "id": "purpose", "drawing": null, "steps": [{ "caption": "Customers run out before they reorder, so a daily job reminds them first.", "reveal": [], "notes": [] }] },
          {
            "id": "flow",
            "drawing": { "kind": "diagram", "itemId": "architecture-reminder-job" },
            "steps": [
              { "caption": "Every morning the job wakes up.", "reveal": ["node:job"], "notes": [] },
              { "caption": "It reads the subscriptions due soon, then sends each reminder.", "reveal": ["edge:reads", "edge:sends"], "notes": [{ "near": "node:job", "text": "runs twice? → one per subscription per day", "ink": "seal" }] }
            ]
          }
        ]
      }
    }
    ```
    (The example is cut short: send all ten sections and all seven chapters.) If it returns errors, nothing was saved: fix every problem listed and send the whole defense again, at most three times. If it says there's no Whiteboard Defense request waiting, the request was cancelled or replaced: stop at once and reply `Failed: the request was cancelled or replaced.` If it still fails after three tries, stop and reply with one line: `Failed: <what went wrong>`, with the last error, shortened.
11. Reply with exactly one line: "Whiteboard Defense written: level <n>, <q> questions, <c> concerns."
````

- [ ] **Step 5: `dp_whiteboard` names the presenter**

In `packages/mcp/src/tools.ts`, `dp_whiteboard`'s description now has an apostrophe, so it's a double-quoted string. Replace:
```ts
        'Send the whole Whiteboard Defense you wrote for a Whiteboard Defense request: the level and its reasons, every section with its claims (each tagged known, inferred, unknown or verify), the questions with their answers, the release concerns and the checklist. The defense is checked as a whole. If anything is wrong, nothing is saved and the error lists every problem: fix them all and call dp_whiteboard again with the whole defense.',
```
with:
```ts
        "Send the whole Whiteboard Defense you wrote for a Whiteboard Defense request: the level and its reasons, every section with its claims (each tagged known, inferred, unknown or verify), the questions with their answers, the release concerns, the checklist, and the presenter's seven chapters. The defense is checked as a whole. If anything is wrong, nothing is saved and the error lists every problem: fix them all and call dp_whiteboard again with the whole defense.",
```
and in its input schema, replace:
```ts
        // Checked by the service, not here: saveDefense lists every problem at once, the shape's with the project's
        // (every section once, each with a claim, the tables, the diagram items, the size), so one resend fixes them all.
```
with:
```ts
        // Checked by the service, not here: saveDefense lists every problem at once, the shape's with the project's
        // (every section once, each with a claim, the tables, the diagram items, the presenter's chapters and drawings, the
        // size), so one resend fixes them all.
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/core/test/whiteboardPack.test.ts packages/mcp/test/plugin.test.ts packages/mcp/test/tools.test.ts`
Expected: PASS (11, 13 and 14 tests).

Run:
```bash
pnpm typecheck
pnpm test
pnpm test:integration
```
Expected: PASS.
- `pnpm test` runs 930 tests on main at db81477 plus Tasks 1 and 2.
- `bridge.integration.test.ts` has 4 tests. Its whiteboard round trip now reads the pack's seven chapters and its empty `drawings` (that plan has only a question), has a chapter that draws a diagram the project doesn't have refused with the rest, and saves the presenter with its titles in order.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/store/context.ts packages/core/test/whiteboardPack.test.ts plugin/agents/whiteboard.md packages/mcp/src/tools.ts packages/mcp/test/plugin.test.ts packages/mcp/test/tools.test.ts packages/mcp/test/bridge.integration.test.ts
git commit -m "feat(plugin): the whiteboard subagent writes a presenter from the project's drawings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Drawing the board: layouts, Rough.js and Motion

The whiteboard's drawing parts, before any page uses them. A chapter's drawing is laid out as it is everywhere else in the app (ELK for a diagram and the tables, the sequence layout for a system flow), as shapes keyed by the typed refs a presenter names, and drawn by hand: a Rough.js generator, seeded from each ref, so a part looks the same every time, with Motion drawing each new part along its length. The sequence layout moves out of `SequenceView` into a pure `sequenceLayout`, with no change to what the flows screen draws.

**Files:**
- Create:
  - `packages/web/src/diagram/sequenceLayout.ts`
  - `packages/web/src/diagram/sequenceLayout.test.ts`
  - `packages/web/src/pages/defense/present/boardLayout.ts`
  - `packages/web/src/pages/defense/present/boardLayout.test.ts`
  - `packages/web/src/pages/defense/present/rough.ts`
  - `packages/web/src/pages/defense/present/rough.test.ts`
  - `packages/web/src/pages/defense/present/Board.tsx`
  - `packages/web/src/pages/defense/present/Board.test.tsx`
- Modify:
  - `pnpm-workspace.yaml` (pnpm overrides that pin Motion's own packages: `framer-motion` 13.4.2, `motion-dom` 13.4.2 and `motion-utils` 13.3.0)
  - `packages/web/package.json` and `pnpm-lock.yaml` (`roughjs` 4.6.6 and `motion` 13.4.2, exact, through `pnpm add`)
  - `packages/web/src/diagram/SequenceView.tsx` (replaced whole: it draws from `sequenceLayout`)
  - `packages/web/src/diagram/SequenceView.test.tsx` (one new test that pins today's drawing; the others are unchanged)
- Test:
  - `packages/web/src/diagram/sequenceLayout.test.ts`, `packages/web/src/diagram/SequenceView.test.tsx`
  - `packages/web/src/pages/defense/present/boardLayout.test.ts`, `rough.test.ts`, `Board.test.tsx`
  - `packages/web/src/theme/palette.test.ts` (unchanged; it scans the new files)
  - `packages/web/e2e/flows.spec.ts` (unchanged; the flows screen still draws the same)

**Interfaces:**
- Consumes:
  - Task 1, from `@dev-plumbing/core/schemas`: `Drawing`, `PresentStep`, `NoteInk` and `tablesDrawing(tables: TableDiff[]): DiagramData` (the relationship strip, with no "under 2 boxes" rule: one table still draws; node ids are model names, edge ids `${model}.${field}`).
  - Plans 3 and 4: `parseData`, `DiagramData`, `FlowData`, `TableDiff`, `NodeStatus` (`@dev-plumbing/core/schemas`), and `layoutDiagram(data, direction): Promise<DiagramLayout>` (`diagram/layout.ts`), whose edge `labelY` is the label's middle.
- Produces (the header's Web contract for Task 3, with what it needed added):
  - `sequenceLayout(flow: FlowData): SequenceLayout` and `ROW_H` (`diagram/sequenceLayout.ts`). Beyond the contract, each lane carries its `status`, and each step its row's `top` and its label's `anchor`; `label` is already cut to fit.
  - `BoardShape`, `Board`, `layoutBoard(drawing, data): Promise<Board | null>` and `shownAt(board: Board | null, steps, step): Set<string>` (`pages/defense/present/boardLayout.ts`). A line shape may carry `anchor`, and its `labelY` is the text's baseline. A ref may have more than one shape: a lane is its head (a box) and its lifeline (a line).
  - `seedOf(ref)`, `roughShape(shape, stroke)` and `roughMarker(around, key, stroke)` (`pages/defense/present/rough.ts`). Each returns `RoughPath[] = { d, stroke, strokeWidth }[]`: the contract's `{ d, strokeWidth }` plus the stroke, so a test can see it passed through.
  - `BoardView({ board, steps, step, animate, replayKey, message?, fill? })`, `chapterBoard(board, steps): ChapterBoard`, `BoardNote`, `PlacedNote` and `INK` (`pages/defense/present/Board.tsx`). The board gets the chapter's `steps` and the `step` on show (from 0), and works out what's shown and what's new itself (`shownAt`), so the notes and the frame are worked out once for the chapter (`chapterBoard`, memoised on the board and the steps). `message` is a line on the board, for "Drawing…" and "Nothing to draw in this chapter.". With `fill` (Task 4's full screen) the board takes the height it's given. In the page it takes the frame's shape: `aspect-ratio: <frame w> / <frame h>` at the column's width, `min-height: 220px`, `max-height: calc(100dvh - 220px)`, so its height changes only between chapters.
  - Test ids: `board` (with `data-animate`), `board-grid` (the dot pattern), `board-shape` (with `data-ref` and `data-kind`) and `board-note` (with `data-near` and `data-ink`).
- **The refs** (Decision 4): `node:`, `edge:` and `group:` for a diagram; `table:` and `link:` for the tables; `lane:` and `step:<n>` for a flow. `shownAt` adds, to the refs the steps so far revealed, each shown line's `ends` (an edge's two boxes, a link's two tables, a flow step's lanes) and each group with a box on show. A ref the board doesn't have is skipped, so a presenter written before its drawing changed still draws what it can.
- **The look** (Decisions 6 and 7):
  - the canvas (`bg-canvas`), a hairline border, and a dot grid: an SVG `<pattern>` of `var(--separator)` dots every 20 px (no gradient);
  - boxes, lines with a two-stroke arrowhead, dashed groups (and dashed external boxes, dashed edges and lifelines), in `var(--text)`, or `var(--slate)` for the tables;
  - labels in the system font, haloed in the canvas colour;
  - a note near a part: a rough ellipse round it in the note's ink (`ink`, `slate`, `seal`, `moss` are `var(--text)`, `var(--slate)`, `var(--seal)`, `var(--moss)`), and its text beside it, below the ring unless that covers a box, a line's label or a group's label the chapter shows, or a ring or note placed before it (then right, above, left, or one of the four corners; when every one of them covers something, the one that covers least). A note near a ref with several shapes (a lane) rings its box, the lane's head. A note whose `near` is `""`, or names nothing on show at its step, goes in a list at the board's foot, which holds a place for the chapter's later foot notes.
  - **Nothing moves between steps** (`chapterBoard`, once per chapter):
    - the notes are placed step by step: each step's new notes against what's on the board at that step, and what the chapter's later steps bring, and the notes and rings placed before, and then they stay where they are. Counting the later parts keeps a note off a box that comes after it (with only the step's own parts, a note near the job at step 2 lands on the retry queue that step 4 draws below it);
    - the frame (the SVG's viewBox) is everything the chapter shows by its last step (`shownAt(board, steps, steps.length - 1)`), with every ring and note it places and a 28 margin, at least 560 by 220. It's the same at every step, and a chapter that shows 10 boxes of a big drawing draws those 10 large. With nothing shown, it frames the whole board;
    - the SVG fills the board (`min-h-0 w-full flex-1`, the default `xMidYMid meet`). In the page the board is as tall as the frame is for its width (`aspect-ratio`, 220 px to the window less 220), so a wide drawing isn't a thin band in a tall box; in full screen (`fill`) it takes the height that's left.
  - **Motion:** when `animate`, each part the step adds draws along its length (`pathLength` 0 to 1, 0.6 s, in the board's order, `Math.min(0.15, 2.4 / n)` s apart for `n` new parts, so a big step still starts its last part within 2.4 s). A dashed stroke fades in instead, since Motion draws a path with its own dashes. This step's notes come after. Otherwise every part is a plain `<path>`, there at once. A new `replayKey` remounts what's shown, so the new parts draw again.

- [ ] **Step 1: Add the two dependencies, pinned exactly, and Motion's own packages with them**

Everything Motion pulls in must be at least two weeks old too. `motion@13.4.2` asks for `framer-motion` by a range (`^13.4.2`), and `framer-motion@13.4.2` asks for `motion-dom` (`^13.4.2`) and `motion-utils` (`^13.3.0`) the same way (`npm view framer-motion@13.4.2 dependencies`). On 2026-10-08 those ranges resolve to 13.5.1, 13.5.1 and 13.5.0, all under two weeks old. So pnpm overrides pin each one to the version `framer-motion@13.4.2` names. pnpm 10 reads its settings from `pnpm-workspace.yaml`, as it does `onlyBuiltDependencies`. In `pnpm-workspace.yaml`, replace:
```yaml
onlyBuiltDependencies:
  - esbuild
```
with:
```yaml
onlyBuiltDependencies:
  - esbuild
# Motion's own packages, pinned to the versions framer-motion@13.4.2 names, so nothing it brings is newer than it.
overrides:
  framer-motion: 13.4.2
  motion-dom: 13.4.2
  motion-utils: 13.3.0
```

Then run:
```bash
pnpm --filter @dev-plumbing/web add --save-exact roughjs@4.6.6 motion@13.4.2
grep -n '"roughjs"\|"motion"' packages/web/package.json
grep -nE '^  (roughjs|motion|framer-motion|motion-dom|motion-utils)@' pnpm-lock.yaml
```
Expected:
- `packages/web/package.json`'s dependencies gain `"motion": "13.4.2"` and `"roughjs": "4.6.6"`, with no `^`.
- The lockfile gains an `overrides:` section with the three pins, and resolves exactly `motion@13.4.2`, `framer-motion@13.4.2`, `motion-dom@13.4.2`, `motion-utils@13.3.0` and `roughjs@4.6.6` (each in `packages:` and `snapshots:`).
- Their other dependencies come with them: Rough.js's four small path helpers (`hachure-fill` 0.5.2, `path-data-parser` 0.1.0, `points-on-curve` 0.2.0 and `points-on-path` 0.2.1) and Motion's `tslib` 2.8.1.
- Every one of these was published by 2026-09-23, so each is at least two weeks old. Nothing else in the lockfile changes, and `pnpm install --frozen-lockfile` says it's up to date.

- [ ] **Step 2: Write the failing tests**

In `packages/web/src/diagram/SequenceView.test.tsx`, add this test before `it('lets one finger scroll the page and two fingers zoom', …)`. It pins where today's `SequenceView` draws each lane and step, so it passes before the change and must still pass after it:
```tsx
  it('draws each lane and step where it always has', () => {
    render(<SequenceView flow={flow} />);
    const svg = screen.getByTestId('sequence').querySelector('svg')!;
    const attrs = (selector: string, names: string[]) => [...svg.querySelectorAll(selector)].map((el) => names.map((n) => el.getAttribute(n)));
    expect(attrs('[data-testid=sequence-lane] rect', ['x', 'y', 'width', 'height'])).toEqual([
      ['16', '16', '160', '32'],
      ['200', '16', '160', '32'],
      ['384', '16', '160', '32'],
    ]);
    expect(attrs('[data-testid=sequence-lane] line', ['x1', 'y1', 'x2', 'y2'])).toEqual([
      ['96', '48', '96', '244'],
      ['280', '48', '280', '244'],
      ['464', '48', '464', '244'],
    ]);
    expect(attrs('[data-testid=sequence-lane] text', ['x', 'y'])).toEqual([
      ['96', '36'],
      ['280', '36'],
      ['464', '36'],
    ]);
    expect(attrs('[data-testid=sequence-step] path', ['d'])).toEqual([['M96,98 H280'], ['M96,134 h28 v16 h-28'], ['M96,186 H464']]);
    expect([...svg.querySelectorAll('[data-testid=sequence-step] text')].map((t) => [t.getAttribute('x'), t.getAttribute('y'), t.getAttribute('text-anchor'), t.textContent])).toEqual([
      ['188', '86', 'middle', '1. Find subscriptions due soon'],
      ['130', '146', 'start', '2. Skip paused customers'],
      ['280', '174', 'middle', '3. Send the reminder'],
      ['280', '230', 'middle', '4. Wait for tomorrow'],
    ]);
  });
```

`packages/web/src/diagram/sequenceLayout.test.ts`:
```ts
// @vitest-environment node
import type { FlowData } from '@dev-plumbing/core/schemas';
import { describe, expect, it } from 'vitest';
import { sequenceLayout } from './sequenceLayout';

const flow: FlowData = {
  kind: 'system',
  lanes: [
    { id: 'job', label: 'Reminder job', status: 'new' },
    { id: 'db', label: 'Database', status: 'unchanged' },
    { id: 'sms', label: 'SMS provider', status: 'external' },
  ],
  steps: [
    { n: 3, from: 'job', to: 'sms', label: 'Send the reminder' },
    { n: 1, from: 'job', to: 'db', label: 'Find subscriptions due soon' },
    { n: 2, from: 'job', to: 'job', label: 'Skip paused customers', systemNote: 'remindersPaused is true' },
    { n: 4, label: 'Wait for tomorrow' },
  ],
};

describe('sequenceLayout', () => {
  // The numbers SequenceView drew before its layout moved here: lanes of 160 with 24 between and 16 each side, lane
  // heads 32 high, and rows of 44 under 68 of headers.
  it('puts each lane in its column, with its head and its lifeline', () => {
    const layout = sequenceLayout(flow);
    expect([layout.width, layout.height]).toEqual([560, 260]);
    expect(layout.lanes).toEqual([
      { id: 'job', label: 'Reminder job', status: 'new', x: 96, headY: 16, headW: 160, headH: 32, lifeTop: 48, lifeBottom: 244 },
      { id: 'db', label: 'Database', status: 'unchanged', x: 280, headY: 16, headW: 160, headH: 32, lifeTop: 48, lifeBottom: 244 },
      { id: 'sms', label: 'SMS provider', status: 'external', x: 464, headY: 16, headW: 160, headH: 32, lifeTop: 48, lifeBottom: 244 },
    ]);
  });

  it('gives each step a row in step order: an arrow between lanes, a loop on one, a note across the width', () => {
    expect(sequenceLayout(flow).steps).toEqual([
      { n: 1, shape: 'arrow', x1: 96, x2: 280, y: 98, top: 68, label: '1. Find subscriptions due soon', labelX: 188, labelY: 86, anchor: 'middle' },
      { n: 2, shape: 'loop', x1: 96, x2: 124, y: 142, top: 112, label: '2. Skip paused customers', labelX: 130, labelY: 146, anchor: 'start' },
      { n: 3, shape: 'arrow', x1: 96, x2: 464, y: 186, top: 156, label: '3. Send the reminder', labelX: 280, labelY: 174, anchor: 'middle' },
      { n: 4, shape: 'note', x1: 16, x2: 544, y: 230, top: 200, label: '4. Wait for tomorrow', labelX: 280, labelY: 230, anchor: 'middle' },
    ]);
  });

  it('runs an arrow right to left, puts a loop on the last lane label to its left, and cuts labels that would not fit', () => {
    const layout = sequenceLayout({
      kind: 'system',
      lanes: flow.lanes,
      steps: [
        { n: 1, from: 'sms', to: 'job', label: 'Delivery receipt' },
        { n: 2, from: 'sms', label: 'Retries on its own' },
        { n: 3, from: 'job', to: 'db', label: 'A label far too long to fit between two lanes next to each other in any drawing' },
      ],
    });
    const [back, loop, long] = layout.steps;
    expect([back!.x1, back!.x2, back!.labelX]).toEqual([464, 96, 280]);
    expect([loop!.shape, loop!.x1, loop!.labelX, loop!.anchor]).toEqual(['loop', 464, 458, 'end']);
    // 320 of room at 6.5 a character: 49 characters, the last an ellipsis.
    expect(long!.label).toHaveLength(49);
    expect(long!.label.endsWith('…')).toBe(true);
    // A lane label is cut to its head.
    expect(sequenceLayout({ kind: 'system', lanes: [{ id: 'a', label: 'A lane with a name much longer than its head', status: 'new' }], steps: [{ n: 1, from: 'a', label: 'x' }] }).lanes[0]!.label).toBe('A lane with a name mu…');
  });

  it('draws one column wide with no lanes, and every step as a note', () => {
    const layout = sequenceLayout({ kind: 'both', steps: [{ n: 1, label: 'Opens the page' }] });
    expect([layout.width, layout.height, layout.lanes]).toEqual([192, 128, []]);
    expect(layout.steps[0]).toMatchObject({ shape: 'note', x1: 16, x2: 176, labelX: 96 });
  });
});
```

`packages/web/src/pages/defense/present/boardLayout.test.ts` (the real ELK, in the node environment, as `layout.test.ts` does):
```ts
// @vitest-environment node
import type { DiagramData, FlowData, PresentStep, TableDiff } from '@dev-plumbing/core/schemas';
import { describe, expect, it } from 'vitest';
import { layoutBoard, shownAt, type BoardShape } from './boardLayout';

const system: DiagramData = {
  kind: 'system',
  groups: [{ id: 'jobs', label: 'Jobs' }],
  nodes: [
    { id: 'page', label: 'Reminders page', status: 'new' },
    { id: 'job', label: 'Reminder job', group: 'jobs', status: 'changed' },
    { id: 'retry', label: 'Retry queue', group: 'jobs', status: 'new' },
    { id: 'sms', label: 'SMS provider', status: 'external' },
  ],
  edges: [
    { id: 'schedules', from: 'page', to: 'job', label: 'schedules' },
    { id: 'sends', from: 'job', to: 'sms', style: 'dashed' },
  ],
};
const reminder: TableDiff = {
  model: 'RestockReminder',
  change: 'new',
  fields: [
    { name: 'id', type: 'String', change: 'added' },
    { name: 'subscriptionId', type: 'String', change: 'added' },
    { name: 'subscription', type: 'Subscription', change: 'added' },
  ],
  schemaDiff: '+model RestockReminder {}',
};
const subscription: TableDiff = { model: 'Subscription', change: 'changed', fields: [{ name: 'leadDays', type: 'Int', change: 'added' }], schemaDiff: '+  leadDays Int' };
const flow: FlowData = {
  kind: 'system',
  lanes: [
    { id: 'job', label: 'Reminder job', status: 'new' },
    { id: 'db', label: 'Database', status: 'unchanged' },
    { id: 'sms', label: 'SMS provider', status: 'external' },
  ],
  steps: [
    { n: 2, from: 'job', to: 'job', label: 'Skip paused customers' },
    { n: 1, from: 'job', to: 'db', label: 'Find subscriptions due soon' },
    { n: 3, label: 'Wait for tomorrow' },
  ],
};

const refs = (shapes: BoardShape[]) => shapes.map((s) => `${s.kind} ${s.ref}`);
const step = (reveal: string[]): PresentStep => ({ caption: 'Say this.', reveal, notes: [] });

describe('layoutBoard', () => {
  it('lays a diagram out with ELK: groups, then lines, then boxes, each by its typed ref', async () => {
    const board = (await layoutBoard({ kind: 'diagram', itemId: 'architecture-system' }, system))!;
    expect(board.tone).toBe('ink');
    expect(refs(board.shapes)).toEqual(['group group:jobs', 'line edge:schedules', 'line edge:sends', 'box node:page', 'box node:job', 'box node:retry', 'box node:sms']);
    const [group, schedules, sends] = board.shapes;
    expect(group).toMatchObject({ label: 'Jobs', members: ['node:job', 'node:retry'] });
    expect(schedules).toMatchObject({ label: 'schedules', arrow: true, dashed: false, ends: ['node:page', 'node:job'] });
    expect(sends).toMatchObject({ arrow: true, dashed: true, ends: ['node:job', 'node:sms'] });
    expect(sends).not.toHaveProperty('label');
    expect(board.shapes.find((s) => s.ref === 'node:sms')).toMatchObject({ kind: 'box', label: 'SMS provider', dashed: true });
    // Absolute positions inside the board.
    for (const s of board.shapes) {
      if (s.kind === 'line') expect(s.points.length).toBeGreaterThanOrEqual(2);
      else {
        expect(s.x + s.w).toBeLessThanOrEqual(board.width);
        expect(s.y + s.h).toBeLessThanOrEqual(board.height);
      }
    }
  }, 30_000);

  it("draws the project's tables as the relationship strip, in slate, skipping data that doesn't parse", async () => {
    const board = (await layoutBoard({ kind: 'tables' }, [reminder, { model: '' }, subscription]))!;
    expect(board.tone).toBe('slate');
    expect(refs(board.shapes)).toEqual(['line link:RestockReminder.subscription', 'box table:RestockReminder', 'box table:Subscription']);
    expect(board.shapes[0]).toMatchObject({ label: 'subscription', ends: ['table:RestockReminder', 'table:Subscription'] });
    // One table still draws.
    expect(refs((await layoutBoard({ kind: 'tables' }, [subscription]))!.shapes)).toEqual(['box table:Subscription']);
  }, 30_000);

  it('draws a system flow as a sequence: each lane its head and lifeline, each step its arrow, loop or note', async () => {
    const board = (await layoutBoard({ kind: 'flow', itemId: 'flows-reminder' }, flow))!;
    expect(refs(board.shapes)).toEqual([
      'line lane:job',
      'box lane:job',
      'line lane:db',
      'box lane:db',
      'line lane:sms',
      'box lane:sms',
      'line step:1',
      'line step:2',
      'line step:3',
    ]);
    expect([board.width, board.height]).toEqual([560, 216]);
    expect(board.shapes[1]).toEqual({ ref: 'lane:job', kind: 'box', x: 16, y: 16, w: 160, h: 32, label: 'Reminder job', dashed: false });
    expect(board.shapes[0]).toMatchObject({ points: [{ x: 96, y: 48 }, { x: 96, y: 200 }], arrow: false, dashed: true, ends: [] });
    expect(board.shapes[5]).toMatchObject({ dashed: true });
    const [arrow, loop, note] = board.shapes.slice(6);
    expect(arrow).toMatchObject({ points: [{ x: 96, y: 98 }, { x: 280, y: 98 }], label: '1. Find subscriptions due soon', arrow: true, ends: ['lane:job', 'lane:db'] });
    expect(loop).toMatchObject({ anchor: 'start', arrow: true, ends: ['lane:job'] });
    expect(loop!.kind === 'line' && loop!.points).toHaveLength(4);
    expect(note).toMatchObject({ points: [], label: '3. Wait for tomorrow', arrow: false, ends: [] });
  });

  it("gives null when there's nothing it can draw", async () => {
    expect(await layoutBoard({ kind: 'diagram', itemId: 'x' }, { kind: 'system', nodes: [] })).toBeNull();
    expect(await layoutBoard({ kind: 'diagram', itemId: 'x' }, null)).toBeNull();
    expect(await layoutBoard({ kind: 'tables' }, [])).toBeNull();
    expect(await layoutBoard({ kind: 'tables' }, reminder)).toBeNull();
    // A user flow is a storyboard, which the board doesn't draw.
    expect(await layoutBoard({ kind: 'flow', itemId: 'x' }, { kind: 'user', steps: [{ n: 1, label: 'Opens the page' }] })).toBeNull();
    expect(await layoutBoard({ kind: 'flow', itemId: 'x' }, { kind: 'system', lanes: [], steps: [{ n: 1, label: 'x' }] })).toBeNull();
  });
});

describe('shownAt', () => {
  it("adds each step's refs to the ones before, with a line's ends and a group once one of its boxes shows", async () => {
    const board = (await layoutBoard({ kind: 'diagram', itemId: 'architecture-system' }, system))!;
    const steps = [step(['node:page']), step(['edge:sends']), step(['group:jobs'])];
    expect([...shownAt(board, steps, 0)]).toEqual(['node:page']);
    expect([...shownAt(board, steps, 1)].sort()).toEqual(['edge:sends', 'group:jobs', 'node:job', 'node:page', 'node:sms']);
    expect(shownAt(board, steps, 2).has('node:retry')).toBe(false);
  }, 30_000);

  it('skips refs the data no longer has, and shows nothing without a board', async () => {
    const board = (await layoutBoard({ kind: 'flow', itemId: 'flows-reminder' }, flow))!;
    const steps = [step(['step:1', 'lane:gone', 'step:9', 'node:job'])];
    expect([...shownAt(board, steps, 0)].sort()).toEqual(['lane:db', 'lane:job', 'step:1']);
    expect(shownAt(null, steps, 0).size).toBe(0);
  });
});
```

`packages/web/src/pages/defense/present/rough.test.ts`:
```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { BoardShape } from './boardLayout';
import { roughMarker, roughShape, seedOf } from './rough';

const box: BoardShape = { ref: 'node:job', kind: 'box', x: 10, y: 20, w: 140, h: 36, label: 'Reminder job', dashed: false };
const line: BoardShape = { ref: 'edge:sends', kind: 'line', points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }], arrow: true, dashed: false, ends: [] };

describe('seedOf', () => {
  it('gives each ref its own seed, the same every time, from 1 to 2^31 - 1', () => {
    expect(seedOf('node:job')).toBe(seedOf('node:job'));
    expect(seedOf('node:job')).not.toBe(seedOf('node:sms'));
    for (const ref of ['', 'node:job', 'link:RestockReminder.subscription', 'x'.repeat(200)]) {
      expect(Number.isInteger(seedOf(ref))).toBe(true);
      expect(seedOf(ref)).toBeGreaterThanOrEqual(1);
      expect(seedOf(ref)).toBeLessThanOrEqual(2 ** 31 - 1);
    }
  });
});

describe('roughShape', () => {
  it('draws the same shape the same way every time, and another ref differently', () => {
    const [a] = roughShape(box, 'var(--text)');
    expect(a!.d).toMatch(/^M/);
    expect(roughShape(box, 'var(--text)')).toEqual(roughShape(box, 'var(--text)'));
    expect(roughShape({ ...box, ref: 'node:sms' }, 'var(--text)')[0]!.d).not.toBe(a!.d);
  });

  it('passes the stroke through, with a width for each kind of shape', () => {
    expect(roughShape(box, 'var(--slate)').map((p) => [p.stroke, p.strokeWidth])).toEqual([['var(--slate)', 1.5]]);
    const group: BoardShape = { ref: 'group:jobs', kind: 'group', x: 0, y: 0, w: 300, h: 120, label: 'Jobs', members: [] };
    expect(roughShape(group, 'var(--text)').map((p) => [p.stroke, p.strokeWidth])).toEqual([['var(--text)', 1]]);
  });

  it('draws a line through its points with a two-stroke arrowhead, and nothing for a line without points', () => {
    expect(roughShape(line, 'var(--text)').map((p) => p.strokeWidth)).toEqual([1.3, 1.3, 1.3]);
    expect(roughShape({ ...line, arrow: false }, 'var(--text)')).toHaveLength(1);
    expect(roughShape({ ...line, points: [] }, 'var(--text)')).toEqual([]);
  });
});

describe('roughMarker', () => {
  it("rings a part in the note's ink, the same way for the same note", () => {
    const ring = roughMarker({ x: 10, y: 20, w: 140, h: 36 }, 'note:1.0', 'var(--seal)');
    expect(ring).toHaveLength(1);
    expect(ring[0]!.stroke).toBe('var(--seal)');
    expect(roughMarker({ x: 10, y: 20, w: 140, h: 36 }, 'note:1.0', 'var(--seal)')).toEqual(ring);
  });
});
```

`packages/web/src/pages/defense/present/Board.test.tsx`:
```tsx
import type { PresentStep } from '@dev-plumbing/core/schemas';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BoardView, chapterBoard } from './Board';
import type { Board } from './boardLayout';

// Every animation ends at once, so a test sees each part as it ends up.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

const diagram: Board = {
  width: 420,
  height: 160,
  tone: 'ink',
  shapes: [
    { ref: 'group:jobs', kind: 'group', x: 180, y: 10, w: 220, h: 120, label: 'Jobs', members: ['node:job'] },
    { ref: 'edge:schedules', kind: 'line', points: [{ x: 150, y: 60 }, { x: 200, y: 60 }], label: 'schedules', labelX: 175, labelY: 54, arrow: true, dashed: false, ends: ['node:page', 'node:job'] },
    { ref: 'node:page', kind: 'box', x: 10, y: 40, w: 140, h: 36, label: 'Reminders page', dashed: false },
    { ref: 'node:job', kind: 'box', x: 200, y: 40, w: 140, h: 36, label: 'Reminder job', dashed: false },
  ],
};
const tables: Board = { width: 200, height: 80, tone: 'slate', shapes: [{ ref: 'table:Subscription', kind: 'box', x: 10, y: 10, w: 150, h: 36, label: 'Subscription', dashed: false }] };
type Note = PresentStep['notes'][number];
const say = (reveal: string[], notes: Note[] = []): PresentStep => ({ caption: 'Say this.', reveal, notes });
const twice: Note = { near: 'node:job', text: 'Runs twice? One a day per subscription.', ink: 'seal' };

function show(over: Partial<Parameters<typeof BoardView>[0]> = {}) {
  return render(<BoardView board={diagram} steps={[say(['node:page'])]} step={0} animate={false} replayKey={0} {...over} />);
}
const drawn = () => screen.queryAllByTestId('board-shape').map((s) => s.getAttribute('data-ref'));
const paths = (ref: string) => [...document.querySelectorAll(`[data-testid=board-shape][data-ref="${ref}"] path`)] as SVGPathElement[];
const viewBox = () => document.querySelector('[data-testid=board] svg[viewBox]')!.getAttribute('viewBox');
const noteAt = () => [...document.querySelectorAll('[data-testid=board-note] text')].map((t) => [t.getAttribute('x'), t.getAttribute('y')]);

describe('the board', () => {
  it('draws only the parts on show, each by hand, with its label in the system font', () => {
    show({ steps: [say(['node:page', 'node:job', 'edge:schedules', 'group:jobs'])] });
    expect(drawn()).toEqual(['group:jobs', 'edge:schedules', 'node:page', 'node:job']);
    cleanup();
    show();
    expect(drawn()).toEqual(['node:page']);
    const page = screen.getByTestId('board-shape');
    expect(within(page).getByText('Reminders page').tagName).toBe('text');
    // A rough rectangle, in ink, behind its label.
    expect(paths('node:page')[0]!.getAttribute('d')).toMatch(/^M/);
    expect(paths('node:page')[0]!.style.stroke).toBe('var(--text)');
    expect(screen.queryByText('Reminder job')).toBeNull();
  });

  it('dashes a group, and draws a line with its arrowhead and its label', () => {
    show({ steps: [say(['group:jobs', 'edge:schedules'])] });
    expect(paths('group:jobs')[0]!.style.strokeDasharray).toBe('6 5');
    expect(paths('edge:schedules')).toHaveLength(3);
    expect(screen.getByText('schedules')).toBeTruthy();
    expect(screen.getByText('Jobs')).toBeTruthy();
  });

  it('draws the tables in slate', () => {
    show({ board: tables, steps: [say(['table:Subscription'])] });
    expect(paths('table:Subscription')[0]!.style.stroke).toBe('var(--slate)');
    expect(screen.getByText('Subscription').style.fill).toBe('var(--slate)');
  });

  it('lies on a faint dot grid, an SVG pattern of separator dots every 20 px', () => {
    show();
    const pattern = screen.getByTestId('board-grid');
    expect(pattern.tagName).toBe('pattern');
    expect([pattern.getAttribute('width'), pattern.getAttribute('height'), pattern.getAttribute('patternUnits')]).toEqual(['20', '20', 'userSpaceOnUse']);
    expect((pattern.querySelector('circle') as SVGCircleElement).style.fill).toBe('var(--separator)');
    expect(screen.getByTestId('board').className).toContain('bg-canvas');
  });

  it("rings the part a note is near, in the note's ink, and writes the note beside it", () => {
    show({ steps: [say(['node:page'], [{ near: 'node:page', text: 'Safe to retry.', ink: 'moss' }]), say(['node:job'], [twice])], step: 1 });
    const notes = screen.getAllByTestId('board-note');
    expect(notes.map((n) => [n.getAttribute('data-near'), n.getAttribute('data-ink'), n.textContent])).toEqual([
      ['node:page', 'moss', 'Safe to retry.'],
      ['node:job', 'seal', 'Runs twice? One a day per subscription.'],
    ]);
    const ring = notes[1]!.querySelector('path') as SVGPathElement;
    expect(ring.style.stroke).toBe('var(--seal)');
    expect((notes[1]!.querySelector('text') as SVGTextElement).style.fill).toBe('var(--seal)');
    // Long notes wrap.
    expect(notes[1]!.querySelectorAll('tspan')).toHaveLength(2);
  });

  it("lists at the foot a note for the whole board, and one whose part isn't on show", () => {
    show({ steps: [say(['node:page'], [{ near: '', text: 'One job, one table.', ink: 'ink' }]), say([], [twice])], step: 1 });
    const listed = screen.getAllByRole('listitem');
    expect(listed.map((li) => [li.getAttribute('data-testid'), li.textContent, li.style.color])).toEqual([
      ['board-note', 'One job, one table.', 'var(--text)'],
      ['board-note', 'Runs twice? One a day per subscription.', 'var(--seal)'],
    ]);
    // A step earlier, the second note's place is held but it isn't shown, so the drawing above keeps its size.
    cleanup();
    show({ steps: [say(['node:page'], [{ near: '', text: 'One job, one table.', ink: 'ink' }]), say([], [twice])], step: 0 });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['One job, one table.']);
    expect(screen.getAllByTestId('board-note')).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid=board] li')).toHaveLength(2);
  });

  it('with nothing to draw, says so and lists the notes', () => {
    show({ board: null, steps: [say(['node:job'], [twice])], message: 'Nothing to draw in this chapter.' });
    expect(screen.getByText('Nothing to draw in this chapter.')).toBeTruthy();
    expect(screen.queryAllByTestId('board-shape')).toHaveLength(0);
    expect(screen.getByRole('listitem').textContent).toBe('Runs twice? One a day per subscription.');
  });

  it("draws this step's new parts along their length when it animates, and everything at once when it doesn't", () => {
    const steps = [say(['node:page']), say(['edge:schedules'])];
    show({ steps, step: 1, animate: true });
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('true');
    // Motion draws a path by its length: pathLength 1, and the dashes it moves.
    expect(paths('node:job')[0]!.getAttribute('pathLength')).toBe('1');
    expect(paths('edge:schedules').every((p) => p.getAttribute('pathLength') === '1')).toBe(true);
    // A dashed group fades in instead, and what an earlier step drew stays as it was.
    expect(paths('group:jobs')[0]!.getAttribute('pathLength')).toBeNull();
    expect(paths('node:page')[0]!.getAttribute('pathLength')).toBeNull();
    cleanup();
    show({ steps, step: 1, animate: false });
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('false');
    expect(document.querySelectorAll('path[pathLength]')).toHaveLength(0);
  });

  it('keeps one frame for the whole chapter, round what the chapter shows', () => {
    const wide: Board = {
      width: 2600,
      height: 120,
      tone: 'ink',
      shapes: [
        { ref: 'edge:hands', kind: 'line', points: [{ x: 150, y: 58 }, { x: 260, y: 58 }], arrow: true, dashed: false, ends: ['node:a', 'node:b'] },
        { ref: 'node:a', kind: 'box', x: 10, y: 40, w: 140, h: 36, label: 'Reminder job', dashed: false },
        { ref: 'node:b', kind: 'box', x: 260, y: 40, w: 140, h: 36, label: 'Mailer', dashed: false },
        { ref: 'node:z', kind: 'box', x: 2400, y: 40, w: 140, h: 36, label: 'Archive', dashed: false },
      ],
    };
    const steps = [say(['node:a']), say(['edge:hands'], [{ near: 'node:b', text: 'Outside our account.', ink: 'seal' }])];
    show({ board: wide, steps, step: 0 });
    const first = viewBox();
    cleanup();
    show({ board: wide, steps, step: 1 });
    expect(viewBox()).toBe(first);
    // Only what the chapter shows: the far box isn't in the frame, so the two boxes are drawn large.
    const [x, , w, h] = first!.split(' ').map(Number);
    expect(x! + w!).toBeLessThan(2400);
    expect(w).toBeLessThan(700);
    // In the page the board takes the frame's shape, within 220 px and the window less 220; in full screen it fills.
    const figure = screen.getByTestId('board');
    expect([figure.style.aspectRatio, figure.style.minHeight, figure.style.maxHeight]).toEqual([`${w} / ${h}`, '220px', 'calc(100dvh - 220px)']);
    cleanup();
    show({ board: wide, steps, step: 1, fill: true });
    expect(screen.getByTestId('board').className).toContain('h-full');
    expect(screen.getByTestId('board').style.aspectRatio).toBe('');
    // Another chapter, showing another part, has its own frame.
    cleanup();
    show({ board: wide, steps: [say(['node:z'])], step: 0 });
    expect(viewBox()).not.toBe(first);
    expect(Number(viewBox()!.split(' ')[0])).toBeGreaterThan(2000);
  });

  it("keeps a note where it is from its step to the chapter's last", () => {
    // The queue comes in under the page at step 3: the note goes where the queue won't be, and stays there.
    const stacked: Board = { ...diagram, shapes: [...diagram.shapes, { ref: 'node:queue', kind: 'box', x: 10, y: 96, w: 140, h: 36, label: 'Queue', dashed: false }] };
    const steps = [say(['node:page'], [{ near: 'node:page', text: 'Customers set the lead time here.', ink: 'ink' }]), say(['edge:schedules']), say(['node:queue'])];
    show({ board: stacked, steps, step: 0 });
    const at = noteAt();
    expect(at).toHaveLength(1);
    for (const step of [1, 2]) {
      cleanup();
      show({ board: stacked, steps, step });
      expect(noteAt()).toEqual(at);
    }
  });

  it("rings a lane's head, not the middle of its lifeline", () => {
    const flow: Board = {
      width: 560,
      height: 600,
      tone: 'ink',
      shapes: [
        { ref: 'lane:mailer', kind: 'line', points: [{ x: 280, y: 48 }, { x: 280, y: 580 }], arrow: false, dashed: true, ends: [] },
        { ref: 'lane:mailer', kind: 'box', x: 200, y: 16, w: 160, h: 32, label: 'Mailer', dashed: true },
      ],
    };
    const { placed } = chapterBoard(flow, [say(['lane:mailer'], [{ near: 'lane:mailer', text: 'Retries are theirs.', ink: 'seal' }])]);
    expect(placed[0]!.mark).toEqual({ x: 200, y: 16, w: 160, h: 32 });
  });

  it("doesn't write a note over a group's label, and tries the corners before covering anything", () => {
    // Below and to the right of the job are taken, and above it is the group's label: the note goes to its left.
    const crowded: Board = {
      width: 520,
      height: 220,
      tone: 'ink',
      shapes: [
        { ref: 'group:jobs', kind: 'group', x: 0, y: 0, w: 500, h: 200, label: 'Background jobs', members: ['node:job', 'node:queue', 'node:retry'] },
        { ref: 'node:job', kind: 'box', x: 20, y: 40, w: 140, h: 36, label: 'Reminder job', dashed: false },
        { ref: 'node:queue', kind: 'box', x: 20, y: 100, w: 140, h: 36, label: 'Queue', dashed: false },
        { ref: 'node:retry', kind: 'box', x: 180, y: 40, w: 140, h: 36, label: 'Retry', dashed: false },
      ],
    };
    const note: Note = { near: 'node:job', text: 'Runs once a day', ink: 'seal' };
    const { placed } = chapterBoard(crowded, [say(['node:job', 'node:queue', 'node:retry'], [note])]);
    expect(placed[0]!.at.x + placed[0]!.at.w).toBeLessThanOrEqual(0);
    // With the left taken too, the first free corner: below and to the right, clear of the queue and the retry.
    const scheduler = { ref: 'node:scheduler', kind: 'box' as const, x: -200, y: 40, w: 140, h: 36, label: 'Scheduler', dashed: false };
    const fuller: Board = { ...crowded, shapes: [...crowded.shapes, scheduler] };
    const corner = chapterBoard(fuller, [say(['node:job', 'node:queue', 'node:retry', 'node:scheduler'], [note])]).placed[0]!.at;
    expect(corner).toEqual({ x: 164, y: 91, w: 102, h: 16 });
  });

  it('uses only Ink wash tokens: no Tailwind palette colours or gradients', () => {
    show({ steps: [say(['node:page', 'node:job', 'edge:schedules', 'group:jobs'], [twice, { ...twice, near: '' }])] });
    const html = screen.getByTestId('board').outerHTML;
    expect(html).not.toMatch(/\b(?:bg|text|border|fill|stroke)-(?:red|orange|amber|yellow|green|blue|indigo|purple|pink|gray|zinc|neutral|stone|slate)-\d{2,3}\b/);
    expect(html).not.toMatch(/gradient/i);
    // Every colour is a theme variable.
    for (const color of html.match(/(?:fill|stroke|color): [^;"]+/g) ?? []) expect(color).toMatch(/: (?:var\(--[a-z0-9-]+\)|none|transparent)$/);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm vitest run packages/web/src/diagram packages/web/src/pages/defense/present`
Expected: FAIL.
- `sequenceLayout.test.ts`, `boardLayout.test.ts`, `rough.test.ts` and `Board.test.tsx` fail to load, since their modules don't exist yet: `Failed to resolve import "./Board" from "packages/web/src/pages/defense/present/Board.test.tsx". Does the file exist?`, and the same for `./sequenceLayout`, `./boardLayout` and `./rough`.
- `SequenceView.test.tsx` passes, all 6: the new test describes the drawing as it is today.
- `layout.test.ts` and `DiagramView.test.tsx` pass.

- [ ] **Step 4: Lay a sequence out in a pure function, and draw SequenceView from it**

`packages/web/src/diagram/sequenceLayout.ts`:
```ts
import type { FlowData, NodeStatus } from '@dev-plumbing/core/schemas';

// In SVG units. Lanes are columns; steps are rows under the lane headers, in step order.
const LANE_W = 160;
const GAP = 24;
const PAD = 16;
const HEAD_H = 32;
const TOP = PAD + HEAD_H + 20;
/** One step's row. */
export const ROW_H = 44;
/** How far a loop reaches out from its lane. */
const LOOP_W = 28;
/** Roughly one character of 12 px text, to cut labels that wouldn't fit. */
const CHAR_W = 6.5;

export type SequenceLayout = {
  width: number;
  height: number;
  /** In the flow's order. `x` is the lane's centre, where its lifeline runs; its head is `headW` wide, centred on `x`. */
  lanes: { id: string; label: string; status: NodeStatus; x: number; headY: number; headW: number; headH: number; lifeTop: number; lifeBottom: number }[];
  /**
   * In step order, one row each, from `top`. An arrow runs from x1 to x2 at y. A loop leaves x1 at y - 8, reaches out
   * to x2 and comes back at y + 8. A note is only its label, across x1 to x2. `label` is "<n>. <label>", cut to fit,
   * and sits at labelX, labelY with its `anchor`.
   */
  steps: {
    n: number;
    shape: 'arrow' | 'loop' | 'note';
    x1: number;
    x2: number;
    y: number;
    top: number;
    label: string;
    labelX: number;
    labelY: number;
    anchor: 'start' | 'middle' | 'end';
  }[];
};

const clip = (text: string, room: number) => {
  const max = Math.max(4, Math.floor(room / CHAR_W));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * A system flow as a sequence diagram, laid out: one column per lane, one numbered row per step. A step between two
 * lanes is an arrow. A step on one lane (or with only one end) is a small loop. A step with no lanes is a note across
 * the whole width. Pure: the flows screen and the whiteboard draw from the same numbers.
 */
export function sequenceLayout(flow: FlowData): SequenceLayout {
  const lanes = flow.lanes ?? [];
  const columns = Math.max(lanes.length, 1);
  const width = PAD * 2 + columns * LANE_W + (columns - 1) * GAP;
  const steps = [...flow.steps].sort((a, b) => a.n - b.n);
  const height = TOP + steps.length * ROW_H + PAD;
  const centre = new Map(lanes.map((l, i) => [l.id, PAD + i * (LANE_W + GAP) + LANE_W / 2]));

  return {
    width,
    height,
    lanes: lanes.map((l) => ({
      id: l.id,
      label: clip(l.label, LANE_W - 16),
      status: l.status,
      x: centre.get(l.id)!,
      headY: PAD,
      headW: LANE_W,
      headH: HEAD_H,
      lifeTop: PAD + HEAD_H,
      lifeBottom: height - PAD,
    })),
    steps: steps.map((s, k) => {
      const top = TOP + k * ROW_H;
      const y = top + 30;
      const text = `${s.n}. ${s.label}`;
      const a = s.from === undefined ? undefined : centre.get(s.from);
      const b = s.to === undefined ? undefined : centre.get(s.to);
      if (a === undefined && b === undefined) {
        return { n: s.n, shape: 'note' as const, x1: PAD, x2: width - PAD, y, top, label: clip(text, width - PAD * 2), labelX: width / 2, labelY: y, anchor: 'middle' as const };
      }
      if (a === undefined || b === undefined || a === b) {
        const x = a ?? b ?? PAD;
        // The label goes on whichever side of the lane has more room.
        const right = width - PAD - (x + LOOP_W + 6);
        const left = x - PAD - 6;
        const onRight = right >= left;
        return {
          n: s.n,
          shape: 'loop' as const,
          x1: x,
          x2: x + LOOP_W,
          y,
          top,
          label: clip(text, Math.max(right, left)),
          labelX: onRight ? x + LOOP_W + 6 : x - 6,
          labelY: y + 4,
          anchor: onRight ? ('start' as const) : ('end' as const),
        };
      }
      const span = Math.abs(b - a);
      return { n: s.n, shape: 'arrow' as const, x1: a, x2: b, y, top, label: clip(text, span + LANE_W - 24), labelX: Math.min(a, b) + span / 2, labelY: top + 18, anchor: 'middle' as const };
    }),
  };
}
```

`packages/web/src/diagram/SequenceView.tsx` becomes (the same SVG, attribute for attribute, from the layout's numbers):
```tsx
import type { FlowData, NodeStatus } from '@dev-plumbing/core/schemas';
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import type { Tone } from './DiagramView';
import { ROW_H, sequenceLayout } from './sequenceLayout';

const STROKE: Record<NodeStatus, string> = { new: 'var(--moss)', changed: 'var(--amber)', unchanged: 'var(--mist)', external: 'var(--mist)' };

type Step = FlowData['steps'][number];

/**
 * A system flow as a sequence diagram: one column per lane, one numbered row per step, where sequenceLayout puts them.
 * A step between two lanes is an arrow. A step on one lane (or with only one end) is a small loop.
 * A step with no lanes is a note across the whole width.
 */
export function SequenceView({
  flow,
  selected = null,
  onSelect,
  bubbles,
}: {
  flow: FlowData;
  selected?: number | null;
  onSelect?: (n: number) => void;
  bubbles?: Record<number, { count: number; tone: Tone }>;
}) {
  // Marker ids must be unique per drawing and safe inside url(#…).
  const uid = `dp-seq-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const layout = sequenceLayout(flow);
  const { width, height } = layout;
  // The flow's own lanes and steps, in the layout's order, for their full labels and notes.
  const lanes = flow.lanes ?? [];
  const steps = [...flow.steps].sort((a, b) => a.n - b.n);

  const asButton = (s: Step, on: boolean) =>
    onSelect
      ? {
          role: 'button',
          tabIndex: 0,
          'aria-label': `Step ${s.n}: ${s.label}`,
          'aria-pressed': on,
          className: 'group cursor-pointer outline-none',
          onClick: () => onSelect(s.n),
          onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(s.n);
            }
          },
        }
      : {};

  return (
    <figure data-testid="sequence" className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        className="block h-auto"
        style={{ maxWidth: width, touchAction: 'pan-x pan-y pinch-zoom' }}
        role="group"
        aria-label={`Sequence of ${steps.length} step${steps.length === 1 ? '' : 's'}`}
      >
        <defs>
          {(['plain', 'selected'] as const).map((v) => (
            <marker key={v} id={`${uid}-${v}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" style={{ fill: v === 'selected' ? 'var(--slate)' : 'var(--text-3)' }} />
            </marker>
          ))}
        </defs>

        {layout.lanes.map((l, i) => {
          const x = l.x - l.headW / 2;
          return (
            <g key={l.id} data-testid="sequence-lane" data-lane={l.id} data-status={l.status}>
              <title>{lanes[i]!.label}</title>
              <line x1={l.x} y1={l.lifeTop} x2={l.x} y2={l.lifeBottom} strokeDasharray="4 4" style={{ stroke: 'var(--mist)' }} />
              <rect
                x={x}
                y={l.headY}
                width={l.headW}
                height={l.headH}
                rx={6}
                strokeDasharray={l.status === 'external' ? '4 3' : undefined}
                style={{ fill: 'var(--cell)', stroke: STROKE[l.status], strokeWidth: 1 }}
              />
              <text x={l.x} y={l.headY + l.headH / 2 + 4} textAnchor="middle" fontSize={12.5} style={{ fill: 'var(--text)' }}>
                {l.label}
              </text>
            </g>
          );
        })}

        {layout.steps.map((shape, k) => {
          const s = steps[k]!;
          const { y, top } = shape;
          const on = selected === s.n;
          const line = { stroke: on ? 'var(--slate)' : 'var(--text-3)', strokeWidth: on ? 2 : 1, fill: 'none' };
          const marker = `url(#${uid}-${on ? 'selected' : 'plain'})`;
          const textStyle = { fill: shape.shape === 'note' ? 'var(--text-2)' : 'var(--text)', fontWeight: on ? 600 : 400 };
          let drawing: ReactNode;
          let start: { x: number; y: number };
          if (shape.shape === 'arrow') {
            drawing = (
              <>
                <path d={`M${shape.x1},${y} H${shape.x2}`} markerEnd={marker} style={line} />
                <text x={shape.labelX} y={shape.labelY} textAnchor="middle" fontSize={12} style={textStyle}>
                  {shape.label}
                </text>
              </>
            );
            start = { x: shape.x1 + Math.sign(shape.x2 - shape.x1) * 12, y };
          } else if (shape.shape === 'loop') {
            const reach = shape.x2 - shape.x1;
            drawing = (
              <>
                <path d={`M${shape.x1},${y - 8} h${reach} v16 h${-reach}`} markerEnd={marker} style={line} />
                <text x={shape.labelX} y={shape.labelY} textAnchor={shape.anchor} fontSize={12} style={textStyle}>
                  {shape.label}
                </text>
              </>
            );
            start = { x: shape.x1, y: y - 8 };
          } else {
            drawing = (
              <text x={shape.labelX} y={shape.labelY} textAnchor="middle" fontSize={12} style={textStyle}>
                {shape.label}
              </text>
            );
            start = { x: shape.x1 + 8, y: y - 4 };
          }
          const bubble = bubbles?.[s.n];
          return (
            <g key={s.n} data-testid="sequence-step" data-step={s.n} data-shape={shape.shape} {...asButton(s, on)}>
              <title>{s.systemNote ? `${s.label} (${s.systemNote})` : s.label}</title>
              {onSelect && <rect x={0} y={top} width={width} height={ROW_H} rx={6} fill="transparent" className="group-focus-visible:stroke-slate" />}
              {drawing}
              {bubble && (
                <g data-testid="sequence-bubble">
                  <circle cx={start.x} cy={start.y} r={8} style={{ fill: `var(--${bubble.tone})` }} />
                  <text x={start.x} y={start.y + 3.5} textAnchor="middle" fontSize={10} fontWeight={600} style={{ fill: 'var(--canvas)' }}>
                    {bubble.count}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
```

Run: `pnpm vitest run packages/web/src/diagram`
Expected: PASS (`sequenceLayout.test.ts` 4, `SequenceView.test.tsx` 6, and the layout and DiagramView tests as before).
- **If "draws each lane and step where it always has" fails:** the layout's numbers moved. Each must be what the old component computed: lanes 160 wide with 24 between and 16 each side, heads 32 high at y 16, rows of 44 from y 68, an arrow at the row's top + 30 with its label at top + 18, a loop from y − 8 to y + 8 with its label at y + 4, and a note's label at the middle of the width.

- [ ] **Step 5: Lay a chapter's drawing out as board shapes**

`packages/web/src/pages/defense/present/boardLayout.ts`:
```ts
import { parseData, tablesDrawing, type DiagramData, type Drawing, type FlowData, type PresentStep } from '@dev-plumbing/core/schemas';
import { layoutDiagram, type DiagramLayout } from '../../../diagram/layout';
import { sequenceLayout } from '../../../diagram/sequenceLayout';

type Point = { x: number; y: number };

/**
 * One drawable shape on the board, keyed by the ref a presenter's `reveal` and `near` name: what to draw, and where a
 * note's marker goes. A ref can have more than one shape (a lane is its head and its lifeline); they show together.
 * A line's `ends` are the refs it joins, which show with it; a group's `members` are its boxes.
 */
export type BoardShape =
  | { ref: string; kind: 'box'; x: number; y: number; w: number; h: number; label: string; dashed: boolean }
  | {
      ref: string;
      kind: 'line';
      points: Point[];
      /** The label's text sits on labelY (its baseline), anchored at labelX by `anchor` (the middle when not given). */
      label?: string;
      labelX?: number;
      labelY?: number;
      anchor?: 'start' | 'middle' | 'end';
      arrow: boolean;
      dashed: boolean;
      ends: string[];
    }
  | { ref: string; kind: 'group'; x: number; y: number; w: number; h: number; label: string; members: string[] };
/** A chapter's drawing, laid out. `tone` is its ink: slate for the tables, ink for the rest (§16's whiteboard). */
export type Board = { width: number; height: number; shapes: BoardShape[]; tone: 'ink' | 'slate' };

/** The ref prefixes of a drawing drawn as boxes and lines (Decision 4). */
type Prefixes = { box: string; line: string; group: string };
const DIAGRAM: Prefixes = { box: 'node:', line: 'edge:', group: 'group:' };
const TABLES: Prefixes = { box: 'table:', line: 'link:', group: 'group:' };

/** Groups first, then lines, then boxes, so boxes are drawn over the lines that reach them. */
function diagramShapes(data: DiagramData, layout: DiagramLayout, p: Prefixes): BoardShape[] {
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  return [
    ...layout.groups.map((g): BoardShape => ({
      ref: p.group + g.id,
      kind: 'group',
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      label: g.label,
      members: data.nodes.filter((n) => n.group === g.id).map((n) => p.box + n.id),
    })),
    ...layout.edges
      .filter((e) => e.points.length >= 2 && edges.has(e.id))
      .map((e): BoardShape => {
        const source = edges.get(e.id)!;
        return {
          ref: p.line + e.id,
          kind: 'line',
          points: e.points,
          // ELK gives the label's middle; the board wants its baseline.
          ...(e.label ? { label: e.label, labelX: e.labelX, labelY: e.labelY + 3.5 } : {}),
          arrow: true,
          dashed: e.dashed,
          ends: [p.box + source.from, p.box + source.to],
        };
      }),
    ...layout.nodes.map((n): BoardShape => ({ ref: p.box + n.id, kind: 'box', x: n.x, y: n.y, w: n.w, h: n.h, label: n.label, dashed: n.status === 'external' })),
  ];
}

/** A system flow as a sequence: each lane's head and lifeline, then each step's arrow, loop or note. */
function flowShapes(flow: FlowData): Board {
  const layout = sequenceLayout(flow);
  const steps = [...flow.steps].sort((a, b) => a.n - b.n);
  const lanes = new Set(layout.lanes.map((l) => l.id));
  const shapes: BoardShape[] = layout.lanes.flatMap((l): BoardShape[] => [
    { ref: `lane:${l.id}`, kind: 'line', points: [{ x: l.x, y: l.lifeTop }, { x: l.x, y: l.lifeBottom }], arrow: false, dashed: true, ends: [] },
    { ref: `lane:${l.id}`, kind: 'box', x: l.x - l.headW / 2, y: l.headY, w: l.headW, h: l.headH, label: l.label, dashed: l.status === 'external' },
  ]);
  layout.steps.forEach((s, k) => {
    const step = steps[k]!;
    const ends = [...new Set([step.from, step.to])].filter((id): id is string => id !== undefined && lanes.has(id)).map((id) => `lane:${id}`);
    const points: Point[] =
      s.shape === 'arrow'
        ? [{ x: s.x1, y: s.y }, { x: s.x2, y: s.y }]
        : s.shape === 'loop'
          ? [{ x: s.x1, y: s.y - 8 }, { x: s.x2, y: s.y - 8 }, { x: s.x2, y: s.y + 8 }, { x: s.x1, y: s.y + 8 }]
          : [];
    shapes.push({ ref: `step:${s.n}`, kind: 'line', points, label: s.label, labelX: s.labelX, labelY: s.labelY, anchor: s.anchor, arrow: s.shape !== 'note', dashed: false, ends });
  });
  return { width: layout.width, height: layout.height, shapes, tone: 'ink' };
}

/**
 * Lays a chapter's drawing out, from its data as the app has it: a diagram item's or a flows item's `data`, or, for
 * the tables, the `data` of every database item that isn't parked. Diagrams and tables use layoutDiagram (ELK, left to
 * right); flows use sequenceLayout. Null when the data doesn't parse, or no longer draws (a flow that's now only a
 * user flow, or no tables left), so the board shows that there's nothing to draw.
 */
export async function layoutBoard(drawing: NonNullable<Drawing>, data: unknown): Promise<Board | null> {
  if (drawing.kind === 'diagram') {
    const parsed = parseData('diagram', data);
    if (!parsed.ok) return null;
    const layout = await layoutDiagram(parsed.data, 'RIGHT');
    return { width: layout.width, height: layout.height, shapes: diagramShapes(parsed.data, layout, DIAGRAM), tone: 'ink' };
  }
  if (drawing.kind === 'tables') {
    const tables = (Array.isArray(data) ? data : []).flatMap((d) => {
      const parsed = parseData('database', d);
      return parsed.ok ? [parsed.data] : [];
    });
    if (!tables.length) return null;
    const strip = tablesDrawing(tables);
    const layout = await layoutDiagram(strip, 'RIGHT');
    return { width: layout.width, height: layout.height, shapes: diagramShapes(strip, layout, TABLES), tone: 'slate' };
  }
  const parsed = parseData('flows', data);
  if (!parsed.ok || parsed.data.kind === 'user' || !parsed.data.lanes?.length) return null;
  return flowShapes(parsed.data);
}

/**
 * What's on the board after `step` (from 0): every ref the steps so far revealed that the board has (a ref the data
 * no longer has is skipped), each shown line's ends, and every group with a box on show.
 */
export function shownAt(board: Board | null, steps: PresentStep[], step: number): Set<string> {
  const shown = new Set<string>();
  if (!board) return shown;
  const refs = new Set(board.shapes.map((s) => s.ref));
  for (const s of steps.slice(0, step + 1)) for (const ref of s.reveal) if (refs.has(ref)) shown.add(ref);
  for (const s of board.shapes) if (s.kind === 'line' && shown.has(s.ref)) for (const end of s.ends) if (refs.has(end)) shown.add(end);
  for (const s of board.shapes) if (s.kind === 'group' && s.members.some((m) => shown.has(m))) shown.add(s.ref);
  return shown;
}
```

- [ ] **Step 6: Draw a shape by hand, the same way every time**

`packages/web/src/pages/defense/present/rough.ts`:
```ts
import rough from 'roughjs';
import type { Drawable } from 'roughjs/bin/core';
import type { RoughGenerator } from 'roughjs/bin/generator';
import type { BoardShape } from './boardLayout';

/** One stroke of a hand-drawn shape, for an SVG path. */
export type RoughPath = { d: string; stroke: string; strokeWidth: number };
type Box = { x: number; y: number; w: number; h: number };

/** A marker's wobble: enough to look drawn by hand, not so much that a line misses its box. */
const LOOK = { roughness: 1, bowing: 0.8 };
const WIDTH: Record<BoardShape['kind'], number> = { box: 1.5, line: 1.3, group: 1 };
/** An arrowhead's two strokes: how long, and how far each leans from the line. */
const HEAD = 9;
const SPREAD = Math.PI / 7;

/** A stable seed for a ref (FNV-1a), from 1 to 2^31 - 1, so a part looks the same every time it's drawn. */
export function seedOf(ref: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < ref.length; i++) {
    h ^= ref.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 0x7fffffff) + 1;
}

/** A generator seeded for one ref: Rough.js draws from its own random numbers, so the same seed gives the same lines. */
const generatorFor = (ref: string, stroke: string, strokeWidth: number) => rough.generator({ options: { ...LOOK, seed: seedOf(ref), stroke, strokeWidth } });

const pathsOf = (gen: RoughGenerator, drawable: Drawable): RoughPath[] =>
  gen.toPaths(drawable).map((p) => ({ d: p.d, stroke: p.stroke, strokeWidth: p.strokeWidth }));

/** The two short strokes of an arrowhead at a line's end, along its last segment that has a length. */
function arrowhead(points: { x: number; y: number }[]): [number, number, number, number][] {
  const end = points[points.length - 1]!;
  let from = points[points.length - 2]!;
  for (let i = points.length - 2; i >= 0 && from.x === end.x && from.y === end.y; i--) from = points[i]!;
  const angle = Math.atan2(end.y - from.y, end.x - from.x);
  return [angle - SPREAD, angle + SPREAD].map((a) => [end.x, end.y, end.x - HEAD * Math.cos(a), end.y - HEAD * Math.sin(a)]);
}

/**
 * A board shape drawn by hand, as SVG paths in `stroke`: a box is a rectangle, a group a rectangle (the board dashes
 * it), a line a path through its points with a small arrowhead of two strokes. A line with no points (a flow's note)
 * has no strokes, only its label. Seeded from the ref, so it's the same every time and in tests.
 */
export function roughShape(shape: BoardShape, stroke: string): RoughPath[] {
  const gen = generatorFor(shape.ref, stroke, WIDTH[shape.kind]);
  if (shape.kind !== 'line') return pathsOf(gen, gen.rectangle(shape.x, shape.y, shape.w, shape.h));
  if (shape.points.length < 2) return [];
  const line = pathsOf(gen, gen.linearPath(shape.points.map((p) => [p.x, p.y])));
  if (!shape.arrow) return line;
  return [...line, ...arrowhead(shape.points).flatMap(([x1, y1, x2, y2]) => pathsOf(gen, gen.line(x1, y1, x2, y2)))];
}

/** A note's marker: a loose ellipse drawn around a part, in the note's ink, seeded from the note's own key. */
export function roughMarker(around: Box, key: string, stroke: string): RoughPath[] {
  const gen = generatorFor(key, stroke, 1.6);
  return pathsOf(gen, gen.ellipse(around.x + around.w / 2, around.y + around.h / 2, around.w + 28, around.h + 22));
}
```

`toPaths` keeps the stroke it was given, so `var(--text)` and the other tokens reach the SVG as they are, and dark mode needs nothing extra. Rough.js keeps its random numbers on the options object, so the generator made for one ref draws the same lines for the same seed, in tests too.

- [ ] **Step 7: Draw the board**

`packages/web/src/pages/defense/present/Board.tsx`:
```tsx
import type { NoteInk, PresentStep } from '@dev-plumbing/core/schemas';
import { motion } from 'motion/react';
import { useId, useMemo, type CSSProperties } from 'react';
import { shownAt, type Board, type BoardShape } from './boardLayout';
import { roughMarker, roughShape, type RoughPath } from './rough';

/** A note as the board places it: with the step (from 0) that writes it. */
export type BoardNote = PresentStep['notes'][number] & { step: number };

/**
 * §16's whiteboard inks: ink for structure, slate for data, seal for warnings, moss for "this is safe". Through the
 * theme's variables, so dark mode needs nothing extra.
 */
export const INK: Record<NoteInk, string> = { ink: 'var(--text)', slate: 'var(--slate)', seal: 'var(--seal)', moss: 'var(--moss)' };
const TONE: Record<Board['tone'], string> = { ink: 'var(--text)', slate: 'var(--slate)' };

/**
 * Seconds a part takes to draw, and between one new part and the next (Decision 7). A step that brings many parts
 * draws them closer together, so the last one starts within about 2.4 s.
 */
const DRAW = 0.6;
const STAGGER = 0.15;
const STAGGER_ALL = 2.4;
/** Room around what a chapter shows, and the smallest frame, in SVG units. */
const MARGIN = 28;
const MIN_W = 560;
const MIN_H = 220;
/** A note's text: 12.5 px, wrapped at about 34 characters a line. */
const NOTE_SIZE = 12.5;
const NOTE_LINE = 16;
const NOTE_CHARS = 34;
const CHAR_W = 6.8;
const DASH = '6 5';

type Box = { x: number; y: number; w: number; h: number };
/** A note on the board: the part it rings (`mark`), and where its text's box starts (`at`), below its first line. */
export type PlacedNote = { note: BoardNote; key: string; mark: Box; lines: string[]; at: Box };
/** A chapter's board, worked out once for all its steps, so nothing on it moves from one step to the next. */
export type ChapterBoard = {
  /** The notes written beside a part, each where it stays from its own step to the chapter's last. */
  placed: PlacedNote[];
  /** The notes for the list at the board's foot: `near` is "", or names nothing on show at the note's step. */
  listed: BoardNote[];
  /** The viewBox at every step: what the chapter shows by its last step, its rings and its notes, with a margin. */
  frame: Box | null;
};

/** Cuts a label to `chars`, keeping its start. */
const fit = (text: string, chars: number) => (text.length <= chars ? text : `${text.slice(0, Math.max(1, chars - 1))}…`);
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
/** The marker's ellipse round a part, as a box. */
const ringOf = (mark: Box): Box => ({ x: mark.x - 14, y: mark.y - 11, w: mark.w + 28, h: mark.h + 22 });
/** The smallest box round all of `boxes`. */
function union(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Breaks a note into lines of about NOTE_CHARS characters, at spaces. */
function wrap(text: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > NOTE_CHARS) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return line ? [...lines, line] : lines;
}

/** A group's label as the board writes it (Label below), cut to the group's width. */
const groupLabel = (g: Extract<BoardShape, { kind: 'group' }>) => fit(g.label, Math.floor((g.w - 24) / 6.4));
/** Where a group's label sits, so a note doesn't cover it. */
const groupLabelBox = (g: Extract<BoardShape, { kind: 'group' }>): Box => ({ x: g.x + 12, y: g.y + 4, w: groupLabel(g).length * 6.4, h: 16 });

/** What a note's marker goes round: a box or a group, a line's label, or the middle of a line without one. */
function markOf(s: BoardShape): Box {
  if (s.kind !== 'line') return { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.label && s.labelX !== undefined && s.labelY !== undefined) {
    const w = s.label.length * 6 + 8;
    const x = s.anchor === 'start' ? s.labelX : s.anchor === 'end' ? s.labelX - w : s.labelX - w / 2;
    return { x, y: s.labelY - 12, w, h: 16 };
  }
  const i = Math.max(0, Math.floor((s.points.length - 2) / 2));
  const a = s.points[i] ?? { x: 0, y: 0 };
  const b = s.points[i + 1] ?? a;
  return { x: (a.x + b.x) / 2 - 20, y: (a.y + b.y) / 2 - 10, w: 40, h: 20 };
}

/** Where a shape is on the board: a box's or a group's rectangle; a line's points and its label. Null for nothing. */
function boundsOf(s: BoardShape): Box | null {
  if (s.kind !== 'line') return { x: s.x, y: s.y, w: s.w, h: s.h };
  const boxes: Box[] = s.points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 }));
  if (s.label && s.labelX !== undefined && s.labelY !== undefined) boxes.push(markOf(s));
  return boxes.length ? union(boxes) : null;
}

/** The shape a note near `ref` rings: its box when it has several shapes (a lane's head, not its lifeline), else its one. */
function shapeFor(board: Board, ref: string): BoardShape | undefined {
  const all = board.shapes.filter((s) => s.ref === ref);
  return all.find((s) => s.kind === 'box') ?? all[0];
}

/**
 * A chapter's board, once for all its steps:
 * - the notes are placed step by step. A note whose `near` is on show at its step rings it, and its text goes below
 *   the ring, or else to its right, above it, to its left or at one of its corners: the first of those that covers
 *   nothing taken, or, when each covers something, the one that covers least. Taken is
 *   what's on the board at that step and everything later steps bring (boxes, line labels and group labels), so a
 *   part that comes later doesn't land on it, and the rings and notes placed before it. Then it stays there for the
 *   rest of the chapter. The other notes (`near` is "", or names nothing on show at their step) go in the list at
 *   the board's foot;
 * - the frame is everything the chapter shows by its last step, with every ring and note it places and a margin, at
 *   least MIN_W by MIN_H, centred. It's the same at every step, so the drawing never moves or changes size, and a
 *   chapter that shows a few parts of a big drawing draws them large. With nothing shown, it frames the whole board.
 */
export function chapterBoard(board: Board | null, steps: PresentStep[]): ChapterBoard {
  const placed: PlacedNote[] = [];
  const listed: BoardNote[] = [];
  const last = shownAt(board, steps, steps.length - 1);
  const taken: Box[] = (board?.shapes ?? []).filter((s) => last.has(s.ref)).map((s) => (s.kind === 'group' ? groupLabelBox(s) : markOf(s)));
  steps.forEach((step, k) => {
    const shown = shownAt(board, steps, k);
    step.notes.forEach((n, i) => {
      const note: BoardNote = { ...n, step: k };
      const shape = board && n.near && shown.has(n.near) ? shapeFor(board, n.near) : undefined;
      if (!shape) {
        listed.push(note);
        return;
      }
      const mark = markOf(shape);
      const ring = ringOf(mark);
      const lines = wrap(n.text);
      const w = Math.max(...lines.map((l) => l.length)) * CHAR_W;
      const h = lines.length * NOTE_LINE;
      const cx = mark.x + mark.w / 2;
      const cy = mark.y + mark.h / 2;
      // Below, right, above, left, then the four corners.
      const spots: Box[] = [
        { x: cx - w / 2, y: ring.y + ring.h + 4, w, h },
        { x: ring.x + ring.w + 6, y: cy - h / 2, w, h },
        { x: cx - w / 2, y: ring.y - 4 - h, w, h },
        { x: ring.x - 6 - w, y: cy - h / 2, w, h },
        { x: ring.x + ring.w - 10, y: ring.y + ring.h + 4, w, h },
        { x: ring.x + ring.w - 10, y: ring.y - 4 - h, w, h },
        { x: ring.x + 10 - w, y: ring.y + ring.h + 4, w, h },
        { x: ring.x + 10 - w, y: ring.y - 4 - h, w, h },
      ];
      const covered = (spot: Box) => taken.reduce((sum, t) => sum + overlapArea(spot, t), 0);
      const at = spots.find((spot) => !taken.some((t) => overlaps(spot, t))) ?? spots.reduce((a, b) => (covered(b) < covered(a) ? b : a));
      taken.push(ring, at);
      placed.push({ note, key: `${k}.${i}`, mark, lines, at });
    });
  });
  if (!board) return { placed, listed, frame: null };
  const boxes = [...board.shapes.filter((s) => last.has(s.ref)).flatMap((s) => boundsOf(s) ?? []), ...placed.flatMap((p) => [ringOf(p.mark), p.at])];
  const u = boxes.length ? union(boxes) : { x: 0, y: 0, w: board.width, h: board.height };
  const w = u.w + MARGIN * 2;
  const h = u.h + MARGIN * 2;
  const W = Math.max(w, MIN_W);
  const H = Math.max(h, MIN_H);
  return { placed, listed, frame: { x: u.x - MARGIN - (W - w) / 2, y: u.y - MARGIN - (H - h) / 2, w: W, h: H } };
}

const strokeStyle = (p: RoughPath, dashed: boolean): CSSProperties => ({
  fill: 'none',
  stroke: p.stroke,
  strokeWidth: p.strokeWidth,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeDasharray: dashed ? DASH : undefined,
});

/** Hand-drawn strokes: drawn along their length when new (a dashed one fades in, since Motion draws with the dashes). */
function Strokes({ paths, dashed, drawn, delay }: { paths: RoughPath[]; dashed: boolean; drawn: boolean; delay: number }) {
  return paths.map((p, k) =>
    drawn ? (
      <motion.path
        key={k}
        d={p.d}
        style={strokeStyle(p, dashed)}
        initial={dashed ? { opacity: 0 } : { pathLength: 0 }}
        animate={dashed ? { opacity: 1 } : { pathLength: 1 }}
        transition={{ duration: DRAW, delay, ease: 'easeInOut' }}
      />
    ) : (
      <path key={k} d={p.d} style={strokeStyle(p, dashed)} />
    ),
  );
}

/** A label in the system font, haloed in the canvas colour so it reads over lines and the dot grid. */
function Label({ shape, color, drawn, delay }: { shape: BoardShape; color: string; drawn: boolean; delay: number }) {
  let at: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; size: number; weight: number; text: string } | null = null;
  if (shape.kind === 'box') at = { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 + 4.5, anchor: 'middle', size: 13, weight: 500, text: fit(shape.label, Math.floor((shape.w - 16) / 7)) };
  else if (shape.kind === 'group') at = { x: shape.x + 12, y: shape.y + 18, anchor: 'start', size: 11.5, weight: 600, text: groupLabel(shape) };
  else if (shape.label && shape.labelX !== undefined && shape.labelY !== undefined) at = { x: shape.labelX, y: shape.labelY, anchor: shape.anchor ?? 'middle', size: 11.5, weight: 400, text: shape.label };
  if (!at) return null;
  const props = {
    x: at.x,
    y: at.y,
    textAnchor: at.anchor,
    style: { fill: color, fontSize: at.size, fontWeight: at.weight, paintOrder: 'stroke', stroke: 'var(--canvas)', strokeWidth: 3, strokeLinejoin: 'round' } as CSSProperties,
  };
  return drawn ? (
    <motion.text {...props} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay }}>
      {at.text}
    </motion.text>
  ) : (
    <text {...props}>{at.text}</text>
  );
}

function ShapeView({ shape, color, drawn, delay }: { shape: BoardShape; color: string; drawn: boolean; delay: number }) {
  const dashed = shape.kind === 'group' || shape.dashed;
  return (
    <g data-testid="board-shape" data-ref={shape.ref} data-kind={shape.kind}>
      {/* A box is the canvas inside, so the lines and dots under it don't show through. */}
      {shape.kind === 'box' && <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={6} style={{ fill: 'var(--canvas)' }} />}
      <Strokes paths={roughShape(shape, color)} dashed={dashed} drawn={drawn} delay={delay} />
      <Label shape={shape} color={color} drawn={drawn} delay={delay + DRAW * 0.6} />
    </g>
  );
}

function NoteView({ placed, drawn, delay }: { placed: PlacedNote; drawn: boolean; delay: number }) {
  const { note, mark, lines, at } = placed;
  const ink = INK[note.ink];
  const text = (
    <>
      {/* Each line but the last keeps its space, so the note reads as one sentence to a screen reader. */}
      {lines.map((line, j) => (
        <tspan key={j} x={at.x} dy={j ? NOTE_LINE : 0}>
          {j < lines.length - 1 ? `${line} ` : line}
        </tspan>
      ))}
    </>
  );
  const textProps = {
    x: at.x,
    y: at.y + NOTE_SIZE - 1,
    style: { fill: ink, fontSize: NOTE_SIZE, fontWeight: 500, paintOrder: 'stroke', stroke: 'var(--canvas)', strokeWidth: 3, strokeLinejoin: 'round' } as CSSProperties,
  };
  return (
    <g data-testid="board-note" data-near={note.near} data-ink={note.ink}>
      <Strokes paths={roughMarker(mark, `note:${placed.key}:${note.near}`, ink)} dashed={false} drawn={drawn} delay={delay} />
      {drawn ? (
        <motion.text {...textProps} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: delay + DRAW / 2 }}>
          {text}
        </motion.text>
      ) : (
        <text {...textProps}>{text}</text>
      )}
    </g>
  );
}

/**
 * The whiteboard: the canvas with a faint dot grid, the chapter's drawing as far as `step` goes, drawn by hand in ink
 * (slate for the tables), and the notes so far in their own inks. When `animate`, the parts this step adds draw
 * themselves one after another and this step's notes fade in; otherwise everything is there at once. A new
 * `replayKey` draws them again. The notes and the frame are worked out once for the chapter (chapterBoard), so moving
 * between steps adds to the board and never moves what's on it. With `fill` (full screen) the board takes the height
 * it's given; in the page it's as tall as the chapter's frame is for its width (aspect-ratio), within 220 px and the
 * window's height less 220, so a wide drawing isn't a thin band in a tall box, and the board's height changes only
 * between chapters. The frame fits inside either way. With no board (a chapter that draws nothing, or a drawing
 * that's gone), the notes are a list, under `message` when there is one. The list holds a place for the chapter's
 * later foot notes, so the drawing above it keeps its size.
 */
export function BoardView({
  board,
  steps,
  step,
  animate,
  replayKey,
  message = null,
  fill = false,
}: {
  board: Board | null;
  /** The chapter's steps. */
  steps: PresentStep[];
  /** The step on show, from 0: its parts and notes are the new ones. */
  step: number;
  animate: boolean;
  replayKey: number;
  message?: string | null;
  /** Full screen: the board takes the height it's given. */
  fill?: boolean;
}) {
  const grid = `dp-grid-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const { placed, listed, frame } = useMemo(() => chapterBoard(board, steps), [board, steps]);
  const color = TONE[board?.tone ?? 'ink'];
  const shown = shownAt(board, steps, step);
  const before = step > 0 ? shownAt(board, steps, step - 1) : new Set<string>();
  // The parts this step adds draw in the board's order, one after another; its notes come once they're done.
  const order = [...new Set((board?.shapes ?? []).filter((s) => shown.has(s.ref) && !before.has(s.ref)).map((s) => s.ref))];
  const stagger = Math.min(STAGGER, STAGGER_ALL / order.length);
  const delayOf = (ref: string) => Math.max(0, order.indexOf(ref)) * stagger;
  const notesAt = order.length * stagger + DRAW / 2;
  // In the page, the chapter's frame sets the board's shape: as wide as the column, as tall as that makes it, between
  // 220 px and the window less 220 (so the caption and the buttons fit under it once Present is in view).
  const size: CSSProperties | undefined = fill
    ? undefined
    : { ...(frame ? { aspectRatio: `${frame.w} / ${frame.h}` } : {}), minHeight: 220, maxHeight: 'calc(100dvh - 220px)' };

  return (
    <figure
      data-testid="board"
      data-animate={animate ? 'true' : 'false'}
      className={`relative m-0 flex flex-col overflow-hidden rounded-[12px] border-[0.5px] border-separator bg-canvas ${fill ? 'h-full' : 'w-full'}`}
      style={size}
    >
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <pattern id={grid} data-testid="board-grid" width={20} height={20} patternUnits="userSpaceOnUse">
            <circle cx={10} cy={10} r={1.1} style={{ fill: 'var(--separator)' }} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${grid})`} />
      </svg>
      {message && <p className="relative px-4 pt-4 text-[13px] text-ink-3">{message}</p>}
      {board && frame && (
        // The default xMidYMid meet fits the frame inside whatever room the board has.
        <svg
          viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
          width="100%"
          className="relative block min-h-0 flex-1"
          style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
        >
          {board.shapes.map((s, i) =>
            shown.has(s.ref) ? <ShapeView key={`${replayKey}:${s.ref}:${i}`} shape={s} color={color} drawn={animate && !before.has(s.ref)} delay={delayOf(s.ref)} /> : null,
          )}
          {placed
            .filter((p) => p.note.step <= step)
            .map((p) => (
              <NoteView key={`${replayKey}:${p.key}`} placed={p} drawn={animate && p.note.step === step} delay={notesAt} />
            ))}
        </svg>
      )}
      {listed.length > 0 && (
        <ul className={`relative flex shrink-0 flex-col gap-1.5 overflow-y-auto px-5 pb-4 pt-4 text-[14px] leading-snug ${board ? 'max-h-[45%]' : ''}`}>
          {listed.map((n, i) =>
            n.step > step ? (
              // A later step's note, kept out of sight: its room is held, so the drawing doesn't shrink when it comes.
              <li key={`${replayKey}:${i}`} aria-hidden="true" className="break-words font-medium" style={{ visibility: 'hidden' }}>
                {n.text}
              </li>
            ) : (
              <motion.li
                key={`${replayKey}:${i}`}
                data-testid="board-note"
                data-near={n.near}
                data-ink={n.ink}
                className="break-words font-medium"
                style={{ color: INK[n.ink] }}
                initial={animate && n.step === step ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: notesAt }}
              >
                {n.text}
              </motion.li>
            ),
          )}
        </ul>
      )}
    </figure>
  );
}
```

- [ ] **Step 8: Run the board's tests**

Run:
```bash
pnpm vitest run packages/web/src/pages/defense/present packages/web/src/theme
pnpm --filter @dev-plumbing/web typecheck
```
Expected: PASS (`boardLayout.test.ts` 6, `rough.test.ts` 5, `Board.test.tsx` 13; `palette.test.ts` finds no palette class or gradient in the new files).
- **If `Board.test.tsx` finds no `pathLength` on a fresh shape:** the fresh parts must be `motion.path` (Motion sets `pathLength="1"` and animates the dashes). With `MotionGlobalConfig.skipAnimations` they end at once, but they're still Motion's paths.
- **If a test sees a different `d` each run:** the seed didn't reach the generator. Each ref gets its own `rough.generator({ options: { seed } })`; with seed 0, Rough.js uses `Math.random`.

- [ ] **Step 9: Run everything**

Run:
```bash
pnpm vitest run packages/web
pnpm typecheck
pnpm test
pnpm test:e2e flows
pnpm test:e2e
```
Expected: PASS. `pnpm test` runs 959 tests in 104 files: Tasks 1 and 2's 930, plus this task's 29 (`sequenceLayout` 4, `SequenceView` 1 more, `boardLayout` 6, `rough` 5 and `Board` 13). Nothing uses the board yet (Task 4 does), so the app looks the same; `flows.spec.ts` shows the flows screen draws as before.
- **If `flows.spec.ts`'s "storyboards stack and sequences fit the width" fails:** it failed about one run in four before this task too, on a loaded machine (it measures the storyboard's cards while their mockups load), and it doesn't draw a sequence step's position. Run it again on its own before suspecting the layout; "draws each lane and step where it always has" is the check that the sequence didn't move.

- [ ] **Step 10: Commit**

```bash
git add pnpm-workspace.yaml packages/web/package.json pnpm-lock.yaml packages/web/src/diagram/sequenceLayout.ts packages/web/src/diagram/sequenceLayout.test.ts packages/web/src/diagram/SequenceView.tsx packages/web/src/diagram/SequenceView.test.tsx packages/web/src/pages/defense/present
git commit -m "feat(web): draw a project's drawings as a hand-drawn whiteboard, a step at a time" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Present in the Whiteboard Defense page

Present becomes the page's third mode, beside Study and Practice. It shows the chapter's board as wide as the page allows, the step's caption to say out loud, ◀ ▶, Replay and Full screen, and the chapters beside the board (a menu above it on narrower screens). The arrow keys step through the whole defense, and moving on draws the new parts while going back shows them at once. Full screen covers the window and, where the browser can, the screen. Present is its own lazily loaded chunk, so Rough.js and Motion stay out of the main bundle. A defense saved before Plan 7 says it has nothing to present.

**Files:**
- Create:
  - `packages/web/src/pages/defense/present/PresentView.tsx`
  - `packages/web/src/pages/defense/present/PresentView.test.tsx`
  - `packages/web/e2e/present.spec.ts`
- Modify:
  - `packages/web/src/pages/defense/DefensePage.tsx` (the `present` mode, `PresentPlace` kept by the page, the lazy `PresentView` inside `PresentBoundary`, Regenerate as the main action for an old defense in Present, and a wider frame in Present)
  - `packages/web/src/router.tsx` (`?mode=present`)
  - `packages/web/src/pages/defense/testkit.ts` (a `presenter()` builder)
  - `packages/web/src/pages/defense/DefensePage.test.tsx` (two new tests)
- Test:
  - `packages/web/src/pages/defense/present/PresentView.test.tsx`
  - `packages/web/src/pages/defense/DefensePage.test.tsx`
  - `packages/web/e2e/present.spec.ts`

**Interfaces:**
- Consumes:
  - Task 3: `BoardView({ board, steps, step, animate, replayKey, message?, fill? })`, `layoutBoard` and `Board`. With `fill` the board takes the height it's given; without it, its chapter's shape.
  - Task 1: `Presenter` and `WhiteboardDefense['presenter']` (optional: a defense saved before Plan 7 has none), from `@dev-plumbing/core/schemas`; `saveDefense` refuses a presenter whose refs aren't in its drawing, and e2e's `defenseInput()` carries a presenter of seven `drawing: null` chapters.
  - Plan 6: `DefenseBody`, `DefenseViewProps`, Practice's page-owned place, `Segmented`, `buttonClass`, `inputClass`, the testkit (`defense`, `view`) and the e2e helpers `importProject`, `defenseInput`, `writeDefense` and `noSideScroll`.
  - The app's queries, shared by key: `['thread', repo, project, 't-<item id>']` (`api.thread`), `['projectHome', repo, project]` (`api.projectHome`) and `['typeItems', repo, project, typeId]` (`api.typeItems`, through `useQueries`, one per database type).
- Produces:
  - `DefenseMode = 'study' | 'practice' | 'present'`; `PresentPlace = { chapter: number; step: number }` (both from 0); `PresentViewProps = DefenseViewProps & { place: PresentPlace; onPlace: (place: PresentPlace) => void }` (`DefensePage.tsx`).
  - `PresentView(props: PresentViewProps)` (`pages/defense/present/PresentView.tsx`), loaded with `lazy(() => import('./present/PresentView').then((m) => ({ default: m.PresentView })))`: the named export, as the rest of the app has, mapped to `lazy`'s default. It's inside `PresentBoundary` (`DefensePage.tsx`), an error boundary that says "Present couldn't load. Reload the page." when the chunk doesn't come.
  - `useInertOutside(ref, on)` (`PresentView.tsx`): while `on`, every sibling of the element and of each of its ancestors, up to `<body>`, is `inert`.
  - `presenter(over?)` in `pages/defense/testkit.ts`.
  - Test ids: `present`, `present-chapters`, `present-step`, `present-caption`, `present-prev`, `present-next`, `present-replay`, `present-fullscreen`, `present-overlay`, `present-landscape-hint`, `present-old`; and Task 3's `board`, `board-shape`, `board-note`.
- **Behaviour** (Decision 8):
  - **The tab:** Study · Practice · Present, through `?mode=present`. Present widens the page's frame to 1,180 px; Study and Practice keep `80ch`.
  - **The chapter:** its number and title as a heading, then the board, then `Step ${i} of ${n}` and the caption, then ◀ ("Previous step"), ▶ ("Next step"), Replay and Full screen, all secondary: nothing in Present is primary. ◀ ▶ are 44 px square on a phone (`max-md:h-11 max-md:w-11`).
  - **Nothing moves between steps:** in the page the board takes its chapter's shape (Task 3: as tall as the frame is for the column's width, 220 px to the window less 220) and the caption holds two lines, so the step line, the caption and the buttons stay where they are from step to step, and move only when the chapter changes. The board frames what the chapter shows, once for the chapter (Task 3).
  - **In view:** opening Present (the tab, or `?mode=present`) scrolls its top, the chapter's heading row, into view once, so the board, the caption and ◀ ▶ are on screen together at 1280 x 800. Stepping and changing chapters don't scroll.
  - **The chapters:** "Chapters", as a list of buttons beside the board from 1,100 px (`aria-current="step"` on this one), and as a `<select>` above the board below that. Either goes to that chapter's first step.
  - **Stepping:** ▶ and → go to the next step, and from a chapter's last step to the next chapter's first. ◀ and ← go back, and from a first step to the chapter before's last. At the very ends they wait (`aria-disabled`, so a focused one keeps the focus). Home and End go to the chapter's first and last step. Replay goes to the chapter's first step and draws it again.
  - **What draws:** onwards (▶, →, a chapter, Replay) the step's new parts draw themselves; back (◀, ←, Home, End) the step shows at once; with `prefers-reduced-motion` (Motion's `useReducedMotion()`) everything shows at once. Opening Present at a step past the first (coming back from Study) shows it at once too.
  - **The board's data:** a diagram or a flow is its item's (`api.thread(repo, project, 't-' + itemId)`, whose type's screen must be `diagram` or `flows`); the tables are every database item that isn't parked and has data, of every type of the project home whose screen is `database` (the home lists enabled types only), in item-id order: the items core's `drawnItems` draws. "Drawing…" while it loads and lays out. "Nothing to draw in this chapter." when the item is gone, its data no longer draws, or there are no tables, with the step's notes listed under it. A chapter with `drawing: null` has no message: its notes are the board.
  - **Keys** (Practice's rules): ← → Home End, and Esc in full screen; none of them while typing in an input, textarea, select or editable field, or with Cmd, Ctrl or Alt. Space and Enter are never taken, so a focused button keeps them.
  - **Full screen:** the same chapter, board and controls in a fixed overlay over the whole window (`role="dialog"`), the board taking the height that's left. Where the browser has the Fullscreen API it enters browser full screen too. The Full screen button gives way to ✕ ("Leave full screen"), which takes the focus. Esc or ✕ leaves both, and the focus goes back to Full screen. When the browser leaves its own full screen (its own Esc), the overlay goes too; a browser full screen that arrives after the overlay has gone is left at once; leaving the page leaves it. The page under the overlay doesn't scroll, and everything outside the overlay is `inert` while it's up (`useInertOutside`), so the focus stays in it: Tab from its last control comes back to ✕, and Shift+Tab from ✕ goes to the last.
  - **Full screen on a short screen** (under 500 px tall, a phone held sideways): no `pt-14`; one top row with the chapters `<select>`, `n. title` and ✕; the board fills what's left; one bottom row with `Step n of n`, the caption (`line-clamp-2`), ◀ ▶ and Replay. Nothing needs scrolling.
  - **A phone held upright:** "Turn your phone sideways, then press Full screen." under the heading (`max-md:portrait:block`). The board fits the width and pinch-zooms (Task 3).
  - **The place** is the page's, keyed by defense id, as Practice's is: Study and back keeps the chapter and step; a regenerated defense starts at chapter 1, step 1.
  - **An old defense** (no presenter, or one with no chapters): "This defense was written before Present. Regenerate it to present it." in place of the board, and Regenerate becomes the page's one main action while Present is open. `PresentView` and `DefensePage` both check `!presenter?.chapters.length`.
  - **Present's code doesn't load:** "Present couldn't load. Reload the page." in its place (`PresentBoundary`), and the rest of the page stays.

- [ ] **Step 1: Write the failing tests**

In `packages/web/src/pages/defense/testkit.ts`, replace:
```ts
import type { DefenseLink, PracticeView, WhiteboardDefense, WhiteboardView } from '@dev-plumbing/core/schemas';
```
with:
```ts
import type { DefenseLink, PracticeView, Presenter, WhiteboardDefense, WhiteboardView } from '@dev-plumbing/core/schemas';
```
and add, before `/** Practice before anything is rated or ticked, overridden as needed. */`:
```ts
type PresentChapter = Presenter['chapters'][number];
const chapter = (id: PresentChapter['id'], title: string, drawing: PresentChapter['drawing'], steps: PresentChapter['steps']): PresentChapter => ({ id, title, drawing, steps });
const say = (caption: string, reveal: string[] = [], notes: PresentChapter['steps'][number]['notes'] = []) => ({ caption, reveal, notes });

/**
 * A presenter for defense(), its chapters overridden as needed. Purpose draws nothing and has a note for the whole
 * board; System flow draws the architecture-system diagram in three steps, the second adding a line and a seal note
 * near its end; Data and source of truth draws the tables; the rest draw nothing, one step each.
 */
export function presenter(over: Partial<Record<PresentChapter['id'], Partial<PresentChapter>>> = {}): Presenter {
  const chapters = [
    chapter('purpose', 'Purpose', null, [say('A daily job reminds customers before an item runs out.', [], [{ near: '', text: 'One job, one table.', ink: 'ink' }])]),
    chapter('flow', 'System flow', { kind: 'diagram', itemId: 'architecture-system' }, [
      say('The job runs every morning.', ['node:job']),
      say('It sends each reminder by SMS.', ['edge:sends'], [{ near: 'node:sms', text: 'Runs twice? One a day per subscription.', ink: 'seal' }]),
      say("That's the whole flow."),
    ]),
    chapter('data', 'Data and source of truth', { kind: 'tables' }, [say('Each reminder sent is a row.', ['table:RestockReminder'])]),
    chapter('states', 'States', null, [say("A reminder is due, then sent. This plan doesn't add other states.")]),
    chapter('security', 'Security', null, [say('Only the job sends reminders.')]),
    chapter('failure', 'Failure and retries', null, [say('A failed send is retried once, the next morning.', [], [{ near: '', text: 'No retry storm.', ink: 'moss' }])]),
    chapter('rollback', 'Rollback and blast radius', null, [say('Turn the job off; nothing else depends on it.')]),
  ];
  return { chapters: chapters.map((c) => ({ ...c, ...over[c.id] })) };
}
```

In `packages/web/src/pages/defense/DefensePage.test.tsx`, replace:
```tsx
import { DefenseBody, type DefenseMode } from './DefensePage';
```
with:
```tsx
import { DefenseBody, PresentBoundary, type DefenseMode } from './DefensePage';
```
and add before `it('starts Study with the contents, all 13 parts in order', …)`:
```tsx
  it("says Present couldn't load when its code doesn't come, in place of the router's error page", () => {
    // React reports the error it caught; the test doesn't need to see it.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Gone = () => {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/PresentView-old.js');
    };
    render(
      <PresentBoundary>
        <Gone />
      </PresentBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toBe("Present couldn't load. Reload the page.");
  });

  it('offers Present as the third mode, through the address', async () => {
    show(view());
    const tabs = await screen.findByRole('tablist', { name: 'Whiteboard Defense mode' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Study', 'Practice', 'Present']);
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Present' }));
    expect(navigate).toHaveBeenCalledWith({ to: '/p/$repo/$project/defense', params: { repo: 'acme-app', project: 'restock' }, search: { mode: 'present' } });
    cleanup();
    show(view(), 'present');
    expect((await screen.findByRole('tab', { name: 'Present' })).getAttribute('aria-selected')).toBe('true');
    // Present is loaded when it's first opened.
    expect(await screen.findByTestId('present-old')).toBeTruthy();
  });
```

`packages/web/src/pages/defense/present/PresentView.test.tsx` (with `layoutBoard` mocked to a small board, and `useReducedMotion` set by the test):
```tsx
import type { ProjectHome, ThreadDetail, TypeItemRow, WhiteboardView } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../../api/client';
import { row } from '../../visual/testkit';
import { DefenseBody, type DefenseMode } from '../DefensePage';
import { defense, presenter, view } from '../testkit';
import { layoutBoard, type Board } from './boardLayout';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../../visual/testkit')).routerMock(navigate));
// A small board stands in for ELK's layout; shownAt is the real one.
vi.mock('./boardLayout', async (importOriginal) => ({ ...(await importOriginal<typeof import('./boardLayout')>()), layoutBoard: vi.fn() }));
// Whether you've asked for reduced motion, as Motion reads it.
const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('motion/react', async (importOriginal) => ({ ...(await importOriginal<typeof import('motion/react')>()), useReducedMotion: () => reduced.value }));

const SMALL: Board = {
  width: 480,
  height: 120,
  tone: 'ink',
  shapes: [
    { ref: 'edge:sends', kind: 'line', points: [{ x: 160, y: 60 }, { x: 300, y: 60 }], arrow: true, dashed: false, ends: ['node:job', 'node:sms'] },
    { ref: 'node:job', kind: 'box', x: 10, y: 40, w: 150, h: 36, label: 'Reminder job', dashed: false },
    { ref: 'node:sms', kind: 'box', x: 300, y: 40, w: 150, h: 36, label: 'SMS provider', dashed: true },
  ],
};
const DETAIL = { item: { id: 'architecture-system', title: 'System view', data: { kind: 'system' } }, type: { id: 'architecture', title: 'Architecture', screen: 'diagram' } } as unknown as ThreadDetail;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  vi.mocked(layoutBoard).mockResolvedValue(SMALL);
  reduced.value = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(layoutBoard).mockReset();
});

/** The page in Present, so the place is kept the way it is in the app: by the page. */
function show(v: WhiteboardView = view({ defense: defense({ presenter: presenter() }) }), mode: DefenseMode = 'present') {
  vi.spyOn(api, 'whiteboard').mockResolvedValue(v);
  const thread = vi.spyOn(api, 'thread').mockResolvedValue(DETAIL);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = (m: DefenseMode) => (
    <QueryClientProvider client={client}>
      <DefenseBody repo="acme-app" project="restock" mode={m} />
    </QueryClientProvider>
  );
  const { rerender } = render(page(mode));
  return { thread, switchTo: (m: DefenseMode) => rerender(page(m)) };
}

const caption = () => screen.getByTestId('present-caption').textContent;
const stepLine = () => screen.getByTestId('present-step').textContent;
const title = () => within(screen.getByTestId('present')).getByRole('heading').textContent;
const drawn = () => [...new Set(screen.queryAllByTestId('board-shape').map((s) => s.getAttribute('data-ref')))];
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
const previous = () => fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
const key = (k: string, target: Element | Window = window) => fireEvent.keyDown(target, { key: k });
/** Opens Present and goes to System flow's first step, once its board is drawn. */
async function toFlow() {
  await screen.findByTestId('present');
  next();
  await waitFor(() => expect(drawn()).toEqual(['node:job']));
}

describe('Present', () => {
  it("opens on the first chapter's first step, with its caption, the step count and its notes", async () => {
    // jsdom has no scrollIntoView: this one counts its calls.
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: scroll, configurable: true, writable: true });
    show();
    expect(await screen.findByTestId('present')).toBeTruthy();
    // Opening Present brings it into view once, at its top.
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(screen.getByTestId('present'));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    expect(title()).toBe('1. Purpose');
    expect(stepLine()).toBe('Step 1 of 1');
    expect(caption()).toBe('A daily job reminds customers before an item runs out.');
    // Purpose draws nothing: its note is written on the board as a list.
    expect(screen.getByTestId('board-note').textContent).toBe('One job, one table.');
    expect(screen.queryAllByTestId('board-shape')).toHaveLength(0);
    expect(screen.queryByText('Nothing to draw in this chapter.')).toBeNull();
    // Nothing in Present is the page's main action.
    expect(screen.getAllByRole('button').filter((b) => b.className.includes('bg-button'))).toHaveLength(0);
    // ◀ ▶ are big enough to tap on a phone.
    for (const name of ['Previous step', 'Next step']) expect(screen.getByRole('button', { name }).className).toContain('max-md:h-11 max-md:w-11');
    // A step doesn't scroll the page.
    next();
    expect(scroll).toHaveBeenCalledTimes(1);
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('steps on and back across chapter ends, adding the parts each step reveals', async () => {
    const { thread } = show();
    await toFlow();
    expect(thread).toHaveBeenCalledWith('acme-app', 'restock', 't-architecture-system');
    expect(vi.mocked(layoutBoard)).toHaveBeenCalledWith({ kind: 'diagram', itemId: 'architecture-system' }, { kind: 'system' });
    expect(title()).toBe('2. System flow');
    expect([stepLine(), caption()]).toEqual(['Step 1 of 3', 'The job runs every morning.']);
    next();
    // A line brings its two ends with it, and the step's note rings the box it's near.
    expect(drawn()).toEqual(['edge:sends', 'node:job', 'node:sms']);
    expect([stepLine(), caption()]).toEqual(['Step 2 of 3', 'It sends each reminder by SMS.']);
    expect(screen.getByTestId('board-note').getAttribute('data-near')).toBe('node:sms');
    next();
    next();
    expect(title()).toBe('3. Data and source of truth');
    previous();
    expect([title(), stepLine()]).toEqual(['2. System flow', 'Step 3 of 3']);
    previous();
    previous();
    previous();
    expect([title(), stepLine()]).toEqual(['1. Purpose', 'Step 1 of 1']);
    // At the very start ◀ waits, and stays focusable.
    const back = screen.getByRole('button', { name: 'Previous step' });
    expect(back.getAttribute('aria-disabled')).toBe('true');
    previous();
    expect(title()).toBe('1. Purpose');
  });

  it('stops at the last step of the last chapter', async () => {
    show();
    await screen.findByTestId('present');
    fireEvent.change(screen.getByRole('combobox', { name: 'Chapters' }), { target: { value: '6' } });
    expect([title(), stepLine()]).toEqual(['7. Rollback and blast radius', 'Step 1 of 1']);
    expect(screen.getByRole('button', { name: 'Next step' }).getAttribute('aria-disabled')).toBe('true');
    next();
    expect(title()).toBe('7. Rollback and blast radius');
  });

  it('draws what a step adds as you move on, and shows a step at once when you go back', async () => {
    show();
    await toFlow();
    const board = () => screen.getByTestId('board');
    expect(board().getAttribute('data-animate')).toBe('true');
    next();
    expect(board().getAttribute('data-animate')).toBe('true');
    previous();
    expect(board().getAttribute('data-animate')).toBe('false');
    expect(drawn()).toEqual(['node:job']);
  });

  it('Replay draws the chapter again from step 1', async () => {
    show();
    await toFlow();
    next();
    next();
    previous();
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect([title(), stepLine(), caption()]).toEqual(['2. System flow', 'Step 1 of 3', 'The job runs every morning.']);
    expect(drawn()).toEqual(['node:job']);
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('true');
  });

  it('shows everything at once when you have asked for reduced motion', async () => {
    reduced.value = true;
    show();
    await toFlow();
    next();
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('false');
    expect(document.querySelectorAll('[data-testid=board] path[pathLength]')).toHaveLength(0);
  });

  it('works from the keyboard: ← → step, Home and End go to the ends of the chapter', async () => {
    show();
    await screen.findByTestId('present');
    key('ArrowRight');
    await waitFor(() => expect(drawn()).toEqual(['node:job']));
    key('End');
    expect(stepLine()).toBe('Step 3 of 3');
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('false');
    key('Home');
    expect(stepLine()).toBe('Step 1 of 3');
    key('ArrowRight');
    expect(stepLine()).toBe('Step 2 of 3');
    key('ArrowLeft');
    key('ArrowLeft');
    expect(title()).toBe('1. Purpose');
    // A shortcut with Cmd is the browser's.
    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true });
    expect(title()).toBe('1. Purpose');
  });

  it("Present's keys leave fields and focused controls alone", async () => {
    show();
    await screen.findByTestId('present');
    // Arrows in a field are the field's: the chapters menu, the export menu, or any box you type in on the page.
    key('ArrowRight', screen.getByRole('combobox', { name: 'Chapters' }));
    key('ArrowRight', screen.getByLabelText('Export into'));
    const ask = document.body.appendChild(document.createElement('textarea'));
    key('ArrowRight', ask);
    key('End', ask);
    ask.remove();
    expect([title(), stepLine()]).toEqual(['1. Purpose', 'Step 1 of 1']);
    // Space and Enter are a focused button's own: Present takes neither.
    const replay = screen.getByRole('button', { name: 'Replay' });
    replay.focus();
    for (const k of [' ', 'Enter']) {
      const press = createEvent.keyDown(replay, { key: k });
      fireEvent(replay, press);
      expect(press.defaultPrevented).toBe(false);
    }
    expect(title()).toBe('1. Purpose');
    // Esc leaves full screen and gives the focus back to Full screen.
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(screen.getByTestId('present-overlay')).toBeTruthy();
    key('Escape');
    expect(screen.queryByTestId('present-overlay')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Full screen' }));
    // Esc with nothing in full screen does nothing.
    key('Escape');
    expect(title()).toBe('1. Purpose');
  });

  it('Full screen covers the window with the same board and controls, and ✕ leaves it', async () => {
    show();
    await toFlow();
    // In the page the board takes its chapter's shape, so what's under it moves only between chapters.
    expect(screen.getByTestId('board').style.aspectRatio).not.toBe('');
    // Something outside the app, as the project navigation is outside Present.
    const aside = document.body.appendChild(document.createElement('aside'));
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    const overlay = screen.getByTestId('present-overlay');
    expect(overlay.className).toContain('fixed inset-0');
    expect(overlay.className).toContain('bg-canvas');
    expect(overlay.getAttribute('role')).toBe('dialog');
    // Everything but the overlay is inert, so the focus can't leave it: the page around it, and what's outside the app.
    expect(aside.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('[role=tablist]')!.closest('[inert]')).not.toBeNull();
    expect(overlay.closest('[inert]')).toBeNull();
    // The board takes the height that's left; on a short screen the caption keeps to two lines in the bottom row.
    expect(within(overlay).getByTestId('board').parentElement!.className).toContain('flex-1');
    expect(within(overlay).getByTestId('board').className).toContain('h-full');
    expect(within(overlay).getByTestId('board').style.aspectRatio).toBe('');
    expect(overlay.className).toContain('[@media(max-height:500px)]:pt-2');
    expect(within(overlay).getByTestId('present-caption').className).toContain('[@media(max-height:500px)]:line-clamp-2');
    // The Full screen button gives way to ✕, which takes the focus.
    expect(document.activeElement).toBe(within(overlay).getByRole('button', { name: 'Leave full screen' }));
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(within(overlay).getByTestId('board')).toBeTruthy();
    expect(within(overlay).queryByRole('button', { name: 'Full screen' })).toBeNull();
    // The keys still work in it.
    key('ArrowRight');
    expect(within(overlay).getByTestId('present-step').textContent).toBe('Step 2 of 3');
    fireEvent.click(within(overlay).getByRole('button', { name: 'Leave full screen' }));
    expect(screen.queryByTestId('present-overlay')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Full screen' }));
    expect(stepLine()).toBe('Step 2 of 3');
    // The marks come off again.
    expect(aside.hasAttribute('inert')).toBe(false);
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    aside.remove();
  });

  it('lists the chapters beside the board on a wide screen and as a menu above it on a narrow one', async () => {
    show();
    const chapters = await screen.findByTestId('present-chapters');
    const rail = within(chapters).getByRole('navigation', { name: 'Chapters' });
    expect(rail.className).toContain('hidden');
    expect(rail.className).toContain('min-[1100px]:block');
    const menu = within(chapters).getByRole('combobox', { name: 'Chapters' }) as HTMLSelectElement;
    expect(menu.closest('label')!.className).toContain('min-[1100px]:hidden');
    expect([...menu.options].map((o) => o.textContent)).toEqual([
      '1. Purpose',
      '2. System flow',
      '3. Data and source of truth',
      '4. States',
      '5. Security',
      '6. Failure and retries',
      '7. Rollback and blast radius',
    ]);
    expect(within(rail).getAllByRole('button').map((b) => b.textContent)).toEqual([...menu.options].map((o) => o.textContent));
    expect(within(rail).getByRole('button', { name: '1. Purpose' }).getAttribute('aria-current')).toBe('step');
    fireEvent.click(within(rail).getByRole('button', { name: '6. Failure and retries' }));
    expect([title(), stepLine()]).toEqual(['6. Failure and retries', 'Step 1 of 1']);
    expect(menu.value).toBe('5');
    expect(within(rail).getByRole('button', { name: '6. Failure and retries' }).getAttribute('aria-current')).toBe('step');
  });

  it("asks a phone held upright to turn sideways, and says nothing on a wider screen", async () => {
    show();
    const hint = await screen.findByTestId('present-landscape-hint');
    expect(hint.textContent).toBe('Turn your phone sideways, then press Full screen.');
    expect(hint.className).toContain('hidden');
    expect(hint.className).toContain('max-md:portrait:block');
  });

  it('draws the tables from every database item that is not parked, of every database type', async () => {
    // Two types draw on the database screen, as core's drawnItems counts them; the home lists only enabled types.
    const types = [
      { id: 'architecture', screen: 'diagram' },
      { id: 'tables', screen: 'database' },
      { id: 'audit', screen: 'database' },
    ];
    vi.spyOn(api, 'projectHome').mockResolvedValue({ types } as unknown as ProjectHome);
    const rows: Record<string, TypeItemRow[]> = {
      tables: [
        row({ id: 'tables-reminder', data: { model: 'RestockReminder' } }),
        row({ id: 'tables-old', status: 'parked', data: { model: 'OldLog' } }),
        row({ id: 'tables-note', data: null }),
      ],
      audit: [row({ id: 'audit-log', data: { model: 'AuditLog' } })],
    };
    const typeItems = vi.spyOn(api, 'typeItems').mockImplementation(async (_repo, _project, typeId) => ({ type: {} as never, items: rows[typeId] ?? [] }));
    show();
    await screen.findByTestId('present');
    fireEvent.change(screen.getByRole('combobox', { name: 'Chapters' }), { target: { value: '2' } });
    // In item-id order, as core lists them.
    await waitFor(() => expect(vi.mocked(layoutBoard)).toHaveBeenCalledWith({ kind: 'tables' }, [{ model: 'AuditLog' }, { model: 'RestockReminder' }]));
    expect(typeItems).toHaveBeenCalledWith('acme-app', 'restock', 'tables');
    expect(typeItems).toHaveBeenCalledWith('acme-app', 'restock', 'audit');
  });

  it('a stale presenter still draws what it can', async () => {
    // System flow's diagram lost a box after the defense was written: the parts it still has are drawn, the rest skipped.
    const stale = presenter({
      flow: {
        steps: [
          { caption: 'The job runs every morning.', reveal: ['node:job', 'node:gone'], notes: [{ near: 'node:gone', text: 'This box was renamed.', ink: 'seal' }] },
          { caption: 'It sends each reminder by SMS.', reveal: ['edge:gone', 'edge:sends'], notes: [] },
        ],
      },
    });
    show(view({ defense: defense({ presenter: stale }), stale: 'Out of date: the plan changed since this was generated.' }));
    await toFlow();
    // A note near a part that isn't there goes in the list under the board.
    expect(within(screen.getByTestId('board')).getByRole('listitem').textContent).toBe('This box was renamed.');
    next();
    expect(drawn()).toEqual(['edge:sends', 'node:job', 'node:sms']);

    // Its data no longer draws at all: nothing to draw, and the notes still show.
    cleanup();
    vi.mocked(layoutBoard).mockResolvedValue(null);
    show(view({ defense: defense({ presenter: stale }) }));
    await screen.findByTestId('present');
    next();
    expect(await screen.findByText('Nothing to draw in this chapter.')).toBeTruthy();
    expect(within(screen.getByTestId('board')).getByRole('listitem').textContent).toBe('This box was renamed.');
    expect(screen.queryAllByTestId('board-shape')).toHaveLength(0);
    expect(caption()).toBe('The job runs every morning.');

    // The item is gone: the same.
    cleanup();
    vi.mocked(layoutBoard).mockResolvedValue(SMALL);
    show(view({ defense: defense({ presenter: stale }) }));
    vi.spyOn(api, 'thread').mockRejectedValue(new ApiError(404, 'There is no thread t-architecture-system.', null));
    await screen.findByTestId('present');
    next();
    expect(await screen.findByText('Nothing to draw in this chapter.')).toBeTruthy();
    expect(within(screen.getByTestId('board')).getByRole('listitem').textContent).toBe('This box was renamed.');
  });

  it('keeps the chapter and the step when you go to Study and back', async () => {
    const { switchTo } = show();
    await toFlow();
    next();
    switchTo('study');
    expect(await screen.findByTestId('study')).toBeTruthy();
    switchTo('present');
    await screen.findByTestId('present');
    expect([title(), stepLine()]).toEqual(['2. System flow', 'Step 2 of 3']);
    // Back at a step past the first, the board is shown as it was, not partly drawn again.
    await waitFor(() => expect(drawn()).toEqual(['edge:sends', 'node:job', 'node:sms']));
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('false');
  });

  it('says a defense written before Present has nothing to present, and makes Regenerate the main action', async () => {
    show(view({ defense: defense() }));
    expect((await screen.findByTestId('present-old')).textContent).toBe('This defense was written before Present. Regenerate it to present it.');
    expect(screen.queryByTestId('present')).toBeNull();
    const regenerate = screen.getByTestId('defense-generate');
    expect(regenerate.textContent).toBe('Regenerate');
    expect(screen.getAllByRole('button').filter((b) => b.className.includes('bg-button'))).toEqual([regenerate]);
    // A presenter with no chapters reads the same way, page and all.
    cleanup();
    show(view({ defense: defense({ presenter: { chapters: [] } }) }));
    expect(await screen.findByTestId('present-old')).toBeTruthy();
    expect(screen.getAllByRole('button').filter((b) => b.className.includes('bg-button'))).toEqual([screen.getByTestId('defense-generate')]);
  });
});
```

`packages/web/e2e/present.spec.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { defenseInput, importProject, writeDefense, type TestItem } from './claude';
import { noSideScroll, readJson } from './env';

const system: TestItem = {
  key: 'system',
  title: 'System view',
  summary: 'The daily job and what it talks to.',
  data: {
    kind: 'system',
    groups: [{ id: 'jobs', label: 'Jobs' }],
    nodes: [
      { id: 'job', label: 'Reminder job', group: 'jobs', status: 'new' },
      { id: 'db', label: 'Orders database', status: 'unchanged' },
      { id: 'sms', label: 'SMS provider', status: 'external' },
    ],
    edges: [
      { id: 'reads', from: 'job', to: 'db', label: 'reads' },
      { id: 'sends', from: 'job', to: 'sms', style: 'dashed' },
    ],
  },
};
const reminder: TestItem = {
  key: 'restock-reminder',
  title: 'Add a RestockReminder table',
  summary: 'One row per reminder sent.',
  data: {
    model: 'RestockReminder',
    change: 'new',
    fields: [
      { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
      { name: 'subscriptionId', type: 'String', change: 'added' },
      { name: 'subscription', type: 'Subscription', change: 'added' },
    ],
    schemaDiff: '+model RestockReminder {\n+  id             String       @id @default(cuid())\n+  subscriptionId String\n+  subscription   Subscription @relation(fields: [subscriptionId], references: [id])\n+}',
  },
};
const subscription: TestItem = {
  key: 'subscription',
  title: 'Remember how early to remind',
  summary: 'A lead time per subscription.',
  data: {
    model: 'Subscription',
    change: 'changed',
    fields: [
      { name: 'id', type: 'String', change: 'unchanged' },
      { name: 'remindDaysBefore', type: 'Int', change: 'added', default: '5' },
    ],
    schemaDiff: ' model Subscription {\n+  remindDaysBefore Int @default(5)\n }',
  },
};

type Note = { near: string; text: string; ink: 'ink' | 'slate' | 'seal' | 'moss' };
const say = (caption: string, reveal: string[] = [], notes: Note[] = []) => ({ caption, reveal, notes });

/** System flow draws the architecture diagram in three steps; Data and source of truth draws the tables in two. */
function presenter() {
  return {
    chapters: [
      { id: 'purpose', drawing: null, steps: [say('A daily job reminds customers before an item runs out.', [], [{ near: '', text: 'One job, one table.', ink: 'ink' }])] },
      {
        id: 'flow',
        drawing: { kind: 'diagram', itemId: 'architecture-system' },
        steps: [
          say('The job runs every morning.', ['node:job']),
          say('It reads the orders.', ['edge:reads']),
          say('Then it sends each reminder by SMS.', ['edge:sends'], [{ near: 'node:sms', text: 'Runs twice? One a day per subscription.', ink: 'seal' }]),
        ],
      },
      { id: 'data', drawing: { kind: 'tables' }, steps: [say('Each reminder sent is a row.', ['table:RestockReminder']), say('It points at its subscription.', ['link:RestockReminder.subscription'])] },
      { id: 'states', drawing: null, steps: [say("A reminder is due, then sent. This plan doesn't add other states.")] },
      { id: 'security', drawing: null, steps: [say('Only the job sends reminders.')] },
      { id: 'failure', drawing: null, steps: [say('A failed send is retried once, the next morning.')] },
      { id: 'rollback', drawing: null, steps: [say('Turn the job off; nothing else depends on it.')] },
    ],
  };
}

/** A project with a diagram and two tables, and a defense whose presenter draws them. */
async function presented(name: string) {
  const p = await importProject(name, 'Present', { architecture: [system], database: [reminder, subscription] });
  await writeDefense(p, { ...defenseInput(), presenter: presenter() });
  return p;
}

/** The refs on the board, once each, in the order they're drawn. */
const refs = (page: Page) =>
  page.getByTestId('board-shape').evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute('data-ref')))]);
/** Where an element is on the page (not in the window, which scrolls): x, y, width and height. */
const placeOf = (locator: Locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.x + window.scrollX, r.y + window.scrollY, r.width, r.height];
  });

test('Present draws the plan a step at a time, chapter by chapter, and Full screen covers the window', async ({ page }) => {
  const p = await presented('present-draws');
  await page.goto(`${p.url}/defense`);
  await page.getByRole('tab', { name: 'Present' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/defense\\?mode=present$`));
  const board = page.getByTestId('board');
  const caption = page.getByTestId('present-caption');
  const step = page.getByTestId('present-step');
  await expect(step).toHaveText('Step 1 of 1');
  await expect(caption).toHaveText('A daily job reminds customers before an item runs out.');
  await expect(board.getByTestId('board-note')).toHaveText('One job, one table.');

  // → moves on to System flow, whose first step draws the job (and so its group), drawing it along its lines.
  await page.keyboard.press('ArrowRight');
  await expect(caption).toHaveText('The job runs every morning.');
  await expect(step).toHaveText('Step 1 of 3');
  await expect.poll(() => refs(page)).toEqual(['group:jobs', 'node:job']);
  await expect(board).toHaveAttribute('data-animate', 'true');
  await expect(board.locator('[data-ref="node:job"] path[pathLength]')).toHaveCount(1);
  // The board keeps its size and the drawing its frame, so ▶ stays under the pointer from step to step (a chapter's own
  // shape may move it between chapters).
  const nextButton = page.getByTestId('present-next');
  const nextAt = await placeOf(nextButton);
  const frame = await board.locator('svg[viewBox]').getAttribute('viewBox');
  await nextButton.click();
  await expect(caption).toHaveText('It reads the orders.');
  await expect.poll(() => refs(page)).toEqual(['group:jobs', 'edge:reads', 'node:job', 'node:db']);
  expect(await placeOf(nextButton)).toEqual(nextAt);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => refs(page)).toEqual(['group:jobs', 'edge:reads', 'edge:sends', 'node:job', 'node:db', 'node:sms']);
  expect(await placeOf(nextButton)).toEqual(nextAt);
  await expect(board.locator('svg[viewBox]')).toHaveAttribute('viewBox', frame!);
  const note = board.getByTestId('board-note');
  await expect(note).toHaveText('Runs twice? One a day per subscription.');
  await expect(note).toHaveAttribute('data-near', 'node:sms');
  // Going back shows the step at once.
  await page.keyboard.press('ArrowLeft');
  await expect(board).toHaveAttribute('data-animate', 'false');
  await expect(board.locator('path[pathLength]')).toHaveCount(0);

  // The chapters sit beside the board on a wide screen.
  const chapters = page.getByRole('navigation', { name: 'Chapters' });
  await expect(page.getByRole('combobox', { name: 'Chapters' })).toBeHidden();
  await chapters.getByRole('button', { name: '3. Data and source of truth' }).click();
  await expect(chapters.getByRole('button', { name: '3. Data and source of truth' })).toHaveAttribute('aria-current', 'step');
  await expect(caption).toHaveText('Each reminder sent is a row.');
  await expect.poll(() => refs(page)).toEqual(['table:RestockReminder']);
  // The tables are drawn in slate.
  await expect(board.locator('[data-ref="table:RestockReminder"] path').first()).toHaveCSS('stroke', 'rgb(109, 129, 150)');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => refs(page)).toEqual(['link:RestockReminder.subscription', 'table:RestockReminder', 'table:Subscription']);
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(step).toHaveText('Step 1 of 2');
  await expect.poll(() => refs(page)).toEqual(['table:RestockReminder']);

  // Full screen covers the whole window with the same board and controls; Esc leaves, and the focus comes back.
  await page.getByRole('button', { name: 'Full screen' }).click();
  const overlay = page.getByTestId('present-overlay');
  await expect(overlay).toBeVisible();
  const [width, height] = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  expect(await overlay.boundingBox()).toEqual({ x: 0, y: 0, width, height });
  await expect(overlay.getByTestId('board')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(overlay.getByTestId('present-step')).toHaveText('Step 2 of 2');
  // The rest of the page is inert, so Tab from full screen's last control comes back to ✕.
  await expect(page.locator('aside[aria-label="Project navigation"]')).toHaveAttribute('inert', '');
  await overlay.getByRole('button', { name: 'Replay' }).focus();
  await page.keyboard.press('Tab');
  await expect(overlay.getByRole('button', { name: 'Leave full screen' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Full screen' })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(step).toHaveText('Step 2 of 2');

  // Leaving the page in full screen leaves the browser's full screen too.
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(overlay).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${p.url}/defense(\\?mode=study)?$`));
  await expect(overlay).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('');
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('everything a step adds shows at once', async ({ page }) => {
    const p = await presented('present-still');
    await page.goto(`${p.url}/defense?mode=present`);
    await expect(page.getByTestId('present-step')).toHaveText('Step 1 of 1');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => refs(page)).toEqual(['group:jobs', 'edge:reads', 'node:job', 'node:db']);
    const board = page.getByTestId('board');
    await expect(board).toHaveAttribute('data-animate', 'false');
    await expect(board.locator('path[pathLength]')).toHaveCount(0);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('held upright it asks to be turned sideways, and the board fits the width either way', async ({ page }) => {
    const p = await presented('present-phone');
    await page.goto(`${p.url}/defense?mode=present`);
    const hint = page.getByTestId('present-landscape-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText('Turn your phone sideways, then press Full screen.');
    // The chapters are a menu above the board.
    await expect(page.getByRole('navigation', { name: 'Chapters' })).toBeHidden();
    await page.getByRole('combobox', { name: 'Chapters' }).selectOption({ label: '2. System flow' });
    await page.getByRole('button', { name: 'Next step' }).click();
    await page.getByRole('button', { name: 'Next step' }).click();
    await expect.poll(() => refs(page)).toEqual(['group:jobs', 'edge:reads', 'edge:sends', 'node:job', 'node:db', 'node:sms']);
    expect(await noSideScroll(page)).toEqual([]);
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(hint).toBeHidden();
    await expect(page.getByTestId('board')).toBeVisible();
    expect(await noSideScroll(page)).toEqual([]);
    // Sideways in full screen, everything fits: the caption and ▶ are on screen, and nothing needs scrolling.
    await page.getByRole('button', { name: 'Full screen' }).click();
    const overlay = page.getByTestId('present-overlay');
    await expect(overlay).toBeVisible();
    for (const id of ['present-caption', 'present-next']) {
      const box = (await overlay.getByTestId(id).boundingBox())!;
      expect(box.y, id).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, id).toBeLessThanOrEqual(375);
    }
    expect(await overlay.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  });
});

/** A wide drawing: six services in a row. */
const chain: TestItem = {
  key: 'chain',
  title: 'Request path',
  summary: 'Six services in a row.',
  data: {
    kind: 'system',
    groups: [],
    nodes: ['Web app', 'API', 'Queue', 'Worker', 'Mailer', 'Archive'].map((label, i) => ({ id: `s${i}`, label, status: 'new' })),
    edges: [0, 1, 2, 3, 4].map((i) => ({ id: `c${i}`, from: `s${i}`, to: `s${i + 1}` })),
  },
};
/** A tall drawing: two lanes and twelve steps. */
const exchange: TestItem = {
  key: 'exchange',
  title: 'The long exchange',
  summary: 'Twelve messages between the app and the API.',
  data: {
    kind: 'system',
    lanes: [
      { id: 'app', label: 'App', status: 'new' },
      { id: 'api', label: 'API', status: 'changed' },
    ],
    steps: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, from: i % 2 ? 'api' : 'app', to: i % 2 ? 'app' : 'api', label: `Message ${i + 1}` })),
  },
};
/** 80 boxes in 8 areas of 10, each a small tree, each area's first box calling the next area's. */
const TREE = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 4],
  [1, 5],
  [2, 6],
  [2, 7],
  [3, 8],
  [3, 9],
];
const areas = Array.from({ length: 8 }, (_, g) => ({ id: `g${g}`, label: `Service area ${g + 1}` }));
const eighty: TestItem = {
  key: 'eighty',
  title: 'Every service',
  summary: 'Eighty boxes.',
  data: {
    kind: 'system',
    groups: areas,
    nodes: areas.flatMap((_, g) => Array.from({ length: 10 }, (_, k) => ({ id: `g${g}n${k}`, label: `Component ${g + 1}.${k + 1}`, group: `g${g}`, status: 'new' }))),
    edges: [
      ...areas.flatMap((_, g) => TREE.map(([a, b]) => ({ id: `g${g}e${a}-${b}`, from: `g${g}n${a}`, to: `g${g}n${b}` }))),
      ...areas.slice(1).map((_, i) => ({ id: `next${i}`, from: `g${i}n0`, to: `g${i + 1}n0` })),
    ],
  },
};
/** System flow draws the wide chain, States the tall exchange, and Security one area of the eighty boxes. */
function shapes() {
  const plain = (id: string, caption: string) => ({ id, drawing: null, steps: [say(caption)] });
  return {
    chapters: [
      plain('purpose', 'A request path, a long exchange and eighty boxes.'),
      { id: 'flow', drawing: { kind: 'diagram', itemId: 'architecture-chain' }, steps: [say('A request goes all the way down.', [0, 1, 2, 3, 4].map((i) => `edge:c${i}`))] },
      plain('data', 'Nothing new is stored.'),
      { id: 'states', drawing: { kind: 'flow', itemId: 'flows-exchange' }, steps: [say('They talk twelve times.', Array.from({ length: 12 }, (_, i) => `step:${i + 1}`))] },
      { id: 'security', drawing: { kind: 'diagram', itemId: 'architecture-eighty' }, steps: [say('Area 4 is the one that matters.', TREE.map(([a, b]) => `edge:g3e${a}-${b}`))] },
      plain('failure', 'A failed call is retried once.'),
      plain('rollback', 'Turn it off; nothing else depends on it.'),
    ],
  };
}

test.describe('at 1280 x 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("the board takes its chapter's shape, and opening Present brings the caption and ▶ into view", async ({ page }) => {
    const p = await importProject('present-shapes', 'Present shapes', { architecture: [chain, eighty], flows: [exchange] });
    await writeDefense(p, { ...defenseInput(), presenter: shapes() });
    await page.goto(`${p.url}/defense`);
    await page.getByRole('tab', { name: 'Present' }).click();
    await expect(page.getByTestId('present-step')).toHaveText('Step 1 of 1');
    const board = page.getByTestId('board');
    /** Goes to a chapter from the list beside the board, waits for its last part, and gives the board's height. */
    const chapter = async (name: string, last: string) => {
      await page.getByRole('navigation', { name: 'Chapters' }).getByRole('button', { name }).click();
      await expect(board.locator(`[data-ref="${last}"]`).first()).toBeVisible();
      return (await board.boundingBox())!.height;
    };
    /** The caption and ▶ are in the window, with nothing scrolled since Present opened. */
    const inView = async (where: string) => {
      for (const id of ['present-caption', 'present-next']) {
        const box = (await page.getByTestId(id).boundingBox())!;
        expect(box.y, `${where}: ${id}`).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, `${where}: ${id}`).toBeLessThanOrEqual(800);
      }
    };
    const wide = await chapter('2. System flow', 'edge:c4');
    await inView('the wide chain');
    const tall = await chapter('4. States', 'step:12');
    await chapter('5. Security', 'edge:g3e3-9');
    await inView('one area of eighty boxes');
    // A wide drawing gets a short board, not a thin band in a tall one; a tall drawing a taller board.
    expect(wide).toBeLessThan(tall);
  });
});

test('a defense written before Present says so, and Regenerate is the main action', async ({ page }) => {
  const p = await importProject('present-old', 'Present old');
  await writeDefense(p);
  // A defense saved before Plan 7: the same file, without its presenter.
  const file = path.join(readJson('settings.json').projectsFolder, p.repo, p.project, 'whiteboard', 'defense.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete saved.presenter;
  fs.writeFileSync(file, JSON.stringify(saved, null, 2));
  await page.goto(`${p.url}/defense?mode=present`);
  await expect(page.getByTestId('present-old')).toHaveText('This defense was written before Present. Regenerate it to present it.');
  await expect(page.getByTestId('present')).toHaveCount(0);
  const regenerate = page.getByTestId('defense-generate');
  await expect(regenerate).toHaveText('Regenerate');
  await expect(regenerate).toHaveClass(/bg-button/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run:
```bash
pnpm vitest run packages/web/src/pages/defense
pnpm test:e2e present
```
Expected: FAIL.
- In `PresentView.test.tsx`, all 15 fail: `DefenseBody` shows Study for any mode but Practice, so `Unable to find an element by: [data-testid="present"]` (or `present-chapters`, `present-landscape-hint` or `present-old`: the first test id each test waits for).
- In `DefensePage.test.tsx`, the two new tests fail: the tabs are `['Study', 'Practice']`, and `PresentBoundary` isn't there yet (`Element type is invalid: … got: undefined`). The other 16 pass.
- Study's and Practice's tests pass.
- All 5 e2e tests fail: there's no Present tab, and `?mode=present` opens Study.

- [ ] **Step 3: Let the address open Present**

In `packages/web/src/router.tsx`, replace:
```tsx
/** `?mode=practice` opens Practice; anything else is Study. Links may leave the search out. */
type DefenseSearch = { mode: DefenseMode };
const defenseRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'defense',
  component: DefensePage,
  validateSearch: (search: { mode?: DefenseMode } & SearchSchemaInput): DefenseSearch => ({ mode: search.mode === 'practice' ? 'practice' : 'study' }),
});
```
with:
```tsx
/** `?mode=practice` opens Practice and `?mode=present` Present; anything else is Study. Links may leave the search out. */
type DefenseSearch = { mode: DefenseMode };
const defenseRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'defense',
  component: DefensePage,
  validateSearch: (search: { mode?: DefenseMode } & SearchSchemaInput): DefenseSearch => ({
    mode: search.mode === 'practice' || search.mode === 'present' ? search.mode : 'study',
  }),
});
```

- [ ] **Step 4: Give the page its third mode**

In `packages/web/src/pages/defense/DefensePage.tsx`:

Replace:
```tsx
import { useState } from 'react';
```
with:
```tsx
import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
```

Replace:
```tsx
export type DefenseMode = 'study' | 'practice';
/** What Study and Practice are given: the page's data, with a defense in it. */
```
with:
```tsx
// Present brings Rough.js and Motion, so it's its own chunk, loaded the first time Present opens.
const PresentView = lazy(() => import('./present/PresentView').then((m) => ({ default: m.PresentView })));
const PRESENT_FAILED = "Present couldn't load. Reload the page.";

/**
 * Present's chunk can fail to load (a tab left open across an upgrade asks for one that's gone). Then Present says so,
 * in place of the router's error page, and the rest of the page stays.
 */
export class PresentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert" className="mt-6 text-[13px] text-ink-2">
        {PRESENT_FAILED}
      </p>
    ) : (
      this.props.children
    );
  }
}

export type DefenseMode = 'study' | 'practice' | 'present';
/** What Study, Practice and Present are given: the page's data, with a defense in it. */
```

Replace:
```tsx
export type PracticeViewProps = DefenseViewProps & { place: PracticePlace; onPlace: (place: PracticePlace) => void };
```
with:
```tsx
export type PracticeViewProps = DefenseViewProps & { place: PracticePlace; onPlace: (place: PracticePlace) => void };
/** Where Present is: the chapter and the step on show (both from 0). The page keeps it, as it does Practice's. */
export type PresentPlace = { chapter: number; step: number };
export type PresentViewProps = DefenseViewProps & { place: PresentPlace; onPlace: (place: PresentPlace) => void };
```

Replace:
```tsx
 * what the defense is based on, Study or Practice, and Export .md. The defense on show stays until a new one is saved.
```
with:
```tsx
 * what the defense is based on, Study, Practice or Present, and Export .md. The defense on show stays until a new one is
 * saved.
```

Replace:
```tsx
  const [place, setPlace] = useState<PracticePlace & { defenseId: string | null }>({ defenseId: null, card: 0, deck: null });
```
with:
```tsx
  const [place, setPlace] = useState<PracticePlace & { defenseId: string | null }>({ defenseId: null, card: 0, deck: null });
  // Present's place, the same way: Study and back keeps the chapter and the step, and a new defense starts at the top.
  const [present, setPresent] = useState<PresentPlace & { defenseId: string | null }>({ defenseId: null, chapter: 0, step: 0 });
```

Replace:
```tsx
  // The page's main action when there's nothing to study yet, it's out of date, or the last request failed.
  const primary = !d || v.stale !== null || failed;
```
with:
```tsx
  // The page's main action when there's nothing to study yet, it's out of date, the last request failed, or Present
  // is open on a defense written before Present (no presenter, or one with no chapters, as Present itself reads it).
  const primary = !d || v.stale !== null || failed || (mode === 'present' && !d.presenter?.chapters.length);
```

Replace:
```tsx
  return (
    <div className="max-w-[80ch]" data-testid="defense">
```
with:
```tsx
  // Present's board takes the width it's given; Study and Practice read best at a line's length.
  const width = mode === 'present' ? 'max-w-[1180px]' : 'max-w-[80ch]';

  return (
    <div className={width} data-testid="defense">
```

Replace:
```tsx
                { value: 'practice', label: 'Practice' },
              ]}
```
with:
```tsx
                { value: 'practice', label: 'Practice' },
                { value: 'present', label: 'Present' },
              ]}
```

Replace:
```tsx
          ) : (
            <StudyView key={d.id} view={{ ...v, defense: d }} repo={repo} project={project} />
          )}
```
with:
```tsx
          ) : mode === 'present' ? (
            <PresentBoundary>
              <Suspense fallback={<p className="mt-6 text-[12.5px] text-ink-3">Drawing…</p>}>
                <PresentView
                  key={d.id}
                  view={{ ...v, defense: d }}
                  repo={repo}
                  project={project}
                  place={present.defenseId === d.id ? { chapter: present.chapter, step: present.step } : { chapter: 0, step: 0 }}
                  onPlace={(next) => setPresent({ defenseId: d.id, ...next })}
                />
              </Suspense>
            </PresentBoundary>
          ) : (
            <StudyView key={d.id} view={{ ...v, defense: d }} repo={repo} project={project} />
          )}
```

- [ ] **Step 5: Write Present**

`packages/web/src/pages/defense/present/PresentView.tsx`:
```tsx
import type { Presenter, PresentStep } from '@dev-plumbing/core/schemas';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { api } from '../../../api/client';
import { buttonClass } from '../../../components/Button';
import { inputClass } from '../../../components/inputClass';
import type { PresentViewProps } from '../DefensePage';
import { BoardView } from './Board';
import { layoutBoard, type Board } from './boardLayout';

type Chapter = Presenter['chapters'][number];
type Drawing = NonNullable<Chapter['drawing']>;
/** A drawing's data as the app has it: still loading, gone (the item, or every table), or there. */
type Source = { state: 'loading' } | { state: 'missing' } | { state: 'ready'; data: unknown };

const OLD = 'This defense was written before Present. Regenerate it to present it.';
const NOTHING = 'Nothing to draw in this chapter.';
const SIDEWAYS = 'Turn your phone sideways, then press Full screen.';
/** While a board loads, it has no steps: its notes come with the drawing, not before it. */
const NO_STEPS: PresentStep[] = [];

/**
 * The classes that differ between the page and full screen, written out whole so Tailwind finds them.
 * - **In the page,** the board takes its chapter's shape (Task 3's `BoardView`), so the step, the caption and the buttons
 *   under it move only between chapters, never between steps. The area is at least the window's height (`min-h-dvh`),
 *   so opening Present can always scroll its top to the top of the window, whatever comes after it on the page.
 * - **In full screen,** the board takes the height that's left. On a short screen (under 500 px tall: a phone held
 *   sideways) it's three rows: the chapters menu, the title and ✕; the board; then the step, the caption (two lines
 *   at most) and the buttons, so nothing needs scrolling. The chapters list sits beside the board only from 1,100 px
 *   wide on a screen taller than that.
 */
const PAGE = {
  frame: 'mt-6 min-h-dvh',
  present: 'grid gap-x-6 gap-y-4 min-[1100px]:grid-cols-[minmax(0,1fr)_184px]',
  chapters: 'min-w-0 min-[1100px]:col-start-2 min-[1100px]:row-start-1',
  menu: 'flex items-center gap-2.5 text-[12px] font-semibold text-ink-3 min-[1100px]:hidden',
  rail: 'hidden min-[1100px]:block',
  column: 'min-w-0 min-[1100px]:col-start-1 min-[1100px]:row-start-1',
  title: 'text-[17px] font-semibold',
  board: 'mt-3',
  step: 'mt-3 text-[12px] text-ink-3',
  caption: 'mt-1 min-h-[2.75em] break-words text-[16px] leading-snug',
  buttons: 'mt-4 flex flex-wrap items-center gap-2',
};
const FULL = {
  frame:
    'fixed inset-0 z-50 flex flex-col overflow-y-auto bg-canvas px-4 pb-6 pt-14 md:px-10 [@media(max-height:500px)]:overflow-hidden [@media(max-height:500px)]:pb-2 [@media(max-height:500px)]:pt-2',
  present:
    'grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-x-6 gap-y-4 [@media(max-height:500px)]:grid-cols-[auto_minmax(0,1fr)_auto] [@media(max-height:500px)]:grid-rows-[auto_minmax(0,1fr)_auto] [@media(max-height:500px)]:gap-x-3 [@media(max-height:500px)]:gap-y-2 [@media(min-width:1100px)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_184px] [@media(min-width:1100px)_and_(min-height:501px)]:grid-rows-[minmax(0,1fr)]',
  chapters:
    'min-w-0 [@media(max-height:500px)]:contents [@media(min-width:1100px)_and_(min-height:501px)]:col-start-2 [@media(min-width:1100px)_and_(min-height:501px)]:row-start-1',
  menu: 'flex items-center gap-2.5 text-[12px] font-semibold text-ink-3 [@media(max-height:500px)]:col-start-1 [@media(max-height:500px)]:row-start-1 [@media(min-width:1100px)_and_(min-height:501px)]:hidden',
  rail: 'hidden [@media(min-width:1100px)_and_(min-height:501px)]:block',
  column:
    'flex min-h-0 min-w-0 flex-col [@media(max-height:500px)]:contents [@media(min-width:1100px)_and_(min-height:501px)]:col-start-1 [@media(min-width:1100px)_and_(min-height:501px)]:row-start-1',
  title:
    'text-[17px] font-semibold [@media(max-height:500px)]:col-span-2 [@media(max-height:500px)]:col-start-2 [@media(max-height:500px)]:row-start-1 [@media(max-height:500px)]:self-center [@media(max-height:500px)]:truncate [@media(max-height:500px)]:pr-10 [@media(max-height:500px)]:text-[15px]',
  board: 'mt-3 min-h-[240px] flex-1 [@media(max-height:500px)]:col-span-3 [@media(max-height:500px)]:row-start-2 [@media(max-height:500px)]:mt-0 [@media(max-height:500px)]:min-h-0',
  step: 'mt-3 text-[12px] text-ink-3 [@media(max-height:500px)]:col-start-1 [@media(max-height:500px)]:row-start-3 [@media(max-height:500px)]:mt-0 [@media(max-height:500px)]:self-center [@media(max-height:500px)]:whitespace-nowrap',
  caption:
    'mt-1 min-h-[2.75em] break-words text-[16px] leading-snug [@media(max-height:500px)]:col-start-2 [@media(max-height:500px)]:row-start-3 [@media(max-height:500px)]:mt-0 [@media(max-height:500px)]:line-clamp-2 [@media(max-height:500px)]:min-h-0 [@media(max-height:500px)]:self-center [@media(max-height:500px)]:text-[14px]',
  buttons:
    'mt-4 flex flex-wrap items-center gap-2 [@media(max-height:500px)]:col-start-3 [@media(max-height:500px)]:row-start-3 [@media(max-height:500px)]:mt-0 [@media(max-height:500px)]:flex-nowrap',
};

/** True when a key press is typing into a field, not presenting: the keys are the field's then. */
const typing = (e: KeyboardEvent) => e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]') !== null;

/**
 * While `on`, everything on the page but `ref`'s element is inert: each sibling of it and of each of its ancestors,
 * up to <body> (the project navigation, the mobile bar, the page around Present). So the focus can't leave full
 * screen for a control hidden under it. It takes off exactly the marks it put on.
 */
export function useInertOutside(ref: RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const marked: Element[] = [];
    for (let node: Element = el; node !== document.body && node.parentElement; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node || sibling.hasAttribute('inert')) continue;
        sibling.setAttribute('inert', '');
        marked.push(sibling);
      }
    }
    return () => {
      for (const m of marked) m.removeAttribute('inert');
    };
  }, [ref, on]);
}

/**
 * The data a chapter draws from, fetched as the rest of the app fetches it, so the caches are shared: a diagram or a
 * flow is its item's (every item's thread is t-<item id>); the tables are every database item that isn't parked, of
 * every type whose screen is the database screen (the project home lists the enabled ones), in item-id order, as
 * core's drawnItems has them.
 */
function useSource(repo: string, project: string, drawing: Chapter['drawing']): Source {
  const itemId = drawing && drawing.kind !== 'tables' ? drawing.itemId : null;
  const threadId = `t-${itemId}`;
  const thread = useQuery({ queryKey: ['thread', repo, project, threadId], queryFn: () => api.thread(repo, project, threadId), enabled: itemId !== null, retry: false });
  const tables = drawing?.kind === 'tables';
  const home = useQuery({ queryKey: ['projectHome', repo, project], queryFn: () => api.projectHome(repo, project), enabled: tables });
  const typeIds = (home.data?.types ?? []).filter((t) => t.screen === 'database').map((t) => t.id);
  const rows = useQueries({
    queries: typeIds.map((typeId) => ({ queryKey: ['typeItems', repo, project, typeId], queryFn: () => api.typeItems(repo, project, typeId), enabled: tables, retry: false })),
  });

  if (!drawing) return { state: 'missing' };
  if (drawing.kind === 'tables') {
    if (home.error || rows.some((r) => r.error) || (home.data && typeIds.length === 0)) return { state: 'missing' };
    if (!home.data || rows.some((r) => !r.data)) return { state: 'loading' };
    const items = rows.flatMap((r) => r.data!.items).filter((r) => r.status !== 'parked' && r.data !== null);
    return { state: 'ready', data: items.sort((a, b) => a.id.localeCompare(b.id)).map((r) => r.data) };
  }
  if (thread.error) return { state: 'missing' };
  if (!thread.data) return { state: 'loading' };
  const screen = drawing.kind === 'diagram' ? 'diagram' : 'flows';
  return thread.data.type.screen === screen ? { state: 'ready', data: thread.data.item.data } : { state: 'missing' };
}

/** The board for a drawing: laid out once per data (a refetch with equal data doesn't lay it out again). */
function useBoard(drawing: Drawing | null, source: Source): { state: 'loading' } | { state: 'drawn'; board: Board | null } {
  const key = source.state === 'ready' ? JSON.stringify([drawing, source.data]) : null;
  const [drawn, setDrawn] = useState<{ key: string; board: Board | null } | null>(null);
  useEffect(() => {
    if (!drawing || key === null || source.state !== 'ready') return;
    let live = true;
    // A layout that fails is as good as nothing to draw: the notes still show.
    layoutBoard(drawing, source.data).then(
      (board) => live && setDrawn({ key, board }),
      () => live && setDrawn({ key, board: null }),
    );
    return () => {
      live = false;
    };
    // `key` stands for the drawing and its data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!drawing || source.state === 'missing') return { state: 'drawn', board: null };
  if (source.state === 'loading' || drawn?.key !== key) return { state: 'loading' };
  return { state: 'drawn', board: drawn.board };
}

function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="block">
      <path d={back ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6 4.5 9.5'} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Present: the defense drawn on a whiteboard, chapter by chapter. Each step adds parts of the chapter's drawing and its
 * marker notes, with a caption to say out loud. ◀ ▶ (or ← →) step, across chapter ends; Home and End go to the
 * chapter's first and last step; Replay draws the chapter again from step 1; Full screen covers the window (and the
 * screen, where the browser can), and Esc or ✕ leaves it. Moving on draws the new parts; going back shows the step at
 * once, and so does everything when you've asked for reduced motion. The page keeps the place, so Study and back
 * keeps it.
 */
export function PresentView(props: PresentViewProps) {
  const presenter = props.view.defense.presenter;
  if (!presenter?.chapters.length) {
    return (
      <p data-testid="present-old" className="mt-6 text-[13px] text-ink-2">
        {OLD}
      </p>
    );
  }
  return <Presenting {...props} presenter={presenter} />;
}

function Presenting({ repo, project, place, onPlace, presenter }: PresentViewProps & { presenter: Presenter }) {
  const chapters = presenter.chapters;
  const c = Math.min(Math.max(place.chapter, 0), chapters.length - 1);
  const chapter = chapters[c]!;
  const steps = chapter.steps;
  const at = Math.min(Math.max(place.step, 0), Math.max(steps.length - 1, 0));
  const reduced = useReducedMotion();
  // How the step on show came: drawn (onwards, a new chapter or Replay) or shown at once (back, Home or End). Coming
  // back to a step past the first (from Study, say) shows it at once: its board is already what was there.
  const [how, setHow] = useState<'draw' | 'still'>(() => (place.step > 0 ? 'still' : 'draw'));
  const [replayKey, setReplayKey] = useState(0);
  const [full, setFull] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const fullButton = useRef<HTMLButtonElement>(null);
  const leaveButton = useRef<HTMLButtonElement>(null);
  // For the browser's full screen, which comes and goes a moment after the overlay: whether the overlay is up, and
  // whether the browser's full screen is the overlay's.
  const overlayUp = useRef(false);
  const browserFull = useRef(false);
  // Set when leaving full screen, so the Full screen button gets the focus back once it's there again.
  const refocus = useRef(false);
  useInertOutside(frame, full);
  const area = useRef<HTMLDivElement>(null);
  // Opening Present (the mode, or the address) brings its top into view once, so the heading, the board, the caption
  // and the buttons are on screen together. Not on a step or a chapter: nothing should move under the pointer then.
  // jsdom has no scrollIntoView.
  useEffect(() => {
    const el = area.current;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }, []);

  const source = useSource(repo, project, chapter.drawing);
  const drawn = useBoard(chapter.drawing, source);
  const board = drawn.state === 'drawn' ? drawn.board : null;
  const animate = !reduced && how === 'draw';
  const first = c === 0 && at === 0;
  const last = c === chapters.length - 1 && at >= steps.length - 1;
  const cls = full ? FULL : PAGE;

  const go = (chapterAt: number, stepAt: number, next: 'draw' | 'still') => {
    setHow(next);
    onPlace({ chapter: chapterAt, step: stepAt });
  };
  const forward = () => {
    if (at < steps.length - 1) go(c, at + 1, 'draw');
    else if (c < chapters.length - 1) go(c + 1, 0, 'draw');
  };
  const back = () => {
    if (at > 0) go(c, at - 1, 'still');
    else if (c > 0) go(c - 1, Math.max(chapters[c - 1]!.steps.length - 1, 0), 'still');
  };
  const replay = () => {
    setReplayKey((k) => k + 1);
    go(c, 0, 'draw');
  };
  const enter = () => {
    overlayUp.current = true;
    setFull(true);
    // The browser's own full screen too, where it has one (not on an iPhone): it needs this click.
    const el = frame.current;
    if (el && document.fullscreenEnabled && typeof el.requestFullscreen === 'function') el.requestFullscreen().catch(() => undefined);
  };
  const leave = () => {
    overlayUp.current = false;
    refocus.current = true;
    setFull(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  };

  // The keys, while you aren't typing in a field: ← → step, Home and End, Esc leaves full screen. Space and Enter stay
  // with the focused control. In full screen, Tab goes round its own controls: everything else is inert, so past the
  // last one the browser would otherwise take the focus out of the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (full && e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const controls = Array.from(frame.current?.querySelectorAll<HTMLElement>('button, select') ?? []).filter((el) => el.getClientRects().length > 0);
        const [start, end] = [controls[0], controls.at(-1)];
        if (start && end && document.activeElement === (e.shiftKey ? start : end)) {
          e.preventDefault();
          (e.shiftKey ? end : start).focus();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      if (e.key === 'Escape' && full) {
        e.preventDefault();
        leave();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        forward();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Home') {
        e.preventDefault();
        go(c, 0, 'still');
      } else if (e.key === 'End') {
        e.preventDefault();
        go(c, Math.max(steps.length - 1, 0), 'still');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // While it covers the window, the focus is on ✕ and the page under it doesn't scroll. Once it's gone, the focus goes
  // back to Full screen.
  useEffect(() => {
    if (!full) {
      if (refocus.current) fullButton.current?.focus();
      refocus.current = false;
      return;
    }
    leaveButton.current?.focus();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = overflow;
    };
  }, [full]);

  // The browser's full screen follows the overlay. One that arrives after the overlay has gone is left at once; when
  // the browser leaves its own (its Esc), the overlay goes too; and leaving the page leaves it.
  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement) {
        if (document.fullscreenElement !== frame.current) return;
        if (overlayUp.current) browserFull.current = true;
        else document.exitFullscreen().catch(() => undefined);
      } else if (browserFull.current) {
        browserFull.current = false;
        if (overlayUp.current) {
          overlayUp.current = false;
          refocus.current = true;
          setFull(false);
        }
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const step = steps[at];
  return (
    <div
      ref={frame}
      data-testid={full ? 'present-overlay' : undefined}
      role={full ? 'dialog' : undefined}
      aria-modal={full || undefined}
      aria-label={full ? 'Present' : undefined}
      className={cls.frame}
    >
      {full && (
        <button
          ref={leaveButton}
          type="button"
          aria-label="Leave full screen"
          onClick={leave}
          className={buttonClass({ size: 'sm', className: 'absolute right-4 top-4 z-10 [@media(max-height:500px)]:top-2' })}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="block">
            <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        </button>
      )}
      <div ref={area} data-testid="present" className={cls.present}>
        <div data-testid="present-chapters" className={cls.chapters}>
          <label className={cls.menu}>
            Chapters
            <select value={c} onChange={(e) => go(Number(e.target.value), 0, 'draw')} className={`${inputClass} min-w-0 font-normal`}>
              {chapters.map((ch, i) => (
                <option key={ch.id} value={i}>
                  {i + 1}. {ch.title}
                </option>
              ))}
            </select>
          </label>
          <nav aria-label="Chapters" className={cls.rail}>
            <p className="text-[12px] font-semibold text-ink-3">Chapters</p>
            <ol className="mt-1.5 flex flex-col gap-0.5">
              {chapters.map((ch, i) => (
                <li key={ch.id}>
                  <button
                    type="button"
                    aria-current={i === c ? 'step' : undefined}
                    onClick={() => go(i, 0, 'draw')}
                    className={`w-full rounded-[6px] px-2 py-1 text-left text-[13px] focus-visible:outline-2 focus-visible:outline-slate ${i === c ? 'bg-selection font-semibold text-ink' : 'text-ink-2'}`}
                  >
                    {i + 1}. {ch.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <div className={cls.column}>
          <h3 className={cls.title}>
            {c + 1}. {chapter.title}
          </h3>
          <p data-testid="present-landscape-hint" className="mt-1 hidden text-[12.5px] text-ink-3 max-md:portrait:block">
            {SIDEWAYS}
          </p>
          <div className={cls.board}>
            <BoardView
              key={c}
              board={board}
              steps={drawn.state === 'loading' ? NO_STEPS : steps}
              step={at}
              animate={animate}
              replayKey={replayKey}
              message={drawn.state === 'loading' ? 'Drawing…' : chapter.drawing && !board ? NOTHING : null}
              fill={full}
            />
          </div>
          <p data-testid="present-step" className={cls.step}>
            Step {at + 1} of {steps.length}
          </p>
          <p data-testid="present-caption" aria-live="polite" className={cls.caption}>
            {step?.caption}
          </p>
          <div className={cls.buttons}>
            {/* At either end they wait, marked aria-disabled rather than disabled, so a focused one keeps the focus. */}
            <button
              type="button"
              data-testid="present-prev"
              aria-label="Previous step"
              aria-disabled={first || undefined}
              onClick={back}
              className={buttonClass({ size: 'sm', className: 'h-7 w-8 max-md:h-11 max-md:w-11' })}
            >
              <Chevron back />
            </button>
            <button
              type="button"
              data-testid="present-next"
              aria-label="Next step"
              aria-disabled={last || undefined}
              onClick={forward}
              className={buttonClass({ size: 'sm', className: 'h-7 w-8 max-md:h-11 max-md:w-11' })}
            >
              <Chevron />
            </button>
            <button type="button" data-testid="present-replay" onClick={replay} className={buttonClass({ size: 'sm', className: 'h-7' })}>
              Replay
            </button>
            {!full && (
              <button ref={fullButton} type="button" data-testid="present-fullscreen" onClick={enter} className={buttonClass({ size: 'sm', className: 'h-7' })}>
                Full screen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

Notes on it:
- `PresentView` only checks for a presenter; `Presenting` has the hooks, so none sits behind the early return.
- The board is keyed by chapter, so a new chapter mounts fresh, and the overlay is the same element as the inline frame (only its classes change), so entering full screen doesn't redraw what's already drawn.
- Present gives the board the chapter's steps and the step on show. `BoardView` works out what the step adds over the one before (`shownAt`), and draws only that, and only when the step was reached onwards. The notes and the frame are worked out once for the chapter, so nothing on the board moves between steps.
- In the page the board takes its chapter's shape (Task 3: `aspect-ratio` from the frame, 220 px to the window less 220), so the step line, the caption and the buttons move only between chapters, never between steps, and a wide drawing isn't a thin band in a tall box. Opening Present scrolls its top into view once (`scrollIntoView({ block: 'start' })`, skipped where it's missing, as in jsdom), so they're on screen with the board. Present's area is at least the window's height (`min-h-dvh`): otherwise, with a short first chapter and little under Present, the page couldn't scroll far enough, and a taller chapter later would put the caption below the fold. The caption holds two lines (`min-h-[2.75em]`), so a one-line caption after a two-line one doesn't move the buttons either. In full screen the board takes what's left (`flex-1`, `fill`).
- **Full screen on a short screen** (`[@media(max-height:500px)]`, a phone held sideways): the chapters' wrapper and the board's column become `contents`, so their children sit in one three-column grid: the menu and the title (with ✕ beside it) on top, the board, then the step, the caption (`line-clamp-2`) and the buttons in one row. The list beside the board needs 1,100 px wide and more than 500 px tall, in full screen.
- `useInertOutside` marks every sibling of the overlay and of each of its ancestors, up to `<body>`, `inert` while full screen is on (ProjectLayout's `<aside>`, the mobile bar, and the page around Present), and takes off exactly those marks after. With nothing else focusable, a browser takes Tab from the last control out of the page, so in full screen Tab from the last control goes to ✕, and Shift+Tab from ✕ to the last.

- [ ] **Step 6: Run the component tests**

Run:
```bash
pnpm vitest run packages/web/src/pages/defense packages/web/src/theme
pnpm --filter @dev-plumbing/web typecheck
```
Expected: PASS (`PresentView.test.tsx` 15, `DefensePage.test.tsx` 18, Study and Practice unchanged, `Board.test.tsx` 13; `palette.test.ts` passes).
- **If the keys move a step while the chapters menu or the export menu has the focus:** `typing` must look at `e.target.closest('input, textarea, select, [contenteditable]')`, as Practice does.
- **If Esc leaves full screen but the focus is on the page:** the Full screen button isn't there while the overlay is up, so the focus moves once it's back: `refocus` is set by `leave()` and read in the effect on `full`.

- [ ] **Step 7: Run everything**

Run:
```bash
pnpm vitest run packages/web
pnpm typecheck
pnpm test
pnpm --filter @dev-plumbing/web build
ls packages/web/dist/assets
pnpm test:e2e present
pnpm test:e2e
```
Expected: PASS (5 tests in `present.spec.ts`). `pnpm test` runs 976 tests in 105 files, 17 more than Task 3 left.
- The build has a `PresentView-<hash>.js` chunk of about 170 kB (Rough.js, Motion and the board), and the main `index-<hash>.js` stays about the size it was (about 730 kB).
- **If the e2e can't save the defense:** Task 1 checks every ref against the project's drawings. `architecture-system`'s parts are `node:job`, `node:db`, `node:sms`, `edge:reads`, `edge:sends` and `group:jobs`; the tables' are `table:RestockReminder`, `table:Subscription` and `link:RestockReminder.subscription`. A database item needs its `schemaDiff`, or its data doesn't parse and there are no tables to draw.
- **If the overlay's box isn't the window's:** nothing between `<main>` and the page sets `transform`, `filter` or `contain`, so `fixed inset-0` covers the viewport; check nothing new does.
- **If `document.fullscreenElement` stays set after Esc:** the browser's full screen can arrive after the overlay has gone; the `fullscreenchange` listener must leave it then.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/pages/defense packages/web/src/router.tsx packages/web/e2e/present.spec.ts
git commit -m "feat(web): Present the Whiteboard Defense as a hand-drawn whiteboard, chapter by chapter" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Built-in type ids are reserved

Plan changes and Defense ship in code, and until now a user's `plumbing/plan-changes.md` or `plumbing/defense.md` replaced them (Plan 5's "theirs wins"). From now on their ids are kept for them: `loadConfig` reports such a file as a config problem, with the header's exact copy, ignores it unread, and always adds the built-in types. The problem says what to do: a rules file's id must equal its file name, and the app can't rename or delete a file, so it says to rename the file and the id inside it, or delete it. The Settings page and the Rules page's "Files with problems" already list config problems, so neither needs a change. **+ Plumbing type** (`POST /api/rules`) refuses to make a type with either id, so the app never writes a file it would then report, and saving `plan-changes.md` or `defense.md` from the Rules page's editor (`PUT /api/rules/:file`) is refused with the problem's own words, since the file would stay ignored.

**Files:**
- Modify:
  - `packages/core/src/config.ts` (`RESERVED_TYPE_IDS` and `reservedType`; `loadConfig`'s rules-file loop and the built-in types)
  - `packages/service/src/routes/config.ts` (`POST /api/rules` refuses a built-in type's id, and `PUT /api/rules/:file` refuses to save a file that has one)
  - `packages/core/src/planChanges.ts` (two doc comments)
  - `packages/core/src/defenseType.ts` (one doc comment)
- Test:
  - `packages/core/test/config.test.ts` (Plan 5's "a rules file of yours replaces" checks become "is reported and the built-in is used")
  - `packages/service/test/config.test.ts` (three new tests)

**Interfaces:**
- Consumes:
  - `PLAN_CHANGES_TYPE` (`core/src/planChanges.ts`, id `plan-changes`, title "Plan changes") and `DEFENSE_TYPE` (`core/src/defenseType.ts`, id `defense`, title "Defense questions");
  - `ConfigProblem = { file: string; key?: string; message: string }` (`schemas/views.ts`);
  - `importableTypes(types)`, unchanged: it still filters out `builtIn` types and the two ids;
  - the service's `GET /api/rules`, which lists every problem whose `file` starts with `plumbing/` as `broken: { file, error }`, and `GET /api/config`, which returns `problems`;
  - the service's `POST /api/rules` (`service/src/routes/config.ts`), which checks the new type's id and title, then writes `plumbing/<id>.md` from `newRulesFileTemplate`.
- Produces:
  - `RESERVED_TYPE_IDS`, module-private in `config.ts`: a `Map<string, PlumbingType>` from `plan-changes` to `PLAN_CHANGES_TYPE` and from `defense` to `DEFENSE_TYPE`. (The header's Contract writes it as an object literal. A `Map` is used so that a rules file named after an `Object.prototype` key, such as `constructor.md`, can't match.)
  - `export function reservedType(id: string): PlumbingType | undefined` (`config.ts`, so from `@dev-plumbing/core`): the built-in type whose id this is, for the service's `POST /api/rules`.
  - `export function reservedIdProblem(id: string): string | null` (`config.ts`): the config problem's message for a rules file of this id, or null when the id isn't a built-in type's. `loadConfig` reports it, and the service's `PUT /api/rules/:file` refuses with it.
  - **The config problem**, for a rules file whose id is a built-in type's: `{ file: 'plumbing/<file>', message: 'The id "<id>" is kept for dev-plumbing\'s built-in <title> type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.' }`. Settings shows a problem as `<file>: <message>`, which is exactly the header's copy: ``plumbing/${file}: The id "${id}" is kept for dev-plumbing's built-in ${title} type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.`` The message starts with a capital because the Rules page's "Files with problems" shows it on its own line, under the file's name.
  - **The refusal**, when **+ Plumbing type** asks for either id: `400 { error: 'The id "<id>" is kept for dev-plumbing\'s built-in <title> type. Pick another.' }`, and nothing is written.
  - **Saving the file:** `PUT /api/rules/plan-changes.md` or `PUT /api/rules/defense.md` is `400 { error: <the config problem's message> }`, before anything else is checked, and nothing is written. The Rules page's editor shows the error, so opening the file from "Files with problems" and saving it says what to do. `GET` still reads it.
  - **The built-in types are always in `types`**: `PLAN_CHANGES_TYPE` first (order 0) and `DEFENSE_TYPE` last (order 100).
- **Behaviour:**
  - A rules file's id must match its file name (`parseRulesFile` already refuses any other), so the check is on the file name: `plan-changes.md` and `defense.md` are reserved whatever is in them, a broken one included. They aren't read.
  - `POST /api/rules` refuses `plan-changes` and `defense` after its id check and before its title check, so the file is never written. `PUT /api/rules/:file` refuses `plan-changes.md` and `defense.md` right after its file-name check, whether the file is there or not.
  - Nothing else changes: other rules files load as before, never built in, whatever their header says.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/config.test.ts`, replace:
```ts
  it('adds the built-in Plan changes type, which a rules file of yours replaces', async () => {
```
with:
```ts
  it('adds the built-in Plan changes type', async () => {
```

Then, in the same file, replace the end of that test and the whole test after it:
```ts
    expect(importableTypes(c.types).map((t) => t.id)).not.toContain('plan-changes');
    // Yours wins, and no rules file is built in, whatever its header says.
    await write('plumbing/plan-changes.md', '---\nid: plan-changes\ntitle: Repo changes\norder: 12\nscreen: list\nemptyMessage: None.\nbuiltIn: true\n---\n\n## Rules\n- Keep it short.\n');
    await write('plumbing/rollout.md', '---\nid: rollout\ntitle: Rollout\norder: 11\nscreen: list\nemptyMessage: None.\nbuiltIn: true\n---\n\n## Rules\n- Say who flips the flag.\n');
    const mine = await loadConfig(dir);
    expect(mine.problems).toEqual([]);
    expect(mine.types.filter((t) => t.id === 'plan-changes')).toEqual([expect.objectContaining({ title: 'Repo changes', file: 'plan-changes.md', builtIn: false })]);
    expect(mine.types.filter((t) => t.builtIn)).toEqual([DEFENSE_TYPE]);
    expect(importableTypes(mine.types).map((t) => t.id)).toContain('rollout');
  });

  it('never imports Plan changes, even from a rules file of yours', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('plumbing/plan-changes.md', '---\nid: plan-changes\ntitle: Repo changes\norder: 12\nscreen: list\nemptyMessage: None.\n---\n\n## Rules\n- Keep it short.\n');
    const c = await loadConfig(dir);
    expect(c.types.find((t) => t.id === 'plan-changes')).toMatchObject({ title: 'Repo changes', enabled: true, builtIn: false });
    expect(importableTypes(c.types).map((t) => t.id)).not.toContain('plan-changes');
    expect(importableTypes(c.types)).toHaveLength(10);
  });
```
with:
```ts
    expect(importableTypes(c.types).map((t) => t.id)).not.toContain('plan-changes');
    // No rules file is built in, whatever its header says.
    await write('plumbing/rollout.md', '---\nid: rollout\ntitle: Rollout\norder: 11\nscreen: list\nemptyMessage: None.\nbuiltIn: true\n---\n\n## Rules\n- Say who flips the flag.\n');
    const mine = await loadConfig(dir);
    expect(mine.problems).toEqual([]);
    expect(mine.types.find((t) => t.id === 'rollout')).toMatchObject({ file: 'rollout.md', builtIn: false });
    expect(mine.types.filter((t) => t.builtIn)).toEqual([PLAN_CHANGES_TYPE, DEFENSE_TYPE]);
    expect(importableTypes(mine.types).map((t) => t.id)).toContain('rollout');
  });

  it('a rules file with a built-in id is reported and the built-in is used', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('plumbing/plan-changes.md', '---\nid: plan-changes\ntitle: Repo changes\norder: 12\nscreen: list\nemptyMessage: None.\nbuiltIn: true\n---\n\n## Rules\n- Keep it short.\n');
    await write('plumbing/defense.md', '---\nid: defense\ntitle: Whiteboard questions\norder: 11\nscreen: list\nemptyMessage: None.\n---\n\n## Rules\n- Answer in a line.\n');
    const c = await loadConfig(dir);
    expect(c.problems).toEqual([
      { file: 'plumbing/defense.md', message: 'The id "defense" is kept for dev-plumbing\'s built-in Defense questions type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.' },
      { file: 'plumbing/plan-changes.md', message: 'The id "plan-changes" is kept for dev-plumbing\'s built-in Plan changes type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.' },
    ]);
    // As the Settings page shows it: the file, then the message.
    expect(c.problems.map((p) => `${p.file}: ${p.message}`)).toContain(
      'plumbing/plan-changes.md: The id "plan-changes" is kept for dev-plumbing\'s built-in Plan changes type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.',
    );
    // The built-in types are the ones used, first and last, and neither file is a type of its own.
    expect(c.types).toHaveLength(12);
    expect(c.types[0]).toEqual(PLAN_CHANGES_TYPE);
    expect(c.types.at(-1)).toEqual(DEFENSE_TYPE);
    expect(c.types.filter((t) => t.id === 'plan-changes' || t.id === 'defense')).toEqual([PLAN_CHANGES_TYPE, DEFENSE_TYPE]);
    expect(c.types.some((t) => t.file === 'plan-changes.md' || t.file === 'defense.md')).toBe(false);
    // Neither is ever offered to an importer.
    expect(importableTypes(c.types).map((t) => t.id)).not.toContain('plan-changes');
    expect(importableTypes(c.types).map((t) => t.id)).not.toContain('defense');
    expect(importableTypes(c.types)).toHaveLength(10);
  });

  it("reports a broken rules file with a built-in id the same way, without reading what's in it", async () => {
    await write('plumbing/plan-changes.md', 'no header at all');
    const c = await loadConfig(dir);
    expect(c.problems).toEqual([
      { file: 'plumbing/plan-changes.md', message: 'The id "plan-changes" is kept for dev-plumbing\'s built-in Plan changes type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.' },
    ]);
    expect(c.types).toEqual([PLAN_CHANGES_TYPE, DEFENSE_TYPE]);
  });
```

In the same file, replace:
```ts
  it('adds the built-in Defense type last, which a rules file of yours replaces, and never imports it', async () => {
```
with:
```ts
  it('adds the built-in Defense type last, and never imports it', async () => {
```
and replace the end of that test:
```ts
    expect(importableTypes(c.types).map((t) => t.id)).not.toContain('defense');
    // Yours wins, and is never imported either.
    await write('plumbing/defense.md', '---\nid: defense\ntitle: Whiteboard questions\norder: 11\nscreen: list\nemptyMessage: None.\n---\n\n## Rules\n- Answer in a line.\n');
    const mine = await loadConfig(dir);
    expect(mine.problems).toEqual([]);
    expect(mine.types.filter((t) => t.id === 'defense')).toEqual([expect.objectContaining({ title: 'Whiteboard questions', file: 'defense.md', builtIn: false })]);
    expect(mine.types.filter((t) => t.builtIn)).toEqual([PLAN_CHANGES_TYPE]);
    expect(importableTypes(mine.types).map((t) => t.id)).not.toContain('defense');
    expect(importableTypes(mine.types)).toHaveLength(10);
  });
```
with:
```ts
    expect(importableTypes(c.types).map((t) => t.id)).not.toContain('defense');
  });
```

In `packages/service/test/config.test.ts`, replace:
```ts
  it('creates a new plumbing type once', async () => {
```
with:
```ts
  it("lists a rules file that takes a built-in type's id as a file with problems, and keeps the built-in type", async () => {
    const { ctx } = await makeContext();
    await fs.writeFile(path.join(ctx.configDir, 'plumbing', 'plan-changes.md'), '---\nid: plan-changes\ntitle: Repo changes\norder: 12\nscreen: list\nemptyMessage: None.\n---\n\n## Rules\n- Keep it short.\n');
    const app = createApp(ctx);
    const message = 'The id "plan-changes" is kept for dev-plumbing\'s built-in Plan changes type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.';
    const rules = (await (await call(app, '/api/rules')).json()) as { types: { id: string }[]; broken: unknown[] };
    expect(rules.broken).toEqual([{ file: 'plan-changes.md', error: message }]);
    expect(rules.types.map((t) => t.id)).not.toContain('plan-changes');
    expect(rules.types).toHaveLength(10);
    const config = (await (await call(app, '/api/config')).json()) as { problems: unknown[] };
    expect(config.problems).toEqual([{ file: 'plumbing/plan-changes.md', message }]);
  });

  it("won't make a new plumbing type with a built-in type's id, and writes nothing", async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    for (const [id, title] of [
      ['plan-changes', 'Plan changes'],
      ['defense', 'Defense questions'],
    ]) {
      const res = await call(app, '/api/rules', post({ id, title: 'Mine' }));
      expect(res.status, id).toBe(400);
      expect(await res.json()).toEqual({ error: `The id "${id}" is kept for dev-plumbing's built-in ${title} type. Pick another.` });
      await expect(fs.access(path.join(ctx.configDir, 'plumbing', `${id}.md`)), id).rejects.toThrow();
    }
    expect(((await (await call(app, '/api/config')).json()) as { problems: unknown[] }).problems).toEqual([]);
  });

  it("won't save a rules file that takes a built-in type's id, and says what to do instead", async () => {
    const { ctx } = await makeContext();
    const file = path.join(ctx.configDir, 'plumbing', 'plan-changes.md');
    const text = '---\nid: plan-changes\ntitle: Repo changes\norder: 12\nscreen: list\nemptyMessage: None.\n---\n\n## Rules\n- Keep it short.\n';
    await fs.writeFile(file, text);
    const app = createApp(ctx);
    // "Files with problems" opens it, and it still reads.
    expect(((await (await call(app, '/api/rules/plan-changes.md')).json()) as { text: string }).text).toBe(text);
    for (const [name, title] of [
      ['plan-changes.md', 'Plan changes'],
      ['defense.md', 'Defense questions'],
    ]) {
      const id = name.replace('.md', '');
      const res = await call(app, `/api/rules/${name}`, put({ text: text.replace('Keep it short.', 'Keep it shorter.') }));
      expect(res.status, name).toBe(400);
      expect(await res.json()).toEqual({
        error: `The id "${id}" is kept for dev-plumbing's built-in ${title} type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.`,
      });
    }
    expect(await fs.readFile(file, 'utf8')).toBe(text);
    await expect(fs.access(path.join(ctx.configDir, 'plumbing', 'defense.md'))).rejects.toThrow();
  });

  it('creates a new plumbing type once', async () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/config.test.ts packages/service/test/config.test.ts`
Expected: FAIL, 5 tests:
- "a rules file with a built-in id is reported and the built-in is used" and "reports a broken rules file with a built-in id the same way…" (core), and "lists a rules file that takes a built-in type's id…" (service). None gets the reserved-id problem (they get `[]`, or the broken file's own header problem), because a user's `plan-changes.md` still replaces the built-in type.
- "won't make a new plumbing type with a built-in type's id…" (service): `POST /api/rules` makes `plan-changes.md` (`expected 201 to be 400`).
- "won't save a rules file that takes a built-in type's id…" (service): `PUT` saves it (`expected 200 to be 400`).

- [ ] **Step 3: Reserve the ids in `loadConfig`**

In `packages/core/src/config.ts`, replace:
```ts
const isMissing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';
```
with:
```ts
/**
 * The built-in types, by id. Their ids are kept for them: a rules file of that id is reported and ignored, and the
 * built-in type is used.
 */
const RESERVED_TYPE_IDS = new Map<string, PlumbingType>([
  [PLAN_CHANGES_TYPE.id, PLAN_CHANGES_TYPE],
  [DEFENSE_TYPE.id, DEFENSE_TYPE],
]);

/** The built-in type whose id this is, or undefined. The service asks too, before it makes a new plumbing type. */
export function reservedType(id: string): PlumbingType | undefined {
  return RESERVED_TYPE_IDS.get(id);
}

/**
 * What's wrong with a rules file whose id (its file name) is a built-in type's, and what to do about it, or null. A
 * file's id must equal its name and the app can't rename or delete one, so it says how. loadConfig reports it, and
 * the service refuses to save such a file with it.
 */
export function reservedIdProblem(id: string): string | null {
  const reserved = reservedType(id);
  return reserved
    ? `The id "${id}" is kept for dev-plumbing's built-in ${reserved.title} type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.`
    : null;
}

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';
```

In `loadConfig`, replace:
```ts
  const results: RulesFileResult[] = [];
  for (const f of await listFiles(path.join(dir, 'plumbing'), '.md', 'plumbing', problems)) {
    const fileContent = await readText(path.join(dir, 'plumbing', f), `plumbing/${f}`, problems);
    const parsed = parseRulesFile(f, fileContent ?? '');
    // A rules file is the user's, so it's never built in, whatever its header says.
    results.push(parsed.ok ? { ...parsed, type: { ...parsed.type, builtIn: false } } : parsed);
  }
  // Plan changes and Defense ship in code. The user's own plumbing/plan-changes.md or plumbing/defense.md, when it
  // loads, replaces the built-in one.
  for (const builtIn of [PLAN_CHANGES_TYPE, DEFENSE_TYPE]) {
    if (!results.some((r) => r.ok && r.type.id === builtIn.id)) results.push({ ok: true, type: builtIn });
  }
  const { types, errors } = resolveTypes(results);
```
with:
```ts
  const results: RulesFileResult[] = [];
  for (const f of await listFiles(path.join(dir, 'plumbing'), '.md', 'plumbing', problems)) {
    // A rules file's id is its file name, so plumbing/plan-changes.md or plumbing/defense.md would take a built-in
    // type's id. It's reported and ignored, unread, whatever is in it.
    const reserved = reservedIdProblem(f.replace(/\.md$/, ''));
    if (reserved) {
      problems.push({ file: `plumbing/${f}`, message: reserved });
      continue;
    }
    const fileContent = await readText(path.join(dir, 'plumbing', f), `plumbing/${f}`, problems);
    const parsed = parseRulesFile(f, fileContent ?? '');
    // A rules file is the user's, so it's never built in, whatever its header says.
    results.push(parsed.ok ? { ...parsed, type: { ...parsed.type, builtIn: false } } : parsed);
  }
  // Plan changes and Defense ship in code, and are always there.
  for (const builtIn of RESERVED_TYPE_IDS.values()) results.push({ ok: true, type: builtIn });
  const { types, errors } = resolveTypes(results);
```
(`PlumbingType` is already imported from `./schemas`, and `PLAN_CHANGES_TYPE` and `DEFENSE_TYPE` are already imported.)

- [ ] **Step 4: + Plumbing type refuses a built-in id**

In `packages/service/src/routes/config.ts`, add `reservedIdProblem` and `reservedType` to the `@dev-plumbing/core` import. Replace:
```ts
  resetToDefault,
  settingsFields,
```
with:
```ts
  reservedIdProblem,
  reservedType,
  resetToDefault,
  settingsFields,
```
and in `POST /rules`, replace:
```ts
    if (!/^[a-z][a-z0-9-]*$/.test(id)) return c.json({ error: 'Use lowercase letters, numbers and dashes for the id, starting with a letter.' }, 400);
    if (!title) return c.json({ error: 'Give the plumbing type a title.' }, 400);
```
with:
```ts
    if (!/^[a-z][a-z0-9-]*$/.test(id)) return c.json({ error: 'Use lowercase letters, numbers and dashes for the id, starting with a letter.' }, 400);
    // Plan changes and Defense keep their ids: loadConfig would only report a rules file that took one.
    const builtIn = reservedType(id);
    if (builtIn) return c.json({ error: `The id "${id}" is kept for dev-plumbing's built-in ${builtIn.title} type. Pick another.` }, 400);
    if (!title) return c.json({ error: 'Give the plumbing type a title.' }, 400);
```
and in the `PUT` for each file, replace:
```ts
    r.put(`/${segment}/:file`, async (c) => {
      const file = c.req.param('file');
      if (!FILE.test(file)) return c.json({ error: 'Unknown file.' }, 404);
```
with:
```ts
    r.put(`/${segment}/:file`, async (c) => {
      const file = c.req.param('file');
      if (!FILE.test(file)) return c.json({ error: 'Unknown file.' }, 404);
      // plumbing/plan-changes.md and plumbing/defense.md stay ignored whatever they say, so saving one is refused with
      // what to do instead.
      const reserved = folder === 'plumbing' ? reservedIdProblem(file.replace(/\.md$/, '')) : null;
      if (reserved) return c.json({ error: reserved }, 400);
```

- [ ] **Step 5: Say so where the built-in types are defined**

In `packages/core/src/planChanges.ts`, replace:
```ts
/**
 * Plan changes ships in code, not as a rules file: it needs no setup, and it's never imported, listed among the rules
 * files or turned off. loadConfig adds it, unless the user has their own plumbing/plan-changes.md.
 */
```
with:
```ts
/**
 * Plan changes ships in code, not as a rules file: it needs no setup, and it's never imported, listed among the rules
 * files or turned off. loadConfig always adds it, and its id is kept for it: a plumbing/plan-changes.md is reported and
 * ignored.
 */
```
and replace:
```ts
/**
 * The types an import (or a re-import) runs an importer for: the enabled ones that aren't built in. Plan changes items
 * are made by an update and Defense items by the Whiteboard Defense page, never by an importer, so a user's own
 * plan-changes.md or defense.md isn't imported either.
 */
```
with:
```ts
/**
 * The types an import (or a re-import) runs an importer for: the enabled ones that aren't built in. Plan changes items
 * are made by an update and Defense items by the Whiteboard Defense page, never by an importer.
 */
```
(`importableTypes`'s code stays as it is.)

In `packages/core/src/defenseType.ts`, replace:
```ts
 * type, and the navigation shows it only once the project has a Defense item. loadConfig adds it, unless the user has
 * their own plumbing/defense.md.
 */
```
with:
```ts
 * type, and the navigation shows it only once the project has a Defense item. loadConfig always adds it, and its id is
 * kept for it: a plumbing/defense.md is reported and ignored.
 */
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/core/test/config.test.ts packages/service/test/config.test.ts`
Expected: PASS (22 and 24 tests).

Run: `pnpm typecheck && pnpm test`
Expected: PASS (980 tests in 105 files, four more than before this task).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/config.ts packages/service/src/routes/config.ts packages/core/src/planChanges.ts packages/core/src/defenseType.ts packages/core/test/config.test.ts packages/service/test/config.test.ts
git commit -m "fix(core): built-in plumbing type ids are reserved, and a rules file that takes one is reported" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The finalizer's pack stays small on a big plan

The finalizer's `dp_context` result inlines the rules file, the whole draft, the last final and every item's full body, so on a big plan it can pass the size an MCP tool result may have. It gets the whiteboard pack's fix: the three big texts become files the finalizer Reads (`rulesFile`, `draftFile`, `previousFinalFile`), and each item comes with its own `file` and a body cut to 800 characters with the same "Read file for the rest" wording. The service picks the rules file as it does the whiteboard's, through one shared helper, and `finalizer.md` Reads the files before writing, in parts when one is long, and Reads the `file` of every item whose body was cut short before it writes that item's part: the final is what gets built, so it's never written from the first 800 characters.

**Files:**
- Modify:
  - `packages/core/src/store/context.ts` (the `fs` import; `FinalizePack`; `planItems`'s `listed` gains `file`; `finalizePack`)
  - `packages/service/src/routes/claude.ts` (one `outputRulesFile` helper for both rules files; `/context { finalize: true }`)
  - `plugin/agents/finalizer.md` (step 1, step 2's first line, step 4)
- Test:
  - `packages/core/test/finalizePack.test.ts`
  - `packages/core/test/defenseType.test.ts` (it calls `finalizePack`, so it passes `rulesFile`)
  - `packages/service/test/finalize.test.ts`
  - `packages/mcp/test/plugin.test.ts`
  - `packages/mcp/test/bridge.integration.test.ts`
  - `packages/core/test/whiteboardPack.test.ts` and `packages/core/test/context.test.ts` (unchanged: they must still pass)

**Interfaces:**
- Consumes:
  - in `context.ts`: the module-private `planItems(o)`, which `finalizePack` and `whiteboardPack` share; `BODY_MAX` (800) and `CLIPPED` (`'… (clipped: Read file for the rest)'`), declared above `whiteboardPack`; `docPath`, `projectFiles`, `readProjectFile`;
  - in `claude.ts`: `whiteboardRulesFile()`, used by `/context { whiteboard: true }` and `/whiteboard`, whose name and behaviour stay.
- Produces, as in the header's Contracts:
  ```ts
  // store/context.ts: FinalizePack's changed fields. project, decisions, defaults, openItems, conventions and tokens are as before.
  rulesFile: string;                  // was rules: string. Absolute: the rules file the service picked, to Read
  draftFile: string;                  // was draft: string. Absolute: docPath(dir, project.docs.draft)
  items[number].file: string;         // new: the item's own JSON, absolute
  previousFinalFile: string | null;   // was previousFinal: string | null. Absolute: docs.final (or docs/final.md) when that file exists
  export async function finalizePack(o: { dir: string; types: PlumbingType[]; profile?: RepoProfile; rulesFile: string }): Promise<FinalizePack>;
  ```
  - `items[].file` is `path.resolve(projectFiles(dir).item(id))`. It's set in `planItems`, so `whiteboardPack`'s items, which already set the same `file`, are unchanged.
  - `items[].body` is cut to 800 characters, then `… (clipped: Read file for the rest)`, in `finalizePack` only. A body of 800 characters or fewer is as it is.
  - `rules`, `draft` and `previousFinal` are gone from the pack.
- **The agent:** `finalizer.md` Reads `rulesFile` and `draftFile` whole ("in parts, with offset and limit, when it's long", since Read refuses a file past its size limit), `previousFinalFile` when it's set, and the `file` of every item whose body is cut short, before it writes that item's part of the final.
- **Service:** `/context { finalize: true }` passes `rulesFile`: `<configDir>/outputs/finalize.md` when it exists, else `<defaultsDir>/outputs/finalize.md`, both resolved to absolute paths, exactly as for `whiteboard-defense.md`.
- **This task doesn't touch `whiteboardPack`,** nor the `WhiteboardPack` type, nor `BODY_MAX`/`CLIPPED`: `finalizePack` uses the two constants from inside its body (they're declared further down the module, which is fine for a function called after the module loads).

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/finalizePack.test.ts`, replace:
```ts
const RULES = '# Finalize spec rules\n\n## Rules\n\n- Never invent behaviour.\n';
```
with:
```ts
/** The rules file the service picked. The pack only names it: the finalizer Reads it. */
const RULES_FILE = '/Users/you/.dev-plumbing/outputs/finalize.md';
const CLIPPED = '… (clipped: Read file for the rest)';
```

Replace the first test:
```ts
  it('gives the finalizer the rules, the draft, the project and the earlier final', async () => {
    const dir = await seed();
    const pack = await finalizePack({ dir, types, profile, rules: RULES });
    expect(pack.project).toEqual({ repo: 'acme', id: 'restock', title: 'Restock reminders', sourcePath: 'docs/specs/restock.md', name: 'restock' });
    expect(pack.rules).toBe(RULES);
    expect(pack.draft).toBe(DRAFT);
    expect(pack.conventions).toEqual(['Ids use uuid()']);
    expect(pack.previousFinal).toBe('# Restock reminders\n\nThe first final.\n');
  });
```
with:
```ts
  it('gives the finalizer the rules, the draft and the earlier final as files to Read, and the project', async () => {
    const dir = await seed();
    const pack = await finalizePack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.project).toEqual({ repo: 'acme', id: 'restock', title: 'Restock reminders', sourcePath: 'docs/specs/restock.md', name: 'restock' });
    expect(pack.rulesFile).toBe(RULES_FILE);
    expect(pack.draftFile).toBe(path.join(dir, 'docs', 'draft.md'));
    expect(await fs.readFile(pack.draftFile, 'utf8')).toBe(DRAFT);
    expect(pack.previousFinalFile).toBe(path.join(dir, 'docs', 'final.md'));
    expect(await fs.readFile(pack.previousFinalFile!, 'utf8')).toBe('# Restock reminders\n\nThe first final.\n');
    expect(pack.conventions).toEqual(['Ids use uuid()']);
    // The texts themselves aren't in the pack any more.
    for (const key of ['rules', 'draft', 'previousFinal']) expect(pack).not.toHaveProperty(key);
  });

  it("names no earlier final when there isn't one, or its file is gone", async () => {
    const dir = await seed();
    await fs.rm(path.join(dir, 'docs', 'final.md'));
    expect((await finalizePack({ dir, types, rulesFile: RULES_FILE })).previousFinalFile).toBeNull();
  });
```

In the second test, replace:
```ts
      codeRefs: [{ path: 'apps/worker/jobs/restock.ts', verified: true }],
      dataSummary: 'System diagram: 3 boxes, 2 groups',
    });
```
with:
```ts
      codeRefs: [{ path: 'apps/worker/jobs/restock.ts', verified: true }],
      dataSummary: 'System diagram: 3 boxes, 2 groups',
      file: path.join(dir, 'items', 'architecture-system.json'),
    });
```

Replace the last test:
```ts
  it('works for a project with nothing decided, no profile and no earlier final', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Who gets reminders?' })] });
    expect(await finalizePack({ dir, types, rules: RULES })).toEqual({
      project: { repo: 'acme', id: 'restock', title: 'Restock reminders', sourcePath: 'docs/specs/restock.md', name: 'restock' },
      rules: RULES,
      draft: DRAFT,
      items: [{ id: 'q1', type: 'questions', typeTitle: 'Questions', title: 'Who gets reminders?', summary: 'A summary.', body: null, fields: {}, status: 'your_turn', codeRefs: [], dataSummary: null }],
      decisions: [],
      defaults: [],
      openItems: [{ itemId: 'q1', title: 'Who gets reminders?', typeTitle: 'Questions' }],
      conventions: [],
      tokens: [],
      previousFinal: null,
    });
  });
```
with:
```ts
  it('works for a project with nothing decided, no profile and no earlier final', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Who gets reminders?' })] });
    expect(await finalizePack({ dir, types, rulesFile: RULES_FILE })).toEqual({
      project: { repo: 'acme', id: 'restock', title: 'Restock reminders', sourcePath: 'docs/specs/restock.md', name: 'restock' },
      rulesFile: RULES_FILE,
      draftFile: path.join(dir, 'docs', 'draft.md'),
      items: [
        {
          id: 'q1',
          type: 'questions',
          typeTitle: 'Questions',
          title: 'Who gets reminders?',
          summary: 'A summary.',
          body: null,
          fields: {},
          status: 'your_turn',
          codeRefs: [],
          dataSummary: null,
          file: path.join(dir, 'items', 'q1.json'),
        },
      ],
      decisions: [],
      defaults: [],
      openItems: [{ itemId: 'q1', title: 'Who gets reminders?', typeTitle: 'Questions' }],
      conventions: [],
      tokens: [],
      previousFinalFile: null,
    });
  });

  it("cuts a long body to 800 characters, and says to Read the item's file for the rest", async () => {
    const long = pair('q-long', { title: 'Long one' });
    const exact = pair('q-exact', { title: 'Exactly 800' });
    const body = 'The reminder job reads the subscriptions table. '.repeat(50);
    const dir = await seedProject({ pairs: [{ ...long, item: { ...long.item, body } }, { ...exact, item: { ...exact.item, body: 'x'.repeat(800) } }] });
    const pack = await finalizePack({ dir, types, rulesFile: RULES_FILE });
    const byId = new Map(pack.items.map((i) => [i.id, i]));
    expect(byId.get('q-long')!.body).toBe(`${body.slice(0, 800)}${CLIPPED}`);
    expect(byId.get('q-exact')!.body).toBe('x'.repeat(800));
    // The whole body is in the item's file.
    expect(JSON.parse(await fs.readFile(byId.get('q-long')!.file, 'utf8')).body).toBe(body);
  });

  it('stays small on a big plan: 40 items with long bodies, five of them drawn', async () => {
    const BIG_DIAGRAM = {
      kind: 'system',
      groups: [],
      nodes: ['job', 'db', 'mailer', 'queue', 'log', 'admin'].map((id) => ({ id, label: `The ${id} box`, status: 'new' })),
      edges: ['db', 'mailer', 'queue', 'log', 'admin'].map((to, i) => ({ id: `e${i}`, from: 'job', to, label: `job to ${to}` })),
    };
    const sentence = 'The reminder job reads the subscriptions table and sends one email per subscription that is due. ';
    const pairs = Array.from({ length: 40 }, (_, i) => {
      const drawnOne = i < 5;
      const id = drawnOne ? `architecture-view-${i + 1}` : `q-${i + 1}`;
      const p = pair(id, { type: drawnOne ? 'architecture' : 'questions', title: drawnOne ? `View ${i + 1}` : `Question ${i + 1}?` });
      return { item: { ...p.item, body: `${i + 1}. ${sentence.repeat(60)}`.slice(0, 5000), ...(drawnOne ? { data: BIG_DIAGRAM } : {}) }, thread: p.thread };
    });
    const dir = await seedProject({ pairs, draft: `${DRAFT}\n${sentence.repeat(1500)}\n` });
    const pack = await finalizePack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.items).toHaveLength(40);
    for (const item of pack.items) expect(item.body).toHaveLength(800 + CLIPPED.length);
    // The 150,000-character draft is a file to Read, so it isn't counted here.
    expect(JSON.stringify(pack).length).toBeLessThan(60_000);
  });
```

Then, in every other `finalizePack` call in the file (there are seven: in the tests about the items, decisions, defaults, disabled types and Plan changes), replace `rules: RULES })` with `rulesFile: RULES_FILE })`. No `RULES` is left in the file.

In `packages/core/test/defenseType.test.ts`, replace:
```ts
const RULES = '# Finalize spec rules\n';
```
with:
```ts
const RULES_FILE = '/Users/you/.dev-plumbing/outputs/finalize.md';
```
and replace:
```ts
      const pack = await finalizePack({ dir, types, rules: RULES });
```
with:
```ts
      const pack = await finalizePack({ dir, types, rulesFile: RULES_FILE });
```

In `packages/service/test/finalize.test.ts`, replace:
```ts
import { call, makeContext, removeTempDirs } from './helpers';
```
with:
```ts
import { call, DEFAULTS_DIR, makeContext, removeTempDirs } from './helpers';
```
replace:
```ts
    const pack = await t.claude('/context', { ...base, finalize: true });
    expect(pack.status).toBe(200);
    expect(pack.body.rules).toContain('# Finalize spec rules');
    expect(pack.body.project).toMatchObject({ repo: 'acme-app', id: 'restock-reminders', name: 'restock-reminders' });
    expect(pack.body.draft).toContain('Log one row per reminder sent.');
```
with:
```ts
    const pack = await t.claude('/context', { ...base, finalize: true });
    expect(pack.status).toBe(200);
    // The rules and the draft are files the finalizer Reads.
    expect(await fs.readFile(pack.body.rulesFile, 'utf8')).toContain('# Finalize spec rules');
    expect(pack.body.project).toMatchObject({ repo: 'acme-app', id: 'restock-reminders', name: 'restock-reminders' });
    expect(await fs.readFile(pack.body.draftFile, 'utf8')).toContain('Log one row per reminder sent.');
    expect(pack.body.previousFinalFile).toBeNull();
```
and replace:
```ts
  it('finalizing again shows the changes since the last final, and Discard clears the proposal', async () => {
```
with:
```ts
  it("names the user's outputs/finalize.md, or the shipped one when theirs is gone, and the last final once there is one", async () => {
    const t = await setup();
    await unblock(t);
    const mine = path.join(t.ctx.configDir, 'outputs', 'finalize.md');
    const pack = async () => (await t.claude('/context', { ...base, finalize: true })).body;
    expect((await pack()).rulesFile).toBe(mine);
    const first = await pickedUp(t);
    expect((await t.claude('/finalize', { ...base, request: first, markdown: FINAL })).status).toBe(200);
    expect((await t.send('POST', `${P}/finalize/accept`, { clone: t.repo })).status).toBe(200);
    const after = await pack();
    expect(after.previousFinalFile).toBe(path.join(t.dir, 'docs', 'final.md'));
    expect(await fs.readFile(after.previousFinalFile, 'utf8')).toContain('# Restock reminders');
    await fs.rm(mine);
    expect((await pack()).rulesFile).toBe(path.join(DEFAULTS_DIR, 'outputs', 'finalize.md'));
  });

  it('finalizing again shows the changes since the last final, and Discard clears the proposal', async () => {
```

In `packages/mcp/test/plugin.test.ts`, in the test "has a finalizer that writes the final through dp_finalize, placing tokens instead of drawing", replace:
```ts
    for (const s of [
      'finalize: true',
      '`rules`',
      '`tokens`',
      '`previousFinal`',
```
with:
```ts
    for (const s of [
      'finalize: true',
      '`rulesFile`',
      '`draftFile`',
      '`tokens`',
      '`previousFinalFile`',
      // The big texts are files, and long bodies are cut short, so the pack stays small on a big plan.
      'Before you write anything, Read `rulesFile` and `draftFile`, each one whole (in parts, with offset and limit, when it\'s long), and `previousFinalFile` when it isn\'t null.',
      // The final is what gets built, so no part of it is written from a clipped body.
      'A body over 800 characters is cut short and ends `… (clipped: Read file for the rest)`.',
      'Read the `file` of every item whose body is cut short before you write its part of the final.',
```
and replace:
```ts
    expect(finalizer).not.toContain('anywhere else');
```
with:
```ts
    expect(finalizer).not.toContain('anywhere else');
    for (const gone of ['- `rules`:', '- `draft`:', '- `previousFinal`:']) expect(finalizer).not.toContain(gone);
```

In `packages/mcp/test/bridge.integration.test.ts`, in "hands a finalize to the window and takes the final back", replace:
```ts
  const pack = json(await mcp.callTool({ name: 'dp_context', arguments: { repo: 'acme-app', project: 'restock-reminders', finalize: true } }));
  expect(pack.rules).toMatch(/^# Finalize spec rules/);
```
with:
```ts
  const pack = json(await mcp.callTool({ name: 'dp_context', arguments: { repo: 'acme-app', project: 'restock-reminders', finalize: true } }));
  // The finalizer Reads the rules file and the draft the pack names. There's no earlier final yet.
  expect(fs.readFileSync(pack.rulesFile, 'utf8')).toMatch(/^# Finalize spec rules/);
  expect(fs.readFileSync(pack.draftFile, 'utf8')).toMatch(/^# Restock reminders/);
  expect(pack.previousFinalFile).toBeNull();
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/finalizePack.test.ts packages/core/test/defenseType.test.ts packages/service/test/finalize.test.ts packages/mcp/test/plugin.test.ts`
Expected: FAIL. In `finalizePack.test.ts`, every test that reads `rulesFile`, `draftFile`, `previousFinalFile`, `file` or the clipped body (6 of 11; the pack still has `rules`, `draft` and full bodies); in `finalize.test.ts`, the two tests that read `rulesFile` ("The "path" argument must be of type string… Received undefined", or `undefined` where a path is expected); in `plugin.test.ts`, the finalizer test (`finalizer.md` doesn't contain `` `rulesFile` ``). `defenseType.test.ts` still passes.

- [ ] **Step 3: Give the pack files and clipped bodies**

In `packages/core/src/store/context.ts`, replace:
```ts
import path from 'node:path';
import { DEFENSE, defenseThreadIds } from '../defenseType';
```
with:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFENSE, defenseThreadIds } from '../defenseType';
```

Replace the start of the `FinalizePack` type:
```ts
export type FinalizePack = {
  project: { repo: string; id: string; title: string; sourcePath: string; name: string };
  /** outputs/finalize.md: the final's structure and rules. */
  rules: string;
  draft: string;
  /**
   * Every item that goes into the final, in plumbing-type order. Parked items, items of disabled types, Plan changes
   * items (what they settled is already in the draft) and Defense items (questions about the Whiteboard Defense) are
   * left out of the final, so they aren't here.
   */
  items: {
    id: string;
    type: string;
    typeTitle: string;
    title: string;
    summary: string;
    body: string | null;
    fields: Record<string, string>;
    status: DisplayStatus;
    codeRefs: CodeRef[];
    dataSummary: string | null;
  }[];
```
with:
```ts
/**
 * What the finalizer reads. The big texts are files it Reads, not text in the pack, so the pack stays well under the
 * size an MCP tool result may have, whatever the size of the plan.
 */
export type FinalizePack = {
  project: { repo: string; id: string; title: string; sourcePath: string; name: string };
  /** outputs/finalize.md, or the shipped one when the user's is missing: the final's structure and rules. */
  rulesFile: string;
  /** The draft, with every accepted change in it. */
  draftFile: string;
  /**
   * Every item that goes into the final, in plumbing-type order. Parked items, items of disabled types, Plan changes
   * items (what they settled is already in the draft) and Defense items (questions about the Whiteboard Defense) are
   * left out of the final, so they aren't here. `file` is the item's own JSON, to Read for anything cut short here.
   * In finalizePack, `body` is cut to 800 characters.
   */
  items: {
    id: string;
    type: string;
    typeTitle: string;
    title: string;
    summary: string;
    body: string | null;
    fields: Record<string, string>;
    status: DisplayStatus;
    codeRefs: CodeRef[];
    dataSummary: string | null;
    file: string;
  }[];
```
and its end:
```ts
  /** The tokens the finalizer may use for diagrams, flows, schema blocks, migrations and mockup links, one per line. */
  tokens: string[];
  previousFinal: string | null;
};
```
with:
```ts
  /** The tokens the finalizer may use for diagrams, flows, schema blocks, migrations and mockup links, one per line. */
  tokens: string[];
  /** The last accepted final, or null when there's none. */
  previousFinalFile: string | null;
};
```

In `planItems`, replace:
```ts
      codeRefs: i.codeRefs ?? [],
      dataSummary: dataSummary(i, typeOf(i)),
    })),
```
with:
```ts
      codeRefs: i.codeRefs ?? [],
      dataSummary: dataSummary(i, typeOf(i)),
      file: path.resolve(projectFiles(o.dir).item(i.id)),
    })),
```

Replace `finalizePack` with its doc comment:
```ts
/**
 * What the finalizer receives: the output rules, the whole draft, every item that goes into the final with a summary of
 * its drawing, the decisions with their why, the defaults that will be used, the items still open, the repo's
 * conventions, the tokens it may place, and the previous final. `rules` is read by the service from the config folder.
 */
export async function finalizePack(o: { dir: string; types: PlumbingType[]; profile?: RepoProfile; rules: string }): Promise<FinalizePack> {
  const project = await readProjectFile(o.dir);
  const plan = await planItems(o);
  return {
    project: { repo: project.repo, id: project.id, title: project.title, sourcePath: project.source.path, name: finalName(project.source.path) },
    rules: o.rules,
    draft: await readDocText(o.dir, project.docs.draft),
    items: plan.listed,
    decisions: plan.decisions,
    defaults: plan.defaults,
    openItems: plan.openItems,
    conventions: o.profile?.conventions ?? [],
    tokens: availableTokens(plan.items, o.types),
    previousFinal: await readDocText(o.dir, project.docs.final ?? 'docs/final.md').catch(() => null),
  };
}
```
with:
```ts
/**
 * What the finalizer receives: the output rules, the draft and the previous final as files to Read, every item that
 * goes into the final with its file, its body cut short and a summary of its drawing, the decisions with their why, the
 * defaults that will be used, the items still open, the repo's conventions and the tokens it may place. `rulesFile` is
 * the rules file the service picked: the user's, or the shipped one.
 */
export async function finalizePack(o: { dir: string; types: PlumbingType[]; profile?: RepoProfile; rulesFile: string }): Promise<FinalizePack> {
  const project = await readProjectFile(o.dir);
  const plan = await planItems(o);
  // Bodies are cut as the whiteboard pack's are (BODY_MAX and CLIPPED, below): the finalizer Reads the item's file for the rest.
  const clipped = (body: string | null) => (body !== null && body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}${CLIPPED}` : body);
  const finalFile = docPath(o.dir, project.docs.final ?? 'docs/final.md');
  return {
    project: { repo: project.repo, id: project.id, title: project.title, sourcePath: project.source.path, name: finalName(project.source.path) },
    rulesFile: o.rulesFile,
    draftFile: docPath(o.dir, project.docs.draft),
    items: plan.listed.map((entry) => ({ ...entry, body: clipped(entry.body) })),
    decisions: plan.decisions,
    defaults: plan.defaults,
    openItems: plan.openItems,
    conventions: o.profile?.conventions ?? [],
    tokens: availableTokens(plan.items, o.types),
    previousFinalFile: (await fs.access(finalFile).then(() => true, () => false)) ? finalFile : null,
  };
}
```
(`readDocText` is still used by `threadPack` and `importPack`, so its import stays.)

- [ ] **Step 4: One helper for both rules files in the service**

In `packages/service/src/routes/claude.ts`, replace:
```ts
  /** outputs/finalize.md from the config folder, or the shipped default when the user's copy is missing. */
  const finalizeRules = () =>
    fs.readFile(path.join(ctx.configDir, 'outputs', 'finalize.md'), 'utf8').catch(() => fs.readFile(path.join(ctx.defaultsDir, 'outputs', 'finalize.md'), 'utf8'));
  /** outputs/whiteboard-defense.md in the config folder, or the shipped default when the user's copy is missing. */
  const whiteboardRulesFile = async () => {
    const mine = path.resolve(ctx.configDir, 'outputs', 'whiteboard-defense.md');
    return (await fs.access(mine).then(() => true, () => false)) ? mine : path.resolve(ctx.defaultsDir, 'outputs', 'whiteboard-defense.md');
  };
```
with:
```ts
  /** outputs/<name> in the config folder, or the shipped default when the user's copy is missing: the file a subagent Reads. */
  const outputRulesFile = async (name: 'finalize.md' | 'whiteboard-defense.md') => {
    const mine = path.resolve(ctx.configDir, 'outputs', name);
    return (await fs.access(mine).then(() => true, () => false)) ? mine : path.resolve(ctx.defaultsDir, 'outputs', name);
  };
  const finalizeRulesFile = () => outputRulesFile('finalize.md');
  const whiteboardRulesFile = () => outputRulesFile('whiteboard-defense.md');
```
and in `/context`, replace:
```ts
      if (body.finalize) return c.json(await finalizePack({ dir: ref.dir, types: cfg.types, profile, rules: await finalizeRules() }));
```
with:
```ts
      if (body.finalize) return c.json(await finalizePack({ dir: ref.dir, types: cfg.types, profile, rulesFile: await finalizeRulesFile() }));
```

- [ ] **Step 5: The finalizer Reads the files first**

In `plugin/agents/finalizer.md`, replace step 1 and the first line of step 2:
```md
1. Call `dp_context` with `repo`, `project` and `finalize: true`. You get:
   - `project`: its title, the plan's path, and `name`. The final is copied into the repo as `<name>.final.md`, with its mockups in `<name>.assets/`.
   - `rules`: the final document's structure and rules, from the user's `outputs/finalize.md`. Follow them exactly.
   - `draft`: the plan as it is now, with every accepted change in it.
   - `items`: every item except parked ones and those of plumbing types the user turned off, with its plumbing type, title, summary, body, fields, status, code references and `dataSummary`, a few words about its drawing.
   - `decisions`: every decision, with `chosen` (the option chosen), `rejected` (the options rejected) and `why`.
   - `defaults`: unanswered non-blocking questions, each with the default the final uses.
   - `openItems`: non-blocking items that are still open.
   - `conventions`: the repo profile's conventions.
   - `tokens`: the drawing tokens you may use, one per line.
   - `previousFinal`: the last accepted final, or null.
2. Write the whole document in Markdown, following `rules`. Use only what's in the pack: never invent behaviour.
```
with:
```md
1. Call `dp_context` with `repo`, `project` and `finalize: true`. You get:
   - `project`: its title, the plan's path, and `name`. The final is copied into the repo as `<name>.final.md`, with its mockups in `<name>.assets/`.
   - `rulesFile`: the user's `outputs/finalize.md` (or the shipped one): the final document's structure and rules. Follow them exactly.
   - `draftFile`: the plan as it is now, with every accepted change in it.
   - `items`: every item except parked ones and those of plumbing types the user turned off, with its plumbing type, title, summary, body, fields, status, code references, `dataSummary` (a few words about its drawing) and `file`, the item's own JSON. A body over 800 characters is cut short and ends `… (clipped: Read file for the rest)`.
   - `decisions`: every decision, with `chosen` (the option chosen), `rejected` (the options rejected) and `why`.
   - `defaults`: unanswered non-blocking questions, each with the default the final uses.
   - `openItems`: non-blocking items that are still open.
   - `conventions`: the repo profile's conventions.
   - `tokens`: the drawing tokens you may use, one per line.
   - `previousFinalFile`: the last accepted final, or null.

   Before you write anything, Read `rulesFile` and `draftFile`, each one whole (in parts, with offset and limit, when it's long), and `previousFinalFile` when it isn't null. Read the `file` of every item whose body is cut short before you write its part of the final.
2. Write the whole document in Markdown, following the rules file. Use only what's in the pack and the files it names: never invent behaviour.
```
and replace step 4:
```md
4. When `previousFinal` is set, keep its wording wherever it still holds, so the diff the user sees shows only what changed.
```
with:
```md
4. When `previousFinalFile` is set, keep the last final's wording wherever it still holds, so the diff the user sees shows only what changed.
```
The rest of step 2 and steps 3, 5 and 6 stay as they are.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/core/test/finalizePack.test.ts packages/core/test/defenseType.test.ts packages/core/test/whiteboardPack.test.ts packages/core/test/context.test.ts packages/service/test/finalize.test.ts packages/mcp/test/plugin.test.ts`
Expected: PASS. `finalizePack.test.ts` has 11 tests (three new); `finalize.test.ts` 14 (one new). The 40-item pack is about 48,000 characters of JSON. `whiteboardPack.test.ts` and `context.test.ts` pass unchanged.

Run: `pnpm typecheck && pnpm test`
Expected: PASS (984 tests in 105 files, four more than before this task).

Run: `pnpm test:integration`
Expected: PASS (8 tests): the bridge's finalize round trip Reads the rules file and the draft the pack names.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/store/context.ts packages/service/src/routes/claude.ts plugin/agents/finalizer.md packages/core/test/finalizePack.test.ts packages/core/test/defenseType.test.ts packages/service/test/finalize.test.ts packages/mcp/test/plugin.test.ts packages/mcp/test/bridge.integration.test.ts
git commit -m "fix(core): the finalizer reads the rules, the draft and the last final from files, and gets clipped bodies" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Settled Plan changes catch the items up

An update that leaves conflicts re-imports the plan's items at once, while the conflicts are still open, so the items never see what the user settles in Plan changes. Now, once every Plan changes item of the current version is resolved or parked, and settling them changed the draft, the next `/dev-plumbing` re-imports once more: the update's re-import again (every importable type, matched by key, new items added, removed ones parked), but the importers get `reimport.catchUp: true` and, as `changes`, only what settling the Plan changes did (each markdown edit of their applied changes, under its passage's heading). "Changed the draft" is read from the Plan changes threads themselves: at least one has an applied, not undone, change with markdown edits. So Keep my draft everywhere, or parking, never runs it, whatever else the user answered, and the importers never see the user's answers to other items. `project.caughtUp` records the version when it starts, so it runs once per version. It runs after **Not now** too, which only declines a newer version. While anything is with Claude, importing or finalizing, it waits, and `/open` says so. `/open`'s `next` says when it's running, the Plan changes list says when one is waiting, and a caught-up item's thread says "Updated to match your settled Plan changes.".

**Files:**
- Create:
  - `packages/core/test/catchUp.test.ts`
  - `packages/web/src/pages/TypeView.test.tsx`
- Modify:
  - `packages/core/src/schemas/project.ts` (`reimporting.catchUp`, `caughtUp`)
  - `packages/core/src/store/update.ts` (`settledEdits`, `catchUpWaiting`, `catchUpDue`, `startCatchUp`, after `updateRefusal`)
  - `packages/core/src/store/importItems.ts` (a catch-up's line in a changed item's thread)
  - `packages/core/src/store/context.ts` (`ImportPack.reimport.catchUp`; `importPack` in catch-up mode)
  - `packages/core/src/schemas/views.ts` (`ProjectHome.catchUpDue`)
  - `packages/core/src/store/projects.ts` (`loadProjectHome` fills it)
  - `packages/service/src/routes/claude.ts` (`/open`: the catch-up on the reopened path, its line in `next`, and the line when it has to wait)
  - `plugin/agents/importer.md` (the `catchUp` field and one paragraph)
  - `packages/web/src/pages/ListScreen.tsx` (the "Your Plan changes are settled…" line), `packages/web/src/pages/TypeView.tsx` (passes it on the Plan changes list)
- Test:
  - `packages/core/test/catchUp.test.ts`, `packages/core/test/context.test.ts` (the re-import pack now has `catchUp: false`)
  - `packages/service/test/update.test.ts`
  - `packages/mcp/test/plugin.test.ts`
  - `packages/web/src/pages/ListScreen.test.tsx`, `packages/web/src/pages/TypeView.test.tsx`
- **`packages/core/src/store/importItems.ts` changes in one place.** A catch-up is an ordinary re-import of v<n> (`project.reimporting` is set, with `version: n`), so `writeImportBatch` already matches by key, flags a changed item "Changed in the plan's v<n>.", parks removed ones, and `importDone` and `finishImport` already drop `reimporting` and `importBy` and keep any other field, `caughtUp` included. Only the system line in a changed item's thread differs: a catch-up writes "Updated to match your settled Plan changes." in place of "Updated from the plan's v<n>.", since the change came from settling, not from the plan. `reimportItem` takes `reimporting` (`{ version, catchUp? }`) in place of the version for that. The flag keeps its text, so Task 8 still finds the version. `catchUp.test.ts` runs a real catch-up through it.

**Interfaces:**
- Consumes:
  - From Plan 5 (`store/update.ts`): `updateRefusal(dir)` (importing; threads with Claude, Defense threads aside; finalize requested or writing), `updatePlan`, the journal at `docs/versions/v<n>/update.json` (`journalRel(n)`, module-private), `lstat`, `lf`, `PLAN_CHANGES`, `importableTypes`; Plan changes items have `key: 'v<N>-<k>'` and `type: 'plan-changes'`; a version's `merge.conflicts` counts them.
  - `currentVersion(project)` (`store/versions.ts`); `readHistory(dir)` (`store/io.ts`): the history/ entries, each with `threadId`, `at`, `change` (`md` edits `{ find, replace }`), `appliedAt` and `undoneAt`.
  - In `context.ts`: the module-private `planDiff(before, after)` (lines `+ `, `- `, `  `, hunks headed `@@`) and `conflictsOf(items, to)`. Task 6 left `finalizePack` and `planItems` changed; this task touches only `ImportPack` and `importPack`.
  - `writeImportBatch`, `finishImport`, `claimImport` (`store/importItems.ts`), unchanged.
  - In `/open`: `created`, `update`, `tell`, `key`, `ref`, `cfg`, `rt.withLock`, `rt.listeners.seen`, `changed(ref)`, `updateRefusal`, and the bookkeeping that already calls `claimImport` when `importPending` has an importable type.
- Produces, as in the header's Contracts:
  ```ts
  // schemas/project.ts
  reimporting: z.object({ version: z.number().int().min(2), from: z.enum(['active', 'finalized']), catchUp: z.boolean().optional() }).optional(),
  caughtUp: z.number().int().min(2).optional(),
  // store/update.ts
  export type SettledEdit = { heading: string | null; find: string; replace: string };
  export async function settledEdits(dir: string, n: number): Promise<SettledEdit[]>;
  export async function catchUpDue(dir: string): Promise<number | null>;
  export async function startCatchUp(dir: string, o: { version: number; types: PlumbingType[]; windowId: string; now?: Date }): Promise<{ importTypes: string[] }>;
  // store/context.ts: ImportPack.reimport gains
  catchUp: boolean;
  // schemas/views.ts: ProjectHome gains
  catchUpDue: boolean;
  ```
  - **Added beyond the Contracts:** `export async function catchUpWaiting(dir: string): Promise<number | null>` (`store/update.ts`), the half of `catchUpDue` that doesn't look at work in progress and never writes. `loadProjectHome` uses it for `ProjectHome.catchUpDue`, as the outline asks ("computed without writing"), and `catchUpDue` is `catchUpWaiting` once nothing is in the way.
  - **`settledEdits(dir, n)`**: what settling v<n>'s Plan changes did to the draft. For each Plan changes item whose key starts `v<n>-`, in key order, every history/ entry of its thread that's applied and not undone (`appliedAt` set, no `undoneAt`), oldest first, gives each of its `change.md` edits as `{ heading: item.mdAnchor?.heading ?? null, find, replace }`. A thread settled with Keep my draft (an empty `md`), or parked, gives none, and other items' answers are never in it.
  - **`catchUpWaiting(dir)`** is the current version `n` when all of these hold, else null: `currentVersion(project).merge.conflicts > 0` (a fresh start has none); `project.caughtUp` is absent or below `n`; there's at least one Plan changes item whose key starts `v<n>-`, and every one's thread is `resolved` or `parked`; and `settledEdits(dir, n)` isn't empty. This replaces comparing the draft with `merged.md`, which any accepted answer would change.
  - **`catchUpDue(dir)`** is null while any `docs/versions/v<k>/update.json` exists (an update that stopped part-way: `planChange` and `updatePlan` put it back first, and Task 9's recovery tells the user), or while `updateRefusal(dir)` says anything; else `catchUpWaiting(dir)`. It writes nothing. Call it under the project's lock.
  - **`startCatchUp(dir, o)`:** refuses a project that's importing (ConflictError, "This project is still importing. Run /dev-plumbing again once that's done."). Otherwise writes `project.json` with `caughtUp: o.version`, `updatedAt`, and, when `importableTypes(o.types)` isn't empty, `status: 'importing'`, `importPending` (their ids, in order), `reimporting: { version: o.version, from: 'finalized' | 'active' (the project's status), catchUp: true }` and `importBy: o.windowId` (what `claimImport` would record). Returns `{ importTypes }`, the ids it put in `importPending` (`[]` when there are none, and then only `caughtUp` and `updatedAt` change).
  - **`importPack` in catch-up mode** (`project.reimporting.catchUp`): `reimport` is `{ from: n, to: n, catchUp: true, changes, conflicts: [], existing }`, `existing` as for an update's re-import. `changes` is `settledEdits(dir, n)` as a small diff: per edit, `@@ <heading>` (or `@@`), then each line of `find` as `- <line>` and each line of `replace` as `+ <line>`, the hunks joined by `\n`. After an update, `catchUp` is `false`, and the rest is as before.
  - **`/open`'s reopened path:** after the update check, and only when the project wasn't just created, no update ran and the call has a `windowId`, it takes the project's lock and runs `catchUpDue`. That includes after **Not now** (`update: false`), which only declines the newer version of the plan: the catch-up is this version's. When `catchUpDue` gives a version, the window is marked seen (`rt.listeners.seen`), as an update's re-import does, so another window's `dp_wait` queued behind the lock can't end the import, and `startCatchUp` runs with `cfg.types` and the `windowId`. When it put types in `importPending`, `changed(ref)` tells the browser, `importTypes` comes back built as always (two waves), and `next` starts `Tell the user: "Your settled Plan changes touch the plan's items. Re-importing to catch them up." `, then the usual importer instructions.
  - **When it has to wait:** when `catchUpDue` gives null, but `catchUpWaiting` gives a version and `updateRefusal` says something (a thread with Claude, an import, a finalize), `next` tells the user "Your settled Plan changes still need a re-import. It waits until Claude has answered: run /dev-plumbing again then.", so they know a second `/dev-plumbing` is needed once the window has answered.
  - **`telling(lines, next)`,** a module-private helper in `claude.ts`: `Tell the user: "<lines joined by a space>" <next>`, or `next` when there are no lines. The reopened `next` is `telling([tell?, the catch-up line?, …waits], next)`, which gives the same text as before when only `tell` is set. `waits` holds the lines about what has to wait; they come last.
  - **The thread line:** a catch-up's `reimportItem` writes "Updated to match your settled Plan changes." on a changed item's thread, and keeps the flag "Changed in the plan's v<n>.".
  - **The web:** `ListScreen` takes an optional `catchUpDue` and, when it's true, shows "Your Plan changes are settled. Run /dev-plumbing to catch the items up." under its header (`data-testid="catch-up-due"`, `text-[12.5px] text-ink-2`). `TypeView` reads the project home (the same `['projectHome', repo, project]` query `ProjectLayout` uses) and passes `catchUpDue` only on the `plan-changes` list.

- [ ] **Step 1: Write the failing core tests**

`packages/core/test/catchUp.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PLAN_CHANGES_TYPE } from '../src/planChanges';
import type { Option } from '../src/schemas';
import { importPack } from '../src/store/context';
import { finishImport, writeImportBatch } from '../src/store/importItems';
import { readItem, readProjectFile, readThread } from '../src/store/io';
import { loadProjectHome } from '../src/store/projects';
import { finishSubmission, pendingSubmissions, pickUp } from '../src/store/queue';
import { postReply } from '../src/store/reply';
import { submit } from '../src/store/submit';
import { saveDraft, setParked } from '../src/store/threads';
import { catchUpDue, catchUpWaiting, startCatchUp, updatePlan } from '../src/store/update';
import { planHash } from '../src/store/versions';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const T = new Date('2026-10-08T10:00:00.000Z');
const types = [...TYPES, PLAN_CHANGES_TYPE];
const IMPORTABLE = ['architecture', 'questions', 'concerns'];
/** Your draft: the Approach line, edited. */
const OURS = DRAFT.replace('sends a reminder.', 'sends an email reminder.');
/** The repo's v2: the same Approach line edited another way (a conflict), and the Data line (merged cleanly). */
const V2 = DRAFT.replace('sends a reminder.', 'sends a text message.').replace('Log reminders in a table.', 'Log each reminder in a reminders table.');
/** The repo's v3: the Approach line again, which the settled conflict changed in the draft too (another conflict). */
const V3 = V2.replace('sends a text message.', 'sends a push notification.');
const HOURLY: Option = { id: 'hourly', label: 'Hourly', change: { md: [{ find: 'A daily job', replace: 'An hourly job' }] } };
const CONFLICT = 't-plan-changes-v2-1';

/**
 * A project imported from DRAFT (v1), with OURS as its draft and two imported questions: "approach", which offers to
 * run the job hourly, and "who".
 */
async function seed(): Promise<string> {
  const approach = pair('questions-approach', { title: 'How often does the job run?', options: [HOURLY] });
  const who = pair('questions-who', { title: 'Who gets reminders?' });
  const dir = await seedProject({
    pairs: [
      { ...approach, item: { ...approach.item, key: 'approach', mdAnchor: { heading: 'Approach' } } },
      { ...who, item: { ...who.item, key: 'who' } },
    ],
    project: { source: { path: 'docs/specs/restock.md', clone: '/tmp/acme', branch: 'main', hashAtImport: planHash(DRAFT) } },
  });
  await fs.writeFile(path.join(dir, 'docs', 'draft.md'), OURS);
  return dir;
}

const update = (dir: string, repoText: string, now = T) =>
  updatePlan(dir, { repoText, clone: '/Users/you/src/acme', branch: 'main', commit: null, types, home: '/Users/you', now });

/** Claude takes the oldest waiting submission and answers each of its threads with `reply`, then ends it. */
async function claudeAnswers(dir: string, reply: (threadId: string) => Parameters<typeof postReply>[1]['reply']): Promise<void> {
  const [next] = await pendingSubmissions(dir);
  const s = await pickUp(dir, next!.id, 'w-a');
  for (const threadId of s.sent) await postReply(dir, { reply: reply(threadId), types, autoApply: false, clone: '/tmp/acme' });
  await finishSubmission(dir, s.id, []);
}

/** Claude's three choices for a Plan changes thread, as its rules say: the merged version, the repo's, or the draft as it is. */
const choices = (find: string, merged: string, theirs: string) => (threadId: string) => ({
  threadId,
  text: 'Your draft says email, and the repo says a text message.',
  options: [
    { id: 'merged', label: 'Use the merged version', change: { md: [{ find, replace: merged }] } },
    { id: 'theirs', label: "Take the repo's version", change: { md: [{ find, replace: theirs }] } },
    { id: 'keep', label: 'Keep my draft', change: { md: [] } },
  ],
  recommended: 'merged',
});
const APPROACH_CHOICES = choices('sends an email reminder.', 'sends an email or a text message.', 'sends a text message.');
/** The second conflict, when your draft changed the Data line too. */
const DATA = 't-plan-changes-v2-2';
const DATA_CHOICES = choices('Log reminders in an audit table.', 'Log each reminder in an audit table.', 'Log each reminder in a reminders table.');

/** You pick an option on a thread and send it: an accept, applied and resolved at once. */
async function accept(dir: string, threadId: string, optionId: string): Promise<void> {
  await saveDraft(dir, threadId, { optionId }, T);
  expect((await submit(dir, { scope: 'thread', threadId, types, now: T })).resolved).toEqual([threadId]);
}

/** You answer a thread in your own words and send it, so it waits for Claude. */
async function ask(dir: string, threadId: string, text: string): Promise<void> {
  await saveDraft(dir, threadId, { text }, T);
  expect((await submit(dir, { scope: 'thread', threadId, types, now: T })).sent).toEqual([threadId]);
}

/** v2 is in, its re-import done, and Claude has offered its choices on the one conflict, which is your turn now. */
async function atV2(): Promise<string> {
  const dir = await seed();
  expect(await update(dir, V2)).toMatchObject({ version: 2, conflicts: 1, conflictThreadIds: [CONFLICT] });
  expect(await finishImport(dir)).toBe(true);
  await claudeAnswers(dir, APPROACH_CHOICES);
  expect((await readThread(dir, CONFLICT)).status).toBe('your_turn');
  return dir;
}

/** As atV2, but your draft changed the Data line too, so v2 leaves two conflicts: Approach (v2-1) and Data (v2-2). */
async function atV2WithTwo(): Promise<string> {
  const dir = await seed();
  await fs.writeFile(path.join(dir, 'docs', 'draft.md'), OURS.replace('Log reminders in a table.', 'Log reminders in an audit table.'));
  expect(await update(dir, V2)).toMatchObject({ version: 2, conflicts: 2, conflictThreadIds: [CONFLICT, DATA] });
  expect(await finishImport(dir)).toBe(true);
  await claudeAnswers(dir, (threadId) => (threadId === DATA ? DATA_CHOICES : APPROACH_CHOICES)(threadId));
  return dir;
}

/** Every importer of the catch-up sends its batch: Questions changes "approach", the others have no changes. */
async function runImporters(dir: string, importTypes: string[]): Promise<boolean[]> {
  const finished: boolean[] = [];
  for (const id of importTypes) {
    const type = types.find((t) => t.id === id)!;
    const batch = id === 'questions' ? { items: [{ key: 'approach', summary: 'Email or a text message, from a daily job.' }] } : { noChanges: 'Nothing changed for this type.' };
    finished.push((await writeImportBatch({ dir, type, types, batch, clone: '/tmp/acme', now: T })).importFinished);
  }
  return finished;
}

describe('catching the items up with settled Plan changes', () => {
  it('the catch-up runs once, and only when it should', async () => {
    const dir = await seed();
    await update(dir, V2);
    // Not while the update's re-import runs, nor while Claude has the conflict.
    expect(await catchUpDue(dir)).toBeNull();
    await finishImport(dir);
    expect((await readThread(dir, CONFLICT)).status).toBe('with_claude');
    expect(await catchUpDue(dir)).toBeNull();

    // Not while a Plan changes item is open: Claude offered its choices, and it's your turn.
    await claudeAnswers(dir, APPROACH_CHOICES);
    expect(await catchUpDue(dir)).toBeNull();
    expect(await catchUpWaiting(dir)).toBeNull();
    // You took the hourly job meanwhile: an answer to another item, which the catch-up won't carry.
    await accept(dir, 't-questions-approach', 'hourly');

    // Not while a thread is with Claude: you asked about "who", then settled the conflict with the merged version,
    // which changed the draft.
    await ask(dir, 't-questions-who', 'Only active subscribers?');
    await accept(dir, CONFLICT, 'merged');
    expect(await fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8')).toContain('An hourly job finds subscriptions due soon and sends an email or a text message.');
    expect(await catchUpWaiting(dir)).toBe(2);
    expect(await catchUpDue(dir)).toBeNull();
    await claudeAnswers(dir, (threadId) => ({ threadId, text: 'Yes, active subscribers only.', resolve: { decision: 'Only active subscribers get reminders' } }));

    // Once every Plan changes item is settled and nothing is under way, it's due.
    expect(await catchUpDue(dir)).toBe(2);
    expect(await startCatchUp(dir, { version: 2, types, windowId: 'w-a', now: T })).toEqual({ importTypes: IMPORTABLE });
    expect(await readProjectFile(dir)).toMatchObject({
      status: 'importing',
      importPending: IMPORTABLE,
      reimporting: { version: 2, from: 'active', catchUp: true },
      importBy: 'w-a',
      caughtUp: 2,
    });
    // The importers get only what settling the conflict did, not the hourly job.
    expect((await importPack({ dir, typeId: 'questions', types })).reimport!.changes).toBe(
      ['@@ Approach', '- sends an email reminder.', '+ sends an email or a text message.'].join('\n'),
    );
    // Not while it runs.
    expect(await catchUpDue(dir)).toBeNull();
    expect(await runImporters(dir, IMPORTABLE)).toEqual([false, false, true]);
    // It's a re-import of v2, so the changed item is flagged as after the update, and its thread says the settled Plan
    // changes did it.
    const approach = await readItem(dir, 'questions-approach');
    expect(approach.summary).toBe('Email or a text message, from a daily job.');
    expect(approach.flags).toEqual([{ reason: "Changed in the plan's v2.", fromThreadId: 't-questions-approach', at: T.toISOString() }]);
    expect((await readThread(dir, 't-questions-approach')).messages.at(-1)).toMatchObject({ author: 'system', text: 'Updated to match your settled Plan changes.' });
    const done = await readProjectFile(dir);
    expect(done).toMatchObject({ status: 'active', importPending: [], caughtUp: 2 });
    expect(done.reimporting).toBeUndefined();
    expect(done.importBy).toBeUndefined();

    // Not again.
    expect(await catchUpDue(dir)).toBeNull();
    expect(await catchUpWaiting(dir)).toBeNull();

    // A later update to v3 can catch up again, once its own conflict is settled.
    expect(await update(dir, V3, new Date('2026-10-09T10:00:00.000Z'))).toMatchObject({ version: 3, conflicts: 1 });
    expect(await finishImport(dir)).toBe(true);
    expect(await catchUpDue(dir)).toBeNull();
    await claudeAnswers(dir, choices('sends an email or a text message.', 'sends an email, a text message or a push notification.', 'sends a push notification.'));
    expect(await catchUpDue(dir)).toBeNull();
    await accept(dir, 't-plan-changes-v3-1', 'merged');
    expect(await catchUpDue(dir)).toBe(3);
  });

  it("doesn't run when settling the Plan changes changed nothing, even once another answer changed the draft", async () => {
    const dir = await atV2();
    // Keep my draft settles the conflict and changes nothing. You took the hourly job too, which changed the draft,
    // but that's your answer to another item, not something settling the Plan changes did.
    await accept(dir, CONFLICT, 'keep');
    await accept(dir, 't-questions-approach', 'hourly');
    expect((await readThread(dir, CONFLICT)).status).toBe('resolved');
    expect(await fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8')).not.toBe(await fs.readFile(path.join(dir, 'docs', 'versions', 'v2', 'merged.md'), 'utf8'));
    expect(await catchUpWaiting(dir)).toBeNull();
    expect(await catchUpDue(dir)).toBeNull();
    // So the project home says none is waiting, and the Plan changes list has no line about it, which would otherwise
    // stay for good: nothing would ever run to set caughtUp.
    expect((await loadProjectHome({ repo: 'acme', id: 'restock', dir }, types)).catchUpDue).toBe(false);
  });

  it('counts a parked Plan changes thread as settled', async () => {
    // Parking changes nothing: with the other conflict kept as your draft, nothing is due, whatever else you answered.
    const kept = await atV2WithTwo();
    await setParked(kept, CONFLICT, true, T);
    await accept(kept, 't-questions-approach', 'hourly');
    expect(await catchUpWaiting(kept)).toBeNull();
    await accept(kept, DATA, 'keep');
    expect(await catchUpWaiting(kept)).toBeNull();
    expect(await catchUpDue(kept)).toBeNull();

    // With the other one settled with the merged version, it's due: the parked one doesn't hold it up.
    const merged = await atV2WithTwo();
    await setParked(merged, CONFLICT, true, T);
    expect(await catchUpWaiting(merged)).toBeNull();
    await accept(merged, DATA, 'merged');
    expect(await catchUpDue(merged)).toBe(2);
  });

  it('waits while an update that stopped part-way still has its journal', async () => {
    const dir = await atV2();
    await accept(dir, CONFLICT, 'merged');
    expect(await catchUpDue(dir)).toBe(2);
    // The journal of an update to v3 that didn't finish: planChange or updatePlan puts it back first.
    await fs.writeFile(path.join(dir, 'docs', 'versions', 'v2', 'update.json'), JSON.stringify({ to: 3, created: [], wrote: { draft: 'x', original: 'y' } }));
    expect(await catchUpDue(dir)).toBeNull();
  });

  it('keeps a finalized project finalized, and with no type to import, only records the version', async () => {
    const dir = await atV2();
    await accept(dir, CONFLICT, 'merged');
    const project = await readProjectFile(dir);
    await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({ ...project, status: 'finalized' }));
    expect(await startCatchUp(dir, { version: 2, types: [PLAN_CHANGES_TYPE], windowId: 'w-a', now: T })).toEqual({ importTypes: [] });
    const after = await readProjectFile(dir);
    expect(after).toMatchObject({ status: 'finalized', caughtUp: 2, importPending: [] });
    expect(after.reimporting).toBeUndefined();
    expect(await catchUpDue(dir)).toBeNull();

    const again = await atV2();
    await accept(again, CONFLICT, 'merged');
    await fs.writeFile(path.join(again, 'project.json'), JSON.stringify({ ...(await readProjectFile(again)), status: 'finalized' }));
    await startCatchUp(again, { version: 2, types, windowId: 'w-a', now: T });
    expect((await readProjectFile(again)).reimporting).toEqual({ version: 2, from: 'finalized', catchUp: true });
    await runImporters(again, IMPORTABLE);
    expect((await readProjectFile(again)).status).toBe('finalized');
  });
});

describe("a catch-up importer's pack", () => {
  it("taking the repo's version runs one catch-up, whose changes hold only that edit, and no conflicts", async () => {
    const dir = await atV2();
    // Your answer to another item changed the draft too. Then you took the repo's version of the conflict.
    await accept(dir, 't-questions-approach', 'hourly');
    await accept(dir, CONFLICT, 'theirs');
    expect(await catchUpWaiting(dir)).toBe(2);
    await startCatchUp(dir, { version: 2, types, windowId: 'w-a', now: T });
    const pack = await importPack({ dir, typeId: 'questions', types });
    expect(pack.reimport).toMatchObject({ from: 2, to: 2, catchUp: true, conflicts: [] });
    // Each edit settling made, under its passage's heading: the hourly job isn't one of them.
    expect(pack.reimport!.changes).toBe(['@@ Approach', '- sends an email reminder.', '+ sends a text message.'].join('\n'));
    expect(pack.reimport!.existing.map((e) => e.key)).toEqual(['approach', 'who']);
    expect(pack.draft).toBe(await fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8'));
    // Once.
    await runImporters(dir, IMPORTABLE);
    expect(await catchUpWaiting(dir)).toBeNull();
  });
});
```

In `packages/core/test/context.test.ts`, in "gives a re-importer the plan's changes and this type's imported items", replace:
```ts
    expect(pack.reimport).toEqual({
      from: 2,
      to: 3,
      changes: [
```
with:
```ts
    expect(pack.reimport).toEqual({
      from: 2,
      to: 3,
      // An update's re-import, not the catch-up after its Plan changes are settled.
      catchUp: false,
      changes: [
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/catchUp.test.ts packages/core/test/context.test.ts`
Expected: FAIL. Every test in `catchUp.test.ts`, because `catchUpDue`, `catchUpWaiting` and `startCatchUp` aren't exported from `store/update.ts` yet ("… is not a function"), and the re-import test in `context.test.ts` (no `catchUp` in the pack).

- [ ] **Step 3: Record the catch-up in the project**

In `packages/core/src/schemas/project.ts`, replace:
```ts
  /** Set while the importers re-run after an update: the version they import, and the status to go back to. */
  reimporting: z.object({ version: z.number().int().min(2), from: z.enum(['active', 'finalized']) }).optional(),
```
with:
```ts
  /**
   * Set while the importers re-run after an update: the version they import, and the status to go back to. `catchUp`
   * marks the re-import that catches the items up once that version's Plan changes are all settled (startCatchUp).
   */
  reimporting: z.object({ version: z.number().int().min(2), from: z.enum(['active', 'finalized']), catchUp: z.boolean().optional() }).optional(),
  /** The last version whose settled Plan changes the items were caught up with, so that re-import runs once per version. */
  caughtUp: z.number().int().min(2).optional(),
```

- [ ] **Step 4: Say when a catch-up is due, and start it**

In `packages/core/src/store/update.ts`, in the import from `./io`, replace:
```ts
  readDocText,
  readItems,
  readJsonFile,
```
with:
```ts
  readDocText,
  readHistory,
  readItems,
  readJsonFile,
```

Then add the three functions right after `updateRefusal`, before `updatePlan`'s doc comment. Replace:
```ts
  const finalize = await readFinalize(dir);
  if (finalize?.state === 'requested' || finalize?.state === 'writing') return "Finalize is under way. Run /dev-plumbing again once it's done or cancelled.";
  return null;
}
```
with:
```ts
  const finalize = await readFinalize(dir);
  if (finalize?.state === 'requested' || finalize?.state === 'writing') return "Finalize is under way. Run /dev-plumbing again once it's done or cancelled.";
  return null;
}

/** One edit settling a Plan changes thread made to the draft, with the heading of the passage it's in. */
export type SettledEdit = { heading: string | null; find: string; replace: string };

/** v<n>'s Plan changes items, in key order (v<n>-1, v<n>-2, …). */
async function planChangesOf(dir: string, n: number): Promise<Item[]> {
  const prefix = `v${n}-`;
  const k = (i: Item) => Number(i.key!.slice(prefix.length));
  return (await readItems(dir)).values.filter((i) => i.type === PLAN_CHANGES && i.key?.startsWith(prefix)).sort((a, b) => k(a) - k(b));
}

/**
 * What settling v<n>'s Plan changes did to the draft: the markdown edits of every applied, not undone, history/ entry
 * of their threads, in the items' order and then oldest first, each with its passage's heading. A thread settled with
 * Keep my draft, or parked, made none, and your answers to other items are never here. A catch-up's importers get
 * these as `changes` (importPack), and catchUpWaiting is due only when there are some.
 */
export async function settledEdits(dir: string, n: number): Promise<SettledEdit[]> {
  const items = await planChangesOf(dir, n);
  const applied = (await readHistory(dir)).filter((h) => h.appliedAt && !h.undoneAt).sort((a, b) => a.at.localeCompare(b.at));
  return items.flatMap((item) =>
    applied
      .filter((h) => h.threadId === item.threadId)
      .flatMap((h) => (h.change.md ?? []).map((e) => ({ heading: item.mdAnchor?.heading ?? null, find: e.find, replace: e.replace }))),
  );
}

/**
 * The current version, when the update that brought it in left conflicts to settle, every one of its Plan changes
 * items is now resolved or parked, settling them changed the draft (settledEdits), and the items haven't been caught
 * up with it yet (project.caughtUp). Null otherwise. It doesn't look at work in progress, and writes nothing, so the
 * project home can say a catch-up is waiting.
 */
export async function catchUpWaiting(dir: string): Promise<number | null> {
  const project = await readProjectFile(dir);
  const current = currentVersion(project);
  if (!current.merge?.conflicts || (project.caughtUp ?? 0) >= current.n) return null;
  const conflicts = await planChangesOf(dir, current.n);
  if (!conflicts.length) return null;
  const statusOf = new Map((await readThreads(dir)).values.map((t) => [t.id, t.status]));
  if (!conflicts.every((i) => ['resolved', 'parked'].includes(statusOf.get(i.threadId) ?? 'missing'))) return null;
  // Keep my draft everywhere, or parking, changed nothing: there's nothing to catch up, whatever else you answered.
  return (await settledEdits(dir, current.n)).length ? current.n : null;
}

/**
 * The version whose settled Plan changes the items should be caught up with now, or null: catchUpWaiting's, once
 * nothing is in the way. It waits, as an update does, while updateRefusal says so (an import, threads queued for
 * Claude, a finalize), and while an update that stopped part-way still has its journal: planChange and updatePlan put
 * that back first. Under the project's lock.
 */
export async function catchUpDue(dir: string): Promise<number | null> {
  const folders = await fs.readdir(docPath(dir, 'docs/versions')).catch((): string[] => []);
  for (const folder of folders) {
    const n = /^v([1-9][0-9]*)$/.exec(folder)?.[1];
    if (n && (await lstat(docPath(dir, journalRel(Number(n)))))) return null;
  }
  if (await updateRefusal(dir)) return null;
  return catchUpWaiting(dir);
}

/**
 * Starts the re-import that catches the items up with v<version>'s settled Plan changes: every importable type is
 * imported again, by key, as after an update, and importPack gives the importers the draft's changes since the update
 * merged it. `windowId` is the window that runs the importers, as claimImport records it. caughtUp is set now, so it
 * runs once per version, even if it's cut short. With no type to import, only caughtUp is set. Under the project's
 * lock, after catchUpDue.
 */
export async function startCatchUp(dir: string, o: { version: number; types: PlumbingType[]; windowId: string; now?: Date }): Promise<{ importTypes: string[] }> {
  const project = await readProjectFile(dir);
  if (project.status === 'importing') throw new ConflictError("This project is still importing. Run /dev-plumbing again once that's done.");
  const importPending = importableTypes(o.types).map((t) => t.id);
  const from = project.status === 'finalized' ? 'finalized' : 'active';
  await writeProjectFile(dir, {
    ...project,
    caughtUp: o.version,
    ...(importPending.length ? { status: 'importing' as const, importPending, reimporting: { version: o.version, from, catchUp: true }, importBy: o.windowId } : {}),
    updatedAt: (o.now ?? new Date()).toISOString(),
  });
  return { importTypes: importPending };
}
```
(`fs`, `docPath`, `lstat`, `journalRel`, `readItems`, `readThreads`, `writeProjectFile`, `ConflictError`, `importableTypes`, `PLAN_CHANGES` and the `Item` type are already in this module.)

In `packages/core/src/store/importItems.ts`, a catch-up's change says where it came from. Replace:
```ts
const systemLine = (now: Date, text: string): Message => ({ id: newId('m', now), at: now.toISOString(), author: 'system', text });
```
with:
```ts
const systemLine = (now: Date, text: string): Message => ({ id: newId('m', now), at: now.toISOString(), author: 'system', text });
/** What a catch-up (Task 7) says on a changed item's thread: the change came from your settled Plan changes. */
const CAUGHT_UP = 'Updated to match your settled Plan changes.';
```
replace:
```ts
async function reimportItem(dir: string, old: Item, given: Given, opening: Message | null, version: number, now: Date): Promise<void> {
```
with:
```ts
async function reimportItem(dir: string, old: Item, given: Given, opening: Message | null, reimport: { version: number; catchUp?: boolean }, now: Date): Promise<void> {
  const version = reimport.version;
```
replace:
```ts
  if (changed) {
    messages.push(systemLine(now, `Updated from the plan's v${version}.`));
```
with:
```ts
  if (changed) {
    // The flag still names v<n> (Task 8 reads it); the line says a catch-up's change came from settling, not the plan.
    messages.push(systemLine(now, reimport.catchUp ? CAUGHT_UP : `Updated from the plan's v${version}.`));
```
and replace:
```ts
      await reimportItem(o.dir, old, given, opening, reimport.version, now);
```
with:
```ts
      await reimportItem(o.dir, old, given, opening, reimport, now);
```

- [ ] **Step 5: Give a catch-up's importers the settled changes**

In `packages/core/src/store/context.ts`, in the `ImportPack` type, replace:
```ts
  /**
   * Set while a new version of the plan is re-imported, null at first import. `changes` is how the plan changed from
   * v`from` to v`to`; `conflicts` are the passages this update left to settle in Plan changes (`ours` is still in the
   * draft, `theirs` isn't yet); `existing` is this type's imported items, by key, so the importer can reuse a key for the
   * same thing.
   */
  reimport: {
    from: number;
    to: number;
    changes: string;
```
with:
```ts
  /**
   * Set while a new version of the plan is re-imported, null at first import. `changes` is how the plan changed from
   * v`from` to v`to`; `conflicts` are the passages this update left to settle in Plan changes (`ours` is still in the
   * draft, `theirs` isn't yet); `existing` is this type's imported items, by key, so the importer can reuse a key for the
   * same thing. In a catch-up (`catchUp`, once every Plan changes thread of v`to` is settled), `from` is `to`,
   * `changes` is only what settling those threads did to the draft (each edit under its passage's heading), and there
   * are no `conflicts`.
   */
  reimport: {
    from: number;
    to: number;
    catchUp: boolean;
    changes: string;
```

In `importPack`, replace:
```ts
  const project = await readProjectFile(o.dir);
  const { values: items } = await readItems(o.dir);
  const p = o.profile;
  const to = project.reimporting?.version;
  const reimport: ImportPack['reimport'] =
    to === undefined
      ? null
      : {
          from: to - 1,
          to,
          changes: planDiff((await readVersionDoc(o.dir, project, to - 1, 'original')) ?? '', (await readVersionDoc(o.dir, project, to, 'original')) ?? ''),
          conflicts: conflictsOf(items, to),
```
with:
```ts
  const project = await readProjectFile(o.dir);
  const { values: items } = await readItems(o.dir);
  const draft = await readDocText(o.dir, project.docs.draft);
  const p = o.profile;
  const to = project.reimporting?.version;
  // A catch-up brings in only what settling the Plan changes did to the draft, never your answers to other items.
  const catchUp = project.reimporting?.catchUp === true;
  const reimport: ImportPack['reimport'] =
    to === undefined
      ? null
      : {
          from: catchUp ? to : to - 1,
          to,
          catchUp,
          changes: catchUp
            ? editsDiff(await settledEdits(o.dir, to))
            : planDiff((await readVersionDoc(o.dir, project, to - 1, 'original')) ?? '', (await readVersionDoc(o.dir, project, to, 'original')) ?? ''),
          conflicts: catchUp ? [] : conflictsOf(items, to),
```
Add the helper and its import. Replace:
```ts
import { readVersionDoc } from './versions';
```
with:
```ts
import { settledEdits, type SettledEdit } from './update';
import { readVersionDoc } from './versions';
```
and replace:
```ts
/** Spec §13.2: what a thread subagent receives. */
```
with:
```ts
/**
 * Edits as a small diff, each under its passage's heading: `@@ <heading>`, then its `find` as `- ` lines and its
 * `replace` as `+ ` lines. What a catch-up's importers get as `changes`.
 */
function editsDiff(edits: SettledEdit[]): string {
  const lines = (prefix: string, text: string) => (text === '' ? [] : text.split('\n').map((l) => `${prefix}${l}`));
  return edits.map((e) => [e.heading ? `@@ ${e.heading}` : '@@', ...lines('- ', e.find), ...lines('+ ', e.replace)].join('\n')).join('\n');
}

/** Spec §13.2: what a thread subagent receives. */
```
(`store/whiteboard.ts`, which this module already imports, imports `store/update.ts` too, and `update.ts` imports nothing from here, so there's no cycle.)
and, further down in `importPack`'s return, replace:
```ts
    draft: await readDocText(o.dir, project.docs.draft),
    profile: p
```
with:
```ts
    draft,
    profile: p
```
(These are `importPack`'s only changes: `existing` and `existingItems` stay as they are. Nothing here is near `whiteboardPack`.)

- [ ] **Step 6: The project home says when a catch-up is waiting**

In `packages/core/src/schemas/views.ts`, in `ProjectHome`, replace:
```ts
  /** The plan version the working original and draft hold, and how many versions there are (1 until an update). */
  version: { current: number; count: number };
```
with:
```ts
  /** The plan version the working original and draft hold, and how many versions there are (1 until an update). */
  version: { current: number; count: number };
  /**
   * Every Plan changes item of the current version is settled, and the items haven't caught up with what that did to
   * the draft: the next /dev-plumbing re-imports to catch them up (catchUpWaiting). The Plan changes list says so.
   */
  catchUpDue: boolean;
```

In `packages/core/src/store/projects.ts`, replace:
```ts
import { planVersionSinceFinal } from './update';
```
with:
```ts
import { catchUpWaiting, planVersionSinceFinal } from './update';
```
and at the end of `loadProjectHome`, replace:
```ts
  const version = { current: currentVersion(project).n, count: projectVersions(project).length };
  return { summary, project, types: typeEntries, inbox, documents, version, finalize, defense: await defenseStatus(ref.dir) };
```
with:
```ts
  const version = { current: currentVersion(project).n, count: projectVersions(project).length };
  const catchUpDue = (await catchUpWaiting(ref.dir)) !== null;
  return { summary, project, types: typeEntries, inbox, documents, version, catchUpDue, finalize, defense: await defenseStatus(ref.dir) };
```

- [ ] **Step 7: Run the core tests**

Run: `pnpm vitest run packages/core/test/catchUp.test.ts packages/core/test/context.test.ts packages/core/test/importItems.test.ts packages/core/test/update.test.ts`
Expected: PASS (6 tests in `catchUp.test.ts`; the others as before).

- [ ] **Step 8: Write the failing service, plugin and web tests**

In `packages/service/test/update.test.ts`, replace:
```ts
describe('versions', () => {
```
with:
```ts
describe('catching the items up with settled Plan changes', () => {
  const CATCH_UP = `Tell the user: "Your settled Plan changes touch the plan's items. Re-importing to catch them up." ${IMPORT_NEXT}`;
  const WAITS = `Tell the user: "Your settled Plan changes still need a re-import. It waits until Claude has answered: run /dev-plumbing again then." ${WAIT_NEXT}`;
  const MERGED = { id: 'merged', label: 'Use the merged version', change: { md: [{ find: 'Log one row per reminder sent.', replace: 'Log one row per reminder sent, in the events table.' }] } };
  const KEEP = { id: 'keep', label: 'Keep my draft', change: { md: [] } };

  /** v2 is in with its Data conflict, its importers are back, and Claude offered its choices: it's your turn. */
  async function atV2(): Promise<Setup> {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.body).toMatchObject({ kind: 'updated', merged: { clean: 2, conflicts: 1 } });
    await importAll(t, yes.body.importTypes, QUESTIONS.map(({ message: _message, ...item }) => item));
    const wait = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect(wait.body).toMatchObject({ kind: 'submission', groups: [{ threads: ['t-plan-changes-v2-1'] }] });
    const reply = await t.claude('/reply', { ...base, threadId: 't-plan-changes-v2-1', text: 'You log one row per send; the repo logs to the events table.', options: [MERGED, KEEP], recommended: 'merged' });
    expect(reply.status).toBe(200);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { submission: wait.body.submission } })).body).toEqual({ kind: 'timeout' });
    return t;
  }

  /** You take one of Claude's choices on the conflict in the browser. */
  async function settle(t: Setup, optionId: string) {
    await t.send('PUT', `${P}/threads/t-plan-changes-v2-1/draft`, { optionId });
    expect((await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-plan-changes-v2-1' })).body).toMatchObject({ resolved: 1 });
  }

  it('re-imports once from /open, after Not now too, when every Plan changes thread is settled, and the next /open just listens', async () => {
    const t = await atV2();
    // While the conflict is open, nothing is due, and /open just listens.
    expect((await t.send('GET', P)).body.catchUpDue).toBe(false);
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', importTypes: [], next: WAIT_NEXT });

    await settle(t, 'merged');
    expect((await t.send('GET', P)).body.catchUpDue).toBe(true);
    // Not now only declines a newer version of the plan: the catch-up is this version's, so it runs.
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: false });
    expect(open.body).toMatchObject({ kind: 'reopened', title: 'Restock alerts', next: CATCH_UP });
    expect((open.body.importTypes as { id: string }[]).map((x) => x.id)).toEqual(['architecture', 'database', 'ui', 'questions', 'concerns', 'ideas', 'testing', 'security', 'flows', 'phases']);
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', importBy: 'w-a', caughtUp: 2, reimporting: { version: 2, from: 'active', catchUp: true } });
    expect((await t.send('GET', P)).body.catchUpDue).toBe(false);

    // The importers get what settling the conflict did to the draft, with nothing left to settle.
    const pack = (await t.claude('/context', { ...base, importType: 'questions' })).body;
    expect(pack.reimport).toMatchObject({ from: 2, to: 2, catchUp: true, conflicts: [] });
    expect(pack.reimport.changes).toContain('- Log one row per reminder sent.');
    expect(pack.reimport.changes).toContain('+ Log one row per reminder sent, in the events table.');
    // Another window's dp_wait doesn't end it before this window's importers are back.
    expect((await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    expect((await readProjectFile(t.dir)).status).toBe('importing');

    const results = await importAll(t, open.body.importTypes, [{ key: 'log', summary: 'One row per reminder sent, in the events table.' }]);
    expect(results.at(-1)).toMatchObject({ importFinished: true });
    expect((await readItem(t.dir, 'questions-log')).flags).toEqual([expect.objectContaining({ reason: "Changed in the plan's v2." })]);
    const project = await readProjectFile(t.dir);
    expect(project).toMatchObject({ status: 'active', importPending: [], caughtUp: 2 });
    expect(project.reimporting).toBeUndefined();

    // Once per version: the next /dev-plumbing just listens.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', importTypes: [], next: WAIT_NEXT });
    expect((await readProjectFile(t.dir)).status).toBe('active');
  });

  it("doesn't re-import when you kept your draft, and says it waits while Claude has a thread to answer", async () => {
    const kept = await atV2();
    await settle(kept, 'keep');
    expect((await kept.send('GET', P)).body.catchUpDue).toBe(false);
    expect((await kept.claude('/open', { cwd: kept.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', importTypes: [], next: WAIT_NEXT });

    const busy = await atV2();
    await settle(busy, 'merged');
    // You asked something Claude hasn't answered yet: the window listens and answers it first, and says the catch-up
    // waits for another /dev-plumbing.
    await busy.send('PUT', `${P}/threads/t-questions-who/draft`, { text: 'Everyone.' });
    expect((await busy.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-who' })).body).toMatchObject({ sent: 1 });
    expect((await busy.send('GET', P)).body.catchUpDue).toBe(true);
    expect((await busy.claude('/open', { cwd: busy.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', importTypes: [], waitingSubmissions: 1, next: WAITS });
    expect((await busy.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'submission' });
    expect((await busy.claude('/reply', { ...base, threadId: 't-questions-who', text: 'Everyone gets them.', resolve: { decision: 'Everyone gets reminders.' } })).status).toBe(200);
    // Then the next /dev-plumbing catches the items up.
    expect((await busy.claude('/open', { cwd: busy.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', next: CATCH_UP });
  });
});

describe('versions', () => {
```
(`setup`, `Setup`, `acceptOneRow`, `rewritePlan`, `importAll`, `QUESTIONS`, `V2`, `PLAN`, `P`, `base`, `IMPORT_NEXT`, `WAIT_NEXT`, `readItem` and `readProjectFile` are already in this file.)

In `packages/mcp/test/plugin.test.ts`, in the test "asks before bringing a changed plan in, and has importers re-import by key, removing only what they list", replace:
```ts
      // Every importer writes, removals included.
      'Always call `dp_write_items` once: items, `removed`, both, or `noChanges`.',
```
with:
```ts
      // Every importer writes, removals included.
      'Always call `dp_write_items` once: items, `removed`, both, or `noChanges`.',
      // Once the Plan changes are settled, a catch-up brings in what the user chose in them.
      '- `catchUp`: true when this re-import catches the items up with settled Plan changes',
      '**A catch-up** (`catchUp: true`) comes once the user has settled every Plan changes thread of v`to`.',
      '`changes` is only what settling those threads did to the draft',
      'There are no `conflicts` to leave alone, because they\'re settled and their outcome is in `changes`.',
```

In `packages/web/src/pages/ListScreen.test.tsx`, replace:
```tsx
describe('ListScreen', () => {
```
with:
```tsx
const PLAN_CHANGES: TypeEntry = {
  ...QUESTIONS,
  id: 'plan-changes',
  title: 'Plan changes',
  order: 0,
  emptyMessage: "Nothing in the repo's new version conflicts with your draft.",
  itemCount: 1,
  withClaude: 0,
  fields: [],
  answerPresets: ['Keep my draft', "Take the repo's version"],
  addLabel: undefined,
};

describe('ListScreen', () => {
  it('says when the settled Plan changes call for a re-import, and only then', () => {
    const items = [row({ id: 'plan-changes-v2-1', threadId: 't-plan-changes-v2-1', title: 'Data', status: 'resolved', decision: 'Data: use the merged version' })];
    const show = (catchUpDue?: boolean) =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <ListScreen repo="acme-app" project="restock" data={{ type: PLAN_CHANGES, items }} {...(catchUpDue === undefined ? {} : { catchUpDue })} />
        </QueryClientProvider>,
      );
    show(true);
    const line = screen.getByTestId('catch-up-due');
    expect(line.textContent).toBe('Your Plan changes are settled. Run /dev-plumbing to catch the items up.');
    expect(line.className).toContain('text-ink-2');
    cleanup();
    show(false);
    expect(screen.queryByTestId('catch-up-due')).toBeNull();
    cleanup();
    show();
    expect(screen.queryByTestId('catch-up-due')).toBeNull();
  });
```

`packages/web/src/pages/TypeView.test.tsx`:
```tsx
import type { ProjectHome, TypeEntry } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { TypeView } from './TypeView';
import { row } from './visual/testkit';

const navigate = vi.hoisted(() => vi.fn());
const params = vi.hoisted(() => ({ repo: 'acme-app', project: 'restock', type: 'plan-changes' }));
vi.mock('@tanstack/react-router', async () => ({
  ...(await import('./visual/testkit')).routerMock(navigate),
  useParams: () => params,
  useSearch: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const entry = (id: string, title: string): TypeEntry => ({
  id,
  title,
  order: 0,
  screen: 'list',
  timeline: false,
  emptyMessage: 'Nothing here.',
  itemCount: 1,
  yourTurn: 0,
  drafts: 0,
  withClaude: 0,
  resolved: 1,
  noChanges: null,
  importFailed: false,
  fields: [],
  answerPresets: [],
});

/** TypeView on the given type's list, with the project home saying whether a catch-up is waiting. */
async function show(type: string, title: string, catchUpDue: boolean) {
  params.type = type;
  vi.spyOn(api, 'typeItems').mockResolvedValue({ type: entry(type, title), items: [row({ id: `${type}-1`, threadId: `t-${type}-1`, title: 'Data', status: 'resolved' })] });
  vi.spyOn(api, 'projectHome').mockResolvedValue({ catchUpDue } as unknown as ProjectHome);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TypeView />
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { name: title });
}

describe('TypeView', () => {
  it('says on the Plan changes list that a re-import is waiting, once the project home says so', async () => {
    await show('plan-changes', 'Plan changes', true);
    expect((await screen.findByTestId('catch-up-due')).textContent).toBe('Your Plan changes are settled. Run /dev-plumbing to catch the items up.');
  });

  it('says nothing while no catch-up is waiting, and nothing on any other list', async () => {
    // Each time, the project home has been read before looking: the line still isn't there.
    const homeRead = () => waitFor(() => expect(api.projectHome).toHaveBeenCalled()).then(() => new Promise((r) => setTimeout(r, 20)));
    await show('plan-changes', 'Plan changes', false);
    await homeRead();
    expect(screen.queryByTestId('catch-up-due')).toBeNull();
    cleanup();
    await show('questions', 'Questions', true);
    await homeRead();
    expect(screen.queryByTestId('catch-up-due')).toBeNull();
  });
});
```

- [ ] **Step 9: Run them to see them fail**

Run: `pnpm vitest run packages/service/test/update.test.ts packages/mcp/test/plugin.test.ts packages/web/src/pages/ListScreen.test.tsx packages/web/src/pages/TypeView.test.tsx`
Expected: FAIL, 6 tests: both new tests in `update.test.ts` (`/open` reopens with `importTypes: []` and no catch-up line); the plugin test "asks before bringing a changed plan in…" (`importer.md` has no `catchUp`); the new `ListScreen` test (no `catch-up-due`); both `TypeView` tests (the first can't find `catch-up-due`, and the second waits for a project home that `TypeView` doesn't read yet).

- [ ] **Step 10: Run the catch-up from `/open`**

In `packages/service/src/routes/claude.ts`, add the three functions to the `@dev-plumbing/core` import. Replace:
```ts
  checklistLines,
  claimImport,
  currentVersion,
```
with:
```ts
  catchUpDue,
  catchUpWaiting,
  checklistLines,
  claimImport,
  currentVersion,
```
and replace:
```ts
  saveProposal,
  StoreError,
```
with:
```ts
  saveProposal,
  startCatchUp,
  StoreError,
```

Replace:
```ts
const NO_REMOTE = "This repo has no git remote, so dev-plumbing can't recognise its other clones. Add one (git remote add origin <url>), then run /dev-plumbing again.";
```
with:
```ts
const NO_REMOTE = "This repo has no git remote, so dev-plumbing can't recognise its other clones. Add one (git remote add origin <url>), then run /dev-plumbing again.";
/** What the skill tells the user when /open starts the re-import that catches the items up with settled Plan changes. */
const CATCH_UP = "Your settled Plan changes touch the plan's items. Re-importing to catch them up.";
/** …and when that re-import is due but has to wait for what Claude has under way. */
const CATCH_UP_WAITS = 'Your settled Plan changes still need a re-import. It waits until Claude has answered: run /dev-plumbing again then.';
```

After `updatedLine`, replace:
```ts
  return u.conflicts ? `v${u.version}: ${merged}, ${u.conflicts} to settle in Plan changes.` : `v${u.version}: ${merged}, nothing to settle.`;
}
```
with:
```ts
  return u.conflicts ? `v${u.version}: ${merged}, ${u.conflicts} to settle in Plan changes.` : `v${u.version}: ${merged}, nothing to settle.`;
}

/** `next` with lines the skill tells the user first, as one "Tell the user" sentence, or `next` itself when there are none. */
function telling(lines: string[], next: string): string {
  return lines.length ? `Tell the user: "${lines.join(' ')}" ${next}` : next;
}
```

In `/open`, between the update check and the bookkeeping, replace:
```ts
        if (outcome?.kind === 'tell') tell = outcome.line;
        if (outcome?.kind === 'updated') update = outcome.result;
      }
      if (body.windowId) rt.listeners.seen(body.windowId, key);
```
with:
```ts
        if (outcome?.kind === 'tell') tell = outcome.line;
        if (outcome?.kind === 'updated') update = outcome.result;
      }
      // Once every Plan changes thread of the current version is settled, and settling them changed the draft, the
      // items catch up with that: one re-import, run by this window, as an update's is. After Not now too, which only
      // declines a newer version. While Claude has work under way it waits, and the user is told to run /dev-plumbing
      // again once Claude has answered (`waits` holds what has to wait, said last).
      let caughtUp = false;
      const waits: string[] = [];
      const windowId = body.windowId;
      if (!created && !update && windowId) {
        caughtUp = await rt.withLock(key, async () => {
          const version = await catchUpDue(ref.dir);
          if (version === null) {
            if ((await catchUpWaiting(ref.dir)) !== null && (await updateRefusal(ref.dir)) !== null) waits.push(CATCH_UP_WAITS);
            return false;
          }
          // Seen under the same lock, so another window's dp_wait can't end the re-import before this one starts it.
          rt.listeners.seen(windowId, key);
          return (await startCatchUp(ref.dir, { version, types: cfg.types, windowId })).importTypes.length > 0;
        });
        if (caughtUp) changed(ref);
      }
      if (body.windowId) rt.listeners.seen(body.windowId, key);
```
and in the `created`/`reopened` response at the end of `/open`, replace:
```ts
        next: tell ? `Tell the user: "${tell}" ${next}` : next,
```
with:
```ts
        next: telling([...(tell ? [tell] : []), ...(caughtUp ? [CATCH_UP] : []), ...waits], next),
```
The bookkeeping lock that follows already calls `claimImport` for this window when `importPending` has importable types; after `startCatchUp`, `importBy` is already this window, so that call changes nothing. `importTypes` is built from `importPending` as always.

- [ ] **Step 11: Tell the importer about a catch-up**

In `plugin/agents/importer.md`, in the Re-import section's list of what `reimport` has, replace:
```md
- `existing`: this type's imported items, each with its `key`, `id`, `title`, `summary`, `body`, `fields`, `mdAnchor`, `hasData` and `data` (its drawing as it is now, or null), and `removed` (an earlier version took it out of the plan).
```
with:
```md
- `existing`: this type's imported items, each with its `key`, `id`, `title`, `summary`, `body`, `fields`, `mdAnchor`, `hasData` and `data` (its drawing as it is now, or null), and `removed` (an earlier version took it out of the plan).
- `catchUp`: true when this re-import catches the items up with settled Plan changes (see A catch-up, below), false after an update.
```
and at the end of the file, replace:
```md
- Links work as at a first import: keys in your batch, or ids from `existingItems`. A reused key keeps its item's id, so links to it still hold.
```
with:
```md
- Links work as at a first import: keys in your batch, or ids from `existingItems`. A reused key keeps its item's id, so links to it still hold.

**A catch-up** (`catchUp: true`) comes once the user has settled every Plan changes thread of v`to`. `from` and `to` are both that version, and `changes` is only what settling those threads did to the draft: each change the user took, as `- ` and `+ ` lines under `@@` and the passage's heading. It holds nothing else: not the update's changes again, and not the user's answers to other items. There are no `conflicts` to leave alone, because they're settled and their outcome is in `changes`. Follow the rules above with these `changes`.
```

- [ ] **Step 12: Say on the Plan changes list that a re-import is waiting**

In `packages/web/src/pages/ListScreen.tsx`, replace:
```tsx
export function ListScreen({ repo, project, data }: { repo: string; project: string; data: { type: TypeEntry; items: TypeItemRow[] } }) {
```
with:
```tsx
/**
 * One plumbing type's items as a list. `catchUpDue`: every Plan changes thread of the plan's current version is settled,
 * and the next /dev-plumbing re-imports to catch the items up (only the Plan changes list passes it).
 */
export function ListScreen({ repo, project, data, catchUpDue = false }: { repo: string; project: string; data: { type: TypeEntry; items: TypeItemRow[] }; catchUpDue?: boolean }) {
```
and replace:
```tsx
          </Button>
        )}
      </header>
      {notice && (
```
with:
```tsx
          </Button>
        )}
      </header>
      {catchUpDue && (
        <p data-testid="catch-up-due" className="mt-2 text-[12.5px] text-ink-2">
          Your Plan changes are settled. Run /dev-plumbing to catch the items up.
        </p>
      )}
      {notice && (
```

In `packages/web/src/pages/TypeView.tsx`, replace:
```tsx
  const { data, error } = useQuery({ queryKey: ['typeItems', repo, project, type], queryFn: () => api.typeItems(repo, project, type) });
```
with:
```tsx
  const { data, error } = useQuery({ queryKey: ['typeItems', repo, project, type], queryFn: () => api.typeItems(repo, project, type) });
  const home = useQuery({ queryKey: ['projectHome', repo, project], queryFn: () => api.projectHome(repo, project) });
  // The built-in Plan changes list (core's PLAN_CHANGES) says when settling it calls for a re-import.
  const catchUpDue = type === 'plan-changes' && home.data?.catchUpDue === true;
```
and replace:
```tsx
  if (data.type.screen === 'list') return <ListScreen key={type} repo={repo} project={project} data={data} />;
```
with:
```tsx
  if (data.type.screen === 'list') return <ListScreen key={type} repo={repo} project={project} data={data} catchUpDue={catchUpDue} />;
```
(The web imports only `@dev-plumbing/core/schemas`, which doesn't export `PLAN_CHANGES`, hence the literal id.)

- [ ] **Step 13: Run the tests**

Run: `pnpm vitest run packages/core/test/catchUp.test.ts packages/core/test/context.test.ts packages/service/test/update.test.ts packages/mcp/test/plugin.test.ts packages/web/src/pages/ListScreen.test.tsx packages/web/src/pages/TypeView.test.tsx`
Expected: PASS (`update.test.ts` has 22 tests, two new; `ListScreen.test.tsx` 2; `TypeView.test.tsx` 2).

Run: `pnpm typecheck && pnpm test`
Expected: PASS (995 tests in 107 files, eleven more than before this task).

Run: `pnpm test:integration`
Expected: PASS (8 tests).

Run: `pnpm test:e2e plan-update.spec.ts list.spec.ts versions.spec.ts`
Expected: PASS (9 tests): the Plan changes list, the lists and the Versions pages are as they were.

Run: `pnpm test:e2e`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add packages/core/src/schemas/project.ts packages/core/src/store/update.ts packages/core/src/store/importItems.ts packages/core/src/store/context.ts packages/core/src/schemas/views.ts packages/core/src/store/projects.ts packages/service/src/routes/claude.ts plugin/agents/importer.md packages/web/src/pages/ListScreen.tsx packages/web/src/pages/TypeView.tsx packages/core/test/catchUp.test.ts packages/core/test/context.test.ts packages/service/test/update.test.ts packages/mcp/test/plugin.test.ts packages/web/src/pages/ListScreen.test.tsx packages/web/src/pages/TypeView.test.tsx
git commit -m "feat: once every Plan changes thread is settled, /dev-plumbing re-imports to catch the items up" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: An item shows what a re-import changed

A re-import that changes an item flags it "Changed in the plan's v<n>." and says so in its thread, but nothing shows what changed (Decision 14, view only). Now the re-import keeps the item as it left it, in `docs/versions/v<n>/reimported/<id>.json`, and `itemVersionChange` compares that with the item's copy in `docs/versions/v<n-1>/items/`, the snapshot the update to v<n> took just before its re-import: the summary and body as line diffs, the fields as `key: value` lines, and the drawing as its summary line (`dataSummary`) with what changed in it, never as JSON. So "What v<n> changed" shows only what the re-import did, not changes accepted afterwards. An item re-imported before there were such copies is compared as it is now, under "Changed since before v<n>". The thread detail carries it, and the thread shows it collapsed under the item.

**Files:**
- Create:
  - `packages/core/src/store/versionChange.ts`
  - `packages/web/src/pages/VersionChange.tsx`
- Modify:
  - `packages/core/src/schemas/views.ts` (`ItemVersionChange`; `ThreadDetail.versionChange`)
  - `packages/core/src/store/importItems.ts` (`reimportedRel`; `reimportItem` keeps the item as it left it)
  - `packages/core/src/store/update.ts` (`setAside` leaves a version's `reimported/` copies with it, as it does `merged.md`)
  - `packages/core/src/store/context.ts` (export `dataSummary`, one word)
  - `packages/core/src/store/detail.ts` (`loadThreadDetail` fills `versionChange`)
  - `packages/core/src/index.ts` (export `./store/versionChange`)
  - `packages/web/src/pages/ThreadView.tsx` (shows `VersionChange` under the item)
  - `packages/web/e2e/plan-update.spec.ts` (Plan 5's test: the importer also changes Which channels?, and its thread shows what)
- Test:
  - `packages/core/test/versionChange.test.ts` (new)
  - `packages/web/src/pages/VersionChange.test.tsx` (new)
  - `packages/web/e2e/plan-update.spec.ts`

The service's `GET …/threads/:threadId` returns `loadThreadDetail`'s result spread with `listening`, so `packages/service/src/routes/threads.ts` needs no change.

**Interfaces:**
- Consumes:
  - From Plans 1–6:
    - `diffText` (`docDiff.ts`) and `dataChangeSummary` (`dataDiff.ts`);
    - `dataSummary` (`store/context.ts`, module-private until this task exports it);
    - `stable` (`store/changes.ts`); `readItem`, `readThread` and `docPath` (`store/io.ts`); `dataKindOf`, `DiffSegment`, `Item` and `PlumbingType` (`schemas`);
    - what `reimportItem` (`store/importItems.ts`) leaves on an item it changed: the flag `Changed in the plan's v${version}.` and the system line `Updated from the plan's v${version}.`;
    - what `updatePlan` (`store/update.ts`) snapshots: `docs/versions/v<n>/items/<id>.json`, the items as they were before the update to v<n+1>;
    - Plan 5's rollback (`store/update.ts`): an update journals only what it writes itself (`created`), `removeSnapshot` removes v<n>'s `original.md`, `draft.md` and `items/` and then the folder only when it's empty, and `setAside` renames the whole v<n> folder and moves `merged.md` back;
    - in the tests, `updatePlan`, `writeImportBatch`, `loadThreadDetail`, `writeItem`, `readProjectFile`, `writeProjectFile`, `recoverUnfinishedUpdate`, `snapshotVersion`, `PLAN_CHANGES_TYPE`, `planHash`, and `DRAFT`, `pair`, `seedProject` and `TYPES` from `fixtures.ts`.
  - From Task 7: `reimportItem(dir, old, given, opening, reimport, now)`, which takes `{ version, catchUp? }`, and a catch-up's thread line "Updated to match your settled Plan changes.", which names no version. A catch-up re-imports v<n> again, so it writes v<n>'s copy again: the view then shows from before v<n> to after the catch-up.
- Produces, as in the header's Contracts:
  ```ts
  // schemas/views.ts
  export type ItemVersionChange = { version: number; since: boolean; summary: DiffSegment[] | null; body: DiffSegment[] | null; fields: DiffSegment[] | null; drawing: DiffSegment[] | null };
  // ThreadDetail gains: versionChange: ItemVersionChange | null
  // store/importItems.ts
  export const reimportedRel: (n: number, itemId: string) => string;   // docs/versions/v<n>/reimported/<id>.json
  // store/versionChange.ts
  export async function itemVersionChange(dir: string, itemId: string, types: PlumbingType[]): Promise<ItemVersionChange | null>;
  // store/context.ts: dataSummary is exported, unchanged
  export function dataSummary(item: Item, type: PlumbingType | undefined): string | null;
  // web/src/pages/VersionChange.tsx
  export function VersionChange(props: { change: ItemVersionChange }): JSX.Element;
  ```
  - `ItemVersionChange` lives in `schemas/views.ts`, beside `DiffSegment` and `ThreadDetail`, so the web imports it from `@dev-plumbing/core/schemas`. The Contracts list it under `store/versionChange.ts`; that file imports it from `../schemas` and doesn't export it again, since `index.ts` exports both modules.
- **Rules:**
  - **The copy after:** when `reimportItem` changes an item, it also writes the item exactly as it left it to `docs/versions/v<n>/reimported/<id>.json` (`reimportedRel`), with `writeJsonAtomic`, beside v<n>'s `merged.md`. A catch-up's re-import of v<n> writes it again. The re-import writes it after its update committed, so no update journal lists it: putting an update to v<n+1> back leaves it where it is (`removeSnapshot` removes v<n>'s folder only when it's empty), and `setAside` moves it back to v<n> with `merged.md`.
  - **The version:** the newest `n` among the item's flags whose reason matches `^Changed in the plan's v([1-9][0-9]*)\.$`, its thread's system messages matching `^Updated from the plan's v([1-9][0-9]*)\.$`, and the versions that have a `reimported/` copy of it. Answering a thread clears the item's flags (`submit.ts`), so the line and the copies are what keep it after you answer (a catch-up's line names no version). With none, it's null.
  - **The copy before:** `readItem(docPath(dir, 'docs/versions/v<n-1>'), itemId)`: the snapshot folder has the project's `items/<id>.json` layout. A missing or unreadable copy gives null.
  - **Each part** is a `diffText` of the before and after text, or null when the texts are equal:
    - `summary`: the summary, ending in `\n`;
    - `body`: the body (`''` when absent), ending in `\n` when it isn't empty;
    - `fields`: one `key: value\n` line per field with a non-empty value, in the type's `fields` order, then any others by name. An empty field is no field, as the re-import compares them;
    - `drawing`: null when `stable(before.data ?? null) === stable(after.data ?? null)`. Otherwise the before text is its summary line and `\n`, and the after text is its summary line, `\n`, and, when the type has a drawing kind and the item still has data, `dataChangeSummary(kind, before.data, after.data)` joined with `, `, its first letter capitalised, and `\n`. The summary line is `dataSummary(item, type)`, or `No drawing` for no data, or `A drawing that can't be read` for data that doesn't parse.
  - All four null means the re-import changed something else only, its title, links or code references: the thread says "Nothing else changed.".
  - **What's compared:** the copy before against the `reimported/` copy, so a change accepted in the item's thread after the re-import doesn't show: the view is what v<n>'s re-import did. When there's no `reimported/` copy (an item re-imported before Plan 7), it falls back to the item as it is now, and `since` is true.
- **The web:** `VersionChange` is a `<details>` (`data-testid="version-change"`), closed by default, with the summary `What v${n} changed`, or `Changed since before v${n}` when `since` is true. Inside, for each part that isn't null, in the order Summary, Details, Fields, Drawing, a `<section aria-label>` with an `<h3>` of that name and a `DiffView`. With none, the line "Nothing else changed.". `ThreadView` shows it under `ItemCard` when `versionChange` isn't null.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/versionChange.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PLAN_CHANGES_TYPE } from '../src/planChanges';
import type { DiagramData, ImportItem, Item } from '../src/schemas';
import { loadThreadDetail } from '../src/store/detail';
import { writeImportBatch } from '../src/store/importItems';
import { readItem, readProjectFile, writeItem, writeProjectFile } from '../src/store/io';
import { recoverUnfinishedUpdate, updatePlan } from '../src/store/update';
import { itemVersionChange } from '../src/store/versionChange';
import { planHash, snapshotVersion } from '../src/store/versions';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const T2 = new Date('2026-10-05T10:00:00.000Z');
const T3 = new Date('2026-10-06T10:00:00.000Z');
const types = [...TYPES, PLAN_CHANGES_TYPE];
const V2 = DRAFT.replace('A daily job', 'An hourly job');
const V3 = V2.replace('Log reminders in a table.', 'Log reminders in the events table.');
const MAP: DiagramData = {
  kind: 'system',
  groups: [{ id: 'worker', label: 'apps/worker' }],
  nodes: [
    { id: 'job', label: 'Daily reminder job', group: 'worker', status: 'new' },
    { id: 'db', label: 'Postgres', status: 'unchanged' },
  ],
  edges: [{ id: 'e1', from: 'job', to: 'db', label: 'finds due' }],
};
/** v2's map: a new box, and a line to it. */
const MAP_V2: DiagramData = {
  ...MAP,
  nodes: [...MAP.nodes, { id: 'sms', label: 'SMS provider', status: 'new' }],
  edges: [...MAP.edges, { id: 'e2', from: 'job', to: 'sms', label: 'sends' }],
};
/** v2's map of the flow: the same boxes, one relabelled. */
const FLOW: DiagramData = { kind: 'data_flow', groups: [], nodes: [{ id: 'job', label: 'Daily job', status: 'new' }, { id: 'db', label: 'Postgres', status: 'unchanged' }], edges: [] };
const FLOW_V2: DiagramData = { ...FLOW, nodes: [{ id: 'job', label: 'Hourly job', status: 'new' }, FLOW.nodes[1]!] };

/** An item an importer wrote for `key` at v1 (id <type>-<key>), with a thread that's idle. */
function imported(key: string, o: { type?: string; item?: Partial<Item> } = {}) {
  const type = o.type ?? 'questions';
  const p = pair(`${type}-${key}`, { type, title: `Question ${key}`, status: 'idle', messages: [] });
  return { ...p, item: { ...p.item, key, ...o.item } };
}

/** A project at v1, with the items the tests change. */
const seed = () =>
  seedProject({
    project: { source: { path: 'docs/specs/restock.md', clone: '/tmp/acme', branch: 'main', hashAtImport: planHash(DRAFT) } },
    pairs: [
      imported('who', { item: { summary: 'Everyone, or only active subscribers?', body: 'Line one.\nLine two.', fields: { blocking: 'false', default: 'Everyone' } } }),
      imported('when', { item: { fields: { blocking: 'false' } } }),
      imported('same'),
      imported('renamed'),
      imported('map', { type: 'architecture', item: { data: MAP } }),
      imported('flow', { type: 'architecture', item: { data: FLOW } }),
    ],
  });

/** Brings `repoText` in as the next version, then the importers send `batches` (type id → items), "no changes" for the rest. */
async function reimport(dir: string, repoText: string, batches: Record<string, ImportItem[]>, now: Date) {
  const update = await updatePlan(dir, { repoText, clone: '/tmp/acme', branch: 'main', commit: null, types, now });
  for (const id of update.importTypes) {
    const type = types.find((t) => t.id === id)!;
    const items = batches[id];
    await writeImportBatch({ dir, type, types, clone: '/tmp/acme', now, batch: items ? { items } : { noChanges: 'Nothing changed for this type.' } });
  }
}

/** The project at v2, its importers having changed who, when, renamed, map and flow, and left same as it was. */
async function atV2() {
  const dir = await seed();
  await reimport(
    dir,
    V2,
    {
      questions: [
        { key: 'who', summary: 'Only active subscribers, at first.', body: 'Line one.\nLine 2.' },
        { key: 'when', fields: { blocking: 'true' } },
        { key: 'same', title: 'Question same', summary: 'A summary.' },
        { key: 'renamed', title: 'When do reminders go out?' },
        { key: 'new', title: 'Which channel?', summary: 'SMS or email.' },
      ],
      architecture: [
        { key: 'map', data: MAP_V2 },
        { key: 'flow', data: FLOW_V2 },
      ],
    },
    T2,
  );
  return dir;
}

describe('what a re-import changed in an item', () => {
  it('diffs the summary and the body, line by line, and leaves out what stayed the same', async () => {
    const dir = await atV2();
    expect(await itemVersionChange(dir, 'questions-who', types)).toEqual({
      version: 2,
      since: false,
      summary: [
        { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
        { kind: 'added', text: 'Only active subscribers, at first.\n' },
      ],
      body: [
        { kind: 'same', text: 'Line one.\n' },
        { kind: 'removed', text: 'Line two.\n' },
        { kind: 'added', text: 'Line 2.\n' },
      ],
      fields: null,
      drawing: null,
    });
  });

  it('diffs the fields as key: value lines', async () => {
    const dir = await atV2();
    expect(await itemVersionChange(dir, 'questions-when', types)).toEqual({
      version: 2,
      since: false,
      summary: null,
      body: null,
      fields: [
        { kind: 'removed', text: 'blocking: false\n' },
        { kind: 'added', text: 'blocking: true\n' },
      ],
      drawing: null,
    });
  });

  it('diffs the drawing as its summary line, and says what changed in it', async () => {
    const dir = await atV2();
    expect((await itemVersionChange(dir, 'architecture-map', types))?.drawing).toEqual([
      { kind: 'removed', text: 'System diagram: 2 boxes, 1 group\n' },
      { kind: 'added', text: 'System diagram: 3 boxes, 1 group\n1 box added, 1 line added\n' },
    ]);
    // A relabelled box leaves the summary line as it was: what changed says so.
    expect(await itemVersionChange(dir, 'architecture-flow', types)).toEqual({
      version: 2,
      since: false,
      summary: null,
      body: null,
      fields: null,
      drawing: [
        { kind: 'same', text: 'Data flow diagram: 2 boxes\n' },
        { kind: 'added', text: '1 box changed\n' },
      ],
    });
  });

  it('has nothing to show when only something else changed, such as the title', async () => {
    const dir = await atV2();
    expect(await readItem(dir, 'questions-renamed')).toMatchObject({ title: 'When do reminders go out?', flags: [{ reason: "Changed in the plan's v2." }] });
    expect(await itemVersionChange(dir, 'questions-renamed', types)).toEqual({ version: 2, since: false, summary: null, body: null, fields: null, drawing: null });
  });

  it("is null for an item the re-import didn't change, and for one it added", async () => {
    const dir = await atV2();
    expect(await itemVersionChange(dir, 'questions-same', types)).toBeNull();
    expect(await itemVersionChange(dir, 'questions-new', types)).toBeNull();
    expect(await itemVersionChange(dir, 'questions-nope', types)).toBeNull();
  });

  it('is null when the version snapshot has no copy of the item', async () => {
    const dir = await atV2();
    await fs.rm(path.join(dir, 'docs', 'versions', 'v1', 'items', 'questions-who.json'));
    expect(await itemVersionChange(dir, 'questions-who', types)).toBeNull();
  });

  it("still shows once the flag is cleared, as answering the thread does, from the thread's line", async () => {
    const dir = await atV2();
    const { flags: _flags, ...answered } = await readItem(dir, 'questions-when');
    await writeItem(dir, answered);
    expect((await itemVersionChange(dir, 'questions-when', types))?.fields).toEqual([
      { kind: 'removed', text: 'blocking: false\n' },
      { kind: 'added', text: 'blocking: true\n' },
    ]);
  });

  it('shows the newest version that changed the item, against the snapshot taken just before it', async () => {
    const dir = await atV2();
    await reimport(dir, V3, { questions: [{ key: 'who', summary: 'Active subscribers, then everyone.' }] }, T3);
    expect(await itemVersionChange(dir, 'questions-who', types)).toEqual({
      version: 3,
      since: false,
      summary: [
        { kind: 'removed', text: 'Only active subscribers, at first.\n' },
        { kind: 'added', text: 'Active subscribers, then everyone.\n' },
      ],
      body: null,
      fields: null,
      drawing: null,
    });
    // v3 left when alone: it still shows what v2 changed.
    expect((await itemVersionChange(dir, 'questions-when', types))?.version).toBe(2);
  });

  it("shows only what the re-import did: a change accepted afterwards isn't in it", async () => {
    const dir = await atV2();
    // An accepted change rewrites the item's summary after the re-import, and clears its flag.
    const { flags: _flags, ...item } = await readItem(dir, 'questions-who');
    await writeItem(dir, { ...item, summary: 'Active subscribers who opted in.' });
    expect((await itemVersionChange(dir, 'questions-who', types))?.summary).toEqual([
      { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
      { kind: 'added', text: 'Only active subscribers, at first.\n' },
    ]);
    // The re-import's own copy, beside v2's merged.md, is the item as it left it.
    const copy = JSON.parse(await fs.readFile(path.join(dir, 'docs', 'versions', 'v2', 'reimported', 'questions-who.json'), 'utf8'));
    expect(copy).toMatchObject({ id: 'questions-who', summary: 'Only active subscribers, at first.', flags: [{ reason: "Changed in the plan's v2." }] });
    // Only changed items have one.
    expect((await fs.readdir(path.join(dir, 'docs', 'versions', 'v2', 'reimported'))).sort()).toEqual(
      ['architecture-flow', 'architecture-map', 'questions-renamed', 'questions-when', 'questions-who'].map((id) => `${id}.json`),
    );
  });

  it("compares with the item as it is now, as changed since before v<n>, when the re-import kept no copy", async () => {
    // A re-import from before Plan 7 kept none.
    const dir = await atV2();
    await fs.rm(path.join(dir, 'docs', 'versions', 'v2', 'reimported'), { recursive: true });
    const { flags: _flags, ...item } = await readItem(dir, 'questions-who');
    await writeItem(dir, { ...item, summary: 'Active subscribers who opted in.' });
    expect(await itemVersionChange(dir, 'questions-who', types)).toMatchObject({
      version: 2,
      since: true,
      summary: [
        { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
        { kind: 'added', text: 'Active subscribers who opted in.\n' },
      ],
    });
  });

  it("a catch-up's re-import of the same version writes its copy again, and still names v<n>", async () => {
    const dir = await atV2();
    // A catch-up re-imports v2 again (Task 7), and changes who once more. Its thread line names no version.
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), status: 'importing', importPending: ['questions'], reimporting: { version: 2, from: 'active', catchUp: true } });
    const questions = types.find((t) => t.id === 'questions')!;
    await writeImportBatch({ dir, type: questions, types, clone: '/tmp/acme', now: T3, batch: { items: [{ key: 'who', summary: 'Active subscribers, by email.' }] } });
    const { flags: _flags, ...answered } = await readItem(dir, 'questions-who');
    await writeItem(dir, answered);
    expect(await itemVersionChange(dir, 'questions-who', types)).toMatchObject({
      version: 2,
      since: false,
      summary: [
        { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
        { kind: 'added', text: 'Active subscribers, by email.\n' },
      ],
    });
  });

  it('keeps the copies with their version when an update to the next one is put back or set aside', async () => {
    const dir = await atV2();
    const versions = path.join(dir, 'docs', 'versions');
    const draft = await fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8');
    /** An update to v3 that stopped before project.json, with v2's snapshot and its journal, as Plan 5 leaves one. */
    const stopped = async (merged: string) => {
      await fs.writeFile(path.join(versions, 'v2', 'update.json'), JSON.stringify({ to: 3, created: ['docs/versions/v3', 'docs/versions/v3/merged.md'], wrote: { draft: planHash(merged), original: planHash(V3) } }));
      await snapshotVersion(dir, 2);
      await fs.mkdir(path.join(versions, 'v3'), { recursive: true });
      await fs.writeFile(path.join(versions, 'v3', 'merged.md'), merged);
      await fs.writeFile(path.join(dir, 'docs', 'draft.md'), merged);
      await fs.writeFile(path.join(dir, 'docs', 'original.md'), V3);
    };
    // Put back whole: v2's snapshot goes, and its folder stays for merged.md and the copies.
    await stopped(`${draft}\nThe update's merge.\n`);
    expect(await recoverUnfinishedUpdate(dir, T3)).toMatchObject({ recovered: true, setAside: null });
    expect((await fs.readdir(path.join(versions, 'v2'))).sort()).toEqual(['merged.md', 'reimported']);
    // Set aside, because you changed the draft since: the copies go back to v2 with merged.md, not with the leftover.
    await stopped(`${draft}\nThe update's merge.\n`);
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), `${draft}\nThe update's merge, and your edit.\n`);
    const note = await recoverUnfinishedUpdate(dir, T3);
    expect(note).toMatchObject({ recovered: true, setAside: 'docs/versions/v2.unfinished-20261006100000' });
    expect((await fs.readdir(path.join(versions, 'v2'))).sort()).toEqual(['merged.md', 'reimported']);
    expect((await fs.readdir(path.join(versions, 'v2.unfinished-20261006100000'))).sort()).toEqual(['draft.md', 'items', 'original.md', 'update.json']);
    expect((await itemVersionChange(dir, 'questions-who', types))?.summary).toEqual([
      { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
      { kind: 'added', text: 'Only active subscribers, at first.\n' },
    ]);
  });

  it('comes with the thread', async () => {
    const dir = await atV2();
    const detail = await loadThreadDetail({ dir, threadId: 't-questions-who', types });
    expect(detail.versionChange).toEqual(await itemVersionChange(dir, 'questions-who', types));
    expect(detail.versionChange?.version).toBe(2);
    expect((await loadThreadDetail({ dir, threadId: 't-questions-same', types })).versionChange).toBeNull();
  });
});
```

Create `packages/web/src/pages/VersionChange.test.tsx`:
```tsx
import type { ItemVersionChange } from '@dev-plumbing/core/schemas';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VersionChange } from './VersionChange';

afterEach(cleanup);

const NOTHING: ItemVersionChange = { version: 2, since: false, summary: null, body: null, fields: null, drawing: null };
const CHANGED: ItemVersionChange = {
  version: 3,
  since: false,
  summary: [
    { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
    { kind: 'added', text: 'Only active subscribers, at first.\n' },
  ],
  body: null,
  fields: [
    { kind: 'removed', text: 'blocking: false\n' },
    { kind: 'added', text: 'blocking: true\n' },
  ],
  drawing: [
    { kind: 'same', text: 'System diagram: 2 boxes\n' },
    { kind: 'added', text: '1 box changed\n' },
  ],
};

describe('What v<n> changed', () => {
  it('is folded away, and shows a diff for each part that changed, in order', () => {
    render(<VersionChange change={CHANGED} />);
    const section = screen.getByTestId('version-change') as HTMLDetailsElement;
    expect(section.tagName).toBe('DETAILS');
    expect(section.open).toBe(false);
    expect(within(section).getByText('What v3 changed').tagName).toBe('SUMMARY');
    // Details didn't change, so it isn't there.
    expect(within(section).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Summary', 'Fields', 'Drawing']);
    const summary = within(section).getByRole('region', { name: 'Summary' });
    expect(summary.textContent).toContain('− Everyone, or only active subscribers?');
    expect(summary.textContent).toContain('+ Only active subscribers, at first.');
    const fields = within(section).getByRole('region', { name: 'Fields' });
    expect(fields.textContent).toContain('− blocking: false');
    expect(fields.textContent).toContain('+ blocking: true');
    const drawing = within(section).getByRole('region', { name: 'Drawing' });
    expect(drawing.textContent).toContain('System diagram: 2 boxes');
    expect(drawing.textContent).toContain('+ 1 box changed');
    expect(screen.queryByText('Nothing else changed.')).toBeNull();
  });

  it('says nothing else changed when only the flag was set', () => {
    render(<VersionChange change={NOTHING} />);
    const section = screen.getByTestId('version-change');
    expect(within(section).getByText('What v2 changed')).toBeTruthy();
    expect(within(section).getByText('Nothing else changed.')).toBeTruthy();
    expect(within(section).queryByRole('heading')).toBeNull();
    expect(within(section).queryByTestId('diff')).toBeNull();
  });

  it('says the item changed since before v<n> when the re-import kept no copy of what it did', () => {
    render(<VersionChange change={{ ...CHANGED, since: true }} />);
    const section = screen.getByTestId('version-change');
    expect(within(section).getByText('Changed since before v3').tagName).toBe('SUMMARY');
    expect(within(section).queryByText('What v3 changed')).toBeNull();
  });
});
```
(`DiffView` marks a removed line `− ` with U+2212, and an added one `+ `.)

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/versionChange.test.ts packages/web/src/pages/VersionChange.test.tsx`
Expected: FAIL. Both files fail to load: `../src/store/versionChange` and `./VersionChange` don't exist yet ("Failed to load url" / "Failed to resolve import … Does the file exist?").

- [ ] **Step 3: The type, and the thread detail's field**

In `packages/core/src/schemas/views.ts`, replace:
```ts
export type FieldChange = { field: string; before: string; after: string };
```
with:
```ts
export type FieldChange = { field: string; before: string; after: string };
/**
 * What the newest plan version that changed an item changed in it: its summary, body, fields (as `key: value` lines)
 * and drawing (as summary lines), each as a line diff from the item before that version's re-import to the item as the
 * re-import left it, or null when that part is the same. `since`: the re-import kept no copy (it ran before Plan 7),
 * so it's compared with the item as it is now, which may hold changes made after it.
 */
export type ItemVersionChange = { version: number; since: boolean; summary: DiffSegment[] | null; body: DiffSegment[] | null; fields: DiffSegment[] | null; drawing: DiffSegment[] | null };
```
and, in `ThreadDetail`, replace:
```ts
  /** For a pin ("Ask about this box", + Pin): the item it's on. */
  anchorParent: { itemId: string; threadId: string; title: string; typeId: string } | null;
};
```
with:
```ts
  /** For a pin ("Ask about this box", + Pin): the item it's on. */
  anchorParent: { itemId: string; threadId: string; title: string; typeId: string } | null;
  /** What the newest plan version whose re-import changed the item changed in it, or null when none did. */
  versionChange: ItemVersionChange | null;
};
```

In `packages/core/src/store/context.ts`, export `dataSummary` (the function is otherwise unchanged). Replace:
```ts
/** A short phrase saying what an item's drawing holds, or null when it has none, or none that parses. */
function dataSummary(item: Item, type: PlumbingType | undefined): string | null {
```
with:
```ts
/** A short phrase saying what an item's drawing holds, or null when it has none, or none that parses. */
export function dataSummary(item: Item, type: PlumbingType | undefined): string | null {
```

- [ ] **Step 4: Write `itemVersionChange`**

Create `packages/core/src/store/versionChange.ts`:
```ts
import fs from 'node:fs/promises';
import { dataChangeSummary } from '../dataDiff';
import { diffText } from '../docDiff';
import { dataKindOf, itemSchema, type DiffSegment, type Item, type ItemVersionChange, type PlumbingType } from '../schemas';
import { stable } from './changes';
import { dataSummary } from './context';
import { reimportedRel } from './importItems';
import { docPath, readItem, readJsonFile, readThread } from './io';

// What a re-import leaves behind on an item it changed (reimportItem): the flag "Changed in the plan's v<n>.", the
// thread's line "Updated from the plan's v<n>." (a catch-up's names no version), and the item as it left it, in
// docs/versions/v<n>/reimported/. Answering the thread clears the flag, so the line and the copies are read too.
const FLAGGED = /^Changed in the plan's v([1-9][0-9]*)\.$/;
const UPDATED = /^Updated from the plan's v([1-9][0-9]*)\.$/;

/** The item as v<n>'s re-import left it, or null when it kept no copy (one from before Plan 7) or it can't be read. */
async function reimported(dir: string, n: number, itemId: string): Promise<Item | null> {
  const read = await readJsonFile(docPath(dir, reimportedRel(n, itemId)));
  const parsed = read.ok ? itemSchema.safeParse(read.value) : null;
  return parsed?.success ? parsed.data : null;
}

/** The versions whose re-import kept a copy of this item. */
async function copiedIn(dir: string, itemId: string): Promise<number[]> {
  const folders = await fs.readdir(docPath(dir, 'docs/versions')).catch((): string[] => []);
  const versions: number[] = [];
  for (const folder of folders) {
    const n = /^v([1-9][0-9]*)$/.exec(folder)?.[1];
    if (n && (await fs.stat(docPath(dir, reimportedRel(Number(n), itemId))).catch(() => null))) versions.push(Number(n));
  }
  return versions;
}

/** Text as whole lines, each ending in \n, so a line diff never pairs a last line with the next one. */
const lines = (text: string) => (text === '' || text.endsWith('\n') ? text : `${text}\n`);

/** The diff of two texts, or null when they're the same. */
const diffOrNull = (before: string, after: string): DiffSegment[] | null => (before === after ? null : diffText(before, after));

/** The item's fields as `key: value` lines, in the type's order, then any others by name. An empty field is no field. */
function fieldLines(item: Item, type: PlumbingType | undefined): string {
  const order = type?.fields ?? [];
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
  return Object.entries(item.fields ?? {})
    .filter(([, value]) => value !== '')
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([key, value]) => `${key}: ${value}\n`)
    .join('');
}

/** What an item's drawing holds, in one line (dataSummary), or what stands in for it. */
function drawingLine(item: Item, type: PlumbingType | undefined): string {
  if (item.data === undefined || item.data === null) return 'No drawing';
  return dataSummary(item, type) ?? "A drawing that can't be read";
}

/**
 * The drawing, compared as words, not JSON: its summary line before and after, and after it, what changed
 * (dataChangeSummary: "1 box added, 1 line changed"). Null when the data is the same.
 */
function drawingChange(before: Item, after: Item, type: PlumbingType | undefined): DiffSegment[] | null {
  if (stable(before.data ?? null) === stable(after.data ?? null)) return null;
  const kind = type ? dataKindOf(type) : null;
  const what = kind && after.data !== undefined && after.data !== null ? dataChangeSummary(kind, before.data, after.data) : [];
  const said = what.length ? `${what.join(', ').replace(/^./, (c) => c.toUpperCase())}\n` : '';
  return diffText(`${drawingLine(before, type)}\n`, `${drawingLine(after, type)}\n${said}`);
}

/**
 * What the newest plan version that changed this item changed in it (spec §15.4, view only): its copy in
 * docs/versions/v<n-1>/items/, the snapshot the update to v<n> took before its re-import, against the item as that
 * re-import left it (docs/versions/v<n>/reimported/), so a change accepted afterwards isn't in it. With no such copy (a
 * re-import from before Plan 7) it's the item as it is now, and `since` says so. `n` is the newest version whose
 * re-import changed it, from its flag, its thread's line or its copies. Each part is a line diff, or null when it's
 * the same; all four null means only something else changed (its title, links or code references). Null when no
 * re-import changed the item, or the snapshot has no copy of it.
 */
export async function itemVersionChange(dir: string, itemId: string, types: PlumbingType[]): Promise<ItemVersionChange | null> {
  const item = await readItem(dir, itemId).catch(() => null);
  if (!item) return null;
  const thread = await readThread(dir, item.threadId).catch(() => null);
  const versions = [
    ...(item.flags ?? []).map((f) => FLAGGED.exec(f.reason)?.[1]),
    ...(thread?.messages ?? []).map((m) => (m.author === 'system' ? UPDATED.exec(m.text)?.[1] : undefined)),
  ].flatMap((n) => (n ? [Number(n)] : []));
  versions.push(...(await copiedIn(dir, item.id)));
  if (!versions.length) return null;
  const version = Math.max(...versions);
  // The snapshot folder has the same items/<id>.json layout as the project, so it reads like one.
  const before = await readItem(docPath(dir, `docs/versions/v${version - 1}`), item.id).catch(() => null);
  if (!before) return null;
  const left = await reimported(dir, version, item.id);
  const after = left ?? item;
  const type = types.find((t) => t.id === item.type);
  return {
    version,
    since: left === null,
    summary: diffOrNull(lines(before.summary), lines(after.summary)),
    body: diffOrNull(lines(before.body ?? ''), lines(after.body ?? '')),
    fields: diffOrNull(fieldLines(before, type), fieldLines(after, type)),
    drawing: drawingChange(before, after, type),
  };
}
```

A re-import keeps the item as it left it. In `packages/core/src/store/importItems.ts`, replace:
```ts
import path from 'node:path';
import { dataKindOf, dataProblems,
```
with:
```ts
import path from 'node:path';
import { writeJsonAtomic } from '../atomic';
import { dataKindOf, dataProblems,
```
replace:
```ts
import { InputError, newId, readDocText, readItems, readProjectFile, readThread, writeItem, writeProjectFile, writeThread } from './io';
```
with:
```ts
import { docPath, InputError, newId, readDocText, readItems, readProjectFile, readThread, writeItem, writeProjectFile, writeThread } from './io';
```
replace:
```ts
const systemLine = (now: Date, text: string): Message => ({ id: newId('m', now), at: now.toISOString(), author: 'system', text });
```
with:
```ts
const systemLine = (now: Date, text: string): Message => ({ id: newId('m', now), at: now.toISOString(), author: 'system', text });

/**
 * Where a re-import of v<n> keeps an item it changed, as it left it, beside v<n>'s merged.md: "What v<n> changed"
 * (itemVersionChange) compares it with the item before v<n>, so changes accepted afterwards don't show.
 */
export const reimportedRel = (n: number, itemId: string) => `docs/versions/v${n}/reimported/${itemId}.json`;
```
and in `reimportItem` (as Task 7 left it), replace:
```ts
  await writeItem(
    dir,
    changed
      ? withoutEmpty(withFlag({ ...kept, ...given }, { reason: `Changed in the plan's v${version}.`, fromThreadId: old.threadId, at: now.toISOString() }))
      : kept,
  );
```
with:
```ts
  const after = changed
    ? withoutEmpty(withFlag({ ...kept, ...given }, { reason: `Changed in the plan's v${version}.`, fromThreadId: old.threadId, at: now.toISOString() }))
    : kept;
  await writeItem(dir, after);
  // The item as this re-import left it. A catch-up's re-import of v<n> writes it again. It's written after the update
  // committed, so no update journal lists it, and putting an update to v<n+1> back leaves it with v<n>.
  if (changed) await writeJsonAtomic(docPath(dir, reimportedRel(version, after.id)), after);
```

Setting an update aside keeps the copies with their version. In `packages/core/src/store/update.ts`, replace:
```ts
 * When putting an update back left a changed working file as it is, moves that update's snapshot and journal to
 * docs/versions/v<n>.unfinished-<UTC time>/, in one rename: nothing in them is lost, and v<n> is free for the next
 * update's snapshot. A merged.md from the update that brought v<n> in belongs to v<n>, so it goes back there.
```
with:
```ts
 * When putting an update back left a changed working file as it is, moves that update's snapshot and journal to
 * docs/versions/v<n>.unfinished-<UTC time>/, in one rename: nothing in them is lost, and v<n> is free for the next
 * update's snapshot. A merged.md from the update that brought v<n> in, and the reimported/ copies its re-import kept,
 * belong to v<n>, so they go back there.
```
and replace:
```ts
  if (await lstat(path.join(aside, 'merged.md'))) {
    // If it can't go back, it stays with the rest: nothing is lost, and v<n> isn't left as an empty folder.
    await fs
      .mkdir(folder, { recursive: true })
      .then(() => fs.rename(path.join(aside, 'merged.md'), path.join(folder, 'merged.md')))
      .catch(() => fs.rmdir(folder).catch(quiet));
  }
```
with:
```ts
  for (const own of ['merged.md', 'reimported']) {
    if (!(await lstat(path.join(aside, own)))) continue;
    // If it can't go back, it stays with the rest: nothing is lost, and v<n> isn't left as an empty folder.
    await fs
      .mkdir(folder, { recursive: true })
      .then(() => fs.rename(path.join(aside, own), path.join(folder, own)))
      .catch(() => fs.rmdir(folder).catch(quiet));
  }
```
`removeSnapshot`, which puts an update back with nothing to set aside, removes v<n>'s `original.md`, `draft.md` and `items/`, and v<n>'s folder only when it's empty, so the copies stay there as they are.

In `packages/core/src/store/detail.ts`, replace:
```ts
import { openOptions } from './threads';
```
with:
```ts
import { openOptions } from './threads';
import { itemVersionChange } from './versionChange';
```
and, at the end of the object `loadThreadDetail` returns, replace:
```ts
    anchorParent: parent ? { itemId: parent.id, threadId: parent.threadId, title: parent.title, typeId: parent.type } : null,
  };
```
with:
```ts
    anchorParent: parent ? { itemId: parent.id, threadId: parent.threadId, title: parent.title, typeId: parent.type } : null,
    versionChange: await itemVersionChange(o.dir, item.id, o.types),
  };
```

In `packages/core/src/index.ts`, replace:
```ts
export * from './store/update';
```
with:
```ts
export * from './store/update';
export * from './store/versionChange';
```

- [ ] **Step 5: Show it in the thread**

Create `packages/web/src/pages/VersionChange.tsx`:
```tsx
import type { DiffSegment, ItemVersionChange } from '@dev-plumbing/core/schemas';
import { DiffView } from '../components/DiffView';

/**
 * What the newest plan version that changed this item changed in it, folded away until you open it: a diff of each
 * part that changed, or "Nothing else changed." when the re-import changed only something else (its title, say). A
 * re-import from before Plan 7 kept no copy of what it left, so that one is "Changed since before v<n>".
 */
export function VersionChange({ change }: { change: ItemVersionChange }) {
  const parts: [string, DiffSegment[] | null][] = [
    ['Summary', change.summary],
    ['Details', change.body],
    ['Fields', change.fields],
    ['Drawing', change.drawing],
  ];
  const changed = parts.filter((p): p is [string, DiffSegment[]] => p[1] !== null);
  return (
    <details className="mt-3 rounded-[10px] border-[0.5px] border-separator px-4 py-2.5" data-testid="version-change">
      <summary className="cursor-pointer text-[12.5px] text-slate">{change.since ? `Changed since before v${change.version}` : `What v${change.version} changed`}</summary>
      {changed.length ? (
        changed.map(([label, segments]) => (
          <section key={label} aria-label={label} className="mt-2.5">
            <h3 className="text-[11px] font-semibold text-ink-3">{label}</h3>
            <DiffView segments={segments} />
          </section>
        ))
      ) : (
        <p className="mt-2 text-[12.5px] text-ink-3">Nothing else changed.</p>
      )}
    </details>
  );
}
```

In `packages/web/src/pages/ThreadView.tsx`, replace:
```tsx
import { ReviewedMark } from './ReviewedMark';
```
with:
```tsx
import { ReviewedMark } from './ReviewedMark';
import { VersionChange } from './VersionChange';
```
and replace:
```tsx
      <ItemCard detail={d} repo={repo} project={project} />
```
with:
```tsx
      <ItemCard detail={d} repo={repo} project={project} />
      {d.versionChange && <VersionChange change={d.versionChange} />}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/core/test/versionChange.test.ts packages/web/src/pages/VersionChange.test.tsx packages/core/test/detail.test.ts`
Expected: PASS (13, 3 and the detail tests unchanged).

- [ ] **Step 7: The e2e: the changed item's thread says what v2 changed**

In `packages/web/e2e/plan-update.spec.ts` (Plan 5's test), the Questions importer now also changes Which channels?'s summary. Replace:
```ts
      // Questions says v2 took out the part How long to keep reminder rows? came from. Which channels? is untouched.
      ...(t.id === 'questions' ? { removed: ['log'] } : { noChanges: 'Nothing changed for this type.' }),
```
with:
```ts
      // Questions says v2 took out the part How long to keep reminder rows? came from, and Which channels? now says push.
      ...(t.id === 'questions'
        ? { items: [{ key: 'channels', summary: 'SMS, push or both.' }], removed: ['log'] }
        : { noChanges: 'Nothing changed for this type.' }),
```
and, before the Finalize part at the end, replace:
```ts
  // Finalize leaves it out, and says why. The settled conflict no longer blocks.
```
with:
```ts
  // Which channels? changed in v2: its thread says what, folded away until you open it.
  await page.goto(`${p.url}/th/t-questions-channels`);
  const changed = page.getByTestId('version-change');
  await expect(changed.getByText('What v2 changed', { exact: true })).toBeVisible();
  await expect(changed.getByRole('region', { name: 'Summary' })).toBeHidden();
  await changed.getByText('What v2 changed', { exact: true }).click();
  const summary = changed.getByRole('region', { name: 'Summary' });
  await expect(summary).toContainText('− SMS, email or both.');
  await expect(summary).toContainText('+ SMS, push or both.');
  await expect(changed.getByRole('heading')).toHaveText(['Summary']);

  // Finalize leaves it out, and says why. The settled conflict no longer blocks.
```
Which channels? was resolved before the update, so the re-import flags it and adds its line, and the thread stays resolved: the rest of the test, Finalize's "Nothing blocks Finalize." included, is unchanged.

- [ ] **Step 8: Run everything**

Run:
```bash
pnpm typecheck
pnpm test
pnpm test:e2e plan-update.spec.ts
pnpm test:e2e
```
Expected: PASS. `pnpm test` runs 1,011 tests in 109 files, 16 more than Task 7 left. Nothing else builds a `ThreadDetail` by hand, so the new required field breaks no other test.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/store/versionChange.ts packages/core/src/schemas/views.ts packages/core/src/store/importItems.ts packages/core/src/store/update.ts packages/core/src/store/context.ts packages/core/src/store/detail.ts packages/core/src/index.ts packages/core/test/versionChange.test.ts packages/web/src/pages/VersionChange.tsx packages/web/src/pages/VersionChange.test.tsx packages/web/src/pages/ThreadView.tsx packages/web/e2e/plan-update.spec.ts
git commit -m "feat: an item changed by a re-import shows what the new plan version changed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Recovered updates are told, and leftover folders can be removed

Plan 5 puts back an update that stopped part-way, silently, and leaves a `docs/versions/v<n>.unfinished-<UTC time>/` folder behind when it had to keep a working file you'd changed since (Decision 15 (a) and (b)). Now `/open` puts such an update back first thing under the project's lock and starts its `next` with what happened; the stale-snapshot read gives a plain message instead of Node's error; and the Versions page lists the leftover folders, each with Remove. The DELETE route removes only a real folder whose name has the leftover form, inside that project's `docs/versions/` (Review Focus 5).

**Files:**
- Modify:
  - `packages/core/src/schemas/views.ts` (`Leftover`, `VersionsView`, `andList`)
  - `packages/core/src/store/update.ts` (`UpdateRecovery.version`, `recoveryLines`, the plain error, `listLeftovers`, `removeLeftover`, `NOT_A_LEFTOVER`)
  - `packages/service/src/routes/claude.ts` (`/open` puts an update back first and tells the user)
  - `packages/service/src/routes/versions.ts` (`leftovers` in `GET …/versions`; `DELETE …/versions/leftovers/:name`)
  - `packages/service/src/app.ts` (`versionRoutes` takes the runtime, for the lock)
  - `packages/web/src/api/client.ts` (`versions` returns `VersionsView`; `removeLeftover`)
  - `packages/web/src/pages/versions/VersionsPage.tsx` (the leftovers section)
  - `packages/core/test/update.test.ts` (Plan 5's plain-error test and two recovery notes change; new tests)
  - `packages/service/test/update.test.ts` (the versions list has `leftovers`; new tests; the `snapshot` helper records links; `setup` takes a clock)
  - `packages/web/src/pages/versions/VersionsPage.test.tsx`, `packages/web/src/pages/versions/VersionPage.test.tsx` (the mocked list has `leftovers`)
- Test:
  - `packages/core/test/update.test.ts`
  - `packages/service/test/update.test.ts` (the Review Focus test "only a leftover folder can be removed" is here)
  - `packages/web/src/pages/versions/VersionsPage.test.tsx`

**Interfaces:**
- Consumes:
  - From Plan 5 (`store/update.ts`): `recoverUnfinishedUpdate(dir, now)` and its `UpdateRecovery`, the journal's `to`, `setAside`'s folder name (`v<n>.unfinished-<14-digit UTC stamp>`, with `-<k>` when that's taken), and the module's `lstat`, `quiet`, `docPath`, `StoreError` and `ConflictError`.
  - From Task 7, in `packages/service/src/routes/claude.ts`: `telling(lines, next)` (beside `updatedLine`), `CATCH_UP`, the `caughtUp` flag, `waits` and the catch-up block (`caughtUp = await rt.withLock(key, async () => { const version = await catchUpDue(ref.dir); … })`), and the reopened `next`, `telling([...(tell ? [tell] : []), ...(caughtUp ? [CATCH_UP] : []), ...waits], next)`. Task 7's `catchUpDue` returns null while an update's journal is there; this task puts that update back before it looks.
  - From Plans 1–6: `projectKey` and `Runtime` (`service/src/runtime.ts`), `handle` and `locateProject`, `snapshotVersion` (`store/versions.ts`) in the service test, `Group` and `Button` (web components), `formatUpdated`.
- Produces, as in the header's Contracts:
  ```ts
  // store/update.ts
  export type UpdateRecovery = { recovered: boolean; keptChanged: string[]; setAside: string | null; version: number | null };   // version added
  export function recoveryLines(note: UpdateRecovery): string[];
  export async function listLeftovers(dir: string): Promise<Leftover[]>;            // Leftover = { name: string; version: number; at: string }
  export async function removeLeftover(dir: string, name: string): Promise<void>;   // StoreError NOT_A_LEFTOVER (a 404) for anything else
  ```
  - **Beyond the Contracts:**
    - `export const NOT_A_LEFTOVER = "That folder isn't a leftover from an update.";` (`store/update.ts`), the 404's exact copy.
    - In `schemas/views.ts`: `export type Leftover = { name: string; version: number; at: string }`; `export type VersionsView = { versions: VersionSummary[]; leftovers: Leftover[] }`, what `GET …/versions` returns; and `export function andList(parts: string[]): string` ("a", "a and b", "a, b and c"), which the recovery line uses here and Task 10 uses for its titles, in core, the service and the web.
    - `api.removeLeftover(repo, id, name)` in the web client.
  - **The shape this task picked** for "planChange/updatePlan pass it out": neither changes. `/open` calls `recoverUnfinishedUpdate` itself, first thing in each of its project locks (`putBackFirst`), and keeps `recoveryLines` of what it did. `planChange` and `updatePlan` still call it, and find nothing left to put back. That keeps both signatures and every caller as they are, and covers each path `/open` takes: the update check, Task 7's catch-up and the bookkeeping that always runs.
- **Rules:**
  - `recoverUnfinishedUpdate` sets `version` to the journal's `to` whenever it puts an update back (the last one, when it puts back more than one), and `null` otherwise.
  - **`recoveryLines(note)`:** `[]` unless `note.recovered`. Then `An earlier update to v${version} didn't finish, and was put back.`, and, when `keptChanged` isn't empty and `setAside` is set, `Your own changes to ${andList(keptChanged)} were kept, and your files from before the update are in ${setAside}.`
  - **`/open`'s `next`** starts with them, in one "Tell the user" sentence, before every other line: before the update's line on `updated`, before the question on `plan-changed`, and on `created`/`reopened` before `tell` and Task 7's catch-up line (the header's order: recovery, catch-up, incomplete re-import). Each line is told once, by the `/open` that put the update back. The set-aside folder's name comes from the runtime clock (`new Date(rt.now())`).
  - If an update can't be put back yet, `/open` fails with Plan 5's ConflictError ("…some files couldn't be put back yet: … Run /dev-plumbing again to finish putting them back."), now also on the paths that didn't look at the plan (`update: false`, or a clone without the plan), since it runs first in every lock. Before, those opened a project whose working files might still be the half-done update's.
  - **The plain error:** in `updatePlan`, a `docs/versions/v<n>` that can't be listed for any reason but ENOENT throws ConflictError `The update couldn't read docs/versions/v${n} (${reason}). Run /dev-plumbing to try again.`, with `reason` the error's message, writing nothing, as before.
  - **`listLeftovers(dir)`:** each entry of `docs/versions` whose name matches `^v([1-9][0-9]*)\.unfinished-[0-9TZ-]+(-[0-9]+)?$` and that `lstat` says is a folder (a file or a link isn't one). `version` is the name's `n`, `at` the 14-digit stamp after `.unfinished-` as ISO (`2026-10-05T11:30:00.000Z`), or the folder's mtime when the name has none. Newest first, by `at`, then by name. `[]` with no `docs/versions`.
  - **`removeLeftover(dir, name)`:** StoreError `NOT_A_LEFTOVER`, removing nothing, unless `name` matches that pattern and `docs/versions/<name>` is a real folder. Then it's removed with everything in it, and `docs/versions` too if that leaves it empty. The pattern allows no `/`, no `.` but the one before `unfinished`, and no `..`, so a name can never leave `docs/versions`; `docPath` still guards the path.
  - **`DELETE /api/projects/:repo/:id/versions/leftovers/:name`:** `removeLeftover` under `rt.withLock(projectKey(repo, id))`, then `rt.events.projectChanged`, and `{ ok: true }`. A StoreError is a 404 through `handle`. Nothing removes a leftover on its own.
  - **The Versions page:** when `leftovers` isn't empty, a `Group` titled "Left over from updates that didn't finish" (`data-testid="leftovers-list"`) under the versions, one row each (`data-testid="leftover-row"`): the name in mono, `v<n>'s plan and draft from before the update · set aside <formatUpdated(at)>`, and a secondary small "Remove". Remove asks `window.confirm(`Remove ${name}? It holds your v${n} plan and draft from before an update that didn't finish. They're deleted.`)`, then calls the route and reads the list again. The copy says what the folder holds: `setAside` renames the v<n> snapshot, the plan and draft from before the update, and since the draft now holds the update's merge, it's the only copy of the draft as it was. A failure shows its message in seal.

- [ ] **Step 1: Write the failing core tests**

In `packages/core/test/update.test.ts`, replace the imports:
```ts
import { ConflictError, InputError, readItem, readItems, readProjectFile, readSubmissions, readThread, readThreads, writeItem, writeProjectFile, writeThread } from '../src/store/io';
import { finishSubmission, pendingSubmissions, pickUp } from '../src/store/queue';
import { planChange, recoverUnfinishedUpdate, updatePlan } from '../src/store/update';
```
with:
```ts
import { ConflictError, InputError, readItem, readItems, readProjectFile, readSubmissions, readThread, readThreads, StoreError, writeItem, writeProjectFile, writeThread } from '../src/store/io';
import { finishSubmission, pendingSubmissions, pickUp } from '../src/store/queue';
import { listLeftovers, NOT_A_LEFTOVER, planChange, recoverUnfinishedUpdate, recoveryLines, removeLeftover, updatePlan } from '../src/store/update';
```

Plan 5's test of the stale-snapshot read now expects the plain message. Replace:
```ts
  it("refuses, writing nothing, when it can't tell whether the version it would save is already saved", async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    reading.fail = new Set([path.join(dir, 'docs', 'versions', 'v1')]);
    const error = await failure(update(dir, CONFLICTING));
    reading.fail = new Set();
    expect((error as NodeJS.ErrnoException).code).toBe('EMFILE');
    expect(await snapshot(dir)).toEqual(before);
  });
```
with:
```ts
  it("refuses, writing nothing, when it can't tell whether the version it would save is already saved", async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    const folder = path.join(dir, 'docs', 'versions', 'v1');
    reading.fail = new Set([folder]);
    const error = await failure(update(dir, CONFLICTING));
    reading.fail = new Set();
    // A plain message, not Node's error.
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(
      `The update couldn't read docs/versions/v1 (EMFILE: too many open files, scandir '${folder}'). Run /dev-plumbing to try again.`,
    );
    expect(await snapshot(dir)).toEqual(before);
  });
```

The recovery note gains `version` in Plan 5's two tests that compare it whole. Replace:
```ts
    expect(await recoverUnfinishedUpdate(dir, new Date('2026-10-05T11:30:00.000Z'))).toEqual({ recovered: true, keptChanged: ['docs/draft.md'], setAside: aside });
```
with:
```ts
    expect(await recoverUnfinishedUpdate(dir, new Date('2026-10-05T11:30:00.000Z'))).toEqual({ recovered: true, keptChanged: ['docs/draft.md'], setAside: aside, version: 2 });
```
and replace:
```ts
    expect(await recoverUnfinishedUpdate(dir, T)).toEqual({ recovered: true, keptChanged: ['docs/draft.md'], setAside: 'docs/versions/v1.unfinished-20261005100000' });
```
with:
```ts
    expect(await recoverUnfinishedUpdate(dir, T)).toEqual({ recovered: true, keptChanged: ['docs/draft.md'], setAside: 'docs/versions/v1.unfinished-20261005100000', version: 2 });
```

Add at the end of the file:
```ts

describe('telling you about an update that was put back', () => {
  const NOTHING = { recovered: false, keptChanged: [], setAside: null, version: null };

  it('says nothing when nothing was put back', async () => {
    const dir = await seed();
    expect(await recoverUnfinishedUpdate(dir, T)).toEqual(NOTHING);
    expect(recoveryLines(NOTHING)).toEqual([]);
  });

  it('names the version the update was bringing in', async () => {
    const dir = await seed();
    failing.counts.clear();
    failing.calls = new Set([`${path.join(dir, 'project.json')}#1`, `${path.join(dir, 'docs', 'draft.md')}#2`]);
    await failure(update(dir, CONFLICTING));
    failing.calls = new Set();
    const note = await recoverUnfinishedUpdate(dir, T);
    expect(note).toEqual({ recovered: true, keptChanged: [], setAside: null, version: 2 });
    expect(recoveryLines(note)).toEqual(["An earlier update to v2 didn't finish, and was put back."]);
  });

  it('names the files it kept as you had them, and where the copies went', async () => {
    const dir = await seed();
    failing.counts.clear();
    failing.calls = new Set([`${path.join(dir, 'project.json')}#1`, `${path.join(dir, 'docs', 'draft.md')}#2`]);
    await failure(update(dir, CONFLICTING));
    failing.calls = new Set();
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), `${await read(dir, 'docs/draft.md')}\nYour edit.\n`);
    const note = await recoverUnfinishedUpdate(dir, new Date('2026-10-05T11:30:00.000Z'));
    expect(recoveryLines(note)).toEqual([
      "An earlier update to v2 didn't finish, and was put back.",
      "Your own changes to docs/draft.md were kept, and your files from before the update are in docs/versions/v1.unfinished-20261005113000.",
    ]);
    const both = { recovered: true, keptChanged: ['docs/original.md', 'docs/draft.md'], setAside: 'docs/versions/v2.unfinished-20261006100000', version: 3 };
    expect(recoveryLines(both)).toEqual([
      "An earlier update to v3 didn't finish, and was put back.",
      "Your own changes to docs/original.md and docs/draft.md were kept, and your files from before the update are in docs/versions/v2.unfinished-20261006100000.",
    ]);
  });
});

describe('leftover folders', () => {
  /** A project whose update to v2 stopped, then had its draft changed, so the next look set v1's copy aside. */
  async function withLeftover(): Promise<string> {
    const dir = await seed();
    failing.counts.clear();
    failing.calls = new Set([`${path.join(dir, 'project.json')}#1`, `${path.join(dir, 'docs', 'draft.md')}#2`]);
    await failure(update(dir, CONFLICTING));
    failing.calls = new Set();
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), `${await read(dir, 'docs/draft.md')}\nYour edit.\n`);
    await recoverUnfinishedUpdate(dir, new Date('2026-10-05T11:30:00.000Z'));
    return dir;
  }
  const versions = (dir: string, ...rest: string[]) => path.join(dir, 'docs', 'versions', ...rest);

  it('are listed newest first, and only real folders with a leftover name', async () => {
    const dir = await withLeftover();
    expect(await listLeftovers(dir)).toEqual([{ name: 'v1.unfinished-20261005113000', version: 1, at: '2026-10-05T11:30:00.000Z' }]);
    // A second one, set aside the next day and named apart from one set aside in the same second.
    await fs.mkdir(versions(dir, 'v2.unfinished-20261006100000-2'), { recursive: true });
    // None of these is a leftover: a version's own folder, a file and a link with a leftover's name, and other names.
    await fs.mkdir(versions(dir, 'v2'));
    await fs.writeFile(versions(dir, 'v3.unfinished-20261007100000'), 'not a folder');
    await fs.symlink(versions(dir, 'v2'), versions(dir, 'v4.unfinished-20261008100000'));
    await fs.mkdir(versions(dir, 'v1.unfinished-later'));
    await fs.mkdir(versions(dir, 'v0.unfinished-20261005100000'));
    expect(await listLeftovers(dir)).toEqual([
      { name: 'v2.unfinished-20261006100000-2', version: 2, at: '2026-10-06T10:00:00.000Z' },
      { name: 'v1.unfinished-20261005113000', version: 1, at: '2026-10-05T11:30:00.000Z' },
    ]);
  });

  it('are none in a project that has no docs/versions', async () => {
    expect(await listLeftovers(await seed())).toEqual([]);
  });

  it('can be removed one at a time, with everything in them, and then docs/versions goes once it is empty', async () => {
    const dir = await withLeftover();
    await fs.mkdir(versions(dir, 'v1.unfinished-20261006100000'));
    const before = await snapshot(dir);
    await removeLeftover(dir, 'v1.unfinished-20261005113000');
    const after = await snapshot(dir);
    // Only that folder and what was in it went.
    const gone = versions(dir, 'v1.unfinished-20261005113000');
    expect(Object.keys(before).filter((p) => !(p in after)).sort()).toEqual([gone, ...['draft.md', 'original.md', 'update.json'].map((f) => path.join(gone, f))]);
    expect(await listLeftovers(dir)).toEqual([{ name: 'v1.unfinished-20261006100000', version: 1, at: '2026-10-06T10:00:00.000Z' }]);
    await removeLeftover(dir, 'v1.unfinished-20261006100000');
    expect((await fs.readdir(path.join(dir, 'docs'))).sort()).toEqual(['draft.md', 'original.md']);
  });

  it('refuses anything but a leftover folder, removing nothing', async () => {
    const dir = await withLeftover();
    await fs.mkdir(versions(dir, 'v2'));
    await fs.writeFile(versions(dir, 'v2', 'draft.md'), 'v2 draft');
    await fs.writeFile(versions(dir, 'v3.unfinished-20261007100000'), 'not a folder');
    await fs.symlink(path.join(dir, 'docs', 'draft.md'), versions(dir, 'v4.unfinished-20261008100000'));
    const before = await snapshot(dir);
    for (const name of ['v2', '../v2', 'v1.unfinished-20261005113000/../v2', 'v1.unfinished-20261005113000/', 'v3.unfinished-20261007100000', 'v4.unfinished-20261008100000', 'v1.unfinished-20990101000000', '']) {
      const error = await failure(removeLeftover(dir, name));
      expect(error, name).toBeInstanceOf(StoreError);
      expect((error as Error).message, name).toBe(NOT_A_LEFTOVER);
    }
    expect(await snapshot(dir)).toEqual(before);
  });
});
```
(`seed`, `update`, `snapshot`, `read`, `failure`, `failing`, `T`, `CONFLICTING`, `fs` and `path` are already in this file. Its `snapshot` reads through a link to a file, which is why the refusal test's link points at the draft.)

- [ ] **Step 2: Write the failing service tests**

In `packages/service/test/update.test.ts`, replace:
```ts
import { readItem, readProjectFile, readThread, writeJsonAtomic } from '@dev-plumbing/core';
```
with:
```ts
import { readItem, readProjectFile, readThread, snapshotVersion, writeJsonAtomic } from '@dev-plumbing/core';
```

The `snapshot` helper records links, so the Review Focus test can put one in the project. Replace:
```ts
/** Every file and folder under `dir`, with each file's text. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (d: string): Promise<void> => {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
```
with:
```ts
/** Every file, folder and link under `dir`, with each file's text and where each link points. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (d: string): Promise<void> => {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isSymbolicLink()) {
        out[p] = `link to ${await fs.readlink(p)}`;
      } else if (entry.isDirectory()) {
```

`setup` takes the windows' clock, as `harness` does. Replace:
```ts
/** The plan imported from the clone, with two questions. */
async function setup() {
  const t = await harness();
```
with:
```ts
/** The plan imported from the clone, with two questions. */
async function setup(o: { now?: () => number } = {}) {
  const t = await harness(o);
```

Add, just before `const ASK_V2 =`:
```ts
/**
 * An update to v2 that stopped once it had written everything but project.json, as when the service dies: its journal,
 * v1's snapshot, `draft` as the merged draft, and V2 as docs/original.md.
 */
async function stoppedUpdate(t: Setup, draft: string) {
  const write = async (rel: string, text: string) => {
    await fs.mkdir(path.dirname(path.join(t.dir, rel)), { recursive: true });
    await fs.writeFile(path.join(t.dir, rel), text);
  };
  const created = ['docs/versions/v2', 'docs/versions/v2/merged.md'];
  await write('docs/versions/v1/update.json', JSON.stringify({ to: 2, created, wrote: { draft: sha256(draft), original: sha256(V2) } }));
  await snapshotVersion(t.dir, 1);
  await write('docs/versions/v2/merged.md', draft);
  await write('docs/draft.md', draft);
  await write('docs/original.md', V2);
}

```

Add, just before `describe('versions', () => {`:
```ts
describe('an update that stopped part-way', () => {
  const PUT_BACK = "An earlier update to v2 didn't finish, and was put back.";

  it('is put back first, and the user is told before the question', async () => {
    const t = await setup();
    await rewritePlan(t, V2);
    const before = await snapshot(t.dir);
    await stoppedUpdate(t, 'The merged draft.\n');
    const ask = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(ask.body).toMatchObject({ kind: 'plan-changed', version: 1, nextVersion: 2 });
    expect(ask.body.next).toBe(`Tell the user: "${PUT_BACK}" ${ASK_V2}`);
    expect(await snapshot(t.dir)).toEqual(before);
    // It's told once.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body.next).toBe(ASK_V2);
  });

  it('is told in the same line as the update that runs after it', async () => {
    const t = await setup();
    await rewritePlan(t, V2);
    await stoppedUpdate(t, 'The merged draft.\n');
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.body).toMatchObject({ kind: 'updated', version: 2 });
    expect(yes.body.next).toBe(`Tell the user: "${PUT_BACK} v2: 3 changes merged, nothing to settle." ${IMPORT_NEXT}`);
  });

  it('keeps a draft you changed since, says where the copies went, and lists the folder under Versions', async () => {
    const t = await setup({ now: () => Date.parse('2026-10-08T10:00:00.000Z') });
    await rewritePlan(t, V2);
    await stoppedUpdate(t, 'The merged draft.\n');
    await fs.writeFile(path.join(t.dir, 'docs', 'draft.md'), 'The merged draft, and your edit.\n');
    // Opened without bringing the plan in: it's put back all the same.
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: false });
    expect(open.body).toMatchObject({ kind: 'reopened', importTypes: [] });
    expect(open.body.next).toBe(
      `Tell the user: "${PUT_BACK} Your own changes to docs/draft.md were kept, and your files from before the update are in docs/versions/v1.unfinished-20261008100000." ${WAIT_NEXT}`,
    );
    expect(await fs.readFile(path.join(t.dir, 'docs', 'draft.md'), 'utf8')).toBe('The merged draft, and your edit.\n');
    expect(await fs.readFile(path.join(t.dir, 'docs', 'original.md'), 'utf8')).toBe(DRAFT);
    expect((await t.send('GET', `${P}/versions`)).body.leftovers).toEqual([{ name: 'v1.unfinished-20261008100000', version: 1, at: '2026-10-08T10:00:00.000Z' }]);
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: false })).body.next).toBe(WAIT_NEXT);
  });
});

```
(Task 7 added `describe('catching the items up with settled Plan changes', …)` before `describe('versions', …)` too; this one goes after it.)

In `describe('versions', …)`, the list now has `leftovers`. Replace:
```ts
    expect((await t.send('GET', `${P}/versions`)).body).toEqual({ versions: [{ ...v1, current: true }] });
```
with:
```ts
    expect((await t.send('GET', `${P}/versions`)).body).toEqual({ versions: [{ ...v1, current: true }], leftovers: [] });
```

Then replace the start of the guard test:
```ts
  it('needs the token or the same origin', async () => {
    const t = await setup();
    for (const route of [`${P}/versions`, `${P}/versions/1/original`, `${P}/versions/compare?from=1&to=1&which=draft`, `${P}/versions/1/update-diff`]) {
      const res = await t.app.request(`http://localhost:4545${route}`, { headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' } });
      expect(res.status, route).toBe(401);
    }
```
with the Review Focus test, then the guard test with the DELETE route too:
```ts
  it('only a leftover folder can be removed', async () => {
    const t = await setup();
    const versions = path.join(t.dir, 'docs', 'versions');
    const leftover = path.join(versions, 'v1.unfinished-20261005100000');
    // A real leftover; v2's own folder; a file and a link with a leftover's name; a folder beside docs/versions; and a
    // folder outside the project, which the link points at.
    await fs.mkdir(leftover, { recursive: true });
    await fs.writeFile(path.join(leftover, 'draft.md'), 'The copy from before the update.\n');
    await fs.mkdir(path.join(versions, 'v2'));
    await fs.writeFile(path.join(versions, 'v2', 'draft.md'), "v2's draft.\n");
    await fs.writeFile(path.join(versions, 'v3.unfinished-20261007100000'), 'A file, not a folder.\n');
    await fs.mkdir(path.join(t.dir, 'docs', 'x'));
    await fs.writeFile(path.join(t.dir, 'docs', 'x', 'keep.md'), 'Beside docs/versions.\n');
    const outside = path.join(t.tmp, 'outside');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'keep.md'), "Not the project's.\n");
    await fs.symlink(outside, path.join(versions, 'v4.unfinished-20261008100000'));
    const before = { project: await snapshot(t.dir), outside: await snapshot(outside) };

    // Names that reach the route, each refused whole: v2, slashes and dot segments sent encoded, the file, the link,
    // and a leftover's name that isn't there.
    const refused = { status: 404, body: { error: "That folder isn't a leftover from an update." } };
    for (const name of [
      'v2',
      '..%2Fx',
      '%2E%2E%2Fx',
      'v2.unfinished-x%2F..%2F..',
      'v1.unfinished-20261005100000%2F..%2Fv2',
      'v1.unfinished-20261005100000%2F',
      'v3.unfinished-20261007100000',
      'v4.unfinished-20261008100000',
      'v1.unfinished-20990101000000',
    ]) {
      expect(await t.send('DELETE', `${P}/versions/leftovers/${name}`), name).toEqual(refused);
    }
    // Real slashes and dot segments: the URL resolves them, or the path matches no route.
    for (const route of ['../x', 'v2.unfinished-x/../..', '..', 'v1.unfinished-20261005100000/draft.md', '']) {
      expect((await call(t.app, `${P}/versions/leftovers/${route}`, { method: 'DELETE' })).status, route).toBe(404);
    }
    expect({ project: await snapshot(t.dir), outside: await snapshot(outside) }).toEqual(before);

    // The leftover goes, with what's in it, and nothing else does.
    expect(await t.send('DELETE', `${P}/versions/leftovers/v1.unfinished-20261005100000`)).toEqual({ status: 200, body: { ok: true } });
    const after = await snapshot(t.dir);
    expect(Object.keys(before.project).filter((p) => !(p in after)).sort()).toEqual([leftover, path.join(leftover, 'draft.md')]);
    expect(Object.keys(after).length).toBe(Object.keys(before.project).length - 2);
    expect(await snapshot(outside)).toEqual(before.outside);
    expect((await t.send('GET', `${P}/versions`)).body.leftovers).toEqual([]);
    expect(await t.send('DELETE', `${P}/versions/leftovers/v1.unfinished-20261005100000`)).toEqual(refused);
    expect((await t.send('DELETE', '/api/projects/acme-app/nope/versions/leftovers/v1.unfinished-20261005100000')).status).toBe(404);
  });

  it('needs the token or the same origin', async () => {
    const t = await setup();
    for (const route of [`${P}/versions`, `${P}/versions/1/original`, `${P}/versions/compare?from=1&to=1&which=draft`, `${P}/versions/1/update-diff`]) {
      const res = await t.app.request(`http://localhost:4545${route}`, { headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' } });
      expect(res.status, route).toBe(401);
    }
    const leftover = path.join(t.dir, 'docs', 'versions', 'v1.unfinished-20261005100000');
    await fs.mkdir(leftover, { recursive: true });
    const remove = await t.app.request(`http://localhost:4545${P}/versions/leftovers/v1.unfinished-20261005100000`, {
      method: 'DELETE',
      headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' },
    });
    expect(remove.status).toBe(401);
    expect((await fs.stat(leftover)).isDirectory()).toBe(true);
```
(The rest of the guard test, from `const same = …`, is unchanged. `call` and `sha256` are already in this file; `t.tmp` is the test's temp folder, outside the projects folder.)

- [ ] **Step 3: Write the failing web tests**

In `packages/web/src/pages/versions/VersionPage.test.tsx`, the mocked list has `leftovers`. Replace:
```ts
  vi.spyOn(api, 'versions').mockResolvedValue({ versions });
```
with:
```ts
  vi.spyOn(api, 'versions').mockResolvedValue({ versions, leftovers: [] });
```

In `packages/web/src/pages/versions/VersionsPage.test.tsx`, replace:
```ts
import type { VersionSummary } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
```
with:
```ts
import type { Leftover, VersionSummary } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
```
replace:
```ts
function show(versions: VersionSummary[]) {
  const list = vi.spyOn(api, 'versions').mockResolvedValue({ versions });
```
with:
```ts
function show(versions: VersionSummary[], leftovers: Leftover[] = []) {
  const list = vi.spyOn(api, 'versions').mockResolvedValue({ versions, leftovers });
```
and replace:
```ts
  it("says why the list couldn't be read", async () => {
```
with:
```ts
  it('lists no leftovers when there are none', async () => {
    show([V2, V1]);
    await screen.findByTestId('versions-list');
    expect(screen.queryByText("Left over from updates that didn't finish")).toBeNull();
    expect(screen.queryByTestId('leftovers-list')).toBeNull();
  });

  it('lists the folders updates that did not finish left behind, each with Remove, which asks first', async () => {
    const leftovers: Leftover[] = [
      { name: 'v2.unfinished-20261006100000', version: 2, at: '2026-10-06T10:00:00.000Z' },
      { name: 'v1.unfinished-20261005100000', version: 1, at: '2026-10-05T10:00:00.000Z' },
    ];
    const list = show([V2, V1], leftovers);
    const remove = vi.spyOn(api, 'removeLeftover').mockResolvedValue({ ok: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const section = await screen.findByTestId('leftovers-list');
    expect(within(section).getByRole('heading').textContent).toBe("Left over from updates that didn't finish");
    const rows = within(section).getAllByTestId('leftover-row');
    expect(rows.map((r) => r.textContent)).toEqual([
      `v2.unfinished-20261006100000v2's plan and draft from before the update · set aside ${formatUpdated(leftovers[0]!.at)}Remove`,
      `v1.unfinished-20261005100000v1's plan and draft from before the update · set aside ${formatUpdated(leftovers[1]!.at)}Remove`,
    ]);
    // Remove is never the page's main action.
    expect(within(rows[0]!).getByRole('button', { name: 'Remove' }).className).not.toContain('bg-button');

    // Cancelled: nothing is removed.
    fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Remove' }));
    expect(confirm).toHaveBeenCalledWith("Remove v1.unfinished-20261005100000? It holds your v1 plan and draft from before an update that didn't finish. They're deleted.");
    expect(remove).not.toHaveBeenCalled();

    // Confirmed: it's removed, and the list is read again.
    confirm.mockReturnValue(true);
    list.mockResolvedValue({ versions: [V2, V1], leftovers: [leftovers[0]!] });
    fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('acme-app', 'restock', 'v1.unfinished-20261005100000'));
    await waitFor(() => expect(screen.getAllByTestId('leftover-row')).toHaveLength(1));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("says why a leftover couldn't be removed", async () => {
    show([V2, V1], [{ name: 'v1.unfinished-20261005100000', version: 1, at: '2026-10-05T10:00:00.000Z' }]);
    vi.spyOn(api, 'removeLeftover').mockRejectedValue(new Error("That folder isn't a leftover from an update."));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText("That folder isn't a leftover from an update.")).toBeTruthy();
  });

  it("says why the list couldn't be read", async () => {
```

- [ ] **Step 4: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/update.test.ts packages/service/test/update.test.ts packages/web/src/pages/versions`
Expected: FAIL.
- `update.test.ts` (core): the stale-snapshot test gets Node's EMFILE error, not a ConflictError; the two recovery notes have no `version`; the new tests fail with `TypeError: (0 , recoveryLines) is not a function` (and the same for `listLeftovers` and `removeLeftover`).
- `update.test.ts` (service): the three recovery tests get `next` without the line; `GET …/versions` has no `leftovers`; the DELETE route doesn't exist, so the Review Focus test gets Hono's plain-text 404 and `res.json()` throws.
- `VersionsPage.test.tsx`: the two tests with leftovers fail: there's no leftovers section, and `vi.spyOn(api, 'removeLeftover')` throws, since the client has no such method. "lists no leftovers when there are none" passes already.
- The guard test passes already: the guard refuses a cross-site DELETE before any route is matched.

- [ ] **Step 5: The shared types and the helper**

In `packages/core/src/schemas/views.ts`, replace:
```ts
/** One version in the Versions list (GET …/versions, newest first). `current` marks the one the working files hold. */
export type VersionSummary = PlanVersion & { current: boolean };
```
with:
```ts
/** One version in the Versions list (GET …/versions, newest first). `current` marks the one the working files hold. */
export type VersionSummary = PlanVersion & { current: boolean };
/**
 * A folder an update that didn't finish was set aside in, docs/versions/<name>: `version` is the n of its
 * v<n>.unfinished-<UTC time> name, and `at` the time in its name (ISO).
 */
export type Leftover = { name: string; version: number; at: string };
/** GET …/versions: the versions, newest first, and the leftover folders, newest first. */
export type VersionsView = { versions: VersionSummary[]; leftovers: Leftover[] };

/** "a", "a and b", "a, b and c". */
export function andList(parts: string[]): string {
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
```

- [ ] **Step 6: The recovery note, its lines, the plain error and the leftovers**

In `packages/core/src/store/update.ts`, replace:
```ts
import { titleFromMarkdown, type Item, type Message, type PlanVersion, type PlumbingProject, type PlumbingType, type Submission, type Thread } from '../schemas';
```
with:
```ts
import { andList, titleFromMarkdown, type Item, type Leftover, type Message, type PlanVersion, type PlumbingProject, type PlumbingType, type Submission, type Thread } from '../schemas';
```

Replace:
```ts
/**
 * What recoverUnfinishedUpdate did. `recovered`: it put back an update that hadn't finished. `keptChanged`: the working
 * files it left as you have them, because they changed since that update wrote them. `setAside`: where the copy from
 * before that update went, then (docs/versions/v<n>.unfinished-<UTC time>), or null.
 */
export type UpdateRecovery = { recovered: boolean; keptChanged: string[]; setAside: string | null };
```
with:
```ts
/**
 * What recoverUnfinishedUpdate did. `recovered`: it put back an update that hadn't finished. `keptChanged`: the working
 * files it left as you have them, because they changed since that update wrote them. `setAside`: where the copy from
 * before that update went, then (docs/versions/v<n>.unfinished-<UTC time>), or null. `version`: the version that
 * update was bringing in, or null when nothing was put back.
 */
export type UpdateRecovery = { recovered: boolean; keptChanged: string[]; setAside: string | null; version: number | null };

/**
 * What /dev-plumbing tells you after recoverUnfinishedUpdate put an update back: that it did, and, when it kept working
 * files you'd changed since, which ones, and where your files from before the update went. [] when nothing was put back.
 */
export function recoveryLines(note: UpdateRecovery): string[] {
  // `version` is set whenever `recovered` is.
  if (!note.recovered || note.version === null) return [];
  const lines = [`An earlier update to v${note.version} didn't finish, and was put back.`];
  if (note.keptChanged.length && note.setAside) lines.push(`Your own changes to ${andList(note.keptChanged)} were kept, and your files from before the update are in ${note.setAside}.`);
  return lines;
}
```

In `recoverUnfinishedUpdate`'s doc comment, replace:
```ts
 * Throws when a file can't be put back yet, keeping the snapshot and the journal for the next try. Runs at the start of
 * planChange and updatePlan, so under the project's lock. `now` names a set-aside folder.
 */
```
with:
```ts
 * Throws when a file can't be put back yet, keeping the snapshot and the journal for the next try. Runs at the start of
 * planChange and updatePlan, so under the project's lock, and /open runs it first, to tell the user (recoveryLines).
 * `now` names a set-aside folder.
 */
```
and in its body replace:
```ts
  const note: UpdateRecovery = { recovered: false, keptChanged: [], setAside: null };
```
with:
```ts
  const note: UpdateRecovery = { recovered: false, keptChanged: [], setAside: null, version: null };
```
and:
```ts
    note.recovered = true;
  }
  return note;
```
with:
```ts
    note.recovered = true;
    note.version = journal.data.to;
  }
  return note;
```

In `updatePlan`, replace:
```ts
  // A snapshot already in docs/versions/v<n> isn't this update's. snapshotVersion would refuse to overwrite it, and
  // putting the update back must never restore from it or remove it, so the update doesn't start. Only a missing
  // folder means there's none: any other error says nothing about what's in it.
  const present = await fs.readdir(docPath(dir, `docs/versions/v${current.n}`)).catch((error: unknown): string[] => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
```
with:
```ts
  // A snapshot already in docs/versions/v<n> isn't this update's. snapshotVersion would refuse to overwrite it, and
  // putting the update back must never restore from it or remove it, so the update doesn't start. Only a missing
  // folder means there's none: any other error says nothing about what's in it, so the update stops, writing nothing.
  const present = await fs.readdir(docPath(dir, `docs/versions/v${current.n}`)).catch((error: unknown): string[] => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConflictError(`The update couldn't read docs/versions/v${current.n} (${reason}). Run /dev-plumbing to try again.`);
  });
```

Add at the end of the file:
```ts

/** The name of a folder an update that didn't finish was set aside in (setAside), and of nothing else. */
const LEFTOVER = /^v([1-9][0-9]*)\.unfinished-[0-9TZ-]+(-[0-9]+)?$/;
export const NOT_A_LEFTOVER = "That folder isn't a leftover from an update.";

/** The UTC time in a set-aside folder's name (…unfinished-20261005113000), as ISO, or null when it has none. */
function stampTime(name: string): string | null {
  const t = /\.unfinished-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name);
  return t ? `${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}.000Z` : null;
}

/**
 * The folders updates that didn't finish were set aside in (docs/versions/v<n>.unfinished-<UTC time>), newest first.
 * Only real folders whose name has that form: a file or a link with such a name isn't one. Nothing removes them on its
 * own: the Versions page lists them, with Remove.
 */
export async function listLeftovers(dir: string): Promise<Leftover[]> {
  const names = await fs.readdir(docPath(dir, 'docs/versions')).catch((): string[] => []);
  const leftovers: Leftover[] = [];
  for (const name of names) {
    const version = LEFTOVER.exec(name)?.[1];
    if (!version) continue;
    const stat = await lstat(docPath(dir, `docs/versions/${name}`));
    if (!stat?.isDirectory()) continue;
    leftovers.push({ name, version: Number(version), at: stampTime(name) ?? stat.mtime.toISOString() });
  }
  return leftovers.sort((a, b) => b.at.localeCompare(a.at) || b.name.localeCompare(a.name));
}

/**
 * Removes one leftover folder, docs/versions/<name>, with everything in it, then docs/versions if that leaves it empty.
 * Only a name of the v<n>.unfinished-<UTC time> form that is a real folder there: anything else (v2 itself, a path with
 * .. or a slash, a file, a link, a name that isn't there) is a StoreError, NOT_A_LEFTOVER, and nothing is removed.
 * Under the project's lock.
 */
export async function removeLeftover(dir: string, name: string): Promise<void> {
  if (!LEFTOVER.test(name)) throw new StoreError(NOT_A_LEFTOVER);
  const folder = docPath(dir, `docs/versions/${name}`);
  if (!(await lstat(folder))?.isDirectory()) throw new StoreError(NOT_A_LEFTOVER);
  await fs.rm(folder, { recursive: true, force: true });
  await fs.rmdir(docPath(dir, 'docs/versions')).catch(quiet);
}
```
(Task 7's catch-up functions sit after `updateRefusal`; these go after `updatePlan`, at the end.)

- [ ] **Step 7: The versions routes**

In `packages/service/src/routes/versions.ts`, replace:
```ts
import { Hono, type Context } from 'hono';
import { currentVersion, diffText, projectVersions, readProjectFile, readVersionDoc, type VersionSummary } from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { locateProject } from '../locate';
```
with:
```ts
import { Hono, type Context } from 'hono';
import { currentVersion, diffText, listLeftovers, projectVersions, readProjectFile, readVersionDoc, removeLeftover, type VersionsView, type VersionSummary } from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { locateProject } from '../locate';
import { projectKey, type Runtime } from '../runtime';
```
replace:
```ts
/** Documents → Versions: every version of the plan a project went through, each one's plan and draft, and a diff of two. */
export function versionRoutes(ctx: AppContext): Hono {
```
with:
```ts
/**
 * Documents → Versions: every version of the plan a project went through, each one's plan and draft, a diff of two, and
 * the folders updates that didn't finish left behind, which you can remove.
 */
export function versionRoutes(ctx: AppContext, rt: Runtime): Hono {
```
and replace:
```ts
  r.get(base, handle(async (c) => {
    const { project } = await find(c);
    const current = currentVersion(project).n;
    const versions: VersionSummary[] = projectVersions(project)
      .map((v) => ({ ...v, current: v.n === current }))
      .reverse();
    return c.json({ versions });
  }));
```
with:
```ts
  r.get(base, handle(async (c) => {
    const { dir, project } = await find(c);
    const current = currentVersion(project).n;
    const versions: VersionSummary[] = projectVersions(project)
      .map((v) => ({ ...v, current: v.n === current }))
      .reverse();
    const view: VersionsView = { versions, leftovers: await listLeftovers(dir) };
    return c.json(view);
  }));

  // Removes one folder an update that didn't finish left in docs/versions. removeLeftover refuses anything else with a
  // StoreError, which is a 404.
  r.delete(`${base}/leftovers/:name`, handle(async (c) => {
    const { ref } = await locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
    await rt.withLock(projectKey(ref.repo, ref.id), () => removeLeftover(ref.dir, c.req.param('name')!));
    rt.events.projectChanged(ref.repo, ref.id);
    return c.json({ ok: true });
  }));
```

In `packages/service/src/app.ts`, replace:
```ts
  app.route('/api', versionRoutes(ctx));
```
with:
```ts
  app.route('/api', versionRoutes(ctx, rt));
```

- [ ] **Step 8: `/open` puts an update back first, and says so**

In `packages/service/src/routes/claude.ts`, add the two functions to the `@dev-plumbing/core` import. Replace:
```ts
  recordClone,
  relevantDecisions,
```
with:
```ts
  recordClone,
  recoverUnfinishedUpdate,
  recoveryLines,
  relevantDecisions,
```

In `/open`, replace:
```ts
      const key = projectKey(ref.repo, ref.id);
      const isAlive = (w: string) => rt.listeners.isAlive(w);
```
with:
```ts
      const key = projectKey(ref.repo, ref.id);
      const isAlive = (w: string) => rt.listeners.isAlive(w);
      // An update that stopped part-way is put back first thing under the lock, and the user is told, before anything
      // else. planChange and updatePlan put one back too, but by then there's nothing left to put back.
      const recovery: string[] = [];
      const putBackFirst = async () => {
        recovery.push(...recoveryLines(await recoverUnfinishedUpdate(ref.dir, new Date(rt.now()))));
      };
```

Each of `/open`'s project locks calls it first. In the update check, replace:
```ts
        const outcome = await rt.withLock(key, async () => {
          const change = await planChange(ref.dir, text);
```
with:
```ts
        const outcome = await rt.withLock(key, async () => {
          await putBackFirst();
          const change = await planChange(ref.dir, text);
```
in Task 7's catch-up, replace:
```ts
        caughtUp = await rt.withLock(key, async () => {
          const version = await catchUpDue(ref.dir);
```
with:
```ts
        caughtUp = await rt.withLock(key, async () => {
          await putBackFirst();
          const version = await catchUpDue(ref.dir);
```
and in the bookkeeping, replace:
```ts
      await rt.withLock(key, async () => {
        // Every clone a project is opened from is remembered, so Accept can offer it.
```
with:
```ts
      await rt.withLock(key, async () => {
        await putBackFirst();
        // Every clone a project is opened from is remembered, so Accept can offer it.
```

The lines go first in each answer's `next`, through Task 7's `telling`. In the `plan-changed` answer, replace:
```ts
            next: askNext(change, outcome.branch),
```
with:
```ts
            next: telling(recovery, askNext(change, outcome.branch)),
```
in the `updated` answer, replace:
```ts
          next: `Tell the user: "${updatedLine(update)}" ${next}`,
```
with:
```ts
          next: telling([...recovery, updatedLine(update)], next),
```
and in the `created`/`reopened` answer, replace Task 7's:
```ts
        next: telling([...(tell ? [tell] : []), ...(caughtUp ? [CATCH_UP] : []), ...waits], next),
```
with:
```ts
        next: telling([...recovery, ...(tell ? [tell] : []), ...(caughtUp ? [CATCH_UP] : []), ...waits], next),
```
With nothing put back, every `next` reads exactly as before.

- [ ] **Step 9: The Versions page lists the leftovers**

In `packages/web/src/api/client.ts`, in the type import from `@dev-plumbing/core/schemas`, replace:
```ts
  TypeItemRow,
  VersionSummary,
  WhiteboardView,
```
with:
```ts
  TypeItemRow,
  VersionsView,
  WhiteboardView,
```
and replace:
```ts
  versions: (repo: string, id: string) => request<{ versions: VersionSummary[] }>(`${proj(repo, id)}/versions`),
```
with:
```ts
  versions: (repo: string, id: string) => request<VersionsView>(`${proj(repo, id)}/versions`),
  /** Removes a folder an update that didn't finish left in docs/versions. Anything else is a 404. */
  removeLeftover: (repo: string, id: string, name: string) => request<{ ok: true }>(`${proj(repo, id)}/versions/leftovers/${enc(name)}`, { method: 'DELETE' }),
```

In `packages/web/src/pages/versions/VersionsPage.tsx`, replace:
```tsx
import type { VersionSummary } from '@dev-plumbing/core/schemas';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { api } from '../../api/client';
import { Group } from '../../components/GroupedList';
import { formatUpdated } from '../../lib/time';
```
with:
```tsx
import type { Leftover, VersionSummary } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { Group } from '../../components/GroupedList';
import { formatUpdated } from '../../lib/time';
```
replace:
```tsx
/** Every version of the plan, the current one first. Each opens that version's plan and draft. */
export function VersionsBody({ repo, project }: { repo: string; project: string }) {
```
with:
```tsx
/**
 * The folders updates that didn't finish left in docs/versions, each with Remove. Nothing removes them on its own: each
 * holds that version's plan and draft from before the update, the only copy of the draft as it was, until you say it
 * can go.
 */
function Leftovers({ repo, project, leftovers }: { repo: string; project: string; leftovers: Leftover[] }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (name: string) => api.removeLeftover(repo, project, name),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['versions', repo, project] }),
  });
  return (
    <>
      <Group title="Left over from updates that didn't finish" testId="leftovers-list">
        {leftovers.map((l) => (
          <div key={l.name} className="flex items-center gap-2.5 px-3 py-2.5" data-testid="leftover-row">
            <div className="min-w-0 flex-1">
              <div className="break-all font-mono text-[12px]">{l.name}</div>
              <div className="text-[11.5px] text-ink-3">
                v{l.version}'s plan and draft from before the update · set aside {formatUpdated(l.at)}
              </div>
            </div>
            <Button
              size="sm"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Remove ${l.name}? It holds your v${l.version} plan and draft from before an update that didn't finish. They're deleted.`)) remove.mutate(l.name);
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      </Group>
      {remove.error && <p className="mt-2 text-[12.5px] text-seal">{(remove.error as Error).message}</p>}
    </>
  );
}

/** Every version of the plan, the current one first. Each opens that version's plan and draft. */
export function VersionsBody({ repo, project }: { repo: string; project: string }) {
```
and, at the end of `VersionsBody`, replace:
```tsx
        ))}
      </Group>
    </div>
  );
}
```
with:
```tsx
        ))}
      </Group>
      {q.data.leftovers.length > 0 && <Leftovers repo={repo} project={project} leftovers={q.data.leftovers} />}
    </div>
  );
}
```
`VersionPage.tsx` reads `api.versions` too, and uses only `versions`, so it's unchanged.

- [ ] **Step 10: Run the tests**

Run:
```bash
pnpm vitest run packages/core/test/update.test.ts packages/service/test/update.test.ts packages/web/src/pages/versions
pnpm typecheck
pnpm test
pnpm test:e2e versions.spec.ts plan-update.spec.ts
pnpm test:e2e
```
Expected: PASS. `pnpm test` runs 1,025 tests in 109 files, 14 more than Task 8 left.
- Core `update.test.ts` gains 7 tests; Plan 5's three changed tests pass as changed.
- Service `update.test.ts` gains 4 tests (3 recovery, and the Review Focus test "only a leftover folder can be removed"); Task 7's catch-up tests pass unchanged.
- `VersionsPage.test.tsx` gains 3 tests.
- The e2e runs check that the Versions page and `/open` still work from the app's side.

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/schemas/views.ts packages/core/src/store/update.ts packages/core/test/update.test.ts packages/service/src/routes/claude.ts packages/service/src/routes/versions.ts packages/service/src/app.ts packages/service/test/update.test.ts packages/web/src/api/client.ts packages/web/src/pages/versions/VersionsPage.tsx packages/web/src/pages/versions/VersionsPage.test.tsx packages/web/src/pages/versions/VersionPage.test.tsx
git commit -m "feat: /dev-plumbing says when it put back an unfinished update, and leftover update folders can be removed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Re-import labels and traces, and parking a removed item's resolved thread

The rest of Plan 5's leftovers (Decision 15 (c) and (d)). A question a re-import adds to a thread says which plan version raised it, not "raised when the plan was imported". A re-import that was ended early (the window's `dp_wait` ran `finishImport` before every importer came back) records the types whose batch never came: the project home says so, and the next `/dev-plumbing` re-imports just those, as a catch-up again when it was one. It does that once on its own: cut short a second time, `/dev-plumbing` says so instead, and the one after tries again. While Claude has work under way it waits, and `/dev-plumbing` says that too. And the thread view offers Park on a resolved thread whose item a re-import removed from the plan, which `setParked` already allows.

**Files:**
- Modify:
  - `packages/core/src/schemas/loop.ts` (a Claude message's `raisedIn`)
  - `packages/core/src/schemas/project.ts` (`importIncomplete`, `importIncompleteCatchUp`, `importIncompleteTries`)
  - `packages/core/src/schemas/views.ts` (`ProjectHome.importIncomplete`)
  - `packages/core/src/store/importItems.ts` (`raisedIn` on a re-import's openings; `importDone` clears and `finishImport` records `importIncomplete` and what goes with it)
  - `packages/core/src/store/update.ts` (`IncompleteImport`, `resumeIncompleteImport`; `updatePlan` and `startCatchUp` start with nothing left to finish)
  - `packages/core/src/store/projects.ts` (`loadProjectHome` fills `importIncomplete`)
  - `packages/service/src/routes/claude.ts` (`/open` finishes a re-import that was ended early)
  - `packages/web/src/pages/MessageList.tsx` (`raised in the plan's v<n>`)
  - `packages/web/src/pages/ProjectHeader.tsx` (the home's line)
  - `packages/web/src/pages/ThreadView.tsx` (Park on a removed item's resolved thread)
  - `packages/web/src/components/AnswerForm.tsx` (the `canPark` comment)
  - `packages/core/test/importItems.test.ts`, `packages/core/test/update.test.ts`, `packages/core/test/projects.test.ts`, `packages/core/test/catchUp.test.ts`, `packages/service/test/update.test.ts`, `packages/web/src/pages/ProjectHeader.test.tsx`
- Create:
  - `packages/web/src/pages/ThreadView.test.tsx`
- Test: all of the test files above.

`plan-update.spec.ts` doesn't gain the removed resolved Park: a removed item's thread is resolved only when it was with Claude when the re-import removed it, and an update refuses to start while a thread is with Claude, so the e2e can't get there without writing project files by hand. `ThreadView.test.tsx` covers it, and `setParked`'s own tests (Plan 5) cover the core.

**Interfaces:**
- Consumes:
  - From Plan 5: `writeImportBatch`'s `opening` message and `reimportItem` (`store/importItems.ts`); `importDone` and `finishImport`; `project.reimporting` and `project.importPending`; `updateRefusal`, `importableTypes` and `currentVersion` (`store/update.ts`); `setParked`'s rule (a resolved thread can be parked only when its item has `removedIn`); `ThreadDetail.item.removedIn` (the detail carries the whole item).
  - From Task 7 (`claude.ts`): `telling`, `CATCH_UP`, `caughtUp`, `waits`, the `catchUpDue,` first in the core import, the catch-up block (the resume goes just before it), and the reopened `next`; Task 7's `startCatchUp` keeps every other project field and sets `reimporting.catchUp`, so a catch-up re-import that's cut short is recorded here like any other, and stays a catch-up. From Task 7 (`projects.ts`): the `catchUpDue` line at the end of `loadProjectHome`. From Task 7 (`service/test/update.test.ts`): `describe('catching the items up with settled Plan changes', …)`, its `atV2`, `settle`, `CATCH_UP` and `WAITS`. From Task 7 (`core/test/catchUp.test.ts`): `atV2`, `accept`, `runImporters`, `CONFLICT`, `IMPORTABLE`, `T` and `types`.
  - From Task 9: `andList` (`schemas/views.ts`), `putBackFirst` and `recovery` in `/open`, and the reopened `next` as Task 9 left it; `resumeIncompleteImport` goes after Task 9's `removeLeftover`, at the end of `update.ts`.
- Produces, as in the header's Contracts:
  ```ts
  // schemas/loop.ts, claudeMessageSchema
  raisedIn: z.number().int().min(2).optional(),
  // schemas/project.ts, plumbingProjectSchema
  importIncomplete: z.array(z.string()).optional(),   // type ids
  importIncompleteCatchUp: z.boolean().optional(),    // the re-import cut short was a catch-up
  importIncompleteTries: z.number().int().min(1).optional(),   // how many times this version's re-import was cut short
  // schemas/views.ts, ProjectHome
  importIncomplete: { version: number; titles: string[]; again: boolean } | null;
  // store/update.ts
  export type IncompleteImport = { kind: 'resumed' | 'waits' | 'again'; version: number; importTypes: string[] };
  export async function resumeIncompleteImport(dir: string, o: { types: PlumbingType[]; now?: Date }): Promise<IncompleteImport | null>;
  ```
  `/open` calls `resumeIncompleteImport` under the lock.
- **Rules:**
  - **`raisedIn`:** in a re-import (`project.reimporting` set), every opening message `writeImportBatch` writes, on a changed item's thread (`reimportItem`) or a new item's, has `raisedIn: reimporting.version`. At first import there's none. `MessageList` labels an opening `raised in the plan's v${raisedIn}` when it has one, else "raised when the plan was imported", as before.
  - **`finishImport`** in a re-import records `importIncomplete: project.importPending`, every type whose batch never came (whether it has items or not), and leaves it out when there are none. With it, it counts the cut in `importIncompleteTries` (one more than before), and records `importIncompleteCatchUp: true` when the re-import was a catch-up (`reimporting.catchUp`). A first import records nothing: its types already say "Didn't finish". `importDone` drops all three whenever an import ends with every batch in, so an import whose last batch comes clears them. `updatePlan` and Task 7's `startCatchUp` drop them too: each re-imports every type, so nothing of the re-import before is left to finish, and the count starts again.
  - **`resumeIncompleteImport(dir, o)`**, in this order:
    - null, writing nothing, when `importIncomplete` is empty or absent, or the project is importing;
    - the types to run are `importableTypes(o.types)` whose id is in `importIncomplete`, in that order. With none (all turned off since), or a project at v1, it clears the three fields and returns null;
    - `{ kind: 'waits', version, importTypes }`, writing nothing, while `updateRefusal(dir)` says anything (an import, threads with Claude, a finalize), as an update and Task 7's catch-up wait;
    - `{ kind: 'again', version, importTypes }` when `importIncompleteTries` is 2 or more: it was cut short again after its one resume, so it isn't run on its own a third time. It sets `importIncompleteTries` back to 1, so the next `/dev-plumbing`, which the user runs after being told, tries once more;
    - else it writes `status: 'importing'`, `importPending` = those ids, `reimporting: { version: currentVersion(project).n, from: 'finalized' | 'active' }`, with `catchUp: true` when `importIncompleteCatchUp` is set (so a cut-short catch-up is finished as a catch-up, with the settled edits as its `changes` and no conflicts), and `updatedAt`, keeping the three fields (the end of the import clears them), and returns `{ kind: 'resumed', version, importTypes }`.
  - **`/open`:** right after the update check, before Task 7's catch-up, when the project wasn't just created and no update ran, `resumeIncompleteImport` runs under the project's lock, after Task 9's `putBackFirst`. When it resumes, this window claims the import under that lock (`rt.listeners.seen` and `claimImport`), as an update's re-import does, so another window's `dp_wait` can't end it first. A catch-up that's due as well then waits, since the project is importing, and says so (Task 7's `waits`): in one `/open`, either the unfinished re-import or the catch-up starts, never both. The resume runs after "Not now" (`update: false`) too: finishing the current version's re-import is no answer to the new version's question, and Not now is the only way to open a project whose plan moved on without updating. When it resumed, `changed(ref)` tells the browser, and `importTypes` comes back built as always (two waves). The reopened `next` tells, after the recovery lines, `tell` and Task 7's catch-up line, and before Task 7's `waits` (titles from the configured types):
    - resumed: `The v${version} re-import didn't finish for ${andList(titles)}. Finishing it now.`;
    - waits: `The v${version} re-import still needs to finish for ${andList(titles)}. It waits until Claude has answered: run /dev-plumbing again then.`;
    - again: `The v${version} re-import didn't finish again for ${andList(titles)}. Run /dev-plumbing to try again.`
  - **`ProjectHome.importIncomplete`:** `{ version: currentVersion(project).n, titles, again }` when the project isn't importing and `importIncomplete` isn't empty, with each type's title (its id when it's no longer configured), and `again` when `importIncompleteTries` is 2 or more; else null. The project header shows `The v${version} re-import didn't finish for ${andList(titles)}. Run /dev-plumbing to try again.`, or with `again`, `The v${version} re-import didn't finish again for ${andList(titles)}. Run /dev-plumbing to try again.`, under the source line (`data-testid="import-incomplete"`, `text-[12.5px] text-ink-2`), on every page of the project.
  - **Park:** `ThreadView` passes `canPark={status !== 'resolved' || d.item.removedIn !== undefined}` to `AnswerForm`. Other resolved threads still have no Park, and `setParked`'s rule is unchanged.

- [ ] **Step 1: Write the failing core tests**

In `packages/core/test/importItems.test.ts`, in `describe('re-import', …)`, add before `it("finishing early marks only the types with no items as didn't finish", …)`:
```ts
  it('a question a re-import adds names the version it was raised in, and one at import does not', async () => {
    const dir = await reimporting([imported('who', { status: 'idle', messages: [] })]);
    await send(dir, [
      { ...same('who'), summary: 'Now about email and SMS.', message: { text: 'Email or SMS first?' } },
      { key: 'how-often', title: 'How often?', summary: 'Once, or until they reorder?', message: { text: 'Remind once?' } },
    ]);
    // A changed item's thread, and a new item's.
    expect((await readThread(dir, 't-questions-who')).messages.at(-1)).toMatchObject({ author: 'claude', text: 'Email or SMS first?', opening: true, raisedIn: 2 });
    expect((await readThread(dir, 't-questions-how-often')).messages).toMatchObject([{ author: 'claude', text: 'Remind once?', opening: true, raisedIn: 2 }]);

    const first = await seedProject({ project: { status: 'importing', importPending: ['questions'] } });
    await send(first, [{ key: 'who', title: 'Who first?', summary: 'Everyone?', message: { text: 'Everyone?' } }]);
    const [opening] = (await readThread(first, 't-questions-who')).messages;
    expect(opening).toMatchObject({ author: 'claude', opening: true });
    expect(opening).not.toHaveProperty('raisedIn');
  });

  it('a re-import ended early records the types whose batch never came, and one that finishes clears them', async () => {
    const dir = await reimporting([imported('who')], { pending: ['questions', 'architecture', 'concerns'] });
    await send(dir, [same('who')]);
    expect(await finishImport(dir)).toBe(true);
    // Architecture had items, so it isn't marked "didn't finish", but its batch never came either. The cut is counted.
    const ended = await readProjectFile(dir);
    expect(ended).toMatchObject({ status: 'active', importPending: [], importIncomplete: ['architecture', 'concerns'], importIncompleteTries: 1 });
    // It was an update's re-import, not a catch-up.
    expect(ended.importIncompleteCatchUp).toBeUndefined();

    // The types run again, and the last batch ends the import: nothing is left to finish.
    await writeProjectFile(dir, { ...ended, status: 'importing', importPending: ['architecture', 'concerns'], reimporting: { version: 2, from: 'active' } });
    await writeImportBatch({ dir, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'Nothing structural changes.' } });
    expect((await readProjectFile(dir)).importIncomplete).toEqual(['architecture', 'concerns']);
    await writeImportBatch({ dir, type: TYPES.find((t) => t.id === 'concerns')!, types: TYPES, clone: '/x', batch: { noChanges: 'No new risks.' } });
    const done = await readProjectFile(dir);
    expect(done).toMatchObject({ status: 'active', importPending: [] });
    expect(done.importIncomplete).toBeUndefined();
    expect(done.importIncompleteTries).toBeUndefined();

    // A first import ended early records nothing: its types say "Didn't finish" on their own.
    const first = await seedProject({ project: { status: 'importing', importPending: ['architecture', 'questions'] } });
    await finishImport(first);
    expect((await readProjectFile(first)).importIncomplete).toBeUndefined();
  });

```
(`reimporting`, `imported`, `same`, `send`, `architecture`, `TYPES`, `seedProject`, `readThread`, `readProjectFile`, `writeProjectFile`, `writeImportBatch` and `finishImport` are already there.)

In `packages/core/test/update.test.ts`, replace (as Task 9 left them):
```ts
import { finishSubmission, pendingSubmissions, pickUp } from '../src/store/queue';
import { listLeftovers, NOT_A_LEFTOVER, planChange, recoverUnfinishedUpdate, recoveryLines, removeLeftover, updatePlan } from '../src/store/update';
```
with:
```ts
import { finishImport, writeImportBatch } from '../src/store/importItems';
import { finishSubmission, pendingSubmissions, pickUp } from '../src/store/queue';
import { listLeftovers, NOT_A_LEFTOVER, planChange, recoverUnfinishedUpdate, recoveryLines, removeLeftover, resumeIncompleteImport, updatePlan } from '../src/store/update';
```
and add at the end of the file:
```ts

describe('finishing a re-import that was ended early', () => {
  const T4 = new Date('2026-10-07T10:00:00.000Z');
  /** Brought v2 in, then only Questions' importer came back before the window ended the import. */
  async function endedEarly(): Promise<string> {
    const dir = await seed({ pairs: [pair('q1')] });
    await update(dir, CLEAN);
    const questions = types.find((t) => t.id === 'questions')!;
    await writeImportBatch({ dir, type: questions, types, clone: '/x', batch: { noChanges: 'Nothing new.' } });
    await finishImport(dir);
    return dir;
  }

  it('imports again just the types whose batch never came, as a re-import of the same version', async () => {
    const dir = await endedEarly();
    expect(await readProjectFile(dir)).toMatchObject({ status: 'active', importIncomplete: ['architecture', 'concerns'], importIncompleteTries: 1 });
    expect(await resumeIncompleteImport(dir, { types, now: T4 })).toEqual({ kind: 'resumed', version: 2, importTypes: ['architecture', 'concerns'] });
    const project = await readProjectFile(dir);
    expect(project).toMatchObject({
      status: 'importing',
      importPending: ['architecture', 'concerns'],
      reimporting: { version: 2, from: 'active' },
      importIncomplete: ['architecture', 'concerns'],
      importIncompleteTries: 1,
      updatedAt: T4.toISOString(),
    });
    // An update's re-import, not a catch-up.
    expect(project.reimporting).not.toHaveProperty('catchUp');
    // Once it's importing again, there's nothing more to start.
    expect(await resumeIncompleteImport(dir, { types })).toBeNull();
    // Both batches come: the import ends, and nothing is left to finish.
    for (const id of ['architecture', 'concerns']) {
      await writeImportBatch({ dir, type: types.find((t) => t.id === id)!, types, clone: '/x', batch: { noChanges: 'Nothing new.' } });
    }
    const done = await readProjectFile(dir);
    expect(done).toMatchObject({ status: 'active', importPending: [] });
    expect(done.importIncomplete).toBeUndefined();
    expect(await resumeIncompleteImport(dir, { types })).toBeNull();
  });

  it('goes back to Finalized afterwards when the project was', async () => {
    // An update that left a finalized project's draft as it was keeps it Finalized.
    const dir = await endedEarly();
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), status: 'finalized' });
    await resumeIncompleteImport(dir, { types });
    expect((await readProjectFile(dir)).reimporting).toEqual({ version: 2, from: 'finalized' });
  });

  it('waits, writing nothing, while an update would have to, and says so', async () => {
    const dir = await endedEarly();
    const thread = await readThread(dir, 't-q1');
    await writeThread(dir, { ...thread, status: 'with_claude' });
    const before = await snapshot(dir);
    expect(await resumeIncompleteImport(dir, { types })).toEqual({ kind: 'waits', version: 2, importTypes: ['architecture', 'concerns'] });
    expect(await snapshot(dir)).toEqual(before);
  });

  it('is tried once on its own: cut short again, it says so, and the next /dev-plumbing tries once more', async () => {
    const dir = await endedEarly();
    expect(await resumeIncompleteImport(dir, { types })).toMatchObject({ kind: 'resumed' });
    // Cut short again: the second cut is counted.
    await finishImport(dir);
    expect(await readProjectFile(dir)).toMatchObject({ status: 'active', importIncomplete: ['architecture', 'concerns'], importIncompleteTries: 2 });
    // Not a third time on its own: it says so, and the count goes back, so the next run, after the user was told, tries.
    expect(await resumeIncompleteImport(dir, { types, now: T4 })).toEqual({ kind: 'again', version: 2, importTypes: ['architecture', 'concerns'] });
    expect(await readProjectFile(dir)).toMatchObject({ status: 'active', importIncomplete: ['architecture', 'concerns'], importIncompleteTries: 1 });
    expect(await resumeIncompleteImport(dir, { types })).toMatchObject({ kind: 'resumed', version: 2 });
  });

  it("is forgotten by an update to a newer version, which re-imports every type", async () => {
    const dir = await endedEarly();
    await update(dir, CLEAN.replace('take two', 'take three'), { now: T4 });
    const project = await readProjectFile(dir);
    expect(project).toMatchObject({ status: 'importing', importPending: IMPORTABLE, reimporting: { version: 3, from: 'active' } });
    for (const field of ['importIncomplete', 'importIncompleteCatchUp', 'importIncompleteTries']) expect(project).not.toHaveProperty(field);
  });

  it("drops types that can't be imported any more, and clears the record when none is left", async () => {
    const dir = await endedEarly();
    const withoutConcerns = types.map((t) => (t.id === 'concerns' ? { ...t, enabled: false } : t));
    expect(await resumeIncompleteImport(dir, { types: withoutConcerns })).toEqual({ kind: 'resumed', version: 2, importTypes: ['architecture'] });

    const other = await endedEarly();
    const neither = types.map((t) => (t.id === 'concerns' || t.id === 'architecture' ? { ...t, enabled: false } : t));
    expect(await resumeIncompleteImport(other, { types: neither })).toBeNull();
    const project = await readProjectFile(other);
    expect(project).toMatchObject({ status: 'active', importPending: [] });
    expect(project.importIncomplete).toBeUndefined();
    expect(project.importIncompleteTries).toBeUndefined();
  });
});
```
(In this file, `types` makes architecture, questions and concerns importable, so v2's re-import runs those three.)

In `packages/core/test/catchUp.test.ts` (Task 7's), replace:
```ts
import { catchUpDue, catchUpWaiting, startCatchUp, updatePlan } from '../src/store/update';
```
with:
```ts
import { catchUpDue, catchUpWaiting, resumeIncompleteImport, startCatchUp, updatePlan } from '../src/store/update';
```
and add before `describe("a catch-up importer's pack", …)`:
```ts
describe('a catch-up that was cut short', () => {
  it('is finished as the catch-up it was, with only the settled edits and no conflicts', async () => {
    const dir = await atV2();
    await accept(dir, CONFLICT, 'merged');
    expect(await startCatchUp(dir, { version: 2, types, windowId: 'w-a', now: T })).toEqual({ importTypes: IMPORTABLE });
    // Only Architecture's importer came back before the window ended the import.
    await runImporters(dir, ['architecture']);
    expect(await finishImport(dir, { windowId: 'w-a' })).toBe(true);
    expect(await readProjectFile(dir)).toMatchObject({
      status: 'active',
      caughtUp: 2,
      importIncomplete: ['questions', 'concerns'],
      importIncompleteCatchUp: true,
      importIncompleteTries: 1,
    });
    // The next /dev-plumbing finishes it as a catch-up: caughtUp is already set, so nothing else would bring the
    // settled edits to those types.
    expect(await resumeIncompleteImport(dir, { types, now: T })).toEqual({ kind: 'resumed', version: 2, importTypes: ['questions', 'concerns'] });
    expect((await readProjectFile(dir)).reimporting).toEqual({ version: 2, from: 'active', catchUp: true });
    const pack = await importPack({ dir, typeId: 'questions', types });
    expect(pack.reimport).toMatchObject({ from: 2, to: 2, catchUp: true, conflicts: [] });
    expect(pack.reimport!.changes).toBe(['@@ Approach', '- sends an email reminder.', '+ sends an email or a text message.'].join('\n'));
    expect(await runImporters(dir, ['questions', 'concerns'])).toEqual([false, true]);
    const done = await readProjectFile(dir);
    expect(done).toMatchObject({ status: 'active', importPending: [], caughtUp: 2 });
    for (const field of ['reimporting', 'importIncomplete', 'importIncompleteCatchUp', 'importIncompleteTries']) expect(done).not.toHaveProperty(field);
    expect((await readThread(dir, 't-questions-approach')).messages.at(-1)).toMatchObject({ author: 'system', text: 'Updated to match your settled Plan changes.' });
  });
});

```

In `packages/core/test/projects.test.ts`, add before `describe('the project home for Plan changes', …)`:
```ts
describe('the project home after a re-import that was ended early', () => {
  it('names the version and the types whose batch never came, once the project is not importing', async () => {
    const dir = await seedProject();
    const restock = { repo: 'acme', id: 'restock', dir };
    expect((await loadProjectHome(restock, TYPES)).importIncomplete).toBeNull();
    const v = { at: '2026-10-05T09:00:00.000Z', clone: '/tmp/acme', branch: 'main', commit: null };
    const versions = [{ ...v, n: 1, hash: 'x' }, { ...v, n: 2, hash: 'y', merge: { clean: 1, conflicts: 0 } }];
    const project = { ...(await readProjectFile(dir)), versions, importIncomplete: ['architecture', 'concerns', 'gone'] };
    await writeProjectFile(dir, project);
    // A type that isn't configured any more shows its id.
    expect((await loadProjectHome(restock, TYPES)).importIncomplete).toEqual({ version: 2, titles: ['Architecture', 'Concerns', 'gone'], again: false });
    // Cut short a second time, it says so.
    await writeProjectFile(dir, { ...project, importIncompleteTries: 2 });
    expect((await loadProjectHome(restock, TYPES)).importIncomplete).toEqual({ version: 2, titles: ['Architecture', 'Concerns', 'gone'], again: true });
    // While the re-import runs again, there's nothing to say.
    await writeProjectFile(dir, { ...project, status: 'importing', importPending: ['architecture', 'concerns'], reimporting: { version: 2, from: 'active' } });
    expect((await loadProjectHome(restock, TYPES)).importIncomplete).toBeNull();
  });
});

```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/importItems.test.ts packages/core/test/update.test.ts packages/core/test/projects.test.ts packages/core/test/catchUp.test.ts`
Expected: FAIL, 9 tests.
- `importItems.test.ts`: the two new tests: nothing writes `raisedIn` on the openings yet, and `finishImport` records no `importIncomplete`.
- `update.test.ts`: five of the six new tests. The first finds no `importIncomplete` after the import was ended; the next four fail with `TypeError: (0 , resumeIncompleteImport) is not a function`. "is forgotten by an update to a newer version…" passes already, since nothing records `importIncomplete` yet.
- `catchUp.test.ts`: the new test: `finishImport` records no `importIncomplete`.
- `projects.test.ts`: the home has no `importIncomplete` (`undefined`, not `null`).

- [ ] **Step 3: The schemas**

In `packages/core/src/schemas/loop.ts`, in `claudeMessageSchema`, replace:
```ts
    /** The message an importer wrote when the item was created. */
    opening: z.boolean().optional(),
  })
  .passthrough();
```
with:
```ts
    /** The message an importer wrote when the item was created. */
    opening: z.boolean().optional(),
    /** On an opening a re-import wrote: the plan version it was raised in (the app says "raised in the plan's v<n>"). */
    raisedIn: z.number().int().min(2).optional(),
  })
  .passthrough();
```

In `packages/core/src/schemas/project.ts`, replace:
```ts
  /** While importing: the Claude window that runs the importers. Only it, or another once it's gone, ends the import. */
  importBy: z.string().optional(),
```
with:
```ts
  /** While importing: the Claude window that runs the importers. Only it, or another once it's gone, ends the import. */
  importBy: z.string().optional(),
  /**
   * The plumbing types (ids) whose batch never came in a re-import that was ended early. The project home says so,
   * and the next /dev-plumbing re-imports just those. Cleared once an import finishes with every batch in.
   */
  importIncomplete: z.array(z.string()).optional(),
  /** The re-import that was ended early was a catch-up, so finishing it is one too (reimporting.catchUp). */
  importIncompleteCatchUp: z.boolean().optional(),
  /** How many times this version's re-import was ended early. From 2, /dev-plumbing says so rather than run it again. */
  importIncompleteTries: z.number().int().min(1).optional(),
```

In `packages/core/src/schemas/views.ts`, at the end of `ProjectHome`, replace:
```ts
  defense: { ready: boolean; stale: boolean; state: WhiteboardState | null };
};
```
with:
```ts
  defense: { ready: boolean; stale: boolean; state: WhiteboardState | null };
  /**
   * A re-import that was ended early, once the project isn't importing: the version it imported, the titles of the
   * types whose batch never came, and `again` when it was ended early again after /dev-plumbing tried once more; or null.
   */
  importIncomplete: { version: number; titles: string[]; again: boolean } | null;
};
```
The web's tests build `ProjectHome` objects with `as unknown as ProjectHome`, so the new field doesn't break them.

- [ ] **Step 4: Label a re-import's questions, and record a re-import cut short**

In `packages/core/src/store/importItems.ts`, in `writeImportBatch`, replace:
```ts
          ...(it.message.options ? { options: it.message.options } : {}),
          ...(it.message.recommended ? { recommended: it.message.recommended } : {}),
        }
      : null;
```
with:
```ts
          ...(it.message.options ? { options: it.message.options } : {}),
          ...(it.message.recommended ? { recommended: it.message.recommended } : {}),
          // A re-import's question names the version it came with.
          ...(reimport ? { raisedIn: reimport.version } : {}),
        }
      : null;
```

Replace:
```ts
/** The project once its import has finished: Active, or, after a re-import, whatever it was before the update. */
function importDone(project: PlumbingProject, changes: Pick<PlumbingProject, 'importPending' | 'emptyTypes' | 'updatedAt'>): PlumbingProject {
  const { reimporting, importBy: _importBy, ...rest } = project;
  return { ...rest, ...changes, status: reimporting?.from ?? 'active' };
}
```
with:
```ts
/**
 * The project once its import has finished: Active, or, after a re-import, whatever it was before the update. An import
 * that finished clears importIncomplete and what goes with it; finishImport records them again when a re-import ends
 * with types missing.
 */
function importDone(
  project: PlumbingProject,
  changes: Pick<PlumbingProject, 'importPending' | 'emptyTypes' | 'updatedAt' | 'importIncomplete' | 'importIncompleteCatchUp' | 'importIncompleteTries'>,
): PlumbingProject {
  const { reimporting, importBy: _importBy, importIncomplete: _incomplete, importIncompleteCatchUp: _catchUp, importIncompleteTries: _tries, ...rest } = project;
  return { ...rest, ...changes, status: reimporting?.from ?? 'active' };
}
```

Replace `finishImport`'s doc comment:
```ts
/**
 * Ends an import whose importers have all returned. Types that never wrote and have no items are marked "didn't
 * finish" (in a re-import, a type whose importer didn't return keeps its items as they were). The project goes back
 * to Active, or to Finalized after a finalized project's re-import. Only the window that runs the importers
 * (`importBy`) ends it, or another one once that window is no longer alive.
 */
```
with:
```ts
/**
 * Ends an import whose importers have all returned. Types that never wrote and have no items are marked "didn't
 * finish" (in a re-import, a type whose importer didn't return keeps its items as they were). A re-import records
 * every type whose batch never came in importIncomplete, so the project home says so and the next /dev-plumbing
 * re-imports just those. The project goes back to Active, or to Finalized after a finalized project's re-import. Only
 * the window that runs the importers (`importBy`) ends it, or another one once that window is no longer alive.
 */
```
and its last lines:
```ts
  await writeProjectFile(dir, importDone(project, { importPending: [], emptyTypes: [...project.emptyTypes, ...missing], updatedAt: now.toISOString() }));
  return true;
```
with:
```ts
  // A re-import ended early: the types whose batch never came, how many times this version's re-import was cut, and
  // whether it was a catch-up, so the next /dev-plumbing finishes it the same way.
  const incomplete = project.reimporting ? project.importPending : [];
  await writeProjectFile(
    dir,
    importDone(project, {
      importPending: [],
      emptyTypes: [...project.emptyTypes, ...missing],
      updatedAt: now.toISOString(),
      ...(incomplete.length
        ? {
            importIncomplete: incomplete,
            importIncompleteTries: (project.importIncompleteTries ?? 0) + 1,
            ...(project.reimporting?.catchUp ? { importIncompleteCatchUp: true } : {}),
          }
        : {}),
    }),
  );
  return true;
```

- [ ] **Step 5: Finish a re-import that was cut short**

In `packages/core/src/store/update.ts`, add at the end of the file, after Task 9's `removeLeftover`:
```ts

/**
 * What /open did about a re-import that was ended early: `resumed` it (the types are importing again), it `waits` for
 * work under way, or it was ended early `again` after one resume, so it isn't run on its own a third time.
 * `importTypes` are the types still to finish.
 */
export type IncompleteImport = { kind: 'resumed' | 'waits' | 'again'; version: number; importTypes: string[] };

/**
 * Finishes a re-import that was ended early (finishImport recorded importIncomplete): the types whose batch never came
 * are imported again, as a re-import of the current version (matched by key, new items added, removed ones parked),
 * and only those, as a catch-up again when it was one. Null, writing nothing, when there's nothing to finish or the
 * project is importing. Types that can't be imported any more (turned off since) are dropped; with none left, the
 * record is cleared and it's null. While updateRefusal says an update would have to wait, it `waits`, writing nothing.
 * It runs once on its own: ended early again (importIncompleteTries 2), it's `again`, and the count goes back to 1, so
 * the next /dev-plumbing, after the user is told, tries once more. Under the project's lock, after
 * recoverUnfinishedUpdate.
 */
export async function resumeIncompleteImport(dir: string, o: { types: PlumbingType[]; now?: Date }): Promise<IncompleteImport | null> {
  const project = await readProjectFile(dir);
  const incomplete = project.importIncomplete ?? [];
  if (!incomplete.length || project.status === 'importing') return null;
  const version = currentVersion(project).n;
  const importTypes = importableTypes(o.types)
    .map((t) => t.id)
    .filter((id) => incomplete.includes(id));
  const updatedAt = (o.now ?? new Date()).toISOString();
  const { importIncomplete: _incomplete, importIncompleteCatchUp: _catchUp, importIncompleteTries: _tries, ...rest } = project;
  // v1 has no re-import to finish.
  if (!importTypes.length || version < 2) {
    await writeProjectFile(dir, { ...rest, updatedAt });
    return null;
  }
  if (await updateRefusal(dir)) return { kind: 'waits', version, importTypes };
  if ((project.importIncompleteTries ?? 1) >= 2) {
    await writeProjectFile(dir, { ...project, importIncompleteTries: 1, updatedAt });
    return { kind: 'again', version, importTypes };
  }
  const from = project.status === 'finalized' ? 'finalized' : 'active';
  // A catch-up that was ended early is finished as one, with the settled edits as its changes.
  const reimporting: PlumbingProject['reimporting'] = { version, from, ...(project.importIncompleteCatchUp ? { catchUp: true } : {}) };
  await writeProjectFile(dir, { ...project, importPending: importTypes, status: 'importing', reimporting, updatedAt });
  return { kind: 'resumed', version, importTypes };
}
```
(`readProjectFile`, `writeProjectFile`, `updateRefusal`, `importableTypes`, `currentVersion` and the `PlumbingProject` type are already in this module.)

A new version re-imports every type, so in `updatePlan`, replace:
```ts
  const { reimporting: _earlier, importBy: _importer, ...rest } = project;
```
with:
```ts
  // Nothing of an earlier re-import that was ended early is left to finish: this one imports every type again.
  const { reimporting: _earlier, importBy: _importer, importIncomplete: _incomplete, importIncompleteCatchUp: _catchUp, importIncompleteTries: _tries, ...rest } = project;
```
and so does Task 7's catch-up. In `startCatchUp`, replace:
```ts
  const from = project.status === 'finalized' ? 'finalized' : 'active';
  await writeProjectFile(dir, {
    ...project,
    caughtUp: o.version,
```
with:
```ts
  const from = project.status === 'finalized' ? 'finalized' : 'active';
  // It imports every type again, so a re-import that was ended early has nothing left to finish.
  const { importIncomplete: _incomplete, importIncompleteCatchUp: _catchUp, importIncompleteTries: _tries, ...rest } = project;
  await writeProjectFile(dir, {
    ...rest,
    caughtUp: o.version,
```

- [ ] **Step 6: The project home says so**

In `packages/core/src/store/projects.ts`, at the end of `loadProjectHome`, replace (as Task 7 left it):
```ts
  const catchUpDue = (await catchUpWaiting(ref.dir)) !== null;
  return { summary, project, types: typeEntries, inbox, documents, version, catchUpDue, finalize, defense: await defenseStatus(ref.dir) };
```
with:
```ts
  const catchUpDue = (await catchUpWaiting(ref.dir)) !== null;
  // While it's importing again, the re-import is under way, so there's nothing to say yet.
  const incomplete = project.status === 'importing' ? [] : (project.importIncomplete ?? []);
  const importIncomplete = incomplete.length
    ? { version: version.current, titles: incomplete.map((id) => titleOf.get(id) ?? id), again: (project.importIncompleteTries ?? 1) >= 2 }
    : null;
  return { summary, project, types: typeEntries, inbox, documents, version, catchUpDue, finalize, defense: await defenseStatus(ref.dir), importIncomplete };
```
(`titleOf` maps each configured type's id to its title, near the top of `loadProjectHome`.)

- [ ] **Step 7: Run the core tests**

Run: `pnpm vitest run packages/core/test/importItems.test.ts packages/core/test/update.test.ts packages/core/test/projects.test.ts packages/core/test/catchUp.test.ts`
Expected: PASS (2 new in `importItems.test.ts`, 6 in `update.test.ts`, 1 in `projects.test.ts` and 1 in `catchUp.test.ts`).

- [ ] **Step 8: Write the failing service and web tests**

In `packages/service/test/update.test.ts`, add before `describe('versions', () => {` (after Task 9's `describe('an update that stopped part-way', …)`):
```ts
describe('a re-import that was ended early', () => {
  it('is finished by the next /dev-plumbing, for just the types whose batch never came', async () => {
    const t = await setup();
    await rewritePlan(t, V2);
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    // Every importer but Architecture's and Flows' comes back. Then the window listens, which ends the import.
    const back = (yes.body.importTypes as { id: string }[]).filter((x) => x.id !== 'architecture' && x.id !== 'flows');
    await importAll(t, back, QUESTIONS.map(({ message: _message, ...item }) => item));
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'active', importIncomplete: ['architecture', 'flows'] });
    expect((await t.send('GET', P)).body.importIncomplete).toEqual({ version: 2, titles: ['Architecture', 'Flows'], again: false });

    const again = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(again.body).toMatchObject({ kind: 'reopened', next: `Tell the user: "The v2 re-import didn't finish for Architecture and Flows. Finishing it now." ${IMPORT_NEXT}` });
    expect(again.body.importTypes).toEqual([
      { id: 'architecture', title: 'Architecture' },
      { id: 'flows', title: 'Flows', afterOthers: true },
    ]);
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', importPending: ['architecture', 'flows'], reimporting: { version: 2, from: 'active' }, importBy: 'w-a' });
    expect((await t.send('GET', P)).body.importIncomplete).toBeNull();

    const results = await importAll(t, again.body.importTypes, []);
    expect(results.at(-1)).toMatchObject({ importFinished: true });
    expect((await readProjectFile(t.dir)).importIncomplete).toBeUndefined();
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', importTypes: [], next: WAIT_NEXT });
  });

  it('waits while Claude has a thread to answer, and ended early again, says so before it tries once more', async () => {
    const t = await setup();
    await rewritePlan(t, V2);
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    const back = (yes.body.importTypes as { id: string }[]).filter((x) => x.id !== 'architecture' && x.id !== 'flows');
    await importAll(t, back, QUESTIONS.map(({ message: _message, ...item }) => item));
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });

    // You asked something Claude hasn't answered yet: it waits, and says so.
    await t.send('PUT', `${P}/threads/t-questions-who/draft`, { text: 'Everyone.' });
    expect((await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-who' })).body).toMatchObject({ sent: 1 });
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({
      kind: 'reopened',
      importTypes: [],
      next: `Tell the user: "The v2 re-import still needs to finish for Architecture and Flows. It waits until Claude has answered: run /dev-plumbing again then." ${WAIT_NEXT}`,
    });
    const wait = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect(wait.body).toMatchObject({ kind: 'submission' });
    expect((await t.claude('/reply', { ...base, threadId: 't-questions-who', text: 'Everyone gets them.', resolve: { decision: 'Everyone gets reminders.' } })).status).toBe(200);

    // Then the next /dev-plumbing finishes it, but it's ended early again.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body.next).toBe(
      `Tell the user: "The v2 re-import didn't finish for Architecture and Flows. Finishing it now." ${IMPORT_NEXT}`,
    );
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { submission: wait.body.submission } })).body).toEqual({ kind: 'timeout' });
    expect((await t.send('GET', P)).body.importIncomplete).toEqual({ version: 2, titles: ['Architecture', 'Flows'], again: true });

    // Not a third time on its own: it says so, and the /dev-plumbing after that tries once more.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({
      kind: 'reopened',
      importTypes: [],
      next: `Tell the user: "The v2 re-import didn't finish again for Architecture and Flows. Run /dev-plumbing to try again." ${WAIT_NEXT}`,
    });
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body.next).toBe(
      `Tell the user: "The v2 re-import didn't finish for Architecture and Flows. Finishing it now." ${IMPORT_NEXT}`,
    );
  });
});

```
(v2 merges cleanly here, with no Plan changes, so Task 7's catch-up never applies.)

Then, inside Task 7's `describe('catching the items up with settled Plan changes', …)`, add before `it("doesn't re-import when you kept your draft, and says it waits while Claude has a thread to answer", …)`:
```ts
  it('waits for a re-import that was ended early, which the same /dev-plumbing finishes first', async () => {
    const t = await atV2();
    await settle(t, 'merged');
    // The update's re-import had been ended before Flows' importer came back.
    await writeJsonAtomic(path.join(t.dir, 'project.json'), { ...(await readProjectFile(t.dir)), importIncomplete: ['flows'] });
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    // It's finished first, and the catch-up says it waits for another /dev-plumbing.
    expect(open.body).toMatchObject({
      kind: 'reopened',
      next: `Tell the user: "The v2 re-import didn't finish for Flows. Finishing it now. Your settled Plan changes still need a re-import. It waits until Claude has answered: run /dev-plumbing again then." ${IMPORT_NEXT}`,
    });
    expect(open.body.importTypes).toEqual([{ id: 'flows', title: 'Flows', afterOthers: true }]);
    const project = await readProjectFile(t.dir);
    expect(project).toMatchObject({ status: 'importing', importPending: ['flows'], reimporting: { version: 2, from: 'active' }, importBy: 'w-a' });
    // The catch-up waits for it: nothing recorded it yet.
    expect(project.caughtUp).toBeUndefined();
    await importAll(t, open.body.importTypes, []);
    // Then the next /dev-plumbing catches the items up.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', next: CATCH_UP });
  });
```

Create `packages/web/src/pages/ThreadView.test.tsx`:
```tsx
import type { Message, ThreadDetail } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { ThreadView } from './ThreadView';

vi.mock('@tanstack/react-router', async () => ({
  ...(await import('./visual/testkit')).routerMock(vi.fn()),
  useParams: () => ({ repo: 'acme-app', project: 'restock', thread: 't-questions-log' }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const AT = '2026-10-05T09:00:00.000Z';
const ANSWERED: Message[] = [
  { id: 'm-1', at: AT, author: 'claude', text: 'Keep them for 180 days?', opening: true },
  { id: 'y-1', at: AT, author: 'you', text: 'Yes.' },
  { id: 'm-2', at: AT, author: 'claude', text: 'Kept for 180 days.', resolved: true },
];

/** A Questions thread's detail, resolved unless overridden, its item imported at v1. */
function detail(o: { status?: ThreadDetail['thread']['status']; removedIn?: number; messages?: Message[] } = {}): ThreadDetail {
  const status = o.status ?? 'resolved';
  return {
    thread: { id: 't-questions-log', itemId: 'questions-log', status, display: status, messages: o.messages ?? ANSWERED },
    item: {
      id: 'questions-log',
      key: 'log',
      type: 'questions',
      title: 'How long to keep reminder rows?',
      summary: 'Retention for the reminder log.',
      threadId: 't-questions-log',
      createdBy: 'import',
      ...(o.removedIn ? { removedIn: o.removedIn } : {}),
    },
    type: { id: 'questions', title: 'Questions', screen: 'list', timeline: false, fields: [], answerPresets: [] },
    open: null,
    previews: {},
    linked: [],
    refs: {},
    edits: {},
    decisions: [],
    listening: null,
    checks: null,
    anchorParent: null,
    versionChange: null,
  };
}

function show(d: ThreadDetail) {
  vi.spyOn(api, 'thread').mockResolvedValue(d);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThreadView />
    </QueryClientProvider>,
  );
}

describe('a resolved thread', () => {
  it('can be parked when its item was removed from the plan, to keep it out of the final', async () => {
    const park = vi.spyOn(api, 'park').mockResolvedValue({ ok: true });
    vi.spyOn(api, 'saveDraft').mockResolvedValue({ ok: true });
    show(detail({ removedIn: 2 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Park' }));
    await waitFor(() => expect(park).toHaveBeenCalledWith('acme-app', 'restock', 't-questions-log', true));
  });

  it('has no Park while its item is still in the plan', async () => {
    show(detail());
    expect(await screen.findByTestId('thread-status')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Send/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Park' })).toBeNull();
  });
});

describe("Claude's opening question", () => {
  it('says when the plan was imported, or which version a re-import raised it in', async () => {
    show(
      detail({
        status: 'your_turn',
        messages: [
          { id: 'm-1', at: AT, author: 'claude', text: 'Keep them for 180 days?', opening: true },
          { id: 's-1', at: AT, author: 'system', text: "Updated from the plan's v2." },
          { id: 'm-2', at: AT, author: 'claude', text: 'Keep them for 90 days now?', opening: true, raisedIn: 2 },
        ],
      }),
    );
    // Each sits after "Claude ·" in its message's header line.
    expect((await screen.findByText(/· raised when the plan was imported$/)).textContent).toBe('Claude · raised when the plan was imported');
    expect(screen.getByText(/· raised in the plan's v2$/).textContent).toBe("Claude · raised in the plan's v2");
  });
});
```

In `packages/web/src/pages/ProjectHeader.test.tsx`, replace:
```ts
function home(o: { finalized?: boolean; canStart?: boolean } = {}): ProjectHome {
```
with:
```ts
function home(o: { finalized?: boolean; canStart?: boolean; importIncomplete?: ProjectHome['importIncomplete'] } = {}): ProjectHome {
```
replace:
```ts
    finalize: { canStart: o.canStart ?? false, blockingCount: 2, state: null, changesSinceFinal: 0 },
  } as unknown as ProjectHome;
```
with:
```ts
    finalize: { canStart: o.canStart ?? false, blockingCount: 2, state: null, changesSinceFinal: 0 },
    importIncomplete: o.importIncomplete ?? null,
  } as unknown as ProjectHome;
```
and add at the end of the file:
```ts

describe('a re-import that was ended early, in the project header', () => {
  it('names the version and the types that never came back, and says how to finish it', () => {
    show(home({ importIncomplete: { version: 2, titles: ['Architecture', 'Flows', 'Testing & rollout'], again: false } }));
    expect(screen.getByTestId('import-incomplete').textContent).toBe(
      "The v2 re-import didn't finish for Architecture, Flows and Testing & rollout. Run /dev-plumbing to try again.",
    );
    cleanup();
    show(home({ importIncomplete: { version: 3, titles: ['Architecture'], again: false } }));
    expect(screen.getByTestId('import-incomplete').textContent).toBe("The v3 re-import didn't finish for Architecture. Run /dev-plumbing to try again.");
    // Ended early again after /dev-plumbing tried once more.
    cleanup();
    show(home({ importIncomplete: { version: 3, titles: ['Architecture'], again: true } }));
    expect(screen.getByTestId('import-incomplete').textContent).toBe("The v3 re-import didn't finish again for Architecture. Run /dev-plumbing to try again.");
  });

  it('says nothing otherwise', () => {
    show(home());
    expect(screen.queryByTestId('import-incomplete')).toBeNull();
  });
});
```

- [ ] **Step 9: Run them to see them fail**

Run: `pnpm vitest run packages/service/test/update.test.ts packages/web/src/pages/ThreadView.test.tsx packages/web/src/pages/ProjectHeader.test.tsx`
Expected: FAIL, 6 tests.
- `update.test.ts`, 3: the second `/open` doesn't resume: it answers `reopened` with no importer types and `WAIT_NEXT`, and the waiting test's `/open` says nothing. In the catch-up's describe, the new test's `/open` starts the catch-up instead, so its `next` is `CATCH_UP`.
- `ThreadView.test.tsx`, 2: a removed item's resolved thread has no Park, and the re-import's opening says "raised when the plan was imported". The test of an ordinary resolved thread passes already.
- `ProjectHeader.test.tsx`, 1: there's no `import-incomplete` line. "says nothing otherwise" passes already.

- [ ] **Step 10: `/open` finishes it**

In `packages/service/src/routes/claude.ts`, add to the `@dev-plumbing/core` import. Replace (as Task 7 left it):
```ts
import {
  catchUpDue,
  catchUpWaiting,
```
with:
```ts
import {
  andList,
  catchUpDue,
  catchUpWaiting,
```
replace:
```ts
  resolvePlan,
  saveDefense,
```
with:
```ts
  resolvePlan,
  resumeIncompleteImport,
  saveDefense,
```
and replace:
```ts
  type PlumbingType,
```
with:
```ts
  type IncompleteImport,
  type PlumbingType,
```

After `updatedLine`, replace:
```ts
  return u.conflicts ? `v${u.version}: ${merged}, ${u.conflicts} to settle in Plan changes.` : `v${u.version}: ${merged}, nothing to settle.`;
}
```
with:
```ts
  return u.conflicts ? `v${u.version}: ${merged}, ${u.conflicts} to settle in Plan changes.` : `v${u.version}: ${merged}, nothing to settle.`;
}

/**
 * What the skill tells the user about a re-import that was ended early: /open is finishing it, it waits for what Claude
 * has under way, or it was ended early again and the user runs /dev-plumbing to try once more.
 */
function incompleteLine(r: IncompleteImport, types: PlumbingType[]): string {
  const titles = andList(r.importTypes.map((id) => types.find((t) => t.id === id)?.title ?? id));
  if (r.kind === 'resumed') return `The v${r.version} re-import didn't finish for ${titles}. Finishing it now.`;
  if (r.kind === 'waits') return `The v${r.version} re-import still needs to finish for ${titles}. It waits until Claude has answered: run /dev-plumbing again then.`;
  return `The v${r.version} re-import didn't finish again for ${titles}. Run /dev-plumbing to try again.`;
}
```

In `/open`, the resume goes right after the update check, before Task 7's catch-up. Replace (as Tasks 7 and 9 left it):
```ts
        if (outcome?.kind === 'tell') tell = outcome.line;
        if (outcome?.kind === 'updated') update = outcome.result;
      }
      // Once every Plan changes thread of the current version is settled, and settling them changed the draft, the
```
with:
```ts
        if (outcome?.kind === 'tell') tell = outcome.line;
        if (outcome?.kind === 'updated') update = outcome.result;
      }
      // A re-import that was ended early is finished first, for just the types whose batch never came. A catch-up that's
      // due too then waits (the project is importing) for a later /dev-plumbing. This runs after Not now as well: Not now
      // answers the new version's question, not this version's unfinished re-import. When it waits, or was ended early
      // again, the user is told.
      let incomplete: IncompleteImport | null = null;
      if (!created && !update) {
        incomplete = await rt.withLock(key, async () => {
          await putBackFirst();
          const r = await resumeIncompleteImport(ref.dir, { types: cfg.types, now: new Date(rt.now()) });
          // Claimed under the same lock, as an update's re-import is, so another window's dp_wait can't end it first.
          if (r?.kind === 'resumed' && body.windowId) {
            rt.listeners.seen(body.windowId, key);
            await claimImport(ref.dir, body.windowId);
          }
          return r;
        });
        if (incomplete?.kind === 'resumed') changed(ref);
      }
      // Once every Plan changes thread of the current version is settled, and settling them changed the draft, the
```
and in the `created`/`reopened` answer, replace (as Task 9 left it):
```ts
        next: telling([...recovery, ...(tell ? [tell] : []), ...(caughtUp ? [CATCH_UP] : []), ...waits], next),
```
with:
```ts
        next: telling([...recovery, ...(tell ? [tell] : []), ...(caughtUp ? [CATCH_UP] : []), ...(incomplete ? [incompleteLine(incomplete, cfg.types)] : []), ...waits], next),
```
The resumed re-import and the catch-up never both start in one `/open`: once the resume starts, the project is importing, so `catchUpDue` (through `updateRefusal`) gives null, the catch-up waits, and Task 7's line says so; it runs on the next `/dev-plumbing`. The bookkeeping lock's `claimImport` then finds the import already this window's.

- [ ] **Step 11: The web**

In `packages/web/src/pages/MessageList.tsx`, replace:
```tsx
const seconds = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
```
with:
```tsx
/** When an importer raised this question: at import, or with a later version of the plan (a re-import). */
const openingLabel = (m: ClaudeMessage) => (m.raisedIn ? `raised in the plan's v${m.raisedIn}` : 'raised when the plan was imported');
const seconds = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
```
and replace:
```tsx
          <span className="font-semibold text-ink-2">Claude</span> · {m.opening ? 'raised when the plan was imported' : formatUpdated(m.at)}
```
with:
```tsx
          <span className="font-semibold text-ink-2">Claude</span> · {m.opening ? openingLabel(m) : formatUpdated(m.at)}
```

In `packages/web/src/pages/ProjectHeader.tsx`, replace:
```tsx
import type { ProjectHome } from '@dev-plumbing/core/schemas';
```
with:
```tsx
import { andList, type ProjectHome } from '@dev-plumbing/core/schemas';
```
and replace:
```tsx
      {/* Phones hide the buttons above, so Finalize gets its own row, with the reason it's off spelled out. */}
```
with:
```tsx
      {home.importIncomplete && (
        <p className="mt-2 text-[12.5px] text-ink-2" data-testid="import-incomplete">
          {`The v${home.importIncomplete.version} re-import didn't finish${home.importIncomplete.again ? ' again' : ''} for ${andList(home.importIncomplete.titles)}. Run /dev-plumbing to try again.`}
        </p>
      )}
      {/* Phones hide the buttons above, so Finalize gets its own row, with the reason it's off spelled out. */}
```

In `packages/web/src/pages/ThreadView.tsx`, replace:
```tsx
            canPark={status !== 'resolved'}
```
with:
```tsx
            // A resolved thread can be parked only when its item was removed from the plan, to keep it out of the final.
            canPark={status !== 'resolved' || d.item.removedIn !== undefined}
```

In `packages/web/src/components/AnswerForm.tsx`, replace:
```tsx
  /** Resolved threads can't be parked, so the thread view hides Park for them. */
```
with:
```tsx
  /** Resolved threads can't be parked, except one whose item was removed from the plan, so the thread view hides Park for the rest. */
```

- [ ] **Step 12: Run the tests**

Run:
```bash
pnpm vitest run packages/service/test/update.test.ts packages/web/src/pages/ThreadView.test.tsx packages/web/src/pages/ProjectHeader.test.tsx packages/core/test/importItems.test.ts packages/core/test/update.test.ts packages/core/test/projects.test.ts
pnpm typecheck
pnpm test
pnpm test:e2e plan-update.spec.ts project-home.spec.ts loop.spec.ts
pnpm test:e2e
```
Expected: PASS. `pnpm test` runs 1,043 tests in 110 files, 18 more than Task 9 left: `importItems.test.ts` 2 more, core `update.test.ts` 6, `projects.test.ts` 1, `catchUp.test.ts` 1, the service `update.test.ts` 3, `ThreadView.test.tsx` 3 (new) and `ProjectHeader.test.tsx` 2. The e2e runs check the thread view, the project header and `/open` from the app's side.

- [ ] **Step 13: Commit**

```bash
git add packages/core/src/schemas/loop.ts packages/core/src/schemas/project.ts packages/core/src/schemas/views.ts packages/core/src/store/importItems.ts packages/core/src/store/update.ts packages/core/src/store/projects.ts packages/core/test/importItems.test.ts packages/core/test/update.test.ts packages/core/test/projects.test.ts packages/core/test/catchUp.test.ts packages/service/src/routes/claude.ts packages/service/test/update.test.ts packages/web/src/pages/MessageList.tsx packages/web/src/pages/ProjectHeader.tsx packages/web/src/pages/ProjectHeader.test.tsx packages/web/src/pages/ThreadView.tsx packages/web/src/pages/ThreadView.test.tsx packages/web/src/components/AnswerForm.tsx
git commit -m "feat: a re-import names its version, a cut-short re-import is finished next time, and a removed item's resolved thread can be parked" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The smoke test presents; docs; the full check

Everything so far is tested without Claude. This task runs the real thing once more. The whiteboard subagent now writes a presenter too, so the run checks it against the project's drawings and then draws it in a real browser, and it checks the finalizer's smaller pack. The README, `docs/how-it-works.md` and SPEC learn about Present and the follow-ups, and the full check runs.
- **The run:** Plan 6's run, unchanged in what it does. It checks more along the way:
  1. **Round 1:** the runner reports the finalizer's pack size and how many of its clipped items' files the finalizer read, and fails the run when the finalizer didn't read the rules file or the draft the pack names (or the last final, when the pack names one).
  2. **After the update to v2:**
     - each item flagged as changed in v2 shows what v2 changed;
     - the re-import isn't reported as cut short;
     - once the Plan changes threads are settled, the project home offers the catch-up exactly when settling one changed the draft.
  3. **The Whiteboard Defense:** its presenter has the seven chapters in order, each with one to eight steps, and at least one draws something. Every part it names is a part of its chapter's drawing, as the whiteboard pack lists them, and every drawing is an item the project has. The runner reports the presenter's size, and any refusal that names it.
  4. **Present, drawn:** after the run, `scripts/smoke-present.mjs` opens Present on the run's project in Playwright's Chromium, on the run's own service (port 45461, its temporary home), and steps through every step of the presenter Claude wrote. Every revealed part the pack lists has to be drawn, no note with a part may land in the list at the board's foot, the page may log no errors, and full screen has to fit a phone held sideways. It saves screenshots next to the run's logs, and a failure fails the run.
- **The catch-up re-import itself isn't run,** and the run says why (Step 1). In the usual run there's nothing to catch up. Making one would take a third window and a Plan changes answer that goes against Claude's recommendation. Task 7's core and service tests cover the catch-up.
- **The rest:**
  - the README's status line says v1 is complete, and its update note says to restart open Claude Code sessions;
  - `docs/how-it-works.md` and SPEC (§7's tree, §12's Present and §13.1's `presenter`) describe Present and the follow-ups;
  - the full check runs, with a look at the built chunks.

The split is Plans 4 to 6's:
- **You** write the scripts and the docs, and run the full check. You don't run `pnpm smoke`. You do check `smoke-present.mjs` against the e2e's service (Step 3).
- **The controller** runs it.
- **You** then record what it printed in `smoke/RESULTS.md`, and commit.

**Files:**
- Create:
  - `scripts/smoke-present.mjs` (the scripted look at Present)
- Modify:
  - `scripts/smoke-user.mjs`
  - `scripts/smoke-claude.sh`
  - `smoke/RESULTS.md` (a "Plan 7: Present, and the follow-ups" section, after the controller's run)
  - `README.md`
  - `docs/how-it-works.md`
  - `SPEC.md` (§7's file tree, §12's Present, §13.1's `presenter`)
- Test: `node --check` and `bash -n` on the scripts, `smoke-present.mjs` against the e2e's service, `pnpm check`, and the controller's smoke run.

**Interfaces:**
- Consumes everything above. In particular:
  - **Task 1:**
    - the saved defense's `presenter?: Presenter`: `chapters` of `{ id, title, drawing, steps }`, in `PRESENT_CHAPTERS` order, with the titles "Purpose", "System flow", "Data and source of truth", "States", "Security", "Failure and retries" and "Rollback and blast radius";
    - each step `{ caption, reveal: string[], notes: { near, text, ink }[] }`;
    - `drawing` is `{ kind: 'diagram', itemId } | { kind: 'tables' } | { kind: 'flow', itemId } | null`;
    - `drawingKey(d)` is `diagram:<itemId>`, `tables` or `flow:<itemId>`. The script keeps its own copy, as it can't import core.
  - **Task 2:** `POST /api/claude/context` with `{ repo, project, whiteboard: true }` gives the `WhiteboardPack`. It only reads. Its `drawings` are `{ drawing, title, parts: { ref, label }[] }[]` (= `drawingOptions`), and its `chapters` are `PRESENT_CHAPTERS`. `dp_whiteboard`'s `defense` carries `presenter`, and a refusal of it names `presenter` (`presenter: …` or `presenter.chapters: …`).
  - **Task 6:** the finalizer's `dp_context { finalize: true }` result has `rulesFile`, `draftFile` and `previousFinalFile` (absolute paths, the last null with no earlier final), and each item's `file`, with a body over 800 characters cut short and ending `… (clipped: Read file for the rest)`. `finalizer.md` Reads the three files, and the `file` of every clipped item.
  - **Task 7:** `ProjectHome.catchUpDue: boolean`. It's true exactly when the next `/dev-plumbing` would start a catch-up: the current version's update had conflicts, every Plan changes item of that version is resolved or parked, settling at least one of them applied a change with markdown edits (Keep my draft has none), and `caughtUp` is below that version.
  - **Task 8:** `ThreadDetail.versionChange: ItemVersionChange | null`, with `version`, `since` and `summary`, `body`, `fields` and `drawing` (each `DiffSegment[] | null`).
  - **Task 10:** `ProjectHome.importIncomplete: { version: number; titles: string[]; again: boolean } | null`.
  - **Task 4,** for the scripted look: `?mode=present` on `/p/:repo/:project/defense`, and the test ids `present-step`, `present-fullscreen`, `present-overlay`, `present-caption`, `present-next`, `board`, `board-shape` (`data-ref`) and `board-note` (`data-near`, an `li` in the list at the board's foot).
  - **Tasks 5 and 9,** for the docs only:
    - the reserved-id problem: ``plumbing/${file}: The id "${id}" is kept for dev-plumbing's built-in ${title} type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file.``, **+ Plumbing type**'s refusal of either id, and the same words when you save such a file;
    - the recovery lines;
    - "Left over from updates that didn't finish", each "v<n>'s plan and draft from before the update".
  - **Plans 1–6:**
    - the routes the script already calls;
    - `GET …/types/:id`'s `TypeItemRow`s (`status`, `removedIn`, `data`);
    - the Plan changes threads' options, whose `change.md` says whether accepting one changes the draft.

  The smoke needs the `claude` CLI on PATH and logged in, as Plans 2–6's did.
- Produces:
  - the user script's checks of the presenter and of what the update left, the runner's report of the finalizer's pack and the presenter, and `smoke-present.mjs`'s look at Present;
  - `smoke/RESULTS.md`'s Plan 7 section, with yes or no for each check and the evidence.

- [ ] **Step 1: The "user" checks the presenter and what the update left**

In `scripts/smoke-user.mjs`, replace the end of the comment at the top:
```js
// Claude's merged version on each. Last, it generates the Whiteboard Defense, checks it against the rules file, asks
// Claude about its Security model and sends one of its unknowns to Questions. Exits non-zero if anything doesn't happen
// in time, if a route answers with an error, if a visual type has items without drawings, or if the final, the update
// or the Whiteboard Defense didn't land.
```
with:
```js
// Claude's merged version on each, and checks what the update left: what v2 changed on each changed item, a re-import
// that finished, and whether a catch-up re-import is due. Last, it generates the Whiteboard Defense, checks it against
// the rules file and its presenter against the project's drawings, asks Claude about its Security model and sends one
// of its unknowns to Questions. Exits non-zero if anything doesn't happen in time, if a route answers with an error, if
// a visual type has items without drawings, or if the final, the update, what the update left or the Whiteboard
// Defense didn't land.
```

A problem with what the update left shouldn't stop the run before the Whiteboard Defense, the longest and most model-dependent part. So these problems go in their own list, `followUps`, which fails the run at the end, with the defense's `flaws`. Replace:
```js
const wrong = [];
const v2Home = (await call(P)).body;
```
with:
```js
const wrong = [];
// What the update leaves behind (what v2 changed on an item, a re-import that didn't finish, the catch-up) is checked as
// it comes up, but failed only at the end, so the Whiteboard Defense still runs.
const followUps = [];
const v2Home = (await call(P)).body;
```

A re-import that finished leaves no "didn't finish" line on the project home (Task 10). Replace the status line:
```js
log(`  Status: ${project.status}, import pending: ${project.importPending.join(', ') || 'none'}`);
```
with:
```js
log(`  Status: ${project.status}, import pending: ${project.importPending.join(', ') || 'none'}, re-import unfinished for: ${v2Home.importIncomplete?.titles.join(', ') || 'none'}`);
```

and replace:
```js
if (project.importPending.length) wrong.push(`Still waiting for importers: ${project.importPending.join(', ')}.`);
```
with:
```js
if (project.importPending.length) wrong.push(`Still waiting for importers: ${project.importPending.join(', ')}.`);
// Every importer's batch came, so the project home has no "didn't finish" line.
if (v2Home.importIncomplete) followUps.push(`The project home says the v${v2Home.importIncomplete.version} re-import didn't finish for ${v2Home.importIncomplete.titles.join(', ')}.`);
```

Each item the re-import flagged as changed in v2 has a v1 copy in `docs/versions/v1/items/`, so its thread shows what v2 changed (Task 8). Replace:
```js
let changedCount = 0;
for (const r of kept.filter((x) => v2ById.get(x.id).flagged)) {
  const d = (await call(`${P}/threads/${r.threadId}`)).body;
  if (d.item.flags?.some((f) => f.reason === "Changed in the plan's v2.")) changedCount++;
}
log(`Re-import: ${imported.length} imported items before. ${kept.length} kept their ids (${changedCount} flagged as changed in v2), ${newItems.length} new, ${removedItems.length} removed from the plan, ${lost.length} gone.`);
```
with:
```js
let changedCount = 0;
// An item flagged as changed in v2 shows "What v2 changed" in its thread: the parts that differ from its copy in
// docs/versions/v1/items/ (summary, details, fields, drawing), or "Nothing else changed." when only the flag was set.
const CHANGE_PARTS = [['summary', 'summary'], ['body', 'details'], ['fields', 'fields'], ['drawing', 'drawing']];
const whatChanged = [];
for (const r of kept.filter((x) => v2ById.get(x.id).flagged)) {
  const d = (await call(`${P}/threads/${r.threadId}`)).body;
  if (!d.item.flags?.some((f) => f.reason === "Changed in the plan's v2.")) continue;
  changedCount++;
  const vc = d.versionChange ?? null;
  const parts = vc ? CHANGE_PARTS.filter(([k]) => vc[k] !== null).map(([, label]) => label) : [];
  whatChanged.push(`"${r.title}": ${!vc ? 'nothing shown' : parts.length ? parts.join(', ') : 'nothing else changed'}`);
  if (vc?.version !== 2) followUps.push(`"${r.title}" is flagged as changed in v2, but its thread ${vc ? `shows what v${vc.version} changed` : "doesn't show what v2 changed"}.`);
}
log(`Re-import: ${imported.length} imported items before. ${kept.length} kept their ids (${changedCount} flagged as changed in v2), ${newItems.length} new, ${removedItems.length} removed from the plan, ${lost.length} gone.`);
if (whatChanged.length) log(`  What v2 changed: ${whatChanged.join('; ')}`);
```

After the Plan changes threads are accepted, check the catch-up. It's due only when an accepted option changed the draft, so the loop records which did. Replace:
```js
const conflicts = rowsV2.filter((r) => r.type === 'plan-changes');
```
with:
```js
const conflicts = rowsV2.filter((r) => r.type === 'plan-changes');
// The Plan changes threads whose accepted option changed the draft. Only these call for a catch-up (Task 7).
const editedBySettling = [];
```
and replace the end of the Plan changes loop and the update's throw:
```js
  if (!accepted2.ok || accepted2.body.resolved !== 1) wrong.push(`Claude's merged version on "${r.title}" wasn't applied.`);
}

if (wrong.length) throw new Error(`The update didn't land:\n- ${wrong.join('\n- ')}`);
```
with:
```js
  if (!accepted2.ok || accepted2.body.resolved !== 1) wrong.push(`Claude's merged version on "${r.title}" wasn't applied.`);
  else if (pick.change.md?.length) editedBySettling.push(r.title);
}

// The catch-up. Once every Plan changes thread of v2 is settled, the next /dev-plumbing re-imports once more, so the
// items catch up with what was settled, but only when settling one changed the draft: an accepted option with edits.
// Keep my draft, which Claude recommended in the earlier runs, changes nothing, and answers to other items don't
// count. This run doesn't start a third window, so it checks that the project home offers the catch-up exactly then.
const settledHome = must(P, await call(P));
const unsettled = (await itemRows()).filter((r) => r.type === 'plan-changes' && r.status !== 'resolved' && r.status !== 'parked');
/** Why no catch-up is due, or null when one is. */
const noCatchUp = !v2?.merge?.conflicts
  ? 'v2 had nothing to settle'
  : unsettled.length
    ? `${unsettled.length} Plan changes threads aren't settled`
    : !editedBySettling.length
      ? "every option accepted on them kept the draft as it was, so there's nothing to catch up"
      : null;
log(`Catch-up: ${noCatchUp ?? `every Plan changes thread is settled, and settling changed the draft (${editedBySettling.map((t) => `"${t}"`).join(', ')})`}; the project home says one is ${settledHome.catchUpDue ? 'due' : 'not due'}`);
if (typeof settledHome.catchUpDue !== 'boolean') followUps.push(`The project home's catchUpDue is ${JSON.stringify(settledHome.catchUpDue)}, not true or false.`);
else if (settledHome.catchUpDue && noCatchUp !== null) followUps.push(`The project home offers a catch-up, but ${noCatchUp}.`);
else if (!settledHome.catchUpDue && noCatchUp === null) followUps.push("The project home doesn't offer a catch-up, though every Plan changes thread of v2 is settled and settling changed the draft.");

if (wrong.length) throw new Error(`The update didn't land:\n- ${wrong.join('\n- ')}`);
```

The Whiteboard Defense can take longer now: each of up to three resends carries a defense of about 40,000 characters with its presenter, on opus. Replace the wait's end:
```js
  return v.request?.state === 'failed' || (v.defense && v.defense.id !== firstView.defense?.id) ? v : null;
}, 15);
```
with:
```js
  return v.request?.state === 'failed' || (v.defense && v.defense.id !== firstView.defense?.id) ? v : null;
  // Up to three resends of a defense with its presenter, on opus.
}, 25);
```

Then the presenter, right after the defense's own checks. Replace:
```js
if (defenseView.stale) flaws.push(`The defense was out of date as soon as it was saved: ${defenseView.stale}`);
```
with:
```js
if (defenseView.stale) flaws.push(`The defense was out of date as soon as it was saved: ${defenseView.stale}`);

// The presenter, which Present draws: the seven chapters in order, each with one to eight steps, and at least one that
// draws something. A chapter draws one of the project's drawings, or none, and every part its steps reveal, and every
// part a note is near, is one of that drawing's parts. The service checked all this before it saved the defense. Here
// it's checked against the drawings of the whiteboard pack, which dp_context's route gives without writing anything:
// the defense isn't out of date, so they're the drawings the subagent had. Each drawing also has to be an item the
// project has now, on the right screen and not parked, as the browser's routes list them.
const PRESENT_CHAPTERS = [
  ['purpose', 'Purpose'],
  ['flow', 'System flow'],
  ['data', 'Data and source of truth'],
  ['states', 'States'],
  ['security', 'Security'],
  ['failure', 'Failure and retries'],
  ['rollback', 'Rollback and blast radius'],
];
const NOTE_INKS = ['ink', 'slate', 'seal', 'moss'];
/** A drawing as the pack keys it: diagram:<item id>, tables or flow:<item id>. */
const drawingKey = (d) => (d.kind === 'tables' ? 'tables' : `${d.kind}:${d.itemId}`);
const presenter = defense.presenter ?? null;
const presenterSteps = presenter ? presenter.chapters.reduce((n, c) => n + c.steps.length, 0) : 0;
if (!presenter) flaws.push("The defense has no presenter, so Present can't show it.");
else {
  const chapters = presenter.chapters;
  const pack = must('/api/claude/context', await call('/api/claude/context', 'POST', { repo: 'acme-app', project: project.id, whiteboard: true }));
  const options = new Map((pack.drawings ?? []).map((o) => [drawingKey(o.drawing), o]));
  const screens = new Map(must(P, await call(P)).types.map((t) => [t.id, t.screen]));
  const rows = await itemRows();
  const live = (r) => r.status !== 'parked' && r.removedIn === null && r.data !== null;
  /** Why a chapter's drawing isn't one the project has now, or null when it is. */
  const gone = (d) => {
    if (d.kind === 'tables') return rows.some((r) => screens.get(r.type) === 'database' && live(r)) ? null : 'the project has no tables to draw';
    const row = rows.find((r) => r.id === d.itemId);
    if (!row) return `there's no item ${d.itemId}`;
    if (!live(row)) return `${d.itemId} is parked, removed from the plan or has no drawing`;
    if (d.kind === 'diagram' && screens.get(row.type) !== 'diagram') return `${d.itemId} isn't a diagram`;
    if (d.kind === 'flow' && (screens.get(row.type) !== 'flows' || !['system', 'both'].includes(row.data.kind))) return `${d.itemId} isn't a system flow`;
    return null;
  };
  const drawn = chapters.filter((c) => c.drawing);
  const notes = chapters.flatMap((c) => c.steps.flatMap((s) => s.notes));
  log(`  Drawings in the pack: ${[...options.values()].map((o) => `${drawingKey(o.drawing)} (${o.parts.length} parts)`).join(', ') || 'none'}`);
  log(`  Presenter: ${chapters.length} chapters, ${presenterSteps} steps, ${drawn.length} drawing something (${['diagram', 'tables', 'flow'].map((k) => `${k} ${drawn.filter((c) => c.drawing.kind === k).length}`).join(', ')}), ${notes.length} notes (${NOTE_INKS.map((k) => `${k} ${notes.filter((x) => x.ink === k).length}`).join(', ')})`);
  if (chapters.map((c) => c.id).join() !== PRESENT_CHAPTERS.map(([id]) => id).join()) flaws.push(`The presenter's chapters are ${chapters.map((c) => c.id).join(', ')}, not the seven in order.`);
  else if (chapters.some((c, i) => c.title !== PRESENT_CHAPTERS[i][1])) flaws.push(`The presenter's chapter titles are ${chapters.map((c) => `"${c.title}"`).join(', ')}, not Present's.`);
  if (!drawn.length) flaws.push('No chapter of the presenter draws anything.');
  /** Parts a step names that aren't in its chapter's drawing. */
  const strays = [];
  for (const [i, c] of chapters.entries()) {
    const option = c.drawing ? options.get(drawingKey(c.drawing)) : undefined;
    const parts = new Set((option?.parts ?? []).map((p) => p.ref));
    const revealed = c.steps.reduce((n, s) => n + s.reveal.length, 0);
    log(`  ${i + 1}. ${c.title}: ${c.steps.length} steps, ${c.drawing ? `draws ${option ? `"${option.title}"` : 'something not in the pack'} (${drawingKey(c.drawing)}), revealing ${revealed} of its ${parts.size} parts` : 'draws nothing'}, ${c.steps.reduce((n, s) => n + s.notes.length, 0)} notes`);
    if (c.steps.length < 1 || c.steps.length > 8) flaws.push(`${c.title} has ${c.steps.length} steps; a chapter has one to eight.`);
    if (c.drawing && !option) flaws.push(`${c.title} draws ${drawingKey(c.drawing)}, which isn't one of the pack's drawings.`);
    const why = c.drawing ? gone(c.drawing) : null;
    if (why) flaws.push(`${c.title} draws ${drawingKey(c.drawing)}, but ${why}.`);
    for (const [s, step] of c.steps.entries()) {
      for (const ref of step.reveal) if (!parts.has(ref)) strays.push(`${c.id} step ${s + 1} reveals "${ref}"`);
      for (const note of step.notes) if (note.near !== '' && !parts.has(note.near)) strays.push(`${c.id} step ${s + 1} has a note near "${note.near}"`);
    }
  }
  if (strays.length) flaws.push(`The presenter names parts that aren't in its chapter's drawing: ${strays.join('; ')}.`);
}
```

Last, the summary line counts the presenter's steps, and both lists fail the run. Replace the last three lines:
```js
log(`Whiteboard Defense: written in ${generatedIn} s, level ${defense.level}, ${defense.questions.length} questions, ${defense.concerns.length} concerns, ${claims.length} claims; asked ${endView.asked.length}, sent ${endView.sent.length}; out of date: ${endView.stale ?? 'no'}`);
if (flaws.length) throw new Error(`The Whiteboard Defense isn't right:\n- ${flaws.join('\n- ')}`);
log('Smoke test passed.');
```
with:
```js
log(`Whiteboard Defense: written in ${generatedIn} s, level ${defense.level}, ${defense.questions.length} questions, ${defense.concerns.length} concerns, ${claims.length} claims, ${presenterSteps} presenter steps; asked ${endView.asked.length}, sent ${endView.sent.length}; out of date: ${endView.stale ?? 'no'}`);
const failures = [];
if (followUps.length) failures.push(`What the update left isn't right:\n- ${followUps.join('\n- ')}`);
if (flaws.length) failures.push(`The Whiteboard Defense isn't right:\n- ${flaws.join('\n- ')}`);
if (failures.length) throw new Error(failures.join('\n'));
log('Smoke test passed.');
```

How these checks fit the run:
- **Why the catch-up isn't run.**
  - **It usually has nothing to do.** Claude recommended "Keep my draft" on the one Plan changes thread in Plans 5 and 6's recorded runs. That option has no edits, so settling changed nothing, and Decision 13 runs nothing.
  - **Forcing one is costly.** It would mean taking the repo's version against Claude's recommendation, and stopping round 2's window for a third `claude -p`, with seven more importers. The Whiteboard Defense would then move to that third window.
  - **A `/open` from the user script doesn't help.** It would start a catch-up that no importer finishes. That leaves the project importing, which refuses Generate, and it tests only what Task 7's service test already does.

  So the run checks the one thing a real run can: that the project home offers the catch-up (`catchUpDue`) exactly when settling a Plan changes thread changed the draft, which the script knows from the options it accepted. Otherwise the Plan changes list would show "Your Plan changes are settled. Run /dev-plumbing to catch the items up." when `/dev-plumbing` would do nothing, and it would never go away, since `caughtUp` is set only when a catch-up starts.
- **Which drawings the presenter is checked against.**
  - **The pack's drawings,** from `POST /api/claude/context` with `whiteboard: true`, which only reads. The check runs after "Out of date when saved: no", so they're the drawings the subagent had.
  - **Why not rebuild them here.** That would mean copying `tablesDrawing`'s relation rule, enums and foreign keys included, into the script.
  - **The items, as a second check.** Each drawing is also checked against the browser's item rows: a diagram item on a `diagram` screen, a system or both flow on `flows`, and tables from a `database` item. Each must be on the plan and not parked. So a `drawingOptions` that offered a parked item is caught too.
- **What isn't checked here.** `saveDefense` has already checked these, with Task 1's tests:
  - that a note's `near` is already on the board at its step (only that it's a part of the drawing);
  - the caption and note lengths;
  - the 20,000-character cap.

  The runner reports the presenter's size against the cap (Step 2).
- **What v2 changed.** "nothing else changed" (all four parts null) is a pass: the importer may have changed only what the flag says. A flagged item whose thread shows nothing, or another version, is a problem.
- **The names** don't clash with the script's earlier constants: `node --check` refuses a second `const` of the same name at the top level. The checks use these from earlier in the script: `project`, `v2`, `itemRows`, `must`, `defense`, `defenseView`, `flaws`, and the Plan changes loop's `pick`.
- **The defense's wait** goes from 15 to 25 minutes: Plan 6's took 226 s, but each of up to three resends now carries the presenter too.

Checked against a fake service with the Contracts' routes and shapes, using item data from Plan 6's run. A good run passes, with "Keep my draft" (an option with no edits), and with an accepted option that changed the draft and a home that offers the catch-up. Each of these fails with its own lines, as it should:
- a presenter with a ref and a note's `near` outside their drawings, a chapter of nine steps and a user flow as a drawing;
- chapters out of order;
- a wrong title;
- no drawing at all;
- no presenter;
- a parked diagram;
- a flagged item without `versionChange`, and one with v3's;
- `importIncomplete` set;
- `catchUpDue` missing;
- a catch-up offered with nothing to catch up;
- a catch-up not offered when one is due.

- [ ] **Step 2: The runner checks the finalizer's pack and reports the presenter, and the run looks at Present**

In `scripts/smoke-claude.sh`, replace these lines of the comment at the top:
```bash
# Whiteboard Defense: the second window writes it with a whiteboard subagent, then answers a question about it and
# suggests answers for one of its unknowns, sent to Questions.
```
with:
```bash
# Whiteboard Defense: the second window writes it, with its presenter, in a whiteboard subagent, then answers a
# question about it and suggests answers for one of its unknowns, sent to Questions. The report also gives the size of
# the finalizer's pack and which of its files the finalizer read (it fails when that isn't the rules file and the
# draft), and the size of the presenter. Last, scripts/smoke-present.mjs draws the presenter in Present, in a browser.
```

In round 1's report, after the hand-written Mermaid count, replace:
````bash
echo "Mermaid the finalizer wrote by hand in its dp_finalize calls (should be 0):"
grep -h '"name":"mcp__plugin_dev-plumbing_dp__dp_finalize"' "$work/transcript.jsonl" | grep -c '```mermaid' || true
````
with:
````bash
echo "Mermaid the finalizer wrote by hand in its dp_finalize calls (should be 0):"
grep -h '"name":"mcp__plugin_dev-plumbing_dp__dp_finalize"' "$work/transcript.jsonl" | grep -c '```mermaid' || true
# The finalizer's pack names the rules, the draft and the last final as files to Read, so it stays small on a big plan.
# Read from the transcript's JSON, as the Whiteboard Defense's counts are below. A Read counts when the finalizer
# subagent made it (its parent is the Agent call that started it) on a path the pack gave. The run fails when the
# finalizer didn't read the rules file or the draft, or the last final when the pack names one: a final written without
# them follows no rules. The clipped items' files it read are reported.
if ! node -e '
  const fs = require("fs"), path = require("path");
  const DP = "mcp__plugin_dev-plumbing_dp__";
  const calls = new Map();
  const results = new Map();
  for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
    for (const b of blocks) {
      if (b.type === "tool_use") calls.set(b.id, { name: b.name, input: b.input ?? {}, parent: entry.parent_tool_use_id ?? null });
      if (b.type === "tool_result") {
        const text = typeof b.content === "string" ? b.content : (Array.isArray(b.content) ? b.content : []).map((c) => c.text ?? "").join("");
        results.set(b.tool_use_id, { text, error: b.is_error === true });
      }
    }
  }
  const all = [...calls].map(([id, c]) => ({ id, ...c, result: results.get(id) }));
  const packs = all.filter((c) => c.name === DP + "dp_context" && c.input.finalize === true);
  const text = packs.at(-1)?.result?.text ?? "";
  console.log("JSON characters in the finalize dp_context result: " + text.length);
  let pack = null;
  try { pack = JSON.parse(text); } catch {}
  const finalizers = new Set(all.filter((c) => c.name === "Agent" && c.input.subagent_type === "dev-plumbing:finalizer").map((c) => c.id));
  const real = (f) => { try { return fs.realpathSync(f); } catch { return path.resolve(f); } };
  const read = new Set(all.filter((c) => c.name === "Read" && finalizers.has(c.parent) && typeof c.input.file_path === "string").map((c) => real(c.input.file_path)));
  const said = (key) => (!pack ? "no pack" : pack[key] == null ? "none" : read.has(real(pack[key])) ? "yes" : "no");
  const files = { rulesFile: said("rulesFile"), draftFile: said("draftFile"), previousFinalFile: said("previousFinalFile") };
  console.log("Files from its pack the finalizer read: rulesFile " + files.rulesFile + ", draftFile " + files.draftFile + ", previousFinalFile " + files.previousFinalFile);
  // Items whose body was cut to 800 characters: the finalizer should Read the file of each before writing its part.
  const clipped = (pack?.items ?? []).filter((i) => typeof i.body === "string" && i.body.endsWith("… (clipped: Read file for the rest)"));
  console.log("Clipped items whose file the finalizer read: " + clipped.filter((i) => read.has(real(i.file))).length + " of " + clipped.length);
  if (["no", "no pack"].includes(files.rulesFile) || ["no", "no pack"].includes(files.draftFile) || files.previousFinalFile === "no") {
    console.log("The finalizer did not read every file its pack names (should be yes, or none for previousFinalFile).");
    process.exitCode = 1;
  }
' "$work/transcript.jsonl"; then status=1; fi
````

The run ends with Present, drawn from the presenter the run wrote. Replace the last line of the script:
```bash
exit "$status"
```
with:
```bash
# Present, drawn from the presenter Claude wrote, by Playwright on this run's own service (port 45461) and home. It
# starts the service if it isn't running and then stops it, and this script's cleanup stops it too. A failure fails
# the run. Nothing to look at when the user script failed.
echo "== Present, drawn from the run's presenter"
if [ "$status" -eq 0 ]; then
  node "$root/scripts/smoke-present.mjs" "$work" || status=1
else
  echo "Not looked at: the run already failed."
fi
exit "$status"
```

In the Whiteboard Defense's report, replace:
```bash
    console.log("JSON characters in the last dp_whiteboard defense: " + (saves.length ? JSON.stringify(saves.at(-1).input.defense ?? null).length : 0));
```
with:
```bash
    console.log("JSON characters in the last dp_whiteboard defense: " + (saves.length ? JSON.stringify(saves.at(-1).input.defense ?? null).length : 0));
    const presenter = saves.at(-1)?.input.defense?.presenter;
    console.log("JSON characters in the last dp_whiteboard presenter: " + (presenter === undefined ? 0 : JSON.stringify(presenter).length));
    console.log("dp_whiteboard refusals naming the presenter: " + refused.filter((c) => c.result.text.includes("presenter")).length);
```

Create `scripts/smoke-present.mjs`:
```js
// Present, drawn for real. After scripts/smoke-claude.sh's run, this opens the Whiteboard Defense's Present mode on the
// run's own project, in Playwright's Chromium, and steps through every step of the presenter Claude wrote. It uses the
// run's temporary dev-plumbing home and its service (port 45461), never 4545 or your real ~/.dev-plumbing: it starts
// that service when it isn't running, and then always stops it again.
// It checks, at every step:
// - every part the steps so far revealed is drawn (data-ref on a board-shape), of those the whiteboard pack lists for the
//   chapter's drawing, so a part the web lays out differently from core is caught;
// - no note with a part to sit by (`near` isn't "") is in the list at the board's foot, which means its part wasn't drawn;
// - the page logs no errors.
// It saves screenshots in <work>/present/: each chapter's last step at 1280 x 800, then full screen at 1280 x 800, full
// screen at 812 x 375 (a phone held sideways) and the page in dark mode (the run's theme setting is put back after). It
// exits non-zero when any check fails.
//   DEV_PLUMBING_HOME=<work>/.dev-plumbing node scripts/smoke-present.mjs <work> [project]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [work, project = 'restock-reminders'] = process.argv.slice(2);
const dir = process.env.DEV_PLUMBING_HOME;
if (!work || !dir || !path.resolve(dir).startsWith(path.resolve(work))) throw new Error("Run this from scripts/smoke-claude.sh, with the run's DEV_PLUMBING_HOME inside its folder.");
const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
if (settings.port === 4545) throw new Error("The run's home uses port 4545, the real service's. This look never does.");
const log = (msg) => console.log(`[present] ${msg}`);
const cli = (command) => execFileSync(process.execPath, [path.join(root, 'packages', 'cli', 'dist', 'index.js'), command], { env: process.env, encoding: 'utf8' }).trim();
// Playwright comes with the web package's dev dependencies, as the e2e tests use it.
const { chromium } = createRequire(path.join(root, 'packages', 'web', 'package.json'))('@playwright/test');

const P = `/api/projects/acme-app/${project}`;
const CHAPTER_COUNT = 7;
/** A drawing as the pack keys it: diagram:<item id>, tables or flow:<item id>. */
const drawingKey = (d) => (d.kind === 'tables' ? 'tables' : `${d.kind}:${d.itemId}`);

const out = path.join(work, 'present');
fs.mkdirSync(out, { recursive: true });
const started = !cli('status').startsWith('Running');
if (started) log(cli('start'));
const run = JSON.parse(fs.readFileSync(path.join(dir, 'run', 'service.json'), 'utf8'));
const base = `http://localhost:${run.port}`;
async function call(route, method = 'GET', body) {
  const res = await fetch(`http://127.0.0.1:${run.port}${route}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': run.token },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${route} answered ${res.status}: ${(await res.json().catch(() => null))?.error ?? 'no message'}`);
  return res.json();
}

const failures = [];
let browser = null;
let themeChanged = false;
try {
  const presenter = (await call(`${P}/whiteboard`)).defense?.presenter;
  if (!presenter?.chapters.length) throw new Error('The saved defense has no presenter to look at.');
  // The parts each chapter's drawing has, as the whiteboard subagent's pack lists them (the route only reads).
  const pack = await call('/api/claude/context', 'POST', { repo: 'acme-app', project, whiteboard: true });
  const partsOf = new Map((pack.drawings ?? []).map((o) => [drawingKey(o.drawing), new Set(o.parts.map((p) => p.ref))]));

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/p/acme-app/${project}/defense?mode=present`);
  const stepLine = page.getByTestId('present-step');
  const board = page.getByTestId('board');
  /** Once the step on show is chapter c's step s, and its board has laid out. */
  const at = async (c, s) => {
    const n = presenter.chapters[c].steps.length;
    await page.getByRole('heading', { name: `${c + 1}. ${presenter.chapters[c].title}` }).waitFor();
    await page.waitForFunction((text) => document.querySelector('[data-testid=present-step]')?.textContent === text, `Step ${s + 1} of ${n}`);
    await page.waitForFunction(() => !document.querySelector('[data-testid=board]')?.textContent?.includes('Drawing…'));
  };

  const missing = [];
  const listed = [];
  let steps = 0;
  let checked = 0;
  for (const [c, chapter] of presenter.chapters.entries()) {
    const parts = chapter.drawing ? (partsOf.get(drawingKey(chapter.drawing)) ?? new Set()) : new Set();
    for (const s of chapter.steps.keys()) {
      await at(c, s);
      steps++;
      const expected = new Set(chapter.steps.slice(0, s + 1).flatMap((step) => step.reveal).filter((ref) => parts.has(ref)));
      const drawn = new Set(await board.locator('[data-testid=board-shape]').evaluateAll((els) => els.map((el) => el.getAttribute('data-ref'))));
      checked += expected.size;
      for (const ref of expected) if (!drawn.has(ref)) missing.push(`${chapter.id} step ${s + 1}: ${ref}`);
      const foot = await board.locator('li[data-testid=board-note]').evaluateAll((els) => els.map((el) => el.getAttribute('data-near')).filter(Boolean));
      for (const near of foot) listed.push(`${chapter.id} step ${s + 1}: a note near ${near}`);
      if (s === chapter.steps.length - 1) {
        // Let the step's parts finish drawing in.
        await page.waitForTimeout(2500);
        await page.screenshot({ path: path.join(out, `1280-${c + 1}-${chapter.id}.png`) });
      }
      if (c < presenter.chapters.length - 1 || s < chapter.steps.length - 1) await page.keyboard.press('ArrowRight');
    }
  }
  log(`${presenter.chapters.length} chapters, ${steps} steps. Parts the steps revealed, drawn: ${checked - missing.length} of ${checked}${missing.length ? `; not drawn: ${missing.join('; ')}` : ''}`);
  log(`Notes with a part, listed at the board's foot (should be none): ${listed.length ? listed.join('; ') : 'none'}`);
  if (presenter.chapters.length !== CHAPTER_COUNT) failures.push(`The presenter has ${presenter.chapters.length} chapters, not ${CHAPTER_COUNT}.`);
  if (missing.length) failures.push(`Parts a step revealed weren't drawn: ${missing.join('; ')}.`);
  if (listed.length) failures.push(`Notes were listed at the board's foot instead of by their part: ${listed.join('; ')}.`);

  // The chapter with the most parts revealed, at its last step, in full screen, then on a phone held sideways.
  const busiest = presenter.chapters.reduce((best, ch, i) => (ch.steps.flatMap((s) => s.reveal).length > presenter.chapters[best].steps.flatMap((s) => s.reveal).length ? i : best), 0);
  await page.getByRole('button', { name: `${busiest + 1}. ${presenter.chapters[busiest].title}` }).click();
  await page.keyboard.press('End');
  await at(busiest, presenter.chapters[busiest].steps.length - 1);
  await page.getByTestId('present-fullscreen').click();
  await page.getByTestId('present-overlay').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'fullscreen-1280.png') });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 812, height: 375 });
  await page.getByTestId('present-fullscreen').click();
  const overlay = page.getByTestId('present-overlay');
  await overlay.waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'fullscreen-812x375.png') });
  const fits = await overlay.evaluate((el) => {
    const inView = (id) => {
      const r = el.querySelector(`[data-testid=${id}]`)?.getBoundingClientRect();
      return Boolean(r) && r.top >= 0 && r.bottom <= window.innerHeight;
    };
    return el.scrollHeight <= el.clientHeight && inView('present-caption') && inView('present-next');
  });
  log(`Full screen on a phone held sideways: the caption and ▶ ${fits ? 'fit without scrolling' : "don't fit"}`);
  if (!fits) failures.push("On a phone held sideways, full screen's caption and ▶ don't fit without scrolling.");
  await page.keyboard.press('Escape');

  // Dark mode, at 1280 x 800, whatever the run's theme setting is: it's set to dark, and put back below.
  await call('/api/settings', 'PUT', { theme: 'dark' });
  themeChanged = true;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await page.getByRole('button', { name: `${busiest + 1}. ${presenter.chapters[busiest].title}` }).click();
  await page.keyboard.press('End');
  await at(busiest, presenter.chapters[busiest].steps.length - 1);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'dark-1280.png') });

  log(`Errors the page logged (should be none): ${errors.length ? errors.join(' | ') : 'none'}`);
  if (errors.length) failures.push(`The page logged ${errors.length} errors: ${errors.join(' | ')}`);
  log(`Screenshots: ${out}`);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close();
  if (themeChanged) await call('/api/settings', 'PUT', { theme: settings.theme ?? 'system' }).catch((e) => failures.push(`The theme setting couldn't be put back: ${e.message}`));
  if (started) log(cli('stop'));
}
if (failures.length) {
  log(`Present look failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else log('Present look passed.');
```

How the report reads the transcript:
- **The finalizer's pack** is the text of the last `dp_context` result with `finalize: true`, as the subagent got it. Plan 6's run measured 14,895 characters, with the rules, the whole draft and every full body inline. Here it should be smaller.
- **Files it read.** A `Read` counts for the finalizer when its transcript entry's `parent_tool_use_id` is the id of the main window's `Agent` call for `dev-plumbing:finalizer`. That's how stream-json marks a subagent's calls: Plan 6's whiteboard subagent's Reads of its `rulesFile` and `documentFile` carry it. Paths are compared after `realpath`, since macOS reaches the same temp folder as `/var/…` and `/private/var/…`. "none" means the pack gave null (no earlier final), and "no pack" means the result wasn't JSON.
- **The presenter's size** is that of the last `dp_whiteboard` call's `defense.presenter`, or 0 without one. **Refusals naming the presenter** count the refused calls whose text has `presenter` in it, as every presenter problem line starts with `presenter`.
- **No single quotes** inside the `node -e '…'` scripts, since the shell quotes them with them.
- **What fails the run.** The finalizer's block sets `status=1` when the pack's `rulesFile` or `draftFile` read is "no" or "no pack" (a transcript it can't read gives "no pack"), or `previousFinalFile` is set and wasn't read: the user script can't see what the finalizer read, only the final. The clipped items' count is a report: Plan 6's run had no body over 800 characters. The Whiteboard Defense's block stays a report: the user script fails the run when the presenter is wrong.
- **The look at Present** (`smoke-present.mjs`):
  - it runs only when the user script passed, since there's no presenter to look at otherwise;
  - it refuses a `DEV_PLUMBING_HOME` outside the run's folder, or one whose port is 4545;
  - Playwright comes from the web package's dev dependencies (`createRequire` on `packages/web/package.json`), with the Chromium the e2e tests use;
  - at every step it compares the board's `board-shape` refs with the refs the steps so far revealed, of those the pack lists for the chapter's drawing, and the `data-near` of every `li` note in the list at the board's foot. A note with a part that lands there means the web drew less than core's `brings` (Decision 4);
  - it stops the service in a `finally` when it started it, and the runner's cleanup stops it anyway.
- **Checked on real transcripts.** On Plan 6's kept run:
  - round 1 prints 14895 and "rulesFile none, draftFile none, previousFinalFile none" (its pack had no file fields yet);
  - round 2 prints 25493 and 14997, as Plan 6 recorded, and "presenter: 0", with 0 refusals naming it.

  On synthetic transcripts it prints "rulesFile yes, draftFile no, previousFinalFile none", for a finalizer that read its rules through `/tmp//…` and a draft that only another subagent read. For one refusal naming the presenter and then a save, it prints the presenter's size and 1.

- [ ] **Step 3: Check the scripts parse, and the look at Present on a real board**

Run: `node --check scripts/smoke-user.mjs && node --check scripts/smoke-present.mjs && bash -n scripts/smoke-claude.sh`
Expected: no output, exit 0.

`smoke-present.mjs` needs no Claude, so the e2e runs it on Task 4's board, against the e2e's own service and home (port 45459). In `packages/web/e2e/present.spec.ts`, replace:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { defenseInput, importProject, writeDefense, type TestItem } from './claude';
import { noSideScroll, readJson } from './env';
```
with:
```ts
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { defenseInput, importProject, writeDefense, type TestItem } from './claude';
import { e2eTmp, noSideScroll, readJson, repoRoot } from './env';
```
and add at the end of the file:
```ts

test("the smoke run's look at Present passes on a real board", async () => {
  test.setTimeout(120_000);
  const p = await presented('present-smoke');
  const tmp = e2eTmp();
  // As smoke-claude.sh runs it: this run's dev-plumbing home, and your own HOME, where Playwright keeps its browsers.
  // The service is up, so it leaves it running.
  const env = { ...process.env, DEV_PLUMBING_HOME: path.join(tmp, '.dev-plumbing') };
  const run = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'smoke-present.mjs'), tmp, p.project], { env, encoding: 'utf8' });
  expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
  expect(run.stdout).toContain('Parts the steps revealed, drawn: 9 of 9');
  expect(run.stdout).toContain("Notes with a part, listed at the board's foot (should be none): none");
  expect(run.stdout).toContain('Full screen on a phone held sideways: the caption and ▶ fit without scrolling');
  expect(run.stdout).toContain('Present look passed.');
  expect(fs.readdirSync(path.join(tmp, 'present')).sort()).toEqual([
    '1280-1-purpose.png',
    '1280-2-flow.png',
    '1280-3-data.png',
    '1280-4-states.png',
    '1280-5-security.png',
    '1280-6-failure.png',
    '1280-7-rollback.png',
    'dark-1280.png',
    'fullscreen-1280.png',
    'fullscreen-812x375.png',
  ]);
});
```
Each step counts every part the steps so far revealed: System flow's three steps reveal `node:job`, then `edge:reads`, then `edge:sends` (1, 2 and 3 to check), and Data's two reveal `table:RestockReminder`, then `link:RestockReminder.subscription` (1 and 2): 9 in all. Run:
```bash
pnpm test:e2e present
```
Expected: PASS (6 tests in `present.spec.ts`).

- [ ] **Step 4: Update the README**

In `README.md`, replace the status line:
```markdown
**Status:** the Claude loop, the visual screens, Finalize spec, bringing in a changed plan and the Whiteboard Defense work. Present, which draws the Whiteboard Defense as an animated whiteboard, comes next. The design is in [SPEC.md](SPEC.md), and the plans are in [docs/superpowers/plans](docs/superpowers/plans).
```
with:
```markdown
**Status:** v1 is complete. The Claude loop, the visual screens, Finalize spec, bringing in a changed plan and the Whiteboard Defense, with Present, all work. The design is in [SPEC.md](SPEC.md), and the plans are in [docs/superpowers/plans](docs/superpowers/plans).
```

In **Use it**, the follow-ups in a sentence. Replace:
```markdown
  Where you and the repo both changed the same passage, your draft keeps your text, and a **Plan changes** thread offers Claude's merged version, the repo's version and your own, each one click to accept. When the repo's version is mostly a rewrite, Claude also offers **Start the draft from v2**. **Not now** opens the project as it was, and Claude asks again next time.
```
with:
```markdown
  Where you and the repo both changed the same passage, your draft keeps your text, and a **Plan changes** thread offers Claude's merged version, the repo's version and your own, each one click to accept. When the repo's version is mostly a rewrite, Claude also offers **Start the draft from v2**. **Not now** opens the project as it was, and Claude asks again next time. Once every Plan changes thread is settled, and settling one changed your draft, the next `/dev-plumbing` re-imports once more, so the items catch up with what you settled. Each item a re-import changed shows **What v2 changed** in its thread.
```

and say to restart open Claude Code sessions after updating: one started before keeps the old agents, and its whiteboard subagent would send no presenter. Replace:
```markdown
- **Keep this checkout:** the plugin and the app both run from its build here. After you pull, run `pnpm build`, restart the app (`dev-plumbing stop`, then `dev-plumbing start`), and start a new Claude Code session.
```
with:
```markdown
- **Keep this checkout:** the plugin and the app both run from its build here. After you pull, run `pnpm build`, restart the app (`dev-plumbing stop`, then `dev-plumbing start`), and restart every Claude Code session that was open while you updated, so it picks up the new agents. A session that kept running uses the old ones: after this update, its Whiteboard Defense would be refused with "presenter is missing. Send the seven chapters too."
```

Add Present after Practice. Replace:
```markdown
  - **Practice** shows the questions as flashcards: show the answer, rate yourself, and the next card comes up. Space, 1 to 3 and the arrow keys work too, and **Only shaky and couldn't** keeps the cards you're not sure of. A readiness meter, half flashcards and half checklist, sits with the checklist.
```
with:
```markdown
  - **Practice** shows the questions as flashcards: show the answer, rate yourself, and the next card comes up. Space, 1 to 3 and the arrow keys work too, and **Only shaky and couldn't** keeps the cards you're not sure of. A readiness meter, half flashcards and half checklist, sits with the checklist.
  - **Present** draws the plan on a hand-drawn whiteboard, one step at a time, in seven chapters from Purpose to Rollback and blast radius: the project's own diagram, tables or system flow, with a caption to say out loud and marker notes. ◀ ▶ and the arrow keys step through it, **Replay** draws the chapter again, and **Full screen** covers the window. On a phone, turn it sideways and use Full screen.
```

- [ ] **Step 5: Explain Present and the follow-ups in `docs/how-it-works.md`**

In the agents table, replace the `importer` row:
```markdown
| `importer` | Once per plumbing type, when a plan is imported, and again when you bring in a new version of the plan. It reads the plan (and code, if the type's rules say so) and writes that type's items: questions, concerns, database changes and so on. | Read-only file tools, `dp_context`, `dp_write_items` |
```
with:
```markdown
| `importer` | Once per plumbing type, when a plan is imported, again when you bring in a new version of the plan, and once more when you've settled that version's Plan changes. It reads the plan (and code, if the type's rules say so) and writes that type's items: questions, concerns, database changes and so on. | Read-only file tools, `dp_context`, `dp_write_items` |
```

and the `whiteboard` row:
```markdown
| `whiteboard` | When you press **Generate**, **Regenerate** or **Try again** on the Whiteboard Defense page. It writes the Whiteboard Defense from the final (or the draft), the items, the decisions and the repo profile, following `outputs/whiteboard-defense.md`. | Read-only file tools, `dp_context`, `dp_whiteboard` |
```
with:
```markdown
| `whiteboard` | When you press **Generate**, **Regenerate** or **Try again** on the Whiteboard Defense page. It writes the Whiteboard Defense, with its presenter for Present, from the final (or the draft), the items, the decisions and the repo profile, following `outputs/whiteboard-defense.md`. | Read-only file tools, `dp_context`, `dp_whiteboard` |
```

In the tools table, replace the `dp_context` row:
```markdown
| `dp_context` | importer, thread, finalizer, whiteboard | Gets the "context pack" for one job: the plan text, the plumbing type's rules, the thread so far, past decisions and related items. The finalizer's pack has the draft, every item, the decisions with why, the defaults and the drawing tokens it may use. When the plan is re-imported, an importer's pack also has what changed between the two versions, and its type's items with their keys and drawings. The whiteboard subagent's pack names the rules file and the document (the final or the draft) for it to read, so it stays small on a big plan, and has every item with its own file (a diagram's drawing comes inline), the decisions, the defaults, the open items, the repo profile's conventions, sensitive data, schema and apps, and the last defense's questions and unknowns; a Defense thread's pack also has the whole Whiteboard Defense. |
```
with:
```markdown
| `dp_context` | importer, thread, finalizer, whiteboard | Gets the "context pack" for one job: the plan text, the plumbing type's rules, the thread so far, past decisions and related items. The finalizer's pack names the rules file, the draft and the previous final for it to read, so it stays small on a big plan, and has every item with its own file, the decisions with why, the defaults and the drawing tokens it may use. When the plan is re-imported, an importer's pack also has what changed between the two versions (or, in a catch-up, what settling the Plan changes changed), and its type's items with their keys and drawings. The whiteboard subagent's pack names the rules file and the document (the final or the draft) for it to read, so it stays small on a big plan, and has every item with its own file (a diagram's drawing comes inline), the decisions, the defaults, the open items, the repo profile's conventions, sensitive data, schema and apps, the last defense's questions and unknowns, and the drawings Present may use, each with the parts a step can reveal; a Defense thread's pack also has the whole Whiteboard Defense. |
```

and the `dp_whiteboard` row:
```markdown
| `dp_whiteboard` | whiteboard | Sends the Whiteboard Defense as structured data: the level and its reasons, ten sections of statements, each marked known, inferred, unknown or verify, the questions with their answers and the release concerns. The service adds the titles and ids, and copies the rules file's checklist. If anything is wrong, the whole defense is refused, with every problem listed, and the last one saved stays as it was. |
```
with:
```markdown
| `dp_whiteboard` | whiteboard | Sends the Whiteboard Defense as structured data: the level and its reasons, ten sections of statements, each marked known, inferred, unknown or verify, the questions with their answers, the release concerns and the presenter's seven chapters for Present. The service adds the titles and ids, and copies the rules file's checklist. If anything is wrong, such as a part the presenter names that isn't in its chapter's drawing, the whole defense is refused, with every problem listed, and the last one saved stays as it was. |
```

In **Finalize**, step 3 says the pack names files to read. Replace:
```markdown
3. **Write.** The finalizer reads its context pack:
   - the rules and the draft;
   - every item, with a short summary of its drawing;
   - the decisions, each with why and what was rejected;
   - the defaults, the repo's conventions and the previous final.
```
with:
```markdown
3. **Write.** The finalizer reads its context pack. The rules, the draft and the previous final are files it reads, so the pack stays small whatever the size of the plan. The pack has:
   - every item, with a short summary of its drawing, and its body cut to 800 characters, with its own file to read for the rest;
   - the decisions, each with why and what was rejected;
   - the defaults and the repo's conventions.
```

In **When the plan changes in the repo**, step 2 says what Claude tells you after putting an update back. Replace:
```markdown
   If any part of this fails, what it wrote is put back. If even that stops part-way, the next `/dev-plumbing` finishes putting it back before anything else. If your draft was changed in the meantime, it's kept, and the copy from before the update is set aside under `docs/versions/v<n>.unfinished-<stamp>/`.
```
with:
```markdown
   If any part of this fails, what it wrote is put back. If even that stops part-way, the next `/dev-plumbing` finishes putting it back before anything else, and Claude tells you: "An earlier update to v2 didn't finish, and was put back." If your draft was changed in the meantime, it's kept, and your plan and draft from before the update are set aside under `docs/versions/v<n>.unfinished-<stamp>/`; Claude then adds which of your files were kept and where your files from before the update are. That folder is then the only copy of your draft as it was before the update. Nothing removes it by itself: the Versions page lists it, with **Remove** (step 6).
```

In step 4, replace the bullet for an item that changed:
```markdown
   - **an item that changed** keeps its id, its thread, your answers and your decisions. It's updated and marked "May need another look", with "Changed in the plan's v2.", and its thread says "Updated from the plan's v2.". A drawing is edited from where your threads left it, not redrawn;
```
with:
```markdown
   - **an item that changed** keeps its id, its thread, your answers and your decisions. It's updated and marked "May need another look", with "Changed in the plan's v2.", and its thread says "Updated from the plan's v2.". A drawing is edited from where your threads left it, not redrawn. The thread's **What v2 changed**, folded until you open it, shows the parts the re-import changed, each as v1 had it against what the re-import made of it: **Summary**, **Details**, **Fields** and **Drawing** (as a line saying what it draws), or "Nothing else changed." A change you accept afterwards isn't in it. (The re-import keeps that copy in `docs/versions/v2/reimported/`. An item re-imported before there were such copies says **Changed since before v2**, against the item as it is now.) It's there to read: nothing in it undoes the change. A question the importer adds to the thread is marked "raised in the plan's v2";
```

the bullet for a removed item:
```markdown
   - **an item whose part of the plan was removed** is parked, never deleted, with "Removed from the plan in v2.". If Claude is working on its thread right then, it's marked "May need another look" instead, and parked once Claude's reply lands. The list shows "removed from the plan in v2" on it, and Finalize lists a parked one under "Parked: left out of the final". If a later version brings that part back, or you unpark it, it's back in the plan, and resolved again if its answer still stands;
```
with:
```markdown
   - **an item whose part of the plan was removed** is parked, never deleted, with "Removed from the plan in v2.". If Claude is working on its thread right then, it's marked "May need another look" instead, and parked once Claude's reply lands. The list shows "removed from the plan in v2" on it, and Finalize lists a parked one under "Parked: left out of the final". If a later version brings that part back, or you unpark it, it's back in the plan, and resolved again if its answer still stands. Its thread offers **Park** even when it's resolved, so you can leave it out of the final again;
```

and the line under the bullets:
```markdown
   A second listening window can't end a re-import early.
```
with:
```markdown
   A second listening window can't end a re-import early. If a re-import is cut short anyway, for example because the Claude window closed, the project's header says which types didn't finish, such as "The v2 re-import didn't finish for Flows. Run /dev-plumbing to try again.", and the next `/dev-plumbing` says it's finishing it and runs just those importers again (as a catch-up again, when it was one, step 5). While Claude has threads to answer, it waits, and Claude says so: run `/dev-plumbing` again once they're answered. It's tried once on its own: cut short a second time, the header says "The v2 re-import didn't finish again for Flows. Run /dev-plumbing to try again.", the next `/dev-plumbing` says that rather than run it, and the one after tries once more.
```

Then add the catch-up as step 5, and the leftovers to Versions, now step 6. Replace:
```markdown
5. **Versions.** Once there's a v2, **Documents** shows **Original (v2)**, **Draft (v2)** and **Versions**.
   - **Versions** lists every version, the current one first, with its date, its branch and commit, and what its merge did.
   - Open one to read that version's plan and draft, and, for a version an update brought in, what that update changed in your draft.
   - **Compare with** shows what changed in the plan between it and another version.
```
with:
```markdown
5. **Catch up.** Settling a Plan changes thread can change your draft, but the importers ran before you settled it, so the items may not match it yet. Once every Plan changes thread of the version is settled (resolved or parked), and settling at least one of them changed your draft, the Plan changes list says "Your Plan changes are settled. Run /dev-plumbing to catch the items up.", and the next `/dev-plumbing` starts with "Your settled Plan changes touch the plan's items. Re-importing to catch them up."
   - It's step 4 again, for every importable type, matching items by key, but what changed is only what settling did: each change you took in a Plan changes thread, under its passage's heading. Your answers to other items aren't in it, and there are no conflicts left in it. An item it changes is marked "Changed in the plan's v2." as before, and its thread says "Updated to match your settled Plan changes.".
   - It runs once per version, after **Not now** too, since Not now only declines a newer version. It doesn't run at all when settling changed nothing, for example when you kept your draft everywhere. Like an update, it waits while Claude has threads to answer or an import is under way, and Claude says so: "Your settled Plan changes still need a re-import. It waits until Claude has answered: run /dev-plumbing again then." A re-import that was cut short is finished first.
6. **Versions.** Once there's a v2, **Documents** shows **Original (v2)**, **Draft (v2)** and **Versions**.
   - **Versions** lists every version, the current one first, with its date, its branch and commit, and what its merge did.
   - Open one to read that version's plan and draft, and, for a version an update brought in, what that update changed in your draft.
   - **Compare with** shows what changed in the plan between it and another version.
   - **Left over from updates that didn't finish** lists the folders an unfinished update set aside (step 2), each with that version's plan and draft from before the update. **Remove** asks first, then deletes that folder and nothing else.
```

In **Whiteboard Defense**, the opening paragraph names Present. Replace:
```markdown
You study it, and practise explaining it, before you build.
```
with:
```markdown
You study it, practise explaining it and present it on a whiteboard, before you build.
```

In step 2, replace the last bullet and the paragraph under the bullets:
```markdown
   - every statement marked **Known**, **Inferred**, **Unknown** or **Verify before release**. What isn't known is marked Unknown, not made up.

   The service checks the whole defense: every section there once, each with at least one statement, a cell for every column of a table, a diagram that names a real drawing, no question twice, and the size. If anything is wrong, nothing is saved, the subagent is told every problem at once and sends it again, and the defense you had stays as it was. A saved one replaces it.
```
with:
```markdown
   - every statement marked **Known**, **Inferred**, **Unknown** or **Verify before release**. What isn't known is marked Unknown, not made up;
   - the presenter, for **Present** (step 5): seven chapters of steps, each chapter drawing one of the project's drawings, or none. The pack lists those drawings, each with the parts a step can reveal.

   The service checks the whole defense: every section there once, each with at least one statement, a cell for every column of a table, a diagram that names a real drawing, no question twice, the presenter's seven chapters in order with every part they name in their drawing, and the size. If anything is wrong, nothing is saved, the subagent is told every problem at once and sends it again, and the defense you had stays as it was. A saved one replaces it.
```

Add Present as step 5, after Practice. Replace:
```markdown
5. **Ask Claude about this.** Any section, question or release concern can start a thread: type your question, and it goes to Claude as **Send this thread** sends one.
```
with:
```markdown
5. **Present.** The third mode draws the plan on a hand-drawn whiteboard, one step at a time, for when you explain it out loud. It follows the presenter the subagent wrote with the rest:
   - **Seven chapters,** always in this order: **Purpose**, **System flow**, **Data and source of truth**, **States**, **Security**, **Failure and retries** and **Rollback and blast radius**. Each has one to eight steps. A chapter the plan doesn't touch has one step that says so.
   - **One drawing per chapter, or none:** a diagram item, the project's tables (drawn as the Database screen's relationship strip) or a system flow (drawn as a sequence). Their parts are named by kind: `node:`, `edge:` and `group:` for a diagram, `table:` and `link:` for the tables, `lane:` and `step:` for a flow. User flows, mockups and phases aren't drawn; a caption or a note can name them. A chapter with no drawing writes its notes on the board as a list.
   - **Each step** has a caption, what to say out loud. It adds the parts it reveals to what the chapter already drew: a line brings its two ends, a flow's step its two lanes, and a group appears with its first box. It can add up to four marker notes, circled by the part they're near or written at the board's foot: seal for a risk, slate for data, moss for what's safe and ink for structure.
   - **The board** is the page's canvas with a faint dot grid. Its lines are rough, and the same every time; labels and notes are in the system font. What a step adds draws itself in. Going back a step shows that step's board at once, and with your system's reduced motion on, everything shows at once.
   - **Nothing moves between steps.** Each chapter is framed once, around what it shows by its last step with its notes, so a chapter that shows ten boxes of a big diagram draws them large. Each note is placed when its step comes, clear of the parts the chapter draws and the notes before it, and stays there. In the page the board is as tall as the chapter's drawing needs at the page's width, within the window, and opening Present scrolls it into view, so the board, the caption and the buttons are on screen together; they move only when the chapter changes.
   - **Controls:** ◀ ▶ or ← → step through it, across chapters. Home and End go to the chapter's first and last step, and the chapters list jumps to a chapter. **Replay** draws the chapter again from its first step. **Full screen** covers the window, and the screen too where the browser allows it; Esc or ✕ leaves it, and the page under it can't take the focus. On a phone held upright, it suggests turning it sideways and pressing Full screen; held sideways, full screen fits the chapter, the board, the caption and the buttons without scrolling.
   - **When the plan moved on** since it was written, a part that's no longer in its drawing is skipped and the rest is drawn, and a drawing that's gone shows "Nothing to draw in this chapter." with the notes. A defense written before Present has no presenter: the page says so, and **Regenerate** writes one. If Present's own code can't load (a tab left open across an update, say), it says "Present couldn't load. Reload the page." in its place.
6. **Ask Claude about this.** Any section, question or release concern can start a thread: type your question, and it goes to Claude as **Send this thread** sends one.
```

and renumber the steps after it. Replace `6. **Send to Questions or Concerns.**` with `7. **Send to Questions or Concerns.**`, `7. **Out of date.**` with `8. **Out of date.**`, and `8. **Export .md.**` with `9. **Export .md.**`.

In **Where everything is stored**, replace:
```
  docs/versions/v<n>/            each earlier version's original.md, draft.md and items, and merged.md:
                                 the draft as the update to v<n> left it
```
with:
```
  docs/versions/v<n>/            each earlier version's original.md, draft.md and items, and merged.md:
                                 the draft as the update to v<n> left it
  docs/versions/v<n>/reimported/ each item the re-import of v<n> changed, as it left it (What v<n> changed)
  docs/versions/v<n>.unfinished-<stamp>/
                                 your plan and draft from before an update that didn't finish, set aside
                                 because your draft had changed since; Remove on the Versions page deletes it
```

In **Common questions**, before the last two, add one about the reserved ids. Replace:
```markdown
**How do I see what the service is doing?**
```
with:
```markdown
**Can I write my own rules for Plan changes or Defense questions?** No. Both are built into the app, and their ids, `plan-changes` and `defense`, are kept for them. A rules file in `plumbing/` with either id is ignored, the built-in type is used, and the Plumbing rules page lists the file under "Files with problems": "The id "plan-changes" is kept for dev-plumbing's built-in Plan changes type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file." Saving it from the page is refused with the same words, and **+ Plumbing type** won't make a type with either id.

**How do I see what the service is doing?**
```

In **Words**, replace:
```markdown
| Defense questions | The plumbing type for your questions to Claude about the Whiteboard Defense, one thread each. It never blocks Finalize or goes into the final. |
```
with:
```markdown
| Defense questions | The plumbing type for your questions to Claude about the Whiteboard Defense, one thread each. It never blocks Finalize or goes into the final. |
| Present | The Whiteboard Defense's third mode: the plan drawn on a hand-drawn whiteboard, one step at a time, with a caption to say out loud. |
| Catch-up | The re-import the next `/dev-plumbing` runs once a version's Plan changes are settled and settling changed the draft, so the items match what you settled. |
```

- [ ] **Step 6: SPEC: §7's tree, §12's Present as built, and §13.1's `presenter`**

In `SPEC.md` §7's file tree, add the versions folders, which no plan put there yet. Replace:
```
    docs/final.assets/                     # mockups that go with the final
```
with:
```
    docs/final.assets/                     # mockups that go with the final
    docs/versions/v<n>/                    # an earlier version's plan, draft and items; merged.md is the draft its update left,
                                           #   reimported/ each item its re-import changed, as it left it
    docs/versions/v<n>.unfinished-<stamp>/ # your plan and draft from before an update that didn't finish; Remove on Versions
```

In §12, under **Three modes**, replace Present:
```markdown
1. **Present:** a full-screen, hand-drawn whiteboard (Rough.js lines, Motion animation). The system draws itself one step at a time, and each step has a caption saying what to say out loud.
   - **Chapters:** Purpose → System flow → Data and source of truth → States → Security → Failure and retries → Rollback and blast radius.
   - **Controls:** arrow keys to step, and **Replay**.
   - **Built from existing data:** steps reveal parts of the project's own diagram data and add red-marker notes (e.g. "runs twice? → one per subscription per day").
```
with:
```markdown
1. **Present:** a hand-drawn whiteboard (Rough.js lines, Motion animation), as wide as the page, with **Full screen** to cover the window. The system draws itself one step at a time, and each step has a caption saying what to say out loud.
   - **Chapters:** always these seven, in this order: Purpose → System flow → Data and source of truth → States → Security → Failure and retries → Rollback and blast radius. Each has 1–8 steps; a chapter the plan doesn't touch has one step that says so.
   - **One drawing per chapter, or none:** a diagram item, the project's tables (the Database screen's relationship strip) or a system flow (a sequence). User flows, mockups and phases aren't drawn. A chapter with no drawing writes its notes as a list.
   - **Built from existing data:** each step reveals parts of its chapter's drawing, adding to what earlier steps drew, by typed refs (`node:`, `edge:`, `group:`; `table:`, `link:`; `lane:`, `step:`), and adds up to four marker notes in ink, slate (data), seal (risks) or moss (what's safe), e.g. "runs twice? → one per subscription per day". A line brings its two ends, a flow's step its two lanes, and a group appears with its first box.
   - **The board:** the canvas with a faint dot grid, rough lines seeded so they look the same every time, labels in the system font. New parts draw themselves in; going back a step, or reduced motion, shows the board at once. Each chapter is framed once, around what it shows by its last step and its notes, and notes stay where they're first placed, so nothing moves between steps.
   - **Controls:** ◀ ▶ and the arrow keys to step, across chapters; Home and End; a chapters list (beside the board from 1100 px, a menu below); **Replay** (the chapter from its first step); **Full screen** (Esc leaves; the page under it is inert). On a phone held upright, it suggests turning sideways and pressing Full screen, which then fits in one view.
   - **Written with the defense:** the whiteboard subagent writes the presenter in the same call, from the drawings its pack lists, and the service checks every ref against the project's drawings. A defense saved before Present has no presenter, and Present offers **Regenerate**. A ref whose part is gone since is skipped.
```

In §13.1, bring the `presenter` type in line with what `whiteboard/defense.json` holds (Task 1). Replace:
```ts
  presenter?: { chapters: { id: string; title: string;                      // Present (Plan 7)
               steps: { caption: string; reveal: string[];                // node/edge ids
                        notes?: { near: string; text: string; ink: "ink" | "slate" | "seal" | "moss" }[] }[] }[] };
```
with:
```ts
  presenter?: { chapters: {                                                 // Present; a defense saved before it has none
      id: "purpose" | "flow" | "data" | "states" | "security" | "failure" | "rollback";   // all seven, in this order
      title: string;
      drawing: { kind: "diagram"; itemId: string } | { kind: "tables" } | { kind: "flow"; itemId: string } | null;
      steps: { caption: string;                                             // 1–8 steps; what to say out loud
               reveal: string[];          // parts added: node:, edge:, group: | table:, link: | lane:, step:
               notes: { near: string;     // a part already on the board, or "" for the board's foot
                        text: string; ink: "ink" | "slate" | "seal" | "moss" }[] }[] }[] };   // 0–4 notes a step
```

- [ ] **Step 7: Run the full check**

Run:
```bash
before=$(ls -d "${TMPDIR:-/tmp}"/dp-* 2>/dev/null | grep -v dp-smoke- | wc -l)
pnpm install --frozen-lockfile && pnpm check
git grep -n -F "$HOME" -- . ':!pnpm-lock.yaml' ':!docs/superpowers/plans'
after=$(ls -d "${TMPDIR:-/tmp}"/dp-* 2>/dev/null | grep -v dp-smoke- | wc -l)
echo "temp folders: $before before, $after after"
ls -l packages/web/dist/assets/*.js
grep -l 'zigzag-line' packages/web/dist/assets/*.js
```
Expected:
- `pnpm check` passes: typecheck clean, then unit, integration and e2e, with Task 4's `present.spec.ts` and Plans 5 and 6's specs.
- The grep for `$HOME` prints nothing: no file outside the plans names your home folder. The docs use the Acme examples only.
- The temp-folder count is the same before and after. `dp-smoke-*` folders from a smoke run are kept for their transcripts and don't count.
- **The chunks** (Decision 9; `pnpm check` built them):
  - `index-*.js` is about Plan 6's 728 kB plus Plan 7's own page code, well under 800 kB. Motion alone is over 100 kB minified, so a main chunk past 800 kB means it leaked into the main bundle.
  - The `zigzag-line` grep, a fill style only Rough.js has, prints one chunk, and not `index-*.js`.
  - ELK's chunk is still its own.

- [ ] **Step 8: Hand the smoke run to the controller**

Don't run `pnpm smoke` yourself. It makes real model calls: the import, a thread, a finalizer on opus, the update and its re-import, then a whiteboard subagent on opus and two more threads. Plan 6's run took about 10 minutes, and the presenter adds a little to the whiteboard subagent's part, and the look at Present about a minute. Report that the scripts and docs are ready, with Step 7's output. The controller runs `pnpm smoke` from the worktree and gives you everything it printed.

What the controller should see:
- **Rounds 1 and 2:** everything Plan 6's run printed, plus:
  - "Status: active, import pending: none, re-import unfinished for: none"
  - "What v2 changed: "…": details, …", one entry per item flagged as changed in v2. Plan 6's run flagged two (the Phases items). "nothing else changed" is a pass.
  - after the Plan changes lines, one of:
    - "Catch-up: every option accepted on them kept the draft as it was, so there's nothing to catch up; the project home says one is not due", when Claude recommended "Keep my draft", as in Plans 5 and 6;
    - "Catch-up: every Plan changes thread is settled, and settling changed the draft ("…"); the project home says one is due", when it recommended a merged version.
- **The Whiteboard Defense:** Plan 6's lines, plus, after "Out of date when saved: no":
  - "Drawings in the pack: diagram:architecture-… (N parts), tables (N parts), flow:flows-… (N parts)". The run's project has had one diagram, two tables and one system flow.
  - "Presenter: 7 chapters, N steps, N drawing something (diagram N, tables N, flow N), N notes (ink N, slate N, seal N, moss N)"
  - seven lines, "1. Purpose: N steps, draws nothing, N notes" to "7. Rollback and blast radius: …". A chapter that draws says `draws "<title>" (<key>), revealing N of its N parts`.
  - and the last summary line, with "N presenter steps".
- **The runner's report:**
  - **Round 1:** Plan 6's counts, plus:
    - "JSON characters in the finalize dp_context result: N", below Plan 6's 14,895;
    - "Files from its pack the finalizer read: rulesFile yes, draftFile yes, previousFinalFile none" (round 1's is the first final). Anything else fails the run;
    - "Clipped items whose file the finalizer read: N of M", all of them when there are any (Plan 6's run had none over 800 characters).
  - **Round 2:** Plan 6's counts.
  - **"== The Whiteboard Defense, in round 2's window":** Plan 6's lines, plus:
    - "JSON characters in the last dp_whiteboard presenter: N", under 20,000 and near 12,000 or less, as the agent is asked. The defense's N grows by about that much over Plan 6's 25,493, and should stay under about 55,000.
    - "dp_whiteboard refusals naming the presenter: N", ideally 0;
    - "JSON characters in the whiteboard dp_context result: N", Plan 6's 14,997 plus the drawings, a few thousand more.

  - **"== Present, drawn from the run's presenter":**
    - "[present] 7 chapters, N steps. Parts the steps revealed, drawn: N of N";
    - "[present] Notes with a part, listed at the board's foot (should be none): none";
    - "[present] Full screen on a phone held sideways: the caption and ▶ fit without scrolling";
    - "[present] Errors the page logged (should be none): none";
    - "[present] Screenshots: <work>/present" and "[present] Present look passed.". Look through the screenshots: each chapter's last step at 1280 x 800, full screen at 1280 x 800 and 812 x 375, and dark mode.

  The look uses only the run's temporary home and its port, 45461, never your real `~/.dev-plumbing` or 4545. The defense is probably Out of date by then, since Claude's answer may have added an item. That's fine: its drawings haven't changed. The run's home is kept, so you can look by hand too: `DEV_PLUMBING_HOME="$work/.dev-plumbing" node packages/cli/dist/index.js start`, open http://localhost:45461/p/acme-app/restock-reminders/defense?mode=present, and `… stop` after.

If something fails:
- **"The defense has no presenter, so Present can't show it.":** `saveDefense` should have refused the defense ("presenter is missing. Send the seven chapters too."), or it dropped the field. It builds the stored defense field by field, so check it copies `presenter` (Task 1).
- **"The presenter's chapters are …, not the seven in order"** or **"… chapter titles are …, not Present's":** `saveDefense` stores the chapters in `PRESENT_CHAPTERS` order with its titles (Task 1).
- **"… has N steps; a chapter has one to eight.":** `presenterInputSchema`'s limits (Task 1).
- **"No chapter of the presenter draws anything.":** no service rule refuses this. The subagent chose `null` everywhere.
  - If "Drawings in the pack" says "none", check `drawingOptions` against the run's items (Task 1).
  - Otherwise, read `whiteboard.md`'s presenter step (Task 2): it should draw the diagram for System flow and the tables for Data when the pack has them.
- **"… draws …, which isn't one of the pack's drawings."** or **"… draws …, but …":** `drawingOptions` (Task 1) and the item rows disagree, for example a parked item offered, or a user flow.
- **"The presenter names parts that aren't in its chapter's drawing: …":** `saveDefense`'s ref check let them through (Task 1).
- **Many "refusals naming the presenter":** read them in the runner's "refused:" lines. Fix the agent's presenter step (Task 2), or the check, if it refuses something it shouldn't (Task 1).
- **"/api/claude/context answered 4xx: …":** the message is the service's (Task 2).
- **"… is flagged as changed in v2, but its thread doesn't show what v2 changed.":** check `itemVersionChange` and where `ThreadDetail` is built (Task 8). v1's copy is in `docs/versions/v1/items/`, and the flag's reason is "Changed in the plan's v2.".
- **"The project home says the v2 re-import didn't finish for …":** `finishImport` recorded `importIncomplete` on a re-import whose batches all came (Task 10). Compare it with the runner's "Importable types with no saved dp_write_items batch" line.
- **"The project home offers a catch-up, but every option accepted on them kept the draft …":** `ProjectHome.catchUpDue` (Task 7) counts something other than the Plan changes threads' applied edits (`settledEdits`). Then the Plan changes list asks for a `/dev-plumbing` that does nothing, for good.
- **"The project home doesn't offer a catch-up, though …":** compare `settledEdits` with the run's `history/` entries for the Plan changes threads: each accepted option with edits should be an applied entry with a non-empty `change.md` (Task 7).
- **"[present] Parts a step revealed weren't drawn: …":** the web's `shownAt` or `layoutBoard` (Task 3) draws less than core's `drawingParts`, or a drawing's data didn't load (Task 4's `useSource`).
- **"[present] Notes were listed at the board's foot instead of by their part: …":** the note's `near` wasn't on the web's board at its step: compare `shownAt` with core's `brings` (Decision 4).
- **"[present] On a phone held sideways, full screen's caption and ▶ don't fit …":** the short-screen classes of Task 4's `FULL` (the `[@media(max-height:500px)]` rows).
- **"[present] The page logged N errors: …":** the console's message names the part; a failed chunk would also show "Present couldn't load.".
- **"The project home's catchUpDue is …, not true or false.":** `ProjectHome` lacks the field (Task 7).
- **"Files from its pack the finalizer read: rulesFile no, …":** the finalizer wrote the final without reading the rules, and the run fails. The user log can still pass. Fix step 1 of `finalizer.md` (Task 6).
- **"JSON characters in the finalize dp_context result" above 14,895:** check that `finalizePack` gives files, not text, and clips the bodies (Task 6).

The controller decides on any fix. Record each one, and the run that finally passed.

- [ ] **Step 9: Record the results**

Add this section to the end of `smoke/RESULTS.md`, and fill every row from the controller's run. Don't leave any blank:
```markdown

## Plan 7: Present, and the follow-ups

Date: <date> · Claude Code version: <`claude --version`>

| Check | Result | Evidence |
|---|---|---|
| Rounds 1 and 2 and the Whiteboard Defense still pass | yes/no | user log: "Claude's final arrived in N s: …", "Updated to v2 and re-imported in N s.", "Claude's Whiteboard Defense arrived in N s: …", "Smoke test passed." |
| The finalizer read the rules and the draft from its pack's files (the run fails otherwise), and its pack stayed small | yes/no | runner, round 1: "JSON characters in the finalize dp_context result: N" (Plan 6's run: 14,895), "Files from its pack the finalizer read: rulesFile …, draftFile …, previousFinalFile …", "Clipped items whose file the finalizer read: N of M" |
| Each item flagged as changed in v2 shows what v2 changed | yes/no/n.a. (none flagged) | user log: "What v2 changed: …" |
| The re-import finished for every type, and the home doesn't say otherwise | yes/no | user log: "… re-import unfinished for: none"; runner, round 2: "Importable types with no saved dp_write_items batch (should be none): none" |
| The project home offers the catch-up exactly when settling a Plan changes thread changed the draft | yes/no | user log: "Catch-up: …; the project home says one is …" |
| The whiteboard subagent wrote a presenter in the same call | yes/no | runner: "dp_whiteboard calls: N, refused: N", "dp_whiteboard refusals naming the presenter: N"; user log: "Presenter: 7 chapters, …" |
| The presenter: seven chapters in order, 1–8 steps each, at least one drawing, every part it names in its chapter's drawing | yes/no | user log: "Drawings in the pack: …", "Presenter: …" and the seven chapter lines |
| The presenter, the defense and the pack stay small | yes/no | runner: "JSON characters in the last dp_whiteboard presenter: N" (under 20,000; about 12,000 asked), "… defense: N" (Plan 6: 25,493), "… whiteboard dp_context result: N" (Plan 6: 14,997) |
| Present draws the run's presenter: every revealed part drawn, no note with a part in the foot list, no page errors, full screen fits a phone held sideways (the run fails otherwise) | yes/no | runner: the "== Present, drawn from the run's presenter" lines; screenshots in `<work>/present/` |

Not exercised by this run, and tested instead:
- **The catch-up re-import itself:** it needs a third window, and a Plan changes answer that changed the draft. Task 7's core and service tests.
- **Reserved ids:** Task 5.
- **Recovery lines and leftover folders:** no update failed. Task 9.
- **A re-import cut short:** Task 10.
- **Present's keys, full screen and stale boards:** Task 4's unit and e2e tests; the look above checks the run's own presenter.

Notes: <a line each for:
- the presenter: which chapters drew what, the steps and notes, its JSON size and the pack's;
- what v2 changed on each flagged item;
- the catch-up line, and which Plan changes option Claude recommended;
- the finalizer's pack size and the files it read;
- how Present looked with the real presenter in the screenshots, and anything that drew badly;
- anything surprising, and any fix made;

then the user log's new lines, with `$TMPDIR` shortened>
```

- [ ] **Step 10: Commit**

```bash
git add scripts smoke README.md docs/how-it-works.md SPEC.md packages/web/e2e/present.spec.ts
git commit -m "test: real Claude Code smoke for Present, and docs for Plan 7" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The controller pushes the branch after the final review, as in Plans 1–6.

---

## Not in this plan

These come later, or stay deferred with a reason.

- **Phase 2 (SPEC §18):**
  - **Defend the code:** the defense run against a branch's real diff (`basedOn.kind: 'code'`).
  - **Screenshots** of the running app for Before mockups.
  - **Git history** for the projects folder.
- **Present extras:**
  - Asking Claude about a step.
  - Drawing user flows (storyboards), mockups or phases on the board.
  - A handwriting font. The user chose clean type.
  - Exporting the presenter in the `.md`.
  - Presenting from a phone held upright beyond the "turn sideways" hint.
- **Writing the defense in the background**, so the only window stays free. It's still in the foreground, and the presenter makes it a little longer.
- **The whiteboard pack mid-import, and when its hash is taken** (Plan 6's follow-up).
- **Plan 6's small leftovers:**
  - a shared route `parse`/`write` helper;
  - Export's untested put-back branch;
  - a failed Generate's lingering error;
  - the rating chips' focus ring;
  - `previous` entries cut at 300 characters;
  - the smoke's skipped "asking didn't make it out of date" check.
- **The listening window starting the catch-up by itself.** When a catch-up, or a cut-short re-import, has to wait for Claude, `/dev-plumbing` says so, and the user runs it again once Claude has answered. The window's `dp_wait` could hand it over by itself once nothing is with Claude, so no second `/dev-plumbing` is needed. Worth it if running `/dev-plumbing` twice proves annoying.
- **A catch-up that's due when the user brings in v<n+1> first** never runs. v<n+1>'s re-import brings the plan's changes, not what settling v<n>'s Plan changes did to the draft, so items those touched may not catch up.
- **Plan 5's remaining minors:**
  - Plan changes' empty message is never shown;
  - a version doesn't record a dirty clone;
  - a second window opening a re-importing project starts duplicate importers.
- **Plan 4's open follow-ups** (`.superpowers/plan-4-followups.md`) and **Plans 1–3's remaining minors.**
