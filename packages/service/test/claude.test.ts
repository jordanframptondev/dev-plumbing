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
