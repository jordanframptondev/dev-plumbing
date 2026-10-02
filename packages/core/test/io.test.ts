import fs from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { newId, readDecisions, readDocText, readItem, readSubmissions, StoreError, writeSubmission } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject } from './fixtures';

afterAll(removeTempDirs);

describe('project files', () => {
  it('makes ids that are file-safe and sort in creation order', () => {
    const now = new Date('2026-10-01T09:00:00Z');
    const ids = Array.from({ length: 5 }, () => newId('c', now));
    expect(ids.every((id) => /^c-\d{17}\d{4}-[0-9a-f]{4}$/.test(id))).toBe(true);
    expect([...ids].sort()).toEqual(ids);
  });

  it('reads items and says clearly when one is missing', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    expect((await readItem(dir, 'q1')).title).toBe('Question q1');
    await expect(readItem(dir, 'nope')).rejects.toThrow(StoreError);
    await expect(readItem(dir, 'nope')).rejects.toThrow(/doesn't exist/);
  });

  it('refuses document paths outside the project', async () => {
    const dir = await seedProject();
    expect(await readDocText(dir, 'docs/draft.md')).toMatch(/^# Restock reminders/);
    await expect(readDocText(dir, '../../outside.md')).rejects.toThrow(/outside the project/);
  });

  it('lists submissions oldest first and skips damaged files', async () => {
    const dir = await seedProject();
    await writeSubmission(dir, { id: 's-2', at: 'b', scope: 'all', drafts: {}, sent: [], resolved: [] });
    await writeSubmission(dir, { id: 's-1', at: 'a', scope: 'thread', drafts: {}, sent: [], resolved: [] });
    await fs.writeFile(`${dir}/submissions/s-3.json`, '{broken');
    expect((await readSubmissions(dir)).map((s) => s.id)).toEqual(['s-1', 's-2']);
  });

  it('reads a missing decisions file as empty, but reports a damaged one', async () => {
    const dir = await seedProject();
    expect(await readDecisions(dir)).toEqual([]);
    await fs.writeFile(`${dir}/decisions.json`, '{broken');
    await expect(readDecisions(dir)).rejects.toThrow(StoreError);
    await fs.writeFile(`${dir}/decisions.json`, '{"not":"a list"}');
    await expect(readDecisions(dir)).rejects.toThrow(/expected shape/);
  });
});
