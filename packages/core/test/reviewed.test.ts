import fs from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { InputError, projectFiles, readItem, StoreError } from '../src/store/io';
import { markReviewed, setReviewed } from '../src/store/reviewed';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject } from './fixtures';

afterAll(removeTempDirs);

const T1 = new Date('2026-10-04T09:00:00.000Z');
const T2 = new Date('2026-10-04T10:00:00.000Z');
const mtime = async (dir: string, id: string) => (await fs.stat(projectFiles(dir).item(id))).mtimeMs;
/** The error a promise rejects with, as its class and message, or null if it resolves. */
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: Error) => ({ type: e.constructor, message: e.message }));

describe('the reviewed mark', () => {
  it('is set and cleared, and only written when it changes', async () => {
    const dir = await seedProject({ pairs: [pair('q1'), pair('q2')] });
    await setReviewed(dir, 'q1', true, T1);
    expect((await readItem(dir, 'q1')).reviewedAt).toBe(T1.toISOString());
    // Marking it again keeps the first time, and doesn't touch the file.
    const before = await mtime(dir, 'q1');
    await new Promise((r) => setTimeout(r, 20));
    await setReviewed(dir, 'q1', true, T2);
    expect((await readItem(dir, 'q1')).reviewedAt).toBe(T1.toISOString());
    expect(await mtime(dir, 'q1')).toBe(before);

    await setReviewed(dir, 'q1', false, T2);
    const cleared = await readItem(dir, 'q1');
    expect(cleared.reviewedAt).toBeUndefined();
    expect('reviewedAt' in cleared).toBe(false);
    // Clearing a mark that isn't there writes nothing.
    const q2 = await mtime(dir, 'q2');
    await new Promise((r) => setTimeout(r, 20));
    await setReviewed(dir, 'q2', false, T2);
    expect(await mtime(dir, 'q2')).toBe(q2);
  });

  it('leaves everything else about the item as it was', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { fields: { blocking: 'false' }, links: ['q2'] }), pair('q2')] });
    const before = await readItem(dir, 'q1');
    await setReviewed(dir, 'q1', true, T1);
    expect(await readItem(dir, 'q1')).toEqual({ ...before, reviewedAt: T1.toISOString() });
  });

  it("refuses an item that doesn't exist", async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    expect(await refusal(setReviewed(dir, 'ghost', true, T1))).toEqual({ type: StoreError, message: "Item ghost doesn't exist." });
  });

  it('marks several at once, counting the ones it newly marked', async () => {
    const dir = await seedProject({ pairs: [pair('q1'), pair('q2'), pair('q3')] });
    await setReviewed(dir, 'q2', true, T1);
    expect(await markReviewed(dir, ['q1', 'q2', 'q1'], T2)).toEqual({ marked: 1 });
    expect((await readItem(dir, 'q1')).reviewedAt).toBe(T2.toISOString());
    expect((await readItem(dir, 'q2')).reviewedAt).toBe(T1.toISOString());
    expect((await readItem(dir, 'q3')).reviewedAt).toBeUndefined();
  });

  it('refuses unknown ids, naming each, and marks nothing', async () => {
    const dir = await seedProject({ pairs: [pair('q1'), pair('q2')] });
    const r = await refusal(markReviewed(dir, ['q1', 'ghost', 'q2', 'nope'], T1));
    expect(r?.type).toBe(InputError);
    expect(r?.message).toBe('There\'s no item "ghost" or "nope". Nothing was marked.');
    expect((await readItem(dir, 'q1')).reviewedAt).toBeUndefined();
    expect((await readItem(dir, 'q2')).reviewedAt).toBeUndefined();
    expect((await refusal(markReviewed(dir, ['ghost'], T1)))?.message).toBe('There\'s no item "ghost". Nothing was marked.');
  });
});
