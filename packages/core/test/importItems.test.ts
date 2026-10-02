import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { importItemSchema, itemPatchSchema, newItemSchema, type Item, type Thread } from '../src/schemas';
import { finishImport, verifyCodeRefs, writeImportBatch } from '../src/store/importItems';
import { InputError, readItem, readItems, readProjectFile, readThread } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, makeRepo, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const questions = TYPES.find((t) => t.id === 'questions')!;
const architecture = TYPES.find((t) => t.id === 'architecture')!;
const ui = listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 });
const flows = listType('flows', { title: 'Flows', screen: 'flows', order: 4 });
const phases = listType('phases', { title: 'Phases & milestones', timeline: true, order: 7 });
const ALL = [...TYPES, ui, flows, phases];
const importing = () => seedProject({ project: { status: 'importing', importPending: ['architecture', 'questions'] } });

/** An item of `type`, with `data`, and its thread. */
const drawn = (id: string, type: string, data?: unknown): { item: Item; thread: Thread } => {
  const p = pair(id, { type });
  return data === undefined ? p : { ...p, item: { ...p.item, data } };
};
const reminderMap = {
  kind: 'system',
  groups: [{ id: 'worker', label: 'apps/worker' }],
  nodes: [
    { id: 'job', label: 'Daily reminder job', group: 'worker', status: 'new' },
    { id: 'db', label: 'Postgres', status: 'unchanged' },
  ],
  edges: [{ id: 'e1', from: 'job', to: 'db', label: 'finds due' }],
};

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
      types: TYPES,
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
    await writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'The plan leaves nothing open.' } });
    const r = await writeImportBatch({ dir, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'Nothing structural changes.' } });
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
      types: TYPES,
      clone: '/x',
      batch: {
        items: [
          { key: 'a', title: 'A', summary: 'a', fields: { severity: 'high' } },
          { key: 'a', title: 'A again', summary: 'a', links: ['ghost'] },
          { key: 'b', title: 'B', summary: 'b', message: { text: 'Pick one', options: [{ id: 'x', label: 'X', change: { md: [{ find: 'not in the draft', replace: 'y' }] } }, { id: 'custom', label: 'Something else' }], recommended: 'z' } },
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
    expect(message).toMatch(/reserved for the Custom answer/);
    expect((await readItems(dir)).values).toEqual([]);
    expect((await readProjectFile(dir)).importPending).toEqual(['architecture', 'questions']);
  });

  it('refuses a type that was already imported, and a batch with both or neither', async () => {
    const dir = await importing();
    await writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'None.' } });
    await expect(writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'Again.' } })).rejects.toThrow(/already been imported/);
    await expect(writeImportBatch({ dir, type: architecture, types: TYPES, clone: '/x', batch: {} })).rejects.toThrow(/either items/);
    await expect(
      writeImportBatch({ dir, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'x', items: [{ key: 'k', title: 't', summary: 's' }] } }),
    ).rejects.toThrow(/either items/);
  });

  it("marks types whose importer didn't finish", async () => {
    const dir = await importing();
    await writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'None.' } });
    expect(await finishImport(dir)).toBe(true);
    const p = await readProjectFile(dir);
    expect(p).toMatchObject({ status: 'active', importPending: [] });
    expect(p.emptyTypes.find((e) => e.type === 'architecture')?.reason).toMatch(/didn't finish/);
    expect(await finishImport(dir)).toBe(false);
  });

  it('keeps new item ids clear of existing ones', async () => {
    const dir = await seedProject({ pairs: [pair('questions-who')], project: { status: 'importing', importPending: ['questions'] } });
    const r = await writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { items: [{ key: 'who', title: 'Who?', summary: 's' }] } });
    expect(r.itemIds).toEqual(['questions-who-2']);
  });
});

describe('drawings in an import batch', () => {
  it('writes a diagram as it was sent', async () => {
    const dir = await importing();
    await writeImportBatch({ dir, type: architecture, types: ALL, clone: '/x', batch: { items: [{ key: 'map', title: 'Reminder job', summary: 's', data: reminderMap }] } });
    expect((await readItem(dir, 'architecture-map')).data).toEqual(reminderMap);
  });

  it('a diagram with a line to a missing box writes nothing and says which', async () => {
    const dir = await importing();
    const data = { ...reminderMap, edges: [...reminderMap.edges, { id: 'e2', from: 'job', to: 'email' }] };
    const attempt = writeImportBatch({ dir, type: architecture, types: ALL, clone: '/x', batch: { items: [{ key: 'map', title: 'Reminder job', summary: 's', data }] } });
    await expect(attempt).rejects.toThrow(InputError);
    expect(await attempt.catch((e: Error) => e.message)).toMatch(/Nothing was saved[\s\S]*Item 1 \(map\): Edge "e2" ends at "email", which isn't one of the node ids\./);
    expect((await readItems(dir)).values).toEqual([]);
    expect((await readProjectFile(dir)).importPending).toEqual(['architecture', 'questions']);
  });

  it('refuses data on a plain list type', async () => {
    const dir = await importing();
    const attempt = writeImportBatch({ dir, type: questions, types: ALL, clone: '/x', batch: { items: [{ key: 'who', title: 'Who?', summary: 's', data: { anything: true } }] } });
    expect(await attempt.catch((e: Error) => e.message)).toMatch(/Item 1 \(who\): This plumbing type's items don't take data\. Leave data out\./);
  });

  it('a phase may list existing items and keys from its batch, and is written with ids', async () => {
    const dir = await seedProject({ pairs: [drawn('architecture-map', 'architecture', reminderMap)], project: { status: 'importing', importPending: ['phases'] } });
    await writeImportBatch({
      dir,
      type: phases,
      types: ALL,
      clone: '/x',
      batch: {
        items: [
          { key: 'build', title: 'Build the job', summary: 's', data: { order: 1, goal: 'The job sends reminders.', doneWhen: ['Runs in staging'], itemIds: ['architecture-map'] } },
          { key: 'launch', title: 'Launch', summary: 's', data: { order: 2, goal: 'Everyone gets reminders.', doneWhen: ['On for all customers'], itemIds: ['build', 'architecture-map'] } },
        ],
      },
    });
    expect((await readItem(dir, 'phases-launch')).data).toEqual({ order: 2, goal: 'Everyone gets reminders.', doneWhen: ['On for all customers'], itemIds: ['phases-build', 'architecture-map'] });
  });

  it('refuses a phase that lists an item that does not exist', async () => {
    const dir = await seedProject({ project: { status: 'importing', importPending: ['phases'] } });
    const attempt = writeImportBatch({
      dir,
      type: phases,
      types: ALL,
      clone: '/x',
      batch: { items: [{ key: 'build', title: 'Build', summary: 's', data: { order: 1, goal: 'Ship.', doneWhen: ['Live'], itemIds: ['architecture-ghost'] } }] },
    });
    expect(await attempt.catch((e: Error) => e.message)).toMatch(/Item 1 \(build\): itemIds: there's no item "architecture-ghost"\./);
    expect((await readItems(dir)).values).toEqual([]);
  });

  it("a flow step's mockupId must be a UI item", async () => {
    const pairs = [drawn('ui-account', 'ui', { location: { app: 'web', route: '/account', files: [] }, kit: 'web' }), drawn('questions-who', 'questions')];
    const flow = (mockupId: string) => ({ kind: 'user', steps: [{ n: 1, label: 'Opens the account page', mockupId }] });
    const dir = await seedProject({ pairs, project: { status: 'importing', importPending: ['flows'] } });
    const attempt = writeImportBatch({ dir, type: flows, types: ALL, clone: '/x', batch: { items: [{ key: 'signup', title: 'Turn on reminders', summary: 's', data: flow('questions-who') }] } });
    expect(await attempt.catch((e: Error) => e.message)).toMatch(/Item 1 \(signup\): Step 1: mockupId "questions-who" isn't a UI item\./);
    await writeImportBatch({ dir, type: flows, types: ALL, clone: '/x', batch: { items: [{ key: 'signup', title: 'Turn on reminders', summary: 's', data: flow('ui-account') }] } });
    expect((await readItem(dir, 'flows-signup')).data).toEqual(flow('ui-account'));
  });

  it("checks the data in an opening message's options", async () => {
    const dir = await seedProject({ pairs: [drawn('architecture-map', 'architecture', reminderMap)], project: { status: 'importing', importPending: ['questions'] } });
    const broken = { ...reminderMap, edges: [{ id: 'e1', from: 'queue', to: 'job' }] };
    const attempt = writeImportBatch({
      dir,
      type: questions,
      types: ALL,
      clone: '/x',
      batch: { items: [{ key: 'queue', title: 'Add a queue?', summary: 's', message: { text: 'Queue the sends?', options: [{ id: 'queue', label: 'Use a queue', change: { items: [{ itemId: 'architecture-map', patch: { data: broken } }] } }] } }] },
    });
    expect(await attempt.catch((e: Error) => e.message)).toMatch(/Item 1 \(queue\): Option "queue": Item "architecture-map": Edge "e1" starts at "queue", which isn't one of the node ids\./);
  });

  it("subagents can't set an anchor", () => {
    const anchor = { itemId: 'architecture-map', kind: 'node', ref: 'job', label: 'Daily reminder job' };
    expect(importItemSchema.parse({ key: 'k', title: 't', summary: 's', anchor })).not.toHaveProperty('anchor');
    expect(newItemSchema.parse({ type: 'questions', title: 't', summary: 's', message: { text: 'm' }, anchor })).not.toHaveProperty('anchor');
    expect(itemPatchSchema.safeParse({ anchor }).success).toBe(false);
  });
});
