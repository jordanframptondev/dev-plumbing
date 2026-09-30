# Plan 1: Spike and Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that plugin subagents can call a plugin's MCP tools, then build dev-plumbing's foundations. That means the pnpm monorepo, the `~/.dev-plumbing` config (settings, agents, repo profiles, plumbing rules files, README), the plumbing project store, the local service on `localhost:4545`, the `dev-plumbing` CLI with setup and a start-at-login item, and the web app shell with the Ink wash theme (App home, Project home, Settings, Plumbing rules), in light and dark mode and in one column on phones.

**Architecture:** Everything is TypeScript on Node 22 in a pnpm workspace:
- `packages/core`: schemas, config, project store and demo data. It's shared, and the web app imports only its pure `schemas` entry.
- `packages/service`: a Hono HTTP server. It's the only thing that writes files, serves the API and the built web app, and binds 127.0.0.1.
- `packages/cli`: the `dev-plumbing` command.
- `packages/web`: React 19, Vite, Tailwind v4, TanStack Router and TanStack Query.

Config and plumbing projects are plain JSON and Markdown files; there's no database. Claude is not involved yet. This plan only builds what Plan 2 (the Claude loop) plugs into.

**Tech Stack:** TypeScript 5.9, Node 22, pnpm 10 workspaces, Zod 3.25, gray-matter, Hono 4 + @hono/node-server, commander 14, React 19, Vite 7, Tailwind CSS 4, TanStack Router 1 and Query 5, react-markdown 10, Vitest 3, Playwright 1, tsup 8, @modelcontextprotocol/sdk (spike only).

**Spec:** `SPEC.md` (repo root). Read §4–§10, §13 and §16–§18 before starting.

## Global Constraints

- Node `>=22.12`, pnpm `10.x`, TypeScript `strict`, ESM everywhere (`"type": "module"`).
- The public repo stays generic: no refill-co (or any real company) names, paths, schema or examples in code, tests, fixtures or docs. Examples use the made-up "Acme" app.
- Config folder: `~/.dev-plumbing/`, overridable with the `DEV_PLUMBING_HOME` env var. Files: `README.md`, `settings.json`, `agents.json`, `repos/<repo>.json`, `plumbing/<type>.md`, `outputs/finalize.md`, `outputs/whiteboard-defense.md`, `run/service.json`.
- `settings.json` defaults, exactly: `port` 4545, `projectsFolder` `"~/dev-plumbing-projects"`, `startAtLogin` true, `openBrowserOnImport` true, `autoApplySmallEdits` true, `homePageSize` 10, `theme` `"system"`.
- `agents.json` defaults, exactly: `maxParallel` 4, `groupLinkedThreads` true, `models.repoSetup` "sonnet", `models.importer` "sonnet", `models.thread` "sonnet", `models.finalizer` "opus", `models.whiteboard` "opus", `waitHeartbeatSeconds` 60.
- Never overwrite a user's config file except through an explicit **Reset to default**. Setup only adds missing files.
- Every file the service or CLI writes is written atomically: write a temp file, then rename.
- The service binds `127.0.0.1` only. It checks the Host header on every request. API calls need the run-file token or a same-origin browser request (§15.6).
- Words used in the UI: "plumbing project", "plumbing type", "repo profile". Copy is plain, in sentence case.
- Ink wash theme (§16), with exact token values. Light mode: white `#FFFFFF` canvas. Dark mode: `#1E1E1D`. No paper/cream colour anywhere.
  - Colour is only ever dots, text and thin lines. No tinted info boxes, gradients, glows, purple or indigo, emoji or "AI" badges.
  - Tailwind's default colour palette is switched off.
  - One primary (ink) button per screen.
- Under 768 px wide, every screen is one column, with no sideways scrolling. On the project home, the main action is pinned at the bottom.

## Review Focus

These five situations aren't the main path, but they're the most likely to hurt someone using this. Each has a test in the task named.

1. **Running `dev-plumbing setup` again after editing your config.** Every edit must survive: setup only adds missing files and keeps your other settings. Tested in Task 5 ("never overwrites a file you edited") and Task 12 ("running setup twice keeps your edits").
2. **A hand-edited config file that's broken** (invalid JSON, a wrong type, an unknown key). The app must still start, use defaults for the broken parts, and list the problem on the Settings page. Tested in Task 2 (bad value falls back), Task 5 (invalid JSON) and Task 17 (e2e, broken settings file).
3. **A plumbing rules file with a broken header.** That type must drop out of every project and be listed on the Plumbing rules page with the reason. Saving a broken header from the editor is refused. Tested in Task 3, Task 5 (broken rules file skipped), Task 10 (PUT refused) and Task 18 (e2e).
4. **Port 4545 already used by another program, or a stale run file left by a crash.** `start` must explain the port problem, or start cleanly, rather than hanging or claiming success. Tested in Task 11 (port in use) and Task 12 (integration: stale run file, port taken).
5. **A half-written or corrupt plumbing project, and odd project paths** (`~`, spaces, the same folder reachable twice). The broken project is listed once, marked broken with the reason, and every other project still works. Tested in Task 6 (broken project; `~` and spaces; no duplicates) and Task 9 (API returns 422 for a broken project).

---

## File Structure

```
dev-plumbing/
  package.json  pnpm-workspace.yaml  tsconfig.base.json  .nvmrc
  vitest.config.ts               # unit tests for every package (projects)
  vitest.integration.config.ts   # *.integration.test.ts, run after `pnpm build`
  README.md
  spike/subagent-mcp/            # Task 1: throwaway spike + RESULTS.md
  defaults/                      # copied into ~/.dev-plumbing by setup
    settings.json  agents.json
    plumbing/{architecture,database,ui,flows,questions,concerns,ideas,phases,testing,security}.md
    outputs/finalize.md          # new
    outputs/whiteboard-defense.md  # already in the repo
  packages/
    core/src/
      schemas/                   # PURE (no node imports) — the web app imports these
        index.ts fields.ts settings.ts agents.ts repoProfile.ts plumbingType.ts project.ts views.ts
      index.ts                   # re-exports schemas + node modules below
      paths.ts atomic.ts rules.ts config.ts readme.ts runFile.ts loginItem.ts demo.ts
      store/projects.ts
    core/test/                   # node tests that touch the filesystem
    service/src/  context.ts security.ts static.ts app.ts listen.ts index.ts routes/{projects,config}.ts
    service/test/ helpers.ts security.test.ts static.test.ts projects.test.ts config.test.ts listen.test.ts
    cli/src/      index.ts setup.ts control.ts
    cli/test/     setup.test.ts service.integration.test.ts
    web/          index.html vite.config.ts vitest.config.ts playwright.config.ts
    web/src/      main.tsx router.tsx styles.css
                  theme/{tokens.css,theme.ts} api/client.ts lib/{useConfig.ts,time.ts}
                  components/{Button,StatusMark,GroupedList,Segmented,Switch,ProgressBar,PageMessage,inputClass}.tsx|ts
                  pages/{Root,AppHome,ProjectLayout,ProjectHeader,ProjectNav,InboxView,TypeView,DocumentView,SettingsPage,RulesPage,RuleEditor}.tsx
    web/e2e/      env.ts global-setup.ts global-teardown.ts *.spec.ts
```

---

### Task 1: Spike: can plugin subagents call the plugin's MCP tools?

A half-day experiment. It decides how Plan 2 builds the Claude loop (spec §18 step 1). It's not TDD. The deliverable is `RESULTS.md`, with evidence.

**Files:**
- Create: `spike/subagent-mcp/package.json`
- Create: `spike/subagent-mcp/.gitignore`
- Create: `spike/subagent-mcp/plugin/.claude-plugin/plugin.json`
- Create: `spike/subagent-mcp/plugin/.mcp.json`
- Create: `spike/subagent-mcp/plugin/server.mjs`
- Create: `spike/subagent-mcp/plugin/agents/spike-caller.md`
- Create: `spike/subagent-mcp/run.sh`
- Create: `spike/subagent-mcp/RESULTS.md`

**Interfaces:**
- Consumes: the `claude` CLI on PATH, logged in.
- Produces: `RESULTS.md` with a yes/no for each check and a decision for Plan 2.

- [ ] **Step 1: Create the spike package**

`spike/subagent-mcp/package.json`:
```json
{
  "name": "spike-subagent-mcp",
  "private": true,
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.17.0",
    "zod": "^3.25.0"
  }
}
```

`spike/subagent-mcp/.gitignore`:
```
node_modules/
spike.log
transcript-*.jsonl
```

`spike/subagent-mcp/plugin/.claude-plugin/plugin.json`:
```json
{ "name": "spike", "version": "0.0.1", "description": "Throwaway spike: can plugin subagents call plugin MCP tools?" }
```

`spike/subagent-mcp/plugin/.mcp.json`:
```json
{
  "mcpServers": {
    "spike": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server.mjs"],
      "env": { "SPIKE_LOG": "${CLAUDE_PLUGIN_ROOT}/../spike.log" },
      "timeout": 120000
    }
  }
}
```

- [ ] **Step 2: Write the MCP server that logs every call**

`spike/subagent-mcp/plugin/server.mjs`:
```js
import { appendFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const logFile = process.env.SPIKE_LOG ?? new URL('../spike.log', import.meta.url).pathname;
const log = (entry) => appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');

const server = new McpServer({ name: 'spike', version: '0.0.1' });

server.registerTool(
  'ping',
  { description: 'Echo a message back. Used to prove who can call this tool.', inputSchema: { message: z.string() } },
  async ({ message }, extra) => {
    log({ tool: 'ping', message, progressToken: extra._meta?.progressToken ?? null });
    return { content: [{ type: 'text', text: `pong: ${message}` }] };
  },
);

server.registerTool(
  'slow_ping',
  {
    description: 'Wait for the given number of seconds, sending a progress notification every 3 seconds, then echo the message.',
    inputSchema: { message: z.string(), seconds: z.number().int().min(1).max(120) },
  },
  async ({ message, seconds }, extra) => {
    const token = extra._meta?.progressToken;
    const steps = Math.ceil(seconds / 3);
    log({ tool: 'slow_ping', phase: 'start', message, seconds, progressToken: token ?? null });
    for (let i = 1; i <= steps; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (extra.signal.aborted) {
        log({ tool: 'slow_ping', phase: 'cancelled' });
        throw new Error('cancelled');
      }
      if (token !== undefined) {
        await extra.sendNotification({
          method: 'notifications/progress',
          params: { progressToken: token, progress: i, total: steps, message: `waiting ${i * 3}s` },
        });
      }
    }
    log({ tool: 'slow_ping', phase: 'done', message });
    return { content: [{ type: 'text', text: `slow pong: ${message}` }] };
  },
);

await server.connect(new StdioServerTransport());
log({ event: 'server-started', pid: process.pid });
```

- [ ] **Step 3: Write the plugin agent that holds a secret marker**

The main session never sees an agent's system prompt. So if `from-subagent-7f3a9c` appears in `spike.log`, the call must have come from the subagent.

`spike/subagent-mcp/plugin/agents/spike-caller.md`:
```markdown
---
name: spike-caller
description: Spike agent. Calls the spike plugin's ping tools with a secret marker. Use when asked to run the spike caller.
---

You are a spike test agent. Call the `ping` tool from the `spike` MCP server exactly once with the message `from-subagent-7f3a9c`. Then call the `slow_ping` tool once with the message `slow-from-subagent-7f3a9c` and `seconds` set to 9. Reply with the exact text each tool returned. Do nothing else.
```

- [ ] **Step 4: Write the runner script**

`spike/subagent-mcp/run.sh`:
```bash
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
```

Run: `chmod +x spike/subagent-mcp/run.sh`

- [ ] **Step 5: Run the spike**

Run: `spike/subagent-mcp/run.sh`

Expected, if subagents can call plugin tools:
- `spike.log` contains `"message":"from-subagent-7f3a9c"`, then a `slow_ping` line with `"phase":"done"`, then `"message":"from-general-subagent"`.
- The last section shows `mcp__…spike…__ping` counted at least twice.

If `--permission-mode bypassPermissions` is refused, rerun both `claude` commands with `--allowedTools "mcp__*" "Task" "Agent"` in its place.

- [ ] **Step 6: Record the results**

Write `spike/subagent-mcp/RESULTS.md`, filling every Result and Evidence cell from Step 5's output:
```markdown
# Spike: can plugin subagents call the plugin's MCP tools?

Date: 2026-MM-DD · Claude Code version: <output of `claude --version`>

| Check | Result | Evidence |
|---|---|---|
| Plugin agent (spike-caller) called `ping` | yes / no | `from-subagent-7f3a9c` in spike.log |
| Plugin agent called `slow_ping` and got the reply | yes / no | `slow_ping` phase `done` in spike.log |
| Claude Code sent a progress token | yes / no | `progressToken` value in spike.log |
| General-purpose subagent called `ping` | yes / no | `from-general-subagent` in spike.log |
| Tool name as seen by Claude | `mcp__…` | from the transcript |

## Decision for Plan 2

- **Both subagent checks passed:** thread subagents call `dp_context` and `dp_reply` directly.
- **Otherwise:** thread subagents return their reply as JSON to the main window, which calls `dp_reply` (spec §18 fallback).

Chosen: <one of the two>
```

- [ ] **Step 7: Commit**

```bash
git add spike/subagent-mcp
git commit -m "spike: check that plugin subagents can call plugin MCP tools"
```

---

### Task 2: Workspace scaffolding and the settings/agents field specs

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`, `vitest.config.ts`, `vitest.integration.config.ts`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `packages/core/src/schemas/fields.ts`, `packages/core/src/schemas/settings.ts`, `packages/core/src/schemas/agents.ts`, `packages/core/src/schemas/index.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/schemas/settings.test.ts`, `packages/core/src/schemas/agents.test.ts`

**Interfaces:**
- Produces, all from `@dev-plumbing/core/schemas` and also re-exported from `@dev-plumbing/core`:
  - `VERSION: string`
  - `type FieldSpec` (`key`, `label`, `description`, `kind`, `default`, plus `min`/`max`, `options` or `format`), `type FieldError = { key: string; message: string; unknown?: boolean }`
  - `flatten(obj: unknown): Record<string, unknown>`, `unflatten(flat): Record<string, unknown>`, `defaultsOf(fields)`, `parseFields(fields, input): { value; errors: FieldError[] }`
  - `type Settings`, `settingsFields`, `defaultSettings`, `parseSettings(input): { value: Settings; errors: FieldError[] }`
  - `type Model`, `modelOptions`, `type AgentsConfig`, `agentsFields`, `defaultAgents`, `parseAgents(input): { value: AgentsConfig; errors: FieldError[] }`

- [ ] **Step 1: Create the workspace files**

`package.json`:
```json
{
  "name": "dev-plumbing",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.16.1",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "build": "pnpm -r run build",
    "dev": "pnpm -r --parallel run dev",
    "typecheck": "pnpm -r run typecheck",
    "test": "vitest run",
    "test:integration": "pnpm build && vitest run --config vitest.integration.config.ts",
    "test:e2e": "pnpm build && pnpm --filter @dev-plumbing/web exec playwright test",
    "check": "pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
onlyBuiltDependencies:
  - esbuild
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

`.nvmrc`:
```
22
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { projects: ['packages/*'] } });
```

`vitest.integration.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.integration.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
```

`packages/core/package.json`:
```json
{
  "name": "@dev-plumbing/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schemas": "./src/schemas/index.ts"
  },
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" }
}
```

`packages/core/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'core',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
  },
});
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
pnpm add -Dw typescript@^5.9 vitest@^3.2 @types/node@^22 tsx@^4 tsup@^8
pnpm --filter @dev-plumbing/core add zod@^3.25 gray-matter@^4.0.3
```
Expected: `pnpm-lock.yaml` created and no errors.

- [ ] **Step 3: Write the failing tests**

`packages/core/src/schemas/settings.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings, settingsFields } from './settings';

describe('settings', () => {
  it('has the defaults from the spec', () => {
    expect(defaultSettings).toEqual({
      port: 4545,
      projectsFolder: '~/dev-plumbing-projects',
      startAtLogin: true,
      openBrowserOnImport: true,
      autoApplySmallEdits: true,
      homePageSize: 10,
      theme: 'system',
    });
  });

  it('fills missing keys with defaults and reports nothing', () => {
    const r = parseSettings({ port: 5000 });
    expect(r.value.port).toBe(5000);
    expect(r.value.theme).toBe('system');
    expect(r.errors).toEqual([]);
  });

  it('falls back to the default for a bad value and reports it', () => {
    const r = parseSettings({ port: 'abc', theme: 'purple' });
    expect(r.value.port).toBe(4545);
    expect(r.value.theme).toBe('system');
    expect(r.errors.map((e) => e.key)).toEqual(['port', 'theme']);
    expect(r.errors[0].unknown).toBeUndefined();
  });

  it('refuses a port below 1024', () => {
    expect(parseSettings({ port: 80 }).errors[0].message).toMatch(/greater than or equal to 1024/);
  });

  it('reports unknown keys', () => {
    expect(parseSettings({ colour: 'red' }).errors).toEqual([{ key: 'colour', message: 'Unknown setting', unknown: true }]);
  });

  it('treats a non-object as all defaults', () => {
    expect(parseSettings(null).value).toEqual(defaultSettings);
    expect(parseSettings([1, 2]).value).toEqual(defaultSettings);
  });

  it('gives every field a label and a description', () => {
    for (const f of settingsFields) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(10);
    }
  });
});
```

`packages/core/src/schemas/agents.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultAgents, parseAgents } from './agents';

describe('agents', () => {
  it('has the defaults from the spec', () => {
    expect(defaultAgents).toEqual({
      maxParallel: 4,
      groupLinkedThreads: true,
      models: { repoSetup: 'sonnet', importer: 'sonnet', thread: 'sonnet', finalizer: 'opus', whiteboard: 'opus' },
      waitHeartbeatSeconds: 60,
    });
  });

  it('reads nested model settings and keeps the other defaults', () => {
    const r = parseAgents({ models: { thread: 'haiku' } });
    expect(r.value.models.thread).toBe('haiku');
    expect(r.value.models.finalizer).toBe('opus');
    expect(r.errors).toEqual([]);
  });

  it('rejects an unknown model', () => {
    const r = parseAgents({ models: { thread: 'gpt' } });
    expect(r.value.models.thread).toBe('sonnet');
    expect(r.errors[0].key).toBe('models.thread');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm vitest run packages/core/src/schemas`
Expected: FAIL. The imports can't resolve because `./settings` and `./agents` don't exist yet.

- [ ] **Step 5: Implement the field specs**

`packages/core/src/schemas/fields.ts`:
```ts
import { z } from 'zod';

type Base = { key: string; label: string; description: string };

export type FieldSpec =
  | (Base & { kind: 'string'; default: string; format?: 'path' })
  | (Base & { kind: 'number'; default: number; min: number; max: number })
  | (Base & { kind: 'boolean'; default: boolean })
  | (Base & { kind: 'enum'; default: string; options: readonly string[] });

export type FieldError = { key: string; message: string; unknown?: boolean };

function schemaFor(field: FieldSpec): z.ZodTypeAny {
  switch (field.kind) {
    case 'string':
      return z.string().trim().min(1);
    case 'number':
      return z.number().int().min(field.min).max(field.max);
    case 'boolean':
      return z.boolean();
    case 'enum':
      return z.enum(field.options as [string, ...string[]]);
  }
}

/** { models: { thread: 'x' } } -> { 'models.thread': 'x' }. Non-objects give {}. */
export function flatten(obj: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

export function unflatten(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let node = out;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) node[part] = value;
      else node = (node[part] ??= {}) as Record<string, unknown>;
    });
  }
  return out;
}

export function defaultsOf(fields: readonly FieldSpec[]): Record<string, unknown> {
  return unflatten(Object.fromEntries(fields.map((f) => [f.key, f.default])));
}

/**
 * Checks each field on its own. A missing field quietly takes its default.
 * A bad field takes its default and is reported. Unknown keys are reported and dropped.
 */
export function parseFields(
  fields: readonly FieldSpec[],
  input: unknown,
): { value: Record<string, unknown>; errors: FieldError[] } {
  const flat = flatten(input);
  const errors: FieldError[] = [];
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.key in flat)) {
      result[field.key] = field.default;
      continue;
    }
    const parsed = schemaFor(field).safeParse(flat[field.key]);
    if (parsed.success) result[field.key] = parsed.data;
    else {
      result[field.key] = field.default;
      errors.push({ key: field.key, message: parsed.error.issues[0]?.message ?? 'Invalid value' });
    }
  }
  const known = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(flat)) if (!known.has(key)) errors.push({ key, message: 'Unknown setting', unknown: true });
  return { value: unflatten(result), errors };
}
```

`packages/core/src/schemas/settings.ts`:
```ts
import { defaultsOf, parseFields, type FieldError, type FieldSpec } from './fields';

export type Settings = {
  port: number;
  projectsFolder: string;
  startAtLogin: boolean;
  openBrowserOnImport: boolean;
  autoApplySmallEdits: boolean;
  homePageSize: number;
  theme: 'light' | 'dark' | 'system';
};

export const settingsFields = [
  { key: 'port', label: 'Port', kind: 'number', default: 4545, min: 1024, max: 65535, description: 'The port the app and service use, on localhost only. A new port needs a restart.' },
  { key: 'projectsFolder', label: 'Projects folder', kind: 'string', format: 'path', default: '~/dev-plumbing-projects', description: 'Where plumbing projects are stored. Each repo gets a subfolder, unless its repo profile sets its own folder.' },
  { key: 'startAtLogin', label: 'Start at login', kind: 'boolean', default: true, description: 'Start the service when you log in to your Mac.' },
  { key: 'openBrowserOnImport', label: 'Open the browser after import', kind: 'boolean', default: true, description: 'Open the plumbing project in your browser after /dev-plumbing imports a plan.' },
  { key: 'autoApplySmallEdits', label: 'Auto-apply small edits', kind: 'boolean', default: true, description: "Apply Claude's wording, typo and layout fixes immediately, each with Undo." },
  { key: 'homePageSize', label: 'Recent projects per page', kind: 'number', default: 10, min: 1, max: 100, description: 'How many recent plumbing projects the app home shows before Load more.' },
  { key: 'theme', label: 'Appearance', kind: 'enum', default: 'system', options: ['light', 'dark', 'system'], description: 'Light, dark, or follow the system setting.' },
] as const satisfies readonly FieldSpec[];

export const defaultSettings = defaultsOf(settingsFields) as Settings;

export function parseSettings(input: unknown): { value: Settings; errors: FieldError[] } {
  const r = parseFields(settingsFields, input);
  return { value: r.value as Settings, errors: r.errors };
}
```

`packages/core/src/schemas/agents.ts`:
```ts
import { defaultsOf, parseFields, type FieldError, type FieldSpec } from './fields';

export const modelOptions = ['haiku', 'sonnet', 'opus', 'fable'] as const;
export type Model = (typeof modelOptions)[number];

export type AgentsConfig = {
  maxParallel: number;
  groupLinkedThreads: boolean;
  models: { repoSetup: Model; importer: Model; thread: Model; finalizer: Model; whiteboard: Model };
  waitHeartbeatSeconds: number;
};

export const agentsFields = [
  { key: 'maxParallel', label: 'Subagents at once', kind: 'number', default: 4, min: 1, max: 16, description: 'The most subagents running at the same time.' },
  { key: 'groupLinkedThreads', label: 'Group linked threads', kind: 'boolean', default: true, description: "Send threads that share linked items to one subagent, so they can't contradict each other." },
  { key: 'models.repoSetup', label: 'Repo setup model', kind: 'enum', default: 'sonnet', options: modelOptions, description: 'Model for detecting a repo profile.' },
  { key: 'models.importer', label: 'Importer model', kind: 'enum', default: 'sonnet', options: modelOptions, description: 'Model for importing each plumbing type.' },
  { key: 'models.thread', label: 'Thread model', kind: 'enum', default: 'sonnet', options: modelOptions, description: 'Model for thread replies.' },
  { key: 'models.finalizer', label: 'Finalizer model', kind: 'enum', default: 'opus', options: modelOptions, description: 'Model for Finalize spec.' },
  { key: 'models.whiteboard', label: 'Whiteboard Defense model', kind: 'enum', default: 'opus', options: modelOptions, description: 'Model for Whiteboard Defense.' },
  { key: 'waitHeartbeatSeconds', label: 'Heartbeat (seconds)', kind: 'number', default: 60, min: 10, max: 600, description: 'How often the listening main window reports that it is still waiting.' },
] as const satisfies readonly FieldSpec[];

export const defaultAgents = defaultsOf(agentsFields) as AgentsConfig;

export function parseAgents(input: unknown): { value: AgentsConfig; errors: FieldError[] } {
  const r = parseFields(agentsFields, input);
  return { value: r.value as AgentsConfig, errors: r.errors };
}
```

`packages/core/src/schemas/index.ts`:
```ts
export const VERSION = '0.1.0';
export * from './fields';
export * from './settings';
export * from './agents';
```

`packages/core/src/index.ts`:
```ts
export * from './schemas';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run packages/core/src/schemas`
Expected: PASS (10 tests).

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @dev-plumbing/core typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .nvmrc vitest.config.ts vitest.integration.config.ts packages/core
git commit -m "feat(core): workspace scaffolding and settings/agents field specs"
```

---

### Task 3: Repo profiles and plumbing rules files

**Files:**
- Create: `packages/core/src/schemas/repoProfile.ts`, `packages/core/src/schemas/plumbingType.ts`, `packages/core/src/rules.ts`
- Modify: `packages/core/src/schemas/index.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/schemas/repoProfile.test.ts`, `packages/core/test/rules.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks except the package.
- Produces:
  - From `schemas`: `repoProfileSchema`, `type RepoProfile`, `repoProfileDocs: { key: string; description: string }[]`, `normalizeRemote(remote: string): string`, `screens`, `type Screen`, `plumbingTypeHeaderSchema`, `type PlumbingTypeHeader`, `type PlumbingType = PlumbingTypeHeader & { file: string; body: string; sections: Record<string, string> }`, `plumbingTypeHeaderDocs`, `newRulesFileTemplate(id: string, title: string, order: number): string`
  - From `@dev-plumbing/core` (node side): `type RulesFileResult`, `parseRulesFile(fileName: string, text: string): RulesFileResult`, `splitSections(body: string): Record<string, string>`, `resolveTypes(results: RulesFileResult[]): { types: PlumbingType[]; errors: { file: string; error: string }[] }`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/schemas/repoProfile.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { normalizeRemote, repoProfileSchema } from './repoProfile';

describe('repo profiles', () => {
  it('normalizes the three common remote forms to the same key', () => {
    expect(normalizeRemote('git@github.com:Acme/acme.git')).toBe('github.com/acme/acme');
    expect(normalizeRemote('https://github.com/Acme/acme.git')).toBe('github.com/acme/acme');
    expect(normalizeRemote('ssh://git@github.com/acme/acme')).toBe('github.com/acme/acme');
  });

  it('fills defaults for optional fields', () => {
    const p = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'] });
    expect(p.linkIntoClones).toEqual({ enabled: false, linkName: 'dev-plumbing' });
    expect(p.apps).toEqual([]);
    expect(p.sensitiveData).toEqual([]);
  });

  it('needs at least one remote to match', () => {
    expect(repoProfileSchema.safeParse({ name: 'acme', match: [] }).success).toBe(false);
  });
});
```

`packages/core/test/rules.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseRulesFile, resolveTypes, splitSections } from '../src/rules';
import { newRulesFileTemplate } from '../src/schemas';

const good = `---
id: database
title: Database
order: 2
screen: database
emptyMessage: This plan doesn't change the database.
---

## What to look for
- Tables.

## Rules
- Compare with the schema.
`;

describe('rules files', () => {
  it('parses a good file and fills header defaults', () => {
    const r = parseRulesFile('database.md', good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.type).toMatchObject({ id: 'database', order: 2, screen: 'database', enabled: true, timeline: false, fields: [], answerPresets: [] });
    expect(r.type.sections.Rules).toBe('- Compare with the schema.');
  });

  it('rejects an id that does not match the file name', () => {
    const r = parseRulesFile('db.md', good);
    expect(r).toEqual({ ok: false, file: 'db.md', error: 'The id "database" must match the file name "db".' });
  });

  it('rejects a header with no screen', () => {
    const r = parseRulesFile('database.md', good.replace('screen: database\n', ''));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/screen/);
  });

  it('rejects broken YAML', () => {
    const r = parseRulesFile('database.md', '---\nid: [unclosed\n---\nbody');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^The header isn't valid YAML/);
  });

  it('rejects a file with no header', () => {
    expect(parseRulesFile('database.md', '# Just text').ok).toBe(false);
  });

  it('splits the body into sections', () => {
    expect(splitSections('intro\n## A\none\n\n## B\ntwo\nthree')).toEqual({ A: 'one', B: 'two\nthree' });
  });

  it('sorts types by order, then title, and collects errors', () => {
    const results = [
      parseRulesFile('database.md', good),
      parseRulesFile('architecture.md', good.replace('id: database', 'id: architecture').replace('order: 2', 'order: 1')),
      { ok: false as const, file: 'broken.md', error: 'bad' },
    ];
    const { types, errors } = resolveTypes(results);
    expect(types.map((t) => t.id)).toEqual(['architecture', 'database']);
    expect(errors).toEqual([{ file: 'broken.md', error: 'bad' }]);
  });

  it('builds a new-type template that parses', () => {
    const r = parseRulesFile('rollout.md', newRulesFileTemplate('rollout', 'Rollout', 11));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.type).toMatchObject({ id: 'rollout', title: 'Rollout', order: 11, screen: 'list' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/core/src/schemas/repoProfile.test.ts packages/core/test/rules.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`packages/core/src/schemas/repoProfile.ts`:
```ts
import { z } from 'zod';

export const repoProfileSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i, 'Use letters, numbers, dots, dashes or underscores'),
  match: z.array(z.string().min(1)).min(1, 'Add at least one git remote'),
  projectsFolder: z.string().min(1).optional(),
  linkIntoClones: z
    .object({ enabled: z.boolean(), linkName: z.string().min(1) })
    .default({ enabled: false, linkName: 'dev-plumbing' }),
  planFolders: z.array(z.string()).default([]),
  schema: z.object({ type: z.enum(['prisma', 'sql', 'other']), path: z.string().min(1) }).optional(),
  conventions: z.array(z.string()).default([]),
  apps: z
    .array(z.object({ name: z.string().min(1), path: z.string().min(1), kitFiles: z.array(z.string()).default([]) }))
    .default([]),
  sensitiveData: z.array(z.string()).default([]),
});

export type RepoProfile = z.infer<typeof repoProfileSchema>;

export const repoProfileDocs: { key: string; description: string }[] = [
  { key: 'name', description: 'Short name for the repo, also the file name.' },
  { key: 'match', description: 'Git remotes that identify this repo, e.g. github.com/acme/acme. Every clone with one of these remotes uses this profile.' },
  { key: 'projectsFolder', description: 'Optional. Store this repo\'s plumbing projects here instead of in settings.projectsFolder.' },
  { key: 'linkIntoClones', description: 'When enabled, a link named linkName pointing at the projects folder is added to every clone, and hidden from git.' },
  { key: 'planFolders', description: 'Where plans usually live in the repo. Used by the file picker.' },
  { key: 'schema', description: 'The database schema file, e.g. { "type": "prisma", "path": "packages/db/prisma/schema.prisma" }.' },
  { key: 'conventions', description: 'Plain-English rules the subagents must follow, e.g. "Ids use uuid()".' },
  { key: 'apps', description: 'Apps in the repo, each with the CSS files that make up its design kit.' },
  { key: 'sensitiveData', description: 'Tags such as PII or payments. They raise the Whiteboard Defense level and security checks.' },
];

/** git@host:owner/repo.git, https://host/owner/repo(.git), ssh://git@host/owner/repo -> host/owner/repo (lowercase). */
export function normalizeRemote(remote: string): string {
  const r = remote.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const scp = /^[\w.-]+@([^:/]+):(.+)$/.exec(r);
  if (scp) return `${scp[1]}/${scp[2]}`.toLowerCase();
  try {
    const u = new URL(r);
    return `${u.hostname}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return r.toLowerCase();
  }
}
```

`packages/core/src/schemas/plumbingType.ts`:
```ts
import { z } from 'zod';

export const screens = ['diagram', 'database', 'mockups', 'flows', 'list'] as const;
export type Screen = (typeof screens)[number];

export const plumbingTypeHeaderSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'use lowercase letters, numbers and dashes, starting with a letter'),
  title: z.string().min(1),
  order: z.number().int(),
  screen: z.enum(screens),
  emptyMessage: z.string().min(1),
  fields: z.array(z.string()).default([]),
  answerPresets: z.array(z.string()).default([]),
  timeline: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export type PlumbingTypeHeader = z.infer<typeof plumbingTypeHeaderSchema>;
export type PlumbingType = PlumbingTypeHeader & { file: string; body: string; sections: Record<string, string> };

export const plumbingTypeHeaderDocs: { key: string; description: string }[] = [
  { key: 'id', description: 'Lowercase name, the same as the file name without .md.' },
  { key: 'title', description: 'The name shown in the sidebar.' },
  { key: 'order', description: 'Position in the sidebar. Lower comes first.' },
  { key: 'screen', description: 'Which screen draws it: diagram, database, mockups, flows or list.' },
  { key: 'emptyMessage', description: 'Shown when a plan has nothing for this type.' },
  { key: 'fields', description: 'Extra fields for list screens, e.g. [severity, likelihood].' },
  { key: 'answerPresets', description: "Standard answer choices, e.g. [\"Accept Claude's fix\", \"Accept the risk\"]." },
  { key: 'timeline', description: 'List screens only: show a timeline strip (used by Phases).' },
  { key: 'enabled', description: 'Set to false to hide this type without deleting it.' },
];

export function newRulesFileTemplate(id: string, title: string, order: number): string {
  return `---
id: ${id}
title: ${JSON.stringify(title)}
order: ${order}
screen: list
emptyMessage: ${JSON.stringify(`This plan has nothing for ${title}.`)}
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- Describe what the importer should find in a plan for this type.

## Rules
- Describe how Claude should write and discuss items of this type.

## Done when
- Describe when this type is fully plumbed.

## Always ask
- A question worth asking about every plan.
`;
}
```

`packages/core/src/rules.ts`:
```ts
import matter from 'gray-matter';
import { plumbingTypeHeaderSchema, type PlumbingType } from './schemas';

export type RulesFileResult = { ok: true; type: PlumbingType } | { ok: false; file: string; error: string };

export function splitSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let current: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (current) sections[current] = lines.join('\n').trim();
  };
  for (const line of body.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      current = heading[1];
      lines = [];
    } else if (current) lines.push(line);
  }
  flush();
  return sections;
}

export function parseRulesFile(fileName: string, text: string): RulesFileResult {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(text);
  } catch (e) {
    return { ok: false, file: fileName, error: `The header isn't valid YAML: ${(e as Error).message.split('\n')[0]}` };
  }
  const header = plumbingTypeHeaderSchema.safeParse(parsed.data);
  if (!header.success) {
    const issue = header.error.issues[0];
    const field = issue?.path.join('.') || 'header';
    return { ok: false, file: fileName, error: `Header field "${field}": ${issue?.message ?? 'invalid'}.` };
  }
  const expectedId = fileName.replace(/\.md$/, '');
  if (header.data.id !== expectedId) {
    return { ok: false, file: fileName, error: `The id "${header.data.id}" must match the file name "${expectedId}".` };
  }
  return { ok: true, type: { ...header.data, file: fileName, body: parsed.content, sections: splitSections(parsed.content) } };
}

export function resolveTypes(results: RulesFileResult[]): { types: PlumbingType[]; errors: { file: string; error: string }[] } {
  const types: PlumbingType[] = [];
  const errors: { file: string; error: string }[] = [];
  for (const r of results) {
    if (r.ok) types.push(r.type);
    else errors.push({ file: r.file, error: r.error });
  }
  types.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return { types, errors };
}
```

Append to `packages/core/src/schemas/index.ts`:
```ts
export * from './repoProfile';
export * from './plumbingType';
```

Append to `packages/core/src/index.ts`:
```ts
export * from './rules';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): repo profile schema and plumbing rules file parser"
```

---

### Task 4: Default config files

**Files:**
- Create: `defaults/settings.json`, `defaults/agents.json`
- Create: `defaults/plumbing/architecture.md`, `database.md`, `ui.md`, `flows.md`, `questions.md`, `concerns.md`, `ideas.md`, `phases.md`, `testing.md`, `security.md`
- Create: `defaults/outputs/finalize.md` (`defaults/outputs/whiteboard-defense.md` already exists; don't change it)
- Test: `packages/core/test/defaults.test.ts`

**Interfaces:**
- Consumes: `parseRulesFile`, `resolveTypes`, `defaultSettings`, `defaultAgents` (Tasks 2–3).
- Produces: the `defaults/` folder that Task 5's `installDefaults` copies.

- [ ] **Step 1: Write the failing test**

`packages/core/test/defaults.test.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRulesFile, resolveTypes } from '../src/rules';
import { defaultAgents, defaultSettings } from '../src/schemas';

const defaults = path.resolve(import.meta.dirname, '../../../defaults');
const read = (rel: string) => fs.readFileSync(path.join(defaults, rel), 'utf8');

describe('shipped defaults', () => {
  it('settings.json matches the code defaults', () => {
    expect(JSON.parse(read('settings.json'))).toEqual(defaultSettings);
  });

  it('agents.json matches the code defaults', () => {
    expect(JSON.parse(read('agents.json'))).toEqual(defaultAgents);
  });

  it('ships the ten plumbing types from the spec, all valid', () => {
    const files = fs.readdirSync(path.join(defaults, 'plumbing')).filter((f) => f.endsWith('.md'));
    const results = files.map((f) => parseRulesFile(f, read(`plumbing/${f}`)));
    expect(results.filter((r) => !r.ok)).toEqual([]);
    const { types } = resolveTypes(results);
    expect(types.map((t) => [t.id, t.screen])).toEqual([
      ['architecture', 'diagram'],
      ['database', 'database'],
      ['ui', 'mockups'],
      ['flows', 'flows'],
      ['questions', 'list'],
      ['concerns', 'list'],
      ['ideas', 'list'],
      ['phases', 'list'],
      ['testing', 'list'],
      ['security', 'list'],
    ]);
    expect(new Set(types.map((t) => t.order)).size).toBe(10);
    for (const t of types) {
      for (const s of ['What to look for', 'Rules', 'Done when', 'Always ask']) {
        expect(t.sections[s], `${t.id} is missing "${s}"`).toBeTruthy();
      }
    }
  });

  it('gives lists their extras', () => {
    const type = (id: string) => {
      const r = parseRulesFile(`${id}.md`, read(`plumbing/${id}.md`));
      if (!r.ok) throw new Error(r.error);
      return r.type;
    };
    expect(type('phases').timeline).toBe(true);
    expect(type('questions').fields).toEqual(['blocking', 'default']);
    expect(type('concerns').answerPresets).toEqual(["Accept Claude's fix", 'Accept the risk']);
    expect(type('ideas').answerPresets).toEqual(['Add to scope', 'Park for later', 'Drop']);
  });

  it('ships both output rules files', () => {
    expect(read('outputs/finalize.md')).toMatch(/Notes for the implementer/);
    expect(read('outputs/whiteboard-defense.md')).toMatch(/If you ship it, you should be able to explain it/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/core/test/defaults.test.ts`
Expected: FAIL (ENOENT for `defaults/settings.json`).

- [ ] **Step 3: Write the defaults**

`defaults/settings.json`:
```json
{
  "port": 4545,
  "projectsFolder": "~/dev-plumbing-projects",
  "startAtLogin": true,
  "openBrowserOnImport": true,
  "autoApplySmallEdits": true,
  "homePageSize": 10,
  "theme": "system"
}
```

`defaults/agents.json`:
```json
{
  "maxParallel": 4,
  "groupLinkedThreads": true,
  "models": {
    "repoSetup": "sonnet",
    "importer": "sonnet",
    "thread": "sonnet",
    "finalizer": "opus",
    "whiteboard": "opus"
  },
  "waitHeartbeatSeconds": 60
}
```

`defaults/plumbing/architecture.md`:
```markdown
---
id: architecture
title: Architecture
order: 1
screen: diagram
emptyMessage: This plan doesn't change how the system is put together.
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- Apps, packages, services, jobs and external systems the plan adds, changes or relies on.
- How requests and data move between them.

## Rules
- Describe diagrams as data: nodes, groups and edges. Never draw.
- Tie every node to a real file, folder or symbol when one exists, and mark its status: new, changed, unchanged or external.
- Group nodes by app or package.
- Start with a system view. Add a data-flow view only when data moves in an interesting way.
- Don't invent components the plan doesn't need.

## Done when
- Every part of the system the plan touches appears in a diagram with its status.
- Every node that exists in the code has a checked code reference.

## Always ask
- Is there a simpler shape that does the same job?
```

`defaults/plumbing/database.md`:
```markdown
---
id: database
title: Database
order: 2
screen: database
emptyMessage: This plan doesn't change the database.
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- New, changed or removed tables, fields, indexes, enums and relations.
- Data that must be backfilled or migrated.

## Rules
- Compare every change with the schema file in the repo profile.
- New names follow the repo profile's conventions.
- Every backfill, destructive change and data-consent risk goes in the migration panel.
- One item per table touched.

## Done when
- Every touched table has a diff card with an exact schema diff.
- The migration panel says how to roll back.

## Always ask
- Can this change be undone without losing data?
```

`defaults/plumbing/ui.md`:
```markdown
---
id: ui
title: UI changes
order: 3
screen: mockups
emptyMessage: This plan doesn't change any screens.
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- New screens, and changes to existing screens, cards, forms and states.
- Where each one lives: app, route and component files.

## Rules
- One item per screen or distinct piece of UI.
- Build mockups with the app's design kit from the repo profile, so they look like the real app.
- Write only the page's body markup; the app adds the kit.
- Write a Before mockup from the current component whenever the screen already exists.
- Label every mockup with its app, route and files.

## Done when
- Every screen the plan changes has an After mockup, and existing screens have a Before.
- Empty, loading and error states are covered where the plan implies them.

## Always ask
- What does this look like on a phone?
```

`defaults/plumbing/flows.md`:
```markdown
---
id: flows
title: Flows
order: 4
screen: flows
emptyMessage: This plan doesn't add or change any user or system flows.
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- Journeys a person takes through the product.
- Sequences of calls between parts of the system, including jobs and external services.

## Rules
- Tag each flow user, system or both.
- User flows are steps with the screen shown at each step. Reuse the UI mockups.
- System flows are steps between lanes that map to real code parts.
- Number the steps so both views of a flow line up.
- Include the failure path when a step can fail.

## Done when
- Every flow in the plan is described step by step.
- Each step that touches the system says what the system does.

## Always ask
- What happens if this step fails halfway?
```

`defaults/plumbing/questions.md`:
```markdown
---
id: questions
title: Questions
order: 5
screen: list
emptyMessage: The plan leaves nothing to decide.
fields: [blocking, default]
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- Decisions the plan leaves open, marks as to be decided, or makes without saying so.

## Rules
- One question per item, asked plainly.
- Offer two to four concrete options, and recommend one when you have a view.
- Mark a question blocking when the plan can't be finalized without an answer.
- Give every non-blocking question a default, and write the plan as if the default was chosen.

## Done when
- No open decision is hidden in prose.
- Every blocking question has an answer.

## Always ask
- What would change if the answer were different?
```

`defaults/plumbing/concerns.md`:
```markdown
---
id: concerns
title: Concerns
order: 6
screen: list
emptyMessage: No concerns were found in this plan.
fields: [severity, likelihood]
answerPresets: ["Accept Claude's fix", "Accept the risk"]
timeline: false
enabled: true
---

## What to look for
- Risks, weak spots and things that could go wrong in production.

## Rules
- One concern per item, with a severity (low, medium or high) and a likelihood (unlikely, possible or likely).
- Propose a concrete fix for each concern.
- Don't invent concerns to fill the list.

## Done when
- Each concern is fixed in the plan or accepted as a known risk.

## Always ask
- How would we notice this in production?
```

`defaults/plumbing/ideas.md`:
```markdown
---
id: ideas
title: Ideas
order: 7
screen: list
emptyMessage: No extra ideas came up for this plan.
fields: [effort]
answerPresets: ["Add to scope", "Park for later", "Drop"]
timeline: false
enabled: true
---

## What to look for
- Optional improvements the plan mentions or makes easy.

## Rules
- One idea per item, with an effort of S, M or L.
- Keep ideas out of scope unless they're added to it.
- Parked ideas can be placed in a later phase.

## Done when
- Every idea is added to scope, parked or dropped.

## Always ask
- Is this worth doing now, or later?
```

`defaults/plumbing/phases.md`:
```markdown
---
id: phases
title: Phases & milestones
order: 8
screen: list
emptyMessage: This plan doesn't need phases.
fields: []
answerPresets: []
timeline: true
enabled: true
---

## What to look for
- A sensible order to build and ship the work.

## Rules
- Each phase has a goal, the items it includes, and "done when" criteria.
- No task lists. The implementation planner writes tasks.
- Make each phase shippable on its own when possible.

## Done when
- Every in-scope item belongs to a phase.
- Every phase has exit criteria.

## Always ask
- What's the smallest first phase that's useful?
```

`defaults/plumbing/testing.md`:
```markdown
---
id: testing
title: Testing & rollout
order: 9
screen: list
emptyMessage: This plan doesn't need special testing or rollout steps.
fields: [tags]
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- How the work will be tested, released behind flags, and rolled back.

## Rules
- Say what each test level proves: unit, integration and end-to-end.
- Name the feature flags and who they're on for.
- Describe how to roll back code and data.
- Tag items FLAG, ROLLBACK, MIGRATION or E2E where they fit.

## Done when
- Every feature has a way to be tested.
- Every release step has a way back.

## Always ask
- What does a green test suite not prove here?
```

`defaults/plumbing/security.md`:
```markdown
---
id: security
title: Security & permissions
order: 10
screen: list
emptyMessage: This plan doesn't change roles, permissions or how personal data is handled.
fields: [tags]
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- Who can do what, sensitive data, and how the feature behaves when misused.

## Rules
- Check authentication and authorization separately.
- Name every piece of sensitive data and where it goes, using the repo profile's sensitiveData tags.
- Consider changed IDs, repeated requests and direct API calls.
- Tag items AUTH, PII, PAYMENTS or ABUSE where they fit.

## Done when
- Every new action says who may perform it and where that is enforced.

## Always ask
- What happens if someone calls this directly with someone else's ID?
```

`defaults/outputs/finalize.md`:
```markdown
# Finalize spec rules

Turn the draft into the final document an implementing AI will build from. Follow this structure and these rules.

## Structure

1. **Title and summary.** One paragraph.
2. **Goals and non-goals.**
3. **Decisions.** Each with the decision, why, and the alternatives rejected. Flag decisions that used a default.
4. **Architecture.** A Mermaid flowchart generated from the diagram data, and what each component does.
5. **Data model.** Exact schema diff blocks, the migration, backfill and rollback.
6. **UI changes.** Per screen: where it lives (app, route, files), what changes, and a link to its mockup HTML in `<name>.assets/`.
7. **Flows.** A Mermaid sequence diagram per system flow, and numbered steps per user flow.
8. **Interfaces.** APIs, jobs, events and integrations.
9. **Security and permissions.**
10. **Testing.** The strategy, plus acceptance criteria per feature in Given / When / Then form.
11. **Rollout and rollback.**
12. **Phases and milestones.** Each phase with its exit criteria. No tasks.
13. **Notes for the implementer.** Files likely to change, the repo profile's conventions, things not to do, and assumptions made.
14. **Open items.** Non-blocking only, each with the default used.

## Rules

- Use only what's in the draft, the items, the threads and the decisions. Never invent behaviour.
- Every accepted decision appears in the section it affects.
- Generate Mermaid from the diagram data. Don't draw diagrams by hand.
- Write for an AI that hasn't seen any of the discussion: be explicit, and name files and conventions.
- Leave out a section that doesn't apply, with one line saying why.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/core/test/defaults.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add defaults packages/core/test/defaults.test.ts
git commit -m "feat: default settings, agents, ten plumbing rules files and Finalize rules"
```

---

### Task 5: The config folder (paths, atomic writes, install, load, README)

**Files:**
- Create: `packages/core/src/paths.ts`, `packages/core/src/atomic.ts`, `packages/core/src/config.ts`, `packages/core/src/readme.ts`
- Create: `packages/core/src/schemas/views.ts` (only `ConfigProblem` and `RuleSummary` in this task. Task 6 adds the rest.)
- Modify: `packages/core/src/schemas/index.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/paths.test.ts`, `packages/core/test/config.test.ts`, `packages/core/test/readme.test.ts`

**Interfaces:**
- Consumes: `parseSettings`, `parseAgents`, `settingsFields`, `agentsFields`, `repoProfileSchema`, `parseRulesFile`, `resolveTypes`, `repoProfileDocs`, `plumbingTypeHeaderDocs`.
- Produces:
  - From `schemas`: `type ConfigProblem = { file: string; key?: string; message: string }`, `type RuleSummary = { file: string; id: string; title: string; order: number; screen: Screen; enabled: boolean }`
  - Node side:
    - `configDir(env?): string`, `expandHome(p: string, home?: string): string`
    - `writeFileAtomic(file, data, mode?)`, `writeJsonAtomic(file, value)`
    - `type LoadedConfig = { dir; settings: Settings; agents: AgentsConfig; repos: RepoProfile[]; types: PlumbingType[]; outputs: string[]; problems: ConfigProblem[] }`, `loadConfig(dir): Promise<LoadedConfig>`
    - `installDefaults({ configDir, defaultsDir }): Promise<{ created: string[]; kept: string[] }>`
    - `resetToDefault({ configDir, defaultsDir, file })`
    - `updateSettingsFile(dir, patch: Partial<Settings>): Promise<Settings>`
    - `renderReadme(): string`, `writeReadme(dir): Promise<string>`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/paths.test.ts`:
```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configDir, expandHome } from '../src/paths';

describe('paths', () => {
  it('expands ~ and keeps spaces', () => {
    expect(expandHome('~/my projects', '/Users/a')).toBe('/Users/a/my projects');
    expect(expandHome('~', '/Users/a')).toBe('/Users/a');
  });

  it('makes relative paths absolute and leaves absolute paths alone', () => {
    expect(expandHome('/tmp/x', '/Users/a')).toBe('/tmp/x');
    expect(path.isAbsolute(expandHome('rel/x', '/Users/a'))).toBe(true);
  });

  it('uses DEV_PLUMBING_HOME when set', () => {
    expect(configDir({ DEV_PLUMBING_HOME: '/tmp/dp' })).toBe('/tmp/dp');
    expect(configDir({})).toMatch(/\.dev-plumbing$/);
  });
});
```

`packages/core/test/config.test.ts`:
```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { installDefaults, loadConfig, resetToDefault, updateSettingsFile } from '../src/config';
import { defaultSettings } from '../src/schemas';

const defaultsDir = path.resolve(import.meta.dirname, '../../../defaults');
let dir: string;
const write = (rel: string, text: string) => fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true }).then(() => fs.writeFile(path.join(dir, rel), text));
const read = (rel: string) => fs.readFile(path.join(dir, rel), 'utf8');

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-config-'));
});

describe('config folder', () => {
  it('installs every default file into an empty folder', async () => {
    const r = await installDefaults({ configDir: dir, defaultsDir });
    expect(r.created).toContain('settings.json');
    expect(r.created).toContain(path.join('plumbing', 'database.md'));
    expect(r.created).toContain(path.join('outputs', 'whiteboard-defense.md'));
    expect(r.kept).toEqual([]);
  });

  it('never overwrites a file you edited (setup run twice)', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('plumbing/database.md', 'MY EDIT');
    const r = await installDefaults({ configDir: dir, defaultsDir });
    expect(r.created).toEqual([]);
    expect(await read('plumbing/database.md')).toBe('MY EDIT');
  });

  it('loads the defaults with no problems', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    const c = await loadConfig(dir);
    expect(c.problems).toEqual([]);
    expect(c.types).toHaveLength(10);
    expect(c.settings).toEqual(defaultSettings);
    expect(c.outputs).toEqual(['finalize.md', 'whiteboard-defense.md']);
  });

  it('works on an empty folder', async () => {
    const c = await loadConfig(dir);
    expect(c.settings).toEqual(defaultSettings);
    expect(c.types).toEqual([]);
    expect(c.problems).toEqual([]);
  });

  it('keeps working when settings.json is not valid JSON', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('settings.json', '{ "port": ');
    const c = await loadConfig(dir);
    expect(c.settings).toEqual(defaultSettings);
    expect(c.problems).toHaveLength(1);
    expect(c.problems[0].file).toBe('settings.json');
    expect(c.problems[0].message).toMatch(/isn't valid JSON/);
  });

  it('explains a bad value and the default it uses instead', async () => {
    await write('settings.json', JSON.stringify({ port: 80, colour: 'red' }));
    const c = await loadConfig(dir);
    expect(c.settings.port).toBe(4545);
    expect(c.problems).toEqual([
      { file: 'settings.json', key: 'port', message: 'Number must be greater than or equal to 1024. Using the default (4545).' },
      { file: 'settings.json', key: 'colour', message: 'Unknown setting. It is ignored.' },
    ]);
  });

  it('skips a broken rules file but keeps the others', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('plumbing/database.md', '---\nid: database\n---\nno screen');
    const c = await loadConfig(dir);
    expect(c.types.map((t) => t.id)).not.toContain('database');
    expect(c.types).toHaveLength(9);
    expect(c.problems).toEqual([expect.objectContaining({ file: 'plumbing/database.md' })]);
  });

  it('reads repo profiles and reports broken or duplicate ones', async () => {
    await write('repos/acme.json', JSON.stringify({ name: 'acme', match: ['github.com/acme/acme'] }));
    await write('repos/copy.json', JSON.stringify({ name: 'acme', match: ['github.com/acme/other'] }));
    await write('repos/bad.json', JSON.stringify({ name: 'bad', match: [] }));
    const c = await loadConfig(dir);
    expect(c.repos.map((r) => r.name)).toEqual(['acme']);
    expect(c.problems.map((p) => p.file).sort()).toEqual(['repos/bad.json', 'repos/copy.json']);
  });

  it('resets one file to its default and refuses paths outside the folder', async () => {
    await installDefaults({ configDir: dir, defaultsDir });
    await write('plumbing/ideas.md', 'EDIT');
    await resetToDefault({ configDir: dir, defaultsDir, file: 'plumbing/ideas.md' });
    expect(await read('plumbing/ideas.md')).toMatch(/^---\nid: ideas/);
    await expect(resetToDefault({ configDir: dir, defaultsDir, file: '../etc/passwd' })).rejects.toThrow(/outside/);
    await expect(resetToDefault({ configDir: dir, defaultsDir, file: 'plumbing/mine.md' })).rejects.toThrow(/no default/);
  });

  it('updates settings without losing other values', async () => {
    await write('settings.json', JSON.stringify({ ...defaultSettings, homePageSize: 25 }));
    const s = await updateSettingsFile(dir, { projectsFolder: '~/x' });
    expect(s.homePageSize).toBe(25);
    expect(JSON.parse(await read('settings.json')).projectsFolder).toBe('~/x');
  });
});
```

`packages/core/test/readme.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { renderReadme } from '../src/readme';
import { agentsFields, plumbingTypeHeaderDocs, repoProfileDocs, settingsFields } from '../src/schemas';

describe('README', () => {
  const readme = renderReadme();
  it('explains every setting, agent setting and header field', () => {
    for (const f of [...settingsFields, ...agentsFields]) {
      expect(readme).toContain(`\`${f.key}\``);
      expect(readme).toContain(f.description);
    }
    for (const d of [...repoProfileDocs, ...plumbingTypeHeaderDocs]) expect(readme).toContain(`\`${d.key}\``);
  });
  it('says setup never overwrites your files', () => {
    expect(readme).toMatch(/never overwrites/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/core/test/paths.test.ts packages/core/test/config.test.ts packages/core/test/readme.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`packages/core/src/paths.ts`:
```ts
import os from 'node:os';
import path from 'node:path';

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.DEV_PLUMBING_HOME ? path.resolve(env.DEV_PLUMBING_HOME) : path.join(os.homedir(), '.dev-plumbing');
}

export function expandHome(p: string, home: string = os.homedir()): string {
  if (p === '~') return home;
  if (p.startsWith('~/')) return path.join(home, p.slice(2));
  return path.resolve(p);
}
```

`packages/core/src/atomic.ts`:
```ts
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Write to a temp file in the same folder, then rename, so readers never see half a file. */
export async function writeFileAtomic(file: string, data: string | Uint8Array, mode?: number): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  await fs.writeFile(tmp, data, mode === undefined ? undefined : { mode });
  await fs.rename(tmp, file);
}

export function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  return writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}
```

`packages/core/src/schemas/views.ts`:
```ts
import type { Screen } from './plumbingType';

export type ConfigProblem = { file: string; key?: string; message: string };
export type RuleSummary = { file: string; id: string; title: string; order: number; screen: Screen; enabled: boolean };
```

Append to `packages/core/src/schemas/index.ts`:
```ts
export * from './views';
```

`packages/core/src/config.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ZodError } from 'zod';
import { writeJsonAtomic } from './atomic';
import { parseRulesFile, resolveTypes, type RulesFileResult } from './rules';
import {
  agentsFields,
  parseAgents,
  parseSettings,
  repoProfileSchema,
  settingsFields,
  type AgentsConfig,
  type ConfigProblem,
  type FieldError,
  type FieldSpec,
  type PlumbingType,
  type RepoProfile,
  type Settings,
} from './schemas';

export type LoadedConfig = {
  dir: string;
  settings: Settings;
  agents: AgentsConfig;
  repos: RepoProfile[];
  types: PlumbingType[];
  outputs: string[];
  problems: ConfigProblem[];
};

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}

async function listFiles(dir: string, ext: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith(ext) && !f.startsWith('.')).sort();
  } catch (e) {
    if (isMissing(e)) return [];
    throw e;
  }
}

async function readJson(file: string, label: string, problems: ConfigProblem[]): Promise<unknown> {
  const text = await readText(file);
  if (text === null) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    problems.push({ file: label, message: `This file isn't valid JSON (${(e as Error).message}). Using the defaults until it's fixed.` });
    return {};
  }
}

function fieldProblem(file: string, fields: readonly FieldSpec[], e: FieldError): ConfigProblem {
  if (e.unknown) return { file, key: e.key, message: 'Unknown setting. It is ignored.' };
  const field = fields.find((f) => f.key === e.key);
  return { file, key: e.key, message: `${e.message}. Using the default (${JSON.stringify(field?.default)}).` };
}

export const formatZodError = (error: ZodError) =>
  error.issues.map((i) => `${i.path.join('.') || 'file'}: ${i.message}`).join('; ');

export async function loadConfig(dir: string): Promise<LoadedConfig> {
  const problems: ConfigProblem[] = [];

  const settings = parseSettings(await readJson(path.join(dir, 'settings.json'), 'settings.json', problems));
  settings.errors.forEach((e) => problems.push(fieldProblem('settings.json', settingsFields, e)));

  const agents = parseAgents(await readJson(path.join(dir, 'agents.json'), 'agents.json', problems));
  agents.errors.forEach((e) => problems.push(fieldProblem('agents.json', agentsFields, e)));

  const repos: RepoProfile[] = [];
  for (const f of await listFiles(path.join(dir, 'repos'), '.json')) {
    const label = `repos/${f}`;
    const parsed = repoProfileSchema.safeParse(await readJson(path.join(dir, 'repos', f), label, problems));
    if (!parsed.success) {
      problems.push({ file: label, message: formatZodError(parsed.error) });
      continue;
    }
    if (repos.some((r) => r.name === parsed.data.name)) {
      problems.push({ file: label, message: `Another profile already uses the name "${parsed.data.name}". This one is ignored.` });
      continue;
    }
    repos.push(parsed.data);
  }

  const results: RulesFileResult[] = [];
  for (const f of await listFiles(path.join(dir, 'plumbing'), '.md')) {
    results.push(parseRulesFile(f, (await readText(path.join(dir, 'plumbing', f))) ?? ''));
  }
  const { types, errors } = resolveTypes(results);
  errors.forEach((e) => problems.push({ file: `plumbing/${e.file}`, message: e.error }));

  const outputs = await listFiles(path.join(dir, 'outputs'), '.md');
  return { dir, settings: settings.value, agents: agents.value, repos, types, outputs, problems };
}

/** Copy every default file that doesn't exist yet. Never overwrites. */
export async function installDefaults(opts: { configDir: string; defaultsDir: string }): Promise<{ created: string[]; kept: string[] }> {
  const created: string[] = [];
  const kept: string[] = [];
  async function walk(rel: string): Promise<void> {
    for (const entry of await fs.readdir(path.join(opts.defaultsDir, rel), { withFileTypes: true })) {
      const r = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        await walk(r);
        continue;
      }
      const target = path.join(opts.configDir, r);
      try {
        await fs.access(target);
        kept.push(r);
      } catch {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(path.join(opts.defaultsDir, r), target);
        created.push(r);
      }
    }
  }
  await walk('');
  return { created, kept };
}

export async function resetToDefault(opts: { configDir: string; defaultsDir: string; file: string }): Promise<void> {
  const rel = path.normalize(opts.file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('That file is outside the config folder.');
  const source = path.join(opts.defaultsDir, rel);
  try {
    await fs.access(source);
  } catch {
    throw new Error(`There is no default for ${opts.file}.`);
  }
  await fs.mkdir(path.dirname(path.join(opts.configDir, rel)), { recursive: true });
  await fs.copyFile(source, path.join(opts.configDir, rel));
}

export async function updateSettingsFile(dir: string, patch: Partial<Settings>): Promise<Settings> {
  const { settings } = await loadConfig(dir);
  const checked = parseSettings({ ...settings, ...patch });
  if (checked.errors.length) throw new Error(checked.errors.map((e) => `${e.key}: ${e.message}`).join('; '));
  await writeJsonAtomic(path.join(dir, 'settings.json'), checked.value);
  return checked.value;
}
```

`packages/core/src/readme.ts`:
```ts
import path from 'node:path';
import { writeFileAtomic } from './atomic';
import { agentsFields, plumbingTypeHeaderDocs, repoProfileDocs, settingsFields, type FieldSpec } from './schemas';

const fieldTable = (fields: readonly FieldSpec[]) =>
  ['| Key | Default | What it does |', '|---|---|---|', ...fields.map((f) => `| \`${f.key}\` | \`${JSON.stringify(f.default)}\` | **${f.label}.** ${f.description} |`)].join('\n');

const docTable = (rows: { key: string; description: string }[]) =>
  ['| Key | What it does |', '|---|---|', ...rows.map((r) => `| \`${r.key}\` | ${r.description} |`)].join('\n');

export function renderReadme(): string {
  return [
    '# dev-plumbing configuration',
    '',
    "Everything you can tune in dev-plumbing lives in this folder. The app's Settings and Plumbing rules pages edit these files, and you can edit them in any editor. Changes apply on the next request; a new port needs a restart.",
    '',
    '```',
    'settings.json                   app settings',
    'agents.json                     subagent settings',
    'repos/<repo>.json               one repo profile per repo',
    'plumbing/<type>.md              rules and criteria for each plumbing type',
    'outputs/finalize.md             rules for Finalize spec',
    'outputs/whiteboard-defense.md   rules for Whiteboard Defense',
    'run/                            managed by the app (port, pid, token, log)',
    '```',
    '',
    '## settings.json',
    '',
    fieldTable(settingsFields),
    '',
    '## agents.json',
    '',
    fieldTable(agentsFields),
    '',
    '## Repo profiles: repos/<repo>.json',
    '',
    'A profile is created the first time you run /dev-plumbing in a repo. Plain JSON, no comments.',
    '',
    docTable(repoProfileDocs),
    '',
    '## Plumbing types: plumbing/<type>.md',
    '',
    'Each file starts with a YAML header between `---` lines, then the rules as Markdown. The importer follows the whole file; thread subagents follow the **Rules** section. A new file is a new plumbing type.',
    '',
    docTable(plumbingTypeHeaderDocs),
    '',
    'Body sections: `## What to look for`, `## Rules`, `## Done when`, `## Always ask`.',
    '',
    '## Getting back to the defaults',
    '',
    'Use Reset to default on the Settings or Plumbing rules page, or delete a file and run `dev-plumbing setup` again. Setup only adds missing files and never overwrites yours.',
    '',
  ].join('\n');
}

export async function writeReadme(dir: string): Promise<string> {
  const file = path.join(dir, 'README.md');
  await writeFileAtomic(file, renderReadme());
  return file;
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './paths';
export * from './atomic';
export * from './config';
export * from './readme';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): config folder: install defaults, load with problems, README"
```

---

### Task 6: The plumbing project store and demo projects

**Files:**
- Create: `packages/core/src/schemas/project.ts`
- Modify: `packages/core/src/schemas/views.ts` (add the view types and helpers), `packages/core/src/schemas/index.ts`, `packages/core/src/index.ts`
- Create: `packages/core/src/store/projects.ts`, `packages/core/src/demo.ts`
- Test: `packages/core/src/schemas/views.test.ts`, `packages/core/test/projects.test.ts`

**Interfaces:**
- Consumes: `expandHome`, `writeFileAtomic`, `writeJsonAtomic`, `installDefaults`, `loadConfig`, `Settings`, `RepoProfile`, `PlumbingType`.
- Produces:
  - From `schemas`:
    - `threadStatusValues`, `type ThreadStatus`
    - `plumbingProjectSchema`, `type PlumbingProject`, `itemSchema`, `type Item`, `messageSchema`, `threadSchema`, `type Thread`
    - `type DisplayStatus`, `displayStatus(thread)`
    - `type ThreadCounts`, `countThreads(statuses)`, `summaryStatus(counts)`
    - `type ProjectSummary`, `type TypeEntry`, `type InboxEntry`, `type ProjectHome`, `type TypeItemRow`
  - Node side:
    - `type ProjectRef = { repo: string; id: string; dir: string }`, `findProjects(settings, repos, home?)`
    - `summarizeProject(ref)`, `listProjectSummaries(refs, { q?, tab?, offset?, limit })`
    - `loadProjectHome(ref, types)`, `loadTypeItems(ref, types, typeId)`, `readProjectDocument(ref, which)`, `class ProjectUnreadableError`
    - `writeDemoProjects(root, now?): Promise<string[]>`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/schemas/views.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { countThreads, displayStatus, summaryStatus } from './views';

describe('thread status helpers', () => {
  it('shows a your-turn thread with unsent input as a draft', () => {
    expect(displayStatus({ status: 'your_turn', draft: { note: 'x', updatedAt: '' } })).toBe('draft');
    expect(displayStatus({ status: 'with_claude', draft: { note: 'x', updatedAt: '' } })).toBe('with_claude');
    expect(displayStatus({ status: 'resolved' })).toBe('resolved');
  });

  it('counts statuses and leaves idle out of the total', () => {
    expect(countThreads(['your_turn', 'draft', 'with_claude', 'resolved', 'parked', 'idle'])).toEqual({
      yourTurn: 1, drafts: 1, withClaude: 1, resolved: 1, parked: 1, total: 5,
    });
  });

  it('picks the most urgent status for a summary', () => {
    expect(summaryStatus(countThreads(['resolved', 'your_turn']))).toBe('your_turn');
    expect(summaryStatus(countThreads(['resolved', 'parked']))).toBe('resolved');
    expect(summaryStatus(countThreads([]))).toBe('idle');
  });
});
```

`packages/core/test/projects.test.ts`:
```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { installDefaults, loadConfig } from '../src/config';
import { writeDemoProjects } from '../src/demo';
import { defaultSettings, repoProfileSchema } from '../src/schemas';
import {
  findProjects,
  listProjectSummaries,
  loadProjectHome,
  loadTypeItems,
  readProjectDocument,
  summarizeProject,
  type ProjectRef,
} from '../src/store/projects';

const NOW = new Date('2026-09-30T12:00:00Z');
const defaultsDir = path.resolve(import.meta.dirname, '../../../defaults');
let root: string;
const settings = () => ({ ...defaultSettings, projectsFolder: root });
const ref = (repo: string, id: string): ProjectRef => ({ repo, id, dir: path.join(root, repo, id) });

async function defaultTypes() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-types-'));
  await installDefaults({ configDir: dir, defaultsDir });
  return (await loadConfig(dir)).types;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-projects-'));
  await writeDemoProjects(root, NOW);
});

describe('project store', () => {
  it('finds the demo projects', async () => {
    const refs = await findProjects(settings(), []);
    expect(refs.map((r) => `${r.repo}/${r.id}`).sort()).toEqual([
      'acme/onboarding-emails',
      'acme/restock-reminders',
      'beta/checkout-redesign',
    ]);
  });

  it('does not overwrite a demo project that already exists', async () => {
    expect(await writeDemoProjects(root, NOW)).toEqual([]);
  });

  it('counts threads per status', async () => {
    const s = await summarizeProject(ref('acme', 'restock-reminders'));
    expect(s.title).toBe('Restock reminders');
    expect(s.counts).toEqual({ yourTurn: 2, drafts: 1, withClaude: 1, resolved: 1, parked: 1, total: 6 });
  });

  it('lists needs-you first, then most recent, with paging and tabs', async () => {
    const refs = await findProjects(settings(), []);
    const active = await listProjectSummaries(refs, { limit: 10 });
    expect(active.items.map((s) => s.id)).toEqual(['restock-reminders', 'checkout-redesign']);
    const all = await listProjectSummaries(refs, { tab: 'all', limit: 2 });
    expect(all.total).toBe(3);
    expect(all.items).toHaveLength(2);
    const finalized = await listProjectSummaries(refs, { tab: 'finalized', limit: 10 });
    expect(finalized.items.map((s) => s.id)).toEqual(['onboarding-emails']);
  });

  it('searches title, id, repo and source path', async () => {
    const refs = await findProjects(settings(), []);
    const q = async (text: string) => (await listProjectSummaries(refs, { q: text, tab: 'all', limit: 10 })).items.map((s) => s.id);
    expect(await q('ONBOARD')).toEqual(['onboarding-emails']);
    expect(await q('beta')).toEqual(['checkout-redesign']);
    expect(await q('specs/restock')).toEqual(['restock-reminders']);
  });

  it('lists a broken project with the reason instead of failing', async () => {
    const dir = path.join(root, 'beta', 'half-made');
    await fs.mkdir(path.join(dir, 'threads'), { recursive: true });
    await fs.writeFile(path.join(dir, 'project.json'), '{bad');
    await fs.writeFile(path.join(dir, 'threads', 'x.json'), '{');
    const refs = await findProjects(settings(), []);
    const all = await listProjectSummaries(refs, { tab: 'all', limit: 10 });
    const broken = all.items.find((s) => s.id === 'half-made');
    expect(broken?.status).toBe('broken');
    expect(broken?.error).toMatch(/project.json isn't valid JSON/);
    expect(broken?.error).toMatch(/1 thread file couldn't be read/);
    expect(all.total).toBe(4);
  });

  it('ignores folders that are not projects', async () => {
    await fs.mkdir(path.join(root, 'acme', 'notes'), { recursive: true });
    expect(await findProjects(settings(), [])).toHaveLength(3);
  });

  it('handles ~ and spaces in the projects folder', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-home-'));
    await writeDemoProjects(path.join(home, 'my projects'), NOW);
    const refs = await findProjects({ ...defaultSettings, projectsFolder: '~/my projects' }, [], home);
    expect(refs).toHaveLength(3);
  });

  it('uses a repo profile folder and lists each project once', async () => {
    const profile = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'], projectsFolder: path.join(root, 'acme') });
    const refs = await findProjects(settings(), [profile]);
    expect(refs.filter((r) => r.id === 'restock-reminders')).toHaveLength(1);
    expect(refs).toHaveLength(3);
  });

  it('builds the project home model', async () => {
    const home = await loadProjectHome(ref('acme', 'restock-reminders'), await defaultTypes());
    expect(home.types).toHaveLength(10);
    expect(home.types.find((t) => t.id === 'security')?.noChanges?.reason).toMatch(/permissions/);
    expect(home.types.find((t) => t.id === 'flows')?.noChanges?.reason).toBe('No items were found for this plumbing type.');
    expect(home.types.find((t) => t.id === 'questions')).toMatchObject({ itemCount: 2, yourTurn: 1, resolved: 1, noChanges: null });
    expect(home.inbox.map((e) => e.status).sort()).toEqual(['draft', 'parked', 'resolved', 'with_claude', 'your_turn', 'your_turn']);
    expect(home.inbox.find((e) => e.itemTitle === 'Who gets reminders at launch?')?.blocking).toBe(true);
    expect(home.documents).toEqual({ original: true, draft: true, final: false });
  });

  it('lists the items of one plumbing type', async () => {
    const r = await loadTypeItems(ref('acme', 'restock-reminders'), await defaultTypes(), 'questions');
    expect(r?.items.map((i) => [i.title, i.status])).toEqual([
      ['Which channels?', 'resolved'],
      ['Who gets reminders at launch?', 'your_turn'],
    ]);
    expect(await loadTypeItems(ref('acme', 'restock-reminders'), await defaultTypes(), 'nope')).toBeNull();
  });

  it('reads documents and refuses paths outside the project', async () => {
    const r = ref('acme', 'restock-reminders');
    expect(await readProjectDocument(r, 'original')).toMatch(/^# Restock reminders/);
    expect(await readProjectDocument(r, 'final')).toBeNull();
    const pj = JSON.parse(await fs.readFile(path.join(r.dir, 'project.json'), 'utf8'));
    pj.docs.draft = '../../outside.md';
    await fs.writeFile(path.join(r.dir, 'project.json'), JSON.stringify(pj));
    await expect(readProjectDocument(r, 'draft')).rejects.toThrow(/outside the project/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/core/src/schemas/views.test.ts packages/core/test/projects.test.ts`
Expected: FAIL (missing exports and modules).

- [ ] **Step 3: Implement the schemas**

`packages/core/src/schemas/project.ts`:
```ts
import { z } from 'zod';

export const threadStatusValues = ['idle', 'your_turn', 'with_claude', 'resolved', 'parked'] as const;
export type ThreadStatus = (typeof threadStatusValues)[number];

export const plumbingProjectSchema = z.object({
  id: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1),
  source: z.object({ path: z.string(), clone: z.string(), branch: z.string(), hashAtImport: z.string() }),
  docs: z.object({
    original: z.string(),
    draft: z.string(),
    final: z.string().optional(),
    exportedTo: z.object({ clone: z.string(), path: z.string(), at: z.string() }).optional(),
  }),
  status: z.enum(['importing', 'active', 'finalized']),
  emptyTypes: z.array(z.object({ type: z.string(), reason: z.string() })).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlumbingProject = z.infer<typeof plumbingProjectSchema>;

export const itemSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    summary: z.string(),
    body: z.string().optional(),
    fields: z.record(z.string()).optional(),
    mdAnchor: z.object({ heading: z.string(), lines: z.tuple([z.number(), z.number()]).optional() }).optional(),
    codeRefs: z.array(z.object({ path: z.string(), symbol: z.string().optional(), verified: z.boolean().optional() })).optional(),
    links: z.array(z.string()).optional(),
    data: z.unknown().optional(),
    threadId: z.string(),
    createdBy: z.enum(['import', 'claude', 'you', 'whiteboard']),
  })
  .passthrough();
export type Item = z.infer<typeof itemSchema>;

export const messageSchema = z
  .object({ id: z.string(), at: z.string(), author: z.enum(['you', 'claude', 'system']), text: z.string().optional() })
  .passthrough();

export const threadSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  status: z.enum(threadStatusValues),
  draft: z
    .object({ optionId: z.string().optional(), note: z.string().optional(), text: z.string().optional(), updatedAt: z.string() })
    .optional(),
  messages: z.array(messageSchema),
});
export type Thread = z.infer<typeof threadSchema>;
```

Replace `packages/core/src/schemas/views.ts` with:
```ts
import type { PlumbingProject, Thread } from './project';
import type { Screen } from './plumbingType';

export type ConfigProblem = { file: string; key?: string; message: string };
export type RuleSummary = { file: string; id: string; title: string; order: number; screen: Screen; enabled: boolean };

export type DisplayStatus = 'your_turn' | 'draft' | 'with_claude' | 'resolved' | 'parked' | 'idle';
export type ThreadCounts = { yourTurn: number; drafts: number; withClaude: number; resolved: number; parked: number; total: number };

/** A thread you've typed into but not sent shows as a draft. */
export function displayStatus(thread: Pick<Thread, 'status' | 'draft'>): DisplayStatus {
  if (thread.draft && (thread.status === 'your_turn' || thread.status === 'idle')) return 'draft';
  return thread.status;
}

export function countThreads(statuses: DisplayStatus[]): ThreadCounts {
  const c: ThreadCounts = { yourTurn: 0, drafts: 0, withClaude: 0, resolved: 0, parked: 0, total: 0 };
  for (const s of statuses) {
    if (s === 'idle') continue;
    c.total++;
    if (s === 'your_turn') c.yourTurn++;
    else if (s === 'draft') c.drafts++;
    else if (s === 'with_claude') c.withClaude++;
    else if (s === 'resolved') c.resolved++;
    else c.parked++;
  }
  return c;
}

export function summaryStatus(c: ThreadCounts): DisplayStatus {
  if (c.yourTurn) return 'your_turn';
  if (c.drafts) return 'draft';
  if (c.withClaude) return 'with_claude';
  if (c.total > 0 && c.resolved + c.parked === c.total) return 'resolved';
  return 'idle';
}

export type ProjectSummary = {
  repo: string;
  id: string;
  title: string;
  sourcePath: string | null;
  clone: string | null;
  branch: string | null;
  status: PlumbingProject['status'] | 'broken';
  updatedAt: string;
  counts: ThreadCounts;
  error?: string;
};

export type TypeEntry = {
  id: string;
  title: string;
  order: number;
  screen: Screen;
  emptyMessage: string;
  itemCount: number;
  yourTurn: number;
  drafts: number;
  withClaude: number;
  resolved: number;
  noChanges: { reason: string } | null;
};

export type InboxEntry = {
  threadId: string;
  itemId: string;
  itemTitle: string;
  type: string;
  typeTitle: string;
  status: DisplayStatus;
  blocking: boolean;
  lastMessage: { author: 'you' | 'claude' | 'system'; text: string } | null;
};

export type ProjectHome = {
  summary: ProjectSummary;
  project: PlumbingProject;
  types: TypeEntry[];
  inbox: InboxEntry[];
  documents: { original: boolean; draft: boolean; final: boolean };
};

export type TypeItemRow = { id: string; title: string; summary: string; status: DisplayStatus; blocking: boolean };
```

Replace `packages/core/src/schemas/index.ts` with:
```ts
export const VERSION = '0.1.0';
export * from './fields';
export * from './settings';
export * from './agents';
export * from './repoProfile';
export * from './plumbingType';
export * from './project';
export * from './views';
```

- [ ] **Step 4: Implement the store**

`packages/core/src/store/projects.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { expandHome } from '../paths';
import {
  countThreads,
  displayStatus,
  itemSchema,
  plumbingProjectSchema,
  threadSchema,
  type InboxEntry,
  type Item,
  type PlumbingProject,
  type PlumbingType,
  type ProjectHome,
  type ProjectSummary,
  type RepoProfile,
  type Settings,
  type Thread,
  type TypeEntry,
  type TypeItemRow,
} from '../schemas';

export type ProjectRef = { repo: string; id: string; dir: string };
export class ProjectUnreadableError extends Error {}

const exists = (p: string) => fs.access(p).then(() => true, () => false);

async function subdirs(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

async function looksLikeProject(dir: string): Promise<boolean> {
  return (await exists(path.join(dir, 'project.json'))) || (await exists(path.join(dir, 'threads'))) || (await exists(path.join(dir, 'items')));
}

/** Repo-profile folders first (<folder>/<project>), then settings.projectsFolder (<folder>/<repo>/<project>). Each real folder once. */
export async function findProjects(settings: Settings, repos: RepoProfile[], home?: string): Promise<ProjectRef[]> {
  const refs: ProjectRef[] = [];
  const seen = new Set<string>();
  const add = async (repo: string, id: string, dir: string) => {
    if (!(await looksLikeProject(dir))) return;
    const real = await fs.realpath(dir).catch(() => dir);
    if (seen.has(real)) return;
    seen.add(real);
    refs.push({ repo, id, dir });
  };
  for (const profile of repos) {
    if (!profile.projectsFolder) continue;
    const folder = expandHome(profile.projectsFolder, home);
    for (const id of await subdirs(folder)) await add(profile.name, id, path.join(folder, id));
  }
  const root = expandHome(settings.projectsFolder, home);
  for (const repo of await subdirs(root)) {
    for (const id of await subdirs(path.join(root, repo))) await add(repo, id, path.join(root, repo, id));
  }
  return refs;
}

async function readJson(file: string): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    return { ok: true, value: JSON.parse(await fs.readFile(file, 'utf8')) };
  } catch (e) {
    return { ok: false, error: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : (e as Error).message };
  }
}

async function readFolder<T>(dir: string, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }): Promise<{ values: T[]; bad: number }> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return { values: [], bad: 0 };
  }
  const values: T[] = [];
  let bad = 0;
  for (const f of files) {
    const r = await readJson(path.join(dir, f));
    const parsed = r.ok ? schema.safeParse(r.value) : null;
    if (parsed?.success) values.push(parsed.data);
    else bad++;
  }
  return { values, bad };
}

const readThreads = (dir: string) => readFolder<Thread>(path.join(dir, 'threads'), threadSchema);
const readItems = (dir: string) => readFolder<Item>(path.join(dir, 'items'), itemSchema);

async function readProject(ref: ProjectRef): Promise<{ project: PlumbingProject | null; error?: string }> {
  const r = await readJson(path.join(ref.dir, 'project.json'));
  if (!r.ok) return { project: null, error: r.error === 'missing' ? 'project.json is missing.' : `project.json isn't valid JSON (${r.error}).` };
  const p = plumbingProjectSchema.safeParse(r.value);
  if (p.success) return { project: p.data };
  const issue = p.error.issues[0];
  return { project: null, error: `project.json doesn't have the expected shape (${issue?.path.join('.')}: ${issue?.message}).` };
}

export async function summarizeProject(ref: ProjectRef): Promise<ProjectSummary> {
  const { project, error } = await readProject(ref);
  const { values: threads, bad } = await readThreads(ref.dir);
  const counts = countThreads(threads.map(displayStatus));
  const problems = [error, bad ? `${bad} thread file${bad === 1 ? '' : 's'} couldn't be read.` : undefined].filter(Boolean).join(' ');
  if (!project) {
    const stat = await fs.stat(ref.dir);
    return { repo: ref.repo, id: ref.id, title: ref.id, sourcePath: null, clone: null, branch: null, status: 'broken', updatedAt: stat.mtime.toISOString(), counts, error: problems };
  }
  return {
    repo: ref.repo,
    id: ref.id,
    title: project.title,
    sourcePath: project.source.path,
    clone: project.source.clone,
    branch: project.source.branch,
    status: project.status,
    updatedAt: project.updatedAt,
    counts,
    ...(problems ? { error: problems } : {}),
  };
}

export type ListOptions = { q?: string; tab?: 'active' | 'finalized' | 'all'; offset?: number; limit: number };

export async function listProjectSummaries(refs: ProjectRef[], opts: ListOptions): Promise<{ items: ProjectSummary[]; total: number }> {
  const all = await Promise.all(refs.map(summarizeProject));
  const q = opts.q?.trim().toLowerCase();
  const tab = opts.tab ?? 'active';
  const matchesTab = (s: ProjectSummary) => tab === 'all' || (tab === 'finalized' ? s.status === 'finalized' : s.status !== 'finalized');
  const matchesQuery = (s: ProjectSummary) => !q || [s.title, s.id, s.repo, s.sourcePath ?? ''].some((v) => v.toLowerCase().includes(q));
  const filtered = all.filter((s) => matchesTab(s) && matchesQuery(s));
  filtered.sort((a, b) => Number(b.counts.yourTurn > 0) - Number(a.counts.yourTurn > 0) || b.updatedAt.localeCompare(a.updatedAt));
  const offset = opts.offset ?? 0;
  return { items: filtered.slice(offset, offset + opts.limit), total: filtered.length };
}

export async function loadProjectHome(ref: ProjectRef, types: PlumbingType[]): Promise<ProjectHome> {
  const summary = await summarizeProject(ref);
  const { project } = await readProject(ref);
  if (!project) throw new ProjectUnreadableError(summary.error ?? 'This plumbing project could not be read.');
  const { values: items } = await readItems(ref.dir);
  const { values: threads } = await readThreads(ref.dir);
  const threadById = new Map(threads.map((t) => [t.id, t]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const titleOf = new Map(types.map((t) => [t.id, t.title]));

  const typeEntries: TypeEntry[] = types
    .filter((t) => t.enabled)
    .map((t) => {
      const ofType = items.filter((i) => i.type === t.id);
      const statuses = ofType.flatMap((i) => {
        const th = threadById.get(i.threadId);
        return th ? [displayStatus(th)] : [];
      });
      const c = countThreads(statuses);
      const empty = project.emptyTypes.find((e) => e.type === t.id);
      const noChanges = empty
        ? { reason: empty.reason }
        : ofType.length === 0 && project.status !== 'importing'
          ? { reason: 'No items were found for this plumbing type.' }
          : null;
      return { id: t.id, title: t.title, order: t.order, screen: t.screen, emptyMessage: t.emptyMessage, itemCount: ofType.length, yourTurn: c.yourTurn, drafts: c.drafts, withClaude: c.withClaude, resolved: c.resolved, noChanges };
    });

  const inbox: InboxEntry[] = threads
    .map((th): InboxEntry => {
      const item = itemById.get(th.itemId);
      const last = [...th.messages].reverse().find((m) => m.text);
      return {
        threadId: th.id,
        itemId: th.itemId,
        itemTitle: item?.title ?? th.itemId,
        type: item?.type ?? 'unknown',
        typeTitle: item ? (titleOf.get(item.type) ?? item.type) : 'Unknown',
        status: displayStatus(th),
        blocking: item?.fields?.blocking === 'true',
        lastMessage: last?.text ? { author: last.author, text: last.text } : null,
      };
    })
    .filter((e) => e.status !== 'idle');

  const docPath = (rel: string | undefined) => (rel ? exists(path.join(ref.dir, rel)) : Promise.resolve(false));
  const documents = {
    original: await docPath(project.docs.original),
    draft: await docPath(project.docs.draft),
    final: await docPath(project.docs.final),
  };
  return { summary, project, types: typeEntries, inbox, documents };
}

export async function loadTypeItems(ref: ProjectRef, types: PlumbingType[], typeId: string): Promise<{ type: TypeEntry; items: TypeItemRow[] } | null> {
  const home = await loadProjectHome(ref, types);
  const type = home.types.find((t) => t.id === typeId);
  if (!type) return null;
  const { values: items } = await readItems(ref.dir);
  const { values: threads } = await readThreads(ref.dir);
  const byId = new Map(threads.map((t) => [t.id, t]));
  const rows = items
    .filter((i) => i.type === typeId)
    .map((i): TypeItemRow => {
      const th = byId.get(i.threadId);
      return { id: i.id, title: i.title, summary: i.summary, status: th ? displayStatus(th) : 'idle', blocking: i.fields?.blocking === 'true' };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
  return { type, items: rows };
}

export async function readProjectDocument(ref: ProjectRef, which: 'original' | 'draft' | 'final'): Promise<string | null> {
  const { project, error } = await readProject(ref);
  if (!project) throw new ProjectUnreadableError(error ?? 'This plumbing project could not be read.');
  const rel = project.docs[which];
  if (!rel) return null;
  const base = path.resolve(ref.dir);
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) throw new Error('That document is outside the project folder.');
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Implement the demo projects**

`packages/core/src/demo.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic, writeJsonAtomic } from './atomic';
import type { ThreadStatus } from './schemas';

type DemoThread = { id: string; type: string; title: string; summary: string; status: ThreadStatus; blocking?: boolean; claude?: string; you?: string; draft?: string };
type DemoProject = {
  repo: string;
  id: string;
  title: string;
  status: 'active' | 'finalized';
  ageMinutes: number;
  sourcePath: string;
  threads: DemoThread[];
  emptyTypes: { type: string; reason: string }[];
  original: string;
  draft: string;
  final?: string;
};

const DAY = 24 * 60;

const projects: DemoProject[] = [
  {
    repo: 'acme',
    id: 'restock-reminders',
    title: 'Restock reminders',
    status: 'active',
    ageMinutes: 2,
    sourcePath: 'docs/specs/restock-reminders.md',
    emptyTypes: [{ type: 'security', reason: "The plan doesn't touch roles, permissions or personal data." }],
    original: '# Restock reminders\n\nRemind customers before a subscription item runs out, and let them reorder in one tap.\n\n## Approach\n\nA daily job finds subscriptions due in the next few days and sends a reminder.\n',
    draft: '# Restock reminders\n\nRemind customers before a subscription item runs out, and let them reorder in one tap.\n\n## Approach\n\nA daily job finds subscriptions due in the next few days and sends a reminder.\n\nReminders go out by SMS and email.\n',
    threads: [
      { id: 'q1', type: 'questions', title: 'Who gets reminders at launch?', summary: 'Everyone, or only active subscribers?', status: 'your_turn', blocking: true, claude: "I'd start with active subscribers only: a smaller blast radius." },
      { id: 'db1', type: 'database', title: 'One row per send, or per subscription?', summary: 'How often a RestockReminder row is written.', status: 'your_turn', claude: 'Per send keeps history for support. Per subscription is simpler.' },
      { id: 'ui1', type: 'ui', title: 'Reminder settings card', summary: 'A new card on the account settings page.', status: 'your_turn', claude: 'Should the toggle sit above or below the schedule?', draft: 'Put it above the schedule.' },
      { id: 'c1', type: 'concerns', title: 'Rate-limit reminder sends', summary: 'Stop a burst of sends if the job runs twice.', status: 'with_claude', claude: 'A second run on the same day could send twice.', you: 'What stops that?' },
      { id: 'q2', type: 'questions', title: 'Which channels?', summary: 'SMS, email or both.', status: 'resolved', claude: 'SMS, email or both?', you: 'Both.' },
      { id: 'i1', type: 'ideas', title: 'Snooze a reminder by 2 days', summary: 'Let customers push a reminder back.', status: 'parked', claude: 'Customers could snooze a reminder for two days.' },
      { id: 'a1', type: 'architecture', title: 'System view', summary: 'Daily job, notifications and the orders table.', status: 'idle' },
    ],
  },
  {
    repo: 'acme',
    id: 'onboarding-emails',
    title: 'Onboarding emails',
    status: 'finalized',
    ageMinutes: 21 * DAY,
    sourcePath: 'docs/specs/onboarding-emails.md',
    emptyTypes: [],
    original: '# Onboarding emails\n\nA short series of emails for new customers.\n',
    draft: '# Onboarding emails\n\nA series of three emails for new customers.\n',
    final: '# Onboarding emails\n\n## 1. Title and summary\n\nA series of three emails for new customers.\n',
    threads: [
      { id: 'q', type: 'questions', title: 'How many emails in the series?', summary: 'Length of the series.', status: 'resolved', claude: 'Three or five?', you: 'Three.' },
      { id: 'db', type: 'database', title: 'Track which email was sent', summary: 'A sent-at column per email.', status: 'resolved', claude: 'Add sentAt per email?', you: 'Yes.' },
      { id: 'ui', type: 'ui', title: 'Welcome email layout', summary: 'The first email in the series.', status: 'resolved', claude: 'One column or two?', you: 'One.' },
    ],
  },
  {
    repo: 'beta',
    id: 'checkout-redesign',
    title: 'Checkout redesign',
    status: 'active',
    ageMinutes: 4 * DAY,
    sourcePath: 'docs/plans/checkout-redesign.md',
    emptyTypes: [],
    original: '# Checkout redesign\n\nA shorter checkout with fewer steps.\n',
    draft: '# Checkout redesign\n\nA shorter checkout with fewer steps.\n',
    threads: [
      { id: 'q', type: 'questions', title: 'Keep guest checkout?', summary: 'Guest checkout or accounts only.', status: 'your_turn', blocking: true, claude: 'Guest checkout lifts conversion but complicates order history.' },
      { id: 'c', type: 'concerns', title: 'Card form accessibility', summary: 'Screen reader labels on the card form.', status: 'your_turn', claude: 'The new card form has no visible labels.' },
      { id: 'f', type: 'flows', title: 'Payment step order', summary: 'Address before payment.', status: 'resolved', claude: 'Address first, then payment?', you: 'Yes.' },
    ],
  },
];

/** Adds three example plumbing projects under root. Skips any that already exist. Returns the folders it created. */
export async function writeDemoProjects(root: string, now: Date = new Date()): Promise<string[]> {
  const created: string[] = [];
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  for (const p of projects) {
    const dir = path.join(root, p.repo, p.id);
    if (await fs.access(dir).then(() => true, () => false)) continue;
    const updatedAt = at(p.ageMinutes);
    await writeFileAtomic(path.join(dir, 'docs', 'original.md'), p.original);
    await writeFileAtomic(path.join(dir, 'docs', 'draft.md'), p.draft);
    if (p.final) await writeFileAtomic(path.join(dir, 'docs', 'final.md'), p.final);
    for (const t of p.threads) {
      const itemId = `item-${t.id}`;
      const threadId = `thread-${t.id}`;
      await writeJsonAtomic(path.join(dir, 'items', `${itemId}.json`), {
        id: itemId, type: t.type, title: t.title, summary: t.summary, fields: t.blocking ? { blocking: 'true' } : {}, threadId, createdBy: 'import',
      });
      const messages: { id: string; at: string; author: 'claude' | 'you'; text: string }[] = [];
      if (t.claude) messages.push({ id: `${t.id}-1`, at: at(p.ageMinutes + 60), author: 'claude', text: t.claude });
      if (t.you) messages.push({ id: `${t.id}-2`, at: at(p.ageMinutes + 30), author: 'you', text: t.you });
      await writeJsonAtomic(path.join(dir, 'threads', `${threadId}.json`), {
        id: threadId, itemId, status: t.status, ...(t.draft ? { draft: { note: t.draft, updatedAt } } : {}), messages,
      });
    }
    await writeJsonAtomic(path.join(dir, 'project.json'), {
      id: p.id,
      repo: p.repo,
      title: p.title,
      source: { path: p.sourcePath, clone: `~/Source/${p.repo}`, branch: 'main', hashAtImport: 'demo' },
      docs: {
        original: 'docs/original.md',
        draft: 'docs/draft.md',
        ...(p.final ? { final: 'docs/final.md', exportedTo: { clone: `~/Source/${p.repo}`, path: p.sourcePath.replace(/\.md$/, '.final.md'), at: updatedAt } } : {}),
      },
      status: p.status,
      emptyTypes: p.emptyTypes,
      createdAt: at(p.ageMinutes + 600),
      updatedAt,
    });
    created.push(dir);
  }
  return created;
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './store/projects';
export * from './demo';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run packages/core`
Expected: PASS.

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm --filter @dev-plumbing/core typecheck`
Expected: no errors.

```bash
git add packages/core
git commit -m "feat(core): plumbing project store, project home model and demo projects"
```

---

### Task 7: Login item and run file

**Files:**
- Create: `packages/core/src/loginItem.ts`, `packages/core/src/runFile.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/loginItem.test.ts`, `packages/core/test/runFile.test.ts`

**Interfaces:**
- Consumes: `writeFileAtomic`.
- Produces:
  - Login item: `LOGIN_ITEM_LABEL = 'dev.plumbing.service'`, `loginItemPath(home?)`, `buildPlist({ nodePath, cliPath, configDir })`, `enableLoginItem({ nodePath, cliPath, configDir, home? }): Promise<string>`, `disableLoginItem(home?): Promise<boolean>`, `isLoginItemEnabled(home?): Promise<boolean>`
  - Run file: `type RunInfo = { pid: number; port: number; token: string; startedAt: string; version: string }`, `runFilePath(configDir)`, `writeRunFile(configDir, info)`, `readRunFile(configDir): Promise<RunInfo | null>`, `removeRunFile(configDir, pid?)`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/loginItem.test.ts`:
```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPlist, disableLoginItem, enableLoginItem, isLoginItemEnabled, loginItemPath } from '../src/loginItem';

describe('login item', () => {
  it('builds a LaunchAgent that runs `dev-plumbing start` at login', () => {
    const plist = buildPlist({ nodePath: '/usr/local/bin/node', cliPath: '/a & b/cli.js', configDir: '/Users/x/.dev-plumbing' });
    expect(plist).toContain('<string>dev.plumbing.service</string>');
    expect(plist).toContain('<string>/a &amp; b/cli.js</string>');
    expect(plist).toContain('<string>start</string>');
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
    expect(plist).toContain('<key>AbandonProcessGroup</key>');
  });

  it('writes and removes the plist in the given home', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-login-'));
    const file = await enableLoginItem({ nodePath: '/n', cliPath: '/c', configDir: '/d', home });
    expect(file).toBe(loginItemPath(home));
    expect(await isLoginItemEnabled(home)).toBe(true);
    expect(await disableLoginItem(home)).toBe(true);
    expect(await isLoginItemEnabled(home)).toBe(false);
    expect(await disableLoginItem(home)).toBe(false);
  });
});
```

`packages/core/test/runFile.test.ts`:
```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRunFile, removeRunFile, runFilePath, writeRunFile } from '../src/runFile';

describe('run file', () => {
  it('round-trips and is readable only by you', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-run-'));
    const info = { pid: 123, port: 4545, token: 't', startedAt: '2026-09-30T00:00:00Z', version: '0.1.0' };
    await writeRunFile(dir, info);
    expect(await readRunFile(dir)).toEqual(info);
    expect((await fs.stat(runFilePath(dir))).mode & 0o777).toBe(0o600);
  });

  it('only removes the file when the pid matches', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-run-'));
    await writeRunFile(dir, { pid: 1, port: 1, token: 't', startedAt: '', version: '' });
    await removeRunFile(dir, 2);
    expect(await readRunFile(dir)).not.toBeNull();
    await removeRunFile(dir, 1);
    expect(await readRunFile(dir)).toBeNull();
  });

  it('treats a garbled run file as missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-run-'));
    await fs.mkdir(path.join(dir, 'run'));
    await fs.writeFile(runFilePath(dir), 'nope');
    expect(await readRunFile(dir)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/core/test/loginItem.test.ts packages/core/test/runFile.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`packages/core/src/loginItem.ts`:
```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from './atomic';

export const LOGIN_ITEM_LABEL = 'dev.plumbing.service';
export type LoginItemOptions = { nodePath: string; cliPath: string; configDir: string; home?: string };

export const loginItemPath = (home: string = os.homedir()) => path.join(home, 'Library', 'LaunchAgents', `${LOGIN_ITEM_LABEL}.plist`);

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildPlist(o: Omit<LoginItemOptions, 'home'>): string {
  const log = xml(path.join(o.configDir, 'run', 'login.log'));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LOGIN_ITEM_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(o.nodePath)}</string>
    <string>${xml(o.cliPath)}</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DEV_PLUMBING_HOME</key>
    <string>${xml(o.configDir)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>AbandonProcessGroup</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${log}</string>
  <key>StandardErrorPath</key>
  <string>${log}</string>
</dict>
</plist>
`;
}

export async function enableLoginItem(o: LoginItemOptions): Promise<string> {
  const file = loginItemPath(o.home);
  await writeFileAtomic(file, buildPlist(o));
  return file;
}

export async function disableLoginItem(home?: string): Promise<boolean> {
  try {
    await fs.unlink(loginItemPath(home));
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}

export const isLoginItemEnabled = (home?: string) => fs.access(loginItemPath(home)).then(() => true, () => false);
```

`packages/core/src/runFile.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './atomic';

export type RunInfo = { pid: number; port: number; token: string; startedAt: string; version: string };

export const runFilePath = (configDir: string) => path.join(configDir, 'run', 'service.json');

export async function writeRunFile(configDir: string, info: RunInfo): Promise<void> {
  await writeFileAtomic(runFilePath(configDir), `${JSON.stringify(info, null, 2)}\n`, 0o600);
}

export async function readRunFile(configDir: string): Promise<RunInfo | null> {
  try {
    const v = JSON.parse(await fs.readFile(runFilePath(configDir), 'utf8'));
    return typeof v?.pid === 'number' && typeof v?.port === 'number' && typeof v?.token === 'string' ? (v as RunInfo) : null;
  } catch {
    return null;
  }
}

/** Removes the run file. With a pid, only if the file belongs to that pid. */
export async function removeRunFile(configDir: string, pid?: number): Promise<void> {
  if (pid !== undefined) {
    const current = await readRunFile(configDir);
    if (current && current.pid !== pid) return;
  }
  await fs.rm(runFilePath(configDir), { force: true });
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from './loginItem';
export * from './runFile';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): start-at-login LaunchAgent and service run file"
```

---

### Task 8: Service foundation: security guard, static files, health

**Files:**
- Create: `packages/service/package.json`, `packages/service/tsconfig.json`, `packages/service/vitest.config.ts`
- Create: `packages/service/src/context.ts`, `packages/service/src/security.ts`, `packages/service/src/static.ts`, `packages/service/src/app.ts`
- Test: `packages/service/test/security.test.ts`, `packages/service/test/static.test.ts`

**Interfaces:**
- Consumes: `VERSION` from `@dev-plumbing/core`.
- Produces:
  - `type AppContext = { configDir; defaultsDir; webDist; port; token; version; home?; extraOrigins?; open(target): Promise<void>; loginItem: { enable(): Promise<void>; disable(): Promise<void> } }`
  - `guard({ port, token, extraOrigins? }): MiddlewareHandler`, `staticHandler(root): Handler`
  - `createApp(ctx): Hono`, with `GET /api/health` → `{ ok: true, version, pid }`

- [ ] **Step 1: Create the package and install**

`packages/service/package.json`:
```json
{
  "name": "@dev-plumbing/service",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsup",
    "dev": "DEV_PLUMBING_DEV=1 tsx watch src/index.ts",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`packages/service/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "tsup.config.ts"] }
```

`packages/service/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'service', environment: 'node', include: ['test/**/*.test.ts'], exclude: ['**/*.integration.test.ts', '**/node_modules/**'] },
});
```

Run:
```bash
pnpm --filter @dev-plumbing/service add @dev-plumbing/core@workspace:* hono@^4.9 @hono/node-server@^1.19
```

- [ ] **Step 2: Write the failing tests**

`packages/service/test/security.test.ts`:
```ts
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { guard } from '../src/security';

function makeApp(extraOrigins?: string[]) {
  const app = new Hono();
  app.use('*', guard({ port: 4545, token: 'secret', extraOrigins }));
  app.get('/api/health', (c) => c.text('ok'));
  app.get('/api/x', (c) => c.text('x'));
  app.post('/api/x', (c) => c.text('posted'));
  app.get('/index.html', (c) => c.text('page'));
  return app;
}
const url = (p: string, host = 'localhost:4545') => `http://${host}${p}`;

describe('guard', () => {
  it('rejects an unknown Host (DNS rebinding)', async () => {
    expect((await makeApp().request(url('/api/health', 'evil.example:4545'))).status).toBe(403);
  });
  it('lets localhost read health and pages without a token', async () => {
    expect((await makeApp().request(url('/api/health'))).status).toBe(200);
    expect((await makeApp().request(url('/index.html', '127.0.0.1:4545'))).status).toBe(200);
  });
  it('rejects API calls with no token and no same-origin marker', async () => {
    expect((await makeApp().request(url('/api/x'))).status).toBe(401);
  });
  it('accepts the token', async () => {
    expect((await makeApp().request(url('/api/x'), { headers: { 'x-dev-plumbing-token': 'secret' } })).status).toBe(200);
  });
  it('accepts same-origin browser requests', async () => {
    const res = await makeApp().request(url('/api/x'), { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:4545' } });
    expect(res.status).toBe(200);
  });
  it('rejects cross-site browser requests and forged same-origin markers', async () => {
    expect((await makeApp().request(url('/api/x'), { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' } })).status).toBe(401);
    expect((await makeApp().request(url('/api/x'), { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: 'http://evil.example' } })).status).toBe(401);
  });
  it('accepts the Vite dev origin only when configured', async () => {
    const init = { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173' } };
    expect((await makeApp().request(url('/api/x'), init)).status).toBe(401);
    expect((await makeApp(['localhost:5173']).request(url('/api/x'), init)).status).toBe(200);
  });
});
```

`packages/service/test/static.test.ts`:
```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { staticHandler } from '../src/static';

let root: string;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-web-'));
  await fs.mkdir(path.join(root, 'assets'));
  await fs.writeFile(path.join(root, 'index.html'), '<html>app</html>');
  await fs.writeFile(path.join(root, 'assets', 'app.js'), 'console.log(1)');
});
const app = () => new Hono().get('*', staticHandler(root));

describe('static files', () => {
  it('serves a file with its content type', async () => {
    const res = await app().request('http://localhost/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/javascript/);
  });
  it('falls back to index.html for app routes', async () => {
    expect(await (await app().request('http://localhost/p/acme/restock-reminders')).text()).toBe('<html>app</html>');
  });
  it('never serves files outside the web folder', async () => {
    const res = await app().request('http://localhost/..%2f..%2f..%2fetc%2fpasswd');
    expect(await res.text()).toBe('<html>app</html>');
  });
  it('explains when the web app is not built', async () => {
    const res = await new Hono().get('*', staticHandler(path.join(root, 'missing'))).request('http://localhost/');
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/pnpm build/);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run packages/service`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement**

`packages/service/src/context.ts`:
```ts
export type AppContext = {
  configDir: string;
  defaultsDir: string;
  webDist: string;
  port: number;
  token: string;
  version: string;
  home?: string;
  extraOrigins?: string[];
  open: (target: string) => Promise<void>;
  loginItem: { enable: () => Promise<void>; disable: () => Promise<void> };
};
```

`packages/service/src/security.ts`:
```ts
import type { MiddlewareHandler } from 'hono';

/** Spec §15.6: localhost only, a token for tools, same-origin for the browser, Host checks against DNS rebinding. */
export function guard(opts: { port: number; token: string; extraOrigins?: string[] }): MiddlewareHandler {
  const hosts = new Set([`localhost:${opts.port}`, `127.0.0.1:${opts.port}`]);
  const origins = new Set([...hosts, ...(opts.extraOrigins ?? [])]);
  const hostOf = (value: string) => {
    try {
      return new URL(value).host;
    } catch {
      return null;
    }
  };
  return async (c, next) => {
    const url = new URL(c.req.url);
    const host = c.req.header('host') ?? url.host;
    if (!hosts.has(host)) return c.json({ error: 'Unknown host.' }, 403);
    if (!url.pathname.startsWith('/api/') || url.pathname === '/api/health') return next();
    if (c.req.header('x-dev-plumbing-token') === opts.token) return next();
    const origin = c.req.header('origin');
    const sameOrigin = c.req.header('sec-fetch-site') === 'same-origin';
    const originOk = origin === undefined || origins.has(hostOf(origin) ?? '');
    if (sameOrigin && originOk) return next();
    return c.json({ error: 'Not allowed.' }, 401);
  };
}
```

`packages/service/src/static.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Handler } from 'hono';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function staticHandler(root: string): Handler {
  const base = path.resolve(root);
  return async (c) => {
    let rel = '/';
    try {
      rel = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      rel = '/';
    }
    const target = path.resolve(base, `.${rel}`);
    if (target.startsWith(base + path.sep)) {
      try {
        const stat = await fs.stat(target);
        if (stat.isFile()) {
          return new Response(await fs.readFile(target), { headers: { 'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream' } });
        }
      } catch {
        // not a file: fall through to the app shell
      }
    }
    try {
      return new Response(await fs.readFile(path.join(base, 'index.html')), { headers: { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' } });
    } catch {
      return c.text("The web app isn't built yet. Run pnpm build.", 503);
    }
  };
}
```

`packages/service/src/app.ts`:
```ts
import { Hono } from 'hono';
import type { AppContext } from './context';
import { guard } from './security';
import { staticHandler } from './static';

export function createApp(ctx: AppContext): Hono {
  const app = new Hono();
  app.use('*', guard({ port: ctx.port, token: ctx.token, extraOrigins: ctx.extraOrigins }));
  app.get('/api/health', (c) => c.json({ ok: true, version: ctx.version, pid: process.pid }));
  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
  app.get('*', staticHandler(ctx.webDist));
  return app;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/service`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/service pnpm-lock.yaml
git commit -m "feat(service): security guard, static files and health endpoint"
```

---

### Task 9: Projects API

**Files:**
- Create: `packages/service/src/routes/projects.ts`, `packages/service/test/helpers.ts`
- Modify: `packages/service/src/app.ts`
- Test: `packages/service/test/projects.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `findProjects`, `listProjectSummaries`, `loadProjectHome`, `loadTypeItems`, `readProjectDocument`, `ProjectUnreadableError`, `expandHome`, `installDefaults`, `updateSettingsFile`, `writeDemoProjects`, and `AppContext`.
- Produces HTTP routes. All JSON, errors are `{ error: string }`:
  - `GET /api/projects?q=&tab=active|finalized|all&offset=&limit=` → `{ items: ProjectSummary[]; total: number }`
  - `GET /api/projects/:repo/:id` → `ProjectHome`. 404 if unknown; 422 if unreadable.
  - `GET /api/projects/:repo/:id/types/:type` → `{ type: TypeEntry; items: TypeItemRow[] }`
  - `GET /api/projects/:repo/:id/docs/:which` → `{ text: string | null }`
  - `POST /api/open` `{ target: 'config' } | { target: 'source', repo, id }` → `{ ok: true }`
  - Test helpers: `makeContext(overrides?)`, `call(app, path, init?)`

- [ ] **Step 1: Write the test helpers and failing tests**

`packages/service/test/helpers.ts`:
```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Hono } from 'hono';
import { installDefaults, updateSettingsFile, writeDemoProjects } from '@dev-plumbing/core';
import type { AppContext } from '../src/context';

export const TOKEN = 'test-token';
export const DEFAULTS_DIR = path.resolve(import.meta.dirname, '../../../defaults');

export async function makeContext(overrides: Partial<AppContext> = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-svc-'));
  const configDir = path.join(tmp, 'config');
  const root = path.join(tmp, 'projects');
  await installDefaults({ configDir, defaultsDir: DEFAULTS_DIR });
  await updateSettingsFile(configDir, { projectsFolder: root });
  await writeDemoProjects(root, new Date('2026-09-30T12:00:00Z'));
  const opened: string[] = [];
  const login: string[] = [];
  const ctx: AppContext = {
    configDir,
    defaultsDir: DEFAULTS_DIR,
    webDist: path.join(tmp, 'web'),
    port: 4545,
    token: TOKEN,
    version: '0.1.0',
    home: tmp,
    open: async (target) => {
      opened.push(target);
    },
    loginItem: {
      enable: async () => {
        login.push('enable');
      },
      disable: async () => {
        login.push('disable');
      },
    },
    ...overrides,
  };
  return { ctx, tmp, root, opened, login };
}

export function call(app: Hono, pathname: string, init: RequestInit = {}) {
  return app.request(`http://localhost:4545${pathname}`, {
    ...init,
    headers: { 'x-dev-plumbing-token': TOKEN, 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
}
```

`packages/service/test/projects.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { call, makeContext } from './helpers';

describe('projects API', () => {
  it('lists active projects, needs-you first', async () => {
    const { ctx } = await makeContext();
    const body = await (await call(createApp(ctx), '/api/projects')).json();
    expect(body.items.map((s: { id: string }) => s.id)).toEqual(['restock-reminders', 'checkout-redesign']);
    expect(body.total).toBe(2);
  });

  it('pages, searches and switches tabs', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const page = await (await call(app, '/api/projects?tab=all&limit=2')).json();
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
    const found = await (await call(app, '/api/projects?tab=all&q=onboarding')).json();
    expect(found.items.map((s: { id: string }) => s.id)).toEqual(['onboarding-emails']);
  });

  it('returns the project home, and 404 for an unknown project', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const home = await (await call(app, '/api/projects/acme/restock-reminders')).json();
    expect(home.project.title).toBe('Restock reminders');
    expect(home.types).toHaveLength(10);
    expect((await call(app, '/api/projects/acme/nope')).status).toBe(404);
  });

  it('returns 422 with the reason for a broken project', async () => {
    const { ctx, root } = await makeContext();
    await fs.writeFile(path.join(root, 'acme', 'restock-reminders', 'project.json'), '{bad');
    const res = await call(createApp(ctx), '/api/projects/acme/restock-reminders');
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/isn't valid JSON/);
  });

  it('lists one plumbing type and 404s an unknown type', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const body = await (await call(app, '/api/projects/acme/restock-reminders/types/security')).json();
    expect(body.type.noChanges.reason).toMatch(/permissions/);
    expect(body.items).toEqual([]);
    expect((await call(app, '/api/projects/acme/restock-reminders/types/nope')).status).toBe(404);
  });

  it('returns documents', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    expect((await (await call(app, '/api/projects/acme/restock-reminders/docs/draft')).json()).text).toMatch(/SMS and email/);
    expect((await (await call(app, '/api/projects/acme/restock-reminders/docs/final')).json()).text).toBeNull();
    expect((await call(app, '/api/projects/acme/restock-reminders/docs/secrets')).status).toBe(404);
  });

  it('opens the config folder, and explains a missing plan file', async () => {
    const { ctx, opened } = await makeContext();
    const app = createApp(ctx);
    expect((await call(app, '/api/open', { method: 'POST', body: JSON.stringify({ target: 'config' }) })).status).toBe(200);
    expect(opened).toEqual([ctx.configDir]);
    const res = await call(app, '/api/open', { method: 'POST', body: JSON.stringify({ target: 'source', repo: 'acme', id: 'restock-reminders' }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/isn't at .*restock-reminders.md/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/service/test/projects.test.ts`
Expected: FAIL. The routes return 404 and `/api/projects` doesn't exist.

- [ ] **Step 3: Implement**

`packages/service/src/routes/projects.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import {
  expandHome,
  findProjects,
  listProjectSummaries,
  loadConfig,
  loadProjectHome,
  loadTypeItems,
  ProjectUnreadableError,
  readProjectDocument,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';

const clampInt = (value: string | undefined, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const TABS = ['active', 'finalized', 'all'] as const;
const DOCS = ['original', 'draft', 'final'] as const;

export function projectRoutes(ctx: AppContext): Hono {
  const r = new Hono();

  async function locate(repo: string, id: string) {
    const cfg = await loadConfig(ctx.configDir);
    const refs = await findProjects(cfg.settings, cfg.repos, ctx.home);
    return { cfg, refs, ref: refs.find((x) => x.repo === repo && x.id === id) };
  }
  const notFound = { error: "That plumbing project doesn't exist." };

  r.get('/projects', async (c) => {
    const cfg = await loadConfig(ctx.configDir);
    const refs = await findProjects(cfg.settings, cfg.repos, ctx.home);
    const tab = TABS.find((t) => t === c.req.query('tab')) ?? 'active';
    return c.json(
      await listProjectSummaries(refs, {
        q: c.req.query('q') ?? '',
        tab,
        offset: clampInt(c.req.query('offset'), 0, 1_000_000, 0),
        limit: clampInt(c.req.query('limit'), 1, 200, cfg.settings.homePageSize),
      }),
    );
  });

  r.get('/projects/:repo/:id', async (c) => {
    const { cfg, ref } = await locate(c.req.param('repo'), c.req.param('id'));
    if (!ref) return c.json(notFound, 404);
    try {
      return c.json(await loadProjectHome(ref, cfg.types));
    } catch (e) {
      if (e instanceof ProjectUnreadableError) return c.json({ error: e.message }, 422);
      throw e;
    }
  });

  r.get('/projects/:repo/:id/types/:type', async (c) => {
    const { cfg, ref } = await locate(c.req.param('repo'), c.req.param('id'));
    if (!ref) return c.json(notFound, 404);
    try {
      const result = await loadTypeItems(ref, cfg.types, c.req.param('type'));
      return result ? c.json(result) : c.json({ error: "That plumbing type doesn't exist or is turned off." }, 404);
    } catch (e) {
      if (e instanceof ProjectUnreadableError) return c.json({ error: e.message }, 422);
      throw e;
    }
  });

  r.get('/projects/:repo/:id/docs/:which', async (c) => {
    const which = DOCS.find((d) => d === c.req.param('which'));
    if (!which) return c.json({ error: 'Unknown document.' }, 404);
    const { ref } = await locate(c.req.param('repo'), c.req.param('id'));
    if (!ref) return c.json(notFound, 404);
    try {
      return c.json({ text: await readProjectDocument(ref, which) });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 422);
    }
  });

  r.post('/open', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { target?: string; repo?: string; id?: string };
    if (body.target === 'config') {
      await ctx.open(ctx.configDir);
      return c.json({ ok: true });
    }
    if (body.target === 'source' && body.repo && body.id) {
      const { ref } = await locate(body.repo, body.id);
      if (!ref) return c.json(notFound, 404);
      const home = await loadProjectHome(ref, []).catch(() => null);
      if (!home) return c.json({ error: 'This plumbing project could not be read.' }, 422);
      const file = path.join(expandHome(home.project.source.clone, ctx.home), home.project.source.path);
      if (!(await fs.access(file).then(() => true, () => false))) return c.json({ error: `The plan isn't at ${file} any more.` }, 404);
      await ctx.open(file);
      return c.json({ ok: true });
    }
    return c.json({ error: 'Unknown target.' }, 400);
  });

  return r;
}
```

In `packages/service/src/app.ts`, add the import and mount the routes before the `/api/*` 404 line:
```ts
import { projectRoutes } from './routes/projects';
```
```ts
  app.get('/api/health', (c) => c.json({ ok: true, version: ctx.version, pid: process.pid }));
  app.route('/api', projectRoutes(ctx));
  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/service
git commit -m "feat(service): projects, project home, type items, documents and open API"
```

---

### Task 10: Config and rules API

**Files:**
- Create: `packages/service/src/routes/config.ts`
- Modify: `packages/service/src/app.ts`
- Test: `packages/service/test/config.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `parseSettings`, `parseAgents`, `repoProfileSchema`, `formatZodError`, `parseRulesFile`, `newRulesFileTemplate`, `resetToDefault`, `writeFileAtomic`, `writeJsonAtomic`, `type RuleSummary`.
- Produces HTTP routes:
  - `GET /api/config` → `{ dir, settings, agents, repos, types: RuleSummary[], outputs: string[], problems: ConfigProblem[] }`
  - `PUT /api/settings` → `{ value: Settings; restartRequired: boolean }`, or 400 `{ error, errors: FieldError[] }`
  - `PUT /api/agents` → `{ value: AgentsConfig }`, or 400 `{ error, errors }`
  - `PUT /api/repos/:name` → `{ value: RepoProfile }`, or 400 `{ error }`
  - `GET /api/rules` → `{ types: RuleSummary[]; broken: { file; error }[]; outputs: string[] }`
  - `GET /api/rules/:file` and `GET /api/outputs/:file` → `{ text; hasDefault }`
  - `PUT /api/rules/:file` and `PUT /api/outputs/:file` `{ text }` → `{ ok: true }`, or 400 `{ error }`
  - `POST /api/rules` `{ id, title }` → 201 `{ file }` / 400 / 409
  - `POST /api/reset` `{ file }` → `{ ok: true }` / 400

- [ ] **Step 1: Write the failing tests**

`packages/service/test/config.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { call, makeContext } from './helpers';

const put = (body: unknown) => ({ method: 'PUT', body: JSON.stringify(body) });
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

describe('config API', () => {
  it('returns settings, agents, types and problems', async () => {
    const { ctx } = await makeContext();
    const body = await (await call(createApp(ctx), '/api/config')).json();
    expect(body.settings.port).toBe(4545);
    expect(body.agents.maxParallel).toBe(4);
    expect(body.types).toHaveLength(10);
    expect(body.types[0]).toEqual({ file: 'architecture.md', id: 'architecture', title: 'Architecture', order: 1, screen: 'diagram', enabled: true });
    expect(body.problems).toEqual([]);
  });

  it('saves valid settings, and refuses invalid ones without writing', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const current = (await (await call(app, '/api/config')).json()).settings;
    const ok = await call(app, '/api/settings', put({ ...current, homePageSize: 5 }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).restartRequired).toBe(false);
    const bad = await call(app, '/api/settings', put({ ...current, port: 80 }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).errors[0]).toMatchObject({ key: 'port' });
    const saved = JSON.parse(await fs.readFile(path.join(ctx.configDir, 'settings.json'), 'utf8'));
    expect(saved.homePageSize).toBe(5);
    expect(saved.port).toBe(4545);
  });

  it('turns the login item off and on, and flags a port change', async () => {
    const { ctx, login } = await makeContext();
    const app = createApp(ctx);
    const current = (await (await call(app, '/api/config')).json()).settings;
    await call(app, '/api/settings', put({ ...current, startAtLogin: false }));
    await call(app, '/api/settings', put({ ...current, startAtLogin: true }));
    expect(login).toEqual(['disable', 'enable']);
    expect((await (await call(app, '/api/settings', put({ ...current, port: 5050 }))).json()).restartRequired).toBe(true);
  });

  it('saves agents and repo profiles, with validation', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    expect((await call(app, '/api/agents', put({ maxParallel: 2 }))).status).toBe(200);
    expect((await call(app, '/api/agents', put({ maxParallel: 99 }))).status).toBe(400);
    const profile = { name: 'acme', match: ['github.com/acme/acme'] };
    expect((await call(app, '/api/repos/acme', put(profile))).status).toBe(200);
    expect((await call(app, '/api/repos/acme', put({ ...profile, match: [] }))).status).toBe(400);
    const renamed = await call(app, '/api/repos/acme', put({ ...profile, name: 'other' }));
    expect((await renamed.json()).error).toMatch(/must stay "acme"/);
  });

  it('reads and saves a rules file, and refuses a broken header', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const { text, hasDefault } = await (await call(app, '/api/rules/ideas.md')).json();
    expect(hasDefault).toBe(true);
    const bad = await call(app, '/api/rules/ideas.md', put({ text: 'no header' }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/Header field/);
    expect((await call(app, '/api/rules/ideas.md', put({ text: text.replace('title: Ideas', 'title: Ideas and wishes') }))).status).toBe(200);
    const types = (await (await call(app, '/api/config')).json()).types;
    expect(types.find((t: { id: string }) => t.id === 'ideas').title).toBe('Ideas and wishes');
  });

  it('lists rules files that are broken on disk', async () => {
    const { ctx } = await makeContext();
    await fs.writeFile(path.join(ctx.configDir, 'plumbing', 'ideas.md'), 'broken');
    const body = await (await call(createApp(ctx), '/api/rules')).json();
    expect(body.types).toHaveLength(9);
    expect(body.broken).toEqual([{ file: 'ideas.md', error: expect.stringMatching(/Header field/) }]);
    expect(body.outputs).toEqual(['finalize.md', 'whiteboard-defense.md']);
  });

  it('creates a new plumbing type once', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    const res = await call(app, '/api/rules', post({ id: 'rollout', title: 'Rollout' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ file: 'rollout.md' });
    expect((await call(app, '/api/rules', post({ id: 'rollout', title: 'Rollout' }))).status).toBe(409);
    expect((await call(app, '/api/rules', post({ id: 'Bad Id', title: 'x' }))).status).toBe(400);
    const types = (await (await call(app, '/api/config')).json()).types;
    expect(types.at(-1)).toMatchObject({ id: 'rollout', order: 11 });
  });

  it('edits output rules and resets files to their defaults', async () => {
    const { ctx } = await makeContext();
    const app = createApp(ctx);
    expect((await call(app, '/api/outputs/finalize.md', put({ text: '# Mine' }))).status).toBe(200);
    expect((await (await call(app, '/api/outputs/finalize.md')).json()).text).toBe('# Mine');
    expect((await call(app, '/api/reset', post({ file: 'outputs/finalize.md' }))).status).toBe(200);
    expect((await (await call(app, '/api/outputs/finalize.md')).json()).text).toMatch(/Finalize spec rules/);
    expect((await call(app, '/api/reset', post({ file: '../../etc/passwd' }))).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/service/test/config.test.ts`
Expected: FAIL (404s).

- [ ] **Step 3: Implement**

`packages/service/src/routes/config.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import {
  formatZodError,
  loadConfig,
  newRulesFileTemplate,
  parseAgents,
  parseRulesFile,
  parseSettings,
  repoProfileSchema,
  resetToDefault,
  writeFileAtomic,
  writeJsonAtomic,
  type PlumbingType,
  type RuleSummary,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';

const FILE = /^[a-z][a-z0-9-]*\.md$/;
const NAME = /^[a-z0-9][a-z0-9._-]*$/i;
const exists = (p: string) => fs.access(p).then(() => true, () => false);
const summaries = (types: PlumbingType[]): RuleSummary[] =>
  types.map((t) => ({ file: t.file, id: t.id, title: t.title, order: t.order, screen: t.screen, enabled: t.enabled }));

export function configRoutes(ctx: AppContext): Hono {
  const r = new Hono();

  r.get('/config', async (c) => {
    const cfg = await loadConfig(ctx.configDir);
    return c.json({ dir: cfg.dir, settings: cfg.settings, agents: cfg.agents, repos: cfg.repos, types: summaries(cfg.types), outputs: cfg.outputs, problems: cfg.problems });
  });

  r.put('/settings', async (c) => {
    const parsed = parseSettings(await c.req.json().catch(() => null));
    if (parsed.errors.length) return c.json({ error: 'Some settings are not valid.', errors: parsed.errors }, 400);
    const before = (await loadConfig(ctx.configDir)).settings;
    await writeJsonAtomic(path.join(ctx.configDir, 'settings.json'), parsed.value);
    if (before.startAtLogin !== parsed.value.startAtLogin) {
      await (parsed.value.startAtLogin ? ctx.loginItem.enable() : ctx.loginItem.disable());
    }
    return c.json({ value: parsed.value, restartRequired: before.port !== parsed.value.port });
  });

  r.put('/agents', async (c) => {
    const parsed = parseAgents(await c.req.json().catch(() => null));
    if (parsed.errors.length) return c.json({ error: 'Some agent settings are not valid.', errors: parsed.errors }, 400);
    await writeJsonAtomic(path.join(ctx.configDir, 'agents.json'), parsed.value);
    return c.json({ value: parsed.value });
  });

  r.put('/repos/:name', async (c) => {
    const name = c.req.param('name');
    if (!NAME.test(name)) return c.json({ error: 'Unknown repo profile.' }, 404);
    const parsed = repoProfileSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: formatZodError(parsed.error) }, 400);
    if (parsed.data.name !== name) return c.json({ error: `The profile's name must stay "${name}".` }, 400);
    await writeJsonAtomic(path.join(ctx.configDir, 'repos', `${name}.json`), parsed.data);
    return c.json({ value: parsed.data });
  });

  r.get('/rules', async (c) => {
    const cfg = await loadConfig(ctx.configDir);
    const broken = cfg.problems
      .filter((p) => p.file.startsWith('plumbing/'))
      .map((p) => ({ file: p.file.slice('plumbing/'.length), error: p.message }));
    return c.json({ types: summaries(cfg.types), broken, outputs: cfg.outputs });
  });

  r.post('/rules', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { id?: unknown; title?: unknown };
    const id = String(body.id ?? '').trim();
    const title = String(body.title ?? '').trim();
    if (!/^[a-z][a-z0-9-]*$/.test(id)) return c.json({ error: 'Use lowercase letters, numbers and dashes for the id, starting with a letter.' }, 400);
    if (!title) return c.json({ error: 'Give the plumbing type a title.' }, 400);
    const file = `${id}.md`;
    const target = path.join(ctx.configDir, 'plumbing', file);
    if (await exists(target)) return c.json({ error: `${file} already exists.` }, 409);
    const cfg = await loadConfig(ctx.configDir);
    const order = Math.max(0, ...cfg.types.map((t) => t.order)) + 1;
    await writeFileAtomic(target, newRulesFileTemplate(id, title, order));
    return c.json({ file }, 201);
  });

  for (const [segment, folder] of [['rules', 'plumbing'], ['outputs', 'outputs']] as const) {
    r.get(`/${segment}/:file`, async (c) => {
      const file = c.req.param('file');
      if (!FILE.test(file)) return c.json({ error: 'Unknown file.' }, 404);
      const target = path.join(ctx.configDir, folder, file);
      if (!(await exists(target))) return c.json({ error: `${file} doesn't exist.` }, 404);
      return c.json({ text: await fs.readFile(target, 'utf8'), hasDefault: await exists(path.join(ctx.defaultsDir, folder, file)) });
    });

    r.put(`/${segment}/:file`, async (c) => {
      const file = c.req.param('file');
      if (!FILE.test(file)) return c.json({ error: 'Unknown file.' }, 404);
      const target = path.join(ctx.configDir, folder, file);
      if (!(await exists(target))) return c.json({ error: `${file} doesn't exist.` }, 404);
      const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
      if (typeof body.text !== 'string' || !body.text.trim()) return c.json({ error: 'The file is empty.' }, 400);
      if (folder === 'plumbing') {
        const parsed = parseRulesFile(file, body.text);
        if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      }
      await writeFileAtomic(target, body.text);
      return c.json({ ok: true });
    });
  }

  r.post('/reset', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { file?: unknown };
    if (typeof body.file !== 'string') return c.json({ error: 'Say which file to reset.' }, 400);
    try {
      await resetToDefault({ configDir: ctx.configDir, defaultsDir: ctx.defaultsDir, file: body.file });
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  });

  return r;
}
```

In `packages/service/src/app.ts`, add the import and mount the routes next to `projectRoutes`:
```ts
import { configRoutes } from './routes/config';
```
```ts
  app.route('/api', projectRoutes(ctx));
  app.route('/api', configRoutes(ctx));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/service
git commit -m "feat(service): settings, agents, repo profiles, rules and reset API"
```

---

### Task 11: Service entry point, listening and port handling

**Files:**
- Create: `packages/service/src/listen.ts`, `packages/service/src/index.ts`, `packages/service/tsup.config.ts`
- Test: `packages/service/test/listen.test.ts`

**Interfaces:**
- Consumes: `configDir`, `loadConfig`, `writeRunFile`, `removeRunFile`, `enableLoginItem`, `disableLoginItem`, `VERSION`, `createApp`.
- Produces: `class PortInUseError`, `listen(fetch, port): Promise<ServerType>`, and the built entry `packages/service/dist/index.js`. That entry reads config from `DEV_PLUMBING_HOME` (default `~/.dev-plumbing`), binds `127.0.0.1:<settings.port>`, writes `run/service.json`, and removes it on SIGTERM or SIGINT.

- [ ] **Step 1: Write the failing test**

`packages/service/test/listen.test.ts`:
```ts
import net from 'node:net';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { listen, PortInUseError } from '../src/listen';

async function freePort(): Promise<number> {
  const s = net.createServer().listen(0, '127.0.0.1');
  await once(s, 'listening');
  const port = (s.address() as net.AddressInfo).port;
  s.close();
  await once(s, 'close');
  return port;
}
const closers: (() => void)[] = [];
afterEach(() => closers.splice(0).forEach((f) => f()));

describe('listen', () => {
  it('serves on 127.0.0.1', async () => {
    const port = await freePort();
    const server = await listen(() => new Response('ok'), port);
    closers.push(() => server.close());
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('ok');
  });

  it('explains when another program has the port', async () => {
    const port = await freePort();
    const blocker = net.createServer().listen(port, '127.0.0.1');
    await once(blocker, 'listening');
    closers.push(() => blocker.close());
    const attempt = listen(() => new Response('ok'), port);
    await expect(attempt).rejects.toBeInstanceOf(PortInUseError);
    await expect(attempt).rejects.toThrow(/already in use by another program.*settings\.json/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/service/test/listen.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`packages/service/src/listen.ts`:
```ts
import { serve, type ServerType } from '@hono/node-server';

export class PortInUseError extends Error {}

export function listen(fetch: (request: Request) => Response | Promise<Response>, port: number): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch, port, hostname: '127.0.0.1' }, () => resolve(server));
    server.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'EADDRINUSE'
          ? new PortInUseError(`Port ${port} is already in use by another program. Change "port" in ~/.dev-plumbing/settings.json, then run dev-plumbing start again.`)
          : err,
      );
    });
  });
}
```

`packages/service/src/index.ts`:
```ts
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { configDir, disableLoginItem, enableLoginItem, loadConfig, removeRunFile, VERSION, writeRunFile } from '@dev-plumbing/core';
import { createApp } from './app';
import { listen, PortInUseError } from './listen';

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

async function main() {
  const dir = configDir();
  const { settings } = await loadConfig(dir);
  const token = randomBytes(24).toString('hex');
  const cliPath = here('../../cli/dist/index.js');
  const app = createApp({
    configDir: dir,
    defaultsDir: process.env.DEV_PLUMBING_DEFAULTS ?? here('../../../defaults'),
    webDist: here('../../web/dist'),
    port: settings.port,
    token,
    version: VERSION,
    extraOrigins: process.env.DEV_PLUMBING_DEV ? ['localhost:5173', '127.0.0.1:5173'] : [],
    open: (target) => new Promise<void>((resolve, reject) => execFile('open', [target], (err) => (err ? reject(err) : resolve()))),
    loginItem: {
      enable: async () => {
        await enableLoginItem({ nodePath: process.execPath, cliPath, configDir: dir });
      },
      disable: async () => {
        await disableLoginItem();
      },
    },
  });

  let server: Awaited<ReturnType<typeof listen>>;
  try {
    server = await listen(app.fetch, settings.port);
  } catch (e) {
    console.error(e instanceof PortInUseError ? e.message : e);
    process.exit(1);
  }
  await writeRunFile(dir, { pid: process.pid, port: settings.port, token, startedAt: new Date().toISOString(), version: VERSION });
  console.log(`dev-plumbing is running at http://localhost:${settings.port}`);

  const stop = async () => {
    server.close();
    await removeRunFile(dir, process.pid);
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

void main();
```

`packages/service/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  noExternal: [/.*/],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
```

- [ ] **Step 4: Run the test, build, and smoke-test the bundle**

Run: `pnpm vitest run packages/service && pnpm --filter @dev-plumbing/service build`
Expected: tests PASS, and `packages/service/dist/index.js` exists.

Run:
```bash
T=$(mktemp -d) && echo '{"port": 45461}' > $T/settings.json && (DEV_PLUMBING_HOME=$T node packages/service/dist/index.js & echo $! > $T/pid) && sleep 1 && curl -s http://127.0.0.1:45461/api/health; kill $(cat $T/pid)
```
Expected: `{"ok":true,"version":"0.1.0","pid":…}`.

- [ ] **Step 5: Commit**

```bash
git add packages/service
git commit -m "feat(service): entry point, run file and clear port-in-use error"
```

---

### Task 12: The `dev-plumbing` CLI

**Files:**
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/vitest.config.ts`, `packages/cli/tsup.config.ts`
- Create: `packages/cli/src/setup.ts`, `packages/cli/src/control.ts`, `packages/cli/src/index.ts`
- Test: `packages/cli/test/setup.test.ts`, `packages/cli/test/service.integration.test.ts`

**Interfaces:**
- Consumes: `installDefaults`, `loadConfig`, `updateSettingsFile`, `writeReadme`, `expandHome`, `configDir`, `readRunFile`, `removeRunFile`, `enableLoginItem`, `disableLoginItem`, `writeDemoProjects`, `VERSION`.
- Produces:
  - `runSetup(opts): Promise<{ settings: Settings; created: string[] }>`
  - `health(port, timeoutMs?)`, `startService({ configDir, serviceEntry, env?, waitMs? }): Promise<{ status: 'started' | 'already-running'; url; pid }>`, `stopService(configDir, waitMs?): Promise<'stopped' | 'not-running'>`, `serviceStatus(configDir)`
  - The `dev-plumbing` bin, with commands: `setup [--projects-folder <path>] [--port <n>] [--no-login-item] [--no-start] [-y]`, `start`, `stop`, `status`, `open`, `docs`, `demo`

- [ ] **Step 1: Create the package and install**

`packages/cli/package.json`:
```json
{
  "name": "@dev-plumbing/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "dev-plumbing": "./dist/index.js" },
  "scripts": { "build": "tsup", "typecheck": "tsc --noEmit -p tsconfig.json" }
}
```

`packages/cli/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "tsup.config.ts"] }
```

`packages/cli/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'cli', environment: 'node', include: ['test/**/*.test.ts'], exclude: ['**/*.integration.test.ts', '**/node_modules/**'] },
});
```

`packages/cli/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  noExternal: [/.*/],
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
```

Run:
```bash
pnpm --filter @dev-plumbing/cli add @dev-plumbing/core@workspace:* commander@^14
```

- [ ] **Step 2: Write the failing tests**

`packages/cli/test/setup.test.ts`:
```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@dev-plumbing/core';
import { runSetup, type SetupOptions } from '../src/setup';

const DEFAULTS_DIR = path.resolve(import.meta.dirname, '../../../defaults');
let home: string;
let dir: string;
let calls: string[];

function options(over: Partial<SetupOptions> = {}): SetupOptions {
  return {
    configDir: dir,
    defaultsDir: DEFAULTS_DIR,
    home,
    loginItem: true,
    yes: true,
    ask: async (q, fallback) => {
      calls.push(`ask:${q}`);
      return fallback;
    },
    enableLogin: async () => {
      calls.push('enable');
    },
    disableLogin: async () => {
      calls.push('disable');
    },
    log: () => {},
    ...over,
  };
}

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-setup-'));
  dir = path.join(home, '.dev-plumbing');
  calls = [];
});

describe('setup', () => {
  it('creates the config, README and projects folder, and turns on the login item', async () => {
    const r = await runSetup(options());
    expect(r.created).toContain('settings.json');
    expect(await fs.readFile(path.join(dir, 'README.md'), 'utf8')).toMatch(/dev-plumbing configuration/);
    await fs.access(path.join(home, 'dev-plumbing-projects'));
    expect(calls).toEqual(['enable']);
  });

  it('stores the projects folder and port you pass, expanding ~', async () => {
    const r = await runSetup(options({ projectsFolder: '~/my projects', port: 45000 }));
    expect(r.settings.projectsFolder).toBe('~/my projects');
    expect(r.settings.port).toBe(45000);
    await fs.access(path.join(home, 'my projects'));
  });

  it('leaves the login item alone with --no-login-item', async () => {
    const r = await runSetup(options({ loginItem: false }));
    expect(r.settings.startAtLogin).toBe(false);
    expect(calls).toEqual([]);
  });

  it('asks when not told --yes', async () => {
    await runSetup(options({ yes: false }));
    expect(calls.filter((c) => c.startsWith('ask:'))).toHaveLength(2);
  });

  it('running setup twice keeps your edits', async () => {
    await runSetup(options());
    await fs.writeFile(path.join(dir, 'plumbing', 'ideas.md'), (await fs.readFile(path.join(dir, 'plumbing', 'ideas.md'), 'utf8')).replace('title: Ideas', 'title: My ideas'));
    const s = JSON.parse(await fs.readFile(path.join(dir, 'settings.json'), 'utf8'));
    await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ ...s, homePageSize: 33 }));
    await runSetup(options());
    const cfg = await loadConfig(dir);
    expect(cfg.types.find((t) => t.id === 'ideas')?.title).toBe('My ideas');
    expect(cfg.settings.homePageSize).toBe(33);
  });
});
```

`packages/cli/test/service.integration.test.ts`:
```ts
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDefaults, readRunFile, updateSettingsFile, writeRunFile } from '@dev-plumbing/core';
import { serviceStatus, startService, stopService } from '../src/control';

const repo = path.resolve(import.meta.dirname, '../../..');
const SERVICE = path.join(repo, 'packages/service/dist/index.js');
let tmp: string;
let dir: string;
let port: number;

async function freePort(): Promise<number> {
  const s = net.createServer().listen(0, '127.0.0.1');
  await once(s, 'listening');
  const p = (s.address() as net.AddressInfo).port;
  s.close();
  await once(s, 'close');
  return p;
}
const start = () => startService({ configDir: dir, serviceEntry: SERVICE, env: { HOME: tmp } });

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-int-'));
  dir = path.join(tmp, '.dev-plumbing');
  port = await freePort();
  await installDefaults({ configDir: dir, defaultsDir: path.join(repo, 'defaults') });
  await updateSettingsFile(dir, { port, projectsFolder: path.join(tmp, 'projects'), startAtLogin: false });
});
afterEach(async () => {
  await stopService(dir).catch(() => {});
});

describe('service control', () => {
  it('starts, reports already running, and stops', async () => {
    expect((await start()).status).toBe('started');
    expect((await start()).status).toBe('already-running');
    expect((await serviceStatus(dir)).running).toBe(true);
    expect(await stopService(dir)).toBe('stopped');
    expect((await serviceStatus(dir)).running).toBe(false);
    expect(await readRunFile(dir)).toBeNull();
  });

  it('recovers from a stale run file left by a crash', async () => {
    await writeRunFile(dir, { pid: 999_999, port, token: 'old', startedAt: '', version: '' });
    expect((await start()).status).toBe('started');
  });

  it('explains when the port is taken by another program', async () => {
    const blocker = net.createServer().listen(port, '127.0.0.1');
    await once(blocker, 'listening');
    try {
      await expect(start()).rejects.toThrow(/already in use by another program/);
    } finally {
      blocker.close();
    }
  });

  it('protects the API with the run-file token', async () => {
    await start();
    const run = await readRunFile(dir);
    expect((await fetch(`http://127.0.0.1:${port}/api/config`, { headers: { 'x-dev-plumbing-token': run!.token } })).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${port}/api/config`)).status).toBe(401);
  });
});
```

- [ ] **Step 3: Run the unit tests to verify they fail**

Run: `pnpm vitest run packages/cli`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement**

`packages/cli/src/setup.ts`:
```ts
import fs from 'node:fs/promises';
import { expandHome, installDefaults, loadConfig, updateSettingsFile, writeReadme, type Settings } from '@dev-plumbing/core';

export type SetupOptions = {
  configDir: string;
  defaultsDir: string;
  home?: string;
  projectsFolder?: string;
  port?: number;
  loginItem: boolean;
  yes: boolean;
  ask: (question: string, fallback: string) => Promise<string>;
  enableLogin: () => Promise<void>;
  disableLogin: () => Promise<void>;
  log: (line: string) => void;
};

export async function runSetup(o: SetupOptions): Promise<{ settings: Settings; created: string[] }> {
  const { created } = await installDefaults({ configDir: o.configDir, defaultsDir: o.defaultsDir });
  const { settings: current } = await loadConfig(o.configDir);

  const projectsFolder = o.projectsFolder ?? (o.yes ? current.projectsFolder : await o.ask('Where should plumbing projects be stored?', current.projectsFolder));

  let startAtLogin = current.startAtLogin;
  if (!o.loginItem) startAtLogin = false;
  else if (!o.yes) startAtLogin = !/^n/i.test(await o.ask('Start dev-plumbing when you log in? (y/n)', current.startAtLogin ? 'y' : 'n'));

  const settings = await updateSettingsFile(o.configDir, { projectsFolder, startAtLogin, ...(o.port ? { port: o.port } : {}) });
  await fs.mkdir(expandHome(projectsFolder, o.home), { recursive: true });
  await writeReadme(o.configDir);
  if (o.loginItem) await (settings.startAtLogin ? o.enableLogin() : o.disableLogin());

  o.log(`Config folder: ${o.configDir}${created.length ? ` (added ${created.length} files)` : ''}`);
  o.log(`Plumbing projects: ${projectsFolder}`);
  o.log(`Start at login: ${settings.startAtLogin ? 'on' : 'off'}`);
  return { settings, created };
}
```

`packages/cli/src/control.ts`:
```ts
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, readRunFile, removeRunFile } from '@dev-plumbing/core';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function health(port: number, timeoutMs = 1000): Promise<{ pid: number; version: string } | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = (await res.json()) as { pid?: unknown; version?: unknown };
    return typeof body.pid === 'number' ? { pid: body.pid, version: String(body.version) } : null;
  } catch {
    return null;
  }
}

async function tail(file: string, lines = 15): Promise<string> {
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  return text.trim().split('\n').slice(-lines).join('\n');
}

export async function startService(o: { configDir: string; serviceEntry: string; env?: NodeJS.ProcessEnv; waitMs?: number }) {
  const { settings } = await loadConfig(o.configDir);
  const run = await readRunFile(o.configDir);
  if (run) {
    const h = await health(run.port);
    if (h && h.pid === run.pid) return { status: 'already-running' as const, url: `http://localhost:${run.port}`, pid: run.pid };
    await removeRunFile(o.configDir);
  }
  const running = await health(settings.port);
  if (running) return { status: 'already-running' as const, url: `http://localhost:${settings.port}`, pid: running.pid };

  await fs.access(o.serviceEntry).catch(() => {
    throw new Error(`The service isn't built (${o.serviceEntry}). Run pnpm build first.`);
  });
  const logFile = path.join(o.configDir, 'run', 'service.log');
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  const out = openSync(logFile, 'a');
  const child = spawn(process.execPath, [o.serviceEntry], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, ...o.env, DEV_PLUMBING_HOME: o.configDir },
  });
  child.unref();
  const state = { exited: false };
  child.once('exit', () => {
    state.exited = true;
  });

  const waitMs = o.waitMs ?? 10_000;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (state.exited) throw new Error(`The service stopped straight away:\n${await tail(logFile)}`);
    const h = await health(settings.port, 500);
    if (h) return { status: 'started' as const, url: `http://localhost:${settings.port}`, pid: h.pid };
    await sleep(200);
  }
  throw new Error(`The service didn't answer within ${waitMs / 1000}s. See ${logFile}.`);
}

export async function stopService(configDir: string, waitMs = 5000): Promise<'stopped' | 'not-running'> {
  const run = await readRunFile(configDir);
  if (!run) return 'not-running';
  const h = await health(run.port);
  if (!h || h.pid !== run.pid) {
    await removeRunFile(configDir);
    return 'not-running';
  }
  process.kill(run.pid, 'SIGTERM');
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!(await health(run.port, 300))) {
      await removeRunFile(configDir, run.pid);
      return 'stopped';
    }
    await sleep(150);
  }
  throw new Error(`The service (pid ${run.pid}) didn't stop within ${waitMs / 1000}s.`);
}

export async function serviceStatus(configDir: string): Promise<{ running: boolean; url?: string; pid?: number; version?: string }> {
  const run = await readRunFile(configDir);
  const port = run?.port ?? (await loadConfig(configDir)).settings.port;
  const h = await health(port);
  return h ? { running: true, url: `http://localhost:${port}`, pid: h.pid, version: h.version } : { running: false };
}
```

`packages/cli/src/index.ts`:
```ts
import { execFile } from 'node:child_process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { configDir, disableLoginItem, enableLoginItem, expandHome, loadConfig, VERSION, writeDemoProjects, writeReadme } from '@dev-plumbing/core';
import { serviceStatus, startService, stopService } from './control';
import { runSetup } from './setup';

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const SERVICE_ENTRY = here('../../service/dist/index.js');
const DEFAULTS_DIR = process.env.DEV_PLUMBING_DEFAULTS ?? here('../../../defaults');
const CLI_PATH = fileURLToPath(import.meta.url);

function openUrl(url: string) {
  if (process.platform === 'darwin') execFile('open', [url]);
  else console.log(`Open ${url} in your browser.`);
}

async function ask(question: string, fallback: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`${question} [${fallback}] `)).trim() || fallback;
  } finally {
    rl.close();
  }
}

async function run(task: () => Promise<void>) {
  try {
    await task();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

const program = new Command().name('dev-plumbing').description('Plumb a plan: views, threads and answers in a local app.').version(VERSION);

program
  .command('setup')
  .description('Create ~/.dev-plumbing, choose where plumbing projects live, and start the app.')
  .option('--projects-folder <path>', 'where plumbing projects are stored')
  .option('--port <number>', 'port for the app', (v) => Number(v))
  .option('--no-login-item', "don't start at login, and don't touch the login item")
  .option('--no-start', "don't start the service or open the browser afterwards")
  .option('-y, --yes', 'keep the current or default answers without asking')
  .action((opts: { projectsFolder?: string; port?: number; loginItem: boolean; start: boolean; yes?: boolean }) =>
    run(async () => {
      const dir = configDir();
      await runSetup({
        configDir: dir,
        defaultsDir: DEFAULTS_DIR,
        projectsFolder: opts.projectsFolder,
        port: opts.port,
        loginItem: opts.loginItem,
        yes: Boolean(opts.yes),
        ask,
        enableLogin: async () => {
          await enableLoginItem({ nodePath: process.execPath, cliPath: CLI_PATH, configDir: dir });
        },
        disableLogin: async () => {
          await disableLoginItem();
        },
        log: (line) => console.log(line),
      });
      if (opts.start) {
        const r = await startService({ configDir: dir, serviceEntry: SERVICE_ENTRY });
        console.log(`dev-plumbing is running at ${r.url}`);
        openUrl(r.url);
      }
    }),
  );

program.command('start').description('Start the service if it is not running.').action(() =>
  run(async () => {
    const r = await startService({ configDir: configDir(), serviceEntry: SERVICE_ENTRY });
    console.log(r.status === 'started' ? `Started at ${r.url}` : `Already running at ${r.url}`);
  }),
);

program.command('stop').description('Stop the service.').action(() =>
  run(async () => {
    console.log((await stopService(configDir())) === 'stopped' ? 'Stopped.' : 'It was not running.');
  }),
);

program.command('status').description('Show whether the service is running.').action(() =>
  run(async () => {
    const dir = configDir();
    const s = await serviceStatus(dir);
    console.log(s.running ? `Running at ${s.url} (pid ${s.pid}, version ${s.version})` : 'Not running.');
    console.log(`Config folder: ${dir}`);
  }),
);

program.command('open').description('Start the service if needed and open the app.').action(() =>
  run(async () => {
    const r = await startService({ configDir: configDir(), serviceEntry: SERVICE_ENTRY });
    openUrl(r.url);
  }),
);

program.command('docs').description('Rewrite ~/.dev-plumbing/README.md.').action(() =>
  run(async () => {
    console.log(`Wrote ${await writeReadme(configDir())}`);
  }),
);

program.command('demo').description('Add three example plumbing projects so you can look around.').action(() =>
  run(async () => {
    const { settings } = await loadConfig(configDir());
    const created = await writeDemoProjects(expandHome(settings.projectsFolder));
    console.log(created.length ? `Added ${created.length} example projects.` : 'The example projects are already there.');
  }),
);

await program.parseAsync(process.argv);
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `pnpm vitest run packages/cli`
Expected: PASS (5 tests).

- [ ] **Step 6: Build and run the integration tests**

Run: `pnpm --filter @dev-plumbing/service build && pnpm --filter @dev-plumbing/cli build && pnpm vitest run --config vitest.integration.config.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Try the real CLI against a temp home**

Run:
```bash
T=$(mktemp -d) && export HOME=$T DEV_PLUMBING_HOME=$T/.dev-plumbing && node packages/cli/dist/index.js setup -y --no-login-item --no-start --port 45462 && node packages/cli/dist/index.js demo && node packages/cli/dist/index.js start && node packages/cli/dist/index.js status && node packages/cli/dist/index.js stop
```
Expected: the setup summary, then `Added 3 example projects.`, `Started at http://localhost:45462`, `Running at …`, `Stopped.`

- [ ] **Step 8: Commit**

```bash
git add packages/cli pnpm-lock.yaml
git commit -m "feat(cli): setup, start, stop, status, open, docs and demo commands"
```

---

### Task 13: Web app scaffold, Ink wash tokens, theme and e2e harness

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/vitest.config.ts`, `packages/web/playwright.config.ts`, `packages/web/index.html`
- Create: `packages/web/src/main.tsx`, `packages/web/src/router.tsx`, `packages/web/src/styles.css`, `packages/web/src/theme/tokens.css`, `packages/web/src/theme/theme.ts`
- Create: `packages/web/src/api/client.ts`, `packages/web/src/lib/useConfig.ts`, `packages/web/src/components/PageMessage.tsx`, `packages/web/src/pages/Root.tsx`, `packages/web/src/pages/placeholders.tsx`
- Create: `packages/web/e2e/env.ts`, `packages/web/e2e/global-setup.ts`, `packages/web/e2e/global-teardown.ts`
- Test: `packages/web/src/theme/theme.test.ts`, `packages/web/src/theme/palette.test.ts`, `packages/web/e2e/theme.spec.ts`

**Interfaces:**
- Consumes: the service API (Tasks 9–10); the CLI's `setup`, `demo`, `start` and `stop` (Task 12); types from `@dev-plumbing/core/schemas`.
- Produces:
  - `api` (every endpoint), `class ApiError { status; body }`, `type ConfigResponse`, `type RulesResponse`, `type FileResponse`
  - `useConfig()`, `resolveTheme(pref, prefersDark)`, `applyTheme(pref): () => void`
  - The route tree: `/`, `/p/$repo/$project` (with children `/`, `t/$type` and `d/$doc`), `/settings`, `/rules`, `/rules/$file`, `/rules/outputs/$name`. Each page comes from `pages/placeholders.tsx` until its own task replaces it.
  - Token utilities: `bg-canvas`, `bg-cell`, `bg-sidebar`, `bg-selection`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-separator`, `bg-mist`, `text-slate` / `bg-slate`, `text-seal` / `bg-seal`, `text-moss` / `bg-moss`, `text-amber`, `text-ochre`, `bg-button`, `text-button-text`, `font-sans`, `font-mono`
  - e2e helpers: `E2E_PORT = 45459`, `e2eTmp()`, `e2eEnv()`, `configPath(rel)`, `readJson(rel)`, `writeJson(rel, v)`, `noSideScroll(page)`

- [ ] **Step 1: Create the package and install**

`packages/web/package.json`:
```json
{
  "name": "@dev-plumbing/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  }
}
```

`packages/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2023", "DOM", "DOM.Iterable"], "types": ["vite/client", "node"] },
  "include": ["src", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

`packages/web/vite.config.ts`:
```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:4545', changeOrigin: true } } },
});
```

`packages/web/vitest.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: { name: 'web', environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
```

`packages/web/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';
import { E2E_PORT } from './e2e/env';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: { baseURL: `http://localhost:${E2E_PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

`packages/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>dev-plumbing</title>
    <script>
      document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Run:
```bash
pnpm --filter @dev-plumbing/web add @dev-plumbing/core@workspace:* react@^19.1 react-dom@^19.1 @tanstack/react-router@^1 @tanstack/react-query@^5 react-markdown@^10 remark-gfm@^4
pnpm --filter @dev-plumbing/web add -D vite@^7 @vitejs/plugin-react@^5 tailwindcss@^4.1 @tailwindcss/vite@^4.1 @types/react@^19 @types/react-dom@^19 jsdom@^26 @testing-library/react@^16 @testing-library/dom@^10 @playwright/test@^1.55
pnpm --filter @dev-plumbing/web exec playwright install chromium
```

- [ ] **Step 2: Write the failing unit tests**

`packages/web/src/theme/theme.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('theme', () => {
  it('uses the saved choice, or the system setting for "system"', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
```

`packages/web/src/theme/palette.test.ts` checks the §16 rules against the source files:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = path.resolve(import.meta.dirname, '..');
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(tsx?|css)$/.test(e.name) && !e.name.endsWith('.test.ts') ? [p] : [];
  });
}
const DEFAULT_PALETTE = /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|zinc|neutral|stone|slate)-\d{2,3}\b/;

describe('Ink wash rules', () => {
  it('uses no default Tailwind colours, gradients or paper colour', () => {
    const offenders = files(src).filter((f) => {
      const text = fs.readFileSync(f, 'utf8');
      return DEFAULT_PALETTE.test(text) || /bg-(?:linear|radial|conic|gradient)-/.test(text) || /#FFFFE3/i.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the unit tests to verify they fail**

Run: `pnpm vitest run packages/web`
Expected: FAIL (`./theme` not found).

- [ ] **Step 4: Implement the theme, API client and app shell**

`packages/web/src/theme/tokens.css`:
```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

:root {
  --canvas: #ffffff;
  --cell: #ffffff;
  --sidebar: rgb(246 246 244 / 0.86);
  --selection: rgb(74 74 74 / 0.07);
  --text: #262625;
  --text-2: #4a4a4a;
  --text-3: #8a8a86;
  --separator: rgb(74 74 74 / 0.14);
  --mist: #cbcbcb;
  --slate: #6d8196;
  --seal: #a5503b;
  --moss: #5f8a5b;
  --amber: #c07a2c;
  --ochre: #a88a25;
  --button: #4a4a4a;
  --button-text: #ffffff;
  color-scheme: light;
}

[data-theme="dark"] {
  --canvas: #1e1e1d;
  --cell: #2a2a28;
  --sidebar: rgb(38 38 36 / 0.86);
  --selection: rgb(203 203 203 / 0.11);
  --text: #f2f2f0;
  --text-2: #cbcbcb;
  --text-3: #8c8c86;
  --separator: rgb(203 203 203 / 0.14);
  --mist: #55554f;
  --slate: #93a6ba;
  --seal: #d07c63;
  --moss: #8db587;
  --amber: #e0a15a;
  --ochre: #d9bc5c;
  --button: #f2f2f0;
  --button-text: #262625;
  color-scheme: dark;
}

/* Switch off Tailwind's default palette so only Ink wash colours exist (§16). */
@theme {
  --color-*: initial;
}

@theme inline {
  --color-white: #ffffff;
  --color-black: #000000;
  --color-canvas: var(--canvas);
  --color-cell: var(--cell);
  --color-sidebar: var(--sidebar);
  --color-selection: var(--selection);
  --color-ink: var(--text);
  --color-ink-2: var(--text-2);
  --color-ink-3: var(--text-3);
  --color-separator: var(--separator);
  --color-mist: var(--mist);
  --color-slate: var(--slate);
  --color-seal: var(--seal);
  --color-moss: var(--moss);
  --color-amber: var(--amber);
  --color-ochre: var(--ochre);
  --color-button: var(--button);
  --color-button-text: var(--button-text);
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
}
```

`packages/web/src/styles.css`:
```css
@import "tailwindcss";
@import "./theme/tokens.css";

html,
body {
  background: var(--canvas);
  color: var(--text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

.doc { font-size: 14px; line-height: 1.6; color: var(--text); overflow-wrap: anywhere; }
.doc h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 12px; }
.doc h2 { font-size: 17px; font-weight: 600; margin: 22px 0 8px; }
.doc h3 { font-size: 15px; font-weight: 600; margin: 18px 0 6px; }
.doc p, .doc ul, .doc ol { margin: 0 0 10px; }
.doc ul { list-style: disc; padding-left: 20px; }
.doc ol { list-style: decimal; padding-left: 20px; }
.doc code { font-family: var(--font-mono); font-size: 12.5px; }
.doc pre { font-family: var(--font-mono); font-size: 12.5px; border-left: 2px solid var(--separator); padding: 4px 0 4px 12px; overflow-x: auto; margin: 0 0 12px; }
.doc table { border-collapse: collapse; margin: 0 0 12px; font-size: 13px; display: block; overflow-x: auto; }
.doc th, .doc td { border-bottom: 0.5px solid var(--separator); padding: 6px 10px; text-align: left; }
.doc a { color: var(--slate); }
```

`packages/web/src/theme/theme.ts`:
```ts
export type ThemePreference = 'light' | 'dark' | 'system';

export function resolveTheme(pref: ThemePreference, prefersDark: boolean): 'light' | 'dark' {
  return pref === 'system' ? (prefersDark ? 'dark' : 'light') : pref;
}

/** Sets <html data-theme>. For "system" it follows OS changes until the returned function is called. */
export function applyTheme(pref: ThemePreference): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const set = () => {
    document.documentElement.dataset.theme = resolveTheme(pref, mq.matches);
  };
  set();
  if (pref !== 'system') return () => {};
  mq.addEventListener('change', set);
  return () => mq.removeEventListener('change', set);
}
```

`packages/web/src/api/client.ts`:
```ts
import type {
  AgentsConfig,
  ConfigProblem,
  ProjectHome,
  ProjectSummary,
  RepoProfile,
  RuleSummary,
  Settings,
  TypeEntry,
  TypeItemRow,
} from '@dev-plumbing/core/schemas';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`, body);
  return body as T;
}

const enc = encodeURIComponent;
const send = (method: string, value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });

export type Tab = 'active' | 'finalized' | 'all';
export type ConfigResponse = { dir: string; settings: Settings; agents: AgentsConfig; repos: RepoProfile[]; types: RuleSummary[]; outputs: string[]; problems: ConfigProblem[] };
export type RulesResponse = { types: RuleSummary[]; broken: { file: string; error: string }[]; outputs: string[] };
export type FileResponse = { text: string; hasDefault: boolean };

export const api = {
  config: () => request<ConfigResponse>('/api/config'),
  projects: (p: { q: string; tab: Tab; offset: number; limit: number }) =>
    request<{ items: ProjectSummary[]; total: number }>(`/api/projects?${new URLSearchParams({ q: p.q, tab: p.tab, offset: String(p.offset), limit: String(p.limit) })}`),
  projectHome: (repo: string, id: string) => request<ProjectHome>(`/api/projects/${enc(repo)}/${enc(id)}`),
  typeItems: (repo: string, id: string, type: string) => request<{ type: TypeEntry; items: TypeItemRow[] }>(`/api/projects/${enc(repo)}/${enc(id)}/types/${enc(type)}`),
  document: (repo: string, id: string, which: string) => request<{ text: string | null }>(`/api/projects/${enc(repo)}/${enc(id)}/docs/${enc(which)}`),
  open: (body: { target: 'config' } | { target: 'source'; repo: string; id: string }) => request<{ ok: true }>('/api/open', send('POST', body)),
  saveSettings: (value: unknown) => request<{ value: Settings; restartRequired: boolean }>('/api/settings', send('PUT', value)),
  saveAgents: (value: unknown) => request<{ value: AgentsConfig }>('/api/agents', send('PUT', value)),
  saveRepo: (name: string, value: unknown) => request<{ value: RepoProfile }>(`/api/repos/${enc(name)}`, send('PUT', value)),
  rules: () => request<RulesResponse>('/api/rules'),
  rule: (file: string) => request<FileResponse>(`/api/rules/${enc(file)}`),
  saveRule: (file: string, text: string) => request<{ ok: true }>(`/api/rules/${enc(file)}`, send('PUT', { text })),
  createRule: (id: string, title: string) => request<{ file: string }>('/api/rules', send('POST', { id, title })),
  output: (name: string) => request<FileResponse>(`/api/outputs/${enc(name)}`),
  saveOutput: (name: string, text: string) => request<{ ok: true }>(`/api/outputs/${enc(name)}`, send('PUT', { text })),
  reset: (file: string) => request<{ ok: true }>('/api/reset', send('POST', { file })),
};
```

`packages/web/src/lib/useConfig.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: api.config });
```

`packages/web/src/components/PageMessage.tsx`:
```tsx
import { Link } from '@tanstack/react-router';

export function PageMessage({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-[20px] font-semibold">{title}</h1>
      {body && <p className="mt-2 text-[13px] text-ink-2">{body}</p>}
      <Link to="/" className="mt-4 inline-block text-[13px] text-slate">
        Back to plumbing projects
      </Link>
    </div>
  );
}
```

`packages/web/src/pages/Root.tsx`:
```tsx
import { Outlet } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useConfig } from '../lib/useConfig';
import { applyTheme } from '../theme/theme';

export function Root() {
  const { data } = useConfig();
  const pref = data?.settings.theme;
  useEffect(() => (pref ? applyTheme(pref) : undefined), [pref]);
  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <Outlet />
    </div>
  );
}
```

`packages/web/src/pages/placeholders.tsx` holds stand-ins that later tasks replace one by one:
```tsx
import { Outlet } from '@tanstack/react-router';

const Soon = ({ title }: { title: string }) => (
  <div className="mx-auto max-w-3xl px-4 py-6">
    <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
  </div>
);

export const AppHome = () => <Soon title="Plumbing projects" />;
export const ProjectLayout = () => <Outlet />;
export const InboxView = () => <Soon title="Inbox" />;
export const TypeView = () => <Soon title="Plumbing type" />;
export const DocumentView = () => <Soon title="Document" />;
export const SettingsPage = () => <Soon title="Settings" />;
export const RulesPage = () => <Soon title="Plumbing rules" />;
export const RuleEditorPage = () => <Soon title="Rules file" />;
export const OutputEditorPage = () => <Soon title="Output rules" />;
```

`packages/web/src/router.tsx`:
```tsx
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { PageMessage } from './components/PageMessage';
import {
  AppHome,
  DocumentView,
  InboxView,
  OutputEditorPage,
  ProjectLayout,
  RuleEditorPage,
  RulesPage,
  SettingsPage,
  TypeView,
} from './pages/placeholders';
import { Root } from './pages/Root';

const rootRoute = createRootRoute({ component: Root, notFoundComponent: () => <PageMessage title="Page not found" /> });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: AppHome });
const projectRoute = createRoute({ getParentRoute: () => rootRoute, path: '/p/$repo/$project', component: ProjectLayout });
const inboxRoute = createRoute({ getParentRoute: () => projectRoute, path: '/', component: InboxView });
const typeRoute = createRoute({ getParentRoute: () => projectRoute, path: 't/$type', component: TypeView });
const docRoute = createRoute({ getParentRoute: () => projectRoute, path: 'd/$doc', component: DocumentView });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage });
const rulesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/rules', component: RulesPage });
const ruleRoute = createRoute({ getParentRoute: () => rootRoute, path: '/rules/$file', component: RuleEditorPage });
const outputRoute = createRoute({ getParentRoute: () => rootRoute, path: '/rules/outputs/$name', component: OutputEditorPage });

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectRoute.addChildren([inboxRoute, typeRoute, docRoute]),
  settingsRoute,
  rulesRoute,
  ruleRoute,
  outputRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
```

`packages/web/src/main.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { router } from './router';
import './styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `pnpm vitest run packages/web`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the e2e harness and the failing theme e2e**

`packages/web/e2e/env.ts`:
```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';

export const E2E_PORT = 45459;
export const repoRoot = path.resolve(import.meta.dirname, '../../..');
export const cliPath = path.join(repoRoot, 'packages/cli/dist/index.js');
const marker = path.join(os.tmpdir(), 'dev-plumbing-e2e-current');

export const e2eTmp = () => fs.readFileSync(marker, 'utf8').trim();
export const setE2eTmp = (dir: string) => fs.writeFileSync(marker, dir);
export const e2eEnv = (tmp = e2eTmp()) => ({ ...process.env, HOME: tmp, DEV_PLUMBING_HOME: path.join(tmp, '.dev-plumbing') });
export const configPath = (rel: string) => path.join(e2eTmp(), '.dev-plumbing', rel);
export const readJson = (rel: string) => JSON.parse(fs.readFileSync(configPath(rel), 'utf8'));
export const writeJson = (rel: string, value: unknown) => fs.writeFileSync(configPath(rel), JSON.stringify(value, null, 2));

/** Returns the elements that stick out past the right edge. An empty list means no sideways scrolling. */
export function noSideScroll(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= width) return [];
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className)}`.slice(0, 120));
  });
}
```

`packages/web/e2e/global-setup.ts`:
```ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cliPath, E2E_PORT, e2eEnv, setE2eTmp } from './env';

export default function globalSetup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-e2e-'));
  setE2eTmp(tmp);
  const env = e2eEnv(tmp);
  const cli = (...args: string[]) => execFileSync(process.execPath, [cliPath, ...args], { env, stdio: 'inherit' });
  cli('setup', '--yes', '--no-login-item', '--no-start', '--projects-folder', path.join(tmp, 'projects'), '--port', String(E2E_PORT));
  const settingsFile = path.join(tmp, '.dev-plumbing', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  fs.writeFileSync(settingsFile, JSON.stringify({ ...settings, homePageSize: 2, theme: 'light' }, null, 2));
  cli('demo');
  cli('start');
}
```

`packages/web/e2e/global-teardown.ts`:
```ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { cliPath, e2eEnv, e2eTmp } from './env';

export default function globalTeardown() {
  const tmp = e2eTmp();
  execFileSync(process.execPath, [cliPath, 'stop'], { env: e2eEnv(tmp), stdio: 'inherit' });
  fs.rmSync(tmp, { recursive: true, force: true });
}
```

`packages/web/e2e/theme.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { readJson, writeJson } from './env';

const bodyBackground = () => getComputedStyle(document.body).backgroundColor;

test('light mode uses a white canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(bodyBackground)).toBe('rgb(255, 255, 255)');
});

test('dark mode uses ink night', async ({ page }) => {
  const saved = readJson('settings.json');
  writeJson('settings.json', { ...saved, theme: 'dark' });
  try {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(bodyBackground)).toBe('rgb(30, 30, 29)');
  } finally {
    writeJson('settings.json', saved);
  }
});

test.describe('with the system set to dark', () => {
  test.use({ colorScheme: 'dark' });
  test('the "system" appearance follows it', async ({ page }) => {
    const saved = readJson('settings.json');
    writeJson('settings.json', { ...saved, theme: 'system' });
    try {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    } finally {
      writeJson('settings.json', saved);
    }
  });
});
```

- [ ] **Step 7: Build and run the e2e tests**

Run: `pnpm test:e2e`
Expected: PASS (3 tests). The first run proves that the whole build → setup → demo → start → browser → stop chain works.

- [ ] **Step 8: Typecheck and commit**

Run: `pnpm --filter @dev-plumbing/web typecheck`
Expected: no errors.

```bash
git add packages/web pnpm-lock.yaml
git commit -m "feat(web): app scaffold, Ink wash tokens, theme and e2e harness"
```

---

### Task 14: UI primitives

**Files:**
- Create: `packages/web/src/components/Button.tsx`, `StatusMark.tsx`, `GroupedList.tsx`, `Segmented.tsx`, `Switch.tsx`, `ProgressBar.tsx`, `inputClass.ts`
- Test: `packages/web/src/components/components.test.tsx`

**Interfaces:**
- Consumes: the token utilities (Task 13) and `DisplayStatus` from `@dev-plumbing/core/schemas`.
- Produces:
  - `Button({ variant?: 'primary' | 'secondary'; size?: 'sm' | 'md' | 'lg'; ...buttonProps })`
  - `StatusMark({ status: DisplayStatus; size?: number })`: `role="img"` with an accessible label and `data-status`
  - `Group({ title?, children, testId? })`, `Row({ leading?, title, meta?, trailing? })`
  - `Segmented<T extends string>({ label, value, options: { value: T; label: string }[], onChange })`: `role="tablist"` with `role="tab"` children
  - `Switch({ id?, checked, onChange, label })`: `role="switch"`
  - `ProgressBar({ resolved, total, withClaude? })`: `role="progressbar"`
  - `inputClass: string`

- [ ] **Step 1: Write the failing tests**

`packages/web/src/components/components.test.tsx`:
```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressBar } from './ProgressBar';
import { Segmented } from './Segmented';
import { StatusMark } from './StatusMark';
import { Switch } from './Switch';

afterEach(cleanup);

describe('StatusMark', () => {
  it('shows the right mark for each status', () => {
    const cases = [
      ['your_turn', 'Your turn'],
      ['draft', 'Draft'],
      ['with_claude', 'With Claude'],
      ['resolved', 'Resolved'],
      ['parked', 'Parked'],
    ] as const;
    for (const [status, label] of cases) {
      const { unmount } = render(<StatusMark status={status} />);
      expect(screen.getByRole('img', { name: label }).getAttribute('data-status')).toBe(status);
      unmount();
    }
  });
  it('uses seal for your turn and moss for resolved', () => {
    render(<StatusMark status="your_turn" />);
    expect(screen.getByRole('img', { name: 'Your turn' }).className).toContain('bg-seal');
    cleanup();
    render(<StatusMark status="resolved" />);
    expect(screen.getByRole('img', { name: 'Resolved' }).className).toContain('text-moss');
  });
});

describe('Segmented', () => {
  it('marks the selected option and reports changes', () => {
    const onChange = vi.fn();
    render(<Segmented label="Filter" value="a" onChange={onChange} options={[{ value: 'a', label: 'Active' }, { value: 'b', label: 'All' }]} />);
    expect(screen.getByRole('tab', { name: 'Active' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('Switch', () => {
  it('toggles', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Start at login" />);
    fireEvent.click(screen.getByRole('switch', { name: 'Start at login' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('ProgressBar', () => {
  it('reports resolved out of total', () => {
    render(<ProgressBar resolved={3} total={6} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemax')).toBe('6');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/web/src/components`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`packages/web/src/components/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary'; size?: 'sm' | 'md' | 'lg' };

const SIZES = { sm: 'rounded-[6px] px-2.5 py-1 text-[11.5px]', md: 'rounded-[7px] px-3 py-1.5 text-[12.5px]', lg: 'rounded-[11px] px-4 py-2.5 text-[14px]' };

export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...rest }: Props) {
  const look = variant === 'primary' ? 'bg-button text-button-text' : 'border-[0.5px] border-separator bg-cell text-ink';
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate disabled:cursor-not-allowed disabled:opacity-40 ${look} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}
```

`packages/web/src/components/StatusMark.tsx`:
```tsx
import type { DisplayStatus } from '@dev-plumbing/core/schemas';

const LABELS: Record<DisplayStatus, string> = {
  your_turn: 'Your turn',
  draft: 'Draft',
  with_claude: 'With Claude',
  resolved: 'Resolved',
  parked: 'Parked',
  idle: 'Nothing needed',
};

export function StatusMark({ status, size = 9 }: { status: DisplayStatus; size?: number }) {
  const common = { role: 'img', 'aria-label': LABELS[status], 'data-status': status } as const;
  const box = { width: size, height: size };
  switch (status) {
    case 'your_turn':
      return <span {...common} className="inline-block shrink-0 rounded-full bg-seal" style={box} />;
    case 'draft':
      return <span {...common} className="inline-block shrink-0 rounded-full border-[1.5px] border-slate" style={box} />;
    case 'with_claude':
      return <span {...common} className="inline-block shrink-0 rounded-full border-[1.5px] border-dashed border-slate" style={box} />;
    case 'resolved':
      return (
        <span {...common} className="inline-flex shrink-0 items-center justify-center font-bold leading-none text-moss" style={{ width: size + 3, height: size + 3, fontSize: size + 3 }}>
          ✓
        </span>
      );
    case 'parked':
      return <span {...common} className="inline-block shrink-0 rounded-full bg-mist" style={box} />;
    case 'idle':
      return <span aria-hidden="true" data-status="idle" className="inline-block shrink-0" style={box} />;
  }
}
```

`packages/web/src/components/GroupedList.tsx`:
```tsx
import type { ReactNode } from 'react';

export function Group({ title, children, testId }: { title?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="mt-4" data-testid={testId}>
      {title && <h3 className="mb-1.5 ml-0.5 text-[12px] font-semibold text-ink-3">{title}</h3>}
      <div className="overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell [&>*+*]:border-t-[0.5px] [&>*+*]:border-separator">{children}</div>
    </section>
  );
}

export function Row({ leading, title, meta, trailing }: { leading?: ReactNode; title: ReactNode; meta?: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{title}</div>
        {meta && <div className="truncate text-[11.5px] text-ink-3">{meta}</div>}
      </div>
      {trailing}
    </div>
  );
}
```

`packages/web/src/components/Segmented.tsx`:
```tsx
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-[8px] bg-selection p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[6px] px-3 py-1 text-[12px] font-medium ${o.value === value ? 'bg-cell text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]' : 'text-ink-2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`packages/web/src/components/Switch.tsx`:
```tsx
export function Switch({ id, checked, onChange, label }: { id?: string; checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${checked ? 'bg-slate' : 'bg-mist'}`}
    >
      <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-[left] ${checked ? 'left-[18px]' : 'left-[2px]'}`} />
    </button>
  );
}
```

`packages/web/src/components/ProgressBar.tsx`:
```tsx
export function ProgressBar({ resolved, total, withClaude = 0 }: { resolved: number; total: number; withClaude?: number }) {
  const pct = (n: number) => `${total ? Math.round((n / total) * 100) : 0}%`;
  return (
    <div role="progressbar" aria-label="Resolved threads" aria-valuemin={0} aria-valuemax={total} aria-valuenow={resolved} className="flex h-1 w-full overflow-hidden rounded-full bg-selection">
      <span className="h-full bg-moss" style={{ width: pct(resolved) }} />
      <span className="h-full bg-slate/50" style={{ width: pct(withClaude) }} />
    </div>
  );
}
```

`packages/web/src/components/inputClass.ts`:
```ts
export const inputClass =
  'w-full min-w-0 rounded-[8px] border-[0.5px] border-separator bg-cell px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3 focus:outline-2 focus:outline-slate';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web
git commit -m "feat(web): Ink wash UI primitives (button, status marks, lists, segmented, switch, progress)"
```

---

### Task 15: App home

**Files:**
- Create: `packages/web/src/pages/AppHome.tsx`, `packages/web/src/lib/time.ts`
- Modify: `packages/web/src/router.tsx` (import `AppHome` from `./pages/AppHome` and remove it from the placeholders import), `packages/web/src/pages/placeholders.tsx` (delete the `AppHome` export)
- Test: `packages/web/src/lib/time.test.ts`, `packages/web/e2e/app-home.spec.ts`

**Interfaces:**
- Consumes: `api.projects`, `useConfig`, `summaryStatus`, `ProjectSummary`, `Button`, `Segmented`, `StatusMark`, `ProgressBar`.
- Produces: `formatUpdated(iso: string, now?: Date): string`, and the App home page. The page has:
  - a search box at the very top (`role="searchbox"`, named "Search plumbing projects")
  - Active / Finalized / All tabs
  - rows with `data-testid="project-row"`, linking to `/p/$repo/$project`
  - **Load more**, which adds `homePageSize` more rows
  - an empty state (`data-testid="empty-state"`)
  - links to Settings and Plumbing rules.

- [ ] **Step 1: Write the failing tests**

`packages/web/src/lib/time.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatUpdated } from './time';

const now = new Date('2026-09-30T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

describe('formatUpdated', () => {
  it('reads like a person would say it', () => {
    expect(formatUpdated(ago(0.2), now)).toBe('just now');
    expect(formatUpdated(ago(2), now)).toBe('2 min ago');
    expect(formatUpdated(ago(180), now)).toBe('3 hr ago');
    expect(formatUpdated(ago(24 * 60), now)).toBe('yesterday');
    expect(formatUpdated(ago(4 * 24 * 60), now)).toBe('4 days ago');
    expect(formatUpdated(ago(21 * 24 * 60), now)).not.toMatch(/ago/);
  });
});
```

`packages/web/e2e/app-home.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { noSideScroll } from './env';

test('search sits at the very top', async ({ page }) => {
  await page.goto('/');
  const box = await page.getByRole('searchbox', { name: 'Search plumbing projects' }).boundingBox();
  expect(box!.y).toBeLessThan(40);
});

test('lists needs-you first and pages with Load more', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'All' }).click();
  const rows = page.getByTestId('project-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Restock reminders');
  await expect(rows.nth(1)).toContainText('Checkout redesign');
  await page.getByRole('button', { name: 'Load more' }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
});

test('active is the default tab and finalized projects have their own', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('project-row')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Finalized' }).click();
  await expect(page.getByTestId('project-row')).toHaveCount(1);
  await expect(page.getByTestId('project-row')).toContainText('Onboarding emails');
});

test('search filters, and says when nothing matches', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'All' }).click();
  const search = page.getByRole('searchbox', { name: 'Search plumbing projects' });
  await search.fill('onboarding');
  await expect(page.getByTestId('project-row')).toHaveCount(1);
  await search.fill('zzz');
  await expect(page.getByTestId('empty-state')).toContainText('No plumbing projects match');
});

test('rows show who is waiting', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('project-row').first()).toContainText('2 need you');
  await expect(page.getByTestId('project-row').first()).toContainText('1 draft');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('one column and no sideways scrolling', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('project-row').first()).toBeVisible();
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/web/src/lib && pnpm test:e2e -- app-home`
Expected: FAIL: `./time` is missing, and the placeholder page has no search box.

- [ ] **Step 3: Implement**

`packages/web/src/lib/time.ts`:
```ts
export function formatUpdated(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(then.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}
```

`packages/web/src/pages/AppHome.tsx`:
```tsx
import type { ProjectSummary } from '@dev-plumbing/core/schemas';
import { summaryStatus } from '@dev-plumbing/core/schemas';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { api, type Tab } from '../api/client';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { Segmented } from '../components/Segmented';
import { StatusMark } from '../components/StatusMark';
import { formatUpdated } from '../lib/time';
import { useConfig } from '../lib/useConfig';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const shortClone = (clone: string | null) => (clone ? (clone.split('/').filter(Boolean).pop() ?? clone) : '');

export function AppHome() {
  const { data: config } = useConfig();
  const pageSize = config?.settings.homePageSize ?? 10;
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('active');
  const [pages, setPages] = useState(1);
  const limit = pageSize * pages;
  const projects = useQuery({
    queryKey: ['projects', q, tab, limit],
    queryFn: () => api.projects({ q, tab, offset: 0, limit }),
    placeholderData: keepPreviousData,
    enabled: Boolean(config),
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 md:px-6 md:pt-6">
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPages(1);
        }}
        placeholder="Search plumbing projects"
        aria-label="Search plumbing projects"
        className="w-full rounded-[10px] border-[0.5px] border-separator bg-cell px-3 py-2 text-[14px] text-ink placeholder:text-ink-3 focus:outline-2 focus:outline-slate"
      />
      <header className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[26px] font-bold leading-8 tracking-tight">Plumbing projects</h1>
        <nav className="ml-auto flex gap-4 text-[13px]">
          <Link to="/settings" className="text-slate">Settings</Link>
          <Link to="/rules" className="text-slate">Plumbing rules</Link>
        </nav>
      </header>
      <div className="mt-3 max-w-xs">
        <Segmented
          label="Filter"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPages(1);
          }}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'finalized', label: 'Finalized' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      {projects.error && <p className="mt-6 text-[13px] text-seal">{(projects.error as Error).message}</p>}

      {projects.data?.total === 0 && (
        <p className="mt-10 text-center text-[13px] text-ink-3" data-testid="empty-state">
          {q ? (
            `No plumbing projects match "${q}".`
          ) : (
            <>
              No plumbing projects yet. In Claude Code, run <code className="font-mono text-ink-2">/dev-plumbing path/to/plan.md</code>.
            </>
          )}
        </p>
      )}

      {projects.data && projects.data.items.length > 0 && (
        <ul aria-label="Plumbing projects" className="mt-4 overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell">
          {projects.data.items.map((p) => (
            <ProjectRow key={`${p.repo}/${p.id}`} p={p} />
          ))}
        </ul>
      )}

      {projects.data && projects.data.total > projects.data.items.length && (
        <div className="mt-4 flex justify-center">
          <Button onClick={() => setPages((n) => n + 1)}>Load more</Button>
        </div>
      )}
    </div>
  );
}

function ProjectRow({ p }: { p: ProjectSummary }) {
  const c = p.counts;
  const updated = formatUpdated(p.updatedAt);
  return (
    <li className="border-b-[0.5px] border-separator last:border-b-0">
      <Link to="/p/$repo/$project" params={{ repo: p.repo, project: p.id }} className="flex items-start gap-3 px-4 py-3 hover:bg-selection" data-testid="project-row">
        <span className="mt-1.5">
          <StatusMark status={p.status === 'broken' ? 'idle' : summaryStatus(c)} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[14px] font-semibold">{p.title}</span>
            {p.status === 'finalized' && <span className="text-[10.5px] font-semibold text-ink-3">FINALIZED</span>}
          </div>
          {p.sourcePath && <div className="truncate font-mono text-[11px] text-ink-3">{p.sourcePath}</div>}
          {p.error && <div className="text-[12px] text-seal">Couldn't read this project: {p.error}</div>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
            <span>
              {p.repo}
              {p.branch ? ` · ${shortClone(p.clone)} @ ${p.branch}` : ''}
            </span>
            {c.yourTurn > 0 && <span className="text-seal">{c.yourTurn} need you</span>}
            {c.drafts > 0 && <span>{plural(c.drafts, 'draft')}</span>}
            {c.withClaude > 0 && <span>{c.withClaude} with Claude</span>}
            <span className="text-ink-3 md:hidden">{updated}</span>
          </div>
        </div>
        <div className="hidden w-32 shrink-0 text-right md:block">
          <div className="text-[11.5px] text-ink-3">{updated}</div>
          {c.total > 0 && (
            <div className="mt-1.5">
              <ProgressBar resolved={c.resolved} total={c.total} withClaude={c.withClaude} />
              <div className="mt-1 text-[11px] text-ink-3">
                {c.resolved} / {c.total} resolved
              </div>
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
```

In `packages/web/src/router.tsx`, take `AppHome` out of the placeholders import and add:
```tsx
import { AppHome } from './pages/AppHome';
```
Then delete the line `export const AppHome = () => <Soon title="Plumbing projects" />;` from `packages/web/src/pages/placeholders.tsx`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run packages/web && pnpm test:e2e -- app-home theme`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web
git commit -m "feat(web): app home with search, tabs, Load more and phone layout"
```

---

### Task 16: Project home, type view and documents

**Files:**
- Create: `packages/web/src/pages/ProjectLayout.tsx`, `ProjectHeader.tsx`, `ProjectNav.tsx`, `InboxView.tsx`, `TypeView.tsx`, `DocumentView.tsx`
- Modify: `packages/web/src/router.tsx` (import these four route components from their files: `ProjectLayout`, `InboxView`, `TypeView` and `DocumentView`), `packages/web/src/pages/placeholders.tsx` (delete those four exports)
- Test: `packages/web/e2e/project-home.spec.ts`

**Interfaces:**
- Consumes: `api.projectHome`, `api.typeItems`, `api.document`, `api.open`, `ProjectHome`, `TypeEntry`, `InboxEntry`, `DisplayStatus`, `Button`, `StatusMark`, `Group`, `Row`, `Segmented`, `ProgressBar`, `PageMessage`.
- Produces the project home:
  - **Header:** the title (h1), and the source (`data-testid="project-source"`: path, clone @ branch, **Open file**). **Whiteboard Defense**, **Finalize spec** and **Submit all** show but are disabled, with a tooltip saying they arrive in later plans.
  - **Sidebar** (`<aside aria-label="Project navigation">`, desktop only): Inbox, then the plumbing types (`data-testid="nav-type-<id>"`) showing a status mark or "No changes", then Documents (Original, Draft, Final), then Review (Whiteboard Defense, disabled).
  - **Phone:** a segmented control (Inbox · Plumbing · Defense), and a pinned bottom bar with **Submit all · N drafts**.
  - **Inbox** (`data-testid="inbox"`): groups "Your turn · N", "Drafts, not sent · N" and "With Claude · N", then a "Resolved N · Parked N" toggle. Rows have `data-testid="inbox-row"`.
  - **Type view:** the items as rows, or `data-testid="no-changes"` with the type's `emptyMessage` and the reason.
  - **Document view:** Markdown (`data-testid="document"`), or "No final version yet."

- [ ] **Step 1: Write the failing e2e tests**

`packages/web/e2e/project-home.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { noSideScroll } from './env';

const PROJECT = '/p/acme/restock-reminders';
const TYPE_TITLES = ['Architecture', 'Database', 'UI changes', 'Flows', 'Questions', 'Concerns', 'Ideas', 'Phases & milestones', 'Testing & rollout', 'Security & permissions'];

test('opens from the app home and shows where the plan came from', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('project-row').filter({ hasText: 'Restock reminders' }).click();
  await expect(page).toHaveURL(/\/p\/acme\/restock-reminders$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Restock reminders');
  const source = page.getByTestId('project-source');
  await expect(source).toContainText('docs/specs/restock-reminders.md');
  await expect(source).toContainText('~/Source/acme @ main');
});

test('lists every plumbing type on the left, in order', async ({ page }) => {
  await page.goto(PROJECT);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await expect(nav.getByTestId(/^nav-type-/)).toContainText(TYPE_TITLES);
  await expect(nav.getByTestId('nav-type-security')).toContainText('No changes');
});

test('a plumbing type with nothing in the plan says so', async ({ page }) => {
  await page.goto(PROJECT);
  await page.getByRole('complementary', { name: 'Project navigation' }).getByTestId('nav-type-security').click();
  const empty = page.getByTestId('no-changes');
  await expect(empty).toContainText("This plan doesn't change roles, permissions or how personal data is handled.");
  await expect(empty).toContainText("The plan doesn't touch roles, permissions or personal data.");
});

test('a plumbing type with items lists them', async ({ page }) => {
  await page.goto(`${PROJECT}/t/questions`);
  await expect(page.getByText('Who gets reminders at launch?')).toBeVisible();
  await expect(page.getByText('BLOCKING')).toBeVisible();
});

test('the inbox groups threads by whose turn it is', async ({ page }) => {
  await page.goto(PROJECT);
  const inbox = page.getByTestId('inbox');
  await expect(inbox).toContainText('Your turn · 2');
  await expect(inbox).toContainText('Drafts, not sent · 1');
  await expect(inbox).toContainText('With Claude · 1');
  await expect(inbox.getByTestId('inbox-row')).toHaveCount(4);
  await inbox.getByRole('button', { name: /Resolved 1 · Parked 1/ }).click();
  await expect(inbox.getByTestId('inbox-row')).toHaveCount(6);
});

test('shows the original and the draft, and says when there is no final yet', async ({ page }) => {
  await page.goto(PROJECT);
  const nav = page.getByRole('complementary', { name: 'Project navigation' });
  await nav.getByRole('link', { name: 'Original' }).click();
  await expect(page.getByTestId('document')).toContainText('A daily job finds subscriptions');
  await nav.getByRole('link', { name: 'Draft' }).click();
  await expect(page.getByTestId('document')).toContainText('Reminders go out by SMS and email.');
  await expect(nav.getByText('Final')).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Final' })).toHaveCount(0);
});

test('Open file explains when the plan is not on disk', async ({ page }) => {
  await page.goto(PROJECT);
  await page.getByTestId('project-source').getByRole('button', { name: 'Open file' }).click();
  await expect(page.getByTestId('project-source')).toContainText("isn't at");
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('one column with a section switcher and a pinned main action', async ({ page }) => {
    await page.goto(PROJECT);
    await expect(page.getByRole('complementary', { name: 'Project navigation' })).toBeHidden();
    await expect(page.getByTestId('inbox')).toBeVisible();
    const submit = page.getByRole('button', { name: 'Submit all · 1 draft' });
    const box = await submit.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(812 - 60);
    await page.getByRole('tab', { name: 'Plumbing' }).click();
    // The hidden desktop sidebar also has this link, so click the one inside <main>.
    await page.getByRole('main').getByTestId('nav-type-security').click();
    await expect(page.getByTestId('no-changes')).toBeVisible();
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:e2e -- project-home`
Expected: FAIL (the placeholder shows no header, sidebar or inbox).

- [ ] **Step 3: Implement**

`packages/web/src/pages/ProjectHeader.tsx`:
```tsx
import type { ProjectHome } from '@dev-plumbing/core/schemas';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';

export const NOT_YET = 'Arrives once Claude is connected (next update).';

export function ProjectHeader({ home, repo, project }: { home: ProjectHome; repo: string; project: string }) {
  const s = home.summary;
  const src = home.project.source;
  const open = useMutation({ mutationFn: () => api.open({ target: 'source', repo, id: project }) });
  return (
    <header>
      <div className="flex flex-wrap items-start gap-3">
        <h1 className="min-w-0 flex-1 text-[26px] font-bold leading-8 tracking-tight">{home.project.title}</h1>
        <div className="hidden gap-2 md:flex">
          <Button disabled title="Whiteboard Defense arrives in a later update.">Whiteboard Defense</Button>
          <Button disabled title="Finalize spec arrives in a later update.">Finalize spec</Button>
          <Button variant="primary" disabled title={NOT_YET}>
            Submit all · {s.counts.drafts}
          </Button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3" data-testid="project-source">
        <span>Source</span>
        <span className="break-all font-mono text-ink-2">{src.path}</span>
        <span className="break-all">
          {src.clone} @ {src.branch}
        </span>
        <button type="button" className="text-slate" onClick={() => open.mutate()}>
          Open file
        </button>
        {open.error && <span className="text-seal">{(open.error as Error).message}</span>}
      </div>
      {s.counts.total > 0 && (
        <div className="mt-3 flex items-center gap-3 text-[12px] text-ink-2">
          <span className="shrink-0">
            {s.counts.resolved} of {s.counts.total} resolved
          </span>
          <div className="flex-1">
            <ProgressBar resolved={s.counts.resolved} total={s.counts.total} withClaude={s.counts.withClaude} />
          </div>
        </div>
      )}
    </header>
  );
}
```

`packages/web/src/pages/ProjectNav.tsx`:
```tsx
import type { DisplayStatus, ProjectHome, TypeEntry } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { StatusMark } from '../components/StatusMark';

const LINK = 'flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[13px] text-ink';
const ACTIVE = { className: 'bg-selection font-medium' };
const DOC_LABELS = { original: 'Original', draft: 'Draft', final: 'Final' } as const;

function typeStatus(t: TypeEntry): DisplayStatus {
  if (t.yourTurn) return 'your_turn';
  if (t.drafts) return 'draft';
  if (t.withClaude) return 'with_claude';
  if (t.itemCount > 0 && t.resolved === t.itemCount) return 'resolved';
  return 'idle';
}

const Section = ({ children }: { children: ReactNode }) => <div className="px-2 pb-1 pt-3 text-[11px] font-semibold text-ink-3">{children}</div>;

export function ProjectNav({ home, repo, project, onNavigate }: { home: ProjectHome; repo: string; project: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-px">
      <Link to="/p/$repo/$project" params={{ repo, project }} activeOptions={{ exact: true }} activeProps={ACTIVE} className={LINK} onClick={onNavigate}>
        Inbox
        <span className="ml-auto text-[11px] text-ink-3">{home.summary.counts.yourTurn || ''}</span>
      </Link>
      <Section>Plumbing</Section>
      {home.types.map((t) => (
        <Link
          key={t.id}
          to="/p/$repo/$project/t/$type"
          params={{ repo, project, type: t.id }}
          activeProps={ACTIVE}
          className={`${LINK} ${t.noChanges ? 'text-ink-3' : ''}`}
          onClick={onNavigate}
          data-testid={`nav-type-${t.id}`}
        >
          <span className="min-w-0 truncate">{t.title}</span>
          <span className="ml-auto inline-flex shrink-0 items-center text-[11px] text-ink-3">{t.noChanges ? 'No changes' : <StatusMark status={typeStatus(t)} />}</span>
        </Link>
      ))}
      <Section>Documents</Section>
      {(['original', 'draft', 'final'] as const).map((doc) =>
        home.documents[doc] ? (
          <Link key={doc} to="/p/$repo/$project/d/$doc" params={{ repo, project, doc }} activeProps={ACTIVE} className={LINK} onClick={onNavigate}>
            {DOC_LABELS[doc]}
          </Link>
        ) : (
          <span key={doc} className={`${LINK} text-ink-3`}>
            {DOC_LABELS[doc]}
            <span className="ml-auto text-[11px]">Not yet</span>
          </span>
        ),
      )}
      <Section>Review</Section>
      <span className={`${LINK} text-ink-3`} title="Whiteboard Defense arrives in a later update.">
        Whiteboard Defense
      </span>
    </nav>
  );
}
```

`packages/web/src/pages/ProjectLayout.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { PageMessage } from '../components/PageMessage';
import { Segmented } from '../components/Segmented';
import { NOT_YET, ProjectHeader } from './ProjectHeader';
import { ProjectNav } from './ProjectNav';

type Section = 'content' | 'plumbing' | 'defense';

export function ProjectLayout() {
  const { repo, project } = useParams({ from: '/p/$repo/$project' });
  const home = useQuery({ queryKey: ['projectHome', repo, project], queryFn: () => api.projectHome(repo, project) });
  const [section, setSection] = useState<Section>('content');

  if (home.error) return <PageMessage title="Couldn't open this plumbing project" body={(home.error as Error).message} />;
  if (!home.data) return <PageMessage title="Loading…" />;
  const d = home.data;
  const drafts = d.summary.counts.drafts;

  return (
    <div className="flex min-h-screen">
      <aside aria-label="Project navigation" className="sticky top-0 hidden h-screen w-[212px] shrink-0 overflow-y-auto border-r-[0.5px] border-separator bg-sidebar px-2 py-3 backdrop-blur-xl md:block">
        <Link to="/" className="mb-2 block px-2 text-[12px] text-slate">
          ‹ All projects
        </Link>
        <ProjectNav home={d} repo={repo} project={project} />
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-28 pt-3 md:px-7 md:pb-8 md:pt-5">
        <Link to="/" className="mb-1 inline-block text-[13px] text-slate md:hidden">
          ‹ Projects
        </Link>
        <ProjectHeader home={d} repo={repo} project={project} />
        <div className="mt-4 md:hidden">
          <Segmented<Section>
            label="Project sections"
            value={section}
            onChange={setSection}
            options={[
              { value: 'content', label: 'Inbox' },
              { value: 'plumbing', label: 'Plumbing' },
              { value: 'defense', label: 'Defense' },
            ]}
          />
        </div>
        {section === 'plumbing' && (
          <div className="mt-3 md:hidden">
            <ProjectNav home={d} repo={repo} project={project} onNavigate={() => setSection('content')} />
          </div>
        )}
        {section === 'defense' && <p className="mt-6 text-[13px] text-ink-3 md:hidden">Whiteboard Defense arrives in a later update.</p>}
        <div className={section === 'content' ? 'mt-4' : 'mt-4 hidden md:block'}>
          <Outlet />
        </div>
      </main>
      <div className="fixed inset-x-0 bottom-0 border-t-[0.5px] border-separator bg-sidebar px-4 pb-6 pt-3 backdrop-blur-xl md:hidden">
        <Button variant="primary" size="lg" className="w-full" disabled title={NOT_YET}>
          Submit all · {drafts} draft{drafts === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
}
```

`packages/web/src/pages/InboxView.tsx`:
```tsx
import type { DisplayStatus, InboxEntry } from '@dev-plumbing/core/schemas';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../api/client';
import { Group } from '../components/GroupedList';
import { StatusMark } from '../components/StatusMark';

const WHO = { claude: 'Claude', you: 'You', system: '' } as const;

function InboxGroup({ title, entries, repo, project }: { title?: string; entries: InboxEntry[]; repo: string; project: string }) {
  if (entries.length === 0) return null;
  return (
    <Group title={title ? `${title} · ${entries.length}` : undefined}>
      {entries.map((e) => (
        <Link key={e.threadId} to="/p/$repo/$project/t/$type" params={{ repo, project, type: e.type }} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-selection" data-testid="inbox-row">
          <StatusMark status={e.status} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">
              {e.blocking && <span className="mr-1.5 text-[10.5px] font-semibold text-seal">BLOCKING</span>}
              <span className="mr-1.5 text-[10.5px] font-semibold uppercase text-ink-3">{e.typeTitle}</span>
              {e.itemTitle}
            </div>
            {e.lastMessage && (
              <div className="truncate text-[11.5px] text-ink-3">
                {WHO[e.lastMessage.author]}: {e.lastMessage.text}
              </div>
            )}
          </div>
          <span className="text-ink-3">›</span>
        </Link>
      ))}
    </Group>
  );
}

export function InboxView() {
  const { repo, project } = useParams({ from: '/p/$repo/$project' });
  const { data } = useQuery({ queryKey: ['projectHome', repo, project], queryFn: () => api.projectHome(repo, project) });
  const [showDone, setShowDone] = useState(false);
  if (!data) return null;
  const by = (s: DisplayStatus) => data.inbox.filter((e) => e.status === s);
  const resolved = by('resolved');
  const parked = by('parked');
  return (
    <div data-testid="inbox">
      <InboxGroup title="Your turn" entries={by('your_turn')} repo={repo} project={project} />
      <InboxGroup title="Drafts, not sent" entries={by('draft')} repo={repo} project={project} />
      <InboxGroup title="With Claude" entries={by('with_claude')} repo={repo} project={project} />
      {resolved.length + parked.length > 0 && (
        <button type="button" className="mt-4 text-[12px] font-semibold text-ink-3" onClick={() => setShowDone((v) => !v)}>
          {showDone ? '▾' : '▸'} Resolved {resolved.length} · Parked {parked.length}
        </button>
      )}
      {showDone && <InboxGroup entries={[...resolved, ...parked]} repo={repo} project={project} />}
      {data.inbox.length === 0 && <p className="mt-6 text-[13px] text-ink-3">Nothing is waiting. Threads appear here once the plan is imported.</p>}
    </div>
  );
}
```

`packages/web/src/pages/TypeView.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { api } from '../api/client';
import { Group, Row } from '../components/GroupedList';
import { StatusMark } from '../components/StatusMark';

export function TypeView() {
  const { repo, project, type } = useParams({ from: '/p/$repo/$project/t/$type' });
  const { data, error } = useQuery({ queryKey: ['typeItems', repo, project, type], queryFn: () => api.typeItems(repo, project, type) });
  if (error) return <p className="text-[13px] text-seal">{(error as Error).message}</p>;
  if (!data) return null;
  if (data.type.noChanges) {
    return (
      <div data-testid="no-changes" className="py-10 text-center">
        <h2 className="text-[20px] font-semibold">{data.type.title}: no changes</h2>
        <p className="mt-2 text-[14px] text-ink-2">{data.type.emptyMessage}</p>
        <p className="mt-1 text-[12.5px] text-ink-3">{data.type.noChanges.reason}</p>
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-[20px] font-semibold">{data.type.title}</h2>
      <Group title={`${data.items.length} item${data.items.length === 1 ? '' : 's'}`}>
        {data.items.map((i) => (
          <Row
            key={i.id}
            leading={<StatusMark status={i.status} />}
            title={
              <>
                {i.blocking && <span className="mr-1.5 text-[10.5px] font-semibold text-seal">BLOCKING</span>}
                {i.title}
              </>
            }
            meta={i.summary}
          />
        ))}
      </Group>
    </div>
  );
}
```

`packages/web/src/pages/DocumentView.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api/client';

export function DocumentView() {
  const { repo, project, doc } = useParams({ from: '/p/$repo/$project/d/$doc' });
  const { data, error } = useQuery({ queryKey: ['doc', repo, project, doc], queryFn: () => api.document(repo, project, doc) });
  if (error) return <p className="text-[13px] text-seal">{(error as Error).message}</p>;
  if (!data) return null;
  if (data.text === null) {
    return <p className="text-[13px] text-ink-3">{doc === 'final' ? 'No final version yet. Finalize spec creates it.' : 'This document is missing.'}</p>;
  }
  return (
    <article className="doc max-w-[72ch]" data-testid="document">
      <Markdown remarkPlugins={[remarkGfm]}>{data.text}</Markdown>
    </article>
  );
}
```

In `packages/web/src/router.tsx`, take `ProjectLayout`, `InboxView`, `TypeView` and `DocumentView` out of the placeholders import and add:
```tsx
import { DocumentView } from './pages/DocumentView';
import { InboxView } from './pages/InboxView';
import { ProjectLayout } from './pages/ProjectLayout';
import { TypeView } from './pages/TypeView';
```
Then delete those four exports from `packages/web/src/pages/placeholders.tsx`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:e2e -- project-home app-home`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @dev-plumbing/web typecheck`
Expected: no errors.

```bash
git add packages/web
git commit -m "feat(web): project home with plumbing sidebar, inbox, type view and documents"
```

---

### Task 17: Settings page

**Files:**
- Create: `packages/web/src/pages/SettingsPage.tsx`
- Modify: `packages/web/src/router.tsx` (import `SettingsPage` from its file), `packages/web/src/pages/placeholders.tsx` (delete `SettingsPage`)
- Test: `packages/web/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: `useConfig`, `api.saveSettings`, `api.saveAgents`, `api.saveRepo`, `api.reset`, `api.open`, `ApiError`, `settingsFields`, `agentsFields`, `flatten`, `unflatten`, `FieldSpec`, `ConfigProblem`, `RepoProfile`, `Button`, `Switch`, `Segmented`, `inputClass`.
- Produces the Settings page:
  - sections "General" (`settings.json`) and "Agents" (`agents.json`). Each is a `role="region"` named by its heading, with one row per field (label, help text, key and control), **Save**, **Reset to default**, and a `role="status"` notice.
  - "Repos", with a JSON editor for each profile.
  - "Problems in your config files" (`data-testid="config-problems"`).
  - **Open config folder**.

- [ ] **Step 1: Write the failing e2e tests**

`packages/web/e2e/settings.spec.ts`:
```ts
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { configPath, noSideScroll, readJson, writeJson } from './env';

test('shows every setting with its help text', async ({ page }) => {
  await page.goto('/settings');
  const general = page.getByRole('region', { name: 'General' });
  await expect(general.getByText('Recent projects per page')).toBeVisible();
  await expect(general.getByText('How many recent plumbing projects the app home shows before Load more.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Agents' }).getByText('Subagents at once')).toBeVisible();
});

test('saves a change to settings.json', async ({ page }) => {
  const saved = readJson('settings.json');
  try {
    await page.goto('/settings');
    const general = page.getByRole('region', { name: 'General' });
    await general.getByRole('switch', { name: 'Auto-apply small edits' }).click();
    await general.getByRole('button', { name: 'Save' }).click();
    await expect(general.getByRole('status')).toHaveText('Saved.');
    expect(readJson('settings.json').autoApplySmallEdits).toBe(false);
  } finally {
    writeJson('settings.json', saved);
  }
});

test('refuses an invalid value and explains why', async ({ page }) => {
  await page.goto('/settings');
  const general = page.getByRole('region', { name: 'General' });
  await general.getByLabel('Port').fill('80');
  await general.getByRole('button', { name: 'Save' }).click();
  await expect(general.getByText(/greater than or equal to 1024/)).toBeVisible();
  expect(readJson('settings.json').port).toBe(45459);
});

test('saves an agents setting', async ({ page }) => {
  const saved = readJson('agents.json');
  try {
    await page.goto('/settings');
    const agents = page.getByRole('region', { name: 'Agents' });
    await agents.getByLabel('Thread model').selectOption('haiku');
    await agents.getByRole('button', { name: 'Save' }).click();
    await expect(agents.getByRole('status')).toHaveText('Saved.');
    expect(readJson('agents.json').models.thread).toBe('haiku');
  } finally {
    writeJson('agents.json', saved);
  }
});

test('a broken settings file is listed as a problem and the page still works', async ({ page }) => {
  const raw = fs.readFileSync(configPath('settings.json'), 'utf8');
  try {
    fs.writeFileSync(configPath('settings.json'), '{ "port": ');
    await page.goto('/settings');
    await expect(page.getByTestId('config-problems')).toContainText("isn't valid JSON");
    await expect(page.getByRole('region', { name: 'General' })).toBeVisible();
  } finally {
    fs.writeFileSync(configPath('settings.json'), raw);
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('labels sit above their controls, one column', async ({ page }) => {
    await page.goto('/settings');
    const general = page.getByRole('region', { name: 'General' });
    const label = await general.getByText('Recent projects per page', { exact: true }).boundingBox();
    const input = await general.getByLabel('Recent projects per page').boundingBox();
    expect(label!.y).toBeLessThan(input!.y);
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:e2e -- settings`
Expected: FAIL (the placeholder has no regions).

- [ ] **Step 3: Implement**

`packages/web/src/pages/SettingsPage.tsx`:
```tsx
import type { ConfigProblem, FieldSpec, RepoProfile } from '@dev-plumbing/core/schemas';
import { agentsFields, flatten, settingsFields, unflatten } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Button } from '../components/Button';
import { inputClass } from '../components/inputClass';
import { Segmented } from '../components/Segmented';
import { Switch } from '../components/Switch';
import { useConfig } from '../lib/useConfig';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function SettingsPage() {
  const { data: config } = useConfig();
  const open = useMutation({ mutationFn: () => api.open({ target: 'config' }) });
  if (!config) return null;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 md:px-6 md:pt-6">
      <Link to="/" className="text-[13px] text-slate">
        ‹ Plumbing projects
      </Link>
      <h1 className="mt-1 text-[26px] font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-[12.5px] text-ink-3">
        These are plain files in <span className="break-all font-mono">{config.dir}</span>. The README there explains each one.
      </p>
      <div className="mt-3">
        <Button size="sm" onClick={() => open.mutate()}>
          Open config folder
        </Button>
      </div>
      {config.problems.length > 0 && <Problems problems={config.problems} />}
      <FieldsForm title="General" file="settings.json" fields={settingsFields} values={flatten(config.settings)} save={(v) => api.saveSettings(v)} />
      <FieldsForm title="Agents" file="agents.json" fields={agentsFields} values={flatten(config.agents)} save={(v) => api.saveAgents(v)} />
      <section className="mt-8" aria-labelledby="repos-title">
        <h2 id="repos-title" className="text-[20px] font-semibold">
          Repos
        </h2>
        <p className="mt-1 text-[12.5px] text-ink-3">A repo profile is created the first time you run /dev-plumbing in a repo. Edit it here as JSON.</p>
        {config.repos.length === 0 ? <p className="mt-3 text-[13px] text-ink-3">No repo profiles yet.</p> : config.repos.map((r) => <RepoEditor key={r.name} repo={r} />)}
      </section>
    </div>
  );
}

function Problems({ problems }: { problems: ConfigProblem[] }) {
  return (
    <div className="mt-5" data-testid="config-problems">
      <h2 className="text-[12px] font-semibold text-seal">Problems in your config files</h2>
      <ul className="mt-1 space-y-1 text-[12.5px] text-ink-2">
        {problems.map((p, i) => (
          <li key={i}>
            <span className="font-mono">
              {p.file}
              {p.key ? ` · ${p.key}` : ''}
            </span>
            : {p.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldsForm({
  title,
  file,
  fields,
  values,
  save,
}: {
  title: string;
  file: 'settings.json' | 'agents.json';
  fields: readonly FieldSpec[];
  values: Record<string, unknown>;
  save: (value: unknown) => Promise<{ restartRequired?: boolean }>;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const valuesKey = JSON.stringify(values);
  useEffect(() => setDraft(values), [valuesKey]);

  const mutation = useMutation({
    mutationFn: () => save(unflatten(draft)),
    onSuccess: (r) => {
      setErrors({});
      setNotice(r.restartRequired ? 'Saved. Restart the service to use the new port: dev-plumbing stop, then dev-plumbing start.' : 'Saved.');
      void qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => {
      const list = ((e as ApiError).body as { errors?: { key: string; message: string }[] } | null)?.errors ?? [];
      setErrors(Object.fromEntries(list.map((x) => [x.key, x.message])));
      setNotice(null);
    },
  });
  const reset = useMutation({
    mutationFn: () => api.reset(file),
    onSuccess: () => {
      setNotice('Reset to default.');
      void qc.invalidateQueries({ queryKey: ['config'] });
    },
  });

  const id = `${file.replace('.', '-')}-title`;
  return (
    <section className="mt-8" aria-labelledby={id}>
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="text-[20px] font-semibold">
          {title}
        </h2>
        <span className="font-mono text-[11.5px] text-ink-3">{file}</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell">
        {fields.map((f) => (
          <FieldRow key={f.key} field={f} value={draft[f.key]} error={errors[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          Save
        </Button>
        <Button
          onClick={() => {
            if (window.confirm(`Reset ${file} to its default?`)) reset.mutate();
          }}
        >
          Reset to default
        </Button>
        {notice && (
          <span role="status" className="text-[12.5px] text-moss">
            {notice}
          </span>
        )}
      </div>
    </section>
  );
}

function FieldRow({ field, value, error, onChange }: { field: FieldSpec; value: unknown; error?: string; onChange: (v: unknown) => void }) {
  const id = `field-${field.key}`;
  let control;
  if (field.kind === 'boolean') control = <Switch id={id} checked={Boolean(value)} onChange={onChange} label={field.label} />;
  else if (field.kind === 'enum' && field.options.length <= 3)
    control = <Segmented label={field.label} value={String(value)} onChange={onChange} options={field.options.map((o) => ({ value: o, label: capitalize(o) }))} />;
  else if (field.kind === 'enum')
    control = (
      <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  else if (field.kind === 'number')
    control = <input id={id} type="number" min={field.min} max={field.max} value={String(value ?? '')} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={inputClass} />;
  else control = <input id={id} type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={`${inputClass} ${field.format === 'path' ? 'font-mono' : ''}`} />;

  return (
    <div className="flex flex-col gap-1.5 border-b-[0.5px] border-separator px-4 py-3 last:border-b-0 md:flex-row md:items-start md:gap-6">
      <div className="md:w-1/2">
        <label htmlFor={id} className="text-[13.5px] font-medium">
          {field.label}
        </label>
        <p className="mt-0.5 text-[12px] text-ink-3">{field.description}</p>
        <p className="font-mono text-[10.5px] text-ink-3">{field.key}</p>
      </div>
      <div className="md:w-1/2">
        {control}
        {error && <p className="mt-1 text-[12px] text-seal">{error}</p>}
      </div>
    </div>
  );
}

function RepoEditor({ repo }: { repo: RepoProfile }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(JSON.stringify(repo, null, 2));
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error(`That isn't valid JSON: ${(e as Error).message}`);
      }
      return api.saveRepo(repo.name, parsed);
    },
    onSuccess: () => {
      setError(null);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <div className="mt-3 overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">{repo.name}</div>
          <div className="truncate font-mono text-[11.5px] text-ink-3">
            {repo.match.join(', ')}
            {repo.projectsFolder ? ` → ${repo.projectsFolder}` : ''}
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Edit'}
        </Button>
      </div>
      {open && (
        <div className="border-t-[0.5px] border-separator p-3">
          <textarea aria-label={`${repo.name} profile`} value={text} onChange={(e) => setText(e.target.value)} rows={14} spellCheck={false} className={`${inputClass} font-mono text-[12px]`} />
          {error && <p className="mt-1 text-[12px] text-seal">{error}</p>}
          <div className="mt-2">
            <Button size="sm" onClick={() => save.mutate()}>
              Save profile
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

In `packages/web/src/router.tsx`, take `SettingsPage` out of the placeholders import and add:
```tsx
import { SettingsPage } from './pages/SettingsPage';
```
Then delete `SettingsPage` from `packages/web/src/pages/placeholders.tsx`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:e2e -- settings theme`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web
git commit -m "feat(web): settings page with help text, validation, problems and repo profiles"
```

---

### Task 18: Plumbing rules page and editor

**Files:**
- Create: `packages/web/src/pages/RulesPage.tsx`, `packages/web/src/pages/RuleEditor.tsx`
- Modify: `packages/web/src/router.tsx` (import `RulesPage`, `RuleEditorPage` and `OutputEditorPage` from their files), and delete `packages/web/src/pages/placeholders.tsx`. All the placeholders are replaced by now.
- Test: `packages/web/e2e/rules.spec.ts`

**Interfaces:**
- Consumes: `api.rules`, `api.rule`, `api.saveRule`, `api.createRule`, `api.output`, `api.saveOutput`, `api.reset`, `Group`, `Button`, `Segmented`, `inputClass`.
- Produces:
  - **The `/rules` list:** rows (`data-testid="rule-row"`) showing order, title, screen and Off; "Files with problems" (`data-testid="broken-rule"`); "Output rules"; and **+ Plumbing type**, which opens a form (Id, Title, Create).
  - **The editors** (`/rules/$file` and `/rules/outputs/$name`): a textarea labelled with the file name, an Edit/Preview switch, **Save** (errors go in `role="alert"`, success in `role="status"`), and **Reset to default** when the file has a default.

- [ ] **Step 1: Write the failing e2e tests**

`packages/web/e2e/rules.spec.ts`:
```ts
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { configPath, noSideScroll } from './env';

const restore = (rel: string) => {
  const raw = fs.readFileSync(configPath(rel), 'utf8');
  return () => fs.writeFileSync(configPath(rel), raw);
};

test('lists every plumbing type from its rules file, and the output rules', async ({ page }) => {
  await page.goto('/rules');
  await expect(page.getByTestId('rule-row')).toHaveCount(10);
  await expect(page.getByTestId('rule-row').first()).toContainText('Architecture');
  await expect(page.getByTestId('rule-row').first()).toContainText('diagram');
  await expect(page.getByRole('link', { name: 'finalize.md' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'whiteboard-defense.md' })).toBeVisible();
});

test('editing a rules file changes the project sidebar', async ({ page }) => {
  const undo = restore('plumbing/ideas.md');
  try {
    await page.goto('/rules');
    await page.getByTestId('rule-row').filter({ hasText: 'Ideas' }).click();
    const editor = page.getByRole('textbox', { name: 'ideas.md' });
    const text = await editor.inputValue();
    await editor.fill(text.replace('title: Ideas', 'title: Ideas and wishes'));
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await page.goto('/p/acme/restock-reminders');
    await expect(page.getByRole('complementary', { name: 'Project navigation' }).getByTestId('nav-type-ideas')).toContainText('Ideas and wishes');
  } finally {
    undo();
  }
});

test('a broken header is refused with the reason', async ({ page }) => {
  const undo = restore('plumbing/ideas.md');
  try {
    await page.goto('/rules/ideas.md');
    await page.getByRole('textbox', { name: 'ideas.md' }).fill('no header here');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('Header field');
    expect(fs.readFileSync(configPath('plumbing/ideas.md'), 'utf8')).toMatch(/^---\nid: ideas/);
  } finally {
    undo();
  }
});

test('a file broken on disk is listed with its problem and left out of projects', async ({ page }) => {
  const undo = restore('plumbing/ideas.md');
  try {
    fs.writeFileSync(configPath('plumbing/ideas.md'), 'broken');
    await page.goto('/rules');
    await expect(page.getByTestId('broken-rule')).toContainText('ideas.md');
    await expect(page.getByTestId('rule-row')).toHaveCount(9);
    await page.goto('/p/acme/restock-reminders');
    await expect(page.getByTestId('nav-type-ideas')).toHaveCount(0);
  } finally {
    undo();
  }
});

test('adds a new plumbing type that shows up in every project', async ({ page }) => {
  try {
    await page.goto('/rules');
    await page.getByRole('button', { name: '+ Plumbing type' }).click();
    await page.getByLabel('Id').fill('rollout');
    await page.getByLabel('Title').fill('Rollout');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/rules\/rollout\.md$/);
    await page.goto('/p/acme/restock-reminders');
    await expect(page.getByRole('complementary', { name: 'Project navigation' }).getByTestId('nav-type-rollout')).toContainText('Rollout');
  } finally {
    fs.rmSync(configPath('plumbing/rollout.md'), { force: true });
  }
});

test('preview shows the rules as formatted text', async ({ page }) => {
  await page.goto('/rules/database.md');
  await page.getByRole('tab', { name: 'Preview' }).click();
  await expect(page.getByRole('heading', { name: 'Rules' })).toBeVisible();
});

test('output rules can be edited and reset', async ({ page }) => {
  const undo = restore('outputs/finalize.md');
  page.on('dialog', (d) => d.accept());
  try {
    await page.goto('/rules/outputs/finalize.md');
    await page.getByRole('textbox', { name: 'finalize.md' }).fill('# Mine');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await expect(page.getByRole('textbox', { name: 'finalize.md' })).toHaveValue(/Finalize spec rules/);
  } finally {
    undo();
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('no sideways scrolling on the list or the editor', async ({ page }) => {
    await page.goto('/rules');
    expect(await noSideScroll(page)).toEqual([]);
    await page.goto('/rules/database.md');
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:e2e -- rules`
Expected: FAIL (the placeholder shows no rows).

- [ ] **Step 3: Implement**

`packages/web/src/pages/RulesPage.tsx`:
```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Group } from '../components/GroupedList';
import { inputClass } from '../components/inputClass';

export function RulesPage() {
  const { data, error } = useQuery({ queryKey: ['rules'], queryFn: api.rules });
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 md:px-6 md:pt-6">
      <Link to="/" className="text-[13px] text-slate">
        ‹ Plumbing projects
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold tracking-tight">Plumbing rules</h1>
        <Button className="ml-auto" size="sm" onClick={() => setAdding(true)}>
          + Plumbing type
        </Button>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-3">Each plumbing type is one Markdown file. The header sets how it shows; the body is the rules Claude follows.</p>
      {error && <p className="mt-4 text-[13px] text-seal">{(error as Error).message}</p>}
      {adding && <NewTypeForm onCancel={() => setAdding(false)} />}
      {data && (
        <>
          <Group title="Plumbing types">
            {data.types.map((t) => (
              <Link key={t.file} to="/rules/$file" params={{ file: t.file }} className="flex items-center gap-3 px-3 py-2.5 hover:bg-selection" data-testid="rule-row">
                <span className="w-5 shrink-0 text-right text-[12px] text-ink-3">{t.order}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{t.title}</span>
                {!t.enabled && <span className="text-[11px] text-ink-3">Off</span>}
                <span className="font-mono text-[11px] text-ink-3">{t.screen}</span>
                <span className="text-ink-3">›</span>
              </Link>
            ))}
          </Group>
          {data.broken.length > 0 && (
            <Group title="Files with problems">
              {data.broken.map((b) => (
                <Link key={b.file} to="/rules/$file" params={{ file: b.file }} className="block px-3 py-2.5 hover:bg-selection" data-testid="broken-rule">
                  <div className="font-mono text-[12.5px]">{b.file}</div>
                  <div className="text-[12px] text-seal">{b.error}</div>
                </Link>
              ))}
            </Group>
          )}
          <Group title="Output rules">
            {data.outputs.map((o) => (
              <Link key={o} to="/rules/outputs/$name" params={{ name: o }} className="flex items-center px-3 py-2.5 hover:bg-selection">
                <span className="flex-1 font-mono text-[13px]">{o}</span>
                <span className="text-ink-3">›</span>
              </Link>
            ))}
          </Group>
        </>
      )}
    </div>
  );
}

function NewTypeForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.createRule(id.trim(), title.trim()),
    onSuccess: (r) => {
      void qc.invalidateQueries();
      void navigate({ to: '/rules/$file', params: { file: r.file } });
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <form
      className="mt-4 rounded-[10px] border-[0.5px] border-separator bg-cell p-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row">
        <label className="flex-1 text-[12.5px] text-ink-2">
          Id
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="rollout" className={`${inputClass} mt-1 font-mono`} />
        </label>
        <label className="flex-1 text-[12.5px] text-ink-2">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rollout" className={`${inputClass} mt-1`} />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="primary" type="submit">
          Create
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
```

`packages/web/src/pages/RuleEditor.tsx`:
```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Segmented } from '../components/Segmented';

export function RuleEditorPage() {
  const { file } = useParams({ from: '/rules/$file' });
  return <Editor kind="rule" name={file} />;
}

export function OutputEditorPage() {
  const { name } = useParams({ from: '/rules/outputs/$name' });
  return <Editor kind="output" name={name} />;
}

function Editor({ kind, name }: { kind: 'rule' | 'output'; name: string }) {
  const qc = useQueryClient();
  const file = useQuery({ queryKey: [kind, name], queryFn: () => (kind === 'rule' ? api.rule(name) : api.output(name)) });
  const [text, setText] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (file.data) setText(file.data.text);
  }, [file.data?.text]);

  const save = useMutation({
    mutationFn: () => (kind === 'rule' ? api.saveRule(name, text ?? '') : api.saveOutput(name, text ?? '')),
    onSuccess: () => {
      setError(null);
      setNotice('Saved.');
      void qc.invalidateQueries();
    },
    onError: (e) => {
      setNotice(null);
      setError((e as Error).message);
    },
  });
  const reset = useMutation({
    mutationFn: () => api.reset(kind === 'rule' ? `plumbing/${name}` : `outputs/${name}`),
    onSuccess: () => {
      setError(null);
      setNotice('Reset to default.');
      void qc.invalidateQueries();
    },
  });

  if (file.error) return <p className="px-4 py-8 text-[13px] text-seal">{(file.error as Error).message}</p>;
  if (text === null) return null;
  const body = text.replace(/^---[\s\S]*?\n---\n?/, '');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 md:px-6 md:pt-6">
      <Link to="/rules" className="text-[13px] text-slate">
        ‹ Plumbing rules
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 break-all font-mono text-[20px] font-semibold">{name}</h1>
        <div className="ml-auto w-44">
          <Segmented
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'edit', label: 'Edit' },
              { value: 'preview', label: 'Preview' },
            ]}
          />
        </div>
      </div>
      {mode === 'edit' ? (
        <textarea
          aria-label={name}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="mt-3 h-[60vh] w-full rounded-[10px] border-[0.5px] border-separator bg-cell p-3 font-mono text-[12.5px] leading-relaxed text-ink focus:outline-2 focus:outline-slate"
        />
      ) : (
        <article className="doc mt-3 rounded-[10px] border-[0.5px] border-separator bg-cell p-4">
          <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
        </article>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          Save
        </Button>
        {file.data?.hasDefault && (
          <Button
            onClick={() => {
              if (window.confirm(`Reset ${name} to its default?`)) reset.mutate();
            }}
          >
            Reset to default
          </Button>
        )}
        {notice && (
          <span role="status" className="text-[12.5px] text-moss">
            {notice}
          </span>
        )}
      </div>
    </div>
  );
}
```

Replace the imports at the top of `packages/web/src/router.tsx` so that nothing comes from `./pages/placeholders`:
```tsx
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { PageMessage } from './components/PageMessage';
import { AppHome } from './pages/AppHome';
import { DocumentView } from './pages/DocumentView';
import { InboxView } from './pages/InboxView';
import { ProjectLayout } from './pages/ProjectLayout';
import { Root } from './pages/Root';
import { OutputEditorPage, RuleEditorPage } from './pages/RuleEditor';
import { RulesPage } from './pages/RulesPage';
import { SettingsPage } from './pages/SettingsPage';
import { TypeView } from './pages/TypeView';
```
Then delete `packages/web/src/pages/placeholders.tsx`.

- [ ] **Step 4: Run all the web tests to verify they pass**

Run: `pnpm vitest run packages/web && pnpm test:e2e`
Expected: PASS for every e2e spec (theme, app-home, project-home, settings, rules).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors in any package.

```bash
git add -A packages/web
git commit -m "feat(web): plumbing rules page with editor, preview, new types and reset"
```

---

### Task 19: README, dev workflow and full verification

**Files:**
- Create: `README.md`
- Modify: `SPEC.md`. Add one line under §18 item 1, recording the spike's outcome from `spike/subagent-mcp/RESULTS.md`.

**Interfaces:**
- Consumes: everything above.
- Produces: a repo that a new clone can install, build, set up and test by following the README.

- [ ] **Step 1: Write the README**

`README.md`:
````markdown
# dev-plumbing

Plumb a feature plan before you build it. dev-plumbing turns a plan (for example a Superpowers spec) into a local web app where every question, concern, diagram and schema change has its own thread with Claude.

**Status:** foundations. Config, the local service, the CLI and the app shell work today. The Claude loop comes next. The design is in [SPEC.md](SPEC.md) and the plans are in [docs/superpowers/plans](docs/superpowers/plans).

## Requirements

- macOS
- Node 22.12 or newer
- pnpm 10

## Install

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js setup
```

Setup creates `~/.dev-plumbing/`, asks where plumbing projects should live, turns on start-at-login, starts the app and opens http://localhost:4545.

To get a `dev-plumbing` command on your PATH:

```bash
cd packages/cli && pnpm link --global
```

## Commands

```
dev-plumbing setup    create the config folder and start the app (safe to run again)
dev-plumbing start    start the service if it isn't running
dev-plumbing stop     stop the service
dev-plumbing status   is it running, and where is the config
dev-plumbing open     start if needed and open the app
dev-plumbing docs     rewrite ~/.dev-plumbing/README.md
dev-plumbing demo     add three example plumbing projects
```

## Configuration

Everything you can tune is a plain file in `~/.dev-plumbing/`. The README in that folder explains every setting, and the app's Settings and Plumbing rules pages edit the same files.

## Develop

```bash
pnpm dev              # service with reload on :4545, plus Vite on :5173 (open http://localhost:5173)
pnpm test             # unit tests
pnpm test:integration # builds, then starts and stops the real service
pnpm test:e2e         # builds, then runs Playwright against a temporary setup
pnpm check            # all of the above plus typecheck
```
````

- [ ] **Step 2: Record the spike result in the spec**

In `SPEC.md` §18, add this line directly under item 1 (the spike), with the decision from `spike/subagent-mcp/RESULTS.md` filled in:
```markdown
   - **Result (Plan 1):** <"Subagents can call plugin MCP tools directly." or "They can't; Plan 2 uses the JSON fallback.">
```

- [ ] **Step 3: Run the full check**

Run: `pnpm install --frozen-lockfile && pnpm check`
Expected: typecheck clean, then unit, integration and e2e tests all PASS.

- [ ] **Step 4: Check the public repo stays generic**

Run: `git grep -n -i -E "refill|/Users/jordanframpton" -- . ':!pnpm-lock.yaml' ':!docs/superpowers/plans'`
Expected: no output. The plans folder is left out because this plan names what must be kept out; tests use made-up paths like `/Users/a`.

- [ ] **Step 5: Commit and push**

```bash
git add README.md SPEC.md
git commit -m "docs: README, dev workflow and spike result"
git push origin HEAD
```

---

## After Plan 1: the plan series

Each plan is written once the one before it has landed, so its code matches what really exists.

- **Plan 2: The Claude loop** (spec §18 step 3). Written after this plan, using the spike result. It covers:
  - the plugin (the `/dev-plumbing` skill, the repo-setup, importer and thread agents, and the MCP server with `dp_open`, `dp_repo_profile`, `dp_write_items`, `dp_wait`, `dp_context` and `dp_reply`)
  - setup installing the plugin
  - importing plans into original and draft documents, with list screens filled from the rules files
  - the thread view (item on top, conversation below, radios with a note and a Custom answer)
  - Send this thread and Submit all, with listening and heartbeats
  - draft patching, auto-apply with Undo, and the Documents diff view
  - + Question / Concern / Idea
  - live updates over SSE.
- **Plan 3: Visual screens** (§18 step 4): the diagram renderer (ELK), Database (strip, diff cards, migration panel), UI mockups (kits, pins, Before/After), Flows (storyboard and sequence), and the Phases timeline.
- **Plan 4: Finalize spec and Bring changes in** (§18 step 5).
- **Plan 5: Whiteboard Defense** (§18 step 6): generation, Present, Study and Practice.
