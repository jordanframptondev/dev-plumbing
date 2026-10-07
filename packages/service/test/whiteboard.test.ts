import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cancelWhiteboard, readDefense, readProjectFile, readWhiteboardRequest, requestWhiteboard, writeProjectFile, type DefenseInput } from '@dev-plumbing/core';
import { validDefenseInput } from '../../core/test/fixtures';
import { DEFAULTS_DIR, removeTempDirs } from './helpers';
import { base, P, setup, type Json } from './whiteboardSetup';

afterAll(removeTempDirs);

const GAVE_UP = "The whiteboard subagent didn't send a Whiteboard Defense.";
const UNDER_WAY = 'The Whiteboard Defense is already being written.';
const IMPORTING = "The plan is still importing. Generate the Whiteboard Defense once that's done.";
/** dp_wait's next for a Whiteboard Defense request, with the default whiteboard model. */
const next = (id: string) =>
  `Start one dev-plumbing:whiteboard subagent (model opus) with the prompt "Write the Whiteboard Defense for repo acme-app, plumbing project restock-reminders, request ${id}." When it returns, call dp_wait with finished: { whiteboard: "${id}" }.`;
const SECTION_IDS = ['summary', 'diagram', 'walkthrough', 'data', 'security', 'failure', 'tradeoffs', 'complexity', 'readiness', 'unknowns'];

/** A valid defense whose Whiteboard diagram section names the project's architecture item. */
function withDiagram(): DefenseInput {
  const input = validDefenseInput();
  return { ...input, sections: input.sections.map((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-reminders' } : s)) };
}

describe('the Whiteboard Defense through the Claude routes', () => {
  it('hands a requested defense to a listening window, serves its pack, and saves what the subagent sends', async () => {
    const t = await setup();
    const { id } = await requestWhiteboard(t.dir);
    expect((await t.send('GET', P)).body.defense).toEqual({ ready: false, stale: false, state: 'requested' });

    const wait = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect(wait.body).toEqual({ kind: 'whiteboard', request: id, model: 'opus', next: next(id) });
    const writing = await readWhiteboardRequest(t.dir);
    expect(writing).toMatchObject({ id, state: 'writing', pickedUpBy: 'w-a', inputsHash: expect.any(String), basedOn: { doc: 'draft', version: 1 } });
    expect((await t.send('GET', P)).body).toMatchObject({ listening: 'busy', defense: { ready: false, stale: false, state: 'writing' } });

    const pack = await t.claude('/context', { ...base, whiteboard: true });
    expect(pack.status).toBe(200);
    // The big texts are files the subagent Reads: the rules file setup installed, and the draft the defense explains.
    expect(pack.body.rulesFile).toBe(path.join(t.ctx.configDir, 'outputs', 'whiteboard-defense.md'));
    expect(pack.body.documentFile).toBe(path.join(t.dir, 'docs', 'draft.md'));
    expect(pack.body).toMatchObject({
      project: { repo: 'acme-app', id: 'restock-reminders', name: 'restock-reminders' },
      basedOn: { doc: 'draft', version: 1 },
      diagramItemIds: ['architecture-reminders'],
      sensitiveData: [],
      previous: null,
    });
    expect(pack.body.sections.map((s: Json) => s.id)).toEqual(SECTION_IDS);
    const architecture = pack.body.items.find((i: Json) => i.id === 'architecture-reminders');
    expect(architecture.data.nodes.map((n: Json) => n.id)).toEqual(['job', 'db']);
    expect(architecture.file).toBe(path.join(t.dir, 'items', 'architecture-reminders.json'));

    // A defense with problems is refused whole, listing each one. Nothing is saved, and the request waits for another try.
    const input = withDiagram();
    const bad = { ...input, sections: input.sections.filter((s) => s.id !== 'summary').map((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-nope' } : s)) };
    const refused = await t.claude('/whiteboard', { ...base, request: id, defense: bad });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/^Nothing was saved\. Fix these and call dp_whiteboard again with the whole defense:\n/);
    expect(refused.body.error).toContain('- sections: summary is missing.');
    expect(refused.body.error).toContain('- sections: diagram: diagramItemId "architecture-nope" isn\'t an item with a diagram. Use one of: architecture-reminders.');
    expect(await readDefense(t.dir)).toBeNull();
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id, state: 'writing', pickedUpBy: 'w-a' });

    // The subagent sends no checklist: the service copies the rules file's, word for word.
    const sent = await t.claude('/whiteboard', { ...base, request: id, defense: { ...input, checklist: [] } });
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ ok: true, request: id, level: input.level, questions: 3, concerns: 2, next: 'Saved. The user reads it in the app. Reply with your one line.' });
    const defense = await readDefense(t.dir);
    expect(defense).toMatchObject({ id: expect.stringMatching(/^w-/), level: input.level, basedOn: { kind: 'plan', doc: 'draft', version: 1, inputsHash: writing!.inputsHash } });
    expect(defense!.sections.map((s) => s.id)).toEqual(SECTION_IDS);
    expect(defense!.sections[1]).toMatchObject({ id: 'diagram', title: 'Whiteboard diagram', diagramItemId: 'architecture-reminders' });
    expect(defense!.checklist.map((k) => k.text)).toEqual(validDefenseInput().checklist);
    expect(await readWhiteboardRequest(t.dir)).toBeNull();
    expect((await t.send('GET', P)).body.defense).toEqual({ ready: true, stale: false, state: null });

    // The window reports back. The request is gone, so there's nothing left to fail, and the defense stays.
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { whiteboard: id } })).body).toEqual({ kind: 'timeout' });
    expect(await readDefense(t.dir)).toEqual(defense);
    // Sending again for the same request has nothing to save into.
    const late = await t.claude('/whiteboard', { ...base, request: id, defense: input });
    expect(late.status).toBe(409);
    expect(late.body.error).toBe(`There's no Whiteboard Defense request ${id} waiting for a defense.`);
  });

  it('hands out submissions first, then a requested finalize, then the Whiteboard Defense', async () => {
    const t = await setup();
    const whiteboard = await requestWhiteboard(t.dir);
    const finalize = await t.send('POST', `${P}/finalize`);
    expect(finalize.status).toBe(200);
    await t.send('PUT', `${P}/threads/t-questions-days/draft`, { text: 'Three days.' });
    await t.send('POST', `${P}/submit`, { scope: 'thread', threadId: 't-questions-days' });

    const first = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect(first.body.kind).toBe('submission');
    const second = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { submission: first.body.submission, conflicts: [] } });
    expect(second.body).toMatchObject({ kind: 'finalize', request: finalize.body.request.id });
    const third = await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { finalize: finalize.body.request.id } });
    expect(third.body).toMatchObject({ kind: 'whiteboard', request: whiteboard.id });
  });

  it('a whiteboard request is never stuck', async () => {
    let now = Date.parse('2026-10-06T10:00:00Z');
    const t = await setup({ now: () => now });

    // A window that comes back without saving fails its request with the reason, so the page offers Try again.
    const first = await requestWhiteboard(t.dir);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: first.id });
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { whiteboard: first.id } })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id: first.id, state: 'failed', reason: GAVE_UP });
    expect((await t.send('GET', P)).body.defense).toEqual({ ready: false, stale: false, state: 'failed' });

    // Try again replaces the failed request. A window that listens again without reporting back is done with it too.
    const retry = await requestWhiteboard(t.dir);
    expect(retry.id).not.toBe(first.id);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: retry.id });
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id: retry.id, state: 'failed', reason: GAVE_UP });

    // One at a time: while a request waits or is being written, another is refused.
    const third = await requestWhiteboard(t.dir);
    await expect(requestWhiteboard(t.dir)).rejects.toThrow(UNDER_WAY);
    expect((await t.claude('/wait', { ...base, windowId: 'w-gone', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: third.id });
    await expect(requestWhiteboard(t.dir)).rejects.toThrow(UNDER_WAY);

    // w-b's first dp_wait is still open when w-gone goes away. A second call from w-b takes the request back from the
    // queue, and a third one, while the first is still open, leaves it alone.
    const open = t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 2 });
    await new Promise((r) => setTimeout(r, 50));
    now += 5 * 60_000;
    expect((await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: third.id });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id: third.id, state: 'writing', pickedUpBy: 'w-b', requeuedAt: expect.any(String) });
    expect((await t.claude('/wait', { ...base, windowId: 'w-b', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id: third.id, state: 'writing', pickedUpBy: 'w-b' });
    expect((await open).body).toEqual({ kind: 'timeout' });

    // /open from a new window gives back the request of a window that went away, too.
    now += 5 * 60_000;
    expect((await t.claude('/open', { cwd: t.repo, project: 'restock-reminders', windowId: 'w-c' })).body.kind).toBe('reopened');
    const requeued = await readWhiteboardRequest(t.dir);
    expect(requeued).toMatchObject({ id: third.id, state: 'requested' });
    expect(requeued?.pickedUpBy).toBeUndefined();
    expect((await t.claude('/wait', { ...base, windowId: 'w-c', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: third.id });

    // Cancel works while it's being written: the window's report finds nothing to fail, and nothing is handed out again.
    await cancelWhiteboard(t.dir);
    expect(await readWhiteboardRequest(t.dir)).toBeNull();
    expect((await t.claude('/wait', { ...base, windowId: 'w-c', timeoutSeconds: 0, finished: { whiteboard: third.id } })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toBeNull();
    // ...while it waits for a window...
    await requestWhiteboard(t.dir);
    await cancelWhiteboard(t.dir);
    expect((await t.claude('/wait', { ...base, windowId: 'w-c', timeoutSeconds: 0 })).body).toEqual({ kind: 'timeout' });
    // ...and once it failed.
    const failed = await requestWhiteboard(t.dir);
    expect((await t.claude('/wait', { ...base, windowId: 'w-c', timeoutSeconds: 0 })).body).toMatchObject({ request: failed.id });
    expect((await t.claude('/wait', { ...base, windowId: 'w-c', timeoutSeconds: 0, finished: { whiteboard: failed.id } })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ state: 'failed' });
    await cancelWhiteboard(t.dir);
    expect(await readWhiteboardRequest(t.dir)).toBeNull();

    // Not while the plan is importing.
    await writeProjectFile(t.dir, { ...(await readProjectFile(t.dir)), status: 'importing' });
    await expect(requestWhiteboard(t.dir)).rejects.toThrow(IMPORTING);
    expect(await readWhiteboardRequest(t.dir)).toBeNull();
  });

  it("uses the user's outputs/whiteboard-defense.md, or the shipped one when theirs is gone, and copies its checklist", async () => {
    const t = await setup();
    const mine = path.join(t.ctx.configDir, 'outputs', 'whiteboard-defense.md');
    expect((await t.claude('/context', { ...base, whiteboard: true })).body.rulesFile).toBe(mine);

    // Rules of your own, with their own checklist: the defense gets it, whatever the subagent sent.
    await fs.writeFile(mine, '# Our defense rules\n\n- [ ] I can explain it.\n- [ ] I can draw it.\n');
    const first = await requestWhiteboard(t.dir);
    await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 });
    expect((await t.claude('/whiteboard', { ...base, request: first.id, defense: validDefenseInput() })).status).toBe(200);
    expect((await readDefense(t.dir))!.checklist.map((k) => k.text)).toEqual(['I can explain it.', 'I can draw it.']);

    // Rules with no checklist: the subagent has to write one.
    await fs.writeFile(mine, '# Our defense rules\n\nKeep it short.\n');
    const second = await requestWhiteboard(t.dir);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished: { whiteboard: first.id } })).body).toMatchObject({ request: second.id });
    const none = await t.claude('/whiteboard', { ...base, request: second.id, defense: { ...validDefenseInput(), checklist: [] } });
    expect(none.status).toBe(400);
    expect(none.body.error).toContain('- checklist: the rules file has no checklist, so send one.');
    expect((await t.claude('/whiteboard', { ...base, request: second.id, defense: { ...validDefenseInput(), checklist: ['Mine.'] } })).status).toBe(200);
    expect((await readDefense(t.dir))!.checklist).toEqual([{ id: 'k1', text: 'Mine.' }]);

    await fs.rm(mine);
    expect((await t.claude('/context', { ...base, whiteboard: true })).body.rulesFile).toBe(path.join(DEFAULTS_DIR, 'outputs', 'whiteboard-defense.md'));
  });

  it("keeps the subagent's own Failed: line as the reason when the window passes it on", async () => {
    const t = await setup();
    const request = await requestWhiteboard(t.dir);
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0 })).body).toMatchObject({ kind: 'whiteboard', request: request.id });
    const line = 'Failed: dp_whiteboard refused the defense three times: sections: summary is missing.';
    const finished = { whiteboard: request.id, whiteboardError: line };
    expect((await t.claude('/wait', { ...base, windowId: 'w-a', timeoutSeconds: 0, finished })).body).toEqual({ kind: 'timeout' });
    expect(await readWhiteboardRequest(t.dir)).toMatchObject({ id: request.id, state: 'failed', reason: line });
  });

  it('/context says what to give when it gets none of the four', async () => {
    const t = await setup();
    const r = await t.claude('/context', base);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Give threadId (for a thread), importType (for an importer), finalize: true (for the finalizer) or whiteboard: true (for the whiteboard subagent).');
  });
});
