# How dev-plumbing works with Claude Code

This guide explains, in plain terms, what each part of dev-plumbing does, how it plugs into Claude Code, and what happens between "I ran `/dev-plumbing`" and "Claude answered my thread".

## The short version

- **dev-plumbing has two halves.**
  - **The app:** a small program on your Mac, plus a web page. It stores your plumbing projects and lets you read and answer threads.
  - **The plugin:** an add-on for **Claude Code** that lets Claude work with that app.
- **`/dev-plumbing` is a Claude Code command, not a terminal command.** You type it inside a Claude Code session (the `claude` CLI, the desktop app or an IDE extension). A plain shell doesn't know it.
- **Claude never edits your plan or your code.** It reads them, and writes only into dev-plumbing's own files, through a few dedicated tools. The only things that land in your repo are the final spec and its mockups in `<name>.assets/`, when you accept the final, and the Whiteboard Defense as `<name>.whiteboard-defense.md`, when you export it.
- **Your main Claude window stays light.** It hands every real piece of work to **subagents**: helper Claudes, each with its own fresh memory. It only ever sees one-line summaries.
- **The app works without Claude.** You can read, answer and save drafts any time. You only need a Claude window listening for Claude to reply.

## The pieces

| Piece | What it is | Where it lives |
|---|---|---|
| **The service** | A small Node program that holds everything together. It reads and writes your projects, serves the web app, and answers the plugin's requests. It only listens on your own Mac (`127.0.0.1`, port 4545 by default). | Runs from this checkout's build. `dev-plumbing start`, `stop` and `status` control it. |
| **The web app** | The pages you use in the browser: projects, threads, lists, drawings, the Draft and Settings. It gets live updates from the service, so replies appear without reloading. | Served by the service at `http://127.0.0.1:4545`. |
| **The CLI** | The `dev-plumbing` command in your terminal. `setup` creates your config, installs the plugin, and can turn on start-at-login. | `packages/cli` |
| **The plugin** | The Claude Code add-on: one skill, five agents and one MCP server, all explained below. | `plugin/` in this repo. Claude Code loads it from here. |
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
| `repo-setup` | The first time you use dev-plumbing in a repo, and again after **Detect again** in Settings → Repos. It looks around the repo (plan folders, schema file, apps) and saves a **repo profile**. | Read-only file tools, `dp_repo_profile` |
| `importer` | Once per plumbing type, when a plan is imported, again when you bring in a new version of the plan, and once more when you've settled that version's Plan changes. It reads the plan (and code, if the type's rules say so) and writes that type's items: questions, concerns, database changes and so on. | Read-only file tools, `dp_context`, `dp_write_items` |
| `thread` | Once per thread (or group of linked threads) you send, once per Plan changes thread after an update, and once per unknown or concern you send from the Whiteboard Defense. It reads the thread and the code, then posts its reply. | Read-only file tools, `dp_context`, `dp_reply` |
| `finalizer` | When you press **Start finalize**. It writes the final spec from the draft, the items and the decisions, following `outputs/finalize.md`. | Read-only file tools, `dp_context`, `dp_finalize` |
| `whiteboard` | When you press **Generate**, **Regenerate** or **Try again** on the Whiteboard Defense page. It writes the Whiteboard Defense, with its presenter for Present, from the final (or the draft), the items, the decisions and the repo profile, following `outputs/whiteboard-defense.md`. | Read-only file tools, `dp_context`, `dp_whiteboard` |

None of the agents can edit files or run commands. The only way they can write anything is through the dp tools, and the service checks everything they send.

Which Claude model each agent uses is set in `~/.dev-plumbing/agents.json`. It also sets how many agents may run at once.

### 3. An MCP server: the tools Claude calls

**MCP** (Model Context Protocol) is the standard way to give Claude new tools. An MCP server is a small program that says "here are my tools". When Claude calls one, the server does the work and hands back the result.

- **How ours starts.** It is set up in `plugin/.mcp.json` under the name `dp`. Claude Code starts it in the background when a session starts, by running `plugin/bin/dp-mcp.sh`, which runs `dist/mcp.mjs` with Node.
- **What it does.** It holds no data itself. Each tool call becomes a request to the dev-plumbing service, carrying a secret token that only your user account can read (`~/.dev-plumbing/run/service.json`). If the service isn't running, the MCP server starts it.
- **Tool names.** Claude Code names plugin tools `mcp__plugin_<plugin>_<server>__<tool>`, so `dp_wait` is really `mcp__plugin_dev-plumbing_dp__dp_wait`.

| Tool | Used by | What it does |
|---|---|---|
| `dp_open` | Main window | Opens a plumbing project: imports a new plan, reopens an existing one, or lists this repo's projects. It also reports when the repo needs a profile first. When the plan in this clone has changed since the project's current version, it says so (`plan-changed`) and changes nothing. Called again with `update: true`, it brings the new version in (`updated`), merging it into your draft, or, with `fresh: true` as well, starting the draft again from it; with `update: false`, it opens the project as it was. |
| `dp_wait` | Main window | Listens until you press **Send this thread**, **Submit all**, **Start finalize** or **Generate** on the Whiteboard Defense page, or ask to **Detect again**. Then it returns the work (threads to answer, a final to write, a Whiteboard Defense to write, or a repo profile to detect) and which model to use. After an update, it first hands out the Plan changes threads waiting for Claude. |
| `dp_repo_profile` | repo-setup | Reads or saves the repo profile. |
| `dp_context` | importer, thread, finalizer, whiteboard | Gets the "context pack" for one job: the plan text, the plumbing type's rules, the thread so far, past decisions and related items. The finalizer's pack names the rules file, the draft and the previous final for it to read, so it stays small on a big plan, and has every item with its own file, the decisions with why, the defaults and the drawing tokens it may use. When the plan is re-imported, an importer's pack also has what changed between the two versions (or, in a catch-up, what settling the Plan changes changed), and its type's items with their keys and drawings. The whiteboard subagent's pack names the rules file and the document (the final or the draft) for it to read, so it stays small on a big plan, and has every item with its own file (a diagram's drawing comes inline), the decisions, the defaults, the open items, the repo profile's conventions, sensitive data, schema and apps, the last defense's questions and unknowns, and the drawings Present may use, each with the parts a step can reveal; a Defense thread's pack also has the whole Whiteboard Defense. |
| `dp_write_items` | importer | Saves everything one plumbing type found, all at once. If anything is wrong, nothing is saved and the error lists every problem. |
| `dp_reply` | thread | Posts a reply to a thread: text, options for you to choose from, small edits to the draft, new items, or a resolution. It is also checked as a whole. |
| `dp_finalize` | finalizer | Sends the final spec. The service replaces each drawing token with a block made from that item's data. If any token is wrong, the whole document is refused, with every problem listed. |
| `dp_whiteboard` | whiteboard | Sends the Whiteboard Defense as structured data: the level and its reasons, ten sections of statements, each marked known, inferred, unknown or verify, the questions with their answers, the release concerns and the presenter's seven chapters for Present. The service adds the titles and ids, and copies the rules file's checklist. If anything is wrong, such as a part the presenter names that isn't in its chapter's drawing, the whole defense is refused, with every problem listed, and the last one saved stays as it was. |

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
   - The service copies the plan into the project as `original.md`, the plan as the repo has it, and `draft.md`, which is where accepted changes go.
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

## Finalize

When the threads that matter are answered, **Finalize spec** (in the project's header) turns the draft into the **final**: the spec an implementing AI builds from, in the structure `~/.dev-plumbing/outputs/finalize.md` sets.

1. **The checklist.** The Finalize page lists:
   - **These block Finalize:** a blocking question or a high or critical concern that isn't resolved, a thread Claude is still working on, a proposal waiting for your answer, or a small edit waiting to be applied. Deal with each one first: resolve or park a question or concern, wait for Claude's reply, answer the proposal, or apply the edit.
   - **These will use their default:** unresolved items that have a default.
   - **Parked: left out of the final.**
   - **Nobody has reviewed these:** items whose threads you never wrote in. This is only a warning.
2. **Start.** **Start finalize** saves a request in the project. A listening Claude window picks it up through `dp_wait` and starts one `finalizer` subagent, on the model `agents.json` sets for it.
   - With no window listening, the request waits, and the page says "No Claude window is listening".
   - If the window goes away, the request goes back in the queue. If the finalizer comes back without a final, the page says so and offers **Try again**.
   - While a request is waiting or being written, a secondary **Cancel** button clears it, for example when the Claude window that took it was interrupted.
3. **Write.** The finalizer reads its context pack. The rules, the draft and the previous final are files it reads, so the pack stays small whatever the size of the plan. The pack has:
   - every item, with a short summary of its drawing, and its body cut to 800 characters, with its own file to read for the rest;
   - the decisions, each with why and what was rejected;
   - the defaults and the repo's conventions.

   It sends the whole document with `dp_finalize`.
4. **Drawings come from the data.** The finalizer never draws. Where a drawing belongs, it writes a token such as `{{diagram:architecture-system}}`, and the service replaces it with a block made from that item's data:
   - `diagram`: a Mermaid flowchart;
   - `sequence`: a Mermaid sequence diagram, for system flows;
   - `steps`: numbered steps, for user flows;
   - `schema` and `migration`: the exact schema diff and the migration notes;
   - `mockup`: a link to the mockup's HTML file.

   A token for an item that doesn't exist, or that doesn't fit it, is refused with every problem listed, and nothing is saved. So the diagrams always match what you agreed.
5. **Preview.** The page shows Claude's final, and what changed since the last one. Mermaid shows as code; GitHub and most editors draw it.
6. **Accept.** Pick the clone to copy into: the one the plan came from, or another clone the project was opened from. Accept then:
   - saves `docs/final.md` in the plumbing project, after moving the previous one to `finals/`;
   - copies it into the repo as `<name>.final.md`, next to the plan;
   - writes each UI mockup to `<name>.assets/` as a plain HTML file: the mockup's markup with your app's own classes, and a comment naming the app, route and kit files. Mockups this project wrote before and no longer needs are removed; anything else in that folder is left alone. The mockup files live only in the repo copy: the plumbing project keeps the mockups as item data, so in the app a mockup link's text shows plain, and hovering over it says it opens from the repo copy;
   - marks the project **Finalized**.

   If anything the final is built from changed after the finalizer picked the request up (the draft, an item's drawing data such as a redrawn diagram, an item you park or unpark, or a decision, including one made while Claude is writing), Accept is refused: "The draft changed since Claude wrote this. Finalize again." You never accept a final that misses a later decision.
7. **Next.** The page shows the next command to run, such as `writing-plans docs/specs/restock-reminders.final.md`, with a copy button. Later answers don't undo Finalized. **Finalize again** writes a new final, and replaces both copies once you accept it.

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

   If any part of this fails, what it wrote is put back. If even that stops part-way, the next `/dev-plumbing` finishes putting it back before anything else, and Claude tells you: "An earlier update to v2 didn't finish, and was put back." If your draft was changed in the meantime, it's kept, and your plan and draft from before the update are set aside under `docs/versions/v<n>.unfinished-<stamp>/`; Claude then adds which of your files were kept and where your files from before the update are. That folder is then the only copy of your draft as it was before the update. Nothing removes it by itself: the Versions page lists it, with **Remove** (step 6).
3. **Plan changes.** Each passage you both changed is one item, under **Plan changes**, first in the project's navigation. It's only there once an update finds such a passage.
   - The item shows **Your draft**, **The repo (v2)** and **Before (v1)**. When the repo moved the passage elsewhere, it says where, since your draft then has both copies.
   - Its thread goes straight to Claude. When a Claude window listens, a `thread` subagent offers three choices, each ready to accept in one click: a merged version (recommended), **Take the repo's version** and **Keep my draft**. Accept one, or answer, as in any thread.
   - Until it's settled, it blocks Finalize: "Your draft and the repo's new version disagree here." It never appears in the final itself: what you decide is already in the draft.
   - If a later version changes the same passage again before you settle it, the older thread is parked, and the new one links to it.
4. **The importers run again,** for every enabled plumbing type, as at import time. Each one gets what changed between the two versions, plus its type's items with their keys and drawings. It sends what's new or changed, and lists the items whose part of the plan the new version took out:
   - **an item it doesn't mention** is left alone, answered ones included;
   - **an item that changed** keeps its id, its thread, your answers and your decisions. It's updated and marked "May need another look", with "Changed in the plan's v2.", and its thread says "Updated from the plan's v2.". A drawing is edited from where your threads left it, not redrawn. The thread's **What v2 changed**, folded until you open it, shows the parts the re-import changed, each as v1 had it against what the re-import made of it: **Summary**, **Details**, **Fields** and **Drawing** (as a line saying what it draws), or "Nothing else changed." A change you accept afterwards isn't in it. (The re-import keeps that copy in `docs/versions/v2/reimported/`. An item re-imported before there were such copies says **Changed since before v2**, against the item as it is now.) It's there to read: nothing in it undoes the change. A question the importer adds to the thread is marked "raised in the plan's v2";
   - **something new** becomes a new item;
   - **an item whose part of the plan was removed** is parked, never deleted, with "Removed from the plan in v2.". If Claude is working on its thread right then, it's marked "May need another look" instead, and parked once Claude's reply lands. The list shows "removed from the plan in v2" on it, and Finalize lists a parked one under "Parked: left out of the final". If a later version brings that part back, or you unpark it, it's back in the plan, and resolved again if its answer still stands. Its thread offers **Park** even when it's resolved, so you can leave it out of the final again;
   - **items you or Claude added** are never touched.

   A second listening window can't end a re-import early. If a re-import is cut short anyway, for example because the Claude window closed, the project's header says which types didn't finish, such as "The v2 re-import didn't finish for Flows. Run /dev-plumbing to try again.", and the next `/dev-plumbing` says it's finishing it and runs just those importers again (as a catch-up again, when it was one, step 5, and with the settled Plan changes it carried, when it carried some). While Claude has threads to answer, it waits, and Claude says so: run `/dev-plumbing` again once they're answered. It's tried once on its own: cut short a second time, the header says "The v2 re-import didn't finish again for Flows. Run /dev-plumbing to try again.", the next `/dev-plumbing` says that rather than run it, and the one after tries once more.

   When they're done, the project is **Active** again. A **Finalized** project stays Finalized only when the update left its draft as it was; otherwise the Finalize page says "The plan's v2 came in since the last final."
5. **Catch up.** Settling a Plan changes thread can change your draft, but the importers ran before you settled it, so the items may not match it yet. Once every Plan changes thread of the version is settled (resolved or parked), and settling at least one of them changed your draft, the Plan changes list says "Your Plan changes are settled. Run /dev-plumbing to catch the items up.", and the next `/dev-plumbing` starts with "Your settled Plan changes touch the plan's items. Re-importing to catch them up."
   - It's step 4 again, for every importable type, matching items by key, but what changed is only what settling did: each change you took in a Plan changes thread, under its passage's heading. Your answers to other items aren't in it, and there are no conflicts left in it. An item it changes is marked "Changed in the plan's v2." as before, and its thread says "Updated to match your settled Plan changes.".
   - It runs once per version, after **Not now** too, since Not now only declines a newer version. It doesn't run at all when settling changed nothing, for example when you kept your draft everywhere. Like an update, it waits while Claude has threads to answer or an import is under way, and Claude says so: "Your settled Plan changes still need a re-import. It waits until Claude has answered: run /dev-plumbing again then." A re-import that was cut short comes first: while it's being finished, waits, or was cut short twice, the catch-up waits too, and Claude says so. If you update to a newer version before running it, the catch-up isn't run on its own: it rides along with that version's re-import, which adds a "Settled in v<n>'s Plan changes:" part for the items to catch up with. **Start the draft from v<n>** drops it instead, since it replaces the draft those changes were settled into.
6. **Versions.** Once there's a v2, **Documents** shows **Original (v2)**, **Draft (v2)** and **Versions**.
   - **Versions** lists every version, the current one first, with its date, its branch and commit, and what its merge did.
   - Open one to read that version's plan and draft, and, for a version an update brought in, what that update changed in your draft.
   - **Compare with** shows what changed in the plan between it and another version.
   - **Left over from updates that didn't finish** lists the folders an unfinished update set aside (step 2), each with that version's plan and draft from before the update. **Remove** asks first, then deletes that folder and nothing else.

## Whiteboard Defense

"If you ship it, you should be able to explain it." The Whiteboard Defense is Claude's defense of the plan: how it works, what could fail and what's still unknown. You study it, practise explaining it and present it on a whiteboard, before you build. It follows `~/.dev-plumbing/outputs/whiteboard-defense.md`, which you can edit on the Plumbing rules page.

1. **Generate.** The header's **Whiteboard Defense** button, or the **Defense** tab on a phone, opens its page. **Generate** saves a request in the project, as **Start finalize** does. A listening Claude window picks it up through `dp_wait`, after any threads waiting for Claude and any finalize, and starts one `whiteboard` subagent, on the model `agents.json` sets for it (opus by default). Writing it can take ten minutes or more.
   - With no window listening, the request waits, and the page says "No Claude window is listening. Run /dev-plumbing in any clone."
   - While it's written, that window is busy: the page says "Claude is writing the Whiteboard Defense. Threads you send now wait until it's done.", and so does what you send meanwhile.
   - If the window goes away, the request goes back in the queue for another window. If the subagent comes back without a defense, the page says why (its own "Failed: …" line, or "The whiteboard subagent didn't send a Whiteboard Defense.") and offers **Try again**, or **Dismiss** to keep the defense you had.
   - **Cancel** clears the request, whatever its state. One is written at a time, and none while the plan is importing.
2. **Write.** The subagent reads its context pack. The rules and the document it explains are files it reads, so the pack stays small whatever the size of the plan: the final while it's current (nothing changed and no newer plan version since you accepted it), else the draft. A defense written while a final waits for you to accept it is based on the draft, and goes Out of date once you accept. The pack also has every item, the decisions, the defaults and every open question, the repo profile's conventions and sensitive data, which raise the review level, and the last defense's questions and unknowns, whose wording it keeps where they still apply. It may read the code in the clone to check a statement. It sends the defense with `dp_whiteboard`:
   - a review level, 1 **Lightweight**, 2 **Standard** or 3 **High risk**, with its reasons;
   - the 13 sections, from **Executive summary** to **Checklist**: ten of statements, the questions you should be able to answer with their answers, and the release concerns from **Critical** to **Informational**. The service adds the checklist, copied word for word from the rules file;
   - every statement marked **Known**, **Inferred**, **Unknown** or **Verify before release**. What isn't known is marked Unknown, not made up;
   - the presenter, for **Present** (step 5): seven chapters of steps, each chapter drawing one of the project's drawings, or none. The pack lists those drawings, each with the parts a step can reveal.

   The service checks the whole defense: every section there once, each with at least one statement, a cell for every column of a table, a diagram that names a real drawing, no question twice, the presenter's seven chapters in order with every part they name in their drawing, and the size. If anything is wrong, nothing is saved, the subagent is told every problem at once and sends it again, and the defense you had stays as it was. A saved one replaces it.
3. **Study.** The page shows the 13 sections as a readable page, with a table of contents, tables, the diagram (drawn from the project's own data, or as text) and each statement's mark. It says what it was written from, for example "Based on the draft (v2)".
4. **Practice.** One flashcard per question: show the answer, then rate yourself **Could explain it**, **Shaky** or **Couldn't**, and the next card comes up. Space or Enter shows the answer, 1 to 3 rate it, and the arrow keys move. **Only shaky and couldn't** keeps just the cards you rated so when you turn it on. The readiness meter is half flashcards and half checklist: the cards you could explain and half the shaky ones, out of all the cards, and the checklist lines you ticked, out of all the lines. Ratings and ticks are kept by their text, so a regenerated defense keeps the ones that still apply.
5. **Present.** The third mode draws the plan on a hand-drawn whiteboard, one step at a time, for when you explain it out loud. It follows the presenter the subagent wrote with the rest:
   - **Seven chapters,** always in this order: **Purpose**, **System flow**, **Data and source of truth**, **States**, **Security**, **Failure and retries** and **Rollback and blast radius**. Each has one to eight steps. A chapter the plan doesn't touch has one step that says so.
   - **One drawing per chapter, or none:** a diagram item, the project's tables (drawn as the Database screen's relationship strip) or a system flow (drawn as a sequence). Their parts are named by kind: `node:`, `edge:` and `group:` for a diagram, `table:` and `link:` for the tables, `lane:` and `step:` for a flow. User flows, mockups and phases aren't drawn; a caption or a note can name them. A chapter with no drawing writes its notes on the board as a list.
   - **Each step** has a caption, what to say out loud. It adds the parts it reveals to what the chapter already drew: a line brings its two ends, a flow's step its two lanes, and a group appears with its first box. It can add up to four marker notes, circled by the part they're near or written at the board's foot: seal for a risk, slate for data, moss for what's safe and ink for structure.
   - **The board** is the page's canvas with a faint dot grid. Its lines are rough, and the same every time; labels and notes are in the system font. What a step adds draws itself in. Going back a step shows that step's board at once, and with your system's reduced motion on, everything shows at once.
   - **Nothing moves between steps.** Each chapter is framed once, around what it shows by its last step with its notes, so a chapter that shows ten boxes of a big diagram draws them large. Each note is placed when its step comes, clear of the parts the chapter draws and the notes before it, and stays there. In the page the board is as tall as the chapter's drawing needs at the page's width, within the window, and opening Present scrolls it into view, so the board, the caption and the buttons are on screen together; they move only when the chapter changes.
   - **Controls:** ◀ ▶ or ← → step through it, across chapters. Home and End go to the chapter's first and last step, and the chapters list jumps to a chapter. **Replay** draws the chapter again from its first step. **Full screen** covers the window, and the screen too where the browser allows it; Esc or ✕ leaves it, and the page under it can't take the focus. On a phone held upright, it suggests turning it sideways and pressing Full screen; held sideways, full screen fits the chapter, the board, the caption and the buttons without scrolling.
   - **When the plan moved on** since it was written, a part that's no longer in its drawing is skipped and the rest is drawn, and a drawing that's gone shows "Nothing to draw in this chapter." with the notes. A defense written before Present has no presenter: the page says so, and **Regenerate** writes one. If Present's own code can't load (a tab left open across an update, say), it says "Present couldn't load. Reload the page." in its place.
6. **Ask Claude about this.** Any section, question or release concern can start a thread: type your question, and it goes to Claude as **Send this thread** sends one.
   - The thread is an item of **Defense questions**, a plumbing type built into the app. It appears in the navigation once you've asked something.
   - Its `thread` subagent gets the whole defense in its pack, and answers from the plan, the decisions and the code. When the answer needs nothing more from you, Claude resolves the thread with it, so it doesn't wait in your Inbox: reply to carry on.
   - A Defense thread never changes the draft, never blocks Finalize and never goes into the final, and what's decided in it stays there: other threads never see it. When an answer shows a gap in the plan, Claude adds a Questions or Concerns item instead (it can add no other kind). That item is part of the plan like any other.
7. **Send to Questions or Concerns.** A statement marked Unknown or Verify before release can go to **Questions**, and a release concern to **Concerns**, in one click.
   - It becomes an ordinary item, and its thread goes straight to Claude, which suggests answers. Those suggestions don't hold up Finalize until you've answered in the thread.
   - A sent concern keeps its weight: critical and high become high, so it blocks Finalize until it's resolved, like any high concern.
   - Each part is sent once, even after **Regenerate**: one with the same text shows as sent, linked to its thread.
8. **Out of date.** The defense remembers what it was written from. When the plan changes, the page says "Out of date: the plan changed since this was generated.", or "Out of date: a final was accepted since this was generated." when it was written from the draft and would now be written from a final, and **Regenerate** becomes the main button.
   - **These make it out of date:** a change to the document it was written from, an item added or changed, a thread parked or unparked, and a new decision. So does answering a question you sent from it, since that adds a decision, and a Questions or Concerns item Claude adds while answering a Defense thread. A defense of the final also goes out of date once the final isn't current: a change applied, or a newer plan version.
   - **These don't:** asking Claude about it, and anything decided in those Defense threads; sending to Questions or Concerns; practising; review marks and flags.
   - The old defense stays readable, and Practice keeps working, until a new one is saved.
9. **Export .md.** Pick a clone, as for Accept. The defense is written into it as `<name>.whiteboard-defense.md`, next to the plan, saying what it was written from and when, with the diagram it names drawn in Mermaid. A later export replaces it (the form says so), nothing else is written, and it works when the defense is out of date too.

## Where everything is stored

```
~/.dev-plumbing/                 your config (all plain files; also editable in the app)
  settings.json                  port, projects folder, theme, start at login, …
  agents.json                    which model each agent uses, how many run at once
  repos/<name>.json              repo profiles
  plumbing/<type>.md             the rules for each plumbing type (add a file to add a type)
  outputs/                       rules for Finalize (finalize.md) and the Whiteboard Defense (whiteboard-defense.md)
  run/                           service.json (port and token), service.log, install info, detect.json (Detect again)

<projects folder>/<repo>/<project>/
  project.json                   the project's title, source plan, status and versions
  docs/original.md               the plan as the repo had it, at the current version
  docs/draft.md                  the plan with accepted changes
  docs/versions/v<n>/            each earlier version's original.md, draft.md and items, and merged.md:
                                 the draft as the update to v<n> left it
  docs/versions/v<n>/reimported/ each item the re-import of v<n> changed, as it left it (What v<n> changed)
  docs/versions/v<n>.unfinished-<stamp>/
                                 your plan and draft from before an update that didn't finish, set aside
                                 because your draft had changed since; Remove on the Versions page deletes it
  docs/final.proposed.md         Claude's final, waiting for your preview
  docs/final.md                  the final spec, saved when you accept it
  items/                         one file per item (question, concern, table, …)
  threads/                       one file per thread: messages, status, your draft answer
  submissions/                   everything you sent, saved before Claude sees it
  decisions.json                 what has been decided, so later answers stay consistent
  history/                       every change made to the draft, for Undo and the Changes view
  finalize.json                  the finalize request under way, if there is one
  finals/                        earlier finals, kept when you finalize again
  whiteboard/request.json        the Whiteboard Defense request under way, if there is one
  whiteboard/defense.json        the Whiteboard Defense
  whiteboard/practice.json       your flashcard ratings and checklist ticks
```

Every write is atomic: the file is written in full or not at all. So a crash never leaves a half-written file.

## Safety

- **Your Mac only.** The service listens only on `127.0.0.1`.
  - Tools must send the secret token.
  - The browser must come from the app's own address.
  - Requests with an unexpected `Host` are refused, which blocks DNS-rebinding tricks.
- **Read-only agents.** Agents get only read-only file tools plus their dp tools, so they can't edit your repo or run commands.
- **You decide where files go.** A repo profile written by an agent can't choose where dev-plumbing writes files. Only you can set that.
- **Two writes into your repo, both when you ask.** Accept copies the final into the clone you pick, as `<name>.final.md` and `<name>.assets/`, next to the plan. **Export .md** writes the Whiteboard Defense there as `<name>.whiteboard-defense.md`, and nothing else. Either way, the clone must have this repo's remote, nothing is written through a symlink, and the plan itself is never touched.
- **Updates only read your plan.** Bringing a new version in reads the plan in your clone, and writes only inside the plumbing project.
- **Everything is checked.** The service checks every batch of items and every reply as a whole. If any part is wrong, nothing is saved.

## Common questions

**Why does my terminal say it doesn't know `/dev-plumbing`?** It's a Claude Code command. Run `claude` first, then type it inside Claude Code. If Claude Code doesn't know it either, the session was probably started before setup: start a new one, or run `/reload-plugins`.

**Do I need Claude open to use the app?** No. You can browse, answer and save drafts any time. Claude only needs to be open, and listening, to reply.

**What if I close the Claude window?** Nothing is lost. Your answers stay in the app. Anything you send is queued until a window listens again: run `/dev-plumbing` and reopen the project.

**Can two Claude windows listen at once?** Yes. Each submission goes to one window. If a window disappears mid-answer, its unanswered threads come back to you.

**I edited the plan in the repo. Does dev-plumbing pick it up?** Not by itself. Run `/dev-plumbing` with the plan again, and answer **Update to v2**. The version you had stays under **Versions**.

**Does asking Claude about the Whiteboard Defense hold up Finalize?** No. Defense threads never block Finalize and never go into the final. An unknown or a concern you send to Questions or Concerns does count, like any other item there, and so does a Questions or Concerns item Claude adds while answering.

**Can I write my own rules for Plan changes or Defense questions?** No. Both are built into the app, and their ids, `plan-changes` and `defense`, are kept for them. A rules file in `plumbing/` with either id is ignored, the built-in type is used, and the Plumbing rules page lists the file under "Files with problems": "The id "plan-changes" is kept for dev-plumbing's built-in Plan changes type, so this file is ignored. To keep it as your own type, rename the file and the id inside it, or delete the file." Saving it from the page is refused with the same words, and **+ Plumbing type** won't make a type with either id.

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
| Final | `final.md`: the finished spec Finalize writes, also copied into your repo as `<name>.final.md`. |
| Version | One state of the plan: v1 is the import, and each update adds the next. Earlier ones are kept under **Versions**. |
| Plan changes | The passages that both you and the repo changed, one thread each, after an update. |
| Whiteboard Defense | Claude's defense of the plan, to study and practise explaining before you build: a review level, 13 sections, flashcards and a checklist. |
| Defense questions | The plumbing type for your questions to Claude about the Whiteboard Defense, one thread each. It never blocks Finalize or goes into the final. |
| Present | The Whiteboard Defense's third mode: the plan drawn on a hand-drawn whiteboard, one step at a time, with a caption to say out loud. |
| Catch-up | The re-import the next `/dev-plumbing` runs once a version's Plan changes are settled and settling changed the draft, so the items match what you settled. |
| Submission | One Send or Submit all: the answers you sent, saved before Claude sees them. |
| Repo profile | dev-plumbing's notes about one repo, such as where its plans and schema live. |
| Skill | A set of instructions Claude follows when you run its command. |
| Subagent | A helper Claude with its own fresh memory and a limited set of tools. |
| MCP server | A small program that gives Claude extra tools. |
| Marketplace | A catalogue of Claude Code plugins. This repo is one. |
