import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readItem, readProjectFile, readThread, writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { DRAFT, makeRepo } from '../../core/test/fixtures';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const P = '/api/projects/acme-app/restock-reminders';
const PLAN = 'docs/specs/restock-reminders.md';
const base = { repo: 'acme-app', project: 'restock-reminders' };
const ONE_ROW = { id: 'one-row', label: 'One row per reminder', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per reminder sent.' }] } };
const QUESTIONS = [
  { key: 'log', title: 'What do we log?', summary: 'The reminders table.', message: { text: 'One row per reminder?', options: [ONE_ROW, { id: 'none', label: 'Nothing' }] } },
  { key: 'who', title: 'Who gets reminders?', summary: 'Everyone or some?', message: { text: 'Who first?' } },
];
/** The plan's v2 in the repo: a new title, a new Approach line (clean), and a new Data line, which the draft also changed. */
const V2 = DRAFT.replace('# Restock reminders', '# Restock alerts')
  .replace('A daily job finds', 'An hourly job finds')
  .replace('Log reminders in a table.', 'Log reminders in the events table.');
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Every file and folder under `dir`, with each file's text. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (d: string): Promise<void> => {
    for (const entry of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        out[p] = 'folder';
        await walk(p);
      } else {
        out[p] = await fs.readFile(p, 'utf8');
      }
    }
  };
  await walk(dir);
  return out;
}

/** git in the clone, as the user would run it. */
const gitIn = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Acme', '-c', 'user.email=dev@acme.test', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, encoding: 'utf8' }).trim();

/** A clone with the plan's v1, its repo profile, and the service. Nothing is opened yet. `now` is the windows' clock. */
async function harness(o: { now?: () => number } = {}) {
  const s = await makeContext();
  const repo = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
  await writeJsonAtomic(path.join(s.ctx.configDir, 'repos', 'acme-app.json'), { name: 'acme-app', match: ['github.com/acme/acme-app'] });
  const rt = createRuntime({ now: o.now });
  const app = createApp(s.ctx, rt);
  const send = async (method: string, route: string, body?: unknown): Promise<{ status: number; body: Json }> => {
    const res = await call(app, route, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json() };
  };
  const claude = (route: string, body: unknown) => send('POST', `/api/claude${route}`, body);
  return { ...s, rt, app, send, claude, repo, dir: path.join(s.root, 'acme-app', 'restock-reminders') };
}
type Setup = Awaited<ReturnType<typeof harness>>;

/** Sends one batch per import type: `questions` (and `removed`, if given) for Questions, "no changes" for every other type. */
async function importAll(t: Setup, types: { id: string }[], questions: unknown[], removed?: string[]): Promise<Json[]> {
  const results: Json[] = [];
  for (const type of types) {
    const batch = type.id === 'questions' ? { items: questions, ...(removed ? { removed } : {}) } : { noChanges: 'None.' };
    const r = await t.claude('/items', { ...base, type: type.id, ...batch });
    if (r.status !== 200) throw new Error(`${type.id}: ${r.body.error}`);
    results.push(r.body);
  }
  return results;
}

/** The plan imported from the clone, with two questions. */
async function setup() {
  const t = await harness();
  const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
  await importAll(t, open.body.importTypes, QUESTIONS);
  return t;
}

/** The user accepts "One row per reminder" in the browser, so the draft's Data line differs from the plan's. */
async function acceptOneRow(t: Setup) {
  await t.send('PUT', `${P}/threads/t-questions-log/draft`, { optionId: 'one-row' });
  expect((await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-log' })).body).toMatchObject({ resolved: 1 });
}

/** A teammate's change to the plan reaches this clone. With `commit`, it's committed, and the new HEAD is returned. */
async function rewritePlan(t: Setup, text: string, o: { commit?: boolean } = {}): Promise<string | null> {
  await fs.writeFile(path.join(t.repo, PLAN), text);
  if (!o.commit) return null;
  gitIn(t.repo, 'add', '-A');
  gitIn(t.repo, 'commit', '-q', '--no-verify', '-m', 'Restock alerts');
  return gitIn(t.repo, 'rev-parse', 'HEAD');
}

const ASK_V2 =
  'Ask the user: "The plan changed in the repo since v1 (3 lines added, 3 removed). Update to v2?" with the options "Update to v2" and "Not now". Then call dp_open again with the same plan or project and update: true or update: false.';
const IMPORT_NEXT =
  'Start one dev-plumbing:importer subagent per import type (model sonnet, at most 4 at a time). Start the ones marked afterOthers only after all the others have returned. When they have all returned, call dp_wait.';
const WAIT_NEXT = "Call dp_wait to listen for the user's answers.";

describe('bringing a changed plan in', () => {
  it('reopens as before while the plan in the repo is unchanged', async () => {
    const t = await setup();
    const byPlan = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(byPlan.body).toMatchObject({ kind: 'reopened', importTypes: [], next: "Call dp_wait to listen for the user's answers." });
    expect((await t.claude('/open', { cwd: t.repo, project: 'restock-reminders' })).body).toMatchObject({ kind: 'reopened', importTypes: [] });
    // update without a change is an ordinary reopen.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, update: true })).body.kind).toBe('reopened');
  });

  it('asks first when the plan changed, and writes nothing', async () => {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    const before = await snapshot(t.dir);
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(open.status).toBe(200);
    expect(open.body).toEqual({
      kind: 'plan-changed',
      repo: 'acme-app',
      project: 'restock-reminders',
      title: 'Restock reminders',
      url: 'http://localhost:4545/p/acme-app/restock-reminders',
      version: 1,
      nextVersion: 2,
      added: 3,
      removed: 3,
      conflicts: 1,
      suggestFresh: false,
      whitespaceOnly: false,
      branch: 'main',
      next: ASK_V2,
    });
    expect(await snapshot(t.dir)).toEqual(before);
  });

  it('declining the update changes nothing', async () => {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    const before = await snapshot(t.dir);
    const no = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: false });
    expect(no.body).toMatchObject({ kind: 'reopened', title: 'Restock reminders', importTypes: [], waitingSubmissions: 0 });
    expect((await t.claude('/open', { cwd: t.repo, project: 'restock-reminders', windowId: 'w-a', update: false })).body.kind).toBe('reopened');
    expect(await snapshot(t.dir)).toEqual(before);
    // The question comes back the next time.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'plan-changed', version: 1, nextVersion: 2 });
    expect(await snapshot(t.dir)).toEqual(before);
  });

  it('brings the new version in on yes, keeping your draft and the old version', async () => {
    const t = await setup();
    await acceptOneRow(t);
    const oldDraft = await fs.readFile(path.join(t.dir, 'docs', 'draft.md'), 'utf8');
    const head = await rewritePlan(t, V2, { commit: true });
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.status).toBe(200);
    expect(yes.body).toMatchObject({
      kind: 'updated',
      repo: 'acme-app',
      project: 'restock-reminders',
      title: 'Restock alerts',
      url: 'http://localhost:4545/p/acme-app/restock-reminders',
      version: 2,
      merged: { clean: 2, conflicts: 1 },
      models: { importer: 'sonnet', thread: 'sonnet' },
      maxParallel: 4,
      waitingSubmissions: 1,
      next: `Tell the user: "v2: 2 changes merged, 1 to settle in Plan changes." ${IMPORT_NEXT}`,
    });
    // Every importable type runs again, in the same two waves as at import.
    const types = yes.body.importTypes as { id: string; afterOthers?: true }[];
    expect(types.map((x) => x.id)).toEqual(['architecture', 'database', 'ui', 'questions', 'concerns', 'ideas', 'testing', 'security', 'flows', 'phases']);
    expect(types.filter((x) => x.afterOthers).map((x) => x.id)).toEqual(['flows', 'phases']);

    const doc = (rel: string) => fs.readFile(path.join(t.dir, rel), 'utf8');
    expect(await doc('docs/versions/v1/original.md')).toBe(DRAFT);
    expect(await doc('docs/versions/v1/draft.md')).toBe(oldDraft);
    expect(await doc('docs/original.md')).toBe(V2);
    const draft = await doc('docs/draft.md');
    expect(draft).toContain('# Restock alerts');
    expect(draft).toContain('An hourly job finds');
    // Your accepted change stays where the repo changed the same line.
    expect(draft).toContain('Log one row per reminder sent.');
    expect(draft).not.toContain('Log reminders in the events table.');
    expect(draft).not.toMatch(/^[<=|>]{7}/m);

    const project = await readProjectFile(t.dir);
    expect(project).toMatchObject({ title: 'Restock alerts', status: 'importing', reimporting: { version: 2, from: 'active' } });
    expect(project.versions.map((v) => v.n)).toEqual([1, 2]);
    expect(project.versions[1]).toMatchObject({ n: 2, hash: sha256(V2), clone: t.repo, branch: 'main', commit: head, merge: { clean: 2, conflicts: 1 } });
    const conflict = await readItem(t.dir, 'plan-changes-v2-1');
    expect(conflict).toMatchObject({ type: 'plan-changes', title: 'Data' });
    expect((await readThread(t.dir, conflict.threadId)).status).toBe('with_claude');
  });

  it('runs the importers again by key, then dp_wait hands out the conflict', async () => {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.body.kind).toBe('updated');

    // The importers send what's there again under the same keys, and say which item the new version took out.
    const again = QUESTIONS.filter((q) => q.key === 'log').map(({ message: _message, ...item }) => item);
    const results = await importAll(t, yes.body.importTypes, again, ['who']);
    expect(results.at(-1)).toMatchObject({ importFinished: true });
    const project = await readProjectFile(t.dir);
    expect(project).toMatchObject({ status: 'active', importPending: [] });
    expect(project.reimporting).toBeUndefined();
    // The answered question kept its thread, its answer and its decision.
    const log = await readThread(t.dir, 't-questions-log');
    expect(log.status).toBe('resolved');
    expect(log.messages.some((m) => m.author === 'you' && m.optionId === 'one-row')).toBe(true);
    // Same keys, same ids: no questions-log-2. The removed one is parked, not deleted.
    expect((await fs.readdir(path.join(t.dir, 'items'))).filter((f) => f.startsWith('questions-')).sort()).toEqual(['questions-log.json', 'questions-who.json']);
    expect((await readItem(t.dir, 'questions-who')).removedIn).toBe(2);
    expect((await readThread(t.dir, 't-questions-who')).status).toBe('parked');

    const conflict = await readItem(t.dir, 'plan-changes-v2-1');
    const wait = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect(wait.body).toMatchObject({ kind: 'submission', groups: [{ threads: [conflict.threadId], titles: ['Data'], model: 'sonnet' }] });

    // The plan in the repo is v2 now, so opening it again asks nothing.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', importTypes: [] });
  });

  it("doesn't wake a window that is already listening, so the re-import isn't cut short", async () => {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    const waiting = t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 2 });
    // Once w-b is inside its wait, a notify would hand it the conflict at once.
    while (!t.rt.listeners.inWait('w-b', 'acme-app/restock-reminders')) await new Promise((r) => setTimeout(r, 10));
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.body).toMatchObject({ kind: 'updated', waitingSubmissions: 1 });
    // The other window times out instead of taking the conflict, and the re-import is still under way.
    expect((await waiting).body).toEqual({ kind: 'timeout' });
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', reimporting: { version: 2, from: 'active' } });
    // The conflict waits for this window's own dp_wait.
    const conflict = await readItem(t.dir, 'plan-changes-v2-1');
    expect((await readThread(t.dir, conflict.threadId)).status).toBe('with_claude');
  });

  it('opens by project id, reading the plan from this clone', async () => {
    const t = await setup();
    await rewritePlan(t, DRAFT.replace('A daily job finds', 'An hourly job finds'));
    const ask = await t.claude('/open', { cwd: t.repo, project: 'restock-reminders', windowId: 'w-a' });
    expect(ask.body).toMatchObject({ kind: 'plan-changed', version: 1, nextVersion: 2, added: 1, removed: 1 });
    expect(ask.body.next).toContain('"The plan changed in the repo since v1 (1 line added, 1 removed). Update to v2?"');

    // A clone that doesn't have the plan opens the project as it is.
    const other = makeRepo({ remote: 'https://github.com/acme/acme-app.git', plan: 'docs/other.md' });
    expect((await t.claude('/open', { cwd: other, project: 'restock-reminders' })).body).toMatchObject({ kind: 'reopened', importTypes: [] });

    const yes = await t.claude('/open', { cwd: t.repo, project: 'restock-reminders', windowId: 'w-a', update: true });
    expect(yes.body).toMatchObject({ kind: 'updated', version: 2, merged: { clean: 1, conflicts: 0 }, waitingSubmissions: 0 });
    expect(yes.body.next).toContain('"v2: 1 change merged, nothing to settle."');
    expect(yes.body.importTypes).toHaveLength(10);
  });

  it('opens the project instead of asking while Claude has threads to answer, and asks once they are answered', async () => {
    const t = await setup();
    await rewritePlan(t, V2);
    // You sent an answer while no Claude window was listening, so the thread waits for Claude.
    await t.send('PUT', `${P}/threads/t-questions-who/draft`, { text: 'Everyone.' });
    expect((await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-who' })).body).toMatchObject({ sent: 1 });
    const before = await snapshot(t.dir);
    const told = `Tell the user: "The plan changed in the repo since v1. Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered." ${WAIT_NEXT}`;
    for (const answer of [{}, { update: true }]) {
      const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', ...answer });
      expect(open.status).toBe(200);
      expect(open.body).toMatchObject({ kind: 'reopened', importTypes: [], waitingSubmissions: 1, next: told });
    }
    expect(await snapshot(t.dir)).toEqual(before);
    // This window listens and answers the thread. The next /dev-plumbing asks.
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'submission' });
    expect((await t.claude('/reply', { ...base, threadId: 't-questions-who', text: 'Everyone gets them.', resolve: { decision: 'Everyone gets reminders.' } })).status).toBe(200);
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'plan-changed', version: 1, nextVersion: 2 });
  });

  it('opens the project, and says why, while it is still importing', async () => {
    const t = await harness();
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body.kind).toBe('created');
    await rewritePlan(t, V2);
    const told = `Tell the user: "The plan changed in the repo since v1. This project is still importing. Run /dev-plumbing again once that's done." ${IMPORT_NEXT}`;
    for (const answer of [{}, { update: true }]) {
      const again = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', ...answer });
      expect(again.body).toMatchObject({ kind: 'reopened', next: told });
      expect(again.body.importTypes).toHaveLength(10);
    }
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', versions: [] });
  });

  it("a second window's dp_wait doesn't end the re-import, and the importers' batches still land", async () => {
    const t = await setup();
    await rewritePlan(t, DRAFT.replace('A daily job finds', 'An hourly job finds'));
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.body).toMatchObject({ kind: 'updated', merged: { clean: 1, conflicts: 0 } });
    // Your earlier session, still listening in another terminal, polls twice while w-a's importers work.
    for (let i = 0; i < 2; i++) expect((await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', importBy: 'w-a', reimporting: { version: 2, from: 'active' } });
    const results = await importAll(t, yes.body.importTypes, QUESTIONS.map(({ message: _message, ...item }) => item));
    expect(results.at(-1)).toMatchObject({ importFinished: true });
    const project = await readProjectFile(t.dir);
    expect(project.status).toBe('active');
    expect(project.importBy).toBeUndefined();
  });

  it("a dp_wait that comes in while the update runs doesn't end the re-import before this window claims it", async () => {
    const t = await setup();
    await rewritePlan(t, DRAFT.replace('A daily job finds', 'An hourly job finds'));
    // Once the update is written, its lock is held until another window's dp_wait is queued behind it.
    const withLock = t.rt.withLock;
    let calls = 0;
    let release = () => {};
    let hold: Promise<void> | null = new Promise((r) => (release = r));
    t.rt.withLock = (<T>(key: string, fn: () => Promise<T>) => {
      if (key !== 'acme-app/restock-reminders') return withLock(key, fn);
      calls++;
      return withLock(key, async () => {
        const result = await fn();
        const held = hold;
        hold = null;
        if (held) await held;
        return result;
      });
    }) as typeof withLock;
    // A new Claude session asks for the update: w-c hasn't opened anything before.
    const yes = t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-c', update: true });
    while ((await readProjectFile(t.dir)).status !== 'importing') await new Promise((r) => setTimeout(r, 5));
    const before = calls;
    const other = t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 });
    while (calls === before) await new Promise((r) => setTimeout(r, 5));
    release();
    expect((await other).body).toEqual({ kind: 'timeout' });
    const updated = (await yes).body;
    expect(updated).toMatchObject({ kind: 'updated', version: 2 });
    expect(updated.importTypes).toHaveLength(10);
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', importBy: 'w-c', reimporting: { version: 2, from: 'active' } });
  });

  it('at a first import too, until the window running the importers is gone', async () => {
    const clock = { now: Date.now() };
    const t = await harness({ now: () => clock.now });
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body.kind).toBe('created');
    for (let i = 0; i < 2; i++) await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 });
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', importBy: 'w-a' });
    expect((await t.claude('/items', { ...base, type: 'questions', items: QUESTIONS })).status).toBe(200);
    // w-a stopped: nothing from it for longer than a window counts as alive. w-b's next poll ends the import.
    clock.now += 120_000;
    await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 });
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'active', importPending: [] });
  });

  it('offers to start the draft again from v2 when merging would leave most of it to settle', async () => {
    const t = await setup();
    // Your draft moved on a long way: the intro, Approach and Data all say something else now.
    const draft = DRAFT.replace('Remind customers before', 'Remind every customer by email before')
      .replace('A daily job finds subscriptions due soon', 'A nightly job finds subscriptions due within three days')
      .replace('Log reminders in a table.', 'Log one row per reminder sent, with the channel.');
    await fs.writeFile(path.join(t.dir, 'docs', 'draft.md'), draft);
    const rewrite = '# Restock alerts\n\nAlert customers a week before a subscription item runs out.\n\n## Approach\n\nA queue sends each alert when it falls due.\n\n## Data\n\nKeep alerts in the events stream.\n';
    await rewritePlan(t, rewrite);
    const ask = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(ask.body).toMatchObject({ kind: 'plan-changed', conflicts: 3, suggestFresh: true, whitespaceOnly: false });
    expect(ask.body.next).toBe(
      'Ask the user: "The plan changed in the repo since v1 (4 lines added, 4 removed). It\'s mostly rewritten, so merging would leave 3 conflicts. Update to v2?" with the options "Update to v2 (merge into my draft)", "Start the draft from v2" and "Not now". Then call dp_open again with the same plan or project and update: true for the first, update: true with fresh: true for the second, or update: false for Not now.',
    );
    const fresh = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true, fresh: true });
    expect(fresh.body).toMatchObject({ kind: 'updated', version: 2, merged: { clean: 0, conflicts: 0 }, waitingSubmissions: 0 });
    expect(fresh.body.next).toBe(`Tell the user: "v2: the draft now starts from the plan's v2. Your earlier draft is kept under Versions." ${IMPORT_NEXT}`);
    expect(await fs.readFile(path.join(t.dir, 'docs', 'draft.md'), 'utf8')).toBe(rewrite);
    expect(await fs.readFile(path.join(t.dir, 'docs', 'versions', 'v1', 'draft.md'), 'utf8')).toBe(draft);
    expect((await readProjectFile(t.dir)).versions[1].merge).toEqual({ clean: 0, conflicts: 0, fresh: true });
  });

  it('says when only the formatting changed', async () => {
    const t = await setup();
    await rewritePlan(t, DRAFT.replace('Remind customers before a subscription item runs out.', 'Remind customers before a subscription\nitem runs out.'));
    const ask = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(ask.body).toMatchObject({ kind: 'plan-changed', conflicts: 0, suggestFresh: true, whitespaceOnly: true });
    expect(ask.body.next).toContain('"The plan changed in the repo since v1 (2 lines added, 1 removed). Only the formatting changed. Update to v2?"');
  });

  it("says there's nothing to bring in from a clone with an older version, and names another branch", async () => {
    const t = await setup();
    await rewritePlan(t, V2, { commit: true });
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    await importAll(t, yes.body.importTypes, QUESTIONS.map(({ message: _message, ...item }) => item));
    // This clone goes back to v1, as one that hasn't pulled would have it.
    await rewritePlan(t, DRAFT);
    for (const open of [{ plan: PLAN }, { project: 'restock-reminders' }]) {
      const older = await t.claude('/open', { cwd: t.repo, windowId: 'w-a', ...open });
      expect(older.body).toMatchObject({
        kind: 'reopened',
        next: `Tell the user: "This clone has the plan's v1, older than the project's v2. There's nothing to bring in." ${WAIT_NEXT}`,
      });
    }
    // Another branch with its own change to the plan: the question names it.
    gitIn(t.repo, 'checkout', '-q', '-b', 'restock-audit');
    await rewritePlan(t, V2.replace('in the events table', 'in the audit log'));
    const ask = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' });
    expect(ask.body).toMatchObject({ kind: 'plan-changed', version: 2, nextVersion: 3, branch: 'restock-audit' });
    expect(ask.body.next).toContain('"The plan on branch restock-audit changed since v2 (1 line added, 1 removed). Update to v3?"');
  });
});

describe('catching the items up with settled Plan changes', () => {
  const CATCH_UP = `Tell the user: "Your settled Plan changes touch the plan's items. Re-importing to catch them up." ${IMPORT_NEXT}`;
  const WAITS = `Tell the user: "Your settled Plan changes still need a re-import. It waits until Claude has answered: run /dev-plumbing again then." ${WAIT_NEXT}`;
  const MERGED = { id: 'merged', label: 'Use the merged version', change: { md: [{ find: 'Log one row per reminder sent.', replace: 'Log one row per reminder sent, in the events table.' }] } };
  const KEEP = { id: 'keep', label: 'Keep my draft', change: { md: [] } };

  /** v2 is in with its Data conflict, its importers are back, and Claude offered its choices: it's your turn. */
  async function atV2(): Promise<Setup> {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.body).toMatchObject({ kind: 'updated', merged: { clean: 2, conflicts: 1 } });
    await importAll(t, yes.body.importTypes, QUESTIONS.map(({ message: _message, ...item }) => item));
    const wait = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect(wait.body).toMatchObject({ kind: 'submission', groups: [{ threads: ['t-plan-changes-v2-1'] }] });
    const reply = await t.claude('/reply', { ...base, threadId: 't-plan-changes-v2-1', text: 'You log one row per send; the repo logs to the events table.', options: [MERGED, KEEP], recommended: 'merged' });
    expect(reply.status).toBe(200);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { submission: wait.body.submission } })).body).toEqual({ kind: 'timeout' });
    return t;
  }

  /** You take one of Claude's choices on the conflict in the browser. */
  async function settle(t: Setup, optionId: string) {
    await t.send('PUT', `${P}/threads/t-plan-changes-v2-1/draft`, { optionId });
    expect((await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-plan-changes-v2-1' })).body).toMatchObject({ resolved: 1 });
  }

  it('re-imports once from /open, after Not now too, when every Plan changes thread is settled, and the next /open just listens', async () => {
    const t = await atV2();
    // While the conflict is open, nothing is due, and /open just listens.
    expect((await t.send('GET', P)).body.catchUpDue).toBe(false);
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', importTypes: [], next: WAIT_NEXT });

    await settle(t, 'merged');
    expect((await t.send('GET', P)).body.catchUpDue).toBe(true);
    // Not now only declines a newer version of the plan: the catch-up is this version's, so it runs.
    const open = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: false });
    expect(open.body).toMatchObject({ kind: 'reopened', title: 'Restock alerts', next: CATCH_UP });
    expect((open.body.importTypes as { id: string }[]).map((x) => x.id)).toEqual(['architecture', 'database', 'ui', 'questions', 'concerns', 'ideas', 'testing', 'security', 'flows', 'phases']);
    expect(await readProjectFile(t.dir)).toMatchObject({ status: 'importing', importBy: 'w-a', caughtUp: 2, reimporting: { version: 2, from: 'active', catchUp: true } });
    expect((await t.send('GET', P)).body.catchUpDue).toBe(false);

    // The importers get what settling the conflict did to the draft, with nothing left to settle.
    const pack = (await t.claude('/context', { ...base, importType: 'questions' })).body;
    expect(pack.reimport).toMatchObject({ from: 2, to: 2, catchUp: true, conflicts: [] });
    expect(pack.reimport.changes).toContain('- Log one row per reminder sent.');
    expect(pack.reimport.changes).toContain('+ Log one row per reminder sent, in the events table.');
    // Another window's dp_wait doesn't end it before this window's importers are back.
    expect((await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    expect((await readProjectFile(t.dir)).status).toBe('importing');

    const results = await importAll(t, open.body.importTypes, [{ key: 'log', summary: 'One row per reminder sent, in the events table.' }]);
    expect(results.at(-1)).toMatchObject({ importFinished: true });
    expect((await readItem(t.dir, 'questions-log')).flags).toEqual([expect.objectContaining({ reason: "Changed in the plan's v2." })]);
    const project = await readProjectFile(t.dir);
    expect(project).toMatchObject({ status: 'active', importPending: [], caughtUp: 2 });
    expect(project.reimporting).toBeUndefined();

    // Once per version: the next /dev-plumbing just listens.
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', importTypes: [], next: WAIT_NEXT });
    expect((await readProjectFile(t.dir)).status).toBe('active');
  });

  it("carries a catch-up that's still waiting into the update to a newer plan version", async () => {
    const t = await atV2();
    await settle(t, 'merged');
    await rewritePlan(t, V2.replace('# Restock alerts', '# Restock alerts, v3'));
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'plan-changed', version: 2, nextVersion: 3 });
    const yes = await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    expect(yes.body).toMatchObject({ kind: 'updated' });
    expect(await readProjectFile(t.dir)).toMatchObject({ caughtUp: 2, reimporting: { version: 3, carriedCatchUp: 2 } });
    const pack = (await t.claude('/context', { ...base, importType: 'questions' })).body;
    expect(pack.reimport.changes).toContain("Settled in v2's Plan changes:");
    expect(pack.reimport.changes).toContain('+ Log one row per reminder sent, in the events table.');
  });

  it("doesn't re-import when you kept your draft, and says it waits while Claude has a thread to answer", async () => {
    const kept = await atV2();
    await settle(kept, 'keep');
    expect((await kept.send('GET', P)).body.catchUpDue).toBe(false);
    expect((await kept.claude('/open', { cwd: kept.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', importTypes: [], next: WAIT_NEXT });

    const busy = await atV2();
    await settle(busy, 'merged');
    // You asked something Claude hasn't answered yet: the window listens and answers it first, and says the catch-up
    // waits for another /dev-plumbing.
    await busy.send('PUT', `${P}/threads/t-questions-who/draft`, { text: 'Everyone.' });
    expect((await busy.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-who' })).body).toMatchObject({ sent: 1 });
    expect((await busy.send('GET', P)).body.catchUpDue).toBe(true);
    expect((await busy.claude('/open', { cwd: busy.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', importTypes: [], waitingSubmissions: 1, next: WAITS });
    expect((await busy.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'submission' });
    expect((await busy.claude('/reply', { ...base, threadId: 't-questions-who', text: 'Everyone gets them.', resolve: { decision: 'Everyone gets reminders.' } })).status).toBe(200);
    // Then the next /dev-plumbing catches the items up.
    expect((await busy.claude('/open', { cwd: busy.repo, plan: PLAN, windowId: 'w-a' })).body).toMatchObject({ kind: 'reopened', next: CATCH_UP });
  });
});

describe('versions', () => {
  it('lists every version, newest first, with the current one marked', async () => {
    const t = await setup();
    const v1 = { n: 1, at: (await readProjectFile(t.dir)).createdAt, hash: sha256(DRAFT), clone: t.repo, branch: 'main', commit: null };
    expect((await t.send('GET', `${P}/versions`)).body).toEqual({ versions: [{ ...v1, current: true }] });

    await acceptOneRow(t);
    const head = await rewritePlan(t, V2, { commit: true });
    expect((await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true })).body.kind).toBe('updated');
    const list = (await t.send('GET', `${P}/versions`)).body.versions;
    expect(list).toEqual([
      { n: 2, at: expect.any(String), hash: sha256(V2), clone: t.repo, branch: 'main', commit: head, merge: { clean: 2, conflicts: 1 }, current: true },
      { ...v1, current: false },
    ]);
  });

  it("serves each version's plan and draft, and compares two", async () => {
    const t = await setup();
    await acceptOneRow(t);
    const oldDraft = await fs.readFile(path.join(t.dir, 'docs', 'draft.md'), 'utf8');
    await rewritePlan(t, V2);
    await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    const text = async (n: number, which: string) => (await t.send('GET', `${P}/versions/${n}/${which}`)).body.text;
    expect(await text(1, 'original')).toBe(DRAFT);
    expect(await text(1, 'draft')).toBe(oldDraft);
    expect(await text(2, 'original')).toBe(V2);
    expect(await text(2, 'draft')).toBe(await fs.readFile(path.join(t.dir, 'docs', 'draft.md'), 'utf8'));

    const plans = await t.send('GET', `${P}/versions/compare?from=1&to=2&which=original`);
    expect(plans.status).toBe(200);
    expect(plans.body.segments).toEqual(
      expect.arrayContaining([
        { kind: 'removed', text: 'A daily job finds subscriptions due soon and sends a reminder.\n' },
        { kind: 'added', text: 'An hourly job finds subscriptions due soon and sends a reminder.\n' },
        { kind: 'removed', text: 'Log reminders in a table.\n' },
        { kind: 'added', text: 'Log reminders in the events table.\n' },
      ]),
    );
    const drafts = (await t.send('GET', `${P}/versions/compare?from=1&to=2&which=draft`)).body.segments as { kind: string; text: string }[];
    expect(drafts).toContainEqual({ kind: 'added', text: 'An hourly job finds subscriptions due soon and sends a reminder.\n' });
    // Your Data line is the same in both drafts.
    expect(drafts.filter((s) => s.kind !== 'same').some((s) => s.text.includes('Log one row'))).toBe(false);
  });

  it('shows what the update changed in your draft: the draft before it against the draft as merged', async () => {
    const t = await setup();
    await acceptOneRow(t);
    await rewritePlan(t, V2);
    await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    const diff = await t.send('GET', `${P}/versions/2/update-diff`);
    expect(diff.status).toBe(200);
    // The title and Approach merged in. Your Data line stayed, since the repo changed it too.
    expect((diff.body.segments as { kind: string }[]).filter((s) => s.kind !== 'same')).toEqual([
      { kind: 'removed', text: '# Restock reminders\n' },
      { kind: 'added', text: '# Restock alerts\n' },
      { kind: 'removed', text: 'A daily job finds subscriptions due soon and sends a reminder.\n' },
      { kind: 'added', text: 'An hourly job finds subscriptions due soon and sends a reminder.\n' },
    ]);
    expect(await t.send('GET', `${P}/versions/1/update-diff`)).toEqual({ status: 404, body: { error: 'v1 is the import, so no update changed its draft.' } });
    expect(await t.send('GET', `${P}/versions/3/update-diff`)).toEqual({ status: 404, body: { error: "That version doesn't exist." } });
  });

  it("answers 404 for a version, document or project that doesn't exist", async () => {
    const t = await setup();
    await rewritePlan(t, V2);
    await t.claude('/open', { cwd: t.repo, plan: PLAN, windowId: 'w-a', update: true });
    const get = (route: string) => t.send('GET', `${P}/versions${route}`);
    for (const route of ['/3/original', '/0/draft', '/abc/draft', '/compare?from=1&to=3&which=original', '/compare?to=2&which=original']) {
      expect(await get(route), route).toEqual({ status: 404, body: { error: "That version doesn't exist." } });
    }
    for (const route of ['/1/final', '/compare?from=1&to=2&which=final', '/compare?from=1&to=2']) {
      expect(await get(route), route).toEqual({ status: 404, body: { error: 'Unknown document.' } });
    }
    expect((await t.send('GET', '/api/projects/acme-app/nope/versions')).status).toBe(404);

    // A snapshot that's gone reads as null, and can't be compared.
    await fs.rm(path.join(t.dir, 'docs', 'versions', 'v1', 'draft.md'));
    expect(await get('/1/draft')).toEqual({ status: 200, body: { text: null } });
    expect(await get('/compare?from=1&to=2&which=draft')).toEqual({ status: 404, body: { error: "That version's document is missing from the project folder." } });
  });

  it('needs the token or the same origin', async () => {
    const t = await setup();
    for (const route of [`${P}/versions`, `${P}/versions/1/original`, `${P}/versions/compare?from=1&to=1&which=draft`, `${P}/versions/1/update-diff`]) {
      const res = await t.app.request(`http://localhost:4545${route}`, { headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' } });
      expect(res.status, route).toBe(401);
    }
    const same = await t.app.request(`http://localhost:4545${P}/versions`, { headers: { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:4545' } });
    expect(same.status).toBe(200);
  });
});
