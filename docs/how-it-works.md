# How dev-plumbing works with Claude Code

This guide explains, in plain terms, what each part of dev-plumbing does, how it plugs into Claude Code, and what happens between "I ran `/dev-plumbing`" and "Claude answered my thread".

## The short version

- **dev-plumbing has two halves.**
  - **The app:** a small program on your Mac, plus a web page. It stores your plumbing projects and lets you read and answer threads.
  - **The plugin:** an add-on for **Claude Code** that lets Claude work with that app.
- **`/dev-plumbing` is a Claude Code command, not a terminal command.** You type it inside a Claude Code session (the `claude` CLI, the desktop app or an IDE extension). A plain shell doesn't know it.
- **Claude never edits your plan or your code.** It reads them, and writes only into dev-plumbing's own files, through a few dedicated tools.
- **Your main Claude window stays light.** It hands every real piece of work to **subagents**: helper Claudes, each with its own fresh memory. It only ever sees one-line summaries.
- **The app works without Claude.** You can read, answer and save drafts any time. You only need a Claude window listening for Claude to reply.

## The pieces

| Piece | What it is | Where it lives |
|---|---|---|
| **The service** | A small Node program that holds everything together. It reads and writes your projects, serves the web app, and answers the plugin's requests. It only listens on your own Mac (`127.0.0.1`, port 4545 by default). | Runs from this checkout's build. `dev-plumbing start`, `stop` and `status` control it. |
| **The web app** | The pages you use in the browser: projects, threads, lists, the Draft and Settings. It gets live updates from the service, so replies appear without reloading. | Served by the service at `http://127.0.0.1:4545`. |
| **The CLI** | The `dev-plumbing` command in your terminal. `setup` creates your config, installs the plugin, and can turn on start-at-login. | `packages/cli` |
| **The plugin** | The Claude Code add-on: one skill, three agents and one MCP server, all explained below. | `plugin/` in this repo. Claude Code loads it from here. |
| **Your config** | Settings, models, repo profiles, and the rules for each plumbing type, all in plain files you can edit (or edit in the app). | `~/.dev-plumbing/` |
| **Your projects** | One folder per plumbing project: the plan's copies, items, threads and history. | The projects folder from Settings (default `~/dev-plumbing-projects`), or the one a repo profile sets. |

## What a Claude Code plugin is

A plugin is a bundle that teaches Claude Code new things. dev-plumbing's plugin bundles three kinds of things.

### 1. A skill: the instructions behind `/dev-plumbing`

A **skill** is a Markdown file of instructions Claude follows when you call it. Ours is `plugin/skills/dev-plumbing/SKILL.md`.
- Claude Code lists it as `/dev-plumbing:dev-plumbing`: plugin name, then skill name. Plain `/dev-plumbing` also works.
- It tells the main window exactly what to do:
  - open the project;
  - start subagents;
  - listen for your answers;
  - never read the plan itself.

### 2. Agents: the helpers that do the real work

An **agent** (a "subagent" when it runs) is a separate Claude with its own instructions, its own short list of allowed tools, and a fresh, empty memory. Ours are in `plugin/agents/`:

| Agent | When it runs | What it may use |
|---|---|---|
| `repo-setup` | The first time you use dev-plumbing in a repo. It looks around the repo (plan folders, schema file, apps) and saves a **repo profile**. | Read-only file tools, `dp_repo_profile` |
| `importer` | Once per plumbing type, when a plan is imported. It reads the plan (and code, if the type's rules say so) and writes that type's items: questions, concerns, database changes and so on. | Read-only file tools, `dp_context`, `dp_write_items` |
| `thread` | Once per thread (or group of linked threads) you send. It reads the thread and the code, then posts its reply. | Read-only file tools, `dp_context`, `dp_reply` |

None of the agents can edit files or run commands. The only way they can write anything is through the dp tools, and the service checks everything they send.

Which Claude model each agent uses is set in `~/.dev-plumbing/agents.json`. It also sets how many agents may run at once.

### 3. An MCP server: the tools Claude calls

**MCP** (Model Context Protocol) is the standard way to give Claude new tools. An MCP server is a small program that says "here are my tools". When Claude calls one, the server does the work and hands back the result.

- **How ours starts.** It is set up in `plugin/.mcp.json` under the name `dp`. Claude Code starts it in the background when a session starts, by running `plugin/bin/dp-mcp.sh`, which runs `dist/mcp.mjs` with Node.
- **What it does.** It holds no data itself. Each tool call becomes a request to the dev-plumbing service, carrying a secret token that only your user account can read (`~/.dev-plumbing/run/service.json`). If the service isn't running, the MCP server starts it.
- **Tool names.** Claude Code names plugin tools `mcp__plugin_<plugin>_<server>__<tool>`, so `dp_wait` is really `mcp__plugin_dev-plumbing_dp__dp_wait`.

| Tool | Used by | What it does |
|---|---|---|
| `dp_open` | Main window | Opens a plumbing project: imports a new plan, reopens an existing one, or lists this repo's projects. It also reports when the repo needs a profile first. |
| `dp_wait` | Main window | Listens until you press **Send this thread** or **Submit all**, then returns which threads to answer and which model to use. |
| `dp_repo_profile` | repo-setup | Reads or saves the repo profile. |
| `dp_context` | importer, thread | Gets the "context pack" for one job: the plan text, the plumbing type's rules, the thread so far, past decisions and related items. |
| `dp_write_items` | importer | Saves everything one plumbing type found, all at once. If anything is wrong, nothing is saved and the error lists every problem. |
| `dp_reply` | thread | Posts a reply to a thread: text, options for you to choose from, small edits to the draft, new items, or a resolution. It is also checked as a whole. |

### How the plugin gets installed

`dev-plumbing setup` runs two Claude Code commands for you:
1. `claude plugin marketplace add <this repo>` registers this repo as a **marketplace**, a catalogue of plugins. The catalogue is `.claude-plugin/marketplace.json`.
2. `claude plugin install dev-plumbing@dev-plumbing --scope user` installs the plugin for your user, so it works in every repo.

Two things to know:
- **Plugins load when a Claude Code session starts.** A session that was already open before setup won't see `/dev-plumbing`. Start a new one, or run `/reload-plugins` in the open one. To keep a conversation when you start a new session, use `claude --continue`.
- **The plugin runs in place from this checkout.** Because the marketplace is a folder on your Mac, Claude Code loads the plugin straight from `plugin/` here, including the built `plugin/dist/mcp.mjs`. It also keeps a copy in `~/.claude/plugins/cache/`, but sessions use this checkout. The app (the service) runs from this checkout's build too. So:
  - **Keep this checkout.** If you move or delete it, the plugin and the app both stop working, until you run `dev-plumbing setup` again from the new location.
  - **After you pull changes:**
    1. Run `pnpm build`.
    2. Restart the app with `dev-plumbing stop`, then `dev-plumbing start`.
    3. Start a new Claude Code session, or run `/reload-plugins`.
  - **Build new work somewhere else.** Unfinished work belongs in a separate git worktree, so that this checkout, and with it the app and the plugin you use every day, stays on a finished version.

## A walk through one plan

```
 You, in Claude Code              Claude Code                         dev-plumbing service          You, in the browser
 ───────────────────              ───────────                         ────────────────────          ───────────────────
 /dev-plumbing docs/specs/x.md ──► main window follows the skill
                                   dp_open ─────────────────────────► makes the project:
                                                                       original.md + draft.md
                                   (first time in this repo:
                                    repo-setup agent → dp_repo_profile)
                                   one importer agent per type ──────► dp_context, dp_write_items
                                   ◄── one line back from each                                      ─► the app opens on the project
                                   dp_wait (listening…) ────────────► holds the call open
                                                                                                    ◄─ you answer threads,
                                                                                                       then Send / Submit all
                                   ◄─────────────────────────────────  returns the threads to answer
                                   one thread agent per thread ──────► dp_context, dp_reply ───────► replies appear live
                                   ◄── one line back from each
                                   checks the lines for conflicts
                                   dp_wait again (listening…) ──────►
```

1. **Open.** You run `/dev-plumbing path/to/plan.md`. The main window calls `dp_open`.
   - The service copies the plan into the project as `original.md`, which is never changed, and `draft.md`, which is where accepted changes go.
   - The plan in your repo is never edited.
2. **Repo profile, first time only.** If dev-plumbing hasn't seen this repo before, a `repo-setup` agent detects a profile: plan folders, schema file, conventions and apps. You can change it in **Settings → Repos**. That is also where you choose a separate projects folder for this repo; the agent isn't allowed to.
3. **Import.** One `importer` agent runs per enabled plumbing type: Questions, Concerns, Database, Phases and so on. Several run at once.
   - Each reads the plan, following its type's rules file (`~/.dev-plumbing/plumbing/<type>.md`), and writes its items.
   - Each item gets its own **thread**, and Claude's opening message often comes with options to choose from.
4. **You answer, in the app.**
   - Pick an option, add a note, or write a Custom answer.
   - Your answer autosaves as a **draft**.
   - **Send this thread** sends one; **Submit all** sends every thread with a draft.
5. **Listen.** Meanwhile the main window sits in `dp_wait`. When you send, the service saves your submission to disk first, then hands it to the waiting window.
6. **Answer.** The main window starts one `thread` agent per thread, or per group of closely linked threads.
   - Each agent reads what it needs and posts its reply with `dp_reply`.
   - A reply may resolve the thread, ask you something else, offer new options, or make small edits to the draft.
   - The app shows each reply as soon as it's posted.
7. **Cross-check.** Each agent hands back one line. The main window compares those lines with each other and with earlier decisions. If two answers clash, it reports the conflict, and each affected thread gets a "Might conflict with another answer" note. Then it calls `dp_wait` again and keeps listening.

### Listening, and keeping the window free

- **Background.** After two minutes, Claude Code moves the waiting `dp_wait` call into the background. You can keep chatting in that Claude window; when you send something from the app, the result arrives and Claude carries on.
- **Long waits.** While it waits, the MCP server sends small progress updates, which keep the call from timing out. The plugin allows a wait of up to 12 hours. After about 11.5 hours `dp_wait` returns "still waiting" and Claude simply calls it again.
- **"Claude listening".** The app shows this mark while a Claude window is actually waiting. If none is, Send still works: your answers are saved and queued, and the app tells you "No Claude window is listening".
- **Picking up queued answers.** The next time you run `/dev-plumbing` and reopen the project, Claude picks them up.
- **If something fails.** If a Claude window closes mid-answer, or an agent fails, the unanswered threads come back to you as **Your turn**, with your answer kept as a draft, so you can send them again.

## How your answers change the plan

- **Accepting an option with no note** applies that option's change to the draft straight away and resolves the thread.
- **Adding a note** applies the change too, and sends the note to Claude for a follow-up.
- **Small edits** from Claude (wording, typos) apply straight away, with **Undo**. You can turn this off in Settings, so they wait for you to apply them.
- **Anything that changes meaning** waits for you.

Open the **Draft** and switch to **Changes** to see every change against the original. Each change links to the thread that caused it, with Undo or Apply where they apply.

## Where everything is stored

```
~/.dev-plumbing/                 your config (all plain files; also editable in the app)
  settings.json                  port, projects folder, theme, start at login, …
  agents.json                    which model each agent uses, how many run at once
  repos/<name>.json              repo profiles
  plumbing/<type>.md             the rules for each plumbing type (add a file to add a type)
  outputs/                       rules for later features (Finalize, Whiteboard Defense)
  run/                           service.json (port and token), service.log, install info

<projects folder>/<repo>/<project>/
  project.json                   the project's title, source plan and status
  docs/original.md               the plan as imported, never changed
  docs/draft.md                  the plan with accepted changes
  items/                         one file per item (question, concern, table, …)
  threads/                       one file per thread: messages, status, your draft answer
  submissions/                   everything you sent, saved before Claude sees it
  decisions.json                 what has been decided, so later answers stay consistent
  history/                       every change made to the draft, for Undo and the Changes view
```

Every write is atomic: the file is written in full or not at all. So a crash never leaves a half-written file.

## Safety

- **Your Mac only.** The service listens only on `127.0.0.1`.
  - Tools must send the secret token.
  - The browser must come from the app's own address.
  - Requests with an unexpected `Host` are refused, which blocks DNS-rebinding tricks.
- **Read-only agents.** Agents get only read-only file tools plus their dp tools, so they can't edit your repo or run commands.
- **You decide where files go.** A repo profile written by an agent can't choose where dev-plumbing writes files. Only you can set that.
- **Everything is checked.** The service checks every batch of items and every reply as a whole. If any part is wrong, nothing is saved.

## Common questions

**Why does my terminal say it doesn't know `/dev-plumbing`?** It's a Claude Code command. Run `claude` first, then type it inside Claude Code. If Claude Code doesn't know it either, the session was probably started before setup: start a new one, or run `/reload-plugins`.

**Do I need Claude open to use the app?** No. You can browse, answer and save drafts any time. Claude only needs to be open, and listening, to reply.

**What if I close the Claude window?** Nothing is lost. Your answers stay in the app. Anything you send is queued until a window listens again: run `/dev-plumbing` and reopen the project.

**Can two Claude windows listen at once?** Yes. Each submission goes to one window. If a window disappears mid-answer, its unanswered threads come back to you.

**How do I see what the service is doing?** Run `dev-plumbing status`, or read `~/.dev-plumbing/run/service.log`.

**How do I change which model Claude uses?** In `~/.dev-plumbing/agents.json`, or in the app's Settings.

## Words

| Word | Meaning |
|---|---|
| Plumbing project | One plan being reviewed in dev-plumbing. |
| Plumbing type | One kind of view, such as Questions, Concerns or Database. Each has a rules file. |
| Item | One thing a plumbing type found, such as a question, a concern or a table change. |
| Thread | The conversation about one item. |
| Draft (answer) | Your saved but not yet sent answer to a thread. |
| Draft (document) | `draft.md`: the plan with accepted changes applied. |
| Submission | One Send or Submit all: the answers you sent, saved before Claude sees them. |
| Repo profile | dev-plumbing's notes about one repo, such as where its plans and schema live. |
| Skill | A set of instructions Claude follows when you run its command. |
| Subagent | A helper Claude with its own fresh memory and a limited set of tools. |
| MCP server | A small program that gives Claude extra tools. |
| Marketplace | A catalogue of Claude Code plugins. This repo is one. |
