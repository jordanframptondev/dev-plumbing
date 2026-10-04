#!/usr/bin/env bash
# The real thing. Claude Code runs /dev-plumbing on a small plan, in a scratch repo with a Prisma schema and a
# Tailwind v4 kit. scripts/smoke-user.mjs checks the drawings the importers wrote, answers one thread the way you
# would in the browser, and a thread subagent replies. Then it finalizes: it applies small edits, accepts Claude's
# proposals, parks whatever still blocks Finalize, starts it, waits for the finalizer's final, accepts it into the
# scratch repo and checks the copy. It uses a temporary dev-plumbing home and leaves your real ~/.dev-plumbing alone.
# It makes real model calls.
#   scripts/smoke-claude.sh                   about 20 minutes (the finalizer runs on opus)
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
# Questions and Concerns for the thread round-trip, plus every visual type. Ideas, Testing and Security stay
# off, to keep it shorter and cheaper. And no browser windows.
node -e '
  const fs = require("fs"), path = require("path"), dir = process.env.DEV_PLUMBING_HOME;
  const keep = ["questions.md", "concerns.md", "architecture.md", "database.md", "ui.md", "flows.md", "phases.md"];
  const s = path.join(dir, "settings.json");
  fs.writeFileSync(s, JSON.stringify({ ...JSON.parse(fs.readFileSync(s, "utf8")), openBrowserOnImport: false }, null, 2));
  for (const f of fs.readdirSync(path.join(dir, "plumbing"))) {
    if (keep.includes(f)) continue;
    const p = path.join(dir, "plumbing", f);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/^enabled: true$/m, "enabled: false"));
  }'

# The scratch repo: the plan, a Prisma schema, and a web app with a Tailwind v4 kit and an account page.
# No repo profile is written here: the repo-setup subagent has to find the schema and the kit itself.
repo="$work/acme-app"
mkdir -p "$repo/docs/specs" "$repo/packages/db/prisma" "$repo/apps/web/app/account"
git -C "$repo" init -q -b main
git -C "$repo" remote add origin git@github.com:acme/acme-app.git
cp "$root/scripts/smoke-plan.md" "$repo/docs/specs/restock-reminders.md"
cat > "$repo/packages/db/prisma/schema.prisma" <<'PRISMA'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Customer {
  id            String         @id @default(uuid())
  email         String         @unique
  phone         String?
  subscriptions Subscription[]
  createdAt     DateTime       @default(now())
}

model Subscription {
  id         String             @id @default(uuid())
  customer   Customer           @relation(fields: [customerId], references: [id])
  customerId String
  product    String
  status     SubscriptionStatus @default(ACTIVE)
  nextDueAt  DateTime
  createdAt  DateTime           @default(now())

  @@index([customerId])
}

enum SubscriptionStatus {
  ACTIVE
  PAUSED
  CANCELLED
}
PRISMA
cat > "$repo/apps/web/package.json" <<'JSON'
{ "name": "@acme/web", "private": true, "dependencies": { "next": "^15.0.0", "react": "^19.0.0", "tailwindcss": "^4.0.0" } }
JSON
cat > "$repo/apps/web/app/globals.css" <<'CSS'
@import "tailwindcss";

@theme {
  --color-brand: #0f766e;
  --color-ink: #1f2937;
  --radius-card: 14px;
}

@layer components {
  .card {
    @apply rounded-card border border-ink/10 bg-white p-4;
  }
  .button-primary {
    @apply rounded-full bg-brand px-4 py-2 text-sm font-medium text-white;
  }
}
CSS
cat > "$repo/apps/web/app/account/page.tsx" <<'TSX'
export default function AccountPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold text-ink">Your account</h1>
      <section className="card">
        <h2 className="font-medium text-ink">Subscriptions</h2>
        <p className="text-sm text-ink/70">Coffee beans, every 4 weeks.</p>
        <button className="button-primary mt-3">Manage</button>
      </section>
    </main>
  );
}
TSX

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
echo "Importers started by the main window, in order (Flows and Phases should come last):"
grep -h '"parent_tool_use_id":null' "$work/transcript.jsonl" | grep -o 'Import plumbing type `[a-z0-9-]*`' | awk '!seen[$0]++' | nl -w2 -s'. ' || true
echo "Transcript lines with a refused write (\"Nothing was saved\"):"
grep -c 'Nothing was saved' "$work/transcript.jsonl" || true
echo "Finalizer subagents started by the main window:"
grep -h '"parent_tool_use_id":null' "$work/transcript.jsonl" | grep -o '"name":"Agent","input":{[^}]*"subagent_type":"dev-plumbing:finalizer"' | wc -l | tr -d ' ' || true
echo "dp_finalize refusals (\"Fix these and call dp_finalize again\"):"
grep -c 'Fix these and call dp_finalize again' "$work/transcript.jsonl" || true
echo "Tokens in the finalizer's last dp_finalize call, by kind:"
grep -h '"name":"mcp__plugin_dev-plumbing_dp__dp_finalize"' "$work/transcript.jsonl" | tail -1 | grep -o '{{[a-z]*:' | sort | uniq -c || true
echo "Mermaid the finalizer wrote by hand in its dp_finalize calls (should be 0):"
grep -h '"name":"mcp__plugin_dev-plumbing_dp__dp_finalize"' "$work/transcript.jsonl" | grep -c '```mermaid' || true
exit "$status"
