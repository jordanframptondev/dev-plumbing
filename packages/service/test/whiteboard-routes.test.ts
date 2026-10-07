import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { projectFiles, readProjectFile, writeProjectFile } from '@dev-plumbing/core';
import { makeRepo, validDefenseInput } from '../../core/test/fixtures';
import { removeTempDirs } from './helpers';
import { base, P, setup, type Json, type Setup } from './whiteboardSetup';

afterAll(removeTempDirs);

const W = `${P}/whiteboard`;
const EXPORT_FILE = 'docs/specs/restock-reminders.whiteboard-defense.md';
const WAITING = 'Waiting for Claude to write the Whiteboard Defense.';
const NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';
const UNDER_WAY = 'The Whiteboard Defense is already being written.';
const IMPORTING = "The plan is still importing. Generate the Whiteboard Defense once that's done.";
const CHANGED = 'The Whiteboard Defense changed since this page loaded. Reload it.';
const exists = (p: string) => fs.access(p).then(() => true, () => false);

/** Generate in the browser; a window picks it up, its subagent sends a valid defense, and the window reports back. */
async function saved(t: Setup): Promise<Json> {
  const generated = await t.send('POST', W, {});
  expect(generated.status).toBe(200);
  const id = generated.body.request.id as string;
  expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: id });
  expect((await t.claude('/whiteboard', { ...base, request: id, defense: validDefenseInput() })).status).toBe(200);
  expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { whiteboard: id } })).body).toEqual({ kind: 'timeout' });
  return (await t.send('GET', W)).body;
}

describe('the Whiteboard Defense page over HTTP', () => {
  it('has nothing at first, and offers Generate', async () => {
    const t = await setup();
    expect((await t.send('GET', W)).body).toEqual({
      request: null,
      defense: null,
      stale: null,
      practice: null,
      asked: [],
      sent: [],
      canGenerate: true,
      generateRefusal: null,
      listening: null,
      clones: [{ path: t.repo, source: true }],
      exportPath: EXPORT_FILE,
    });
    const nothing = await t.send('POST', `${W}/export`, { clone: t.repo });
    expect(nothing.status).toBe(409);
    expect(nothing.body.error).toBe("There's no Whiteboard Defense to export yet.");
  });

  it("can't generate while the plan is importing", async () => {
    const t = await setup();
    await writeProjectFile(t.dir, { ...(await readProjectFile(t.dir)), status: 'importing' });
    expect((await t.send('GET', W)).body).toMatchObject({ canGenerate: false, generateRefusal: IMPORTING });
    const refused = await t.send('POST', W, {});
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe(IMPORTING);
  });

  it('Generate wakes a listening window, and a second press is refused while it writes', async () => {
    const t = await setup();
    const waiting = t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 5 });
    await new Promise((r) => setTimeout(r, 50));
    const generated = await t.send('POST', W, {});
    expect(generated.status).toBe(200);
    expect(generated.body).toMatchObject({ request: { state: 'requested' }, listening: 'waiting', message: WAITING });
    expect((await waiting).body).toMatchObject({ kind: 'whiteboard', request: generated.body.request.id });
    expect((await t.send('GET', W)).body).toMatchObject({
      request: { id: generated.body.request.id, state: 'writing', pickedUpBy: 'w-a' },
      canGenerate: false,
      generateRefusal: UNDER_WAY,
      listening: 'busy',
    });
    const again = await t.send('POST', W, {});
    expect(again.status).toBe(409);
    expect(again.body.error).toBe(UNDER_WAY);
  });

  it('says no window is listening, and Cancel takes the request back', async () => {
    const t = await setup();
    const generated = await t.send('POST', W, {});
    expect(generated.body).toMatchObject({ request: { state: 'requested' }, listening: null, message: NO_WINDOW });
    expect((await t.send('POST', `${W}/cancel`, {})).body).toEqual({ ok: true });
    expect((await t.send('GET', W)).body).toMatchObject({ request: null, canGenerate: true, generateRefusal: null });
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    // Nothing to cancel is fine too.
    expect((await t.send('POST', `${W}/cancel`, {})).body).toEqual({ ok: true });
  });

  it('shows the saved defense, and keeps it while a regenerate is being written', async () => {
    const t = await setup();
    const view = await saved(t);
    expect(view).toMatchObject({
      request: null,
      defense: { id: expect.stringMatching(/^w-/), basedOn: { kind: 'plan', doc: 'draft', version: 1 } },
      stale: null,
      practice: { ratings: {}, ticks: [], readiness: 0, counts: { could: 0, shaky: 0, couldnt: 0, unrated: 3, ticked: 0, checklist: 20 } },
      asked: [],
      sent: [],
      canGenerate: true,
      exportPath: EXPORT_FILE,
    });
    expect(view.defense.questions.map((q: Json) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect((await t.send('GET', P)).body.defense).toEqual({ ready: true, stale: false, state: null });

    expect((await t.send('POST', W, {})).status).toBe(200);
    expect((await t.send('GET', W)).body).toMatchObject({ request: { state: 'requested' }, defense: { id: view.defense.id }, canGenerate: false });
  });

  it('asks Claude about a part: a Defense thread with your question, handed to the window', async () => {
    const t = await setup();
    const { defense } = await saved(t);
    const question = 'Who can turn reminders off?\nAnd who can see them?';
    const asked = await t.send('POST', `${W}/ask`, { defenseId: defense.id, kind: 'section', ref: 'security', question });
    expect(asked.status).toBe(200);
    expect(asked.body).toEqual({ resolved: 0, sent: 1, skipped: [], listening: 'waiting', message: 'Sent to Claude.', threadId: expect.stringMatching(/^t-defense-/) });
    const { threadId } = asked.body;
    const detail = (await t.send('GET', `${P}/threads/${threadId}`)).body;
    expect(detail.thread.status).toBe('with_claude');
    expect(detail.thread.messages.at(-1)).toMatchObject({ author: 'you', text: question });
    expect(detail.item).toMatchObject({ type: 'defense', createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'section', ref: 'security' } });
    expect((await t.send('GET', W)).body.asked).toEqual([expect.objectContaining({ kind: 'section', ref: 'security', threadId, typeId: 'defense', status: 'with_claude' })]);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'submission', groups: [{ threads: [threadId] }] });

    const stale = await t.send('POST', `${W}/ask`, { defenseId: 'w-older', kind: 'section', ref: 'security', question });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe(CHANGED);
    const missing = await t.send('POST', `${W}/ask`, { defenseId: defense.id, kind: 'question', ref: 'q9', question });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe("That part of the Whiteboard Defense doesn't exist.");
    expect((await t.send('POST', `${W}/ask`, { defenseId: defense.id, kind: 'section', ref: 'security', question: '   ' })).status).toBe(400);
    expect((await t.send('POST', `${W}/ask`, { defenseId: defense.id, kind: 'section', ref: 'security', question, extra: true })).status).toBe(400);
  });

  it('sends an unknown to Questions and a concern to Concerns, once each, for Claude to pick up', async () => {
    let now = Date.parse('2026-10-06T10:00:00Z');
    const t = await setup({ now: () => now });
    const { defense } = await saved(t);
    const sent = await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'claim', ref: 'security.1' });
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({
      itemId: expect.stringMatching(/^questions-/),
      threadId: expect.stringMatching(/^t-questions-/),
      typeId: 'questions',
      typeTitle: 'Questions',
      listening: 'waiting',
      message: 'Added to Questions. Claude will suggest answers.',
    });
    // The service made the submission, so the listening window answers it without the user sending anything.
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'submission', groups: [{ threads: [sent.body.threadId] }] });
    expect((await t.send('GET', W)).body.sent).toEqual([expect.objectContaining({ kind: 'claim', ref: 'security.1', itemId: sent.body.itemId, typeId: 'questions' })]);

    const again = await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'claim', ref: 'security.1' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("That's already in Questions.");
    const claims: { ref: string; basis: string }[] = defense.sections.flatMap((s: Json) => s.claims.map((c: Json, i: number) => ({ ref: `${s.id}.${i}`, basis: c.basis })));
    const settled = claims.find((c) => c.basis === 'known' || c.basis === 'inferred')!;
    const known = await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'claim', ref: settled.ref });
    expect(known.status).toBe(400);
    expect(known.body.error).toBe('Only a claim marked Unknown or Verify before release can be sent to Questions.');

    // While the window is busy (it took the claim's thread), it says Claude will get to it.
    const busy = await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'concern', ref: 'c1' });
    expect(busy.body).toMatchObject({ typeId: 'concerns', typeTitle: 'Concerns', listening: 'busy', message: "Added to Concerns. Claude is busy, and will suggest answers when it's done." });
    // Once the window is gone, the message says so.
    now += 5 * 60_000;
    const concern = await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'concern', ref: 'c2' });
    expect(concern.body).toMatchObject({ typeId: 'concerns', typeTitle: 'Concerns', listening: null, message: `Added to Concerns. ${NO_WINDOW}` });
  });

  it('rates cards and ticks the checklist, for the current defense only', async () => {
    const t = await setup();
    const { defense } = await saved(t);
    const rated = await t.send('POST', `${W}/practice/rating`, { defenseId: defense.id, questionId: 'q1', rating: 'could' });
    expect(rated.status).toBe(200);
    expect(rated.body).toMatchObject({ ratings: { q1: 'could' }, ticks: [], counts: { could: 1, unrated: 2 } });
    const ticked = await t.send('POST', `${W}/practice/tick`, { defenseId: defense.id, checklistId: 'k1', ticked: true });
    // Half the cards, half the checklist: round(100 × (1 / 3 + 1 / 20) / 2) = 19
    expect(ticked.body).toMatchObject({ ratings: { q1: 'could' }, ticks: ['k1'], readiness: 19 });
    expect((await t.send('GET', W)).body.practice).toEqual(ticked.body);
    const cleared = await t.send('POST', `${W}/practice/rating`, { defenseId: defense.id, questionId: 'q1', rating: null });
    expect(cleared.body).toMatchObject({ ratings: {}, ticks: ['k1'] });

    const old = await t.send('POST', `${W}/practice/tick`, { defenseId: 'w-older', checklistId: 'k1', ticked: false });
    expect(old.status).toBe(409);
    expect(old.body.error).toBe(CHANGED);
    expect((await t.send('POST', `${W}/practice/rating`, { defenseId: defense.id, questionId: 'q1', rating: 'great' })).status).toBe(400);
  });

  it('exports into a clone the project was opened from, and nowhere else', async () => {
    const t = await setup();
    await saved(t);
    const exported = await t.send('POST', `${W}/export`, { clone: t.repo });
    expect(exported.status).toBe(200);
    expect(exported.body).toEqual({ exportedTo: { clone: t.repo, path: EXPORT_FILE, at: expect.any(String) } });
    expect(await fs.readFile(path.join(t.repo, EXPORT_FILE), 'utf8')).toMatch(/^# Whiteboard Defense: /);
    expect((await t.send('GET', W)).body.defense.exportedTo).toEqual(exported.body.exportedTo);

    const stranger = makeRepo({ remote: 'git@github.com:acme/acme-app.git' });
    const refused = await t.send('POST', `${W}/export`, { clone: stranger });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe("That folder isn't one of the clones this project was opened from.");
    expect(await exists(path.join(stranger, EXPORT_FILE))).toBe(false);
    expect((await t.send('POST', `${W}/export`, {})).status).toBe(400);
  });

  it('goes out of date when the plan changes, and not when you ask about it or practise', async () => {
    const t = await setup();
    const { defense } = await saved(t);
    await t.send('POST', `${W}/ask`, { defenseId: defense.id, kind: 'question', ref: 'q2', question: 'Why would it send twice?' });
    await t.send('POST', `${W}/send`, { defenseId: defense.id, kind: 'claim', ref: 'security.1' });
    await t.send('POST', `${W}/practice/rating`, { defenseId: defense.id, questionId: 'q2', rating: 'shaky' });
    await t.send('POST', `${W}/practice/tick`, { defenseId: defense.id, checklistId: 'k2', ticked: true });
    expect((await t.send('GET', W)).body.stale).toBeNull();

    await fs.appendFile(path.join(t.dir, 'docs', 'draft.md'), '\nReminders stop when the subscription is paused.\n');
    expect((await t.send('GET', W)).body).toMatchObject({ stale: 'Out of date: the plan changed since this was generated.', canGenerate: true });
    expect((await t.send('GET', P)).body.defense).toEqual({ ready: true, stale: true, state: null });
  });

  it("still answers when the plan can't be read, and Generate fails with Try again rather than wedging the window", async () => {
    const t = await setup();
    const { defense } = await saved(t);
    await fs.rm(path.join(t.dir, 'docs', 'draft.md'));
    const view = await t.send('GET', W);
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ defense: { id: defense.id }, stale: null, canGenerate: true });

    const generated = await t.send('POST', W, {});
    expect(generated.status).toBe(200);
    // The request's state each time the page is told the project changed.
    const told: string[] = [];
    const off = t.rt.events.on((e) => {
      if (e.type === 'project') told.push(JSON.parse(readFileSync(projectFiles(t.dir).whiteboardRequest, 'utf8')).state);
    });
    // dp_wait carries on: nothing to hand out, and the request fails with why, which the page is told.
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    off();
    expect(told.at(-1)).toBe('failed');
    expect((await t.send('GET', W)).body).toMatchObject({
      request: { id: generated.body.request.id, state: 'failed', reason: "The Whiteboard Defense couldn't read the plan: docs/draft.md can't be read." },
      canGenerate: true,
      generateRefusal: null,
    });
  });

  it('needs the token or the same origin', async () => {
    const t = await setup();
    const routes: [string, string][] = [
      ['GET', W],
      ['POST', W],
      ['POST', `${W}/cancel`],
      ['POST', `${W}/ask`],
      ['POST', `${W}/send`],
      ['POST', `${W}/practice/rating`],
      ['POST', `${W}/practice/tick`],
      ['POST', `${W}/export`],
    ];
    for (const [method, route] of routes) {
      const res = await t.app.request(`http://localhost:4545${route}`, { method, headers: { 'sec-fetch-site': 'cross-site', origin: 'http://evil.example' } });
      expect(res.status, `${method} ${route}`).toBe(401);
    }
    const same = await t.app.request(`http://localhost:4545${W}`, { headers: { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:4545' } });
    expect(same.status).toBe(200);
    expect((await t.send('GET', '/api/projects/acme-app/nope/whiteboard')).status).toBe(404);
  });
});
