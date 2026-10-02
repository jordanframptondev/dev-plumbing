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
  return { ...s, rt, app, send, dir, repo };
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

  it('refuses a draft with no fields or a misspelt one, and keeps the draft', async () => {
    const t = await setup();
    await t.send('PUT', `${P}/threads/t-questions-channels/draft`, { text: 'Long answer I typed.' });
    for (const body of [{ txet: 'typo' }, {}]) {
      const r = await t.send('PUT', `${P}/threads/t-questions-channels/draft`, body);
      expect(r.status).toBe(400);
      expect(r.body.error).toEqual(expect.any(String));
    }
    expect((await readThread(t.dir, 't-questions-channels')).draft).toMatchObject({ text: 'Long answer I typed.' });
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

  it("a window that only opened the project and pinged isn't listening", async () => {
    const t = await setup();
    expect((await t.send('POST', '/api/claude/open', { cwd: t.repo, project: 'restock-reminders', windowId: 'w-idle' })).status).toBe(200);
    expect((await t.send('POST', '/api/claude/alive', { windowId: 'w-idle' })).body).toEqual({ ok: true });
    await t.send('PUT', `${P}/threads/t-questions-channels/draft`, { text: 'Both.' });
    const sent = await t.send('POST', `${P}/submit`, { scope: 'all' });
    expect(sent.body).toMatchObject({ sent: 1, listening: null, message: 'Saved. No Claude window is listening. Run /dev-plumbing in any clone.' });
    expect(t.rt.listeners.isAlive('w-idle')).toBe(true);
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
