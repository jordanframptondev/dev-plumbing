import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { importItemSchema, itemPatchSchema, newItemSchema, type ImportItem, type Item, type Message, type PlumbingProject, type Thread } from '../src/schemas';
import { addDecision } from '../src/store/decisions';
import { claimImport, finishImport, IMPORT_DID_NOT_FINISH, verifyCodeRefs, writeImportBatch } from '../src/store/importItems';
import { InputError, readItem, readItems, readProjectFile, readThread, readThreads, writeProjectFile } from '../src/store/io';
import { setParked } from '../src/store/threads';
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

  it('is ended early only by the window that runs the importers, or by another once that one is gone', async () => {
    const dir = await importing();
    await claimImport(dir, 'w-a');
    expect((await readProjectFile(dir)).importBy).toBe('w-a');
    // Another window listening on the project, while w-a's importers are still at work.
    expect(await finishImport(dir, { windowId: 'w-b', isAlive: (w) => w === 'w-a' })).toBe(false);
    expect((await readProjectFile(dir)).status).toBe('importing');
    // w-a is gone.
    expect(await finishImport(dir, { windowId: 'w-b', isAlive: () => false })).toBe(true);
    const p = await readProjectFile(dir);
    expect(p.status).toBe('active');
    expect(p.importBy).toBeUndefined();
    // Once it's done, nothing is claimed.
    await claimImport(dir, 'w-c');
    expect((await readProjectFile(dir)).importBy).toBeUndefined();

    const own = await importing();
    await claimImport(own, 'w-a');
    expect(await finishImport(own, { windowId: 'w-a', isAlive: () => true })).toBe(true);
    // The last batch ends it too, whoever sent it.
    const last = await importing();
    await claimImport(last, 'w-a');
    await writeImportBatch({ dir: last, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'None.' } });
    expect((await readProjectFile(last)).importBy).toBe('w-a');
    expect((await writeImportBatch({ dir: last, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'None.' } })).importFinished).toBe(true);
    expect((await readProjectFile(last)).importBy).toBeUndefined();
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

describe('re-import', () => {
  const T2 = new Date('2026-10-05T10:00:00.000Z');
  const T3 = new Date('2026-10-06T10:00:00.000Z');
  const AT = '2026-10-01T09:00:00.000Z';
  /** A Questions item an importer wrote for `key` at an earlier version: id questions-<key>, titled "Question <key>". */
  const imported = (key: string, o: Parameters<typeof pair>[1] = {}): { item: Item; thread: Thread } => {
    const p = pair(`questions-${key}`, { title: `Question ${key}`, ...o });
    return { ...p, item: { ...p.item, key } };
  };
  /** The batch item that says exactly what imported(key) holds. */
  const same = (key: string): ImportItem => ({ key, title: `Question ${key}`, summary: 'A summary.' });
  /** A project re-importing Questions (and any other `pending` types) for v2, or `version`. */
  const reimporting = (
    pairs: { item: Item; thread: Thread }[],
    o: { version?: number; from?: 'active' | 'finalized'; pending?: string[]; project?: Partial<PlumbingProject> } = {},
  ) =>
    seedProject({
      pairs,
      project: { status: 'importing', importPending: o.pending ?? ['questions'], reimporting: { version: o.version ?? 2, from: o.from ?? 'active' }, ...o.project },
    });
  /** A Questions batch: `items`, and the keys the new version took out of the plan. */
  const send = (dir: string, items: ImportItem[], o: { now?: Date; removed?: string[] } = {}) =>
    writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { items, ...(o.removed ? { removed: o.removed } : {}) }, now: o.now ?? T2 });
  const files = (dir: string, ...rels: string[]) => Promise.all(rels.map((rel) => fs.readFile(path.join(dir, rel), 'utf8')));
  const pairFiles = (id: string) => [`items/${id}.json`, `threads/t-${id}.json`];
  const answered: Message[] = [
    { id: 'm-1', at: AT, author: 'claude', text: 'Who first?', opening: true, options: [{ id: 'all', label: 'Everyone' }, { id: 'some', label: 'Active subscribers' }] },
    { id: 'y-1', at: AT, author: 'you', optionId: 'some', optionLabel: 'Active subscribers' },
    { id: 'm-2', at: AT, author: 'claude', text: 'Active subscribers first, then everyone.', resolved: true },
  ];

  it('leaves an item whose key and content are the same untouched', async () => {
    const who = imported('who');
    // Its code reference was checked against a clone at import. This batch's clone doesn't have the file, which isn't a change to the plan.
    const dir = await reimporting([{ ...who, item: { ...who.item, codeRefs: [{ path: 'src/jobs/reminders.ts', verified: true }] } }]);
    const before = await files(dir, ...pairFiles('questions-who'));
    const r = await send(dir, [{ ...same('who'), codeRefs: [{ path: 'src/jobs/reminders.ts' }], message: { text: 'Who should get them first?' } }]);
    expect(r).toEqual({ itemIds: ['questions-who'], importFinished: true });
    expect(await files(dir, ...pairFiles('questions-who'))).toEqual(before);
    expect((await readItems(dir)).values.map((i) => i.id)).toEqual(['questions-who']);
  });

  it('keeps what the importer leaves out: a key on its own changes nothing', async () => {
    const who = imported('who', { fields: { blocking: 'true' }, links: ['questions-when'] });
    const item = { ...who.item, body: 'Everyone, or only active subscribers?', mdAnchor: { heading: 'Approach' }, codeRefs: [{ path: 'src/jobs/reminders.ts', verified: true }] };
    const dir = await reimporting([{ ...who, item }, imported('when')]);
    const before = await files(dir, ...pairFiles('questions-who'), ...pairFiles('questions-when'));
    expect((await send(dir, [{ key: 'who' }, same('when')])).itemIds).toEqual(['questions-who', 'questions-when']);
    expect(await files(dir, ...pairFiles('questions-who'), ...pairFiles('questions-when'))).toEqual(before);
  });

  it('compares an anchor by its heading, and code references as a set', async () => {
    const who = imported('who');
    const refs = [{ path: 'src/jobs/reminders.ts', verified: true }, { path: 'src/db/schema.prisma', verified: false }];
    const dir = await reimporting([{ ...who, item: { ...who.item, mdAnchor: { heading: 'Approach', lines: [5, 7] }, codeRefs: refs } }]);
    const before = await files(dir, ...pairFiles('questions-who'));
    const r = await send(dir, [{ key: 'who', mdAnchor: { heading: 'Approach' }, codeRefs: [{ path: 'src/db/schema.prisma' }, { path: 'src/jobs/reminders.ts' }] }]);
    expect(r.itemIds).toEqual(['questions-who']);
    expect(await files(dir, ...pairFiles('questions-who'))).toEqual(before);
  });

  it('reads an empty field as no field, and links in any order as the same links', async () => {
    const who = imported('who', { fields: { blocking: 'true', default: '' }, links: ['questions-when', 'questions-why'] });
    const when = imported('when', { fields: { blocking: 'false' } });
    const dir = await reimporting([who, when, imported('why')]);
    const before = await files(dir, ...pairFiles('questions-who'), ...pairFiles('questions-when'));
    const r = await send(dir, [
      { key: 'who', fields: { blocking: 'true' }, links: ['questions-why', 'when'] },
      { key: 'when', fields: { blocking: 'false', default: '' } },
    ]);
    expect(r.itemIds).toEqual(['questions-who', 'questions-when']);
    expect(await files(dir, ...pairFiles('questions-who'), ...pairFiles('questions-when'))).toEqual(before);
  });

  it('a changed body with no data keeps the drawing, and flags the item', async () => {
    const map = drawn('architecture-map', 'architecture', reminderMap);
    const dir = await reimporting([{ ...map, item: { ...map.item, key: 'map', body: 'The job runs daily.' } }], { pending: ['architecture'] });
    await writeImportBatch({ dir, type: architecture, types: ALL, clone: '/x', now: T2, batch: { items: [{ key: 'map', title: 'Question architecture-map', summary: 'A summary.', body: 'The job runs hourly.' }] } });
    expect(await readItem(dir, 'architecture-map')).toMatchObject({
      body: 'The job runs hourly.',
      data: reminderMap,
      flags: [{ reason: "Changed in the plan's v2.", fromThreadId: 't-architecture-map', at: T2.toISOString() }],
    });
  });

  it('updates a changed item in place, flags it, and asks only on a thread that is idle or yours', async () => {
    const earlier = { reason: 'Might clash with the SMS answer.', fromThreadId: 't-questions-sms', at: AT };
    const anchor = { itemId: 'questions-parent', kind: 'node' as const, ref: 'job', label: 'Daily reminder job' };
    const resolved = imported('how', { status: 'resolved', messages: answered });
    const dir = await reimporting([
      imported('who', { status: 'idle', messages: [] }),
      imported('when'),
      { ...resolved, item: { ...resolved.item, anchor, flags: [earlier] } },
    ]);
    const question = { text: 'Email or SMS first?', options: [{ id: 'email', label: 'Email' }, { id: 'sms', label: 'SMS' }], recommended: 'email' };
    const r = await send(
      dir,
      ['who', 'when', 'how'].map((key) => ({ ...same(key), summary: 'Now about email and SMS.', message: question })),
    );
    expect(r.itemIds).toEqual(['questions-who', 'questions-when', 'questions-how']);
    const changed = (threadId: string) => ({ reason: "Changed in the plan's v2.", fromThreadId: threadId, at: T2.toISOString() });
    expect(await readItem(dir, 'questions-who')).toEqual({
      id: 'questions-who',
      key: 'who',
      type: 'questions',
      title: 'Question who',
      summary: 'Now about email and SMS.',
      threadId: 't-questions-who',
      createdBy: 'import',
      flags: [changed('t-questions-who')],
    });
    expect(await readItem(dir, 'questions-how')).toMatchObject({ summary: 'Now about email and SMS.', anchor, flags: [earlier, changed('t-questions-how')] });
    const line = { author: 'system', text: "Updated from the plan's v2." };
    const asked = { author: 'claude', text: 'Email or SMS first?', opening: true, recommended: 'email' };
    // Idle: the line, then the question, and it's your turn.
    const who = await readThread(dir, 't-questions-who');
    expect(who.status).toBe('your_turn');
    expect(who.messages).toMatchObject([line, asked]);
    // Waiting for you: the same, after what was there.
    const when = await readThread(dir, 't-questions-when');
    expect(when.status).toBe('your_turn');
    expect(when.messages).toMatchObject([{ id: 'm-questions-when' }, line, asked]);
    // Resolved: only the line. The thread stays resolved.
    const how = await readThread(dir, 't-questions-how');
    expect(how.status).toBe('resolved');
    expect(how.messages).toMatchObject([...answered.map((m) => ({ id: m.id })), line]);
    expect((await readItems(dir)).values).toHaveLength(3);
  });

  it('adds an item for a new key, as at import', async () => {
    const dir = await reimporting([imported('who')]);
    const r = await send(dir, [same('who'), { key: 'how-often', title: 'How often?', summary: 'Once, or until they reorder?', message: { text: 'Remind once?' } }]);
    expect(r.itemIds).toEqual(['questions-who', 'questions-how-often']);
    expect(await readItem(dir, 'questions-how-often')).toMatchObject({ key: 'how-often', createdBy: 'import', threadId: 't-questions-how-often' });
    expect((await readThread(dir, 't-questions-how-often')).status).toBe('your_turn');
  });

  it('a removed section parks its items, and they come back if it returns', async () => {
    const dir = await reimporting([
      imported('who'),
      imported('why', { status: 'idle', messages: [] }),
      imported('when', { status: 'resolved', messages: answered }),
      imported('how', { status: 'with_claude', messages: answered.slice(0, 2) }),
      imported('what'),
    ]);
    // The importer lists the keys whose part of the plan v2 took out.
    await send(dir, [same('what')], { removed: ['who', 'why', 'when', 'how'] });
    const removed = { author: 'system', text: 'Removed from the plan in v2.' };
    for (const [id, status] of [
      ['questions-who', 'parked'],
      ['questions-why', 'parked'],
      ['questions-when', 'parked'],
      ['questions-how', 'with_claude'],
    ]) {
      expect((await readItem(dir, id)).removedIn).toBe(2);
      const thread = await readThread(dir, `t-${id}`);
      expect(thread.status).toBe(status);
      expect(thread.messages.at(-1)).toMatchObject(removed);
    }
    // Claude is working on that one, so it's flagged instead of parked.
    expect((await readItem(dir, 'questions-how')).flags).toEqual([{ reason: 'Removed from the plan in v2.', fromThreadId: 't-questions-how', at: T2.toISOString() }]);
    expect((await readItem(dir, 'questions-what')).removedIn).toBeUndefined();
    expect((await readThread(dir, 't-questions-what')).status).toBe('your_turn');
    // Nothing is deleted.
    expect((await readItems(dir)).values.map((i) => i.id).sort()).toEqual(['questions-how', 'questions-what', 'questions-when', 'questions-who', 'questions-why']);

    // v3 brings who, why and when back, when with new content. how is still gone, and is left as it is.
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), status: 'importing', importPending: ['questions'], reimporting: { version: 3, from: 'active' } });
    const how = await files(dir, ...pairFiles('questions-how'));
    await send(dir, [same('who'), same('why'), { ...same('when'), summary: 'Back, and changed.' }, same('what')], { now: T3 });
    const back = { author: 'system', text: 'Back in the plan in v3.' };
    // Unparked: your turn when Claude spoke last, idle otherwise.
    const who = await readThread(dir, 't-questions-who');
    expect(who.status).toBe('your_turn');
    expect(who.messages).toMatchObject([{ id: 'm-questions-who' }, removed, back]);
    expect((await readItem(dir, 'questions-who')).removedIn).toBeUndefined();
    expect((await readThread(dir, 't-questions-why')).status).toBe('idle');
    const when = await readThread(dir, 't-questions-when');
    expect(when.status).toBe('your_turn');
    expect(when.messages.slice(-3)).toMatchObject([removed, back, { author: 'system', text: "Updated from the plan's v3." }]);
    const whenItem = await readItem(dir, 'questions-when');
    expect(whenItem.removedIn).toBeUndefined();
    expect(whenItem).toMatchObject({ summary: 'Back, and changed.', flags: [{ reason: "Changed in the plan's v3.", fromThreadId: 't-questions-when', at: T3.toISOString() }] });
    expect(await files(dir, ...pairFiles('questions-how'))).toEqual(how);
  });

  it('clears the reviewed mark on an item it flags as changed or removed, and keeps it on one it leaves alone', async () => {
    const marked = (key: string, o: Parameters<typeof pair>[1] = {}) => {
      const p = imported(key, o);
      return { ...p, item: { ...p.item, reviewedAt: AT } };
    };
    const dir = await reimporting([marked('who'), marked('when'), marked('how', { status: 'with_claude', messages: answered.slice(0, 2) }), marked('why')]);
    await send(dir, [same('who'), { ...same('when'), summary: 'Now about email and SMS.' }], { removed: ['how'] });
    const changed = await readItem(dir, 'questions-when');
    expect(changed.flags).toEqual([{ reason: "Changed in the plan's v2.", fromThreadId: 't-questions-when', at: T2.toISOString() }]);
    expect('reviewedAt' in changed).toBe(false);
    const removed = await readItem(dir, 'questions-how');
    expect(removed.flags).toEqual([{ reason: 'Removed from the plan in v2.', fromThreadId: 't-questions-how', at: T2.toISOString() }]);
    expect('reviewedAt' in removed).toBe(false);
    // The same content, or not mentioned: nothing changed, so the mark stays.
    expect((await readItem(dir, 'questions-who')).reviewedAt).toBe(AT);
    expect((await readItem(dir, 'questions-why')).reviewedAt).toBe(AT);
  });

  it('an item that comes back with an answer that still stands is resolved again', async () => {
    const decided = imported('who', { status: 'parked', messages: answered });
    const open = imported('when', { status: 'parked', messages: answered });
    const dir = await reimporting(
      [
        { ...decided, item: { ...decided.item, removedIn: 2 } },
        { ...open, item: { ...open.item, removedIn: 2 } },
      ],
      { version: 3 },
    );
    await addDecision(dir, { text: 'Active subscribers get reminders first.', threadId: 't-questions-who', itemIds: ['questions-who'] });
    await send(dir, [same('who'), same('when')], { now: T3 });
    const back = { author: 'system', text: 'Back in the plan in v3.' };
    // Its decision is still active, so the thread is resolved again, with the line.
    const who = await readThread(dir, 't-questions-who');
    expect(who.status).toBe('resolved');
    expect(who.messages).toMatchObject([...answered.map((m) => ({ id: m.id })), back]);
    expect((await readItem(dir, 'questions-who')).removedIn).toBeUndefined();
    // With no decision, it goes to whoever spoke last: Claude did, so it's your turn.
    expect((await readThread(dir, 't-questions-when')).status).toBe('your_turn');
  });

  it('a re-import keeps every answered thread', async () => {
    const followUp: Message = { id: 'm-3', at: AT, author: 'claude', text: 'And after launch?', options: [{ id: 'all', label: 'Everyone' }] };
    const dir = await reimporting([
      imported('who', { status: 'resolved', messages: answered }),
      imported('when', { status: 'your_turn', messages: [...answered.slice(0, 2), followUp] }),
      imported('how', { status: 'with_claude', messages: answered.slice(0, 2) }),
      imported('why', { status: 'resolved', messages: answered }),
    ]);
    await addDecision(dir, { text: 'Active subscribers get reminders first.', threadId: 't-questions-who', itemIds: ['questions-who'] });
    await addDecision(dir, { text: 'Remind before the item runs out.', threadId: 't-questions-why', itemIds: ['questions-why'] });
    const decisions = await files(dir, 'decisions.json');
    const before = (await readThreads(dir)).values;
    const why = await files(dir, ...pairFiles('questions-why'));
    // The draft now answers why, so the importer doesn't send it. It isn't removed: only `removed` removes.
    await send(dir, [
      { ...same('who'), summary: 'Everyone, or only some customers?', message: { text: 'Who should get them first?' } },
      same('when'),
      { ...same('how'), body: 'Now with SMS.' },
    ]);
    expect(await files(dir, ...pairFiles('questions-why'))).toEqual(why);
    expect(await files(dir, 'decisions.json')).toEqual(decisions);
    const after = (await readThreads(dir)).values;
    expect(after.map((t) => [t.id, t.itemId, t.status])).toEqual(before.map((t) => [t.id, t.itemId, t.status]));
    for (const [i, thread] of after.entries()) expect(thread.messages.slice(0, before[i].messages.length)).toEqual(before[i].messages);
    expect((await readItems(dir)).values.map((i) => [i.id, i.threadId, i.removedIn])).toEqual([
      ['questions-how', 't-questions-how', undefined],
      ['questions-when', 't-questions-when', undefined],
      ['questions-who', 't-questions-who', undefined],
      ['questions-why', 't-questions-why', undefined],
    ]);
  });

  it('removes only what the importer lists, and may send nothing else when a type left the plan', async () => {
    const dir = await reimporting([imported('who'), imported('when', { status: 'resolved', messages: answered }), imported('how')]);
    const how = await files(dir, ...pairFiles('questions-how'));
    expect(await send(dir, [], { removed: ['who', 'when'] })).toEqual({ itemIds: [], importFinished: true });
    for (const id of ['questions-who', 'questions-when']) {
      expect((await readItem(dir, id)).removedIn).toBe(2);
      expect((await readThread(dir, `t-${id}`)).status).toBe('parked');
    }
    expect(await files(dir, ...pairFiles('questions-how'))).toEqual(how);
  });

  it('checks the removed keys, and that a new key has a title and a summary, writing nothing until all is right', async () => {
    const dir = await reimporting([imported('who'), imported('when')], { pending: ['questions', 'architecture'] });
    const before = await files(dir, 'project.json', ...pairFiles('questions-who'), ...pairFiles('questions-when'));
    const attempt = send(dir, [same('who'), { key: 'how-often', summary: 'Once, or until they reorder?' }], { removed: ['who', 'nope'] });
    await expect(attempt).rejects.toThrow(InputError);
    const message = await attempt.catch((e: Error) => e.message);
    expect(message).toContain('Item 2 (how-often): A new item needs a title and a summary.');
    expect(message).toContain('removed: "who" is in items too. Send it in one or the other.');
    expect(message).toContain('removed: "nope" isn\'t the key of an item Questions imported before.');
    expect(await files(dir, 'project.json', ...pairFiles('questions-who'), ...pairFiles('questions-when'))).toEqual(before);
    // At a first import there's nothing to remove.
    const first = await importing();
    await expect(writeImportBatch({ dir: first, type: questions, types: TYPES, clone: '/x', batch: { removed: ['who'] } })).rejects.toThrow(/"who" isn't the key of an item Questions imported before/);
  });

  it('unparking an item removed from the plan brings it back, resolved when its answer still stands', async () => {
    const decided = imported('who', { status: 'parked', messages: answered });
    const open = imported('when', { status: 'parked', messages: answered });
    const dir = await seedProject({ pairs: [{ ...decided, item: { ...decided.item, removedIn: 2 } }, { ...open, item: { ...open.item, removedIn: 2 } }] });
    await addDecision(dir, { text: 'Active subscribers get reminders first.', threadId: 't-questions-who', itemIds: ['questions-who'] });
    expect((await setParked(dir, 't-questions-who', false)).status).toBe('resolved');
    expect((await readItem(dir, 'questions-who')).removedIn).toBeUndefined();
    expect((await setParked(dir, 't-questions-when', false)).status).toBe('your_turn');
    expect((await readItem(dir, 'questions-when')).removedIn).toBeUndefined();
    expect((await readThread(dir, 't-questions-when')).messages.at(-1)).toMatchObject({ author: 'system', text: 'Unparked.' });
  });

  it('never touches items you or Claude added', async () => {
    const mine = pair('questions-mine', { title: 'Mine' });
    const claudes = pair('questions-extra', { title: 'From Claude' });
    const dir = await reimporting([
      imported('who'),
      { ...mine, item: { ...mine.item, key: 'mine', createdBy: 'you' } },
      { ...claudes, item: { ...claudes.item, createdBy: 'claude' } },
    ]);
    const theirs = [...pairFiles('questions-mine'), ...pairFiles('questions-extra')];
    const before = await files(dir, ...theirs);
    // Only imported items are matched: a key that only your item has is a new item.
    const r = await send(dir, [same('who'), { key: 'mine', title: 'Mine', summary: 'From the plan this time.' }]);
    expect(r.itemIds).toEqual(['questions-who', 'questions-mine-2']);
    expect(await files(dir, ...theirs)).toEqual(before);
  });

  it('links to items it reuses by their ids', async () => {
    const dir = await reimporting([imported('who'), imported('when')]);
    await send(dir, [{ ...same('who'), links: ['when'] }, same('when'), { key: 'how', title: 'How?', summary: 'By email?', links: ['who', 'questions-when'] }]);
    expect((await readItem(dir, 'questions-who')).links).toEqual(['questions-when']);
    expect((await readItem(dir, 'questions-how')).links).toEqual(['questions-who', 'questions-when']);
  });

  it('a Phases batch lists reused items by their ids', async () => {
    const build = drawn('phases-build', 'phases', { order: 1, goal: 'The job sends reminders.', doneWhen: ['Runs in staging'], itemIds: ['architecture-map'] });
    const dir = await reimporting([drawn('architecture-map', 'architecture', reminderMap), { ...build, item: { ...build.item, key: 'build' } }], { pending: ['phases'] });
    const before = await files(dir, ...pairFiles('phases-build'));
    await writeImportBatch({
      dir,
      type: phases,
      types: ALL,
      clone: '/x',
      now: T2,
      batch: {
        items: [
          { key: 'build', title: 'Question phases-build', summary: 'A summary.', data: { order: 1, goal: 'The job sends reminders.', doneWhen: ['Runs in staging'], itemIds: ['architecture-map'] } },
          { key: 'launch', title: 'Launch', summary: 's', data: { order: 2, goal: 'Everyone gets reminders.', doneWhen: ['On for all customers'], itemIds: ['build', 'architecture-map'] } },
        ],
      },
    });
    expect(await files(dir, ...pairFiles('phases-build'))).toEqual(before);
    expect((await readItem(dir, 'phases-launch')).data).toMatchObject({ itemIds: ['phases-build', 'architecture-map'] });
  });

  it('"no changes" leaves the items alone, and is recorded only for a type with none', async () => {
    const dir = await reimporting([imported('who')], { pending: ['questions', 'architecture'] });
    const before = await files(dir, ...pairFiles('questions-who'));
    await writeImportBatch({ dir, type: questions, types: TYPES, clone: '/x', batch: { noChanges: 'Nothing changed for questions.' } });
    await writeImportBatch({ dir, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'Nothing structural changes.' } });
    expect(await files(dir, ...pairFiles('questions-who'))).toEqual(before);
    expect((await readThread(dir, 't-questions-who')).messages).toHaveLength(1);
    expect((await readProjectFile(dir)).emptyTypes).toEqual([{ type: 'architecture', reason: 'Nothing structural changes.' }]);
  });

  it('an items batch clears an earlier "no changes", at first import too', async () => {
    const emptyTypes = [
      { type: 'questions', reason: 'The plan leaves nothing open.' },
      { type: 'architecture', reason: 'Nothing structural changes.' },
    ];
    const dir = await seedProject({ project: { status: 'importing', importPending: ['questions'], emptyTypes } });
    await send(dir, [same('who')]);
    expect((await readProjectFile(dir)).emptyTypes).toEqual([emptyTypes[1]]);
  });

  it('finishing puts the project back to Finalized, or to Active', async () => {
    const finalized = await reimporting([imported('who')], { from: 'finalized' });
    expect((await send(finalized, [same('who')])).importFinished).toBe(true);
    const done = await readProjectFile(finalized);
    expect(done).toMatchObject({ status: 'finalized', importPending: [] });
    expect(done.reimporting).toBeUndefined();

    const active = await reimporting([imported('who')], { pending: ['questions', 'architecture'] });
    await send(active, [same('who')]);
    expect((await readProjectFile(active)).status).toBe('importing');
    await writeImportBatch({ dir: active, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'Nothing structural changes.' } });
    const back = await readProjectFile(active);
    expect(back).toMatchObject({ status: 'active', importPending: [] });
    expect(back.reimporting).toBeUndefined();
  });

  it('a question a re-import adds names the version it was raised in, and one at import does not', async () => {
    const dir = await reimporting([imported('who', { status: 'idle', messages: [] })]);
    await send(dir, [
      { ...same('who'), summary: 'Now about email and SMS.', message: { text: 'Email or SMS first?' } },
      { key: 'how-often', title: 'How often?', summary: 'Once, or until they reorder?', message: { text: 'Remind once?' } },
    ]);
    // A changed item's thread, and a new item's.
    expect((await readThread(dir, 't-questions-who')).messages.at(-1)).toMatchObject({ author: 'claude', text: 'Email or SMS first?', opening: true, raisedIn: 2 });
    expect((await readThread(dir, 't-questions-how-often')).messages).toMatchObject([{ author: 'claude', text: 'Remind once?', opening: true, raisedIn: 2 }]);

    const first = await seedProject({ project: { status: 'importing', importPending: ['questions'] } });
    await send(first, [{ key: 'who', title: 'Who first?', summary: 'Everyone?', message: { text: 'Everyone?' } }]);
    const [opening] = (await readThread(first, 't-questions-who')).messages;
    expect(opening).toMatchObject({ author: 'claude', opening: true });
    expect(opening).not.toHaveProperty('raisedIn');
  });

  it('a re-import ended early records the types whose batch never came, and one that finishes clears them', async () => {
    const dir = await reimporting([imported('who')], { pending: ['questions', 'architecture', 'concerns'] });
    await send(dir, [same('who')]);
    expect(await finishImport(dir)).toBe(true);
    // Architecture had items, so it isn't marked "didn't finish", but its batch never came either. The cut is counted.
    const ended = await readProjectFile(dir);
    expect(ended).toMatchObject({ status: 'active', importPending: [], importIncomplete: ['architecture', 'concerns'], importIncompleteTries: 1 });
    // It was an update's re-import, not a catch-up.
    expect(ended.importIncompleteCatchUp).toBeUndefined();

    // The types run again, and the last batch ends the import: nothing is left to finish.
    await writeProjectFile(dir, { ...ended, status: 'importing', importPending: ['architecture', 'concerns'], reimporting: { version: 2, from: 'active' } });
    await writeImportBatch({ dir, type: architecture, types: TYPES, clone: '/x', batch: { noChanges: 'Nothing structural changes.' } });
    expect((await readProjectFile(dir)).importIncomplete).toEqual(['architecture', 'concerns']);
    await writeImportBatch({ dir, type: TYPES.find((t) => t.id === 'concerns')!, types: TYPES, clone: '/x', batch: { noChanges: 'No new risks.' } });
    const done = await readProjectFile(dir);
    expect(done).toMatchObject({ status: 'active', importPending: [] });
    expect(done.importIncomplete).toBeUndefined();
    expect(done.importIncompleteTries).toBeUndefined();

    // A first import ended early records nothing: its types say "Didn't finish" on their own.
    const first = await seedProject({ project: { status: 'importing', importPending: ['architecture', 'questions'] } });
    await finishImport(first);
    expect((await readProjectFile(first)).importIncomplete).toBeUndefined();
  });

  it("finishing early marks only the types with no items as didn't finish", async () => {
    const dir = await reimporting([imported('who')], { from: 'finalized', pending: ['questions', 'architecture'] });
    expect(await finishImport(dir)).toBe(true);
    const project = await readProjectFile(dir);
    expect(project).toMatchObject({ status: 'finalized', importPending: [], emptyTypes: [{ type: 'architecture', reason: IMPORT_DID_NOT_FINISH }] });
    expect(project.reimporting).toBeUndefined();
    expect(await finishImport(dir)).toBe(false);
  });
});
