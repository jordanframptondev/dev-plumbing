# Plan 5: Bring Changes In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the plan in the repo changes after it was imported, re-running `/dev-plumbing <plan>` offers to bring the changes in. On yes, dev-plumbing:
- saves the current version in a trail;
- merges the repo's new version into your draft, turning each conflict into a "Plan changes" thread (or, for a rewrite, starts the draft again from the new version, when you choose that);
- re-imports every plumbing type, keeping your items and threads.

**Architecture:**
- **Core** (`packages/core`) adds:
  - a version trail in the project folder (`docs/versions/vN/`) and `project.versions`;
  - a three-way merge on top of `git merge-file`;
  - a built-in **Plan changes** plumbing type that ships in code, not in the user's config;
  - `updatePlan`, which snapshots, merges, creates the conflict threads and queues them for Claude, all in one step, with a journal on disk that puts back an update that stopped part-way;
  - a re-import mode for `writeImportBatch`, which matches items by key, flags changed ones, and parks the ones the importer lists as removed from the plan.
- **The service's** `/open` notices a changed plan, returns `plan-changed`, and runs the update only when called again with `update: true`. When the update would have to wait, it opens the project instead and says why.
- **The skill** asks you "Update to vN?" first. **The web app** gains a Versions list, with any version's plan and draft, what its update changed in the draft, and a comparison between versions.

**Tech Stack:** the stack of Plans 1–4: TypeScript 5.9, Node 22, pnpm 10, Zod 3.25, Hono 4, React 19, Vite 7, Tailwind 4, TanStack Router and Query, Vitest 3, Playwright, `@modelcontextprotocol/sdk` 1.31, `diff` 9. No new dependencies. The merge uses the `git` binary that dev-plumbing already requires.

**Spec:** `SPEC.md` (repo root). Read §6.3, §7, §10.2, §10.5 and §15.4 before starting. §15.4 describes this feature with an automatic banner; this plan replaces the banner with the user's choice (Decision 1). `docs/how-it-works.md` explains how the plugin, the service and the app fit together.

## What Plans 1–4 left in place

Plan 4 is merged on `main`. This plan builds on:
- **The project file.** `project.json` (`core/src/schemas/project.ts`, not passthrough) has `source: { path, clone, branch, hashAtImport }`. `hashAtImport` is written at create and read nowhere. `docs.original` and `docs.draft` are `docs/original.md` and `docs/draft.md`.
- **Opening.** `openPlan` (`core/src/store/open.ts`) returns early for a plan imported before (`findBySource`) and ignores the new text. The service's `/api/claude/open` (`service/src/routes/claude.ts`) resolves the plan with `resolvePlan`, then:
  - runs `openPlan` under the folder lock `open:<folder>`;
  - does its bookkeeping (`listeners.seen`, `recordClone`, requeues) under the project lock `<repo>/<id>`;
  - returns `created` or `reopened` with `importTypes`, the types still in `project.importPending`, each with `afterOthers` for flows-screen and timeline types.
- **Importing.**
  - `writeImportBatch` (`core/src/store/importItems.ts`) accepts a batch only for a type in `importPending`. It always makes a NEW id `<type>-<key>` (`uniqueId` adds `-2` on a clash), even though `Item.key` is stored "so a later re-import can match the item".
  - The last type, or `finishImport` called from `/wait`, moves `importing` → `active`. `/wait` calls `finishImport` on every poll, from any window listening on the project.
  - The importer's pack (`importPack` in `core/src/store/context.ts`) has `type`, `draft`, `profile` and `existingItems: { id, type, title }[]`.
- **Threads.**
  - `setParked` (`core/src/store/threads.ts`) refuses `with_claude` and `resolved` threads.
  - Item `flags` ("May need another look") are `{ reason, fromThreadId, at }[]`. `postReply` and conflicts set them; sending an answer on the item's thread clears them.
  - System messages are built inline as `{ id: newId('m', now), at, author: 'system', text }`.
- **Service-made work.** A submission is a file in `submissions/`; `pendingSubmissions` hands the oldest out through `/wait` as `kind: 'submission'`, and `finishSubmission` puts unanswered threads back with a line that assumes a person's answer.
- **Draft changes.** An option's `change.md` patches are exact `find`/`replace` pairs, and each `find` must occur exactly once. An accepted option whose `find` no longer fits goes back to Claude automatically (`submit.ts`).
- **Documents.** `ProjectNav` lists Original, Draft and Final. `GET /api/projects/:repo/:id/docs/:which` serves `original | draft | final`, and `DocumentView` renders them. `diffText(before, after)` (`core/src/docDiff.ts`) gives `DiffSegment[]`, and the web's `DiffView` shows them.
- **Plumbing types.** `loadConfig` reads only `<configDir>/plumbing/*.md`. Setup copies the defaults but never overwrites them, so a new built-in rules file wouldn't reach users who have already set up.

## Decisions this plan makes

Review these. Each one is the plan's reading of the spec, or of the user's choices, where they leave room.

1. **Nothing is detected automatically.** The user chose this on 2026-10-05.
   - When `/dev-plumbing` opens a project that already exists, by plan path or by picking it, the service compares the plan file in **this clone** with the project's current version.
   - If they differ, `dp_open` returns `kind: 'plan-changed'` and writes nothing. The skill asks "The plan changed in the repo since v1 (12 lines added, 3 removed). Update to v2?"
   - **Update to v2** calls `dp_open` again with `update: true`. **Not now** calls it with `update: false`, which opens the project as it was.
   - It asks again the next time. The app itself never shows a banner.
   - When this clone is on another branch than the current version came from, the question names it: "The plan on branch <branch> changed since v1 (…)". When this clone has a version the project already had (it hasn't pulled, or it's on an older branch), nothing is offered: the project opens, and Claude says "This clone has the plan's v1, older than the project's v2. There's nothing to bring in." (a review ruling, D6).
   - **A rewrite** (the user's choice, D5): a dry-run merge tells how a merge would go. When the conflicts would cover more than a third of the draft, or only the formatting changed, the question says so and offers a third answer, **Start the draft from v2**: the draft becomes the repo's new version, with nothing to settle, and the old draft stays under Versions.
2. **Versions are numbered from 1**, and the import is v1.
   - `project.versions` lists every version: `{ n, at, hash, clone, branch, commit, merge? }`, where `merge` is `{ clean, conflicts, fresh? }`. A project with no `versions` is at v1, whose hash is `source.hashAtImport`.
   - Before an update, the current `docs/original.md`, `docs/draft.md` and items are copied to `docs/versions/v<n>/` (`original.md`, `draft.md`, `items/`). The working files keep their names, so nothing else in the app moves.
   - The draft as the update left it is kept in the new version's folder, `docs/versions/v<n+1>/merged.md`, so the version's page can show what the update changed in the draft (the user's choice, D7).
3. **The merge is three-way, and your draft wins every conflict until you decide.**
   - `git merge-file --diff3` runs with base = the current `original.md`, ours = the draft, theirs = the repo's new text.
   - Clean changes go into the draft. `clean` counts the change blocks the merge made in the draft.
   - At each conflict, the draft keeps **your** text, so conflict markers never reach the draft. The conflict becomes a **Plan changes** thread.
   - `original.md` then becomes the repo's new text.
4. **Plan changes is a built-in plumbing type that ships in code.** It isn't in `defaults/`, so it needs no setup, and it's never imported, never listed among the rules files, never offered as a type to turn on or off, and Claude can't make one in a reply.
   - It appears in the project's navigation only when the project has such items. It's always first (order 0).
   - Each conflict is one item. Its body shows **Your draft**, **The repo (vN)** and **Before (vN−1)**, after a line saying where the repo moved the passage, when it moved it (your draft then has both copies).
   - Its thread starts **with Claude**: `updatePlan` queues it as a submission. When the window next listens, a thread subagent replies with three choices, each with a `change`, so each is one click to accept (the user's choice, D4): **Use the merged version** (recommended), **Take the repo's version**, and **Keep my draft**, whose change is empty: accepting it resolves the thread with a decision and changes nothing. You accept one or answer, as in any thread.
   - An unresolved Plan changes item blocks Finalize, with "Your draft and the repo's new version disagree here." Plan changes items never go into the final, because their outcome is already in the draft.
   - When a later version conflicts again over a passage an older Plan changes thread still holds, the older thread is parked, superseded by the new one, which links to it (a review ruling, D8).
5. **Every enabled type is re-imported** (the user's choice), with ids kept.
   - After the merge, `importPending` holds every enabled, non-built-in type, and the status is `importing` until they return. The importers run as at import time (same waves, same `maxParallel`).
   - In a re-import, an importer's pack carries the changes between the two plan versions, plus this type's existing items with their keys and current drawings. It sends new items, items whose part of the plan the changes touched, and `removed`: the keys of existing items whose part of the plan the new version took out (a review ruling, D1). An item it doesn't mention is left as it is, so an answered question is never parked for being left out. `noChanges` means "nothing changed for this type", and leaves its items alone.
   - Matching is by key:
     - **Same key, same content:** untouched.
     - **Same key, different content:** updated in place. It keeps its id and thread, gets the flag "Changed in the plan's v2." and the system line "Updated from the plan's v2.". A question it brings is added only to a thread that's idle or waiting for you.
     - **New key:** a new item, as at import.
     - **A key in `removed`:** see Decision 6.
     - **Items you or Claude added:** never touched.
   - A finalized project goes back to **Active** when the update changed its draft (something merged, a conflict, or a fresh start), and the Finalize page says "The plan's v2 came in since the last final." It stays **Finalized** only when the draft is as it was and there's nothing to settle (the user's choice, D2). Any other project goes back to Active. Finalize stays refused while importing.
6. **A removed section's items are parked, never deleted** (the user's choice).
   - An item is removed only when the importer lists its key in `removed`. Its thread is parked whatever its state, except a thread with Claude, which is flagged instead. It gets "Removed from the plan in v2.", and the item records `removedIn: 2`.
   - The Finalize checklist lists it under "Parked: left out of the final" with "Removed from the plan in v2."
   - If a later version brings the key back, the item is unparked, with "Back in the plan in v3.". Unparking it by hand clears `removedIn` too. Either way, a thread whose answer still stands is resolved again.
7. **An update waits for work in progress.** While the project is importing, any thread is with Claude, or a finalize is requested or being written, the update would pull the draft out from under that work.
   - `/open` checks this before it asks (after putting back work that a window which is gone had picked up). It doesn't ask: it opens the project, so this window answers what's waiting, and tells the user, for example "The plan changed in the repo since v1. Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered." (a review ruling, D3).
   - `updatePlan` itself refuses with the same message, and writes nothing, for an update that's called anyway. The skill then opens the project as it was.
8. **An update is one journaled step.** Before anything else, it writes a journal (`docs/versions/v<n>/update.json`) listing every path it will create. The order is:
   1. the version snapshot;
   2. the conflict items, threads and submission, and `merged.md`;
   3. the draft;
   4. `original.md`;
   5. `project.json`, last. That's the commit point, and then the journal is deleted.

   A failure puts every earlier write back. If even that stops part-way, or the service stops mid-update, the journal is still there, and the next `/dev-plumbing` finishes putting the project back before anything else.
9. **The Versions list lives in Documents.**
   - Once a project has a v2, Documents shows "Draft (v2)", "Original (v2)" and **Versions**.
   - The Versions page lists every version with its date, branch and commit, the current one first.
   - A version's page shows that version's plan and draft, what its update changed in the draft, and **Compare with** another version's plan, as a diff.
10. **The project's title follows the plan.** An update takes the title from the new version's first heading when it has one.
11. **Only the window that runs the importers ends an import.** `/open` records it (`importBy`) whenever it hands out importers. Another window's `dp_wait` (your earlier session, still listening) no longer ends the import early; it can once that window is gone (no ping for 90 s).

## Global Constraints

Everything in Plans 1–4's Global Constraints still applies:
- Node `>=22.12`, pnpm `10.x`, TypeScript `strict`, ESM.
- The public repo stays generic: examples use the made-up "Acme" app, with no real company names, personal paths or emails.
- `~/.dev-plumbing/`, overridable with `DEV_PLUMBING_HOME`. Never overwrite a user's config file except through an explicit **Reset to default** or **Detect again**.
- Atomic writes (`writeFileAtomic` / `writeJsonAtomic`). The service is the only writer of the projects folder, always under the project's lock.
- Subagents get only `Read`, `Grep`, `Glob` and their dp tools.
- The service binds `127.0.0.1` with the Host, token and same-origin guard.
- The Ink wash theme exactly per §16:
  - colour only as dots, text and thin lines;
  - no tinted boxes;
  - tokens only;
  - one primary button per screen;
  - sentence-case copy;
  - one column under 768 px with no sideways scrolling.
- **Tests:**
  - Tests clean up their temp folders (`tempDir` / `removeTempDirs`).
  - They never touch the real `~/.dev-plumbing`, never run the real `launchctl`, never install plugins and never use port 4545.
  - e2e runs on 45459 and the smoke test on 45461.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, passed as a second `-m`, whatever model wrote it.
- Work in a git worktree, never in the main checkout, which runs the user's live app and plugin.

New in this plan:
- **Git:** `git merge-file` runs through `execFile` (never a shell), with a 20 s timeout and `--marker-size=31`, on temp files in an absolute folder under `os.tmpdir()` that are always removed. An exit code from 1 to 127 means conflicts, not failure.
- **Writes:** an update writes only inside the project folder. It never writes into a clone; it only reads the plan file there.
- **Names:**
  - built-in type id `plan-changes`;
  - `dp_open` kinds `plan-changed` and `updated`;
  - `dp_open` inputs `update?: boolean` and `fresh?: boolean`; `dp_write_items` input `removed?: string[]`;
  - the folder `docs/versions/v<n>/`, holding `original.md`, `draft.md`, `items/`, `merged.md` and, during an update, `update.json`;
  - project fields `versions`, `reimporting` and `importBy`;
  - item fields `removedIn` and `conflict`.
- **Exact copy, used verbatim:**
  - The skill's question, from `next`: "The plan changed in the repo since v<n> (<a> lines added, <r> removed). Update to v<n+1>?" (`<a>`/`<r>` are numbers; "1 line" in the singular). When this clone's branch isn't the current version's: "The plan on branch <branch> changed since v<n> (<a> lines added, <r> removed)." Before " Update to v<n+1>?" it adds " Only the formatting changed." (whitespace only) or else " It's mostly rewritten, so merging would leave <k> conflicts." ("1 conflict" in the singular).
  - Its options: "Update to v<n+1>" / "Not now"; when a fresh start is suggested, "Update to v<n+1> (merge into my draft)" / "Start the draft from v<n+1>" / "Not now".
  - The `Tell the user` lines `/open` puts first in a `reopened` project's `next`: "The plan changed in the repo since v<n>. <the refusal below>" and "This clone has the plan's v<k>, older than the project's v<n>. There's nothing to bring in."
  - The refusals (Task 4's `updateRefusal`): "This project is still importing. Run /dev-plumbing again once that's done." / "Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered." / "Claude has <n> threads to answer in this project first. Run /dev-plumbing again once they're answered." / "Finalize is under way. Run /dev-plumbing again once it's done or cancelled."
  - After an update (the line in `updated`'s `next`): "v<n>: <clean> changes merged, <conflicts> to settle in Plan changes." / "v<n>: <clean> changes merged, nothing to settle." ("1 change" in the singular) / "v<n>: the draft now starts from the plan's v<n>. Your earlier draft is kept under Versions."
  - "Plan changes" (the type's title)
  - "Nothing in the repo's new version conflicts with your draft." (the type's empty message)
  - "Keep my draft" / "Take the repo's version" (the type's answer presets), and the option labels in its Rules: "Use the merged version" / "Take the repo's version" / "Keep my draft"
  - "Your draft and the repo's v<n> both changed this passage. Claude is proposing a merged version." (the conflict thread's first line)
  - "The repo moved this passage to § <heading>. Your draft now has both copies." (a conflict item's first line, when the repo moved it)
  - "Superseded by the plan's v<n>: <title>." (system line on an older Plan changes thread)
  - "Your draft and the repo's new version disagree here." (the checklist reason)
  - "Changed in the plan's v<n>." (the flag reason)
  - "Updated from the plan's v<n>." (system line)
  - "Removed from the plan in v<n>." (system line and checklist reason)
  - "Back in the plan in v<n>." (system line)
  - "Claude didn't get to this one. Pick Keep my draft or Take the repo's version, or say what you want, and send it." (an unanswered thread with no answer from you)
  - "The plan's v<n> came in since the last final." (the Finalize page)
  - "Versions", "Draft (v<n>)", "Original (v<n>)", "Current", "Compare with", "Plan", "Draft"
  - "Couldn't merge the new plan: <message>"
  - Task 2's `MergeError` messages (the `<message>` above): "The merge needs git, and git wasn't found on this Mac." / "git merge-file took more than 20 seconds, so the merge was stopped." / "git merge-file failed: <the first line of stderr>" (or "git merge-file failed: exit code <n>" when stderr is empty) / "git merge-file's output ended inside a conflict."
  - A failed update (Task 4, ConflictError): "The update didn't finish (<reason>). What it had written was put back, so the project is as it was. Run /dev-plumbing to try again." / "The update didn't finish (<reason>), and some files couldn't be put back yet: <paths>. Run /dev-plumbing again to finish putting them back." / at the next look, if putting back still fails: "An earlier update to v<n> didn't finish, and some files couldn't be put back yet: <paths>. Run /dev-plumbing again to finish putting them back."
  - A re-import batch's problems (Task 5): "Item <i> (<key>): A new item needs a title and a summary." / `removed: "<key>" isn't the key of an item <type title> imported before.` / `removed: "<key>" is in items too. Send it in one or the other.`
  - Versions routes' 404s: "Unknown document." / "That version doesn't exist." / "That version's document is missing from the project folder." / "v1 is the import, so no update changed its draft."
  - The Versions pages (Tasks 8, 9): "Each time you bring the repo's changes in, the plan and the draft from before are kept here." (the list's subtitle); "Imported" (v1's line) and "<n> change(s) merged · <n> conflict(s)" (a later version's); "‹ Versions"; "v<n> · Current" (the current version in Compare with); "What the update changed in your draft"; "The update didn't change your draft."; "Changes to the plan from v<a> to v<b>"; "The two plans are the same."; "This version doesn't exist."

## Review Focus

These five situations aren't the main path, but they're the most likely to hurt someone using this. Each has a test in the task named.

1. **Losing draft work in an update.**
   - A conflict keeps your text in the draft, and no marker ever reaches it.
   - The old original, draft and items are in `docs/versions/v1/` before anything else is written, and a journal lists everything the update creates.
   - A failure part-way is put back, at once, or at the next `/dev-plumbing` when putting it back stopped too, or the service stopped mid-update. Until it's put back, the snapshot stays.

   Tested in Task 2 ("conflict markers never reach the draft") and Task 4 ("an update never loses your draft", with the tests after it on a rollback that stopped part-way and on a crash).
2. **A re-import that orphans your threads, or parks your answers.**
   - An item whose key comes back keeps its id, thread, answers and decisions.
   - A changed one is flagged, not replaced.
   - An item the importer doesn't mention is left alone, answered or not: only a key listed in `removed` is taken out of the plan.
   - An item you added by hand is never touched.

   Tested in Task 5 ("a re-import keeps every answered thread").
3. **Removed sections.**
   - Their items, once the importer lists their keys in `removed`, are parked with "Removed from the plan in v2.", including resolved ones, and none is deleted.
   - An item whose section comes back is unparked, resolved again when its answer still stands.

   Tested in Task 5 ("a removed section parks its items, and they come back if it returns").
4. **Updating in the middle of other work.** While Claude has threads to answer, while the plan is still importing, or while a finalize is under way, the update is refused with the right message and nothing is written. `/open` opens the project instead of asking, so that work gets done, and says why. Tested in Task 4 ("an update waits for work in progress"), and in Task 6 ("opens the project instead of asking while Claude has threads to answer, and asks once they are answered").
5. **Saying no.** "Not now" opens the project exactly as it was, writes nothing, and the question comes back next time. Tested in Task 6 ("declining the update changes nothing").

---

## File Structure

```
dev-plumbing/
  plugin/skills/dev-plumbing/SKILL.md   # Task 7: plan-changed and updated
  plugin/agents/importer.md             # Task 7: re-import
  plugin/agents/thread.md               # Task 7: a thread with no answer yet
  packages/
    core/src/
      schemas/project.ts                # Task 1: versions, reimporting, importBy, item removedIn and conflict
      schemas/plumbingType.ts           # Task 3: optional builtIn
      schemas/loop.ts                   # Task 5: import items' optional title and summary, a batch's removed
      schemas/views.ts                  # Tasks 1, 8, 9: ProjectHome.version, VersionSummary, removedIn, planVersionSinceFinal
      store/versions.ts                 # Task 1: projectVersions, currentVersion, snapshotVersion, readVersionDoc
      git.ts                            # Task 1: gitHead
      merge.ts                          # Task 2: mergePlan
      planChanges.ts                    # Task 3: PLAN_CHANGES_TYPE, importableTypes
      config.ts                         # Task 3: loadConfig adds the built-in type
      store/reply.ts                    # Task 3: a reply can't make a built-in type's item
      store/checklist.ts                # Tasks 3, 5: Plan changes block; removed items' reason
      store/context.ts                  # Tasks 3, 5: pack leaves Plan changes out; re-import pack
      store/projects.ts                 # Tasks 3, 9: nav shows Plan changes only with items; planVersionSinceFinal
      store/update.ts                   # Task 4: planChange, updateRefusal, updatePlan, the journal
      store/queue.ts                    # Task 4: unanswered service-made threads
      store/importItems.ts              # Task 5: re-import mode, claimImport, finishImport
      store/threads.ts                  # Task 5: unparking a removed item
      index.ts                          # Tasks 1–4: exports
    service/src/
      routes/claude.ts                  # Task 6: /open plan-changed and update; /items removed; /wait
      routes/versions.ts                # Task 6: GET versions, a version's docs, compare, update diff
      routes/config.ts                  # Task 3: built-in types stay out of rules lists
      routes/finalize.ts                # Task 9: planVersionSinceFinal
      app.ts                            # Task 6: mount versions routes
    mcp/src/tools.ts                    # Task 7: dp_open update and fresh, dp_write_items removed
    web/src/
      api/client.ts                     # Task 8: versions
      router.tsx                        # Task 8: versions routes
      pages/ProjectNav.tsx              # Task 8: Draft (vN), Original (vN), Versions
      pages/versions/VersionsPage.tsx   # Task 8: the list
      pages/versions/VersionPage.tsx    # Task 8: one version, its update's diff, compare
      pages/ListScreen.tsx              # Task 9: removed-from-plan label
      pages/finalize/ProposalView.tsx   # Task 9: FinalDone says a newer version came in
      styles.css                        # Task 9: md blocks wrap
    web/e2e/versions.spec.ts plan-update.spec.ts
  scripts/smoke-user.mjs smoke-claude.sh   # Task 10: the smoke test updates the plan
  smoke/RESULTS.md README.md docs/how-it-works.md   # Task 10
```

## Contracts

The exact names and types the tasks share. A task's implementer sees only their own task, so every cross-task name is fixed here.

### Core: project fields and versions (Task 1)

```ts
// schemas/project.ts
export const versionSchema = z.object({
  n: z.number().int().min(1),
  at: z.string(),                    // ISO; v1's is project.createdAt
  hash: z.string(),                  // sha256 hex of the repo plan text
  clone: z.string(),                 // tildified clone it came from
  branch: z.string(),
  commit: z.string().nullable(),     // HEAD sha of that clone, null if unknown
  merge: z.object({ clean: z.number().int().min(0), conflicts: z.number().int().min(0), fresh: z.boolean().optional() }).optional(),   // absent for v1
});
export type PlanVersion = z.infer<typeof versionSchema>;
// plumbingProjectSchema gains:
versions: z.array(versionSchema).default([]),      // empty means v1 only, synthesised from source
reimporting: z.object({ version: z.number().int().min(2), from: z.enum(['active', 'finalized']) }).optional(),
importBy: z.string().optional(),                   // while importing: the window that runs the importers
// itemSchema gains:
removedIn: z.number().int().min(2).optional(),
conflict: z.object({ ours: z.string(), base: z.string(), theirs: z.string() }).optional(),   // Plan changes items
```

```ts
// store/versions.ts
export type VersionDoc = 'original' | 'draft' | 'merged';
/** The project's versions, v1 synthesised from source when `versions` is empty. Oldest first. */
export function projectVersions(project: PlumbingProject): PlanVersion[];
export function currentVersion(project: PlumbingProject): PlanVersion;          // last of projectVersions
/** docs/versions/v<n>/<which>.md, relative to the project folder. */
export function versionDocRel(n: number, which: VersionDoc): string;
/**
 * Copies docs/original.md, docs/draft.md and items/*.json to docs/versions/v<n>/ (items under items/). Returns every
 * rel path it wrote, original and draft first. Refuses (ConflictError) if that folder already has an original.md or
 * draft.md; a merged.md or a journal there is fine.
 */
export async function snapshotVersion(dir: string, n: number): Promise<string[]>;
/**
 * The text of a version's plan or draft: the working files for the current version, the snapshot otherwise.
 * `merged` is always docs/versions/v<n>/merged.md (none for v1). Null if missing.
 */
export async function readVersionDoc(dir: string, project: PlumbingProject, n: number, which: VersionDoc): Promise<string | null>;
export function planHash(text: string): string;                                   // sha256 hex, same as hashAtImport
// git.ts
export async function gitHead(cwd: string): Promise<string | null>;               // `git rev-parse HEAD`, null on any failure
```

`ProjectHome` gains `version: { current: number; count: number }`.

### Core: merge (Task 2)

```ts
// merge.ts
export type MergeConflict = { heading: string | null; ours: string; base: string; theirs: string; movedTo?: string };
export type MergeResult = { text: string; clean: number; conflicts: MergeConflict[] };
/**
 * Three-way merge with `git merge-file -p --diff3 --marker-size=31 -L draft -L original -L repo`.
 * `text` is the merge with every conflict resolved to `ours`, so no markers are left.
 * `clean` counts the change blocks the merge made in the draft (diffText(ours, merged text)).
 * `heading` is the conflict's own heading when the first non-blank line of `ours` is one, else the nearest heading
 * above the conflict in `text`, without its #s.
 * `movedTo` is set when `theirs` is empty and the trimmed `base` appears elsewhere in `text`: the heading there.
 */
export async function mergePlan(o: { base: string; ours: string; theirs: string }): Promise<MergeResult>;
export class MergeError extends Error {}   // git missing, a timeout, or an exit code outside 0–127
```

Line endings: `\r\n` is normalised to `\n` before merging. The texts end with a newline after merging if `theirs` did. The temp folder is `path.resolve`d, so a relative `TMPDIR` works.

### Core: Plan changes type (Task 3)

```ts
// planChanges.ts
export const PLAN_CHANGES = 'plan-changes';
export const PLAN_CHANGES_TYPE: PlumbingType;   // header below; file '', body = the rules text; builtIn: true
export function importableTypes(types: PlumbingType[]): PlumbingType[];   // enabled && !builtIn && id !== PLAN_CHANGES
export const CONFLICT_REASON = "Your draft and the repo's new version disagree here.";
```

- `PlumbingTypeHeader` gains `builtIn: z.boolean().default(false)`.
- **Header:** `{ id: 'plan-changes', title: 'Plan changes', order: 0, screen: 'list', emptyMessage: "Nothing in the repo's new version conflicts with your draft.", fields: [], answerPresets: ['Keep my draft', "Take the repo's version"], timeline: false, enabled: true, builtIn: true }`.
- **Rules body** (`## What to look for`, `## Rules`, `## Done when`), in short:
  - each thread is one passage that the draft and the repo both changed;
  - with no message from the person yet, reply with three options, each with a `change`, so each is one click to accept: `merged` ("Use the merged version", recommended), `theirs` ("Take the repo's version", whose `md` replaces the draft's text with the repo's; left out when "Your draft" is "(nothing)" and no text next to it is unique) and `keep` ("Keep my draft", `change: { md: [] }`);
  - each patch's `find` is the draft's current text, unique, copied from the draft file; up to 20 patches, in document order; split by paragraph when "Your draft" is over about 8,000 characters;
  - when "Your draft" is empty, anchor `find` on the text around it; when "The repo" is empty, the repo deleted or moved the passage (moved: carry the draft's edits into the moved copy and remove this one, two patches);
  - say in one or two sentences which decisions bear on it.
- **`loadConfig`** adds `PLAN_CHANGES_TYPE` to `types`, sorted in by `order` so it comes first. If the user has a `plumbing/plan-changes.md`, theirs wins. Every user rules file gets `builtIn: false`, and `importableTypes` still never imports `plan-changes`.
- **Every list of types** shown for editing, toggling or importing filters out `builtIn`:
  - `/open`'s import types;
  - the rules and settings routes;
  - `writeImportBatch`, where a `builtIn` type is refused like a disabled one;
  - `postReply`'s `newItems`, which take only `importableTypes`, so Claude can't make a Plan changes item.
- **An empty change** (`change: { md: [] }`) is an applied no-op accept: `postReply` takes it, and `submit` resolves the thread with the decision "<title>: <label>" and "Applied and resolved.". No core change was needed for this; tests keep it so.
- **`checklistFrom`:** an unresolved, unparked `plan-changes` item is blocking with `CONFLICT_REASON`, checked right after "Claude is working on it.".
- **`finalizePack`:** leaves `plan-changes` items out of `items` and `tokens`.
- **`loadProjectHome`:** lists a `builtIn` type in `types` only when the project has items of it.

### Core: update (Task 4)

```ts
// store/update.ts
export type PlanChange = { from: number; to: number; added: number; removed: number; conflicts: number; whitespaceOnly: boolean; suggestFresh: boolean };
export type OlderPlan = { older: number };
/**
 * After recoverUnfinishedUpdate: null when the repo text has the current version's hash, or equals docs/original.md
 * once LF-normalised; { older: k } when it (as given or LF-normalised) has an earlier version's hash; otherwise the
 * change, with lines counted on the normalised texts and a dry-run merge for conflicts. suggestFresh: whitespace only,
 * or the conflicts' ours lengths sum to more than a third of the draft.
 */
export async function planChange(dir: string, repoText: string): Promise<PlanChange | OlderPlan | null>;
/** Why an update has to wait, or null: importing; threads with Claude; finalize requested or writing. Exact copy. */
export async function updateRefusal(dir: string): Promise<string | null>;
export type UpdateResult = { version: number; clean: number; conflicts: number; fresh: boolean; conflictThreadIds: string[]; importTypes: string[] };
/**
 * Brings `repoText` in as the next version. Refusals (ConflictError, nothing written): updateRefusal's, and
 * "The plan hasn't changed since v<n>.". A MergeError becomes InputError("Couldn't merge the new plan: <message>"),
 * also with nothing written. With `fresh`, the draft becomes repoText, with no merge and no conflicts.
 */
export async function updatePlan(dir: string, o: {
  repoText: string; clone: string; branch: string; commit: string | null; types: PlumbingType[]; fresh?: boolean; home?: string; now?: Date;
}): Promise<UpdateResult>;
/** Puts back an update that stopped part-way (its journal is still there), or deletes the journal of one that finished. */
export async function recoverUnfinishedUpdate(dir: string): Promise<void>;
/** True when the version's update changed the draft: merge.clean > 0, merge.conflicts > 0, or merge.fresh. */
export function changedDraft(v: PlanVersion): boolean;
```

- **Conflict items:**
  - id `plan-changes-v<N>-<k>`, made with `uniqueId`; key `v<N>-<k>`, where `k` counts from 1 in document order;
  - `type: 'plan-changes'`, `createdBy: 'import'`;
  - `title`: the conflict's heading, or `Change <k>` when there's none;
  - `summary`: `Your draft and the repo's v<N> both changed this passage.`;
  - `mdAnchor: { heading }` when the heading is at most 200 characters;
  - `conflict: { ours, base, theirs }`;
  - `links`: the older Plan changes items it supersedes, when there are any;
  - `body`, exactly (the first line only when the conflict has `movedTo`):
    ```
    The repo moved this passage to § <movedTo>. Your draft now has both copies.

    **Your draft**

    <ours, or "(nothing)">

    **The repo (v<N>)**

    <theirs, or "(nothing)">

    **Before (v<N-1>)**

    <base, or "(nothing)">
    ```
    Each text sits in a fenced block made longer than any backtick run inside it, with language `md`.
- **Conflict threads:**
  - `status: 'with_claude'`, with one system message using the exact copy;
  - one submission `{ id: newId('s', now), at, scope: 'all', drafts: {}, sent: <their ids>, resolved: [], processedAt: at }`, written only when there are conflicts.
- **Superseded:** an older Plan changes item, not resolved or parked, whose trimmed, non-empty `conflict.ours` is contained in a new conflict's `ours`. After the commit point its thread is parked with "Superseded by the plan's v<N>: <new title>.".
- **`project.json`** gets:
  - `versions`: v1 synthesised when empty, plus the new version, with `merge: { clean, conflicts }`, or `{ clean: 0, conflicts: 0, fresh: true }`;
  - `title` from the new H1 when there is one;
  - `importPending`: `importableTypes(types)` ids;
  - `status: 'importing'`;
  - `reimporting: { version: N, from }`, `from` being `'finalized'` only when the project was finalized and `changedDraft(version)` is false, else `'active'`;
  - `updatedAt`.
- **`docs/versions/v<N>/merged.md`:** the draft exactly as the merge left it (the repo text for `fresh`).
- **The journal:** `docs/versions/v<n>/update.json` (`n` = the version being replaced), `{ to: N, created: string[] }`, written first, with every path the update will create (folders that don't exist yet, the conflicts' files, the submission, `merged.md`). Deleted once `project.json` is written. Putting back: the working draft and original from the snapshot, the created paths removed, then the snapshot and the journal.
- **`importTypes`** in the result is `importPending`, in order.
- **`queue.ts` `finishSubmission`:** a still-`with_claude` thread with no `you` message goes to `your_turn` with the line "Claude didn't get to this one. Pick Keep my draft or Take the repo's version, or say what you want, and send it." and no draft restored.

### Core: re-import (Task 5)

```ts
// schemas/loop.ts
importItemSchema: title and summary optional;                       // newItemSchema still requires both
importBatchSchema.removed: z.array(idSchema).max(200).optional();
// store/importItems.ts
export async function claimImport(dir: string, windowId: string): Promise<void>;   // importBy, while importing
export async function finishImport(dir: string, o?: { windowId?: string; isAlive?: (windowId: string) => boolean; now?: Date }): Promise<boolean>;
```

When `project.reimporting` is set, `writeImportBatch` runs in re-import mode for that batch's type:
- **A batch** is `items`, `removed`, both, or `noChanges` alone.
- **Matching:** existing items of the type with `createdBy: 'import'` are matched by `key`. A matched key reuses the item's id: no `-2`, same `threadId`.
- **Fields the importer leaves out are kept:** a matched item becomes `{ ...old, ...given }`, title and summary included. So resending an untouched item with only its `key` changes nothing, and a missing `data` never erases a drawing. A new key (and every item at a first import) needs a title and a summary.
- **"Changed":** a field the batch GAVE differs from the current value, compared with `stable()`. `links` are compared after key→id mapping, `codeRefs` as a set without `verified`, and `mdAnchor` by its heading.
- **Changed item:**
  - the item is written with the new content, keeping `id`, `threadId`, `createdBy`, `anchor` and any existing `flags`, plus a flag `{ reason: 'Changed in the plan's v<N>.', fromThreadId: item.threadId, at }`;
  - its thread gets the system line "Updated from the plan's v<N>.";
  - the batch item's `message` is appended (as a Claude message with `opening: true`) only when the thread is `idle` or `your_turn`, and then the status is `your_turn`.
- **Unchanged item:** not written.
- **An imported item with `removedIn` whose key is back:**
  - `removedIn` is cleared;
  - if its thread is parked, it goes to `resolved` when the thread has an active decision, else to `your_turn` when its last non-system message is Claude's, otherwise `idle`;
  - the line "Back in the plan in v<N>." is added whenever `removedIn` is cleared;
  - it's treated as changed when its content differs.
- **A key in `removed`** (it must be one of the type's imported keys, and not in `items`), not already `removedIn`:
  - `removedIn: N` is set;
  - its thread gets the line "Removed from the plan in v<N>.";
  - the thread is parked, unless it's `with_claude`, in which case the item is flagged with that reason instead.
- **An imported item the batch neither sends nor lists:** left exactly as it is.
- **`noChanges`** in re-import mode leaves the type's items alone, and adds an `emptyTypes` entry only if the type has no items.
- **An items or `removed` batch** removes the type's old `emptyTypes` entry, in import mode too.
- **When the last pending type finishes** (or `finishImport` runs):
  - `status` becomes `reimporting.from`, and `reimporting` and `importBy` are removed;
  - `finishImport` ends it only when there's no `importBy`, `windowId` is `importBy`, or `isAlive(importBy)` is false;
  - `finishImport` adds `IMPORT_DID_NOT_FINISH` only for unfinished types that have no items.
- **`setParked(dir, threadId, false)`** on a thread whose item has `removedIn` clears it, and resolves the thread when it has an active decision.
- **`importPack`** gains `reimport: { from: number; to: number; changes: string; existing: { key: string; id: string; title: string; summary: string; body: string | null; fields: Record<string, string>; mdAnchor: { heading: string } | null; hasData: boolean; data: unknown; removed: boolean }[] } | null`:
  - `changes` is the unified-style diff of the two versions' plans: lines prefixed `+ `, `- ` or `  `, with 2 lines of context between `@@` hunks;
  - `existing` is this type's imported items, `data` being the drawing as the threads left it (null when none).
- **`importPack.existingItems`** leaves out Plan changes items, and marks an item with `removedIn` `removed: true`.
- **`checklistFrom`:** a parked item with `removedIn` gets the reason `Removed from the plan in v<n>.` instead of "Parked.".

### Views (Tasks 1, 8, 9)

```ts
// ProjectHome gains:
version: { current: number; count: number };
// New, GET /api/projects/:repo/:id/versions:
export type VersionSummary = PlanVersion & { current: boolean };   // newest first
// TypeItemRow gains (Task 9):
removedIn: number | null;
// ProjectHome.finalize and FinalizeView gain (Task 9): the newest version after exportedTo.at that changedDraft, or null
planVersionSinceFinal: number | null;
```

### Service (Task 6)

- **`/api/claude/open`:**
  - The body gains `update: z.boolean().optional()` and `fresh: z.boolean().optional()` (used with `update: true`).
  - When the project already existed (by plan or by `project` id), it reads the plan from this clone. By plan, that's `plan.text`. By id, it's `resolvePlan({ root: git.root, cwd: git.root, plan: project.source.path })`, skipped when the file can't be read. Then, unless `update === false`, under the project lock:
    - **`planChange` is null, or `update === false`:** carry on as `reopened`.
    - **`{ older: k }`:** carry on as `reopened`, `next` starting `Tell the user: "This clone has the plan's v<k>, older than the project's v<n>. There's nothing to bring in." `.
    - **A change:** first `requeueUnfinished` and `requeueFinalize` (work held by windows that are gone), then `updateRefusal`. A refusal: carry on as `reopened`, `next` starting `Tell the user: "The plan changed in the repo since v<from>. <refusal>" `, whatever `update` is.
    - **`update` absent:** return `{ kind: 'plan-changed', repo, project, title, url, version: from, nextVersion: to, added, removed, conflicts, suggestFresh, whitespaceOnly, branch, next }` (`branch` is this clone's). `next` is `Ask the user: "<question>"` with the exact question and options, then how to call `dp_open` again (`update: true`, `update: true` with `fresh: true` when a fresh start is suggested, or `update: false`).
    - **`update === true`:** run `updatePlan` with `{ repoText, clone: git.root, branch: git.branch, commit: await gitHead(git.root), types: cfg.types, fresh: body.fresh === true, home: ctx.home }`. Then do the usual bookkeeping and return `{ kind: 'updated', repo, project, title, url, version, merged: { clean, conflicts }, importTypes, models, maxParallel, waitingSubmissions, next }`, with `importTypes` built exactly as for `created`, and `next` starting `Tell the user: "<the updated line>" `. Call `changed(ref)`. Don't call `rt.listeners.notify`: the updating window picks the conflict submission up at its own `dp_wait`, after the importers.
  - The bookkeeping calls `claimImport(dir, windowId)` whenever the result has a non-empty `importTypes` and `windowId` is given.
  - Errors from `updatePlan` come back with their message (409, or 400 for a merge that failed).
- **`/api/claude/items`:** passes the batch's `removed` on.
- **`/api/claude/wait`:** `finishImport(dir, { windowId, isAlive: rt.listeners.isAlive })`.
- **Browser routes** (`routes/versions.ts`, mounted under `/api`):
  - `GET /projects/:repo/:id/versions` returns `{ versions: VersionSummary[] }`.
  - `GET /projects/:repo/:id/versions/:n/:which` (`which` is `original` or `draft`) returns `{ text: string | null }`. An unknown `n` or `which` is a 404.
  - `GET /projects/:repo/:id/versions/compare?from=<n>&to=<n>&which=original|draft` returns `{ segments: DiffSegment[] }`, computed with `diffText`. A 404 when either version is missing.
  - `GET /projects/:repo/:id/versions/:n/update-diff` returns `{ segments: DiffSegment[] }`, the previous version's draft against `merged.md`. A 404 for v1, and when a file is missing.
- **`GET /projects/:repo/:id/finalize`** (Task 9): `FinalizeView.planVersionSinceFinal`, from `loadProjectHome`.

### MCP and plugin (Task 7)

- **`dp_open`:** the input gains `update: z.boolean().optional()` and `fresh: z.boolean().optional()`, and its description mentions `plan-changed`, `updated`, `update: true`, `fresh: true` and `update: false`. There are still 7 tools.
- **`dp_write_items`:** the input gains `removed: z.array(z.string().min(1)).max(200).optional()`.
- **SKILL.md §1** gains:
  - **`plan-changed`:** ask with AskUserQuestion, using the exact question (with its branch, formatting and rewrite variants) and options, then call `dp_open` again with the same `plan` (or `project`) and `update: true`, `update: true` with `fresh: true`, or `update: false`. If the question can't be asked (no one to answer), take **Not now**.
  - **`updated`:** tell the user, in one line, the line `next` starts with (its three forms), then go to 2 with its `importTypes`.
  - Any kind: when `next` starts with `Tell the user: "…"`, tell the user that line first.
  - An error after `update: true`: tell the user, then call `dp_open` again with `update: false`, instead of stopping.
- **`importer.md`** gains a "Re-import" section: when the pack has `reimport`, the importer sends new items, items whose part of the plan `changes` touched, and `removed`, the keys of existing items whose part of the plan the `- ` lines took out. It never removes an item because the draft or its thread settled it, and an existing item it doesn't mention is left alone. It reuses `existing` keys for the same things, sends only the fields that changed, edits a drawing's current `data` instead of redrawing it, asks a question only about what changed, and uses `noChanges` only when nothing changed for the type.
- **`thread.md`:** when the thread has no message from the person yet (a Plan changes thread), do what the plumbing type's rules say.

### Web (Tasks 8, 9)

```ts
// web/src/api/client.ts
api.versions(repo, id): Promise<{ versions: VersionSummary[] }>
api.versionDoc(repo, id, n: number, which: 'original' | 'draft'): Promise<{ text: string | null }>
api.compareVersions(repo, id, from: number, to: number, which: 'original' | 'draft'): Promise<{ segments: DiffSegment[] }>
api.updateDiff(repo, id, n: number): Promise<{ segments: DiffSegment[] }>
// router: /p/$repo/$project/versions → VersionsPage; /p/$repo/$project/versions/$n → VersionPage
```

- **`ProjectNav`:** when `home.version.count > 1`, the Draft and Original links read "Draft (v<n>)" and "Original (v<n>)", and a "Versions" link follows them.
- **`VersionsPage`:** the list is `Group` from `components/GroupedList.tsx`.
- **`VersionPage`:** for a version with `merge`, a section "What the update changed in your draft" with a `DiffView` of `api.updateDiff`.
- **Test ids:** `versions-list`, `version-row`, `version-doc`, `version-update-diff`, `version-compare`, `removed-from-plan`, `plan-version-since-final`.
- **`ListScreen`:** an item with `removedIn` shows `· removed from the plan in v<n>` (ink-3 text) in its row.
- **`FinalDone`:** takes `planVersionSinceFinal`, and shows "The plan's v<n> came in since the last final." when it isn't null.
- **`styles.css`:** `.doc pre:has(code.language-md) { white-space: pre-wrap; overflow-wrap: anywhere; }`.

---

### Task 1: Versions in the project, and the commit a version came from

A project now keeps a trail of plan versions. `project.versions` lists them (empty means the project is still at v1, read from `source`), and `docs/versions/v<n>/` keeps an earlier version's plan, draft and items once an update copies them there, and the draft as the update to v<n> merged it (`merged.md`). This task adds the schema fields that Tasks 4 to 6 fill in (the versions, `reimporting`, `importBy`, an item's `removedIn` and `conflict`), the helpers that read and snapshot versions, `gitHead` for the commit a version came from, and `ProjectHome.version` and `VersionSummary` for the web app.

**Files:**
- Create:
  - `packages/core/src/store/versions.ts`
  - `packages/core/test/versions.test.ts`
- Modify:
  - `packages/core/src/schemas/project.ts` (`versionSchema`, `PlanVersion`, `versions`, `reimporting`, `importBy`, `Item.removedIn`, `Item.conflict`)
  - `packages/core/src/schemas/views.ts` (`ProjectHome.version`, `VersionSummary`)
  - `packages/core/src/git.ts` (`gitHead`)
  - `packages/core/src/store/open.ts` (`openPlan` hashes with `planHash` and writes `versions: []`)
  - `packages/core/src/store/projects.ts` (`loadProjectHome` fills `version`)
  - `packages/core/src/index.ts` (export `./store/versions`)
  - `packages/core/test/fixtures.ts` (`seedProject` writes `versions: []`)
- Test:
  - `packages/core/test/versions.test.ts`
  - `packages/core/test/projects.test.ts`
  - `packages/core/test/open.test.ts` (unchanged; it still passes)

**Interfaces:**
- Consumes (Plans 1–4):
  - `readProjectFile`, `writeProjectFile`, `docPath`, `ConflictError` (`store/io.ts`); `writeFileAtomic` (`atomic.ts`);
  - the private `git(cwd, args)` helper in `git.ts`, which trims stdout and returns null on any failure;
  - in the tests: `seedProject`, `pair`, `makeRepo`, `DRAFT` (`test/fixtures.ts`), `openPlan` (`store/open.ts`), `tempDir`/`removeTempDirs` (`testkit/tmp.ts`).
- Produces, exactly as in the header's Contracts:
  - `schemas/project.ts`: `versionSchema` (whose `merge` is `{ clean, conflicts, fresh?: boolean }`), `PlanVersion`; `plumbingProjectSchema.versions: z.array(versionSchema).default([])`; `plumbingProjectSchema.reimporting: z.object({ version: z.number().int().min(2), from: z.enum(['active', 'finalized']) }).optional()`; `plumbingProjectSchema.importBy: z.string().optional()`; `itemSchema.removedIn: z.number().int().min(2).optional()`; `itemSchema.conflict: z.object({ ours: z.string(), base: z.string(), theirs: z.string() }).optional()`. A `project.json` without them still loads.
  - `store/versions.ts`:
    - `type VersionDoc = 'original' | 'draft' | 'merged'`
    - `projectVersions(project: PlumbingProject): PlanVersion[]`
    - `currentVersion(project: PlumbingProject): PlanVersion`
    - `versionDocRel(n: number, which: VersionDoc): string`
    - `snapshotVersion(dir: string, n: number): Promise<string[]>`
    - `readVersionDoc(dir: string, project: PlumbingProject, n: number, which: VersionDoc): Promise<string | null>`
    - `planHash(text: string): string`
  - `git.ts`: `gitHead(cwd: string): Promise<string | null>`.
  - `schemas/views.ts`: `ProjectHome.version: { current: number; count: number }`, and `export type VersionSummary = PlanVersion & { current: boolean };`, which Task 6's versions route returns and Task 8's Versions pages show.
- **Behaviour:**
  - **`projectVersions`:** `project.versions` sorted by `n` when it isn't empty. Otherwise one synthesised v1: `{ n: 1, at: project.createdAt, hash: source.hashAtImport, clone: source.clone, branch: source.branch, commit: null }`, with no `merge` key.
  - **`currentVersion`:** the last of `projectVersions`.
  - **`snapshotVersion`:**
    - It reads `project.json` for the working files' paths (`docs.original`, `docs.draft`), and copies them byte for byte (read as a Buffer, written with `writeFileAtomic`) to `docs/versions/v<n>/original.md` and `draft.md`, then every `items/*.json` to `docs/versions/v<n>/items/`, so what the threads settled in the items is kept too. It returns the paths it wrote in that order: `['docs/versions/v<n>/original.md', 'docs/versions/v<n>/draft.md', …items]`.
    - It refuses with ConflictError "Version <n> is already saved in docs/versions/v<n>." when that folder already has an `original.md` or a `draft.md`, and writes nothing. Other files may be there: the `merged.md` of the update that brought v<n> in, and the journal of the update now running (Task 4).
    - If a copy fails, it removes what it wrote, then `rmdir`s `docs/versions/v<n>/items`, `docs/versions/v<n>` and `docs/versions` (which only removes them when empty), and rethrows. On success the only new paths are those folders and the files it returns.
  - **`readVersionDoc`:** null for an `n` that `projectVersions` doesn't list. For the current version's `original` or `draft` it reads the working file (`project.docs[which]`); for an older one, the snapshot. `merged` is always `docs/versions/v<n>/merged.md`, which v1 doesn't have. A file that can't be read gives null. Nothing lists a version folder's files, so the `items/` copy is never taken for a document.
  - **`planHash`:** sha256 hex. `openPlan`'s `source.hashAtImport` now uses it, so the two can never drift apart.
  - **`gitHead`:** `git rev-parse HEAD` in `cwd`. It's null on any failure (not a clone, or a clone with no commit yet), and null unless the output is 40 to 64 lowercase hex characters.
  - **`ProjectHome.version`:** `{ current: currentVersion(project).n, count: projectVersions(project).length }`. A fresh project is `{ current: 1, count: 1 }`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/versions.test.ts`:
```ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gitHead } from '../src/git';
import type { PlanVersion } from '../src/schemas';
import { ConflictError, readProjectFile, writeProjectFile } from '../src/store/io';
import { openPlan } from '../src/store/open';
import { currentVersion, planHash, projectVersions, readVersionDoc, snapshotVersion, versionDocRel } from '../src/store/versions';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';
import { DRAFT, makeRepo, pair, seedProject } from './fixtures';

afterAll(removeTempDirs);

const V1: PlanVersion = { n: 1, at: '2026-10-01T09:00:00.000Z', hash: 'x', clone: '/tmp/acme', branch: 'main', commit: null };
const V2: PlanVersion = {
  n: 2,
  at: '2026-10-05T09:00:00.000Z',
  hash: 'y',
  clone: '~/Source/acme',
  branch: 'main',
  commit: '0123456789abcdef0123456789abcdef01234567',
  merge: { clean: 2, conflicts: 1 },
};

/** Every file under a folder, as bytes in base64, and every folder, by path relative to it. */
async function snapshot(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out[path.relative(root, p)] = 'folder';
        await walk(p);
      } else {
        out[path.relative(root, p)] = (await fs.readFile(p)).toString('base64');
      }
    }
  };
  await walk(root);
  return out;
}

const refusal = (p: Promise<unknown>) => p.then(() => null, (e: Error) => ({ type: e.constructor.name, message: e.message }));

describe('plan versions', () => {
  it('reads v1 from the source of a project that was never updated', async () => {
    const dir = await seedProject();
    const project = await readProjectFile(dir);
    expect(projectVersions(project)).toEqual([V1]);
    expect(currentVersion(project)).toEqual(V1);
    expect('merge' in currentVersion(project)).toBe(false);
  });

  it('loads a project.json from before versions', async () => {
    const dir = await seedProject();
    const file = path.join(dir, 'project.json');
    const { versions: _versions, ...old } = JSON.parse(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, JSON.stringify(old));
    const project = await readProjectFile(dir);
    expect(project.versions).toEqual([]);
    expect(project.reimporting).toBeUndefined();
    expect(currentVersion(project).n).toBe(1);
  });

  it('lists the versions oldest first, and the current one is the newest', async () => {
    const dir = await seedProject({ project: { versions: [V2, V1] } });
    const project = await readProjectFile(dir);
    expect(projectVersions(project)).toEqual([V1, V2]);
    expect(currentVersion(project)).toEqual(V2);
    expect(versionDocRel(2, 'draft')).toBe('docs/versions/v2/draft.md');
    expect(versionDocRel(1, 'original')).toBe('docs/versions/v1/original.md');
    expect(versionDocRel(2, 'merged')).toBe('docs/versions/v2/merged.md');
  });

  it('snapshots the plan and the draft byte for byte, and writes nothing else', async () => {
    const draft = 'Remind customers – before it runs out.\r\nNo newline at the end';
    const dir = await seedProject({ draft });
    await fs.writeFile(path.join(dir, 'docs', 'original.md'), DRAFT);
    const before = await snapshot(dir);
    expect(await snapshotVersion(dir, 1)).toEqual(['docs/versions/v1/original.md', 'docs/versions/v1/draft.md']);
    expect(await fs.readFile(path.join(dir, 'docs', 'versions', 'v1', 'original.md'))).toEqual(await fs.readFile(path.join(dir, 'docs', 'original.md')));
    expect(await fs.readFile(path.join(dir, 'docs', 'versions', 'v1', 'draft.md'))).toEqual(Buffer.from(draft));
    const after = await snapshot(dir);
    expect(Object.keys(after).filter((k) => !(k in before)).sort()).toEqual([
      path.join('docs', 'versions'),
      path.join('docs', 'versions', 'v1'),
      path.join('docs', 'versions', 'v1', 'draft.md'),
      path.join('docs', 'versions', 'v1', 'original.md'),
    ]);
    for (const [k, v] of Object.entries(before)) expect(after[k], k).toBe(v);
  });

  it('keeps a copy of the items too, so what the threads settled is kept', async () => {
    const dir = await seedProject({ pairs: [pair('q1'), pair('q2', { title: 'Who gets reminders?' })] });
    expect(await snapshotVersion(dir, 1)).toEqual([
      'docs/versions/v1/original.md',
      'docs/versions/v1/draft.md',
      'docs/versions/v1/items/q1.json',
      'docs/versions/v1/items/q2.json',
    ]);
    for (const id of ['q1', 'q2']) {
      expect(await fs.readFile(path.join(dir, 'docs', 'versions', 'v1', 'items', `${id}.json`))).toEqual(await fs.readFile(path.join(dir, 'items', `${id}.json`)));
    }
  });

  it('never overwrites a snapshot, but writes beside an update\'s merged draft', async () => {
    const dir = await seedProject();
    await snapshotVersion(dir, 1);
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), 'A newer draft.\n');
    const before = await snapshot(dir);
    expect(await refusal(snapshotVersion(dir, 1))).toEqual({ type: 'ConflictError', message: 'Version 1 is already saved in docs/versions/v1.' });
    expect(await snapshot(dir)).toEqual(before);
    await expect(snapshotVersion(dir, 1)).rejects.toBeInstanceOf(ConflictError);
    // v2's folder already holds the draft as its update merged it, and the next update's journal.
    await fs.mkdir(path.join(dir, 'docs', 'versions', 'v2'));
    await fs.writeFile(path.join(dir, 'docs', 'versions', 'v2', 'merged.md'), 'As merged.\n');
    await fs.writeFile(path.join(dir, 'docs', 'versions', 'v2', 'update.json'), '{}');
    expect(await snapshotVersion(dir, 2)).toEqual(['docs/versions/v2/original.md', 'docs/versions/v2/draft.md']);
    expect(await fs.readFile(path.join(dir, 'docs', 'versions', 'v2', 'merged.md'), 'utf8')).toBe('As merged.\n');
  });

  it('takes back what it wrote when a copy fails', async () => {
    const dir = await seedProject();
    await fs.rm(path.join(dir, 'docs', 'draft.md'));
    const before = await snapshot(dir);
    await expect(snapshotVersion(dir, 1)).rejects.toThrow(/ENOENT/);
    expect(await snapshot(dir)).toEqual(before);
  });

  it("reads the current version's working files, an older version's snapshot, and nothing for a version it doesn't have", async () => {
    const dir = await seedProject();
    await snapshotVersion(dir, 1);
    await fs.writeFile(path.join(dir, 'docs', 'original.md'), '# Restock reminders\n\nThe repo, v2.\n');
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), '# Restock reminders\n\nThe draft, v2.\n');
    await fs.mkdir(path.join(dir, 'docs', 'versions', 'v2'));
    await fs.writeFile(path.join(dir, 'docs', 'versions', 'v2', 'merged.md'), '# Restock reminders\n\nAs the update merged it.\n');
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), versions: [V1, V2] });
    const project = await readProjectFile(dir);
    expect(await readVersionDoc(dir, project, 2, 'original')).toBe('# Restock reminders\n\nThe repo, v2.\n');
    expect(await readVersionDoc(dir, project, 2, 'draft')).toBe('# Restock reminders\n\nThe draft, v2.\n');
    expect(await readVersionDoc(dir, project, 1, 'original')).toBe(DRAFT);
    expect(await readVersionDoc(dir, project, 1, 'draft')).toBe(DRAFT);
    // What the update to v2 left in the draft, kept in v2's own folder. v1 is the import, so it has none.
    expect(await readVersionDoc(dir, project, 2, 'merged')).toBe('# Restock reminders\n\nAs the update merged it.\n');
    expect(await readVersionDoc(dir, project, 1, 'merged')).toBeNull();
    expect(await readVersionDoc(dir, project, 3, 'draft')).toBeNull();
    expect(await readVersionDoc(dir, project, 0, 'draft')).toBeNull();
    await fs.rm(path.join(dir, 'docs', 'versions', 'v1', 'draft.md'));
    expect(await readVersionDoc(dir, project, 1, 'draft')).toBeNull();
  });

  it('hashes a plan with sha256, as the import always has', async () => {
    expect(planHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const folder = path.join(tempDir('dp-open-'), 'acme');
    const opened = await openPlan({ folder, repo: 'acme', clone: '/c', branch: 'main', plan: { rel: 'docs/specs/restock.md', text: DRAFT }, enabledTypes: [] });
    const project = await readProjectFile(opened.dir);
    expect(project.source.hashAtImport).toBe(planHash(DRAFT));
    expect(project.versions).toEqual([]);
    expect(currentVersion(project).hash).toBe(planHash(DRAFT));
  });
});

describe('the commit a version came from', () => {
  it("is the clone's HEAD, and null before the first commit or outside a clone", async () => {
    const repo = makeRepo();
    expect(await gitHead(repo)).toBeNull();
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Acme', '-c', 'user.email=dev@acme.test', '-c', 'commit.gpgsign=false', ...args], { cwd: repo }).toString().trim();
    git('add', '-A');
    git('commit', '-q', '-m', 'Add the plan');
    const head = git('rev-parse', 'HEAD');
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(await gitHead(repo)).toBe(head);
    expect(await gitHead(path.join(repo, 'docs'))).toBe(head);
    expect(await gitHead(tempDir('dp-not-a-repo-'))).toBeNull();
  });
});
```

In `packages/core/test/projects.test.ts`, add this `describe` at the end of the file, after the closing `});` of `describe('the project home for Finalize', …)`:
```ts

describe('the project home for plan versions', () => {
  it('says which version of the plan the project is at, and how many there are', async () => {
    const dir = await seedProject();
    const restock = { repo: 'acme', id: 'restock', dir };
    expect((await loadProjectHome(restock, TYPES)).version).toEqual({ current: 1, count: 1 });
    const v = { at: '2026-10-05T09:00:00.000Z', clone: '/tmp/acme', branch: 'main', commit: null };
    const versions = [{ ...v, n: 1, hash: 'x' }, { ...v, n: 2, hash: 'y', merge: { clean: 1, conflicts: 0 } }];
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), versions });
    expect((await loadProjectHome(restock, TYPES)).version).toEqual({ current: 2, count: 2 });
  });
});
```
(`seedProject`, `TYPES`, `loadProjectHome`, `readProjectFile` and `writeProjectFile` are already imported there.)

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/versions.test.ts packages/core/test/projects.test.ts`
Expected: FAIL. `versions.test.ts` doesn't load: `Error: Cannot find module '../src/store/versions'`. In `projects.test.ts`, the new test fails with `expected undefined to deeply equal { current: 1, count: 1 }`; the other 24 pass.

- [ ] **Step 3: Add the version fields to the schema**

In `packages/core/src/schemas/project.ts`, add `versionSchema` just before `export const plumbingProjectSchema = z.object({`:
```ts
/** One version of the repo's plan. v1 is the import; each update that brings a changed plan in adds the next. */
export const versionSchema = z.object({
  n: z.number().int().min(1),
  /** When it came in. v1's is the project's createdAt. */
  at: z.string(),
  /** sha256 hex of the repo's plan text, as source.hashAtImport is for v1. */
  hash: z.string(),
  /** The clone it was read from, ~-shortened. */
  clone: z.string(),
  branch: z.string(),
  /** HEAD of that clone when it was read, or null when it isn't known. */
  commit: z.string().nullable(),
  /**
   * How the update brought it into the draft: `clean` changes merged and `conflicts` left to settle, or `fresh` when
   * the draft was started again from this version. Absent for v1.
   */
  merge: z.object({ clean: z.number().int().min(0), conflicts: z.number().int().min(0), fresh: z.boolean().optional() }).optional(),
});
export type PlanVersion = z.infer<typeof versionSchema>;

```

In `plumbingProjectSchema`, replace:
```ts
  /** Plumbing types whose importer hasn't written yet. */
  importPending: z.array(z.string()).default([]),
  createdAt: z.string(),
```
with:
```ts
  /** Plumbing types whose importer hasn't written yet. */
  importPending: z.array(z.string()).default([]),
  /** Every version of the plan, oldest first. Empty means the project is still at v1, read from `source`. */
  versions: z.array(versionSchema).default([]),
  /** Set while the importers re-run after an update: the version they import, and the status to go back to. */
  reimporting: z.object({ version: z.number().int().min(2), from: z.enum(['active', 'finalized']) }).optional(),
  /** While importing: the Claude window that runs the importers. Only it, or another once it's gone, ends the import. */
  importBy: z.string().optional(),
  createdAt: z.string(),
```

In `itemSchema`, replace:
```ts
    /** "May need another look": set when another thread's reply says it might affect this item. */
    flags: z.array(itemFlagSchema).optional(),
  })
  .passthrough();
```
with:
```ts
    /** "May need another look": set when another thread's reply says it might affect this item. */
    flags: z.array(itemFlagSchema).optional(),
    /** An imported item whose part of the plan was removed in this version. It's parked, never deleted. */
    removedIn: z.number().int().min(2).optional(),
    /** A Plan changes item: the passage as your draft, the old plan and the repo's new version had it. */
    conflict: z.object({ ours: z.string(), base: z.string(), theirs: z.string() }).optional(),
  })
  .passthrough();
```

`schemas/index.ts` already exports `./project`, so `versionSchema` and `PlanVersion` reach `@dev-plumbing/core/schemas`.

- [ ] **Step 4: Write the version helpers**

`packages/core/src/store/versions.ts`:
```ts
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../atomic';
import type { PlanVersion, PlumbingProject } from '../schemas';
import { ConflictError, docPath, readProjectFile } from './io';

// The plan's version trail. docs/original.md and docs/draft.md always hold the current version; before an update
// brings the next one in, they're copied to docs/versions/v<n>/, so every earlier version's plan and draft stay readable.

/** sha256 hex of a plan's text. source.hashAtImport and each version's hash use it. */
export function planHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** The project's versions, oldest first. A project that was never updated is at v1, read from `source`. */
export function projectVersions(project: PlumbingProject): PlanVersion[] {
  if (project.versions.length) return [...project.versions].sort((a, b) => a.n - b.n);
  const { source } = project;
  return [{ n: 1, at: project.createdAt, hash: source.hashAtImport, clone: source.clone, branch: source.branch, commit: null }];
}

/** The version the working files hold: the newest one. */
export function currentVersion(project: PlumbingProject): PlanVersion {
  return projectVersions(project).at(-1)!;
}

/**
 * A version's documents: its plan (`original`) and draft, and `merged`, the draft as the update that brought it in
 * left it, before anyone changed it.
 */
export type VersionDoc = 'original' | 'draft' | 'merged';

/** docs/versions/v<n>/<which>.md, relative to the project folder. */
export function versionDocRel(n: number, which: VersionDoc): string {
  return `docs/versions/v${n}/${which}.md`;
}

/**
 * Copies the working plan and draft to docs/versions/v<n>/, byte for byte, and the items to docs/versions/v<n>/items/,
 * so what the threads had settled is kept too. Returns every path it wrote, original and draft first. Refuses when the
 * folder already has an original.md or a draft.md, so a snapshot is never overwritten; the update's merged.md and its
 * journal may be there. If a copy fails, what it wrote is removed again.
 */
export async function snapshotVersion(dir: string, n: number): Promise<string[]> {
  const folder = docPath(dir, `docs/versions/v${n}`);
  const present = await fs.readdir(folder).catch((): string[] => []);
  if (present.includes('original.md') || present.includes('draft.md')) throw new ConflictError(`Version ${n} is already saved in docs/versions/v${n}.`);
  const project = await readProjectFile(dir);
  const items = (await fs.readdir(docPath(dir, 'items')).catch((): string[] => [])).filter((f) => f.endsWith('.json')).sort();
  const copies: [string, string][] = [
    [project.docs.original, versionDocRel(n, 'original')],
    [project.docs.draft, versionDocRel(n, 'draft')],
    ...items.map((f): [string, string] => [`items/${f}`, `docs/versions/v${n}/items/${f}`]),
  ];
  const written: string[] = [];
  try {
    for (const [from, to] of copies) {
      await writeFileAtomic(docPath(dir, to), await fs.readFile(docPath(dir, from)));
      written.push(to);
    }
  } catch (error) {
    for (const rel of written) await fs.rm(docPath(dir, rel), { force: true }).catch(() => undefined);
    // The folders it made go too. rmdir only removes an empty folder, so other versions' snapshots stay.
    for (const made of [path.join(folder, 'items'), folder, path.dirname(folder)]) await fs.rmdir(made).catch(() => undefined);
    throw error;
  }
  return written;
}

/**
 * A version's plan (`original`) or draft: the working files for the current version, its snapshot for an older one.
 * `merged` is always read from the version's own folder: v1 has none. Null for a version the project doesn't have, or
 * a file that can't be read.
 */
export async function readVersionDoc(dir: string, project: PlumbingProject, n: number, which: VersionDoc): Promise<string | null> {
  if (!projectVersions(project).some((v) => v.n === n)) return null;
  const rel = which !== 'merged' && n === currentVersion(project).n ? project.docs[which] : versionDocRel(n, which);
  return fs.readFile(docPath(dir, rel), 'utf8').catch(() => null);
}
```

- [ ] **Step 5: Read the commit a clone is on**

At the end of `packages/core/src/git.ts`, after `gitInfo`, add:
```ts

/** The commit the clone is on (`git rev-parse HEAD`), or null when it can't be read: not a clone, or no commit yet. */
export async function gitHead(cwd: string): Promise<string | null> {
  const sha = await git(cwd, ['rev-parse', 'HEAD']);
  return sha && /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
}
```
`index.ts` already exports `./git`.

- [ ] **Step 6: Hash new projects with `planHash`, and give them an empty trail**

In `packages/core/src/store/open.ts`:
- Remove the first line, `import { createHash } from 'node:crypto';`.
- Replace:
```ts
import { InputError, readJsonFile, readProjectFile, writeProjectFile } from './io';
```
with:
```ts
import { InputError, readJsonFile, readProjectFile, writeProjectFile } from './io';
import { planHash } from './versions';
```
- In `openPlan`'s `project` literal, replace:
```ts
    source: { path: o.plan.rel, clone: tildify(o.clone, o.home), branch: o.branch, hashAtImport: createHash('sha256').update(o.plan.text).digest('hex') },
```
with:
```ts
    source: { path: o.plan.rel, clone: tildify(o.clone, o.home), branch: o.branch, hashAtImport: planHash(o.plan.text) },
```
- In the same literal, replace:
```ts
    importPending: o.enabledTypes,
    createdAt: at,
```
with:
```ts
    importPending: o.enabledTypes,
    versions: [],
    createdAt: at,
```

In `packages/core/test/fixtures.ts`, in `seedProject`'s `project` literal, replace:
```ts
    importPending: [],
    createdAt: '2026-10-01T09:00:00.000Z',
```
with:
```ts
    importPending: [],
    versions: [],
    createdAt: '2026-10-01T09:00:00.000Z',
```
(`versions` has a default, so `PlumbingProject` requires it in a literal. `core/src/demo.ts` writes plain JSON without it, which still loads.)

- [ ] **Step 7: Give the project home its version, and name a version in the list**

In `packages/core/src/schemas/views.ts`, replace:
```ts
import type { Item, PlumbingProject, Thread } from './project';
```
with:
```ts
import type { Item, PlanVersion, PlumbingProject, Thread } from './project';
```
In `ProjectHome`, replace:
```ts
  documents: { original: boolean; draft: boolean; final: boolean };
  listening?: ListeningState;
```
with:
```ts
  documents: { original: boolean; draft: boolean; final: boolean };
  /** The plan version the working original and draft hold, and how many versions there are (1 until an update). */
  version: { current: number; count: number };
  listening?: ListeningState;
```
and just after `ProjectHome`, replace:
```ts
export type OpenOptions = { messageId: string; options: Option[]; recommended?: string };
```
with:
```ts
/** One version in the Versions list (GET …/versions, newest first). `current` marks the one the working files hold. */
export type VersionSummary = PlanVersion & { current: boolean };

export type OpenOptions = { messageId: string; options: Option[]; recommended?: string };
```

In `packages/core/src/store/projects.ts`, replace:
```ts
import { openOptions } from './threads';
```
with:
```ts
import { openOptions } from './threads';
import { currentVersion, projectVersions } from './versions';
```
and at the end of `loadProjectHome`, replace:
```ts
  return { summary, project, types: typeEntries, inbox, documents, finalize };
```
with:
```ts
  const version = { current: currentVersion(project).n, count: projectVersions(project).length };
  return { summary, project, types: typeEntries, inbox, documents, version, finalize };
```

The web's tests build `ProjectHome` objects with `as unknown as ProjectHome`, so they still typecheck.

- [ ] **Step 8: Export the helpers**

In `packages/core/src/index.ts`, replace:
```ts
export * from './store/open';
```
with:
```ts
export * from './store/open';
export * from './store/versions';
```

- [ ] **Step 9: Run the tests**

Run: `pnpm vitest run packages/core/test/versions.test.ts packages/core/test/projects.test.ts packages/core/test/open.test.ts`
Expected: PASS (10, 25 and 16 tests).

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/schemas/project.ts packages/core/src/schemas/views.ts packages/core/src/store/versions.ts packages/core/src/git.ts packages/core/src/store/open.ts packages/core/src/store/projects.ts packages/core/src/index.ts packages/core/test/fixtures.ts packages/core/test/versions.test.ts packages/core/test/projects.test.ts
git commit -m "feat(core): a project keeps a trail of plan versions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The three-way merge

An update merges the repo's new plan into your draft with `git merge-file`, three ways: the old plan is the base, your draft is ours and the repo's text is theirs. Clean changes go in; at each conflict the draft keeps your text, so no conflict marker ever reaches it, and the conflict comes back to Task 4 to become a Plan changes thread.

**Files:**
- Create:
  - `packages/core/src/merge.ts`
  - `packages/core/src/merge.test.ts` (next to the code, as `finalExport.test.ts` is)
- Modify:
  - `packages/core/src/index.ts` (export `./merge`)
- Test:
  - `packages/core/src/merge.test.ts`

**Interfaces:**
- Consumes (Plans 1–4): `diffText(before, after): DiffSegment[]` (`docDiff.ts`); `headingsOf(md): { level, text, line }[]` (`schemas/markdown.ts`: ATX headings, skipping fenced code, `line` 0-based); `tempDir`/`removeTempDirs` in the tests.
- Produces, exactly as in the header's Contracts:
  ```ts
  export type MergeConflict = { heading: string | null; ours: string; base: string; theirs: string; movedTo?: string };
  export type MergeResult = { text: string; clean: number; conflicts: MergeConflict[] };
  export async function mergePlan(o: { base: string; ours: string; theirs: string }): Promise<MergeResult>;
  export class MergeError extends Error {}
  ```
- **Behaviour:**
  - `\r\n` becomes `\n` on all three sides. A side that doesn't end with a newline gets one before the merge, so a last line merges like any other.
  - The three texts go into a `fs.mkdtemp(path.join(path.resolve(os.tmpdir()), 'dp-merge-'))` folder as `draft.md`, `original.md` and `repo.md`, and the folder is removed in `finally`, after a success or a failure. The folder is made absolute, so a relative `TMPDIR` still works with git's `cwd`.
  - It runs `execFile('git', ['merge-file', '-p', '--diff3', '--marker-size=31', '-L', 'draft', '-L', 'original', '-L', 'repo', <draft.md>, <original.md>, <repo.md>], { cwd: <the temp folder>, timeout: 20_000, maxBuffer: 16 MB })` through `promisify`, never a shell.
    - A resolved promise is a clean merge.
    - A rejection with a numeric `code` from 1 to 127 is a merge with that many conflicts, read from `err.stdout`.
    - Anything else is a `MergeError`:
      - "The merge needs git, and git wasn't found on this Mac." when `code` is `'ENOENT'`;
      - "git merge-file took more than 20 seconds, so the merge was stopped." when the timeout killed it;
      - otherwise "git merge-file failed: <the first line of stderr>", or `exit code <n>` when stderr is empty.
  - **Parsing:** the markers are exactly `'<'.repeat(31) + ' draft'`, `'|'.repeat(31) + ' original'`, `'='.repeat(31)` and `'>'.repeat(31) + ' repo'`, each a whole line. Every other line is text. Each conflict is resolved to its `ours` lines. Output that ends inside a conflict is a `MergeError`.
  - **`MergeConflict` texts** are each side's lines joined with `\n`: no trailing newline, unless the passage itself ends with a blank line (see "the draft deleted it" below, where `base` is `'Log reminders in a table.\n'`). A side with no lines is `''`.
  - **`heading`** is the text (without its `#`s) of the conflict's own heading when the first non-blank line of the draft's side is a heading, else of the nearest heading above the conflict in the merged `text`, or null. Headings are read with `headingsOf`, so a `#` line in fenced code isn't one.
  - **`movedTo`:** when the repo's side is empty and the conflict's trimmed `base` appears elsewhere in the merged `text` (not where the conflict is), the repo moved the passage there, and the draft has both copies. `movedTo` is the heading of where it appears (its own first line, when that's a heading, else the nearest one above). It's left out otherwise.
  - **`text`** ends with a newline when the repo's text (after `\r\n` → `\n`) does, and doesn't otherwise.
  - **`clean`** is the number of change blocks in `diffText(ours, merged text)` (runs of added or removed segments between `same` ones), both with a final newline: what the merge changed in the draft, which is what the user reads as "merged into your draft". Identical texts give `{ text, clean: 0, conflicts: [] }`.

**Facts checked for this task** (git 2.54 on macOS, run for real; every expected value in the tests below comes from a real run):
- `git merge-file -p` works outside a repo and prints the merge on stdout. Its exit code is the number of conflicts (capped at 127). Under `promisify(execFile)`, a merge with conflicts rejects with `err.code` set to that number and the whole merge in `err.stdout`; a missing input file exits 255 with `error: Could not stat …` on stderr.
- Without git on the `PATH`, the rejection's `code` is the string `'ENOENT'`. A timeout gives `killed: true`, `signal: 'SIGTERM'` and `code: null`. Too much output gives `code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'`.
- With `--diff3 --marker-size=31 -L draft -L original -L repo`, a conflict reads:
  ```
  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< draft
  alpha mine
  ||||||||||||||||||||||||||||||| original
  alpha
  ===============================
  alpha theirs
  >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> repo
  ```
  The `=` line has no label.
- When a side's last line has no newline, git adds one before a marker that follows it, but keeps a clean ending as it was. So `mergePlan` gives every side a final newline first (which also keeps `diffText` from counting a missing newline as a change), and then sets the text's ending from the repo's.
- The same change on both sides merges cleanly. Edits to touching lines conflict.
- With `--marker-size=7`, a plan's own `=======` line inside a conflict is read as the separator, and that conflict's base and theirs come out wrong. The "seven-character conflict lines" test catches it; with 31 it passes.
- `os.tmpdir()` reads `TMPDIR` on every call, so a test can point it at its own empty folder and check that nothing is left there. A `PATH` holding only a fake `git` script makes git fail on demand. A relative `TMPDIR` gives a relative folder, which git, run with that folder as its `cwd`, can't find ("Could not stat"), so the folder is resolved first.
- A section the repo moves up the plan, word for word, while the draft edited it where it was: the move's insertion merges cleanly, and the deletion conflicts with the draft's edit, its `ours` starting with the blank line before `## Channels` and its `theirs` empty. Resolved to ours, the draft has the section twice.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/merge.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MergeError, mergePlan } from './merge';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

const PLAN = [
  '# Restock reminders',
  '',
  'Remind customers before a subscription item runs out.',
  '',
  '## Approach',
  '',
  'A daily job finds subscriptions due soon and sends a reminder.',
  '',
  '## Data',
  '',
  'Log reminders in a table.',
  '',
  '## Channels',
  '',
  'Send by email.',
  '',
].join('\n');

/** `text` with `from` replaced by `to`, once. Throws when `from` isn't there, so a test can't edit nothing by mistake. */
function edit(text: string, ...pairs: [string, string][]): string {
  return pairs.reduce((t, [from, to]) => {
    if (!t.includes(from)) throw new Error(`"${from}" isn't in the text.`);
    return t.replace(from, to);
  }, text);
}

const APPROACH = 'A daily job finds subscriptions due soon and sends a reminder.';
/** Any line git could have left: seven or more of <, |, = or > at its start. */
const MARKER = /^(<{7}|\|{7}|={7}|>{7})/m;

describe('merging the repo plan into the draft', () => {
  it('takes both sides when they changed different sections', async () => {
    const ours = edit(PLAN, ['due soon', 'due in the next 3 days']);
    const theirs = edit(PLAN, ['Log reminders in a table.', 'Log each reminder in a RestockReminder table.'], ['Send by email.', 'Send by email and SMS.']);
    expect(await mergePlan({ base: PLAN, ours, theirs })).toEqual({
      text: edit(PLAN, ['due soon', 'due in the next 3 days'], ['Log reminders in a table.', 'Log each reminder in a RestockReminder table.'], ['Send by email.', 'Send by email and SMS.']),
      clean: 2,
      conflicts: [],
    });
  });

  it("takes the repo's changes when the draft didn't change", async () => {
    const theirs = edit(PLAN, ['Send by email.', 'Send by email and SMS.']);
    expect(await mergePlan({ base: PLAN, ours: PLAN, theirs })).toEqual({ text: theirs, clean: 1, conflicts: [] });
  });

  it("keeps the draft when the repo didn't change", async () => {
    const ours = edit(PLAN, ['Send by email.', 'Send by email and SMS.']);
    expect(await mergePlan({ base: PLAN, ours, theirs: PLAN })).toEqual({ text: ours, clean: 0, conflicts: [] });
  });

  it('changes nothing when nothing changed', async () => {
    expect(await mergePlan({ base: PLAN, ours: PLAN, theirs: PLAN })).toEqual({ text: PLAN, clean: 0, conflicts: [] });
  });

  it('keeps the draft where both changed the same passage, and says what each side had', async () => {
    const ours = edit(PLAN, ['due soon and sends a reminder.', 'due in 3 days and texts a reminder.']);
    const theirs = edit(PLAN, ['due soon and sends a reminder.', 'due soon and emails a reminder.'], ['Send by email.', 'Send by email and push.']);
    expect(await mergePlan({ base: PLAN, ours, theirs })).toEqual({
      text: edit(ours, ['Send by email.', 'Send by email and push.']),
      clean: 1,
      conflicts: [
        {
          heading: 'Approach',
          ours: 'A daily job finds subscriptions due in 3 days and texts a reminder.',
          base: APPROACH,
          theirs: 'A daily job finds subscriptions due soon and emails a reminder.',
        },
      ],
    });
  });

  it('lists two conflicts in the order they come', async () => {
    const ours = edit(PLAN, ['sends a reminder.', 'texts a reminder.'], ['in a table.', 'in a reminders table.']);
    const theirs = edit(PLAN, ['sends a reminder.', 'emails a reminder.'], ['in a table.', 'in the audit log.']);
    const r = await mergePlan({ base: PLAN, ours, theirs });
    expect(r.text).toBe(ours);
    expect(r.clean).toBe(0);
    expect(r.conflicts).toEqual([
      { heading: 'Approach', ours: 'A daily job finds subscriptions due soon and texts a reminder.', base: APPROACH, theirs: 'A daily job finds subscriptions due soon and emails a reminder.' },
      { heading: 'Data', ours: 'Log reminders in a reminders table.', base: 'Log reminders in a table.', theirs: 'Log reminders in the audit log.' },
    ]);
  });

  it('keeps a passage the draft deleted deleted, when the repo changed it', async () => {
    const ours = edit(PLAN, ['Log reminders in a table.\n\n', '']);
    const theirs = edit(PLAN, ['Log reminders in a table.', 'Log reminders in a table, with the send time.']);
    expect(await mergePlan({ base: PLAN, ours, theirs })).toEqual({
      text: ours,
      clean: 0,
      conflicts: [{ heading: 'Data', ours: '', base: 'Log reminders in a table.\n', theirs: 'Log reminders in a table, with the send time.\n' }],
    });
  });

  it("puts a conflict on a heading under the draft's heading", async () => {
    const ours = edit(PLAN, ['## Data\n\nLog reminders in a table.', '## Storage\n\nKeep reminders in a table.']);
    const theirs = edit(PLAN, ['## Data', '## Data model']);
    expect(await mergePlan({ base: PLAN, ours, theirs })).toEqual({
      text: ours,
      clean: 0,
      conflicts: [{ heading: 'Storage', ours: '## Storage', base: '## Data', theirs: '## Data model' }],
    });
  });

  it('says where the repo moved a passage the draft edited, since the draft then has both copies', async () => {
    const CHANNELS = '## Channels\n\nSend by email.\n\n';
    const ours = edit(PLAN, ['Send by email.', 'Send by email, and by SMS for opted-in customers.']);
    // The repo moves Channels up, unchanged, and the plan now ends with Data.
    const theirs = edit(PLAN, ['## Approach', `${CHANNELS}## Approach`], ['Log reminders in a table.\n\n## Channels\n\nSend by email.\n', 'Log reminders in a table.\n']);
    const r = await mergePlan({ base: PLAN, ours, theirs });
    expect(r.text).toBe(edit(ours, ['## Approach', `${CHANNELS}## Approach`]));
    expect(r.text.match(/^## Channels$/gm)).toHaveLength(2);
    expect(r.conflicts).toEqual([
      {
        heading: 'Channels',
        ours: '\n## Channels\n\nSend by email, and by SMS for opted-in customers.',
        base: '\n## Channels\n\nSend by email.',
        theirs: '',
        movedTo: 'Channels',
      },
    ]);
  });

  it('merges Windows line endings as plain newlines', async () => {
    const crlf = (s: string) => s.replace(/\n/g, '\r\n');
    const ours = edit(PLAN, ['due soon and sends a reminder.', 'due in 3 days and texts a reminder.']);
    const theirs = edit(PLAN, ['due soon and sends a reminder.', 'due soon and emails a reminder.']);
    const r = await mergePlan({ base: crlf(PLAN), ours: crlf(ours), theirs: crlf(theirs) });
    expect(r.text).toBe(ours);
    expect(r.conflicts).toEqual([
      { heading: 'Approach', ours: 'A daily job finds subscriptions due in 3 days and texts a reminder.', base: APPROACH, theirs: 'A daily job finds subscriptions due soon and emails a reminder.' },
    ]);
  });

  it("ends the text with a newline only when the repo's plan does", async () => {
    expect(await mergePlan({ base: 'a\nb', ours: 'a\nb mine', theirs: 'a\nb theirs' })).toEqual({
      text: 'a\nb mine',
      clean: 0,
      conflicts: [{ heading: null, ours: 'b mine', base: 'b', theirs: 'b theirs' }],
    });
    expect((await mergePlan({ base: 'a\nb', ours: 'a mine\nb', theirs: 'a\nb\n' })).text).toBe('a mine\nb\n');
    expect((await mergePlan({ base: 'a\nb\n', ours: 'a mine\nb\n', theirs: 'a\nb' })).text).toBe('a mine\nb');
  });

  it("reads a plan's own seven-character conflict lines as text", async () => {
    const fenced = ['# Merging', '', '## Example', '', '```', '<<<<<<< HEAD', 'mine', '=======', 'theirs', '>>>>>>> main', '```', ''].join('\n');
    // Both sides change the lines around the plan's own =======, so it sits inside the conflict, on every side.
    const ours = edit(fenced, ['mine\n=======\ntheirs\n', 'my change\n=======\ntheirs too\n']);
    const theirs = edit(fenced, ['mine\n=======\ntheirs\n', 'mine\n-------\ntheirs\n']);
    expect(await mergePlan({ base: fenced, ours, theirs })).toEqual({
      text: ours,
      clean: 0,
      conflicts: [{ heading: 'Example', ours: 'my change\n=======\ntheirs too', base: 'mine\n=======\ntheirs', theirs: 'mine\n-------\ntheirs' }],
    });
  });

  it('removes its temp folder after a merge, and after git fails', async () => {
    const tmp = tempDir('dp-merge-tmp-');
    const fake = tempDir('dp-fake-git-');
    await fs.writeFile(path.join(fake, 'git'), '#!/bin/sh\necho "fatal: not today" >&2\nexit 255\n', { mode: 0o755 });
    const env = { TMPDIR: process.env.TMPDIR, PATH: process.env.PATH };
    process.env.TMPDIR = tmp;
    try {
      const ours = edit(PLAN, ['sends a reminder.', 'texts a reminder.']);
      const theirs = edit(PLAN, ['sends a reminder.', 'emails a reminder.']);
      expect((await mergePlan({ base: PLAN, ours, theirs })).conflicts).toHaveLength(1);
      expect(await fs.readdir(tmp)).toEqual([]);
      // A relative TMPDIR works too.
      process.env.TMPDIR = path.relative(process.cwd(), tmp);
      expect((await mergePlan({ base: PLAN, ours, theirs })).conflicts).toHaveLength(1);
      expect(await fs.readdir(tmp)).toEqual([]);
      process.env.TMPDIR = tmp;
      // A git that fails with an exit code outside 1–127.
      process.env.PATH = fake;
      const failed = await mergePlan({ base: PLAN, ours, theirs }).catch((e: unknown) => e);
      expect(failed).toBeInstanceOf(MergeError);
      expect((failed as Error).message).toBe('git merge-file failed: fatal: not today');
      expect(await fs.readdir(tmp)).toEqual([]);
      // No git at all.
      process.env.PATH = tmp;
      await expect(mergePlan({ base: PLAN, ours, theirs })).rejects.toThrow("The merge needs git, and git wasn't found on this Mac.");
      expect(await fs.readdir(tmp)).toEqual([]);
    } finally {
      process.env.TMPDIR = env.TMPDIR;
      process.env.PATH = env.PATH;
    }
  });
});

/** A small seeded random number generator (mulberry32), so every run fuzzes the same 50 edits. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('the merge, fuzzed', () => {
  // 50 runs of git take about a second; the timeout leaves room for a busy machine.
  it('conflict markers never reach the draft', async () => {
    const next = random(5);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
    const WORDS = ['reminder', 'job', 'daily', 'email', 'SMS', 'table', 'customer', 'runs', 'out', 'soon', 'sends', 'logs'] as const;
    const sentence = () => `${Array.from({ length: 3 + Math.floor(next() * 5) }, () => pick(WORDS)).join(' ')}.`;
    /** Up to three edits near the middle of the plan, where both sides' edits often meet. */
    const editLines = (lines: string[]) => {
      const out = [...lines];
      for (let n = 1 + Math.floor(next() * 3); n > 0; n--) {
        const at = 4 + Math.floor(next() * 8);
        const op = next();
        if (op < 0.4) out[at] = sentence();
        else if (op < 0.7) out.splice(at, 1);
        else out.splice(at, 0, next() < 0.3 ? `## ${pick(WORDS)}` : sentence());
      }
      return out;
    };
    let conflicts = 0;
    for (let run = 0; run < 50; run++) {
      const base = ['# Plan', '', ...Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? `## Part ${i / 4 + 1}` : sentence()))];
      const ours = editLines(base);
      const theirs = editLines(base);
      const r = await mergePlan({ base: `${base.join('\n')}\n`, ours: `${ours.join('\n')}\n`, theirs: `${theirs.join('\n')}\n` });
      expect(r.text, `run ${run}`).not.toMatch(MARKER);
      expect(r.text.endsWith('\n'), `run ${run}`).toBe(true);
      // The draft keeps its own text at every conflict.
      for (const c of r.conflicts) expect(r.text, `run ${run}`).toContain(c.ours);
      conflicts += r.conflicts.length;
    }
    expect(conflicts).toBeGreaterThan(10);
  }, 30_000);
});
```

The fuzz uses a fixed seed, so it's the same 50 merges on every run (38 conflicts in all). None of its inputs has a line of seven `<`, `|`, `=` or `>`, so any such line in `text` came from git.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/src/merge.test.ts`
Expected: FAIL: the file doesn't load, with `Error: Cannot find module './merge'`.

- [ ] **Step 3: Write the merge**

`packages/core/src/merge.ts`:
```ts
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { diffText } from './docDiff';
import { headingsOf } from './schemas';

const run = promisify(execFile);

// git merge-file's markers. They're 31 characters long, so a plan's own line of seven < or = is never taken for one.
const START = `${'<'.repeat(31)} draft`;
const BASE = `${'|'.repeat(31)} original`;
const MIDDLE = '='.repeat(31);
const END = `${'>'.repeat(31)} repo`;

/**
 * One passage both sides changed: the draft's text (`ours`), the old plan's (`base`) and the repo's (`theirs`).
 * `movedTo` is set when the repo took the passage out here but has it, unchanged, elsewhere in the plan: the heading
 * it's under there. The draft then has both copies.
 */
export type MergeConflict = { heading: string | null; ours: string; base: string; theirs: string; movedTo?: string };
export type MergeResult = { text: string; clean: number; conflicts: MergeConflict[] };

/** The merge couldn't run: git is missing, it took too long, or it failed. */
export class MergeError extends Error {}

type ExecFailure = Error & { code?: number | string | null; killed?: boolean; stdout?: string; stderr?: string };

const lf = (text: string) => text.replace(/\r\n/g, '\n');
/** Every side ends with a newline, so a last line merges and diffs like any other. mergePlan sets the text's ending afterwards. */
const withNewline = (text: string) => (text && !text.endsWith('\n') ? `${text}\n` : text);

function mergeError(e: ExecFailure): MergeError {
  if (e.code === 'ENOENT') return new MergeError("The merge needs git, and git wasn't found on this Mac.");
  if (e.killed) return new MergeError('git merge-file took more than 20 seconds, so the merge was stopped.');
  const why = e.stderr?.trim().split('\n')[0] || (typeof e.code === 'number' ? `exit code ${e.code}` : e.message);
  return new MergeError(`git merge-file failed: ${why}`);
}

/** git merge-file's output, on three temp files that are always removed. Exit codes 1–127 count conflicts. */
async function mergeFile(ours: string, base: string, theirs: string): Promise<string> {
  // Absolute, so a relative TMPDIR still finds the files from git's cwd.
  const dir = await fs.mkdtemp(path.join(path.resolve(os.tmpdir()), 'dp-merge-'));
  try {
    const files = [path.join(dir, 'draft.md'), path.join(dir, 'original.md'), path.join(dir, 'repo.md')];
    await Promise.all([fs.writeFile(files[0], ours), fs.writeFile(files[1], base), fs.writeFile(files[2], theirs)]);
    const args = ['merge-file', '-p', '--diff3', '--marker-size=31', '-L', 'draft', '-L', 'original', '-L', 'repo', ...files];
    try {
      return (await run('git', args, { cwd: dir, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })).stdout;
    } catch (error) {
      const e = error as ExecFailure;
      if (typeof e.code === 'number' && e.code >= 1 && e.code <= 127 && typeof e.stdout === 'string') return e.stdout;
      throw mergeError(e);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

type Found = { start: number; ours: string[]; base: string[]; theirs: string[] };

/** The merge with every conflict resolved to the draft's side, and each conflict with where it starts in that text. */
function resolveToOurs(output: string): { text: string; found: Found[] } {
  const lines: string[] = [];
  const found: Found[] = [];
  let side: 'ours' | 'base' | 'theirs' | null = null;
  let current: Found = { start: 0, ours: [], base: [], theirs: [] };
  for (const line of output.split('\n')) {
    if (side === null && line === START) {
      current = { start: lines.length, ours: [], base: [], theirs: [] };
      side = 'ours';
    } else if (side === 'ours' && line === BASE) side = 'base';
    else if (side === 'base' && line === MIDDLE) side = 'theirs';
    else if (side === 'theirs' && line === END) {
      found.push(current);
      side = null;
    } else if (side === null) lines.push(line);
    else {
      current[side].push(line);
      if (side === 'ours') lines.push(line);
    }
  }
  if (side !== null) throw new MergeError("git merge-file's output ended inside a conflict.");
  return { text: lines.join('\n'), found };
}

/** How many change blocks there are from `before` to `after`: runs of added or removed lines between unchanged ones. */
function changeBlocks(before: string, after: string): number {
  let blocks = 0;
  let inBlock = false;
  for (const segment of diffText(before, after)) {
    if (segment.kind === 'same') inBlock = false;
    else if (!inBlock) {
      blocks++;
      inBlock = true;
    }
  }
  return blocks;
}

/**
 * Three-way merge with `git merge-file -p --diff3 --marker-size=31 -L draft -L original -L repo`.
 * `text` is the merge with every conflict resolved to `ours`, so no markers are left.
 * `clean` counts the change blocks the merge made in the draft: what you read as "merged into your draft".
 * `heading` is the conflict's own heading when the draft's side starts with one, else the nearest heading above it in
 * `text`, without its #s.
 */
export async function mergePlan(o: { base: string; ours: string; theirs: string }): Promise<MergeResult> {
  const base = withNewline(lf(o.base));
  const ours = withNewline(lf(o.ours));
  const theirs = lf(o.theirs);
  const merged = resolveToOurs(await mergeFile(ours, base, withNewline(theirs)));
  // The text ends with a newline when the repo's plan does.
  const text = theirs.endsWith('\n') || !merged.text.endsWith('\n') ? merged.text : merged.text.slice(0, -1);
  const headings = headingsOf(text);
  const lines = text.split('\n');
  /** Where line n starts in `text`. */
  const offsetOf = (n: number) => lines.slice(0, n).reduce((sum, line) => sum + line.length + 1, 0);
  /** The heading at line n when it's one, else the nearest one above it. */
  const headingAt = (n: number, inclusive: boolean) => [...headings].reverse().find((h) => (inclusive ? h.line <= n : h.line < n))?.text ?? null;
  const conflicts = merged.found.map((c): MergeConflict => {
    // A conflict whose draft side starts with a heading (after any blank lines) is under that heading.
    const first = c.ours.findIndex((line) => line.trim() !== '');
    const own = first >= 0 ? headings.find((h) => h.line === c.start + first) : undefined;
    const conflict: MergeConflict = { heading: own?.text ?? headingAt(c.start, false), ours: c.ours.join('\n'), base: c.base.join('\n'), theirs: c.theirs.join('\n') };
    // The repo took the passage out here. If it has the same text elsewhere, it moved it, and the draft has both copies.
    const moved = conflict.base.trim();
    if (!conflict.theirs.trim() && moved) {
      const from = offsetOf(c.start);
      const to = from + conflict.ours.length;
      let at = text.indexOf(moved);
      while (at >= 0 && at < to && at + moved.length > from) at = text.indexOf(moved, at + 1);
      const where = at >= 0 ? headingAt(text.slice(0, at).split('\n').length - 1, true) : null;
      if (where) conflict.movedTo = where;
    }
    return conflict;
  });
  return { text, clean: changeBlocks(ours, merged.text), conflicts };
}
```

- [ ] **Step 4: Export it**

In `packages/core/src/index.ts`, replace:
```ts
export * from './docDiff';
```
with:
```ts
export * from './docDiff';
export * from './merge';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/core/src/merge.test.ts`
Expected: PASS (14 tests). The fuzz takes about a second: it runs git 50 times, so it has a 30-second timeout for a busy machine.

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/merge.ts packages/core/src/merge.test.ts packages/core/src/index.ts
git commit -m "feat(core): merge the repo's new plan into the draft, three ways" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The built-in Plan changes type

Each conflict an update finds becomes an item of a new plumbing type, **Plan changes**, which ships in code rather than as a rules file, so it needs no setup and reaches users who set up long ago. It's kept out of every import and every list of rules files, shows in a project's navigation (first) only when the project has such items, blocks Finalize while one is unresolved, and never goes into the final. Claude can't make one in a reply either. Its rules are what a thread subagent follows: three choices, each ready to accept in one click (a merged version, the repo's version, and "Keep my draft", whose change is empty).

**Files:**
- Create:
  - `packages/core/src/planChanges.ts`
- Modify:
  - `packages/core/src/schemas/plumbingType.ts` (`builtIn`)
  - `packages/core/src/config.ts` (`loadConfig` adds the type; rules files are never built in)
  - `packages/core/src/store/checklist.ts` (an unresolved Plan changes item blocks)
  - `packages/core/src/store/context.ts` (`finalizePack` leaves Plan changes items out)
  - `packages/core/src/store/projects.ts` (a built-in type shows only with items)
  - `packages/core/src/index.ts` (export `./planChanges`)
  - `packages/service/src/routes/claude.ts` (`/open` and `/items` use `importableTypes`)
  - `packages/service/src/routes/config.ts` (the rules and config lists leave built-in types out)
  - `packages/core/src/store/reply.ts` (`newItems` refuses a built-in type)
  - `packages/core/test/fixtures.ts` and `packages/core/src/finalExport.test.ts` (their `PlumbingType` literals gain `builtIn: false`)
  - `packages/core/test/config.test.ts` (four existing expectations change: `loadConfig` now always has the built-in type)
- Test:
  - `packages/core/test/config.test.ts`
  - `packages/core/test/checklist.test.ts`
  - `packages/core/test/finalizePack.test.ts`
  - `packages/core/test/projects.test.ts`
  - `packages/core/test/reply.test.ts`
  - `packages/core/test/submit.test.ts`
  - `packages/service/test/claude.test.ts`
  - `packages/service/test/config.test.ts`

**Interfaces:**
- Consumes:
  - From Task 1: nothing. (`projects.test.ts` gets Task 1's `describe('the project home for plan versions', …)`; this task adds its own after it.)
  - From Task 2: nothing. (`index.ts` has Task 2's `export * from './merge';`, and this task's export goes after it.)
  - From Plans 1–4: `splitSections` and `resolveTypes` (`rules.ts`); `PlumbingType`, `plumbingTypeHeaderSchema`; `checklistFrom`/`blockingReason` (`store/checklist.ts`); `finalizePack` (`store/context.ts`); `loadProjectHome`, `loadTypeItems` (`store/projects.ts`); `postReply` (`store/reply.ts`) and `submit` (`store/submit.ts`); in the tests, `pair`, `seedProject`, `listType`, `TYPES` and `addDecision`.
- Produces, exactly as in the header's Contracts:
  ```ts
  // planChanges.ts
  export const PLAN_CHANGES = 'plan-changes';
  export const PLAN_CHANGES_TYPE: PlumbingType;   // file '', body = the rules text, builtIn: true
  export function importableTypes(types: PlumbingType[]): PlumbingType[];   // enabled && !builtIn && id !== PLAN_CHANGES
  export const CONFLICT_REASON = "Your draft and the repo's new version disagree here.";
  ```
  - `PlumbingTypeHeader` gains `builtIn: z.boolean().default(false)`, so `PlumbingType.builtIn` is a required `boolean`.
  - **The header:** `{ id: 'plan-changes', title: 'Plan changes', order: 0, screen: 'list', emptyMessage: "Nothing in the repo's new version conflicts with your draft.", fields: [], answerPresets: ['Keep my draft', "Take the repo's version"], timeline: false, enabled: true, builtIn: true }`, with `file: ''`, `body` = the rules text below, and `sections = splitSections(body)` (keys `What to look for`, `Rules`, `Done when`).
- **Behaviour:**
  - **`loadConfig`:**
    - Every type read from `plumbing/*.md` gets `builtIn: false`, whatever its header says, so no rules file can hide itself from imports and the rules list.
    - When no rules file loaded with the id `plan-changes`, `PLAN_CHANGES_TYPE` is added before `resolveTypes`, so it's sorted in with the rest: order 0 puts it first. A user's own `plumbing/plan-changes.md` that loads replaces it (theirs wins, with `builtIn: false`), and is still never imported (see `importableTypes`). One that's broken is listed as a problem, as any broken file is, and the built-in type is used.
  - **`importableTypes`** is `types.filter((t) => t.enabled && !t.builtIn && t.id !== PLAN_CHANGES)`. Plan changes items are made by an update, never by an importer, so a user's own `plan-changes.md` (`builtIn: false`) isn't imported either.
  - **Every list of types for importing, editing or turning on and off leaves out `builtIn`:**
    - `/api/claude/open`: `enabledTypes` (what a new project imports) and `importTypes` both come from `importableTypes(cfg.types)`.
    - `/api/claude/items`: the type must be in `importableTypes(cfg.types)`, else 400 `"<type>" isn't an enabled plumbing type.` (the existing message). `writeImportBatch` itself needs no change: a built-in type is never in `importPending`, so it refuses one anyway.
    - `GET /api/config` and `GET /api/rules` list `types` through `summaries`, which leaves out built-in types. `GET /api/rules/plan-changes.md` stays a 404, because it reads only the config folder. The web's Rules page and Settings read these two routes, so the web needs no change.
  - **`checklistFrom`:** in `blockingReason`, right after `with_claude` → "Claude is working on it.", an item of type `plan-changes` that isn't resolved blocks with `CONFLICT_REASON`. A parked one is listed under parked with "Parked.", as before, and a resolved one is on no list.
  - **`finalizePack`:** leaves `plan-changes` items out of `items`, so they're also out of `tokens`, `openItems` and the decisions about them.
  - **`loadProjectHome`:** a type with `builtIn` is in `types` only when the project has at least one item of it. `loadTypeItems` goes through `loadProjectHome`, so a project with no Plan changes items has no Plan changes screen (it's null, a 404 in the service).
  - **`postReply`:** a reply's `newItems` takes only the types `importableTypes` gives, so Claude can't make a Plan changes item (which would block Finalize). A built-in type gets the message a disabled one gets: `"<type>" isn't an enabled plumbing type. Use one of: …`, and the list leaves it out.
  - **"Keep my draft", ready to accept:** the Rules give it `change: { md: [] }`. That already works, with no change to the core: `postReply` accepts an empty `md` list (`changeProblems` checks patches only when there are some), and `submitThread` accepts it as a plain accept. It writes a history entry that changes nothing, adds the decision "<item title>: Keep my draft", resolves the thread and adds "Applied and resolved.". Two tests keep it that way.
  - **The Rules** (in `RULES` below): a thread with no message from the person gets three options, each with a `change`: `merged` ("Use the merged version", recommended), `theirs` ("Take the repo's version", left out when "Your draft" is "(nothing)" and no text next to it is unique) and `keep` ("Keep my draft", `change: { md: [] }`). Up to 20 patches, each `find` unique and in document order, split by paragraph when "Your draft" is over about 8,000 characters. A bullet says what to do when "The repo" is "(nothing)": deleted, or moved (the body then says where, and the merged version needs two patches).

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/config.test.ts`:
- Replace:
```ts
import { installDefaults, loadConfig, resetToDefault, updateSettingsFile } from '../src/config';
import { defaultSettings } from '../src/schemas';
```
with:
```ts
import { installDefaults, loadConfig, resetToDefault, updateSettingsFile } from '../src/config';
import { importableTypes, PLAN_CHANGES_TYPE } from '../src/planChanges';
import { defaultSettings } from '../src/schemas';
```
- In `it('loads the defaults with no problems', …)`, replace:
```ts
    expect(c.types).toHaveLength(10);
```
with:
```ts
    // The ten rules files, and the built-in Plan changes type first.
    expect(c.types).toHaveLength(11);
    expect(c.types[0]).toEqual(PLAN_CHANGES_TYPE);
    expect(importableTypes(c.types)).toHaveLength(10);
```
- In `it('works on an empty folder', …)` and in `it('loadConfig does not reject when plumbing is a regular file', …)`, replace:
```ts
    expect(c.types).toEqual([]);
```
with:
```ts
    expect(c.types).toEqual([PLAN_CHANGES_TYPE]);
```
- In `it('skips a broken rules file but keeps the others', …)`, replace:
```ts
    expect(c.types).toHaveLength(9);
```
with:
```ts
    expect(importableTypes(c.types)).toHaveLength(9);
```
- Add these two tests just before `it('reads repo profiles and reports broken or duplicate ones', …)`:
```ts
  it('adds the built-in Plan changes type, which a rules file of yours replaces', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    const c = await loadConfig(dir);
    expect(c.types.filter((t) => t.builtIn)).toEqual([PLAN_CHANGES_TYPE]);
    expect(PLAN_CHANGES_TYPE).toMatchObject({
      id: 'plan-changes',
      title: 'Plan changes',
      order: 0,
      screen: 'list',
      emptyMessage: "Nothing in the repo's new version conflicts with your draft.",
      fields: [],
      answerPresets: ['Keep my draft', "Take the repo's version"],
      timeline: false,
      enabled: true,
      builtIn: true,
      file: '',
    });
    expect(Object.keys(PLAN_CHANGES_TYPE.sections)).toEqual(['What to look for', 'Rules', 'Done when']);
    expect(PLAN_CHANGES_TYPE.sections.Rules).toContain('When the thread has no message from the person yet, reply with three options, each with a `change`');
    expect(PLAN_CHANGES_TYPE.sections.Rules).toContain('`keep`, "Keep my draft": `change: { md: [] }`.');
    expect(importableTypes(c.types).map((t) => t.id)).not.toContain('plan-changes');
    // Yours wins, and no rules file is built in, whatever its header says.
    await write('plumbing/plan-changes.md', '---\nid: plan-changes\ntitle: Repo changes\norder: 12\nscreen: list\nemptyMessage: None.\nbuiltIn: true\n---\n\n## Rules\n- Keep it short.\n');
    await write('plumbing/rollout.md', '---\nid: rollout\ntitle: Rollout\norder: 11\nscreen: list\nemptyMessage: None.\nbuiltIn: true\n---\n\n## Rules\n- Say who flips the flag.\n');
    const mine = await loadConfig(dir);
    expect(mine.problems).toEqual([]);
    expect(mine.types.filter((t) => t.id === 'plan-changes')).toEqual([expect.objectContaining({ title: 'Repo changes', file: 'plan-changes.md', builtIn: false })]);
    expect(mine.types.filter((t) => t.builtIn)).toEqual([]);
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

In `packages/core/test/checklist.test.ts`:
- Replace:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import type { HistoryEntry, Message, Option } from '../src/schemas';
```
with:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { CONFLICT_REASON, PLAN_CHANGES_TYPE } from '../src/planChanges';
import type { HistoryEntry, Message, Option } from '../src/schemas';
```
- Add this test just before `it('counts the changes applied since the last final', …)`:
```ts
  it("blocks on a Plan changes item until it's resolved or parked", () => {
    const conflict = (id: string, title: string, o: Parameters<typeof pair>[1] = {}) => pair(id, { type: 'plan-changes', title, ...o });
    const pairs = [
      conflict('plan-changes-v2-1', 'Approach'),
      conflict('plan-changes-v2-2', 'Data', { status: 'with_claude' }),
      conflict('plan-changes-v2-3', 'Channels', { status: 'resolved' }),
      conflict('plan-changes-v2-4', 'Change 4', { status: 'parked' }),
      // Claude's merged version is a proposal too, but the conflict is the reason given.
      conflict('plan-changes-v2-5', 'Lead time', { messages: [claude('m1'), claude('m2', { options: WITH_CHANGE, recommended: 'email' })] }),
      pair('q1', { title: 'Who gets reminders?', status: 'resolved' }),
    ];
    const types = [PLAN_CHANGES_TYPE, ...TYPES];
    const list = checklistFrom({ items: pairs.map((p) => p.item), threads: pairs.map((p) => p.thread), history: [], types });
    expect(list).toEqual({
      blocking: [
        row('plan-changes-v2-1', 'Approach', 'Plan changes', CONFLICT_REASON),
        row('plan-changes-v2-2', 'Data', 'Plan changes', 'Claude is working on it.'),
        row('plan-changes-v2-5', 'Lead time', 'Plan changes', "Your draft and the repo's new version disagree here."),
      ],
      defaults: [],
      parked: [row('plan-changes-v2-4', 'Change 4', 'Plan changes', 'Parked.')],
      unreviewed: [],
      canStart: false,
    });
    const settled = pairs.filter((p) => ['resolved', 'parked'].includes(p.thread.status));
    expect(checklistFrom({ items: settled.map((p) => p.item), threads: settled.map((p) => p.thread), history: [], types }).canStart).toBe(true);
  });

```

In `packages/core/test/finalizePack.test.ts`:
- Replace:
```ts
import { availableTokens } from '../src/finalExport';
```
with:
```ts
import { availableTokens } from '../src/finalExport';
import { PLAN_CHANGES_TYPE } from '../src/planChanges';
```
- Add this test just before `it('works for a project with nothing decided, no profile and no earlier final', …)`:
```ts
  it('leaves out Plan changes items, whatever their state: what they settled is already in the draft', async () => {
    const settled = pair('plan-changes-v2-1', { type: 'plan-changes', title: 'Approach', status: 'resolved' });
    const open = pair('plan-changes-v2-2', { type: 'plan-changes', title: 'Data', status: 'your_turn' });
    const dir = await seedProject({ pairs: [settled, open, pair('q1', { title: 'Who gets reminders?' })] });
    await addDecision(dir, { text: 'Approach: kept my draft', threadId: 't-plan-changes-v2-1', itemIds: ['plan-changes-v2-1'] });
    const pack = await finalizePack({ dir, types: [PLAN_CHANGES_TYPE, ...types], rules: RULES });
    expect(pack.items.map((i) => i.id)).toEqual(['q1']);
    expect(pack.openItems.map((e) => e.itemId)).toEqual(['q1']);
    expect(pack.decisions).toEqual([]);
    expect(pack.tokens).toEqual([]);
  });

```

In `packages/core/test/projects.test.ts`:
- Replace:
```ts
import { readItems, readProjectFile, readThread, writeHistoryEntry, writeProjectFile, writeThread } from '../src/store/io';
```
with:
```ts
import { readItems, readProjectFile, readThread, writeHistoryEntry, writeItem, writeProjectFile, writeThread } from '../src/store/io';
```
- Add at the end of the file, after Task 1's `describe('the project home for plan versions', …)`:
```ts

describe('the project home for Plan changes', () => {
  it('shows Plan changes in the navigation only when the project has such items, and first', async () => {
    const types = await defaultTypes();
    const dir = await seedProject();
    const restock = { repo: 'acme', id: 'restock', dir };
    expect((await loadProjectHome(restock, types)).types.map((t) => t.id)).toEqual([
      'architecture', 'database', 'ui', 'flows', 'questions', 'concerns', 'ideas', 'phases', 'testing', 'security',
    ]);
    expect(await loadTypeItems(restock, types, 'plan-changes')).toBeNull();

    const conflict = pair('plan-changes-v2-1', { type: 'plan-changes', title: 'Approach', status: 'with_claude' });
    await writeItem(dir, conflict.item);
    await writeThread(dir, conflict.thread);
    const home = await loadProjectHome(restock, types);
    expect(home.types.map((t) => t.id)).toEqual([
      'plan-changes', 'architecture', 'database', 'ui', 'flows', 'questions', 'concerns', 'ideas', 'phases', 'testing', 'security',
    ]);
    expect(home.types[0]).toMatchObject({ title: 'Plan changes', order: 0, itemCount: 1, withClaude: 1, noChanges: null, answerPresets: ['Keep my draft', "Take the repo's version"] });
    expect(home.inbox.find((e) => e.itemId === 'plan-changes-v2-1')?.typeTitle).toBe('Plan changes');
    expect((await loadTypeItems(restock, types, 'plan-changes'))?.items.map((i) => i.id)).toEqual(['plan-changes-v2-1']);
  });
});
```
(`defaultTypes()` is the file's helper that installs the shipped defaults into a temp config folder and runs `loadConfig`.)

In `packages/core/test/reply.test.ts`:
- Replace:
```ts
import { undoChange } from '../src/store/changes';
```
with:
```ts
import { PLAN_CHANGES_TYPE } from '../src/planChanges';
import { undoChange } from '../src/store/changes';
```
- Add two tests before `it("refuses threads that aren't waiting for Claude", …)`. Replace:
```ts
  it("refuses threads that aren't waiting for Claude", async () => {
```
with:
```ts
  it("won't make a Plan changes item: only an update makes those", async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const attempt = postReply(dir, {
      reply: { threadId: 't-q1', text: 'This changes the plan.', newItems: [{ type: 'plan-changes', title: 'Approach', summary: 'A summary.', message: { text: 'Merge it?' } }] },
      types: [PLAN_CHANGES_TYPE, ...TYPES],
      autoApply: true,
      clone: '/nowhere',
    });
    await expect(attempt).rejects.toThrow('New item 1 (Approach): "plan-changes" isn\'t an enabled plumbing type. Use one of: architecture, questions, concerns.');
    expect((await readItems(dir)).values.map((i) => i.id)).toEqual(['q1']);
  });

  it('takes three options on a Plan changes thread, each ready to accept, Keep my draft with a change that changes nothing', async () => {
    const dir = await seedProject({ pairs: [asked('plan-changes-v2-1', { type: 'plan-changes', title: 'Data' })] });
    await postReply(dir, {
      reply: {
        threadId: 't-plan-changes-v2-1',
        text: 'You log one row per send, and the repo moved the log to the events table. The merged version keeps both.',
        options: [
          { id: 'merged', label: 'Use the merged version', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send in the events table.' }] } },
          { id: 'theirs', label: "Take the repo's version", change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in the events table.' }] } },
          { id: 'keep', label: 'Keep my draft', change: { md: [] } },
        ],
        recommended: 'merged',
      },
      types: [PLAN_CHANGES_TYPE, ...TYPES],
      autoApply: true,
      clone: '/nowhere',
    });
    const thread = await readThread(dir, 't-plan-changes-v2-1');
    expect(thread.status).toBe('your_turn');
    expect(thread.messages.at(-1)).toMatchObject({ author: 'claude', recommended: 'merged', options: [{ id: 'merged' }, { id: 'theirs' }, { id: 'keep', change: { md: [] } }] });
    expect(await draftOf(dir)).toBe(DRAFT);
  });

  it("refuses threads that aren't waiting for Claude", async () => {
```

In `packages/core/test/submit.test.ts`, add a test before `it('applies an accept with a note, and sends the note to Claude', …)`. Replace:
```ts
  it('applies an accept with a note, and sends the note to Claude', async () => {
```
with:
```ts
  it('accepting an option whose change is empty settles the thread, as Keep my draft does on a Plan changes thread', async () => {
    const keep = { id: 'keep', label: 'Keep my draft', change: { md: [] } };
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Data', options: [perSend, keep], draft: { optionId: 'keep', updatedAt: AT } })] });
    const before = await draftOf(dir);
    const r = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
    expect(r).toMatchObject({ resolved: ['t-q1'], sent: [], skipped: [] });
    expect(await draftOf(dir)).toBe(before);
    const thread = await readThread(dir, 't-q1');
    expect(thread.status).toBe('resolved');
    expect(thread.messages.at(-1)).toMatchObject({ author: 'system', text: 'Applied and resolved.' });
    expect((await readDecisions(dir)).map((d) => d.text)).toEqual(['Data: Keep my draft']);
  });

  it('applies an accept with a note, and sends the note to Claude', async () => {
```

In `packages/service/test/claude.test.ts`, inside `describe('opening a plan', …)`, add this test after `it('lists flows and phases last, to import after the others', …)`:
```ts

  it('never imports the built-in Plan changes type', async () => {
    const t = await setup();
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN });
    expect(open.body.importTypes).toHaveLength(10);
    expect(open.body.importTypes.map((x: Json) => x.id)).not.toContain('plan-changes');
    expect((await readProjectFile(path.join(t.root, 'acme-app', 'restock-reminders'))).importPending).not.toContain('plan-changes');
    const r = await t.claude('/items', { repo: 'acme-app', project: open.body.project, type: 'plan-changes', noChanges: 'None.' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('"plan-changes" isn\'t an enabled plumbing type.');
  });
```

In `packages/service/test/config.test.ts`, inside `describe('config API', …)`, add this test just before `it('lists rules files that are broken on disk', …)`:
```ts
  it('leaves the built-in Plan changes type out of the rules and settings lists', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const ids = async (route: string) => ((await (await call(app, route)).json()) as { types: { id: string }[] }).types.map((t) => t.id);
    expect(await ids('/api/rules')).toHaveLength(10);
    expect(await ids('/api/rules')).not.toContain('plan-changes');
    expect(await ids('/api/config')).not.toContain('plan-changes');
    expect((await call(app, '/api/rules/plan-changes.md')).status).toBe(404);
  });

```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/config.test.ts packages/core/test/checklist.test.ts packages/core/test/finalizePack.test.ts packages/core/test/projects.test.ts packages/core/test/reply.test.ts packages/core/test/submit.test.ts packages/service/test/claude.test.ts packages/service/test/config.test.ts`
Expected: FAIL.
- `config.test.ts`, `checklist.test.ts`, `finalizePack.test.ts` and `reply.test.ts` don't load: `Error: Cannot find module '../src/planChanges'`.
- In `projects.test.ts`, the new test fails: the navigation has no `plan-changes` entry.
- The new `submit.test.ts` test already passes: an empty change is a plain accept today. It keeps "Keep my draft" one click from now on.
- The two new service tests already pass: the type doesn't exist yet. They, and the existing `/open`, `/config` and `/rules` tests (10 types, architecture first), guard the routes once `loadConfig` adds the type in Step 5.

- [ ] **Step 3: Add `builtIn` to the plumbing type header**

In `packages/core/src/schemas/plumbingType.ts`, in `plumbingTypeHeaderSchema`, replace:
```ts
  addLabel: z.string().min(1).max(40).optional(),
});
```
with:
```ts
  addLabel: z.string().min(1).max(40).optional(),
  /** Shipped in code (Plan changes), never read from a rules file: kept out of imports and of the rules lists. */
  builtIn: z.boolean().default(false),
});
```
Leave `plumbingTypeHeaderDocs` and `newRulesFileTemplate` alone: `builtIn` isn't something a rules file sets.

`PlumbingType.builtIn` is now a required `boolean`, so the two `PlumbingType` literals in tests need it. In `packages/core/test/fixtures.ts`, in `listType`, and in `packages/core/src/finalExport.test.ts`, in `const type = (…): PlumbingType => ({…})`, replace:
```ts
  enabled: true,
  file: `${id}.md`,
```
with:
```ts
  enabled: true,
  builtIn: false,
  file: `${id}.md`,
```
(In `fixtures.ts` the two lines are indented by four spaces, inside the `return { … }`; keep the indentation.)

- [ ] **Step 4: Write the Plan changes type**

`packages/core/src/planChanges.ts`:
```ts
import { splitSections } from './rules';
import type { PlumbingType } from './schemas';

/** The built-in plumbing type for passages that both your draft and the repo's new version of the plan changed. */
export const PLAN_CHANGES = 'plan-changes';

/** Why an unresolved Plan changes item blocks Finalize. */
export const CONFLICT_REASON = "Your draft and the repo's new version disagree here.";

// The thread subagent reads the Rules section. Plan changes items are made by an update, never by an importer.
const RULES = `## What to look for
- Nothing to import. When dev-plumbing brings a new version of the plan in, it makes one Plan changes item for each passage that both the draft and the repo's new version changed.

## Rules
- Each thread is one passage that both the draft and the repo changed. The item's body shows it three ways, each in a fenced block: **Your draft** (the passage in the draft when the update ran), **The repo (vN)** (the repo's new text) and **Before (vN-1)** (the text both sides started from). "(nothing)" means that side has no text there.
- Until the person decides, the draft keeps its own text. None of the repo's text for this passage is in the draft.
- When the thread has no message from the person yet, reply with three options, each with a \`change\`, so the person can accept any of them in one click:
  - \`merged\`, "Use the merged version": one version of the passage that keeps what each side meant to change. Make it the recommended option.
  - \`theirs\`, "Take the repo's version": its \`change.md\` replaces the draft's text for this passage with the repo's. Leave it out when "Your draft" is "(nothing)" and no text next to where the passage was appears in the draft exactly once.
  - \`keep\`, "Keep my draft": \`change: { md: [] }\`. It changes nothing, and accepting it settles the thread.
  - If the draft already says what the repo's version says, offer only "Keep my draft", as the recommended option.
- Each \`change.md\` patch's \`find\` is the draft's current text, copied exactly from the draft file (it may have changed since the update), with enough of the text around it to appear in the draft exactly once. \`replace\` is that same text as it should read. Use up to 20 patches, each \`find\` unique, in the order they appear in the draft. When "Your draft" is over about 8,000 characters, split it by paragraph, one patch per paragraph.
- When "Your draft" is "(nothing)", the draft deleted this passage. Anchor \`find\` on the draft's text just before or after where it was, and keep that text in \`replace\`.
- When "The repo" is "(nothing)", the repo deleted this passage or moved it. If the body says the repo moved it, the draft now has the repo's copy there as well as yours here: the merged version carries the draft's edits into the moved copy and removes this one, which takes two patches. If the repo deleted it, say so, and let the merged version keep only what the draft added that still matters.
- In \`text\`, say in one or two sentences what each side changed, and which decisions so far bear on it.
- When the person answers with the preset "Keep my draft", resolve the thread with no change, with the decision "<item title>: kept my draft".
- When they answer with the preset "Take the repo's version", offer one recommended option whose \`change.md\` replaces the draft's text for this passage with the repo's, so they can accept it.
- Never put conflict markers (lines like <<<<<<<, |||||||, ======= or >>>>>>>) in the draft.

## Done when
- The draft has the version of the passage the person chose, and the thread is resolved.
`;

/**
 * Plan changes ships in code, not as a rules file: it needs no setup, and it's never imported, listed among the rules
 * files or turned off. loadConfig adds it, unless the user has their own plumbing/plan-changes.md.
 */
export const PLAN_CHANGES_TYPE: PlumbingType = {
  id: PLAN_CHANGES,
  title: 'Plan changes',
  order: 0,
  screen: 'list',
  emptyMessage: "Nothing in the repo's new version conflicts with your draft.",
  fields: [],
  answerPresets: ['Keep my draft', "Take the repo's version"],
  timeline: false,
  enabled: true,
  builtIn: true,
  file: '',
  body: RULES,
  sections: splitSections(RULES),
};

/**
 * The types an import (or a re-import) runs an importer for: the enabled ones that aren't built in. Plan changes items
 * are made by an update, never by an importer, so a user's own plan-changes.md isn't imported either.
 */
export function importableTypes(types: PlumbingType[]): PlumbingType[] {
  return types.filter((t) => t.enabled && !t.builtIn && t.id !== PLAN_CHANGES);
}
```

The thread pack gives a subagent only `sections.Rules`, so everything a thread subagent needs is in that section. Task 4 gives a Plan changes item `mdAnchor: { heading }` when its conflict has a heading, so its pack's `draftSection` is that section of the draft. The Rules still point the subagent at the draft file (`draftFile` in the pack) for the exact current text, which `find` must copy.

- [ ] **Step 5: Add the type in `loadConfig`**

In `packages/core/src/config.ts`, replace:
```ts
import { parseRulesFile, resolveTypes, type RulesFileResult } from './rules';
```
with:
```ts
import { PLAN_CHANGES, PLAN_CHANGES_TYPE } from './planChanges';
import { parseRulesFile, resolveTypes, type RulesFileResult } from './rules';
```
and in `loadConfig`, replace:
```ts
  const results: RulesFileResult[] = [];
  for (const f of await listFiles(path.join(dir, 'plumbing'), '.md', 'plumbing', problems)) {
    const fileContent = await readText(path.join(dir, 'plumbing', f), `plumbing/${f}`, problems);
    results.push(parseRulesFile(f, fileContent ?? ''));
  }
  const { types, errors } = resolveTypes(results);
```
with:
```ts
  const results: RulesFileResult[] = [];
  for (const f of await listFiles(path.join(dir, 'plumbing'), '.md', 'plumbing', problems)) {
    const fileContent = await readText(path.join(dir, 'plumbing', f), `plumbing/${f}`, problems);
    const parsed = parseRulesFile(f, fileContent ?? '');
    // A rules file is the user's, so it's never built in, whatever its header says.
    results.push(parsed.ok ? { ...parsed, type: { ...parsed.type, builtIn: false } } : parsed);
  }
  // Plan changes ships in code. The user's own plumbing/plan-changes.md, when it loads, replaces it.
  if (!results.some((r) => r.ok && r.type.id === PLAN_CHANGES)) results.push({ ok: true, type: PLAN_CHANGES_TYPE });
  const { types, errors } = resolveTypes(results);
```
`resolveTypes` sorts by `order`, then `title`, so Plan changes (order 0) comes first.

- [ ] **Step 6: Block Finalize on an unresolved Plan changes item, and leave the items out of the final**

In `packages/core/src/store/checklist.ts`, add this line at the top of the file, before `import {`:
```ts
import { CONFLICT_REASON, PLAN_CHANGES } from '../planChanges';
```
and in `blockingReason`, replace:
```ts
  if (status === 'with_claude') return 'Claude is working on it.';
  const unresolved = status !== 'resolved';
```
with:
```ts
  if (status === 'with_claude') return 'Claude is working on it.';
  const unresolved = status !== 'resolved';
  if (unresolved && item.type === PLAN_CHANGES) return CONFLICT_REASON;
```

In `packages/core/src/store/context.ts`, replace:
```ts
import { availableTokens } from '../finalExport';
```
with:
```ts
import { availableTokens } from '../finalExport';
import { PLAN_CHANGES } from '../planChanges';
```
In `FinalizePack`, replace:
```ts
  /** Every item that goes into the final, in plumbing-type order. Parked items and items of disabled types are left out of the final, so they aren't here. */
```
with:
```ts
  /**
   * Every item that goes into the final, in plumbing-type order. Parked items, items of disabled types and Plan changes
   * items (what they settled is already in the draft) are left out of the final, so they aren't here.
   */
```
and in `finalizePack`, replace:
```ts
  // Parked items and items of disabled plumbing types don't go into the final (saveProposal refuses their tokens).
  const items = allItems
    .filter((i) => statusOf(i) !== 'parked' && typeOf(i)?.enabled !== false)
```
with:
```ts
  // Parked items and items of disabled plumbing types don't go into the final (saveProposal refuses their tokens).
  // Nor do Plan changes items: what they settled is already in the draft.
  const items = allItems
    .filter((i) => statusOf(i) !== 'parked' && typeOf(i)?.enabled !== false && i.type !== PLAN_CHANGES)
```

- [ ] **Step 7: Show a built-in type only in a project that has items of it**

In `packages/core/src/store/projects.ts`, in `loadProjectHome`, replace:
```ts
  const typeEntries: TypeEntry[] = types
    .filter((t) => t.enabled)
```
with:
```ts
  // A built-in type (Plan changes) shows only in a project that has items of it.
  const typeEntries: TypeEntry[] = types
    .filter((t) => t.enabled && (!t.builtIn || items.some((i) => i.type === t.id)))
```

- [ ] **Step 8: Export the type**

In `packages/core/src/index.ts`, replace:
```ts
export * from './merge';
```
with:
```ts
export * from './merge';
export * from './planChanges';
```

- [ ] **Step 9: Keep the built-in type out of imports, replies and the rules lists**

In `packages/service/src/routes/claude.ts`:
- In the `@dev-plumbing/core` import, replace:
```ts
  groupThreads,
  importBatchSchema,
```
with:
```ts
  groupThreads,
  importableTypes,
  importBatchSchema,
```
- In `/open`, replace:
```ts
        const enabledTypes = cfg.types.filter((t) => t.enabled).map((t) => t.id);
```
with:
```ts
        const enabledTypes = importableTypes(cfg.types).map((t) => t.id);
```
- In `/open`, replace:
```ts
      const pending = cfg.types.filter((t) => project.importPending.includes(t.id));
```
with:
```ts
      const pending = importableTypes(cfg.types).filter((t) => project.importPending.includes(t.id));
```
- In `/items`, replace:
```ts
      const type = cfg.types.find((t) => t.id === body.type && t.enabled);
      if (!type) throw new InputError(`"${body.type}" isn't an enabled plumbing type.`);
      const clone = await cloneFor(body.cwd, ref);
```
with:
```ts
      // Built-in types (Plan changes) are never imported.
      const type = importableTypes(cfg.types).find((t) => t.id === body.type);
      if (!type) throw new InputError(`"${body.type}" isn't an enabled plumbing type.`);
      const clone = await cloneFor(body.cwd, ref);
```
`routes/threads.ts` has the same two `type` lines for adding an item by hand. Leave that route as it is: this task changes only the import routes.

In `packages/core/src/store/reply.ts`, so a reply's new items can't be of a built-in type either, replace:
```ts
import { applyMdPatches, dataKindOf, dataProblems, type ClaudeMessage, type HistoryEntry, type PlumbingType, type ReplyInput, type Thread } from '../schemas';
```
with:
```ts
import { importableTypes } from '../planChanges';
import { applyMdPatches, dataKindOf, dataProblems, type ClaudeMessage, type HistoryEntry, type PlumbingType, type ReplyInput, type Thread } from '../schemas';
```
and in `postReply`, replace:
```ts
  const enabled = new Map(o.types.filter((t) => t.enabled).map((t) => [t.id, t]));
```
with:
```ts
  // The types Claude may add an item of: the enabled ones, but never a built-in one (Plan changes comes from updates).
  const enabled = new Map(importableTypes(o.types).map((t) => [t.id, t]));
```

In `packages/service/src/routes/config.ts`, replace:
```ts
const summaries = (types: PlumbingType[]): RuleSummary[] =>
  types.map((t) => ({ file: t.file, id: t.id, title: t.title, order: t.order, screen: t.screen, enabled: t.enabled }));
```
with:
```ts
/** The rules files you can edit and turn on or off. Built-in types (Plan changes) ship in code, so they aren't listed. */
const summaries = (types: PlumbingType[]): RuleSummary[] =>
  types.filter((t) => !t.builtIn).map((t) => ({ file: t.file, id: t.id, title: t.title, order: t.order, screen: t.screen, enabled: t.enabled }));
```
`GET /api/config` and `GET /api/rules` both list types through `summaries`. `POST /api/rules` gives a new type `max(order) + 1`; Plan changes' order 0 doesn't change that.

- [ ] **Step 10: Run the tests**

Run: `pnpm vitest run packages/core/test/config.test.ts packages/core/test/checklist.test.ts packages/core/test/finalizePack.test.ts packages/core/test/projects.test.ts packages/core/test/reply.test.ts packages/core/test/submit.test.ts packages/service/test/claude.test.ts packages/service/test/config.test.ts`
Expected: PASS (20, 5, 8, 26, 16, 20, 23 and 21 tests).

Run:
```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e rules
pnpm test:e2e
```
Expected: PASS. The e2e runs check that the Rules page, Settings and every project's navigation still show the ten shipped types and nothing else.

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/planChanges.ts packages/core/src/schemas/plumbingType.ts packages/core/src/config.ts packages/core/src/store/checklist.ts packages/core/src/store/context.ts packages/core/src/store/projects.ts packages/core/src/store/reply.ts packages/core/src/index.ts packages/core/src/finalExport.test.ts packages/core/test/fixtures.ts packages/core/test/config.test.ts packages/core/test/checklist.test.ts packages/core/test/finalizePack.test.ts packages/core/test/projects.test.ts packages/core/test/reply.test.ts packages/core/test/submit.test.ts packages/service/src/routes/claude.ts packages/service/src/routes/config.ts packages/service/test/claude.test.ts packages/service/test/config.test.ts
git commit -m "feat(core): a built-in Plan changes type for conflicts, kept out of imports and the final" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Bring a new plan version in

`updatePlan` brings the repo's changed plan in as the next version, in one journaled step (Decision 8): it saves the current original, draft and items in `docs/versions/v<n>/`, merges the repo's text into your draft (your text wins every conflict) or, when asked, starts the draft again from the repo's text, keeps the draft as merged in `docs/versions/v<n+1>/merged.md`, turns each conflict into a Plan changes thread queued for Claude, makes `docs/original.md` the repo's text, and writes `project.json` last to start the re-import. A journal on disk lists what it creates: if a write fails, everything written so far is put back, and if even that stops part-way, the next `planChange` or `updatePlan` finishes the job. `planChange` tells the service whether there's anything to bring in, and how a merge would go; `updateRefusal` says whether the update has to wait. Task 6 calls them from `/open`, under the project lock.

**Files:**
- Create:
  - `packages/core/src/store/update.ts`
  - `packages/core/test/update.test.ts`
- Modify:
  - `packages/core/src/store/queue.ts` (`finishSubmission`'s line for a thread with no answer from you)
  - `packages/core/src/index.ts` (exports `./store/update`)
- Test:
  - `packages/core/test/update.test.ts`

**Interfaces:**
- Consumes:
  - From Task 1:
    - `projectVersions`, `currentVersion`, `versionDocRel`, `snapshotVersion`, `planHash` (`store/versions.ts`): the snapshot copies the items too, and refuses only a folder that already has an `original.md` or `draft.md`;
    - `PlanVersion` (with `merge.fresh`), and `PlumbingProject`'s `versions` and `reimporting`, and `Item.conflict` (`schemas`);
    - `seedProject` (`test/fixtures.ts`) taking `versions` and `reimporting` in its `project` overrides.
  - From Task 2: `mergePlan`, `MergeError`, `MergeConflict` (with `movedTo`), `MergeResult` (`merge.ts`).
  - From Task 3:
    - `PLAN_CHANGES`, `importableTypes` (`planChanges.ts`), and `PLAN_CHANGES_TYPE` in the tests;
    - `listType` (`test/fixtures.ts`) filling `builtIn: false`.
  - From Plans 1–4:
    - `uniqueId` (`store/importItems.ts`);
    - `newId`, `ConflictError`, `InputError`, `StoreError`, `docPath`, `projectFiles`, `readDocText`, `readItems`, `readJsonFile`, `readThreads`, `readProjectFile`, `writeItem`, `writeThread`, `writeSubmission`, `writeProjectFile` (`store/io.ts`);
    - `readFinalize`, and in the tests `requestFinalize` and `pickUpFinalize` (`store/finalize.ts`);
    - `tildify` (`store/open.ts`), `titleFromMarkdown` (`schemas`), `diffText` (`docDiff.ts`), `writeFileAtomic` and `writeJsonAtomic` (`atomic.ts`);
    - `pendingSubmissions`, `pickUp`, `finishSubmission` (`store/queue.ts`).
- Produces (exported from `@dev-plumbing/core`), exactly as the header's Contracts:
  - `type PlanChange = { from: number; to: number; added: number; removed: number; conflicts: number; whitespaceOnly: boolean; suggestFresh: boolean }`
  - `type OlderPlan = { older: number }`
  - `planChange(dir: string, repoText: string): Promise<PlanChange | OlderPlan | null>`
  - `type UpdateResult = { version: number; clean: number; conflicts: number; fresh: boolean; conflictThreadIds: string[]; importTypes: string[] }`
  - `updateRefusal(dir: string): Promise<string | null>`
  - `updatePlan(dir: string, o: { repoText: string; clone: string; branch: string; commit: string | null; types: PlumbingType[]; fresh?: boolean; home?: string; now?: Date }): Promise<UpdateResult>`
  - `recoverUnfinishedUpdate(dir: string): Promise<void>`
  - `changedDraft(v: PlanVersion): boolean`, which Task 9 uses for the Finalize page.
  - `finishSubmission` gives a thread with no `you` message its own line.
- **Rules:**
  - **`planChange`:** first `recoverUnfinishedUpdate`. Then:
    - null when `planHash(repoText)` equals the current version's `hash`, and null when `repoText` and `docs/original.md` are the same text once `\r\n` is read as `\n`: a change of line endings alone never asks "0 lines added, 0 removed";
    - `{ older: k }` when `planHash` of the repo text, as given or LF-normalised, is an earlier version's hash (the newest such `k`): this clone has a version the project had before;
    - otherwise `{ from: n, to: n + 1, added, removed, conflicts, whitespaceOnly, suggestFresh }`, where `n` is the current version and `added`/`removed` count the lines in `diffText`'s added and removed segments from `docs/original.md` to `repoText`, on those LF texts. A dry-run `mergePlan` (base `docs/original.md`, ours `docs/draft.md`, theirs the repo text) gives `conflicts`, its number of conflicts, and writes nothing. `whitespaceOnly` is true when the two plans are equal once every run of whitespace is one space. `suggestFresh` is true when `whitespaceOnly` is, or when the conflicts' `ours` lengths sum to more than a third of the draft's length. If git can't merge, the dry run counts as no conflicts, and `updatePlan` will report the error.
  - **`updateRefusal`** says why the update has to wait, or null, checked in this order:
    1. `status === 'importing'`: "This project is still importing. Run /dev-plumbing again once that's done."
    2. One thread with status `with_claude`: "Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered." More than one: "Claude has <n> threads to answer in this project first. Run /dev-plumbing again once they're answered."
    3. `finalize.json` is `requested` or `writing`: "Finalize is under way. Run /dev-plumbing again once it's done or cancelled."
  - **`updatePlan`'s refusals** come first, after `recoverUnfinishedUpdate`: `updateRefusal`'s, then "The plan hasn't changed since v<n>." when `repoText` hashes the same as the current version. Each is a ConflictError, with nothing written.
  - **The merge** runs before any write: base is `docs/original.md`, ours is `docs/draft.md`, theirs is `repoText`. A `MergeError` becomes `InputError("Couldn't merge the new plan: <message>")`, with nothing written. With `fresh: true` there's no merge: the draft becomes `repoText` as it is, with no conflicts, and the version's `merge` is `{ clean: 0, conflicts: 0, fresh: true }`.
  - **Conflict items**, one per conflict in document order, `k` counting from 1 and `N` being the new version:
    - id `uniqueId('plan-changes-v<N>-<k>', <every existing item id>)`, key `v<N>-<k>`, `type: 'plan-changes'`, `threadId: 't-<id>'`, `createdBy: 'import'`;
    - `title`: the conflict's heading, or `Change <k>` when there's none;
    - `summary`: "Your draft and the repo's v<N> both changed this passage.";
    - `mdAnchor: { heading }` when there's a heading of at most 200 characters (the schema's limit), so the thread pack hands Claude that section of the draft and the card shows "§ <heading>";
    - `conflict: { ours, base, theirs }`, the three texts, so a later update can tell when it covers the same passage;
    - `body`: when the conflict has `movedTo`, first the line "The repo moved this passage to § <movedTo>. Your draft now has both copies."; then the lines `**Your draft**`, `**The repo (v<N>)**` and `**Before (v<N-1>)**`, each followed by its text (ours, theirs, base). A text sits in a block opened by `` ```md `` and closed by the same fence, which is made longer than any run of backticks in the text (and at least 3). Its trailing newlines are dropped. An empty or blank text is `(nothing)` instead of a block. The parts are joined with blank lines, and there's no newline at the end;
    - `links`: the older Plan changes items it supersedes, when there are any (see below).
  - **Conflict threads:** `status: 'with_claude'`, with one system message, "Your draft and the repo's v<N> both changed this passage. Claude is proposing a merged version.". When there's at least one conflict, there's also one submission, `{ id: newId('s', now), at, scope: 'all', drafts: {}, sent: <the thread ids>, resolved: [], processedAt: at }`, so `pendingSubmissions` hands it to the next `dp_wait`.
  - **Superseded conflicts:** an older Plan changes item whose thread isn't resolved or parked, and whose trimmed, non-empty `conflict.ours` is contained in a new conflict's `ours`, is superseded by that new item (the first one, in document order). The new item gets `links: [<older ids>]`. After the commit point, each superseded thread is parked with the line "Superseded by the plan's v<N>: <new item title>.". This comes after `project.json`, because it changes existing threads that the snapshot doesn't hold; if one of these writes fails, that thread just stays open.
  - **`project.json`:**
    - `versions`: `projectVersions(project)` (v1 synthesised from `source` when empty), plus `{ n: N, at, hash: planHash(repoText), clone: tildify(clone, home), branch, commit, merge }`, with `merge: { clean, conflicts }` (or the fresh one above);
    - `title`: `titleFromMarkdown(repoText)`, or the old title when the new plan has no H1;
    - `importPending`: the ids of `importableTypes(types)`, in that order;
    - `status: 'importing'` and `reimporting: { version: N, from }`. `from` is `'finalized'` only when the project was finalized and the update didn't change its draft (`changedDraft(version)` is false: nothing merged, no conflicts, not fresh); otherwise `'active'`. When no type is importable there's nothing to wait for, so the status stays `from` and there's no `reimporting`;
    - `updatedAt: at`.
  - **`changedDraft(v)`** is true when `v.merge` has `clean > 0`, `conflicts > 0` or `fresh`.
  - **The result:** `{ version: N, clean, conflicts: <count>, fresh, conflictThreadIds, importTypes: importPending }`.
  - **The journal.** Before anything else is written, `updatePlan` writes `docs/versions/v<n>/update.json` (`n` is the version being replaced) as `{ to: N, created }`: every file and folder it's going to create, listed before any of them is written. That's simpler and safer than updating it as it goes: nothing it creates can be missing from it. `created` is, in order: the folders that don't exist yet among `docs/versions/v<N>`, `items`, `threads` and `submissions`; each conflict's item and thread files; the submission file; `docs/versions/v<N>/merged.md`. Then the writes go in this order:
    1. `snapshotVersion(dir, n)`: `docs/original.md`, `docs/draft.md` and the items to `docs/versions/v<n>/`;
    2. each conflict's item and thread, then the submission, then `docs/versions/v<N>/merged.md`, the draft exactly as the merge left it (the repo's text for a fresh start);
    3. `docs/draft.md`, the merged text;
    4. `docs/original.md`, `repoText` as given;
    5. `project.json`, the commit point.

    Once `project.json` is written, the journal is deleted.
  - **Putting an update back** (`rollBack`, for a journal in `docs/versions/v<n>/`): `docs/original.md` and `docs/draft.md` are written back from the snapshot when it has them and they differ; the `created` paths are removed, newest first (a folder only when it's empty again). When everything went back, the snapshot (`original.md`, `draft.md`, `items/`) is removed, then the journal, then `docs/versions/v<n>` and `docs/versions` if they're empty; a `merged.md` from the update that brought v<n> in stays. Otherwise the snapshot and the journal stay, so the next try can finish. It returns the paths it couldn't put back.
  - **A failure** in `updatePlan` rolls back at once, then throws a ConflictError:
    - everything put back: "The update didn't finish (<reason>). What it had written was put back, so the project is as it was. Run /dev-plumbing to try again."
    - otherwise: "The update didn't finish (<reason>), and some files couldn't be put back yet: <paths>. Run /dev-plumbing again to finish putting them back."
  - **`recoverUnfinishedUpdate`** looks for a journal in every `docs/versions/v<k>/`. One whose `to` is already in `versions` is from an update that finished, and is deleted. Any other is rolled back. If that can't put everything back, it throws ConflictError "An earlier update to v<to> didn't finish, and some files couldn't be put back yet: <paths>. Run /dev-plumbing again to finish putting them back.". It runs at the start of `planChange` and `updatePlan`, so under the service's project lock. This replaces keeping the snapshot only after a double failure: a stopped update, or one whose rollback stopped part-way, is always finished at the next look.
  - **`finishSubmission`:** a thread still `with_claude` with no `you` message goes to `your_turn` with the line "Claude didn't get to this one. Pick Keep my draft or Take the repo's version, or say what you want, and send it.", and no draft is restored. A thread with a `you` message is handled as before.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/update.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// The writer fails on the calls a test names ("file#n", counting from 1 since the test cleared the counts), so a test
// can make the update fail part-way, and make putting a file back fail too.
const failing = vi.hoisted(() => ({ calls: new Set<string>(), counts: new Map<string, number>() }));
vi.mock('../src/atomic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/atomic')>();
  const writeFileAtomic = (file: string, data: string | Uint8Array, mode?: number) => {
    const n = (failing.counts.get(file) ?? 0) + 1;
    failing.counts.set(file, n);
    if (failing.calls.has(`${file}#${n}`)) return Promise.reject(new Error('No space left on device'));
    return actual.writeFileAtomic(file, data, mode);
  };
  return { ...actual, writeFileAtomic, writeJsonAtomic: (file: string, value: unknown) => writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`) };
});

// mergePlan throws MergeError while a test sets `merging.fail`, as it does when git is missing or times out.
const merging = vi.hoisted(() => ({ fail: null as string | null }));
vi.mock('../src/merge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/merge')>();
  return {
    ...actual,
    mergePlan: (o: Parameters<typeof actual.mergePlan>[0]) => (merging.fail ? Promise.reject(new actual.MergeError(merging.fail)) : actual.mergePlan(o)),
  };
});

import { PLAN_CHANGES_TYPE } from '../src/planChanges';
import type { PlumbingProject } from '../src/schemas';
import { pickUpFinalize, requestFinalize } from '../src/store/finalize';
import { ConflictError, InputError, readItem, readItems, readProjectFile, readSubmissions, readThread, writeProjectFile } from '../src/store/io';
import { finishSubmission, pendingSubmissions, pickUp } from '../src/store/queue';
import { planChange, updatePlan } from '../src/store/update';
import { planHash, snapshotVersion } from '../src/store/versions';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, listType, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const T = new Date('2026-10-05T10:00:00.000Z');
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const types = [...TYPES, listType('ideas', { title: 'Ideas', order: 7, enabled: false }), PLAN_CHANGES_TYPE];
const IMPORTABLE = ['architecture', 'questions', 'concerns'];
const update = (dir: string, repoText: string, o: { fresh?: boolean; now?: Date } = {}) =>
  updatePlan(dir, { repoText, clone: '/Users/you/src/acme', branch: 'restock-v2', commit: COMMIT, types, home: '/Users/you', now: o.now ?? T, ...(o.fresh ? { fresh: true } : {}) });

/** Your draft: an edit to the Approach section. */
const OURS = DRAFT.replace('sends a reminder.', 'sends an email reminder.');
/** The repo's new version: a new title and an edit to the Data section, neither of which your draft touched. */
const CLEAN = DRAFT.replace('# Restock reminders', '# Restock reminders, take two').replace('Log reminders in a table.', 'Log each reminder in a reminders table.');
/** The repo's new version: the same Approach line your draft edited, edited differently, and the Data section. */
const CONFLICTING = DRAFT.replace('sends a reminder.', 'sends a text message.').replace('Log reminders in a table.', 'Log each reminder in a reminders table.');
const FIRST_LINE = "Your draft and the repo's v2 both changed this passage. Claude is proposing a merged version.";
const NOTHING_TO_SETTLE = { conflicts: 0, whitespaceOnly: false, suggestFresh: false };

/** A project imported from DRAFT (v1), with `draft` (OURS unless given) as its draft. */
async function seed(o: { draft?: string; original?: string; project?: Partial<PlumbingProject>; pairs?: ReturnType<typeof pair>[] } = {}): Promise<string> {
  const original = o.original ?? DRAFT;
  const dir = await seedProject({
    pairs: o.pairs,
    draft: original,
    project: { source: { path: 'docs/specs/restock.md', clone: '/tmp/acme', branch: 'main', hashAtImport: planHash(original) }, ...o.project },
  });
  await fs.writeFile(path.join(dir, 'docs', 'draft.md'), o.draft ?? OURS);
  return dir;
}

/** Every file and folder under dir, with each file's text. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const p = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        out[p] = 'folder';
        await walk(p);
      } else {
        out[p] = await fs.readFile(p, 'utf8');
      }
    }
  };
  await walk(dir);
  return out;
}

const read = (dir: string, rel: string) => fs.readFile(path.join(dir, rel), 'utf8');
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('a change to the plan', () => {
  it('is null when the repo has the version the project is at', async () => {
    const dir = await seed();
    expect(await planChange(dir, DRAFT)).toBeNull();
  });

  it('is null when only the line endings changed', async () => {
    const dir = await seed();
    expect(await planChange(dir, DRAFT.replace(/\n/g, '\r\n'))).toBeNull();
  });

  it('counts the lines added and removed since the current version', async () => {
    const dir = await seed();
    expect(await planChange(dir, `${CLEAN}\n## Channels\n\nSend by SMS.\n`)).toEqual({ from: 1, to: 2, added: 6, removed: 2, ...NOTHING_TO_SETTLE });
  });

  it('says when merging would leave much of the draft to settle, or only the formatting changed', async () => {
    const channels = 'Send by email first, then by SMS to customers who opted in. Never more than one reminder a day. '.repeat(4).trim();
    const plan = `${DRAFT}\n## Channels\n\n${channels}\n`;
    const dir = await seed({ original: plan, draft: plan.replace('sends a reminder.', 'sends an email reminder.') });
    // One short passage in conflict: merging suits.
    expect(await planChange(dir, plan.replace('sends a reminder.', 'sends a text message.'))).toEqual({ from: 1, to: 2, added: 1, removed: 1, conflicts: 1, whitespaceOnly: false, suggestFresh: false });
    // Only the line breaks changed.
    expect(await planChange(dir, plan.replace(/\. Never/g, '.\nNever'))).toEqual({ from: 1, to: 2, added: 5, removed: 1, conflicts: 0, whitespaceOnly: true, suggestFresh: true });
    // The repo rewrote what your draft changed, and the long Channels paragraph you changed too.
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), plan.replace('sends a reminder.', 'sends an email reminder.').replace(channels, `${channels} Pause them on request.`));
    const rewrite = plan.replace('sends a reminder.', 'sends a text message.').replace(channels, 'Send by push only.');
    expect(await planChange(dir, rewrite)).toMatchObject({ conflicts: 2, whitespaceOnly: false, suggestFresh: true });
  });

  it('is the older version when this clone has one the project had before', async () => {
    const dir = await seed();
    await update(dir, CLEAN);
    expect(await planChange(dir, DRAFT)).toEqual({ older: 1 });
    expect(await planChange(dir, DRAFT.replace(/\n/g, '\r\n'))).toEqual({ older: 1 });
  });

  it('is counted from the latest version once there is one', async () => {
    const dir = await seed();
    await update(dir, CLEAN);
    expect(await planChange(dir, CLEAN)).toBeNull();
    expect(await planChange(dir, CLEAN.replace('a reminders table', 'the reminder log'))).toEqual({ from: 2, to: 3, added: 1, removed: 1, ...NOTHING_TO_SETTLE });
  });
});

describe('bringing a new version in', () => {
  it('saves v1, merges both sides into the draft, and starts the re-import', async () => {
    const dir = await seed({ pairs: [pair('q1')] });
    expect(await update(dir, CLEAN)).toEqual({ version: 2, clean: 2, conflicts: 0, fresh: false, conflictThreadIds: [], importTypes: IMPORTABLE });
    expect(await read(dir, 'docs/versions/v1/original.md')).toBe(DRAFT);
    expect(await read(dir, 'docs/versions/v1/draft.md')).toBe(OURS);
    expect(await read(dir, 'docs/versions/v1/items/q1.json')).toBe(await read(dir, 'items/q1.json'));
    const merged = CLEAN.replace('sends a reminder.', 'sends an email reminder.');
    expect(await read(dir, 'docs/draft.md')).toBe(merged);
    // The draft as the update left it, kept for the version's page.
    expect(await read(dir, 'docs/versions/v2/merged.md')).toBe(merged);
    expect(await read(dir, 'docs/original.md')).toBe(CLEAN);
    // The journal is gone once the update is in.
    expect(await fs.readdir(path.join(dir, 'docs', 'versions', 'v1'))).toEqual(['draft.md', 'items', 'original.md']);
    const project = await readProjectFile(dir);
    expect(project.versions).toEqual([
      { n: 1, at: '2026-10-01T09:00:00.000Z', hash: planHash(DRAFT), clone: '/tmp/acme', branch: 'main', commit: null },
      { n: 2, at: T.toISOString(), hash: planHash(CLEAN), clone: '~/src/acme', branch: 'restock-v2', commit: COMMIT, merge: { clean: 2, conflicts: 0 } },
    ]);
    expect(project).toMatchObject({
      title: 'Restock reminders, take two',
      status: 'importing',
      importPending: IMPORTABLE,
      reimporting: { version: 2, from: 'active' },
      updatedAt: T.toISOString(),
    });
    expect((await readItems(dir)).values.map((i) => i.id)).toEqual(['q1']);
    expect(await readSubmissions(dir)).toEqual([]);
  });

  it('turns a passage both sides changed into a Plan changes thread for Claude, keeping your text in the draft', async () => {
    const dir = await seed();
    expect(await update(dir, CONFLICTING)).toEqual({ version: 2, clean: 1, conflicts: 1, fresh: false, conflictThreadIds: ['t-plan-changes-v2-1'], importTypes: IMPORTABLE });
    expect(await read(dir, 'docs/draft.md')).toBe(OURS.replace('Log reminders in a table.', 'Log each reminder in a reminders table.'));
    expect(await read(dir, 'docs/versions/v2/merged.md')).toBe(await read(dir, 'docs/draft.md'));
    expect(await read(dir, 'docs/original.md')).toBe(CONFLICTING);
    expect(await readItem(dir, 'plan-changes-v2-1')).toEqual({
      id: 'plan-changes-v2-1',
      key: 'v2-1',
      type: 'plan-changes',
      title: 'Approach',
      summary: "Your draft and the repo's v2 both changed this passage.",
      body: [
        '**Your draft**',
        '',
        '```md',
        'A daily job finds subscriptions due soon and sends an email reminder.',
        '```',
        '',
        '**The repo (v2)**',
        '',
        '```md',
        'A daily job finds subscriptions due soon and sends a text message.',
        '```',
        '',
        '**Before (v1)**',
        '',
        '```md',
        'A daily job finds subscriptions due soon and sends a reminder.',
        '```',
      ].join('\n'),
      mdAnchor: { heading: 'Approach' },
      threadId: 't-plan-changes-v2-1',
      createdBy: 'import',
      conflict: {
        ours: 'A daily job finds subscriptions due soon and sends an email reminder.',
        base: 'A daily job finds subscriptions due soon and sends a reminder.',
        theirs: 'A daily job finds subscriptions due soon and sends a text message.',
      },
    });
    expect(await readThread(dir, 't-plan-changes-v2-1')).toEqual({
      id: 't-plan-changes-v2-1',
      itemId: 'plan-changes-v2-1',
      status: 'with_claude',
      messages: [{ id: expect.stringMatching(/^m-/), at: T.toISOString(), author: 'system', text: FIRST_LINE }],
    });
    const submissions = await readSubmissions(dir);
    expect(submissions).toEqual([
      { id: expect.stringMatching(/^s-/), at: T.toISOString(), scope: 'all', drafts: {}, sent: ['t-plan-changes-v2-1'], resolved: [], processedAt: T.toISOString() },
    ]);
    expect((await pendingSubmissions(dir)).map((s) => s.id)).toEqual([submissions[0].id]);
    expect((await readProjectFile(dir)).versions[1].merge).toEqual({ clean: 1, conflicts: 1 });
  });

  it('shows a passage you deleted as (nothing), and fences text with backticks in it', async () => {
    const draft = DRAFT.replace('A daily job finds subscriptions due soon and sends a reminder.\n', '');
    const dir = await seed({ draft });
    const repo = DRAFT.replace('sends a reminder.', 'runs ```sendReminders()``` each morning.');
    await update(dir, repo);
    expect(await read(dir, 'docs/draft.md')).toBe(draft);
    expect((await readItem(dir, 'plan-changes-v2-1')).body).toBe(
      [
        '**Your draft**',
        '',
        '(nothing)',
        '',
        '**The repo (v2)**',
        '',
        '````md',
        'A daily job finds subscriptions due soon and runs ```sendReminders()``` each morning.',
        '````',
        '',
        '**Before (v1)**',
        '',
        '```md',
        'A daily job finds subscriptions due soon and sends a reminder.',
        '```',
      ].join('\n'),
    );
  });

  it('says where the repo moved a passage your draft changed', async () => {
    const channels = '## Channels\n\nSend by email.\n';
    const plan = `${DRAFT}\n${channels}`;
    const dir = await seed({ original: plan, draft: plan.replace('Send by email.', 'Send by email, and by SMS to customers who opted in.') });
    // The repo moves Channels to the top, word for word.
    await update(dir, plan.replace(`\n${channels}`, '').replace('## Approach', `${channels}\n## Approach`));
    const item = await readItem(dir, 'plan-changes-v2-1');
    expect(item.title).toBe('Channels');
    expect(item.body?.split('\n\n')[0]).toBe('The repo moved this passage to § Channels. Your draft now has both copies.');
    expect((await read(dir, 'docs/draft.md')).match(/^## Channels$/gm)).toHaveLength(2);
  });

  it('names a conflict with no heading above it by its number', async () => {
    const dir = await seed({ original: 'Remind customers.\n', draft: 'Remind customers by email.\n' });
    await update(dir, 'Remind customers by SMS.\n');
    const item = await readItem(dir, 'plan-changes-v2-1');
    expect(item.title).toBe('Change 1');
    expect(item.mdAnchor).toBeUndefined();
    // The plan has no title of its own, so the project keeps its title.
    expect((await readProjectFile(dir)).title).toBe('Restock reminders');
  });

  it('takes a finalized project back to Active when the update changed its draft, and keeps it Finalized otherwise', async () => {
    const changed = await seed({ project: { status: 'finalized' } });
    await update(changed, CLEAN);
    expect(await readProjectFile(changed)).toMatchObject({ status: 'importing', reimporting: { version: 2, from: 'active' } });
    // The repo's new version says what your draft already says, so the draft stays as it was.
    const same = await seed({ project: { status: 'finalized' } });
    expect(await update(same, OURS)).toMatchObject({ clean: 0, conflicts: 0 });
    expect(await read(same, 'docs/draft.md')).toBe(OURS);
    expect(await readProjectFile(same)).toMatchObject({ status: 'importing', reimporting: { version: 2, from: 'finalized' } });
  });

  it("starts the draft again from the repo's version when asked, with nothing to settle", async () => {
    const dir = await seed({ project: { status: 'finalized' } });
    expect(await update(dir, CONFLICTING, { fresh: true })).toEqual({ version: 2, clean: 0, conflicts: 0, fresh: true, conflictThreadIds: [], importTypes: IMPORTABLE });
    expect(await read(dir, 'docs/draft.md')).toBe(CONFLICTING);
    expect(await read(dir, 'docs/versions/v2/merged.md')).toBe(CONFLICTING);
    expect(await read(dir, 'docs/versions/v1/draft.md')).toBe(OURS);
    const project = await readProjectFile(dir);
    expect(project.versions[1].merge).toEqual({ clean: 0, conflicts: 0, fresh: true });
    expect(project).toMatchObject({ status: 'importing', reimporting: { version: 2, from: 'active' } });
    expect((await readItems(dir)).values).toEqual([]);
  });

  it('parks an older Plan changes thread that a newer conflict covers, pointing at the new one', async () => {
    const dir = await seed();
    await update(dir, CONFLICTING);
    // Claude didn't get to it, and the re-import finished.
    const [queued] = await pendingSubmissions(dir);
    await pickUp(dir, queued.id, 'w-a', T);
    await finishSubmission(dir, queued.id, [], T);
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), status: 'active', importPending: [], reimporting: undefined });
    // v3 changes the same line again, and your draft still has your text there.
    const T3 = new Date('2026-10-06T10:00:00.000Z');
    expect(await update(dir, CONFLICTING.replace('sends a text message.', 'sends a push message.'), { now: T3 })).toMatchObject({ version: 3, conflicts: 1, conflictThreadIds: ['t-plan-changes-v3-1'] });
    const older = await readThread(dir, 't-plan-changes-v2-1');
    expect(older.status).toBe('parked');
    expect(older.messages.at(-1)).toMatchObject({ author: 'system', text: "Superseded by the plan's v3: Approach." });
    expect((await readItem(dir, 'plan-changes-v3-1')).links).toEqual(['plan-changes-v2-1']);
    expect((await readThread(dir, 't-plan-changes-v3-1')).status).toBe('with_claude');
  });

  it("gives back a conflict thread Claude didn't get to, with no answer to restore", async () => {
    const dir = await seed();
    const { conflictThreadIds } = await update(dir, CONFLICTING);
    const [queued] = await pendingSubmissions(dir);
    await pickUp(dir, queued.id, 'w-a', T);
    expect(await finishSubmission(dir, queued.id, [], T)).toEqual({ returned: conflictThreadIds });
    const thread = await readThread(dir, conflictThreadIds[0]);
    expect(thread.status).toBe('your_turn');
    expect(thread.draft).toBeUndefined();
    expect(thread.messages.map((m) => m.text)).toEqual([FIRST_LINE, "Claude didn't get to this one. Pick Keep my draft or Take the repo's version, or say what you want, and send it."]);
  });
});

describe('when an update is refused or fails', () => {
  /** The update is refused with `message`, and the project folder is exactly as it was. */
  async function refused(dir: string, message: string): Promise<void> {
    const before = await snapshot(dir);
    const error = await failure(update(dir, CONFLICTING));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(message);
    expect(await snapshot(dir)).toEqual(before);
  }

  it('an update waits for work in progress', async () => {
    await refused(await seed({ project: { status: 'importing', importPending: ['questions'] } }), "This project is still importing. Run /dev-plumbing again once that's done.");
    await refused(
      await seed({ pairs: [pair('q1', { status: 'with_claude' }), pair('q2')] }),
      "Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered.",
    );
    await refused(
      await seed({ pairs: [pair('q1', { status: 'with_claude' }), pair('q2', { status: 'with_claude' })] }),
      "Claude has 2 threads to answer in this project first. Run /dev-plumbing again once they're answered.",
    );
    const requested = await seed();
    await requestFinalize(requested, { types });
    await refused(requested, "Finalize is under way. Run /dev-plumbing again once it's done or cancelled.");
    const writing = await seed();
    await requestFinalize(writing, { types });
    await pickUpFinalize(writing, 'w-a');
    await refused(writing, "Finalize is under way. Run /dev-plumbing again once it's done or cancelled.");
  });

  it("refuses a plan that hasn't changed", async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    await expect(update(dir, DRAFT)).rejects.toThrow(new ConflictError("The plan hasn't changed since v1."));
    expect(await snapshot(dir)).toEqual(before);
  });

  it("refuses, writing nothing, when git can't merge", async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    merging.fail = 'git merge-file timed out';
    const error = await failure(update(dir, CONFLICTING));
    merging.fail = null;
    expect(error).toBeInstanceOf(InputError);
    expect((error as Error).message).toBe("Couldn't merge the new plan: git merge-file timed out");
    expect(await snapshot(dir)).toEqual(before);
  });

  it('an update never loses your draft', async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    // project.json is written last. When it fails, the snapshot, the conflict's files, the draft and the original
    // have all been written, and all of them are put back.
    failing.counts.clear();
    failing.calls = new Set([`${path.join(dir, 'project.json')}#1`]);
    const error = await failure(update(dir, CONFLICTING));
    failing.calls = new Set();
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(
      "The update didn't finish (No space left on device). What it had written was put back, so the project is as it was. Run /dev-plumbing to try again.",
    );
    expect(await snapshot(dir)).toEqual(before);

    // The same update, when nothing fails, keeps your draft from before it as v1's.
    expect((await update(dir, CONFLICTING)).version).toBe(2);
    expect(await read(dir, 'docs/versions/v1/draft.md')).toBe(OURS);
    expect(await read(dir, 'docs/versions/v1/original.md')).toBe(DRAFT);
  });

  it("finishes putting your draft back the next time, when it couldn't the first time", async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    failing.counts.clear();
    failing.calls = new Set([`${path.join(dir, 'project.json')}#1`, `${path.join(dir, 'docs', 'draft.md')}#2`]);
    const error = await failure(update(dir, CONFLICTING));
    failing.calls = new Set();
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(
      "The update didn't finish (No space left on device), and some files couldn't be put back yet: docs/draft.md. Run /dev-plumbing again to finish putting them back.",
    );
    // v1's copy of your draft and the journal are still there. Everything else was put back, and the conflict's
    // thread isn't left queued for Claude.
    expect(await read(dir, 'docs/versions/v1/draft.md')).toBe(OURS);
    expect(await read(dir, 'docs/original.md')).toBe(DRAFT);
    expect((await readItems(dir)).values).toEqual([]);
    expect(await pendingSubmissions(dir)).toEqual([]);
    expect(await readProjectFile(dir)).toMatchObject({ status: 'active', versions: [] });
    // The next look at the plan finishes the job, so the update can run again.
    expect(await planChange(dir, CONFLICTING)).toMatchObject({ from: 1, to: 2 });
    expect(await snapshot(dir)).toEqual(before);
    expect((await update(dir, CONFLICTING)).version).toBe(2);
  });

  it('puts back an update that stopped part-way, the next time it looks at the plan', async () => {
    const dir = await seed({ pairs: [pair('q1')] });
    const before = await snapshot(dir);
    // An update to v2 that stopped once it had written the new original: the service died before project.json.
    const write = async (rel: string, text: string) => {
      await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await fs.writeFile(path.join(dir, rel), text);
    };
    const created = ['docs/versions/v2', 'submissions', 'items/plan-changes-v2-1.json', 'threads/t-plan-changes-v2-1.json', 'submissions/s-1.json', 'docs/versions/v2/merged.md'];
    await write('docs/versions/v1/update.json', JSON.stringify({ to: 2, created }));
    await snapshotVersion(dir, 1);
    for (const rel of created.slice(2)) await write(rel, '{}');
    await write('docs/draft.md', 'The merged draft.\n');
    await write('docs/original.md', CONFLICTING);
    expect(await planChange(dir, CONFLICTING)).toMatchObject({ from: 1, to: 2 });
    expect(await snapshot(dir)).toEqual(before);
  });

  it('deletes the journal an update left after it finished', async () => {
    const dir = await seed();
    await update(dir, CONFLICTING);
    const after = await snapshot(dir);
    await fs.writeFile(path.join(dir, 'docs', 'versions', 'v1', 'update.json'), JSON.stringify({ to: 2, created: ['items/plan-changes-v2-1.json'] }));
    expect(await planChange(dir, CONFLICTING)).toBeNull();
    expect(await snapshot(dir)).toEqual(after);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/update.test.ts`
Expected: FAIL, with `Error: Cannot find module '../src/store/update'` (`Failed to load url ../src/store/update`).

- [ ] **Step 3: Write the update**

`packages/core/src/store/update.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { writeFileAtomic, writeJsonAtomic } from '../atomic';
import { diffText } from '../docDiff';
import { MergeError, mergePlan, type MergeConflict, type MergeResult } from '../merge';
import { importableTypes, PLAN_CHANGES } from '../planChanges';
import { titleFromMarkdown, type Item, type Message, type PlanVersion, type PlumbingProject, type PlumbingType, type Submission, type Thread } from '../schemas';
import { readFinalize } from './finalize';
import { uniqueId } from './importItems';
import {
  ConflictError,
  docPath,
  InputError,
  newId,
  projectFiles,
  readDocText,
  readItems,
  readJsonFile,
  readProjectFile,
  readThreads,
  StoreError,
  writeItem,
  writeProjectFile,
  writeSubmission,
  writeThread,
} from './io';
import { tildify } from './open';
import { currentVersion, planHash, projectVersions, snapshotVersion, versionDocRel } from './versions';

/**
 * How the plan in the repo differs from the project's current version. `conflicts` is how many passages a merge
 * would leave to settle (a dry run). `whitespaceOnly`: only the formatting changed. `suggestFresh`: starting the draft
 * again from the new version may suit better than merging, because it's whitespace only or the conflicts cover more
 * than a third of the draft.
 */
export type PlanChange = { from: number; to: number; added: number; removed: number; conflicts: number; whitespaceOnly: boolean; suggestFresh: boolean };
/** The plan in this clone is a version the project had before (another branch, or a clone that isn't up to date). */
export type OlderPlan = { older: number };
export type UpdateResult = { version: number; clean: number; conflicts: number; fresh: boolean; conflictThreadIds: string[]; importTypes: string[] };

const quiet = () => undefined;
/** What's at p, without following a link, or null when nothing is. */
const lstat = (p: string) => fs.lstat(p).catch(() => null);
const lf = (text: string) => text.replace(/\r\n/g, '\n');
/** The text with every run of whitespace as one space, to tell a change of formatting from a change of words. */
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
/** The number of lines in a diff segment's text. */
const lineCount = (text: string) => (text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0);

/**
 * Whether bringing this version in changed the draft: something merged into it, a conflict left to settle, or a
 * fresh start. A finalized project goes back to Active after such an update, and the Finalize page says it came in.
 */
export function changedDraft(v: PlanVersion): boolean {
  return v.merge !== undefined && (v.merge.clean > 0 || v.merge.conflicts > 0 || v.merge.fresh === true);
}

// The update's journal. Before it writes anything else, an update writes docs/versions/v<n>/update.json (n is the
// version it replaces) with every path it's going to create. Once project.json is written, the journal is deleted.
// A journal still there means an update stopped part-way: the next planChange or updatePlan puts it back.
const JOURNAL = 'update.json';
const journalSchema = z.object({ to: z.number().int().min(2), created: z.array(z.string()) });
type Journal = z.infer<typeof journalSchema>;
const journalRel = (n: number) => `docs/versions/v${n}/${JOURNAL}`;

/**
 * Takes back an update to v<to> that didn't finish, using its journal in docs/versions/v<n>/: docs/draft.md and
 * docs/original.md are put back from the snapshot, the files it created are removed, and so are the snapshot and the
 * journal. Returns the files it couldn't put back; then the snapshot and the journal stay, for the next try.
 */
async function rollBack(dir: string, docs: PlumbingProject['docs'], n: number, journal: Journal): Promise<string[]> {
  const left: string[] = [];
  for (const which of ['original', 'draft'] as const) {
    const saved = await fs.readFile(docPath(dir, versionDocRel(n, which))).catch(() => null);
    const working = docPath(dir, docs[which]);
    // No snapshot of it means the update stopped before it got that far, so the working file was never replaced.
    if (!saved || saved.equals(await fs.readFile(working).catch(() => Buffer.alloc(0)))) continue;
    await writeFileAtomic(working, saved).catch(() => left.push(docs[which]));
  }
  for (const rel of [...journal.created].reverse()) {
    const file = docPath(dir, rel);
    const stat = await lstat(file);
    if (!stat) continue;
    // A folder the update made goes only when it's empty again.
    if (stat.isDirectory()) await fs.rmdir(file).catch(quiet);
    else await fs.rm(file, { force: true }).catch(() => left.push(rel));
  }
  if (left.length) return left;
  // Everything is back, so the snapshot isn't needed any more. The journal goes last.
  const folder = docPath(dir, `docs/versions/v${n}`);
  for (const rel of [versionDocRel(n, 'original'), versionDocRel(n, 'draft')]) await fs.rm(docPath(dir, rel), { force: true }).catch(() => left.push(rel));
  await fs.rm(path.join(folder, 'items'), { recursive: true, force: true }).catch(() => left.push(`docs/versions/v${n}/items`));
  if (left.length) return left;
  await fs.rm(docPath(dir, journalRel(n)), { force: true }).catch(() => left.push(journalRel(n)));
  await fs.rmdir(folder).catch(quiet);
  await fs.rmdir(path.dirname(folder)).catch(quiet);
  return left;
}

/**
 * Finishes what an update left behind when it stopped part-way (the service died, or putting files back failed):
 * a journal whose version is in project.json is just deleted, and any other is rolled back. Runs at the start of
 * planChange and updatePlan, so under the project's lock.
 */
export async function recoverUnfinishedUpdate(dir: string): Promise<void> {
  const folders = await fs.readdir(docPath(dir, 'docs/versions')).catch((): string[] => []);
  for (const folder of folders) {
    const n = /^v([1-9][0-9]*)$/.exec(folder)?.[1];
    if (!n) continue;
    const read = await readJsonFile(docPath(dir, journalRel(Number(n))));
    const journal = read.ok ? journalSchema.safeParse(read.value) : null;
    if (!journal?.success) continue;
    const project = await readProjectFile(dir);
    if (projectVersions(project).some((v) => v.n === journal.data.to)) {
      await fs.rm(docPath(dir, journalRel(Number(n))), { force: true });
      continue;
    }
    const left = await rollBack(dir, project.docs, Number(n), journal.data);
    if (left.length) {
      throw new ConflictError(
        `An earlier update to v${journal.data.to} didn't finish, and some files couldn't be put back yet: ${left.join(', ')}. Run /dev-plumbing again to finish putting them back.`,
      );
    }
  }
}

/**
 * How the plan in the repo differs from the project's current version: null when it's the same text (the same hash,
 * or the same lines once \r\n is read as \n), { older } when it's a version the project had before, and otherwise the
 * change. `added` and `removed` count lines, against the current version's plan (docs/original.md). A merge is tried
 * without writing anything, for `conflicts` and `suggestFresh`; if git can't merge, the update will say so.
 */
export async function planChange(dir: string, repoText: string): Promise<PlanChange | OlderPlan | null> {
  await recoverUnfinishedUpdate(dir);
  const project = await readProjectFile(dir);
  const versions = projectVersions(project);
  const current = currentVersion(project);
  if (planHash(repoText) === current.hash) return null;
  const original = lf(await readDocText(dir, project.docs.original));
  const repo = lf(repoText);
  // A change of line endings alone isn't a new version of the plan.
  if (repo === original) return null;
  const hashes = new Set([planHash(repoText), planHash(repo)]);
  const older = versions.filter((v) => v.n !== current.n && hashes.has(v.hash)).at(-1);
  if (older) return { older: older.n };
  let added = 0;
  let removed = 0;
  for (const segment of diffText(original, repo)) {
    if (segment.kind === 'added') added += lineCount(segment.text);
    if (segment.kind === 'removed') removed += lineCount(segment.text);
  }
  const draft = lf(await readDocText(dir, project.docs.draft));
  const dryRun = await mergePlan({ base: original, ours: draft, theirs: repo }).catch((error: unknown) => {
    if (error instanceof MergeError) return null;
    throw error;
  });
  const conflicts = dryRun?.conflicts ?? [];
  const whitespaceOnly = squash(repo) === squash(original);
  const covered = conflicts.reduce((sum, c) => sum + c.ours.length, 0);
  return { from: current.n, to: current.n + 1, added, removed, conflicts: conflicts.length, whitespaceOnly, suggestFresh: whitespaceOnly || covered * 3 > draft.length };
}

/** A passage in a fenced Markdown block, its fence longer than any run of backticks inside it. "(nothing)" when it's empty. */
function fenced(text: string): string {
  const body = text.replace(/\n+$/, '');
  if (!body.trim()) return '(nothing)';
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}md\n${body}\n${fence}`;
}

/** A conflict's item body: where the repo moved it, if it did, then your draft, the repo's new version and the passage before. */
function conflictBody(c: MergeConflict, n: number): string {
  const moved = c.movedTo ? [`The repo moved this passage to § ${c.movedTo}. Your draft now has both copies.`] : [];
  return [...moved, '**Your draft**', fenced(c.ours), `**The repo (v${n})**`, fenced(c.theirs), `**Before (v${n - 1})**`, fenced(c.base)].join('\n\n');
}

/**
 * Why an update can't start now, or null. Each one is work in progress that the update would pull the draft out from
 * under: an import, threads queued for Claude, or a finalize.
 */
export async function updateRefusal(dir: string): Promise<string | null> {
  const project = await readProjectFile(dir);
  if (project.status === 'importing') return "This project is still importing. Run /dev-plumbing again once that's done.";
  const waiting = (await readThreads(dir)).values.filter((t) => t.status === 'with_claude').length;
  if (waiting === 1) return "Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered.";
  if (waiting > 1) return `Claude has ${waiting} threads to answer in this project first. Run /dev-plumbing again once they're answered.`;
  const finalize = await readFinalize(dir);
  if (finalize?.state === 'requested' || finalize?.state === 'writing') return "Finalize is under way. Run /dev-plumbing again once it's done or cancelled.";
  return null;
}

/**
 * Brings the repo's plan in as the next version (spec §15.4):
 * - docs/original.md, docs/draft.md and the items are saved to docs/versions/v<n>/;
 * - the repo's text is merged into the draft three ways, your text winning every conflict, or, with `fresh`, the
 *   draft starts again from the repo's text;
 * - the draft as merged is kept in docs/versions/v<n+1>/merged.md;
 * - each conflict becomes a Plan changes item whose thread is with Claude, queued as one submission;
 * - docs/original.md becomes the repo's text;
 * - project.json records the version and starts a re-import of every importable type.
 * Refused, writing nothing, while updateRefusal says so, when the plan hasn't changed, and when git can't merge
 * (InputError). A journal on disk lists what it creates, and project.json is written last: if anything fails, what
 * was written is put back, now or at the next try. `home` is the home folder for `~` paths.
 */
export async function updatePlan(
  dir: string,
  o: { repoText: string; clone: string; branch: string; commit: string | null; types: PlumbingType[]; fresh?: boolean; home?: string; now?: Date },
): Promise<UpdateResult> {
  const now = o.now ?? new Date();
  const at = now.toISOString();
  await recoverUnfinishedUpdate(dir);
  const refused = await updateRefusal(dir);
  if (refused) throw new ConflictError(refused);
  const project = await readProjectFile(dir);
  const current = currentVersion(project);
  if (planHash(o.repoText) === current.hash) throw new ConflictError(`The plan hasn't changed since v${current.n}.`);
  const n = current.n + 1;
  const fresh = o.fresh === true;

  // The working files as they are now, so the merge has them and a failure can tell what changed.
  const draftFile = docPath(dir, project.docs.draft);
  const originalFile = docPath(dir, project.docs.original);
  const text = (file: string, rel: string) =>
    fs.readFile(file, 'utf8').catch(() => {
      throw new StoreError(`${rel} can't be read.`);
    });
  const draftBefore = await text(draftFile, project.docs.draft);
  const originalBefore = await text(originalFile, project.docs.original);

  let merged: MergeResult;
  try {
    // A fresh start takes the repo's text as it is, with nothing to merge or settle.
    merged = fresh ? { text: o.repoText, clean: 0, conflicts: [] } : await mergePlan({ base: originalBefore, ours: draftBefore, theirs: o.repoText });
  } catch (error) {
    if (error instanceof MergeError) throw new InputError(`Couldn't merge the new plan: ${error.message}`);
    throw error;
  }

  // Older Plan changes items still open, whose passage a new conflict covers, are superseded by it.
  const { values: items } = await readItems(dir);
  const { values: threads } = await readThreads(dir);
  const statusOf = new Map(threads.map((t) => [t.id, t.status]));
  const older = items.filter((i) => i.type === PLAN_CHANGES && i.conflict?.ours.trim() && !['resolved', 'parked'].includes(statusOf.get(i.threadId) ?? 'parked'));
  /** Older item id → the title of the new item that supersedes it. */
  const superseded = new Map<string, string>();

  // One Plan changes item per conflict, in document order, each with a thread that starts with Claude.
  const taken = new Set(items.map((i) => i.id));
  const conflicts = merged.conflicts.map((c, i): { item: Item; thread: Thread } => {
    const k = i + 1;
    const id = uniqueId(`${PLAN_CHANGES}-v${n}-${k}`, taken);
    const heading = c.heading && c.heading.length <= 200 ? c.heading : null;
    const title = c.heading ?? `Change ${k}`;
    const covers = older.filter((x) => !superseded.has(x.id) && c.ours.includes(x.conflict!.ours.trim()));
    for (const x of covers) superseded.set(x.id, title);
    return {
      item: {
        id,
        key: `v${n}-${k}`,
        type: PLAN_CHANGES,
        title,
        summary: `Your draft and the repo's v${n} both changed this passage.`,
        body: conflictBody(c, n),
        ...(heading ? { mdAnchor: { heading } } : {}),
        ...(covers.length ? { links: covers.map((x) => x.id) } : {}),
        threadId: `t-${id}`,
        createdBy: 'import',
        conflict: { ours: c.ours, base: c.base, theirs: c.theirs },
      },
      thread: {
        id: `t-${id}`,
        itemId: id,
        status: 'with_claude',
        messages: [{ id: newId('m', now), at, author: 'system', text: `Your draft and the repo's v${n} both changed this passage. Claude is proposing a merged version.` }],
      },
    };
  });
  const conflictThreadIds = conflicts.map((c) => c.thread.id);
  const submission: Submission | null = conflicts.length
    ? { id: newId('s', now), at, scope: 'all', drafts: {}, sent: conflictThreadIds, resolved: [], processedAt: at }
    : null;

  const version: PlanVersion = {
    n,
    at,
    hash: planHash(o.repoText),
    clone: tildify(o.clone, o.home),
    branch: o.branch,
    commit: o.commit,
    merge: fresh ? { clean: 0, conflicts: 0, fresh: true } : { clean: merged.clean, conflicts: merged.conflicts.length },
  };
  const importPending = importableTypes(o.types).map((t) => t.id);
  // A finalized project stays Finalized only when the update left its draft as it was.
  const from = project.status === 'finalized' && !changedDraft(version) ? 'finalized' : 'active';
  const { reimporting: _earlier, ...rest } = project;
  const next: PlumbingProject = {
    ...rest,
    title: titleFromMarkdown(o.repoText) ?? project.title,
    versions: [...projectVersions(project), version],
    importPending,
    // With no type to import, there's nothing to wait for.
    status: importPending.length ? 'importing' : from,
    ...(importPending.length ? { reimporting: { version: n, from } } : {}),
    updatedAt: at,
  };

  // The journal lists every file and folder the update will create, before any of them is written.
  const files = projectFiles(dir);
  const rel = (file: string) => path.relative(dir, file).split(path.sep).join('/');
  const mergedRel = versionDocRel(n, 'merged');
  const created: string[] = [];
  for (const folder of [path.dirname(docPath(dir, mergedRel)), files.items, files.threads, files.submissions]) if (!(await lstat(folder))) created.push(rel(folder));
  for (const c of conflicts) created.push(rel(files.item(c.item.id)), rel(files.thread(c.thread.id)));
  if (submission) created.push(rel(files.submission(submission.id)));
  created.push(mergedRel);
  const journal: Journal = { to: n, created };
  try {
    await writeJsonAtomic(docPath(dir, journalRel(current.n)), journal);
    // 1. The version snapshot: the plan, the draft and the items.
    await snapshotVersion(dir, current.n);
    // 2. The conflicts' items, threads and submission, and the draft as merged.
    for (const c of conflicts) {
      await writeItem(dir, c.item);
      await writeThread(dir, c.thread);
    }
    if (submission) await writeSubmission(dir, submission);
    await writeFileAtomic(docPath(dir, mergedRel), merged.text);
    // 3. The draft, then 4. the original.
    await writeFileAtomic(draftFile, merged.text);
    await writeFileAtomic(originalFile, o.repoText);
    // 5. project.json, last: once it's written, the update has happened.
    await writeProjectFile(dir, next);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // If writing the journal is what failed, nothing else was written yet.
    const left = (await lstat(docPath(dir, journalRel(current.n)))) ? await rollBack(dir, project.docs, current.n, journal) : [];
    if (left.length === 0) {
      await fs.rmdir(docPath(dir, `docs/versions/v${current.n}`)).catch(quiet);
      await fs.rmdir(docPath(dir, 'docs/versions')).catch(quiet);
      throw new ConflictError(`The update didn't finish (${reason}). What it had written was put back, so the project is as it was. Run /dev-plumbing to try again.`);
    }
    throw new ConflictError(`The update didn't finish (${reason}), and some files couldn't be put back yet: ${left.join(', ')}. Run /dev-plumbing again to finish putting them back.`);
  }
  await fs.rm(docPath(dir, journalRel(current.n)), { force: true }).catch(quiet);
  // Older Plan changes threads the new conflicts cover are parked, pointing at the new one. The update has happened by
  // now, so if one of these can't be written, that thread just stays open.
  for (const [id, title] of superseded) {
    const thread = threads.find((t) => t.itemId === id);
    if (!thread) continue;
    const line: Message = { id: newId('m', now), at, author: 'system', text: `Superseded by the plan's v${n}: ${title}.` };
    await writeThread(dir, { ...thread, status: 'parked', messages: [...thread.messages, line] }).catch(quiet);
  }
  return { version: n, clean: version.merge!.clean, conflicts: merged.conflicts.length, fresh, conflictThreadIds, importTypes: importPending };
}
```

- [ ] **Step 4: Give back an unanswered service-made thread with its own line**

In `packages/core/src/store/queue.ts`, replace the doc comment of `finishSubmission`:
```ts
/**
 * Ends a submission. Threads Claude didn't answer go back to Your turn with your answer restored as a
 * draft. Conflicts the main window found are noted on every thread involved and flag their items.
 */
```
with:
```ts
/**
 * Ends a submission. Threads Claude didn't answer go back to Your turn with your answer restored as a
 * draft. A thread with no answer from you (one the service queued, like a Plan changes thread) just comes back to
 * you. Conflicts the main window found are noted on every thread involved and flag their items.
 */
```

Then, in its first loop, replace:
```ts
    const you = [...thread.messages].reverse().find((m): m is YouMessage => m.author === 'you');
    await writeThread(dir, {
      ...thread,
      status: 'your_turn',
      ...(you ? { draft: draftFrom(you, at) } : {}),
      messages: [...thread.messages, line("Claude didn't get to this one. Your answer is back in the box: send it again when you're ready.")],
    });
```
with:
```ts
    const you = [...thread.messages].reverse().find((m): m is YouMessage => m.author === 'you');
    await writeThread(dir, {
      ...thread,
      status: 'your_turn',
      ...(you ? { draft: draftFrom(you, at) } : {}),
      messages: [
        ...thread.messages,
        line(
          you
            ? "Claude didn't get to this one. Your answer is back in the box: send it again when you're ready."
            : "Claude didn't get to this one. Pick Keep my draft or Take the repo's version, or say what you want, and send it.",
        ),
      ],
    });
```

- [ ] **Step 5: Export it**

Add this line at the end of `packages/core/src/index.ts`:
```ts
export * from './store/update';
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/core/test/update.test.ts packages/core/test/queue.test.ts packages/core/test/submit.test.ts`
Expected: PASS (22 tests in `update.test.ts`; `queue.test.ts` and `submit.test.ts` as before, still with "Your answer is back in the box" for threads you answered).

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/store/update.ts packages/core/src/store/queue.ts packages/core/src/index.ts packages/core/test/update.test.ts
git commit -m "feat(core): an update snapshots the version, merges the new plan and queues its conflicts for Claude" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Re-import keeps your items

After an update every importable type is imported again, and `writeImportBatch` now matches the batch to the type's imported items by key while `project.reimporting` is set: a key that's back keeps its item, id and thread, updated in place and flagged only where the importer gave something different; a key the importer lists in `removed` parks its item as removed from the plan; an item it doesn't mention is left as it is; and items you or Claude added are never touched. Removal is explicit, so an answered question is never parked just because the importer left it out. When the re-import finishes, the project goes back to Finalized or Active, and only the window running the importers (or another, once that one is gone) can end an import early. The importer's pack gains the plan's changes and the type's items by key, with their drawings, the Finalize checklist says why a removed item is parked, and unparking a removed item brings it back.

**Files:**
- Modify:
  - `packages/core/src/schemas/loop.ts` (an import item's `title` and `summary` are optional; a batch's `removed`)
  - `packages/core/src/store/importItems.ts` (re-import mode in `writeImportBatch`; `claimImport`; `finishImport`)
  - `packages/core/src/store/threads.ts` (`setParked` on a removed item)
  - `packages/core/src/store/context.ts` (`ImportPack.reimport`; `existingItems`)
  - `packages/core/src/store/checklist.ts` (the removed reason)
  - `packages/core/test/importItems.test.ts` (one test in the first `describe`, and a new `describe('re-import')`)
  - `packages/core/test/context.test.ts` (the first-import pack test also checks `reimport` is null; a re-import pack test)
  - `packages/core/test/checklist.test.ts` (the removed reason)
- Test:
  - `packages/core/test/importItems.test.ts`
  - `packages/core/test/context.test.ts`
  - `packages/core/test/checklist.test.ts`

**Interfaces:**
- Consumes:
  - From Task 1:
    - `readVersionDoc` (`store/versions.ts`);
    - `PlanVersion`, `PlumbingProject.reimporting`, `PlumbingProject.importBy` and `Item.removedIn` (`schemas`);
    - `seedProject` taking `versions` and `reimporting` in its `project` overrides.
  - From Task 3: `PLAN_CHANGES` (already imported in `context.ts` by Task 3).
  - From Task 4: `updatePlan` sets `reimporting: { version, from }` and `importPending`. This task doesn't call it: its tests seed `reimporting` directly.
  - From Plans 1–4: `stable` (`store/changes.ts`); `readThread`, `readItem`, `readDecisions` (`store/io.ts`); `activeDecisions` (`store/decisions.ts`), and `addDecision` in the tests; `diffText` (`docDiff.ts`); `setParked` (`store/threads.ts`).
- Produces, exactly as the header's Contracts:
  - `importItemSchema`: `title` and `summary` optional; `importBatchSchema.removed: z.array(idSchema).max(200).optional()`. `newItemSchema` (a reply's new items) still requires both.
  - `writeImportBatch` in re-import mode, with the same signature. Its `itemIds` are the ids of the batch's items, in batch order, reused ids included.
  - `claimImport(dir: string, windowId: string): Promise<void>`, which Task 6's `/open` calls.
  - `finishImport(dir: string, o?: { windowId?: string; isAlive?: (windowId: string) => boolean; now?: Date }): Promise<boolean>`, which Task 6's `/wait` calls with its window id and `rt.listeners.isAlive`.
  - `ImportPack.reimport: { from: number; to: number; changes: string; existing: { key: string; id: string; title: string; summary: string; body: string | null; fields: Record<string, string>; mdAnchor: { heading: string } | null; hasData: boolean; data: unknown; removed: boolean }[] } | null`.
  - `ImportPack.existingItems: { id: string; type: string; title: string; removed?: true }[]`, without Plan changes items.
  - `checklistFrom`: a parked item with `removedIn` has the reason "Removed from the plan in v<n>.".
  - `setParked(dir, threadId, false)` on a thread whose item has `removedIn` clears it, and resolves the thread when it has an active decision.
- **Rules** (`N` is `project.reimporting.version`):
  - **Matching:** the type's items with `createdBy: 'import'` and a `key` are matched by key, the first in file-name order winning. A batch key that matches reuses the item's id: no `-2`, and the same thread. Any other key gets a new id with `uniqueId` as before, so a key that only an item you or Claude added has makes a new item.
  - **A batch** is `items`, `removed`, both, or `noChanges` alone. `items` may be empty when `removed` is given (a type whose items all left the plan). Otherwise the existing message: "Send either items (at least one) or noChanges with a reason. Not both, and not neither."
  - **Validation** runs before any write, with the checks it had, plus:
    - an item whose key matches no imported item (a new item, and every item at a first import) needs a `title` and a `summary`: "Item <i> (<key>): A new item needs a title and a summary.";
    - each key in `removed` must be the key of one of the type's imported items: `removed: "<key>" isn't the key of an item <type title> imported before.` (so at a first import, `removed` is always refused), and must not be in `items` too: `removed: "<key>" is in items too. Send it in one or the other.`
  - **What the importer gave:** only the fields the batch item has: `title`, `summary`, `body`, `fields`, `mdAnchor`, `codeRefs` (checked against the clone), `links` (keys swapped for ids) and `data` (phase keys swapped for ids). A new item is written from these as at import: an empty body, link list or code reference list is left out, so its file is the same as before this task.
  - **A matched item** becomes `{ ...old, ...given }`, so a field the importer leaves out keeps its value, title and summary included.
    - **Changed** means a field the importer gave differs from the item's, compared with `stable()`. An empty body, link list, code reference list or field set counts as absent; `codeRefs` are compared as a set (sorted), without `verified`; and `mdAnchor` is compared by its heading only.
    - **Neither changed nor back in the plan:** nothing is written.
    - **Changed:** the item is written without `removedIn`, with the flag `{ reason: "Changed in the plan's v<N>.", fromThreadId: item.threadId, at }` added to any it had. Its thread gets the line "Updated from the plan's v<N>.". The batch item's `message` is added as a Claude message with `opening: true` only when the thread is `idle` or `your_turn`, and then the status is `your_turn`.
    - **Back in the plan** (it had `removedIn`): `removedIn` is cleared. A parked thread whose answer still stands (it has an active decision: `activeDecisions(await readDecisions(dir))` has one with its `threadId`) goes back to `resolved`. Any other parked thread goes to `your_turn` when its last non-system message is Claude's, otherwise to `idle`. The thread gets the line "Back in the plan in v<N>." whether it was parked or not, before any "Updated" line.
  - **Removed from the plan:** each key in `removed` whose item doesn't have `removedIn` yet gets `removedIn: N` and the line "Removed from the plan in v<N>.". Its thread is parked whatever its status (resolved included), except `with_claude`: that thread keeps its status, and the item gets the flag `{ reason: 'Removed from the plan in v<N>.', fromThreadId: item.threadId, at }` instead. Nothing is deleted. An imported item the batch neither sends nor lists is left exactly as it is, whatever its status.
  - **`emptyTypes`:** an items or `removed` batch removes the type's entry, at first import too. `noChanges` replaces the type's entry, except in a re-import of a type that has items (of any author): then `emptyTypes` is left as it is, and so are the items.
  - **Who ends an import:** `claimImport` sets `importBy` to the window id while the project is `importing` (and does nothing otherwise). `finishImport` ends the import only when there's no `importBy`, when `windowId` is `importBy`, or when `isAlive(importBy)` is false (with no `isAlive`, `importBy` counts as alive). Otherwise it returns false and writes nothing.
  - **Finishing:** when the last pending type writes, or `finishImport` runs, the status becomes `reimporting.from` (`active` when it's not set), and `reimporting` and `importBy` are removed. `finishImport` marks a pending type `IMPORT_DID_NOT_FINISH` only when it has no `emptyTypes` entry and no items.
  - **`setParked(dir, threadId, false)`** on a thread whose item has `removedIn`: the item is written without it, and the thread goes to `resolved` when it has an active decision, otherwise to `your_turn` or `idle` as before. The line is "Unparked.", as for any thread.
  - **`importPack.reimport`** is null without `project.reimporting`. Otherwise:
    - `from` is `N - 1`, `to` is `N`;
    - `changes` diffs the two versions' plans (`readVersionDoc(…, 'original')`), with `\r\n` read as `\n`. Each line of `diffText`'s segments is written as `+ <line>`, `- <line>` or `  <line>`, with trailing spaces trimmed (so a blank line is `+`, `-` or empty). Only changed lines and up to 2 unchanged lines either side are kept, and each run of kept lines starts with a line `@@`. When nothing changed, `changes` is `''`;
    - `existing` is the type's items with `createdBy: 'import'` and a key, in file-name order, as `{ key, id, title, summary, body: body ?? null, fields: fields ?? {}, mdAnchor: { heading } or null, hasData: data !== undefined, data: data ?? null, removed: removedIn !== undefined }`. `data` is the drawing as the threads left it, so an importer edits it rather than redrawing it.
  - **`importPack.existingItems`** leaves out Plan changes items (they aren't part of the plan, so a phase or a link must not point at them), and marks an item with `removedIn` as `removed: true`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/importItems.test.ts`, replace the imports from `../src/schemas`, `../src/store/importItems` and `../src/store/io`:
```ts
import { importItemSchema, itemPatchSchema, newItemSchema, type Item, type Thread } from '../src/schemas';
import { finishImport, verifyCodeRefs, writeImportBatch } from '../src/store/importItems';
import { InputError, readItem, readItems, readProjectFile, readThread } from '../src/store/io';
```
with:
```ts
import { importItemSchema, itemPatchSchema, newItemSchema, type ImportItem, type Item, type Message, type PlumbingProject, type Thread } from '../src/schemas';
import { addDecision } from '../src/store/decisions';
import { claimImport, finishImport, IMPORT_DID_NOT_FINISH, verifyCodeRefs, writeImportBatch } from '../src/store/importItems';
import { InputError, readItem, readItems, readProjectFile, readThread, readThreads, writeProjectFile } from '../src/store/io';
import { setParked } from '../src/store/threads';
```

Add a test before `it('keeps new item ids clear of existing ones', …)`. Replace:
```ts
  it('keeps new item ids clear of existing ones', async () => {
```
with:
```ts
  it('is ended early only by the window that runs the importers, or by another once that one is gone', async () => {
    const dir = await importing();
    await claimImport(dir, 'w-a');
    expect((await readProjectFile(dir)).importBy).toBe('w-a');
    // Another window listening on the project, while w-a's importers are still at work.
    expect(await finishImport(dir, { windowId: 'w-b', isAlive: (w) => w === 'w-a' })).toBe(false);
    expect((await readProjectFile(dir)).status).toBe('importing');
    // w-a is gone.
    expect(await finishImport(dir, { windowId: 'w-b', isAlive: () => false })).toBe(true);
    const p = await readProjectFile(dir);
    expect(p.status).toBe('active');
    expect(p.importBy).toBeUndefined();
    // Once it's done, nothing is claimed.
    await claimImport(dir, 'w-c');
    expect((await readProjectFile(dir)).importBy).toBeUndefined();

    const own = await importing();
    await claimImport(own, 'w-a');
    expect(await finishImport(own, { windowId: 'w-a', isAlive: () => true })).toBe(true);
    // The last batch ends it too, whoever sent it.
    const last = await importing();
    await claimImport(last, 'w-a');
    await writeImportBatch({ dir: last, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'None.' } });
    expect((await readProjectFile(last)).importBy).toBe('w-a');
    expect((await writeImportBatch({ dir: last, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'None.' } })).importFinished).toBe(true);
    expect((await readProjectFile(last)).importBy).toBeUndefined();
  });

  it('keeps new item ids clear of existing ones', async () => {
```

Then add at the end of the file:
```ts
describe('re-import', () => {
  const T2 = new Date('2026-10-05T10:00:00.000Z');
  const T3 = new Date('2026-10-06T10:00:00.000Z');
  const AT = '2026-10-01T09:00:00.000Z';
  /** A Questions item an importer wrote for `key` at an earlier version: id questions-<key>, titled "Question <key>". */
  const imported = (key: string, o: Parameters<typeof pair>[1] = {}): { item: Item; thread: Thread } => {
    const p = pair(`questions-${key}`, { title: `Question ${key}`, ...o });
    return { ...p, item: { ...p.item, key } };
  };
  /** The batch item that says exactly what imported(key) holds. */
  const same = (key: string): ImportItem => ({ key, title: `Question ${key}`, summary: 'A summary.' });
  /** A project re-importing Questions (and any other `pending` types) for v2, or `version`. */
  const reimporting = (
    pairs: { item: Item; thread: Thread }[],
    o: { version?: number; from?: 'active' | 'finalized'; pending?: string[]; project?: Partial<PlumbingProject> } = {},
  ) =>
    seedProject({
      pairs,
      project: { status: 'importing', importPending: o.pending ?? ['questions'], reimporting: { version: o.version ?? 2, from: o.from ?? 'active' }, ...o.project },
    });
  /** A Questions batch: `items`, and the keys the new version took out of the plan. */
  const send = (dir: string, items: ImportItem[], o: { now?: Date; removed?: string[] } = {}) =>
    writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { items, ...(o.removed ? { removed: o.removed } : {}) }, now: o.now ?? T2 });
  const files = (dir: string, ...rels: string[]) => Promise.all(rels.map((rel) => fs.readFile(path.join(dir, rel), 'utf8')));
  const pairFiles = (id: string) => [`items/${id}.json`, `threads/t-${id}.json`];
  const answered: Message[] = [
    { id: 'm-1', at: AT, author: 'claude', text: 'Who first?', opening: true, options: [{ id: 'all', label: 'Everyone' }, { id: 'some', label: 'Active subscribers' }] },
    { id: 'y-1', at: AT, author: 'you', optionId: 'some', optionLabel: 'Active subscribers' },
    { id: 'm-2', at: AT, author: 'claude', text: 'Active subscribers first, then everyone.', resolved: true },
  ];

  it('leaves an item whose key and content are the same untouched', async () => {
    const who = imported('who');
    // Its code reference was checked against a clone at import. This batch's clone doesn't have the file, which isn't a change to the plan.
    const dir = await reimporting([{ ...who, item: { ...who.item, codeRefs: [{ path: 'src/jobs/reminders.ts', verified: true }] } }]);
    const before = await files(dir, ...pairFiles('questions-who'));
    const r = await send(dir, [{ ...same('who'), codeRefs: [{ path: 'src/jobs/reminders.ts' }], message: { text: 'Who should get them first?' } }]);
    expect(r).toEqual({ itemIds: ['questions-who'], importFinished: true });
    expect(await files(dir, ...pairFiles('questions-who'))).toEqual(before);
    expect((await readItems(dir)).values.map((i) => i.id)).toEqual(['questions-who']);
  });

  it('keeps what the importer leaves out: a key on its own changes nothing', async () => {
    const who = imported('who', { fields: { blocking: 'true' }, links: ['questions-when'] });
    const item = { ...who.item, body: 'Everyone, or only active subscribers?', mdAnchor: { heading: 'Approach' }, codeRefs: [{ path: 'src/jobs/reminders.ts', verified: true }] };
    const dir = await reimporting([{ ...who, item }, imported('when')]);
    const before = await files(dir, ...pairFiles('questions-who'), ...pairFiles('questions-when'));
    expect((await send(dir, [{ key: 'who' }, same('when')])).itemIds).toEqual(['questions-who', 'questions-when']);
    expect(await files(dir, ...pairFiles('questions-who'), ...pairFiles('questions-when'))).toEqual(before);
  });

  it('compares an anchor by its heading, and code references as a set', async () => {
    const who = imported('who');
    const refs = [{ path: 'src/jobs/reminders.ts', verified: true }, { path: 'src/db/schema.prisma', verified: false }];
    const dir = await reimporting([{ ...who, item: { ...who.item, mdAnchor: { heading: 'Approach', lines: [5, 7] }, codeRefs: refs } }]);
    const before = await files(dir, ...pairFiles('questions-who'));
    const r = await send(dir, [{ key: 'who', mdAnchor: { heading: 'Approach' }, codeRefs: [{ path: 'src/db/schema.prisma' }, { path: 'src/jobs/reminders.ts' }] }]);
    expect(r.itemIds).toEqual(['questions-who']);
    expect(await files(dir, ...pairFiles('questions-who'))).toEqual(before);
  });

  it('a changed body with no data keeps the drawing, and flags the item', async () => {
    const map = drawn('architecture-map', 'architecture', reminderMap);
    const dir = await reimporting([{ ...map, item: { ...map.item, key: 'map', body: 'The job runs daily.' } }], { pending: ['architecture'] });
    await writeImportBatch({ dir, type: architecture, types: ALL, clone: '/x', now: T2, batch: { items: [{ key: 'map', title: 'Question architecture-map', summary: 'A summary.', body: 'The job runs hourly.' }] } });
    expect(await readItem(dir, 'architecture-map')).toMatchObject({
      body: 'The job runs hourly.',
      data: reminderMap,
      flags: [{ reason: "Changed in the plan's v2.", fromThreadId: 't-architecture-map', at: T2.toISOString() }],
    });
  });

  it('updates a changed item in place, flags it, and asks only on a thread that is idle or yours', async () => {
    const earlier = { reason: 'Might clash with the SMS answer.', fromThreadId: 't-questions-sms', at: AT };
    const anchor = { itemId: 'questions-parent', kind: 'node' as const, ref: 'job', label: 'Daily reminder job' };
    const resolved = imported('how', { status: 'resolved', messages: answered });
    const dir = await reimporting([
      imported('who', { status: 'idle', messages: [] }),
      imported('when'),
      { ...resolved, item: { ...resolved.item, anchor, flags: [earlier] } },
    ]);
    const question = { text: 'Email or SMS first?', options: [{ id: 'email', label: 'Email' }, { id: 'sms', label: 'SMS' }], recommended: 'email' };
    const r = await send(
      dir,
      ['who', 'when', 'how'].map((key) => ({ ...same(key), summary: 'Now about email and SMS.', message: question })),
    );
    expect(r.itemIds).toEqual(['questions-who', 'questions-when', 'questions-how']);
    const changed = (threadId: string) => ({ reason: "Changed in the plan's v2.", fromThreadId: threadId, at: T2.toISOString() });
    expect(await readItem(dir, 'questions-who')).toEqual({
      id: 'questions-who',
      key: 'who',
      type: 'questions',
      title: 'Question who',
      summary: 'Now about email and SMS.',
      threadId: 't-questions-who',
      createdBy: 'import',
      flags: [changed('t-questions-who')],
    });
    expect(await readItem(dir, 'questions-how')).toMatchObject({ summary: 'Now about email and SMS.', anchor, flags: [earlier, changed('t-questions-how')] });
    const line = { author: 'system', text: "Updated from the plan's v2." };
    const asked = { author: 'claude', text: 'Email or SMS first?', opening: true, recommended: 'email' };
    // Idle: the line, then the question, and it's your turn.
    const who = await readThread(dir, 't-questions-who');
    expect(who.status).toBe('your_turn');
    expect(who.messages).toMatchObject([line, asked]);
    // Waiting for you: the same, after what was there.
    const when = await readThread(dir, 't-questions-when');
    expect(when.status).toBe('your_turn');
    expect(when.messages).toMatchObject([{ id: 'm-questions-when' }, line, asked]);
    // Resolved: only the line. The thread stays resolved.
    const how = await readThread(dir, 't-questions-how');
    expect(how.status).toBe('resolved');
    expect(how.messages).toMatchObject([...answered.map((m) => ({ id: m.id })), line]);
    expect((await readItems(dir)).values).toHaveLength(3);
  });

  it('adds an item for a new key, as at import', async () => {
    const dir = await reimporting([imported('who')]);
    const r = await send(dir, [same('who'), { key: 'how-often', title: 'How often?', summary: 'Once, or until they reorder?', message: { text: 'Remind once?' } }]);
    expect(r.itemIds).toEqual(['questions-who', 'questions-how-often']);
    expect(await readItem(dir, 'questions-how-often')).toMatchObject({ key: 'how-often', createdBy: 'import', threadId: 't-questions-how-often' });
    expect((await readThread(dir, 't-questions-how-often')).status).toBe('your_turn');
  });

  it('a removed section parks its items, and they come back if it returns', async () => {
    const dir = await reimporting([
      imported('who'),
      imported('why', { status: 'idle', messages: [] }),
      imported('when', { status: 'resolved', messages: answered }),
      imported('how', { status: 'with_claude', messages: answered.slice(0, 2) }),
      imported('what'),
    ]);
    // The importer lists the keys whose part of the plan v2 took out.
    await send(dir, [same('what')], { removed: ['who', 'why', 'when', 'how'] });
    const removed = { author: 'system', text: 'Removed from the plan in v2.' };
    for (const [id, status] of [
      ['questions-who', 'parked'],
      ['questions-why', 'parked'],
      ['questions-when', 'parked'],
      ['questions-how', 'with_claude'],
    ]) {
      expect((await readItem(dir, id)).removedIn).toBe(2);
      const thread = await readThread(dir, `t-${id}`);
      expect(thread.status).toBe(status);
      expect(thread.messages.at(-1)).toMatchObject(removed);
    }
    // Claude is working on that one, so it's flagged instead of parked.
    expect((await readItem(dir, 'questions-how')).flags).toEqual([{ reason: 'Removed from the plan in v2.', fromThreadId: 't-questions-how', at: T2.toISOString() }]);
    expect((await readItem(dir, 'questions-what')).removedIn).toBeUndefined();
    expect((await readThread(dir, 't-questions-what')).status).toBe('your_turn');
    // Nothing is deleted.
    expect((await readItems(dir)).values.map((i) => i.id).sort()).toEqual(['questions-how', 'questions-what', 'questions-when', 'questions-who', 'questions-why']);

    // v3 brings who, why and when back, when with new content. how is still gone, and is left as it is.
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), status: 'importing', importPending: ['questions'], reimporting: { version: 3, from: 'active' } });
    const how = await files(dir, ...pairFiles('questions-how'));
    await send(dir, [same('who'), same('why'), { ...same('when'), summary: 'Back, and changed.' }, same('what')], { now: T3 });
    const back = { author: 'system', text: 'Back in the plan in v3.' };
    // Unparked: your turn when Claude spoke last, idle otherwise.
    const who = await readThread(dir, 't-questions-who');
    expect(who.status).toBe('your_turn');
    expect(who.messages).toMatchObject([{ id: 'm-questions-who' }, removed, back]);
    expect((await readItem(dir, 'questions-who')).removedIn).toBeUndefined();
    expect((await readThread(dir, 't-questions-why')).status).toBe('idle');
    const when = await readThread(dir, 't-questions-when');
    expect(when.status).toBe('your_turn');
    expect(when.messages.slice(-3)).toMatchObject([removed, back, { author: 'system', text: "Updated from the plan's v3." }]);
    const whenItem = await readItem(dir, 'questions-when');
    expect(whenItem.removedIn).toBeUndefined();
    expect(whenItem).toMatchObject({ summary: 'Back, and changed.', flags: [{ reason: "Changed in the plan's v3.", fromThreadId: 't-questions-when', at: T3.toISOString() }] });
    expect(await files(dir, ...pairFiles('questions-how'))).toEqual(how);
  });

  it('an item that comes back with an answer that still stands is resolved again', async () => {
    const decided = imported('who', { status: 'parked', messages: answered });
    const open = imported('when', { status: 'parked', messages: answered });
    const dir = await reimporting(
      [
        { ...decided, item: { ...decided.item, removedIn: 2 } },
        { ...open, item: { ...open.item, removedIn: 2 } },
      ],
      { version: 3 },
    );
    await addDecision(dir, { text: 'Active subscribers get reminders first.', threadId: 't-questions-who', itemIds: ['questions-who'] });
    await send(dir, [same('who'), same('when')], { now: T3 });
    const back = { author: 'system', text: 'Back in the plan in v3.' };
    // Its decision is still active, so the thread is resolved again, with the line.
    const who = await readThread(dir, 't-questions-who');
    expect(who.status).toBe('resolved');
    expect(who.messages).toMatchObject([...answered.map((m) => ({ id: m.id })), back]);
    expect((await readItem(dir, 'questions-who')).removedIn).toBeUndefined();
    // With no decision, it goes to whoever spoke last: Claude did, so it's your turn.
    expect((await readThread(dir, 't-questions-when')).status).toBe('your_turn');
  });

  it('a re-import keeps every answered thread', async () => {
    const followUp: Message = { id: 'm-3', at: AT, author: 'claude', text: 'And after launch?', options: [{ id: 'all', label: 'Everyone' }] };
    const dir = await reimporting([
      imported('who', { status: 'resolved', messages: answered }),
      imported('when', { status: 'your_turn', messages: [...answered.slice(0, 2), followUp] }),
      imported('how', { status: 'with_claude', messages: answered.slice(0, 2) }),
      imported('why', { status: 'resolved', messages: answered }),
    ]);
    await addDecision(dir, { text: 'Active subscribers get reminders first.', threadId: 't-questions-who', itemIds: ['questions-who'] });
    await addDecision(dir, { text: 'Remind before the item runs out.', threadId: 't-questions-why', itemIds: ['questions-why'] });
    const decisions = await files(dir, 'decisions.json');
    const before = (await readThreads(dir)).values;
    const why = await files(dir, ...pairFiles('questions-why'));
    // The draft now answers why, so the importer doesn't send it. It isn't removed: only `removed` removes.
    await send(dir, [
      { ...same('who'), summary: 'Everyone, or only some customers?', message: { text: 'Who should get them first?' } },
      same('when'),
      { ...same('how'), body: 'Now with SMS.' },
    ]);
    expect(await files(dir, ...pairFiles('questions-why'))).toEqual(why);
    expect(await files(dir, 'decisions.json')).toEqual(decisions);
    const after = (await readThreads(dir)).values;
    expect(after.map((t) => [t.id, t.itemId, t.status])).toEqual(before.map((t) => [t.id, t.itemId, t.status]));
    for (const [i, thread] of after.entries()) expect(thread.messages.slice(0, before[i].messages.length)).toEqual(before[i].messages);
    expect((await readItems(dir)).values.map((i) => [i.id, i.threadId, i.removedIn])).toEqual([
      ['questions-how', 't-questions-how', undefined],
      ['questions-when', 't-questions-when', undefined],
      ['questions-who', 't-questions-who', undefined],
      ['questions-why', 't-questions-why', undefined],
    ]);
  });

  it('removes only what the importer lists, and may send nothing else when a type left the plan', async () => {
    const dir = await reimporting([imported('who'), imported('when', { status: 'resolved', messages: answered }), imported('how')]);
    const how = await files(dir, ...pairFiles('questions-how'));
    expect(await send(dir, [], { removed: ['who', 'when'] })).toEqual({ itemIds: [], importFinished: true });
    for (const id of ['questions-who', 'questions-when']) {
      expect((await readItem(dir, id)).removedIn).toBe(2);
      expect((await readThread(dir, `t-${id}`)).status).toBe('parked');
    }
    expect(await files(dir, ...pairFiles('questions-how'))).toEqual(how);
  });

  it('checks the removed keys, and that a new key has a title and a summary, writing nothing until all is right', async () => {
    const dir = await reimporting([imported('who'), imported('when')], { pending: ['questions', 'architecture'] });
    const before = await files(dir, 'project.json', ...pairFiles('questions-who'), ...pairFiles('questions-when'));
    const attempt = send(dir, [same('who'), { key: 'how-often', summary: 'Once, or until they reorder?' }], { removed: ['who', 'nope'] });
    await expect(attempt).rejects.toThrow(InputError);
    const message = await attempt.catch((e: Error) => e.message);
    expect(message).toContain('Item 2 (how-often): A new item needs a title and a summary.');
    expect(message).toContain('removed: "who" is in items too. Send it in one or the other.');
    expect(message).toContain('removed: "nope" isn\'t the key of an item Questions imported before.');
    expect(await files(dir, 'project.json', ...pairFiles('questions-who'), ...pairFiles('questions-when'))).toEqual(before);
    // At a first import there's nothing to remove.
    const first = await importing();
    await expect(writeImportBatch({ dir: first, type: questions, types: TYPES, clone: '/x', batch: { removed: ['who'] } })).rejects.toThrow(/"who" isn't the key of an item Questions imported before/);
  });

  it('unparking an item removed from the plan brings it back, resolved when its answer still stands', async () => {
    const decided = imported('who', { status: 'parked', messages: answered });
    const open = imported('when', { status: 'parked', messages: answered });
    const dir = await seedProject({ pairs: [{ ...decided, item: { ...decided.item, removedIn: 2 } }, { ...open, item: { ...open.item, removedIn: 2 } }] });
    await addDecision(dir, { text: 'Active subscribers get reminders first.', threadId: 't-questions-who', itemIds: ['questions-who'] });
    expect((await setParked(dir, 't-questions-who', false)).status).toBe('resolved');
    expect((await readItem(dir, 'questions-who')).removedIn).toBeUndefined();
    expect((await setParked(dir, 't-questions-when', false)).status).toBe('your_turn');
    expect((await readItem(dir, 'questions-when')).removedIn).toBeUndefined();
    expect((await readThread(dir, 't-questions-when')).messages.at(-1)).toMatchObject({ author: 'system', text: 'Unparked.' });
  });

  it('never touches items you or Claude added', async () => {
    const mine = pair('questions-mine', { title: 'Mine' });
    const claudes = pair('questions-extra', { title: 'From Claude' });
    const dir = await reimporting([
      imported('who'),
      { ...mine, item: { ...mine.item, key: 'mine', createdBy: 'you' } },
      { ...claudes, item: { ...claudes.item, createdBy: 'claude' } },
    ]);
    const theirs = [...pairFiles('questions-mine'), ...pairFiles('questions-extra')];
    const before = await files(dir, ...theirs);
    // Only imported items are matched: a key that only your item has is a new item.
    const r = await send(dir, [same('who'), { key: 'mine', title: 'Mine', summary: 'From the plan this time.' }]);
    expect(r.itemIds).toEqual(['questions-who', 'questions-mine-2']);
    expect(await files(dir, ...theirs)).toEqual(before);
  });

  it('links to items it reuses by their ids', async () => {
    const dir = await reimporting([imported('who'), imported('when')]);
    await send(dir, [{ ...same('who'), links: ['when'] }, same('when'), { key: 'how', title: 'How?', summary: 'By email?', links: ['who', 'questions-when'] }]);
    expect((await readItem(dir, 'questions-who')).links).toEqual(['questions-when']);
    expect((await readItem(dir, 'questions-how')).links).toEqual(['questions-who', 'questions-when']);
  });

  it('a Phases batch lists reused items by their ids', async () => {
    const build = drawn('phases-build', 'phases', { order: 1, goal: 'The job sends reminders.', doneWhen: ['Runs in staging'], itemIds: ['architecture-map'] });
    const dir = await reimporting([drawn('architecture-map', 'architecture', reminderMap), { ...build, item: { ...build.item, key: 'build' } }], { pending: ['phases'] });
    const before = await files(dir, ...pairFiles('phases-build'));
    await writeImportBatch({
      dir,
      type: phases,
      types: ALL,
      clone: '/x',
      now: T2,
      batch: {
        items: [
          { key: 'build', title: 'Question phases-build', summary: 'A summary.', data: { order: 1, goal: 'The job sends reminders.', doneWhen: ['Runs in staging'], itemIds: ['architecture-map'] } },
          { key: 'launch', title: 'Launch', summary: 's', data: { order: 2, goal: 'Everyone gets reminders.', doneWhen: ['On for all customers'], itemIds: ['build', 'architecture-map'] } },
        ],
      },
    });
    expect(await files(dir, ...pairFiles('phases-build'))).toEqual(before);
    expect((await readItem(dir, 'phases-launch')).data).toMatchObject({ itemIds: ['phases-build', 'architecture-map'] });
  });

  it('"no changes" leaves the items alone, and is recorded only for a type with none', async () => {
    const dir = await reimporting([imported('who')], { pending: ['questions', 'architecture'] });
    const before = await files(dir, ...pairFiles('questions-who'));
    await writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'Nothing changed for questions.' } });
    await writeImportBatch({ dir, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'Nothing structural changes.' } });
    expect(await files(dir, ...pairFiles('questions-who'))).toEqual(before);
    expect((await readThread(dir, 't-questions-who')).messages).toHaveLength(1);
    expect((await readProjectFile(dir)).emptyTypes).toEqual([{ type: 'architecture', reason: 'Nothing structural changes.' }]);
  });

  it('an items batch clears an earlier "no changes", at first import too', async () => {
    const emptyTypes = [
      { type: 'questions', reason: 'The plan leaves nothing open.' },
      { type: 'architecture', reason: 'Nothing structural changes.' },
    ];
    const dir = await seedProject({ project: { status: 'importing', importPending: ['questions'], emptyTypes } });
    await send(dir, [same('who')]);
    expect((await readProjectFile(dir)).emptyTypes).toEqual([emptyTypes[1]]);
  });

  it('finishing puts the project back to Finalized, or to Active', async () => {
    const finalized = await reimporting([imported('who')], { from: 'finalized' });
    expect((await send(finalized, [same('who')])).importFinished).toBe(true);
    const done = await readProjectFile(finalized);
    expect(done).toMatchObject({ status: 'finalized', importPending: [] });
    expect(done.reimporting).toBeUndefined();

    const active = await reimporting([imported('who')], { pending: ['questions', 'architecture'] });
    await send(active, [same('who')]);
    expect((await readProjectFile(active)).status).toBe('importing');
    await writeImportBatch({ dir: active, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'Nothing structural changes.' } });
    const back = await readProjectFile(active);
    expect(back).toMatchObject({ status: 'active', importPending: [] });
    expect(back.reimporting).toBeUndefined();
  });

  it("finishing early marks only the types with no items as didn't finish", async () => {
    const dir = await reimporting([imported('who')], { from: 'finalized', pending: ['questions', 'architecture'] });
    expect(await finishImport(dir)).toBe(true);
    const project = await readProjectFile(dir);
    expect(project).toMatchObject({ status: 'finalized', importPending: [], emptyTypes: [{ type: 'architecture', reason: IMPORT_DID_NOT_FINISH }] });
    expect(project.reimporting).toBeUndefined();
    expect(await finishImport(dir)).toBe(false);
  });
});
```

In `packages/core/test/context.test.ts`, replace the imports:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { dataShapeDoc, repoProfileSchema } from '../src/schemas';
import { importPack, threadPack } from '../src/store/context';
import { addDecision } from '../src/store/decisions';
import { readItem, writeItem } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, pair, seedProject, TYPES } from './fixtures';
```
with:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { writeFileAtomic } from '../src/atomic';
import { dataShapeDoc, repoProfileSchema, type PlanVersion } from '../src/schemas';
import { importPack, threadPack } from '../src/store/context';
import { addDecision } from '../src/store/decisions';
import { readItem, writeItem } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, listType, pair, seedProject, TYPES } from './fixtures';
```

In the test `gives an importer the whole draft, its rules file and the repo profile`, replace:
```ts
    expect(pack.existingItems).toEqual([{ id: 'q1', type: 'questions', title: 'Question q1' }]);
```
with:
```ts
    expect(pack.existingItems).toEqual([{ id: 'q1', type: 'questions', title: 'Question q1' }]);
    expect(pack.reimport).toBeNull();
```

Then add a test before `gives a pin thread the whole item it is anchored to, data included`. Replace:
```ts
  it('gives a pin thread the whole item it is anchored to, data included', async () => {
```
with:
```ts
  it("gives a re-importer the plan's changes and this type's imported items", async () => {
    const version = (n: number): PlanVersion => ({ n, at: '2026-10-01T09:00:00.000Z', hash: `h${n}`, clone: '/tmp/acme', branch: 'main', commit: null });
    const v2 = DRAFT.replace('Log reminders in a table.', 'Log reminders in a table, by day.');
    const v3 = v2
      .replace('Remind customers before a subscription item runs out.', 'Remind customers a few days before a subscription item runs out.')
      .replace('Log reminders in a table, by day.', 'Log reminders in a table, by day.\n\n## Channels\n\nSend by SMS.');
    const who = pair('questions-who', { title: 'Who gets reminders?', fields: { blocking: 'true' } });
    const gone = pair('questions-gone', { title: 'SMS later?', status: 'parked' });
    const mine = pair('questions-mine', { title: 'Mine' });
    const map = pair('architecture-map', { type: 'architecture', title: 'Reminder job' });
    const conflict = pair('plan-changes-v2-1', { type: 'plan-changes', title: 'Data' });
    const dir = await seedProject({
      pairs: [
        { ...who, item: { ...who.item, key: 'who', body: 'Everyone, or only active subscribers?', mdAnchor: { heading: 'Data', lines: [9, 11] } } },
        { ...gone, item: { ...gone.item, key: 'gone', removedIn: 2 } },
        { ...mine, item: { ...mine.item, createdBy: 'you' } },
        { ...map, item: { ...map.item, key: 'map', data: { kind: 'system', groups: [], nodes: [], edges: [] } } },
        { ...conflict, item: { ...conflict.item, key: 'v2-1' } },
      ],
      project: { status: 'importing', importPending: ['questions', 'architecture'], versions: [version(1), version(2), version(3)], reimporting: { version: 3, from: 'active' } },
    });
    await writeFileAtomic(path.join(dir, 'docs', 'versions', 'v2', 'original.md'), v2);
    await fs.writeFile(path.join(dir, 'docs', 'original.md'), v3);
    const pack = await importPack({ dir, typeId: 'questions', types: TYPES });
    expect(pack.reimport).toEqual({
      from: 2,
      to: 3,
      changes: [
        '@@',
        '  # Restock reminders',
        '',
        '- Remind customers before a subscription item runs out.',
        '+ Remind customers a few days before a subscription item runs out.',
        '',
        '  ## Approach',
        '@@',
        '',
        '  Log reminders in a table, by day.',
        '+',
        '+ ## Channels',
        '+',
        '+ Send by SMS.',
      ].join('\n'),
      existing: [
        { key: 'gone', id: 'questions-gone', title: 'SMS later?', summary: 'A summary.', body: null, fields: {}, mdAnchor: null, hasData: false, data: null, removed: true },
        {
          key: 'who',
          id: 'questions-who',
          title: 'Who gets reminders?',
          summary: 'A summary.',
          body: 'Everyone, or only active subscribers?',
          fields: { blocking: 'true' },
          mdAnchor: { heading: 'Data' },
          hasData: false,
          data: null,
          removed: false,
        },
      ],
    });
    // The draft is still the whole draft, and every item but the Plan changes one is still listed, a removed one marked.
    expect(pack.draft).toBe(DRAFT);
    expect(pack.existingItems).toEqual([
      { id: 'architecture-map', type: 'architecture', title: 'Reminder job' },
      { id: 'questions-gone', type: 'questions', title: 'SMS later?', removed: true },
      { id: 'questions-mine', type: 'questions', title: 'Mine' },
      { id: 'questions-who', type: 'questions', title: 'Who gets reminders?' },
    ]);
    // A drawing comes with its data, so the importer edits what the threads settled rather than redrawing it.
    expect((await importPack({ dir, typeId: 'architecture', types: TYPES })).reimport?.existing).toEqual([
      {
        key: 'map',
        id: 'architecture-map',
        title: 'Reminder job',
        summary: 'A summary.',
        body: null,
        fields: {},
        mdAnchor: null,
        hasData: true,
        data: { kind: 'system', groups: [], nodes: [], edges: [] },
        removed: false,
      },
    ]);
  });

  it('gives a pin thread the whole item it is anchored to, data included', async () => {
```

In `packages/core/test/checklist.test.ts`, add a test before `counts the changes applied since the last final`. Replace:
```ts
  it('counts the changes applied since the last final', () => {
```
with:
```ts
  it('says why an item removed from the plan is parked', () => {
    const gone = pair('q-gone', { title: 'SMS opt-in', status: 'parked' });
    const pairs = [{ ...gone, item: { ...gone.item, removedIn: 2 } }, pair('q-later', { title: 'Later', status: 'parked' })];
    const list = checklistFrom({ items: pairs.map((p) => p.item), threads: pairs.map((p) => p.thread), history: [], types: TYPES });
    expect(list.parked).toEqual([
      row('q-later', 'Later', 'Questions', 'Parked.'),
      row('q-gone', 'SMS opt-in', 'Questions', 'Removed from the plan in v2.'),
    ]);
  });

  it('counts the changes applied since the last final', () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/importItems.test.ts packages/core/test/context.test.ts packages/core/test/checklist.test.ts`
Expected: FAIL, 23 tests:
- the 19 in `re-import`, for example `expected [ 'questions-who-2', … ] to deeply equal [ 'questions-who', … ]`: today every key gets a new id, a batch of only `removed` is refused ("Send either items…"), and unparking a removed item doesn't resolve it;
- `is ended early only by the window that runs the importers…`, with `(0 , claimImport) is not a function`;
- the two pack tests, with `expected undefined to be null` and `expected undefined to deeply equal { from: 2, to: 3, …(2) }`;
- `says why an item removed from the plan is parked`, which still gets "Parked.".

The other 23 pass.

- [ ] **Step 3: Re-import by key in `writeImportBatch`, remove only what's listed, and finish to where the project was**

In `packages/core/src/store/importItems.ts`, replace the imports from `../schemas` and `./io`:
```ts
import { dataKindOf, dataProblems, parseData, type CodeRef, type ImportBatch, type Item, type Message, type PlumbingType } from '../schemas';
import { InputError, newId, readDocText, readItems, readProjectFile, writeItem, writeProjectFile, writeThread } from './io';
```
with:
```ts
import { dataKindOf, dataProblems, parseData, type CodeRef, type ImportBatch, type Item, type Message, type PlumbingProject, type PlumbingType } from '../schemas';
import { stable } from './changes';
import { activeDecisions } from './decisions';
import { InputError, newId, readDecisions, readDocText, readItems, readProjectFile, readThread, writeItem, writeProjectFile, writeThread } from './io';
```

In `packages/core/src/schemas/loop.ts`, a re-sent item may leave out its title and summary, and a batch may list the keys the new version took out. Replace:
```ts
export const importItemSchema = z.object({
  key: idSchema,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(500),
```
with:
```ts
const titleSchema = z.string().min(1).max(200);
const summarySchema = z.string().min(1).max(500);

/** One item from an importer. A new item needs its title and summary; in a re-import, an existing key may leave them out. */
export const importItemSchema = z.object({
  key: idSchema,
  title: titleSchema.optional(),
  summary: summarySchema.optional(),
```
Then replace:
```ts
/** Either items or a "no changes" reason, never both. Checked by writeImportBatch. */
export const importBatchSchema = z.object({
  items: z.array(importItemSchema).max(60).optional(),
  noChanges: z.string().min(1).max(500).optional(),
});
```
with:
```ts
/**
 * Either items or a "no changes" reason, never both. In a re-import, `removed` lists the keys of existing items whose
 * part of the plan the new version took out, with items or on its own. Checked by writeImportBatch.
 */
export const importBatchSchema = z.object({
  items: z.array(importItemSchema).max(60).optional(),
  noChanges: z.string().min(1).max(500).optional(),
  removed: z.array(idSchema).max(200).optional(),
});
```
`newItemSchema` (a reply's new items) is built from `importItemSchema`, and keeps its title and summary required. Replace:
```ts
export const newItemSchema = importItemSchema.omit({ key: true, links: true }).extend({
  type: z.string().min(1),
```
with:
```ts
export const newItemSchema = importItemSchema.omit({ key: true, links: true }).extend({
  title: titleSchema,
  summary: summarySchema,
  type: z.string().min(1),
```

Add the re-import helpers between `phaseWithIds` and `writeImportBatch` in `packages/core/src/store/importItems.ts`, with `claimImport` and a doc comment for `writeImportBatch`. Replace:
```ts
/** Phase data may list items by batch key, like links. They're written as item ids. */
function phaseWithIds(data: unknown, idFor: Map<string, string>): unknown {
  const parsed = parseData('timeline', data);
  return parsed.ok ? { ...parsed.data, itemIds: parsed.data.itemIds.map((k) => idFor.get(k) ?? k) } : data;
}

export async function writeImportBatch(o: {
```
with:
```ts
/** Phase data may list items by batch key, like links. They're written as item ids. */
function phaseWithIds(data: unknown, idFor: Map<string, string>): unknown {
  const parsed = parseData('timeline', data);
  return parsed.ok ? { ...parsed.data, itemIds: parsed.data.itemIds.map((k) => idFor.get(k) ?? k) } : data;
}

/** What an importer writes into an item. A new item needs a title and a summary; a re-sent one may leave out anything. */
type Content = Pick<Item, 'title' | 'summary' | 'body' | 'fields' | 'mdAnchor' | 'codeRefs' | 'links' | 'data'>;
type Given = Partial<Content>;
const CONTENT = ['title', 'summary', 'body', 'fields', 'mdAnchor', 'codeRefs', 'links', 'data'] as const;

/**
 * One content field in a form where equal values compare equal: empty is the same as absent, code references are a
 * set whose ✓ (which comes from the clone rather than the plan) is left out, and an anchor is its heading.
 */
function comparable(key: keyof Content, value: unknown): string {
  if (key === 'codeRefs') return stable(((value as CodeRef[] | undefined) ?? []).map(({ verified: _verified, ...ref }) => stable(ref)).sort());
  if (key === 'mdAnchor') return stable((value as Item['mdAnchor'])?.heading ?? null);
  if (key === 'links') return stable(value ?? []);
  if (key === 'fields') return stable(value ?? {});
  if (key === 'body') return stable(value || null);
  return stable(value ?? null);
}

/** An item as it's written: an empty body, link list or code reference list is left out, as at import. */
const withoutEmpty = (item: Item): Item =>
  Object.fromEntries(
    Object.entries(item).filter(([key, value]) => !((key === 'body' && value === '') || ((key === 'links' || key === 'codeRefs') && Array.isArray(value) && value.length === 0))),
  ) as Item;

const systemLine = (now: Date, text: string): Message => ({ id: newId('m', now), at: now.toISOString(), author: 'system', text });

/**
 * A re-imported item whose key was in the plan before. It becomes { ...old, ...given }: it keeps its id, thread,
 * anchor and flags, and every field the importer left out. It's written only when something changed:
 * - back in the plan after it was removed: removedIn is cleared, and a parked thread is unparked (resolved again when
 *   its decision still stands);
 * - a field the importer gave is different: the item is updated and flagged, its thread says so, and the importer's
 *   question is added only when the thread is idle or waiting for you.
 */
async function reimportItem(dir: string, old: Item, given: Given, opening: Message | null, version: number, now: Date): Promise<void> {
  const back = old.removedIn !== undefined;
  const changed = CONTENT.some((key) => key in given && comparable(key, old[key]) !== comparable(key, given[key]));
  if (!back && !changed) return;
  const thread = await readThread(dir, old.threadId).catch(() => null);
  const { removedIn: _removedIn, ...kept } = old;
  await writeItem(
    dir,
    changed
      ? withoutEmpty({ ...kept, ...given, flags: [...(old.flags ?? []), { reason: `Changed in the plan's v${version}.`, fromThreadId: old.threadId, at: now.toISOString() }] })
      : kept,
  );
  if (!thread) return;
  let status = thread.status;
  const messages = [...thread.messages];
  if (back) {
    if (status === 'parked') {
      // A thread whose answer still stands is resolved again. Any other goes to whoever spoke last.
      const decided = activeDecisions(await readDecisions(dir)).some((d) => d.threadId === thread.id);
      const lastSpoken = [...thread.messages].reverse().find((m) => m.author !== 'system');
      status = decided ? 'resolved' : lastSpoken?.author === 'claude' ? 'your_turn' : 'idle';
    }
    messages.push(systemLine(now, `Back in the plan in v${version}.`));
  }
  if (changed) {
    messages.push(systemLine(now, `Updated from the plan's v${version}.`));
    if (opening && (status === 'idle' || status === 'your_turn')) {
      messages.push(opening);
      status = 'your_turn';
    }
  }
  await writeThread(dir, { ...thread, status, messages });
}

/**
 * An imported item the importer listed in `removed`: the new version took its part of the plan out. It's parked,
 * never deleted, whatever its thread's state, except a thread Claude is working on, whose item is flagged instead.
 */
async function markRemoved(dir: string, item: Item, version: number, now: Date): Promise<void> {
  const text = `Removed from the plan in v${version}.`;
  const thread = await readThread(dir, item.threadId).catch(() => null);
  const withClaude = thread?.status === 'with_claude';
  await writeItem(dir, {
    ...item,
    removedIn: version,
    ...(withClaude ? { flags: [...(item.flags ?? []), { reason: text, fromThreadId: item.threadId, at: now.toISOString() }] } : {}),
  });
  if (thread) await writeThread(dir, { ...thread, status: withClaude ? thread.status : 'parked', messages: [...thread.messages, systemLine(now, text)] });
}

/** The project once its import has finished: Active, or, after a re-import, whatever it was before the update. */
function importDone(project: PlumbingProject, changes: Pick<PlumbingProject, 'importPending' | 'emptyTypes' | 'updatedAt'>): PlumbingProject {
  const { reimporting, importBy: _importBy, ...rest } = project;
  return { ...rest, ...changes, status: reimporting?.from ?? 'active' };
}

/**
 * Records the Claude window that runs this project's importers, while it's importing. Only that window ends the
 * import early (finishImport), or another one once it's gone, so a second window listening on the project can't cut
 * the import short.
 */
export async function claimImport(dir: string, windowId: string): Promise<void> {
  const project = await readProjectFile(dir);
  if (project.status !== 'importing' || project.importBy === windowId) return;
  await writeProjectFile(dir, { ...project, importBy: windowId });
}

/**
 * One importer's batch for one plumbing type. At first import, every item is new. In a re-import (project.reimporting
 * is set), this type's imported items are matched by key: a key that's back keeps its item, id and thread, and is
 * updated only where the importer gave something different; a key in `removed` parks its item as removed from the
 * plan; and an item it doesn't mention is left as it is. Items you or Claude added are never touched. `noChanges` in a
 * re-import means nothing changed for this type, so its items are left as they are.
 */
export async function writeImportBatch(o: {
```

In `writeImportBatch`, a batch may be `removed` alone. Replace:
```ts
  const items = o.batch.items ?? [];
  if (Boolean(items.length) === Boolean(o.batch.noChanges)) {
```
with:
```ts
  const items = o.batch.items ?? [];
  const removed = o.batch.removed ?? [];
  // In a re-import, `removed` may stand in for items: a type whose items all left the plan sends only that.
  if (Boolean(items.length || removed.length) === Boolean(o.batch.noChanges)) {
```

Match this type's imported items by key when ids are given out. Replace:
```ts
  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: existing } = await readItems(o.dir);
  const existingIds = new Set(existing.map((i) => i.id));
  const taken = new Set(existingIds);
  const idFor = new Map(items.map((it) => [it.key, uniqueId(`${o.type.id}-${it.key}`, taken)]));
```
with:
```ts
  const reimport = project.reimporting;
  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: existing } = await readItems(o.dir);
  const existingIds = new Set(existing.map((i) => i.id));
  // In a re-import, this type's imported items, by key. The first item with a key wins.
  const imported = reimport ? existing.filter((i) => i.type === o.type.id && i.createdBy === 'import' && i.key !== undefined) : [];
  const previous = new Map<string, Item>();
  for (const i of imported) if (!previous.has(i.key!)) previous.set(i.key!, i);
  const taken = new Set(existingIds);
  const idFor = new Map(items.map((it) => [it.key, previous.get(it.key)?.id ?? uniqueId(`${o.type.id}-${it.key}`, taken)]));
```

A new key needs a title and a summary. Replace:
```ts
    if (keys.has(it.key)) problems.push(`${where}: the key is used twice.`);
    keys.add(it.key);
```
with:
```ts
    if (keys.has(it.key)) problems.push(`${where}: the key is used twice.`);
    keys.add(it.key);
    if (!previous.has(it.key) && (!it.title || !it.summary)) problems.push(`${where}: A new item needs a title and a summary.`);
```

`removed` must name this type's imported keys, none of them also in `items`. Replace:
```ts
      if (!keys.has(link) && !existingIds.has(link)) problems.push(`Item ${it.key}: links to "${link}", which isn't a key in this batch or an existing item id.`);
    }
  }
```
with:
```ts
      if (!keys.has(link) && !existingIds.has(link)) problems.push(`Item ${it.key}: links to "${link}", which isn't a key in this batch or an existing item id.`);
    }
  }
  for (const key of removed) {
    if (!previous.has(key)) problems.push(`removed: "${key}" isn't the key of an item ${o.type.title} imported before.`);
    else if (keys.has(key)) problems.push(`removed: "${key}" is in items too. Send it in one or the other.`);
  }
```

Then replace everything from `  const itemIds: string[] = [];` to the end of the file (the rest of `writeImportBatch`, and `finishImport`):
```ts
  const itemIds: string[] = [];
  for (const it of items) {
    const id = idFor.get(it.key)!;
    const threadId = `t-${id}`;
    const item: Item = {
      id,
      key: it.key,
      type: o.type.id,
      title: it.title,
      summary: it.summary,
      ...(it.body ? { body: it.body } : {}),
      ...(it.fields ? { fields: it.fields } : {}),
      ...(it.mdAnchor ? { mdAnchor: it.mdAnchor } : {}),
      ...(it.codeRefs?.length ? { codeRefs: await verifyCodeRefs(o.clone, it.codeRefs) } : {}),
      ...(it.links?.length ? { links: it.links.map((l) => idFor.get(l) ?? l) } : {}),
      ...(it.data !== undefined ? { data: kind === 'timeline' ? phaseWithIds(it.data, idFor) : it.data } : {}),
      threadId,
      createdBy: 'import',
    };
    const messages: Message[] = it.message
      ? [
          {
            id: newId('m', now),
            at,
            author: 'claude',
            text: it.message.text,
            opening: true,
            ...(it.message.options ? { options: it.message.options } : {}),
            ...(it.message.recommended ? { recommended: it.message.recommended } : {}),
          },
        ]
      : [];
    await writeItem(o.dir, item);
    await writeThread(o.dir, { id: threadId, itemId: id, status: it.message ? 'your_turn' : 'idle', messages });
    itemIds.push(id);
  }

  const importPending = project.importPending.filter((t) => t !== o.type.id);
  const emptyTypes = o.batch.noChanges
    ? [...project.emptyTypes.filter((e) => e.type !== o.type.id), { type: o.type.id, reason: o.batch.noChanges }]
    : project.emptyTypes;
  const importFinished = importPending.length === 0;
  await writeProjectFile(o.dir, {
    ...project,
    importPending,
    emptyTypes,
    status: importFinished && project.status === 'importing' ? 'active' : project.status,
    updatedAt: at,
  });
  return { itemIds, importFinished };
}

/** Ends an import whose importers have all returned. Types that never wrote are marked "didn't finish". */
export async function finishImport(dir: string, now: Date = new Date()): Promise<boolean> {
  const project = await readProjectFile(dir);
  if (project.status !== 'importing') return false;
  const missing = project.importPending
    .filter((type) => !project.emptyTypes.some((e) => e.type === type))
    .map((type) => ({ type, reason: IMPORT_DID_NOT_FINISH }));
  await writeProjectFile(dir, { ...project, importPending: [], emptyTypes: [...project.emptyTypes, ...missing], status: 'active', updatedAt: now.toISOString() });
  return true;
}
```
with:
```ts
  const itemIds: string[] = [];
  for (const it of items) {
    const id = idFor.get(it.key)!;
    // Only what the importer gave: in a re-import, what it leaves out keeps its current value.
    const given: Given = {
      ...(it.title !== undefined ? { title: it.title } : {}),
      ...(it.summary !== undefined ? { summary: it.summary } : {}),
      ...(it.body !== undefined ? { body: it.body } : {}),
      ...(it.fields !== undefined ? { fields: it.fields } : {}),
      ...(it.mdAnchor !== undefined ? { mdAnchor: it.mdAnchor } : {}),
      ...(it.codeRefs !== undefined ? { codeRefs: await verifyCodeRefs(o.clone, it.codeRefs) } : {}),
      ...(it.links !== undefined ? { links: it.links.map((l) => idFor.get(l) ?? l) } : {}),
      ...(it.data !== undefined ? { data: kind === 'timeline' ? phaseWithIds(it.data, idFor) : it.data } : {}),
    };
    const opening: Message | null = it.message
      ? {
          id: newId('m', now),
          at,
          author: 'claude',
          text: it.message.text,
          opening: true,
          ...(it.message.options ? { options: it.message.options } : {}),
          ...(it.message.recommended ? { recommended: it.message.recommended } : {}),
        }
      : null;
    itemIds.push(id);
    const old = previous.get(it.key);
    if (old && reimport) {
      await reimportItem(o.dir, old, given, opening, reimport.version, now);
      continue;
    }
    const threadId = `t-${id}`;
    await writeItem(o.dir, withoutEmpty({ id, key: it.key, type: o.type.id, ...given, title: it.title!, summary: it.summary!, threadId, createdBy: 'import' }));
    await writeThread(o.dir, { id: threadId, itemId: id, status: opening ? 'your_turn' : 'idle', messages: opening ? [opening] : [] });
  }
  // The items the importer says the new version took out. Any other item it didn't send is left as it is.
  if (reimport) {
    for (const key of new Set(removed)) {
      const item = previous.get(key)!;
      if (item.removedIn === undefined) await markRemoved(o.dir, item, reimport.version, now);
    }
  }

  // An items batch clears an earlier "no changes". In a re-import, "no changes" leaves the type as it is, so it's
  // only recorded for a type that has no items.
  const others = project.emptyTypes.filter((e) => e.type !== o.type.id);
  let emptyTypes = others;
  if (o.batch.noChanges) {
    const leftAlone = reimport !== undefined && existing.some((i) => i.type === o.type.id);
    emptyTypes = leftAlone ? project.emptyTypes : [...others, { type: o.type.id, reason: o.batch.noChanges }];
  }
  const importPending = project.importPending.filter((t) => t !== o.type.id);
  const importFinished = importPending.length === 0;
  const changes = { importPending, emptyTypes, updatedAt: at };
  await writeProjectFile(o.dir, importFinished && project.status === 'importing' ? importDone(project, changes) : { ...project, ...changes });
  return { itemIds, importFinished };
}

/**
 * Ends an import whose importers have all returned. Types that never wrote and have no items are marked "didn't
 * finish" (in a re-import, a type whose importer didn't return keeps its items as they were). The project goes back
 * to Active, or to Finalized after a finalized project's re-import. Only the window that runs the importers
 * (`importBy`) ends it, or another one once that window is no longer alive.
 */
export async function finishImport(dir: string, o: { windowId?: string; isAlive?: (windowId: string) => boolean; now?: Date } = {}): Promise<boolean> {
  const now = o.now ?? new Date();
  const project = await readProjectFile(dir);
  if (project.status !== 'importing') return false;
  const by = project.importBy;
  if (by && o.windowId !== by && (o.isAlive ? o.isAlive(by) : true)) return false;
  const { values: items } = await readItems(dir);
  const missing = project.importPending
    .filter((type) => !project.emptyTypes.some((e) => e.type === type) && !items.some((i) => i.type === type))
    .map((type) => ({ type, reason: IMPORT_DID_NOT_FINISH }));
  await writeProjectFile(dir, importDone(project, { importPending: [], emptyTypes: [...project.emptyTypes, ...missing], updatedAt: now.toISOString() }));
  return true;
}
```

In `packages/core/src/store/threads.ts`, unparking an item a re-import parked as removed takes it back into the plan. Replace:
```ts
import { uniqueId } from './importItems';
import { InputError, newId, readItems, readThread, writeItem, writeThread } from './io';
```
with:
```ts
import { activeDecisions } from './decisions';
import { uniqueId } from './importItems';
import { InputError, newId, readDecisions, readItem, readItems, readThread, writeItem, writeThread } from './io';
```
and replace the start of `setParked`:
```ts
export async function setParked(dir: string, threadId: string, parked: boolean, now: Date = new Date()): Promise<Thread> {
  const thread = await readThread(dir, threadId);
  if (thread.status === 'with_claude') throw new InputError("Claude is working on this thread, so it can't be parked yet.");
  if (parked && thread.status === 'resolved') throw new InputError('This thread is resolved, so there is nothing to park.');
  if (parked === (thread.status === 'parked')) return thread;
  const lastSpoken = [...thread.messages].reverse().find((m) => m.author !== 'system');
  const status: Thread['status'] = parked ? 'parked' : lastSpoken?.author === 'claude' ? 'your_turn' : 'idle';
```
with:
```ts
/**
 * Parks or unparks a thread. Unparking an item an update parked as removed from the plan takes it back into the plan:
 * removedIn is cleared, and a thread whose answer still stands (it has an active decision) is resolved again.
 */
export async function setParked(dir: string, threadId: string, parked: boolean, now: Date = new Date()): Promise<Thread> {
  const thread = await readThread(dir, threadId);
  if (thread.status === 'with_claude') throw new InputError("Claude is working on this thread, so it can't be parked yet.");
  if (parked && thread.status === 'resolved') throw new InputError('This thread is resolved, so there is nothing to park.');
  if (parked === (thread.status === 'parked')) return thread;
  const lastSpoken = [...thread.messages].reverse().find((m) => m.author !== 'system');
  let decided = false;
  if (!parked) {
    const item = await readItem(dir, thread.itemId).catch(() => null);
    if (item?.removedIn !== undefined) {
      decided = activeDecisions(await readDecisions(dir)).some((d) => d.threadId === thread.id);
      const { removedIn: _removedIn, ...back } = item;
      await writeItem(dir, back);
    }
  }
  const status: Thread['status'] = parked ? 'parked' : decided ? 'resolved' : lastSpoken?.author === 'claude' ? 'your_turn' : 'idle';
```

- [ ] **Step 4: Give the importer the plan's changes and the type's items**

In `packages/core/src/store/context.ts`, replace the first import:
```ts
import { availableTokens } from '../finalExport';
```
with:
```ts
import { diffText } from '../docDiff';
import { availableTokens } from '../finalExport';
```

Then the `./threads` import:
```ts
import { presetLabel } from './threads';
```
with:
```ts
import { presetLabel } from './threads';
import { readVersionDoc } from './versions';
```

In `ImportPack`, replace:
```ts
  existingItems: { id: string; type: string; title: string }[];
};
```
with:
```ts
  /** Every item but the Plan changes ones, which aren't part of the plan. One whose part of the plan was removed says so. */
  existingItems: { id: string; type: string; title: string; removed?: true }[];
  /**
   * Set while a new version of the plan is re-imported, null at first import. `changes` is how the plan changed from
   * v`from` to v`to`; `existing` is this type's imported items, by key, so the importer can reuse a key for the same thing.
   */
  reimport: {
    from: number;
    to: number;
    changes: string;
    existing: {
      key: string;
      id: string;
      title: string;
      summary: string;
      body: string | null;
      fields: Record<string, string>;
      mdAnchor: { heading: string } | null;
      hasData: boolean;
      /** The item's drawing as it is now, with what the threads settled in it, or null. */
      data: unknown;
      removed: boolean;
    }[];
  } | null;
};
```

Add `planDiff` before `threadPack`. Replace:
```ts
/** Spec §13.2: what a thread subagent receives. */
```
with:
```ts
/**
 * Two versions of the plan as a line diff: `+ ` added, `- ` removed and `  ` unchanged, keeping 2 unchanged lines
 * around each change. Each run of lines starts with `@@`. Empty when nothing changed.
 */
function planDiff(before: string, after: string): string {
  const CONTEXT = 2;
  const lf = (text: string) => text.replace(/\r\n/g, '\n');
  const lines: { mark: string; text: string }[] = [];
  for (const segment of diffText(lf(before), lf(after))) {
    const mark = segment.kind === 'added' ? '+' : segment.kind === 'removed' ? '-' : ' ';
    for (const text of segment.text.replace(/\n$/, '').split('\n')) lines.push({ mark, text });
  }
  const shown = lines.map(() => false);
  lines.forEach((line, i) => {
    if (line.mark === ' ') return;
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) shown[j] = true;
  });
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!shown[i]) return;
    if (i === 0 || !shown[i - 1]) out.push('@@');
    out.push(`${line.mark} ${line.text}`.trimEnd());
  });
  return out.join('\n');
}

/** Spec §13.2: what a thread subagent receives. */
```

Replace the start of `importPack`:
```ts
/** What an importer receives: the whole draft, its plumbing type's whole rules file and data shape, and the repo profile. */
export async function importPack(o: { dir: string; typeId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ImportPack> {
  const type = o.types.find((t) => t.id === o.typeId);
  if (!type) throw new StoreError(`There's no plumbing type "${o.typeId}".`);
  const project = await readProjectFile(o.dir);
  const { values: items } = await readItems(o.dir);
  const p = o.profile;
```
with:
```ts
/**
 * What an importer receives: the whole draft, its plumbing type's whole rules file and data shape, and the repo profile.
 * In a re-import, also how the plan changed since the last version and this type's imported items.
 */
export async function importPack(o: { dir: string; typeId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ImportPack> {
  const type = o.types.find((t) => t.id === o.typeId);
  if (!type) throw new StoreError(`There's no plumbing type "${o.typeId}".`);
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
          existing: items.flatMap((i) =>
            i.type === type.id && i.createdBy === 'import' && i.key !== undefined
              ? [
                  {
                    key: i.key,
                    id: i.id,
                    title: i.title,
                    summary: i.summary,
                    body: i.body ?? null,
                    fields: i.fields ?? {},
                    mdAnchor: i.mdAnchor ? { heading: i.mdAnchor.heading } : null,
                    hasData: i.data !== undefined,
                    data: i.data ?? null,
                    removed: i.removedIn !== undefined,
                  },
                ]
              : [],
          ),
        };
```

And its end:
```ts
    existingItems: items.map((i) => ({ id: i.id, type: i.type, title: i.title })),
  };
}
```
with:
```ts
    existingItems: items.filter((i) => i.type !== PLAN_CHANGES).map((i) => ({ id: i.id, type: i.type, title: i.title, ...(i.removedIn !== undefined ? { removed: true as const } : {}) })),
    reimport,
  };
}
```

- [ ] **Step 5: Say why a removed item is parked**

In `checklistFrom` (`packages/core/src/store/checklist.ts`), replace:
```ts
    if (status === 'parked') {
      list.parked.push(entry('Parked.'));
      continue;
    }
```
with:
```ts
    if (status === 'parked') {
      // An item parked because its part of the plan was removed says so.
      list.parked.push(entry(item.removedIn ? `Removed from the plan in v${item.removedIn}.` : 'Parked.'));
      continue;
    }
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/core/test/importItems.test.ts packages/core/test/context.test.ts packages/core/test/checklist.test.ts packages/core/test/update.test.ts`
Expected: PASS (35 tests in `importItems.test.ts`, 5 in `context.test.ts`, 6 in `checklist.test.ts` (Task 3 added one too), and `update.test.ts` as before).

Run: `pnpm typecheck && pnpm test`
Expected: PASS. In particular, `service/test/claude.test.ts`'s "finishes the import when the window starts listening, even if an importer never wrote" still finds 9 types that didn't finish, since none of them has items.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/schemas/loop.ts packages/core/src/store/importItems.ts packages/core/src/store/threads.ts packages/core/src/store/context.ts packages/core/src/store/checklist.ts packages/core/test/importItems.test.ts packages/core/test/context.test.ts packages/core/test/checklist.test.ts
git commit -m "feat(core): re-importing a new plan version keeps items by key, flags changes and parks the ones it lists as removed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The service brings changes in

`/dev-plumbing <plan>` on a project that already exists now notices when the plan in this clone differs from the project's current version. Without an answer it returns `plan-changed` and writes nothing; with `update: true` it runs `updatePlan` (with `fresh: true`, starting the draft again from the repo's version) and returns `updated` with the importers to run again; with `update: false` it opens the project as it was. When the update would have to wait (threads queued for Claude, an import or a finalize under way), or this clone has a version the project already had, it opens the project instead and says why. The window that runs the importers is recorded, so another listening window can't end the import. The browser also gets four read-only routes for the Versions pages: the list, a version's plan or draft, a comparison of two versions, and what an update changed in the draft.

**Files:**
- Create:
  - `packages/service/src/routes/versions.ts`
  - `packages/service/test/update.test.ts`
- Modify:
  - `packages/service/src/routes/claude.ts` (`/open`, `/items`, `/wait`)
  - `packages/service/src/app.ts` (mount the versions routes)
- Test:
  - `packages/service/test/update.test.ts`

**Interfaces:**
- Consumes (all from `@dev-plumbing/core`):
  - From Task 1:
    - `projectVersions(project): PlanVersion[]` (oldest first, v1 synthesised from `source` when `versions` is empty) and `currentVersion(project): PlanVersion` (with its `branch`);
    - `readVersionDoc(dir, project, n, which: 'original' | 'draft' | 'merged'): Promise<string | null>`: the working files for the current version, the snapshot otherwise, `merged` from the version's own folder, null if missing;
    - `gitHead(cwd): Promise<string | null>`;
    - `PlumbingProject.versions`, `reimporting` and `importBy`;
    - `VersionSummary = PlanVersion & { current: boolean }`, exported from `schemas/views.ts`.
  - From Task 3: `importableTypes(types)`, which `/open` already uses for `enabledTypes` and for `pending` (the `importTypes` list), and which `/items` uses to refuse a built-in type. `cfg.types` includes the built-in Plan changes type.
  - From Task 4:
    - `planChange(dir, repoText): Promise<PlanChange | OlderPlan | null>`, with `PlanChange = { from; to; added; removed; conflicts; whitespaceOnly; suggestFresh }` and `OlderPlan = { older }`;
    - `updateRefusal(dir): Promise<string | null>`, with the header's exact copy (for example "Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered.");
    - `updatePlan(dir, { repoText, clone, branch, commit, types, fresh, home }): Promise<UpdateResult>`, with `UpdateResult = { version; clean; conflicts; fresh; conflictThreadIds; importTypes }`, which refuses with `updateRefusal`'s text too;
    - each conflict as item `plan-changes-v<N>-<k>` (title: the conflict's heading), a `with_claude` thread, and one queued submission that `pendingSubmissions` returns;
    - `docs/versions/v<N>/merged.md`, the draft as the update to v<N> left it.
  - From Task 5: `writeImportBatch` in re-import mode, with a batch's `removed`; `claimImport(dir, windowId)`; `finishImport(dir, { windowId, isAlive })`, which ends an import only from the window that runs it, or once that window is gone.
  - From Plans 1–4: `resolvePlan`, `readProjectFile`, `pendingSubmissions`, `requeueUnfinished`, `requeueFinalize`, `diffText`; the service's `locateProject`, `handle`, `projectKey`, `rt.withLock`, `rt.listeners.isAlive`, `rt.events.projectChanged` (through `changed(ref)`).
- Produces:
  - **`POST /api/claude/open`** takes `update?: boolean` and `fresh?: boolean` (used with `update: true`). For a project that already existed (by `plan`, or by `project` id), it compares the plan in this clone with the project's current version (`planChange`), under the project's lock, unless `update` is false:
    - unchanged, or `update: false`: `reopened`, as before;
    - a version the project had before (`{ older: k }`): `reopened`, with `next` starting `Tell the user: "This clone has the plan's v<k>, older than the project's v<n>. There's nothing to bring in." `;
    - changed: first the requeue of work held by windows that are gone, which `/open` already did afterwards, then `updateRefusal`. If the update would have to wait: `reopened`, with `next` starting `Tell the user: "The plan changed in the repo since v<n>. <refusal>" `, whatever `update` is. So the window listens, and drains what's queued, instead of asking a question whose answer would be refused;
    - changed, nothing in the way, and no `update`: `{ kind: 'plan-changed', repo, project, title, url, version, nextVersion, added, removed, conflicts, suggestFresh, whitespaceOnly, branch, next }`, writing nothing (`branch` is this clone's);
    - changed and `update: true`: `updatePlan` runs, then the usual bookkeeping, then `{ kind: 'updated', repo, project, title, url, version, merged: { clean, conflicts }, importTypes, models, maxParallel, waitingSubmissions, next }`. `importTypes` is built exactly as for `created`. The browser is told (`changed`). No listening window is woken (no `rt.listeners.notify`): the conflicts wait as a pending submission, and this window's own `dp_wait` picks them up after its importers.
    - An error from `updatePlan` (a 409 when something changed in the meantime, a 400 when git can't merge) comes back with its message.
    - Whenever it returns a non-empty `importTypes` (created, reopened with pending types, updated) and `windowId` is given, the bookkeeping calls `claimImport` with it, under the project lock.
  - **`/items`** passes the batch's `removed` to `writeImportBatch`.
  - **`/wait`** calls `finishImport(dir, { windowId, isAlive: rt.listeners.isAlive })`, so a second window listening on the project doesn't end an import the first one is running. A window that stops pinging for longer than a window counts as alive (90 s) no longer holds it up.
  - **`versionRoutes(ctx: AppContext): Hono`** (`routes/versions.ts`, mounted under `/api`, behind the guard):
    - `GET /projects/:repo/:id/versions` returns `{ versions: VersionSummary[] }`, newest first.
    - `GET /projects/:repo/:id/versions/:n/:which` (`which`: `original` | `draft`) returns `{ text: string | null }`.
    - `GET /projects/:repo/:id/versions/compare?from=<n>&to=<n>&which=original|draft` returns `{ segments: DiffSegment[] }` from `diffText(from's text, to's text)`.
    - `GET /projects/:repo/:id/versions/:n/update-diff` returns `{ segments: DiffSegment[] }` from `diffText(<v(n-1)'s draft>, <v(n)'s merged.md>)`: what the update that brought v<n> in did to the draft. It's registered before `:n/:which`.
    - 404s: an unknown `which` is `{ error: 'Unknown document.' }`; an unknown or malformed version number is `{ error: "That version doesn't exist." }`; a compare or update diff whose file is missing is `{ error: "That version's document is missing from the project folder." }`; the update diff of v1 is `{ error: 'v1 is the import, so no update changed its draft.' }`.
- **Behaviour:**
  - **Where the plan is read.** By `plan`, it's `plan.text`, which `resolvePlan` already read from this clone. By `project` id, it's `resolvePlan({ root: git.root, cwd: git.root, plan: project.source.path })`. A clone where that file is missing or unreadable opens the project as it is.
  - **Still importing.** A project whose `status` is `importing` never gets `plan-changed`: when its plan changed, it reopens, lists its pending importers, and `next` starts with the importing line.
  - **The question.** `next` for `plan-changed` is `Ask the user: "<question>"`, then the options and how to answer:
    - `<question>` is `The plan changed in the repo since v<from> (<added> lines added, <removed> removed).` ("1 line" when `added` is 1), or, when this clone's branch isn't the current version's, `The plan on branch <branch> changed since v<from> (…).`; then ` Only the formatting changed.` when `whitespaceOnly`, or else ` It's mostly rewritten, so merging would leave <k> conflicts.` when `suggestFresh` ("1 conflict" in the singular); then ` Update to v<to>?`.
    - Without `suggestFresh`: ` with the options "Update to v<to>" and "Not now". Then call dp_open again with the same plan or project and update: true or update: false.`
    - With `suggestFresh`: ` with the options "Update to v<to> (merge into my draft)", "Start the draft from v<to>" and "Not now". Then call dp_open again with the same plan or project and update: true for the first, update: true with fresh: true for the second, or update: false for Not now.`
  - **After an update.** `next` for `updated` is `Tell the user: "<line>"`, a space, and then the same `next` as `created` would get. `<line>` is `v<n>: <clean> changes merged, <conflicts> to settle in Plan changes.` when there are conflicts, `v<n>: <clean> changes merged, nothing to settle.` when there are none ("1 change" when `clean` is 1), and `v<n>: the draft now starts from the plan's v<n>. Your earlier draft is kept under Versions.` after a fresh start.

- [ ] **Step 1: Write the failing tests**

`packages/service/test/update.test.ts`:
```ts
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readItem, readProjectFile, readThread, writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { DRAFT, makeRepo } from '../../core/test/fixtures';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const P = '/api/projects/acme-app/restock-reminders';
const PLAN = 'docs/specs/restock-reminders.md';
const base = { repo: 'acme-app', project: 'restock-reminders' };
const ONE_ROW = { id: 'one-row', label: 'One row per reminder', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per reminder sent.' }] } };
const QUESTIONS = [
  { key: 'log', title: 'What do we log?', summary: 'The reminders table.', message: { text: 'One row per reminder?', options: [ONE_ROW, { id: 'none', label: 'Nothing' }] } },
  { key: 'who', title: 'Who gets reminders?', summary: 'Everyone or some?', message: { text: 'Who first?' } },
];
/** The plan's v2 in the repo: a new title, a new Approach line (clean), and a new Data line, which the draft also changed. */
const V2 = DRAFT.replace('# Restock reminders', '# Restock alerts')
  .replace('A daily job finds', 'An hourly job finds')
  .replace('Log reminders in a table.', 'Log reminders in the events table.');
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Every file and folder under `dir`, with each file's text. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (d: string): Promise<void> => {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        out[p] = 'folder';
        await walk(p);
      } else {
        out[p] = await fs.readFile(p, 'utf8');
      }
    }
  };
  await walk(dir);
  return out;
}

/** git in the clone, as the user would run it. */
const gitIn = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Acme', '-c', 'user.email=dev@acme.test', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, encoding: 'utf8' }).trim();

/** A clone with the plan's v1, its repo profile, and the service. Nothing is opened yet. `now` is the windows' clock. */
async function harness(o: { now?: () => number } = {}) {
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
  return { ...s, rt, app, send, claude, repo, dir: path.join(s.root, 'acme-app', 'restock-reminders') };
}
type Setup = Awaited<ReturnType<typeof harness>>;

/** Sends one batch per import type: `questions` (and `removed`, if given) for Questions, "no changes" for every other type. */
async function importAll(t: Setup, types: { id: string }[], questions: unknown[], removed?: string[]): Promise<Json[]> {
  const results: Json[] = [];
  for (const type of types) {
    const batch = type.id === 'questions' ? { items: questions, ...(removed ? { removed } : {}) } : { noChanges: 'None.' };
    const r = await t.claude('/items', { ...base, type: type.id, ...batch });
    if (r.status !== 200) throw new Error(`${type.id}: ${r.body.error}`);
    results.push(r.body);
  }
  return results;
}

/** The plan imported from the clone, with two questions. */
async function setup() {
  const t = await harness();
  const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
  await importAll(t, open.body.importTypes, QUESTIONS);
  return t;
}

/** The user accepts "One row per reminder" in the browser, so the draft's Data line differs from the plan's. */
async function acceptOneRow(t: Setup) {
  await t.send('PUT', `${P}/threads/t-questions-log/draft`, { optionId: 'one-row' });
  expect((await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-log' })).body).toMatchObject({ resolved: 1 });
}

/** A teammate's change to the plan reaches this clone. With `commit`, it's committed, and the new HEAD is returned. */
async function rewritePlan(t: Setup, text: string, o: { commit?: boolean } = {}): Promise<string | null> {
  await fs.writeFile(path.join(t.repo, PLAN), text);
  if (!o.commit) return null;
  gitIn(t.repo, 'add', '-A');
  gitIn(t.repo, 'commit', '-q', '--no-verify', '-m', 'Restock alerts');
  return gitIn(t.repo, 'rev-parse', 'HEAD');
}

const ASK_V2 =
  'Ask the user: "The plan changed in the repo since v1 (3 lines added, 3 removed). Update to v2?" with the options "Update to v2" and "Not now". Then call dp_open again with the same plan or project and update: true or update: false.';
const IMPORT_NEXT =
  'Start one dev-plumbing:importer subagent per import type (model sonnet, at most 4 at a time). Start the ones marked afterOthers only after all the others have returned. When they have all returned, call dp_wait.';
const WAIT_NEXT = "Call dp_wait to listen for the user's answers.";

describe('bringing a changed plan in', () => {
  it('reopens as before while the plan in the repo is unchanged', async () => {
    const t = await setup();
    const byPlan = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(byPlan.body).toMatchObject({ kind: 'reopened', importTypes: [], next: "Call dp_wait to listen for the user's answers." });
    expect((await t.claude('/open', { cwd: t.repo, project: 'restock-reminders' })).body).toMatchObject({ kind: 'reopened', importTypes: [] });
    // update without a change is an ordinary reopen.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, update: true })).body.kind).toBe('reopened');
  });

  it('asks first when the plan changed, and writes nothing', async () => {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    const before = await snapshot(t.dir);
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(open.status).toBe(200);
    expect(open.body).toEqual({
      kind: 'plan-changed',
      repo: 'acme-app',
      project: 'restock-reminders',
      title: 'Restock reminders',
      url: 'http://localhost:4545/p/acme-app/restock-reminders',
      version: 1,
      nextVersion: 2,
      added: 3,
      removed: 3,
      conflicts: 1,
      suggestFresh: false,
      whitespaceOnly: false,
      branch: 'main',
      next: ASK_V2,
    });
    expect(await snapshot(t.dir)).toEqual(before);
  });

  it('declining the update changes nothing', async () => {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    const before = await snapshot(t.dir);
    const no = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: false });
    expect(no.body).toMatchObject({ kind: 'reopened', title: 'Restock reminders', importTypes: [], waitingSubmissions: 0 });
    expect((await t.claude('/open', { cwd: t.repo, project: 'restock-reminders', windowId: 'w-a', update: false })).body.kind).toBe('reopened');
    expect(await snapshot(t.dir)).toEqual(before);
    // The question comes back the next time.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'plan-changed', version: 1, nextVersion: 2 });
    expect(await snapshot(t.dir)).toEqual(before);
  });

  it('brings the new version in on yes, keeping your draft and the old version', async () => {
    const t = await setup();
    await acceptOneRow(t);
    const oldDraft = await fs.readFile(path.join(t.dir, 'docs', 'draft.md'), 'utf8');
    const head = await rewritePlan(t, V2, { commit: true });
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.status).toBe(200);
    expect(yes.body).toMatchObject({
      kind: 'updated',
      repo: 'acme-app',
      project: 'restock-reminders',
      title: 'Restock alerts',
      url: 'http://localhost:4545/p/acme-app/restock-reminders',
      version: 2,
      merged: { clean: 2, conflicts: 1 },
      models: { importer: 'sonnet', thread: 'sonnet' },
      maxParallel: 4,
      waitingSubmissions: 1,
      next: `Tell the user: "v2: 2 changes merged, 1 to settle in Plan changes." ${IMPORT_NEXT}`,
    });
    // Every importable type runs again, in the same two waves as at import.
    const types = yes.body.importTypes as { id: string; afterOthers?: true }[];
    expect(types.map((x) => x.id)).toEqual(['architecture', 'database', 'ui', 'questions', 'concerns', 'ideas', 'testing', 'security', 'flows', 'phases']);
    expect(types.filter((x) => x.afterOthers).map((x) => x.id)).toEqual(['flows', 'phases']);

    const doc = (rel: string) => fs.readFile(path.join(t.dir, rel), 'utf8');
    expect(await doc('docs/versions/v1/original.md')).toBe(DRAFT);
    expect(await doc('docs/versions/v1/draft.md')).toBe(oldDraft);
    expect(await doc('docs/original.md')).toBe(V2);
    const draft = await doc('docs/draft.md');
    expect(draft).toContain('# Restock alerts');
    expect(draft).toContain('An hourly job finds');
    // Your accepted change stays where the repo changed the same line.
    expect(draft).toContain('Log one row per reminder sent.');
    expect(draft).not.toContain('Log reminders in the events table.');
    expect(draft).not.toMatch(/^[<=|>]{7}/m);

    const project = await readProjectFile(t.dir);
    expect(project).toMatchObject({ title: 'Restock alerts', status: 'importing', reimporting: { version: 2, from: 'active' } });
    expect(project.versions.map((v) => v.n)).toEqual([1, 2]);
    expect(project.versions[1]).toMatchObject({ n: 2, hash: sha256(V2), clone: t.repo, branch: 'main', commit: head, merge: { clean: 2, conflicts: 1 } });
    const conflict = await readItem(t.dir, 'plan-changes-v2-1');
    expect(conflict).toMatchObject({ type: 'plan-changes', title: 'Data' });
    expect((await readThread(t.dir, conflict.threadId)).status).toBe('with_claude');
  });

  it('runs the importers again by key, then dp_wait hands out the conflict', async () => {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.body.kind).toBe('updated');

    // The importers send what's there again under the same keys, and say which item the new version took out.
    const again = QUESTIONS.filter((q) => q.key === 'log').map(({ message: _message, ...item }) => item);
    const results = await importAll(t, yes.body.importTypes, again, ['who']);
    expect(results.at(-1)).toMatchObject({ importFinished: true });
    const project = await readProjectFile(t.dir);
    expect(project).toMatchObject({ status: 'active', importPending: [] });
    expect(project.reimporting).toBeUndefined();
    // The answered question kept its thread, its answer and its decision.
    const log = await readThread(t.dir, 't-questions-log');
    expect(log.status).toBe('resolved');
    expect(log.messages.some((m) => m.author === 'you' && m.optionId === 'one-row')).toBe(true);
    // Same keys, same ids: no questions-log-2. The removed one is parked, not deleted.
    expect((await fs.readdir(path.join(t.dir, 'items'))).filter((f) => f.startsWith('questions-')).sort()).toEqual(['questions-log.json', 'questions-who.json']);
    expect((await readItem(t.dir, 'questions-who')).removedIn).toBe(2);
    expect((await readThread(t.dir, 't-questions-who')).status).toBe('parked');

    const conflict = await readItem(t.dir, 'plan-changes-v2-1');
    const wait = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect(wait.body).toMatchObject({ kind: 'submission', groups: [{ threads: [conflict.threadId], titles: ['Data'], model: 'sonnet' }] });

    // The plan in the repo is v2 now, so opening it again asks nothing.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', importTypes: [] });
  });

  it("doesn't wake a window that is already listening, so the re-import isn't cut short", async () => {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    const waiting = t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 2 });
    // Once w-b is inside its wait, a notify would hand it the conflict at once.
    while (!t.rt.listeners.inWait('w-b', 'acme-app/restock-reminders')) await new Promise((r) => setTimeout(r, 10));
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.body).toMatchObject({ kind: 'updated', waitingSubmissions: 1 });
    // The other window times out instead of taking the conflict, and the re-import is still under way.
    expect((await waiting).body).toEqual({ kind: 'timeout' });
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', reimporting: { version: 2, from: 'active' } });
    // The conflict waits for this window's own dp_wait.
    const conflict = await readItem(t.dir, 'plan-changes-v2-1');
    expect((await readThread(t.dir, conflict.threadId)).status).toBe('with_claude');
  });

  it('opens by project id, reading the plan from this clone', async () => {
    const t = await setup();
    await rewritePlan(t, DRAFT.replace('A daily job finds', 'An hourly job finds'));
    const ask = await t.claude('/open', { cwd: t.repo, project: 'restock-reminders', windowId: 'w-a' });
    expect(ask.body).toMatchObject({ kind: 'plan-changed', version: 1, nextVersion: 2, added: 1, removed: 1 });
    expect(ask.body.next).toContain('"The plan changed in the repo since v1 (1 line added, 1 removed). Update to v2?"');

    // A clone that doesn't have the plan opens the project as it is.
    const other = makeRepo({ remote: 'https://github.com/acme/acme-app.git', plan: 'docs/other.md' });
    expect((await t.claude('/open', { cwd: other, project: 'restock-reminders' })).body).toMatchObject({ kind: 'reopened', importTypes: [] });

    const yes = await t.claude('/open', { cwd: t.repo, project: 'restock-reminders', windowId: 'w-a', update: true });
    expect(yes.body).toMatchObject({ kind: 'updated', version: 2, merged: { clean: 1, conflicts: 0 }, waitingSubmissions: 0 });
    expect(yes.body.next).toContain('"v2: 1 change merged, nothing to settle."');
    expect(yes.body.importTypes).toHaveLength(10);
  });

  it('opens the project instead of asking while Claude has threads to answer, and asks once they are answered', async () => {
    const t = await setup();
    await rewritePlan(t, V2);
    // You sent an answer while no Claude window was listening, so the thread waits for Claude.
    await t.send('PUT', `${P}/threads/t-questions-who/draft`, { text: 'Everyone.' });
    expect((await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-who' })).body).toMatchObject({ sent: 1 });
    const before = await snapshot(t.dir);
    const told = `Tell the user: "The plan changed in the repo since v1. Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered." ${WAIT_NEXT}`;
    for (const answer of [{}, { update: true }]) {
      const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', ...answer });
      expect(open.status).toBe(200);
      expect(open.body).toMatchObject({ kind: 'reopened', importTypes: [], waitingSubmissions: 1, next: told });
    }
    expect(await snapshot(t.dir)).toEqual(before);
    // This window listens and answers the thread. The next /dev-plumbing asks.
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'submission' });
    expect((await t.claude('/reply', { ...base, threadId: 't-questions-who', text: 'Everyone gets them.', resolve: { decision: 'Everyone gets reminders.' } })).status).toBe(200);
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'plan-changed', version: 1, nextVersion: 2 });
  });

  it('opens the project, and says why, while it is still importing', async () => {
    const t = await harness();
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body.kind).toBe('created');
    await rewritePlan(t, V2);
    const told = `Tell the user: "The plan changed in the repo since v1. This project is still importing. Run /dev-plumbing again once that's done." ${IMPORT_NEXT}`;
    for (const answer of [{}, { update: true }]) {
      const again = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', ...answer });
      expect(again.body).toMatchObject({ kind: 'reopened', next: told });
      expect(again.body.importTypes).toHaveLength(10);
    }
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', versions: [] });
  });

  it("a second window's dp_wait doesn't end the re-import, and the importers' batches still land", async () => {
    const t = await setup();
    await rewritePlan(t, DRAFT.replace('A daily job finds', 'An hourly job finds'));
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.body).toMatchObject({ kind: 'updated', merged: { clean: 1, conflicts: 0 } });
    // Your earlier session, still listening in another terminal, polls twice while w-a's importers work.
    for (let i = 0; i < 2; i++) expect((await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', importBy: 'w-a', reimporting: { version: 2, from: 'active' } });
    const results = await importAll(t, yes.body.importTypes, QUESTIONS.map(({ message: _message, ...item }) => item));
    expect(results.at(-1)).toMatchObject({ importFinished: true });
    const project = await readProjectFile(t.dir);
    expect(project.status).toBe('active');
    expect(project.importBy).toBeUndefined();
  });

  it('at a first import too, until the window running the importers is gone', async () => {
    const clock = { now: Date.now() };
    const t = await harness({ now: () => clock.now });
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body.kind).toBe('created');
    for (let i = 0; i < 2; i++) await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 });
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', importBy: 'w-a' });
    expect((await t.claude('/items', { ...base, type: 'questions', items: QUESTIONS })).status).toBe(200);
    // w-a stopped: nothing from it for longer than a window counts as alive. w-b's next poll ends the import.
    clock.now += 120_000;
    await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 });
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'active', importPending: [] });
  });

  it('offers to start the draft again from v2 when merging would leave most of it to settle', async () => {
    const t = await setup();
    // Your draft moved on a long way: the intro, Approach and Data all say something else now.
    const draft = DRAFT.replace('Remind customers before', 'Remind every customer by email before')
      .replace('A daily job finds subscriptions due soon', 'A nightly job finds subscriptions due within three days')
      .replace('Log reminders in a table.', 'Log one row per reminder sent, with the channel.');
    await fs.writeFile(path.join(t.dir, 'docs', 'draft.md'), draft);
    const rewrite = '# Restock alerts\n\nAlert customers a week before a subscription item runs out.\n\n## Approach\n\nA queue sends each alert when it falls due.\n\n## Data\n\nKeep alerts in the events stream.\n';
    await rewritePlan(t, rewrite);
    const ask = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(ask.body).toMatchObject({ kind: 'plan-changed', conflicts: 3, suggestFresh: true, whitespaceOnly: false });
    expect(ask.body.next).toBe(
      'Ask the user: "The plan changed in the repo since v1 (4 lines added, 4 removed). It\'s mostly rewritten, so merging would leave 3 conflicts. Update to v2?" with the options "Update to v2 (merge into my draft)", "Start the draft from v2" and "Not now". Then call dp_open again with the same plan or project and update: true for the first, update: true with fresh: true for the second, or update: false for Not now.',
    );
    const fresh = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true, fresh: true });
    expect(fresh.body).toMatchObject({ kind: 'updated', version: 2, merged: { clean: 0, conflicts: 0 }, waitingSubmissions: 0 });
    expect(fresh.body.next).toBe(`Tell the user: "v2: the draft now starts from the plan's v2. Your earlier draft is kept under Versions." ${IMPORT_NEXT}`);
    expect(await fs.readFile(path.join(t.dir, 'docs', 'draft.md'), 'utf8')).toBe(rewrite);
    expect(await fs.readFile(path.join(t.dir, 'docs', 'versions', 'v1', 'draft.md'), 'utf8')).toBe(draft);
    expect((await readProjectFile(t.dir)).versions[1].merge).toEqual({ clean: 0, conflicts: 0, fresh: true });
  });

  it('says when only the formatting changed', async () => {
    const t = await setup();
    await rewritePlan(t, DRAFT.replace('Remind customers before a subscription item runs out.', 'Remind customers before a subscription\nitem runs out.'));
    const ask = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(ask.body).toMatchObject({ kind: 'plan-changed', conflicts: 0, suggestFresh: true, whitespaceOnly: true });
    expect(ask.body.next).toContain('"The plan changed in the repo since v1 (2 lines added, 1 removed). Only the formatting changed. Update to v2?"');
  });

  it("says there's nothing to bring in from a clone with an older version, and names another branch", async () => {
    const t = await setup();
    await rewritePlan(t, V2, { commit: true });
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    await importAll(t, yes.body.importTypes, QUESTIONS.map(({ message: _message, ...item }) => item));
    // This clone goes back to v1, as one that hasn't pulled would have it.
    await rewritePlan(t, DRAFT);
    for (const open of [{ plan: PLAN }, { project: 'restock-reminders' }]) {
      const older = await t.claude('/open', { cwd: t.repo, windowId: 'w-a', ...open });
      expect(older.body).toMatchObject({
        kind: 'reopened',
        next: `Tell the user: "This clone has the plan's v1, older than the project's v2. There's nothing to bring in." ${WAIT_NEXT}`,
      });
    }
    // Another branch with its own change to the plan: the question names it.
    gitIn(t.repo, 'checkout', '-q', '-b', 'restock-audit');
    await rewritePlan(t, V2.replace('in the events table', 'in the audit log'));
    const ask = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(ask.body).toMatchObject({ kind: 'plan-changed', version: 2, nextVersion: 3, branch: 'restock-audit' });
    expect(ask.body.next).toContain('"The plan on branch restock-audit changed since v2 (1 line added, 1 removed). Update to v3?"');
  });
});

describe('versions', () => {
  it('lists every version, newest first, with the current one marked', async () => {
    const t = await setup();
    const v1 = { n: 1, at: (await readProjectFile(t.dir)).createdAt, hash: sha256(DRAFT), clone: t.repo, branch: 'main', commit: null };
    expect((await t.send('GET', `${P}/versions`)).body).toEqual({ versions: [{ ...v1, current: true }] });

    await acceptOneRow(t);
    const head = await rewritePlan(t, V2, { commit: true });
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true })).body.kind).toBe('updated');
    const list = (await t.send('GET', `${P}/versions`)).body.versions;
    expect(list).toEqual([
      { n: 2, at: expect.any(String), hash: sha256(V2), clone: t.repo, branch: 'main', commit: head, merge: { clean: 2, conflicts: 1 }, current: true },
      { ...v1, current: false },
    ]);
  });

  it("serves each version's plan and draft, and compares two", async () => {
    const t = await setup();
    await acceptOneRow(t);
    const oldDraft = await fs.readFile(path.join(t.dir, 'docs', 'draft.md'), 'utf8');
    await rewritePlan(t, V2);
    await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    const text = async (n: number, which: string) => (await t.send('GET', `${P}/versions/${n}/${which}`)).body.text;
    expect(await text(1, 'original')).toBe(DRAFT);
    expect(await text(1, 'draft')).toBe(oldDraft);
    expect(await text(2, 'original')).toBe(V2);
    expect(await text(2, 'draft')).toBe(await fs.readFile(path.join(t.dir, 'docs', 'draft.md'), 'utf8'));

    const plans = await t.send('GET', `${P}/versions/compare?from=1&to=2&which=original`);
    expect(plans.status).toBe(200);
    expect(plans.body.segments).toEqual(
      expect.arrayContaining([
        { kind: 'removed', text: 'A daily job finds subscriptions due soon and sends a reminder.\n' },
        { kind: 'added', text: 'An hourly job finds subscriptions due soon and sends a reminder.\n' },
        { kind: 'removed', text: 'Log reminders in a table.\n' },
        { kind: 'added', text: 'Log reminders in the events table.\n' },
      ]),
    );
    const drafts = (await t.send('GET', `${P}/versions/compare?from=1&to=2&which=draft`)).body.segments as { kind: string; text: string }[];
    expect(drafts).toContainEqual({ kind: 'added', text: 'An hourly job finds subscriptions due soon and sends a reminder.\n' });
    // Your Data line is the same in both drafts.
    expect(drafts.filter((s) => s.kind !== 'same').some((s) => s.text.includes('Log one row'))).toBe(false);
  });

  it('shows what the update changed in your draft: the draft before it against the draft as merged', async () => {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    const diff = await t.send('GET', `${P}/versions/2/update-diff`);
    expect(diff.status).toBe(200);
    // The title and Approach merged in. Your Data line stayed, since the repo changed it too.
    expect((diff.body.segments as { kind: string }[]).filter((s) => s.kind !== 'same')).toEqual([
      { kind: 'removed', text: '# Restock reminders\n' },
      { kind: 'added', text: '# Restock alerts\n' },
      { kind: 'removed', text: 'A daily job finds subscriptions due soon and sends a reminder.\n' },
      { kind: 'added', text: 'An hourly job finds subscriptions due soon and sends a reminder.\n' },
    ]);
    expect(await t.send('GET', `${P}/versions/1/update-diff`)).toEqual({ status: 404, body: { error: 'v1 is the import, so no update changed its draft.' } });
    expect(await t.send('GET', `${P}/versions/3/update-diff`)).toEqual({ status: 404, body: { error: "That version doesn't exist." } });
  });

  it("answers 404 for a version, document or project that doesn't exist", async () => {
    const t = await setup();
    await rewritePlan(t, V2);
    await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    const get = (route: string) => t.send('GET', `${P}/versions${route}`);
    for (const route of ['/3/original', '/0/draft', '/abc/draft', '/compare?from=1&to=3&which=original', '/compare?to=2&which=original']) {
      expect(await get(route), route).toEqual({ status: 404, body: { error: "That version doesn't exist." } });
    }
    for (const route of ['/1/final', '/compare?from=1&to=2&which=final', '/compare?from=1&to=2']) {
      expect(await get(route), route).toEqual({ status: 404, body: { error: 'Unknown document.' } });
    }
    expect((await t.send('GET', '/api/projects/acme-app/nope/versions')).status).toBe(404);

    // A snapshot that's gone reads as null, and can't be compared.
    await fs.rm(path.join(t.dir, 'docs', 'versions', 'v1', 'draft.md'));
    expect(await get('/1/draft')).toEqual({ status: 200, body: { text: null } });
    expect(await get('/compare?from=1&to=2&which=draft')).toEqual({ status: 404, body: { error: "That version's document is missing from the project folder." } });
  });

  it('needs the token or the same origin', async () => {
    const t = await setup();
    for (const route of [`${P}/versions`, `${P}/versions/1/original`, `${P}/versions/compare?from=1&to=1&which=draft`, `${P}/versions/1/update-diff`]) {
      const res = await t.app.request(`http://localhost:4545${route}`, { headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' } });
      expect(res.status, route).toBe(401);
    }
    const same = await t.app.request(`http://localhost:4545${P}/versions`, { headers: { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:4545' } });
    expect(same.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/service/test/update.test.ts`
Expected: FAIL, 18 of 19.
- `/open` drops the unknown `update` and `fresh` fields and answers a plain `reopened` where the tests expect `plan-changed`, `updated`, or a `next` that starts with `Tell the user`.
- At a first import, the project isn't recorded as imported by `w-a` (`importBy` is missing).
- `GET …/versions` and its other routes answer 404 `{ error: 'Not found.' }`.
- Only "reopens as before while the plan in the repo is unchanged" already passes.

- [ ] **Step 3: Teach `/open` to ask, to bring the new version in, and to say why it waits**

All edits are in `packages/service/src/routes/claude.ts`. None of them touches the two `importableTypes(cfg.types)` lines Task 3 wrote in `/open`.

1. In the `@dev-plumbing/core` import list at the top, add eight names, each in its alphabetical place: `claimImport` and `currentVersion` (before `expandHome`), `gitHead` (before `gitInfo`), `planChange` (after `pickUpFinalize`), `updatePlan` and `updateRefusal` (after `threadPack`), `type PlanChange` (after `type LoadedConfig`) and `type UpdateResult` (after `type Submission`).

2. Replace:
```ts
const NO_REMOTE = "This repo has no git remote, so dev-plumbing can't recognise its other clones. Add one (git remote add origin <url>), then run /dev-plumbing again.";
```
with:
```ts
const NO_REMOTE = "This repo has no git remote, so dev-plumbing can't recognise its other clones. Add one (git remote add origin <url>), then run /dev-plumbing again.";

/**
 * What the skill asks when the plan in the repo changed since the project's current version. `branch` is set when
 * this clone is on another branch than the current version came from.
 */
function updateQuestion(change: PlanChange, branch: string | null): string {
  const added = `${change.added} ${change.added === 1 ? 'line' : 'lines'}`;
  const changed = branch ? `The plan on branch ${branch} changed since v${change.from}` : `The plan changed in the repo since v${change.from}`;
  const conflicts = `${change.conflicts} ${change.conflicts === 1 ? 'conflict' : 'conflicts'}`;
  const why = change.whitespaceOnly ? ' Only the formatting changed.' : change.suggestFresh ? ` It's mostly rewritten, so merging would leave ${conflicts}.` : '';
  return `${changed} (${added} added, ${change.removed} removed).${why} Update to v${change.to}?`;
}

/** plan-changed's next: the question, its options, and how to call dp_open with the answer. */
function askNext(change: PlanChange, branch: string | null): string {
  const ask = `Ask the user: "${updateQuestion(change, branch)}"`;
  const to = change.to;
  return change.suggestFresh
    ? `${ask} with the options "Update to v${to} (merge into my draft)", "Start the draft from v${to}" and "Not now". Then call dp_open again with the same plan or project and update: true for the first, update: true with fresh: true for the second, or update: false for Not now.`
    : `${ask} with the options "Update to v${to}" and "Not now". Then call dp_open again with the same plan or project and update: true or update: false.`;
}

/** The one line the skill tells the user once an update is in. */
function updatedLine(u: UpdateResult): string {
  if (u.fresh) return `v${u.version}: the draft now starts from the plan's v${u.version}. Your earlier draft is kept under Versions.`;
  const merged = `${u.clean} ${u.clean === 1 ? 'change' : 'changes'} merged`;
  return u.conflicts ? `v${u.version}: ${merged}, ${u.conflicts} to settle in Plan changes.` : `v${u.version}: ${merged}, nothing to settle.`;
}
```

3. Replace:
```ts
const openBody = z.object({ cwd: z.string().min(1), plan: z.string().min(1).optional(), project: z.string().min(1).optional(), windowId: z.string().optional() });
```
with:
```ts
const openBody = z.object({
  cwd: z.string().min(1),
  plan: z.string().min(1).optional(),
  project: z.string().min(1).optional(),
  windowId: z.string().optional(),
  // The user's answer to plan-changed: true brings the repo's new version in, false opens the project as it was.
  update: z.boolean().optional(),
  // With update: true, start the draft again from the repo's new version instead of merging into it.
  fresh: z.boolean().optional(),
});
```

4. In the `/open` handler, replace:
```ts
      let ref: ProjectRef;
      let created = false;
      if (body.project) {
        try {
          ref = (await locateProject(ctx, profile.name, body.project)).ref;
        } catch (e) {
          if (e instanceof StoreError) throw new InputError(`There's no plumbing project "${body.project}" for ${profile.name}. Call dp_open with no arguments to list them.`);
          throw e;
        }
      } else {
```
with:
```ts
      let ref: ProjectRef;
      let created = false;
      // For a project that already existed: the plan as it is in this clone, which may have changed since.
      let repoText: string | null = null;
      if (body.project) {
        try {
          ref = (await locateProject(ctx, profile.name, body.project)).ref;
        } catch (e) {
          if (e instanceof StoreError) throw new InputError(`There's no plumbing project "${body.project}" for ${profile.name}. Call dp_open with no arguments to list them.`);
          throw e;
        }
        // Picked by id, so read the plan at the project's path in this clone. A clone without it just opens the project.
        const { source } = await readProjectFile(ref.dir);
        repoText = await resolvePlan({ root: git.root, cwd: git.root, plan: source.path }).then(
          (plan) => plan.text,
          () => null,
        );
      } else {
```

5. A few lines further down, through the bookkeeping under the project lock, replace:
```ts
        ref = { repo: profile.name, id: opened.id, dir: opened.dir };
        created = opened.created;
      }

      const key = projectKey(ref.repo, ref.id);
      if (body.windowId) rt.listeners.seen(body.windowId, key);
      const isAlive = (w: string) => rt.listeners.isAlive(w);
      await rt.withLock(key, async () => {
        // Every clone a project is opened from is remembered, so Accept can offer it.
        await recordClone(ref.dir, git.root, ctx.home);
        await requeueUnfinished(ref.dir, isAlive);
        await requeueFinalize(ref.dir, isAlive);
      });
```
with:
```ts
        ref = { repo: profile.name, id: opened.id, dir: opened.dir };
        created = opened.created;
        if (!created) repoText = plan.text;
      }

      const key = projectKey(ref.repo, ref.id);
      const isAlive = (w: string) => rt.listeners.isAlive(w);
      // A plan that changed in the repo is never brought in without asking. Without `update`, the answer is
      // plan-changed, before anything is written, and the skill asks the user. update: true brings the new version in;
      // update: false opens the project as it was, and the next open asks again. When the update would have to wait
      // (an import, threads queued for Claude, a finalize), the project opens instead, so this window can finish that
      // work, and the user is told why.
      let update: UpdateResult | null = null;
      let tell: string | null = null;
      if (repoText !== null && body.update !== false) {
        const text = repoText;
        const commit = body.update ? await gitHead(git.root) : null;
        const outcome = await rt.withLock(key, async () => {
          const change = await planChange(ref.dir, text);
          if (!change) return null;
          const project = await readProjectFile(ref.dir);
          const current = currentVersion(project);
          if ('older' in change) {
            return { kind: 'tell' as const, line: `This clone has the plan's v${change.older}, older than the project's v${current.n}. There's nothing to bring in.` };
          }
          // Work that a window which is gone had picked up goes back in the queue first, so this one can take it.
          await requeueUnfinished(ref.dir, isAlive);
          await requeueFinalize(ref.dir, isAlive);
          const refused = await updateRefusal(ref.dir);
          if (refused) return { kind: 'tell' as const, line: `The plan changed in the repo since v${change.from}. ${refused}` };
          if (!body.update) return { kind: 'ask' as const, change, title: project.title, branch: git.branch === current.branch ? null : git.branch };
          const result = await updatePlan(ref.dir, { repoText: text, clone: git.root, branch: git.branch, commit, types: cfg.types, fresh: body.fresh === true, home: ctx.home });
          return { kind: 'updated' as const, result };
        });
        if (outcome?.kind === 'ask') {
          const { change } = outcome;
          return c.json({
            kind: 'plan-changed',
            repo: ref.repo,
            project: ref.id,
            title: outcome.title,
            url: urlFor(ref.repo, ref.id),
            version: change.from,
            nextVersion: change.to,
            added: change.added,
            removed: change.removed,
            conflicts: change.conflicts,
            suggestFresh: change.suggestFresh,
            whitespaceOnly: change.whitespaceOnly,
            branch: git.branch,
            next: askNext(change, outcome.branch),
          });
        }
        if (outcome?.kind === 'tell') tell = outcome.line;
        if (outcome?.kind === 'updated') update = outcome.result;
      }
      if (body.windowId) rt.listeners.seen(body.windowId, key);
      await rt.withLock(key, async () => {
        // Every clone a project is opened from is remembered, so Accept can offer it.
        await recordClone(ref.dir, git.root, ctx.home);
        await requeueUnfinished(ref.dir, isAlive);
        await requeueFinalize(ref.dir, isAlive);
        // This window runs the importers, so it's the one whose dp_wait may end the import.
        const { importPending } = await readProjectFile(ref.dir);
        if (body.windowId && importableTypes(cfg.types).some((t) => importPending.includes(t.id))) await claimImport(ref.dir, body.windowId);
      });
```

6. At the end of the `/open` handler, replace:
```ts
      rt.events.emit({ type: 'projects' });
      return c.json({
        kind: created ? 'created' : 'reopened',
        repo: ref.repo,
        project: ref.id,
        title: project.title,
        url: urlFor(ref.repo, ref.id),
        importTypes,
        models,
        maxParallel: cfg.agents.maxParallel,
        waitingSubmissions: (await pendingSubmissions(ref.dir)).length,
        next: importTypes.length
          ? `Start one dev-plumbing:importer subagent per import type (model ${models.importer}, at most ${cfg.agents.maxParallel} at a time). Start the ones marked afterOthers only after all the others have returned. When they have all returned, call dp_wait.`
          : "Call dp_wait to listen for the user's answers.",
      });
```
with:
```ts
      rt.events.emit({ type: 'projects' });
      const waitingSubmissions = (await pendingSubmissions(ref.dir)).length;
      const next = importTypes.length
        ? `Start one dev-plumbing:importer subagent per import type (model ${models.importer}, at most ${cfg.agents.maxParallel} at a time). Start the ones marked afterOthers only after all the others have returned. When they have all returned, call dp_wait.`
        : "Call dp_wait to listen for the user's answers.";
      if (update) {
        changed(ref);
        // The conflicts wait for Claude as a submission, and this window picks them up when it calls dp_wait after its
        // importers. No other window is woken: its dp_wait would end the re-import before the importers are back.
        return c.json({
          kind: 'updated',
          repo: ref.repo,
          project: ref.id,
          title: project.title,
          url: urlFor(ref.repo, ref.id),
          version: update.version,
          merged: { clean: update.clean, conflicts: update.conflicts },
          importTypes,
          models,
          maxParallel: cfg.agents.maxParallel,
          waitingSubmissions,
          next: `Tell the user: "${updatedLine(update)}" ${next}`,
        });
      }
      return c.json({
        kind: created ? 'created' : 'reopened',
        repo: ref.repo,
        project: ref.id,
        title: project.title,
        url: urlFor(ref.repo, ref.id),
        importTypes,
        models,
        maxParallel: cfg.agents.maxParallel,
        waitingSubmissions,
        next: tell ? `Tell the user: "${tell}" ${next}` : next,
      });
```

7. In `/items`, pass a re-import's `removed` on. Replace:
```ts
        writeImportBatch({ dir: ref.dir, type, types: cfg.types, batch: { items: body.items, noChanges: body.noChanges }, clone }),
```
with:
```ts
        writeImportBatch({ dir: ref.dir, type, types: cfg.types, batch: { items: body.items, noChanges: body.noChanges, removed: body.removed }, clone }),
```
`itemsBody` is built from `importBatchSchema`, so it takes `removed` already (Task 5).

8. In `/wait`, replace:
```ts
        return finishImport(ref.dir);
```
with:
```ts
        // Only the window that runs the importers ends the import, or this one once that window is gone.
        return finishImport(ref.dir, { windowId: body.windowId, isAlive: (w) => rt.listeners.isAlive(w) });
```

- [ ] **Step 4: Write the versions routes**

`packages/service/src/routes/versions.ts`:
```ts
import { Hono, type Context } from 'hono';
import { currentVersion, diffText, projectVersions, readProjectFile, readVersionDoc, type VersionSummary } from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { locateProject } from '../locate';

const DOCS = ['original', 'draft'] as const;
const UNKNOWN_DOC = { error: 'Unknown document.' };
const UNKNOWN_VERSION = { error: "That version doesn't exist." };
const MISSING = { error: "That version's document is missing from the project folder." };

/** A version number from the URL: a whole number from 1, or null. */
const versionNumber = (value: string | undefined) => (value && /^[1-9][0-9]{0,5}$/.test(value) ? Number(value) : null);

/** Documents → Versions: every version of the plan a project went through, each one's plan and draft, and a diff of two. */
export function versionRoutes(ctx: AppContext): Hono {
  const r = new Hono();
  const base = '/projects/:repo/:id/versions';
  /** The project, and its versions oldest first (v1 synthesised for a project that was never updated). */
  const find = async (c: Context) => {
    const { ref } = await locateProject(ctx, c.req.param('repo')!, c.req.param('id')!);
    const project = await readProjectFile(ref.dir);
    return { dir: ref.dir, project, numbers: new Set(projectVersions(project).map((v) => v.n)) };
  };

  r.get(base, handle(async (c) => {
    const { project } = await find(c);
    const current = currentVersion(project).n;
    const versions: VersionSummary[] = projectVersions(project)
      .map((v) => ({ ...v, current: v.n === current }))
      .reverse();
    return c.json({ versions });
  }));

  r.get(`${base}/compare`, handle(async (c) => {
    const which = DOCS.find((d) => d === c.req.query('which'));
    if (!which) return c.json(UNKNOWN_DOC, 404);
    const { dir, project, numbers } = await find(c);
    const from = versionNumber(c.req.query('from'));
    const to = versionNumber(c.req.query('to'));
    if (from === null || to === null || !numbers.has(from) || !numbers.has(to)) return c.json(UNKNOWN_VERSION, 404);
    const [before, after] = await Promise.all([readVersionDoc(dir, project, from, which), readVersionDoc(dir, project, to, which)]);
    if (before === null || after === null) return c.json(MISSING, 404);
    return c.json({ segments: diffText(before, after) });
  }));

  // What the update that brought version n in did to the draft: the draft before it against the draft as merged.
  r.get(`${base}/:n/update-diff`, handle(async (c) => {
    const { dir, project, numbers } = await find(c);
    const n = versionNumber(c.req.param('n'));
    if (n === null || !numbers.has(n)) return c.json(UNKNOWN_VERSION, 404);
    if (n === 1) return c.json({ error: 'v1 is the import, so no update changed its draft.' }, 404);
    const [before, after] = await Promise.all([readVersionDoc(dir, project, n - 1, 'draft'), readVersionDoc(dir, project, n, 'merged')]);
    if (before === null || after === null) return c.json(MISSING, 404);
    return c.json({ segments: diffText(before, after) });
  }));

  r.get(`${base}/:n/:which`, handle(async (c) => {
    const which = DOCS.find((d) => d === c.req.param('which'));
    if (!which) return c.json(UNKNOWN_DOC, 404);
    const { dir, project, numbers } = await find(c);
    const n = versionNumber(c.req.param('n'));
    if (n === null || !numbers.has(n)) return c.json(UNKNOWN_VERSION, 404);
    return c.json({ text: await readVersionDoc(dir, project, n, which) });
  }));

  return r;
}
```

- [ ] **Step 5: Mount them**

In `packages/service/src/app.ts`, add the import after `import { threadRoutes } from './routes/threads';`:
```ts
import { versionRoutes } from './routes/versions';
```
Then add this line after `app.route('/api', finalizeRoutes(ctx, rt));`:
```ts
  app.route('/api', versionRoutes(ctx));
```

- [ ] **Step 6: Run the tests**

Run:
```bash
pnpm vitest run packages/service/test/update.test.ts packages/service/test/claude.test.ts packages/service/test/finalize.test.ts
pnpm typecheck
pnpm test
pnpm test:e2e
```
Expected: PASS.
- `update.test.ts` has 19 tests.
- The existing open, import and finalize tests still pass: an unchanged plan reopens exactly as before.
- The e2e run checks that `/open` and `/items` still work from the app's side.

- [ ] **Step 7: Commit**

```bash
git add packages/service/src/routes/claude.ts packages/service/src/routes/versions.ts packages/service/src/app.ts packages/service/test/update.test.ts
git commit -m "feat(service): /dev-plumbing offers to bring a changed plan in, opens the project when the update must wait, and serves versions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Claude's side: dp_open update, the skill, the importer and the thread agent

The plugin learns to bring a changed plan in:
- **`dp_open`** passes `update` and `fresh` through to the service, and its description explains `plan-changed` and `updated`. **`dp_write_items`** passes a re-import's `removed`.
- **The skill** asks "Update to v2?" with AskUserQuestion when `dp_open` says the plan changed (offering **Start the draft from v2** too when the service suggests it), calls it again with the answer, and after an update tells the user what merged and runs the importers again. It tells the user the line a `next` starts with, and after an error that follows `update: true` it opens the project as it was instead of stopping.
- **Importers** learn re-import: send new items, items whose part of the plan changed, and the keys the new version took out (`removed`); never remove an item because the draft or its thread settled it; reuse keys; send only the fields that changed; edit a drawing rather than redraw it; and ask only about what changed.
- **Thread agents** learn that a Plan changes thread has no message from the person to answer.

**Files:**
- Modify:
  - `packages/mcp/src/tools.ts` (`dp_open`, `dp_write_items`)
  - `plugin/skills/dev-plumbing/SKILL.md` (§1 only)
  - `plugin/agents/importer.md`
  - `plugin/agents/thread.md`
- Test:
  - `packages/mcp/test/tools.test.ts`
  - `packages/mcp/test/plugin.test.ts`
  - `packages/mcp/test/bridge.integration.test.ts`

**Interfaces:**
- Consumes:
  - From Task 6: `/api/claude/open` takes `update?: boolean` and `fresh?: boolean`, and returns:
    - `{ kind: 'plan-changed', repo, project, title, url, version, nextVersion, added, removed, conflicts, suggestFresh, whitespaceOnly, branch, next }`;
    - `{ kind: 'updated', repo, project, title, url, version, merged: { clean, conflicts }, importTypes, models, maxParallel, waitingSubmissions, next }`;
    - `reopened` whose `next` starts with `Tell the user: "…"` when the update has to wait, or this clone has an older version;
    - and `GET /api/projects/:repo/:id/versions`, which the integration test reads.
  - From Task 5: the importer pack's `reimport: { from, to, changes, existing: { key, id, title, summary, body, fields, mdAnchor, hasData, data, removed }[] } | null`, `existingItems` with `removed: true` on a removed item, and re-import's matching by key, its keeping of every field a batch item leaves out (so an item sent with only its key is unchanged, and a drawing left out is kept), its "Changed in the plan's v<n>." flag for a field that differs, a batch's `removed`, and its leaving alone of anything the batch doesn't mention.
  - From Task 3: the Plan changes type's Rules, which tell a thread agent what to do with a conflict thread.
  - From Task 4: a conflict thread starts `with_claude` with only a system message, and reaches the window as an ordinary `submission` from `dp_wait`.
- Produces:
  - **`dp_open`:** `inputSchema` gains `update: z.boolean().optional()` and `fresh: z.boolean().optional()`. The description names `plan-changed`, `updated`, `update: true`, `fresh: true` and `update: false`. There are still 7 tools.
  - **`dp_write_items`:** `inputSchema` gains `removed: z.array(z.string().min(1)).max(200).optional()`, and its description says what it's for.
  - **SKILL.md §1** gains `**plan-changed**` (the question, its variants and options, then `dp_open` again with `update`, and `fresh` for **Start the draft from v<n+1>**; **Not now** when no one can answer), `**updated**` (the line `next` starts with, in its three forms, then 2 with its `importTypes`), a paragraph on telling the user a `next` that starts with `Tell the user`, and an error after `update: true` handled by calling `dp_open` again with `update: false`. Every line outside §1 stays byte for byte.
  - **`importer.md`:** `existingItems` mentions `removed: true`, a `reimport` entry in step 1's pack list, and a `## Re-import` section.
  - **`thread.md`:** step 2 says what to do when the thread has no message from the person yet.

- [ ] **Step 1: Write the failing tests**

In `packages/mcp/test/tools.test.ts`, add these two tests at the end of `describe('the dp tools', …)`. The existing `'offers exactly the seven dp tools'` test stays as it is: there are still seven.
```ts
  it("passes the user's answer to plan-changed through as update, and fresh", async () => {
    const results: unknown[] = [
      { kind: 'plan-changed', version: 1, nextVersion: 2, added: 3, removed: 1 },
      { kind: 'updated', version: 2, merged: { clean: 2, conflicts: 1 } },
      { kind: 'reopened', importTypes: [] },
      { kind: 'updated', version: 2, merged: { clean: 0, conflicts: 0 } },
    ];
    const { client, calls } = fakeService({ '/open': () => results.shift() });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    const open = async (args: Record<string, unknown>) => JSON.parse(textOf(await mcp.callTool({ name: 'dp_open', arguments: args })));
    expect(await open({ plan: 'docs/specs/restock.md' })).toMatchObject({ kind: 'plan-changed', nextVersion: 2 });
    expect(await open({ plan: 'docs/specs/restock.md', update: true })).toMatchObject({ kind: 'updated', version: 2 });
    expect(await open({ project: 'restock-reminders', update: false })).toMatchObject({ kind: 'reopened' });
    expect(await open({ plan: 'docs/specs/restock.md', update: true, fresh: true })).toMatchObject({ kind: 'updated', version: 2 });
    expect(calls.map((c) => c.body)).toEqual([
      { plan: 'docs/specs/restock.md', cwd: '/repo', windowId: 'w-1' },
      { plan: 'docs/specs/restock.md', update: true, cwd: '/repo', windowId: 'w-1' },
      { project: 'restock-reminders', update: false, cwd: '/repo', windowId: 'w-1' },
      { plan: 'docs/specs/restock.md', update: true, fresh: true, cwd: '/repo', windowId: 'w-1' },
    ]);
    const tool = (await mcp.listTools()).tools.find((t) => t.name === 'dp_open')!;
    expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(['fresh', 'plan', 'project', 'update']);
    for (const s of ['plan-changed', 'update: true', 'updated', 'update: false', 'fresh: true']) expect(tool.description).toContain(s);
    // An answer that isn't true or false never reaches the service.
    const bad = await mcp.callTool({ name: 'dp_open', arguments: { plan: 'docs/specs/restock.md', update: 'yes' } });
    expect(bad.isError).toBe(true);
    expect(calls).toHaveLength(4);
  });

  it("passes a re-import's removed keys through dp_write_items", async () => {
    const { client, calls } = fakeService({ '/items': () => ({ saved: 0, itemIds: [], importFinished: false }) });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    await mcp.callTool({ name: 'dp_write_items', arguments: { repo: 'acme', project: 'restock-reminders', type: 'questions', items: [{ key: 'who' }], removed: ['sms-later'] } });
    expect(calls.map((c) => c.body)).toEqual([{ repo: 'acme', project: 'restock-reminders', type: 'questions', items: [{ key: 'who' }], removed: ['sms-later'], cwd: '/repo' }]);
    const tool = (await mcp.listTools()).tools.find((t) => t.name === 'dp_write_items')!;
    expect(Object.keys(tool.inputSchema.properties ?? {}).sort()).toEqual(['items', 'noChanges', 'project', 'removed', 'repo', 'type']);
    expect(tool.description).toContain('removed lists the keys of existing items');
  });
```

In `packages/mcp/test/plugin.test.ts`, add this test at the end of `describe('the plugin', …)`:
```ts
  it('asks before bringing a changed plan in, and has importers re-import by key, removing only what they list', () => {
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md')).content;
    const open = skill.slice(skill.indexOf('## 1. Open'), skill.indexOf('## 2. Import'));
    for (const s of [
      '**plan-changed**',
      'AskUserQuestion',
      '> The plan changed in the repo since v<n> (<a> lines added, <r> removed). Update to v<n+1>?',
      '**Update to v<n+1>**',
      '**Not now**',
      'update: true',
      'update: false',
      'take **Not now**',
      '**Update to v<n+1> (merge into my draft)**',
      '**Start the draft from v<n+1>**',
      '`fresh: true`',
      " Only the formatting changed.",
      " It's mostly rewritten, so merging would leave <k> conflicts.",
      'The plan on branch <branch> changed since v<n>',
      '**updated**',
      '`v<n>: <clean> changes merged, <conflicts> to settle in Plan changes.`',
      '`v<n>: <clean> changes merged, nothing to settle.`',
      "`v<n>: the draft now starts from the plan's v<n>. Your earlier draft is kept under Versions.`",
      'go to 2 with its `importTypes`',
      'when `next` starts with `Tell the user: "…"`, tell the user that line first',
      'If `dp_open` returns an error after `update: true`, the project changed in the meantime: tell the user the error, then call `dp_open` again with the same `plan` (or `project`) and `update: false`',
    ]) {
      expect(open).toContain(s);
    }
    const importer = parseFrontMatter(read('plugin/agents/importer.md')).content;
    for (const s of [
      '## Re-import',
      '`reimport`',
      '`changes`',
      '`existing`',
      'Send new items, items whose part of the plan `changes` touched, and `removed`: the keys of existing items whose part of the plan the `- ` lines took out.',
      'Never remove an item because the draft now answers it or its thread settled it. An existing item you don\'t mention is left as it is.',
      '**Reuse an existing `key` for the same thing,**',
      '**Use `noChanges` only when nothing in `changes` touches this type.**',
      'For an existing item, send its key, plus only the fields that changed; a field you leave out keeps its value, title and summary included (so leave out `data` unless the drawing changed).',
      "If a drawing's part of the plan changed, edit the current `data` you're given; don't redraw it from scratch.",
      "Changed in the plan's v<to>.",
    ]) {
      expect(importer).toContain(s);
    }
    // Nothing is removed by leaving it out any more.
    expect(importer).not.toContain('Send the whole list');
    // A field left out keeps its value, so the importer never has to resend a drawing it didn't change.
    expect(importer).not.toContain('whole `data` again');
    const thread = parseFrontMatter(read('plugin/agents/thread.md')).content;
    expect(thread).toContain("If the thread has no message from the person yet, the service sent it to you: a Plan changes thread, for example");
    expect(thread).toContain("do what the plumbing type's Rules say");
  });
```

In `packages/mcp/test/bridge.integration.test.ts`, keep the clone the tests run in. Replace:
```ts
let configDir: string;
let env: Record<string, string>;
let mcp: Client;
```
with:
```ts
let configDir: string;
let env: Record<string, string>;
let mcp: Client;
let repo: string;
```
and, in `beforeAll`, replace:
```ts
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
```
with:
```ts
  repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
```
Then add this test at the end of the file, after `'hands a finalize to the window and takes the final back'`:
```ts
it('asks before bringing a changed plan in, and brings it in on yes', async () => {
  // Continues from the tests above: the plan is v1, and its one question is resolved.
  const PLAN = 'docs/specs/restock-reminders.md';
  const file = path.join(repo, PLAN);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('A daily job finds', 'An hourly job finds'));
  const open = async (args: Record<string, unknown>) => json(await mcp.callTool({ name: 'dp_open', arguments: args }));
  expect(await open({ plan: PLAN })).toMatchObject({ kind: 'plan-changed', version: 1, nextVersion: 2, added: 1, removed: 1 });
  expect(await open({ plan: PLAN, update: false })).toMatchObject({ kind: 'reopened', importTypes: [] });
  const updated = await open({ plan: PLAN, update: true });
  expect(updated).toMatchObject({ kind: 'updated', version: 2, merged: { clean: 1, conflicts: 0 } });
  for (const t of updated.importTypes as { id: string }[]) {
    const batch = t.id === 'questions' ? { items: [{ key: 'channels', title: 'Which channels?', summary: 'SMS or email.' }] } : { noChanges: 'None.' };
    const r = await mcp.callTool({ name: 'dp_write_items', arguments: { repo: 'acme-app', project: 'restock-reminders', type: t.id, ...batch } });
    expect(r.isError).toBeFalsy();
  }
  const P = '/api/projects/acme-app/restock-reminders';
  expect((await http(P)).project.status).toBe('active');
  expect((await http(`${P}/versions`)).versions.map((v: { n: number; current: boolean }) => [v.n, v.current])).toEqual([
    [2, true],
    [1, false],
  ]);
  // The question kept its id and its thread, which is still resolved.
  expect((await http(`${P}/threads/t-questions-channels`)).thread.status).toBe('resolved');
}, 60_000);
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/mcp/test/tools.test.ts packages/mcp/test/plugin.test.ts`
Expected: FAIL, 3 tests.
- `dp_open`'s input schema has no `update` or `fresh`, so the MCP server drops them and the service's calls don't match: `expected [ { …(3) }, { …(3) }, { …(3) }, …(1) ] to deeply equal [ { …(3) }, { …(4) }, { …(4) }, …(1) ]`.
- `dp_write_items` drops `removed` the same way: `expected [ { repo: 'acme', …(4) } ] to deeply equal [ { repo: 'acme', …(5) } ]`.
- SKILL.md §1 doesn't contain `**plan-changed**`.

- [ ] **Step 3: Pass `update` and `fresh` through `dp_open`, and `removed` through `dp_write_items`**

In `packages/mcp/src/tools.ts`, replace:
```ts
  server.registerTool(
    'dp_open',
    {
      description:
        "Open a plumbing project for the repo this session is in. Pass plan (a Markdown plan's path, relative to the repo or absolute) to import it, or to reopen it if it was imported before. Pass project (an id from a listing) to reopen one. Pass neither to list this repo's plumbing projects. The result's kind and next say what to do.",
      inputSchema: { plan: z.string().min(1).optional(), project: z.string().min(1).optional() },
    },
```
with:
```ts
  server.registerTool(
    'dp_open',
    {
      description:
        "Open a plumbing project for the repo this session is in. Pass plan (a Markdown plan's path, relative to the repo or absolute) to import it, or to reopen it if it was imported before. Pass project (an id from a listing) to reopen one. Pass neither to list this repo's plumbing projects. When the plan in the repo changed since the project's current version, it returns plan-changed and changes nothing: ask the user, then call it again with the same plan or project and update: true (it returns updated, with the importers to run again), update: true with fresh: true (the same, but the draft starts again from the new version) or update: false (it opens the project as it was). The result's kind and next say what to do.",
      inputSchema: {
        plan: z.string().min(1).optional(),
        project: z.string().min(1).optional(),
        update: z.boolean().optional().describe("The user's answer after plan-changed: true brings the new version in, false opens the project as it was"),
        fresh: z.boolean().optional().describe('With update: true, when the user picked "Start the draft from v<n>": the draft starts again from the new version instead of merging'),
      },
    },
```
The handler below it stays as it is: it already forwards every argument (`{ ...args, cwd: o.cwd, windowId: o.windowId }`).

`dp_write_items` takes a re-import's `removed` too. Its items come from `importItemSchema`, whose `title` and `summary` are now optional (Task 5). Replace:
```ts
        'Write everything one plumbing type found in the plan, in one call: items, or noChanges with a reason. The batch is checked as a whole. If anything is wrong, nothing is saved and the error lists every problem: fix them all and send the whole batch again.',
      inputSchema: { ...project, type: z.string().min(1).describe('The plumbing type id'), items: z.array(importItemSchema).max(60).optional(), noChanges: z.string().min(1).max(500).optional() },
```
with:
```ts
        'Write everything one plumbing type found in the plan, in one call: items, or noChanges with a reason. In a re-import, removed lists the keys of existing items whose part of the plan the new version took out, with items or on its own. The batch is checked as a whole. If anything is wrong, nothing is saved and the error lists every problem: fix them all and send the whole batch again.',
      inputSchema: {
        ...project,
        type: z.string().min(1).describe('The plumbing type id'),
        items: z.array(importItemSchema).max(60).optional(),
        noChanges: z.string().min(1).max(500).optional(),
        removed: z.array(z.string().min(1)).max(200).optional().describe('Re-import only: keys of existing items whose part of the plan was taken out'),
      },
```

- [ ] **Step 4: Teach the skill to ask**

In `plugin/skills/dev-plumbing/SKILL.md`, replace §1 whole: the lines from `## 1. Open` through ``If `dp_open` returns an error, tell the user the error and stop.``, its last line, become the block below. The blank line before `## 2. Import` stays, and every other line of the file stays byte for byte. Inside §1, the needs-profile, pick-project, created and reopened lines are unchanged; the new ones are `plan-changed`, `updated`, the paragraph on a `next` that starts with `Tell the user`, and the error line, which now says what to do after an error that follows `update: true`.
```markdown
## 1. Open

Call `dp_open`. If the user gave a path ($ARGUMENTS), pass it as `plan`; otherwise pass nothing. Then follow `kind`:

- **needs-profile**: this repo has no repo profile yet, or, with `redetect: true`, the user pressed **Detect again** for its profile (`name`). Start one `dev-plumbing:repo-setup` subagent with the result's `model`, and tell it the `clone`, `remote` and `suggestedName`. When it returns, tell the user in one line what it saved, and that they can change it in Settings → Repos. Then call `dp_open` again once, with the same arguments. If it still says needs-profile, tell the user the repo-setup subagent couldn't save a profile, point them to Settings → Repos, and stop.
- **pick-project**: show the user the projects as a short list (title, and how many are waiting), ask which one to open with AskUserQuestion, then call `dp_open` with `project` set to its id. If the list is empty, tell the user to run `/dev-plumbing path/to/plan.md`, and stop.
- **plan-changed**: the plan in the repo changed since this project's current version. Nothing in the project has changed yet. Ask the user with AskUserQuestion. `next` has the exact question, which reads:
  > The plan changed in the repo since v<n> (<a> lines added, <r> removed). Update to v<n+1>?

  Here `<n>` is `version`, `<n+1>` is `nextVersion`, `<a>` is `added` and `<r>` is `removed`; "1 line" when `added` is 1. When this clone is on another branch than the project's current version came from, it starts "The plan on branch <branch> changed since v<n>" instead. Before "Update to", it adds " Only the formatting changed." when `whitespaceOnly` is true, or else " It's mostly rewritten, so merging would leave <k> conflicts." when `suggestFresh` is true, where `<k>` is `conflicts`.
  - Without `suggestFresh`, the options are **Update to v<n+1>** and **Not now**.
  - With `suggestFresh`, they're **Update to v<n+1> (merge into my draft)**, **Start the draft from v<n+1>** and **Not now**.

  Then call `dp_open` again with the same `plan` (or `project`) as before, plus `update: true` to merge the new version into the draft, `update: true` and `fresh: true` for **Start the draft from v<n+1>**, or `update: false` for **Not now**. If the user already gave the answer, for example in the message that started this, use it without asking. If the question can't be asked, because no one is there to answer it, take **Not now**. After **Not now**, the next `/dev-plumbing` asks again.
- **updated**: the new version is in. The changes that didn't clash with the draft are merged into it, and each clash is a thread under Plan changes, already queued for Claude. Tell the user, in one line, the line `next` starts with: `v<n>: <clean> changes merged, <conflicts> to settle in Plan changes.`, `v<n>: <clean> changes merged, nothing to settle.` when nothing clashed, or `v<n>: the draft now starts from the plan's v<n>. Your earlier draft is kept under Versions.` after **Start the draft from v<n>**. Then go to 2 with its `importTypes`. Once the importers have returned, `dp_wait` hands you the clashes in 3.
- **created** or **reopened**, with a non-empty `importTypes`: go to 2.
- **reopened** with no `importTypes`: tell the user the project's `url`, then go to 3.

Whatever the kind, when `next` starts with `Tell the user: "…"`, tell the user that line first. A **reopened** project uses it to say that the plan changed but the update has to wait, for example while Claude has threads to answer, or that this clone has an older version of the plan.

If `dp_open` returns an error after `update: true`, the project changed in the meantime: tell the user the error, then call `dp_open` again with the same `plan` (or `project`) and `update: false`, and carry on from there. If it returns any other error, tell the user the error and stop.
```

- [ ] **Step 5: Teach the importer to re-import**

In `plugin/agents/importer.md`, replace:
```markdown
   - `existingItems`: items that other importers already wrote, which you may link to and point at.
```
with:
```markdown
   - `existingItems`: items that other importers already wrote, which you may link to and point at. One marked `removed: true` was taken out of the plan by a later version.
   - `reimport`: null when the plan is imported for the first time. When it's set, the plan changed and this type is imported again: follow Re-import below as well.
```
Then, at the end of the file, replace:
```markdown
- **Phases:** list each phase's items in `itemIds`, using ids from `existingItems`. Every in-scope item belongs to a phase.
```
with:
```markdown
- **Phases:** list each phase's items in `itemIds`, using ids from `existingItems`. Every in-scope item belongs to a phase.

## Re-import

When `reimport` is set, the user brought a new version of the plan in, and every plumbing type is imported again. The user's answers live in each item's thread, so what you send is matched to what's already there by `key`. `reimport` has:
- `from` and `to`: the plan's old and new version numbers.
- `changes`: what changed in the plan between those versions, as lines starting with `+ ` (added), `- ` (removed) or two spaces (unchanged), in hunks headed `@@`. `draft` is already the new version, with the user's own edits in it.
- `existing`: this type's imported items, each with its `key`, `id`, `title`, `summary`, `body`, `fields`, `mdAnchor`, `hasData` and `data` (its drawing as it is now, or null), and `removed` (an earlier version took it out of the plan).

Then:
- **Send new items, items whose part of the plan `changes` touched, and `removed`: the keys of existing items whose part of the plan the `- ` lines took out.** Never remove an item because the draft now answers it or its thread settled it. An existing item you don't mention is left as it is. Send `removed` in the same `dp_write_items` call as `items`, or on its own when every item of the type left the plan.
- **Reuse an existing `key` for the same thing,** even when its wording changed, so it keeps its id, its thread and its answers. A `removed` item whose part of the plan is back comes back under its old key. Use a new key only for something new, with a title and a summary.
- **Change only what the plan changed.** For an existing item, send its key, plus only the fields that changed; a field you leave out keeps its value, title and summary included (so leave out `data` unless the drawing changed). Any field you send that differs from `existing` marks the item "Changed in the plan's v<to>." for the user to look at again. To clear a `body`, `links` or `codeRefs`, send it empty.
- **Ask only about what changed.** Give a `message` only to a new item, or to one whose change raises something to decide, and ask about the change. Don't ask again what its thread already settled.
- **Drawings:** If a drawing's part of the plan changed, edit the current `data` you're given; don't redraw it from scratch. Send the whole edited `data`. A drawing you don't send stays as it is.
- **Use `noChanges` only when nothing in `changes` touches this type.** It leaves every item of the type exactly as it is, drawings included.
- Links work as at a first import: keys in your batch, or ids from `existingItems`. A reused key keeps its item's id, so links to it still hold.
```

- [ ] **Step 6: Tell the thread agent about threads with nothing to answer**

In `plugin/agents/thread.md`, replace:
```markdown
2. Read the person's last message. It's an option they picked (maybe with a note), a preset, a custom answer or free text. Answer what they actually said. Respect every decision so far. If their answer contradicts one, say so plainly.
```
with:
```markdown
2. Read the person's last message. It's an option they picked (maybe with a note), a preset, a custom answer or free text. Answer what they actually said. Respect every decision so far. If their answer contradicts one, say so plainly.

   If the thread has no message from the person yet, the service sent it to you: a Plan changes thread, for example, made when the plan changed in the repo. There's nothing to answer, so do what the plumbing type's Rules say, using the item's body and the draft.
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
- `tools.test.ts` has 12 tests, and `plugin.test.ts` 11.
- `bridge.integration.test.ts` has 3: after the finalize, the plan changes in the clone, and the real MCP server carries `plan-changed`, a **Not now**, and an update to v2 whose re-import ends with the project active and its question's thread still resolved.

- [ ] **Step 8: Commit**

```bash
git add packages/mcp/src/tools.ts packages/mcp/test/tools.test.ts packages/mcp/test/plugin.test.ts packages/mcp/test/bridge.integration.test.ts plugin/skills/dev-plumbing/SKILL.md plugin/agents/importer.md plugin/agents/thread.md
git commit -m "feat(plugin): Claude asks before updating to a new plan version, and importers re-import by key" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Web: versions

Once a project has a v2, Documents says which version Original and Draft are, and adds **Versions**: every version of the plan, the current one first, with its date, branch, commit and what its merge did. A version's page shows that version's plan or draft, what the update that brought it in changed in your draft, and its plan compared with another version's.

**Files:**
- Create:
  - `packages/web/src/pages/versions/VersionsPage.tsx`
  - `packages/web/src/pages/versions/VersionPage.tsx`
  - `packages/web/src/pages/versions/VersionsPage.test.tsx`
  - `packages/web/src/pages/versions/VersionPage.test.tsx`
  - `packages/web/src/pages/ProjectNav.test.tsx`
  - `packages/web/e2e/versions.spec.ts`
- Modify:
  - `packages/web/src/api/client.ts` (the three version methods)
  - `packages/web/src/router.tsx` (the two routes)
  - `packages/web/src/pages/ProjectNav.tsx` (the labels and the Versions link)
- Test:
  - `packages/web/src/pages/versions/VersionsPage.test.tsx`
  - `packages/web/src/pages/versions/VersionPage.test.tsx`
  - `packages/web/src/pages/ProjectNav.test.tsx`
  - `packages/web/e2e/versions.spec.ts`

**Interfaces:**
- Consumes:
  - Task 1 (`@dev-plumbing/core/schemas`): `PlanVersion` (`{ n, at, hash, clone, branch, commit: string | null, merge?: { clean, conflicts } }`), `VersionSummary = PlanVersion & { current: boolean }` (exported from `schemas/views.ts`), and `ProjectHome.version: { current: number; count: number }`.
  - Task 2's count: `clean` is the number of change blocks the merge made in your draft. So a one-line change that doesn't touch your draft's edits merges as `{ clean: 1, conflicts: 0 }`.
  - Task 3: the built-in Plan changes type is in `home.types` only once the project has items of it. An update without conflicts shows none.
  - Task 5: in a re-import, `noChanges` leaves the type's items alone, and the last batch takes the project back to Active.
  - Task 6:
    - `POST /api/claude/open` with `update?: boolean`. A changed plan with no `update` returns `{ kind: 'plan-changed', version, nextVersion, added, removed, … }` and writes nothing. `update: true` returns `{ kind: 'updated', version, merged: { clean, conflicts }, importTypes, … }`, and `importTypes` lists all 10 types in the e2e setup.
    - `GET /api/projects/:repo/:id/versions` returns `{ versions: VersionSummary[] }`, newest first.
    - `GET …/versions/:n/:which` (`original` | `draft`) returns `{ text: string | null }`.
    - `GET …/versions/compare?from=<n>&to=<n>&which=original|draft` returns `{ segments: DiffSegment[] }` from `diffText(from's text, to's text)`.
    - `GET …/versions/:n/update-diff` returns `{ segments: DiffSegment[] }`: the draft before the update that brought v<n> in, against the draft as it merged. v1 is a 404.
    - The 404 body for an unknown version is `{ error: "That version doesn't exist." }`.
  - Plans 1–4:
    - the components `Segmented`, `DiffView`, `inputClass` and `Group` (`components/GroupedList.tsx`, the Finalize checklist's grouped list), and `formatUpdated` (`lib/time.ts`);
    - `MARKDOWN_COMPONENTS` (`pages/finalize/ProposalView.tsx`), as `DocumentView` uses it;
    - `routerMock` (`pages/visual/testkit.tsx`);
    - the e2e helpers `importProject`, `asClaude`, `api`, `fixtureRepo`, `PLAN_TEXT` and `noSideScroll`.

    The e2e fixture clone has no commits, so `gitHead` is null there and a version shows its branch only.
- Produces:
  - `web/src/api/client.ts`, exactly as in the Contracts:
    - `api.versions(repo, id): Promise<{ versions: VersionSummary[] }>`
    - `api.versionDoc(repo, id, n: number, which: 'original' | 'draft'): Promise<{ text: string | null }>`
    - `api.compareVersions(repo, id, from: number, to: number, which: 'original' | 'draft'): Promise<{ segments: DiffSegment[] }>`
    - `api.updateDiff(repo, id, n: number): Promise<{ segments: DiffSegment[] }>`
  - The routes `/p/$repo/$project/versions` → `VersionsPage` and `/p/$repo/$project/versions/$n` → `VersionPage`.
  - `VersionsBody({ repo, project })` and `versionMeta(v: VersionSummary): string` from `pages/versions/VersionsPage.tsx`, and `VersionBody({ repo, project, n })` from `pages/versions/VersionPage.tsx`, for tests.
  - Test ids: `versions-list`, `version-row`, `version-doc`, `version-update-diff` and `version-compare`.
- **Behaviour:**
  - **`ProjectNav`:**
    - With `home.version.count > 1`, the Documents links read "Original (v<current>)" and "Draft (v<current>)", and a **Versions** link follows them, before Final.
    - With one version, nothing changes: "Original", "Draft", "Final", and no Versions link. `documents.spec.ts` and `project-home.spec.ts` depend on that.
  - **Versions page:**
    - It has the heading "Versions", then one row per version, newest first, each linking to `versions/<n>`.
    - A row shows `v<n>`, "Current" on the current one, and one line: `<date> · <branch>[ · <commit, 7 chars>] · <merge>`.
      - The date comes from `formatUpdated`.
      - The commit part is left out when `commit` is null.
      - `<merge>` is "Imported" for v1, otherwise "<n> change(s) merged · <n> conflict(s)".
  - **A version's page:**
    - "‹ Versions", the heading `v<n>` (with "Current" next to it on the current version), and the same line as its row.
    - A `Segmented` with **Plan** and **Draft** shows that version's `original` or `draft` as Markdown (`version-doc`), rendered as `DocumentView` renders documents. A missing text says "This document is missing."
    - For a version an update brought in (it has `merge`), a section "What the update changed in your draft" shows a `DiffView` (`version-update-diff`) of the draft before that update against the draft as the update left it, so you see what merged in and what a fresh start replaced. When nothing differs, it says "The update didn't change your draft." v1 has no such section.
    - **Compare with** is a `<select>` of the other versions, the current one labelled "v<n> · Current". It defaults to the current version, or to the version before it when this one is current.
    - Under it, "Changes to the plan from v<older> to v<newer>" and a `DiffView` of the two plans (`version-compare`). The diff always runs from the older version to the newer one. When nothing differs, it says "The two plans are the same."
    - With only one version, there's nothing to compare, and the section isn't shown. A version that isn't in the list shows "This version doesn't exist."
  - **Ink wash:** the pages use tokens only, with no tinted boxes; the list is `Group` from `components/GroupedList.tsx`, the same grouped list as the Finalize checklist. Neither page has a primary button, so the header's Submit all stays the only one. Everything is one column, and long lines wrap on a phone.
  - **Live updates:** the query keys are `['versions', repo, project]`, `['versionDoc', repo, project, n, which]`, `['versionUpdateDiff', repo, project, n]` and `['versionCompare', repo, project, from, to]`, so `useLiveUpdates` refreshes them after an update.

- [ ] **Step 1: Write the failing component tests**

`packages/web/src/pages/versions/VersionsPage.test.tsx`:
```tsx
import type { VersionSummary } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { formatUpdated } from '../../lib/time';
import { versionMeta, VersionsBody } from './VersionsPage';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const V1: VersionSummary = { n: 1, at: '2026-10-01T09:00:00.000Z', hash: 'a'.repeat(64), clone: '~/Source/acme-app', branch: 'main', commit: null, current: false };
const V2: VersionSummary = {
  n: 2,
  at: '2026-10-04T09:00:00.000Z',
  hash: 'b'.repeat(64),
  clone: '~/Source/acme-app',
  branch: 'restock',
  commit: '0123456789abcdef0123456789abcdef01234567',
  merge: { clean: 3, conflicts: 1 },
  current: true,
};

function show(versions: VersionSummary[]) {
  const list = vi.spyOn(api, 'versions').mockResolvedValue({ versions });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VersionsBody repo="acme-app" project="restock" />
    </QueryClientProvider>,
  );
  return list;
}

describe('the Versions page', () => {
  it('lists every version, the current one first, with where it came from and what it merged', async () => {
    const list = show([V2, V1]);
    const rows = within(await screen.findByTestId('versions-list')).getAllByTestId('version-row');
    expect(list).toHaveBeenCalledWith('acme-app', 'restock');
    expect(screen.getByRole('heading', { name: 'Versions' })).toBeTruthy();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.getAttribute('href')).toBe('/p/acme-app/restock/versions/2');
    expect(within(rows[0]!).getByText('v2')).toBeTruthy();
    expect(within(rows[0]!).getByText('Current')).toBeTruthy();
    expect(rows[0]!.textContent).toContain(`${formatUpdated(V2.at)} · restock · 0123456 · 3 changes merged · 1 conflict`);
    expect(rows[1]!.getAttribute('href')).toBe('/p/acme-app/restock/versions/1');
    expect(within(rows[1]!).getByText('v1')).toBeTruthy();
    expect(within(rows[1]!).queryByText('Current')).toBeNull();
    // v1 is the import, and a clone with no commit yet shows only its branch.
    expect(rows[1]!.textContent).toContain(`${formatUpdated(V1.at)} · main · Imported`);
  });

  it('counts in the singular', () => {
    expect(versionMeta({ ...V2, commit: null, merge: { clean: 1, conflicts: 0 } })).toBe(`${formatUpdated(V2.at)} · restock · 1 change merged · 0 conflicts`);
  });

  it("says why the list couldn't be read", async () => {
    vi.spyOn(api, 'versions').mockRejectedValue(new Error("There's no plumbing project restock in acme-app."));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <VersionsBody repo="acme-app" project="restock" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("There's no plumbing project restock in acme-app.")).toBeTruthy();
  });
});
```

`packages/web/src/pages/versions/VersionPage.test.tsx`:
```tsx
import type { DiffSegment, VersionSummary } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { VersionBody } from './VersionPage';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const version = (n: number, over: Partial<VersionSummary> = {}): VersionSummary => ({
  n,
  at: '2026-10-01T09:00:00.000Z',
  hash: String(n).repeat(64),
  clone: '~/Source/acme-app',
  branch: 'main',
  commit: null,
  ...(n > 1 ? { merge: { clean: 1, conflicts: 0 } } : {}),
  current: false,
  ...over,
});
const V1 = version(1);
const V2 = version(2, { current: true });
const PLAN = '# Restock reminders\n\n## Channels\n\nSend by SMS.\n';
const DRAFT = '# Restock reminders\n\n## Channels\n\nSend by SMS and email.\n';
const SEGMENTS: DiffSegment[] = [
  { kind: 'same', text: '# Restock reminders\n\n## Channels\n\n' },
  { kind: 'removed', text: 'Send by SMS.\n' },
  { kind: 'added', text: 'Send by SMS and email.\n' },
];

type Docs = { original: string | null; draft: string | null };

/**
 * Version n's page. Every version's plan and draft are PLAN and DRAFT, and every comparison, and what each update did
 * to the draft, is SEGMENTS, unless given.
 */
function show(n: number, versions: VersionSummary[], o: { docs?: Docs; segments?: DiffSegment[]; updated?: DiffSegment[] } = {}) {
  const docs = o.docs ?? { original: PLAN, draft: DRAFT };
  vi.spyOn(api, 'versions').mockResolvedValue({ versions });
  const doc = vi.spyOn(api, 'versionDoc').mockImplementation(async (_repo, _id, _n, which) => ({ text: docs[which] }));
  const compare = vi.spyOn(api, 'compareVersions').mockResolvedValue({ segments: o.segments ?? SEGMENTS });
  const updateDiff = vi.spyOn(api, 'updateDiff').mockResolvedValue({ segments: o.updated ?? SEGMENTS });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VersionBody repo="acme-app" project="restock" n={n} />
    </QueryClientProvider>,
  );
  return { doc, compare, updateDiff };
}

describe('a version', () => {
  it("shows the version's plan, then its draft", async () => {
    const { doc } = show(1, [V2, V1]);
    expect((await screen.findByTestId('version-doc')).textContent).toContain('Send by SMS.');
    expect(doc).toHaveBeenCalledWith('acme-app', 'restock', 1, 'original');
    expect(screen.getByRole('heading', { name: 'v1' })).toBeTruthy();
    expect(screen.queryByText('Current')).toBeNull();
    expect(screen.getByText(/· main · Imported$/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '‹ Versions' }).getAttribute('href')).toBe('/p/acme-app/restock/versions');
    fireEvent.click(screen.getByRole('tab', { name: 'Draft' }));
    await waitFor(() => expect(screen.getByTestId('version-doc').textContent).toContain('Send by SMS and email.'));
    expect(doc).toHaveBeenCalledWith('acme-app', 'restock', 1, 'draft');
  });

  it('compares an older version with the current one', async () => {
    const { compare } = show(1, [V2, V1]);
    const select = (await screen.findByLabelText('Compare with')) as HTMLSelectElement;
    expect(select.value).toBe('2');
    expect([...select.options].map((o) => o.textContent)).toEqual(['v2 · Current']);
    await waitFor(() => expect(compare).toHaveBeenCalledWith('acme-app', 'restock', 1, 2, 'original'));
    expect(screen.getByText('Changes to the plan from v1 to v2')).toBeTruthy();
    const diff = await screen.findByTestId('version-compare');
    await waitFor(() => expect(diff.textContent).toContain('+ Send by SMS and email.'));
    expect(diff.textContent).toContain('− Send by SMS.');
  });

  it('compares the current version with the one before it, or with any other you pick', async () => {
    const { compare } = show(3, [version(3, { current: true }), version(2), V1]);
    expect(await screen.findByText('Current')).toBeTruthy();
    const select = (await screen.findByLabelText('Compare with')) as HTMLSelectElement;
    expect(select.value).toBe('2');
    expect([...select.options].map((o) => o.textContent)).toEqual(['v2', 'v1']);
    await waitFor(() => expect(compare).toHaveBeenCalledWith('acme-app', 'restock', 2, 3, 'original'));
    fireEvent.change(select, { target: { value: '1' } });
    await waitFor(() => expect(compare).toHaveBeenCalledWith('acme-app', 'restock', 1, 3, 'original'));
    expect(screen.getByText('Changes to the plan from v1 to v3')).toBeTruthy();
  });

  it('shows what the update that brought a version in changed in your draft', async () => {
    const { updateDiff } = show(2, [V2, V1]);
    const diff = await screen.findByTestId('version-update-diff');
    expect(updateDiff).toHaveBeenCalledWith('acme-app', 'restock', 2);
    expect(screen.getByText('What the update changed in your draft')).toBeTruthy();
    await waitFor(() => expect(diff.textContent).toContain('+ Send by SMS and email.'));
    expect(diff.textContent).toContain('− Send by SMS.');
  });

  it("says when an update didn't change your draft, and has nothing to say about v1", async () => {
    show(2, [V2, V1], { updated: [{ kind: 'same', text: DRAFT }] });
    expect(await screen.findByText("The update didn't change your draft.")).toBeTruthy();
    cleanup();
    vi.restoreAllMocks();
    const { updateDiff } = show(1, [V2, V1]);
    expect((await screen.findByTestId('version-doc')).textContent).toContain('Send by SMS.');
    expect(screen.queryByTestId('version-update-diff')).toBeNull();
    expect(updateDiff).not.toHaveBeenCalled();
  });

  it('says when the two plans are the same', async () => {
    show(1, [V2, V1], { segments: [{ kind: 'same', text: PLAN }] });
    expect(await screen.findByText('The two plans are the same.')).toBeTruthy();
  });

  it('has nothing to compare with when there is only one version', async () => {
    const { compare } = show(1, [version(1, { current: true })]);
    expect((await screen.findByTestId('version-doc')).textContent).toContain('Send by SMS.');
    expect(screen.queryByLabelText('Compare with')).toBeNull();
    expect(compare).not.toHaveBeenCalled();
  });

  it("says when a version or its document doesn't exist", async () => {
    show(5, [V2, V1]);
    expect(await screen.findByText("This version doesn't exist.")).toBeTruthy();
    cleanup();
    vi.restoreAllMocks();
    show(1, [V2, V1], { docs: { original: null, draft: null } });
    expect(await screen.findByText('This document is missing.')).toBeTruthy();
    expect(screen.queryByTestId('version-doc')).toBeNull();
  });
});
```

`packages/web/src/pages/ProjectNav.test.tsx`:
```tsx
import type { ProjectHome } from '@dev-plumbing/core/schemas';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectNav } from './ProjectNav';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('./visual/testkit')).routerMock(navigate));

afterEach(cleanup);

/** The parts of the project home the navigation reads: no types, the three documents, and the plan's version. */
const home = (version: { current: number; count: number }) =>
  ({
    summary: { counts: { yourTurn: 0 } },
    types: [],
    documents: { original: true, draft: true, final: false },
    version,
  }) as unknown as ProjectHome;

const links = () => screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]);

describe('ProjectNav documents', () => {
  it('lists Original and Draft plainly while the plan has one version', () => {
    render(<ProjectNav home={home({ current: 1, count: 1 })} repo="acme-app" project="restock" />);
    expect(links()).toEqual([
      ['Inbox', '/p/acme-app/restock'],
      ['Original', '/p/acme-app/restock/d/original'],
      ['Draft', '/p/acme-app/restock/d/draft'],
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
    ]);
    // Final isn't written yet, and has no version.
    expect(screen.getByText('Final')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Write the failing e2e tests**

`packages/web/e2e/versions.spec.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { api, asClaude, fixtureRepo, importProject, PLAN_TEXT, type TestItem } from './claude';
import { noSideScroll } from './env';

const keep = { id: 'keep', label: 'Keep 180 days', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table for 180 days.' }] } };
const retention: TestItem = { key: 'keep', title: 'How long to keep rows?', summary: 'Retention.', message: { text: 'Keep 180 days?', options: [keep] } };

/**
 * A project at v2. Your draft moved on first (accepting an option changed Data), then the plan changed in the repo
 * (Channels gains email). Claude brought the change in, and every importer came back with nothing new.
 */
async function updated(name: string, title: string) {
  const p = await importProject(name, title, { questions: [retention] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/threads/t-questions-keep/draft`, 'PUT', { optionId: 'keep' });
  await api(`${P}/submit`, 'POST', { scope: 'thread', threadId: 't-questions-keep' });
  const rel = `docs/specs/${name}.md`;
  fs.writeFileSync(path.join(fixtureRepo(), rel), PLAN_TEXT(title).replace('Send by SMS.', 'Send by SMS and email.'));
  expect(await asClaude('/open', { cwd: fixtureRepo(), plan: rel })).toMatchObject({ kind: 'plan-changed', version: 1, nextVersion: 2, added: 1, removed: 1 });
  const open = await asClaude('/open', { cwd: fixtureRepo(), plan: rel, update: true });
  expect(open).toMatchObject({ kind: 'updated', version: 2, merged: { clean: 1, conflicts: 0 } });
  for (const t of open.importTypes as { id: string }[]) {
    await asClaude('/items', { repo: p.repo, project: p.project, type: t.id, cwd: fixtureRepo(), noChanges: 'Nothing changed for this type.' });
  }
  return p;
}

test('after an update, Documents says which version you are on, and Versions lists each one, the current first', async ({ page }) => {
  const p = await updated('ver-list', 'Versions list');
  await page.goto(p.url);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await expect(nav.getByRole('link', { name: 'Original (v2)', exact: true })).toBeVisible();
  // No conflicts, so no Plan changes.
  await expect(nav.getByTestId('nav-type-plan-changes')).toHaveCount(0);
  await nav.getByRole('link', { name: 'Draft (v2)', exact: true }).click();
  // Both sides' changes are in the draft.
  await expect(page.getByTestId('document')).toContainText('Log reminders in a table for 180 days.');
  await expect(page.getByTestId('document')).toContainText('Send by SMS and email.');

  await nav.getByRole('link', { name: 'Versions', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/versions$`));
  await expect(page.getByRole('heading', { name: 'Versions', exact: true })).toBeVisible();
  const rows = page.getByTestId('versions-list').getByTestId('version-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('v2');
  await expect(rows.nth(0)).toContainText('Current');
  await expect(rows.nth(0)).toContainText('main · 1 change merged · 0 conflicts');
  await expect(rows.nth(1)).toContainText('v1');
  await expect(rows.nth(1)).toContainText('main · Imported');
  await expect(rows.nth(1)).not.toContainText('Current');
});

test("an older version shows its own plan and draft, and compares with the current one", async ({ page }) => {
  const p = await updated('ver-compare', 'Versions compare');
  await page.goto(`${p.url}/versions`);
  await page.getByTestId('version-row').nth(1).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/versions/1$`));
  await expect(page.getByRole('heading', { name: 'v1', exact: true })).toBeVisible();
  const doc = page.getByTestId('version-doc');
  // v1's plan is the plan as imported.
  await expect(doc).toContainText('Send by SMS.');
  await expect(doc).toContainText('Log reminders in a table.');
  await expect(doc).not.toContainText('180 days');
  // v1's draft has the answer you accepted, and not the repo's later change.
  await page.getByRole('tab', { name: 'Draft', exact: true }).click();
  await expect(doc).toContainText('Log reminders in a table for 180 days.');
  await expect(doc).not.toContainText('Send by SMS and email.');

  await expect(page.getByLabel('Compare with')).toHaveValue('2');
  await expect(page.getByText('Changes to the plan from v1 to v2')).toBeVisible();
  const compare = page.getByTestId('version-compare');
  await expect(compare).toContainText('+ Send by SMS and email.');
  await expect(compare).toContainText('− Send by SMS.');

  // v1 is the import: no update changed its draft.
  await expect(page.getByTestId('version-update-diff')).toHaveCount(0);

  // The current version compares with the one before it, and shows what its update did to your draft.
  await page.getByRole('link', { name: '‹ Versions' }).click();
  await page.getByTestId('version-row').nth(0).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/versions/2$`));
  await expect(page.getByTestId('version-doc')).toContainText('Send by SMS and email.');
  await expect(page.getByLabel('Compare with')).toHaveValue('1');
  await expect(page.getByTestId('version-compare')).toContainText('+ Send by SMS and email.');
  const draftDiff = page.getByTestId('version-update-diff');
  await expect(draftDiff).toContainText('+ Send by SMS and email.');
  await expect(draftDiff).toContainText('− Send by SMS.');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('Versions is in the Plumbing list, and the list and a version fit the width', async ({ page }) => {
    const p = await updated('ver-phone', 'Versions phone');
    await page.goto(p.url);
    await page.getByRole('tab', { name: 'Plumbing' }).click();
    await page.getByRole('link', { name: 'Versions', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${p.url}/versions$`));
    await expect(page.getByTestId('version-row')).toHaveCount(2);
    expect(await noSideScroll(page)).toEqual([]);
    await page.getByTestId('version-row').nth(1).click();
    await expect(page.getByTestId('version-compare')).toContainText('+ Send by SMS and email.');
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run:
```bash
pnpm vitest run packages/web/src/pages/versions packages/web/src/pages/ProjectNav.test.tsx
pnpm test:e2e versions
```
Expected: FAIL.
- `VersionsPage.test.tsx` and `VersionPage.test.tsx` fail because `./VersionsPage` and `./VersionPage` can't be resolved.
- In `ProjectNav.test.tsx`, the first test passes. The second fails: the links still read "Original" and "Draft", and there's no Versions link.
- The e2e tests get through the update, which Tasks 1–6 already serve. Then they fail on the page: there's no "Original (v2)" link, `/versions` is "Page not found", and the phone list has no Versions link.

- [ ] **Step 4: Add the version methods to the API client**

In `packages/web/src/api/client.ts`, in the type import at the top, replace:
```ts
  ConfigProblem,
  MockupKitInfo,
```
with:
```ts
  ConfigProblem,
  DiffSegment,
  MockupKitInfo,
```
and replace:
```ts
  TypeItemRow,
} from '@dev-plumbing/core/schemas';
```
with:
```ts
  TypeItemRow,
  VersionSummary,
} from '@dev-plumbing/core/schemas';
```

In the `api` object, replace:
```ts
  discardProposal: (repo: string, id: string) => request<{ ok: true }>(`${proj(repo, id)}/finalize/discard`, send('POST', {})),
};
```
with:
```ts
  discardProposal: (repo: string, id: string) => request<{ ok: true }>(`${proj(repo, id)}/finalize/discard`, send('POST', {})),
  versions: (repo: string, id: string) => request<{ versions: VersionSummary[] }>(`${proj(repo, id)}/versions`),
  versionDoc: (repo: string, id: string, n: number, which: 'original' | 'draft') => request<{ text: string | null }>(`${proj(repo, id)}/versions/${n}/${which}`),
  compareVersions: (repo: string, id: string, from: number, to: number, which: 'original' | 'draft') =>
    request<{ segments: DiffSegment[] }>(`${proj(repo, id)}/versions/compare?${new URLSearchParams({ from: String(from), to: String(to), which })}`),
  updateDiff: (repo: string, id: string, n: number) => request<{ segments: DiffSegment[] }>(`${proj(repo, id)}/versions/${n}/update-diff`),
};
```

- [ ] **Step 5: Say which version Original and Draft are, and link Versions**

`packages/web/src/pages/ProjectNav.tsx` becomes:
```tsx
import type { DisplayStatus, ProjectHome, TypeEntry } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { StatusMark } from '../components/StatusMark';

const LINK = 'flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[13px] text-ink';
const ACTIVE = { className: 'bg-selection font-medium' };
const DOC_LABELS = { original: 'Original', draft: 'Draft', final: 'Final' } as const;

function typeStatus(t: TypeEntry): DisplayStatus {
  if (t.yourTurn) return 'your_turn';
  if (t.drafts) return 'draft';
  if (t.withClaude) return 'with_claude';
  if (t.itemCount > 0 && t.resolved === t.itemCount) return 'resolved';
  return 'idle';
}

const Section = ({ children }: { children: ReactNode }) => <div className="px-2 pb-1 pt-3 text-[11px] font-semibold text-ink-3">{children}</div>;

export function ProjectNav({ home, repo, project, onNavigate }: { home: ProjectHome; repo: string; project: string; onNavigate?: () => void }) {
  // Once the plan has a v2, Original and Draft say which version they are, and the earlier ones are under Versions.
  const versioned = home.version.count > 1;
  const docEntry = (doc: 'original' | 'draft' | 'final') => {
    const label = versioned && doc !== 'final' ? `${DOC_LABELS[doc]} (v${home.version.current})` : DOC_LABELS[doc];
    return home.documents[doc] ? (
      <Link to="/p/$repo/$project/d/$doc" params={{ repo, project, doc }} activeProps={ACTIVE} className={LINK} onClick={onNavigate}>
        {label}
      </Link>
    ) : (
      <span className={`${LINK} text-ink-3`}>
        {label}
        <span className="ml-auto text-[11px]">Not yet</span>
      </span>
    );
  };
  return (
    <nav className="flex flex-col gap-px">
      <Link to="/p/$repo/$project" params={{ repo, project }} activeOptions={{ exact: true }} activeProps={ACTIVE} className={LINK} onClick={onNavigate}>
        Inbox
        <span className="ml-auto text-[11px] text-ink-3">{home.summary.counts.yourTurn || ''}</span>
      </Link>
      <Section>Plumbing</Section>
      {home.types.map((t) => (
        <Link
          key={t.id}
          to="/p/$repo/$project/t/$type"
          params={{ repo, project, type: t.id }}
          activeProps={ACTIVE}
          className={`${LINK} ${t.noChanges ? 'text-ink-3' : ''}`}
          onClick={onNavigate}
          data-testid={`nav-type-${t.id}`}
        >
          <span className="min-w-0 truncate">{t.title}</span>
          <span className="ml-auto inline-flex shrink-0 items-center text-[11px] text-ink-3">
            {t.noChanges ? (t.importFailed ? "Didn't finish" : 'No changes') : <StatusMark status={typeStatus(t)} />}
          </span>
        </Link>
      ))}
      <Section>Documents</Section>
      {docEntry('original')}
      {docEntry('draft')}
      {versioned && (
        <Link to="/p/$repo/$project/versions" params={{ repo, project }} activeProps={ACTIVE} className={LINK} onClick={onNavigate}>
          Versions
        </Link>
      )}
      {docEntry('final')}
      <Section>Review</Section>
      <span className={`${LINK} text-ink-3`} title="Whiteboard Defense arrives in a later update.">
        Whiteboard Defense
      </span>
    </nav>
  );
}
```

- [ ] **Step 6: Write the Versions page**

`packages/web/src/pages/versions/VersionsPage.tsx`:
```tsx
import type { VersionSummary } from '@dev-plumbing/core/schemas';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { api } from '../../api/client';
import { Group } from '../../components/GroupedList';
import { formatUpdated } from '../../lib/time';

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * Where a version came from, in one line: when, the branch (and commit, when the clone had one), and what its merge
 * did. v1 is the import.
 */
export function versionMeta(v: VersionSummary): string {
  const source = v.commit ? `${v.branch} · ${v.commit.slice(0, 7)}` : v.branch;
  const merge = v.merge ? `${count(v.merge.clean, 'change')} merged · ${count(v.merge.conflicts, 'conflict')}` : 'Imported';
  return [formatUpdated(v.at), source, merge].join(' · ');
}

export function VersionsPage() {
  const { repo, project } = useParams({ from: '/p/$repo/$project/versions' });
  return <VersionsBody repo={repo} project={project} />;
}

/** Every version of the plan, the current one first. Each opens that version's plan and draft. */
export function VersionsBody({ repo, project }: { repo: string; project: string }) {
  const q = useQuery({ queryKey: ['versions', repo, project], queryFn: () => api.versions(repo, project) });
  if (q.error) return <p className="text-[13px] text-seal">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  return (
    <div className="max-w-[80ch]">
      <h2 className="text-[20px] font-semibold">Versions</h2>
      <p className="mt-1 text-[12.5px] text-ink-3">Each time you bring the repo's changes in, the plan and the draft from before are kept here.</p>
      <Group testId="versions-list">
        {q.data.versions.map((v) => (
          <Link
            key={v.n}
            to="/p/$repo/$project/versions/$n"
            params={{ repo, project, n: String(v.n) }}
            className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-selection"
            data-testid="version-row"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium">v{v.n}</span>
                {v.current && <span className="text-[10.5px] font-semibold text-ink-3">Current</span>}
              </div>
              <div className="break-words text-[11.5px] text-ink-3">{versionMeta(v)}</div>
            </div>
            <span className="text-ink-3">›</span>
          </Link>
        ))}
      </Group>
    </div>
  );
}
```

- [ ] **Step 7: Write a version's page, and route both**

`packages/web/src/pages/versions/VersionPage.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../api/client';
import { DiffView } from '../../components/DiffView';
import { inputClass } from '../../components/inputClass';
import { Segmented } from '../../components/Segmented';
import { MARKDOWN_COMPONENTS } from '../finalize/ProposalView';
import { versionMeta } from './VersionsPage';

type Which = 'original' | 'draft';

export function VersionPage() {
  const { repo, project, n } = useParams({ from: '/p/$repo/$project/versions/$n' });
  // Keyed by version, so Plan | Draft and Compare with start afresh on each one.
  return <VersionBody key={n} repo={repo} project={project} n={Number(n)} />;
}

/** One version of the plan: its plan or its draft, and its plan compared with another version's. */
export function VersionBody({ repo, project, n }: { repo: string; project: string; n: number }) {
  const [which, setWhich] = useState<Which>('original');
  const [picked, setPicked] = useState<number | null>(null);
  const list = useQuery({ queryKey: ['versions', repo, project], queryFn: () => api.versions(repo, project) });
  const doc = useQuery({ queryKey: ['versionDoc', repo, project, n, which], queryFn: () => api.versionDoc(repo, project, n, which) });
  const versions = list.data?.versions ?? [];
  const version = versions.find((v) => v.n === n);
  // Newest first, like the list. By default an older version is compared with the current one, and the current one
  // with the version before it.
  const others = versions.filter((v) => v.n !== n);
  const fallback = version?.current ? (others.find((v) => v.n < n) ?? others[0]) : (others.find((v) => v.current) ?? others[0]);
  const other = picked ?? fallback?.n ?? null;
  // The diff always runs from the older version to the newer one.
  const [from, to] = other === null ? [null, null] : other < n ? [other, n] : [n, other];
  const compare = useQuery({
    queryKey: ['versionCompare', repo, project, from, to],
    queryFn: () => api.compareVersions(repo, project, from!, to!, 'original'),
    enabled: from !== null && to !== null,
  });
  // A version an update brought in: what that update did to the draft. v1 is the import, so it has none.
  const updateDiff = useQuery({
    queryKey: ['versionUpdateDiff', repo, project, n],
    queryFn: () => api.updateDiff(repo, project, n),
    enabled: Boolean(version?.merge),
  });

  if (list.error) return <p className="text-[13px] text-seal">{(list.error as Error).message}</p>;
  if (!list.data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  if (!version) return <p className="text-[13px] text-ink-3">This version doesn't exist.</p>;
  return (
    <div className="max-w-[80ch]">
      <Link to="/p/$repo/$project/versions" params={{ repo, project }} className="text-[12px] text-slate">
        ‹ Versions
      </Link>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-[20px] font-semibold">v{n}</h2>
        {version.current && <span className="text-[10.5px] font-semibold text-ink-3">Current</span>}
      </div>
      <p className="mt-0.5 break-words text-[12px] text-ink-3">{versionMeta(version)}</p>
      <div className="mt-4 max-w-xs">
        <Segmented<Which>
          label="Version document"
          value={which}
          onChange={setWhich}
          options={[
            { value: 'original', label: 'Plan' },
            { value: 'draft', label: 'Draft' },
          ]}
        />
      </div>
      {doc.error ? (
        <p className="mt-4 text-[13px] text-seal">{(doc.error as Error).message}</p>
      ) : !doc.data ? (
        <p className="mt-4 text-[13px] text-ink-3">Loading…</p>
      ) : doc.data.text === null ? (
        <p className="mt-4 text-[13px] text-ink-3">This document is missing.</p>
      ) : (
        <article className="doc mt-4 max-w-[72ch]" data-testid="version-doc">
          <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {doc.data.text}
          </Markdown>
        </article>
      )}
      {version.merge && (
        <section aria-label="Update" className="mt-8 border-t-[0.5px] border-separator pt-4">
          <h3 className="text-[12px] font-semibold text-ink-3">What the update changed in your draft</h3>
          <div data-testid="version-update-diff">
            {updateDiff.error ? (
              <p className="mt-1.5 text-[13px] text-seal">{(updateDiff.error as Error).message}</p>
            ) : !updateDiff.data ? null : updateDiff.data.segments.some((s) => s.kind !== 'same') ? (
              <DiffView segments={updateDiff.data.segments} />
            ) : (
              <p className="mt-1.5 text-[13px] text-ink-3">The update didn't change your draft.</p>
            )}
          </div>
        </section>
      )}
      {other !== null && (
        <section aria-label="Compare" className="mt-8 border-t-[0.5px] border-separator pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <label htmlFor="compare-with" className="text-[12px] font-semibold text-ink-3">
              Compare with
            </label>
            <div className="w-full max-w-[200px]">
              <select id="compare-with" value={other} onChange={(e) => setPicked(Number(e.target.value))} className={inputClass}>
                {others.map((v) => (
                  <option key={v.n} value={v.n}>
                    {v.current ? `v${v.n} · Current` : `v${v.n}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">
            Changes to the plan from v{from} to v{to}
          </p>
          <div data-testid="version-compare">
            {compare.error ? (
              <p className="mt-1.5 text-[13px] text-seal">{(compare.error as Error).message}</p>
            ) : !compare.data ? null : compare.data.segments.some((s) => s.kind !== 'same') ? (
              <DiffView segments={compare.data.segments} />
            ) : (
              <p className="mt-1.5 text-[13px] text-ink-3">The two plans are the same.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
```

In `packages/web/src/router.tsx`, add the imports after `import { TypeView } from './pages/TypeView';`:
```tsx
import { VersionPage } from './pages/versions/VersionPage';
import { VersionsPage } from './pages/versions/VersionsPage';
```
After the `finalizeRoute` line, add:
```tsx
const versionsRoute = createRoute({ getParentRoute: () => projectRoute, path: 'versions', component: VersionsPage });
const versionRoute = createRoute({ getParentRoute: () => projectRoute, path: 'versions/$n', component: VersionPage });
```
and replace:
```tsx
  projectRoute.addChildren([inboxRoute, typeRoute, threadRoute, docRoute, finalizeRoute]),
```
with:
```tsx
  projectRoute.addChildren([inboxRoute, typeRoute, threadRoute, docRoute, finalizeRoute, versionsRoute, versionRoute]),
```

- [ ] **Step 8: Run the component tests**

Run: `pnpm vitest run packages/web/src/pages/versions packages/web/src/pages/ProjectNav.test.tsx && pnpm --filter @dev-plumbing/web typecheck`
Expected: PASS (13 tests: 3 for the list, 8 for a version, 2 for the navigation).

- [ ] **Step 9: Run everything**

Run:
```bash
pnpm vitest run packages/web
pnpm typecheck
pnpm test
pnpm test:e2e versions
pnpm test:e2e
```
Expected: PASS.
- **If `plan-changed` reports other counts than `added: 1, removed: 1`:** the helper changes one line of the plan, so check Task 4's `planChange` line counts.
- **If `merged` isn't `{ clean: 1, conflicts: 0 }`:** your accepted answer changed Data and the repo changed Channels. Those passages are three lines apart, so they merge cleanly. Check Task 2's `clean` count.
- **If the list has no "Current":** check that Task 6's route sets `current` from `currentVersion`, and lists the versions newest first.
- **If the phone test finds sideways scrolling:** the select sits in a `max-w-[200px]` box and uses `inputClass` (which has `min-w-0`). The version line needs `break-words`.
- `documents.spec.ts` and `project-home.spec.ts` still find "Original" and "Draft" by their exact names, because a project that has never been updated has one version.

- [ ] **Step 10: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/router.tsx packages/web/src/pages/ProjectNav.tsx packages/web/src/pages/ProjectNav.test.tsx packages/web/src/pages/versions/VersionsPage.tsx packages/web/src/pages/versions/VersionPage.tsx packages/web/src/pages/versions/VersionsPage.test.tsx packages/web/src/pages/versions/VersionPage.test.tsx packages/web/e2e/versions.spec.ts
git commit -m "feat(web): a Versions list with each version's plan and draft, what its update changed, and compare" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Web: Plan changes and removed items in the app

Most of what an update makes already shows, because it's ordinary items and threads:
- Plan changes is a list type, first in the navigation;
- its items' bodies are Markdown;
- its threads take answers like any other.

This task adds what's missing:
- a row for an item whose part of the plan was removed says so ("· removed from the plan in v2");
- the Finalize page says when a newer version of the plan changed the draft since the last final ("The plan's v2 came in since the last final."), since a finalized project goes back to Active after such an update (Task 4);
- the three passages in a Plan changes item wrap, so a long plan paragraph never needs sideways scrolling.

An e2e test then walks the whole update in the app, from the conflict to Claude's three choices to the parked question, on a phone too.

**Files:**
- Create:
  - `packages/web/src/pages/ListScreen.test.tsx`
  - `packages/web/e2e/plan-update.spec.ts`
- Modify:
  - `packages/core/src/schemas/views.ts` (`TypeItemRow.removedIn`; `planVersionSinceFinal` in `ProjectHome.finalize` and `FinalizeView`)
  - `packages/core/src/store/projects.ts` (`loadTypeItems` fills `removedIn`; `loadProjectHome` fills `planVersionSinceFinal`)
  - `packages/core/test/detail.test.ts` (one test)
  - `packages/core/test/projects.test.ts` (three expectations gain the new field; one test)
  - `packages/service/src/routes/finalize.ts` (`FinalizeView.planVersionSinceFinal`)
  - `packages/service/test/finalize.test.ts` (one expectation)
  - `packages/web/src/pages/finalize/ProposalView.tsx` (`FinalDone` says which version came in)
  - `packages/web/src/pages/finalize/FinalizePage.tsx` (passes it on)
  - `packages/web/src/pages/finalize/ProposalView.test.tsx` and `FinalizePage.test.tsx` (the new prop and field; one test)
  - `packages/web/src/styles.css` (a passage in an `md` block wraps)
  - `packages/web/src/pages/ListScreen.tsx` (the label)
  - `packages/web/src/pages/visual/OtherItems.tsx` (the label)
  - `packages/web/src/pages/visual/testkit.tsx` (`row()` gets `removedIn: null`)
  - `packages/web/src/pages/visual/TimelineStrip.test.tsx` (its `row()` gets `removedIn: null`)
  - `packages/web/src/pages/visual/visual.test.tsx` (one test)
- Test:
  - `packages/core/test/detail.test.ts`
  - `packages/core/test/projects.test.ts`
  - `packages/service/test/finalize.test.ts`
  - `packages/web/src/pages/ListScreen.test.tsx`
  - `packages/web/src/pages/visual/visual.test.tsx`
  - `packages/web/src/pages/finalize/ProposalView.test.tsx`
  - `packages/web/src/pages/finalize/FinalizePage.test.tsx`
  - `packages/web/e2e/plan-update.spec.ts`

**Interfaces:**
- Consumes:
  - Task 1: `Item.removedIn?: number` (`itemSchema`, a whole number from 2); `projectVersions` (`store/versions.ts`).
  - Task 3: the built-in type `plan-changes`, titled "Plan changes", with `order: 0` and `screen: 'list'`. It's in `home.types` only once the project has items of it.
  - Task 4: each conflict is an item:
    - its `title` is the conflict's heading;
    - its `summary` is "Your draft and the repo's v<N> both changed this passage.";
    - its `body` has **Your draft**, **The repo (v<N>)** and **Before (v<N-1>)**, each over a fenced `md` block.

    Its thread is `with_claude`. Its first line is "Your draft and the repo's v<N> both changed this passage. Claude is proposing a merged version." One queued submission holds every conflict thread.
  - Task 4 also: `changedDraft(v: PlanVersion): boolean` (`store/update.ts`), true when the version's update changed the draft (something merged, a conflict, or a fresh start); a finalized project goes back to Active after such an update.
  - Task 3: Claude's reply on a Plan changes thread carries three options, each with a `change`; "Keep my draft" is `change: { md: [] }`.
  - Task 5:
    - In a re-import, an imported item whose key the batch lists in `removed` gets `removedIn: N`, and its thread is parked with "Removed from the plan in v<N>.". If its thread is with Claude, the item is flagged instead. An item the batch doesn't mention is left alone.
    - An item resent with the same key and content is left alone.
    - `checklistFrom` gives a parked item with `removedIn` the reason "Removed from the plan in v<n>.".
  - Task 6: `/api/claude/open` with `update: true` returns `{ kind: 'updated', version, merged: { clean, conflicts }, importTypes }`. `/wait` then hands out the conflict submission as `kind: 'submission'`.
  - Task 8: the navigation's "Draft (v2)" link.
  - Plans 1–4:
    - `/reply` with `options` and `recommended`;
    - a plain accept applied straight away, with "Applied and resolved.";
    - `ItemCard`, which already renders `item.body` as Markdown inside `.doc`, so the three fenced blocks need no change there;
    - the Finalize page's `checklist-parked` group;
    - `FinalDone` (`pages/finalize/ProposalView.tsx`), its `changesSinceFinal`, and `FinalizeView` built in `service/src/routes/finalize.ts` from `loadProjectHome`'s `finalize`;
    - the `.doc` styles in `styles.css`;
    - `routerMock` and `row()` from `pages/visual/testkit.tsx`, and the e2e helpers `importProject`, `asClaude`, `api`, `fixtureRepo`, `rawItem` and `noSideScroll`.
- Produces:
  - `TypeItemRow.removedIn: number | null` (`@dev-plumbing/core/schemas`), filled by `loadTypeItems` from `item.removedIn`.
  - The test id `removed-from-plan`, on the label "· removed from the plan in v<n>" in ink-3.
  - `ProjectHome.finalize.planVersionSinceFinal: number | null` and `FinalizeView.planVersionSinceFinal: number | null`: the newest version whose `at` is after `docs.exportedTo.at` and that `changedDraft`, or null (always null with no final).
  - `FinalDone` takes `planVersionSinceFinal`, and shows "The plan's v<n> came in since the last final." (test id `plan-version-since-final`) under the changes line when it isn't null.
  - `styles.css`: `.doc pre:has(code.language-md) { white-space: pre-wrap; overflow-wrap: anywhere; }`, next to the other `.doc` rules. Only Markdown blocks wrap: a Plan changes passage, or any `md` block in an item's body. Code keeps its lines and scrolls inside its block, as before.
- **Behaviour:**
  - **`ListScreen`:**
    - A removed item that's parked shows in the compact row: its title, then "· removed from the plan in v<n>", then the decision if it has one, then the Parked mark.
    - A removed item that's still in the full row (flagged because Claude had it) gets the label at the end of its summary line, after "· may need another look".
  - **`OtherItems`:** the rows a visual screen lists without a drawing get the same label after their summary.
  - **Drawn items on visual screens** (diagrams, tables, mockups and flows) show their Parked mark but not the label. Their thread view and the Finalize checklist say why.
  - **The Finalize page** (with a final): "The plan's v<n> came in since the last final." under "<n> changes since the last final.", in ink-3, when a version that changed the draft came in after it. The header's Finalize spec button and the Finalized tab follow the project's status, which Task 4 already set back to Active.
  - **A Plan changes item's passages** wrap inside their blocks, on a phone too.

- [ ] **Step 1: Write the failing core test**

In `packages/core/test/detail.test.ts`, replace:
```ts
    expect(r?.items.find((i) => i.id === 'q2')?.decision).toBe('Both channels');
  });
});
```
with:
```ts
    expect(r?.items.find((i) => i.id === 'q2')?.decision).toBe('Both channels');
  });

  it('says which plan version removed an item', async () => {
    const gone = pair('q2', { status: 'parked' });
    const dir = await seedProject({ pairs: [pair('q1'), { item: { ...gone.item, removedIn: 2 }, thread: gone.thread }] });
    const r = await loadTypeItems({ repo: 'acme', id: 'restock', dir }, TYPES, 'questions');
    expect(r?.items.map((i) => [i.id, i.removedIn])).toEqual([
      ['q1', null],
      ['q2', 2],
    ]);
  });
});
```

In `packages/core/test/projects.test.ts`, in `it('says whether Finalize can start, how far it got, and the changes since the last final', …)`, the three expectations gain the field. Replace:
```ts
    expect(await finalizeOf(dir)).toEqual({ canStart: false, blockingCount: 1, state: null, changesSinceFinal: 0 });
```
with:
```ts
    expect(await finalizeOf(dir)).toEqual({ canStart: false, blockingCount: 1, state: null, changesSinceFinal: 0, planVersionSinceFinal: null });
```
Then replace:
```ts
    expect(await finalizeOf(dir)).toEqual({ canStart: true, blockingCount: 0, state: 'writing', changesSinceFinal: 0 });
```
with:
```ts
    expect(await finalizeOf(dir)).toEqual({ canStart: true, blockingCount: 0, state: 'writing', changesSinceFinal: 0, planVersionSinceFinal: null });
```
Then replace the last one, and add a test after it:
```ts
    expect(await finalizeOf(dir)).toEqual({ canStart: true, blockingCount: 0, state: null, changesSinceFinal: 1 });
  });
```
with:
```ts
    expect(await finalizeOf(dir)).toEqual({ canStart: true, blockingCount: 0, state: null, changesSinceFinal: 1, planVersionSinceFinal: null });
  });

  it('says which version of the plan came in since the last final, when it changed the draft', async () => {
    const dir = await seedProject();
    const exportedTo = { clone: '/tmp/acme', path: 'docs/specs/restock.final.md', at: FINAL_AT, assets: [] };
    const v = { hash: 'x', clone: '/tmp/acme', branch: 'main', commit: null };
    const versions = [
      { ...v, n: 1, at: '2026-10-01T09:00:00.000Z' },
      { ...v, n: 2, at: '2026-10-02T09:00:00.000Z', merge: { clean: 3, conflicts: 0 } },
      // After the final: one that left the draft as it was, then one that changed it.
      { ...v, n: 3, at: '2026-10-03T09:00:00.000Z', merge: { clean: 0, conflicts: 0 } },
      { ...v, n: 4, at: '2026-10-04T09:00:00.000Z', merge: { clean: 0, conflicts: 1 } },
    ];
    const project = await readProjectFile(dir);
    await writeProjectFile(dir, { ...project, versions: versions.slice(0, 3), docs: { ...project.docs, final: 'docs/final.md', exportedTo } });
    expect((await finalizeOf(dir)).planVersionSinceFinal).toBeNull();
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), versions });
    expect((await finalizeOf(dir)).planVersionSinceFinal).toBe(4);
  });
```

In `packages/service/test/finalize.test.ts`, the view of a project with no final has no newer version either. Replace:
```ts
    expect(view).toMatchObject({ request: null, proposal: null, final: null, name: 'restock-reminders', listening: null, changesSinceFinal: 0, clones: [{ path: t.repo, source: true }] });
```
with:
```ts
    expect(view).toMatchObject({
      request: null,
      proposal: null,
      final: null,
      name: 'restock-reminders',
      listening: null,
      changesSinceFinal: 0,
      planVersionSinceFinal: null,
      clones: [{ path: t.repo, source: true }],
    });
```

- [ ] **Step 2: Write the failing component tests**

`packages/web/src/pages/ListScreen.test.tsx`:
```tsx
import type { TypeEntry } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListScreen } from './ListScreen';
import { row } from './visual/testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('./visual/testkit')).routerMock(navigate));

afterEach(cleanup);

const QUESTIONS: TypeEntry = {
  id: 'questions',
  title: 'Questions',
  order: 5,
  screen: 'list',
  timeline: false,
  emptyMessage: 'No open questions.',
  itemCount: 3,
  yourTurn: 0,
  drafts: 0,
  withClaude: 1,
  resolved: 1,
  noChanges: null,
  importFailed: false,
  fields: ['blocking', 'default'],
  answerPresets: [],
  addLabel: 'Question',
};

describe('ListScreen', () => {
  it('says which version of the plan removed an item, parked or still with Claude', () => {
    const items = [
      row({ id: 'questions-log', threadId: 't-questions-log', title: 'How long to keep reminder rows?', status: 'parked', removedIn: 2 }),
      row({ id: 'questions-snooze', threadId: 't-questions-snooze', title: 'Snooze a reminder?', summary: 'A week at most.', status: 'with_claude', flagged: true, removedIn: 3 }),
      row({ id: 'questions-channels', threadId: 't-questions-channels', title: 'Which channels?', status: 'resolved' }),
    ];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ListScreen repo="acme-app" project="restock" data={{ type: QUESTIONS, items }} />
      </QueryClientProvider>,
    );
    const [parked, withClaude, resolved] = screen.getAllByTestId('list-row');
    expect(within(parked!).getByRole('img', { name: 'Parked' })).toBeTruthy();
    expect(within(parked!).getByTestId('removed-from-plan').textContent?.trim()).toBe('· removed from the plan in v2');
    // Claude had this one when its section went, so it's flagged rather than parked, and says so too.
    expect(withClaude!.textContent).toContain('A week at most. · may need another look · removed from the plan in v3');
    expect(within(withClaude!).getByTestId('removed-from-plan').className).toContain('text-ink-3');
    expect(within(resolved!).queryByTestId('removed-from-plan')).toBeNull();
  });
});
```

In `packages/web/src/pages/visual/visual.test.tsx`, in `describe('OtherItems')`, replace:
```tsx
  it('renders nothing for no rows', () => {
```
with:
```tsx
  it('says which version of the plan removed an item', () => {
    render(<OtherItems rows={[row({ status: 'parked', removedIn: 2 }), row({ id: 'architecture-later', threadId: 't-architecture-later', title: 'Later' })]} repo="acme-app" project="restock" />);
    const [removed, kept] = screen.getAllByTestId('other-item');
    expect(removed!.textContent).toContain('Jobs, notifications and tables. · removed from the plan in v2');
    expect(kept!.textContent).not.toContain('removed from the plan');
  });

  it('renders nothing for no rows', () => {
```

In `packages/web/src/pages/finalize/ProposalView.test.tsx`, `FinalDone` takes the new prop. Replace:
```tsx
    render(<FinalDone final={{ exportedTo: EXPORTED, nextCommand: NEXT }} changesSinceFinal={2} />);
```
with:
```tsx
    render(<FinalDone final={{ exportedTo: EXPORTED, nextCommand: NEXT }} changesSinceFinal={2} planVersionSinceFinal={null} />);
```
and replace:
```tsx
  it('says when nothing changed since the last final', () => {
    render(<FinalDone final={{ exportedTo: EXPORTED, nextCommand: NEXT }} changesSinceFinal={0} />);
    expect(screen.getByTestId('final-done').textContent).toContain('No changes since the last final.');
  });
```
with:
```tsx
  it('says when nothing changed since the last final', () => {
    render(<FinalDone final={{ exportedTo: EXPORTED, nextCommand: NEXT }} changesSinceFinal={0} planVersionSinceFinal={null} />);
    expect(screen.getByTestId('final-done').textContent).toContain('No changes since the last final.');
    expect(screen.queryByTestId('plan-version-since-final')).toBeNull();
  });

  it('says when a newer version of the plan came in since the last final', () => {
    render(<FinalDone final={{ exportedTo: EXPORTED, nextCommand: NEXT }} changesSinceFinal={0} planVersionSinceFinal={2} />);
    expect(screen.getByTestId('plan-version-since-final').textContent).toBe("The plan's v2 came in since the last final.");
  });
```

In `packages/web/src/pages/finalize/FinalizePage.test.tsx`, the page's data has the new field. Replace:
```tsx
    listening: null,
    changesSinceFinal: 0,
    ...over,
```
with:
```tsx
    listening: null,
    changesSinceFinal: 0,
    planVersionSinceFinal: null,
    ...over,
```

- [ ] **Step 3: Write the failing e2e test**

The plan starts as `PLAN_TEXT`, with Data ("Log reminders in a table.") and Channels ("Send by SMS."). First your draft moves on: you accept an option that changes Channels. Then v2 in the repo changes Channels differently, as one long line, and drops Data. Merged, Data's removal is clean, and Channels is one conflict (`git merge-file` on these texts gives exactly one). The Questions importer lists the question that came from Data in `removed`, and leaves Which channels? alone. On a phone, the repo's long line wraps inside its block.

`packages/web/e2e/plan-update.spec.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { api, asClaude, fixtureRepo, importProject, rawItem, type TestItem } from './claude';
import { noSideScroll } from './env';

const both = { id: 'both', label: 'SMS and email', change: { md: [{ find: 'Send by SMS.', replace: 'Send by SMS and email.' }] } };
const channels: TestItem = { key: 'channels', title: 'Which channels?', summary: 'SMS, email or both.', message: { text: 'SMS, email or both?', options: [both] } };
const log: TestItem = { key: 'log', title: 'How long to keep reminder rows?', summary: 'Retention for the reminder log.', message: { text: 'Keep them for 180 days?' } };
/** The repo's new Channels paragraph: one long line, as plan paragraphs often are. */
const PUSH =
  "Send by SMS and push. Push goes to the mobile app first, and a customer who has turned push off, or who hasn't opened the app in the last thirty days, gets the SMS instead, so every customer hears about a restock once and only once, whatever their settings and whichever device they use.";
/** The plan's v2 in the repo: Data is gone, and Channels says something else than your draft does. */
const V2 = `# Plan update\n\nRemind customers before an item runs out.\n\n## Channels\n\n${PUSH}\n`;

test("a passage both sides changed becomes a Plan changes thread, and a removed section's question is parked", async ({ page }) => {
  const p = await importProject('plan-update', 'Plan update', { questions: [channels, log] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  // Your draft moves on first: accepting the option changes Channels.
  await api(`${P}/threads/t-questions-channels/draft`, 'PUT', { optionId: 'both' });
  await api(`${P}/submit`, 'POST', { scope: 'thread', threadId: 't-questions-channels' });

  // Then the repo's plan changes Channels too, and drops Data. Claude brings it in, and the importers run again.
  fs.writeFileSync(path.join(fixtureRepo(), 'docs/specs/plan-update.md'), V2);
  const open = await asClaude('/open', { cwd: fixtureRepo(), plan: 'docs/specs/plan-update.md', update: true });
  expect(open).toMatchObject({ kind: 'updated', version: 2, merged: { clean: 1, conflicts: 1 } });
  for (const t of open.importTypes as { id: string }[]) {
    await asClaude('/items', {
      repo: p.repo,
      project: p.project,
      type: t.id,
      cwd: fixtureRepo(),
      // Questions says v2 took out the part How long to keep reminder rows? came from. Which channels? is untouched.
      ...(t.id === 'questions' ? { removed: ['log'] } : { noChanges: 'Nothing changed for this type.' }),
    });
  }
  const [conflict] = (await api(`${P}/types/plan-changes`)).items;

  // Plan changes shows up once there's a conflict, first in the navigation.
  await page.goto(p.url);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await expect(nav.getByTestId(/^nav-type-/).first()).toHaveAttribute('data-testid', 'nav-type-plan-changes');
  await nav.getByTestId('nav-type-plan-changes').click();
  await expect(page.getByRole('heading', { name: 'Plan changes', exact: true })).toBeVisible();
  const row = page.getByTestId('list-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Channels');
  await expect(row).toContainText("Your draft and the repo's v2 both changed this passage.");
  await expect(row).toContainText('with Claude');

  // Its body shows the three versions of the passage.
  await page.goto(`${p.url}/th/${conflict.threadId}`);
  await expect(page.getByText("Your draft and the repo's v2 both changed this passage. Claude is proposing a merged version.")).toBeVisible();
  const item = page.getByRole('region', { name: 'Item' });
  for (const label of ['Your draft', 'The repo (v2)', 'Before (v1)']) await expect(item.getByText(label, { exact: true })).toBeVisible();
  const blocks = item.locator('pre');
  await expect(blocks).toHaveCount(3);
  await expect(blocks.nth(0)).toContainText('Send by SMS and email.');
  await expect(blocks.nth(1)).toContainText('Send by SMS and push.');
  await expect(blocks.nth(2)).toContainText('Send by SMS.');
  // The repo's long line wraps inside its block, on a phone too.
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await noSideScroll(page)).toEqual([]);
  expect(await blocks.nth(1).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  // As Claude: the listening window gets the conflict, and offers three choices, each ready to accept.
  const wait = await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-plan-update', timeoutSeconds: 0 });
  expect(wait.kind).toBe('submission');
  expect(wait.groups.flatMap((g: { threads: string[] }) => g.threads)).toEqual([conflict.threadId]);
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: conflict.threadId,
    text: 'You added email and the repo added push. This keeps both.',
    options: [
      { id: 'merged', label: 'SMS, email and push', change: { md: [{ find: 'Send by SMS and email.', replace: 'Send by SMS, email and push.' }] } },
      { id: 'theirs', label: "Take the repo's version", change: { md: [{ find: 'Send by SMS and email.', replace: PUSH }] } },
      { id: 'keep', label: 'Keep my draft', change: { md: [] } },
    ],
    recommended: 'merged',
  });

  // You accept it, and the draft has the merged text.
  await page.getByRole('radio', { name: /SMS, email and push/ }).check();
  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByText('Applied and resolved.')).toBeVisible();
  await nav.getByRole('link', { name: 'Draft (v2)', exact: true }).click();
  await expect(page.getByTestId('document')).toContainText('Send by SMS, email and push.');
  await expect(page.getByTestId('document')).not.toContainText('Log reminders in a table.');

  // The question about the removed Data section is parked, kept, and says why.
  expect(rawItem(p, 'questions-log')).toMatchObject({ removedIn: 2 });
  await nav.getByTestId('nav-type-questions').click();
  const parked = page.getByTestId('list-row').filter({ hasText: 'How long to keep reminder rows?' });
  await expect(parked.getByRole('img', { name: 'Parked' })).toBeVisible();
  await expect(parked.getByTestId('removed-from-plan')).toHaveText('· removed from the plan in v2');
  await expect(page.getByTestId('removed-from-plan')).toHaveCount(1);

  // Finalize leaves it out, and says why. The settled conflict no longer blocks.
  await page.goto(`${p.url}/finalize`);
  const list = page.getByTestId('checklist-parked');
  await expect(list.getByRole('heading')).toHaveText('Parked: left out of the final');
  await expect(list).toContainText('How long to keep reminder rows?');
  await expect(list).toContainText('Removed from the plan in v2.');
  await expect(page.getByText('Nothing blocks Finalize.')).toBeVisible();
});
```

- [ ] **Step 4: Run them to see them fail**

Run:
```bash
pnpm vitest run packages/core/test/detail.test.ts packages/core/test/projects.test.ts packages/service/test/finalize.test.ts packages/web/src/pages/ListScreen.test.tsx packages/web/src/pages/visual/visual.test.tsx packages/web/src/pages/finalize
pnpm test:e2e plan-update
```
Expected: FAIL, 7 unit tests, and the e2e test.
- The new core test gets `[['q1', undefined], ['q2', undefined]]`: the rows don't carry `removedIn` yet.
- In `projects.test.ts`, the Finalize test's first expectation has no `planVersionSinceFinal`, and the new test gets `undefined` for it. The service's Finalize test doesn't find `planVersionSinceFinal: null` in the view.
- `ListScreen.test.tsx` can't find `removed-from-plan`. The new `OtherItems` test doesn't find the label in the row's text.
- The new `FinalDone` test can't find `plan-version-since-final`.
- The e2e test gets through the update and the three blocks, then fails at the phone check: the repo's long line doesn't wrap, so its block scrolls sideways inside itself (`scrollWidth <= clientWidth` is false). The page itself doesn't scroll sideways, since `.doc pre` already scrolls its own overflow.

- [ ] **Step 5: Rows carry removedIn, and the Finalize view the newer version**

In `packages/core/src/schemas/views.ts`, in `TypeItemRow`, replace:
```ts
  /** Timeline types: each item in data.itemIds that exists, for the phase's links. {} for other types. */
  itemRefs: Record<string, { title: string; threadId: string; typeTitle: string }>;
};
```
with:
```ts
  /** Timeline types: each item in data.itemIds that exists, for the phase's links. {} for other types. */
  itemRefs: Record<string, { title: string; threadId: string; typeTitle: string }>;
  /** The plan version whose update removed the item's part of the plan, or null while it's still in the plan. */
  removedIn: number | null;
};
```

In `packages/core/src/store/projects.ts`, in `loadTypeItems`, replace:
```ts
      itemRefs: itemRefsOf(i.data),
    };
```
with:
```ts
      itemRefs: itemRefsOf(i.data),
      removedIn: i.removedIn ?? null,
    };
```

The web tests build rows by hand, so give them the new field. In `packages/web/src/pages/visual/testkit.tsx`, replace:
```tsx
    itemRefs: {},
    ...over,
```
with:
```tsx
    itemRefs: {},
    removedIn: null,
    ...over,
```
and in `packages/web/src/pages/visual/TimelineStrip.test.tsx`, replace:
```tsx
    itemRefs: {},
  };
```
with:
```tsx
    itemRefs: {},
    removedIn: null,
  };
```

In `packages/core/src/schemas/views.ts`, in `ProjectHome`, replace:
```ts
  /**
   * For the header's Finalize spec button. `state` is the finalize request's, or null when none is under way.
   * `changesSinceFinal` counts the changes applied since the last Accept (0 with no final).
   */
  finalize: { canStart: boolean; blockingCount: number; state: FinalizeState | null; changesSinceFinal: number };
```
with:
```ts
  /**
   * For the header's Finalize spec button. `state` is the finalize request's, or null when none is under way.
   * `changesSinceFinal` counts the changes applied since the last Accept (0 with no final). `planVersionSinceFinal` is
   * the newest plan version that came in after the last Accept and changed the draft, or null.
   */
  finalize: { canStart: boolean; blockingCount: number; state: FinalizeState | null; changesSinceFinal: number; planVersionSinceFinal: number | null };
```
and at the end of `FinalizeView`, replace:
```ts
  listening: ListeningState;
  changesSinceFinal: number;
};
```
with:
```ts
  listening: ListeningState;
  changesSinceFinal: number;
  /** The newest plan version that came in after the last final and changed the draft, or null. */
  planVersionSinceFinal: number | null;
};
```

In `packages/core/src/store/projects.ts`, replace:
```ts
import { openOptions } from './threads';
import { currentVersion, projectVersions } from './versions';
```
with:
```ts
import { openOptions } from './threads';
import { changedDraft } from './update';
import { currentVersion, projectVersions } from './versions';
```
and in `loadProjectHome`, replace:
```ts
  const history = await readHistory(ref.dir);
  const checklist = checklistFrom({ items, threads, history, types });
  const finalize = {
    canStart: checklist.canStart,
    blockingCount: checklist.blocking.length,
    state: (await readFinalize(ref.dir))?.state ?? null,
    changesSinceFinal: changesSinceFinal(history, project.docs.exportedTo?.at),
  };
```
with:
```ts
  const history = await readHistory(ref.dir);
  const checklist = checklistFrom({ items, threads, history, types });
  const finalAt = project.docs.exportedTo?.at;
  const finalize = {
    canStart: checklist.canStart,
    blockingCount: checklist.blocking.length,
    state: (await readFinalize(ref.dir))?.state ?? null,
    changesSinceFinal: changesSinceFinal(history, finalAt),
    // A version that came in after the last final and changed the draft makes that final out of date too.
    planVersionSinceFinal: finalAt ? (projectVersions(project).filter((v) => v.at > finalAt && changedDraft(v)).at(-1)?.n ?? null) : null,
  };
```

In `packages/service/src/routes/finalize.ts`, the Finalize page's view passes it on. Replace:
```ts
      changesSinceFinal: home.finalize.changesSinceFinal,
    };
```
with:
```ts
      changesSinceFinal: home.finalize.changesSinceFinal,
      planVersionSinceFinal: home.finalize.planVersionSinceFinal,
    };
```

- [ ] **Step 6: The label in lists, the newer version on the Finalize page, and wrapped passages**

In `packages/web/src/pages/ListScreen.tsx`, add this component before `function ListRow({`:
```tsx
/** An item whose part of the plan an update removed. It's parked (or flagged, if Claude had it then), never deleted. */
function RemovedFromPlan({ version }: { version: number }) {
  return (
    <span className="min-w-0 text-[12px] text-ink-3" data-testid="removed-from-plan">
      {' · removed from the plan in v'}
      {version}
    </span>
  );
}
```
In the compact row for resolved and parked items, replace:
```tsx
        <span className="font-medium">{row.title}</span>
        {row.decision && <span className="min-w-0 truncate text-ink-2">→ {row.decision}</span>}
```
with:
```tsx
        <span className="font-medium">{row.title}</span>
        {row.removedIn !== null && <RemovedFromPlan version={row.removedIn} />}
        {row.decision && <span className="min-w-0 truncate text-ink-2">→ {row.decision}</span>}
```
and in the full row's summary line, replace:
```tsx
        {row.flagged ? <span className="text-amber"> · may need another look</span> : null}
      </p>
```
with:
```tsx
        {row.flagged ? <span className="text-amber"> · may need another look</span> : null}
        {row.removedIn !== null && <RemovedFromPlan version={row.removedIn} />}
      </p>
```

In `packages/web/src/pages/visual/OtherItems.tsx`, replace:
```tsx
            meta={r.summary}
```
with:
```tsx
            meta={
              <>
                {r.summary}
                {r.removedIn !== null && <span data-testid="removed-from-plan"> · removed from the plan in v{r.removedIn}</span>}
              </>
            }
```
`Row`'s meta line is already ink-3.

In `packages/web/src/pages/finalize/ProposalView.tsx`, `FinalDone` says when a newer version of the plan came in. Replace:
```tsx
export function FinalDone({ final, changesSinceFinal: n }: { final: Final; changesSinceFinal: number }) {
```
with:
```tsx
export function FinalDone({ final, changesSinceFinal: n, planVersionSinceFinal }: { final: Final; changesSinceFinal: number; planVersionSinceFinal: number | null }) {
```
and replace:
```tsx
      <p className="mt-0.5 text-[12px] text-ink-3">{n === 0 ? 'No changes' : n === 1 ? '1 change' : `${n} changes`} since the last final.</p>
```
with:
```tsx
      <p className="mt-0.5 text-[12px] text-ink-3">{n === 0 ? 'No changes' : n === 1 ? '1 change' : `${n} changes`} since the last final.</p>
      {planVersionSinceFinal !== null && (
        <p className="mt-0.5 text-[12px] text-ink-3" data-testid="plan-version-since-final">
          The plan's v{planVersionSinceFinal} came in since the last final.
        </p>
      )}
```

In `packages/web/src/pages/finalize/FinalizePage.tsx`, replace:
```tsx
      {v.final && !proposal && <FinalDone final={v.final} changesSinceFinal={v.changesSinceFinal} />}
```
with:
```tsx
      {v.final && !proposal && <FinalDone final={v.final} changesSinceFinal={v.changesSinceFinal} planVersionSinceFinal={v.planVersionSinceFinal} />}
```

In `packages/web/src/styles.css`, a passage in an `md` block wraps instead of scrolling sideways: plan paragraphs are often one line of 300 characters or more. Replace:
```css
.doc pre { font-family: var(--font-mono); font-size: 12.5px; border-left: 2px solid var(--separator); padding: 4px 0 4px 12px; overflow-x: auto; margin: 0 0 12px; }
```
with:
```css
.doc pre { font-family: var(--font-mono); font-size: 12.5px; border-left: 2px solid var(--separator); padding: 4px 0 4px 12px; overflow-x: auto; margin: 0 0 12px; }
.doc pre:has(code.language-md) { white-space: pre-wrap; overflow-wrap: anywhere; }
```
`ItemCard` renders the body with react-markdown inside `.doc`, which gives a `` ```md `` block `<pre><code class="language-md">`.

- [ ] **Step 7: Run the focused tests**

Run:
```bash
pnpm vitest run packages/core/test/detail.test.ts packages/core/test/projects.test.ts packages/service/test/finalize.test.ts packages/web/src/pages/ListScreen.test.tsx packages/web/src/pages/visual packages/web/src/pages/finalize
pnpm typecheck
```
Expected: PASS. `detail.test.ts` has 8 tests, `projects.test.ts` 27, the service's `finalize.test.ts` 13, `ListScreen.test.tsx` 1, `visual.test.tsx` 11, `ProposalView.test.tsx` 12 and `FinalizePage.test.tsx` 11.

- [ ] **Step 8: Run everything**

Run:
```bash
pnpm test
pnpm test:e2e plan-update
pnpm test:e2e
```
Expected: PASS.
- **If `merged` isn't `{ clean: 1, conflicts: 1 }`:** two unchanged lines (the Channels heading and a blank line) sit between Data's removal and the Channels conflict, so the removal merges cleanly. Check Task 2's `clean` count and its handling of a deleted block.
- **If the conflict row's title isn't "Channels":** Task 4 titles a conflict with the nearest heading above it in the merged text (Task 2's `heading`).
- **If Plan changes isn't first in the navigation:** check Task 3's `order: 0`, and that `loadProjectHome` lists the built-in type only with items.
- **If `/reply` is refused with "isn't waiting for Claude":** the conflict thread must still be `with_claude` after `/wait` hands it out (Task 4 writes it so; `/wait` only picks the submission up).
- **If the question isn't parked:** the batch for Questions must be `removed: ['log']`. Task 5 parks only the items a batch lists in `removed`, and leaves everything alone for `noChanges`.
- **If the phone check finds the repo's line scrolling inside its block:** check the `.doc pre:has(code.language-md)` rule, and that the body's block is fenced `` ```md ``.
- **If Finalize still has something blocking:** after the accept, the conflict thread is resolved, and nothing else in this project blocks.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/schemas/views.ts packages/core/src/store/projects.ts packages/core/test/detail.test.ts packages/core/test/projects.test.ts packages/service/src/routes/finalize.ts packages/service/test/finalize.test.ts packages/web/src/styles.css packages/web/src/pages/ListScreen.tsx packages/web/src/pages/ListScreen.test.tsx packages/web/src/pages/visual/OtherItems.tsx packages/web/src/pages/visual/testkit.tsx packages/web/src/pages/visual/TimelineStrip.test.tsx packages/web/src/pages/visual/visual.test.tsx packages/web/src/pages/finalize/ProposalView.tsx packages/web/src/pages/finalize/ProposalView.test.tsx packages/web/src/pages/finalize/FinalizePage.tsx packages/web/src/pages/finalize/FinalizePage.test.tsx packages/web/e2e/plan-update.spec.ts
git commit -m "feat(web): Plan changes threads, removed items and a newer plan version show in the app" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The real-Claude smoke test updates the plan, plus docs and the full check

Everything so far is tested without Claude. This task runs the real thing once more, with a second round.
- **The run:**
  1. After Finalize, the "user" changes the plan in the scratch repo:
     - the first line of the plan that round 1 changed in the draft gets new text in the repo too, so the two sides conflict there, every time round 1 changed a line;
     - one section the draft never changed gets new text;
     - one small section goes.
  2. The runner stops Claude and runs `claude -p` again, the way you'd run `/dev-plumbing` again.
  3. Claude asks "Update to v2?", and the prompt has already said yes, merging. It updates, re-runs the importers, and answers the Plan changes threads.
  4. The "user" checks:
     - the version trail;
     - the merge, which must have a conflict;
     - that the project is Active again, and the Finalize page says v2 came in (the update changed the draft);
     - the re-import, by key;
     - the parked items, and that no item answered in round 1 was removed while its section is still in the plan;
     - the Plan changes threads.

     Then it accepts Claude's merged version on each.
- **The rest:** the README and `docs/how-it-works.md` explain updating and the Versions list, and the full check runs.

The split is Plan 4's:
- **You** write the scripts and the docs, and run the full check. You don't run `pnpm smoke`.
- **The controller** runs it.
- **You** then record what it printed in `smoke/RESULTS.md`, and commit.

**Files:**
- Modify:
  - `scripts/smoke-user.mjs`
  - `scripts/smoke-claude.sh`
  - `smoke/RESULTS.md` (a "Plan 5: Bring changes in" section, after the controller's run)
  - `README.md`
  - `docs/how-it-works.md`
- Test: `node --check` and `bash -n` on the scripts, `pnpm check`, and the controller's smoke run.

**Interfaces:**
- Consumes everything above. In particular:
  - Task 6:
    - `/api/claude/open`'s `plan-changed` and `updated`;
    - `GET /api/projects/:repo/:id/versions` (`{ versions: VersionSummary[] }`, newest first, with `current`);
    - `GET …/changes`'s `segments`: the diff of `original.md` against `draft.md` (Plans 1–4's Changes view), whose removed parts are the plan's lines round 1 changed;
    - `GET …/versions/compare?from=1&to=2&which=original` (`{ segments }`).
  - Task 7:
    - `dp_open`'s `update` input (and `fresh`, which this run never sends);
    - SKILL.md's **plan-changed** branch, which uses an answer the user already gave (here, in the prompt) without asking;
    - the importer's Re-import section, which lists the keys whose part of the plan went in `removed`;
    - the **updated** branch, which runs the importers again;
    - the thread agent's handling of a thread with no message from the person.
  - Tasks 1, 4 and 5, through `GET /api/projects/:repo/:id`:
    - `project.versions` (`{ n, merge?: { clean, conflicts } }`), `project.reimporting` and `project.importPending`;
    - `status` going back to `active`, since the update changed the draft (Task 4), and `GET …/finalize`'s `planVersionSinceFinal` (Task 9);
    - `docs/versions/v1/original.md` and `draft.md` in the project folder.
  - Task 5's flag reason "Changed in the plan's v2.", read from `GET …/threads/:id` (`item.flags`).
  - Task 9's `TypeItemRow.removedIn`, read from `GET …/types/:type` (with `status`, `flagged` and `createdBy`), and an item's `mdAnchor`, read from `GET …/threads/:id`.
  - Task 3: Claude's reply on a Plan changes thread has three options, each with a `change`; the "user" accepts the recommended one, the merged version.
  - Plans 1–4:
    - `GET …/docs/original` and `…/docs/draft`;
    - `PUT …/threads/:id/draft` with `{ optionId }`, then `POST …/submit` with `{ scope: 'thread', threadId }`. A plain accept is applied and resolved straight away, and its `resolved` is 1.

  The smoke needs the `claude` CLI on PATH and logged in, as Plans 2–4's did.
- Produces:
  - the runner's second round, with its transcript in `$work/transcript-2.jsonl`, and a report of both rounds;
  - `smoke/RESULTS.md`'s Plan 5 section, with yes or no for each check and the evidence.

- [ ] **Step 1: The "user" changes the plan, and checks the update**

In `scripts/smoke-user.mjs`, replace the comment at the top and the first two constants:
```js
// Plays the user for scripts/smoke-claude.sh. It waits for the import, checks the drawings the importers wrote,
// answers one question the way the browser would, and waits for Claude's reply. Then it finalizes: it applies pending
// small edits, accepts Claude's proposals, parks whatever still blocks Finalize, starts it, waits for the finalizer's
// final, accepts it into the scratch repo and checks the copy. Exits non-zero if anything doesn't happen in time, if a
// visual type has items without drawings, or if the final didn't land.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.DEV_PLUMBING_HOME;
const long = process.env.DP_SMOKE_LONG === '1';
```
with:
```js
// Plays the user for scripts/smoke-claude.sh. It waits for the import, checks the drawings the importers wrote,
// answers one question the way the browser would, and waits for Claude's reply. Then it finalizes: it applies pending
// small edits, accepts Claude's proposals, parks whatever still blocks Finalize, starts it, waits for the finalizer's
// final, accepts it into the scratch repo and checks the copy. Then the plan changes in the repo: it rewrites a line
// round 1 changed in the draft, and a section the draft never changed, removes a small one, and asks the runner for a
// second /dev-plumbing. It checks the update to v2, the merge, the re-import and the Plan changes threads, and accepts
// Claude's merged version on each. Exits non-zero if anything doesn't happen in time, if a visual type has items
// without drawings, or if the final or the update didn't land.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.DEV_PLUMBING_HOME;
const long = process.env.DP_SMOKE_LONG === '1';
// The runner watches for this file, then stops the Claude window and runs /dev-plumbing again.
const round2 = process.env.DP_SMOKE_ROUND2;
if (!round2) throw new Error('DP_SMOKE_ROUND2 is not set. Run this through scripts/smoke-claude.sh.');
```

Replace the last two lines:
```js
if (missing.length) throw new Error(`Finalize didn't land:\n- ${missing.join('\n- ')}`);
log('Smoke test passed.');
```
with:
```js
if (missing.length) throw new Error(`Finalize didn't land:\n- ${missing.join('\n- ')}`);

// Bring changes in. The plan changes in the repo, the way plans do after an import:
// 1. a line round 1 changed in the draft gets new text in the repo too, so both sides changed it: a conflict;
// 2. one section the draft never changed gets new text, which should merge cleanly;
// 3. one small section the draft never changed is removed, and its items should be parked.
// The runner then stops this Claude window and runs /dev-plumbing again, as you would, saying yes to "Update to v2?".
const NEW_TEXT = {
  Approach:
    "A daily job at 9:00 in the customer's time zone finds subscriptions due in the next few days and sends a reminder. We haven't decided whether reminders go by SMS, email or both, or how many days before the due date to send them.",
  Data: '- A new `RestockReminder` table logs each reminder: the subscription, the channel, when it was sent, whether it was delivered, and whether the customer reordered.\n- `Subscription` gains `remindDaysBefore` (default 3) and `remindersPaused`.',
  Screens: 'A Restock settings card on the account page (`apps/web/app/account/page.tsx`) turns reminders on or off, sets how many days before, and shows when the next reminder goes out.',
  Flow: 'The customer gets a reminder, taps Reorder, sees the order summary and confirms. A customer who paused reminders, or reordered in the last day, gets nothing.',
  Phases: 'Ship the table and the daily job first, then the settings card, then one-tap reorder behind a feature flag.',
  'Open points': '- Should customers be able to snooze a reminder for a week?\n- What happens if the daily job runs twice on the same day?',
};
/** A plan's `## ` sections, each from its heading line to the next heading. The text before the first one has heading ''. */
const sectionsOf = (text) => text.split(/^(?=## )/m).map((body) => ({ heading: /^## (.+)$/m.exec(body)?.[1] ?? '', body }));
/** A section with new text under its heading, keeping the blank line before the next heading. */
const rewritten = (s) => `## ${s.heading}\n\n${NEW_TEXT[s.heading]}\n${s.body.endsWith('\n\n') ? '\n' : ''}`;
/** Every item the app lists, with its type: id, title, thread, status, how it was made, flagged and removedIn. */
async function itemRows() {
  const h = (await call(P)).body;
  const rows = [];
  for (const t of h.types) {
    const r = await call(`${P}/types/${t.id}`);
    if (r.ok) rows.push(...r.body.items.map((i) => ({ ...i, type: t.id })));
  }
  return rows;
}

const planFile = path.join(clone, home.project.source.path);
const v1Plan = fs.readFileSync(planFile, 'utf8');
const v1Draft = (await call(`${P}/docs/draft`)).body.text;
// Each section with where it starts and ends in the plan.
let end = 0;
const planSections = sectionsOf(v1Plan).map((s) => ({ ...s, start: end, end: (end += s.body.length) }));
// The lines of the plan round 1 changed in the draft: the removed parts of the Changes view's diff (plan → draft),
// each with where it starts in the plan. The first one under a ## heading is the one the repo rewrites too.
let at = 0;
const changedLines = [];
for (const s of (await call(`${P}/changes`)).body.segments) {
  if (s.kind === 'added') continue;
  if (s.kind === 'removed' && s.text.trim()) changedLines.push({ at, text: s.text });
  at += s.text.length;
}
const conflict = changedLines
  .map((c) => ({ ...c, section: planSections.find((s) => c.at >= s.start && c.at < s.end) }))
  .find((c) => c.section?.heading);
const conflictSection = conflict?.section.heading ?? null;
/** The lines as the repo's v2 has them: each one says something new. */
const theirs = (text) => text.replace(/^(.*\S.*)$/gm, (line) => `${line.replace(/[.:]?\s*$/, '')}, as the repo's v2 now has it.`);
// A section the draft changed no longer appears in it word for word.
const touched = planSections.filter((s) => !v1Draft.includes(s.body)).map((s) => s.heading);
const untouched = (h) => planSections.some((s) => s.heading === h) && !touched.includes(h);
const removedSection = ['Open points', 'Flow', 'Screens'].find(untouched) ?? null;
const cleanSection = ['Phases', 'Screens', 'Flow', 'Data', 'Approach'].find((h) => untouched(h) && h !== removedSection) ?? null;
const v2Plan = planSections
  .map((s) => {
    if (s.heading === removedSection) return '';
    if (s.heading === cleanSection) return rewritten(s);
    if (!conflict || s !== conflict.section) return s.body;
    // Only the part of the changed lines inside this section.
    const from = conflict.at - s.start;
    const lines = conflict.text.slice(0, s.end - conflict.at);
    return s.body.slice(0, from) + theirs(lines) + s.body.slice(from + lines.length);
  })
  .join('');
const rowsV1 = await itemRows();
fs.writeFileSync(planFile, v2Plan);
const edits = [
  conflictSection ? `rewrote "${conflict.text.trim().split('\n')[0].slice(0, 60)}" in ${conflictSection}, which the draft changed too` : 'found no line round 1 changed in the draft',
  cleanSection ? `rewrote ${cleanSection}, which the draft never changed` : 'found no section the draft never changed',
  removedSection ? `removed ${removedSection}` : 'found no small section to remove',
];
log(`Changed the plan in the repo: ${edits.join('; ')}.`);
fs.writeFileSync(round2, new Date().toISOString());
log('Asked the runner to stop this Claude window and run /dev-plumbing again.');

const updateAt = Date.now();
await until('the update to v2 and its re-import', async () => {
  const r = await call(P);
  return r.ok && r.body.project.versions.length >= 2 && r.body.project.status !== 'importing';
}, 25);
log(`Updated to v2 and re-imported in ${Math.round((Date.now() - updateAt) / 1000)} s.`);
await until('the Plan changes threads to come back from Claude', async () => {
  const r = await call(P);
  return r.ok && r.body.summary.counts.withClaude === 0;
}, 15);

const wrong = [];
const v2Home = (await call(P)).body;
const project = v2Home.project;
const v2 = project.versions.find((v) => v.n === 2);
log(`Versions: ${project.versions.map((v) => `v${v.n}${v.merge ? ` (merge: ${v.merge.clean} clean, ${v.merge.conflicts} in conflict)` : ''}`).join(', ')}`);
log(`  Status: ${project.status}, import pending: ${project.importPending.join(', ') || 'none'}`);
for (const t of v2Home.types) log(`  ${t.title}: ${t.importFailed ? "didn't finish" : t.noChanges ? 'no changes' : `${t.itemCount} items`}`);
if (!v2) wrong.push('project.versions has no v2.');
// The update changed the draft, so the finalized project is active again, and the Finalize page says v2 came in.
if (project.status !== 'active') wrong.push(`The project is ${project.status} after the re-import. The update changed the draft, so it should be active.`);
const sinceFinal = (await call(`${P}/finalize`)).body.planVersionSinceFinal;
log(`  Finalize page: ${sinceFinal === null ? 'no newer version noted' : `"The plan's v${sinceFinal} came in since the last final."`}`);
if (sinceFinal !== 2) wrong.push(`The Finalize page doesn't say the plan's v2 came in since the last final (planVersionSinceFinal is ${sinceFinal}).`);
// The update has to have had a conflict to settle, or the most model-dependent part never ran.
if (!conflictSection) wrong.push("Round 1 didn't change any line of the plan in the draft, so v2 had nothing to conflict with.");
else if (v2 && !v2.merge?.conflicts) wrong.push(`v2 rewrote a line in ${conflictSection} that the draft changed too, but the merge found no conflict.`);
if (project.reimporting) wrong.push('project.reimporting is still set.');
if (project.importPending.length) wrong.push(`Still waiting for importers: ${project.importPending.join(', ')}.`);
const versionList = (await call(`${P}/versions`)).body.versions;
log(`  Versions list: ${versionList.map((v) => `v${v.n}${v.current ? ' (current)' : ''}`).join(', ')}`);
if (versionList[0]?.n !== 2 || !versionList[0].current) wrong.push("The Versions list doesn't start with v2 as the current version.");
const compared = (await call(`${P}/versions/compare?${new URLSearchParams({ from: '1', to: '2', which: 'original' })}`)).body.segments ?? [];
log(`  v1 to v2: ${compared.filter((s) => s.kind === 'added').length} added and ${compared.filter((s) => s.kind === 'removed').length} removed passages`);

// v1 is kept as it was, and the repo's text is the new original.
const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
const v1Dir = path.join(settings.projectsFolder, 'acme-app', project.id, 'docs', 'versions', 'v1');
const readOrNull = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
const same = (saved, was) => (saved === null ? 'missing' : saved === was ? 'as it was' : 'different');
const savedPlan = readOrNull(path.join(v1Dir, 'original.md'));
const savedDraft = readOrNull(path.join(v1Dir, 'draft.md'));
log(`  docs/versions/v1: plan ${same(savedPlan, v1Plan)}, draft ${same(savedDraft, v1Draft)}`);
if (savedPlan !== v1Plan || savedDraft !== v1Draft) wrong.push("docs/versions/v1 doesn't hold the plan and the draft from before the update.");
if ((await call(`${P}/docs/original`)).body.text !== v2Plan) wrong.push("original.md isn't the repo's new plan.");

// The merge: the clean edit and the removal are in the draft, your text stays where both changed, and no markers.
const v2Draft = (await call(`${P}/docs/draft`)).body.text;
const yours = conflictSection ? sectionsOf(v1Draft).find((s) => s.heading === conflictSection)?.body : undefined;
const markers = /^(<{7,}|\|{7,}|>{7,})( |$)|^={7,}$/m.test(v2Draft);
log(
  `  Draft: ${cleanSection ? `${cleanSection} edit ${v2Draft.includes(NEW_TEXT[cleanSection]) ? 'merged' : 'missing'}` : 'no clean edit'}, ${removedSection ? `${removedSection} ${v2Draft.includes(`## ${removedSection}\n`) ? 'still there' : 'gone'}` : 'nothing removed'}, ${yours ? `your ${conflictSection} ${v2Draft.includes(yours) ? 'kept' : 'not kept word for word'}` : 'no conflict section'}, conflict markers: ${markers ? 'yes' : 'none'}`,
);
if (cleanSection && !v2Draft.includes(NEW_TEXT[cleanSection])) wrong.push(`The draft doesn't have the repo's new ${cleanSection} text.`);
if (removedSection && v2Draft.includes(`## ${removedSection}\n`)) wrong.push(`The draft still has the ${removedSection} section the repo removed.`);
if (markers) wrong.push('The draft has conflict markers.');

// The re-import: imported items keep their ids, changed ones are flagged, removed ones are parked (or flagged when
// Claude had them), and nothing is deleted.
const rowsV2 = await itemRows();
const v2ById = new Map(rowsV2.map((r) => [r.id, r]));
const imported = rowsV1.filter((r) => r.createdBy === 'import');
const kept = imported.filter((r) => v2ById.has(r.id) && v2ById.get(r.id).removedIn === null);
const lost = imported.filter((r) => !v2ById.has(r.id));
const removedItems = rowsV2.filter((r) => r.removedIn !== null);
const newItems = rowsV2.filter((r) => r.type !== 'plan-changes' && !rowsV1.some((x) => x.id === r.id));
let changedCount = 0;
for (const r of kept.filter((x) => v2ById.get(x.id).flagged)) {
  const d = (await call(`${P}/threads/${r.threadId}`)).body;
  if (d.item.flags?.some((f) => f.reason === "Changed in the plan's v2.")) changedCount++;
}
log(`Re-import: ${imported.length} imported items before. ${kept.length} kept their ids (${changedCount} flagged as changed in v2), ${newItems.length} new, ${removedItems.length} removed from the plan, ${lost.length} gone.`);
for (const r of removedItems) log(`  Removed from the plan: "${r.title}" (${r.type}), ${r.status}${r.flagged ? ', flagged' : ''}, removedIn ${r.removedIn}`);
if (removedSection && !removedItems.length) log(`  No item came only from ${removedSection}, so nothing was parked.`);
if (imported.length && !kept.length) wrong.push('No imported item kept its id: the importers made everything again.');
if (lost.length) wrong.push(`Items deleted by the re-import: ${lost.map((r) => r.title).join(', ')}.`);
const loose = removedItems.filter((r) => r.status !== 'parked' && !r.flagged);
if (loose.length) wrong.push(`Removed from the plan, but neither parked nor flagged: ${loose.map((r) => r.title).join(', ')}.`);
// An item answered in round 1 is never taken out while its section is still in the plan.
const v2Headings = new Set(sectionsOf(v2Plan).map((s) => s.heading).filter(Boolean));
const answered = rowsV1.filter((r) => r.createdBy === 'import' && r.status === 'resolved');
const takenOut = [];
for (const r of answered.filter((x) => v2ById.get(x.id)?.removedIn != null)) {
  const heading = (await call(`${P}/threads/${r.threadId}`)).body.item.mdAnchor?.heading;
  if (heading && v2Headings.has(heading)) takenOut.push(`"${r.title}" (§ ${heading})`);
}
log(`  Answered in round 1: ${answered.length} items, ${takenOut.length} removed from the plan while their section is still there`);
if (takenOut.length) wrong.push(`Answered items removed from the plan although their section is still in v2: ${takenOut.join(', ')}.`);

// Plan changes: one thread per conflict. Claude proposed a merged version on each, and you accept it.
const conflicts = rowsV2.filter((r) => r.type === 'plan-changes');
log(`Plan changes: ${conflicts.length} thread${conflicts.length === 1 ? '' : 's'}`);
if (v2?.merge && conflicts.length !== v2.merge.conflicts) wrong.push(`v2 counted ${v2.merge.conflicts} conflicts, but there are ${conflicts.length} Plan changes threads.`);
for (const r of conflicts) {
  const d = (await call(`${P}/threads/${r.threadId}`)).body;
  const pick = d.open?.options.find((o) => o.id === d.open.recommended && o.change) ?? d.open?.options.find((o) => o.change);
  if (!pick) {
    log(`  "${r.title}": no merged version from Claude (${d.thread.status})`);
    wrong.push(`Claude didn't propose a merged version on "${r.title}".`);
    continue;
  }
  await call(`${P}/threads/${r.threadId}/draft`, 'PUT', { optionId: pick.id });
  const accepted2 = await call(`${P}/submit`, 'POST', { scope: 'thread', threadId: r.threadId });
  log(`  "${r.title}": accepted Claude's "${pick.label}": ${accepted2.ok ? accepted2.body.message : accepted2.body.error}`);
  if (!accepted2.ok || accepted2.body.resolved !== 1) wrong.push(`Claude's merged version on "${r.title}" wasn't applied.`);
}
if (wrong.length) throw new Error(`The update didn't land:\n- ${wrong.join('\n- ')}`);
log('Smoke test passed.');
```

How it picks what to change:
- **The conflict** goes to the first lines of the plan that round 1 changed in the draft: the first removed part, under a `## ` heading, of the Changes view's diff of the plan against the draft. v2 rewrites exactly those lines (each gains ", as the repo's v2 now has it."), so both sides changed them, and the merge can't help but conflict there. Round 1 changes the draft through the proposals and small edits it accepts. If it only added lines, or changed nothing, there's no such line, and the run fails at the end with "Round 1 didn't change any line of the plan in the draft, so v2 had nothing to conflict with."
- **The clean edit** goes to the first section the draft never changed (the draft still has it word for word), from Phases, Screens, Flow, Data and Approach. Its new text replaces the section's paragraph.
- **The removal** is the first section the draft never changed, from Open points, Flow and Screens.

Checked with `mergePlan` on `scripts/smoke-plan.md`: an accepted change to the Approach line, to a Data bullet, or to Approach and Screens together, each gives exactly one conflict, where the change was. Phases merges cleanly, and Open points goes. A change that only adds lines gives no conflict.

- [ ] **Step 2: The runner's second round**

In `scripts/smoke-claude.sh`, replace the comment at the top:
```bash
# The real thing. Claude Code runs /dev-plumbing on a small plan, in a scratch repo with a Prisma schema and a
# Tailwind v4 kit. scripts/smoke-user.mjs checks the drawings the importers wrote, answers one thread the way you
# would in the browser, and a thread subagent replies. Then it finalizes: it applies small edits, accepts Claude's
# proposals, parks whatever still blocks Finalize, starts it, waits for the finalizer's final, accepts it into the
# scratch repo and checks the copy. It uses a temporary dev-plumbing home and leaves your real ~/.dev-plumbing alone.
# It makes real model calls.
#   scripts/smoke-claude.sh                   about 20 minutes (the finalizer runs on opus)
#   DP_SMOKE_LONG=1 scripts/smoke-claude.sh   waits 35 minutes before answering, to check the long wait
```
with:
```bash
# The real thing. Claude Code runs /dev-plumbing on a small plan, in a scratch repo with a Prisma schema and a
# Tailwind v4 kit. scripts/smoke-user.mjs checks the drawings the importers wrote, answers one thread the way you
# would in the browser, and a thread subagent replies. Then it finalizes: it applies small edits, accepts Claude's
# proposals, parks whatever still blocks Finalize, starts it, waits for the finalizer's final, accepts it into the
# scratch repo and checks the copy. Then it changes the plan in the scratch repo, and this script stops Claude and
# runs /dev-plumbing again: Claude asks to update to v2, merges, re-imports, and answers the Plan changes threads.
# It uses a temporary dev-plumbing home and leaves your real ~/.dev-plumbing alone. It makes real model calls.
#   scripts/smoke-claude.sh                   about 30 minutes (the finalizer runs on opus)
#   DP_SMOKE_LONG=1 scripts/smoke-claude.sh   waits 35 minutes before answering, to check the long wait
```

Then replace the last 29 lines, from `echo "Working in $work"` to `exit "$status"`, with:
```bash
echo "Working in $work"
# The user script writes this file once it has changed the plan in the scratch repo.
round2="$work/round2"
DP_SMOKE_ROUND2="$round2" node "$root/scripts/smoke-user.mjs" &
user=$!
# exec, so $! is Claude itself and not a subshell that would leave it running.
( cd "$repo" && exec claude -p "Use the dev-plumbing skill to plumb docs/specs/restock-reminders.md." \
    --plugin-dir "$root/plugin" --permission-mode bypassPermissions \
    --output-format stream-json --verbose > "$work/transcript.jsonl" 2> "$work/claude.err" ) &
claude=$!
# Round 2: once the plan has changed, stop this window and run /dev-plumbing again, as you would. Claude asks whether
# to update to v2. The service keeps running in between.
while [ ! -e "$round2" ] && kill -0 "$user" 2>/dev/null; do sleep 2; done
if [ -e "$round2" ]; then
  stop_claude
  ( cd "$repo" && exec claude -p "Use the dev-plumbing skill to plumb docs/specs/restock-reminders.md. If it asks whether to update to v2, the answer is yes: merge it into my draft." \
      --plugin-dir "$root/plugin" --permission-mode bypassPermissions \
      --output-format stream-json --verbose > "$work/transcript-2.jsonl" 2> "$work/claude-2.err" ) &
  claude=$!
fi
status=0
wait "$user" || status=$?
stop_claude

# What one claude -p round did, from its transcript.
report() {
  local t="$1"
  echo "Transcript: $t"
  echo "dp tool calls made inside subagents (parent_tool_use_id set):"
  grep -h '"parent_tool_use_id":"' "$t" | grep -o '"name":"mcp__plugin_dev-plumbing_dp__[^"]*"' | sort | uniq -c || true
  echo "dp tool calls made by the main window:"
  grep -h '"parent_tool_use_id":null' "$t" | grep -o '"name":"mcp__plugin_dev-plumbing_dp__[^"]*"' | sort | uniq -c || true
  echo "Importers started by the main window, in order (Flows and Phases should come last):"
  grep -h '"parent_tool_use_id":null' "$t" | grep -o 'Import plumbing type `[a-z0-9-]*`' | awk '!seen[$0]++' | nl -w2 -s'. ' || true
  echo "Transcript lines with a refused write (\"Nothing was saved\"):"
  grep -c 'Nothing was saved' "$t" || true
}
echo "== Round 1: import, one thread, Finalize"
report "$work/transcript.jsonl"
echo "Finalizer subagents started by the main window:"
grep -h '"parent_tool_use_id":null' "$work/transcript.jsonl" | grep -o '"name":"Agent","input":{[^}]*"subagent_type":"dev-plumbing:finalizer"' | wc -l | tr -d ' ' || true
echo "dp_finalize refusals (\"Fix these and call dp_finalize again\"):"
grep -c 'Fix these and call dp_finalize again' "$work/transcript.jsonl" || true
echo "Tokens in the finalizer's last dp_finalize call, by kind:"
grep -h '"name":"mcp__plugin_dev-plumbing_dp__dp_finalize"' "$work/transcript.jsonl" | tail -1 | grep -o '{{[a-z]*:' | sort | uniq -c || true
echo "Mermaid the finalizer wrote by hand in its dp_finalize calls (should be 0):"
grep -h '"name":"mcp__plugin_dev-plumbing_dp__dp_finalize"' "$work/transcript.jsonl" | grep -c '```mermaid' || true
if [ -e "$work/transcript-2.jsonl" ]; then
  t2="$work/transcript-2.jsonl"
  echo "== Round 2: the plan changed, and /dev-plumbing ran again"
  report "$t2"
  # dp_open's results are JSON inside the transcript's JSON, so their quotes may be escaped.
  echo "dp_open results that offered the update (kind plan-changed):"
  grep -o 'kind[\\"]*:[ \\"]*plan-changed' "$t2" | wc -l | tr -d ' ' || true
  echo "dp_open results that brought it in (kind updated):"
  grep -o 'kind[\\"]*:[ \\"]*updated' "$t2" | wc -l | tr -d ' ' || true
  echo "dp_open calls from the main window with update or fresh:"
  grep -h '"parent_tool_use_id":null' "$t2" | grep -oE '"(update|fresh)":(true|false)' | sort | uniq -c || true
  echo "Thread subagents started by the main window (one per Plan changes group):"
  grep -h '"parent_tool_use_id":null' "$t2" | grep -o '"name":"Agent","input":{[^}]*"subagent_type":"dev-plumbing:thread"' | wc -l | tr -d ' ' || true
fi
exit "$status"
```

How the second round fits the runner:
- Claude still runs through `exec` in a subshell, so `$claude` is Claude itself.
- `stop_claude` stops the first window and waits for it to exit before the second one starts. So only one window listens, and the conflicts' submission can only go to the second.
- The service keeps running between the rounds. `cleanup` on exit stops whichever Claude is current, then the service.
- If the user script fails before it changes the plan, the loop ends when the script does, and there's no second round.

- [ ] **Step 3: Check the scripts parse**

Run: `node --check scripts/smoke-user.mjs && bash -n scripts/smoke-claude.sh`
Expected: no output, exit 0.

- [ ] **Step 4: Update the README**

In `README.md`:
- Replace the status line with:
  ```markdown
  **Status:** the Claude loop, the visual screens, Finalize spec and bringing in a changed plan work. Whiteboard Defense comes next. The design is in [SPEC.md](SPEC.md), and the plans are in [docs/superpowers/plans](docs/superpowers/plans).
  ```
- In **Use it**, before the **Keep chatting** bullet, add:
  ```markdown
  - **The plan changed in the repo?** Run `/dev-plumbing docs/specs/my-feature.md` again. Claude says what changed and asks **Update to v2?** On yes:
    - the version you had is kept, under **Documents → Versions**;
    - the repo's changes are merged into your draft;
    - the importers run again, keeping your items, threads and answers.

    Where you and the repo both changed the same passage, your draft keeps your text, and a **Plan changes** thread offers Claude's merged version, the repo's version and your own, each one click to accept. When the repo's version is mostly a rewrite, Claude also offers **Start the draft from v2**. **Not now** opens the project as it was, and Claude asks again next time.
  ```
- In **Screens**, after the **Phases & milestones** bullet, add:
  ```markdown
  - **Plan changes:** after you bring in a new version of the plan, each passage that you and the repo both changed, with Claude's merged version, the repo's and yours to pick from. It's only there once an update finds one.
  ```

- [ ] **Step 5: Explain updating in `docs/how-it-works.md`**

In `docs/how-it-works.md`:

In the agents table, replace the `importer` and `thread` rows:
```markdown
| `importer` | Once per plumbing type, when a plan is imported. It reads the plan (and code, if the type's rules say so) and writes that type's items: questions, concerns, database changes and so on. | Read-only file tools, `dp_context`, `dp_write_items` |
| `thread` | Once per thread (or group of linked threads) you send. It reads the thread and the code, then posts its reply. | Read-only file tools, `dp_context`, `dp_reply` |
```
with:
```markdown
| `importer` | Once per plumbing type, when a plan is imported, and again when you bring in a new version of the plan. It reads the plan (and code, if the type's rules say so) and writes that type's items: questions, concerns, database changes and so on. | Read-only file tools, `dp_context`, `dp_write_items` |
| `thread` | Once per thread (or group of linked threads) you send, and once per Plan changes thread after an update. It reads the thread and the code, then posts its reply. | Read-only file tools, `dp_context`, `dp_reply` |
```

In the tools table, replace the `dp_open` and `dp_wait` rows:
```markdown
| `dp_open` | Main window | Opens a plumbing project: imports a new plan, reopens an existing one, or lists this repo's projects. It also reports when the repo needs a profile first. |
| `dp_wait` | Main window | Listens until you press **Send this thread**, **Submit all** or **Start finalize**, or ask to **Detect again**. Then it returns the work (threads to answer, a final to write, or a repo profile to detect) and which model to use. |
```
with:
```markdown
| `dp_open` | Main window | Opens a plumbing project: imports a new plan, reopens an existing one, or lists this repo's projects. It also reports when the repo needs a profile first. When the plan in this clone has changed since the project's current version, it says so (`plan-changed`) and changes nothing. Called again with `update: true`, it brings the new version in (`updated`), merging it into your draft, or, with `fresh: true` as well, starting the draft again from it; with `update: false`, it opens the project as it was. |
| `dp_wait` | Main window | Listens until you press **Send this thread**, **Submit all** or **Start finalize**, or ask to **Detect again**. Then it returns the work (threads to answer, a final to write, or a repo profile to detect) and which model to use. After an update, it first hands out the Plan changes threads waiting for Claude. |
```

In the `dp_context` row, replace the end of its last cell:
```markdown
The finalizer's pack has the draft, every item, the decisions with why, the defaults and the drawing tokens it may use. |
```
with:
```markdown
The finalizer's pack has the draft, every item, the decisions with why, the defaults and the drawing tokens it may use. When the plan is re-imported, an importer's pack also has what changed between the two versions, and its type's items with their keys and drawings. |
```

In **A walk through one plan**, step 1, replace:
```markdown
   - The service copies the plan into the project as `original.md`, which is never changed, and `draft.md`, which is where accepted changes go.
```
with:
```markdown
   - The service copies the plan into the project as `original.md`, the plan as the repo has it, and `draft.md`, which is where accepted changes go.
```

Before `## Where everything is stored`, add a section. Replace:
```markdown
## Where everything is stored
```
with:
```markdown
## When the plan changes in the repo

Plans change after they're imported: someone edits the spec, or you pull a newer one. dev-plumbing never notices by itself. You bring the changes in when you're ready.

1. **Run `/dev-plumbing` again,** with the plan's path or by picking the project. The service compares the plan in this clone with the project's current version. If they differ, nothing is written yet, and Claude asks, for example: "The plan changed in the repo since v1 (12 lines added, 3 removed). Update to v2?"
   - When this clone is on another branch than that version came from, the question names the branch. When this clone has a version the project already had, for example because it hasn't pulled yet, Claude says there's nothing to bring in.
   - When merging would leave much of your draft to settle, because the repo's version is mostly a rewrite, or when only the formatting changed, Claude says so and offers a third answer, **Start the draft from v2**: the draft becomes the repo's new version, and the one you had stays under **Versions**.
   - **Not now** opens the project as it was. Claude asks again the next time.
   - The update waits while Claude has threads to answer in the project, or while an import or a finalize is under way. Then the project opens as usual, so Claude can finish that work first, and Claude tells you to run `/dev-plumbing` again afterwards.
2. **Update to v2** brings the new version in, in one step:
   - **The version you had is kept.** `original.md`, `draft.md` and the items are copied to `docs/versions/v1/` before anything else is written.
   - **The new plan is merged into your draft.** It's a three-way merge with `git merge-file`, of the old plan, your draft and the repo's new plan. What only the repo changed goes into your draft. Where you and the repo both changed the same passage, your draft keeps your text, so you never see conflict markers, and that passage becomes a **Plan changes** item. The draft as the merge left it is kept too, for the version's page.
   - **`original.md` becomes the repo's new plan,** and the project's title follows its first heading.

   If any part of this fails, what it wrote is put back. If even that stops part-way, the next `/dev-plumbing` finishes putting it back before anything else.
3. **Plan changes.** Each passage you both changed is one item, under **Plan changes**, first in the project's navigation. It's only there once an update finds such a passage.
   - The item shows **Your draft**, **The repo (v2)** and **Before (v1)**. When the repo moved the passage elsewhere, it says where, since your draft then has both copies.
   - Its thread goes straight to Claude. When a Claude window listens, a `thread` subagent offers three choices, each ready to accept in one click: a merged version (recommended), **Take the repo's version** and **Keep my draft**. Accept one, or answer, as in any thread.
   - Until it's settled, it blocks Finalize: "Your draft and the repo's new version disagree here." It never appears in the final itself: what you decide is already in the draft.
   - If a later version changes the same passage again before you settle it, the older thread is parked, and the new one links to it.
4. **The importers run again,** for every enabled plumbing type, as at import time. Each one gets what changed between the two versions, plus its type's items with their keys and drawings. It sends what's new or changed, and lists the items whose part of the plan the new version took out:
   - **an item it doesn't mention** is left alone, answered ones included;
   - **an item that changed** keeps its id, its thread, your answers and your decisions. It's updated and marked "May need another look", with "Changed in the plan's v2.", and its thread says "Updated from the plan's v2.". A drawing is edited from where your threads left it, not redrawn;
   - **something new** becomes a new item;
   - **an item whose part of the plan was removed** is parked, never deleted, with "Removed from the plan in v2.". If Claude is working on its thread right then, it's marked "May need another look" instead. The list shows "removed from the plan in v2" on it, and Finalize lists a parked one under "Parked: left out of the final". If a later version brings that part back, or you unpark it, it's back in the plan, and resolved again if its answer still stands;
   - **items you or Claude added** are never touched.

   When they're done, the project is **Active** again. A **Finalized** project stays Finalized only when the update left its draft as it was; otherwise the Finalize page says "The plan's v2 came in since the last final."
5. **Versions.** Once there's a v2, **Documents** shows **Original (v2)**, **Draft (v2)** and **Versions**.
   - **Versions** lists every version, the current one first, with its date, its branch and commit, and what its merge did.
   - Open one to read that version's plan and draft, and, for a version an update brought in, what that update changed in your draft.
   - **Compare with** shows what changed in the plan between it and another version.

## Where everything is stored
```

In **Where everything is stored**, replace:
```markdown
  project.json                   the project's title, source plan and status
  docs/original.md               the plan as imported, never changed
  docs/draft.md                  the plan with accepted changes
```
with:
```markdown
  project.json                   the project's title, source plan, status and versions
  docs/original.md               the plan as the repo had it, at the current version
  docs/draft.md                  the plan with accepted changes
  docs/versions/v<n>/            each earlier version's original.md, draft.md and items, and merged.md:
                                 the draft as the update to v<n> left it
```

In **Safety**, before the **Everything is checked** bullet, add one. Replace:
```markdown
- **Everything is checked.**
```
with:
```markdown
- **Updates only read your plan.** Bringing a new version in reads the plan in your clone, and writes only inside the plumbing project.
- **Everything is checked.**
```

In **Common questions**, before the question about what the service is doing, add one. Replace:
```markdown
**How do I see what the service is doing?**
```
with:
```markdown
**I edited the plan in the repo. Does dev-plumbing pick it up?** Not by itself. Run `/dev-plumbing` with the plan again, and answer **Update to v2**. The version you had stays under **Versions**.

**How do I see what the service is doing?**
```

In **Words**, after the `Final` row, add two rows. Replace:
```markdown
| Final | `final.md`: the finished spec Finalize writes, also copied into your repo as `<name>.final.md`. |
```
with:
```markdown
| Final | `final.md`: the finished spec Finalize writes, also copied into your repo as `<name>.final.md`. |
| Version | One state of the plan: v1 is the import, and each update adds the next. Earlier ones are kept under **Versions**. |
| Plan changes | The passages that both you and the repo changed, one thread each, after an update. |
```

- [ ] **Step 6: Run the full check**

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
- The grep prints nothing: no file outside the plans names your home folder.
- The temp-folder count is the same before and after. That includes the merge's `dp-merge-*` folders, which `mergePlan` always removes. `dp-smoke-*` folders from a smoke run are kept for their transcripts and don't count.

- [ ] **Step 7: Hand the smoke run to the controller**

Don't run `pnpm smoke` yourself. It makes real model calls for about 30 minutes: the import, a thread, a finalizer on opus, then the update and its re-import. Report that the scripts and docs are ready, with Step 6's output. The controller runs `pnpm smoke` from the worktree and gives you everything it printed.

What the controller should see:
- **Round 1:** the user log prints everything Plan 4's run did, up to "Next: writing-plans docs/specs/restock-reminders.final.md".
- **The update.** The user log then prints:
  - "Changed the plan in the repo: rewrote "…" in …, which the draft changed too; rewrote …, which the draft never changed; removed …."
  - "Asked the runner to stop this Claude window and run /dev-plumbing again."
  - "Updated to v2 and re-imported in N s."
  - "Versions: v1, v2 (merge: N clean, N in conflict)", with at least 1 in conflict, then "Status: active, import pending: none", and one line per type.
  - "Finalize page: "The plan's v2 came in since the last final.""
  - "Versions list: v2 (current), v1", and the v1-to-v2 passage counts.
  - "docs/versions/v1: plan as it was, draft as it was".
  - "Draft: … edit merged, … gone, your … kept, conflict markers: none".
  - "Re-import: N imported items before. N kept their ids (N flagged as changed in v2), N new, N removed from the plan, 0 gone.", then one "Removed from the plan: …" line per removed item.
  - "Answered in round 1: N items, 0 removed from the plan while their section is still there".
  - "Plan changes: N thread(s)", N at least 1, then one "accepted Claude's …: Applied. 1 thread resolved." line per thread.
  - "Smoke test passed."
- **The runner's report:**
  - **Round 1:** Plan 4's counts.
  - **Round 2:**
    - main window: `dp_open` 2 and `dp_wait` at least 1;
    - inside subagents: `dp_context`, `dp_write_items` (one per importer) and `dp_reply` (one per Plan changes thread);
    - the seven importers, with Flows and Phases last;
    - "offered the update" 1 and "brought it in" 1;
    - `"update":true` once, and `"fresh"` and `"update":false` never;
    - "Thread subagents started by the main window": at least 1.

If something fails:
- **"Timed out waiting for the update to v2 and its re-import":**
  - Read `$work/transcript-2.jsonl`.
  - If `dp_open` was called with `update: false`, Claude took **Not now**. SKILL.md's plan-changed branch must use an answer already given in the prompt (Task 7).
  - If there's no `plan-changed` at all, check Task 6's comparison of the plan in this clone with the current version.
  - If `updated` came back but the importers never finished, check the importer's Re-import section (Task 7) and `dp_write_items` refusals ("Nothing was saved").
- **"No imported item kept its id":** the importers didn't reuse their keys. Check the re-import pack's `existing` (Task 5) and the importer's Re-import section (Task 7).
- **"Round 1 didn't change any line of the plan in the draft":** round 1 accepted no change that replaced a line. Read round 1's user log ("Accepted …", "Applied the small edit …"); the run needs one to test a conflict.
- **"…but the merge found no conflict":** read the user log's "Changed the plan in the repo" line, and Task 2's merge on those texts.
- **"Answered items removed from the plan although their section is still in v2":** an importer listed an answered item in `removed`. Read its `dp_write_items` call in the transcript, and the importer's Re-import section (Task 7).
- **"The project is finalized after the re-import…":** Task 4's `from` for an update that changed the draft.
- **"The Finalize page doesn't say the plan's v2 came in…":** Task 9's `planVersionSinceFinal`, and Task 4's `changedDraft`.
- **"Claude didn't propose a merged version":** read that thread's `dp_reply` in the transcript, and Plan changes' rules (Task 3) with the thread agent's line for a thread with no message from the person (Task 7).
- **"Claude's merged version … wasn't applied":** its `find` no longer fit the draft, and the thread went back to Claude. Read the option's change in the transcript.
- **"docs/versions/v1 doesn't hold …", "original.md isn't the repo's new plan" or "conflict markers":** these are Task 4 or Task 2 bugs. Fix them there, with a test.

The controller decides on any fix. Record each one, and the run that finally passed.

- [ ] **Step 8: Record the results**

Add this section to the end of `smoke/RESULTS.md`, and fill every row from the controller's run. Don't leave any blank:
```markdown

## Plan 5: Bring changes in

Date: <date> · Claude Code version: <`claude --version`>

| Check | Result | Evidence |
|---|---|---|
| Round 1 still passes: import, a thread, Finalize | yes/no | user log up to "Next: writing-plans docs/specs/restock-reminders.final.md" |
| Claude asked to update to v2, and updated on yes | yes/no | runner, round 2: "offered the update: N", "brought it in: N", `"update":true` N, `"update":false` N; main window: `dp_open` N |
| v2 is in the trail, and v1 was kept as it was | yes/no | user log: "Versions: v1, v2 (merge: …)", "Versions list: v2 (current), v1", "docs/versions/v1: plan as it was, draft as it was" |
| The repo's changes were merged into the draft, with a conflict and no markers | yes/no | user log: "Changed the plan in the repo: …", "Versions: … (merge: N clean, N in conflict)", "Draft: … edit merged, … gone, your … kept, conflict markers: none" |
| The project is Active again, and Finalize says v2 came in | yes/no | user log: "Status: active, …", "Finalize page: "The plan's v2 came in since the last final."" |
| The importers ran again and kept their items by key | yes/no | user log: "Re-import: N imported items before. N kept their ids (…), N new, N removed from the plan, 0 gone.", "Status: active, import pending: none"; runner, round 2: the importers in order, `dp_write_items` N |
| No answered item was removed while its section stayed | yes/no | user log: "Answered in round 1: N items, 0 removed from the plan while their section is still there" |
| The removed section's items were parked, not deleted | yes/no/none | user log: the "Removed from the plan: …" lines, or "No item came only from …" |
| Each conflict became a Plan changes thread, and Claude's merged version applied | yes/no | user log: "Plan changes: N thread(s)", "accepted Claude's …: Applied. 1 thread resolved."; runner, round 2: "Thread subagents started by the main window: N", `dp_reply` N |

Notes: <what the draft had changed before the update; which sections the user script rewrote and removed; the merge counts; which items were flagged as changed, new or parked; Claude's merged version, in a line; how long round 2 took; anything surprising; any fix made; and the user log from the run, with `$TMPDIR` shortened>
```

- [ ] **Step 9: Commit**

```bash
git add scripts smoke README.md docs/how-it-works.md
git commit -m "test: real Claude Code smoke for updating a plan, and docs for Plan 5" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The controller pushes the branch after the final review, as in Plans 1–4.

---

## Not in this plan

These come later, or stay deferred with a reason.

- **Plan 6 (Whiteboard Defense):** Present, Study and Practice, drawn with Rough.js from the same `DiagramData`.
- **An automatic "The plan changed in the repo" banner.** The user chose updates on request only (Decision 1). The service never polls clones.
- **Rolling back to an earlier version.** The Versions list shows and compares old versions. Going back is a matter of editing the plan in the repo and updating again.
- **Re-importing only the types a change touched.** Every enabled type re-imports (the user's choice), and unchanged items are left alone by key.
- **A merge view with markers.** Conflicts become Plan changes threads, and the draft keeps your text until one is settled.
- **Follow-ups from this plan's review**, for a later plan:
  - Plan changes' empty message ("Nothing in the repo's new version conflicts with your draft.") is never shown, because the type is hidden while it has no items;
  - a question a re-import adds to a thread is labelled "raised when the plan was imported" (`opening: true`); it could name the version instead;
  - a re-import cut short, or an importer that fails, leaves no trace in the app for a type that has items (`finishImport` marks only types with none);
  - a version records `HEAD` even when the plan file has uncommitted edits; it could record a dirty flag, or show "uncommitted";
  - an item removed while its thread was with Claude is flagged, and isn't parked once Claude's reply lands;
  - a draft with `\r\n` line endings comes out of a merge with `\n`, so a pending option whose `find` has `\r\n` stops fitting (rare on a Mac);
  - a second window that opens the project during a re-import gets `reopened` with every pending type, and starts duplicate importers (it then holds the import: `importBy` follows the last window `/open` handed importers to).
- **From Plan 4's follow-ups** (see `.superpowers/plan-4-followups.md`):
  - a requeued finalize request keeping its id;
  - the first Accept replacing a file it didn't write, without saying so;
  - Accept not naming the previewed proposal;
  - a pending Detect again that can't be cancelled;
  - code fences after list markers;
  - disabled types missing from the staleness hash;
  - the repo editor re-syncing after a detection;
  - the old `dp-*` temp folders.
- **Plans 1–3's remaining minors** (`.superpowers/plan-1-followups.md`, `plan-2-followups.md` and `plan-3-followups.md`).
