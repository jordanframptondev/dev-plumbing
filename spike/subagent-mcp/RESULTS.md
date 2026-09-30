# Spike: can plugin subagents call the plugin's MCP tools?

Date: 2026-09-30 · Claude Code version: 2.1.286 (Claude Code)

| Check | Result | Evidence |
|---|---|---|
| Plugin agent (spike-caller) called `ping` | yes | `{"tool":"ping","message":"from-subagent-7f3a9c","progressToken":2}` in spike.log |
| Plugin agent called `slow_ping` and got the reply | yes | `slow_ping` `"phase":"start"` 19:58:20, `"phase":"done"` 19:58:29 (9s) in spike.log; call counted in transcript with parent_tool_use_id set |
| Claude Code sent a progress token | yes | `progressToken` 2 (ping) and 3 (slow_ping) in spike.log |
| General-purpose subagent called `ping` | yes | `{"tool":"ping","message":"from-general-subagent","progressToken":2}` in spike.log |
| Tool name as seen by Claude | `mcp__plugin_spike_spike__ping` / `mcp__plugin_spike_spike__slow_ping` | transcript: calls with `parent_tool_use_id` set counted 2x `ping`, 1x `slow_ping` |

Notes: `--permission-mode bypassPermissions` was accepted; run.sh ran unchanged. Only calls with `parent_tool_use_id` set were counted, so the calls came from inside subagents. The secret marker lives only in the agent's system prompt. Plugin MCP tools are named `mcp__plugin_<plugin>_<server>__<tool>`, so Plan 2's tools will be `mcp__plugin_<plugin>_<server>__dp_context` etc. (not `mcp__<server>__`).

## Decision for Plan 2

- **Both subagent checks passed:** thread subagents call `dp_context` and `dp_reply` directly.
- **Otherwise:** thread subagents return their reply as JSON to the main window, which calls `dp_reply` (spec §18 fallback).

Chosen: Both subagent checks passed: thread subagents call `dp_context` and `dp_reply` directly.
