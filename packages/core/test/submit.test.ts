import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { addDecision } from '../src/store/decisions';
import { readDecisions, readHistory, readItem, readSubmissions, readThread, writeItem } from '../src/store/io';
import { finishSubmission, pickUp } from '../src/store/queue';
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

  it('parks a resolved thread whose item an update took out of the plan, so it stays out of the final', async () => {
    const p = pair('q1', { status: 'resolved', options });
    const dir = await seedProject({ pairs: [{ ...p, item: { ...p.item, removedIn: 2 } }] });
    expect((await setParked(dir, 't-q1', true)).status).toBe('parked');
    expect(await lastOf(dir, 't-q1')).toMatchObject({ author: 'system', text: 'Parked.' });
    expect((await readItem(dir, 'q1')).removedIn).toBe(2);
  });

  it('a plain unpark goes back to whoever spoke last, even on a thread that was resolved before', async () => {
    // A resolved thread can carry on, and its decision stays active: only an item coming back into the plan is resolved again.
    const dir = await seedProject({ pairs: [pair('q1', { options })] });
    await addDecision(dir, { text: 'One row per send.', threadId: 't-q1', itemIds: ['q1'] });
    await setParked(dir, 't-q1', true);
    expect((await setParked(dir, 't-q1', false)).status).toBe('your_turn');
  });

  it('finds the options you can answer now, skipping system lines', async () => {
    const { thread } = pair('q1', { options });
    thread.messages.push({ id: 's', at: AT, author: 'system', text: 'Might conflict with another answer.' });
    expect(latestOpen(thread)?.options.map((o) => o.id)).toEqual(['per-send', 'per-sub']);
    thread.messages.push({ id: 'y', at: AT, author: 'you', optionId: 'per-sub' });
    thread.status = 'with_claude';
    expect(latestOpen(thread)).toBeNull();
  });

  it("keeps Claude's options open until a later Claude message replaces them, or the thread is resolved", async () => {
    const { thread } = pair('q1', { options });
    thread.messages.push({ id: 'y', at: AT, author: 'you', optionId: 'per-sub' }, { id: 's', at: AT, author: 'system', text: "Claude didn't get to this one." });
    expect(latestOpen(thread)?.options.map((o) => o.id)).toEqual(['per-send', 'per-sub']);
    expect(latestOpen({ ...thread, status: 'resolved' })).toBeNull();
    thread.messages.push({ id: 'c', at: AT, author: 'claude', text: 'Noted. Anything else?' });
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

  it('accepting an option whose change is empty settles the thread, as Keep my draft does on a Plan changes thread', async () => {
    const keep = { id: 'keep', label: 'Keep my draft', change: { md: [] } };
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Data', options: [perSend, keep], draft: { optionId: 'keep', updatedAt: AT } })] });
    const before = await draftOf(dir);
    const r = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
    expect(r).toMatchObject({ resolved: ['t-q1'], sent: [], skipped: [] });
    expect(await draftOf(dir)).toBe(before);
    const thread = await readThread(dir, 't-q1');
    expect(thread.status).toBe('resolved');
    expect(thread.messages.at(-1)).toMatchObject({ author: 'system', text: 'Applied and resolved.' });
    expect((await readDecisions(dir)).map((d) => d.text)).toEqual(['Data: Keep my draft']);
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

  describe("an option answer Claude didn't get to", () => {
    /** Sends the answer, then the window finishes the submission without replying, so it comes back as a draft. */
    async function returned(draft: { optionId: string; note?: string }) {
      const dir = await seedProject({ pairs: [pair('q1', { title: 'Rows per send?', options, draft: { ...draft, updatedAt: AT } })] });
      const first = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
      expect(first.sent).toEqual(['t-q1']);
      await pickUp(dir, first.submission.id, 'w-a');
      expect(await finishSubmission(dir, first.submission.id, [])).toEqual({ returned: ['t-q1'] });
      expect((await readThread(dir, 't-q1')).draft).toMatchObject(draft);
      return dir;
    }
    const accepts = async (dir: string) => (await readHistory(dir)).filter((h) => h.kind === 'accept' && h.appliedAt);

    for (const note of [undefined, 'Keep it simple.']) {
      it(`sends again: an option with no change, ${note ? 'with' : 'without'} a note`, async () => {
        const dir = await returned({ optionId: 'per-sub', ...(note ? { note } : {}) });
        const again = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
        expect(again).toMatchObject({ sent: ['t-q1'], resolved: [], skipped: [] });
        expect(await lastOf(dir, 't-q1')).toMatchObject({ author: 'you', optionId: 'per-sub', optionLabel: 'One row per subscription', ...(note ? { note } : {}) });
        expect((await readThread(dir, 't-q1')).status).toBe('with_claude');
      });
    }

    it('sends again: an option with a change and a note, applying the change only once', async () => {
      const dir = await returned({ optionId: 'per-send', note: 'Delete rows after 180 days.' });
      expect(await accepts(dir)).toHaveLength(1);
      const again = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
      expect(again).toMatchObject({ sent: ['t-q1'], resolved: [], skipped: [] });
      const thread = await readThread(dir, 't-q1');
      expect(thread.status).toBe('with_claude');
      expect(thread.messages.at(-1)).toMatchObject({ author: 'you', optionId: 'per-send', note: 'Delete rows after 180 days.' });
      expect(thread.messages.some((m) => /no longer fits/.test(m.text ?? ''))).toBe(false);
      expect(await accepts(dir)).toHaveLength(1);
      expect((await draftOf(dir)).match(/Log one row per send\./g)).toHaveLength(1);
    });

    it('the same option sent again without its note resolves the thread, still applied only once', async () => {
      const dir = await returned({ optionId: 'per-send', note: 'Delete rows after 180 days.' });
      await saveDraft(dir, 't-q1', { optionId: 'per-send' });
      const again = await submit(dir, { scope: 'thread', threadId: 't-q1', types: TYPES });
      expect(again).toMatchObject({ resolved: ['t-q1'], sent: [], skipped: [] });
      expect(await lastOf(dir, 't-q1')).toMatchObject({ author: 'system', text: 'Applied and resolved.' });
      expect(await accepts(dir)).toHaveLength(1);
      expect((await readDecisions(dir)).map((d) => d.text)).toEqual(['Rows per send?: One row per send']);
    });
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
