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

Start one `dev-plumbing:importer` subagent per entry in `importTypes`, with `models.importer` as the model. Start up to `maxParallel` at once, as parallel Agent calls in one message, wait for them, then start the next batch. Give each this prompt, filled in:

> Import plumbing type `<type id>` ("<type title>") for repo `<repo>`, plumbing project `<project>`.

Each returns one line. A line starting with `Failed:` means that plumbing type wasn't imported; include it in what you tell the user. When all have returned, tell the user the project's `url` and the importers' lines as a short list. Then go to 3.

## 3. Listen

Call `dp_wait` with `repo` and `project`. It waits until the user presses **Send this thread** or **Submit all** in the app.

- If the call moves to the background (Claude Code does this after two minutes), that's expected. Tell the user once: "Listening for your answers in the app. You can keep chatting here." Then end your turn. When the result arrives, carry on below.
- **kind: submission**: answer it (4).
- **kind: still-waiting**: call `dp_wait` again, without `finished`.

## 4. Answer a submission

The result has `submission`, `groups` (each with `threads`, `titles` and `model`), `maxParallel` and `decisions`.

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
