import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PLAN_CHANGES_TYPE } from '../src/planChanges';
import type { Option } from '../src/schemas';
import { importPack } from '../src/store/context';
import { finishImport, writeImportBatch } from '../src/store/importItems';
import { readItem, readProjectFile, readThread } from '../src/store/io';
import { loadProjectHome } from '../src/store/projects';
import { finishSubmission, pendingSubmissions, pickUp } from '../src/store/queue';
import { postReply } from '../src/store/reply';
import { submit } from '../src/store/submit';
import { saveDraft, setParked } from '../src/store/threads';
import { catchUpDue, catchUpWaiting, startCatchUp, updatePlan } from '../src/store/update';
import { planHash } from '../src/store/versions';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const T = new Date('2026-10-08T10:00:00.000Z');
const types = [...TYPES, PLAN_CHANGES_TYPE];
const IMPORTABLE = ['architecture', 'questions', 'concerns'];
/** Your draft: the Approach line, edited. */
const OURS = DRAFT.replace('sends a reminder.', 'sends an email reminder.');
/** The repo's v2: the same Approach line edited another way (a conflict), and the Data line (merged cleanly). */
const V2 = DRAFT.replace('sends a reminder.', 'sends a text message.').replace('Log reminders in a table.', 'Log each reminder in a reminders table.');
/** The repo's v3: the Approach line again, which the settled conflict changed in the draft too (another conflict). */
const V3 = V2.replace('sends a text message.', 'sends a push notification.');
const HOURLY: Option = { id: 'hourly', label: 'Hourly', change: { md: [{ find: 'A daily job', replace: 'An hourly job' }] } };
const CONFLICT = 't-plan-changes-v2-1';

/**
 * A project imported from DRAFT (v1), with OURS as its draft and two imported questions: "approach", which offers to
 * run the job hourly, and "who".
 */
async function seed(): Promise<string> {
  const approach = pair('questions-approach', { title: 'How often does the job run?', options: [HOURLY] });
  const who = pair('questions-who', { title: 'Who gets reminders?' });
  const dir = await seedProject({
    pairs: [
      { ...approach, item: { ...approach.item, key: 'approach', mdAnchor: { heading: 'Approach' } } },
      { ...who, item: { ...who.item, key: 'who' } },
    ],
    project: { source: { path: 'docs/specs/restock.md', clone: '/tmp/acme', branch: 'main', hashAtImport: planHash(DRAFT) } },
  });
  await fs.writeFile(path.join(dir, 'docs', 'draft.md'), OURS);
  return dir;
}

const update = (dir: string, repoText: string, now = T) =>
  updatePlan(dir, { repoText, clone: '/Users/you/src/acme', branch: 'main', commit: null, types, home: '/Users/you', now });

/** Claude takes the oldest waiting submission and answers each of its threads with `reply`, then ends it. */
async function claudeAnswers(dir: string, reply: (threadId: string) => Parameters<typeof postReply>[1]['reply']): Promise<void> {
  const [next] = await pendingSubmissions(dir);
  const s = await pickUp(dir, next!.id, 'w-a');
  for (const threadId of s.sent) await postReply(dir, { reply: reply(threadId), types, autoApply: false, clone: '/tmp/acme' });
  await finishSubmission(dir, s.id, []);
}

/** Claude's three choices for a Plan changes thread, as its rules say: the merged version, the repo's, or the draft as it is. */
const choices = (find: string, merged: string, theirs: string) => (threadId: string) => ({
  threadId,
  text: 'Your draft says email, and the repo says a text message.',
  options: [
    { id: 'merged', label: 'Use the merged version', change: { md: [{ find, replace: merged }] } },
    { id: 'theirs', label: "Take the repo's version", change: { md: [{ find, replace: theirs }] } },
    { id: 'keep', label: 'Keep my draft', change: { md: [] } },
  ],
  recommended: 'merged',
});
const APPROACH_CHOICES = choices('sends an email reminder.', 'sends an email or a text message.', 'sends a text message.');
/** The second conflict, when your draft changed the Data line too. */
const DATA = 't-plan-changes-v2-2';
const DATA_CHOICES = choices('Log reminders in an audit table.', 'Log each reminder in an audit table.', 'Log each reminder in a reminders table.');

/** You pick an option on a thread and send it: an accept, applied and resolved at once. */
async function accept(dir: string, threadId: string, optionId: string): Promise<void> {
  await saveDraft(dir, threadId, { optionId }, T);
  expect((await submit(dir, { scope: 'thread', threadId, types, now: T })).resolved).toEqual([threadId]);
}

/** You answer a thread in your own words and send it, so it waits for Claude. */
async function ask(dir: string, threadId: string, text: string): Promise<void> {
  await saveDraft(dir, threadId, { text }, T);
  expect((await submit(dir, { scope: 'thread', threadId, types, now: T })).sent).toEqual([threadId]);
}

/** v2 is in, its re-import done, and Claude has offered its choices on the one conflict, which is your turn now. */
async function atV2(): Promise<string> {
  const dir = await seed();
  expect(await update(dir, V2)).toMatchObject({ version: 2, conflicts: 1, conflictThreadIds: [CONFLICT] });
  expect(await finishImport(dir)).toBe(true);
  await claudeAnswers(dir, APPROACH_CHOICES);
  expect((await readThread(dir, CONFLICT)).status).toBe('your_turn');
  return dir;
}

/** As atV2, but your draft changed the Data line too, so v2 leaves two conflicts: Approach (v2-1) and Data (v2-2). */
async function atV2WithTwo(): Promise<string> {
  const dir = await seed();
  await fs.writeFile(path.join(dir, 'docs', 'draft.md'), OURS.replace('Log reminders in a table.', 'Log reminders in an audit table.'));
  expect(await update(dir, V2)).toMatchObject({ version: 2, conflicts: 2, conflictThreadIds: [CONFLICT, DATA] });
  expect(await finishImport(dir)).toBe(true);
  await claudeAnswers(dir, (threadId) => (threadId === DATA ? DATA_CHOICES : APPROACH_CHOICES)(threadId));
  return dir;
}

/** Every importer of the catch-up sends its batch: Questions changes "approach", the others have no changes. */
async function runImporters(dir: string, importTypes: string[]): Promise<boolean[]> {
  const finished: boolean[] = [];
  for (const id of importTypes) {
    const type = types.find((t) => t.id === id)!;
    const batch = id === 'questions' ? { items: [{ key: 'approach', summary: 'Email or a text message, from a daily job.' }] } : { noChanges: 'Nothing changed for this type.' };
    finished.push((await writeImportBatch({ dir, type, types, batch, clone: '/tmp/acme', now: T })).importFinished);
  }
  return finished;
}

describe('catching the items up with settled Plan changes', () => {
  it('the catch-up runs once, and only when it should', async () => {
    const dir = await seed();
    await update(dir, V2);
    // Not while the update's re-import runs, nor while Claude has the conflict.
    expect(await catchUpDue(dir)).toBeNull();
    await finishImport(dir);
    expect((await readThread(dir, CONFLICT)).status).toBe('with_claude');
    expect(await catchUpDue(dir)).toBeNull();

    // Not while a Plan changes item is open: Claude offered its choices, and it's your turn.
    await claudeAnswers(dir, APPROACH_CHOICES);
    expect(await catchUpDue(dir)).toBeNull();
    expect(await catchUpWaiting(dir)).toBeNull();
    // You took the hourly job meanwhile: an answer to another item, which the catch-up won't carry.
    await accept(dir, 't-questions-approach', 'hourly');

    // Not while a thread is with Claude: you asked about "who", then settled the conflict with the merged version,
    // which changed the draft.
    await ask(dir, 't-questions-who', 'Only active subscribers?');
    await accept(dir, CONFLICT, 'merged');
    expect(await fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8')).toContain('An hourly job finds subscriptions due soon and sends an email or a text message.');
    expect(await catchUpWaiting(dir)).toBe(2);
    expect(await catchUpDue(dir)).toBeNull();
    await claudeAnswers(dir, (threadId) => ({ threadId, text: 'Yes, active subscribers only.', resolve: { decision: 'Only active subscribers get reminders' } }));

    // Once every Plan changes item is settled and nothing is under way, it's due.
    expect(await catchUpDue(dir)).toBe(2);
    expect(await startCatchUp(dir, { version: 2, types, windowId: 'w-a', now: T })).toEqual({ importTypes: IMPORTABLE });
    expect(await readProjectFile(dir)).toMatchObject({
      status: 'importing',
      importPending: IMPORTABLE,
      reimporting: { version: 2, from: 'active', catchUp: true },
      importBy: 'w-a',
      caughtUp: 2,
    });
    // The importers get only what settling the conflict did, not the hourly job.
    expect((await importPack({ dir, typeId: 'questions', types })).reimport!.changes).toBe(
      ['@@ Approach', '- sends an email reminder.', '+ sends an email or a text message.'].join('\n'),
    );
    // Not while it runs.
    expect(await catchUpDue(dir)).toBeNull();
    expect(await runImporters(dir, IMPORTABLE)).toEqual([false, false, true]);
    // It's a re-import of v2, so the changed item is flagged as after the update, and its thread says the settled Plan
    // changes did it.
    const approach = await readItem(dir, 'questions-approach');
    expect(approach.summary).toBe('Email or a text message, from a daily job.');
    expect(approach.flags).toEqual([{ reason: "Changed in the plan's v2.", fromThreadId: 't-questions-approach', at: T.toISOString() }]);
    expect((await readThread(dir, 't-questions-approach')).messages.at(-1)).toMatchObject({ author: 'system', text: 'Updated to match your settled Plan changes.' });
    const done = await readProjectFile(dir);
    expect(done).toMatchObject({ status: 'active', importPending: [], caughtUp: 2 });
    expect(done.reimporting).toBeUndefined();
    expect(done.importBy).toBeUndefined();

    // Not again.
    expect(await catchUpDue(dir)).toBeNull();
    expect(await catchUpWaiting(dir)).toBeNull();

    // A later update to v3 can catch up again, once its own conflict is settled.
    expect(await update(dir, V3, new Date('2026-10-09T10:00:00.000Z'))).toMatchObject({ version: 3, conflicts: 1 });
    expect(await finishImport(dir)).toBe(true);
    expect(await catchUpDue(dir)).toBeNull();
    await claudeAnswers(dir, choices('sends an email or a text message.', 'sends an email, a text message or a push notification.', 'sends a push notification.'));
    expect(await catchUpDue(dir)).toBeNull();
    await accept(dir, 't-plan-changes-v3-1', 'merged');
    expect(await catchUpDue(dir)).toBe(3);
  });

  it("doesn't run when settling the Plan changes changed nothing, even once another answer changed the draft", async () => {
    const dir = await atV2();
    // Keep my draft settles the conflict and changes nothing. You took the hourly job too, which changed the draft,
    // but that's your answer to another item, not something settling the Plan changes did.
    await accept(dir, CONFLICT, 'keep');
    await accept(dir, 't-questions-approach', 'hourly');
    expect((await readThread(dir, CONFLICT)).status).toBe('resolved');
    expect(await fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8')).not.toBe(await fs.readFile(path.join(dir, 'docs', 'versions', 'v2', 'merged.md'), 'utf8'));
    expect(await catchUpWaiting(dir)).toBeNull();
    expect(await catchUpDue(dir)).toBeNull();
    // So the project home says none is waiting, and the Plan changes list has no line about it, which would otherwise
    // stay for good: nothing would ever run to set caughtUp.
    expect((await loadProjectHome({ repo: 'acme', id: 'restock', dir }, types)).catchUpDue).toBe(false);
  });

  it('counts a parked Plan changes thread as settled', async () => {
    // Parking changes nothing: with the other conflict kept as your draft, nothing is due, whatever else you answered.
    const kept = await atV2WithTwo();
    await setParked(kept, CONFLICT, true, T);
    await accept(kept, 't-questions-approach', 'hourly');
    expect(await catchUpWaiting(kept)).toBeNull();
    await accept(kept, DATA, 'keep');
    expect(await catchUpWaiting(kept)).toBeNull();
    expect(await catchUpDue(kept)).toBeNull();

    // With the other one settled with the merged version, it's due: the parked one doesn't hold it up.
    const merged = await atV2WithTwo();
    await setParked(merged, CONFLICT, true, T);
    expect(await catchUpWaiting(merged)).toBeNull();
    await accept(merged, DATA, 'merged');
    expect(await catchUpDue(merged)).toBe(2);
  });

  it('waits while an update that stopped part-way still has its journal', async () => {
    const dir = await atV2();
    await accept(dir, CONFLICT, 'merged');
    expect(await catchUpDue(dir)).toBe(2);
    // The journal of an update to v3 that didn't finish: planChange or updatePlan puts it back first.
    await fs.writeFile(path.join(dir, 'docs', 'versions', 'v2', 'update.json'), JSON.stringify({ to: 3, created: [], wrote: { draft: 'x', original: 'y' } }));
    expect(await catchUpDue(dir)).toBeNull();
  });

  it('keeps a finalized project finalized, and with no type to import, only records the version', async () => {
    const dir = await atV2();
    await accept(dir, CONFLICT, 'merged');
    const project = await readProjectFile(dir);
    await fs.writeFile(path.join(dir, 'project.json'), JSON.stringify({ ...project, status: 'finalized' }));
    expect(await startCatchUp(dir, { version: 2, types: [PLAN_CHANGES_TYPE], windowId: 'w-a', now: T })).toEqual({ importTypes: [] });
    const after = await readProjectFile(dir);
    expect(after).toMatchObject({ status: 'finalized', caughtUp: 2, importPending: [] });
    expect(after.reimporting).toBeUndefined();
    expect(await catchUpDue(dir)).toBeNull();

    const again = await atV2();
    await accept(again, CONFLICT, 'merged');
    await fs.writeFile(path.join(again, 'project.json'), JSON.stringify({ ...(await readProjectFile(again)), status: 'finalized' }));
    await startCatchUp(again, { version: 2, types, windowId: 'w-a', now: T });
    expect((await readProjectFile(again)).reimporting).toEqual({ version: 2, from: 'finalized', catchUp: true });
    await runImporters(again, IMPORTABLE);
    expect((await readProjectFile(again)).status).toBe('finalized');
  });
});

describe("a catch-up importer's pack", () => {
  it("taking the repo's version runs one catch-up, whose changes hold only that edit, and no conflicts", async () => {
    const dir = await atV2();
    // Your answer to another item changed the draft too. Then you took the repo's version of the conflict.
    await accept(dir, 't-questions-approach', 'hourly');
    await accept(dir, CONFLICT, 'theirs');
    expect(await catchUpWaiting(dir)).toBe(2);
    await startCatchUp(dir, { version: 2, types, windowId: 'w-a', now: T });
    const pack = await importPack({ dir, typeId: 'questions', types });
    expect(pack.reimport).toMatchObject({ from: 2, to: 2, catchUp: true, conflicts: [] });
    // Each edit settling made, under its passage's heading: the hourly job isn't one of them.
    expect(pack.reimport!.changes).toBe(['@@ Approach', '- sends an email reminder.', '+ sends a text message.'].join('\n'));
    expect(pack.reimport!.existing.map((e) => e.key)).toEqual(['approach', 'who']);
    expect(pack.draft).toBe(await fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8'));
    // Once.
    await runImporters(dir, IMPORTABLE);
    expect(await catchUpWaiting(dir)).toBeNull();
  });
});

describe('a catch-up still waiting when a newer version comes in', () => {
  it("rides along with the update's re-import, and isn't run on its own", async () => {
    const dir = await atV2();
    await accept(dir, CONFLICT, 'theirs');
    expect(await catchUpWaiting(dir)).toBe(2);
    expect(await update(dir, V3, new Date('2026-10-09T10:00:00.000Z'))).toMatchObject({ version: 3 });
    const project = await readProjectFile(dir);
    expect(project.caughtUp).toBe(2);
    expect(project.reimporting).toMatchObject({ version: 3, carriedCatchUp: 2 });
    const pack = await importPack({ dir, typeId: 'questions', types });
    expect(pack.reimport).toMatchObject({ from: 2, to: 3, catchUp: false });
    expect(pack.reimport!.changes).toContain('push notification');
    expect(pack.reimport!.changes).toContain(
      ["Settled in v2's Plan changes:", '@@ Approach', '- sends an email reminder.', '+ sends a text message.'].join('\n'),
    );
    expect(await finishImport(dir)).toBe(true);
    expect(await catchUpWaiting(dir)).toBeNull();
    expect(await catchUpDue(dir)).toBeNull();
  });
});
