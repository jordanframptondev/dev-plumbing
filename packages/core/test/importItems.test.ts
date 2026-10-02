import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { finishImport, verifyCodeRefs, writeImportBatch } from '../src/store/importItems';
import { InputError, readItem, readItems, readProjectFile, readThread } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { makeRepo, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const questions = TYPES.find((t) => t.id === 'questions')!;
const architecture = TYPES.find((t) => t.id === 'architecture')!;
const importing = () => seedProject({ project: { status: 'importing', importPending: ['architecture', 'questions'] } });

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
    await writeImportBatch({ dir, type: questions, clone: '/x', batch: { noChanges: 'The plan leaves nothing open.' } });
    const r = await writeImportBatch({ dir, type: architecture, clone: '/x', batch: { noChanges: 'Nothing structural changes.' } });
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
    await writeImportBatch({ dir, type: questions, clone: '/x', batch: { noChanges: 'None.' } });
    await expect(writeImportBatch({ dir, type: questions, clone: '/x', batch: { noChanges: 'Again.' } })).rejects.toThrow(/already been imported/);
    await expect(writeImportBatch({ dir, type: architecture, clone: '/x', batch: {} })).rejects.toThrow(/either items/);
    await expect(
      writeImportBatch({ dir, type: architecture, clone: '/x', batch: { noChanges: 'x', items: [{ key: 'k', title: 't', summary: 's' }] } }),
    ).rejects.toThrow(/either items/);
  });

  it("marks types whose importer didn't finish", async () => {
    const dir = await importing();
    await writeImportBatch({ dir, type: questions, clone: '/x', batch: { noChanges: 'None.' } });
    expect(await finishImport(dir)).toBe(true);
    const p = await readProjectFile(dir);
    expect(p).toMatchObject({ status: 'active', importPending: [] });
    expect(p.emptyTypes.find((e) => e.type === 'architecture')?.reason).toMatch(/didn't finish/);
    expect(await finishImport(dir)).toBe(false);
  });

  it('keeps new item ids clear of existing ones', async () => {
    const dir = await seedProject({ pairs: [pair('questions-who')], project: { status: 'importing', importPending: ['questions'] } });
    const r = await writeImportBatch({ dir, type: questions, clone: '/x', batch: { items: [{ key: 'who', title: 'Who?', summary: 's' }] } });
    expect(r.itemIds).toEqual(['questions-who-2']);
  });
});
