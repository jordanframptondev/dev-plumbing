# Plan 3: Visual Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the plan. By the end:
- **Architecture** shows each diagram as boxes and lines, laid out with ELK. Boxes are grouped by app or package, with new/changed/unchanged/external marks, ✓ on checked file references, and thread bubbles.
- **Database** shows a relationship strip, a migration panel and one diff card per table, with a **Visual / Prisma** toggle and checks against the repo's Prisma schema.
- **UI changes** shows one large mockup built with your app's own design kit, with **Desktop / Mobile** and **Before / After** toggles and **+ Pin** to start a thread on any element.
- **Flows** shows user flows as storyboards, system flows as sequence diagrams, or both, with matching step numbers.
- **Phases & milestones** gains a timeline strip.
- **The thread view** draws the item it's about, and shows what a proposed change does to the drawing.

**Architecture:** One data model, three layers:
- **Core** (`packages/core`) defines each screen's data shape once, in `schemas/data.ts`. It checks every write against that shape: importer batches, Claude's new items, and every change that patches an item's `data`. It also turns the shape into the text the subagents read. Read-time checks (✓ on diagram boxes, tables against the Prisma schema) are computed from the plan's clone and never stored.
- **The service** (`packages/service`) serves each mockup as its own sandboxed HTML document. It inlines the app's kit CSS from the clone, adds a locally served Tailwind compiler and a small pin script, and locks the document down with a strict Content-Security-Policy.
- **The web app** (`packages/web`) lays diagrams out with ELK (`elkjs`, loaded only on diagram screens) and draws them as SVG in the Ink wash style. It draws sequences with its own lane-and-row layout, and shows mockups in `sandbox="allow-scripts"` iframes that talk to the app only through `postMessage`.

**Tech Stack:** Plans 1 and 2's stack (TypeScript 5.9, Node 22, pnpm 10, Zod 3.25, Hono 4, React 19, Vite 7, Tailwind 4, TanStack Router and Query, Vitest 3, Playwright, `@modelcontextprotocol/sdk` 1.31, `diff` 9), plus `elkjs` 0.11 (web) and `@tailwindcss/browser` 4 (service).

**Spec:** `SPEC.md` (repo root). Read §6.3, §7, §10.2–§10.4, §13.1, §14, §16 and §18 step 4 before starting. `docs/how-it-works.md` explains how the plugin, the service and the app fit together.

## What Plans 1 and 2 left in place

Plan 2 is merged on `main`. This plan builds on:
- **The loop:**
  - importers write items through `dp_write_items` (`core/src/store/importItems.ts`);
  - thread subagents reply through `dp_reply` (`core/src/store/reply.ts`);
  - options and small edits are `Change`s: `md` patches plus `items: [{ itemId, patch }]`;
  - `patch.data` replaces an item's `data` wholesale, and `history/` keeps `itemsBefore` and `itemsAfter`, so Undo already works for data patches (`core/src/store/changes.ts`).
- **Data already being written.** Importers already write `data` for diagram, database, mockups and flows items, in §13.1's shapes (`plugin/agents/importer.md`, "Data shapes"). Until now nothing checks it (`data: z.unknown()`), and the app shows non-list items as plain rows (`web/src/pages/TypeView.tsx`) with "The diagram view arrives in a later update." (`web/src/pages/ItemCard.tsx`).
- **Existing data is good data.** Real projects made with Plan 2 hold up to 19 boxes per diagram, 11 tables, 6 flows and 12 UI items, and every one matches the shapes below. UI items have `location` and `kit` but no mockup markup yet, and Phases items have no `data`. Both must keep loading.
- **Repo profiles** (`core/src/schemas/repoProfile.ts`) already have `schema: { type: 'prisma' | 'sql' | 'other', path }` and `apps: [{ name, path, kitFiles }]`.
  - Real kit files are Tailwind v4 source (`@import "tailwindcss"`, `@theme`, `@layer`), which a browser can't use as-is. That's why mockups compile Tailwind inside the frame.
- **The service guard** (`service/src/security.ts`) lets `/api/*` through only with the token, or for a same-origin browser request.
  - A sandboxed iframe has an opaque origin, so anything the mockup document needs is either inlined or served outside `/api/`.

## Facts this plan relies on

- **`elkjs`** ships `elkjs/lib/elk.bundled.js`, which runs ELK without a web worker, in the browser and in Node, so the layout tests can run it in Vitest.
  - Use `layered` with `elk.hierarchyHandling: INCLUDE_CHILDREN` to route edges across group boxes.
  - Use `elk.edgeRouting: ORTHOGONAL` for right-angled lines.
- **`@tailwindcss/browser`** is Tailwind v4's in-browser compiler.
  - One `<script>` tag loads it.
  - It compiles every `<style type="text/tailwindcss">` in the page, including `@theme` blocks, and generates the utility classes the markup uses.
  - It already includes `tailwindcss` itself, so a kit's own `@import "tailwindcss"` line must be removed. `@plugin`, `@source`, `@config` and `@reference` don't work in the browser and are removed too.
  - The script is served from this machine, never a CDN.
- **A sandboxed iframe** (`sandbox="allow-scripts"`, without `allow-same-origin`):
  - runs scripts with an opaque origin, so it can't read the app's cookies or call the app's API;
  - talks to the page only with `postMessage(message, '*')`. The page checks `event.source === iframe.contentWindow`.
- **A CSP nonce** on an external `<script src>` lets that one script load under `script-src 'nonce-…'`. Inline event handlers (`onclick="…"`) and scripts in Claude's markup never run.

## Decisions this plan makes

Review these. Each one is the plan's reading of the spec where the spec leaves room.

1. **Mockup markup lives in the item, not in `mockups/*.html`.**
   - `data.after` and `data.before` hold the body markup itself. Spec §7 puts it in separate files, but keeping it in the item means:
     - Claude can revise a mockup with an ordinary item patch;
     - accepting, Undo, history and validation all work unchanged;
     - one write can't leave a mockup and its item out of step.
   - Finalize (Plan 4) writes `<name>.assets/` from the items when it copies the final into the repo.
2. **Mockups use your app's real kit, compiled in the frame.**
   - The service reads the kit files named in the repo profile (`apps[].kitFiles`) from the plan's clone, and inlines relative `@import`s.
   - It drops what the browser can't use, and the frame compiles the rest with a locally served Tailwind.
   - A kit that isn't Tailwind works as plain CSS.
   - Kit problems never block the mockup. They show as lines in the toolbar, such as `Kit: skipped @import "@acme/ui/theme.css".`
3. **Pins and "Ask about this box" create a new item.**
   - Clicking an element in a mockup, a box in a diagram or a step in a flow starts a new item of the same plumbing type. It records an `anchor` (`{ itemId, kind: 'element' | 'node' | 'step', ref, label, side? }`), links to the item it's about, and its thread starts with your message, sent straight away (like **+ Question**).
   - The screen draws pins and bubbles from those anchors. Nothing is written into the parent item, so a pin can never fight a Claude revision of the drawing.
4. **Data is strict on write, forgiving on read.**
   - Every write that sets `data` is checked against its plumbing type's shape. That covers importer batches, Claude's new items, and option and small-edit patches. The checks include cross-references:
     - every edge's ends are boxes;
     - every step's lanes exist;
     - every phase's items exist;
     - a step's `mockupId` is a UI item;
     - mockup markup has no scripts and no `<meta>` tags.
   - A bad write is refused as a whole, with every problem listed, as in Plan 2.
   - Reading never refuses.
     - An item whose data can't be drawn shows "This item's drawing couldn't be shown", the reasons and its raw data, and the rest of the screen still draws.
     - Saved mockup markup that fails the checks is still shown, with its problems listed beside it. The frame's CSP is the guard.
5. **Checks against the code happen when you look, not when Claude writes.**
   - The service checks diagram boxes' file references, and database tables against the profile's Prisma schema, each time a screen or thread loads, using the plan's clone.
   - Results are returned beside the data and never stored, so they're never stale and never mixed into Claude's data.
   - A missing clone or schema file shows "Not checked" with the reason.
6. **Flows and Phases import last.**
   - `dp_open` marks types whose screen is `flows`, or that have `timeline: true`, with `afterOthers: true`, and the skill starts those importers after the others have returned.
   - That lets a flow step point at a UI item's mockup (`mockupId`), and a phase list its items (`itemIds`).
7. **Small additions to the §13.1 shapes, all optional, so existing data stays valid:**
   - a field's `default` on database diff cards;
   - a `rollback` migration kind, so the migration panel can say how to roll back;
   - `after` and `before` markup on mockups;
   - a step's `mockupId`.
8. **One description of each shape.** `dataShapeDoc(kind)` in core turns each shape into the text the importer and thread subagents get in their context pack (`type.dataShape`). The agent files point at it instead of repeating it, so the docs can't drift from the checks.
9. **Two follow-ups from Plan 2 come along, because they touch the same code:**
   - A type whose importer didn't finish says so ("Didn't finish"), instead of "No changes".
   - `dp_wait` sends only the decisions that touch the submission's threads, plus the total count, instead of every decision every time.

## Global Constraints

Everything in Plans 1 and 2's Global Constraints still applies:
- Node `>=22.12`, pnpm `10.x`, TypeScript `strict`, ESM.
- The public repo stays generic: examples use the made-up "Acme" app, with no real company names, paths or emails.
- `~/.dev-plumbing/`, overridable with `DEV_PLUMBING_HOME`. Never overwrite a user's config file except through an explicit **Reset to default**.
- Atomic writes. The service is the only writer of the projects folder, always under the project's lock.
- Your repo's plan and code are only ever read.
- Subagents get only `Read`, `Grep`, `Glob` and their dp tools.
- The service binds `127.0.0.1` with the Host, token and same-origin guard.
- The Ink wash theme exactly per §16:
  - colour only as dots, text, thin lines and small markers;
  - no tinted boxes or fills;
  - Tailwind's default palette is off in the app;
  - one primary button per screen;
  - sentence-case copy;
  - one column under 768 px, with no sideways page scrolling.
- Tests clean up their temp folders (`tempDir` and `removeTempDirs` from `testkit/tmp.ts`). Tests never touch the real `~/.dev-plumbing`, never run the real `launchctl`, and never install Claude Code plugins.
- Every commit ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, passed as a second `-m`.

New in this plan:
- **Every visual data shape is defined once, in `packages/core/src/schemas/data.ts`.** Everything else imports from there: write checks, read parsing, agent docs and web types.
- **Existing projects keep loading.** No migration step. Every new field is optional, and reading never throws on old or odd data.
- **Mockup frames:**
  - always `sandbox="allow-scripts"`, never `allow-same-origin`;
  - the document's CSP is exactly `default-src 'none'; script-src 'nonce-<n>'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;
  - kit files are read only from inside the plan's clone, only `.css`, at most 1 MB in total.
- **No network at runtime.** The Tailwind compiler comes from the service's own `node_modules`, at `/kit/tailwind.js`.
- **ELK loads only on screens that draw diagrams** (dynamic `import()`), so the rest of the app doesn't pay for it.
- **Colours on drawings (§16):**
  - box new / changed / unchanged / external: `moss` / `amber` / `mist` / dashed `mist` outline;
  - lines: `text-3`;
  - added / removed: `moss` / `seal`, with `+` and `−`;
  - drawings use only the CSS variables in `web/src/theme/tokens.css` (`var(--moss)` and so on), so dark mode works without extra code.
- **Phones:**
  - diagrams and sequences fit the width (SVG `viewBox`, `width: 100%`) and allow pinch zoom (`touch-action: pinch-zoom`);
  - diff cards stack;
  - mockups scale to the width;
  - nothing scrolls sideways.
- **Exact copy, used verbatim:**
  - "No changes"
  - "Didn't finish"
  - "The importer didn't finish for this plumbing type."
  - "Ask about this box"
  - "Ask about this step"
  - "+ Pin"
  - "Click the part of the mockup you want to ask about."
  - "No mockup yet."
  - "Ask Claude for a mockup"
  - "Desktop" / "Mobile"
  - "Before" / "After"
  - "Visual" / "Prisma"
  - "Storyboard" / "Sequence"
  - "Not checked"
  - "This item's drawing couldn't be shown"
  - "Not in this version"
  - "Additive only"
  - "Additive, with a backfill"
  - "Destructive"
  - "Data risk"
  - "No rollback described"
  - "Checked against <file>"
  - "View proposed"
  - "Open in UI changes"
  - "What changes if you accept" (unchanged from Plan 2)

## Review Focus

These five situations aren't the main path, but they're the most likely to hurt someone using this. Each has a test in the task named.

1. **Projects made before this plan, or data that doesn't fit.**
   - An item whose `data` is missing, from an old shape, or simply wrong must not blank or crash its screen. That item shows "This item's drawing couldn't be shown" with the reasons, and every other item still draws.
   - Tested in Task 11 ("a diagram that can't be drawn doesn't hide the others") and Task 13 ("a UI item without markup offers Ask Claude for a mockup").
2. **A kit path or mockup markup that tries to escape.**
   - A repo profile's `kitFiles` entry that points outside the clone, or isn't a `.css` file, is never read.
   - Markup with a `<script>` is refused on write.
   - Even markup that gets past that (inline `onclick`, `<img src="https://…">`) can't run code, load anything, or reach the app's API.
   - Tested in Task 8 ("kit files outside the clone are never read" and "the document's CSP blocks everything but our two scripts") and Task 13 ("markup can't run script in the frame").
3. **A big diagram on a phone.**
   - A 20-box diagram at 375 px fits the width with no sideways page scroll, and tapping a box still opens its panel.
   - Tested in Task 11 ("a 20-box diagram fits a phone").
4. **Claude revising a drawing badly.**
   - Any of these patches is refused as a whole, nothing is half-written, and the message says what to fix:
     - an edge to a box that isn't there;
     - a step on a lane that doesn't exist;
     - a phase listing an item that doesn't exist;
     - mockup markup with a script.
   - Tested in Task 2 ("a reply whose data patch breaks a reference writes nothing").
5. **Pins after the mockup is redrawn.**
   - A pin whose element isn't in the new markup is still listed, marked "Not in this version", and still opens its thread.
   - Tested in Task 13 ("a pin survives a redrawn mockup").

---

## File Structure

```
dev-plumbing/
  defaults/plumbing/ui.md flows.md phases.md database.md   # Task 5: rules mention mockup markup, rollback, phase data
  plugin/skills/dev-plumbing/SKILL.md                      # Task 5: import in two waves; relevant decisions
  plugin/agents/importer.md thread.md                      # Task 5: data follows type.dataShape
  packages/
    core/src/
      schemas/data.ts           # Task 1: shapes, parseData, dataProblems, dataShapeDoc, anchors
      schemas/project.ts        # Task 1: itemSchema gains anchor
      schemas/views.ts          # Tasks 3, 4, 6, 8: DataChecks, TypeEntry.timeline/importFailed, TypeItemRow + ThreadDetail carry data,
                                #   MockupKitInfo (Task 15 fills TypeItemRow.itemRefs without changing this file)
      store/validate.ts         # Task 2: changeDataProblems
      store/importItems.ts      # Task 2: data checked in batches
      store/reply.ts            # Task 2: data checked in replies
      prisma.ts                 # Task 3: a small Prisma schema reader
      store/checks.ts           # Task 3: createDataChecker
      store/context.ts          # Task 4: dataShape and timeline in packs, kitFiles in the profile
      store/decisions.ts        # Task 4: relevantDecisions
      store/projects.ts         # Tasks 4, 6, 15: loadTypeItems carries data and checks; importFailed; phases' itemRefs
      store/detail.ts           # Task 6: loadThreadDetail carries checks and the anchor's parent
      dataDiff.ts               # Task 6: what a data patch changes, in words
      docDiff.ts                # Task 6: previews show data summaries
      store/threads.ts          # Task 7: addOwnItem takes an anchor
      kit.ts                    # Task 8: buildKitCss
      demo.ts                   # Task 9: demo items gain drawings
    service/src/
      routes/claude.ts          # Tasks 2, 4: /items passes every type for data checks; afterOthers, relevant decisions
      routes/projects.ts        # Task 6: checks on type screens
      routes/threads.ts         # Tasks 6, 7: checks on threads; POST items takes an anchor
      checker.ts                # Task 6: cloneOf, checkerFor
      routes/mockups.ts         # Task 8: saved and proposed mockup documents, mockup-kit, GET /kit/tailwind.js
      mockup.ts                 # Task 8: the mockup document, its CSP and the pin script
      security.ts               # Task 8: frameHeaders keeps a route's own CSP
    web/src/
      api/client.ts             # Tasks 7, 8, 13: addItem takes an anchor; mockupUrl, mockupKit; proposalMockupUrl
      router.tsx                # Task 9: the type route takes ?item=
      diagram/layout.ts         # Task 10: DiagramData -> ELK -> positions
      diagram/DiagramView.tsx   # Task 10: SVG boxes, groups, lines, bubbles, legend
      diagram/SequenceView.tsx  # Task 14: lanes and numbered steps
      components/MockupFrame.tsx   # Task 13: sandboxed frame, size, pins, pin mode
      components/Segmented.tsx     # Task 13: an option can be disabled
      components/AnswerForm.tsx    # Task 16: data previews
      pages/TypeView.tsx             # Task 9: loading, failed import, no changes; list or visual screen
      pages/ProjectNav.tsx           # Task 9: "Didn't finish"
      pages/ListScreen.tsx           # Task 15: the timeline strip, phase details, the picked row
      pages/ItemCard.tsx             # Task 16: the drawing, and the "On" row
      pages/visual/VisualScreen.tsx  # Task 9: the type's title and count, and picks the screen (Tasks 11–14 add theirs)
      pages/visual/AnchorForm.tsx    # Task 9: ask about a box, element or step
      pages/visual/OtherItems.tsx    # Task 9: items with nothing to draw
      pages/visual/DataProblem.tsx   # Task 9: "This item's drawing couldn't be shown"
      pages/visual/testkit.tsx       # Task 9: row builder and router mock for component tests
      pages/visual/rows.ts           # Task 11: splitting rows, tones, anchors and bubbles, shared by the screens
      pages/visual/DiagramScreen.tsx  # Task 11
      pages/visual/DatabaseScreen.tsx # Task 12
      pages/visual/MockupsScreen.tsx  # Task 13
      pages/visual/FlowsScreen.tsx    # Task 14
      pages/visual/TimelineStrip.tsx  # Task 15
      pages/visual/ItemDataView.tsx   # Task 16: the item, drawn, in the thread view
    web/e2e/
      global-setup.ts           # Task 9: the fixture repo gains a Prisma schema and a Tailwind kit
      claude.ts                 # Task 9: TestItem gains body, codeRefs and data; rawItem, writeRawData
      visual.spec.ts            # Task 9: a type whose importer didn't finish
      diagram.spec.ts database.spec.ts mockups.spec.ts flows.spec.ts phases.spec.ts visual-thread.spec.ts
  scripts/smoke-claude.sh smoke-user.mjs smoke-plan.md     # Task 17: the smoke test covers the visual types
  smoke/RESULTS.md              # Task 17
```

## Contracts

The exact names and types tasks share. A task's implementer sees only their own task, so every cross-task name is fixed here. Each task's **Interfaces** block repeats what it consumes and produces.

### Core: `packages/core/src/schemas/data.ts` (Task 1, exported from `@dev-plumbing/core/schemas`)

```ts
export const nodeStatusValues = ['new', 'changed', 'unchanged', 'external'] as const;
export type NodeStatus = (typeof nodeStatusValues)[number];
export const migrationKindValues = ['additive', 'backfill', 'destructive', 'data-risk', 'rollback'] as const;
export const MOCKUP_MAX_CHARS = 100_000;

// Typed z.ZodType<T, z.ZodTypeDef, unknown>: defaults (groups, edges, files, itemIds) make the input differ from T.
// Objects aren't .strict(): unknown keys are dropped on parse, so older data never fails over an extra key.
export const diagramDataSchema: z.ZodType<DiagramData, z.ZodTypeDef, unknown>;  // §13.1 DiagramData
export const tableDiffSchema: z.ZodType<TableDiff, z.ZodTypeDef, unknown>;      // §13.1 TableDiff + field.default + 'rollback'
export const mockupDataSchema: z.ZodType<MockupData, z.ZodTypeDef, unknown>;    // { location: { app, route?, files }, kit, after?, before? }
export const flowDataSchema: z.ZodType<FlowData, z.ZodTypeDef, unknown>;        // §13.1 Flow + step.mockupId
export const phaseDataSchema: z.ZodType<PhaseData, z.ZodTypeDef, unknown>;      // { order, goal, doneWhen, itemIds }
// Also exported: diagramKindValues, edgeStyleValues, tableChangeValues, fieldChangeValues, flowKindValues,
// and DataContext = { itemIds?: Set<string>; mockupItemIds?: Set<string> }.

export type DiagramData = {
  kind: 'system' | 'data_flow';
  groups: { id: string; label: string }[];
  nodes: { id: string; label: string; group?: string; status: NodeStatus; codeRef?: { path: string; symbol?: string }; itemId?: string }[];
  edges: { id: string; from: string; to: string; label?: string; style?: 'solid' | 'dashed' }[];
};
export type TableDiff = {
  model: string;
  change: 'new' | 'changed' | 'removed';
  fields: { name: string; type: string; change: 'added' | 'changed' | 'removed' | 'unchanged'; default?: string; note?: string }[];
  schemaDiff: string;
  migration?: { kind: (typeof migrationKindValues)[number]; text: string }[];
};
export type MockupData = { location: { app: string; route?: string; files: string[] }; kit: string; after?: string; before?: string };
export type FlowData = {
  kind: 'user' | 'system' | 'both';
  lanes?: { id: string; label: string; status: NodeStatus }[];
  steps: { n: number; from?: string; to?: string; label: string; mockupId?: string; systemNote?: string }[];
};
export type PhaseData = { order: number; goal: string; doneWhen: string[]; itemIds: string[] };

export type DataKind = 'diagram' | 'database' | 'mockups' | 'flows' | 'timeline';
export type VisualData = { diagram: DiagramData; database: TableDiff; mockups: MockupData; flows: FlowData; timeline: PhaseData };
/** Which data a plumbing type's items carry: its screen, or 'timeline' for a list with timeline: true; null for plain lists. */
export function dataKindOf(type: { screen: Screen; timeline?: boolean }): DataKind | null;
/** Shape plus cross-references (edge ends are nodes, step lanes exist, unique ids and step numbers, markup rules). */
export function parseData<K extends DataKind>(kind: K, data: unknown): { ok: true; data: VisualData[K] } | { ok: false; problems: string[] };
/** Problems with data a subagent wants to write. kind null with data present is a problem; data undefined is fine.
 *  ctx.itemIds: every item id that will exist (phase itemIds must be among them).
 *  ctx.mockupItemIds: ids of items whose type's screen is mockups (step mockupId must be among them). */
export function dataProblems(kind: DataKind | null, data: unknown, ctx?: { itemIds?: Set<string>; mockupItemIds?: Set<string> }): string[];
/** The text subagents follow when writing data of this kind (shape, rules, an example). */
export function dataShapeDoc(kind: DataKind): string;

export const anchorKindValues = ['node', 'element', 'step'] as const;
export const anchorSchema: z.ZodType<Anchor>;
export type Anchor = { itemId: string; kind: (typeof anchorKindValues)[number]; ref: string; label: string; side?: 'after' | 'before' };
/** The anchor kind each data kind accepts: diagram->node, mockups->element, flows->step; others none. */
export function anchorKindFor(kind: DataKind | null): Anchor['kind'] | null;
```

`schemas/project.ts` `itemSchema` gains `anchor: anchorSchema.optional().catch(undefined)`, so a malformed anchor never hides an item.

### Core: checks (Task 3, exported from `@dev-plumbing/core`)

```ts
// packages/core/src/prisma.ts
export type PrismaSchema = { models: Map<string, Map<string, string>>; enums: Set<string> }; // model -> field name -> type as written ('String?', 'Order[]')
export function parsePrismaSchema(text: string): PrismaSchema;

// packages/core/src/schemas/views.ts (type only, so the web can use it)
export type DataChecks =
  | { kind: 'diagram'; checked: true; nodes: Record<string, boolean> }   // node id -> file reference found; only nodes with a codeRef
  | { kind: 'diagram'; checked: false; reason: string; nodes: Record<string, never> }   // no clone: "Not checked"
  | { kind: 'database'; checked: true; file: string; warnings: string[] }
  | { kind: 'database'; checked: false; reason: string; warnings: [] };

// packages/core/src/store/checks.ts
export type DataChecker = { check(kind: DataKind | null, data: unknown): Promise<DataChecks | null> };
/** clone: the plan's clone (project.source.clone), or null if it's gone. Reads the schema file at most once. */
export function createDataChecker(o: { clone: string | null; profile: RepoProfile | undefined }): DataChecker;
```

Exact `reason` strings:
- "No schema file is set in the repo profile."
- "The repo profile's schema isn't Prisma, so it isn't checked."
- "The plan's clone isn't on this Mac any more."
- "The schema file isn't in the clone: <path>."

### Core: views (Tasks 4 and 6, `schemas/views.ts`)

```ts
// TypeEntry gains:
timeline: boolean;
importFailed: boolean;               // noChanges.reason === IMPORT_DID_NOT_FINISH

// TypeItemRow gains:
data: unknown;                       // raw; null when the item has none
body: string | null;
links: string[];
anchor: Anchor | null;
createdBy: 'import' | 'claude' | 'you' | 'whiteboard';
checks: DataChecks | null;
itemRefs: Record<string, { title: string; threadId: string; typeTitle: string }>;   // Task 6 sets {}; Task 15 fills it for timeline types (the items in data.itemIds)

// New:
export type MockupKitInfo = { app: string | null; files: string[]; warnings: string[] };   // Task 8

// ThreadDetail gains:
checks: DataChecks | null;
anchorParent: { itemId: string; threadId: string; title: string; typeId: string } | null;
// ThreadDetail.type gains: timeline: boolean

// ChangePreview items gain:
data?: { kind: DataKind; summary: string[]; after: unknown };
```

`loadTypeItems(ref, types, typeId, opts?: { checker?: DataChecker })`. Rows keep sorting by title, except `timeline` types, which sort by `data.order` when it parses (items without valid phase data come after, by title).

`loadThreadDetail(o: { dir; threadId; types; checker?: DataChecker })`.

`previewChange(draft, items, change, kindOf?: (item: Item) => DataKind | null)`.

```ts
// packages/core/src/dataDiff.ts (Task 6)
/** What a data patch changes, as short phrases ("2 boxes added", "field status changed", "After mockup redrawn"). */
export function dataChangeSummary(kind: DataKind, before: unknown, after: unknown): string[];
```

### Core: anchors, decisions, packs, kit (Tasks 4, 7 and 8)

```ts
// store/threads.ts (Task 7)
addOwnItem(dir, o: { type: PlumbingType; title: string; text: string; fields?: Record<string, string>; anchor?: Anchor; now?: Date })
// With an anchor: the anchored item must exist and be of the same type (the service passes the parent's type),
// anchor.kind must equal anchorKindFor(dataKindOf(type)), and the new item links to anchor.itemId.

// store/decisions.ts (Task 4)
export async function relevantDecisions(dir: string, threadIds: string[]): Promise<{ decisions: string[]; total: number }>;
// Active decisions whose itemIds include one of these threads' items or those items' linked items, or that came from one of these threads.

// store/context.ts (Task 4)
// ImportPack.type gains: timeline: boolean; dataShape: string | null   (dataShapeDoc(kind) or null)
// ImportPack.profile.apps entries gain: kitFiles: string[]
// ThreadPack.type gains: screen: Screen; timeline: boolean; dataShape: string | null
// ThreadPack gains: anchored: Item | null   (the whole anchored item, with its data, when item.anchor is set)

// kit.ts (Task 8)
export async function buildKitCss(o: { clone: string; files: string[] }): Promise<{ css: string; warnings: string[] }>;
```

### Service (Tasks 4, 6, 7 and 8)

```ts
// packages/service/src/checker.ts (Task 6)
export async function cloneOf(ctx: AppContext, ref: ProjectRef): Promise<string | null>;   // project.source.clone, home-expanded; null when it isn't a folder
export async function checkerFor(ctx: AppContext, cfg: LoadedConfig, ref: ProjectRef): Promise<DataChecker>;
// packages/service/src/mockup.ts (Task 8): mockupCsp(nonce), PIN_SCRIPT, mockupDocument({ body, kitCss, nonce, title }), kitFor({ ctx, cfg, ref, data })
```

- **`POST /api/claude/open`:** each `importTypes` entry is `{ id, title, afterOthers?: true }`, with every `afterOthers` entry listed last.
- **`dp_wait` submission result:** `decisions` (relevant ones) plus `decisionCount: number`.
- **`GET /api/projects/:repo/:id/types/:type`:** rows carry `checks`. The checker is created from `project.source.clone` (or `null` when it isn't a folder any more) and `cfg.repos.find((p) => p.name === ref.repo)`.
- **`GET /api/projects/:repo/:id/threads/:thread`:** `checks` and `anchorParent`.
- **`POST /api/projects/:repo/:id/items`:** the body gains `anchor?: Anchor`. With an anchor, the new item's type is the anchored item's type, and `body.type` must match it.
- **`GET /api/projects/:repo/:id/items/:itemId/mockup/:side`** (`side` is `after` | `before`): `text/html`, the full mockup document with its own CSP. Returns 404 with `{ error }` when the item isn't a mockups item or has no markup for that side.
- **`GET /api/projects/:repo/:id/threads/:thread/options/:optionId/mockup/:side`:** the same document for markup an open option proposes, so you can see a mockup before accepting it.
  - It uses the option's `change.items` patch for a mockups item, preferring the thread's own item.
  - The proposed data must pass `parseData('mockups', …)`; otherwise it returns 404.
- **`GET /api/projects/:repo/:id/items/:itemId/mockup-kit`:** `MockupKitInfo`. The app shows its warnings in the toolbar.
- **`GET /kit/tailwind.js`:** the `@tailwindcss/browser` build, `text/javascript`, `Cache-Control: public, max-age=86400`. It sits outside `/api/`, so the sandboxed frame can load it.

The mockup document:

```html
<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script nonce="N" src="/kit/tailwind.js"></script>
<style type="text/tailwindcss">@import "tailwindcss";
/* kit CSS from buildKitCss */</style>
</head><body>
<!-- the item's after or before markup -->
<script nonce="N">/* PIN_SCRIPT */</script>
</body></html>
```

### Web (Tasks 9–16)

```ts
// web/src/api/client.ts
api.addItem(repo, id, body: { type: string; title: string; text: string; fields?: Record<string, string>; anchor?: Anchor })
export const mockupUrl = (repo: string, id: string, itemId: string, side: 'after' | 'before') => string;
api.mockupKit(repo, id, itemId): Promise<MockupKitInfo>   // Task 8

// web/src/router.tsx: the type route takes search { item?: string } (validateSearch), used to open one item (a diagram, a UI screen, a flow).

// web/src/diagram/layout.ts (Task 10)
export type Direction = 'RIGHT' | 'DOWN';
export type DiagramLayout = {
  width: number; height: number;
  groups: { id: string; label: string; x: number; y: number; w: number; h: number }[];
  nodes: { id: string; label: string; status: NodeStatus; path: string | null; x: number; y: number; w: number; h: number }[];
  edges: { id: string; points: { x: number; y: number }[]; label: string | null; labelX: number; labelY: number; dashed: boolean }[];
};
export function toElkGraph(data: DiagramData, direction: Direction): ElkNode;   // pure
export function fromElk(graph: ElkNode, data: DiagramData): DiagramLayout;       // pure, absolute coordinates
export function layoutDiagram(data: DiagramData, direction: Direction): Promise<DiagramLayout>; // lazy-loads elkjs

// web/src/diagram/DiagramView.tsx (Task 10)
export type Tone = 'seal' | 'slate' | 'moss' | 'mist';   // StatusMark colours: your turn, draft/with Claude, resolved, parked
export function DiagramView(p: {
  data: DiagramData;
  checks?: Record<string, boolean>;                      // DataChecks.nodes, only when checks.kind === 'diagram' && checks.checked
  bubbles?: Record<string, { count: number; tone: Tone }>;
  selected?: string | null;
  onSelect?: (nodeId: string) => void;
  compact?: boolean;                                      // no bubbles, no selection, smaller type
  legend?: boolean;                                       // default false: a line of status swatches under the drawing (Task 11 turns it on)
}): JSX.Element;
// Renders <figure data-testid="diagram"> with one <g data-testid="diagram-node" data-node={id} data-status={status}> per box
// (role="button" and aria-label `${label}, ${status}` when onSelect is given), and one <path data-testid="diagram-edge"> per line.

// web/src/diagram/SequenceView.tsx (Task 14)
export function SequenceView(p: { flow: FlowData; selected?: number | null; onSelect?: (n: number) => void; bubbles?: Record<number, { count: number; tone: Tone }> }): JSX.Element;
// <figure data-testid="sequence">, one <g data-testid="sequence-step" data-step={n}> per step.

// web/src/components/MockupFrame.tsx (Task 13)
export type FramePin = { id: string; selector: string; n: number; tone: Tone };
export function MockupFrame(p: {
  repo: string; project: string; itemId: string; side: 'after' | 'before';
  device: 'desktop' | 'mobile';             // desktop renders 1280 px wide, mobile 390 px, both scaled to fit the container
  pins?: FramePin[];
  pinMode?: boolean;
  onPicked?: (pick: { selector: string; text: string }) => void;
  onOpenPin?: (id: string) => void;
  onMissingPins?: (ids: string[]) => void;
  thumbnail?: boolean;                      // small, not interactive, loads when scrolled into view
  proposal?: { threadId: string; optionId: string };   // load an open option's proposed markup instead (pins ignored)
}): JSX.Element;
// <iframe data-testid="mockup-frame" sandbox="allow-scripts" title="… mockup">
export const proposalMockupUrl = (repo: string, id: string, threadId: string, optionId: string, side: 'after' | 'before') => string;  // Task 13

// web/src/pages/visual/VisualScreen.tsx (Task 9)
export type ScreenProps = { repo: string; project: string; data: { type: TypeEntry; items: TypeItemRow[] }; item?: string };
// VisualScreen renders the type's h2 title and item count; each XScreen(p: ScreenProps) adds its case to the ScreenBody switch.

// web/src/pages/visual/rows.ts (Task 11): shared by the Architecture, UI changes and Flows screens
export function splitRows<K extends DataKind>(kind: K, rows: TypeItemRow[]): ScreenRows<K>;   // shown (parsed, or with problems) / anchored / other
export function toneOf(statuses: DisplayStatus[]): Tone;                                       // the most urgent status's tone
export function anchorsOn(anchored: TypeItemRow[], itemId: string, kind: 'node' | 'element' | 'step'): Map<string, TypeItemRow[]>;
export function bubblesFrom(byRef: Map<string, TypeItemRow[]>): Record<string, { count: number; tone: Tone }>;

// web/src/pages/visual/testkit.tsx (Task 9): row() and routerMock() for component tests

// web/src/pages/visual/AnchorForm.tsx (Task 9)
export function AnchorForm(p: { repo: string; project: string; type: string; anchor: Anchor; onDone: () => void }): JSX.Element;
// Title (starts as `About ${anchor.label}`), Your message, "Add and send" (secondary), Cancel; on success navigates to the new thread.

// web/src/pages/visual/DataProblem.tsx (Task 9)
export function DataProblem(p: { title?: string; problems: string[]; data: unknown; threadId?: string; repo: string; project: string }): JSX.Element;
// No title -> no heading; no threadId -> no thread link (the thread view uses it that way).

// web/src/pages/visual/OtherItems.tsx (Task 9)
export function OtherItems(p: { rows: TypeItemRow[]; repo: string; project: string; title?: string }): JSX.Element;

// web/src/pages/visual/DatabaseScreen.tsx (Task 12)
export function TableCard(p: { data: TableDiff; checks: DataChecks | null; row?: TypeItemRow; repo: string; project: string }): JSX.Element;
// With row: title, StatusMark and "Open thread"; the thread view leaves it out.

// web/src/pages/visual/FlowsScreen.tsx (Task 14)
export function FlowView(p: { flow: FlowData; repo: string; project: string; selected?: number | null; onSelect?: (n: number) => void; bubbles?: Record<number, { count: number; tone: Tone }> }): JSX.Element;
export type MockupRef = { typeId: string; title: string; threadId: string; hasAfter: boolean };
export function useMockupItems(repo: string, project: string): Map<string, MockupRef>;

// web/src/pages/visual/TimelineStrip.tsx (Task 15)
export function TimelineStrip(p: { rows: TypeItemRow[]; selected: string | null; onSelect: (itemId: string) => void }): JSX.Element;

// web/src/pages/visual/ItemDataView.tsx (Task 16)
export function ItemDataView(p: { kind: DataKind; data: unknown; checks: DataChecks | null; repo: string; project: string; itemId: string; compact?: boolean; proposal?: { threadId: string; optionId: string } }): JSX.Element;
```

**The mockup frame messages** (Task 8 writes the frame side in `PIN_SCRIPT`; Task 13 writes the app side):

| From the frame (`{ source: 'dp-mockup', … }`) | From the app (`{ source: 'dp-app', … }`) |
|---|---|
| `{ type: 'size', height: number }`, on load and on every resize | `{ type: 'pin-mode', on: boolean }` |
| `{ type: 'picked', selector: string, text: string }`, after a click in pin mode | `{ type: 'pins', pins: FramePin[] }` |
| `{ type: 'open-pin', id: string }`, after a click on a pin marker | |
| `{ type: 'missing-pins', ids: string[] }`, after every `pins` message | |

- **Selectors** are `body > tag:nth-of-type(k) > …`, built by the frame.
- **`text`** is the element's trimmed `innerText`, cut to 60 characters, or its tag name when it has none.

---

### Task 1: Visual data shapes

Every visual screen's data shape is defined once, in `packages/core/src/schemas/data.ts`: diagrams, table diffs, mockups, flows and phases. This task adds the Zod shapes, the cross-reference checks (`parseData`, `dataProblems`), the text subagents follow (`dataShapeDoc`) and pin anchors. Nothing calls them yet; Task 2 checks writes with them, and later tasks read with them.

**Files:**
- Create:
  - `packages/core/src/schemas/data.ts`
  - `packages/core/src/schemas/data.test.ts`
- Modify:
  - `packages/core/src/schemas/index.ts` (export `./data`)
  - `packages/core/src/schemas/project.ts` (`itemSchema` gains `anchor`)
- Test: `packages/core/src/schemas/data.test.ts`

**Interfaces:**
- Consumes: `Screen` from `schemas/plumbingType.ts`; Zod 3.25.
- Produces (all exported from `@dev-plumbing/core/schemas`, and so from `@dev-plumbing/core`), exactly as in the header's Contracts:
  - `nodeStatusValues`, `NodeStatus`, `migrationKindValues`, `MOCKUP_MAX_CHARS`
  - `diagramDataSchema`, `tableDiffSchema`, `mockupDataSchema`, `flowDataSchema`, `phaseDataSchema`. Each is typed `z.ZodType<T, z.ZodTypeDef, unknown>`: the output is the contract type, and the input is `unknown` because `groups`, `edges`, `files` and `itemIds` have defaults.
  - `DiagramData`, `TableDiff`, `MockupData`, `FlowData`, `PhaseData`, `DataKind`, `VisualData`
  - `dataKindOf(type: { screen: Screen; timeline?: boolean }): DataKind | null`
  - `parseData<K extends DataKind>(kind: K, data: unknown): { ok: true; data: VisualData[K] } | { ok: false; problems: string[] }`
  - `dataProblems(kind: DataKind | null, data: unknown, ctx?: DataContext): string[]`
  - `dataShapeDoc(kind: DataKind): string`
  - `anchorKindValues`, `anchorSchema`, `Anchor`, `anchorKindFor(kind: DataKind | null): Anchor['kind'] | null`
  - Also exported, for tests and the web: `diagramKindValues`, `edgeStyleValues`, `tableChangeValues`, `fieldChangeValues`, `flowKindValues`, and `DataContext = { itemIds?: Set<string>; mockupItemIds?: Set<string> }` (the contract's `ctx` type, named).
  - `itemSchema` gains `anchor: anchorSchema.optional().catch(undefined)`: a malformed anchor reads as none, and the item still loads.
- **Messages** (Task 2 prefixes them with the item; tests in Tasks 2 and 7 match them):
  - shape problems: `<path>: <Zod message>`, such as `nodes.2.status: Invalid enum value…`, or `data: …` for the whole value
  - `Node id "<id>" is used more than once. Node ids must be unique.` (and the same for `Edge id`, `Group id` and `Lane id`)
  - `Node "<id>" is in group "<g>", which isn't one of the group ids.`
  - `Edge "<id>" starts at "<from>", which isn't one of the node ids.` / `Edge "<id>" ends at "<to>", which isn't one of the node ids.`
  - `A "system" flow needs at least one lane in lanes.` (or `"both"`)
  - `Step number <n> is used more than once. Step numbers must be unique.`
  - `Step <n> starts on lane "<from>", which isn't one of the lane ids.` / `Step <n> ends on lane "<to>", which isn't one of the lane ids.`
  - `Field "<name>" is listed more than once. Field names must be unique.`
  - `<side>: remove the <script> tags. Mockups can't run scripts.`
  - `<side>: remove the <html> tag. Write only the page's body markup.` (also `<!doctype>`, `<head>`, `<body>`, `<meta>`)
  - `<side>: remove the <link> tag. Mockups can't load or embed other files.` (also `<iframe>`, `<object>`, `<embed>`)
  - `<side>: a src or srcset points at another site. Use inline SVG or plain boxes for images; outside files don't load in mockups.`
  - `This plumbing type's items don't take data. Leave data out.`
  - `itemIds: there's no item "<id>".`
  - `Step <n>: mockupId "<id>" isn't a UI item. Use the id of an item whose screen is mockups.`

- [ ] **Step 1: Write the failing tests**

The examples are generic Acme data shaped like what real Plan 2 importers wrote: a diagram with groups, edge labels and code references on some boxes; tables whose `schemaDiff` lines start with `+`; flows with lanes and `systemNote`; and UI items with only `location` and `kit`.

`packages/core/src/schemas/data.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  anchorKindFor,
  anchorSchema,
  dataKindOf,
  dataProblems,
  dataShapeDoc,
  diagramKindValues,
  edgeStyleValues,
  fieldChangeValues,
  flowKindValues,
  migrationKindValues,
  MOCKUP_MAX_CHARS,
  nodeStatusValues,
  parseData,
  tableChangeValues,
  type DataKind,
  type DiagramData,
  type FlowData,
  type MockupData,
  type PhaseData,
  type TableDiff,
} from './data';
import { itemSchema } from './project';

// Generic Acme examples, shaped like the data real Plan 2 importers wrote.

const restockDiagram: DiagramData = {
  kind: 'system',
  groups: [
    { id: 'web', label: 'apps/web' },
    { id: 'worker', label: 'apps/worker' },
    { id: 'db', label: 'packages/db' },
  ],
  nodes: [
    { id: 'account-page', label: 'Account page', group: 'web', status: 'changed', codeRef: { path: 'apps/web/app/account/page.tsx' } },
    { id: 'restock-card', label: 'Restock settings card', group: 'web', status: 'new' },
    { id: 'reminders-api', label: 'Reminders API', group: 'web', status: 'new', codeRef: { path: 'apps/web/app/api/reminders/route.ts' } },
    { id: 'reminder-job', label: 'Daily reminder job', group: 'worker', status: 'new' },
    { id: 'send-email', label: 'sendRestockEmail', group: 'worker', status: 'new' },
    { id: 'subscription', label: 'Subscription', group: 'db', status: 'changed', codeRef: { path: 'packages/db/prisma/schema.prisma', symbol: 'model Subscription' } },
    { id: 'restock-reminder', label: 'RestockReminder', group: 'db', status: 'new' },
    { id: 'email-provider', label: 'Email provider', status: 'external' },
  ],
  edges: [
    { id: 'e1', from: 'account-page', to: 'restock-card', label: 'renders' },
    { id: 'e2', from: 'restock-card', to: 'reminders-api', label: 'saves lead time' },
    { id: 'e3', from: 'reminders-api', to: 'subscription', label: 'updates' },
    { id: 'e4', from: 'reminder-job', to: 'subscription', label: 'finds due' },
    { id: 'e5', from: 'reminder-job', to: 'restock-reminder', label: 'logs' },
    { id: 'e6', from: 'reminder-job', to: 'send-email' },
    { id: 'e7', from: 'send-email', to: 'email-provider', label: 'sends', style: 'dashed' },
  ],
};

const newTable: TableDiff = {
  model: 'RestockReminder',
  change: 'new',
  fields: [
    { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
    { name: 'subscriptionId', type: 'String', change: 'added' },
    { name: 'subscription', type: 'Subscription', change: 'added' },
    { name: 'sendAt', type: 'DateTime', change: 'added' },
    { name: 'sentAt', type: 'DateTime?', change: 'added', note: 'Empty until the email goes out.' },
  ],
  schemaDiff: [
    '+model RestockReminder {',
    '+  id             String       @id @default(cuid())',
    '+  subscriptionId String',
    '+  subscription   Subscription @relation(fields: [subscriptionId], references: [id])',
    '+  sendAt         DateTime',
    '+  sentAt         DateTime?',
    '+}',
  ].join('\n'),
  migration: [
    { kind: 'additive', text: 'Creates the RestockReminder table.' },
    { kind: 'rollback', text: 'Drop the RestockReminder table.' },
  ],
};

/** No migration, as Plan 2 importers sometimes wrote. */
const changedTable: TableDiff = {
  model: 'Subscription',
  change: 'changed',
  fields: [
    { name: 'id', type: 'String', change: 'unchanged' },
    { name: 'customerId', type: 'String', change: 'unchanged' },
    { name: 'status', type: 'SubscriptionStatus', change: 'unchanged' },
    { name: 'reminderLeadDays', type: 'Int', change: 'added', default: '5' },
    { name: 'reminders', type: 'RestockReminder[]', change: 'added' },
  ],
  schemaDiff: [
    ' model Subscription {',
    '   id               String             @id @default(cuid())',
    '   customerId       String',
    '   status           SubscriptionStatus',
    '+  reminderLeadDays Int                @default(5)',
    '+  reminders        RestockReminder[]',
    ' }',
  ].join('\n'),
};

const mockup: MockupData = {
  location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] },
  kit: 'web',
  after:
    '<main class="mx-auto max-w-xl p-6"><section class="rounded-card bg-white p-4"><h2 class="text-lg font-semibold">Restock reminders</h2><p class="text-sm">We email you 5 days before an item runs out.</p><img src="data:image/png;base64,iVBORw0KGgo=" alt=""><button class="mt-3 rounded bg-brand px-3 py-1.5 text-white">Change</button></section></main>',
  before: '<main class="mx-auto max-w-xl p-6"><h1 class="text-xl font-semibold">Account</h1></main>',
};

const userFlow: FlowData = {
  kind: 'user',
  steps: [
    { n: 1, label: 'Opens the account page', mockupId: 'ui-account-page' },
    { n: 2, label: 'Turns on restock reminders', mockupId: 'ui-restock-card', systemNote: 'Saves the lead time on the subscription.' },
    { n: 3, label: 'Gets an email 5 days before running out', systemNote: 'The daily job sends it.' },
  ],
};

const systemFlow: FlowData = {
  kind: 'system',
  lanes: [
    { id: 'job', label: 'Daily reminder job', status: 'new' },
    { id: 'db', label: 'Postgres', status: 'unchanged' },
    { id: 'email', label: 'Email provider', status: 'external' },
  ],
  steps: [
    { n: 1, from: 'job', to: 'db', label: 'Find subscriptions due in 5 days' },
    { n: 2, from: 'job', to: 'job', label: 'Build one email per customer', systemNote: 'Groups items by customer.' },
    { n: 3, from: 'job', to: 'email', label: 'Send the reminder' },
    { n: 4, from: 'job', to: 'db', label: 'Log a RestockReminder row' },
  ],
};

const phase: PhaseData = {
  order: 1,
  goal: 'Reminders send for active subscriptions.',
  doneWhen: ['The daily job runs in staging', 'Each customer gets at most one email a day'],
  itemIds: ['architecture-reminder-job', 'database-restock-reminder'],
};

const problemsOf = (kind: DataKind, data: unknown) => {
  const r = parseData(kind, data);
  return r.ok ? [] : r.problems;
};

describe('visual data shapes', () => {
  it('accepts a realistic example of each kind', () => {
    expect(parseData('diagram', restockDiagram)).toEqual({ ok: true, data: restockDiagram });
    expect(parseData('database', newTable)).toEqual({ ok: true, data: newTable });
    expect(parseData('database', changedTable)).toEqual({ ok: true, data: changedTable });
    expect(parseData('mockups', mockup)).toEqual({ ok: true, data: mockup });
    expect(parseData('flows', userFlow)).toEqual({ ok: true, data: userFlow });
    expect(parseData('flows', systemFlow)).toEqual({ ok: true, data: systemFlow });
    expect(parseData('timeline', phase)).toEqual({ ok: true, data: phase });
  });

  it('still reads the shapes Plan 2 importers wrote', () => {
    expect(parseData('mockups', { location: { app: 'web', route: '/account' }, kit: 'web' })).toEqual({
      ok: true,
      data: { location: { app: 'web', route: '/account', files: [] }, kit: 'web' },
    });
    const noGroups = parseData('diagram', { kind: 'data_flow', nodes: [{ id: 'a', label: 'A', status: 'new' }] });
    expect(noGroups).toEqual({ ok: true, data: { kind: 'data_flow', groups: [], nodes: [{ id: 'a', label: 'A', status: 'new' }], edges: [] } });
    expect(parseData('diagram', { ...restockDiagram, nodes: restockDiagram.nodes.map((n, i) => (i ? n : { ...n, itemId: 'ui-account-page' })) }).ok).toBe(true);
    expect(parseData('database', changedTable).ok).toBe(true);
    expect(parseData('timeline', { order: 2, goal: 'Ship it.', doneWhen: ['Live'] })).toEqual({ ok: true, data: { order: 2, goal: 'Ship it.', doneWhen: ['Live'], itemIds: [] } });
  });

  it('names every broken reference in a diagram', () => {
    expect(
      problemsOf('diagram', {
        kind: 'system',
        groups: [{ id: 'web', label: 'Web' }, { id: 'web', label: 'Web again' }],
        nodes: [
          { id: 'a', label: 'A', status: 'new', group: 'web' },
          { id: 'a', label: 'A again', status: 'new' },
          { id: 'b', label: 'B', status: 'changed', group: 'mobile' },
        ],
        edges: [
          { id: 'e1', from: 'a', to: 'b' },
          { id: 'e1', from: 'ghost', to: 'gone' },
        ],
      }),
    ).toEqual([
      'Node id "a" is used more than once. Node ids must be unique.',
      'Edge id "e1" is used more than once. Edge ids must be unique.',
      'Group id "web" is used more than once. Group ids must be unique.',
      'Node "b" is in group "mobile", which isn\'t one of the group ids.',
      'Edge "e1" starts at "ghost", which isn\'t one of the node ids.',
      'Edge "e1" ends at "gone", which isn\'t one of the node ids.',
    ]);
  });

  it('names every broken reference in a flow', () => {
    expect(problemsOf('flows', { kind: 'system', steps: [{ n: 1, label: 'Starts' }] })).toEqual(['A "system" flow needs at least one lane in lanes.']);
    expect(problemsOf('flows', { kind: 'both', lanes: [], steps: [{ n: 1, label: 'Starts' }] })).toEqual(['A "both" flow needs at least one lane in lanes.']);
    expect(
      problemsOf('flows', {
        kind: 'system',
        lanes: [{ id: 'job', label: 'Job', status: 'new' }, { id: 'job', label: 'Job again', status: 'new' }],
        steps: [
          { n: 1, from: 'job', to: 'db', label: 'Reads' },
          { n: 1, from: 'queue', to: 'job', label: 'Wakes' },
        ],
      }),
    ).toEqual([
      'Lane id "job" is used more than once. Lane ids must be unique.',
      'Step number 1 is used more than once. Step numbers must be unique.',
      'Step 1 ends on lane "db", which isn\'t one of the lane ids.',
      'Step 1 starts on lane "queue", which isn\'t one of the lane ids.',
    ]);
    expect(problemsOf('flows', { kind: 'user', steps: [{ n: 1, from: 'Customer', to: 'Account page', label: 'Opens it' }] })).toEqual([]);
  });

  it('refuses a table that lists a field twice', () => {
    expect(problemsOf('database', { ...newTable, fields: [...newTable.fields, { name: 'sentAt', type: 'DateTime', change: 'added' }] })).toEqual([
      'Field "sentAt" is listed more than once. Field names must be unique.',
    ]);
  });

  it('keeps mockup markup to body markup that loads nothing', () => {
    const withAfter = (after: string) => problemsOf('mockups', { ...mockup, after });
    expect(withAfter('<div>Hi</div><script>alert(1)</script>')).toEqual(["after: remove the <script> tags. Mockups can't run scripts."]);
    expect(withAfter('<!doctype html><html><body><div>Hi</div></body></html>')).toEqual([
      "after: remove the <!doctype> tag. Write only the page's body markup.",
      "after: remove the <html> tag. Write only the page's body markup.",
      "after: remove the <body> tag. Write only the page's body markup.",
    ]);
    expect(withAfter('<head><title>x</title></head><header class="p-4">Acme</header>')).toEqual(["after: remove the <head> tag. Write only the page's body markup."]);
    // A refresh tag would navigate the frame away, and no CSP directive stops that. SVG's <metadata> is fine.
    expect(withAfter('<meta http-equiv="refresh" content="0;url=/x"><div>Hi</div>')).toEqual(["after: remove the <meta> tag. Write only the page's body markup."]);
    expect(withAfter('<svg viewBox="0 0 4 4"><metadata>Logo</metadata><rect width="4" height="4"/></svg>')).toEqual([]);
    expect(withAfter('<link rel="stylesheet" href="x.css"><iframe src="/x"></iframe><object></object><embed>')).toEqual([
      "after: remove the <link> tag. Mockups can't load or embed other files.",
      "after: remove the <iframe> tag. Mockups can't load or embed other files.",
      "after: remove the <object> tag. Mockups can't load or embed other files.",
      "after: remove the <embed> tag. Mockups can't load or embed other files.",
    ]);
    const outside = "after: a src or srcset points at another site. Use inline SVG or plain boxes for images; outside files don't load in mockups.";
    expect(withAfter('<img src="https://cdn.acme.test/logo.png">')).toEqual([outside]);
    expect(withAfter("<img src='//cdn.acme.test/logo.png'>")).toEqual([outside]);
    expect(withAfter('<img SRC=http://acme.test/a.png>')).toEqual([outside]);
    expect(withAfter('<img srcset="small.png 1x, https://cdn.acme.test/big.png 2x">')).toEqual([outside]);
    expect(withAfter('<img data-src="https://cdn.acme.test/a.png" src="data:image/png;base64,AA=="><svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>')).toEqual([]);
    expect(problemsOf('mockups', { ...mockup, before: '<script src="/x.js"></script>' })).toEqual(["before: remove the <script> tags. Mockups can't run scripts."]);
    expect(problemsOf('mockups', { ...mockup, after: 'x'.repeat(MOCKUP_MAX_CHARS + 1) })).toEqual(['after: Mockup markup can be at most 100,000 characters.']);
  });

  it('picks the data kind from the screen, and timeline for list types that have one', () => {
    expect(dataKindOf({ screen: 'diagram' })).toBe('diagram');
    expect(dataKindOf({ screen: 'database' })).toBe('database');
    expect(dataKindOf({ screen: 'mockups' })).toBe('mockups');
    expect(dataKindOf({ screen: 'flows' })).toBe('flows');
    expect(dataKindOf({ screen: 'list' })).toBeNull();
    expect(dataKindOf({ screen: 'list', timeline: false })).toBeNull();
    expect(dataKindOf({ screen: 'list', timeline: true })).toBe('timeline');
  });

  it('describes what a subagent may write, and what it refers to', () => {
    expect(dataProblems(null, { anything: true })).toEqual(["This plumbing type's items don't take data. Leave data out."]);
    expect(dataProblems(null, undefined)).toEqual([]);
    expect(dataProblems('diagram', undefined)).toEqual([]);
    expect(dataProblems('diagram', 'a picture')).toEqual(['data: Expected object, received string']);
    const badStatus = dataProblems('diagram', { ...restockDiagram, nodes: restockDiagram.nodes.map((n, i) => (i === 2 ? { ...n, status: 'old' } : n)) });
    expect(badStatus).toHaveLength(1);
    expect(badStatus[0]).toMatch(/^nodes\.2\.status: Invalid enum value/);

    expect(dataProblems('timeline', phase)).toEqual([]);
    expect(dataProblems('timeline', phase, { itemIds: new Set(['architecture-reminder-job']) })).toEqual(['itemIds: there\'s no item "database-restock-reminder".']);
    expect(dataProblems('timeline', phase, { itemIds: new Set(phase.itemIds) })).toEqual([]);

    expect(dataProblems('flows', userFlow, { mockupItemIds: new Set(['ui-account-page']) })).toEqual([
      'Step 2: mockupId "ui-restock-card" isn\'t a UI item. Use the id of an item whose screen is mockups.',
    ]);
    expect(dataProblems('flows', userFlow, { mockupItemIds: new Set(['ui-account-page', 'ui-restock-card']) })).toEqual([]);
    expect(dataProblems('flows', userFlow)).toEqual([]);
  });

  it('documents every allowed value, and its example is valid', () => {
    const values: Record<DataKind, readonly string[]> = {
      diagram: [...diagramKindValues, ...nodeStatusValues, ...edgeStyleValues],
      database: [...tableChangeValues, ...fieldChangeValues, ...migrationKindValues],
      mockups: [],
      flows: [...flowKindValues, ...nodeStatusValues],
      timeline: [],
    };
    for (const kind of Object.keys(values) as DataKind[]) {
      const doc = dataShapeDoc(kind);
      for (const v of values[kind]) expect(doc, `${kind} mentions "${v}"`).toContain(`"${v}"`);
      expect(doc).toContain("data replaces the item's whole data");
      const example: unknown = JSON.parse(doc.slice(doc.indexOf('Example:') + 'Example:'.length));
      expect(parseData(kind, example).ok, `${kind} example parses`).toBe(true);
    }
    const ui = dataShapeDoc('mockups');
    for (const bit of ["Write only the page's body markup", '<meta>', 'kitFiles', 'Tailwind classes and theme tokens', 'No scripts', 'inline SVG or plain boxes', '100,000', 'Send it only when the screen exists today']) {
      expect(ui).toContain(bit);
    }
  });
});

describe('anchors', () => {
  const anchor = { itemId: 'architecture-map', kind: 'node' as const, ref: 'reminder-job', label: 'Daily reminder job' };

  it('says which part of an item a pin is about', () => {
    expect(anchorSchema.parse(anchor)).toEqual(anchor);
    expect(anchorSchema.parse({ itemId: 'ui-account', kind: 'element', ref: 'body > main:nth-of-type(1)', label: 'Change', side: 'before' })).toMatchObject({ side: 'before' });
    expect(anchorSchema.safeParse({ ...anchor, kind: 'box' }).success).toBe(false);
    expect(anchorSchema.safeParse({ ...anchor, side: 'during' }).success).toBe(false);
  });

  it('is kept on items, and items without one still read', () => {
    const item = { id: 'architecture-about-job', type: 'architecture', title: 'About the job', summary: 's', threadId: 't-architecture-about-job', createdBy: 'you' };
    expect(itemSchema.parse({ ...item, anchor }).anchor).toEqual(anchor);
    expect(itemSchema.parse(item).anchor).toBeUndefined();
  });

  it('never hides an item over a malformed anchor', () => {
    const item = { id: 'architecture-about-job', type: 'architecture', title: 'About the job', summary: 's', threadId: 't-architecture-about-job', createdBy: 'you' };
    const parsed = itemSchema.safeParse({ ...item, anchor: { bogus: true } });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.anchor).toBeUndefined();
    expect(parsed.data?.title).toBe('About the job');
  });

  it('pins boxes on diagrams, elements on mockups and steps on flows', () => {
    expect(anchorKindFor('diagram')).toBe('node');
    expect(anchorKindFor('mockups')).toBe('element');
    expect(anchorKindFor('flows')).toBe('step');
    expect(anchorKindFor('database')).toBeNull();
    expect(anchorKindFor('timeline')).toBeNull();
    expect(anchorKindFor(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/src/schemas/data.test.ts`
Expected: FAIL, because `./data` can't be resolved.

- [ ] **Step 3: Write the data shapes**

`packages/core/src/schemas/data.ts`:
```ts
import { z } from 'zod';
import type { Screen } from './plumbingType';

// The data each visual screen draws (spec §13.1), defined once. Writes are checked against these shapes, reads parse
// with them, the web uses their types, and dataShapeDoc turns them into the text subagents follow.

export const nodeStatusValues = ['new', 'changed', 'unchanged', 'external'] as const;
export type NodeStatus = (typeof nodeStatusValues)[number];
export const migrationKindValues = ['additive', 'backfill', 'destructive', 'data-risk', 'rollback'] as const;
export const diagramKindValues = ['system', 'data_flow'] as const;
export const edgeStyleValues = ['solid', 'dashed'] as const;
export const tableChangeValues = ['new', 'changed', 'removed'] as const;
export const fieldChangeValues = ['added', 'changed', 'removed', 'unchanged'] as const;
export const flowKindValues = ['user', 'system', 'both'] as const;
export const MOCKUP_MAX_CHARS = 100_000;

export type DiagramData = {
  kind: 'system' | 'data_flow';
  groups: { id: string; label: string }[];
  nodes: { id: string; label: string; group?: string; status: NodeStatus; codeRef?: { path: string; symbol?: string }; itemId?: string }[];
  edges: { id: string; from: string; to: string; label?: string; style?: 'solid' | 'dashed' }[];
};
export type TableDiff = {
  model: string;
  change: 'new' | 'changed' | 'removed';
  fields: { name: string; type: string; change: 'added' | 'changed' | 'removed' | 'unchanged'; default?: string; note?: string }[];
  schemaDiff: string;
  migration?: { kind: (typeof migrationKindValues)[number]; text: string }[];
};
export type MockupData = { location: { app: string; route?: string; files: string[] }; kit: string; after?: string; before?: string };
export type FlowData = {
  kind: 'user' | 'system' | 'both';
  lanes?: { id: string; label: string; status: NodeStatus }[];
  steps: { n: number; from?: string; to?: string; label: string; mockupId?: string; systemNote?: string }[];
};
export type PhaseData = { order: number; goal: string; doneWhen: string[]; itemIds: string[] };

export type DataKind = 'diagram' | 'database' | 'mockups' | 'flows' | 'timeline';
export type VisualData = { diagram: DiagramData; database: TableDiff; mockups: MockupData; flows: FlowData; timeline: PhaseData };
/** Extra facts dataProblems checks references against. */
export type DataContext = { itemIds?: Set<string>; mockupItemIds?: Set<string> };

// Ids inside data are the subagent's own names (boxes, lines, lanes), so they aren't held to item-id rules.
const dataId = z.string().min(1).max(100);
const label = z.string().min(1).max(200);
const status = z.enum(nodeStatusValues);

export const diagramDataSchema: z.ZodType<DiagramData, z.ZodTypeDef, unknown> = z.object({
  kind: z.enum(diagramKindValues),
  groups: z.array(z.object({ id: dataId, label })).max(30).default([]),
  nodes: z
    .array(
      z.object({
        id: dataId,
        label,
        group: dataId.optional(),
        status,
        codeRef: z.object({ path: z.string().min(1).max(300), symbol: z.string().min(1).max(200).optional() }).optional(),
        itemId: dataId.optional(),
      }),
    )
    .min(1)
    .max(80),
  edges: z
    .array(z.object({ id: dataId, from: dataId, to: dataId, label: z.string().max(200).optional(), style: z.enum(edgeStyleValues).optional() }))
    .max(200)
    .default([]),
});

export const tableDiffSchema: z.ZodType<TableDiff, z.ZodTypeDef, unknown> = z.object({
  model: z.string().min(1).max(200),
  change: z.enum(tableChangeValues),
  fields: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        type: z.string().min(1).max(300),
        change: z.enum(fieldChangeValues),
        default: z.string().max(500).optional(),
        note: z.string().max(2_000).optional(),
      }),
    )
    .max(200),
  schemaDiff: z.string().max(50_000),
  migration: z.array(z.object({ kind: z.enum(migrationKindValues), text: z.string().min(1).max(2_000) })).max(20).optional(),
});

const markup = z.string().max(MOCKUP_MAX_CHARS, 'Mockup markup can be at most 100,000 characters.');

export const mockupDataSchema: z.ZodType<MockupData, z.ZodTypeDef, unknown> = z.object({
  location: z.object({
    app: z.string().min(1).max(100),
    route: z.string().max(300).optional(),
    files: z.array(z.string().min(1).max(300)).max(30).default([]),
  }),
  kit: z.string().max(100),
  after: markup.optional(),
  before: markup.optional(),
});

export const flowDataSchema: z.ZodType<FlowData, z.ZodTypeDef, unknown> = z.object({
  kind: z.enum(flowKindValues),
  lanes: z.array(z.object({ id: dataId, label, status })).max(12).optional(),
  steps: z
    .array(
      z.object({
        n: z.number().int().min(0).max(999),
        from: dataId.optional(),
        to: dataId.optional(),
        label: z.string().min(1).max(500),
        mockupId: dataId.optional(),
        systemNote: z.string().max(2_000).optional(),
      }),
    )
    .min(1)
    .max(60),
});

export const phaseDataSchema: z.ZodType<PhaseData, z.ZodTypeDef, unknown> = z.object({
  order: z.number().int().min(0).max(999),
  goal: z.string().min(1).max(1_000),
  doneWhen: z.array(z.string().min(1).max(500)).min(1).max(12),
  itemIds: z.array(dataId).max(200).default([]),
});

const schemas: { [K in DataKind]: z.ZodType<VisualData[K], z.ZodTypeDef, unknown> } = {
  diagram: diagramDataSchema,
  database: tableDiffSchema,
  mockups: mockupDataSchema,
  flows: flowDataSchema,
  timeline: phaseDataSchema,
};

/** Which data a plumbing type's items carry: its screen, or 'timeline' for a list with timeline: true; null for plain lists. */
export function dataKindOf(type: { screen: Screen; timeline?: boolean }): DataKind | null {
  if (type.screen !== 'list') return type.screen;
  return type.timeline ? 'timeline' : null;
}

/** Each value that appears more than once, once. */
function repeated<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const twice = new Set<T>();
  for (const v of values) (seen.has(v) ? twice : seen).add(v);
  return [...twice];
}

function diagramProblems(d: DiagramData): string[] {
  const problems: string[] = [];
  for (const id of repeated(d.nodes.map((n) => n.id))) problems.push(`Node id "${id}" is used more than once. Node ids must be unique.`);
  for (const id of repeated(d.edges.map((e) => e.id))) problems.push(`Edge id "${id}" is used more than once. Edge ids must be unique.`);
  for (const id of repeated(d.groups.map((g) => g.id))) problems.push(`Group id "${id}" is used more than once. Group ids must be unique.`);
  const nodes = new Set(d.nodes.map((n) => n.id));
  const groups = new Set(d.groups.map((g) => g.id));
  for (const n of d.nodes) {
    if (n.group !== undefined && !groups.has(n.group)) problems.push(`Node "${n.id}" is in group "${n.group}", which isn't one of the group ids.`);
  }
  for (const e of d.edges) {
    if (!nodes.has(e.from)) problems.push(`Edge "${e.id}" starts at "${e.from}", which isn't one of the node ids.`);
    if (!nodes.has(e.to)) problems.push(`Edge "${e.id}" ends at "${e.to}", which isn't one of the node ids.`);
  }
  return problems;
}

function tableProblems(t: TableDiff): string[] {
  return repeated(t.fields.map((f) => f.name)).map((name) => `Field "${name}" is listed more than once. Field names must be unique.`);
}

/** Each distinct tag name the pattern finds, lowercased. */
const tagsIn = (markup: string, pattern: RegExp) => [...new Set([...markup.matchAll(pattern)].map((m) => m[1].toLowerCase()))];

/** Whether any src or srcset attribute points at a file on another site. */
function loadsOutsideFiles(markup: string): boolean {
  for (const m of markup.matchAll(/\s(?:src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    const value = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (/(?:^|[\s,])(?:https?:|\/\/)/i.test(value)) return true;
  }
  return false;
}

/** Mockup markup is body markup that draws with the kit and nothing else: no scripts, no page tags, nothing loaded. */
function markupProblems(side: 'after' | 'before', markup: string): string[] {
  const problems: string[] = [];
  if (/<script\b/i.test(markup)) problems.push(`${side}: remove the <script> tags. Mockups can't run scripts.`);
  // <meta> too: a refresh tag would navigate the frame away, and no CSP directive stops that.
  for (const tag of tagsIn(markup, /<\/?(!doctype|html|head|body|meta)\b/gi)) problems.push(`${side}: remove the <${tag}> tag. Write only the page's body markup.`);
  for (const tag of tagsIn(markup, /<(link|iframe|object|embed)\b/gi)) problems.push(`${side}: remove the <${tag}> tag. Mockups can't load or embed other files.`);
  if (loadsOutsideFiles(markup)) {
    problems.push(`${side}: a src or srcset points at another site. Use inline SVG or plain boxes for images; outside files don't load in mockups.`);
  }
  return problems;
}

function mockupProblems(m: MockupData): string[] {
  return [...(m.after ? markupProblems('after', m.after) : []), ...(m.before ? markupProblems('before', m.before) : [])];
}

function flowProblems(f: FlowData): string[] {
  const problems: string[] = [];
  const lanes = f.lanes ?? [];
  if (f.kind !== 'user' && !lanes.length) problems.push(`A "${f.kind}" flow needs at least one lane in lanes.`);
  for (const id of repeated(lanes.map((l) => l.id))) problems.push(`Lane id "${id}" is used more than once. Lane ids must be unique.`);
  for (const n of repeated(f.steps.map((s) => s.n))) problems.push(`Step number ${n} is used more than once. Step numbers must be unique.`);
  if (lanes.length) {
    const ids = new Set(lanes.map((l) => l.id));
    for (const s of f.steps) {
      if (s.from !== undefined && !ids.has(s.from)) problems.push(`Step ${s.n} starts on lane "${s.from}", which isn't one of the lane ids.`);
      if (s.to !== undefined && !ids.has(s.to)) problems.push(`Step ${s.n} ends on lane "${s.to}", which isn't one of the lane ids.`);
    }
  }
  return problems;
}

const crossChecks: { [K in DataKind]: (data: VisualData[K]) => string[] } = {
  diagram: diagramProblems,
  database: tableProblems,
  mockups: mockupProblems,
  flows: flowProblems,
  timeline: () => [],
};

/** Shape plus cross-references (edge ends are nodes, step lanes exist, unique ids and step numbers, markup rules). */
export function parseData<K extends DataKind>(kind: K, data: unknown): { ok: true; data: VisualData[K] } | { ok: false; problems: string[] } {
  const parsed = schemas[kind].safeParse(data);
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join('.') || 'data'}: ${i.message}`) };
  const problems = crossChecks[kind](parsed.data);
  return problems.length ? { ok: false, problems } : { ok: true, data: parsed.data };
}

/**
 * Problems with data a subagent wants to write. kind null with data present is a problem; data undefined is fine.
 * ctx.itemIds: every item id that will exist (phase itemIds must be among them).
 * ctx.mockupItemIds: ids of items whose type's screen is mockups (step mockupId must be among them).
 */
export function dataProblems(kind: DataKind | null, data: unknown, ctx: DataContext = {}): string[] {
  if (data === undefined) return [];
  if (kind === null) return ["This plumbing type's items don't take data. Leave data out."];
  const parsed = parseData(kind, data);
  if (!parsed.ok) return parsed.problems;
  const problems: string[] = [];
  if (kind === 'timeline' && ctx.itemIds) {
    for (const id of (parsed.data as PhaseData).itemIds) if (!ctx.itemIds.has(id)) problems.push(`itemIds: there's no item "${id}".`);
  }
  if (kind === 'flows' && ctx.mockupItemIds) {
    for (const s of (parsed.data as FlowData).steps) {
      if (s.mockupId !== undefined && !ctx.mockupItemIds.has(s.mockupId)) {
        problems.push(`Step ${s.n}: mockupId "${s.mockupId}" isn't a UI item. Use the id of an item whose screen is mockups.`);
      }
    }
  }
  return problems;
}

const q = (values: readonly string[]) => values.map((v) => `"${v}"`).join(' | ');

const EXAMPLES: VisualData = {
  diagram: {
    kind: 'system',
    groups: [
      { id: 'web', label: 'apps/web' },
      { id: 'worker', label: 'apps/worker' },
    ],
    nodes: [
      { id: 'account-page', label: 'Account page', group: 'web', status: 'changed', codeRef: { path: 'apps/web/app/account/page.tsx' } },
      { id: 'reminder-job', label: 'Daily reminder job', group: 'worker', status: 'new' },
      { id: 'db', label: 'Postgres', status: 'unchanged' },
      { id: 'email', label: 'Email provider', status: 'external' },
    ],
    edges: [
      { id: 'e1', from: 'account-page', to: 'db', label: 'saves lead time' },
      { id: 'e2', from: 'reminder-job', to: 'db', label: 'finds due subscriptions' },
      { id: 'e3', from: 'reminder-job', to: 'email', label: 'sends', style: 'dashed' },
    ],
  },
  database: {
    model: 'RestockReminder',
    change: 'new',
    fields: [
      { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
      { name: 'subscriptionId', type: 'String', change: 'added' },
      { name: 'subscription', type: 'Subscription', change: 'added' },
      { name: 'sentAt', type: 'DateTime?', change: 'added', note: 'Empty until the email goes out.' },
    ],
    schemaDiff: [
      '+model RestockReminder {',
      '+  id             String       @id @default(cuid())',
      '+  subscriptionId String',
      '+  subscription   Subscription @relation(fields: [subscriptionId], references: [id])',
      '+  sentAt         DateTime?',
      '+}',
    ].join('\n'),
    migration: [
      { kind: 'additive', text: 'Creates the RestockReminder table.' },
      { kind: 'rollback', text: 'Drop the RestockReminder table. Nothing else depends on it.' },
    ],
  },
  mockups: {
    location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] },
    kit: 'web',
    after:
      '<main class="mx-auto max-w-xl p-6"><h1 class="text-xl font-semibold">Account</h1><section class="mt-4 rounded-card border p-4"><h2 class="font-medium">Restock reminders</h2><p class="text-sm">We email you 5 days before an item runs out.</p><button class="mt-3 rounded bg-brand px-3 py-1.5 text-white">Change</button></section></main>',
    before: '<main class="mx-auto max-w-xl p-6"><h1 class="text-xl font-semibold">Account</h1></main>',
  },
  flows: {
    kind: 'both',
    lanes: [
      { id: 'customer', label: 'Customer', status: 'external' },
      { id: 'web', label: 'Web app', status: 'changed' },
      { id: 'db', label: 'Postgres', status: 'unchanged' },
    ],
    steps: [
      { n: 1, from: 'customer', to: 'web', label: 'Opens the account page', mockupId: 'ui-account-page' },
      { n: 2, from: 'web', to: 'db', label: 'Saves the lead time', systemNote: 'Updates Subscription.reminderLeadDays.' },
      { n: 3, label: 'The daily job picks it up tomorrow' },
    ],
  },
  timeline: {
    order: 1,
    goal: 'Reminders send for active subscriptions.',
    doneWhen: ['The daily job runs in staging', 'Each customer gets at most one email a day'],
    itemIds: ['architecture-reminder-job', 'database-restock-reminder'],
  },
};

const SHAPES: Record<DataKind, string> = {
  diagram: `Diagram data: one item is one diagram.

Shape:
{
  "kind": ${q(diagramKindValues)},
  "groups": [{ "id": string, "label": string }],
  "nodes": [{ "id": string, "label": string, "group"?: string, "status": ${q(nodeStatusValues)}, "codeRef"?: { "path": string, "symbol"?: string }, "itemId"?: string }],
  "edges": [{ "id": string, "from": string, "to": string, "label"?: string, "style"?: ${q(edgeStyleValues)} }]
}

- kind: "system" shows the parts and how they call each other; "data_flow" shows where data moves.
- groups: the apps or packages the boxes sit in, at most 30. Send [] when nothing groups.
- nodes: the boxes, 1 to 80. status is "new" (the plan adds it), "changed", "unchanged" (shown for context) or "external" (outside the repo, such as an email provider).
- codeRef: the box's real file, relative to the repo root, and optionally a symbol in it. The app checks it and marks it ✓ when found. Leave it out for files the plan creates.
- itemId: the id of an existing item this box is about, if there is one.
- edges: the lines, at most 200. label says what passes along the line. style "dashed" is for async or optional calls; the default is "solid".

Rules:
- Node ids, edge ids and group ids are each unique.
- Every edge's from and to is a node id.
- A node's group is a group id.
- Labels are names, not sentences (at most 200 characters).`,

  database: `Database data: one item is one table.

Shape:
{
  "model": string,
  "change": ${q(tableChangeValues)},
  "fields": [{ "name": string, "type": string, "change": ${q(fieldChangeValues)}, "default"?: string, "note"?: string }],
  "schemaDiff": string,
  "migration"?: [{ "kind": ${q(migrationKindValues)}, "text": string }]
}

- model: the model name exactly as in the schema file, such as "Subscription".
- change: "new" for a table the plan adds, "changed" for one it alters, "removed" for one it drops.
- fields: every field of the table, including unchanged ones, at most 200. type is written as in the schema ("String?", "Order[]", "DateTime"). default is the default as written, such as "now()". note is a short reason, when one helps.
- schemaDiff: the model's block as a diff. Each line starts with "+" (added), "-" (removed) or a space (unchanged).
- migration: what the migration does, one entry per step. "additive" only adds; "backfill" fills existing rows; "destructive" drops or narrows data; "data-risk" could lose or corrupt data if it goes wrong; "rollback" says how to undo it. Include a rollback entry.

Rules:
- Field names are unique within the table.
- The app checks changed and removed tables, and unchanged fields' types, against the repo's schema file, so copy names and types exactly.`,

  mockups: `Mockup data: one item is one screen.

Shape:
{
  "location": { "app": string, "route"?: string, "files": string[] },
  "kit": string,
  "after"?: string,
  "before"?: string
}

- location: the app's name from the repo profile (profile.apps), the screen's route (such as "/account") and its component files, relative to the repo root.
- kit: the name of the app whose design kit the mockup uses, from the repo profile. Usually the same as location.app.
- after: the screen after the change, as HTML body markup. Always send it.
- before: the screen as it is today, built from the current component. Send it only when the screen exists today.

Rules:
- Write only the page's body markup: no <html>, <head>, <body> or <meta> tags. The app adds the kit.
- Use the app's Tailwind classes and theme tokens, from the kit files listed for the app in the repo profile (profile.apps[].kitFiles). Read those files before writing markup.
- No scripts, and no <link>, <iframe>, <object> or <embed> tags.
- Images are inline SVG or plain boxes: no src or srcset pointing at http:, https: or //.
- after and before are each at most 100,000 characters.`,

  flows: `Flow data: one item is one flow.

Shape:
{
  "kind": ${q(flowKindValues)},
  "lanes"?: [{ "id": string, "label": string, "status": ${q(nodeStatusValues)} }],
  "steps": [{ "n": number, "from"?: string, "to"?: string, "label": string, "mockupId"?: string, "systemNote"?: string }]
}

- kind: "user" is what a person sees, screen by screen (drawn as a storyboard); "system" is how the parts call each other (drawn as a sequence diagram); "both" can be drawn either way, with the same step numbers.
- lanes: the parts the steps move between, at most 12, each with a status as on a diagram box. Required for "system" and "both".
- steps: 1 to 60, numbered from 1 in order. from and to are lane ids: different lanes draw an arrow, the same lane draws a self-call, and neither draws a note across the lanes.
- mockupId: on a user step, the id of the UI item (an item whose screen is mockups) that shows this screen.
- systemNote: what the system does at this step, in one sentence.

Rules:
- Step numbers are unique, and lane ids are unique.
- When there are lanes, every step's from and to is a lane id.
- "system" and "both" flows have at least one lane.
- mockupId is the id of an existing UI item.`,

  timeline: `Phase data: one item is one phase or milestone.

Shape:
{ "order": number, "goal": string, "doneWhen": string[], "itemIds": string[] }

- order: the phase's position, 1 for the first.
- goal: what the phase achieves, in one sentence.
- doneWhen: 1 to 12 checks that say the phase is finished.
- itemIds: the ids of the items built in this phase, from existingItems. While importing, keys of items in the same batch work too.

Rules:
- Every id in itemIds is an existing item.
- Every in-scope item belongs to a phase.`,
};

/** The text subagents follow when writing data of this kind (shape, rules, an example). */
export function dataShapeDoc(kind: DataKind): string {
  return `${SHAPES[kind]}
- data replaces the item's whole data, so a revision sends all of it, not just what changed.

Example:
${JSON.stringify(EXAMPLES[kind], null, 2)}`;
}

export const anchorKindValues = ['node', 'element', 'step'] as const;
export type Anchor = { itemId: string; kind: (typeof anchorKindValues)[number]; ref: string; label: string; side?: 'after' | 'before' };
export const anchorSchema: z.ZodType<Anchor, z.ZodTypeDef, unknown> = z.object({
  itemId: z.string().min(1).max(100),
  kind: z.enum(anchorKindValues),
  ref: z.string().min(1).max(2_000),
  label: z.string().min(1).max(600),
  side: z.enum(['after', 'before']).optional(),
});

/** The anchor kind each data kind accepts: diagram->node, mockups->element, flows->step; others none. */
export function anchorKindFor(kind: DataKind | null): Anchor['kind'] | null {
  if (kind === 'diagram') return 'node';
  if (kind === 'mockups') return 'element';
  if (kind === 'flows') return 'step';
  return null;
}
```

Objects aren't `.strict()`: unknown keys are dropped when data is parsed, so a stray key in old data never stops a drawing from showing.

- [ ] **Step 4: Export it, and keep anchors on items**

In `packages/core/src/schemas/index.ts`, after `export * from './markdown';`, add:
```ts
export * from './data';
```

In `packages/core/src/schemas/project.ts`, replace:
```ts
import { z } from 'zod';
import { codeRefSchema, itemFlagSchema, mdAnchorSchema, messageSchema } from './loop';
```
with:
```ts
import { z } from 'zod';
import { anchorSchema } from './data';
import { codeRefSchema, itemFlagSchema, mdAnchorSchema, messageSchema } from './loop';
```
and, in `itemSchema`, replace:
```ts
    data: z.unknown().optional(),
    threadId: z.string(),
```
with:
```ts
    data: z.unknown().optional(),
    /**
     * Set on an item started from one part of another item: a box, a mockup element or a flow step.
     * A malformed anchor reads as none, so it can never hide the item (reading never refuses).
     */
    anchor: anchorSchema.optional().catch(undefined),
    threadId: z.string(),
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/core/src/schemas/data.test.ts`
Expected: PASS (13 tests).

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schemas/data.ts packages/core/src/schemas/data.test.ts packages/core/src/schemas/index.ts packages/core/src/schemas/project.ts
git commit -m "feat(core): one definition of each screen's data, with cross-reference checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Data checked on every write

Every write that sets an item's `data` is now checked against its plumbing type's shape: importer batches, Claude's new items, and the option and small-edit changes that patch `data`. Checks include references to other items: a phase's `itemIds` must exist, and a flow step's `mockupId` must be a UI item. As in Plan 2, a bad write is refused as a whole and the error lists every problem.

**Files:**
- Modify:
  - `packages/core/src/store/validate.ts` (`itemDataKinds`, `changeDataProblems`, `optionDataProblems`)
  - `packages/core/src/store/importItems.ts` (`writeImportBatch` takes `types` and checks `data`)
  - `packages/core/src/store/reply.ts` (`postReply` checks `data`)
  - `packages/service/src/routes/claude.ts` (`/items` passes `types`)
- Test:
  - `packages/core/test/importItems.test.ts`
  - `packages/core/test/reply.test.ts`
  - `packages/service/test/claude.test.ts`

**Interfaces:**
- Consumes (Task 1): `dataKindOf`, `dataProblems`, `parseData`, `DataContext`, `DataKind`.
- Produces (`store/validate.ts`, exported from `@dev-plumbing/core`):
  - `changeDataProblems(change: Change, kindOfItem: (itemId: string) => DataKind | null | undefined, ctx: DataContext): string[]`. For each `change.items` entry whose `patch.data !== undefined`, it returns `dataProblems(kindOfItem(id), patch.data, ctx)`, each prefixed `Item "<id>": `. Items `kindOfItem` doesn't know (`undefined`) are skipped, because `changeProblems` already reports them.
  - `optionDataProblems(options: Option[] | undefined, kindOfItem, ctx: DataContext): string[]`: `changeDataProblems` for each option's change, prefixed `Option "<id>": `.
  - `itemDataKinds(items: Item[], types: PlumbingType[]): { kindOfItem: (itemId: string) => DataKind | null | undefined; mockupItemIds: Set<string> }`. An item whose type is gone has kind `null`, so data on it is refused.
  - `writeImportBatch(o: { dir: string; type: PlumbingType; types: PlumbingType[]; batch: ImportBatch; clone: string; now?: Date })`. `types` is new and required: every plumbing type, enabled or not.
  - A phase's `itemIds` in an import batch may use keys from the same batch, like `links`. They're stored as item ids.
- **Anchors stay out of subagents' reach.** `importItemSchema` and `newItemSchema` don't declare `anchor`, so Zod drops it, and the strict `itemPatchSchema` refuses it. Nothing changes there; a test pins it.

- [ ] **Step 1: Write the failing core tests**

Replace `packages/core/test/importItems.test.ts` with the version below. The existing tests are unchanged except that every `writeImportBatch` call now passes `types: TYPES`; the `drawings in an import batch` block is new.
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { importItemSchema, itemPatchSchema, newItemSchema, type Item, type Thread } from '../src/schemas';
import { finishImport, verifyCodeRefs, writeImportBatch } from '../src/store/importItems';
import { InputError, readItem, readItems, readProjectFile, readThread } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, makeRepo, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const questions = TYPES.find((t) => t.id === 'questions')!;
const architecture = TYPES.find((t) => t.id === 'architecture')!;
const ui = listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 });
const flows = listType('flows', { title: 'Flows', screen: 'flows', order: 4 });
const phases = listType('phases', { title: 'Phases & milestones', timeline: true, order: 7 });
const ALL = [...TYPES, ui, flows, phases];
const importing = () => seedProject({ project: { status: 'importing', importPending: ['architecture', 'questions'] } });

/** An item of `type`, with `data`, and its thread. */
const drawn = (id: string, type: string, data?: unknown): { item: Item; thread: Thread } => {
  const p = pair(id, { type });
  return data === undefined ? p : { ...p, item: { ...p.item, data } };
};
const reminderMap = {
  kind: 'system',
  groups: [{ id: 'worker', label: 'apps/worker' }],
  nodes: [
    { id: 'job', label: 'Daily reminder job', group: 'worker', status: 'new' },
    { id: 'db', label: 'Postgres', status: 'unchanged' },
  ],
  edges: [{ id: 'e1', from: 'job', to: 'db', label: 'finds due' }],
};

async function cloneWithCode(): Promise<string> {
  const repo = makeRepo();
  await fs.mkdir(path.join(repo, 'src', 'jobs'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'jobs', 'reminders.ts'), 'export function sendReminders() {}\n');
  return repo;
}

describe('importing a plumbing type', () => {
  it('writes items with opening threads and links them by key', async () => {
    const dir = await importing();
    const r = await writeImportBatch({
      dir,
      type: questions,
      types: TYPES,
      clone: '/nowhere',
      batch: {
        items: [
          {
            key: 'who',
            title: 'Who gets reminders?',
            summary: 'Everyone, or only some customers?',
            fields: { blocking: 'true' },
            links: ['when'],
            message: { text: 'Who should get them first?', options: [{ id: 'all', label: 'Everyone' }, { id: 'some', label: 'Active subscribers' }], recommended: 'some' },
          },
          { key: 'when', title: 'How early?', summary: 'Days before the item runs out.' },
        ],
      },
    });
    expect(r).toEqual({ itemIds: ['questions-who', 'questions-when'], importFinished: false });
    expect(await readItem(dir, 'questions-who')).toMatchObject({
      key: 'who',
      type: 'questions',
      links: ['questions-when'],
      threadId: 't-questions-who',
      createdBy: 'import',
      fields: { blocking: 'true' },
    });
    const thread = await readThread(dir, 't-questions-who');
    expect(thread.status).toBe('your_turn');
    expect(thread.messages[0]).toMatchObject({ author: 'claude', opening: true, recommended: 'some' });
    expect((await readThread(dir, 't-questions-when')).status).toBe('idle');
    expect((await readProjectFile(dir)).importPending).toEqual(['architecture']);
  });

  it('records "no changes" and finishes the import with the last type', async () => {
    const dir = await importing();
    await writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'The plan leaves nothing open.' } });
    const r = await writeImportBatch({ dir, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'Nothing structural changes.' } });
    expect(r.importFinished).toBe(true);
    const p = await readProjectFile(dir);
    expect(p.status).toBe('active');
    expect(p.emptyTypes).toEqual([
      { type: 'questions', reason: 'The plan leaves nothing open.' },
      { type: 'architecture', reason: 'Nothing structural changes.' },
    ]);
  });

  it('checks code references against the clone', async () => {
    const clone = await cloneWithCode();
    const refs = await verifyCodeRefs(clone, [
      { path: 'src/jobs/reminders.ts', symbol: 'sendReminders' },
      { path: 'src/jobs/reminders.ts', symbol: 'cancelReminders' },
      { path: 'src/jobs' },
      { path: 'src/missing.ts' },
      { path: '../outside.ts' },
    ]);
    expect(refs.map((r) => r.verified)).toEqual([true, false, true, false, false]);
  });

  it('a bad batch writes nothing and says what to fix', async () => {
    const dir = await importing();
    const attempt = writeImportBatch({
      dir,
      type: questions,
      types: TYPES,
      clone: '/x',
      batch: {
        items: [
          { key: 'a', title: 'A', summary: 'a', fields: { severity: 'high' } },
          { key: 'a', title: 'A again', summary: 'a', links: ['ghost'] },
          { key: 'b', title: 'B', summary: 'b', message: { text: 'Pick one', options: [{ id: 'x', label: 'X', change: { md: [{ find: 'not in the draft', replace: 'y' }] } }, { id: 'custom', label: 'Something else' }], recommended: 'z' } },
        ],
      },
    });
    await expect(attempt).rejects.toThrow(InputError);
    const message = await attempt.catch((e: Error) => e.message);
    expect(message).toMatch(/Nothing was saved/);
    expect(message).toMatch(/key is used twice/);
    expect(message).toMatch(/"severity" isn't a field of Questions/);
    expect(message).toMatch(/links to "ghost"/);
    expect(message).toMatch(/isn't in the draft/);
    expect(message).toMatch(/recommended is "z"/);
    expect(message).toMatch(/reserved for the Custom answer/);
    expect((await readItems(dir)).values).toEqual([]);
    expect((await readProjectFile(dir)).importPending).toEqual(['architecture', 'questions']);
  });

  it('refuses a type that was already imported, and a batch with both or neither', async () => {
    const dir = await importing();
    await writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'None.' } });
    await expect(writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'Again.' } })).rejects.toThrow(/already been imported/);
    await expect(writeImportBatch({ dir, type: architecture, types: TYPES, clone: '/x', batch: {} })).rejects.toThrow(/either items/);
    await expect(
      writeImportBatch({ dir, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'x', items: [{ key: 'k', title: 't', summary: 's' }] } }),
    ).rejects.toThrow(/either items/);
  });

  it("marks types whose importer didn't finish", async () => {
    const dir = await importing();
    await writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'None.' } });
    expect(await finishImport(dir)).toBe(true);
    const p = await readProjectFile(dir);
    expect(p).toMatchObject({ status: 'active', importPending: [] });
    expect(p.emptyTypes.find((e) => e.type === 'architecture')?.reason).toMatch(/didn't finish/);
    expect(await finishImport(dir)).toBe(false);
  });

  it('keeps new item ids clear of existing ones', async () => {
    const dir = await seedProject({ pairs: [pair('questions-who')], project: { status: 'importing', importPending: ['questions'] } });
    const r = await writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { items: [{ key: 'who', title: 'Who?', summary: 's' }] } });
    expect(r.itemIds).toEqual(['questions-who-2']);
  });
});

describe('drawings in an import batch', () => {
  it('writes a diagram as it was sent', async () => {
    const dir = await importing();
    await writeImportBatch({ dir, type: architecture, types: ALL, clone: '/x', batch: { items: [{ key: 'map', title: 'Reminder job', summary: 's', data: reminderMap }] } });
    expect((await readItem(dir, 'architecture-map')).data).toEqual(reminderMap);
  });

  it('a diagram with a line to a missing box writes nothing and says which', async () => {
    const dir = await importing();
    const data = { ...reminderMap, edges: [...reminderMap.edges, { id: 'e2', from: 'job', to: 'email' }] };
    const attempt = writeImportBatch({ dir, type: architecture, types: ALL, clone: '/x', batch: { items: [{ key: 'map', title: 'Reminder job', summary: 's', data }] } });
    await expect(attempt).rejects.toThrow(InputError);
    expect(await attempt.catch((e: Error) => e.message)).toMatch(/Nothing was saved[\s\S]*Item 1 \(map\): Edge "e2" ends at "email", which isn't one of the node ids\./);
    expect((await readItems(dir)).values).toEqual([]);
    expect((await readProjectFile(dir)).importPending).toEqual(['architecture', 'questions']);
  });

  it('refuses data on a plain list type', async () => {
    const dir = await importing();
    const attempt = writeImportBatch({ dir, type: questions, types: ALL, clone: '/x', batch: { items: [{ key: 'who', title: 'Who?', summary: 's', data: { anything: true } }] } });
    expect(await attempt.catch((e: Error) => e.message)).toMatch(/Item 1 \(who\): This plumbing type's items don't take data\. Leave data out\./);
  });

  it('a phase may list existing items and keys from its batch, and is written with ids', async () => {
    const dir = await seedProject({ pairs: [drawn('architecture-map', 'architecture', reminderMap)], project: { status: 'importing', importPending: ['phases'] } });
    await writeImportBatch({
      dir,
      type: phases,
      types: ALL,
      clone: '/x',
      batch: {
        items: [
          { key: 'build', title: 'Build the job', summary: 's', data: { order: 1, goal: 'The job sends reminders.', doneWhen: ['Runs in staging'], itemIds: ['architecture-map'] } },
          { key: 'launch', title: 'Launch', summary: 's', data: { order: 2, goal: 'Everyone gets reminders.', doneWhen: ['On for all customers'], itemIds: ['build', 'architecture-map'] } },
        ],
      },
    });
    expect((await readItem(dir, 'phases-launch')).data).toEqual({ order: 2, goal: 'Everyone gets reminders.', doneWhen: ['On for all customers'], itemIds: ['phases-build', 'architecture-map'] });
  });

  it('refuses a phase that lists an item that does not exist', async () => {
    const dir = await seedProject({ project: { status: 'importing', importPending: ['phases'] } });
    const attempt = writeImportBatch({
      dir,
      type: phases,
      types: ALL,
      clone: '/x',
      batch: { items: [{ key: 'build', title: 'Build', summary: 's', data: { order: 1, goal: 'Ship.', doneWhen: ['Live'], itemIds: ['architecture-ghost'] } }] },
    });
    expect(await attempt.catch((e: Error) => e.message)).toMatch(/Item 1 \(build\): itemIds: there's no item "architecture-ghost"\./);
    expect((await readItems(dir)).values).toEqual([]);
  });

  it("a flow step's mockupId must be a UI item", async () => {
    const pairs = [drawn('ui-account', 'ui', { location: { app: 'web', route: '/account', files: [] }, kit: 'web' }), drawn('questions-who', 'questions')];
    const flow = (mockupId: string) => ({ kind: 'user', steps: [{ n: 1, label: 'Opens the account page', mockupId }] });
    const dir = await seedProject({ pairs, project: { status: 'importing', importPending: ['flows'] } });
    const attempt = writeImportBatch({ dir, type: flows, types: ALL, clone: '/x', batch: { items: [{ key: 'signup', title: 'Turn on reminders', summary: 's', data: flow('questions-who') }] } });
    expect(await attempt.catch((e: Error) => e.message)).toMatch(/Item 1 \(signup\): Step 1: mockupId "questions-who" isn't a UI item\./);
    await writeImportBatch({ dir, type: flows, types: ALL, clone: '/x', batch: { items: [{ key: 'signup', title: 'Turn on reminders', summary: 's', data: flow('ui-account') }] } });
    expect((await readItem(dir, 'flows-signup')).data).toEqual(flow('ui-account'));
  });

  it("checks the data in an opening message's options", async () => {
    const dir = await seedProject({ pairs: [drawn('architecture-map', 'architecture', reminderMap)], project: { status: 'importing', importPending: ['questions'] } });
    const broken = { ...reminderMap, edges: [{ id: 'e1', from: 'queue', to: 'job' }] };
    const attempt = writeImportBatch({
      dir,
      type: questions,
      types: ALL,
      clone: '/x',
      batch: { items: [{ key: 'queue', title: 'Add a queue?', summary: 's', message: { text: 'Queue the sends?', options: [{ id: 'queue', label: 'Use a queue', change: { items: [{ itemId: 'architecture-map', patch: { data: broken } }] } }] } }] },
    });
    expect(await attempt.catch((e: Error) => e.message)).toMatch(/Item 1 \(queue\): Option "queue": Item "architecture-map": Edge "e1" starts at "queue", which isn't one of the node ids\./);
  });

  it("subagents can't set an anchor", () => {
    const anchor = { itemId: 'architecture-map', kind: 'node', ref: 'job', label: 'Daily reminder job' };
    expect(importItemSchema.parse({ key: 'k', title: 't', summary: 's', anchor })).not.toHaveProperty('anchor');
    expect(newItemSchema.parse({ type: 'questions', title: 't', summary: 's', message: { text: 'm' }, anchor })).not.toHaveProperty('anchor');
    expect(itemPatchSchema.safeParse({ anchor }).success).toBe(false);
  });
});
```

In `packages/core/test/reply.test.ts`, replace the imports:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { InputError, projectFiles, readDecisions, readHistory, readItem, readItems, readThread, StoreError } from '../src/store/io';
import { postReply } from '../src/store/reply';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject, TYPES } from './fixtures';
```
with:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { undoChange } from '../src/store/changes';
import { InputError, projectFiles, readDecisions, readHistory, readItem, readItems, readThread, StoreError } from '../src/store/io';
import { postReply } from '../src/store/reply';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, listType, pair, seedProject, TYPES } from './fixtures';
```
and add at the end of the file:
```ts
describe('drawings in replies', () => {
  const ui = listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 });
  const flows = listType('flows', { title: 'Flows', screen: 'flows', order: 4 });
  const phases = listType('phases', { title: 'Phases & milestones', timeline: true, order: 7 });
  const ALL = [...TYPES, ui, flows, phases];
  const drawingReply = (dir: string, r: Parameters<typeof postReply>[1]['reply']) => postReply(dir, { reply: r, types: ALL, autoApply: true, clone: '/nowhere' });
  const withData = (p: ReturnType<typeof pair>, data: unknown) => ({ ...p, item: { ...p.item, data } });
  const signup = {
    kind: 'system',
    lanes: [
      { id: 'web', label: 'Web app', status: 'changed' },
      { id: 'db', label: 'Postgres', status: 'unchanged' },
    ],
    steps: [
      { n: 1, from: 'web', to: 'db', label: 'Save the lead time' },
      { n: 2, from: 'web', to: 'web', label: 'Show the saved card' },
    ],
  };
  const map = {
    kind: 'system',
    groups: [],
    nodes: [
      { id: 'job', label: 'Daily reminder job', status: 'new' },
      { id: 'db', label: 'Postgres', status: 'unchanged' },
    ],
    edges: [{ id: 'e1', from: 'job', to: 'db' }],
  };

  it('a reply whose data patch breaks a reference writes nothing', async () => {
    // Review Focus 4: one bad patch of each kind, each in its own option.
    const phase = { order: 1, goal: 'Ship.', doneWhen: ['Live'], itemIds: ['flows-save'] };
    const card = { location: { app: 'web', route: '/account', files: [] }, kit: 'web', after: '<div class="p-4">Restock soon</div>' };
    const dir = await seedProject({
      pairs: [
        withData(asked('flows-save', { type: 'flows' }), signup),
        withData(pair('architecture-map', { type: 'architecture' }), map),
        withData(pair('phases-build', { type: 'phases' }), phase),
        withData(pair('ui-card', { type: 'ui' }), card),
      ],
    });
    const broken = {
      flow: { ...signup, steps: [...signup.steps, { n: 3, from: 'queue', to: 'db', label: 'Retry later' }] },
      diagram: { ...map, edges: [...map.edges, { id: 'e2', from: 'job', to: 'email' }] },
      phase: { ...phase, itemIds: ['flows-save', 'ghost'] },
      mockup: { ...card, after: '<div class="p-4">Restock soon</div><script>alert(1)</script>' },
    };
    const attempt = drawingReply(dir, {
      threadId: 't-flows-save',
      text: 'A queue would let failed saves retry.',
      smallEdits: [{ summary: 'Wording', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log each reminder in a table.' }] } }],
      options: [
        { id: 'queue', label: 'Retry through a queue', change: { items: [{ itemId: 'flows-save', patch: { data: broken.flow } }] } },
        { id: 'email', label: 'Send an email too', change: { items: [{ itemId: 'architecture-map', patch: { data: broken.diagram } }] } },
        { id: 'later', label: 'Plan it in the first phase', change: { items: [{ itemId: 'phases-build', patch: { data: broken.phase } }] } },
        { id: 'banner', label: 'Show it on the card', change: { items: [{ itemId: 'ui-card', patch: { data: broken.mockup } }] } },
        { id: 'keep', label: 'Keep it as it is' },
      ],
    });
    await expect(attempt).rejects.toThrow(InputError);
    const message = await attempt.catch((e: Error) => e.message);
    expect(message).toMatch(/Option "queue": Item "flows-save": Step 3 starts on lane "queue", which isn't one of the lane ids\./);
    expect(message).toMatch(/Option "email": Item "architecture-map": Edge "e2" ends at "email", which isn't one of the node ids\./);
    expect(message).toMatch(/Option "later": Item "phases-build": itemIds: there's no item "ghost"\./);
    expect(message).toMatch(/Option "banner": Item "ui-card": after: remove the <script> tags\. Mockups can't run scripts\./);
    // Nothing is written: not the small edit, not the message, not any item.
    const thread = await readThread(dir, 't-flows-save');
    expect(thread.status).toBe('with_claude');
    expect(thread.messages).toHaveLength(2);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
    expect((await readItem(dir, 'flows-save')).data).toEqual(signup);
    expect((await readItem(dir, 'architecture-map')).data).toEqual(map);
    expect((await readItem(dir, 'phases-build')).data).toEqual(phase);
    expect((await readItem(dir, 'ui-card')).data).toEqual(card);
  });

  it('a small edit with valid data applies and can be undone', async () => {
    const dir = await seedProject({ pairs: [withData(asked('architecture-map', { type: 'architecture' }), map)] });
    const renamed = { ...map, nodes: [{ id: 'job', label: 'Nightly reminder job', status: 'new' }, map.nodes[1]] };
    const r = await drawingReply(dir, {
      threadId: 't-architecture-map',
      text: 'Renamed the job box.',
      smallEdits: [{ summary: 'Box name', change: { items: [{ itemId: 'architecture-map', patch: { data: renamed } }] } }],
    });
    expect((await readItem(dir, 'architecture-map')).data).toEqual(renamed);
    await undoChange(dir, r.edits[0].id);
    expect((await readItem(dir, 'architecture-map')).data).toEqual(map);
  });

  it("checks small edits' and new items' data against the project", async () => {
    const phase = { order: 1, goal: 'Ship.', doneWhen: ['Live'], itemIds: [] };
    const dir = await seedProject({ pairs: [asked('q1'), withData(pair('phases-build', { type: 'phases' }), phase)] });
    const attempt = drawingReply(dir, {
      threadId: 't-q1',
      text: 'x',
      smallEdits: [{ summary: 'Phase items', change: { items: [{ itemId: 'phases-build', patch: { data: { ...phase, itemIds: ['ghost'] } } }] } }],
      newItems: [
        { type: 'flows', title: 'Turn on reminders', summary: 's', data: { kind: 'user', steps: [{ n: 1, label: 'Opens settings', mockupId: 'q1' }] }, message: { text: 'Is this the flow?' } },
        { type: 'questions', title: 'Lead time?', summary: 's', data: { order: 1 }, message: { text: 'How many days?' } },
      ],
    });
    await expect(attempt).rejects.toThrow(InputError);
    const message = await attempt.catch((e: Error) => e.message);
    expect(message).toMatch(/Small edit 1: Item "phases-build": itemIds: there's no item "ghost"\./);
    expect(message).toMatch(/New item 1 \(Turn on reminders\): Step 1: mockupId "q1" isn't a UI item\./);
    expect(message).toMatch(/New item 2 \(Lead time\?\): This plumbing type's items don't take data\./);
    expect((await readItems(dir)).values).toHaveLength(2);
    expect(await readHistory(dir)).toEqual([]);
  });

  it('a new flow may point at a UI item from the same reply', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const r = await drawingReply(dir, {
      threadId: 't-q1',
      text: 'Here is the screen, and the flow through it.',
      newItems: [
        { type: 'ui', title: 'Restock card', summary: 's', data: { location: { app: 'web', route: '/account', files: [] }, kit: 'web', after: '<div class="p-4">Restock soon</div>' }, message: { text: 'Like this?' } },
        { type: 'flows', title: 'Turn on reminders', summary: 's', data: { kind: 'user', steps: [{ n: 1, label: 'Opens the card', mockupId: 'ui-restock-card' }] }, message: { text: 'And this flow?' } },
      ],
    });
    expect(r.newThreadIds).toEqual(['t-ui-restock-card', 't-flows-turn-on-reminders']);
  });

  it('items without data still take replies', async () => {
    const legacyUi = withData(asked('ui-account', { type: 'ui' }), { location: { app: 'web', route: '/account', files: [] }, kit: 'web' });
    const dir = await seedProject({ pairs: [legacyUi, asked('flows-old', { type: 'flows' })] });
    await drawingReply(dir, { threadId: 't-ui-account', text: 'Renamed it.', smallEdits: [{ summary: 'Title', change: { items: [{ itemId: 'ui-account', patch: { title: 'Account page' } }] } }] });
    await drawingReply(dir, {
      threadId: 't-flows-old',
      text: 'Which way?',
      options: [
        { id: 'short', label: 'Shorter summary', change: { items: [{ itemId: 'flows-old', patch: { summary: 'Shorter.' } }] } },
        { id: 'keep', label: 'Keep it' },
      ],
    });
    expect((await readItem(dir, 'ui-account')).title).toBe('Account page');
    expect((await readThread(dir, 't-flows-old')).status).toBe('your_turn');
  });
});
```

- [ ] **Step 2: Write the failing service test**

In `packages/service/test/claude.test.ts`, in `describe('importing', …)`, add after the test `'refuses a bad batch and says why'`:
```ts
  it('refuses a diagram whose line ends at a missing box', async () => {
    const t = await setup();
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN });
    const data = { kind: 'system', nodes: [{ id: 'job', label: 'Daily reminder job', status: 'new' }], edges: [{ id: 'e1', from: 'job', to: 'db' }] };
    const r = await t.claude('/items', { repo: 'acme-app', project: open.body.project, type: 'architecture', items: [{ key: 'map', title: 'Reminder job', summary: 's', data }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Item 1 \(map\): Edge "e1" ends at "db", which isn't one of the node ids\./);
    const ok = await t.claude('/items', { repo: 'acme-app', project: open.body.project, type: 'architecture', items: [{ key: 'map', title: 'Reminder job', summary: 's', data: { ...data, edges: [] } }] });
    expect(ok.body.itemIds).toEqual(['architecture-map']);
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/importItems.test.ts packages/core/test/reply.test.ts packages/service/test/claude.test.ts`
Expected: FAIL. The new drawing tests fail because broken drawings are written instead of refused (for example `promise resolved "{ itemIds: [ 'architecture-map' ], … }" instead of rejecting`), and the service test gets 200 instead of 400. The Plan 2 tests still pass.

- [ ] **Step 4: Add the shared data checks**

In `packages/core/src/store/validate.ts`, replace the first line:
```ts
import { applyMdPatches, type Change, type Option, type PlumbingType } from '../schemas';
```
with:
```ts
import {
  applyMdPatches,
  dataKindOf,
  dataProblems,
  type Change,
  type DataContext,
  type DataKind,
  type Item,
  type Option,
  type PlumbingType,
} from '../schemas';
```
and add these above `export const nothingSaved`:
```ts
/**
 * What data checks need to know about a project's items. kindOfItem gives an item's data kind (null for plain list
 * items and items whose type is gone), or undefined when there's no such item. mockupItemIds are the UI items.
 */
export function itemDataKinds(items: Item[], types: PlumbingType[]): { kindOfItem: (itemId: string) => DataKind | null | undefined; mockupItemIds: Set<string> } {
  const typeById = new Map(types.map((t) => [t.id, t]));
  const kinds = new Map<string, DataKind | null>();
  for (const i of items) {
    const type = typeById.get(i.type);
    kinds.set(i.id, type ? dataKindOf(type) : null);
  }
  return { kindOfItem: (id) => kinds.get(id), mockupItemIds: new Set(items.filter((i) => kinds.get(i.id) === 'mockups').map((i) => i.id)) };
}

/** Problems with the data a change would write into items. Items that don't exist are left to changeProblems. */
export function changeDataProblems(change: Change, kindOfItem: (itemId: string) => DataKind | null | undefined, ctx: DataContext): string[] {
  const problems: string[] = [];
  for (const c of change.items ?? []) {
    if (c.patch.data === undefined) continue;
    const kind = kindOfItem(c.itemId);
    if (kind === undefined) continue;
    problems.push(...dataProblems(kind, c.patch.data, ctx).map((p) => `Item "${c.itemId}": ${p}`));
  }
  return problems;
}

/** changeDataProblems for every option's change, each prefixed with its option id. */
export function optionDataProblems(options: Option[] | undefined, kindOfItem: (itemId: string) => DataKind | null | undefined, ctx: DataContext): string[] {
  return (options ?? []).flatMap((o) => (o.change ? changeDataProblems(o.change, kindOfItem, ctx).map((p) => `Option "${o.id}": ${p}`) : []));
}
```

- [ ] **Step 5: Check data in importer batches**

In `packages/core/src/store/importItems.ts`, replace the imports:
```ts
import type { CodeRef, ImportBatch, Item, Message, PlumbingType } from '../schemas';
import { InputError, newId, readDocText, readItems, readProjectFile, writeItem, writeProjectFile, writeThread } from './io';
import { fieldProblems, messageProblems, nothingSaved } from './validate';
```
with:
```ts
import { dataKindOf, dataProblems, parseData, type CodeRef, type ImportBatch, type Item, type Message, type PlumbingType } from '../schemas';
import { InputError, newId, readDocText, readItems, readProjectFile, writeItem, writeProjectFile, writeThread } from './io';
import { fieldProblems, itemDataKinds, messageProblems, nothingSaved, optionDataProblems } from './validate';
```

Replace the start of `writeImportBatch`:
```ts
export async function writeImportBatch(o: {
  dir: string;
  type: PlumbingType;
  batch: ImportBatch;
  clone: string;
  now?: Date;
}): Promise<{ itemIds: string[]; importFinished: boolean }> {
```
with:
```ts
/** Phase data may list items by batch key, like links. They're written as item ids. */
function phaseWithIds(data: unknown, idFor: Map<string, string>): unknown {
  const parsed = parseData('timeline', data);
  return parsed.ok ? { ...parsed.data, itemIds: parsed.data.itemIds.map((k) => idFor.get(k) ?? k) } : data;
}

export async function writeImportBatch(o: {
  dir: string;
  type: PlumbingType;
  /** Every plumbing type, so data can be checked against other items (a flow step's mockupId must be a UI item). */
  types: PlumbingType[];
  batch: ImportBatch;
  clone: string;
  now?: Date;
}): Promise<{ itemIds: string[]; importFinished: boolean }> {
```

Replace the checks, from `const existingIds` to `const itemIds: string[] = [];`:
```ts
  const existingIds = new Set(existing.map((i) => i.id));
  const keys = new Set<string>();
  const problems: string[] = [];
  items.forEach((it, i) => {
    const where = `Item ${i + 1} (${it.key})`;
    if (keys.has(it.key)) problems.push(`${where}: the key is used twice.`);
    keys.add(it.key);
    problems.push(...fieldProblems(it.fields, o.type).map((p) => `${where}: ${p}`));
    if (it.message) problems.push(...messageProblems(it.message, draft, existingIds).map((p) => `${where}: ${p}`));
  });
  for (const it of items) {
    for (const link of it.links ?? []) {
      if (!keys.has(link) && !existingIds.has(link)) problems.push(`Item ${it.key}: links to "${link}", which isn't a key in this batch or an existing item id.`);
    }
  }
  if (problems.length) throw nothingSaved(problems, 'call dp_write_items again with the whole batch');

  const taken = new Set(existingIds);
  const idFor = new Map(items.map((it) => [it.key, uniqueId(`${o.type.id}-${it.key}`, taken)]));
  const itemIds: string[] = [];
```
with:
```ts
  const existingIds = new Set(existing.map((i) => i.id));
  const taken = new Set(existingIds);
  const idFor = new Map(items.map((it) => [it.key, uniqueId(`${o.type.id}-${it.key}`, taken)]));
  const kind = dataKindOf(o.type);
  const { kindOfItem, mockupItemIds } = itemDataKinds(existing, o.types);
  const newIds = [...idFor.values()];
  // Option changes are stored as written, so they name items by id. An item's own data may also use keys from this
  // batch, as links do: phase itemIds are swapped for ids when the item is written.
  const changeCtx = {
    itemIds: new Set([...existingIds, ...newIds]),
    mockupItemIds: kind === 'mockups' ? new Set([...mockupItemIds, ...newIds]) : mockupItemIds,
  };
  const dataCtx = { ...changeCtx, itemIds: new Set([...changeCtx.itemIds, ...items.map((it) => it.key)]) };
  const keys = new Set<string>();
  const problems: string[] = [];
  items.forEach((it, i) => {
    const where = `Item ${i + 1} (${it.key})`;
    if (keys.has(it.key)) problems.push(`${where}: the key is used twice.`);
    keys.add(it.key);
    problems.push(...fieldProblems(it.fields, o.type).map((p) => `${where}: ${p}`));
    problems.push(...dataProblems(kind, it.data, dataCtx).map((p) => `${where}: ${p}`));
    if (it.message) {
      problems.push(...messageProblems(it.message, draft, existingIds).map((p) => `${where}: ${p}`));
      problems.push(...optionDataProblems(it.message.options, kindOfItem, changeCtx).map((p) => `${where}: ${p}`));
    }
  });
  for (const it of items) {
    for (const link of it.links ?? []) {
      if (!keys.has(link) && !existingIds.has(link)) problems.push(`Item ${it.key}: links to "${link}", which isn't a key in this batch or an existing item id.`);
    }
  }
  if (problems.length) throw nothingSaved(problems, 'call dp_write_items again with the whole batch');

  const itemIds: string[] = [];
```

In the `item` object, replace:
```ts
      ...(it.data !== undefined ? { data: it.data } : {}),
```
with:
```ts
      ...(it.data !== undefined ? { data: kind === 'timeline' ? phaseWithIds(it.data, idFor) : it.data } : {}),
```

- [ ] **Step 6: Check data in replies**

In `packages/core/src/store/reply.ts`, replace the first import line:
```ts
import { applyMdPatches, type ClaudeMessage, type HistoryEntry, type PlumbingType, type ReplyInput, type Thread } from '../schemas';
```
with:
```ts
import { applyMdPatches, dataKindOf, dataProblems, type ClaudeMessage, type HistoryEntry, type PlumbingType, type ReplyInput, type Thread } from '../schemas';
```
and the `./validate` import:
```ts
import { fieldProblems, messageProblems, nothingSaved } from './validate';
```
with:
```ts
import { changeDataProblems, fieldProblems, itemDataKinds, messageProblems, nothingSaved, optionDataProblems } from './validate';
```

Replace the checks, from `const itemIds = new Set(items.map((i) => i.id));` to the end of the `newItems` loop:
```ts
  const itemIds = new Set(items.map((i) => i.id));
  const problems: string[] = [];
  if (r.resolve && r.options) problems.push('Send options or resolve, not both.');
  if (r.recommended && !r.options) problems.push('recommended needs options.');

  // Small edits are checked in order, each against the draft as the ones before it leave it.
  let edited = draft;
  (r.smallEdits ?? []).forEach((e, i) => {
    const where = `Small edit ${i + 1}`;
    if (e.change.md?.some((p) => p.replace === '')) problems.push(`${where}: a small edit can't delete text outright. Keep a few surrounding words in both find and replace.`);
    if (e.change.md?.length) {
      const res = applyMdPatches(edited, e.change.md);
      if (res.ok) edited = res.text;
      else problems.push(`${where}: ${res.error}`);
    }
    for (const c of e.change.items ?? []) if (!itemIds.has(c.itemId)) problems.push(`${where}: there's no item "${c.itemId}".`);
  });
  // Options must fit the draft as the user will see it: after the small edits, when those apply straight away.
  const base = o.autoApply ? edited : draft;
  problems.push(...messageProblems(r, base, itemIds));
  const enabled = new Map(o.types.filter((t) => t.enabled).map((t) => [t.id, t]));
  (r.newItems ?? []).forEach((n, i) => {
    const where = `New item ${i + 1} (${n.title})`;
    const type = enabled.get(n.type);
    if (!type) {
      problems.push(`${where}: "${n.type}" isn't an enabled plumbing type. Use one of: ${[...enabled.keys()].join(', ')}.`);
      return;
    }
    problems.push(...fieldProblems(n.fields, type).map((p) => `${where}: ${p}`));
    problems.push(...messageProblems(n.message, base, itemIds).map((p) => `${where}: ${p}`));
  });
```
with:
```ts
  const itemIds = new Set(items.map((i) => i.id));
  const enabled = new Map(o.types.filter((t) => t.enabled).map((t) => [t.id, t]));
  const newItems = r.newItems ?? [];
  // New items' ids are worked out up front, so data in this reply may name them.
  const taken = new Set(itemIds);
  const newIds = newItems.map((n) => uniqueId(`${n.type}-${slugify(n.title)}`, taken));
  const { kindOfItem, mockupItemIds } = itemDataKinds(items, o.types);
  const ctx = {
    itemIds: new Set([...itemIds, ...newIds]),
    mockupItemIds: new Set([...mockupItemIds, ...newIds.filter((_, i) => enabled.get(newItems[i].type)?.screen === 'mockups')]),
  };
  const problems: string[] = [];
  if (r.resolve && r.options) problems.push('Send options or resolve, not both.');
  if (r.recommended && !r.options) problems.push('recommended needs options.');

  // Small edits are checked in order, each against the draft as the ones before it leave it.
  let edited = draft;
  (r.smallEdits ?? []).forEach((e, i) => {
    const where = `Small edit ${i + 1}`;
    if (e.change.md?.some((p) => p.replace === '')) problems.push(`${where}: a small edit can't delete text outright. Keep a few surrounding words in both find and replace.`);
    if (e.change.md?.length) {
      const res = applyMdPatches(edited, e.change.md);
      if (res.ok) edited = res.text;
      else problems.push(`${where}: ${res.error}`);
    }
    for (const c of e.change.items ?? []) if (!itemIds.has(c.itemId)) problems.push(`${where}: there's no item "${c.itemId}".`);
    problems.push(...changeDataProblems(e.change, kindOfItem, ctx).map((p) => `${where}: ${p}`));
  });
  // Options must fit the draft as the user will see it: after the small edits, when those apply straight away.
  const base = o.autoApply ? edited : draft;
  problems.push(...messageProblems(r, base, itemIds));
  problems.push(...optionDataProblems(r.options, kindOfItem, ctx));
  newItems.forEach((n, i) => {
    const where = `New item ${i + 1} (${n.title})`;
    const type = enabled.get(n.type);
    if (!type) {
      problems.push(`${where}: "${n.type}" isn't an enabled plumbing type. Use one of: ${[...enabled.keys()].join(', ')}.`);
      return;
    }
    problems.push(...fieldProblems(n.fields, type).map((p) => `${where}: ${p}`));
    problems.push(...dataProblems(dataKindOf(type), n.data, ctx).map((p) => `${where}: ${p}`));
    problems.push(...messageProblems(n.message, base, itemIds).map((p) => `${where}: ${p}`));
    problems.push(...optionDataProblems(n.message.options, kindOfItem, ctx).map((p) => `${where}: ${p}`));
  });
```

The new ids are now worked out before the checks, so the write loop reuses them. Replace:
```ts
  const codeRefs = await Promise.all((r.newItems ?? []).map((n) => (n.codeRefs?.length ? verifyCodeRefs(o.clone, n.codeRefs) : Promise.resolve(undefined))));

  const edits: HistoryEntry[] = [];
  for (const e of r.smallEdits ?? []) {
    edits.push(await recordChange(dir, { threadId: thread.id, kind: 'small-edit', summary: e.summary, change: e.change, apply: o.autoApply, now }));
  }

  const taken = new Set(itemIds);
  const newItemIds: string[] = [];
  for (const [i, n] of (r.newItems ?? []).entries()) {
    const id = uniqueId(`${n.type}-${slugify(n.title)}`, taken);
```
with:
```ts
  const codeRefs = await Promise.all(newItems.map((n) => (n.codeRefs?.length ? verifyCodeRefs(o.clone, n.codeRefs) : Promise.resolve(undefined))));

  const edits: HistoryEntry[] = [];
  for (const e of r.smallEdits ?? []) {
    edits.push(await recordChange(dir, { threadId: thread.id, kind: 'small-edit', summary: e.summary, change: e.change, apply: o.autoApply, now }));
  }

  const newItemIds: string[] = [];
  for (const [i, n] of newItems.entries()) {
    const id = newIds[i];
```
The rest of the loop is unchanged.

- [ ] **Step 7: Pass the types from the `/items` route**

In `packages/service/src/routes/claude.ts`, in `r.post('/items', …)`, replace:
```ts
        writeImportBatch({ dir: ref.dir, type, batch: { items: body.items, noChanges: body.noChanges }, clone }),
```
with:
```ts
        writeImportBatch({ dir: ref.dir, type, types: cfg.types, batch: { items: body.items, noChanges: body.noChanges }, clone }),
```
`cfg.types` includes disabled types, so items of a type that was turned off later still have a known kind.

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run packages/core/test/importItems.test.ts packages/core/test/reply.test.ts packages/service/test/claude.test.ts`
Expected: PASS.

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

Run: `pnpm test:e2e`
Expected: PASS. The e2e importers write no `data`, so nothing they send is newly refused.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/store/validate.ts packages/core/src/store/importItems.ts packages/core/src/store/reply.ts packages/core/test/importItems.test.ts packages/core/test/reply.test.ts packages/service/src/routes/claude.ts packages/service/test/claude.test.ts
git commit -m "feat(core): every write of an item's data is checked against its screen's shape" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Checks against the code: Prisma schema and file references

Drawings are checked against the plan's clone when you look at them, never when Claude writes. A diagram box's file reference gets ✓ when the file (and symbol) is in the clone. A table diff is compared with the repo profile's Prisma schema. This task adds a small Prisma schema reader and `createDataChecker`, which the screens and thread view use from Task 6. Results are returned, never stored.

**Files:**
- Create:
  - `packages/core/src/prisma.ts`
  - `packages/core/src/prisma.test.ts`
  - `packages/core/src/store/checks.ts`
  - `packages/core/test/checks.test.ts`
- Modify:
  - `packages/core/src/schemas/views.ts` (the `DataChecks` type)
  - `packages/core/src/index.ts` (export `./prisma` and `./store/checks`)
- Test:
  - `packages/core/src/prisma.test.ts`
  - `packages/core/test/checks.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `parseData`, `DataKind`, `DiagramData`, `TableDiff`.
  - Plan 2: `verifyCodeRefs` (`store/importItems.ts`), `RepoProfile`.
- Produces (exported from `@dev-plumbing/core`; `DataChecks` also from `@dev-plumbing/core/schemas`), exactly as in the header's Contracts:
  - `PrismaSchema = { models: Map<string, Map<string, string>>; enums: Set<string> }` and `parsePrismaSchema(text: string): PrismaSchema`
  - `DataChecks` in `schemas/views.ts`
  - `DataChecker = { check(kind: DataKind | null, data: unknown): Promise<DataChecks | null> }`
  - `createDataChecker(o: { clone: string | null; profile: RepoProfile | undefined }): DataChecker`
- **Behaviour:**
  - `diagram`: `{ kind: 'diagram', checked: true, nodes }`, with one entry per box that has a `codeRef`. With a `null` clone, `{ kind: 'diagram', checked: false, reason: "The plan's clone isn't on this Mac any more.", nodes: {} }`, so the screen says "Not checked" instead of showing every box as not found.
  - `database`: the schema is read at most once per checker (a cached promise), and only from inside the clone, after resolving links.
  - Other kinds, `null`, and data that doesn't parse all give `null`.
  - Warnings, exactly:
    - `There's already a model called X in the schema.` (table `new`)
    - `There's no model called X in the schema.` (table `changed` or `removed`)
    - `X.f is added but already in the schema.`
    - `X.f isn't in the schema.` (field `changed`, `removed` or `unchanged`)
    - `X.f is Int in the schema, not String.` (field `unchanged`, types compared without trailing whitespace)
  - Reasons, exactly as in the header: "No schema file is set in the repo profile.", "The repo profile's schema isn't Prisma, so it isn't checked.", "The plan's clone isn't on this Mac any more.", "The schema file isn't in the clone: <path>." A path outside the clone, directly or through a symlink, gets the last one.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/prisma.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parsePrismaSchema } from './prisma';

const ACME = `// Acme's database.
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// A person who buys from Acme.
model Customer {
  id            String         @id @default(cuid())
  email         String         @unique
  name          String?
  subscriptions Subscription[]
  createdAt     DateTime       @default(now())
}

model Subscription {
  id         String             @id @default(cuid())
  customer   Customer           @relation(fields: [customerId], references: [id], onDelete: Cascade)
  customerId String
  status     SubscriptionStatus @default(ACTIVE) // paused ones get no reminders
  website    String             @default("https://acme.test//shop")
  price      Decimal            @db.Decimal(10, 2)
  search     Unsupported("tsvector")?
  orders     Order[]

  @@index([customerId])
  @@map("subscriptions")
}

model Order {
  id             String       @id
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  subscriptionId String
  tags           String[]
}

enum SubscriptionStatus {
  ACTIVE
  PAUSED // for now
  CANCELLED
}
`;

describe('reading a Prisma schema', () => {
  it('reads models, their fields with types as written, and enums', () => {
    const s = parsePrismaSchema(ACME);
    expect([...s.models.keys()]).toEqual(['Customer', 'Subscription', 'Order']);
    expect(Object.fromEntries(s.models.get('Customer')!)).toEqual({
      id: 'String',
      email: 'String',
      name: 'String?',
      subscriptions: 'Subscription[]',
      createdAt: 'DateTime',
    });
    expect(Object.fromEntries(s.models.get('Subscription')!)).toEqual({
      id: 'String',
      customer: 'Customer',
      customerId: 'String',
      status: 'SubscriptionStatus',
      website: 'String',
      price: 'Decimal',
      search: 'Unsupported("tsvector")?',
      orders: 'Order[]',
    });
    expect(s.models.get('Order')?.get('tags')).toBe('String[]');
    expect([...s.enums]).toEqual(['SubscriptionStatus']);
  });

  it("skips what it doesn't understand instead of throwing", () => {
    expect(parsePrismaSchema('')).toEqual({ models: new Map(), enums: new Set() });
    const s = parsePrismaSchema('model Half {\n  id String\n  ??? nonsense\n');
    expect(Object.fromEntries(s.models.get('Half')!)).toEqual({ id: 'String' });
  });
});
```

`packages/core/test/checks.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { repoProfileSchema, type TableDiff } from '../src/schemas';
import { createDataChecker } from '../src/store/checks';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

const SCHEMA_PATH = 'packages/db/prisma/schema.prisma';
const SCHEMA = `model Customer {
  id            String         @id @default(cuid())
  email         String         @unique
  subscriptions Subscription[]
}

model Subscription {
  id         String             @id @default(cuid())
  customer   Customer           @relation(fields: [customerId], references: [id])
  customerId String
  status     SubscriptionStatus @default(ACTIVE)
  note       String?
}

enum SubscriptionStatus {
  ACTIVE
  PAUSED
}
`;

const profile = (schema?: { type: 'prisma' | 'sql' | 'other'; path: string }) =>
  repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'], ...(schema ? { schema } : {}) });
const prisma = profile({ type: 'prisma', path: SCHEMA_PATH });

/** A clone with the Acme schema and one page, and a second schema file just outside the clone. */
async function makeClone(): Promise<{ clone: string; outside: string }> {
  const root = tempDir('dp-checks-');
  const clone = path.join(root, 'clone');
  await fs.mkdir(path.join(clone, 'packages', 'db', 'prisma'), { recursive: true });
  await fs.writeFile(path.join(clone, SCHEMA_PATH), SCHEMA);
  await fs.mkdir(path.join(clone, 'apps', 'web', 'app', 'account'), { recursive: true });
  await fs.writeFile(path.join(clone, 'apps', 'web', 'app', 'account', 'page.tsx'), 'export default function AccountPage() {}\n');
  const outside = path.join(root, 'outside', 'schema.prisma');
  await fs.mkdir(path.dirname(outside), { recursive: true });
  await fs.writeFile(outside, 'model Invoice {\n  id String\n}\n');
  return { clone, outside };
}

const table = (t: Partial<TableDiff> & Pick<TableDiff, 'model' | 'change'>): TableDiff => ({ fields: [], schemaDiff: '', ...t });

describe('checking tables against the Prisma schema', () => {
  it('warns where a table disagrees with the schema in the clone', async () => {
    const { clone } = await makeClone();
    const checker = createDataChecker({ clone, profile: prisma });
    const warnings = async (t: TableDiff) => {
      const r = await checker.check('database', t);
      return r?.kind === 'database' ? r.warnings : r;
    };
    expect(await checker.check('database', table({ model: 'RestockReminder', change: 'new', fields: [{ name: 'id', type: 'String', change: 'added' }] }))).toEqual({
      kind: 'database',
      checked: true,
      file: SCHEMA_PATH,
      warnings: [],
    });
    expect(await warnings(table({ model: 'Customer', change: 'new' }))).toEqual(["There's already a model called Customer in the schema."]);
    expect(await warnings(table({ model: 'Invoice', change: 'changed' }))).toEqual(["There's no model called Invoice in the schema."]);
    expect(await warnings(table({ model: 'Invoice', change: 'removed' }))).toEqual(["There's no model called Invoice in the schema."]);
    const subscription = table({
      model: 'Subscription',
      change: 'changed',
      fields: [
        { name: 'id', type: 'String', change: 'unchanged' },
        { name: 'customerId', type: 'String', change: 'added' },
        { name: 'reminderLeadDays', type: 'Int', change: 'added', default: '5' },
        { name: 'pausedAt', type: 'DateTime?', change: 'changed' },
        { name: 'legacyFlag', type: 'Boolean', change: 'removed' },
        { name: 'status', type: 'String', change: 'unchanged' },
        { name: 'note', type: 'String?  ', change: 'unchanged' },
        { name: 'ghost', type: 'String', change: 'unchanged' },
      ],
    });
    expect(await warnings(subscription)).toEqual([
      'Subscription.customerId is added but already in the schema.',
      "Subscription.pausedAt isn't in the schema.",
      "Subscription.legacyFlag isn't in the schema.",
      'Subscription.status is SubscriptionStatus in the schema, not String.',
      "Subscription.ghost isn't in the schema.",
    ]);
  });

  it("says why a table wasn't checked", async () => {
    const { clone, outside } = await makeClone();
    const t = table({ model: 'Customer', change: 'changed' });
    const reason = async (o: Parameters<typeof createDataChecker>[0]) => {
      const r = await createDataChecker(o).check('database', t);
      return r?.kind === 'database' && !r.checked ? r.reason : r;
    };
    expect(await reason({ clone, profile: undefined })).toBe('No schema file is set in the repo profile.');
    expect(await reason({ clone, profile: profile() })).toBe('No schema file is set in the repo profile.');
    expect(await reason({ clone, profile: profile({ type: 'sql', path: 'db/schema.sql' }) })).toBe("The repo profile's schema isn't Prisma, so it isn't checked.");
    expect(await reason({ clone: null, profile: prisma })).toBe("The plan's clone isn't on this Mac any more.");
    expect(await reason({ clone, profile: profile({ type: 'prisma', path: 'prisma/schema.prisma' }) })).toBe("The schema file isn't in the clone: prisma/schema.prisma.");
    expect(await reason({ clone, profile: profile({ type: 'prisma', path: '../outside/schema.prisma' }) })).toBe("The schema file isn't in the clone: ../outside/schema.prisma.");
    expect(await reason({ clone, profile: profile({ type: 'prisma', path: outside }) })).toBe(`The schema file isn't in the clone: ${outside}.`);
    await fs.symlink(outside, path.join(clone, 'linked.prisma'));
    expect(await reason({ clone, profile: profile({ type: 'prisma', path: 'linked.prisma' }) })).toBe("The schema file isn't in the clone: linked.prisma.");
  });

  it('reads the schema file once per checker', async () => {
    const { clone } = await makeClone();
    const checker = createDataChecker({ clone, profile: prisma });
    const t = table({ model: 'Customer', change: 'new' });
    expect(await checker.check('database', t)).toMatchObject({ checked: true });
    await fs.rm(path.join(clone, SCHEMA_PATH));
    expect(await checker.check('database', t)).toEqual({ kind: 'database', checked: true, file: SCHEMA_PATH, warnings: ["There's already a model called Customer in the schema."] });
    expect(await createDataChecker({ clone, profile: prisma }).check('database', t)).toMatchObject({ checked: false });
  });
});

describe('checking diagram boxes against the clone', () => {
  const diagram = {
    kind: 'system',
    nodes: [
      { id: 'page', label: 'Account page', status: 'changed', codeRef: { path: 'apps/web/app/account/page.tsx' } },
      { id: 'page-fn', label: 'AccountPage', status: 'changed', codeRef: { path: 'apps/web/app/account/page.tsx', symbol: 'AccountPage' } },
      { id: 'card', label: 'Restock card', status: 'new', codeRef: { path: 'apps/web/app/account/page.tsx', symbol: 'RestockCard' } },
      { id: 'gone', label: 'Old job', status: 'changed', codeRef: { path: 'apps/worker/old-job.ts' } },
      { id: 'email', label: 'Email provider', status: 'external' },
    ],
  };

  it('marks each box whose file reference is found', async () => {
    const { clone } = await makeClone();
    expect(await createDataChecker({ clone, profile: prisma }).check('diagram', diagram)).toEqual({
      kind: 'diagram',
      checked: true,
      nodes: { page: true, 'page-fn': true, card: false, gone: false },
    });
  });

  it("says the boxes weren't checked without a clone", async () => {
    expect(await createDataChecker({ clone: null, profile: prisma }).check('diagram', diagram)).toEqual({
      kind: 'diagram',
      checked: false,
      reason: "The plan's clone isn't on this Mac any more.",
      nodes: {},
    });
  });

  it('checks only diagrams and tables, and only data that parses', async () => {
    const { clone } = await makeClone();
    const checker = createDataChecker({ clone, profile: prisma });
    expect(await checker.check('mockups', { location: { app: 'web' }, kit: 'web' })).toBeNull();
    expect(await checker.check('flows', { kind: 'user', steps: [{ n: 1, label: 'Opens it' }] })).toBeNull();
    expect(await checker.check(null, { anything: true })).toBeNull();
    expect(await checker.check('diagram', { kind: 'system', nodes: [] })).toBeNull();
    expect(await checker.check('database', { model: 'Customer' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/src/prisma.test.ts packages/core/test/checks.test.ts`
Expected: FAIL, because `./prisma` and `../src/store/checks` can't be resolved.

- [ ] **Step 3: Write the Prisma schema reader**

`packages/core/src/prisma.ts`:
```ts
/** The parts of a Prisma schema the database checks need. Field types are as written: 'String?', 'Order[]'. */
export type PrismaSchema = { models: Map<string, Map<string, string>>; enums: Set<string> };

const BLOCK_START = /^(model|enum|view|type|datasource|generator)\s+(\w+)\s*\{\s*(?:\/\/.*)?$/;
// A field's name, then its type: a plain or dotted name with ? or [] after it, or Unsupported("…") with ? after it.
const FIELD = /^(\w+)\s+(Unsupported\("(?:[^"\\]|\\.)*"\)\??|[A-Za-z_][\w.]*(?:\[\])?\??)/;

/** Reads model and enum blocks, line by line. Anything it doesn't understand is skipped, so it never throws. */
export function parsePrismaSchema(text: string): PrismaSchema {
  const models = new Map<string, Map<string, string>>();
  const enums = new Set<string>();
  let fields: Map<string, string> | null = null;
  let inBlock = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (!inBlock) {
      const start = BLOCK_START.exec(line);
      if (!start) continue;
      inBlock = true;
      if (start[1] === 'model') {
        fields = new Map();
        models.set(start[2], fields);
      } else if (start[1] === 'enum') {
        enums.add(start[2]);
      }
      continue;
    }
    if (line.startsWith('}')) {
      inBlock = false;
      fields = null;
      continue;
    }
    if (!fields || line.startsWith('@@')) continue;
    const field = FIELD.exec(line);
    if (field) fields.set(field[1], field[2]);
  }
  return { models, enums };
}
```

- [ ] **Step 4: Add the `DataChecks` view type**

At the end of `packages/core/src/schemas/views.ts`, add:
```ts
/**
 * What an item's drawing looks like next to the plan's clone, worked out each time it's shown and never stored.
 * diagram: node id -> its file reference was found, for nodes with a codeRef, or why it wasn't checked (no clone).
 * database: warnings against the repo's Prisma schema, or why it wasn't checked.
 */
export type DataChecks =
  | { kind: 'diagram'; checked: true; nodes: Record<string, boolean> }
  | { kind: 'diagram'; checked: false; reason: string; nodes: Record<string, never> }
  | { kind: 'database'; checked: true; file: string; warnings: string[] }
  | { kind: 'database'; checked: false; reason: string; warnings: [] };
```

- [ ] **Step 5: Write the checker**

`packages/core/src/store/checks.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { parsePrismaSchema, type PrismaSchema } from '../prisma';
import { parseData, type DataChecks, type DataKind, type DiagramData, type RepoProfile, type TableDiff } from '../schemas';
import { verifyCodeRefs } from './importItems';

export type DataChecker = { check(kind: DataKind | null, data: unknown): Promise<DataChecks | null> };

type SchemaRead = { ok: true; file: string; schema: PrismaSchema } | { ok: false; reason: string };

/** The profile's Prisma schema, read from inside the clone. A path that leaves the clone, even through a link, isn't read. */
async function readSchema(clone: string | null, profile: RepoProfile | undefined): Promise<SchemaRead> {
  const schema = profile?.schema;
  if (!schema) return { ok: false, reason: 'No schema file is set in the repo profile.' };
  if (schema.type !== 'prisma') return { ok: false, reason: "The repo profile's schema isn't Prisma, so it isn't checked." };
  if (!clone) return { ok: false, reason: "The plan's clone isn't on this Mac any more." };
  const missing: SchemaRead = { ok: false, reason: `The schema file isn't in the clone: ${schema.path}.` };
  try {
    const root = await fs.realpath(clone);
    const file = await fs.realpath(path.resolve(root, schema.path));
    const rel = path.relative(root, file);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return missing;
    return { ok: true, file: schema.path, schema: parsePrismaSchema(await fs.readFile(file, 'utf8')) };
  } catch {
    return missing;
  }
}

/** Where one table diff disagrees with the schema as it is in the clone. */
function tableWarnings(table: TableDiff, schema: PrismaSchema): string[] {
  const model = schema.models.get(table.model);
  if (table.change === 'new') return model ? [`There's already a model called ${table.model} in the schema.`] : [];
  if (!model) return [`There's no model called ${table.model} in the schema.`];
  const warnings: string[] = [];
  for (const f of table.fields) {
    const name = `${table.model}.${f.name}`;
    const type = model.get(f.name);
    if (f.change === 'added') {
      if (type !== undefined) warnings.push(`${name} is added but already in the schema.`);
    } else if (type === undefined) {
      warnings.push(`${name} isn't in the schema.`);
    } else if (f.change === 'unchanged' && type.trimEnd() !== f.type.trimEnd()) {
      warnings.push(`${name} is ${type} in the schema, not ${f.type.trimEnd()}.`);
    }
  }
  return warnings;
}

/** ✓ for each box whose file reference is in the clone. With no clone, nothing is checked, and the reason says why. */
async function diagramChecks(clone: string | null, diagram: DiagramData): Promise<DataChecks> {
  if (!clone) return { kind: 'diagram', checked: false, reason: "The plan's clone isn't on this Mac any more.", nodes: {} };
  const refs = diagram.nodes.flatMap((n) => (n.codeRef ? [{ id: n.id, ref: n.codeRef }] : []));
  const verified = await verifyCodeRefs(clone, refs.map((r) => r.ref));
  return { kind: 'diagram', checked: true, nodes: Object.fromEntries(refs.map((r, i) => [r.id, verified[i]?.verified === true])) };
}

/** clone: the plan's clone (project.source.clone), or null if it's gone. Reads the schema file at most once. */
export function createDataChecker(o: { clone: string | null; profile: RepoProfile | undefined }): DataChecker {
  let schema: Promise<SchemaRead> | null = null;
  return {
    async check(kind, data) {
      if (kind === 'diagram') {
        const parsed = parseData('diagram', data);
        return parsed.ok ? diagramChecks(o.clone, parsed.data) : null;
      }
      if (kind === 'database') {
        const parsed = parseData('database', data);
        if (!parsed.ok) return null;
        schema ??= readSchema(o.clone, o.profile);
        const read = await schema;
        if (!read.ok) return { kind: 'database', checked: false, reason: read.reason, warnings: [] };
        return { kind: 'database', checked: true, file: read.file, warnings: tableWarnings(parsed.data, read.schema) };
      }
      return null;
    },
  };
}
```

In `packages/core/src/index.ts`, after `export * from './docDiff';`, add:
```ts
export * from './prisma';
export * from './store/checks';
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/core/src/prisma.test.ts packages/core/test/checks.test.ts`
Expected: PASS (2 and 6 tests).

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/prisma.ts packages/core/src/prisma.test.ts packages/core/src/store/checks.ts packages/core/test/checks.test.ts packages/core/src/schemas/views.ts packages/core/src/index.ts
git commit -m "feat(core): check diagrams and tables against the plan's clone" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Import in two waves, data shapes in the packs, and relevant decisions

Flows and Phases point at items the other importers write: a flow step's `mockupId` names a UI item, and a phase's `itemIds` name items of every type. So `dp_open` marks them `afterOthers: true` and lists them last, and the skill (Task 5) starts them in a second wave. Context packs carry `type.dataShape`, the one description of the item's `data` (Decision 8), plus the app's kit files. A thread pack for a pin's item (one with an `anchor`) also carries the whole `anchored` item, so the thread subagent can read the drawing it's about. `dp_wait` now sends only the decisions that touch the submission's threads, with the total count (Decision 9), and the project home says which types' importers didn't finish.

**Files:**
- Create: `packages/core/test/decisions.test.ts`
- Modify:
  - `packages/core/src/store/context.ts` (packs carry `screen`, `timeline`, `dataShape`, and the apps' `kitFiles`; thread packs carry the `anchored` item)
  - `packages/core/src/store/decisions.ts` (`relevantDecisions`)
  - `packages/core/src/schemas/views.ts` (`TypeEntry.timeline`, `TypeEntry.importFailed`)
  - `packages/core/src/store/projects.ts` (`loadProjectHome` fills them)
  - `packages/service/src/routes/claude.ts` (`/open` marks `afterOthers`; `/wait` sends relevant decisions and `decisionCount`)
  - No change to `packages/mcp/src/tools.ts`: `dp_wait` returns the service's result as it is, and its description doesn't mention decisions.
- Test:
  - `packages/core/test/decisions.test.ts`
  - `packages/core/test/context.test.ts`
  - `packages/core/test/projects.test.ts`
  - `packages/service/test/claude.test.ts`

**Interfaces:**
- Consumes:
  - From Task 1 (`@dev-plumbing/core/schemas`): `dataKindOf(type: { screen: Screen; timeline?: boolean }): DataKind | null`, `dataShapeDoc(kind: DataKind): string`, `Item.anchor?: Anchor` (`{ itemId; kind; ref; label; side? }`).
  - From Plan 2: `IMPORT_DID_NOT_FINISH` (`store/importItems.ts`), `activeDecisions`, `addDecision`, `readDecisions`, `readItems`.
- Produces:
  - `store/context.ts`:
    - `ImportPack.type` gains `timeline: boolean; dataShape: string | null` (`dataShapeDoc(kind)`, or null for plain lists).
    - `ImportPack.profile.apps` entries gain `kitFiles: string[]`.
    - `ThreadPack.type` gains `screen: Screen; timeline: boolean; dataShape: string | null`.
    - `ThreadPack` gains `anchored: Item | null`: the whole item the thread's item is anchored to (`readItem(dir, item.anchor.itemId)`), data included. It's `null` when the item has no `anchor`, or the anchored item is missing (a `StoreError` from `readItem`).
  - `store/decisions.ts`: `relevantDecisions(dir: string, threadIds: string[]): Promise<{ decisions: string[]; total: number }>`. It returns the active decisions made in one of these threads, or whose `itemIds` include one of these threads' items or an item linked to them (in either direction), in file order. `total` counts every active decision.
  - `schemas/views.ts` `TypeEntry` gains `timeline: boolean` and `importFailed: boolean` (`noChanges.reason === IMPORT_DID_NOT_FINISH`).
  - `POST /api/claude/open`: each `importTypes` entry is `{ id, title, afterOthers?: true }`. Types with `screen === 'flows'` or `timeline: true` get `afterOthers: true` and are listed after the others, keeping the config order within each group.
  - `POST /api/claude/wait` submission result: `decisions` (the relevant ones) and `decisionCount: number`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/decisions.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { addDecision, relevantDecisions } from '../src/store/decisions';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject } from './fixtures';

afterAll(removeTempDirs);

describe('relevant decisions', () => {
  it('sends the decisions made in these threads, or about their items and the items linked to them', async () => {
    // q1 links to c1, and q2 links to q1. q3 and q4 stand alone.
    const dir = await seedProject({ pairs: [pair('q1', { links: ['c1'] }), pair('c1', { type: 'concerns' }), pair('q2', { links: ['q1'] }), pair('q3'), pair('q4')] });
    await addDecision(dir, { text: 'Old answer', threadId: 't-c1', itemIds: ['c1'] });
    await addDecision(dir, { text: 'From this thread', threadId: 't-q1', itemIds: ['q1'] });
    await addDecision(dir, { text: 'About a linked item', threadId: 't-c1', itemIds: ['c1'] });
    await addDecision(dir, { text: 'About an item that links here', threadId: 't-q2', itemIds: ['q2'] });
    await addDecision(dir, { text: 'Elsewhere, but naming this item', threadId: 't-q4', itemIds: ['q4', 'q1'] });
    await addDecision(dir, { text: 'Settled in q3, about q4', threadId: 't-q3', itemIds: ['q4'] });

    expect(await relevantDecisions(dir, ['t-q1'])).toEqual({
      decisions: ['From this thread', 'About a linked item', 'About an item that links here', 'Elsewhere, but naming this item'],
      total: 5,
    });
    // A decision made in the thread counts even when it's about another item.
    expect(await relevantDecisions(dir, ['t-q3'])).toEqual({ decisions: ['Settled in q3, about q4'], total: 5 });
    expect(await relevantDecisions(dir, [])).toEqual({ decisions: [], total: 5 });
  });
});
```

In `packages/core/test/context.test.ts`:
- Change the imports to:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { dataShapeDoc, repoProfileSchema } from '../src/schemas';
import { importPack, threadPack } from '../src/store/context';
import { addDecision } from '../src/store/decisions';
import { readItem, writeItem } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, pair, seedProject, TYPES } from './fixtures';
```
- In "gives a thread subagent what it needs, and nothing more", replace the `pack.type` assertion with:
```ts
    expect(pack.type).toEqual({ id: 'questions', title: 'Questions', screen: 'list', timeline: false, dataShape: null, rules: '- Be brief.', fields: ['blocking', 'default'], answerPresets: [] });
    expect(pack.anchored).toBeNull();
```
- In "gives an importer the whole draft, its rules file and the repo profile", replace the `pack.profile` assertion with:
```ts
    expect(pack.profile).toEqual({ name: 'acme', conventions: ['Ids use uuid()'], apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/theme.css'] }], planFolders: [] });
```
- Add these tests at the end of the `describe`:
```ts
  it('gives a pin thread the whole item it is anchored to, data included', async () => {
    const diagram = { kind: 'system', groups: [], nodes: [{ id: 'job', label: 'Reminder job', status: 'new' }], edges: [] };
    const dir = await seedProject({
      pairs: [
        pair('a1', { type: 'architecture', title: 'System view' }),
        pair('a2', { type: 'architecture', title: 'About Reminder job', links: ['a1'] }),
        pair('a3', { type: 'architecture', title: 'About a deleted view' }),
      ],
    });
    await writeItem(dir, { ...(await readItem(dir, 'a1')), data: diagram });
    await writeItem(dir, { ...(await readItem(dir, 'a2')), anchor: { itemId: 'a1', kind: 'node', ref: 'job', label: 'Reminder job' } });
    await writeItem(dir, { ...(await readItem(dir, 'a3')), anchor: { itemId: 'gone', kind: 'node', ref: 'job', label: 'Reminder job' } });
    const pack = await threadPack({ dir, threadId: 't-a2', types: TYPES, profile });
    expect(pack.item.anchor).toEqual({ itemId: 'a1', kind: 'node', ref: 'job', label: 'Reminder job' });
    expect(pack.anchored).toMatchObject({ id: 'a1', type: 'architecture', title: 'System view', data: diagram });
    // A missing anchored item and an item with no anchor both give null, never an error.
    expect((await threadPack({ dir, threadId: 't-a3', types: TYPES })).anchored).toBeNull();
    expect((await threadPack({ dir, threadId: 't-a1', types: TYPES })).anchored).toBeNull();
  });

  it('tells subagents how their items write data', async () => {
    const types = [...TYPES, listType('phases', { title: 'Phases & milestones', order: 8, timeline: true })];
    const dir = await seedProject({ pairs: [pair('a1', { type: 'architecture', title: 'System view' }), pair('q1')] });
    expect((await importPack({ dir, typeId: 'architecture', types, profile })).type).toMatchObject({ screen: 'diagram', timeline: false, dataShape: dataShapeDoc('diagram') });
    expect((await importPack({ dir, typeId: 'phases', types })).type).toMatchObject({ screen: 'list', timeline: true, dataShape: dataShapeDoc('timeline') });
    expect((await importPack({ dir, typeId: 'questions', types })).type.dataShape).toBeNull();
    const pack = await threadPack({ dir, threadId: 't-a1', types, profile });
    expect(pack.type).toMatchObject({ id: 'architecture', screen: 'diagram', timeline: false, dataShape: dataShapeDoc('diagram') });
  });
```

In `packages/core/test/projects.test.ts`:
- Add these imports:
```ts
import { IMPORT_DID_NOT_FINISH } from '../src/store/importItems';
import { listType, seedProject, TYPES } from './fixtures';
```
- Add this test at the end of `describe('project store', …)`:
```ts
  it("marks types whose importer didn't finish, and timeline types", async () => {
    const dir = await seedProject({ project: { emptyTypes: [{ type: 'questions', reason: IMPORT_DID_NOT_FINISH }, { type: 'concerns', reason: 'No concerns in this plan.' }] } });
    const types = [...TYPES, listType('phases', { title: 'Phases & milestones', order: 8, timeline: true })];
    const home = await loadProjectHome({ repo: 'acme', id: 'restock', dir }, types);
    const entry = (id: string) => home.types.find((t) => t.id === id);
    expect(entry('questions')).toMatchObject({ importFailed: true, timeline: false, noChanges: { reason: IMPORT_DID_NOT_FINISH } });
    expect(entry('concerns')).toMatchObject({ importFailed: false, noChanges: { reason: 'No concerns in this plan.' } });
    expect(entry('architecture')).toMatchObject({ importFailed: false, noChanges: { reason: 'No items were found for this plumbing type.' } });
    expect(entry('phases')).toMatchObject({ timeline: true, importFailed: false });
  });
```

In `packages/service/test/claude.test.ts`:
- Change the core import to:
```ts
import { addDecision, loadConfig, readProjectFile, readThread, saveDraft, submit, writeJsonAtomic } from '@dev-plumbing/core';
```
- Add this test at the end of `describe('opening a plan', …)`:
```ts
  it('lists flows and phases last, to import after the others', async () => {
    const t = await setup();
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN });
    const types = open.body.importTypes as { id: string; title: string; afterOthers?: true }[];
    expect(types.map((x) => x.id)).toEqual(['architecture', 'database', 'ui', 'questions', 'concerns', 'ideas', 'testing', 'security', 'flows', 'phases']);
    expect(types.filter((x) => x.afterOthers).map((x) => x.id)).toEqual(['flows', 'phases']);
    expect(types[0]).toEqual({ id: 'architecture', title: 'Architecture' });
    expect(open.body.next).toMatch(/afterOthers only after all the others have returned/);
  });
```
- Add this test at the end of `describe('listening', …)`:
```ts
  it('sends only the decisions that touch the submitted threads, and how many there are', async () => {
    const t = await setup();
    const p = await imported(t);
    // "who" links to "when", so a decision about "when" matters to "who". "sender" stands alone.
    await addDecision(p.dir, { text: 'Remind three days before', threadId: 't-questions-when', itemIds: ['questions-when'] });
    await addDecision(p.dir, { text: 'Send from the main number', threadId: 't-questions-sender', itemIds: ['questions-sender'] });
    await answer(t, p.dir, ['t-questions-who']);
    const r = await t.claude('/wait', { repo: p.repo, project: p.project, windowId: 'w-a', timeoutSeconds: 0 });
    expect(r.body.groups.map((g: Json) => g.threads)).toEqual([['t-questions-who']]);
    expect(r.body.decisions).toEqual(['Remind three days before']);
    expect(r.body.decisionCount).toBe(2);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/decisions.test.ts packages/core/test/context.test.ts packages/core/test/projects.test.ts packages/service/test/claude.test.ts`
Expected: FAIL. `relevantDecisions` doesn't exist yet, the packs have no `screen`, `timeline`, `dataShape`, `kitFiles` or `anchored`, `TypeEntry` has no `importFailed`, `importTypes` lists flows fourth with no `afterOthers`, and the `/wait` result sends every decision with no `decisionCount`.

- [ ] **Step 3: Add `relevantDecisions`**

Replace `packages/core/src/store/decisions.ts` with:
```ts
import type { Decision } from '../schemas';
import { newId, readDecisions, readItems, writeDecisions } from './io';

export const activeDecisions = (decisions: Decision[]): Decision[] => decisions.filter((d) => !d.supersededBy);

/** Adds a decision. Nothing is deleted: the thread's earlier decision is marked superseded by this one. */
export async function addDecision(dir: string, o: { text: string; threadId: string; itemIds: string[]; now?: Date }): Promise<Decision> {
  const now = o.now ?? new Date();
  const decision: Decision = { id: newId('d', now), text: o.text, threadId: o.threadId, itemIds: o.itemIds, at: now.toISOString() };
  const earlier = (await readDecisions(dir)).map((d) => (d.threadId === o.threadId && !d.supersededBy ? { ...d, supersededBy: decision.id } : d));
  await writeDecisions(dir, [...earlier, decision]);
  return decision;
}

/**
 * The active decisions a submission's threads need: those made in one of the threads, and those about the
 * threads' items or the items linked to them (either direction). `total` counts every active decision, so
 * the main window knows the rest exist without being sent them.
 */
export async function relevantDecisions(dir: string, threadIds: string[]): Promise<{ decisions: string[]; total: number }> {
  const active = activeDecisions(await readDecisions(dir));
  const { values: items } = await readItems(dir);
  const threads = new Set(threadIds);
  const own = new Set(items.filter((i) => threads.has(i.threadId)).map((i) => i.id));
  const touched = new Set(own);
  for (const i of items) {
    if (own.has(i.id)) for (const l of i.links ?? []) touched.add(l);
    else if (i.links?.some((l) => own.has(l))) touched.add(i.id);
  }
  const decisions = active.filter((d) => threads.has(d.threadId) || d.itemIds.some((id) => touched.has(id))).map((d) => d.text);
  return { decisions, total: active.length };
}
```

- [ ] **Step 4: Put the data shape, kit files and anchored item in the context packs**

Replace `packages/core/src/store/context.ts` with:
```ts
import {
  dataKindOf,
  dataShapeDoc,
  firstParagraph,
  headingsOf,
  sectionFor,
  type Item,
  type Message,
  type PlumbingType,
  type RepoProfile,
  type Screen,
  type ThreadStatus,
} from '../schemas';
import { activeDecisions } from './decisions';
import { docPath, readDecisions, readDocText, readItem, readItems, readProjectFile, readThread, StoreError } from './io';

export type ThreadPack = {
  project: { repo: string; id: string; title: string; summary: string };
  /** `dataShape` is how this type's items write `data` (their drawing), or null for plain lists. */
  type: { id: string; title: string; screen: Screen; timeline: boolean; dataShape: string | null; rules: string; fields: string[]; answerPresets: string[] };
  item: Item;
  /** When `item.anchor` is set: the whole item it's about, data included. Null without an anchor, or when that item is gone. */
  anchored: Item | null;
  thread: { id: string; status: ThreadStatus; messages: Message[] };
  linked: { id: string; type: string; title: string; summary: string }[];
  decisions: string[];
  draftSection: { heading: string; text: string } | null;
  draftHeadings: string[];
  /** The whole draft, for patches outside the item's section. Read it; never write it. */
  draftFile: string;
  conventions: string[];
};

export type ImportPack = {
  project: { repo: string; id: string; title: string };
  type: { id: string; title: string; screen: Screen; timeline: boolean; fields: string[]; answerPresets: string[]; rules: string; dataShape: string | null };
  draft: string;
  profile: { name: string; schema?: RepoProfile['schema']; conventions: string[]; apps: { name: string; path: string; kitFiles: string[] }[]; planFolders: string[] } | null;
  existingItems: { id: string; type: string; title: string }[];
};

/** The text subagents follow when writing this type's `data`, or null when its items take none. */
function dataShapeFor(type: PlumbingType | undefined): string | null {
  const kind = type ? dataKindOf(type) : null;
  return kind ? dataShapeDoc(kind) : null;
}

/** Spec §13.2: what a thread subagent receives. */
export async function threadPack(o: { dir: string; threadId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ThreadPack> {
  const project = await readProjectFile(o.dir);
  const thread = await readThread(o.dir, o.threadId);
  const item = await readItem(o.dir, thread.itemId);
  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: items } = await readItems(o.dir);
  const type = o.types.find((t) => t.id === item.type);
  const linkedIds = new Set([...(item.links ?? []), ...items.filter((i) => i.links?.includes(item.id)).map((i) => i.id)]);
  const section = item.mdAnchor ? sectionFor(draft, item.mdAnchor.heading) : null;
  // A pin's item is about one part of another item; the subagent gets that item whole, so it can read the drawing.
  const anchored = item.anchor
    ? await readItem(o.dir, item.anchor.itemId).catch((e: unknown) => {
        if (e instanceof StoreError) return null;
        throw e;
      })
    : null;
  return {
    project: { repo: project.repo, id: project.id, title: project.title, summary: firstParagraph(draft) },
    type: {
      id: item.type,
      title: type?.title ?? item.type,
      screen: type?.screen ?? 'list',
      timeline: type?.timeline ?? false,
      dataShape: dataShapeFor(type),
      rules: type?.sections.Rules ?? '',
      fields: type?.fields ?? [],
      answerPresets: type?.answerPresets ?? [],
    },
    item,
    anchored,
    thread: { id: thread.id, status: thread.status, messages: thread.messages },
    linked: items.filter((i) => linkedIds.has(i.id)).map((i) => ({ id: i.id, type: i.type, title: i.title, summary: i.summary })),
    decisions: activeDecisions(await readDecisions(o.dir)).map((d) => d.text),
    draftSection: section !== null && item.mdAnchor ? { heading: item.mdAnchor.heading, text: section } : null,
    draftHeadings: headingsOf(draft).map((h) => `${'#'.repeat(h.level)} ${h.text}`),
    draftFile: docPath(o.dir, project.docs.draft),
    conventions: o.profile?.conventions ?? [],
  };
}

/** What an importer receives: the whole draft, its plumbing type's whole rules file and data shape, and the repo profile. */
export async function importPack(o: { dir: string; typeId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ImportPack> {
  const type = o.types.find((t) => t.id === o.typeId);
  if (!type) throw new StoreError(`There's no plumbing type "${o.typeId}".`);
  const project = await readProjectFile(o.dir);
  const { values: items } = await readItems(o.dir);
  const p = o.profile;
  return {
    project: { repo: project.repo, id: project.id, title: project.title },
    type: {
      id: type.id,
      title: type.title,
      screen: type.screen,
      timeline: type.timeline,
      fields: type.fields,
      answerPresets: type.answerPresets,
      rules: type.body,
      dataShape: dataShapeFor(type),
    },
    draft: await readDocText(o.dir, project.docs.draft),
    profile: p
      ? {
          name: p.name,
          ...(p.schema ? { schema: p.schema } : {}),
          conventions: p.conventions,
          apps: p.apps.map((a) => ({ name: a.name, path: a.path, kitFiles: a.kitFiles })),
          planFolders: p.planFolders,
        }
      : null,
    existingItems: items.map((i) => ({ id: i.id, type: i.type, title: i.title })),
  };
}
```

- [ ] **Step 5: Say which types are timelines, and which importers didn't finish**

In `packages/core/src/schemas/views.ts`, replace `TypeEntry` with:
```ts
export type TypeEntry = {
  id: string;
  title: string;
  order: number;
  screen: Screen;
  /** A list with a timeline strip (Phases). Its items carry phase data. */
  timeline: boolean;
  emptyMessage: string;
  itemCount: number;
  yourTurn: number;
  drafts: number;
  withClaude: number;
  resolved: number;
  noChanges: { reason: string } | null;
  /** The importer never wrote this type, so the app says "Didn't finish" instead of "No changes". */
  importFailed: boolean;
  fields: string[];
  answerPresets: string[];
  addLabel?: string;
};
```

In `packages/core/src/store/projects.ts`:
- Add `import { IMPORT_DID_NOT_FINISH } from './importItems';` below the `./decisions` import.
- In `loadProjectHome`'s `typeEntries` map, replace the one-line `return { id: t.id, title: t.title, … };` with:
```ts
      return {
        id: t.id,
        title: t.title,
        order: t.order,
        screen: t.screen,
        timeline: t.timeline,
        emptyMessage: t.emptyMessage,
        itemCount: ofType.length,
        yourTurn: c.yourTurn,
        drafts: c.drafts,
        withClaude: c.withClaude,
        resolved: c.resolved,
        noChanges,
        importFailed: noChanges?.reason === IMPORT_DID_NOT_FINISH,
        fields: t.fields,
        answerPresets: t.answerPresets,
        ...(t.addLabel ? { addLabel: t.addLabel } : {}),
      };
```

- [ ] **Step 6: Mark the second wave in `/open`, and send relevant decisions from `/wait`**

In `packages/service/src/routes/claude.ts`:
- In the `@dev-plumbing/core` import list, remove `activeDecisions` and `readDecisions`, and add `relevantDecisions` and `type PlumbingType`. Nothing else in the file uses the two removed names.
- In the `/open` handler, replace the line `const importTypes = cfg.types.filter((t) => project.importPending.includes(t.id)).map((t) => ({ id: t.id, title: t.title }));` with:
```ts
      // Flows and phases point at items the other importers write (a step's mockupId, a phase's itemIds), so they go last.
      const later = (t: PlumbingType) => t.screen === 'flows' || t.timeline;
      const pending = cfg.types.filter((t) => project.importPending.includes(t.id));
      const importTypes = [
        ...pending.filter((t) => !later(t)).map((t) => ({ id: t.id, title: t.title })),
        ...pending.filter(later).map((t) => ({ id: t.id, title: t.title, afterOthers: true as const })),
      ];
```
- In the same handler's response, replace the `next:` property with:
```ts
        next: importTypes.length
          ? `Start one dev-plumbing:importer subagent per import type (model ${models.importer}, at most ${cfg.agents.maxParallel} at a time). Start the ones marked afterOthers only after all the others have returned. When they have all returned, call dp_wait.`
          : "Call dp_wait to listen for the user's answers.",
```
- Replace `describeSubmission` with:
```ts
  async function describeSubmission(ref: ProjectRef, s: Submission, cfg: LoadedConfig) {
    const titleOf = async (threadId: string) => {
      const thread = await readThread(ref.dir, threadId).catch(() => null);
      const item = thread ? await readItem(ref.dir, thread.itemId).catch(() => null) : null;
      return item?.title ?? threadId;
    };
    const groups = await groupThreads(ref.dir, s.sent, cfg.agents.groupLinkedThreads);
    const { decisions, total } = await relevantDecisions(ref.dir, s.sent);
    return {
      kind: 'submission' as const,
      submission: s.id,
      groups: await Promise.all(groups.map(async (threads) => ({ threads, titles: await Promise.all(threads.map(titleOf)), model: cfg.agents.models.thread }))),
      maxParallel: cfg.agents.maxParallel,
      decisions,
      decisionCount: total,
    };
  }
```

- [ ] **Step 7: Run the tests**

Run:
```bash
pnpm vitest run packages/core/test/decisions.test.ts packages/core/test/context.test.ts packages/core/test/projects.test.ts packages/service/test/claude.test.ts
pnpm typecheck && pnpm test
pnpm test:e2e
```
Expected: PASS. The web app doesn't read the new `TypeEntry` fields yet (Task 9 does), so every e2e spec passes unchanged.

- [ ] **Step 8: Commit**

```bash
git add packages/core packages/service
git commit -m "feat: flows and phases import after the others; packs carry data shapes; dp_wait sends relevant decisions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: The plugin and default rules learn the visual shapes

The plugin's instructions catch up with Task 4. The skill imports in two waves and explains `decisions` and `decisionCount`. Importers write `data` exactly as `type.dataShape` says, reading the app's kit before writing mockup markup. Thread agents change a drawing by patching the item's whole `data`, and know what an `anchor` is: the item it points at arrives whole in the pack's `anchored`. The default rules files gain a line each. `installDefaults` keeps files that already exist, so this changes new installs and **Reset to default**, never a user's own copy.

**Files:**
- Modify:
  - `plugin/skills/dev-plumbing/SKILL.md` (§2 Import in two waves; §4 relevant decisions)
  - `plugin/agents/importer.md` (Drawings replaces Data shapes)
  - `plugin/agents/thread.md` (a Drawings section)
  - `defaults/plumbing/ui.md`, `defaults/plumbing/database.md`, `defaults/plumbing/phases.md`, `defaults/plumbing/flows.md`
- Test:
  - `packages/mcp/test/plugin.test.ts`
  - `packages/core/test/defaults.test.ts`

**Interfaces:**
- Consumes:
  - From Task 4: `importTypes[].afterOthers`, the `dp_wait` result's `decisions` and `decisionCount`, `ImportPack.type.dataShape`/`timeline`, `ImportPack.profile.apps[].kitFiles`, `ThreadPack.type.screen`/`dataShape`, `ThreadPack.anchored` (the whole anchored item, or null).
  - From Task 1: `dataShapeDoc(kind)`. Each kind's text holds the shape, the rules and an example, so the agent files point at it instead of repeating it.
  - From Task 1: `Item.anchor` (`{ itemId, kind, ref, label, side? }`). The agent text only describes it; nothing here depends on Task 7's code, which lets you create anchored items.
- Produces: plugin text only. No code or tool names change.

- [ ] **Step 1: Write the failing tests**

In `packages/mcp/test/plugin.test.ts`, add these tests at the end of `describe('the plugin', …)`:
```ts
  it('imports flows and phases in a second wave, and passes on only the decisions that matter', () => {
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md')).content;
    expect(skill).toContain('afterOthers');
    expect(skill).toContain('decisionCount');
    expect(skill).toMatch(/When all of those have returned, start the entries with `afterOthers: true`/);
  });

  it('has importers and thread agents write drawings to the documented shapes', () => {
    const importer = parseFrontMatter(read('plugin/agents/importer.md')).content;
    for (const s of ['type.dataShape', 'kitFiles', 'mockupId', 'itemIds', 'existingItems']) expect(importer).toContain(s);
    expect(importer).not.toContain('Mockup HTML comes in a later version');
    const thread = parseFrontMatter(read('plugin/agents/thread.md')).content;
    for (const s of ['patch: { data }', 'type.dataShape', 'anchor.itemId', 'anchor.label', 'anchor.ref', 'the whole item is in `anchored`']) expect(thread).toContain(s);
    expect(thread).not.toContain('t-<anchor.itemId>');
  });
```

In `packages/core/test/defaults.test.ts`, add this test at the end of `describe('shipped defaults', …)`:
```ts
  it('tells importers how the visual types draw', () => {
    expect(read('plumbing/ui.md')).toContain("Mockups use the app's Tailwind classes and theme tokens from its kit files.");
    expect(read('plumbing/ui.md')).toContain('No scripts; images as inline SVG or plain boxes.');
    expect(read('plumbing/database.md')).toContain('Say how to roll back in a rollback entry in the migration panel.');
    expect(read('plumbing/phases.md')).toContain('Each phase lists its items by id.');
    expect(read('plumbing/flows.md')).toContain('Point user-flow steps at their UI mockups.');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/mcp/test/plugin.test.ts packages/core/test/defaults.test.ts`
Expected: FAIL. The skill doesn't mention `afterOthers` or `decisionCount`, the importer still has the old "Data shapes" section, the thread agent has no Drawings section, and the rules files don't have the new lines.

- [ ] **Step 3: Teach the skill the two waves and relevant decisions**

Replace `plugin/skills/dev-plumbing/SKILL.md` with:
```markdown
---
name: dev-plumbing
description: Plumb a feature plan with dev-plumbing. Imports a Markdown plan into a local review app where every question, concern and change has its own thread, then listens for the user's answers and replies through subagents. Use when the user runs /dev-plumbing, with or without a path to a plan.
argument-hint: "[path/to/plan.md]"
---

# dev-plumbing

You are the main window for dev-plumbing. The plan already exists: don't brainstorm, plan or review it yourself, and don't read it. Your job is to open the plumbing project, start subagents and listen.

**Keep your context small.** You only ever see ids, titles and one-line summaries. Never read the plan, items or threads, and never edit files in the repo. Subagents do the reading and writing through the dp tools.

Your tools are `dp_open` and `dp_wait`. The subagents are `dev-plumbing:repo-setup`, `dev-plumbing:importer` and `dev-plumbing:thread`.

## 1. Open

Call `dp_open`. If the user gave a path ($ARGUMENTS), pass it as `plan`; otherwise pass nothing. Then follow `kind`:

- **needs-profile**: this repo has no repo profile yet. Start one `dev-plumbing:repo-setup` subagent with the result's `model`, and tell it the `clone`, `remote` and `suggestedName`. When it returns, tell the user in one line what it saved, and that they can change it in Settings → Repos. Then call `dp_open` again once, with the same arguments. If it still says needs-profile, tell the user the repo-setup subagent couldn't save a profile, point them to Settings → Repos, and stop.
- **pick-project**: show the user the projects as a short list (title, and how many are waiting), ask which one to open with AskUserQuestion, then call `dp_open` with `project` set to its id. If the list is empty, tell the user to run `/dev-plumbing path/to/plan.md`, and stop.
- **created** or **reopened**, with a non-empty `importTypes`: go to 2.
- **reopened** with no `importTypes`: tell the user the project's `url`, then go to 3.

If `dp_open` returns an error, tell the user the error and stop.

## 2. Import

Each entry in `importTypes` needs one `dev-plumbing:importer` subagent, with `models.importer` as the model. Entries with `afterOthers: true` (Flows and Phases, by default) point at items the other importers write, such as a flow step's mockup or a phase's items, so they go in a second wave:

1. Start the entries without `afterOthers`. Start up to `maxParallel` at once, as parallel Agent calls in one message, wait for them, then start the next batch.
2. When all of those have returned, start the entries with `afterOthers: true` the same way. If every entry has `afterOthers`, start them straight away.

Give each this prompt, filled in:

> Import plumbing type `<type id>` ("<type title>") for repo `<repo>`, plumbing project `<project>`.

Each returns one line. A line starting with `Failed:` means that plumbing type wasn't imported; include it in what you tell the user. When both waves have returned, tell the user the project's `url` and the importers' lines as a short list. Then go to 3.

## 3. Listen

Call `dp_wait` with `repo` and `project`. It waits until the user presses **Send this thread** or **Submit all** in the app. Never call `dp_wait` while one is still running in the background for this project: that one is already listening.

- If the call moves to the background (Claude Code does this after two minutes), that's expected. Tell the user once: "Listening for your answers in the app. You can keep chatting here." Then end your turn. When the result arrives, carry on below.
- **kind: submission**: answer it (4).
- **kind: still-waiting**: call `dp_wait` again, without `finished`.
- **kind: replaced**: a newer `dp_wait` for this project took over. Stop here: that one is listening.

## 4. Answer a submission

The result has `submission`, `groups` (each with `threads`, `titles` and `model`), `maxParallel`, `decisions` and `decisionCount`. `decisions` are the decisions that touch these threads: the ones made in them, and the ones about their items or the items those link to. `decisionCount` says how many decisions the project has in total. The others don't touch these threads, so you don't need them.

1. Start one `dev-plumbing:thread` subagent per group, with that group's `model`. Start up to `maxParallel` at once, as parallel Agent calls in one message, wait for them, then start the next batch. Prompt, filled in:
   > Answer threads `<thread ids, comma separated>` in repo `<repo>`, plumbing project `<project>`.
2. Each subagent returns one line per thread. Don't look at anything else. A line starting with `Failed:` means that thread wasn't answered. Tell the user in one line. You don't need to do anything else: when you call `dp_wait` with `finished`, unanswered threads go back to the user with their answer kept as a draft.
3. **Cross-check** those lines against each other and against `decisions`. If two answers contradict each other, or contradict a decision, that's a conflict: note the thread ids involved (`threads`) and one sentence on what clashes (`text`).
4. Call `dp_wait` again with `finished: { submission: "<the submission id>", conflicts: [{ threads: ["<thread id>", "<thread id>"], text: "<one sentence on what clashes>" }] }`. Use `conflicts: []` when there are none. Then go back to 3.

## Rules

- Never read or edit the plan, the draft or any plumbing file yourself, and never edit the repo.
- Never answer a thread yourself. That's the thread subagent's job.
- Don't summarise threads to the user beyond the one-line results. The app shows everything.
- If a tool call fails, tell the user the error in one line. If `dp_wait` fails, try once more. If it fails again, stop and tell the user to run `/dev-plumbing` again.
- The user can talk to you while you listen. If they ask you to stop listening, stop calling `dp_wait`.
```

- [ ] **Step 4: Teach the importer to write drawings to `type.dataShape`**

Replace `plugin/agents/importer.md` with:
```markdown
---
name: importer
description: Imports one plumbing type from a plan into a dev-plumbing project, following that plumbing type's rules file. Used by the /dev-plumbing skill, one per plumbing type.
tools: Read, Grep, Glob, mcp__plugin_dev-plumbing_dp__dp_context, mcp__plugin_dev-plumbing_dp__dp_write_items
color: blue
---

You import one plumbing type from a plan into dev-plumbing. Your prompt names the type, the repo and the plumbing project. The repo is your working directory. Read code there if the rules call for it, but never change anything.

1. Call `dp_context` with `repo`, `project`, and `importType` set to the type id. You get:
   - `type`: its id, title and screen, `timeline` (true for a list with a timeline strip, like Phases), its extra `fields` and `answerPresets`, `rules` and `dataShape`. `rules` is the whole rules file: what to look for, rules, done when, and always ask. `dataShape` describes the `data` every item of this type needs, or is null when its items take no data.
   - `draft`: the whole plan.
   - `profile`: the repo's schema file, conventions and apps. Each app lists the CSS files of its design kit in `kitFiles`.
   - `existingItems`: items that other importers already wrote, which you may link to and point at.
2. Read the draft with the rules in mind. Read code only where it helps you check a claim, or tie an item to a real file.
3. Decide the items, following the rules file exactly. Write one item per distinct thing, and don't pad the list. If the plan has nothing for this type, send `noChanges` with a one-sentence reason instead.
4. Write each item:
   - `key`: short, lowercase, with dashes (for example `who-gets-reminders`), unique in your batch.
   - `title`: a few words, sentence case.
   - `summary`: one line.
   - `body`: optional markdown with detail.
   - `fields`: only the type's `fields`, with every value a string (for example `"blocking": "true"` or `"severity": "high"`).
   - `mdAnchor`: `{ "heading": "<the draft heading the item comes from, exactly as written>" }`, when there is one.
   - `codeRefs`: `{ "path": "relative/path", "symbol": "optional" }` for real files or symbols it touches. The service checks them.
   - `links`: keys of closely related items in your batch, or ids from `existingItems`.
   - `data`: the item's drawing, when `type.dataShape` is set (see Drawings).
   - `message`: your opening message, when there's something to ask or confirm. It has:
     - `text`: plain and short.
     - `options`: optional, 2 to 4, each `{ "id": "short-id", "label": "...", "detail": "optional" }`. Add `change` when picking the option should edit the plan.
     - `recommended`: an option id, when you have a view.

     A `change` that edits the plan is `{ "md": [{ "find": "exact text from the draft", "replace": "new text" }] }`. `find` must be copied exactly from the draft, and appear there exactly once.
5. Call `dp_write_items` once, with `repo`, `project`, `type`, and either `items` or `noChanges`. If it returns errors, nothing was saved: fix every problem listed and send the whole batch again, at most three times. If it still fails, stop and reply with one line per type: `Failed: <title>: <the last error, shortened>`.
6. Reply with exactly one line: "<Type title>: <n> items" (for questions, add how many are blocking), or "<Type title>: no changes (<reason>)".

## Drawings

When `type.dataShape` is set, every item needs `data` written exactly as it describes; when it's null, send no `data`. `dataShape` gives the shape with every field and allowed value, its rules and a small example. The service checks each item's `data` against it, including references such as every line's ends being boxes and every step's lanes existing, and refuses the whole batch if anything is off.

- **UI changes:** before writing any markup, read the app's kit files (`profile.apps[].kitFiles`), so the mockup uses the app's real Tailwind classes and theme tokens. Write one item per screen. Always write `after`: the screen once the plan is built. Write `before` only when the screen exists today, built from its current component, which you read first. Put the app, route and component files in `location`, and describe the change in `body`.
- **Flows:** point each user-flow step that shows a screen at that screen's UI changes item, with `mockupId` set to its id from `existingItems`.
- **Phases:** list each phase's items in `itemIds`, using ids from `existingItems`. Every in-scope item belongs to a phase.
```

- [ ] **Step 5: Teach the thread agent to change drawings and read pins**

Replace `plugin/agents/thread.md` with:
```markdown
---
name: thread
description: Answers one dev-plumbing thread, or a group of linked ones, following the item's plumbing-type rules, and posts each reply with dp_reply. Used by the /dev-plumbing skill, one per thread or linked group.
tools: Read, Grep, Glob, mcp__plugin_dev-plumbing_dp__dp_context, mcp__plugin_dev-plumbing_dp__dp_reply
color: green
---

You answer threads in a dev-plumbing project: a person's questions and answers about a plan. Your prompt lists the thread ids, the repo and the plumbing project. The repo is your working directory. Read code there when it helps, but never change anything. Your only way to write is `dp_reply`.

For each thread, in the order given:

1. Call `dp_context` with `repo`, `project` and `threadId`. You get:
   - the project summary, the item, and the whole thread
   - the linked items and every decision so far
   - the draft section the item comes from, plus the draft's headings and its file path
   - the repo's conventions, and the plumbing type's Rules
   - the plumbing type's `screen`, and `type.dataShape`: how the item's `data` (its drawing) is written, or null for plain lists
   - `anchored`: when the item has an `anchor`, the whole item it's about, data included; otherwise null

   Read the whole draft file only if you need text outside the section.
2. Read the person's last message. It's an option they picked (maybe with a note), a preset, a custom answer or free text. Answer what they actually said. Respect every decision so far. If their answer contradicts one, say so plainly.
3. Write one reply:
   - **`text`:** plain, short and direct. Say what you'd do and why.
   - **Settling it:** if their answer settles the thread, set `resolve: { "decision": "<one line, e.g. 'Reminders go by SMS and email'>" }` and give no options. If settling it means editing the plan, offer that edit as one recommended option instead, so the person accepts it.
   - **`options`:** otherwise offer 2 to 4, with ids in lowercase with dashes. Add `change` when picking one should edit the plan or items. Set `recommended` when you have a view.
   - **`change.md`:** `[{ "find": "exact text from the draft", "replace": "new text" }]`. `find` must be copied exactly from the current draft and appear there exactly once, so include enough of the surrounding words.
   - **Drawings:** to change a diagram, table, mockup, flow or phase, see Drawings below.
   - **`smallEdits`:** only for typos, wording and layout that don't change meaning, each `{ "summary": "...", "change": ... }`. They're applied at once, with Undo. A small edit can't delete text outright: keep some words in `replace`.
   - **`newItems`:** a new question, concern or idea this raised, with its own opening `message`.
   - **`impacts`:** other items this might affect, each `{ "itemId", "reason" }`, from `linked` or the decisions.
   - **`filesRead`:** the repo files you read.
4. Call `dp_reply` with `repo`, `project`, `threadId` and the reply. If it returns errors, nothing was saved: fix every problem listed and call it again, at most three times. If it still fails, stop and reply with one line per thread: `Failed: <title>: <the last error, shortened>`.

Then reply with exactly one line per thread: "<item title>: <what you did, e.g. 'offered 3 options, recommended per-send' or 'resolved: both channels'>".

## Drawings

Diagrams, database tables, mockups, flows and phases are drawn from the item's `data`.

- To change one, put the WHOLE new data in the change, as `change.items: [{ itemId, patch: { data } }]`, written exactly as `type.dataShape` describes. `data` replaces the item's data, so send all of it, not only the part that changed. The service checks it, and refuses the whole reply if a line points at a missing box, a step at a missing lane, a phase at a missing item, or mockup markup has a script.
- Offer a drawing change as an option, so the person sees what it does to the drawing before accepting it. Use a small edit only for pure layout or wording, like the spelling of a box's label.
- When `item.anchor` is set, this item is about one part of another item: `anchor.label` and `anchor.ref` say which part, and the whole item is in `anchored`, including its data. `anchor.ref` is the box id, the mockup element's selector or the step number. To change the drawing, patch the anchored item (`anchor.itemId`), not the pin's own item.
```

- [ ] **Step 6: Add the new lines to the default rules**

Replace `defaults/plumbing/ui.md` with:
```markdown
---
id: ui
title: UI changes
order: 3
screen: mockups
emptyMessage: This plan doesn't change any screens.
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- New screens, and changes to existing screens, cards, forms and states.
- Where each one lives: app, route and component files.

## Rules
- One item per screen or distinct piece of UI.
- Build mockups with the app's design kit from the repo profile, so they look like the real app.
- Mockups use the app's Tailwind classes and theme tokens from its kit files.
- Write only the page's body markup; the app adds the kit.
- No scripts; images as inline SVG or plain boxes.
- Write a Before mockup from the current component whenever the screen already exists.
- Label every mockup with its app, route and files.

## Done when
- Every screen the plan changes has an After mockup, and existing screens have a Before.
- Empty, loading and error states are covered where the plan implies them.

## Always ask
- What does this look like on a phone?
```

Replace `defaults/plumbing/database.md` with:
```markdown
---
id: database
title: Database
order: 2
screen: database
emptyMessage: This plan doesn't change the database.
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- New, changed or removed tables, fields, indexes, enums and relations.
- Data that must be backfilled or migrated.

## Rules
- Compare every change with the schema file in the repo profile.
- New names follow the repo profile's conventions.
- Every backfill, destructive change and data-consent risk goes in the migration panel.
- Say how to roll back in a rollback entry in the migration panel.
- One item per table touched.

## Done when
- Every touched table has a diff card with an exact schema diff.
- The migration panel says how to roll back.

## Always ask
- Can this change be undone without losing data?
```

Replace `defaults/plumbing/phases.md` with:
```markdown
---
id: phases
title: Phases & milestones
order: 8
screen: list
emptyMessage: This plan doesn't need phases.
fields: []
answerPresets: []
timeline: true
enabled: true
---

## What to look for
- A sensible order to build and ship the work.

## Rules
- Each phase has a goal, the items it includes, and "done when" criteria.
- Each phase lists its items by id.
- No task lists. The implementation planner writes tasks.
- Make each phase shippable on its own when possible.

## Done when
- Every in-scope item belongs to a phase.
- Every phase has exit criteria.

## Always ask
- What's the smallest first phase that's useful?
```

Replace `defaults/plumbing/flows.md` with:
```markdown
---
id: flows
title: Flows
order: 4
screen: flows
emptyMessage: This plan doesn't add or change any user or system flows.
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- Journeys a person takes through the product.
- Sequences of calls between parts of the system, including jobs and external services.

## Rules
- Tag each flow user, system or both.
- User flows are steps with the screen shown at each step. Reuse the UI mockups.
- Point user-flow steps at their UI mockups.
- System flows are steps between lanes that map to real code parts.
- Number the steps so both views of a flow line up.
- Include the failure path when a step can fail.

## Done when
- Every flow in the plan is described step by step.
- Each step that touches the system says what the system does.

## Always ask
- What happens if this step fails halfway?
```

- [ ] **Step 7: Run the tests**

Run:
```bash
pnpm vitest run packages/mcp/test/plugin.test.ts packages/core/test/defaults.test.ts
pnpm typecheck && pnpm test
```
Expected: PASS. The defaults test still finds ten valid types, each with all four sections.

- [ ] **Step 8: Commit**

```bash
git add plugin defaults packages/mcp/test/plugin.test.ts packages/core/test/defaults.test.ts
git commit -m "feat(plugin): importers and thread agents write drawings to the documented shapes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Views carry the data, checks and change summaries

Type screens and the thread view get everything the drawings need:
- each item's raw `data`, `body`, `links`, `anchor` and `createdBy`;
- the checks against the plan's clone (Decision 5), made by a checker the service builds for each request and never stored;
- for a pin, the item it's on.

Option previews describe a data patch in words ("1 box added") instead of a bare "data: updated", and carry the proposed data so Task 16 can draw it. Phases rows come in phase order.

**Files:**
- Create:
  - `packages/core/src/dataDiff.ts`
  - `packages/core/test/dataDiff.test.ts`
  - `packages/service/src/checker.ts`
  - `packages/service/test/visual.test.ts`
- Modify:
  - `packages/core/src/schemas/views.ts` (`TypeItemRow`, `ThreadDetail`, `ChangePreview`)
  - `packages/core/src/store/projects.ts` (`loadTypeItems` takes a checker, fills the new fields, sorts timelines by order)
  - `packages/core/src/store/detail.ts` (`loadThreadDetail` takes a checker, fills `checks`, `anchorParent` and `type.timeline`, and passes `kindOf` to previews)
  - `packages/core/src/docDiff.ts` (`previewChange` takes `kindOf`)
  - `packages/core/src/index.ts`
  - `packages/service/src/routes/projects.ts` (the types route passes a checker)
  - `packages/service/src/routes/threads.ts` (the thread route passes a checker)
- Test:
  - `packages/core/test/dataDiff.test.ts`
  - `packages/core/test/detail.test.ts`
  - `packages/core/test/docDiff.test.ts`
  - `packages/service/test/visual.test.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `parseData`, `dataKindOf`, and the types `Anchor`, `DataKind`, `VisualData`, `DiagramData`, `TableDiff`, `MockupData`, `FlowData`, `PhaseData`. Also `Item.anchor`.
  - From Task 3: `DataChecks` (in `schemas/views.ts`), `DataChecker` and `createDataChecker` (`store/checks.ts`, exported from `@dev-plumbing/core`).
  - From Task 4: `TypeEntry.timeline`.
- Produces:
  - **`TypeItemRow` gains:** `data: unknown` (raw; null when the item has none), `body: string | null`, `links: string[]`, `anchor: Anchor | null`, `createdBy: 'import' | 'claude' | 'you' | 'whiteboard'`, `checks: DataChecks | null` and `itemRefs: Record<string, { title: string; threadId: string; typeTitle: string }>`. `itemRefs` is `{}` on every row here; Task 15 fills it for timeline types (the items each phase lists).
  - **`ThreadDetail` gains:**
    - `checks: DataChecks | null`;
    - `anchorParent: { itemId: string; threadId: string; title: string; typeId: string } | null`;
    - `type.timeline: boolean`.
  - **`ChangePreview` items gain** `data?: { kind: DataKind; summary: string[]; after: unknown }`.
  - **Core functions:**
    - `loadTypeItems(ref, types, typeId, opts?: { checker?: DataChecker })`. Rows sort by title, except `timeline` types, which sort by `data.order` when it parses; items without valid phase data come after, by title.
    - `loadThreadDetail(o: { dir; threadId; types; checker?: DataChecker })`.
    - `previewChange(draft, items, change, kindOf?: (item: Item) => DataKind | null)`.
    - `dataChangeSummary(kind: DataKind, before: unknown, after: unknown): string[]` (`packages/core/src/dataDiff.ts`).
  - **Service** `packages/service/src/checker.ts`:
    - `cloneOf(ctx: AppContext, ref: ProjectRef): Promise<string | null>`: the plan's clone, or null when it isn't a folder any more.
    - `checkerFor(ctx: AppContext, cfg: LoadedConfig, ref: ProjectRef): Promise<DataChecker>`.
  - **Routes:** `GET /api/projects/:repo/:id/types/:type` rows carry `checks`. `GET /api/projects/:repo/:id/threads/:thread` carries `checks` and `anchorParent`.
  - **`dataChangeSummary` phrases:**

    | Kind | Phrases |
    |---|---|
    | diagram | "1 box added" / "N boxes added", "… removed", "… changed" (label, status, group or codeRef); "1 line added" / "N lines added", "… removed", "… changed"; "groups changed" |
    | database | "field x added", "field x removed", "field x changed"; "schema diff changed" (only when no field changed); "migration notes changed"; "model renamed to X"; "marked as new/changed/removed" |
    | mockups | "After mockup added/removed/redrawn", "Before mockup added/removed/redrawn", "location changed", "kit changed" |
    | flows | "step N added/removed/changed", "lanes changed", "flow kind changed" |
    | timeline | "now phase N", "goal changed", "done-when changed", "items changed" |

    - Data where there was none (undefined or null before) is `["drawing added"]`.
    - Data that doesn't parse on either side is `["drawing replaced"]`.
    - Identical data is `[]`.
    - Data that differs in a way no phrase covers is `["details changed"]`.

- [ ] **Step 1: Write the failing core tests**

`packages/core/test/dataDiff.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { dataChangeSummary } from '../src/dataDiff';
import type { DiagramData, FlowData, MockupData, PhaseData, TableDiff } from '../src/schemas';

const diagram: DiagramData = {
  kind: 'system',
  groups: [{ id: 'web', label: 'Web app' }, { id: 'jobs', label: 'Jobs' }],
  nodes: [
    { id: 'page', label: 'Account page', group: 'web', status: 'changed', codeRef: { path: 'apps/web/app/account/page.tsx' } },
    { id: 'job', label: 'Daily job', group: 'jobs', status: 'new' },
    { id: 'db', label: 'Subscriptions table', status: 'unchanged' },
  ],
  edges: [
    { id: 'reads', from: 'job', to: 'db', label: 'reads' },
    { id: 'shows', from: 'page', to: 'db' },
  ],
};
const sms = { id: 'sms', label: 'SMS sender', status: 'external' as const };

describe('what a drawing change does, in words', () => {
  it('counts boxes and lines added, removed and changed', () => {
    expect(dataChangeSummary('diagram', diagram, { ...diagram, nodes: [...diagram.nodes, sms], edges: [...diagram.edges, { id: 'sends', from: 'job', to: 'sms' }] })).toEqual([
      '1 box added',
      '1 line added',
    ]);
    const after: DiagramData = {
      kind: 'system',
      groups: [{ id: 'jobs', label: 'Jobs' }],
      nodes: [
        { id: 'job', label: 'Daily reminder job', group: 'jobs', status: 'new' },
        { id: 'db', label: 'Subscriptions table', status: 'unchanged' },
        sms,
        { id: 'email', label: 'Email sender', status: 'external' },
      ],
      edges: [
        { id: 'reads', from: 'job', to: 'db', label: 'reads due subscriptions' },
        { id: 'sends', from: 'job', to: 'sms' },
        { id: 'mails', from: 'job', to: 'email', style: 'dashed' },
      ],
    };
    expect(dataChangeSummary('diagram', diagram, after)).toEqual(['2 boxes added', '1 box removed', '1 box changed', '2 lines added', '1 line removed', '1 line changed', 'groups changed']);
  });

  it("says what changed in a table's fields and migration notes", () => {
    const table: TableDiff = {
      model: 'Subscription',
      change: 'changed',
      fields: [
        { name: 'status', type: 'String', change: 'unchanged' },
        { name: 'remindDays', type: 'Int', change: 'added', default: '3' },
      ],
      schemaDiff: '+  remindDays Int @default(3)',
      migration: [{ kind: 'additive', text: 'Add remindDays with a default of 3.' }],
    };
    const after: TableDiff = {
      ...table,
      fields: [
        { name: 'remindDays', type: 'Int', change: 'added', default: '5' },
        { name: 'pausedAt', type: 'DateTime?', change: 'added' },
      ],
      schemaDiff: '+  remindDays Int @default(5)\n+  pausedAt   DateTime?',
      migration: [{ kind: 'additive', text: 'Add remindDays with a default of 3.' }, { kind: 'rollback', text: 'Drop both columns.' }],
    };
    expect(dataChangeSummary('database', table, after)).toEqual(['field pausedAt added', 'field status removed', 'field remindDays changed', 'migration notes changed']);
    expect(dataChangeSummary('database', table, { ...table, schemaDiff: '+  remindDays Int @default(3) // days before' })).toEqual(['schema diff changed']);
    expect(dataChangeSummary('database', table, { ...table, model: 'Plan', change: 'removed' })).toEqual(['model renamed to Plan', 'marked as removed']);
  });

  it('says which mockup was added, removed or redrawn', () => {
    const mockup: MockupData = { location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] }, kit: 'web', after: '<div class="p-4">Restock soon</div>' };
    const withBefore: MockupData = { ...mockup, before: '<div class="p-4">Account</div>' };
    expect(dataChangeSummary('mockups', mockup, { ...mockup, after: '<div class="p-6">Restock soon</div>' })).toEqual(['After mockup redrawn']);
    expect(dataChangeSummary('mockups', mockup, withBefore)).toEqual(['Before mockup added']);
    expect(dataChangeSummary('mockups', withBefore, { ...withBefore, before: '<div class="p-2">Account</div>' })).toEqual(['Before mockup redrawn']);
    expect(dataChangeSummary('mockups', withBefore, mockup)).toEqual(['Before mockup removed']);
    expect(dataChangeSummary('mockups', mockup, { ...mockup, location: { ...mockup.location, route: '/account/reminders' } })).toEqual(['location changed']);
    expect(dataChangeSummary('mockups', mockup, { ...mockup, kit: 'admin' })).toEqual(['kit changed']);
    // A UI item from before Plan 3 has a location and kit but no markup.
    expect(dataChangeSummary('mockups', { location: mockup.location, kit: 'web' }, mockup)).toEqual(['After mockup added']);
  });

  it('names the flow steps that changed', () => {
    const flow: FlowData = {
      kind: 'system',
      lanes: [{ id: 'job', label: 'Daily job', status: 'new' }, { id: 'db', label: 'Database', status: 'unchanged' }],
      steps: [
        { n: 1, from: 'job', to: 'db', label: 'Find subscriptions due soon' },
        { n: 2, from: 'job', to: 'job', label: 'Pick a channel' },
      ],
    };
    const steps = [{ n: 1, from: 'job', to: 'db', label: 'Find subscriptions due in 3 days' }, { n: 3, from: 'job', to: 'db', label: 'Log the send' }];
    expect(dataChangeSummary('flows', flow, { ...flow, steps })).toEqual(['step 3 added', 'step 2 removed', 'step 1 changed']);
    expect(dataChangeSummary('flows', flow, { ...flow, lanes: [...flow.lanes!, { id: 'sms', label: 'SMS provider', status: 'external' }] })).toEqual(['lanes changed']);
    expect(dataChangeSummary('flows', flow, { ...flow, kind: 'both' })).toEqual(['flow kind changed']);
  });

  it('says what changed in a phase', () => {
    const phase: PhaseData = { order: 1, goal: 'Send the first reminders', doneWhen: ['Reminders go out daily'], itemIds: ['architecture-system', 'database-subscription'] };
    const after: PhaseData = { order: 2, goal: 'Send reminders by SMS', doneWhen: ['Reminders go out daily', 'Opt-out works'], itemIds: ['architecture-system', 'database-subscription', 'ui-settings-card'] };
    expect(dataChangeSummary('timeline', phase, after)).toEqual(['now phase 2', 'goal changed', 'done-when changed', 'items changed']);
  });

  it('falls back when a drawing is new, unreadable or only differs in details', () => {
    expect(dataChangeSummary('diagram', diagram, diagram)).toEqual([]);
    expect(dataChangeSummary('diagram', undefined, diagram)).toEqual(['drawing added']);
    expect(dataChangeSummary('timeline', null, { order: 1, goal: 'Ship', doneWhen: ['It ships'], itemIds: [] })).toEqual(['drawing added']);
    expect(dataChangeSummary('diagram', { nodes: 'boxes' }, diagram)).toEqual(['drawing replaced']);
    expect(dataChangeSummary('diagram', diagram, { nodes: [] })).toEqual(['drawing replaced']);
    expect(dataChangeSummary('diagram', diagram, { ...diagram, kind: 'data_flow' })).toEqual(['details changed']);
  });
});
```

In `packages/core/test/docDiff.test.ts`, add this test at the end of `describe('change previews', …)`:
```ts
  it('describes a drawing change in words instead of "data: updated"', () => {
    const before = { kind: 'system', groups: [], nodes: [{ id: 'job', label: 'Daily job', status: 'new' }], edges: [] };
    const after = { ...before, nodes: [...before.nodes, { id: 'sms', label: 'SMS sender', status: 'external' }] };
    const { item } = pair('a1', { type: 'architecture', title: 'System view' });
    const drawn = { ...item, data: before };
    const change = { items: [{ itemId: 'a1', patch: { summary: 'With SMS.', data: after } }] };
    const kindOf = (i: { type: string }) => (i.type === 'architecture' ? ('diagram' as const) : null);
    expect(previewChange(original, [drawn], change, kindOf).items).toEqual([
      { itemId: 'a1', title: 'System view', changes: [{ field: 'summary', before: 'A summary.', after: 'With SMS.' }], data: { kind: 'diagram', summary: ['1 box added'], after } },
    ]);
    // Without kindOf, or for an item that isn't drawn, it stays a plain field change.
    expect(previewChange(original, [drawn], change).items[0]?.changes).toContainEqual({ field: 'data', before: '', after: 'updated' });
    expect(previewChange(original, [drawn], change).items[0]?.data).toBeUndefined();
  });
```

In `packages/core/test/detail.test.ts`:
- Add these imports, and change the `./fixtures` import to `import { listType, pair, seedProject, TYPES } from './fixtures';`:
```ts
import type { Anchor, Item, Thread } from '../src/schemas';
import type { DataChecker } from '../src/store/checks';
```
- Add this block at the end of the file:
```ts
describe('drawings on screens and threads', () => {
  const types = [...TYPES, listType('phases', { title: 'Phases & milestones', order: 8, timeline: true })];
  const diagram = {
    kind: 'system',
    groups: [{ id: 'jobs', label: 'Jobs' }],
    nodes: [
      { id: 'job', label: 'Daily job', group: 'jobs', status: 'new', codeRef: { path: 'src/jobs/reminders.ts' } },
      { id: 'db', label: 'Subscriptions table', status: 'unchanged' },
    ],
    edges: [{ id: 'reads', from: 'job', to: 'db', label: 'reads' }],
  };
  const withSms = { ...diagram, nodes: [...diagram.nodes, { id: 'sms', label: 'SMS sender', status: 'external' }], edges: [...diagram.edges, { id: 'sends', from: 'job', to: 'sms' }] };
  const anchor: Anchor = { itemId: 'a1', kind: 'node', ref: 'job', label: 'Daily job' };
  // A stand-in for Task 3's checker: every diagram's "job" box is found.
  const checker: DataChecker = { check: async (kind) => (kind === 'diagram' ? { kind: 'diagram', checked: true, nodes: { job: true } } : null) };
  const drawn = (p: { item: Item; thread: Thread }, extra: Partial<Item>) => ({ ...p, item: { ...p.item, ...extra } });

  it("gives screen rows the item's drawing, body, links, pin and checks", async () => {
    const dir = await seedProject({
      pairs: [
        drawn(pair('a1', { type: 'architecture', title: 'System view' }), { data: diagram, body: 'The daily job and what it reads.' }),
        drawn(pair('a2', { type: 'architecture', title: 'About the daily job' }), { anchor, links: ['a1'], createdBy: 'you' }),
      ],
    });
    const ref = { repo: 'acme', id: 'restock', dir };
    const r = await loadTypeItems(ref, types, 'architecture', { checker });
    expect(r?.items.find((i) => i.id === 'a1')).toMatchObject({
      data: diagram,
      body: 'The daily job and what it reads.',
      links: [],
      anchor: null,
      createdBy: 'import',
      checks: { kind: 'diagram', checked: true, nodes: { job: true } },
      itemRefs: {},
    });
    expect(r?.items.find((i) => i.id === 'a2')).toMatchObject({ data: null, body: null, links: ['a1'], anchor, createdBy: 'you', itemRefs: {} });
    expect((await loadTypeItems(ref, types, 'architecture'))?.items.map((i) => i.checks)).toEqual([null, null]);
  });

  it('lists phases in their order, with phases that have no valid data after them', async () => {
    const phase = (order: number) => ({ order, goal: `Goal ${order}`, doneWhen: ['It ships'], itemIds: [] });
    const dir = await seedProject({
      pairs: [
        drawn(pair('p1', { type: 'phases', title: 'Alpha' }), { data: phase(2) }),
        drawn(pair('p2', { type: 'phases', title: 'Beta' }), { data: phase(1) }),
        drawn(pair('p3', { type: 'phases', title: 'Zed' }), { data: { order: 'soon' } }),
        pair('p4', { type: 'phases', title: 'Aardvark' }),
      ],
    });
    const r = await loadTypeItems({ repo: 'acme', id: 'restock', dir }, types, 'phases');
    expect(r?.type.timeline).toBe(true);
    expect(r?.items.map((i) => i.title)).toEqual(['Beta', 'Alpha', 'Aardvark', 'Zed']);
  });

  it("gives the thread view its checks, the item a pin is on, and previews of drawing changes", async () => {
    const addSms = { id: 'add-sms', label: 'Add the SMS sender', change: { items: [{ itemId: 'a1', patch: { data: withSms } }] } };
    const dir = await seedProject({
      pairs: [
        drawn(pair('a1', { type: 'architecture', title: 'System view', options: [addSms] }), { data: diagram }),
        drawn(pair('a2', { type: 'architecture', title: 'About the daily job' }), { anchor, links: ['a1'], createdBy: 'you' }),
      ],
    });
    const d = await loadThreadDetail({ dir, threadId: 't-a1', types, checker });
    expect(d.checks).toEqual({ kind: 'diagram', checked: true, nodes: { job: true } });
    expect(d.anchorParent).toBeNull();
    expect(d.type).toMatchObject({ id: 'architecture', screen: 'diagram', timeline: false });
    expect(d.previews['add-sms']?.items).toEqual([
      { itemId: 'a1', title: 'System view', changes: [], data: { kind: 'diagram', summary: ['1 box added', '1 line added'], after: withSms } },
    ]);
    const pin = await loadThreadDetail({ dir, threadId: 't-a2', types });
    expect(pin.anchorParent).toEqual({ itemId: 'a1', threadId: 't-a1', title: 'System view', typeId: 'architecture' });
    expect(pin.checks).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/dataDiff.test.ts packages/core/test/docDiff.test.ts packages/core/test/detail.test.ts`
Expected: FAIL. `../src/dataDiff` is missing, rows and thread details have no `data`, `checks`, `itemRefs` or `anchorParent`, phases sort by title, and `previewChange` ignores `kindOf`.

- [ ] **Step 3: Add the view fields**

In `packages/core/src/schemas/views.ts`:
- Import the types `Anchor` and `DataKind` from `./data`. If Task 3 already imports from `./data` here, add them to that import instead of adding a second one.
- Replace `TypeItemRow` with:
```ts
export type TypeItemRow = {
  id: string; threadId: string; title: string; summary: string; status: DisplayStatus; blocking: boolean;
  fields: Record<string, string>; messageCount: number; latest: { author: 'you' | 'claude' | 'system'; text: string } | null;
  open: OpenOptions | null; draft: ThreadDraft | null; decision: string | null; flagged: boolean;
  /** The item's drawing as stored (raw: screens parse it with parseData), or null when it has none. */
  data: unknown; body: string | null; links: string[]; anchor: Anchor | null;
  createdBy: 'import' | 'claude' | 'you' | 'whiteboard';
  /** Checks against the plan's clone, made when the screen loads. Never stored. */
  checks: DataChecks | null;
  /** Timeline types: each item in data.itemIds that exists, for the phase's links. {} for other types. */
  itemRefs: Record<string, { title: string; threadId: string; typeTitle: string }>;
};
```
- Replace `ChangePreview` with:
```ts
export type ChangePreview = {
  md: DiffSegment[] | null;
  /** `data` is set when a patch changes a drawn item's data: what it does, in words, and the proposed data. */
  items: { itemId: string; title: string; changes: FieldChange[]; data?: { kind: DataKind; summary: string[]; after: unknown } }[];
  problem?: string;
};
```
- Replace `ThreadDetail` with:
```ts
export type ThreadDetail = {
  thread: Thread & { display: DisplayStatus };
  item: Item;
  type: { id: string; title: string; screen: Screen; timeline: boolean; fields: string[]; answerPresets: string[] };
  open: OpenOptions | null;
  previews: Record<string, ChangePreview>;
  linked: { itemId: string; threadId: string; title: string; typeTitle: string }[];
  refs: Record<string, { title: string; threadId: string; typeTitle: string }>;
  edits: Record<string, { state: ChangeState; summary: string }>;
  decisions: Decision[];
  listening: ListeningState;
  /** The item's checks against the plan's clone, made when the thread loads. Never stored. */
  checks: DataChecks | null;
  /** For a pin ("Ask about this box", + Pin): the item it's on. */
  anchorParent: { itemId: string; threadId: string; title: string; typeId: string } | null;
};
```

`DataChecks` is already in this file (Task 3).

- [ ] **Step 4: Write `dataChangeSummary`**

`packages/core/src/dataDiff.ts`:
```ts
import { parseData, type DataKind, type DiagramData, type FlowData, type MockupData, type PhaseData, type TableDiff, type VisualData } from './schemas';

type Compared = { added: string[]; removed: string[]; changed: string[] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Keys only in `after`, keys only in `before`, and keys in both whose value differs. */
function compare<T>(before: T[], after: T[], key: (x: T) => string, value: (x: T) => unknown): Compared {
  const was = new Map(before.map((x) => [key(x), x]));
  const now = new Map(after.map((x) => [key(x), x]));
  return {
    added: after.map(key).filter((k) => !was.has(k)),
    removed: before.map(key).filter((k) => !now.has(k)),
    changed: after
      .filter((x) => {
        const old = was.get(key(x));
        return old !== undefined && !same(value(old), value(x));
      })
      .map(key),
  };
}

/** "1 box added", "2 boxes removed"… for each non-empty part. */
const counted = (c: Compared, one: string, many: string): string[] =>
  (['added', 'removed', 'changed'] as const).filter((k) => c[k].length).map((k) => `${count(c[k].length, one, many)} ${k}`);

function diagram(a: DiagramData, b: DiagramData): string[] {
  const boxes = compare(a.nodes, b.nodes, (n) => n.id, (n) => [n.label, n.status, n.group ?? null, n.codeRef ?? null]);
  const lines = compare(a.edges, b.edges, (e) => e.id, (e) => [e.from, e.to, e.label ?? null, e.style ?? 'solid']);
  return [...counted(boxes, 'box', 'boxes'), ...counted(lines, 'line', 'lines'), ...(same(a.groups, b.groups) ? [] : ['groups changed'])];
}

function table(a: TableDiff, b: TableDiff): string[] {
  const f = compare(a.fields, b.fields, (x) => x.name, (x) => [x.type, x.change, x.default ?? null, x.note ?? null]);
  const fields = [...f.added.map((n) => `field ${n} added`), ...f.removed.map((n) => `field ${n} removed`), ...f.changed.map((n) => `field ${n} changed`)];
  return [
    ...(a.model === b.model ? [] : [`model renamed to ${b.model}`]),
    ...(a.change === b.change ? [] : [`marked as ${b.change}`]),
    ...fields,
    // A changed field already explains a new schema diff, so it's only named on its own.
    ...(fields.length || a.schemaDiff === b.schemaDiff ? [] : ['schema diff changed']),
    ...(same(a.migration ?? [], b.migration ?? []) ? [] : ['migration notes changed']),
  ];
}

function side(name: 'After' | 'Before', a: string | undefined, b: string | undefined): string[] {
  if (a === b) return [];
  if (a === undefined) return [`${name} mockup added`];
  if (b === undefined) return [`${name} mockup removed`];
  return [`${name} mockup redrawn`];
}

function mockup(a: MockupData, b: MockupData): string[] {
  return [
    ...side('After', a.after, b.after),
    ...side('Before', a.before, b.before),
    ...(same(a.location, b.location) ? [] : ['location changed']),
    ...(a.kit === b.kit ? [] : ['kit changed']),
  ];
}

function flow(a: FlowData, b: FlowData): string[] {
  const byN = (steps: FlowData['steps']) => [...steps].sort((x, y) => x.n - y.n);
  const s = compare(byN(a.steps), byN(b.steps), (x) => String(x.n), (x) => [x.from ?? null, x.to ?? null, x.label, x.mockupId ?? null, x.systemNote ?? null]);
  return [
    ...s.added.map((n) => `step ${n} added`),
    ...s.removed.map((n) => `step ${n} removed`),
    ...s.changed.map((n) => `step ${n} changed`),
    ...(same(a.lanes ?? [], b.lanes ?? []) ? [] : ['lanes changed']),
    ...(a.kind === b.kind ? [] : ['flow kind changed']),
  ];
}

function phase(a: PhaseData, b: PhaseData): string[] {
  return [
    ...(a.order === b.order ? [] : [`now phase ${b.order}`]),
    ...(a.goal === b.goal ? [] : ['goal changed']),
    ...(same(a.doneWhen, b.doneWhen) ? [] : ['done-when changed']),
    ...(same(a.itemIds, b.itemIds) ? [] : ['items changed']),
  ];
}

/** Both sides parsed, then described. Null when either side doesn't parse. */
function summarize<K extends DataKind>(kind: K, before: unknown, after: unknown, describe: (a: VisualData[K], b: VisualData[K]) => string[]): string[] | null {
  const a = parseData(kind, before);
  const b = parseData(kind, after);
  if (!a.ok || !b.ok) return null;
  const out = describe(a.data, b.data);
  return out.length || same(a.data, b.data) ? out : ['details changed'];
}

function byKind(kind: DataKind, before: unknown, after: unknown): string[] | null {
  switch (kind) {
    case 'diagram':
      return summarize(kind, before, after, diagram);
    case 'database':
      return summarize(kind, before, after, table);
    case 'mockups':
      return summarize(kind, before, after, mockup);
    case 'flows':
      return summarize(kind, before, after, flow);
    case 'timeline':
      return summarize(kind, before, after, phase);
  }
}

/**
 * What a data patch changes, as short phrases ("2 boxes added", "field status changed", "After mockup redrawn").
 * Data where there was none is "drawing added"; data that doesn't parse on either side is "drawing replaced".
 */
export function dataChangeSummary(kind: DataKind, before: unknown, after: unknown): string[] {
  if (before === undefined || before === null) return parseData(kind, after).ok ? ['drawing added'] : ['drawing replaced'];
  return byKind(kind, before, after) ?? ['drawing replaced'];
}
```

In `packages/core/src/index.ts`, add `export * from './dataDiff';` after `export * from './docDiff';`.

- [ ] **Step 5: Describe data patches in previews**

In `packages/core/src/docDiff.ts`:
- Replace the imports with:
```ts
import { diffLines } from 'diff';
import { dataChangeSummary } from './dataDiff';
import { applyMdPatches, type Change, type ChangePreview, type DataKind, type DiffSegment, type FieldChange, type HistoryEntry, type Item, type ItemPatch } from './schemas';
```
- Replace `fieldChanges` and `previewChange` with:
```ts
/** The patch's field changes. `dataDescribed` leaves out "data: updated", because the preview describes it instead. */
function fieldChanges(item: Item, patch: ItemPatch, dataDescribed: boolean): FieldChange[] {
  const out: FieldChange[] = [];
  for (const key of ['title', 'summary', 'body'] as const) {
    const after = patch[key];
    if (after !== undefined && after !== item[key]) out.push({ field: key, before: item[key] ?? '', after });
  }
  for (const [field, after] of Object.entries(patch.fields ?? {})) {
    if (item.fields?.[field] !== after) out.push({ field, before: item.fields?.[field] ?? '', after });
  }
  for (const key of ['links', 'codeRefs', 'mdAnchor', 'data'] as const) {
    if (patch[key] !== undefined && !(key === 'data' && dataDescribed)) out.push({ field: key, before: '', after: 'updated' });
  }
  return out;
}

/**
 * What accepting a change would do: the draft diff, and each item's changed fields. With `kindOf`, a patch to a
 * drawn item's data also says what it does to the drawing, in words, and carries the proposed data.
 */
export function previewChange(draft: string, items: Item[], change: Change, kindOf?: (item: Item) => DataKind | null): ChangePreview {
  const problems: string[] = [];
  let md: DiffSegment[] | null = null;
  if (change.md?.length) {
    const r = applyMdPatches(draft, change.md);
    if (r.ok) md = diffText(draft, r.text);
    else problems.push(r.error);
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const itemChanges: ChangePreview['items'] = [];
  for (const c of change.items ?? []) {
    const item = byId.get(c.itemId);
    if (!item) {
      problems.push(`There's no item "${c.itemId}".`);
      continue;
    }
    const kind = c.patch.data !== undefined ? (kindOf?.(item) ?? null) : null;
    itemChanges.push({
      itemId: item.id,
      title: item.title,
      changes: fieldChanges(item, c.patch, kind !== null),
      ...(kind ? { data: { kind, summary: dataChangeSummary(kind, item.data, c.patch.data), after: c.patch.data } } : {}),
    });
  }
  return { md, items: itemChanges, ...(problems.length ? { problem: problems.join(' ') } : {}) };
}
```

- [ ] **Step 6: Fill the rows**

In `packages/core/src/store/projects.ts`:
- Add `dataKindOf` and `parseData` to the `../schemas` import list, and add `import type { DataChecker } from './checks';` below the `./threads` import.
- Replace `loadTypeItems` with:
```ts
const byTitle = (a: TypeItemRow, b: TypeItemRow) => a.title.localeCompare(b.title);

/** Phases in their order. Items without valid phase data come after them, by title. */
function byPhaseOrder(rows: TypeItemRow[]): TypeItemRow[] {
  const order = new Map(
    rows.map((r) => {
      const p = parseData('timeline', r.data);
      return [r.id, p.ok ? p.data.order : null] as const;
    }),
  );
  return [...rows].sort((a, b) => {
    const x = order.get(a.id) ?? null;
    const y = order.get(b.id) ?? null;
    if (x !== null && y !== null) return x - y || byTitle(a, b);
    if (x !== null) return -1;
    if (y !== null) return 1;
    return byTitle(a, b);
  });
}

/** A plumbing type's rows. With a checker, each row carries its checks against the plan's clone. */
export async function loadTypeItems(
  ref: ProjectRef,
  types: PlumbingType[],
  typeId: string,
  opts: { checker?: DataChecker } = {},
): Promise<{ type: TypeEntry; items: TypeItemRow[] } | null> {
  const home = await loadProjectHome(ref, types);
  const type = home.types.find((t) => t.id === typeId);
  if (!type) return null;
  const kind = dataKindOf(type);
  const { values: items } = await readItems(ref.dir);
  const { values: threads } = await readThreads(ref.dir);
  const byId = new Map(threads.map((t) => [t.id, t]));
  const decisions = activeDecisions(await readDecisions(ref.dir));
  const ofType = items.filter((i) => i.type === typeId);
  const checks = await Promise.all(ofType.map((i) => (opts.checker ? opts.checker.check(kind, i.data) : null)));
  const rows = ofType.map((i, n): TypeItemRow => {
    const th = byId.get(i.threadId);
    const last = th ? [...th.messages].reverse().find((m) => m.text) : undefined;
    return {
      id: i.id,
      threadId: i.threadId,
      title: i.title,
      summary: i.summary,
      status: th ? displayStatus(th) : 'idle',
      blocking: i.fields?.blocking === 'true',
      fields: i.fields ?? {},
      messageCount: th?.messages.length ?? 0,
      latest: last?.text ? { author: last.author, text: last.text } : null,
      open: th ? openOptions(th) : null,
      draft: th?.draft ?? null,
      decision: [...decisions].reverse().find((d) => d.threadId === i.threadId)?.text ?? null,
      flagged: Boolean(i.flags?.length),
      data: i.data ?? null,
      body: i.body ?? null,
      links: i.links ?? [],
      anchor: i.anchor ?? null,
      createdBy: i.createdBy,
      checks: checks[n] ?? null,
      // Timeline types fill this in Task 15 (the items each phase lists).
      itemRefs: {},
    };
  });
  return { type, items: kind === 'timeline' ? byPhaseOrder(rows) : rows.sort(byTitle) };
}
```

- [ ] **Step 7: Fill the thread view**

In `packages/core/src/store/detail.ts`:
- Replace the imports with:
```ts
import { diffDocuments, previewChange } from '../docDiff';
import { changeState, dataKindOf, displayStatus, type ChangePreview, type ChangesResponse, type Item, type ListeningState, type PlumbingType, type ThreadDetail } from '../schemas';
import type { DataChecker } from './checks';
import { activeDecisions } from './decisions';
import { readDecisions, readDocText, readHistory, readItem, readItems, readProjectFile, readThread, readThreads } from './io';
import { openOptions } from './threads';
```
- Replace `loadThreadDetail` with:
```ts
export async function loadThreadDetail(o: { dir: string; threadId: string; types: PlumbingType[]; checker?: DataChecker }): Promise<Omit<ThreadDetail, 'listening'>> {
  const thread = await readThread(o.dir, o.threadId);
  const item = await readItem(o.dir, thread.itemId);
  const project = await readProjectFile(o.dir);
  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: items } = await readItems(o.dir);
  const typeOf = (typeId: string) => o.types.find((t) => t.id === typeId);
  const type = typeOf(item.type);
  const kindOf = (i: Item) => {
    const t = typeOf(i.type);
    return t ? dataKindOf(t) : null;
  };
  const refFor = (id: string) => {
    const i = items.find((x) => x.id === id);
    return i ? { title: i.title, threadId: i.threadId, typeTitle: typeOf(i.type)?.title ?? i.type } : null;
  };

  const open = openOptions(thread);
  const previews: Record<string, ChangePreview> = {};
  for (const option of open?.options ?? []) if (option.change) previews[option.id] = previewChange(draft, items, option.change, kindOf);

  const linkedIds = new Set([...(item.links ?? []), ...items.filter((i) => i.links?.includes(item.id)).map((i) => i.id)]);
  const linked = [...linkedIds].flatMap((id) => {
    const r = refFor(id);
    return r ? [{ itemId: id, threadId: r.threadId, title: r.title, typeTitle: r.typeTitle }] : [];
  });

  const refs: ThreadDetail['refs'] = {};
  const editIds = new Set<string>();
  for (const m of thread.messages) {
    if (m.author !== 'claude') continue;
    for (const id of [...(m.newItemIds ?? []), ...(m.impacts ?? []).map((x) => x.itemId)]) {
      const r = refFor(id);
      if (r) refs[id] = r;
    }
    for (const e of m.smallEdits ?? []) editIds.add(e.changeId);
  }
  const edits: ThreadDetail['edits'] = {};
  for (const h of await readHistory(o.dir)) if (editIds.has(h.id)) edits[h.id] = { state: changeState(h), summary: h.summary };
  const parent = item.anchor ? items.find((i) => i.id === item.anchor?.itemId) : undefined;

  return {
    thread: { ...thread, display: displayStatus(thread) },
    item,
    type: {
      id: item.type,
      title: type?.title ?? item.type,
      screen: type?.screen ?? 'list',
      timeline: type?.timeline ?? false,
      fields: type?.fields ?? [],
      answerPresets: type?.answerPresets ?? [],
    },
    open,
    previews,
    linked,
    refs,
    edits,
    decisions: activeDecisions(await readDecisions(o.dir)).filter((d) => d.itemIds.includes(item.id) || d.threadId === thread.id),
    checks: o.checker ? await o.checker.check(kindOf(item), item.data) : null,
    anchorParent: parent ? { itemId: parent.id, threadId: parent.threadId, title: parent.title, typeId: parent.type } : null,
  };
}
```

Run: `pnpm vitest run packages/core && pnpm --filter @dev-plumbing/core typecheck`
Expected: PASS.

- [ ] **Step 8: Write the failing route tests**

`packages/service/test/visual.test.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { makeRepo } from '../../core/test/fixtures';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const P = '/api/projects/acme-app/restock-reminders';
const SCHEMA = `model Customer {
  id            String         @id @default(uuid())
  email         String         @unique
  subscriptions Subscription[]
}

model Subscription {
  id         String   @id @default(uuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id])
  status     String
}
`;

/** The job box points at a real file and symbol; the SMS box points at a file that isn't there. */
const system = {
  kind: 'system',
  groups: [{ id: 'jobs', label: 'Jobs' }],
  nodes: [
    { id: 'job', label: 'Daily reminder job', group: 'jobs', status: 'new', codeRef: { path: 'src/jobs/reminders.ts', symbol: 'sendReminders' } },
    { id: 'sms', label: 'SMS sender', status: 'new', codeRef: { path: 'src/sms/send.ts' } },
    { id: 'db', label: 'Subscriptions table', status: 'unchanged' },
  ],
  edges: [
    { id: 'reads', from: 'job', to: 'db', label: 'reads' },
    { id: 'sends', from: 'job', to: 'sms' },
  ],
};
/** status matches the schema, remindDays is new, and pausedAt claims to change a field the schema doesn't have. */
const subscription = {
  model: 'Subscription',
  change: 'changed',
  fields: [
    { name: 'status', type: 'String', change: 'unchanged' },
    { name: 'remindDays', type: 'Int', change: 'added', default: '3' },
    { name: 'pausedAt', type: 'DateTime?', change: 'changed' },
  ],
  schemaDiff: '+  remindDays Int @default(3)',
  migration: [{ kind: 'additive', text: 'Add remindDays with a default of 3.' }],
};
const turnOn = { kind: 'user', steps: [{ n: 1, label: 'Open account settings' }, { n: 2, label: 'Turn reminders on' }] };

/** Imports a plan whose clone has a Prisma schema and one source file: a diagram, a table and a flow, and "no changes" elsewhere. */
async function setup() {
  const s = await makeContext();
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
  fs.mkdirSync(path.join(repo, 'packages', 'db', 'prisma'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'packages', 'db', 'prisma', 'schema.prisma'), SCHEMA);
  fs.mkdirSync(path.join(repo, 'src', 'jobs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'jobs', 'reminders.ts'), 'export function sendReminders() {}\n');
  await writeJsonAtomic(path.join(s.ctx.configDir, 'repos', 'acme-app.json'), {
    name: 'acme-app',
    match: ['github.com/acme/acme-app'],
    schema: { type: 'prisma', path: 'packages/db/prisma/schema.prisma' },
  });
  const rt = createRuntime();
  const app = createApp(s.ctx, rt);
  const send = async (method: string, route: string, body?: unknown): Promise<{ status: number; body: Json }> => {
    const res = await call(app, route, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  const batches: Record<string, unknown> = {
    architecture: { items: [{ key: 'system', title: 'System view', summary: 'The daily job and what it touches.', data: system }] },
    database: { items: [{ key: 'subscription', title: 'Subscription', summary: 'Reminder settings on each subscription.', data: subscription }] },
    flows: { items: [{ key: 'turn-on', title: 'Turning reminders on', summary: 'From account settings.', data: turnOn }] },
  };
  const open = await send('POST', '/api/claude/open', { cwd: repo, plan: 'docs/specs/restock-reminders.md' });
  for (const type of open.body.importTypes as { id: string }[]) {
    const r = await send('POST', '/api/claude/items', { repo: 'acme-app', project: 'restock-reminders', type: type.id, cwd: repo, ...((batches[type.id] as object | undefined) ?? { noChanges: 'None.' }) });
    expect(r.status).toBe(200);
  }
  return { ...s, rt, app, send, repo, dir: path.join(s.root, 'acme-app', 'restock-reminders') };
}

describe('checks against the code', () => {
  it("checks each table against the repo's Prisma schema when the screen loads", async () => {
    const t = await setup();
    const r = await t.send('GET', `${P}/types/database`);
    expect(r.status).toBe(200);
    const row = r.body.items[0];
    expect(row).toMatchObject({ title: 'Subscription', data: { model: 'Subscription' }, createdBy: 'import', anchor: null, checks: { kind: 'database', checked: true } });
    expect(row.checks.file).toContain('schema.prisma');
    expect(row.checks.warnings).toEqual([expect.stringMatching(/Subscription\.pausedAt/)]);
  });

  it('marks which diagram boxes point at real files, on the screen and in the thread', async () => {
    const t = await setup();
    const rows = (await t.send('GET', `${P}/types/architecture`)).body.items;
    expect(rows[0].checks).toEqual({ kind: 'diagram', checked: true, nodes: { job: true, sms: false } });
    const d = (await t.send('GET', `${P}/threads/t-architecture-system`)).body;
    expect(d.checks).toEqual({ kind: 'diagram', checked: true, nodes: { job: true, sms: false } });
    expect(d.anchorParent).toBeNull();
    expect(d.type).toMatchObject({ screen: 'diagram', timeline: false });
    expect((await t.send('GET', `${P}/types/flows`)).body.items[0]).toMatchObject({ data: { kind: 'user' }, checks: null });
  });

  it("says tables and diagrams aren't checked when the clone is gone", async () => {
    const t = await setup();
    fs.rmSync(t.repo, { recursive: true, force: true });
    const table = (await t.send('GET', `${P}/types/database`)).body.items[0];
    expect(table.checks).toEqual({ kind: 'database', checked: false, reason: "The plan's clone isn't on this Mac any more.", warnings: [] });
    const diagram = (await t.send('GET', `${P}/types/architecture`)).body.items[0];
    expect(diagram.checks).toEqual({ kind: 'diagram', checked: false, reason: "The plan's clone isn't on this Mac any more.", nodes: {} });
  });
});
```

Run: `pnpm vitest run packages/service/test/visual.test.ts`
Expected: FAIL, because the routes don't pass a checker, so every row's `checks` is null.

- [ ] **Step 9: Build a checker for each request**

`packages/service/src/checker.ts`:
```ts
import fs from 'node:fs/promises';
import { createDataChecker, expandHome, readProjectFile, type DataChecker, type LoadedConfig, type ProjectRef } from '@dev-plumbing/core';
import type { AppContext } from './context';

/** The plan's clone, or null when it isn't a folder on this Mac any more (or project.json can't be read). */
export async function cloneOf(ctx: AppContext, ref: ProjectRef): Promise<string | null> {
  const project = await readProjectFile(ref.dir).catch(() => null);
  if (!project) return null;
  const clone = expandHome(project.source.clone, ctx.home);
  const stat = await fs.stat(clone).catch(() => null);
  return stat?.isDirectory() ? clone : null;
}

/** Checks against the code, for one request: built from the plan's clone and the repo's profile, and never stored. */
export async function checkerFor(ctx: AppContext, cfg: LoadedConfig, ref: ProjectRef): Promise<DataChecker> {
  return createDataChecker({ clone: await cloneOf(ctx, ref), profile: cfg.repos.find((p) => p.name === ref.repo) });
}
```

In `packages/service/src/routes/projects.ts`:
- Add `import { checkerFor } from '../checker';` below the `../errors` import.
- Replace the types route with:
```ts
  r.get('/projects/:repo/:id/types/:type', handle(async (c) => {
    const { cfg, ref } = await locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
    const result = await loadTypeItems(ref, cfg.types, c.req.param('type')!, { checker: await checkerFor(ctx, cfg, ref) });
    return result ? c.json(result) : c.json({ error: "That plumbing type doesn't exist or is turned off." }, 404);
  }));
```

In `packages/service/src/routes/threads.ts`:
- Add `import { checkerFor } from '../checker';` below the `../errors` import.
- Replace the thread route with the version below. Option previews get `kindOf` inside `loadThreadDetail` (Step 7), so this route only passes the checker.
```ts
  r.get(`${base}/threads/:threadId`, handle(async (c) => {
    const { cfg, ref } = await find(c);
    const detail = await loadThreadDetail({ dir: ref.dir, threadId: c.req.param('threadId')!, types: cfg.types, checker: await checkerFor(ctx, cfg, ref) });
    return c.json({ ...detail, listening: rt.listeners.state(projectKey(ref.repo, ref.id)) });
  }));
```

- [ ] **Step 10: Run the tests**

Run:
```bash
pnpm vitest run packages/core packages/service
pnpm typecheck && pnpm test
pnpm test:e2e
```
Expected: PASS. A broken `project.json` still gives 422 on the types route: `cloneOf` returns null, and `loadTypeItems` throws `ProjectUnreadableError` as before. The web doesn't read the new fields yet, so the e2e specs pass unchanged.

- [ ] **Step 11: Commit**

```bash
git add packages/core packages/service
git commit -m "feat: screens and threads get each item's drawing, its checks, and what a change does to it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Ask about a box, an element or a step

Decision 3: a pin starts a new item of the same plumbing type as the item it's on. "Ask about this box" (a diagram node), **+ Pin** (a mockup element) and "Ask about this step" (a flow step) all work this way. The new item records an `anchor`, links to the item it's about, and its thread starts with your message, sent straight away like **+ Question**. Nothing is written into the parent item. This task adds the core and service side, and the web client's type; the screens come in Tasks 11, 13 and 14.

**Files:**
- Create: `packages/core/test/anchors.test.ts`
- Modify:
  - `packages/core/src/store/threads.ts` (`addOwnItem` takes `anchor`)
  - `packages/service/src/routes/threads.ts` (`POST …/items` takes `anchor`)
  - `packages/web/src/api/client.ts` (`api.addItem` body gains `anchor?: Anchor`)
- Test:
  - `packages/core/test/anchors.test.ts`
  - `packages/service/test/visual.test.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `anchorSchema`, `Anchor`, `anchorKindFor`, `dataKindOf`, `parseData`, and `itemSchema.anchor`.
  - From Task 6: `ThreadDetail.anchorParent`, and `packages/service/test/visual.test.ts` with its `setup()`: items `architecture-system` (nodes `job`, `sms`, `db`), `database-subscription` and `flows-turn-on` (steps 1 and 2).
- Produces:
  - `addOwnItem(dir, o: { type: PlumbingType; title: string; text: string; fields?: Record<string, string>; anchor?: Anchor; now?: Date })`. With an anchor:
    - the anchored item must exist: "There's no item <id> to ask about.";
    - it must be of `o.type`: "Pins start an item of the same plumbing type.";
    - `anchor.kind` must equal `anchorKindFor(dataKindOf(type))`: "<Type title> items can't take a <kind> pin.";
    - for `node`, the anchored item's data must parse as a diagram ("\"<title>\" has no diagram to ask about.") that has that node id ("There's no box \"<ref>\" in \"<title>\".");
    - for `step`, it must parse as a flow ("\"<title>\" has no flow to ask about.") with that step `n` ("There's no step <ref> in \"<title>\".");
    - element selectors aren't checked, so a pin survives a redrawn mockup;
    - the new item gets `anchor` and `links: [anchor.itemId]`, and its id stays `${type.id}-${slugify(title)}`.
  - `POST /api/projects/:repo/:id/items`:
    - the body is a strict object that gains `anchor?: Anchor`;
    - with an anchor, the service reads the anchored item under the project lock, and `body.type` must equal its type ("Pins start an item of the same plumbing type.", 400);
    - a missing anchored item is 400 "There's no item <id> to ask about.".
  - `api.addItem(repo, id, body: { type: string; title: string; text: string; fields?: Record<string, string>; anchor?: Anchor })`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/anchors.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import type { Anchor, Item, Thread } from '../src/schemas';
import { readItem, readItems } from '../src/store/io';
import { addOwnItem } from '../src/store/threads';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const architecture = TYPES.find((t) => t.id === 'architecture')!;
const questions = TYPES.find((t) => t.id === 'questions')!;
const flows = listType('flows', { title: 'Flows', screen: 'flows', order: 4 });
const ui = listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 });

const diagram = {
  kind: 'system',
  groups: [],
  nodes: [
    { id: 'job', label: 'Daily job', status: 'new' },
    { id: 'db', label: 'Subscriptions table', status: 'unchanged' },
  ],
  edges: [{ id: 'reads', from: 'job', to: 'db' }],
};
const flow = { kind: 'user', steps: [{ n: 1, label: 'Open account settings' }, { n: 2, label: 'Turn reminders on' }] };
const mockup = { location: { app: 'web', route: '/account', files: [] }, kit: 'web', after: '<div class="p-4">Restock soon</div>' };
const drawn = (p: { item: Item; thread: Thread }, data: unknown) => ({ ...p, item: { ...p.item, data } });
const node: Anchor = { itemId: 'a1', kind: 'node', ref: 'job', label: 'Daily job' };

const project = () =>
  seedProject({
    pairs: [
      drawn(pair('a1', { type: 'architecture', title: 'System view' }), diagram),
      drawn(pair('a2', { type: 'architecture', title: 'Old view' }), { nodes: 'boxes' }),
      drawn(pair('f1', { type: 'flows', title: 'Turning reminders on' }), flow),
      drawn(pair('u1', { type: 'ui', title: 'Settings card' }), mockup),
      pair('q1'),
    ],
  });

describe('asking about one part of a drawing', () => {
  it('pins a new item to a box, linked to its diagram, with your message ready to send', async () => {
    const dir = await project();
    const { item, thread } = await addOwnItem(dir, { type: architecture, title: 'About the daily job', text: 'What time does it run?', anchor: node });
    expect(item).toMatchObject({ id: 'architecture-about-the-daily-job', type: 'architecture', anchor: node, links: ['a1'], createdBy: 'you' });
    expect(thread).toMatchObject({ status: 'idle', draft: { text: 'What time does it run?' }, messages: [] });
    expect((await readItem(dir, item.id)).anchor).toEqual(node);
    expect((await readItem(dir, 'a1')).data).toEqual(diagram);
  });

  it('pins to a flow step, and to a mockup element without checking the selector', async () => {
    const dir = await project();
    const step = await addOwnItem(dir, { type: flows, title: 'Where is the toggle?', text: 'On the account page?', anchor: { itemId: 'f1', kind: 'step', ref: '2', label: 'Step 2: Turn reminders on' } });
    expect(step.item).toMatchObject({ links: ['f1'], anchor: { kind: 'step', ref: '2' } });
    const element: Anchor = { itemId: 'u1', kind: 'element', ref: 'body > section:nth-of-type(3)', label: 'Not drawn yet', side: 'before' };
    const pin = await addOwnItem(dir, { type: ui, title: 'Bigger card?', text: 'Can it be wider?', anchor: element });
    expect(pin.item.anchor).toEqual(element);
  });

  it('refuses a pin that points nowhere, or at the wrong kind of thing, and writes nothing', async () => {
    const dir = await project();
    const ask = (type: typeof architecture, anchor: Anchor) => addOwnItem(dir, { type, title: 'A pin', text: 'Why?', anchor });
    await expect(ask(architecture, { ...node, itemId: 'a9' })).rejects.toThrow("There's no item a9 to ask about.");
    await expect(ask(questions, node)).rejects.toThrow('Pins start an item of the same plumbing type.');
    await expect(ask(architecture, { ...node, kind: 'step' })).rejects.toThrow("Architecture items can't take a step pin.");
    await expect(ask(questions, { itemId: 'q1', kind: 'node', ref: 'x', label: 'x' })).rejects.toThrow("Questions items can't take a node pin.");
    await expect(ask(architecture, { ...node, ref: 'ghost' })).rejects.toThrow('There\'s no box "ghost" in "System view".');
    await expect(ask(architecture, { ...node, itemId: 'a2' })).rejects.toThrow('"Old view" has no diagram to ask about.');
    await expect(ask(flows, { itemId: 'f1', kind: 'step', ref: '7', label: 'Step 7' })).rejects.toThrow('There\'s no step 7 in "Turning reminders on".');
    await expect(ask(flows, { itemId: 'f1', kind: 'step', ref: 'one', label: 'Step one' })).rejects.toThrow('There\'s no step one in "Turning reminders on".');
    expect((await readItems(dir)).values).toHaveLength(5);
  });
});
```

In `packages/service/test/visual.test.ts`:
- Change the core import to:
```ts
import { readItem, readThread, writeJsonAtomic } from '@dev-plumbing/core';
```
- Add this block at the end of the file:
```ts
describe('asking about one part of a drawing', () => {
  const box = { itemId: 'architecture-system', kind: 'node', ref: 'job', label: 'Daily reminder job' };

  it('starts a thread about one box, linked to its diagram, and sends it', async () => {
    const t = await setup();
    const r = await t.send('POST', `${P}/items`, { type: 'architecture', title: 'About the daily job', text: 'What time does it run?', anchor: box });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ threadId: 't-architecture-about-the-daily-job', sent: 1 });
    expect(await readItem(t.dir, 'architecture-about-the-daily-job')).toMatchObject({ anchor: box, links: ['architecture-system'], createdBy: 'you' });
    const thread = await readThread(t.dir, 't-architecture-about-the-daily-job');
    expect(thread.status).toBe('with_claude');
    expect(thread.messages[0]).toMatchObject({ author: 'you', text: 'What time does it run?' });
    const d = (await t.send('GET', `${P}/threads/t-architecture-about-the-daily-job`)).body;
    expect(d.anchorParent).toEqual({ itemId: 'architecture-system', threadId: 't-architecture-system', title: 'System view', typeId: 'architecture' });
    const rows = (await t.send('GET', `${P}/types/architecture`)).body.items;
    expect(rows.find((x: Json) => x.id === 'architecture-about-the-daily-job').anchor).toEqual(box);
  });

  it('starts a thread about a flow step', async () => {
    const t = await setup();
    const step = { itemId: 'flows-turn-on', kind: 'step', ref: '2', label: 'Step 2: Turn reminders on' };
    const r = await t.send('POST', `${P}/items`, { type: 'flows', title: 'Where is the toggle?', text: 'Is it on the account page?', anchor: step });
    expect(r.body.threadId).toBe('t-flows-where-is-the-toggle');
    expect(await readItem(t.dir, 'flows-where-is-the-toggle')).toMatchObject({ anchor: step, links: ['flows-turn-on'] });
  });

  it('refuses a pin of another type, an unknown box, a missing item or a misspelt key, and writes nothing', async () => {
    const t = await setup();
    const wrongType = await t.send('POST', `${P}/items`, { type: 'questions', title: 'Why a job?', text: 'Why not a queue?', anchor: box });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.error).toBe('Pins start an item of the same plumbing type.');
    const ghost = await t.send('POST', `${P}/items`, { type: 'architecture', title: 'Ghost', text: 'What is this?', anchor: { ...box, ref: 'ghost' } });
    expect(ghost.status).toBe(400);
    expect(ghost.body.error).toBe('There\'s no box "ghost" in "System view".');
    const missing = await t.send('POST', `${P}/items`, { type: 'architecture', title: 'Gone', text: 'Where did it go?', anchor: { ...box, itemId: 'architecture-gone' } });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe("There's no item architecture-gone to ask about.");
    const typo = await t.send('POST', `${P}/items`, { type: 'architecture', title: 'Typo', text: 'Oops.', anchr: box });
    expect(typo.status).toBe(400);
    expect((await t.send('GET', `${P}/types/architecture`)).body.items).toHaveLength(1);
    expect((await t.send('GET', `${P}/types/questions`)).body.items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/anchors.test.ts packages/service/test/visual.test.ts`
Expected: FAIL. `addOwnItem` ignores `anchor`, so the new item has no anchor or link and none of the refusals happen. The route drops the `anchor` key and accepts the misspelt one.

- [ ] **Step 3: Let `addOwnItem` take an anchor**

In `packages/core/src/store/threads.ts`:
- Replace the `../schemas` import with:
```ts
import { anchorKindFor, dataKindOf, parseData, type Anchor, type ClaudeMessage, type Item, type Message, type OpenOptions, type Option, type PlumbingType, type Thread } from '../schemas';
```
- Replace `addOwnItem` (with its comment) with:
```ts
/**
 * Why a pin can't go on this item, or null when it can. The item must exist and be of the pin's own type, the
 * type must take this kind of pin, and a box or step must be in the drawing. Element selectors aren't checked,
 * so a pin outlives a redrawn mockup (the screen marks it "Not in this version").
 */
function anchorProblem(anchor: Anchor, type: PlumbingType, items: Item[]): string | null {
  const parent = items.find((i) => i.id === anchor.itemId);
  if (!parent) return `There's no item ${anchor.itemId} to ask about.`;
  if (parent.type !== type.id) return 'Pins start an item of the same plumbing type.';
  if (anchor.kind !== anchorKindFor(dataKindOf(type))) return `${type.title} items can't take a ${anchor.kind} pin.`;
  if (anchor.kind === 'node') {
    const d = parseData('diagram', parent.data);
    if (!d.ok) return `"${parent.title}" has no diagram to ask about.`;
    if (!d.data.nodes.some((n) => n.id === anchor.ref)) return `There's no box "${anchor.ref}" in "${parent.title}".`;
  }
  if (anchor.kind === 'step') {
    const f = parseData('flows', parent.data);
    if (!f.ok) return `"${parent.title}" has no flow to ask about.`;
    if (!f.data.steps.some((s) => String(s.n) === anchor.ref)) return `There's no step ${anchor.ref} in "${parent.title}".`;
  }
  return null;
}

/**
 * + Question / + Concern / + Idea, and pins ("Ask about this box", + Pin, "Ask about this step"): a new item whose
 * thread starts with your message as a draft, ready to send. A pin links to the item it's about, which is left as it is.
 */
export async function addOwnItem(
  dir: string,
  o: { type: PlumbingType; title: string; text: string; fields?: Record<string, string>; anchor?: Anchor; now?: Date },
): Promise<{ item: Item; thread: Thread }> {
  const now = o.now ?? new Date();
  const title = o.title.trim();
  const text = o.text.trim();
  if (!title) throw new InputError('Give it a title.');
  if (!text) throw new InputError('Write your message first.');
  const problems = fieldProblems(o.fields, o.type);
  if (problems.length) throw new InputError(problems.join(' '));
  const { values } = await readItems(dir);
  const pin = o.anchor ? anchorProblem(o.anchor, o.type, values) : null;
  if (pin) throw new InputError(pin);
  const id = uniqueId(`${o.type.id}-${slugify(title)}`, new Set(values.map((i) => i.id)));
  const item: Item = {
    id,
    type: o.type.id,
    title,
    summary: title,
    ...(o.fields ? { fields: o.fields } : {}),
    ...(o.anchor ? { anchor: o.anchor, links: [o.anchor.itemId] } : {}),
    threadId: `t-${id}`,
    createdBy: 'you',
  };
  const thread: Thread = { id: `t-${id}`, itemId: id, status: 'idle', draft: { text, updatedAt: now.toISOString() }, messages: [] };
  await writeItem(dir, item);
  await writeThread(dir, thread);
  return { item, thread };
}
```

- [ ] **Step 4: Take the anchor in `POST …/items`**

In `packages/service/src/routes/threads.ts`:
- Add `anchorSchema` and `readItems` to the `@dev-plumbing/core` import list.
- Replace `itemBody` with:
```ts
// Strict, so a misspelt key can't turn a pin into a plain item.
const itemBody = z
  .object({
    type: z.string().min(1),
    title: z.string().min(1).max(200),
    text: z.string().min(1).max(20_000),
    fields: z.record(z.string().max(500)).optional(),
    anchor: anchorSchema.optional(),
  })
  .strict();
```
- Replace the `POST ${base}/items` route with:
```ts
  r.post(`${base}/items`, handle(async (c) => {
    const body = await parse(c, itemBody);
    const { cfg, ref } = await find(c);
    const { threadId, result } = await write(ref, async () => {
      // A pin starts an item of the anchored item's own type.
      if (body.anchor) {
        const anchored = (await readItems(ref.dir)).values.find((i) => i.id === body.anchor?.itemId);
        if (!anchored) throw new InputError(`There's no item ${body.anchor.itemId} to ask about.`);
        if (anchored.type !== body.type) throw new InputError('Pins start an item of the same plumbing type.');
      }
      const type = cfg.types.find((t) => t.id === body.type && t.enabled);
      if (!type) throw new InputError(`"${body.type}" isn't an enabled plumbing type.`);
      const { thread } = await addOwnItem(ref.dir, { type, title: body.title, text: body.text, fields: body.fields, anchor: body.anchor });
      return { threadId: thread.id, result: await submit(ref.dir, { scope: 'thread', threadId: thread.id, types: cfg.types }) };
    });
    return c.json({ ...respond(ref, result), threadId });
  }));
```

A refused pin throws inside `write`, so nothing is written and no `project` event is sent.

- [ ] **Step 5: Let the web client send an anchor**

In `packages/web/src/api/client.ts`:
- Add `Anchor` to the `@dev-plumbing/core/schemas` type import, after `AgentsConfig`.
- Replace `addItem` with:
```ts
  addItem: (repo: string, id: string, body: { type: string; title: string; text: string; fields?: Record<string, string>; anchor?: Anchor }) =>
    request<SubmitResponse & { threadId: string }>(`${proj(repo, id)}/items`, send('POST', body)),
```

No UI uses it yet. Tasks 9, 11, 13 and 14 add the forms that send an anchor.

- [ ] **Step 6: Run the tests**

Run:
```bash
pnpm vitest run packages/core/test/anchors.test.ts packages/core/test/submit.test.ts packages/service/test/visual.test.ts packages/service/test/threads.test.ts
pnpm typecheck && pnpm test
pnpm test:e2e
```
Expected: PASS. Plan 2's "adds your own question and sends it" still passes: a body without an anchor works as before, and an unknown type is still 400. The e2e "+ Question" test still sends only `type`, `title` and `text`, which the strict body accepts.

- [ ] **Step 7: Commit**

```bash
git add packages/core packages/service packages/web/src/api/client.ts
git commit -m "feat: start a thread about one box, element or step" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Mockup documents

The service turns a UI item's markup into a complete, locked-down HTML document:
- the app's own kit, read from the plan's clone;
- Tailwind's in-browser compiler, served from this machine;
- a small pin script.

The document's Content-Security-Policy lets only those two scripts run. The app shows the document in a sandboxed iframe (Task 13), so even markup that slips past the write checks can't run code, load anything or reach the API.

The same document also renders a mockup that a thread option proposes, before anyone accepts it. Task 16's "View proposed" needs that.

**Files:**
- Create:
  - `packages/core/src/kit.ts`
  - `packages/service/src/mockup.ts`
  - `packages/service/src/routes/mockups.ts`
- Modify:
  - `packages/core/src/index.ts` (export `./kit`)
  - `packages/core/src/schemas/views.ts` (`MockupKitInfo`)
  - `packages/service/package.json` and `pnpm-lock.yaml` (`@tailwindcss/browser`, through `pnpm add`)
  - `packages/service/src/app.ts` (mount the routes)
  - `packages/service/src/security.ts` (`frameHeaders` keeps a route's own CSP)
  - `packages/web/src/api/client.ts` (`mockupUrl`, `api.mockupKit`)
  - `packages/web/vite.config.ts` (the dev server proxies `/kit`)
- Test:
  - `packages/core/test/kit.test.ts`
  - `packages/service/test/mockups.test.ts`
  - `packages/service/test/static.test.ts` (one new anti-framing test)

**Interfaces:**
- Consumes:
  - From Task 1 (`@dev-plumbing/core`): `dataKindOf`, `parseData`.
  - From Task 6 (`service/src/checker.ts`): `cloneOf(ctx, ref): Promise<string | null>`. It returns the plan's clone with `~` expanded, or null when it isn't a folder any more.
  - From Plans 1 and 2:
    - core: `readItem`, `readThread`, `openOptions`, `StoreError`, `LoadedConfig`, `ProjectRef`, `RepoProfile` (`apps[].kitFiles`);
    - service: `locateProject`, `handle`, `frameHeaders`, `guard`.
- Produces:
  - Core `kit.ts`:
    - `buildKitCss(o: { clone: string; files: string[] }): Promise<{ css: string; warnings: string[] }>`
    - `MAX_KIT_BYTES` (1 MB)
  - Core `schemas/views.ts`: `export type MockupKitInfo = { app: string | null; files: string[]; warnings: string[] }`.
  - Service `mockup.ts`:
    - `mockupCsp(nonce)`
    - `PIN_SCRIPT`
    - `mockupDocument({ body, kitCss, nonce, title })`
    - `markupOf(data, side)`
    - `kitFor({ ctx, cfg, ref, data }): Promise<MockupKitInfo & { css: string }>`
  - Service routes:
    - `GET /api/projects/:repo/:id/items/:itemId/mockup/:side` (`side` is `after` | `before`) returns `text/html`: the mockup document, with its own CSP. It returns 404 `{ error }` when the item isn't a mockups item or has no markup for that side.
    - `GET /api/projects/:repo/:id/threads/:threadId/options/:optionId/mockup/:side` returns the same document, for the markup an open option proposes.
      - The proposal is the option's `change.items` entry whose `patch.data` is for a mockups item. The thread's own item is preferred, then the first other one.
      - The proposed data must pass `parseData('mockups', …)`. Its `kit` / `location.app` picks the kit.
      - It returns 404 `{ error }` for an unknown or closed option, an option with no mockup patch, or a side with no markup.
    - `GET /api/projects/:repo/:id/items/:itemId/mockup-kit` returns a `MockupKitInfo`.
    - `GET /kit/tailwind.js` returns the `@tailwindcss/browser` build as `text/javascript; charset=utf-8`, with `Cache-Control: public, max-age=86400`. It sits outside `/api/`.
  - Web `api/client.ts`:
    - `mockupUrl(repo, id, itemId, side): string`
    - `api.mockupKit(repo, id, itemId): Promise<MockupKitInfo>`
  - **The frame's side of the mockup messages**, implemented in `PIN_SCRIPT` exactly per the header's message table:
    - posts `size`, `picked`, `open-pin` and `missing-pins`;
    - takes `pin-mode` and `pins`, only from `parent`.

**Facts checked for this task** (`@tailwindcss/browser` 4.3.3):
- **The build:** `exports["."]`, `main` and `browser` all point at `dist/index.global.js`, a 282 KB IIFE.
- **CSP:** the build uses no `WebAssembly`, `eval`, `new Function`, `fetch` or workers, so `script-src 'nonce-…'` is enough. It needs no `'unsafe-eval'` and no `'wasm-unsafe-eval'`. It appends one `<style>` to `<head>`, which `style-src 'unsafe-inline'` allows.
- **Loading stylesheets:**
  - The build loads only its own virtual `tailwindcss`, `tailwindcss/theme`, `tailwindcss/preflight` and `tailwindcss/utilities`. Any other `@import` throws.
  - `@plugin` and `@config` throw ("does not support plugins or config files").
  - It adds `@import "tailwindcss"` itself only when the page's CSS contains no `@import` text at all. So the document writes that one line itself, first, ahead of the kit.

- [ ] **Step 1: Add the Tailwind compiler**

Run:
```bash
pnpm --filter @dev-plumbing/service add @tailwindcss/browser@^4
pnpm --filter @dev-plumbing/service exec node -e "console.log(require.resolve('@tailwindcss/browser'))"
```
Expected: `package.json` gains `"@tailwindcss/browser": "^4.x"` under `dependencies` (4.3.3 or a later 4.x), and the second command prints a path ending in `@tailwindcss/browser/dist/index.global.js`. If a later 4.x has moved the file, use whatever `require.resolve` prints. The route below resolves the package, not a hard-coded path.

- [ ] **Step 2: Write the failing kit tests**

`packages/core/test/kit.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildKitCss } from '../src/kit';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

/** A clone inside a temp folder, so a test can put files beside it, outside the clone. */
async function setup(files: Record<string, string>): Promise<{ root: string; clone: string }> {
  const root = await fs.realpath(tempDir('dp-kit-'));
  const clone = path.join(root, 'clone');
  await fs.mkdir(clone);
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(clone, rel)), { recursive: true });
    await fs.writeFile(path.join(clone, rel), text);
  }
  return { root, clone };
}

describe('building a design kit for mockups', () => {
  it("inlines relative imports and drops Tailwind's own", async () => {
    const { clone } = await setup({
      'apps/web/app/globals.css':
        '/* Acme kit */\n@import "tailwindcss";\n@import "./theme.css";\n/* @import "old.css"; */\n@layer components {\n  .card { @apply rounded-card p-4; }\n}\n',
      'apps/web/app/theme.css': '@theme {\n  --color-brand: #0f766e;\n}\n',
    });
    const r = await buildKitCss({ clone, files: ['apps/web/app/globals.css', 'apps/web/app/theme.css'] });
    expect(r.warnings).toEqual([]);
    expect(r.css).not.toContain('@import');
    expect(r.css).not.toContain('Acme kit');
    expect(r.css).toContain('/* apps/web/app/globals.css */');
    expect(r.css).toContain('/* apps/web/app/theme.css */\n@theme {\n  --color-brand: #0f766e;\n}');
    expect(r.css.indexOf('--color-brand')).toBeLessThan(r.css.indexOf('.card { @apply rounded-card p-4; }'));
    // theme.css is listed too, but it was already inlined.
    expect(r.css.split('--color-brand').length).toBe(2);
  });

  it('drops every form of the Tailwind import', async () => {
    const { clone } = await setup({
      'kit.css': `@import 'tailwindcss' source("../src");\n@import "tailwindcss/theme.css" layer(theme);\n@import url("tailwindcss/utilities.css") layer(utilities);\n.k { color: red; }\n`,
    });
    const r = await buildKitCss({ clone, files: ['kit.css'] });
    expect(r).toEqual({ css: '/* kit.css */\n.k { color: red; }\n', warnings: [] });
  });

  it('skips package and URL imports, with a warning', async () => {
    const { clone } = await setup({ 'kit.css': '@import "@acme/ui/theme.css";\n@import url("https://fonts.example.com/inter.css");\n.a { color: red; }\n' });
    const r = await buildKitCss({ clone, files: ['kit.css'] });
    expect(r.warnings).toEqual(['Kit: skipped @import "@acme/ui/theme.css".', 'Kit: skipped @import "https://fonts.example.com/inter.css".']);
    expect(r.css).toBe('/* kit.css */\n.a { color: red; }\n');
  });

  it('removes @plugin, @source, @config and @reference, with one warning each', async () => {
    const { clone } = await setup({
      'kit.css':
        '@plugin "@tailwindcss/typography";\n@plugin "daisyui" {\n  themes: light;\n}\n@source "../components";\n@config "./tailwind.config.js";\n@reference "./base.css";\n.b { margin: 0; }\n',
    });
    const r = await buildKitCss({ clone, files: ['kit.css'] });
    expect(r.warnings).toEqual([
      "Kit: @plugin lines skipped (they don't work in mockups).",
      "Kit: @source lines skipped (they don't work in mockups).",
      "Kit: @config lines skipped (they don't work in mockups).",
      "Kit: @reference lines skipped (they don't work in mockups).",
    ]);
    expect(r.css).toBe('/* kit.css */\n.b { margin: 0; }\n');
  });

  it('reads only .css files that exist', async () => {
    const { clone } = await setup({ 'tailwind.config.js': 'module.exports = {};\n', 'apps/web/app/globals.css': '.ok { color: black; }\n' });
    const r = await buildKitCss({ clone, files: ['tailwind.config.js', 'apps/web/app/missing.css', 'apps/web/app/globals.css'] });
    expect(r.warnings).toEqual(["Kit: tailwind.config.js isn't a .css file.", "Kit: apps/web/app/missing.css isn't in the clone."]);
    expect(r.css).toBe('/* apps/web/app/globals.css */\n.ok { color: black; }\n');
  });

  it('stops at 1 MB in total', async () => {
    const big = '.x { color: red; }\n'.repeat(40_000); // 760,000 bytes
    const { clone } = await setup({ 'a.css': big, 'b.css': big, 'c.css': '.c { color: blue; }\n' });
    const r = await buildKitCss({ clone, files: ['a.css', 'b.css', 'c.css'] });
    expect(r.warnings).toEqual(['Kit: skipped b.css, because kit files are limited to 1 MB in total.']);
    expect(r.css).toContain('/* a.css */');
    expect(r.css).not.toContain('/* b.css */');
    expect(r.css).toContain('/* c.css */\n.c { color: blue; }');
  });

  it('inlines imports at most 5 deep', async () => {
    const files: Record<string, string> = { 'k7.css': '.k7 { order: 7; }\n' };
    for (let i = 0; i < 7; i++) files[`k${i}.css`] = `@import "./k${i + 1}.css";\n.k${i} { order: ${i}; }\n`;
    const { clone } = await setup(files);
    const r = await buildKitCss({ clone, files: ['k0.css'] });
    expect(r.css).toContain('.k5 { order: 5; }');
    expect(r.css).not.toContain('.k6');
    expect(r.warnings).toEqual(['Kit: skipped @import "./k6.css", because imports nest more than 5 deep.']);
  });

  it('kit files outside the clone are never read', async () => {
    const { root, clone } = await setup({ 'apps/web/globals.css': '@import "../../../secret.css";\n.ok { color: black; }\n' });
    const secret = path.join(root, 'secret.css');
    await fs.writeFile(secret, '.secret { content: "SENTINEL"; }\n');
    await fs.symlink(secret, path.join(clone, 'apps', 'web', 'linked.css'));
    const r = await buildKitCss({ clone, files: ['apps/web/globals.css', '../secret.css', secret, 'apps/web/linked.css'] });
    expect(r.css).not.toContain('SENTINEL');
    expect(r.css).toBe('/* apps/web/globals.css */\n.ok { color: black; }\n');
    expect(r.warnings).toEqual([
      "Kit: ../../../secret.css isn't in the clone.",
      "Kit: ../secret.css isn't in the clone.",
      `Kit: ${secret} isn't in the clone.`,
      "Kit: apps/web/linked.css isn't in the clone.",
    ]);
  });

  it('says so when the clone is gone', async () => {
    const r = await buildKitCss({ clone: path.join(tempDir('dp-kit-'), 'gone'), files: ['apps/web/app/globals.css'] });
    expect(r).toEqual({ css: '', warnings: ["Kit: the plan's clone isn't on this Mac any more."] });
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/kit.test.ts`
Expected: FAIL, because `../src/kit` is missing.

- [ ] **Step 4: Write `buildKitCss`**

`packages/core/src/kit.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';

/** Kit files are read up to this many bytes in total. */
export const MAX_KIT_BYTES = 1024 * 1024;
const MAX_IMPORT_DEPTH = 5;
const COMMENT = /\/\*[\s\S]*?\*\//g;
// @import, and the Tailwind directives the in-browser compiler can't use. A @plugin may carry an options block.
const AT_RULE = /@(import|plugin|source|config|reference)\b([^;{]*)(?:;|\{[^}]*\})/g;

const isInside = (root: string, file: string) => {
  const rel = path.relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};
const isCss = (file: string) => path.extname(file).toLowerCase() === '.css';

/** The path an @import names: "x.css", 'x.css', url(x.css) or url("x.css"). */
function importPath(params: string): string | null {
  return /^\s*(?:url\(\s*)?(['"]?)([^'")\s]+)\1/.exec(params)?.[2] ?? null;
}

/**
 * An app's design kit, from the plan's clone, ready for the Tailwind compiler inside a mockup frame.
 * - Only .css files inside the clone are read, at most 1 MB in total. Symlinks are followed only when they stay inside.
 * - Relative @imports are inlined (each file once, at most 5 deep); a layer or media condition on them is dropped.
 * - The kit's own Tailwind import is removed (the frame brings Tailwind), and so are the directives the browser can't use.
 * Problems never stop the kit. They come back as warnings, which the mockup's toolbar shows.
 */
export async function buildKitCss(o: { clone: string; files: string[] }): Promise<{ css: string; warnings: string[] }> {
  const real = await fs.realpath(o.clone).catch(() => null);
  if (!real) return { css: '', warnings: ["Kit: the plan's clone isn't on this Mac any more."] };
  const root: string = real;
  const warnings = new Set<string>();
  const seen = new Set<string>();
  let total = 0;
  const skip = (warning: string) => {
    warnings.add(warning);
    return '';
  };

  /** One kit file with its relative imports inlined, or '' when it can't be used. `name` is how warnings refer to it. */
  async function load(file: string, name: string, depth: number): Promise<string> {
    if (!isInside(root, file)) return skip(`Kit: ${name} isn't in the clone.`);
    if (!isCss(file)) return skip(`Kit: ${name} isn't a .css file.`);
    const target = await fs.realpath(file).catch(() => null);
    const stat = target && isInside(root, target) && isCss(target) ? await fs.stat(target).catch(() => null) : null;
    if (!target || !stat || !stat.isFile()) return skip(`Kit: ${name} isn't in the clone.`);
    if (seen.has(target)) return '';
    seen.add(target);
    if (total + stat.size > MAX_KIT_BYTES) return skip(`Kit: skipped ${name}, because kit files are limited to 1 MB in total.`);
    total += stat.size;
    const raw = await fs.readFile(target, 'utf8').catch(() => null);
    if (raw === null) return skip(`Kit: ${name} couldn't be read.`);
    // Comments go first, so a commented-out @import is neither inlined nor warned about.
    const text = raw.replace(COMMENT, '');
    let css = '';
    let at = 0;
    for (const m of text.matchAll(AT_RULE)) {
      const start = m.index ?? 0;
      css += text.slice(at, start);
      at = start + m[0].length;
      css += await rewrite(m[1] ?? '', m[2] ?? '', path.dirname(target), depth);
    }
    css += text.slice(at);
    return `/* ${path.relative(root, target)} */\n${css.trim()}\n`;
  }

  /** What replaces one @import or directive: an inlined file, or nothing. */
  async function rewrite(directive: string, params: string, dir: string, depth: number): Promise<string> {
    if (directive !== 'import') return skip(`Kit: @${directive} lines skipped (they don't work in mockups).`);
    const spec = importPath(params);
    if (spec === 'tailwindcss' || spec?.startsWith('tailwindcss/')) return '';
    if (!spec || !/^\.\.?\//.test(spec)) return skip(`Kit: skipped @import "${spec ?? params.trim()}".`);
    if (depth >= MAX_IMPORT_DEPTH) return skip(`Kit: skipped @import "${spec}", because imports nest more than ${MAX_IMPORT_DEPTH} deep.`);
    return load(path.resolve(dir, spec), spec, depth + 1);
  }

  const parts: string[] = [];
  for (const file of o.files) parts.push(await load(path.resolve(root, file), file, 0));
  return { css: parts.filter(Boolean).join('\n'), warnings: [...warnings] };
}
```

In `packages/core/src/index.ts`, add after `export * from './docDiff';`:
```ts
export * from './kit';
```

- [ ] **Step 5: Run the kit tests**

Run: `pnpm vitest run packages/core/test/kit.test.ts && pnpm --filter @dev-plumbing/core typecheck`
Expected: PASS.

- [ ] **Step 6: Write the failing service tests**

`packages/service/test/mockups.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { mockupCsp, mockupDocument, PIN_SCRIPT } from '../src/mockup';
import { createRuntime } from '../src/runtime';
import { makeRepo } from '../../core/test/fixtures';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const P = '/api/projects/acme-app/restock-reminders';
const MARKUP = '<main class="p-6"><div class="bg-brand rounded-card p-4" data-testid="card">Restock soon</div></main>';
const SETTINGS = { location: { app: 'web', route: '/reminders', files: ['apps/web/app/reminders/page.tsx'] }, kit: 'web', after: MARKUP };
const BADGE = { location: { app: 'web', files: [] }, kit: 'web', after: '<span class="rounded-card bg-brand px-2">3 days left</span>', before: '<span>Restock</span>' };
const KIT = '@import "tailwindcss";\n@import "./theme.css";\n@plugin "@tailwindcss/typography";\n';
const THEME = '@theme {\n  --color-brand: #0f766e;\n  --radius-card: 14px;\n}\n';
const POLICY = (nonce: string) =>
  `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;
const nonceOf = (html: string) => /<script nonce="([^"]+)" src="\/kit\/tailwind.js"><\/script>/.exec(html)?.[1] ?? '';
const count = (text: string, part: string) => text.split(part).length - 1;

/** A repo with a Tailwind kit, its repo profile, and a plumbing project with two UI items and a question. */
async function setup(profile: Record<string, unknown> = {}) {
  const s = await makeContext();
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
  await fs.mkdir(path.join(repo, 'apps', 'web', 'app'), { recursive: true });
  await fs.writeFile(path.join(repo, 'apps', 'web', 'app', 'globals.css'), KIT);
  await fs.writeFile(path.join(repo, 'apps', 'web', 'app', 'theme.css'), THEME);
  await writeJsonAtomic(path.join(s.ctx.configDir, 'repos', 'acme-app.json'), {
    name: 'acme-app',
    match: ['github.com/acme/acme-app'],
    apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/app/globals.css'] }],
    ...profile,
  });
  const app = createApp(s.ctx, createRuntime());
  const send = async (method: string, route: string, body?: unknown): Promise<{ status: number; body: Json }> => {
    const res = await call(app, route, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  const items: Record<string, unknown[]> = {
    ui: [
      { key: 'settings', title: 'Restock settings card', summary: 'A card on the reminders page.', data: SETTINGS },
      { key: 'badge', title: 'Restock badge', summary: 'A badge on each item.', data: BADGE },
    ],
    questions: [{ key: 'days', title: 'How many days before?', summary: 'Lead time.' }],
  };
  const open = await send('POST', '/api/claude/open', { cwd: repo, plan: 'docs/specs/restock-reminders.md' });
  for (const type of open.body.importTypes as { id: string }[]) {
    const list = items[type.id];
    const r = await send('POST', '/api/claude/items', { repo: 'acme-app', project: 'restock-reminders', type: type.id, ...(list ? { items: list } : { noChanges: 'None.' }) });
    if (r.status !== 200) throw new Error(`${type.id}: ${r.body.error}`);
  }
  const get = (route: string) => call(app, `${P}${route}`);
  return { ...s, app, send, get, repo, dir: path.join(s.root, 'acme-app', 'restock-reminders') };
}

describe('mockup documents', () => {
  it('serve the markup with the kit, the Tailwind compiler and the pin script', async () => {
    const t = await setup();
    const res = await t.get('/items/ui-settings/mockup/after');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const html = await res.text();
    expect(html).toContain('<title>Restock settings card</title>');
    expect(html).toContain(MARKUP);
    expect(html).toContain('<style type="text/tailwindcss">@import "tailwindcss";');
    // The kit's relative import is inlined; its own Tailwind import and its @plugin are gone.
    expect(html).toContain('--color-brand: #0f766e;');
    expect(count(html, '@import')).toBe(1);
    expect(html).not.toContain('@plugin');
    const nonce = nonceOf(html);
    expect(nonce).not.toBe('');
    expect(html).toContain(`<script nonce="${nonce}">${PIN_SCRIPT}</script>`);
    // A fresh nonce for every document.
    expect(nonceOf(await (await t.get('/items/ui-settings/mockup/after')).text())).not.toBe(nonce);
  });

  it("the document's CSP blocks everything but our two scripts", async () => {
    const t = await setup();
    const res = await t.get('/items/ui-settings/mockup/after');
    const html = await res.text();
    const nonce = nonceOf(html);
    expect(res.headers.get('content-security-policy')).toBe(POLICY(nonce));
    expect(mockupCsp('abc')).toBe(POLICY('abc'));
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(count(html, '<script')).toBe(2);
    expect(count(html, `nonce="${nonce}"`)).toBe(2);
    // The markup goes in exactly as written: the policy, not a rewrite, is what keeps it harmless.
    expect(html).toContain(`<body>\n${MARKUP}\n<script nonce="${nonce}">`);
  });

  it('still serve markup that breaks a write rule, without meta tags', async () => {
    const t = await setup();
    const file = path.join(t.dir, 'items', 'ui-settings.json');
    const item = JSON.parse(await fs.readFile(file, 'utf8'));
    const risky = '<img src="https://example.com/x.png"><button onclick="alert(1)">x</button>';
    await fs.writeFile(file, JSON.stringify({ ...item, data: { ...item.data, after: `${risky}<meta http-equiv="refresh" content="0;url=https://example.com">` } }));
    const html = await (await t.get('/items/ui-settings/mockup/after')).text();
    expect(html).toContain(`<body>\n${risky}\n<script`);
    expect(html).not.toContain('http-equiv');
  });

  it("404 a missing side, an unknown side, and items that aren't UI items", async () => {
    const t = await setup();
    for (const route of ['/items/ui-settings/mockup/before', '/items/ui-settings/mockup/sideways', '/items/questions-days/mockup/after', '/items/ui-nope/mockup/after']) {
      const res = await t.get(route);
      expect(res.status, route).toBe(404);
      expect(((await res.json()) as { error: string }).error, route).toBeTruthy();
    }
    expect((await t.get('/items/ui-badge/mockup/before')).status).toBe(200);
    expect((await t.get('/items/questions-days/mockup-kit')).status).toBe(404);
  });

  it('report kit warnings beside the document, not in it', async () => {
    const t = await setup();
    const kit = await t.send('GET', `${P}/items/ui-settings/mockup-kit`);
    expect(kit.body).toEqual({ app: 'web', files: ['apps/web/app/globals.css'], warnings: ["Kit: @plugin lines skipped (they don't work in mockups)."] });
    expect(await (await t.get('/items/ui-settings/mockup/after')).text()).not.toContain('Kit:');
  });

  it('say why there is no kit, and still draw the mockup', async () => {
    const noApp = await setup({ apps: [] });
    expect((await noApp.send('GET', `${P}/items/ui-settings/mockup-kit`)).body).toEqual({ app: null, files: [], warnings: ['Kit: the repo profile has no app called web.'] });
    const noClone = await setup();
    await fs.rm(noClone.repo, { recursive: true, force: true });
    expect((await noClone.send('GET', `${P}/items/ui-settings/mockup-kit`)).body).toEqual({
      app: 'web',
      files: ['apps/web/app/globals.css'],
      warnings: ["Kit: the plan's clone isn't on this Mac any more."],
    });
    const res = await noClone.get('/items/ui-settings/mockup/after');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(MARKUP);
    expect(html).not.toContain('--color-brand');
  });

  it('render the mockup an open option proposes, before anyone accepts it', async () => {
    const t = await setup();
    const proposed = { ...SETTINGS, after: '<main class="p-6"><p>Proposed: 5 days left</p></main>' };
    await t.send('PUT', `${P}/threads/t-ui-settings/draft`, { text: 'Can the card say how many days are left?' });
    await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-ui-settings' });
    const reply = await t.send('POST', '/api/claude/reply', {
      repo: 'acme-app',
      project: 'restock-reminders',
      threadId: 't-ui-settings',
      text: 'Two ways to go.',
      options: [
        { id: 'days', label: 'Show the days left', change: { items: [{ itemId: 'ui-settings', patch: { data: proposed } }] } },
        { id: 'keep', label: 'Keep the card as it is' },
        { id: 'retitle', label: 'Rename the question', change: { items: [{ itemId: 'questions-days', patch: { title: 'Lead time?' } }] } },
      ],
    });
    expect(reply.status).toBe(200);

    const res = await t.get('/threads/t-ui-settings/options/days/mockup/after');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<p>Proposed: 5 days left</p>');
    expect(html).not.toContain('Restock soon');
    expect(html).toContain('--color-brand: #0f766e;');
    expect(res.headers.get('content-security-policy')).toBe(POLICY(nonceOf(html)));
    // The saved mockup is unchanged until the option is accepted.
    expect(await (await t.get('/items/ui-settings/mockup/after')).text()).toContain(MARKUP);

    for (const route of [
      '/threads/t-ui-settings/options/days/mockup/before',
      '/threads/t-ui-settings/options/keep/mockup/after',
      '/threads/t-ui-settings/options/retitle/mockup/after',
      '/threads/t-ui-settings/options/nope/mockup/after',
      '/threads/t-nope/options/days/mockup/after',
    ]) {
      const missing = await t.get(route);
      expect(missing.status, route).toBe(404);
      expect(((await missing.json()) as { error: string }).error, route).toBeTruthy();
    }
  });

  it("a mockup frame can load the Tailwind compiler, but can't call the API", async () => {
    const t = await setup();
    // The app's iframe navigation is same-origin, so it gets the document without a token.
    const page = await t.app.request(`http://localhost:4545${P}/items/ui-settings/mockup/after`, { headers: { 'sec-fetch-site': 'same-origin' } });
    expect(page.status).toBe(200);
    // Inside the sandbox the document has an opaque origin: its requests are cross-site, with Origin: null.
    const fromFrame = { headers: { 'sec-fetch-site': 'cross-site', origin: 'null' } };
    expect((await t.app.request(`http://localhost:4545${P}/items/ui-settings/mockup-kit`, fromFrame)).status).toBe(401);
    const js = await t.app.request('http://localhost:4545/kit/tailwind.js', fromFrame);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(js.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(js.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await js.text()).toContain('text/tailwindcss');
  });

  it('keep kit CSS inside its style tag, and the title as text', () => {
    const html = mockupDocument({ body: '<p>Hi</p>', kitCss: '.a{}</style><script>alert(1)</script>', nonce: 'n0', title: 'Cards & <lists>' });
    expect(html).toContain('<title>Cards &amp; &lt;lists&gt;</title>');
    expect(html).toContain('.a{}<\\/style><script>alert(1)</script></style>');
    expect(count(html, '</style>')).toBe(1);
  });

  it('use a pin script that parses and never closes its own tag', () => {
    expect(() => new Function(PIN_SCRIPT)).not.toThrow();
    expect(PIN_SCRIPT).not.toMatch(/<\/script/i);
  });
});
```

In `packages/service/test/static.test.ts`, add `import { frameHeaders } from '../src/security';` to the imports, and add this test inside `describe('anti-framing headers', …)`:
```ts
  it("leave a route's own Content-Security-Policy alone", async () => {
    const app = new Hono();
    app.use('*', frameHeaders());
    app.get('/own', (c) => c.text('x', 200, { 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'" }));
    app.get('/plain', (c) => c.text('y'));
    const own = await app.request('http://localhost/own');
    expect(own.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'self'");
    expect(own.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect((await app.request('http://localhost/plain')).headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
  });
```

- [ ] **Step 7: Run them to see them fail**

Run: `pnpm vitest run packages/service/test/mockups.test.ts packages/service/test/static.test.ts`
Expected: FAIL. `mockups.test.ts` fails because `../src/mockup` is missing. The new static test fails with `expected "frame-ancestors 'self'" to be "default-src 'none'; frame-ancestors 'self'"`.

- [ ] **Step 8: Add the kit info view type**

At the end of `packages/core/src/schemas/views.ts`, add:
```ts
/** What a mockup's toolbar says about its design kit: the app it came from, its files, and what was skipped. */
export type MockupKitInfo = { app: string | null; files: string[]; warnings: string[] };
```

- [ ] **Step 9: Write the mockup document and the pin script**

`packages/service/src/mockup.ts`:
```ts
import { buildKitCss, type LoadedConfig, type MockupKitInfo, type ProjectRef } from '@dev-plumbing/core';
import { cloneOf } from './checker';
import type { AppContext } from './context';

/** The mockup document's policy: our two nonce'd scripts, inline styles, data: images and fonts, and nothing else. */
export function mockupCsp(nonce: string): string {
  return `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;
}

/**
 * The frame's side of the mockup messages. The app's side is MockupFrame in the web app.
 * - `size`: the content's height, on load and whenever it changes.
 * - Pin mode: an outline follows the pointer, and a click posts `picked` with a selector and the element's text.
 * - Pins: numbered markers on the pinned elements. Clicking one posts `open-pin`. Every `pins` message is answered
 *   with `missing-pins`, the pins whose selector matches nothing in this version of the markup.
 * Marker colours are the Ink wash tones as fixed hex values, because the frame doesn't have the app's CSS variables.
 */
export const PIN_SCRIPT = String.raw`(() => {
  'use strict';
  const TONES = { seal: '#a5503b', slate: '#6d8196', moss: '#5f8a5b', mist: '#cbcbcb' };
  const post = (message) => parent.postMessage(Object.assign({ source: 'dp-mockup' }, message), '*');
  const root = document.documentElement;
  // Looked up once, by tag: markup like <form name="body"> or <img name="head"> clobbers document.body and document.head.
  const body = document.querySelector('body');
  const head = document.querySelector('head');

  // Our own elements sit outside <body>, so they never change the selectors of the mockup's elements.
  const layer = document.createElement('div');
  layer.setAttribute('data-dp-layer', '');
  layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;';
  root.appendChild(layer);
  const outline = document.createElement('div');
  outline.style.cssText = 'position:absolute;display:none;pointer-events:none;box-sizing:border-box;border:2px solid #6d8196;border-radius:4px;';
  layer.appendChild(outline);

  let pinMode = false;
  let markers = [];

  const ours = (node) => node instanceof Node && layer.contains(node);
  const pickable = (target) => {
    const el = target instanceof Element ? target : target && target.parentElement;
    if (!el || ours(el) || el === body || !body.contains(el)) return null;
    return el;
  };

  // body > main:nth-of-type(1) > div:nth-of-type(2): stable while the markup keeps its shape.
  const selectorFor = (el) => {
    const parts = [];
    for (let node = el; node && node !== body; node = node.parentElement) {
      let k = 1;
      for (let s = node.previousElementSibling; s; s = s.previousElementSibling) if (s.localName === node.localName) k++;
      parts.unshift(node.localName + ':nth-of-type(' + k + ')');
    }
    return ['body'].concat(parts).join(' > ');
  };
  const textOf = (el) => {
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 60) : el.localName;
  };

  const showOutline = (el) => {
    if (!el) {
      outline.style.display = 'none';
      return;
    }
    const r = el.getBoundingClientRect();
    outline.style.left = r.left + window.scrollX - 2 + 'px';
    outline.style.top = r.top + window.scrollY - 2 + 'px';
    outline.style.width = r.width + 4 + 'px';
    outline.style.height = r.height + 4 + 'px';
    outline.style.display = 'block';
  };
  const setPinMode = (on) => {
    pinMode = on;
    root.style.cursor = on ? 'crosshair' : '';
    if (!on) showOutline(null);
  };

  document.addEventListener('mouseover', (e) => {
    if (pinMode) showOutline(pickable(e.target));
  }, true);
  root.addEventListener('mouseleave', () => showOutline(null));
  document.addEventListener('click', (e) => {
    if (ours(e.target)) return;
    // A mockup is a picture: its links go nowhere.
    if (e.target instanceof Element && e.target.closest('a[href]')) e.preventDefault();
    if (!pinMode) return;
    e.preventDefault();
    e.stopPropagation();
    const el = pickable(e.target);
    if (el) post({ type: 'picked', selector: selectorFor(el), text: textOf(el) });
  }, true);
  document.addEventListener('submit', (e) => e.preventDefault(), true);

  const placeMarkers = () => {
    const maxLeft = root.clientWidth - 20;
    for (const m of markers) {
      const r = m.el.getBoundingClientRect();
      m.node.style.left = Math.max(0, Math.min(maxLeft, r.right + window.scrollX - 10)) + 'px';
      m.node.style.top = Math.max(0, r.top + window.scrollY - 10) + 'px';
    }
  };
  let queued = false;
  const schedulePlace = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      placeMarkers();
    });
  };

  const setPins = (pins) => {
    for (const m of markers) m.node.remove();
    markers = [];
    const missing = [];
    for (const pin of pins) {
      if (!pin || typeof pin.id !== 'string') continue;
      let el = null;
      try {
        el = typeof pin.selector === 'string' ? document.querySelector(pin.selector) : null;
      } catch (err) {
        el = null;
      }
      if (!el || !body.contains(el)) {
        missing.push(pin.id);
        continue;
      }
      const tone = Object.prototype.hasOwnProperty.call(TONES, pin.tone) ? TONES[pin.tone] : TONES.slate;
      const node = document.createElement('button');
      node.type = 'button';
      node.textContent = String(pin.n);
      node.title = 'Pin ' + pin.n;
      node.setAttribute('data-dp-pin', pin.id);
      node.style.cssText =
        'position:absolute;width:20px;height:20px;margin:0;padding:0;box-sizing:border-box;border:1.5px solid #fff;border-radius:50%;' +
        'background:' + tone + ';color:#fff;font:600 11px/17px -apple-system,system-ui,sans-serif;text-align:center;' +
        'cursor:pointer;pointer-events:auto;box-shadow:0 1px 2px rgba(0,0,0,.25);';
      node.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        post({ type: 'open-pin', id: pin.id });
      });
      layer.appendChild(node);
      markers.push({ el, node });
    }
    placeMarkers();
    post({ type: 'missing-pins', ids: missing });
  };

  let lastHeight = -1;
  const sendSize = () => {
    const height = Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().bottom + window.scrollY));
    if (height === lastHeight) return;
    lastHeight = height;
    post({ type: 'size', height: height });
  };
  const changed = () => {
    sendSize();
    schedulePlace();
  };
  new ResizeObserver(changed).observe(body);
  // The Tailwind compiler adds its styles a moment after the page loads, which can move pinned elements.
  new MutationObserver(schedulePlace).observe(head, { childList: true, subtree: true, characterData: true });
  window.addEventListener('load', changed);
  window.addEventListener('resize', changed);

  window.addEventListener('message', (e) => {
    const data = e.data;
    if (e.source !== parent || !data || data.source !== 'dp-app') return;
    if (data.type === 'pin-mode') setPinMode(Boolean(data.on));
    else if (data.type === 'pins' && Array.isArray(data.pins)) setPins(data.pins);
  });
  sendSize();
})();`;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A whole mockup document: the Tailwind compiler, the kit (compiled in the frame), the markup and the pin script.
 * The style starts with our own `@import "tailwindcss"`. buildKitCss removed the kit's, and the browser compiler only
 * adds one itself when the CSS has no @import at all.
 */
export function mockupDocument(o: { body: string; kitCss: string; nonce: string; title: string }): string {
  // Kit CSS is the repo's text, so it must not be able to close the style tag.
  const kit = o.kitCss.replace(/<\/style/gi, '<\\/style');
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(o.title)}</title>`,
    `<script nonce="${o.nonce}" src="/kit/tailwind.js"></script>`,
    `<style type="text/tailwindcss">@import "tailwindcss";\n${kit}</style>`,
    '</head><body>',
    o.body,
    `<script nonce="${o.nonce}">${PIN_SCRIPT}</script>`,
    '</body></html>',
  ].join('\n');
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * One side's markup, or null when there's none. It's read leniently: markup that breaks a write rule (edited by hand,
 * or written by an older version) is still served, because the sandbox and the CSP, not the write check, are what keep
 * it harmless. Meta tags are removed: a refresh tag would navigate the frame away, and no CSP directive stops that.
 */
export function markupOf(data: unknown, side: 'after' | 'before'): string | null {
  const value = isObject(data) ? data[side] : undefined;
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.replace(/<meta\b[^>]*>/gi, '');
}

/** The app names a UI item's data points at: its kit first, then its location's app. */
function appNames(data: unknown): string[] {
  if (!isObject(data)) return [];
  const location = isObject(data.location) ? data.location : {};
  return [data.kit, location.app].filter((n): n is string => typeof n === 'string' && n.length > 0);
}

/**
 * The design kit for a UI item's mockup (saved or proposed), built from the plan's clone.
 * A kit problem never throws: it becomes a warning.
 */
export async function kitFor(o: { ctx: AppContext; cfg: LoadedConfig; ref: ProjectRef; data: unknown }): Promise<MockupKitInfo & { css: string }> {
  const names = appNames(o.data);
  const apps = o.cfg.repos.find((p) => p.name === o.ref.repo)?.apps ?? [];
  const app = names.map((n) => apps.find((a) => a.name === n)).find((a) => a !== undefined);
  if (!app) {
    return { app: null, files: [], css: '', warnings: [names.length ? `Kit: the repo profile has no app called ${names[0]}.` : "Kit: this item doesn't name an app."] };
  }
  if (!app.kitFiles.length) return { app: app.name, files: [], css: '', warnings: [`Kit: the repo profile lists no kit files for ${app.name}.`] };
  const clone = await cloneOf(o.ctx, o.ref);
  if (!clone) return { app: app.name, files: app.kitFiles, css: '', warnings: ["Kit: the plan's clone isn't on this Mac any more."] };
  const kit = await buildKitCss({ clone, files: app.kitFiles });
  return { app: app.name, files: app.kitFiles, css: kit.css, warnings: kit.warnings };
}
```

- [ ] **Step 10: Write the routes, mount them, and let a route keep its own CSP**

`packages/service/src/routes/mockups.ts`:
```ts
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Hono, type Context, type Handler } from 'hono';
import { dataKindOf, openOptions, parseData, readItem, readThread, StoreError, type LoadedConfig, type MockupKitInfo, type ProjectRef } from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { locateProject } from '../locate';
import { kitFor, markupOf, mockupCsp, mockupDocument } from '../mockup';

const SIDES = ['after', 'before'] as const;
const sideOf = (c: Context) => SIDES.find((s) => s === c.req.param('side'));
const NO_SIDE = { error: 'A mockup side is after or before.' };

/** A mockup document with a fresh nonce and its own CSP. Kit warnings stay out of it: the app gets them from mockup-kit. */
function mockupResponse(c: Context, o: { body: string; kitCss: string; title: string }): Response {
  const nonce = randomBytes(16).toString('base64');
  return c.body(mockupDocument({ ...o, nonce }), 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': mockupCsp(nonce),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

export function mockupRoutes(ctx: AppContext): Hono {
  const r = new Hono();
  const find = (c: Context) => locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
  const kindOf = (cfg: LoadedConfig, typeId: string) => {
    const type = cfg.types.find((t) => t.id === typeId);
    return type ? dataKindOf(type) : null;
  };

  /** The item and its project, when the item's plumbing type draws mockups. */
  async function uiItem(c: Context) {
    const { cfg, ref } = await find(c);
    const item = await readItem(ref.dir, c.req.param('itemId')!);
    if (kindOf(cfg, item.type) !== 'mockups') throw new StoreError(`${item.title} isn't a UI item, so it has no mockup.`);
    return { cfg, ref, item };
  }

  /**
   * The mockup data an open option proposes: its change's patch for a mockups item, the thread's own item first.
   * Null when the option is unknown or closed, or proposes no mockup.
   */
  async function proposal(c: Context, cfg: LoadedConfig, ref: ProjectRef) {
    const thread = await readThread(ref.dir, c.req.param('threadId')!);
    const option = openOptions(thread)?.options.find((o) => o.id === c.req.param('optionId'));
    const entries = (option?.change?.items ?? []).filter((e) => e.patch.data !== undefined);
    const ordered = [...entries.filter((e) => e.itemId === thread.itemId), ...entries.filter((e) => e.itemId !== thread.itemId)];
    for (const e of ordered) {
      const item = await readItem(ref.dir, e.itemId).catch(() => null);
      if (item && kindOf(cfg, item.type) === 'mockups') return { item, data: e.patch.data };
    }
    return null;
  }

  r.get('/projects/:repo/:id/items/:itemId/mockup/:side', handle(async (c) => {
    const side = sideOf(c);
    if (!side) return c.json(NO_SIDE, 404);
    const { cfg, ref, item } = await uiItem(c);
    const body = markupOf(item.data, side);
    if (body === null) return c.json({ error: `${item.title} has no ${side === 'after' ? 'After' : 'Before'} mockup yet.` }, 404);
    const kit = await kitFor({ ctx, cfg, ref, data: item.data });
    return mockupResponse(c, { body, kitCss: kit.css, title: item.title });
  }));

  r.get('/projects/:repo/:id/items/:itemId/mockup-kit', handle(async (c) => {
    const { cfg, ref, item } = await uiItem(c);
    const { app, files, warnings } = await kitFor({ ctx, cfg, ref, data: item.data });
    return c.json({ app, files, warnings } satisfies MockupKitInfo);
  }));

  // What a thread option would draw, before it's accepted ("View proposed" in the thread view).
  r.get('/projects/:repo/:id/threads/:threadId/options/:optionId/mockup/:side', handle(async (c) => {
    const side = sideOf(c);
    if (!side) return c.json(NO_SIDE, 404);
    const { cfg, ref } = await find(c);
    const found = await proposal(c, cfg, ref);
    if (!found) return c.json({ error: "That option isn't open on this thread, or it doesn't propose a mockup." }, 404);
    // Proposals aren't accepted yet, so they're held to the write rules: only data that would be saved is drawn.
    const parsed = parseData('mockups', found.data);
    if (!parsed.ok) return c.json({ error: `The proposed mockup can't be drawn: ${parsed.problems.join(' ')}` }, 404);
    const body = markupOf(parsed.data, side);
    if (body === null) return c.json({ error: `The option proposes no ${side === 'after' ? 'After' : 'Before'} mockup.` }, 404);
    const kit = await kitFor({ ctx, cfg, ref, data: parsed.data });
    return mockupResponse(c, { body, kitCss: kit.css, title: `${found.item.title} (proposed)` });
  }));

  return r;
}

let tailwind: Promise<string> | null = null;
/** The @tailwindcss/browser build from the service's own node_modules, read once. Mockups never load it from a CDN. */
function tailwindScript(): Promise<string> {
  tailwind ??= fs.readFile(createRequire(import.meta.url).resolve('@tailwindcss/browser'), 'utf8').catch((e: unknown) => {
    tailwind = null;
    throw e;
  });
  return tailwind;
}

/** GET /kit/tailwind.js. It's outside /api/ because a sandboxed mockup frame has no origin, so it has no way past the guard. */
export const kitScript: Handler = async (c) => {
  const js = await tailwindScript().catch(() => null);
  if (js === null) return c.text("The Tailwind compiler for mockups isn't installed. Run pnpm install.", 503);
  return c.body(js, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
};
```

Don't name anything `require` at the top level of this file: the tsup banner already declares `const require` in the bundle.

`packages/service/src/app.ts` becomes:
```ts
import { Hono } from 'hono';
import type { AppContext } from './context';
import { claudeRoutes } from './routes/claude';
import { configRoutes } from './routes/config';
import { eventRoutes } from './routes/events';
import { kitScript, mockupRoutes } from './routes/mockups';
import { projectRoutes } from './routes/projects';
import { threadRoutes } from './routes/threads';
import { createRuntime, type Runtime } from './runtime';
import { frameHeaders, guard } from './security';
import { staticHandler } from './static';

export function createApp(ctx: AppContext, rt: Runtime = createRuntime()): Hono {
  const app = new Hono();
  app.use('*', frameHeaders());
  app.use('*', guard({ port: ctx.port, token: ctx.token, extraOrigins: ctx.extraOrigins }));
  app.get('/api/health', (c) => c.json({ ok: true, version: ctx.version, pid: process.pid }));
  app.route('/api', eventRoutes(rt));
  app.route('/api', projectRoutes(ctx, rt));
  app.route('/api', threadRoutes(ctx, rt));
  app.route('/api', mockupRoutes(ctx));
  app.route('/api', configRoutes(ctx, rt));
  app.route('/api/claude', claudeRoutes(ctx, rt));
  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
  app.get('/kit/tailwind.js', kitScript);
  app.get('*', staticHandler(ctx.webDist));
  return app;
}
```
If Tasks 4–7 changed `app.ts`, keep their lines. This task only adds the `mockupRoutes` and `kitScript` lines and their import.

In `packages/service/src/security.ts`, replace `frameHeaders` with:
```ts
/**
 * Anti-framing on every response, so another site can't frame the app and clickjack it.
 * 'self' rather than 'none', because mockup iframes are served from the same origin.
 * A route that sets its own policy keeps it: the mockup document's CSP includes frame-ancestors 'self' itself.
 */
export function frameHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header('X-Frame-Options', 'SAMEORIGIN');
    if (!c.res.headers.has('Content-Security-Policy')) c.header('Content-Security-Policy', "frame-ancestors 'self'");
  };
}
```

- [ ] **Step 11: Give the web app the URL and the kit route**

In `packages/web/src/api/client.ts`:
- Add `MockupKitInfo` to the type import from `@dev-plumbing/core/schemas`, after `ConfigProblem`.
- Below `const proj = …`, add:
```ts
/** One side of a UI item's mockup document. It's an iframe src, so it's a URL, not a request. */
export const mockupUrl = (repo: string, id: string, itemId: string, side: 'after' | 'before') => `${proj(repo, id)}/items/${enc(itemId)}/mockup/${side}`;
```
- Inside `api`, after `addItem`, add:
```ts
  mockupKit: (repo: string, id: string, itemId: string) => request<MockupKitInfo>(`${proj(repo, id)}/items/${enc(itemId)}/mockup-kit`),
```

`packages/web/vite.config.ts` becomes the following, so `pnpm dev`'s frames can load the compiler:
```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4545', changeOrigin: true },
      '/kit': { target: 'http://127.0.0.1:4545', changeOrigin: true },
    },
  },
});
```

- [ ] **Step 12: Run the tests**

Run:
```bash
pnpm vitest run packages/core/test/kit.test.ts packages/service
pnpm typecheck
pnpm test
pnpm test:e2e
```
Expected: PASS. The e2e run checks that nothing else changed: the built service still serves the app shell, and every other response still carries `frame-ancestors 'self'`.

- [ ] **Step 13: Commit**

```bash
git add packages/core/src/kit.ts packages/core/src/index.ts packages/core/src/schemas/views.ts packages/core/test/kit.test.ts packages/service packages/web/src/api/client.ts packages/web/vite.config.ts pnpm-lock.yaml
git commit -m "feat(service): mockups render in a locked-down frame with the app's own kit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Web groundwork: fixtures, demo drawings, failed imports, the screen frame

The visual screens need somewhere to land before they can draw. This task:
- gives the e2e fixture repo a Prisma schema, a Tailwind v4 kit and two files for diagram boxes to point at, and lets e2e tests write raw item data;
- gives the demo projects real drawings;
- makes a type whose importer didn't finish say "Didn't finish" instead of "No changes";
- sends non-list screens to a new `VisualScreen`, which for now lists their items, and adds the three pieces every screen shares: `AnchorForm`, `OtherItems` and `DataProblem`.

**Files:**
- Create:
  - `packages/web/src/pages/visual/VisualScreen.tsx`
  - `packages/web/src/pages/visual/AnchorForm.tsx`
  - `packages/web/src/pages/visual/OtherItems.tsx`
  - `packages/web/src/pages/visual/DataProblem.tsx`
  - `packages/web/src/pages/visual/testkit.tsx` (helpers for the visual screens' component tests)
  - `packages/web/src/pages/visual/visual.test.tsx`
  - `packages/web/e2e/visual.spec.ts`
- Modify:
  - `packages/core/src/demo.ts` (demo items gain drawings, plus two Phases items)
  - `packages/core/test/projects.test.ts`
  - `packages/web/src/router.tsx` (the type route takes `?item=`)
  - `packages/web/src/pages/TypeView.tsx`
  - `packages/web/src/pages/ProjectNav.tsx`
  - `packages/web/e2e/global-setup.ts` (fixture files and the repo profile)
  - `packages/web/e2e/claude.ts` (`TestItem` gains `body`, `codeRefs` and `data`; `rawItem`, `writeRawData`)
- Test:
  - `packages/core/test/projects.test.ts`
  - `packages/web/src/pages/visual/visual.test.tsx`
  - `packages/web/e2e/visual.spec.ts`

**Interfaces:**
- Consumes:
  - Task 1 (`@dev-plumbing/core/schemas`): `Anchor`, `dataKindOf`, `parseData`, `dataProblems`.
  - Task 4: `TypeEntry.importFailed`.
  - Task 6: `TypeItemRow` with `data`, `body`, `links`, `anchor`, `createdBy`, `checks` and `itemRefs`.
  - Task 7: `api.addItem(repo, id, { type, title, text, fields?, anchor? })`, which returns `SubmitResponse & { threadId }`.
- Produces:
  - `AnchorForm(p: { repo: string; project: string; type: string; anchor: Anchor; onDone: () => void })`: Title (starts as `About ${anchor.label}`), Your message, "Add and send" (secondary), Cancel; on success it navigates to the new thread. `data-testid="anchor-form"`.
  - `DataProblem(p: { title?: string; problems: string[]; data: unknown; threadId?: string; repo: string; project: string })`, `data-testid="data-problem"`. Without `title` it shows no item heading, and without `threadId` no thread link (the thread view uses it that way). It has no outer margin; callers space it.
  - `OtherItems(p: { rows: TypeItemRow[]; repo: string; project: string; title?: string })`: rows with `data-testid="other-item"`, inside a group with `data-testid="other-items"`. Renders nothing for no rows.
  - `VisualScreen.tsx`:
    - `export type ScreenProps = { repo: string; project: string; data: { type: TypeEntry; items: TypeItemRow[] }; item?: string }`, the props every screen takes;
    - `VisualScreen(p: ScreenProps)`: the type's title and item count, then `ScreenBody`, a switch on `type.screen` that Tasks 11–14 add their cases to. Its `default` lists the items with `OtherItems`.
  - The type route's search is `{ item?: string }`; `TypeView` passes it to `VisualScreen` as `item`.
  - `testkit.tsx`: `row(over?: Partial<TypeItemRow>): TypeItemRow` and `routerMock(navigate)`, for component tests that run without a router.
  - e2e:
    - `TestItem` gains `body?: string`, `codeRefs?: { path: string; symbol?: string }[]` and `data?: unknown`;
    - `rawItem(p, itemId)` and `writeRawData(p, itemId, data)`, where `p` is `{ repo, project }` (what `importProject` returns);
    - the fixture repo `acme-app` has `packages/db/prisma/schema.prisma`, `apps/web/app/globals.css`, `apps/web/app/reminders/page.tsx` and `apps/web/lib/reminders.ts`, and its repo profile has `schema` and `apps[0] = { name: 'web', path: 'apps/web', kitFiles: ['apps/web/app/globals.css'] }`.
  - Demo items with data: `acme/restock-reminders` `item-a1` (diagram), `item-db1` (table), `item-ui1` (mockup), `item-p1` and `item-p2` (phases); `beta/checkout-redesign` `item-f` (a `both` flow).

- [ ] **Step 1: Write the failing core test**

In `packages/core/test/projects.test.ts`, add `dataKindOf`, `dataProblems` and `parseData` to the `../src/schemas` import, and add this import:
```ts
import { readItems } from '../src/store/io';
```
Then add this test inside `describe('project store', …)`, after `it('does not overwrite a demo project that already exists', …)`:
```ts
  it('gives the demo drawings data that fits their screens', async () => {
    const types = await defaultTypes();
    const drawn: string[] = [];
    for (const [repo, id] of [['acme', 'restock-reminders'], ['acme', 'onboarding-emails'], ['beta', 'checkout-redesign']] as const) {
      const { values: items } = await readItems(path.join(root, repo, id));
      const ctx = { itemIds: new Set(items.map((i) => i.id)), mockupItemIds: new Set(items.filter((i) => i.type === 'ui').map((i) => i.id)) };
      for (const item of items.filter((i) => i.data !== undefined)) {
        const kind = dataKindOf(types.find((t) => t.id === item.type)!);
        expect(kind, item.id).not.toBeNull();
        expect(parseData(kind!, item.data).ok, item.id).toBe(true);
        expect(dataProblems(kind, item.data, ctx), item.id).toEqual([]);
        drawn.push(`${id}/${item.id}`);
      }
    }
    expect(drawn.sort()).toEqual([
      'checkout-redesign/item-f',
      'restock-reminders/item-a1',
      'restock-reminders/item-db1',
      'restock-reminders/item-p1',
      'restock-reminders/item-p2',
      'restock-reminders/item-ui1',
    ]);
  });
```

- [ ] **Step 2: Write the failing component tests**

The web's component tests run in jsdom with no providers (`packages/web/vitest.config.ts`, `src/components/components.test.tsx`). These components use TanStack Query and Router, so the tests wrap them in a `QueryClientProvider` and mock the router.

`packages/web/src/pages/visual/testkit.tsx`:
```tsx
// Helpers for the visual screens' component tests. Only test files import this.
import type { TypeItemRow } from '@dev-plumbing/core/schemas';
import type { ReactNode } from 'react';

/** A screen row with every field set, overridden as needed. */
export function row(over: Partial<TypeItemRow> = {}): TypeItemRow {
  return {
    id: 'architecture-system',
    threadId: 't-architecture-system',
    title: 'System view',
    summary: 'Jobs, notifications and tables.',
    status: 'idle',
    blocking: false,
    fields: {},
    messageCount: 0,
    latest: null,
    open: null,
    draft: null,
    decision: null,
    flagged: false,
    data: null,
    body: null,
    links: [],
    anchor: null,
    createdBy: 'import',
    checks: null,
    itemRefs: {},
    ...over,
  };
}

type LinkProps = { to: string; params?: Record<string, string>; search?: Record<string, string>; children?: ReactNode; [attr: string]: unknown };

/**
 * The component tests run without a router. Use as
 * `vi.mock('@tanstack/react-router', async () => (await import('./testkit')).routerMock(navigate))`:
 * links become plain anchors with their params filled in (and their string attributes kept), and `navigate` is your spy.
 */
export function routerMock(navigate: (to: unknown) => unknown) {
  return {
    useNavigate: () => navigate,
    Link: ({ to, params, search, children, ...rest }: LinkProps) => {
      const path = Object.entries(params ?? {}).reduce((url, [k, v]) => url.replace(`$${k}`, v), to);
      const query = search ? `?${new URLSearchParams(search)}` : '';
      const attrs = Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v === 'string'));
      return (
        <a href={`${path}${query}`} {...attrs}>
          {children}
        </a>
      );
    },
  };
}
```

`packages/web/src/pages/visual/visual.test.tsx`:
```tsx
import type { Anchor } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { AnchorForm } from './AnchorForm';
import { DataProblem } from './DataProblem';
import { OtherItems } from './OtherItems';
import { row } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('./testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockReset();
});

const withQueries = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('AnchorForm', () => {
  const anchor: Anchor = { itemId: 'architecture-system', kind: 'node', ref: 'job', label: 'Reminder job' };

  it('starts a thread about the box with your message, then opens it', async () => {
    const addItem = vi.spyOn(api, 'addItem').mockResolvedValue({ resolved: 0, sent: 1, skipped: [], listening: null, message: 'Saved.', threadId: 't-architecture-about-reminder-job' });
    withQueries(<AnchorForm repo="acme-app" project="restock" type="architecture" anchor={anchor} onDone={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveProperty('value', 'About Reminder job');
    expect(screen.getByRole('button', { name: 'Add and send' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Your message' }), { target: { value: 'Does it retry a failed send?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add and send' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/p/$repo/$project/th/$thread', params: { repo: 'acme-app', project: 'restock', thread: 't-architecture-about-reminder-job' } }));
    expect(addItem).toHaveBeenCalledWith('acme-app', 'restock', { type: 'architecture', title: 'About Reminder job', text: 'Does it retry a failed send?', anchor });
  });

  it('shows why the service refused, and Cancel closes it', async () => {
    vi.spyOn(api, 'addItem').mockRejectedValue(new Error('Pins start an item of the same plumbing type.'));
    const onDone = vi.fn();
    withQueries(<AnchorForm repo="acme-app" project="restock" type="ui" anchor={anchor} onDone={onDone} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Your message' }), { target: { value: 'Why?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add and send' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Pins start an item of the same plumbing type.');
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDone).toHaveBeenCalled();
  });
});

describe('DataProblem', () => {
  it('says the drawing could not be shown, lists why, and keeps the raw data and the thread', () => {
    render(<DataProblem title="Data flow" problems={['nodes: Expected array, received string']} data={{ kind: 'data_flow', nodes: 'oops' }} threadId="t-architecture-data-flow" repo="acme-app" project="restock" />);
    expect(screen.getByRole('heading', { name: 'Data flow' })).toBeTruthy();
    expect(screen.getByText("This item's drawing couldn't be shown")).toBeTruthy();
    expect(screen.getByText('nodes: Expected array, received string')).toBeTruthy();
    expect(screen.getByText('Raw data')).toBeTruthy();
    expect(screen.getByText(/"nodes": "oops"/).tagName).toBe('PRE');
    expect(screen.getByRole('link', { name: 'Open thread →' }).getAttribute('href')).toBe('/p/acme-app/restock/th/t-architecture-data-flow');
  });

  it('leaves out the title and thread link when not given, as in the thread view', () => {
    render(<DataProblem problems={[]} data={null} repo="acme-app" project="restock" />);
    expect(screen.getByText("This item's drawing couldn't be shown")).toBeTruthy();
    expect(screen.getByText('No data')).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('OtherItems', () => {
  it('lists each item with its status, summary and thread link', () => {
    render(<OtherItems rows={[row(), row({ id: 'architecture-later', threadId: 't-architecture-later', title: 'Later', summary: 'Not drawn yet.', status: 'your_turn' })]} repo="acme-app" project="restock" title="Other items" />);
    const items = screen.getAllByTestId('other-item');
    expect(items.map((a) => a.getAttribute('href'))).toEqual(['/p/acme-app/restock/th/t-architecture-system', '/p/acme-app/restock/th/t-architecture-later']);
    expect(items[1]!.textContent).toContain('Not drawn yet.');
    expect(screen.getByRole('img', { name: 'Your turn' })).toBeTruthy();
    expect(screen.getByText('Other items')).toBeTruthy();
  });

  it('renders nothing for no rows', () => {
    const { container } = render(<OtherItems rows={[]} repo="acme-app" project="restock" />);
    expect(container.innerHTML).toBe('');
  });
});
```

- [ ] **Step 3: Give the e2e fixture repo a schema, a kit and code files, and write the failing e2e test**

In `packages/web/e2e/global-setup.ts`, add this constant after the imports:
```ts
const FIXTURE_FILES: Record<string, string> = {
  'packages/db/prisma/schema.prisma': `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum SubscriptionStatus {
  ACTIVE
  PAUSED
  CANCELLED
}

/// Someone who buys from Acme.
model Customer {
  id            String         @id @default(cuid())
  email         String         @unique
  name          String?
  subscriptions Subscription[]
  orders        Order[]
  createdAt     DateTime       @default(now())
}

model Subscription {
  id         String             @id @default(cuid())
  customerId String
  customer   Customer           @relation(fields: [customerId], references: [id])
  product    String
  status     SubscriptionStatus @default(ACTIVE)
  nextShipAt DateTime
  createdAt  DateTime           @default(now())

  @@index([customerId])
}

model Order {
  id         String   @id @default(cuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id])
  total      Int
  placedAt   DateTime @default(now())
}
`,
  'apps/web/app/globals.css': `@import "tailwindcss";

@theme {
  --color-brand: #0f766e;
  --radius-card: 14px;
}

@layer components {
  .card-title {
    font-weight: 600;
    letter-spacing: -0.01em;
  }
}
`,
  'apps/web/app/reminders/page.tsx': 'export default function RemindersPage() {\n  return null;\n}\n',
  'apps/web/lib/reminders.ts': 'export function sendRestockReminders() {}\n',
};
```
Then replace:
```ts
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/acme-app.git'], { cwd: repo });
    fs.mkdirSync(path.join(tmp, '.dev-plumbing', 'repos'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.dev-plumbing', 'repos', 'acme-app.json'), JSON.stringify({ name: 'acme-app', match: ['github.com/acme/acme-app'] }));
```
with:
```ts
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/acme-app.git'], { cwd: repo });
    // What the visual screens check against: a Prisma schema, a Tailwind v4 kit, and two files for diagram boxes to point at.
    for (const [rel, text] of Object.entries(FIXTURE_FILES)) {
      fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
      fs.writeFileSync(path.join(repo, rel), text);
    }
    fs.mkdirSync(path.join(tmp, '.dev-plumbing', 'repos'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.dev-plumbing', 'repos', 'acme-app.json'),
      JSON.stringify({
        name: 'acme-app',
        match: ['github.com/acme/acme-app'],
        schema: { type: 'prisma', path: 'packages/db/prisma/schema.prisma' },
        apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/app/globals.css'] }],
      }),
    );
```
The fixture repo has no commits, and doesn't need any: `/api/claude/open` reads the working tree, and the checks read files from the clone.

In `packages/web/e2e/claude.ts`, change the env import to:
```ts
import { configPath, E2E_PORT, e2eTmp, readJson } from './env';
```
and replace the `TestItem` type with:
```ts
export type TestItem = {
  key: string;
  title: string;
  summary: string;
  body?: string;
  fields?: Record<string, string>;
  codeRefs?: { path: string; symbol?: string }[];
  links?: string[];
  data?: unknown;
  message?: { text: string; options?: { id: string; label: string; detail?: string; change?: unknown }[]; recommended?: string };
};

type ProjectId = { repo: string; project: string };
/** An item's file in the e2e projects folder. */
const itemFile = (p: ProjectId, itemId: string) => path.join(readJson('settings.json').projectsFolder, p.repo, p.project, 'items', `${itemId}.json`);
/** Reads an item file as it is on disk. */
export const rawItem = (p: ProjectId, itemId: string): Json => JSON.parse(fs.readFileSync(itemFile(p, itemId), 'utf8'));
/**
 * Replaces an item's data straight on disk, skipping the write checks, to stand in for a project made before
 * Plan 3 or data that doesn't fit. Only tests do this: the service is the only writer of the projects folder.
 * `undefined` removes the data.
 */
export function writeRawData(p: ProjectId, itemId: string, data: unknown) {
  fs.writeFileSync(itemFile(p, itemId), JSON.stringify({ ...rawItem(p, itemId), data }, null, 2));
}
```
`setup --projects-folder` stores the absolute path, and `importProject`'s projects land in `<projectsFolder>/acme-app/<project>/`.

`packages/web/e2e/visual.spec.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { asClaude, fixtureRepo, PLAN_TEXT } from './claude';

test("a plumbing type whose importer didn't finish says so, in the nav and on its screen", async ({ page }) => {
  const rel = 'docs/specs/visual-unfinished.md';
  fs.mkdirSync(path.join(fixtureRepo(), 'docs', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRepo(), rel), PLAN_TEXT('Visual unfinished'));
  const open = await asClaude('/open', { cwd: fixtureRepo(), plan: rel });
  // Every importer returns except Database's.
  for (const t of open.importTypes as { id: string }[]) {
    if (t.id === 'database') continue;
    await asClaude('/items', { repo: open.repo, project: open.project, type: t.id, cwd: fixtureRepo(), noChanges: 'Nothing for this type in the test plan.' });
  }
  // The window's next dp_wait ends the import (finishImport), marking the types that never wrote.
  await asClaude('/wait', { repo: open.repo, project: open.project, windowId: 'w-e2e-unfinished', timeoutSeconds: 0 });

  await page.goto(`/p/${open.repo}/${open.project}`);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await expect(nav.getByTestId('nav-type-database')).toContainText("Didn't finish");
  await expect(nav.getByTestId('nav-type-questions')).toContainText('No changes');
  await nav.getByTestId('nav-type-database').click();
  const failed = page.getByTestId('import-failed');
  await expect(failed.getByRole('heading')).toHaveText("Database: Didn't finish");
  await expect(failed).toContainText("The importer didn't finish for this plumbing type.");
  await expect(failed).not.toContainText("This plan doesn't change the database.");
  await expect(page.getByTestId('no-changes')).toHaveCount(0);
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run:
```bash
pnpm vitest run packages/core/test/projects.test.ts packages/web/src/pages/visual
pnpm test:e2e visual
```
Expected:
- `projects.test.ts`: FAIL in "gives the demo drawings data that fits their screens", because no demo item has data (`drawn` is `[]`).
- `visual.test.tsx`: FAIL, because `./AnchorForm`, `./DataProblem` and `./OtherItems` don't exist.
- `visual.spec.ts`: FAIL, because the nav says "No changes" for Database.

- [ ] **Step 5: Give the demo items drawings**

In `packages/core/src/demo.ts`, replace the `DemoThread` type with:
```ts
type DemoThread = { id: string; type: string; title: string; summary: string; status: ThreadStatus; blocking?: boolean; claude?: string; you?: string; draft?: string; data?: unknown };
```

After `const DAY = 24 * 60;`, add:
```ts
// The demo's drawings, in the shapes of core/src/schemas/data.ts. The demo has no clone, so its table says "Not checked".
const SYSTEM_VIEW = {
  kind: 'system',
  groups: [
    { id: 'web', label: 'Web app' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'data', label: 'Database' },
  ],
  nodes: [
    { id: 'settings', label: 'Reminder settings card', group: 'web', status: 'new' },
    { id: 'reorder', label: 'Reorder link', group: 'web', status: 'new' },
    { id: 'job', label: 'Daily reminder job', group: 'jobs', status: 'new' },
    { id: 'notify', label: 'Notification sender', group: 'jobs', status: 'changed' },
    { id: 'subscriptions', label: 'Subscription', group: 'data', status: 'changed' },
    { id: 'reminders', label: 'RestockReminder', group: 'data', status: 'new' },
    { id: 'orders', label: 'Order', group: 'data', status: 'unchanged' },
    { id: 'sms', label: 'SMS provider', status: 'external' },
    { id: 'email', label: 'Email provider', status: 'external' },
  ],
  edges: [
    { id: 'saves', from: 'settings', to: 'subscriptions', label: 'saves lead time' },
    { id: 'finds', from: 'job', to: 'subscriptions', label: 'finds due' },
    { id: 'logs', from: 'job', to: 'reminders', label: 'logs' },
    { id: 'hands-off', from: 'job', to: 'notify' },
    { id: 'texts', from: 'notify', to: 'sms', style: 'dashed' },
    { id: 'emails', from: 'notify', to: 'email', style: 'dashed' },
    { id: 'reorders', from: 'reorder', to: 'orders', label: 'creates' },
  ],
};

const REMINDER_TABLE = {
  model: 'RestockReminder',
  change: 'new',
  fields: [
    { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
    { name: 'subscriptionId', type: 'String', change: 'added' },
    { name: 'subscription', type: 'Subscription', change: 'added', note: 'The subscription it reminds about.' },
    { name: 'channel', type: 'String', change: 'added', note: 'sms or email' },
    { name: 'sentAt', type: 'DateTime', change: 'added', default: 'now()' },
  ],
  schemaDiff: [
    '+model RestockReminder {',
    '+  id             String       @id @default(cuid())',
    '+  subscriptionId String',
    '+  subscription   Subscription @relation(fields: [subscriptionId], references: [id])',
    '+  channel        String',
    '+  sentAt         DateTime     @default(now())',
    '+',
    '+  @@index([subscriptionId])',
    '+}',
  ].join('\n'),
  migration: [
    { kind: 'additive', text: 'Create the RestockReminder table and its index.' },
    { kind: 'rollback', text: 'Drop the RestockReminder table. Nothing else depends on it.' },
  ],
};

const ACCOUNT_TODAY = `<main class="mx-auto max-w-2xl p-6">
  <h1 class="text-2xl font-semibold">Account</h1>
  <section class="mt-6 rounded-xl border p-5">
    <h2 class="font-medium">Delivery address</h2>
    <p class="mt-1 text-sm opacity-70">12 Harbour Road, Acmeville</p>
  </section>
</main>`;

const ACCOUNT_WITH_REMINDERS = `<main class="mx-auto max-w-2xl p-6">
  <h1 class="text-2xl font-semibold">Account</h1>
  <section class="mt-6 rounded-xl border p-5">
    <h2 class="font-medium">Delivery address</h2>
    <p class="mt-1 text-sm opacity-70">12 Harbour Road, Acmeville</p>
  </section>
  <section class="mt-4 rounded-xl border p-5">
    <div class="flex items-center justify-between">
      <h2 class="font-medium">Restock reminders</h2>
      <span class="rounded-full border px-3 py-1 text-xs">On</span>
    </div>
    <p class="mt-1 text-sm opacity-70">We'll remind you before an item runs out.</p>
    <label class="mt-4 flex items-center gap-2 text-sm">Remind me
      <select class="rounded border px-2 py-1"><option>5 days</option><option>3 days</option></select>
      before
    </label>
  </section>
</main>`;

const SETTINGS_MOCKUP = {
  location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] },
  kit: 'web',
  after: ACCOUNT_WITH_REMINDERS,
  before: ACCOUNT_TODAY,
};

const PAYMENT_FLOW = {
  kind: 'both',
  lanes: [
    { id: 'shopper', label: 'Shopper', status: 'unchanged' },
    { id: 'checkout', label: 'Checkout page', status: 'changed' },
    { id: 'orders', label: 'Orders API', status: 'unchanged' },
    { id: 'payments', label: 'Payment provider', status: 'external' },
  ],
  steps: [
    { n: 1, from: 'shopper', to: 'checkout', label: 'Enters the delivery address' },
    { n: 2, from: 'checkout', to: 'orders', label: 'Saves the address', systemNote: 'The order is created as a draft.' },
    { n: 3, from: 'shopper', to: 'checkout', label: 'Enters card details' },
    { n: 4, from: 'checkout', to: 'payments', label: 'Confirms the payment' },
    { n: 5, from: 'orders', to: 'orders', label: 'Marks the order paid', systemNote: 'When the payment webhook arrives.' },
  ],
};
```

In the `restock-reminders` threads, replace the `db1`, `ui1` and `a1` entries with:
```ts
      { id: 'db1', type: 'database', title: 'One row per send, or per subscription?', summary: 'How often a RestockReminder row is written.', status: 'your_turn', claude: 'Per send keeps history for support. Per subscription is simpler.', data: REMINDER_TABLE },
      { id: 'ui1', type: 'ui', title: 'Reminder settings card', summary: 'A new card on the account settings page.', status: 'your_turn', claude: 'Should the toggle sit above or below the schedule?', draft: 'Put it above the schedule.', data: SETTINGS_MOCKUP },
```
and (the last entry):
```ts
      { id: 'a1', type: 'architecture', title: 'System view', summary: 'Daily job, notifications and the orders table.', status: 'idle', data: SYSTEM_VIEW },
      { id: 'p1', type: 'phases', title: 'Send the first reminders', summary: 'The daily job, its table and the sends.', status: 'idle', data: { order: 1, goal: 'Reminders go out by SMS and email before an item runs out.', doneWhen: ['The daily job runs in production', 'Support can see every reminder sent'], itemIds: ['item-a1', 'item-db1'] } },
      { id: 'p2', type: 'phases', title: 'Reorder in one tap', summary: 'The settings card and the reorder link.', status: 'idle', data: { order: 2, goal: 'Customers turn reminders on and reorder from them in one tap.', doneWhen: ['The settings card is live', 'Each reminder links straight to reorder'], itemIds: ['item-ui1'] } },
```
The Phases threads are idle, so the demo's counts and inbox don't change.

In the `checkout-redesign` threads, replace the `f` entry with:
```ts
      { id: 'f', type: 'flows', title: 'Payment step order', summary: 'Address before payment.', status: 'resolved', claude: 'Address first, then payment?', you: 'Yes.', data: PAYMENT_FLOW },
```

In `writeDemoProjects`, replace the item write with:
```ts
      await writeJsonAtomic(path.join(dir, 'items', `${itemId}.json`), {
        id: itemId, type: t.type, title: t.title, summary: t.summary, fields: t.blocking ? { blocking: 'true' } : {}, ...(t.data !== undefined ? { data: t.data } : {}), threadId, createdBy: 'import',
      });
```

Run: `pnpm vitest run packages/core/test/projects.test.ts`
Expected: PASS.

- [ ] **Step 6: Write `OtherItems`, `DataProblem` and `AnchorForm`**

`packages/web/src/pages/visual/OtherItems.tsx`:
```tsx
import type { TypeItemRow } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { Group, Row } from '../../components/GroupedList';
import { StatusMark } from '../../components/StatusMark';

/** Items a visual screen has nothing to draw for: no data yet, or a thread about a part that's gone. Each opens its thread. */
export function OtherItems({ rows, repo, project, title }: { rows: TypeItemRow[]; repo: string; project: string; title?: string }) {
  if (!rows.length) return null;
  return (
    <Group title={title} testId="other-items">
      {rows.map((r) => (
        <Link key={r.id} to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: r.threadId }} className="block hover:bg-selection" data-testid="other-item">
          <Row
            leading={<StatusMark status={r.status} />}
            title={
              <>
                {r.blocking && <span className="mr-1.5 text-[10.5px] font-semibold text-seal">BLOCKING</span>}
                {r.title}
              </>
            }
            meta={r.summary}
          />
        </Link>
      ))}
    </Group>
  );
}
```

`packages/web/src/pages/visual/DataProblem.tsx`:
```tsx
import { Link } from '@tanstack/react-router';

/**
 * An item whose data can't be drawn. The rest of the screen still draws; this says why, and keeps the raw data one click away.
 * Screens pass the item's title and thread; the thread view, which is already the item's thread, leaves both out.
 */
export function DataProblem({ title, problems, data, threadId, repo, project }: { title?: string; problems: string[]; data: unknown; threadId?: string; repo: string; project: string }) {
  const raw = data === null || data === undefined ? 'No data' : JSON.stringify(data, null, 2);
  return (
    <section aria-label={title} data-testid="data-problem" className="rounded-[10px] border-[0.5px] border-separator bg-cell px-4 py-3">
      {title && <h3 className="mb-1 text-[15px] font-semibold">{title}</h3>}
      <p className="text-[13px] text-ink-2">This item's drawing couldn't be shown</p>
      {problems.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-ink-3">
          {problems.map((p, i) => (
            <li key={i} className="break-words">
              {p}
            </li>
          ))}
        </ul>
      )}
      <details className="mt-2 text-[12px]">
        <summary className="cursor-pointer text-ink-2">Raw data</summary>
        <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11.5px] text-ink-2">{raw}</pre>
      </details>
      {threadId && (
        <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: threadId }} className="mt-2 inline-block text-[12px] text-slate">
          Open thread →
        </Link>
      )}
    </section>
  );
}
```

`packages/web/src/pages/visual/AnchorForm.tsx` (modelled on `AddItemForm`):
```tsx
import type { Anchor } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputClass';

/** Ask about one box, element or step: a new item of the same plumbing type, anchored to that part, sent to Claude straight away. */
export function AnchorForm({ repo, project, type, anchor, onDone }: { repo: string; project: string; type: string; anchor: Anchor; onDone: () => void }) {
  const [title, setTitle] = useState(`About ${anchor.label}`.slice(0, 200));
  const [text, setText] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const add = useMutation({
    mutationFn: () => api.addItem(repo, project, { type, title: title.trim(), text: text.trim(), anchor }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === repo && q.queryKey[2] === project });
      void navigate({ to: '/p/$repo/$project/th/$thread', params: { repo, project, thread: r.threadId } });
    },
  });
  return (
    <form
      aria-label={`Ask about ${anchor.label}`}
      data-testid="anchor-form"
      className="mt-3 rounded-[10px] border-[0.5px] border-separator bg-cell p-3"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <label className="block text-[12.5px] text-ink-2">
        Title
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mt-1`} />
      </label>
      <label className="mt-2 block text-[12.5px] text-ink-2">
        Your message
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className={`${inputClass} mt-1`} autoFocus />
      </label>
      {add.error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {(add.error as Error).message}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="submit" disabled={!title.trim() || !text.trim() || add.isPending}>
          Add and send
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
```

Run: `pnpm vitest run packages/web/src/pages/visual`
Expected: PASS (6 tests).

- [ ] **Step 7: Route non-list screens to `VisualScreen`, with `?item=`, a loading state and "Didn't finish"**

In `packages/web/src/router.tsx`, replace the `typeRoute` line with:
```tsx
/** `?item=` opens one item on a visual screen: a diagram, a table, a UI screen or a flow. */
type TypeSearch = { item?: string };
const typeRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 't/$type',
  component: TypeView,
  validateSearch: (search: Record<string, unknown>): TypeSearch => (typeof search.item === 'string' && search.item ? { item: search.item } : {}),
});
```
`item` is an optional key, so the existing links to the type route still compile without `search`. They are `ProjectNav` and `ThreadView` (`grep -rn 't/\$type' packages/web/src`). If `pnpm typecheck` says either needs `search`, the return type isn't optional: fix `TypeSearch`, don't add `search={{}}` to the links.

`packages/web/src/pages/visual/VisualScreen.tsx`:
```tsx
import type { TypeEntry, TypeItemRow } from '@dev-plumbing/core/schemas';
import { OtherItems } from './OtherItems';

/** What every visual screen gets: the plumbing type, its rows, and `?item=`, the item to open. */
export type ScreenProps = { repo: string; project: string; data: { type: TypeEntry; items: TypeItemRow[] }; item?: string };

/** Architecture, Database, UI changes and Flows. Each screen draws what it can; nothing an item holds is ever hidden. */
export function VisualScreen(p: ScreenProps) {
  const { type, items } = p.data;
  return (
    <div data-testid="visual-screen" data-screen={type.screen}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[20px] font-semibold">{type.title}</h2>
        <span className="text-[12px] text-ink-3">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </header>
      {items.length ? <ScreenBody {...p} /> : <p className="mt-6 text-[13px] text-ink-3">Nothing here yet.</p>}
    </div>
  );
}

function ScreenBody(p: ScreenProps) {
  switch (p.data.type.screen) {
    // Each screen adds its case here as it lands.
    default:
      // Screens that aren't drawn yet list their items as rows.
      return <OtherItems rows={p.data.items} repo={p.repo} project={p.project} />;
  }
}
```

Replace `packages/web/src/pages/TypeView.tsx` with:
```tsx
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearch } from '@tanstack/react-router';
import { api } from '../api/client';
import { ListScreen } from './ListScreen';
import { VisualScreen } from './visual/VisualScreen';

export function TypeView() {
  const { repo, project, type } = useParams({ from: '/p/$repo/$project/t/$type' });
  const { item } = useSearch({ from: '/p/$repo/$project/t/$type' });
  const { data, error } = useQuery({ queryKey: ['typeItems', repo, project, type], queryFn: () => api.typeItems(repo, project, type) });
  if (error) return <p className="text-[13px] text-seal">{(error as Error).message}</p>;
  if (!data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  if (data.type.noChanges && data.type.importFailed) {
    return (
      <div data-testid="import-failed" className="py-10 text-center">
        <h2 className="text-[20px] font-semibold">{data.type.title}: Didn't finish</h2>
        <p className="mt-2 text-[14px] text-ink-2">The importer didn't finish for this plumbing type.</p>
      </div>
    );
  }
  if (data.type.noChanges) {
    return (
      <div data-testid="no-changes" className="py-10 text-center">
        <h2 className="text-[20px] font-semibold">{data.type.title}: no changes</h2>
        <p className="mt-2 text-[14px] text-ink-2">{data.type.emptyMessage}</p>
        <p className="mt-1 text-[12.5px] text-ink-3">{data.type.noChanges.reason}</p>
      </div>
    );
  }
  if (data.type.screen === 'list') return <ListScreen key={type} repo={repo} project={project} data={data} />;
  return <VisualScreen key={type} repo={repo} project={project} data={data} item={item} />;
}
```
The generic `type-row` list is gone: `VisualScreen` lists the same rows through `OtherItems`. No e2e test used `type-row`.

In `packages/web/src/pages/ProjectNav.tsx`, replace:
```tsx
            {t.noChanges ? 'No changes' : <StatusMark status={typeStatus(t)} />}
```
with:
```tsx
            {t.noChanges ? (t.importFailed ? "Didn't finish" : 'No changes') : <StatusMark status={typeStatus(t)} />}
```

- [ ] **Step 8: Run the tests**

Run:
```bash
pnpm vitest run packages/core/test/projects.test.ts packages/web/src/pages/visual
pnpm typecheck
pnpm test
pnpm test:e2e visual
pnpm test:e2e
```
Expected: PASS everywhere.
- `project-home.spec.ts` still finds the demo's counts and inbox rows: the new Phases threads are idle.
- Architecture, Database, UI changes and Flows now open `VisualScreen`, which lists their items; Tasks 11–14 draw them.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/demo.ts packages/core/test/projects.test.ts packages/web
git commit -m "feat(web): groundwork for visual screens: fixtures, demo drawings, failed imports, anchor form" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: The diagram renderer

Diagrams are laid out by ELK and drawn as SVG in Ink wash. This task adds both halves:
- `layout.ts` turns `DiagramData` into an ELK graph and ELK's answer into absolute positions;
- `DiagramView` draws groups, boxes, file paths with their checks, lines, labels and thread bubbles, makes boxes selectable, and can add a legend line under the drawing.

No screen uses it yet; Task 11 does. elkjs is loaded with a dynamic `import()`, so screens without diagrams never download it.

**Files:**
- Create:
  - `packages/web/src/diagram/layout.ts`
  - `packages/web/src/diagram/DiagramView.tsx`
  - `packages/web/src/diagram/layout.test.ts`
  - `packages/web/src/diagram/DiagramView.test.tsx`
- Modify: `packages/web/package.json` and `pnpm-lock.yaml` (through `pnpm add`)
- Test: `packages/web/src/diagram/layout.test.ts`, `packages/web/src/diagram/DiagramView.test.tsx`

**Interfaces:**
- Consumes: Task 1's `DiagramData` and `NodeStatus` (`@dev-plumbing/core/schemas`).
- Produces:
  - `web/src/diagram/layout.ts`:
    - `type Direction = 'RIGHT' | 'DOWN'`
    - `type DiagramLayout = { width; height; groups: { id, label, x, y, w, h }[]; nodes: { id, label, status: NodeStatus, path: string | null, x, y, w, h }[]; edges: { id, points: { x, y }[], label: string | null, labelX, labelY, dashed: boolean }[] }`, all coordinates absolute; `labelX`/`labelY` are the label's centre.
    - `toElkGraph(data: DiagramData, direction: Direction): ElkNode` (pure)
    - `fromElk(graph: ElkNode, data: DiagramData): DiagramLayout` (pure; boxes in the data's order)
    - `layoutDiagram(data: DiagramData, direction: Direction): Promise<DiagramLayout>` (lazy-loads elkjs, caches one instance)
    - helpers `nodeWidth(label)` and `nodeHeight(hasPath)`
  - `web/src/diagram/DiagramView.tsx`:
    - `type Tone = 'seal' | 'slate' | 'moss' | 'mist'`
    - `DiagramView(p: { data: DiagramData; checks?: Record<string, boolean>; bubbles?: Record<string, { count: number; tone: Tone }>; selected?: string | null; onSelect?: (nodeId: string) => void; compact?: boolean; legend?: boolean })`
    - It renders `<figure data-testid="diagram">`, with one `<g data-testid="diagram-node" data-node={id} data-status={status}>` per box and one `<path data-testid="diagram-edge" data-edge={id}>` per line.
    - With `legend` (default false), a `<figcaption data-testid="diagram-legend">` under the drawing: one text-3 11 px line with an outlined, unfilled swatch per status, "new", "changed", "unchanged" and "outside the repo" (dashed).
    - With `onSelect` (and not `compact`), boxes have `role="button"`, `aria-label` `${label}, ${status}`, `aria-pressed` and Enter/Space.
    - Inside a box: `<rect data-part="box">`, and on the path line a `<tspan data-check="found">` (✓) or `data-check="missing"` ("not found").
    - Bubbles are `<g data-testid="diagram-bubble" data-count data-tone>`.

**elkjs, checked for this plan:**
- `npm view elkjs` shows 0.12.0 as latest. `^0.11` installs 0.11.1.
- The package has no `exports` field (`main` and `types` are `lib/main`), so deep imports work.
- `lib/elk.bundled.js` is a UMD bundle: `module.exports` is the ELK constructor, with `.default` pointing at itself. So `const { default: ELK } = await import('elkjs/lib/elk.bundled.js')` works in Node (Vitest) and in Vite's build, which puts it in its own chunk.
- `lib/elk.bundled.d.ts` default-exports the constructor. `lib/elk-api.d.ts` has `ELK`, `ElkNode`, `ElkExtendedEdge` (with `container?: string` from `ElkEdge`), `ElkEdgeSection` and `ElkLabel`.
- `new ELK()` with no `workerUrl` runs the layout in the same thread, with no Worker, in the browser, in jsdom and in Node.
- With `elk.hierarchyHandling: INCLUDE_CHILDREN`, edges declared at the root come back in the root's `edges`, each with a `container`: the group both ends sit in, or `root`. The edge's sections and labels are relative to that container; children are relative to their parent.

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @dev-plumbing/web add elkjs@^0.11`
Expected: `packages/web/package.json` lists `"elkjs": "^0.11.1"` under `dependencies`, and `ls packages/web/node_modules/elkjs/lib/elk.bundled.js packages/web/node_modules/elkjs/lib/elk-api.d.ts` lists both files.

- [ ] **Step 2: Write the failing tests**

`packages/web/src/diagram/layout.test.ts` (Node environment: elkjs's bundled build runs there without a Worker):
```ts
// @vitest-environment node
import type { DiagramData } from '@dev-plumbing/core/schemas';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { describe, expect, it } from 'vitest';
import { fromElk, layoutDiagram, toElkGraph, type DiagramLayout } from './layout';

const restock: DiagramData = {
  kind: 'system',
  groups: [
    { id: 'web', label: 'Web app' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'empty', label: 'Nothing here' },
  ],
  nodes: [
    { id: 'page', label: 'Settings page', group: 'web', status: 'new', codeRef: { path: 'apps/web/app/reminders/page.tsx' } },
    { id: 'api', label: 'Account API', group: 'web', status: 'changed' },
    { id: 'job', label: 'Daily reminder job', group: 'jobs', status: 'new' },
    { id: 'sms', label: 'SMS provider with a very long name that will not fit', status: 'external' },
  ],
  edges: [
    { id: 'saves', from: 'page', to: 'api', label: 'saves' },
    { id: 'sends', from: 'job', to: 'sms', style: 'dashed' },
    { id: 'ghost', from: 'job', to: 'nowhere' },
  ],
};

/** 20 boxes in four groups, each linked to the next and to the one four places on. */
function twentyBoxes(): DiagramData {
  const groups = ['web', 'api', 'jobs', 'data'].map((id) => ({ id, label: `The ${id} part` }));
  const statuses = ['new', 'changed', 'unchanged', 'external'] as const;
  const nodes = Array.from({ length: 20 }, (_, i) => ({
    id: `box-${i}`,
    label: `Box number ${i}${i % 3 ? '' : ' with a longer label'}`,
    status: statuses[i % 4]!,
    ...(i < 16 ? { group: groups[i % 4]!.id } : {}),
    ...(i % 2 ? { codeRef: { path: `apps/web/lib/box-${i}.ts` } } : {}),
  }));
  const edges = nodes.flatMap((n, i) => [
    ...(i > 0 ? [{ id: `next-${i}`, from: `box-${i - 1}`, to: n.id, label: 'calls' }] : []),
    ...(i > 3 ? [{ id: `skip-${i}`, from: `box-${i - 4}`, to: n.id }] : []),
  ]);
  return { kind: 'system', groups, nodes, edges };
}

const overlaps = (a: DiagramLayout['nodes'][number], b: DiagramLayout['nodes'][number]) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('toElkGraph', () => {
  it('puts boxes in their groups and every line at the root, with sizes', () => {
    const g = toElkGraph(restock, 'RIGHT');
    expect(g.layoutOptions).toMatchObject({
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '24',
      'elk.layered.spacing.nodeNodeBetweenLayers': '48',
    });
    // The empty group is left out; the box without a group sits at the root.
    expect(g.children?.map((c) => c.id)).toEqual(['g:web', 'g:jobs', 'n:sms']);
    const web = g.children![0]!;
    expect(web.layoutOptions).toEqual({ 'elk.padding': '[top=28,left=16,bottom=16,right=16]' });
    expect(web.children?.map((c) => [c.id, c.width, c.height])).toEqual([
      ['n:page', 132, 50],
      ['n:api', 132, 36],
    ]);
    expect(g.children![1]!.children?.map((c) => [c.id, c.width])).toEqual([['n:job', 18 * 7 + 32]]);
    expect(g.children![2]!.width).toBe(240);
    // A line to a box that isn't there is dropped.
    expect(g.edges?.map((e) => [e.id, e.sources, e.targets])).toEqual([
      ['e:saves', ['n:page'], ['n:api']],
      ['e:sends', ['n:job'], ['n:sms']],
    ]);
    expect(g.edges![0]!.labels).toEqual([{ text: 'saves', width: 5 * 6.5 + 8, height: 14 }]);
    expect(g.edges![1]!.labels).toBeUndefined();
    expect(toElkGraph(restock, 'DOWN').layoutOptions?.['elk.direction']).toBe('DOWN');
  });
});

describe('fromElk', () => {
  it('gives absolute positions for boxes in groups, and for lines inside a group', () => {
    const graph: ElkNode = {
      id: 'root',
      width: 640,
      height: 200,
      children: [
        { id: 'g:web', x: 10, y: 20, width: 330, height: 110, children: [
          { id: 'n:api', x: 182, y: 30, width: 132, height: 36 },
          { id: 'n:page', x: 16, y: 28, width: 132, height: 50 },
        ] },
        { id: 'g:jobs', x: 380, y: 20, width: 170, height: 90, children: [{ id: 'n:job', x: 16, y: 28, width: 132, height: 36 }] },
        { id: 'n:sms', x: 400, y: 140, width: 240, height: 36 },
      ],
      edges: [
        {
          id: 'e:saves',
          sources: ['n:page'],
          targets: ['n:api'],
          container: 'g:web',
          sections: [{ id: 's1', startPoint: { x: 148, y: 50 }, endPoint: { x: 182, y: 50 } }],
          labels: [{ text: 'saves', x: 150, y: 34, width: 40, height: 14 }],
        },
        {
          id: 'e:sends',
          sources: ['n:job'],
          targets: ['n:sms'],
          container: 'root',
          sections: [{ id: 's2', startPoint: { x: 462, y: 84 }, bendPoints: [{ x: 462, y: 112 }, { x: 520, y: 112 }], endPoint: { x: 520, y: 140 } }],
        },
      ],
    };
    const layout = fromElk(graph, restock);
    expect(layout.width).toBe(640);
    expect(layout.groups).toEqual([
      { id: 'web', label: 'Web app', x: 10, y: 20, w: 330, h: 110 },
      { id: 'jobs', label: 'Jobs', x: 380, y: 20, w: 170, h: 90 },
    ]);
    expect(layout.nodes.map((n) => [n.id, n.x, n.y, n.status, n.path])).toEqual([
      ['page', 26, 48, 'new', 'apps/web/app/reminders/page.tsx'],
      ['api', 192, 50, 'changed', null],
      ['job', 396, 48, 'new', null],
      ['sms', 400, 140, 'external', null],
    ]);
    const [saves, sends] = layout.edges;
    expect(saves).toEqual({ id: 'saves', points: [{ x: 158, y: 70 }, { x: 192, y: 70 }], label: 'saves', labelX: 180, labelY: 61, dashed: false });
    expect(sends!.points).toEqual([{ x: 462, y: 84 }, { x: 462, y: 112 }, { x: 520, y: 112 }, { x: 520, y: 140 }]);
    // No label from ELK: the middle of the longest segment.
    expect([sends!.labelX, sends!.labelY, sends!.label, sends!.dashed]).toEqual([491, 112, null, true]);
  });
});

describe('layoutDiagram', () => {
  it('lays out 20 boxes inside the drawing, with no two overlapping', async () => {
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const layout = await layoutDiagram(twentyBoxes(), direction);
      expect(layout.nodes).toHaveLength(20);
      expect(layout.groups).toHaveLength(4);
      for (const n of layout.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.x + n.w).toBeLessThanOrEqual(layout.width);
        expect(n.y + n.h).toBeLessThanOrEqual(layout.height);
      }
      for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
          const [a, b] = [layout.nodes[i]!, layout.nodes[j]!];
          expect(overlaps(a, b), `${a.id} overlaps ${b.id} (${direction})`).toBe(false);
        }
      }
      expect(layout.edges).toHaveLength(35);
      for (const e of layout.edges) expect(e.points.length, e.id).toBeGreaterThanOrEqual(2);
      // Boxes sit inside their group.
      const web = layout.groups.find((g) => g.id === 'web')!;
      const box0 = layout.nodes.find((n) => n.id === 'box-0')!;
      expect(box0.x).toBeGreaterThanOrEqual(web.x);
      expect(box0.y).toBeGreaterThanOrEqual(web.y + 28);
      expect(box0.x + box0.w).toBeLessThanOrEqual(web.x + web.w);
    }
  }, 30_000);

  it('runs top to bottom when asked, for narrow screens', async () => {
    const down = await layoutDiagram(twentyBoxes(), 'DOWN');
    const right = await layoutDiagram(twentyBoxes(), 'RIGHT');
    expect(down.height / down.width).toBeGreaterThan(right.height / right.width);
  }, 30_000);
});
```

`packages/web/src/diagram/DiagramView.test.tsx` (jsdom, like the other component tests; elkjs runs there too):
```tsx
import type { DiagramData } from '@dev-plumbing/core/schemas';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagramView } from './DiagramView';

afterEach(cleanup);

const data: DiagramData = {
  kind: 'system',
  groups: [{ id: 'jobs', label: 'Jobs' }],
  nodes: [
    { id: 'job', label: 'Reminder job', group: 'jobs', status: 'new', codeRef: { path: 'apps/web/lib/reminders.ts', symbol: 'sendRestockReminders' } },
    { id: 'page', label: 'Settings page', status: 'changed', codeRef: { path: 'apps/web/app/missing/page.tsx' } },
    { id: 'sms', label: 'SMS provider', status: 'external' },
  ],
  edges: [
    { id: 'saves', from: 'page', to: 'job', label: 'schedules' },
    { id: 'sends', from: 'job', to: 'sms', style: 'dashed' },
  ],
};

describe('DiagramView', () => {
  it('draws a box per node with its status, lines, checks and bubbles once laid out', async () => {
    const onSelect = vi.fn();
    render(<DiagramView data={data} checks={{ job: true, page: false }} bubbles={{ job: { count: 2, tone: 'seal' } }} onSelect={onSelect} selected="page" />);
    expect(screen.getByText('Drawing…')).toBeTruthy();
    const nodes = await screen.findAllByTestId('diagram-node', {}, { timeout: 10_000 });
    expect(nodes.map((n) => [n.getAttribute('data-node'), n.getAttribute('data-status')])).toEqual([
      ['job', 'new'],
      ['page', 'changed'],
      ['sms', 'external'],
    ]);
    expect(screen.getAllByTestId('diagram-edge').map((e) => e.getAttribute('data-edge'))).toEqual(['saves', 'sends']);
    expect(screen.getAllByTestId('diagram-edge')[1]!.style.strokeDasharray).toBe('4 3');
    expect(screen.getByText('schedules')).toBeTruthy();
    expect(screen.getByText('Jobs')).toBeTruthy();
    expect(nodes[0]!.querySelector('[data-check=found]')?.textContent).toBe(' ✓');
    expect(nodes[1]!.querySelector('[data-check=missing]')?.textContent).toBe(' not found');
    expect(nodes[2]!.querySelector('[data-check]')).toBeNull();
    expect(screen.getByTestId('diagram-bubble').getAttribute('data-count')).toBe('2');
    // §16 colours, through the theme's variables, so dark mode needs nothing extra.
    const stroke = (n: Element) => (n.querySelector('[data-part=box]') as SVGElement).style;
    expect(stroke(nodes[0]!).stroke).toBe('var(--moss)');
    expect(stroke(nodes[1]!).stroke).toBe('var(--slate)');
    expect(stroke(nodes[1]!).strokeWidth).toBe('2');
    expect(stroke(nodes[2]!).strokeDasharray).toBe('4 3');

    fireEvent.click(screen.getByRole('button', { name: 'Reminder job, new' }));
    expect(onSelect).toHaveBeenLastCalledWith('job');
    fireEvent.keyDown(screen.getByRole('button', { name: 'SMS provider, external' }), { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith('sms');
    expect(screen.getByRole('button', { name: 'Settings page, changed' }).getAttribute('aria-pressed')).toBe('true');
    // No legend unless asked for.
    expect(screen.queryByTestId('diagram-legend')).toBeNull();
  }, 15_000);

  it('compact drawings have no buttons, bubbles or selection', async () => {
    render(<DiagramView data={data} bubbles={{ job: { count: 1, tone: 'slate' } }} onSelect={() => {}} selected="job" compact />);
    await screen.findAllByTestId('diagram-node', {}, { timeout: 10_000 });
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.queryByTestId('diagram-bubble')).toBeNull();
    expect((document.querySelector('svg') as SVGElement).style.maxHeight).toBe('360px');
  }, 15_000);

  it('with legend, names each box status under the drawing, with outlined swatches', async () => {
    render(<DiagramView data={data} legend />);
    const legend = await screen.findByTestId('diagram-legend', {}, { timeout: 10_000 });
    expect(legend.textContent).toBe('newchangedunchangedoutside the repo');
    const swatch = (status: string) => (legend.querySelector(`[data-status=${status}] [data-part=swatch]`) as SVGElement).style;
    expect(swatch('new').stroke).toBe('var(--moss)');
    expect(swatch('changed').stroke).toBe('var(--amber)');
    expect(swatch('unchanged').stroke).toBe('var(--mist)');
    expect(swatch('external').strokeDasharray).toBe('3 2');
    for (const s of ['new', 'changed', 'unchanged', 'external']) expect(swatch(s).fill).toBe('none');
  }, 15_000);
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm vitest run packages/web/src/diagram`
Expected: FAIL, because `./layout` and `./DiagramView` don't exist.

- [ ] **Step 4: Write the layout**

`packages/web/src/diagram/layout.ts`:
```ts
import type { DiagramData, NodeStatus } from '@dev-plumbing/core/schemas';
import type { ELK, ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';

export type Direction = 'RIGHT' | 'DOWN';
export type DiagramLayout = {
  width: number;
  height: number;
  groups: { id: string; label: string; x: number; y: number; w: number; h: number }[];
  nodes: { id: string; label: string; status: NodeStatus; path: string | null; x: number; y: number; w: number; h: number }[];
  edges: { id: string; points: { x: number; y: number }[]; label: string | null; labelX: number; labelY: number; dashed: boolean }[];
};

// ELK needs ids unique across the whole graph, and a group may share an id with a box, so each kind gets a prefix.
const GROUP = 'g:';
const NODE = 'n:';
const EDGE = 'e:';

const ROOT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.spacing.nodeNode': '24',
  'elk.layered.spacing.nodeNodeBetweenLayers': '48',
};
/** Room for the group's label above its boxes. */
const GROUP_OPTIONS = { 'elk.padding': '[top=28,left=16,bottom=16,right=16]' };

/** Wide enough for the label at 12.5 px, between 132 and 240. */
export const nodeWidth = (label: string) => Math.min(240, Math.max(132, label.length * 7 + 32));
/** Boxes with a file reference have a second line for its path. */
export const nodeHeight = (hasPath: boolean) => (hasPath ? 50 : 36);

/** The ELK graph for a diagram: groups hold their boxes, every line sits at the root so ELK routes it across groups. Pure. */
export function toElkGraph(data: DiagramData, direction: Direction): ElkNode {
  const box = (n: DiagramData['nodes'][number]): ElkNode => ({ id: NODE + n.id, width: nodeWidth(n.label), height: nodeHeight(Boolean(n.codeRef)) });
  const groupIds = new Set(data.groups.map((g) => g.id));
  const groups: ElkNode[] = data.groups
    .map((g) => ({ id: GROUP + g.id, layoutOptions: GROUP_OPTIONS, children: data.nodes.filter((n) => n.group === g.id).map(box) }))
    .filter((g) => g.children.length > 0);
  const loose = data.nodes.filter((n) => !n.group || !groupIds.has(n.group)).map(box);
  const nodeIds = new Set(data.nodes.map((n) => n.id));
  const edges: ElkExtendedEdge[] = data.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({
      id: EDGE + e.id,
      sources: [NODE + e.from],
      targets: [NODE + e.to],
      ...(e.label ? { labels: [{ text: e.label, width: e.label.length * 6.5 + 8, height: 14 }] } : {}),
    }));
  return { id: 'root', layoutOptions: { ...ROOT_OPTIONS, 'elk.direction': direction }, children: [...groups, ...loose], edges };
}

type Point = { x: number; y: number };

/** The middle of the longest segment: where a label sits when ELK didn't place one. */
function middleOfLongest(points: Point[]): Point {
  let best = { length: -1, at: points[0] ?? { x: 0, y: 0 } };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > best.length) best = { length, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
  return best.at;
}

/**
 * Turns ELK's answer into absolute positions. ELK gives each child relative to its parent, and each line
 * relative to its `container` (the group both ends sit in, or the root). Boxes come back in the data's order. Pure.
 */
export function fromElk(graph: ElkNode, data: DiagramData): DiagramLayout {
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const order = new Map(data.nodes.map((n, i) => [n.id, i]));
  const groupLabel = new Map(data.groups.map((g) => [g.id, g.label]));
  const edgeById = new Map(data.edges.map((e) => [e.id, e]));
  const origin = new Map<string, Point>([[graph.id, { x: 0, y: 0 }]]);
  const out: DiagramLayout = { width: graph.width ?? 0, height: graph.height ?? 0, groups: [], nodes: [], edges: [] };
  const elkEdges: { edge: ElkExtendedEdge; declaredIn: string }[] = (graph.edges ?? []).map((edge) => ({ edge, declaredIn: graph.id }));

  const walk = (parent: ElkNode, at: Point) => {
    for (const child of parent.children ?? []) {
      const x = at.x + (child.x ?? 0);
      const y = at.y + (child.y ?? 0);
      const w = child.width ?? 0;
      const h = child.height ?? 0;
      origin.set(child.id, { x, y });
      for (const edge of child.edges ?? []) elkEdges.push({ edge, declaredIn: child.id });
      if (child.id.startsWith(GROUP)) {
        const id = child.id.slice(GROUP.length);
        out.groups.push({ id, label: groupLabel.get(id) ?? id, x, y, w, h });
        walk(child, { x, y });
      } else if (child.id.startsWith(NODE)) {
        const n = nodeById.get(child.id.slice(NODE.length));
        if (n) out.nodes.push({ id: n.id, label: n.label, status: n.status, path: n.codeRef?.path ?? null, x, y, w, h });
      }
    }
  };
  walk(graph, { x: 0, y: 0 });
  out.nodes.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  for (const { edge, declaredIn } of elkEdges) {
    const source = edgeById.get(edge.id.slice(EDGE.length));
    if (!source) continue;
    const o = origin.get(edge.container ?? declaredIn) ?? { x: 0, y: 0 };
    const points = (edge.sections ?? [])
      .flatMap((s) => [s.startPoint, ...(s.bendPoints ?? []), s.endPoint])
      .map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
    const label = edge.labels?.[0];
    const placed = label && label.x !== undefined && label.y !== undefined;
    const at = placed ? { x: o.x + label.x! + (label.width ?? 0) / 2, y: o.y + label.y! + (label.height ?? 0) / 2 } : middleOfLongest(points);
    out.edges.push({ id: source.id, points, label: source.label ?? null, labelX: at.x, labelY: at.y, dashed: source.style === 'dashed' });
  }
  return out;
}

let elk: Promise<ELK> | null = null;

/** Lays a diagram out with ELK. elkjs is loaded on first use, so screens without diagrams never download it. */
export async function layoutDiagram(data: DiagramData, direction: Direction): Promise<DiagramLayout> {
  elk ??= import('elkjs/lib/elk.bundled.js').then(
    ({ default: Elk }) => new Elk(),
    (e: unknown) => {
      elk = null;
      throw e;
    },
  );
  const graph = (await (await elk).layout(toElkGraph(data, direction))) as ElkNode;
  return fromElk(graph, data);
}
```

Run: `pnpm vitest run packages/web/src/diagram/layout.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write `DiagramView`**

`packages/web/src/diagram/DiagramView.tsx`:
```tsx
import type { DiagramData, NodeStatus } from '@dev-plumbing/core/schemas';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { layoutDiagram, type DiagramLayout, type Direction } from './layout';

/** StatusMark colours: your turn, draft or with Claude, resolved, parked. */
export type Tone = 'seal' | 'slate' | 'moss' | 'mist';

// §16: box new / changed / unchanged / external is moss / amber / mist / dashed mist.
const STROKE: Record<NodeStatus, string> = { new: 'var(--moss)', changed: 'var(--amber)', unchanged: 'var(--mist)', external: 'var(--mist)' };
/** Narrower than this, diagrams run top to bottom. */
const NARROW = 640;

/** Cuts text to fit a box: labels keep their start, file paths keep their end. */
function fit(text: string, chars: number, keep: 'start' | 'end'): string {
  if (text.length <= chars) return text;
  const room = Math.max(1, chars - 1);
  return keep === 'start' ? `${text.slice(0, room)}…` : `…${text.slice(-room)}`;
}

const pathOf = (points: { x: number; y: number }[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

type Drawn = { key: string; layout: DiagramLayout } | { key: string; error: string };

/**
 * One diagram, laid out with ELK and drawn as SVG in Ink wash. It fits its container's width (and pinch-zooms on phones),
 * and runs top to bottom when the container is narrow.
 */
export function DiagramView({
  data,
  checks,
  bubbles,
  selected,
  onSelect,
  compact,
  legend = false,
}: {
  data: DiagramData;
  checks?: Record<string, boolean>;
  bubbles?: Record<string, { count: number; tone: Tone }>;
  selected?: string | null;
  onSelect?: (nodeId: string) => void;
  compact?: boolean;
  legend?: boolean;
}) {
  const box = useRef<HTMLElement>(null);
  const [direction, setDirection] = useState<Direction>('RIGHT');
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const arrow = `dp-arrow-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  // Data is compared by value, so a refetch that changes nothing doesn't lay out again.
  const key = `${direction}|${JSON.stringify(data)}`;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const pick = (width: number) => setDirection(width > 0 && width < NARROW ? 'DOWN' : 'RIGHT');
    pick(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => pick(entries[0]?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    layoutDiagram(data, direction).then(
      (layout) => live && setDrawn({ key, layout }),
      (e: unknown) => live && setDrawn({ key, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
    // `key` stands for data and direction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const interactive = !compact && Boolean(onSelect);
  const keyDown = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(id);
    }
  };
  const labelSize = compact ? 11.5 : 12.5;

  return (
    <figure ref={box} data-testid="diagram" className="m-0 min-w-0">
      {drawn && 'error' in drawn ? (
        <div className="py-4 text-[13px] text-ink-2">
          This item's drawing couldn't be shown
          <p className="mt-1 text-[12px] text-ink-3">{drawn.error}</p>
        </div>
      ) : !drawn ? (
        <p className="py-6 text-[12.5px] text-ink-3">Drawing…</p>
      ) : (
        <svg
          viewBox={`0 0 ${drawn.layout.width} ${drawn.layout.height}`}
          width="100%"
          className="block"
          style={{ touchAction: 'pinch-zoom', maxHeight: compact ? 360 : undefined }}
        >
          <defs>
            <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,1 L9,5 L0,9 z" style={{ fill: 'var(--text-3)' }} />
            </marker>
          </defs>
          {drawn.layout.groups.map((g) => (
            <g key={g.id} data-testid="diagram-group" data-group={g.id}>
              <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={10} style={{ fill: 'none', stroke: 'var(--separator)', strokeWidth: 1 }} />
              <text x={g.x + 12} y={g.y + 18} style={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>
                {fit(g.label, Math.floor((g.w - 24) / 6.2), 'start')}
              </text>
            </g>
          ))}
          {drawn.layout.edges
            .filter((e) => e.points.length >= 2)
            .map((e) => (
              <g key={e.id}>
                <path
                  data-testid="diagram-edge"
                  data-edge={e.id}
                  d={pathOf(e.points)}
                  markerEnd={`url(#${arrow})`}
                  style={{ fill: 'none', stroke: 'var(--text-3)', strokeWidth: 1, strokeDasharray: e.dashed ? '4 3' : undefined }}
                />
                {e.label && (
                  <text
                    x={e.labelX}
                    y={e.labelY + 3.5}
                    textAnchor="middle"
                    style={{ fill: 'var(--text-3)', fontSize: 10.5, paintOrder: 'stroke', stroke: 'var(--canvas)', strokeWidth: 3, strokeLinejoin: 'round' }}
                  >
                    {e.label}
                  </text>
                )}
              </g>
            ))}
          {drawn.layout.nodes.map((n) => {
            const isSelected = interactive && selected === n.id;
            const check = checks?.[n.id];
            const bubble = compact ? undefined : bubbles?.[n.id];
            const pathRoom = Math.floor((n.w - 16) / 6.3) - (check === false ? 10 : check === true ? 2 : 0);
            return (
              <g
                key={n.id}
                data-testid="diagram-node"
                data-node={n.id}
                data-status={n.status}
                {...(interactive
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `${n.label}, ${n.status}`,
                      'aria-pressed': isSelected,
                      onClick: () => onSelect?.(n.id),
                      onKeyDown: (e: KeyboardEvent<SVGGElement>) => keyDown(e, n.id),
                      style: { cursor: 'pointer' },
                    }
                  : {})}
              >
                <title>{n.path ? `${n.label}\n${n.path}` : n.label}</title>
                <rect
                  data-part="box"
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  rx={6}
                  style={{
                    fill: 'var(--cell)',
                    stroke: isSelected ? 'var(--slate)' : STROKE[n.status],
                    strokeWidth: isSelected ? 2 : 1,
                    strokeDasharray: n.status === 'external' ? '4 3' : undefined,
                  }}
                />
                <text x={n.x + n.w / 2} y={n.path ? n.y + 21 : n.y + n.h / 2 + 4.5} textAnchor="middle" style={{ fill: 'var(--text)', fontSize: labelSize, fontWeight: 500 }}>
                  {fit(n.label, Math.floor((n.w - 16) / (labelSize * 0.56)), 'start')}
                </text>
                {n.path && (
                  <text x={n.x + n.w / 2} y={n.y + 38} textAnchor="middle" className="font-mono" style={{ fill: 'var(--text-3)', fontSize: 10.5 }}>
                    {fit(n.path, pathRoom, 'end')}
                    {check === true && (
                      <tspan data-check="found" style={{ fill: 'var(--moss)' }}>
                        {' ✓'}
                      </tspan>
                    )}
                    {check === false && (
                      <tspan data-check="missing" className="font-sans" style={{ fill: 'var(--amber)' }}>
                        {' not found'}
                      </tspan>
                    )}
                  </text>
                )}
                {bubble && (
                  <g data-testid="diagram-bubble" data-count={bubble.count} data-tone={bubble.tone}>
                    <circle cx={n.x + n.w} cy={n.y} r={8} style={{ fill: `var(--${bubble.tone})`, stroke: `var(--${bubble.tone})` }} />
                    <text
                      x={n.x + n.w}
                      y={n.y + 3.5}
                      textAnchor="middle"
                      style={{ fill: bubble.tone === 'mist' ? 'var(--text)' : 'var(--canvas)', fontSize: 10, fontWeight: 600 }}
                    >
                      {bubble.count > 9 ? '9+' : bubble.count}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {legend && drawn && 'layout' in drawn && <Legend />}
    </figure>
  );
}

const LEGEND: { status: NodeStatus; text: string }[] = [
  { status: 'new', text: 'new' },
  { status: 'changed', text: 'changed' },
  { status: 'unchanged', text: 'unchanged' },
  { status: 'external', text: 'outside the repo' },
];

/** One small line under a full-size diagram: a swatch per box status, outlined like the boxes, never filled. */
function Legend() {
  return (
    <figcaption data-testid="diagram-legend" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
      {LEGEND.map((l) => (
        <span key={l.status} data-status={l.status} className="inline-flex items-center gap-1">
          <svg width="14" height="10" aria-hidden="true" className="shrink-0">
            <rect
              data-part="swatch"
              x={0.5}
              y={0.5}
              width={13}
              height={9}
              rx={2}
              style={{ fill: 'none', stroke: STROKE[l.status], strokeWidth: 1, strokeDasharray: l.status === 'external' ? '3 2' : undefined }}
            />
          </svg>
          {l.text}
        </span>
      ))}
    </figcaption>
  );
}
```

Notes on the drawing:
- Colours are set through `style` with the theme's variables (`var(--moss)` and so on), so dark mode needs no extra code. A bubble is a small filled marker, which §16 allows; boxes stay unfilled (`var(--cell)`), and so do the legend's swatches (`fill: none`).
- The legend is off by default. Task 11 turns it on under each full-size diagram; compact drawings (the thread view) leave it off.
- `<figure>` has default 40 px side margins in browsers; `m-0` removes them, so phones don't scroll sideways.
- The ResizeObserver guard is for jsdom, which has none. There the width reads 0 and the layout stays `RIGHT`.

- [ ] **Step 6: Run the tests**

Run:
```bash
pnpm vitest run packages/web/src/diagram
pnpm typecheck
pnpm test
pnpm test:e2e
```
Expected: PASS. No screen draws diagrams yet, so the e2e run only checks that nothing else broke. `pnpm build` (inside `test:e2e`) emits `elk.bundled-<hash>.js` as its own chunk; Vite's warning that the chunk is over 500 kB is expected, since it only loads on diagram screens.

- [ ] **Step 7: Commit**

```bash
git add packages/web pnpm-lock.yaml
git commit -m "feat(web): diagrams laid out with ELK and drawn in Ink wash" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: The Architecture screen

The Architecture screen draws each item's diagram, one section each, with a one-line legend of the box statuses under it. Threads about a box (from "Ask about this box") show as numbered bubbles on it; threads about a box Claude has since removed are listed under the diagram, marked "Not in this version". Picking a box opens a panel with its status, file and threads, and a way to ask about it. Without the plan's clone, the section says "Not checked" and why, instead of marking every file "not found". Items with nothing to draw are still listed, and an item whose data can't be drawn says so without hiding the rest.

**Files:**
- Create:
  - `packages/web/src/pages/visual/rows.ts` (sorting a screen's rows; bubbles; `?item=` scrolling)
  - `packages/web/src/pages/visual/rows.test.ts`
  - `packages/web/src/pages/visual/DiagramScreen.tsx`
  - `packages/web/e2e/diagram.spec.ts`
- Modify: `packages/web/src/pages/visual/VisualScreen.tsx` (routes `diagram` to `DiagramScreen`)
- Test: `packages/web/src/pages/visual/rows.test.ts`, `packages/web/e2e/diagram.spec.ts`

**Interfaces:**
- Consumes:
  - Task 1: `parseData`, `DiagramData`, `NodeStatus`, `Anchor`.
  - Task 6: `TypeItemRow.data`, `.anchor` and `.checks` (`{ kind: 'diagram'; checked: true; nodes: Record<string, boolean> }`, or `{ kind: 'diagram'; checked: false; reason: string; nodes: {} }` when the clone is gone), with the types route filling `checks` from the plan's clone.
  - Task 7: `POST …/items` with an `anchor`, through `AnchorForm`.
  - Task 9: `ScreenProps`, `AnchorForm`, `DataProblem`, `OtherItems`, `testkit.row`, `writeRawData`, the fixture files `apps/web/app/reminders/page.tsx` and `apps/web/lib/reminders.ts`.
  - Task 10: `DiagramView` (with `legend`), `Tone`.
- Produces:
  - `pages/visual/rows.ts`, for every visual screen (Tasks 12–14 use it too):
    - `type ScreenRows<K extends DataKind> = { shown: ({ row; ok: true; data: VisualData[K] } | { row; ok: false; problems: string[] })[]; anchored: TypeItemRow[]; other: TypeItemRow[] }`
    - `splitRows<K extends DataKind>(kind: K, rows: TypeItemRow[]): ScreenRows<K>`: rows with an `anchor` are `anchored`; rows with no data are `other`; the rest are `shown`, parsed with `parseData`, in row order.
    - `toneOf(statuses: DisplayStatus[]): Tone`: the most urgent (your turn seal > draft or with Claude slate > resolved moss > parked or idle mist).
    - `anchorsOn(anchored: TypeItemRow[], itemId: string, kind: 'node' | 'element' | 'step'): Map<string, TypeItemRow[]>`, keyed by `anchor.ref`.
    - `bubblesFrom(byRef): Record<string, { count: number; tone: Tone }>`
    - `itemAnchorId(itemId)` (`item-<id>`, the DOM id of an item's section) and `useScrollToItem(item)`.
  - `DiagramScreen(p: ScreenProps)`:
    - one `<section data-testid="diagram-section" data-item={id} data-selected="true"?>` per drawn item, with the diagram's legend under it;
    - ✓ and "not found" only when `checks.kind === 'diagram' && checks.checked`; otherwise `<p data-testid="diagram-checks">Not checked · {reason}</p>` in text-3 under the summary;
    - threads about a box that's no longer in the diagram are listed under it, each marked "Not in this version", not in Other items;
    - the box panel is `<aside data-testid="node-panel">`, a right column at 1100 px and wider, below the diagram otherwise.

- [ ] **Step 1: Write the failing tests**

`packages/web/src/pages/visual/rows.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { anchorsOn, bubblesFrom, splitRows, toneOf } from './rows';
import { row } from './testkit';

const diagram = { kind: 'system', groups: [], nodes: [{ id: 'job', label: 'Reminder job', status: 'new' }], edges: [] };

describe('splitRows', () => {
  it('sorts rows into drawn, broken, anchored and other, keeping row order', () => {
    const rows = [
      row({ id: 'a', data: diagram }),
      row({ id: 'b', data: { kind: 'system', nodes: 'oops' } }),
      row({ id: 'c', anchor: { itemId: 'a', kind: 'node', ref: 'job', label: 'Reminder job' } }),
      row({ id: 'd' }),
    ];
    const s = splitRows('diagram', rows);
    expect(s.shown.map((x) => [x.row.id, x.ok])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    const broken = s.shown[1]!;
    expect(broken.ok ? [] : broken.problems.length).toBeGreaterThan(0);
    expect(s.anchored.map((r) => r.id)).toEqual(['c']);
    expect(s.other.map((r) => r.id)).toEqual(['d']);
  });
});

describe('bubbles', () => {
  it('counts threads per part, in the most urgent status colour', () => {
    const on = (id: string, ref: string, status: 'your_turn' | 'with_claude' | 'resolved' | 'parked') =>
      row({ id, status, anchor: { itemId: 'a', kind: 'node', ref, label: ref } });
    const anchored = [on('1', 'job', 'resolved'), on('2', 'job', 'your_turn'), on('3', 'api', 'with_claude'), on('4', 'db', 'parked'), row({ id: '5', anchor: { itemId: 'other', kind: 'node', ref: 'job', label: 'x' } })];
    expect(bubblesFrom(anchorsOn(anchored, 'a', 'node'))).toEqual({
      job: { count: 2, tone: 'seal' },
      api: { count: 1, tone: 'slate' },
      db: { count: 1, tone: 'mist' },
    });
    expect(toneOf(['resolved', 'parked'])).toBe('moss');
    expect(toneOf(['draft'])).toBe('slate');
  });
});
```

`packages/web/e2e/diagram.spec.ts`:
```ts
import { expect, test, type Locator, type Page } from '@playwright/test';
import { api, importProject, writeRawData, type TestItem } from './claude';
import { noSideScroll, readJson, writeJson } from './env';

const system: TestItem = {
  key: 'system',
  title: 'System view',
  summary: 'The reminders page, the daily job and what it talks to.',
  data: {
    kind: 'system',
    groups: [
      { id: 'web', label: 'Web app' },
      { id: 'jobs', label: 'Jobs' },
    ],
    nodes: [
      { id: 'page', label: 'Reminders page', group: 'web', status: 'new', codeRef: { path: 'apps/web/app/reminders/page.tsx' } },
      { id: 'job', label: 'Reminder job', group: 'jobs', status: 'changed', codeRef: { path: 'apps/web/lib/reminders.ts', symbol: 'sendRestockReminders' } },
      { id: 'retry', label: 'Retry queue', group: 'jobs', status: 'new', codeRef: { path: 'apps/web/lib/retry.ts' } },
      { id: 'db', label: 'Orders database', status: 'unchanged' },
      { id: 'sms', label: 'SMS provider', status: 'external' },
    ],
    edges: [
      { id: 'schedules', from: 'page', to: 'job', label: 'schedules' },
      { id: 'reads', from: 'job', to: 'db', label: 'reads' },
      { id: 'retries', from: 'job', to: 'retry' },
      { id: 'sends', from: 'job', to: 'sms', style: 'dashed' },
    ],
  },
};
const dataFlow: TestItem = {
  key: 'data-flow',
  title: 'Reminder data flow',
  summary: 'From an order to a reminder row.',
  data: {
    kind: 'data_flow',
    groups: [],
    nodes: [
      { id: 'order', label: 'Order placed', status: 'unchanged' },
      { id: 'due', label: 'Due date', status: 'new' },
      { id: 'reminder', label: 'Reminder row', status: 'new' },
    ],
    edges: [
      { id: 'a', from: 'order', to: 'due' },
      { id: 'b', from: 'due', to: 'reminder', label: 'writes' },
    ],
  },
};

/** 20 boxes in four groups, each linked to the next one. */
function twentyBoxes() {
  const groups = ['web', 'api', 'jobs', 'data'].map((id) => ({ id, label: `The ${id} part` }));
  const statuses = ['new', 'changed', 'unchanged', 'external'];
  const nodes = Array.from({ length: 20 }, (_, i) => ({
    id: `box-${i}`,
    label: `Box ${i}`,
    status: statuses[i % 4],
    ...(i < 16 ? { group: groups[i % 4]!.id } : {}),
  }));
  const edges = nodes.slice(1).map((n, i) => ({ id: `line-${i}`, from: `box-${i}`, to: n.id }));
  return { kind: 'system', groups, nodes, edges };
}

const section = (page: Page, title: string) => page.getByTestId('diagram-section').filter({ hasText: title });
const box = (scope: Page | Locator, id: string) => scope.locator(`[data-testid=diagram-node][data-node="${id}"]`);

test('draws each diagram with its boxes, statuses, file checks and lines', async ({ page }) => {
  const p = await importProject('diagram-draws', 'Diagram draws', { architecture: [system, dataFlow] });
  await page.goto(`${p.url}/t/architecture`);
  const sys = section(page, 'System view');
  await expect(box(sys, 'page')).toHaveAttribute('data-status', 'new');
  await expect(box(sys, 'job')).toHaveAttribute('data-status', 'changed');
  await expect(box(sys, 'db')).toHaveAttribute('data-status', 'unchanged');
  await expect(box(sys, 'sms')).toHaveAttribute('data-status', 'external');
  // ✓ on a file that's in the clone, "not found" on one that isn't.
  await expect(box(sys, 'job').locator('[data-check=found]')).toHaveCount(1);
  await expect(box(sys, 'retry').locator('[data-check=missing]')).toHaveText('not found');
  await expect(sys.getByTestId('diagram-edge')).toHaveCount(4);
  await expect(sys.getByText('System', { exact: true })).toBeVisible();
  // The fixture repo is the clone, so the boxes were checked, and the legend sits under the drawing.
  await expect(sys.getByTestId('diagram-checks')).toHaveCount(0);
  await expect(sys.getByTestId('diagram-legend')).toContainText('outside the repo');
  const flow = section(page, 'Reminder data flow');
  await expect(flow.getByTestId('diagram-node')).toHaveCount(3);
  await expect(flow.getByText('Data flow', { exact: true })).toBeVisible();

  // ?item= opens one diagram.
  await page.goto(`${p.url}/t/architecture?item=architecture-data-flow`);
  await expect(section(page, 'Reminder data flow')).toHaveAttribute('data-selected', 'true');
  await expect(section(page, 'System view')).not.toHaveAttribute('data-selected', 'true');
});

test('Ask about this box starts a thread about it, the box gets a bubble, and the thread outlives the box', async ({ page }) => {
  const p = await importProject('diagram-ask', 'Diagram ask', { architecture: [system] });
  await page.goto(`${p.url}/t/architecture`);
  await page.getByRole('button', { name: 'Reminder job, changed' }).click();
  const panel = page.getByTestId('node-panel');
  await expect(panel.getByRole('heading')).toHaveText('Reminder job');
  await expect(panel).toContainText('Changed');
  await expect(panel).toContainText('apps/web/lib/reminders.ts · sendRestockReminders ✓');
  await panel.getByRole('button', { name: 'Ask about this box' }).click();
  await expect(panel.getByRole('textbox', { name: 'Title' })).toHaveValue('About Reminder job');
  await panel.getByRole('textbox', { name: 'Your message' }).fill('Does it retry a failed send?');
  await panel.getByRole('button', { name: 'Add and send' }).click();

  // The thread view shows the new thread; Task 16 adds its "On" line.
  await expect(page).toHaveURL(/\/th\/t-architecture-about-reminder-job$/);
  await expect(page.getByText('Does it retry a failed send?')).toBeVisible();
  await expect(page.getByTestId('thread-status')).toHaveText('With Claude');
  const detail = await api(`/api/projects/${p.repo}/${p.project}/threads/t-architecture-about-reminder-job`);
  expect(detail.item.anchor).toEqual({ itemId: 'architecture-system', kind: 'node', ref: 'job', label: 'Reminder job' });

  await page.goto(`${p.url}/t/architecture`);
  const job = box(page, 'job');
  await expect(job.getByTestId('diagram-bubble')).toHaveAttribute('data-count', '1');
  await expect(job.getByTestId('diagram-bubble')).toHaveAttribute('data-tone', 'slate');
  await job.click();
  await page.getByTestId('node-panel').getByRole('link', { name: 'About Reminder job' }).click();
  await expect(page).toHaveURL(/\/th\/t-architecture-about-reminder-job$/);
  // A thread about a box is a bubble, not another row.
  await page.goto(`${p.url}/t/architecture`);
  await expect(box(page, 'job')).toBeVisible();
  await expect(page.getByTestId('other-item')).toHaveCount(0);

  // Claude redraws the diagram without that box: its thread stays under the diagram, marked "Not in this version".
  const drawing = system.data as { nodes: { id: string }[]; edges: { from: string; to: string }[] };
  writeRawData(p, 'architecture-system', {
    ...drawing,
    nodes: drawing.nodes.filter((n) => n.id !== 'job'),
    edges: drawing.edges.filter((e) => e.from !== 'job' && e.to !== 'job'),
  });
  await page.goto(`${p.url}/t/architecture`);
  const sys = section(page, 'System view');
  await expect(sys.getByTestId('diagram-node')).toHaveCount(4);
  await expect(sys.getByTestId('gone-pin')).toHaveText([/About Reminder job\s*Not in this version/]);
  await expect(page.getByTestId('other-item')).toHaveCount(0);
});

test("a diagram that can't be drawn doesn't hide the others", async ({ page }) => {
  const p = await importProject('diagram-broken', 'Diagram broken', {
    architecture: [system, dataFlow, { key: 'notes', title: 'Notes on the job', summary: 'Nothing to draw yet.' }],
  });
  writeRawData(p, 'architecture-data-flow', { kind: 'data_flow', nodes: 'not a list' });
  await page.goto(`${p.url}/t/architecture`);
  const problem = page.getByTestId('data-problem');
  await expect(problem).toContainText('Reminder data flow');
  await expect(problem).toContainText("This item's drawing couldn't be shown");
  await expect(problem.getByRole('listitem').first()).toContainText('nodes');
  await problem.getByText('Raw data').click();
  await expect(problem.locator('pre')).toContainText('not a list');
  await expect(problem.getByRole('link', { name: 'Open thread →' })).toHaveAttribute('href', `${p.url}/th/t-architecture-data-flow`);
  // The other diagram still draws, and the item without data is still listed.
  await expect(section(page, 'System view').getByTestId('diagram-node')).toHaveCount(5);
  await expect(page.getByTestId('other-item')).toHaveText([/Notes on the job/]);
});

test('boxes take the dark theme colours', async ({ page }) => {
  const p = await importProject('diagram-dark', 'Diagram dark', { architecture: [system] });
  const saved = readJson('settings.json');
  writeJson('settings.json', { ...saved, theme: 'dark' });
  try {
    await page.goto(`${p.url}/t/architecture`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const rect = box(page, 'page').locator('[data-part=box]');
    // Dark moss, #8DB587.
    await expect.poll(() => rect.evaluate((el) => getComputedStyle(el).stroke)).toBe('rgb(141, 181, 135)');
  } finally {
    writeJson('settings.json', saved);
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('a 20-box diagram fits a phone', async ({ page }) => {
    const p = await importProject('diagram-phone', 'Diagram phone', { architecture: [{ key: 'big', title: 'Everything', summary: 'Twenty boxes.', data: twentyBoxes() }] });
    await page.goto(`${p.url}/t/architecture`);
    await expect(page.getByTestId('diagram-node')).toHaveCount(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    expect(await noSideScroll(page)).toEqual([]);
    await box(page, 'box-0').click();
    await expect(page.getByTestId('node-panel')).toBeVisible();
    await expect(page.getByTestId('node-panel').getByRole('heading')).toHaveText('Box 0');
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run:
```bash
pnpm vitest run packages/web/src/pages/visual/rows.test.ts
pnpm test:e2e diagram
```
Expected: FAIL. `./rows` doesn't exist, and the Architecture screen still lists its items as rows, so there's no `diagram-section`, `node-panel` or `data-problem`.

- [ ] **Step 3: Write the row helpers**

`packages/web/src/pages/visual/rows.ts`:
```ts
import { parseData, type DataKind, type DisplayStatus, type TypeItemRow, type VisualData } from '@dev-plumbing/core/schemas';
import { useEffect } from 'react';
import type { Tone } from '../../diagram/DiagramView';

/** A screen's rows, sorted by what it can do with them. */
export type ScreenRows<K extends DataKind> = {
  /** Items with data, in row order: drawn when it parses, a DataProblem when it doesn't. */
  shown: ({ row: TypeItemRow; ok: true; data: VisualData[K] } | { row: TypeItemRow; ok: false; problems: string[] })[];
  /** Threads about one part of another item: a box, an element or a step. */
  anchored: TypeItemRow[];
  /** Items with nothing to draw. */
  other: TypeItemRow[];
};

export function splitRows<K extends DataKind>(kind: K, rows: TypeItemRow[]): ScreenRows<K> {
  const out: ScreenRows<K> = { shown: [], anchored: [], other: [] };
  for (const row of rows) {
    if (row.anchor) out.anchored.push(row);
    else if (row.data === null || row.data === undefined) out.other.push(row);
    else {
      const parsed = parseData(kind, row.data);
      out.shown.push(parsed.ok ? { row, ok: true, data: parsed.data } : { row, ok: false, problems: parsed.problems });
    }
  }
  return out;
}

const TONE: Record<DisplayStatus, Tone> = { your_turn: 'seal', draft: 'slate', with_claude: 'slate', resolved: 'moss', parked: 'mist', idle: 'mist' };
const URGENCY: Tone[] = ['seal', 'slate', 'moss', 'mist'];

/** The most urgent status's colour: your turn, then draft or with Claude, then resolved, then parked. */
export function toneOf(statuses: DisplayStatus[]): Tone {
  const tones = new Set(statuses.map((s) => TONE[s]));
  return URGENCY.find((t) => tones.has(t)) ?? 'mist';
}

/** Anchored rows about one item, grouped by the part they're about (anchor.ref). */
export function anchorsOn(anchored: TypeItemRow[], itemId: string, kind: 'node' | 'element' | 'step'): Map<string, TypeItemRow[]> {
  const byRef = new Map<string, TypeItemRow[]>();
  for (const r of anchored) {
    if (r.anchor?.itemId !== itemId || r.anchor.kind !== kind) continue;
    byRef.set(r.anchor.ref, [...(byRef.get(r.anchor.ref) ?? []), r]);
  }
  return byRef;
}

/** One bubble per part: how many threads are about it, in the most urgent one's colour. */
export function bubblesFrom(byRef: Map<string, TypeItemRow[]>): Record<string, { count: number; tone: Tone }> {
  return Object.fromEntries([...byRef].map(([ref, rows]) => [ref, { count: rows.length, tone: toneOf(rows.map((r) => r.status)) }]));
}

/** The DOM id of an item's section, for `?item=`. */
export const itemAnchorId = (itemId: string) => `item-${itemId}`;

/** Scrolls `?item=`'s section into view once it's on the page. */
export function useScrollToItem(item: string | undefined) {
  useEffect(() => {
    if (item) document.getElementById(itemAnchorId(item))?.scrollIntoView?.({ block: 'start' });
  }, [item]);
}
```

Run: `pnpm vitest run packages/web/src/pages/visual/rows.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Write the Architecture screen**

`packages/web/src/pages/visual/DiagramScreen.tsx`:
```tsx
import type { DiagramData, NodeStatus, TypeItemRow } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { StatusMark } from '../../components/StatusMark';
import { DiagramView } from '../../diagram/DiagramView';
import { AnchorForm } from './AnchorForm';
import { DataProblem } from './DataProblem';
import { OtherItems } from './OtherItems';
import { anchorsOn, bubblesFrom, itemAnchorId, splitRows, useScrollToItem } from './rows';
import type { ScreenProps } from './VisualScreen';

const STATUS_WORD: Record<NodeStatus, { text: string; className: string }> = {
  new: { text: 'New', className: 'text-moss' },
  changed: { text: 'Changed', className: 'text-amber' },
  unchanged: { text: 'Unchanged', className: 'text-ink-3' },
  external: { text: 'External', className: 'text-ink-3' },
};
const KIND_TAG = { system: 'System', data_flow: 'Data flow' } as const;

type Selection = { itemId: string; nodeId: string } | null;

/** Architecture: each item's diagram, with thread bubbles on its boxes and a panel for the box you pick. */
export function DiagramScreen({ repo, project, data, item }: ScreenProps) {
  const { shown, anchored, other } = splitRows('diagram', data.items);
  const [selected, setSelected] = useState<Selection>(null);
  useScrollToItem(item);

  // Threads about a box that's still drawn become bubbles. Threads about a box Claude has since removed are listed
  // under that diagram, marked "Not in this version". Any other anchored thread is listed with the other items.
  const placed = new Set<string>();
  const pinsFor = new Map<string, Map<string, TypeItemRow[]>>();
  const goneFor = new Map<string, TypeItemRow[]>();
  for (const s of shown) {
    if (!s.ok) continue;
    const ids = new Set(s.data.nodes.map((n) => n.id));
    const all = [...anchorsOn(anchored, s.row.id, 'node')];
    for (const [, rows] of all) for (const r of rows) placed.add(r.id);
    pinsFor.set(s.row.id, new Map(all.filter(([nodeId]) => ids.has(nodeId))));
    goneFor.set(s.row.id, all.filter(([nodeId]) => !ids.has(nodeId)).flatMap(([, rows]) => rows));
  }
  const leftovers = [...other, ...anchored.filter((r) => !placed.has(r.id))];

  return (
    <div className="mt-4 space-y-8">
      {shown.map((s) =>
        s.ok ? (
          <DiagramSection
            key={s.row.id}
            row={s.row}
            diagram={s.data}
            pins={pinsFor.get(s.row.id) ?? new Map()}
            gone={goneFor.get(s.row.id) ?? []}
            rows={data.items}
            type={data.type.id}
            highlighted={item === s.row.id}
            selectedNode={selected?.itemId === s.row.id ? selected.nodeId : null}
            onSelect={(nodeId) => setSelected(nodeId ? { itemId: s.row.id, nodeId } : null)}
            repo={repo}
            project={project}
          />
        ) : (
          <div key={s.row.id} id={itemAnchorId(s.row.id)}>
            <DataProblem title={s.row.title} problems={s.problems} data={s.row.data} threadId={s.row.threadId} repo={repo} project={project} />
          </div>
        ),
      )}
      <OtherItems rows={leftovers} repo={repo} project={project} title={shown.length ? 'Other items' : undefined} />
    </div>
  );
}

function DiagramSection({
  row,
  diagram,
  pins,
  gone,
  rows,
  type,
  highlighted,
  selectedNode,
  onSelect,
  repo,
  project,
}: {
  row: TypeItemRow;
  diagram: DiagramData;
  pins: Map<string, TypeItemRow[]>;
  gone: TypeItemRow[];
  rows: TypeItemRow[];
  type: string;
  highlighted: boolean;
  selectedNode: string | null;
  onSelect: (nodeId: string | null) => void;
  repo: string;
  project: string;
}) {
  const node = selectedNode ? (diagram.nodes.find((n) => n.id === selectedNode) ?? null) : null;
  // ✓ and "not found" only when the boxes were checked; without the clone, the section says "Not checked" instead.
  const checks = row.checks?.kind === 'diagram' && row.checks.checked ? row.checks.nodes : undefined;
  const notChecked = row.checks?.kind === 'diagram' && !row.checks.checked ? row.checks.reason : null;
  return (
    <section
      id={itemAnchorId(row.id)}
      data-testid="diagram-section"
      data-item={row.id}
      data-selected={highlighted ? 'true' : undefined}
      aria-label={row.title}
      className={`scroll-mt-4 ${highlighted ? 'rounded-[12px] outline outline-1 outline-offset-4 outline-slate' : ''}`}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[15px] font-semibold">{row.title}</h3>
        <span className="text-[11.5px] text-ink-3">{KIND_TAG[diagram.kind]}</span>
        <span className="ml-auto flex items-center gap-1.5 text-[12px]">
          <StatusMark status={row.status} />
          <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: row.threadId }} className="text-slate">
            Open thread
          </Link>
        </span>
      </header>
      <p className="mt-0.5 text-[12.5px] text-ink-2">{row.summary}</p>
      {notChecked && (
        <p data-testid="diagram-checks" className="mt-0.5 text-[12px] text-ink-3">
          Not checked · {notChecked}
        </p>
      )}
      <div className={`mt-3 grid grid-cols-1 gap-4 ${node ? 'min-[1100px]:grid-cols-[minmax(0,1fr)_300px]' : ''}`}>
        <div className="min-w-0">
          <DiagramView
            data={diagram}
            checks={checks}
            bubbles={bubblesFrom(pins)}
            selected={selectedNode}
            onSelect={(id) => onSelect(id === selectedNode ? null : id)}
            legend
          />
        </div>
        {node && (
          <NodePanel
            key={node.id}
            node={node}
            check={checks?.[node.id]}
            threads={pins.get(node.id) ?? []}
            rows={rows}
            itemId={row.id}
            type={type}
            onClose={() => onSelect(null)}
            repo={repo}
            project={project}
          />
        )}
      </div>
      {gone.length > 0 && (
        <ul aria-label="Threads about boxes not in this version" className="mt-3 flex flex-col gap-1 text-[12.5px]">
          {gone.map((t) => (
            <li key={t.id} data-testid="gone-pin" className="flex items-center gap-2">
              <StatusMark status={t.status} />
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: t.threadId }} className="min-w-0 truncate text-slate">
                {t.title}
              </Link>
              <span className="shrink-0 text-[11.5px] text-ink-3">Not in this version</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NodePanel({
  node,
  check,
  threads,
  rows,
  itemId,
  type,
  onClose,
  repo,
  project,
}: {
  node: DiagramData['nodes'][number];
  check: boolean | undefined;
  threads: TypeItemRow[];
  rows: TypeItemRow[];
  itemId: string;
  type: string;
  onClose: () => void;
  repo: string;
  project: string;
}) {
  const [asking, setAsking] = useState(false);
  const linked = node.itemId ? rows.find((r) => r.id === node.itemId) : undefined;
  const word = STATUS_WORD[node.status];
  return (
    <aside data-testid="node-panel" aria-label={`Box: ${node.label}`} className="min-w-0 self-start rounded-[10px] border-[0.5px] border-separator bg-cell px-3 py-3 text-[12.5px]">
      <div className="flex items-start gap-2">
        <h4 className="min-w-0 flex-1 text-[14px] font-semibold">{node.label}</h4>
        <button type="button" onClick={onClose} className="shrink-0 text-[12px] text-slate">
          Close
        </button>
      </div>
      <p className={`mt-0.5 text-[12px] font-medium ${word.className}`}>{word.text}</p>
      {node.codeRef && (
        <p className="mt-2 break-all font-mono text-[11.5px] text-ink-2">
          {node.codeRef.path}
          {node.codeRef.symbol ? ` · ${node.codeRef.symbol}` : ''}{' '}
          {check === true && <span className="text-moss">✓</span>}
          {check === false && <span className="font-sans text-amber">not found</span>}
        </p>
      )}
      {node.itemId && (
        <p className="mt-2 text-ink-2">
          Linked:{' '}
          {linked ? (
            <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: linked.threadId }} className="text-slate">
              {linked.title}
            </Link>
          ) : (
            <span className="font-mono text-[11.5px] text-ink-3">{node.itemId}</span>
          )}
        </p>
      )}
      {threads.length > 0 && (
        <ul className="mt-3 space-y-1" aria-label="Threads about this box">
          {threads.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <StatusMark status={t.status} />
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: t.threadId }} className="min-w-0 truncate text-slate">
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {asking ? (
        <AnchorForm repo={repo} project={project} type={type} anchor={{ itemId, kind: 'node', ref: node.id, label: node.label }} onDone={() => setAsking(false)} />
      ) : (
        <Button className="mt-3" onClick={() => setAsking(true)}>
          Ask about this box
        </Button>
      )}
    </aside>
  );
}
```
- `node.itemId` can point at an item of another plumbing type. The screen's rows only hold this type's items, so such a link shows its id, unlinked.
- `DiagramScreen` imports `ScreenProps` as a type only, so there's no runtime import cycle with `VisualScreen`.

- [ ] **Step 5: Route `diagram` to it**

In `packages/web/src/pages/visual/VisualScreen.tsx`, add:
```tsx
import { DiagramScreen } from './DiagramScreen';
```
and in `ScreenBody`, replace:
```tsx
    // Each screen adds its case here as it lands.
```
with:
```tsx
    // Each screen adds its case here as it lands.
    case 'diagram':
      return <DiagramScreen {...p} />;
```

- [ ] **Step 6: Run the tests**

Run:
```bash
pnpm vitest run packages/web/src/pages/visual
pnpm typecheck
pnpm test
pnpm test:e2e diagram
pnpm test:e2e
```
Expected: PASS, including the two Review Focus tests "a diagram that can't be drawn doesn't hide the others" and "a 20-box diagram fits a phone". The demo's Architecture item (`acme/restock-reminders`, "System view") now draws, with its legend, and says "Not checked · The plan's clone isn't on this Mac any more." under its summary, because the demo has no clone. Its boxes have no file references.

- [ ] **Step 7: Commit**

```bash
git add packages/web
git commit -m "feat(web): the Architecture screen draws each diagram, with box panels and bubbles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: The Database screen

The Database screen answers three questions at a glance:
- **How do the tables relate?** A small relationship strip.
- **Is the migration safe?** A migration panel: destructive or additive only, with backfills, data risks and how to roll back.
- **What changes in each table?** One diff card per table, checked against the repo's Prisma schema, as field rows (**Visual**) or as the schema diff (**Prisma**).

It also exports `TableCard`, which the thread view (Task 16) reuses.

**Files:**
- Create:
  - `packages/web/src/pages/visual/DatabaseScreen.tsx`
  - `packages/web/src/pages/visual/database.test.tsx`
  - `packages/web/e2e/database.spec.ts`
- Modify: `packages/web/src/pages/visual/VisualScreen.tsx` (routes `database` to `DatabaseScreen`)
- Test: `packages/web/src/pages/visual/database.test.tsx`, `packages/web/e2e/database.spec.ts`

**Interfaces:**
- Consumes:
  - Task 1: `TableDiff`, `DiagramData`, `migrationKindValues`.
  - Task 3/6: `TypeItemRow.checks` for database rows: `{ kind: 'database'; checked: true; file; warnings }` or `{ kind: 'database'; checked: false; reason; warnings: [] }`, with Task 3's warning and reason strings.
  - Task 9: `ScreenProps`, `DataProblem`, `OtherItems`, `testkit`, the fixture `packages/db/prisma/schema.prisma` and the profile's `schema`.
  - Task 10: `DiagramView` (`compact`).
  - Task 11: `splitRows`, `itemAnchorId`, `useScrollToItem`.
- Produces, from `pages/visual/DatabaseScreen.tsx`:
  - `TableCard(p: { data: TableDiff; checks: DataChecks | null; row?: TypeItemRow; repo: string; project: string })`, `<article data-testid="table-card" data-model={model}>`.
    - With `row`, it adds the item's title, StatusMark and an "Open thread" link. The thread view leaves `row` out.
    - Inside: `data-testid="table-checks"`, `field-row` items (`data-field`, `data-change`) and `schema-diff`.
  - `relationshipStrip(tables: TableDiff[]): DiagramData | null`
  - `relationTarget(field, table, models: Set<string>): string | null`
  - `migrationHeadline(kinds): { text: string; className: string }`
  - `DatabaseScreen(p: ScreenProps)`, with `data-testid="relationship-strip"` and `data-testid="migration-panel"` (headline `migration-headline`, groups `migration-<kind>`).

**Decisions this task makes:**
- **Relations.** A field points at another model when its type, without `?` or `[]`, is:
  - another table on this screen;
  - a list of a model (`Order[]`);
  - or a model with a matching foreign key (`customer Customer` next to `customerId`).

  Enums look exactly like models in a field type, and the screen doesn't have the schema, so this rule keeps `status SubscriptionStatus` from becoming a box.
- **Headline.** "Destructive" (seal) beats "Data risk" (amber) beats "Additive, with a backfill". Otherwise it's "Additive only" (moss), including when no migration is described. Rollback entries don't change the headline.

- [ ] **Step 1: Write the failing tests**

`packages/web/src/pages/visual/database.test.tsx`:
```tsx
import type { TableDiff } from '@dev-plumbing/core/schemas';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrationHeadline, relationshipStrip, relationTarget, TableCard } from './DatabaseScreen';
import { row } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('./testkit')).routerMock(navigate));

afterEach(cleanup);

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

describe('the relationship strip', () => {
  it('draws each table, the models they point at, and a line per relation, and skips enums', () => {
    const strip = relationshipStrip([reminder, subscription, { ...reminder, model: 'OldLog', change: 'removed', fields: [], migration: [] }])!;
    expect(strip.nodes).toEqual([
      { id: 'RestockReminder', label: 'RestockReminder', status: 'new' },
      { id: 'Subscription', label: 'Subscription', status: 'changed' },
      { id: 'OldLog', label: 'OldLog (removed)', status: 'changed' },
      { id: 'Customer', label: 'Customer', status: 'unchanged' },
    ]);
    expect(strip.edges.map((e) => [e.from, e.to, e.label])).toEqual([
      ['RestockReminder', 'Subscription', 'subscription'],
      ['Subscription', 'Customer', 'customer'],
      ['Subscription', 'RestockReminder', 'reminders'],
    ]);
  });

  it('is left out with fewer than two boxes', () => {
    expect(relationshipStrip([{ ...reminder, fields: [{ name: 'id', type: 'String', change: 'added' }] }])).toBeNull();
  });

  it('only counts a single model field as a relation with its foreign key', () => {
    const models = new Set(['Subscription']);
    expect(relationTarget({ name: 'status', type: 'SubscriptionStatus', change: 'unchanged' }, subscription, models)).toBeNull();
    expect(relationTarget({ name: 'customer', type: 'Customer', change: 'unchanged' }, subscription, models)).toBe('Customer');
    expect(relationTarget({ name: 'orders', type: 'Order[]', change: 'added' }, subscription, models)).toBe('Order');
    expect(relationTarget({ name: 'when', type: 'DateTime?', change: 'added' }, subscription, models)).toBeNull();
  });
});

describe('the migration headline', () => {
  it('says destructive, data risk, backfill or additive only', () => {
    expect(migrationHeadline(['additive', 'destructive', 'rollback']).text).toBe('Destructive');
    expect(migrationHeadline(['additive', 'data-risk']).text).toBe('Data risk');
    expect(migrationHeadline(['additive', 'backfill']).text).toBe('Additive, with a backfill');
    expect(migrationHeadline(['additive', 'rollback'])).toEqual({ text: 'Additive only', className: 'text-moss' });
    expect(migrationHeadline([]).text).toBe('Additive only');
  });
});

describe('TableCard', () => {
  it('shows changed fields, folds unchanged ones, and switches to the Prisma diff', () => {
    render(<TableCard data={subscription} checks={{ kind: 'database', checked: true, file: 'packages/db/prisma/schema.prisma', warnings: [] }} row={row({ title: 'Remind days before', status: 'your_turn' })} repo="acme-app" project="restock" />);
    const card = screen.getByTestId('table-card');
    expect(within(card).getByText('Changed').className).toContain('text-amber');
    expect(within(card).getByRole('link', { name: 'Open thread' }).getAttribute('href')).toBe('/p/acme-app/restock/th/t-architecture-system');
    expect(within(card).getByTestId('table-checks').textContent).toContain('Checked against packages/db/prisma/schema.prisma');
    expect(screen.getAllByTestId('field-row').map((r) => [r.getAttribute('data-field'), r.getAttribute('data-change')])).toEqual([
      ['remindDaysBefore', 'added'],
      ['reminders', 'added'],
      ['legacyNote', 'removed'],
    ]);
    expect(within(card).getByText('default 5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /4 unchanged fields/ }));
    expect(screen.getAllByTestId('field-row')).toHaveLength(7);

    fireEvent.click(screen.getByRole('tab', { name: 'Prisma' }));
    const diff = screen.getByTestId('schema-diff');
    expect(within(diff).getByText(/^\+ +remindDaysBefore Int/).className).toContain('text-moss');
    expect(within(diff).getByText(/^- +legacyNote/).className).toContain('text-seal');
    expect(screen.queryAllByTestId('field-row')).toHaveLength(0);
  });

  it('shows warnings, or Not checked with the reason', () => {
    const { unmount } = render(<TableCard data={subscription} checks={{ kind: 'database', checked: true, file: 'schema.prisma', warnings: ["Subscription.legacyNote isn't in the schema."] }} repo="a" project="p" />);
    expect(screen.getByTestId('table-checks').className).toContain('text-amber');
    expect(screen.getByText("Subscription.legacyNote isn't in the schema.")).toBeTruthy();
    // Without a row (the thread view) there's no thread link.
    expect(screen.queryByRole('link')).toBeNull();
    unmount();
    render(<TableCard data={reminder} checks={{ kind: 'database', checked: false, reason: 'No schema file is set in the repo profile.', warnings: [] }} repo="a" project="p" />);
    expect(screen.getByTestId('table-checks').textContent).toBe('Not checked · No schema file is set in the repo profile.');
    expect(screen.getByText('New').className).toContain('text-moss');
  });
});
```

`packages/web/e2e/database.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importProject, type TestItem } from './claude';
import { noSideScroll, readJson, writeJson } from './env';

// Checked against the fixture repo's packages/db/prisma/schema.prisma (Customer, Subscription, Order, SubscriptionStatus).
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
      { name: 'subscription', type: 'Subscription', change: 'added', note: 'The subscription it reminds about.' },
      { name: 'channel', type: 'String', change: 'added', note: 'sms or email' },
      { name: 'sentAt', type: 'DateTime', change: 'added', default: 'now()' },
    ],
    schemaDiff: [
      '+model RestockReminder {',
      '+  id             String       @id @default(cuid())',
      '+  subscriptionId String',
      '+  subscription   Subscription @relation(fields: [subscriptionId], references: [id])',
      '+  channel        String',
      '+  sentAt         DateTime     @default(now())',
      '+}',
    ].join('\n'),
    migration: [{ kind: 'additive', text: 'Create the RestockReminder table.' }],
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
      { name: 'customerId', type: 'String', change: 'unchanged' },
      { name: 'customer', type: 'Customer', change: 'unchanged' },
      { name: 'product', type: 'String', change: 'unchanged' },
      { name: 'status', type: 'SubscriptionStatus', change: 'unchanged' },
      { name: 'nextShipAt', type: 'DateTime', change: 'unchanged' },
      { name: 'remindDaysBefore', type: 'Int', change: 'added', default: '5' },
      { name: 'reminders', type: 'RestockReminder[]', change: 'added' },
      { name: 'pausedUntil', type: 'DateTime?', change: 'changed', note: 'Now optional.' },
    ],
    schemaDiff: [' model Subscription {', '+  remindDaysBefore Int               @default(5)', '+  reminders        RestockReminder[]', ' }'].join('\n'),
    migration: [{ kind: 'additive', text: 'Add remindDaysBefore with a default of 5.' }],
  },
};

const card = (page: Page, model: string) => page.locator(`[data-testid=table-card][data-model=${model}]`);

test('draws the relationships, the migration and a card per table, checked against the schema', async ({ page }) => {
  const p = await importProject('database-draws', 'Database draws', { database: [reminder, subscription] });
  await page.goto(`${p.url}/t/database`);

  // Both tables, plus Customer, which Subscription points at. The SubscriptionStatus enum isn't a box.
  const strip = page.getByTestId('relationship-strip');
  await expect(strip.getByTestId('diagram-node')).toHaveCount(3);
  await expect(strip.locator('[data-node=RestockReminder]')).toHaveAttribute('data-status', 'new');
  await expect(strip.locator('[data-node=Subscription]')).toHaveAttribute('data-status', 'changed');
  await expect(strip.locator('[data-node=Customer]')).toHaveAttribute('data-status', 'unchanged');
  await expect(strip.getByTestId('diagram-edge')).toHaveCount(3);

  const migration = page.getByTestId('migration-panel');
  await expect(migration.getByTestId('migration-headline')).toHaveText('Additive only');
  await expect(migration.getByTestId('migration-additive')).toContainText('Create the RestockReminder table.');
  await expect(migration.getByTestId('migration-additive')).toContainText('Add remindDaysBefore with a default of 5.');
  await expect(migration).toContainText('No rollback described');

  await expect(card(page, 'RestockReminder').getByText('New', { exact: true })).toBeVisible();
  await expect(card(page, 'RestockReminder').getByTestId('table-checks')).toContainText(/Checked against .*schema\.prisma/);
  await expect(card(page, 'Subscription').getByText('Changed', { exact: true })).toBeVisible();
  await expect(card(page, 'Subscription').getByTestId('table-checks')).toHaveText("Subscription.pausedUntil isn't in the schema.");
  await expect(card(page, 'Subscription').getByRole('link', { name: 'Open thread' })).toHaveAttribute('href', `${p.url}/th/t-database-subscription`);
});

test('Visual shows changed fields and folds the rest; Prisma shows the schema diff', async ({ page }) => {
  const p = await importProject('database-toggle', 'Database toggle', { database: [subscription] });
  await page.goto(`${p.url}/t/database`);
  const sub = card(page, 'Subscription');
  await expect(sub.getByTestId('field-row')).toHaveCount(3);
  await expect(sub.locator('[data-field=remindDaysBefore]')).toContainText('default 5');
  await expect(sub.locator('[data-field=pausedUntil]')).toHaveAttribute('data-change', 'changed');
  await sub.getByRole('button', { name: /6 unchanged fields/ }).click();
  await expect(sub.getByTestId('field-row')).toHaveCount(9);
  await sub.getByRole('button', { name: /6 unchanged fields/ }).click();
  await expect(sub.getByTestId('field-row')).toHaveCount(3);

  await sub.getByRole('tab', { name: 'Prisma' }).click();
  const diff = sub.getByTestId('schema-diff');
  await expect(diff.getByText(/remindDaysBefore Int/)).toHaveClass(/text-moss/);
  await expect(diff).toContainText(/\+\s+reminders\s+RestockReminder\[\]/);
  await expect(sub.getByTestId('field-row')).toHaveCount(0);
  await sub.getByRole('tab', { name: 'Visual' }).click();
  await expect(sub.getByTestId('field-row')).toHaveCount(3);
});

test('a destructive migration says so and lists its rollback', async ({ page }) => {
  const p = await importProject('database-destructive', 'Database destructive', {
    database: [
      {
        key: 'drop-legacy',
        title: 'Drop the legacy flag',
        summary: 'Remove a column nothing reads.',
        data: {
          model: 'Order',
          change: 'changed',
          fields: [
            { name: 'id', type: 'String', change: 'unchanged' },
            { name: 'legacyFlag', type: 'Boolean', change: 'removed' },
          ],
          schemaDiff: ' model Order {\n-  legacyFlag Boolean @default(false)\n }',
          migration: [
            { kind: 'destructive', text: 'Drop the legacyFlag column.' },
            { kind: 'rollback', text: 'Add legacyFlag back with a default of false.' },
          ],
        },
      },
      { key: 'index', title: 'Index on sentAt', summary: 'Decide once the table exists.' },
    ],
  });
  await page.goto(`${p.url}/t/database`);
  const migration = page.getByTestId('migration-panel');
  await expect(migration.getByTestId('migration-headline')).toHaveText('Destructive');
  await expect(migration.getByTestId('migration-headline')).toHaveClass(/text-seal/);
  await expect(migration.getByTestId('migration-destructive')).toContainText('Drop the legacyFlag column.');
  await expect(migration.getByTestId('migration-rollback')).toContainText('Add legacyFlag back with a default of false.');
  await expect(migration).not.toContainText('No rollback described');
  await expect(page.locator('[data-field=legacyFlag]')).toHaveAttribute('data-change', 'removed');
  await expect(page.getByTestId('table-checks')).toHaveText("Order.legacyFlag isn't in the schema.");
  // One table with no relations: no strip. The item without data is still listed.
  await expect(page.getByTestId('relationship-strip')).toHaveCount(0);
  await expect(page.getByTestId('other-item')).toHaveText([/Index on sentAt/]);
});

test('says Not checked, with the reason, when the repo profile has no schema', async ({ page }) => {
  const p = await importProject('database-unchecked', 'Database unchecked', { database: [reminder] });
  const saved = readJson('repos/acme-app.json');
  writeJson('repos/acme-app.json', { ...saved, schema: undefined });
  try {
    await page.goto(`${p.url}/t/database`);
    await expect(page.getByTestId('table-checks')).toHaveText('Not checked · No schema file is set in the repo profile.');
  } finally {
    writeJson('repos/acme-app.json', saved);
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('cards stack and nothing scrolls sideways', async ({ page }) => {
    const p = await importProject('database-phone', 'Database phone', { database: [reminder, subscription] });
    await page.goto(`${p.url}/t/database`);
    await expect(page.getByTestId('relationship-strip').getByTestId('diagram-node')).toHaveCount(3);
    const [first, second] = [await card(page, 'RestockReminder').boundingBox(), await card(page, 'Subscription').boundingBox()];
    expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
    expect(await noSideScroll(page)).toEqual([]);
    await card(page, 'RestockReminder').getByRole('tab', { name: 'Prisma' }).click();
    await expect(card(page, 'RestockReminder').getByTestId('schema-diff')).toBeVisible();
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run:
```bash
pnpm vitest run packages/web/src/pages/visual/database.test.tsx
pnpm test:e2e database
```
Expected: FAIL. `./DatabaseScreen` doesn't exist, and the Database screen still lists its items as rows, so there's no `relationship-strip`, `migration-panel` or `table-card`.

- [ ] **Step 3: Write the Database screen**

`packages/web/src/pages/visual/DatabaseScreen.tsx`:
```tsx
import { migrationKindValues, type DataChecks, type DiagramData, type TableDiff, type TypeItemRow } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Segmented } from '../../components/Segmented';
import { StatusMark } from '../../components/StatusMark';
import { DiagramView } from '../../diagram/DiagramView';
import { DataProblem } from './DataProblem';
import { OtherItems } from './OtherItems';
import { itemAnchorId, splitRows, useScrollToItem } from './rows';
import type { ScreenProps } from './VisualScreen';

type Field = TableDiff['fields'][number];
type MigrationKind = (typeof migrationKindValues)[number];

const PRISMA_SCALARS = new Set(['String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes']);

/** The model a field points at, or null. Enums look like models, so a field counts as a relation only when its type is
 *  another table on this screen, a list (`Order[]`), or comes with a matching foreign key (`customer Customer` + `customerId`). */
export function relationTarget(field: Field, table: TableDiff, models: Set<string>): string | null {
  const written = field.type.trim().split(/\s+/)[0] ?? '';
  const base = written.replace(/\?$/, '').replace(/\[\]$/, '');
  if (!/^[A-Z]\w*$/.test(base) || PRISMA_SCALARS.has(base)) return null;
  if (models.has(base) || written.endsWith('[]')) return base;
  return table.fields.some((f) => f.name === `${field.name}Id`) ? base : null;
}

/** The relationship strip: a box per table (removed ones marked), unchanged boxes for the models they point at, a line per relation. */
export function relationshipStrip(tables: TableDiff[]): DiagramData | null {
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
  return nodes.size < 2 ? null : { kind: 'system', groups: [], nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** The migration panel's one-word answer: destructive beats data risk beats a backfill; otherwise it's additive only. */
export function migrationHeadline(kinds: MigrationKind[]): { text: string; className: string } {
  if (kinds.includes('destructive')) return { text: 'Destructive', className: 'text-seal' };
  if (kinds.includes('data-risk')) return { text: 'Data risk', className: 'text-amber' };
  if (kinds.includes('backfill')) return { text: 'Additive, with a backfill', className: 'text-ink' };
  return { text: 'Additive only', className: 'text-moss' };
}

const KIND_LABEL: Record<MigrationKind, { text: string; className: string }> = {
  additive: { text: 'Additive', className: 'text-ink-3' },
  backfill: { text: 'Backfill', className: 'text-ink-3' },
  destructive: { text: 'Destructive', className: 'text-seal' },
  'data-risk': { text: 'Data risk', className: 'text-amber' },
  rollback: { text: 'Rollback', className: 'text-ink-3' },
};

function MigrationPanel({ tables }: { tables: TableDiff[] }) {
  const entries = tables.flatMap((t) => (t.migration ?? []).map((m) => ({ ...m, model: t.model })));
  const kinds = entries.map((e) => e.kind);
  const head = migrationHeadline(kinds);
  return (
    <section data-testid="migration-panel" aria-label="Migration" className="mt-4 rounded-[10px] border-[0.5px] border-separator bg-cell px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-[15px] font-semibold">Migration</h3>
        <span data-testid="migration-headline" className={`text-[13px] font-semibold ${head.className}`}>
          {head.text}
        </span>
      </div>
      {migrationKindValues.map((kind) => {
        const list = entries.filter((e) => e.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind} className="mt-2" data-testid={`migration-${kind}`}>
            <h4 className={`text-[12px] font-semibold ${KIND_LABEL[kind].className}`}>{KIND_LABEL[kind].text}</h4>
            <ul className="mt-0.5 space-y-0.5 text-[12.5px]">
              {list.map((e, i) => (
                <li key={i} className="break-words">
                  <span className="mr-1.5 font-mono text-[11.5px] text-ink-3">{e.model}</span>
                  {e.text}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {!kinds.includes('rollback') && <p className="mt-2 text-[12.5px] text-amber">No rollback described</p>}
    </section>
  );
}

const CHANGE_WORD: Record<TableDiff['change'], { text: string; className: string }> = {
  new: { text: 'New', className: 'text-moss' },
  changed: { text: 'Changed', className: 'text-amber' },
  removed: { text: 'Removed', className: 'text-seal' },
};
// §16: added / removed lines are moss / seal with + and −; changed is amber.
const FIELD_MARK: Record<Field['change'], { sign: string; className: string }> = {
  added: { sign: '+', className: 'text-moss' },
  changed: { sign: '~', className: 'text-amber' },
  removed: { sign: '−', className: 'text-seal' },
  unchanged: { sign: '', className: 'text-ink-3' },
};

function FieldRow({ field }: { field: Field }) {
  const mark = FIELD_MARK[field.change];
  return (
    <li data-testid="field-row" data-field={field.name} data-change={field.change} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1">
      <span aria-hidden="true" className={`w-3 shrink-0 font-mono text-[12px] ${mark.className}`}>
        {mark.sign}
      </span>
      <span className="sr-only">{field.change}</span>
      <span className={`break-all font-mono text-[12px] ${field.change === 'removed' ? 'text-seal' : 'text-ink'}`}>{field.name}</span>
      <span className="break-all font-mono text-[11.5px] text-ink-2">{field.type}</span>
      {field.default && <span className="text-[11.5px] text-ink-3">default {field.default}</span>}
      {field.note && <span className="min-w-0 text-[11.5px] text-ink-3">{field.note}</span>}
    </li>
  );
}

function TableChecks({ checks }: { checks: DataChecks | null }) {
  if (checks?.kind !== 'database') return null;
  if (!checks.checked) {
    return (
      <p data-testid="table-checks" className="mt-1.5 text-[12px] text-ink-3">
        <span className="font-medium">Not checked</span> · {checks.reason}
      </p>
    );
  }
  if (checks.warnings.length) {
    return (
      <ul data-testid="table-checks" className="mt-1.5 space-y-0.5 text-[12px] text-amber">
        {checks.warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    );
  }
  return (
    <p data-testid="table-checks" className="mt-1.5 text-[12px] text-ink-3">
      <span className="text-moss">✓</span> Checked against <span className="break-all font-mono text-[11.5px]">{checks.file}</span>
    </p>
  );
}

/**
 * One table's diff card: what changes, checked against the repo's schema, as rows (Visual) or as the schema diff (Prisma).
 * `row` adds the item's title, status and thread link; the thread view leaves it out.
 */
export function TableCard({ data, checks, row, repo, project }: { data: TableDiff; checks: DataChecks | null; row?: TypeItemRow; repo: string; project: string }) {
  const [view, setView] = useState<'visual' | 'prisma'>('visual');
  const [folded, setFolded] = useState(true);
  const changed = data.fields.filter((f) => f.change !== 'unchanged');
  const unchanged = data.fields.filter((f) => f.change === 'unchanged');
  const word = CHANGE_WORD[data.change];
  return (
    <article data-testid="table-card" data-model={data.model} aria-label={`Table ${data.model}`} className="min-w-0 rounded-[10px] border-[0.5px] border-separator bg-cell px-4 py-3">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="break-all font-mono text-[14px] font-semibold">{data.model}</h3>
        <span className={`text-[12px] font-semibold ${word.className}`}>{word.text}</span>
        {row && (
          <span className="ml-auto flex items-center gap-1.5 text-[12px]">
            <StatusMark status={row.status} />
            <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: row.threadId }} className="text-slate">
              Open thread
            </Link>
          </span>
        )}
      </header>
      {row && <p className="mt-0.5 text-[12.5px] text-ink-2">{row.title}</p>}
      <TableChecks checks={checks} />
      <div className="mt-2.5 max-w-[220px]">
        <Segmented<'visual' | 'prisma'>
          label={`Show ${data.model} as`}
          value={view}
          onChange={setView}
          options={[
            { value: 'visual', label: 'Visual' },
            { value: 'prisma', label: 'Prisma' },
          ]}
        />
      </div>
      {view === 'visual' ? (
        <div className="mt-2">
          {changed.length > 0 && (
            <ul className="divide-y-[0.5px] divide-separator">
              {changed.map((f) => (
                <FieldRow key={f.name} field={f} />
              ))}
            </ul>
          )}
          {unchanged.length > 0 && (
            <>
              <button type="button" aria-expanded={!folded} onClick={() => setFolded((v) => !v)} className="mt-1 text-[12px] text-slate">
                {folded ? '▸' : '▾'} {unchanged.length} unchanged field{unchanged.length === 1 ? '' : 's'}
              </button>
              {!folded && (
                <ul className="divide-y-[0.5px] divide-separator">
                  {unchanged.map((f) => (
                    <FieldRow key={f.name} field={f} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : data.schemaDiff.trim() ? (
        <pre data-testid="schema-diff" className="mt-2 whitespace-pre-wrap break-all font-mono text-[11.5px] leading-[1.55]">
          {data.schemaDiff.split('\n').map((line, i) => (
            <span key={i} className={`block ${line.startsWith('+') ? 'text-moss' : line.startsWith('-') ? 'text-seal' : 'text-ink-2'}`}>
              {line || ' '}
            </span>
          ))}
        </pre>
      ) : (
        <p className="mt-2 text-[12px] text-ink-3">No schema diff.</p>
      )}
    </article>
  );
}

/** Database: how the tables relate, what the migration does, and one diff card per table. */
export function DatabaseScreen({ repo, project, data, item }: ScreenProps) {
  const { shown, anchored, other } = splitRows('database', data.items);
  const tables = shown.flatMap((s) => (s.ok ? [s.data] : []));
  const strip = relationshipStrip(tables);
  useScrollToItem(item);
  return (
    <div className="mt-4">
      {strip && (
        <section data-testid="relationship-strip" aria-label="Relationships">
          <h3 className="mb-1.5 text-[12px] font-semibold text-ink-3">Relationships</h3>
          <DiagramView data={strip} compact />
        </section>
      )}
      {tables.length > 0 && <MigrationPanel tables={tables} />}
      <div className="mt-4 grid grid-cols-1 gap-3 min-[1100px]:grid-cols-2">
        {shown.map((s) => (
          <div
            key={s.row.id}
            id={itemAnchorId(s.row.id)}
            data-selected={item === s.row.id ? 'true' : undefined}
            className={`min-w-0 scroll-mt-4 ${item === s.row.id ? 'rounded-[10px] outline outline-1 outline-offset-2 outline-slate' : ''}`}
          >
            {s.ok ? (
              <TableCard data={s.data} checks={s.row.checks} row={s.row} repo={repo} project={project} />
            ) : (
              <DataProblem title={s.row.title} problems={s.problems} data={s.row.data} threadId={s.row.threadId} repo={repo} project={project} />
            )}
          </div>
        ))}
      </div>
      <OtherItems rows={[...other, ...anchored]} repo={repo} project={project} title={shown.length ? 'Other items' : undefined} />
    </div>
  );
}
```
- Field rows and headers wrap (`flex-wrap`, `break-all` on names and types), and the schema diff wraps (`whitespace-pre-wrap break-all`), so nothing scrolls sideways on a phone. Cards stack in one column below 1100 px.
- `?item=` outlines and scrolls to that table's card, like the Architecture screen.

- [ ] **Step 4: Route `database` to it**

In `packages/web/src/pages/visual/VisualScreen.tsx`, add:
```tsx
import { DatabaseScreen } from './DatabaseScreen';
```
and in `ScreenBody`, replace:
```tsx
    case 'diagram':
      return <DiagramScreen {...p} />;
```
with:
```tsx
    case 'diagram':
      return <DiagramScreen {...p} />;
    case 'database':
      return <DatabaseScreen {...p} />;
```

- [ ] **Step 5: Run the tests**

Run:
```bash
pnpm vitest run packages/web/src/pages/visual
pnpm typecheck
pnpm test
pnpm test:e2e database
pnpm test:e2e
```
Expected: PASS.
- The "Not checked" test changes `repos/acme-app.json` and restores it in `finally`, as `theme.spec.ts` does with `settings.json`.
- The demo's Database item now draws, with "Not checked" (the demo has no clone or repo profile).

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "feat(web): the Database screen: relationships, migration panel and diff cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The UI changes screen

UI changes shows one large mockup at a time, built with your app's own kit:
- **Desktop / Mobile** and **Before / After** toggles;
- **+ Pin**, which starts a thread about the element you click;
- pins drawn on the mockup and listed below it;
- for an item with no markup yet, **Ask Claude for a mockup**.

The mockup lives in a sandboxed frame. The app talks to it only through the Task 8 messages, and believes only messages that come from that frame's own window.

`MockupFrame` can also show a mockup that a thread option proposes (`proposal`). Task 16's "View proposed" uses that.

**Files:**
- Create:
  - `packages/web/src/components/MockupFrame.tsx`
  - `packages/web/src/pages/visual/MockupsScreen.tsx`
  - `packages/web/e2e/mockups.spec.ts`
- Modify:
  - `packages/web/src/api/client.ts` (`proposalMockupUrl`)
  - `packages/web/src/components/Segmented.tsx` (an option can be disabled)
  - `packages/web/src/pages/visual/VisualScreen.tsx` (`ScreenBody` gains `case 'mockups'`)
- Test:
  - `packages/web/src/components/MockupFrame.test.tsx`
  - `packages/web/src/components/components.test.tsx` (one new Segmented test)
  - `packages/web/e2e/mockups.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 1 (`@dev-plumbing/core/schemas`): `parseData`, `Anchor`.
  - From Task 6: `TypeItemRow` with `data`, `body`, `anchor`, `draft`, `status` and `threadId`. Rows come sorted by title.
  - From Task 7: `POST …/items` with an `anchor` (through `AnchorForm` and, in the e2e test, directly). The new item's id is `ui-<slug of its title>`, and `ThreadDetail.item.anchor` is the anchor.
  - From Task 8:
    - `mockupUrl`, `api.mockupKit` and `MockupKitInfo`;
    - the route `GET /api/projects/:repo/:id/threads/:threadId/options/:optionId/mockup/:side`;
    - the frame side of the messages (`PIN_SCRIPT`). Its selectors look like `body > main:nth-of-type(1) > div:nth-of-type(1)`, and markers carry `data-dp-pin`.
  - From Task 9:
    - `AnchorForm`, `DataProblem` and `OtherItems`;
    - the type route's search `{ item?: string }`, which `TypeView` passes to `VisualScreen` as `item`;
    - `export type ScreenProps = { repo: string; project: string; data: { type: TypeEntry; items: TypeItemRow[] }; item?: string }` from `VisualScreen.tsx`. `VisualScreen` renders the type's h2 title and item count, then `ScreenBody`, a switch on `type.screen`. After Task 12 it reads `// Each screen adds its case here as it lands.`, then the `diagram` and `database` cases (`case 'database':` / `return <DatabaseScreen {...p} />;`), then `default`;
  - From Task 11 (`pages/visual/rows.ts`): `toneOf(statuses: DisplayStatus[]): Tone` and `anchorsOn(anchored: TypeItemRow[], itemId: string, kind: 'node' | 'element' | 'step'): Map<string, TypeItemRow[]>`.
    - e2e: `TestItem.data` and `TestItem.body`, `writeRawData(p, itemId, data)`, and the fixture kit (`--color-brand: #0f766e`, `--radius-card: 14px`, app `web`).
  - From Task 10: `type Tone` from `web/src/diagram/DiagramView.tsx` (for `FramePin`).
  - From Plans 1 and 2: `api.saveDraft`, `api.submit`, `Segmented`, `StatusMark`, `Button`, and the e2e helpers `importProject`, `api`, `noSideScroll`.
- Produces:
  - `MockupFrame` and `FramePin`, per the header contract, plus one optional prop:
    - `proposal?: { threadId: string; optionId: string }`. With it, the frame shows that option's proposed markup, from `proposalMockupUrl`, and ignores pins and pin mode.
    - It renders `<iframe data-testid="mockup-frame" sandbox="allow-scripts" title="After mockup" | "Before mockup">`.
  - `web/src/api/client.ts`: `proposalMockupUrl(repo, id, threadId, optionId, side): string`, next to `mockupUrl`.
  - `MockupsScreen(p: ScreenProps)`. The selected screen is `p.item` (`?item=`). It has no h2 of its own: `VisualScreen` shows the type's title and count, and each screen's title is an h3.
  - `Segmented` options take `disabled?: boolean`.
  - Test ids:
    - `mockup-item` (screen list rows)
    - `mockup-location`
    - `kit-warnings`
    - `mockup-problems`
    - `no-mockup`
    - `mockup-pin`
    - `send-notice` (Ask Claude's result)

- [ ] **Step 1: Write the failing component tests**

`packages/web/src/components/MockupFrame.test.tsx`:
```tsx
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockupFrame, type FramePin } from './MockupFrame';

afterEach(cleanup);

const PIN: FramePin = { id: 'ui-about-restock-soon', selector: 'body > main:nth-of-type(1) > div:nth-of-type(1)', n: 1, tone: 'slate' };
const base = { repo: 'acme-app', project: 'restock', itemId: 'ui-settings', side: 'after' as const, device: 'desktop' as const };
const frameEl = () => screen.getByTestId('mockup-frame') as HTMLIFrameElement;
/** A message as if `source` posted it: the frame's own window unless given. */
const message = (data: unknown, source: MessageEventSource | null = frameEl().contentWindow) =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, source }));
  });

describe('MockupFrame', () => {
  it('is sandboxed without same-origin, and as wide as the device', () => {
    const { rerender } = render(<MockupFrame {...base} />);
    expect(frameEl().getAttribute('sandbox')).toBe('allow-scripts');
    expect(frameEl().getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frameEl().getAttribute('src')).toBe('/api/projects/acme-app/restock/items/ui-settings/mockup/after');
    expect(frameEl().getAttribute('title')).toBe('After mockup');
    expect(frameEl().getAttribute('width')).toBe('1280');
    rerender(<MockupFrame {...base} side="before" device="mobile" />);
    expect(frameEl().getAttribute('width')).toBe('390');
    expect(frameEl().getAttribute('src')).toBe('/api/projects/acme-app/restock/items/ui-settings/mockup/before');
  });

  it('takes its height from the frame', () => {
    render(<MockupFrame {...base} />);
    const box = frameEl().parentElement!;
    expect(box.style.height).toBe('240px');
    message({ source: 'dp-mockup', type: 'size', height: 500 });
    expect(box.style.height).toBe('500px');
    expect(frameEl().getAttribute('height')).toBe('500');
  });

  it('listens only to its own frame, and only for what it asked for', () => {
    const onPicked = vi.fn();
    const onOpenPin = vi.fn();
    const onMissingPins = vi.fn();
    const props = { ...base, pins: [PIN], onPicked, onOpenPin, onMissingPins };
    const { rerender } = render(<MockupFrame {...props} />);
    const pick = { source: 'dp-mockup', type: 'picked', selector: PIN.selector, text: 'Restock soon' };
    message(pick); // not in pin mode
    rerender(<MockupFrame {...props} pinMode />);
    message(pick, window); // from another window
    message({ ...pick, source: 'someone-else' });
    expect(onPicked).not.toHaveBeenCalled();
    message(pick);
    expect(onPicked).toHaveBeenCalledWith({ selector: PIN.selector, text: 'Restock soon' });
    message({ source: 'dp-mockup', type: 'open-pin', id: 'x' });
    expect(onOpenPin).not.toHaveBeenCalled();
    message({ source: 'dp-mockup', type: 'open-pin', id: PIN.id });
    expect(onOpenPin).toHaveBeenCalledWith(PIN.id);
    message({ source: 'dp-mockup', type: 'missing-pins', ids: [PIN.id] });
    expect(onMissingPins).toHaveBeenCalledWith([PIN.id]);
  });

  it('sends pins and pin mode once the frame has loaded, and again when they change', () => {
    const props = { ...base, pins: [PIN] };
    const { rerender } = render(<MockupFrame {...props} />);
    const posted: unknown[] = [];
    frameEl().contentWindow!.postMessage = (m: unknown) => {
      posted.push(m);
    };
    expect(posted).toEqual([]);
    fireEvent.load(frameEl());
    expect(posted).toContainEqual({ source: 'dp-app', type: 'pins', pins: [PIN] });
    expect(posted).toContainEqual({ source: 'dp-app', type: 'pin-mode', on: false });
    rerender(<MockupFrame {...props} pinMode />);
    expect(posted).toContainEqual({ source: 'dp-app', type: 'pin-mode', on: true });
  });

  it("shows an option's proposed mockup, without pins", () => {
    const onPicked = vi.fn();
    render(<MockupFrame {...base} proposal={{ threadId: 't-ui-settings', optionId: 'days' }} pins={[PIN]} pinMode onPicked={onPicked} />);
    expect(frameEl().getAttribute('src')).toBe('/api/projects/acme-app/restock/threads/t-ui-settings/options/days/mockup/after');
    const posted: unknown[] = [];
    frameEl().contentWindow!.postMessage = (m: unknown) => {
      posted.push(m);
    };
    fireEvent.load(frameEl());
    expect(posted).toEqual([]);
    message({ source: 'dp-mockup', type: 'picked', selector: PIN.selector, text: 'Restock soon' });
    expect(onPicked).not.toHaveBeenCalled();
  });
});
```

In `packages/web/src/components/components.test.tsx`, add this test inside `describe('Segmented', …)`:
```tsx
  it("doesn't pick a disabled option", () => {
    const onChange = vi.fn();
    render(<Segmented label="Version" value="after" onChange={onChange} options={[{ value: 'before', label: 'Before', disabled: true }, { value: 'after', label: 'After' }]} />);
    const before = screen.getByRole('tab', { name: 'Before' }) as HTMLButtonElement;
    expect(before.disabled).toBe(true);
    fireEvent.click(before);
    expect(onChange).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/web/src/components`
Expected: FAIL. `MockupFrame.test.tsx` fails because `./MockupFrame` is missing. The Segmented test fails because `disabled` isn't an option field yet: typecheck rejects it, and at runtime `before.disabled` is `false`.

- [ ] **Step 3: Let a Segmented option be disabled**

`packages/web/src/components/Segmented.tsx` becomes:
```tsx
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-[8px] bg-selection p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[6px] px-3 py-1 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${o.value === value ? 'bg-cell text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]' : 'text-ink-2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `MockupFrame`**

In `packages/web/src/api/client.ts`, add this below `mockupUrl` (Task 8):
```ts
/** The mockup an open thread option proposes, before it's accepted. Also an iframe src. */
export const proposalMockupUrl = (repo: string, id: string, threadId: string, optionId: string, side: 'after' | 'before') =>
  `${proj(repo, id)}/threads/${enc(threadId)}/options/${enc(optionId)}/mockup/${side}`;
```

`packages/web/src/components/MockupFrame.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { mockupUrl, proposalMockupUrl } from '../api/client';
import type { Tone } from '../diagram/DiagramView';

export type FramePin = { id: string; selector: string; n: number; tone: Tone };

type Props = {
  repo: string;
  project: string;
  itemId: string;
  side: 'after' | 'before';
  device: 'desktop' | 'mobile';
  pins?: FramePin[];
  pinMode?: boolean;
  onPicked?: (pick: { selector: string; text: string }) => void;
  onOpenPin?: (id: string) => void;
  onMissingPins?: (ids: string[]) => void;
  /** Small, not interactive, and loaded only when scrolled into view. */
  thumbnail?: boolean;
  /** Show what this open option proposes instead of the saved markup. Pins and pin mode are ignored. */
  proposal?: { threadId: string; optionId: string };
};

type FrameMessage =
  | { type: 'size'; height: number }
  | { type: 'picked'; selector: string; text: string }
  | { type: 'open-pin'; id: string }
  | { type: 'missing-pins'; ids: unknown[] };

/** Desktop renders 1280 px wide and mobile 390 px, both scaled down to fit. Thumbnails render as mobile. */
const WIDTHS = { desktop: 1280, mobile: 390 } as const;
/** The box's height until the frame says how tall its content is. */
const MIN_HEIGHT = 240;

/**
 * One side of a UI item's mockup. The frame is sandboxed with scripts but without same-origin, so its document has an
 * opaque origin: it can't read the app's cookies or call the API. It talks to the app only with postMessage, and only
 * messages from this frame's own window count. The service's PIN_SCRIPT is the other side.
 */
export function MockupFrame(p: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(p);
  latest.current = p;
  const [boxWidth, setBoxWidth] = useState(0);
  const [height, setHeight] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(!p.thumbnail || typeof IntersectionObserver === 'undefined');
  const width = p.thumbnail ? WIDTHS.mobile : WIDTHS[p.device];
  const scale = boxWidth > 0 ? Math.min(1, boxWidth / width) : 1;
  const src = p.proposal
    ? proposalMockupUrl(p.repo, p.project, p.proposal.threadId, p.proposal.optionId, p.side)
    : mockupUrl(p.repo, p.project, p.itemId, p.side);
  // Only a saved mockup shown full size takes pins.
  const pinnable = !p.thumbnail && !p.proposal;

  // A new document starts unmeasured, and isn't ready for messages until it loads.
  useEffect(() => {
    setHeight(null);
    setLoaded(false);
  }, [src]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setBoxWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    if (visible || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.source !== 'dp-mockup') return;
      const m = e.data as FrameMessage;
      const now = latest.current;
      if (m.type === 'size' && Number.isFinite(m.height)) {
        setHeight(Math.max(1, Math.ceil(m.height)));
        return;
      }
      if (now.thumbnail || now.proposal) return;
      // A pick only counts in pin mode, and an open-pin only for a pin this frame was given.
      if (m.type === 'picked' && now.pinMode && typeof m.selector === 'string') now.onPicked?.({ selector: m.selector, text: String(m.text ?? '') });
      else if (m.type === 'open-pin' && now.pins?.some((pin) => pin.id === m.id)) now.onOpenPin?.(m.id);
      else if (m.type === 'missing-pins' && Array.isArray(m.ids)) now.onMissingPins?.(m.ids.filter((id): id is string => typeof id === 'string'));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Pins and pin mode go to the frame once it has loaded, and again whenever they change.
  const pinsKey = JSON.stringify(p.pins ?? []);
  useEffect(() => {
    const win = frame.current?.contentWindow;
    if (!loaded || !win || !pinnable) return;
    win.postMessage({ source: 'dp-app', type: 'pins', pins: latest.current.pins ?? [] }, '*');
    win.postMessage({ source: 'dp-app', type: 'pin-mode', on: Boolean(p.pinMode) }, '*');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, pinsKey, p.pinMode, pinnable]);

  return (
    <div ref={box} className="w-full min-w-0">
      <div
        className="relative mx-auto overflow-hidden rounded-[10px] border-[0.5px] border-separator"
        style={{ width: Math.round(width * scale), maxWidth: '100%', height: height === null ? MIN_HEIGHT : Math.round(height * scale), pointerEvents: p.thumbnail ? 'none' : undefined }}
      >
        <iframe
          ref={frame}
          data-testid="mockup-frame"
          title={`${p.side === 'after' ? 'After' : 'Before'} mockup`}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          loading={p.thumbnail ? 'lazy' : undefined}
          tabIndex={p.thumbnail ? -1 : undefined}
          src={visible ? src : undefined}
          width={width}
          height={height ?? Math.round(MIN_HEIGHT / scale)}
          onLoad={() => setLoaded(true)}
          className="absolute left-0 top-0 block border-0 bg-white"
          style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}
        />
      </div>
    </div>
  );
}
```

The iframe's white background shows only where the kit sets none. The frame is a picture of your app, not part of the Ink wash page. The wrapper's `overflow: hidden` clips the iframe's unscaled layout box, so a 1280 px frame never widens the page.

- [ ] **Step 5: Run the component tests**

Run: `pnpm vitest run packages/web/src/components && pnpm --filter @dev-plumbing/web typecheck`
Expected: PASS.

- [ ] **Step 6: Write the failing e2e tests**

`packages/web/e2e/mockups.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { api, importProject, writeRawData, type TestItem } from './claude';
import { noSideScroll } from './env';

const CARD = '<div class="bg-brand rounded-card p-4" data-testid="card">Restock soon</div>';
const CARD_SELECTOR = 'body > main:nth-of-type(1) > div:nth-of-type(1)';
const SETTINGS_DATA = {
  location: { app: 'web', route: '/reminders', files: ['apps/web/app/reminders/page.tsx'] },
  kit: 'web',
  after: `<main class="p-6">${CARD}</main>`,
  before: '<main class="p-6"><p>No reminders yet</p></main>',
};
const settings: TestItem = { key: 'settings', title: 'Restock settings card', summary: 'A card on the reminders page.', data: SETTINGS_DATA };
const badge: TestItem = {
  key: 'badge',
  title: 'Restock badge',
  summary: 'A badge on each subscription item.',
  data: { location: { app: 'web', files: [] }, kit: 'web', after: '<span class="rounded-card bg-brand px-2">3 days left</span>' },
};
const orders: TestItem = {
  key: 'orders',
  title: 'Order history page',
  summary: 'Lists past orders.',
  body: 'Show the **next reminder** under each order.',
  data: { location: { app: 'web', route: '/orders', files: [] }, kit: 'web' },
};
const ASK = "Please draw the After mockup for this screen with the app's kit, and a Before from the current component if the screen exists today.";
const frameOf = (page: Page) => page.frameLocator('[data-testid=mockup-frame]');

test("draws the mockup with the app's kit, at desktop or mobile width", async ({ page }) => {
  const p = await importProject('mockups-kit', 'Mockups kit', { ui: [settings] });
  await page.goto(`${p.url}/t/ui`);
  await expect(page.getByTestId('mockup-location')).toHaveText('/reminders · apps/web/app/reminders/page.tsx · web');
  // These values exist only in the fixture's apps/web/app/globals.css, so the kit's @theme compiled in the frame.
  const card = frameOf(page).getByTestId('card');
  await expect(card).toHaveCSS('background-color', 'rgb(15, 118, 110)');
  await expect(card).toHaveCSS('border-radius', '14px');
  await expect(page.getByTestId('kit-warnings')).toHaveCount(0);
  const frame = page.getByTestId('mockup-frame');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(frame).toHaveAttribute('width', '1280');
  await page.getByRole('tab', { name: 'Mobile' }).click();
  await expect(frame).toHaveAttribute('width', '390');
  await expect(card).toBeVisible();
});

test("switches Before and After, and Before is off when there isn't one", async ({ page }) => {
  const p = await importProject('mockups-sides', 'Mockups sides', { ui: [settings, badge] });
  await page.goto(`${p.url}/t/ui?item=ui-settings`);
  await expect(frameOf(page).getByTestId('card')).toBeVisible();
  await page.getByRole('tab', { name: 'Before' }).click();
  await expect(frameOf(page).getByText('No reminders yet')).toBeVisible();
  await expect(page.getByTestId('mockup-frame')).toHaveAttribute('title', 'Before mockup');
  await page.getByRole('tab', { name: 'After' }).click();
  await expect(frameOf(page).getByTestId('card')).toBeVisible();
  await page.getByTestId('mockup-item').filter({ hasText: 'Restock badge' }).click();
  await expect(page).toHaveURL(/\?item=ui-badge$/);
  await expect(page.getByRole('tab', { name: 'Before' })).toBeDisabled();
  await expect(frameOf(page).getByText('3 days left')).toBeVisible();
});

test('+ Pin starts a thread about the element you click, and the pin shows on the mockup', async ({ page }) => {
  const p = await importProject('mockups-pin', 'Mockups pin', { ui: [settings] });
  await page.goto(`${p.url}/t/ui`);
  const card = frameOf(page).getByTestId('card');
  // Wait for the kit, so the card is where it will stay.
  await expect(card).toHaveCSS('background-color', 'rgb(15, 118, 110)');
  const hint = page.getByText('Click the part of the mockup you want to ask about.');
  await page.getByRole('button', { name: '+ Pin' }).click();
  await expect(hint).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(hint).toBeHidden();

  await page.getByRole('button', { name: '+ Pin' }).click();
  await card.click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('About Restock soon');
  await page.getByRole('textbox', { name: 'Your message' }).fill('Should it say how many days are left?');
  await page.getByRole('button', { name: 'Add and send' }).click();
  await expect(page).toHaveURL(/\/th\/t-ui-about-restock-soon$/);
  await expect(page.getByText('Should it say how many days are left?')).toBeVisible();
  const detail = await api(`/api/projects/${p.repo}/${p.project}/threads/t-ui-about-restock-soon`);
  expect(detail.item.anchor).toEqual({ itemId: 'ui-settings', kind: 'element', ref: CARD_SELECTOR, label: 'Restock soon', side: 'after' });

  await page.goto(`${p.url}/t/ui`);
  const pin = page.getByTestId('mockup-pin');
  await expect(pin).toHaveCount(1);
  await expect(pin).toContainText('About Restock soon');
  await expect(frameOf(page).locator('[data-dp-pin]')).toHaveText('1');
});

test("markup can't run script in the frame", async ({ page }) => {
  const p = await importProject('mockups-script', 'Mockups script', { ui: [settings] });
  // Written straight to the item file, past the write checks (which refuse the remote image).
  await writeRawData(p, 'ui-settings', {
    ...SETTINGS_DATA,
    after: `<main class="p-6"><button data-testid="sneaky" onclick="parent.postMessage({source:'dp-mockup',type:'open-pin',id:'x'},'*')">x</button><img src="https://example.com/x.png" alt=""></main>`,
  });
  // Set up before the frame loads. Only requests the frame's CSP lets through reach routing, so a blocked image never
  // shows up here; one that got past the CSP would be caught (and answered locally, never fetched from the network).
  const outside: string[] = [];
  await page.route('**://example.com/**', (route) => {
    outside.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  await page.goto(`${p.url}/t/ui`);
  const sneaky = frameOf(page).getByTestId('sneaky');
  await expect(sneaky).toBeVisible();
  await expect(page.getByTestId('mockup-problems')).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { frameMessages: unknown[] };
    w.frameMessages = [];
    window.addEventListener('message', (e) => w.frameMessages.push(e.data));
  });
  await sneaky.click();
  // Pick something too: messages from one frame arrive in order, so once the pick is in,
  // anything the click could have posted would be in as well.
  await page.getByRole('button', { name: '+ Pin' }).click();
  await sneaky.click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('About x');
  const types = await page.evaluate(() => (window as unknown as { frameMessages: { type?: string }[] }).frameMessages.map((m) => m?.type));
  expect(types).toContain('picked');
  expect(types).not.toContain('open-pin');
  expect(outside).toEqual([]);
  await expect(page).toHaveURL(new RegExp(`${p.url}/t/ui$`));
});

test('a pin survives a redrawn mockup', async ({ page }) => {
  const p = await importProject('mockups-redrawn', 'Mockups redrawn', { ui: [settings] });
  await api(`/api/projects/${p.repo}/${p.project}/items`, 'POST', {
    type: 'ui',
    title: 'About Restock soon',
    text: 'How many days are left?',
    anchor: { itemId: 'ui-settings', kind: 'element', ref: CARD_SELECTOR, label: 'Restock soon', side: 'after' },
  });
  await page.goto(`${p.url}/t/ui?item=ui-settings`);
  const pin = page.getByTestId('mockup-pin');
  await expect(frameOf(page).locator('[data-dp-pin]')).toHaveText('1');
  await expect(pin).toHaveCount(1);
  await expect(pin).not.toContainText('Not in this version');

  await writeRawData(p, 'ui-settings', { ...SETTINGS_DATA, after: '<section class="p-6"><p>Restock moved to settings</p></section>' });
  await page.reload();
  await expect(frameOf(page).getByText('Restock moved to settings')).toBeVisible();
  await expect(pin).toContainText('Not in this version');
  await expect(frameOf(page).locator('[data-dp-pin]')).toHaveCount(0);
  await pin.getByRole('link', { name: 'About Restock soon' }).click();
  await expect(page).toHaveURL(/\/th\/t-ui-about-restock-soon$/);
});

test('a UI item without markup offers Ask Claude for a mockup', async ({ page }) => {
  const p = await importProject('mockups-legacy', 'Mockups legacy', { ui: [orders] });
  await page.goto(`${p.url}/t/ui`);
  await expect(page.getByText('No mockup yet.')).toBeVisible();
  await expect(page.getByText('next reminder')).toBeVisible();
  await expect(page.getByTestId('mockup-frame')).toHaveCount(0);
  const ask = page.getByRole('button', { name: 'Ask Claude for a mockup' });
  await ask.click();
  await expect(page.getByTestId('send-notice')).toHaveText('Saved. No Claude window is listening. Run /dev-plumbing in any clone.');
  await expect(ask).toBeDisabled();
  await expect(page.getByText('Claude is working on it.')).toBeVisible();
  const detail = await api(`/api/projects/${p.repo}/${p.project}/threads/t-ui-orders`);
  expect(detail.thread.messages.at(-1)).toMatchObject({ author: 'you', text: ASK });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('the mockup scales to the width', async ({ page }) => {
    const p = await importProject('mockups-phone', 'Mockups phone', { ui: [settings] });
    await page.goto(`${p.url}/t/ui`);
    const frame = page.getByTestId('mockup-frame');
    await expect(frame).toHaveAttribute('width', '390');
    await expect(frameOf(page).getByTestId('card')).toBeVisible();
    expect((await frame.boundingBox())!.width).toBeLessThanOrEqual(375);
    await page.getByRole('tab', { name: 'Desktop' }).click();
    await expect(frame).toHaveAttribute('width', '1280');
    expect((await frame.boundingBox())!.width).toBeLessThanOrEqual(375);
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 7: Run them to see them fail**

Run: `pnpm test:e2e mockups`
Expected: FAIL. No `mockup-frame` appears, because UI changes still renders Task 9's stub (`OtherItems`).

- [ ] **Step 8: Write `MockupsScreen`**

`packages/web/src/pages/visual/MockupsScreen.tsx`:
```tsx
import { parseData, type Anchor, type TypeItemRow } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { MockupFrame, type FramePin } from '../../components/MockupFrame';
import { Segmented } from '../../components/Segmented';
import { StatusMark } from '../../components/StatusMark';
import { AnchorForm } from './AnchorForm';
import { DataProblem } from './DataProblem';
import { OtherItems } from './OtherItems';
import { anchorsOn, toneOf } from './rows';
import type { ScreenProps } from './VisualScreen';

type Side = 'after' | 'before';
type Device = 'desktop' | 'mobile';
type Mockup = { after: string | null; before: string | null; route: string | null; files: string[]; kit: string | null };
type UiScreen = { row: TypeItemRow; mockup: Mockup | null; problems: string[] };

const ASK_FOR_MOCKUP = "Please draw the After mockup for this screen with the app's kit, and a Before from the current component if the screen exists today.";
const LIST = 'overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell [&>*+*]:border-t-[0.5px] [&>*+*]:border-separator';

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * What the screen needs from a UI item's data. Markup is read leniently: it's drawn even when it breaks a write rule
 * (written by hand, or by an older version), because the sandboxed frame, not the write check, is what keeps it
 * harmless. The rule problems are listed beside it.
 */
function readMockup(data: unknown): { mockup: Mockup | null; problems: string[] } {
  if (data === null || data === undefined) return { mockup: null, problems: [] };
  const parsed = parseData('mockups', data);
  if (parsed.ok) {
    const d = parsed.data;
    return { mockup: { after: text(d.after), before: text(d.before), route: d.location.route ?? null, files: d.location.files, kit: text(d.kit) }, problems: [] };
  }
  if (!isObject(data)) return { mockup: null, problems: parsed.problems };
  const location = isObject(data.location) ? data.location : {};
  const files = Array.isArray(location.files) ? location.files.filter((f): f is string => typeof f === 'string') : [];
  return { mockup: { after: text(data.after), before: text(data.before), route: text(location.route), files, kit: text(data.kit) }, problems: parsed.problems };
}

/** A short fingerprint of the markup, so the frame reloads when it's redrawn. */
function hashOf(markup: string): string {
  let h = 5381;
  for (let i = 0; i < markup.length; i++) h = (h * 33 + markup.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** "No mockup yet.": the item's own description, and a button that asks Claude to draw one. */
function NoMockup({ row, repo, project }: { row: TypeItemRow; repo: string; project: string }) {
  const qc = useQueryClient();
  const ask = useMutation({
    mutationFn: async () => {
      // Text you'd already typed for this thread goes along, after the request, and an option you'd picked stays picked.
      const message = [ASK_FOR_MOCKUP, row.draft?.text].filter(Boolean).join('\n\n');
      const optionId = row.draft?.optionId;
      await api.saveDraft(repo, project, row.threadId, { ...(optionId ? { optionId } : {}), text: message });
      return api.submit(repo, project, { scope: 'thread', threadId: row.threadId });
    },
    onSettled: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === repo && q.queryKey[2] === project }),
  });
  const working = row.status === 'with_claude';
  return (
    <div data-testid="no-mockup" className="mt-3 rounded-[10px] border-[0.5px] border-separator bg-cell px-4 py-3">
      <p className="text-[13px] font-medium">No mockup yet.</p>
      {row.body && (
        <div className="doc mt-2 text-[13px]">
          <Markdown remarkPlugins={[remarkGfm]}>{row.body}</Markdown>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={working || ask.isPending} onClick={() => ask.mutate()}>
          Ask Claude for a mockup
        </Button>
        {working && <span className="text-[12px] text-ink-3">Claude is working on it.</span>}
      </div>
      {(ask.data || ask.error) && (
        <p role="status" data-testid="send-notice" className={`mt-2 text-[12.5px] ${ask.error ? 'text-seal' : 'text-ink-2'}`}>
          {ask.error ? (ask.error as Error).message : ask.data?.message}
        </p>
      )}
    </div>
  );
}

/** The selected UI item: toolbar, the mockup, its pins, or "No mockup yet." */
function ScreenView({ screen, pins, repo, project, typeId }: { screen: UiScreen; pins: TypeItemRow[]; repo: string; project: string; typeId: string }) {
  const { row, mockup, problems } = screen;
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device>(() => (window.innerWidth < 768 ? 'mobile' : 'desktop'));
  const [side, setSide] = useState<Side>(mockup?.after || !mockup?.before ? 'after' : 'before');
  const [pinMode, setPinMode] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const hasMarkup = Boolean(mockup?.after || mockup?.before);
  const markup = side === 'after' ? mockup?.after : mockup?.before;
  const kit = useQuery({ queryKey: ['mockupKit', repo, project, row.id], queryFn: () => api.mockupKit(repo, project, row.id), enabled: hasMarkup });
  const sidePins = pins.filter((r) => (r.anchor?.side ?? 'after') === side);
  // A pin's marker colour is its thread's status, as StatusMark shows it.
  const framePins: FramePin[] = sidePins.map((r, i) => ({ id: r.id, selector: r.anchor?.ref ?? '', n: i + 1, tone: toneOf([r.status]) }));
  const thread = (threadId: string) => ({ to: '/p/$repo/$project/th/$thread', params: { repo, project, thread: threadId } }) as const;

  useEffect(() => {
    setPinMode(false);
    setMissing([]);
  }, [side]);
  useEffect(() => {
    if (!pinMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinMode]);

  const openPin = (id: string) => {
    const pin = sidePins.find((r) => r.id === id);
    if (pin) void navigate(thread(pin.threadId));
  };

  return (
    <section aria-label={row.title} className="min-w-0" data-testid="mockup-screen">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h3 className="text-[15px] font-semibold">{row.title}</h3>
        <StatusMark status={row.status} />
        <Link {...thread(row.threadId)} className="text-[12px] text-slate">
          Open thread
        </Link>
      </div>
      <p className="mt-0.5 text-[12.5px] text-ink-2">{row.summary}</p>
      {!hasMarkup && problems.length > 0 ? (
        <DataProblem title={row.title} problems={problems} data={row.data} threadId={row.threadId} repo={repo} project={project} />
      ) : !hasMarkup || !mockup ? (
        <NoMockup row={row} repo={repo} project={project} />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="w-[170px]">
              <Segmented<Device> label="Device" value={device} onChange={setDevice} options={[{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }]} />
            </div>
            <div className="w-[150px]">
              <Segmented<Side> label="Version" value={side} onChange={setSide} options={[{ value: 'before', label: 'Before', disabled: !mockup.before }, { value: 'after', label: 'After' }]} />
            </div>
            {pinMode ? (
              <Button onClick={() => setPinMode(false)}>Cancel</Button>
            ) : (
              <Button
                disabled={!markup}
                onClick={() => {
                  setAnchor(null);
                  setPinMode(true);
                }}
              >
                + Pin
              </Button>
            )}
          </div>
          <p data-testid="mockup-location" className="mt-2 break-all font-mono text-[11px] text-ink-3">
            {[mockup.route, mockup.files.join(', '), mockup.kit].filter(Boolean).join(' · ')}
          </p>
          {kit.data?.warnings.length ? (
            <ul data-testid="kit-warnings" className="mt-1 text-[11.5px] text-amber">
              {kit.data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {problems.length > 0 && (
            <ul data-testid="mockup-problems" className="mt-1 text-[11.5px] text-amber">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          {pinMode && (
            <p role="status" className="mt-2 text-[12.5px] text-ink-2">
              Click the part of the mockup you want to ask about.
            </p>
          )}
          {anchor && (
            <div className="mt-3">
              <AnchorForm repo={repo} project={project} type={typeId} anchor={anchor} onDone={() => setAnchor(null)} />
            </div>
          )}
          {markup ? (
            <div className="mt-3">
              <MockupFrame
                key={`${side}:${hashOf(markup)}`}
                repo={repo}
                project={project}
                itemId={row.id}
                side={side}
                device={device}
                pins={framePins}
                pinMode={pinMode}
                onPicked={(pick) => {
                  setPinMode(false);
                  setAnchor({ itemId: row.id, kind: 'element', ref: pick.selector, label: pick.text, side });
                }}
                onOpenPin={openPin}
                onMissingPins={setMissing}
              />
            </div>
          ) : (
            <NoMockup row={row} repo={repo} project={project} />
          )}
          {sidePins.length > 0 && (
            <section aria-label="Pins" className="mt-4">
              <h4 className="mb-1.5 ml-0.5 text-[12px] font-semibold text-ink-3">Pins</h4>
              <ol className={LIST}>
                {sidePins.map((r, i) => (
                  <li key={r.id} data-testid="mockup-pin" className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                    <span className="w-4 shrink-0 text-right font-mono text-[11px] text-ink-3">{i + 1}</span>
                    <StatusMark status={r.status} />
                    <Link {...thread(r.threadId)} className="min-w-0 flex-1 truncate font-medium">
                      {r.title}
                    </Link>
                    {missing.includes(r.id) && <span className="shrink-0 text-[11.5px] text-amber">Not in this version</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </section>
  );
}

/**
 * UI changes: the screens on the left (on top on phones), and one large mockup of the selected screen (`?item=`).
 * VisualScreen already shows the type's title and item count, so this starts with the screens.
 */
export function MockupsScreen({ repo, project, data, item }: ScreenProps) {
  const screens: UiScreen[] = data.items.filter((r) => !r.anchor).map((row) => ({ row, ...readMockup(row.data) }));
  const anchored = data.items.filter((r) => r.anchor);
  // A screen's pins: items of this type anchored to one of its elements, numbered in row order. A thin adapter over
  // anchorsOn, whose groups by element would number them by element instead.
  const pinsOn = (itemId: string) => {
    const on = new Set([...anchorsOn(anchored, itemId, 'element').values()].flat());
    return anchored.filter((r) => on.has(r));
  };
  const pins = screens.flatMap((s) => pinsOn(s.row.id));
  const selected = screens.find((s) => s.row.id === item) ?? screens.find((s) => s.mockup?.after || s.mockup?.before) ?? screens[0];
  // Other anchored items are listed below.
  const rest = selected ? anchored.filter((r) => !pins.includes(r)) : data.items;

  return (
    <div>
      {selected && (
        <div className="mt-4 grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[240px_minmax(0,1fr)]">
          <nav aria-label="Screens" className="min-w-0">
            <div className={LIST}>
              {screens.map((s) => (
                <Link
                  key={s.row.id}
                  to="/p/$repo/$project/t/$type"
                  params={{ repo, project, type: data.type.id }}
                  search={{ item: s.row.id }}
                  aria-current={s.row.id === selected.row.id ? 'page' : undefined}
                  data-testid="mockup-item"
                  className={`flex items-start gap-2.5 px-3 py-2.5 hover:bg-selection ${s.row.id === selected.row.id ? 'bg-selection' : ''}`}
                >
                  <span className="mt-[3px]">
                    <StatusMark status={s.row.status} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{s.row.title}</span>
                    {s.mockup?.route && <span className="block truncate font-mono text-[11px] text-ink-3">{s.mockup.route}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </nav>
          <ScreenView
            key={selected.row.id}
            screen={selected}
            pins={pinsOn(selected.row.id)}
            repo={repo}
            project={project}
            typeId={data.type.id}
          />
        </div>
      )}
      {rest.length > 0 && <OtherItems rows={rest} repo={repo} project={project} title="Other items" />}
    </div>
  );
}
```

- [ ] **Step 9: Route the UI changes screen to it**

In `packages/web/src/pages/visual/VisualScreen.tsx`, add:
```tsx
import { MockupsScreen } from './MockupsScreen';
```
and in `ScreenBody`, replace:
```tsx
    case 'database':
      return <DatabaseScreen {...p} />;
```
with:
```tsx
    case 'database':
      return <DatabaseScreen {...p} />;
    case 'mockups':
      return <MockupsScreen {...p} />;
```
`ScreenBody` passes on the `ScreenProps` that `VisualScreen` gets from `TypeView`, `item` (`?item=`) included. `MockupsScreen` imports `ScreenProps` as a type only, so there's no runtime import cycle with `VisualScreen`.

- [ ] **Step 10: Run the tests**

Run:
```bash
pnpm vitest run packages/web
pnpm typecheck
pnpm test
pnpm test:e2e mockups
pnpm test:e2e
```
Expected: PASS.
- **If the phone test finds sideways scrolling:** check that the frame's wrapper still has `overflow-hidden`. The iframe's layout box is 1280 px wide before scaling.
- **If "markup can't run script" sees an `open-pin`:** check `mockupCsp` and the iframe's `sandbox`. Don't loosen the test.

- [ ] **Step 11: Commit**

```bash
git add packages/web
git commit -m "feat(web): the UI changes screen with your app's kit, Before/After, Desktop/Mobile and pins" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The Flows screen

Flows show each flow the way it reads best:
- **User flows** are storyboards: one card per step, with the step's UI mockup as a thumbnail when that UI item has markup. Cards stack in one column under 768 px and use at most two columns below 1100 px (§16).
- **System flows** are sequence diagrams: lanes as columns, steps as numbered rows.
- **Both** gets a **Storyboard / Sequence** switch, with the same step numbers in each.

Clicking a step opens a step panel with **Ask about this step**, which starts a new item about that step. Steps with threads show a bubble.

**Files:**
- Create:
  - `packages/web/src/diagram/SequenceView.tsx`
  - `packages/web/src/diagram/SequenceView.test.tsx`
  - `packages/web/src/pages/visual/FlowsScreen.tsx`
  - `packages/web/e2e/flows.spec.ts`
- Modify: `packages/web/src/pages/visual/VisualScreen.tsx` (`ScreenBody` gains `case 'flows'`)
- Test: `packages/web/src/diagram/SequenceView.test.tsx`, `packages/web/e2e/flows.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 1 (`@dev-plumbing/core/schemas`): `FlowData`, `NodeStatus`, `parseData`.
  - From Task 6: `TypeItemRow` with `data`, `anchor` and `status`; `TypeEntry`.
  - From Task 9:
    - `export type ScreenProps = { repo: string; project: string; data: { type: TypeEntry; items: TypeItemRow[] }; item?: string }` from `VisualScreen.tsx`, where `item` is the type route's `?item=`. `VisualScreen` renders the type's h2 title and item count, then `ScreenBody`, a switch on `type.screen` whose cases read `case '<screen>':` / `return <XScreen {...p} />;`;
    - `AnchorForm({ repo, project, type, anchor, onDone })`, `DataProblem({ title?, problems, data, threadId?, repo, project })` and `OtherItems({ rows, repo, project, title? })`.
  - From Task 10: `type Tone = 'seal' | 'slate' | 'moss' | 'mist'` from `web/src/diagram/DiagramView.tsx`.
  - From Task 11 (`pages/visual/rows.ts`): `anchorsOn(anchored: TypeItemRow[], itemId: string, kind: 'node' | 'element' | 'step'): Map<string, TypeItemRow[]>` and `bubblesFrom(byRef: Map<string, TypeItemRow[]>): Record<string, { count: number; tone: Tone }>`, which colours each bubble with `toneOf`.
  - From Task 13: `MockupFrame({ repo, project, itemId, side, device, thumbnail })`, and `ScreenBody`'s `case 'mockups':` / `return <MockupsScreen {...p} />;`.
  - `api.projectHome` and `api.typeItems` (Plan 1).
- Produces:
  - `web/src/diagram/SequenceView.tsx`:
    ```ts
    export function SequenceView(p: { flow: FlowData; selected?: number | null; onSelect?: (n: number) => void; bubbles?: Record<number, { count: number; tone: Tone }> }): JSX.Element;
    ```
    - Renders `<figure data-testid="sequence">`, with one `<g data-testid="sequence-lane" data-lane={id} data-status={status}>` per lane and one `<g data-testid="sequence-step" data-step={n} data-shape="arrow" | "loop" | "note">` per step.
    - With `onSelect`, each step is `role="button"` with `aria-label` `Step ${n}: ${label}` and `aria-pressed`.
    - A bubble is `<g data-testid="sequence-bubble">`.
  - `web/src/pages/visual/FlowsScreen.tsx`:
    - `FlowsScreen(p: ScreenProps)`. It has no h2 of its own: `VisualScreen` shows the type's title and count, and each flow's title is an h3.
      - One `<section data-testid="flow" data-item={id}>` per drawn flow, with `data-selected="true"` when `p.item` (`?item=`) names it.
      - The step panel is `data-testid="step-panel"`.
    - `FlowView(p: { flow: FlowData; repo: string; project: string; selected?: number | null; onSelect?: (n: number) => void; bubbles?: Record<number, { count: number; tone: Tone }> })`.
      - A storyboard, a sequence, or both with a switch. Task 16 reuses it in the thread view.
      - Storyboard cards are `data-testid="story-step" data-step={n}` inside `data-testid="storyboard"`, with bubbles as `data-testid="step-bubble"`.
    - `type MockupRef = { typeId: string; title: string; threadId: string; hasAfter: boolean }`.
    - `useMockupItems(repo: string, project: string): Map<string, MockupRef>`: the project's UI items by id. Task 16 uses it too.

- [ ] **Step 1: Write the failing tests**

`packages/web/src/diagram/SequenceView.test.tsx`:
```tsx
import type { FlowData } from '@dev-plumbing/core/schemas';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SequenceView } from './SequenceView';

afterEach(cleanup);

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
const stepEl = (n: number) => screen.getAllByTestId('sequence-step').find((s) => s.getAttribute('data-step') === String(n))!;

describe('SequenceView', () => {
  it('draws one column per lane and one numbered row per step, in step order', () => {
    render(<SequenceView flow={flow} />);
    expect(screen.getAllByTestId('sequence-lane').map((l) => l.getAttribute('data-status'))).toEqual(['new', 'unchanged', 'external']);
    expect(screen.getAllByTestId('sequence-step').map((s) => s.getAttribute('data-step'))).toEqual(['1', '2', '3', '4']);
    expect(stepEl(1).textContent).toContain('1. Find subscriptions due soon');
    // 3 lanes of 160 with 24 between, 16 each side; 4 rows of 44 under 68 of headers, 16 below.
    expect(screen.getByTestId('sequence').querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 560 260');
  });

  it('draws a step between lanes as an arrow, a self-step as a loop, and a step without lanes as a note', () => {
    render(<SequenceView flow={flow} />);
    expect([1, 2, 3, 4].map((n) => stepEl(n).getAttribute('data-shape'))).toEqual(['arrow', 'loop', 'arrow', 'note']);
  });

  it('makes steps buttons when they can be selected', () => {
    const onSelect = vi.fn();
    render(<SequenceView flow={flow} onSelect={onSelect} selected={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'Step 1: Find subscriptions due soon' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Step 2: Skip paused customers' }), { key: 'Enter' });
    expect(onSelect.mock.calls).toEqual([[1], [2]]);
    expect(screen.getByRole('button', { name: 'Step 3: Send the reminder' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('has no buttons without onSelect, and shows bubbles with their counts', () => {
    render(<SequenceView flow={flow} bubbles={{ 2: { count: 3, tone: 'seal' } }} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByTestId('sequence-bubble').textContent).toBe('3');
  });
});
```

`packages/web/e2e/flows.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importProject, writeRawData, type TestItem } from './claude';
import { noSideScroll } from './env';

const ui: TestItem[] = [
  {
    key: 'settings',
    title: 'Restock settings card',
    summary: 'A card on the account page.',
    data: {
      location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] },
      kit: 'web',
      after: '<section class="rounded-card bg-brand p-4 text-white"><h2>Restock settings</h2><p>Remind me 3 days before.</p></section>',
    },
  },
  { key: 'confirm', title: 'Reorder confirmation', summary: 'Shown after the tap.', data: { location: { app: 'web', route: '/reorder', files: [] }, kit: 'web' } },
];
const user: TestItem = {
  key: 'reorder',
  title: 'Reorder from a reminder',
  summary: 'What the customer does.',
  data: {
    kind: 'user',
    steps: [
      { n: 1, label: 'Open restock settings', mockupId: 'ui-settings', systemNote: 'Reads remindDaysBefore' },
      { n: 2, label: 'Confirm the reorder', mockupId: 'ui-confirm' },
      { n: 3, label: 'See the order placed' },
    ],
  },
};
const system: TestItem = {
  key: 'daily-job',
  title: 'Daily reminder job',
  summary: 'From the job to the provider.',
  data: {
    kind: 'system',
    lanes: [
      { id: 'job', label: 'Reminder job', status: 'new' },
      { id: 'db', label: 'Database', status: 'unchanged' },
      { id: 'sms', label: 'SMS provider', status: 'external' },
    ],
    steps: [
      { n: 1, from: 'job', to: 'db', label: 'Find subscriptions due soon' },
      { n: 2, from: 'job', to: 'job', label: 'Skip paused customers' },
      { n: 3, from: 'job', to: 'sms', label: 'Send the reminder' },
    ],
  },
};
const both: TestItem = {
  key: 'one-tap',
  title: 'Reorder in one tap',
  summary: 'The tap, and what happens behind it.',
  data: {
    kind: 'both',
    lanes: [
      { id: 'app', label: 'Web app', status: 'changed' },
      { id: 'api', label: 'Orders API', status: 'new' },
    ],
    steps: [
      { n: 1, from: 'app', to: 'api', label: 'Tap Reorder', mockupId: 'ui-confirm' },
      { n: 2, from: 'api', to: 'app', label: 'Show the order' },
    ],
  },
};
const flowFor = (page: Page, title: string) => page.getByTestId('flow').filter({ has: page.getByRole('heading', { name: title }) });
const seqStep = (page: Page, title: string, n: number) => flowFor(page, title).locator(`[data-testid="sequence-step"][data-step="${n}"]`);

test('a user flow is a storyboard that shows the UI mockups', async ({ page }) => {
  const p = await importProject('flows-user', 'Flows user', { ui, flows: [user] });
  await page.goto(`${p.url}/t/flows`);
  const flow = flowFor(page, 'Reorder from a reminder');
  await expect(flow.getByText('User flow', { exact: true })).toBeVisible();
  const steps = flow.getByTestId('story-step');
  await expect(steps).toHaveCount(3);
  const first = steps.filter({ hasText: 'Open restock settings' });
  await expect(first.getByTestId('mockup-frame')).toHaveAttribute('src', /\/items\/ui-settings\/mockup\/after/);
  await expect(first.getByText('Reads remindDaysBefore')).toBeVisible();
  await expect(first.getByRole('link', { name: 'Restock settings card' })).toBeVisible();
  // A UI item without markup is a plain card that still links to its screen.
  const second = steps.filter({ hasText: 'Confirm the reorder' });
  await expect(second.getByTestId('mockup-frame')).toHaveCount(0);
  await expect(second.getByRole('link', { name: 'Reorder confirmation' })).toBeVisible();
  await expect(steps.filter({ hasText: 'See the order placed' }).getByRole('link')).toHaveCount(0);
});

test('a system flow is a sequence diagram with lanes, arrows and a self-step', async ({ page }) => {
  const p = await importProject('flows-system', 'Flows system', { flows: [system] });
  await page.goto(`${p.url}/t/flows`);
  const flow = flowFor(page, 'Daily reminder job');
  await expect(flow.getByText('System flow', { exact: true })).toBeVisible();
  await expect(flow.getByTestId('sequence-lane')).toHaveCount(3);
  await expect(seqStep(page, 'Daily reminder job', 1)).toHaveAttribute('data-shape', 'arrow');
  await expect(seqStep(page, 'Daily reminder job', 2)).toHaveAttribute('data-shape', 'loop');
  await expect(seqStep(page, 'Daily reminder job', 3)).toContainText('3. Send the reminder');
  await expect(flow.getByTestId('storyboard')).toHaveCount(0);
  // ?item= opens one flow.
  await page.goto(`${p.url}/t/flows?item=flows-daily-job`);
  await expect(flowFor(page, 'Daily reminder job')).toHaveAttribute('data-selected', 'true');
});

test('a flow that is both switches between storyboard and sequence, with the same numbers', async ({ page }) => {
  const p = await importProject('flows-both', 'Flows both', { ui, flows: [both] });
  await page.goto(`${p.url}/t/flows`);
  const flow = flowFor(page, 'Reorder in one tap');
  await expect(flow.getByText('User and system', { exact: true })).toBeVisible();
  await expect(flow.getByRole('tab', { name: 'Storyboard' })).toHaveAttribute('aria-selected', 'true');
  await expect(flow.getByTestId('story-step').filter({ hasText: 'Tap Reorder' })).toHaveAttribute('data-step', '1');
  await expect(flow.getByTestId('story-step').filter({ hasText: 'Show the order' })).toHaveAttribute('data-step', '2');
  await flow.getByRole('tab', { name: 'Sequence' }).click();
  await expect(flow.getByTestId('storyboard')).toHaveCount(0);
  await expect(seqStep(page, 'Reorder in one tap', 1)).toContainText('1. Tap Reorder');
  await expect(seqStep(page, 'Reorder in one tap', 2)).toContainText('2. Show the order');
  await flow.getByRole('tab', { name: 'Storyboard' }).click();
  await expect(flow.getByTestId('story-step')).toHaveCount(2);
});

test('asking about a step starts a thread, and the step shows a bubble', async ({ page }) => {
  const p = await importProject('flows-ask', 'Flows ask', { flows: [system] });
  await page.goto(`${p.url}/t/flows`);
  await flowFor(page, 'Daily reminder job').getByRole('button', { name: 'Step 2: Skip paused customers' }).click();
  const panel = flowFor(page, 'Daily reminder job').getByTestId('step-panel');
  await expect(panel).toContainText('Skip paused customers');
  await expect(panel).toContainText('Reminder job');
  await panel.getByRole('button', { name: 'Ask about this step' }).click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('About Step 2: Skip paused customers');
  await page.getByRole('textbox', { name: 'Your message' }).fill('Should paused customers get a note instead?');
  await page.getByRole('button', { name: 'Add and send' }).click();
  await expect(page).toHaveURL(/\/th\/t-flows-about-step-2-skip-paused-customers$/);
  await expect(page.getByTestId('thread-status')).toHaveText('With Claude');

  await page.goto(`${p.url}/t/flows`);
  await expect(seqStep(page, 'Daily reminder job', 2).getByTestId('sequence-bubble')).toHaveText('1');
  await expect(seqStep(page, 'Daily reminder job', 1).getByTestId('sequence-bubble')).toHaveCount(0);
  await flowFor(page, 'Daily reminder job').getByRole('button', { name: 'Step 2: Skip paused customers' }).click();
  await flowFor(page, 'Daily reminder job').getByTestId('step-panel').getByRole('link', { name: 'About Step 2: Skip paused customers' }).click();
  await expect(page).toHaveURL(/\/th\/t-flows-about-step-2-skip-paused-customers$/);
});

test("a flow that can't be drawn doesn't hide the others", async ({ page }) => {
  const p = await importProject('flows-broken', 'Flows broken', { ui, flows: [user, system] });
  await writeRawData(p, 'flows-reorder', { kind: 'user', steps: [] });
  await page.goto(`${p.url}/t/flows`);
  await expect(page.getByText("This item's drawing couldn't be shown")).toBeVisible();
  await expect(flowFor(page, 'Daily reminder job').getByTestId('sequence-step')).toHaveCount(3);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('storyboards stack and sequences fit the width', async ({ page }) => {
    const p = await importProject('flows-phone', 'Flows phone', { ui, flows: [user, system] });
    await page.goto(`${p.url}/t/flows`);
    await expect(page.getByTestId('sequence')).toBeVisible();
    const cards = page.getByTestId('story-step');
    await expect(cards).toHaveCount(3);
    const a = (await cards.nth(0).boundingBox())!;
    const b = (await cards.nth(1).boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    expect(await noSideScroll(page)).toEqual([]);
  });
});

test.describe('on a tablet', () => {
  test.use({ viewport: { width: 900, height: 1000 } });
  test('a storyboard uses at most two columns', async ({ page }) => {
    const p = await importProject('flows-tablet', 'Flows tablet', { ui, flows: [user] });
    await page.goto(`${p.url}/t/flows`);
    const cards = page.getByTestId('story-step');
    await expect(cards).toHaveCount(3);
    const [a, b, c] = await Promise.all([0, 1, 2].map(async (i) => (await cards.nth(i).boundingBox())!));
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(1);
    expect(c!.y).toBeGreaterThanOrEqual(Math.max(a!.y + a!.height, b!.y + b!.height));
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/web/src/diagram/SequenceView.test.tsx`
Expected: FAIL, because `./SequenceView` doesn't exist.

Run: `pnpm test:e2e flows`
Expected: FAIL. The Flows screen still shows Task 9's plain rows, so there's no `flow` section, `story-step` or `sequence`.

- [ ] **Step 3: Write `SequenceView`**

`packages/web/src/diagram/SequenceView.tsx`:
```tsx
import type { FlowData, NodeStatus } from '@dev-plumbing/core/schemas';
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import type { Tone } from './DiagramView';

// Layout, in SVG units. Lanes are columns; steps are rows under the lane headers, in step order.
const LANE_W = 160;
const GAP = 24;
const PAD = 16;
const HEAD_H = 32;
const TOP = PAD + HEAD_H + 20;
const ROW_H = 44;
const LOOP_W = 28;
/** Roughly one character of 12 px text, to cut labels that wouldn't fit. */
const CHAR_W = 6.5;

const STROKE: Record<NodeStatus, string> = { new: 'var(--moss)', changed: 'var(--amber)', unchanged: 'var(--mist)', external: 'var(--mist)' };

type Step = FlowData['steps'][number];
type Shape = { kind: 'arrow'; from: number; to: number } | { kind: 'loop'; x: number } | { kind: 'note' };

const clip = (text: string, room: number) => {
  const max = Math.max(4, Math.floor(room / CHAR_W));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * A system flow as a sequence diagram: one column per lane, one numbered row per step.
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
  const lanes = flow.lanes ?? [];
  const columns = Math.max(lanes.length, 1);
  const width = PAD * 2 + columns * LANE_W + (columns - 1) * GAP;
  const steps = [...flow.steps].sort((a, b) => a.n - b.n);
  const height = TOP + steps.length * ROW_H + PAD;
  const centre = new Map(lanes.map((l, i) => [l.id, PAD + i * (LANE_W + GAP) + LANE_W / 2]));

  const shapeOf = (s: Step): Shape => {
    const a = s.from === undefined ? undefined : centre.get(s.from);
    const b = s.to === undefined ? undefined : centre.get(s.to);
    if (a === undefined && b === undefined) return { kind: 'note' };
    if (a === undefined || b === undefined || a === b) return { kind: 'loop', x: a ?? b ?? PAD };
    return { kind: 'arrow', from: a, to: b };
  };

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
        style={{ maxWidth: width, touchAction: 'pinch-zoom' }}
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

        {lanes.map((l, i) => {
          const x = PAD + i * (LANE_W + GAP);
          const c = x + LANE_W / 2;
          return (
            <g key={l.id} data-testid="sequence-lane" data-lane={l.id} data-status={l.status}>
              <title>{l.label}</title>
              <line x1={c} y1={PAD + HEAD_H} x2={c} y2={height - PAD} strokeDasharray="4 4" style={{ stroke: 'var(--mist)' }} />
              <rect
                x={x}
                y={PAD}
                width={LANE_W}
                height={HEAD_H}
                rx={6}
                strokeDasharray={l.status === 'external' ? '4 3' : undefined}
                style={{ fill: 'var(--cell)', stroke: STROKE[l.status], strokeWidth: 1 }}
              />
              <text x={c} y={PAD + HEAD_H / 2 + 4} textAnchor="middle" fontSize={12.5} style={{ fill: 'var(--text)' }}>
                {clip(l.label, LANE_W - 16)}
              </text>
            </g>
          );
        })}

        {steps.map((s, k) => {
          const top = TOP + k * ROW_H;
          const y = top + 30;
          const shape = shapeOf(s);
          const on = selected === s.n;
          const line = { stroke: on ? 'var(--slate)' : 'var(--text-3)', strokeWidth: on ? 2 : 1, fill: 'none' };
          const marker = `url(#${uid}-${on ? 'selected' : 'plain'})`;
          const text = `${s.n}. ${s.label}`;
          const textStyle = { fill: shape.kind === 'note' ? 'var(--text-2)' : 'var(--text)', fontWeight: on ? 600 : 400 };
          let drawing: ReactNode;
          let start: { x: number; y: number };
          if (shape.kind === 'arrow') {
            const span = Math.abs(shape.to - shape.from);
            drawing = (
              <>
                <path d={`M${shape.from},${y} H${shape.to}`} markerEnd={marker} style={line} />
                <text x={Math.min(shape.from, shape.to) + span / 2} y={top + 18} textAnchor="middle" fontSize={12} style={textStyle}>
                  {clip(text, span + LANE_W - 24)}
                </text>
              </>
            );
            start = { x: shape.from + Math.sign(shape.to - shape.from) * 12, y };
          } else if (shape.kind === 'loop') {
            // The label goes on whichever side of the lane has more room.
            const right = width - PAD - (shape.x + LOOP_W + 6);
            const left = shape.x - PAD - 6;
            const onRight = right >= left;
            drawing = (
              <>
                <path d={`M${shape.x},${y - 8} h${LOOP_W} v16 h${-LOOP_W}`} markerEnd={marker} style={line} />
                <text x={onRight ? shape.x + LOOP_W + 6 : shape.x - 6} y={y + 4} textAnchor={onRight ? 'start' : 'end'} fontSize={12} style={textStyle}>
                  {clip(text, Math.max(right, left))}
                </text>
              </>
            );
            start = { x: shape.x, y: y - 8 };
          } else {
            drawing = (
              <text x={width / 2} y={y} textAnchor="middle" fontSize={12} style={textStyle}>
                {clip(text, width - PAD * 2)}
              </text>
            );
            start = { x: PAD + 8, y: y - 4 };
          }
          const bubble = bubbles?.[s.n];
          return (
            <g key={s.n} data-testid="sequence-step" data-step={s.n} data-shape={shape.kind} {...asButton(s, on)}>
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

Run: `pnpm vitest run packages/web/src/diagram/SequenceView.test.tsx`
Expected: PASS.

- [ ] **Step 4: Write the Flows screen**

`packages/web/src/pages/visual/FlowsScreen.tsx`:
```tsx
import { parseData, type FlowData, type TypeItemRow } from '@dev-plumbing/core/schemas';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { MockupFrame } from '../../components/MockupFrame';
import { Segmented } from '../../components/Segmented';
import { StatusMark } from '../../components/StatusMark';
import type { Tone } from '../../diagram/DiagramView';
import { SequenceView } from '../../diagram/SequenceView';
import { AnchorForm } from './AnchorForm';
import { DataProblem } from './DataProblem';
import { OtherItems } from './OtherItems';
import { anchorsOn, bubblesFrom } from './rows';
import type { ScreenProps } from './VisualScreen';

type Step = FlowData['steps'][number];
type Bubbles = Record<number, { count: number; tone: Tone }>;
/** A UI item a flow step can show: its type, title and thread, and whether it has After markup. */
export type MockupRef = { typeId: string; title: string; threadId: string; hasAfter: boolean };
type FlowViewProps = {
  flow: FlowData;
  repo: string;
  project: string;
  selected?: number | null;
  onSelect?: (n: number) => void;
  bubbles?: Bubbles;
};

const KIND_TAG: Record<FlowData['kind'], string> = { user: 'User flow', system: 'System flow', both: 'User and system' };
/** The step a pin is about. Step anchors keep the step number as text. */
const stepOf = (pin: TypeItemRow) => Number(pin.anchor?.ref);

/**
 * One bubble per step: how many threads are about it, in the colour of the most urgent one. A thin adapter over the
 * shared anchorsOn and bubblesFrom, which key by anchor.ref; steps key by number.
 */
function stepBubbles(itemId: string, pins: TypeItemRow[]): Bubbles {
  return Object.fromEntries(Object.entries(bubblesFrom(anchorsOn(pins, itemId, 'step'))).map(([ref, bubble]) => [Number(ref), bubble]));
}

/** The project's UI items by id. Storyboards and the thread view use it to find a step's mockup. */
export function useMockupItems(repo: string, project: string): Map<string, MockupRef> {
  const home = useQuery({ queryKey: ['projectHome', repo, project], queryFn: () => api.projectHome(repo, project) });
  const types = (home.data?.types ?? []).filter((t) => t.screen === 'mockups' && t.itemCount > 0);
  const lists = useQueries({
    queries: types.map((t) => ({ queryKey: ['typeItems', repo, project, t.id], queryFn: () => api.typeItems(repo, project, t.id) })),
  });
  const refs = new Map<string, MockupRef>();
  lists.forEach((q, i) => {
    for (const row of q.data?.items ?? []) {
      const parsed = parseData('mockups', row.data);
      refs.set(row.id, { typeId: types[i]!.id, title: row.title, threadId: row.threadId, hasAfter: parsed.ok && Boolean(parsed.data.after?.trim()) });
    }
  });
  return refs;
}

/** User flows: one card per step, with the step's After mockup as a thumbnail when it has one. */
function Storyboard({ flow, repo, project, selected = null, onSelect, bubbles }: FlowViewProps) {
  const mockups = useMockupItems(repo, project);
  const steps = [...flow.steps].sort((a, b) => a.n - b.n);
  // One column on a phone, at most two from 768 to 1099 px (§16), then as many cards of 220 px or more as fit.
  return (
    <ol data-testid="storyboard" className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 min-[1100px]:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
      {steps.map((s) => {
        const screen = s.mockupId ? mockups.get(s.mockupId) : undefined;
        const bubble = bubbles?.[s.n];
        const on = selected === s.n;
        const head = (
          <>
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[0.5px] border-ink-3 text-[11px] font-semibold text-ink-2">{s.n}</span>
            <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{s.label}</span>
            {bubble && (
              <span
                data-testid="step-bubble"
                className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-canvas"
                style={{ background: `var(--${bubble.tone})` }}
              >
                {bubble.count}
              </span>
            )}
          </>
        );
        return (
          <li
            key={s.n}
            data-testid="story-step"
            data-step={s.n}
            className={`min-w-0 rounded-[10px] border-[0.5px] bg-cell p-3 ${on ? 'border-slate' : 'border-separator'}`}
          >
            {onSelect ? (
              <button type="button" aria-pressed={on} aria-label={`Step ${s.n}: ${s.label}`} onClick={() => onSelect(s.n)} className="flex w-full items-start gap-2 text-left">
                {head}
              </button>
            ) : (
              <div className="flex items-start gap-2">{head}</div>
            )}
            {s.mockupId && screen?.hasAfter && (
              // The frame is drawn at phone width and scaled down; long screens are cut, not stretched.
              <div className="mt-2 max-h-[260px] overflow-hidden rounded-[8px] border-[0.5px] border-separator">
                <MockupFrame repo={repo} project={project} itemId={s.mockupId} side="after" device="mobile" thumbnail />
              </div>
            )}
            {s.mockupId && screen && (
              <Link
                to="/p/$repo/$project/t/$type"
                params={{ repo, project, type: screen.typeId }}
                search={{ item: s.mockupId }}
                className="mt-1.5 block truncate text-[12px] text-slate"
              >
                {screen.title}
              </Link>
            )}
            {s.systemNote && <p className="mt-1.5 text-[12px] text-ink-3">{s.systemNote}</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** A flow drawn for its kind: a storyboard, a sequence, or both with a switch. The numbers match in both. */
export function FlowView(p: FlowViewProps) {
  const [view, setView] = useState<'storyboard' | 'sequence'>('storyboard');
  const shown = p.flow.kind === 'both' ? view : p.flow.kind === 'system' ? 'sequence' : 'storyboard';
  return (
    <div data-testid="flow-view">
      {p.flow.kind === 'both' && (
        <div className="mb-3 max-w-xs">
          <Segmented
            label="Show the flow as"
            value={view}
            onChange={setView}
            options={[
              { value: 'storyboard', label: 'Storyboard' },
              { value: 'sequence', label: 'Sequence' },
            ]}
          />
        </div>
      )}
      {shown === 'sequence' ? <SequenceView flow={p.flow} selected={p.selected} onSelect={p.onSelect} bubbles={p.bubbles} /> : <Storyboard {...p} />}
    </div>
  );
}

function StepPanel({ row, flow, step, pins, typeId, repo, project }: { row: TypeItemRow; flow: FlowData; step: Step; pins: TypeItemRow[]; typeId: string; repo: string; project: string }) {
  const [asking, setAsking] = useState(false);
  const screen = useMockupItems(repo, project).get(step.mockupId ?? '');
  const lane = (id?: string) => (id === undefined ? undefined : (flow.lanes?.find((l) => l.id === id)?.label ?? id));
  const from = lane(step.from);
  const to = lane(step.to);
  const lanes = from && to && from !== to ? `${from} → ${to}` : (from ?? to);
  return (
    <div data-testid="step-panel" className="mt-3 border-l-2 border-separator pl-3">
      <p className="text-[11px] font-semibold text-ink-3">
        Step {step.n}
        {lanes ? ` · ${lanes}` : ''}
      </p>
      <p className="mt-0.5 text-[13.5px] font-semibold">{step.label}</p>
      {step.systemNote && <p className="mt-0.5 text-[12.5px] text-ink-3">{step.systemNote}</p>}
      {step.mockupId && screen && (
        <p className="mt-1 text-[12.5px]">
          <span className="text-ink-3">Screen </span>
          <Link to="/p/$repo/$project/t/$type" params={{ repo, project, type: screen.typeId }} search={{ item: step.mockupId }} className="text-slate">
            {screen.title}
          </Link>
        </p>
      )}
      {pins.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
          {pins.map((pin) => (
            <li key={pin.id} className="flex items-center gap-2">
              <StatusMark status={pin.status} />
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: pin.threadId }} className="min-w-0 truncate text-slate">
                {pin.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {asking ? (
        <AnchorForm
          repo={repo}
          project={project}
          type={typeId}
          anchor={{ itemId: row.id, kind: 'step', ref: String(step.n), label: `Step ${step.n}: ${step.label}` }}
          onDone={() => setAsking(false)}
        />
      ) : (
        <Button className="mt-3" onClick={() => setAsking(true)}>
          Ask about this step
        </Button>
      )}
    </div>
  );
}

function FlowSection({ row, flow, pins, typeId, repo, project, highlighted }: { row: TypeItemRow; flow: FlowData; pins: TypeItemRow[]; typeId: string; repo: string; project: string; highlighted: boolean }) {
  const [picked, setPicked] = useState<number | null>(null);
  const numbers = new Set(flow.steps.map((s) => s.n));
  const here = pins.filter((p) => numbers.has(stepOf(p)));
  // Claude may renumber or drop steps. Their threads stay listed, marked as gone.
  const gone = pins.filter((p) => !numbers.has(stepOf(p)));
  const step = flow.steps.find((s) => s.n === picked);
  return (
    <section
      id={`flow-${row.id}`}
      data-testid="flow"
      data-item={row.id}
      data-selected={highlighted ? 'true' : undefined}
      className={`mt-7 ${highlighted ? 'border-l-2 border-slate pl-3' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[15px] font-semibold">{row.title}</h3>
        <span className="text-[11.5px] text-ink-3">{KIND_TAG[flow.kind]}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px]">
          <StatusMark status={row.status} />
          <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: row.threadId }} className="text-slate">
            Open thread
          </Link>
        </span>
      </div>
      <p className="mt-0.5 text-[12.5px] text-ink-3">{row.summary}</p>
      <div className="mt-3">
        <FlowView flow={flow} repo={repo} project={project} selected={picked} onSelect={(n) => setPicked((cur) => (cur === n ? null : n))} bubbles={stepBubbles(row.id, here)} />
      </div>
      {step && (
        <StepPanel key={step.n} row={row} flow={flow} step={step} pins={here.filter((p) => stepOf(p) === step.n)} typeId={typeId} repo={repo} project={project} />
      )}
      {gone.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-[12.5px]">
          {gone.map((pin) => (
            <li key={pin.id} className="flex items-center gap-2">
              <StatusMark status={pin.status} />
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: pin.threadId }} className="min-w-0 truncate text-slate">
                {pin.title}
              </Link>
              <span className="shrink-0 text-[11.5px] text-ink-3">Not in this version</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Flows: each flow drawn for its kind, with a panel per step and bubbles for the threads about each step.
 * `item` (`?item=`) opens one flow. VisualScreen already shows the type's title and item count.
 */
export function FlowsScreen({ repo, project, data, item: target }: ScreenProps) {
  const { type, items } = data;
  const drawn: { row: TypeItemRow; flow: FlowData }[] = [];
  const broken: { row: TypeItemRow; problems: string[] }[] = [];
  const other: TypeItemRow[] = [];
  const pins: TypeItemRow[] = [];
  for (const row of items) {
    if (row.anchor?.kind === 'step') pins.push(row);
    else if (row.data === null) other.push(row);
    else {
      const parsed = parseData('flows', row.data);
      if (parsed.ok) drawn.push({ row, flow: parsed.data });
      else broken.push({ row, problems: parsed.problems });
    }
  }
  const drawnIds = new Set(drawn.map((d) => d.row.id));
  // A pin whose flow can't be drawn has nowhere to show, so it's listed with the other items.
  const unplaced = pins.filter((p) => !drawnIds.has(p.anchor!.itemId));

  // ?item= opens one flow: scroll to it. Its section is outlined.
  useEffect(() => {
    if (target) document.getElementById(`flow-${target}`)?.scrollIntoView({ block: 'start' });
  }, [target]);

  return (
    <div>
      {drawn.map(({ row, flow }) => (
        <FlowSection
          key={row.id}
          row={row}
          flow={flow}
          pins={pins.filter((p) => p.anchor!.itemId === row.id)}
          typeId={type.id}
          repo={repo}
          project={project}
          highlighted={row.id === target}
        />
      ))}
      {broken.map(({ row, problems }) => (
        <div key={row.id} className="mt-7">
          <DataProblem title={row.title} problems={problems} data={row.data} threadId={row.threadId} repo={repo} project={project} />
        </div>
      ))}
      {other.length + unplaced.length > 0 && <OtherItems rows={[...other, ...unplaced]} repo={repo} project={project} />}
    </div>
  );
}
```

- [ ] **Step 5: Route Flows to it**

In `packages/web/src/pages/visual/VisualScreen.tsx`, add:
```tsx
import { FlowsScreen } from './FlowsScreen';
```
and in `ScreenBody`, replace:
```tsx
    case 'mockups':
      return <MockupsScreen {...p} />;
```
with:
```tsx
    case 'mockups':
      return <MockupsScreen {...p} />;
    case 'flows':
      return <FlowsScreen {...p} />;
```
Until now `flows` fell through to `default`, which lists the items with `OtherItems`. `FlowsScreen` imports `ScreenProps` as a type only, so there's no runtime import cycle with `VisualScreen`.

- [ ] **Step 6: Run the tests**

Run:
```bash
pnpm vitest run packages/web/src/diagram/SequenceView.test.tsx
pnpm test:e2e flows
pnpm typecheck
pnpm test
pnpm test:e2e
```
Expected: PASS. The full e2e run includes Task 9's `visual.spec.ts`, which still passes: types without data keep their rows.

- [ ] **Step 7: Commit**

```bash
git add packages/web
git commit -m "feat(web): the Flows screen: storyboards, sequence diagrams, or both" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 15: The Phases timeline

**Phases & milestones** stays a list screen you can answer inline, and gains a timeline strip above the filter.
- **The strip:** one chip per phase, in phase order, each with its goal, how many "done when" checks it has, and how many items it includes. Clicking a chip shows its row and outlines it.
- **The rows:** each phase row shows its goal, its "done when" list, and links to its items.
- **Old phases:** a phase without valid data still lists as a normal row, and shows at the end of the strip as "Phase ?".

To link items by title, the type route's rows fill `itemRefs` for timeline types. Task 6 added the field and leaves it `{}`; this task fills it.

**Files:**
- Create:
  - `packages/web/src/pages/visual/TimelineStrip.tsx`
  - `packages/web/src/pages/visual/TimelineStrip.test.tsx`
  - `packages/web/e2e/phases.spec.ts`
- Modify:
  - `packages/core/src/store/projects.ts` (`loadTypeItems` fills `itemRefs` for timeline types)
  - `packages/web/src/pages/ListScreen.tsx` (the strip, phase details, the picked row)
- Test: `packages/core/test/projects.test.ts`, `packages/web/src/pages/visual/TimelineStrip.test.tsx`, `packages/web/e2e/phases.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `PhaseData`, `parseData`.
  - From Task 4: `TypeEntry.timeline`. Phases import after the other types, so a phase's `itemIds` point at existing items.
  - From Task 6: `TypeItemRow` with `data`, sorted by `data.order` for timeline types, and `itemRefs: Record<string, { title: string; threadId: string; typeTitle: string }>`, which Task 6 sets to `{}` on every row.
  - From Task 9: `TestItem.data` in `e2e/claude.ts`; list types render `ListScreen`.
- Produces:
  - `loadTypeItems` fills `TypeItemRow.itemRefs` for timeline types: every id in `data.itemIds` that exists. It stays `{}` for other types and for phases without valid data.
  - `TimelineStrip({ rows, selected, onSelect }: { rows: TypeItemRow[]; selected: string | null; onSelect: (itemId: string) => void })`: `<ol data-testid="timeline">`, with chips as `<button data-testid="phase-chip" aria-pressed>`.
  - `ListScreen` rows:
    - each row has `id="row-<itemId>"`;
    - the picked row has `data-selected="true"` and a slate outline;
    - timeline rows show `data-testid="phase-detail"`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/projects.test.ts`, change the `./fixtures` import that Task 4 added to `import { listType, pair, seedProject, TYPES } from './fixtures';`, and at the end of the file add:
```ts
describe('phase rows', () => {
  const phases = listType('phases', { title: 'Phases & milestones', order: 8, timeline: true });
  const types = [...TYPES, phases];
  const at = (dir: string): ProjectRef => ({ repo: 'acme', id: 'restock', dir });

  it('carry the title, thread and type of each item a phase lists', async () => {
    const build = pair('phases-build', { type: 'phases', title: 'Build the job' });
    build.item.data = { order: 1, goal: 'Reminders go out daily.', doneWhen: ['A reminder is sent'], itemIds: ['q1', 'architecture-job', 'gone'] };
    const dir = await seedProject({ pairs: [build, pair('q1', { title: 'Who gets reminders?' }), pair('architecture-job', { type: 'architecture', title: 'Daily job' })] });
    const r = await loadTypeItems(at(dir), types, 'phases');
    expect(r?.items[0]?.itemRefs).toEqual({
      q1: { title: 'Who gets reminders?', threadId: 't-q1', typeTitle: 'Questions' },
      'architecture-job': { title: 'Daily job', threadId: 't-architecture-job', typeTitle: 'Architecture' },
    });
  });

  it('are empty for phases without valid data, and for every other type', async () => {
    const old = pair('phases-old', { type: 'phases', title: 'Old phase' });
    const odd = pair('phases-odd', { type: 'phases', title: 'Odd phase' });
    odd.item.data = { order: 'first', itemIds: ['q1'] };
    const dir = await seedProject({ pairs: [old, odd, pair('q1', { title: 'Who gets reminders?' })] });
    expect((await loadTypeItems(at(dir), types, 'phases'))?.items.map((i) => i.itemRefs)).toEqual([{}, {}]);
    expect((await loadTypeItems(at(dir), types, 'questions'))?.items.map((i) => i.itemRefs)).toEqual([{}]);
  });
});
```

`packages/web/src/pages/visual/TimelineStrip.test.tsx`:
```tsx
import type { TypeItemRow } from '@dev-plumbing/core/schemas';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimelineStrip } from './TimelineStrip';

afterEach(cleanup);

function row(id: string, title: string, data: unknown): TypeItemRow {
  return {
    id,
    threadId: `t-${id}`,
    title,
    summary: '',
    status: 'idle',
    blocking: false,
    fields: {},
    messageCount: 0,
    latest: null,
    open: null,
    draft: null,
    decision: null,
    flagged: false,
    data,
    body: null,
    links: [],
    anchor: null,
    createdBy: 'import',
    checks: null,
    itemRefs: {},
  };
}

const rows = [
  row('phases-send', 'Send reminders', { order: 2, goal: 'Customers get a reminder.', doneWhen: ['The job runs daily', 'Every send is logged'], itemIds: ['questions-who', 'questions-days'] }),
  row('phases-polish', 'Polish', null),
  row('phases-table', 'Build the table', { order: 1, goal: 'Reminders can be stored.', doneWhen: ['The migration runs'], itemIds: ['questions-days'] }),
  row('phases-odd', 'Odd one', { order: 'soon' }),
];

describe('TimelineStrip', () => {
  it('shows phases in order, then items without phase data as Phase ?', () => {
    render(<TimelineStrip rows={rows} selected={null} onSelect={() => {}} />);
    const chips = screen.getAllByTestId('phase-chip').map((c) => c.textContent ?? '');
    expect(chips).toHaveLength(4);
    expect(chips[0]).toContain('Phase 1');
    expect(chips[0]).toContain('Build the table');
    expect(chips[0]).toContain('Done when: 1');
    expect(chips[0]).toContain('1 item');
    expect(chips[1]).toContain('Phase 2');
    expect(chips[1]).toContain('Done when: 2');
    expect(chips[1]).toContain('2 items');
    expect(chips[2]).toContain('Phase ?');
    expect(chips[2]).toContain('Polish');
    expect(chips[2]).toContain('No goal yet');
    expect(chips[3]).toContain('Phase ?');
    expect(chips[3]).toContain('Odd one');
  });

  it('reports the picked phase and marks it', () => {
    const onSelect = vi.fn();
    render(<TimelineStrip rows={rows} selected="phases-send" onSelect={onSelect} />);
    const chips = screen.getAllByTestId('phase-chip');
    fireEvent.click(chips[0]!);
    expect(onSelect).toHaveBeenCalledWith('phases-table');
    expect(chips[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(chips[0]!.getAttribute('aria-pressed')).toBe('false');
  });
});
```

`packages/web/e2e/phases.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { importProject, type TestItem } from './claude';
import { noSideScroll } from './env';

const questions: TestItem[] = [
  { key: 'who', title: 'Who gets reminders?', summary: 'Audience.' },
  { key: 'days', title: 'How many days before?', summary: 'Lead time.' },
];
// Out of order on purpose: 2, 1, 3. "Build the table" waits for an answer; the rest are idle.
const phases: TestItem[] = [
  {
    key: 'send',
    title: 'Send reminders',
    summary: 'The daily job sends them.',
    data: { order: 2, goal: 'Customers get a reminder before they run out.', doneWhen: ['The job runs daily', 'Every send is logged'], itemIds: ['questions-who', 'questions-days'] },
  },
  {
    key: 'table',
    title: 'Build the table',
    summary: 'Storage first.',
    data: { order: 1, goal: 'Reminders can be stored.', doneWhen: ['The migration runs'], itemIds: ['questions-days'] },
    message: { text: 'Is the table enough on its own for a first phase?' },
  },
  {
    key: 'reorder',
    title: 'Reorder in one tap',
    summary: 'The reorder link.',
    data: { order: 3, goal: 'One tap reorders the item.', doneWhen: ['The link works', 'Reorders are tracked', 'Support knows about it'], itemIds: [] },
  },
  { key: 'polish', title: 'Polish', summary: 'Written before phases had data.' },
];
const chips = (page: Page) => page.getByTestId('phase-chip');
const rowFor = (page: Page, title: string) => page.getByTestId('list-row').filter({ hasText: title });

test('the timeline shows phases in order with their counts, and phases without data last', async ({ page }) => {
  const p = await importProject('phases-order', 'Phases order', { questions, phases });
  await page.goto(`${p.url}/t/phases`);
  await expect(chips(page)).toHaveCount(4);
  await expect(chips(page).nth(0)).toContainText('Phase 1');
  await expect(chips(page).nth(0)).toContainText('Build the table');
  await expect(chips(page).nth(1)).toContainText('Phase 2');
  await expect(chips(page).nth(1)).toContainText('Send reminders');
  await expect(chips(page).nth(1)).toContainText('Done when: 2');
  await expect(chips(page).nth(1)).toContainText('2 items');
  await expect(chips(page).nth(2)).toContainText('Phase 3');
  await expect(chips(page).nth(2)).toContainText('Done when: 3');
  await expect(chips(page).nth(2)).toContainText('0 items');
  await expect(chips(page).nth(3)).toContainText('Phase ?');
  await expect(chips(page).nth(3)).toContainText('Polish');
  await expect(chips(page).nth(3)).toContainText('No goal yet');
  // On a wide screen the chips sit side by side.
  const a = (await chips(page).nth(0).boundingBox())!;
  const b = (await chips(page).nth(1).boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByTestId('list-row').first()).toContainText('Build the table');
  await expect(page.getByTestId('list-row').last()).toContainText('Polish');
});

test("a phase row shows its goal, done-when and items, and an item link opens that item's thread", async ({ page }) => {
  const p = await importProject('phases-links', 'Phases links', { questions, phases });
  await page.goto(`${p.url}/t/phases`);
  const detail = rowFor(page, 'Build the table').getByTestId('phase-detail');
  await expect(detail).toContainText('Reminders can be stored.');
  await expect(detail).toContainText('The migration runs');
  await detail.getByRole('link', { name: 'Questions › How many days before?' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/th/t-questions-days$`));
});

test('a click on a chip shows its row and outlines it', async ({ page }) => {
  const p = await importProject('phases-pick', 'Phases pick', { questions, phases });
  await page.goto(`${p.url}/t/phases`);
  await expect(page.getByRole('tab', { name: 'Needs you · 1' })).toHaveAttribute('aria-selected', 'true');
  await chips(page).filter({ hasText: 'Reorder in one tap' }).click();
  // Its row is idle, so the list switches to All to show it.
  await expect(page.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  const row = rowFor(page, 'Reorder in one tap');
  await expect(row).toHaveAttribute('data-selected', 'true');
  await expect(row).toHaveCSS('outline-style', 'solid');
  await expect(row).toBeInViewport();
  await expect(rowFor(page, 'Send reminders')).not.toHaveAttribute('data-selected', 'true');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('the timeline stacks', async ({ page }) => {
    const p = await importProject('phases-phone', 'Phases phone', { questions, phases });
    await page.goto(`${p.url}/t/phases`);
    await expect(chips(page)).toHaveCount(4);
    const a = (await chips(page).nth(0).boundingBox())!;
    const b = (await chips(page).nth(1).boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1);
    expect(await noSideScroll(page)).toEqual([]);
  });
});

test.describe('on a tablet', () => {
  test.use({ viewport: { width: 900, height: 1000 } });
  test('the timeline uses at most two columns', async ({ page }) => {
    const p = await importProject('phases-tablet', 'Phases tablet', { questions, phases });
    await page.goto(`${p.url}/t/phases`);
    await expect(chips(page)).toHaveCount(4);
    const [a, b, c] = await Promise.all([0, 1, 2].map(async (i) => (await chips(page).nth(i).boundingBox())!));
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(1);
    expect(c!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
    expect(Math.abs(a!.x - c!.x)).toBeLessThan(1);
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/projects.test.ts packages/web/src/pages/visual/TimelineStrip.test.tsx`
Expected: FAIL:
- "carry the title, thread and type of each item a phase lists", because Task 6 leaves `itemRefs` as `{}` on every row (the "are empty" test already passes);
- `TimelineStrip.test.tsx`, because `./TimelineStrip` doesn't exist.

Run: `pnpm test:e2e phases`
Expected: FAIL, because there's no `phase-chip`.

- [ ] **Step 3: Rows carry the items each phase lists**

`TypeItemRow.itemRefs` already exists (Task 6), so `schemas/views.ts` doesn't change.

In `packages/core/src/store/projects.ts` (Task 6 already imports `parseData` from `'../schemas'`), in `loadTypeItems`, right after the line `const { values: items } = await readItems(ref.dir);`, add:
```ts
  // Timeline types: the items each phase lists, so the list can link to them by title.
  const itemById = new Map(items.map((x) => [x.id, x]));
  const typeTitle = new Map(types.map((t) => [t.id, t.title]));
  const itemRefsOf = (data: unknown): TypeItemRow['itemRefs'] => {
    if (!type.timeline) return {};
    const phase = parseData('timeline', data);
    if (!phase.ok) return {};
    const refs: TypeItemRow['itemRefs'] = {};
    for (const id of phase.data.itemIds) {
      const target = itemById.get(id);
      if (target) refs[id] = { title: target.title, threadId: target.threadId, typeTitle: typeTitle.get(target.type) ?? target.type };
    }
    return refs;
  };
```
Then, in the row object that the `.map((i, n): TypeItemRow => …)` returns, replace Task 6's last two lines (indented 6 spaces):
```ts
      // Timeline types fill this in Task 15 (the items each phase lists).
      itemRefs: {},
```
with:
```ts
      itemRefs: itemRefsOf(i.data),
```

Run: `pnpm vitest run packages/core/test/projects.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the strip**

`packages/web/src/pages/visual/TimelineStrip.tsx`:
```tsx
import { parseData, type PhaseData, type TypeItemRow } from '@dev-plumbing/core/schemas';
import { StatusMark } from '../../components/StatusMark';

/** Phases in order, then the items without valid phase data, which show as "Phase ?". */
function phaseChips(rows: TypeItemRow[]): { row: TypeItemRow; phase: PhaseData | null }[] {
  const chips = rows.map((row) => {
    const r = parseData('timeline', row.data);
    return { row, phase: r.ok ? r.data : null };
  });
  const placed = chips.filter((c) => c.phase).sort((a, b) => a.phase!.order - b.phase!.order);
  return [...placed, ...chips.filter((c) => !c.phase)];
}

/**
 * Phases & milestones at a glance: one chip per phase, stacked on a phone, at most two side by side from 768 to
 * 1099 px (§16), and as many as fit on a wider screen.
 */
export function TimelineStrip({ rows, selected, onSelect }: { rows: TypeItemRow[]; selected: string | null; onSelect: (itemId: string) => void }) {
  const chips = phaseChips(rows);
  if (!chips.length) return null;
  return (
    <ol aria-label="Timeline" data-testid="timeline" className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 min-[1100px]:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
      {chips.map(({ row, phase }) => {
        const on = selected === row.id;
        return (
          <li key={row.id} className="min-w-0">
            <button
              type="button"
              data-testid="phase-chip"
              aria-pressed={on}
              onClick={() => onSelect(row.id)}
              className={`flex h-full w-full flex-col items-start rounded-[10px] border-[0.5px] bg-cell px-3 py-2 text-left ${on ? 'border-slate' : 'border-separator'}`}
            >
              <span className="flex w-full items-center gap-2 text-[11px] text-ink-3">
                {phase ? `Phase ${phase.order}` : 'Phase ?'}
                <span className="ml-auto">
                  <StatusMark status={row.status} />
                </span>
              </span>
              <span className="mt-0.5 text-[13px] font-semibold leading-snug">{row.title}</span>
              {phase ? (
                <>
                  <span className="mt-0.5 line-clamp-2 text-[12px] text-ink-2">{phase.goal}</span>
                  <span className="mt-1.5 text-[11px] text-ink-3">
                    Done when: {phase.doneWhen.length} · {phase.itemIds.length} item{phase.itemIds.length === 1 ? '' : 's'}
                  </span>
                </>
              ) : (
                <span className="mt-0.5 text-[12px] text-ink-3">No goal yet</span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 5: Show the strip and the phase details in the list**

Replace `packages/web/src/pages/ListScreen.tsx` with:
```tsx
import { parseData, type DisplayStatus, type SubmitResponse, type TypeEntry, type TypeItemRow } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { AnswerForm } from '../components/AnswerForm';
import { Button } from '../components/Button';
import { Group } from '../components/GroupedList';
import { Segmented } from '../components/Segmented';
import { StatusMark } from '../components/StatusMark';
import { AddItemForm } from './AddItemForm';
import { TimelineStrip } from './visual/TimelineStrip';

type Filter = 'needs' | 'claude' | 'resolved' | 'all';
const STATUS_TEXT: Record<DisplayStatus, string> = { your_turn: 'your turn', draft: 'draft', with_claude: 'with Claude', resolved: 'resolved', parked: 'parked', idle: '' };
const RISK: Record<string, string> = { critical: 'text-seal', high: 'text-seal', medium: 'text-amber', low: 'text-ochre' };
const KNOWN = ['blocking', 'default', 'severity', 'likelihood', 'effort'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
/** The row picked on the timeline: a thin slate outline, inset so the group's rounded corners don't clip it. */
const PICKED = 'outline-1 -outline-offset-1 outline-slate';

function FieldTags({ row }: { row: TypeItemRow }) {
  const f = row.fields;
  const parts: ReactNode[] = [];
  if (f.blocking === 'false' && f.default) parts.push(<span key="default">not blocking · default {f.default}</span>);
  if (f.severity) {
    parts.push(
      <span key="severity" className={`font-semibold ${RISK[f.severity.toLowerCase()] ?? 'text-ink-3'}`}>
        {cap(f.severity)}
        {f.likelihood ? ` · ${f.likelihood.toLowerCase()}` : ''}
      </span>,
    );
  }
  if (f.effort) parts.push(<span key="effort">Effort {f.effort}</span>);
  for (const [k, v] of Object.entries(f)) if (!KNOWN.includes(k)) parts.push(<span key={k}>{k} {v}</span>);
  return parts.length ? <span className="flex flex-wrap gap-x-2 text-[11px] text-ink-3">{parts}</span> : null;
}

/** A phase's goal, its "done when" list and the items it includes. An id with no item any more shows as plain text. */
function PhaseDetail({ row, repo, project }: { row: TypeItemRow; repo: string; project: string }) {
  const parsed = parseData('timeline', row.data);
  if (!parsed.ok) return null;
  const phase = parsed.data;
  return (
    <div className="mt-1.5 text-[12.5px]" data-testid="phase-detail">
      <p>
        <span className="text-[11px] font-semibold text-ink-3">Goal </span>
        {phase.goal}
      </p>
      <p className="mt-1 text-[11px] font-semibold text-ink-3">Done when</p>
      <ul className="ml-4 list-disc text-ink-2">
        {phase.doneWhen.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
      {phase.itemIds.length > 0 && (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-[11px] font-semibold text-ink-3">Items</span>
          {phase.itemIds.map((id) => {
            const ref = row.itemRefs[id];
            return ref ? (
              <Link key={id} to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: ref.threadId }} className="text-slate">
                {ref.typeTitle} › {ref.title}
              </Link>
            ) : (
              <span key={id} className="font-mono text-[11.5px] text-ink-3">
                {id}
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}

function ListRow({
  row,
  type,
  repo,
  project,
  picked,
  onSent,
}: {
  row: TypeItemRow;
  type: TypeEntry;
  repo: string;
  project: string;
  picked: boolean;
  onSent: (r: SubmitResponse) => void;
}) {
  const thread = { to: '/p/$repo/$project/th/$thread', params: { repo, project, thread: row.threadId } } as const;
  if (row.status === 'resolved' || row.status === 'parked') {
    return (
      <Link
        {...thread}
        id={`row-${row.id}`}
        data-selected={picked ? 'true' : undefined}
        className={`flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-selection ${picked ? PICKED : ''}`}
        data-testid="list-row"
      >
        <span className="text-ink-3">▸</span>
        <span className="font-medium">{row.title}</span>
        {row.decision && <span className="min-w-0 truncate text-ink-2">→ {row.decision}</span>}
        <span className="ml-auto shrink-0">
          <StatusMark status={row.status} />
        </span>
      </Link>
    );
  }
  const answerable = row.status !== 'with_claude' && (row.open || type.answerPresets.length > 0 || row.messageCount > 0);
  return (
    <div id={`row-${row.id}`} data-selected={picked ? 'true' : undefined} className={`px-3 py-3 ${picked ? PICKED : ''}`} data-testid="list-row">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <StatusMark status={row.status} />
        {row.blocking && <span className="text-[10.5px] font-semibold text-seal">BLOCKING</span>}
        <span className="text-[13.5px] font-semibold">{row.title}</span>
        <FieldTags row={row} />
        <span className="ml-auto text-[11.5px] text-ink-3">{STATUS_TEXT[row.status]}</span>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-3">
        {row.summary}
        {row.flagged ? <span className="text-amber"> · may need another look</span> : null}
      </p>
      {type.timeline && <PhaseDetail row={row} repo={repo} project={project} />}
      {row.latest && (
        <p className="mt-1.5 text-[12.5px] text-ink-2">
          <span className="text-[11px] font-semibold text-ink-3">{row.latest.author === 'claude' ? 'Claude' : row.latest.author === 'you' ? 'You' : ''} · </span>
          {row.latest.text}
        </p>
      )}
      {answerable && (
        <div className="mt-2">
          <AnswerForm repo={repo} project={project} threadId={row.threadId} open={row.open} presets={type.answerPresets} defaultValue={row.fields.default} draft={row.draft} compact onSent={onSent} />
        </div>
      )}
      {row.fields.blocking === 'false' && row.fields.default && <p className="mt-1 text-[11.5px] text-ink-3">If you don't answer, the plan uses {row.fields.default}.</p>}
      <Link {...thread} className="mt-1.5 inline-block text-[12px] text-slate">
        Open thread ({row.messageCount} message{row.messageCount === 1 ? '' : 's'}) →
      </Link>
    </div>
  );
}

export function ListScreen({ repo, project, data }: { repo: string; project: string; data: { type: TypeEntry; items: TypeItemRow[] } }) {
  const { type, items } = data;
  const needs = items.filter((i) => i.status === 'your_turn' || i.status === 'draft');
  const withClaude = items.filter((i) => i.status === 'with_claude');
  const done = items.filter((i) => i.status === 'resolved' || i.status === 'parked');
  const [filter, setFilterState] = useState<Filter>(needs.length ? 'needs' : 'all');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const setFilter = (f: Filter) => {
    setFilterState(f);
    setNotice(null);
  };
  const shown = filter === 'needs' ? needs : filter === 'claude' ? withClaude : filter === 'resolved' ? done : items;
  const blockingOpen = items.filter((i) => i.blocking && i.status !== 'resolved' && i.status !== 'parked').length;
  /** A timeline chip picks its row. A row the filter hides is shown by switching to All. */
  const pick = (itemId: string) => {
    setPicked(itemId);
    if (!shown.some((r) => r.id === itemId)) setFilter('all');
  };
  // Bring the picked row into view, after any filter change has rendered it.
  useEffect(() => {
    if (picked) document.getElementById(`row-${picked}`)?.scrollIntoView({ block: 'center' });
  }, [picked, filter]);

  return (
    <div>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[20px] font-semibold">{type.title}</h2>
        <span className="text-[12px] text-ink-3">
          {items.length}
          {type.fields.includes('blocking') ? ` · ${blockingOpen} blocking open` : ''}
        </span>
        {type.addLabel && !adding && (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            + {type.addLabel}
          </Button>
        )}
      </header>
      {notice && (
        <p role="status" data-testid="send-notice" className="mt-3 text-[12.5px] text-ink-2">
          {notice}
        </p>
      )}
      {adding && <AddItemForm repo={repo} project={project} type={type} onDone={() => setAdding(false)} />}
      {type.timeline && <TimelineStrip rows={items} selected={picked} onSelect={pick} />}
      <div className="mt-3 max-w-lg">
        <Segmented<Filter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'needs', label: `Needs you · ${needs.length}` },
            { value: 'claude', label: `With Claude · ${withClaude.length}` },
            { value: 'resolved', label: `Resolved · ${done.length}` },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {shown.length ? (
        <Group>
          {shown.map((row) => (
            <ListRow key={row.id} row={row} type={type} repo={repo} project={project} picked={row.id === picked} onSent={(r) => setNotice(r.message)} />
          ))}
        </Group>
      ) : (
        <p className="mt-6 text-[13px] text-ink-3">{filter === 'needs' ? 'Nothing needs you right now.' : 'Nothing here.'}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run:
```bash
pnpm vitest run packages/core/test/projects.test.ts packages/web/src/pages/visual/TimelineStrip.test.tsx
pnpm typecheck
```

Then run:
```bash
pnpm test
pnpm test:e2e phases
pnpm test:e2e
```
Expected: PASS, including Plan 2's `list.spec.ts`. Questions isn't a timeline type, so its rows are unchanged.

- [ ] **Step 7: Commit**

```bash
git add packages/core packages/web
git commit -m "feat(web): Phases & milestones gains a timeline strip" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 16: The thread view draws its item

The thread view stops saying the view arrives later. Instead:
- **The item, drawn:** the item card draws its item (diagram, table, mockup, flow or phase) under its details, and folds it with the card.
- **"On":** an item started from a pin says what it's about, with a link back to that drawing.
- **Proposed changes:** when one of Claude's options changes a drawing, "What changes if you accept" lists what changes in words, with **View proposed** to draw the new version before you accept.

**Files:**
- Create:
  - `packages/web/src/pages/visual/ItemDataView.tsx`
  - `packages/web/e2e/visual-thread.spec.ts`
- Modify:
  - `packages/web/src/pages/ItemCard.tsx` (the drawing, and the "On" row)
  - `packages/web/src/components/AnswerForm.tsx` (data previews)
- Test: `packages/web/e2e/visual-thread.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `dataKindOf`, `parseData`, `DataKind`, `MockupData`.
  - From Task 6:
    - `ThreadDetail.checks`, `ThreadDetail.anchorParent` and `ThreadDetail.type.timeline`;
    - `ChangePreview.items[].data?: { kind: DataKind; summary: string[]; after: unknown }`, whose summary for one added box reads "1 box added", and for a redrawn After mockup "After mockup redrawn";
    - `DataChecks`.
  - From Task 7: `POST …/items` with `anchor`.
  - From Task 9: `DataProblem({ title?, problems, data, threadId?, repo, project })`, whose `title` and `threadId` are optional (the thread view leaves both out), and `writeRawData` in `e2e/claude.ts`.
  - From Task 10: `DiagramView` (`compact`; `data-testid="diagram-node"` with `data-node`).
  - From Task 12: `TableCard(p: { data: TableDiff; checks: DataChecks | null; row?: TypeItemRow; repo: string; project: string })`, exported from `DatabaseScreen.tsx`, `data-testid="table-card"`. `row` is optional; the thread view leaves it out.
  - From Task 13: `MockupFrame`, with `proposal?: { threadId: string; optionId: string }`, which loads `proposalMockupUrl(repo, id, threadId, optionId, side)` (Task 8's `GET …/threads/:threadId/options/:optionId/mockup/:side`).
  - From Task 14: `FlowView` and `useMockupItems` from `FlowsScreen.tsx`.
- Produces:
  - `ItemDataView(p: { kind: DataKind; data: unknown; checks: DataChecks | null; repo: string; project: string; itemId: string; compact?: boolean; proposal?: { threadId: string; optionId: string } })`:
    - diagram: `DiagramView compact`, with `checks.nodes` only when `checks.kind === 'diagram' && checks.checked`;
    - database: `TableCard` without a `row`;
    - mockups: `MockupFrame` (after, desktop, no pins) plus "Open in UI changes" (`data-testid="mockup-view"`). With `proposal`, the frame shows the mockup that option proposes (`MockupFrame proposal`), because a proposal isn't stored until it's accepted. With `compact` (a preview), "Open in UI changes" is left out, because that screen shows the saved mockup;
    - flows: `FlowView`;
    - timeline: the goal and the done-when list (`data-testid="phase-view"`);
    - data that doesn't parse: `DataProblem`.
  - `ItemCard`:
    - the drawing in `data-testid="item-drawing"`;
    - an "On" row linking to `/t/<typeId>?item=<itemId>` titled `<parent title> › <anchor label>`.
  - `AnswerForm`: preview items with data render as `data-testid="data-preview"`, with a **View proposed** / **Hide proposed** toggle. For a mockups item, View proposed passes `proposal={{ threadId, optionId }}` (the thread and the picked option), so the frame shows the proposed mockup.

- [ ] **Step 1: Write the failing e2e tests**

`packages/web/e2e/visual-thread.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { api, asClaude, importProject, writeRawData, type TestItem } from './claude';

const diagram = {
  kind: 'system',
  groups: [
    { id: 'web', label: 'apps/web' },
    { id: 'jobs', label: 'packages/jobs' },
  ],
  nodes: [
    { id: 'page', label: 'Reminders page', group: 'web', status: 'new' },
    { id: 'worker', label: 'Reminder worker', group: 'jobs', status: 'new' },
    { id: 'sms', label: 'SMS provider', status: 'external' },
  ],
  edges: [
    { id: 'page-worker', from: 'page', to: 'worker' },
    { id: 'worker-sms', from: 'worker', to: 'sms', label: 'send' },
  ],
};
const system: TestItem = { key: 'system', title: 'Restock system', summary: 'The parts that send reminders.', data: diagram };

test("an item's thread draws it, and folds it with the card", async ({ page }) => {
  const p = await importProject('vt-diagram', 'Visual thread diagram', { architecture: [system] });
  await page.goto(`${p.url}/th/t-architecture-system`);
  const drawing = page.getByTestId('item-drawing');
  await expect(drawing.getByTestId('diagram-node')).toHaveCount(3);
  await expect(drawing.locator('[data-testid="diagram-node"][data-node="sms"]')).toHaveAttribute('data-status', 'external');
  await expect(page.getByText(/arrives in a later update/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Collapse' }).click();
  await expect(page.getByTestId('item-drawing')).toHaveCount(0);
});

test("a pin's thread says what it's on, and links back to the drawing", async ({ page }) => {
  const p = await importProject('vt-pin', 'Visual thread pin', { architecture: [system] });
  const added = await api(`/api/projects/${p.repo}/${p.project}/items`, 'POST', {
    type: 'architecture',
    title: 'Why a separate worker?',
    text: 'Could the API send them itself?',
    anchor: { itemId: 'architecture-system', kind: 'node', ref: 'worker', label: 'Reminder worker' },
  });
  await page.goto(`${p.url}/th/${added.threadId}`);
  const card = page.getByRole('region', { name: 'Item' });
  await expect(card.getByText('On', { exact: true })).toBeVisible();
  await card.getByRole('link', { name: 'Restock system › Reminder worker' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/t/architecture\\?item=architecture-system$`));
  await expect(page.locator('[data-testid="diagram-node"][data-node="worker"]').first()).toBeVisible();
});

test('a proposed drawing change is described, can be drawn, and applies when accepted', async ({ page }) => {
  const p = await importProject('vt-option', 'Visual thread option', { architecture: [system] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/threads/t-architecture-system/draft`, 'PUT', { text: 'Do we need a cache in front of the provider?' });
  await api(`${P}/submit`, 'POST', { scope: 'thread', threadId: 't-architecture-system' });
  await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-visual-thread', timeoutSeconds: 0 });
  const withCache = { ...diagram, nodes: [...diagram.nodes, { id: 'cache', label: 'Send cache', group: 'jobs', status: 'new' }] };
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: 't-architecture-system',
    text: 'A small cache stops a second run from sending twice.',
    options: [
      { id: 'cache', label: 'Add a send cache', change: { items: [{ itemId: 'architecture-system', patch: { data: withCache } }] } },
      { id: 'none', label: 'No cache' },
    ],
    recommended: 'cache',
  });

  await page.goto(`${p.url}/th/t-architecture-system`);
  await page.getByRole('radio', { name: /Add a send cache/ }).check();
  const preview = page.getByRole('region', { name: 'What changes if you accept' });
  await expect(preview.getByTestId('data-preview')).toContainText('1 box added');
  await preview.getByRole('button', { name: 'View proposed' }).click();
  await expect(preview.locator('[data-testid="diagram-node"][data-node="cache"]')).toBeVisible();
  // Until it's accepted, the item's own drawing doesn't have it.
  await expect(page.getByTestId('item-drawing').locator('[data-node="cache"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByTestId('send-notice')).toHaveText('Applied. 1 thread resolved.');
  await expect(page.getByTestId('item-drawing').locator('[data-testid="diagram-node"][data-node="cache"]')).toBeVisible();
  await page.goto(`${p.url}/t/architecture`);
  await expect(page.locator('[data-testid="diagram-node"][data-node="cache"]')).toBeVisible();
  await page.goto(`${p.url}/d/draft`);
  await page.getByRole('tab', { name: 'Changes' }).click();
  const changes = page.getByTestId('changes');
  await expect(changes).toContainText('Accepted');
  await expect(changes).toContainText('Restock system: Add a send cache');
});

test('View proposed draws the mockup an option proposes, not the saved one', async ({ page }) => {
  const settings = { location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] }, kit: 'web', after: '<section class="rounded-card p-4"><h2>Restock settings</h2></section>' };
  const card: TestItem = { key: 'settings', title: 'Restock settings card', summary: 'On the account page.', data: settings };
  const p = await importProject('vt-mockup-option', 'Visual thread mockup option', { ui: [card] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/threads/t-ui-settings/draft`, 'PUT', { text: 'Can people choose how many days before?' });
  await api(`${P}/submit`, 'POST', { scope: 'thread', threadId: 't-ui-settings' });
  await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-visual-thread-mockup', timeoutSeconds: 0 });
  const withDays = { ...settings, after: '<section class="rounded-card p-4"><h2>Restock settings</h2><label>Days before <input value="3"></label></section>' };
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: 't-ui-settings',
    text: 'A days field fits under the heading.',
    options: [
      { id: 'days', label: 'Add a days field', change: { items: [{ itemId: 'ui-settings', patch: { data: withDays } }] } },
      { id: 'keep', label: 'Keep it as it is' },
    ],
    recommended: 'days',
  });

  await page.goto(`${p.url}/th/t-ui-settings`);
  await page.getByRole('radio', { name: /Add a days field/ }).check();
  const preview = page.getByRole('region', { name: 'What changes if you accept' });
  await expect(preview.getByTestId('data-preview')).toContainText('After mockup redrawn');
  await preview.getByRole('button', { name: 'View proposed' }).click();
  await expect(preview.getByTestId('mockup-frame')).toHaveAttribute('src', /\/options\/days\/mockup\/after/);
  // The item's own drawing still loads the saved mockup.
  await expect(page.getByTestId('item-drawing').getByTestId('mockup-frame')).toHaveAttribute('src', /\/items\/ui-settings\/mockup\/after/);
});

test("a thread whose drawing can't be shown says why, and keeps the rest of the card", async ({ page }) => {
  const p = await importProject('vt-broken', 'Visual thread broken', { architecture: [system] });
  await writeRawData(p, 'architecture-system', { kind: 'system', nodes: [], edges: [] });
  await page.goto(`${p.url}/th/t-architecture-system`);
  await expect(page.getByTestId('item-drawing')).toContainText("This item's drawing couldn't be shown");
  await expect(page.getByRole('heading', { level: 1, name: 'Restock system' })).toBeVisible();
});

test('tables, mockups, flows and phases draw in their threads', async ({ page }) => {
  const table: TestItem = {
    key: 'reminder',
    title: 'RestockReminder table',
    summary: 'Logs each reminder.',
    data: {
      model: 'RestockReminder',
      change: 'new',
      fields: [
        { name: 'id', type: 'String', change: 'added' },
        { name: 'subscriptionId', type: 'String', change: 'added' },
      ],
      schemaDiff: '+model RestockReminder {\n+  id             String @id @default(uuid())\n+  subscriptionId String\n+}',
    },
  };
  const card: TestItem = {
    key: 'settings',
    title: 'Restock settings card',
    summary: 'On the account page.',
    data: { location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] }, kit: 'web', after: '<section class="rounded-card p-4"><h2>Restock settings</h2></section>' },
  };
  const job: TestItem = {
    key: 'job',
    title: 'Daily reminder job',
    summary: 'From the job to the provider.',
    data: {
      kind: 'system',
      lanes: [
        { id: 'job', label: 'Reminder job', status: 'new' },
        { id: 'sms', label: 'SMS provider', status: 'external' },
      ],
      steps: [{ n: 1, from: 'job', to: 'sms', label: 'Send the reminder' }],
    },
  };
  const first: TestItem = {
    key: 'first',
    title: 'Ship the table first',
    summary: 'Storage first.',
    data: { order: 1, goal: 'Reminders can be stored.', doneWhen: ['The migration runs'], itemIds: ['database-reminder'] },
  };
  const p = await importProject('vt-kinds', 'Visual thread kinds', { database: [table], ui: [card], flows: [job], phases: [first] });

  await page.goto(`${p.url}/th/t-database-reminder`);
  await expect(page.getByTestId('item-drawing').getByTestId('table-card')).toBeVisible();

  await page.goto(`${p.url}/th/t-flows-job`);
  await expect(page.getByTestId('item-drawing').getByTestId('sequence-step')).toHaveCount(1);

  await page.goto(`${p.url}/th/t-phases-first`);
  const phase = page.getByTestId('item-drawing').getByTestId('phase-view');
  await expect(phase).toContainText('Reminders can be stored.');
  await expect(phase).toContainText('The migration runs');

  await page.goto(`${p.url}/th/t-ui-settings`);
  const mockup = page.getByTestId('item-drawing');
  await expect(mockup.getByTestId('mockup-frame')).toHaveAttribute('src', /\/items\/ui-settings\/mockup\/after/);
  await mockup.getByRole('link', { name: 'Open in UI changes' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/t/ui\\?item=ui-settings$`));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:e2e visual-thread`
Expected: FAIL. There's no `item-drawing`, no "On" row and no `data-preview`; the card still says "The diagram view arrives in a later update."

- [ ] **Step 3: Write `ItemDataView`**

`packages/web/src/pages/visual/ItemDataView.tsx`:
```tsx
import { parseData, type DataChecks, type DataKind, type MockupData } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { MockupFrame } from '../../components/MockupFrame';
import { DiagramView } from '../../diagram/DiagramView';
import { TableCard } from './DatabaseScreen';
import { DataProblem } from './DataProblem';
import { FlowView, useMockupItems } from './FlowsScreen';

/** A thread option whose change redraws a mockup. The frame loads that option's markup, which isn't stored until it's accepted. */
type Proposal = { threadId: string; optionId: string };
type Props = { kind: DataKind; data: unknown; checks: DataChecks | null; repo: string; project: string; itemId: string; compact?: boolean; proposal?: Proposal };

/**
 * A UI item: its After mockup, where the screen lives, and a link to it on the UI changes screen.
 * With `proposal` ("View proposed"), the frame shows the option's proposed mockup instead of the saved one.
 * In a preview (`compact`) the link is left out, because UI changes shows the saved mockup.
 */
function MockupView({ data, repo, project, itemId, compact, proposal }: { data: MockupData; repo: string; project: string; itemId: string; compact?: boolean; proposal?: Proposal }) {
  const typeId = useMockupItems(repo, project).get(itemId)?.typeId;
  const where = [data.location.route, ...data.location.files].filter(Boolean).join(' · ');
  return (
    <div data-testid="mockup-view">
      {data.after?.trim() ? (
        <MockupFrame repo={repo} project={project} itemId={itemId} side="after" device="desktop" proposal={proposal} />
      ) : (
        <p className="text-[13px] text-ink-3">No mockup yet.</p>
      )}
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {where && <span className="min-w-0 break-all font-mono text-[11px] text-ink-3">{where}</span>}
        {typeId && !compact && (
          <Link to="/p/$repo/$project/t/$type" params={{ repo, project, type: typeId }} search={{ item: itemId }} className="ml-auto text-[12px] text-slate">
            Open in UI changes
          </Link>
        )}
      </div>
    </div>
  );
}

/** The item's drawing, for the thread view and for "View proposed". Data that doesn't fit its shape shows why. */
export function ItemDataView(p: Props) {
  // The thread view already shows the item's title and is its thread, so the problem block has neither.
  const problem = (problems: string[]) => <DataProblem problems={problems} data={p.data} repo={p.repo} project={p.project} />;
  switch (p.kind) {
    case 'diagram': {
      const r = parseData('diagram', p.data);
      if (!r.ok) return problem(r.problems);
      // ✓ and "not found" only when the boxes were checked against the clone.
      return <DiagramView data={r.data} checks={p.checks?.kind === 'diagram' && p.checks.checked ? p.checks.nodes : undefined} compact />;
    }
    case 'database': {
      const r = parseData('database', p.data);
      if (!r.ok) return problem(r.problems);
      // No row: the thread view shows the item's title, status and thread itself.
      return <TableCard data={r.data} checks={p.checks} repo={p.repo} project={p.project} />;
    }
    case 'mockups': {
      const r = parseData('mockups', p.data);
      if (!r.ok) return problem(r.problems);
      return <MockupView data={r.data} repo={p.repo} project={p.project} itemId={p.itemId} compact={p.compact} proposal={p.proposal} />;
    }
    case 'flows': {
      const r = parseData('flows', p.data);
      if (!r.ok) return problem(r.problems);
      return <FlowView flow={r.data} repo={p.repo} project={p.project} />;
    }
    case 'timeline': {
      const r = parseData('timeline', p.data);
      if (!r.ok) return problem(r.problems);
      const phase = r.data;
      return (
        <div data-testid="phase-view" className="text-[12.5px]">
          <p className="text-[11px] font-semibold text-ink-3">Phase {phase.order}</p>
          <p className="mt-0.5">{phase.goal}</p>
          <p className="mt-2 text-[11px] font-semibold text-ink-3">Done when</p>
          <ul className="ml-4 list-disc text-ink-2">
            {phase.doneWhen.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-ink-3">
            {phase.itemIds.length} item{phase.itemIds.length === 1 ? '' : 's'} in this phase
          </p>
        </div>
      );
    }
  }
}
```

- [ ] **Step 4: Draw the item in its card, and say what a pin is on**

Replace `packages/web/src/pages/ItemCard.tsx` with:
```tsx
import { dataKindOf, type ThreadDetail } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { Fragment, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ItemDataView } from './visual/ItemDataView';

export function ItemCard({ detail, repo, project }: { detail: ThreadDetail; repo: string; project: string }) {
  const [open, setOpen] = useState(true);
  const item = detail.item;
  const fields = Object.entries(item.fields ?? {}).filter(([k]) => k !== 'blocking');
  const kind = dataKindOf({ screen: detail.type.screen, timeline: detail.type.timeline });
  const hasData = item.data !== undefined && item.data !== null;
  const row = (label: string, value: ReactNode) => (
    <Fragment key={label}>
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </Fragment>
  );
  return (
    <section aria-label="Item" className="rounded-[10px] border-[0.5px] border-separator bg-cell px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-ink-3">{detail.type.title}</div>
          <h1 className="text-[20px] font-semibold leading-tight">
            {item.fields?.blocking === 'true' && <span className="mr-2 align-middle text-[11px] font-semibold text-seal">BLOCKING</span>}
            {item.title}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-2">{item.summary}</p>
        </div>
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="shrink-0 text-[12px] text-slate">
          {open ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {open && (
        <>
          <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[12.5px] md:grid-cols-[120px_1fr]">
            {detail.anchorParent &&
              row(
                'On',
                <Link
                  to="/p/$repo/$project/t/$type"
                  params={{ repo, project, type: detail.anchorParent.typeId }}
                  search={{ item: detail.anchorParent.itemId }}
                  className="text-slate"
                >
                  {detail.anchorParent.title} › {item.anchor?.label}
                </Link>,
              )}
            {fields.map(([k, v]) => row(k, v))}
            {item.body &&
              row(
                'Detail',
                <div className="doc text-[13px]">
                  <Markdown remarkPlugins={[remarkGfm]}>{item.body}</Markdown>
                </div>,
              )}
            {item.mdAnchor &&
              row(
                'In the draft',
                <Link to="/p/$repo/$project/d/$doc" params={{ repo, project, doc: 'draft' }} className="text-slate">
                  § {item.mdAnchor.heading}
                </Link>,
              )}
            {item.codeRefs?.length
              ? row(
                  'Code',
                  <ul>
                    {item.codeRefs.map((r) => (
                      <li key={`${r.path}#${r.symbol ?? ''}`} className="break-all font-mono text-[11.5px]">
                        {r.path}
                        {r.symbol ? ` · ${r.symbol}` : ''} {r.verified ? <span className="text-moss">✓</span> : <span className="font-sans text-amber">not found</span>}
                      </li>
                    ))}
                  </ul>,
                )
              : null}
            {detail.linked.length > 0 &&
              row(
                'Linked',
                <ul>
                  {detail.linked.map((l) => (
                    <li key={l.itemId}>
                      <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: l.threadId }} className="text-slate">
                        {l.typeTitle} › {l.title}
                      </Link>
                    </li>
                  ))}
                </ul>,
              )}
            {detail.decisions.length > 0 &&
              row(
                'Decisions',
                <ul>
                  {detail.decisions.map((d) => (
                    <li key={d.id}>{d.text}</li>
                  ))}
                </ul>,
              )}
            {item.flags?.length
              ? row(
                  'May need another look',
                  <ul className="text-amber">
                    {item.flags.map((f) => (
                      <li key={`${f.fromThreadId}${f.at}`}>{f.reason}</li>
                    ))}
                  </ul>,
                )
              : null}
          </dl>
          {kind && hasData && (
            <div className="mt-3 border-t-[0.5px] border-separator pt-3" data-testid="item-drawing">
              <ItemDataView kind={kind} data={item.data} checks={detail.checks} repo={repo} project={project} itemId={item.id} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Show what a proposed change does to the drawing**

In `packages/web/src/components/AnswerForm.tsx`:
- Add `import { ItemDataView } from '../pages/visual/ItemDataView';`.
- Above `export function AnswerForm`, add:
  ```tsx
  /**
   * A change to an item's drawing: what it changes, in words, and the drawing as it would be after.
   * `proposal` is this thread and the picked option. A mockup's frame loads the option's markup through it,
   * because a proposal isn't stored until it's accepted.
   */
  function DataPreview({ item, repo, project, proposal }: { item: ChangePreview['items'][number]; repo: string; project: string; proposal: { threadId: string; optionId: string } }) {
    const [shown, setShown] = useState(false);
    if (!item.data) return null;
    const d = item.data;
    return (
      <div className="mt-1 text-[12px] text-ink-2" data-testid="data-preview">
        <p>
          <span className="font-medium">{item.title}</span>
          {item.changes.length ? `: ${item.changes.map((c) => `${c.field} → ${c.after}`).join(', ')}` : ''}
        </p>
        <ul className="ml-4 list-disc">
          {d.summary.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <button type="button" aria-expanded={shown} onClick={() => setShown((v) => !v)} className="mt-1 text-[12px] text-slate">
          {shown ? 'Hide proposed' : 'View proposed'}
        </button>
        {shown && (
          <div className="mt-2">
            <ItemDataView kind={d.kind} data={d.after} checks={null} repo={repo} project={project} itemId={item.itemId} compact proposal={d.kind === 'mockups' ? proposal : undefined} />
          </div>
        )}
      </div>
    );
  }
  ```
- In the "What changes if you accept" section, replace:
  ```tsx
            {preview.items.map((i) => (
              <p key={i.itemId} className="mt-1 text-[12px] text-ink-2">
                <span className="font-medium">{i.title}</span>: {i.changes.map((c) => `${c.field} → ${c.after}`).join(', ')}
              </p>
            ))}
  ```
  with:
  ```tsx
            {preview.items.map((i) =>
              i.data ? (
                <DataPreview key={i.itemId} item={i} repo={p.repo} project={p.project} proposal={{ threadId: p.threadId, optionId: choice }} />
              ) : (
                <p key={i.itemId} className="mt-1 text-[12px] text-ink-2">
                  <span className="font-medium">{i.title}</span>: {i.changes.map((c) => `${c.field} → ${c.after}`).join(', ')}
                </p>
              ),
            )}
  ```
  `choice` is the picked option's id: `preview` only exists for one of Claude's options, so it's always set here.

- [ ] **Step 6: Run the tests**

Run:
```bash
pnpm test:e2e visual-thread
pnpm typecheck
pnpm test
pnpm test:e2e
```
Expected: PASS. The full e2e run includes Plan 2's `loop.spec.ts` and `documents.spec.ts`: previews without data still render as before. It also includes Task 11's diagram spec, whose anchored-thread test now also shows the "On" row.

- [ ] **Step 7: Commit**

```bash
git add packages/web
git commit -m "feat(web): the thread view draws its item and previews drawing changes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 17: Real-Claude smoke for the visual types, docs and full check

Everything so far is tested without Claude. This task runs the real thing once more, now with every visual type turned on:
- **The run:** Claude Code runs `/dev-plumbing` on a plan with a new table, a changed table, a screen change, a user flow and a phase hint, in a scratch repo with a Prisma schema and a Tailwind v4 kit.
- **What it records:** whether the repo-setup subagent found the schema and the kit, whether every visual importer wrote data, whether Flows and Phases ran after the others, whether a mockup renders and the tables were checked, and whether the Plan 2 thread round-trip still works.

Then the README and `docs/how-it-works.md` learn about the screens, and the full check runs.

**Files:**
- Modify:
  - `scripts/smoke-plan.md`
  - `scripts/smoke-claude.sh`
  - `scripts/smoke-user.mjs`
  - `smoke/RESULTS.md` (a "Plan 3: visual types" section)
  - `README.md`
  - `docs/how-it-works.md`
- Test: the smoke run itself, plus `pnpm check`.

**Interfaces:**
- Consumes everything above. In particular:
  - `TypeEntry.timeline` and `TypeEntry.importFailed` (Task 4);
  - rows with `data` and `checks` (Task 6);
  - `GET …/items/:itemId/mockup/after` and `GET …/items/:itemId/mockup-kit` (Task 8);
  - the importer prompt from SKILL.md §2 (Task 5), exactly: ``Import plumbing type `<type id>` ("<type title>") for repo `<repo>`, plumbing project `<project>`.`` The runner's importer-order grep matches its start, ``Import plumbing type `<id>` ``, on the main window's lines.

  It needs the `claude` CLI on PATH and logged in, as Plan 2's smoke did.
- Produces `smoke/RESULTS.md`'s Plan 3 section, with yes or no for each check and the evidence.

- [ ] **Step 1: Extend the smoke plan**

Replace `scripts/smoke-plan.md` with:
```markdown
# Restock reminders

Remind customers before a subscription item runs out, and let them reorder in one tap.

## Approach

A daily job finds subscriptions due in the next few days and sends a reminder. We haven't decided whether reminders go by SMS, email or both, or how many days before the due date to send them.

## Data

- A new `RestockReminder` table logs each reminder: the subscription, the channel, when it was sent, and whether the customer reordered.
- `Subscription` gains `remindDaysBefore` (default 3) and `remindersPaused`.

## Screens

A Restock settings card on the account page (`apps/web/app/account/page.tsx`) turns reminders on or off and sets how many days before.

## Flow

The customer gets a reminder, taps Reorder, sees the order summary and confirms. A customer who paused reminders gets nothing.

## Phases

Ship the table and the daily job first, then the settings card and one-tap reorder.

## Open points

- Should customers be able to snooze a reminder?
- What happens if the daily job runs twice on the same day?
```

- [ ] **Step 2: Give the scratch repo a schema and a kit, and turn the visual types on**

Replace `scripts/smoke-claude.sh` with:
```bash
#!/usr/bin/env bash
# The real thing. Claude Code runs /dev-plumbing on a small plan, in a scratch repo with a Prisma schema and a
# Tailwind v4 kit. scripts/smoke-user.mjs checks the drawings the importers wrote, then answers one thread the
# way you would in the browser, and a thread subagent replies. It uses a temporary dev-plumbing home and leaves
# your real ~/.dev-plumbing alone. It makes real model calls.
#   scripts/smoke-claude.sh                   about 10 minutes
#   DP_SMOKE_LONG=1 scripts/smoke-claude.sh   waits 35 minutes before answering, to check the long wait
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/dp-smoke-XXXXXX")"
export DEV_PLUMBING_HOME="$work/.dev-plumbing"
cli="$root/packages/cli/dist/index.js"
claude=""
# Stop Claude before the service: a Claude still running would start the service again.
stop_claude() {
  if [ -n "$claude" ]; then kill "$claude" 2>/dev/null || true; wait "$claude" 2>/dev/null || true; claude=""; fi
}
cleanup() { stop_claude; node "$cli" stop >/dev/null 2>&1 || true; }
trap cleanup EXIT

pnpm -C "$root" build >/dev/null
node "$cli" setup --yes --no-login-item --no-start --no-plugin --projects-folder "$work/projects" --port 45461 >/dev/null
# Questions and Concerns for the thread round-trip, plus every visual type. Ideas, Testing and Security stay
# off, to keep it shorter and cheaper. And no browser windows.
node -e '
  const fs = require("fs"), path = require("path"), dir = process.env.DEV_PLUMBING_HOME;
  const keep = ["questions.md", "concerns.md", "architecture.md", "database.md", "ui.md", "flows.md", "phases.md"];
  const s = path.join(dir, "settings.json");
  fs.writeFileSync(s, JSON.stringify({ ...JSON.parse(fs.readFileSync(s, "utf8")), openBrowserOnImport: false }, null, 2));
  for (const f of fs.readdirSync(path.join(dir, "plumbing"))) {
    if (keep.includes(f)) continue;
    const p = path.join(dir, "plumbing", f);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/^enabled: true$/m, "enabled: false"));
  }'

# The scratch repo: the plan, a Prisma schema, and a web app with a Tailwind v4 kit and an account page.
# No repo profile is written here: the repo-setup subagent has to find the schema and the kit itself.
repo="$work/acme-app"
mkdir -p "$repo/docs/specs" "$repo/packages/db/prisma" "$repo/apps/web/app/account"
git -C "$repo" init -q -b main
git -C "$repo" remote add origin git@github.com:acme/acme-app.git
cp "$root/scripts/smoke-plan.md" "$repo/docs/specs/restock-reminders.md"
cat > "$repo/packages/db/prisma/schema.prisma" <<'PRISMA'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Customer {
  id            String         @id @default(uuid())
  email         String         @unique
  phone         String?
  subscriptions Subscription[]
  createdAt     DateTime       @default(now())
}

model Subscription {
  id         String             @id @default(uuid())
  customer   Customer           @relation(fields: [customerId], references: [id])
  customerId String
  product    String
  status     SubscriptionStatus @default(ACTIVE)
  nextDueAt  DateTime
  createdAt  DateTime           @default(now())

  @@index([customerId])
}

enum SubscriptionStatus {
  ACTIVE
  PAUSED
  CANCELLED
}
PRISMA
cat > "$repo/apps/web/package.json" <<'JSON'
{ "name": "@acme/web", "private": true, "dependencies": { "next": "^15.0.0", "react": "^19.0.0", "tailwindcss": "^4.0.0" } }
JSON
cat > "$repo/apps/web/app/globals.css" <<'CSS'
@import "tailwindcss";

@theme {
  --color-brand: #0f766e;
  --color-ink: #1f2937;
  --radius-card: 14px;
}

@layer components {
  .card {
    @apply rounded-card border border-ink/10 bg-white p-4;
  }
  .button-primary {
    @apply rounded-full bg-brand px-4 py-2 text-sm font-medium text-white;
  }
}
CSS
cat > "$repo/apps/web/app/account/page.tsx" <<'TSX'
export default function AccountPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold text-ink">Your account</h1>
      <section className="card">
        <h2 className="font-medium text-ink">Subscriptions</h2>
        <p className="text-sm text-ink/70">Coffee beans, every 4 weeks.</p>
        <button className="button-primary mt-3">Manage</button>
      </section>
    </main>
  );
}
TSX

echo "Working in $work"
node "$root/scripts/smoke-user.mjs" &
user=$!
# exec, so $! is Claude itself and not a subshell that would leave it running.
( cd "$repo" && exec claude -p "Use the dev-plumbing skill to plumb docs/specs/restock-reminders.md." \
    --plugin-dir "$root/plugin" --permission-mode bypassPermissions \
    --output-format stream-json --verbose > "$work/transcript.jsonl" 2> "$work/claude.err" ) &
claude=$!
status=0
wait "$user" || status=$?
stop_claude
echo "Transcript: $work/transcript.jsonl"
echo "dp tool calls made inside subagents (parent_tool_use_id set):"
grep -h '"parent_tool_use_id":"' "$work/transcript.jsonl" | grep -o '"name":"mcp__plugin_dev-plumbing_dp__[^"]*"' | sort | uniq -c || true
echo "dp tool calls made by the main window:"
grep -h '"parent_tool_use_id":null' "$work/transcript.jsonl" | grep -o '"name":"mcp__plugin_dev-plumbing_dp__[^"]*"' | sort | uniq -c || true
echo "Importers started by the main window, in order (Flows and Phases should come last):"
grep -h '"parent_tool_use_id":null' "$work/transcript.jsonl" | grep -o 'Import plumbing type `[a-z0-9-]*`' | awk '!seen[$0]++' | nl -w2 -s'. ' || true
echo "Transcript lines with a refused write (\"Nothing was saved\"):"
grep -c 'Nothing was saved' "$work/transcript.jsonl" || true
exit "$status"
```

- [ ] **Step 3: The "user" checks the drawings before it answers**

Replace `scripts/smoke-user.mjs` with:
```js
// Plays the user for scripts/smoke-claude.sh. It waits for the import, checks the drawings the importers wrote,
// answers one question the way the browser would, then waits for Claude's reply. Exits non-zero if anything
// doesn't happen in time, or if a visual type has items without drawings.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.DEV_PLUMBING_HOME;
const long = process.env.DP_SMOKE_LONG === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[user ${new Date().toISOString().slice(11, 19)}] ${msg}`);
const service = () => JSON.parse(fs.readFileSync(path.join(dir, 'run', 'service.json'), 'utf8'));

async function call(route, method = 'GET', body) {
  const run = service();
  const res = await fetch(`http://127.0.0.1:${run.port}${route}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': run.token },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ok: res.ok, body: await res.json() };
}

/** A route that answers with a document rather than JSON, such as a mockup. */
async function fetchText(route) {
  const run = service();
  const res = await fetch(`http://127.0.0.1:${run.port}${route}`, { headers: { 'x-dev-plumbing-token': run.token } });
  return { status: res.status, type: res.headers.get('content-type') ?? '', text: await res.text() };
}

async function until(what, fn, minutes) {
  const end = Date.now() + minutes * 60_000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // The service may not be up yet.
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

const P = '/api/projects/acme-app/restock-reminders';
const started = Date.now();
const home = await until('the import to finish', async () => {
  const r = await call(P);
  return r.ok && r.body.project.status === 'active' ? r.body : null;
}, 25);
log(`Import finished in ${Math.round((Date.now() - started) / 1000)} s.`);
for (const t of home.types) {
  log(`  ${t.title}: ${t.importFailed ? "didn't finish" : t.noChanges ? `no changes (${t.noChanges.reason})` : `${t.itemCount} items`}`);
}

const profileFile = path.join(dir, 'repos', 'acme-app.json');
log(`Repo profile saved: ${fs.existsSync(profileFile) ? 'yes' : 'no'}`);
if (fs.existsSync(profileFile)) {
  const profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
  log(`  schema: ${profile.schema ? `${profile.schema.type} ${profile.schema.path}` : 'none'}`);
  for (const app of profile.apps ?? []) log(`  app ${app.name} (${app.path}): kitFiles ${app.kitFiles?.length ? app.kitFiles.join(', ') : 'none'}`);
}

// The drawings. Every visual type with items must have data on them, and at least one UI item needs markup
// that the mockup route can render. Every write was checked against its shape, so stored data is valid data.
const problems = [];
const visual = home.types.filter((t) => t.screen !== 'list' || t.timeline);
for (const t of visual) {
  if (!t.itemCount) continue;
  const r = await call(`${P}/types/${t.id}`);
  if (!r.ok) {
    problems.push(`${t.title}: ${r.body.error}`);
    continue;
  }
  const rows = r.body.items;
  const withData = rows.filter((i) => i.data !== null);
  log(`  ${t.title}: ${rows.length} items, ${withData.length} with data`);
  if (!withData.length) problems.push(`${t.title} has items, but none has data.`);
  if (t.screen === 'database') {
    const checked = rows.filter((i) => i.checks?.kind === 'database' && i.checks.checked);
    const warnings = checked.reduce((n, i) => n + i.checks.warnings.length, 0);
    const notChecked = rows.find((i) => i.checks?.kind === 'database' && !i.checks.checked);
    log(`  Database: ${checked.length} of ${rows.length} tables checked against ${checked[0]?.checks.file ?? 'no schema'}, ${warnings} warnings${notChecked ? ` (not checked: ${notChecked.checks.reason})` : ''}`);
  }
  if (t.screen === 'flows') {
    const steps = withData.flatMap((i) => i.data.steps ?? []);
    log(`  Flows: ${steps.length} steps, ${steps.filter((s) => s.mockupId).length} pointing at a UI mockup`);
  }
  if (t.timeline) {
    log(`  Phases: ${withData.reduce((n, i) => n + (i.data.itemIds?.length ?? 0), 0)} items listed across ${withData.length} phases`);
  }
  if (t.screen === 'mockups') {
    const marked = rows.filter((i) => typeof i.data?.after === 'string' && i.data.after.trim());
    log(`  UI changes: ${marked.length} of ${rows.length} with After markup, ${rows.filter((i) => i.data?.before).length} with Before`);
    if (!marked.length) problems.push('No UI item has mockup markup.');
    else {
      const id = marked[0].id;
      const doc = await fetchText(`${P}/items/${id}/mockup/after`);
      log(`  Mockup ${id}: ${doc.status} ${doc.type}`);
      if (doc.status !== 200 || !doc.type.startsWith('text/html')) problems.push(`The mockup document for ${id} didn't load (${doc.status} ${doc.type}).`);
      const kit = await call(`${P}/items/${id}/mockup-kit`);
      if (kit.ok) log(`  Kit: app ${kit.body.app ?? 'none'}, ${kit.body.files.length} files, warnings: ${kit.body.warnings.join(' ') || 'none'}`);
    }
  }
}
if (!visual.some((t) => t.screen === 'mockups' && t.itemCount)) problems.push('No UI item has mockup markup (UI changes has no items).');
if (problems.length) throw new Error(`The drawings aren't right:\n- ${problems.join('\n- ')}`);

const target = home.inbox.find((e) => e.status === 'your_turn');
if (!target) throw new Error('No thread is waiting for an answer.');
const detail = (await call(`${P}/threads/${target.threadId}`)).body;
const choice = detail.open?.options.find((o) => !o.change);
const draft = choice ? { optionId: choice.id, note: 'Go with this, and keep it simple.' } : { text: 'Use your recommendation, and keep it simple.' };
if (long) {
  log('Waiting 35 minutes before answering, to check the long wait survives...');
  await sleep(35 * 60_000);
}
const saved = await call(`${P}/threads/${target.threadId}/draft`, 'PUT', draft);
if (!saved.ok) throw new Error(`Saving the draft failed: ${saved.body.error}`);
const before = detail.thread.messages.length;
const submitted = await call(`${P}/submit`, 'POST', { scope: 'thread', threadId: target.threadId });
if (!submitted.ok) throw new Error(`Submitting failed: ${submitted.body.error}`);
const sent = submitted.body;
log(`Answered "${target.itemTitle}": ${sent.message}`);
if (sent.sent !== 1) throw new Error(`Expected 1 thread sent to Claude, got ${sent.sent}.`);

const sentAt = Date.now();
const reply = await until("Claude's reply", async () => {
  const d = (await call(`${P}/threads/${target.threadId}`)).body;
  const last = d.thread.messages.at(-1);
  return d.thread.messages.length > before && last?.author === 'claude' && d.thread.status !== 'with_claude' ? last : null;
}, 15);
log(`Claude replied in ${Math.round((Date.now() - sentAt) / 1000)} s: ${reply.text.slice(0, 160)}`);
log('Smoke test passed.');
```

- [ ] **Step 4: Run it and record the results**

Run: `pnpm smoke`

It makes real model calls and takes about 10 minutes. Expected:
- The "user" prints:
  - the import summary;
  - the repo profile, with its schema and each app's `kitFiles`;
  - one line per visual type, with items and how many have data;
  - the Database, Flows, Phases and UI changes lines, the mockup line (`200 text/html`) and the kit line;
  - the answer, Claude's reply, and "Smoke test passed."
- The tool-call counts list:
  - inside subagents: `dp_repo_profile`, `dp_context`, `dp_write_items` (at least 7) and `dp_reply`;
  - from the main window: `dp_open` and `dp_wait`.
- "Importers started by the main window, in order" ends with `flows` and `phases`.

If something fails:
- **A visual type has items but no data.**
  - Find that importer's `dp_write_items` calls in the transcript.
  - If its batches were refused ("Nothing was saved"), the messages say what didn't fit. Make the shape text clearer in `dataShapeDoc` (`packages/core/src/schemas/data.ts`) or in `plugin/agents/importer.md`.
  - Run the tests for what you changed, run the smoke again, and record the fix.
- **Flows or Phases weren't last.** Check SKILL.md §2 (Task 5): the second wave must start only after the first has returned.
- **The mockup isn't 200.** Read `$work/.dev-plumbing/run/service.log`.
- **The repo-setup subagent missed the schema or the kit.** That's detection, not a failure: tables say "Not checked" and mockups show kit warnings. Record it, with the profile it saved.

Add this section to the end of `smoke/RESULTS.md`, and fill every row from the run. Don't leave any blank:
```markdown

## Plan 3: visual types

Date: <date> · Claude Code version: <`claude --version`>

| Check | Result | Evidence |
|---|---|---|
| repo-setup found the Prisma schema and the web app's kit | yes/no | user log: "schema: …", "app web (…): kitFiles …" |
| Importers wrote valid data for each visual type | yes/no | user log: "<type>: N items, N with data" for Architecture, Database, UI changes, Flows, Phases & milestones |
| Flows and Phases ran after the others | yes/no | runner: "Importers started by the main window, in order" |
| UI mockups had markup and rendered | yes/no | user log: "UI changes: N of M with After markup", "Mockup <id>: 200 text/html", the kit line |
| Tables were checked against the schema | yes/no | user log: "Database: N of M tables checked against …, K warnings" |
| Writes refused and fixed on retry | <count> | runner: transcript lines with "Nothing was saved" |
| A thread reply still works | yes/no | "Claude replied in N s" |

Notes: <anything surprising, any fix made, and the user log from the run (with `$TMPDIR` shortened)>
```

- [ ] **Step 5: Update the README**

In `README.md`:
- Replace the status line with:
  ```markdown
  **Status:** the Claude loop and the visual screens work. Finalize spec and Whiteboard Defense come next. The design is in [SPEC.md](SPEC.md), and the plans are in [docs/superpowers/plans](docs/superpowers/plans).
  ```
- After the paragraph that links to `docs/how-it-works.md` (the end of **Use it**), add:
  ```markdown
  ## Screens

  Each plumbing type has its own screen in the app:
  - **Questions, Concerns, Ideas, Testing and Security:** lists you answer in place.
  - **Architecture:** each diagram as boxes and lines, grouped by app or package. Marks show what's new, changed, unchanged or external, and ✓ marks file references that exist in your repo. Click a box to ask about it.
  - **Database:** a relationship strip, a migration panel, and one diff card per table, shown as a visual diff or as Prisma. Tables are checked against your repo's Prisma schema.
  - **UI changes:** each screen as a mockup built with your app's own design kit, on Desktop or Mobile, Before or After. **+ Pin** starts a thread on any part of it.
  - **Flows:** user flows as storyboards and system flows as sequence diagrams, or both, with matching step numbers.
  - **Phases & milestones:** a timeline of phases, each with its goal, its "done when" and its items.

  Every thread also draws its item, and shows what a proposed change does to the drawing before you accept it.
  ```

- [ ] **Step 6: Explain drawings in `docs/how-it-works.md`**

In `docs/how-it-works.md`:
- In **The pieces** table, change the web app's description to: `The pages you use in the browser: projects, threads, lists, drawings, the Draft and Settings. It gets live updates from the service, so replies appear without reloading.`
- Before `## Where everything is stored`, add:
  ```markdown
  ## Drawings

  Architecture, Database, UI changes, Flows and Phases items carry **data**: boxes and lines, a table diff, mockup markup, steps, or a phase. Claude writes the data; the app draws it.

  - **One shape per screen.** Each screen's data shape is defined once, in `packages/core/src/schemas/data.ts`.
    - The service checks every write against it: an importer's batch, a thread agent's new items, and every option or small edit that changes a drawing.
    - A line to a box that isn't there, a step on a lane that doesn't exist, or a mockup with a script is refused as a whole, and the agent is told what to fix.
    - Agents get the same shape, as text, in their context pack (`type.dataShape`), so the instructions and the checks can't drift apart.
  - **Checks happen when you look.** Each time you open a screen or a thread, the service checks the drawing against the plan's clone:
    - ✓ on boxes whose file exists;
    - tables against the Prisma schema in your repo profile.

    The results are never stored, so they're never stale. Without a clone or a schema file, the screen says "Not checked", and why.
  - **Mockups use your app's kit.** A UI mockup is body markup with your app's Tailwind classes. The service builds a page around it:
    - your kit's CSS, read from the clone (only `.css` files inside it, up to 1 MB);
    - Tailwind's in-browser compiler, served by the service itself, so nothing loads from the internet.

    The page runs in a sandboxed frame with a strict Content-Security-Policy, so the markup can't run scripts, load files or reach the app.
  - **Pins.** Clicking a box, a step or a part of a mockup starts a new item about it, with its own thread.
    - The screen draws a pin or a bubble where it points. Nothing is written into the drawing itself, so Claude can redraw it without losing your pins.
    - A pin whose part is gone is still listed, marked "Not in this version".
  - **Data that can't be drawn**, from an older version say, never blanks a screen. That item shows "This item's drawing couldn't be shown" with the reasons, and everything else still draws.
  - **Changes to drawings.** When an option changes a drawing, "What changes if you accept" says what changes in words, and **View proposed** draws the new version.
  ```

- [ ] **Step 7: Run the full check**

Run:
```bash
before=$(ls -d "${TMPDIR:-/tmp}"/dp-* 2>/dev/null | grep -v dp-smoke- | wc -l)
pnpm install --frozen-lockfile && pnpm check
git grep -n -F "$HOME" -- . ':!pnpm-lock.yaml' ':!docs/superpowers/plans'
after=$(ls -d "${TMPDIR:-/tmp}"/dp-* 2>/dev/null | grep -v dp-smoke- | wc -l)
echo "temp folders: $before before, $after after"
```
Expected:
- `pnpm check` passes: typecheck clean, then unit, integration and e2e.
- The grep prints nothing.
- The temp-folder count is the same before and after. `dp-smoke-*` folders from the smoke run are left for their transcripts and don't count.

- [ ] **Step 8: Commit**

```bash
git add scripts smoke README.md docs/how-it-works.md
git commit -m "test: real Claude Code smoke for the visual types, and docs for Plan 3" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The controller pushes the branch after the final review, as in Plans 1 and 2.

---

## Not in this plan

These come later, or stay deferred with a reason.

- **Plan 4 (Finalize spec):**
  - the checklist, the finalizer, the preview and `final.md`;
  - Mermaid diagrams generated from the same data this plan draws;
  - copying the final into the repo as `<name>.final.md`, with `<name>.assets/` written from the UI items' markup;
  - **Bring changes in**, for a plan edited in the repo after import;
  - **Detect again** for repo profiles.
- **Plan 5 (Whiteboard Defense):** Present, Study and Practice, drawn with Rough.js from the same `DiagramData`.
- **Naming checks against the repo's conventions.** Conventions are plain English. Subagents get them in every context pack and apply them; the service doesn't check them.
- **Undo for accepted options** (Plan 2, Decision 4). Accepting a drawing change from an option is final, like any other accept. Small edits to drawings can be undone.
- **Inside mockups:** a light/dark toggle, real images and the app's fonts. Mockups use inline SVG or plain boxes for images.
- **Checking relation fields' target models against the schema** (§14 "fields and relations"). Plan 3 checks models, fields and types.
- **From Plan 2's follow-ups, not needed for the screens** (see `.superpowers/plan-2-followups.md`):
  - the service rewriting a missing run file;
  - the listening mark flapping for one window on two projects;
  - `/wait` polls emitting project events;
  - the `config` event only refreshing `['config']`;
  - `installPlugin` keeping an old checkout;
  - created projects with empty `importTypes`;
  - unknown-thread conflicts dropped silently;
  - a second answer on a returned thread stacking accepts.
- **Plan 1's remaining minors** (`.superpowers/plan-1-followups.md`).
