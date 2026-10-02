import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readDecisions, readItem, readSubmissions, readThread, writeItem } from '../src/store/io';
import { submit } from '../src/store/submit';
import { addOwnItem, latestOpen, saveDraft, setParked } from '../src/store/threads';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-01T10:00:00.000Z';
const perSend = { id: 'per-send', label: 'One row per send', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] } };
const perSub = { id: 'per-sub', label: 'One row per subscription' };
const options = [perSend, perSub];
const draftOf = (dir: string) => fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8');
const lastOf = async (dir: string, id: string) => (await readThread(dir, id)).messages.at(-1);

describe('drafts and parking', () => {
  it('saves and clears a draft', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options })] });
    expect((await saveDraft(dir, 't-q1', { optionId: 'per-send', note: '  keep it short ' })).draft).toMatchObject({ optionId: 'per-send', note: 'keep it short' });
    expect((await saveDraft(dir, 't-q1', { note: '' })).draft).toBeUndefined();
  });

  it("won't take a draft while Claude is working on the thread", async () => {
    const dir = await seedProject({ pairs: [pair('q1', { status: 'with_claude' })] });
    await expect(saveDraft(dir, 't-q1', { text: 'x' })).rejects.toThrow(/Claude is working on this thread/);
  });

  it('parks and unparks', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options })] });
    expect((await setParked(dir, 't-q1', true)).status).toBe('parked');
    expect((await setParked(dir, 't-q1', false)).status).toBe('your_turn');
    expect((await readThread(dir, 't-q1')).messages.map((m) => m.text)).toEqual(['Which one?', 'Parked.', 'Unparked.']);
  });

  it("won't park a resolved thread", async () => {
    const dir = await seedProject({ pairs: [pair('q1', { status: 'resolved', options })] });
    await expect(setParked(dir, 't-q1', true)).rejects.toThrow(/nothing to park/);
  });

  it('finds the options you can answer now, skipping system lines', async () => {
    const { thread } = pair('q1', { options });
    thread.messages.push({ id: 's', at: AT, author: 'system', text: 'Might conflict with another answer.' });
    expect(latestOpen(thread)?.options.map((o) => o.id)).toEqual(['per-send', 'per-sub']);
    thread.messages.push({ id: 'y', at: AT, author: 'you', optionId: 'per-sub' });
    expect(latestOpen(thread)).toBeNull();
  });

  it('adds your own item with your message as its draft', async () => {
    const dir = await seedProject();
    const questions = TYPES.find((t) => t.id === 'questions')!;
    const { item, thread } = await addOwnItem(dir, { type: questions, title: 'Do we need an opt-out link?', text: 'Every reminder email needs one, right?', fields: { blocking: 'false' } });
    expect(item).toMatchObject({ id: 'questions-do-we-need-an-opt-out-link', createdBy: 'you', fields: { blocking: 'false' } });
    expect(thread).toMatchObject({ status: 'idle', draft: { text: 'Every reminder email needs one, right?' }, messages: [] });
    await expect(addOwnItem(dir, { type: questions, title: 'x', text: 'y', fields: { severity: 'high' } })).rejects.toThrow(/isn't a field/);
  });
});

describe('submit', () => {
  it('applies a plain accept and resolves the thread without Claude', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Rows per send?', options, draft: { optionId: 'per-send', updatedAt: AT } })] });
    const r = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
    expect(r).toMatchObject({ resolved: ['t-q1'], sent: [], skipped: [] });
    expect(await draftOf(dir)).toContain('Log one row per send.');
    const thread = await readThread(dir, 't-q1');
    expect(thread.status).toBe('resolved');
    expect(thread.draft).toBeUndefined();
    expect(thread.messages.find((m) => m.author === 'you')).toMatchObject({ optionId: 'per-send', optionLabel: 'One row per send', sentWith: 'thread' });
    expect((await readDecisions(dir)).map((d) => d.text)).toEqual(['Rows per send?: One row per send']);
  });

  it('applies an accept with a note, and sends the note to Claude', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options, draft: { optionId: 'per-send', note: 'Delete rows after 180 days.', updatedAt: AT } })] });
    const r = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
    expect(r).toMatchObject({ resolved: [], sent: ['t-q1'] });
    expect(await draftOf(dir)).toContain('Log one row per send.');
    expect((await readThread(dir, 't-q1')).status).toBe('with_claude');
    expect(await lastOf(dir, 't-q1')).toMatchObject({ author: 'you', note: 'Delete rows after 180 days.' });
    expect(await readDecisions(dir)).toEqual([]);
  });

  it('sends options without a change, presets, Custom and free text to Claude', async () => {
    const dir = await seedProject({
      pairs: [
        pair('q1', { options, draft: { optionId: 'per-sub', updatedAt: AT } }),
        pair('c1', { type: 'concerns', draft: { optionId: 'preset:1', note: 'Low volume anyway.', updatedAt: AT } }),
        pair('q2', { options, draft: { optionId: 'custom', text: 'Ask support first.', updatedAt: AT } }),
        pair('q3', { draft: { text: 'Both channels.', updatedAt: AT } }),
      ],
    });
    const r = await submit(dir, { scope: 'all', types: TYPES });
    expect([...r.sent].sort()).toEqual(['t-c1', 't-q1', 't-q2', 't-q3']);
    expect(await lastOf(dir, 't-c1')).toMatchObject({ optionId: 'preset:1', optionLabel: 'Accept the risk', note: 'Low volume anyway.', sentWith: 'all' });
    expect(await lastOf(dir, 't-q2')).toMatchObject({ optionId: 'custom', text: 'Ask support first.' });
    expect(await lastOf(dir, 't-q3')).toMatchObject({ text: 'Both channels.' });
  });

  it('a change that no longer fits goes to Claude instead', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options, draft: { optionId: 'per-send', updatedAt: AT } })] });
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), '# Restock reminders\n\nThe data section was rewritten by hand.\n');
    const r = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
    expect(r.sent).toEqual(['t-q1']);
    expect(await draftOf(dir)).toBe('# Restock reminders\n\nThe data section was rewritten by hand.\n');
    expect((await readThread(dir, 't-q1')).status).toBe('with_claude');
    expect((await lastOf(dir, 't-q1'))?.text).toMatch(/no longer fits the draft/);
  });

  it('skips what it should, keeping those drafts', async () => {
    const dir = await seedProject({
      pairs: [
        pair('q1', { options, draft: { optionId: 'gone', updatedAt: AT } }),
        pair('q2', { status: 'parked', draft: { text: 'Later.', updatedAt: AT } }),
        pair('q3', { options }),
      ],
    });
    const r = await submit(dir, { scope: 'all', types: TYPES });
    expect(r.sent).toEqual([]);
    expect(r.skipped).toEqual([
      { threadId: 't-q1', reason: "That option isn't available any more. Pick another." },
      { threadId: 't-q2', reason: 'This thread is parked.' },
    ]);
    expect((await readThread(dir, 't-q1')).draft?.optionId).toBe('gone');
  });

  it('writes the submission, with a copy of every draft, before Claude sees it', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { draft: { text: 'Both.', updatedAt: AT } })] });
    const r = await submit(dir, { scope: 'all', types: TYPES });
    const [saved] = await readSubmissions(dir);
    expect(saved).toMatchObject({ id: r.submission.id, scope: 'all', drafts: { 't-q1': { text: 'Both.' } }, sent: ['t-q1'], resolved: [] });
    expect(saved?.processedAt).toBeDefined();
    expect(saved?.pickedUpAt).toBeUndefined();
  });

  it('clears "may need another look" on the item when you send', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { draft: { text: 'Fine.', updatedAt: AT } })] });
    await writeItem(dir, { ...(await readItem(dir, 'q1')), flags: [{ reason: 'Retention changed.', fromThreadId: 't-db1', at: AT }] });
    await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
    expect((await readItem(dir, 'q1')).flags).toBeUndefined();
  });

  it('records the submission first and carries on when a thread fails to save', async () => {
    if (process.getuid?.() === 0) return;
    const dir = await seedProject({ pairs: [pair('q1', { draft: { text: 'Both.', updatedAt: AT } })] });
    const threadsDir = path.join(dir, 'threads');
    await fs.chmod(threadsDir, 0o500);
    try {
      const r = await submit(dir, { scope: 'all', types: TYPES });
      expect(r.skipped).toContainEqual({ threadId: 't-q1', reason: expect.stringMatching(/Couldn't send/) });
      expect(r.sent).toEqual([]);
      const [saved] = await readSubmissions(dir);
      expect(saved).toMatchObject({ drafts: { 't-q1': { text: 'Both.' } } });
      expect(saved?.processedAt).toBeDefined();
    } finally {
      await fs.chmod(threadsDir, 0o700);
    }
  });
});
