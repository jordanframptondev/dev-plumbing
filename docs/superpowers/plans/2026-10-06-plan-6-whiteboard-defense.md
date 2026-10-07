# Plan 6: Whiteboard Defense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Whiteboard Defense** for every plumbing project: on request, an opus subagent writes a defense of the plan following `outputs/whiteboard-defense.md`. You can then:
- **Study** it: the 13 sections, with a level, every statement tagged Known, Inferred, Unknown or Verify before release.
- **Practice** explaining it: flashcards you rate yourself on once you've seen the answer, a readiness meter (half flashcards, half checklist) and the rules file's 20-item checklist.
- **Ask Claude** about any part, in threads that never touch Finalize.
- **Send** unknowns and release concerns to Questions and Concerns.
- **See** when it's out of date, and **Regenerate** it.
- **Export** it as `<name>.whiteboard-defense.md` next to the plan.

Present, the animated whiteboard, is Plan 7.

**Architecture:**
- **Core** (`packages/core`) adds:
  - the defense's types and its three files, `whiteboard/request.json`, `defense.json` and `practice.json`;
  - a generation request with the same life as a finalize request: requested → writing → saved, or failed;
  - an inputs hash that says when the defense is out of date;
  - the subagent's context pack, which gives the big texts as files to Read so it stays small on a big plan, and a Markdown rendering;
  - a built-in **Defense questions** plumbing type (id `defense`), shipped in code like Plan changes, for "Ask Claude about this" threads. It's kept out of imports, the Finalize checklist, the final, both inputs hashes and the other threads' decisions.
- **The service** hands the request to a listening window through `dp_wait` (`kind: 'whiteboard'`). It saves what the subagent sends through `dp_whiteboard`, with the rules file's checklist, and serves the browser's whiteboard routes.
- **The plugin** gets a `dev-plumbing:whiteboard` agent. **The web app** gets a Whiteboard Defense page with Study and Practice.

**Tech Stack:** the stack of Plans 1–5: TypeScript 5.9, Node 22, pnpm 10, Zod 3.25, Hono 4, React 19, Vite 7, Tailwind 4, TanStack Router and Query, Vitest 3, Playwright, `@modelcontextprotocol/sdk` 1.31. No new dependencies; Rough.js and Motion come with Present in Plan 7.

**Spec:** `SPEC.md` (repo root). Read §7, §10.6, §12, §13.1, §13.3 and §16 before starting. `docs/how-it-works.md` explains how the plugin, the service and the app fit together.

## What Plans 1–5 left in place

Plan 5 and the "reviewed" mark are merged on `main`. This plan builds on:
- **Already there for the whiteboard:**
  - `agents.json` has `models.whiteboard` (default `opus`), with a Settings field (`core/src/schemas/agents.ts`).
  - `outputs/whiteboard-defense.md` is shipped in `defaults/outputs/`, installed by setup and editable on the Rules page. It's the user's framework, written for code review, with the 13 output sections, the three levels and the 20 checklist lines, and no JSON format.
  - `Item.createdBy` already allows `'whiteboard'`, though nothing sets it.
  - `RepoProfile.sensitiveData` is documented as raising the level.
- **The web has placeholders:**
  - a disabled "Whiteboard Defense" button in `ProjectHeader.tsx`;
  - a "Whiteboard Defense" `<span>` under Review in `ProjectNav.tsx`;
  - a Defense option in the phone `Segmented` in `ProjectLayout.tsx`, with a "arrives in a later update" line.
- **Finalize (Plan 4) is the model to mirror.**
  - `finalize.json` is one request at a time (`core/src/store/finalize.ts`). Inside `/api/claude/wait`, submissions are handed out first, then a requested finalize, then Detect again (`service/src/routes/claude.ts`).
  - A window that comes back without a proposal fails its own request (the `finished.finalize` back-check). A window that's gone gets its request requeued, in `/wait` and `/open`.
  - `finalInputsHash` hashes the draft, every item (minus `flags` and `reviewedAt`), the parked ids and the active decisions.
- **Plan changes (Plan 5) is the model for a built-in type.**
  - `PLAN_CHANGES_TYPE` lives in `core/src/planChanges.ts` with `builtIn: true`, and `loadConfig` appends it unless the user has their own `plumbing/plan-changes.md`.
  - `importableTypes` keeps built-ins out of imports and of Claude's `newItems`.
  - The nav shows a built-in type only when it has items.
  - `checklistFrom` and `finalizePack` special-case it by id.
- **Threads:**
  - `addOwnItem` + `submit({ scope: 'thread' })` is how `POST …/items` makes a thread whose first message is yours, sent to Claude.
  - `updatePlan` shows how the service makes a thread that starts with Claude: status `with_claude`, a system line, and a Submission `{ scope: 'all', drafts: {}, sent: [threadIds], resolved: [], processedAt: at }`. The thread agent's `thread.md` already says what to do when there's no message from the person yet.
- **Accept (Plan 4)** checks a clone before writing into it: `checkClone`, `checkPlace` and `checkTarget` in `core/src/store/accept.ts`, all module-private today. The service's `clonesOf` (`service/src/routes/finalize.ts`) is module-private too.

## Decisions this plan makes

Review these. Each one is the plan's reading of the spec, or of the user's choices, where they leave room.

1. **Present is Plan 7** (the user's choice, 2026-10-06). This plan's defense has no `presenter`. Plan 7 adds it to the schema and the agent.
2. **Generating is a request, like Finalize.**
   - **Generate** on the Whiteboard Defense page writes `whiteboard/request.json` (`requested`).
   - The next `dp_wait` from a listening window takes it (`writing`) after any submissions and any requested finalize, and returns `kind: 'whiteboard'`. The window runs one `dev-plumbing:whiteboard` subagent with `models.whiteboard`, in the foreground. The subagent reads `dp_context { whiteboard: true }` and sends the defense with `dp_whiteboard`.
   - **Writing stays in the foreground** (the controller's ruling on the review's Q2), with honest copy. It takes the only window for ten minutes or more, so the page says "Claude is writing the Whiteboard Defense. Threads you send now wait until it's done.", and Send says Claude is busy. Ask already says so, with Send this thread's busy line.
   - Saving writes `whiteboard/defense.json` and removes the request.
   - A window that comes back without saving fails its request: its reason is the subagent's own `Failed: …` line when the window passes it on (`finished.whiteboardError`), else "The whiteboard subagent didn't send a Whiteboard Defense.". The page offers **Try again**, and a quiet **Dismiss** that clears the failed request off a defense that's still good. A window that's gone has its request requeued for another window.
   - **Cancel** removes the request in any state, and so does Dismiss once it failed. A subagent told there's no request waiting stops, with "Failed: the request was cancelled or replaced.".
   - It can be generated **any time**, except while the plan is importing, and only one at a time.
   - A request waits while the plan is importing (an update's re-import), and is picked up once it's done.
   - **Regenerate** is Generate again. The old defense stays, and Study and Practice keep working, until the new one is saved.
   - A plan update doesn't wait for a defense being written. The defense would just be marked Out of date.
3. **It's based on the final while the final is current (nothing changed and no newer plan version since Accept), else the draft** (the user's choice, 2026-10-06).
   - "Current" is the Finalize page's own test: no change applied since the last Accept (`changesSinceFinal`), and no plan version that changed the draft came in after it (`planVersionSinceFinal`, now a helper both share). A final the plan has moved on from isn't the plan any more, so the defense explains the draft.
   - When a window picks the request up, the request records which document (`doc: 'final' | 'draft'`), the plan version, and the inputs hash. The saved defense keeps them as `basedOn: { kind: 'plan', doc, version, inputsHash }`.
   - The page says "Based on the draft (v2)".
   - A defense written while a final waits for Accept is based on the draft, and goes Out of date once you accept.
4. **The subagent sends structured JSON, and the service owns the frame.** The 13 sections map onto the type like this:
   - Sections 1–9 and 12 (Unknowns) are ten prose `sections`, each identified by a fixed id: `summary`, `diagram`, `walkthrough`, `data`, `security`, `failure`, `tradeoffs`, `complexity`, `readiness`, `unknowns`.
   - Section 10 is `questions` (question, answer, basis).
   - Section 11 is `concerns` (severity, text, basis).
   - Section 13 is `checklist`: plain lines, which the service copies from the rules file's `[ ]` lines, word for word, so Practice's ticks always match it. The subagent sends `checklist: []`, and writes one only when the rules have none.

   Every statement is a **claim** with a `basis`: `known`, `inferred`, `unknown` or `verify`. Sections may carry small tables (e.g. source of truth). Section 2 may name a diagram item of the project (`diagramItemId`, drawn with the existing `DiagramView`) and/or a plain-text diagram.

   The service fills in the titles, the ids of questions (`q1…`), concerns (`c1…`) and checklist lines (`k1…`), the `id` (`w-…`), `generatedAt` and `basedOn`. Concerns are sorted by severity, most severe first.

   A payload with any problem is refused whole, listing every problem, and the request stays `writing` so the subagent can send it again. The last saved defense is untouched until a new one is saved. `dp_whiteboard` checks only that the defense is an object, so the service lists the shape's problems with the rest, and one resend fixes them all. A question asked twice is refused, as Practice would rate them as one, and so is a defense over 120,000 characters of JSON (the agent aims for about 40,000).

   **The pack stays small.** An MCP tool result is capped (25,000 tokens by default), so `dp_context { whiteboard: true }` names the rules file and the document for the subagent to Read, gives each item its own file, a body cut to 800 characters and its drawing only when it's a diagram, and carries the last defense's questions and unknowns, whose wording the subagent keeps where they still apply.
5. **Out of date** means the plan the defense explains has changed since it was generated.
   - `defenseInputsHash` hashes four things:
     - the document it's based on (the final while it's current, else the draft);
     - every item except Defense items and items the whiteboard made, without `flags` and `reviewedAt`;
     - the parked item ids;
     - the active decisions, except those made in Defense threads.
   - So sending an unknown to Questions, ticking the checklist, rating a card, marking items reviewed or flags never make it stale. Asking Claude about it never makes the defense Out of date or holds up Finalize, unless Claude adds a Questions or Concerns item, which is a plan item like any other.
   - Answering a question you sent does make it stale, because it adds a decision. So does the basis moving: a final accepted after a defense of the draft, or a defense of the final whose final stops being current.
   - The page shows a seal line: "Out of date: a final was accepted since this was generated." when it was based on the draft and the basis is now the final, else "Out of date: the plan changed since this was generated." (a final-based defense whose final stops being current gets this one: its basis is now the draft). It also makes **Regenerate** the primary button.
6. **"Ask Claude about this" makes a thread in a built-in Defense questions type** (the user's choice; the title is the controller's ruling on the review's Q7).
   - **The type:**
     - Its id is `defense`, its title "Defense questions", and it has order 100, so it comes after every shipped type. The phone's "Defense" tab still opens the Whiteboard Defense page.
     - It uses the list screen, with no fields and no presets.
     - It's in the nav only when it has items.
     - It's never imported and never offered to Claude's `newItems`.
     - It's never on the Finalize checklist, never in the final, never in `finalInputsHash` or `defenseInputsHash`, and never in an importer's `existingItems`.
     - Its threads are otherwise ordinary: the Inbox, statuses, Send this thread, Submit all.
   - **Asking:**
     - You can ask about any prose section, flashcard (question) or release concern. You type your question.
     - The service makes a Defense item with `createdBy: 'whiteboard'` and `fromDefense: { id, kind, ref }`. Its body is that part of the defense as Markdown. Its title is your question's first line, clipped to 120 characters.
     - Your question is the first message, sent like **Send this thread**, and the thread opens.
     - Each ask makes a new thread. The page lists the threads already asked about each part, for the current defense.
   - **The thread agent** gets the whole defense as Markdown in its pack (`defense`), and the final's path (`finalFile`) when there is one.
   - **Claude resolves its own answer** (the user's choice) when it needs nothing more from you: it sends the answer with `resolve` and a one-line decision, so it doesn't wait in your Inbox. You can reply to carry on: the answer form stays on a resolved thread. It offers options only when you must choose.
   - **The draft is protected.** The Defense type's Rules say never to offer a change to the draft. `postReply` refuses `change` and `smallEdits` on a Defense thread, so a Defense thread can never edit the draft. When the answer shows a gap in the plan, Claude adds a Questions or Concerns item with `newItems` instead, and `postReply` refuses any other type (the controller's ruling on Q4).
   - **Its decisions stay in Defense threads.** A thread's pack (other than a Defense thread's own) and the main window's cross-check never get a decision made in a Defense thread, and a Defense thread can resolve only itself, so a Q&A about the defense never steers the plan.
   - **A plan update doesn't wait** for a Defense thread that's with Claude: it can't change the draft.
7. **Sending to Questions or Concerns is one click, and Claude picks it up.**
   - **What can be sent:**
     - any claim marked Unknown or Verify before release, from any section, goes to **Questions**;
     - any release concern goes to **Concerns**.
   - **The new item:**
     - It's `createdBy: 'whiteboard'`, with `fromDefense`, and its title is the text clipped to 120 characters.
     - Concerns get `fields.severity`: critical and high become `high`, medium stays `medium`, low and info become `low`, in the Concerns type's own words.
     - Its thread starts **with Claude**, with a system line and a service-made submission, as Plan changes threads do. The window's thread agent, seeing no message from you, follows the type's Rules and suggests answers.
   - **One send per part, across regenerates.** Sending a part again is refused, and the page shows "In Questions ›" linking to the thread. The item records the part's text (`fromDefense.text`), so a regenerated defense that still has the same unknown, under a new id, matches it by kind and text (the controller's ruling on Q6).
   - **Claude's suggestions don't hold up Finalize until you've answered** (the controller's ruling on Q5). A proposal blocks Finalize only once you've written in the thread, so a sent unknown with Claude's suggested answers is "Nobody has answered here.". A sent concern otherwise behaves like any other: a high one blocks Finalize until it's resolved, as any high concern does.
   - **A missing or disabled target type** gets a refusal that says to turn it on in Plumbing rules.
8. **Practice is saved by text, so a regenerate keeps what still applies.**
   - `practice.json` holds ratings keyed by the question's text and ticks keyed by the checklist line's text. A regenerated defense with the same 20 checklist lines keeps your ticks, and a question asked again keeps its rating.
   - Writing practice drops keys the current defense no longer has.
   - The pack carries the last defense's question texts and unknowns, and the agent keeps their wording where they still apply, so ratings, ticks and sent unknowns carry over.
   - **Readiness is half flashcards, half checklist** (the user's choice): the cards' score is (cards rated *Could explain it* + half the cards rated *Shaky*) / cards, the checklist's is lines ticked / lines, and readiness = round(100 × the mean of the scores there are). With only cards, or only lines, it's that score; with neither, 0. So 2 could + 1 shaky of 4 cards (0.625) and 3 of 6 lines ticked (0.5) give 56, and ticking every line alone gives 50.
9. **Export .md writes one file into a clone you pick.**
   - The file is `<name>.whiteboard-defense.md` in the plan's folder, next to where Accept puts `<name>.final.md`.
   - **The clone** is the source clone by default, or any clone the project was opened from.
   - **The checks are Accept's:**
     - it must be a clone of this repo, picked by its root;
     - the plan's folder must be real and inside it;
     - nothing is written through a link.

     Accept's clone checks move into `core/src/store/cloneTarget.ts`, shared by both. Their messages name the action ("Accept" or "Export").
   - **What's written:**
     - It overwrites an earlier export of the same name, and writes nothing else. The form says "Replaces the file there." once the defense has been exported.
     - The diagram section 2 names is drawn under its "Diagram:" line as a Mermaid block, as the final draws diagrams, for a reader of the repo who can't see dev-plumbing.
     - It's allowed when out of date: the file says what it was generated from and when.
     - The defense records `exportedTo: { clone, path, at }`.
   - SPEC §7's "only write into your repo" line is updated to name both writes.
10. **The page.**
    - **Getting there:** the header's Whiteboard Defense button becomes a link to `/p/$repo/$project/defense`. The nav's Review entry becomes a real link, with a quiet trailing "Writing…" (a request is requested or being written), "Not yet" or "Out of date". The phone's Defense tab navigates there.
    - **The page itself:**
      - It has a **Study / Practice** segmented control (`?mode=study|practice`, default study).
      - The generation status line and Cancel, or Dismiss beside Try again once the request failed.
      - **Generate / Regenerate / Try again:** primary when there's no defense, it's out of date, or the last request failed; otherwise Regenerate is secondary.
      - **Export .md**, with the clone picker.
    - **Study** is a readable page in the app's normal Ink wash look, with a table of contents. The dot-grid whiteboard canvas of §16 is Present's, in Plan 7.
    - **Practice** shows one card at a time, the readiness meter and the checklist (the user's choice on flashcards):
      - the three ratings appear only after **Show answer**, and a rating moves to the next card (on the last card it stays, showing the rating);
      - keys, while no input or textarea has the focus: Space or Enter reveals, 1, 2 and 3 rate once revealed, and ← and → move;
      - "Only shaky and couldn't", a switch, narrows the deck to the cards rated so when it's turned on. The deck stays fixed until the next toggle, so rating a card "Could explain it" doesn't pull it out from under you. With nothing to show: "Nothing rated shaky or couldn't.";
      - the card and the switch live in the page, so Study and back keeps them.
11. **The whiteboard agent writes from the pack only.** It writes from the project's items, decisions, defaults and open items, the document it's based on, the repo profile's conventions, `sensitiveData`, schema and apps, and the rules file. It Reads the rules file and the document first, and an item's file for what the pack cuts short. It may Read, Grep and Glob the clone to check a claim, and says so with `known` only when it read it.

## Global Constraints

Everything in Plans 1–5's Global Constraints still applies:
- **Platform:** Node `>=22.12`, pnpm `10.x`, TypeScript `strict`, ESM.
- **The public repo stays generic.** Examples use the made-up "Acme" app, with no real company names, personal paths or emails.
- **The config folder** is `~/.dev-plumbing/`, overridable with `DEV_PLUMBING_HOME`. Never overwrite a user's config file except through an explicit **Reset to default** or **Detect again**.
- **Writes are atomic** (`writeFileAtomic` / `writeJsonAtomic`). The service is the only writer of the projects folder, always under the project's lock.
- **Subagents** get only `Read`, `Grep`, `Glob` and their dp tools.
- **The service** binds `127.0.0.1` with the Host, token and same-origin guard.
- **The Ink wash theme**, exactly per §16:
  - colour only as dots, text and thin lines;
  - no tinted boxes;
  - tokens only;
  - one primary button per screen;
  - sentence-case copy;
  - one column under 768 px, with no sideways scrolling.
- **Tests:**
  - Tests clean up their temp folders (`tempDir` / `removeTempDirs`).
  - They never touch the real `~/.dev-plumbing`, never run the real `launchctl`, never install plugins and never use port 4545.
  - e2e runs on 45459 and the smoke test on 45461.
- **Commits:** every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, passed as a second `-m`, whatever model wrote it.
- **Worktree:** work in a git worktree, never in the main checkout, which runs the user's live app and plugin.

New in this plan:
- **Files** in the project folder: `whiteboard/request.json`, `whiteboard/defense.json` and `whiteboard/practice.json`. In a clone, `<plan folder>/<name>.whiteboard-defense.md`, written only by Export.
- **Names:**
  - built-in type id `defense`, titled "Defense questions";
  - `dp_wait` kind `whiteboard`, with `finished: { whiteboard: <request id>, whiteboardError?: <the subagent's Failed: line> }`;
  - `dp_context` input `whiteboard: true`, whose pack has `rulesFile` and `documentFile` to Read;
  - the tool `dp_whiteboard`, which makes eight dp tools;
  - the agent `dev-plumbing:whiteboard` (`plugin/agents/whiteboard.md`);
  - the item field `fromDefense`, with `text` on items sent to Questions or Concerns;
  - the web route `/p/$repo/$project/defense?mode=study|practice`;
  - the browser routes under `/api/projects/:repo/:id/whiteboard`, and the Claude route `POST /api/claude/whiteboard`.
- **Limits:**
  - the defense JSON at most 120,000 characters (the agent aims for about 40,000);
  - `levelReasons` 1–10 (each 1–500 characters);
  - each section's claims 1–40 (claim text 1–4,000), tables at most 5 (title 1–200, columns 1–8, rows 1–50, cells up to 1,000), `diagram` up to 6,000;
  - questions 1–40 (`q` 1–500, `a` 1–4,000);
  - concerns 0–40 (text 1–2,000);
  - checklist 0–40 lines (each 1–300); the service copies the rules file's first 40 `[ ]` lines, each cut to 300;
  - a question to Claude 1–20,000 characters;
  - in the whiteboard pack, an item's body cut to 800 characters; a 40-item plan with long bodies gives under 60,000 characters of JSON;
  - a failed request's reason (the subagent's own line) cut to 500 characters.
- **Exact copy, used verbatim:**
  - **Status lines** (service and page):
    - "Waiting for Claude to write the Whiteboard Defense."
    - "Claude is writing the Whiteboard Defense. Threads you send now wait until it's done." (the page)
    - "No Claude window is listening. Run /dev-plumbing in any clone."
  - **The failed reason:** "The whiteboard subagent didn't send a Whiteboard Defense.", or the subagent's own `Failed: …` line, cut to 500 characters.
  - **Generate refusals** (ConflictError):
    - "The plan is still importing. Generate the Whiteboard Defense once that's done."
    - "The Whiteboard Defense is already being written."
  - **Save refusal** (ConflictError): `There's no Whiteboard Defense request ${id} waiting for a defense.`
  - **Save problems.** InputError via `nothingSaved(problems, 'call dp_whiteboard again with the whole defense')`:
    - `The defense is ${n} characters of JSON; the most is 120,000.`
    - `sections: ${id} is missing.`
    - `sections: ${id} is there more than once.`
    - `sections: ${id} needs at least one claim. Mark what isn't known as unknown.`
    - `${where}: diagramItemId "${id}" isn't an item with a diagram. Use one of: ${ids}.` When there are none: `${where}: diagramItemId "${id}" isn't an item with a diagram, and this project has none. Leave diagramItemId out.`
    - `${where}: table ${t} row ${r} has ${k} cells; it needs ${n}, one per column.`
    - `questions: question ${i} repeats question ${j}.`
    - with no checklist in the rules file: `checklist: the rules file has no checklist, so send one.` and `checklist: line ${i} repeats line ${j}.`

    `${where}` is `sections: ${id}`, and `t`/`r`/`i`/`j` count from 1. Shape problems from the Zod schema are listed as `${path}: ${message}`, with the path joined by dots: `dp_whiteboard` passes the defense on unchecked, so they always reach the subagent with the rest.
  - **The Claude route's `next`** after a save: "Saved. The user reads it in the app. Reply with your one line."
  - **`/wait`'s `next` for `kind: 'whiteboard'`:** `Start one dev-plumbing:whiteboard subagent (model ${model}) with the prompt "Write the Whiteboard Defense for repo ${repo}, plumbing project ${id}, request ${request}." When it returns, call dp_wait with finished: { whiteboard: "${request}" }.`
  - **The agent's one line:**
    - "Whiteboard Defense written: level <n>, <q> questions, <c> concerns."
    - "Failed: <what went wrong>"
    - "Failed: the request was cancelled or replaced." when the service says there's no request waiting
  - **The agent's rule on `previous`:** "When a question or an unknown in `previous` still applies, keep its wording exactly: Practice keeps your ratings, and sent unknowns are matched, by text."
  - **The agent's size rule:** "Keep the whole defense under about 40,000 characters of JSON: one or two sentences a claim, usually 3–8 claims a section."
  - **`dp_whiteboard`'s `defense`:** "The whole defense: see your instructions for its shape".
  - **A clipped body in the pack** ends "… (clipped: Read file for the rest)".
  - **Out of date:**
    - "Out of date: a final was accepted since this was generated."
    - "Out of date: the plan changed since this was generated."
  - **Levels:** "Lightweight" / "Standard" / "High risk".
  - **Bases:** "Known" / "Inferred" / "Unknown" / "Verify before release".
  - **Severities:** "Critical" / "High" / "Medium" / "Low" / "Informational".
  - **The 13 section titles,** in order:
    1. "Executive summary"
    2. "Whiteboard diagram"
    3. "System walkthrough"
    4. "Data and state"
    5. "Security model"
    6. "Failure analysis"
    7. "Dependencies and tradeoffs"
    8. "Complexity review"
    9. "Production readiness"
    10. "Questions the engineer should be able to answer"
    11. "Release concerns"
    12. "Unknowns"
    13. "Checklist"
  - **The Defense type:**
    - title "Defense questions";
    - empty message "Nothing asked about the Whiteboard Defense yet.";
    - `postReply`'s problems:
      - "A Defense thread can't change the draft. Leave out change and smallEdits. If the plan needs to change, add a Questions or Concerns item with newItems."
      - "A Defense thread can add only Questions or Concerns items."
      - "A Defense thread can resolve only itself."
  - **Ask and send refusals:**
    - 409: "There's no Whiteboard Defense yet."
    - 409: "The Whiteboard Defense changed since this page loaded. Reload it."
    - 400: "That part of the Whiteboard Defense doesn't exist."
    - 400: "Only a claim marked Unknown or Verify before release can be sent to Questions."
    - 409: `That's already in ${typeTitle}.`
    - 409: `There's no enabled ${typeName} type to send it to. Turn it on in Plumbing rules.` `typeName` is "Questions" or "Concerns".
  - **Send's message:**
    - `Added to ${typeTitle}. Claude will suggest answers.`
    - While the window is busy: `Added to ${typeTitle}. Claude is busy, and will suggest answers when it's done.`
    - With no window listening: `Added to ${typeTitle}. No Claude window is listening. Run /dev-plumbing in any clone.`
  - **A sent item:**
    - its thread's system line: "Sent from the Whiteboard Defense.";
    - a claim's body: `From the Whiteboard Defense (${n}. ${sectionTitle}), marked ${basisLabel}:\n\n${text}`;
    - a concern's body: `From the Whiteboard Defense's release concerns, marked ${severityLabel}:\n\n${text}`.
  - **An asked item's summary:**
    - `About ${n}. ${sectionTitle}` for a section;
    - `About the question: ${q}` for a question;
    - `About the ${severityLabel.toLowerCase()} concern: ${text}` for a concern.

    Each is clipped to 300 characters with "…".
  - **Export:**
    - "There's no Whiteboard Defense to export yet." (409);
    - when writing the file or recording the export fails, the file is put back and the 409 says `Export didn't finish (${reason}). ${path} in ${clone} is as it was. Try again.`, or, if putting it back failed, `Export didn't finish (${reason}), and ${path} in ${clone} couldn't be put back. Check it, then try again.`;
    - another repo's profile gets Accept's existing message.
  - **Accept's clone messages** with the verb as a parameter:
    - `${rel} in ${clone} is a link. ${verb} won't write through it: remove the link, then ${verb.toLowerCase()} again.`
    - `${planRel} in ${clone} is or goes through a link. ${verb} writes only into real folders inside the clone.`

    Every other message is unchanged. Accept passes "Accept" and Export passes "Export".
  - **The page:**
    - the title "Whiteboard Defense"; the line "If you ship it, you should be able to explain it.";
    - with no defense yet: "Claude writes a defense of this plan: how it works, what could fail and what's still unknown. Then you study it and practise explaining it.";
    - the buttons "Generate", "Regenerate", "Try again", "Cancel", "Dismiss" and "Export .md";
    - the meta line `Level ${n} · ${levelName} · Based on the ${doc} (v${version}) · Generated ${date}`, where `${date}` is `formatUpdated(generatedAt)` ("just now", "2 hr ago", "yesterday" or a date such as "Oct 3"), as the Finalize page shows times;
    - the segmented control, labelled "Whiteboard Defense mode": "Study" / "Practice";
    - "Contents";
    - each section's heading `${n}. ${title}`;
    - "Ask Claude about this"; the textarea labelled "Your question", with the placeholder "What do you want to ask?"; "Send";
    - "Send to Questions" / "Send to Concerns"; "In Questions ›" / "In Concerns ›";
    - `Readiness ${n}%`, and the meter labelled "Readiness";
    - `Card ${i} of ${n}`; "Show answer"; "Could explain it" / "Shaky" / "Couldn't"; "Previous" / "Next";
    - the switch "Only shaky and couldn't", and with nothing to show "Nothing rated shaky or couldn't.";
    - `${could} could explain · ${shaky} shaky · ${couldnt} couldn't · ${unrated} not yet`;
    - "Checklist"; `${ticked} of ${total} ticked`;
    - "Export into", each clone's path with " (source)" after the source clone's; "Replaces the file there." once the defense has been exported; `Exported to ${clone}/${path}.`; with no clone on this Mac, "None of the clones this project was opened from is on this Mac." (the accept form's line);
    - "No questions in this defense."; "None." for no release concerns (as in the Markdown);
    - the ask form's "Cancel"; a section 2 diagram item's link "<item title> ›";
    - the aria labels "Export" (the export form), "Readiness", "Your rating" (the rating chips), and "Ticked" / "Not ticked" (Study's read-only checklist).
  - **The nav:** "Whiteboard Defense", with a trailing "Writing…", "Not yet" or "Out of date".

## Review Focus

These five situations aren't the main path, but they're the most likely to hurt someone using this. Each has a test in the task named.

1. **Asking Claude must never get in Finalize's way, or steer the plan.**
   - A Defense thread never shows on the Finalize checklist, whether it's with Claude, waiting for you, parked or holding a proposal.
   - Its items and decisions never make a Finalize proposal stale, and never reach the final.
   - Its decisions never reach another thread's pack or the main window's cross-check, and it can resolve only itself.
   - A Defense thread can never change the draft, and can add only Questions or Concerns items. Asking never holds up Finalize, unless Claude adds a Questions or Concerns item, which is a plan item like any other.

   Tested in Task 2 ("a Defense thread never touches Finalize").
2. **A bad defense from the subagent.**
   - It's refused whole, with every problem listed, and nothing is written: a missing or doubled section, a section with no claims, a ragged table, an unknown diagram item, a question asked twice, or one too big.
   - The request stays `writing`, so the subagent can send it again.
   - The last saved defense is exactly as it was.

   Tested in Task 3 ("a refused defense leaves the last one as it was").
3. **Out of date when it should be, and only then.**
   - Changes that make it stale: a change to the draft, a new decision, an item changed or parked, a Questions or Concerns item Claude added, a final accepted.
   - Things that never do: asking Claude (unless Claude adds a Questions or Concerns item, which is a plan item like any other), sending an unknown, rating a card, ticking a line, marking reviewed.

   Tested in Task 3 ("only plan changes make the defense out of date").
4. **A request that's never stuck.**
   - A window that comes back without saving fails the request, with the reason, and Try again works.
   - A window that went away gives its request back to another window.
   - Cancel works in every state.
   - Generating while importing, or twice, is refused.

   Tested in Task 7 ("a whiteboard request is never stuck").
5. **Export writes one file, only where it should.**
   - It refuses a folder that isn't a clone of this repo, a folder inside a clone, a plan folder reached through a link, and a target that's a link.
   - It writes only `<name>.whiteboard-defense.md`, and never touches the final or its assets.

   Tested in Task 6 ("export writes one file next to the plan and nothing else").

---

## File Structure

Every file the tasks create or change, tests and test helpers included.

```
dev-plumbing/
  SPEC.md                                   # Task 13: §7's "only write" line and file tree; §13.1's stored defense
  README.md                                 # Task 13
  docs/how-it-works.md                      # Task 13
  scripts/smoke-user.mjs                    # Task 13: the "user" generates a defense, asks about it, sends an unknown
  scripts/smoke-claude.sh                   # Task 13: the runner reports it from round 2's transcript
  smoke/RESULTS.md                          # Task 13: the controller's run
  plugin/skills/dev-plumbing/SKILL.md       # Task 9: kind whiteboard, a section to write it
  plugin/agents/whiteboard.md               # Task 9: new
  plugin/agents/thread.md                   # Task 9: a Defense thread
  packages/
    core/src/
      schemas/whiteboard.ts                 # Task 1: the defense, its input, request, practice; section and label constants
      schemas/whiteboard.test.ts            # Task 1
      schemas/project.ts                    # Task 1: item fromDefense
      schemas/views.ts                      # Tasks 1, 3: WhiteboardView, DefenseLink, PracticeView, ProjectHome.defense
      schemas/index.ts                      # Task 1: export whiteboard
      store/io.ts                           # Task 1: projectFiles whiteboard paths
      store/whiteboard.ts                   # Tasks 1, 3: read/write; basis, hash, request, save, checklistLines, stale, state
      defenseType.ts                        # Task 2: DEFENSE, DEFENSE_TYPE and its three refusals
      planChanges.ts                        # Task 2: importableTypes leaves out defense
      config.ts                             # Task 2: loadConfig adds the Defense type
      store/checklist.ts                    # Tasks 2, 5: Defense items left out; a proposal blocks only once you've written
      store/context.ts                      # Tasks 2, 4: left out of finalizePack and importPack; threadPack's decisions,
                                            #   defense and finalFile; whiteboardPack
      store/decisions.ts                    # Task 2: relevantDecisions leaves out Defense threads' decisions
      store/finalize.ts                     # Task 2: finalInputsHash and saveProposal leave Defense out
      store/reply.ts                        # Task 2: a Defense thread can't change the draft, add other items or resolve others
      store/update.ts                       # Tasks 2, 3: updateRefusal skips Defense threads; planVersionSinceFinal
      store/projects.ts                     # Task 3: ProjectHome.defense; uses planVersionSinceFinal
      store/defenseMarkdown.ts              # Task 4: the defense, and one part of it, as Markdown
      store/defenseItems.ts                 # Task 5: ask, send, links; currentDefense and NO_PART, which practice shares
      store/practice.ts                     # Task 6: ratings, ticks, readiness
      store/cloneTarget.ts                  # Task 6: clone checks shared by Accept and Export
      store/accept.ts                       # Task 6: uses cloneTarget
      store/defenseExport.ts                # Task 6: Export .md, with the diagram as Mermaid
      index.ts                              # Tasks 1–6: exports
    core/test/
      fixtures.ts                           # Task 1: validDefenseInput() and storedDefense()
      whiteboard.test.ts                    # Tasks 1, 3
      defenseType.test.ts                   # Task 2
      config.test.ts finalize.test.ts       # Task 2
      projects.test.ts                      # Task 3
      defenseMarkdown.test.ts whiteboardPack.test.ts   # Task 4
      defenseItems.test.ts                  # Task 5
      practice.test.ts defenseExport.test.ts           # Task 6
    service/src/
      routes/claude.ts                      # Task 7: /wait whiteboard, /context whiteboard, /whiteboard, /open requeue
      routes/clones.ts                      # Task 8: clonesOf, moved out of finalize.ts, and knownClone
      routes/finalize.ts                    # Task 8: imports clonesOf and knownClone
      routes/whiteboard.ts                  # Task 8: the browser's whiteboard routes
      routes/threads.ts                     # Tasks 2, 8: POST …/items refuses built-in types; uses submitResponse
      routes/respond.ts                     # Task 8: submitResponse, moved out of threads.ts
      routes/config.ts                      # Task 2: a new rules file's order leaves built-in types out
      app.ts                                # Task 8: mount whiteboard routes
    service/test/
      threads.test.ts config.test.ts        # Task 2
      whiteboardSetup.ts                    # Task 7: the setup the whiteboard service tests share (Task 8 reuses it)
      whiteboard.test.ts                    # Task 7
      whiteboard-routes.test.ts             # Task 8
    mcp/src/tools.ts                        # Task 9: dp_whiteboard, kind whiteboard, finished.whiteboard(Error), dp_context whiteboard
    mcp/test/tools.test.ts plugin.test.ts bridge.integration.test.ts   # Task 9
    web/src/
      api/client.ts                         # Task 10: whiteboard methods
      router.tsx                            # Task 10: the defense route
      pages/ProjectHeader.tsx               # Task 10: the button is a link
      pages/ProjectNav.tsx                  # Task 10: the Review link
      pages/ProjectLayout.tsx               # Task 10: phone tab, one primary
      pages/ProjectHeader.test.tsx ProjectNav.test.tsx   # Task 10
      pages/defense/DefensePage.tsx         # Task 10: status, generate, dismiss, export, mode switch, Practice's place
      pages/defense/ExportForm.tsx          # Task 10
      pages/defense/testkit.ts              # Task 10: the component tests' data (Tasks 11 and 12 use it)
      pages/defense/DefensePage.test.tsx    # Task 10
      pages/defense/StudyView.tsx           # Tasks 10, 11 (Task 11 replaces it)
      pages/defense/AskClaude.tsx           # Task 11
      pages/defense/labels.tsx              # Task 11: basis and severity labels with their colours (BasisLabel is JSX)
      pages/defense/StudyView.test.tsx AskClaude.test.tsx   # Task 11
      pages/defense/PracticeView.tsx        # Tasks 10, 12 (Task 12 replaces it)
      pages/defense/Flashcard.tsx           # Task 12
      pages/defense/DefenseChecklist.tsx    # Task 12
      pages/defense/PracticeView.test.tsx   # Task 12
      components/ProgressBar.tsx            # Task 12: an optional label, so the meter is named "Readiness"
      components/components.test.tsx        # Task 12
    web/e2e/
      claude.ts                             # Task 10: defenseInput() and writeDefense()
      defense.spec.ts                       # Tasks 10, 11
      defense-practice.spec.ts              # Task 12
```

## Contracts

The exact names and types the tasks share. A task's implementer sees only their own task, so every cross-task name is fixed here.

### Core: the defense's types and files (Task 1)

```ts
// schemas/whiteboard.ts
export const basisValues = ['known', 'inferred', 'unknown', 'verify'] as const;
export type Basis = (typeof basisValues)[number];
export const severityValues = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof severityValues)[number];
export const ratingValues = ['could', 'shaky', 'couldnt'] as const;
export type Rating = (typeof ratingValues)[number];

/** The ten prose sections, in the order Study shows them; n is the section's number among the 13. */
export const DEFENSE_SECTIONS = [
  { id: 'summary', n: 1, title: 'Executive summary' },
  { id: 'diagram', n: 2, title: 'Whiteboard diagram' },
  { id: 'walkthrough', n: 3, title: 'System walkthrough' },
  { id: 'data', n: 4, title: 'Data and state' },
  { id: 'security', n: 5, title: 'Security model' },
  { id: 'failure', n: 6, title: 'Failure analysis' },
  { id: 'tradeoffs', n: 7, title: 'Dependencies and tradeoffs' },
  { id: 'complexity', n: 8, title: 'Complexity review' },
  { id: 'readiness', n: 9, title: 'Production readiness' },
  { id: 'unknowns', n: 12, title: 'Unknowns' },
] as const;
export type DefenseSectionId = (typeof DEFENSE_SECTIONS)[number]['id'];
export const sectionIds = DEFENSE_SECTIONS.map((s) => s.id) as [DefenseSectionId, ...DefenseSectionId[]];
/** Sections 10, 11 and 13, which have their own shapes. */
export const DEFENSE_PARTS = {
  questions: { n: 10, title: 'Questions the engineer should be able to answer' },
  concerns: { n: 11, title: 'Release concerns' },
  checklist: { n: 13, title: 'Checklist' },
} as const;
export const LEVEL_NAMES: Record<1 | 2 | 3, string> = { 1: 'Lightweight', 2: 'Standard', 3: 'High risk' };
export const BASIS_LABELS: Record<Basis, string> = { known: 'Known', inferred: 'Inferred', unknown: 'Unknown', verify: 'Verify before release' };
export const SEVERITY_LABELS: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Informational' };

export const claimSchema = z.object({ text: z.string().trim().min(1).max(4000), basis: z.enum(basisValues) });
export type Claim = z.infer<typeof claimSchema>;
export const defenseTableSchema = z.object({
  title: z.string().trim().min(1).max(200),
  columns: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  rows: z.array(z.array(z.string().max(1000))).min(1).max(50),
});
export type DefenseTable = z.infer<typeof defenseTableSchema>;

/** What the whiteboard subagent sends with dp_whiteboard. */
export const defenseInputSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  levelReasons: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  sections: z.array(
    z.object({
      id: z.enum(sectionIds),
      claims: z.array(claimSchema).max(40),          // at least one: saveDefense says so in its own words
      tables: z.array(defenseTableSchema).max(5).optional(),
      diagram: z.string().max(6000).optional(),       // a plain-text diagram, shown as written
      diagramItemId: z.string().min(1).optional(),     // an item of this project whose drawing is a diagram
    }),
  ).max(20),                                           // duplicates and missing ids: saveDefense says so
  questions: z.array(z.object({ q: z.string().trim().min(1).max(500), a: z.string().trim().min(1).max(4000), basis: z.enum(basisValues) })).min(1).max(40),
  concerns: z.array(z.object({ severity: z.enum(severityValues), text: z.string().trim().min(1).max(2000), basis: z.enum(basisValues) })).max(40),
  checklist: z.array(z.string().trim().min(1).max(300)).max(40),   // [] when the rules file has a checklist: the service copies it
});
export type DefenseInput = z.infer<typeof defenseInputSchema>;

/** whiteboard/defense.json. */
export const whiteboardDefenseSchema = z.object({
  id: z.string().min(1),                               // newId('w', now)
  generatedAt: z.string(),
  basedOn: z.object({ kind: z.literal('plan'), doc: z.enum(['final', 'draft']), version: z.number().int().min(1), inputsHash: z.string() }),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  levelReasons: z.array(z.string()),
  sections: z.array(z.object({
    id: z.enum(sectionIds), title: z.string(), claims: z.array(claimSchema),
    tables: z.array(defenseTableSchema), diagram: z.string().nullable(), diagramItemId: z.string().nullable(),
  })),                                                 // exactly DEFENSE_SECTIONS, in that order
  questions: z.array(z.object({ id: z.string(), q: z.string(), a: z.string(), basis: z.enum(basisValues) })),   // ids q1, q2, …
  concerns: z.array(z.object({ id: z.string(), severity: z.enum(severityValues), text: z.string(), basis: z.enum(basisValues) })),   // c1, …; most severe first
  checklist: z.array(z.object({ id: z.string(), text: z.string() })),   // k1, …
  exportedTo: z.object({ clone: z.string(), path: z.string(), at: z.string() }).optional(),
});
export type WhiteboardDefense = z.infer<typeof whiteboardDefenseSchema>;
export type DefenseExport = NonNullable<WhiteboardDefense['exportedTo']>;

export const whiteboardStateValues = ['requested', 'writing', 'failed'] as const;
export type WhiteboardState = (typeof whiteboardStateValues)[number];
/** whiteboard/request.json. Absent when no defense is being asked for. */
export const whiteboardRequestSchema = z.object({
  id: z.string().min(1),                               // newId('g', now)
  state: z.enum(whiteboardStateValues),
  requestedAt: z.string(),
  pickedUpAt: z.string().optional(),
  pickedUpBy: z.string().optional(),
  /** At pick-up: what the subagent reads. saveDefense copies these into basedOn. */
  inputsHash: z.string().optional(),
  basedOn: z.object({ doc: z.enum(['final', 'draft']), version: z.number().int().min(1) }).optional(),
  requeuedAt: z.string().optional(),
  failedAt: z.string().optional(),
  reason: z.string().optional(),
});
export type WhiteboardRequest = z.infer<typeof whiteboardRequestSchema>;

/** whiteboard/practice.json, keyed by the question's text and the checklist line's text (trimmed). */
export const practiceSchema = z.object({
  ratings: z.record(z.object({ rating: z.enum(ratingValues), at: z.string() })).default({}),
  ticks: z.record(z.string()).default({}),            // text -> when ticked
});
export type Practice = z.infer<typeof practiceSchema>;

export const defenseRefKinds = ['section', 'question', 'concern', 'claim'] as const;
export type DefenseRefKind = (typeof defenseRefKinds)[number];
/**
 * A part of a defense. section: a DefenseSectionId; question: q<n>; concern: c<n>;
 * claim: `${sectionId}.${index}` (index from 0 in that section's claims). `text`: the part's text, on items sent from it.
 */
export const defenseRefSchema = z.object({ id: z.string(), kind: z.enum(defenseRefKinds), ref: z.string(), text: z.string().optional() });
export type DefenseRef = z.infer<typeof defenseRefSchema>;
```

- `itemSchema` gains `fromDefense: defenseRefSchema.optional().catch(undefined)`: a malformed reference reads as none, so it can never hide the item, as with `anchor`. It's set on every item the whiteboard makes, both Defense items and sent Questions/Concerns items, and `id` is the defense's `id`. Sent items also record `text`, the claim's or concern's text, so a regenerated defense matches them by kind and text.
- `projectFiles(dir)` gains `whiteboard: <dir>/whiteboard`, `whiteboardRequest`, `defense` and `practice` (the three files).

```ts
// store/whiteboard.ts (Task 1 part)
/** whiteboard/request.json, or null when missing or damaged. */
export async function readWhiteboardRequest(dir: string): Promise<WhiteboardRequest | null>;
/** whiteboard/defense.json, or null when missing or damaged. */
export async function readDefense(dir: string): Promise<WhiteboardDefense | null>;
/** whiteboard/practice.json; empty ({ ratings: {}, ticks: {} }) when missing or damaged. */
export async function readPractice(dir: string): Promise<Practice>;
export async function writeWhiteboardRequest(dir: string, r: WhiteboardRequest): Promise<void>;
export async function writeDefense(dir: string, d: WhiteboardDefense): Promise<void>;
export async function writePractice(dir: string, p: Practice): Promise<void>;
export async function removeWhiteboardRequest(dir: string): Promise<void>;   // rm, force
```

The writes create `whiteboard/` as needed, and use `writeJsonAtomic`.

```ts
// schemas/views.ts (Task 1)
export type DefenseLink = { kind: DefenseRefKind; ref: string; itemId: string; threadId: string; typeId: string; title: string; status: DisplayStatus };
export type PracticeView = {
  ratings: Record<string, Rating>;          // by question id, for the current defense
  ticks: string[];                          // checklist ids ticked
  readiness: number;                        // 0–100, half flashcards and half checklist (Decision 8)
  counts: { could: number; shaky: number; couldnt: number; unrated: number; ticked: number; checklist: number };
};
export type WhiteboardView = {
  request: WhiteboardRequest | null;
  defense: WhiteboardDefense | null;
  stale: string | null;                     // the Out of date line, or null
  practice: PracticeView | null;            // null with no defense
  asked: DefenseLink[];                     // Defense threads about the current defense, oldest first
  sent: DefenseLink[];                      // Questions/Concerns items sent from it
  canGenerate: boolean;                     // false while importing or while a request is requested or writing
  generateRefusal: string | null;           // why not, in the refusal's exact copy
  listening: ListeningState;
  clones: { path: string; source: boolean }[];
  exportPath: string;                       // `${dirname(sourcePath)}/${name}.whiteboard-defense.md`, relative to a clone
};
export type GenerateWhiteboardResponse = { request: WhiteboardRequest; listening: ListeningState; message: string };
export type AskDefenseResponse = SubmitResponse & { threadId: string };
export type SendFromDefenseResponse = { itemId: string; threadId: string; typeId: string; typeTitle: string; listening: ListeningState; message: string };
// ProjectHome gains (Task 3):
defense: { ready: boolean; stale: boolean; state: WhiteboardState | null };
```

### Core: the Defense type (Task 2)

```ts
// defenseType.ts
export const DEFENSE = 'defense';
export const DEFENSE_TYPE: PlumbingType;   // header below; file '', body = the rules text; builtIn: true
export const DEFENSE_CHANGE_REFUSAL = "A Defense thread can't change the draft. Leave out change and smallEdits. If the plan needs to change, add a Questions or Concerns item with newItems.";
export const DEFENSE_NEW_ITEM_TYPES: readonly string[];   // ['questions', 'concerns']
export const DEFENSE_NEW_ITEMS_REFUSAL = 'A Defense thread can add only Questions or Concerns items.';
export const DEFENSE_RESOLVE_REFUSAL = 'A Defense thread can resolve only itself.';
```

- **Header:** `{ id: 'defense', title: 'Defense questions', order: 100, screen: 'list', emptyMessage: 'Nothing asked about the Whiteboard Defense yet.', fields: [], answerPresets: [], timeline: false, enabled: true, builtIn: true }`.
- **Rules body** (`## What to look for`, `## Rules`, `## Done when`), in short:
  - each thread is the person's question about one part of the project's Whiteboard Defense: the item's body is that part, and the pack's `defense` is the whole defense;
  - answer plainly from the plan, the draft, the decisions and code you can read, and say which statements are known, inferred or unknown;
  - never offer a change to the draft;
  - when the answer needs nothing more from the person, send it with `resolve` and a one-line decision that sums it up, so it doesn't wait in their Inbox; they can reply to carry on; resolve only this thread;
  - offer options only when the person must choose;
  - when the answer shows a gap or a risk the plan doesn't cover, add a Questions or Concerns item with `newItems` (no other type) and say so;
  - done when the question is answered and the thread resolved (resolving needs a decision, and decisions in Defense threads are left out of both hashes and of other threads).
- **`loadConfig`** adds `DEFENSE_TYPE` unless the user has a `plumbing/defense.md` that loads. It's sorted in by order, so it comes last.
- **`importableTypes`** leaves out `t.id === DEFENSE` as well as built-ins.
- **Left out by id (`item.type === DEFENSE`):**
  - `checklistFrom`;
  - `finalizePack` items;
  - `finalInputsHash`, its items and the decisions whose `threadId` is a Defense item's thread;
  - `saveProposal`'s token items, along with `PLAN_CHANGES`. A token naming either now gets `<token>: there's no item "<id>".` (a Plan changes token used to get `"<title>" isn't a diagram item.`), so Task 2 replaces `finalize.test.ts`'s Plan changes token test with one covering both;
  - `importPack.existingItems`.
- **`postReply`,** when the thread's item is of type `DEFENSE`, adds each of these to the problems, once: `DEFENSE_CHANGE_REFUSAL` for any option with a `change` (in `options`) or any `smallEdits`; `DEFENSE_NEW_ITEMS_REFUSAL` for a `newItems` entry whose type isn't in `DEFENSE_NEW_ITEM_TYPES`; `DEFENSE_RESOLVE_REFUSAL` for `resolve.itemIds` naming any item but the thread's own. A reply with `text` and `resolve` resolves the thread as on any other, with Claude's answer kept in it.
- **Decisions made in Defense threads stay there:** `threadPack.decisions` leaves out the active decisions whose `threadId` is a Defense item's thread, except in a Defense item's own pack, which has them all; `relevantDecisions` (`store/decisions.ts`, the main window's cross-check) sends such a decision only with its own thread, never for an item it names or one linked to it.
- **`updateRefusal`** doesn't count a Defense thread that's with Claude: it can't change the draft.
- **`POST …/items`** (`service/src/routes/threads.ts`) finds the type with `t.enabled && !t.builtIn`, so neither built-in can be made by hand. The existing "isn't an enabled plumbing type" message is used.
- **`POST /api/rules`** (`service/src/routes/config.ts`) gives a new rules file the order after the highest rules file's, leaving built-in types out. Otherwise Defense's order 100 would give it 101.

### Core: generating, saving and Out of date (Task 3)

```ts
// store/whiteboard.ts (Task 3 part)
export const WHITEBOARD_RETRY = 'call dp_whiteboard again with the whole defense';
export const WHITEBOARD_GAVE_UP = "The whiteboard subagent didn't send a Whiteboard Defense.";
export const MAX_DEFENSE_CHARS = 120_000;
/**
 * The final while it's current (project.docs.final set, changesSinceFinal(history, exportedTo?.at) === 0 and
 * planVersionSinceFinal(project) === null), else the draft, with the current plan version.
 */
export async function defenseBasis(dir: string): Promise<{ doc: 'final' | 'draft'; version: number; text: string }>;
/**
 * Decision 5: sha256 of stable({ doc, document, items, parked, decisions }). `doc` is hashed too, so a final whose text
 * equals the draft still makes a defense of the draft out of date.
 */
export async function defenseInputsHash(dir: string): Promise<string>;
/** The rules file's `[ ]` lines (^\s*(?:[-*]\s+)?\[ \]\s+(.+?)\s*$), in order, each once, the first 40, each cut to 300. */
export function checklistLines(rules: string): string[];
/** Throws ConflictError: importing; a request already requested or writing (exact copy). Replaces a failed one. */
export async function requestWhiteboard(dir: string, o?: { now?: Date }): Promise<WhiteboardRequest>;
/** requested -> writing, with inputsHash and basedOn. Null when there's nothing to take. */
export async function pickUpWhiteboard(dir: string, windowId: string, now?: Date): Promise<WhiteboardRequest | null>;
/**
 * Saves the subagent's defense for a request that's writing: ConflictError (exact copy) for any other id or state.
 * Checks the whole payload (the Zod schema, then size, sections, claims, tables, diagram items, repeated questions, the
 * checklist) and refuses with every problem (nothingSaved, WHITEBOARD_RETRY). `checklist` is the rules file's lines:
 * when it has any, it's the defense's checklist and the payload's is ignored; otherwise the payload's must have lines,
 * each once. Then writes defense.json, then removes request.json.
 */
export async function saveDefense(dir: string, o: { requestId: string; defense: unknown; types: PlumbingType[]; checklist?: string[]; now?: Date }): Promise<WhiteboardDefense>;
/** A window back without saving: writing -> failed, with `error` (cut to 500) or WHITEBOARD_GAVE_UP, only for its own request. */
export async function finishWhiteboard(dir: string, o: { requestId: string; windowId: string; error?: string; now?: Date }): Promise<void>;
/** writing, picked up by a window that's gone -> requested again, with pickedUpAt, pickedUpBy, inputsHash and basedOn cleared. True when it requeued. */
export async function requeueWhiteboard(dir: string, isAlive: (windowId: string) => boolean, now?: Date): Promise<boolean>;
/** Removes request.json, whatever its state. The defense is untouched. */
export async function cancelWhiteboard(dir: string): Promise<void>;
/** The Out of date line for this defense, or null when it's current (Decision 5). "A final was accepted" when it's of the draft and the basis is now the final. */
export async function defenseStale(dir: string, defense: WhiteboardDefense): Promise<string | null>;
/** For the header and nav. Never throws: if the stale check does, it's { ready: true, stale: false, state }. */
export async function defenseStatus(dir: string): Promise<ProjectHome['defense']>;
/** The generate refusals, thrown by requestWhiteboard and shown by the page's generateRefusal. */
export const WHITEBOARD_IMPORTING = "The plan is still importing. Generate the Whiteboard Defense once that's done.";
export const WHITEBOARD_UNDER_WAY = 'The Whiteboard Defense is already being written.';
/** The items diagramItemId may name (saveDefense) and the pack offers (whiteboardPack.diagramItemIds). */
export async function defenseDiagramItemIds(dir: string, types: PlumbingType[]): Promise<string[]>;
```

- "A diagram item" (`defenseDiagramItemIds`) is an item of an enabled type whose `dataKindOf(type)` is `'diagram'`, which isn't parked and has `data`, in id order.
- `saveDefense` assigns the ids, takes the titles from `DEFENSE_SECTIONS`, and orders the sections as `DEFENSE_SECTIONS` does. It sorts concerns by severity (critical first; stable), and sets `basedOn` from the request (falling back to `defenseBasis` and `defenseInputsHash` now, if the request has none). It keeps `exportedTo` unset. A repeated question (trimmed, whitespace collapsed) is `questions: question ${i} repeats question ${j}.`; with no rules checklist, an empty payload checklist is `checklist: the rules file has no checklist, so send one.` and a repeated line `checklist: line ${i} repeats line ${j}.`
- `planVersionSinceFinal(project: PlumbingProject): number | null` moves from `loadProjectHome`'s inline expression into `store/update.ts`, beside `changedDraft`, so the Finalize page and `defenseBasis` share it.
- `loadProjectHome` fills `defense` with `defenseStatus`, so a defense whose document can't be read never breaks the home.

### Core: the pack and Markdown (Task 4)

```ts
// store/context.ts
export type WhiteboardPack = {
  project: { repo: string; id: string; title: string; sourcePath: string; name: string };
  rulesFile: string;                              // absolute: outputs/whiteboard-defense.md, or the shipped one, to Read
  basedOn: { doc: 'final' | 'draft'; version: number };
  documentFile: string;                           // absolute: docPath(dir, the final or the draft defenseBasis picks), to Read
  items: (FinalizePack['items'][number] & { file: string; data: unknown })[];   // file: items/<id>.json; body cut to 800;
                                                  //   data: the drawing for a diagram item only, else null
  decisions: FinalizePack['decisions'];
  defaults: FinalizePack['defaults'];
  openItems: { itemId: string; title: string; typeTitle: string; status: DisplayStatus; blocking: boolean }[];   // not resolved or parked
  conventions: string[];
  sensitiveData: string[];                        // the repo profile's
  schema: { type: string; path: string } | null;  // the repo profile's
  apps: { name: string; path: string }[];         // the repo profile's
  sections: { id: DefenseSectionId; n: number; title: string }[];   // DEFENSE_SECTIONS: fill these
  diagramItemIds: string[];                       // what diagramItemId may name
  previous: { questions: string[]; unknowns: string[] } | null;     // the saved defense's question texts, and claims marked unknown or verify
};
export async function whiteboardPack(o: { dir: string; types: PlumbingType[]; profile?: RepoProfile; rulesFile: string }): Promise<WhiteboardPack>;
// ThreadPack gains:
defense: string | null;     // defenseMarkdown(current defense) when the item has fromDefense and a defense exists; else null
finalFile: string | null;   // docPath(dir, docs.final) when the project has a final; else null
```

- The pack's items are `finalizePack`'s items: not parked, enabled types, not Plan changes, not Defense. It shares `finalizePack`'s item and decision builders, extracted as module-private helpers, never copied. Its `diagramItemIds` is `defenseDiagramItemIds(dir, types)` (Task 3).
- **It stays small** (the MCP result cap is 25,000 tokens): a body longer than 800 characters is cut there and ends "… (clipped: Read file for the rest)", and a 40-item plan with 5,000-character bodies and five diagrams gives under 60,000 characters of JSON.

```ts
// store/defenseMarkdown.ts
/**
 * The whole defense as one Markdown document (Export .md and the thread pack). `itemTitles` (item id -> title) names a
 * section's diagram item; without it, or for an id it doesn't have, the line shows the id.
 */
export function defenseMarkdown(d: WhiteboardDefense, o: { title: string; itemTitles?: Record<string, string>; diagrams?: Record<string, string> }): string;
/** One part, for a Defense item's body: a section, a question or a concern. Null when the ref isn't there. */
export function defensePartMarkdown(d: WhiteboardDefense, kind: 'section' | 'question' | 'concern', ref: string, o?: { itemTitles?: Record<string, string> }): string | null;
/** The text and label of a claim ref (`${sectionId}.${index}`), or null. */
export function claimAt(d: WhiteboardDefense, ref: string): { section: WhiteboardDefense['sections'][number]; n: number; claim: Claim } | null;
```

The Markdown format is exact, and both Export and the tests use it:

```
# Whiteboard Defense: <title>

Level <n> (<level name>). Generated <YYYY-MM-DD> from the <doc> (v<version>).

- <level reason>
…

## <n>. <section title>

- <claim text> *(<basis label>)*
…

**<table title>**

| <col> | <col> |
| --- | --- |
| <cell> | <cell> |

```text
<diagram>
```

## 10. Questions the engineer should be able to answer

**<q>**

<a> *(<basis label>)*

## 11. Release concerns

- **<severity label>:** <text> *(<basis label>)*

## 12. Unknowns
…
## 13. Checklist

- [ ] <line>
```

- The sections come in the order 1–9, 10, 11, 12, 13.
- A section with a `diagramItemId` adds the line `Diagram: <item title> (in dev-plumbing).` after its claims. Every caller that has the project's items passes `itemTitles`: `threadPack`, `askAboutDefense` and `exportDefense`. `diagrams` (item id to a fenced Mermaid block, `diagramMermaid`) adds that block under the line: only `exportDefense` passes it.
- `|` in table cells is escaped as `\|`. Newlines in table cells become spaces.
- Any part with nothing in it (no concerns, say) says `None.`.
- A part's Markdown (`defensePartMarkdown`) is that part's block from the whole document, with its heading and no trailing newline. The whole document ends with one newline.

### Core: asking, sending and links (Task 5)

```ts
// store/defenseItems.ts
/**
 * Makes a Defense item (createdBy 'whiteboard', fromDefense, body = defensePartMarkdown) and an idle thread whose draft
 * is the question. The route then calls submit({ scope: 'thread' }). ConflictError: no defense; defenseId isn't the
 * current one. InputError: the part doesn't exist. Exact copy.
 */
export async function askAboutDefense(dir: string, o: { defenseId: string; kind: 'section' | 'question' | 'concern'; ref: string; question: string; now?: Date }): Promise<{ itemId: string; threadId: string }>;
/**
 * Makes a Questions item (from a claim marked unknown or verify) or a Concerns item (from a concern): createdBy
 * 'whiteboard', fromDefense with the part's text, the exact body; its thread with_claude with the exact system line; and
 * a service-made Submission { id: newId('s'), at, scope: 'all', drafts: {}, sent: [threadId], resolved: [], processedAt: at }.
 * Refusals (exact copy): no defense, a changed defense, a missing part, a claim that isn't unknown/verify, already sent
 * (the same defense, kind and ref, or, from any defense, a whiteboard item of the same kind with the same text, trimmed
 * and whitespace collapsed), the target type missing or disabled.
 */
export async function sendFromDefense(dir: string, o: { defenseId: string; kind: 'claim' | 'concern'; ref: string; types: PlumbingType[]; now?: Date }): Promise<{ itemId: string; threadId: string; typeId: string; typeTitle: string }>;
/**
 * asked: Defense items, and sent: other items, whose fromDefense.id is this defense's; sent also has items an earlier
 * defense sent whose kind and text match one of this defense's sendable parts, under this defense's ref. Oldest first:
 * items have no createdAt, so by when the thread started (its first message, else its draft's updatedAt), then by id.
 */
export async function defenseLinks(dir: string, defense: WhiteboardDefense): Promise<{ asked: DefenseLink[]; sent: DefenseLink[] }>;
export const SEND_TARGET = { claim: 'questions', concern: 'concerns' } as const;
export const CONCERN_SEVERITY: Record<Severity, string> = { critical: 'high', high: 'high', medium: 'medium', low: 'low', info: 'low' };
/** The refusal for a part the defense doesn't have. Practice (Task 6) uses it too. */
export const NO_PART = "That part of the Whiteboard Defense doesn't exist.";
/** The saved defense, if it's the one the page loaded. ConflictError "There's no Whiteboard Defense yet." / "The Whiteboard Defense changed since this page loaded. Reload it." Practice uses it too. */
export async function currentDefense(dir: string, defenseId: string): Promise<WhiteboardDefense>;
```

- Item ids are `uniqueId(`${typeId}-${slugify(title)}`, taken)`. Threads are `t-<itemId>`.
- A sent item is `{ id, type, title, summary: <text clipped to 300>, body, fields?, threadId, createdBy: 'whiteboard', fromDefense }`. Its title is the text with each run of whitespace made one space, clipped to 120. Concerns get `fields: { severity: CONCERN_SEVERITY[severity] }`, and questions no fields.
- An asked item's title is the question's first line, clipped to 120. Clipping keeps the first 119 characters and adds "…". An empty question is refused with `addOwnItem`'s "Write your message first." (InputError).
- **`checklist.ts`:** "A proposal is waiting for your answer." also needs a message from you in the thread (`thread.messages.some((m) => m.author === 'you')`). So Claude's suggested answers on a sent item don't block Finalize until you've written there; a sent high concern still blocks by severity, and Plan changes threads by `CONFLICT_REASON`, first.

### Core: practice and export (Task 6)

```ts
// store/practice.ts
export function practiceView(defense: WhiteboardDefense, practice: Practice): PracticeView;
/** rating null clears it. ConflictError/InputError as askAboutDefense for the defense and the question id. */
export async function ratePractice(dir: string, o: { defenseId: string; questionId: string; rating: Rating | null; now?: Date }): Promise<PracticeView>;
export async function tickPractice(dir: string, o: { defenseId: string; checklistId: string; ticked: boolean; now?: Date }): Promise<PracticeView>;
```

Both writes drop practice keys that the current defense's question texts and checklist texts don't have. `practiceView`'s readiness is round(100 × the mean of the scores there are): the cards' (could + shaky / 2) / cards and the checklist's ticked / lines; 0 with neither.

```ts
// store/cloneTarget.ts (moved from accept.ts, now exported; the verb names the action in two messages)
export type CloneVerb = 'Accept' | 'Export';
export async function checkClone(clone: string, profile: RepoProfile, home: string | undefined): Promise<string>;
export async function planFolder(clone: string, root: string, sourcePath: string, verb: CloneVerb): Promise<{ name: string; planRel: string; planDir: string }>;
export async function checkTarget(clone: string, file: string, rel: string, kind: 'file' | 'folder', verb: CloneVerb): Promise<void>;
/** The verb names what to do again in the unreadable-file message ("then accept again", "then export again"). */
export async function readOrNull(file: string, label: string, verb: CloneVerb = 'Accept'): Promise<Buffer | null>;
export function within(root: string, p: string): boolean;
// store/defenseExport.ts
/**
 * Writes defenseMarkdown into <clone>/<planRel>/<name>.whiteboard-defense.md (checkClone, planFolder, checkTarget,
 * writeFileAtomic), then records exportedTo on the defense. ConflictError when there's no defense. If recording fails,
 * the file is put back as it was. A section's diagram item is drawn in it as Mermaid (diagramMermaid), when its data
 * parses as a diagram.
 */
export async function exportDefense(o: { dir: string; clone: string; profile: RepoProfile; home?: string; now?: Date }): Promise<{ exportedTo: DefenseExport }>;
```

`checkPlace` in `accept.ts` becomes `planFolder` + its two `checkTarget` calls, and Accept's behaviour and messages are unchanged.

### Service (Tasks 7, 8)

- **`POST /api/claude/wait`:**
  - `finished` gains `whiteboard?: string` and `whiteboardError?: string` (the subagent's `Failed: …` line). The back-check after the finalize one calls `finishWhiteboard` for a `writing` request this window picked up, when it isn't an overlapping wait or `finished.whiteboard` names it, passing `finished.whiteboardError` as `error` when `finished.whiteboard` names it.
  - `requeueWhiteboard(ref.dir, isAlive)` runs next to `requeueFinalize`.
  - The hand-out takes `pickUpWhiteboard` after `pickUpFinalize`, and returns `describeWhiteboard`: `{ kind: 'whiteboard', request, model: cfg.agents.models.whiteboard, next }`, where `request` is the request's id (a string, as `describeFinalize` gives it), with `next` as the exact copy.
- **`POST /api/claude/open`** calls `requeueWhiteboard` wherever it calls `requeueFinalize`.
- **`POST /api/claude/context`:**
  - `whiteboard: true` returns `whiteboardPack({ dir, types: cfg.types, profile, rulesFile: await whiteboardRulesFile() })`.
  - `whiteboardRulesFile` is the absolute path of `outputs/whiteboard-defense.md` in the config folder, or of the shipped default when the user's is missing, as `finalizeRules` picks. The pack carries the path, not the text.
  - The fallback error becomes "Give threadId (for a thread), importType (for an importer), finalize: true (for the finalizer) or whiteboard: true (for the whiteboard subagent)."
- **`POST /api/claude/whiteboard`:** the body is `projectBody.extend({ request: z.string().min(1), defense: z.unknown() })`. It reads the rules file `/context` names and takes `checklistLines` of it. Under the lock it calls `saveDefense` with that `checklist`, then `changed(ref)`. It returns `{ ok: true, request, level, questions: n, concerns: n, next }`.
- **Browser routes** in the new `routes/whiteboard.ts` (base `/projects/:repo/:id/whiteboard`, mounted under `/api`). Every write runs under the project lock, then `rt.events.projectChanged`.

  | Method | Path | Body | Returns |
  |---|---|---|---|
  | GET | base | | `WhiteboardView` |
  | POST | base | `{}` | `GenerateWhiteboardResponse`. Notifies listeners; `message` is the waiting line or the no-window line |
  | POST | `/cancel` | `{}` | `{ ok: true }` |
  | POST | `/ask` | `{ defenseId, kind, ref, question }` | `AskDefenseResponse`: `askAboutDefense`, then `submit({ scope: 'thread' })` and the same response `POST …/items` gives. `threads.ts`'s module-private `respond` moves to `routes/respond.ts` as `export function submitResponse(rt: Runtime, ref: ProjectRef, r): SubmitResponse` (same body), used by both |
  | POST | `/send` | `{ defenseId, kind: 'claim' \| 'concern', ref }` | `SendFromDefenseResponse`. Notifies listeners; `message` is the exact copy's, by whether the window is listening, busy or gone |
  | POST | `/practice/rating` | `{ defenseId, questionId, rating: Rating \| null }` | `PracticeView` |
  | POST | `/practice/tick` | `{ defenseId, checklistId, ticked: boolean }` | `PracticeView` |
  | POST | `/export` | `{ clone }` | `{ exportedTo: DefenseExport }`. The clone must pass `knownClone` (one of `clonesOf`), as Accept's does, and a repo profile is needed |

  Bodies are `.strict()` Zod objects. `question` is 1–20,000 characters, trimmed.
- **`clonesOf(project, home)`** moves to `routes/clones.ts` and is exported. `finalize.ts` imports it.
- **`knownClone(project, clone, home)`**, beside it in `routes/clones.ts`, returns the picked clone with `~` expanded once it's one of `clonesOf`. Otherwise it throws InputError "That folder isn't one of the clones this project was opened from." Accept and Export both use it, so the message has one source.
- **The whiteboard service tests** share one setup, `packages/service/test/whiteboardSetup.ts` (Task 7, reused by Task 8). It isn't a `.test.ts` file, so it never runs on its own.

### Claude's side (Task 9)

- **`TOOL_NAMES`** gains `dp_whiteboard`, making 8. `WORK_KINDS` gains `whiteboard`.
- **`dp_whiteboard`** takes `{ ...project, request: z.string().min(1), defense: z.record(z.unknown()).describe('The whole defense: see your instructions for its shape') }` and forwards to `/whiteboard`. It doesn't check the shape: `saveDefense` lists every problem at once, the shape's with the rest.
- **`dp_context`** gains `whiteboard: z.boolean().optional()`. **`dp_wait`'s `finished`** gains `whiteboard: z.string().optional()` and `whiteboardError: z.string().max(2000).optional()`, and its description names `kind: whiteboard` and `whiteboardError`.
- **`plugin/agents/whiteboard.md`:**
  - front matter `name: whiteboard`, a description over 20 characters, `tools: Read, Grep, Glob, mcp__plugin_dev-plumbing_dp__dp_context, mcp__plugin_dev-plumbing_dp__dp_whiteboard`, `color: green`;
  - its steps: `dp_context` with `whiteboard: true`; Read `rulesFile` and `documentFile` first, and an item's `file` for what the pack cuts short; follow the rules; keep `previous`'s wording where it still applies (the exact rule); fill every section of `sections`, keeping the whole defense under about 40,000 characters of JSON (the exact rule); tag every claim; questions with answers from the plan; real concerns only; `checklist: []`, since the service copies the rules file's (write one only when the rules have none); `diagramItemId` from `diagramItemIds`; call `dp_whiteboard` once, retrying at most three times on refusal, but stopping with "Failed: the request was cancelled or replaced." when it says there's no request waiting; reply with the exact one line.
- **`SKILL.md`:**
  - §3 Listen lists `**kind: whiteboard**: write the Whiteboard Defense (7)`, and **Generate** on the Whiteboard Defense page among the buttons `dp_wait` waits for;
  - a new `## 7. Write the Whiteboard Defense`, inserted before `## Rules`, mirroring §5: foreground, the prompt, tell the user the line, and on `Failed:` that they can press **Try again** or **Generate** on the Whiteboard Defense page; `finished: { whiteboard: "<request>" }`, with `whiteboardError: "<the line>"` when it starts with `Failed:`;
  - §1's subagent list names `dev-plumbing:whiteboard`.
- **`plugin/agents/thread.md`:** one paragraph: in a Defense thread, answer from the pack's `defense` (and `finalFile` when it explains the final), never send `change` or `smallEdits`, and resolve the thread with your answer when it needs nothing more from the person.

### Web (Tasks 10–12)

```ts
// api/client.ts
whiteboard: (repo: string, id: string) => request<WhiteboardView>(`${proj(repo, id)}/whiteboard`),
generateWhiteboard: (repo, id) => request<GenerateWhiteboardResponse>(`${proj(repo, id)}/whiteboard`, send('POST', {})),
cancelWhiteboard: (repo, id) => request<{ ok: true }>(`${proj(repo, id)}/whiteboard/cancel`, send('POST', {})),
askAboutDefense: (repo, id, body: { defenseId: string; kind: 'section' | 'question' | 'concern'; ref: string; question: string }) => request<AskDefenseResponse>(`${proj(repo, id)}/whiteboard/ask`, send('POST', body)),
sendFromDefense: (repo, id, body: { defenseId: string; kind: 'claim' | 'concern'; ref: string }) => request<SendFromDefenseResponse>(`${proj(repo, id)}/whiteboard/send`, send('POST', body)),
ratePractice: (repo, id, body: { defenseId: string; questionId: string; rating: Rating | null }) => request<PracticeView>(`${proj(repo, id)}/whiteboard/practice/rating`, send('POST', body)),
tickPractice: (repo, id, body: { defenseId: string; checklistId: string; ticked: boolean }) => request<PracticeView>(`${proj(repo, id)}/whiteboard/practice/tick`, send('POST', body)),
exportDefense: (repo, id, clone: string) => request<{ exportedTo: DefenseExport }>(`${proj(repo, id)}/whiteboard/export`, send('POST', { clone })),
```

- **The query key** is `['whiteboard', repo, project]`, so live updates refresh it.
- **The route** is `defenseRoute`, `path: 'defense'`, with `validateSearch` giving `{ mode: 'study' | 'practice' }` (default `'study'`).
- **`DefensePage`** (Task 10) renders `StudyView` (Task 11) or `PracticeView` (Task 12). Study takes `DefenseViewProps`, and Practice `PracticeViewProps`, which add where Practice is: the page keeps it, so going to Study and back keeps the card and the "Only shaky and couldn't" deck. All three are exported from `DefensePage.tsx`:
  ```ts
  export type DefenseViewProps = { view: WhiteboardView & { defense: WhiteboardDefense }; repo: string; project: string };
  /** The card on show (from 0) and, while "Only shaky and couldn't" is on, the deck it fixed (question ids). */
  export type PracticePlace = { card: number; deck: string[] | null };
  export type PracticeViewProps = DefenseViewProps & { place: PracticePlace; onPlace: (place: PracticePlace) => void };
  ```
- **`Flashcard`** (Task 12) takes `{ repo, project, defenseId, question, i, n, rating, shown, onShow, busy, onRate, asked }`: Practice keeps whether the answer shows, so its keys can reveal it. `RATINGS`, exported beside it, gives the ratings in key order (1 could, 2 shaky, 3 couldn't).
- **`AskClaude`** (Task 11) takes `{ repo, project, defenseId, kind: 'section' | 'question' | 'concern', partRef: string, asked: DefenseLink[] }`. The part's ref is `partRef`, since `ref` is React's own prop. It lists the matching `asked` threads as links with a `StatusMark`, and a button that opens the form. On send it navigates to `/p/$repo/$project/th/$thread`. Practice uses it on a card, so it lives in Task 11 and Task 12 imports it.
- **Section 2's diagram item:** `WhiteboardView` carries no item data, so Study reads the item through the existing `api.thread(repo, project, 't-' + itemId)` (every item's thread is `t-<item id>`), under ThreadView's query key `['thread', repo, project, threadId]`, and draws it with `DiagramView` when its type's screen is `diagram`.
- **`ProgressBar`** gains an optional `label` (default "Resolved threads", so every existing bar is unchanged), and the readiness meter is a `ProgressBar` labelled "Readiness" (Task 12).
- **`labels.tsx`** (Task 11; a `.tsx` file because `BasisLabel` is a component, imported as `./labels`) exports these, which Practice uses too:
  ```ts
  basisClass(b: Basis): string   // known 'text-ink-3', inferred 'text-ink-2' (slate is the links' colour), unknown 'text-amber', verify 'text-seal'
  severityClass(s: Severity): string   // critical/high 'text-seal', medium 'text-amber', low 'text-ochre', info 'text-ink-3'
  BasisLabel({ basis })            // the basis label as an 11 px caption, coloured by basisClass
  ```
- **Test ids:**
  - `defense-status`, `defense-meta`, `defense-stale`;
  - `defense-generate` (the Generate / Regenerate / Try again button), `defense-cancel`, `defense-dismiss`;
  - `defense-export`, `defense-section-<id>`, `defense-questions`, `defense-concerns`, `defense-checklist`;
  - `ask-claude`, `ask-question`, `ask-send`;
  - `send-to-plumbing`, `flashcard`, `show-answer`, `readiness`;
  - also: `defense` (the page), `nav-defense` (the nav's Review link), `export-target`, `defense-exported`, `study`, `defense-table`, `defense-diagram` (the text diagram), `defense-diagram-item`, `practice`, `practice-counts` and `flashcard-answer`.

---

### Task 1: The Whiteboard Defense's types and files

Every later task shares these shapes: what the whiteboard subagent sends (`DefenseInput`), the three files a project keeps in `whiteboard/` (the request, the defense and your practice), the labels the app shows, and the part of a defense an item came from (`fromDefense`). This task adds them, the functions that read, write and remove the three files, the browser's view types, and two test builders that later tasks reuse, `validDefenseInput()` and `storedDefense()`. Nothing calls the functions yet: Task 3 adds the request's lifecycle.

**Files:**
- Create:
  - `packages/core/src/schemas/whiteboard.ts`
  - `packages/core/src/store/whiteboard.ts` (the reads, writes and remove; Task 3 adds the rest)
  - `packages/core/src/schemas/whiteboard.test.ts`
  - `packages/core/test/whiteboard.test.ts` (Task 3 continues it)
- Modify:
  - `packages/core/src/schemas/index.ts` (export `./whiteboard`)
  - `packages/core/src/schemas/project.ts` (`itemSchema.fromDefense`)
  - `packages/core/src/schemas/views.ts` (`DefenseLink`, `PracticeView`, `WhiteboardView` and three response types)
  - `packages/core/src/store/io.ts` (`projectFiles` gains the whiteboard paths)
  - `packages/core/src/index.ts` (export `./store/whiteboard`)
  - `packages/core/test/fixtures.ts` (`validDefenseInput()` and `storedDefense()`)
- Test:
  - `packages/core/src/schemas/whiteboard.test.ts`
  - `packages/core/test/whiteboard.test.ts`

**Interfaces:**
- Consumes, from Plans 1–5:
  - `writeJsonAtomic` (`atomic.ts`);
  - `projectFiles`, `readJsonFile`, `readItem`, `writeItem` (`store/io.ts`);
  - `ListeningState`, `DisplayStatus` and `SubmitResponse` (`schemas/views.ts`);
  - in the tests, `seedProject`, `pair` and `removeTempDirs`.
- Produces, exactly as in the header's Contracts:
  - **`schemas/whiteboard.ts`:**
    - `basisValues`/`Basis`, `severityValues`/`Severity`, `ratingValues`/`Rating`;
    - `DEFENSE_SECTIONS`, `DefenseSectionId`, `sectionIds`, `DEFENSE_PARTS`, `LEVEL_NAMES`, `BASIS_LABELS`, `SEVERITY_LABELS`;
    - `claimSchema`/`Claim`, `defenseTableSchema`/`DefenseTable`, `defenseInputSchema`/`DefenseInput`;
    - `whiteboardDefenseSchema`/`WhiteboardDefense`, `DefenseExport`;
    - `whiteboardStateValues`/`WhiteboardState`, `whiteboardRequestSchema`/`WhiteboardRequest`;
    - `practiceSchema`/`Practice`;
    - `defenseRefKinds`/`DefenseRefKind`, `defenseRefSchema`/`DefenseRef`.

    All of them are exported from `@dev-plumbing/core` and from `@dev-plumbing/core/schemas` (the web's entry). The file imports only `zod`.
  - **`itemSchema`** gains `fromDefense: defenseRefSchema.optional().catch(undefined)`, so `Item.fromDefense?: DefenseRef`.
  - **`projectFiles(dir)`** gains `whiteboard: <dir>/whiteboard`, and `whiteboardRequest`, `defense` and `practice`: `request.json`, `defense.json` and `practice.json` in it.
  - **`store/whiteboard.ts`:**
    ```ts
    export async function readWhiteboardRequest(dir: string): Promise<WhiteboardRequest | null>;
    export async function readDefense(dir: string): Promise<WhiteboardDefense | null>;
    export async function readPractice(dir: string): Promise<Practice>;
    export async function writeWhiteboardRequest(dir: string, r: WhiteboardRequest): Promise<void>;
    export async function writeDefense(dir: string, d: WhiteboardDefense): Promise<void>;
    export async function writePractice(dir: string, p: Practice): Promise<void>;
    export async function removeWhiteboardRequest(dir: string): Promise<void>;
    ```
  - **`schemas/views.ts`:** `DefenseLink`, `PracticeView`, `WhiteboardView`, `GenerateWhiteboardResponse`, `AskDefenseResponse` and `SendFromDefenseResponse`, as in the Contracts. `ProjectHome.defense` comes in Task 3.
  - **`packages/core/test/fixtures.ts`**, for Tasks 3–9:
    - `validDefenseInput(): DefenseInput`:
      - level 2, with two reasons;
      - all ten sections, in `DEFENSE_SECTIONS` order, each with one claim, except `security`, which has two; its claim at index 1 is `{ text: 'Whether the unsubscribe link needs a signed token.', basis: 'unknown' }`;
      - `data` has one table: `Source of truth`, columns `State` and `Owner`, two rows;
      - no `diagram` and no `diagramItemId`;
      - three questions, with bases `verify`, `inferred` and `unknown`;
      - two concerns, `high` (basis `verify`) and then `info` (basis `known`);
      - the 20 checklist lines of `defaults/outputs/whiteboard-defense.md`, in order.
    - `storedDefense(overrides?: Partial<WhiteboardDefense>): WhiteboardDefense`: the same content as `saveDefense` saves it.
      - `id: 'w-test'`, `generatedAt: '2026-10-06T09:00:00.000Z'` and `basedOn: { kind: 'plan', doc: 'draft', version: 1, inputsHash: 'test' }`.
      - The section titles, `tables: []` where a section has none, `diagram: null` and `diagramItemId: null`.
      - Ids `q1`–`q3`, `c1` (the high concern) and `c2` (the info one), and `k1`–`k20`.
      - No `exportedTo`.

      Each override replaces a whole field.
- **Rules:**
  - **The reads never throw.** A missing file, bad JSON or JSON of the wrong shape reads as `null` (the request and the defense) or as `{ ratings: {}, ticks: {} }` (practice).
  - **The writes** go through `writeJsonAtomic`, which makes `whiteboard/` when it's missing. `removeWhiteboardRequest` is `fs.rm(…, { force: true })`, so it's fine when there's nothing to remove.
  - **`fromDefense` reads like `anchor`.** The item schema checks it, but a malformed one (another `kind`, say) reads as none, so it can never hide the item: reading an item never refuses. (`itemSchema` is `.passthrough()`, so without the field the key would be carried along unchecked.)
  - **`DefenseRef.text`** is optional. Task 5 sets it on the Questions and Concerns items it sends: the part's text, so a regenerated defense that still has the same unknown knows it was sent.
  - **`defenseInputSchema.checklist`** is 0 to 40 lines. When the rules file has a checklist, the service copies it and ignores the payload's (Task 3), so the subagent sends `[]`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/fixtures.ts`, replace:
```ts
import type { Item, Message, Option, PlumbingProject, PlumbingType, Thread, ThreadStatus } from '../src/schemas';
```
with:
```ts
import {
  DEFENSE_SECTIONS,
  type DefenseInput,
  type Item,
  type Message,
  type Option,
  type PlumbingProject,
  type PlumbingType,
  type Thread,
  type ThreadStatus,
  type WhiteboardDefense,
} from '../src/schemas';
```
and add at the end of the file:
```ts

/** The 20 lines of the shipped outputs/whiteboard-defense.md's checklist, in order. */
const DEFENSE_CHECKLIST = [
  'I can explain the purpose.',
  'I can draw the system flow.',
  'I understand the important data.',
  'I know the source of truth for important state.',
  'I understand the state transitions.',
  'I know who can perform each operation.',
  'I understand the relevant security risks.',
  'I know the major failure modes.',
  'I know what happens if operations run twice.',
  'I understand relevant concurrency risks.',
  'I know the important dependencies.',
  'I understand the major tradeoffs.',
  'I can explain why the architecture is not unnecessarily complex.',
  'I know what the tests prove.',
  'I know how we would detect a production failure.',
  'I know how I would debug it.',
  'I understand deployment risks.',
  'I know how to recover or roll back.',
  'I understand the blast radius.',
  'I know what assumptions still need to be verified.',
];

/**
 * A whole Whiteboard Defense of the Restock reminders plan, as the whiteboard subagent sends it: all ten sections in
 * order, each with a claim (security's second claim is unknown, and data has a source-of-truth table), three questions,
 * a high and an info concern, and the 20 checklist lines of the shipped rules file.
 */
export function validDefenseInput(): DefenseInput {
  return {
    level: 2,
    levelReasons: ['It emails customers on a schedule.', 'It keeps no payment details, only the address it sends to.'],
    sections: [
      { id: 'summary', claims: [{ text: 'A daily job finds subscriptions about to run out and emails each customer a reminder.', basis: 'known' }] },
      { id: 'diagram', claims: [{ text: 'The job reads subscriptions from Postgres and hands each reminder to the mailer.', basis: 'inferred' }] },
      { id: 'walkthrough', claims: [{ text: 'Each morning the job picks the subscriptions due within five days, sends one email each and logs it.', basis: 'inferred' }] },
      {
        id: 'data',
        claims: [{ text: 'Each reminder sent is logged as a row in a reminders table.', basis: 'known' }],
        tables: [{ title: 'Source of truth', columns: ['State', 'Owner'], rows: [['Renewal date', 'Billing'], ['Reminders sent', 'The reminders table']] }],
      },
      {
        id: 'security',
        claims: [
          { text: 'Reminders go only to the email address on the subscription.', basis: 'inferred' },
          { text: 'Whether the unsubscribe link needs a signed token.', basis: 'unknown' },
        ],
      },
      { id: 'failure', claims: [{ text: 'If the job runs twice in a day, the log stops a second email.', basis: 'verify' }] },
      { id: 'tradeoffs', claims: [{ text: 'A daily batch is simpler than an event per subscription, at the cost of up to a day of delay.', basis: 'inferred' }] },
      { id: 'complexity', claims: [{ text: 'One job and one table: nothing new to deploy.', basis: 'inferred' }] },
      { id: 'readiness', claims: [{ text: 'Nothing alerts anyone when the job fails to run.', basis: 'unknown' }] },
      { id: 'unknowns', claims: [{ text: 'How many emails a day the mail provider allows.', basis: 'unknown' }] },
    ],
    questions: [
      { q: 'What stops a customer getting two reminders?', a: 'The reminders table: the job skips a subscription it already logged that day.', basis: 'verify' },
      { q: 'Where does the renewal date come from?', a: 'Billing owns it; the job only reads it.', basis: 'inferred' },
      { q: 'What happens when the mailer is down?', a: 'The send fails, and the next run tries again.', basis: 'unknown' },
    ],
    concerns: [
      { severity: 'high', text: 'A job that runs twice could email every customer twice.', basis: 'verify' },
      { severity: 'info', text: "The reminder copy isn't final yet.", basis: 'known' },
    ],
    checklist: [...DEFENSE_CHECKLIST],
  };
}

/**
 * validDefenseInput() as saveDefense saves it: the section titles, ids q1–q3, c1–c2 (the high concern first) and
 * k1–k20, id w-test, and based on the draft at v1. `overrides` replace whole fields.
 */
export function storedDefense(overrides: Partial<WhiteboardDefense> = {}): WhiteboardDefense {
  const input = validDefenseInput();
  return {
    id: 'w-test',
    generatedAt: '2026-10-06T09:00:00.000Z',
    basedOn: { kind: 'plan', doc: 'draft', version: 1, inputsHash: 'test' },
    level: input.level,
    levelReasons: input.levelReasons,
    sections: input.sections.map((s) => ({
      id: s.id,
      title: DEFENSE_SECTIONS.find((d) => d.id === s.id)!.title,
      claims: s.claims,
      tables: s.tables ?? [],
      diagram: null,
      diagramItemId: null,
    })),
    questions: input.questions.map((q, i) => ({ id: `q${i + 1}`, ...q })),
    concerns: input.concerns.map((c, i) => ({ id: `c${i + 1}`, ...c })),
    checklist: input.checklist.map((text, i) => ({ id: `k${i + 1}`, text })),
    ...overrides,
  };
}
```

`packages/core/src/schemas/whiteboard.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
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

/** The paths of the problems the input schema finds, joined by dots, or [] when it accepts the value. */
const problemPaths = (value: unknown) => {
  const r = defenseInputSchema.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('the Whiteboard Defense schemas', () => {
  it('has ten prose sections, numbered 1–9 and 12 among the 13', () => {
    expect(DEFENSE_SECTIONS).toHaveLength(10);
    expect(DEFENSE_SECTIONS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 12]);
    expect(sectionIds).toEqual(['summary', 'diagram', 'walkthrough', 'data', 'security', 'failure', 'tradeoffs', 'complexity', 'readiness', 'unknowns']);
    expect(DEFENSE_SECTIONS.map((s) => s.title)).toEqual([
      'Executive summary',
      'Whiteboard diagram',
      'System walkthrough',
      'Data and state',
      'Security model',
      'Failure analysis',
      'Dependencies and tradeoffs',
      'Complexity review',
      'Production readiness',
      'Unknowns',
    ]);
    expect(DEFENSE_PARTS).toEqual({
      questions: { n: 10, title: 'Questions the engineer should be able to answer' },
      concerns: { n: 11, title: 'Release concerns' },
      checklist: { n: 13, title: 'Checklist' },
    });
    expect(Object.values(LEVEL_NAMES)).toEqual(['Lightweight', 'Standard', 'High risk']);
    expect(Object.values(BASIS_LABELS)).toEqual(['Known', 'Inferred', 'Unknown', 'Verify before release']);
    expect(Object.values(SEVERITY_LABELS)).toEqual(['Critical', 'High', 'Medium', 'Low', 'Informational']);
  });

  it("accepts a whole defense from the whiteboard subagent, trimming what's written", () => {
    const input = validDefenseInput();
    expect(defenseInputSchema.parse(input)).toEqual(input);
    expect(input.sections.map((s) => s.id)).toEqual(sectionIds);
    expect(input.sections.find((s) => s.id === 'security')?.claims[1]).toEqual({ text: 'Whether the unsubscribe link needs a signed token.', basis: 'unknown' });
    expect(input.sections.find((s) => s.id === 'data')?.tables).toHaveLength(1);
    expect(input.questions).toHaveLength(3);
    expect(input.concerns.map((c) => c.severity)).toEqual(['high', 'info']);
    expect(input.checklist).toHaveLength(20);
    expect(input.checklist[0]).toBe('I can explain the purpose.');
    expect(defenseInputSchema.parse({ ...input, levelReasons: ['  It emails customers.  '] }).levelReasons).toEqual(['It emails customers.']);
  });

  it("refuses an unknown basis, a level 4 and a section that isn't one of the ten, and takes an empty checklist", () => {
    const input = validDefenseInput();
    expect(problemPaths({ ...input, level: 4 })).toEqual(['level']);
    const maybe = input.sections.map((s) => (s.id === 'security' ? { ...s, claims: [s.claims[0], { text: 'Tokens expire.', basis: 'maybe' }] } : s));
    expect(problemPaths({ ...input, sections: maybe })).toEqual(['sections.4.claims.1.basis']);
    expect(problemPaths({ ...input, sections: [...input.sections, { id: 'rollout', claims: [{ text: 'Behind a flag.', basis: 'known' }] }] })).toEqual(['sections.10.id']);
    // The service copies the rules file's checklist, so the subagent may send none.
    expect(problemPaths({ ...input, questions: [], checklist: [] })).toEqual(['questions']);
  });

  it('round-trips a stored defense', () => {
    const defense = storedDefense({ exportedTo: { clone: '~/Source/acme', path: 'docs/specs/restock.whiteboard-defense.md', at: '2026-10-06T10:00:00.000Z' } });
    expect(whiteboardDefenseSchema.parse(JSON.parse(JSON.stringify(defense)))).toEqual(defense);
    expect(defense.sections.map((s) => s.title)).toEqual(DEFENSE_SECTIONS.map((s) => s.title));
    expect(defense.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect(defense.concerns.map((c) => [c.id, c.severity])).toEqual([['c1', 'high'], ['c2', 'info']]);
    expect(defense.checklist.map((k) => k.id)).toEqual(Array.from({ length: 20 }, (_, i) => `k${i + 1}`));
    expect(storedDefense()).toMatchObject({ id: 'w-test', basedOn: { kind: 'plan', doc: 'draft', version: 1, inputsHash: 'test' } });
    expect(storedDefense().exportedTo).toBeUndefined();
    expect(whiteboardDefenseSchema.safeParse({ ...defense, basedOn: { ...defense.basedOn, doc: 'original' } }).success).toBe(false);
  });

  it('keeps one request, in one of three states', () => {
    const request = { id: 'g-1', state: 'writing', requestedAt: '2026-10-06T09:00:00.000Z', pickedUpBy: 'w-a', basedOn: { doc: 'final', version: 2 } };
    expect(whiteboardRequestSchema.parse(request)).toEqual(request);
    expect(whiteboardRequestSchema.safeParse({ ...request, state: 'proposed' }).success).toBe(false);
  });

  it('starts practice with no ratings and no ticks', () => {
    expect(practiceSchema.parse({})).toEqual({ ratings: {}, ticks: {} });
    expect(practiceSchema.parse({ ticks: { 'I can explain the purpose.': '2026-10-06T09:00:00.000Z' } }).ratings).toEqual({});
    expect(practiceSchema.safeParse({ ratings: { 'Where does the renewal date come from?': { rating: 'maybe', at: '2026-10-06T09:00:00.000Z' } } }).success).toBe(false);
  });
});
```

`packages/core/test/whiteboard.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { itemSchema, type Item, type Practice, type WhiteboardRequest } from '../src/schemas';
import { projectFiles, readItem, writeItem } from '../src/store/io';
import {
  readDefense,
  readPractice,
  readWhiteboardRequest,
  removeWhiteboardRequest,
  writeDefense,
  writePractice,
  writeWhiteboardRequest,
} from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject, storedDefense } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-06T09:00:00.000Z';
const exists = (file: string) => fs.access(file).then(() => true, () => false);

describe('the whiteboard files', () => {
  it('read as nothing when they are missing or damaged', async () => {
    const dir = await seedProject();
    const files = projectFiles(dir);
    const nothing = async () => {
      expect(await readWhiteboardRequest(dir)).toBeNull();
      expect(await readDefense(dir)).toBeNull();
      expect(await readPractice(dir)).toEqual({ ratings: {}, ticks: {} });
    };
    await nothing();
    await fs.mkdir(files.whiteboard);
    for (const file of [files.whiteboardRequest, files.defense, files.practice]) await fs.writeFile(file, '{damaged');
    await nothing();
    // JSON of the wrong shape is damaged too.
    await fs.writeFile(files.whiteboardRequest, JSON.stringify({ id: 'g-1', state: 'proposed', requestedAt: AT }));
    await fs.writeFile(files.defense, JSON.stringify({ ...storedDefense(), level: 4 }));
    await fs.writeFile(files.practice, JSON.stringify({ ratings: { 'Where does the renewal date come from?': { rating: 'maybe', at: AT } } }));
    await nothing();
  });

  it('write and read back, making whiteboard/ when it is needed', async () => {
    const dir = await seedProject();
    const files = projectFiles(dir);
    expect(files).toMatchObject({
      whiteboard: path.join(dir, 'whiteboard'),
      whiteboardRequest: path.join(dir, 'whiteboard', 'request.json'),
      defense: path.join(dir, 'whiteboard', 'defense.json'),
      practice: path.join(dir, 'whiteboard', 'practice.json'),
    });
    expect(await exists(files.whiteboard)).toBe(false);
    const request: WhiteboardRequest = { id: 'g-1', state: 'writing', requestedAt: AT, pickedUpAt: AT, pickedUpBy: 'w-a', inputsHash: 'abc', basedOn: { doc: 'draft', version: 1 } };
    await writeWhiteboardRequest(dir, request);
    expect(await readWhiteboardRequest(dir)).toEqual(request);
    const defense = storedDefense();
    await writeDefense(dir, defense);
    expect(await readDefense(dir)).toEqual(defense);
    const practice: Practice = { ratings: { 'What stops a customer getting two reminders?': { rating: 'shaky', at: AT } }, ticks: { 'I can explain the purpose.': AT } };
    await writePractice(dir, practice);
    expect(await readPractice(dir)).toEqual(practice);
    expect((await fs.readdir(files.whiteboard)).sort()).toEqual(['defense.json', 'practice.json', 'request.json']);
  });

  it('remove the request and nothing else, and are fine when there is none', async () => {
    const dir = await seedProject();
    await expect(removeWhiteboardRequest(dir)).resolves.toBeUndefined();
    await writeWhiteboardRequest(dir, { id: 'g-1', state: 'requested', requestedAt: AT });
    await writeDefense(dir, storedDefense());
    await removeWhiteboardRequest(dir);
    expect(await readWhiteboardRequest(dir)).toBeNull();
    expect(await readDefense(dir)).toEqual(storedDefense());
    await expect(removeWhiteboardRequest(dir)).resolves.toBeUndefined();
  });

  it('keep which part of the defense an item came from', async () => {
    const dir = await seedProject();
    const { item } = pair('defense-unsubscribe-link', { type: 'defense', title: 'Does the unsubscribe link need a token?' });
    const asked: Item = { ...item, createdBy: 'whiteboard', fromDefense: { id: 'w-test', kind: 'section', ref: 'security' } };
    await writeItem(dir, asked);
    expect(await readItem(dir, asked.id)).toEqual(asked);
    // It's checked, not just carried along: a part of another kind reads as none, as a malformed anchor does, so the
    // item is never hidden.
    const malformed = itemSchema.safeParse({ ...asked, fromDefense: { id: 'w-test', kind: 'box', ref: 'security' } });
    expect(malformed.success).toBe(true);
    expect(malformed.data?.fromDefense).toBeUndefined();
    expect(malformed.data?.title).toBe(asked.title);
    // An item sent to Questions keeps the text it was sent with.
    const sent: Item = { ...pair('questions-unsubscribe-link').item, createdBy: 'whiteboard', fromDefense: { id: 'w-test', kind: 'claim', ref: 'security.1', text: 'Whether the unsubscribe link needs a signed token.' } };
    await writeItem(dir, sent);
    expect(await readItem(dir, sent.id)).toEqual(sent);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/src/schemas/whiteboard.test.ts packages/core/test/whiteboard.test.ts`
Expected: FAIL. Neither file loads: `Error: Cannot find module './whiteboard'` and `Error: Cannot find module '../src/store/whiteboard'`.

- [ ] **Step 3: Write the schemas**

`packages/core/src/schemas/whiteboard.ts`:
```ts
import { z } from 'zod';

// The Whiteboard Defense (spec §12): what the whiteboard subagent sends, what the project folder keeps in whiteboard/,
// and the labels the app shows. Every statement is a claim tagged with what it rests on.

export const basisValues = ['known', 'inferred', 'unknown', 'verify'] as const;
export type Basis = (typeof basisValues)[number];
export const severityValues = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof severityValues)[number];
export const ratingValues = ['could', 'shaky', 'couldnt'] as const;
export type Rating = (typeof ratingValues)[number];

/** The ten prose sections, in the order Study shows them; n is the section's number among the 13. */
export const DEFENSE_SECTIONS = [
  { id: 'summary', n: 1, title: 'Executive summary' },
  { id: 'diagram', n: 2, title: 'Whiteboard diagram' },
  { id: 'walkthrough', n: 3, title: 'System walkthrough' },
  { id: 'data', n: 4, title: 'Data and state' },
  { id: 'security', n: 5, title: 'Security model' },
  { id: 'failure', n: 6, title: 'Failure analysis' },
  { id: 'tradeoffs', n: 7, title: 'Dependencies and tradeoffs' },
  { id: 'complexity', n: 8, title: 'Complexity review' },
  { id: 'readiness', n: 9, title: 'Production readiness' },
  { id: 'unknowns', n: 12, title: 'Unknowns' },
] as const;
export type DefenseSectionId = (typeof DEFENSE_SECTIONS)[number]['id'];
export const sectionIds = DEFENSE_SECTIONS.map((s) => s.id) as [DefenseSectionId, ...DefenseSectionId[]];
/** Sections 10, 11 and 13, which have their own shapes. */
export const DEFENSE_PARTS = {
  questions: { n: 10, title: 'Questions the engineer should be able to answer' },
  concerns: { n: 11, title: 'Release concerns' },
  checklist: { n: 13, title: 'Checklist' },
} as const;
export const LEVEL_NAMES: Record<1 | 2 | 3, string> = { 1: 'Lightweight', 2: 'Standard', 3: 'High risk' };
export const BASIS_LABELS: Record<Basis, string> = { known: 'Known', inferred: 'Inferred', unknown: 'Unknown', verify: 'Verify before release' };
export const SEVERITY_LABELS: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Informational' };

export const claimSchema = z.object({ text: z.string().trim().min(1).max(4000), basis: z.enum(basisValues) });
export type Claim = z.infer<typeof claimSchema>;
export const defenseTableSchema = z.object({
  title: z.string().trim().min(1).max(200),
  columns: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  rows: z.array(z.array(z.string().max(1000))).min(1).max(50),
});
export type DefenseTable = z.infer<typeof defenseTableSchema>;

/** What the whiteboard subagent sends with dp_whiteboard. */
export const defenseInputSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  levelReasons: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  sections: z
    .array(
      z.object({
        id: z.enum(sectionIds),
        // At least one: saveDefense says so in its own words.
        claims: z.array(claimSchema).max(40),
        tables: z.array(defenseTableSchema).max(5).optional(),
        /** A plain-text diagram, shown as written. */
        diagram: z.string().max(6000).optional(),
        /** An item of this project whose drawing is a diagram. */
        diagramItemId: z.string().min(1).optional(),
      }),
    )
    // Missing and doubled ids: saveDefense says so.
    .max(20),
  questions: z
    .array(z.object({ q: z.string().trim().min(1).max(500), a: z.string().trim().min(1).max(4000), basis: z.enum(basisValues) }))
    .min(1)
    .max(40),
  concerns: z.array(z.object({ severity: z.enum(severityValues), text: z.string().trim().min(1).max(2000), basis: z.enum(basisValues) })).max(40),
  // Empty when the rules file has a checklist: the service copies that one (saveDefense).
  checklist: z.array(z.string().trim().min(1).max(300)).max(40),
});
export type DefenseInput = z.infer<typeof defenseInputSchema>;

/** whiteboard/defense.json. */
export const whiteboardDefenseSchema = z.object({
  /** newId('w', now) */
  id: z.string().min(1),
  generatedAt: z.string(),
  /** What it was written from: the final if there was one, else the draft, and defenseInputsHash at the time. */
  basedOn: z.object({ kind: z.literal('plan'), doc: z.enum(['final', 'draft']), version: z.number().int().min(1), inputsHash: z.string() }),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  levelReasons: z.array(z.string()),
  /** Exactly DEFENSE_SECTIONS, in that order. */
  sections: z.array(
    z.object({
      id: z.enum(sectionIds),
      title: z.string(),
      claims: z.array(claimSchema),
      tables: z.array(defenseTableSchema),
      diagram: z.string().nullable(),
      diagramItemId: z.string().nullable(),
    }),
  ),
  /** Ids q1, q2, … */
  questions: z.array(z.object({ id: z.string(), q: z.string(), a: z.string(), basis: z.enum(basisValues) })),
  /** Ids c1, …; most severe first. */
  concerns: z.array(z.object({ id: z.string(), severity: z.enum(severityValues), text: z.string(), basis: z.enum(basisValues) })),
  /** Ids k1, … */
  checklist: z.array(z.object({ id: z.string(), text: z.string() })),
  /** Where Export .md last wrote it. */
  exportedTo: z.object({ clone: z.string(), path: z.string(), at: z.string() }).optional(),
});
export type WhiteboardDefense = z.infer<typeof whiteboardDefenseSchema>;
export type DefenseExport = NonNullable<WhiteboardDefense['exportedTo']>;

export const whiteboardStateValues = ['requested', 'writing', 'failed'] as const;
export type WhiteboardState = (typeof whiteboardStateValues)[number];
/** whiteboard/request.json. Absent when no defense is being asked for. */
export const whiteboardRequestSchema = z.object({
  /** newId('g', now) */
  id: z.string().min(1),
  state: z.enum(whiteboardStateValues),
  requestedAt: z.string(),
  /** The listening window that took it, through dp_wait. */
  pickedUpAt: z.string().optional(),
  pickedUpBy: z.string().optional(),
  /** At pick-up: what the subagent reads. saveDefense copies these into basedOn. */
  inputsHash: z.string().optional(),
  basedOn: z.object({ doc: z.enum(['final', 'draft']), version: z.number().int().min(1) }).optional(),
  /** When a window that went away gave it back. */
  requeuedAt: z.string().optional(),
  failedAt: z.string().optional(),
  reason: z.string().optional(),
});
export type WhiteboardRequest = z.infer<typeof whiteboardRequestSchema>;

/** whiteboard/practice.json, keyed by the question's text and the checklist line's text (trimmed). */
export const practiceSchema = z.object({
  ratings: z.record(z.object({ rating: z.enum(ratingValues), at: z.string() })).default({}),
  /** text -> when ticked */
  ticks: z.record(z.string()).default({}),
});
export type Practice = z.infer<typeof practiceSchema>;

export const defenseRefKinds = ['section', 'question', 'concern', 'claim'] as const;
export type DefenseRefKind = (typeof defenseRefKinds)[number];
/**
 * A part of a defense. section: a DefenseSectionId; question: q<n>; concern: c<n>;
 * claim: `${sectionId}.${index}` (index from 0 in that section's claims). `text` is the part's own text, kept on the
 * Questions and Concerns items sent from it, so a regenerated defense with the same unknown knows it was sent.
 */
export const defenseRefSchema = z.object({ id: z.string(), kind: z.enum(defenseRefKinds), ref: z.string(), text: z.string().optional() });
export type DefenseRef = z.infer<typeof defenseRefSchema>;
```

In `packages/core/src/schemas/index.ts`, replace:
```ts
export * from './finalize';
```
with:
```ts
export * from './finalize';
export * from './whiteboard';
```

In `packages/core/src/schemas/project.ts`, replace:
```ts
import { codeRefSchema, itemFlagSchema, mdAnchorSchema, messageSchema } from './loop';
```
with:
```ts
import { codeRefSchema, itemFlagSchema, mdAnchorSchema, messageSchema } from './loop';
import { defenseRefSchema } from './whiteboard';
```
and in `itemSchema`, replace:
```ts
    /** A Plan changes item: the passage as your draft, the old plan and the repo's new version had it. */
    conflict: z.object({ ours: z.string(), base: z.string(), theirs: z.string() }).optional(),
  })
  .passthrough();
```
with:
```ts
    /** A Plan changes item: the passage as your draft, the old plan and the repo's new version had it. */
    conflict: z.object({ ours: z.string(), base: z.string(), theirs: z.string() }).optional(),
    /**
     * Set on every item the Whiteboard Defense made: a Defense item (Ask Claude about this) or a Questions or Concerns
     * item sent from it. `id` is the defense's id, and `kind` and `ref` name the part it came from.
     * A malformed reference reads as none, so it can never hide the item.
     */
    fromDefense: defenseRefSchema.optional().catch(undefined),
  })
  .passthrough();
```

In `packages/core/src/schemas/views.ts`, replace:
```ts
import type { FinalizeChecklist, FinalizeRequest, FinalizeState } from './finalize';
```
with:
```ts
import type { FinalizeChecklist, FinalizeRequest, FinalizeState } from './finalize';
import type { DefenseRefKind, Rating, WhiteboardDefense, WhiteboardRequest } from './whiteboard';
```
and add at the end of the file, after `FinalizeView`:
```ts

/** A Defense thread asked about a part of the defense, or an item sent from it to Questions or Concerns. */
export type DefenseLink = { kind: DefenseRefKind; ref: string; itemId: string; threadId: string; typeId: string; title: string; status: DisplayStatus };

/** Practice for the current defense: your ratings and ticks by id, and how ready you are (spec §12). */
export type PracticeView = {
  /** By question id, for the current defense. */
  ratings: Record<string, Rating>;
  /** The checklist ids ticked. */
  ticks: string[];
  /**
   * 0–100: round(100 × the mean of the scores there are): the cards' (could + shaky / 2) / cards and the checklist's
   * ticked / lines. 0 with neither.
   */
  readiness: number;
  counts: { could: number; shaky: number; couldnt: number; unrated: number; ticked: number; checklist: number };
};

/** The Whiteboard Defense page: GET /api/projects/:repo/:id/whiteboard. */
export type WhiteboardView = {
  request: WhiteboardRequest | null;
  defense: WhiteboardDefense | null;
  /** The Out of date line, or null while the defense is current (or there's none). */
  stale: string | null;
  /** Null with no defense. */
  practice: PracticeView | null;
  /** Defense threads about the current defense, oldest first. */
  asked: DefenseLink[];
  /** Questions and Concerns items sent from the current defense. */
  sent: DefenseLink[];
  /** False while the plan is importing, or while a request is requested or writing. */
  canGenerate: boolean;
  /** Why not, in the refusal's exact words. */
  generateRefusal: string | null;
  listening: ListeningState;
  /** The clones this project was opened from that are still folders on this Mac, the source clone first. */
  clones: { path: string; source: boolean }[];
  /** `${dirname(sourcePath)}/${name}.whiteboard-defense.md`, relative to a clone. */
  exportPath: string;
};
export type GenerateWhiteboardResponse = { request: WhiteboardRequest; listening: ListeningState; message: string };
export type AskDefenseResponse = SubmitResponse & { threadId: string };
export type SendFromDefenseResponse = { itemId: string; threadId: string; typeId: string; typeTitle: string; listening: ListeningState; message: string };
```

- [ ] **Step 4: Give the project folder its whiteboard files**

In `packages/core/src/store/io.ts`, in `projectFiles`, replace:
```ts
  finalize: path.join(dir, 'finalize.json'),
});
```
with:
```ts
  finalize: path.join(dir, 'finalize.json'),
  whiteboard: path.join(dir, 'whiteboard'),
  whiteboardRequest: path.join(dir, 'whiteboard', 'request.json'),
  defense: path.join(dir, 'whiteboard', 'defense.json'),
  practice: path.join(dir, 'whiteboard', 'practice.json'),
});
```

`packages/core/src/store/whiteboard.ts`:
```ts
import fs from 'node:fs/promises';
import { writeJsonAtomic } from '../atomic';
import { practiceSchema, whiteboardDefenseSchema, whiteboardRequestSchema, type Practice, type WhiteboardDefense, type WhiteboardRequest } from '../schemas';
import { projectFiles, readJsonFile } from './io';

// The Whiteboard Defense's files, in the project's whiteboard/ folder: request.json while a defense is asked for,
// defense.json once one is saved, and practice.json for your flashcard ratings and checklist ticks.

type Schema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false } };

/** A JSON file that matches its schema, or null when it's missing or damaged. */
async function readValid<T>(file: string, schema: Schema<T>): Promise<T | null> {
  const r = await readJsonFile(file);
  if (!r.ok) return null;
  const parsed = schema.safeParse(r.value);
  return parsed.success ? parsed.data : null;
}

/**
 * whiteboard/request.json, or null when missing or damaged. A damaged file reads as none: it only ever holds the one
 * request, so Generate can replace it.
 */
export async function readWhiteboardRequest(dir: string): Promise<WhiteboardRequest | null> {
  return readValid(projectFiles(dir).whiteboardRequest, whiteboardRequestSchema);
}

/** whiteboard/defense.json, or null when missing or damaged. */
export async function readDefense(dir: string): Promise<WhiteboardDefense | null> {
  return readValid(projectFiles(dir).defense, whiteboardDefenseSchema);
}

/** whiteboard/practice.json; empty ({ ratings: {}, ticks: {} }) when missing or damaged. */
export async function readPractice(dir: string): Promise<Practice> {
  return (await readValid(projectFiles(dir).practice, practiceSchema)) ?? { ratings: {}, ticks: {} };
}

export async function writeWhiteboardRequest(dir: string, r: WhiteboardRequest): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).whiteboardRequest, r);
}

export async function writeDefense(dir: string, d: WhiteboardDefense): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).defense, d);
}

export async function writePractice(dir: string, p: Practice): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).practice, p);
}

/** Removes request.json. Fine when there's none. */
export async function removeWhiteboardRequest(dir: string): Promise<void> {
  await fs.rm(projectFiles(dir).whiteboardRequest, { force: true });
}
```

In `packages/core/src/index.ts`, replace:
```ts
export * from './store/update';
```
with:
```ts
export * from './store/update';
export * from './store/whiteboard';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/core/src/schemas/whiteboard.test.ts packages/core/test/whiteboard.test.ts`
Expected: PASS (6 tests in `schemas/whiteboard.test.ts`, 4 in `test/whiteboard.test.ts`).

Run: `pnpm typecheck && pnpm test`
Expected: PASS. The web typechecks too: it reads the new types through `@dev-plumbing/core/schemas`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schemas/whiteboard.ts packages/core/src/schemas/whiteboard.test.ts packages/core/src/schemas/index.ts packages/core/src/schemas/project.ts packages/core/src/schemas/views.ts packages/core/src/store/io.ts packages/core/src/store/whiteboard.ts packages/core/src/index.ts packages/core/test/fixtures.ts packages/core/test/whiteboard.test.ts
git commit -m "feat(core): the Whiteboard Defense's types and its files in the project folder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The built-in Defense type, kept out of Finalize

"Ask Claude about this" (Task 5) makes its threads in a new built-in plumbing type, **Defense questions** (id `defense`, Decision 6). It ships in code, like Plan changes: it needs no setup, it's never imported or listed among the rules files, and it shows in the navigation only once the project has a Defense item, after every shipped type. Its threads are otherwise ordinary. They're questions about the defense, though, not about the plan, so this task keeps them away from Finalize and from the plan's other threads (Review Focus 1):
- they're never on the Finalize checklist, whatever state they're in;
- they're never in the finalizer's pack or the final;
- they never make a proposal stale;
- they can never change the draft, and can add only Questions or Concerns items;
- their decisions never reach another thread's pack or the main window's cross-check;
- they never hold up a plan update.

**Files:**
- Create:
  - `packages/core/src/defenseType.ts`
  - `packages/core/test/defenseType.test.ts`
- Modify:
  - `packages/core/src/planChanges.ts` (`importableTypes` leaves out `defense`)
  - `packages/core/src/config.ts` (`loadConfig` adds the type)
  - `packages/core/src/store/checklist.ts` (`checklistFrom` leaves Defense items out)
  - `packages/core/src/store/context.ts` (`finalizePack` and `importPack.existingItems` leave them out; `threadPack.decisions` leaves out their decisions except in a Defense thread)
  - `packages/core/src/store/finalize.ts` (`finalInputsHash` leaves them and their decisions out; `saveProposal`'s tokens can't name them, nor Plan changes items)
  - `packages/core/src/store/reply.ts` (`postReply` refuses a change, another item type or another item's resolve on a Defense thread)
  - `packages/core/src/store/decisions.ts` (`relevantDecisions` leaves out Defense threads' decisions)
  - `packages/core/src/store/update.ts` (`updateRefusal` doesn't wait for a Defense thread)
  - `packages/core/src/index.ts` (export `./defenseType`)
  - `packages/service/src/routes/threads.ts` (`POST …/items` refuses built-in types)
  - `packages/service/src/routes/config.ts` (a new rules file's order leaves built-in types out)
  - `packages/core/test/config.test.ts` (four expectations change: `loadConfig` now always has two built-in types; one test added)
  - `packages/core/test/finalize.test.ts` (the Plan changes token test covers Defense too, with the new message)
  - `packages/service/test/threads.test.ts`
  - `packages/service/test/config.test.ts`
- Test:
  - `packages/core/test/defenseType.test.ts` (the Review Focus test "a Defense thread never touches Finalize" is here)
  - `packages/core/test/config.test.ts`
  - `packages/core/test/finalize.test.ts`
  - `packages/service/test/threads.test.ts`
  - `packages/service/test/config.test.ts`
  - `packages/core/test/decisions.test.ts`, `packages/core/test/update.test.ts` and `packages/core/test/context.test.ts` (unchanged: they must still pass)

**Interfaces:**
- Consumes:
  - From Task 1: `Item.fromDefense` (the tests set it on Defense items, as Task 5 will).
  - From Plans 1–5:
    - `splitSections` (`rules.ts`) and `PlumbingType`;
    - `PLAN_CHANGES`, `PLAN_CHANGES_TYPE` and `importableTypes` (`planChanges.ts`);
    - `checklistFrom`/`finalizeChecklist`, `finalizePack`, `importPack`, `threadPack`, `finalInputsHash`, `saveProposal`, `postReply`, `relevantDecisions`, `updateRefusal` and `loadProjectHome`;
    - in the tests, `pair`, `seedProject`, `TYPES`, `DRAFT` and `addDecision`.
- Produces, exactly as in the header's Contracts:
  ```ts
  // defenseType.ts
  export const DEFENSE = 'defense';
  export const DEFENSE_TYPE: PlumbingType;   // file '', body = the rules text, builtIn: true
  export const DEFENSE_CHANGE_REFUSAL = "A Defense thread can't change the draft. Leave out change and smallEdits. If the plan needs to change, add a Questions or Concerns item with newItems.";
  export const DEFENSE_NEW_ITEM_TYPES: readonly string[];   // ['questions', 'concerns']
  export const DEFENSE_NEW_ITEMS_REFUSAL = 'A Defense thread can add only Questions or Concerns items.';
  export const DEFENSE_RESOLVE_REFUSAL = 'A Defense thread can resolve only itself.';
  ```
  - **The header:** `{ id: 'defense', title: 'Defense questions', order: 100, screen: 'list', emptyMessage: 'Nothing asked about the Whiteboard Defense yet.', fields: [], answerPresets: [], timeline: false, enabled: true, builtIn: true }`, with `file: ''`, `body` = the rules text below, and `sections = splitSections(body)` (keys `What to look for`, `Rules` and `Done when`).
- **Behaviour:**
  - **`loadConfig`** adds `DEFENSE_TYPE` unless a rules file with the id `defense` loaded, the same way it adds Plan changes. `resolveTypes` sorts by order, so Defense comes last. A user's own `plumbing/defense.md` wins, with `builtIn: false`.
  - **`importableTypes`** is `t.enabled && !t.builtIn && t.id !== PLAN_CHANGES && t.id !== DEFENSE`, so a user's own `defense.md` isn't imported either. `postReply` already takes `newItems` types from `importableTypes`, so Claude can't add a Defense item.
  - **Left out by id** (`item.type === DEFENSE`), so a user's own `defense.md` is left out too:
    - **`checklistFrom`:** never on any list and never blocking, so `canStart` and the header's `blockingCount` ignore it;
    - **`finalizePack`:** not in `items`, so not in `openItems` or `tokens` either, and the decisions about it are dropped with it;
    - **`finalInputsHash`:** neither Defense items nor the active decisions whose `threadId` is a Defense item's thread. A project with no Defense items hashes exactly as before, so a proposal written before this change stays fresh;
    - **`saveProposal`:** a token can't name a Defense item or a Plan changes item. Both now get `<token>: there's no item "<id>".` (before, a Plan changes token got `"<title>" isn't a diagram item.`);
    - **`importPack.existingItems`.**
  - **`postReply`,** when the thread's item is of type `defense`, adds each of these to the problems, once. Like every problem, they refuse the whole reply and write nothing:
    - `DEFENSE_CHANGE_REFUSAL` for an option with a `change` in `options`, or any `smallEdits`;
    - `DEFENSE_NEW_ITEMS_REFUSAL` for a `newItems` entry of any type but `questions` and `concerns`;
    - `DEFENSE_RESOLVE_REFUSAL` for `resolve.itemIds` naming any item but the thread's own.

    A reply with `text` and `resolve` is taken as on any thread: the thread is resolved, Claude's answer stays in it, and its decision is about the Defense item. The Rules ask Claude to do that when the person needs nothing more, so an answered question doesn't wait in the Inbox. Replying reopens it, as on any resolved thread.
  - **Decisions made in Defense threads** stay there:
    - `threadPack.decisions` leaves out the active decisions whose `threadId` is a Defense item's thread, except in a Defense item's own pack, which has them all;
    - `relevantDecisions`, which the main window's cross-check of a submission reads, sends such a decision only with its own thread, never for an item it names or an item linked to it (every item Claude adds from a Defense thread links to it).
  - **`updateRefusal`** doesn't count Defense threads that are with Claude: they can't change the draft, so a plan update doesn't wait for them.
  - **`POST /api/projects/:repo/:id/items`** finds the type with `t.enabled && !t.builtIn`. A built-in type gets the existing 400 `"<type>" isn't an enabled plumbing type.`, so neither Plan changes nor Defense can be made by hand.
  - **`POST /api/rules`** gives a new rules file the order after the highest rules file's, leaving built-in types out. Otherwise Defense's order 100 would give it 101; the existing test "creates a new plumbing type once" expects 11.
  - **Unchanged on purpose:**
    - the Inbox, the project's counts and the Defense questions list screen show Defense threads like any other;
    - `threadPack` gives the thread subagent the type's Rules, as for any type. Task 4 adds the defense itself to the pack.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/defenseType.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFENSE_CHANGE_REFUSAL, DEFENSE_NEW_ITEMS_REFUSAL, DEFENSE_RESOLVE_REFUSAL, DEFENSE_TYPE } from '../src/defenseType';
import { importableTypes } from '../src/planChanges';
import type { FinalizeChecklist, Item, Message, Option, ReplyInput, Thread } from '../src/schemas';
import { finalizeChecklist } from '../src/store/checklist';
import { finalizePack, importPack, threadPack } from '../src/store/context';
import { addDecision, relevantDecisions } from '../src/store/decisions';
import { finalInputsHash } from '../src/store/finalize';
import { readDecisions, readHistory, readItem, readItems, readThread, writeItem, writeThread } from '../src/store/io';
import { loadProjectHome } from '../src/store/projects';
import { postReply } from '../src/store/reply';
import { updateRefusal } from '../src/store/update';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-06T09:00:00.000Z';
const types = [...TYPES, DEFENSE_TYPE];
const RULES = '# Finalize spec rules\n';
const QUESTION = 'Does the unsubscribe link need a signed token?';
const ID = 'defense-does-the-unsubscribe-link-need-a-signed-token';

const you: Message = { id: 'y-1', at: AT, author: 'you', text: QUESTION, sentWith: 'thread' };
const answer: Message = { id: 'm-1', at: AT, author: 'claude', text: "The plan doesn't say. Without one, anyone with the link could unsubscribe someone else." };
const PROPOSAL: Option[] = [
  { id: 'say-so', label: 'Say so in the plan', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table. Sign the unsubscribe link.' }] } },
  { id: 'enough', label: 'That answers it' },
];
const proposal: Message = { id: 'm-2', at: AT, author: 'claude', text: 'Shall I add it to the plan?', options: PROPOSAL, recommended: 'say-so' };

/** A Defense thread in each state that would put an ordinary item on the Finalize checklist. */
const STATES: Record<string, { status: Thread['status']; messages: Message[] }> = {
  'with Claude': { status: 'with_claude', messages: [you] },
  'holding a proposal with a change': { status: 'your_turn', messages: [you, answer, proposal] },
  parked: { status: 'parked', messages: [you, answer] },
  'with no message from you': { status: 'your_turn', messages: [answer] },
};

/** A Defense item, as Ask Claude about this makes it, and its thread. */
function asked(thread: { status: Thread['status']; messages: Message[] }): { item: Item; thread: Thread } {
  const p = pair(ID, { type: 'defense', title: QUESTION, status: thread.status, messages: thread.messages });
  return { item: { ...p.item, createdBy: 'whiteboard', fromDefense: { id: 'w-test', kind: 'section', ref: 'security' } }, thread: p.thread };
}

/** Every item the checklist lists, on any of its lists. */
const listed = (c: FinalizeChecklist) => [...c.blocking, ...c.defaults, ...c.parked, ...c.unreviewed].map((e) => e.itemId);
const draftOf = (dir: string) => fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8');
/** The error a promise rejects with, as its class name and message, or null if it resolves. */
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: Error) => ({ type: e.constructor.name, message: e.message }));

describe('the built-in Defense type', () => {
  it('a Defense thread never touches Finalize', async () => {
    for (const [state, thread] of Object.entries(STATES)) {
      const dir = await seedProject({ pairs: [pair('q1', { title: 'Who gets reminders?', status: 'resolved' })] });
      await addDecision(dir, { text: 'Everyone with an active subscription.', threadId: 't-q1', itemIds: ['q1'] });
      const before = await finalInputsHash(dir);
      const defense = asked(thread);
      await writeItem(dir, defense.item);
      await writeThread(dir, defense.thread);
      await addDecision(dir, { text: 'The unsubscribe link carries a signed token.', threadId: defense.thread.id, itemIds: [defense.item.id] });

      const checklist = await finalizeChecklist(dir, types);
      expect(listed(checklist), state).toEqual([]);
      expect(checklist.canStart, state).toBe(true);
      const pack = await finalizePack({ dir, types, rules: RULES });
      expect(pack.items.map((i) => i.id), state).toEqual(['q1']);
      expect(pack.decisions.map((d) => d.text), state).toEqual(['Everyone with an active subscription.']);
      expect(pack.openItems, state).toEqual([]);
      expect(await finalInputsHash(dir), state).toBe(before);
      // A plan thread's own pack never has the Defense thread's decision.
      expect((await threadPack({ dir, threadId: 't-q1', types })).decisions, state).toEqual(['Everyone with an active subscription.']);
    }

    // Its decisions stay with the defense, even for an item Claude added from the Defense thread, which links to it:
    // neither that item's pack nor the main window's cross-check of a submission gets them. Its own pack has them all.
    const fromIt = pair('questions-sign-the-link', { title: 'Sign the unsubscribe link?', links: [ID] });
    const linked = await seedProject({ pairs: [pair('q1', { title: 'Who gets reminders?', status: 'resolved' }), asked(STATES['with Claude']), fromIt] });
    await addDecision(linked, { text: 'Everyone with an active subscription.', threadId: 't-q1', itemIds: ['q1'] });
    await addDecision(linked, { text: 'The unsubscribe link carries a signed token.', threadId: `t-${ID}`, itemIds: [ID] });
    expect((await threadPack({ dir: linked, threadId: fromIt.thread.id, types })).decisions).toEqual(['Everyone with an active subscription.']);
    expect(await relevantDecisions(linked, [fromIt.thread.id])).toEqual({ decisions: [], total: 2 });
    expect((await threadPack({ dir: linked, threadId: `t-${ID}`, types })).decisions).toEqual(['Everyone with an active subscription.', 'The unsubscribe link carries a signed token.']);
    expect((await relevantDecisions(linked, [`t-${ID}`])).decisions).toEqual(['The unsubscribe link carries a signed token.']);

    // Nor can a reply on one change the draft: a change in an option, or a small edit, is refused and nothing is written.
    const seeded = asked(STATES['with Claude']);
    const dir = await seedProject({ pairs: [seeded, pair('q1', { title: 'Who gets reminders?' })] });
    const reply = (r: Partial<ReplyInput>) =>
      postReply(dir, { reply: { threadId: seeded.thread.id, text: 'A signed token stops anyone unsubscribing someone else.', ...r }, types, autoApply: true, clone: '/nowhere' });
    const refusedFor = (problem: string) => ({ type: 'InputError', message: `Nothing was saved. Fix these and call dp_reply again:\n- ${problem}` });
    const refused = refusedFor(DEFENSE_CHANGE_REFUSAL);
    const smallEdits = [{ summary: 'Sign the link', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table. Sign the unsubscribe link.' }] } }];
    expect(await refusal(reply({ options: PROPOSAL, recommended: 'say-so' }))).toEqual(refused);
    expect(await refusal(reply({ smallEdits }))).toEqual(refused);
    // Both at once are one problem.
    expect(await refusal(reply({ options: PROPOSAL, smallEdits }))).toEqual(refused);
    // Its decision can't settle a plan item either.
    expect(await refusal(reply({ resolve: { decision: 'The link is signed.', itemIds: [ID, 'q1'] } }))).toEqual(refusedFor(DEFENSE_RESOLVE_REFUSAL));
    expect(await readThread(dir, seeded.thread.id)).toEqual(seeded.thread);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
    expect(await readDecisions(dir)).toEqual([]);
  });

  it('takes plain options and a new Questions item on a Defense thread, and no other type of item', async () => {
    const seeded = asked(STATES['with Claude']);
    const dir = await seedProject({ pairs: [seeded] });
    const architecture = postReply(dir, {
      reply: {
        threadId: seeded.thread.id,
        text: 'A signing service would settle it.',
        newItems: [{ type: 'architecture', title: 'Signing service', summary: 'Signs unsubscribe links.', message: { text: 'Add a signing service?' } }],
      },
      types,
      autoApply: true,
      clone: '/nowhere',
    });
    expect(await refusal(architecture)).toEqual({ type: 'InputError', message: `Nothing was saved. Fix these and call dp_reply again:\n- ${DEFENSE_NEW_ITEMS_REFUSAL}` });
    expect((await readItems(dir)).values.map((i) => i.id)).toEqual([ID]);
    const r = await postReply(dir, {
      reply: {
        threadId: seeded.thread.id,
        text: "The plan doesn't say, so I've asked it in Questions.",
        options: [
          { id: 'enough', label: 'That answers it' },
          { id: 'more', label: 'Say more about tokens' },
        ],
        newItems: [{ type: 'questions', title: 'Sign the unsubscribe link?', summary: 'Whether the link carries a signed token.', message: { text: 'Should the unsubscribe link carry a signed token?' } }],
      },
      types,
      autoApply: true,
      clone: '/nowhere',
    });
    expect(r.newThreadIds).toEqual(['t-questions-sign-the-unsubscribe-link']);
    expect((await readThread(dir, seeded.thread.id)).status).toBe('your_turn');
    expect(await readItem(dir, 'questions-sign-the-unsubscribe-link')).toMatchObject({ type: 'questions', createdBy: 'claude', links: [ID] });
    expect(await draftOf(dir)).toBe(DRAFT);
  });

  it('resolves its own answer when the person needs nothing more, keeping the answer in the thread', async () => {
    const seeded = asked(STATES['with Claude']);
    const dir = await seedProject({ pairs: [seeded] });
    const text = "The plan doesn't sign it, so anyone with the link could unsubscribe someone else.";
    await postReply(dir, { reply: { threadId: seeded.thread.id, text, resolve: { decision: "The unsubscribe link isn't signed yet." } }, types, autoApply: true, clone: '/nowhere' });
    const thread = await readThread(dir, seeded.thread.id);
    // Off the Inbox, with Claude's answer still there to read. Replying reopens it, as on any resolved thread.
    expect(thread.status).toBe('resolved');
    expect(thread.messages.at(-1)).toMatchObject({ author: 'claude', text, resolved: true });
    expect((await readDecisions(dir)).map((d) => [d.text, d.itemIds])).toEqual([["The unsubscribe link isn't signed yet.", [ID]]]);
  });

  it("doesn't hold up a plan update while Claude answers a Defense thread", async () => {
    const dir = await seedProject({ pairs: [asked(STATES['with Claude'])] });
    expect(await updateRefusal(dir)).toBeNull();
    const q1 = pair('q1', { status: 'with_claude', messages: [{ ...you, text: 'Who gets reminders?' }] });
    await writeItem(dir, q1.item);
    await writeThread(dir, q1.thread);
    expect(await updateRefusal(dir)).toBe("Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered.");
  });

  it("is never imported, and Claude can't add one in a reply", async () => {
    expect(importableTypes(types).map((t) => t.id)).toEqual(['architecture', 'questions', 'concerns']);
    const q1 = pair('q1', { status: 'with_claude', messages: [{ ...you, text: 'Who gets reminders?' }] });
    const dir = await seedProject({ pairs: [q1] });
    const attempt = postReply(dir, {
      reply: { threadId: 't-q1', text: 'Everyone active.', newItems: [{ type: 'defense', title: 'Is the link signed?', summary: 'A summary.', message: { text: 'Is it?' } }] },
      types,
      autoApply: true,
      clone: '/nowhere',
    });
    expect(await refusal(attempt)).toEqual({
      type: 'InputError',
      message: 'Nothing was saved. Fix these and call dp_reply again:\n- New item 1 (Is the link signed?): "defense" isn\'t an enabled plumbing type. Use one of: architecture, questions, concerns.',
    });
    expect((await readItems(dir)).values.map((i) => i.id)).toEqual(['q1']);
  });

  it("leaves Defense items out of an importer's existing items", async () => {
    const dir = await seedProject({ pairs: [pair('q1'), asked(STATES['with Claude'])] });
    expect((await importPack({ dir, typeId: 'questions', types })).existingItems).toEqual([{ id: 'q1', type: 'questions', title: 'Question q1' }]);
  });

  it('shows Defense in the navigation only once the project has a Defense item, after every other type', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const restock = { repo: 'acme', id: 'restock', dir };
    expect((await loadProjectHome(restock, types)).types.map((t) => t.id)).toEqual(['architecture', 'questions', 'concerns']);
    const defense = asked(STATES['with Claude']);
    await writeItem(dir, defense.item);
    await writeThread(dir, defense.thread);
    const home = await loadProjectHome(restock, types);
    expect(home.types.map((t) => t.id)).toEqual(['architecture', 'questions', 'concerns', 'defense']);
    expect(home.types.at(-1)).toMatchObject({ title: 'Defense questions', itemCount: 1, withClaude: 1, emptyMessage: 'Nothing asked about the Whiteboard Defense yet.' });
    expect(home.inbox.find((e) => e.itemId === ID)?.typeTitle).toBe('Defense questions');
    // It never holds up Finalize, though its thread is with Claude.
    expect(home.finalize).toMatchObject({ canStart: true, blockingCount: 0 });
  });
});
```

In `packages/core/test/config.test.ts`:
- Replace:
```ts
import { installDefaults, loadConfig, resetToDefault, updateSettingsFile } from '../src/config';
```
with:
```ts
import { installDefaults, loadConfig, resetToDefault, updateSettingsFile } from '../src/config';
import { DEFENSE_TYPE } from '../src/defenseType';
```
- In `it('loads the defaults with no problems', …)`, replace:
```ts
    // The ten rules files, and the built-in Plan changes type first.
    expect(c.types).toHaveLength(11);
    expect(c.types[0]).toEqual(PLAN_CHANGES_TYPE);
```
with:
```ts
    // The ten rules files, the built-in Plan changes type first and the built-in Defense type last.
    expect(c.types).toHaveLength(12);
    expect(c.types[0]).toEqual(PLAN_CHANGES_TYPE);
    expect(c.types.at(-1)).toEqual(DEFENSE_TYPE);
```
- In `it('works on an empty folder', …)` and in `it('loadConfig does not reject when plumbing is a regular file', …)`, replace:
```ts
    expect(c.types).toEqual([PLAN_CHANGES_TYPE]);
```
with:
```ts
    expect(c.types).toEqual([PLAN_CHANGES_TYPE, DEFENSE_TYPE]);
```
- In `it('adds the built-in Plan changes type, which a rules file of yours replaces', …)`, replace:
```ts
    expect(c.types.filter((t) => t.builtIn)).toEqual([PLAN_CHANGES_TYPE]);
```
with:
```ts
    expect(c.types.filter((t) => t.builtIn)).toEqual([PLAN_CHANGES_TYPE, DEFENSE_TYPE]);
```
and, further down in the same test, replace:
```ts
    expect(mine.types.filter((t) => t.builtIn)).toEqual([]);
```
with:
```ts
    expect(mine.types.filter((t) => t.builtIn)).toEqual([DEFENSE_TYPE]);
```
- Add this test just before `it('reads repo profiles and reports broken or duplicate ones', …)`:
```ts
  it('adds the built-in Defense type last, which a rules file of yours replaces, and never imports it', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    const c = await loadConfig(dir);
    expect(DEFENSE_TYPE).toMatchObject({
      id: 'defense',
      title: 'Defense questions',
      order: 100,
      screen: 'list',
      emptyMessage: 'Nothing asked about the Whiteboard Defense yet.',
      fields: [],
      answerPresets: [],
      timeline: false,
      enabled: true,
      builtIn: true,
      file: '',
    });
    expect(Object.keys(DEFENSE_TYPE.sections)).toEqual(['What to look for', 'Rules', 'Done when']);
    expect(DEFENSE_TYPE.sections.Rules).toContain("The item's body is that part, as Markdown, and the pack's `defense` is the whole defense.");
    expect(DEFENSE_TYPE.sections.Rules).toContain('Never offer a change to the draft');
    expect(DEFENSE_TYPE.sections.Rules).toContain('add a Questions or Concerns item with `newItems`');
    expect(DEFENSE_TYPE.sections.Rules).toContain('send it with `resolve` and a one-line decision that sums it up');
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

In `packages/core/test/finalize.test.ts`:
- Replace:
```ts
import { diagramMermaid } from '../src/finalExport';
```
with:
```ts
import { DEFENSE_TYPE } from '../src/defenseType';
import { diagramMermaid } from '../src/finalExport';
```
- Replace the whole test `it("refuses a token naming a Plan changes item, which has no drawing, saving nothing", …)` with:
```ts
  it('refuses a token naming a Plan changes or a Defense item, saving nothing: neither goes into the final', async () => {
    const conflict = pair('plan-changes-v2-1', { type: 'plan-changes', title: 'Approach', status: 'resolved' });
    const asked = pair('defense-link-token', { type: 'defense', title: 'Does the unsubscribe link need a token?', status: 'resolved' });
    const dir = await seedProject({ pairs: [conflict, asked] });
    const all = [...types, PLAN_CHANGES_TYPE, DEFENSE_TYPE];
    const request = await requestFinalize(dir, { types: all });
    await pickUpFinalize(dir, 'w-a');
    const before = await readFinalize(dir);
    const markdown = '# Final\n\n{{diagram:plan-changes-v2-1}}\n\n{{diagram:defense-link-token}}\n';
    expect(await refusal(saveProposal(dir, { requestId: request.id, markdown, types: all, name: 'restock' }))).toEqual({
      type: 'InputError',
      message: [
        'Nothing was saved. Fix these and call dp_finalize again with the whole document:',
        '- {{diagram:plan-changes-v2-1}}: there\'s no item "plan-changes-v2-1".',
        '- {{diagram:defense-link-token}}: there\'s no item "defense-link-token".',
      ].join('\n'),
    });
    expect(await readFinalize(dir)).toEqual(before);
    expect(await exists(proposalFile(dir))).toBe(false);
  });
```

In `packages/service/test/threads.test.ts`:
- Replace:
```ts
import { readItem, readThread, writeJsonAtomic } from '@dev-plumbing/core';
```
with:
```ts
import { readItem, readItems, readThread, writeJsonAtomic } from '@dev-plumbing/core';
```
- Add this test just after `it('adds your own question and sends it', …)`. Replace:
```ts
    expect((await t.send('POST', `${P}/items`, { type: 'nope', title: 'x', text: 'y' })).status).toBe(400);
  });
```
with:
```ts
    expect((await t.send('POST', `${P}/items`, { type: 'nope', title: 'x', text: 'y' })).status).toBe(400);
  });

  it("won't make an item of a built-in type: dev-plumbing makes those itself", async () => {
    const t = await setup();
    for (const type of ['defense', 'plan-changes']) {
      const r = await t.send('POST', `${P}/items`, { type, title: 'Is the link signed?', text: 'Does the unsubscribe link need a token?' });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe(`"${type}" isn't an enabled plumbing type.`);
    }
    expect((await readItems(t.dir)).values.map((i) => i.type).sort()).toEqual(['questions', 'questions']);
  });
```

In `packages/service/test/config.test.ts`, replace the whole test `it('leaves the built-in Plan changes type out of the rules and settings lists', …)` with:
```ts
  it('leaves the built-in Plan changes and Defense types out of the rules and settings lists', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const ids = async (route: string) => ((await (await call(app, route)).json()) as { types: { id: string }[] }).types.map((t) => t.id);
    expect(await ids('/api/rules')).toHaveLength(10);
    for (const id of ['plan-changes', 'defense']) {
      expect(await ids('/api/rules')).not.toContain(id);
      expect(await ids('/api/config')).not.toContain(id);
      expect((await call(app, `/api/rules/${id}.md`)).status).toBe(404);
    }
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/defenseType.test.ts packages/core/test/config.test.ts packages/core/test/finalize.test.ts packages/service/test/threads.test.ts packages/service/test/config.test.ts`
Expected: FAIL.
- `defenseType.test.ts`, `config.test.ts` and `finalize.test.ts` don't load: `Error: Cannot find module '../src/defenseType'`.
- In `threads.test.ts`, the new test fails with `expected 200 to be 400`: today a Plan changes item can be made by hand.
- `service/test/config.test.ts` already passes: there's no Defense type yet. It guards the rules lists once `loadConfig` adds one.

- [ ] **Step 3: Write the Defense type**

`packages/core/src/defenseType.ts`:
```ts
import { splitSections } from './rules';
import type { PlumbingType } from './schemas';

/** The built-in plumbing type for the questions you ask Claude about the Whiteboard Defense ("Ask Claude about this"). */
export const DEFENSE = 'defense';

/** postReply's problem when a reply on a Defense thread would change the draft. */
export const DEFENSE_CHANGE_REFUSAL =
  "A Defense thread can't change the draft. Leave out change and smallEdits. If the plan needs to change, add a Questions or Concerns item with newItems.";
/** The only plumbing types a reply on a Defense thread may add an item of: a gap it shows is a question or a concern. */
export const DEFENSE_NEW_ITEM_TYPES: readonly string[] = ['questions', 'concerns'];
/** postReply's problem when a reply on a Defense thread adds an item of any other type. */
export const DEFENSE_NEW_ITEMS_REFUSAL = 'A Defense thread can add only Questions or Concerns items.';
/** postReply's problem when a reply on a Defense thread resolves another item: its decision is about the defense. */
export const DEFENSE_RESOLVE_REFUSAL = 'A Defense thread can resolve only itself.';

// The thread subagent reads the Rules section. Defense items are made by the Whiteboard Defense page, never by an
// importer, and the person's question is always the thread's first message.
const RULES = `## What to look for
- Nothing to import. A Defense item is made when the person asks Claude about one part of the project's Whiteboard Defense, on the Whiteboard Defense page.

## Rules
- Each thread is the person's question about one part of the project's Whiteboard Defense: a section, a question the engineer should be able to answer, or a release concern. The item's body is that part, as Markdown, and the pack's \`defense\` is the whole defense.
- Answer plainly, from the plan, the draft, the decisions and the code you can read. Say which of your statements are known (you read it), inferred (it follows from what you read) or unknown.
- Never offer a change to the draft: no option has a \`change\`, and the reply has no \`smallEdits\`. dev-plumbing refuses a Defense reply that has either.
- When your answer needs nothing more from the person, send it with \`resolve\` and a one-line decision that sums it up, so it doesn't wait in their Inbox. They can reply to carry on. Resolve only this thread: leave out \`resolve.itemIds\`.
- Offer options only when the person must choose.
- When the answer shows a gap or a risk the plan doesn't cover, add a Questions or Concerns item with \`newItems\`, and say so in your reply. A Defense thread can't add an item of any other type.
- When the person says their question is answered, resolve the thread with a one-line decision that sums up the answer.

## Done when
- The person's question is answered, and the thread is resolved.
`;

/**
 * Defense ships in code, like Plan changes: it needs no setup, and it's never imported, listed among the rules files,
 * turned off or put on the Finalize checklist, and never goes into the final. Its order puts it after every shipped
 * type, and the navigation shows it only once the project has a Defense item. loadConfig adds it, unless the user has
 * their own plumbing/defense.md.
 */
export const DEFENSE_TYPE: PlumbingType = {
  id: DEFENSE,
  title: 'Defense questions',
  order: 100,
  screen: 'list',
  emptyMessage: 'Nothing asked about the Whiteboard Defense yet.',
  fields: [],
  answerPresets: [],
  timeline: false,
  enabled: true,
  builtIn: true,
  file: '',
  body: RULES,
  sections: splitSections(RULES),
};
```

In `packages/core/src/index.ts`, replace:
```ts
export * from './planChanges';
```
with:
```ts
export * from './planChanges';
export * from './defenseType';
```

- [ ] **Step 4: Add it in `loadConfig`, and keep it out of imports**

In `packages/core/src/config.ts`, replace:
```ts
import { PLAN_CHANGES, PLAN_CHANGES_TYPE } from './planChanges';
```
with:
```ts
import { DEFENSE_TYPE } from './defenseType';
import { PLAN_CHANGES_TYPE } from './planChanges';
```
and in `loadConfig`, replace:
```ts
  // Plan changes ships in code. The user's own plumbing/plan-changes.md, when it loads, replaces it.
  if (!results.some((r) => r.ok && r.type.id === PLAN_CHANGES)) results.push({ ok: true, type: PLAN_CHANGES_TYPE });
```
with:
```ts
  // Plan changes and Defense ship in code. The user's own plumbing/plan-changes.md or plumbing/defense.md, when it
  // loads, replaces the built-in one.
  for (const builtIn of [PLAN_CHANGES_TYPE, DEFENSE_TYPE]) {
    if (!results.some((r) => r.ok && r.type.id === builtIn.id)) results.push({ ok: true, type: builtIn });
  }
```

In `packages/core/src/planChanges.ts`, replace:
```ts
import { splitSections } from './rules';
```
with:
```ts
import { DEFENSE } from './defenseType';
import { splitSections } from './rules';
```
and replace:
```ts
/**
 * The types an import (or a re-import) runs an importer for: the enabled ones that aren't built in. Plan changes items
 * are made by an update, never by an importer, so a user's own plan-changes.md isn't imported either.
 */
export function importableTypes(types: PlumbingType[]): PlumbingType[] {
  return types.filter((t) => t.enabled && !t.builtIn && t.id !== PLAN_CHANGES);
}
```
with:
```ts
/**
 * The types an import (or a re-import) runs an importer for: the enabled ones that aren't built in. Plan changes items
 * are made by an update and Defense items by the Whiteboard Defense page, never by an importer, so a user's own
 * plan-changes.md or defense.md isn't imported either.
 */
export function importableTypes(types: PlumbingType[]): PlumbingType[] {
  return types.filter((t) => t.enabled && !t.builtIn && t.id !== PLAN_CHANGES && t.id !== DEFENSE);
}
```
(`defenseType.ts` imports only `rules.ts` and types, so there's no import cycle.)

- [ ] **Step 5: Keep Defense items out of Finalize**

In `packages/core/src/store/checklist.ts`, replace:
```ts
import { CONFLICT_REASON, PLAN_CHANGES } from '../planChanges';
```
with:
```ts
import { DEFENSE } from '../defenseType';
import { CONFLICT_REASON, PLAN_CHANGES } from '../planChanges';
```
and in the comment above `checklistFrom`, replace:
```ts
 * of disabled types are left out, as the app doesn't show them.
 */
```
with:
```ts
 * of disabled types are left out, as the app doesn't show them. So are Defense items: a question about the Whiteboard
 * Defense never holds up Finalize, whatever state its thread is in.
 */
```
and in its body, replace:
```ts
  const items = o.items.filter((i) => typeById.get(i.type)?.enabled !== false).sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
```
with:
```ts
  const items = o.items
    .filter((i) => typeById.get(i.type)?.enabled !== false && i.type !== DEFENSE)
    .sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
```

In `packages/core/src/store/context.ts`, replace:
```ts
import { diffText } from '../docDiff';
```
with:
```ts
import { DEFENSE } from '../defenseType';
import { diffText } from '../docDiff';
```
In `ImportPack`, replace:
```ts
  /** Every item but the Plan changes ones, which aren't part of the plan. One whose part of the plan was removed says so. */
```
with:
```ts
  /**
   * Every item but the Plan changes and Defense ones, which aren't part of the plan. One whose part of the plan was
   * removed says so.
   */
```
In `importPack`, replace:
```ts
    existingItems: items.filter((i) => i.type !== PLAN_CHANGES).map(
```
with:
```ts
    existingItems: items.filter((i) => i.type !== PLAN_CHANGES && i.type !== DEFENSE).map(
```
In `FinalizePack`, replace:
```ts
  /**
   * Every item that goes into the final, in plumbing-type order. Parked items, items of disabled types and Plan changes
   * items (what they settled is already in the draft) are left out of the final, so they aren't here.
   */
```
with:
```ts
  /**
   * Every item that goes into the final, in plumbing-type order. Parked items, items of disabled types, Plan changes
   * items (what they settled is already in the draft) and Defense items (questions about the Whiteboard Defense) are
   * left out of the final, so they aren't here.
   */
```
In `finalizePack`, replace:
```ts
  // Parked items and items of disabled plumbing types don't go into the final (saveProposal refuses their tokens).
  // Nor do Plan changes items: what they settled is already in the draft. saveProposal doesn't leave them out, but
  // a token can't name one anyway, since every token needs a drawing and they have none.
  const items = allItems
    .filter((i) => statusOf(i) !== 'parked' && typeOf(i)?.enabled !== false && i.type !== PLAN_CHANGES)
```
with:
```ts
  // Parked items and items of disabled plumbing types don't go into the final (saveProposal refuses their tokens).
  // Nor do Plan changes items, since what they settled is already in the draft, or Defense items, which are questions
  // about the Whiteboard Defense. Leaving an item out leaves out the decisions about it too.
  const items = allItems
    .filter((i) => statusOf(i) !== 'parked' && typeOf(i)?.enabled !== false && i.type !== PLAN_CHANGES && i.type !== DEFENSE)
```
The decisions need no change of their own: `finalizePack` already drops a decision whose item isn't in the pack, and a decision made in a Defense thread is about its Defense item.

In `packages/core/src/store/finalize.ts`, replace:
```ts
import { expandTokens } from '../finalExport';
```
with:
```ts
import { DEFENSE } from '../defenseType';
import { expandTokens } from '../finalExport';
import { PLAN_CHANGES } from '../planChanges';
```
In `finalInputsHash` and its comment, replace:
```ts
 * redrew an item's data.
 */
export async function finalInputsHash(dir: string): Promise<string> {
  const project = await readProjectFile(dir);
  const draft = await readDocText(dir, project.docs.draft);
  const [{ values }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  // flags ("May need another look") and the reviewed mark are review marks, not content: setting or clearing one
  // mustn't make a proposal stale.
  const items = values.sort((a, b) => a.id.localeCompare(b.id)).map(({ flags: _flags, reviewedAt: _reviewedAt, ...content }) => content);
```
with:
```ts
 * redrew an item's data. Defense items and the decisions made in their threads are questions about the Whiteboard
 * Defense, never part of the final, so asking one never makes a proposal stale.
 */
export async function finalInputsHash(dir: string): Promise<string> {
  const project = await readProjectFile(dir);
  const draft = await readDocText(dir, project.docs.draft);
  const [{ values }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const defenseThreads = new Set(values.filter((i) => i.type === DEFENSE).map((i) => i.threadId));
  // flags ("May need another look") and the reviewed mark are review marks, not content: setting or clearing one
  // mustn't make a proposal stale.
  const items = values
    .filter((i) => i.type !== DEFENSE)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ flags: _flags, reviewedAt: _reviewedAt, ...content }) => content);
```
and replace:
```ts
  const decisions = activeDecisions(await readDecisions(dir)).map((d) => ({ text: d.text, threadId: d.threadId }));
  return draftHash(stable({ draft, items, parked, decisions }));
```
with:
```ts
  const decisions = activeDecisions(await readDecisions(dir))
    .filter((d) => !defenseThreads.has(d.threadId))
    .map((d) => ({ text: d.text, threadId: d.threadId }));
  return draftHash(stable({ draft, items, parked, decisions }));
```
In the comment above `saveProposal`, replace:
```ts
 * saves nothing. Tokens can't name parked items or items of disabled types. Plan changes items aren't left out here, as
 * they are from the finalizer's pack, but a token can't name one either: every token needs a drawing, and they have
 * none. Otherwise the expanded final goes to docs/final.proposed.md, and the request records finalInputsHash (the
 * current draft, items and decisions) and the mockups the final links to. `name` is finalName(project.source.path).
```
with:
```ts
 * saves nothing. Tokens can't name parked items, items of disabled types, Plan changes items or Defense items: as in
 * the finalizer's pack, none of them goes into the final. Otherwise the expanded final goes to
 * docs/final.proposed.md, and the request records finalInputsHash (the current draft, items and decisions) and the
 * mockups the final links to. `name` is finalName(project.source.path).
```
and in `saveProposal`, replace:
```ts
  // As in the checklist and the finalizer's pack, parked items and items of disabled plumbing types can't be named.
  // Plan changes items, which the pack also leaves out, are refused by expandTokens: they have no drawing.
  const [{ values: items }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const statusByThread = new Map(threads.map((t) => [t.id, displayStatus(t)]));
  const enabled = (i: Item) => o.types.find((t) => t.id === i.type)?.enabled !== false;
  const parked = new Map(items.filter((i) => enabled(i) && statusByThread.get(i.threadId) === 'parked').map((i) => [i.id, i]));
  const inFinal = items.filter((i) => enabled(i) && !parked.has(i.id));
```
with:
```ts
  // As in the checklist and the finalizer's pack, parked items, items of disabled plumbing types, Plan changes items and
  // Defense items can't be named.
  const [{ values: items }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const statusByThread = new Map(threads.map((t) => [t.id, displayStatus(t)]));
  const inPlan = (i: Item) => o.types.find((t) => t.id === i.type)?.enabled !== false && i.type !== PLAN_CHANGES && i.type !== DEFENSE;
  const parked = new Map(items.filter((i) => inPlan(i) && statusByThread.get(i.threadId) === 'parked').map((i) => [i.id, i]));
  const inFinal = items.filter((i) => inPlan(i) && !parked.has(i.id));
```

- [ ] **Step 6: A Defense thread never changes the draft, and its decisions stay with it**

In `packages/core/src/store/reply.ts`, replace:
```ts
import { importableTypes } from '../planChanges';
```
with:
```ts
import { DEFENSE, DEFENSE_CHANGE_REFUSAL, DEFENSE_NEW_ITEM_TYPES, DEFENSE_NEW_ITEMS_REFUSAL, DEFENSE_RESOLVE_REFUSAL } from '../defenseType';
import { importableTypes } from '../planChanges';
```
In `postReply`, replace:
```ts
  const itemIds = new Set(items.map((i) => i.id));
  // The types Claude may add an item of: the enabled ones, but never a built-in one (Plan changes comes from updates).
```
with:
```ts
  const itemIds = new Set(items.map((i) => i.id));
  const threadItem = items.find((i) => i.id === thread.itemId);
  // The types Claude may add an item of: the enabled ones, but never a built-in one (Plan changes comes from updates,
  // Defense from the Whiteboard Defense page).
```
then replace:
```ts
  if (r.recommended && !r.options) problems.push('recommended needs options.');
```
with:
```ts
  if (r.recommended && !r.options) problems.push('recommended needs options.');
  // A Defense thread is a question about the Whiteboard Defense: it never changes the draft, and its decision is about
  // the defense, never another item. A gap it shows becomes a Questions or Concerns item through newItems instead.
  if (threadItem?.type === DEFENSE) {
    if (r.options?.some((op) => op.change) || r.smallEdits?.length) problems.push(DEFENSE_CHANGE_REFUSAL);
    if (newItems.some((n) => !DEFENSE_NEW_ITEM_TYPES.includes(n.type))) problems.push(DEFENSE_NEW_ITEMS_REFUSAL);
    if (r.resolve?.itemIds?.some((id) => id !== thread.itemId)) problems.push(DEFENSE_RESOLVE_REFUSAL);
  }
```
and, near the end, replace:
```ts
  const removedIn = items.find((i) => i.id === thread.itemId)?.removedIn;
```
with:
```ts
  const removedIn = threadItem?.removedIn;
```

A decision made in a Defense thread is about the Whiteboard Defense, so it stays out of the plan's threads. In `packages/core/src/store/context.ts`, in `threadPack`, replace:
```ts
  const { values: items } = await readItems(o.dir);
  const type = o.types.find((t) => t.id === item.type);
```
with:
```ts
  const { values: items } = await readItems(o.dir);
  const defenseThreads = new Set(items.filter((i) => i.type === DEFENSE).map((i) => i.threadId));
  const type = o.types.find((t) => t.id === item.type);
```
and replace:
```ts
    decisions: activeDecisions(await readDecisions(o.dir)).map((d) => d.text),
```
with:
```ts
    // Decisions made in Defense threads are about the Whiteboard Defense, not the plan: only a Defense thread sees them.
    decisions: activeDecisions(await readDecisions(o.dir))
      .filter((d) => item.type === DEFENSE || !defenseThreads.has(d.threadId))
      .map((d) => d.text),
```

In `packages/core/src/store/decisions.ts`, the main window's cross-check leaves them out the same way. Replace:
```ts
import type { Decision, Thread } from '../schemas';
```
with:
```ts
import { DEFENSE } from '../defenseType';
import type { Decision, Thread } from '../schemas';
```
and replace:
```ts
 * threads' items or the items linked to them (either direction). `total` counts every active decision, so
 * the main window knows the rest exist without being sent them.
 */
```
with:
```ts
 * threads' items or the items linked to them (either direction). A decision made in a Defense thread is about the
 * Whiteboard Defense, not the plan, so it goes only with its own thread, never with an item it names or one linked to
 * it. `total` counts every active decision, so the main window knows the rest exist without being sent them.
 */
```
and replace:
```ts
  const decisions = active.filter((d) => threads.has(d.threadId) || d.itemIds.some((id) => touched.has(id))).map((d) => d.text);
```
with:
```ts
  const defenseThreads = new Set(items.filter((i) => i.type === DEFENSE).map((i) => i.threadId));
  const decisions = active
    .filter((d) => threads.has(d.threadId) || (!defenseThreads.has(d.threadId) && d.itemIds.some((id) => touched.has(id))))
    .map((d) => d.text);
```

A plan update doesn't wait for a Defense thread either: it can't change the draft. In `packages/core/src/store/update.ts`, replace:
```ts
import { importableTypes, PLAN_CHANGES } from '../planChanges';
```
with:
```ts
import { DEFENSE } from '../defenseType';
import { importableTypes, PLAN_CHANGES } from '../planChanges';
```
and in `updateRefusal` and its comment, replace:
```ts
 * under: an import, threads queued for Claude, or a finalize.
 */
export async function updateRefusal(dir: string): Promise<string | null> {
  const project = await readProjectFile(dir);
  if (project.status === 'importing') return "This project is still importing. Run /dev-plumbing again once that's done.";
  const waiting = (await readThreads(dir)).values.filter((t) => t.status === 'with_claude').length;
```
with:
```ts
 * under: an import, threads queued for Claude (but not Defense threads, which can't change the draft), or a finalize.
 */
export async function updateRefusal(dir: string): Promise<string | null> {
  const project = await readProjectFile(dir);
  if (project.status === 'importing') return "This project is still importing. Run /dev-plumbing again once that's done.";
  const defenseThreads = new Set((await readItems(dir)).values.filter((i) => i.type === DEFENSE).map((i) => i.threadId));
  const waiting = (await readThreads(dir)).values.filter((t) => t.status === 'with_claude' && !defenseThreads.has(t.id)).length;
```

- [ ] **Step 7: Built-in types can't be made by hand, nor count for a new rules file's order**

In `packages/service/src/routes/threads.ts`, in `POST ${base}/items`, replace:
```ts
      const type = cfg.types.find((t) => t.id === body.type && t.enabled);
      if (!type) throw new InputError(`"${body.type}" isn't an enabled plumbing type.`);
```
with:
```ts
      // Built-in types (Plan changes, Defense) are only ever made by dev-plumbing itself.
      const type = cfg.types.find((t) => t.id === body.type && t.enabled && !t.builtIn);
      if (!type) throw new InputError(`"${body.type}" isn't an enabled plumbing type.`);
```

In `packages/service/src/routes/config.ts`, in `POST /rules`, replace:
```ts
    const order = Math.max(0, ...cfg.types.map((t) => t.order)) + 1;
```
with:
```ts
    // After the rules files you have. Built-in types (Defense's order is 100) don't count.
    const order = Math.max(0, ...cfg.types.filter((t) => !t.builtIn).map((t) => t.order)) + 1;
```

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run packages/core/test/defenseType.test.ts packages/core/test/config.test.ts packages/core/test/finalize.test.ts packages/core/test/decisions.test.ts packages/core/test/update.test.ts packages/core/test/context.test.ts packages/service/test/threads.test.ts packages/service/test/config.test.ts`
Expected: PASS (7, 21 and 18 tests in core, with `decisions.test.ts`, `update.test.ts` and `context.test.ts` unchanged; 14 and 21 in the service).

Run:
```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e rules
pnpm test:e2e
```
Expected: PASS. Every other test that counts types is unchanged, because built-in types are hidden until a project has items of them: `projects.test.ts` (10 types in the home), `service/test/config.test.ts` (10 rules) and `service/test/claude.test.ts` (10 import types). The e2e runs check that the Rules page, Settings and every project's navigation still show the ten shipped types and nothing else, and that a new rules file comes after them.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/defenseType.ts packages/core/src/planChanges.ts packages/core/src/config.ts packages/core/src/store/checklist.ts packages/core/src/store/context.ts packages/core/src/store/finalize.ts packages/core/src/store/reply.ts packages/core/src/store/decisions.ts packages/core/src/store/update.ts packages/core/src/index.ts packages/core/test/defenseType.test.ts packages/core/test/config.test.ts packages/core/test/finalize.test.ts packages/service/src/routes/threads.ts packages/service/src/routes/config.ts packages/service/test/threads.test.ts packages/service/test/config.test.ts
git commit -m "feat(core): a built-in Defense type for questions about the Whiteboard Defense, kept out of Finalize" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Generating and saving a defense, and Out of date

**Generate** saves a request in `whiteboard/request.json`. A listening window picks it up (Task 7 calls `pickUpWhiteboard` from `/wait`), and that records what the subagent reads: the final while it's current (nothing changed and no newer plan version since Accept), else the draft, the plan version and the defense's inputs hash. The subagent sends its defense whole, and `saveDefense` checks all of it before writing anything (Review Focus 2):
- a payload with any problem is refused, with every problem listed;
- the last saved defense stays exactly as it was;
- the request stays `writing`, so the subagent can send it again.

A window that comes back without saving fails its request; one that's gone gives it back; Cancel removes it in any state. A saved defense knows when it's out of date, and only plan changes make it so (Review Focus 3). The project home gains `defense`, for the header and the navigation (Task 10).

**Files:**
- Modify:
  - `packages/core/src/store/whiteboard.ts` (replaced whole: Task 1's reads and writes, plus the lifecycle)
  - `packages/core/src/store/update.ts` (`planVersionSinceFinal`, the Finalize page's rule, as a helper the defense shares)
  - `packages/core/src/schemas/views.ts` (`ProjectHome.defense`)
  - `packages/core/src/store/projects.ts` (`loadProjectHome` fills it, and uses `planVersionSinceFinal`)
  - `packages/core/test/whiteboard.test.ts` (Task 1's file, continued)
  - `packages/core/test/projects.test.ts`
- Test:
  - `packages/core/test/whiteboard.test.ts` (the Review Focus tests "a refused defense leaves the last one as it was" and "only plan changes make the defense out of date" are here)
  - `packages/core/test/projects.test.ts`

`packages/core/src/index.ts` already exports `./store/whiteboard` (Task 1), so the new functions are exported with no change there.

**Interfaces:**
- Consumes:
  - From Task 1:
    - the schemas and constants: `defenseInputSchema`, `whiteboardDefenseSchema`, `whiteboardRequestSchema`, `practiceSchema`, `DEFENSE_SECTIONS`, `sectionIds`, `severityValues`;
    - the types `DefenseInput`, `WhiteboardDefense`, `WhiteboardRequest` and `WhiteboardState`;
    - the reads, writes and `removeWhiteboardRequest` (kept unchanged in the new file) and `projectFiles(dir).defense`;
    - in the tests, `validDefenseInput()` and `storedDefense()`.
  - From Task 2: `DEFENSE`, and `DEFENSE_TYPE` in the tests.
  - From Plans 1–5:
    - `stable` (`store/changes.ts`), `changesSinceFinal` (`store/checklist.ts`), `activeDecisions` (`store/decisions.ts`), `draftHash` (`store/finalize.ts`), `changedDraft` (`store/update.ts`), `nothingSaved` (`store/validate.ts`), and `currentVersion` and `projectVersions` (`store/versions.ts`);
    - `dataKindOf` and `displayStatus` (`schemas`);
    - `ConflictError`, `newId`, `readItems`, `readThreads`, `readDecisions`, `readHistory`, `readProjectFile`, `readDocText` and `readJsonFile` (`store/io.ts`);
    - in the tests, `addDecision`, `setReviewed`, `setParked`, `writeDocText`, `writeHistoryEntry`, `writeProjectFile`, `writeItem`, `writeThread`, `pair`, `seedProject`, `storedDefense`, `TYPES` and `DRAFT`.
- Produces, as in the header's Contracts (all exported from `@dev-plumbing/core`):
  ```ts
  export const WHITEBOARD_RETRY = 'call dp_whiteboard again with the whole defense';
  export const WHITEBOARD_GAVE_UP = "The whiteboard subagent didn't send a Whiteboard Defense.";
  export const WHITEBOARD_IMPORTING = "The plan is still importing. Generate the Whiteboard Defense once that's done.";
  export const WHITEBOARD_UNDER_WAY = 'The Whiteboard Defense is already being written.';
  export const MAX_DEFENSE_CHARS = 120_000;
  export async function defenseBasis(dir: string): Promise<{ doc: 'final' | 'draft'; version: number; text: string }>;
  export async function defenseInputsHash(dir: string): Promise<string>;
  export function checklistLines(rules: string): string[];
  export async function requestWhiteboard(dir: string, o?: { now?: Date }): Promise<WhiteboardRequest>;
  export async function pickUpWhiteboard(dir: string, windowId: string, now?: Date): Promise<WhiteboardRequest | null>;
  export async function saveDefense(dir: string, o: { requestId: string; defense: unknown; types: PlumbingType[]; checklist?: string[]; now?: Date }): Promise<WhiteboardDefense>;
  export async function finishWhiteboard(dir: string, o: { requestId: string; windowId: string; error?: string; now?: Date }): Promise<void>;
  export async function requeueWhiteboard(dir: string, isAlive: (windowId: string) => boolean, now?: Date): Promise<boolean>;
  export async function cancelWhiteboard(dir: string): Promise<void>;
  export async function defenseStale(dir: string, defense: WhiteboardDefense): Promise<string | null>;
  export async function defenseStatus(dir: string): Promise<ProjectHome['defense']>;
  export async function defenseDiagramItemIds(dir: string, types: PlumbingType[]): Promise<string[]>;
  // store/update.ts
  export function planVersionSinceFinal(project: PlumbingProject): number | null;
  ```
  - Three of these go beyond the Contracts' list, so each rule has one source:
    - `WHITEBOARD_IMPORTING` and `WHITEBOARD_UNDER_WAY` are Generate's two refusals. Task 8's page view repeats them as `generateRefusal`.
    - `defenseDiagramItemIds` lists the diagram items `diagramItemId` may name. Task 4's `whiteboardPack` offers exactly these, so the pack offers what `saveDefense` accepts.
  - `ProjectHome` gains `defense: { ready: boolean; stale: boolean; state: WhiteboardState | null }`, which `loadProjectHome` fills with `defenseStatus`. The service's `GET /api/projects/:repo/:id` returns it with no change of its own.
  - `planVersionSinceFinal(project)` is the expression `loadProjectHome` used for `finalize.planVersionSinceFinal`, moved into `update.ts` beside `changedDraft`, so the Finalize page and the defense share one rule.
- **Rules:**
  - **`defenseBasis`:** the document is `project.docs.final`, read with `readDocText`, only while that final is current:
    - `project.docs.final` is set;
    - no change was applied since the last Accept: `changesSinceFinal(readHistory(dir), project.docs.exportedTo?.at) === 0`;
    - and no plan version that changed the draft came in after it: `planVersionSinceFinal(project) === null`.

    Otherwise it's `project.docs.draft`. `version` is `currentVersion(project).n`. A final the plan has moved on from isn't the plan any more, so the defense explains the draft.
  - **`defenseInputsHash`** is the sha256 hex (`draftHash`) of `stable({ doc, document, items, parked, decisions })`:
    - `doc` and `document`: the basis's `doc` and `text`;
    - `items`: every item except Defense items (`type === 'defense'`) and items the whiteboard made (`createdBy === 'whiteboard'`), sorted by id, without `flags` and `reviewedAt`;
    - `parked`: the ids, among those items, whose thread's display status is `parked`;
    - `decisions`: the active decisions, as `{ text, threadId }`, except those whose `threadId` is a Defense item's thread.

    So asking Claude, sending a part of the defense to plumbing, flags, the reviewed mark and practice never change it. A decision in the thread of a sent Questions item does change it: that answers a question about the plan. So does a Questions or Concerns item Claude adds from a Defense thread (`createdBy: 'claude'`): it's a plan item like any other. The basis moving changes it too, since `doc` and `document` change: a final accepted after a defense of the draft, or a final that stops being current.
  - **`requestWhiteboard`** refuses, with ConflictError and in this order:
    - `WHITEBOARD_IMPORTING`, "The plan is still importing. Generate the Whiteboard Defense once that's done.", while `project.status === 'importing'`;
    - `WHITEBOARD_UNDER_WAY`, "The Whiteboard Defense is already being written.", while a request is `requested` or `writing`.

    Otherwise it writes `{ id: newId('g', now), state: 'requested', requestedAt }`, replacing a `failed` request (or a damaged file). The saved defense is untouched.
  - **`pickUpWhiteboard`:** only from `requested`. It writes `state: 'writing'`, `pickedUpAt`, `pickedUpBy`, `inputsHash: await defenseInputsHash(dir)` and `basedOn: { doc, version }` from `defenseBasis`. It returns null when there's nothing to take.
    - It also returns null while `project.status === 'importing'`: a request made before a plan update waits out the re-import, so it's never written from a half re-imported project. It's picked up once the import is done.
  - **`checklistLines(rules)`** reads the lines matching `^\s*(?:[-*]\s+)?\[ \]\s+(.+?)\s*$`, one line at a time, in order. Each is cut to 300 characters and kept once, and it stops at 40. A rules file with none gives `[]`. The service passes these to `saveDefense` (Task 7).
  - **`saveDefense`:**
    - The request must have this id and be `writing`. Otherwise it throws ConflictError `There's no Whiteboard Defense request ${requestId} waiting for a defense.`
    - It then collects every problem, in this order, and throws `nothingSaved(problems, WHITEBOARD_RETRY)` if there are any:
      1. the schema's, as `${path}: ${message}` with the path joined by dots;
      2. `The defense is ${n} characters of JSON; the most is 120,000.` when `JSON.stringify(defense).length` is over `MAX_DEFENSE_CHARS` (`n` with commas);
      3. the sections, read from the payload as sent (so they're listed even when the schema refused something else), section by section in `DEFENSE_SECTIONS` order:
         - `sections: ${id} is missing.`;
         - `sections: ${id} is there more than once.`;
         - `sections: ${id} needs at least one claim. Mark what isn't known as unknown.` for an empty `claims` list;
         - `sections: ${id}: table ${t} row ${r} has ${k} cells; it needs ${n}, one per column.`, with `t` and `r` from 1;
         - `sections: ${id}: diagramItemId "${x}" isn't an item with a diagram. Use one of: ${ids}.`, or, when the project has no diagram item, `sections: ${id}: diagramItemId "${x}" isn't an item with a diagram, and this project has none. Leave diagramItemId out.`

         A section whose id isn't one of the ten is the schema's to report. The same line from two copies of a doubled section is listed once.
      4. `questions: question ${i} repeats question ${j}.` for a question whose text, trimmed and with each run of whitespace made one space, is an earlier one's (both from 1), read from the payload as sent. Practice keeps a rating by the question's text, so two would share one.
      5. **The checklist:** when `o.checklist` (the rules file's lines) has any, they're the defense's checklist and the payload's is ignored. Otherwise the payload's is used:
         - `checklist: the rules file has no checklist, so send one.` when it's empty;
         - `checklist: line ${i} repeats line ${j}.` for a repeated line, compared as the questions are.
    - **A diagram item** is an item of an enabled type whose `dataKindOf(type)` is `'diagram'`, whose thread isn't parked, and that has `data`. `defenseDiagramItemIds` lists them in id order.
    - **Then it builds the defense:**
      - `id: newId('w', now)` and `generatedAt`;
      - `basedOn: { kind: 'plan', doc, version, inputsHash }` from the request's `basedOn` and `inputsHash`, falling back to `defenseBasis` and `defenseInputsHash` now when the request has none;
      - the sections in `DEFENSE_SECTIONS` order, with their titles, `tables ?? []`, `diagram` (null when missing or blank) and `diagramItemId ?? null`;
      - questions `q1…`; concerns sorted by severity (critical first; concerns of the same severity keep the subagent's order), then `c1…`; checklist lines `k1…`, from the rules file's lines or the payload's;
      - no `exportedTo`.
    - It writes `defense.json`, then removes `request.json`.
  - **`finishWhiteboard`:** only when the request has this id, is `writing` and was picked up by this window. It becomes `failed`, with `failedAt` and `reason`: `error` (the subagent's own `Failed: …` line, which the window passes on through `dp_wait`, Task 9) trimmed and cut to 500 characters (499 and "…"), or `WHITEBOARD_GAVE_UP` without one. Anything else is left alone; a saved request is already gone.
  - **`requeueWhiteboard`:** a `writing` request whose window isn't alive goes back to `requested`, with `pickedUpAt`, `pickedUpBy`, `inputsHash` and `basedOn` cleared and `requeuedAt` set. It returns true when it did.
  - **`cancelWhiteboard`:** removes `request.json` whatever its state. `defense.json` is untouched.
  - **`defenseStale`:**
    - null while `defenseInputsHash(dir)` equals `defense.basedOn.inputsHash`;
    - "Out of date: a final was accepted since this was generated." when the defense is based on the draft and `defenseBasis` now gives the final;
    - otherwise "Out of date: the plan changed since this was generated.". That includes a defense of a final that stopped being current: the basis is now the draft, so the hash changed.
  - **`defenseStatus`:** `ready` when `readDefense` finds a defense; `stale` when it does and `defenseStale` isn't null; `state` is the request's state, or null when there's no request. It never throws: if `defenseStale` does (the document it reads is missing, say), it gives `{ ready: true, stale: false, state }`, so the project home always loads.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/whiteboard.test.ts` (Task 1's file), replace the imports and constants at the top of the file, from:
```ts
import fs from 'node:fs/promises';
```
down to and including:
```ts
const exists = (file: string) => fs.access(file).then(() => true, () => false);
```
with:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFENSE_TYPE } from '../src/defenseType';
import { itemSchema, type DefenseInput, type DiagramData, type Item, type Practice, type WhiteboardRequest } from '../src/schemas';
import { addDecision } from '../src/store/decisions';
import { projectFiles, readItem, readProjectFile, writeDocText, writeHistoryEntry, writeItem, writeProjectFile, writeThread } from '../src/store/io';
import { setReviewed } from '../src/store/reviewed';
import { setParked } from '../src/store/threads';
import {
  cancelWhiteboard,
  checklistLines,
  defenseBasis,
  defenseInputsHash,
  defenseStale,
  defenseStatus,
  finishWhiteboard,
  MAX_DEFENSE_CHARS,
  pickUpWhiteboard,
  readDefense,
  readPractice,
  readWhiteboardRequest,
  removeWhiteboardRequest,
  requestWhiteboard,
  requeueWhiteboard,
  saveDefense,
  writeDefense,
  writePractice,
  writeWhiteboardRequest,
} from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject, storedDefense, TYPES, validDefenseInput } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-06T09:00:00.000Z';
const exists = (file: string) => fs.access(file).then(() => true, () => false);
```
and add at the end of the file, after `describe('the whiteboard files', …)`:
```ts

const T0 = new Date('2026-10-06T09:00:00.000Z');
const T1 = new Date('2026-10-06T09:01:00.000Z');
const T2 = new Date('2026-10-06T09:02:00.000Z');
const T3 = new Date('2026-10-06T09:03:00.000Z');
/** When the tests' final was accepted, and a time after it. */
const FINAL_AT = '2026-10-06T08:00:00.000Z';
const AFTER_FINAL = '2026-10-06T10:00:00.000Z';
const types = [...TYPES, DEFENSE_TYPE];
const FINAL = '# Restock reminders\n\nThe accepted final.\n';
const SHIPPED_RULES = path.resolve(import.meta.dirname, '../../../defaults/outputs/whiteboard-defense.md');
const PLAN_CHANGED = 'Out of date: the plan changed since this was generated.';
const RETRY = 'Nothing was saved. Fix these and call dp_whiteboard again with the whole defense:';
const DIAGRAM: DiagramData = {
  kind: 'system',
  groups: [],
  nodes: [
    { id: 'job', label: 'Daily reminder job', status: 'new' },
    { id: 'db', label: 'Postgres', status: 'unchanged' },
  ],
  edges: [{ id: 'e1', from: 'job', to: 'db', label: 'finds due subscriptions' }],
};

/** A project with an architecture diagram, an open question and a low concern. */
async function seed(): Promise<string> {
  const diagram = pair('architecture-system', { type: 'architecture', title: 'System overview', status: 'resolved' });
  diagram.item.data = DIAGRAM;
  return seedProject({ pairs: [diagram, pair('q1', { title: 'Who gets reminders?' }), pair('c1', { type: 'concerns', title: 'Duplicate emails', fields: { severity: 'low' } })] });
}

/** Generate, as a window does: request, pick up, save. */
async function generate(dir: string, defense: unknown = validDefenseInput()) {
  const request = await requestWhiteboard(dir, { now: T0 });
  await pickUpWhiteboard(dir, 'w-a', T1);
  return saveDefense(dir, { requestId: request.id, defense, types, now: T2 });
}

/** validDefenseInput() with each section changed by `edit`. */
const withSections = (edit: (s: DefenseInput['sections'][number]) => DefenseInput['sections'][number]): DefenseInput => {
  const input = validDefenseInput();
  return { ...input, sections: input.sections.map(edit) };
};

/** The error a promise rejects with, as its class name and message, or null if it resolves. */
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: Error) => ({ type: e.constructor.name, message: e.message }));
const UNDER_WAY = { type: 'ConflictError', message: 'The Whiteboard Defense is already being written.' };

/** Puts a final in place, as Accept does, accepted at FINAL_AT. */
async function acceptFinal(dir: string): Promise<void> {
  await writeDocText(dir, 'docs/final.md', FINAL);
  const project = await readProjectFile(dir);
  const exportedTo = { clone: '/tmp/acme', path: 'docs/specs/restock.final.md', at: FINAL_AT, assets: [] };
  await writeProjectFile(dir, { ...project, status: 'finalized', docs: { ...project.docs, final: 'docs/final.md', exportedTo } });
}

const V = { hash: 'x', clone: '/tmp/acme', branch: 'main', commit: null };

describe('generating a Whiteboard Defense', () => {
  it('goes from requested to writing to saved, with its ids, its titles and its sections in order', async () => {
    const dir = await seed();
    const request = await requestWhiteboard(dir, { now: T0 });
    expect(request).toEqual({ id: expect.stringMatching(/^g-/), state: 'requested', requestedAt: T0.toISOString() });
    expect(await readWhiteboardRequest(dir)).toEqual(request);

    const inputs = await defenseInputsHash(dir);
    expect(inputs).toMatch(/^[0-9a-f]{64}$/);
    const writing = await pickUpWhiteboard(dir, 'w-a', T1);
    expect(writing).toEqual({ ...request, state: 'writing', pickedUpAt: T1.toISOString(), pickedUpBy: 'w-a', inputsHash: inputs, basedOn: { doc: 'draft', version: 1 } });
    expect(await pickUpWhiteboard(dir, 'w-b', T1)).toBeNull();

    // The subagent may send the sections in any order. Concerns come back most severe first.
    const input = validDefenseInput();
    const shuffled = { ...input, sections: [...input.sections].reverse(), concerns: [...input.concerns].reverse() };
    const saved = await saveDefense(dir, { requestId: request.id, defense: shuffled, types, now: T2 });
    expect(saved).toEqual(storedDefense({ id: expect.stringMatching(/^w-/), generatedAt: T2.toISOString(), basedOn: { kind: 'plan', doc: 'draft', version: 1, inputsHash: inputs } }));
    expect(await readDefense(dir)).toEqual(saved);
    expect(await readWhiteboardRequest(dir)).toBeNull();
    // The window reporting back once its subagent saved changes nothing.
    await finishWhiteboard(dir, { requestId: request.id, windowId: 'w-a', now: T3 });
    expect(await readWhiteboardRequest(dir)).toBeNull();
    expect(await defenseStale(dir, saved)).toBeNull();
  });

  it('is based on the final while it is current, at the current plan version', async () => {
    const dir = await seed();
    await acceptFinal(dir);
    // v2 changed the draft, but came in before the final was accepted.
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), versions: [{ ...V, n: 1, at: '2026-10-01T09:00:00.000Z' }, { ...V, n: 2, at: '2026-10-05T09:00:00.000Z', merge: { clean: 2, conflicts: 0 } }] });
    expect(await defenseBasis(dir)).toEqual({ doc: 'final', version: 2, text: FINAL });
    const saved = await generate(dir);
    expect(saved.basedOn).toEqual({ kind: 'plan', doc: 'final', version: 2, inputsHash: await defenseInputsHash(dir) });
    // It follows the final's text.
    await writeDocText(dir, 'docs/final.md', `${FINAL}\nAccepted again.\n`);
    expect(await defenseStale(dir, saved)).toBe(PLAN_CHANGED);
  });

  it('explains the draft once a change was applied after Accept, or a plan version that changed the draft came in', async () => {
    // A change applied since the final was accepted: a defense of that final is out of date, and the next explains the draft.
    const changed = await seed();
    await acceptFinal(changed);
    const ofFinal = await generate(changed);
    expect(ofFinal.basedOn.doc).toBe('final');
    const change = { at: AFTER_FINAL, threadId: 't-q1', kind: 'accept' as const, summary: 'Who gets reminders: everyone', change: {}, itemsBefore: {}, itemsAfter: {} };
    await writeHistoryEntry(changed, { ...change, id: 'c-before', appliedAt: '2026-10-06T07:00:00.000Z' });
    expect((await defenseBasis(changed)).doc).toBe('final');
    await writeHistoryEntry(changed, { ...change, id: 'c-after', appliedAt: AFTER_FINAL });
    expect(await defenseBasis(changed)).toEqual({ doc: 'draft', version: 1, text: DRAFT });
    expect(await defenseStale(changed, ofFinal)).toBe(PLAN_CHANGED);

    // A plan version that changed the draft came in after the final.
    const updated = await seed();
    await acceptFinal(updated);
    const versions = (merge: { clean: number; conflicts: number }) => [{ ...V, n: 1, at: '2026-10-01T09:00:00.000Z' }, { ...V, n: 2, at: AFTER_FINAL, merge }];
    await writeProjectFile(updated, { ...(await readProjectFile(updated)), versions: versions({ clean: 0, conflicts: 1 }) });
    expect(await defenseBasis(updated)).toEqual({ doc: 'draft', version: 2, text: DRAFT });
    // One that left the draft as it was doesn't count.
    await writeProjectFile(updated, { ...(await readProjectFile(updated)), versions: versions({ clean: 0, conflicts: 0 }) });
    expect(await defenseBasis(updated)).toEqual({ doc: 'final', version: 2, text: FINAL });
  });

  it("can't start while the plan is importing, or while one is being asked for or written, and replaces a failed one", async () => {
    const importing = await seedProject({ project: { status: 'importing' } });
    expect(await refusal(requestWhiteboard(importing))).toEqual({ type: 'ConflictError', message: "The plan is still importing. Generate the Whiteboard Defense once that's done." });
    expect(await readWhiteboardRequest(importing)).toBeNull();

    const dir = await seed();
    const first = await requestWhiteboard(dir);
    expect(await refusal(requestWhiteboard(dir))).toEqual(UNDER_WAY);
    await pickUpWhiteboard(dir, 'w-a');
    expect(await refusal(requestWhiteboard(dir))).toEqual(UNDER_WAY);
    await finishWhiteboard(dir, { requestId: first.id, windowId: 'w-a' });
    const second = await requestWhiteboard(dir);
    expect(second.id).not.toBe(first.id);
    expect(await readWhiteboardRequest(dir)).toEqual(second);
  });

  it('has nothing to pick up unless one is requested', async () => {
    const dir = await seed();
    expect(await pickUpWhiteboard(dir, 'w-a')).toBeNull();
    const request = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    await finishWhiteboard(dir, { requestId: request.id, windowId: 'w-a' });
    expect(await pickUpWhiteboard(dir, 'w-b')).toBeNull();
    expect(await readWhiteboardRequest(dir)).toMatchObject({ state: 'failed', pickedUpBy: 'w-a' });
  });

  it('waits while the plan is importing, and is picked up once that is done', async () => {
    const dir = await seed();
    const request = await requestWhiteboard(dir, { now: T0 });
    // An update's re-import started after Generate: the request isn't written from a half re-imported project.
    const project = await readProjectFile(dir);
    await writeProjectFile(dir, { ...project, status: 'importing' });
    expect(await pickUpWhiteboard(dir, 'w-a', T1)).toBeNull();
    expect(await readWhiteboardRequest(dir)).toEqual(request);
    await writeProjectFile(dir, project);
    expect(await pickUpWhiteboard(dir, 'w-a', T2)).toMatchObject({ id: request.id, state: 'writing', pickedUpAt: T2.toISOString(), pickedUpBy: 'w-a' });
  });

  it("won't save for another request, or for one that isn't being written", async () => {
    const dir = await seed();
    const request = await requestWhiteboard(dir);
    const save = (requestId: string) => refusal(saveDefense(dir, { requestId, defense: validDefenseInput(), types }));
    expect(await save(request.id)).toEqual({ type: 'ConflictError', message: `There's no Whiteboard Defense request ${request.id} waiting for a defense.` });
    await pickUpWhiteboard(dir, 'w-a');
    expect(await save('g-other')).toEqual({ type: 'ConflictError', message: "There's no Whiteboard Defense request g-other waiting for a defense." });
    expect(await readDefense(dir)).toBeNull();
    expect((await readWhiteboardRequest(dir))?.state).toBe('writing');
  });

  it("fails when the subagent returns without a defense, and only for that window's request", async () => {
    const dir = await seed();
    const request = await requestWhiteboard(dir, { now: T0 });
    const writing = await pickUpWhiteboard(dir, 'w-a', T1);
    await finishWhiteboard(dir, { requestId: request.id, windowId: 'w-b', now: T2 });
    await finishWhiteboard(dir, { requestId: 'g-other', windowId: 'w-a', now: T2 });
    expect(await readWhiteboardRequest(dir)).toEqual(writing);
    await finishWhiteboard(dir, { requestId: request.id, windowId: 'w-a', now: T2 });
    expect(await readWhiteboardRequest(dir)).toEqual({ ...writing, state: 'failed', failedAt: T2.toISOString(), reason: "The whiteboard subagent didn't send a Whiteboard Defense." });
    expect(await refusal(saveDefense(dir, { requestId: request.id, defense: validDefenseInput(), types }))).toEqual({
      type: 'ConflictError',
      message: `There's no Whiteboard Defense request ${request.id} waiting for a defense.`,
    });

    // When the window passes on the subagent's own Failed: line, that's the reason, cut to 500 characters.
    const again = await requestWhiteboard(dir, { now: T3 });
    await pickUpWhiteboard(dir, 'w-a', T3);
    await finishWhiteboard(dir, { requestId: again.id, windowId: 'w-a', error: `  Failed: ${'the pack was too big to read. '.repeat(30)}`, now: T3 });
    const reason = (await readWhiteboardRequest(dir))?.reason ?? '';
    expect(reason).toHaveLength(500);
    expect(reason).toMatch(/^Failed: the pack was too big to read\. .*…$/);
  });

  it('gives a request back when the window writing it went away', async () => {
    const dir = await seed();
    const request = await requestWhiteboard(dir, { now: T0 });
    await pickUpWhiteboard(dir, 'w-dead', T1);
    expect(await requeueWhiteboard(dir, (w) => w === 'w-live', T2)).toBe(true);
    expect(await readWhiteboardRequest(dir)).toEqual({ ...request, state: 'requested', requeuedAt: T2.toISOString() });
    expect(await pickUpWhiteboard(dir, 'w-live', T3)).toMatchObject({ id: request.id, state: 'writing', pickedUpBy: 'w-live', basedOn: { doc: 'draft', version: 1 } });
    expect(await requeueWhiteboard(dir, (w) => w === 'w-live')).toBe(false);
    // A failed request is finished work: it never goes back in the queue.
    await finishWhiteboard(dir, { requestId: request.id, windowId: 'w-live' });
    expect(await requeueWhiteboard(dir, () => false)).toBe(false);
    expect((await readWhiteboardRequest(dir))?.state).toBe('failed');
  });

  it('cancels a request in any state, and leaves the saved defense alone', async () => {
    const dir = await seed();
    await generate(dir);
    const before = await fs.readFile(projectFiles(dir).defense, 'utf8');
    await requestWhiteboard(dir);
    await cancelWhiteboard(dir);
    expect(await readWhiteboardRequest(dir)).toBeNull();
    const writing = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    await cancelWhiteboard(dir);
    expect(await readWhiteboardRequest(dir)).toBeNull();
    // The subagent that was writing it can't save it any more.
    expect(await refusal(saveDefense(dir, { requestId: writing.id, defense: validDefenseInput(), types }))).toMatchObject({ type: 'ConflictError' });
    const failed = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    await finishWhiteboard(dir, { requestId: failed.id, windowId: 'w-a' });
    await cancelWhiteboard(dir);
    expect(await readWhiteboardRequest(dir)).toBeNull();
    await expect(cancelWhiteboard(dir)).resolves.toBeUndefined();
    expect(await fs.readFile(projectFiles(dir).defense, 'utf8')).toBe(before);
  });
});

describe('checking the defense before it is saved', () => {
  it('a refused defense leaves the last one as it was', async () => {
    const dir = await seed();
    await generate(dir);
    const before = await fs.readFile(projectFiles(dir).defense, 'utf8');
    const request = await requestWhiteboard(dir);
    const writing = await pickUpWhiteboard(dir, 'w-a');
    const save = (defense: unknown) => refusal(saveDefense(dir, { requestId: request.id, defense, types }));

    // Every kind of problem at once: walkthrough missing and unknowns twice, a section with no claims, a ragged table,
    // an unknown diagram item and a basis the schema doesn't know.
    const input = validDefenseInput();
    const sections = [...input.sections.filter((s) => s.id !== 'walkthrough'), { id: 'unknowns', claims: [{ text: 'The send limit.', basis: 'unknown' }] }].map((s) => {
      if (s.id === 'diagram') return { ...s, diagramItemId: 'architecture-gone' };
      if (s.id === 'data') return { ...s, tables: [{ title: 'Source of truth', columns: ['State', 'Owner'], rows: [['Renewal date', 'Billing'], ['Reminders sent', 'The reminders table', 'Daily']] }] };
      if (s.id === 'security') return { ...s, claims: [s.claims[0], { text: 'Tokens expire after a week.', basis: 'maybe' }] };
      if (s.id === 'complexity') return { ...s, claims: [] };
      return s;
    });
    // A question asked twice would share one rating in Practice.
    const questions = [...input.questions, { ...input.questions[0], q: ' What stops a customer  getting two reminders? ' }];
    expect(await save({ ...input, sections, questions })).toEqual({
      type: 'InputError',
      message: [
        RETRY,
        "- sections.3.claims.1.basis: Invalid enum value. Expected 'known' | 'inferred' | 'unknown' | 'verify', received 'maybe'",
        '- sections: diagram: diagramItemId "architecture-gone" isn\'t an item with a diagram. Use one of: architecture-system.',
        '- sections: walkthrough is missing.',
        '- sections: data: table 1 row 2 has 3 cells; it needs 2, one per column.',
        "- sections: complexity needs at least one claim. Mark what isn't known as unknown.",
        '- sections: unknowns is there more than once.',
        '- questions: question 4 repeats question 1.',
      ].join('\n'),
    });
    expect(await fs.readFile(projectFiles(dir).defense, 'utf8')).toBe(before);
    expect(await readWhiteboardRequest(dir)).toEqual(writing);

    // One that's too big, on its own.
    const big = withSections((s) => (s.id === 'summary' || s.id === 'walkthrough' ? { ...s, claims: Array.from({ length: 40 }, () => ({ text: 'x'.repeat(4000), basis: 'known' as const })) } : s));
    const size = JSON.stringify(big).length;
    expect(size).toBeGreaterThan(MAX_DEFENSE_CHARS);
    expect(await save(big)).toEqual({ type: 'InputError', message: `${RETRY}\n- The defense is ${size.toLocaleString('en-US')} characters of JSON; the most is 120,000.` });
    expect(await fs.readFile(projectFiles(dir).defense, 'utf8')).toBe(before);
    expect(await readWhiteboardRequest(dir)).toEqual(writing);

    // The request is still there to send it again, whole.
    const saved = await saveDefense(dir, { requestId: request.id, defense: validDefenseInput(), types });
    expect(await readDefense(dir)).toEqual(saved);
    expect(await readWhiteboardRequest(dir)).toBeNull();
  });

  it("takes a diagram item of the project, and sorts concerns most severe first, keeping the subagent's order within a severity", async () => {
    const dir = await seed();
    const concern = (severity: DefenseInput['concerns'][number]['severity'], text: string) => ({ severity, text, basis: 'inferred' as const });
    const saved = await generate(dir, {
      ...withSections((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-system', diagram: 'job --> mailer --> customer' } : s)),
      concerns: [concern('low', 'Slow query'), concern('critical', 'No unsubscribe link'), concern('info', 'Copy not final'), concern('high', 'Double sends'), concern('low', 'Logs grow'), concern('medium', 'No retry')],
    });
    expect(saved.sections[1]).toEqual({
      id: 'diagram',
      title: 'Whiteboard diagram',
      claims: validDefenseInput().sections[1].claims,
      tables: [],
      diagram: 'job --> mailer --> customer',
      diagramItemId: 'architecture-system',
    });
    expect(saved.concerns.map((c) => `${c.id} ${c.severity}: ${c.text}`)).toEqual([
      'c1 critical: No unsubscribe link',
      'c2 high: Double sends',
      'c3 medium: No retry',
      'c4 low: Slow query',
      'c5 low: Logs grow',
      'c6 info: Copy not final',
    ]);
  });

  it("refuses a diagram item that's parked, has no drawing or doesn't draw a diagram", async () => {
    const parked = pair('architecture-old', { type: 'architecture', title: 'Old overview', status: 'parked' });
    parked.item.data = DIAGRAM;
    const dir = await seedProject({ pairs: [parked, pair('architecture-bare', { type: 'architecture', title: 'Not drawn yet' }), pair('q1')] });
    const request = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    const named = (id: string) => withSections((s) => (s.id === 'diagram' ? { ...s, diagramItemId: id } : s));
    for (const id of ['architecture-old', 'architecture-bare', 'q1']) {
      expect(await refusal(saveDefense(dir, { requestId: request.id, defense: named(id), types }))).toEqual({
        type: 'InputError',
        message: `${RETRY}\n- sections: diagram: diagramItemId "${id}" isn't an item with a diagram, and this project has none. Leave diagramItemId out.`,
      });
    }
  });
});

describe('a defense out of date', () => {
  /** A project with a defense just saved, still current. */
  async function current() {
    const dir = await seed();
    const defense = await generate(dir);
    expect(await defenseStale(dir, defense)).toBeNull();
    return { dir, defense };
  }

  it('only plan changes make the defense out of date', async () => {
    // Asking Claude about it, sending a part of it, review marks and practice leave it current.
    const { dir, defense } = await current();
    const asked = pair('defense-link-token', { type: 'defense', title: 'Does the unsubscribe link need a token?', status: 'resolved' });
    await writeItem(dir, { ...asked.item, createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'section', ref: 'security' } });
    await writeThread(dir, asked.thread);
    await addDecision(dir, { text: 'The unsubscribe link carries a signed token.', threadId: asked.thread.id, itemIds: [asked.item.id] });
    const sent = pair('questions-unsubscribe-link', { title: 'Whether the unsubscribe link needs a signed token.', status: 'with_claude' });
    await writeItem(dir, { ...sent.item, createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'claim', ref: 'security.1' } });
    await writeThread(dir, sent.thread);
    const q1 = await readItem(dir, 'q1');
    await writeItem(dir, { ...q1, flags: [{ reason: 'May need another look', fromThreadId: 't-c1', at: T3.toISOString() }] });
    await setReviewed(dir, 'c1', true);
    await writePractice(dir, { ratings: { [defense.questions[0].q]: { rating: 'could', at: T3.toISOString() } }, ticks: { [defense.checklist[0].text]: T3.toISOString() } });
    expect(await defenseStale(dir, defense)).toBeNull();
    // Answering a question sent from it is a decision about the plan, though.
    await addDecision(dir, { text: 'The link carries a signed token.', threadId: sent.thread.id, itemIds: [sent.item.id] });
    expect(await defenseStale(dir, defense)).toBe(PLAN_CHANGED);

    // Each of these, on its own, makes it out of date.
    const changes: Record<string, (dir: string) => Promise<unknown>> = {
      'a draft edit': (d) => writeDocText(d, 'docs/draft.md', `${DRAFT}\nRemind three days before.\n`),
      'a new decision on a plumbing thread': (d) => addDecision(d, { text: 'Everyone with an active subscription.', threadId: 't-q1', itemIds: ['q1'] }),
      "an item's summary": async (d) => writeItem(d, { ...(await readItem(d, 'q1')), summary: 'Only active subscribers.' }),
      'a parked thread': (d) => setParked(d, 't-c1', true),
      // An item Claude adds from a Defense thread is a plan item like any other.
      'a Questions item Claude added from a Defense thread': (d) =>
        writeItem(d, { ...pair('questions-sign-the-link', { title: 'Sign the unsubscribe link?', links: ['defense-link-token'] }).item, createdBy: 'claude' }),
    };
    for (const [change, make] of Object.entries(changes)) {
      const fresh = await current();
      await make(fresh.dir);
      expect(await defenseStale(fresh.dir, fresh.defense), change).toBe(PLAN_CHANGED);
    }

    // A final accepted after a defense of the draft says so.
    const accepted = await current();
    await acceptFinal(accepted.dir);
    expect(await defenseStale(accepted.dir, accepted.defense)).toBe('Out of date: a final was accepted since this was generated.');
  });

  it('says whether a defense is ready, out of date or being written, for the header and the navigation', async () => {
    const dir = await seed();
    expect(await defenseStatus(dir)).toEqual({ ready: false, stale: false, state: null });
    const request = await requestWhiteboard(dir);
    expect(await defenseStatus(dir)).toEqual({ ready: false, stale: false, state: 'requested' });
    await pickUpWhiteboard(dir, 'w-a');
    expect(await defenseStatus(dir)).toEqual({ ready: false, stale: false, state: 'writing' });
    await saveDefense(dir, { requestId: request.id, defense: validDefenseInput(), types });
    expect(await defenseStatus(dir)).toEqual({ ready: true, stale: false, state: null });
    await writeDocText(dir, 'docs/draft.md', `${DRAFT}\nRemind three days before.\n`);
    expect(await defenseStatus(dir)).toEqual({ ready: true, stale: true, state: null });
    // Regenerate: the defense stays while the next one is asked for.
    await requestWhiteboard(dir);
    expect(await defenseStatus(dir)).toEqual({ ready: true, stale: true, state: 'requested' });
  });
});

describe("the defense's checklist", () => {
  it("reads a rules file's checklist lines, in order, each once, at most 40 of 300 characters", async () => {
    const rules = '# Rules\n\n```text\n[ ] I can explain the purpose.\n  - [ ] I can draw the system flow.   \n* [ ] I can explain the purpose.\n[x] Done already.\nNot [ ] a line.\n```\n';
    expect(checklistLines(rules)).toEqual(['I can explain the purpose.', 'I can draw the system flow.']);
    const many = checklistLines(Array.from({ length: 45 }, (_, i) => `[ ] Line ${i + 1} ${'x'.repeat(400)}`).join('\n'));
    expect(many).toHaveLength(40);
    expect(many.every((line) => line.length === 300)).toBe(true);
    expect(many[39]).toMatch(/^Line 40 x/);
    expect(checklistLines('# Rules with no checklist\n')).toEqual([]);
    // The shipped rules file's 20 lines are the fixture's.
    expect(checklistLines(await fs.readFile(SHIPPED_RULES, 'utf8'))).toEqual(validDefenseInput().checklist);
  });

  it("saves the rules file's checklist, whatever the subagent sent, and needs the subagent's when the rules have none", async () => {
    const dir = await seed();
    const first = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    const fromRules = ['I can explain the purpose.', 'I understand the blast radius.'];
    const saved = await saveDefense(dir, { requestId: first.id, defense: { ...validDefenseInput(), checklist: [] }, types, checklist: fromRules });
    expect(saved.checklist).toEqual([
      { id: 'k1', text: 'I can explain the purpose.' },
      { id: 'k2', text: 'I understand the blast radius.' },
    ]);

    const second = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    const save = (checklist: string[]) => refusal(saveDefense(dir, { requestId: second.id, defense: { ...validDefenseInput(), checklist }, types, checklist: [] }));
    expect(await save([])).toEqual({ type: 'InputError', message: `${RETRY}\n- checklist: the rules file has no checklist, so send one.` });
    expect(await save(['I can explain the purpose.', 'I know the blast radius.', ' I can explain  the purpose. '])).toEqual({
      type: 'InputError',
      message: `${RETRY}\n- checklist: line 3 repeats line 1.`,
    });
    const own = await saveDefense(dir, { requestId: second.id, defense: { ...validDefenseInput(), checklist: ['I can explain the purpose.'] }, types });
    expect(own.checklist).toEqual([{ id: 'k1', text: 'I can explain the purpose.' }]);
  });
});
```

In `packages/core/test/projects.test.ts`, add at the end of the file:
```ts

describe('the project home for the Whiteboard Defense', () => {
  it("says there's no Whiteboard Defense yet, and whether one is being asked for", async () => {
    const dir = await seedProject();
    const defenseOf = async () => (await loadProjectHome({ repo: 'acme', id: 'restock', dir }, TYPES)).defense;
    expect(await defenseOf()).toEqual({ ready: false, stale: false, state: null });
    await writeJsonAtomic(path.join(dir, 'whiteboard', 'request.json'), { id: 'g-1', state: 'requested', requestedAt: '2026-10-06T09:00:00.000Z' });
    expect(await defenseOf()).toEqual({ ready: false, stale: false, state: 'requested' });
  });

  it("still loads when the defense's document can't be read, and counts the defense current", async () => {
    const dir = await seedProject();
    await writeJsonAtomic(path.join(dir, 'whiteboard', 'defense.json'), storedDefense());
    // A final recorded as accepted, whose file is gone.
    const project = await readProjectFile(dir);
    const exportedTo = { clone: '/tmp/acme', path: 'docs/specs/restock.final.md', at: '2026-10-06T08:00:00.000Z', assets: [] };
    await writeProjectFile(dir, { ...project, docs: { ...project.docs, final: 'docs/final.md', exportedTo } });
    expect((await loadProjectHome({ repo: 'acme', id: 'restock', dir }, TYPES)).defense).toEqual({ ready: true, stale: false, state: null });
  });
});
```
and replace:
```ts
import { listType, pair, seedProject, TYPES } from './fixtures';
```
with:
```ts
import { listType, pair, seedProject, storedDefense, TYPES } from './fixtures';
```
(`writeJsonAtomic`, `path`, `readProjectFile`, `writeProjectFile`, `seedProject`, `TYPES` and `loadProjectHome` are already imported there.)

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/whiteboard.test.ts packages/core/test/projects.test.ts`
Expected: FAIL.
- In `whiteboard.test.ts`, the 17 new tests fail with `TypeError: (0 , requestWhiteboard) is not a function` (and the same for `pickUpWhiteboard`, `defenseBasis`, `checklistLines` and `defenseStatus`): Task 1's file has only the reads and writes. Task 1's four tests still pass.
- In `projects.test.ts`, the two new tests fail: the home has no `defense`.

- [ ] **Step 3: Write the lifecycle**

The Finalize page's rule for a plan version that makes the final out of date moves into a helper, so the defense uses the same one. In `packages/core/src/store/update.ts`, replace:
```ts
export function changedDraft(v: PlanVersion): boolean {
  return v.merge !== undefined && (v.merge.clean > 0 || v.merge.conflicts > 0 || v.merge.fresh === true);
}
```
with:
```ts
export function changedDraft(v: PlanVersion): boolean {
  return v.merge !== undefined && (v.merge.clean > 0 || v.merge.conflicts > 0 || v.merge.fresh === true);
}

/**
 * The newest plan version that came in after the last final was accepted and changed the draft, or null. Such a version
 * makes that final out of date: the Finalize page says it came in, and the Whiteboard Defense explains the draft.
 */
export function planVersionSinceFinal(project: PlumbingProject): number | null {
  const finalAt = project.docs.exportedTo?.at;
  return finalAt ? (projectVersions(project).filter((v) => v.at > finalAt && changedDraft(v)).at(-1)?.n ?? null) : null;
}
```

Replace `packages/core/src/store/whiteboard.ts` with:
```ts
import fs from 'node:fs/promises';
import { writeJsonAtomic } from '../atomic';
import { DEFENSE } from '../defenseType';
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
import { ConflictError, newId, projectFiles, readDecisions, readDocText, readHistory, readItems, readJsonFile, readProjectFile, readThreads } from './io';
import { planVersionSinceFinal } from './update';
import { nothingSaved } from './validate';
import { currentVersion } from './versions';

// The Whiteboard Defense's files, in the project's whiteboard/ folder: request.json while a defense is asked for,
// defense.json once one is saved, and practice.json for your flashcard ratings and checklist ticks.
//
// One request at a time, as with Finalize: requested (Generate) -> writing (a listening window took it) -> saved (the
// whiteboard subagent sent a defense, and request.json is removed) or failed (it returned without one). The service
// calls these under the project's lock.

type Schema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false } };

/** A JSON file that matches its schema, or null when it's missing or damaged. */
async function readValid<T>(file: string, schema: Schema<T>): Promise<T | null> {
  const r = await readJsonFile(file);
  if (!r.ok) return null;
  const parsed = schema.safeParse(r.value);
  return parsed.success ? parsed.data : null;
}

/**
 * whiteboard/request.json, or null when missing or damaged. A damaged file reads as none: it only ever holds the one
 * request, so Generate can replace it.
 */
export async function readWhiteboardRequest(dir: string): Promise<WhiteboardRequest | null> {
  return readValid(projectFiles(dir).whiteboardRequest, whiteboardRequestSchema);
}

/** whiteboard/defense.json, or null when missing or damaged. */
export async function readDefense(dir: string): Promise<WhiteboardDefense | null> {
  return readValid(projectFiles(dir).defense, whiteboardDefenseSchema);
}

/** whiteboard/practice.json; empty ({ ratings: {}, ticks: {} }) when missing or damaged. */
export async function readPractice(dir: string): Promise<Practice> {
  return (await readValid(projectFiles(dir).practice, practiceSchema)) ?? { ratings: {}, ticks: {} };
}

export async function writeWhiteboardRequest(dir: string, r: WhiteboardRequest): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).whiteboardRequest, r);
}

export async function writeDefense(dir: string, d: WhiteboardDefense): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).defense, d);
}

export async function writePractice(dir: string, p: Practice): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).practice, p);
}

/** Removes request.json. Fine when there's none. */
export async function removeWhiteboardRequest(dir: string): Promise<void> {
  await fs.rm(projectFiles(dir).whiteboardRequest, { force: true });
}

export const WHITEBOARD_RETRY = 'call dp_whiteboard again with the whole defense';
export const WHITEBOARD_GAVE_UP = "The whiteboard subagent didn't send a Whiteboard Defense.";
/** Generate's refusals. The page's view repeats them as generateRefusal, so each is written once. */
export const WHITEBOARD_IMPORTING = "The plan is still importing. Generate the Whiteboard Defense once that's done.";
export const WHITEBOARD_UNDER_WAY = 'The Whiteboard Defense is already being written.';
export const MAX_DEFENSE_CHARS = 120_000;
/** A defense keeps at most this many checklist lines, each at most this long (defenseInputSchema's limits). */
const CHECKLIST_MAX = 40;
const LINE_MAX = 300;
/** A failed request's reason, when it's the subagent's own line, is cut to this many characters. */
const REASON_MAX = 500;

type DefenseBasis = { doc: 'final' | 'draft'; version: number; text: string };

/**
 * Whether the accepted final is still the plan: no change was applied since it was accepted, and no plan version that
 * changed the draft came in after it. The Finalize page says the same (changesSinceFinal, planVersionSinceFinal).
 */
async function finalIsCurrent(dir: string, project: PlumbingProject): Promise<boolean> {
  return changesSinceFinal(await readHistory(dir), project.docs.exportedTo?.at) === 0 && planVersionSinceFinal(project) === null;
}

/**
 * The document a defense explains, with the current plan version: the final while it's current (finalIsCurrent), else
 * the draft. A final the plan has moved on from isn't the plan any more.
 */
export async function defenseBasis(dir: string): Promise<DefenseBasis> {
  const project = await readProjectFile(dir);
  const version = currentVersion(project).n;
  if (project.docs.final && (await finalIsCurrent(dir, project))) return { doc: 'final', version, text: await readDocText(dir, project.docs.final) };
  return { doc: 'draft', version, text: await readDocText(dir, project.docs.draft) };
}

/**
 * The fingerprint of the plan a defense explains: the document it's based on (defenseBasis), every item, which items
 * are parked, and the active decisions. A saved defense keeps the one from when its request was picked up, so it's out
 * of date once any of them changed, or the basis moved from the draft to the final or back. Asking Claude about the
 * defense and sending a part of it to plumbing never make it out of date: Defense items, the items the whiteboard made
 * and the decisions made in Defense threads are left out, as are review marks (flags and the reviewed mark). An answer
 * to a sent question is a decision about the plan, so it counts, and so does an item Claude adds to the plan.
 */
export async function defenseInputsHash(dir: string): Promise<string> {
  return inputsHashFor(dir, await defenseBasis(dir));
}

async function inputsHashFor(dir: string, basis: DefenseBasis): Promise<string> {
  const [{ values }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const defenseThreads = new Set(values.filter((i) => i.type === DEFENSE).map((i) => i.threadId));
  const items = values
    .filter((i) => i.type !== DEFENSE && i.createdBy !== 'whiteboard')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ flags: _flags, reviewedAt: _reviewedAt, ...content }) => content);
  const statusByThread = new Map(threads.map((t) => [t.id, displayStatus(t)]));
  const parked = items.filter((i) => statusByThread.get(i.threadId) === 'parked').map((i) => i.id);
  const decisions = activeDecisions(await readDecisions(dir))
    .filter((d) => !defenseThreads.has(d.threadId))
    .map((d) => ({ text: d.text, threadId: d.threadId }));
  return draftHash(stable({ doc: basis.doc, document: basis.text, items, parked, decisions }));
}

/**
 * Generate (or Regenerate, or Try again). Refused while the plan is still importing, and while a request is waiting or
 * being written. A failed request is replaced. The saved defense, if any, stays until a new one is saved.
 */
export async function requestWhiteboard(dir: string, o: { now?: Date } = {}): Promise<WhiteboardRequest> {
  const now = o.now ?? new Date();
  if ((await readProjectFile(dir)).status === 'importing') throw new ConflictError(WHITEBOARD_IMPORTING);
  const current = await readWhiteboardRequest(dir);
  if (current?.state === 'requested' || current?.state === 'writing') throw new ConflictError(WHITEBOARD_UNDER_WAY);
  const request: WhiteboardRequest = { id: newId('g', now), state: 'requested', requestedAt: now.toISOString() };
  await writeWhiteboardRequest(dir, request);
  return request;
}

/**
 * A listening window takes the waiting request: requested -> writing. It records what the subagent will read: the
 * document (the final, else the draft), the plan version and defenseInputsHash. Null when there's nothing to take, and
 * while the plan is importing: a request made before a plan update waits out its re-import, so it's never written from
 * a half re-imported project.
 */
export async function pickUpWhiteboard(dir: string, windowId: string, now: Date = new Date()): Promise<WhiteboardRequest | null> {
  const current = await readWhiteboardRequest(dir);
  if (current?.state !== 'requested' || (await readProjectFile(dir)).status === 'importing') return null;
  const { doc, version } = await defenseBasis(dir);
  const next: WhiteboardRequest = {
    ...current,
    state: 'writing',
    pickedUpAt: now.toISOString(),
    pickedUpBy: windowId,
    inputsHash: await defenseInputsHash(dir),
    basedOn: { doc, version },
  };
  await writeWhiteboardRequest(dir, next);
  return next;
}

/**
 * The items a section's diagramItemId may name: items of enabled types that draw a diagram, not parked, with a
 * drawing. In id order. saveDefense checks against these, and the whiteboard subagent's pack offers exactly these.
 */
export async function defenseDiagramItemIds(dir: string, types: PlumbingType[]): Promise<string[]> {
  const [{ values: items }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const statusByThread = new Map(threads.map((t) => [t.id, displayStatus(t)]));
  const diagramTypes = new Set(types.filter((t) => t.enabled && dataKindOf(t) === 'diagram').map((t) => t.id));
  return items
    .filter((i) => diagramTypes.has(i.type) && statusByThread.get(i.threadId) !== 'parked' && i.data !== undefined)
    .map((i) => i.id)
    .sort((a, b) => a.localeCompare(b));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * What the schema can't say about the sections: each of the ten exactly once, each with a claim, every table row with
 * a cell per column, and diagramItemId naming a diagram item of this project. It reads the payload as sent, so these
 * are listed alongside the schema's own problems. Sections whose id isn't one of the ten are the schema's to report.
 */
function sectionProblems(defense: unknown, diagramIds: string[]): string[] {
  const sections = isObject(defense) && Array.isArray(defense.sections) ? defense.sections.filter(isObject) : [];
  const problems: string[] = [];
  for (const id of sectionIds) {
    const where = `sections: ${id}`;
    const found = sections.filter((s) => s.id === id);
    if (found.length === 0) problems.push(`${where} is missing.`);
    if (found.length > 1) problems.push(`${where} is there more than once.`);
    for (const s of found) {
      if (Array.isArray(s.claims) && s.claims.length === 0) problems.push(`${where} needs at least one claim. Mark what isn't known as unknown.`);
      (Array.isArray(s.tables) ? s.tables : []).forEach((table, t) => {
        if (!isObject(table) || !Array.isArray(table.columns) || !Array.isArray(table.rows)) return;
        const n = table.columns.length;
        table.rows.forEach((row, r) => {
          if (Array.isArray(row) && row.length !== n) problems.push(`${where}: table ${t + 1} row ${r + 1} has ${row.length} cells; it needs ${n}, one per column.`);
        });
      });
      if (typeof s.diagramItemId === 'string' && !diagramIds.includes(s.diagramItemId)) {
        problems.push(
          diagramIds.length
            ? `${where}: diagramItemId "${s.diagramItemId}" isn't an item with a diagram. Use one of: ${diagramIds.join(', ')}.`
            : `${where}: diagramItemId "${s.diagramItemId}" isn't an item with a diagram, and this project has none. Leave diagramItemId out.`,
        );
      }
    }
  }
  // A doubled section with the same problem in both copies says it once.
  return [...new Set(problems)];
}

const CHECKLIST_LINE = /^\s*(?:[-*]\s+)?\[ \]\s+(.+?)\s*$/;

/**
 * A rules file's checklist: its lines written `[ ] <text>` (or `- [ ] <text>`), in order, each once, at most 40, each
 * cut to 300 characters. The service passes them to saveDefense, so the defense's checklist is always the rules
 * file's, word for word, and the ticks Practice keeps by each line's text still match after a regenerate.
 */
export function checklistLines(rules: string): string[] {
  const lines: string[] = [];
  for (const line of rules.split(/\r?\n/)) {
    const m = CHECKLIST_LINE.exec(line);
    if (!m) continue;
    const text = m[1].slice(0, LINE_MAX);
    if (!lines.includes(text)) lines.push(text);
    if (lines.length === CHECKLIST_MAX) break;
  }
  return lines;
}

/**
 * `${where}: ${noun} ${i} repeats ${noun} ${j}.` (from 1) for each text that's an earlier one again, trimmed and with
 * each run of whitespace made one space. Read from the payload as sent, as the sections are. Practice keeps a rating or
 * a tick by its text, so two questions or lines with the same text would share one.
 */
function repeats(texts: unknown, where: string, noun: string): string[] {
  const seen = new Map<string, number>();
  const problems: string[] = [];
  (Array.isArray(texts) ? texts : []).forEach((text, i) => {
    if (typeof text !== 'string' || !text.trim()) return;
    const key = text.trim().replace(/\s+/g, ' ');
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i + 1);
    else problems.push(`${where}: ${noun} ${i + 1} repeats ${noun} ${first}.`);
  });
  return problems;
}

const severityRank = (s: DefenseInput['concerns'][number]) => severityValues.indexOf(s.severity);

/**
 * Saves the subagent's defense for a request that's writing: ConflictError for any other id or state. The whole
 * payload is checked first (the schema, then its size, then the sections, claims, tables and diagram items, then
 * repeated questions, then the checklist) and any problem refuses all of it, listing every problem: nothing is written,
 * the last saved defense stays as it was, and the request stays writing so the subagent can send it again. Otherwise
 * the defense gets its ids (q1…, c1…, k1…, w-…), the section titles and order, its concerns most severe first, and
 * basedOn from the request; defense.json is written, then request.json removed.
 *
 * `checklist` is the rules file's (checklistLines), which the service passes. When it has lines, they're the
 * defense's checklist and the payload's is ignored. Otherwise the payload's is used, and must have lines, each once.
 */
export async function saveDefense(
  dir: string,
  o: { requestId: string; defense: unknown; types: PlumbingType[]; checklist?: string[]; now?: Date },
): Promise<WhiteboardDefense> {
  const now = o.now ?? new Date();
  const current = await readWhiteboardRequest(dir);
  if (current?.id !== o.requestId || current.state !== 'writing') throw new ConflictError(`There's no Whiteboard Defense request ${o.requestId} waiting for a defense.`);
  const parsed = defenseInputSchema.safeParse(o.defense);
  const problems = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  const size = JSON.stringify(o.defense ?? null).length;
  if (size > MAX_DEFENSE_CHARS) problems.push(`The defense is ${size.toLocaleString('en-US')} characters of JSON; the most is 120,000.`);
  problems.push(...sectionProblems(o.defense, await defenseDiagramItemIds(dir, o.types)));
  const sent = isObject(o.defense) ? o.defense : {};
  problems.push(...repeats(Array.isArray(sent.questions) ? sent.questions.map((q) => (isObject(q) ? q.q : undefined)) : [], 'questions', 'question'));
  // The rules file's checklist, when it has one. Otherwise the subagent's, which it then must send.
  const fromRules = o.checklist?.length ? o.checklist : null;
  if (!fromRules) {
    if (Array.isArray(sent.checklist) && sent.checklist.length === 0) problems.push('checklist: the rules file has no checklist, so send one.');
    problems.push(...repeats(sent.checklist, 'checklist', 'line'));
  }
  if (problems.length || !parsed.success) throw nothingSaved(problems, WHITEBOARD_RETRY);
  const input = parsed.data;

  // What the subagent read, recorded when the window picked the request up. A request saved some other way is based on now.
  const basis = current.basedOn ?? (await defenseBasis(dir));
  const inputsHash = current.inputsHash ?? (await defenseInputsHash(dir));
  const sections = new Map(input.sections.map((s) => [s.id, s]));
  const defense: WhiteboardDefense = {
    id: newId('w', now),
    generatedAt: now.toISOString(),
    basedOn: { kind: 'plan', doc: basis.doc, version: basis.version, inputsHash },
    level: input.level,
    levelReasons: input.levelReasons,
    sections: DEFENSE_SECTIONS.map(({ id, title }) => {
      const s = sections.get(id)!;
      return { id, title, claims: s.claims, tables: s.tables ?? [], diagram: s.diagram?.trim() ? s.diagram : null, diagramItemId: s.diagramItemId ?? null };
    }),
    questions: input.questions.map((q, i) => ({ id: `q${i + 1}`, q: q.q, a: q.a, basis: q.basis })),
    // Most severe first; concerns of the same severity keep the subagent's order.
    concerns: [...input.concerns].sort((a, b) => severityRank(a) - severityRank(b)).map((c, i) => ({ id: `c${i + 1}`, severity: c.severity, text: c.text, basis: c.basis })),
    checklist: (fromRules ?? input.checklist).map((text, i) => ({ id: `k${i + 1}`, text })),
  };
  await writeDefense(dir, defense);
  await removeWhiteboardRequest(dir);
  return defense;
}

/**
 * The window reported back (dp_wait's finished.whiteboard). If its subagent never sent a defense, the request fails
 * with the reason, so the page offers Try again: the subagent's own `Failed: …` line when the window passes it on
 * (`error`, cut to 500 characters), else WHITEBOARD_GAVE_UP. Anything else (another window, another request, a request
 * already saved and gone) is left alone.
 */
export async function finishWhiteboard(dir: string, o: { requestId: string; windowId: string; error?: string; now?: Date }): Promise<void> {
  const current = await readWhiteboardRequest(dir);
  if (current?.id !== o.requestId || current.state !== 'writing' || current.pickedUpBy !== o.windowId) return;
  const error = o.error?.trim();
  const reason = !error ? WHITEBOARD_GAVE_UP : error.length <= REASON_MAX ? error : `${error.slice(0, REASON_MAX - 1)}…`;
  await writeWhiteboardRequest(dir, { ...current, state: 'failed', failedAt: (o.now ?? new Date()).toISOString(), reason });
}

/** A request being written by a window that went away goes back in the queue, for another window. True when it did. */
export async function requeueWhiteboard(dir: string, isAlive: (windowId: string) => boolean, now: Date = new Date()): Promise<boolean> {
  const current = await readWhiteboardRequest(dir);
  if (current?.state !== 'writing' || (current.pickedUpBy && isAlive(current.pickedUpBy))) return false;
  await writeWhiteboardRequest(dir, {
    ...current,
    state: 'requested',
    pickedUpAt: undefined,
    pickedUpBy: undefined,
    inputsHash: undefined,
    basedOn: undefined,
    requeuedAt: now.toISOString(),
  });
  return true;
}

/** Cancel: removes request.json, whatever its state. The saved defense is untouched. */
export async function cancelWhiteboard(dir: string): Promise<void> {
  await removeWhiteboardRequest(dir);
}

/**
 * The Out of date line for this defense, or null while the plan it explains is unchanged (defenseInputsHash). A defense
 * of the draft says so when it would now explain a final, because one was accepted since. A defense of a final whose
 * plan moved on would now explain the draft, so the plan changed.
 */
export async function defenseStale(dir: string, defense: WhiteboardDefense): Promise<string | null> {
  const basis = await defenseBasis(dir);
  if ((await inputsHashFor(dir, basis)) === defense.basedOn.inputsHash) return null;
  return defense.basedOn.doc === 'draft' && basis.doc === 'final'
    ? 'Out of date: a final was accepted since this was generated.'
    : 'Out of date: the plan changed since this was generated.';
}

/**
 * For the header and the navigation: whether there's a defense, whether it's out of date, and the request's state. It
 * never throws, so it can't break the project home: when the document can't be read, the defense counts as current.
 */
export async function defenseStatus(dir: string): Promise<ProjectHome['defense']> {
  const [defense, request] = await Promise.all([readDefense(dir), readWhiteboardRequest(dir)]);
  const state = request?.state ?? null;
  if (!defense) return { ready: false, stale: false, state };
  const stale = await defenseStale(dir, defense).then(
    (line) => line !== null,
    () => false,
  );
  return { ready: true, stale, state };
}
```

- [ ] **Step 4: Put the defense's status in the project home**

In `packages/core/src/schemas/views.ts` (as Task 1 left it), replace:
```ts
import type { DefenseRefKind, Rating, WhiteboardDefense, WhiteboardRequest } from './whiteboard';
```
with:
```ts
import type { DefenseRefKind, Rating, WhiteboardDefense, WhiteboardRequest, WhiteboardState } from './whiteboard';
```
and in `ProjectHome`, replace:
```ts
  finalize: { canStart: boolean; blockingCount: number; state: FinalizeState | null; changesSinceFinal: number; planVersionSinceFinal: number | null };
};
```
with:
```ts
  finalize: { canStart: boolean; blockingCount: number; state: FinalizeState | null; changesSinceFinal: number; planVersionSinceFinal: number | null };
  /**
   * For the header and the navigation's Whiteboard Defense: whether one is saved, whether it's out of date, and the
   * state of the request for a new one, or null when none is waiting, being written or failed.
   */
  defense: { ready: boolean; stale: boolean; state: WhiteboardState | null };
};
```

In `packages/core/src/store/projects.ts`, replace:
```ts
import { changedDraft } from './update';
import { currentVersion, projectVersions } from './versions';
```
with:
```ts
import { planVersionSinceFinal } from './update';
import { currentVersion, projectVersions } from './versions';
import { defenseStatus } from './whiteboard';
```
In `loadProjectHome`, the Finalize block uses the shared rule. Replace:
```ts
    planVersionSinceFinal: finalAt ? (projectVersions(project).filter((v) => v.at > finalAt && changedDraft(v)).at(-1)?.n ?? null) : null,
```
with:
```ts
    planVersionSinceFinal: planVersionSinceFinal(project),
```
and at the end of `loadProjectHome`, replace:
```ts
  return { summary, project, types: typeEntries, inbox, documents, version, finalize };
```
with:
```ts
  return { summary, project, types: typeEntries, inbox, documents, version, finalize, defense: await defenseStatus(ref.dir) };
```
The web's tests build `ProjectHome` objects with `as unknown as ProjectHome`, so the new field doesn't break them.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/core/test/whiteboard.test.ts packages/core/test/projects.test.ts`
Expected: PASS (21 and 29 tests).

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/store/whiteboard.ts packages/core/src/store/update.ts packages/core/src/schemas/views.ts packages/core/src/store/projects.ts packages/core/test/whiteboard.test.ts packages/core/test/projects.test.ts
git commit -m "feat(core): a Whiteboard Defense is requested, written by a window and saved whole, and knows when it's out of date" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The whiteboard subagent's pack, and the defense as Markdown

The whiteboard subagent gets everything it needs in one pack, `whiteboardPack`, which Task 7 serves through `dp_context { whiteboard: true }`. It has to stay small: an MCP tool result is capped (25,000 tokens by default), and a big plan's framework, document and items would pass that. So the framework and the document the defense explains (the final while it's current, else the draft) are files the subagent Reads, and each item comes with its own file, a body cut to 800 characters, and its drawing only when it's a diagram. The pack also has the decisions with their why, the defaults, every open item, the repo's conventions, sensitive data, schema and apps, the ten sections to fill, the diagrams it may name, and the last defense's questions and unknowns, so a regenerate can keep their wording. It reads the plan through the same module-private helper as `finalizePack`, so the two packs always agree on what's in it. The defense also gets one exact Markdown form, used by Export .md (Task 6, which also draws the diagram), a Defense item's body (Task 5) and the thread pack, whose new `defense` field gives a thread about the defense the whole of it. Every thread pack also gets `finalFile`, the final's path when there is one.

**Files:**
- Create:
  - `packages/core/src/store/defenseMarkdown.ts`
  - `packages/core/test/defenseMarkdown.test.ts`
  - `packages/core/test/whiteboardPack.test.ts`
- Modify:
  - `packages/core/src/store/context.ts` (imports; `ThreadPack.defense` and `finalFile`; `finalizePack`'s item and decision building moves into a module-private `planItems`, which the new `whiteboardPack` shares)
  - `packages/core/src/index.ts` (export `./store/defenseMarkdown`; `./store/context` is already exported)
- Test:
  - `packages/core/test/defenseMarkdown.test.ts`
  - `packages/core/test/whiteboardPack.test.ts`
  - `packages/core/test/finalizePack.test.ts` and `packages/core/test/context.test.ts` (unchanged: they must still pass)

**Interfaces:**
- Consumes:
  - From Task 1:
    - through `../schemas`: `WhiteboardDefense`, `Claim`, `Basis`, `DefenseTable`, `DefenseSectionId`, `DEFENSE_SECTIONS`, `DEFENSE_PARTS`, `LEVEL_NAMES`, `BASIS_LABELS` and `SEVERITY_LABELS`, and `Item.fromDefense`;
    - `readDefense` and `writeDefense` (`store/whiteboard.ts`); the defense lives at `<dir>/whiteboard/defense.json`;
    - `projectFiles(dir).item(id)` (`store/io.ts`), each item's own file;
    - in the tests, `storedDefense(overrides?)` from `core/test/fixtures.ts` (id `w-test`, all ten sections, `q1`–`q3`, `c1`–`c2`, `k1`–`k20`).
  - From Task 2: `DEFENSE` (`core/src/defenseType.ts`), and `context.ts` as Task 2 leaves it: it imports `DEFENSE` from `'../defenseType'`, and `finalizePack`'s item filter is `.filter((i) => statusOf(i) !== 'parked' && typeOf(i)?.enabled !== false && i.type !== PLAN_CHANGES && i.type !== DEFENSE)`, under a three-line comment. Step 6 replaces `finalizePack` whole and keeps that filter and its comment, word for word, in `planItems`.
  - From Task 3 (`store/whiteboard.ts`):
    - `defenseBasis(dir)`, giving `{ doc: 'final' | 'draft'; version: number; text: string }`: the final while it's current, else the draft;
    - `defenseDiagramItemIds(dir, types)`, the items a section's `diagramItemId` may name, as `saveDefense` checks them.
  - From Plans 1–5:
    - in `context.ts` already: `dataSummary`, `decisionDetail`, `finalizeChecklist`, `activeDecisions`, `availableTokens`, `finalName` and `PLAN_CHANGES`;
    - `dataKindOf` and `DataKind`;
    - in the tests: `seedProject`, `pair`, `listType`, `TYPES`, `addDecision`, `readProjectFile` and `writeProjectFile`.
- Produces, as in the header's Contracts (exported from `@dev-plumbing/core`):
  ```ts
  // store/context.ts
  export type WhiteboardPack = {
    project: { repo: string; id: string; title: string; sourcePath: string; name: string };
    rulesFile: string;                          // absolute: the rules file to Read
    basedOn: { doc: 'final' | 'draft'; version: number };
    documentFile: string;                       // absolute: docPath(dir, the final or the draft)
    items: (FinalizePack['items'][number] & { file: string; data: unknown })[];   // file: items/<id>.json; body cut to 800; data only for a diagram
    decisions: FinalizePack['decisions'];
    defaults: FinalizePack['defaults'];
    openItems: { itemId: string; title: string; typeTitle: string; status: DisplayStatus; blocking: boolean }[];
    conventions: string[];
    sensitiveData: string[];
    schema: { type: string; path: string } | null;
    apps: { name: string; path: string }[];
    sections: { id: DefenseSectionId; n: number; title: string }[];
    diagramItemIds: string[];
    previous: { questions: string[]; unknowns: string[] } | null;
  };
  export async function whiteboardPack(o: { dir: string; types: PlumbingType[]; profile?: RepoProfile; rulesFile: string }): Promise<WhiteboardPack>;
  // ThreadPack gains:
  defense: string | null;
  finalFile: string | null;

  // store/defenseMarkdown.ts
  export function defenseMarkdown(d: WhiteboardDefense, o: { title: string; itemTitles?: Record<string, string>; diagrams?: Record<string, string> }): string;
  export function defensePartMarkdown(d: WhiteboardDefense, kind: 'section' | 'question' | 'concern', ref: string, o?: { itemTitles?: Record<string, string> }): string | null;
  export function claimAt(d: WhiteboardDefense, ref: string): { section: WhiteboardDefense['sections'][number]; n: number; claim: Claim } | null;
  ```
  - **`itemTitles`** is optional, an addition to the Contracts' signatures. It maps item ids to titles, so a section's `diagramItemId` is named by its item's title in `Diagram: <item title> (in dev-plumbing).`. Without it, or for an id it doesn't have, the line shows the id.
  - Every caller in this plan that has the project's items passes them: `threadPack` here, `askAboutDefense` (Task 5) and `exportDefense` (Task 6).
  - **`diagrams`** is optional too: item id to that item's diagram as a fenced Mermaid block (`finalExport.ts`'s `diagramMermaid`). Only Export .md passes it (Task 6), so the exported file draws the diagram for a reader of the repo. `threadPack` and a Defense item's body name the item only.
- **Behaviour:**
  - **`whiteboardPack`** stays small: a 40-item plan with 5,000-character bodies and five diagrams gives under 60,000 characters of JSON.
    - `project` is built as `finalizePack`'s is, and `rulesFile` is passed through: the service picks the user's `outputs/whiteboard-defense.md` or the shipped default (Task 7).
    - `basedOn` comes from `defenseBasis`, and `documentFile` is `docPath(dir, …)` of the document it names: the final or the draft.
    - `items` are exactly `finalizePack`'s items: not parked, not of a disabled type, not Plan changes, not Defense, in plumbing-type order and then by title. Each one also has:
      - `file`, the absolute path of its `items/<id>.json`, which the subagent Reads for what's cut short;
      - `body` cut to 800 characters, followed by "… (clipped: Read file for the rest)" when it was longer;
      - `data`: the stored drawing (`item.data ?? null`) for an item of a `diagram` type, which `diagramItemId` may name; `null` for every other item. A table, a flow, a mockup or a phase has its `dataSummary`, and its file.
    - `decisions` and `defaults` are exactly `finalizePack`'s. A decision made in a Defense thread is about a Defense item, so it's left out with that item.
    - `openItems` is every listed item that isn't resolved (parked ones aren't listed), with its `status` and `blocking` (on the Finalize checklist's blocking list). Unlike Finalize's, it keeps blocking and with-Claude items: those are the plan's biggest unknowns.
    - `conventions`, `sensitiveData`, `schema` and `apps` (`{ name, path }`) come from the profile, and are `[]`, `[]`, `null` and `[]` without one.
    - `sections` is `DEFENSE_SECTIONS`, as `{ id, n, title }`.
    - `diagramItemIds` is Task 3's `defenseDiagramItemIds(dir, types)`: the items of an enabled diagram type, not parked, with `data`, in id order. So the pack offers exactly what `saveDefense` accepts.
    - `previous` is from the saved defense, or null with none: its question texts, and the texts of its claims marked `unknown` or `verify`, in section order. The agent keeps their wording where they still apply (Task 9), so Practice keeps the ratings and Send knows what was sent, both by text.
  - **`planItems`** (module-private) reads the items, threads, checklist and decisions once. It returns:
    - the items as stored;
    - the same items as the packs list them;
    - their decisions, the defaults and the open items;
    - the ids of the blocking items.

    `finalizePack`'s output stays exactly as it was. Only where the work is done moves.
  - **`threadPack.defense`:**
    - For an item with `fromDefense` (an asked Defense item, or one sent to Questions or Concerns) when a defense is saved, it's `defenseMarkdown(defense, { title: project.title, itemTitles })`.
    - Otherwise it's `null`.
    - It doesn't compare `fromDefense.id`: the thread gets the defense as it is now.
  - **`threadPack.finalFile`** is `docPath(dir, project.docs.final)` when the project has a final, else `null`, so a thread about a defense of the final can Read it.
  - **`defenseMarkdown`** follows the Contracts' format exactly:
    - `# Whiteboard Defense: <title>`, then `Level <n> (<level name>). Generated <YYYY-MM-DD of generatedAt> from the <doc> (v<version>).`, then the level reasons as a list.
    - The sections come in the order 1–9, 10 (questions), 11 (concerns), 12 (Unknowns), 13 (checklist), each headed `## <n>. <title>`.
    - **A prose section:**
      - its claims, each `- <text> *(<basis label>)*`;
      - then `Diagram: <item title> (in dev-plumbing).` when it has a `diagramItemId`, and under it the item's Mermaid block when `diagrams` has it;
      - then each table: `**<title>**`, a blank line, the header row, a `| --- |` row and the rows;
      - then its text diagram in a `text` fence.
    - **Questions:** `**<q>**`, a blank line, then `<a> *(<basis label>)*`.
    - **Concerns:** `- **<severity label>:** <text> *(<basis label>)*`.
    - **The checklist:** `- [ ] <line>`.
    - **Spacing:** blocks are separated by one blank line, and the document ends with one newline.
    - **Empty parts:** a part with nothing in it (no concerns, for example) says `None.`.
    - **Tables:** in cells and columns, `|` becomes `\|` and a newline becomes a space.
    - **Two details the format leaves open:**
      - a list item that runs over several lines indents its later lines by two spaces, so it stays one item;
      - a diagram is fenced with more backticks than any run inside it, and at least three.
  - **`defensePartMarkdown`** gives the part's block from the whole document, with its heading and no trailing newline:
    - a section, by id;
    - a question (`q<n>`), under `## 10. Questions the engineer should be able to answer`;
    - a concern (`c<n>`), under `## 11. Release concerns`.

    It's `null` when the defense has no such part.
  - **`claimAt`:**
    - `ref` is `<section id>.<index>`, with the index counted from 0 and written without a leading zero.
    - It returns the section, its number among the 13 (`DEFENSE_SECTIONS`' `n`) and the claim.
    - It's `null` for a malformed ref, an unknown section or an index past the end.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/defenseMarkdown.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFENSE_SECTIONS, type Basis, type DefenseSectionId } from '../src/schemas';
import { claimAt, defenseMarkdown, defensePartMarkdown } from '../src/store/defenseMarkdown';
import { storedDefense } from './fixtures';

const CLAIMS: Record<DefenseSectionId, [string, Basis]> = {
  summary: ['A daily job reminds customers before an item runs out.', 'known'],
  diagram: ['The job reads subscriptions and sends email.', 'inferred'],
  walkthrough: ['The job runs at 9am and finds subscriptions due in 3 days.', 'known'],
  data: ['Each reminder sent is logged once.', 'known'],
  security: ['Who can turn reminders off?', 'unknown'],
  failure: ['A rerun on the same day sends nothing twice.', 'verify'],
  tradeoffs: ['A daily job is simpler than a queue.', 'inferred'],
  complexity: ['One job and one table.', 'known'],
  readiness: ['Sends are logged with the job run id.', 'verify'],
  unknowns: ['How many reminders go out on the first day.', 'unknown'],
};

/** A small defense: one claim per section, a table, a text diagram, a diagram item, one question, one concern, two checklist lines. */
const small = () =>
  storedDefense({
    generatedAt: '2026-10-06T09:30:00.000Z',
    basedOn: { kind: 'plan', doc: 'draft', version: 2, inputsHash: 'h' },
    level: 3,
    levelReasons: ['It sends email to customers.', 'It stores who was reminded.'],
    sections: DEFENSE_SECTIONS.map((s) => ({
      id: s.id,
      title: s.title,
      claims: [{ text: CLAIMS[s.id][0], basis: CLAIMS[s.id][1] }],
      tables: s.id === 'data' ? [{ title: 'Source of truth', columns: ['Data', 'Owner'], rows: [['Reminder', 'reminders table']] }] : [],
      diagram: s.id === 'diagram' ? 'job --> email' : null,
      diagramItemId: s.id === 'diagram' ? 'architecture-system' : null,
    })),
    questions: [{ id: 'q1', q: 'What if the job runs twice?', a: 'It checks sentAt first, so nobody gets two.', basis: 'inferred' }],
    concerns: [{ id: 'c1', severity: 'high', text: 'A rerun could send duplicates.', basis: 'verify' }],
    checklist: [
      { id: 'k1', text: 'I can explain the purpose.' },
      { id: 'k2', text: 'I can draw the system flow.' },
    ],
  });

const EXPECTED = `# Whiteboard Defense: Restock reminders

Level 3 (High risk). Generated 2026-10-06 from the draft (v2).

- It sends email to customers.
- It stores who was reminded.

## 1. Executive summary

- A daily job reminds customers before an item runs out. *(Known)*

## 2. Whiteboard diagram

- The job reads subscriptions and sends email. *(Inferred)*

Diagram: System view (in dev-plumbing).

\`\`\`text
job --> email
\`\`\`

## 3. System walkthrough

- The job runs at 9am and finds subscriptions due in 3 days. *(Known)*

## 4. Data and state

- Each reminder sent is logged once. *(Known)*

**Source of truth**

| Data | Owner |
| --- | --- |
| Reminder | reminders table |

## 5. Security model

- Who can turn reminders off? *(Unknown)*

## 6. Failure analysis

- A rerun on the same day sends nothing twice. *(Verify before release)*

## 7. Dependencies and tradeoffs

- A daily job is simpler than a queue. *(Inferred)*

## 8. Complexity review

- One job and one table. *(Known)*

## 9. Production readiness

- Sends are logged with the job run id. *(Verify before release)*

## 10. Questions the engineer should be able to answer

**What if the job runs twice?**

It checks sentAt first, so nobody gets two. *(Inferred)*

## 11. Release concerns

- **High:** A rerun could send duplicates. *(Verify before release)*

## 12. Unknowns

- How many reminders go out on the first day. *(Unknown)*

## 13. Checklist

- [ ] I can explain the purpose.
- [ ] I can draw the system flow.
`;

describe('the Whiteboard Defense as Markdown', () => {
  it('writes the whole defense in the 13 sections, in order', () => {
    expect(defenseMarkdown(small(), { title: 'Restock reminders', itemTitles: { 'architecture-system': 'System view' } })).toBe(EXPECTED);
  });

  it("names a diagram item by its id when its title isn't given", () => {
    expect(defenseMarkdown(small(), { title: 'Restock reminders' })).toContain('Diagram: architecture-system (in dev-plumbing).');
  });

  it("draws a section's diagram item as Mermaid under its line, when it's given", () => {
    const mermaid = '```mermaid\nflowchart LR\n  n_job["Reminder job"]\n```';
    const markdown = defenseMarkdown(small(), { title: 'Restock reminders', itemTitles: { 'architecture-system': 'System view' }, diagrams: { 'architecture-system': mermaid } });
    expect(markdown).toContain(`Diagram: System view (in dev-plumbing).\n\n${mermaid}\n\n\`\`\`text\njob --> email\n\`\`\``);
    // A part's Markdown, for a Defense item's body, only names it.
    expect(defensePartMarkdown(small(), 'section', 'diagram')).not.toContain('mermaid');
  });

  it('escapes a | in a table, and keeps each row on one line', () => {
    const d = small();
    const tables = [{ title: 'Who sends', columns: ['Path | route', 'Note'], rows: [['/jobs | /cron', 'two\nlines']] }];
    const markdown = defenseMarkdown({ ...d, sections: d.sections.map((s) => (s.id === 'data' ? { ...s, tables } : s)) }, { title: 'Restock reminders' });
    expect(markdown).toContain('**Who sends**\n\n| Path \\| route | Note |\n| --- | --- |\n| /jobs \\| /cron | two lines |\n');
  });

  it('says None. when there are no release concerns', () => {
    const markdown = defenseMarkdown(storedDefense({ concerns: [] }), { title: 'Restock reminders' });
    expect(markdown).toContain('## 11. Release concerns\n\nNone.\n\n## 12. Unknowns');
  });

  it('keeps a statement over several lines in one list item, and a diagram with backticks in its fence', () => {
    const d = small();
    const sections = d.sections.map((s) =>
      s.id === 'summary' ? { ...s, claims: [{ text: 'First line.\nSecond line.', basis: 'known' as const }] } : s.id === 'diagram' ? { ...s, diagram: 'a ```b``` c' } : s,
    );
    const markdown = defenseMarkdown({ ...d, sections }, { title: 'Restock reminders' });
    expect(markdown).toContain('- First line.\n  Second line. *(Known)*');
    expect(markdown).toContain('````text\na ```b``` c\n````');
  });
});

describe('one part of the defense as Markdown', () => {
  it('gives a section, a question or a concern as its block, with its heading', () => {
    const d = small();
    expect(defensePartMarkdown(d, 'section', 'security')).toBe('## 5. Security model\n\n- Who can turn reminders off? *(Unknown)*');
    expect(defensePartMarkdown(d, 'section', 'diagram', { itemTitles: { 'architecture-system': 'System view' } })).toBe(
      '## 2. Whiteboard diagram\n\n- The job reads subscriptions and sends email. *(Inferred)*\n\nDiagram: System view (in dev-plumbing).\n\n```text\njob --> email\n```',
    );
    expect(defensePartMarkdown(d, 'question', 'q1')).toBe(
      '## 10. Questions the engineer should be able to answer\n\n**What if the job runs twice?**\n\nIt checks sentAt first, so nobody gets two. *(Inferred)*',
    );
    expect(defensePartMarkdown(d, 'concern', 'c1')).toBe('## 11. Release concerns\n\n- **High:** A rerun could send duplicates. *(Verify before release)*');
  });

  it("is null for a part the defense doesn't have", () => {
    const d = small();
    expect(defensePartMarkdown(d, 'section', 'nope')).toBeNull();
    expect(defensePartMarkdown(d, 'question', 'q2')).toBeNull();
    expect(defensePartMarkdown(d, 'concern', 'c9')).toBeNull();
  });

  it('finds a claim by its section and index', () => {
    const d = small();
    expect(claimAt(d, 'security.0')).toEqual({ section: d.sections[4], n: 5, claim: { text: 'Who can turn reminders off?', basis: 'unknown' } });
    expect(claimAt(d, 'unknowns.0')?.n).toBe(12);
    for (const bad of ['security.1', 'security.01', 'security.-1', 'security', 'nope.0', '.0', '']) expect(claimAt(d, bad), bad).toBeNull();
  });
});
```

`packages/core/test/whiteboardPack.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFENSE } from '../src/defenseType';
import { PLAN_CHANGES } from '../src/planChanges';
import { DEFENSE_SECTIONS, repoProfileSchema, type Item, type PlumbingType, type Thread } from '../src/schemas';
import { threadPack, whiteboardPack } from '../src/store/context';
import { addDecision } from '../src/store/decisions';
import { defenseMarkdown } from '../src/store/defenseMarkdown';
import { readProjectFile, writeProjectFile } from '../src/store/io';
import { writeDefense } from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, pair, seedProject, storedDefense, TYPES } from './fixtures';

afterAll(removeTempDirs);

const types: PlumbingType[] = [
  ...TYPES,
  listType('database', { title: 'Database', screen: 'database', order: 2 }),
  listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 }),
  listType('flows', { title: 'Flows', screen: 'flows', order: 4 }),
  listType('ideas', { title: 'Ideas', order: 7, enabled: false }),
];
const profile = repoProfileSchema.parse({
  name: 'acme',
  match: ['github.com/acme/acme'],
  conventions: ['Ids use uuid()'],
  sensitiveData: ['PII', 'payments'],
  schema: { type: 'prisma', path: 'prisma/schema.prisma' },
  apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/src/kit.tsx'] }],
});
/** The rules file the service picked, which the subagent Reads. */
const RULES_FILE = '/Users/you/.dev-plumbing/outputs/whiteboard-defense.md';
const DIAGRAM = { kind: 'system', groups: [], nodes: [{ id: 'job', label: 'Reminder job', status: 'new' }], edges: [] };
const TABLE = { model: 'RestockReminder', change: 'new', fields: [{ name: 'sentAt', type: 'DateTime', change: 'added' }] };
const FLOW = { kind: 'user', steps: [{ n: 1, label: 'Opens the reminder' }] };
const MOCKUP = { location: { app: 'web', route: '/account', files: [] }, kit: 'web', after: '<div>Soon</div>' };

/** An item with drawing data and its thread. */
const drawn = (id: string, o: Parameters<typeof pair>[1] & { data: unknown }) => {
  const p = pair(id, o);
  return { item: { ...p.item, data: o.data }, thread: p.thread };
};
const itemFile = (dir: string, id: string) => path.join(dir, 'items', `${id}.json`);

/**
 * One item of each drawn kind, a diagram item with no drawing yet, plain questions (one blocking, one with a default),
 * and the items the whiteboard leaves out: a parked one, one of a disabled type, a Plan changes item and a Defense item.
 * A decision on a question, and one made in the Defense thread.
 */
async function seed(): Promise<string> {
  const pairs: { item: Item; thread: Thread }[] = [
    drawn('architecture-system', { type: 'architecture', title: 'System view', status: 'idle', data: DIAGRAM }),
    pair('architecture-later', { type: 'architecture', title: 'Later view', status: 'idle' }),
    drawn('database-reminder', { type: 'database', title: 'Restock reminder table', status: 'resolved', data: TABLE }),
    drawn('ui-card', { type: 'ui', title: 'Restock card', status: 'resolved', data: MOCKUP }),
    drawn('flows-reorder', { type: 'flows', title: 'Reorder from a reminder', status: 'resolved', data: FLOW }),
    pair('q-channel', { title: 'Reminder channel', status: 'resolved' }),
    pair('q-who', { title: 'Who gets reminders?', fields: { default: 'Everyone active' } }),
    pair('q-launch', { title: 'Launch date?', fields: { blocking: 'true' } }),
    drawn('architecture-old', { type: 'architecture', title: 'Old view', status: 'parked', data: DIAGRAM }),
    pair('ideas-push', { type: 'ideas', title: 'Push reminders' }),
    pair('plan-changes-v2-1', { type: PLAN_CHANGES, title: 'Data' }),
    pair('defense-why-a-job', { type: DEFENSE, title: 'Why a daily job?', status: 'resolved' }),
  ];
  const dir = await seedProject({ pairs });
  await addDecision(dir, { text: 'Reminder channel: Email', threadId: 't-q-channel', itemIds: ['q-channel'] });
  await addDecision(dir, { text: 'A daily job is enough', threadId: 't-defense-why-a-job', itemIds: ['defense-why-a-job'] });
  return dir;
}

describe("the whiteboard subagent's context pack", () => {
  it('gives the subagent the files to read, the profile and the sections to fill', async () => {
    const dir = await seed();
    const pack = await whiteboardPack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.project).toEqual({ repo: 'acme', id: 'restock', title: 'Restock reminders', sourcePath: 'docs/specs/restock.md', name: 'restock' });
    expect(pack.rulesFile).toBe(RULES_FILE);
    expect(pack.basedOn).toEqual({ doc: 'draft', version: 1 });
    expect(pack.documentFile).toBe(path.join(dir, 'docs', 'draft.md'));
    expect(pack.conventions).toEqual(['Ids use uuid()']);
    expect(pack.sensitiveData).toEqual(['PII', 'payments']);
    expect(pack.schema).toEqual({ type: 'prisma', path: 'prisma/schema.prisma' });
    expect(pack.apps).toEqual([{ name: 'web', path: 'apps/web' }]);
    expect(pack.sections).toEqual(DEFENSE_SECTIONS);
    expect(pack.previous).toBeNull();
  });

  it('explains the final while it is current', async () => {
    const dir = await seed();
    const project = await readProjectFile(dir);
    await writeProjectFile(dir, { ...project, docs: { ...project.docs, final: 'docs/final.md' } });
    await fs.writeFile(path.join(dir, 'docs', 'final.md'), '# Restock reminders\n\nThe final.\n');
    const pack = await whiteboardPack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.basedOn).toEqual({ doc: 'final', version: 1 });
    expect(pack.documentFile).toBe(path.join(dir, 'docs', 'final.md'));
  });

  it("lists the final's items with their files, draws only diagrams, and lists every open item", async () => {
    const dir = await seed();
    const pack = await whiteboardPack({ dir, types, profile, rulesFile: RULES_FILE });
    // Parked, disabled, Plan changes and Defense items aren't part of the plan the defense explains.
    expect(pack.items.map((i) => [i.id, i.data])).toEqual([
      ['architecture-later', null],
      ['architecture-system', DIAGRAM],
      // A table, a mockup or a flow is summarised: the subagent Reads the item's file for the rest.
      ['database-reminder', null],
      ['ui-card', null],
      ['flows-reorder', null],
      ['q-launch', null],
      ['q-channel', null],
      ['q-who', null],
    ]);
    expect(pack.items[1]).toMatchObject({ typeTitle: 'Architecture', status: 'idle', dataSummary: 'System diagram: 1 box', file: itemFile(dir, 'architecture-system') });
    expect(pack.items[2].file).toBe(itemFile(dir, 'database-reminder'));
    expect(JSON.parse(await fs.readFile(pack.items[2].file, 'utf8')).data).toEqual(TABLE);
    expect(pack.diagramItemIds).toEqual(['architecture-system']);
    // The Defense thread's decision is about the defense, not the plan.
    expect(pack.decisions.map((d) => d.text)).toEqual(['Reminder channel: Email']);
    expect(pack.defaults).toEqual([{ itemId: 'q-who', title: 'Who gets reminders?', defaultValue: 'Everyone active' }]);
    // Everything not resolved or parked, blocking or not.
    expect(pack.openItems).toEqual([
      { itemId: 'architecture-later', title: 'Later view', typeTitle: 'Architecture', status: 'idle', blocking: false },
      { itemId: 'architecture-system', title: 'System view', typeTitle: 'Architecture', status: 'idle', blocking: false },
      { itemId: 'q-launch', title: 'Launch date?', typeTitle: 'Questions', status: 'your_turn', blocking: true },
      { itemId: 'q-who', title: 'Who gets reminders?', typeTitle: 'Questions', status: 'your_turn', blocking: false },
    ]);
  });

  it("carries the last defense's questions and unknowns, so a regenerate can keep their wording", async () => {
    const dir = await seed();
    await writeDefense(dir, storedDefense());
    expect((await whiteboardPack({ dir, types, profile, rulesFile: RULES_FILE })).previous).toEqual({
      questions: ['What stops a customer getting two reminders?', 'Where does the renewal date come from?', 'What happens when the mailer is down?'],
      unknowns: [
        'Whether the unsubscribe link needs a signed token.',
        'If the job runs twice in a day, the log stops a second email.',
        'Nothing alerts anyone when the job fails to run.',
        'How many emails a day the mail provider allows.',
      ],
    });
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
    const dir = await seedProject({ pairs });
    const pack = await whiteboardPack({ dir, types, profile, rulesFile: RULES_FILE });
    expect(pack.items).toHaveLength(40);
    for (const item of pack.items) {
      expect(item.body).toHaveLength(800 + '… (clipped: Read file for the rest)'.length);
      expect(item.body).toMatch(/… \(clipped: Read file for the rest\)$/);
    }
    expect(pack.items.filter((i) => i.data !== null)).toHaveLength(5);
    expect(JSON.stringify(pack).length).toBeLessThan(60_000);
  });

  it('works with no profile', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Who gets reminders?' })] });
    const pack = await whiteboardPack({ dir, types, rulesFile: RULES_FILE });
    expect(pack.conventions).toEqual([]);
    expect(pack.sensitiveData).toEqual([]);
    expect(pack.schema).toBeNull();
    expect(pack.apps).toEqual([]);
    expect(pack.diagramItemIds).toEqual([]);
  });
});

describe("a thread pack's defense", () => {
  it('gives a thread about the Whiteboard Defense the whole defense, and other threads none', async () => {
    const defense = storedDefense();
    const asked = pair('defense-why-a-job', { type: DEFENSE, title: 'Why a daily job?' });
    const sent = pair('questions-who-can-turn-reminders-off', { title: 'Who can turn reminders off?' });
    const dir = await seedProject({
      pairs: [
        { ...asked, item: { ...asked.item, createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'section', ref: 'walkthrough' } } },
        { ...sent, item: { ...sent.item, createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'claim', ref: 'security.1' } } },
        pair('q-who', { title: 'Who gets reminders?' }),
      ],
    });
    await writeDefense(dir, defense);
    const markdown = defenseMarkdown(defense, { title: 'Restock reminders' });
    expect((await threadPack({ dir, threadId: 't-defense-why-a-job', types, profile })).defense).toBe(markdown);
    expect((await threadPack({ dir, threadId: 't-questions-who-can-turn-reminders-off', types, profile })).defense).toBe(markdown);
    expect((await threadPack({ dir, threadId: 't-q-who', types, profile })).defense).toBeNull();

    // With the defense gone, there's nothing to give.
    await fs.rm(path.join(dir, 'whiteboard', 'defense.json'));
    expect((await threadPack({ dir, threadId: 't-defense-why-a-job', types, profile })).defense).toBeNull();
  });

  it("gives every thread the final's path once there is one", async () => {
    const dir = await seedProject({ pairs: [pair('q-who', { title: 'Who gets reminders?' })] });
    expect((await threadPack({ dir, threadId: 't-q-who', types })).finalFile).toBeNull();
    const project = await readProjectFile(dir);
    await writeProjectFile(dir, { ...project, docs: { ...project.docs, final: 'docs/final.md' } });
    expect((await threadPack({ dir, threadId: 't-q-who', types })).finalFile).toBe(path.join(dir, 'docs', 'final.md'));
  });

  it("names a section's diagram item by its title", async () => {
    const base = storedDefense();
    const defense = storedDefense({ sections: base.sections.map((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-system' } : s)) });
    const asked = pair('defense-the-diagram', { type: DEFENSE, title: 'The diagram?' });
    const dir = await seedProject({
      pairs: [
        drawn('architecture-system', { type: 'architecture', title: 'System view', data: DIAGRAM }),
        { ...asked, item: { ...asked.item, createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'section', ref: 'diagram' } } },
      ],
    });
    await writeDefense(dir, defense);
    expect((await threadPack({ dir, threadId: 't-defense-the-diagram', types })).defense).toContain('Diagram: System view (in dev-plumbing).');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/defenseMarkdown.test.ts packages/core/test/whiteboardPack.test.ts`
Expected: FAIL (both files), because `../src/store/defenseMarkdown` can't be resolved ("Cannot find module '../src/store/defenseMarkdown'").

- [ ] **Step 3: Write the Markdown**

`packages/core/src/store/defenseMarkdown.ts`:
```ts
import {
  BASIS_LABELS,
  DEFENSE_PARTS,
  DEFENSE_SECTIONS,
  LEVEL_NAMES,
  SEVERITY_LABELS,
  type Basis,
  type Claim,
  type DefenseTable,
  type WhiteboardDefense,
} from '../schemas';

type Section = WhiteboardDefense['sections'][number];
type Question = WhiteboardDefense['questions'][number];
type Concern = WhiteboardDefense['concerns'][number];
/** Item titles by id, for a section's diagramItemId. An id with no title here is shown as the id. */
type ItemTitles = Record<string, string>;
/** Item diagrams by id, each a fenced Mermaid block (finalExport's diagramMermaid), drawn under a section's Diagram line. */
type ItemDiagrams = Record<string, string>;

/** A list item. Lines after the first are indented, so a statement over several lines stays one item. */
const bullet = (text: string) => `- ${text.split('\n').map((line, i) => (i === 0 || line === '' ? line : `  ${line}`)).join('\n')}`;
const tagged = (text: string, basis: Basis) => `${text} *(${BASIS_LABELS[basis]})*`;
const heading = (n: number, title: string) => `## ${n}. ${title}`;
/** A heading and the blocks under it, or "None." when there are none. */
const under = (head: string, blocks: string[]) => [head, ...(blocks.length ? blocks : ['None.'])].join('\n\n');
/** A table cell (or column): a | would end the cell, and a newline the row. */
const cell = (text: string) => text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

function table(t: DefenseTable): string {
  const row = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
  return [`**${t.title}**`, '', row(t.columns), row(t.columns.map(() => '---')), ...t.rows.map(row)].join('\n');
}

/** A plain-text diagram, fenced with more backticks than any run inside it, so it can't close its own fence. */
function fenced(diagram: string): string {
  const longest = Math.max(0, ...(diagram.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${diagram.replace(/\n+$/, '')}\n${fence}`;
}

const numberOf = (id: Section['id']) => DEFENSE_SECTIONS.find((s) => s.id === id)?.n ?? 0;

/** A prose section: its claims, the project's diagram it names (drawn too, when it's given), its tables, then its text diagram. */
function sectionBlock(s: Section, titles: ItemTitles, diagrams: ItemDiagrams = {}): string {
  const blocks: string[] = [];
  if (s.claims.length) blocks.push(s.claims.map((c) => bullet(tagged(c.text, c.basis))).join('\n'));
  if (s.diagramItemId) {
    blocks.push(`Diagram: ${titles[s.diagramItemId] ?? s.diagramItemId} (in dev-plumbing).`);
    if (diagrams[s.diagramItemId]) blocks.push(diagrams[s.diagramItemId]);
  }
  for (const t of s.tables) blocks.push(table(t));
  if (s.diagram?.trim()) blocks.push(fenced(s.diagram));
  return under(heading(numberOf(s.id), s.title), blocks);
}

const questionBlock = (q: Question) => `**${q.q}**\n\n${tagged(q.a, q.basis)}`;
const concernLine = (c: Concern) => bullet(tagged(`**${SEVERITY_LABELS[c.severity]}:** ${c.text}`, c.basis));
const questionsHeading = heading(DEFENSE_PARTS.questions.n, DEFENSE_PARTS.questions.title);
const concernsHeading = heading(DEFENSE_PARTS.concerns.n, DEFENSE_PARTS.concerns.title);

/**
 * The whole defense as one Markdown document, for Export .md and a thread's pack: the level and its reasons, then the
 * 13 sections in order (1–9, 10 Questions, 11 Release concerns, 12 Unknowns, 13 Checklist). `title` is the project's.
 * `itemTitles` names the item a section's diagramItemId points at, and `diagrams` (Export .md's) draws it as Mermaid,
 * for a reader of the repo who can't see dev-plumbing.
 */
export function defenseMarkdown(d: WhiteboardDefense, o: { title: string; itemTitles?: ItemTitles; diagrams?: ItemDiagrams }): string {
  const titles = o.itemTitles ?? {};
  const parts: { n: number; text: string }[] = [
    ...DEFENSE_SECTIONS.flatMap(({ id, n }) => {
      const s = d.sections.find((x) => x.id === id);
      return s ? [{ n, text: sectionBlock(s, titles, o.diagrams) }] : [];
    }),
    { n: DEFENSE_PARTS.questions.n, text: under(questionsHeading, d.questions.map(questionBlock)) },
    { n: DEFENSE_PARTS.concerns.n, text: under(concernsHeading, d.concerns.length ? [d.concerns.map(concernLine).join('\n')] : []) },
    {
      n: DEFENSE_PARTS.checklist.n,
      text: under(heading(DEFENSE_PARTS.checklist.n, DEFENSE_PARTS.checklist.title), d.checklist.length ? [d.checklist.map((k) => `- [ ] ${k.text}`).join('\n')] : []),
    },
  ].sort((a, b) => a.n - b.n);
  const head = [
    `# Whiteboard Defense: ${o.title}`,
    `Level ${d.level} (${LEVEL_NAMES[d.level]}). Generated ${d.generatedAt.slice(0, 10)} from the ${d.basedOn.doc} (v${d.basedOn.version}).`,
    ...(d.levelReasons.length ? [d.levelReasons.map(bullet).join('\n')] : []),
  ];
  return `${[...head, ...parts.map((p) => p.text)].join('\n\n')}\n`;
}

/**
 * One part of the defense, as its block in the whole document with its heading: a section (by id), a question (q<n>) or
 * a release concern (c<n>). A Defense item's body. Null when the defense has no such part.
 */
export function defensePartMarkdown(d: WhiteboardDefense, kind: 'section' | 'question' | 'concern', ref: string, o: { itemTitles?: ItemTitles } = {}): string | null {
  if (kind === 'section') {
    const s = d.sections.find((x) => x.id === ref);
    return s ? sectionBlock(s, o.itemTitles ?? {}) : null;
  }
  if (kind === 'question') {
    const q = d.questions.find((x) => x.id === ref);
    return q ? under(questionsHeading, [questionBlock(q)]) : null;
  }
  const c = d.concerns.find((x) => x.id === ref);
  return c ? under(concernsHeading, [concernLine(c)]) : null;
}

/** The claim a ref names (`${sectionId}.${index}`, the index from 0), with its section and that section's number. */
export function claimAt(d: WhiteboardDefense, ref: string): { section: Section; n: number; claim: Claim } | null {
  const m = /^([a-z]+)\.(0|[1-9]\d*)$/.exec(ref);
  const section = m ? d.sections.find((s) => s.id === m[1]) : undefined;
  const claim = section?.claims[Number(m?.[2])];
  return section && claim ? { section, n: numberOf(section.id), claim } : null;
}
```

- [ ] **Step 4: Update the imports in `context.ts`**

In `packages/core/src/store/context.ts`:
- In the `'../schemas'` import, replace:
```ts
  dataKindOf,
  dataShapeDoc,
  displayStatus,
```
with:
```ts
  dataKindOf,
  dataShapeDoc,
  DEFENSE_SECTIONS,
  displayStatus,
```
- In the same import, replace:
```ts
  type CodeRef,
  type Decision,
  type DisplayStatus,
```
with:
```ts
  type CodeRef,
  type Decision,
  type DefenseSectionId,
  type DisplayStatus,
```
- Replace:
```ts
import { activeDecisions } from './decisions';
```
with:
```ts
import { activeDecisions } from './decisions';
import { defenseMarkdown } from './defenseMarkdown';
```
- Replace:
```ts
import { docPath, readDecisions, readDocText, readItem, readItems, readProjectFile, readThread, readThreads, StoreError } from './io';
```
with:
```ts
import { docPath, projectFiles, readDecisions, readDocText, readItem, readItems, readProjectFile, readThread, readThreads, StoreError } from './io';
```
- Replace:
```ts
import { readVersionDoc } from './versions';
```
with:
```ts
import { readVersionDoc } from './versions';
import { defenseBasis, defenseDiagramItemIds, readDefense } from './whiteboard';
```

- [ ] **Step 5: Give a thread about the defense the whole defense, and the final's path**

In `packages/core/src/store/context.ts`:
- In `ThreadPack`, replace:
```ts
  /** The whole draft, for patches outside the item's section. Read it; never write it. */
  draftFile: string;
  conventions: string[];
};
```
with:
```ts
  /** The whole draft, for patches outside the item's section. Read it; never write it. */
  draftFile: string;
  conventions: string[];
  /** For an item made from the Whiteboard Defense (a Defense thread, or one sent to plumbing): the whole defense as Markdown. Null otherwise. */
  defense: string | null;
  /** The accepted final, which a defense may explain, when the project has one. Read it; never write it. Null otherwise. */
  finalFile: string | null;
};
```
- In `threadPack`, replace:
```ts
    : null;
  return {
    project: { repo: project.repo, id: project.id, title: project.title, summary: firstParagraph(draft) },
```
with:
```ts
    : null;
  const defense = item.fromDefense ? await readDefense(o.dir) : null;
  return {
    project: { repo: project.repo, id: project.id, title: project.title, summary: firstParagraph(draft) },
```
- At the end of `threadPack`, replace:
```ts
    draftFile: docPath(o.dir, project.docs.draft),
    conventions: o.profile?.conventions ?? [],
  };
}
```
with:
```ts
    draftFile: docPath(o.dir, project.docs.draft),
    conventions: o.profile?.conventions ?? [],
    defense: defense ? defenseMarkdown(defense, { title: project.title, itemTitles: Object.fromEntries(items.map((i) => [i.id, i.title])) }) : null,
    finalFile: project.docs.final ? docPath(o.dir, project.docs.final) : null,
  };
}
```

- [ ] **Step 6: Share `finalizePack`'s item and decision building, and write the pack**

`finalizePack` is the last thing in `packages/core/src/store/context.ts`. Replace it whole, as Task 2 left it (its item filter ends `&& i.type !== PLAN_CHANGES && i.type !== DEFENSE)`): everything from its doc comment, which starts:
```ts
/**
 * What the finalizer receives: the output rules, the whole draft, every item that goes into the final with a summary of
```
to the end of the file, with:
```ts
/** The items that go into the final, and what the finalizer's and the whiteboard subagent's packs say about them. */
type PlanItems = {
  /** As stored, in plumbing-type order, then by title. */
  items: Item[];
  /** The same items, as the packs list them. */
  listed: FinalizePack['items'];
  decisions: FinalizePack['decisions'];
  defaults: FinalizePack['defaults'];
  openItems: FinalizePack['openItems'];
  /** The ids of the items that block Finalize. */
  blocking: Set<string>;
};

/**
 * The items that go into the final, with their decisions, the defaults that will be used and the items still open.
 * finalizePack and whiteboardPack both read the plan through this, so they always agree on what's in it.
 */
async function planItems(o: { dir: string; types: PlumbingType[] }): Promise<PlanItems> {
  const { values: allItems } = await readItems(o.dir);
  const { values: threads } = await readThreads(o.dir);
  const threadById = new Map(threads.map((t) => [t.id, t]));
  const typeOf = (item: Item) => o.types.find((t) => t.id === item.type);
  const statusOf = (item: Item): DisplayStatus => {
    const thread = threadById.get(item.threadId);
    return thread ? displayStatus(thread) : 'idle';
  };
  const order = (item: Item) => typeOf(item)?.order ?? Number.MAX_SAFE_INTEGER;
  // Parked items and items of disabled plumbing types don't go into the final (saveProposal refuses their tokens).
  // Nor do Plan changes items, since what they settled is already in the draft, or Defense items, which are questions
  // about the Whiteboard Defense. Leaving an item out leaves out the decisions about it too.
  const items = allItems
    .filter((i) => statusOf(i) !== 'parked' && typeOf(i)?.enabled !== false && i.type !== PLAN_CHANGES && i.type !== DEFENSE)
    .sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
  const checklist = await finalizeChecklist(o.dir, o.types);
  const blocking = new Set(checklist.blocking.map((e) => e.itemId));
  const context = { threads: threadById, items: new Map(allItems.map((i) => [i.id, i])), types: o.types };
  // A decision about an item left out of the final is left out with it. One about no item at all stays.
  const inPack = new Set(items.map((i) => i.id));
  return {
    items,
    listed: items.map((i) => ({
      id: i.id,
      type: i.type,
      typeTitle: typeOf(i)?.title ?? i.type,
      title: i.title,
      summary: i.summary,
      body: i.body ?? null,
      fields: i.fields ?? {},
      status: statusOf(i),
      codeRefs: i.codeRefs ?? [],
      dataSummary: dataSummary(i, typeOf(i)),
    })),
    decisions: activeDecisions(await readDecisions(o.dir))
      .map((d) => decisionDetail(d, context))
      .filter((d) => d.itemId === null || inPack.has(d.itemId)),
    defaults: checklist.defaults.map((e) => ({ itemId: e.itemId, title: e.title, defaultValue: e.defaultValue })),
    openItems: items
      .filter((i) => ['your_turn', 'draft'].includes(statusOf(i)) && !blocking.has(i.id))
      .map((i) => ({ itemId: i.id, title: i.title, typeTitle: typeOf(i)?.title ?? i.type })),
    blocking,
  };
}

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

/**
 * What the whiteboard subagent reads. The big texts are files it Reads, not text in the pack, so the pack stays well
 * under the size an MCP tool result may have, whatever the size of the plan.
 */
export type WhiteboardPack = {
  project: { repo: string; id: string; title: string; sourcePath: string; name: string };
  /** outputs/whiteboard-defense.md, or the shipped one when the user's is missing: the framework the defense follows. */
  rulesFile: string;
  /** What the defense explains (defenseBasis): the final while it's current, else the draft, at the plan's current version. */
  basedOn: { doc: 'final' | 'draft'; version: number };
  /** That document. */
  documentFile: string;
  /**
   * finalizePack's items. `file` is the item's own JSON, to Read for anything cut short here. `body` is cut to 800
   * characters. `data`, the drawing, is here only for a diagram, which diagramItemId may name; any other drawing has
   * just its `dataSummary`.
   */
  items: (FinalizePack['items'][number] & { file: string; data: unknown })[];
  decisions: FinalizePack['decisions'];
  /** Questions nobody answered: the plan assumes their default. */
  defaults: FinalizePack['defaults'];
  /** Every item that isn't resolved or parked: the plan's open questions, with where each stands and whether it blocks Finalize. */
  openItems: { itemId: string; title: string; typeTitle: string; status: DisplayStatus; blocking: boolean }[];
  conventions: string[];
  /** The repo profile's sensitive data tags. They raise the level. */
  sensitiveData: string[];
  /** The repo profile's database schema file and its apps, to Read when a section needs them. */
  schema: { type: string; path: string } | null;
  apps: { name: string; path: string }[];
  /** The ten prose sections to fill, in order, with their numbers among the 13. */
  sections: { id: DefenseSectionId; n: number; title: string }[];
  /** The items a section's diagramItemId may name: exactly the ones saveDefense accepts (defenseDiagramItemIds). */
  diagramItemIds: string[];
  /**
   * The saved defense's question texts, and the texts of its claims marked unknown or verify. A regenerate keeps the
   * wording of those that still apply: Practice keeps ratings, and sending matches unknowns, by text. Null with none saved.
   */
  previous: { questions: string[]; unknowns: string[] } | null;
};

/**
 * An item's body in the pack is cut to this many characters, and says where the rest is. 40 items of long bodies then
 * stay under 60,000 characters of JSON, about 16,000 tokens, well inside an MCP tool result.
 */
const BODY_MAX = 800;
const CLIPPED = '… (clipped: Read file for the rest)';

/**
 * What the whiteboard subagent receives: the framework and the document the defense is based on (as files to Read),
 * every item that goes into the final, the decisions with their why, the defaults, the items still open, the repo's
 * conventions, sensitive data, schema and apps, the sections to fill, the diagrams it may name, and the last defense's
 * wording. `rulesFile` is the rules file the service picked: the user's, or the shipped one.
 */
export async function whiteboardPack(o: { dir: string; types: PlumbingType[]; profile?: RepoProfile; rulesFile: string }): Promise<WhiteboardPack> {
  const project = await readProjectFile(o.dir);
  const plan = await planItems(o);
  const basis = await defenseBasis(o.dir);
  const saved = await readDefense(o.dir);
  const isDiagram = (item: Item) => {
    const type = o.types.find((t) => t.id === item.type);
    return type !== undefined && dataKindOf(type) === 'diagram';
  };
  const clipped = (body: string | null) => (body !== null && body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}${CLIPPED}` : body);
  return {
    project: { repo: project.repo, id: project.id, title: project.title, sourcePath: project.source.path, name: finalName(project.source.path) },
    rulesFile: o.rulesFile,
    basedOn: { doc: basis.doc, version: basis.version },
    documentFile: docPath(o.dir, basis.doc === 'final' && project.docs.final ? project.docs.final : project.docs.draft),
    items: plan.listed.map((entry, k) => {
      const item = plan.items[k];
      return { ...entry, body: clipped(entry.body), file: path.resolve(projectFiles(o.dir).item(item.id)), data: isDiagram(item) ? (item.data ?? null) : null };
    }),
    decisions: plan.decisions,
    defaults: plan.defaults,
    openItems: plan.listed
      .filter((i) => i.status !== 'resolved')
      .map((i) => ({ itemId: i.id, title: i.title, typeTitle: i.typeTitle, status: i.status, blocking: plan.blocking.has(i.id) })),
    conventions: o.profile?.conventions ?? [],
    sensitiveData: o.profile?.sensitiveData ?? [],
    schema: o.profile?.schema ?? null,
    apps: (o.profile?.apps ?? []).map((a) => ({ name: a.name, path: a.path })),
    sections: DEFENSE_SECTIONS.map((s) => ({ id: s.id, n: s.n, title: s.title })),
    diagramItemIds: await defenseDiagramItemIds(o.dir, o.types),
    previous: saved
      ? {
          questions: saved.questions.map((q) => q.q),
          unknowns: saved.sections.flatMap((s) => s.claims.filter((c) => c.basis === 'unknown' || c.basis === 'verify').map((c) => c.text)),
        }
      : null,
  };
}
```
`FinalizePack`, `dataSummary`, `decisionDetail`, `WHY_MAX`, `clip`, `count`, `DIAGRAM_KIND` and `FLOW_KIND`, above it, stay as they are.

`whiteboardPack` uses `path.resolve`, so add the import at the top of the file. Replace:
```ts
import { DEFENSE } from '../defenseType';
```
with:
```ts
import path from 'node:path';
import { DEFENSE } from '../defenseType';
```

- [ ] **Step 7: Export the Markdown**

In `packages/core/src/index.ts`, after Task 1's export, the last line, replace:
```ts
export * from './store/whiteboard';
```
with:
```ts
export * from './store/whiteboard';
export * from './store/defenseMarkdown';
```

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run packages/core/test/defenseMarkdown.test.ts packages/core/test/whiteboardPack.test.ts packages/core/test/finalizePack.test.ts packages/core/test/context.test.ts`
Expected: PASS (9 and 9 tests in the new files). `finalizePack.test.ts` and `context.test.ts` pass as Task 2 left them.

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/store/defenseMarkdown.ts packages/core/src/store/context.ts packages/core/src/index.ts packages/core/test/defenseMarkdown.test.ts packages/core/test/whiteboardPack.test.ts
git commit -m "feat(core): the whiteboard subagent's context pack, and the defense as Markdown" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ask Claude about a part, and send unknowns and concerns to plumbing

The Whiteboard Defense reaches plumbing in two ways:
- **Ask Claude about this** makes a thread in the built-in Defense type about one part: a section, a question or a release concern. Its body is that part as Markdown, and your question is its first message, sent as **Send this thread** sends one.
- **Send to Questions** and **Send to Concerns** turn a claim marked Unknown or Verify before release, or a release concern, into an ordinary plumbing item. Its thread starts with Claude, as a Plan changes thread does, so a listening window suggests answers. Those first suggestions don't hold up Finalize until you've written in the thread, as an imported question's opening options don't.

`defenseLinks` lists both, for the current defense, so the page can show them. A part is sent once: the item records its text, so a regenerated defense that still has the same unknown or concern shows it as sent, and won't send it again.

**Files:**
- Create:
  - `packages/core/src/store/defenseItems.ts`
  - `packages/core/test/defenseItems.test.ts`
- Modify:
  - `packages/core/src/index.ts` (export `./store/defenseItems`)
  - `packages/core/src/store/checklist.ts` (a proposal blocks Finalize only once you've written in the thread)
- Test:
  - `packages/core/test/defenseItems.test.ts`
  - `packages/core/test/checklist.test.ts`, `packages/core/test/finalize.test.ts` and `packages/core/test/defenseType.test.ts` (unchanged: they must still pass)

**Interfaces:**
- Consumes:
  - From Task 1:
    - through `../schemas`: `WhiteboardDefense`, `Severity`, `DefenseRef`, `DefenseLink`, `DEFENSE_SECTIONS`, `BASIS_LABELS` and `SEVERITY_LABELS`, and `Item.fromDefense`;
    - `readDefense` and `writeDefense` (`store/whiteboard.ts`);
    - in the tests, `storedDefense(overrides?)`.
  - From Task 2: `DEFENSE` and `DEFENSE_TYPE` (`core/src/defenseType.ts`).
  - From Task 4: `defensePartMarkdown(d, kind, ref, { itemTitles })` and `claimAt(d, ref)` (`store/defenseMarkdown.ts`). `index.ts` ends with Task 4's `export * from './store/defenseMarkdown';`.
  - From Plans 1–5:
    - `uniqueId` (`store/importItems.ts`), `slugify` (`store/open.ts`) and `latestOpen` (`store/threads.ts`, in `checklist.ts`);
    - `newId`, `readItems`, `readThreads`, `writeItem`, `writeThread`, `writeSubmission` and `touchProject` (`store/io.ts`), and `displayStatus`;
    - in the tests: `submit`, `pendingSubmissions`, `finalizeChecklist`, `seedProject`, `pair` and `TYPES`.
- Produces, as in the header's Contracts (exported from `@dev-plumbing/core`):
  ```ts
  export async function askAboutDefense(dir: string, o: { defenseId: string; kind: 'section' | 'question' | 'concern'; ref: string; question: string; now?: Date }): Promise<{ itemId: string; threadId: string }>;
  export async function sendFromDefense(dir: string, o: { defenseId: string; kind: 'claim' | 'concern'; ref: string; types: PlumbingType[]; now?: Date }): Promise<{ itemId: string; threadId: string; typeId: string; typeTitle: string }>;
  export async function defenseLinks(dir: string, defense: WhiteboardDefense): Promise<{ asked: DefenseLink[]; sent: DefenseLink[] }>;
  export const SEND_TARGET = { claim: 'questions', concern: 'concerns' } as const;
  export const CONCERN_SEVERITY: Record<Severity, string> = { critical: 'high', high: 'high', medium: 'medium', low: 'low', info: 'low' };
  ```
  Beyond the Contracts, two exports that Task 6's practice uses, so its refusals are the same:
  ```ts
  export const NO_PART = "That part of the Whiteboard Defense doesn't exist.";
  /** ConflictError "There's no Whiteboard Defense yet." / "The Whiteboard Defense changed since this page loaded. Reload it." */
  export async function currentDefense(dir: string, defenseId: string): Promise<WhiteboardDefense>;
  ```
- **Behaviour:**
  - **`currentDefense`** returns the saved defense. It refuses with a ConflictError:
    - "There's no Whiteboard Defense yet." when there's none;
    - "The Whiteboard Defense changed since this page loaded. Reload it." when its id isn't `defenseId`.
  - **`askAboutDefense`:**
    - **Refusals,** in order, none of which writes anything:
      - `currentDefense`'s;
      - InputError `NO_PART` when `defensePartMarkdown` gives null;
      - InputError "Write your message first." (`addOwnItem`'s message) for a question that's empty once trimmed. The route already requires 1–20,000 characters.
    - **The item:**
      - `id` is `uniqueId(`defense-${slugify(title)}`, taken)`, and `type` is `'defense'`;
      - `title` is the trimmed question's first line, clipped to 120 characters (119 and "…");
      - `summary` is the exact copy (`About ${n}. ${sectionTitle}`, `About the question: ${q}` or `About the ${severity label, lowercased} concern: ${text}`), clipped to 300;
      - `body` is `defensePartMarkdown`, with the project's item titles;
      - `threadId` is `t-<id>`, `createdBy` is `'whiteboard'`, and `fromDefense` is `{ id: defense.id, kind, ref }`.
    - **The thread** is `idle`, with no messages, and a draft `{ text: <the trimmed question>, updatedAt }`.
    - **Nothing is sent here.** The route calls `submit({ scope: 'thread' })` next, under the same lock, which makes the question the first `you` message and the thread `with_claude`.
    - **Each ask makes a new item,** even about the same part in the same words: the id gets `-2`, `-3` and so on.
  - **`sendFromDefense`:**
    - **Refusals,** in order, none of which writes anything:
      - `currentDefense`'s;
      - the part: InputError `NO_PART` for a claim ref `claimAt` doesn't find, or a concern id the defense doesn't have;
      - InputError "Only a claim marked Unknown or Verify before release can be sent to Questions." for a claim whose basis is `known` or `inferred`;
      - ConflictError `There's no enabled ${typeName} type to send it to. Turn it on in Plumbing rules.` when `SEND_TARGET[kind]` isn't an enabled type in `types`, with `typeName` "Questions" or "Concerns";
      - ConflictError `That's already in ${type.title}.` when the part was sent before, from this defense or an earlier one. That means an item that isn't a Defense item has the same `fromDefense` id, kind and ref, or, whatever its defense id, was made by the whiteboard with the same `fromDefense.kind` and the same `fromDefense.text`, both trimmed and with each run of whitespace made one space. Asking about a concern doesn't count as sending it.
    - **The item:**
      - `id` is `uniqueId(`${type.id}-${slugify(title)}`, taken)`;
      - `title` is the text with each run of whitespace made one space, clipped to 120;
      - `summary` is the text clipped to 300;
      - `body` is the exact copy: `From the Whiteboard Defense (${n}. ${sectionTitle}), marked ${basisLabel}:\n\n${text}` for a claim, or `From the Whiteboard Defense's release concerns, marked ${severityLabel}:\n\n${text}` for a concern;
      - a concern gets `fields: { severity: CONCERN_SEVERITY[severity] }`, and a claim no fields;
      - `threadId` is `t-<id>`, `createdBy` is `'whiteboard'`, and `fromDefense` is `{ id: defense.id, kind, ref, text }`, where `text` is the claim's or the concern's text as the defense has it.
    - **The thread** is `with_claude`, with one system message: "Sent from the Whiteboard Defense.".
    - **The submission** is `{ id: newId('s', now), at, scope: 'all', drafts: {}, sent: [threadId], resolved: [], processedAt: at }`, as an update writes for Plan changes threads, so `pendingSubmissions` hands it to the next `dp_wait`.
    - It writes the item, the thread and the submission, then `touchProject`, and returns `{ itemId, threadId, typeId, typeTitle }`.
  - **`defenseLinks`:**
    - It lists the items whose `fromDefense.id` is this defense's: `asked` are those of type `defense`, and `sent` the rest.
    - `sent` also has the items an earlier defense sent whose kind and text (matched as Send matches them) are one of this defense's parts that can be sent: a claim marked Unknown or Verify before release, or a concern. Their link's `ref` is this defense's ref for that part (the first one, if two have the same text), so the page shows "In Questions ›" against it.
    - Each link is `{ kind, ref, itemId, threadId, typeId: item.type, title, status }`, where `status` is `displayStatus` of its thread, or `'idle'` without one.
    - They're oldest first, by when the thread started (its first message, else its draft's `updatedAt`), then by id.
  - **`checklist.ts`'s `blockingReason`:** "A proposal is waiting for your answer." now also needs a message from you in the thread (`thread.messages.some((m) => m.author === 'you')`). Claude's first reply on a thread the service handed it, such as a sent unknown, is then like an imported question's opening options: the item is "Nobody has answered here.", not blocking. A sent high concern still blocks by its severity, and a Plan changes thread by `CONFLICT_REASON`, which comes first.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/defenseItems.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { DEFENSE_TYPE } from '../src/defenseType';
import type { Message, Option, PlumbingType, WhiteboardDefense } from '../src/schemas';
import { finalizeChecklist } from '../src/store/checklist';
import { askAboutDefense, defenseLinks, sendFromDefense } from '../src/store/defenseItems';
import { defensePartMarkdown } from '../src/store/defenseMarkdown';
import { ConflictError, InputError, readItem, readItems, readThread, writeItem, writeThread } from '../src/store/io';
import { pendingSubmissions } from '../src/store/queue';
import { submit } from '../src/store/submit';
import { writeDefense } from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject, storedDefense, TYPES } from './fixtures';

afterAll(removeTempDirs);

const types: PlumbingType[] = [...TYPES, DEFENSE_TYPE];
const T1 = new Date('2026-10-06T10:00:00.000Z');
const T2 = new Date('2026-10-06T11:00:00.000Z');
const T3 = new Date('2026-10-06T12:00:00.000Z');
const WHO = 'Who can turn reminders off for a customer?';
const RERUN = 'A rerun on the same day sends duplicate emails.';

/** The fixture's defense, with a known, an unknown and a verify claim in Security model, and a high and an info concern. */
function defense(): WhiteboardDefense {
  const base = storedDefense();
  return storedDefense({
    sections: base.sections.map((s) =>
      s.id === 'security'
        ? {
            ...s,
            claims: [
              { text: 'Only the reminder job reads the reminders table.', basis: 'known' },
              { text: WHO, basis: 'unknown' },
              { text: 'The email provider accepts a burst of 10,000 sends.', basis: 'verify' },
            ],
          }
        : s,
    ),
    concerns: [
      { id: 'c1', severity: 'high', text: RERUN, basis: 'inferred' },
      { id: 'c2', severity: 'info', text: 'Some reminders may land in spam.', basis: 'inferred' },
    ],
  });
}

async function seed(): Promise<string> {
  const dir = await seedProject({ pairs: [pair('q-lead', { title: 'Lead time', status: 'resolved' })] });
  await writeDefense(dir, defense());
  return dir;
}

const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);
/** Refused with exactly this error, and nothing written. */
async function refused(dir: string, run: () => Promise<unknown>, kind: typeof InputError | typeof ConflictError, message: string): Promise<void> {
  const before = (await readItems(dir)).values.length;
  const error = await failure(run());
  expect(error, message).toBeInstanceOf(kind);
  expect((error as Error).message).toBe(message);
  expect((await readItems(dir)).values.length, message).toBe(before);
}

describe('asking Claude about the Whiteboard Defense', () => {
  it('makes a Defense item about the part, with your question waiting to be sent', async () => {
    const dir = await seed();
    const first = `How does the job know a customer was already reminded today? ${'It matters for reruns. '.repeat(6)}`.trim();
    const question = `${first}\n\nAnd what about time zones?`;
    const { itemId, threadId } = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'section', ref: 'security', question: `  ${question}\n`, now: T1 });
    expect(itemId).toMatch(/^defense-how-does-the-job-know-a-customer/);
    expect(threadId).toBe(`t-${itemId}`);
    // The title is the question's first line, cut to 120 characters.
    expect(await readItem(dir, itemId)).toEqual({
      id: itemId,
      type: 'defense',
      title: `${first.slice(0, 119)}…`,
      summary: 'About 5. Security model',
      body: defensePartMarkdown(defense(), 'section', 'security'),
      threadId,
      createdBy: 'whiteboard',
      fromDefense: { id: 'w-test', kind: 'section', ref: 'security' },
    });
    expect(await readThread(dir, threadId)).toEqual({ id: threadId, itemId, status: 'idle', draft: { text: question, updatedAt: T1.toISOString() }, messages: [] });

    // Sent like Send this thread: your question is the first message, and Claude has it.
    const result = await submit(dir, { scope: 'thread', threadId, types, now: T2 });
    expect(result.sent).toEqual([threadId]);
    const sent = await readThread(dir, threadId);
    expect(sent.status).toBe('with_claude');
    expect(sent.draft).toBeUndefined();
    expect(sent.messages).toEqual([{ id: expect.any(String), at: T2.toISOString(), author: 'you', sentWith: 'thread', text: question }]);
  });

  it('says what a question or a concern asked about is, and makes a new thread each time', async () => {
    const dir = await seed();
    const d = defense();
    const q = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'question', ref: 'q1', question: 'Why not a queue?', now: T1 });
    const again = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'question', ref: 'q1', question: 'Why not a queue?', now: T2 });
    const c = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c1', question: 'How likely is this?', now: T1 });
    expect([q.itemId, again.itemId]).toEqual(['defense-why-not-a-queue', 'defense-why-not-a-queue-2']);
    expect(await readItem(dir, q.itemId)).toMatchObject({ summary: `About the question: ${d.questions[0].q}`, body: defensePartMarkdown(d, 'question', 'q1') });
    expect(await readItem(dir, c.itemId)).toMatchObject({ summary: `About the high concern: ${RERUN}`, body: defensePartMarkdown(d, 'concern', 'c1') });

    // A summary is cut to 300 characters.
    const long = 'Why does the reminder job need to know about every subscription the customer has ever had? '.repeat(5).trim();
    await writeDefense(dir, { ...d, questions: [{ id: 'q1', q: long, a: 'It only reads the active ones.', basis: 'known' }] });
    const clipped = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'question', ref: 'q1', question: 'Really?', now: T3 });
    expect((await readItem(dir, clipped.itemId)).summary).toBe(`${`About the question: ${long}`.slice(0, 299)}…`);
  });

  it("refuses with no defense, a defense that changed since the page loaded, or a part it doesn't have", async () => {
    const empty = await seedProject();
    await refused(empty, () => askAboutDefense(empty, { defenseId: 'w-test', kind: 'section', ref: 'security', question: 'Why?' }), ConflictError, "There's no Whiteboard Defense yet.");
    const dir = await seed();
    await refused(
      dir,
      () => askAboutDefense(dir, { defenseId: 'w-older', kind: 'section', ref: 'security', question: 'Why?' }),
      ConflictError,
      'The Whiteboard Defense changed since this page loaded. Reload it.',
    );
    for (const [kind, ref] of [['section', 'nope'], ['question', 'q9'], ['concern', 'c9']] as const) {
      await refused(dir, () => askAboutDefense(dir, { defenseId: 'w-test', kind, ref, question: 'Why?' }), InputError, "That part of the Whiteboard Defense doesn't exist.");
    }
    await refused(dir, () => askAboutDefense(dir, { defenseId: 'w-test', kind: 'section', ref: 'security', question: ' \n ' }), InputError, 'Write your message first.');
  });
});

describe('sending the Whiteboard Defense to plumbing', () => {
  it('sends an unknown claim to Questions, where Claude starts the thread', async () => {
    const dir = await seed();
    const result = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'security.1', types, now: T1 });
    const itemId = 'questions-who-can-turn-reminders-off-for-a-customer';
    expect(result).toEqual({ itemId, threadId: `t-${itemId}`, typeId: 'questions', typeTitle: 'Questions' });
    expect(await readItem(dir, itemId)).toEqual({
      id: itemId,
      type: 'questions',
      title: WHO,
      summary: WHO,
      body: `From the Whiteboard Defense (5. Security model), marked Unknown:\n\n${WHO}`,
      threadId: `t-${itemId}`,
      createdBy: 'whiteboard',
      fromDefense: { id: 'w-test', kind: 'claim', ref: 'security.1', text: WHO },
    });
    expect(await readThread(dir, `t-${itemId}`)).toEqual({
      id: `t-${itemId}`,
      itemId,
      status: 'with_claude',
      messages: [{ id: expect.any(String), at: T1.toISOString(), author: 'system', text: 'Sent from the Whiteboard Defense.' }],
    });
    // The next dp_wait hands this thread to a window, as it does a Plan changes thread.
    expect(await pendingSubmissions(dir)).toEqual([
      { id: expect.stringMatching(/^s-/), at: T1.toISOString(), scope: 'all', drafts: {}, sent: [`t-${itemId}`], resolved: [], processedAt: T1.toISOString() },
    ]);

    const verify = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'security.2', types, now: T2 });
    expect((await readItem(dir, verify.itemId)).body).toBe('From the Whiteboard Defense (5. Security model), marked Verify before release:\n\nThe email provider accepts a burst of 10,000 sends.');
  });

  it('sends a high concern to Concerns, where it blocks Finalize like any other, and an informational one as low', async () => {
    const dir = await seed();
    const high = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c1', types, now: T1 });
    expect(high.typeTitle).toBe('Concerns');
    expect(await readItem(dir, high.itemId)).toMatchObject({
      type: 'concerns',
      title: RERUN,
      fields: { severity: 'high' },
      body: `From the Whiteboard Defense's release concerns, marked High:\n\n${RERUN}`,
    });
    const info = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c2', types, now: T1 });
    expect((await readItem(dir, info.itemId)).fields).toEqual({ severity: 'low' });

    // Claude has replied in both: the high one still blocks until it's resolved, and the low one doesn't.
    for (const id of [high.threadId, info.threadId]) {
      const thread = await readThread(dir, id);
      await writeThread(dir, { ...thread, status: 'your_turn', messages: [...thread.messages, { id: `m-${id}`, at: T2.toISOString(), author: 'claude', text: 'Here is a fix.' }] });
    }
    const checklist = await finalizeChecklist(dir, types);
    expect(checklist.blocking).toEqual([{ itemId: high.itemId, threadId: high.threadId, title: RERUN, typeTitle: 'Concerns', reason: 'High-severity concern, not resolved.' }]);
    expect(checklist.canStart).toBe(false);
  });

  it("doesn't hold up Finalize with Claude's suggested answers until you've written in the thread", async () => {
    const dir = await seed();
    const { itemId, threadId } = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'security.1', types, now: T1 });
    const sent = await readThread(dir, threadId);
    const PROPOSAL: Option[] = [
      { id: 'admins', label: 'Only admins', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table. Only admins turn them off.' }] } },
      { id: 'anyone', label: 'The customer too' },
    ];
    const suggested: Message = { id: 'm-1', at: T2.toISOString(), author: 'claude', text: 'Two ways to settle it.', options: PROPOSAL, recommended: 'admins' };
    await writeThread(dir, { ...sent, status: 'your_turn', messages: [...sent.messages, suggested] });
    const first = await finalizeChecklist(dir, types);
    expect(first.blocking).toEqual([]);
    expect(first.unreviewed).toEqual([{ itemId, threadId, title: WHO, typeTitle: 'Questions', reason: 'Nobody has answered here.' }]);

    // Once you've written in it, Claude's next proposal waits for your answer.
    const you: Message = { id: 'y-1', at: T3.toISOString(), author: 'you', optionId: 'custom', text: 'Only admins, but who are they?' };
    const proposal: Message = { ...suggested, id: 'm-2', at: T3.toISOString(), text: 'The account owner and support.' };
    await writeThread(dir, { ...sent, status: 'your_turn', messages: [...sent.messages, suggested, you, proposal] });
    expect((await finalizeChecklist(dir, types)).blocking).toEqual([{ itemId, threadId, title: WHO, typeTitle: 'Questions', reason: 'A proposal is waiting for your answer.' }]);
  });

  it('knows a part was sent from an earlier defense by its text, so a regenerate never sends it twice', async () => {
    const dir = await seed();
    const claim = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'security.1', types, now: T1 });
    const concern = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c1', types, now: T2 });
    // Regenerated: the same unknown, spaced differently, is now Unknowns' second claim, and the same concern is c2.
    const d = defense();
    const regenerated: WhiteboardDefense = {
      ...d,
      id: 'w-again',
      sections: d.sections.map((s) =>
        s.id === 'security' ? { ...s, claims: [s.claims[0]] } : s.id === 'unknowns' ? { ...s, claims: [...s.claims, { text: ` ${WHO.replace(/ /g, '  ')} `, basis: 'unknown' as const }] } : s,
      ),
      concerns: [{ id: 'c1', severity: 'low', text: 'Logs grow without a limit.', basis: 'inferred' }, { ...d.concerns[0], id: 'c2' }],
    };
    await writeDefense(dir, regenerated);
    await refused(dir, () => sendFromDefense(dir, { defenseId: 'w-again', kind: 'claim', ref: 'unknowns.1', types }), ConflictError, "That's already in Questions.");
    await refused(dir, () => sendFromDefense(dir, { defenseId: 'w-again', kind: 'concern', ref: 'c2', types }), ConflictError, "That's already in Concerns.");
    // The page shows them as sent, against this defense's parts.
    expect((await defenseLinks(dir, regenerated)).sent).toEqual([
      { kind: 'claim', ref: 'unknowns.1', itemId: claim.itemId, threadId: claim.threadId, typeId: 'questions', title: WHO, status: 'with_claude' },
      { kind: 'concern', ref: 'c2', itemId: concern.itemId, threadId: concern.threadId, typeId: 'concerns', title: RERUN, status: 'with_claude' },
    ]);
    // A part with new text still goes.
    expect((await sendFromDefense(dir, { defenseId: 'w-again', kind: 'concern', ref: 'c1', types, now: T3 })).typeTitle).toBe('Concerns');
  });

  it('refuses a known claim, a part sent before, a missing part, or a target type that is off or missing', async () => {
    const dir = await seed();
    const send = (kind: 'claim' | 'concern', ref: string, t: PlumbingType[] = types) => sendFromDefense(dir, { defenseId: 'w-test', kind, ref, types: t, now: T1 });
    await refused(dir, () => send('claim', 'security.0'), InputError, 'Only a claim marked Unknown or Verify before release can be sent to Questions.');
    await refused(dir, () => send('claim', 'security.9'), InputError, "That part of the Whiteboard Defense doesn't exist.");
    await refused(dir, () => send('concern', 'c9'), InputError, "That part of the Whiteboard Defense doesn't exist.");

    const off = types.map((t) => (t.id === 'questions' ? { ...t, enabled: false } : t));
    await refused(dir, () => send('claim', 'security.1', off), ConflictError, "There's no enabled Questions type to send it to. Turn it on in Plumbing rules.");
    const missing = types.filter((t) => t.id !== 'concerns');
    await refused(dir, () => send('concern', 'c1', missing), ConflictError, "There's no enabled Concerns type to send it to. Turn it on in Plumbing rules.");

    // Asking about a concern isn't sending it, so it can still be sent once.
    await askAboutDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c1', question: 'How likely is this?', now: T1 });
    await send('concern', 'c1');
    await send('claim', 'security.1');
    await refused(dir, () => send('concern', 'c1'), ConflictError, "That's already in Concerns.");
    await refused(dir, () => send('claim', 'security.1'), ConflictError, "That's already in Questions.");

    const empty = await seedProject();
    await refused(empty, () => sendFromDefense(empty, { defenseId: 'w-test', kind: 'claim', ref: 'security.1', types }), ConflictError, "There's no Whiteboard Defense yet.");
    await refused(
      dir,
      () => sendFromDefense(dir, { defenseId: 'w-older', kind: 'claim', ref: 'security.2', types }),
      ConflictError,
      'The Whiteboard Defense changed since this page loaded. Reload it.',
    );
  });
});

describe('the threads made from the Whiteboard Defense', () => {
  it('lists what was asked and what was sent, oldest first, for this defense only', async () => {
    const dir = await seed();
    // Asked in this order, which isn't the order of their ids.
    const earlier = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'section', ref: 'security', question: 'Why not a queue?', now: T1 });
    await submit(dir, { scope: 'thread', threadId: earlier.threadId, types, now: T1 });
    const later = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'question', ref: 'q1', question: 'And email?', now: T2 });
    const sent = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'security.1', types, now: T3 });
    // Sent from the defense before this one, which a regenerate replaced, about a part this one doesn't have.
    const old = pair('questions-from-before', { title: 'From before' });
    await writeItem(dir, { ...old.item, createdBy: 'whiteboard', fromDefense: { id: 'w-older', kind: 'claim', ref: 'security.1', text: 'Something the new defense dropped.' } });
    await writeThread(dir, old.thread);

    expect(await defenseLinks(dir, defense())).toEqual({
      asked: [
        { kind: 'section', ref: 'security', itemId: 'defense-why-not-a-queue', threadId: earlier.threadId, typeId: 'defense', title: 'Why not a queue?', status: 'with_claude' },
        { kind: 'question', ref: 'q1', itemId: 'defense-and-email', threadId: later.threadId, typeId: 'defense', title: 'And email?', status: 'draft' },
      ],
      sent: [{ kind: 'claim', ref: 'security.1', itemId: sent.itemId, threadId: sent.threadId, typeId: 'questions', title: WHO, status: 'with_claude' }],
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/defenseItems.test.ts`
Expected: FAIL, because `../src/store/defenseItems` can't be resolved ("Cannot find module '../src/store/defenseItems'").

- [ ] **Step 3: Write asking, sending and the links**

`packages/core/src/store/defenseItems.ts`:
```ts
import { DEFENSE } from '../defenseType';
import {
  BASIS_LABELS,
  DEFENSE_SECTIONS,
  displayStatus,
  SEVERITY_LABELS,
  type DefenseLink,
  type DefenseRef,
  type Item,
  type PlumbingType,
  type Severity,
  type Submission,
  type Thread,
  type WhiteboardDefense,
} from '../schemas';
import { claimAt, defensePartMarkdown } from './defenseMarkdown';
import { uniqueId } from './importItems';
import { ConflictError, InputError, newId, readItems, readThreads, touchProject, writeItem, writeSubmission, writeThread } from './io';
import { slugify } from './open';
import { readDefense } from './whiteboard';

/** Where a part of the defense is sent: a claim marked Unknown or Verify before release to Questions, a release concern to Concerns. */
export const SEND_TARGET = { claim: 'questions', concern: 'concerns' } as const;
/** A release concern's severity, in the Concerns type's own words (low, medium or high). */
export const CONCERN_SEVERITY: Record<Severity, string> = { critical: 'high', high: 'high', medium: 'medium', low: 'low', info: 'low' };

const TARGET_NAME = { questions: 'Questions', concerns: 'Concerns' } as const;
const TITLE_MAX = 120;
const SUMMARY_MAX = 300;
const SENT_LINE = 'Sent from the Whiteboard Defense.';

/** The refusal for a part (a section, claim, question, concern or checklist line) the defense doesn't have. */
export const NO_PART = "That part of the Whiteboard Defense doesn't exist.";

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);
/** A part's text as sent ones are matched: trimmed, each run of whitespace one space. */
const sameText = (text: string) => text.trim().replace(/\s+/g, ' ');
/** An item sent from a defense, which records the part's text: the kind of part and that text, as they're matched. */
const sentKey = (i: Item) => (i.type !== DEFENSE && i.createdBy === 'whiteboard' && i.fromDefense?.text !== undefined ? `${i.fromDefense.kind}:${sameText(i.fromDefense.text)}` : null);

/** The saved defense, when it's the one the page loaded (`defenseId`). Practice checks it the same way. */
export async function currentDefense(dir: string, defenseId: string): Promise<WhiteboardDefense> {
  const defense = await readDefense(dir);
  if (!defense) throw new ConflictError("There's no Whiteboard Defense yet.");
  if (defense.id !== defenseId) throw new ConflictError('The Whiteboard Defense changed since this page loaded. Reload it.');
  return defense;
}

/** What the asked item's list row says it's about. */
function askedSummary(d: WhiteboardDefense, kind: 'section' | 'question' | 'concern', ref: string): string {
  if (kind === 'section') {
    const s = DEFENSE_SECTIONS.find((x) => x.id === ref)!;
    return `About ${s.n}. ${s.title}`;
  }
  if (kind === 'question') return `About the question: ${d.questions.find((q) => q.id === ref)!.q}`;
  const c = d.concerns.find((x) => x.id === ref)!;
  return `About the ${SEVERITY_LABELS[c.severity].toLowerCase()} concern: ${c.text}`;
}

/**
 * "Ask Claude about this": a Defense item about one part of the defense (a section, a question or a release concern),
 * whose body is that part as Markdown, and an idle thread whose draft is your question. The route then sends it with
 * submit({ scope: 'thread' }), so your question is the thread's first message. Each ask makes a new thread.
 */
export async function askAboutDefense(
  dir: string,
  o: { defenseId: string; kind: 'section' | 'question' | 'concern'; ref: string; question: string; now?: Date },
): Promise<{ itemId: string; threadId: string }> {
  const now = o.now ?? new Date();
  const defense = await currentDefense(dir, o.defenseId);
  const { values: items } = await readItems(dir);
  const body = defensePartMarkdown(defense, o.kind, o.ref, { itemTitles: Object.fromEntries(items.map((i) => [i.id, i.title])) });
  if (body === null) throw new InputError(NO_PART);
  const question = o.question.trim();
  if (!question) throw new InputError('Write your message first.');
  const title = clip(question.split('\n')[0].trim(), TITLE_MAX);
  const id = uniqueId(`${DEFENSE}-${slugify(title)}`, new Set(items.map((i) => i.id)));
  const fromDefense: DefenseRef = { id: defense.id, kind: o.kind, ref: o.ref };
  const item: Item = {
    id,
    type: DEFENSE,
    title,
    summary: clip(askedSummary(defense, o.kind, o.ref), SUMMARY_MAX),
    body,
    threadId: `t-${id}`,
    createdBy: 'whiteboard',
    fromDefense,
  };
  const thread: Thread = { id: `t-${id}`, itemId: id, status: 'idle', draft: { text: question, updatedAt: now.toISOString() }, messages: [] };
  await writeItem(dir, item);
  await writeThread(dir, thread);
  return { itemId: id, threadId: thread.id };
}

/**
 * Send to Questions or Send to Concerns: a plumbing item made from a claim marked Unknown or Verify before release, or
 * from a release concern. Its thread starts with Claude, as a Plan changes thread does: a system line, and a submission
 * the service makes, which the next dp_wait hands to a window. With no message from you, the thread agent follows the
 * type's Rules and suggests answers. Each part of a defense can be sent once.
 */
export async function sendFromDefense(
  dir: string,
  o: { defenseId: string; kind: 'claim' | 'concern'; ref: string; types: PlumbingType[]; now?: Date },
): Promise<{ itemId: string; threadId: string; typeId: string; typeTitle: string }> {
  const now = o.now ?? new Date();
  const at = now.toISOString();
  const defense = await currentDefense(dir, o.defenseId);
  let text: string;
  let body: string;
  let fields: Record<string, string> | undefined;
  if (o.kind === 'claim') {
    const found = claimAt(defense, o.ref);
    if (!found) throw new InputError(NO_PART);
    if (found.claim.basis !== 'unknown' && found.claim.basis !== 'verify') {
      throw new InputError('Only a claim marked Unknown or Verify before release can be sent to Questions.');
    }
    text = found.claim.text;
    body = `From the Whiteboard Defense (${found.n}. ${found.section.title}), marked ${BASIS_LABELS[found.claim.basis]}:\n\n${text}`;
  } else {
    const concern = defense.concerns.find((c) => c.id === o.ref);
    if (!concern) throw new InputError(NO_PART);
    text = concern.text;
    body = `From the Whiteboard Defense's release concerns, marked ${SEVERITY_LABELS[concern.severity]}:\n\n${text}`;
    fields = { severity: CONCERN_SEVERITY[concern.severity] };
  }

  const target = SEND_TARGET[o.kind];
  const type = o.types.find((t) => t.id === target && t.enabled);
  if (!type) throw new ConflictError(`There's no enabled ${TARGET_NAME[target]} type to send it to. Turn it on in Plumbing rules.`);
  const { values: items } = await readItems(dir);
  // Sent before: this part of this defense, or, from any defense, a part of the same kind with the same text. A
  // regenerated defense has a new id, but the unknown it still has is the same question.
  const key = `${o.kind}:${sameText(text)}`;
  const sent = (i: Item) => (i.type !== DEFENSE && i.fromDefense?.id === defense.id && i.fromDefense.kind === o.kind && i.fromDefense.ref === o.ref) || sentKey(i) === key;
  if (items.some(sent)) throw new ConflictError(`That's already in ${type.title}.`);

  const title = clip(text.replace(/\s+/g, ' ').trim(), TITLE_MAX);
  const id = uniqueId(`${type.id}-${slugify(title)}`, new Set(items.map((i) => i.id)));
  const item: Item = {
    id,
    type: type.id,
    title,
    summary: clip(text, SUMMARY_MAX),
    body,
    ...(fields ? { fields } : {}),
    threadId: `t-${id}`,
    createdBy: 'whiteboard',
    fromDefense: { id: defense.id, kind: o.kind, ref: o.ref, text },
  };
  const thread: Thread = { id: `t-${id}`, itemId: id, status: 'with_claude', messages: [{ id: newId('m', now), at, author: 'system', text: SENT_LINE }] };
  const submission: Submission = { id: newId('s', now), at, scope: 'all', drafts: {}, sent: [thread.id], resolved: [], processedAt: at };
  await writeItem(dir, item);
  await writeThread(dir, thread);
  await writeSubmission(dir, submission);
  await touchProject(dir, now);
  return { itemId: id, threadId: thread.id, typeId: type.id, typeTitle: type.title };
}

/**
 * The threads made from this defense: `asked` are the Defense threads ("Ask Claude about this"), `sent` the items sent
 * to plumbing. An item sent from an earlier defense is listed when this one still has that part, with the same kind
 * and text, under this defense's ref for it. Other items made from an earlier defense aren't listed. Oldest first.
 */
export async function defenseLinks(dir: string, defense: WhiteboardDefense): Promise<{ asked: DefenseLink[]; sent: DefenseLink[] }> {
  const [{ values: items }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const threadById = new Map(threads.map((t) => [t.id, t]));
  // A thread starts when it's made: with its system line, or with your question as a draft until it's sent.
  const startedAt = (i: Item) => {
    const thread = threadById.get(i.threadId);
    return thread?.messages[0]?.at ?? thread?.draft?.updatedAt ?? '';
  };
  // The parts this defense can send, by kind and text, each with its ref: the first part with that text wins.
  const partRefs = new Map<string, string>();
  defense.sections.forEach((s) =>
    s.claims.forEach((c, i) => {
      const key = `claim:${sameText(c.text)}`;
      if ((c.basis === 'unknown' || c.basis === 'verify') && !partRefs.has(key)) partRefs.set(key, `${s.id}.${i}`);
    }),
  );
  for (const c of defense.concerns) if (!partRefs.has(`concern:${sameText(c.text)}`)) partRefs.set(`concern:${sameText(c.text)}`, c.id);
  const link = (i: Item, ref = i.fromDefense!.ref): DefenseLink => {
    const thread = threadById.get(i.threadId);
    return {
      kind: i.fromDefense!.kind,
      ref,
      itemId: i.id,
      threadId: i.threadId,
      typeId: i.type,
      title: i.title,
      status: thread ? displayStatus(thread) : 'idle',
    };
  };
  const oldestFirst = (a: Item, b: Item) => startedAt(a).localeCompare(startedAt(b)) || a.id.localeCompare(b.id);
  const made = items.filter((i) => i.fromDefense?.id === defense.id).sort(oldestFirst);
  const earlier = items.filter((i) => i.fromDefense !== undefined && i.fromDefense.id !== defense.id && partRefs.has(sentKey(i) ?? ''));
  const sent = [...made.filter((i) => i.type !== DEFENSE), ...earlier]
    .sort(oldestFirst)
    .map((i) => (i.fromDefense!.id === defense.id ? link(i) : link(i, partRefs.get(sentKey(i)!))));
  return { asked: made.filter((i) => i.type === DEFENSE).map((i) => link(i)), sent };
}
```

A sent unknown's thread starts with Claude, whose suggested answers often offer to change the plan. They're its first choices, like an importer's opening options, so they don't hold up Finalize until you've written in the thread. In `packages/core/src/store/checklist.ts`, in `blockingReason`, replace:
```ts
  // A proposal is a reply that offers a change. The importer's opening options are the item's first choices, not a proposal.
  const open = latestOpen(thread);
  if (open && !open.message.opening && open.options.some((o) => o.change)) return 'A proposal is waiting for your answer.';
```
with:
```ts
  // A proposal is a reply that offers a change, once you've written in the thread. The importer's opening options are
  // the item's first choices, not a proposal, and so are Claude's suggestions on a thread the service handed it with no
  // message from you (an unknown sent from the Whiteboard Defense, say). Plan changes threads were caught above.
  const open = latestOpen(thread);
  const youWrote = thread.messages.some((m) => m.author === 'you');
  if (open && !open.message.opening && youWrote && open.options.some((o) => o.change)) return 'A proposal is waiting for your answer.';
```

- [ ] **Step 4: Export it**

In `packages/core/src/index.ts`, replace:
```ts
export * from './store/defenseMarkdown';
```
with:
```ts
export * from './store/defenseMarkdown';
export * from './store/defenseItems';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/core/test/defenseItems.test.ts packages/core/test/checklist.test.ts packages/core/test/finalize.test.ts packages/core/test/defenseType.test.ts`
Expected: PASS (9 tests in `defenseItems.test.ts`). The other three pass unchanged: each thread they hold up with a proposal has a message from you.

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/store/defenseItems.ts packages/core/src/store/checklist.ts packages/core/src/index.ts packages/core/test/defenseItems.test.ts
git commit -m "feat(core): ask Claude about any part of the Whiteboard Defense, and send its unknowns and concerns to plumbing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Practice, and Export .md into a clone

This task does three things:
- **Practice** keeps your flashcard ratings and checklist ticks in `practice.json`, keyed by text, so a regenerated defense keeps what still applies. It also works out the readiness meter: half flashcards, half checklist.
- **Export .md** writes the defense into a clone you pick, as `<name>.whiteboard-defense.md` next to the plan, after Accept's own checks. The diagram section 2 names is drawn in it as Mermaid, as the final draws diagrams.
- **Those checks move** out of `accept.ts` into `store/cloneTarget.ts`, shared by both, with the action's name in the two messages that use it. Accept's behaviour and messages don't change.

**Files:**
- Create:
  - `packages/core/src/store/practice.ts`
  - `packages/core/src/store/cloneTarget.ts`
  - `packages/core/src/store/defenseExport.ts`
  - `packages/core/test/practice.test.ts`
  - `packages/core/test/defenseExport.test.ts`
- Modify:
  - `packages/core/src/store/accept.ts` (uses `cloneTarget`)
  - `packages/core/src/index.ts` (export the three new modules)
- Test:
  - `packages/core/test/practice.test.ts`
  - `packages/core/test/defenseExport.test.ts`
  - `packages/core/test/accept.test.ts` and `packages/core/test/accept-rollback.test.ts` (unchanged: they must still pass)

**Interfaces:**
- Consumes:
  - From Task 1:
    - through `../schemas`: `Practice`, `PracticeView`, `Rating`, `WhiteboardDefense` and `DefenseExport`;
    - `readPractice` (empty `{ ratings: {}, ticks: {} }` when missing or damaged), `writePractice`, `readDefense` and `writeDefense` (`store/whiteboard.ts`). `writeDefense` writes with `writeJsonAtomic` from `'../atomic'`; the rollback test fails both `writeJsonAtomic` and `writeFileAtomic` for `defense.json`, so it holds either way;
    - in the tests, `storedDefense(overrides?)`: id `w-test`, three questions `q1`–`q3` and the 20 checklist lines `k1`–`k20`.
  - From Task 4: `defenseMarkdown(d, { title, itemTitles, diagrams })`. `index.ts` ends with Task 5's `export * from './store/defenseItems';`.
  - From Task 5: `currentDefense(dir, defenseId)` and `NO_PART` (`store/defenseItems.ts`).
  - From Plans 1–5:
    - for the moved checks: `gitInfo`, `expandHome`, `normalizeRemote`, `matchProfile` and `finalName`;
    - `writeFileAtomic`, `tildify`, `readProjectFile`, `readItems`, `parseData` and `diagramMermaid` (`finalExport.ts`);
    - in the tests: `makeRepo`, `seedProject`, `pair`, `writeItem` and `tempDir`.
- Produces, as in the header's Contracts (exported from `@dev-plumbing/core`):
  ```ts
  // store/practice.ts
  export function practiceView(defense: WhiteboardDefense, practice: Practice): PracticeView;
  export async function ratePractice(dir: string, o: { defenseId: string; questionId: string; rating: Rating | null; now?: Date }): Promise<PracticeView>;
  export async function tickPractice(dir: string, o: { defenseId: string; checklistId: string; ticked: boolean; now?: Date }): Promise<PracticeView>;
  // store/cloneTarget.ts
  export type CloneVerb = 'Accept' | 'Export';
  export async function checkClone(clone: string, profile: RepoProfile, home: string | undefined): Promise<string>;
  export async function planFolder(clone: string, root: string, sourcePath: string, verb: CloneVerb): Promise<{ name: string; planRel: string; planDir: string }>;
  export async function checkTarget(clone: string, file: string, rel: string, kind: 'file' | 'folder', verb: CloneVerb): Promise<void>;
  export async function readOrNull(file: string, label: string, verb: CloneVerb = 'Accept'): Promise<Buffer | null>;
  export function within(root: string, p: string): boolean;
  // store/defenseExport.ts
  export async function exportDefense(o: { dir: string; clone: string; profile: RepoProfile; home?: string; now?: Date }): Promise<{ exportedTo: DefenseExport }>;
  ```
  `readOrNull` gains an optional `verb`, an addition to the Contracts' signature. Its message ends "Fix that, then accept again." for Accept, as today, and "Fix that, then export again." for Export.
- **Behaviour:**
  - **`practiceView`:**
    - `ratings` maps each question's id to its rating, for the questions whose trimmed text has one.
    - `ticks` are the ids of the checklist lines whose trimmed text is ticked, in checklist order.
    - `counts` holds `could`, `shaky`, `couldnt`, `unrated` (questions without a rating), `ticked` and `checklist` (all lines).
    - `readiness` is half flashcards, half checklist: `round(100 × the mean of the scores there are)`, where the cards' score is `(could + shaky / 2) / cards` and the checklist's is `ticked / lines`. With only cards, or only lines, it's that one score; with neither, 0. Ticking every line alone is 50%.
  - **`ratePractice`:**
    - It refuses as `currentDefense` does, and with InputError `NO_PART` for a question id the defense doesn't have.
    - It sets `{ rating, at }` under the question's trimmed text, or removes it when `rating` is null.
  - **`tickPractice`:**
    - It refuses the same way for a checklist id.
    - `ticked: true` sets `text -> at`, keeping the first time when the line is already ticked. `false` removes it.
  - **Both writes** keep only the keys the current defense's question texts and checklist texts have, then return `practiceView` of what they wrote. Reading never drops anything, so a regenerated defense shows what still applies straight away.
  - **`cloneTarget.ts`** holds Accept's checks, moved:
    - `checkClone` is unchanged;
    - `planFolder` is `checkPlace`'s folder checks, with the verb in the link message. It returns `{ name, planRel, planDir }`, where `planRel` is `'.'` for a plan at the top of the clone;
    - `checkTarget` puts the verb in its link message;
    - `readOrNull` and `within` are unchanged, apart from the optional verb.

    Every message is as it was, with "Accept" replaced by the verb in the two the Contracts name, and in `readOrNull`'s.
  - **`accept.ts`** imports them. Its private `checkPlace` stays, now `planFolder(…, 'Accept')` plus its two `checkTarget` calls, and the asset check passes `'Accept'` too. Its behaviour and messages are unchanged.
  - **`exportDefense`:**
    - **Refusals,** in order, none of which writes anything:
      - InputError `The ${profile.name} repo profile isn't this project's repo, ${project.repo}.` (Accept's message);
      - ConflictError "There's no Whiteboard Defense to export yet.";
      - `checkClone`'s, `planFolder`'s (verb `'Export'`), `checkTarget`'s for `<planRel>/<name>.whiteboard-defense.md` (verb `'Export'`), and `readOrNull`'s.
    - **The writes:**
      1. `defenseMarkdown(defense, { title: project.title, itemTitles, diagrams })` goes into the clone with `writeFileAtomic`, which replaces an earlier export. `diagrams` has `finalExport.ts`'s `diagramMermaid` of each item a section's `diagramItemId` names, when its data parses as a diagram, so the file draws it in a `mermaid` block under its "Diagram:" line.
      2. `writeDefense` records `exportedTo: { clone: tildify(root, home), path: path.posix.join(planRel, `${name}.whiteboard-defense.md`), at }`.
    - **When either write fails,** the clone's file is put back as it was (removed when there was none before). It then throws a ConflictError:
      - `Export didn't finish (${reason}). ${path} in ${clone} is as it was. Try again.`;
      - or, if putting it back failed, `Export didn't finish (${reason}), and ${path} in ${clone} couldn't be put back. Check it, then try again.`
    - **Nothing else is touched:** not the plan, the final, its assets or `project.json`.
    - A defense that's out of date can be exported: the file's second line says what it was generated from, and when.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/practice.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import type { Practice, WhiteboardDefense } from '../src/schemas';
import { ConflictError, InputError } from '../src/store/io';
import { practiceView, ratePractice, tickPractice } from '../src/store/practice';
import { readPractice, writeDefense } from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { seedProject, storedDefense } from './fixtures';

afterAll(removeTempDirs);

const T1 = new Date('2026-10-06T10:00:00.000Z');
const T2 = new Date('2026-10-06T11:00:00.000Z');
const EMPTY: Practice = { ratings: {}, ticks: {} };

async function seed(defense: WhiteboardDefense = storedDefense()): Promise<string> {
  const dir = await seedProject();
  await writeDefense(dir, defense);
  return dir;
}
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('practice', () => {
  it('is at 0% with nothing rated or ticked, and with no cards or lines at all', () => {
    expect(practiceView(storedDefense(), EMPTY)).toEqual({
      ratings: {},
      ticks: [],
      readiness: 0,
      counts: { could: 0, shaky: 0, couldnt: 0, unrated: 3, ticked: 0, checklist: 20 },
    });
    expect(practiceView(storedDefense({ questions: [], checklist: [] }), EMPTY).readiness).toBe(0);
  });

  it('counts a card you could explain whole, a shaky one half, and each line ticked', async () => {
    const base = storedDefense();
    const defense = storedDefense({
      questions: [1, 2, 3, 4].map((n) => ({ id: `q${n}`, q: `Question ${n}?`, a: `Answer ${n}.`, basis: 'known' as const })),
      checklist: base.checklist.slice(0, 6),
    });
    const dir = await seed(defense);
    const rate = (questionId: string, rating: 'could' | 'shaky' | 'couldnt') => ratePractice(dir, { defenseId: 'w-test', questionId, rating, now: T1 });
    await rate('q1', 'could');
    await rate('q2', 'could');
    await rate('q3', 'shaky');
    await rate('q4', 'couldnt');
    for (const id of ['k1', 'k2', 'k3']) await tickPractice(dir, { defenseId: 'w-test', checklistId: id, ticked: true, now: T1 });
    const view = await tickPractice(dir, { defenseId: 'w-test', checklistId: 'k3', ticked: true, now: T2 });
    // The cards' (2 + 0.5) / 4 = 0.625 and the checklist's 3 / 6 = 0.5, half each: round(100 × 0.5625) = 56
    expect(view).toEqual({
      ratings: { q1: 'could', q2: 'could', q3: 'shaky', q4: 'couldnt' },
      ticks: ['k1', 'k2', 'k3'],
      readiness: 56,
      counts: { could: 2, shaky: 1, couldnt: 1, unrated: 0, ticked: 3, checklist: 6 },
    });
    // Saved by text. Ticking a line again keeps when it was first ticked.
    expect(await readPractice(dir)).toEqual({
      ratings: {
        'Question 1?': { rating: 'could', at: T1.toISOString() },
        'Question 2?': { rating: 'could', at: T1.toISOString() },
        'Question 3?': { rating: 'shaky', at: T1.toISOString() },
        'Question 4?': { rating: 'couldnt', at: T1.toISOString() },
      },
      ticks: Object.fromEntries(base.checklist.slice(0, 3).map((k) => [k.text, T1.toISOString()])),
    });
  });

  it('weighs the cards and the checklist half each, or counts only the one there is', () => {
    const d = storedDefense();
    const at = T1.toISOString();
    const some: Practice = { ratings: { [d.questions[0].q]: { rating: 'could', at } }, ticks: Object.fromEntries(d.checklist.slice(0, 10).map((k) => [k.text, at])) };
    // round(100 × (1 / 3 + 10 / 20) / 2) = 42
    expect(practiceView(d, some).readiness).toBe(42);
    // Every line ticked, and no card rated, is half way.
    expect(practiceView(d, { ratings: {}, ticks: Object.fromEntries(d.checklist.map((k) => [k.text, at])) }).readiness).toBe(50);
    // With no checklist, only the cards count; with no cards, only the checklist.
    expect(practiceView(storedDefense({ checklist: [] }), some).readiness).toBe(33);
    expect(practiceView(storedDefense({ questions: [] }), some).readiness).toBe(50);
  });

  it('clears a rating with null, and unticks a line', async () => {
    const dir = await seed();
    await ratePractice(dir, { defenseId: 'w-test', questionId: 'q1', rating: 'shaky', now: T1 });
    await tickPractice(dir, { defenseId: 'w-test', checklistId: 'k20', ticked: true, now: T1 });
    expect(await ratePractice(dir, { defenseId: 'w-test', questionId: 'q1', rating: null, now: T2 })).toMatchObject({ ratings: {}, ticks: ['k20'] });
    expect(await tickPractice(dir, { defenseId: 'w-test', checklistId: 'k20', ticked: false, now: T2 })).toMatchObject({ ticks: [], readiness: 0 });
    expect(await readPractice(dir)).toEqual(EMPTY);
  });

  it("refuses a defense that changed since the page loaded, and a card or line it doesn't have", async () => {
    const dir = await seed();
    const stale = await failure(ratePractice(dir, { defenseId: 'w-older', questionId: 'q1', rating: 'could' }));
    expect(stale).toBeInstanceOf(ConflictError);
    expect((stale as Error).message).toBe('The Whiteboard Defense changed since this page loaded. Reload it.');
    await expect(tickPractice(dir, { defenseId: 'w-older', checklistId: 'k1', ticked: true })).rejects.toThrow('The Whiteboard Defense changed since this page loaded. Reload it.');
    const missing = await failure(ratePractice(dir, { defenseId: 'w-test', questionId: 'q9', rating: 'could' }));
    expect(missing).toBeInstanceOf(InputError);
    expect((missing as Error).message).toBe("That part of the Whiteboard Defense doesn't exist.");
    await expect(tickPractice(dir, { defenseId: 'w-test', checklistId: 'k99', ticked: true })).rejects.toThrow("That part of the Whiteboard Defense doesn't exist.");
    await expect(ratePractice(await seedProject(), { defenseId: 'w-test', questionId: 'q1', rating: 'could' })).rejects.toThrow("There's no Whiteboard Defense yet.");
    expect(await readPractice(dir)).toEqual(EMPTY);
  });

  it('keeps what still applies after a regenerate, and drops the rest on the next write', async () => {
    const first = storedDefense();
    const dir = await seed(first);
    for (const q of first.questions) await ratePractice(dir, { defenseId: 'w-test', questionId: q.id, rating: 'could', now: T1 });
    for (const id of ['k1', 'k2', 'k3']) await tickPractice(dir, { defenseId: 'w-test', checklistId: id, ticked: true, now: T1 });

    // Regenerated: the same 20 checklist lines, and the first question asked differently.
    const changed = 'What happens when the email provider is down?';
    const second = storedDefense({ id: 'w-again', questions: [{ ...first.questions[0], q: changed }, ...first.questions.slice(1)] });
    await writeDefense(dir, second);
    expect(practiceView(second, await readPractice(dir))).toMatchObject({
      ratings: { q2: 'could', q3: 'could' },
      ticks: ['k1', 'k2', 'k3'],
      counts: { could: 2, unrated: 1, ticked: 3 },
    });

    // The old first question's rating is still in the file until practice is written for the new defense.
    expect(Object.keys((await readPractice(dir)).ratings)).toContain(first.questions[0].q);
    await ratePractice(dir, { defenseId: 'w-again', questionId: 'q1', rating: 'shaky', now: T2 });
    expect((await readPractice(dir)).ratings).toEqual({
      [changed]: { rating: 'shaky', at: T2.toISOString() },
      [first.questions[1].q]: { rating: 'could', at: T1.toISOString() },
      [first.questions[2].q]: { rating: 'could', at: T1.toISOString() },
    });

    // A checklist line the next defense doesn't have goes too.
    const third = storedDefense({ id: 'w-third', checklist: first.checklist.slice(1) });
    await writeDefense(dir, third);
    await tickPractice(dir, { defenseId: 'w-third', checklistId: 'k4', ticked: true, now: T2 });
    expect(Object.keys((await readPractice(dir)).ticks)).toEqual([first.checklist[1].text, first.checklist[2].text, first.checklist[3].text]);
  });
});
```

`packages/core/test/defenseExport.test.ts`:
```ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Writing defense.json fails while `failing.defense` is set, so a test can make recording an export fail.
const failing = vi.hoisted(() => ({ defense: false }));
vi.mock('../src/atomic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/atomic')>();
  const fails = (file: string) => failing.defense && file.endsWith(path.join('whiteboard', 'defense.json'));
  return {
    ...actual,
    writeFileAtomic: (file: string, data: string | Uint8Array, mode?: number) =>
      fails(file) ? Promise.reject(new Error('No space left on device')) : actual.writeFileAtomic(file, data, mode),
    writeJsonAtomic: (file: string, value: unknown) => (fails(file) ? Promise.reject(new Error('No space left on device')) : actual.writeJsonAtomic(file, value)),
  };
});

import { diagramMermaid } from '../src/finalExport';
import { repoProfileSchema, type DiagramData } from '../src/schemas';
import { exportDefense } from '../src/store/defenseExport';
import { defenseMarkdown } from '../src/store/defenseMarkdown';
import { ConflictError, InputError, writeItem } from '../src/store/io';
import { tildify } from '../src/store/open';
import { readDefense, writeDefense } from '../src/store/whiteboard';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';
import { makeRepo, pair, seedProject, storedDefense } from './fixtures';

afterAll(removeTempDirs);

const PLAN = 'docs/specs/restock.md';
const TARGET = 'docs/specs/restock.whiteboard-defense.md';
const profile = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'] });
const T1 = new Date('2026-10-06T10:00:00.000Z');
const T2 = new Date('2026-10-06T11:00:00.000Z');

const git = (clone: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Acme', '-c', 'user.email=dev@acme.test', '-c', 'commit.gpgsign=false', ...args], { cwd: clone, encoding: 'utf8' });

/** A clone of acme with the plan, an earlier final and its mockups committed, and its plumbing project with a defense. */
async function setup(o: { remote?: string | null; plan?: string } = {}): Promise<{ dir: string; clone: string }> {
  const plan = o.plan ?? PLAN;
  const clone = makeRepo({ plan, remote: o.remote });
  const folder = path.join(clone, path.dirname(plan));
  await fs.writeFile(path.join(folder, 'restock.final.md'), '# Restock reminders\n\nThe final.\n');
  await fs.mkdir(path.join(folder, 'restock.assets'));
  await fs.writeFile(path.join(folder, 'restock.assets', 'ui-card.after.html'), '<p>Soon</p>\n');
  git(clone, 'add', '-A');
  git(clone, 'commit', '-q', '-m', 'The plan and its final');
  const dir = await seedProject({ project: { source: { path: plan, clone, branch: 'main', hashAtImport: 'x' } } });
  await writeDefense(dir, storedDefense());
  return { dir, clone };
}

/** Every file and folder under these folders (except .git), with each file's text and each link's target. */
async function snapshot(...roots: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.name === '.git') continue;
      if (entry.isSymbolicLink()) {
        out[p] = `link to ${await fs.readlink(p)}`;
      } else if (entry.isDirectory()) {
        out[p] = 'folder';
        await walk(p);
      } else {
        out[p] = await fs.readFile(p, 'utf8');
      }
    }
  };
  for (const root of new Set(roots)) await walk(root);
  return out;
}

const read = (...parts: string[]) => fs.readFile(path.join(...parts), 'utf8');
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('exporting the Whiteboard Defense', () => {
  it('export writes one file next to the plan and nothing else', async () => {
    const { dir, clone } = await setup();
    const before = await snapshot(clone);
    const defense = (await readDefense(dir))!;

    const result = await exportDefense({ dir, clone, profile, now: T1 });
    const exportedTo = { clone: tildify(clone), path: TARGET, at: T1.toISOString() };
    expect(result).toEqual({ exportedTo });
    expect(await read(clone, TARGET)).toBe(defenseMarkdown(defense, { title: 'Restock reminders' }));
    // The only change in the clone is the new file: the plan, the final and its mockups are as they were.
    expect(git(clone, 'status', '--porcelain')).toBe(`?? ${TARGET}\n`);
    expect(await snapshot(clone)).toEqual({ ...before, [path.join(clone, TARGET)]: await read(clone, TARGET) });
    // The defense records where it went, and is otherwise as it was.
    expect(await readDefense(dir)).toEqual({ ...defense, exportedTo });
  });

  it('puts the file at the top of the clone when the plan is there, and reads ~ with the home it is given', async () => {
    const { dir, clone } = await setup({ plan: 'restock.md' });
    const home = path.dirname(clone);
    const tilde = `~/${path.basename(clone)}`;
    const { exportedTo } = await exportDefense({ dir, clone: tilde, profile, home, now: T1 });
    expect(exportedTo).toEqual({ clone: tilde, path: 'restock.whiteboard-defense.md', at: T1.toISOString() });
    expect(await read(clone, 'restock.whiteboard-defense.md')).toMatch(/^# Whiteboard Defense: Restock reminders\n/);
  });

  it('draws the diagram that section 2 names as Mermaid, for a reader of the repo', async () => {
    const { dir, clone } = await setup();
    const DIAGRAM: DiagramData = {
      kind: 'system',
      groups: [],
      nodes: [
        { id: 'job', label: 'Reminder job', status: 'new' },
        { id: 'db', label: 'Postgres', status: 'unchanged' },
      ],
      edges: [{ id: 'e1', from: 'job', to: 'db', label: 'reads' }],
    };
    await writeItem(dir, { ...pair('architecture-system', { type: 'architecture', title: 'System view' }).item, data: DIAGRAM });
    const base = storedDefense();
    const defense = storedDefense({ sections: base.sections.map((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-system' } : s)) });
    await writeDefense(dir, defense);
    await exportDefense({ dir, clone, profile, now: T1 });
    const written = await read(clone, TARGET);
    const diagrams = { 'architecture-system': diagramMermaid(DIAGRAM) };
    expect(written).toBe(defenseMarkdown(defense, { title: 'Restock reminders', itemTitles: { 'architecture-system': 'System view' }, diagrams }));
    expect(written).toContain('Diagram: System view (in dev-plumbing).\n\n```mermaid\nflowchart LR\n');
  });

  it('overwrites an earlier export', async () => {
    const { dir, clone } = await setup();
    await exportDefense({ dir, clone, profile, now: T1 });
    const regenerated = storedDefense({ id: 'w-again', level: 3, generatedAt: T2.toISOString() });
    await writeDefense(dir, regenerated);
    const { exportedTo } = await exportDefense({ dir, clone, profile, now: T2 });
    expect(exportedTo.at).toBe(T2.toISOString());
    expect(await read(clone, TARGET)).toBe(defenseMarkdown(regenerated, { title: 'Restock reminders' }));
    expect(await read(clone, TARGET)).toContain('Level 3 (High risk).');
  });

  it('refuses anywhere but the plan folder of a clone of this repo, and with no defense, writing nothing', async () => {
    const outside = await fs.realpath(tempDir('dp-outside-'));
    await fs.writeFile(path.join(outside, 'notes.md'), 'Mine.\n');
    await fs.mkdir(path.join(outside, 'specs'));
    const specs = (clone: string) => path.join(clone, 'docs', 'specs');
    const cases: { name: string; remote?: string | null; target: (clone: string, dir: string) => Promise<string>; error: RegExp; kind?: typeof ConflictError }[] = [
      {
        name: 'a folder that is not a git clone',
        target: async () => {
          const plain = await fs.realpath(tempDir('dp-plain-'));
          await fs.mkdir(path.join(plain, 'docs', 'specs'), { recursive: true });
          return plain;
        },
        error: /isn't a git clone\. Copy into a clone of acme\./,
      },
      { name: 'a folder inside the clone', target: async (c) => path.join(c, 'docs'), error: /docs is a folder inside a clone\. Pick the clone itself\./ },
      {
        name: 'a plan folder that links outside the clone',
        target: async (c) => {
          await fs.rm(specs(c), { recursive: true });
          await fs.symlink(path.join(outside, 'specs'), specs(c));
          return c;
        },
        error: /^docs\/specs in .+ is or goes through a link\. Export writes only into real folders inside the clone\.$/,
      },
      {
        name: 'a target that is a link',
        target: async (c) => {
          await fs.symlink(path.join(outside, 'notes.md'), path.join(c, TARGET));
          return c;
        },
        error: /^docs\/specs\/restock\.whiteboard-defense\.md in .+ is a link\. Export won't write through it: remove the link, then export again\.$/,
      },
      { name: 'a clone of another repo', remote: 'git@github.com:acme/other.git', target: async (c) => c, error: /is a clone of github\.com\/acme\/other, not github\.com\/acme\/acme\./ },
      {
        name: 'no defense',
        target: async (c, dir) => {
          await fs.rm(path.join(dir, 'whiteboard'), { recursive: true });
          return c;
        },
        error: /^There's no Whiteboard Defense to export yet\.$/,
        kind: ConflictError,
      },
    ];
    for (const c of cases) {
      const { dir, clone } = await setup({ remote: c.remote });
      const target = await c.target(clone, dir);
      const before = await snapshot(dir, clone, target, outside);
      const error = await failure(exportDefense({ dir, clone: target, profile, now: T1 }));
      expect(error, c.name).toBeInstanceOf(c.kind ?? InputError);
      expect((error as Error).message, c.name).toMatch(c.error);
      // Nothing was written anywhere: not the project folder, the clone, or outside it.
      expect(await snapshot(dir, clone, target, outside), c.name).toEqual(before);
    }
  });

  it('puts the file back as it was when recording the export fails', async () => {
    const { dir, clone } = await setup();
    const defense = await read(dir, 'whiteboard', 'defense.json');
    failing.defense = true;
    try {
      // With no earlier export, the new file is removed again.
      const first = await failure(exportDefense({ dir, clone, profile, now: T1 }));
      expect(first).toBeInstanceOf(ConflictError);
      expect((first as Error).message).toMatch(/^Export didn't finish \(No space left on device\)\. docs\/specs\/restock\.whiteboard-defense\.md in .+ is as it was\. Try again\.$/);
      expect(await fs.lstat(path.join(clone, TARGET)).catch(() => null)).toBeNull();

      // With one, it's put back.
      await fs.writeFile(path.join(clone, TARGET), 'An earlier export.\n');
      expect(await failure(exportDefense({ dir, clone, profile, now: T2 }))).toBeInstanceOf(ConflictError);
      expect(await read(clone, TARGET)).toBe('An earlier export.\n');
    } finally {
      failing.defense = false;
    }
    expect(await read(dir, 'whiteboard', 'defense.json')).toBe(defense);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/practice.test.ts packages/core/test/defenseExport.test.ts`
Expected: FAIL (both files), because `../src/store/practice` and `../src/store/defenseExport` can't be resolved ("Cannot find module").

- [ ] **Step 3: Write practice**

`packages/core/src/store/practice.ts`:
```ts
import type { Practice, PracticeView, Rating, WhiteboardDefense } from '../schemas';
import { currentDefense, NO_PART } from './defenseItems';
import { InputError } from './io';
import { readPractice, writePractice } from './whiteboard';

// Practice is kept by text, not by id: a regenerated defense numbers its questions afresh, but a question it asks again,
// or a checklist line it still has, keeps your rating or tick.
const keyOf = (text: string) => text.trim();
const has = (record: Record<string, unknown>, key: string) => Object.hasOwn(record, key);

/** Your ratings and ticks for this defense, the counts, and readiness (Decision 8). */
export function practiceView(defense: WhiteboardDefense, practice: Practice): PracticeView {
  const ratings: Record<string, Rating> = {};
  for (const q of defense.questions) if (has(practice.ratings, keyOf(q.q))) ratings[q.id] = practice.ratings[keyOf(q.q)].rating;
  const ticks = defense.checklist.filter((k) => has(practice.ticks, keyOf(k.text))).map((k) => k.id);
  const rated = Object.values(ratings);
  const counts = {
    could: rated.filter((r) => r === 'could').length,
    shaky: rated.filter((r) => r === 'shaky').length,
    couldnt: rated.filter((r) => r === 'couldnt').length,
    unrated: defense.questions.length - rated.length,
    ticked: ticks.length,
    checklist: defense.checklist.length,
  };
  // Half the cards, half the checklist. The cards' score counts a card you could explain whole and a shaky one half;
  // the checklist's, each line ticked. With only one of them it's that one, and with neither 0.
  const scores = [
    ...(defense.questions.length ? [(counts.could + counts.shaky / 2) / defense.questions.length] : []),
    ...(defense.checklist.length ? [counts.ticked / defense.checklist.length] : []),
  ];
  const readiness = scores.length ? Math.round((100 * scores.reduce((a, b) => a + b, 0)) / scores.length) : 0;
  return { ratings, ticks, readiness, counts };
}

/** Practice with only the questions and checklist lines this defense still has. */
function kept(defense: WhiteboardDefense, practice: Practice): Practice {
  const questions = new Set(defense.questions.map((q) => keyOf(q.q)));
  const lines = new Set(defense.checklist.map((k) => keyOf(k.text)));
  return {
    ratings: Object.fromEntries(Object.entries(practice.ratings).filter(([key]) => questions.has(key))),
    ticks: Object.fromEntries(Object.entries(practice.ticks).filter(([key]) => lines.has(key))),
  };
}

/** Rates a flashcard, or clears its rating with null. */
export async function ratePractice(dir: string, o: { defenseId: string; questionId: string; rating: Rating | null; now?: Date }): Promise<PracticeView> {
  const defense = await currentDefense(dir, o.defenseId);
  const question = defense.questions.find((q) => q.id === o.questionId);
  if (!question) throw new InputError(NO_PART);
  const key = keyOf(question.q);
  const practice = await readPractice(dir);
  const { [key]: _earlier, ...ratings } = practice.ratings;
  const next = kept(defense, { ...practice, ratings: o.rating === null ? ratings : { ...ratings, [key]: { rating: o.rating, at: (o.now ?? new Date()).toISOString() } } });
  await writePractice(dir, next);
  return practiceView(defense, next);
}

/** Ticks or unticks a checklist line. A line ticked again keeps when it was first ticked. */
export async function tickPractice(dir: string, o: { defenseId: string; checklistId: string; ticked: boolean; now?: Date }): Promise<PracticeView> {
  const defense = await currentDefense(dir, o.defenseId);
  const line = defense.checklist.find((k) => k.id === o.checklistId);
  if (!line) throw new InputError(NO_PART);
  const key = keyOf(line.text);
  const practice = await readPractice(dir);
  const { [key]: earlier, ...ticks } = practice.ticks;
  const next = kept(defense, { ...practice, ticks: o.ticked ? { ...ticks, [key]: earlier ?? (o.now ?? new Date()).toISOString() } : ticks });
  await writePractice(dir, next);
  return practiceView(defense, next);
}
```

- [ ] **Step 4: Move Accept's clone checks into `cloneTarget.ts`**

`packages/core/src/store/cloneTarget.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { gitInfo } from '../git';
import { expandHome } from '../paths';
import { normalizeRemote, type RepoProfile } from '../schemas';
import { finalName } from './finalize';
import { InputError } from './io';
import { matchProfile } from './open';

// The checks made before anything is written into a clone, shared by Accept (the final) and Export .md (the Whiteboard
// Defense): the clone is a clone of this repo, picked by its root; the file goes in the plan's own folder, really inside
// it; and nothing is written through a link. `verb` names the action in the messages that say what to do next.

export type CloneVerb = 'Accept' | 'Export';

/** What's at p, without following a link, or null when nothing is. */
const lstat = (p: string) => fs.lstat(p).catch(() => null);

/** A file's contents, or null when there is no such file. Any other failure to read it stops the action before it writes. */
export async function readOrNull(file: string, label: string, verb: CloneVerb = 'Accept'): Promise<Buffer | null> {
  try {
    return await fs.readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new InputError(`${label} couldn't be read (${error instanceof Error ? error.message : String(error)}). Fix that, then ${verb.toLowerCase()} again.`);
  }
}

/** p is root, or inside it. */
export function within(root: string, p: string): boolean {
  const rel = path.relative(root, p);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** The clone's real path, once it's known to be the top of a git clone whose remote is one of the profile's. */
export async function checkClone(clone: string, profile: RepoProfile, home: string | undefined): Promise<string> {
  if (!(clone === '~' || clone.startsWith('~/') || path.isAbsolute(clone))) throw new InputError('Pick a clone by its full path.');
  const root = await fs.realpath(expandHome(clone, home)).catch(() => null);
  const stat = root ? await fs.stat(root).catch(() => null) : null;
  if (!root || !stat?.isDirectory()) throw new InputError(`${clone} isn't a folder on this Mac.`);
  const git = await gitInfo(root).catch(() => null);
  if (!git) throw new InputError(`${clone} isn't a git clone. Copy into a clone of ${profile.name}.`);
  if ((await fs.realpath(git.root).catch(() => git.root)) !== root) throw new InputError(`${clone} is a folder inside a clone. Pick the clone itself.`);
  if (!matchProfile(git.remote, [profile])) {
    const wanted = profile.match.map(normalizeRemote).join(' or ');
    throw new InputError(
      git.remote ? `${clone} is a clone of ${normalizeRemote(git.remote)}, not ${wanted}.` : `${clone} has no git remote, so it can't be checked against ${wanted}.`,
    );
  }
  return root;
}

/**
 * The plan's own folder in the clone, where both <name>.final.md and <name>.whiteboard-defense.md go. It must really be
 * inside the clone, with no link anywhere on the way, so a link can't send a file somewhere else. `name` is the plan
 * file's name without its extension, and `planRel` the folder relative to the clone ('.' at the top).
 */
export async function planFolder(clone: string, root: string, sourcePath: string, verb: CloneVerb): Promise<{ name: string; planRel: string; planDir: string }> {
  const name = finalName(sourcePath);
  const planRel = path.posix.dirname(sourcePath);
  const planDir = path.resolve(root, planRel);
  if (!name || !within(root, planDir)) throw new InputError(`The plan's path, ${sourcePath}, doesn't give a place inside the clone for the copy.`);
  const real = await fs.realpath(planDir).catch(() => null);
  if (!real) throw new InputError(`${clone} has no ${planRel} folder, where the plan lives.`);
  if (real !== planDir) throw new InputError(`${planRel} in ${clone} is or goes through a link. ${verb} writes only into real folders inside the clone.`);
  if (!(await fs.stat(planDir)).isDirectory()) throw new InputError(`${planRel} in ${clone} isn't a folder.`);
  return { name, planRel, planDir };
}

/** A target may be missing, or be a real file (or folder). A link is never written through, wherever it points. */
export async function checkTarget(clone: string, file: string, rel: string, kind: 'file' | 'folder', verb: CloneVerb): Promise<void> {
  const stat = await lstat(file);
  if (!stat) return;
  if (stat.isSymbolicLink()) throw new InputError(`${rel} in ${clone} is a link. ${verb} won't write through it: remove the link, then ${verb.toLowerCase()} again.`);
  if (kind === 'file' ? !stat.isFile() : !stat.isDirectory()) throw new InputError(`${rel} in ${clone} isn't a ${kind}.`);
}
```

- [ ] **Step 5: Accept uses the shared checks**

In `packages/core/src/store/accept.ts`:
- Replace the imports:
```ts
import { mockupAssetHtml, mockupAssetName } from '../finalExport';
import { gitInfo } from '../git';
import { expandHome } from '../paths';
import { dataKindOf, normalizeRemote, parseData, type PlumbingProject, type PlumbingType, type RepoProfile } from '../schemas';
import { discardProposal, finalInputsHash, finalName, readFinalize } from './finalize';
import { ConflictError, docPath, InputError, readItems, readProjectFile, writeProjectFile } from './io';
import { matchProfile, tildify } from './open';
```
with:
```ts
import { mockupAssetHtml, mockupAssetName } from '../finalExport';
import { expandHome } from '../paths';
import { dataKindOf, parseData, type PlumbingProject, type PlumbingType, type RepoProfile } from '../schemas';
import { checkClone, checkTarget, planFolder, readOrNull, within } from './cloneTarget';
import { discardProposal, finalInputsHash, readFinalize } from './finalize';
import { ConflictError, docPath, InputError, readItems, readProjectFile, writeProjectFile } from './io';
import { tildify } from './open';
```
- Replace everything from the line `const quiet = () => undefined;` down to, but not including, the line `/** Each mockup the final links to, as a plain HTML file with the item's markup. One file per item and side. */`. That's `quiet`, `lstat`, `readOrNull`, `within`, `checkClone`, `checkTarget` and `checkPlace`. Replace it with:
```ts
const quiet = () => undefined;
/** What's at p, without following a link, or null when nothing is. */
const lstat = (p: string) => fs.lstat(p).catch(() => null);

/**
 * Where the copy goes: <name>.final.md and <name>.assets/, in the plan's own folder (planFolder checks that it's really
 * inside the clone). Neither may be a link.
 */
async function checkPlace(clone: string, root: string, sourcePath: string): Promise<Place> {
  const { name, planRel, planDir } = await planFolder(clone, root, sourcePath, 'Accept');
  const place: Place = {
    finalRel: path.posix.join(planRel, `${name}.final.md`),
    finalFile: path.join(planDir, `${name}.final.md`),
    assetsRel: path.posix.join(planRel, `${name}.assets`),
    assetsDir: path.join(planDir, `${name}.assets`),
  };
  await checkTarget(clone, place.finalFile, place.finalRel, 'file', 'Accept');
  await checkTarget(clone, place.assetsDir, place.assetsRel, 'folder', 'Accept');
  return place;
}
```
- In `acceptFinal`, replace:
```ts
  for (const a of assets) await checkTarget(o.clone, path.join(place.assetsDir, a.name), `${place.assetsRel}/${a.name}`, 'file');
```
with:
```ts
  for (const a of assets) await checkTarget(o.clone, path.join(place.assetsDir, a.name), `${place.assetsRel}/${a.name}`, 'file', 'Accept');
```
Nothing else in `accept.ts` changes. `acceptFinal` still calls `checkClone`, `readOrNull` and `within`, now imported from `cloneTarget.ts`, and its own `checkPlace`. Its messages are as before.

- [ ] **Step 6: Write Export .md**

`packages/core/src/store/defenseExport.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../atomic';
import { diagramMermaid } from '../finalExport';
import { parseData, type DefenseExport, type RepoProfile } from '../schemas';
import { checkClone, checkTarget, planFolder, readOrNull } from './cloneTarget';
import { defenseMarkdown } from './defenseMarkdown';
import { ConflictError, InputError, readItems, readProjectFile } from './io';
import { tildify } from './open';
import { readDefense, writeDefense } from './whiteboard';

/**
 * Export .md: writes the Whiteboard Defense as Markdown into a clone, as <name>.whiteboard-defense.md in the plan's own
 * folder, next to where Accept puts <name>.final.md, then records where on the defense (exportedTo). It writes that one
 * file and nothing else, after Accept's checks: a clone of this repo picked by its root, the plan's folder really inside
 * it, and no link on the way. An earlier export there is overwritten. A defense that's out of date can be exported: the
 * file says what it was generated from and when. If recording fails, the file is put back as it was. `home` is the home
 * folder for `~` paths, as for Accept. The service runs it under the project's lock.
 */
export async function exportDefense(o: { dir: string; clone: string; profile: RepoProfile; home?: string; now?: Date }): Promise<{ exportedTo: DefenseExport }> {
  const at = (o.now ?? new Date()).toISOString();
  const project = await readProjectFile(o.dir);
  if (o.profile.name !== project.repo) throw new InputError(`The ${o.profile.name} repo profile isn't this project's repo, ${project.repo}.`);
  const defense = await readDefense(o.dir);
  if (!defense) throw new ConflictError("There's no Whiteboard Defense to export yet.");

  const root = await checkClone(o.clone, o.profile, o.home);
  const { name, planRel, planDir } = await planFolder(o.clone, root, project.source.path, 'Export');
  const rel = path.posix.join(planRel, `${name}.whiteboard-defense.md`);
  const file = path.join(planDir, `${name}.whiteboard-defense.md`);
  await checkTarget(o.clone, file, rel, 'file', 'Export');
  // What was there before, read now so an unreadable file stops Export before it writes, and a failure can put it back.
  const before = await readOrNull(file, rel, 'Export');
  const { values: items } = await readItems(o.dir);
  // The diagram a section names, drawn as Mermaid as the final draws it, for a reader of the repo who can't see
  // dev-plumbing. An item that no longer has a diagram is only named.
  const diagrams: Record<string, string> = {};
  for (const s of defense.sections) {
    const item = s.diagramItemId ? items.find((i) => i.id === s.diagramItemId) : undefined;
    const parsed = item ? parseData('diagram', item.data) : null;
    if (item && parsed?.ok) diagrams[item.id] = diagramMermaid(parsed.data);
  }
  const markdown = defenseMarkdown(defense, { title: project.title, itemTitles: Object.fromEntries(items.map((i) => [i.id, i.title])), diagrams });
  const exportedTo: DefenseExport = { clone: tildify(root, o.home), path: rel, at };

  let written = false;
  try {
    await writeFileAtomic(file, markdown);
    written = true;
    await writeDefense(o.dir, { ...defense, exportedTo });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const putBack = !written || (await (before === null ? fs.rm(file, { force: true }) : writeFileAtomic(file, before)).then(() => true, () => false));
    throw new ConflictError(
      putBack
        ? `Export didn't finish (${reason}). ${rel} in ${o.clone} is as it was. Try again.`
        : `Export didn't finish (${reason}), and ${rel} in ${o.clone} couldn't be put back. Check it, then try again.`,
    );
  }
  return { exportedTo };
}
```

- [ ] **Step 7: Export them**

In `packages/core/src/index.ts`, replace:
```ts
export * from './store/defenseItems';
```
with:
```ts
export * from './store/defenseItems';
export * from './store/practice';
export * from './store/cloneTarget';
export * from './store/defenseExport';
```

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run packages/core/test/practice.test.ts packages/core/test/defenseExport.test.ts packages/core/test/accept.test.ts packages/core/test/accept-rollback.test.ts`
Expected: PASS (6, 6, 12 and 1 tests). The two Accept files are unchanged.

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/store/practice.ts packages/core/src/store/cloneTarget.ts packages/core/src/store/defenseExport.ts packages/core/src/store/accept.ts packages/core/src/index.ts packages/core/test/practice.test.ts packages/core/test/defenseExport.test.ts
git commit -m "feat(core): practise with flashcards and the checklist, and export the defense next to the plan" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The service hands the request to Claude and saves the defense

A requested Whiteboard Defense now reaches a listening window. `dp_wait` hands it out after any submissions and any requested finalize, as `kind: 'whiteboard'`. The whiteboard subagent reads its pack through `/context { whiteboard: true }`, which names the rules file to Read (the user's, or the shipped one), and sends the defense through the new `POST /api/claude/whiteboard`, which copies that rules file's checklist into it. As for Finalize, a window that comes back without a defense fails its request, with the subagent's own `Failed: …` line when the window passes it on, and a window that went away has its request put back in the queue, by `/wait` and by `/open`.

**Files:**
- Create:
  - `packages/service/test/whiteboardSetup.ts` (the setup the Whiteboard Defense's service tests share; Task 8 reuses it)
  - `packages/service/test/whiteboard.test.ts`
- Modify:
  - `packages/service/src/routes/claude.ts` (`/open`, `/wait`, `/context`, and the new `/whiteboard`)
- Test:
  - `packages/service/test/whiteboard.test.ts`

**Interfaces:**
- Consumes (from `@dev-plumbing/core`, except the fixtures):
  - From Task 1:
    - `readWhiteboardRequest(dir): Promise<WhiteboardRequest | null>` and `readDefense(dir): Promise<WhiteboardDefense | null>`;
    - the `WhiteboardRequest` and `DefenseInput` types;
    - `validDefenseInput(): DefenseInput` from `packages/core/test/fixtures.ts`: all ten sections with claims, three questions, two concerns (one `high`, one `info`) and the 20 checklist lines. It sets no `diagramItemId`; the tests add one.
  - From Task 3:
    - `requestWhiteboard(dir, o?)`, which refuses with ConflictError "The plan is still importing. Generate the Whiteboard Defense once that's done." and "The Whiteboard Defense is already being written.";
    - `pickUpWhiteboard(dir, windowId, now?)`, which records `pickedUpBy`, `inputsHash` and `basedOn: { doc, version }`;
    - `saveDefense(dir, { requestId, defense, types, checklist?, now? })`: ConflictError `There's no Whiteboard Defense request ${id} waiting for a defense.` for any request that isn't writing; InputError from `nothingSaved(problems, 'call dp_whiteboard again with the whole defense')`, with the header's problem lines, such as `sections: summary is missing.`. `checklist`, when it has lines, is the defense's checklist; otherwise the payload's is needed (`checklist: the rules file has no checklist, so send one.`);
    - `checklistLines(rules)`, the rules file's `[ ]` lines;
    - `finishWhiteboard(dir, { requestId, windowId, error?, now? })`, which fails a writing request with `error` (cut to 500) or "The whiteboard subagent didn't send a Whiteboard Defense.";
    - `requeueWhiteboard(dir, isAlive, now?)` and `cancelWhiteboard(dir)`;
    - `ProjectHome.defense: { ready, stale, state }`, which `loadProjectHome` fills, so `GET /api/projects/:repo/:id` has it.
  - From Task 4: `whiteboardPack({ dir, types, profile, rulesFile }): Promise<WhiteboardPack>`, whose `project.name`, `rulesFile`, `basedOn`, `documentFile`, `items[].data` and `items[].file`, `sensitiveData`, `sections`, `diagramItemIds` and `previous` the tests read.
  - From Plans 1–5:
    - core: `readProjectFile`, `writeProjectFile`, `writeJsonAtomic`;
    - service: `locateProject`, `handle`, `projectKey`, `rt.withLock`, `rt.listeners`, `changed(ref)`;
    - tests: `makeContext`, `call`, `DEFAULTS_DIR` and `removeTempDirs` from `service/test/helpers.ts`, and `makeRepo` from the core fixtures.
- Produces:
  - **`POST /api/claude/wait`:**
    - `finished` gains `whiteboard?: string`, the request id, and `whiteboardError?: string`, the subagent's `Failed: …` line when it gave up.
    - **Coming back.** Under the project lock, right after the finalize back-check, a `writing` request this window picked up fails with `finishWhiteboard`, unless this call overlaps an older wait of the same window and doesn't name the request in `finished.whiteboard`. When `finished.whiteboard` names it, `finished.whiteboardError` is passed as `error`, so the page shows the subagent's own reason. So the page never stays on "Claude is writing the Whiteboard Defense."
    - **Requeueing.** `requeueWhiteboard(ref.dir, isAlive)` runs right after `requeueFinalize`, with the same liveness rule.
    - **Handing out.** Submissions first, then a requested finalize, then `pickUpWhiteboard`. A picked request returns `{ kind: 'whiteboard', request: <request id>, model: cfg.agents.models.whiteboard, next }`, with `next` as the header's exact copy. As for the other kinds, the window is marked busy and the browser is told.
  - **`POST /api/claude/open`** calls `requeueWhiteboard(ref.dir, isAlive)` right after each of its two `requeueFinalize` calls.
  - **`POST /api/claude/context`:**
    - `whiteboard: true` returns `whiteboardPack({ dir, types: cfg.types, profile, rulesFile: await whiteboardRulesFile() })`.
    - `whiteboardRulesFile()` is the absolute path of `outputs/whiteboard-defense.md` in the config folder, or of the shipped default when the user's copy is missing, as `finalizeRules` picks. The subagent Reads it: the pack carries no rules text.
    - With none of the four, the 400 says "Give threadId (for a thread), importType (for an importer), finalize: true (for the finalizer) or whiteboard: true (for the whiteboard subagent)."
  - **`POST /api/claude/whiteboard`:**
    - The body is `projectBody.extend({ request: z.string().min(1), defense: z.unknown() })`: `saveDefense` checks the defense, in its own words.
    - It reads the same rules file `/context` names, and takes its checklist with `checklistLines` (none if it can't be read).
    - Under the project lock it calls `saveDefense(ref.dir, { requestId: body.request, defense: body.defense, types: cfg.types, checklist })`, then `changed(ref)`. So the defense's checklist is the rules file's, word for word, and the payload's counts only when the rules have none.
    - It returns `{ ok: true, request, level, questions, concerns, next }`. `questions` and `concerns` are counts, and `next` is "Saved. The user reads it in the app. Reply with your one line."
    - A refused defense is a 400 listing every problem. A request that isn't writing is a 409.
  - **`packages/service/test/whiteboardSetup.ts`** exports `setup(o?: { now?: () => number })`, `Setup`, `Json`, `P`, `PLAN`, `base` and `DIAGRAM`. Its project has the architecture item `architecture-reminders`, drawn as a diagram, and the question `questions-days`.

- [ ] **Step 1: Write the failing tests**

The shared setup, `packages/service/test/whiteboardSetup.ts`. It isn't a `.test.ts` file, so Vitest doesn't run it on its own:
```ts
import path from 'node:path';
import { writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { makeRepo } from '../../core/test/fixtures';
import { call, makeContext } from './helpers';

// The setup the Whiteboard Defense's service tests share. Each test file still calls afterAll(removeTempDirs).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;
export const P = '/api/projects/acme-app/restock-reminders';
export const PLAN = 'docs/specs/restock-reminders.md';
export const base = { repo: 'acme-app', project: 'restock-reminders' };
/** The architecture item's drawing: the one diagram a defense's Whiteboard diagram section may name. */
export const DIAGRAM = {
  kind: 'system',
  nodes: [
    { id: 'job', label: 'Daily reminder job', status: 'new' },
    { id: 'db', label: 'Subscriptions table', status: 'unchanged' },
  ],
  edges: [{ id: 'reads', from: 'job', to: 'db', label: 'reads' }],
};
const ITEMS: Record<string, unknown[]> = {
  architecture: [{ key: 'reminders', title: 'Reminder job', summary: 'A daily job sends the reminders.', data: DIAGRAM }],
  questions: [{ key: 'days', title: 'How many days before?', summary: 'Lead time.', message: { text: 'How many days?' } }],
};

/**
 * A clone, its repo profile, and a plumbing project with an architecture diagram (architecture-reminders) and a question
 * (questions-days). Every other type has no changes. `now` is the windows' clock.
 */
export async function setup(o: { now?: () => number } = {}) {
  const s = await makeContext();
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
  await writeJsonAtomic(path.join(s.ctx.configDir, 'repos', 'acme-app.json'), { name: 'acme-app', match: ['github.com/acme/acme-app'] });
  const rt = createRuntime({ now: o.now });
  const app = createApp(s.ctx, rt);
  const send = async (method: string, route: string, body?: unknown): Promise<{ status: number; body: Json }> => {
    const res = await call(app, route, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  const claude = (route: string, body: unknown) => send('POST', `/api/claude${route}`, body);
  const open = await claude('/open', { cwd: repo, plan: PLAN, windowId: 'w-a' });
  for (const type of open.body.importTypes as { id: string }[]) {
    const list = ITEMS[type.id];
    const r = await claude('/items', { ...base, type: type.id, ...(list ? { items: list } : { noChanges: 'None.' }) });
    if (r.status !== 200) throw new Error(`${type.id}: ${r.body.error}`);
  }
  return { ...s, rt, app, send, claude, repo, dir: path.join(s.root, 'acme-app', 'restock-reminders') };
}
export type Setup = Awaited<ReturnType<typeof setup>>;
```

`packages/service/test/whiteboard.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cancelWhiteboard, readDefense, readProjectFile, readWhiteboardRequest, requestWhiteboard, writeProjectFile, type DefenseInput } from '@dev-plumbing/core';
import { validDefenseInput } from '../../core/test/fixtures';
import { DEFAULTS_DIR, removeTempDirs } from './helpers';
import { base, P, setup, type Json } from './whiteboardSetup';

afterAll(removeTempDirs);

const GAVE_UP = "The whiteboard subagent didn't send a Whiteboard Defense.";
const UNDER_WAY = 'The Whiteboard Defense is already being written.';
const IMPORTING = "The plan is still importing. Generate the Whiteboard Defense once that's done.";
/** dp_wait's next for a Whiteboard Defense request, with the default whiteboard model. */
const next = (id: string) =>
  `Start one dev-plumbing:whiteboard subagent (model opus) with the prompt "Write the Whiteboard Defense for repo acme-app, plumbing project restock-reminders, request ${id}." When it returns, call dp_wait with finished: { whiteboard: "${id}" }.`;
const SECTION_IDS = ['summary', 'diagram', 'walkthrough', 'data', 'security', 'failure', 'tradeoffs', 'complexity', 'readiness', 'unknowns'];

/** A valid defense whose Whiteboard diagram section names the project's architecture item. */
function withDiagram(): DefenseInput {
  const input = validDefenseInput();
  return { ...input, sections: input.sections.map((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-reminders' } : s)) };
}

describe('the Whiteboard Defense through the Claude routes', () => {
  it('hands a requested defense to a listening window, serves its pack, and saves what the subagent sends', async () => {
    const t = await setup();
    const { id } = await requestWhiteboard(t.dir);
    expect((await t.send('GET', P)).body.defense).toEqual({ ready: false, stale: false, state: 'requested' });

    const wait = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect(wait.body).toEqual({ kind: 'whiteboard', request: id, model: 'opus', next: next(id) });
    const writing = await readWhiteboardRequest(t.dir);
    expect(writing).toMatchObject({ id, state: 'writing', pickedUpBy: 'w-a', inputsHash: expect.any(String), basedOn: { doc: 'draft', version: 1 } });
    expect((await t.send('GET', P)).body).toMatchObject({ listening: 'busy', defense: { ready: false, stale: false, state: 'writing' } });

    const pack = await t.claude('/context', { ...base, whiteboard: true });
    expect(pack.status).toBe(200);
    // The big texts are files the subagent Reads: the rules file setup installed, and the draft the defense explains.
    expect(pack.body.rulesFile).toBe(path.join(t.ctx.configDir, 'outputs', 'whiteboard-defense.md'));
    expect(pack.body.documentFile).toBe(path.join(t.dir, 'docs', 'draft.md'));
    expect(pack.body).toMatchObject({
      project: { repo: 'acme-app', id: 'restock-reminders', name: 'restock-reminders' },
      basedOn: { doc: 'draft', version: 1 },
      diagramItemIds: ['architecture-reminders'],
      sensitiveData: [],
      previous: null,
    });
    expect(pack.body.sections.map((s: Json) => s.id)).toEqual(SECTION_IDS);
    const architecture = pack.body.items.find((i: Json) => i.id === 'architecture-reminders');
    expect(architecture.data.nodes.map((n: Json) => n.id)).toEqual(['job', 'db']);
    expect(architecture.file).toBe(path.join(t.dir, 'items', 'architecture-reminders.json'));

    // A defense with problems is refused whole, listing each one. Nothing is saved, and the request waits for another try.
    const input = withDiagram();
    const bad = { ...input, sections: input.sections.filter((s) => s.id !== 'summary').map((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-nope' } : s)) };
    const refused = await t.claude('/whiteboard', { ...base, request: id, defense: bad });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/^Nothing was saved\. Fix these and call dp_whiteboard again with the whole defense:\n/);
    expect(refused.body.error).toContain('- sections: summary is missing.');
    expect(refused.body.error).toContain('- sections: diagram: diagramItemId "architecture-nope" isn\'t an item with a diagram. Use one of: architecture-reminders.');
    expect(await readDefense(t.dir)).toBeNull();
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id, state: 'writing', pickedUpBy: 'w-a' });

    // The subagent sends no checklist: the service copies the rules file's, word for word.
    const sent = await t.claude('/whiteboard', { ...base, request: id, defense: { ...input, checklist: [] } });
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ ok: true, request: id, level: input.level, questions: 3, concerns: 2, next: 'Saved. The user reads it in the app. Reply with your one line.' });
    const defense = await readDefense(t.dir);
    expect(defense).toMatchObject({ id: expect.stringMatching(/^w-/), level: input.level, basedOn: { kind: 'plan', doc: 'draft', version: 1, inputsHash: writing!.inputsHash } });
    expect(defense!.sections.map((s) => s.id)).toEqual(SECTION_IDS);
    expect(defense!.sections[1]).toMatchObject({ id: 'diagram', title: 'Whiteboard diagram', diagramItemId: 'architecture-reminders' });
    expect(defense!.checklist.map((k) => k.text)).toEqual(validDefenseInput().checklist);
    expect(await readWhiteboardRequest(t.dir)).toBeNull();
    expect((await t.send('GET', P)).body.defense).toEqual({ ready: true, stale: false, state: null });

    // The window reports back. The request is gone, so there's nothing left to fail, and the defense stays.
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { whiteboard: id } })).body).toEqual({ kind: 'timeout' });
    expect(await readDefense(t.dir)).toEqual(defense);
    // Sending again for the same request has nothing to save into.
    const late = await t.claude('/whiteboard', { ...base, request: id, defense: input });
    expect(late.status).toBe(409);
    expect(late.body.error).toBe(`There's no Whiteboard Defense request ${id} waiting for a defense.`);
  });

  it('hands out submissions first, then a requested finalize, then the Whiteboard Defense', async () => {
    const t = await setup();
    const whiteboard = await requestWhiteboard(t.dir);
    const finalize = await t.send('POST', `${P}/finalize`);
    expect(finalize.status).toBe(200);
    await t.send('PUT', `${P}/threads/t-questions-days/draft`, { text: 'Three days.' });
    await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-days' });

    const first = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect(first.body.kind).toBe('submission');
    const second = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { submission: first.body.submission, conflicts: [] } });
    expect(second.body).toMatchObject({ kind: 'finalize', request: finalize.body.request.id });
    const third = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { finalize: finalize.body.request.id } });
    expect(third.body).toMatchObject({ kind: 'whiteboard', request: whiteboard.id });
  });

  it('a whiteboard request is never stuck', async () => {
    let now = Date.parse('2026-10-06T10:00:00Z');
    const t = await setup({ now: () => now });

    // A window that comes back without saving fails its request with the reason, so the page offers Try again.
    const first = await requestWhiteboard(t.dir);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: first.id });
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { whiteboard: first.id } })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id: first.id, state: 'failed', reason: GAVE_UP });
    expect((await t.send('GET', P)).body.defense).toEqual({ ready: false, stale: false, state: 'failed' });

    // Try again replaces the failed request. A window that listens again without reporting back is done with it too.
    const retry = await requestWhiteboard(t.dir);
    expect(retry.id).not.toBe(first.id);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: retry.id });
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id: retry.id, state: 'failed', reason: GAVE_UP });

    // One at a time: while a request waits or is being written, another is refused.
    const third = await requestWhiteboard(t.dir);
    await expect(requestWhiteboard(t.dir)).rejects.toThrow(UNDER_WAY);
    expect((await t.claude('/wait', { ...base, windowId: 'w-gone', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: third.id });
    await expect(requestWhiteboard(t.dir)).rejects.toThrow(UNDER_WAY);

    // w-b's first dp_wait is still open when w-gone goes away. A second call from w-b takes the request back from the
    // queue, and a third one, while the first is still open, leaves it alone.
    const open = t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 2 });
    await new Promise((r) => setTimeout(r, 50));
    now += 5 * 60_000;
    expect((await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: third.id });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id: third.id, state: 'writing', pickedUpBy: 'w-b', requeuedAt: expect.any(String) });
    expect((await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id: third.id, state: 'writing', pickedUpBy: 'w-b' });
    expect((await open).body).toEqual({ kind: 'timeout' });

    // /open from a new window gives back the request of a window that went away, too.
    now += 5 * 60_000;
    expect((await t.claude('/open', { cwd: t.repo, project: 'restock-reminders', windowId: 'w-c' })).body.kind).toBe('reopened');
    const requeued = await readWhiteboardRequest(t.dir);
    expect(requeued).toMatchObject({ id: third.id, state: 'requested' });
    expect(requeued?.pickedUpBy).toBeUndefined();
    expect((await t.claude('/wait', { ...base, windowId: 'w-c', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: third.id });

    // Cancel works while it's being written: the window's report finds nothing to fail, and nothing is handed out again.
    await cancelWhiteboard(t.dir);
    expect(await readWhiteboardRequest(t.dir)).toBeNull();
    expect((await t.claude('/wait', { ...base, windowId: 'w-c', timeoutSeconds: 0, finished: { whiteboard: third.id } })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toBeNull();
    // ...while it waits for a window...
    await requestWhiteboard(t.dir);
    await cancelWhiteboard(t.dir);
    expect((await t.claude('/wait', { ...base, windowId: 'w-c', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    // ...and once it failed.
    const failed = await requestWhiteboard(t.dir);
    expect((await t.claude('/wait', { ...base, windowId: 'w-c', timeoutSeconds: 0 })).body).toMatchObject({ request: failed.id });
    expect((await t.claude('/wait', { ...base, windowId: 'w-c', timeoutSeconds: 0, finished: { whiteboard: failed.id } })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ state: 'failed' });
    await cancelWhiteboard(t.dir);
    expect(await readWhiteboardRequest(t.dir)).toBeNull();

    // Not while the plan is importing.
    await writeProjectFile(t.dir, { ...(await readProjectFile(t.dir)), status: 'importing' });
    await expect(requestWhiteboard(t.dir)).rejects.toThrow(IMPORTING);
    expect(await readWhiteboardRequest(t.dir)).toBeNull();
  });

  it("uses the user's outputs/whiteboard-defense.md, or the shipped one when theirs is gone, and copies its checklist", async () => {
    const t = await setup();
    const mine = path.join(t.ctx.configDir, 'outputs', 'whiteboard-defense.md');
    expect((await t.claude('/context', { ...base, whiteboard: true })).body.rulesFile).toBe(mine);

    // Rules of your own, with their own checklist: the defense gets it, whatever the subagent sent.
    await fs.writeFile(mine, '# Our defense rules\n\n- [ ] I can explain it.\n- [ ] I can draw it.\n');
    const first = await requestWhiteboard(t.dir);
    await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect((await t.claude('/whiteboard', { ...base, request: first.id, defense: validDefenseInput() })).status).toBe(200);
    expect((await readDefense(t.dir))!.checklist.map((k) => k.text)).toEqual(['I can explain it.', 'I can draw it.']);

    // Rules with no checklist: the subagent has to write one.
    await fs.writeFile(mine, '# Our defense rules\n\nKeep it short.\n');
    const second = await requestWhiteboard(t.dir);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { whiteboard: first.id } })).body).toMatchObject({ request: second.id });
    const none = await t.claude('/whiteboard', { ...base, request: second.id, defense: { ...validDefenseInput(), checklist: [] } });
    expect(none.status).toBe(400);
    expect(none.body.error).toContain('- checklist: the rules file has no checklist, so send one.');
    expect((await t.claude('/whiteboard', { ...base, request: second.id, defense: { ...validDefenseInput(), checklist: ['Mine.'] } })).status).toBe(200);
    expect((await readDefense(t.dir))!.checklist).toEqual([{ id: 'k1', text: 'Mine.' }]);

    await fs.rm(mine);
    expect((await t.claude('/context', { ...base, whiteboard: true })).body.rulesFile).toBe(path.join(DEFAULTS_DIR, 'outputs', 'whiteboard-defense.md'));
  });

  it("keeps the subagent's own Failed: line as the reason when the window passes it on", async () => {
    const t = await setup();
    const request = await requestWhiteboard(t.dir);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: request.id });
    const line = 'Failed: dp_whiteboard refused the defense three times: sections: summary is missing.';
    const finished = { whiteboard: request.id, whiteboardError: line };
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id: request.id, state: 'failed', reason: line });
  });

  it('/context says what to give when it gets none of the four', async () => {
    const t = await setup();
    const r = await t.claude('/context', base);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Give threadId (for a thread), importType (for an importer), finalize: true (for the finalizer) or whiteboard: true (for the whiteboard subagent).');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/service/test/whiteboard.test.ts`
Expected: FAIL, 6 of 6.
- `/wait` never hands out a Whiteboard Defense, so the first three tests and the Failed: line test get `{ kind: 'timeout' }` where they expect `kind: 'whiteboard'`.
- `/context` drops the unknown `whiteboard` key and answers 400, so `rulesFile` is `undefined`.
- The last test gets the old text, "Give threadId (for a thread), importType (for an importer) or finalize: true (for the finalizer)."

- [ ] **Step 3: Teach the Claude routes the Whiteboard Defense**

All edits are in `packages/service/src/routes/claude.ts`.

1. In the `@dev-plumbing/core` import list at the top, add eight names, each in its alphabetical place:
   - `checklistLines`, before `claimImport`;
   - `finishWhiteboard`, after `finishSubmission`;
   - `pickUpWhiteboard`, after `pickUpFinalize`;
   - `readWhiteboardRequest`, after `readThread`;
   - `requeueWhiteboard`, after `requeueUnfinished`;
   - `saveDefense`, before `saveProposal`;
   - `whiteboardPack`, after `updateRefusal`;
   - `type WhiteboardRequest`, after `type UpdateResult`.

2. `dp_wait` reports a finished Whiteboard Defense request. In `waitBody`, replace:
```ts
  // What the window just finished: a submission (with any conflicts it found), a finalize request (its id), or a
  // Detect again (the repo).
  finished: z
    .object({
      submission: z.string().min(1).optional(),
      conflicts: z.array(z.object({ threads: z.array(z.string()).min(1), text: z.string().min(1) })).default([]),
      finalize: z.string().min(1).optional(),
      detect: z.string().min(1).optional(),
    })
```
with:
```ts
  // What the window just finished: a submission (with any conflicts it found), a finalize request (its id), a
  // Detect again (the repo), or a Whiteboard Defense request (its id, and the subagent's Failed: line if it gave up).
  finished: z
    .object({
      submission: z.string().min(1).optional(),
      conflicts: z.array(z.object({ threads: z.array(z.string()).min(1), text: z.string().min(1) })).default([]),
      finalize: z.string().min(1).optional(),
      detect: z.string().min(1).optional(),
      whiteboard: z.string().min(1).optional(),
      // The whiteboard subagent's own "Failed: …" line, when it gave up: the request's reason.
      whiteboardError: z.string().optional(),
    })
```

3. `/context` takes `whiteboard`. Replace:
```ts
const contextBody = projectBody.extend({ threadId: z.string().optional(), importType: z.string().optional(), finalize: z.boolean().optional() });
```
with:
```ts
const contextBody = projectBody.extend({
  threadId: z.string().optional(),
  importType: z.string().optional(),
  finalize: z.boolean().optional(),
  whiteboard: z.boolean().optional(),
});
```

4. The new route's body goes after `finalizeBody`. Replace:
```ts
const finalizeBody = projectBody.extend({ request: z.string().min(1), markdown: z.string() });
```
with:
```ts
const finalizeBody = projectBody.extend({ request: z.string().min(1), markdown: z.string() });
// The defense is checked by saveDefense, which lists every problem in its own words, so it's taken as it comes here.
const whiteboardBody = projectBody.extend({ request: z.string().min(1), defense: z.unknown() });
```

5. Inside `claudeRoutes`, the whiteboard rules file is picked as the finalize rules are read: the user's, or the shipped one. The subagent Reads it, so the pack gives its path. Replace:
```ts
  const finalizeRules = () =>
    fs.readFile(path.join(ctx.configDir, 'outputs', 'finalize.md'), 'utf8').catch(() => fs.readFile(path.join(ctx.defaultsDir, 'outputs', 'finalize.md'), 'utf8'));
```
with:
```ts
  const finalizeRules = () =>
    fs.readFile(path.join(ctx.configDir, 'outputs', 'finalize.md'), 'utf8').catch(() => fs.readFile(path.join(ctx.defaultsDir, 'outputs', 'finalize.md'), 'utf8'));
  /** outputs/whiteboard-defense.md in the config folder, or the shipped default when the user's copy is missing. */
  const whiteboardRulesFile = async () => {
    const mine = path.resolve(ctx.configDir, 'outputs', 'whiteboard-defense.md');
    return (await fs.access(mine).then(() => true, () => false)) ? mine : path.resolve(ctx.defaultsDir, 'outputs', 'whiteboard-defense.md');
  };
```

6. `/open` gives back a Whiteboard Defense request held by a window that's gone, in both places it does so for Finalize. In the update path, replace:
```ts
          await requeueUnfinished(ref.dir, isAlive);
          await requeueFinalize(ref.dir, isAlive);
          const refused = await updateRefusal(ref.dir);
```
with:
```ts
          await requeueUnfinished(ref.dir, isAlive);
          await requeueFinalize(ref.dir, isAlive);
          await requeueWhiteboard(ref.dir, isAlive);
          const refused = await updateRefusal(ref.dir);
```
In the bookkeeping on every open, replace:
```ts
        await recordClone(ref.dir, git.root, ctx.home);
        await requeueUnfinished(ref.dir, isAlive);
        await requeueFinalize(ref.dir, isAlive);
```
with:
```ts
        await recordClone(ref.dir, git.root, ctx.home);
        await requeueUnfinished(ref.dir, isAlive);
        await requeueFinalize(ref.dir, isAlive);
        await requeueWhiteboard(ref.dir, isAlive);
```
`updateRefusal` doesn't change: a plan update doesn't wait for a defense being written (Decision 2).

7. What `dp_wait` returns for the request. Replace:
```ts
  /** What dp_wait returns for a Detect again request: one repo-setup subagent, looking at the project's clone. */
```
with:
```ts
  /** What dp_wait returns for a Whiteboard Defense request: one whiteboard subagent, with the whiteboard model. */
  function describeWhiteboard(ref: ProjectRef, request: WhiteboardRequest, cfg: LoadedConfig) {
    const model = cfg.agents.models.whiteboard;
    return {
      kind: 'whiteboard' as const,
      request: request.id,
      model,
      next: `Start one dev-plumbing:whiteboard subagent (model ${model}) with the prompt "Write the Whiteboard Defense for repo ${ref.repo}, plumbing project ${ref.id}, request ${request.id}." When it returns, call dp_wait with finished: { whiteboard: "${request.id}" }.`,
    };
  }

  /** What dp_wait returns for a Detect again request: one repo-setup subagent, looking at the project's clone. */
```

8. In `/wait`, under the lock, a window back from a Whiteboard Defense fails it, and a gone window's request is requeued. Replace:
```ts
        if (held?.state === 'writing' && held.pickedUpBy === body.windowId && (!alreadyWaiting || finished?.finalize === held.id)) {
          await finishFinalize(ref.dir, { requestId: held.id, windowId: body.windowId });
        }
        await requeueUnfinished(ref.dir, isAlive);
        await requeueFinalize(ref.dir, isAlive);
```
with:
```ts
        if (held?.state === 'writing' && held.pickedUpBy === body.windowId && (!alreadyWaiting || finished?.finalize === held.id)) {
          await finishFinalize(ref.dir, { requestId: held.id, windowId: body.windowId });
        }
        // The same for a Whiteboard Defense: a window back without one fails its request, so the page offers Try again,
        // with the subagent's own Failed: line when the window passes it on.
        const writing = await readWhiteboardRequest(ref.dir);
        if (writing?.state === 'writing' && writing.pickedUpBy === body.windowId && (!alreadyWaiting || finished?.whiteboard === writing.id)) {
          const error = finished?.whiteboard === writing.id ? finished.whiteboardError : undefined;
          await finishWhiteboard(ref.dir, { requestId: writing.id, windowId: body.windowId, error });
        }
        await requeueUnfinished(ref.dir, isAlive);
        await requeueFinalize(ref.dir, isAlive);
        await requeueWhiteboard(ref.dir, isAlive);
```

9. Then the hand-out takes a requested Whiteboard Defense last. Replace:
```ts
        // Submissions first, oldest first. Then a requested finalize.
        const picked = await rt.withLock(key, async () => {
          if (c.req.raw.signal.aborted) return null;
          const next = (await pendingSubmissions(ref.dir))[0];
          if (next) return { kind: 'submission' as const, submission: await pickUp(ref.dir, next.id, body.windowId) };
          const request = await pickUpFinalize(ref.dir, body.windowId);
          return request ? { kind: 'finalize' as const, request } : null;
        });
        if (picked) {
          rt.listeners.setBusy(body.windowId, true);
          changed(ref);
          return c.json(picked.kind === 'submission' ? await describeSubmission(ref, picked.submission, cfg) : describeFinalize(ref, picked.request, cfg));
        }
```
with:
```ts
        // Submissions first, oldest first. Then a requested finalize, then a requested Whiteboard Defense.
        const picked = await rt.withLock(key, async () => {
          if (c.req.raw.signal.aborted) return null;
          const next = (await pendingSubmissions(ref.dir))[0];
          if (next) return { kind: 'submission' as const, submission: await pickUp(ref.dir, next.id, body.windowId) };
          const request = await pickUpFinalize(ref.dir, body.windowId);
          if (request) return { kind: 'finalize' as const, request };
          const whiteboard = await pickUpWhiteboard(ref.dir, body.windowId);
          return whiteboard ? { kind: 'whiteboard' as const, request: whiteboard } : null;
        });
        if (picked) {
          rt.listeners.setBusy(body.windowId, true);
          changed(ref);
          if (picked.kind === 'submission') return c.json(await describeSubmission(ref, picked.submission, cfg));
          return c.json(picked.kind === 'finalize' ? describeFinalize(ref, picked.request, cfg) : describeWhiteboard(ref, picked.request, cfg));
        }
```

10. `/context` serves the whiteboard subagent's pack. Replace:
```ts
      if (body.finalize) return c.json(await finalizePack({ dir: ref.dir, types: cfg.types, profile, rules: await finalizeRules() }));
      throw new InputError('Give threadId (for a thread), importType (for an importer) or finalize: true (for the finalizer).');
```
with:
```ts
      if (body.finalize) return c.json(await finalizePack({ dir: ref.dir, types: cfg.types, profile, rules: await finalizeRules() }));
      if (body.whiteboard) return c.json(await whiteboardPack({ dir: ref.dir, types: cfg.types, profile, rulesFile: await whiteboardRulesFile() }));
      throw new InputError('Give threadId (for a thread), importType (for an importer), finalize: true (for the finalizer) or whiteboard: true (for the whiteboard subagent).');
```

11. The new route goes last, after `/finalize`. Replace the end of the file:
```ts
        next: 'Saved. The user previews the final in the app and accepts it there. Reply with your one line.',
      });
    }),
  );

  return r;
}
```
with:
```ts
        next: 'Saved. The user previews the final in the app and accepts it there. Reply with your one line.',
      });
    }),
  );

  // The whiteboard subagent's defense. saveDefense checks it whole, or refuses it with every problem and keeps the
  // request writing, so the subagent can send it again. The checklist is the rules file's, copied here, so the user's
  // ticks always match it; only rules with no checklist need the subagent's.
  r.post(
    '/whiteboard',
    handle(async (c) => {
      const body = await parse(c, whiteboardBody);
      const { cfg, ref } = await locateProject(ctx, body.repo, body.project);
      const checklist = checklistLines(await fs.readFile(await whiteboardRulesFile(), 'utf8').catch(() => ''));
      const saved = await rt.withLock(projectKey(ref.repo, ref.id), () =>
        saveDefense(ref.dir, { requestId: body.request, defense: body.defense, types: cfg.types, checklist }),
      );
      changed(ref);
      return c.json({
        ok: true,
        request: body.request,
        level: saved.level,
        questions: saved.questions.length,
        concerns: saved.concerns.length,
        next: 'Saved. The user reads it in the app. Reply with your one line.',
      });
    }),
  );

  return r;
}
```

- [ ] **Step 4: Run the tests**

Run:
```bash
pnpm vitest run packages/service/test/whiteboard.test.ts packages/service/test/claude.test.ts packages/service/test/finalize.test.ts packages/service/test/update.test.ts
pnpm typecheck
pnpm test
pnpm test:e2e finalize.spec.ts
pnpm test:e2e
```
Expected: PASS.
- `whiteboard.test.ts` has 6 tests.
- The Claude route, Finalize and update tests pass unchanged: a `finished` without `whiteboard`, and a project with no `whiteboard/` folder, behave as before.
- The e2e runs check that `/open`, `/wait` and `/finalize` still work from the app's side.

- [ ] **Step 5: Commit**

```bash
git add packages/service/src/routes/claude.ts packages/service/test/whiteboardSetup.ts packages/service/test/whiteboard.test.ts
git commit -m "feat(service): a listening window writes the Whiteboard Defense, and the service saves it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The browser's whiteboard routes

The Whiteboard Defense page gets its routes: the view, Generate, Cancel, Ask Claude about this, Send to Questions or Concerns, the two practice writes and Export .md. Two helpers that the Finalize and thread routes kept to themselves move out, so the new routes share them: `clonesOf` goes to `routes/clones.ts`, with a `knownClone` check beside it that Accept and Export both use, and the thread routes' `respond` becomes `submitResponse` in `routes/respond.ts`.

**Files:**
- Create:
  - `packages/service/src/routes/respond.ts`
  - `packages/service/src/routes/clones.ts`
  - `packages/service/src/routes/whiteboard.ts`
  - `packages/service/test/whiteboard-routes.test.ts`
- Modify:
  - `packages/service/src/routes/threads.ts` (uses `submitResponse`)
  - `packages/service/src/routes/finalize.ts` (uses `clonesOf` and `knownClone`)
  - `packages/service/src/app.ts` (mounts the routes)
- Test:
  - `packages/service/test/whiteboard-routes.test.ts`, which reuses Task 7's `packages/service/test/whiteboardSetup.ts`
  - `packages/service/test/threads.test.ts` and `packages/service/test/finalize.test.ts`, unchanged

**Interfaces:**
- Consumes (from `@dev-plumbing/core`, except the fixtures and Task 7's setup):
  - From Task 1:
    - `readWhiteboardRequest(dir)`, `readDefense(dir)` and `readPractice(dir)`;
    - `ratingValues`;
    - the `WhiteboardView`, `GenerateWhiteboardResponse`, `AskDefenseResponse` and `SendFromDefenseResponse` types;
    - `validDefenseInput()` from `packages/core/test/fixtures.ts`: three questions (`q1`–`q3` once saved), two concerns (`c1` is the `high` one once saved), the 20 checklist lines (`k1`–`k20`), and a `security` claim at index 1 marked `unknown`.
  - From Task 2: Defense items have type `defense`. `threads.ts`'s `POST …/items` already finds its type with `t.enabled && !t.builtIn`; this task leaves that line as it is.
  - From Task 3:
    - `requestWhiteboard(dir)` and `cancelWhiteboard(dir)`;
    - `defenseStale(dir, defense): Promise<string | null>`, with the two Out of date lines;
    - `ProjectHome.defense`;
    - `WHITEBOARD_IMPORTING` and `WHITEBOARD_UNDER_WAY`, `requestWhiteboard`'s two refusals, which the view repeats as `generateRefusal`.
  - From Task 5: `askAboutDefense(dir, { defenseId, kind, ref, question })`, `sendFromDefense(dir, { defenseId, kind, ref, types })` and `defenseLinks(dir, defense)`, with their exact refusals.
  - From Task 6:
    - `practiceView(defense, practice)`, `ratePractice(dir, { defenseId, questionId, rating })` and `tickPractice(dir, { defenseId, checklistId, ticked })`;
    - `exportDefense({ dir, clone, profile, home })`, which refuses with ConflictError "There's no Whiteboard Defense to export yet." when there's no defense, and returns `{ exportedTo: { clone, path, at } }`. `path` is `docs/specs/restock-reminders.whiteboard-defense.md` for this project, and `clone` is tildified with `home`.
  - From Task 7: `setup`, `P`, `base` and `Json` from `service/test/whiteboardSetup.ts`; `/wait` handing out `kind: 'whiteboard'`; `POST /api/claude/whiteboard`.
  - From Plans 1–5: `submit`, `submitMessage`, `finalName`, `expandHome`, `formatZodError`, `readProjectFile`, `writeProjectFile`, `InputError`; the service's `locateProject`, `handle`, `readJsonObject`, `projectKey`, `rt.withLock`, `rt.listeners`, `rt.events`; `makeRepo` from the core fixtures.
- Produces:
  - **`submitResponse(rt: Runtime, ref: ProjectRef, r: { resolved: string[]; sent: string[]; skipped: { threadId: string; reason: string }[] }): SubmitResponse`** (`routes/respond.ts`): `threads.ts`'s module-private `respond`, moved, with the same body. It wakes a listening window when anything was sent. `POST …/submit`, `POST …/items` and `POST …/whiteboard/ask` use it.
  - **`clonesOf(project: PlumbingProject, home?: string): Promise<FinalizeView['clones']>`** (`routes/clones.ts`), moved from `finalize.ts` unchanged and exported.
  - **`knownClone(project: PlumbingProject, clone: string, home?: string): Promise<string>`** (`routes/clones.ts`): the picked clone with `~` expanded, once it's one of `clonesOf`. Otherwise it throws InputError "That folder isn't one of the clones this project was opened from.", the message Accept already gives.
  - **`whiteboardRoutes(ctx: AppContext, rt: Runtime): Hono`** (`routes/whiteboard.ts`), mounted under `/api` after the Finalize routes, behind the guard. It also exports `WHITEBOARD_WAITING` and `WHITEBOARD_NO_WINDOW`. Every write runs under the project lock, then `rt.events.projectChanged`. The base is `/projects/:repo/:id/whiteboard`:

    | Method | Path | Body | Returns |
    |---|---|---|---|
    | GET | base | | `WhiteboardView` |
    | POST | base | `{}` | `GenerateWhiteboardResponse`; notifies listeners; `message` is "Waiting for Claude to write the Whiteboard Defense." or "No Claude window is listening. Run /dev-plumbing in any clone." |
    | POST | `/cancel` | `{}` | `{ ok: true }` |
    | POST | `/ask` | `{ defenseId, kind: 'section' \| 'question' \| 'concern', ref, question }` | `AskDefenseResponse`: `askAboutDefense`, then `submit({ scope: 'thread' })` in the same lock, then `submitResponse` plus `threadId` |
    | POST | `/send` | `{ defenseId, kind: 'claim' \| 'concern', ref }` | `SendFromDefenseResponse`; notifies listeners; `message` is `Added to ${typeTitle}. Claude will suggest answers.`, or `Added to ${typeTitle}. Claude is busy, and will suggest answers when it's done.` while the window is busy, or `Added to ${typeTitle}. No Claude window is listening. Run /dev-plumbing in any clone.` with no window |
    | POST | `/practice/rating` | `{ defenseId, questionId, rating: Rating \| null }` | `PracticeView` |
    | POST | `/practice/tick` | `{ defenseId, checklistId, ticked: boolean }` | `PracticeView` |
    | POST | `/export` | `{ clone }` | `{ exportedTo: DefenseExport }`. The clone must pass `knownClone`, and the repo needs a profile (400 `There's no repo profile for ${repo}. Add it in Settings → Repos.`, as Accept says) |
- **Behaviour:**
  - **Bodies.** The five bodies with fields are `.strict()` Zod objects, so a misspelt key is a 400. `question` is trimmed, then 1–20,000 characters. Generate and Cancel read no body, as Start finalize and Discard don't, so `{}` and no body both work.
  - **The view:**
    - `stale` is `defenseStale` for the saved defense; `practice` is `practiceView` with `readPractice`; `asked` and `sent` come from `defenseLinks`. All three are null or empty with no defense.
    - `generateRefusal` is `WHITEBOARD_IMPORTING` ("The plan is still importing. Generate the Whiteboard Defense once that's done.") while the project is importing, else `WHITEBOARD_UNDER_WAY` ("The Whiteboard Defense is already being written.") while a request is requested or writing, else null. They're imported from core, so the page says exactly what a press would. `canGenerate` is `generateRefusal === null`.
    - `listening` is `rt.listeners.state(key)`, and `clones` is `clonesOf(project, ctx.home)`.
    - `exportPath` is `<name>.whiteboard-defense.md` in the plan's folder, relative to a clone, next to where Accept puts `<name>.final.md`. `<name>` is `finalName(source.path)`, and the two are joined with `path.posix.join`, so a plan at the clone's root gives just the file name.
  - **Generate** returns its message as Start finalize does: the listening state is read before listeners are notified. A saved defense stays, and so the view keeps showing it, until a new one is saved.
  - **Send** reads the listening state, then notifies listeners, so a listening window picks up the service-made submission at once. While the only window is busy (writing the defense can take ten minutes or more), its message says Claude will suggest answers when it's done. **Ask** already says so, through `submitResponse`'s busy wording: "Saved. Claude is finishing earlier threads and will pick this up next."

- [ ] **Step 1: Write the failing tests**

`packages/service/test/whiteboard-routes.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readProjectFile, writeProjectFile } from '@dev-plumbing/core';
import { makeRepo, validDefenseInput } from '../../core/test/fixtures';
import { removeTempDirs } from './helpers';
import { base, P, setup, type Json, type Setup } from './whiteboardSetup';

afterAll(removeTempDirs);

const W = `${P}/whiteboard`;
const EXPORT_FILE = 'docs/specs/restock-reminders.whiteboard-defense.md';
const WAITING = 'Waiting for Claude to write the Whiteboard Defense.';
const NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';
const UNDER_WAY = 'The Whiteboard Defense is already being written.';
const IMPORTING = "The plan is still importing. Generate the Whiteboard Defense once that's done.";
const CHANGED = 'The Whiteboard Defense changed since this page loaded. Reload it.';
const exists = (p: string) => fs.access(p).then(() => true, () => false);

/** Generate in the browser; a window picks it up, its subagent sends a valid defense, and the window reports back. */
async function saved(t: Setup): Promise<Json> {
  const generated = await t.send('POST', W, {});
  expect(generated.status).toBe(200);
  const id = generated.body.request.id as string;
  expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: id });
  expect((await t.claude('/whiteboard', { ...base, request: id, defense: validDefenseInput() })).status).toBe(200);
  expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { whiteboard: id } })).body).toEqual({ kind: 'timeout' });
  return (await t.send('GET', W)).body;
}

describe('the Whiteboard Defense page over HTTP', () => {
  it('has nothing at first, and offers Generate', async () => {
    const t = await setup();
    expect((await t.send('GET', W)).body).toEqual({
      request: null,
      defense: null,
      stale: null,
      practice: null,
      asked: [],
      sent: [],
      canGenerate: true,
      generateRefusal: null,
      listening: null,
      clones: [{ path: t.repo, source: true }],
      exportPath: EXPORT_FILE,
    });
    const nothing = await t.send('POST', `${W}/export`, { clone: t.repo });
    expect(nothing.status).toBe(409);
    expect(nothing.body.error).toBe("There's no Whiteboard Defense to export yet.");
  });

  it("can't generate while the plan is importing", async () => {
    const t = await setup();
    await writeProjectFile(t.dir, { ...(await readProjectFile(t.dir)), status: 'importing' });
    expect((await t.send('GET', W)).body).toMatchObject({ canGenerate: false, generateRefusal: IMPORTING });
    const refused = await t.send('POST', W, {});
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe(IMPORTING);
  });

  it('Generate wakes a listening window, and a second press is refused while it writes', async () => {
    const t = await setup();
    const waiting = t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 5 });
    await new Promise((r) => setTimeout(r, 50));
    const generated = await t.send('POST', W, {});
    expect(generated.status).toBe(200);
    expect(generated.body).toMatchObject({ request: { state: 'requested' }, listening: 'waiting', message: WAITING });
    expect((await waiting).body).toMatchObject({ kind: 'whiteboard', request: generated.body.request.id });
    expect((await t.send('GET', W)).body).toMatchObject({
      request: { id: generated.body.request.id, state: 'writing', pickedUpBy: 'w-a' },
      canGenerate: false,
      generateRefusal: UNDER_WAY,
      listening: 'busy',
    });
    const again = await t.send('POST', W, {});
    expect(again.status).toBe(409);
    expect(again.body.error).toBe(UNDER_WAY);
  });

  it('says no window is listening, and Cancel takes the request back', async () => {
    const t = await setup();
    const generated = await t.send('POST', W, {});
    expect(generated.body).toMatchObject({ request: { state: 'requested' }, listening: null, message: NO_WINDOW });
    expect((await t.send('POST', `${W}/cancel`, {})).body).toEqual({ ok: true });
    expect((await t.send('GET', W)).body).toMatchObject({ request: null, canGenerate: true, generateRefusal: null });
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    // Nothing to cancel is fine too.
    expect((await t.send('POST', `${W}/cancel`, {})).body).toEqual({ ok: true });
  });

  it('shows the saved defense, and keeps it while a regenerate is being written', async () => {
    const t = await setup();
    const view = await saved(t);
    expect(view).toMatchObject({
      request: null,
      defense: { id: expect.stringMatching(/^w-/), basedOn: { kind: 'plan', doc: 'draft', version: 1 } },
      stale: null,
      practice: { ratings: {}, ticks: [], readiness: 0, counts: { could: 0, shaky: 0, couldnt: 0, unrated: 3, ticked: 0, checklist: 20 } },
      asked: [],
      sent: [],
      canGenerate: true,
      exportPath: EXPORT_FILE,
    });
    expect(view.defense.questions.map((q: Json) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect((await t.send('GET', P)).body.defense).toEqual({ ready: true, stale: false, state: null });

    expect((await t.send('POST', W, {})).status).toBe(200);
    expect((await t.send('GET', W)).body).toMatchObject({ request: { state: 'requested' }, defense: { id: view.defense.id }, canGenerate: false });
  });

  it('asks Claude about a part: a Defense thread with your question, handed to the window', async () => {
    const t = await setup();
    const { defense } = await saved(t);
    const question = 'Who can turn reminders off?\nAnd who can see them?';
    const asked = await t.send('POST', `${W}/ask`, { defenseId: defense.id, kind: 'section', ref: 'security', question });
    expect(asked.status).toBe(200);
    expect(asked.body).toEqual({ resolved: 0, sent: 1, skipped: [], listening: 'waiting', message: 'Sent to Claude.', threadId: expect.stringMatching(/^t-defense-/) });
    const { threadId } = asked.body;
    const detail = (await t.send('GET', `${P}/threads/${threadId}`)).body;
    expect(detail.thread.status).toBe('with_claude');
    expect(detail.thread.messages.at(-1)).toMatchObject({ author: 'you', text: question });
    expect(detail.item).toMatchObject({ type: 'defense', createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'section', ref: 'security' } });
    expect((await t.send('GET', W)).body.asked).toEqual([expect.objectContaining({ kind: 'section', ref: 'security', threadId, typeId: 'defense', status: 'with_claude' })]);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'submission', groups: [{ threads: [threadId] }] });

    const stale = await t.send('POST', `${W}/ask`, { defenseId: 'w-older', kind: 'section', ref: 'security', question });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe(CHANGED);
    const missing = await t.send('POST', `${W}/ask`, { defenseId: defense.id, kind: 'question', ref: 'q9', question });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe("That part of the Whiteboard Defense doesn't exist.");
    expect((await t.send('POST', `${W}/ask`, { defenseId: defense.id, kind: 'section', ref: 'security', question: '   ' })).status).toBe(400);
    expect((await t.send('POST', `${W}/ask`, { defenseId: defense.id, kind: 'section', ref: 'security', question, extra: true })).status).toBe(400);
  });

  it('sends an unknown to Questions and a concern to Concerns, once each, for Claude to pick up', async () => {
    let now = Date.parse('2026-10-06T10:00:00Z');
    const t = await setup({ now: () => now });
    const { defense } = await saved(t);
    const sent = await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'claim', ref: 'security.1' });
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({
      itemId: expect.stringMatching(/^questions-/),
      threadId: expect.stringMatching(/^t-questions-/),
      typeId: 'questions',
      typeTitle: 'Questions',
      listening: 'waiting',
      message: 'Added to Questions. Claude will suggest answers.',
    });
    // The service made the submission, so the listening window answers it without the user sending anything.
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'submission', groups: [{ threads: [sent.body.threadId] }] });
    expect((await t.send('GET', W)).body.sent).toEqual([expect.objectContaining({ kind: 'claim', ref: 'security.1', itemId: sent.body.itemId, typeId: 'questions' })]);

    const again = await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'claim', ref: 'security.1' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("That's already in Questions.");
    const claims: { ref: string; basis: string }[] = defense.sections.flatMap((s: Json) => s.claims.map((c: Json, i: number) => ({ ref: `${s.id}.${i}`, basis: c.basis })));
    const settled = claims.find((c) => c.basis === 'known' || c.basis === 'inferred')!;
    const known = await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'claim', ref: settled.ref });
    expect(known.status).toBe(400);
    expect(known.body.error).toBe('Only a claim marked Unknown or Verify before release can be sent to Questions.');

    // While the window is busy (it took the claim's thread), it says Claude will get to it.
    const busy = await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'concern', ref: 'c1' });
    expect(busy.body).toMatchObject({ typeId: 'concerns', typeTitle: 'Concerns', listening: 'busy', message: "Added to Concerns. Claude is busy, and will suggest answers when it's done." });
    // Once the window is gone, the message says so.
    now += 5 * 60_000;
    const concern = await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'concern', ref: 'c2' });
    expect(concern.body).toMatchObject({ typeId: 'concerns', typeTitle: 'Concerns', listening: null, message: `Added to Concerns. ${NO_WINDOW}` });
  });

  it('rates cards and ticks the checklist, for the current defense only', async () => {
    const t = await setup();
    const { defense } = await saved(t);
    const rated = await t.send('POST', `${W}/practice/rating`, { defenseId: defense.id, questionId: 'q1', rating: 'could' });
    expect(rated.status).toBe(200);
    expect(rated.body).toMatchObject({ ratings: { q1: 'could' }, ticks: [], counts: { could: 1, unrated: 2 } });
    const ticked = await t.send('POST', `${W}/practice/tick`, { defenseId: defense.id, checklistId: 'k1', ticked: true });
    // Half the cards, half the checklist: round(100 × (1 / 3 + 1 / 20) / 2) = 19
    expect(ticked.body).toMatchObject({ ratings: { q1: 'could' }, ticks: ['k1'], readiness: 19 });
    expect((await t.send('GET', W)).body.practice).toEqual(ticked.body);
    const cleared = await t.send('POST', `${W}/practice/rating`, { defenseId: defense.id, questionId: 'q1', rating: null });
    expect(cleared.body).toMatchObject({ ratings: {}, ticks: ['k1'] });

    const old = await t.send('POST', `${W}/practice/tick`, { defenseId: 'w-older', checklistId: 'k1', ticked: false });
    expect(old.status).toBe(409);
    expect(old.body.error).toBe(CHANGED);
    expect((await t.send('POST', `${W}/practice/rating`, { defenseId: defense.id, questionId: 'q1', rating: 'great' })).status).toBe(400);
  });

  it('exports into a clone the project was opened from, and nowhere else', async () => {
    const t = await setup();
    await saved(t);
    const exported = await t.send('POST', `${W}/export`, { clone: t.repo });
    expect(exported.status).toBe(200);
    expect(exported.body).toEqual({ exportedTo: { clone: t.repo, path: EXPORT_FILE, at: expect.any(String) } });
    expect(await fs.readFile(path.join(t.repo, EXPORT_FILE), 'utf8')).toMatch(/^# Whiteboard Defense: /);
    expect((await t.send('GET', W)).body.defense.exportedTo).toEqual(exported.body.exportedTo);

    const stranger = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
    const refused = await t.send('POST', `${W}/export`, { clone: stranger });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe("That folder isn't one of the clones this project was opened from.");
    expect(await exists(path.join(stranger, EXPORT_FILE))).toBe(false);
    expect((await t.send('POST', `${W}/export`, {})).status).toBe(400);
  });

  it('goes out of date when the plan changes, and not when you ask about it or practise', async () => {
    const t = await setup();
    const { defense } = await saved(t);
    await t.send('POST', `${W}/ask`, { defenseId: defense.id, kind: 'question', ref: 'q2', question: 'Why would it send twice?' });
    await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'claim', ref: 'security.1' });
    await t.send('POST', `${W}/practice/rating`, { defenseId: defense.id, questionId: 'q2', rating: 'shaky' });
    await t.send('POST', `${W}/practice/tick`, { defenseId: defense.id, checklistId: 'k2', ticked: true });
    expect((await t.send('GET', W)).body.stale).toBeNull();

    await fs.appendFile(path.join(t.dir, 'docs', 'draft.md'), '\nReminders stop when the subscription is paused.\n');
    expect((await t.send('GET', W)).body).toMatchObject({ stale: 'Out of date: the plan changed since this was generated.', canGenerate: true });
    expect((await t.send('GET', P)).body.defense).toEqual({ ready: true, stale: true, state: null });
  });

  it('needs the token or the same origin', async () => {
    const t = await setup();
    const routes: [string, string][] = [
      ['GET', W],
      ['POST', W],
      ['POST', `${W}/cancel`],
      ['POST', `${W}/ask`],
      ['POST', `${W}/send`],
      ['POST', `${W}/practice/rating`],
      ['POST', `${W}/practice/tick`],
      ['POST', `${W}/export`],
    ];
    for (const [method, route] of routes) {
      const res = await t.app.request(`http://localhost:4545${route}`, { method, headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' } });
      expect(res.status, `${method} ${route}`).toBe(401);
    }
    const same = await t.app.request(`http://localhost:4545${W}`, { headers: { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:4545' } });
    expect(same.status).toBe(200);
    expect((await t.send('GET', '/api/projects/acme-app/nope/whiteboard')).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/service/test/whiteboard-routes.test.ts`
Expected: FAIL, 11 of 11. Every whiteboard route answers 404 `{ error: 'Not found.' }`. In the guard test, the cross-site requests already get 401, but the same-origin GET gets 404.

- [ ] **Step 3: Move `submitResponse` and `clonesOf` out**

`packages/service/src/routes/respond.ts`:
```ts
import { submitMessage, type ProjectRef, type SubmitResponse } from '@dev-plumbing/core';
import { projectKey, type Runtime } from '../runtime';

/**
 * What the browser hears after sending threads (Send this thread, Submit all, a new item, Ask Claude about this): the
 * counts, the listening window's state and the line to show. A listening window is woken when anything was sent.
 */
export function submitResponse(rt: Runtime, ref: ProjectRef, r: { resolved: string[]; sent: string[]; skipped: { threadId: string; reason: string }[] }): SubmitResponse {
  const key = projectKey(ref.repo, ref.id);
  if (r.sent.length) rt.listeners.notify(key);
  const listening = rt.listeners.state(key);
  const counts = { resolved: r.resolved.length, sent: r.sent.length, skipped: r.skipped };
  return { ...counts, listening, message: submitMessage(counts, listening) };
}
```

`packages/service/src/routes/clones.ts`:
```ts
import fs from 'node:fs/promises';
import { expandHome, InputError, type FinalizeView, type PlumbingProject } from '@dev-plumbing/core';

/** The clones this project was opened from that are still folders on this Mac: the source clone first, each once. */
export async function clonesOf(project: PlumbingProject, home?: string): Promise<FinalizeView['clones']> {
  const source = expandHome(project.source.clone, home);
  const found: FinalizeView['clones'] = [];
  for (const clone of new Set([source, ...project.clones.map((c) => expandHome(c, home))])) {
    const stat = await fs.stat(clone).catch(() => null);
    if (stat?.isDirectory()) found.push({ path: clone, source: clone === source });
  }
  return found;
}

/**
 * The clone the browser picked, with ~ expanded, once it's known to be one this project was opened from. Accept and
 * Export then check its remote and every path inside it.
 */
export async function knownClone(project: PlumbingProject, clone: string, home?: string): Promise<string> {
  const path = expandHome(clone, home);
  if (!(await clonesOf(project, home)).some((x) => x.path === path)) throw new InputError("That folder isn't one of the clones this project was opened from.");
  return path;
}
```

In `packages/service/src/routes/threads.ts`:

1. In the `@dev-plumbing/core` import list, replace:
```ts
  submit,
  submitMessage,
  undoChange,
  type ProjectRef,
  type SubmitResponse,
} from '@dev-plumbing/core';
```
with:
```ts
  submit,
  undoChange,
  type ProjectRef,
} from '@dev-plumbing/core';
```
2. Replace:
```ts
import { projectKey, type Runtime } from '../runtime';
```
with:
```ts
import { projectKey, type Runtime } from '../runtime';
import { submitResponse } from './respond';
```
3. Inside `threadRoutes`, delete the `respond` helper:
```ts
  const respond = (ref: ProjectRef, r: { resolved: string[]; sent: string[]; skipped: { threadId: string; reason: string }[] }): SubmitResponse => {
    const key = projectKey(ref.repo, ref.id);
    if (r.sent.length) rt.listeners.notify(key);
    const listening = rt.listeners.state(key);
    const counts = { resolved: r.resolved.length, sent: r.sent.length, skipped: r.skipped };
    return { ...counts, listening, message: submitMessage(counts, listening) };
  };
```
4. In `POST …/submit`, replace:
```ts
    return c.json(respond(ref, result));
```
with:
```ts
    return c.json(submitResponse(rt, ref, result));
```
5. In `POST …/items`, replace:
```ts
    return c.json({ ...respond(ref, result), threadId });
```
with:
```ts
    return c.json({ ...submitResponse(rt, ref, result), threadId });
```

In `packages/service/src/routes/finalize.ts`:

1. Delete the first line, `import fs from 'node:fs/promises';`.
2. In the `@dev-plumbing/core` import list, delete `expandHome,` and `type PlumbingProject,`.
3. Replace:
```ts
import { projectKey, type Runtime } from '../runtime';
```
with:
```ts
import { projectKey, type Runtime } from '../runtime';
import { clonesOf, knownClone } from './clones';
```
4. Delete the module-private `clonesOf`, with its doc comment and the blank line after it:
```ts
/** The clones this project was opened from that are still folders on this Mac: the source clone first, each once. */
async function clonesOf(project: PlumbingProject, home?: string): Promise<FinalizeView['clones']> {
  const source = expandHome(project.source.clone, home);
  const found: FinalizeView['clones'] = [];
  for (const clone of new Set([source, ...project.clones.map((c) => expandHome(c, home))])) {
    const stat = await fs.stat(clone).catch(() => null);
    if (stat?.isDirectory()) found.push({ path: clone, source: clone === source });
  }
  return found;
}

```
5. In `POST …/finalize/accept`, replace:
```ts
    const project = await readProjectFile(ref.dir);
    const clone = expandHome(body.clone, ctx.home);
    // Only a clone this project was opened from. acceptFinal then checks its remote and every path inside it.
    if (!(await clonesOf(project, ctx.home)).some((x) => x.path === clone)) throw new InputError("That folder isn't one of the clones this project was opened from.");
```
with:
```ts
    // Only a clone this project was opened from. acceptFinal then checks its remote and every path inside it.
    const clone = await knownClone(await readProjectFile(ref.dir), body.clone, ctx.home);
```

- [ ] **Step 4: Write the whiteboard routes**

`packages/service/src/routes/whiteboard.ts`:
```ts
import path from 'node:path';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  askAboutDefense,
  cancelWhiteboard,
  defenseLinks,
  defenseStale,
  exportDefense,
  finalName,
  formatZodError,
  InputError,
  practiceView,
  ratePractice,
  ratingValues,
  readDefense,
  readPractice,
  readProjectFile,
  readWhiteboardRequest,
  requestWhiteboard,
  sendFromDefense,
  submit,
  tickPractice,
  WHITEBOARD_IMPORTING,
  WHITEBOARD_UNDER_WAY,
  type AskDefenseResponse,
  type GenerateWhiteboardResponse,
  type ProjectRef,
  type SendFromDefenseResponse,
  type WhiteboardView,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { EXPECTED_OBJECT, readJsonObject } from '../json';
import { locateProject } from '../locate';
import { projectKey, type Runtime } from '../runtime';
import { clonesOf, knownClone } from './clones';
import { submitResponse } from './respond';

/** What Generate says, by whether a Claude window will pick the request up. */
export const WHITEBOARD_WAITING = 'Waiting for Claude to write the Whiteboard Defense.';
export const WHITEBOARD_NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';

// Strict, so a misspelt key is refused rather than ignored.
const askBody = z
  .object({ defenseId: z.string().min(1), kind: z.enum(['section', 'question', 'concern']), ref: z.string().min(1), question: z.string().trim().min(1).max(20_000) })
  .strict();
const sendBody = z.object({ defenseId: z.string().min(1), kind: z.enum(['claim', 'concern']), ref: z.string().min(1) }).strict();
const ratingBody = z.object({ defenseId: z.string().min(1), questionId: z.string().min(1), rating: z.enum(ratingValues).nullable() }).strict();
const tickBody = z.object({ defenseId: z.string().min(1), checklistId: z.string().min(1), ticked: z.boolean() }).strict();
const exportBody = z.object({ clone: z.string().min(1) }).strict();

async function parse<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  const body = await readJsonObject(c);
  if (!body) throw new InputError(EXPECTED_OBJECT.error);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new InputError(formatZodError(parsed.error));
  return parsed.data;
}

/** The Whiteboard Defense page: generate it, study and practise it, ask Claude about it, send its unknowns on, export it. */
export function whiteboardRoutes(ctx: AppContext, rt: Runtime): Hono {
  const r = new Hono();
  const base = '/projects/:repo/:id/whiteboard';
  const find = (c: Context) => locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
  /** Runs a write under the project's lock, then tells the browser. */
  const write = async <T>(ref: ProjectRef, fn: () => Promise<T>): Promise<T> => {
    const result = await rt.withLock(projectKey(ref.repo, ref.id), fn);
    rt.events.projectChanged(ref.repo, ref.id);
    return result;
  };

  r.get(base, handle(async (c) => {
    const { ref } = await find(c);
    const project = await readProjectFile(ref.dir);
    const request = await readWhiteboardRequest(ref.dir);
    const defense = await readDefense(ref.dir);
    // Why Generate can't be pressed now: requestWhiteboard's own refusals, so the page says what a press would.
    const generateRefusal =
      project.status === 'importing' ? WHITEBOARD_IMPORTING : request?.state === 'requested' || request?.state === 'writing' ? WHITEBOARD_UNDER_WAY : null;
    const view: WhiteboardView = {
      request,
      defense,
      stale: defense ? await defenseStale(ref.dir, defense) : null,
      practice: defense ? practiceView(defense, await readPractice(ref.dir)) : null,
      ...(defense ? await defenseLinks(ref.dir, defense) : { asked: [], sent: [] }),
      canGenerate: generateRefusal === null,
      generateRefusal,
      listening: rt.listeners.state(projectKey(ref.repo, ref.id)),
      clones: await clonesOf(project, ctx.home),
      // Next to where Accept puts <name>.final.md: the plan's own folder, relative to a clone.
      exportPath: path.posix.join(path.posix.dirname(project.source.path), `${finalName(project.source.path)}.whiteboard-defense.md`),
    };
    return c.json(view);
  }));

  // Generate (and Regenerate, and Try again). The request waits in the project folder until a listening window picks it
  // up through dp_wait. The defense already saved stays until the new one is.
  r.post(base, handle(async (c) => {
    const { ref } = await find(c);
    const key = projectKey(ref.repo, ref.id);
    const request = await write(ref, () => requestWhiteboard(ref.dir));
    const listening = rt.listeners.state(key);
    rt.listeners.notify(key);
    const response: GenerateWhiteboardResponse = { request, listening, message: listening === null ? WHITEBOARD_NO_WINDOW : WHITEBOARD_WAITING };
    return c.json(response);
  }));

  // Cancel, in any state. A window still writing finds nothing to save into, and its report back fails nothing.
  r.post(`${base}/cancel`, handle(async (c) => {
    const { ref } = await find(c);
    await write(ref, () => cancelWhiteboard(ref.dir));
    return c.json({ ok: true });
  }));

  // Ask Claude about this: a Defense thread whose first message is the question, sent as Send this thread sends.
  r.post(`${base}/ask`, handle(async (c) => {
    const body = await parse(c, askBody);
    const { cfg, ref } = await find(c);
    const { threadId, result } = await write(ref, async () => {
      const asked = await askAboutDefense(ref.dir, { defenseId: body.defenseId, kind: body.kind, ref: body.ref, question: body.question });
      return { threadId: asked.threadId, result: await submit(ref.dir, { scope: 'thread', threadId: asked.threadId, types: cfg.types }) };
    });
    const response: AskDefenseResponse = { ...submitResponse(rt, ref, result), threadId };
    return c.json(response);
  }));

  // Send to Questions or Concerns. The new thread starts with Claude, queued as a submission the service made.
  r.post(`${base}/send`, handle(async (c) => {
    const body = await parse(c, sendBody);
    const { cfg, ref } = await find(c);
    const key = projectKey(ref.repo, ref.id);
    const sent = await write(ref, () => sendFromDefense(ref.dir, { defenseId: body.defenseId, kind: body.kind, ref: body.ref, types: cfg.types }));
    const listening = rt.listeners.state(key);
    rt.listeners.notify(key);
    // A busy window (writing the defense, say) gets to it once it's done.
    const message =
      listening === null
        ? `Added to ${sent.typeTitle}. ${WHITEBOARD_NO_WINDOW}`
        : listening === 'busy'
          ? `Added to ${sent.typeTitle}. Claude is busy, and will suggest answers when it's done.`
          : `Added to ${sent.typeTitle}. Claude will suggest answers.`;
    const response: SendFromDefenseResponse = { ...sent, listening, message };
    return c.json(response);
  }));

  r.post(`${base}/practice/rating`, handle(async (c) => {
    const body = await parse(c, ratingBody);
    const { ref } = await find(c);
    return c.json(await write(ref, () => ratePractice(ref.dir, body)));
  }));

  r.post(`${base}/practice/tick`, handle(async (c) => {
    const body = await parse(c, tickBody);
    const { ref } = await find(c);
    return c.json(await write(ref, () => tickPractice(ref.dir, body)));
  }));

  // Export .md: only into a clone this project was opened from. exportDefense then checks its remote and every path.
  r.post(`${base}/export`, handle(async (c) => {
    const body = await parse(c, exportBody);
    const { cfg, ref } = await find(c);
    const clone = await knownClone(await readProjectFile(ref.dir), body.clone, ctx.home);
    const profile = cfg.repos.find((p) => p.name === ref.repo);
    if (!profile) throw new InputError(`There's no repo profile for ${ref.repo}. Add it in Settings → Repos.`);
    return c.json(await write(ref, () => exportDefense({ dir: ref.dir, clone, profile, home: ctx.home })));
  }));

  return r;
}
```

- [ ] **Step 5: Mount them**

In `packages/service/src/app.ts`, add the import after `import { versionRoutes } from './routes/versions';`:
```ts
import { whiteboardRoutes } from './routes/whiteboard';
```
Then add this line after `app.route('/api', finalizeRoutes(ctx, rt));`:
```ts
  app.route('/api', whiteboardRoutes(ctx, rt));
```

- [ ] **Step 6: Run the tests**

Run:
```bash
pnpm vitest run packages/service/test/whiteboard-routes.test.ts packages/service/test/whiteboard.test.ts packages/service/test/threads.test.ts packages/service/test/finalize.test.ts
pnpm typecheck
pnpm test
pnpm test:e2e finalize.spec.ts loop.spec.ts
pnpm test:e2e
```
Expected: PASS.
- `whiteboard-routes.test.ts` has 11 tests.
- `threads.test.ts` and `finalize.test.ts` pass unchanged: Submit, + Question and Accept answer exactly as before.
- The e2e runs check that Submit all, Send this thread and Accept still work from the app.

- [ ] **Step 7: Commit**

```bash
git add packages/service/src/routes/respond.ts packages/service/src/routes/clones.ts packages/service/src/routes/whiteboard.ts packages/service/src/routes/threads.ts packages/service/src/routes/finalize.ts packages/service/src/app.ts packages/service/test/whiteboard-routes.test.ts
git commit -m "feat(service): routes to generate, study, practise, ask about and export the Whiteboard Defense" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Claude's side: dp_whiteboard, the whiteboard agent and the skill

The plugin learns the Whiteboard Defense:
- **The MCP server** gains `dp_whiteboard` (eight dp tools), lets `dp_context` fetch the whiteboard subagent's pack, and has `dp_wait` return `kind: 'whiteboard'` work instead of listening past it.
- **A new `whiteboard` agent** writes the defense from its pack, following the user's `outputs/whiteboard-defense.md`, and sends it once as JSON through `dp_whiteboard`.
- **The skill** starts one whiteboard subagent per request, in the foreground, and reports back. **The thread agent** learns that a Defense thread is answered from the pack's `defense` and never changes the draft.

**Files:**
- Create:
  - `plugin/agents/whiteboard.md`
- Modify:
  - `packages/mcp/src/tools.ts`
  - `plugin/skills/dev-plumbing/SKILL.md` (the subagent list, §3 Listen, a new §7, and one line in Rules)
  - `plugin/agents/thread.md` (one paragraph in step 2)
- Test:
  - `packages/mcp/test/tools.test.ts`
  - `packages/mcp/test/plugin.test.ts`
  - `packages/mcp/test/bridge.integration.test.ts`

**Interfaces:**
- Consumes:
  - From Task 1: `validDefenseInput()` from `packages/core/test/fixtures.ts` (three questions, two concerns).
  - From Task 3: `saveDefense`'s problems, the shape's included; a refusal for a request that isn't writing, `There's no Whiteboard Defense request ${id} waiting for a defense.`; and `finishWhiteboard`'s `error`.
  - From Task 4: the `WhiteboardPack` fields the agent text describes: `project`, `rulesFile`, `basedOn`, `documentFile`, `items` (with `file`, a clipped `body` and `data` for diagrams), `decisions`, `defaults`, `openItems` (with `status` and `blocking`), `conventions`, `sensitiveData`, `schema`, `apps`, `sections`, `diagramItemIds` and `previous`. Also `ThreadPack.defense` and `finalFile`, which the thread agent's new line names.
  - From Task 7:
    - `/api/claude/wait` returns `{ kind: 'whiteboard', request: <request id>, model, next }` and accepts `finished.whiteboard` and `finished.whiteboardError`;
    - `/api/claude/context` takes `whiteboard: true`;
    - `/api/claude/whiteboard` takes `{ repo, project, request, defense }` and returns `{ ok: true, request, level, questions, concerns, next }`.
  - From Task 8: `POST /api/projects/:repo/:id/whiteboard` (Generate) and `GET` of the same path, which the integration test uses as the browser.
  - From Task 2: the Defense type's id, `defense`, and `postReply`'s refusal of `change` and `smallEdits` on its threads.
- Produces:
  - **`TOOL_NAMES`** with `dp_whiteboard` (eight tools), and **`WORK_KINDS`** = `submission`, `finalize`, `detect-profile`, `whiteboard`.
  - **`dp_whiteboard`:** input `{ ...project, request: z.string().min(1), defense: z.record(z.unknown()).describe('The whole defense: see your instructions for its shape') }`, forwarded to `/whiteboard` as it is. The MCP server checks only that `defense` is an object: `saveDefense` checks the rest and lists every problem at once, the shape's (`${path}: ${message}`) with the project's (each section once and with a claim, the tables, the diagram items, the size). So one resend fixes them all, and the subagent never spends a retry on half the list.
  - **`dp_context`** gains `whiteboard: z.boolean().optional()`, and its description names it.
  - **`dp_wait`:** `finished` gains `whiteboard: z.string().min(1).optional()` and `whiteboardError: z.string().max(2000).optional()`. Its description names **Generate**, `kind whiteboard`, `{ whiteboard: <request id> }` (`finished.whiteboard`) and `whiteboardError`.
  - **`plugin/agents/whiteboard.md`:**
    - front matter `name: whiteboard`, a description, `tools: Read, Grep, Glob, mcp__plugin_dev-plumbing_dp__dp_context, mcp__plugin_dev-plumbing_dp__dp_whiteboard` and `color: green`;
    - steps that map the rules file's framework onto the `dp_whiteboard` JSON: the pack (Read `rulesFile` and `documentFile` first, and an item's `file` for what's cut short), writing from it only, tagging claims, keeping `previous`'s wording where it still applies, the level (with `sensitiveData`), which framework areas feed each of the ten sections, a size to keep to, the questions with their answers, real concerns only, and `checklist: []`, since the service copies the rules file's;
    - one `dp_whiteboard` call, retried at most three times, but never when it says there's no request waiting (it was cancelled or replaced: `Failed: the request was cancelled or replaced.`), then the exact one line: "Whiteboard Defense written: level <n>, <q> questions, <c> concerns." or "Failed: <what went wrong>".
  - **SKILL.md:**
    - the subagent list names `dev-plumbing:whiteboard`;
    - §3 Listen names **Generate** among the buttons `dp_wait` waits for, and lists `**kind: whiteboard**: write the Whiteboard Defense (7).`;
    - a new `## 7. Write the Whiteboard Defense`, before `## Rules`, mirroring §5. On a `Failed:` line it tells the user they can press **Try again** or **Generate** on the Whiteboard Defense page, and passes the line back as `finished.whiteboardError`;
    - `## Rules`' "Never answer a thread or write the final yourself" line also names the defense: "Never answer a thread, write the final or write the Whiteboard Defense yourself".

    Every other line stays byte for byte.
  - **`thread.md`:** one paragraph in step 2 says that in a Defense thread you answer from the pack's `defense` (and `finalFile`, when it explains the final), never send `change` or `smallEdits`, and resolve your answer when it needs nothing more from the person.

- [ ] **Step 1: Write the failing tests**

In `packages/mcp/test/tools.test.ts`, add this import after `import { createDpServer, TOOL_NAMES } from '../src/tools';`:
```ts
import { validDefenseInput } from '../../core/test/fixtures';
```
(`ServiceError` is already imported from `'../src/client'`.)
Replace the test `'offers exactly the seven dp tools'` with:
```ts
  it('offers exactly the eight dp tools', async () => {
    const { client } = fakeService({});
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    const names = ['dp_context', 'dp_finalize', 'dp_open', 'dp_reply', 'dp_repo_profile', 'dp_wait', 'dp_whiteboard', 'dp_write_items'];
    expect([...TOOL_NAMES].sort()).toEqual(names);
    expect((await mcp.listTools()).tools.map((t) => t.name).sort()).toEqual(names);
  });
```
Then add these two tests at the end of `describe('the dp tools', …)`, after `"passes a re-import's removed keys through dp_write_items"`:
```ts
  it("serves the whiteboard subagent's pack, sends its defense, and a bad basis is refused by the service with every problem listed", async () => {
    const PROBLEMS = [
      'Nothing was saved. Fix these and call dp_whiteboard again with the whole defense:',
      "- sections.0.claims.0.basis: Invalid enum value. Expected 'known' | 'inferred' | 'unknown' | 'verify', received 'maybe'",
      '- sections: walkthrough is missing.',
    ].join('\n');
    const { client, calls } = fakeService({
      '/context': () => ({ rulesFile: '/config/outputs/whiteboard-defense.md' }),
      '/whiteboard': (body) => {
        if (JSON.stringify(body.defense).includes('"maybe"')) throw new ServiceError(400, PROBLEMS);
        return { ok: true, request: 'g-1' };
      },
    });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    const pack = await mcp.callTool({ name: 'dp_context', arguments: { repo: 'acme', project: 'restock-reminders', whiteboard: true } });
    expect(JSON.parse(textOf(pack))).toEqual({ rulesFile: '/config/outputs/whiteboard-defense.md' });
    const defense = validDefenseInput();
    const sent = await mcp.callTool({ name: 'dp_whiteboard', arguments: { repo: 'acme', project: 'restock-reminders', request: 'g-1', defense } });
    expect(sent.isError).toBeFalsy();
    expect(calls).toEqual([
      { path: '/context', body: { repo: 'acme', project: 'restock-reminders', whiteboard: true } },
      { path: '/whiteboard', body: { repo: 'acme', project: 'restock-reminders', request: 'g-1', defense } },
    ]);
    // A bad basis is refused by the service with every problem listed, not by the MCP server with only its own.
    const maybe = { ...defense, sections: defense.sections.filter((s) => s.id !== 'walkthrough').map((s, i) => (i === 0 ? { ...s, claims: [{ text: 'Perhaps.', basis: 'maybe' }] } : s)) };
    const bad = await mcp.callTool({ name: 'dp_whiteboard', arguments: { repo: 'acme', project: 'restock-reminders', request: 'g-1', defense: maybe } });
    expect(bad.isError).toBe(true);
    expect(calls).toHaveLength(3);
    expect(textOf(bad)).toContain(PROBLEMS);
    const tools = (await mcp.listTools()).tools;
    const context = tools.find((t) => t.name === 'dp_context')!;
    expect(Object.keys(context.inputSchema.properties ?? {}).sort()).toEqual(['finalize', 'importType', 'project', 'repo', 'threadId', 'whiteboard']);
    expect(context.description).toContain('whiteboard: true');
    const whiteboard = tools.find((t) => t.name === 'dp_whiteboard')!;
    expect(whiteboard.inputSchema.properties?.defense).toMatchObject({ type: 'object', description: 'The whole defense: see your instructions for its shape' });
  });

  it('returns whiteboard work, and passes back the request it finished', async () => {
    const results: unknown[] = [{ kind: 'timeout' }, { kind: 'whiteboard', request: 'g-1', model: 'opus' }, { kind: 'submission', submission: 's-1' }];
    const { client, calls } = fakeService({ '/wait': () => results.shift() });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', retryMs: 1 }));
    const wait = async (finished?: Record<string, string>) =>
      JSON.parse(textOf(await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme', project: 'p', ...(finished ? { finished } : {}) } })));
    expect(await wait()).toEqual({ kind: 'whiteboard', request: 'g-1', model: 'opus' });
    const failed = { whiteboard: 'g-1', whiteboardError: 'Failed: the request was cancelled or replaced.' };
    expect(await wait(failed)).toMatchObject({ kind: 'submission' });
    expect(calls.map((c) => c.body.finished ?? null)).toEqual([null, null, failed]);
    const tool = (await mcp.listTools()).tools.find((t) => t.name === 'dp_wait')!;
    for (const s of ['Generate', 'kind whiteboard', '{ whiteboard: <request id> }', 'finished.whiteboard', 'whiteboardError']) expect(tool.description).toContain(s);
  });
```

In `packages/mcp/test/plugin.test.ts`, add the whiteboard agent to the `expected` map in `'gives each subagent only read tools and its own dp tools'`, which becomes:
```ts
    const expected: Record<string, string[]> = {
      'repo-setup': ['dp_repo_profile'],
      importer: ['dp_context', 'dp_write_items'],
      thread: ['dp_context', 'dp_reply'],
      finalizer: ['dp_context', 'dp_finalize'],
      whiteboard: ['dp_context', 'dp_whiteboard'],
    };
```
The new `## 7.` goes before `## Rules`, so it shifts the slice that ends §6. Replace the test `'runs the finalizer and the detection subagent in the foreground, before listening again'` with these two:
```ts
  it('runs the finalizer, the detection subagent and the whiteboard subagent in the foreground, before listening again', () => {
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md')).content;
    const section = (from: string, to: string) => skill.slice(skill.indexOf(from), skill.indexOf(to));
    const foreground = 'Run it in the foreground and wait for its line: calling `dp_wait` before it returns fails the request.';
    expect(section('## 5. Write the final', '## 6.')).toContain(foreground);
    expect(section('## 6. Detect the repo profile again', '## 7.')).toContain(foreground);
    expect(section('## 7. Write the Whiteboard Defense', '## Rules')).toContain(foreground);
  });

  it('has a whiteboard agent that writes the defense from its pack and sends it once through dp_whiteboard', () => {
    const agent = parseFrontMatter(read('plugin/agents/whiteboard.md'));
    expect(agent.data.color).toBe('green');
    for (const s of [
      'whiteboard: true',
      '`rulesFile`',
      '`documentFile`',
      'Read it first',
      '`file`',
      '`sensitiveData`',
      '`diagramItemIds`',
      '`previous`',
      'When a question or an unknown in `previous` still applies, keep its wording exactly',
      '**Write from the pack only.**',
      '`known`',
      '`inferred`',
      '`unknown`',
      '`verify`',
      'Mark a claim `known` only when the pack says it or you read it yourself.',
      '**Pick the level**',
      '**Fill every section in `sections`**',
      '`diagramItemId`',
      'one cell per column',
      "Don't invent concerns to fill the section",
      'Keep the whole defense under about 40,000 characters of JSON',
      'send `checklist: []`, because the service copies the rules file\'s checklist',
      'Call `dp_whiteboard` once',
      'at most three times',
      'Failed: the request was cancelled or replaced.',
      'Whiteboard Defense written: level <n>, <q> questions, <c> concerns.',
      'Failed: <what went wrong>',
    ]) {
      expect(agent.content).toContain(s);
    }
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md')).content;
    for (const s of [
      'dev-plumbing:whiteboard',
      '**kind: whiteboard**: write the Whiteboard Defense (7)',
      '**Generate**',
      '> Write the Whiteboard Defense for repo `<repo>`, plumbing project `<project>`, request `<request>`.',
      'finished: { whiteboard:',
      'whiteboardError',
      'also tell them they can press **Try again** or **Generate** on the Whiteboard Defense page',
      'Never answer a thread, write the final or write the Whiteboard Defense yourself.',
    ]) {
      expect(skill).toContain(s);
    }
    const thread = parseFrontMatter(read('plugin/agents/thread.md')).content;
    expect(thread).toContain("In a Defense thread, answer from the pack's `defense` and never send `change` or `smallEdits`");
    expect(thread).toContain('resolve the thread with your answer');
  });
```

In `packages/mcp/test/bridge.integration.test.ts`, replace:
```ts
import { makeRepo } from '../../core/test/fixtures';
```
with:
```ts
import { makeRepo, validDefenseInput } from '../../core/test/fixtures';
```
Then add this test at the end of the file, after `'asks before bringing a changed plan in, and brings it in on yes'`:
```ts
it('hands a Whiteboard Defense request to the window and takes the defense back', async () => {
  // Continues from the tests above: the project is at v2, with a final proposed but not accepted, so it defends the draft.
  const P = '/api/projects/acme-app/restock-reminders';
  const generated = await http(`${P}/whiteboard`, { method: 'POST', body: '{}' });
  expect(generated.request).toMatchObject({ state: 'requested' });
  const wait = json(await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme-app', project: 'restock-reminders' } }));
  expect(wait).toMatchObject({ kind: 'whiteboard', request: generated.request.id, model: 'opus' });
  const pack = json(await mcp.callTool({ name: 'dp_context', arguments: { repo: 'acme-app', project: 'restock-reminders', whiteboard: true } }));
  // The subagent Reads the rules file and the document the pack names.
  expect(fs.readFileSync(pack.rulesFile, 'utf8')).toMatch(/^# /);
  expect(pack.basedOn).toEqual({ doc: 'draft', version: 2 });
  expect(fs.readFileSync(pack.documentFile, 'utf8').length).toBeGreaterThan(0);
  // A bad basis and a missing section come back from the service together, in one refusal.
  const input = validDefenseInput();
  const bad = { ...input, sections: input.sections.filter((s) => s.id !== 'summary').map((s) => (s.id === 'data' ? { ...s, claims: [{ text: 'Perhaps.', basis: 'maybe' }] } : s)) };
  const refused = await mcp.callTool({ name: 'dp_whiteboard', arguments: { repo: 'acme-app', project: 'restock-reminders', request: generated.request.id, defense: bad } });
  expect(refused.isError).toBe(true);
  const problems = (refused as { content: { text: string }[] }).content[0]!.text;
  expect(problems).toContain('Nothing was saved. Fix these and call dp_whiteboard again with the whole defense:');
  expect(problems).toContain('- sections.2.claims.0.basis:');
  expect(problems).toContain('- sections: summary is missing.');
  const sent = await mcp.callTool({
    name: 'dp_whiteboard',
    arguments: { repo: 'acme-app', project: 'restock-reminders', request: generated.request.id, defense: input },
  });
  expect(sent.isError).toBeFalsy();
  expect(json(sent)).toMatchObject({ ok: true, request: generated.request.id, questions: 3, concerns: 2 });
  const view = await http(`${P}/whiteboard`);
  expect(view).toMatchObject({ request: null, defense: { basedOn: { kind: 'plan', doc: 'draft', version: 2 } }, stale: null });
}, 60_000);
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/mcp/test/tools.test.ts packages/mcp/test/plugin.test.ts`
Expected: FAIL, 6 tests.
- `TOOL_NAMES` has seven names, so the eight-tools test fails.
- There's no `dp_whiteboard`, so calling it is a tool error: `expected true to be falsy`.
- `dp_wait` listens past a `whiteboard` result and returns the submission after it: `expected { kind: 'submission', …(1) } to deeply equal { kind: 'whiteboard', …(2) }`.
- `plugin/agents/whiteboard.md` doesn't exist (ENOENT), in two plugin tests.
- SKILL.md has no `## 7.`, so the §6 slice is empty: `expected '' to contain 'Run it in the foreground…'`.

- [ ] **Step 3: Add `dp_whiteboard` and the `whiteboard` work kind**

All edits are in `packages/mcp/src/tools.ts`.

1. Replace:
```ts
export const TOOL_NAMES = ['dp_open', 'dp_repo_profile', 'dp_write_items', 'dp_wait', 'dp_context', 'dp_reply', 'dp_finalize'] as const;
/** dp_wait results that hand the window work. Anything else (a timeout) means keep listening. */
export const WORK_KINDS: ReadonlySet<string> = new Set(['submission', 'finalize', 'detect-profile']);
```
with:
```ts
export const TOOL_NAMES = ['dp_open', 'dp_repo_profile', 'dp_write_items', 'dp_wait', 'dp_context', 'dp_reply', 'dp_finalize', 'dp_whiteboard'] as const;
/** dp_wait results that hand the window work. Anything else (a timeout) means keep listening. */
export const WORK_KINDS: ReadonlySet<string> = new Set(['submission', 'finalize', 'detect-profile', 'whiteboard']);
```

2. In `dp_context`, replace:
```ts
      description: 'Get the context pack for one thread (threadId), for importing one plumbing type (importType), or for writing the final spec (finalize: true).',
      inputSchema: { ...project, threadId: z.string().optional(), importType: z.string().optional(), finalize: z.boolean().optional() },
```
with:
```ts
      description:
        'Get the context pack for one thread (threadId), for importing one plumbing type (importType), for writing the final spec (finalize: true), or for writing the Whiteboard Defense (whiteboard: true).',
      inputSchema: { ...project, threadId: z.string().optional(), importType: z.string().optional(), finalize: z.boolean().optional(), whiteboard: z.boolean().optional() },
```

3. Add `dp_whiteboard` after `dp_finalize`. Replace:
```ts
    async (args) => call('/finalize', args),
  );
```
with:
```ts
    async (args) => call('/finalize', args),
  );

  server.registerTool(
    'dp_whiteboard',
    {
      description:
        'Send the whole Whiteboard Defense you wrote for a Whiteboard Defense request: the level and its reasons, every section with its claims (each tagged known, inferred, unknown or verify), the questions with their answers, the release concerns and the checklist. The defense is checked as a whole. If anything is wrong, nothing is saved and the error lists every problem: fix them all and call dp_whiteboard again with the whole defense.',
      inputSchema: {
        ...project,
        request: z.string().min(1).describe('The Whiteboard Defense request id, from your prompt'),
        // Checked by the service, not here: saveDefense lists every problem at once, the shape's with the project's
        // (every section once, each with a claim, the tables, the diagram items, the size), so one resend fixes them all.
        defense: z.record(z.unknown()).describe('The whole defense: see your instructions for its shape'),
      },
    },
    async (args) => call('/whiteboard', args),
  );
```

4. In `dp_wait`, replace the description:
```ts
        "Listen for the user. Waits until they press Send this thread, Submit all or Start finalize in the app, or Detect again in Settings, sending progress while it waits. Then returns one piece of work: kind submission (the threads to answer in groups, one thread subagent per group, with the model to use), kind finalize (a finalize request for one finalizer subagent) or kind detect-profile (a repo whose profile the repo-setup subagent detects again). When you call it again, pass finished with what you just did: { submission, conflicts } after a submission, { finalize: <request id> } after a finalize (finished.finalize), or { detect: <repo> } after a detect-profile (finished.detect). If it returns still-waiting, call it again. If it returns replaced, a newer dp_wait for this project took over: stop.",
```
with:
```ts
        "Listen for the user. Waits until they press Send this thread, Submit all, Start finalize or Generate (on the Whiteboard Defense page) in the app, or Detect again in Settings, sending progress while it waits. Then returns one piece of work: kind submission (the threads to answer in groups, one thread subagent per group, with the model to use), kind finalize (a finalize request for one finalizer subagent), kind detect-profile (a repo whose profile the repo-setup subagent detects again) or kind whiteboard (a Whiteboard Defense request for one whiteboard subagent). When you call it again, pass finished with what you just did: { submission, conflicts } after a submission, { finalize: <request id> } after a finalize (finished.finalize), { detect: <repo> } after a detect-profile (finished.detect), or { whiteboard: <request id> } after a whiteboard (finished.whiteboard), with whiteboardError: the subagent's line when it starts with Failed:. If it returns still-waiting, call it again. If it returns replaced, a newer dp_wait for this project took over: stop.",
```
Then, in its `finished` object, replace:
```ts
            detect: z.string().min(1).optional().describe('The repo whose profile you just detected again'),
          })
```
with:
```ts
            detect: z.string().min(1).optional().describe('The repo whose profile you just detected again'),
            whiteboard: z.string().min(1).optional().describe('The Whiteboard Defense request you just handled'),
            whiteboardError: z.string().max(2000).optional().describe("The whiteboard subagent's line, when it starts with Failed:"),
          })
```
The `dp_wait` handler stays as it is: it returns any result whose kind is in `WORK_KINDS`, and passes `finished` on whole.

- [ ] **Step 4: Write the whiteboard agent**

`plugin/agents/whiteboard.md`:
````markdown
---
name: whiteboard
description: Writes the Whiteboard Defense for a dev-plumbing project, following the user's Whiteboard Defense rules, and sends it with dp_whiteboard. Used by the /dev-plumbing skill when the user presses Generate on the Whiteboard Defense page.
tools: Read, Grep, Glob, mcp__plugin_dev-plumbing_dp__dp_context, mcp__plugin_dev-plumbing_dp__dp_whiteboard
color: green
---

You write the Whiteboard Defense for a plumbing project: a defense of the plan that the engineer who ships it studies and practises, so they can explain how it works, what could fail and what's still unknown. Your prompt names the repo, the plumbing project and the Whiteboard Defense request. The repo is your working directory. Read code there only to check a claim, and never change anything. Your only way to write is `dp_whiteboard`.

1. Call `dp_context` with `repo`, `project` and `whiteboard: true`. You get:
   - `project`: its title and the plan's path.
   - `rulesFile`: the user's `outputs/whiteboard-defense.md` (or the shipped one): the Whiteboard Defense framework, its three review levels, its 13 output sections, its behavioural rules and its checklist. Read it first, whole, and follow it. It describes its output as Markdown; you send the same content as JSON (step 9), so the service can check it and the app can show it.
   - `basedOn` and `documentFile`: the plan you defend. Read `documentFile` next, whole. It's the final spec while the final is current (`basedOn.doc` is `final`), else the draft, at plan version `basedOn.version`.
   - `items`: every item of the plan, except parked ones and those of plumbing types the user turned off, with its plumbing type, title, summary, fields, status, code references and `dataSummary`. Its `body` is cut to 800 characters, and its `data`, the drawing, is there only for a diagram. `file` is the item's own JSON: Read it for the rest of a body, or for a table's, a flow's or a mockup's drawing, when a section needs it.
   - `decisions`: every decision, with `chosen` (the option chosen), `rejected` (the options turned down) and `why`.
   - `defaults`: the questions nobody answered, with the default the plan assumes for each.
   - `openItems`: every item not resolved or parked, with its `status` and whether it's `blocking`: the plan's open questions.
   - `conventions` and `sensitiveData`: the repo profile's conventions, and the kinds of sensitive data this repo handles. `schema` (the database schema file, or null) and `apps` (the repo's apps and their folders) are there to Read when a section needs them.
   - `sections`: the ten sections you fill, each with its `id`, its number among the 13 (`n`) and its title.
   - `diagramItemIds`: the items whose drawing is a diagram, which `diagramItemId` may name.
   - `previous`: the last defense's questions, and its statements marked `unknown` or `verify`; null when there's none. When a question or an unknown in `previous` still applies, keep its wording exactly: Practice keeps your ratings, and sent unknowns are matched, by text.
2. **Write from the pack only.** Defend the plan in `documentFile`, with what `items`, their files and drawings, and `decisions` add. Never invent architecture or behaviour: what the pack doesn't settle is unknown, and the defense says so. Read, Grep and Glob the repo only to check a claim the plan makes about code that exists.
3. **Tag every claim** with its `basis`, the four kinds the rules' Unknowns and Assumptions separate:
   - `known`: the plan, an item, a drawing or a decision says it, or you read it in the repo.
   - `inferred`: a reasonable conclusion from those, which nothing states outright.
   - `unknown`: an important question the pack can't answer.
   - `verify`: something to confirm by hand before release.

   Mark a claim `known` only when the pack says it or you read it yourself. Write each claim as one or two plain sentences, in the rules' language: "The plan says…", "This likely means…", "The plan doesn't say…". Never present a guess as known.
4. **Pick the level** (`level`), as the rules' Review Depth says: 1 (Lightweight) for a small, low-risk change, 2 (Standard) for a normal production feature, and 3 (High risk) when the plan touches anything the rules list for Level 3, such as authentication, authorization, payments, personal or health data, financial data, destructive operations, data migrations, external side effects or security boundaries. A plan that handles anything in `sensitiveData` is at least level 2, and level 3 when it stores, moves or shows it. Give 1 to 10 `levelReasons`, one short line each, naming what set the level. The level sets the depth: at level 1, keep each section short and to what the rules' Level 1 lists; at level 3, go deep on the areas the rules' Level 3 lists.
5. **Fill every section in `sections`**, once each, in that order, each with at least one claim and at most 40. Keep the whole defense under about 40,000 characters of JSON: one or two sentences a claim, usually 3–8 claims a section. Each takes the framework's areas the rules' Output Format gives it:
   - `summary` (1. Executive summary): Purpose. What it does, how it works, the overall risk (the level and why), and the few things the engineer must understand.
   - `diagram` (2. Whiteboard diagram): System Flow and Architecture. Put a plain-text diagram of the main flow in `diagram`, boxes and arrows as in the rules' example (at most 6,000 characters), with claims that walk through it. When one of `diagramItemIds` draws the plan's main flow, also name it in `diagramItemId`, and the app draws it too. Use only an id from `diagramItemIds`; with none, leave `diagramItemId` out.
   - `walkthrough` (3. System walkthrough): System Flow, Architecture, and State and Lifecycle: the feature from where it enters the system to where it ends, its behaviour rather than code trivia.
   - `data` (4. Data and state): Data Model, Source of Truth, Invariants, and State and Lifecycle. Put anything tabular in `tables`, at most 5, such as a source-of-truth table (the state, where it lives, what writes it). Each table has a `title`, 1 to 8 `columns`, and 1 to 50 `rows` with one cell per column.
   - `security` (5. Security model): Authentication, Authorization and Security: who can do what, tenant isolation, the attack surface, and how the plan treats anything in `sensitiveData`.
   - `failure` (6. Failure analysis): Failure Modes, Idempotency and Concurrency: what happens when a step fails, runs twice or races, partial failure, and how it's reconciled.
   - `tradeoffs` (7. Dependencies and tradeoffs): Dependencies and Tradeoffs, from `decisions`: what was chosen, what was turned down, and why.
   - `complexity` (8. Complexity review): Complexity. If the design is simple, say so. Don't recommend queues, caches, services or abstractions the problem doesn't need.
   - `readiness` (9. Production readiness): Observability, Debugging, Testing, Deployment, Rollback and Recovery, and Blast Radius.
   - `unknowns` (12. Unknowns): Unknowns and Assumptions: what the plan leaves open, each tagged `unknown` or `verify`, including the `openItems` that matter and the `defaults` the plan assumes.

   A section the plan doesn't touch still gets one claim saying so and why, as the rules' "mark it not applicable" asks.
6. **Questions** (section 10): the questions the engineer should be able to answer at a whiteboard, like the rules' examples, about this plan: 5 to 15 (at least 5), at most 40. Each has its answer `a`, written from the pack, and that answer's `basis`. When the pack can't answer one, say so in `a` and tag it `unknown`: those are the questions worth asking.
7. **Concerns** (section 11): only real issues to address before release, each with its `severity` (the rules' labels: `critical` should block release, `high` likely should, `medium` should be reviewed soon, `low` is cleanup, `info` is useful context), its `text` and its `basis`. Don't invent concerns to fill the section: when there are none, send an empty list.
8. **Checklist** (section 13): send `checklist: []`, because the service copies the rules file's checklist, word for word, so Practice keeps the user's ticks by each line's text. Only if the rules have no `[ ]` lines, write one: short lines the engineer should be able to tick, at most 40, each once.
9. Call `dp_whiteboard` once with `repo`, `project`, `request` and the whole defense as `defense`, shaped like this:
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
     "checklist": []
   }
   ```
   (The example is cut short: send all ten sections.) If it returns errors, nothing was saved: fix every problem listed and send the whole defense again, at most three times. If it says there's no Whiteboard Defense request waiting, the request was cancelled or replaced: stop at once and reply `Failed: the request was cancelled or replaced.` If it still fails after three tries, stop and reply with one line: `Failed: <what went wrong>`, with the last error, shortened.
10. Reply with exactly one line: "Whiteboard Defense written: level <n>, <q> questions, <c> concerns."
````

- [ ] **Step 5: Teach the skill to start the whiteboard subagent**

In `plugin/skills/dev-plumbing/SKILL.md`, every line stays byte for byte except these five edits.

1. Replace:
```markdown
Your tools are `dp_open` and `dp_wait`. The subagents are `dev-plumbing:repo-setup`, `dev-plumbing:importer`, `dev-plumbing:thread` and `dev-plumbing:finalizer`.
```
with:
```markdown
Your tools are `dp_open` and `dp_wait`. The subagents are `dev-plumbing:repo-setup`, `dev-plumbing:importer`, `dev-plumbing:thread`, `dev-plumbing:finalizer` and `dev-plumbing:whiteboard`.
```

2. In §3, replace:
```markdown
Call `dp_wait` with `repo` and `project`. It waits until the user presses **Send this thread**, **Submit all** or **Start finalize** in the app, or **Detect again** in Settings. Never call `dp_wait` while one is still running in the background for this project: that one is already listening.
```
with:
```markdown
Call `dp_wait` with `repo` and `project`. It waits until the user presses **Send this thread**, **Submit all**, **Start finalize** or **Generate** (on the Whiteboard Defense page) in the app, or **Detect again** in Settings. Never call `dp_wait` while one is still running in the background for this project: that one is already listening.
```

3. Still in §3, replace:
```markdown
- **kind: detect-profile**: detect the repo profile again (6).
```
with:
```markdown
- **kind: detect-profile**: detect the repo profile again (6).
- **kind: whiteboard**: write the Whiteboard Defense (7).
```

4. Insert the new section between §6 and `## Rules`. Replace:
```markdown
3. Call `dp_wait` again with `finished: { detect: "<repo>" }`. Then go back to 3.

## Rules
```
with:
```markdown
3. Call `dp_wait` again with `finished: { detect: "<repo>" }`. Then go back to 3.

## 7. Write the Whiteboard Defense

The user pressed **Generate** (or **Regenerate**, or **Try again**) on the Whiteboard Defense page in the app. The result has `request`, the Whiteboard Defense request's id, and `model`.

1. Start one `dev-plumbing:whiteboard` subagent with the result's `model`. Run it in the foreground and wait for its line: calling `dp_wait` before it returns fails the request. Prompt, filled in:
   > Write the Whiteboard Defense for repo `<repo>`, plumbing project `<project>`, request `<request>`.
2. It returns one line. Tell the user that line. If it starts with `Failed:`, also tell them they can press **Try again** or **Generate** on the Whiteboard Defense page. Don't look at anything else: the user studies and practises the defense in the app.
3. Call `dp_wait` again with `finished: { whiteboard: "<the request id>" }`. If the line starts with `Failed:`, add it as `whiteboardError`, so the page shows why. Then go back to 3.

## Rules
```

5. In `## Rules`, name the defense among what you never write yourself. Replace:
```markdown
- Never answer a thread or write the final yourself. That's what the thread and finalizer subagents are for.
```
with:
```markdown
- Never answer a thread, write the final or write the Whiteboard Defense yourself. That's what the thread, finalizer and whiteboard subagents are for.
```

- [ ] **Step 6: Tell the thread agent about Defense threads**

In `plugin/agents/thread.md`, replace:
```markdown
   If the thread has no message from the person yet, the service sent it to you: a Plan changes thread, for example, made when the plan changed in the repo. There's nothing to answer, so do what the plumbing type's Rules say, using the item's body and the draft.
```
with:
```markdown
   If the thread has no message from the person yet, the service sent it to you: a Plan changes thread, for example, made when the plan changed in the repo. There's nothing to answer, so do what the plumbing type's Rules say, using the item's body and the draft.

   In a Defense thread, answer from the pack's `defense` and never send `change` or `smallEdits`: the person is asking about the project's Whiteboard Defense (the pack's `defense`, as Markdown, with the part they asked about in the item's body), and a Defense thread can't change the draft. Read `finalFile` when the defense explains the final. When your answer needs nothing more from them, resolve the thread with your answer, as the type's Rules say: they can reply to carry on.
```

- [ ] **Step 7: Run the tests**

Run:
```bash
pnpm vitest run packages/mcp/test/tools.test.ts packages/mcp/test/plugin.test.ts
pnpm typecheck
pnpm test
pnpm test:integration
```
Expected: PASS.
- `tools.test.ts` has 14 tests, and `plugin.test.ts` 12.
- `bridge.integration.test.ts` has 4. The last one carries a Whiteboard Defense from Generate in the app, through the real MCP server's `dp_wait`, `dp_context` and `dp_whiteboard`, to a saved defense based on the draft's v2.

- [ ] **Step 8: Commit**

```bash
git add packages/mcp/src/tools.ts packages/mcp/test/tools.test.ts packages/mcp/test/plugin.test.ts packages/mcp/test/bridge.integration.test.ts plugin/agents/whiteboard.md plugin/agents/thread.md plugin/skills/dev-plumbing/SKILL.md
git commit -m "feat(plugin): Claude writes the Whiteboard Defense with a whiteboard subagent and dp_whiteboard" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Web: the Whiteboard Defense page, generating it, and export

The header's **Whiteboard Defense**, the sidebar's Review entry and the phone's Defense tab now open a real page. It says what a defense is, asks a Claude window for one with **Generate**, says where the request is (with **Cancel**, or **Dismiss** once it failed), and once a defense is saved shows what it's based on, why its level, whether it's out of date, a Study / Practice switch and **Export .md**. Study shows only its contents in this task, and Practice nothing: Tasks 11 and 12 fill them in. The page already keeps Practice's place (the card on show and its deck), so going to Study and back keeps it.

**Files:**
- Create:
  - `packages/web/src/pages/defense/DefensePage.tsx`
  - `packages/web/src/pages/defense/ExportForm.tsx`
  - `packages/web/src/pages/defense/StudyView.tsx` (the contents only; Task 11 replaces it whole)
  - `packages/web/src/pages/defense/PracticeView.tsx` (renders nothing; Task 12 replaces it whole)
  - `packages/web/src/pages/defense/testkit.ts` (the component tests' data, used by Tasks 11 and 12 too)
  - `packages/web/src/pages/defense/DefensePage.test.tsx`
  - `packages/web/e2e/defense.spec.ts`
- Modify:
  - `packages/web/src/api/client.ts` (the whiteboard methods)
  - `packages/web/src/router.tsx` (the `defense` route, with `?mode=`)
  - `packages/web/src/pages/ProjectHeader.tsx` (Whiteboard Defense becomes a link)
  - `packages/web/src/pages/ProjectNav.tsx` (the Review link, with "Not yet" or "Out of date")
  - `packages/web/src/pages/ProjectLayout.tsx` (the phone's Defense tab opens the page; Submit all steps back there)
  - `packages/web/src/pages/ProjectNav.test.tsx` (the link lists gain Whiteboard Defense; three new tests)
  - `packages/web/src/pages/ProjectHeader.test.tsx` (one new test)
  - `packages/web/e2e/claude.ts` (`defenseInput()` and `writeDefense()`)
- Test:
  - `packages/web/src/pages/defense/DefensePage.test.tsx`
  - `packages/web/src/pages/ProjectNav.test.tsx`
  - `packages/web/src/pages/ProjectHeader.test.tsx`
  - `packages/web/e2e/defense.spec.ts`

**Interfaces:**
- Consumes:
  - Task 1 (`@dev-plumbing/core/schemas`): `WhiteboardView`, `WhiteboardDefense`, `WhiteboardRequest`, `DefenseExport`, `DefenseLink`, `PracticeView`, `Rating`, `GenerateWhiteboardResponse`, `AskDefenseResponse`, `SendFromDefenseResponse`, `LEVEL_NAMES`, `DEFENSE_SECTIONS` and `DEFENSE_PARTS`.
  - Task 3: `ProjectHome.defense: { ready: boolean; stale: boolean; state: WhiteboardState | null }`, filled by `loadProjectHome`.
  - Task 6: the exported file is `defenseMarkdown`, so it starts `# Whiteboard Defense: `, has `## 5. Security model`, and lists the checklist as `- [ ] <line>`.
  - Task 7: `POST /api/claude/wait` returns `{ kind: 'whiteboard', … }` for a requested defense, and `POST /api/claude/whiteboard` with `{ repo, project, request, defense }` saves it, with the installed rules file's 20 checklist lines in place of the payload's, and returns `{ ok: true, request, level, questions, concerns, next }`. The e2e helpers read the request's id from `GET …/whiteboard` (`view.request.id`), never from `/wait`.
  - Task 8: the browser routes under `/api/projects/:repo/:id/whiteboard` (GET, POST, `/cancel`, `/ask`, `/send`, `/practice/rating`, `/practice/tick`, `/export`), each write followed by a project event. `clones` lists the clones as `FinalizeView.clones` does (real paths, the source first), and `exportPath` is relative to a clone.
  - Plans 1–5: `Button`, `buttonClass`, `Segmented`, `inputClass`, `formatUpdated` (`lib/time.ts`), `exportedPath` (`pages/finalize/ProposalView.tsx`), `routerMock` (`pages/visual/testkit.tsx`), and the e2e helpers `importProject`, `asClaude`, `api`, `fixtureRepo`, `PLAN_TEXT` and `noSideScroll`.
- Produces:
  - `web/src/api/client.ts`, exactly as in the Contracts: `api.whiteboard`, `api.generateWhiteboard`, `api.cancelWhiteboard`, `api.askAboutDefense`, `api.sendFromDefense`, `api.ratePractice`, `api.tickPractice` and `api.exportDefense`.
  - The route `/p/$repo/$project/defense` → `DefensePage`, with `validateSearch` giving `{ mode: 'study' | 'practice' }` (default `'study'`). Links may leave the search out.
  - From `pages/defense/DefensePage.tsx`: `DefensePage`, `DefenseBody({ repo, project, mode })` (for tests), `type DefenseMode = 'study' | 'practice'`, `type DefenseViewProps = { view: WhiteboardView & { defense: WhiteboardDefense }; repo: string; project: string }` (the props Study takes), `type PracticePlace = { card: number; deck: string[] | null }` and `type PracticeViewProps = DefenseViewProps & { place: PracticePlace; onPlace: (place: PracticePlace) => void }` (the props Practice takes), `statusLine(v)` and `defenseMeta(d)`.
  - `ExportForm({ repo, project, clones, exportPath, exportedTo })` from `pages/defense/ExportForm.tsx`.
  - `contents(d)` and `Contents({ defense })` from `pages/defense/StudyView.tsx`, and `StudyView(props: DefenseViewProps)`; `PracticeView(props: PracticeViewProps)`.
  - `pages/defense/testkit.ts` (only tests import it): `AT`, `EXPORT_PATH`, `defense(over?)`, `practice(over?)`, `link(over?)`, `view(over?)`, `withDefense(over?)` and `type DefenseView`.
  - `e2e/claude.ts`: `defenseInput(): Json` (a valid `dp_whiteboard` payload with `checklist: []`, as the agent sends it: the service copies the rules file's 20 lines) and `writeDefense(p, input = defenseInput(), windowId?)`, which generates and saves a defense as a Claude window would.
  - Test ids: `defense`, `defense-status`, `defense-meta`, `defense-stale`, `defense-generate`, `defense-cancel`, `defense-dismiss`, `defense-export`, `export-target`, `defense-exported` and `nav-defense`.
- **Behaviour:**
  - **Getting there:** the header's Whiteboard Defense is a link styled as a secondary button. The sidebar's Review entry links to the page, with a quiet trailing "Writing…" while a request is requested or being written, else "Not yet" until a defense is saved, "Out of date" while it's stale, and nothing while it's current. On a phone, the Defense tab opens the page and stays selected there.
  - **One primary:** on this page, the header's Submit all isn't primary and the phone's Submit all bar isn't shown, as on Finalize. The page's own primary is **Generate** (no defense yet), **Try again** (the last request failed) or **Regenerate** (out of date). Otherwise Regenerate is secondary, and nothing on the page is primary.
  - **The status line** (`defense-status`):
    - `requested`: "Waiting for Claude to write the Whiteboard Defense." while a Claude window is listening, else "No Claude window is listening. Run /dev-plumbing in any clone.";
    - `writing`: "Claude is writing the Whiteboard Defense. Threads you send now wait until it's done." while a window is listening or busy (writing takes the only window for ten minutes or more), else the no-window line;
    - `failed`: the request's `reason` (the subagent's own `Failed: …` line, or "The whiteboard subagent didn't send a Whiteboard Defense."), in seal.

    While a request is requested or writing, Cancel (`defense-cancel`) stands where Generate was. Once it failed, a quiet **Dismiss** (`defense-dismiss`, small and secondary, as Cancel) sits beside **Try again** and calls `cancelWhiteboard`, so a failed regenerate can be cleared off a defense that's still good. When `canGenerate` is false for another reason (the plan is importing), Generate is off with `generateRefusal` beside it. A refused POST shows the service's message (`role="alert"`).
  - **With no defense:** the intro line, Generate, and nothing else. **With one:** the meta line (`defense-meta`), the level reasons (keyed by their place, so two the same don't collide), the stale line in seal (`defense-stale`), the Study / Practice segmented control ("Whiteboard Defense mode"), then Study or Practice, then Export .md. The defense on show stays, with Study and Practice working, while a new one is being written.
  - **The mode** is the address's `?mode=`; the segmented control navigates to it.
  - **Practice's place** (`PracticePlace`: the card on show and the "Only shaky and couldn't" deck) is state in `DefenseBody`, passed to Practice with `onPlace`, so switching to Study and back keeps it. It belongs to one defense: a regenerated one starts at card 1, with the whole deck.
  - **Export .md:** "Export into", a clone select (the source first, marked "(source)"), the target path, then "Replaces the file there." once the defense has been exported, a secondary **Export .md**, and `Exported to ${clone}/${path}.` from the export just made or the one the defense remembers. With no clone on this Mac it says so, as the accept form does.
  - **Live updates:** the query key is `['whiteboard', repo, project]`, so a project event refreshes the page.

- [ ] **Step 1: Write the failing component tests**

`packages/web/src/pages/defense/testkit.ts`:
```ts
// Helpers for the Whiteboard Defense page's component tests. Only test files import this.
import type { DefenseLink, PracticeView, WhiteboardDefense, WhiteboardView } from '@dev-plumbing/core/schemas';

export const AT = '2026-10-06T09:00:00.000Z';
export const EXPORT_PATH = 'docs/specs/restock-reminders.whiteboard-defense.md';

type Section = WhiteboardDefense['sections'][number];
const section = (id: Section['id'], title: string, claims: Section['claims'], over: Partial<Section> = {}): Section => ({
  id,
  title,
  claims,
  tables: [],
  diagram: null,
  diagramItemId: null,
  ...over,
});

/**
 * A saved defense, overridden as needed. Security model has an Inferred claim and an Unknown one (security.1),
 * Failure analysis a Verify before release one, Data and state a table and Whiteboard diagram a text diagram.
 * Three questions, a high concern (c1) and an informational one (c2), and four checklist lines.
 */
export function defense(over: Partial<WhiteboardDefense> = {}): WhiteboardDefense {
  return {
    id: 'w-1',
    generatedAt: AT,
    basedOn: { kind: 'plan', doc: 'draft', version: 1, inputsHash: 'h'.repeat(64) },
    level: 2,
    levelReasons: ['It sends messages to customers.', 'It adds a daily job.'],
    sections: [
      section('summary', 'Executive summary', [{ text: 'A daily job reminds customers before an item runs out.', basis: 'known' }]),
      section('diagram', 'Whiteboard diagram', [{ text: 'The job reads subscriptions and sends by SMS.', basis: 'inferred' }], { diagram: 'job --> sms' }),
      section('walkthrough', 'System walkthrough', [{ text: 'The job runs at 9:00 and picks due subscriptions.', basis: 'known' }]),
      section('data', 'Data and state', [{ text: 'Each reminder sent is a row.', basis: 'known' }], {
        tables: [{ title: 'Source of truth', columns: ['Data', 'Owner'], rows: [['Reminders', 'reminders table'], ['Opt-outs', 'SMS provider']] }],
      }),
      section('security', 'Security model', [
        { text: 'Only the job sends reminders.', basis: 'inferred' },
        { text: 'Who can change the lead time.', basis: 'unknown' },
      ]),
      section('failure', 'Failure analysis', [{ text: 'A second run would send every reminder again.', basis: 'verify' }]),
      section('tradeoffs', 'Dependencies and tradeoffs', [{ text: 'SMS needs a provider account.', basis: 'known' }]),
      section('complexity', 'Complexity review', [{ text: 'One job and one table.', basis: 'known' }]),
      section('readiness', 'Production readiness', [{ text: 'Sends are logged.', basis: 'inferred' }]),
      section('unknowns', 'Unknowns', [{ text: 'How many customers opt out of SMS.', basis: 'unknown' }]),
    ],
    questions: [
      { id: 'q1', q: 'What happens if the job runs twice?', a: 'Every reminder goes out again, so it needs a sent marker.', basis: 'inferred' },
      { id: 'q2', q: 'Where is a reminder recorded?', a: 'In the reminders table.', basis: 'known' },
      { id: 'q3', q: 'Who can change the lead time?', a: 'Not decided yet.', basis: 'unknown' },
    ],
    concerns: [
      { id: 'c1', severity: 'high', text: 'A double run spams customers.', basis: 'verify' },
      { id: 'c2', severity: 'info', text: 'SMS costs grow with customers.', basis: 'inferred' },
    ],
    checklist: [
      { id: 'k1', text: 'I can draw the system from memory.' },
      { id: 'k2', text: 'I can explain the data flow.' },
      { id: 'k3', text: 'I know the source of truth.' },
      { id: 'k4', text: 'I know what breaks first.' },
    ],
    ...over,
  };
}

/** Practice before anything is rated or ticked, overridden as needed. */
export function practice(over: Partial<PracticeView> = {}): PracticeView {
  return { ratings: {}, ticks: [], readiness: 0, counts: { could: 0, shaky: 0, couldnt: 0, unrated: 3, ticked: 0, checklist: 4 }, ...over };
}

/** A thread asked about, or an item sent from, the defense. */
export function link(over: Partial<DefenseLink> = {}): DefenseLink {
  return {
    kind: 'section',
    ref: 'security',
    itemId: 'defense-who-can-change-it',
    threadId: 't-defense-who-can-change-it',
    typeId: 'defense',
    title: 'Who can change it?',
    status: 'with_claude',
    ...over,
  };
}

/** The page's data: the defense above, nothing under way, overridden as needed. */
export function view(over: Partial<WhiteboardView> = {}): WhiteboardView {
  return {
    request: null,
    defense: defense(),
    stale: null,
    practice: practice(),
    asked: [],
    sent: [],
    canGenerate: true,
    generateRefusal: null,
    listening: null,
    clones: [{ path: '/Users/you/acme-app', source: true }],
    exportPath: EXPORT_PATH,
    ...over,
  };
}

export type DefenseView = WhiteboardView & { defense: WhiteboardDefense };
/** view(), typed as Study and Practice take it. */
export const withDefense = (over: Partial<DefenseView> = {}): DefenseView => view(over) as DefenseView;
```

`packages/web/src/pages/defense/DefensePage.test.tsx`:
```tsx
import type { WhiteboardView } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api/client';
import { formatUpdated } from '../../lib/time';
import { DefenseBody, type DefenseMode } from './DefensePage';
import { AT, defense, EXPORT_PATH, view } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockClear();
});

const NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';
const WRITING = "Claude is writing the Whiteboard Defense. Threads you send now wait until it's done.";
const GAVE_UP = "The whiteboard subagent didn't send a Whiteboard Defense.";
const INTRO = "Claude writes a defense of this plan: how it works, what could fail and what's still unknown. Then you study it and practise explaining it.";
const REQUESTED = { id: 'g-1', state: 'requested' as const, requestedAt: AT };
const PICKED_UP = { ...REQUESTED, state: 'writing' as const, pickedUpAt: AT, pickedUpBy: 'w-1' };
const FAILED = { ...PICKED_UP, state: 'failed' as const, failedAt: AT, reason: GAVE_UP };

function show(v: WhiteboardView, mode: DefenseMode = 'study') {
  const whiteboard = vi.spyOn(api, 'whiteboard').mockResolvedValue(v);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DefenseBody repo="acme-app" project="restock" mode={mode} />
    </QueryClientProvider>,
  );
  return whiteboard;
}

const primaries = () => screen.getAllByRole('button').filter((b) => b.className.includes('bg-button'));

describe('the Whiteboard Defense page', () => {
  it('says what a defense is before there is one, and Generate is the main action', async () => {
    const whiteboard = show(view({ defense: null, practice: null }));
    const generate = vi.spyOn(api, 'generateWhiteboard').mockResolvedValue({ request: REQUESTED, listening: null, message: NO_WINDOW });
    expect(await screen.findByText(INTRO)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Whiteboard Defense' })).toBeTruthy();
    expect(screen.getByText('If you ship it, you should be able to explain it.')).toBeTruthy();
    const button = screen.getByTestId('defense-generate');
    expect(button.textContent).toBe('Generate');
    expect(button.className).toContain('bg-button');
    // Nothing to study, practise or export yet.
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByTestId('defense-meta')).toBeNull();
    expect(screen.queryByTestId('defense-export')).toBeNull();
    expect(screen.queryByTestId('defense-status')).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(generate).toHaveBeenCalledWith('acme-app', 'restock'));
    // The page asks again, so it shows the request the service just saved.
    await waitFor(() => expect(whiteboard).toHaveBeenCalledTimes(2));
  });

  it('says where the request is, and offers Cancel in place of Generate while it runs', async () => {
    const cases: [WhiteboardView, string][] = [
      [view({ defense: null, practice: null, request: REQUESTED, listening: 'waiting', canGenerate: false }), 'Waiting for Claude to write the Whiteboard Defense.'],
      [view({ defense: null, practice: null, request: REQUESTED, listening: null, canGenerate: false }), NO_WINDOW],
      [view({ request: PICKED_UP, listening: 'busy', canGenerate: false }), WRITING],
      [view({ request: PICKED_UP, listening: null, canGenerate: false }), NO_WINDOW],
    ];
    for (const [v, text] of cases) {
      show(v);
      const status = await screen.findByTestId('defense-status');
      expect(status.textContent).toBe(text);
      expect(status.className).toContain('text-ink-2');
      expect(screen.queryByTestId('defense-generate')).toBeNull();
      expect(screen.getByTestId('defense-cancel').textContent).toBe('Cancel');
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('cancels a request that is under way', async () => {
    const whiteboard = show(view({ request: PICKED_UP, listening: 'busy', canGenerate: false }));
    const cancel = vi.spyOn(api, 'cancelWhiteboard').mockResolvedValue({ ok: true });
    fireEvent.click(await screen.findByTestId('defense-cancel'));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('acme-app', 'restock'));
    await waitFor(() => expect(whiteboard).toHaveBeenCalledTimes(2));
  });

  it('says the subagent gave up, and Try again is the main action', async () => {
    show(view({ request: FAILED }));
    const generate = vi.spyOn(api, 'generateWhiteboard').mockResolvedValue({ request: REQUESTED, listening: 'waiting', message: 'Waiting for Claude to write the Whiteboard Defense.' });
    const status = await screen.findByTestId('defense-status');
    expect(status.textContent).toBe(GAVE_UP);
    expect(status.className).toContain('text-seal');
    const button = screen.getByTestId('defense-generate');
    expect(button.textContent).toBe('Try again');
    expect(button.className).toContain('bg-button');
    expect(screen.queryByTestId('defense-cancel')).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(generate).toHaveBeenCalledWith('acme-app', 'restock'));
  });

  it('dismisses a failed request, leaving the defense as it was', async () => {
    const whiteboard = show(view({ request: FAILED }));
    const cancel = vi.spyOn(api, 'cancelWhiteboard').mockResolvedValue({ ok: true });
    const dismiss = await screen.findByTestId('defense-dismiss');
    expect(dismiss.textContent).toBe('Dismiss');
    // Quiet, beside Try again, which stays the main action.
    expect(dismiss.className).not.toContain('bg-button');
    expect(primaries().map((b) => b.textContent)).toEqual(['Try again']);
    fireEvent.click(dismiss);
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('acme-app', 'restock'));
    await waitFor(() => expect(whiteboard).toHaveBeenCalledTimes(2));
    // Nothing to dismiss without a failed request.
    cleanup();
    show(view());
    await screen.findByTestId('defense-generate');
    expect(screen.queryByTestId('defense-dismiss')).toBeNull();
  });

  it('says what the defense is based on and why its level, and Regenerate steps back while it is current', async () => {
    show(view());
    expect((await screen.findByTestId('defense-meta')).textContent).toBe(`Level 2 · Standard · Based on the draft (v1) · Generated ${formatUpdated(AT)}`);
    expect(screen.getByText('It sends messages to customers.')).toBeTruthy();
    expect(screen.getByText('It adds a daily job.')).toBeTruthy();
    expect(screen.queryByTestId('defense-stale')).toBeNull();
    expect(screen.queryByText(INTRO)).toBeNull();
    expect(screen.getByTestId('defense-generate').textContent).toBe('Regenerate');
    // Nothing needs doing, so nothing on the page is the main action.
    expect(primaries()).toHaveLength(0);
  });

  it('names a final it was based on, and its level', async () => {
    show(view({ defense: defense({ level: 3, basedOn: { kind: 'plan', doc: 'final', version: 2, inputsHash: 'f'.repeat(64) } }) }));
    expect((await screen.findByTestId('defense-meta')).textContent).toBe(`Level 3 · High risk · Based on the final (v2) · Generated ${formatUpdated(AT)}`);
  });

  it('says when it is out of date, and makes Regenerate the one main action', async () => {
    show(view({ stale: 'Out of date: the plan changed since this was generated.' }));
    const stale = await screen.findByTestId('defense-stale');
    expect(stale.textContent).toBe('Out of date: the plan changed since this was generated.');
    expect(stale.className).toContain('text-seal');
    expect(primaries().map((b) => b.textContent)).toEqual(['Regenerate']);
  });

  it("won't generate while the plan is importing, and says why", async () => {
    const refusal = "The plan is still importing. Generate the Whiteboard Defense once that's done.";
    show(view({ defense: null, practice: null, canGenerate: false, generateRefusal: refusal }));
    const button = (await screen.findByTestId('defense-generate')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(refusal)).toBeTruthy();
  });

  it("shows why the service wouldn't generate it", async () => {
    show(view({ defense: null, practice: null }));
    vi.spyOn(api, 'generateWhiteboard').mockRejectedValue(new ApiError(409, 'The Whiteboard Defense is already being written.', null));
    fireEvent.click(await screen.findByTestId('defense-generate'));
    expect((await screen.findByRole('alert')).textContent).toBe('The Whiteboard Defense is already being written.');
  });

  it('switches between Study and Practice through the address', async () => {
    show(view());
    const tabs = await screen.findByRole('tablist', { name: 'Whiteboard Defense mode' });
    expect(within(tabs).getByRole('tab', { name: 'Study' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Practice' }));
    expect(navigate).toHaveBeenCalledWith({ to: '/p/$repo/$project/defense', params: { repo: 'acme-app', project: 'restock' }, search: { mode: 'practice' } });
    cleanup();
    show(view(), 'practice');
    expect((await screen.findByRole('tab', { name: 'Practice' })).getAttribute('aria-selected')).toBe('true');
  });

  it('starts Study with the contents, all 13 parts in order', async () => {
    show(view());
    const contents = await screen.findByRole('navigation', { name: 'Contents' });
    const links = within(contents).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual([
      '1. Executive summary',
      '2. Whiteboard diagram',
      '3. System walkthrough',
      '4. Data and state',
      '5. Security model',
      '6. Failure analysis',
      '7. Dependencies and tradeoffs',
      '8. Complexity review',
      '9. Production readiness',
      '10. Questions the engineer should be able to answer',
      '11. Release concerns',
      '12. Unknowns',
      '13. Checklist',
    ]);
    expect(links[4]!.getAttribute('href')).toBe('#defense-section-security');
    expect(links[9]!.getAttribute('href')).toBe('#defense-questions');
    expect(links[12]!.getAttribute('href')).toBe('#defense-checklist');
  });
});

describe('Export .md', () => {
  const CLONES = [
    { path: '/Users/you/acme-app', source: true },
    { path: '/Users/you/acme-app-review', source: false },
  ];

  it('exports into the chosen clone, the source first, and says where it went', async () => {
    show(view({ clones: CLONES }));
    const exportDefense = vi.spyOn(api, 'exportDefense').mockResolvedValue({ exportedTo: { clone: '~/acme-app-review', path: EXPORT_PATH, at: AT } });
    const form = await screen.findByTestId('defense-export');
    const select = within(form).getByLabelText('Export into') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['/Users/you/acme-app (source)', '/Users/you/acme-app-review']);
    expect(select.value).toBe('/Users/you/acme-app');
    const target = within(form).getByTestId('export-target');
    expect(target.textContent).toBe(`/Users/you/acme-app/${EXPORT_PATH}`);
    expect(within(form).queryByText('Replaces the file there.')).toBeNull();
    fireEvent.change(select, { target: { value: '/Users/you/acme-app-review' } });
    expect(target.textContent).toBe(`/Users/you/acme-app-review/${EXPORT_PATH}`);
    const button = within(form).getByRole('button', { name: 'Export .md' });
    expect(button.className).not.toContain('bg-button');
    fireEvent.click(button);
    await waitFor(() => expect(exportDefense).toHaveBeenCalledWith('acme-app', 'restock', '/Users/you/acme-app-review'));
    expect((await within(form).findByTestId('defense-exported')).textContent).toBe(`Exported to ~/acme-app-review/${EXPORT_PATH}.`);
    expect(within(form).getByText('Replaces the file there.')).toBeTruthy();
  });

  it('says where the last export went, and that the next one replaces it', async () => {
    show(view({ defense: defense({ exportedTo: { clone: '~/Source/acme-app', path: EXPORT_PATH, at: AT } }) }));
    expect((await screen.findByTestId('defense-exported')).textContent).toBe(`Exported to ~/Source/acme-app/${EXPORT_PATH}.`);
    expect(screen.getByText('Replaces the file there.')).toBeTruthy();
  });

  it('shows why Export was refused', async () => {
    show(view());
    vi.spyOn(api, 'exportDefense').mockRejectedValue(new ApiError(400, "/Users/you/acme-app isn't a clone of acme-app.", null));
    fireEvent.click(await screen.findByRole('button', { name: 'Export .md' }));
    expect((await screen.findByRole('alert')).textContent).toBe("/Users/you/acme-app isn't a clone of acme-app.");
  });

  it("says so when none of the project's clones is on this Mac", async () => {
    show(view({ clones: [] }));
    expect(await screen.findByText('None of the clones this project was opened from is on this Mac.')).toBeTruthy();
    expect(screen.queryByLabelText('Export into')).toBeNull();
    expect((screen.getByRole('button', { name: 'Export .md' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

`packages/web/src/pages/ProjectNav.test.tsx` becomes:
```tsx
import type { ProjectHome } from '@dev-plumbing/core/schemas';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectNav } from './ProjectNav';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('./visual/testkit')).routerMock(navigate));

afterEach(cleanup);

const CURRENT: ProjectHome['defense'] = { ready: true, stale: false, state: null };

/**
 * The parts of the project home the navigation reads: no types, the three documents, the plan's version, and the
 * Whiteboard Defense (saved and current unless given).
 */
const home = (version: { current: number; count: number }, defense = CURRENT) =>
  ({
    summary: { counts: { yourTurn: 0 } },
    types: [],
    documents: { original: true, draft: true, final: false },
    version,
    defense,
  }) as unknown as ProjectHome;

const links = () => screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]);

describe('ProjectNav documents', () => {
  it('lists Original and Draft plainly while the plan has one version', () => {
    render(<ProjectNav home={home({ current: 1, count: 1 })} repo="acme-app" project="restock" />);
    expect(links()).toEqual([
      ['Inbox', '/p/acme-app/restock'],
      ['Original', '/p/acme-app/restock/d/original'],
      ['Draft', '/p/acme-app/restock/d/draft'],
      ['Whiteboard Defense', '/p/acme-app/restock/defense'],
    ]);
    expect(screen.queryByText('Versions')).toBeNull();
  });

  it('says which version Original and Draft are, and adds Versions after them, once there is a v2', () => {
    render(<ProjectNav home={home({ current: 2, count: 2 })} repo="acme-app" project="restock" />);
    expect(links()).toEqual([
      ['Inbox', '/p/acme-app/restock'],
      ['Original (v2)', '/p/acme-app/restock/d/original'],
      ['Draft (v2)', '/p/acme-app/restock/d/draft'],
      ['Versions', '/p/acme-app/restock/versions'],
      ['Whiteboard Defense', '/p/acme-app/restock/defense'],
    ]);
    // Final isn't written yet, and has no version.
    expect(screen.getByText('Final')).toBeTruthy();
  });
});

describe('ProjectNav review', () => {
  const ONE = { current: 1, count: 1 };
  const defenseLink = () => screen.getByTestId('nav-defense');

  it('says Not yet before a Whiteboard Defense is saved', () => {
    render(<ProjectNav home={home(ONE, { ready: false, stale: false, state: null })} repo="acme-app" project="restock" />);
    expect(defenseLink().getAttribute('href')).toBe('/p/acme-app/restock/defense');
    expect(defenseLink().textContent).toBe('Whiteboard DefenseNot yet');
  });

  it('says Writing… while one is asked for or being written, saved before or not', () => {
    for (const d of [
      { ready: false, stale: false, state: 'requested' as const },
      { ready: true, stale: true, state: 'writing' as const },
    ]) {
      render(<ProjectNav home={home(ONE, d)} repo="acme-app" project="restock" />);
      expect(defenseLink().textContent).toBe('Whiteboard DefenseWriting…');
      cleanup();
    }
  });

  it('says Out of date once the plan changed since it was generated', () => {
    render(<ProjectNav home={home(ONE, { ready: true, stale: true, state: null })} repo="acme-app" project="restock" />);
    expect(defenseLink().textContent).toBe('Whiteboard DefenseOut of date');
    expect(screen.getByText('Out of date').className).toContain('text-ink-3');
  });

  it('says nothing more while it is current', () => {
    render(<ProjectNav home={home(ONE)} repo="acme-app" project="restock" />);
    expect(defenseLink().textContent).toBe('Whiteboard Defense');
  });
});
```

At the end of `packages/web/src/pages/ProjectHeader.test.tsx`, add:
```tsx
describe('Whiteboard Defense in the project header', () => {
  it('opens the Whiteboard Defense page, and is never the main action', () => {
    show(home());
    const link = screen.getByRole('link', { name: 'Whiteboard Defense' });
    expect(link.getAttribute('href')).toBe('/p/acme-app/restock/defense');
    expect(link.className).not.toContain('bg-button');
    expect(screen.queryByRole('button', { name: 'Whiteboard Defense' })).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing e2e tests**

At the end of `packages/web/e2e/claude.ts`, add:
```ts
const claim = (text: string, basis = 'known') => ({ text, basis });

/**
 * A whole Whiteboard Defense, as the whiteboard subagent sends it with dp_whiteboard: level 2, all ten sections, three
 * questions, two concerns (high, then informational) and no checklist, since the service copies the rules file's 20
 * lines. Security model's second claim (security.1) is Unknown, so it can go to Questions; Data and state has a table,
 * and Whiteboard diagram a text drawing.
 */
export function defenseInput(): Json {
  return {
    level: 2,
    levelReasons: ['It sends messages to customers.', 'It adds a daily job.'],
    sections: [
      { id: 'summary', claims: [claim('A daily job reminds customers before an item runs out.')] },
      { id: 'diagram', claims: [claim('The job reads subscriptions and sends by SMS.', 'inferred')], diagram: 'job --> sms' },
      { id: 'walkthrough', claims: [claim('The job runs at 9:00 and picks the subscriptions that are due.')] },
      {
        id: 'data',
        claims: [claim('Each reminder sent is a row.')],
        tables: [{ title: 'Source of truth', columns: ['Data', 'Owner'], rows: [['Reminders', 'reminders table'], ['Opt-outs', 'SMS provider']] }],
      },
      { id: 'security', claims: [claim('Only the job sends reminders.', 'inferred'), claim('Who can change the lead time.', 'unknown')] },
      { id: 'failure', claims: [claim('A second run would send every reminder again.', 'verify')] },
      { id: 'tradeoffs', claims: [claim('SMS needs a provider account.')] },
      { id: 'complexity', claims: [claim('One job and one table.')] },
      { id: 'readiness', claims: [claim('Sends are logged.', 'inferred')] },
      { id: 'unknowns', claims: [claim('How many customers opt out of SMS.', 'unknown')] },
    ],
    questions: [
      { q: 'What happens if the job runs twice?', a: 'Every reminder goes out again, so it needs a sent marker.', basis: 'inferred' },
      { q: 'Where is a reminder recorded?', a: 'In the reminders table.', basis: 'known' },
      { q: 'Who can change the lead time?', a: 'Not decided yet.', basis: 'unknown' },
    ],
    concerns: [
      { severity: 'high', text: 'A double run spams customers.', basis: 'verify' },
      { severity: 'info', text: 'SMS costs grow with customers.', basis: 'inferred' },
    ],
    checklist: [],
  };
}

/**
 * Generates a Whiteboard Defense the way the app does: Generate asks for one, a listening Claude window takes the
 * request through dp_wait, and its whiteboard subagent sends `input` with dp_whiteboard. Returns the saved defense.
 */
export async function writeDefense(p: ProjectId, input: Json = defenseInput(), windowId = `w-e2e-${p.project}`): Promise<Json> {
  const P = `/api/projects/${p.repo}/${p.project}/whiteboard`;
  await api(P, 'POST', {});
  const wait = await asClaude('/wait', { repo: p.repo, project: p.project, windowId, timeoutSeconds: 0 });
  if (wait.kind !== 'whiteboard') throw new Error(`dp_wait handed out ${wait.kind}, not the Whiteboard Defense request.`);
  const { request } = await api(P);
  await asClaude('/whiteboard', { repo: p.repo, project: p.project, request: request.id, defense: input });
  return (await api(P)).defense;
}
```

`packages/web/e2e/defense.spec.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { api, asClaude, defenseInput, fixtureRepo, importProject, PLAN_TEXT, writeDefense } from './claude';
import { noSideScroll } from './env';

const NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';
const INTRO = "Claude writes a defense of this plan: how it works, what could fail and what's still unknown. Then you study it and practise explaining it.";
const META = /^Level 2 · Standard · Based on the draft \(v1\) · Generated /;

test('Generate asks a Claude window for the Whiteboard Defense, and the page shows it once it is saved', async ({ page }) => {
  const p = await importProject('def-generate', 'Defense generate');
  const P = `/api/projects/${p.repo}/${p.project}`;
  await page.goto(p.url);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await expect(nav.getByTestId('nav-defense')).toContainText('Not yet');
  // The header's Whiteboard Defense is a link to the page.
  await page.getByRole('main').getByRole('link', { name: 'Whiteboard Defense', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/defense(\\?mode=study)?$`));
  await expect(page.getByRole('heading', { name: 'Whiteboard Defense', exact: true })).toBeVisible();
  await expect(page.getByText(INTRO)).toBeVisible();

  const generate = page.getByTestId('defense-generate');
  await expect(generate).toHaveText('Generate');
  await generate.click();
  const status = page.getByTestId('defense-status');
  await expect(status).toHaveText(NO_WINDOW);
  await expect(generate).toHaveCount(0);
  await expect(page.getByTestId('defense-cancel')).toBeVisible();

  const wait = await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-def-generate', timeoutSeconds: 0 });
  expect(wait.kind).toBe('whiteboard');
  await expect(status).toHaveText("Claude is writing the Whiteboard Defense. Threads you send now wait until it's done.");
  await expect(nav.getByTestId('nav-defense')).toContainText('Writing…');
  const { request } = await api(`${P}/whiteboard`);
  expect(await asClaude('/whiteboard', { repo: p.repo, project: p.project, request: request.id, defense: defenseInput() })).toMatchObject({ ok: true, level: 2, questions: 3, concerns: 2 });

  await expect(page.getByTestId('defense-meta')).toHaveText(META);
  await expect(page.getByText('It sends messages to customers.')).toBeVisible();
  await expect(status).toHaveCount(0);
  await expect(page.getByTestId('defense-generate')).toHaveText('Regenerate');
  const contents = page.getByRole('navigation', { name: 'Contents' }).getByRole('link');
  await expect(contents).toHaveCount(13);
  await expect(contents.first()).toHaveText('1. Executive summary');
  await expect(contents.last()).toHaveText('13. Checklist');
  await expect(nav.getByTestId('nav-defense')).toHaveText('Whiteboard Defense');
});

test('Cancel takes back a request no window has picked up', async ({ page }) => {
  const p = await importProject('def-cancel', 'Defense cancel');
  await page.goto(`${p.url}/defense`);
  await page.getByTestId('defense-generate').click();
  await expect(page.getByTestId('defense-status')).toHaveText(NO_WINDOW);
  await page.getByTestId('defense-cancel').click();
  await expect(page.getByTestId('defense-status')).toHaveCount(0);
  await expect(page.getByTestId('defense-generate')).toHaveText('Generate');
  expect((await api(`/api/projects/${p.repo}/${p.project}/whiteboard`)).request).toBeNull();
});

test('Export .md writes the defense next to the plan in the clone you pick', async ({ page }) => {
  const p = await importProject('def-export', 'Defense export');
  await writeDefense(p);
  await page.goto(`${p.url}/defense`);
  const form = page.getByTestId('defense-export');
  await expect(form.getByLabel('Export into')).toHaveValue(fixtureRepo());
  await expect(form.getByLabel('Export into').locator('option')).toHaveText([`${fixtureRepo()} (source)`]);
  await expect(form.getByTestId('export-target')).toHaveText(`${fixtureRepo()}/docs/specs/def-export.whiteboard-defense.md`);
  await form.getByRole('button', { name: 'Export .md' }).click();
  await expect(form.getByTestId('defense-exported')).toContainText('/docs/specs/def-export.whiteboard-defense.md.');

  const written = fs.readFileSync(path.join(fixtureRepo(), 'docs/specs/def-export.whiteboard-defense.md'), 'utf8');
  expect(written).toMatch(/^# Whiteboard Defense: /);
  expect(written).toContain('## 5. Security model');
  // The rules file's checklist, which the service copied.
  expect(written).toContain('- [ ] I can explain the purpose.');
  // The plan itself is untouched.
  expect(fs.readFileSync(path.join(fixtureRepo(), 'docs/specs/def-export.md'), 'utf8')).toBe(PLAN_TEXT('Defense export'));
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('the Defense tab opens the page, and the page fits the width', async ({ page }) => {
    const p = await importProject('def-phone', 'Defense phone');
    await writeDefense(p);
    await page.goto(p.url);
    await page.getByRole('tab', { name: 'Defense', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${p.url}/defense(\\?mode=study)?$`));
    await expect(page.getByTestId('defense-meta')).toHaveText(META);
    await expect(page.getByRole('tab', { name: 'Defense', exact: true })).toHaveAttribute('aria-selected', 'true');
    // Regenerate is this page's action, so Submit all's bar isn't pinned here.
    await expect(page.getByRole('button', { name: /^Submit all/ })).toHaveCount(0);
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run:
```bash
pnpm vitest run packages/web/src/pages/defense packages/web/src/pages/ProjectNav.test.tsx packages/web/src/pages/ProjectHeader.test.tsx
pnpm test:e2e defense
```
Expected: FAIL.
- `DefensePage.test.tsx` fails because `./DefensePage` can't be resolved.
- In `ProjectNav.test.tsx`, all six fail: Whiteboard Defense is still a `<span>`, so the link lists lack it and there's no `nav-defense`.
- In `ProjectHeader.test.tsx`, the three Finalize tests pass and the new one fails: Whiteboard Defense is a disabled button.
- The e2e tests get through `importProject` and `writeDefense`, which Tasks 7 and 8 already serve. Then they fail on the page: there's no `nav-defense`, `/defense` is "Page not found", and the phone's Defense tab only shows "Whiteboard Defense arrives in a later update."

- [ ] **Step 4: Add the whiteboard methods to the API client**

In `packages/web/src/api/client.ts`, replace the type import at the top with:
```ts
import type {
  AgentsConfig,
  Anchor,
  AskDefenseResponse,
  ChangesResponse,
  ConfigProblem,
  DefenseExport,
  DiffSegment,
  MockupKitInfo,
  DiscoveryProblem,
  FinalizeRequest,
  FinalizeView,
  GenerateWhiteboardResponse,
  ListeningState,
  PlumbingProject,
  PracticeView,
  ProjectHome,
  ProjectSummary,
  Rating,
  RepoProfile,
  RuleSummary,
  SendFromDefenseResponse,
  Settings,
  SubmitResponse,
  ThreadDetail,
  TypeEntry,
  TypeItemRow,
  VersionSummary,
  WhiteboardView,
} from '@dev-plumbing/core/schemas';
```

In the `api` object, replace:
```ts
  updateDiff: (repo: string, id: string, n: number) => request<{ segments: DiffSegment[] }>(`${proj(repo, id)}/versions/${n}/update-diff`),
};
```
with:
```ts
  updateDiff: (repo: string, id: string, n: number) => request<{ segments: DiffSegment[] }>(`${proj(repo, id)}/versions/${n}/update-diff`),
  whiteboard: (repo: string, id: string) => request<WhiteboardView>(`${proj(repo, id)}/whiteboard`),
  generateWhiteboard: (repo: string, id: string) => request<GenerateWhiteboardResponse>(`${proj(repo, id)}/whiteboard`, send('POST', {})),
  cancelWhiteboard: (repo: string, id: string) => request<{ ok: true }>(`${proj(repo, id)}/whiteboard/cancel`, send('POST', {})),
  askAboutDefense: (repo: string, id: string, body: { defenseId: string; kind: 'section' | 'question' | 'concern'; ref: string; question: string }) =>
    request<AskDefenseResponse>(`${proj(repo, id)}/whiteboard/ask`, send('POST', body)),
  sendFromDefense: (repo: string, id: string, body: { defenseId: string; kind: 'claim' | 'concern'; ref: string }) =>
    request<SendFromDefenseResponse>(`${proj(repo, id)}/whiteboard/send`, send('POST', body)),
  ratePractice: (repo: string, id: string, body: { defenseId: string; questionId: string; rating: Rating | null }) =>
    request<PracticeView>(`${proj(repo, id)}/whiteboard/practice/rating`, send('POST', body)),
  tickPractice: (repo: string, id: string, body: { defenseId: string; checklistId: string; ticked: boolean }) =>
    request<PracticeView>(`${proj(repo, id)}/whiteboard/practice/tick`, send('POST', body)),
  exportDefense: (repo: string, id: string, clone: string) => request<{ exportedTo: DefenseExport }>(`${proj(repo, id)}/whiteboard/export`, send('POST', { clone })),
};
```

- [ ] **Step 5: Write the page, its export form, and Study and Practice as they start**

`packages/web/src/pages/defense/DefensePage.tsx`:
```tsx
import { LEVEL_NAMES, type WhiteboardDefense, type WhiteboardView } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Segmented';
import { formatUpdated } from '../../lib/time';
import { ExportForm } from './ExportForm';
import { PracticeView } from './PracticeView';
import { StudyView } from './StudyView';

export type DefenseMode = 'study' | 'practice';
/** What Study and Practice are given: the page's data, with a defense in it. */
export type DefenseViewProps = { view: WhiteboardView & { defense: WhiteboardDefense }; repo: string; project: string };
/**
 * Where Practice is: the card on show (from 0) and, while "Only shaky and couldn't" is on, the question ids of the deck
 * it fixed when it was turned on. The page keeps it, so going to Study and back keeps it too.
 */
export type PracticePlace = { card: number; deck: string[] | null };
export type PracticeViewProps = DefenseViewProps & { place: PracticePlace; onPlace: (place: PracticePlace) => void };

const WAITING = 'Waiting for Claude to write the Whiteboard Defense.';
const NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';
// Writing takes the only window for ten minutes or more, so it says what that means for threads.
const WRITING = "Claude is writing the Whiteboard Defense. Threads you send now wait until it's done.";
const GAVE_UP = "The whiteboard subagent didn't send a Whiteboard Defense.";
const INTRO = "Claude writes a defense of this plan: how it works, what could fail and what's still unknown. Then you study it and practise explaining it.";

/** One line on where the request is. Null when none is under way and the last one didn't fail. */
export function statusLine(v: WhiteboardView): string | null {
  const r = v.request;
  if (r?.state === 'requested') return v.listening ? WAITING : NO_WINDOW;
  // The window that took it went away, and no other is running: it's requeued the moment one runs /dev-plumbing.
  if (r?.state === 'writing') return v.listening ? WRITING : NO_WINDOW;
  if (r?.state === 'failed') return r.reason ?? GAVE_UP;
  return null;
}

/** "Level 2 · Standard · Based on the draft (v1) · Generated 2 hr ago". */
export function defenseMeta(d: WhiteboardDefense): string {
  return `Level ${d.level} · ${LEVEL_NAMES[d.level]} · Based on the ${d.basedOn.doc} (v${d.basedOn.version}) · Generated ${formatUpdated(d.generatedAt)}`;
}

export function DefensePage() {
  const { repo, project } = useParams({ from: '/p/$repo/$project/defense' });
  const { mode } = useSearch({ from: '/p/$repo/$project/defense' });
  return <DefenseBody repo={repo} project={project} mode={mode} />;
}

/**
 * The Whiteboard Defense page: where the request is, Generate (or Regenerate, or Try again) and Cancel (or Dismiss),
 * what the defense is based on, Study or Practice, and Export .md. The defense on show stays until a new one is saved.
 */
export function DefenseBody({ repo, project, mode }: { repo: string; project: string; mode: DefenseMode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['whiteboard', repo, project], queryFn: () => api.whiteboard(repo, project) });
  const refresh = () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project });
  const generate = useMutation({ mutationFn: () => api.generateWhiteboard(repo, project), onSettled: refresh });
  // A window that's alive but never comes back leaves the request on "writing", so there's a way out. Dismiss uses it
  // too, to clear a failed request off a defense that's still good.
  const cancel = useMutation({ mutationFn: () => api.cancelWhiteboard(repo, project), onSettled: refresh });
  // Practice's place lives here, so Study and back keeps it. It belongs to one defense: a new one starts at card 1.
  const [place, setPlace] = useState<PracticePlace & { defenseId: string | null }>({ defenseId: null, card: 0, deck: null });
  if (q.error) return <p className="text-[13px] text-seal">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  const v = q.data;
  const d = v.defense;
  const status = statusLine(v);
  const failed = v.request?.state === 'failed';
  const underWay = v.request?.state === 'requested' || v.request?.state === 'writing';
  const label = failed ? 'Try again' : d ? 'Regenerate' : 'Generate';
  // The page's main action when there's nothing to study yet, it's out of date, or the last request failed.
  const primary = !d || v.stale !== null || failed;
  const error = generate.error ?? cancel.error;
  const setMode = (next: DefenseMode) => void navigate({ to: '/p/$repo/$project/defense', params: { repo, project }, search: { mode: next } });

  return (
    <div className="max-w-[80ch]" data-testid="defense">
      <h2 className="text-[20px] font-semibold">Whiteboard Defense</h2>
      <p className="mt-1 text-[12.5px] text-ink-3">If you ship it, you should be able to explain it.</p>
      {d ? (
        <>
          <p data-testid="defense-meta" className="mt-4 text-[12.5px] text-ink-2">
            {defenseMeta(d)}
          </p>
          <ul className="mt-1.5 list-disc pl-5 text-[12.5px] text-ink-3">
            {d.levelReasons.map((reason, i) => (
              <li key={i} className="break-words">
                {reason}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-[13px] text-ink-2">{INTRO}</p>
      )}
      {v.stale && (
        <p data-testid="defense-stale" className="mt-3 text-[13px] text-seal">
          {v.stale}
        </p>
      )}
      {status && (
        <p role="status" data-testid="defense-status" className={`mt-3 text-[13px] ${failed ? 'text-seal' : 'text-ink-2'}`}>
          {status}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        {underWay ? (
          <Button size="sm" data-testid="defense-cancel" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel
          </Button>
        ) : (
          <>
            <Button data-testid="defense-generate" variant={primary ? 'primary' : 'secondary'} disabled={!v.canGenerate || generate.isPending} onClick={() => generate.mutate()}>
              {label}
            </Button>
            {/* A failed request can be cleared, leaving the defense as it was. */}
            {failed && (
              <Button size="sm" data-testid="defense-dismiss" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                Dismiss
              </Button>
            )}
            {v.generateRefusal && <span className="text-[12px] text-ink-3">{v.generateRefusal}</span>}
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 whitespace-pre-line text-[12.5px] text-seal">
          {(error as Error).message}
        </p>
      )}
      {d && (
        <>
          <div className="mt-6 max-w-xs">
            <Segmented<DefenseMode>
              label="Whiteboard Defense mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'study', label: 'Study' },
                { value: 'practice', label: 'Practice' },
              ]}
            />
          </div>
          {/* Keyed by defense, so a regenerated one starts afresh: the first card, the forms closed. */}
          {mode === 'practice' ? (
            <PracticeView
              key={d.id}
              view={{ ...v, defense: d }}
              repo={repo}
              project={project}
              place={place.defenseId === d.id ? { card: place.card, deck: place.deck } : { card: 0, deck: null }}
              onPlace={(next) => setPlace({ defenseId: d.id, ...next })}
            />
          ) : (
            <StudyView key={d.id} view={{ ...v, defense: d }} repo={repo} project={project} />
          )}
          <ExportForm key={`export-${d.id}`} repo={repo} project={project} clones={v.clones} exportPath={v.exportPath} exportedTo={d.exportedTo} />
        </>
      )}
    </div>
  );
}
```

`packages/web/src/pages/defense/ExportForm.tsx`:
```tsx
import type { DefenseExport, WhiteboardView } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputClass';
import { exportedPath } from '../finalize/ProposalView';

/**
 * Export .md: the defense as `<name>.whiteboard-defense.md` next to the plan, in the clone you pick (the source clone
 * first). Each export overwrites the last one there. `exportPath` is the file's path inside a clone.
 */
export function ExportForm({
  repo,
  project,
  clones,
  exportPath,
  exportedTo,
}: {
  repo: string;
  project: string;
  clones: WhiteboardView['clones'];
  exportPath: string;
  exportedTo: DefenseExport | undefined;
}) {
  const qc = useQueryClient();
  const [clone, setClone] = useState(clones[0]?.path ?? '');
  const run = useMutation({
    mutationFn: () => api.exportDefense(repo, project, clone),
    onSuccess: () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project }),
  });
  // This export, or the last one the defense remembers.
  const done = run.data?.exportedTo ?? exportedTo;

  return (
    <form
      aria-label="Export"
      data-testid="defense-export"
      className="mt-10 border-t-[0.5px] border-separator pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        run.mutate();
      }}
    >
      {clones.length > 0 ? (
        <>
          <label htmlFor="export-into" className="text-[12px] font-semibold text-ink-3">
            Export into
          </label>
          <select id="export-into" value={clone} onChange={(e) => setClone(e.target.value)} className={`${inputClass} mt-1 font-mono`}>
            {clones.map((c) => (
              <option key={c.path} value={c.path}>
                {c.source ? `${c.path} (source)` : c.path}
              </option>
            ))}
          </select>
          <p data-testid="export-target" className="mt-1 break-all font-mono text-[11.5px] text-ink-3">
            {clone}/{exportPath}
          </p>
          {done && <p className="mt-0.5 text-[11.5px] text-ink-3">Replaces the file there.</p>}
        </>
      ) : (
        <p className="text-[13px] text-ink-3">None of the clones this project was opened from is on this Mac.</p>
      )}
      <div className="mt-3">
        <Button type="submit" disabled={!clone || run.isPending}>
          Export .md
        </Button>
      </div>
      {done && (
        <p role="status" data-testid="defense-exported" className="mt-2 break-all text-[12.5px] text-ink-2">
          Exported to {exportedPath(done)}.
        </p>
      )}
      {run.error && (
        <p role="alert" className="mt-2 whitespace-pre-line text-[12.5px] text-seal">
          {(run.error as Error).message}
        </p>
      )}
    </form>
  );
}
```

`packages/web/src/pages/defense/StudyView.tsx` (Task 11 replaces it whole):
```tsx
import { DEFENSE_PARTS, DEFENSE_SECTIONS, type WhiteboardDefense } from '@dev-plumbing/core/schemas';
import type { MouseEvent } from 'react';
import type { DefenseViewProps } from './DefensePage';

type Entry = { anchor: string; n: number; title: string };

const numberOf = (id: WhiteboardDefense['sections'][number]['id']) => DEFENSE_SECTIONS.find((s) => s.id === id)?.n ?? 0;

/** The 13 parts in order: prose sections 1–9, the questions (10), the concerns (11), the unknowns (12), the checklist (13). */
export function contents(d: WhiteboardDefense): Entry[] {
  const prose = d.sections.map((s) => ({ anchor: `defense-section-${s.id}`, n: numberOf(s.id), title: s.title }));
  const parts = [
    { anchor: 'defense-questions', ...DEFENSE_PARTS.questions },
    { anchor: 'defense-concerns', ...DEFENSE_PARTS.concerns },
    { anchor: 'defense-checklist', ...DEFENSE_PARTS.checklist },
  ];
  return [...prose, ...parts].sort((a, b) => a.n - b.n);
}

/** Scrolls to a part in place, so the page's address (and its ?mode) stays as it is. */
function jump(anchor: string) {
  return (e: MouseEvent) => {
    const target = document.getElementById(anchor);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

export function Contents({ defense }: { defense: WhiteboardDefense }) {
  return (
    <nav aria-label="Contents" className="mt-6">
      <p className="text-[12px] font-semibold text-ink-3">Contents</p>
      <ol className="mt-1.5 text-[13px] leading-6 md:columns-2">
        {contents(defense).map((e) => (
          <li key={e.anchor} className="break-inside-avoid">
            <a href={`#${e.anchor}`} onClick={jump(e.anchor)} className="text-slate">
              {e.n}. {e.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Study: the defense to read. Its contents for now; the sections come next. */
export function StudyView({ view }: DefenseViewProps) {
  return <Contents defense={view.defense} />;
}
```

`packages/web/src/pages/defense/PracticeView.tsx` (Task 12 replaces it whole):
```tsx
import type { PracticeViewProps } from './DefensePage';

/** Practice: the flashcards, the readiness meter and the checklist. It shows nothing until the cards are written. */
export function PracticeView(props: PracticeViewProps) {
  void props;
  return null;
}
```

- [ ] **Step 6: Route it**

In `packages/web/src/router.tsx`, replace:
```tsx
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { PageMessage } from './components/PageMessage';
import { AppHome } from './pages/AppHome';
```
with:
```tsx
import { createRootRoute, createRoute, createRouter, type SearchSchemaInput } from '@tanstack/react-router';
import { PageMessage } from './components/PageMessage';
import { AppHome } from './pages/AppHome';
import { DefensePage, type DefenseMode } from './pages/defense/DefensePage';
```
After the `const versionRoute = …` line, add:
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
and replace:
```tsx
  projectRoute.addChildren([inboxRoute, typeRoute, threadRoute, docRoute, finalizeRoute, versionsRoute, versionRoute]),
```
with:
```tsx
  projectRoute.addChildren([inboxRoute, typeRoute, threadRoute, docRoute, finalizeRoute, versionsRoute, versionRoute, defenseRoute]),
```

The `SearchSchemaInput` tag makes the route's search input `{ mode?: DefenseMode }`, so `<Link to="/p/$repo/$project/defense">` needs no `search`, while `useSearch` still gives a `mode`.

- [ ] **Step 7: Run the component tests**

Run: `pnpm vitest run packages/web/src/pages/defense && pnpm --filter @dev-plumbing/web typecheck`
Expected: PASS (16 tests).

- [ ] **Step 8: The header's link, the Review link, and the phone's Defense tab**

In `packages/web/src/pages/ProjectHeader.tsx`, replace:
```tsx
          <Button disabled title="Whiteboard Defense arrives in a later update.">Whiteboard Defense</Button>
```
with:
```tsx
          <Link to="/p/$repo/$project/defense" params={{ repo, project }} className={buttonClass()}>
            Whiteboard Defense
          </Link>
```

In `packages/web/src/pages/ProjectNav.tsx`, after the `const Section = …` line, add:
```tsx

/**
 * The quiet word after Whiteboard Defense: one is being asked for or written, none has been saved yet, or the plan
 * changed since. Null when it's current.
 */
function defenseNote(d: ProjectHome['defense']): string | null {
  if (d.state === 'requested' || d.state === 'writing') return 'Writing…';
  if (!d.ready) return 'Not yet';
  return d.stale ? 'Out of date' : null;
}
```
and replace:
```tsx
      <Section>Review</Section>
      <span className={`${LINK} text-ink-3`} title="Whiteboard Defense arrives in a later update.">
        Whiteboard Defense
      </span>
```
with:
```tsx
      <Section>Review</Section>
      <Link to="/p/$repo/$project/defense" params={{ repo, project }} activeProps={ACTIVE} className={LINK} onClick={onNavigate} data-testid="nav-defense">
        Whiteboard Defense
        {defenseNote(home.defense) && <span className="ml-auto text-[11px] text-ink-3">{defenseNote(home.defense)}</span>}
      </Link>
```

In `packages/web/src/pages/ProjectLayout.tsx`, replace:
```tsx
type Mode = 'view' | 'list' | 'defense';
```
with:
```tsx
type Mode = 'view' | 'list';
```
replace:
```tsx
  const onFinalize = Boolean(useMatch({ from: '/p/$repo/$project/finalize', shouldThrow: false }));
  const [mode, setMode] = useState<Mode>('view');
  const tab: Tab = mode === 'defense' ? 'defense' : mode === 'list' ? 'plumbing' : onInbox ? 'inbox' : 'plumbing';
  const changeTab = (next: Tab) => {
    if (next === 'inbox') {
      void navigate({ to: '/p/$repo/$project', params: { repo, project } });
      setMode('view');
    } else setMode(next === 'plumbing' ? 'list' : 'defense');
  };
```
with:
```tsx
  const onFinalize = Boolean(useMatch({ from: '/p/$repo/$project/finalize', shouldThrow: false }));
  // So does the Whiteboard Defense page: Generate and Regenerate are its actions.
  const onDefense = Boolean(useMatch({ from: '/p/$repo/$project/defense', shouldThrow: false }));
  const [mode, setMode] = useState<Mode>('view');
  const tab: Tab = mode === 'list' ? 'plumbing' : onInbox ? 'inbox' : onDefense ? 'defense' : 'plumbing';
  const changeTab = (next: Tab) => {
    if (next === 'plumbing') return setMode('list');
    if (next === 'inbox') void navigate({ to: '/p/$repo/$project', params: { repo, project } });
    else void navigate({ to: '/p/$repo/$project/defense', params: { repo, project } });
    setMode('view');
  };
```
replace:
```tsx
        <ProjectHeader home={d} repo={repo} project={project} submitAll={submitAll} submitPrimary={!onThread && !onFinalize} />
```
with:
```tsx
        <ProjectHeader home={d} repo={repo} project={project} submitAll={submitAll} submitPrimary={!onThread && !onFinalize && !onDefense} />
```
delete the line:
```tsx
        {mode === 'defense' && <p className="mt-6 text-[13px] text-ink-3 md:hidden">Whiteboard Defense arrives in a later update.</p>}
```
and replace:
```tsx
      {!onThread && !onFinalize && (
```
with:
```tsx
      {!onThread && !onFinalize && !onDefense && (
```

`project-home.spec.ts` still finds the sidebar's "Final" with `nav.getByText('Final')`: the Review link's text is "Whiteboard Defense" and "Not yet", which don't contain it.

- [ ] **Step 9: Run everything**

Run:
```bash
pnpm vitest run packages/web
pnpm typecheck
pnpm test
pnpm test:e2e defense
pnpm test:e2e
```
Expected: PASS (4 tests in `defense.spec.ts`).
- **If the status never says "Claude is writing the Whiteboard Defense.":** the page updates on the service's project event. Check that Task 7's `/wait` calls `changed(ref)` when it hands out the whiteboard request.
- **If the meta line never shows after `/whiteboard`:** check that Task 7's save route calls `changed(ref)`, and that Task 8's GET returns the defense.
- **If the export test's select has another value:** `clones` must be the real paths, as `FinalizeView.clones` are (`clonesOf`, Task 8).
- **If the phone test finds sideways scrolling:** the meta line and the level reasons wrap, the target path is `break-all`, and the select uses `inputClass` (`w-full min-w-0`).

- [ ] **Step 10: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/router.tsx packages/web/src/pages/ProjectHeader.tsx packages/web/src/pages/ProjectHeader.test.tsx packages/web/src/pages/ProjectNav.tsx packages/web/src/pages/ProjectNav.test.tsx packages/web/src/pages/ProjectLayout.tsx packages/web/src/pages/defense packages/web/e2e/claude.ts packages/web/e2e/defense.spec.ts
git commit -m "feat(web): the Whiteboard Defense page, with Generate, status, Out of date and Export .md" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Web: Study, Ask Claude about this, and Send to plumbing

Study becomes the defense to read: the 13 sections in order, every statement with how sure it is, tables, the diagram, the questions with their answers, the release concerns by severity, and the checklist with your ticks. Under every section, question and concern, **Ask Claude about this** opens a Defense thread whose first message is your question. A claim marked Unknown or Verify before release goes to Questions, and a release concern to Concerns, with one click.

**Files:**
- Create:
  - `packages/web/src/pages/defense/labels.tsx`
  - `packages/web/src/pages/defense/AskClaude.tsx`
  - `packages/web/src/pages/defense/StudyView.test.tsx`
  - `packages/web/src/pages/defense/AskClaude.test.tsx`
- Modify:
  - `packages/web/src/pages/defense/StudyView.tsx` (replaced whole)
  - `packages/web/e2e/defense.spec.ts` (one more test, at the end)
- Test:
  - `packages/web/src/pages/defense/StudyView.test.tsx`
  - `packages/web/src/pages/defense/AskClaude.test.tsx`
  - `packages/web/e2e/defense.spec.ts`

`labels` is a `.tsx` file because `BasisLabel` is a component. Every import of it is `./labels`.

**Interfaces:**
- Consumes:
  - Task 10: `DefenseViewProps` (`pages/defense/DefensePage.tsx`), `api.askAboutDefense` and `api.sendFromDefense`, the testkit (`defense`, `practice`, `link`, `withDefense`, `DefenseView`), and the e2e helper `writeDefense`.
  - Plans 1–3: `api.thread`, `StatusMark`, `Button`, `inputClass`, `DiagramView` (`diagram/DiagramView.tsx`), and `routerMock`.
  - Task 1 (`@dev-plumbing/core/schemas`): `DEFENSE_SECTIONS`, `DEFENSE_PARTS`, `BASIS_LABELS`, `SEVERITY_LABELS`, `Basis`, `Severity`, `DefenseLink`, `DefenseTable` and `WhiteboardDefense`; and Plan 3's `parseData` and `DiagramData`.
  - Task 5 through Task 8's routes:
    - `/ask` makes a Defense item `defense-<slug of the question>` with thread `t-defense-…`, sends it as Send this thread does, and returns `threadId`; the thread is then `with_claude`, and the Defense type shows in the nav as "Defense questions".
    - A reply with `resolve` on a Defense thread resolves it with Claude's answer kept (Task 2), and the thread page still shows the answer form on a resolved thread, so you can carry on.
    - `/send` returns `message`: `Added to ${typeTitle}. Claude will suggest answers.` (or the no-window version), and the next GET lists the item in `sent` with `kind: 'claim'`, `ref: 'security.1'`.
    - `asked` and `sent` are `DefenseLink`s, oldest first.
  - Task 2: a Defense thread is never on the Finalize checklist.
  - Every item's thread id is `t-<item id>` (core makes them so). The diagram that section 2 names is read through its thread, `api.thread(repo, project, 't-' + itemId)`, whose `item.data` and `type.screen` say whether it's a diagram.
- Produces:
  - `pages/defense/labels.tsx`: `basisClass(b: Basis): string`, `severityClass(s: Severity): string`, and `BasisLabel({ basis })`, exactly as the Contracts give their colours.
  - `pages/defense/AskClaude.tsx`: `AskClaude({ repo, project, defenseId, kind, partRef, asked })`, with `kind: 'section' | 'question' | 'concern'` and `partRef` the part's ref (a section id, `q<n>` or `c<n>`). It's the Contracts' `ref` prop, named `partRef` because `ref` is React's own. Task 12's flashcard uses it.
  - `StudyView` replaced; `contents` and `Contents` kept as Task 10 made them.
  - Test ids: `defense-section-<id>`, `defense-questions`, `defense-concerns`, `defense-checklist`, `ask-claude`, `ask-question`, `ask-send`, `send-to-plumbing`, `defense-table`, `defense-diagram` (the text diagram), `defense-diagram-item` and `study`.
- **Behaviour:**
  - **The parts:** each is a `<section>` whose `id` and test id are the Contents' anchor (`defense-section-<id>`, `defense-questions`, `defense-concerns`, `defense-checklist`), with an `h3` `${n}. ${title}`. They come in the order 1–9, 10, 11, 12, 13. Study reads at `72ch`.
  - **Claims:** a bulleted list, each claim's text then its `BasisLabel`: Known `text-ink-3`, Inferred `text-ink-2`, Unknown `text-amber`, Verify before release `text-seal`, as an 11 px caption. Inferred isn't slate: slate is the links' colour, and Send to Questions and Ask Claude about this sit right after it.
  - **Send:** a claim marked Unknown or Verify before release gets a quiet "Send to Questions" (`send-to-plumbing`); a release concern gets "Send to Concerns". Once sent (a `sent` link with the same kind and ref), it's "In Questions ›" or "In Concerns ›", linking to that thread. After a send, the service's message shows beside it (`role="status"`) and the button stays off until the page reloads its data. A refusal shows in seal (`role="alert"`).
  - **Tables:** the title, then a real `<table>` from 768 px, and under 768 px one card per row with each column's name above its value, so a phone never scrolls sideways.
  - **Section 2's diagram:** the item `diagramItemId` names, drawn with `DiagramView` (`compact`) when its type's screen is `diagram` and its data parses, with a link "‹item title› ›" to it on its screen. The text diagram follows in a `pre` with a left hairline. Nothing is drawn for an item that no longer has a diagram.
  - **Questions (10):** each question in semibold, its answer and `BasisLabel`, and Ask Claude. "No questions in this defense." when there are none.
  - **Release concerns (11):** the severity label coloured by `severityClass` (critical and high seal, medium amber, low ochre, informational ink-3), the text, the basis, Send to Concerns and Ask Claude. "None." when there are none.
  - **Checklist (13):** read-only, `${ticked} of ${total} ticked` from Practice's ticks, a moss ✓ on each ticked line and a hairline mist circle on the rest.
  - **Ask Claude about this** sits under every section, question and concern. It lists that part's threads from `asked` (a `StatusMark`, the title, "›"), then a quiet "Ask Claude about this" that opens the form: "Your question" (placeholder "What do you want to ask?"), a secondary **Send** that's off while the question is empty, and Cancel. Send posts `{ defenseId, kind, ref: partRef, question }`, refreshes the project's queries and opens `/p/$repo/$project/th/$thread`. A refusal shows in the form.
  - No button in Study is primary: the page's one primary stays Generate, Try again or Regenerate.

- [ ] **Step 1: Write the failing component tests**

`packages/web/src/pages/defense/StudyView.test.tsx`:
```tsx
import type { DiagramData, ThreadDetail } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api/client';
import { basisClass, severityClass } from './labels';
import { StudyView } from './StudyView';
import { defense, link, practice, withDefense, type DefenseView } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function show(v: DefenseView = withDefense()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StudyView view={v} repo="acme-app" project="restock" />
    </QueryClientProvider>,
  );
}

const part = (id: string) => screen.getByTestId(id);
const sent = (message: string) => ({ itemId: 'questions-who-can-change-the-lead-time', threadId: 't-questions-who-can-change-the-lead-time', typeId: 'questions', typeTitle: 'Questions', listening: null, message });

describe('Study', () => {
  it('shows the 13 sections in order, each with its number', () => {
    show();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '1. Executive summary',
      '2. Whiteboard diagram',
      '3. System walkthrough',
      '4. Data and state',
      '5. Security model',
      '6. Failure analysis',
      '7. Dependencies and tradeoffs',
      '8. Complexity review',
      '9. Production readiness',
      '10. Questions the engineer should be able to answer',
      '11. Release concerns',
      '12. Unknowns',
      '13. Checklist',
    ]);
    // Contents scrolls to each one.
    expect(part('defense-section-security').id).toBe('defense-section-security');
    expect(part('defense-checklist').id).toBe('defense-checklist');
  });

  it('says how sure each statement is, in its own colour', () => {
    show();
    expect(within(part('defense-section-summary')).getByText('Known').className).toContain('text-ink-3');
    expect(within(part('defense-section-security')).getByText('Inferred').className).toContain('text-ink-2');
    expect(within(part('defense-section-security')).getByText('Unknown').className).toContain('text-amber');
    expect(within(part('defense-section-failure')).getByText('Verify before release').className).toContain('text-seal');
    expect([basisClass('known'), basisClass('inferred'), basisClass('unknown'), basisClass('verify')]).toEqual(['text-ink-3', 'text-ink-2', 'text-amber', 'text-seal']);
  });

  it('labels each release concern by severity, in its own colour', () => {
    show();
    const concerns = part('defense-concerns');
    expect(within(concerns).getByText('High').className).toContain('text-seal');
    expect(within(concerns).getByText('Informational').className).toContain('text-ink-3');
    expect(concerns.textContent).toContain('A double run spams customers.');
    expect(within(concerns).getByText('Verify before release')).toBeTruthy();
    expect(['critical', 'high', 'medium', 'low', 'info'].map((s) => severityClass(s as 'high'))).toEqual(['text-seal', 'text-seal', 'text-amber', 'text-ochre', 'text-ink-3']);
  });

  it('offers Send to Questions only on claims marked Unknown or Verify before release', () => {
    show();
    expect(within(part('defense-section-summary')).queryByTestId('send-to-plumbing')).toBeNull();
    expect(within(part('defense-section-diagram')).queryByTestId('send-to-plumbing')).toBeNull();
    // Security model: an Inferred claim, then an Unknown one.
    const security = within(part('defense-section-security')).getAllByRole('listitem');
    expect(within(security[0]!).queryByTestId('send-to-plumbing')).toBeNull();
    expect(within(security[1]!).getByTestId('send-to-plumbing').textContent).toBe('Send to Questions');
    expect(within(part('defense-section-failure')).getByTestId('send-to-plumbing').textContent).toBe('Send to Questions');
    expect(within(part('defense-section-unknowns')).getByTestId('send-to-plumbing').textContent).toBe('Send to Questions');
    // Every release concern can go to Concerns.
    expect(within(part('defense-concerns')).getAllByTestId('send-to-plumbing').map((b) => b.textContent)).toEqual(['Send to Concerns', 'Send to Concerns']);
  });

  it('sends a claim to Questions, and says Claude will suggest answers', async () => {
    show();
    const send = vi.spyOn(api, 'sendFromDefense').mockResolvedValue(sent('Added to Questions. Claude will suggest answers.'));
    const security = part('defense-section-security');
    fireEvent.click(within(security).getByTestId('send-to-plumbing'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', kind: 'claim', ref: 'security.1' }));
    expect((await within(security).findByRole('status')).textContent).toBe('Added to Questions. Claude will suggest answers.');
    expect((within(security).getByTestId('send-to-plumbing') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends a release concern to Concerns, and says why when it was refused', async () => {
    show();
    const send = vi.spyOn(api, 'sendFromDefense').mockRejectedValue(new ApiError(409, "There's no enabled Concerns type to send it to. Turn it on in Plumbing rules.", null));
    const concerns = part('defense-concerns');
    fireEvent.click(within(concerns).getAllByTestId('send-to-plumbing')[0]!);
    await waitFor(() => expect(send).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', kind: 'concern', ref: 'c1' }));
    expect((await within(concerns).findByRole('alert')).textContent).toBe("There's no enabled Concerns type to send it to. Turn it on in Plumbing rules.");
  });

  it('links a sent claim or concern to its thread in place of Send', () => {
    show(
      withDefense({
        sent: [
          link({ kind: 'claim', ref: 'security.1', itemId: 'questions-lead', threadId: 't-questions-lead', typeId: 'questions', title: 'Who can change the lead time.' }),
          link({ kind: 'concern', ref: 'c1', itemId: 'concerns-double-run', threadId: 't-concerns-double-run', typeId: 'concerns', title: 'A double run spams customers.' }),
        ],
      }),
    );
    const security = part('defense-section-security');
    expect(within(security).queryByTestId('send-to-plumbing')).toBeNull();
    expect(within(security).getByRole('link', { name: 'In Questions ›' }).getAttribute('href')).toBe('/p/acme-app/restock/th/t-questions-lead');
    const concerns = part('defense-concerns');
    expect(within(concerns).getByRole('link', { name: 'In Concerns ›' }).getAttribute('href')).toBe('/p/acme-app/restock/th/t-concerns-double-run');
    // The informational one hasn't been sent.
    expect(within(concerns).getAllByTestId('send-to-plumbing')).toHaveLength(1);
    // Failure analysis's claim is still to send.
    expect(within(part('defense-section-failure')).getByTestId('send-to-plumbing')).toBeTruthy();
  });

  it('lists the threads already asked about a part under it', () => {
    show(
      withDefense({
        asked: [
          link(),
          link({ kind: 'question', ref: 'q1', itemId: 'defense-a-marker', threadId: 't-defense-a-marker', title: 'Is a marker enough?', status: 'your_turn' }),
        ],
      }),
    );
    const security = part('defense-section-security');
    const thread = within(security).getByRole('link', { name: /Who can change it\?/ });
    expect(thread.getAttribute('href')).toBe('/p/acme-app/restock/th/t-defense-who-can-change-it');
    expect(within(thread).getByRole('img', { name: 'With Claude' })).toBeTruthy();
    expect(within(part('defense-section-summary')).queryByRole('link')).toBeNull();
    const questions = part('defense-questions');
    expect(within(questions).getByRole('link', { name: /Is a marker enough\?/ }).getAttribute('href')).toBe('/p/acme-app/restock/th/t-defense-a-marker');
    // Every section, question and concern can be asked about.
    expect(screen.getAllByTestId('ask-claude')).toHaveLength(10 + 3 + 2);
  });

  it('shows the questions with their answers, a table as a table and as cards, and the text diagram', () => {
    show();
    const questions = part('defense-questions');
    expect(questions.textContent).toContain('What happens if the job runs twice?');
    expect(questions.textContent).toContain('Every reminder goes out again, so it needs a sent marker.');
    const data = part('defense-section-data');
    expect(within(data).getByText('Source of truth')).toBeTruthy();
    const table = within(data).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Data', 'Owner']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    // On a phone each row is a card, with the column names beside the values.
    expect(data.querySelectorAll('dl')).toHaveLength(2);
    expect(data.querySelector('dl')?.textContent).toBe('DataRemindersOwnerreminders table');
    expect(within(part('defense-section-diagram')).getByTestId('defense-diagram').textContent).toBe('job --> sms');
  });

  it('draws the diagram item section 2 names, with a link to it', async () => {
    const data: DiagramData = { kind: 'system', groups: [], nodes: [{ id: 'job', label: 'Reminder job', status: 'new' }], edges: [] };
    const detail = {
      item: { id: 'architecture-system', title: 'System view', data },
      type: { id: 'architecture', title: 'Architecture', screen: 'diagram' },
    } as unknown as ThreadDetail;
    const thread = vi.spyOn(api, 'thread').mockResolvedValue(detail);
    const d = defense();
    show(withDefense({ defense: { ...d, sections: d.sections.map((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-system' } : s)) } }));
    const drawn = await screen.findByTestId('defense-diagram-item');
    expect(thread).toHaveBeenCalledWith('acme-app', 'restock', 't-architecture-system');
    expect((await within(drawn).findAllByTestId('diagram-node', {}, { timeout: 10_000 })).map((n) => n.getAttribute('data-node'))).toEqual(['job']);
    expect(within(drawn).getByRole('link', { name: 'System view ›' }).getAttribute('href')).toBe('/p/acme-app/restock/t/architecture?item=architecture-system');
  });

  it('shows the checklist with what you ticked in Practice, read-only', () => {
    show(withDefense({ practice: practice({ ticks: ['k2'] }) }));
    const checklist = part('defense-checklist');
    expect(checklist.textContent).toContain('1 of 4 ticked');
    expect(within(checklist).getAllByRole('img', { name: 'Ticked' })).toHaveLength(1);
    expect(within(checklist).getAllByRole('img', { name: 'Not ticked' })).toHaveLength(3);
    expect(within(checklist).queryByRole('checkbox')).toBeNull();
  });

  it('says None. with no release concerns', () => {
    show(withDefense({ defense: defense({ concerns: [] }) }));
    expect(part('defense-concerns').textContent).toBe('11. Release concernsNone.');
  });
});
```

`packages/web/src/pages/defense/AskClaude.test.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api/client';
import { AskClaude } from './AskClaude';
import { link } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockClear();
});

function show(asked = [link()]) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AskClaude repo="acme-app" project="restock" defenseId="w-1" kind="section" partRef="security" asked={asked} />
    </QueryClientProvider>,
  );
}

describe('Ask Claude about this', () => {
  it('sends your question about the part, then opens its thread', async () => {
    show([]);
    const ask = vi.spyOn(api, 'askAboutDefense').mockResolvedValue({ resolved: 0, sent: 1, skipped: [], listening: 'waiting', message: 'Sent 1 thread to Claude.', threadId: 't-defense-who-signs-off' });
    expect(screen.queryByTestId('ask-question')).toBeNull();
    fireEvent.click(screen.getByTestId('ask-claude'));
    const question = screen.getByLabelText('Your question') as HTMLTextAreaElement;
    expect(question.getAttribute('placeholder')).toBe('What do you want to ask?');
    const send = screen.getByTestId('ask-send') as HTMLButtonElement;
    expect(send.textContent).toBe('Send');
    expect(send.disabled).toBe(true);
    // Send is never the page's main action.
    expect(send.className).not.toContain('bg-button');
    fireEvent.change(question, { target: { value: 'Who signs off on a change to the lead time?' } });
    fireEvent.click(send);
    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', kind: 'section', ref: 'security', question: 'Who signs off on a change to the lead time?' }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/p/$repo/$project/th/$thread', params: { repo: 'acme-app', project: 'restock', thread: 't-defense-who-signs-off' } }));
  });

  it('lists the threads already asked about this part, and only those', () => {
    show([link(), link({ ref: 'summary', threadId: 't-defense-other', title: 'Something else?' })]);
    const thread = screen.getByRole('link', { name: /Who can change it\?/ });
    expect(thread.getAttribute('href')).toBe('/p/acme-app/restock/th/t-defense-who-can-change-it');
    expect(screen.getByRole('img', { name: 'With Claude' })).toBeTruthy();
    expect(screen.queryByText('Something else?')).toBeNull();
  });

  it('says why the question was refused, and Cancel closes the form', async () => {
    show([]);
    vi.spyOn(api, 'askAboutDefense').mockRejectedValue(new ApiError(409, 'The Whiteboard Defense changed since this page loaded. Reload it.', null));
    fireEvent.click(screen.getByTestId('ask-claude'));
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Why?' } });
    fireEvent.click(screen.getByTestId('ask-send'));
    expect((await screen.findByRole('alert')).textContent).toBe('The Whiteboard Defense changed since this page loaded. Reload it.');
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('ask-question')).toBeNull();
    expect(screen.getByTestId('ask-claude')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Write the failing e2e test**

At the end of `packages/web/e2e/defense.spec.ts`, add:
```ts
test('Study: ask Claude about a part, and send an unknown to Questions, and Finalize never lists the Defense thread', async ({ page }) => {
  const p = await importProject('def-ask', 'Defense ask');
  await writeDefense(p);
  await page.goto(`${p.url}/defense`);
  const security = page.getByTestId('defense-section-security');
  await expect(security.getByRole('heading')).toHaveText('5. Security model');
  await expect(security.getByText('Unknown', { exact: true })).toBeVisible();

  // The Unknown claim goes to Questions, where Claude suggests answers.
  await security.getByTestId('send-to-plumbing').click();
  await expect(security.getByRole('status')).toHaveText(/^Added to Questions\. /);
  await expect(security.getByRole('link', { name: 'In Questions ›' })).toBeVisible();
  await expect(security.getByTestId('send-to-plumbing')).toHaveCount(0);

  // Asking about Security model opens a Defense thread whose first message is the question.
  await security.getByTestId('ask-claude').click();
  await security.getByTestId('ask-question').fill('Who signs off on a change to the lead time?');
  await security.getByTestId('ask-send').click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/th/t-defense-`));
  await expect(page.getByTestId('messages')).toContainText('Who signs off on a change to the lead time?');
  await expect(page.getByTestId('thread-status')).toHaveText('With Claude');
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await expect(nav.getByTestId('nav-type-defense')).toHaveText('Defense questions');

  // Claude's answer needs nothing more, so it resolves the thread itself. The answer stays, and the form is still there
  // to carry on.
  const threadId = new URL(page.url()).pathname.split('/').at(-1)!;
  const answer = 'The plan names nobody. Until it does, whoever can deploy can change it.';
  await asClaude('/reply', { repo: p.repo, project: p.project, threadId, text: answer, resolve: { decision: 'Nobody signs off on the lead time yet' } });
  await expect(page.getByTestId('thread-status')).toHaveText('Resolved');
  await expect(page.getByTestId('messages')).toContainText(answer);
  await expect(page.getByTestId('answer-form')).toBeVisible();

  // Back on the page, the thread is listed under the part it's about.
  await nav.getByTestId('nav-defense').click();
  await expect(page.getByTestId('defense-section-security').getByRole('link', { name: /Who signs off on a change to the lead time\?/ })).toBeVisible();

  // Finalize never lists a Defense thread.
  await page.goto(`${p.url}/finalize`);
  await expect(page.getByTestId('finalize-checklist')).toBeVisible();
  await expect(page.getByTestId('finalize')).not.toContainText('Who signs off on a change to the lead time?');
});
```

- [ ] **Step 3: Run them to see them fail**

Run:
```bash
pnpm vitest run packages/web/src/pages/defense
pnpm test:e2e defense
```
Expected: FAIL.
- `StudyView.test.tsx` fails because `./labels` can't be resolved, and `AskClaude.test.tsx` because `./AskClaude` can't. `DefensePage.test.tsx` still passes.
- The new e2e test fails at the Security model heading: Study shows only its contents. Task 10's four tests still pass.

- [ ] **Step 4: Write the basis and severity labels**

`packages/web/src/pages/defense/labels.tsx`:
```tsx
import { BASIS_LABELS, type Basis, type Severity } from '@dev-plumbing/core/schemas';

// §16: colour is only ever the text. Known is quiet, Inferred plain ink (slate is the links' colour, and these sit next
// to links), Unknown amber, and Verify before release seal.
const BASIS_CLASSES: Record<Basis, string> = { known: 'text-ink-3', inferred: 'text-ink-2', unknown: 'text-amber', verify: 'text-seal' };
// The risk labels: critical and high seal, medium amber, low ochre, informational quiet.
const SEVERITY_CLASSES: Record<Severity, string> = { critical: 'text-seal', high: 'text-seal', medium: 'text-amber', low: 'text-ochre', info: 'text-ink-3' };

export const basisClass = (b: Basis): string => BASIS_CLASSES[b];
export const severityClass = (s: Severity): string => SEVERITY_CLASSES[s];

/** How sure a statement is: Known, Inferred, Unknown or Verify before release, as a small coloured caption. */
export function BasisLabel({ basis }: { basis: Basis }) {
  return <span className={`whitespace-nowrap text-[11px] font-medium ${basisClass(basis)}`}>{BASIS_LABELS[basis]}</span>;
}
```

- [ ] **Step 5: Write Ask Claude about this**

`packages/web/src/pages/defense/AskClaude.tsx`:
```tsx
import type { DefenseLink } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputClass';
import { StatusMark } from '../../components/StatusMark';

type Props = {
  repo: string;
  project: string;
  defenseId: string;
  kind: 'section' | 'question' | 'concern';
  /** The part: a section's id, or a question's or a concern's (q1, c1). */
  partRef: string;
  /** Every Defense thread asked about this defense. Only this part's are listed. */
  asked: DefenseLink[];
};

/**
 * Ask Claude about this, under one part of the defense: the threads already asked about it, and a form for a new
 * question. Send makes a Defense thread whose first message is your question, sends it to Claude, and opens it.
 */
export function AskClaude({ repo, project, defenseId, kind, partRef, asked }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ask = useMutation({
    mutationFn: () => api.askAboutDefense(repo, project, { defenseId, kind, ref: partRef, question }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project });
      void navigate({ to: '/p/$repo/$project/th/$thread', params: { repo, project, thread: r.threadId } });
    },
  });
  const threads = asked.filter((l) => l.kind === kind && l.ref === partRef);

  return (
    <div className="mt-2">
      {threads.length > 0 && (
        <ul className="mb-1.5 flex flex-col gap-1">
          {threads.map((l) => (
            <li key={l.threadId}>
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: l.threadId }} className="inline-flex max-w-full items-center gap-2 text-[12.5px] text-ink-2">
                <StatusMark status={l.status} />
                <span className="min-w-0 break-words">{l.title}</span>
                <span className="text-ink-3">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form
          aria-label="Ask Claude about this"
          className="mt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) ask.mutate();
          }}
        >
          <label className="block text-[12.5px] text-ink-2">
            Your question
            <textarea
              data-testid="ask-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="What do you want to ask?"
              className={`${inputClass} mt-1`}
              autoFocus
            />
          </label>
          {ask.error && (
            <p role="alert" className="mt-2 text-[12.5px] text-seal">
              {(ask.error as Error).message}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button type="submit" data-testid="ask-send" disabled={!question.trim() || ask.isPending}>
              Send
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <button type="button" data-testid="ask-claude" className="text-[12px] text-slate" onClick={() => setOpen(true)}>
          Ask Claude about this
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write Study**

`packages/web/src/pages/defense/StudyView.tsx` becomes:
```tsx
import { DEFENSE_PARTS, DEFENSE_SECTIONS, parseData, SEVERITY_LABELS, type DefenseLink, type DefenseTable, type WhiteboardDefense } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { MouseEvent, ReactNode } from 'react';
import { api } from '../../api/client';
import { DiagramView } from '../../diagram/DiagramView';
import { AskClaude } from './AskClaude';
import type { DefenseViewProps } from './DefensePage';
import { BasisLabel, severityClass } from './labels';

type Entry = { anchor: string; n: number; title: string };
type Section = WhiteboardDefense['sections'][number];
/** Where a part's links go, and the threads asked about and sent from this defense. */
type Ctx = { repo: string; project: string; defenseId: string; asked: DefenseLink[]; sent: DefenseLink[] };

const numberOf = (id: Section['id']) => DEFENSE_SECTIONS.find((s) => s.id === id)?.n ?? 0;

/** The 13 parts in order: prose sections 1–9, the questions (10), the concerns (11), the unknowns (12), the checklist (13). */
export function contents(d: WhiteboardDefense): Entry[] {
  const prose = d.sections.map((s) => ({ anchor: `defense-section-${s.id}`, n: numberOf(s.id), title: s.title }));
  const parts = [
    { anchor: 'defense-questions', ...DEFENSE_PARTS.questions },
    { anchor: 'defense-concerns', ...DEFENSE_PARTS.concerns },
    { anchor: 'defense-checklist', ...DEFENSE_PARTS.checklist },
  ];
  return [...prose, ...parts].sort((a, b) => a.n - b.n);
}

/** Scrolls to a part in place, so the page's address (and its ?mode) stays as it is. */
function jump(anchor: string) {
  return (e: MouseEvent) => {
    const target = document.getElementById(anchor);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

export function Contents({ defense }: { defense: WhiteboardDefense }) {
  return (
    <nav aria-label="Contents" className="mt-6">
      <p className="text-[12px] font-semibold text-ink-3">Contents</p>
      <ol className="mt-1.5 text-[13px] leading-6 md:columns-2">
        {contents(defense).map((e) => (
          <li key={e.anchor} className="break-inside-avoid">
            <a href={`#${e.anchor}`} onClick={jump(e.anchor)} className="text-slate">
              {e.n}. {e.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** One of the 13 parts: its numbered heading, then its content. The id is what Contents scrolls to. */
function Part({ anchor, n, title, children }: Entry & { children: ReactNode }) {
  return (
    <section id={anchor} data-testid={anchor} className="mt-9 scroll-mt-4">
      <h3 className="text-[17px] font-semibold">
        {n}. {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Send to Questions (a claim marked Unknown or Verify before release) or Send to Concerns (a release concern). Once
 * it's sent, a link to that thread instead. Claude picks it up and suggests answers.
 */
function SendToPlumbing({ ctx, kind, partRef }: { ctx: Ctx; kind: 'claim' | 'concern'; partRef: string }) {
  const { repo, project, defenseId } = ctx;
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: () => api.sendFromDefense(repo, project, { defenseId, kind, ref: partRef }),
    onSuccess: () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project }),
  });
  const target = kind === 'claim' ? 'Questions' : 'Concerns';
  const sent = ctx.sent.find((l) => l.kind === kind && l.ref === partRef);
  return (
    <span className="ml-2 inline-flex flex-wrap items-baseline gap-x-2">
      {sent ? (
        <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: sent.threadId }} className="whitespace-nowrap text-[12px] text-slate">
          In {target} ›
        </Link>
      ) : (
        <button type="button" data-testid="send-to-plumbing" className="whitespace-nowrap text-[12px] text-slate disabled:opacity-40" disabled={send.isPending || send.isSuccess} onClick={() => send.mutate()}>
          Send to {target}
        </button>
      )}
      {send.data && (
        <span role="status" className="text-[12px] text-ink-3">
          {send.data.message}
        </span>
      )}
      {send.error && (
        <span role="alert" className="text-[12px] text-seal">
          {(send.error as Error).message}
        </span>
      )}
    </span>
  );
}

/** A table: a real one from 768 px, and one card per row on a phone, so nothing scrolls sideways. */
function TableView({ table }: { table: DefenseTable }) {
  return (
    <div className="mt-4" data-testid="defense-table">
      <p className="text-[12.5px] font-semibold">{table.title}</p>
      <table className="mt-1.5 hidden w-full table-fixed border-collapse text-[13px] md:table">
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} className="border-b-[0.5px] border-separator px-2.5 py-1.5 text-left text-[11.5px] font-semibold text-ink-3">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i} className="break-words border-b-[0.5px] border-separator px-2.5 py-1.5 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1.5 overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell md:hidden [&>*+*]:border-t-[0.5px] [&>*+*]:border-separator">
        {table.rows.map((row, r) => (
          <dl key={r} className="px-3 py-2.5 text-[13px]">
            {row.map((cell, i) => (
              <div key={i} className="mt-1 first:mt-0">
                <dt className="text-[11px] font-semibold text-ink-3">{table.columns[i]}</dt>
                <dd className="break-words">{cell}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    </div>
  );
}

/**
 * The project's diagram item that section 2 names, drawn as its screen draws it, with a link there. Nothing when the
 * item no longer has a diagram to draw.
 */
function DiagramItem({ repo, project, itemId }: { repo: string; project: string; itemId: string }) {
  // Every item's thread is t-<item id>; its detail has the item's data and its type's screen.
  const threadId = `t-${itemId}`;
  const q = useQuery({ queryKey: ['thread', repo, project, threadId], queryFn: () => api.thread(repo, project, threadId) });
  if (!q.data || q.data.type.screen !== 'diagram') return null;
  const parsed = parseData('diagram', q.data.item.data);
  if (!parsed.ok) return null;
  return (
    <div className="mt-4" data-testid="defense-diagram-item">
      <DiagramView data={parsed.data} compact />
      <Link to="/p/$repo/$project/t/$type" params={{ repo, project, type: q.data.type.id }} search={{ item: itemId }} className="mt-1 inline-block text-[12px] text-slate">
        {q.data.item.title} ›
      </Link>
    </div>
  );
}

function ProseSection({ section, ctx }: { section: Section; ctx: Ctx }) {
  const s = section;
  return (
    <Part anchor={`defense-section-${s.id}`} n={numberOf(s.id)} title={s.title}>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed">
        {s.claims.map((c, i) => (
          <li key={i} className="break-words">
            <span className="whitespace-pre-line">{c.text}</span> <BasisLabel basis={c.basis} />
            {(c.basis === 'unknown' || c.basis === 'verify') && <SendToPlumbing ctx={ctx} kind="claim" partRef={`${s.id}.${i}`} />}
          </li>
        ))}
      </ul>
      {s.tables.map((t, i) => (
        <TableView key={i} table={t} />
      ))}
      {s.diagramItemId && <DiagramItem repo={ctx.repo} project={ctx.project} itemId={s.diagramItemId} />}
      {s.diagram && (
        <pre data-testid="defense-diagram" className="mt-4 overflow-x-auto border-l-2 border-separator py-1 pl-3 font-mono text-[12.5px]">
          {s.diagram}
        </pre>
      )}
      <AskClaude repo={ctx.repo} project={ctx.project} defenseId={ctx.defenseId} kind="section" partRef={s.id} asked={ctx.asked} />
    </Part>
  );
}

/**
 * Study: the defense to read, in the order of the 13 sections. Every statement says how sure it is. Any part can be
 * asked about, and what's unknown or still to verify, and each release concern, can be sent to plumbing.
 */
export function StudyView({ view, repo, project }: DefenseViewProps) {
  const d = view.defense;
  const ctx: Ctx = { repo, project, defenseId: d.id, asked: view.asked, sent: view.sent };
  const ticks = new Set(view.practice?.ticks ?? []);
  const ticked = d.checklist.filter((k) => ticks.has(k.id)).length;
  const prose = (from: number, to: number) => d.sections.filter((s) => numberOf(s.id) >= from && numberOf(s.id) <= to).map((s) => <ProseSection key={s.id} section={s} ctx={ctx} />);

  return (
    <div className="max-w-[72ch]" data-testid="study">
      <Contents defense={d} />
      {prose(1, 9)}
      <Part anchor="defense-questions" {...DEFENSE_PARTS.questions}>
        {d.questions.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-3">No questions in this defense.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-4">
            {d.questions.map((q) => (
              <li key={q.id} className="break-words text-[14px] leading-relaxed">
                <p className="font-semibold">{q.q}</p>
                <p className="mt-0.5">
                  <span className="whitespace-pre-line">{q.a}</span> <BasisLabel basis={q.basis} />
                </p>
                <AskClaude repo={repo} project={project} defenseId={d.id} kind="question" partRef={q.id} asked={view.asked} />
              </li>
            ))}
          </ol>
        )}
      </Part>
      <Part anchor="defense-concerns" {...DEFENSE_PARTS.concerns}>
        {d.concerns.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-3">None.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-4">
            {d.concerns.map((c) => (
              <li key={c.id} className="break-words text-[14px] leading-relaxed">
                <span className={`mr-1.5 text-[11px] font-semibold ${severityClass(c.severity)}`}>{SEVERITY_LABELS[c.severity]}</span>
                <span className="whitespace-pre-line">{c.text}</span> <BasisLabel basis={c.basis} />
                <SendToPlumbing ctx={ctx} kind="concern" partRef={c.id} />
                <AskClaude repo={repo} project={project} defenseId={d.id} kind="concern" partRef={c.id} asked={view.asked} />
              </li>
            ))}
          </ul>
        )}
      </Part>
      {prose(12, 12)}
      <Part anchor="defense-checklist" {...DEFENSE_PARTS.checklist}>
        <p className="mt-1 text-[12px] text-ink-3">
          {ticked} of {d.checklist.length} ticked
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 text-[14px]">
          {d.checklist.map((k) => (
            <li key={k.id} className="flex items-baseline gap-2.5">
              {ticks.has(k.id) ? (
                <span role="img" aria-label="Ticked" className="w-3 shrink-0 text-center text-[12px] font-bold text-moss">
                  ✓
                </span>
              ) : (
                <span role="img" aria-label="Not ticked" className="inline-block size-[9px] shrink-0 translate-y-[1px] rounded-full border-[1.5px] border-mist" />
              )}
              <span className="min-w-0 break-words">{k.text}</span>
            </li>
          ))}
        </ul>
      </Part>
    </div>
  );
}
```

- [ ] **Step 7: Run the component tests**

Run: `pnpm vitest run packages/web/src/pages/defense && pnpm --filter @dev-plumbing/web typecheck`
Expected: PASS (31 tests: 16 for the page, 12 for Study, 3 for Ask Claude).

- [ ] **Step 8: Run everything**

Run:
```bash
pnpm vitest run packages/web
pnpm typecheck
pnpm test
pnpm test:e2e defense
pnpm test:e2e
```
Expected: PASS (5 tests in `defense.spec.ts`).
- **If the thread page never shows your question:** `/ask` must call `submit({ scope: 'thread' })` after `askAboutDefense` (Task 8), so the draft becomes the first `you` message.
- **If "Defense questions" never shows in the nav:** the built-in Defense type is listed only once it has items (Task 2), and `home.types` is refreshed by the project event `/ask` sends.
- **If the Finalize page lists the Defense thread:** that's Task 2's `checklistFrom` exclusion.
- **If "In Questions ›" never replaces Send:** Task 8's GET must list the sent item in `sent` with `kind: 'claim'` and `ref: 'security.1'`.
- **If the phone test (Task 10's) now finds sideways scrolling:** the table must be `hidden md:table`, with the cards `md:hidden`, and the text diagram's `pre` scrolls inside itself (`overflow-x-auto`).

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/pages/defense packages/web/e2e/defense.spec.ts
git commit -m "feat(web): Study the Whiteboard Defense, ask Claude about any part, and send unknowns and concerns to plumbing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Web: Practice

Practice is for saying it out loud: one question at a time, the answer behind **Show answer**, and then a rating you give yourself, which moves on to the next card. The keys work too: Space or Enter shows the answer, 1 to 3 rate it, and ← → move. "Only shaky and couldn't" narrows the deck to the cards you rated so. A readiness meter (half flashcards, half checklist) and the checklist sit with the cards. Ratings and ticks are saved as you go, and a regenerated defense keeps the ones that still apply. The page keeps your card and the switch, so Study and back loses neither.

**Files:**
- Create:
  - `packages/web/src/pages/defense/Flashcard.tsx`
  - `packages/web/src/pages/defense/DefenseChecklist.tsx`
  - `packages/web/src/pages/defense/PracticeView.test.tsx`
  - `packages/web/e2e/defense-practice.spec.ts`
- Modify:
  - `packages/web/src/pages/defense/PracticeView.tsx` (replaced whole)
  - `packages/web/src/components/ProgressBar.tsx` (an optional `label`, so the meter can be named "Readiness")
  - `packages/web/src/components/components.test.tsx` (the ProgressBar tests)
- Test:
  - `packages/web/src/pages/defense/PracticeView.test.tsx`
  - `packages/web/src/components/components.test.tsx`
  - `packages/web/e2e/defense-practice.spec.ts`

Study keeps its own read-only checklist from Task 11; `DefenseChecklist` is Practice's, with checkboxes. `StudyView` doesn't change in this task.

**Interfaces:**
- Consumes:
  - Task 10: `DefenseBody`, `PracticeViewProps` (`DefenseViewProps` with `place: PracticePlace` and `onPlace`: the page keeps Practice's card and deck), `api.ratePractice` and `api.tickPractice`, the query key `['whiteboard', repo, project]`, the testkit (`defense`, `practice`, `view`), and the e2e helpers `defenseInput` and `writeDefense`.
  - Task 11: `AskClaude` (with `kind: 'question'`, `partRef: q.id`), `BasisLabel`, and Study's `data-testid="study"`.
  - Plans 1–5: `Switch` (`components/Switch.tsx`), `Button` and `ProgressBar`.
  - Task 1: `PracticeView` (the type; imported here as `Practice`, since the component has the same name), `Rating` and `WhiteboardDefense`.
  - Task 6 and 8: `/practice/rating` and `/practice/tick` return the whole new `PracticeView`. Readiness is half flashcards, half checklist: round(100 × the mean of (could + ½ shaky) / cards and ticked / lines). Ratings are kept by the question's text and ticks by the line's text, so a regenerated defense keeps what still matches.
- Produces:
  - `Flashcard({ repo, project, defenseId, question, i, n, rating, shown, onShow, busy, onRate, asked })` and `RATINGS` (the three ratings in key order) from `pages/defense/Flashcard.tsx`.
  - `DefenseChecklist({ checklist, ticks, pending?, onTick })` from `pages/defense/DefenseChecklist.tsx`.
  - `PracticeView` replaced.
  - `ProgressBar` takes `label?: string` (default "Resolved threads", so every existing bar is unchanged).
  - Test ids: `practice`, `readiness` (the "Readiness n%" line), `practice-counts`, `flashcard`, `show-answer`, `flashcard-answer`, and the Practice checklist's `defense-checklist`. The switch is found by its role and name.
- **Behaviour:**
  - **Readiness:** "Readiness n%" over the meter, a `ProgressBar` named "Readiness" with `resolved` = readiness and `total` = 100 (moss on `bg-selection`), then `${could} could explain · ${shaky} shaky · ${couldnt} couldn't · ${unrated} not yet`.
  - **The card** (`flashcard`), a hairline card on `bg-cell`: `Card ${i} of ${n}`, the question as an `h3`, and **Show answer** (secondary, small) until it's pressed. Then the answer with its `BasisLabel`, and only then three secondary chips in a group labelled "Your rating": "Could explain it", "Shaky", "Couldn't". The chosen one has `aria-pressed="true"`, the selection tint and its colour as text (moss, amber, seal). Choosing it again clears it (`rating: null`). Ask Claude about this sits at the card's foot.
  - **A rating moves on:** once the service has saved it, the next card shows, its answer hidden. On the last card it stays, showing the rating. Clearing a rating stays on the card, and so does a refusal.
  - **Previous / Next** under the card, off at the first and last card (no wrapping). A new card starts with its answer hidden.
  - **Keys,** while no input, textarea or select has the focus (and with no Cmd, Ctrl or Alt): Space or Enter shows the answer, with `preventDefault` so a focused button isn't pressed too; 1, 2 and 3 press the three ratings once the answer shows; ← and → move, as Previous and Next.
  - **"Only shaky and couldn't"** is a `Switch` with that label, above the card. Turned on, it fixes the deck to the cards rated Shaky or Couldn't at that moment, and starts at its first card: rating one of them "Could explain it" moves on, but doesn't pull it out of the deck. It leaves the deck at the next toggle. Turned off, the deck is every card again, from card 1. With nothing to show: "Nothing rated shaky or couldn't.", and no card or Previous / Next.
  - **Where you are** (the card and the deck) is `place`, kept by the page (Task 10), so switching to Study and back keeps both. Whether the answer shows is Practice's own, and each card starts hidden. A regenerated defense starts again at card 1, with the whole deck.
  - **No questions:** "No questions in this defense.", and no switch, card or Previous / Next.
  - **The checklist:** "Checklist", `${ticked} of ${total} ticked`, then one checkbox per line in a grouped list. A tick posts at once. From the click until the service answers, that box shows where it's going and every box waits, so two ticks can't race.
  - **Saving:** the service's `PracticeView` goes straight into the page's query data (`setQueryData`), so the meter, counts and marks change at once. The project event that follows refetches the same thing. A refusal shows in seal (`role="alert"`) and reloads the page's data.
  - No button in Practice is primary.

- [ ] **Step 1: Write the failing component tests**

`packages/web/src/pages/defense/PracticeView.test.tsx`:
```tsx
import type { WhiteboardView } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api/client';
import { DefenseBody, type DefenseMode } from './DefensePage';
import { defense, practice, view } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The page in Practice, so a rating or a tick shows up the way it does in the app: through the page's data. */
function show(v: WhiteboardView = view()) {
  const whiteboard = vi.spyOn(api, 'whiteboard').mockResolvedValue(v);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = (mode: DefenseMode) => (
    <QueryClientProvider client={client}>
      <DefenseBody repo="acme-app" project="restock" mode={mode} />
    </QueryClientProvider>
  );
  const { rerender } = render(page('practice'));
  return { whiteboard, switchTo: (mode: DefenseMode) => rerender(page(mode)) };
}

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
const card = () => screen.getByTestId('flashcard');
const RATED = { ratings: { q1: 'could', q2: 'shaky', q3: 'couldnt' } as const, readiness: 25, counts: { could: 1, shaky: 1, couldnt: 1, unrated: 0, ticked: 0, checklist: 4 } };

describe('Practice', () => {
  it('shows how ready you are, the counts, and the first card with its answer and its ratings hidden', async () => {
    show(view({ practice: practice({ ratings: { q1: 'could', q2: 'shaky' }, ticks: ['k1', 'k2'], readiness: 50, counts: { could: 1, shaky: 1, couldnt: 0, unrated: 1, ticked: 2, checklist: 4 } }) }));
    expect((await screen.findByTestId('readiness')).textContent).toBe('Readiness 50%');
    const meter = screen.getByRole('progressbar', { name: 'Readiness' });
    expect(meter.getAttribute('aria-valuenow')).toBe('50');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect((meter.firstElementChild as HTMLElement).className).toContain('bg-moss');
    expect(meter.className).toContain('bg-selection');
    expect(screen.getByTestId('practice-counts').textContent).toBe("1 could explain · 1 shaky · 0 couldn't · 1 not yet");
    expect(card().textContent).toContain('Card 1 of 3');
    expect(within(card()).getByRole('heading').textContent).toBe('What happens if the job runs twice?');
    expect(within(card()).queryByTestId('flashcard-answer')).toBeNull();
    // You rate yourself after you've seen the answer.
    expect(within(card()).queryByRole('group', { name: 'Your rating' })).toBeNull();
    // Study's parts aren't shown in Practice.
    expect(screen.queryByTestId('defense-section-summary')).toBeNull();
  });

  it('Show answer reveals the answer, how sure it is, and the ratings', async () => {
    show(view({ practice: practice({ ratings: { q1: 'could' } }) }));
    fireEvent.click(await screen.findByTestId('show-answer'));
    const answer = screen.getByTestId('flashcard-answer');
    expect(answer.textContent).toBe('Every reminder goes out again, so it needs a sent marker. Inferred');
    expect(within(answer).getByText('Inferred').className).toContain('text-ink-2');
    expect(screen.queryByTestId('show-answer')).toBeNull();
    expect(pressed('Could explain it')).toBe('true');
    expect(pressed('Shaky')).toBe('false');
    expect(pressed("Couldn't")).toBe('false');
  });

  it('moves between cards with Previous and Next, without wrapping, and hides each answer again', async () => {
    show();
    const previous = (await screen.findByRole('button', { name: 'Previous' })) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('show-answer'));
    fireEvent.click(next);
    expect(card().textContent).toContain('Card 2 of 3');
    expect(card().textContent).toContain('Where is a reminder recorded?');
    expect(screen.queryByTestId('flashcard-answer')).toBeNull();
    fireEvent.click(next);
    expect(card().textContent).toContain('Card 3 of 3');
    expect(next.disabled).toBe(true);
    fireEvent.click(previous);
    expect(card().textContent).toContain('Card 2 of 3');
  });

  it('saves a rating, shows the new readiness straight away, and moves to the next card', async () => {
    const { whiteboard } = show();
    const rate = vi.spyOn(api, 'ratePractice').mockResolvedValue(practice({ ratings: { q1: 'could' }, readiness: 17, counts: { could: 1, shaky: 0, couldnt: 0, unrated: 2, ticked: 0, checklist: 4 } }));
    fireEvent.click(await screen.findByTestId('show-answer'));
    fireEvent.click(screen.getByRole('button', { name: 'Could explain it' }));
    await waitFor(() => expect(rate).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', questionId: 'q1', rating: 'could' }));
    await waitFor(() => expect(screen.getByTestId('readiness').textContent).toBe('Readiness 17%'));
    expect(screen.getByTestId('practice-counts').textContent).toBe("1 could explain · 0 shaky · 0 couldn't · 2 not yet");
    expect(card().textContent).toContain('Card 2 of 3');
    expect(screen.queryByTestId('flashcard-answer')).toBeNull();
    // The first card keeps it.
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByTestId('show-answer'));
    expect(pressed('Could explain it')).toBe('true');
    expect(screen.getByRole('button', { name: 'Could explain it' }).className).toContain('text-moss');
    expect(whiteboard).toHaveBeenCalledTimes(1);
  });

  it('stays on the last card once it is rated, showing the rating', async () => {
    show();
    vi.spyOn(api, 'ratePractice').mockResolvedValue(practice({ ratings: { q3: 'shaky' }, readiness: 8, counts: { could: 0, shaky: 1, couldnt: 0, unrated: 2, ticked: 0, checklist: 4 } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByTestId('show-answer'));
    fireEvent.click(screen.getByRole('button', { name: 'Shaky' }));
    await waitFor(() => expect(pressed('Shaky')).toBe('true'));
    expect(card().textContent).toContain('Card 3 of 3');
  });

  it('clears a rating when you choose it again, and stays on the card', async () => {
    show(view({ practice: practice({ ratings: { q1: 'shaky' }, readiness: 8, counts: { could: 0, shaky: 1, couldnt: 0, unrated: 2, ticked: 0, checklist: 4 } }) }));
    const rate = vi.spyOn(api, 'ratePractice').mockResolvedValue(practice());
    fireEvent.click(await screen.findByTestId('show-answer'));
    fireEvent.click(screen.getByRole('button', { name: 'Shaky' }));
    await waitFor(() => expect(rate).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', questionId: 'q1', rating: null }));
    await waitFor(() => expect(pressed('Shaky')).toBe('false'));
    expect(card().textContent).toContain('Card 1 of 3');
  });

  it('works from the keyboard: Space or Enter shows the answer, 1 to 3 rate it, and the arrows move', async () => {
    show();
    const rate = vi.spyOn(api, 'ratePractice').mockResolvedValue(practice({ ratings: { q1: 'shaky' }, readiness: 8, counts: { could: 0, shaky: 1, couldnt: 0, unrated: 2, ticked: 0, checklist: 4 } }));
    await screen.findByTestId('flashcard');
    // A rating key does nothing until the answer shows.
    fireEvent.keyDown(window, { key: '2' });
    expect(rate).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByTestId('flashcard-answer')).toBeTruthy();
    fireEvent.keyDown(window, { key: '2' });
    await waitFor(() => expect(rate).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', questionId: 'q1', rating: 'shaky' }));
    await waitFor(() => expect(card().textContent).toContain('Card 2 of 3'));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByTestId('flashcard-answer')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(card().textContent).toContain('Card 3 of 3');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(card().textContent).toContain('Card 3 of 3');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(card().textContent).toContain('Card 2 of 3');
    // Typing a question to Claude is typing, not practising.
    fireEvent.click(within(card()).getByTestId('ask-claude'));
    fireEvent.keyDown(within(card()).getByLabelText('Your question'), { key: ' ' });
    expect(screen.queryByTestId('flashcard-answer')).toBeNull();
  });

  it("narrows the deck to the cards rated shaky or couldn't, fixed while the switch is on", async () => {
    show(view({ practice: practice(RATED) }));
    const only = await screen.findByRole('switch', { name: "Only shaky and couldn't" });
    expect(only.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(only);
    expect(only.getAttribute('aria-checked')).toBe('true');
    expect(card().textContent).toContain('Card 1 of 2');
    expect(card().textContent).toContain('Where is a reminder recorded?');
    // Rating it Could explain it moves on, but doesn't take it out of the deck.
    vi.spyOn(api, 'ratePractice').mockResolvedValue(practice({ ...RATED, ratings: { ...RATED.ratings, q2: 'could' } }));
    fireEvent.click(screen.getByTestId('show-answer'));
    fireEvent.click(screen.getByRole('button', { name: 'Could explain it' }));
    await waitFor(() => expect(card().textContent).toContain('Card 2 of 2'));
    expect(card().textContent).toContain('Who can change the lead time?');
    // It leaves at the next toggle.
    fireEvent.click(only);
    expect(card().textContent).toContain('Card 1 of 3');
    fireEvent.click(only);
    expect(card().textContent).toContain('Card 1 of 1');
  });

  it("says so when nothing is rated shaky or couldn't", async () => {
    show();
    fireEvent.click(await screen.findByRole('switch', { name: "Only shaky and couldn't" }));
    expect(screen.getByText("Nothing rated shaky or couldn't.")).toBeTruthy();
    expect(screen.queryByTestId('flashcard')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('keeps the card and the switch when you go to Study and back', async () => {
    const { switchTo } = show(view({ practice: practice(RATED) }));
    fireEvent.click(await screen.findByRole('switch', { name: "Only shaky and couldn't" }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(card().textContent).toContain('Card 2 of 2');
    switchTo('study');
    expect(await screen.findByTestId('study')).toBeTruthy();
    switchTo('practice');
    expect((await screen.findByTestId('flashcard')).textContent).toContain('Card 2 of 2');
    expect(screen.getByRole('switch', { name: "Only shaky and couldn't" }).getAttribute('aria-checked')).toBe('true');
  });

  it('ticks a checklist line, and counts it', async () => {
    show();
    const tick = vi.spyOn(api, 'tickPractice').mockResolvedValue(practice({ ticks: ['k2'], readiness: 13, counts: { could: 0, shaky: 0, couldnt: 0, unrated: 3, ticked: 1, checklist: 4 } }));
    const checklist = await screen.findByTestId('defense-checklist');
    expect(checklist.textContent).toContain('0 of 4 ticked');
    const box = within(checklist).getByRole('checkbox', { name: 'I can explain the data flow.' }) as HTMLInputElement;
    fireEvent.click(box);
    await waitFor(() => expect(tick).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', checklistId: 'k2', ticked: true }));
    await waitFor(() => expect(checklist.textContent).toContain('1 of 4 ticked'));
    expect(box.checked).toBe(true);
    expect(screen.getByTestId('readiness').textContent).toBe('Readiness 13%');
  });

  it('says why a rating was refused', async () => {
    show();
    vi.spyOn(api, 'ratePractice').mockRejectedValue(new ApiError(409, 'The Whiteboard Defense changed since this page loaded. Reload it.', null));
    fireEvent.click(await screen.findByTestId('show-answer'));
    fireEvent.click(screen.getByRole('button', { name: "Couldn't" }));
    expect((await screen.findByRole('alert')).textContent).toBe('The Whiteboard Defense changed since this page loaded. Reload it.');
    expect(card().textContent).toContain('Card 1 of 3');
  });

  it('asks Claude about a card', async () => {
    show();
    fireEvent.click(within(await screen.findByTestId('flashcard')).getByTestId('ask-claude'));
    expect(within(card()).getByLabelText('Your question')).toBeTruthy();
  });

  it('says when the defense has no questions', async () => {
    show(view({ defense: defense({ questions: [] }), practice: practice({ counts: { could: 0, shaky: 0, couldnt: 0, unrated: 0, ticked: 0, checklist: 4 } }) }));
    expect(await screen.findByText('No questions in this defense.')).toBeTruthy();
    expect(screen.queryByTestId('flashcard')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByTestId('defense-checklist')).toBeTruthy();
  });
});
```

In `packages/web/src/components/components.test.tsx`, replace:
```tsx
describe('ProgressBar', () => {
  it('reports resolved out of total', () => {
    render(<ProgressBar resolved={3} total={6} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemax')).toBe('6');
  });
});
```
with:
```tsx
describe('ProgressBar', () => {
  it('reports resolved out of total', () => {
    render(<ProgressBar resolved={3} total={6} />);
    const bar = screen.getByRole('progressbar', { name: 'Resolved threads' });
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemax')).toBe('6');
  });

  it('can be named for what it measures', () => {
    render(<ProgressBar resolved={55} total={100} label="Readiness" />);
    const bar = screen.getByRole('progressbar', { name: 'Readiness' });
    expect(bar.getAttribute('aria-valuenow')).toBe('55');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('55%');
  });
});
```

- [ ] **Step 2: Write the failing e2e tests**

`packages/web/e2e/defense-practice.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { defenseInput, importProject, writeDefense } from './claude';
import { noSideScroll } from './env';

/** The first four of the rules file's 20 checklist lines, which the service copies into every defense. */
const LINES = ['I can explain the purpose.', 'I can draw the system flow.', 'I understand the important data.', 'I know the source of truth for important state.'];

/** Rates card 1 Could explain it with a click, and card 2 Shaky with the keys, and ticks the first four checklist lines. */
async function practise(page: Page) {
  const card = page.getByTestId('flashcard');
  await expect(card).toContainText('Card 1 of 3');
  // The ratings come with the answer.
  await expect(card.getByRole('button', { name: 'Could explain it' })).toHaveCount(0);
  await card.getByTestId('show-answer').click();
  await expect(card).toContainText('Every reminder goes out again, so it needs a sent marker.');
  await card.getByRole('button', { name: 'Could explain it' }).click();
  // A rating moves to the next card. Space shows its answer, and 2 rates it Shaky.
  await expect(card).toContainText('Card 2 of 3');
  await expect(card.getByTestId('flashcard-answer')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(card.getByTestId('flashcard-answer')).toContainText('In the reminders table.');
  await page.keyboard.press('2');
  await expect(card).toContainText('Card 3 of 3');
  await page.keyboard.press('ArrowLeft');
  await expect(card).toContainText('Card 2 of 3');
  await page.keyboard.press('Enter');
  await expect(card.getByRole('button', { name: 'Shaky' })).toHaveAttribute('aria-pressed', 'true');
  const checklist = page.getByTestId('defense-checklist');
  for (const line of LINES) {
    await checklist.getByRole('checkbox', { name: line }).check();
    await expect(checklist.getByRole('checkbox', { name: line })).toBeChecked();
  }
}

test('Practice keeps your ratings and ticks, and a regenerated defense keeps what still applies', async ({ page }) => {
  const p = await importProject('def-practice', 'Defense practice');
  await writeDefense(p);
  await page.goto(`${p.url}/defense`);
  await page.getByRole('tab', { name: 'Practice' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/defense\\?mode=practice$`));
  await expect(page.getByTestId('readiness')).toHaveText('Readiness 0%');
  await expect(page.getByTestId('practice-counts')).toHaveText("0 could explain · 0 shaky · 0 couldn't · 3 not yet");

  await practise(page);
  // Half the cards, half the checklist: round(100 × ((1 + ½) / 3 + 4 / 20) / 2) = 35
  await expect(page.getByTestId('readiness')).toHaveText('Readiness 35%');
  await expect(page.getByRole('progressbar', { name: 'Readiness' })).toHaveAttribute('aria-valuenow', '35');
  await expect(page.getByTestId('practice-counts')).toHaveText("1 could explain · 1 shaky · 0 couldn't · 1 not yet");
  await expect(page.getByTestId('defense-checklist')).toContainText('4 of 20 ticked');

  // Only shaky and couldn't: the one card rated Shaky. Study and back keeps the switch and the card.
  const only = page.getByRole('switch', { name: "Only shaky and couldn't" });
  await only.click();
  const card = page.getByTestId('flashcard');
  await expect(card).toContainText('Card 1 of 1');
  await expect(card).toContainText('Where is a reminder recorded?');
  await page.getByRole('tab', { name: 'Study' }).click();
  // Study shows the ticks too, read-only.
  await expect(page.getByTestId('defense-checklist')).toContainText('4 of 20 ticked');
  await page.getByRole('tab', { name: 'Practice' }).click();
  await expect(card).toContainText('Card 1 of 1');
  await expect(only).toHaveAttribute('aria-checked', 'true');
  await only.click();
  await expect(card).toContainText('Card 1 of 3');

  // Everything is saved.
  await page.reload();
  await expect(page.getByTestId('readiness')).toHaveText('Readiness 35%');
  await card.getByTestId('show-answer').click();
  await expect(card.getByRole('button', { name: 'Could explain it' })).toHaveAttribute('aria-pressed', 'true');
  for (const line of LINES) await expect(page.getByTestId('defense-checklist').getByRole('checkbox', { name: line })).toBeChecked();

  // Regenerated with the same checklist and the second question asked another way: the ticks and the first card's
  // rating stay, and the changed card starts unrated.
  const input = defenseInput();
  input.questions[1].q = 'Where does a sent reminder get recorded?';
  await writeDefense(p, input);
  await expect(page.getByTestId('practice-counts')).toHaveText("1 could explain · 0 shaky · 0 couldn't · 2 not yet");
  // round(100 × (1 / 3 + 4 / 20) / 2) = 27
  await expect(page.getByTestId('readiness')).toHaveText('Readiness 27%');
  await expect(page.getByTestId('defense-checklist')).toContainText('4 of 20 ticked');
  await expect(card).toContainText('Card 1 of 3');
  await card.getByTestId('show-answer').click();
  await expect(card.getByRole('button', { name: 'Could explain it' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('Where does a sent reminder get recorded?');
  await card.getByTestId('show-answer').click();
  for (const name of ['Could explain it', 'Shaky', "Couldn't"]) await expect(card.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('a card, the meter and the checklist fit the width', async ({ page }) => {
    const p = await importProject('def-practice-phone', 'Defense practice phone');
    await writeDefense(p);
    await page.goto(`${p.url}/defense?mode=practice`);
    await expect(page.getByTestId('flashcard')).toContainText('Card 1 of 3');
    await page.getByTestId('show-answer').click();
    await expect(page.getByTestId('defense-checklist')).toContainText('0 of 20 ticked');
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run:
```bash
pnpm vitest run packages/web/src/pages/defense packages/web/src/components
pnpm test:e2e defense-practice
```
Expected: FAIL.
- In `PracticeView.test.tsx`, all fourteen fail: Task 10's `PracticeView` renders nothing, so there's no `readiness`, `show-answer`, switch, card or checklist.
- In `components.test.tsx`, the new ProgressBar test fails (the bar is always named "Resolved threads"); the rest pass.
- Both e2e tests fail waiting for `readiness` and `flashcard`.

- [ ] **Step 4: Let a ProgressBar be named for what it measures**

`packages/web/src/components/ProgressBar.tsx` becomes:
```tsx
/** A thin moss bar on the selection tint: `resolved` of `total`. `label` names it for screen readers. */
export function ProgressBar({ resolved, total, withClaude = 0, label = 'Resolved threads' }: { resolved: number; total: number; withClaude?: number; label?: string }) {
  const pct = (n: number) => `${total ? Math.round((n / total) * 100) : 0}%`;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={resolved} className="flex h-1 w-full overflow-hidden rounded-full bg-selection">
      <span className="h-full bg-moss" style={{ width: pct(resolved) }} />
      <span className="h-full bg-slate/50" style={{ width: pct(withClaude) }} />
    </div>
  );
}
```

- [ ] **Step 5: Write the flashcard and the checklist**

`packages/web/src/pages/defense/Flashcard.tsx`:
```tsx
import type { DefenseLink, Rating, WhiteboardDefense } from '@dev-plumbing/core/schemas';
import { Button } from '../../components/Button';
import { AskClaude } from './AskClaude';
import { BasisLabel } from './labels';

/** The three ratings you give yourself, in order (the keys 1, 2 and 3), each with the colour of its text once chosen. */
export const RATINGS: { value: Rating; label: string; tone: string }[] = [
  { value: 'could', label: 'Could explain it', tone: 'text-moss' },
  { value: 'shaky', label: 'Shaky', tone: 'text-amber' },
  { value: 'couldnt', label: "Couldn't", tone: 'text-seal' },
];
const CHIP = 'inline-flex items-center rounded-[6px] border-[0.5px] border-separator px-2.5 py-1 text-[11.5px] font-medium disabled:cursor-not-allowed disabled:opacity-40';

/**
 * One question to explain out loud. Show answer reveals the defense's answer and how sure it is, and only then the
 * ratings you give yourself. Choosing your rating again clears it. Practice keeps whether it's shown, so its keys work.
 */
export function Flashcard({
  repo,
  project,
  defenseId,
  question,
  i,
  n,
  rating,
  shown,
  onShow,
  busy,
  onRate,
  asked,
}: {
  repo: string;
  project: string;
  defenseId: string;
  question: WhiteboardDefense['questions'][number];
  /** Its place in the deck, from 1. */
  i: number;
  n: number;
  rating: Rating | null;
  /** Whether the answer is showing. */
  shown: boolean;
  onShow: () => void;
  busy: boolean;
  onRate: (rating: Rating | null) => void;
  asked: DefenseLink[];
}) {
  return (
    <article data-testid="flashcard" aria-label={`Card ${i} of ${n}`} className="rounded-[12px] border-[0.5px] border-separator bg-cell p-4">
      <p className="text-[12px] text-ink-3">
        Card {i} of {n}
      </p>
      <h3 className="mt-1 break-words text-[17px] font-semibold leading-snug">{question.q}</h3>
      {shown ? (
        <>
          <p data-testid="flashcard-answer" className="mt-3 break-words text-[14px] leading-relaxed">
            <span className="whitespace-pre-line">{question.a}</span> <BasisLabel basis={question.basis} />
          </p>
          <div role="group" aria-label="Your rating" className="mt-4 flex flex-wrap gap-2">
            {RATINGS.map((r) => {
              const chosen = rating === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={chosen}
                  disabled={busy}
                  onClick={() => onRate(chosen ? null : r.value)}
                  className={`${CHIP} ${chosen ? `bg-selection ${r.tone}` : 'bg-cell text-ink'}`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-3">
          <Button size="sm" data-testid="show-answer" onClick={onShow}>
            Show answer
          </Button>
        </div>
      )}
      <AskClaude repo={repo} project={project} defenseId={defenseId} kind="question" partRef={question.id} asked={asked} />
    </article>
  );
}
```

`packages/web/src/pages/defense/DefenseChecklist.tsx`:
```tsx
import type { WhiteboardDefense } from '@dev-plumbing/core/schemas';

const LIST = 'mt-2 overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell [&>*+*]:border-t-[0.5px] [&>*+*]:border-separator';

/**
 * The defense's checklist, to tick as you practise. `ticks` are the ids ticked. While a tick is on its way
 * (`pending`) its box shows where it's going, and every box waits, so two ticks can't race.
 */
export function DefenseChecklist({
  checklist,
  ticks,
  pending,
  onTick,
}: {
  checklist: WhiteboardDefense['checklist'];
  ticks: string[];
  pending?: { checklistId: string; ticked: boolean };
  onTick: (checklistId: string, ticked: boolean) => void;
}) {
  const on = new Set(ticks);
  const ticked = checklist.filter((k) => on.has(k.id)).length;
  const checked = (id: string) => (pending?.checklistId === id ? pending.ticked : on.has(id));
  return (
    <section data-testid="defense-checklist" aria-label="Checklist" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-[15px] font-semibold">Checklist</h3>
        <p className="text-[12px] text-ink-3">
          {ticked} of {checklist.length} ticked
        </p>
      </div>
      <ul className={LIST}>
        {checklist.map((k) => (
          <li key={k.id}>
            <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-[13px]">
              <input
                type="checkbox"
                checked={checked(k.id)}
                disabled={pending !== undefined}
                onChange={(e) => onTick(k.id, e.target.checked)}
                className="mt-0.5 size-3.5 shrink-0 accent-slate"
              />
              <span className="min-w-0 break-words">{k.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Write Practice**

`packages/web/src/pages/defense/PracticeView.tsx` becomes:
```tsx
import type { PracticeView as Practice, Rating, WhiteboardDefense, WhiteboardView } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { ProgressBar } from '../../components/ProgressBar';
import { Switch } from '../../components/Switch';
import { DefenseChecklist } from './DefenseChecklist';
import type { PracticeViewProps } from './DefensePage';
import { Flashcard, RATINGS } from './Flashcard';

/** Nothing rated or ticked yet. The service sends practice with every defense; this only covers a gap. */
const fresh = (d: WhiteboardDefense): Practice => ({
  ratings: {},
  ticks: [],
  readiness: 0,
  counts: { could: 0, shaky: 0, couldnt: 0, unrated: d.questions.length, ticked: 0, checklist: d.checklist.length },
});
const SHAKY = "Only shaky and couldn't";

/** True when a key press is typing into a field, not practising: the keys are the field's then. */
const typing = (e: KeyboardEvent) => e.target instanceof Element && e.target.closest('input, textarea, select') !== null;

/**
 * Practice: how ready you are, one card at a time, and the checklist. Show answer (or Space or Enter) reveals the
 * answer and the ratings; a rating (or 1, 2 or 3) is saved and moves to the next card; ← and → move. "Only shaky and
 * couldn't" narrows the deck to the cards rated so when it's turned on. The page keeps the card and the deck (`place`),
 * so Study and back keeps them. A rating or a tick is saved straight away, and the service's answer is shown at once;
 * the live update that follows agrees with it.
 */
export function PracticeView({ view, repo, project, place, onPlace }: PracticeViewProps) {
  const d = view.defense;
  const qc = useQueryClient();
  const p = view.practice ?? fresh(d);
  const key = ['whiteboard', repo, project];
  const keep = (next: Practice) => qc.setQueryData<WhiteboardView>(key, (v) => (v ? { ...v, practice: next } : v));
  const reload = () => void qc.invalidateQueries({ queryKey: key });
  // The line being ticked shows where it's going, from the click until the service answers.
  const [ticking, setTicking] = useState<{ checklistId: string; ticked: boolean } | null>(null);
  // Whether the card's answer shows. Each card starts hidden.
  const [shown, setShown] = useState(false);
  // The deck: every card, or the ones "Only shaky and couldn't" fixed when it was turned on.
  const deck = place.deck === null ? d.questions : d.questions.filter((q) => place.deck!.includes(q.id));
  const n = deck.length;
  const at = Math.min(place.card, Math.max(n - 1, 0));
  const q = deck[at];
  const go = (card: number) => {
    setShown(false);
    onPlace({ ...place, card });
  };
  const rate = useMutation({
    mutationFn: (o: { questionId: string; rating: Rating | null; card: number }) => api.ratePractice(repo, project, { defenseId: d.id, questionId: o.questionId, rating: o.rating }),
    onSuccess: (next, o) => {
      keep(next);
      // A rating moves to the next card. On the last it stays, showing the rating; clearing one stays too.
      if (o.rating !== null && o.card < n - 1) go(o.card + 1);
    },
    onError: reload,
  });
  const tick = useMutation({
    mutationFn: (o: { checklistId: string; ticked: boolean }) => api.tickPractice(repo, project, { defenseId: d.id, ...o }),
    onSuccess: keep,
    onError: reload,
    onSettled: () => setTicking(null),
  });
  /** Rates the card on show. Its rating again clears it. */
  const rateCard = (rating: Rating | null) => {
    if (q) rate.mutate({ questionId: q.id, rating, card: at });
  };
  const toggleDeck = (on: boolean) => {
    setShown(false);
    onPlace({ card: 0, deck: on ? d.questions.filter((x) => p.ratings[x.id] === 'shaky' || p.ratings[x.id] === 'couldnt').map((x) => x.id) : null });
  };

  // The keys, while you aren't typing in a field: Space or Enter reveals, 1–3 rate once revealed, ← and → move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      if ((e.key === ' ' || e.key === 'Enter') && !shown) {
        // So a focused button isn't pressed too.
        e.preventDefault();
        setShown(true);
      } else if (shown && !rate.isPending && ['1', '2', '3'].includes(e.key)) {
        const value = RATINGS[Number(e.key) - 1]!.value;
        rateCard(p.ratings[q.id] === value ? null : value);
      } else if (e.key === 'ArrowLeft' && at > 0) {
        go(at - 1);
      } else if (e.key === 'ArrowRight' && at < n - 1) {
        go(at + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const c = p.counts;
  const error = rate.error ?? tick.error;

  return (
    <div className="mt-6 max-w-[72ch]" data-testid="practice">
      <section aria-label="Readiness">
        <p data-testid="readiness" className="text-[13px] font-semibold">
          Readiness {p.readiness}%
        </p>
        <div className="mt-1.5">
          <ProgressBar resolved={p.readiness} total={100} label="Readiness" />
        </div>
        <p data-testid="practice-counts" className="mt-1.5 text-[12px] text-ink-3">
          {c.could} could explain · {c.shaky} shaky · {c.couldnt} couldn't · {c.unrated} not yet
        </p>
      </section>
      {d.questions.length === 0 ? (
        <p className="mt-6 text-[13px] text-ink-3">No questions in this defense.</p>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-2.5">
            <Switch id="practice-shaky" checked={place.deck !== null} onChange={toggleDeck} label={SHAKY} />
            <label htmlFor="practice-shaky" className="text-[13px] text-ink-2">
              {SHAKY}
            </label>
          </div>
          <div className="mt-4">
            {q ? (
              <>
                <Flashcard
                  key={q.id}
                  repo={repo}
                  project={project}
                  defenseId={d.id}
                  question={q}
                  i={at + 1}
                  n={n}
                  rating={p.ratings[q.id] ?? null}
                  shown={shown}
                  onShow={() => setShown(true)}
                  busy={rate.isPending}
                  onRate={rateCard}
                  asked={view.asked}
                />
                <div className="mt-3 flex gap-2">
                  <Button size="sm" disabled={at === 0} onClick={() => go(at - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" disabled={at >= n - 1} onClick={() => go(at + 1)}>
                    Next
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-[13px] text-ink-3">Nothing rated shaky or couldn't.</p>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {(error as Error).message}
        </p>
      )}
      <DefenseChecklist
        checklist={d.checklist}
        ticks={p.ticks}
        pending={ticking ?? undefined}
        onTick={(checklistId, ticked) => {
          setTicking({ checklistId, ticked });
          tick.mutate({ checklistId, ticked });
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Run the component tests**

Run: `pnpm vitest run packages/web/src/pages/defense packages/web/src/components && pnpm --filter @dev-plumbing/web typecheck`
Expected: PASS (45 tests in `pages/defense`: 16 for the page, 12 for Study, 3 for Ask Claude, 14 for Practice; and the components' tests, with 7 in `components.test.tsx`).

- [ ] **Step 8: Run everything**

Run:
```bash
pnpm vitest run packages/web
pnpm typecheck
pnpm test
pnpm test:e2e defense-practice
pnpm test:e2e
```
Expected: PASS (2 tests in `defense-practice.spec.ts`).
- **If readiness isn't 35% after the ratings and four ticks:** 3 cards and the rules file's 20 lines give round(100 × ((1 + ½) / 3 + 4 / 20) / 2) = 35, and 27 after the regenerate. Check Task 6's `practiceView`.
- **If a regenerated defense loses the ticks or card 1's rating:** practice is kept by text (Decision 8), and every defense gets the same 20 lines from the rules file (Task 7), with an unchanged first question. Check Task 6's `practiceView` and that saving a defense never rewrites `practice.json`.
- **If `check()` says the box didn't change:** the box must show its new state in the same click, from `PracticeView`'s `ticking` state, not from `tick.isPending`, which turns true a moment later.
- **If the phone test finds sideways scrolling:** the rating chips wrap (`flex-wrap`), and the question and answer are `break-words`.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/pages/defense packages/web/src/components/ProgressBar.tsx packages/web/src/components/components.test.tsx packages/web/e2e/defense-practice.spec.ts
git commit -m "feat(web): practise the Whiteboard Defense with flashcards, a readiness meter and the checklist" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The real-Claude smoke test generates a defense; docs and the full check

Everything so far is tested without Claude. This task runs the real thing once more, with the Whiteboard Defense at the end of round 2.
- **The run:** after the update to v2 and its Plan changes threads, the "user":
  1. presses **Generate**, and waits for round 2's window to write the defense with a real `dev-plumbing:whiteboard` subagent on opus;
  2. checks it against the rules file, and that it explains the document the rule gives (the final while it's current, else the draft);
  3. asks Claude about 5. Security model, and checks the answer never offers to change the draft, adds only Questions or Concerns items, and comes back resolved or waiting for the user;
  4. sends one claim marked Unknown or Verify before release to Questions (with none, the first release concern to Concerns), and waits for Claude's suggested answers, which mustn't hold up Finalize;
  5. checks that Finalize never lists the Defense thread, and that asking didn't make the defense out of date.
- **The rest:** the README, `docs/how-it-works.md` and SPEC (§7's file tree and its "only write" line, and §13.1's defense types) learn about the Whiteboard Defense, and the full check runs.

The split is Plans 4 and 5's:
- **You** write the scripts and the docs, and run the full check. You don't run `pnpm smoke`.
- **The controller** runs it.
- **You** then record what it printed in `smoke/RESULTS.md`, and commit.

**Files:**
- Modify:
  - `scripts/smoke-user.mjs`
  - `scripts/smoke-claude.sh`
  - `smoke/RESULTS.md` (a "Plan 6: Whiteboard Defense" section, after the controller's run)
  - `README.md`
  - `docs/how-it-works.md`
  - `SPEC.md` (§7's file tree and its "only write" line; §13.1's `Claim` and `WhiteboardDefense` as they're stored)
- Test: `node --check` and `bash -n` on the scripts, `pnpm check`, and the controller's smoke run.

**Interfaces:**
- Consumes everything above. In particular:
  - Task 8's browser routes, under `GET`/`POST /api/projects/:repo/:id/whiteboard`:
    - `GET` gives a `WhiteboardView`: `request` (with `state` and `reason`), `defense`, `stale`, `asked`, `sent` (`DefenseLink[]`, with `threadId`), `canGenerate` and `generateRefusal`;
    - `POST` with `{}` gives a `GenerateWhiteboardResponse`, whose `message` is "Waiting for Claude to write the Whiteboard Defense." or "No Claude window is listening. Run /dev-plumbing in any clone.";
    - `POST …/ask` with `{ defenseId, kind: 'section', ref: 'security', question }` gives an `AskDefenseResponse` (`SubmitResponse & { threadId }`);
    - `POST …/send` with `{ defenseId, kind: 'claim' | 'concern', ref }` gives a `SendFromDefenseResponse` (`threadId`, `typeId`, `typeTitle`, `message`).
  - Task 3: the defense explains the final while it's current (no change since Accept, no newer plan version), else the draft.
  - Task 7: `/wait` hands the request out as `{ kind: 'whiteboard', request, model, next }`, and takes `finished: { whiteboard, whiteboardError? }`. A window that comes back without saving fails the request with the subagent's `Failed: …` line, or "The whiteboard subagent didn't send a Whiteboard Defense.". `/whiteboard` copies the rules file's checklist into the defense.
  - Task 9: `dp_whiteboard`, and the `dev-plumbing:whiteboard` agent, which reads the files its pack names, sends `checklist: []` and runs in the foreground (SKILL.md §7). A refusal reads "Nothing was saved. Fix these and call dp_whiteboard again with the whole defense:".
  - Tasks 1 and 3: the saved `WhiteboardDefense`:
    - `id`, `level`, `levelReasons` and `basedOn: { doc, version }`;
    - `sections` (`id`, `title`, `claims`, `tables`, `diagram`, `diagramItemId`) in `DEFENSE_SECTIONS` order;
    - `questions`, `concerns` (`severity`, `basis`) and `checklist` (`{ id, text }`).

    A claim's ref is `${sectionId}.${index}`. `defenseStale` gives the two Out of date lines.
  - Task 2: the Defense type (`id: 'defense'`, title "Defense questions"), which `GET /api/projects/:repo/:id` lists in `types` once it has items. `checklistFrom` leaves it out. On its threads, `postReply` refuses `change` and `smallEdits`, `newItems` of any type but Questions and Concerns, and a `resolve` of another item, each with a problem starting "A Defense thread can". Claude resolves its own answer when it needs nothing more.
  - Task 5: an asked item is `type: 'defense'` and `createdBy: 'whiteboard'`. A sent item has `createdBy: 'whiteboard'` and `fromDefense.ref`, and its thread starts `with_claude`. Claude's first suggestions there don't block Finalize as a waiting proposal.
  - Plans 1–5:
    - `GET …/threads/:id` (a `ThreadDetail`: `thread.status`, `thread.messages` with Claude's `options`, `smallEdits` and `newItemIds`, `item`, `type.title` and `open`);
    - `GET …/finalize`'s `checklist` (`blocking`, `defaults`, `parked`, `unreviewed`), `changesSinceFinal` and `planVersionSinceFinal`;
    - `outputs/whiteboard-defense.md`, which setup installs in the temporary `DEV_PLUMBING_HOME`, with its 20 checklist lines written `[ ] <line>`.

  The smoke needs the `claude` CLI on PATH and logged in, as Plans 2–5's did.
- Produces:
  - the user script's Whiteboard Defense part, and the runner's report of it from round 2's transcript;
  - `smoke/RESULTS.md`'s Plan 6 section, with yes or no for each check and the evidence.

- [ ] **Step 1: The "user" generates the Whiteboard Defense, asks about it and sends an unknown**

In `scripts/smoke-user.mjs`, replace the end of the comment at the top:
```js
// Claude's merged version on each. Exits non-zero if anything doesn't happen in time, if a visual type has items
// without drawings, or if the final or the update didn't land.
```
with:
```js
// Claude's merged version on each. Last, it generates the Whiteboard Defense, checks it against the rules file, asks
// Claude about its Security model and sends one of its unknowns to Questions. Exits non-zero if anything doesn't happen
// in time, if a route answers with an error, if a visual type has items without drawings, or if the final, the update
// or the Whiteboard Defense didn't land.
```

A route that answers with an error now fails the run at once, with the route and the status, rather than looking like a long time-out. Replace:
```js
  return { ok: res.ok, body: await res.json() };
}
```
with:
```js
  return { ok: res.ok, status: res.status, body: await res.json() };
}

/** A route answered with an error where it had to work: waiting longer won't fix it. */
class RouteError extends Error {}
/** The body of a route that has to work, or a RouteError with the route and its status. */
function must(route, r) {
  if (!r.ok) throw new RouteError(`${route} answered ${r.status}: ${r.body?.error ?? 'no message'}`);
  return r.body;
}
```
and in `until`, replace:
```js
    } catch {
      // The service may not be up yet.
    }
```
with:
```js
    } catch (e) {
      // A route that answered with an error fails at once. Anything else may be the service not being up yet.
      if (e instanceof RouteError) throw e;
    }
```

Replace the last two lines:
```js
if (wrong.length) throw new Error(`The update didn't land:\n- ${wrong.join('\n- ')}`);
log('Smoke test passed.');
```
with:
```js
if (wrong.length) throw new Error(`The update didn't land:\n- ${wrong.join('\n- ')}`);

// The Whiteboard Defense. The user generates it in the app, and this window (round 2's) hands the request to one
// whiteboard subagent on opus, which can take ten minutes or more. The user then checks it against the rules file, asks
// Claude about its Security model, and sends one claim it marks Unknown or Verify before release to Questions (or, with
// none, its first release concern to Concerns). The Defense thread may never reach the Finalize checklist, and the
// question may not make the defense out of date unless Claude added a Questions or Concerns item.
const W = `${P}/whiteboard`;
// As SPEC §12 and the defense's schema have them.
const SECTION_IDS = ['summary', 'diagram', 'walkthrough', 'data', 'security', 'failure', 'tradeoffs', 'complexity', 'readiness', 'unknowns'];
const LEVEL_NAMES = { 1: 'Lightweight', 2: 'Standard', 3: 'High risk' };
const BASIS_LABELS = { known: 'Known', inferred: 'Inferred', unknown: 'Unknown', verify: 'Verify before release' };
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const flaws = [];
const whiteboardView = async () => must(W, await call(W));
/** A thread once Claude is done with it. Its last message has to be Claude's reply. */
async function claudeReply(what, threadId) {
  const route = `${P}/threads/${threadId}`;
  const d = await until(what, async () => {
    const detail = must(route, await call(route));
    return detail.thread.status !== 'with_claude' ? detail : null;
  }, 15);
  if (d.thread.messages.at(-1)?.author !== 'claude') throw new Error(`"${d.item.title}" came back from Claude without a reply (${d.thread.status}).`);
  return d;
}
/** A Defense thread is in no group of the Finalize checklist, whatever its status. */
async function notOnFinalize(when, threadId) {
  const c = (await finalizeView()).checklist;
  const groups = ['blocking', 'defaults', 'parked', 'unreviewed'].filter((g) => c[g].some((e) => e.threadId === threadId));
  log(`  Finalize ${when}: ${c.blocking.length} blocking, the Defense thread ${groups.length ? `listed under ${groups.join(', ')}` : 'not listed'}`);
  if (groups.length) flaws.push(`The Finalize checklist lists the Defense thread ${when}, under ${groups.join(', ')}.`);
}

const firstView = await whiteboardView();
log(`Whiteboard Defense: ${firstView.defense ? 'one saved already' : 'none yet'}, can generate: ${firstView.canGenerate ? 'yes' : `no (${firstView.generateRefusal})`}`);
if (!firstView.canGenerate) throw new Error(`The Whiteboard Defense can't be generated: ${firstView.generateRefusal}`);
// Which document it should explain: the final while it's current, else the draft, as the Finalize page tells them apart.
// Round 1 accepted a final, but v2 changed the draft and its Plan changes were applied, so here it's the draft.
const finalNow = await finalizeView();
const currentVersion = project.versions.at(-1)?.n;
const finalCurrent = Boolean(project.docs.final) && finalNow.changesSinceFinal === 0 && finalNow.planVersionSinceFinal === null;
const expectDoc = finalCurrent ? 'final' : 'draft';
log(`  The final ${project.docs.final ? `is ${finalCurrent ? 'current' : 'behind'} (${finalNow.changesSinceFinal} changes since Accept, plan version since: ${finalNow.planVersionSinceFinal ?? 'none'})` : "isn't there"}, so it should explain the ${expectDoc} (v${currentVersion})`);
const generated = must(W, await call(W, 'POST', {}));
log(`Asked for the Whiteboard Defense: ${generated.message}`);
const generatedAt = Date.now();
let pickedUp = false;
const defenseView = await until("Claude's Whiteboard Defense", async () => {
  const v = await whiteboardView();
  if (v.request?.state === 'writing' && !pickedUp) {
    pickedUp = true;
    log(`  A Claude window picked it up after ${Math.round((Date.now() - generatedAt) / 1000)} s.`);
  }
  return v.request?.state === 'failed' || (v.defense && v.defense.id !== firstView.defense?.id) ? v : null;
}, 15);
if (defenseView.request?.state === 'failed') throw new Error(`The whiteboard subagent gave up: ${defenseView.request.reason}`);
const generatedIn = Math.round((Date.now() - generatedAt) / 1000);

// What the subagent wrote: a level with reasons, the ten prose sections in order, each with claims, every statement
// marked, at least five questions, and the checklist, which the service copies from the rules file, where each line is
// "[ ] <line>".
const defense = defenseView.defense;
/** Every claim, with its ref (`<section id>.<index>`) and its section. */
const claims = defense.sections.flatMap((s) => s.claims.map((c, i) => ({ ...c, ref: `${s.id}.${i}`, section: s })));
const byBasis = (list) => Object.keys(BASIS_LABELS).map((b) => `${b} ${list.filter((x) => x.basis === b).length}`).join(', ');
const diagramSection = defense.sections.find((s) => s.id === 'diagram');
const ruleLines = [...fs.readFileSync(path.join(dir, 'outputs', 'whiteboard-defense.md'), 'utf8').matchAll(/^\[ \] (.+)$/gm)].map((m) => m[1].trim());
const checklistLines = defense.checklist.map((k) => k.text);
const firstDiff = [...Array(Math.max(ruleLines.length, checklistLines.length)).keys()].find((i) => checklistLines[i] !== ruleLines[i]);
const quoted = (text) => (text === undefined ? 'nothing' : `"${text}"`);
log(`Claude's Whiteboard Defense arrived in ${generatedIn} s: level ${defense.level} (${LEVEL_NAMES[defense.level] ?? 'no such level'}), based on the ${defense.basedOn.doc} (v${defense.basedOn.version})`);
for (const reason of defense.levelReasons) log(`  Level reason: ${reason}`);
log(`  Sections: ${defense.sections.map((s) => `${s.id} ${s.claims.length}`).join(', ')}`);
log(`  Claims: ${claims.length} (${byBasis(claims)}), ${defense.sections.reduce((n, s) => n + s.tables.length, 0)} tables`);
log(`  Diagram: ${diagramSection?.diagramItemId ? `drawn from ${diagramSection.diagramItemId}` : 'no project diagram'}, ${diagramSection?.diagram ? `${diagramSection.diagram.split('\n').length} lines of text` : 'no text diagram'}`);
log(`  Questions: ${defense.questions.length} (${byBasis(defense.questions)})`);
log(`  Concerns: ${defense.concerns.length} (${SEVERITIES.map((s) => `${s} ${defense.concerns.filter((c) => c.severity === s).length}`).join(', ')})`);
log(`  Checklist: ${checklistLines.length} lines, ${firstDiff === undefined ? 'as the rules file has them' : `not as the rules file has them from line ${firstDiff + 1}`}`);
log(`  Out of date when saved: ${defenseView.stale ?? 'no'}`);
if (![1, 2, 3].includes(defense.level) || !defense.levelReasons.length) flaws.push(`The level is ${defense.level}, with ${defense.levelReasons.length} reasons.`);
if (defense.sections.map((s) => s.id).join() !== SECTION_IDS.join()) flaws.push(`The sections are ${defense.sections.map((s) => s.id).join(', ')}, not the ten in order.`);
for (const s of defense.sections.filter((x) => !x.claims.length)) flaws.push(`${s.title} has no claims.`);
const bases = [...claims, ...defense.questions, ...defense.concerns].map((x) => x.basis);
if (bases.some((b) => !Object.hasOwn(BASIS_LABELS, b))) flaws.push(`Some statements are marked ${[...new Set(bases.filter((b) => !Object.hasOwn(BASIS_LABELS, b)))].join(', ')}.`);
if (defense.concerns.some((c) => !SEVERITIES.includes(c.severity))) flaws.push(`Some concerns have a severity that isn't one of ${SEVERITIES.join(', ')}.`);
if (defense.questions.length < 5) flaws.push(`The defense has ${defense.questions.length} questions; the run expects at least five.`);
if (ruleLines.length !== 20) flaws.push(`The rules file has ${ruleLines.length} checklist lines, not 20.`);
if (firstDiff !== undefined) flaws.push(`The checklist isn't the rules file's: line ${firstDiff + 1} is ${quoted(checklistLines[firstDiff])}, where the rules have ${quoted(ruleLines[firstDiff])}.`);
if (defense.basedOn.doc !== expectDoc || defense.basedOn.version !== currentVersion) {
  flaws.push(`The defense is based on the ${defense.basedOn.doc} (v${defense.basedOn.version}), not the ${expectDoc} (v${currentVersion}).`);
}
if (defenseView.stale) flaws.push(`The defense was out of date as soon as it was saved: ${defenseView.stale}`);

// Ask Claude about 5. Security model, as "Ask Claude about this" does. The question is the thread's first message,
// sent like Send this thread. Claude answers in a Defense thread, which never offers to change the draft. When the answer
// needs nothing more, Claude resolves the thread itself.
const QUESTION = "What stops one customer from seeing or changing another customer's reminders? Say what the plan settles and what it leaves open.";
const askResult = must(`${W}/ask`, await call(`${W}/ask`, 'POST', { defenseId: defense.id, kind: 'section', ref: 'security', question: QUESTION }));
const askThread = askResult.threadId;
log(`Asked Claude about 5. Security model: ${askResult.message}`);
if (askResult.sent !== 1) flaws.push(`Asking sent ${askResult.sent} threads to Claude, not 1.`);
await notOnFinalize('while Claude answers', askThread);
const askAt = Date.now();
const answer = await claudeReply("Claude's answer about the Security model", askThread);
const fromClaude = answer.thread.messages.filter((m) => m.author === 'claude');
const offered = fromClaude.flatMap((m) => m.options ?? []);
const withChange = offered.filter((o) => o.change);
const smallEdits = fromClaude.flatMap((m) => m.smallEdits ?? []);
const addedItems = fromClaude.flatMap((m) => m.newItemIds ?? []);
log(`Claude answered in ${Math.round((Date.now() - askAt) / 1000)} s: ${fromClaude.at(-1).text.slice(0, 160)}`);
log(`  ${answer.type.title} item, made by ${answer.item.createdBy}, ${answer.thread.status.replace('_', ' ')}: ${offered.length} options, ${withChange.length} with a change, ${smallEdits.length} small edits, ${addedItems.length} new items`);
if (answer.item.type !== 'defense' || answer.item.createdBy !== 'whiteboard') flaws.push(`Asking made a ${answer.item.type} item made by ${answer.item.createdBy}, not a Defense item made by the whiteboard.`);
if (answer.type.title !== 'Defense questions') flaws.push(`The Defense type is called "${answer.type.title}", not "Defense questions".`);
// Resolved when the answer needed nothing more from the user, else waiting for them.
if (!['resolved', 'your_turn'].includes(answer.thread.status)) flaws.push(`The Defense thread came back ${answer.thread.status}, not resolved or your turn.`);
if (withChange.length || smallEdits.length) {
  const changes = [...withChange.map((o) => `option "${o.label}"`), ...smallEdits.map((e) => `small edit "${e.summary}"`)];
  flaws.push(`Claude's answer in the Defense thread changes the draft: ${changes.join(', ')}.`);
}
// What Claude added from a Defense thread can only be a Questions or a Concerns item.
for (const id of addedItems) {
  const route = `${P}/threads/t-${id}`;
  const added = must(route, await call(route));
  log(`  Added from the Defense thread: ${added.type.title} item "${added.item.title}"`);
  if (!['questions', 'concerns'].includes(added.item.type)) flaws.push(`Claude added "${added.item.title}" (${added.type.title}) from a Defense thread, which may add only Questions or Concerns items.`);
}
const navTypes = must(P, await call(P)).types.map((t) => t.id);
log(`  Defense questions in the nav: ${navTypes.includes('defense') ? 'yes' : 'no'}`);
if (!navTypes.includes('defense')) flaws.push("The nav doesn't show Defense questions, though it has a thread.");
await notOnFinalize('after Claude answered', askThread);
// A question about the defense doesn't make it out of date. A Questions or Concerns item Claude added to the plan in
// its answer would: that's a plan item like any other.
const afterAsk = await whiteboardView();
log(`  Out of date after asking Claude: ${afterAsk.stale ?? 'no'}${addedItems.length ? ` (Claude added ${addedItems.length} items to the plan)` : ''}`);
if (afterAsk.stale && !addedItems.length) flaws.push(`Asking Claude made the defense out of date: ${afterAsk.stale}`);

// Send the first claim marked Unknown or Verify before release to Questions; with none, the first release concern to
// Concerns. Its thread starts with Claude, which suggests answers with no message from the user. Those suggestions
// don't hold up Finalize until the user has written in the thread.
const unknownClaim = claims.find((c) => c.basis === 'unknown' || c.basis === 'verify');
const firstConcern = defense.concerns[0];
const toSend = unknownClaim
  ? { kind: 'claim', ref: unknownClaim.ref, text: unknownClaim.text, what: `${unknownClaim.section.title}, ${BASIS_LABELS[unknownClaim.basis]}`, typeId: 'questions' }
  : firstConcern
    ? { kind: 'concern', ref: firstConcern.id, text: firstConcern.text, what: `release concern, ${firstConcern.severity}`, typeId: 'concerns' }
    : null;
let sentThread = null;
if (!toSend) flaws.push('Nothing could be sent: no claim is marked Unknown or Verify before release, and there are no release concerns.');
else {
  if (!unknownClaim) log('No claim is marked Unknown or Verify before release, so the first release concern goes to Concerns instead.');
  const sendResult = must(`${W}/send`, await call(`${W}/send`, 'POST', { defenseId: defense.id, kind: toSend.kind, ref: toSend.ref }));
  sentThread = sendResult.threadId;
  log(`Sent "${toSend.text.slice(0, 80)}" (${toSend.what}) to ${sendResult.typeTitle}: ${sendResult.message}`);
  if (sendResult.typeId !== toSend.typeId) flaws.push(`It went to ${sendResult.typeTitle}, not ${toSend.typeId}.`);
  const sendAt = Date.now();
  const suggested = await claudeReply("Claude's suggested answers for what was sent", sentThread);
  const options = suggested.open?.options ?? [];
  const recommended = options.find((o) => o.id === suggested.open?.recommended);
  log(`Claude suggested answers in ${Math.round((Date.now() - sendAt) / 1000)} s: ${options.length} options${recommended ? `, recommended "${recommended.label}"` : ''}. ${suggested.thread.messages.at(-1).text.slice(0, 120)}`);
  if (!options.length) flaws.push(`Claude replied on "${suggested.item.title}" without suggesting answers.`);
  if (suggested.item.createdBy !== 'whiteboard' || suggested.item.fromDefense?.ref !== toSend.ref) flaws.push(`The item "${suggested.item.title}" doesn't say it came from the Whiteboard Defense.`);
  const blockedBy = (await finalizeView()).checklist.blocking.find((e) => e.threadId === sentThread)?.reason;
  log(`  Finalize with Claude's suggestions waiting: ${blockedBy ? `blocked: ${blockedBy}` : 'not blocked'}`);
  if (blockedBy === 'A proposal is waiting for your answer.') flaws.push("Claude's first suggestions on what was sent hold up Finalize before the user has answered.");
}

// The page links both threads to the parts they came from, and Finalize still leaves the Defense thread out.
const endView = await whiteboardView();
if (!endView.asked.some((l) => l.threadId === askThread)) flaws.push("The page doesn't list the thread that asked about the Security model.");
if (sentThread && !endView.sent.some((l) => l.threadId === sentThread)) flaws.push("The page doesn't show what was sent as sent.");
await notOnFinalize('at the end', askThread);
log(`Whiteboard Defense: written in ${generatedIn} s, level ${defense.level}, ${defense.questions.length} questions, ${defense.concerns.length} concerns, ${claims.length} claims; asked ${endView.asked.length}, sent ${endView.sent.length}; out of date: ${endView.stale ?? 'no'}`);
if (flaws.length) throw new Error(`The Whiteboard Defense isn't right:\n- ${flaws.join('\n- ')}`);
log('Smoke test passed.');
```

How the part fits the run:
- **Where it runs.** It comes after the update, in round 2's window. That window is back in `dp_wait` once the Plan changes threads are answered, and the user script has already waited for `withClaude` to reach 0 and accepted Claude's merged versions, which apply straight away. So the request is the window's next piece of work.
- **What it's based on** is computed, not assumed: the final while it's current (no change since Accept and no plan version since, as the Finalize page's `changesSinceFinal` and `planVersionSinceFinal` say), else the draft, at the plan's current version (Decision 3). Round 1 accepted a final, but v2 changed the draft and its Plan changes were applied, so in this run it's the draft (v2).
- **The waits.** 15 minutes for the defense, which is written on opus and can take ten minutes or more, and 15 minutes for each thread reply, as round 1 allows.
- **Failing.** It throws at once when the run can't go on: Generate refused, the subagent gave up, a route that answered with an error (`must` names the route and the status, and `until` no longer waits one out), or a time-out. Everything else is collected in `flaws` and fails the run at the end, so one run reports every problem.
- **The checklist** is compared word for word with the rules file setup installed in the temporary `DEV_PLUMBING_HOME`: its 20 `[ ] <line>` lines are the only such lines in the file. The service copies them now (Task 7), so this checks the service, not the subagent.
- **The Defense thread** may come back resolved (Claude's answer needed nothing more) or your turn. Anything else is a flaw.
- **Out of date.** It must be current as soon as it's saved. After the question, it must still be current, unless Claude's answer added items to the plan with `newItems`: those can only be Questions or Concerns items (each is checked), which are plan items like any other, so they rightly make it out of date (Decision 5). The sent part's thread isn't checked for this, since Claude may settle it with a decision there.
- **What's sent:** the first claim marked Unknown or Verify before release, to Questions; with none, the first release concern, to Concerns, and the log says so. With neither, that's a flaw: the run would test nothing. Claude's first suggestions there mustn't hold up Finalize as a waiting proposal.
- **The Defense thread** is checked against the Finalize checklist three times: right after asking (with Claude, which blocks Finalize for any other thread), after Claude's answer, and at the end.
- **The names** don't clash with the script's earlier constants (`asked`, `saved`, `sent`, `edits`, `sections` and `sinceFinal` are taken), and `finalizeView`, `project`, `dir`, `fs` and `path` come from earlier in the script.

Checked against a fake service with the Contracts' routes and shapes, in 13 cases. A good run passes: with the Defense thread resolved or left to the user, with a final that's current and a defense of it, with a concern sent in place of a missing unknown, and with Out of date after Claude added a question. Each of these fails with its own line, as it should: a thread back parked, a defense of a final that's behind, nothing to send, an item of another type added from the Defense thread, Out of date after a plain question, Claude's first suggestions holding up Finalize, the type's old title, and a route that answered 404, at once and naming the route.

- [ ] **Step 2: The runner reports the Whiteboard Defense from round 2's transcript**

The runner needs no new waiting. It already waits for the user script, whose generation wait allows 15 minutes. The window runs the whiteboard subagent in the foreground, as it does the finalizer, which took up to four minutes in Plans 4 and 5. Its MCP server pings the service every 30 s while subagents work, so the window is never taken for gone.

In `scripts/smoke-claude.sh`, replace these lines of the comment at the top:
```bash
# fails when an importable type got no saved dp_write_items batch in the re-import.
# It uses a temporary dev-plumbing home and leaves your real ~/.dev-plumbing alone. It makes real model calls.
#   scripts/smoke-claude.sh                   about 30 minutes (the finalizer runs on opus)
```
with:
```bash
# fails when an importable type got no saved dp_write_items batch in the re-import. Last, the user script generates the
# Whiteboard Defense: the second window writes it with a whiteboard subagent, then answers a question about it and
# suggests answers for one of its unknowns, sent to Questions.
# It uses a temporary dev-plumbing home and leaves your real ~/.dev-plumbing alone. It makes real model calls.
#   scripts/smoke-claude.sh                   about 45 minutes (the finalizer and the whiteboard subagent run on opus)
```

Replace:
```bash
  echo "Thread subagents started by the main window (one per Plan changes group):"
```
with:
```bash
  echo "Thread subagents started by the main window (one per Plan changes group, plus the Defense question and the unknown sent to Questions):"
```

Then replace the last lines, from the importable-types check's `else` to `exit "$status"`:
```bash
  else
    echo "Couldn't read $t2 to check."
    status=1
  fi
fi
exit "$status"
```
with:
```bash
  else
    echo "Couldn't read $t2 to check."
    status=1
  fi
  # The Whiteboard Defense, written in the second window. These are read from the transcript's JSON, not grepped: the
  # skill's own text, which the transcript carries, says "kind: whiteboard" too. A refused dp_whiteboard is fixed by
  # sending the whole defense again, so refusals are reported, not failed: the user script checks what was saved.
  echo "== The Whiteboard Defense, in round 2's window"
  node -e '
    const fs = require("fs");
    const DP = "mcp__plugin_dev-plumbing_dp__";
    const calls = new Map();
    const results = new Map();
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
      for (const b of blocks) {
        if (b.type === "tool_use") calls.set(b.id, { name: b.name, input: b.input ?? {}, main: entry.parent_tool_use_id === null });
        if (b.type === "tool_result") {
          const text = typeof b.content === "string" ? b.content : (Array.isArray(b.content) ? b.content : []).map((c) => c.text ?? "").join("");
          results.set(b.tool_use_id, { text, error: b.is_error === true });
        }
      }
    }
    const all = [...calls].map(([id, c]) => ({ ...c, result: results.get(id) }));
    const kindOf = (c) => { try { return JSON.parse(c.result?.text ?? "").kind; } catch { return null; } };
    const waits = all.filter((c) => c.main && c.name === DP + "dp_wait");
    const agents = all.filter((c) => c.main && c.name === "Agent" && c.input.subagent_type === "dev-plumbing:whiteboard");
    const saves = all.filter((c) => c.name === DP + "dp_whiteboard");
    const refused = saves.filter((c) => c.result?.error);
    console.log("dp_wait results that handed out the Whiteboard Defense (kind whiteboard): " + waits.filter((c) => kindOf(c) === "whiteboard").length);
    console.log("Whiteboard subagents started by the main window: " + agents.length + (agents.length ? " (model " + agents.map((c) => c.input.model ?? "not given").join(", ") + ")" : ""));
    console.log("dp_whiteboard calls: " + saves.length + ", refused: " + refused.length);
    for (const c of refused) console.log("  refused: " + c.result.text.replace(/\s+/g, " ").slice(0, 300));
    console.log("JSON characters in the last dp_whiteboard defense: " + (saves.length ? JSON.stringify(saves.at(-1).input.defense ?? null).length : 0));
    const packs = all.filter((c) => c.name === DP + "dp_context" && c.input.whiteboard === true);
    console.log("JSON characters in the whiteboard dp_context result: " + (packs.length ? (packs.at(-1).result?.text ?? "").length : 0));
    console.log("dp_wait calls from the main window with finished.whiteboard: " + waits.filter((c) => c.input.finished?.whiteboard).length);
    // A Defense thread reply that tried to change the draft, add another kind of item, or resolve another item.
    const defenseRefused = all.filter((c) => c.name === DP + "dp_reply" && c.result?.error && c.result.text.includes("A Defense thread can"));
    console.log("dp_reply refusals on a Defense thread: " + defenseRefused.length);
    for (const c of defenseRefused) console.log("  refused: " + c.result.text.replace(/\s+/g, " ").slice(0, 300));
  ' "$t2" || echo "Couldn't read $t2 to count them."
fi
exit "$status"
```

How the report reads the transcript:
- **Why JSON, not grep.** In a Plan 4 transcript, `grep -c 'kind[\\"]*:[ \\"]*finalize'` counts 2 lines, and one of them is the skill's own "**kind: finalize**". The new §3 line, "**kind: whiteboard**", would be miscounted the same way. So the report matches each `tool_use` to its `tool_result` by id, and parses the `dp_wait` result's JSON for its `kind`.
- **Counted once each.** A transcript line carries a call twice, once in its content and once in a copy keyed by the tool-use id (Plan 4's counter quirk). The report reads only `message.content`, and keys calls by id.
- **No single quotes** inside the `node -e '…'` script, since the shell quotes it with them.
- **It's only a report.** It never changes `status`: the user script is what fails the run when the defense wasn't saved or isn't right.
- **The pack's size** is the length of the whiteboard `dp_context` result's text, as the subagent got it. It shows how far under the MCP result cap the pack stays (Task 4).
- **Defense refusals.** A `dp_reply` refusal that says "A Defense thread can…" (can't change the draft, can add only Questions or Concerns items, can resolve only itself) shows whether `thread.md` and the Defense rules keep Claude inside them; the thread subagent then fixes its reply.
- **Checked on real transcripts.** On Plan 4's run, with the names swapped for the finalizer's (`kind finalize`, `dev-plumbing:finalizer`, `dp_finalize`, `finished.finalize`), it printed 1, 1 (model opus), 1 call with 0 refused, and 1. A synthetic transcript, holding the skill's text line, a refused call and then a saved one, gave 1, 1 (model opus), 2 calls with 1 refused, the refusal's first line, and 1.

- [ ] **Step 3: Check the scripts parse**

Run: `node --check scripts/smoke-user.mjs && bash -n scripts/smoke-claude.sh`
Expected: no output, exit 0.

- [ ] **Step 4: Update the README**

In `README.md`, replace the status line:
```markdown
**Status:** the Claude loop, the visual screens, Finalize spec and bringing in a changed plan work. Whiteboard Defense comes next. The design is in [SPEC.md](SPEC.md), and the plans are in [docs/superpowers/plans](docs/superpowers/plans).
```
with:
```markdown
**Status:** the Claude loop, the visual screens, Finalize spec, bringing in a changed plan and the Whiteboard Defense work. Present, which draws the Whiteboard Defense as an animated whiteboard, comes next. The design is in [SPEC.md](SPEC.md), and the plans are in [docs/superpowers/plans](docs/superpowers/plans).
```

In **Use it**, replace:
```markdown
- **Keep chatting:** after two minutes the listening call moves to the background, so you can keep using the Claude window.
```
with:
```markdown
- **Whiteboard Defense:** "If you ship it, you should be able to explain it." The header's **Whiteboard Defense** button opens its page, where **Generate** asks Claude to write a defense of the plan, from the final while it's current, else the draft. It follows `outputs/whiteboard-defense.md`: a review level, 13 sections, the questions you should be able to answer, the release concerns and its 20-line checklist, with every statement marked **Known**, **Inferred**, **Unknown** or **Verify before release**.
  - **Study** reads it as a page. **Ask Claude about this**, on any section, question or concern, starts a thread about it. **Send to Questions** turns an unknown into a question, and **Send to Concerns** turns a release concern into a concern, each with Claude's suggested answers.
  - **Practice** shows the questions as flashcards: show the answer, rate yourself, and the next card comes up. Space, 1 to 3 and the arrow keys work too, and **Only shaky and couldn't** keeps the cards you're not sure of. A readiness meter, half flashcards and half checklist, sits with the checklist.
  - When the plan changes, it's marked **Out of date**, and **Regenerate** writes it again. **Export .md** writes it into the repo as `<name>.whiteboard-defense.md`, next to the plan, with its diagram drawn in Mermaid.
- **Keep chatting:** after two minutes the listening call moves to the background, so you can keep using the Claude window.
```

In **Screens**, replace:
```markdown
- **Plan changes:** after you bring in a new version of the plan, each passage that you and the repo both changed, with Claude's merged version, the repo's and yours to pick from. It's only there once an update finds one.
```
with:
```markdown
- **Plan changes:** after you bring in a new version of the plan, each passage that you and the repo both changed, with Claude's merged version, the repo's and yours to pick from. It's only there once an update finds one.
- **Defense questions:** your questions to Claude about the Whiteboard Defense, one thread each. It's only there once you've asked one, and it never blocks Finalize or goes into the final.
```

- [ ] **Step 5: Explain the Whiteboard Defense in `docs/how-it-works.md`**

In `docs/how-it-works.md`, in **The short version**, replace:
```markdown
- **Claude never edits your plan or your code.** It reads them, and writes only into dev-plumbing's own files, through a few dedicated tools. The only things that land in your repo are the final spec and its mockups in `<name>.assets/`, and only when you accept it.
```
with:
```markdown
- **Claude never edits your plan or your code.** It reads them, and writes only into dev-plumbing's own files, through a few dedicated tools. The only things that land in your repo are the final spec and its mockups in `<name>.assets/`, when you accept the final, and the Whiteboard Defense as `<name>.whiteboard-defense.md`, when you export it.
```

In **The pieces**, replace:
```markdown
| **The plugin** | The Claude Code add-on: one skill, four agents and one MCP server, all explained below. | `plugin/` in this repo. Claude Code loads it from here. |
```
with:
```markdown
| **The plugin** | The Claude Code add-on: one skill, five agents and one MCP server, all explained below. | `plugin/` in this repo. Claude Code loads it from here. |
```

In the agents table, replace the `thread` and `finalizer` rows:
```markdown
| `thread` | Once per thread (or group of linked threads) you send, and once per Plan changes thread after an update. It reads the thread and the code, then posts its reply. | Read-only file tools, `dp_context`, `dp_reply` |
| `finalizer` | When you press **Start finalize**. It writes the final spec from the draft, the items and the decisions, following `outputs/finalize.md`. | Read-only file tools, `dp_context`, `dp_finalize` |
```
with:
```markdown
| `thread` | Once per thread (or group of linked threads) you send, once per Plan changes thread after an update, and once per unknown or concern you send from the Whiteboard Defense. It reads the thread and the code, then posts its reply. | Read-only file tools, `dp_context`, `dp_reply` |
| `finalizer` | When you press **Start finalize**. It writes the final spec from the draft, the items and the decisions, following `outputs/finalize.md`. | Read-only file tools, `dp_context`, `dp_finalize` |
| `whiteboard` | When you press **Generate**, **Regenerate** or **Try again** on the Whiteboard Defense page. It writes the Whiteboard Defense from the final (or the draft), the items, the decisions and the repo profile, following `outputs/whiteboard-defense.md`. | Read-only file tools, `dp_context`, `dp_whiteboard` |
```

In the tools table, replace the `dp_wait`, `dp_repo_profile` and `dp_context` rows:
```markdown
| `dp_wait` | Main window | Listens until you press **Send this thread**, **Submit all** or **Start finalize**, or ask to **Detect again**. Then it returns the work (threads to answer, a final to write, or a repo profile to detect) and which model to use. After an update, it first hands out the Plan changes threads waiting for Claude. |
| `dp_repo_profile` | repo-setup | Reads or saves the repo profile. |
| `dp_context` | importer, thread, finalizer | Gets the "context pack" for one job: the plan text, the plumbing type's rules, the thread so far, past decisions and related items. The finalizer's pack has the draft, every item, the decisions with why, the defaults and the drawing tokens it may use. When the plan is re-imported, an importer's pack also has what changed between the two versions, and its type's items with their keys and drawings. |
```
with:
```markdown
| `dp_wait` | Main window | Listens until you press **Send this thread**, **Submit all**, **Start finalize** or **Generate** on the Whiteboard Defense page, or ask to **Detect again**. Then it returns the work (threads to answer, a final to write, a Whiteboard Defense to write, or a repo profile to detect) and which model to use. After an update, it first hands out the Plan changes threads waiting for Claude. |
| `dp_repo_profile` | repo-setup | Reads or saves the repo profile. |
| `dp_context` | importer, thread, finalizer, whiteboard | Gets the "context pack" for one job: the plan text, the plumbing type's rules, the thread so far, past decisions and related items. The finalizer's pack has the draft, every item, the decisions with why, the defaults and the drawing tokens it may use. When the plan is re-imported, an importer's pack also has what changed between the two versions, and its type's items with their keys and drawings. The whiteboard subagent's pack names the rules file and the document (the final or the draft) for it to read, so it stays small on a big plan, and has every item with its own file (a diagram's drawing comes inline), the decisions, the defaults, the open items, the repo profile's conventions, sensitive data, schema and apps, and the last defense's questions and unknowns; a Defense thread's pack also has the whole Whiteboard Defense. |
```

After the `dp_finalize` row, add one. Replace:
```markdown
| `dp_finalize` | finalizer | Sends the final spec. The service replaces each drawing token with a block made from that item's data. If any token is wrong, the whole document is refused, with every problem listed. |
```
with:
```markdown
| `dp_finalize` | finalizer | Sends the final spec. The service replaces each drawing token with a block made from that item's data. If any token is wrong, the whole document is refused, with every problem listed. |
| `dp_whiteboard` | whiteboard | Sends the Whiteboard Defense as structured data: the level and its reasons, ten sections of statements, each marked known, inferred, unknown or verify, the questions with their answers and the release concerns. The service adds the titles and ids, and copies the rules file's checklist. If anything is wrong, the whole defense is refused, with every problem listed, and the last one saved stays as it was. |
```

Before `## Where everything is stored`, add a section. Replace:
```markdown
   - **Compare with** shows what changed in the plan between it and another version.

## Where everything is stored
```
with:
```markdown
   - **Compare with** shows what changed in the plan between it and another version.

## Whiteboard Defense

"If you ship it, you should be able to explain it." The Whiteboard Defense is Claude's defense of the plan: how it works, what could fail and what's still unknown. You study it, and practise explaining it, before you build. It follows `~/.dev-plumbing/outputs/whiteboard-defense.md`, which you can edit on the Plumbing rules page.

1. **Generate.** The header's **Whiteboard Defense** button, or the **Defense** tab on a phone, opens its page. **Generate** saves a request in the project, as **Start finalize** does. A listening Claude window picks it up through `dp_wait`, after any threads waiting for Claude and any finalize, and starts one `whiteboard` subagent, on the model `agents.json` sets for it (opus by default). Writing it can take ten minutes or more.
   - With no window listening, the request waits, and the page says "No Claude window is listening. Run /dev-plumbing in any clone."
   - While it's written, that window is busy: the page says "Claude is writing the Whiteboard Defense. Threads you send now wait until it's done.", and so does what you send meanwhile.
   - If the window goes away, the request goes back in the queue for another window. If the subagent comes back without a defense, the page says why (its own "Failed: …" line, or "The whiteboard subagent didn't send a Whiteboard Defense.") and offers **Try again**, or **Dismiss** to keep the defense you had.
   - **Cancel** clears the request, whatever its state. One is written at a time, and none while the plan is importing.
2. **Write.** The subagent reads its context pack. The rules and the document it explains are files it reads, so the pack stays small whatever the size of the plan: the final while it's current (nothing changed and no newer plan version since you accepted it), else the draft. A defense written while a final waits for you to accept it is based on the draft, and goes Out of date once you accept. The pack also has every item, the decisions, the defaults and every open question, the repo profile's conventions and sensitive data, which raise the review level, and the last defense's questions and unknowns, whose wording it keeps where they still apply. It may read the code in the clone to check a statement. It sends the defense with `dp_whiteboard`:
   - a review level, 1 **Lightweight**, 2 **Standard** or 3 **High risk**, with its reasons;
   - the 13 sections, from **Executive summary** to **Checklist**: ten of statements, the questions you should be able to answer with their answers, and the release concerns from **Critical** to **Informational**. The service adds the checklist, copied word for word from the rules file;
   - every statement marked **Known**, **Inferred**, **Unknown** or **Verify before release**. What isn't known is marked Unknown, not made up.

   The service checks the whole defense: every section there once, each with at least one statement, a cell for every column of a table, a diagram that names a real drawing, no question twice, and the size. If anything is wrong, nothing is saved, the subagent is told every problem at once and sends it again, and the defense you had stays as it was. A saved one replaces it.
3. **Study.** The page shows the 13 sections as a readable page, with a table of contents, tables, the diagram (drawn from the project's own data, or as text) and each statement's mark. It says what it was written from, for example "Based on the draft (v2)".
4. **Practice.** One flashcard per question: show the answer, then rate yourself **Could explain it**, **Shaky** or **Couldn't**, and the next card comes up. Space or Enter shows the answer, 1 to 3 rate it, and the arrow keys move. **Only shaky and couldn't** keeps just the cards you rated so when you turn it on. The readiness meter is half flashcards and half checklist: the cards you could explain and half the shaky ones, out of all the cards, and the checklist lines you ticked, out of all the lines. Ratings and ticks are kept by their text, so a regenerated defense keeps the ones that still apply.
5. **Ask Claude about this.** Any section, question or release concern can start a thread: type your question, and it goes to Claude as **Send this thread** sends one.
   - The thread is an item of **Defense questions**, a plumbing type built into the app. It appears in the navigation once you've asked something.
   - Its `thread` subagent gets the whole defense in its pack, and answers from the plan, the decisions and the code. When the answer needs nothing more from you, Claude resolves the thread with it, so it doesn't wait in your Inbox: reply to carry on.
   - A Defense thread never changes the draft, never blocks Finalize and never goes into the final, and what's decided in it stays there: other threads never see it. When an answer shows a gap in the plan, Claude adds a Questions or Concerns item instead (it can add no other kind). That item is part of the plan like any other.
6. **Send to Questions or Concerns.** A statement marked Unknown or Verify before release can go to **Questions**, and a release concern to **Concerns**, in one click.
   - It becomes an ordinary item, and its thread goes straight to Claude, which suggests answers. Those suggestions don't hold up Finalize until you've answered in the thread.
   - A sent concern keeps its weight: critical and high become high, so it blocks Finalize until it's resolved, like any high concern.
   - Each part is sent once, even after **Regenerate**: one with the same text shows as sent, linked to its thread.
7. **Out of date.** The defense remembers what it was written from. When the plan changes, the page says "Out of date: the plan changed since this was generated.", or "Out of date: a final was accepted since this was generated." when it was written from the draft and would now be written from a final, and **Regenerate** becomes the main button.
   - **These make it out of date:** a change to the document it was written from, an item added or changed, a thread parked or unparked, and a new decision. So does answering a question you sent from it, since that adds a decision, and a Questions or Concerns item Claude adds while answering a Defense thread. A defense of the final also goes out of date once the final isn't current: a change applied, or a newer plan version.
   - **These don't:** asking Claude about it, and anything decided in those Defense threads; sending to Questions or Concerns; practising; review marks and flags.
   - The old defense stays readable, and Practice keeps working, until a new one is saved.
8. **Export .md.** Pick a clone, as for Accept. The defense is written into it as `<name>.whiteboard-defense.md`, next to the plan, saying what it was written from and when, with the diagram it names drawn in Mermaid. A later export replaces it (the form says so), nothing else is written, and it works when the defense is out of date too.

## Where everything is stored
```

In **Where everything is stored**, replace:
```markdown
  outputs/                       rules for Finalize (finalize.md) and, later, Whiteboard Defense
```
with:
```markdown
  outputs/                       rules for Finalize (finalize.md) and the Whiteboard Defense (whiteboard-defense.md)
```

and replace:
```markdown
  finals/                        earlier finals, kept when you finalize again
```
with:
```markdown
  finals/                        earlier finals, kept when you finalize again
  whiteboard/request.json        the Whiteboard Defense request under way, if there is one
  whiteboard/defense.json        the Whiteboard Defense
  whiteboard/practice.json       your flashcard ratings and checklist ticks
```

In **Safety**, replace:
```markdown
- **One write into your repo.** Accept copies the final into the clone you pick, as `<name>.final.md` and `<name>.assets/`, next to the plan. The clone must have this repo's remote, nothing is written through a symlink, and the plan itself is never touched.
```
with:
```markdown
- **Two writes into your repo, both when you ask.** Accept copies the final into the clone you pick, as `<name>.final.md` and `<name>.assets/`, next to the plan. **Export .md** writes the Whiteboard Defense there as `<name>.whiteboard-defense.md`, and nothing else. Either way, the clone must have this repo's remote, nothing is written through a symlink, and the plan itself is never touched.
```

In **Common questions**, after the question about editing the plan in the repo, add one. Replace:
```markdown
**How do I see what the service is doing?**
```
with:
```markdown
**Does asking Claude about the Whiteboard Defense hold up Finalize?** No. Defense threads never block Finalize and never go into the final. An unknown or a concern you send to Questions or Concerns does count, like any other item there, and so does a Questions or Concerns item Claude adds while answering.

**How do I see what the service is doing?**
```

In **Words**, after the `Plan changes` row, add two rows. Replace:
```markdown
| Plan changes | The passages that both you and the repo changed, one thread each, after an update. |
```
with:
```markdown
| Plan changes | The passages that both you and the repo changed, one thread each, after an update. |
| Whiteboard Defense | Claude's defense of the plan, to study and practise explaining before you build: a review level, 13 sections, flashcards and a checklist. |
| Defense questions | The plumbing type for your questions to Claude about the Whiteboard Defense, one thread each. It never blocks Finalize or goes into the final. |
```

- [ ] **Step 6: Name both writes in SPEC §7, the request in its file tree, and the stored defense in §13.1**

In `SPEC.md` §7's file tree, add the request above the defense. Replace:
```
    whiteboard/defense.json                # the generated Whiteboard Defense
```
with:
```
    whiteboard/request.json                # a Whiteboard Defense being asked for
    whiteboard/defense.json                # the generated Whiteboard Defense
```

Then replace:
```markdown
- **The only write into your repo** is Finalize's copy of the final: `<name>.final.md` and `<name>.assets/`, next to the plan. It goes to the source clone by default, and you can pick another.
```
with:
```markdown
- **The only writes into your repo** are Finalize's copy of the final, `<name>.final.md` and `<name>.assets/`, and the Whiteboard Defense's **Export .md**, `<name>.whiteboard-defense.md`, both next to the plan. Each goes to the source clone by default, and you can pick another.
```

In §13.1, the defense's type is brought in line with what `whiteboard/defense.json` holds. `presenter` stays, optional, for Present in Plan 7, and §10.6 stays as it is. Replace:
```ts
type WhiteboardDefense = {
  generatedAt: string;
  basedOn: { kind: "plan" | "code"; decisionsVersion: string; branch?: string; commit?: string };
  level: 1 | 2 | 3; levelReasons: string[];
  sections: { id: string; title: string; claims: Claim[]; tables?: unknown[]; diagramId?: string }[];
  presenter: { chapters: { id: string; title: string;
               steps: { caption: string; reveal: string[];                // node/edge ids
                        notes?: { near: string; text: string; ink: "ink" | "slate" | "seal" | "moss" }[] }[] }[] };
  questions: { id: string; q: string; a: string; basis: Claim["basis"] }[];
  concerns: { severity: "critical" | "high" | "medium" | "low" | "info"; text: string }[];
  checklist: { id: string; text: string }[];
};
```
with:
```ts
type WhiteboardDefense = {
  id: string; generatedAt: string;
  basedOn: { kind: "plan"; doc: "final" | "draft"; version: number; inputsHash: string };   // "code": defend the code, Phase 2
  level: 1 | 2 | 3; levelReasons: string[];
  sections: { id: string; title: string; claims: Claim[];                  // the ten prose sections, in order
              tables: { title: string; columns: string[]; rows: string[][] }[];
              diagram: string | null; diagramItemId: string | null }[];
  presenter?: { chapters: { id: string; title: string;                      // Present (Plan 7)
               steps: { caption: string; reveal: string[];                // node/edge ids
                        notes?: { near: string; text: string; ink: "ink" | "slate" | "seal" | "moss" }[] }[] }[] };
  questions: { id: string; q: string; a: string; basis: Claim["basis"] }[];
  concerns: { id: string; severity: "critical" | "high" | "medium" | "low" | "info"; text: string; basis: Claim["basis"] }[];
  checklist: { id: string; text: string }[];
  exportedTo?: { clone: string; path: string; at: string };
};
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
- `pnpm check` passes: typecheck clean, then unit, integration and e2e, with Plan 6's `defense.spec.ts` and `defense-practice.spec.ts`.
- The grep prints nothing: no file outside the plans names your home folder. The docs use the Acme examples only.
- The temp-folder count is the same before and after. `dp-smoke-*` folders from a smoke run are kept for their transcripts and don't count.

- [ ] **Step 8: Hand the smoke run to the controller**

Don't run `pnpm smoke` yourself. It makes real model calls for about 45 minutes: the import, a thread, a finalizer on opus, the update and its re-import, then a whiteboard subagent on opus and two more threads. Report that the scripts and docs are ready, with Step 7's output. The controller runs `pnpm smoke` from the worktree and gives you everything it printed.

What the controller should see:
- **Rounds 1 and 2:** the user log prints everything Plan 5's run did, up to the Plan changes lines ("accepted Claude's …: Applied. 1 thread resolved.").
- **The Whiteboard Defense.** The user log then prints:
  - "Whiteboard Defense: none yet, can generate: yes"
  - "The final is behind (N changes since Accept, plan version since: 2), so it should explain the draft (v2)"
  - "Asked for the Whiteboard Defense: Waiting for Claude to write the Whiteboard Defense."
  - "A Claude window picked it up after N s.", within a minute.
  - "Claude's Whiteboard Defense arrived in N s: level N (…), based on the draft (v2)", and one "Level reason: …" line per reason. Earlier runs' repo profile has `sensitiveData: ["PII"]`, so expect level 2 or 3.
  - "Sections: summary N, diagram N, walkthrough N, data N, security N, failure N, tradeoffs N, complexity N, readiness N, unknowns N", each N at least 1.
  - "Claims: N (known N, inferred N, unknown N, verify N), N tables"
  - "Diagram: drawn from architecture-…, N lines of text". "no project diagram" isn't a failure, but the Architecture importer draws one, so the subagent should name it.
  - "Questions: N (…)", with N at least 5, and "Concerns: N (…)".
  - "Checklist: 20 lines, as the rules file has them"
  - "Out of date when saved: no"
  - "Asked Claude about 5. Security model: Sent to Claude.", or "Saved. Claude is finishing earlier threads and will pick this up next." when the window is still finishing the defense.
  - "Finalize while Claude answers: N blocking, the Defense thread not listed"
  - "Claude answered in N s: …"
  - "Defense questions item, made by whiteboard, resolved: N options, 0 with a change, 0 small edits, N new items", or "your turn" in place of "resolved" when Claude left the thread to you, and an "Added from the Defense thread: Questions item …" (or Concerns) line for each new item
  - "Defense questions in the nav: yes"
  - "Finalize after Claude answered: N blocking, the Defense thread not listed"
  - "Out of date after asking Claude: no", or the Out of date line followed by "(Claude added N items to the plan)".
  - "Sent "…" (…, Unknown) to Questions: Added to Questions. Claude will suggest answers.", with "Verify before release" in place of "Unknown" for such a claim. With no such claim, "No claim is marked Unknown or Verify before release, so the first release concern goes to Concerns instead." and the concern's line.
  - "Claude suggested answers in N s: N options, recommended "…". …"
  - "Finalize with Claude's suggestions waiting: not blocked" (or "blocked: High-severity concern, not resolved." for a sent high concern)
  - "Finalize at the end: N blocking, the Defense thread not listed"
  - "Whiteboard Defense: written in N s, level N, N questions, N concerns, N claims; asked 1, sent 1; out of date: …"
  - "Smoke test passed."
- **The runner's report:**
  - **Round 1:** Plan 5's counts.
  - **Round 2:** Plan 5's counts, plus:
    - inside subagents, `dp_whiteboard` at least 1, and `dp_context` and `dp_reply` up by the whiteboard pack and the two threads;
    - "Thread subagents started by the main window": the Plan changes groups plus 2.
  - **"== The Whiteboard Defense, in round 2's window":**
    - "dp_wait results that handed out the Whiteboard Defense (kind whiteboard): 1"
    - "Whiteboard subagents started by the main window: 1 (model opus)"
    - "dp_whiteboard calls: N, refused: N", and each refusal's first line
    - "JSON characters in the last dp_whiteboard defense: N", well under 120,000, and near 40,000 or less, as the agent is asked
    - "JSON characters in the whiteboard dp_context result: N", well under 100,000 (an MCP result is capped at 25,000 tokens)
    - "dp_wait calls from the main window with finished.whiteboard: 1"
    - "dp_reply refusals on a Defense thread: N", ideally 0, and each refusal's first line

If something fails:
- **"Timed out waiting for Claude's Whiteboard Defense":**
  - **No "picked it up" line:** the window never took the request. If the runner's "handed out" count is 0:
    - check Task 7's hand-out after `pickUpFinalize`;
    - check Task 9's `WORK_KINDS`: a kind missing there makes `dp_wait` loop without returning.
  - **Picked up, but nothing saved:** read the whiteboard subagent's calls in `$work/transcript-2.jsonl`.
    - Refusals list what the service refused. Fix the agent (Task 9) or the check (Task 3).
    - No `dp_whiteboard` call at all means the subagent never got that far. Read its last messages.
    - If it was still writing well, the controller may raise the 15 minutes.
- **"The whiteboard subagent gave up: The whiteboard subagent didn't send a Whiteboard Defense.":**
  - The main window called `dp_wait` before the subagent returned. Check that SKILL.md §7 runs it in the foreground (Task 9).
  - Or the subagent ended without saving. Its "Failed: …" line in the transcript says why.
- **"The Whiteboard Defense can't be generated: …":** the refusal says why: still importing (round 2's re-import didn't end), or a request already under way.
- **"The checklist isn't the rules file's":** the subagent didn't copy the lines word for word. Check the agent's checklist step (Task 9).
- **"The sections are …, not the ten in order" or "… has no claims":** `saveDefense` should have refused these, or put them in order (Task 3). Fix it there, with a test.
- **"The defense has N questions; the run expects at least five":** read the agent's step for questions (Task 9). The rules file's section 10 lists ten examples.
- **"The defense is based on the final (v2), not the draft (v2)"** (or the other way round): `defenseBasis` (Task 3) and the Finalize page disagree on whether the final is current. Compare its `changesSinceFinal` and `planVersionSinceFinal` with `finalIsCurrent`.
- **"The defense was out of date as soon as it was saved":** something changed between pick-up and save. Compare the user log's Plan changes lines; otherwise check `pickUpWhiteboard`'s hash and `defenseInputsHash` (Task 3).
- **"Asking Claude made the defense out of date":** `defenseInputsHash` counted the Defense item, or a decision in its thread (Task 3, Decision 5).
- **"Claude's answer in the Defense thread changes the draft":** `postReply` let a `change` or `smallEdits` through on a Defense thread (Task 2).
- **"Claude added "…" (…) from a Defense thread":** `postReply` let a `newItems` entry of another type through (Task 2).
- **"The Defense thread came back …, not resolved or your turn":** read the thread's `dp_reply` in the transcript.
- **"Claude's first suggestions on what was sent hold up Finalize":** `checklist.ts`'s proposal rule (Task 5).
- **"… answered 4xx: …":** that route refused something the run expected to work. The message is the service's.
- **"The Finalize checklist lists the Defense thread …":** `checklistFrom` (Task 2).
- **"The nav doesn't show Defense questions":** `loadConfig` didn't add `DEFENSE_TYPE` (Task 2).
- **"Claude replied on … without suggesting answers":** read that thread's `dp_reply` in the transcript. The Questions rules ask for two to four options, and the thread agent's line for a thread with no message from the person applies.
- **"… came back from Claude without a reply":** the thread subagent failed. Its "Failed: …" line is in the transcript.
- **"The page doesn't list the thread …" or "doesn't show what was sent as sent":** `defenseLinks` (Task 5).

The controller decides on any fix. Record each one, and the run that finally passed.

- [ ] **Step 9: Record the results**

Add this section to the end of `smoke/RESULTS.md`, and fill every row from the controller's run. Don't leave any blank:
```markdown

## Plan 6: Whiteboard Defense

Date: <date> · Claude Code version: <`claude --version`>

| Check | Result | Evidence |
|---|---|---|
| Rounds 1 and 2 still pass: import, a thread, Finalize, the update to v2 | yes/no | user log up to the Plan changes lines ("accepted Claude's …") |
| The window wrote the defense with one whiteboard subagent on opus | yes/no | user log: "Asked for the Whiteboard Defense: …", "A Claude window picked it up after N s.", "Claude's Whiteboard Defense arrived in N s: …"; runner: "(kind whiteboard): N", "Whiteboard subagents started by the main window: N (model …)", "with finished.whiteboard: N" |
| `dp_whiteboard` refusals, fixed on retry | N | runner: "dp_whiteboard calls: N, refused: N", and each refusal's first line |
| The pack and the defense stay small | yes/no | runner: "JSON characters in the whiteboard dp_context result: N", "JSON characters in the last dp_whiteboard defense: N" |
| A level with reasons, the ten sections in order, every statement marked, at least five questions | yes/no | user log: the level and its "Level reason" lines, "Sections: …", "Claims: …", "Questions: …", "Concerns: …" |
| The checklist is the rules file's 20 lines, copied by the service | yes/no | user log: "Checklist: 20 lines, as the rules file has them" |
| Based on the document the rule gives (the draft (v2) in this run), and not out of date when saved | yes/no | user log: "… so it should explain the …", "… based on the draft (v2)", "Out of date when saved: no" |
| Claude answered a question about the Security model without changing the draft | yes/no | user log: "Asked Claude about 5. Security model: …", "Claude answered in N s: …", "Defense questions item, made by whiteboard, …: N options, 0 with a change, 0 small edits, N new items"; runner: "dp_reply refusals on a Defense thread: N" |
| Defense questions is in the nav, and never on the Finalize checklist | yes/no | user log: "Defense questions in the nav: yes", and the three "Finalize …: …, the Defense thread not listed" lines |
| Asking didn't make the defense out of date | yes/no/n.a. (Claude added items) | user log: "Out of date after asking Claude: no", or the line with "(Claude added N items to the plan)" |
| An unknown sent to Questions (or a concern to Concerns) got Claude's suggested answers, and they don't hold up Finalize | yes/no | user log: "Sent "…" (…) to …: Added to ….", "Claude suggested answers in N s: N options …", "Finalize with Claude's suggestions waiting: …" |

Notes: <the level and its reasons, in a line; the claims by mark, the questions and the concerns by severity; whether section 2 named a project diagram; how long the defense took to be picked up and written, its JSON size and the pack's; Claude's answer about the Security model (and whether it resolved the thread) and its suggested answers for what was sent, a line each; anything surprising; any fix made; and the user log's Whiteboard Defense lines, with `$TMPDIR` shortened>
```

- [ ] **Step 10: Commit**

```bash
git add scripts smoke README.md docs/how-it-works.md SPEC.md
git commit -m "test: real Claude Code smoke for the Whiteboard Defense, and docs for Plan 6" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The controller pushes the branch after the final review, as in Plans 1–5.

---

## Not in this plan

These come later, or stay deferred with a reason.

- **Plan 7: Present.**
  - The full-screen hand-drawn whiteboard (Rough.js lines, Motion animation), with chapters, steps, captions and red-marker notes, built from the project's diagram data.
  - The defense's `presenter` field, and the agent's instructions for it.
  - The §16 whiteboard canvas (white or night, with a faint dot grid).
- **Defend the code** (SPEC §12, Phase 2): re-running the defense against a branch's real diff, `basedOn.kind: 'code'`.
- **Keeping old defenses.** A regenerate replaces `defense.json`. Its Defense threads stay, but the page lists only the current defense's threads. An exported `.md` in the repo, once committed, is the history.
- **Reopening an asked thread from the page.** Each Ask makes a new thread. An earlier one is a link away, and you can carry on in it there.
- **The finalizer's pack on a big plan.** `finalizePack` has the same exposure the whiteboard pack had: it inlines the rules, the whole draft, the previous final and every item's body, so a big plan can pass the MCP result cap (25,000 tokens by default). It should give files to Read, and clip bodies, as `whiteboardPack` now does.
- **The whiteboard pack mid-import, and when its hash is taken.** `/context { whiteboard: true }` isn't refused while the plan is importing, and the request's inputs hash is taken at pick-up, not when the subagent reads the pack. A change in between shows a fresh defense as Out of date, which errs the safe way.
- **Writing the defense in the background.** It runs in the foreground, so the only window is busy for ten minutes or more, and the page says threads wait. A background subagent that keeps the window listening needs a back-check that fails only on `finished.whiteboard` or a window that's gone.
- **The Plan 5 follow-ups** (`.superpowers/plan-5-followups.md`):
  - settling a Plan changes thread doesn't reach the items;
  - a re-import's change to an item can't be seen or undone;
  - the recovery note isn't surfaced in `/open`;
  - `update.ts`'s raw error on the `:316` rethrow, and `.unfinished-*` folders never cleaned up;
  - the review's minors.

  Plan 6 fixes one: `saveProposal` no longer expands a token naming a Plan changes item (Task 2).
- **Plan 4's open follow-ups** (`.superpowers/plan-4-followups.md`) and **Plans 1–3's remaining minors** (`.superpowers/plan-1-followups.md`, `plan-2-followups.md` and `plan-3-followups.md`).
