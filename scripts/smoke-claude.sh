#!/usr/bin/env bash
# The real thing. Claude Code runs /dev-plumbing on a small plan, in a scratch repo with a Prisma schema and a
# Tailwind v4 kit. scripts/smoke-user.mjs checks the drawings the importers wrote, answers one thread the way you
# would in the browser, and a thread subagent replies. Then it finalizes: it applies small edits, accepts Claude's
# proposals, parks whatever still blocks Finalize, starts it, waits for the finalizer's final, accepts it into the
# scratch repo and checks the copy. Then it changes the plan in the scratch repo, and this script stops Claude and
# runs /dev-plumbing again: Claude asks to update to v2, merges, re-imports, and answers the Plan changes threads. It
# fails when an importable type got no saved dp_write_items batch in the re-import. Last, the user script generates the
# Whiteboard Defense: the second window writes it with a whiteboard subagent, then answers a question about it and
# suggests answers for one of its unknowns, sent to Questions.
# It uses a temporary dev-plumbing home and leaves your real ~/.dev-plumbing alone. It makes real model calls.
#   scripts/smoke-claude.sh                   about 45 minutes (the finalizer and the whiteboard subagent run on opus)
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
# The user script writes this file once it has changed the plan in the scratch repo.
round2="$work/round2"
DP_SMOKE_ROUND2="$round2" node "$root/scripts/smoke-user.mjs" &
user=$!
# exec, so $! is Claude itself and not a subshell that would leave it running.
( cd "$repo" && exec claude -p "Use the dev-plumbing skill to plumb docs/specs/restock-reminders.md." \
    --plugin-dir "$root/plugin" --permission-mode bypassPermissions \
    --output-format stream-json --verbose > "$work/transcript.jsonl" 2> "$work/claude.err" ) &
claude=$!
# Round 2: once the plan has changed, stop this window and run /dev-plumbing again, as you would. Claude asks whether
# to update to v2. The service keeps running in between.
while [ ! -e "$round2" ] && kill -0 "$user" 2>/dev/null; do sleep 2; done
if [ -e "$round2" ]; then
  stop_claude
  ( cd "$repo" && exec claude -p "Use the dev-plumbing skill to plumb docs/specs/restock-reminders.md. If it asks whether to update to v2, the answer is yes: merge it into my draft." \
      --plugin-dir "$root/plugin" --permission-mode bypassPermissions \
      --output-format stream-json --verbose > "$work/transcript-2.jsonl" 2> "$work/claude-2.err" ) &
  claude=$!
fi
status=0
wait "$user" || status=$?
stop_claude

# What one claude -p round did, from its transcript.
report() {
  local t="$1"
  echo "Transcript: $t"
  echo "dp tool calls made inside subagents (parent_tool_use_id set):"
  grep -h '"parent_tool_use_id":"' "$t" | grep -o '"name":"mcp__plugin_dev-plumbing_dp__[^"]*"' | sort | uniq -c || true
  echo "dp tool calls made by the main window:"
  grep -h '"parent_tool_use_id":null' "$t" | grep -o '"name":"mcp__plugin_dev-plumbing_dp__[^"]*"' | sort | uniq -c || true
  echo "Importers started by the main window, in order (Flows and Phases should come last):"
  grep -h '"parent_tool_use_id":null' "$t" | grep -o 'Import plumbing type `[a-z0-9-]*`' | awk '!seen[$0]++' | nl -w2 -s'. ' || true
  echo "Transcript lines with a refused write (\"Nothing was saved\"):"
  grep -c 'Nothing was saved' "$t" || true
}
echo "== Round 1: import, one thread, Finalize"
report "$work/transcript.jsonl"
echo "Finalizer subagents started by the main window:"
grep -h '"parent_tool_use_id":null' "$work/transcript.jsonl" | grep -o '"name":"Agent","input":{[^}]*"subagent_type":"dev-plumbing:finalizer"' | wc -l | tr -d ' ' || true
echo "dp_finalize refusals (\"Fix these and call dp_finalize again\"):"
grep -c 'Fix these and call dp_finalize again' "$work/transcript.jsonl" || true
echo "Tokens in the finalizer's last dp_finalize call, by kind:"
grep -h '"name":"mcp__plugin_dev-plumbing_dp__dp_finalize"' "$work/transcript.jsonl" | tail -1 | grep -o '{{[a-z]*:' | sort | uniq -c || true
echo "Mermaid the finalizer wrote by hand in its dp_finalize calls (should be 0):"
grep -h '"name":"mcp__plugin_dev-plumbing_dp__dp_finalize"' "$work/transcript.jsonl" | grep -c '```mermaid' || true
if [ -e "$work/transcript-2.jsonl" ]; then
  t2="$work/transcript-2.jsonl"
  echo "== Round 2: the plan changed, and /dev-plumbing ran again"
  report "$t2"
  # dp_open's results are JSON inside the transcript's JSON, so their quotes may be escaped. A result sits on one
  # transcript line (twice on it, so count lines), and an input is read from the call itself, not from its copy.
  echo "dp_open results that offered the update (kind plan-changed):"
  grep -c 'kind[\\"]*:[ \\"]*plan-changed' "$t2" || true
  echo "dp_open results that brought it in (kind updated):"
  grep -c 'kind[\\"]*:[ \\"]*updated' "$t2" || true
  echo "dp_open calls from the main window with update or fresh:"
  grep -h '"parent_tool_use_id":null' "$t2" | grep -o '"name":"mcp__plugin_dev-plumbing_dp__dp_open","input":{[^}]*}' | grep -oE '"(update|fresh)":(true|false)' | sort | uniq -c || true
  echo "Thread subagents started by the main window (one per Plan changes group, plus the Defense question and the unknown sent to Questions):"
  grep -h '"parent_tool_use_id":null' "$t2" | grep -o '"name":"Agent","input":{[^}]*"subagent_type":"dev-plumbing:thread"' | wc -l | tr -d ' ' || true
  # Every importable type has to get a batch in the re-import: items, removed or noChanges. A type whose importer never
  # wrote keeps its items as they were, and the import still ends once the main window calls dp_wait, so nothing else
  # catches it. Counting calls isn't enough: a refused batch sent again counts twice. So each enabled type needs a
  # dp_write_items call of its own that wasn't refused.
  echo "Importable types with no saved dp_write_items batch (should be none):"
  if missing="$(node -e '
    const fs = require("fs"), path = require("path");
    const [transcript, plumbing] = process.argv.slice(1);
    const types = fs.readdirSync(plumbing).filter((f) => f.endsWith(".md")).map((f) => fs.readFileSync(path.join(plumbing, f), "utf8"))
      .filter((text) => /^enabled: true$/m.test(text) && !/^builtIn: true$/m.test(text))
      .map((text) => /^id: *(\S+)/m.exec(text)?.[1]).filter(Boolean);
    const calls = new Map();
    const saved = new Set();
    for (const line of fs.readFileSync(transcript, "utf8").split("\n")) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
      for (const b of blocks) {
        if (b.type === "tool_use" && b.name === "mcp__plugin_dev-plumbing_dp__dp_write_items") calls.set(b.id, b.input?.type);
        if (b.type === "tool_result" && calls.has(b.tool_use_id) && !b.is_error) saved.add(calls.get(b.tool_use_id));
      }
    }
    console.log(types.filter((t) => !saved.has(t)).join(" "));
  ' "$t2" "$DEV_PLUMBING_HOME/plumbing")"; then
    echo "${missing:-none}"
    if [ -n "$missing" ]; then status=1; fi
  else
    echo "Couldn't read $t2 to check."
    status=1
  fi
  # The Whiteboard Defense, written in the second window. These are read from the transcript's JSON, not grepped: the
  # skill's own text, which the transcript carries, says "kind: whiteboard" too. A refused dp_whiteboard is fixed by
  # sending the whole defense again, so refusals are reported, not failed: the user script checks what was saved.
  echo "== The Whiteboard Defense, in round 2's window"
  node -e '
    const fs = require("fs");
    const DP = "mcp__plugin_dev-plumbing_dp__";
    const calls = new Map();
    const results = new Map();
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
      for (const b of blocks) {
        if (b.type === "tool_use") calls.set(b.id, { name: b.name, input: b.input ?? {}, main: entry.parent_tool_use_id === null });
        if (b.type === "tool_result") {
          const text = typeof b.content === "string" ? b.content : (Array.isArray(b.content) ? b.content : []).map((c) => c.text ?? "").join("");
          results.set(b.tool_use_id, { text, error: b.is_error === true });
        }
      }
    }
    const all = [...calls].map(([id, c]) => ({ ...c, result: results.get(id) }));
    const kindOf = (c) => { try { return JSON.parse(c.result?.text ?? "").kind; } catch { return null; } };
    const waits = all.filter((c) => c.main && c.name === DP + "dp_wait");
    const agents = all.filter((c) => c.main && c.name === "Agent" && c.input.subagent_type === "dev-plumbing:whiteboard");
    const saves = all.filter((c) => c.name === DP + "dp_whiteboard");
    const refused = saves.filter((c) => c.result?.error);
    console.log("dp_wait results that handed out the Whiteboard Defense (kind whiteboard): " + waits.filter((c) => kindOf(c) === "whiteboard").length);
    console.log("Whiteboard subagents started by the main window: " + agents.length + (agents.length ? " (model " + agents.map((c) => c.input.model ?? "not given").join(", ") + ")" : ""));
    console.log("dp_whiteboard calls: " + saves.length + ", refused: " + refused.length);
    for (const c of refused) console.log("  refused: " + c.result.text.replace(/\s+/g, " ").slice(0, 300));
    console.log("JSON characters in the last dp_whiteboard defense: " + (saves.length ? JSON.stringify(saves.at(-1).input.defense ?? null).length : 0));
    const packs = all.filter((c) => c.name === DP + "dp_context" && c.input.whiteboard === true);
    console.log("JSON characters in the whiteboard dp_context result: " + (packs.length ? (packs.at(-1).result?.text ?? "").length : 0));
    console.log("dp_wait calls from the main window with finished.whiteboard: " + waits.filter((c) => c.input.finished?.whiteboard).length);
    // A Defense thread reply that tried to change the draft, add another kind of item, or resolve another item.
    const defenseRefused = all.filter((c) => c.name === DP + "dp_reply" && c.result?.error && c.result.text.includes("A Defense thread can"));
    console.log("dp_reply refusals on a Defense thread: " + defenseRefused.length);
    for (const c of defenseRefused) console.log("  refused: " + c.result.text.replace(/\s+/g, " ").slice(0, 300));
  ' "$t2" || echo "Couldn't read $t2 to count them."
fi
exit "$status"
