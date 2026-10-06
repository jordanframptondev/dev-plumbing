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

## Plan 4: Finalize

Date: 2026-10-04 · Claude Code version: 2.1.288 (Claude Code)

| Check | Result | Evidence |
|---|---|---|
| The main window started the finalizer, which wrote through `dp_finalize` | yes | runner: "Finalizer subagents started by the main window: 2" (a counting quirk, see Notes: one finalizer was started); subagent tool counts: `dp_finalize` 1, `dp_context` 9; main window: `dp_open` 2, `dp_wait` 3 |
| The final was accepted | yes | user log: "Claude's final arrived in 157 s: 21781 chars, 13 sections, 2 Mermaid blocks, 2 schema diffs, 2 mockup links", "Accepted into …/acme-app: docs/specs/restock-reminders.final.md" |
| `dp_finalize` refusals, fixed on retry | 0 | runner: "dp_finalize refusals: 0" |
| Mermaid was generated by the service | yes | user log: "Mermaid blocks in the repo copy: 2 (flowchart 1, sequenceDiagram 1)"; runner tokens by kind: diagram 1, migration 2, mockup 2, schema 2, sequence 1, steps 2; "Mermaid the finalizer wrote by hand: 0" |
| The copy and the assets landed in the scratch repo | yes | user log: "Accepted into …: docs/specs/restock-reminders.final.md", "Assets: ui-account-restock-settings.after.html, ui-account-restock-settings.before.html" |
| The project is Finalized | yes | user log: "Project status: finalized", "Listed under Finalized: yes", "Next: writing-plans docs/specs/restock-reminders.final.md" |

Notes:
- **Checklist:** 3 blocking, 3 using their default, 0 parked, 11 nobody reviewed.
- **Accepted:** "Move the job into apps/web" on "System overview" (applied, 1 thread resolved).
- **Parked:** "Which channel sends reminders?" (blocking question, not resolved) and "Paused customers still get reminders" (high-severity concern, not resolved).
- **Timing:** the final arrived 157 s after Finalize started (finalizer on opus). The thread reply took 15 s.
- **Counter quirk:** the runner printed 2 for "Finalizer subagents started by the main window", but one finalizer was started. The main-window transcript line for the Agent call (`toolu_01YUuYbaCCT4DPbJ5XyKEfuZ`) holds `"subagent_type":"dev-plumbing:finalizer"` twice: once in the tool input, and once in a map keyed by the tool-use id. `grep -o | wc -l` counted both. Only one `dp_finalize` call was made. The counter was fixed after this run to match the Agent call's input, and prints 1 on this transcript. The importer list was not affected: it already de-duplicates.
- **Anything else:** no `Nothing was saved` refusals, no fixes needed.
- **User log (with `$TMPDIR` shortened):**

```
[user 16:47:51] Import finished in 69 s.
[user 16:47:51] Answered "System overview": Saved. No Claude window is listening. Run /dev-plumbing in any clone.
[user 16:48:06] Claude replied in 15 s: Going with the scheduled route in apps/web. …
[user 16:48:06] Checklist: 3 blocking, 3 using their default, 0 parked, 11 nobody reviewed
[user 16:48:06]   Accepted "Move the job into apps/web" on "System overview": Applied. 1 thread resolved.
[user 16:48:06]   Parked "Which channel sends reminders?" (Blocking question, not resolved.): ok
[user 16:48:06]   Parked "Paused customers still get reminders" (High-severity concern, not resolved.): ok
[user 16:48:06] Started Finalize: Waiting for Claude to write the final.
[user 16:50:43] Claude's final arrived in 157 s: 21781 chars, 13 sections, 2 Mermaid blocks, 2 schema diffs, 2 mockup links
[user 16:50:43] Accepted into $TMPDIR/dp-smoke-QopjPb/acme-app: docs/specs/restock-reminders.final.md
[user 16:50:43]   Mermaid blocks in the repo copy: 2 (flowchart 1, sequenceDiagram 1)
[user 16:50:43]   Assets: ui-account-restock-settings.after.html, ui-account-restock-settings.before.html
[user 16:50:43]   Project status: finalized
[user 16:50:43]   Listed under Finalized: yes
[user 16:50:43]   Next: writing-plans docs/specs/restock-reminders.final.md
[user 16:50:43] Smoke test passed.
```

## Plan 5: Bring changes in

Date: 2026-10-05 · Claude Code version: 2.1.289 (Claude Code)

| Check | Result | Evidence |
|---|---|---|
| Round 1 still passes: import, a thread, Finalize | yes | user log up to "Next: writing-plans docs/specs/restock-reminders.final.md" |
| Claude asked to update to v2, and updated on yes | yes | runner, round 2 (re-counted on `transcript-2.jsonl` with the fixed greps; the committed log printed the old 2, 2 and 2): "offered the update: 1", "brought it in: 1", `"update":true` 1, `"update":false` 0, `"fresh"` 0; main window: `dp_open` 2, `dp_wait` 1 |
| v2 is in the trail, and v1 was kept as it was | yes | user log: "Versions: v1, v2 (merge: 2 clean, 1 in conflict)", "Versions list: v2 (current), v1", "docs/versions/v1: plan as it was, draft as it was" |
| The repo's changes were merged into the draft, with a conflict and no markers | yes | user log: "Changed the plan in the repo: rewrote "A daily job finds subscriptions due in the next few days and" in Approach, which the draft changed too; rewrote Phases, which the draft never changed; removed Open points.", "Draft: Phases edit merged, Open points gone, your Approach kept, conflict markers: none" |
| The project is Active again, and Finalize says v2 came in | yes | user log: "Status: active, import pending: none", "Finalize page: "The plan's v2 came in since the last final."" |
| The importers ran again and kept their items by key | yes | user log: "Re-import: 15 imported items before. 12 kept their ids (8 flagged as changed in v2), 1 new, 3 removed from the plan, 0 gone."; runner, round 2: the seven importers in order, Flows and Phases last, `dp_write_items` 6, no "Nothing was saved" |
| No answered item was removed while its section stayed | yes | user log: "Answered in round 1: 1 items, 0 removed from the plan while their section is still there" |
| The removed section's items were parked, not deleted | yes | user log: three "Removed from the plan: …" lines (two questions, one concern), all parked, removedIn 2 |
| Each conflict became a Plan changes thread, and Claude's merged version applied | yes | user log: "Plan changes: 1 thread", ""Approach": accepted Claude's "Use the merged version": Applied. 1 thread resolved."; runner, round 2: "Thread subagents started by the main window: 1", `dp_reply` 1 |

Notes:
- **Round 1 change:** the user script answered "System overview" with a request to change the Approach line to a new line. Claude offered "Update the Approach line", and the user log accepted it ("Applied. 1 thread resolved."), so the draft changed before Finalize. Round 1 parked two items and Finalize took 191 s.
- **Update:** v2 rewrote the Approach line (changed in the draft too), rewrote Phases (merged cleanly) and removed Open points. The merge counted 2 clean and 1 in conflict, which became one Plan changes thread. Round 2 took 63 s to update and re-import. Phases went from 2 to 3 items. 8 kept items were flagged as changed, 1 is new, and 3 were parked (two questions, one concern). Nothing was deleted.
- **Run 1 failed:** its "no conflict" check fired ("Round 1 didn't change any line of the plan in the draft…"), because Claude's round-1 reply to "Use your recommendation, and keep it simple." changed nothing, so the Plan changes path never ran. The script now asks for a specific edit in round 1 and fails with "Claude didn't make the edit round 1 asked for" if it doesn't land. Run 2 is the one recorded above.
- **Counter quirk, fixed:** run 2 printed 2 for "offered the update", "brought it in" and `"update":true`, but the round-2 transcript has two `dp_open` calls (the first returned `plan-changed`, the second, with `update: true`, returned `updated`). Each result and each input sits on one transcript line that carries it twice (the content and its copy), and `grep -o | wc -l` counted both. The runner now counts those lines (`grep -c`) and reads `update`/`fresh` from the `dp_open` call's own input. On that transcript it prints 1, 1 and `"update":true` 1, which the figures in the table use.
- **Anything else:** no fixes to the product were needed.
