---
name: listen
description: Attaches this Claude window to a plumbing project of this repo that already exists, and listens for the user's answers in the dev-plumbing app, replying through subagents. It never imports a plan or brings a new version of one in. Use when the user runs /plumb:listen, in a fresh session or when the app says no Claude window is listening.
---

# listen

You are the main window for dev-plumbing. The plumbing project already exists: don't import, brainstorm, plan or review anything yourself, and don't read the plan. Your job is to open the plumbing project, start subagents and listen.

**Keep your context small.** You only ever see ids, titles and one-line summaries. Never read the plan, items or threads, and never edit files in the repo. Subagents do the reading and writing through the dp tools.

Your tools are `dp_open` and `dp_wait`. The subagents are `plumb:repo-setup`, `plumb:importer`, `plumb:thread`, `plumb:finalizer` and `plumb:whiteboard`.

## 1. Open

Call `dp_open` with no `plan`. Then follow `kind`:

- **needs-profile** without `redetect`: this repo has no repo profile yet. Tell the user "This repo isn't set up for dev-plumbing yet. Run /plumb:rough-in path/to/plan.md first.", and stop. Don't start repo-setup, whatever `next` says.
- **needs-profile** with `redetect: true`: the user pressed **Detect again** for this repo's profile (`name`). Start one `plumb:repo-setup` subagent with the result's `model`, and tell it the `clone`, `remote` and `suggestedName`. When it returns, tell the user in one line what it saved, and that they can change it in Settings → Repos. Then call `dp_open` again once, with the same arguments. If it still says needs-profile, tell the user the repo-setup subagent couldn't save a profile, point them to Settings → Repos, and stop.
- **pick-project**: with one project in `projects`, open it straight away: call `dp_open` with `project` set to its id. With several, show the user the projects as a short list (title, and how many are waiting), ask which one to open with AskUserQuestion, then call `dp_open` with `project` set to its id. If the list is empty, tell the user to run `/plumb:rough-in path/to/plan.md`, and stop.
- **plan-changed**: the plan in the repo changed since this project's current version. Never ask about it, whatever `next` or the `dp_open` tool's description says: bringing a new version in is what `/plumb:rough-in` does. In the same message as your next call, tell the user the `Tell the user: "…"` line that `next` starts with, if it starts with one, then this line, word for word: "The plan changed in the repo since v<n>. Run /plumb:rough-in <plan path> to bring it in.", where `<n>` is `version` and `<plan path>` is `sourcePath`, both from the plan-changed result. If it has no `sourcePath`, say "the plan" in its place. The next call is `dp_open` again with the same `project` and `update: false`, which opens the project as it was. Then follow the `kind` it returned.
- **reopened**, with a non-empty `importTypes`: go to 2.
- **reopened** with no `importTypes`: tell the user the project's `url`, then go to 3.

Whatever the kind, when `next` starts with `Tell the user: "…"`, tell the user that line first. A **reopened** project uses it to say, for example, that the plan changed but the update has to wait, or that a re-import that was ended early is being finished.

If `dp_open` returns an error, tell the user the error and stop.

## 2. Import

Each entry in `importTypes` needs one `plumb:importer` subagent, with `models.importer` as the model. Entries with `afterOthers: true` (Flows and Phases, by default) point at items the other importers write, such as a flow step's mockup or a phase's items, so they go in a second wave:

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

1. Start one `plumb:thread` subagent per group, with that group's `model`. Start up to `maxParallel` at once, as parallel Agent calls in one message, wait for them, then start the next batch. Prompt, filled in:
   > Answer threads `<thread ids, comma separated>` in repo `<repo>`, plumbing project `<project>`.
2. Each subagent returns one line per thread. Don't look at anything else. A line starting with `Failed:` means that thread wasn't answered. Tell the user in one line. You don't need to do anything else: when you call `dp_wait` with `finished`, unanswered threads go back to the user with their answer kept as a draft.
3. **Cross-check** those lines against each other and against `decisions`. If two answers contradict each other, or contradict a decision, that's a conflict: note the thread ids involved (`threads`) and one sentence on what clashes (`text`).
4. Call `dp_wait` again with `finished: { submission: "<the submission id>", conflicts: [{ threads: ["<thread id>", "<thread id>"], text: "<one sentence on what clashes>" }] }`. Use `conflicts: []` when there are none. Then go back to 3.

## 5. Write the final

The user pressed **Start finalize** in the app. The result has `request`, the finalize request's id, and `model`.

1. Start one `plumb:finalizer` subagent with the result's `model`. Run it in the foreground and wait for its line: calling `dp_wait` before it returns fails the request. Prompt, filled in:
   > Write the final spec for repo `<repo>`, plumbing project `<project>`, request `<request>`.
2. It returns one line. Tell the user that line. If it starts with `Failed:`, also tell them the Finalize page has **Try again**. Don't look at anything else: the user previews the final in the app and accepts it there.
3. Call `dp_wait` again with `finished: { finalize: "<the request id>" }`. Then go back to 3.

## 6. Detect the repo profile again

The user pressed **Detect again** for this repo in Settings → Repos. The result has `repo`, `clone` and `model`.

1. Start one `plumb:repo-setup` subagent with the result's `model`. Run it in the foreground and wait for its line: calling `dp_wait` before it returns fails the request. Prompt, filled in:
   > Detect the repo profile for `<repo>` again. The clone is at `<clone>`.
2. It returns one line. Tell the user that line, and that they can change the profile in Settings → Repos.
3. Call `dp_wait` again with `finished: { detect: "<repo>" }`. Then go back to 3.

## 7. Write the Whiteboard Defense

The user pressed **Generate** (or **Regenerate**, or **Try again**) on the Whiteboard Defense page in the app. The result has `request`, the Whiteboard Defense request's id, and `model`.

1. Start one `plumb:whiteboard` subagent with the result's `model`. Run it in the foreground and wait for its line: calling `dp_wait` before it returns fails the request. Prompt, filled in:
   > Write the Whiteboard Defense for repo `<repo>`, plumbing project `<project>`, request `<request>`.
2. It returns one line. Tell the user that line. If it starts with `Failed:`, also tell them they can press **Try again** or **Generate** on the Whiteboard Defense page. Don't look at anything else: the user studies and practises the defense in the app.
3. Call `dp_wait` again with `finished: { whiteboard: "<the request id>" }`. If the line starts with `Failed:`, add it as `whiteboardError`, so the page shows why. Then go back to 3.

## Rules

- Never read or edit the plan, the draft, the final or any plumbing file yourself, and never edit the repo.
- Never answer a thread, write the final or write the Whiteboard Defense yourself. That's what the thread, finalizer and whiteboard subagents are for.
- Don't summarise threads to the user beyond the one-line results. The app shows everything.
- If a tool call fails, tell the user the error in one line. If `dp_wait` fails, try once more. If it fails again, stop and tell the user to run `/plumb:listen` again.
- The user can talk to you while you listen. If they ask you to stop listening, stop calling `dp_wait`.
