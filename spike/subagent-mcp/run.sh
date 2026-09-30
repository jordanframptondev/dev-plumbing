#!/usr/bin/env bash
# Runs the spike headlessly and prints the evidence. Usage: ./run.sh
set -euo pipefail
cd "$(dirname "$0")"
rm -f spike.log transcript-*.jsonl
npm install --silent
claude -p "Use the spike-caller subagent to run the spike. Do not call any spike tools yourself." \
  --plugin-dir ./plugin --permission-mode bypassPermissions \
  --output-format stream-json --verbose > transcript-agent.jsonl
claude -p "Use a general-purpose subagent to call the ping tool from the spike MCP server with the message from-general-subagent. Do not call it yourself." \
  --plugin-dir ./plugin --permission-mode bypassPermissions \
  --output-format stream-json --verbose > transcript-general.jsonl
echo "--- spike.log"
cat spike.log
echo "--- MCP tool calls made inside subagents (parent_tool_use_id set):"
grep -h '"parent_tool_use_id":"' transcript-*.jsonl | grep -o '"name":"mcp__[^"]*"' | sort | uniq -c || true
