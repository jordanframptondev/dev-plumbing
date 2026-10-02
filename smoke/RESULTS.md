# Smoke test: the Claude loop with real Claude Code

Date: 2026-10-01 · Claude Code version: 2.1.287 (Claude Code)

| Check | Result | Evidence |
|---|---|---|
| repo-setup subagent saved a repo profile | yes | user log "Repo profile saved: yes"; `repos/acme-app.json` matches `github.com/acme/acme-app`, plan folder `docs/specs` |
| Importers wrote Questions and Concerns | yes | user log: Questions 4 items, Concerns 3 items, import finished in 33 s |
| Main window called dp_open and dp_wait | yes | main-window tool counts: `dp_open` 2 (needs-profile, then created), `dp_wait` 1 |
| Subagents called dp_context, dp_write_items and dp_reply | yes | subagent tool counts: `dp_context` 3, `dp_write_items` 2, `dp_reply` 1, plus `dp_repo_profile` 2 |
| A thread subagent replied after Send this thread | yes | "Claude replied in 12 s" on "Daily job double-sends reminders" (it resolved the thread) |
| A 35-minute wait survived (progress kept it alive) | pending | controller runs DP_SMOKE_LONG=1 after this commit |
| Agent tool names in `tools:` worked unchanged | yes | nothing changed: `mcp__plugin_dev-plumbing_dp__<tool>` is the name Claude Code uses |

Notes:
- Two short runs, both passed. The table and log are from the second. The first run gave the same counts, imported 4 Questions and 3 Concerns in 39 s, and Claude replied in 12 s with one recommended option that edits the plan.
- The first run found a bug in the runner. `kill` stopped only the subshell around `claude`, so Claude kept running after the script ended. Its dp server then started the temporary service again after cleanup had stopped it. The runner now runs `claude` with `exec`, and stops it, waiting for it to exit, before it stops the service. After the second run, no Claude, dp server or service process was left.
- `claude -p` started from inside another Claude Code session worked without unsetting any variables.
- The "user" answered before the main window called `dp_wait`. The submission was saved first and picked up 3 s later, when `dp_wait` started.
- All subagents ran on sonnet, the model in `agents.json`.

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
