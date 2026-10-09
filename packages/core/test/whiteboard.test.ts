import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFENSE_TYPE } from '../src/defenseType';
import { itemSchema, MAX_PRESENTER_CHARS, PRESENT_CHAPTERS, type DefenseInput, type DiagramData, type Item, type Practice, type WhiteboardRequest } from '../src/schemas';
import { addDecision } from '../src/store/decisions';
import { projectFiles, readItem, readProjectFile, writeDocText, writeHistoryEntry, writeItem, writeProjectFile, writeThread } from '../src/store/io';
import { setReviewed } from '../src/store/reviewed';
import { setParked } from '../src/store/threads';
import {
  cancelWhiteboard,
  checklistLines,
  defenseBasis,
  defenseInputsHash,
  defenseStale,
  defenseStatus,
  finishWhiteboard,
  MAX_DEFENSE_CHARS,
  pickUpWhiteboard,
  readDefense,
  readPractice,
  readWhiteboardRequest,
  removeWhiteboardRequest,
  requestWhiteboard,
  requeueWhiteboard,
  saveDefense,
  writeDefense,
  writePractice,
  writeWhiteboardRequest,
} from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, listType, pair, seedProject, storedDefense, TYPES, validDefenseInput } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-06T09:00:00.000Z';
const exists = (file: string) => fs.access(file).then(() => true, () => false);

describe('the whiteboard files', () => {
  it('read as nothing when they are missing or damaged', async () => {
    const dir = await seedProject();
    const files = projectFiles(dir);
    const nothing = async () => {
      expect(await readWhiteboardRequest(dir)).toBeNull();
      expect(await readDefense(dir)).toBeNull();
      expect(await readPractice(dir)).toEqual({ ratings: {}, ticks: {} });
    };
    await nothing();
    await fs.mkdir(files.whiteboard);
    for (const file of [files.whiteboardRequest, files.defense, files.practice]) await fs.writeFile(file, '{damaged');
    await nothing();
    // JSON of the wrong shape is damaged too.
    await fs.writeFile(files.whiteboardRequest, JSON.stringify({ id: 'g-1', state: 'proposed', requestedAt: AT }));
    await fs.writeFile(files.defense, JSON.stringify({ ...storedDefense(), level: 4 }));
    await fs.writeFile(files.practice, JSON.stringify({ ratings: { 'Where does the renewal date come from?': { rating: 'maybe', at: AT } } }));
    await nothing();
  });

  it('write and read back, making whiteboard/ when it is needed', async () => {
    const dir = await seedProject();
    const files = projectFiles(dir);
    expect(files).toMatchObject({
      whiteboard: path.join(dir, 'whiteboard'),
      whiteboardRequest: path.join(dir, 'whiteboard', 'request.json'),
      defense: path.join(dir, 'whiteboard', 'defense.json'),
      practice: path.join(dir, 'whiteboard', 'practice.json'),
    });
    expect(await exists(files.whiteboard)).toBe(false);
    const request: WhiteboardRequest = { id: 'g-1', state: 'writing', requestedAt: AT, pickedUpAt: AT, pickedUpBy: 'w-a', inputsHash: 'abc', basedOn: { doc: 'draft', version: 1 } };
    await writeWhiteboardRequest(dir, request);
    expect(await readWhiteboardRequest(dir)).toEqual(request);
    const defense = storedDefense();
    await writeDefense(dir, defense);
    expect(await readDefense(dir)).toEqual(defense);
    const practice: Practice = { ratings: { 'What stops a customer getting two reminders?': { rating: 'shaky', at: AT } }, ticks: { 'I can explain the purpose.': AT } };
    await writePractice(dir, practice);
    expect(await readPractice(dir)).toEqual(practice);
    expect((await fs.readdir(files.whiteboard)).sort()).toEqual(['defense.json', 'practice.json', 'request.json']);
  });

  it('remove the request and nothing else, and are fine when there is none', async () => {
    const dir = await seedProject();
    await expect(removeWhiteboardRequest(dir)).resolves.toBeUndefined();
    await writeWhiteboardRequest(dir, { id: 'g-1', state: 'requested', requestedAt: AT });
    await writeDefense(dir, storedDefense());
    await removeWhiteboardRequest(dir);
    expect(await readWhiteboardRequest(dir)).toBeNull();
    expect(await readDefense(dir)).toEqual(storedDefense());
    await expect(removeWhiteboardRequest(dir)).resolves.toBeUndefined();
  });

  it('keep which part of the defense an item came from', async () => {
    const dir = await seedProject();
    const { item } = pair('defense-unsubscribe-link', { type: 'defense', title: 'Does the unsubscribe link need a token?' });
    const asked: Item = { ...item, createdBy: 'whiteboard', fromDefense: { id: 'w-test', kind: 'section', ref: 'security' } };
    await writeItem(dir, asked);
    expect(await readItem(dir, asked.id)).toEqual(asked);
    // It's checked, not just carried along: a part of another kind reads as none, as a malformed anchor does, so the
    // item is never hidden.
    const malformed = itemSchema.safeParse({ ...asked, fromDefense: { id: 'w-test', kind: 'box', ref: 'security' } });
    expect(malformed.success).toBe(true);
    expect(malformed.data?.fromDefense).toBeUndefined();
    expect(malformed.data?.title).toBe(asked.title);
    // An item sent to Questions keeps the text it was sent with.
    const sent: Item = { ...pair('questions-unsubscribe-link').item, createdBy: 'whiteboard', fromDefense: { id: 'w-test', kind: 'claim', ref: 'security.1', text: 'Whether the unsubscribe link needs a signed token.' } };
    await writeItem(dir, sent);
    expect(await readItem(dir, sent.id)).toEqual(sent);
  });
});

const T0 = new Date('2026-10-06T09:00:00.000Z');
const T1 = new Date('2026-10-06T09:01:00.000Z');
const T2 = new Date('2026-10-06T09:02:00.000Z');
const T3 = new Date('2026-10-06T09:03:00.000Z');
/** When the tests' final was accepted, and a time after it. */
const FINAL_AT = '2026-10-06T08:00:00.000Z';
const AFTER_FINAL = '2026-10-06T10:00:00.000Z';
const types = [...TYPES, DEFENSE_TYPE];
const FINAL = '# Restock reminders\n\nThe accepted final.\n';
const SHIPPED_RULES = path.resolve(import.meta.dirname, '../../../defaults/outputs/whiteboard-defense.md');
const PLAN_CHANGED = 'Out of date: the plan changed since this was generated.';
const RETRY = 'Nothing was saved. Fix these and call dp_whiteboard again with the whole defense:';
const DIAGRAM: DiagramData = {
  kind: 'system',
  groups: [],
  nodes: [
    { id: 'job', label: 'Daily reminder job', status: 'new' },
    { id: 'db', label: 'Postgres', status: 'unchanged' },
  ],
  edges: [{ id: 'e1', from: 'job', to: 'db', label: 'finds due subscriptions' }],
};

/** A project with an architecture diagram, an open question and a low concern. */
async function seed(): Promise<string> {
  const diagram = pair('architecture-system', { type: 'architecture', title: 'System overview', status: 'resolved' });
  diagram.item.data = DIAGRAM;
  return seedProject({ pairs: [diagram, pair('q1', { title: 'Who gets reminders?' }), pair('c1', { type: 'concerns', title: 'Duplicate emails', fields: { severity: 'low' } })] });
}

/** Generate, as a window does: request, pick up, save. */
async function generate(dir: string, defense: unknown = validDefenseInput()) {
  const request = await requestWhiteboard(dir, { now: T0 });
  await pickUpWhiteboard(dir, 'w-a', T1);
  return saveDefense(dir, { requestId: request.id, defense, types, now: T2 });
}

/** validDefenseInput() with each section changed by `edit`. */
const withSections = (edit: (s: DefenseInput['sections'][number]) => DefenseInput['sections'][number]): DefenseInput => {
  const input = validDefenseInput();
  return { ...input, sections: input.sections.map(edit) };
};

/** The error a promise rejects with, as its class name and message, or null if it resolves. */
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: Error) => ({ type: e.constructor.name, message: e.message }));
const UNDER_WAY = { type: 'ConflictError', message: 'The Whiteboard Defense is already being written.' };

/** Puts a final in place, as Accept does, accepted at FINAL_AT. */
async function acceptFinal(dir: string): Promise<void> {
  await writeDocText(dir, 'docs/final.md', FINAL);
  const project = await readProjectFile(dir);
  const exportedTo = { clone: '/tmp/acme', path: 'docs/specs/restock.final.md', at: FINAL_AT, assets: [] };
  await writeProjectFile(dir, { ...project, status: 'finalized', docs: { ...project.docs, final: 'docs/final.md', exportedTo } });
}

const V = { hash: 'x', clone: '/tmp/acme', branch: 'main', commit: null };

describe('generating a Whiteboard Defense', () => {
  it('goes from requested to writing to saved, with its ids, its titles and its sections in order', async () => {
    const dir = await seed();
    const request = await requestWhiteboard(dir, { now: T0 });
    expect(request).toEqual({ id: expect.stringMatching(/^g-/), state: 'requested', requestedAt: T0.toISOString() });
    expect(await readWhiteboardRequest(dir)).toEqual(request);

    const inputs = await defenseInputsHash(dir);
    expect(inputs).toMatch(/^[0-9a-f]{64}$/);
    const writing = await pickUpWhiteboard(dir, 'w-a', T1);
    expect(writing).toEqual({ ...request, state: 'writing', pickedUpAt: T1.toISOString(), pickedUpBy: 'w-a', inputsHash: inputs, basedOn: { doc: 'draft', version: 1 } });
    expect(await pickUpWhiteboard(dir, 'w-b', T1)).toBeNull();

    // The subagent may send the sections in any order. Concerns come back most severe first.
    const input = validDefenseInput();
    const shuffled = { ...input, sections: [...input.sections].reverse(), concerns: [...input.concerns].reverse() };
    const saved = await saveDefense(dir, { requestId: request.id, defense: shuffled, types, now: T2 });
    expect(saved).toEqual(storedDefense({ id: expect.stringMatching(/^w-/), generatedAt: T2.toISOString(), basedOn: { kind: 'plan', doc: 'draft', version: 1, inputsHash: inputs } }));
    expect(await readDefense(dir)).toEqual(saved);
    expect(await readWhiteboardRequest(dir)).toBeNull();
    // The window reporting back once its subagent saved changes nothing.
    await finishWhiteboard(dir, { requestId: request.id, windowId: 'w-a', now: T3 });
    expect(await readWhiteboardRequest(dir)).toBeNull();
    expect(await defenseStale(dir, saved)).toBeNull();
  });

  it('is based on the final while it is current, at the current plan version', async () => {
    const dir = await seed();
    await acceptFinal(dir);
    // v2 changed the draft, but came in before the final was accepted.
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), versions: [{ ...V, n: 1, at: '2026-10-01T09:00:00.000Z' }, { ...V, n: 2, at: '2026-10-05T09:00:00.000Z', merge: { clean: 2, conflicts: 0 } }] });
    expect(await defenseBasis(dir)).toEqual({ doc: 'final', version: 2, text: FINAL });
    const saved = await generate(dir);
    expect(saved.basedOn).toEqual({ kind: 'plan', doc: 'final', version: 2, inputsHash: await defenseInputsHash(dir) });
    // It follows the final's text.
    await writeDocText(dir, 'docs/final.md', `${FINAL}\nAccepted again.\n`);
    expect(await defenseStale(dir, saved)).toBe(PLAN_CHANGED);
  });

  it('explains the draft once a change was applied after Accept, or a plan version that changed the draft came in', async () => {
    // A change applied since the final was accepted: a defense of that final is out of date, and the next explains the draft.
    const changed = await seed();
    await acceptFinal(changed);
    const ofFinal = await generate(changed);
    expect(ofFinal.basedOn.doc).toBe('final');
    const change = { at: AFTER_FINAL, threadId: 't-q1', kind: 'accept' as const, summary: 'Who gets reminders: everyone', change: {}, itemsBefore: {}, itemsAfter: {} };
    await writeHistoryEntry(changed, { ...change, id: 'c-before', appliedAt: '2026-10-06T07:00:00.000Z' });
    expect((await defenseBasis(changed)).doc).toBe('final');
    await writeHistoryEntry(changed, { ...change, id: 'c-after', appliedAt: AFTER_FINAL });
    expect(await defenseBasis(changed)).toEqual({ doc: 'draft', version: 1, text: DRAFT });
    expect(await defenseStale(changed, ofFinal)).toBe(PLAN_CHANGED);

    // A plan version that changed the draft came in after the final.
    const updated = await seed();
    await acceptFinal(updated);
    const versions = (merge: { clean: number; conflicts: number }) => [{ ...V, n: 1, at: '2026-10-01T09:00:00.000Z' }, { ...V, n: 2, at: AFTER_FINAL, merge }];
    await writeProjectFile(updated, { ...(await readProjectFile(updated)), versions: versions({ clean: 0, conflicts: 1 }) });
    expect(await defenseBasis(updated)).toEqual({ doc: 'draft', version: 2, text: DRAFT });
    // One that left the draft as it was doesn't count.
    await writeProjectFile(updated, { ...(await readProjectFile(updated)), versions: versions({ clean: 0, conflicts: 0 }) });
    expect(await defenseBasis(updated)).toEqual({ doc: 'final', version: 2, text: FINAL });
  });

  it("can't start while the plan is importing, or while one is being asked for or written, and replaces a failed one", async () => {
    const importing = await seedProject({ project: { status: 'importing' } });
    expect(await refusal(requestWhiteboard(importing))).toEqual({ type: 'ConflictError', message: "The plan is still importing. Generate the Whiteboard Defense once that's done." });
    expect(await readWhiteboardRequest(importing)).toBeNull();

    const dir = await seed();
    const first = await requestWhiteboard(dir);
    expect(await refusal(requestWhiteboard(dir))).toEqual(UNDER_WAY);
    await pickUpWhiteboard(dir, 'w-a');
    expect(await refusal(requestWhiteboard(dir))).toEqual(UNDER_WAY);
    await finishWhiteboard(dir, { requestId: first.id, windowId: 'w-a' });
    const second = await requestWhiteboard(dir);
    expect(second.id).not.toBe(first.id);
    expect(await readWhiteboardRequest(dir)).toEqual(second);
  });

  it('has nothing to pick up unless one is requested', async () => {
    const dir = await seed();
    expect(await pickUpWhiteboard(dir, 'w-a')).toBeNull();
    const request = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    await finishWhiteboard(dir, { requestId: request.id, windowId: 'w-a' });
    expect(await pickUpWhiteboard(dir, 'w-b')).toBeNull();
    expect(await readWhiteboardRequest(dir)).toMatchObject({ state: 'failed', pickedUpBy: 'w-a' });
  });

  it('waits while the plan is importing, and is picked up once that is done', async () => {
    const dir = await seed();
    const request = await requestWhiteboard(dir, { now: T0 });
    // An update's re-import started after Generate: the request isn't written from a half re-imported project.
    const project = await readProjectFile(dir);
    await writeProjectFile(dir, { ...project, status: 'importing' });
    expect(await pickUpWhiteboard(dir, 'w-a', T1)).toBeNull();
    expect(await readWhiteboardRequest(dir)).toEqual(request);
    await writeProjectFile(dir, project);
    expect(await pickUpWhiteboard(dir, 'w-a', T2)).toMatchObject({ id: request.id, state: 'writing', pickedUpAt: T2.toISOString(), pickedUpBy: 'w-a' });
  });

  it("fails, rather than throwing, when the plan it would explain can't be read", async () => {
    // A final recorded as accepted whose file is gone.
    const dir = await seed();
    await acceptFinal(dir);
    await fs.rm(path.join(dir, 'docs', 'final.md'));
    const request = await requestWhiteboard(dir, { now: T0 });
    const failed = await pickUpWhiteboard(dir, 'w-a', T1);
    expect(failed).toEqual({ ...request, state: 'failed', failedAt: T1.toISOString(), reason: "The Whiteboard Defense couldn't read the plan: docs/final.md can't be read." });
    expect(await readWhiteboardRequest(dir)).toEqual(failed);
    // A failed request is finished: nothing to pick up, and Try again asks for a new one.
    expect(await pickUpWhiteboard(dir, 'w-a', T2)).toBeNull();
    expect((await requestWhiteboard(dir, { now: T2 })).state).toBe('requested');

    // The reason is cut to 500 characters.
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), docs: { ...(await readProjectFile(dir)).docs, final: `docs/${'gone/'.repeat(120)}final.md` } });
    const reason = (await pickUpWhiteboard(dir, 'w-a', T3))?.reason ?? '';
    expect(reason).toHaveLength(500);
    expect(reason).toMatch(/^The Whiteboard Defense couldn't read the plan: docs\/gone\/gone\/.*…$/);
  });

  it("won't save for another request, or for one that isn't being written", async () => {
    const dir = await seed();
    const request = await requestWhiteboard(dir);
    const save = (requestId: string) => refusal(saveDefense(dir, { requestId, defense: validDefenseInput(), types }));
    expect(await save(request.id)).toEqual({ type: 'ConflictError', message: `There's no Whiteboard Defense request ${request.id} waiting for a defense.` });
    await pickUpWhiteboard(dir, 'w-a');
    expect(await save('g-other')).toEqual({ type: 'ConflictError', message: "There's no Whiteboard Defense request g-other waiting for a defense." });
    expect(await readDefense(dir)).toBeNull();
    expect((await readWhiteboardRequest(dir))?.state).toBe('writing');
  });

  it("fails when the subagent returns without a defense, and only for that window's request", async () => {
    const dir = await seed();
    const request = await requestWhiteboard(dir, { now: T0 });
    const writing = await pickUpWhiteboard(dir, 'w-a', T1);
    await finishWhiteboard(dir, { requestId: request.id, windowId: 'w-b', now: T2 });
    await finishWhiteboard(dir, { requestId: 'g-other', windowId: 'w-a', now: T2 });
    expect(await readWhiteboardRequest(dir)).toEqual(writing);
    await finishWhiteboard(dir, { requestId: request.id, windowId: 'w-a', now: T2 });
    expect(await readWhiteboardRequest(dir)).toEqual({ ...writing, state: 'failed', failedAt: T2.toISOString(), reason: "The whiteboard subagent didn't send a Whiteboard Defense." });
    expect(await refusal(saveDefense(dir, { requestId: request.id, defense: validDefenseInput(), types }))).toEqual({
      type: 'ConflictError',
      message: `There's no Whiteboard Defense request ${request.id} waiting for a defense.`,
    });

    // When the window passes on the subagent's own Failed: line, that's the reason, cut to 500 characters.
    const again = await requestWhiteboard(dir, { now: T3 });
    await pickUpWhiteboard(dir, 'w-a', T3);
    await finishWhiteboard(dir, { requestId: again.id, windowId: 'w-a', error: `  Failed: ${'the pack was too big to read. '.repeat(30)}`, now: T3 });
    const reason = (await readWhiteboardRequest(dir))?.reason ?? '';
    expect(reason).toHaveLength(500);
    expect(reason).toMatch(/^Failed: the pack was too big to read\. .*…$/);
  });

  it('gives a request back when the window writing it went away', async () => {
    const dir = await seed();
    const request = await requestWhiteboard(dir, { now: T0 });
    await pickUpWhiteboard(dir, 'w-dead', T1);
    expect(await requeueWhiteboard(dir, (w) => w === 'w-live', T2)).toBe(true);
    expect(await readWhiteboardRequest(dir)).toEqual({ ...request, state: 'requested', requeuedAt: T2.toISOString() });
    expect(await pickUpWhiteboard(dir, 'w-live', T3)).toMatchObject({ id: request.id, state: 'writing', pickedUpBy: 'w-live', basedOn: { doc: 'draft', version: 1 } });
    expect(await requeueWhiteboard(dir, (w) => w === 'w-live')).toBe(false);
    // A failed request is finished work: it never goes back in the queue.
    await finishWhiteboard(dir, { requestId: request.id, windowId: 'w-live' });
    expect(await requeueWhiteboard(dir, () => false)).toBe(false);
    expect((await readWhiteboardRequest(dir))?.state).toBe('failed');
  });

  it('cancels a request in any state, and leaves the saved defense alone', async () => {
    const dir = await seed();
    await generate(dir);
    const before = await fs.readFile(projectFiles(dir).defense, 'utf8');
    await requestWhiteboard(dir);
    await cancelWhiteboard(dir);
    expect(await readWhiteboardRequest(dir)).toBeNull();
    const writing = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    await cancelWhiteboard(dir);
    expect(await readWhiteboardRequest(dir)).toBeNull();
    // The subagent that was writing it can't save it any more.
    expect(await refusal(saveDefense(dir, { requestId: writing.id, defense: validDefenseInput(), types }))).toMatchObject({ type: 'ConflictError' });
    const failed = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    await finishWhiteboard(dir, { requestId: failed.id, windowId: 'w-a' });
    await cancelWhiteboard(dir);
    expect(await readWhiteboardRequest(dir)).toBeNull();
    await expect(cancelWhiteboard(dir)).resolves.toBeUndefined();
    expect(await fs.readFile(projectFiles(dir).defense, 'utf8')).toBe(before);
  });
});

describe('checking the defense before it is saved', () => {
  it('a refused defense leaves the last one as it was', async () => {
    const dir = await seed();
    await generate(dir);
    const before = await fs.readFile(projectFiles(dir).defense, 'utf8');
    const request = await requestWhiteboard(dir);
    const writing = await pickUpWhiteboard(dir, 'w-a');
    const save = (defense: unknown) => refusal(saveDefense(dir, { requestId: request.id, defense, types }));

    // Every kind of problem at once: walkthrough missing and unknowns twice, a section with no claims, a ragged table,
    // an unknown diagram item and a basis the schema doesn't know.
    const input = validDefenseInput();
    const sections = [...input.sections.filter((s) => s.id !== 'walkthrough'), { id: 'unknowns', claims: [{ text: 'The send limit.', basis: 'unknown' }] }].map((s) => {
      if (s.id === 'diagram') return { ...s, diagramItemId: 'architecture-gone' };
      if (s.id === 'data') return { ...s, tables: [{ title: 'Source of truth', columns: ['State', 'Owner'], rows: [['Renewal date', 'Billing'], ['Reminders sent', 'The reminders table', 'Daily']] }] };
      if (s.id === 'security') return { ...s, claims: [s.claims[0], { text: 'Tokens expire after a week.', basis: 'maybe' }] };
      if (s.id === 'complexity') return { ...s, claims: [] };
      return s;
    });
    // A question asked twice would share one rating in Practice.
    const questions = [...input.questions, { ...input.questions[0], q: ' What stops a customer  getting two reminders? ' }];
    expect(await save({ ...input, sections, questions })).toEqual({
      type: 'InputError',
      message: [
        RETRY,
        "- sections.3.claims.1.basis: Invalid enum value. Expected 'known' | 'inferred' | 'unknown' | 'verify', received 'maybe'",
        '- sections: diagram: diagramItemId "architecture-gone" isn\'t an item with a diagram. Use one of: architecture-system.',
        '- sections: walkthrough is missing.',
        '- sections: data: table 1 row 2 has 3 cells; it needs 2, one per column.',
        "- sections: complexity needs at least one claim. Mark what isn't known as unknown.",
        '- sections: unknowns is there more than once.',
        '- questions: question 4 repeats question 1.',
      ].join('\n'),
    });
    expect(await fs.readFile(projectFiles(dir).defense, 'utf8')).toBe(before);
    expect(await readWhiteboardRequest(dir)).toEqual(writing);

    // One that's too big, on its own.
    const big = withSections((s) => (s.id === 'summary' || s.id === 'walkthrough' ? { ...s, claims: Array.from({ length: 40 }, () => ({ text: 'x'.repeat(4000), basis: 'known' as const })) } : s));
    const size = JSON.stringify(big).length;
    expect(size).toBeGreaterThan(MAX_DEFENSE_CHARS);
    expect(await save(big)).toEqual({ type: 'InputError', message: `${RETRY}\n- The defense is ${size.toLocaleString('en-US')} characters of JSON; the most is 120,000.` });
    expect(await fs.readFile(projectFiles(dir).defense, 'utf8')).toBe(before);
    expect(await readWhiteboardRequest(dir)).toEqual(writing);

    // The request is still there to send it again, whole.
    const saved = await saveDefense(dir, { requestId: request.id, defense: validDefenseInput(), types });
    expect(await readDefense(dir)).toEqual(saved);
    expect(await readWhiteboardRequest(dir)).toBeNull();
  });

  it("takes a diagram item of the project, and sorts concerns most severe first, keeping the subagent's order within a severity", async () => {
    const dir = await seed();
    const concern = (severity: DefenseInput['concerns'][number]['severity'], text: string) => ({ severity, text, basis: 'inferred' as const });
    const saved = await generate(dir, {
      ...withSections((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-system', diagram: 'job --> mailer --> customer' } : s)),
      concerns: [concern('low', 'Slow query'), concern('critical', 'No unsubscribe link'), concern('info', 'Copy not final'), concern('high', 'Double sends'), concern('low', 'Logs grow'), concern('medium', 'No retry')],
    });
    expect(saved.sections[1]).toEqual({
      id: 'diagram',
      title: 'Whiteboard diagram',
      claims: validDefenseInput().sections[1].claims,
      tables: [],
      diagram: 'job --> mailer --> customer',
      diagramItemId: 'architecture-system',
    });
    expect(saved.concerns.map((c) => `${c.id} ${c.severity}: ${c.text}`)).toEqual([
      'c1 critical: No unsubscribe link',
      'c2 high: Double sends',
      'c3 medium: No retry',
      'c4 low: Slow query',
      'c5 low: Logs grow',
      'c6 info: Copy not final',
    ]);
  });

  it("refuses a diagram item that's parked, has no drawing or doesn't draw a diagram", async () => {
    const parked = pair('architecture-old', { type: 'architecture', title: 'Old overview', status: 'parked' });
    parked.item.data = DIAGRAM;
    const dir = await seedProject({ pairs: [parked, pair('architecture-bare', { type: 'architecture', title: 'Not drawn yet' }), pair('q1')] });
    const request = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    const named = (id: string) => withSections((s) => (s.id === 'diagram' ? { ...s, diagramItemId: id } : s));
    for (const id of ['architecture-old', 'architecture-bare', 'q1']) {
      expect(await refusal(saveDefense(dir, { requestId: request.id, defense: named(id), types }))).toEqual({
        type: 'InputError',
        message: `${RETRY}\n- sections: diagram: diagramItemId "${id}" isn't an item with a diagram, and this project has none. Leave diagramItemId out.`,
      });
    }
  });
});

describe("the defense's presenter", () => {
  const presentTypes = [...types, listType('database', { title: 'Database', screen: 'database', order: 2 }), listType('flows', { title: 'Flows', screen: 'flows', order: 4 })];
  /** Two boxes in a group, one outside it, and a line to each. */
  const BOARD: DiagramData = {
    kind: 'system',
    groups: [{ id: 'aws', label: 'AWS' }],
    nodes: [
      { id: 'job', label: 'Daily reminder job', group: 'aws', status: 'new' },
      { id: 'db', label: 'Postgres', group: 'aws', status: 'unchanged' },
      { id: 'mailer', label: 'Mailer', status: 'external' },
    ],
    edges: [
      { id: 'reads', from: 'job', to: 'db', label: 'finds due subscriptions' },
      { id: 'sends', from: 'job', to: 'mailer' },
    ],
  };
  /** A project with a diagram item drawn as BOARD, a parked diagram item, a user flow, and no tables or system flows. */
  async function presentSeed(): Promise<string> {
    const diagram = pair('architecture-system', { type: 'architecture', title: 'System overview', status: 'resolved' });
    diagram.item.data = BOARD;
    const parked = pair('architecture-old', { type: 'architecture', title: 'Old overview', status: 'parked' });
    parked.item.data = BOARD;
    const browse = pair('flows-browse', { type: 'flows', title: 'Browsing', status: 'resolved' });
    browse.item.data = { kind: 'user', steps: [{ n: 1, label: 'Opens the reminder' }] };
    return seedProject({ pairs: [diagram, parked, browse, pair('q1', { title: 'Who gets reminders?' })] });
  }
  /** A presenter the project above can draw: System flow and Security draw the diagram, the rest draw nothing. */
  const GOOD = {
    chapters: [
      // Notes may be left out, and a caption is trimmed.
      { id: 'purpose', drawing: null, steps: [{ caption: '  Customers forget to reorder, so a daily job reminds them.  ', reveal: [] }] },
      {
        id: 'flow',
        drawing: { kind: 'diagram', itemId: 'architecture-system' },
        steps: [
          // The job's group comes with it, and a line's ends with the line.
          { caption: 'Each morning the job wakes up.', reveal: ['node:job'], notes: [{ near: 'group:aws', text: 'one region', ink: 'slate' }] },
          { caption: 'It finds the subscriptions due soon.', reveal: ['edge:reads'], notes: [{ near: 'node:db', text: 'billing owns the renewal date', ink: 'slate' }] },
          { caption: 'And hands each reminder to the mailer.', reveal: ['edge:sends'], notes: [{ near: 'node:mailer', text: 'runs twice? → one per subscription per day', ink: 'seal' }] },
        ],
      },
      { id: 'data', drawing: null, steps: [{ caption: 'The reminders table records what was sent.', reveal: [], notes: [{ near: '', text: 'source of truth: the reminders table', ink: 'slate' }] }] },
      { id: 'states', drawing: null, steps: [{ caption: 'A subscription is due, or reminded today.', reveal: [] }] },
      { id: 'security', drawing: { kind: 'diagram', itemId: 'architecture-system' }, steps: [{ caption: 'Only the job talks to the mailer.', reveal: ['edge:sends'], notes: [{ near: 'group:aws', text: 'inside the account', ink: 'moss' }] }] },
      { id: 'failure', drawing: null, steps: [{ caption: 'A failed send is tried again on the next run.', reveal: [] }] },
      { id: 'rollback', drawing: null, steps: [{ caption: 'Turn the job off: nothing else depends on it.', reveal: [], notes: [{ near: '', text: 'blast radius: reminder emails only', ink: 'moss' }] }] },
    ],
  };
  /** A step at the schema's limits: a 300-character caption and four 120-character notes at the board's foot. */
  const fullStep = (n: number) => ({
    caption: `${n}. ${'Say this part out loud. '.repeat(20)}`.slice(0, 300),
    reveal: [],
    notes: Array.from({ length: 4 }, (_, k) => ({ near: '', text: `${k + 1}. ${'Mark this on the board. '.repeat(10)}`.slice(0, 120), ink: 'ink' })),
  });
  const fullSteps = Array.from({ length: 8 }, (_, i) => fullStep(i + 1));

  it("a presenter is checked against the project's own drawings", async () => {
    const dir = await presentSeed();
    const request0 = await requestWhiteboard(dir, { now: T0 });
    await pickUpWhiteboard(dir, 'w-a', T1);
    await saveDefense(dir, { requestId: request0.id, defense: validDefenseInput(), types: presentTypes, now: T2 });
    const before = await fs.readFile(projectFiles(dir).defense, 'utf8');
    const request = await requestWhiteboard(dir);
    const writing = await pickUpWhiteboard(dir, 'w-a');
    const save = (presenter: unknown) => refusal(saveDefense(dir, { requestId: request.id, defense: { ...validDefenseInput(), presenter }, types: presentTypes }));

    // Every kind of problem at once.
    const bad = {
      chapters: [
        // A chapter that draws nothing reveals nothing.
        { id: 'purpose', drawing: null, steps: [{ caption: 'Why it exists.', reveal: ['node:job'] }] },
        {
          id: 'flow',
          drawing: { kind: 'diagram', itemId: 'architecture-system' },
          steps: [
            // A box the drawing doesn't have, and a note near one that isn't drawn yet.
            { caption: 'The job.', reveal: ['node:job', 'node:queue'], notes: [{ near: 'node:mailer', text: 'external', ink: 'seal' }] },
            // A box revealed again. The line brings the mailer, so the note is fine now.
            { caption: 'It sends.', reveal: ['edge:sends', 'node:job'], notes: [{ near: 'node:mailer', text: 'retries are theirs', ink: 'seal' }] },
          ],
        },
        // States comes before Data, and draws a parked item.
        { id: 'states', drawing: { kind: 'diagram', itemId: 'architecture-old' }, steps: [{ caption: 'Due or reminded.', reveal: ['node:job'] }] },
        // The project has no tables, and its only flow is a user's.
        { id: 'data', drawing: { kind: 'tables' }, steps: [{ caption: 'The reminders table.', reveal: ['table:RestockReminder'] }] },
        { id: 'security', drawing: { kind: 'flow', itemId: 'flows-browse' }, steps: fullSteps },
        // Failure and retries is missing, and Rollback is there twice: with all these long steps, it's too big.
        { id: 'rollback', drawing: null, steps: fullSteps },
        { id: 'rollback', drawing: null, steps: fullSteps },
      ],
    };
    const size = JSON.stringify(bad).length;
    expect(size).toBeGreaterThan(MAX_PRESENTER_CHARS);
    expect(await save(bad)).toEqual({
      type: 'InputError',
      message: [
        RETRY,
        `- presenter: the presenter is ${size.toLocaleString('en-US')} characters of JSON; the most is 20,000.`,
        '- presenter: chapters must come in this order: purpose, flow, data, states, security, failure, rollback.',
        '- presenter.chapters: purpose step 1: this chapter draws nothing, so leave reveal empty.',
        '- presenter.chapters: flow step 1: "node:queue" isn\'t in this drawing.',
        '- presenter.chapters: flow step 1 note 1: "node:mailer" isn\'t on the board yet.',
        '- presenter.chapters: flow step 2: "node:job" was already revealed in step 1.',
        '- presenter.chapters: data: this project has no tables to draw.',
        '- presenter.chapters: states: there\'s no diagram item "architecture-old". Use one of: architecture-system.',
        '- presenter.chapters: security: there\'s no system flow "flows-browse". There are none, so pick another drawing or none.',
        '- presenter.chapters: failure is missing.',
        '- presenter.chapters: rollback is there more than once.',
      ].join('\n'),
    });
    expect(await fs.readFile(projectFiles(dir).defense, 'utf8')).toBe(before);
    expect(await readWhiteboardRequest(dir)).toEqual(writing);

    // A defense with no presenter is refused too, in its own words.
    const { presenter: _presenter, ...without } = validDefenseInput();
    expect(await refusal(saveDefense(dir, { requestId: request.id, defense: without, types: presentTypes }))).toEqual({
      type: 'InputError',
      message: `${RETRY}\n- presenter is missing. Send the seven chapters too.`,
    });
    expect(await fs.readFile(projectFiles(dir).defense, 'utf8')).toBe(before);
    expect(await readWhiteboardRequest(dir)).toEqual(writing);

    // A valid one is saved with the chapters' titles, in order.
    const saved = await saveDefense(dir, { requestId: request.id, defense: { ...validDefenseInput(), presenter: GOOD }, types: presentTypes });
    expect(saved.presenter!.chapters.map((c) => [c.id, c.title])).toEqual(PRESENT_CHAPTERS.map((c) => [c.id, c.title]));
    expect(saved.presenter!.chapters[0].steps).toEqual([{ caption: 'Customers forget to reorder, so a daily job reminds them.', reveal: [], notes: [] }]);
    expect(saved.presenter!.chapters[1]).toEqual({ id: 'flow', title: 'System flow', drawing: { kind: 'diagram', itemId: 'architecture-system' }, steps: GOOD.chapters[1].steps });
    expect(await readDefense(dir)).toEqual(saved);
    expect(await readWhiteboardRequest(dir)).toBeNull();

    // A defense saved before Present, with no presenter, still reads.
    const { presenter: _saved, ...old } = saved;
    await writeDefense(dir, old);
    expect(await readDefense(dir)).toEqual(old);
    expect((await readDefense(dir))!.presenter).toBeUndefined();
  });
});

describe('a defense out of date', () => {
  /** A project with a defense just saved, still current. */
  async function current() {
    const dir = await seed();
    const defense = await generate(dir);
    expect(await defenseStale(dir, defense)).toBeNull();
    return { dir, defense };
  }

  it('only plan changes make the defense out of date', async () => {
    // Asking Claude about it, sending a part of it, review marks and practice leave it current.
    const { dir, defense } = await current();
    const asked = pair('defense-link-token', { type: 'defense', title: 'Does the unsubscribe link need a token?', status: 'resolved' });
    await writeItem(dir, { ...asked.item, createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'section', ref: 'security' } });
    await writeThread(dir, asked.thread);
    await addDecision(dir, { text: 'The unsubscribe link carries a signed token.', threadId: asked.thread.id, itemIds: [asked.item.id] });
    const sent = pair('questions-unsubscribe-link', { title: 'Whether the unsubscribe link needs a signed token.', status: 'with_claude' });
    await writeItem(dir, { ...sent.item, createdBy: 'whiteboard', fromDefense: { id: defense.id, kind: 'claim', ref: 'security.1' } });
    await writeThread(dir, sent.thread);
    const q1 = await readItem(dir, 'q1');
    await writeItem(dir, { ...q1, flags: [{ reason: 'May need another look', fromThreadId: 't-c1', at: T3.toISOString() }] });
    await setReviewed(dir, 'c1', true);
    await writePractice(dir, { ratings: { [defense.questions[0].q]: { rating: 'could', at: T3.toISOString() } }, ticks: { [defense.checklist[0].text]: T3.toISOString() } });
    expect(await defenseStale(dir, defense)).toBeNull();
    // Answering a question sent from it is a decision about the plan, though.
    await addDecision(dir, { text: 'The link carries a signed token.', threadId: sent.thread.id, itemIds: [sent.item.id] });
    expect(await defenseStale(dir, defense)).toBe(PLAN_CHANGED);

    // Each of these, on its own, makes it out of date.
    const changes: Record<string, (dir: string) => Promise<unknown>> = {
      'a draft edit': (d) => writeDocText(d, 'docs/draft.md', `${DRAFT}\nRemind three days before.\n`),
      'a new decision on a plumbing thread': (d) => addDecision(d, { text: 'Everyone with an active subscription.', threadId: 't-q1', itemIds: ['q1'] }),
      "an item's summary": async (d) => writeItem(d, { ...(await readItem(d, 'q1')), summary: 'Only active subscribers.' }),
      'a parked thread': (d) => setParked(d, 't-c1', true),
      // An item Claude adds from a Defense thread is a plan item like any other.
      'a Questions item Claude added from a Defense thread': (d) =>
        writeItem(d, { ...pair('questions-sign-the-link', { title: 'Sign the unsubscribe link?', links: ['defense-link-token'] }).item, createdBy: 'claude' }),
    };
    for (const [change, make] of Object.entries(changes)) {
      const fresh = await current();
      await make(fresh.dir);
      expect(await defenseStale(fresh.dir, fresh.defense), change).toBe(PLAN_CHANGED);
    }

    // A final accepted after a defense of the draft says so.
    const accepted = await current();
    await acceptFinal(accepted.dir);
    expect(await defenseStale(accepted.dir, accepted.defense)).toBe('Out of date: a final was accepted since this was generated.');
  });

  it('says whether a defense is ready, out of date or being written, for the header and the navigation', async () => {
    const dir = await seed();
    expect(await defenseStatus(dir)).toEqual({ ready: false, stale: false, state: null });
    const request = await requestWhiteboard(dir);
    expect(await defenseStatus(dir)).toEqual({ ready: false, stale: false, state: 'requested' });
    await pickUpWhiteboard(dir, 'w-a');
    expect(await defenseStatus(dir)).toEqual({ ready: false, stale: false, state: 'writing' });
    await saveDefense(dir, { requestId: request.id, defense: validDefenseInput(), types });
    expect(await defenseStatus(dir)).toEqual({ ready: true, stale: false, state: null });
    await writeDocText(dir, 'docs/draft.md', `${DRAFT}\nRemind three days before.\n`);
    expect(await defenseStatus(dir)).toEqual({ ready: true, stale: true, state: null });
    // Regenerate: the defense stays while the next one is asked for.
    await requestWhiteboard(dir);
    expect(await defenseStatus(dir)).toEqual({ ready: true, stale: true, state: 'requested' });
  });
});

describe("the defense's checklist", () => {
  it("reads a rules file's checklist lines, in order, each once, at most 40 of 300 characters", async () => {
    const rules = '# Rules\n\n```text\n[ ] I can explain the purpose.\n  - [ ] I can draw the system flow.   \n* [ ] I can explain the purpose.\n[x] Done already.\nNot [ ] a line.\n```\n';
    expect(checklistLines(rules)).toEqual(['I can explain the purpose.', 'I can draw the system flow.']);
    const many = checklistLines(Array.from({ length: 45 }, (_, i) => `[ ] Line ${i + 1} ${'x'.repeat(400)}`).join('\n'));
    expect(many).toHaveLength(40);
    expect(many.every((line) => line.length === 300)).toBe(true);
    expect(many[39]).toMatch(/^Line 40 x/);
    expect(checklistLines('# Rules with no checklist\n')).toEqual([]);
    // The shipped rules file's 20 lines are the fixture's.
    expect(checklistLines(await fs.readFile(SHIPPED_RULES, 'utf8'))).toEqual(validDefenseInput().checklist);
  });

  it("saves the rules file's checklist, whatever the subagent sent, and needs the subagent's when the rules have none", async () => {
    const dir = await seed();
    const first = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    const fromRules = ['I can explain the purpose.', 'I understand the blast radius.'];
    const saved = await saveDefense(dir, { requestId: first.id, defense: { ...validDefenseInput(), checklist: [] }, types, checklist: fromRules });
    expect(saved.checklist).toEqual([
      { id: 'k1', text: 'I can explain the purpose.' },
      { id: 'k2', text: 'I understand the blast radius.' },
    ]);

    const second = await requestWhiteboard(dir);
    await pickUpWhiteboard(dir, 'w-a');
    const save = (checklist: string[]) => refusal(saveDefense(dir, { requestId: second.id, defense: { ...validDefenseInput(), checklist }, types, checklist: [] }));
    expect(await save([])).toEqual({ type: 'InputError', message: `${RETRY}\n- checklist: the rules file has no checklist, so send one.` });
    expect(await save(['I can explain the purpose.', 'I know the blast radius.', ' I can explain  the purpose. '])).toEqual({
      type: 'InputError',
      message: `${RETRY}\n- checklist: line 3 repeats line 1.`,
    });
    const own = await saveDefense(dir, { requestId: second.id, defense: { ...validDefenseInput(), checklist: ['I can explain the purpose.'] }, types });
    expect(own.checklist).toEqual([{ id: 'k1', text: 'I can explain the purpose.' }]);
  });
});
