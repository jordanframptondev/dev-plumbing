import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { applyPendingChange, recordChange, undoChange } from '../src/store/changes';
import { activeDecisions, addDecision } from '../src/store/decisions';
import { ConflictError, readDecisions, readHistory, readItem, writeHistoryEntry, writeItem } from '../src/store/io';
import { setReviewed } from '../src/store/reviewed';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject } from './fixtures';

afterAll(removeTempDirs);

const draftOf = (dir: string) => fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8');
const tableChange = { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a RestockReminder table, one row per send.' }] };

describe('recording changes', () => {
  it('applies a change to the draft and items, and keeps a history entry', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const entry = await recordChange(dir, {
      threadId: 't-q1',
      kind: 'accept',
      summary: 'Question q1: one row per send',
      change: { ...tableChange, items: [{ itemId: 'q1', patch: { summary: 'One row per send.', fields: { default: 'per send' } } }] },
      apply: true,
    });
    expect(await draftOf(dir)).toContain('RestockReminder table, one row per send.');
    expect(await readItem(dir, 'q1')).toMatchObject({ summary: 'One row per send.', fields: { default: 'per send' } });
    expect(entry.appliedAt).toBeDefined();
    expect(entry.itemsBefore.q1).toMatchObject({ summary: 'A summary.' });
    expect((await readHistory(dir)).map((h) => h.id)).toEqual([entry.id]);
  });

  it("refuses a change that doesn't fit, and writes nothing", async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const attempt = recordChange(dir, { threadId: 't-q1', kind: 'accept', summary: 's', change: { md: [{ find: 'Not there.', replace: 'x' }] }, apply: true });
    await expect(attempt).rejects.toThrow(ConflictError);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
  });

  it('records a pending small edit without applying it, then applies it on request', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const pending = await recordChange(dir, { threadId: 't-q1', kind: 'small-edit', summary: 'Wording', change: tableChange, apply: false });
    expect(pending.appliedAt).toBeUndefined();
    expect(await draftOf(dir)).toBe(DRAFT);
    const applied = await applyPendingChange(dir, pending.id);
    expect(applied.appliedAt).toBeDefined();
    expect(await draftOf(dir)).toContain('one row per send');
  });
  it('a write that fails part-way leaves the draft, items and history as they were', async () => {
    if (process.getuid?.() === 0) return;
    const dir = await seedProject({ pairs: [pair('q1')] });
    await fs.chmod(path.join(dir, 'items'), 0o500);
    try {
      const attempt = recordChange(dir, {
        threadId: 't-q1',
        kind: 'small-edit',
        summary: 's',
        change: { ...tableChange, items: [{ itemId: 'q1', patch: { title: 'Rows per send?' } }] },
        apply: true,
      });
      await expect(attempt).rejects.toThrow();
    } finally {
      await fs.chmod(path.join(dir, 'items'), 0o700);
    }
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
    expect((await readItem(dir, 'q1')).title).toBe('Question q1');
  });
});

describe('changes and the reviewed mark', () => {
  const MARKED = '2026-10-01T08:00:00.000Z';
  const marked = (id: string) => {
    const p = pair(id);
    return { ...p, item: { ...p.item, reviewedAt: MARKED } };
  };

  it("clears the mark on an item whose content a small edit or an accept changes, and keeps it when nothing changes", async () => {
    const dir = await seedProject({ pairs: [marked('q1'), marked('q2'), marked('q3'), marked('q4')] });
    const edit = await recordChange(dir, {
      threadId: 't-q1',
      kind: 'small-edit',
      summary: 's',
      // q2's patch gives it the title it already has: no change, so its mark stays.
      change: { items: [{ itemId: 'q1', patch: { title: 'New' } }, { itemId: 'q2', patch: { title: 'Question q2' } }] },
      apply: true,
    });
    const q1 = await readItem(dir, 'q1');
    expect(q1.title).toBe('New');
    expect('reviewedAt' in q1).toBe(false);
    expect((await readItem(dir, 'q2')).reviewedAt).toBe(MARKED);
    // An accept from another thread rewrites q3.
    await recordChange(dir, { threadId: 't-q4', kind: 'accept', summary: 's', change: { items: [{ itemId: 'q3', patch: { summary: 'Now about SMS too.' } }] }, apply: true });
    const q3 = await readItem(dir, 'q3');
    expect(q3.summary).toBe('Now about SMS too.');
    expect('reviewedAt' in q3).toBe(false);
    // A pending small edit clears it when it's applied, not before.
    const pending = await recordChange(dir, { threadId: 't-q1', kind: 'small-edit', summary: 's', change: { items: [{ itemId: 'q4', patch: { fields: { default: '3 days' } } }] }, apply: false });
    expect((await readItem(dir, 'q4')).reviewedAt).toBe(MARKED);
    await applyPendingChange(dir, pending.id);
    expect('reviewedAt' in (await readItem(dir, 'q4'))).toBe(false);

    // The first edit still undoes: q1 is back as it was, and stays unmarked, as the undo changed it again.
    await undoChange(dir, edit.id);
    const undone = await readItem(dir, 'q1');
    expect(undone.title).toBe('Question q1');
    expect('reviewedAt' in undone).toBe(false);
    expect((await readItem(dir, 'q2')).reviewedAt).toBe(MARKED);
  });
});

describe('undo', () => {
  it('undoes a small edit to the draft and to items', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const entry = await recordChange(dir, {
      threadId: 't-q1',
      kind: 'small-edit',
      summary: 'Fix wording',
      change: { ...tableChange, items: [{ itemId: 'q1', patch: { title: 'Rows per send?' } }] },
      apply: true,
    });
    const undone = await undoChange(dir, entry.id);
    expect(undone.undoneAt).toBeDefined();
    expect(await draftOf(dir)).toBe(DRAFT);
    expect((await readItem(dir, 'q1')).title).toBe('Question q1');
    await expect(undoChange(dir, entry.id)).rejects.toThrow(/isn't applied/);
  });

  it('only undoes small edits', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const entry = await recordChange(dir, { threadId: 't-q1', kind: 'accept', summary: 's', change: tableChange, apply: true });
    await expect(undoChange(dir, entry.id)).rejects.toThrow(/Only small edits/);
  });

  it('refuses when the draft or the item changed there since', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const edit = await recordChange(dir, { threadId: 't-q1', kind: 'small-edit', summary: 's', change: tableChange, apply: true });
    await recordChange(dir, { threadId: 't-q1', kind: 'accept', summary: 's', change: { md: [{ find: 'one row per send.', replace: 'one row per subscription.' }] }, apply: true });
    await expect(undoChange(dir, edit.id)).rejects.toThrow(/changed there since/);

    const itemEdit = await recordChange(dir, { threadId: 't-q1', kind: 'small-edit', summary: 's', change: { items: [{ itemId: 'q1', patch: { title: 'New' } }] }, apply: true });
    await writeItem(dir, { ...(await readItem(dir, 'q1')), title: 'Changed by hand' });
    await expect(undoChange(dir, itemEdit.id)).rejects.toThrow(/has changed since/);
  });

  it("isn't stopped by a reviewed mark set or cleared since, and keeps the mark as it is now", async () => {
    const dir = await seedProject({ pairs: [pair('q1'), pair('q2')] });
    const edit = await recordChange(dir, {
      threadId: 't-q1',
      kind: 'small-edit',
      summary: 's',
      change: { items: [{ itemId: 'q1', patch: { title: 'New' } }, { itemId: 'q2', patch: { title: 'Also new' } }] },
      apply: true,
    });
    await setReviewed(dir, 'q1', true, new Date('2026-10-01T09:00:00.000Z'));
    await setReviewed(dir, 'q2', true, new Date('2026-10-01T09:00:00.000Z'));
    await setReviewed(dir, 'q2', false);
    await undoChange(dir, edit.id);
    expect(await readItem(dir, 'q1')).toMatchObject({ title: 'Question q1', reviewedAt: '2026-10-01T09:00:00.000Z' });
    const q2 = await readItem(dir, 'q2');
    expect(q2.title).toBe('Question q2');
    expect('reviewedAt' in q2).toBe(false);
  });

  it('refuses, writing nothing, when the item kept in the history is damaged', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const edit = await recordChange(dir, { threadId: 't-q1', kind: 'small-edit', summary: 's', change: { items: [{ itemId: 'q1', patch: { title: 'New' } }] }, apply: true });
    await writeHistoryEntry(dir, { ...edit, itemsAfter: { q1: { id: 'q1', title: 'New' } } });
    await expect(undoChange(dir, edit.id)).rejects.toThrow(ConflictError);
    expect((await readItem(dir, 'q1')).title).toBe('New');
    // Not an object at all: refused the same way, not thrown.
    for (const damaged of [null, 'New', 7]) {
      await writeHistoryEntry(dir, { ...edit, itemsAfter: { q1: damaged } });
      const refused = await undoChange(dir, edit.id).then(() => null, (e: Error) => e);
      expect(refused).toBeInstanceOf(ConflictError);
      expect(refused?.message).toBe('"New" has changed since, so this can\'t be undone.');
      expect((await readItem(dir, 'q1')).title).toBe('New');
    }
  });
});

describe('decisions', () => {
  it("keeps every decision, and marks a thread's earlier one superseded", async () => {
    const dir = await seedProject();
    const first = await addDecision(dir, { text: 'Reminders go by SMS', threadId: 't-q2', itemIds: ['q2'] });
    await addDecision(dir, { text: 'Rows are kept for 180 days', threadId: 't-db1', itemIds: ['db1'] });
    const second = await addDecision(dir, { text: 'Reminders go by SMS and email', threadId: 't-q2', itemIds: ['q2'] });
    const all = await readDecisions(dir);
    expect(all).toHaveLength(3);
    expect(all.find((d) => d.id === first.id)?.supersededBy).toBe(second.id);
    expect(activeDecisions(all).map((d) => d.text)).toEqual(['Rows are kept for 180 days', 'Reminders go by SMS and email']);
  });
});
