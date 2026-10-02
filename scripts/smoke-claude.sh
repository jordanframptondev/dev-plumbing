#!/usr/bin/env bash
# The real thing. Claude Code runs /dev-plumbing on a small plan, scripts/smoke-user.mjs answers one thread
# the way you would in the browser, and a thread subagent replies. It uses a temporary dev-plumbing home and
# a scratch repo, and leaves your real ~/.dev-plumbing alone. It makes real model calls.
#   scripts/smoke-claude.sh                   about 5 minutes
#   DP_SMOKE_LONG=1 scripts/smoke-claude.sh   waits 35 minutes before answering, to check the long wait
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/dp-smoke-XXXXXX")"
export DEV_PLUMBING_HOME="$work/.dev-plumbing"
cli="$root/packages/cli/dist/index.js"
claude=""
# Stop Claude before the service: a Claude still running would start the service again.
stop_claude() {
  if [ -n "$claude" ]; then kill "$claude" 2>/dev/null || true; wait "$claude" 2>/dev/null || true; claude=""; fi
}
cleanup() { stop_claude; node "$cli" stop >/dev/null 2>&1 || true; }
trap cleanup EXIT

pnpm -C "$root" build >/dev/null
node "$cli" setup --yes --no-login-item --no-start --no-plugin --projects-folder "$work/projects" --port 45461 >/dev/null
# Only Questions and Concerns, to keep it short and cheap. And no browser windows.
node -e '
  const fs = require("fs"), path = require("path"), dir = process.env.DEV_PLUMBING_HOME;
  const s = path.join(dir, "settings.json");
  fs.writeFileSync(s, JSON.stringify({ ...JSON.parse(fs.readFileSync(s, "utf8")), openBrowserOnImport: false }, null, 2));
  for (const f of fs.readdirSync(path.join(dir, "plumbing"))) {
    if (["questions.md", "concerns.md"].includes(f)) continue;
    const p = path.join(dir, "plumbing", f);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/^enabled: true$/m, "enabled: false"));
  }'

repo="$work/acme-app"
mkdir -p "$repo/docs/specs"
git -C "$repo" init -q -b main
git -C "$repo" remote add origin git@github.com:acme/acme-app.git
cp "$root/scripts/smoke-plan.md" "$repo/docs/specs/restock-reminders.md"

echo "Working in $work"
node "$root/scripts/smoke-user.mjs" &
user=$!
# exec, so $! is Claude itself and not a subshell that would leave it running.
( cd "$repo" && exec claude -p "Use the dev-plumbing skill to plumb docs/specs/restock-reminders.md." \
    --plugin-dir "$root/plugin" --permission-mode bypassPermissions \
    --output-format stream-json --verbose > "$work/transcript.jsonl" 2> "$work/claude.err" ) &
claude=$!
status=0
wait "$user" || status=$?
stop_claude
echo "Transcript: $work/transcript.jsonl"
echo "dp tool calls made inside subagents (parent_tool_use_id set):"
grep -h '"parent_tool_use_id":"' "$work/transcript.jsonl" | grep -o '"name":"mcp__plugin_dev-plumbing_dp__[^"]*"' | sort | uniq -c || true
echo "dp tool calls made by the main window:"
grep -h '"parent_tool_use_id":null' "$work/transcript.jsonl" | grep -o '"name":"mcp__plugin_dev-plumbing_dp__[^"]*"' | sort | uniq -c || true
exit "$status"
