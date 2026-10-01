# Plan 2: The Claude Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Claude to dev-plumbing. By the end:
- `/dev-plumbing path/to/plan.md` in Claude Code imports a plan into a plumbing project, with one importer subagent per plumbing type.
- You answer threads in the browser: radios with a note, presets, Custom, inline in list screens or in the thread view.
- **Send this thread** or **Submit all** applies plain accepts at once and sends everything else to the listening main window, which answers through one thread subagent per thread or linked group.
- Accepted changes land in the draft, with a Documents view that shows what changed and why.

**Architecture:** The loop has four pieces:
- **Core** (`packages/core`) gains the loop's data model and every file operation on a plumbing project: open, import, reply, submit, queue, changes, decisions and context packs. All of it is plain functions over a project folder, tested against temp folders.
- **The service** (`packages/service`) wraps those functions in HTTP routes. It runs them under a per-project lock, keeps an in-memory list of listening Claude windows, and pushes live updates to the browser over SSE.
- **A new `packages/mcp`** is the stdio MCP server Claude Code starts from the plugin. It's a thin client that forwards each `dp_*` tool to the service, starting the service if it isn't running.
- **The plugin** (`plugin/` plus a marketplace file at the repo root) brings the `/dev-plumbing` skill and the repo-setup, importer and thread subagents. `dev-plumbing setup` installs it.

**Tech Stack:** Plan 1's stack (TypeScript 5.9, Node 22, pnpm 10, Zod 3.25, Hono 4, React 19, Vite 7, Tailwind 4, TanStack Router and Query, Vitest 3, Playwright), plus `@modelcontextprotocol/sdk` 1.31 and `diff` 9.

**Spec:** `SPEC.md` (repo root). Read §5, §7–§10, §13, §15 and §18 step 3 before starting. The spike results are in `spike/subagent-mcp/RESULTS.md`: subagents call plugin MCP tools directly.

## What Plan 1 left in place

Plan 1 is merged on `main`. This plan builds on its code:
- **core:** schemas, config loading, the project store readers and demo projects.
- **service:** `createApp`, the security guard and the project and config routes.
- **cli:** setup, start, stop and status.
- **web:** the shell, the app home, the project home, Settings and Plumbing rules.

Everything Plan 1 deferred that this plan doesn't fix is listed in **Not in this plan** at the end.

## Facts about Claude Code this plan relies on

These were checked against the Claude Code docs on 2026-10-01.

- **Plugin MCP tool names** are `mcp__plugin_<plugin>_<server>__<tool>`, and dashes are kept. Ours are `mcp__plugin_dev-plumbing_dp__dp_open` and so on.
- **Plugin agents** are started with `subagent_type: "dev-plumbing:<name>"`. Their frontmatter supports `name`, `description`, `tools` (exact tool names), `model` and `color`. The Agent tool takes a per-call `model`.
- **A local-directory marketplace loads the plugin in place**, with no copy to the cache. So `plugin/dist/mcp.mjs` is used straight from the repo after `pnpm build`.
  - Install with `claude plugin marketplace add <repo>`, then `claude plugin install dev-plumbing@dev-plumbing --scope user`.
- **A per-server `timeout` in `.mcp.json`** is a hard wall-clock limit per tool call. It is also a floor for the 30-minute stdio idle timeout. Progress notifications reset the idle timer. We set 12 hours.
- **Long main-window MCP calls move to the background.** In an interactive session, a main-conversation MCP call still running after 2 minutes becomes a background task.
  - The window gets control back. The result arrives later as a task notification.
  - Subagent calls are never backgrounded. Neither are `claude -p` calls (unless `CLAUDE_AUTO_BACKGROUND_TASKS=1`).
  - So `dp_wait` doesn't keep the window busy: you can keep chatting while it listens. This is better than spec §15.3 expected.
- **The plugin's MCP server** gets `CLAUDE_PROJECT_DIR`, the session's project root. Its working directory is not documented, so the bridge uses `CLAUDE_PROJECT_DIR`.

## Decisions this plan makes

Review these. Each one is the plan's reading of the spec where the spec leaves room.

1. **Repo profiles are saved when detected.** The repo-setup subagent saves the profile it detects as `repos/<name>.json`, but only when no profile matches the repo yet. It never overwrites one. The main window tells you what it saved, and you check or change it in **Settings → Repos** (§6.3). **Detect again** comes in a later plan.
2. **The wait returns and repeats.** `dp_wait` returns `still-waiting` after 11.5 hours, and the window calls it again. Waits never hit the 12-hour hard limit.
3. **A window that dies loses nothing.**
   - Each MCP server pings the service every 30 seconds. A submission picked up by a window that stops pinging goes back in the queue for the next window.
   - Threads a window didn't reply to go back to **Your turn**, with your answer restored as a draft, so **Send** works again.
4. **Undo is for small edits only.**
   - Accepted options change the draft and resolve the thread. Undoing one would leave a decision pointing at a reverted change.
   - Every applied change is still recorded in `history/` and listed in the Draft's **Changes** view.
5. **Small edits can't delete text outright.** Every patch must keep some replacement text, so it can be inverted for Undo.
6. **Visual screens wait for Plan 3.** In this plan, Architecture, Database, UI changes and Flows items show as rows and in the thread view, with their summary and body. Importers already write their `data` in the §13.1 shapes, and Plan 3 draws them.
7. **Adding your own item sends it straight away.** **+ Question**, **+ Concern** and **+ Idea** send your message to Claude at once, as a one-thread submission.
   - The button label comes from a new optional rules-file header field, `addLabel`. Types without one show no button.
8. **Thread files are only changed by service operations.** Examples are saving a draft, adding a message and parking.
   - Each operation runs under a per-project lock, so a reply arriving while you type never overwrites your draft, and your draft never overwrites the reply.
   - That makes Plan 1's follow-up idea of ETag/If-Match unnecessary for threads.
9. **Message fields.**
   - Claude's message field is `smallEdits` (spec: `autoApplied`). Each entry points at a history entry that is applied, pending or undone.
   - Your messages also record the option's label and whether they were sent on their own or with Submit all.

## Global Constraints

Everything in Plan 1's Global Constraints still applies:
- Node `>=22.12`, pnpm `10.x`, TypeScript `strict`, ESM.
- The public repo stays generic: examples use the made-up "Acme" app, with no real company names, paths or emails.
- The config folder `~/.dev-plumbing/`, overridable with `DEV_PLUMBING_HOME`.
- Never overwrite a user's config file except through an explicit **Reset to default**.
- Atomic writes.
- The service binds `127.0.0.1` with the Host, token and same-origin guard.
- UI words "plumbing project", "plumbing type", "repo profile", plain sentence-case copy.
- The Ink wash theme exactly per §16: colour only as dots, text and thin lines, no tinted boxes, Tailwind's default palette off, one primary button per screen.
- One column under 768 px with no sideways scrolling, and the main action pinned at the bottom on phones.

New in this plan:
- **The service is the only writer of the projects folder.** Every write to a plumbing project goes through a core function called by the service under that project's lock (`withLock(`${repo}/${id}`, …)`). Subagents and the browser never write files.
- **Your repo's plan is only ever read.** The only writes into a clone are the `linkIntoClones` symlink and its line in `.git/info/exclude` (§6.3).
- **Submissions are written to disk before anything else happens.** That includes applying accepts and telling a window.
- **Subagents never edit the repo.**
  - Importer and thread agents get only `Read`, `Grep`, `Glob` and their two dp tools.
  - The repo-setup agent gets `Read`, `Grep`, `Glob` and `dp_repo_profile`.
- **Names:**
  - plugin `dev-plumbing`
  - marketplace `dev-plumbing`
  - MCP server `dp`
  - tools `dp_open`, `dp_repo_profile`, `dp_write_items`, `dp_wait`, `dp_context`, `dp_reply`
  - agents `repo-setup`, `importer`, `thread`
  - skill `dev-plumbing`
- **The MCP server's per-server `timeout` is `43200000`** (12 hours).
- **Exact copy, used verbatim:**
  - "Claude listening"
  - "Send this thread"
  - "Submit all · N drafts" (N is the number; singular "1 draft")
  - "Park"
  - "Custom answer"
  - "Recommended"
  - "What changes if you accept"
  - "Nothing changes until you send. An accept with no note applies the changes and resolves the thread. A note keeps it open for Claude's follow-up."
  - "Saved. No Claude window is listening. Run /dev-plumbing in any clone."
- **Status marks per §9:**
  - Your turn: seal dot
  - Draft: slate ring
  - With Claude: dashed slate ring
  - Resolved: moss check
  - Parked: mist dot
- **Tests clean up after themselves.** Every temp folder a test creates is removed when its file finishes (Task 1).

## Review Focus

These five situations aren't the main path, but they're the most likely to hurt someone using this. Each has a test in the task named.

1. **Accepting a proposal after the draft changed underneath it.** If the text Claude's option replaces is no longer in the draft, the draft must not be corrupted. The thread stays open with a clear system message, and your answer goes to Claude to redo it. Tested in Task 7 ("a change that no longer fits goes to Claude instead").
2. **A Claude window that dies halfway through a batch.** Threads must not stay **With Claude** forever. The next window to listen picks the work up again, and a window's own unanswered threads come back as drafts. Tested in Task 9 ("requeues work from windows that went away") and Task 12 ("a second window picks up what the first one left").
3. **Typing while Submit all or a Claude reply is being saved.** An autosaved draft must never be lost or overwritten by another write landing at the same moment, and the reply must land too. Tested in Task 13 ("a draft save racing Submit all and a Claude reply loses nothing").
4. **Submitting with no Claude window open, then opening one later, maybe from another clone.** Every submission is picked up exactly once, oldest first, and you're told it's saved. Tested in Task 12 ("queued submissions are picked up oldest first, once") and Task 17 (e2e, the "no window listening" message).
5. **A malformed import batch or reply from a subagent:**
   - unknown option ids
   - links to keys that don't exist
   - patches that don't match the draft
   - fields the plumbing type doesn't have

   It is refused as a whole, with a message that says what to fix, and nothing is half-written. Tested in Task 5 ("a bad batch writes nothing") and Task 8 ("a bad reply writes nothing").

---

## File Structure

```
dev-plumbing/
  .claude-plugin/marketplace.json        # Task 16: lets `claude plugin marketplace add <repo>` find the plugin
  plugin/                                # Task 16: the Claude Code plugin (loaded in place)
    .claude-plugin/plugin.json
    .mcp.json                            # server "dp": sh bin/dp-mcp.sh, timeout 12 h
    bin/dp-mcp.sh                        # starts dist/mcp.mjs with the Node that setup recorded
    dist/mcp.mjs                         # built by packages/mcp (gitignored)
    skills/dev-plumbing/SKILL.md
    agents/repo-setup.md  importer.md  thread.md
  testkit/tmp.ts                         # Task 1: temp folders that clean themselves up
  packages/
    core/src/
      schemas/loop.ts                    # Task 3: messages, options, changes, decisions, submissions, history, subagent inputs
      schemas/patch.ts                   # Task 3: exact-text patches on the draft
      schemas/markdown.ts                # Task 3: headings, sections, titles
      schemas/views.ts                   # extended in Tasks 2, 11, 13: API shapes the web app reads
      git.ts                             # Task 4: clone root, remote, branch
      store/io.ts                        # Task 4: read and write project files
      store/open.ts                      # Task 4: match a repo profile, open or create a plumbing project
      store/importItems.ts               # Task 5: importer batches, code reference checks
      store/validate.ts                  # Task 5: shared checks for Claude's messages
      store/changes.ts                   # Task 6: apply, record, undo changes
      store/decisions.ts                 # Task 6
      store/threads.ts                   # Task 7: drafts, park, your own items
      store/submit.ts                    # Task 7: Send this thread / Submit all
      store/reply.ts                     # Task 8: Claude's replies
      store/queue.ts                     # Task 9: pick up, finish, requeue, linked groups
      store/context.ts                   # Task 9: context packs for importers and threads
      docDiff.ts                         # Task 10: original vs draft, change previews
      store/detail.ts                    # Task 13: the thread view's data, list rows
    core/test/fixtures.ts                # Task 4: seeded plumbing projects for store tests
    service/src/
      lock.ts events.ts listeners.ts locate.ts errors.ts   # Task 11
      routes/events.ts                   # Task 11: GET /api/events (SSE)
      routes/claude.ts                   # Task 12: /api/claude/* for the MCP server
      routes/threads.ts                  # Task 13: thread, draft, park, submit, items, changes
    mcp/                                 # Task 14: new package
      package.json tsconfig.json tsup.config.ts vitest.config.ts
      src/client.ts src/start.ts src/tools.ts src/index.ts
      test/tools.test.ts test/plugin.test.ts test/bridge.integration.test.ts
    cli/src/plugin.ts                    # Task 15: install the plugin
    web/src/
      lib/useLiveUpdates.ts lib/useSubmit.ts
      components/ListeningMark.tsx DiffView.tsx AnswerForm.tsx
      pages/ThreadView.tsx ItemCard.tsx MessageList.tsx ListScreen.tsx AddItemForm.tsx ChangesView.tsx
    web/e2e/claude.ts                    # Task 17: act as Claude in e2e tests
    web/e2e/listening.spec.ts loop.spec.ts list.spec.ts documents.spec.ts
  scripts/smoke-claude.sh scripts/smoke-user.mjs   # Task 21: the real-Claude smoke test
  smoke/RESULTS.md                       # Task 21
```

---
### Task 1: Tests clean up their temp folders

Plan 1's tests leave every `mkdtemp` folder behind, about 2,300 per session. This task adds one helper and uses it everywhere. It's mechanical: the same two edits in each file.

**Files:**
- Create: `testkit/tmp.ts`
- Modify:
  - `packages/core/test/config.test.ts`, `loginItem.test.ts`, `runFile.test.ts`, `projects.test.ts`, `rules.test.ts`
  - `packages/service/test/helpers.ts`, `config.test.ts`, `projects.test.ts`, `static.test.ts`
  - `packages/cli/test/setup.test.ts`, `service.integration.test.ts`
- Test: the existing suites, plus a before/after count of temp folders.

**Interfaces:**
- Produces:
  - `tempDir(prefix: string): string`, which makes a folder under `os.tmpdir()` and remembers it.
  - `removeTempDirs(): void`, which deletes every remembered folder, unlocking `chmod 000` folders first.
  - Every test file that makes temp folders calls `afterAll(removeTempDirs)`.
  - Tasks 2 to 16 use `tempDir` for new tests.

- [ ] **Step 1: Count the folders the suites leave today**

Run:
```bash
ls -d "${TMPDIR:-/tmp}"/dp-* 2>/dev/null | wc -l
pnpm test >/dev/null
ls -d "${TMPDIR:-/tmp}"/dp-* 2>/dev/null | wc -l
```
Expected: the second number is higher than the first by about 40. That's the leak.

- [ ] **Step 2: Write the helper**

`testkit/tmp.ts`:
```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const created = new Set<string>();

/** Some tests lock folders with chmod 000 to simulate unreadable ones. Unlock them so they can be removed. */
function unlock(dir: string): void {
  try {
    fs.chmodSync(dir, 0o700);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) unlock(path.join(dir, entry.name));
    }
  } catch {
    // Already gone, or not ours to change.
  }
}

/** A fresh folder under the OS temp folder. Call `afterAll(removeTempDirs)` in every test file that uses this. */
export function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.add(dir);
  return dir;
}

/** Deletes every folder `tempDir` made in this test file. */
export function removeTempDirs(): void {
  for (const dir of created) {
    unlock(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  created.clear();
}
```

- [ ] **Step 3: Use it in every test file that makes temp folders**

Make two edits in each file listed below:
1. Replace each `await fs.mkdtemp(path.join(os.tmpdir(), '<prefix>'))` (or `fs.mkdtempSync(...)`) with `tempDir('<prefix>')`, keeping the prefix.
2. Add `afterAll(removeTempDirs)` once at the top level of the file, after the imports.

Add `afterAll` to the existing `vitest` import. Drop `os` from the imports when nothing else uses it.

Import line per package:
- In `packages/core/test/*.ts`: `import { removeTempDirs, tempDir } from '../../../testkit/tmp';`
- In `packages/service/test/*.ts`: the same path.
- In `packages/cli/test/*.ts`: the same path.

The files:

| File | What to replace |
|---|---|
| `packages/core/test/config.test.ts` | `dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-config-'));` becomes `dir = tempDir('dp-config-');` |
| `packages/core/test/loginItem.test.ts` | both `fs.mkdtemp(... 'dp-login-')` |
| `packages/core/test/runFile.test.ts` | all three `fs.mkdtemp(... 'dp-run-')` |
| `packages/core/test/projects.test.ts` | `'dp-types-'`, `'dp-projects-'` and `'dp-home-'` |
| `packages/core/test/rules.test.ts` | `fs.mkdtempSync(path.join(os.tmpdir(), 'dp-js-'))` |
| `packages/service/test/helpers.ts` | `const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-svc-'));` becomes `const tmp = tempDir('dp-svc-');`, then `export { removeTempDirs } from '../../../testkit/tmp';` at the end of the file |
| `packages/service/test/config.test.ts`, `projects.test.ts` | no `mkdtemp` of their own; add `afterAll(removeTempDirs)` and import `removeTempDirs` from `./helpers` |
| `packages/service/test/static.test.ts` | `'dp-web-'`; add `afterAll(removeTempDirs)` and import `removeTempDirs` from `./helpers` |
| `packages/cli/test/setup.test.ts` | `home = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-setup-'));` |
| `packages/cli/test/service.integration.test.ts` | `tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dp-int-'));`. Keep the existing `afterEach` that stops the service. |

- [ ] **Step 4: Check nothing is left behind**

Run:
```bash
pnpm typecheck
ls -d "${TMPDIR:-/tmp}"/dp-* 2>/dev/null | wc -l
pnpm test && pnpm test:integration
ls -d "${TMPDIR:-/tmp}"/dp-* 2>/dev/null | wc -l
```
Expected:
- The typecheck is clean.
- All tests pass.
- The two counts are equal.

If they aren't, `ls -dt "${TMPDIR:-/tmp}"/dp-* | head` shows which prefix still leaks.

- [ ] **Step 5: Commit**

```bash
git add testkit packages/core/test packages/service/test packages/cli/test
git commit -m "test: remove temp folders when each test file finishes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Say why the project list is empty, and follow symlinked folders

Before Plan 2 creates real projects, a mistyped or unmounted projects folder must explain itself, not show "No plumbing projects yet". Folders reached through a symlink, such as a shared folder linked into place, must be found.

**Files:**
- Modify:
  - `packages/core/src/store/projects.ts` (add `discoverProjects`, follow symlinks)
  - `packages/core/src/schemas/views.ts` (add `DiscoveryProblem`)
  - `packages/service/src/routes/projects.ts` (return `problems`)
  - `packages/web/src/api/client.ts`
  - `packages/web/src/pages/AppHome.tsx`
- Test:
  - `packages/core/test/projects.test.ts`
  - `packages/service/test/projects.test.ts`
  - `packages/web/e2e/app-home.spec.ts`

**Interfaces:**
- Consumes: `findProjects(settings, repos, home?)` and `ProjectRef` from Plan 1.
- Produces:
  - `type DiscoveryProblem = { folder: string; message: string }`, in core schemas.
  - `discoverProjects(settings: Settings, repos: RepoProfile[], home?: string): Promise<{ refs: ProjectRef[]; problems: DiscoveryProblem[] }>`.
  - `findProjects` keeps its signature and returns `(await discoverProjects(...)).refs`.
  - `GET /api/projects` returns `{ items, total, problems }`.
  - `api.projects` resolves to `{ items: ProjectSummary[]; total: number; problems: DiscoveryProblem[] }`.

- [ ] **Step 1: Write the failing core tests**

Add to `packages/core/test/projects.test.ts`. Add `discoverProjects` to the `../src/store/projects` import, and `tempDir` from `../../../testkit/tmp` (Task 1 added the import).
```ts
describe('discoverProjects', () => {
  it("says when a repo profile's projects folder doesn't exist", async () => {
    const profile = repoProfileSchema.parse({ name: 'ghost', match: ['github.com/acme/ghost'], projectsFolder: path.join(root, 'nowhere') });
    const { refs, problems } = await discoverProjects(settings(), [profile]);
    expect(refs).toHaveLength(3);
    expect(problems).toEqual([{ folder: path.join(root, 'nowhere'), message: expect.stringMatching(/repo profile "ghost".*doesn't exist/) }]);
  });

  it("stays quiet when the main projects folder doesn't exist yet", async () => {
    const { refs, problems } = await discoverProjects({ ...defaultSettings, projectsFolder: path.join(root, 'not-yet') }, []);
    expect(refs).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("says when the main projects folder can't be read", async () => {
    await fs.chmod(root, 0o000);
    try {
      const { problems } = await discoverProjects(settings(), []);
      expect(problems[0]?.message).toMatch(/can't be read/);
    } finally {
      await fs.chmod(root, 0o700);
    }
  });

  it('finds projects and repo folders reached through symlinks', async () => {
    const elsewhere = tempDir('dp-linked-');
    await writeDemoProjects(elsewhere, NOW);
    await fs.mkdir(path.join(root, 'linked'), { recursive: true });
    await fs.symlink(path.join(elsewhere, 'acme', 'restock-reminders'), path.join(root, 'linked', 'restock-copy'));
    await fs.symlink(path.join(elsewhere, 'beta'), path.join(root, 'beta-link'));
    const { refs } = await discoverProjects(settings(), []);
    const ids = refs.map((r) => `${r.repo}/${r.id}`);
    expect(ids).toContain('linked/restock-copy');
    expect(ids).toContain('beta-link/checkout-redesign');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/projects.test.ts`
Expected: FAIL, `discoverProjects` is not exported.

- [ ] **Step 3: Implement discovery with problems**

In `packages/core/src/schemas/views.ts`, add:
```ts
/** A projects folder that couldn't be read while listing plumbing projects. */
export type DiscoveryProblem = { folder: string; message: string };
```

In `packages/core/src/store/projects.ts`:
- Add `DiscoveryProblem` to the `../schemas` type imports.
- Add `import type { Dirent } from 'node:fs';`.
- Replace `subdirs` and `findProjects` with:
```ts
/** Sub-folder names, following symlinks to folders. An error code if the folder itself can't be listed. */
async function readSubdirs(dir: string): Promise<{ names: string[]; error?: string }> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return { names: [], error: (e as NodeJS.ErrnoException).code ?? 'UNKNOWN' };
  }
  const names: string[] = [];
  for (const d of entries) {
    if (d.name.startsWith('.')) continue;
    if (d.isDirectory()) names.push(d.name);
    else if (d.isSymbolicLink()) {
      const target = await fs.stat(path.join(dir, d.name)).catch(() => null);
      if (target?.isDirectory()) names.push(d.name);
    }
  }
  return { names: names.sort() };
}

function folderProblem(code: string): string {
  if (code === 'ENOENT') return "doesn't exist";
  if (code === 'ENOTDIR') return "isn't a folder";
  if (code === 'EACCES' || code === 'EPERM') return "can't be read (no permission)";
  return `can't be read (${code})`;
}

/**
 * Repo-profile folders first (<folder>/<project>), then settings.projectsFolder (<folder>/<repo>/<project>).
 * Each real folder once. A folder that can't be listed is reported, except a main projects folder that
 * doesn't exist yet (that's just a fresh install).
 */
export async function discoverProjects(
  settings: Settings,
  repos: RepoProfile[],
  home?: string,
): Promise<{ refs: ProjectRef[]; problems: DiscoveryProblem[] }> {
  const refs: ProjectRef[] = [];
  const problems: DiscoveryProblem[] = [];
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
    const r = await readSubdirs(folder);
    if (r.error) {
      problems.push({
        folder: profile.projectsFolder,
        message: `The projects folder for repo profile "${profile.name}" ${folderProblem(r.error)}. Check it in Settings → Repos.`,
      });
    }
    for (const id of r.names) await add(profile.name, id, path.join(folder, id));
  }
  const root = expandHome(settings.projectsFolder, home);
  const top = await readSubdirs(root);
  if (top.error && top.error !== 'ENOENT') {
    problems.push({ folder: settings.projectsFolder, message: `The projects folder ${folderProblem(top.error)}. Check it in Settings.` });
  }
  for (const repo of top.names) {
    const r = await readSubdirs(path.join(root, repo));
    if (r.error) problems.push({ folder: path.join(root, repo), message: `This folder ${folderProblem(r.error)}.` });
    for (const id of r.names) await add(repo, id, path.join(root, repo, id));
  }
  return { refs, problems };
}

export async function findProjects(settings: Settings, repos: RepoProfile[], home?: string): Promise<ProjectRef[]> {
  return (await discoverProjects(settings, repos, home)).refs;
}
```

- [ ] **Step 4: Run the core tests**

Run: `pnpm vitest run packages/core`
Expected: PASS, including Plan 1's existing discovery tests.

- [ ] **Step 5: Return the problems from the API (test first)**

Add to `packages/service/test/projects.test.ts` (`writeJsonAtomic` comes from `@dev-plumbing/core`):
```ts
it('lists project folders that could not be read', async () => {
  const { ctx } = await makeContext();
  await writeJsonAtomic(path.join(ctx.configDir, 'repos', 'ghost.json'), { name: 'ghost', match: ['github.com/acme/ghost'], projectsFolder: '/no/such/folder' });
  const res = await call(createApp(ctx), '/api/projects?tab=all');
  const body = (await res.json()) as { problems: { folder: string; message: string }[] };
  expect(body.problems).toEqual([{ folder: '/no/such/folder', message: expect.stringMatching(/"ghost".*doesn't exist/) }]);
});
```
Run: `pnpm vitest run packages/service/test/projects.test.ts`
Expected: FAIL, because `problems` is undefined.

In `packages/service/src/routes/projects.ts`:
- Import `discoverProjects` from `@dev-plumbing/core`.
- Change the `GET /projects` handler to:
```ts
r.get('/projects', async (c) => {
  const cfg = await loadConfig(ctx.configDir);
  const { refs, problems } = await discoverProjects(cfg.settings, cfg.repos, ctx.home);
  const tab = TABS.find((t) => t === c.req.query('tab')) ?? 'active';
  const list = await listProjectSummaries(refs, {
    q: c.req.query('q') ?? '',
    tab,
    offset: clampInt(c.req.query('offset'), 0, 1_000_000, 0),
    limit: clampInt(c.req.query('limit'), 1, 200, cfg.settings.homePageSize),
  });
  return c.json({ ...list, problems });
});
```
Run: `pnpm vitest run packages/service`
Expected: PASS.

- [ ] **Step 6: Show the problems on the app home (e2e first)**

Add to `packages/web/e2e/app-home.spec.ts`. Import `fs` from `node:fs`, and `configPath` and `writeJson` from `./env`.
```ts
test("explains a projects folder that can't be read", async ({ page }) => {
  writeJson('repos/ghost.json', { name: 'ghost', match: ['github.com/acme/ghost'], projectsFolder: '~/no-such-folder' });
  try {
    await page.goto('/');
    await expect(page.getByTestId('discovery-problem')).toContainText('repo profile "ghost"');
    await expect(page.getByTestId('discovery-problem')).toContainText("doesn't exist");
  } finally {
    fs.rmSync(configPath('repos/ghost.json'), { force: true });
  }
});
```
Run: `pnpm test:e2e app-home`
Expected: FAIL, because there is no `discovery-problem` element.

In `packages/web/src/api/client.ts`, add `DiscoveryProblem` to the type import from `@dev-plumbing/core/schemas`, and change the `projects` result type to:
```ts
request<{ items: ProjectSummary[]; total: number; problems: DiscoveryProblem[] }>(...)
```

In `packages/web/src/pages/AppHome.tsx`, render the problems directly under the `Segmented` filter's wrapper `div`:
```tsx
{projects.data?.problems.map((p) => (
  <p key={p.folder} className="mt-3 text-[12.5px] text-seal" data-testid="discovery-problem">
    <span className="break-all font-mono text-[11.5px]">{p.folder}</span>: {p.message}
  </p>
))}
```

Run: `pnpm test:e2e app-home` and `pnpm --filter @dev-plumbing/web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core packages/service packages/web
git commit -m "feat: explain unreadable projects folders and follow symlinked folders" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: The loop's data model and text patches

Everything later tasks pass around: messages, options, changes, decisions, submissions, history entries, and the inputs subagents send. It also adds the pure helpers that patch and read the draft. All of it is pure (no Node imports), so the web app can import the types.

**Files:**
- Create:
  - `packages/core/src/schemas/loop.ts`
  - `packages/core/src/schemas/patch.ts`
  - `packages/core/src/schemas/markdown.ts`
- Modify:
  - `packages/core/src/schemas/project.ts` (typed messages, item `key` and `flags`, project `importPending`)
  - `packages/core/src/schemas/plumbingType.ts` (`addLabel`)
  - `packages/core/src/schemas/index.ts`
  - `defaults/plumbing/questions.md`, `concerns.md`, `ideas.md`
- Test:
  - `packages/core/src/schemas/loop.test.ts`
  - `packages/core/src/schemas/patch.test.ts`
  - `packages/core/src/schemas/markdown.test.ts`
  - `packages/core/test/defaults.test.ts`

**Interfaces:**
- Consumes: Plan 1's `itemSchema`, `threadSchema`, `plumbingProjectSchema` and `plumbingTypeHeaderSchema`.
- Produces, from `@dev-plumbing/core/schemas` (later tasks use these exact names):
  - **Ids and items:**
    - `ID` (regex) and `idSchema`
    - `codeRefSchema` / `CodeRef`
    - `mdAnchorSchema`
    - `mdPatchSchema` / `MdPatch`
    - `itemPatchSchema` / `ItemPatch`
    - `changeSchema` / `Change`
    - `optionSchema` / `Option`
    - `itemFlagSchema`
  - **Messages:**
    - `messageSchema` (a discriminated union on `author`), with `Message`, `YouMessage`, `ClaudeMessage` and `SystemMessage`
    - `ThreadDraft`
  - **Records:**
    - `decisionSchema` / `Decision`
    - `submissionSchema` / `Submission`
    - `historyEntrySchema` / `HistoryEntry`
    - `ChangeState` and `changeState(entry)`
  - **Subagent inputs:**
    - `claudeMessageInputSchema`
    - `importItemSchema` / `ImportItem`
    - `importBatchSchema` / `ImportBatch`
    - `newItemSchema`
    - `replySchema` / `ReplyInput`
  - **Patches:**
    - `applyMdPatches(text, patches): PatchResult`
    - `invertMdPatches(patches)`
    - `countOccurrences(text, find)`
  - **Markdown:**
    - `headingsOf(md): Heading[]`
    - `sectionFor(md, heading): string | null`
    - `titleFromMarkdown(md): string | null`
    - `firstParagraph(md, max?): string`
  - **Changed shapes:**
    - `Item` gains optional `key` and `flags`.
    - `Thread['messages']` is `Message[]`.
    - `PlumbingProject` gains `importPending: string[]` (default `[]`).
    - `PlumbingTypeHeader` gains optional `addLabel`.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/schemas/patch.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyMdPatches, countOccurrences, invertMdPatches } from './patch';

const draft = 'Log reminders in a table.\n\nReminders go by SMS.\n';

describe('applyMdPatches', () => {
  it('replaces text that appears exactly once', () => {
    expect(applyMdPatches(draft, [{ find: 'by SMS', replace: 'by SMS and email' }])).toEqual({
      ok: true,
      text: 'Log reminders in a table.\n\nReminders go by SMS and email.\n',
    });
  });

  it('applies patches in order, each against the text so far', () => {
    const r = applyMdPatches(draft, [
      { find: 'a table', replace: 'a RestockReminder table' },
      { find: 'RestockReminder table.', replace: 'RestockReminder table (one row per send).' },
    ]);
    expect(r).toEqual({ ok: true, text: 'Log reminders in a RestockReminder table (one row per send).\n\nReminders go by SMS.\n' });
  });

  it('refuses text that is missing or appears more than once', () => {
    expect(applyMdPatches(draft, [{ find: 'by fax', replace: 'x' }])).toEqual({ ok: false, error: expect.stringMatching(/isn't in the draft/) });
    expect(applyMdPatches(draft, [{ find: 'eminders', replace: 'x' }])).toEqual({ ok: false, error: expect.stringMatching(/appears 2 times/) });
  });

  it('treats $ in the replacement as plain text', () => {
    expect(applyMdPatches('cost: X', [{ find: 'X', replace: '$& $1 $$' }])).toEqual({ ok: true, text: 'cost: $& $1 $$' });
  });
});

describe('invertMdPatches', () => {
  it('undoes a set of patches', () => {
    const patches = [
      { find: 'a table', replace: 'a RestockReminder table' },
      { find: 'by SMS', replace: 'by SMS and email' },
    ];
    const forward = applyMdPatches(draft, patches);
    const inverse = invertMdPatches(patches);
    if (!forward.ok || !inverse.ok) throw new Error('expected both to work');
    expect(applyMdPatches(forward.text, inverse.patches)).toEqual({ ok: true, text: draft });
  });

  it("can't invert a patch that deleted text outright", () => {
    expect(invertMdPatches([{ find: 'Reminders go by SMS.\n', replace: '' }])).toEqual({ ok: false, error: expect.stringMatching(/can't be undone/) });
  });
});

it('counts occurrences', () => {
  expect(countOccurrences('a a a', 'a')).toBe(3);
  expect(countOccurrences('abc', '')).toBe(0);
});
```

`packages/core/src/schemas/markdown.test.ts`:
````ts
import { describe, expect, it } from 'vitest';
import { firstParagraph, headingsOf, sectionFor, titleFromMarkdown } from './markdown';

const md = [
  '# Restock reminders',
  '',
  'Remind customers before an item',
  'runs out.',
  '',
  '## Approach',
  '',
  'A daily job.',
  '',
  '```',
  '## not a heading',
  '```',
  '',
  '### Details',
  '',
  'More.',
  '',
  '## Data',
  '',
  'A table.',
  '',
].join('\n');

describe('markdown helpers', () => {
  it('lists headings outside code fences', () => {
    expect(headingsOf(md).map((h) => [h.level, h.text])).toEqual([
      [1, 'Restock reminders'],
      [2, 'Approach'],
      [3, 'Details'],
      [2, 'Data'],
    ]);
  });

  it('cuts a section up to the next heading at the same or a higher level', () => {
    expect(sectionFor(md, 'approach')).toBe('## Approach\n\nA daily job.\n\n```\n## not a heading\n```\n\n### Details\n\nMore.');
    expect(sectionFor(md, '  Data ')).toBe('## Data\n\nA table.');
    expect(sectionFor(md, 'Nope')).toBeNull();
  });

  it('finds the title and the first paragraph', () => {
    expect(titleFromMarkdown(md)).toBe('Restock reminders');
    expect(titleFromMarkdown('no heading here')).toBeNull();
    expect(firstParagraph(md)).toBe('Remind customers before an item runs out.');
    expect(firstParagraph(`# T\n\n${'word '.repeat(200)}`, 20)).toHaveLength(20);
  });
});
````

`packages/core/src/schemas/loop.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { changeSchema, changeState, importItemSchema, messageSchema, optionSchema, replySchema } from './loop';
import { plumbingProjectSchema, threadSchema } from './project';

describe('loop schemas', () => {
  it('reads every kind of message, including the plain ones Plan 1 wrote', () => {
    expect(messageSchema.parse({ id: 'a', at: 'now', author: 'claude', text: 'Hi' })).toMatchObject({ author: 'claude' });
    expect(messageSchema.parse({ id: 'b', at: 'now', author: 'you', text: 'Both.' })).toMatchObject({ author: 'you' });
    expect(messageSchema.parse({ id: 'c', at: 'now', author: 'you', optionId: 'yes', optionLabel: 'Yes', note: 'n' })).toMatchObject({ optionLabel: 'Yes' });
    expect(messageSchema.safeParse({ id: 'd', at: 'now', author: 'claude' }).success).toBe(false);
    expect(threadSchema.parse({ id: 't', itemId: 'i', status: 'idle', messages: [{ id: 's', at: 'now', author: 'system', text: 'Parked.' }] }).messages[0]?.author).toBe('system');
  });

  it('keeps option ids safe and changes strict', () => {
    expect(optionSchema.safeParse({ id: 'keep-365', label: 'Keep 365 days' }).success).toBe(true);
    expect(optionSchema.safeParse({ id: '../x', label: 'Bad' }).success).toBe(false);
    expect(changeSchema.safeParse({ md: [{ find: 'a', replace: 'b' }], other: 1 }).success).toBe(false);
    expect(changeSchema.safeParse({ items: [{ itemId: 'i', patch: { owner: 'me' } }] }).success).toBe(false);
  });

  it('describes what subagents send', () => {
    expect(importItemSchema.safeParse({ key: 'who-gets-reminders', title: 'Who gets reminders?', summary: 'Everyone or some?' }).success).toBe(true);
    expect(importItemSchema.safeParse({ key: 'Bad Key', title: 'x', summary: 'y' }).success).toBe(false);
    expect(replySchema.safeParse({ threadId: 't', text: 'Done.', resolve: { decision: 'Both channels' } }).success).toBe(true);
    expect(replySchema.safeParse({ threadId: 't', text: '' }).success).toBe(false);
  });

  it('gives Plan 1 projects an empty import queue', () => {
    const p = plumbingProjectSchema.parse({
      id: 'x', repo: 'acme', title: 'X', status: 'active',
      source: { path: 'a.md', clone: '~/acme', branch: 'main', hashAtImport: 'h' },
      docs: { original: 'docs/original.md', draft: 'docs/draft.md' },
      createdAt: 'now', updatedAt: 'now',
    });
    expect(p.importPending).toEqual([]);
  });

  it('tells applied, pending and undone changes apart', () => {
    const base = { id: 'c', at: 'now', threadId: 't', kind: 'small-edit' as const, summary: 's', change: {}, itemsBefore: {}, itemsAfter: {} };
    expect(changeState(base)).toBe('pending');
    expect(changeState({ ...base, appliedAt: 'now' })).toBe('applied');
    expect(changeState({ ...base, appliedAt: 'now', undoneAt: 'later' })).toBe('undone');
  });
});
```

Add to `packages/core/test/defaults.test.ts`, inside the existing describe that has the `type(...)` helper:
```ts
it('labels the add button on Questions, Concerns and Ideas', () => {
  expect([type('questions').addLabel, type('concerns').addLabel, type('ideas').addLabel]).toEqual(['Question', 'Concern', 'Idea']);
  expect(type('phases').addLabel).toBeUndefined();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core`
Expected: FAIL. The modules `./patch`, `./markdown` and `./loop` are missing, and `addLabel` is undefined.

- [ ] **Step 3: Write the patch and markdown helpers**

`packages/core/src/schemas/patch.ts`:
```ts
import type { MdPatch } from './loop';

export type PatchResult = { ok: true; text: string } | { ok: false; error: string };

export const countOccurrences = (text: string, find: string): number => (find ? text.split(find).length - 1 : 0);

const clip = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}…` : s).replace(/\n/g, '⏎');

/**
 * Applies exact-text patches in order. Each `find` must appear exactly once in the text as it is when that
 * patch runs. Replacement text is used literally ($ has no special meaning).
 */
export function applyMdPatches(text: string, patches: MdPatch[]): PatchResult {
  let out = text;
  for (const [i, p] of patches.entries()) {
    const n = countOccurrences(out, p.find);
    if (n === 0) return { ok: false, error: `Patch ${i + 1}: the text to replace isn't in the draft: "${clip(p.find)}".` };
    if (n > 1) {
      return {
        ok: false,
        error: `Patch ${i + 1}: the text to replace appears ${n} times in the draft. Include more of the surrounding text so it matches once: "${clip(p.find)}".`,
      };
    }
    const at = out.indexOf(p.find);
    out = out.slice(0, at) + p.replace + out.slice(at + p.find.length);
  }
  return { ok: true, text: out };
}

/** The patches that undo `patches`. A patch that deleted text outright (empty replace) can't be inverted. */
export function invertMdPatches(patches: MdPatch[]): { ok: true; patches: MdPatch[] } | { ok: false; error: string } {
  if (patches.some((p) => p.replace === '')) return { ok: false, error: "A change that deletes text outright can't be undone." };
  return { ok: true, patches: [...patches].reverse().map((p) => ({ find: p.replace, replace: p.find })) };
}
```

`packages/core/src/schemas/markdown.ts`:
```ts
export type Heading = { level: number; text: string; line: number };

const FENCE = /^\s*(```|~~~)/;
const ATX = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** ATX headings (# to ######), ignoring lines inside code fences. `line` is 0-based. */
export function headingsOf(md: string): Heading[] {
  const out: Heading[] = [];
  let fenced = false;
  md.split('\n').forEach((line, i) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const m = ATX.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i });
  });
  return out;
}

/** The section that starts at `heading` (matched ignoring case and spacing), up to the next heading at the same or a higher level. */
export function sectionFor(md: string, heading: string): string | null {
  const hs = headingsOf(md);
  const i = hs.findIndex((h) => norm(h.text) === norm(heading));
  if (i < 0) return null;
  const start = hs[i];
  const next = hs.slice(i + 1).find((h) => h.level <= start.level);
  const lines = md.split('\n');
  return lines.slice(start.line, next ? next.line : lines.length).join('\n').trimEnd();
}

export function titleFromMarkdown(md: string): string | null {
  return headingsOf(md).find((h) => h.level === 1)?.text ?? null;
}

/** The first paragraph of prose, joined onto one line and cut to `max` characters. */
export function firstParagraph(md: string, max = 600): string {
  let fenced = false;
  const para: string[] = [];
  for (const line of md.split('\n')) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      if (para.length) break;
      continue;
    }
    if (fenced) continue;
    if (ATX.test(line) || !line.trim()) {
      if (para.length) break;
      continue;
    }
    para.push(line.trim());
  }
  const text = para.join(' ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
```

- [ ] **Step 4: Write the loop schemas**

`packages/core/src/schemas/loop.ts`:
```ts
import { z } from 'zod';

/** Ids that are safe as file names and URL segments. */
export const ID = /^[a-z0-9][a-z0-9-]*$/;
export const idSchema = z.string().max(80).regex(ID, 'use lowercase letters, numbers and dashes, starting with a letter or number');

export const codeRefSchema = z.object({
  path: z.string().min(1).max(300),
  symbol: z.string().min(1).max(200).optional(),
  verified: z.boolean().optional(),
});
export type CodeRef = z.infer<typeof codeRefSchema>;

export const mdAnchorSchema = z.object({
  heading: z.string().min(1).max(200),
  lines: z.tuple([z.number().int().min(1), z.number().int().min(1)]).optional(),
});

export const mdPatchSchema = z.object({ find: z.string().min(1).max(10_000), replace: z.string().max(20_000) });
export type MdPatch = z.infer<typeof mdPatchSchema>;

export const itemPatchSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    summary: z.string().min(1).max(500).optional(),
    body: z.string().max(20_000).optional(),
    fields: z.record(z.string().max(500)).optional(),
    links: z.array(z.string()).max(30).optional(),
    codeRefs: z.array(codeRefSchema).max(30).optional(),
    mdAnchor: mdAnchorSchema.optional(),
    data: z.unknown().optional(),
  })
  .strict();
export type ItemPatch = z.infer<typeof itemPatchSchema>;

/** What accepting an option, or applying a small edit, does: exact-text patches on draft.md and item updates. */
export const changeSchema = z
  .object({
    md: z.array(mdPatchSchema).max(20).optional(),
    items: z.array(z.object({ itemId: z.string().min(1), patch: itemPatchSchema })).max(20).optional(),
  })
  .strict();
export type Change = z.infer<typeof changeSchema>;

export const optionSchema = z.object({
  id: idSchema,
  label: z.string().min(1).max(200),
  detail: z.string().max(2_000).optional(),
  change: changeSchema.optional(),
});
export type Option = z.infer<typeof optionSchema>;

export const itemFlagSchema = z.object({ reason: z.string(), fromThreadId: z.string(), at: z.string() });

export const youMessageSchema = z
  .object({
    id: z.string(),
    at: z.string(),
    author: z.literal('you'),
    optionId: z.string().optional(),
    optionLabel: z.string().optional(),
    note: z.string().optional(),
    text: z.string().optional(),
    sentWith: z.enum(['thread', 'all']).optional(),
  })
  .passthrough();

export const claudeMessageSchema = z
  .object({
    id: z.string(),
    at: z.string(),
    author: z.literal('claude'),
    text: z.string(),
    options: z.array(optionSchema).optional(),
    recommended: z.string().optional(),
    smallEdits: z.array(z.object({ changeId: z.string(), summary: z.string() })).optional(),
    newItemIds: z.array(z.string()).optional(),
    impacts: z.array(z.object({ itemId: z.string(), reason: z.string() })).optional(),
    filesRead: z.array(z.string()).optional(),
    resolved: z.boolean().optional(),
    /** The message an importer wrote when the item was created. */
    opening: z.boolean().optional(),
  })
  .passthrough();

export const systemMessageSchema = z.object({ id: z.string(), at: z.string(), author: z.literal('system'), text: z.string() }).passthrough();

export const messageSchema = z.discriminatedUnion('author', [youMessageSchema, claudeMessageSchema, systemMessageSchema]);
export type Message = z.infer<typeof messageSchema>;
export type YouMessage = z.infer<typeof youMessageSchema>;
export type ClaudeMessage = z.infer<typeof claudeMessageSchema>;
export type SystemMessage = z.infer<typeof systemMessageSchema>;

/**
 * What you've typed but not sent.
 * `optionId` is one of Claude's option ids, `preset:<n>` for the plumbing type's nth answer preset, or `custom`.
 */
export type ThreadDraft = { optionId?: string; note?: string; text?: string; updatedAt: string };
const draftSchema = z.object({ optionId: z.string().optional(), note: z.string().optional(), text: z.string().optional(), updatedAt: z.string() });

export const decisionSchema = z.object({
  id: z.string(),
  text: z.string(),
  threadId: z.string(),
  itemIds: z.array(z.string()),
  at: z.string(),
  supersededBy: z.string().optional(),
});
export type Decision = z.infer<typeof decisionSchema>;

/** One press of Send this thread or Submit all. `sent` threads went to Claude; `resolved` ones were plain accepts. */
export const submissionSchema = z.object({
  id: z.string(),
  at: z.string(),
  scope: z.enum(['thread', 'all']),
  drafts: z.record(draftSchema),
  sent: z.array(z.string()).default([]),
  resolved: z.array(z.string()).default([]),
  processedAt: z.string().optional(),
  pickedUpAt: z.string().optional(),
  pickedUpBy: z.string().optional(),
  finishedAt: z.string().optional(),
  requeuedAt: z.string().optional(),
});
export type Submission = z.infer<typeof submissionSchema>;

/** One change to the draft or items, kept in history/ for the Changes view and for Undo. */
export const historyEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  threadId: z.string(),
  kind: z.enum(['small-edit', 'accept']),
  summary: z.string(),
  change: changeSchema,
  appliedAt: z.string().optional(),
  undoneAt: z.string().optional(),
  itemsBefore: z.record(z.unknown()).default({}),
  itemsAfter: z.record(z.unknown()).default({}),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type ChangeState = 'applied' | 'undone' | 'pending';
export const changeState = (h: Pick<HistoryEntry, 'appliedAt' | 'undoneAt'>): ChangeState => (h.undoneAt ? 'undone' : h.appliedAt ? 'applied' : 'pending');

// What subagents send. Limits keep a confused subagent from writing huge files.

export const claudeMessageInputSchema = z.object({
  text: z.string().min(1).max(20_000),
  options: z.array(optionSchema).min(1).max(6).optional(),
  recommended: z.string().optional(),
});

export const importItemSchema = z.object({
  key: idSchema,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(500),
  body: z.string().max(20_000).optional(),
  fields: z.record(z.string().max(500)).optional(),
  mdAnchor: mdAnchorSchema.optional(),
  codeRefs: z.array(codeRefSchema.omit({ verified: true })).max(30).optional(),
  links: z.array(z.string()).max(30).optional(),
  data: z.unknown().optional(),
  message: claudeMessageInputSchema.optional(),
});
export type ImportItem = z.infer<typeof importItemSchema>;

/** Either items or a "no changes" reason, never both. Checked by writeImportBatch. */
export const importBatchSchema = z.object({
  items: z.array(importItemSchema).max(60).optional(),
  noChanges: z.string().min(1).max(500).optional(),
});
export type ImportBatch = z.infer<typeof importBatchSchema>;

export const newItemSchema = importItemSchema.omit({ key: true, links: true }).extend({
  type: z.string().min(1),
  message: claudeMessageInputSchema,
});

export const replySchema = z.object({
  threadId: z.string().min(1),
  text: z.string().min(1).max(20_000),
  options: z.array(optionSchema).min(1).max(6).optional(),
  recommended: z.string().optional(),
  smallEdits: z.array(z.object({ summary: z.string().min(1).max(200), change: changeSchema })).max(10).optional(),
  newItems: z.array(newItemSchema).max(10).optional(),
  impacts: z.array(z.object({ itemId: z.string().min(1), reason: z.string().min(1).max(300) })).max(20).optional(),
  filesRead: z.array(z.string()).max(200).optional(),
  resolve: z.object({ decision: z.string().min(1).max(300), itemIds: z.array(z.string()).optional() }).optional(),
});
export type ReplyInput = z.infer<typeof replySchema>;
```

- [ ] **Step 5: Use the typed messages in the project schemas**

In `packages/core/src/schemas/project.ts`:
- Delete its own `messageSchema`.
- Import from `./loop`: `codeRefSchema`, `itemFlagSchema`, `mdAnchorSchema` and `messageSchema`.
- Change `plumbingProjectSchema`, `itemSchema` and `threadSchema` to:
```ts
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
  /** Plumbing types whose importer hasn't written yet. */
  importPending: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const itemSchema = z
  .object({
    id: z.string(),
    /** The importer's key, kept so a later re-import can match the item. */
    key: z.string().optional(),
    type: z.string(),
    title: z.string(),
    summary: z.string(),
    body: z.string().optional(),
    fields: z.record(z.string()).optional(),
    mdAnchor: mdAnchorSchema.optional(),
    codeRefs: z.array(codeRefSchema).optional(),
    links: z.array(z.string()).optional(),
    data: z.unknown().optional(),
    threadId: z.string(),
    createdBy: z.enum(['import', 'claude', 'you', 'whiteboard']),
    /** "May need another look": set when another thread's reply says it might affect this item. */
    flags: z.array(itemFlagSchema).optional(),
  })
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
```

In `packages/core/src/schemas/plumbingType.ts`:
- Add `addLabel: z.string().min(1).max(40).optional(),` after `enabled` in `plumbingTypeHeaderSchema`.
- Add this row to `plumbingTypeHeaderDocs`:
```ts
  { key: 'addLabel', description: 'List screens only: the name on the add button, e.g. Question for "+ Question". Leave it out for no button.' },
```

In `packages/core/src/schemas/index.ts`, add:
```ts
export * from './loop';
export * from './patch';
export * from './markdown';
```

In `defaults/plumbing/questions.md`, `concerns.md` and `ideas.md`, add one header line after `enabled: true`:
- `addLabel: Question`
- `addLabel: Concern`
- `addLabel: Idea`

- [ ] **Step 6: Run the tests and the typecheck**

Run: `pnpm vitest run packages/core && pnpm typecheck`
Expected: PASS.
- Plan 1's store and demo tests still pass, because the demo messages are plain `claude` and `you` messages with text.
- If the typecheck flags `lastMessage` in `store/projects.ts`, narrow it with `m.text ?` (every author can carry text).

- [ ] **Step 7: Commit**

```bash
git add packages/core defaults
git commit -m "feat(core): the Claude loop's data model, text patches and markdown helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Project files, git, and opening a plan

This task adds:
- one place that reads and writes a plumbing project's files
- the git facts `/dev-plumbing` needs
- matching a clone to its repo profile
- creating or reopening a plumbing project from a plan

**Files:**
- Create:
  - `packages/core/src/store/io.ts`
  - `packages/core/src/git.ts`
  - `packages/core/src/store/open.ts`
  - `packages/core/test/fixtures.ts`
- Modify:
  - `packages/core/src/store/projects.ts` (use `io.ts`'s readers instead of its own copies)
  - `packages/core/src/index.ts`
- Test:
  - `packages/core/test/io.test.ts`
  - `packages/core/test/open.test.ts`

**Interfaces:**
- Consumes:
  - From Task 3: `plumbingProjectSchema`, `itemSchema`, `threadSchema`, `decisionSchema`, `submissionSchema`, `historyEntrySchema`, `titleFromMarkdown`, `normalizeRemote`
  - From Plan 1: `writeFileAtomic`, `writeJsonAtomic`, `expandHome`
  - From Task 1: `tempDir`
- Produces (core, all exported from `@dev-plumbing/core`):
  - **Error classes** in `store/io.ts`:
    - `StoreError`: something asked for doesn't exist or is damaged. The service answers 404.
    - `InputError`: the caller sent something unusable, and the message says what to fix. The service answers 400.
    - `ConflictError`: the project moved on, for example the draft changed. The service answers 409.
  - **File access:**
    - `readJsonFile(file): Promise<JsonRead>`
    - `readFolder<T>(dir, schema)`
    - `projectFiles(dir)`
    - `newId(prefix, now?)`: sortable within a process and file-safe.
    - `readProjectFile` / `writeProjectFile(dir, project)`
    - `readItem(dir, id)` / `writeItem(dir, item)`
    - `readThread(dir, id)` / `writeThread(dir, thread)`
    - `readItems(dir)` / `readThreads(dir)`, each returning `{ values, bad }`
    - `readDecisions(dir)` / `writeDecisions(dir, list)`
    - `readSubmissions(dir)`, sorted oldest first, and `readSubmission(dir, id)` / `writeSubmission(dir, s)`
    - `readHistory(dir)`, sorted oldest first, and `readHistoryEntry(dir, id)` / `writeHistoryEntry(dir, h)`
    - `docPath(dir, rel)`
    - `readDocText(dir, rel)` / `writeDocText(dir, rel, text)`
    - `touchProject(dir, now)`
  - **git.ts:**
    - `type GitInfo = { root: string; remote: string | null; branch: string; excludeFile: string }`
    - `gitInfo(cwd): Promise<GitInfo>`
    - `class NotAGitRepoError extends InputError`
  - **open.ts:**
    - `matchProfile(remote: string | null, profiles: RepoProfile[]): RepoProfile | undefined`
    - `suggestRepoName(remote: string | null, root: string): string`
    - `repoProjectsFolder(settings: Settings, profile: RepoProfile, home?: string): string`
    - `slugify(text: string): string`
    - `tildify(p: string, home?: string): string`
    - `class PlanError extends InputError`
    - `resolvePlan(o: { root: string; cwd: string; plan: string }): Promise<{ rel: string; text: string }>`
    - `openPlan(o: { folder: string; repo: string; clone: string; branch: string; plan: { rel: string; text: string }; enabledTypes: string[]; home?: string; now?: Date }): Promise<{ id: string; dir: string; created: boolean }>`
    - `linkIntoClone(o: { clone: string; excludeFile: string; folder: string; linkName: string }): Promise<'created' | 'exists' | 'blocked'>`
  - **Test fixtures** (`packages/core/test/fixtures.ts`, used by Tasks 5–13):
    - `DRAFT`
    - `listType(id, extra?)`
    - `TYPES`
    - `pair(id, opts?)`
    - `seedProject(seed?)`
    - `makeRepo(o?)`

- [ ] **Step 1: Write the fixtures**

`packages/core/test/fixtures.ts`:
```ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomic, writeJsonAtomic } from '../src/atomic';
import type { Item, Message, Option, PlumbingProject, PlumbingType, Thread, ThreadStatus } from '../src/schemas';
import { tempDir } from '../../../testkit/tmp';

export const DRAFT = [
  '# Restock reminders',
  '',
  'Remind customers before a subscription item runs out.',
  '',
  '## Approach',
  '',
  'A daily job finds subscriptions due soon and sends a reminder.',
  '',
  '## Data',
  '',
  'Log reminders in a table.',
  '',
].join('\n');

export function listType(id: string, extra: Partial<PlumbingType> = {}): PlumbingType {
  return {
    id,
    title: id[0].toUpperCase() + id.slice(1),
    order: 1,
    screen: 'list',
    emptyMessage: 'Nothing here.',
    fields: [],
    answerPresets: [],
    timeline: false,
    enabled: true,
    file: `${id}.md`,
    body: '## Rules\n- Be brief.\n',
    sections: { Rules: '- Be brief.' },
    ...extra,
  };
}

export const TYPES: PlumbingType[] = [
  listType('architecture', { title: 'Architecture', screen: 'diagram', order: 1 }),
  listType('questions', { title: 'Questions', order: 5, fields: ['blocking', 'default'], addLabel: 'Question' }),
  listType('concerns', { title: 'Concerns', order: 6, fields: ['severity', 'likelihood'], answerPresets: ["Accept Claude's fix", 'Accept the risk'], addLabel: 'Concern' }),
];

/** An item and its thread. The thread opens with a Claude message carrying `options`, if any. */
export function pair(
  id: string,
  o: { type?: string; title?: string; status?: ThreadStatus; options?: Option[]; recommended?: string; draft?: Thread['draft']; links?: string[]; fields?: Record<string, string>; messages?: Message[] } = {},
): { item: Item; thread: Thread } {
  const item: Item = {
    id,
    type: o.type ?? 'questions',
    title: o.title ?? `Question ${id}`,
    summary: 'A summary.',
    threadId: `t-${id}`,
    createdBy: 'import',
    ...(o.links ? { links: o.links } : {}),
    ...(o.fields ? { fields: o.fields } : {}),
  };
  const opening: Message = {
    id: `m-${id}`,
    at: '2026-10-01T09:00:00.000Z',
    author: 'claude',
    text: 'Which one?',
    opening: true,
    ...(o.options ? { options: o.options } : {}),
    ...(o.recommended ? { recommended: o.recommended } : {}),
  };
  const thread: Thread = { id: `t-${id}`, itemId: id, status: o.status ?? 'your_turn', ...(o.draft ? { draft: o.draft } : {}), messages: o.messages ?? [opening] };
  return { item, thread };
}

export type Seed = { pairs?: { item: Item; thread: Thread }[]; project?: Partial<PlumbingProject>; draft?: string };

/** A plumbing project folder at <tmp>/acme/restock with the given items and threads. Returns its folder. */
export async function seedProject(seed: Seed = {}): Promise<string> {
  const dir = path.join(tempDir('dp-store-'), 'acme', 'restock');
  const project: PlumbingProject = {
    id: 'restock',
    repo: 'acme',
    title: 'Restock reminders',
    source: { path: 'docs/specs/restock.md', clone: '/tmp/acme', branch: 'main', hashAtImport: 'x' },
    docs: { original: 'docs/original.md', draft: 'docs/draft.md' },
    status: 'active',
    emptyTypes: [],
    importPending: [],
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...seed.project,
  };
  await writeFileAtomic(path.join(dir, 'docs', 'original.md'), seed.draft ?? DRAFT);
  await writeFileAtomic(path.join(dir, 'docs', 'draft.md'), seed.draft ?? DRAFT);
  for (const p of seed.pairs ?? []) {
    await writeJsonAtomic(path.join(dir, 'items', `${p.item.id}.json`), p.item);
    await writeJsonAtomic(path.join(dir, 'threads', `${p.thread.id}.json`), p.thread);
  }
  await writeJsonAtomic(path.join(dir, 'project.json'), project);
  return dir;
}

/** A git repo with a remote and one plan file. Returns its real path (macOS resolves /var to /private/var). */
export function makeRepo(o: { remote?: string | null; plan?: string; planText?: string } = {}): string {
  const dir = tempDir('dp-repo-');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  if (o.remote !== null) git('remote', 'add', 'origin', o.remote ?? 'git@github.com:acme/acme.git');
  const plan = o.plan ?? 'docs/specs/restock-reminders.md';
  fs.mkdirSync(path.dirname(path.join(dir, plan)), { recursive: true });
  fs.writeFileSync(path.join(dir, plan), o.planText ?? DRAFT);
  return fs.realpathSync(dir);
}
```

- [ ] **Step 2: Write the failing tests**

`packages/core/test/io.test.ts`:
```ts
import fs from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { newId, readDocText, readItem, readSubmissions, StoreError, writeSubmission } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject } from './fixtures';

afterAll(removeTempDirs);

describe('project files', () => {
  it('makes ids that are file-safe and sort in creation order', () => {
    const now = new Date('2026-10-01T09:00:00Z');
    const ids = Array.from({ length: 5 }, () => newId('c', now));
    expect(ids.every((id) => /^c-\d{17}\d{4}-[0-9a-f]{4}$/.test(id))).toBe(true);
    expect([...ids].sort()).toEqual(ids);
  });

  it('reads items and says clearly when one is missing', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    expect((await readItem(dir, 'q1')).title).toBe('Question q1');
    await expect(readItem(dir, 'nope')).rejects.toThrow(StoreError);
    await expect(readItem(dir, 'nope')).rejects.toThrow(/doesn't exist/);
  });

  it('refuses document paths outside the project', async () => {
    const dir = await seedProject();
    expect(await readDocText(dir, 'docs/draft.md')).toMatch(/^# Restock reminders/);
    await expect(readDocText(dir, '../../outside.md')).rejects.toThrow(/outside the project/);
  });

  it('lists submissions oldest first and skips damaged files', async () => {
    const dir = await seedProject();
    await writeSubmission(dir, { id: 's-2', at: 'b', scope: 'all', drafts: {}, sent: [], resolved: [] });
    await writeSubmission(dir, { id: 's-1', at: 'a', scope: 'thread', drafts: {}, sent: [], resolved: [] });
    await fs.writeFile(`${dir}/submissions/s-3.json`, '{broken');
    expect((await readSubmissions(dir)).map((s) => s.id)).toEqual(['s-1', 's-2']);
  });
});
```

`packages/core/test/open.test.ts`:
```ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gitInfo, NotAGitRepoError } from '../src/git';
import { defaultSettings, repoProfileSchema } from '../src/schemas';
import { readProjectFile } from '../src/store/io';
import { linkIntoClone, matchProfile, openPlan, PlanError, repoProjectsFolder, resolvePlan, slugify, suggestRepoName } from '../src/store/open';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';
import { DRAFT, makeRepo } from './fixtures';

afterAll(removeTempDirs);

const acme = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'] });

describe('git and repo profiles', () => {
  it('reads the clone root, remote and branch from anywhere inside the clone', async () => {
    const repo = makeRepo();
    const info = await gitInfo(path.join(repo, 'docs', 'specs'));
    expect(info).toEqual({ root: repo, remote: 'git@github.com:acme/acme.git', branch: 'main', excludeFile: path.join(repo, '.git', 'info', 'exclude') });
  });

  it('explains a folder that is not a git repo', async () => {
    await expect(gitInfo(tempDir('dp-nogit-'))).rejects.toThrow(NotAGitRepoError);
  });

  it('matches a profile whatever form the remote takes', () => {
    expect(matchProfile('git@github.com:acme/acme.git', [acme])?.name).toBe('acme');
    expect(matchProfile('https://github.com/Acme/acme', [acme])?.name).toBe('acme');
    expect(matchProfile('git@github.com:acme/other.git', [acme])).toBeUndefined();
    expect(matchProfile(null, [acme])).toBeUndefined();
  });

  it('suggests a profile name from the remote, or the folder', () => {
    expect(suggestRepoName('git@github.com:acme/acme-app.git', '/x/y')).toBe('acme-app');
    expect(suggestRepoName(null, '/Users/a/Source/My App')).toBe('my-app');
  });

  it("puts a repo's projects in its profile folder, or under the main folder", () => {
    const settings = { ...defaultSettings, projectsFolder: '/p' };
    expect(repoProjectsFolder(settings, acme)).toBe('/p/acme');
    expect(repoProjectsFolder(settings, { ...acme, projectsFolder: '~/shared' }, '/Users/a')).toBe('/Users/a/shared');
  });

  it('slugifies plan names', () => {
    expect(slugify('Restock Reminders (v2)')).toBe('restock-reminders-v2');
    expect(slugify('Café ünd Co')).toBe('cafe-und-co');
    expect(slugify('???')).toBe('plan');
  });
});

describe('opening a plan', () => {
  it('resolves the plan relative to where you are, inside the clone only', async () => {
    const repo = makeRepo();
    const r = await resolvePlan({ root: repo, cwd: path.join(repo, 'docs'), plan: 'specs/restock-reminders.md' });
    expect(r).toEqual({ rel: 'docs/specs/restock-reminders.md', text: DRAFT });
    await expect(resolvePlan({ root: repo, cwd: repo, plan: '../elsewhere.md' })).rejects.toThrow(/inside the repo/);
    await expect(resolvePlan({ root: repo, cwd: repo, plan: 'docs/specs/missing.md' })).rejects.toThrow(/no plan at docs\/specs\/missing.md/);
    await fs.writeFile(path.join(repo, 'notes.txt'), 'x');
    await expect(resolvePlan({ root: repo, cwd: repo, plan: 'notes.txt' })).rejects.toThrow(PlanError);
  });

  it('finds the plan when the window reached the clone through a symlink', async () => {
    const repo = makeRepo();
    const link = path.join(tempDir('dp-link-'), 'acme');
    await fs.symlink(repo, link);
    expect((await resolvePlan({ root: repo, cwd: link, plan: 'docs/specs/restock-reminders.md' })).rel).toBe('docs/specs/restock-reminders.md');
  });

  it('creates a plumbing project with an untouched original and a draft', async () => {
    const folder = path.join(tempDir('dp-open-'), 'acme');
    const now = new Date('2026-10-01T09:00:00Z');
    const r = await openPlan({ folder, repo: 'acme', clone: '/Users/a/Source/acme', branch: 'main', plan: { rel: 'docs/specs/restock-reminders.md', text: DRAFT }, enabledTypes: ['architecture', 'questions'], home: '/Users/a', now });
    expect(r).toEqual({ id: 'restock-reminders', dir: path.join(folder, 'restock-reminders'), created: true });
    expect(await fs.readFile(path.join(r.dir, 'docs', 'original.md'), 'utf8')).toBe(DRAFT);
    expect(await fs.readFile(path.join(r.dir, 'docs', 'draft.md'), 'utf8')).toBe(DRAFT);
    const project = await readProjectFile(r.dir);
    expect(project).toMatchObject({
      title: 'Restock reminders',
      status: 'importing',
      importPending: ['architecture', 'questions'],
      source: { path: 'docs/specs/restock-reminders.md', clone: '~/Source/acme', branch: 'main' },
    });
    expect(project.source.hashAtImport).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reopens the same plan, and keeps a different plan with the same name apart', async () => {
    const folder = path.join(tempDir('dp-open-'), 'acme');
    const open = (rel: string) => openPlan({ folder, repo: 'acme', clone: '/c', branch: 'main', plan: { rel, text: DRAFT }, enabledTypes: [] });
    expect((await open('docs/specs/restock-reminders.md')).created).toBe(true);
    expect(await open('docs/specs/restock-reminders.md')).toMatchObject({ id: 'restock-reminders', created: false });
    expect(await open('docs/old/restock-reminders.md')).toMatchObject({ id: 'restock-reminders-2', created: true });
  });

  it('links the projects folder into the clone and hides it from git', async () => {
    const repo = makeRepo();
    const folder = tempDir('dp-shared-');
    const info = await gitInfo(repo);
    const o = { clone: repo, excludeFile: info.excludeFile, folder, linkName: 'dev-plumbing' };
    expect(await linkIntoClone(o)).toBe('created');
    expect(await linkIntoClone(o)).toBe('exists');
    expect(await fs.realpath(path.join(repo, 'dev-plumbing'))).toBe(await fs.realpath(folder));
    const exclude = await fs.readFile(info.excludeFile, 'utf8');
    expect(exclude.split('\n').filter((l) => l === '/dev-plumbing')).toHaveLength(1);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' })).not.toMatch(/dev-plumbing/);
  });

  it("never replaces a real file or folder that has the link's name", async () => {
    const repo = makeRepo();
    await fs.mkdir(path.join(repo, 'dev-plumbing'));
    const info = await gitInfo(repo);
    expect(await linkIntoClone({ clone: repo, excludeFile: info.excludeFile, folder: tempDir('dp-shared-'), linkName: 'dev-plumbing' })).toBe('blocked');
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/io.test.ts packages/core/test/open.test.ts`
Expected: FAIL. The modules `../src/store/io`, `../src/git` and `../src/store/open` are missing.

- [ ] **Step 4: Write `store/io.ts`**

`packages/core/src/store/io.ts`:
```ts
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { writeFileAtomic, writeJsonAtomic } from '../atomic';
import {
  decisionSchema,
  historyEntrySchema,
  itemSchema,
  plumbingProjectSchema,
  submissionSchema,
  threadSchema,
  type Decision,
  type HistoryEntry,
  type Item,
  type PlumbingProject,
  type Submission,
  type Thread,
} from '../schemas';

/** Something asked for doesn't exist, or a file is damaged. */
export class StoreError extends Error {}
/** The caller sent something unusable. The message says what to fix. */
export class InputError extends Error {}
/** The request made sense, but the project has moved on since (for example, the draft changed). */
export class ConflictError extends Error {}

export type JsonRead = { ok: true; value: unknown } | { ok: false; error: string };
type Schema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false } };

export async function readJsonFile(file: string): Promise<JsonRead> {
  try {
    return { ok: true, value: JSON.parse(await fs.readFile(file, 'utf8')) };
  } catch (e) {
    return { ok: false, error: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : (e as Error).message };
  }
}

/** Every .json file in a folder that matches the schema. Damaged files are counted, not thrown. */
export async function readFolder<T>(dir: string, schema: Schema<T>): Promise<{ values: T[]; bad: number }> {
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { values: [], bad: 0 };
    return { values: [], bad: 1 };
  }
  const values: T[] = [];
  let bad = 0;
  for (const f of files) {
    const r = await readJsonFile(path.join(dir, f));
    const parsed = r.ok ? schema.safeParse(r.value) : null;
    if (parsed?.success) values.push(parsed.data);
    else bad++;
  }
  return { values, bad };
}

export const projectFiles = (dir: string) => ({
  project: path.join(dir, 'project.json'),
  items: path.join(dir, 'items'),
  item: (id: string) => path.join(dir, 'items', `${id}.json`),
  threads: path.join(dir, 'threads'),
  thread: (id: string) => path.join(dir, 'threads', `${id}.json`),
  decisions: path.join(dir, 'decisions.json'),
  submissions: path.join(dir, 'submissions'),
  submission: (id: string) => path.join(dir, 'submissions', `${id}.json`),
  history: path.join(dir, 'history'),
  historyEntry: (id: string) => path.join(dir, 'history', `${id}.json`),
});

let seq = 0;
/** <prefix>-<17-digit UTC time><4-digit counter>-<4 hex>. File-safe, and sorts in creation order within a process. */
export function newId(prefix: string, now: Date = new Date()): string {
  seq = (seq + 1) % 10_000;
  return `${prefix}-${now.toISOString().replace(/\D/g, '').slice(0, 17)}${String(seq).padStart(4, '0')}-${randomBytes(2).toString('hex')}`;
}

async function readParsed<T>(file: string, schema: Schema<T>, what: string): Promise<T> {
  const r = await readJsonFile(file);
  if (!r.ok) throw new StoreError(r.error === 'missing' ? `${what} doesn't exist.` : `${what} can't be read (${r.error}).`);
  const parsed = schema.safeParse(r.value);
  if (!parsed.success) throw new StoreError(`${what} doesn't have the expected shape.`);
  return parsed.data;
}

const safe = (id: string) => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new StoreError(`"${id}" isn't a valid id.`);
  return id;
};

export const readProjectFile = (dir: string): Promise<PlumbingProject> => readParsed(projectFiles(dir).project, plumbingProjectSchema, 'project.json');
export const writeProjectFile = (dir: string, project: PlumbingProject) => writeJsonAtomic(projectFiles(dir).project, project);
export const readItem = (dir: string, id: string): Promise<Item> => readParsed(projectFiles(dir).item(safe(id)), itemSchema, `Item ${id}`);
export const writeItem = (dir: string, item: Item) => writeJsonAtomic(projectFiles(dir).item(safe(item.id)), item);
export const readThread = (dir: string, id: string): Promise<Thread> => readParsed(projectFiles(dir).thread(safe(id)), threadSchema, `Thread ${id}`);
export const writeThread = (dir: string, thread: Thread) => writeJsonAtomic(projectFiles(dir).thread(safe(thread.id)), thread);
export const readItems = (dir: string) => readFolder<Item>(projectFiles(dir).items, itemSchema);
export const readThreads = (dir: string) => readFolder<Thread>(projectFiles(dir).threads, threadSchema);

export async function readDecisions(dir: string): Promise<Decision[]> {
  const r = await readJsonFile(projectFiles(dir).decisions);
  if (!r.ok) return [];
  const parsed = z.array(decisionSchema).safeParse(r.value);
  return parsed.success ? parsed.data : [];
}
export const writeDecisions = (dir: string, decisions: Decision[]) => writeJsonAtomic(projectFiles(dir).decisions, decisions);

export async function readSubmissions(dir: string): Promise<Submission[]> {
  const { values } = await readFolder<Submission>(projectFiles(dir).submissions, submissionSchema);
  return values.sort((a, b) => a.id.localeCompare(b.id));
}
export const readSubmission = (dir: string, id: string): Promise<Submission> =>
  readParsed(projectFiles(dir).submission(safe(id)), submissionSchema, `Submission ${id}`);
export const writeSubmission = (dir: string, s: Submission) => writeJsonAtomic(projectFiles(dir).submission(safe(s.id)), s);

export async function readHistory(dir: string): Promise<HistoryEntry[]> {
  const { values } = await readFolder<HistoryEntry>(projectFiles(dir).history, historyEntrySchema);
  return values.sort((a, b) => a.id.localeCompare(b.id));
}
export const readHistoryEntry = (dir: string, id: string): Promise<HistoryEntry> =>
  readParsed(projectFiles(dir).historyEntry(safe(id)), historyEntrySchema, `Change ${id}`);
export const writeHistoryEntry = (dir: string, h: HistoryEntry) => writeJsonAtomic(projectFiles(dir).historyEntry(safe(h.id)), h);

/** A document path inside the project folder. */
export function docPath(dir: string, rel: string): string {
  const base = path.resolve(dir);
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) throw new StoreError('That document is outside the project folder.');
  return file;
}

export async function readDocText(dir: string, rel: string): Promise<string> {
  const file = docPath(dir, rel);
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    throw new StoreError(`${rel} can't be read.`);
  }
}
export const writeDocText = (dir: string, rel: string, text: string) => writeFileAtomic(docPath(dir, rel), text);

export async function touchProject(dir: string, now: Date): Promise<void> {
  const project = await readProjectFile(dir);
  await writeProjectFile(dir, { ...project, updatedAt: now.toISOString() });
}
```

- [ ] **Step 5: Make `store/projects.ts` use `io.ts`**

In `packages/core/src/store/projects.ts`:
- Delete its private `readJson`, `readFolder`, `readThreads` and `readItems`.
- Import from `./io`: `readJsonFile`, `readItems`, `readThreads` and `docPath`.
- In `readProject`, call `readJsonFile(...)` where it called `readJson(...)`.
- In `readProjectDocument`, replace the containment check and its `path.resolve` lines with `const file = docPath(ref.dir, rel);`.
- Every exported function keeps its signature and behaviour.

Run: `pnpm vitest run packages/core/test/projects.test.ts`
Expected: PASS (unchanged behaviour).

- [ ] **Step 6: Write `git.ts`**

`packages/core/src/git.ts`:
```ts
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { InputError } from './store/io';

const run = promisify(execFile);

export class NotAGitRepoError extends InputError {}
export type GitInfo = { root: string; remote: string | null; branch: string; excludeFile: string };

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run('git', args, { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** The clone root, its origin remote (or first remote), the current branch, and its info/exclude file. */
export async function gitInfo(cwd: string): Promise<GitInfo> {
  const root = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!root) throw new NotAGitRepoError(`${cwd} isn't inside a git repository. Run /dev-plumbing from a clone of your repo.`);
  let remote = await git(root, ['remote', 'get-url', 'origin']);
  if (!remote) {
    const first = (await git(root, ['remote']))?.split('\n')[0];
    remote = first ? await git(root, ['remote', 'get-url', first]) : null;
  }
  const branch = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? (await git(root, ['symbolic-ref', '--short', 'HEAD'])) ?? 'HEAD';
  const exclude = (await git(root, ['rev-parse', '--git-path', 'info/exclude'])) ?? '.git/info/exclude';
  return { root, remote, branch, excludeFile: path.resolve(root, exclude) };
}
```

- [ ] **Step 7: Write `store/open.ts`**

`packages/core/src/store/open.ts`:
```ts
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from '../atomic';
import { expandHome } from '../paths';
import { normalizeRemote, plumbingProjectSchema, titleFromMarkdown, type PlumbingProject, type RepoProfile, type Settings } from '../schemas';
import { InputError, readJsonFile, writeProjectFile } from './io';

export class PlanError extends InputError {}

const exists = (p: string) => fs.access(p).then(() => true, () => false);

export function matchProfile(remote: string | null, profiles: RepoProfile[]): RepoProfile | undefined {
  if (!remote) return undefined;
  const r = normalizeRemote(remote);
  return profiles.find((p) => p.match.some((m) => normalizeRemote(m) === r));
}

export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'plan';
}

/** A short name for a new repo profile: the remote's repo name, or the clone folder's name. */
export function suggestRepoName(remote: string | null, root: string): string {
  const fromRemote = remote ? normalizeRemote(remote).split('/').pop() : undefined;
  return slugify(fromRemote || path.basename(root));
}

/** Where a repo's plumbing projects live: its profile's folder, or <settings.projectsFolder>/<repo>. */
export function repoProjectsFolder(settings: Settings, profile: RepoProfile, home?: string): string {
  return profile.projectsFolder ? expandHome(profile.projectsFolder, home) : path.join(expandHome(settings.projectsFolder, home), profile.name);
}

export function tildify(p: string, home: string = os.homedir()): string {
  return p === home ? '~' : p.startsWith(home + path.sep) ? `~/${p.slice(home.length + 1)}` : p;
}

/**
 * The plan file, relative to the clone root. It must be a Markdown file inside the clone.
 * Paths are compared as real paths: git reports the clone's real path, while the window's folder may come through a symlink.
 */
export async function resolvePlan(o: { root: string; cwd: string; plan: string }): Promise<{ rel: string; text: string }> {
  const real = (p: string) => fs.realpath(p).catch(() => p);
  const cwd = await real(o.cwd);
  const abs = await real(path.resolve(cwd, o.plan));
  const rel = path.relative(await real(o.root), abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new PlanError(`The plan must be inside the repo (${o.root}).`);
  const relPosix = rel.split(path.sep).join('/');
  if (!/\.(md|markdown)$/i.test(abs)) throw new PlanError('The plan must be a Markdown file (.md or .markdown).');
  let text: string;
  try {
    text = await fs.readFile(abs, 'utf8');
  } catch {
    throw new PlanError(`There's no plan at ${relPosix}.`);
  }
  if (!text.trim()) throw new PlanError(`${relPosix} is empty.`);
  return { rel: relPosix, text };
}

async function findBySource(folder: string, rel: string): Promise<string | null> {
  let names: string[] = [];
  try {
    names = (await fs.readdir(folder)).filter((n) => !n.startsWith('.')).sort();
  } catch {
    return null;
  }
  for (const name of names) {
    const r = await readJsonFile(path.join(folder, name, 'project.json'));
    const parsed = r.ok ? plumbingProjectSchema.safeParse(r.value) : null;
    if (parsed?.success && parsed.data.source.path === rel) return name;
  }
  return null;
}

/**
 * Reopens the plumbing project for this plan (matched by its path in the repo, so any clone finds it), or
 * creates one. Creating copies the plan into docs/original.md and docs/draft.md, and queues every enabled
 * plumbing type for import. project.json is written last, so a crash never leaves a half-made project that looks whole.
 */
export async function openPlan(o: {
  folder: string;
  repo: string;
  clone: string;
  branch: string;
  plan: { rel: string; text: string };
  enabledTypes: string[];
  home?: string;
  now?: Date;
}): Promise<{ id: string; dir: string; created: boolean }> {
  const existing = await findBySource(o.folder, o.plan.rel);
  if (existing) return { id: existing, dir: path.join(o.folder, existing), created: false };
  const base = slugify(path.basename(o.plan.rel).replace(/\.(md|markdown)$/i, ''));
  let id = base;
  for (let n = 2; await exists(path.join(o.folder, id)); n++) id = `${base}-${n}`;
  const dir = path.join(o.folder, id);
  const at = (o.now ?? new Date()).toISOString();
  await writeFileAtomic(path.join(dir, 'docs', 'original.md'), o.plan.text);
  await writeFileAtomic(path.join(dir, 'docs', 'draft.md'), o.plan.text);
  const project: PlumbingProject = {
    id,
    repo: o.repo,
    title: titleFromMarkdown(o.plan.text) ?? base,
    source: { path: o.plan.rel, clone: tildify(o.clone, o.home), branch: o.branch, hashAtImport: createHash('sha256').update(o.plan.text).digest('hex') },
    docs: { original: 'docs/original.md', draft: 'docs/draft.md' },
    status: o.enabledTypes.length ? 'importing' : 'active',
    emptyTypes: [],
    importPending: o.enabledTypes,
    createdAt: at,
    updatedAt: at,
  };
  await writeProjectFile(dir, project);
  return { id, dir, created: true };
}

/**
 * Spec §6.3: a link named linkName in the clone pointing at the projects folder, hidden from git through
 * .git/info/exclude. Never replaces a real file or folder with that name.
 */
export async function linkIntoClone(o: { clone: string; excludeFile: string; folder: string; linkName: string }): Promise<'created' | 'exists' | 'blocked'> {
  const link = path.join(o.clone, o.linkName);
  const stat = await fs.lstat(link).catch(() => null);
  let result: 'created' | 'exists';
  if (!stat) {
    await fs.mkdir(o.folder, { recursive: true });
    await fs.symlink(o.folder, link);
    result = 'created';
  } else if (stat.isSymbolicLink() && path.resolve(o.clone, await fs.readlink(link)) === path.resolve(o.folder)) {
    result = 'exists';
  } else {
    return 'blocked';
  }
  const line = `/${o.linkName}`;
  const current = await fs.readFile(o.excludeFile, 'utf8').catch(() => '');
  if (!current.split('\n').some((l) => l.trim() === line)) {
    await writeFileAtomic(o.excludeFile, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${line}\n`);
  }
  return result;
}
```

In `packages/core/src/index.ts`, add:
```ts
export * from './git';
export * from './store/io';
export * from './store/open';
```

- [ ] **Step 8: Run the tests and the typecheck**

Run: `pnpm vitest run packages/core && pnpm typecheck`
Expected: PASS.

Two things to check if a test fails:
- **Git version:** `git init -b` needs git 2.28 or newer.
- **macOS temp paths:** `gitInfo` returns the real path of the clone, and `makeRepo` returns the same real path.

- [ ] **Step 9: Commit**

```bash
git add packages/core
git commit -m "feat(core): project files, git facts, repo profile matching and opening a plan" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Importer batches

An importer subagent sends one batch per plumbing type: either items, or a "no changes" reason. The batch is checked as a whole. Nothing is written unless all of it is valid, and the error lists every problem, so the subagent can fix them all in one retry.

**Files:**
- Create:
  - `packages/core/src/store/validate.ts`
  - `packages/core/src/store/importItems.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/importItems.test.ts`

**Interfaces:**
- Consumes:
  - From Task 3: `ImportBatch`, `Option`, `Change`, `applyMdPatches`, `CodeRef`, `Item`, `Message`, `PlumbingType`.
  - From Task 4: `InputError`, `newId`, `readProjectFile`, `writeProjectFile`, `readItems`, `writeItem`, `writeThread`, `readDocText`.
- Produces:
  - `store/validate.ts`:
    - `changeProblems(change, draft, itemIds): string[]`
    - `messageProblems(msg: { options?: Option[]; recommended?: string }, draft, itemIds): string[]`
    - `fieldProblems(fields: Record<string, string> | undefined, type: PlumbingType): string[]`
    - `nothingSaved(problems: string[], retry: string): InputError`
  - `store/importItems.ts`:
    - `verifyCodeRefs(clone, refs): Promise<CodeRef[]>`
    - `uniqueId(base: string, taken: Set<string>): string`, which adds the id it returns to `taken`
    - `writeImportBatch(o: { dir: string; type: PlumbingType; batch: ImportBatch; clone: string; now?: Date }): Promise<{ itemIds: string[]; importFinished: boolean }>`
    - `finishImport(dir, now?): Promise<boolean>`
    - `IMPORT_DID_NOT_FINISH`
  - **Ids:** item ids are `<type>-<key>`, with `-2`, `-3` and so on on a clash, and thread ids are `t-<itemId>`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/importItems.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { finishImport, verifyCodeRefs, writeImportBatch } from '../src/store/importItems';
import { InputError, readItem, readItems, readProjectFile, readThread } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { makeRepo, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const questions = TYPES.find((t) => t.id === 'questions')!;
const architecture = TYPES.find((t) => t.id === 'architecture')!;
const importing = () => seedProject({ project: { status: 'importing', importPending: ['architecture', 'questions'] } });

async function cloneWithCode(): Promise<string> {
  const repo = makeRepo();
  await fs.mkdir(path.join(repo, 'src', 'jobs'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'jobs', 'reminders.ts'), 'export function sendReminders() {}\n');
  return repo;
}

describe('importing a plumbing type', () => {
  it('writes items with opening threads and links them by key', async () => {
    const dir = await importing();
    const r = await writeImportBatch({
      dir,
      type: questions,
      clone: '/nowhere',
      batch: {
        items: [
          {
            key: 'who',
            title: 'Who gets reminders?',
            summary: 'Everyone, or only some customers?',
            fields: { blocking: 'true' },
            links: ['when'],
            message: { text: 'Who should get them first?', options: [{ id: 'all', label: 'Everyone' }, { id: 'some', label: 'Active subscribers' }], recommended: 'some' },
          },
          { key: 'when', title: 'How early?', summary: 'Days before the item runs out.' },
        ],
      },
    });
    expect(r).toEqual({ itemIds: ['questions-who', 'questions-when'], importFinished: false });
    expect(await readItem(dir, 'questions-who')).toMatchObject({
      key: 'who',
      type: 'questions',
      links: ['questions-when'],
      threadId: 't-questions-who',
      createdBy: 'import',
      fields: { blocking: 'true' },
    });
    const thread = await readThread(dir, 't-questions-who');
    expect(thread.status).toBe('your_turn');
    expect(thread.messages[0]).toMatchObject({ author: 'claude', opening: true, recommended: 'some' });
    expect((await readThread(dir, 't-questions-when')).status).toBe('idle');
    expect((await readProjectFile(dir)).importPending).toEqual(['architecture']);
  });

  it('records "no changes" and finishes the import with the last type', async () => {
    const dir = await importing();
    await writeImportBatch({ dir, type: questions, clone: '/x', batch: { noChanges: 'The plan leaves nothing open.' } });
    const r = await writeImportBatch({ dir, type: architecture, clone: '/x', batch: { noChanges: 'Nothing structural changes.' } });
    expect(r.importFinished).toBe(true);
    const p = await readProjectFile(dir);
    expect(p.status).toBe('active');
    expect(p.emptyTypes).toEqual([
      { type: 'questions', reason: 'The plan leaves nothing open.' },
      { type: 'architecture', reason: 'Nothing structural changes.' },
    ]);
  });

  it('checks code references against the clone', async () => {
    const clone = await cloneWithCode();
    const refs = await verifyCodeRefs(clone, [
      { path: 'src/jobs/reminders.ts', symbol: 'sendReminders' },
      { path: 'src/jobs/reminders.ts', symbol: 'cancelReminders' },
      { path: 'src/jobs' },
      { path: 'src/missing.ts' },
      { path: '../outside.ts' },
    ]);
    expect(refs.map((r) => r.verified)).toEqual([true, false, true, false, false]);
  });

  it('a bad batch writes nothing and says what to fix', async () => {
    const dir = await importing();
    const attempt = writeImportBatch({
      dir,
      type: questions,
      clone: '/x',
      batch: {
        items: [
          { key: 'a', title: 'A', summary: 'a', fields: { severity: 'high' } },
          { key: 'a', title: 'A again', summary: 'a', links: ['ghost'] },
          { key: 'b', title: 'B', summary: 'b', message: { text: 'Pick one', options: [{ id: 'x', label: 'X', change: { md: [{ find: 'not in the draft', replace: 'y' }] } }], recommended: 'z' } },
        ],
      },
    });
    await expect(attempt).rejects.toThrow(InputError);
    const message = await attempt.catch((e: Error) => e.message);
    expect(message).toMatch(/Nothing was saved/);
    expect(message).toMatch(/key is used twice/);
    expect(message).toMatch(/"severity" isn't a field of Questions/);
    expect(message).toMatch(/links to "ghost"/);
    expect(message).toMatch(/isn't in the draft/);
    expect(message).toMatch(/recommended is "z"/);
    expect((await readItems(dir)).values).toEqual([]);
    expect((await readProjectFile(dir)).importPending).toEqual(['architecture', 'questions']);
  });

  it('refuses a type that was already imported, and a batch with both or neither', async () => {
    const dir = await importing();
    await writeImportBatch({ dir, type: questions, clone: '/x', batch: { noChanges: 'None.' } });
    await expect(writeImportBatch({ dir, type: questions, clone: '/x', batch: { noChanges: 'Again.' } })).rejects.toThrow(/already been imported/);
    await expect(writeImportBatch({ dir, type: architecture, clone: '/x', batch: {} })).rejects.toThrow(/either items/);
    await expect(
      writeImportBatch({ dir, type: architecture, clone: '/x', batch: { noChanges: 'x', items: [{ key: 'k', title: 't', summary: 's' }] } }),
    ).rejects.toThrow(/either items/);
  });

  it("marks types whose importer didn't finish", async () => {
    const dir = await importing();
    await writeImportBatch({ dir, type: questions, clone: '/x', batch: { noChanges: 'None.' } });
    expect(await finishImport(dir)).toBe(true);
    const p = await readProjectFile(dir);
    expect(p).toMatchObject({ status: 'active', importPending: [] });
    expect(p.emptyTypes.find((e) => e.type === 'architecture')?.reason).toMatch(/didn't finish/);
    expect(await finishImport(dir)).toBe(false);
  });

  it('keeps new item ids clear of existing ones', async () => {
    const dir = await seedProject({ pairs: [pair('questions-who')], project: { status: 'importing', importPending: ['questions'] } });
    const r = await writeImportBatch({ dir, type: questions, clone: '/x', batch: { items: [{ key: 'who', title: 'Who?', summary: 's' }] } });
    expect(r.itemIds).toEqual(['questions-who-2']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/importItems.test.ts`
Expected: FAIL, because `../src/store/importItems` is missing.

- [ ] **Step 3: Write the shared checks**

`packages/core/src/store/validate.ts`:
```ts
import { applyMdPatches, type Change, type Option, type PlumbingType } from '../schemas';
import { InputError } from './io';

/** Why a change wouldn't apply to this draft and these items. Empty when it applies cleanly. */
export function changeProblems(change: Change, draft: string, itemIds: Set<string>): string[] {
  const problems: string[] = [];
  if (change.md?.length) {
    const r = applyMdPatches(draft, change.md);
    if (!r.ok) problems.push(r.error);
  }
  for (const c of change.items ?? []) if (!itemIds.has(c.itemId)) problems.push(`There's no item "${c.itemId}".`);
  return problems;
}

/** Problems with a message Claude wants to post: repeated option ids, a recommendation that isn't an option, changes that don't apply. */
export function messageProblems(msg: { options?: Option[]; recommended?: string }, draft: string, itemIds: Set<string>): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const o of msg.options ?? []) {
    if (ids.has(o.id)) problems.push(`Option id "${o.id}" is used twice.`);
    ids.add(o.id);
    if (o.change) for (const p of changeProblems(o.change, draft, itemIds)) problems.push(`Option "${o.id}": ${p}`);
  }
  if (msg.recommended && !ids.has(msg.recommended)) problems.push(`recommended is "${msg.recommended}", which isn't one of the option ids.`);
  return problems;
}

/** Item fields must be ones the plumbing type's rules file lists. */
export function fieldProblems(fields: Record<string, string> | undefined, type: PlumbingType): string[] {
  return Object.keys(fields ?? {})
    .filter((f) => !type.fields.includes(f))
    .map((f) => `"${f}" isn't a field of ${type.title}. Allowed: ${type.fields.join(', ') || 'none'}.`);
}

export const nothingSaved = (problems: string[], retry: string) => new InputError(`Nothing was saved. Fix these and ${retry}:\n- ${problems.join('\n- ')}`);
```

- [ ] **Step 4: Write the importer batch writer**

`packages/core/src/store/importItems.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CodeRef, ImportBatch, Item, Message, PlumbingType } from '../schemas';
import { InputError, newId, readDocText, readItems, readProjectFile, writeItem, writeProjectFile, writeThread } from './io';
import { fieldProblems, messageProblems, nothingSaved } from './validate';

export const IMPORT_DID_NOT_FINISH = "The importer didn't finish for this plumbing type.";

/** ✓ a reference when its file or folder exists inside the clone and, if a symbol is given, the file contains it. */
export async function verifyCodeRefs(clone: string, refs: { path: string; symbol?: string }[]): Promise<CodeRef[]> {
  const root = path.resolve(clone);
  return Promise.all(
    refs.map(async (ref): Promise<CodeRef> => {
      const abs = path.resolve(root, ref.path);
      const rel = path.relative(root, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return { ...ref, verified: false };
      const stat = await fs.stat(abs).catch(() => null);
      if (!stat) return { ...ref, verified: false };
      if (stat.isDirectory()) return { ...ref, verified: !ref.symbol };
      if (!ref.symbol) return { ...ref, verified: true };
      const text = await fs.readFile(abs, 'utf8').catch(() => '');
      return { ...ref, verified: text.includes(ref.symbol) };
    }),
  );
}

/** `base`, or `base-2`, `base-3`… whichever isn't taken. Adds the result to `taken`. */
export function uniqueId(base: string, taken: Set<string>): string {
  const stem = base.slice(0, 74).replace(/-+$/, '') || 'item';
  let id = stem;
  for (let n = 2; taken.has(id); n++) id = `${stem}-${n}`;
  taken.add(id);
  return id;
}

export async function writeImportBatch(o: {
  dir: string;
  type: PlumbingType;
  batch: ImportBatch;
  clone: string;
  now?: Date;
}): Promise<{ itemIds: string[]; importFinished: boolean }> {
  const now = o.now ?? new Date();
  const at = now.toISOString();
  const project = await readProjectFile(o.dir);
  if (!project.importPending.includes(o.type.id)) {
    throw new InputError(
      project.importPending.length
        ? `${o.type.title} has already been imported. Only the types dp_open listed in importTypes need an importer.`
        : "This plumbing project isn't importing anything right now.",
    );
  }
  const items = o.batch.items ?? [];
  if (Boolean(items.length) === Boolean(o.batch.noChanges)) {
    throw new InputError('Send either items (at least one) or noChanges with a reason. Not both, and not neither.');
  }

  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: existing } = await readItems(o.dir);
  const existingIds = new Set(existing.map((i) => i.id));
  const keys = new Set<string>();
  const problems: string[] = [];
  items.forEach((it, i) => {
    const where = `Item ${i + 1} (${it.key})`;
    if (keys.has(it.key)) problems.push(`${where}: the key is used twice.`);
    keys.add(it.key);
    problems.push(...fieldProblems(it.fields, o.type).map((p) => `${where}: ${p}`));
    if (it.message) problems.push(...messageProblems(it.message, draft, existingIds).map((p) => `${where}: ${p}`));
  });
  for (const it of items) {
    for (const link of it.links ?? []) {
      if (!keys.has(link) && !existingIds.has(link)) problems.push(`Item ${it.key}: links to "${link}", which isn't a key in this batch or an existing item id.`);
    }
  }
  if (problems.length) throw nothingSaved(problems, 'call dp_write_items again with the whole batch');

  const taken = new Set(existingIds);
  const idFor = new Map(items.map((it) => [it.key, uniqueId(`${o.type.id}-${it.key}`, taken)]));
  const itemIds: string[] = [];
  for (const it of items) {
    const id = idFor.get(it.key)!;
    const threadId = `t-${id}`;
    const item: Item = {
      id,
      key: it.key,
      type: o.type.id,
      title: it.title,
      summary: it.summary,
      ...(it.body ? { body: it.body } : {}),
      ...(it.fields ? { fields: it.fields } : {}),
      ...(it.mdAnchor ? { mdAnchor: it.mdAnchor } : {}),
      ...(it.codeRefs?.length ? { codeRefs: await verifyCodeRefs(o.clone, it.codeRefs) } : {}),
      ...(it.links?.length ? { links: it.links.map((l) => idFor.get(l) ?? l) } : {}),
      ...(it.data !== undefined ? { data: it.data } : {}),
      threadId,
      createdBy: 'import',
    };
    const messages: Message[] = it.message
      ? [
          {
            id: newId('m', now),
            at,
            author: 'claude',
            text: it.message.text,
            opening: true,
            ...(it.message.options ? { options: it.message.options } : {}),
            ...(it.message.recommended ? { recommended: it.message.recommended } : {}),
          },
        ]
      : [];
    await writeItem(o.dir, item);
    await writeThread(o.dir, { id: threadId, itemId: id, status: it.message ? 'your_turn' : 'idle', messages });
    itemIds.push(id);
  }

  const importPending = project.importPending.filter((t) => t !== o.type.id);
  const emptyTypes = o.batch.noChanges
    ? [...project.emptyTypes.filter((e) => e.type !== o.type.id), { type: o.type.id, reason: o.batch.noChanges }]
    : project.emptyTypes;
  const importFinished = importPending.length === 0;
  await writeProjectFile(o.dir, {
    ...project,
    importPending,
    emptyTypes,
    status: importFinished && project.status === 'importing' ? 'active' : project.status,
    updatedAt: at,
  });
  return { itemIds, importFinished };
}

/** Ends an import whose importers have all returned. Types that never wrote are marked "didn't finish". */
export async function finishImport(dir: string, now: Date = new Date()): Promise<boolean> {
  const project = await readProjectFile(dir);
  if (project.status !== 'importing') return false;
  const missing = project.importPending
    .filter((type) => !project.emptyTypes.some((e) => e.type === type))
    .map((type) => ({ type, reason: IMPORT_DID_NOT_FINISH }));
  await writeProjectFile(dir, { ...project, importPending: [], emptyTypes: [...project.emptyTypes, ...missing], status: 'active', updatedAt: now.toISOString() });
  return true;
}
```

In `packages/core/src/index.ts`, add:
```ts
export * from './store/validate';
export * from './store/importItems';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/core && pnpm --filter @dev-plumbing/core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): importer batches checked as a whole, with code reference checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Changes, history and decisions

Every change to the draft or to items goes through one function, which applies it and writes a history entry. History drives the Draft's **Changes** view and Undo. Decisions are the one-line records of how threads were settled.

**Files:**
- Create:
  - `packages/core/src/store/changes.ts`
  - `packages/core/src/store/decisions.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/changes.test.ts`

**Interfaces:**
- Consumes:
  - From Task 3: `Change`, `ItemPatch`, `HistoryEntry`, `Decision`, `applyMdPatches`, `invertMdPatches`, `itemSchema`
  - From Task 4: `ConflictError`, `newId`, the io readers and writers
  - From Task 5: `changeProblems`
- Produces:
  - `recordChange(dir, o: { threadId: string; kind: 'small-edit' | 'accept'; summary: string; change: Change; apply: boolean; now?: Date }): Promise<HistoryEntry>`
    - It throws `ConflictError`, writing nothing, if the change doesn't apply.
    - With `apply: false`, it only records a pending entry.
  - `applyPendingChange(dir, changeId, now?): Promise<HistoryEntry>`, which applies a pending or undone entry.
  - `undoChange(dir, changeId, now?): Promise<HistoryEntry>`
    - Small edits only.
    - It throws `ConflictError` if the draft or an item changed there since.
  - `addDecision(dir, o: { text: string; threadId: string; itemIds: string[]; now?: Date }): Promise<Decision>`, which supersedes that thread's earlier decision.
  - `activeDecisions(list: Decision[]): Decision[]`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/changes.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyPendingChange, recordChange, undoChange } from '../src/store/changes';
import { activeDecisions, addDecision } from '../src/store/decisions';
import { ConflictError, readDecisions, readHistory, readItem, writeItem } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject } from './fixtures';

afterAll(removeTempDirs);

const draftOf = (dir: string) => fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8');
const tableChange = { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a RestockReminder table, one row per send.' }] };

describe('recording changes', () => {
  it('applies a change to the draft and items, and keeps a history entry', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const entry = await recordChange(dir, {
      threadId: 't-q1',
      kind: 'accept',
      summary: 'Question q1: one row per send',
      change: { ...tableChange, items: [{ itemId: 'q1', patch: { summary: 'One row per send.', fields: { default: 'per send' } } }] },
      apply: true,
    });
    expect(await draftOf(dir)).toContain('RestockReminder table, one row per send.');
    expect(await readItem(dir, 'q1')).toMatchObject({ summary: 'One row per send.', fields: { default: 'per send' } });
    expect(entry.appliedAt).toBeDefined();
    expect(entry.itemsBefore.q1).toMatchObject({ summary: 'A summary.' });
    expect((await readHistory(dir)).map((h) => h.id)).toEqual([entry.id]);
  });

  it("refuses a change that doesn't fit, and writes nothing", async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const attempt = recordChange(dir, { threadId: 't-q1', kind: 'accept', summary: 's', change: { md: [{ find: 'Not there.', replace: 'x' }] }, apply: true });
    await expect(attempt).rejects.toThrow(ConflictError);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
  });

  it('records a pending small edit without applying it, then applies it on request', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const pending = await recordChange(dir, { threadId: 't-q1', kind: 'small-edit', summary: 'Wording', change: tableChange, apply: false });
    expect(pending.appliedAt).toBeUndefined();
    expect(await draftOf(dir)).toBe(DRAFT);
    const applied = await applyPendingChange(dir, pending.id);
    expect(applied.appliedAt).toBeDefined();
    expect(await draftOf(dir)).toContain('one row per send');
  });
});

describe('undo', () => {
  it('undoes a small edit to the draft and to items', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const entry = await recordChange(dir, {
      threadId: 't-q1',
      kind: 'small-edit',
      summary: 'Fix wording',
      change: { ...tableChange, items: [{ itemId: 'q1', patch: { title: 'Rows per send?' } }] },
      apply: true,
    });
    const undone = await undoChange(dir, entry.id);
    expect(undone.undoneAt).toBeDefined();
    expect(await draftOf(dir)).toBe(DRAFT);
    expect((await readItem(dir, 'q1')).title).toBe('Question q1');
    await expect(undoChange(dir, entry.id)).rejects.toThrow(/isn't applied/);
  });

  it('only undoes small edits', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const entry = await recordChange(dir, { threadId: 't-q1', kind: 'accept', summary: 's', change: tableChange, apply: true });
    await expect(undoChange(dir, entry.id)).rejects.toThrow(/Only small edits/);
  });

  it('refuses when the draft or the item changed there since', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const edit = await recordChange(dir, { threadId: 't-q1', kind: 'small-edit', summary: 's', change: tableChange, apply: true });
    await recordChange(dir, { threadId: 't-q1', kind: 'accept', summary: 's', change: { md: [{ find: 'one row per send.', replace: 'one row per subscription.' }] }, apply: true });
    await expect(undoChange(dir, edit.id)).rejects.toThrow(/changed there since/);

    const itemEdit = await recordChange(dir, { threadId: 't-q1', kind: 'small-edit', summary: 's', change: { items: [{ itemId: 'q1', patch: { title: 'New' } }] }, apply: true });
    await writeItem(dir, { ...(await readItem(dir, 'q1')), title: 'Changed by hand' });
    await expect(undoChange(dir, itemEdit.id)).rejects.toThrow(/has changed since/);
  });
});

describe('decisions', () => {
  it("keeps every decision, and marks a thread's earlier one superseded", async () => {
    const dir = await seedProject();
    const first = await addDecision(dir, { text: 'Reminders go by SMS', threadId: 't-q2', itemIds: ['q2'] });
    await addDecision(dir, { text: 'Rows are kept for 180 days', threadId: 't-db1', itemIds: ['db1'] });
    const second = await addDecision(dir, { text: 'Reminders go by SMS and email', threadId: 't-q2', itemIds: ['q2'] });
    const all = await readDecisions(dir);
    expect(all).toHaveLength(3);
    expect(all.find((d) => d.id === first.id)?.supersededBy).toBe(second.id);
    expect(activeDecisions(all).map((d) => d.text)).toEqual(['Rows are kept for 180 days', 'Reminders go by SMS and email']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/changes.test.ts`
Expected: FAIL, because `../src/store/changes` is missing.

- [ ] **Step 3: Write the changes module**

`packages/core/src/store/changes.ts`:
```ts
import { applyMdPatches, invertMdPatches, itemSchema, type Change, type HistoryEntry, type Item, type ItemPatch } from '../schemas';
import {
  ConflictError,
  newId,
  readDocText,
  readHistoryEntry,
  readItem,
  readItems,
  readProjectFile,
  touchProject,
  writeDocText,
  writeHistoryEntry,
  writeItem,
} from './io';
import { changeProblems } from './validate';

/** JSON with object keys sorted, so two equal items compare equal whatever order their keys were written in. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );

export const patchItem = (item: Item, patch: ItemPatch): Item => ({
  ...item,
  ...patch,
  ...(patch.fields ? { fields: { ...(item.fields ?? {}), ...patch.fields } } : {}),
});

/** Applies a change to draft.md and the items. Throws ConflictError, writing nothing, if any part doesn't fit. */
async function write(dir: string, change: Change, now: Date): Promise<{ itemsBefore: Record<string, Item>; itemsAfter: Record<string, Item> }> {
  const project = await readProjectFile(dir);
  const draft = await readDocText(dir, project.docs.draft);
  const { values: items } = await readItems(dir);
  const problems = changeProblems(change, draft, new Set(items.map((i) => i.id)));
  if (problems.length) throw new ConflictError(problems.join(' '));
  const md = change.md?.length ? applyMdPatches(draft, change.md) : null;
  const itemsBefore: Record<string, Item> = {};
  const itemsAfter: Record<string, Item> = {};
  for (const c of change.items ?? []) {
    const before = itemsAfter[c.itemId] ?? (await readItem(dir, c.itemId));
    if (!(c.itemId in itemsBefore)) itemsBefore[c.itemId] = before;
    itemsAfter[c.itemId] = patchItem(before, c.patch);
  }
  if (md?.ok) await writeDocText(dir, project.docs.draft, md.text);
  for (const item of Object.values(itemsAfter)) await writeItem(dir, item);
  await touchProject(dir, now);
  return { itemsBefore, itemsAfter };
}

export async function recordChange(
  dir: string,
  o: { threadId: string; kind: 'small-edit' | 'accept'; summary: string; change: Change; apply: boolean; now?: Date },
): Promise<HistoryEntry> {
  const now = o.now ?? new Date();
  const entry: HistoryEntry = {
    id: newId('c', now),
    at: now.toISOString(),
    threadId: o.threadId,
    kind: o.kind,
    summary: o.summary,
    change: o.change,
    itemsBefore: {},
    itemsAfter: {},
  };
  if (o.apply) {
    const snapshot = await write(dir, o.change, now);
    Object.assign(entry, { appliedAt: entry.at, ...snapshot });
  }
  await writeHistoryEntry(dir, entry);
  return entry;
}

/** Applies a pending change, or re-applies one that was undone. */
export async function applyPendingChange(dir: string, changeId: string, now: Date = new Date()): Promise<HistoryEntry> {
  const entry = await readHistoryEntry(dir, changeId);
  if (entry.appliedAt && !entry.undoneAt) throw new ConflictError('That change is already applied.');
  const snapshot = await write(dir, entry.change, now);
  const updated: HistoryEntry = { ...entry, appliedAt: now.toISOString(), undoneAt: undefined, ...snapshot };
  await writeHistoryEntry(dir, updated);
  return updated;
}

/** Undoes a small edit, as long as nothing changed there since. */
export async function undoChange(dir: string, changeId: string, now: Date = new Date()): Promise<HistoryEntry> {
  const entry = await readHistoryEntry(dir, changeId);
  if (entry.kind !== 'small-edit') throw new ConflictError('Only small edits can be undone.');
  if (!entry.appliedAt || entry.undoneAt) throw new ConflictError("That change isn't applied.");
  const project = await readProjectFile(dir);
  let draftText: string | null = null;
  if (entry.change.md?.length) {
    const inverse = invertMdPatches(entry.change.md);
    if (!inverse.ok) throw new ConflictError(inverse.error);
    const r = applyMdPatches(await readDocText(dir, project.docs.draft), inverse.patches);
    if (!r.ok) throw new ConflictError(`The draft has changed there since, so this can't be undone. ${r.error}`);
    draftText = r.text;
  }
  for (const [id, after] of Object.entries(entry.itemsAfter)) {
    const current = await readItem(dir, id);
    if (stable(current) !== stable(after)) throw new ConflictError(`"${current.title}" has changed since, so this can't be undone.`);
  }
  if (draftText !== null) await writeDocText(dir, project.docs.draft, draftText);
  for (const before of Object.values(entry.itemsBefore)) await writeItem(dir, itemSchema.parse(before));
  await touchProject(dir, now);
  const updated: HistoryEntry = { ...entry, undoneAt: now.toISOString() };
  await writeHistoryEntry(dir, updated);
  return updated;
}
```

`packages/core/src/store/decisions.ts`:
```ts
import type { Decision } from '../schemas';
import { newId, readDecisions, writeDecisions } from './io';

export const activeDecisions = (decisions: Decision[]): Decision[] => decisions.filter((d) => !d.supersededBy);

/** Adds a decision. Nothing is deleted: the thread's earlier decision is marked superseded by this one. */
export async function addDecision(dir: string, o: { text: string; threadId: string; itemIds: string[]; now?: Date }): Promise<Decision> {
  const now = o.now ?? new Date();
  const decision: Decision = { id: newId('d', now), text: o.text, threadId: o.threadId, itemIds: o.itemIds, at: now.toISOString() };
  const earlier = (await readDecisions(dir)).map((d) => (d.threadId === o.threadId && !d.supersededBy ? { ...d, supersededBy: decision.id } : d));
  await writeDecisions(dir, [...earlier, decision]);
  return decision;
}
```

In `packages/core/src/index.ts`, add:
```ts
export * from './store/changes';
export * from './store/decisions';
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/core && pnpm --filter @dev-plumbing/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): apply and record changes with undo for small edits, and decisions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Drafts, park, your own items and Submit

What happens when you answer. Drafts autosave. **Park** sets a thread aside. **Send this thread** and **Submit all** follow spec §9's table exactly:

| You picked | What happens |
|---|---|
| An option with a change, no note | Applied and resolved. Claude isn't called. |
| An option with a change, with a note | Applied, and the note goes to Claude. |
| An option without a change, a preset, Custom or free text | Sent to Claude. |

The submission file is written before anything else happens.

**Files:**
- Create:
  - `packages/core/src/store/threads.ts`
  - `packages/core/src/store/submit.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/submit.test.ts`

**Interfaces:**
- Consumes:
  - From Task 3: `Thread`, `ThreadDraft`, `ClaudeMessage`, `YouMessage`, `Option`, `PlumbingType`, `Submission`
  - From Task 4: io readers and writers, `InputError`, `StoreError`, `ConflictError`, `newId`, `slugify`
  - From Task 5: `fieldProblems`, `uniqueId`
  - From Task 6: `recordChange`, `addDecision`
- Produces:
  - **From `threads.ts`:**
    - `latestOpen(thread): { message: ClaudeMessage; options: Option[]; recommended?: string } | null`. These are the options you can answer now: the last non-system message, when Claude wrote it, it isn't resolved, and it has options.
    - `saveDraft(dir, threadId, draft: { optionId?: string; note?: string; text?: string } | null, now?): Promise<Thread>`. Empty fields clear the draft. It throws `InputError` while the thread is with Claude.
    - `setParked(dir, threadId, parked: boolean, now?): Promise<Thread>`
    - `addOwnItem(dir, o: { type: PlumbingType; title: string; text: string; fields?: Record<string, string>; now?: Date }): Promise<{ item: Item; thread: Thread }>`. The thread starts with your text as its draft.
    - `presetLabel(types, item, optionId): string | undefined`
  - **From `submit.ts`:**
    - `submit(dir, o: { scope: 'thread' | 'all'; threadId?: string; types: PlumbingType[]; now?: Date }): Promise<SubmitResult>`
    - `type SubmitResult = { submission: Submission; resolved: string[]; sent: string[]; skipped: { threadId: string; reason: string }[] }`
  - **The draft's `optionId`** is one of Claude's option ids, `preset:<n>` (the type's nth `answerPresets` entry, 0-based), or `custom`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/submit.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readDecisions, readItem, readSubmissions, readThread, writeItem } from '../src/store/io';
import { submit } from '../src/store/submit';
import { addOwnItem, latestOpen, saveDraft, setParked } from '../src/store/threads';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-01T10:00:00.000Z';
const perSend = { id: 'per-send', label: 'One row per send', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] } };
const perSub = { id: 'per-sub', label: 'One row per subscription' };
const options = [perSend, perSub];
const draftOf = (dir: string) => fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8');
const lastOf = async (dir: string, id: string) => (await readThread(dir, id)).messages.at(-1);

describe('drafts and parking', () => {
  it('saves and clears a draft', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options })] });
    expect((await saveDraft(dir, 't-q1', { optionId: 'per-send', note: '  keep it short ' })).draft).toMatchObject({ optionId: 'per-send', note: 'keep it short' });
    expect((await saveDraft(dir, 't-q1', { note: '' })).draft).toBeUndefined();
  });

  it("won't take a draft while Claude is working on the thread", async () => {
    const dir = await seedProject({ pairs: [pair('q1', { status: 'with_claude' })] });
    await expect(saveDraft(dir, 't-q1', { text: 'x' })).rejects.toThrow(/Claude is working on this thread/);
  });

  it('parks and unparks', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options })] });
    expect((await setParked(dir, 't-q1', true)).status).toBe('parked');
    expect((await setParked(dir, 't-q1', false)).status).toBe('your_turn');
    expect((await readThread(dir, 't-q1')).messages.map((m) => m.text)).toEqual(['Which one?', 'Parked.', 'Unparked.']);
  });

  it('finds the options you can answer now, skipping system lines', async () => {
    const { thread } = pair('q1', { options });
    thread.messages.push({ id: 's', at: AT, author: 'system', text: 'Might conflict with another answer.' });
    expect(latestOpen(thread)?.options.map((o) => o.id)).toEqual(['per-send', 'per-sub']);
    thread.messages.push({ id: 'y', at: AT, author: 'you', optionId: 'per-sub' });
    expect(latestOpen(thread)).toBeNull();
  });

  it('adds your own item with your message as its draft', async () => {
    const dir = await seedProject();
    const questions = TYPES.find((t) => t.id === 'questions')!;
    const { item, thread } = await addOwnItem(dir, { type: questions, title: 'Do we need an opt-out link?', text: 'Every reminder email needs one, right?', fields: { blocking: 'false' } });
    expect(item).toMatchObject({ id: 'questions-do-we-need-an-opt-out-link', createdBy: 'you', fields: { blocking: 'false' } });
    expect(thread).toMatchObject({ status: 'idle', draft: { text: 'Every reminder email needs one, right?' }, messages: [] });
    await expect(addOwnItem(dir, { type: questions, title: 'x', text: 'y', fields: { severity: 'high' } })).rejects.toThrow(/isn't a field/);
  });
});

describe('submit', () => {
  it('applies a plain accept and resolves the thread without Claude', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Rows per send?', options, draft: { optionId: 'per-send', updatedAt: AT } })] });
    const r = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
    expect(r).toMatchObject({ resolved: ['t-q1'], sent: [], skipped: [] });
    expect(await draftOf(dir)).toContain('Log one row per send.');
    const thread = await readThread(dir, 't-q1');
    expect(thread.status).toBe('resolved');
    expect(thread.draft).toBeUndefined();
    expect(thread.messages.find((m) => m.author === 'you')).toMatchObject({ optionId: 'per-send', optionLabel: 'One row per send', sentWith: 'thread' });
    expect((await readDecisions(dir)).map((d) => d.text)).toEqual(['Rows per send?: One row per send']);
  });

  it('applies an accept with a note, and sends the note to Claude', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options, draft: { optionId: 'per-send', note: 'Delete rows after 180 days.', updatedAt: AT } })] });
    const r = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
    expect(r).toMatchObject({ resolved: [], sent: ['t-q1'] });
    expect(await draftOf(dir)).toContain('Log one row per send.');
    expect((await readThread(dir, 't-q1')).status).toBe('with_claude');
    expect(await lastOf(dir, 't-q1')).toMatchObject({ author: 'you', note: 'Delete rows after 180 days.' });
    expect(await readDecisions(dir)).toEqual([]);
  });

  it('sends options without a change, presets, Custom and free text to Claude', async () => {
    const dir = await seedProject({
      pairs: [
        pair('q1', { options, draft: { optionId: 'per-sub', updatedAt: AT } }),
        pair('c1', { type: 'concerns', draft: { optionId: 'preset:1', note: 'Low volume anyway.', updatedAt: AT } }),
        pair('q2', { options, draft: { optionId: 'custom', text: 'Ask support first.', updatedAt: AT } }),
        pair('q3', { draft: { text: 'Both channels.', updatedAt: AT } }),
      ],
    });
    const r = await submit(dir, { scope: 'all', types: TYPES });
    expect([...r.sent].sort()).toEqual(['t-c1', 't-q1', 't-q2', 't-q3']);
    expect(await lastOf(dir, 't-c1')).toMatchObject({ optionId: 'preset:1', optionLabel: 'Accept the risk', note: 'Low volume anyway.', sentWith: 'all' });
    expect(await lastOf(dir, 't-q2')).toMatchObject({ optionId: 'custom', text: 'Ask support first.' });
    expect(await lastOf(dir, 't-q3')).toMatchObject({ text: 'Both channels.' });
  });

  it('a change that no longer fits goes to Claude instead', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options, draft: { optionId: 'per-send', updatedAt: AT } })] });
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), '# Restock reminders\n\nThe data section was rewritten by hand.\n');
    const r = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
    expect(r.sent).toEqual(['t-q1']);
    expect(await draftOf(dir)).toBe('# Restock reminders\n\nThe data section was rewritten by hand.\n');
    expect((await readThread(dir, 't-q1')).status).toBe('with_claude');
    expect((await lastOf(dir, 't-q1'))?.text).toMatch(/no longer fits the draft/);
  });

  it('skips what it should, keeping those drafts', async () => {
    const dir = await seedProject({
      pairs: [
        pair('q1', { options, draft: { optionId: 'gone', updatedAt: AT } }),
        pair('q2', { status: 'parked', draft: { text: 'Later.', updatedAt: AT } }),
        pair('q3', { options }),
      ],
    });
    const r = await submit(dir, { scope: 'all', types: TYPES });
    expect(r.sent).toEqual([]);
    expect(r.skipped).toEqual([
      { threadId: 't-q1', reason: "That option isn't available any more. Pick another." },
      { threadId: 't-q2', reason: 'This thread is parked.' },
    ]);
    expect((await readThread(dir, 't-q1')).draft?.optionId).toBe('gone');
  });

  it('writes the submission, with a copy of every draft, before Claude sees it', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { draft: { text: 'Both.', updatedAt: AT } })] });
    const r = await submit(dir, { scope: 'all', types: TYPES });
    const [saved] = await readSubmissions(dir);
    expect(saved).toMatchObject({ id: r.submission.id, scope: 'all', drafts: { 't-q1': { text: 'Both.' } }, sent: ['t-q1'], resolved: [] });
    expect(saved?.processedAt).toBeDefined();
    expect(saved?.pickedUpAt).toBeUndefined();
  });

  it('clears "may need another look" on the item when you send', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { draft: { text: 'Fine.', updatedAt: AT } })] });
    await writeItem(dir, { ...(await readItem(dir, 'q1')), flags: [{ reason: 'Retention changed.', fromThreadId: 't-db1', at: AT }] });
    await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
    expect((await readItem(dir, 'q1')).flags).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/submit.test.ts`
Expected: FAIL, because `../src/store/submit` and `../src/store/threads` are missing.

- [ ] **Step 3: Write `threads.ts`**

`packages/core/src/store/threads.ts`:
```ts
import type { ClaudeMessage, Item, Message, Option, PlumbingType, Thread } from '../schemas';
import { uniqueId } from './importItems';
import { InputError, newId, readItems, readThread, writeItem, writeThread } from './io';
import { slugify } from './open';
import { fieldProblems } from './validate';

/** The options you can answer now: from Claude's last message (system lines aside), unless that message resolved the thread. */
export function latestOpen(thread: Pick<Thread, 'messages'>): { message: ClaudeMessage; options: Option[]; recommended?: string } | null {
  const last = [...thread.messages].reverse().find((m) => m.author !== 'system');
  if (!last || last.author !== 'claude' || last.resolved || !last.options?.length) return null;
  return { message: last, options: last.options, ...(last.recommended ? { recommended: last.recommended } : {}) };
}

export function presetLabel(types: PlumbingType[], item: Pick<Item, 'type'>, optionId: string): string | undefined {
  const n = Number(optionId.slice('preset:'.length));
  return Number.isInteger(n) ? types.find((t) => t.id === item.type)?.answerPresets[n] : undefined;
}

const system = (now: Date, text: string): Message => ({ id: newId('m', now), at: now.toISOString(), author: 'system', text });

export async function saveDraft(
  dir: string,
  threadId: string,
  draft: { optionId?: string; note?: string; text?: string } | null,
  now: Date = new Date(),
): Promise<Thread> {
  const thread = await readThread(dir, threadId);
  if (thread.status === 'with_claude') throw new InputError('Claude is working on this thread. Wait for the reply, then answer.');
  const optionId = draft?.optionId?.trim() || undefined;
  const note = draft?.note?.trim() || undefined;
  const text = draft?.text?.trim() || undefined;
  const next: Thread = { ...thread, draft: optionId || note || text ? { ...(optionId ? { optionId } : {}), ...(note ? { note } : {}), ...(text ? { text } : {}), updatedAt: now.toISOString() } : undefined };
  await writeThread(dir, next);
  return next;
}

export async function setParked(dir: string, threadId: string, parked: boolean, now: Date = new Date()): Promise<Thread> {
  const thread = await readThread(dir, threadId);
  if (thread.status === 'with_claude') throw new InputError("Claude is working on this thread, so it can't be parked yet.");
  if (parked === (thread.status === 'parked')) return thread;
  const status: Thread['status'] = parked ? 'parked' : latestOpen(thread) || [...thread.messages].reverse().find((m) => m.author !== 'system')?.author === 'claude' ? 'your_turn' : 'idle';
  const next: Thread = { ...thread, status, messages: [...thread.messages, system(now, parked ? 'Parked.' : 'Unparked.')] };
  await writeThread(dir, next);
  return next;
}

/** + Question / + Concern / + Idea: a new item whose thread starts with your message as a draft, ready to send. */
export async function addOwnItem(
  dir: string,
  o: { type: PlumbingType; title: string; text: string; fields?: Record<string, string>; now?: Date },
): Promise<{ item: Item; thread: Thread }> {
  const now = o.now ?? new Date();
  const title = o.title.trim();
  const text = o.text.trim();
  if (!title) throw new InputError('Give it a title.');
  if (!text) throw new InputError('Write your message first.');
  const problems = fieldProblems(o.fields, o.type);
  if (problems.length) throw new InputError(problems.join(' '));
  const { values } = await readItems(dir);
  const id = uniqueId(`${o.type.id}-${slugify(title)}`, new Set(values.map((i) => i.id)));
  const item: Item = { id, type: o.type.id, title, summary: title, ...(o.fields ? { fields: o.fields } : {}), threadId: `t-${id}`, createdBy: 'you' };
  const thread: Thread = { id: `t-${id}`, itemId: id, status: 'idle', draft: { text, updatedAt: now.toISOString() }, messages: [] };
  await writeItem(dir, item);
  await writeThread(dir, thread);
  return { item, thread };
}
```

- [ ] **Step 4: Write `submit.ts`**

`packages/core/src/store/submit.ts`:
```ts
import type { Message, Option, PlumbingType, Submission, Thread, YouMessage } from '../schemas';
import { recordChange } from './changes';
import { addDecision } from './decisions';
import { ConflictError, newId, readItem, readThreads, StoreError, touchProject, writeItem, writeSubmission, writeThread } from './io';
import { latestOpen, presetLabel } from './threads';

export type SubmitResult = { submission: Submission; resolved: string[]; sent: string[]; skipped: { threadId: string; reason: string }[] };
type Outcome = { kind: 'resolved' | 'sent' } | { kind: 'skipped'; reason: string };

const skipped = (reason: string): Outcome => ({ kind: 'skipped', reason });

async function submitThread(dir: string, thread: Thread, scope: 'thread' | 'all', types: PlumbingType[], now: Date): Promise<Outcome> {
  const draft = thread.draft;
  if (!draft || (!draft.optionId && !draft.text?.trim())) return skipped('Nothing to send yet.');
  if (thread.status === 'with_claude') return skipped('Claude is already working on this thread.');
  if (thread.status === 'parked') return skipped('This thread is parked.');

  const at = now.toISOString();
  const item = await readItem(dir, thread.itemId);
  const note = draft.note?.trim() || undefined;
  const you: YouMessage = { id: newId('m', now), at, author: 'you', sentWith: scope };
  let option: Option | undefined;
  if (draft.optionId === 'custom') {
    if (!draft.text?.trim()) return skipped('Write your custom answer first.');
    you.optionId = 'custom';
    you.text = draft.text.trim();
  } else if (draft.optionId?.startsWith('preset:')) {
    const label = presetLabel(types, item, draft.optionId);
    if (!label) return skipped("That answer isn't available any more. Pick another.");
    Object.assign(you, { optionId: draft.optionId, optionLabel: label }, note ? { note } : {});
  } else if (draft.optionId) {
    option = latestOpen(thread)?.options.find((o) => o.id === draft.optionId);
    if (!option) return skipped("That option isn't available any more. Pick another.");
    Object.assign(you, { optionId: option.id, optionLabel: option.label }, note ? { note } : {});
  } else {
    you.text = draft.text!.trim();
  }

  if (item.flags?.length) await writeItem(dir, { ...item, flags: undefined });
  const messages: Message[] = [...thread.messages, you];
  const save = (status: Thread['status'], extra: Message[] = []) => writeThread(dir, { ...thread, draft: undefined, status, messages: [...messages, ...extra] });
  const systemLine = (text: string): Message => ({ id: newId('m', now), at, author: 'system', text });

  if (option?.change) {
    try {
      await recordChange(dir, { threadId: thread.id, kind: 'accept', summary: `${item.title}: ${option.label}`, change: option.change, apply: true, now });
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      await save('with_claude', [systemLine(`This change no longer fits the draft, so it wasn't applied. Sent to Claude to redo it. (${e.message})`)]);
      return { kind: 'sent' };
    }
    if (!note) {
      await addDecision(dir, { text: `${item.title}: ${option.label}`, threadId: thread.id, itemIds: [item.id], now });
      await save('resolved', [systemLine('Applied and resolved.')]);
      return { kind: 'resolved' };
    }
  }
  await save('with_claude');
  return { kind: 'sent' };
}

/**
 * Send this thread (scope 'thread') or Submit all (every thread with a draft). The submission, with a copy
 * of every draft, is written first. Plain accepts are applied right away; everything else goes to Claude.
 */
export async function submit(dir: string, o: { scope: 'thread' | 'all'; threadId?: string; types: PlumbingType[]; now?: Date }): Promise<SubmitResult> {
  const now = o.now ?? new Date();
  const { values: threads } = await readThreads(dir);
  const candidates = o.scope === 'thread' ? threads.filter((t) => t.id === o.threadId) : threads.filter((t) => t.draft);
  if (o.scope === 'thread' && candidates.length === 0) throw new StoreError(`Thread ${o.threadId} doesn't exist.`);
  const submission: Submission = {
    id: newId('s', now),
    at: now.toISOString(),
    scope: o.scope,
    drafts: Object.fromEntries(candidates.filter((t) => t.draft).map((t) => [t.id, t.draft!])),
    sent: [],
    resolved: [],
  };
  await writeSubmission(dir, submission);

  const result: Omit<SubmitResult, 'submission'> = { resolved: [], sent: [], skipped: [] };
  for (const thread of candidates) {
    const outcome = await submitThread(dir, thread, o.scope, o.types, now);
    if (outcome.kind === 'skipped') result.skipped.push({ threadId: thread.id, reason: outcome.reason });
    else result[outcome.kind].push(thread.id);
  }
  const done: Submission = { ...submission, sent: result.sent, resolved: result.resolved, processedAt: new Date().toISOString() };
  await writeSubmission(dir, done);
  if (result.sent.length || result.resolved.length) await touchProject(dir, now);
  return { submission: done, ...result };
}
```

In `packages/core/src/index.ts`, add:
```ts
export * from './store/threads';
export * from './store/submit';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/core && pnpm --filter @dev-plumbing/core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): drafts, park, your own items, and Send / Submit all per spec section 9" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Claude's replies

A thread subagent posts one reply per thread. A reply can include:
- an explanation
- options carrying changes
- small edits, applied at once when `autoApplySmallEdits` is on
- new items
- "might affect" flags
- a resolution with a one-line decision

Like import batches, a reply is checked as a whole and refused with every problem listed.

**Files:**
- Create: `packages/core/src/store/reply.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/reply.test.ts`

**Interfaces:**
- Consumes:
  - From Task 3: `ReplyInput`, `ClaudeMessage`, `HistoryEntry`, `applyMdPatches`
  - From Tasks 4–7: io, `InputError`, `StoreError`, `slugify`, `uniqueId`, `verifyCodeRefs`, `messageProblems`, `fieldProblems`, `nothingSaved`, `recordChange`, `addDecision`
- Produces:
  - `postReply(dir, o: { reply: ReplyInput; types: PlumbingType[]; autoApply: boolean; clone: string; now?: Date }): Promise<{ messageId: string; edits: HistoryEntry[]; newThreadIds: string[] }>`
  - Behaviour:
    - The thread must be `with_claude`.
    - It ends as `your_turn`, or `resolved` when `resolve` is set.
    - New items get id `<type>-<slug of title>`, `createdBy: 'claude'`, a link to the thread's item, and a `your_turn` thread.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/reply.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { InputError, readDecisions, readHistory, readItem, readThread } from '../src/store/io';
import { postReply } from '../src/store/reply';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-01T10:00:00.000Z';
const asked = (id: string, extra: Parameters<typeof pair>[1] = {}) =>
  pair(id, { status: 'with_claude', messages: [{ id: `m-${id}`, at: AT, author: 'claude', text: 'Which one?' }, { id: `y-${id}`, at: AT, author: 'you', text: 'What would you do?' }], ...extra });
const draftOf = (dir: string) => fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8');
const reply = (dir: string, r: Parameters<typeof postReply>[1]['reply'], autoApply = true) => postReply(dir, { reply: r, types: TYPES, autoApply, clone: '/nowhere' });

describe('posting a reply', () => {
  it('adds the message with options and gives the thread back to you', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const r = await reply(dir, {
      threadId: 't-q1',
      text: 'One row per send keeps history for support.',
      options: [{ id: 'per-send', label: 'One row per send', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] } }, { id: 'per-sub', label: 'One row per subscription' }],
      recommended: 'per-send',
      filesRead: ['src/jobs/reminders.ts'],
    });
    const thread = await readThread(dir, 't-q1');
    expect(thread.status).toBe('your_turn');
    expect(thread.messages.at(-1)).toMatchObject({ id: r.messageId, author: 'claude', recommended: 'per-send', filesRead: ['src/jobs/reminders.ts'] });
    expect(await draftOf(dir)).toBe(DRAFT);
  });

  it('applies small edits straight away, and options are checked against the edited draft', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const r = await reply(dir, {
      threadId: 't-q1',
      text: 'Fixed a typo. Which retention?',
      smallEdits: [{ summary: 'Clearer wording in Data', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log each reminder in a table.' }] } }],
      options: [{ id: 'keep', label: 'Keep 180 days', change: { md: [{ find: 'Log each reminder in a table.', replace: 'Log each reminder in a table for 180 days.' }] } }],
    });
    expect(await draftOf(dir)).toContain('Log each reminder in a table.');
    expect(r.edits).toHaveLength(1);
    expect(r.edits[0]?.appliedAt).toBeDefined();
    expect((await readThread(dir, 't-q1')).messages.at(-1)).toMatchObject({ smallEdits: [{ changeId: r.edits[0]?.id, summary: 'Clearer wording in Data' }] });
  });

  it('keeps small edits pending when auto-apply is off', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const r = await reply(dir, { threadId: 't-q1', text: 'Tidied.', smallEdits: [{ summary: 'Wording', change: { md: [{ find: 'a table', replace: 'one table' }] } }] }, false);
    expect(r.edits[0]?.appliedAt).toBeUndefined();
    expect(await draftOf(dir)).toBe(DRAFT);
  });

  it('opens new threads and flags items it might affect', async () => {
    const dir = await seedProject({ pairs: [asked('q1'), pair('c1', { type: 'concerns' })] });
    const r = await reply(dir, {
      threadId: 't-q1',
      text: 'This raises a retention question.',
      newItems: [{ type: 'questions', title: 'Is 180 days enough for audits?', summary: 'Retention vs audits.', message: { text: 'Do audits need longer?' } }],
      impacts: [{ itemId: 'c1', reason: 'Retention changes the burst risk.' }],
    });
    expect(r.newThreadIds).toEqual(['t-questions-is-180-days-enough-for-audits']);
    expect(await readItem(dir, 'questions-is-180-days-enough-for-audits')).toMatchObject({ createdBy: 'claude', links: ['q1'] });
    expect((await readThread(dir, 't-questions-is-180-days-enough-for-audits')).status).toBe('your_turn');
    expect((await readItem(dir, 'c1')).flags).toEqual([{ reason: 'Retention changes the burst risk.', fromThreadId: 't-q1', at: expect.any(String) }]);
  });

  it('resolves the thread with a decision', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    await reply(dir, { threadId: 't-q1', text: 'Settled.', resolve: { decision: 'Reminders go by SMS and email' } });
    expect((await readThread(dir, 't-q1')).status).toBe('resolved');
    expect((await readThread(dir, 't-q1')).messages.at(-1)).toMatchObject({ resolved: true });
    expect(await readDecisions(dir)).toEqual([expect.objectContaining({ text: 'Reminders go by SMS and email', threadId: 't-q1', itemIds: ['q1'] })]);
  });

  it('a bad reply writes nothing and lists every problem', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const attempt = reply(dir, {
      threadId: 't-q1',
      text: 'x',
      options: [{ id: 'a', label: 'A', change: { md: [{ find: 'Nowhere in the draft', replace: 'y' }] } }],
      recommended: 'b',
      resolve: { decision: 'Both' },
      smallEdits: [{ summary: 'Delete', change: { md: [{ find: 'Log reminders in a table.', replace: '' }] } }],
      newItems: [{ type: 'nope', title: 'T', summary: 's', message: { text: 'm' } }],
      impacts: [{ itemId: 'ghost', reason: 'r' }],
    });
    await expect(attempt).rejects.toThrow(InputError);
    const message = await attempt.catch((e: Error) => e.message);
    for (const bit of [/options or resolve/, /recommended is "b"/, /isn't in the draft/, /can't delete text outright/, /"nope" isn't an enabled plumbing type/, /no item "ghost"/]) {
      expect(message).toMatch(bit);
    }
    expect((await readThread(dir, 't-q1')).messages).toHaveLength(2);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
  });

  it("refuses threads that aren't waiting for Claude", async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    await expect(reply(dir, { threadId: 't-q1', text: 'x' })).rejects.toThrow(/isn't waiting for Claude/);
    await expect(reply(dir, { threadId: 't-ghost', text: 'x' })).rejects.toThrow(/no thread "t-ghost"/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/reply.test.ts`
Expected: FAIL, because `../src/store/reply` is missing.

- [ ] **Step 3: Write `reply.ts`**

`packages/core/src/store/reply.ts`:
```ts
import { applyMdPatches, type ClaudeMessage, type HistoryEntry, type PlumbingType, type ReplyInput, type Thread } from '../schemas';
import { recordChange } from './changes';
import { addDecision } from './decisions';
import { uniqueId, verifyCodeRefs } from './importItems';
import { InputError, newId, readDocText, readItem, readItems, readProjectFile, readThread, StoreError, touchProject, writeItem, writeThread } from './io';
import { slugify } from './open';
import { fieldProblems, messageProblems, nothingSaved } from './validate';

export async function postReply(
  dir: string,
  o: { reply: ReplyInput; types: PlumbingType[]; autoApply: boolean; clone: string; now?: Date },
): Promise<{ messageId: string; edits: HistoryEntry[]; newThreadIds: string[] }> {
  const now = o.now ?? new Date();
  const at = now.toISOString();
  const r = o.reply;
  let thread: Thread;
  try {
    thread = await readThread(dir, r.threadId);
  } catch (e) {
    if (e instanceof StoreError) throw new InputError(`There's no thread "${r.threadId}". Reply only to the threads you were given.`);
    throw e;
  }
  if (thread.status !== 'with_claude') {
    throw new InputError(`Thread ${r.threadId} isn't waiting for Claude (it's ${thread.status.replace('_', ' ')}). Reply only to the threads you were given, once each.`);
  }

  const project = await readProjectFile(dir);
  const draft = await readDocText(dir, project.docs.draft);
  const { values: items } = await readItems(dir);
  const itemIds = new Set(items.map((i) => i.id));
  const problems: string[] = [];
  if (r.resolve && r.options) problems.push('Send options or resolve, not both.');
  if (r.recommended && !r.options) problems.push('recommended needs options.');

  // Small edits are checked in order, each against the draft as the ones before it leave it.
  let edited = draft;
  (r.smallEdits ?? []).forEach((e, i) => {
    const where = `Small edit ${i + 1}`;
    if (e.change.md?.some((p) => p.replace === '')) problems.push(`${where}: a small edit can't delete text outright. Keep a few surrounding words in both find and replace.`);
    if (e.change.md?.length) {
      const res = applyMdPatches(edited, e.change.md);
      if (res.ok) edited = res.text;
      else problems.push(`${where}: ${res.error}`);
    }
    for (const c of e.change.items ?? []) if (!itemIds.has(c.itemId)) problems.push(`${where}: there's no item "${c.itemId}".`);
  });
  // Options must fit the draft as the user will see it: after the small edits, when those apply straight away.
  const base = o.autoApply ? edited : draft;
  problems.push(...messageProblems(r, base, itemIds));
  const enabled = new Map(o.types.filter((t) => t.enabled).map((t) => [t.id, t]));
  (r.newItems ?? []).forEach((n, i) => {
    const where = `New item ${i + 1} (${n.title})`;
    const type = enabled.get(n.type);
    if (!type) {
      problems.push(`${where}: "${n.type}" isn't an enabled plumbing type. Use one of: ${[...enabled.keys()].join(', ')}.`);
      return;
    }
    problems.push(...fieldProblems(n.fields, type).map((p) => `${where}: ${p}`));
    problems.push(...messageProblems(n.message, base, itemIds).map((p) => `${where}: ${p}`));
  });
  for (const imp of r.impacts ?? []) if (!itemIds.has(imp.itemId)) problems.push(`Impacts: there's no item "${imp.itemId}".`);
  for (const id of r.resolve?.itemIds ?? []) if (!itemIds.has(id)) problems.push(`resolve.itemIds: there's no item "${id}".`);
  if (problems.length) throw nothingSaved(problems, 'call dp_reply again');

  const edits: HistoryEntry[] = [];
  for (const e of r.smallEdits ?? []) {
    edits.push(await recordChange(dir, { threadId: thread.id, kind: 'small-edit', summary: e.summary, change: e.change, apply: o.autoApply, now }));
  }

  const taken = new Set(itemIds);
  const newItemIds: string[] = [];
  for (const n of r.newItems ?? []) {
    const id = uniqueId(`${n.type}-${slugify(n.title)}`, taken);
    await writeItem(dir, {
      id,
      type: n.type,
      title: n.title,
      summary: n.summary,
      ...(n.body ? { body: n.body } : {}),
      ...(n.fields ? { fields: n.fields } : {}),
      ...(n.mdAnchor ? { mdAnchor: n.mdAnchor } : {}),
      ...(n.codeRefs?.length ? { codeRefs: await verifyCodeRefs(o.clone, n.codeRefs) } : {}),
      ...(n.data !== undefined ? { data: n.data } : {}),
      links: [thread.itemId],
      threadId: `t-${id}`,
      createdBy: 'claude',
    });
    await writeThread(dir, {
      id: `t-${id}`,
      itemId: id,
      status: 'your_turn',
      messages: [
        {
          id: newId('m', now),
          at,
          author: 'claude',
          text: n.message.text,
          ...(n.message.options ? { options: n.message.options } : {}),
          ...(n.message.recommended ? { recommended: n.message.recommended } : {}),
        },
      ],
    });
    newItemIds.push(id);
  }

  for (const imp of r.impacts ?? []) {
    const item = await readItem(dir, imp.itemId);
    await writeItem(dir, { ...item, flags: [...(item.flags ?? []), { reason: imp.reason, fromThreadId: thread.id, at }] });
  }

  const message: ClaudeMessage = {
    id: newId('m', now),
    at,
    author: 'claude',
    text: r.text,
    ...(r.options ? { options: r.options } : {}),
    ...(r.recommended ? { recommended: r.recommended } : {}),
    ...(edits.length ? { smallEdits: edits.map((e) => ({ changeId: e.id, summary: e.summary })) } : {}),
    ...(newItemIds.length ? { newItemIds } : {}),
    ...(r.impacts?.length ? { impacts: r.impacts } : {}),
    ...(r.filesRead?.length ? { filesRead: r.filesRead } : {}),
    ...(r.resolve ? { resolved: true } : {}),
  };
  if (r.resolve) await addDecision(dir, { text: r.resolve.decision, threadId: thread.id, itemIds: r.resolve.itemIds ?? [thread.itemId], now });
  await writeThread(dir, { ...thread, status: r.resolve ? 'resolved' : 'your_turn', messages: [...thread.messages, message] });
  await touchProject(dir, now);
  return { messageId: message.id, edits, newThreadIds: newItemIds.map((id) => `t-${id}`) };
}
```

In `packages/core/src/index.ts`, add `export * from './store/reply';`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/core && pnpm --filter @dev-plumbing/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): Claude's replies with options, small edits, new threads, impacts and decisions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: The work queue, linked groups and context packs

A listening window picks up submissions in order and finishes them. Work a window can't finish never stays stuck:
- A window's own unanswered threads come back to you as drafts.
- Submissions held by a window that went away go back in the queue.

Linked threads go to one subagent. Context packs are what a subagent reads instead of the whole project.

**Files:**
- Create:
  - `packages/core/src/store/queue.ts`
  - `packages/core/src/store/context.ts`
- Modify: `packages/core/src/index.ts`
- Test:
  - `packages/core/test/queue.test.ts`
  - `packages/core/test/context.test.ts`

**Interfaces:**
- Consumes: io from Task 4, `activeDecisions` from Task 6, and `headingsOf`, `sectionFor` and `firstParagraph` from Task 3.
- Produces:
  - **queue.ts:**
    - `pendingSubmissions(dir): Promise<Submission[]>`: submissions that sent something to Claude and haven't been picked up or finished, oldest first.
    - `pickUp(dir, id, windowId, now?): Promise<Submission>`. It throws `ConflictError` if the submission was already picked up.
    - `finishSubmission(dir, id, conflicts: { threads: string[]; text: string }[], now?): Promise<{ returned: string[] }>`
    - `finishWindowSubmissions(dir, windowId, now?): Promise<string[]>`: finishes this window's picked-up submissions that it never reported.
    - `requeueUnfinished(dir, isAlive: (windowId: string) => boolean, now?): Promise<string[]>`
    - `groupThreads(dir, threadIds, linked: boolean): Promise<string[][]>`
  - **context.ts:**
    - `type ThreadPack`, built by `threadPack(o: { dir: string; threadId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ThreadPack>`
    - `type ImportPack`, built by `importPack(o: { dir: string; typeId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ImportPack>`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/queue.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { readItem, readSubmission, readThread, writeSubmission, writeThread } from '../src/store/io';
import { finishSubmission, finishWindowSubmissions, groupThreads, pendingSubmissions, pickUp, requeueUnfinished } from '../src/store/queue';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-01T10:00:00.000Z';
const sentPair = (id: string, links?: string[]) =>
  pair(id, { status: 'with_claude', links, messages: [{ id: `m-${id}`, at: AT, author: 'claude', text: 'Which?' }, { id: `y-${id}`, at: AT, author: 'you', optionId: 'custom', text: `Answer ${id}` }] });
const submission = (id: string, sent: string[], extra = {}) => ({ id, at: AT, scope: 'all' as const, drafts: {}, sent, resolved: [], processedAt: AT, ...extra });

describe('the queue', () => {
  it('queued submissions are picked up oldest first, once', async () => {
    const dir = await seedProject({ pairs: [sentPair('q1'), sentPair('q2')] });
    await writeSubmission(dir, submission('s-2', ['t-q2']));
    await writeSubmission(dir, submission('s-1', ['t-q1']));
    await writeSubmission(dir, submission('s-0', []));
    expect((await pendingSubmissions(dir)).map((s) => s.id)).toEqual(['s-1', 's-2']);
    await pickUp(dir, 's-1', 'w-a');
    await expect(pickUp(dir, 's-1', 'w-b')).rejects.toThrow(/already picked up/);
    expect((await pendingSubmissions(dir)).map((s) => s.id)).toEqual(['s-2']);
  });

  it("gives back threads Claude didn't answer, with your answer restored as a draft", async () => {
    const dir = await seedProject({ pairs: [sentPair('q1'), sentPair('q2')] });
    await writeSubmission(dir, submission('s-1', ['t-q1', 't-q2'], { pickedUpAt: AT, pickedUpBy: 'w-a' }));
    const answered = await readThread(dir, 't-q2');
    await writeThread(dir, { ...answered, status: 'your_turn', messages: [...answered.messages, { id: 'c', at: AT, author: 'claude', text: 'Done.' }] });
    expect(await finishSubmission(dir, 's-1', [])).toEqual({ returned: ['t-q1'] });
    const back = await readThread(dir, 't-q1');
    expect(back.status).toBe('your_turn');
    expect(back.draft).toMatchObject({ optionId: 'custom', text: 'Answer q1' });
    expect(back.messages.at(-1)?.text).toMatch(/didn't get to this one/);
    expect((await readThread(dir, 't-q2')).messages.at(-1)?.text).toBe('Done.');
    expect((await readSubmission(dir, 's-1')).finishedAt).toBeDefined();
    expect(await finishSubmission(dir, 's-1', [])).toEqual({ returned: [] });
  });

  it('flags conflicts the main window found on every thread involved', async () => {
    const dir = await seedProject({ pairs: [pair('q1'), pair('q2')] });
    await writeSubmission(dir, submission('s-1', [], { pickedUpAt: AT, pickedUpBy: 'w-a' }));
    await finishSubmission(dir, 's-1', [{ threads: ['t-q1', 't-q2'], text: 'One says SMS only, the other email only.' }]);
    expect((await readThread(dir, 't-q1')).messages.at(-1)?.text).toMatch(/Might conflict with another answer: One says SMS only/);
    expect((await readItem(dir, 'q2')).flags?.[0]).toMatchObject({ reason: 'One says SMS only, the other email only.', fromThreadId: 't-q1' });
  });

  it('requeues work from windows that went away, and leaves live windows alone', async () => {
    const dir = await seedProject({ pairs: [sentPair('q1'), sentPair('q2'), sentPair('q3')] });
    await writeSubmission(dir, submission('s-dead', ['t-q1', 't-q2'], { pickedUpAt: AT, pickedUpBy: 'w-dead' }));
    await writeSubmission(dir, submission('s-live', ['t-q3'], { pickedUpAt: AT, pickedUpBy: 'w-live' }));
    const q2 = await readThread(dir, 't-q2');
    await writeThread(dir, { ...q2, status: 'your_turn' });
    expect(await requeueUnfinished(dir, (w) => w === 'w-live')).toEqual(['s-dead']);
    const requeued = await readSubmission(dir, 's-dead');
    expect(requeued).toMatchObject({ sent: ['t-q1'] });
    expect(requeued.pickedUpAt).toBeUndefined();
    expect((await readSubmission(dir, 's-live')).pickedUpBy).toBe('w-live');
    expect((await pendingSubmissions(dir)).map((s) => s.id)).toEqual(['s-dead']);
  });

  it("finishes a window's own submissions it never reported back", async () => {
    const dir = await seedProject({ pairs: [sentPair('q1')] });
    await writeSubmission(dir, submission('s-1', ['t-q1'], { pickedUpAt: AT, pickedUpBy: 'w-a' }));
    expect(await finishWindowSubmissions(dir, 'w-b')).toEqual([]);
    expect(await finishWindowSubmissions(dir, 'w-a')).toEqual(['s-1']);
    expect((await readThread(dir, 't-q1')).status).toBe('your_turn');
  });

  it('groups linked threads, keeping their order', async () => {
    const dir = await seedProject({ pairs: [sentPair('q1', ['q3']), sentPair('q2'), sentPair('q3'), sentPair('q4', ['q2'])] });
    const ids = ['t-q1', 't-q2', 't-q3', 't-q4'];
    expect(await groupThreads(dir, ids, true)).toEqual([['t-q1', 't-q3'], ['t-q2', 't-q4']]);
    expect(await groupThreads(dir, ids, false)).toEqual([['t-q1'], ['t-q2'], ['t-q3'], ['t-q4']]);
  });
});
```

`packages/core/test/context.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { repoProfileSchema } from '../src/schemas';
import { importPack, threadPack } from '../src/store/context';
import { addDecision } from '../src/store/decisions';
import { readItem, writeItem } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const profile = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'], conventions: ['Ids use uuid()'], apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/theme.css'] }] });

describe('context packs', () => {
  it('gives a thread subagent what it needs, and nothing more', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { links: ['c1'] }), pair('c1', { type: 'concerns', title: 'Burst of sends' }), pair('q9', { links: ['q1'], title: 'Linked back' }), pair('q7')] });
    await writeItem(dir, { ...(await readItem(dir, 'q1')), mdAnchor: { heading: 'Data' } });
    await addDecision(dir, { text: 'Reminders go by SMS and email', threadId: 't-q7', itemIds: ['q7'] });
    const pack = await threadPack({ dir, threadId: 't-q1', types: TYPES, profile });
    expect(pack.project).toEqual({ repo: 'acme', id: 'restock', title: 'Restock reminders', summary: 'Remind customers before a subscription item runs out.' });
    expect(pack.type).toEqual({ id: 'questions', title: 'Questions', rules: '- Be brief.', fields: ['blocking', 'default'], answerPresets: [] });
    expect(pack.item.id).toBe('q1');
    expect(pack.thread.messages).toHaveLength(1);
    expect(pack.linked.map((l) => l.id).sort()).toEqual(['c1', 'q9']);
    expect(pack.decisions).toEqual(['Reminders go by SMS and email']);
    expect(pack.draftSection).toEqual({ heading: 'Data', text: '## Data\n\nLog reminders in a table.' });
    expect(pack.draftHeadings).toEqual(['# Restock reminders', '## Approach', '## Data']);
    expect(pack.draftFile).toMatch(/docs\/draft\.md$/);
    expect(pack.conventions).toEqual(['Ids use uuid()']);
  });

  it('gives an importer the whole draft, its rules file and the repo profile', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const pack = await importPack({ dir, typeId: 'questions', types: TYPES, profile });
    expect(pack.type).toMatchObject({ id: 'questions', screen: 'list', fields: ['blocking', 'default'], rules: '## Rules\n- Be brief.\n' });
    expect(pack.draft).toMatch(/^# Restock reminders/);
    expect(pack.profile).toEqual({ name: 'acme', conventions: ['Ids use uuid()'], apps: [{ name: 'web', path: 'apps/web' }], planFolders: [] });
    expect(pack.existingItems).toEqual([{ id: 'q1', type: 'questions', title: 'Question q1' }]);
    await expect(importPack({ dir, typeId: 'nope', types: TYPES })).rejects.toThrow(/no plumbing type "nope"/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/queue.test.ts packages/core/test/context.test.ts`
Expected: FAIL, because the modules are missing.

- [ ] **Step 3: Write `queue.ts`**

`packages/core/src/store/queue.ts`:
```ts
import type { Message, Submission, ThreadDraft, YouMessage } from '../schemas';
import { ConflictError, newId, readItem, readItems, readSubmission, readSubmissions, readThread, writeItem, writeSubmission, writeThread } from './io';

export async function pendingSubmissions(dir: string): Promise<Submission[]> {
  return (await readSubmissions(dir)).filter((s) => s.sent.length > 0 && !s.pickedUpAt && !s.finishedAt);
}

export async function pickUp(dir: string, id: string, windowId: string, now: Date = new Date()): Promise<Submission> {
  const s = await readSubmission(dir, id);
  if (s.pickedUpAt) throw new ConflictError(`Submission ${id} was already picked up.`);
  const next: Submission = { ...s, pickedUpAt: now.toISOString(), pickedUpBy: windowId };
  await writeSubmission(dir, next);
  return next;
}

const draftFrom = (m: YouMessage, at: string): ThreadDraft => ({
  ...(m.optionId ? { optionId: m.optionId } : {}),
  ...(m.note ? { note: m.note } : {}),
  ...(m.text ? { text: m.text } : {}),
  updatedAt: at,
});

/**
 * Ends a submission. Threads Claude didn't answer go back to Your turn with your answer restored as a
 * draft. Conflicts the main window found are noted on every thread involved and flag their items.
 */
export async function finishSubmission(dir: string, id: string, conflicts: { threads: string[]; text: string }[], now: Date = new Date()): Promise<{ returned: string[] }> {
  const s = await readSubmission(dir, id);
  if (s.finishedAt) return { returned: [] };
  const at = now.toISOString();
  const line = (text: string): Message => ({ id: newId('m', now), at, author: 'system', text });
  const returned: string[] = [];
  for (const threadId of s.sent) {
    const thread = await readThread(dir, threadId).catch(() => null);
    if (thread?.status !== 'with_claude') continue;
    const you = [...thread.messages].reverse().find((m): m is YouMessage => m.author === 'you');
    await writeThread(dir, {
      ...thread,
      status: 'your_turn',
      ...(you ? { draft: draftFrom(you, at) } : {}),
      messages: [...thread.messages, line("Claude didn't get to this one. Your answer is back in the box: send it again when you're ready.")],
    });
    returned.push(threadId);
  }
  for (const c of conflicts) {
    for (const threadId of c.threads) {
      const thread = await readThread(dir, threadId).catch(() => null);
      if (!thread) continue;
      await writeThread(dir, { ...thread, messages: [...thread.messages, line(`Might conflict with another answer: ${c.text}`)] });
      const item = await readItem(dir, thread.itemId).catch(() => null);
      const other = c.threads.find((t) => t !== threadId) ?? threadId;
      if (item) await writeItem(dir, { ...item, flags: [...(item.flags ?? []), { reason: c.text, fromThreadId: other, at }] });
    }
  }
  await writeSubmission(dir, { ...s, finishedAt: at });
  return { returned };
}

/** A window that calls dp_wait again without reporting back has finished whatever it picked up before. */
export async function finishWindowSubmissions(dir: string, windowId: string, now: Date = new Date()): Promise<string[]> {
  const mine = (await readSubmissions(dir)).filter((s) => s.pickedUpBy === windowId && !s.finishedAt);
  for (const s of mine) await finishSubmission(dir, s.id, [], now);
  return mine.map((s) => s.id);
}

/** Submissions held by windows that went away go back in the queue, with only the threads still waiting for Claude. */
export async function requeueUnfinished(dir: string, isAlive: (windowId: string) => boolean, now: Date = new Date()): Promise<string[]> {
  const at = now.toISOString();
  const requeued: string[] = [];
  for (const s of await readSubmissions(dir)) {
    if (!s.pickedUpAt || s.finishedAt || (s.pickedUpBy && isAlive(s.pickedUpBy))) continue;
    const still: string[] = [];
    for (const threadId of s.sent) {
      const thread = await readThread(dir, threadId).catch(() => null);
      if (thread?.status === 'with_claude') still.push(threadId);
    }
    if (still.length) {
      await writeSubmission(dir, { ...s, sent: still, pickedUpAt: undefined, pickedUpBy: undefined, requeuedAt: at });
      requeued.push(s.id);
    } else {
      await writeSubmission(dir, { ...s, finishedAt: at });
    }
  }
  return requeued;
}

/** One group per set of threads whose items link to each other (either direction), in the order given. */
export async function groupThreads(dir: string, threadIds: string[], linked: boolean): Promise<string[][]> {
  if (!linked || threadIds.length < 2) return threadIds.map((t) => [t]);
  const itemOf = new Map<string, string>();
  for (const id of threadIds) {
    const thread = await readThread(dir, id).catch(() => null);
    if (thread) itemOf.set(id, thread.itemId);
  }
  const items = new Map((await readItems(dir)).values.map((i) => [i.id, i]));
  const parent = new Map(threadIds.map((t) => [t, t]));
  const find = (t: string): string => {
    let root = t;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(t, root);
    return root;
  };
  for (const [i, a] of threadIds.entries()) {
    for (const b of threadIds.slice(i + 1)) {
      const ia = items.get(itemOf.get(a) ?? '');
      const ib = items.get(itemOf.get(b) ?? '');
      if (ia && ib && (ia.links?.includes(ib.id) || ib.links?.includes(ia.id))) parent.set(find(b), find(a));
    }
  }
  const groups = new Map<string, string[]>();
  for (const t of threadIds) groups.set(find(t), [...(groups.get(find(t)) ?? []), t]);
  return [...groups.values()];
}
```

- [ ] **Step 4: Write `context.ts`**

`packages/core/src/store/context.ts`:
```ts
import { firstParagraph, headingsOf, sectionFor, type Item, type Message, type PlumbingType, type RepoProfile, type Screen, type ThreadStatus } from '../schemas';
import { activeDecisions } from './decisions';
import { docPath, readDecisions, readDocText, readItem, readItems, readProjectFile, readThread, StoreError } from './io';

export type ThreadPack = {
  project: { repo: string; id: string; title: string; summary: string };
  type: { id: string; title: string; rules: string; fields: string[]; answerPresets: string[] };
  item: Item;
  thread: { id: string; status: ThreadStatus; messages: Message[] };
  linked: { id: string; type: string; title: string; summary: string }[];
  decisions: string[];
  draftSection: { heading: string; text: string } | null;
  draftHeadings: string[];
  /** The whole draft, for patches outside the item's section. Read it; never write it. */
  draftFile: string;
  conventions: string[];
};

export type ImportPack = {
  project: { repo: string; id: string; title: string };
  type: { id: string; title: string; screen: Screen; fields: string[]; answerPresets: string[]; rules: string };
  draft: string;
  profile: { name: string; schema?: RepoProfile['schema']; conventions: string[]; apps: { name: string; path: string }[]; planFolders: string[] } | null;
  existingItems: { id: string; type: string; title: string }[];
};

/** Spec §13.2: what a thread subagent receives. */
export async function threadPack(o: { dir: string; threadId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ThreadPack> {
  const project = await readProjectFile(o.dir);
  const thread = await readThread(o.dir, o.threadId);
  const item = await readItem(o.dir, thread.itemId);
  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: items } = await readItems(o.dir);
  const type = o.types.find((t) => t.id === item.type);
  const linkedIds = new Set([...(item.links ?? []), ...items.filter((i) => i.links?.includes(item.id)).map((i) => i.id)]);
  const section = item.mdAnchor ? sectionFor(draft, item.mdAnchor.heading) : null;
  return {
    project: { repo: project.repo, id: project.id, title: project.title, summary: firstParagraph(draft) },
    type: { id: item.type, title: type?.title ?? item.type, rules: type?.sections.Rules ?? '', fields: type?.fields ?? [], answerPresets: type?.answerPresets ?? [] },
    item,
    thread: { id: thread.id, status: thread.status, messages: thread.messages },
    linked: items.filter((i) => linkedIds.has(i.id)).map((i) => ({ id: i.id, type: i.type, title: i.title, summary: i.summary })),
    decisions: activeDecisions(await readDecisions(o.dir)).map((d) => d.text),
    draftSection: section !== null && item.mdAnchor ? { heading: item.mdAnchor.heading, text: section } : null,
    draftHeadings: headingsOf(draft).map((h) => `${'#'.repeat(h.level)} ${h.text}`),
    draftFile: docPath(o.dir, project.docs.draft),
    conventions: o.profile?.conventions ?? [],
  };
}

/** What an importer receives: the whole draft, its plumbing type's whole rules file, and the repo profile. */
export async function importPack(o: { dir: string; typeId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ImportPack> {
  const type = o.types.find((t) => t.id === o.typeId);
  if (!type) throw new StoreError(`There's no plumbing type "${o.typeId}".`);
  const project = await readProjectFile(o.dir);
  const { values: items } = await readItems(o.dir);
  const p = o.profile;
  return {
    project: { repo: project.repo, id: project.id, title: project.title },
    type: { id: type.id, title: type.title, screen: type.screen, fields: type.fields, answerPresets: type.answerPresets, rules: type.body },
    draft: await readDocText(o.dir, project.docs.draft),
    profile: p
      ? { name: p.name, ...(p.schema ? { schema: p.schema } : {}), conventions: p.conventions, apps: p.apps.map((a) => ({ name: a.name, path: a.path })), planFolders: p.planFolders }
      : null,
    existingItems: items.map((i) => ({ id: i.id, type: i.type, title: i.title })),
  };
}
```

In `packages/core/src/index.ts`, add:
```ts
export * from './store/queue';
export * from './store/context';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/core && pnpm --filter @dev-plumbing/core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): submission queue with requeue, linked groups, and context packs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: The original-vs-draft diff and change previews

Two diff views need data:
- **The Draft's Changes view** marks every change since the original and links each one to the thread that caused it ("changed by").
- **"What changes if you accept"** previews an option's change before you send.

**Files:**
- Create: `packages/core/src/docDiff.ts`
- Modify:
  - `packages/core/src/schemas/views.ts`
  - `packages/core/src/index.ts`
  - `packages/core/package.json` (add `diff`)
- Test: `packages/core/test/docDiff.test.ts`

**Interfaces:**
- Consumes:
  - From Task 3: `Change`, `ItemPatch`, `HistoryEntry` and `applyMdPatches`.
  - `diffLines` from `diff` 9. It returns `{ value, added, removed, count }[]`.
- Produces:
  - **In `schemas/views.ts`:**
    - `type DiffSegment = { kind: 'same' | 'added' | 'removed'; text: string; changedBy?: { changeId: string; threadId: string; summary: string; threadTitle: string }[] }`
    - `type FieldChange = { field: string; before: string; after: string }`
    - `type ChangePreview = { md: DiffSegment[] | null; items: { itemId: string; title: string; changes: FieldChange[] }[]; problem?: string }`
  - **In `docDiff.ts`:**
    - `diffText(before: string, after: string): DiffSegment[]`
    - `diffDocuments(original: string, draft: string, history: HistoryEntry[], threadTitle?: (threadId: string) => string): DiffSegment[]`
    - `previewChange(draft: string, items: Item[], change: Change): ChangePreview`

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @dev-plumbing/core add diff@^9.0.0`
Expected: `packages/core/package.json` lists `"diff": "^9.0.0"`. diff 9 ships its own types.

- [ ] **Step 2: Write the failing tests**

`packages/core/test/docDiff.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { diffDocuments, diffText, previewChange } from '../src/docDiff';
import type { HistoryEntry } from '../src/schemas';
import { pair } from './fixtures';

const original = '# Restock\n\nLog reminders in a table.\n\nSend by SMS.\n';
const draft = '# Restock\n\nLog one row per send.\n\nSend by SMS and email.\n';
const entry = (id: string, replace: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id,
  at: '2026-10-01T10:00:00.000Z',
  threadId: `t-${id}`,
  kind: 'accept',
  summary: `summary ${id}`,
  change: { md: [{ find: 'x', replace }] },
  appliedAt: '2026-10-01T10:00:00.000Z',
  itemsBefore: {},
  itemsAfter: {},
  ...extra,
});

describe('document diffs', () => {
  it('marks added and removed lines', () => {
    const kinds = diffText(original, draft).map((s) => s.kind);
    expect(kinds).toContain('added');
    expect(kinds).toContain('removed');
    expect(diffText(original, original)).toEqual([{ kind: 'same', text: original }]);
  });

  it('links each added part to the change that wrote it, ignoring undone changes', () => {
    const segments = diffDocuments(original, draft, [
      entry('c1', 'Log one row per send.'),
      entry('c2', 'Send by SMS and email.', { undoneAt: '2026-10-01T11:00:00.000Z' }),
      entry('c3', 'Send by SMS and email.'),
    ], (threadId) => `Title of ${threadId}`);
    const added = segments.filter((s) => s.kind === 'added');
    expect(added.find((s) => s.text.includes('one row per send'))?.changedBy).toEqual([{ changeId: 'c1', threadId: 't-c1', summary: 'summary c1', threadTitle: 'Title of t-c1' }]);
    expect(added.find((s) => s.text.includes('and email'))?.changedBy?.map((c) => c.changeId)).toEqual(['c3']);
  });
});

describe('change previews', () => {
  it('shows the draft diff and item field changes', () => {
    const { item } = pair('q1', { fields: { default: '5 days' } });
    const preview = previewChange(original, [item], {
      md: [{ find: 'Send by SMS.', replace: 'Send by SMS and email.' }],
      items: [{ itemId: 'q1', patch: { summary: 'Both channels.', fields: { default: '3 days' } } }],
    });
    expect(preview.problem).toBeUndefined();
    expect(preview.md?.filter((s) => s.kind !== 'same').map((s) => [s.kind, s.text])).toEqual([
      ['removed', 'Send by SMS.\n'],
      ['added', 'Send by SMS and email.\n'],
    ]);
    expect(preview.items).toEqual([
      { itemId: 'q1', title: 'Question q1', changes: [{ field: 'summary', before: 'A summary.', after: 'Both channels.' }, { field: 'default', before: '5 days', after: '3 days' }] },
    ]);
  });

  it("says when a change doesn't fit", () => {
    expect(previewChange(original, [], { md: [{ find: 'nope', replace: 'x' }], items: [{ itemId: 'ghost', patch: { title: 't' } }] })).toEqual({
      md: null,
      items: [],
      problem: expect.stringMatching(/isn't in the draft.*no item "ghost"/s),
    });
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm vitest run packages/core/test/docDiff.test.ts`
Expected: FAIL, because `../src/docDiff` is missing.

- [ ] **Step 4: Write the diff module**

In `packages/core/src/schemas/views.ts`, add:
```ts
export type DiffSegment = {
  kind: 'same' | 'added' | 'removed';
  text: string;
  changedBy?: { changeId: string; threadId: string; summary: string; threadTitle: string }[];
};
export type FieldChange = { field: string; before: string; after: string };
export type ChangePreview = { md: DiffSegment[] | null; items: { itemId: string; title: string; changes: FieldChange[] }[]; problem?: string };
```

`packages/core/src/docDiff.ts`:
```ts
import { diffLines } from 'diff';
import { applyMdPatches, type Change, type ChangePreview, type DiffSegment, type FieldChange, type HistoryEntry, type Item, type ItemPatch } from './schemas';

export function diffText(before: string, after: string): DiffSegment[] {
  return diffLines(before, after).map((c) => ({ kind: c.added ? 'added' : c.removed ? 'removed' : 'same', text: c.value }));
}

/**
 * The draft against the original. Each added part names the applied (not undone) changes whose
 * replacement text it contains, or that contain it.
 */
export function diffDocuments(original: string, draft: string, history: HistoryEntry[], threadTitle: (threadId: string) => string = (id) => id): DiffSegment[] {
  const live = history.filter((h) => h.appliedAt && !h.undoneAt);
  return diffText(original, draft).map((segment) => {
    const text = segment.text.trim();
    if (segment.kind !== 'added' || !text) return segment;
    const by = live.filter((h) =>
      h.change.md?.some((p) => {
        const replaced = p.replace.trim();
        return replaced.length > 0 && (text.includes(replaced) || replaced.includes(text));
      }),
    );
    return by.length ? { ...segment, changedBy: by.map((h) => ({ changeId: h.id, threadId: h.threadId, summary: h.summary, threadTitle: threadTitle(h.threadId) })) } : segment;
  });
}

function fieldChanges(item: Item, patch: ItemPatch): FieldChange[] {
  const out: FieldChange[] = [];
  for (const key of ['title', 'summary', 'body'] as const) {
    const after = patch[key];
    if (after !== undefined && after !== item[key]) out.push({ field: key, before: item[key] ?? '', after });
  }
  for (const [field, after] of Object.entries(patch.fields ?? {})) {
    if (item.fields?.[field] !== after) out.push({ field, before: item.fields?.[field] ?? '', after });
  }
  for (const key of ['links', 'codeRefs', 'mdAnchor', 'data'] as const) if (patch[key] !== undefined) out.push({ field: key, before: '', after: 'updated' });
  return out;
}

/** What accepting a change would do: the draft diff, and each item's changed fields. */
export function previewChange(draft: string, items: Item[], change: Change): ChangePreview {
  const problems: string[] = [];
  let md: DiffSegment[] | null = null;
  if (change.md?.length) {
    const r = applyMdPatches(draft, change.md);
    if (r.ok) md = diffText(draft, r.text);
    else problems.push(r.error);
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const itemChanges: ChangePreview['items'] = [];
  for (const c of change.items ?? []) {
    const item = byId.get(c.itemId);
    if (!item) problems.push(`There's no item "${c.itemId}".`);
    else itemChanges.push({ itemId: item.id, title: item.title, changes: fieldChanges(item, c.patch) });
  }
  return { md, items: itemChanges, ...(problems.length ? { problem: problems.join(' ') } : {}) };
}
```

In `packages/core/src/index.ts`, add `export * from './docDiff';`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/core && pnpm --filter @dev-plumbing/core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): original-vs-draft diff with changed-by links, and change previews" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: Service runtime: locks, live events and listening windows

The service gains three things that live in memory:
- **A per-project lock.** Every write goes through it, so two writes to one plumbing project never interleave.
- **An event bus.** It is streamed to the browser over SSE.
- **A registry of Claude windows.** It knows which are listening or busy, and when one has gone quiet.

The project routes report **Claude listening**.

**Files:**
- Create in `packages/service/src/`:
  - `lock.ts`
  - `events.ts`
  - `listeners.ts`
  - `runtime.ts`
  - `errors.ts`
  - `locate.ts`
  - `routes/events.ts`
- Modify:
  - `packages/service/src/app.ts`
  - `packages/service/src/index.ts`
  - `packages/service/src/routes/projects.ts`
  - `packages/service/src/routes/config.ts`
  - `packages/core/src/schemas/views.ts`
- Test:
  - `packages/service/test/runtime.test.ts`
  - `packages/service/test/events.test.ts`
  - `packages/service/test/projects.test.ts`

**Interfaces:**
- Consumes:
  - From Task 4: `InputError`, `StoreError` and `ConflictError`.
  - From Plan 1: `ProjectUnreadableError`, `findProjects`, `discoverProjects` (Task 2) and `loadConfig`.
- Produces:
  - **Core `schemas/views.ts`:**
    - `type ListeningState = 'waiting' | 'busy' | null`
    - `type LiveEvent = { type: 'project'; repo: string; id: string } | { type: 'projects' } | { type: 'config' }`
    - `ProjectSummary` gains `listening?: ListeningState`
    - `ProjectHome` gains `listening?: ListeningState`
  - **`lock.ts`:**
    - `createLocks()` returns `withLock<T>(key: string, fn: () => Promise<T>): Promise<T>`
    - `type WithLock`
  - **`events.ts`:** `class LiveEvents`, with:
    - `emit(e)`
    - `on(fn): () => void`
    - `projectChanged(repo, id)`, which emits `project` and `projects`
  - **`listeners.ts`:** `class Listeners`, constructed with `new Listeners({ now?, aliveMs?, onChange? })`, with:
    - `seen(windowId, key?)`
    - `isAlive(windowId)`
    - `state(key): ListeningState`
    - `setBusy(windowId, busy)`
    - `wait(windowId, key, ms, signal?): Promise<'notified' | 'timeout' | 'aborted'>`
    - `notify(key)`
    - `sweep()`
  - **`runtime.ts`:**
    - `type Runtime = { events; listeners; withLock; pingMs }`
    - `createRuntime(o?: { now?: () => number; aliveMs?: number; pingMs?: number }): Runtime`
    - `projectKey(repo, id) => \`${repo}/${id}\``
  - **`errors.ts`:**
    - `errorResponse(c, e)`. It maps `InputError` to 400, `ConflictError` to 409, `StoreError` to 404 and `ProjectUnreadableError` to 422.
    - `handle(fn)`, which wraps a route handler with `errorResponse`.
  - **`locate.ts`:** `locateProject(ctx, repo, id): Promise<{ cfg: LoadedConfig; ref: ProjectRef }>`. It throws `StoreError("That plumbing project doesn't exist.")`.
  - **`createApp(ctx, rt = createRuntime())`.** Later tasks mount their routes with the same `rt`.
  - **`GET /api/events`.** It streams SSE: one `{"type":"hello"}`, then every `LiveEvent`, with a `ping` every `rt.pingMs`.
  - **Route factories:** `projectRoutes(ctx, rt)` and `configRoutes(ctx, rt)`. Config writes emit `{ type: 'config' }`.

- [ ] **Step 1: Write the failing tests**

`packages/service/test/runtime.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Listeners } from '../src/listeners';
import { createLocks } from '../src/lock';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('locks', () => {
  it('runs work for one key in order, and other keys alongside', async () => {
    const withLock = createLocks();
    const log: string[] = [];
    const job = (name: string, ms: number) => async () => {
      log.push(`start ${name}`);
      await sleep(ms);
      log.push(`end ${name}`);
      return name;
    };
    const results = await Promise.all([withLock('a', job('a1', 30)), withLock('a', job('a2', 1)), withLock('b', job('b1', 1))]);
    expect(results).toEqual(['a1', 'a2', 'b1']);
    expect(log.indexOf('end a1')).toBeLessThan(log.indexOf('start a2'));
    expect(log.indexOf('start b1')).toBeLessThan(log.indexOf('end a1'));
  });

  it('keeps going after a failure', async () => {
    const withLock = createLocks();
    await expect(withLock('a', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await withLock('a', async () => 'ok')).toBe('ok');
  });
});

describe('listening windows', () => {
  it('a window is listening, then busy, then gone when it goes quiet', () => {
    let t = 0;
    const changes: string[] = [];
    const l = new Listeners({ now: () => t, aliveMs: 90_000, onChange: (k) => changes.push(k) });
    expect(l.state('acme/x')).toBeNull();
    l.seen('w1', 'acme/x');
    expect(l.state('acme/x')).toBe('waiting');
    l.setBusy('w1', true);
    expect(l.state('acme/x')).toBe('busy');
    t = 100_000;
    l.sweep();
    expect(l.state('acme/x')).toBeNull();
    expect(l.isAlive('w1')).toBe(false);
    expect(changes).toEqual(['acme/x', 'acme/x', 'acme/x']);
  });

  it('wakes a waiting window when work arrives, and times out otherwise', async () => {
    const l = new Listeners();
    const woken = l.wait('w1', 'acme/x', 5_000);
    l.notify('acme/x');
    expect(await woken).toBe('notified');
    expect(await l.wait('w1', 'acme/x', 10)).toBe('timeout');
    const ac = new AbortController();
    const stopped = l.wait('w1', 'acme/x', 5_000, ac.signal);
    ac.abort();
    expect(await stopped).toBe('aborted');
  });

  it('a window inside a wait never counts as gone', async () => {
    let t = 0;
    const l = new Listeners({ now: () => t, aliveMs: 90_000 });
    const waiting = l.wait('w1', 'acme/x', 50);
    t = 10_000_000;
    expect(l.isAlive('w1')).toBe(true);
    expect(l.state('acme/x')).toBe('waiting');
    await waiting;
  });
});
```

`packages/service/test/events.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

describe('live events', () => {
  it('streams changes to the browser', async () => {
    const { ctx } = await makeContext();
    const rt = createRuntime({ pingMs: 20 });
    const res = await call(createApp(ctx, rt), '/api/events');
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let seen = '';
    const until = async (pattern: RegExp) => {
      while (!pattern.test(seen)) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += decoder.decode(value);
      }
      return pattern.test(seen);
    };
    expect(await until(/"type":"hello"/)).toBe(true);
    rt.events.projectChanged('acme', 'restock-reminders');
    expect(await until(/"type":"project","repo":"acme","id":"restock-reminders"/)).toBe(true);
    expect(await until(/event: ping/)).toBe(true);
    await reader.cancel();
  });
});
```

Add to `packages/service/test/projects.test.ts` (import `createRuntime` from `../src/runtime`):
```ts
it('says when a Claude window is listening', async () => {
  const { ctx } = await makeContext();
  const rt = createRuntime();
  const app = createApp(ctx, rt);
  rt.listeners.seen('w-1', 'acme/restock-reminders');
  const list = (await (await call(app, '/api/projects?tab=all')).json()) as { items: { id: string; listening: string | null }[] };
  expect(list.items.find((p) => p.id === 'restock-reminders')?.listening).toBe('waiting');
  expect(list.items.find((p) => p.id === 'onboarding-emails')?.listening).toBeNull();
  const home = (await (await call(app, '/api/projects/acme/restock-reminders')).json()) as { listening: string | null };
  expect(home.listening).toBe('waiting');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/service`
Expected: FAIL, because `../src/listeners`, `../src/lock` and `../src/runtime` are missing.

- [ ] **Step 3: Add the shared types to core**

In `packages/core/src/schemas/views.ts`:
- Add:
```ts
/** A Claude window for this project: waiting for a submission, busy answering one, or none. */
export type ListeningState = 'waiting' | 'busy' | null;
export type LiveEvent = { type: 'project'; repo: string; id: string } | { type: 'projects' } | { type: 'config' };
```
- Add `listening?: ListeningState;` to `ProjectSummary` and to `ProjectHome`.

- [ ] **Step 4: Write the lock, events and listeners**

`packages/service/src/lock.ts`:
```ts
/** Runs work for the same key one at a time, in arrival order. Different keys run in parallel. */
export function createLocks() {
  const tails = new Map<string, Promise<unknown>>();
  return function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    const run = previous.then(() => fn());
    const tail = run.catch(() => undefined);
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return run;
  };
}
export type WithLock = ReturnType<typeof createLocks>;
```

`packages/service/src/events.ts`:
```ts
import { EventEmitter } from 'node:events';
import type { LiveEvent } from '@dev-plumbing/core';

export class LiveEvents {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emit(event: LiveEvent): void {
    this.emitter.emit('event', event);
  }

  on(listener: (event: LiveEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  /** Tells every open tab that this plumbing project, and so the project list, changed. */
  projectChanged(repo: string, id: string): void {
    this.emit({ type: 'project', repo, id });
    this.emit({ type: 'projects' });
  }
}
```

`packages/service/src/listeners.ts`:
```ts
import type { ListeningState } from '@dev-plumbing/core';

type Window = { key: string; lastSeen: number; waits: number; busy: boolean };

/**
 * The Claude windows working on each plumbing project (key = "repo/id").
 * - A window is alive while it's inside a wait, or for `aliveMs` after it was last seen. The MCP server pings every 30 s.
 * - A project is "waiting" if a live window is listening, "busy" if a live window is answering a submission, otherwise null.
 */
export class Listeners {
  private readonly windows = new Map<string, Window>();
  private readonly waiters = new Map<string, Set<() => void>>();
  private readonly lastStates = new Map<string, ListeningState>();

  constructor(private readonly o: { now?: () => number; aliveMs?: number; onChange?: (key: string) => void } = {}) {}

  private now(): number {
    return this.o.now?.() ?? Date.now();
  }

  /** Reports state changes for these keys (and only real changes). */
  private check(...keys: string[]): void {
    for (const key of new Set(keys)) {
      const state = this.state(key);
      if ((this.lastStates.get(key) ?? null) !== state) {
        this.lastStates.set(key, state);
        this.o.onChange?.(key);
      }
    }
  }

  /** The window is alive. With a key, it is now working on that project. */
  seen(windowId: string, key?: string): void {
    const w = this.windows.get(windowId);
    const nextKey = key ?? w?.key;
    if (!nextKey) return;
    this.windows.set(windowId, { key: nextKey, lastSeen: this.now(), waits: w?.waits ?? 0, busy: w?.busy ?? false });
    this.check(nextKey, ...(w && w.key !== nextKey ? [w.key] : []));
  }

  isAlive(windowId: string): boolean {
    const w = this.windows.get(windowId);
    return Boolean(w && (w.waits > 0 || this.now() - w.lastSeen < (this.o.aliveMs ?? 90_000)));
  }

  state(key: string): ListeningState {
    let waiting = false;
    let busy = false;
    for (const [id, w] of this.windows) {
      if (w.key !== key || !this.isAlive(id)) continue;
      if (w.busy) busy = true;
      else waiting = true;
    }
    return waiting ? 'waiting' : busy ? 'busy' : null;
  }

  setBusy(windowId: string, busy: boolean): void {
    const w = this.windows.get(windowId);
    if (!w) return;
    w.busy = busy;
    w.lastSeen = this.now();
    this.check(w.key);
  }

  /** Waits until notify(key), the timeout, or the request goes away. */
  async wait(windowId: string, key: string, ms: number, signal?: AbortSignal): Promise<'notified' | 'timeout' | 'aborted'> {
    this.seen(windowId, key);
    const w = this.windows.get(windowId)!;
    w.waits++;
    try {
      return await new Promise((resolve) => {
        const set = this.waiters.get(key) ?? new Set<() => void>();
        this.waiters.set(key, set);
        const finish = (outcome: 'notified' | 'timeout' | 'aborted') => {
          clearTimeout(timer);
          set.delete(wake);
          signal?.removeEventListener('abort', abort);
          resolve(outcome);
        };
        const wake = () => finish('notified');
        const abort = () => finish('aborted');
        const timer = setTimeout(() => finish('timeout'), ms);
        set.add(wake);
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort);
      });
    } finally {
      w.waits--;
      w.lastSeen = this.now();
      this.check(w.key);
    }
  }

  notify(key: string): void {
    for (const wake of [...(this.waiters.get(key) ?? [])]) wake();
  }

  /** Re-checks every project, so a window that went quiet stops showing as listening. */
  sweep(): void {
    this.check(...new Set([...this.windows.values()].map((w) => w.key)));
  }
}
```

`packages/service/src/runtime.ts`:
```ts
import { LiveEvents } from './events';
import { Listeners } from './listeners';
import { createLocks, type WithLock } from './lock';

export type Runtime = { events: LiveEvents; listeners: Listeners; withLock: WithLock; pingMs: number };

export const projectKey = (repo: string, id: string) => `${repo}/${id}`;

export function createRuntime(o: { now?: () => number; aliveMs?: number; pingMs?: number } = {}): Runtime {
  const events = new LiveEvents();
  const listeners = new Listeners({
    now: o.now,
    aliveMs: o.aliveMs,
    onChange: (key) => {
      const slash = key.indexOf('/');
      events.projectChanged(key.slice(0, slash), key.slice(slash + 1));
    },
  });
  return { events, listeners, withLock: createLocks(), pingMs: o.pingMs ?? 25_000 };
}
```

`packages/service/src/errors.ts`:
```ts
import type { Context } from 'hono';
import { ConflictError, InputError, ProjectUnreadableError, StoreError } from '@dev-plumbing/core';

export function errorResponse(c: Context, e: unknown): Response {
  if (e instanceof InputError) return c.json({ error: e.message }, 400);
  if (e instanceof ConflictError) return c.json({ error: e.message }, 409);
  if (e instanceof StoreError) return c.json({ error: e.message }, 404);
  if (e instanceof ProjectUnreadableError) return c.json({ error: e.message }, 422);
  throw e;
}

/** Wraps a route handler so the core's errors become readable JSON responses. */
export const handle =
  (fn: (c: Context) => Promise<Response>) =>
  async (c: Context): Promise<Response> => {
    try {
      return await fn(c);
    } catch (e) {
      return errorResponse(c, e);
    }
  };
```

`packages/service/src/locate.ts`:
```ts
import { findProjects, loadConfig, StoreError, type LoadedConfig, type ProjectRef } from '@dev-plumbing/core';
import type { AppContext } from './context';

export async function locateProject(ctx: AppContext, repo: string, id: string): Promise<{ cfg: LoadedConfig; ref: ProjectRef }> {
  const cfg = await loadConfig(ctx.configDir);
  const ref = (await findProjects(cfg.settings, cfg.repos, ctx.home)).find((r) => r.repo === repo && r.id === id);
  if (!ref) throw new StoreError("That plumbing project doesn't exist.");
  return { cfg, ref };
}
```

`packages/service/src/routes/events.ts`:
```ts
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Runtime } from '../runtime';

/** GET /api/events: live updates for the browser, as server-sent events. */
export function eventRoutes(rt: Runtime): Hono {
  const r = new Hono();
  r.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const off = rt.events.on((event) => {
        void stream.writeSSE({ data: JSON.stringify(event) });
      });
      stream.onAbort(off);
      await stream.writeSSE({ data: JSON.stringify({ type: 'hello' }) });
      while (!stream.aborted) {
        await stream.sleep(rt.pingMs);
        if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: '' });
      }
      off();
    }),
  );
  return r;
}
```

- [ ] **Step 5: Wire the runtime into the app and the routes**

`packages/service/src/app.ts`:
```ts
import { Hono } from 'hono';
import type { AppContext } from './context';
import { configRoutes } from './routes/config';
import { eventRoutes } from './routes/events';
import { projectRoutes } from './routes/projects';
import { createRuntime, type Runtime } from './runtime';
import { frameHeaders, guard } from './security';
import { staticHandler } from './static';

export function createApp(ctx: AppContext, rt: Runtime = createRuntime()): Hono {
  const app = new Hono();
  app.use('*', frameHeaders());
  app.use('*', guard({ port: ctx.port, token: ctx.token, extraOrigins: ctx.extraOrigins }));
  app.get('/api/health', (c) => c.json({ ok: true, version: ctx.version, pid: process.pid }));
  app.route('/api', eventRoutes(rt));
  app.route('/api', projectRoutes(ctx, rt));
  app.route('/api', configRoutes(ctx, rt));
  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
  app.get('*', staticHandler(ctx.webDist));
  return app;
}
```

In `packages/service/src/index.ts`:
- Import `createRuntime` from `./runtime`.
- Create `const rt = createRuntime();` before `createApp`, and pass it as the second argument.
- After `writeRunFile(...)`, add:
```ts
  // Quiet windows stop showing as "Claude listening" even when nothing else happens.
  setInterval(() => rt.listeners.sweep(), 15_000).unref();
```

In `packages/service/src/routes/projects.ts`:
- Change the signature to `projectRoutes(ctx: AppContext, rt: Runtime)`.
- Delete the local `locate` helper and the `notFound` constant.
- Import `handle` from `../errors`, `locateProject` from `../locate`, and `projectKey`, `type Runtime` from `../runtime`.
- Rewrite the four GET routes as below. In `POST /open`, wrap the handler in `handle(...)` and call `locateProject` instead of `locate`. An unknown project then becomes the 404 that `handle` gives, not a crash. Keep the rest of `/open` as it is.
```ts
  r.get('/projects', handle(async (c) => {
    const cfg = await loadConfig(ctx.configDir);
    const { refs, problems } = await discoverProjects(cfg.settings, cfg.repos, ctx.home);
    const tab = TABS.find((t) => t === c.req.query('tab')) ?? 'active';
    const list = await listProjectSummaries(refs, {
      q: c.req.query('q') ?? '',
      tab,
      offset: clampInt(c.req.query('offset'), 0, 1_000_000, 0),
      limit: clampInt(c.req.query('limit'), 1, 200, cfg.settings.homePageSize),
    });
    const items = list.items.map((s) => ({ ...s, listening: rt.listeners.state(projectKey(s.repo, s.id)) }));
    return c.json({ items, total: list.total, problems });
  }));

  r.get('/projects/:repo/:id', handle(async (c) => {
    const { cfg, ref } = await locateProject(ctx, c.req.param('repo'), c.req.param('id'));
    const home = await loadProjectHome(ref, cfg.types);
    return c.json({ ...home, listening: rt.listeners.state(projectKey(ref.repo, ref.id)) });
  }));

  r.get('/projects/:repo/:id/types/:type', handle(async (c) => {
    const { cfg, ref } = await locateProject(ctx, c.req.param('repo'), c.req.param('id'));
    const result = await loadTypeItems(ref, cfg.types, c.req.param('type'));
    return result ? c.json(result) : c.json({ error: "That plumbing type doesn't exist or is turned off." }, 404);
  }));

  r.get('/projects/:repo/:id/docs/:which', handle(async (c) => {
    const which = DOCS.find((d) => d === c.req.param('which'));
    if (!which) return c.json({ error: 'Unknown document.' }, 404);
    const { ref } = await locateProject(ctx, c.req.param('repo'), c.req.param('id'));
    try {
      return c.json({ text: await readProjectDocument(ref, which) });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 422);
    }
  }));
```

In `packages/service/src/routes/config.ts`:
- Change the signature to `configRoutes(ctx: AppContext, rt: Runtime)`, and import `type Runtime` from `../runtime`.
- Add `const changed = () => rt.events.emit({ type: 'config' });` at the top of the function.
- Call `changed()` just before each successful response of these handlers:
  - `PUT /settings`
  - `PUT /agents`
  - `PUT /repos/:name`
  - `POST /rules`
  - the `PUT /rules/:file` and `PUT /outputs/:file` loop handler
  - `POST /reset` (both success returns)

  Don't add a middleware for this. A `r.use('*')` in a sub-app mounted at `/api` would run for every `/api` request.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/service && pnpm typecheck`
Expected: PASS, including every Plan 1 service test.

- [ ] **Step 7: Commit**

```bash
git add packages/core packages/service
git commit -m "feat(service): per-project locks, live events over SSE, and listening Claude windows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: Service routes for Claude

These are the HTTP routes behind the MCP tools. They live under `/api/claude/` and are called with the run-file token:

| Route | What it does |
|---|---|
| `open` | Creates or reopens a plumbing project |
| `repo-profile` | Reads or saves a repo profile |
| `items` | Takes an importer batch |
| `wait` | Long-polls for the next submission |
| `alive` | Window pings |
| `context` | Returns a context pack |
| `reply` | Takes a thread reply |

**Files:**
- Create: `packages/service/src/routes/claude.ts`
- Modify: `packages/service/src/app.ts` (mount it)
- Test: `packages/service/test/claude.test.ts`

**Interfaces:**
- Consumes: Tasks 4–9 (core) and Task 11 (`Runtime`, `handle`, `locateProject`, `projectKey`).
- Produces: every route takes and returns JSON. Errors come back as `{ error }` with 400, 404 or 409.
  - **`POST /api/claude/open`**
    - Body: `{ cwd, plan?, project?, windowId? }`
    - Returns one of:
      - `{ kind: 'needs-profile', remote, clone, suggestedName, model, next }`
      - `{ kind: 'pick-project', repo, projects: { id, title, sourcePath, waiting, status }[], next }`
      - `{ kind: 'created' | 'reopened', repo, project, title, url, importTypes: { id, title }[], models, maxParallel, waitingSubmissions, next }`
  - **`POST /api/claude/repo-profile`**
    - Body: `{ cwd, profile? }`
    - Without `profile`: `{ kind: 'existing', profile }` or `{ kind: 'missing', remote, clone, suggestedName }`.
    - With `profile`: saves it and returns `{ saved: 'repos/<name>.json', profile }`.
  - **`POST /api/claude/items`**
    - Body: `{ repo, project, type, cwd?, items? | noChanges? }`
    - Returns `{ saved, itemIds, importFinished }`.
  - **`POST /api/claude/wait`**
    - Body: `{ repo, project, windowId, timeoutSeconds?, finished?: { submission, conflicts? } }`
    - Returns `{ kind: 'submission', submission, groups: { threads, titles, model }[], maxParallel, decisions }` or `{ kind: 'timeout' }`.
    - The long-poll is at most `MAX_POLL_SECONDS` (240).
  - **`POST /api/claude/alive`**: body `{ windowId }`, returns `{ ok: true }`.
  - **`POST /api/claude/context`**
    - Body: `{ repo, project, threadId? | importType? }`
    - Returns a `ThreadPack` or an `ImportPack`.
  - **`POST /api/claude/reply`**
    - Body: `{ repo, project, cwd?, ...ReplyInput }`
    - Returns `{ ok: true, messageId, appliedEdits, pendingEdits, newThreads }`.

- [ ] **Step 1: Write the failing tests**

`packages/service/test/claude.test.ts`:
```ts
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig, readProjectFile, readThread, saveDraft, submit, writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { makeRepo } from '../../core/test/fixtures';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const PLAN = 'docs/specs/restock-reminders.md';

async function setup(o: { now?: () => number } = {}) {
  const s = await makeContext();
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
  await writeJsonAtomic(path.join(s.ctx.configDir, 'repos', 'acme-app.json'), { name: 'acme-app', match: ['github.com/acme/acme-app'] });
  const rt = createRuntime({ now: o.now });
  const app = createApp(s.ctx, rt);
  const claude = async (route: string, body: unknown): Promise<{ status: number; body: Json }> => {
    const res = await call(app, `/api/claude${route}`, { method: 'POST', body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { ...s, repo, rt, app, claude };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** Opens the fixture plan. Questions gets three items ("who" links to "when"); every other type says "no changes". */
async function imported(t: Setup) {
  const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
  for (const type of open.body.importTypes as { id: string }[]) {
    const batch =
      type.id === 'questions'
        ? {
            items: [
              { key: 'who', title: 'Who gets reminders?', summary: 'Everyone or some?', links: ['when'], message: { text: 'Who first?', options: [{ id: 'all', label: 'Everyone' }, { id: 'some', label: 'Active subscribers' }] } },
              { key: 'when', title: 'How early?', summary: 'Days before.', message: { text: 'How many days?' } },
              { key: 'sender', title: 'Which sender?', summary: 'The SMS number.', message: { text: 'Which number?' } },
            ],
          }
        : { noChanges: 'Nothing for this type.' };
    const r = await t.claude('/items', { repo: open.body.repo, project: open.body.project, type: type.id, cwd: t.repo, ...batch });
    expect(r.status).toBe(200);
  }
  return { repo: open.body.repo as string, project: open.body.project as string, dir: path.join(t.root, 'acme-app', open.body.project as string) };
}

/** Types an answer into each thread and presses Submit all, the way the browser would. */
async function answer(t: Setup, dir: string, threadIds: string[]) {
  const cfg = await loadConfig(t.ctx.configDir);
  for (const id of threadIds) await saveDraft(dir, id, { text: `Answer for ${id}` });
  await submit(dir, { scope: 'all', types: cfg.types });
  t.rt.listeners.notify('acme-app/restock-reminders');
}

describe('opening a plan', () => {
  it('asks for a repo profile the first time a repo is seen', async () => {
    const t = await setup();
    const other = makeRepo({ remote: 'https://github.com/acme/new-thing.git' });
    const r = await t.claude('/open', { cwd: other, plan: PLAN });
    expect(r.body).toMatchObject({ kind: 'needs-profile', remote: 'github.com/acme/new-thing', suggestedName: 'new-thing', clone: other });
  });

  it('saves a detected repo profile once, and never overwrites one', async () => {
    const t = await setup();
    const other = makeRepo({ remote: 'https://github.com/acme/new-thing.git' });
    expect((await t.claude('/repo-profile', { cwd: other })).body).toMatchObject({ kind: 'missing', suggestedName: 'new-thing' });
    const profile = { name: 'new-thing', match: ['github.com/acme/new-thing'], conventions: ['Ids use uuid()'] };
    expect((await t.claude('/repo-profile', { cwd: other, profile })).body.saved).toBe('repos/new-thing.json');
    expect((await t.claude('/repo-profile', { cwd: other })).body).toMatchObject({ kind: 'existing', profile: { name: 'new-thing' } });
    expect((await t.claude('/repo-profile', { cwd: other, profile })).status).toBe(400);
    const third = makeRepo({ remote: 'git@github.com:acme/third.git' });
    const wrong = await t.claude('/repo-profile', { cwd: third, profile: { name: 'third', match: ['github.com/acme/elsewhere'] } });
    expect(wrong.body.error).toMatch(/match must include github.com\/acme\/third/);
  });

  it('creates a plumbing project, then reopens it from the plan or by id, and lists them', async () => {
    const t = await setup();
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN });
    expect(open.body).toMatchObject({
      kind: 'created',
      repo: 'acme-app',
      project: 'restock-reminders',
      title: 'Restock reminders',
      url: 'http://localhost:4545/p/acme-app/restock-reminders',
      maxParallel: 4,
      models: { importer: 'sonnet', thread: 'sonnet' },
    });
    expect(open.body.importTypes).toHaveLength(10);
    expect((await t.claude('/open', { cwd: path.join(t.repo, 'docs'), plan: 'specs/restock-reminders.md' })).body.kind).toBe('reopened');
    expect((await t.claude('/open', { cwd: t.repo, project: 'restock-reminders' })).body.kind).toBe('reopened');
    expect((await t.claude('/open', { cwd: t.repo })).body).toMatchObject({ kind: 'pick-project', repo: 'acme-app', projects: [expect.objectContaining({ id: 'restock-reminders' })] });
  });

  it("explains what it can't use", async () => {
    const t = await setup();
    expect((await t.claude('/open', { cwd: t.repo, plan: '../outside.md' })).body.error).toMatch(/inside the repo/);
    expect((await t.claude('/open', { cwd: makeRepo({ remote: null }), plan: PLAN })).body.error).toMatch(/no git remote/);
    expect((await t.claude('/open', { cwd: t.root, plan: PLAN })).status).toBe(400);
    expect((await t.claude('/open', { cwd: t.repo, project: 'nope' })).body.error).toMatch(/no plumbing project "nope"/);
  });
});

describe('importing', () => {
  it('imports items, and opens the browser when the last type is in', async () => {
    const t = await setup();
    await imported(t);
    expect(t.opened).toEqual(['http://localhost:4545/p/acme-app/restock-reminders']);
    const home = (await (await call(t.app, '/api/projects/acme-app/restock-reminders')).json()) as Json;
    expect(home.project.status).toBe('active');
    expect(home.types.find((x: Json) => x.id === 'questions').itemCount).toBe(3);
  });

  it('refuses a bad batch and says why', async () => {
    const t = await setup();
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN });
    const r = await t.claude('/items', { repo: 'acme-app', project: open.body.project, type: 'questions', items: [{ key: 'a', title: 'A', summary: 'a' }, { key: 'a', title: 'B', summary: 'b' }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Nothing was saved[\s\S]*key is used twice/);
  });

  it("finishes the import when the window starts listening, even if an importer never wrote", async () => {
    const t = await setup();
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN });
    await t.claude('/items', { repo: 'acme-app', project: open.body.project, type: 'questions', noChanges: 'None.' });
    await t.claude('/wait', { repo: 'acme-app', project: open.body.project, windowId: 'w-a', timeoutSeconds: 0 });
    const project = await readProjectFile(path.join(t.root, 'acme-app', 'restock-reminders'));
    expect(project.status).toBe('active');
    expect(project.emptyTypes.filter((e) => /didn't finish/.test(e.reason))).toHaveLength(9);
    expect(t.opened).toHaveLength(1);
  });
});

describe('listening', () => {
  it('queued submissions are picked up oldest first, once', async () => {
    const t = await setup();
    const p = await imported(t);
    await answer(t, p.dir, ['t-questions-when']);
    await answer(t, p.dir, ['t-questions-sender']);
    const base = { repo: p.repo, project: p.project, windowId: 'w-a', timeoutSeconds: 0 };
    const first = await t.claude('/wait', base);
    expect(first.body).toMatchObject({ kind: 'submission', groups: [{ threads: ['t-questions-when'], titles: ['How early?'], model: 'sonnet' }], maxParallel: 4 });
    const second = await t.claude('/wait', { ...base, finished: { submission: first.body.submission } });
    expect(second.body.groups[0].threads).toEqual(['t-questions-sender']);
    expect((await t.claude('/wait', { ...base, finished: { submission: second.body.submission } })).body).toEqual({ kind: 'timeout' });
  });

  it('sends linked threads to one subagent', async () => {
    const t = await setup();
    const p = await imported(t);
    await answer(t, p.dir, ['t-questions-who', 't-questions-when', 't-questions-sender']);
    const r = await t.claude('/wait', { repo: p.repo, project: p.project, windowId: 'w-a', timeoutSeconds: 0 });
    expect(r.body.groups.map((g: Json) => g.threads)).toEqual([['t-questions-sender'], ['t-questions-when', 't-questions-who']]);
  });

  it('wakes a waiting window as soon as you submit, and shows it as listening', async () => {
    const t = await setup();
    const p = await imported(t);
    const waiting = t.claude('/wait', { repo: p.repo, project: p.project, windowId: 'w-a', timeoutSeconds: 5 });
    await new Promise((r) => setTimeout(r, 50));
    expect(((await (await call(t.app, '/api/projects/acme-app/restock-reminders')).json()) as Json).listening).toBe('waiting');
    await answer(t, p.dir, ['t-questions-when']);
    expect((await waiting).body.kind).toBe('submission');
  });

  it('a second window picks up what the first one left', async () => {
    let now = Date.parse('2026-10-01T10:00:00Z');
    const t = await setup({ now: () => now });
    const p = await imported(t);
    await answer(t, p.dir, ['t-questions-when', 't-questions-sender']);
    const base = { repo: p.repo, project: p.project, timeoutSeconds: 0 };
    expect((await t.claude('/wait', { ...base, windowId: 'w-a' })).body.kind).toBe('submission');
    await t.claude('/reply', { repo: p.repo, project: p.project, threadId: 't-questions-when', text: 'Three days.' });
    now += 5 * 60_000;
    const b = await t.claude('/wait', { ...base, windowId: 'w-b' });
    expect(b.body.groups.flatMap((g: Json) => g.threads)).toEqual(['t-questions-sender']);
  });

  it('keeps a window alive with pings', async () => {
    let now = Date.parse('2026-10-01T10:00:00Z');
    const t = await setup({ now: () => now });
    await imported(t);
    now += 60_000;
    expect((await t.claude('/alive', { windowId: 'w-a' })).body).toEqual({ ok: true });
    now += 60_000;
    expect(t.rt.listeners.isAlive('w-a')).toBe(true);
  });
});

describe('answering threads', () => {
  it('serves context packs for importers and threads', async () => {
    const t = await setup();
    const p = await imported(t);
    const imp = await t.claude('/context', { repo: p.repo, project: p.project, importType: 'questions' });
    expect(imp.body).toMatchObject({ type: { id: 'questions' }, draft: expect.stringMatching(/^# Restock reminders/) });
    const th = await t.claude('/context', { repo: p.repo, project: p.project, threadId: 't-questions-who' });
    expect(th.body).toMatchObject({ item: { title: 'Who gets reminders?' }, linked: [{ id: 'questions-when' }] });
    expect((await t.claude('/context', { repo: p.repo, project: p.project })).status).toBe(400);
  });

  it('posts a reply, and refuses one for a thread that is not waiting', async () => {
    const t = await setup();
    const p = await imported(t);
    await answer(t, p.dir, ['t-questions-who']);
    await t.claude('/wait', { repo: p.repo, project: p.project, windowId: 'w-a', timeoutSeconds: 0 });
    const ok = await t.claude('/reply', { repo: p.repo, project: p.project, threadId: 't-questions-who', text: 'Active subscribers first.', resolve: { decision: 'Reminders start with active subscribers' } });
    expect(ok.body).toMatchObject({ ok: true, appliedEdits: 0, pendingEdits: 0, newThreads: [] });
    expect((await readThread(p.dir, 't-questions-who')).status).toBe('resolved');
    const again = await t.claude('/reply', { repo: p.repo, project: p.project, threadId: 't-questions-who', text: 'Again.' });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/isn't waiting for Claude/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/service/test/claude.test.ts`
Expected: FAIL, with 404s from `/api/claude/*`.

- [ ] **Step 3: Write the routes**

`packages/service/src/routes/claude.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  activeDecisions,
  expandHome,
  findProjects,
  finishImport,
  finishSubmission,
  finishWindowSubmissions,
  formatZodError,
  gitInfo,
  groupThreads,
  importBatchSchema,
  importPack,
  InputError,
  linkIntoClone,
  loadConfig,
  matchProfile,
  normalizeRemote,
  openPlan,
  pendingSubmissions,
  pickUp,
  postReply,
  readDecisions,
  readItem,
  readProjectFile,
  readThread,
  replySchema,
  repoProfileSchema,
  repoProjectsFolder,
  requeueUnfinished,
  resolvePlan,
  StoreError,
  suggestRepoName,
  summarizeProject,
  threadPack,
  writeImportBatch,
  writeJsonAtomic,
  type LoadedConfig,
  type ProjectRef,
  type Submission,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { EXPECTED_OBJECT, readJsonObject } from '../json';
import { locateProject } from '../locate';
import { projectKey, type Runtime } from '../runtime';

/** Below Node fetch's 300 s headers timeout, so the MCP server's long-poll never trips it. */
export const MAX_POLL_SECONDS = 240;

const projectBody = z.object({ repo: z.string().min(1), project: z.string().min(1) });
const openBody = z.object({ cwd: z.string().min(1), plan: z.string().min(1).optional(), project: z.string().min(1).optional(), windowId: z.string().optional() });
const profileBody = z.object({ cwd: z.string().min(1), profile: z.unknown().optional() });
const itemsBody = importBatchSchema.merge(projectBody).extend({ type: z.string().min(1), cwd: z.string().optional() });
const waitBody = projectBody.extend({
  windowId: z.string().min(1),
  timeoutSeconds: z.number().min(0).max(600).optional(),
  finished: z
    .object({ submission: z.string().min(1), conflicts: z.array(z.object({ threads: z.array(z.string()).min(1), text: z.string().min(1) })).default([]) })
    .optional(),
});
const aliveBody = z.object({ windowId: z.string().min(1) });
const contextBody = projectBody.extend({ threadId: z.string().optional(), importType: z.string().optional() });
const replyBody = replySchema.merge(projectBody).extend({ cwd: z.string().optional() });

async function parse<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  const body = await readJsonObject(c);
  if (!body) throw new InputError(EXPECTED_OBJECT.error);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new InputError(formatZodError(parsed.error));
  return parsed.data;
}

export function claudeRoutes(ctx: AppContext, rt: Runtime): Hono {
  const r = new Hono();
  const urlFor = (repo: string, id: string) => `http://localhost:${ctx.port}/p/${encodeURIComponent(repo)}/${encodeURIComponent(id)}`;
  const openInBrowser = async (cfg: LoadedConfig, ref: ProjectRef) => {
    if (cfg.settings.openBrowserOnImport) await ctx.open(urlFor(ref.repo, ref.id)).catch(() => undefined);
  };
  /** The clone to check code references in: the caller's, or the one the plan was imported from. */
  const cloneFor = async (cwd: string | undefined, ref: ProjectRef) => {
    const info = cwd ? await gitInfo(cwd).catch(() => null) : null;
    return info?.root ?? expandHome((await readProjectFile(ref.dir)).source.clone, ctx.home);
  };
  const changed = (ref: ProjectRef) => rt.events.projectChanged(ref.repo, ref.id);

  r.post(
    '/open',
    handle(async (c) => {
      const body = await parse(c, openBody);
      const cfg = await loadConfig(ctx.configDir);
      const git = await gitInfo(body.cwd);
      if (!git.remote) {
        throw new InputError("This repo has no git remote, so dev-plumbing can't recognise its other clones. Add one (git remote add origin <url>), then run /dev-plumbing again.");
      }
      const models = cfg.agents.models;
      const profile = matchProfile(git.remote, cfg.repos);
      if (!profile) {
        return c.json({
          kind: 'needs-profile',
          remote: normalizeRemote(git.remote),
          clone: git.root,
          suggestedName: suggestRepoName(git.remote, git.root),
          model: models.repoSetup,
          next: `Start the dev-plumbing:repo-setup subagent (model ${models.repoSetup}) with the clone path. When it returns, call dp_open again with the same arguments.`,
        });
      }
      const folder = repoProjectsFolder(cfg.settings, profile, ctx.home);
      if (profile.linkIntoClones.enabled) {
        await linkIntoClone({ clone: git.root, excludeFile: git.excludeFile, folder, linkName: profile.linkIntoClones.linkName }).catch(() => 'blocked');
      }

      if (!body.plan && !body.project) {
        const refs = (await findProjects(cfg.settings, cfg.repos, ctx.home)).filter((x) => x.repo === profile.name);
        const summaries = await Promise.all(refs.map(summarizeProject));
        return c.json({
          kind: 'pick-project',
          repo: profile.name,
          projects: summaries.map((s) => ({ id: s.id, title: s.title, sourcePath: s.sourcePath, waiting: s.counts.yourTurn + s.counts.drafts, status: s.status })),
          next: summaries.length
            ? 'Ask the user which plumbing project to open, then call dp_open with project set to its id.'
            : `There are no plumbing projects for ${profile.name} yet. Tell the user to run /dev-plumbing path/to/plan.md.`,
        });
      }

      let ref: ProjectRef;
      let created = false;
      if (body.project) {
        try {
          ref = (await locateProject(ctx, profile.name, body.project)).ref;
        } catch (e) {
          if (e instanceof StoreError) throw new InputError(`There's no plumbing project "${body.project}" for ${profile.name}. Call dp_open with no arguments to list them.`);
          throw e;
        }
      } else {
        const plan = await resolvePlan({ root: git.root, cwd: body.cwd, plan: body.plan! });
        const enabledTypes = cfg.types.filter((t) => t.enabled).map((t) => t.id);
        const opened = await rt.withLock(`open:${folder}`, () => openPlan({ folder, repo: profile.name, clone: git.root, branch: git.branch, plan, enabledTypes, home: ctx.home }));
        ref = { repo: profile.name, id: opened.id, dir: opened.dir };
        created = opened.created;
      }

      const key = projectKey(ref.repo, ref.id);
      if (body.windowId) rt.listeners.seen(body.windowId, key);
      await rt.withLock(key, () => requeueUnfinished(ref.dir, (w) => rt.listeners.isAlive(w)));
      const project = await readProjectFile(ref.dir);
      const importTypes = cfg.types.filter((t) => project.importPending.includes(t.id)).map((t) => ({ id: t.id, title: t.title }));
      rt.events.emit({ type: 'projects' });
      return c.json({
        kind: created ? 'created' : 'reopened',
        repo: ref.repo,
        project: ref.id,
        title: project.title,
        url: urlFor(ref.repo, ref.id),
        importTypes,
        models,
        maxParallel: cfg.agents.maxParallel,
        waitingSubmissions: (await pendingSubmissions(ref.dir)).length,
        next: importTypes.length
          ? `Start one dev-plumbing:importer subagent per import type (model ${models.importer}, at most ${cfg.agents.maxParallel} at a time). When they have all returned, call dp_wait.`
          : "Call dp_wait to listen for the user's answers.",
      });
    }),
  );

  r.post(
    '/repo-profile',
    handle(async (c) => {
      const body = await parse(c, profileBody);
      const cfg = await loadConfig(ctx.configDir);
      const git = await gitInfo(body.cwd);
      const existing = matchProfile(git.remote, cfg.repos);
      if (body.profile === undefined) {
        return c.json(
          existing
            ? { kind: 'existing', profile: existing }
            : { kind: 'missing', remote: git.remote ? normalizeRemote(git.remote) : null, clone: git.root, suggestedName: suggestRepoName(git.remote, git.root) },
        );
      }
      if (existing) throw new InputError(`This repo already has a repo profile (${existing.name}). Change it in Settings → Repos.`);
      const parsed = repoProfileSchema.safeParse(body.profile);
      if (!parsed.success) throw new InputError(`The profile isn't valid: ${formatZodError(parsed.error)}`);
      const profile = parsed.data;
      const remote = git.remote ? normalizeRemote(git.remote) : '(none)';
      if (!profile.match.some((m) => normalizeRemote(m) === remote)) throw new InputError(`match must include ${remote}, this clone's remote.`);
      const file = path.join(ctx.configDir, 'repos', `${profile.name}.json`);
      if (await fs.access(file).then(() => true, () => false)) throw new InputError(`A repo profile named ${profile.name} already exists. Pick another name.`);
      await writeJsonAtomic(file, profile);
      rt.events.emit({ type: 'config' });
      return c.json({ saved: `repos/${profile.name}.json`, profile });
    }),
  );

  r.post(
    '/items',
    handle(async (c) => {
      const body = await parse(c, itemsBody);
      const { cfg, ref } = await locateProject(ctx, body.repo, body.project);
      const type = cfg.types.find((t) => t.id === body.type && t.enabled);
      if (!type) throw new InputError(`"${body.type}" isn't an enabled plumbing type.`);
      const clone = await cloneFor(body.cwd, ref);
      const result = await rt.withLock(projectKey(ref.repo, ref.id), () =>
        writeImportBatch({ dir: ref.dir, type, batch: { items: body.items, noChanges: body.noChanges }, clone }),
      );
      changed(ref);
      if (result.importFinished) await openInBrowser(cfg, ref);
      return c.json({ saved: result.itemIds.length, itemIds: result.itemIds, importFinished: result.importFinished });
    }),
  );

  async function describeSubmission(ref: ProjectRef, s: Submission, cfg: LoadedConfig) {
    const titleOf = async (threadId: string) => {
      const thread = await readThread(ref.dir, threadId).catch(() => null);
      const item = thread ? await readItem(ref.dir, thread.itemId).catch(() => null) : null;
      return item?.title ?? threadId;
    };
    const groups = await groupThreads(ref.dir, s.sent, cfg.agents.groupLinkedThreads);
    return {
      kind: 'submission' as const,
      submission: s.id,
      groups: await Promise.all(groups.map(async (threads) => ({ threads, titles: await Promise.all(threads.map(titleOf)), model: cfg.agents.models.thread }))),
      maxParallel: cfg.agents.maxParallel,
      decisions: activeDecisions(await readDecisions(ref.dir)).map((d) => d.text),
    };
  }

  r.post(
    '/wait',
    handle(async (c) => {
      const body = await parse(c, waitBody);
      const { cfg, ref } = await locateProject(ctx, body.repo, body.project);
      const key = projectKey(ref.repo, ref.id);
      rt.listeners.seen(body.windowId, key);
      rt.listeners.setBusy(body.windowId, false);
      const importDone = await rt.withLock(key, async () => {
        if (body.finished) await finishSubmission(ref.dir, body.finished.submission, body.finished.conflicts).catch((e) => {
          if (!(e instanceof StoreError)) throw e;
        });
        await finishWindowSubmissions(ref.dir, body.windowId);
        await requeueUnfinished(ref.dir, (w) => w !== body.windowId && rt.listeners.isAlive(w));
        return finishImport(ref.dir);
      });
      changed(ref);
      if (importDone) await openInBrowser(cfg, ref);

      const timeoutMs = Math.min(body.timeoutSeconds ?? cfg.agents.waitHeartbeatSeconds, MAX_POLL_SECONDS) * 1000;
      for (let round = 0; round < 2; round++) {
        const picked = await rt.withLock(key, async () => {
          const next = (await pendingSubmissions(ref.dir))[0];
          return next ? pickUp(ref.dir, next.id, body.windowId) : null;
        });
        if (picked) {
          rt.listeners.setBusy(body.windowId, true);
          changed(ref);
          return c.json(await describeSubmission(ref, picked, cfg));
        }
        if (round === 1 || timeoutMs === 0) break;
        if ((await rt.listeners.wait(body.windowId, key, timeoutMs, c.req.raw.signal)) !== 'notified') break;
      }
      return c.json({ kind: 'timeout' });
    }),
  );

  r.post(
    '/alive',
    handle(async (c) => {
      const body = await parse(c, aliveBody);
      rt.listeners.seen(body.windowId);
      return c.json({ ok: true });
    }),
  );

  r.post(
    '/context',
    handle(async (c) => {
      const body = await parse(c, contextBody);
      const { cfg, ref } = await locateProject(ctx, body.repo, body.project);
      const profile = cfg.repos.find((p) => p.name === ref.repo);
      if (body.threadId) return c.json(await threadPack({ dir: ref.dir, threadId: body.threadId, types: cfg.types, profile }));
      if (body.importType) return c.json(await importPack({ dir: ref.dir, typeId: body.importType, types: cfg.types, profile }));
      throw new InputError('Give threadId (for a thread) or importType (for an importer).');
    }),
  );

  r.post(
    '/reply',
    handle(async (c) => {
      const { repo, project, cwd, ...reply } = await parse(c, replyBody);
      const { cfg, ref } = await locateProject(ctx, repo, project);
      const clone = await cloneFor(cwd, ref);
      const result = await rt.withLock(projectKey(ref.repo, ref.id), () =>
        postReply(ref.dir, { reply, types: cfg.types, autoApply: cfg.settings.autoApplySmallEdits, clone }),
      );
      changed(ref);
      return c.json({
        ok: true,
        messageId: result.messageId,
        appliedEdits: result.edits.filter((e) => e.appliedAt).length,
        pendingEdits: result.edits.filter((e) => !e.appliedAt).length,
        newThreads: result.newThreadIds,
      });
    }),
  );

  return r;
}
```

In `packages/service/src/app.ts`:
- Import `claudeRoutes` from `./routes/claude`.
- Add `app.route('/api/claude', claudeRoutes(ctx, rt));` before the `app.all('/api/*', …)` 404 line.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/service && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/service
git commit -m "feat(service): routes for Claude: open, repo profile, import, wait, context and reply" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 13: Service routes for the browser's threads

These are the browser-facing routes:
- the thread view's data, with previews of each option's change
- autosaving a draft, park and unpark
- Send this thread and Submit all, with a message that says whether a Claude window will see it
- adding your own item
- the Draft's changes, with Undo and Apply

List screens get richer rows, so they can answer inline.

**Files:**
- Create:
  - `packages/core/src/store/detail.ts`
  - `packages/service/src/routes/threads.ts`
- Modify:
  - `packages/core/src/schemas/views.ts` (`ThreadDetail`, `SubmitResponse`, `ChangeEntry`, `ChangesResponse`, richer `TypeItemRow` and `TypeEntry`)
  - `packages/core/src/store/projects.ts` (`loadTypeItems` and `loadProjectHome` fill the new fields)
  - `packages/core/src/index.ts`
  - `packages/service/src/app.ts`
- Test:
  - `packages/core/test/detail.test.ts`
  - `packages/service/test/threads.test.ts`

**Interfaces:**
- Consumes: Tasks 3–11.
- Produces:
  - **New types in core `schemas/views.ts`:**
```ts
export type OpenOptions = { messageId: string; options: Option[]; recommended?: string };
export type ThreadDetail = {
  thread: Thread & { display: DisplayStatus };
  item: Item;
  type: { id: string; title: string; screen: Screen; fields: string[]; answerPresets: string[] };
  open: OpenOptions | null;
  previews: Record<string, ChangePreview>;
  linked: { itemId: string; threadId: string; title: string; typeTitle: string }[];
  refs: Record<string, { title: string; threadId: string; typeTitle: string }>;
  edits: Record<string, { state: ChangeState; summary: string }>;
  decisions: Decision[];
  listening: ListeningState;
};
export type SubmitResponse = { resolved: number; sent: number; skipped: { threadId: string; reason: string }[]; listening: ListeningState; message: string };
export type ChangeEntry = { id: string; at: string; kind: 'small-edit' | 'accept'; summary: string; state: ChangeState; threadId: string; threadTitle: string };
export type ChangesResponse = { segments: DiffSegment[]; entries: ChangeEntry[] };
```
  - **`TypeItemRow` becomes:**
```ts
export type TypeItemRow = {
  id: string; threadId: string; title: string; summary: string; status: DisplayStatus; blocking: boolean;
  fields: Record<string, string>; messageCount: number; latest: { author: 'you' | 'claude' | 'system'; text: string } | null;
  open: OpenOptions | null; draft: ThreadDraft | null; decision: string | null; flagged: boolean;
};
```
  - **`TypeEntry`** gains `fields: string[]; answerPresets: string[]; addLabel?: string`.
  - **Core `detail.ts`:**
    - `loadThreadDetail(o: { dir: string; threadId: string; types: PlumbingType[] }): Promise<Omit<ThreadDetail, 'listening'>>`
    - `loadChanges(dir): Promise<ChangesResponse>`
    - `submitMessage(r: { resolved: number; sent: number; skipped: { reason: string }[] }, listening: ListeningState): string`
    - `NO_WINDOW = 'Saved. No Claude window is listening. Run /dev-plumbing in any clone.'`
  - **Routes**, all under `/api/projects/:repo/:id`:
    - `GET /threads/:threadId` returns a `ThreadDetail`
    - `PUT /threads/:threadId/draft`, with body `{ optionId?, note?, text? }` or `{ clear: true }`, returns `{ ok: true }`
    - `POST /threads/:threadId/park`, with body `{ parked: boolean }`, returns `{ ok: true }`
    - `POST /submit`, with body `{ scope: 'all' }` or `{ scope: 'thread', threadId }`, returns a `SubmitResponse`
    - `POST /items`, with body `{ type, title, text, fields? }`, returns `SubmitResponse & { threadId }`
    - `GET /changes` returns a `ChangesResponse`
    - `POST /changes/:changeId/undo` and `POST /changes/:changeId/apply` return `{ ok: true }`
  - Every write runs under the project lock and emits a `project` event. A submission that sends anything calls `rt.listeners.notify(key)`.

- [ ] **Step 1: Write the failing core test**

`packages/core/test/detail.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { loadChanges, loadThreadDetail, NO_WINDOW, submitMessage } from '../src/store/detail';
import { recordChange } from '../src/store/changes';
import { addDecision } from '../src/store/decisions';
import { loadTypeItems } from '../src/store/projects';
import { readThread, writeThread } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const options = [
  { id: 'per-send', label: 'One row per send', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] } },
  { id: 'per-sub', label: 'One row per subscription' },
];

describe('thread detail', () => {
  it('has the open options, a preview of each change, links, decisions and small edits', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options, recommended: 'per-send', links: ['c1'], title: 'Rows?' }), pair('c1', { type: 'concerns', title: 'Burst of sends' })] });
    const edit = await recordChange(dir, { threadId: 't-q1', kind: 'small-edit', summary: 'Typo', change: { md: [{ find: 'A daily job', replace: 'One daily job' }] }, apply: true });
    const thread = await readThread(dir, 't-q1');
    await writeThread(dir, { ...thread, messages: [...thread.messages, { id: 'm2', at: 'now', author: 'claude', text: 'Also fixed a typo.', options, smallEdits: [{ changeId: edit.id, summary: 'Typo' }], impacts: [{ itemId: 'c1', reason: 'More rows.' }] }] });
    await addDecision(dir, { text: 'Rows are kept 180 days', threadId: 't-c1', itemIds: ['q1'] });

    const d = await loadThreadDetail({ dir, threadId: 't-q1', types: TYPES });
    expect(d.thread.display).toBe('your_turn');
    expect(d.type).toMatchObject({ id: 'questions', title: 'Questions', screen: 'list', fields: ['blocking', 'default'] });
    expect(d.open?.options.map((o) => o.id)).toEqual(['per-send', 'per-sub']);
    expect(d.previews['per-send']?.md?.some((s) => s.kind === 'added' && s.text.includes('Log one row per send.'))).toBe(true);
    expect(d.previews['per-sub']).toBeUndefined();
    expect(d.linked).toEqual([{ itemId: 'c1', threadId: 't-c1', title: 'Burst of sends', typeTitle: 'Concerns' }]);
    expect(d.refs.c1).toEqual({ title: 'Burst of sends', threadId: 't-c1', typeTitle: 'Concerns' });
    expect(d.edits[edit.id]).toEqual({ state: 'applied', summary: 'Typo' });
    expect(d.decisions.map((x) => x.text)).toEqual(['Rows are kept 180 days']);
  });

  it("explains what Submit did, depending on whether a window is listening", () => {
    expect(submitMessage({ resolved: 0, sent: 2, skipped: [] }, null)).toBe(NO_WINDOW);
    expect(submitMessage({ resolved: 0, sent: 2, skipped: [] }, 'waiting')).toBe('Sent to Claude.');
    expect(submitMessage({ resolved: 0, sent: 1, skipped: [] }, 'busy')).toBe('Saved. Claude is finishing earlier threads and will pick this up next.');
    expect(submitMessage({ resolved: 2, sent: 0, skipped: [] }, null)).toBe('Applied. 2 threads resolved.');
    expect(submitMessage({ resolved: 1, sent: 1, skipped: [] }, 'waiting')).toBe('Applied. 1 thread resolved. Sent to Claude.');
    expect(submitMessage({ resolved: 0, sent: 0, skipped: [{ reason: 'This thread is parked.' }] }, null)).toBe('This thread is parked.');
    expect(submitMessage({ resolved: 0, sent: 0, skipped: [] }, null)).toBe('Nothing to send yet.');
  });

  it('lists the Draft changes newest first, with thread titles', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Rows?' })] });
    await recordChange(dir, { threadId: 't-q1', kind: 'accept', summary: 'Rows?: per send', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] }, apply: true });
    const c = await loadChanges(dir);
    expect(c.entries).toEqual([expect.objectContaining({ kind: 'accept', state: 'applied', threadId: 't-q1', threadTitle: 'Rows?' })]);
    expect(c.segments.find((s) => s.kind === 'added')?.changedBy?.[0]?.threadTitle).toBe('Rows?');
  });

  it('gives list rows what inline answering needs', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options, fields: { blocking: 'true', default: 'One row per send' }, draft: { optionId: 'per-sub', updatedAt: 'now' } }), pair('q2', { status: 'resolved' })] });
    await addDecision(dir, { text: 'Both channels', threadId: 't-q2', itemIds: ['q2'] });
    const r = await loadTypeItems({ repo: 'acme', id: 'restock', dir }, TYPES, 'questions');
    expect(r?.type).toMatchObject({ fields: ['blocking', 'default'], addLabel: 'Question' });
    const q1 = r?.items.find((i) => i.id === 'q1');
    expect(q1).toMatchObject({ threadId: 't-q1', status: 'draft', blocking: true, fields: { default: 'One row per send' }, messageCount: 1, draft: { optionId: 'per-sub' }, decision: null, flagged: false });
    expect(q1?.open?.options).toHaveLength(2);
    expect(r?.items.find((i) => i.id === 'q2')?.decision).toBe('Both channels');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run packages/core/test/detail.test.ts`
Expected: FAIL, because `../src/store/detail` is missing.

- [ ] **Step 3: Add the view types**

In `packages/core/src/schemas/views.ts`:
- Import the types `Option`, `Decision`, `ChangeState`, `ThreadDraft` and `Item` (from `./loop` and `./project`), and `Screen` (already imported).
- Add the `OpenOptions`, `ThreadDetail`, `SubmitResponse`, `ChangeEntry` and `ChangesResponse` types exactly as listed in **Interfaces** above.
- Replace `TypeItemRow` with the version in **Interfaces**.
- Add `fields: string[]; answerPresets: string[]; addLabel?: string;` to `TypeEntry`.

- [ ] **Step 4: Fill the new fields in `store/projects.ts`**

In `loadProjectHome`'s `typeEntries` map, add these to the returned object:
```ts
fields: t.fields, answerPresets: t.answerPresets, ...(t.addLabel ? { addLabel: t.addLabel } : {}),
```

Replace `loadTypeItems`'s row mapping with:
```ts
  const decisions = activeDecisions(await readDecisions(ref.dir));
  const rows = items
    .filter((i) => i.type === typeId)
    .map((i): TypeItemRow => {
      const th = byId.get(i.threadId);
      const last = th ? [...th.messages].reverse().find((m) => m.text) : undefined;
      return {
        id: i.id,
        threadId: i.threadId,
        title: i.title,
        summary: i.summary,
        status: th ? displayStatus(th) : 'idle',
        blocking: i.fields?.blocking === 'true',
        fields: i.fields ?? {},
        messageCount: th?.messages.length ?? 0,
        latest: last?.text ? { author: last.author, text: last.text } : null,
        open: th ? openOptions(th) : null,
        draft: th?.draft ?? null,
        decision: [...decisions].reverse().find((d) => d.threadId === i.threadId)?.text ?? null,
        flagged: Boolean(i.flags?.length),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
```
Import `activeDecisions` from `./decisions` and `readDecisions` from `./io`. Add this helper to `store/threads.ts` and import it into `store/projects.ts`:
```ts
/** latestOpen, in the shape the API returns. */
export function openOptions(thread: Pick<Thread, 'messages'>): OpenOptions | null {
  const open = latestOpen(thread);
  return open ? { messageId: open.message.id, options: open.options, ...(open.recommended ? { recommended: open.recommended } : {}) } : null;
}
```
`OpenOptions` comes from `../schemas`.

- [ ] **Step 5: Write `store/detail.ts`**

`packages/core/src/store/detail.ts`:
```ts
import { diffDocuments, previewChange } from '../docDiff';
import { changeState, displayStatus, type ChangePreview, type ChangesResponse, type ListeningState, type PlumbingType, type ThreadDetail } from '../schemas';
import { activeDecisions } from './decisions';
import { readDecisions, readDocText, readHistory, readItem, readItems, readProjectFile, readThread, readThreads } from './io';
import { openOptions } from './threads';

export const NO_WINDOW = 'Saved. No Claude window is listening. Run /dev-plumbing in any clone.';

/** What the app says after Send this thread or Submit all. */
export function submitMessage(r: { resolved: number; sent: number; skipped: { reason: string }[] }, listening: ListeningState): string {
  const parts: string[] = [];
  if (r.resolved) parts.push(`Applied. ${r.resolved} thread${r.resolved === 1 ? '' : 's'} resolved.`);
  if (r.sent) {
    parts.push(
      listening === 'waiting'
        ? 'Sent to Claude.'
        : listening === 'busy'
          ? `Saved. Claude is finishing earlier threads and will pick ${r.sent === 1 ? 'this' : 'these'} up next.`
          : NO_WINDOW,
    );
  }
  if (parts.length) return parts.join(' ');
  return r.skipped[0]?.reason ?? 'Nothing to send yet.';
}

export async function loadThreadDetail(o: { dir: string; threadId: string; types: PlumbingType[] }): Promise<Omit<ThreadDetail, 'listening'>> {
  const thread = await readThread(o.dir, o.threadId);
  const item = await readItem(o.dir, thread.itemId);
  const project = await readProjectFile(o.dir);
  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: items } = await readItems(o.dir);
  const typeOf = (typeId: string) => o.types.find((t) => t.id === typeId);
  const type = typeOf(item.type);
  const refFor = (id: string) => {
    const i = items.find((x) => x.id === id);
    return i ? { title: i.title, threadId: i.threadId, typeTitle: typeOf(i.type)?.title ?? i.type } : null;
  };

  const open = openOptions(thread);
  const previews: Record<string, ChangePreview> = {};
  for (const option of open?.options ?? []) if (option.change) previews[option.id] = previewChange(draft, items, option.change);

  const linkedIds = new Set([...(item.links ?? []), ...items.filter((i) => i.links?.includes(item.id)).map((i) => i.id)]);
  const linked = [...linkedIds].flatMap((id) => {
    const r = refFor(id);
    return r ? [{ itemId: id, threadId: r.threadId, title: r.title, typeTitle: r.typeTitle }] : [];
  });

  const refs: ThreadDetail['refs'] = {};
  const editIds = new Set<string>();
  for (const m of thread.messages) {
    if (m.author !== 'claude') continue;
    for (const id of [...(m.newItemIds ?? []), ...(m.impacts ?? []).map((x) => x.itemId)]) {
      const r = refFor(id);
      if (r) refs[id] = r;
    }
    for (const e of m.smallEdits ?? []) editIds.add(e.changeId);
  }
  const edits: ThreadDetail['edits'] = {};
  for (const h of await readHistory(o.dir)) if (editIds.has(h.id)) edits[h.id] = { state: changeState(h), summary: h.summary };

  return {
    thread: { ...thread, display: displayStatus(thread) },
    item,
    type: { id: item.type, title: type?.title ?? item.type, screen: type?.screen ?? 'list', fields: type?.fields ?? [], answerPresets: type?.answerPresets ?? [] },
    open,
    previews,
    linked,
    refs,
    edits,
    decisions: activeDecisions(await readDecisions(o.dir)).filter((d) => d.itemIds.includes(item.id) || d.threadId === thread.id),
  };
}

/** The Draft's Changes view: the diff against the original, and every recorded change, newest first. */
export async function loadChanges(dir: string): Promise<ChangesResponse> {
  const project = await readProjectFile(dir);
  const [original, draft, history] = await Promise.all([readDocText(dir, project.docs.original), readDocText(dir, project.docs.draft), readHistory(dir)]);
  const { values: threads } = await readThreads(dir);
  const { values: items } = await readItems(dir);
  const titleOf = (threadId: string) => {
    const itemId = threads.find((t) => t.id === threadId)?.itemId;
    return items.find((i) => i.id === itemId)?.title ?? threadId;
  };
  return {
    segments: diffDocuments(original, draft, history, titleOf),
    entries: [...history].reverse().map((h) => ({ id: h.id, at: h.at, kind: h.kind, summary: h.summary, state: changeState(h), threadId: h.threadId, threadTitle: titleOf(h.threadId) })),
  };
}
```

In `packages/core/src/index.ts`, add `export * from './store/detail';`.

Run: `pnpm vitest run packages/core && pnpm --filter @dev-plumbing/core typecheck`
Expected: PASS. If Plan 1's `loadTypeItems` test compares whole rows, change its expectation to `toMatchObject` on the fields it checked before. Don't remove assertions.

- [ ] **Step 6: Write the failing route tests**

`packages/service/test/threads.test.ts`:
```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readThread, writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { makeRepo } from '../../core/test/fixtures';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const P = '/api/projects/acme-app/restock-reminders';
const perSend = { id: 'per-send', label: 'One row per send', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] } };

async function setup() {
  const s = await makeContext();
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git', planText: '# Restock reminders\n\nRemind customers.\n\n## Data\n\nLog reminders in a table.\n' });
  await writeJsonAtomic(path.join(s.ctx.configDir, 'repos', 'acme-app.json'), { name: 'acme-app', match: ['github.com/acme/acme-app'] });
  const rt = createRuntime();
  const app = createApp(s.ctx, rt);
  const send = async (method: string, route: string, body?: unknown): Promise<{ status: number; body: Json }> => {
    const res = await call(app, route, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  const open = await send('POST', '/api/claude/open', { cwd: repo, plan: 'docs/specs/restock-reminders.md' });
  for (const type of open.body.importTypes as { id: string }[]) {
    await send('POST', '/api/claude/items', {
      repo: 'acme-app',
      project: 'restock-reminders',
      type: type.id,
      ...(type.id === 'questions'
        ? {
            items: [
              { key: 'rows', title: 'Rows per send?', summary: 'How often a row is written.', message: { text: 'Which?', options: [perSend, { id: 'per-sub', label: 'Per subscription' }], recommended: 'per-send' } },
              { key: 'channels', title: 'Which channels?', summary: 'SMS or email.', message: { text: 'SMS, email or both?' } },
            ],
          }
        : { noChanges: 'None.' }),
    });
  }
  const dir = path.join(s.root, 'acme-app', 'restock-reminders');
  return { ...s, rt, app, send, dir };
}

describe('thread routes', () => {
  it('serves the thread view with a preview of each change', async () => {
    const t = await setup();
    const d = (await t.send('GET', `${P}/threads/t-questions-rows`)).body;
    expect(d).toMatchObject({ item: { title: 'Rows per send?' }, open: { recommended: 'per-send' }, listening: null });
    expect(d.previews['per-send'].md.some((s: Json) => s.kind === 'added')).toBe(true);
    expect((await t.send('GET', `${P}/threads/t-nope`)).status).toBe(404);
  });

  it('autosaves drafts and parks threads', async () => {
    const t = await setup();
    await t.send('PUT', `${P}/threads/t-questions-rows/draft`, { optionId: 'per-sub', note: 'Simpler.' });
    expect((await readThread(t.dir, 't-questions-rows')).draft).toMatchObject({ optionId: 'per-sub', note: 'Simpler.' });
    await t.send('PUT', `${P}/threads/t-questions-rows/draft`, { clear: true });
    expect((await readThread(t.dir, 't-questions-rows')).draft).toBeUndefined();
    await t.send('POST', `${P}/threads/t-questions-rows/park`, { parked: true });
    expect((await readThread(t.dir, 't-questions-rows')).status).toBe('parked');
    expect((await t.send('POST', `${P}/threads/t-questions-rows/park`, null)).status).toBe(400);
  });

  it('applies a plain accept straight away, and says when no window is listening', async () => {
    const t = await setup();
    await t.send('PUT', `${P}/threads/t-questions-rows/draft`, { optionId: 'per-send' });
    const accepted = await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-rows' });
    expect(accepted.body).toMatchObject({ resolved: 1, sent: 0, message: 'Applied. 1 thread resolved.' });
    expect(await fs.readFile(path.join(t.dir, 'docs', 'draft.md'), 'utf8')).toContain('Log one row per send.');

    await t.send('PUT', `${P}/threads/t-questions-channels/draft`, { text: 'Both.' });
    const sent = await t.send('POST', `${P}/submit`, { scope: 'all' });
    expect(sent.body).toMatchObject({ sent: 1, listening: null, message: 'Saved. No Claude window is listening. Run /dev-plumbing in any clone.' });
  });

  it('tells a waiting window about the submission at once', async () => {
    const t = await setup();
    const waiting = t.send('POST', '/api/claude/wait', { repo: 'acme-app', project: 'restock-reminders', windowId: 'w-a', timeoutSeconds: 5 });
    await new Promise((r) => setTimeout(r, 50));
    await t.send('PUT', `${P}/threads/t-questions-channels/draft`, { text: 'Both.' });
    const sent = await t.send('POST', `${P}/submit`, { scope: 'all' });
    expect(sent.body.message).toBe('Sent to Claude.');
    expect((await waiting).body).toMatchObject({ kind: 'submission', groups: [{ threads: ['t-questions-channels'] }] });
  });

  it('adds your own question and sends it', async () => {
    const t = await setup();
    const r = await t.send('POST', `${P}/items`, { type: 'questions', title: 'Opt-out link?', text: 'Does every email need one?' });
    expect(r.body).toMatchObject({ threadId: 't-questions-opt-out-link', sent: 1 });
    const thread = await readThread(t.dir, 't-questions-opt-out-link');
    expect(thread.status).toBe('with_claude');
    expect(thread.messages[0]).toMatchObject({ author: 'you', text: 'Does every email need one?' });
    expect((await t.send('POST', `${P}/items`, { type: 'nope', title: 'x', text: 'y' })).status).toBe(400);
  });

  it('shows the Draft changes, and undoes and re-applies a small edit', async () => {
    const t = await setup();
    await t.send('PUT', `${P}/threads/t-questions-channels/draft`, { text: 'Both.' });
    await t.send('POST', `${P}/submit`, { scope: 'all' });
    await t.send('POST', '/api/claude/reply', {
      repo: 'acme-app',
      project: 'restock-reminders',
      threadId: 't-questions-channels',
      text: 'Both it is.',
      smallEdits: [{ summary: 'Clearer wording', change: { md: [{ find: 'Remind customers.', replace: 'Remind customers before an item runs out.' }] } }],
      resolve: { decision: 'Reminders go by SMS and email' },
    });
    const changes = (await t.send('GET', `${P}/changes`)).body;
    expect(changes.entries).toEqual([expect.objectContaining({ kind: 'small-edit', state: 'applied', threadTitle: 'Which channels?' })]);
    expect(changes.segments.find((s: Json) => s.kind === 'added').changedBy[0].threadTitle).toBe('Which channels?');
    const id = changes.entries[0].id;
    expect((await t.send('POST', `${P}/changes/${id}/undo`, {})).status).toBe(200);
    expect(await fs.readFile(path.join(t.dir, 'docs', 'draft.md'), 'utf8')).toContain('Remind customers.\n');
    expect((await t.send('POST', `${P}/changes/${id}/apply`, {})).status).toBe(200);
    expect((await t.send('POST', `${P}/changes/${id}/undo-all`, {})).status).toBe(404);
  });

  it('a draft save racing Submit all and a Claude reply loses nothing', async () => {
    const t = await setup();
    await t.send('PUT', `${P}/threads/t-questions-rows/draft`, { text: 'First answer.' });
    await t.send('POST', `${P}/submit`, { scope: 'all' });
    const [, , submitted] = await Promise.all([
      t.send('PUT', `${P}/threads/t-questions-channels/draft`, { text: 'Typed while things land.' }),
      t.send('POST', '/api/claude/reply', { repo: 'acme-app', project: 'restock-reminders', threadId: 't-questions-rows', text: 'Noted.', impacts: [{ itemId: 'questions-channels', reason: 'Rows affect channels.' }] }),
      t.send('POST', `${P}/submit`, { scope: 'all' }),
    ]);
    const channels = await readThread(t.dir, 't-questions-channels');
    const inDraft = channels.draft?.text === 'Typed while things land.';
    const sent = channels.messages.some((m) => m.author === 'you' && m.text === 'Typed while things land.');
    expect(inDraft || sent).toBe(true);
    expect(submitted.status).toBe(200);
    expect((await readThread(t.dir, 't-questions-rows')).messages.at(-1)).toMatchObject({ author: 'claude', text: 'Noted.' });
  });
});
```

Run: `pnpm vitest run packages/service/test/threads.test.ts`
Expected: FAIL, with 404s for the new routes.

- [ ] **Step 7: Write the routes**

`packages/service/src/routes/threads.ts`:
```ts
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  addOwnItem,
  applyPendingChange,
  formatZodError,
  InputError,
  loadChanges,
  loadThreadDetail,
  saveDraft,
  setParked,
  submit,
  submitMessage,
  undoChange,
  type ProjectRef,
  type SubmitResponse,
} from '@dev-plumbing/core';
import type { AppContext } from '../context';
import { handle } from '../errors';
import { EXPECTED_OBJECT, readJsonObject } from '../json';
import { locateProject } from '../locate';
import { projectKey, type Runtime } from '../runtime';

const draftBody = z.union([
  z.object({ clear: z.literal(true) }),
  z.object({ optionId: z.string().max(100).optional(), note: z.string().max(20_000).optional(), text: z.string().max(20_000).optional() }),
]);
const parkBody = z.object({ parked: z.boolean() });
const submitBody = z.union([z.object({ scope: z.literal('all') }), z.object({ scope: z.literal('thread'), threadId: z.string().min(1) })]);
const itemBody = z.object({ type: z.string().min(1), title: z.string().min(1).max(200), text: z.string().min(1).max(20_000), fields: z.record(z.string().max(500)).optional() });

async function parse<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  const body = await readJsonObject(c);
  if (!body) throw new InputError(EXPECTED_OBJECT.error);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new InputError(formatZodError(parsed.error));
  return parsed.data;
}

export function threadRoutes(ctx: AppContext, rt: Runtime): Hono {
  const r = new Hono();
  const base = '/projects/:repo/:id';
  const find = (c: Context) => locateProject(ctx, c.req.param('repo'), c.req.param('id'));
  /** Runs a write under the project's lock, then tells the browser. */
  const write = async <T>(ref: ProjectRef, fn: () => Promise<T>): Promise<T> => {
    const result = await rt.withLock(projectKey(ref.repo, ref.id), fn);
    rt.events.projectChanged(ref.repo, ref.id);
    return result;
  };
  const respond = (ref: ProjectRef, r: { resolved: string[]; sent: string[]; skipped: { threadId: string; reason: string }[] }): SubmitResponse => {
    const key = projectKey(ref.repo, ref.id);
    if (r.sent.length) rt.listeners.notify(key);
    const listening = rt.listeners.state(key);
    const counts = { resolved: r.resolved.length, sent: r.sent.length, skipped: r.skipped };
    return { ...counts, listening, message: submitMessage(counts, listening) };
  };
  r.get(`${base}/threads/:threadId`, handle(async (c) => {
    const { cfg, ref } = await find(c);
    const detail = await loadThreadDetail({ dir: ref.dir, threadId: c.req.param('threadId'), types: cfg.types });
    return c.json({ ...detail, listening: rt.listeners.state(projectKey(ref.repo, ref.id)) });
  }));

  r.put(`${base}/threads/:threadId/draft`, handle(async (c) => {
    const body = await parse(c, draftBody);
    const { ref } = await find(c);
    await write(ref, () => saveDraft(ref.dir, c.req.param('threadId'), 'clear' in body ? null : body));
    return c.json({ ok: true });
  }));

  r.post(`${base}/threads/:threadId/park`, handle(async (c) => {
    const body = await parse(c, parkBody);
    const { ref } = await find(c);
    await write(ref, () => setParked(ref.dir, c.req.param('threadId'), body.parked));
    return c.json({ ok: true });
  }));

  r.post(`${base}/submit`, handle(async (c) => {
    const body = await parse(c, submitBody);
    const { cfg, ref } = await find(c);
    const result = await write(ref, () => submit(ref.dir, { scope: body.scope, threadId: body.scope === 'thread' ? body.threadId : undefined, types: cfg.types }));
    return c.json(respond(ref, result));
  }));

  r.post(`${base}/items`, handle(async (c) => {
    const body = await parse(c, itemBody);
    const { cfg, ref } = await find(c);
    const type = cfg.types.find((t) => t.id === body.type && t.enabled);
    if (!type) throw new InputError(`"${body.type}" isn't an enabled plumbing type.`);
    const { threadId, result } = await write(ref, async () => {
      const { thread } = await addOwnItem(ref.dir, { type, title: body.title, text: body.text, fields: body.fields });
      return { threadId: thread.id, result: await submit(ref.dir, { scope: 'thread', threadId: thread.id, types: cfg.types }) };
    });
    return c.json({ ...respond(ref, result), threadId });
  }));

  r.get(`${base}/changes`, handle(async (c) => {
    const { ref } = await find(c);
    return c.json(await loadChanges(ref.dir));
  }));

  r.post(`${base}/changes/:changeId/:action`, handle(async (c) => {
    const action = c.req.param('action');
    if (action !== 'undo' && action !== 'apply') return c.json({ error: 'Unknown action.' }, 404);
    const { ref } = await find(c);
    const changeId = c.req.param('changeId');
    await write(ref, () => (action === 'undo' ? undoChange(ref.dir, changeId) : applyPendingChange(ref.dir, changeId)));
    return c.json({ ok: true });
  }));

  return r;
}
```

In `packages/service/src/app.ts`:
- Import `threadRoutes` from `./routes/threads`.
- Add `app.route('/api', threadRoutes(ctx, rt));` after `projectRoutes`.

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run packages/core packages/service && pnpm typecheck`
Expected: PASS.

The race test passes because every write runs under the project lock. Removing `rt.withLock` from `write` would make it flaky, which is the point of the test.

- [ ] **Step 9: Commit**

```bash
git add packages/core packages/service
git commit -m "feat(service): thread view data, drafts, park, Send and Submit all, your own items, Draft changes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 14: The MCP server

This is the stdio MCP server that Claude Code starts from the plugin. It's a thin client:
- Each `dp_*` tool becomes one `POST /api/claude/*` call.
- It adds the window id and the session's project folder to each call.
- It starts the service if it isn't running.

`dp_wait` keeps long-polling, with a progress notification each round, until a submission arrives.

**Files:**
- Create:
  - `packages/mcp/package.json`
  - `packages/mcp/tsconfig.json`
  - `packages/mcp/tsup.config.ts`
  - `packages/mcp/vitest.config.ts`
  - `packages/mcp/src/errors.ts`
  - `packages/mcp/src/client.ts`
  - `packages/mcp/src/start.ts`
  - `packages/mcp/src/tools.ts`
  - `packages/mcp/src/index.ts`
- Modify: `packages/core/src/runFile.ts` (install info)
- Test:
  - `packages/mcp/test/client.test.ts`
  - `packages/mcp/test/tools.test.ts`
  - `packages/core/test/runFile.test.ts`

**Interfaces:**
- Consumes:
  - From core: `readRunFile`, `configDir`, `VERSION`, `importItemSchema`, `replySchema` and `repoProfileSchema`.
  - The Task 12 routes.
- Produces:
  - **Core `runFile.ts`:**
    - `type InstallInfo = { nodePath: string; cliPath: string; repoRoot: string; version: string; installedAt: string }`
    - `installInfoPath(configDir)` and `nodePathFile(configDir)`
    - `writeInstallInfo(configDir, info)`, which writes `run/install.json` plus `run/node`, a single line holding the node path that `plugin/bin/dp-mcp.sh` reads
    - `readInstallInfo(configDir): Promise<InstallInfo | null>`
  - **`packages/mcp/src/errors.ts`:** `class ServiceError extends Error { status: number }`, also re-exported from `client.ts`.
  - **`packages/mcp/src/client.ts`:**
    - `type ServiceClient = { call<T = unknown>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> }`
    - `serviceClient(o: { configDir: string; fetch?: typeof fetch; ensureRunning?: () => Promise<void> }): ServiceClient`
  - **`packages/mcp/src/start.ts`:** `startService(configDir): Promise<void>`, which runs `<nodePath> <cliPath> start` from install info.
  - **`packages/mcp/src/tools.ts`:**
    - `createDpServer(o: { client: ServiceClient; cwd: string; windowId: string; maxWaitMs?: number; retryMs?: number; onActive?: () => void }): McpServer`
    - `MAX_WAIT_MS` (11.5 hours)
    - `TOOL_NAMES`
  - **Build output:** `plugin/dist/mcp.mjs`, one bundled file, from `pnpm build`.
  - **Tools** (the only names): `dp_open`, `dp_repo_profile`, `dp_write_items`, `dp_wait`, `dp_context`, `dp_reply`.

- [ ] **Step 1: Create the package**

`packages/mcp/package.json`:
```json
{
  "name": "@dev-plumbing/mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@dev-plumbing/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.31.0",
    "zod": "^3.25.76"
  }
}
```

`packages/mcp/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "tsup.config.ts", "vitest.config.ts"] }
```

`packages/mcp/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'mcp',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
  },
});
```

`packages/mcp/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';

// One self-contained file inside the plugin, so Claude Code can run it straight from the repo.
export default defineConfig({
  entry: { mcp: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: '../../plugin/dist',
  clean: true,
  noExternal: [/.*/],
  outExtension: () => ({ js: '.mjs' }),
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
```

Run: `pnpm install`
Expected: the workspace picks up `@dev-plumbing/mcp`, and `pnpm-lock.yaml` gains `@modelcontextprotocol/sdk`.

- [ ] **Step 2: Write the failing tests**

Add to `packages/core/test/runFile.test.ts` (import `readInstallInfo` and `writeInstallInfo` from `../src/runFile`):
```ts
it('records where Node and the CLI are, for the plugin to find', async () => {
  const dir = tempDir('dp-run-');
  const info = { nodePath: '/opt/node/bin/node', cliPath: '/repo/packages/cli/dist/index.js', repoRoot: '/repo', version: '0.1.0', installedAt: '2026-10-01T09:00:00.000Z' };
  await writeInstallInfo(dir, info);
  expect(await readInstallInfo(dir)).toEqual(info);
  expect(await fs.readFile(path.join(dir, 'run', 'node'), 'utf8')).toBe('/opt/node/bin/node\n');
  expect(await readInstallInfo(tempDir('dp-run-'))).toBeNull();
});
```

`packages/mcp/test/client.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { writeRunFile } from '@dev-plumbing/core';
import { serviceClient, ServiceError } from '../src/client';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

const run = { pid: 1, port: 45999, token: 'tok', startedAt: 'now', version: '0.1.0' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('the service client', () => {
  it('calls the service with the token from the run file', async () => {
    const dir = tempDir('dp-mcp-');
    await writeRunFile(dir, run);
    const seen: { url: string; token: string | null; body: string }[] = [];
    const client = serviceClient({
      configDir: dir,
      fetch: async (url, init) => {
        seen.push({ url: String(url), token: new Headers(init?.headers).get('x-dev-plumbing-token'), body: String(init?.body) });
        return json(200, { ok: true });
      },
    });
    expect(await client.call('/alive', { windowId: 'w' })).toEqual({ ok: true });
    expect(seen).toEqual([{ url: 'http://127.0.0.1:45999/api/claude/alive', token: 'tok', body: '{"windowId":"w"}' }]);
  });

  it("starts the service when it isn't running, then tries again", async () => {
    const dir = tempDir('dp-mcp-');
    let started = false;
    const client = serviceClient({
      configDir: dir,
      ensureRunning: async () => {
        started = true;
        await writeRunFile(dir, run);
      },
      fetch: async () => json(200, { ok: true }),
    });
    expect(await client.call('/alive', { windowId: 'w' })).toEqual({ ok: true });
    expect(started).toBe(true);
  });

  it("gives readable errors, and says so when the service can't be reached", async () => {
    const dir = tempDir('dp-mcp-');
    await writeRunFile(dir, run);
    const refusing = serviceClient({ configDir: dir, ensureRunning: async () => {}, fetch: async () => { throw new TypeError('fetch failed'); } });
    await expect(refusing.call('/alive', {})).rejects.toThrow(/isn't running and couldn't be started/);
    const picky = serviceClient({ configDir: dir, fetch: async () => json(400, { error: 'Nothing was saved. Fix these.' }) });
    const err = await picky.call('/items', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err).toMatchObject({ status: 400, message: 'Nothing was saved. Fix these.' });
  });
});
```

`packages/mcp/test/tools.test.ts`:
```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import { ServiceError, type ServiceClient } from '../src/client';
import { createDpServer, TOOL_NAMES } from '../src/tools';

type Handler = (body: Record<string, unknown>) => unknown;

function fakeService(handlers: Record<string, Handler>) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const client: ServiceClient = {
    call: async <T>(path: string, body: Record<string, unknown>) => {
      calls.push({ path, body });
      const handler = handlers[path];
      if (!handler) throw new ServiceError(404, `No route ${path}`);
      return (await handler(body)) as T;
    },
  };
  return { client, calls };
}

async function connect(server: McpServer): Promise<Client> {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

const textOf = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? '');

describe('the dp tools', () => {
  it('offers exactly the six dp tools', async () => {
    const { client } = fakeService({});
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    expect((await mcp.listTools()).tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it('adds the window and the project folder to what Claude sends', async () => {
    const { client, calls } = fakeService({ '/open': () => ({ kind: 'created', project: 'restock-reminders' }), '/reply': () => ({ ok: true }), '/context': () => ({ item: {} }), '/items': () => ({ saved: 1 }) });
    let active = 0;
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', onActive: () => active++ }));
    const opened = await mcp.callTool({ name: 'dp_open', arguments: { plan: 'docs/specs/restock.md' } });
    expect(JSON.parse(textOf(opened))).toMatchObject({ kind: 'created' });
    await mcp.callTool({ name: 'dp_write_items', arguments: { repo: 'acme', project: 'restock-reminders', type: 'questions', noChanges: 'None.' } });
    await mcp.callTool({ name: 'dp_context', arguments: { repo: 'acme', project: 'restock-reminders', threadId: 't-1' } });
    await mcp.callTool({ name: 'dp_reply', arguments: { repo: 'acme', project: 'restock-reminders', threadId: 't-1', text: 'Done.' } });
    expect(calls.map((c) => [c.path, c.body.cwd ?? null, c.body.windowId ?? null])).toEqual([
      ['/open', '/repo', 'w-1'],
      ['/items', '/repo', null],
      ['/context', null, null],
      ['/reply', '/repo', null],
    ]);
    expect(active).toBe(1);
  });

  it('returns service errors as tool errors Claude can read and fix', async () => {
    const { client } = fakeService({ '/items': () => { throw new ServiceError(400, 'Nothing was saved. Fix these and call dp_write_items again:\n- Item 1 (a): the key is used twice.'); } });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1' }));
    const r = await mcp.callTool({ name: 'dp_write_items', arguments: { repo: 'acme', project: 'p', type: 'questions', items: [{ key: 'a', title: 'A', summary: 's' }] } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/key is used twice/);
  });

  it('keeps listening, with progress, until a submission arrives', async () => {
    let polls = 0;
    const { client, calls } = fakeService({
      '/wait': () => (++polls < 3 ? { kind: 'timeout' } : { kind: 'submission', submission: 's-1', groups: [{ threads: ['t-1'], titles: ['Who?'], model: 'sonnet' }] }),
    });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', retryMs: 1 }));
    const progress: string[] = [];
    const r = await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme', project: 'p', finished: { submission: 's-0' } } }, undefined, { onprogress: (p) => progress.push(p.message ?? '') });
    expect(JSON.parse(textOf(r))).toMatchObject({ kind: 'submission', submission: 's-1' });
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(progress[0]).toMatch(/Listening for your answers/);
    expect(calls.map((c) => c.body.finished ?? null)).toEqual([{ submission: 's-0' }, null, null]);
    expect(calls.every((c) => c.body.windowId === 'w-1')).toBe(true);
  });

  it('rides out the service restarting, and gives up only after its limit', async () => {
    let polls = 0;
    const { client } = fakeService({
      '/wait': () => {
        polls++;
        if (polls === 1) throw new ServiceError(503, 'restarting');
        return { kind: 'timeout' };
      },
    });
    const mcp = await connect(createDpServer({ client, cwd: '/repo', windowId: 'w-1', maxWaitMs: 50, retryMs: 1 }));
    const r = await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme', project: 'p' } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(textOf(r))).toMatchObject({ kind: 'still-waiting' });
    expect(polls).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `pnpm vitest run packages/mcp packages/core/test/runFile.test.ts`
Expected: FAIL. `writeInstallInfo` and the `../src/*` modules are missing.

- [ ] **Step 4: Record install info in core**

Add to `packages/core/src/runFile.ts`:
```ts
/** Written by `dev-plumbing setup`: how the plugin's MCP server starts Node and the service. */
export type InstallInfo = { nodePath: string; cliPath: string; repoRoot: string; version: string; installedAt: string };

export const installInfoPath = (configDir: string) => path.join(configDir, 'run', 'install.json');
/** One line: the Node binary. plugin/bin/dp-mcp.sh reads it without parsing JSON. */
export const nodePathFile = (configDir: string) => path.join(configDir, 'run', 'node');

export async function writeInstallInfo(configDir: string, info: InstallInfo): Promise<void> {
  await writeFileAtomic(installInfoPath(configDir), `${JSON.stringify(info, null, 2)}\n`);
  await writeFileAtomic(nodePathFile(configDir), `${info.nodePath}\n`);
}

export async function readInstallInfo(configDir: string): Promise<InstallInfo | null> {
  try {
    const v = JSON.parse(await fs.readFile(installInfoPath(configDir), 'utf8'));
    return typeof v?.nodePath === 'string' && typeof v?.cliPath === 'string' ? (v as InstallInfo) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Write the client and the starter**

`packages/mcp/src/errors.ts`:
```ts
/** A readable failure from the service, with its HTTP status. 503 means it couldn't be reached. */
export class ServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
```

`packages/mcp/src/client.ts`:
```ts
import { readRunFile } from '@dev-plumbing/core';
import { ServiceError } from './errors';
import { startService } from './start';

export { ServiceError };

export type ServiceClient = { call<T = unknown>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> };

/** Talks to the local service as Claude: POST /api/claude/<path> with the run-file token. */
export function serviceClient(o: { configDir: string; fetch?: typeof fetch; ensureRunning?: () => Promise<void> }): ServiceClient {
  const doFetch = o.fetch ?? fetch;
  const ensureRunning = o.ensureRunning ?? (() => startService(o.configDir));

  /** null means "couldn't reach it": no run file, or the connection failed. */
  async function attempt(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<{ data: unknown } | null> {
    const run = await readRunFile(o.configDir);
    if (!run) return null;
    let res: Response;
    try {
      res = await doFetch(`http://127.0.0.1:${run.port}/api/claude${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': run.token },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      return null;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ServiceError(res.status, data.error ?? `The dev-plumbing service answered ${res.status}.`);
    return { data };
  }

  return {
    async call<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
      const first = await attempt(path, body, signal);
      if (first) return first.data as T;
      await ensureRunning();
      const second = await attempt(path, body, signal);
      if (second) return second.data as T;
      throw new ServiceError(503, "dev-plumbing isn't running and couldn't be started. Run dev-plumbing start in a terminal.");
    },
  };
}
```

`packages/mcp/src/start.ts`:
```ts
import { execFile } from 'node:child_process';
import { readInstallInfo } from '@dev-plumbing/core';
import { ServiceError } from './errors';

/** Runs `dev-plumbing start` with the Node and CLI that setup recorded. */
export async function startService(configDir: string): Promise<void> {
  const info = await readInstallInfo(configDir);
  if (!info) throw new ServiceError(503, "dev-plumbing isn't set up on this Mac. Run dev-plumbing setup in a terminal.");
  await new Promise<void>((resolve, reject) =>
    execFile(info.nodePath, [info.cliPath, 'start'], { env: { ...process.env, DEV_PLUMBING_HOME: configDir }, timeout: 20_000 }, (err, _stdout, stderr) =>
      err ? reject(new ServiceError(503, `dev-plumbing couldn't start: ${String(stderr).trim() || err.message}`)) : resolve(),
    ),
  );
}
```

- [ ] **Step 6: Write the tools**

`packages/mcp/src/tools.ts`:
```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { importItemSchema, replySchema, repoProfileSchema, VERSION } from '@dev-plumbing/core';
import { ServiceError, type ServiceClient } from './client';

/** Under the plugin's 12-hour per-call limit, so a long wait ends on our terms. */
export const MAX_WAIT_MS = 11.5 * 60 * 60 * 1000;
export const TOOL_NAMES = ['dp_open', 'dp_repo_profile', 'dp_write_items', 'dp_wait', 'dp_context', 'dp_reply'] as const;

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };
const ok = (value: unknown): Result => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const failed = (e: unknown): Result => ({ isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const project = { repo: z.string().min(1).describe('The repo, from dp_open'), project: z.string().min(1).describe('The plumbing project id, from dp_open') };

export function createDpServer(o: { client: ServiceClient; cwd: string; windowId: string; maxWaitMs?: number; retryMs?: number; onActive?: () => void }): McpServer {
  const server = new McpServer({ name: 'dp', version: VERSION });
  let active = false;
  const markActive = () => {
    if (active) return;
    active = true;
    o.onActive?.();
  };
  const call = async (path: string, body: Record<string, unknown>): Promise<Result> => {
    try {
      return ok(await o.client.call(path, body));
    } catch (e) {
      return failed(e);
    }
  };

  server.registerTool(
    'dp_open',
    {
      description:
        "Open a plumbing project for the repo this session is in. Pass plan (a Markdown plan's path, relative to the repo or absolute) to import it, or to reopen it if it was imported before. Pass project (an id from a listing) to reopen one. Pass neither to list this repo's plumbing projects. The result's kind and next say what to do.",
      inputSchema: { plan: z.string().min(1).optional(), project: z.string().min(1).optional() },
    },
    async (args) => {
      const result = await call('/open', { ...args, cwd: o.cwd, windowId: o.windowId });
      if (!result.isError) markActive();
      return result;
    },
  );

  server.registerTool(
    'dp_repo_profile',
    {
      description:
        "Read this repo's profile, or save one you detected. Without profile: returns existing, or missing with the remote and a suggested name. With profile: saves it as repos/<name>.json. match must include this clone's remote. It never overwrites an existing profile.",
      inputSchema: { profile: repoProfileSchema.optional() },
    },
    async (args) => call('/repo-profile', { cwd: o.cwd, ...(args.profile ? { profile: args.profile } : {}) }),
  );

  server.registerTool(
    'dp_write_items',
    {
      description:
        'Write everything one plumbing type found in the plan, in one call: items, or noChanges with a reason. The batch is checked as a whole. If anything is wrong, nothing is saved and the error lists every problem: fix them all and send the whole batch again.',
      inputSchema: { ...project, type: z.string().min(1).describe('The plumbing type id'), items: z.array(importItemSchema).max(60).optional(), noChanges: z.string().min(1).max(500).optional() },
    },
    async (args) => call('/items', { ...args, cwd: o.cwd }),
  );

  server.registerTool(
    'dp_context',
    {
      description: 'Get the context pack for one thread (threadId), or for importing one plumbing type (importType).',
      inputSchema: { ...project, threadId: z.string().optional(), importType: z.string().optional() },
    },
    async (args) => call('/context', args),
  );

  server.registerTool(
    'dp_reply',
    {
      description:
        'Post your reply to one thread you were given. The reply is checked as a whole. If anything is wrong, nothing is saved and the error lists every problem: fix them all and call dp_reply again.',
      inputSchema: { ...project, ...replySchema.shape },
    },
    async (args) => call('/reply', { ...args, cwd: o.cwd }),
  );

  server.registerTool(
    'dp_wait',
    {
      description:
        "Listen for the user's answers. Waits until they press Send this thread or Submit all, sending progress while it waits, then returns the threads to answer in groups (one thread subagent per group) with the model to use. When you call it again, pass finished with the previous submission id and any conflicts you found. If it returns still-waiting, call it again.",
      inputSchema: {
        ...project,
        finished: z
          .object({
            submission: z.string().min(1),
            conflicts: z.array(z.object({ threads: z.array(z.string()).min(1), text: z.string().min(1) })).optional(),
          })
          .optional(),
      },
    },
    async (args, extra) => {
      markActive();
      const started = Date.now();
      const token = extra._meta?.progressToken;
      let finished = args.finished;
      let beat = 0;
      while (true) {
        const t0 = Date.now();
        try {
          const r = await o.client.call<{ kind: string }>('/wait', { repo: args.repo, project: args.project, windowId: o.windowId, ...(finished ? { finished } : {}) }, extra.signal);
          finished = undefined;
          if (r.kind === 'submission') return ok(r);
        } catch (e) {
          if (extra.signal.aborted) return failed(new Error('Stopped listening.'));
          // A restarting service answers 503 or can't be reached for a moment. Anything else is a real error.
          if (!(e instanceof ServiceError) || e.status !== 503) return failed(e);
        }
        if (extra.signal.aborted) return failed(new Error('Stopped listening.'));
        const minutes = Math.floor((Date.now() - started) / 60_000);
        if (token !== undefined) {
          await extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken: token, progress: ++beat, message: `Listening for your answers (${minutes} min)` },
          });
        }
        if (Date.now() - started >= (o.maxWaitMs ?? MAX_WAIT_MS)) {
          return ok({ kind: 'still-waiting', next: 'Nothing was submitted yet. Call dp_wait again to keep listening.' });
        }
        // The service long-polls, so a quick return means it's restarting or a test is running: don't spin.
        if (Date.now() - t0 < 1000) await sleep(o.retryMs ?? 2000);
      }
    },
  );

  return server;
}
```

`packages/mcp/src/index.ts`:
```ts
import { randomBytes } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { configDir } from '@dev-plumbing/core';
import { serviceClient } from './client';
import { createDpServer } from './tools';

const client = serviceClient({ configDir: configDir() });
const windowId = `w-${randomBytes(4).toString('hex')}`;

const server = createDpServer({
  client,
  cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  windowId,
  // Once this window opens a project, ping every 30 s so the app knows it's alive, even while subagents work.
  onActive: () => {
    setInterval(() => void client.call('/alive', { windowId }).catch(() => undefined), 30_000).unref();
  },
});

await server.connect(new StdioServerTransport());
```

- [ ] **Step 7: Run the tests and build**

Run:
```bash
pnpm vitest run packages/mcp packages/core && pnpm typecheck
pnpm --filter @dev-plumbing/mcp build && ls plugin/dist
```
Expected:
- The tests pass and the typecheck is clean.
- `plugin/dist/mcp.mjs` exists.
- `dist/` is already in `.gitignore`, so the build output stays untracked.

If `callTool`'s third argument doesn't accept `onprogress` in the installed SDK, check `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.d.ts` for `RequestOptions`. Use the option name it defines there, and note it in your report.

- [ ] **Step 8: Commit**

```bash
git add packages/mcp packages/core pnpm-lock.yaml
git commit -m "feat(mcp): the dp MCP server, a thin client to the service with a listening wait" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 15: Setup installs the plugin

Spec §6.7 step 4: `dev-plumbing setup` installs the Claude Code plugin for your user, from this repo, as a local marketplace. Setup also records where Node and the CLI are, so the plugin's MCP server can start the service. `--no-plugin` skips the install (tests use it).

**Files:**
- Create: `packages/cli/src/plugin.ts`
- Modify:
  - `packages/cli/src/setup.ts`
  - `packages/cli/src/index.ts`
  - `packages/web/e2e/global-setup.ts` (pass `--no-plugin`)
- Test:
  - `packages/cli/test/plugin.test.ts`
  - `packages/cli/test/setup.test.ts`

**Interfaces:**
- Consumes: `writeInstallInfo` and `InstallInfo` from Task 14, and `VERSION`.
- Produces:
  - `type Runner = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>`
  - `execRunner`
  - `PLUGIN_ID = 'dev-plumbing@dev-plumbing'`
  - `installPlugin(repoRoot: string, run?: Runner): Promise<string>`. It returns the line to print. It throws when a `claude` command fails for any reason other than "already".
  - `SetupOptions` gains:
    - `plugin: boolean`
    - `install: Omit<InstallInfo, 'installedAt'>`
    - `installPlugin: () => Promise<string>`
  - `runSetup` always writes install info. It installs the plugin when `plugin` is true. A failed install is reported but never stops setup.
  - The CLI's `setup` gains `--no-plugin`.

- [ ] **Step 1: Write the failing tests**

`packages/cli/test/plugin.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { installPlugin, type Runner } from '../src/plugin';

function fakeRunner(fail: Record<string, string | NodeJS.ErrnoException> = {}) {
  const ran: string[] = [];
  const run: Runner = async (cmd, args) => {
    const line = [cmd, ...args].join(' ');
    ran.push(line);
    const key = Object.keys(fail).find((k) => line.startsWith(k));
    if (key) {
      const f = fail[key];
      throw typeof f === 'string' ? Object.assign(new Error('Command failed'), { stderr: f, stdout: '' }) : f;
    }
    return { stdout: '', stderr: '' };
  };
  return { run, ran };
}

describe('installing the plugin', () => {
  it('adds this repo as a marketplace and installs the plugin for your user', async () => {
    const { run, ran } = fakeRunner();
    expect(await installPlugin('/src/dev-plumbing', run)).toMatch(/Installed the Claude Code plugin/);
    expect(ran).toEqual([
      'claude --version',
      'claude plugin marketplace add /src/dev-plumbing',
      'claude plugin install dev-plumbing@dev-plumbing --scope user',
    ]);
  });

  it('is happy to run again', async () => {
    const { run, ran } = fakeRunner({
      'claude plugin marketplace add': 'Marketplace "dev-plumbing" is already installed',
      'claude plugin install': 'Plugin dev-plumbing@dev-plumbing is already installed',
    });
    expect(await installPlugin('/src/dev-plumbing', run)).toMatch(/Installed/);
    expect(ran).toContain('claude plugin marketplace update dev-plumbing');
  });

  it("explains when Claude Code isn't installed, and when a command fails", async () => {
    const missing = fakeRunner({ 'claude --version': Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }) });
    expect(await installPlugin('/src/dev-plumbing', missing.run)).toMatch(/isn't on your PATH/);
    const broken = fakeRunner({ 'claude plugin install': 'Error: network unreachable' });
    await expect(installPlugin('/src/dev-plumbing', broken.run)).rejects.toThrow(/claude plugin install failed: Error: network unreachable/);
  });
});
```

In `packages/cli/test/setup.test.ts`:
- Add `readInstallInfo` to the `@dev-plumbing/core` import.
- Add these defaults to the `options()` helper's object, before `...over`:
```ts
    plugin: false,
    install: { nodePath: '/opt/node/bin/node', cliPath: '/repo/packages/cli/dist/index.js', repoRoot: '/repo', version: '0.1.0' },
    installPlugin: async () => {
      calls.push('plugin');
      return 'Installed the Claude Code plugin.';
    },
```
- Add the tests:
```ts
  it('records where Node and the CLI are, for the plugin', async () => {
    await runSetup(options());
    expect(await readInstallInfo(dir)).toMatchObject({ nodePath: '/opt/node/bin/node', cliPath: '/repo/packages/cli/dist/index.js', repoRoot: '/repo' });
  });

  it('installs the plugin, and finishes setup even if that fails', async () => {
    const lines: string[] = [];
    await runSetup(options({ plugin: true, log: (l) => lines.push(l) }));
    expect(calls).toContain('plugin');
    expect(lines).toContain('Installed the Claude Code plugin.');
    const failing = await runSetup(options({ plugin: true, log: (l) => lines.push(l), installPlugin: async () => { throw new Error('network unreachable'); } }));
    expect(failing.settings).toBeDefined();
    expect(lines.at(-1)).toMatch(/plugin wasn't installed: network unreachable/);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run packages/cli`
Expected: FAIL. `../src/plugin` is missing, and `runSetup` doesn't write install info.

- [ ] **Step 3: Write `plugin.ts`**

`packages/cli/src/plugin.ts`:
```ts
import { execFile } from 'node:child_process';

export type Runner = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

export const execRunner: Runner = (cmd, args) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: 120_000 }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stdout: String(stdout), stderr: String(stderr) })) : resolve({ stdout: String(stdout), stderr: String(stderr) }),
    ),
  );

export const MARKETPLACE = 'dev-plumbing';
export const PLUGIN_ID = `dev-plumbing@${MARKETPLACE}`;

type Failure = Error & { stdout?: string; stderr?: string; code?: string };
const output = (e: unknown) => `${(e as Failure).stderr ?? ''} ${(e as Failure).stdout ?? ''}`.trim();
const already = (e: unknown) => /already/i.test(`${output(e)} ${(e as Error).message}`);
const detail = (e: unknown) => (output(e) || (e as Error).message).split('\n')[0];

/**
 * Adds this repo as a local plugin marketplace and installs dev-plumbing for your user. Safe to run again.
 * A local marketplace loads the plugin in place, so a rebuild needs no reinstall.
 */
export async function installPlugin(repoRoot: string, run: Runner = execRunner): Promise<string> {
  try {
    await run('claude', ['--version']);
  } catch (e) {
    if ((e as Failure).code === 'ENOENT') return "Claude Code isn't on your PATH, so the plugin wasn't installed. Install Claude Code, then run dev-plumbing setup again.";
    throw new Error(`claude --version failed: ${detail(e)}`);
  }
  try {
    await run('claude', ['plugin', 'marketplace', 'add', repoRoot]);
  } catch (e) {
    if (!already(e)) throw new Error(`claude plugin marketplace add failed: ${detail(e)}`);
    await run('claude', ['plugin', 'marketplace', 'update', MARKETPLACE]).catch(() => undefined);
  }
  try {
    await run('claude', ['plugin', 'install', PLUGIN_ID, '--scope', 'user']);
  } catch (e) {
    if (!already(e)) throw new Error(`claude plugin install failed: ${detail(e)}`);
  }
  return 'Installed the Claude Code plugin. Restart any open Claude Code sessions, then run /dev-plumbing in a repo.';
}
```

- [ ] **Step 4: Change setup and the CLI**

In `packages/cli/src/setup.ts`:
- Import `writeInstallInfo` and `type InstallInfo` from `@dev-plumbing/core`.
- Add to `SetupOptions`:
```ts
  plugin: boolean;
  install: Omit<InstallInfo, 'installedAt'>;
  installPlugin: () => Promise<string>;
```
- In `runSetup`, after the login item line (`if (o.loginItem) await ...`), add:
```ts
  await writeInstallInfo(o.configDir, { ...o.install, installedAt: new Date().toISOString() });
  if (o.plugin) {
    try {
      o.log(await o.installPlugin());
    } catch (e) {
      o.log(`The Claude Code plugin wasn't installed: ${(e as Error).message}`);
    }
  }
```

In `packages/cli/src/index.ts`:
- Import `installPlugin` from `./plugin`.
- Add `const REPO_ROOT = here('../../..');` next to `SERVICE_ENTRY`.
- Add the option `.option('--no-plugin', "don't install the Claude Code plugin")` to `setup`.
- Add `plugin: boolean` to the action's `opts` type.
- Pass these to `runSetup`:
```ts
        plugin: opts.plugin,
        install: { nodePath: process.execPath, cliPath: CLI_PATH, repoRoot: REPO_ROOT, version: VERSION },
        installPlugin: () => installPlugin(REPO_ROOT),
```

In `packages/web/e2e/global-setup.ts`, add `'--no-plugin'` to the `cli('setup', ...)` arguments, right after `'--no-start'`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/cli && pnpm typecheck && pnpm test:e2e`
Expected: PASS. The e2e run must not touch your real Claude Code plugins. `--no-plugin` and the temp HOME ensure that.

- [ ] **Step 6: Commit**

```bash
git add packages/cli packages/web/e2e/global-setup.ts
git commit -m "feat(cli): setup installs the Claude Code plugin and records install info" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 16: The plugin

The Claude Code plugin is what makes `/dev-plumbing` work:
- a marketplace file at the repo root
- the plugin manifest
- the MCP server entry with a 12-hour limit
- a launcher script
- the `/dev-plumbing` skill
- the repo-setup, importer and thread subagents

A bridge test drives the real MCP server over stdio against the real service. It covers a whole round trip with no Claude involved.

**Files:**
- Create:
  - `.claude-plugin/marketplace.json`
  - `plugin/.claude-plugin/plugin.json`
  - `plugin/.mcp.json`
  - `plugin/bin/dp-mcp.sh` (executable)
  - `plugin/skills/dev-plumbing/SKILL.md`
  - `plugin/agents/repo-setup.md`, `plugin/agents/importer.md`, `plugin/agents/thread.md`
- Test:
  - `packages/mcp/test/plugin.test.ts`
  - `packages/mcp/test/bridge.integration.test.ts`

**Interfaces:**
- Consumes:
  - From Task 14: `plugin/dist/mcp.mjs`, `TOOL_NAMES`, `run/node` and `run/install.json`.
  - From Task 15: `setup --no-plugin`.
- Produces:
  - Plugin `dev-plumbing` in marketplace `dev-plumbing`, with MCP server `dp` and the skill `/dev-plumbing`.
  - Agents `dev-plumbing:repo-setup`, `dev-plumbing:importer` and `dev-plumbing:thread`.
  - Tool names as Claude sees them: `mcp__plugin_dev-plumbing_dp__<tool>`.

- [ ] **Step 1: Write the failing tests**

`packages/mcp/test/plugin.test.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontMatter } from '@dev-plumbing/core';
import { TOOL_NAMES } from '../src/tools';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const asSeen = (tool: string) => `mcp__plugin_dev-plumbing_dp__${tool}`;

describe('the plugin', () => {
  it('is listed in the repo marketplace', () => {
    const market = JSON.parse(read('.claude-plugin/marketplace.json'));
    expect(market).toMatchObject({ name: 'dev-plumbing', owner: { name: expect.any(String) }, plugins: [{ name: 'dev-plumbing', source: './plugin' }] });
    expect(JSON.parse(read('plugin/.claude-plugin/plugin.json')).name).toBe('dev-plumbing');
  });

  it('starts the dp server through the launcher, with a 12-hour limit', () => {
    const server = JSON.parse(read('plugin/.mcp.json')).mcpServers.dp;
    expect(server).toEqual({ command: 'sh', args: ['${CLAUDE_PLUGIN_ROOT}/bin/dp-mcp.sh'], timeout: 43_200_000 });
    expect(fs.statSync(path.join(root, 'plugin/bin/dp-mcp.sh')).mode & 0o111).toBeTruthy();
  });

  it('gives each subagent only read tools and its own dp tools', () => {
    const expected: Record<string, string[]> = { 'repo-setup': ['dp_repo_profile'], importer: ['dp_context', 'dp_write_items'], thread: ['dp_context', 'dp_reply'] };
    for (const [name, dp] of Object.entries(expected)) {
      const agent = parseFrontMatter(read(`plugin/agents/${name}.md`));
      expect(agent.data.name).toBe(name);
      expect(String(agent.data.description).length).toBeGreaterThan(20);
      const tools = String(agent.data.tools).split(',').map((t) => t.trim());
      expect([...tools].sort()).toEqual(['Glob', 'Grep', 'Read', ...dp.map(asSeen)].sort());
      for (const t of dp) expect(TOOL_NAMES).toContain(t);
    }
  });

  it('has the /dev-plumbing skill, which uses the tools and subagents by their real names', () => {
    const skill = parseFrontMatter(read('plugin/skills/dev-plumbing/SKILL.md'));
    expect(skill.data.name).toBe('dev-plumbing');
    for (const s of ['dp_open', 'dp_wait', 'dev-plumbing:repo-setup', 'dev-plumbing:importer', 'dev-plumbing:thread', '$ARGUMENTS', 'finished']) {
      expect(skill.content).toContain(s);
    }
  });
});
```

`packages/mcp/test/bridge.integration.test.ts`:
```ts
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { readRunFile } from '@dev-plumbing/core';
import { makeRepo } from '../../core/test/fixtures';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

const root = path.resolve(import.meta.dirname, '../../..');
const cli = path.join(root, 'packages/cli/dist/index.js');
let configDir: string;
let env: Record<string, string>;
let mcp: Client;

async function freePort(): Promise<number> {
  const s = net.createServer().listen(0, '127.0.0.1');
  await once(s, 'listening');
  const port = (s.address() as net.AddressInfo).port;
  s.close();
  await once(s, 'close');
  return port;
}

beforeAll(async () => {
  const home = tempDir('dp-bridge-');
  configDir = path.join(home, '.dev-plumbing');
  env = Object.fromEntries(Object.entries({ ...process.env, HOME: home, DEV_PLUMBING_HOME: configDir }).filter((e): e is [string, string] => e[1] !== undefined));
  const port = await freePort();
  execFileSync(process.execPath, [cli, 'setup', '--yes', '--no-login-item', '--no-start', '--no-plugin', '--projects-folder', path.join(home, 'projects'), '--port', String(port)], { env, stdio: 'ignore' });
  const settingsFile = path.join(configDir, 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')), openBrowserOnImport: false }));
  fs.mkdirSync(path.join(configDir, 'repos'), { recursive: true });
  fs.writeFileSync(path.join(configDir, 'repos', 'acme-app.json'), JSON.stringify({ name: 'acme-app', match: ['github.com/acme/acme-app'] }));
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
  mcp = new Client({ name: 'bridge-test', version: '1.0.0' });
  await mcp.connect(new StdioClientTransport({ command: 'sh', args: [path.join(root, 'plugin/bin/dp-mcp.sh')], env: { ...env, CLAUDE_PROJECT_DIR: repo } }));
});

afterAll(async () => {
  await mcp?.close();
  try {
    execFileSync(process.execPath, [cli, 'stop'], { env, stdio: 'ignore' });
  } catch {
    // Not running.
  }
  removeTempDirs();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: unknown): any => JSON.parse((r as { content: { text: string }[] }).content[0]!.text);
async function http(route: string, init: RequestInit = {}) {
  const run = await readRunFile(configDir);
  const res = await fetch(`http://127.0.0.1:${run!.port}${route}`, { ...init, headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': run!.token } });
  return res.json();
}

it('carries a whole round trip from Claude Code to the app and back', async () => {
  // dp_open starts the service by itself, from the install info setup wrote.
  const open = json(await mcp.callTool({ name: 'dp_open', arguments: { plan: 'docs/specs/restock-reminders.md' } }));
  expect(open).toMatchObject({ kind: 'created', repo: 'acme-app', project: 'restock-reminders' });
  for (const t of open.importTypes as { id: string }[]) {
    const batch = t.id === 'questions' ? { items: [{ key: 'channels', title: 'Which channels?', summary: 'SMS or email.', message: { text: 'SMS, email or both?' } }] } : { noChanges: 'None.' };
    const r = await mcp.callTool({ name: 'dp_write_items', arguments: { repo: 'acme-app', project: 'restock-reminders', type: t.id, ...batch } });
    expect(r.isError).toBeFalsy();
  }

  // The user answers in the browser.
  const P = '/api/projects/acme-app/restock-reminders';
  await http(`${P}/threads/t-questions-channels/draft`, { method: 'PUT', body: JSON.stringify({ text: 'Both.' }) });
  await http(`${P}/submit`, { method: 'POST', body: JSON.stringify({ scope: 'all' }) });

  // The main window hears about it.
  const wait = json(await mcp.callTool({ name: 'dp_wait', arguments: { repo: 'acme-app', project: 'restock-reminders' } }));
  expect(wait).toMatchObject({ kind: 'submission', groups: [{ threads: ['t-questions-channels'], model: 'sonnet' }] });

  // A thread subagent reads its context and replies.
  const ctx = json(await mcp.callTool({ name: 'dp_context', arguments: { repo: 'acme-app', project: 'restock-reminders', threadId: 't-questions-channels' } }));
  expect(ctx.thread.messages.at(-1)).toMatchObject({ author: 'you', text: 'Both.' });
  const reply = await mcp.callTool({
    name: 'dp_reply',
    arguments: { repo: 'acme-app', project: 'restock-reminders', threadId: 't-questions-channels', text: 'Both it is.', resolve: { decision: 'Reminders go by SMS and email' } },
  });
  expect(reply.isError).toBeFalsy();
  expect((await http(`${P}/threads/t-questions-channels`)).thread.status).toBe('resolved');
}, 60_000);
```

Run: `pnpm vitest run packages/mcp/test/plugin.test.ts`
Expected: FAIL, because the plugin files don't exist.

- [ ] **Step 2: Write the marketplace, manifest, server entry and launcher**

`.claude-plugin/marketplace.json`:
```json
{
  "name": "dev-plumbing",
  "owner": { "name": "dev-plumbing" },
  "plugins": [
    {
      "name": "dev-plumbing",
      "source": "./plugin",
      "description": "Plumb a feature plan before you build it: every question, concern and change gets its own thread in a local app."
    }
  ]
}
```

`plugin/.claude-plugin/plugin.json`:
```json
{
  "name": "dev-plumbing",
  "version": "0.1.0",
  "description": "Plumb a feature plan before you build it: every question, concern and change gets its own thread in a local app."
}
```

`plugin/.mcp.json`:
```json
{
  "mcpServers": {
    "dp": {
      "command": "sh",
      "args": ["${CLAUDE_PLUGIN_ROOT}/bin/dp-mcp.sh"],
      "timeout": 43200000
    }
  }
}
```

`plugin/bin/dp-mcp.sh`:
```sh
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
```

Run: `chmod +x plugin/bin/dp-mcp.sh`

- [ ] **Step 3: Write the skill**

`plugin/skills/dev-plumbing/SKILL.md`:
```markdown
---
name: dev-plumbing
description: Plumb a feature plan with dev-plumbing. Imports a Markdown plan into a local review app where every question, concern and change has its own thread, then listens for the user's answers and replies through subagents. Use when the user runs /dev-plumbing, with or without a path to a plan.
argument-hint: "[path/to/plan.md]"
---

# dev-plumbing

You are the main window for dev-plumbing. The plan already exists: don't brainstorm, plan or review it yourself, and don't read it. Your job is to open the plumbing project, start subagents and listen.

**Keep your context small.** You only ever see ids, titles and one-line summaries. Never read the plan, items or threads, and never edit files in the repo. Subagents do the reading and writing through the dp tools.

Your tools are `dp_open` and `dp_wait`. The subagents are `dev-plumbing:repo-setup`, `dev-plumbing:importer` and `dev-plumbing:thread`.

## 1. Open

Call `dp_open`. If the user gave a path ($ARGUMENTS), pass it as `plan`; otherwise pass nothing. Then follow `kind`:

- **needs-profile**: this repo has no repo profile yet. Start one `dev-plumbing:repo-setup` subagent with the result's `model`, and tell it the `clone`, `remote` and `suggestedName`. When it returns, tell the user in one line what it saved, and that they can change it in Settings → Repos. Then call `dp_open` again with the same arguments.
- **pick-project**: show the user the projects as a short list (title, and how many are waiting), ask which one to open with AskUserQuestion, then call `dp_open` with `project` set to its id. If the list is empty, tell the user to run `/dev-plumbing path/to/plan.md`, and stop.
- **created** or **reopened**, with a non-empty `importTypes`: go to 2.
- **reopened** with no `importTypes`: tell the user the project's `url`, then go to 3.

If `dp_open` returns an error, tell the user the error and stop.

## 2. Import

Start one `dev-plumbing:importer` subagent per entry in `importTypes`, with `models.importer` as the model. Start up to `maxParallel` at once, as parallel Agent calls in one message, wait for them, then start the next batch. Give each this prompt, filled in:

> Import plumbing type `<type id>` ("<type title>") for repo `<repo>`, plumbing project `<project>`.

Each returns one line. When all have returned, tell the user the project's `url` and the importers' lines as a short list. Then go to 3.

## 3. Listen

Call `dp_wait` with `repo` and `project`. It waits until the user presses **Send this thread** or **Submit all** in the app.

- If the call moves to the background (Claude Code does this after two minutes), that's expected. Tell the user once: "Listening for your answers in the app. You can keep chatting here." Then end your turn. When the result arrives, carry on below.
- **kind: submission**: answer it (4).
- **kind: still-waiting**: call `dp_wait` again, without `finished`.

## 4. Answer a submission

The result has `submission`, `groups` (each with `threads`, `titles` and `model`), `maxParallel` and `decisions`.

1. Start one `dev-plumbing:thread` subagent per group, with that group's `model`. Start up to `maxParallel` at once, as parallel Agent calls in one message, wait for them, then start the next batch. Prompt, filled in:
   > Answer threads `<thread ids, comma separated>` in repo `<repo>`, plumbing project `<project>`.
2. Each subagent returns one line per thread. Don't look at anything else.
3. **Cross-check** those lines against each other and against `decisions`. If two answers contradict each other, or contradict a decision, that's a conflict: note the thread ids involved and one sentence on what clashes.
4. Call `dp_wait` again with `finished: { submission: <the submission id>, conflicts: [...] }`, using an empty list when there are none. Go back to 3.

## Rules

- Never read or edit the plan, the draft or any plumbing file yourself, and never edit the repo.
- Never answer a thread yourself. That's the thread subagent's job.
- Don't summarise threads to the user beyond the one-line results. The app shows everything.
- If a tool call fails, tell the user the error in one line. If `dp_wait` fails, try once more. If it fails again, stop and tell the user to run `/dev-plumbing` again.
- The user can talk to you while you listen. If they ask you to stop listening, stop calling `dp_wait`.
```

- [ ] **Step 4: Write the three subagents**

`plugin/agents/repo-setup.md`:
```markdown
---
name: repo-setup
description: Detects a repo profile for dev-plumbing (plan folders, schema file, conventions, apps) and saves it with dp_repo_profile. Used by the /dev-plumbing skill the first time it sees a repo.
tools: Read, Grep, Glob, mcp__plugin_dev-plumbing_dp__dp_repo_profile
color: cyan
---

You set up dev-plumbing's repo profile for the repo in your working directory. Look around, but don't change anything.

1. Call `dp_repo_profile` with no arguments. If it says `existing`, reply "A repo profile already exists: <name>." and stop.
2. Look around the repo (Read, Grep, Glob) to fill in:
   - `name`: the suggested name from step 1.
   - `match`: a list holding the `remote` from step 1.
   - `planFolders`: folders that hold plans or specs (for example `docs/specs` or `docs/plans`). Only ones that exist.
   - `schema`: the database schema file, if there is one. Use `{ "type": "prisma", "path": "..." }` for `schema.prisma`, `"sql"` for SQL schema or migration files, and `"other"` for anything else. Leave it out if there's none.
   - `conventions`: up to 10 short, plain rules the code clearly follows, taken from CLAUDE.md, AGENTS.md, CONTRIBUTING.md, linter config or consistent patterns (for example "Ids use uuid()"). Only what you can see. Don't guess.
   - `apps`: each app or package with a UI, as `{ "name", "path", "kitFiles" }`. `kitFiles` are its theme or global CSS files, such as a Tailwind `@theme` file. Leave the list empty if there are none.
   - `sensitiveData`: tags such as "PII" or "payments", only if the code clearly handles that kind of data.
   - Leave out `projectsFolder` and `linkIntoClones`. The user decides those in Settings.
3. Call `dp_repo_profile` with `profile`. If it returns an error, fix what it says and try again, at most three times.
4. Reply with one line: "Saved repo profile <name>: <n> plan folders, schema <type or none>, <n> conventions, <n> apps."
```

`plugin/agents/importer.md`:
```markdown
---
name: importer
description: Imports one plumbing type from a plan into a dev-plumbing project, following that plumbing type's rules file. Used by the /dev-plumbing skill, one per plumbing type.
tools: Read, Grep, Glob, mcp__plugin_dev-plumbing_dp__dp_context, mcp__plugin_dev-plumbing_dp__dp_write_items
color: blue
---

You import one plumbing type from a plan into dev-plumbing. Your prompt names the type, the repo and the plumbing project. The repo is your working directory. Read code there if the rules call for it, but never change anything.

1. Call `dp_context` with `repo`, `project`, and `importType` set to the type id. You get:
   - `type`: its id, title and screen, its extra `fields` and `answerPresets`, and `rules`. `rules` is the whole rules file: what to look for, rules, done when, and always ask.
   - `draft`: the whole plan.
   - `profile`: the repo's schema file, conventions and apps.
   - `existingItems`: items that other importers already wrote, which you may link to.
2. Read the draft with the rules in mind. Read code only where it helps you check a claim, or tie an item to a real file.
3. Decide the items, following the rules file exactly. Write one item per distinct thing, and don't pad the list. If the plan has nothing for this type, send `noChanges` with a one-sentence reason instead.
4. Write each item:
   - `key`: short, lowercase, with dashes (for example `who-gets-reminders`), unique in your batch.
   - `title`: a few words, sentence case.
   - `summary`: one line.
   - `body`: optional markdown with detail.
   - `fields`: only the type's `fields`, with every value a string (for example `"blocking": "true"` or `"severity": "high"`).
   - `mdAnchor`: `{ "heading": "<the draft heading the item comes from, exactly as written>" }`, when there is one.
   - `codeRefs`: `{ "path": "relative/path", "symbol": "optional" }` for real files or symbols it touches. The service checks them.
   - `links`: keys of closely related items in your batch, or ids from `existingItems`.
   - `data`: the item's structured data, for diagram, database, mockups and flows screens only (see Data shapes).
   - `message`: your opening message, when there's something to ask or confirm. It has:
     - `text`: plain and short.
     - `options`: optional, 2 to 4, each `{ "id": "short-id", "label": "...", "detail": "optional" }`. Add `change` when picking the option should edit the plan.
     - `recommended`: an option id, when you have a view.

     A `change` that edits the plan is `{ "md": [{ "find": "exact text from the draft", "replace": "new text" }] }`. `find` must be copied exactly from the draft, and appear there exactly once.
5. Call `dp_write_items` once, with `repo`, `project`, `type`, and either `items` or `noChanges`. If it returns errors, nothing was saved: fix every problem listed and send the whole batch again, at most three times.
6. Reply with exactly one line: "<Type title>: <n> items" (for questions, add how many are blocking), or "<Type title>: no changes (<reason>)".

## Data shapes

Use these for `data` on screens other than list:

- **diagram:** `{ "kind": "system" | "data_flow", "groups": [{ "id", "label" }], "nodes": [{ "id", "label", "group"?, "status": "new" | "changed" | "unchanged" | "external", "codeRef"?: { "path", "symbol"? } }], "edges": [{ "id", "from", "to", "label"?, "style"?: "solid" | "dashed" }] }`
- **database:** `{ "model", "change": "new" | "changed" | "removed", "fields": [{ "name", "type", "change": "added" | "changed" | "removed" | "unchanged", "note"? }], "schemaDiff": "the exact diff", "migration"?: [{ "kind": "additive" | "backfill" | "destructive" | "data-risk", "text" }] }`
- **mockups:** `{ "location": { "app", "route"?, "files": [] }, "kit": "<app name from the profile>" }`. Describe the screen change in `body`. Mockup HTML comes in a later version.
- **flows:** `{ "kind": "user" | "system" | "both", "lanes"?: [{ "id", "label", "status" }], "steps": [{ "n", "from"?, "to"?, "label", "systemNote"? }] }`
```

`plugin/agents/thread.md`:
```markdown
---
name: thread
description: Answers one dev-plumbing thread, or a group of linked ones, following the item's plumbing-type rules, and posts each reply with dp_reply. Used by the /dev-plumbing skill, one per thread or linked group.
tools: Read, Grep, Glob, mcp__plugin_dev-plumbing_dp__dp_context, mcp__plugin_dev-plumbing_dp__dp_reply
color: green
---

You answer threads in a dev-plumbing project: a person's questions and answers about a plan. Your prompt lists the thread ids, the repo and the plumbing project. The repo is your working directory. Read code there when it helps, but never change anything. Your only way to write is `dp_reply`.

For each thread, in the order given:

1. Call `dp_context` with `repo`, `project` and `threadId`. You get:
   - the project summary, the item, and the whole thread
   - the linked items and every decision so far
   - the draft section the item comes from, plus the draft's headings and its file path
   - the repo's conventions, and the plumbing type's Rules

   Read the whole draft file only if you need text outside the section.
2. Read the person's last message. It's an option they picked (maybe with a note), a preset, a custom answer or free text. Answer what they actually said. Respect every decision so far. If their answer contradicts one, say so plainly.
3. Write one reply:
   - **`text`:** plain, short and direct. Say what you'd do and why.
   - **Settling it:** if their answer settles the thread, set `resolve: { "decision": "<one line, e.g. 'Reminders go by SMS and email'>" }` and give no options. If settling it means editing the plan, offer that edit as one recommended option instead, so the person accepts it.
   - **`options`:** otherwise offer 2 to 4, with ids in lowercase with dashes. Add `change` when picking one should edit the plan or items. Set `recommended` when you have a view.
   - **`change.md`:** `[{ "find": "exact text from the draft", "replace": "new text" }]`. `find` must be copied exactly from the current draft and appear there exactly once, so include enough of the surrounding words.
   - **`smallEdits`:** only for typos, wording and layout that don't change meaning, each `{ "summary": "...", "change": ... }`. They're applied at once, with Undo. A small edit can't delete text outright: keep some words in `replace`.
   - **`newItems`:** a new question, concern or idea this raised, with its own opening `message`.
   - **`impacts`:** other items this might affect, each `{ "itemId", "reason" }`, from `linked` or the decisions.
   - **`filesRead`:** the repo files you read.
4. Call `dp_reply` with `repo`, `project`, `threadId` and the reply. If it returns errors, nothing was saved: fix every problem listed and call it again, at most three times.

Then reply with exactly one line per thread: "<item title>: <what you did, e.g. 'offered 3 options, recommended per-send' or 'resolved: both channels'>".
```

- [ ] **Step 5: Run the tests**

Run:
```bash
pnpm vitest run packages/mcp
pnpm test:integration
```
Expected: PASS. `test:integration` builds everything first, including `plugin/dist/mcp.mjs`. Then the bridge test runs the real launcher, the real MCP server and the real service.

If `claude` is installed on this machine, also run these, and expect no errors:
```bash
claude plugin validate .
claude plugin validate plugin
```
If it isn't installed, say so in your report.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin plugin packages/mcp
git commit -m "feat(plugin): the dev-plumbing plugin with its skill, subagents and MCP server" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 17: Web: live updates, Claude listening and Submit all

The app now:
- updates on its own when anything changes (SSE)
- shows **Claude listening** on the app home and the project home
- has a working **Submit all · N drafts**, which says plainly whether a Claude window will see what you sent

The e2e suite gains a fixture git repo and a helper that plays Claude.

**Files:**
- Create:
  - `packages/web/src/lib/useLiveUpdates.ts`
  - `packages/web/src/lib/useSubmit.ts`
  - `packages/web/src/components/ListeningMark.tsx`
  - `packages/web/e2e/claude.ts`
  - `packages/web/e2e/listening.spec.ts`
- Modify:
  - `packages/web/src/api/client.ts` (every new endpoint)
  - `packages/web/src/pages/Root.tsx`
  - `packages/web/src/pages/AppHome.tsx`
  - `packages/web/src/pages/ProjectHeader.tsx`
  - `packages/web/src/pages/ProjectLayout.tsx`
  - `packages/web/e2e/global-setup.ts` (fixture repo, `openBrowserOnImport: false`)
- Test: `packages/web/e2e/listening.spec.ts`

**Interfaces:**
- Consumes: the Task 13 routes, and the core types `ThreadDetail`, `SubmitResponse`, `ChangesResponse`, `ListeningState` and `LiveEvent`.
- Produces:
  - **`api` additions in `src/api/client.ts`:**
    - `thread(repo, id, threadId)`
    - `saveDraft(repo, id, threadId, draft: DraftInput | null)`
    - `park(repo, id, threadId, parked)`
    - `submit(repo, id, body: SubmitBody)`
    - `addItem(repo, id, body)`
    - `changes(repo, id)`
    - `changeAction(repo, id, changeId, 'undo' | 'apply')`
    - the types `DraftInput` and `SubmitBody`
  - **`useLiveUpdates()`.** Root calls it. A `project` event invalidates every query whose key is `[_, repo, id, ...]`, plus `['projects']`. A `projects` event invalidates `['projects']`, and a `config` event invalidates `['config']`.
  - **`useSubmit(repo, project)`**, a TanStack mutation that takes a `SubmitBody` and returns a `SubmitResponse`.
  - **`draftsLabel(n)`**, giving "1 draft" or "N drafts".
  - **`<ListeningMark state={…} />`.** It shows "Claude listening" (moss dot) for `waiting`, "Claude working" for `busy`, and nothing for null. Its `data-testid` is `claude-listening`.
  - **Query keys every later task uses:**
    - `['projectHome', repo, id]`
    - `['typeItems', repo, id, type]`
    - `['thread', repo, id, threadId]`
    - `['doc', repo, id, doc]`
    - `['changes', repo, id]`
  - **e2e helpers (`e2e/claude.ts`):**
    - `asClaude(route, body)`
    - `api(route, method?, body?)`
    - `fixtureRepo()`, which returns the real path
    - `importProject(name, title, items?)`, which returns `{ repo, project, url }`

- [ ] **Step 1: Give the e2e suite a fixture repo and a stand-in for Claude**

In `packages/web/e2e/global-setup.ts`:
- Inside the `try`, after setup writes `settings.json`, set `openBrowserOnImport: false` in that same object, alongside `homePageSize` and `theme`.
- Before `cli('demo')`, add:
```ts
    // A git clone for the Claude-loop tests, with a remote and a matching repo profile.
    const repo = path.join(tmp, 'acme-app');
    fs.mkdirSync(repo);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/acme-app.git'], { cwd: repo });
    fs.mkdirSync(path.join(tmp, '.dev-plumbing', 'repos'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.dev-plumbing', 'repos', 'acme-app.json'), JSON.stringify({ name: 'acme-app', match: ['github.com/acme/acme-app'] }));
```

`packages/web/e2e/claude.ts`:
```ts
import fs from 'node:fs';
import path from 'node:path';
import { configPath, E2E_PORT, e2eTmp } from './env';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const BASE = `http://127.0.0.1:${E2E_PORT}`;
const token = (): string => JSON.parse(fs.readFileSync(configPath('run/service.json'), 'utf8')).token;

async function send(url: string, method: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': token() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${url}: ${data.error}`);
  return data;
}

/** Calls the service the way the plugin's MCP server does. */
export const asClaude = (route: string, body: unknown) => send(`/api/claude${route}`, 'POST', body);
/** Calls the browser API directly, to set up a test. */
export const api = (route: string, method = 'GET', body?: unknown) => send(route, method, body);

/** The fixture clone, by its real path (git reports real paths; macOS temp folders sit behind a symlink). */
export const fixtureRepo = () => fs.realpathSync(path.join(e2eTmp(), 'acme-app'));

export type TestItem = {
  key: string;
  title: string;
  summary: string;
  fields?: Record<string, string>;
  links?: string[];
  message?: { text: string; options?: { id: string; label: string; detail?: string; change?: unknown }[]; recommended?: string };
};

export const PLAN_TEXT = (title: string) => `# ${title}\n\nRemind customers before an item runs out.\n\n## Data\n\nLog reminders in a table.\n\n## Channels\n\nSend by SMS.\n`;

/** Imports a fresh plumbing project from a new plan in the fixture repo. Types without items say "no changes". */
export async function importProject(name: string, title: string, items: Record<string, TestItem[]> = {}): Promise<{ repo: string; project: string; url: string }> {
  const rel = `docs/specs/${name}.md`;
  fs.mkdirSync(path.join(fixtureRepo(), 'docs', 'specs'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRepo(), rel), PLAN_TEXT(title));
  const open = await asClaude('/open', { cwd: fixtureRepo(), plan: rel });
  for (const t of open.importTypes as { id: string }[]) {
    const list = items[t.id];
    await asClaude('/items', {
      repo: open.repo,
      project: open.project,
      type: t.id,
      cwd: fixtureRepo(),
      ...(list?.length ? { items: list } : { noChanges: 'Nothing for this type in the test plan.' }),
    });
  }
  return { repo: open.repo, project: open.project, url: `/p/${open.repo}/${open.project}` };
}
```

- [ ] **Step 2: Write the failing e2e tests**

`packages/web/e2e/listening.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { api, asClaude, importProject } from './claude';

const question = { key: 'channels', title: 'Which channels?', summary: 'SMS, email or both.', message: { text: 'SMS, email or both?' } };

test('shows Claude listening once a window is waiting', async ({ page }) => {
  const p = await importProject('listening', 'Listening check', { questions: [question] });
  await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-listen', timeoutSeconds: 0 });
  await page.goto(p.url);
  await expect(page.getByTestId('claude-listening')).toHaveText('Claude listening');
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search plumbing projects' }).fill('Listening check');
  await expect(page.getByTestId('project-row').getByTestId('claude-listening')).toBeVisible();
});

test('Submit all says when no Claude window is listening', async ({ page }) => {
  const p = await importProject('quiet', 'Quiet project', { questions: [question] });
  await api(`/api/projects/${p.repo}/${p.project}/threads/t-questions-channels/draft`, 'PUT', { text: 'Both.' });
  await page.goto(p.url);
  await page.getByRole('button', { name: 'Submit all · 1 draft' }).first().click();
  await expect(page.getByTestId('submit-notice')).toHaveText('Saved. No Claude window is listening. Run /dev-plumbing in any clone.');
  await expect(page.getByRole('button', { name: 'Submit all · 0 drafts' }).first()).toBeDisabled();
});

test("Claude's reply appears without reloading", async ({ page }) => {
  const p = await importProject('live', 'Live updates', { questions: [question] });
  await api(`/api/projects/${p.repo}/${p.project}/threads/t-questions-channels/draft`, 'PUT', { text: 'Both.' });
  await api(`/api/projects/${p.repo}/${p.project}/submit`, 'POST', { scope: 'all' });
  await page.goto(p.url);
  await expect(page.getByText('With Claude · 1')).toBeVisible();
  const wait = await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-live', timeoutSeconds: 0 });
  await asClaude('/reply', { repo: p.repo, project: p.project, threadId: wait.groups[0].threads[0], text: 'Both it is. Want SMS first?' });
  await expect(page.getByText('Your turn · 1')).toBeVisible();
  await expect(page.getByText('Claude: Both it is. Want SMS first?')).toBeVisible();
});
```

Run: `pnpm test:e2e listening`
Expected: FAIL. There's no `claude-listening` mark, Submit all is still disabled, and nothing updates live.

- [ ] **Step 3: Add the API calls**

In `packages/web/src/api/client.ts`:
- Add `ChangesResponse`, `SubmitResponse` and `ThreadDetail` to the type import from `@dev-plumbing/core/schemas`.
- Add these after the `send` helper:
```ts
const proj = (repo: string, id: string) => `/api/projects/${enc(repo)}/${enc(id)}`;
export type DraftInput = { optionId?: string; note?: string; text?: string };
export type SubmitBody = { scope: 'all' } | { scope: 'thread'; threadId: string };
```
- Add these to the `api` object:
```ts
  thread: (repo: string, id: string, threadId: string) => request<ThreadDetail>(`${proj(repo, id)}/threads/${enc(threadId)}`),
  saveDraft: (repo: string, id: string, threadId: string, draft: DraftInput | null) =>
    request<{ ok: true }>(`${proj(repo, id)}/threads/${enc(threadId)}/draft`, send('PUT', draft ?? { clear: true })),
  park: (repo: string, id: string, threadId: string, parked: boolean) =>
    request<{ ok: true }>(`${proj(repo, id)}/threads/${enc(threadId)}/park`, send('POST', { parked })),
  submit: (repo: string, id: string, body: SubmitBody) => request<SubmitResponse>(`${proj(repo, id)}/submit`, send('POST', body)),
  addItem: (repo: string, id: string, body: { type: string; title: string; text: string; fields?: Record<string, string> }) =>
    request<SubmitResponse & { threadId: string }>(`${proj(repo, id)}/items`, send('POST', body)),
  changes: (repo: string, id: string) => request<ChangesResponse>(`${proj(repo, id)}/changes`),
  changeAction: (repo: string, id: string, changeId: string, action: 'undo' | 'apply') =>
    request<{ ok: true }>(`${proj(repo, id)}/changes/${enc(changeId)}/${action}`, send('POST', {})),
```

- [ ] **Step 4: Write the live-update hook, the submit hook and the listening mark**

`packages/web/src/lib/useLiveUpdates.ts`:
```ts
import type { LiveEvent } from '@dev-plumbing/core/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/** Keeps every screen current: the service pushes an event whenever something changes. */
export function useLiveUpdates(): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');
    source.onmessage = (message) => {
      let event: LiveEvent;
      try {
        event = JSON.parse(message.data) as LiveEvent;
      } catch {
        return;
      }
      if (event.type === 'project') {
        void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === event.repo && q.queryKey[2] === event.id });
        void qc.invalidateQueries({ queryKey: ['projects'] });
      } else if (event.type === 'projects') {
        void qc.invalidateQueries({ queryKey: ['projects'] });
      } else if (event.type === 'config') {
        void qc.invalidateQueries({ queryKey: ['config'] });
      }
    };
    return () => source.close();
  }, [qc]);
}
```

`packages/web/src/lib/useSubmit.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SubmitBody } from '../api/client';

export const draftsLabel = (n: number) => `${n} draft${n === 1 ? '' : 's'}`;

/** Send this thread / Submit all. The response's message says what happened. */
export function useSubmit(repo: string, project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitBody) => api.submit(repo, project, body),
    onSuccess: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === repo && q.queryKey[2] === project }),
  });
}
```

`packages/web/src/components/ListeningMark.tsx`:
```tsx
import type { ListeningState } from '@dev-plumbing/core/schemas';

export function ListeningMark({ state }: { state: ListeningState | undefined }) {
  if (!state) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-moss" data-testid="claude-listening">
      <span aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full bg-moss" />
      {state === 'busy' ? 'Claude working' : 'Claude listening'}
    </span>
  );
}
```

- [ ] **Step 5: Use them**

In `packages/web/src/pages/Root.tsx`, import `useLiveUpdates` and call `useLiveUpdates();` at the top of `Root`.

In `packages/web/src/pages/AppHome.tsx`, import `ListeningMark`. In `ProjectRow`, add `<ListeningMark state={p.listening} />` as the last child of the meta line, the `div` with `mt-1 flex flex-wrap gap-x-3`.

Replace `packages/web/src/pages/ProjectHeader.tsx` with:
```tsx
import type { ProjectHome } from '@dev-plumbing/core/schemas';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { ListeningMark } from '../components/ListeningMark';
import { ProgressBar } from '../components/ProgressBar';
import { draftsLabel, type useSubmit } from '../lib/useSubmit';

export function ProjectHeader({ home, repo, project, submitAll }: { home: ProjectHome; repo: string; project: string; submitAll: ReturnType<typeof useSubmit> }) {
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
          <Button variant="primary" disabled={!s.counts.drafts || submitAll.isPending} onClick={() => submitAll.mutate({ scope: 'all' })}>
            Submit all · {draftsLabel(s.counts.drafts)}
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
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-ink-2">
        {s.counts.total > 0 && (
          <>
            <span className="shrink-0">
              {s.counts.resolved} of {s.counts.total} resolved
            </span>
            <div className="min-w-24 flex-1">
              <ProgressBar resolved={s.counts.resolved} total={s.counts.total} withClaude={s.counts.withClaude} />
            </div>
          </>
        )}
        <ListeningMark state={home.listening} />
      </div>
      {(submitAll.data || submitAll.error) && (
        <p role="status" data-testid="submit-notice" className={`mt-2 text-[12.5px] ${submitAll.error ? 'text-seal' : 'text-ink-2'}`}>
          {submitAll.error ? (submitAll.error as Error).message : submitAll.data?.message}
        </p>
      )}
    </header>
  );
}
```

In `packages/web/src/pages/ProjectLayout.tsx`:
- Delete the `NOT_YET` import.
- Import `draftsLabel` and `useSubmit` from `../lib/useSubmit`.
- Add `const submitAll = useSubmit(repo, project);` with the other hooks, before the early returns.
- Pass `submitAll={submitAll}` to `<ProjectHeader …/>`.
- Change the phone bar's button to:
```tsx
        <Button variant="primary" size="lg" className="w-full" disabled={!drafts || submitAll.isPending} onClick={() => submitAll.mutate({ scope: 'all' })}>
          Submit all · {draftsLabel(drafts)}
        </Button>
```
`NOT_YET` is no longer used anywhere. Remove its export from `ProjectHeader.tsx`, which the replacement above already does.

- [ ] **Step 6: Run the tests**

Run:
```bash
pnpm --filter @dev-plumbing/web typecheck
pnpm test:e2e
```
Expected: PASS: the new `listening` specs and all earlier e2e specs. Plan 1's phone test looks for `Submit all · 1 draft`, which still matches.

- [ ] **Step 7: Commit**

```bash
git add packages/web
git commit -m "feat(web): live updates, Claude listening, and a working Submit all" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 18: Web: the thread view

Spec §10.3, as chosen in the mockup: the item card on top, collapsible, and the conversation below.

**Each Claude message shows:**
- what it read
- small edits, with Undo
- new threads it opened, and items it might affect

**Your answer:**
- radios for Claude's options (marked Recommended or Default), the plumbing type's presets, and **Custom answer**
- a note box on the chosen option
- a preview of **What changes if you accept**
- **Park** and **Send this thread**. On phones, Send is pinned at the bottom.

Drafts autosave. Inbox and type rows open the thread view.

**Files:**
- Create:
  - `packages/web/src/components/DiffView.tsx`
  - `packages/web/src/components/AnswerForm.tsx`
  - `packages/web/src/pages/ItemCard.tsx`
  - `packages/web/src/pages/MessageList.tsx`
  - `packages/web/src/pages/ThreadView.tsx`
  - `packages/web/e2e/loop.spec.ts`
- Modify:
  - `packages/web/src/router.tsx` (route `th/$thread`)
  - `packages/web/src/pages/InboxView.tsx` and `packages/web/src/pages/TypeView.tsx` (rows open the thread)
  - `packages/web/src/pages/ProjectLayout.tsx` (no Submit-all bar on the thread view on phones)
- Test: `packages/web/e2e/loop.spec.ts`

**Interfaces:**
- Consumes: from Task 17, `api.thread`, `api.saveDraft`, `api.park`, `api.submit`, `api.changeAction`, `ThreadDetail`, `SubmitResponse`, `formatUpdated` and the query key conventions.
- Produces:
  - **`<DiffView segments={DiffSegment[]} context?={2} renderChangedBy?={(s) => ReactNode} />`.** Added lines are moss `+`, removed lines are seal `−`, and long unchanged runs fold to "… N unchanged lines". It has `data-testid="diff"`.
  - **`<AnswerForm …/>`**, with props:
    - `repo`, `project`, `threadId`
    - `open: OpenOptions | null`
    - `presets: string[]`
    - `defaultValue?: string`
    - `draft?: ThreadDraft | null`
    - `previews?: Record<string, ChangePreview>`
    - `compact?: boolean`
    - `onSent?: (r: SubmitResponse) => void`

    It has `data-testid="answer-form"`. Task 19 reuses it in list rows with `compact`.
  - **The route `/p/$repo/$project/th/$thread`**, rendered by `ThreadView` (`data-testid="thread-view"`).

- [ ] **Step 1: Write the failing e2e tests**

`packages/web/e2e/loop.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { api, asClaude, importProject } from './claude';
import { noSideScroll } from './env';

const perSend = { id: 'per-send', label: 'One row per send', detail: 'Full history for support.', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] } };
const perSub = { id: 'per-sub', label: 'One row per subscription', detail: 'Simpler, no history.' };
const rows = { key: 'rows', title: 'Rows per send?', summary: 'How often a reminder row is written.', message: { text: 'Which do you want?', options: [perSend, perSub], recommended: 'per-send' } };
const channels = { key: 'channels', title: 'Which channels?', summary: 'SMS, email or both.', message: { text: 'SMS, email or both?' } };

test('answers with an option and a note, and Claude replies in the thread', async ({ page }) => {
  const p = await importProject('loop-note', 'Loop with a note', { questions: [rows] });
  await page.goto(`${p.url}/th/t-questions-rows`);
  await expect(page.getByRole('heading', { name: 'Rows per send?' })).toBeVisible();
  await expect(page.getByText('raised when the plan was imported')).toBeVisible();
  await page.getByRole('radio', { name: /One row per send/ }).check();
  await expect(page.getByText('Recommended', { exact: true })).toBeVisible();
  const preview = page.getByRole('region', { name: 'What changes if you accept' });
  await expect(preview.getByTestId('diff')).toContainText('+ Log one row per send.');
  await page.getByRole('textbox', { name: 'Note for One row per send' }).fill('Delete rows after 180 days.');
  await expect(page.getByText('Draft saved · goes with Submit all')).toBeVisible();
  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByTestId('send-notice')).toHaveText('Saved. No Claude window is listening. Run /dev-plumbing in any clone.');
  await expect(page.getByText('With Claude. A subagent is working on this thread.')).toBeVisible();

  const wait = await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-loop', timeoutSeconds: 0 });
  expect(wait.groups[0].threads).toEqual(['t-questions-rows']);
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: 't-questions-rows',
    text: 'Kept for 180 days, then deleted by the daily job.',
    filesRead: ['docs/specs/loop-note.md'],
    resolve: { decision: 'One row per send, deleted after 180 days' },
  });
  await expect(page.getByText('Kept for 180 days, then deleted by the daily job.')).toBeVisible();
  await expect(page.getByText('Read 1 file')).toBeVisible();
  await expect(page.getByTestId('thread-status')).toHaveText('Resolved');
  expect((await api(`/api/projects/${p.repo}/${p.project}/docs/draft`)).text).toContain('Log one row per send.');
});

test('a plain accept applies straight away and resolves the thread', async ({ page }) => {
  const p = await importProject('loop-accept', 'Loop accept', { questions: [rows] });
  await page.goto(`${p.url}/th/t-questions-rows`);
  await page.getByRole('radio', { name: /One row per send/ }).check();
  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByTestId('send-notice')).toHaveText('Applied. 1 thread resolved.');
  await expect(page.getByTestId('thread-status')).toHaveText('Resolved');
  await expect(page.getByText('Applied and resolved.')).toBeVisible();
  await expect(page.getByText('You chose: One row per send')).toBeVisible();
});

test('Custom answer, Park, and a thread with no options', async ({ page }) => {
  const p = await importProject('loop-custom', 'Loop custom', { questions: [rows, channels] });
  await page.goto(`${p.url}/th/t-questions-rows`);
  await page.getByRole('radio', { name: 'Custom answer' }).check();
  await page.getByRole('textbox', { name: 'Custom answer' }).fill('Ask support what they need first.');
  await page.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByTestId('thread-status')).toHaveText('With Claude');

  await page.goto(`${p.url}/th/t-questions-channels`);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Your answer' }).fill('Both.');
  await page.getByRole('button', { name: 'Park' }).click();
  await expect(page.getByTestId('thread-status')).toHaveText('Parked');
  await page.getByRole('button', { name: 'Unpark' }).click();
  await expect(page.getByTestId('thread-status')).toHaveText('Draft, not sent');
});

test('inbox rows open the thread view', async ({ page }) => {
  const p = await importProject('loop-inbox', 'Loop inbox', { questions: [channels] });
  await page.goto(p.url);
  await page.getByTestId('inbox-row').filter({ hasText: 'Which channels?' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/th/t-questions-channels$`));
  await expect(page.getByTestId('thread-view')).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('one column, with Send this thread pinned at the bottom', async ({ page }) => {
    const p = await importProject('loop-phone', 'Loop phone', { questions: [rows] });
    await page.goto(`${p.url}/th/t-questions-rows`);
    await page.getByRole('radio', { name: /One row per subscription/ }).check();
    const send = page.getByRole('button', { name: 'Send this thread' });
    const box = await send.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(812 - 60);
    await expect(page.getByRole('button', { name: /Submit all/ })).toBeHidden();
    expect(await noSideScroll(page)).toEqual([]);
  });
});
```

Run: `pnpm test:e2e loop`
Expected: FAIL, because there's no thread view route.

- [ ] **Step 2: Write `DiffView`**

`packages/web/src/components/DiffView.tsx`:
```tsx
import type { DiffSegment } from '@dev-plumbing/core/schemas';
import type { ReactNode } from 'react';

const linesOf = (text: string) => text.replace(/\n$/, '').split('\n');

function Unchanged({ text, context, first, last }: { text: string; context: number; first: boolean; last: boolean }) {
  const lines = linesOf(text);
  const head = first ? [] : lines.slice(0, context);
  const tail = last ? [] : lines.slice(Math.max(head.length, lines.length - context));
  const hidden = lines.length - head.length - tail.length;
  const row = (l: string, i: number) => (
    <div key={i} className="whitespace-pre-wrap break-words text-ink-3">
      {'  '}
      {l}
    </div>
  );
  if (hidden <= 1) return <>{lines.map(row)}</>;
  return (
    <>
      {head.map(row)}
      <div className="py-0.5 text-ink-3">… {hidden} unchanged lines</div>
      {tail.map(row)}
    </>
  );
}

/** A line diff: added lines in moss with +, removed in seal with −, long unchanged runs folded. */
export function DiffView({ segments, context = 2, renderChangedBy }: { segments: DiffSegment[]; context?: number; renderChangedBy?: (s: DiffSegment) => ReactNode }) {
  return (
    <div className="mt-1.5 overflow-x-auto font-mono text-[11.5px] leading-[1.55]" data-testid="diff">
      {segments.map((s, i) =>
        s.kind === 'same' ? (
          <Unchanged key={i} text={s.text} context={context} first={i === 0} last={i === segments.length - 1} />
        ) : (
          <div key={i} data-kind={s.kind} className={s.kind === 'added' ? 'text-moss' : 'text-seal'}>
            {linesOf(s.text).map((l, j) => (
              <div key={j} className="whitespace-pre-wrap break-words">
                {s.kind === 'added' ? '+ ' : '− '}
                {l}
              </div>
            ))}
            {renderChangedBy?.(s)}
          </div>
        ),
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `AnswerForm`**

`packages/web/src/components/AnswerForm.tsx`:
```tsx
import type { ChangePreview, OpenOptions, SubmitResponse, ThreadDraft } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, type DraftInput } from '../api/client';
import { Button } from './Button';
import { DiffView } from './DiffView';
import { inputClass } from './inputClass';

type Props = {
  repo: string;
  project: string;
  threadId: string;
  open: OpenOptions | null;
  presets: string[];
  defaultValue?: string;
  draft?: ThreadDraft | null;
  previews?: Record<string, ChangePreview>;
  compact?: boolean;
  onSent?: (r: SubmitResponse) => void;
};

const same = (a?: string, b?: string) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
export const HOW_SENDING_WORKS = "Nothing changes until you send. An accept with no note applies the changes and resolves the thread. A note keeps it open for Claude's follow-up.";

/** Radios for Claude's options, presets and Custom answer (or a plain box when there are none), a note, autosave, Park and Send. */
export function AnswerForm(p: Props) {
  const qc = useQueryClient();
  const [choice, setChoice] = useState(p.draft?.optionId ?? '');
  const [note, setNote] = useState(p.draft?.note ?? '');
  const [text, setText] = useState(p.draft?.text ?? '');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>(p.draft ? 'saved' : 'idle');
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === p.repo && q.queryKey[2] === p.project });

  // A new message from Claude means new options: start again from whatever the server has.
  const resetKey = `${p.threadId}:${p.open?.messageId ?? 'none'}`;
  useEffect(() => {
    setChoice(p.draft?.optionId ?? '');
    setNote(p.draft?.note ?? '');
    setText(p.draft?.text ?? '');
    dirty.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const current = (): DraftInput | null =>
    choice || note.trim() || text.trim() ? { ...(choice ? { optionId: choice } : {}), ...(note.trim() ? { note } : {}), ...(text.trim() ? { text } : {}) } : null;

  // Autosave half a second after the last change.
  useEffect(() => {
    if (!dirty.current) return;
    setSaved('saving');
    timer.current = setTimeout(() => {
      api.saveDraft(p.repo, p.project, p.threadId, current()).then(
        () => {
          setSaved('saved');
          refresh();
        },
        () => setSaved('error'),
      );
    }, 500);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, note, text]);

  const edit = (fn: () => void) => {
    dirty.current = true;
    fn();
  };

  const send = useMutation({
    mutationFn: async () => {
      clearTimeout(timer.current);
      dirty.current = false;
      // Save exactly what's on screen first, so Send never sends an older draft.
      await api.saveDraft(p.repo, p.project, p.threadId, current());
      return api.submit(p.repo, p.project, { scope: 'thread', threadId: p.threadId });
    },
    onSuccess: (r) => {
      p.onSent?.(r);
      refresh();
    },
  });
  const park = useMutation({
    mutationFn: async () => {
      clearTimeout(timer.current);
      dirty.current = false;
      // Keep what you typed: parking unmounts this form before a pending autosave would run.
      await api.saveDraft(p.repo, p.project, p.threadId, current());
      return api.park(p.repo, p.project, p.threadId, true);
    },
    onSuccess: refresh,
  });

  const options = p.open?.options ?? [];
  const hasChoices = options.length > 0 || p.presets.length > 0;
  const preview = choice ? p.previews?.[choice] : undefined;
  const canSend = hasChoices ? Boolean(choice) && (choice !== 'custom' || Boolean(text.trim())) : Boolean(text.trim());
  const name = `answer-${p.threadId}`;

  const renderChoice = (id: string, label: string, detail?: string, tag?: string) => {
    const selected = choice === id;
    return (
      <div key={id} className={`rounded-[8px] px-2.5 py-2 ${selected ? 'bg-selection' : ''}`}>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="radio" name={name} value={id} checked={selected} onChange={() => edit(() => setChoice(id))} className="mt-[3px] accent-slate" />
          <span className="min-w-0 flex-1">
            <span className="text-[13px] font-medium">{label}</span>
            {tag && <span className="ml-2 text-[11px] font-semibold text-slate">{tag}</span>}
            {detail && <span className="block text-[12px] text-ink-3">{detail}</span>}
          </span>
        </label>
        {selected && id === 'custom' && (
          <textarea aria-label="Custom answer" placeholder="Write your own answer…" value={text} onChange={(e) => edit(() => setText(e.target.value))} rows={3} className={`${inputClass} mt-2`} />
        )}
        {selected && id !== 'custom' && (
          <textarea aria-label={`Note for ${label}`} placeholder="Add a note (optional)" value={note} onChange={(e) => edit(() => setNote(e.target.value))} rows={2} className={`${inputClass} mt-2`} />
        )}
      </div>
    );
  };

  return (
    <div data-testid="answer-form">
      {!p.compact && <h3 className="text-[11px] font-semibold text-ink-3">Your answer</h3>}
      {hasChoices ? (
        <div role="radiogroup" aria-label="Your answer" className="mt-1.5 flex flex-col gap-0.5">
          {options.map((o) => renderChoice(o.id, o.label, o.detail, o.id === p.open?.recommended ? 'Recommended' : same(o.label, p.defaultValue) ? 'Default' : undefined))}
          {p.presets.map((label, i) => renderChoice(`preset:${i}`, label))}
          {renderChoice('custom', 'Custom answer')}
        </div>
      ) : (
        <textarea aria-label="Your answer" placeholder="Write your answer…" value={text} onChange={(e) => edit(() => setText(e.target.value))} rows={3} className={`${inputClass} mt-1.5`} />
      )}

      {preview && (
        <section aria-label="What changes if you accept" className="mt-3 border-l-2 border-separator pl-3">
          <h4 className="text-[11px] font-semibold text-ink-3">What changes if you accept</h4>
          {preview.problem && <p className="mt-1 text-[12px] text-amber">{preview.problem}</p>}
          {preview.md && <DiffView segments={preview.md} />}
          {preview.items.map((i) => (
            <p key={i.itemId} className="mt-1 text-[12px] text-ink-2">
              <span className="font-medium">{i.title}</span>: {i.changes.map((c) => `${c.field} → ${c.after}`).join(', ')}
            </p>
          ))}
          {!note.trim() && <p className="mt-1 text-[11.5px] text-ink-3">Sent with no note, this applies straight away and resolves the thread.</p>}
        </section>
      )}

      <div
        className={`mt-3 flex flex-wrap items-center gap-2 ${p.compact ? '' : 'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-10 max-md:border-t-[0.5px] max-md:border-separator max-md:bg-sidebar max-md:px-4 max-md:pb-6 max-md:pt-3 max-md:backdrop-blur-xl'}`}
      >
        <span className="text-[11.5px] text-ink-3">
          {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Draft saved · goes with Submit all' : saved === 'error' ? "Couldn't save the draft." : ''}
        </span>
        <span className="ml-auto flex gap-2">
          {!p.compact && <Button onClick={() => park.mutate()}>Park</Button>}
          <Button variant={p.compact ? 'secondary' : 'primary'} disabled={!canSend || send.isPending} onClick={() => send.mutate()}>
            Send this thread
          </Button>
        </span>
      </div>
      {send.error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {(send.error as Error).message}
        </p>
      )}
      {!p.compact && <p className="mt-2 text-[11.5px] text-ink-3">{HOW_SENDING_WORKS}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Write the item card and the message list**

`packages/web/src/pages/ItemCard.tsx`:
```tsx
import type { ThreadDetail } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { Fragment, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SCREEN_NAMES = { diagram: 'diagram', database: 'database', mockups: 'mockup', flows: 'flow', list: 'list' } as const;

export function ItemCard({ detail, repo, project }: { detail: ThreadDetail; repo: string; project: string }) {
  const [open, setOpen] = useState(true);
  const item = detail.item;
  const fields = Object.entries(item.fields ?? {}).filter(([k]) => k !== 'blocking');
  const row = (label: string, value: ReactNode) => (
    <Fragment key={label}>
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </Fragment>
  );
  return (
    <section aria-label="Item" className="rounded-[10px] border-[0.5px] border-separator bg-cell px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-ink-3">{detail.type.title}</div>
          <h1 className="text-[20px] font-semibold leading-tight">
            {item.fields?.blocking === 'true' && <span className="mr-2 align-middle text-[11px] font-semibold text-seal">BLOCKING</span>}
            {item.title}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-2">{item.summary}</p>
        </div>
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="shrink-0 text-[12px] text-slate">
          {open ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {open && (
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[12.5px] md:grid-cols-[120px_1fr]">
          {fields.map(([k, v]) => row(k, v))}
          {item.body &&
            row(
              'Detail',
              <div className="doc text-[13px]">
                <Markdown remarkPlugins={[remarkGfm]}>{item.body}</Markdown>
              </div>,
            )}
          {item.mdAnchor &&
            row(
              'In the draft',
              <Link to="/p/$repo/$project/d/$doc" params={{ repo, project, doc: 'draft' }} className="text-slate">
                § {item.mdAnchor.heading}
              </Link>,
            )}
          {item.codeRefs?.length
            ? row(
                'Code',
                <ul>
                  {item.codeRefs.map((r) => (
                    <li key={`${r.path}#${r.symbol ?? ''}`} className="break-all font-mono text-[11.5px]">
                      {r.path}
                      {r.symbol ? ` · ${r.symbol}` : ''} {r.verified ? <span className="text-moss">✓</span> : <span className="font-sans text-amber">not found</span>}
                    </li>
                  ))}
                </ul>,
              )
            : null}
          {detail.linked.length > 0 &&
            row(
              'Linked',
              <ul>
                {detail.linked.map((l) => (
                  <li key={l.itemId}>
                    <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: l.threadId }} className="text-slate">
                      {l.typeTitle} › {l.title}
                    </Link>
                  </li>
                ))}
              </ul>,
            )}
          {detail.decisions.length > 0 &&
            row(
              'Decisions',
              <ul>
                {detail.decisions.map((d) => (
                  <li key={d.id}>{d.text}</li>
                ))}
              </ul>,
            )}
          {item.flags?.length
            ? row(
                'May need another look',
                <ul className="text-amber">
                  {item.flags.map((f) => (
                    <li key={`${f.fromThreadId}${f.at}`}>{f.reason}</li>
                  ))}
                </ul>,
              )
            : null}
          {detail.type.screen !== 'list' && row('View', <span className="text-ink-3">The {SCREEN_NAMES[detail.type.screen]} view arrives in a later update.</span>)}
        </dl>
      )}
    </section>
  );
}
```

`packages/web/src/pages/MessageList.tsx`:
```tsx
import type { ClaudeMessage, Message, ThreadDetail, YouMessage } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api/client';
import { formatUpdated } from '../lib/time';

const seconds = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
const took = (s: number) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);

function EditLine({ repo, project, changeId, summary, state }: { repo: string; project: string; changeId: string; summary: string; state?: string }) {
  const qc = useQueryClient();
  const act = useMutation({
    mutationFn: (action: 'undo' | 'apply') => api.changeAction(repo, project, changeId, action),
    onSuccess: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === repo && q.queryKey[2] === project }),
  });
  return (
    <li className="text-[12px] text-ink-2">
      {state === 'pending' ? 'Small edit, not applied' : state === 'undone' ? 'Small edit, undone' : 'Already applied (small)'}: {summary}
      {state === 'applied' && (
        <button type="button" className="ml-2 text-slate" onClick={() => act.mutate('undo')}>
          Undo
        </button>
      )}
      {(state === 'pending' || state === 'undone') && (
        <button type="button" className="ml-2 text-slate" onClick={() => act.mutate('apply')}>
          Apply
        </button>
      )}
      {act.error && <span className="ml-2 text-seal">{(act.error as Error).message}</span>}
    </li>
  );
}

export function MessageList({ detail, repo, project }: { detail: ThreadDetail; repo: string; project: string }) {
  const messages = detail.thread.messages;
  const nextYou = (i: number) => messages.slice(i + 1).find((m): m is YouMessage => m.author === 'you');
  const nextClaude = (i: number) => messages.slice(i + 1).find((m): m is ClaudeMessage => m.author === 'claude');

  const claude = (m: ClaudeMessage, i: number) => {
    const isOpen = detail.open?.messageId === m.id;
    const chosen = nextYou(i);
    return (
      <div>
        <div className="text-[11.5px] text-ink-3">
          <span className="font-semibold text-ink-2">Claude</span> · {m.opening ? 'raised when the plan was imported' : formatUpdated(m.at)}
        </div>
        <div className="doc mt-0.5 text-[13.5px]">
          <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
        </div>
        {m.filesRead?.length ? (
          <details className="text-[12px] text-ink-3">
            <summary className="cursor-pointer">
              Read {m.filesRead.length} file{m.filesRead.length === 1 ? '' : 's'}
            </summary>
            <ul className="ml-4 font-mono text-[11.5px]">
              {m.filesRead.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </details>
        ) : null}
        {!isOpen && m.options?.length ? (
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[12.5px]">
            {m.options.map((o) => (
              <li key={o.id} className={chosen?.optionId === o.id ? 'text-ink' : 'text-ink-3'}>
                {chosen?.optionId === o.id ? '● ' : '○ '}
                {o.label}
                {chosen?.optionId === o.id && chosen.note ? <span className="text-ink-2"> · “{chosen.note}”</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {m.smallEdits?.length ? (
          <ul className="mt-1.5">
            {m.smallEdits.map((e) => (
              <EditLine key={e.changeId} repo={repo} project={project} changeId={e.changeId} summary={e.summary} state={detail.edits[e.changeId]?.state} />
            ))}
          </ul>
        ) : null}
        {m.newItemIds?.map((id) => {
          const ref = detail.refs[id];
          return ref ? (
            <p key={id} className="mt-1 text-[12px] text-ink-2">
              New thread opened in {ref.typeTitle}:{' '}
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: ref.threadId }} className="text-slate">
                {ref.title}
              </Link>
            </p>
          ) : null;
        })}
        {m.impacts?.map((imp) => {
          const ref = detail.refs[imp.itemId];
          return ref ? (
            <p key={imp.itemId} className="mt-1 text-[12px] text-ink-2">
              Might affect: {ref.typeTitle} › {ref.title}. {imp.reason} It's marked "may need another look".
            </p>
          ) : null;
        })}
      </div>
    );
  };

  const you = (m: YouMessage, i: number) => {
    const reply = nextClaude(i);
    return (
      <div className="border-l-2 border-slate pl-3">
        <div className="text-[11.5px] text-ink-3">
          <span className="font-semibold text-ink-2">You</span> · {formatUpdated(m.at)}
        </div>
        {m.optionLabel && <p className="text-[13px]">You chose: {m.optionLabel}</p>}
        {m.note && <p className="text-[13px] text-ink-2">“{m.note}”</p>}
        {m.text && <p className="whitespace-pre-wrap text-[13px]">{m.text}</p>}
        <p className="mt-0.5 text-[11px] text-ink-3">
          {m.sentWith === 'all' ? 'sent with Submit all' : 'sent on its own'}
          {reply ? ` · answered in ${took(seconds(m.at, reply.at))}` : ''}
        </p>
      </div>
    );
  };

  const render = (m: Message, i: number) =>
    m.author === 'claude' ? claude(m, i) : m.author === 'you' ? you(m, i) : <p className="text-[11.5px] text-ink-3">{m.text}</p>;

  return (
    <ol className="mt-4 flex flex-col gap-4" data-testid="messages">
      {messages.map((m, i) => (
        <li key={m.id}>{render(m, i)}</li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 5: Write the thread view and route to it**

`packages/web/src/pages/ThreadView.tsx`:
```tsx
import type { DisplayStatus } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../api/client';
import { AnswerForm } from '../components/AnswerForm';
import { Button } from '../components/Button';
import { StatusMark } from '../components/StatusMark';
import { ItemCard } from './ItemCard';
import { MessageList } from './MessageList';

const STATUS_TEXT: Record<DisplayStatus, string> = {
  your_turn: 'Your turn',
  draft: 'Draft, not sent',
  with_claude: 'With Claude',
  resolved: 'Resolved',
  parked: 'Parked',
  idle: 'Nothing needed',
};

export function ThreadView() {
  const { repo, project, thread } = useParams({ from: '/p/$repo/$project/th/$thread' });
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['thread', repo, project, thread], queryFn: () => api.thread(repo, project, thread) });
  const [notice, setNotice] = useState<string | null>(null);
  const unpark = useMutation({
    mutationFn: () => api.park(repo, project, thread, false),
    onSuccess: () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project }),
  });
  if (q.error) return <p className="text-[13px] text-seal">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  const d = q.data;
  const status = d.thread.display;

  return (
    <div className="max-w-3xl pb-28 md:pb-0" data-testid="thread-view">
      <Link to="/p/$repo/$project/t/$type" params={{ repo, project, type: d.type.id }} className="mb-2 inline-block text-[12.5px] text-slate">
        ‹ {d.type.title}
      </Link>
      <ItemCard detail={d} repo={repo} project={project} />
      <div className="mt-5 flex items-center gap-2">
        <StatusMark status={status} />
        <span className="text-[12px] text-ink-2" data-testid="thread-status">
          {STATUS_TEXT[status]}
        </span>
      </div>
      <MessageList detail={d} repo={repo} project={project} />
      {notice && (
        <p role="status" data-testid="send-notice" className="mt-3 text-[12.5px] text-ink-2">
          {notice}
        </p>
      )}
      <div className="mt-5">
        {status === 'with_claude' ? (
          <p className="text-[13px] text-ink-3">With Claude. A subagent is working on this thread.</p>
        ) : status === 'parked' ? (
          <Button onClick={() => unpark.mutate()}>Unpark</Button>
        ) : (
          <AnswerForm
            repo={repo}
            project={project}
            threadId={d.thread.id}
            open={d.open}
            presets={d.type.answerPresets}
            defaultValue={d.item.fields?.default}
            draft={d.thread.draft}
            previews={d.previews}
            onSent={(r) => setNotice(r.message)}
          />
        )}
      </div>
    </div>
  );
}
```

In `packages/web/src/router.tsx`:
- Import `ThreadView`.
- Add `const threadRoute = createRoute({ getParentRoute: () => projectRoute, path: 'th/$thread', component: ThreadView });`.
- Add `threadRoute` to `projectRoute.addChildren([...])`.

In `packages/web/src/pages/InboxView.tsx`, change each row's `<Link>` to:
```tsx
<Link key={e.threadId} to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: e.threadId }} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-selection" data-testid="inbox-row">
```

In `packages/web/src/pages/TypeView.tsx`, wrap each `Row` in a link to its thread. The row data now has `threadId` (Task 13):
```tsx
<Link key={i.id} to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: i.threadId }} className="block hover:bg-selection" data-testid="type-row">
  <Row … />
</Link>
```
Import `Link` from `@tanstack/react-router`, and move the `key` from `Row` to `Link`.

In `packages/web/src/pages/ProjectLayout.tsx`:
- Add `const onThread = Boolean(useMatch({ from: '/p/$repo/$project/th/$thread', shouldThrow: false }));` with the other hooks.
- Render the phone Submit-all bar only when `!onThread`. The thread view pins Send this thread there instead.

- [ ] **Step 6: Run the tests**

Run:
```bash
pnpm --filter @dev-plumbing/web typecheck
pnpm test:e2e
```
Expected: PASS: every `loop` spec and all earlier specs.

Notes for this step:
- Plan 1's "a plumbing type with items lists them" test still finds its rows inside the links.
- If `accent-slate` isn't generated, Tailwind v4 maps `accent-*` to the theme's colours; check `tokens.css` defines `--color-slate`.

- [ ] **Step 7: Commit**

```bash
git add packages/web
git commit -m "feat(web): the thread view: item card, conversation, answers with radios, notes and Custom" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 19: Web: list screens with inline answers, and + Question

Spec §10.4.5, option C from the design sessions:
- Questions, Concerns, Ideas, Phases, Testing and Security show rows you can answer in place: Claude's latest message, the radios, a note and Custom.
- The list opens on **Needs you**. Resolved items fold to one line with their decision.
- Each type adds its own fields: blocking and default for Questions, severity and likelihood for Concerns, effort for Ideas.
- **+ Question / + Concern / + Idea** start a thread with your message and send it.

**Files:**
- Create:
  - `packages/web/src/pages/ListScreen.tsx`
  - `packages/web/src/pages/AddItemForm.tsx`
  - `packages/web/e2e/list.spec.ts`
- Modify: `packages/web/src/pages/TypeView.tsx` (list screens render `ListScreen`)
- Test: `packages/web/e2e/list.spec.ts`

**Interfaces:**
- Consumes:
  - the Task 13 rows: `TypeItemRow` with `open`, `draft`, `decision`, `fields`, `latest` and `messageCount`
  - the Task 13 `TypeEntry` fields: `fields`, `answerPresets` and `addLabel`
  - `AnswerForm` (Task 18, `compact`), `api.addItem` (Task 17) and `Segmented`
- Produces:
  - `<ListScreen repo project data />`. Its rows have `data-testid="list-row"`.
  - `<AddItemForm repo project type onDone />`.

- [ ] **Step 1: Write the failing e2e tests**

`packages/web/e2e/list.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { importProject, type TestItem } from './claude';

const questions: TestItem[] = [
  {
    key: 'who',
    title: 'Who gets reminders?',
    summary: 'Changes the daily job.',
    fields: { blocking: 'true' },
    message: { text: 'Start with active subscribers?', options: [{ id: 'all', label: 'Everyone' }, { id: 'active', label: 'Active subscribers only' }], recommended: 'active' },
  },
  {
    key: 'days',
    title: 'How many days before?',
    summary: 'Lead time.',
    fields: { blocking: 'false', default: '5 days' },
    message: { text: 'How early?', options: [{ id: 'd3', label: '3 days' }, { id: 'd5', label: '5 days' }, { id: 'd7', label: '7 days' }] },
  },
  {
    key: 'retention',
    title: 'How long to keep rows?',
    summary: 'Retention.',
    message: { text: 'Keep 180 days?', options: [{ id: 'keep', label: 'Keep 180 days', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table for 180 days.' }] } }] },
  },
];
const rowFor = (page: import('@playwright/test').Page, title: string) => page.getByTestId('list-row').filter({ hasText: title });

test('answers questions inline without leaving the list', async ({ page }) => {
  const p = await importProject('list-inline', 'List inline', { questions });
  await page.goto(`${p.url}/t/questions`);
  await expect(page.getByRole('tab', { name: 'Needs you · 3' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('3 · 1 blocking open')).toBeVisible();
  const who = rowFor(page, 'Who gets reminders?');
  await expect(who.getByText('BLOCKING')).toBeVisible();
  await who.getByRole('radio', { name: /Active subscribers only/ }).check();
  await expect(who.getByText('Draft saved · goes with Submit all')).toBeVisible();
  const days = rowFor(page, 'How many days before?');
  await expect(days.getByText('Default', { exact: true })).toBeVisible();
  await expect(days.getByText("If you don't answer, the plan uses 5 days.")).toBeVisible();
  await days.getByRole('radio', { name: /7 days/ }).check();
  await expect(days.getByText('Draft saved · goes with Submit all')).toBeVisible();
  await page.getByRole('button', { name: 'Submit all · 2 drafts' }).first().click();
  await expect(page.getByTestId('submit-notice')).toContainText('No Claude window is listening');
  await page.getByRole('tab', { name: 'With Claude · 2' }).click();
  await expect(page.getByTestId('list-row')).toHaveCount(2);
});

test('a plain accept from the list folds the row with its decision', async ({ page }) => {
  const p = await importProject('list-accept', 'List accept', { questions });
  await page.goto(`${p.url}/t/questions`);
  const row = rowFor(page, 'How long to keep rows?');
  await row.getByRole('radio', { name: /Keep 180 days/ }).check();
  await row.getByRole('button', { name: 'Send this thread' }).click();
  await expect(page.getByRole('tab', { name: 'Resolved · 1' })).toBeVisible();
  await page.getByRole('tab', { name: 'Resolved · 1' }).click();
  await expect(rowFor(page, 'How long to keep rows?')).toContainText('→ How long to keep rows?: Keep 180 days');
});

test('concerns show severity and offer the presets', async ({ page }) => {
  const p = await importProject('list-concerns', 'List concerns', {
    concerns: [{ key: 'twice', title: 'Job runs twice', summary: 'Duplicate sends.', fields: { severity: 'high', likelihood: 'unlikely' }, message: { text: 'A second run could send twice. Fix: one reminder per customer per day.' } }],
  });
  await page.goto(`${p.url}/t/concerns`);
  const row = rowFor(page, 'Job runs twice');
  await expect(row.getByText('High · unlikely')).toBeVisible();
  for (const name of ["Accept Claude's fix", 'Accept the risk', 'Custom answer']) await expect(row.getByRole('radio', { name })).toBeVisible();
});

test('+ Question starts a thread with your message and sends it', async ({ page }) => {
  const p = await importProject('list-add', 'List add', { questions: [questions[0]!] });
  await page.goto(`${p.url}/t/questions`);
  await page.getByRole('button', { name: '+ Question' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Opt-out link in every email?');
  await page.getByRole('textbox', { name: 'Your message' }).fill('Legal will ask for one. Can we add it?');
  await page.getByRole('button', { name: 'Add and send' }).click();
  await expect(page).toHaveURL(/\/th\/t-questions-opt-out-link-in-every-email$/);
  await expect(page.getByText('Legal will ask for one. Can we add it?')).toBeVisible();
  await expect(page.getByTestId('thread-status')).toHaveText('With Claude');
});
```

Run: `pnpm test:e2e list`
Expected: FAIL, because list screens don't answer inline.

- [ ] **Step 2: Write `AddItemForm`**

`packages/web/src/pages/AddItemForm.tsx`:
```tsx
import type { TypeEntry } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { inputClass } from '../components/inputClass';

/** + Question / + Concern / + Idea: a new item whose thread starts with your message, sent to Claude straight away. */
export function AddItemForm({ repo, project, type, onDone }: { repo: string; project: string; type: TypeEntry; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const add = useMutation({
    mutationFn: () => api.addItem(repo, project, { type: type.id, title, text }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === repo && q.queryKey[2] === project });
      void navigate({ to: '/p/$repo/$project/th/$thread', params: { repo, project, thread: r.threadId } });
    },
  });
  return (
    <form
      aria-label={`New ${type.addLabel ?? 'item'}`}
      className="mt-3 rounded-[10px] border-[0.5px] border-separator bg-cell p-3"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <label className="block text-[12.5px] text-ink-2">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mt-1`} autoFocus />
      </label>
      <label className="mt-2 block text-[12.5px] text-ink-2">
        Your message
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className={`${inputClass} mt-1`} />
      </label>
      {add.error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {(add.error as Error).message}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="submit" disabled={!title.trim() || !text.trim() || add.isPending}>
          Add and send
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Write `ListScreen`**

`packages/web/src/pages/ListScreen.tsx`:
```tsx
import type { DisplayStatus, TypeEntry, TypeItemRow } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { AnswerForm } from '../components/AnswerForm';
import { Button } from '../components/Button';
import { Group } from '../components/GroupedList';
import { Segmented } from '../components/Segmented';
import { StatusMark } from '../components/StatusMark';
import { AddItemForm } from './AddItemForm';

type Filter = 'needs' | 'claude' | 'resolved' | 'all';
const STATUS_TEXT: Record<DisplayStatus, string> = { your_turn: 'your turn', draft: 'draft', with_claude: 'with Claude', resolved: 'resolved', parked: 'parked', idle: '' };
const RISK: Record<string, string> = { critical: 'text-seal', high: 'text-seal', medium: 'text-amber', low: 'text-ochre' };
const KNOWN = ['blocking', 'default', 'severity', 'likelihood', 'effort'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function FieldTags({ row }: { row: TypeItemRow }) {
  const f = row.fields;
  const parts: ReactNode[] = [];
  if (f.blocking === 'false' && f.default) parts.push(<span key="default">not blocking · default {f.default}</span>);
  if (f.severity) {
    parts.push(
      <span key="severity" className={`font-semibold ${RISK[f.severity.toLowerCase()] ?? 'text-ink-3'}`}>
        {cap(f.severity)}
        {f.likelihood ? ` · ${f.likelihood.toLowerCase()}` : ''}
      </span>,
    );
  }
  if (f.effort) parts.push(<span key="effort">Effort {f.effort}</span>);
  for (const [k, v] of Object.entries(f)) if (!KNOWN.includes(k)) parts.push(<span key={k}>{k} {v}</span>);
  return parts.length ? <span className="flex flex-wrap gap-x-2 text-[11px] text-ink-3">{parts}</span> : null;
}

function ListRow({ row, type, repo, project }: { row: TypeItemRow; type: TypeEntry; repo: string; project: string }) {
  const thread = { to: '/p/$repo/$project/th/$thread', params: { repo, project, thread: row.threadId } } as const;
  if (row.status === 'resolved' || row.status === 'parked') {
    return (
      <Link {...thread} className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-selection" data-testid="list-row">
        <span className="text-ink-3">▸</span>
        <span className="font-medium">{row.title}</span>
        {row.decision && <span className="min-w-0 truncate text-ink-2">→ {row.decision}</span>}
        <span className="ml-auto shrink-0">
          <StatusMark status={row.status} />
        </span>
      </Link>
    );
  }
  const answerable = row.status !== 'with_claude' && (row.open || type.answerPresets.length > 0 || row.messageCount > 0);
  return (
    <div className="px-3 py-3" data-testid="list-row">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <StatusMark status={row.status} />
        {row.blocking && <span className="text-[10.5px] font-semibold text-seal">BLOCKING</span>}
        <span className="text-[13.5px] font-semibold">{row.title}</span>
        <FieldTags row={row} />
        <span className="ml-auto text-[11.5px] text-ink-3">{STATUS_TEXT[row.status]}</span>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-3">
        {row.summary}
        {row.flagged ? <span className="text-amber"> · may need another look</span> : null}
      </p>
      {row.latest && (
        <p className="mt-1.5 text-[12.5px] text-ink-2">
          <span className="text-[11px] font-semibold text-ink-3">{row.latest.author === 'claude' ? 'Claude' : row.latest.author === 'you' ? 'You' : ''} · </span>
          {row.latest.text}
        </p>
      )}
      {answerable && (
        <div className="mt-2">
          <AnswerForm repo={repo} project={project} threadId={row.threadId} open={row.open} presets={type.answerPresets} defaultValue={row.fields.default} draft={row.draft} compact />
        </div>
      )}
      {row.fields.blocking === 'false' && row.fields.default && <p className="mt-1 text-[11.5px] text-ink-3">If you don't answer, the plan uses {row.fields.default}.</p>}
      <Link {...thread} className="mt-1.5 inline-block text-[12px] text-slate">
        Open thread ({row.messageCount} message{row.messageCount === 1 ? '' : 's'}) →
      </Link>
    </div>
  );
}

export function ListScreen({ repo, project, data }: { repo: string; project: string; data: { type: TypeEntry; items: TypeItemRow[] } }) {
  const { type, items } = data;
  const needs = items.filter((i) => i.status === 'your_turn' || i.status === 'draft' || i.status === 'idle');
  const withClaude = items.filter((i) => i.status === 'with_claude');
  const done = items.filter((i) => i.status === 'resolved' || i.status === 'parked');
  const [filter, setFilter] = useState<Filter>(needs.length ? 'needs' : 'all');
  const [adding, setAdding] = useState(false);
  const shown = filter === 'needs' ? needs : filter === 'claude' ? withClaude : filter === 'resolved' ? done : items;
  const blockingOpen = items.filter((i) => i.blocking && i.status !== 'resolved' && i.status !== 'parked').length;

  return (
    <div>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[20px] font-semibold">{type.title}</h2>
        <span className="text-[12px] text-ink-3">
          {items.length}
          {type.fields.includes('blocking') ? ` · ${blockingOpen} blocking open` : ''}
        </span>
        {type.addLabel && !adding && (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            + {type.addLabel}
          </Button>
        )}
      </header>
      {adding && <AddItemForm repo={repo} project={project} type={type} onDone={() => setAdding(false)} />}
      <div className="mt-3 max-w-lg">
        <Segmented<Filter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'needs', label: `Needs you · ${needs.length}` },
            { value: 'claude', label: `With Claude · ${withClaude.length}` },
            { value: 'resolved', label: `Resolved · ${done.length}` },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {shown.length ? (
        <Group>
          {shown.map((row) => (
            <ListRow key={row.id} row={row} type={type} repo={repo} project={project} />
          ))}
        </Group>
      ) : (
        <p className="mt-6 text-[13px] text-ink-3">Nothing here.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Render it for list screens**

In `packages/web/src/pages/TypeView.tsx`, after the `noChanges` early return, add:
```tsx
  if (data.type.screen === 'list') return <ListScreen repo={repo} project={project} data={data} />;
```
Import `ListScreen` from `./ListScreen`.

- [ ] **Step 5: Run the tests**

Run:
```bash
pnpm --filter @dev-plumbing/web typecheck
pnpm test:e2e
```
Expected: PASS. Plan 1's "a plumbing type with items lists them" test now renders Questions as a list screen. If that test looked for something only the old rows had, keep its intent: the rows are listed with their titles and status. Point it at `list-row`, and say so in your report.

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "feat(web): list screens with inline answers, and + Question / + Concern / + Idea" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 20: Web: the Draft's Changes view

Spec §10.2 says **Draft** can highlight every change against the original, and each change links to the thread that caused it. The Draft document gets a **Document | Changes** switch. **Changes** has two parts:
- **The diff:** every change since the original, with "changed by" links on each added part.
- **The list:** every recorded change, with Undo for small edits and Apply for pending ones.

**Files:**
- Create:
  - `packages/web/src/pages/ChangesView.tsx`
  - `packages/web/e2e/documents.spec.ts`
- Modify: `packages/web/src/pages/DocumentView.tsx`
- Test: `packages/web/e2e/documents.spec.ts`

**Interfaces:**
- Consumes:
  - From Task 17: `api.changes` and `api.changeAction`.
  - From Task 18: `DiffView`.
  - From Task 13: `ChangesResponse`, `ChangeEntry` and `DiffSegment.changedBy`.
- Produces: `<ChangesView repo project />` with `data-testid="changes"`.

- [ ] **Step 1: Write the failing e2e tests**

`packages/web/e2e/documents.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { api, asClaude, importProject } from './claude';

const channels = { key: 'channels', title: 'Which channels?', summary: 'SMS or email.', message: { text: 'SMS, email or both?' } };

test('the Draft shows what changed and which thread changed it, with Undo for small edits', async ({ page }) => {
  const p = await importProject('docs-changes', 'Docs changes', { questions: [channels] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/threads/t-questions-channels/draft`, 'PUT', { text: 'Both.' });
  await api(`${P}/submit`, 'POST', { scope: 'all' });
  await asClaude('/wait', { repo: p.repo, project: p.project, windowId: 'w-e2e-docs', timeoutSeconds: 0 });
  await asClaude('/reply', {
    repo: p.repo,
    project: p.project,
    threadId: 't-questions-channels',
    text: 'Both, and I tidied the wording.',
    smallEdits: [{ summary: 'Clearer channels wording', change: { md: [{ find: 'Send by SMS.', replace: 'Send by SMS and email.' }] } }],
    resolve: { decision: 'Reminders go by SMS and email' },
  });

  await page.goto(`${p.url}/d/draft`);
  await expect(page.getByTestId('document')).toContainText('Send by SMS and email.');
  await page.getByRole('tab', { name: 'Changes' }).click();
  const changes = page.getByTestId('changes');
  await expect(changes.getByTestId('diff')).toContainText('+ Send by SMS and email.');
  await expect(changes.getByTestId('diff')).toContainText('− Send by SMS.');
  await expect(changes).toContainText('changed by: Which channels?');
  await changes.getByRole('button', { name: 'Undo' }).click();
  await expect(changes).toContainText('Undone');
  await expect(changes).toContainText('The draft is the same as the original so far.');
});

test('an accepted option is listed as accepted, without Undo', async ({ page }) => {
  const keep = { id: 'keep', label: 'Keep 180 days', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table for 180 days.' }] } };
  const p = await importProject('docs-accept', 'Docs accept', { questions: [{ key: 'keep', title: 'How long to keep rows?', summary: 'Retention.', message: { text: 'Keep 180 days?', options: [keep] } }] });
  const P = `/api/projects/${p.repo}/${p.project}`;
  await api(`${P}/threads/t-questions-keep/draft`, 'PUT', { optionId: 'keep' });
  await api(`${P}/submit`, 'POST', { scope: 'thread', threadId: 't-questions-keep' });
  await page.goto(`${p.url}/d/draft`);
  await page.getByRole('tab', { name: 'Changes' }).click();
  const changes = page.getByTestId('changes');
  await expect(changes).toContainText('Accepted');
  await expect(changes).toContainText('How long to keep rows?: Keep 180 days');
  await expect(changes.getByRole('button', { name: 'Undo' })).toHaveCount(0);
});
```

Run: `pnpm test:e2e documents`
Expected: FAIL, because there's no Changes tab.

- [ ] **Step 2: Write `ChangesView`**

`packages/web/src/pages/ChangesView.tsx`:
```tsx
import type { ChangeState, DiffSegment } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Fragment } from 'react';
import { api } from '../api/client';
import { DiffView } from '../components/DiffView';
import { Group, Row } from '../components/GroupedList';
import { formatUpdated } from '../lib/time';

const STATE: Record<ChangeState, string> = { applied: 'Applied', undone: 'Undone', pending: 'Not applied' };

/** The Draft against the original, each change linked to the thread that caused it, and every recorded change. */
export function ChangesView({ repo, project }: { repo: string; project: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['changes', repo, project], queryFn: () => api.changes(repo, project) });
  const act = useMutation({
    mutationFn: (v: { id: string; action: 'undo' | 'apply' }) => api.changeAction(repo, project, v.id, v.action),
    onSuccess: () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project }),
  });
  if (q.error) return <p className="text-[13px] text-seal">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  const { segments, entries } = q.data;

  const changedBy = (s: DiffSegment) =>
    s.changedBy?.length ? (
      <p className="font-sans text-[11.5px] text-ink-3">
        changed by:{' '}
        {s.changedBy.map((c, i) => (
          <Fragment key={c.changeId}>
            {i ? ', ' : ''}
            <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: c.threadId }} className="text-slate">
              {c.threadTitle}
            </Link>
          </Fragment>
        ))}
      </p>
    ) : null;

  return (
    <div data-testid="changes" className="max-w-[80ch]">
      {segments.some((s) => s.kind !== 'same') ? (
        <DiffView segments={segments} renderChangedBy={changedBy} />
      ) : (
        <p className="text-[13px] text-ink-3">The draft is the same as the original so far.</p>
      )}
      <Group title="Changes">
        {entries.length === 0 && <Row title={<span className="font-normal text-ink-3">No changes yet.</span>} />}
        {entries.map((e) => (
          <Row
            key={e.id}
            title={e.summary}
            meta={`${e.kind === 'accept' ? 'Accepted' : 'Small edit'} · ${STATE[e.state]} · ${formatUpdated(e.at)}`}
            trailing={
              <span className="flex shrink-0 items-center gap-3 text-[12px]">
                <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: e.threadId }} className="hidden text-slate md:inline">
                  {e.threadTitle}
                </Link>
                {e.kind === 'small-edit' && e.state === 'applied' && (
                  <button type="button" className="text-slate" onClick={() => act.mutate({ id: e.id, action: 'undo' })}>
                    Undo
                  </button>
                )}
                {e.kind === 'small-edit' && e.state !== 'applied' && (
                  <button type="button" className="text-slate" onClick={() => act.mutate({ id: e.id, action: 'apply' })}>
                    Apply
                  </button>
                )}
              </span>
            }
          />
        ))}
      </Group>
      {act.error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {(act.error as Error).message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the switch to the Draft**

Replace `packages/web/src/pages/DocumentView.tsx` with:
```tsx
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api/client';
import { Segmented } from '../components/Segmented';
import { ChangesView } from './ChangesView';

export function DocumentView() {
  const { repo, project, doc } = useParams({ from: '/p/$repo/$project/d/$doc' });
  const [mode, setMode] = useState<'document' | 'changes'>('document');
  const { data, error } = useQuery({ queryKey: ['doc', repo, project, doc], queryFn: () => api.document(repo, project, doc) });
  const switcher =
    doc === 'draft' ? (
      <div className="mb-4 max-w-xs">
        <Segmented
          label="Draft view"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'document', label: 'Document' },
            { value: 'changes', label: 'Changes' },
          ]}
        />
      </div>
    ) : null;
  if (doc === 'draft' && mode === 'changes') {
    return (
      <>
        {switcher}
        <ChangesView repo={repo} project={project} />
      </>
    );
  }
  if (error) return <p className="text-[13px] text-seal">{(error as Error).message}</p>;
  if (!data) return null;
  if (data.text === null) {
    return <p className="text-[13px] text-ink-3">{doc === 'final' ? 'No final version yet. Finalize spec creates it.' : 'This document is missing.'}</p>;
  }
  return (
    <>
      {switcher}
      <article className="doc max-w-[72ch]" data-testid="document">
        <Markdown remarkPlugins={[remarkGfm]}>{data.text}</Markdown>
      </article>
    </>
  );
}
```

- [ ] **Step 4: Run the tests**

Run:
```bash
pnpm --filter @dev-plumbing/web typecheck
pnpm test:e2e
```
Expected: PASS, including Plan 1's document test ("shows the original and the draft").

- [ ] **Step 5: Commit**

```bash
git add packages/web
git commit -m "feat(web): the Draft's Changes view with changed-by links, Undo and Apply" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 21: The real-Claude smoke test, README and full check

Everything so far is tested without Claude. This task runs the real thing once:
- Claude Code with the plugin runs `/dev-plumbing` on a small plan, in a scratch repo, with a temporary dev-plumbing home.
- A script answers one thread the way you would in the browser.
- A thread subagent replies.

The results are recorded with their evidence, like Plan 1's spike. An optional long run checks that a 35-minute wait survives the stdio idle timeout. Then the README is updated, the whole check runs, and the branch is committed.

**Files:**
- Create:
  - `scripts/smoke-plan.md`
  - `scripts/smoke-user.mjs`
  - `scripts/smoke-claude.sh` (executable)
  - `smoke/RESULTS.md`
- Modify:
  - `README.md`
  - `package.json` (a `smoke` script)
- Test: the smoke run itself, plus `pnpm check`.

**Interfaces:**
- Consumes everything above. It needs the `claude` CLI on PATH and logged in, as the spike did.
- Produces `smoke/RESULTS.md`, with yes or no for each check and the evidence.

- [ ] **Step 1: Write the smoke plan and the "user"**

`scripts/smoke-plan.md`:
```markdown
# Restock reminders

Remind customers before a subscription item runs out, and let them reorder in one tap.

## Approach

A daily job finds subscriptions due in the next few days and sends a reminder. We haven't decided whether reminders go by SMS, email or both, or how many days before the due date to send them.

## Data

Log reminders in a table.

## Open points

- Should customers be able to snooze a reminder?
- What happens if the daily job runs twice on the same day?
```

`scripts/smoke-user.mjs`:
```js
// Plays the user for scripts/smoke-claude.sh. It waits for the import, answers one question the way the
// browser would, then waits for Claude's reply. Exits non-zero if anything doesn't happen in time.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.env.DEV_PLUMBING_HOME;
const long = process.env.DP_SMOKE_LONG === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[user ${new Date().toISOString().slice(11, 19)}] ${msg}`);

async function call(route, method = 'GET', body) {
  const run = JSON.parse(fs.readFileSync(path.join(dir, 'run', 'service.json'), 'utf8'));
  const res = await fetch(`http://127.0.0.1:${run.port}${route}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-dev-plumbing-token': run.token },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ok: res.ok, body: await res.json() };
}

async function until(what, fn, minutes) {
  const end = Date.now() + minutes * 60_000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // The service may not be up yet.
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

const P = '/api/projects/acme-app/restock-reminders';
const started = Date.now();
const home = await until('the import to finish', async () => {
  const r = await call(P);
  return r.ok && r.body.project.status === 'active' ? r.body : null;
}, 15);
log(`Import finished in ${Math.round((Date.now() - started) / 1000)} s.`);
for (const t of home.types) log(`  ${t.title}: ${t.noChanges ? `no changes (${t.noChanges.reason})` : `${t.itemCount} items`}`);
log(`Repo profile saved: ${fs.existsSync(path.join(dir, 'repos', 'acme-app.json')) ? 'yes' : 'no'}`);

const target = home.inbox.find((e) => e.status === 'your_turn');
if (!target) throw new Error('No thread is waiting for an answer.');
const detail = (await call(`${P}/threads/${target.threadId}`)).body;
const choice = detail.open?.options.find((o) => !o.change);
const draft = choice ? { optionId: choice.id, note: 'Go with this, and keep it simple.' } : { text: 'Use your recommendation, and keep it simple.' };
if (long) {
  log('Waiting 35 minutes before answering, to check the long wait survives...');
  await sleep(35 * 60_000);
}
await call(`${P}/threads/${target.threadId}/draft`, 'PUT', draft);
const sent = (await call(`${P}/submit`, 'POST', { scope: 'thread', threadId: target.threadId })).body;
log(`Answered "${target.itemTitle}": ${sent.message}`);

const sentAt = Date.now();
const reply = await until("Claude's reply", async () => {
  const d = (await call(`${P}/threads/${target.threadId}`)).body;
  const last = d.thread.messages.at(-1);
  return last?.author === 'claude' && d.thread.status !== 'with_claude' ? last : null;
}, 15);
log(`Claude replied in ${Math.round((Date.now() - sentAt) / 1000)} s: ${reply.text.slice(0, 160)}`);
log('Smoke test passed.');
```

- [ ] **Step 2: Write the runner**

`scripts/smoke-claude.sh`:
```bash
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
cleanup() { node "$cli" stop >/dev/null 2>&1 || true; }
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
( cd "$repo" && claude -p "Use the dev-plumbing skill to plumb docs/specs/restock-reminders.md." \
    --plugin-dir "$root/plugin" --permission-mode bypassPermissions \
    --output-format stream-json --verbose > "$work/transcript.jsonl" 2> "$work/claude.err" ) &
claude=$!
status=0
wait "$user" || status=$?
kill "$claude" 2>/dev/null || true
echo "Transcript: $work/transcript.jsonl"
echo "dp tool calls made inside subagents (parent_tool_use_id set):"
grep -h '"parent_tool_use_id":"' "$work/transcript.jsonl" | grep -o '"name":"mcp__plugin_dev-plumbing_dp__[^"]*"' | sort | uniq -c || true
echo "dp tool calls made by the main window:"
grep -h '"parent_tool_use_id":null' "$work/transcript.jsonl" | grep -o '"name":"mcp__plugin_dev-plumbing_dp__[^"]*"' | sort | uniq -c || true
exit "$status"
```

Run: `chmod +x scripts/smoke-claude.sh`

In the root `package.json`, add the script `"smoke": "bash scripts/smoke-claude.sh"`.

- [ ] **Step 3: Run it and record the results**

Run: `pnpm smoke`
Expected: the "user" prints the import summary, the repo profile line, the answer and Claude's reply, then "Smoke test passed." The tool-call counts list:
- `dp_repo_profile`, `dp_context` and `dp_write_items` inside subagents
- `dp_context` and `dp_reply` inside subagents
- `dp_open` and `dp_wait` from the main window

If a subagent can't call its dp tools, the tool names in its `tools:` line don't match what Claude Code shows.
- Look in the transcript for the exact names it lists.
- Fix `plugin/agents/*.md`. If the exact names can't work, the server-level form `mcp__plugin_dev-plumbing_dp__*` is documented as allowed.
- Update `packages/mcp/test/plugin.test.ts` to match, and run again.
- Record what you changed.

Then run the long check once: `DP_SMOKE_LONG=1 pnpm smoke`. It takes about 40 minutes, so run it in the background. It passes if Claude still replies after the 35-minute wait, which means progress notifications kept the call alive.

Write `smoke/RESULTS.md`. Fill every row from the runs above; don't leave any blank:
```markdown
# Smoke test: the Claude loop with real Claude Code

Date: <date> · Claude Code version: <`claude --version`>

| Check | Result | Evidence |
|---|---|---|
| repo-setup subagent saved a repo profile | yes/no | user log line, `repos/acme-app.json` |
| Importers wrote Questions and Concerns | yes/no | user log: items per type |
| Main window called dp_open and dp_wait | yes/no | main-window tool counts |
| Subagents called dp_context, dp_write_items and dp_reply | yes/no | subagent tool counts |
| A thread subagent replied after Send this thread | yes/no | "Claude replied in N s" |
| A 35-minute wait survived (progress kept it alive) | yes/no | long run log |
| Agent tool names in `tools:` worked unchanged | yes/no | what changed, if anything |

Notes: <anything surprising, and any fix made>
```

- [ ] **Step 4: Update the README**

In `README.md`:
- Change the status line to: `**Status:** the Claude loop works. Import a plan, answer threads in the app, and Claude replies through subagents. Visual screens, Finalize spec and Whiteboard Defense come next. The design is in [SPEC.md](SPEC.md), and the plans are in [docs/superpowers/plans](docs/superpowers/plans).`
- After the Install section, add:
````markdown
## Use it

Setup installs the Claude Code plugin for your user (skip it with `--no-plugin`). In any clone of a repo, in Claude Code:

```
/dev-plumbing docs/specs/my-feature.md
```

- **First time in a repo:** Claude detects a repo profile. You can check it in **Settings → Repos**.
- **Import:** one subagent per plumbing type reads the plan, and the app opens on the plumbing project.
- **Answer:** in the app, answer threads, then press **Send this thread** or **Submit all**. Claude answers each thread with a subagent and listens for more.
- **Keep chatting:** after two minutes the listening call moves to the background, so you can keep using the Claude window.
- **No arguments:** `/dev-plumbing` lists this repo's plumbing projects to reopen.
````
- In the Develop section, add these lines to the commands block:
```
pnpm smoke            # real Claude Code end to end, with a scratch repo (makes model calls)
claude --plugin-dir plugin   # try the plugin from this checkout without installing it
```

- [ ] **Step 5: Run the full check**

Run:
```bash
pnpm install --frozen-lockfile && pnpm check
git grep -n -i -E "refill|/Users/jordanframpton" -- . ':!pnpm-lock.yaml' ':!docs/superpowers/plans'
ls -d "${TMPDIR:-/tmp}"/dp-* 2>/dev/null | wc -l
```
Expected:
- `pnpm check` passes: typecheck clean, then unit, integration (including the bridge test) and e2e.
- The grep prints nothing.
- The temp-folder count is the same before and after `pnpm check`. Task 1's cleanup covers the new tests too.

- [ ] **Step 6: Commit**

```bash
git add scripts smoke README.md package.json
git commit -m "test: real Claude Code smoke test with results, and README for the Claude loop" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The controller pushes the branch after the final review, as in Plan 1.

---

## Not in this plan

These come later, or were deferred from Plan 1 with a reason.

- **Plan 3 (visual screens):**
  - the diagram renderer
  - Database, UI mockups, Flows and the Phases timeline, drawn from the `data` importers already write
  - mockup HTML files
- **Plan 4:**
  - Finalize spec
  - Bring changes in, for a plan edited in the repo after import, which needs re-import with ids matched by `key`
  - **Detect again** for repo profiles
- **Plan 5:** Whiteboard Defense.
- **Undo for accepted options** (Decision 4).
- **From Plan 1's follow-ups, not urgent for the loop:**
  - symlinked config files replaced by atomic writes
  - the same repo and id in two folders
  - broken rules files with uppercase or underscores in the name can't be opened in the editor
  - Load more past 200 projects
  - `--port NaN`
  - service signal-handler ordering
  - Button radii and Segmented keyboard support
  - the `test:e2e -- <name>` filter. Use `pnpm test:e2e <name>`.
  - the rest of the deferred minors list
- **ETag/If-Match** for the config editors. Thread writes don't need it, because of the lock (Decision 8).
