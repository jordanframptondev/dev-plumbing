import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readProjectFile, writeJsonAtomic } from '@dev-plumbing/core';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { makeRepo } from '../../core/test/fixtures';
import { call, makeContext, removeTempDirs } from './helpers';

afterAll(removeTempDirs);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const P = '/api/projects/acme-app/restock-reminders';
const PLAN = 'docs/specs/restock-reminders.md';
const FINAL_FILE = 'docs/specs/restock-reminders.final.md';
const NEXT = `writing-plans ${FINAL_FILE}`;
const base = { repo: 'acme-app', project: 'restock-reminders' };
const MARKUP = '<main class="p-6"><p>Restock soon</p></main>';
const EVERYONE = { id: 'everyone', label: 'Everyone', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per reminder sent.' }] } };
const ITEMS: Record<string, unknown[]> = {
  questions: [
    { key: 'who', title: 'Who gets reminders?', summary: 'Everyone or some?', fields: { blocking: 'true' }, message: { text: 'Who first?', options: [EVERYONE, { id: 'some', label: 'Active subscribers' }] } },
    { key: 'days', title: 'How many days before?', summary: 'Lead time.', fields: { default: '3 days' }, message: { text: 'How many days?' } },
  ],
  ui: [{ key: 'settings', title: 'Restock settings card', summary: 'A card on the reminders page.', data: { location: { app: 'web', route: '/reminders', files: [] }, kit: 'web', after: MARKUP } }],
};
const FINAL = ['# Restock reminders', '', 'Remind customers before an item runs out.', '', '## UI changes', '', '{{mockup:ui-settings:after}}', ''].join('\n');
const exists = (p: string) => fs.access(p).then(() => true, () => false);

/** A clone, its repo profile, and a plumbing project with a blocking question, a question with a default and a UI item. */
async function setup(o: { now?: () => number } = {}) {
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
  const open = await claude('/open', { cwd: repo, plan: PLAN, windowId: 'w-a' });
  for (const type of open.body.importTypes as { id: string }[]) {
    const list = ITEMS[type.id];
    const r = await claude('/items', { ...base, type: type.id, ...(list ? { items: list } : { noChanges: 'None.' }) });
    if (r.status !== 200) throw new Error(`${type.id}: ${r.body.error}`);
  }
  return { ...s, rt, app, send, claude, repo, dir: path.join(s.root, 'acme-app', 'restock-reminders') };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** Accepts the blocking question's option in the browser, so nothing blocks Finalize. */
async function unblock(t: Setup) {
  await t.send('PUT', `${P}/threads/t-questions-who/draft`, { optionId: 'everyone' });
  expect((await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-who' })).body).toMatchObject({ resolved: 1 });
}

/** Presses Start finalize, and has a window pick the request up. Returns its id. */
async function pickedUp(t: Setup, windowId = 'w-a'): Promise<string> {
  const start = await t.send('POST', `${P}/finalize`);
  expect(start.status).toBe(200);
  const wait = await t.claude('/wait', { ...base, windowId, timeoutSeconds: 0 });
  expect(wait.body).toMatchObject({ kind: 'finalize', request: start.body.request.id });
  return start.body.request.id;
}

/** Answers "How many days before?", and Claude's reply edits the draft with a small edit. */
async function editDraft(t: Setup) {
  await t.send('PUT', `${P}/threads/t-questions-days/draft`, { text: 'Three days.' });
  await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-days' });
  expect((await t.claude('/wait', { ...base, windowId: 'w-edit', timeoutSeconds: 0 })).body.kind).toBe('submission');
  const reply = await t.claude('/reply', {
    ...base,
    threadId: 't-questions-days',
    text: 'Three days it is.',
    smallEdits: [{ summary: 'Say when', change: { md: [{ find: 'due soon', replace: 'due in three days' }] } }],
    resolve: { decision: 'Remind three days before' },
  });
  expect(reply.body).toMatchObject({ ok: true, appliedEdits: 1 });
}

describe('Finalize over HTTP', () => {
  it('shows the checklist, refuses to start while something blocks, and then starts', async () => {
    const t = await setup();
    const view = (await t.send('GET', `${P}/finalize`)).body;
    expect(view).toMatchObject({ request: null, proposal: null, final: null, name: 'restock-reminders', listening: null, changesSinceFinal: 0, clones: [{ path: t.repo, source: true }] });
    expect(view.checklist.canStart).toBe(false);
    expect(view.checklist.blocking).toContainEqual(expect.objectContaining({ itemId: 'questions-who', threadId: 't-questions-who', reason: 'Blocking question, not resolved.' }));
    expect(view.checklist.defaults).toContainEqual(expect.objectContaining({ itemId: 'questions-days', defaultValue: '3 days' }));

    const blocked = await t.send('POST', `${P}/finalize`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/^Finalize is blocked/);
    expect(blocked.body.error).toContain('Blocking question, not resolved.');
    expect((await t.send('GET', `${P}/finalize`)).body.request).toBeNull();

    await unblock(t);
    const start = await t.send('POST', `${P}/finalize`);
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({ request: { state: 'requested' }, listening: null, message: 'No Claude window is listening. Run /dev-plumbing in any clone.' });
    const again = await t.send('POST', `${P}/finalize`);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('Finalize is already under way.');
    expect((await t.send('GET', P)).body.finalize).toMatchObject({ canStart: true, state: 'requested' });
  });

  it('goes from a listening window to an accepted final in the repo', async () => {
    const t = await setup();
    await unblock(t);
    const start = await t.send('POST', `${P}/finalize`);
    const id = start.body.request.id as string;

    const wait = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect(wait.body).toMatchObject({ kind: 'finalize', request: id, model: 'opus' });
    expect(wait.body.next).toContain(`Write the final spec for repo acme-app, plumbing project restock-reminders, request ${id}.`);
    expect((await t.send('GET', `${P}/finalize`)).body).toMatchObject({ request: { id, state: 'writing', pickedUpBy: 'w-a' }, listening: 'busy' });

    const pack = await t.claude('/context', { ...base, finalize: true });
    expect(pack.status).toBe(200);
    expect(pack.body.rules).toContain('# Finalize spec rules');
    expect(pack.body.project).toMatchObject({ repo: 'acme-app', id: 'restock-reminders', name: 'restock-reminders' });
    expect(pack.body.draft).toContain('Log one row per reminder sent.');
    expect(pack.body.tokens.some((line: string) => line.includes('{{mockup:ui-settings:after}}'))).toBe(true);

    // A final that points at an item that doesn't exist is refused as a whole, and nothing is saved.
    const refused = await t.claude('/finalize', { ...base, request: id, markdown: `${FINAL}\n{{diagram:architecture-nope}}\n` });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/^Nothing was saved/);
    expect(refused.body.error).toContain('{{diagram:architecture-nope}}');
    expect(await exists(path.join(t.dir, 'docs', 'final.proposed.md'))).toBe(false);
    expect((await t.send('GET', `${P}/finalize`)).body).toMatchObject({ request: { state: 'writing' }, proposal: null });

    const sent = await t.claude('/finalize', { ...base, request: id, markdown: FINAL });
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ ok: true, request: id });
    const proposed = (await t.send('GET', `${P}/finalize`)).body;
    expect(proposed.request).toMatchObject({ id, state: 'proposed' });
    expect(proposed.request.proposal).toMatchObject({
      file: 'docs/final.proposed.md',
      length: proposed.proposal.markdown.length,
      assets: [{ itemId: 'ui-settings', side: 'after' }],
    });
    expect(proposed.proposal).toMatchObject({ stale: false, diff: null });
    expect(proposed.proposal.markdown).toContain('(restock-reminders.assets/ui-settings.after.html)');
    expect(proposed.proposal.markdown).not.toContain('{{');

    const accepted = await t.send('POST', `${P}/finalize/accept`, { clone: t.repo });
    expect(accepted.status).toBe(200);
    expect(accepted.body.nextCommand).toBe(NEXT);
    expect(await fs.readFile(path.join(t.repo, FINAL_FILE), 'utf8')).toBe(proposed.proposal.markdown);
    expect(await fs.readFile(path.join(t.repo, 'docs', 'specs', 'restock-reminders.assets', 'ui-settings.after.html'), 'utf8')).toContain(MARKUP);
    expect((await t.send('GET', `${P}/finalize`)).body).toMatchObject({
      request: null,
      proposal: null,
      final: { nextCommand: NEXT, exportedTo: { assets: ['ui-settings.after.html'] } },
    });
    expect((await t.send('GET', P)).body).toMatchObject({ project: { status: 'finalized' }, finalize: { state: null } });

    // The window reports back. The request is gone, so there's nothing left to fail.
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { finalize: id } })).body).toEqual({ kind: 'timeout' });
  });

  it('finalizing again shows the changes since the last final, and Discard clears the proposal', async () => {
    const t = await setup();
    await unblock(t);
    const first = await pickedUp(t);
    expect((await t.claude('/finalize', { ...base, request: first, markdown: FINAL })).status).toBe(200);
    expect((await t.send('POST', `${P}/finalize/accept`, { clone: t.repo })).status).toBe(200);

    await editDraft(t);
    expect((await t.send('GET', `${P}/finalize`)).body.changesSinceFinal).toBe(1);
    const second = await pickedUp(t);
    const changed = FINAL.replace('Remind customers before an item runs out.', 'Remind customers three days before an item runs out.');
    expect((await t.claude('/finalize', { ...base, request: second, markdown: changed })).status).toBe(200);
    const view = (await t.send('GET', `${P}/finalize`)).body;
    expect(view.final.nextCommand).toBe(NEXT);
    expect(view.proposal.stale).toBe(false);
    expect(view.proposal.diff).toEqual(
      expect.arrayContaining([
        { kind: 'removed', text: 'Remind customers before an item runs out.\n' },
        { kind: 'added', text: 'Remind customers three days before an item runs out.\n' },
      ]),
    );

    expect((await t.send('POST', `${P}/finalize/discard`)).body).toEqual({ ok: true });
    expect((await t.send('GET', `${P}/finalize`)).body).toMatchObject({ request: null, proposal: null, final: { nextCommand: NEXT } });
    expect(await exists(path.join(t.dir, 'docs', 'final.proposed.md'))).toBe(false);
    // Only Accept replaces the copy in the repo.
    expect(await fs.readFile(path.join(t.repo, FINAL_FILE), 'utf8')).toContain('Remind customers before an item runs out.');
  });

  it('a proposal for an older draft goes stale, and Accept refuses it', async () => {
    const t = await setup();
    await unblock(t);
    const id = await pickedUp(t);
    expect((await t.claude('/finalize', { ...base, request: id, markdown: FINAL })).status).toBe(200);
    await editDraft(t);
    expect((await t.send('GET', `${P}/finalize`)).body.proposal).toMatchObject({ stale: true });
    const refused = await t.send('POST', `${P}/finalize/accept`, { clone: t.repo });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('The draft changed since Claude wrote this. Finalize again.');
    expect(await exists(path.join(t.repo, FINAL_FILE))).toBe(false);
    expect(await exists(path.join(t.dir, 'docs', 'final.md'))).toBe(false);
  });

  it('a proposal goes stale when only an item changed, with the draft as it was', async () => {
    const t = await setup();
    await unblock(t);
    const id = await pickedUp(t);
    expect((await t.claude('/finalize', { ...base, request: id, markdown: FINAL })).status).toBe(200);
    expect((await t.send('GET', `${P}/finalize`)).body.proposal).toMatchObject({ stale: false });
    // A redrawn mockup changes what the final links to, though the draft is untouched.
    const file = path.join(t.dir, 'items', 'ui-settings.json');
    const item = JSON.parse(await fs.readFile(file, 'utf8'));
    await writeJsonAtomic(file, { ...item, data: { ...item.data, after: '<main class="p-6"><p>Restock now</p></main>' } });
    expect((await t.send('GET', `${P}/finalize`)).body.proposal).toMatchObject({ stale: true });
    expect((await t.send('POST', `${P}/finalize/accept`, { clone: t.repo })).body.error).toBe('The draft changed since Claude wrote this. Finalize again.');
  });

  it('a finalize request goes back in the queue when its window goes away', async () => {
    let now = Date.parse('2026-10-03T10:00:00Z');
    const t = await setup({ now: () => now });
    await unblock(t);
    const id = await pickedUp(t, 'w-gone');
    now += 5 * 60_000;
    const b = await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 });
    expect(b.body).toMatchObject({ kind: 'finalize', request: id });
    expect((await t.send('GET', `${P}/finalize`)).body.request).toMatchObject({ id, state: 'writing', pickedUpBy: 'w-b', requeuedAt: expect.any(String) });
  });

  it('a finalizer that sends nothing fails the request, and Start finalize tries again', async () => {
    const t = await setup();
    await unblock(t);
    const id = await pickedUp(t);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { finalize: id } })).body).toEqual({ kind: 'timeout' });
    expect((await t.send('GET', `${P}/finalize`)).body.request).toMatchObject({ id, state: 'failed', reason: "The finalizer didn't send a final." });

    // Try again replaces the failed request.
    const retry = await pickedUp(t);
    expect(retry).not.toBe(id);
    // A window that listens again without reporting back is done with what it held, too.
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    expect((await t.send('GET', `${P}/finalize`)).body.request).toMatchObject({ id: retry, state: 'failed' });
  });

  it('Start finalize wakes a listening window', async () => {
    const t = await setup();
    await unblock(t);
    const waiting = t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 5 });
    await new Promise((r) => setTimeout(r, 50));
    const start = await t.send('POST', `${P}/finalize`);
    expect(start.body).toMatchObject({ listening: 'waiting', message: 'Waiting for Claude to write the final.' });
    expect((await waiting).body).toMatchObject({ kind: 'finalize', request: start.body.request.id });
  });

  it('hands out submissions before a finalize', async () => {
    const t = await setup();
    await unblock(t);
    const start = await t.send('POST', `${P}/finalize`);
    await t.send('PUT', `${P}/threads/t-questions-days/draft`, { text: 'Three days.' });
    await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-days' });
    const first = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect(first.body.kind).toBe('submission');
    const second = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { submission: first.body.submission, conflicts: [] } });
    expect(second.body).toMatchObject({ kind: 'finalize', request: start.body.request.id });
  });

  it('remembers every clone the project is opened from, by plan or by project id', async () => {
    const t = await setup();
    expect((await readProjectFile(t.dir)).clones).toEqual([t.repo]);
    const second = makeRepo({ remote: 'https://github.com/acme/acme-app.git' });
    expect((await t.claude('/open', { cwd: second, project: 'restock-reminders', windowId: 'w-b' })).body.kind).toBe('reopened');
    const third = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
    expect((await t.claude('/open', { cwd: third, plan: PLAN, windowId: 'w-c' })).body.kind).toBe('reopened');
    // A clone it already knows isn't added again.
    expect((await t.claude('/open', { cwd: second, project: 'restock-reminders' })).body.kind).toBe('reopened');
    expect((await readProjectFile(t.dir)).clones).toEqual([t.repo, second, third]);
  });

  it('offers the clones the project was opened from, and copies only into one of them', async () => {
    const t = await setup();
    const other = makeRepo({ remote: 'https://github.com/acme/acme-app.git' });
    expect((await t.claude('/open', { cwd: other, project: 'restock-reminders', windowId: 'w-b' })).body.kind).toBe('reopened');
    expect((await t.send('GET', `${P}/finalize`)).body.clones).toEqual([
      { path: t.repo, source: true },
      { path: other, source: false },
    ]);
    await fs.rm(other, { recursive: true, force: true });
    expect((await t.send('GET', `${P}/finalize`)).body.clones).toEqual([{ path: t.repo, source: true }]);

    const stranger = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
    const refused = await t.send('POST', `${P}/finalize/accept`, { clone: stranger });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe("That folder isn't one of the clones this project was opened from.");
    expect(await exists(path.join(stranger, FINAL_FILE))).toBe(false);
    expect((await t.send('POST', `${P}/finalize/accept`, {})).status).toBe(400);
  });

  it('needs the token or the same origin', async () => {
    const t = await setup();
    const routes: [string, string][] = [
      ['GET', `${P}/finalize`],
      ['POST', `${P}/finalize`],
      ['POST', `${P}/finalize/accept`],
      ['POST', `${P}/finalize/discard`],
    ];
    for (const [method, route] of routes) {
      const res = await t.app.request(`http://localhost:4545${route}`, { method, headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' } });
      expect(res.status, `${method} ${route}`).toBe(401);
    }
    const same = await t.app.request(`http://localhost:4545${P}/finalize`, { headers: { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:4545' } });
    expect(same.status).toBe(200);
    expect((await t.send('GET', '/api/projects/acme-app/nope/finalize')).status).toBe(404);
  });
});
