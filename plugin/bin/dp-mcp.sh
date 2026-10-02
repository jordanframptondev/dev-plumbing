#!/bin/sh
# Starts the dev-plumbing MCP server with the Node that `dev-plumbing setup` recorded,
# falling back to whatever `node` is on PATH.
home="${DEV_PLUMBING_HOME:-$HOME/.dev-plumbing}"
node_bin=""
if [ -f "$home/run/node" ]; then node_bin="$(head -n 1 "$home/run/node")"; fi
if [ -z "$node_bin" ] || [ ! -x "$node_bin" ]; then node_bin="$(command -v node)"; fi
if [ -z "$node_bin" ]; then
  echo "dev-plumbing: Node.js wasn't found. Run dev-plumbing setup in a terminal." >&2
  exit 1
fi
exec "$node_bin" "$(dirname "$0")/../dist/mcp.mjs"
