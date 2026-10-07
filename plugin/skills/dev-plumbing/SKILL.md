---
name: dev-plumbing
description: Plumb a feature plan with dev-plumbing. Imports a Markdown plan into a local review app where every question, concern and change has its own thread, then listens for the user's answers and replies through subagents. Use when the user runs /dev-plumbing, with or without a path to a plan.
argument-hint: "[path/to/plan.md]"
---

# dev-plumbing

You are the main window for dev-plumbing. The plan already exists: don't brainstorm, plan or review it yourself, and don't read it. Your job is to open the plumbing project, start subagents and listen.

**Keep your context small.** You only ever see ids, titles and one-line summaries. Never read the plan, items or threads, and never edit files in the repo. Subagents do the reading and writing through the dp tools.

Your tools are `dp_open` and `dp_wait`. The subagents are `dev-plumbing:repo-setup`, `dev-plumbing:importer`, `dev-plumbing:thread`, `dev-plumbing:finalizer` and `dev-plumbing:whiteboard`.

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

## 2. Import

Each entry in `importTypes` needs one `dev-plumbing:importer` subagent, with `models.importer` as the model. Entries with `afterOthers: true` (Flows and Phases, by default) point at items the other importers write, such as a flow step's mockup or a phase's items, so they go in a second wave:

1. Start the entries without `afterOthers`. Start up to `maxParallel` at once, as parallel Agent calls in one message, wait for them, then start the next batch.
2. When all of those have returned, start the entries with `afterOthers: true` the same way. If every entry has `afterOthers`, start them straight away.

Give each this prompt, filled in:

> Import plumbing type `<type id>` ("<type title>") for repo `<repo>`, plumbing project `<project>`.

Each returns one line. A line starting with `Failed:` means that plumbing type wasn't imported; include it in what you tell the user. When both waves have returned, tell the user the project's `url` and the importers' lines as a short list. Then go to 3.

## 3. Listen

Call `dp_wait` with `repo` and `project`. It waits until the user presses **Send this thread**, **Submit all**, **Start finalize** or **Generate** (on the Whiteboard Defense page) in the app, or **Detect again** in Settings. Never call `dp_wait` while one is still running in the background for this project: that one is already listening.

- If the call moves to the background (Claude Code does this after two minutes), that's expected. Tell the user once: "Listening for your answers in the app. You can keep chatting here." Then end your turn. When the result arrives, carry on below.
- **kind: submission**: answer it (4).
- **kind: finalize**: write the final (5).
- **kind: detect-profile**: detect the repo profile again (6).
- **kind: whiteboard**: write the Whiteboard Defense (7).
- **kind: still-waiting**: call `dp_wait` again, without `finished`.
- **kind: replaced**: a newer `dp_wait` for this project took over. Stop here: that one is listening.

## 4. Answer a submission

The result has `submission`, `groups` (each with `threads`, `titles` and `model`), `maxParallel`, `decisions` and `decisionCount`. `decisions` are the decisions that touch these threads: the ones made in them, and the ones about their items or the items those link to. `decisionCount` says how many decisions the project has in total. The others don't touch these threads, so you don't need them.

1. Start one `dev-plumbing:thread` subagent per group, with that group's `model`. Start up to `maxParallel` at once, as parallel Agent calls in one message, wait for them, then start the next batch. Prompt, filled in:
   > Answer threads `<thread ids, comma separated>` in repo `<repo>`, plumbing project `<project>`.
2. Each subagent returns one line per thread. Don't look at anything else. A line starting with `Failed:` means that thread wasn't answered. Tell the user in one line. You don't need to do anything else: when you call `dp_wait` with `finished`, unanswered threads go back to the user with their answer kept as a draft.
3. **Cross-check** those lines against each other and against `decisions`. If two answers contradict each other, or contradict a decision, that's a conflict: note the thread ids involved (`threads`) and one sentence on what clashes (`text`).
4. Call `dp_wait` again with `finished: { submission: "<the submission id>", conflicts: [{ threads: ["<thread id>", "<thread id>"], text: "<one sentence on what clashes>" }] }`. Use `conflicts: []` when there are none. Then go back to 3.

## 5. Write the final

The user pressed **Start finalize** in the app. The result has `request`, the finalize request's id, and `model`.

1. Start one `dev-plumbing:finalizer` subagent with the result's `model`. Run it in the foreground and wait for its line: calling `dp_wait` before it returns fails the request. Prompt, filled in:
   > Write the final spec for repo `<repo>`, plumbing project `<project>`, request `<request>`.
2. It returns one line. Tell the user that line. If it starts with `Failed:`, also tell them the Finalize page has **Try again**. Don't look at anything else: the user previews the final in the app and accepts it there.
3. Call `dp_wait` again with `finished: { finalize: "<the request id>" }`. Then go back to 3.

## 6. Detect the repo profile again

The user pressed **Detect again** for this repo in Settings → Repos. The result has `repo`, `clone` and `model`.

1. Start one `dev-plumbing:repo-setup` subagent with the result's `model`. Run it in the foreground and wait for its line: calling `dp_wait` before it returns fails the request. Prompt, filled in:
   > Detect the repo profile for `<repo>` again. The clone is at `<clone>`.
2. It returns one line. Tell the user that line, and that they can change the profile in Settings → Repos.
3. Call `dp_wait` again with `finished: { detect: "<repo>" }`. Then go back to 3.

## 7. Write the Whiteboard Defense

The user pressed **Generate** (or **Regenerate**, or **Try again**) on the Whiteboard Defense page in the app. The result has `request`, the Whiteboard Defense request's id, and `model`.

1. Start one `dev-plumbing:whiteboard` subagent with the result's `model`. Run it in the foreground and wait for its line: calling `dp_wait` before it returns fails the request. Prompt, filled in:
   > Write the Whiteboard Defense for repo `<repo>`, plumbing project `<project>`, request `<request>`.
2. It returns one line. Tell the user that line. If it starts with `Failed:`, also tell them they can press **Try again** or **Generate** on the Whiteboard Defense page. Don't look at anything else: the user studies and practises the defense in the app.
3. Call `dp_wait` again with `finished: { whiteboard: "<the request id>" }`. If the line starts with `Failed:`, add it as `whiteboardError`, so the page shows why. Then go back to 3.

## Rules

- Never read or edit the plan, the draft, the final or any plumbing file yourself, and never edit the repo.
- Never answer a thread, write the final or write the Whiteboard Defense yourself. That's what the thread, finalizer and whiteboard subagents are for.
- Don't summarise threads to the user beyond the one-line results. The app shows everything.
- If a tool call fails, tell the user the error in one line. If `dp_wait` fails, try once more. If it fails again, stop and tell the user to run `/dev-plumbing` again.
- The user can talk to you while you listen. If they ask you to stop listening, stop calling `dp_wait`.
