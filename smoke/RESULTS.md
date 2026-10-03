# Smoke test: the Claude loop with real Claude Code

Date: 2026-10-01 · Claude Code version: 2.1.287 (Claude Code)

| Check | Result | Evidence |
|---|---|---|
| repo-setup subagent saved a repo profile | yes | user log "Repo profile saved: yes"; `repos/acme-app.json` matches `github.com/acme/acme-app`, plan folder `docs/specs` |
| Importers wrote Questions and Concerns | yes | user log: Questions 4 items, Concerns 3 items, import finished in 33 s |
| Main window called dp_open and dp_wait | yes | main-window tool counts: `dp_open` 2 (needs-profile, then created), `dp_wait` 1 |
| Subagents called dp_context, dp_write_items and dp_reply | yes | subagent tool counts: `dp_context` 3, `dp_write_items` 2, `dp_reply` 1, plus `dp_repo_profile` 2 |
| A thread subagent replied after Send this thread | yes | "Claude replied in 12 s" on "Daily job double-sends reminders" (it resolved the thread) |
| A 35-minute wait survived (progress kept it alive) | yes | `DP_SMOKE_LONG=1` run: the main window's only `dp_wait` call returned the submission made 35 minutes after it was called. The thread subagent's `dp_reply` returned `ok` 7 s later, and the user log says "Claude replied in 9 s" |
| Agent tool names in `tools:` worked unchanged | yes | nothing changed: `mcp__plugin_dev-plumbing_dp__<tool>` is the name Claude Code uses |

Notes:
- Two short runs, both passed. The table and log are from the second. The first run gave the same counts, imported 4 Questions and 3 Concerns in 39 s, and Claude replied in 12 s with one recommended option that edits the plan.
- The first run found a bug in the runner. `kill` stopped only the subshell around `claude`, so Claude kept running after the script ended. Its dp server then started the temporary service again after cleanup had stopped it. The runner now runs `claude` with `exec`, and stops it, waiting for it to exit, before it stops the service. After the second run, no Claude, dp server or service process was left.
- `claude -p` started from inside another Claude Code session worked without unsetting any variables.
- The "user" answered before the main window called `dp_wait`. The submission was saved first and picked up 3 s later, when `dp_wait` started.
- All subagents ran on sonnet, the model in `agents.json`.
- The long run used `smoke-user.mjs` from before the final-review fixes. That version's reply check could pass on Claude's opening message if the answer failed to send, so the long-run result was checked against the transcript as well. It shows one `dp_wait` result of kind `submission`, then a subagent `dp_reply` that returned `ok`. The same counts appear as in the short runs, and the import took 30 s.

User log from the second run (`$TMPDIR` shortened):

```
Working in $TMPDIR/dp-smoke-tXMl06
[user 03:54:32] Import finished in 33 s.
[user 03:54:32]   Questions: 4 items
[user 03:54:32]   Concerns: 3 items
[user 03:54:32] Repo profile saved: yes
[user 03:54:32] Answered "Daily job double-sends reminders": Sent to Claude.
[user 03:54:44] Claude replied in 12 s: Keeping it simple: a unique constraint on (subscription_id, due_date, channel) with claim-then-send, plus a job lock. For detection, one alert on duplicate-key
[user 03:54:44] Smoke test passed.
dp tool calls made inside subagents (parent_tool_use_id set):
   3 "name":"mcp__plugin_dev-plumbing_dp__dp_context"
   1 "name":"mcp__plugin_dev-plumbing_dp__dp_reply"
   2 "name":"mcp__plugin_dev-plumbing_dp__dp_repo_profile"
   2 "name":"mcp__plugin_dev-plumbing_dp__dp_write_items"
dp tool calls made by the main window:
   2 "name":"mcp__plugin_dev-plumbing_dp__dp_open"
   1 "name":"mcp__plugin_dev-plumbing_dp__dp_wait"
```

## Plan 3: visual types

Date: 2026-10-02 · Claude Code version: 2.1.288 (Claude Code)

| Check | Result | Evidence |
|---|---|---|
| repo-setup found the Prisma schema and the web app's kit | yes | user log: "schema: prisma packages/db/prisma/schema.prisma", "app web (apps/web): kitFiles apps/web/app/globals.css" |
| Importers wrote valid data for each visual type | yes | user log: "Architecture: 1 items, 1 with data", "Database: 2 items, 2 with data", "UI changes: 2 items, 2 with data", "Flows: 3 items, 3 with data", "Phases & milestones: 2 items, 2 with data" |
| Flows and Phases ran after the others | yes | runner: architecture, database, ui, questions, concerns, then flows and phases. In the transcript, flows and phases start only after concerns, the last of the first wave, has returned |
| UI mockups had markup and rendered | yes | user log: "UI changes: 2 of 2 with After markup, 1 with Before", "Mockup ui-account-restock-settings: 200 text/html; charset=utf-8", "Kit: app web, 1 files, warnings: none" |
| Tables were checked against the schema | yes | user log: "Database: 2 of 2 tables checked against packages/db/prisma/schema.prisma, 0 warnings" |
| Writes refused and fixed on retry | 0 | runner: 0 transcript lines with "Nothing was saved". 7 `dp_write_items` calls for 7 importers, so each wrote once |
| A thread reply still works | yes | "Claude replied in 15 s" on "System overview", an Architecture item |

Notes:
- One run, and it passed the first time. No fixes were needed.
- The run used this checkout's `plugin/` through `--plugin-dir`. Claude Code's init message lists it as `dev-plumbing@inline`, and the `dev-plumbing:importer`, `repo-setup` and `thread` agents came from it.
- The main window started the importers in batches of four: architecture, database, ui and questions, then concerns. Flows and phases started together, once concerns had returned. The import took 99 s, against 33 s for Plan 2's two types.
- The repo profile also has 4 conventions, such as "Ids use uuid()" and the kit's shared classes, and `sensitiveData: ["PII"]`.
- The mockups use the kit's own classes (`card`, `button-primary`, `text-ink`, `accent-brand`). The account page's Before is the page as it is today. The new order-summary screen has only an After.
- Flows: 3 flows with 15 steps. 2 steps point at a UI mockup, such as "Sees the order summary", which points at `ui-reorder-summary`. The 2 phases list 13 items between them.
- The first thread waiting for an answer was "System overview" (Architecture), so the round-trip ran on a drawn item. The thread agent replied in words and left the diagram as it was.
- As in Plan 2, the "user" answered before the main window called `dp_wait` ("Saved. No Claude window is listening."). `dp_wait` picked up the submission when it started.
- All subagents ran on sonnet. Afterwards, no `claude -p`, dp server or service was left running, and nothing was listening on port 45461.

User log from the run (`$TMPDIR` shortened):

```
Working in $TMPDIR/dp-smoke-UGSUI1
[user 01:26:34] Import finished in 99 s.
[user 01:26:34]   Architecture: 1 items
[user 01:26:34]   Database: 2 items
[user 01:26:34]   UI changes: 2 items
[user 01:26:34]   Flows: 3 items
[user 01:26:34]   Questions: 4 items
[user 01:26:34]   Concerns: 4 items
[user 01:26:34]   Phases & milestones: 2 items
[user 01:26:34] Repo profile saved: yes
[user 01:26:34]   schema: prisma packages/db/prisma/schema.prisma
[user 01:26:34]   app web (apps/web): kitFiles apps/web/app/globals.css
[user 01:26:34]   Architecture: 1 items, 1 with data
[user 01:26:34]   Database: 2 items, 2 with data
[user 01:26:34]   Database: 2 of 2 tables checked against packages/db/prisma/schema.prisma, 0 warnings
[user 01:26:34]   UI changes: 2 items, 2 with data
[user 01:26:34]   UI changes: 2 of 2 with After markup, 1 with Before
[user 01:26:34]   Mockup ui-account-restock-settings: 200 text/html; charset=utf-8
[user 01:26:34]   Kit: app web, 1 files, warnings: none
[user 01:26:34]   Flows: 3 items, 3 with data
[user 01:26:34]   Flows: 15 steps, 2 pointing at a UI mockup
[user 01:26:34]   Phases & milestones: 2 items, 2 with data
[user 01:26:34]   Phases: 13 items listed across 2 phases
[user 01:26:34] Answered "System overview": Saved. No Claude window is listening. Run /dev-plumbing in any clone.
[user 01:26:49] Claude replied in 15 s: Keeping the separate daily job. The diagram already draws it that way, so nothing needs to change. I'll leave both SMS and email as optional until the channel i
[user 01:26:49] Smoke test passed.
Transcript: $TMPDIR/dp-smoke-UGSUI1/transcript.jsonl
dp tool calls made inside subagents (parent_tool_use_id set):
   8 "name":"mcp__plugin_dev-plumbing_dp__dp_context"
   1 "name":"mcp__plugin_dev-plumbing_dp__dp_reply"
   2 "name":"mcp__plugin_dev-plumbing_dp__dp_repo_profile"
   7 "name":"mcp__plugin_dev-plumbing_dp__dp_write_items"
dp tool calls made by the main window:
   2 "name":"mcp__plugin_dev-plumbing_dp__dp_open"
   1 "name":"mcp__plugin_dev-plumbing_dp__dp_wait"
Importers started by the main window, in order (Flows and Phases should come last):
 1. Import plumbing type `architecture`
 2. Import plumbing type `database`
 3. Import plumbing type `ui`
 4. Import plumbing type `questions`
 5. Import plumbing type `concerns`
 6. Import plumbing type `flows`
 7. Import plumbing type `phases`
Transcript lines with a refused write ("Nothing was saved"):
0
```
