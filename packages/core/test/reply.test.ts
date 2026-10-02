import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { InputError, projectFiles, readDecisions, readHistory, readItem, readItems, readThread, StoreError } from '../src/store/io';
import { postReply } from '../src/store/reply';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-01T10:00:00.000Z';
const asked = (id: string, extra: Parameters<typeof pair>[1] = {}) =>
  pair(id, { status: 'with_claude', messages: [{ id: `m-${id}`, at: AT, author: 'claude', text: 'Which one?' }, { id: `y-${id}`, at: AT, author: 'you', text: 'What would you do?' }], ...extra });
const draftOf = (dir: string) => fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8');
const reply = (dir: string, r: Parameters<typeof postReply>[1]['reply'], autoApply = true) => postReply(dir, { reply: r, types: TYPES, autoApply, clone: '/nowhere' });

describe('posting a reply', () => {
  it('adds the message with options and gives the thread back to you', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const r = await reply(dir, {
      threadId: 't-q1',
      text: 'One row per send keeps history for support.',
      options: [{ id: 'per-send', label: 'One row per send', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] } }, { id: 'per-sub', label: 'One row per subscription' }],
      recommended: 'per-send',
      filesRead: ['src/jobs/reminders.ts'],
    });
    const thread = await readThread(dir, 't-q1');
    expect(thread.status).toBe('your_turn');
    expect(thread.messages.at(-1)).toMatchObject({ id: r.messageId, author: 'claude', recommended: 'per-send', filesRead: ['src/jobs/reminders.ts'] });
    expect(await draftOf(dir)).toBe(DRAFT);
  });

  it('applies small edits straight away, and options are checked against the edited draft', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const r = await reply(dir, {
      threadId: 't-q1',
      text: 'Fixed a typo. Which retention?',
      smallEdits: [{ summary: 'Clearer wording in Data', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log each reminder in a table.' }] } }],
      options: [{ id: 'keep', label: 'Keep 180 days', change: { md: [{ find: 'Log each reminder in a table.', replace: 'Log each reminder in a table for 180 days.' }] } }],
    });
    expect(await draftOf(dir)).toContain('Log each reminder in a table.');
    expect(r.edits).toHaveLength(1);
    expect(r.edits[0]?.appliedAt).toBeDefined();
    expect((await readThread(dir, 't-q1')).messages.at(-1)).toMatchObject({ smallEdits: [{ changeId: r.edits[0]?.id, summary: 'Clearer wording in Data' }] });
  });

  it('keeps small edits pending when auto-apply is off', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const r = await reply(dir, { threadId: 't-q1', text: 'Tidied.', smallEdits: [{ summary: 'Wording', change: { md: [{ find: 'a table', replace: 'one table' }] } }] }, false);
    expect(r.edits[0]?.appliedAt).toBeUndefined();
    expect(await draftOf(dir)).toBe(DRAFT);
  });

  it('opens new threads and flags items it might affect', async () => {
    const dir = await seedProject({ pairs: [asked('q1'), pair('c1', { type: 'concerns' })] });
    const r = await reply(dir, {
      threadId: 't-q1',
      text: 'This raises a retention question.',
      newItems: [{ type: 'questions', title: 'Is 180 days enough for audits?', summary: 'Retention vs audits.', message: { text: 'Do audits need longer?' } }],
      impacts: [{ itemId: 'c1', reason: 'Retention changes the burst risk.' }],
    });
    expect(r.newThreadIds).toEqual(['t-questions-is-180-days-enough-for-audits']);
    expect(await readItem(dir, 'questions-is-180-days-enough-for-audits')).toMatchObject({ createdBy: 'claude', links: ['q1'] });
    expect((await readThread(dir, 't-questions-is-180-days-enough-for-audits')).status).toBe('your_turn');
    expect((await readItem(dir, 'c1')).flags).toEqual([{ reason: 'Retention changes the burst risk.', fromThreadId: 't-q1', at: expect.any(String) }]);
  });

  it('resolves the thread with a decision', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    await reply(dir, { threadId: 't-q1', text: 'Settled.', resolve: { decision: 'Reminders go by SMS and email' } });
    expect((await readThread(dir, 't-q1')).status).toBe('resolved');
    expect((await readThread(dir, 't-q1')).messages.at(-1)).toMatchObject({ resolved: true });
    expect(await readDecisions(dir)).toEqual([expect.objectContaining({ text: 'Reminders go by SMS and email', threadId: 't-q1', itemIds: ['q1'] })]);
  });

  it('a bad reply writes nothing and lists every problem', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const attempt = reply(dir, {
      threadId: 't-q1',
      text: 'x',
      options: [{ id: 'a', label: 'A', change: { md: [{ find: 'Nowhere in the draft', replace: 'y' }] } }],
      recommended: 'b',
      resolve: { decision: 'Both' },
      smallEdits: [{ summary: 'Delete', change: { md: [{ find: 'Log reminders in a table.', replace: '' }] } }],
      newItems: [{ type: 'nope', title: 'T', summary: 's', message: { text: 'm' } }],
      impacts: [{ itemId: 'ghost', reason: 'r' }],
    });
    await expect(attempt).rejects.toThrow(InputError);
    const message = await attempt.catch((e: Error) => e.message);
    for (const bit of [/options or resolve/, /recommended is "b"/, /isn't in the draft/, /can't delete text outright/, /"nope" isn't an enabled plumbing type/, /no item "ghost"/]) {
      expect(message).toMatch(bit);
    }
    expect((await readThread(dir, 't-q1')).messages).toHaveLength(2);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
  });

  it("refuses threads that aren't waiting for Claude", async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    await expect(reply(dir, { threadId: 't-q1', text: 'x' })).rejects.toThrow(/isn't waiting for Claude/);
    await expect(reply(dir, { threadId: 't-ghost', text: 'x' })).rejects.toThrow(/no thread "t-ghost"/);
  });
});

describe('a reply is all or nothing', () => {
  const smallEdit = { summary: 'Wording', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log each reminder in a table.' }] } };
  const newItem = { type: 'questions', title: 'Is 180 days enough?', summary: 's', message: { text: 'm' } };

  it('a valid small edit next to a bad option writes nothing', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const before = (await readItems(dir)).values.map((i) => i.id).sort();
    const attempt = reply(dir, {
      threadId: 't-q1',
      text: 'x',
      smallEdits: [smallEdit],
      newItems: [newItem],
      options: [{ id: 'a', label: 'A', change: { md: [{ find: 'Nowhere in the draft', replace: 'y' }] } }],
    });
    await expect(attempt).rejects.toThrow(InputError);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
    expect((await readItems(dir)).values.map((i) => i.id).sort()).toEqual(before);
    expect((await readThread(dir, 't-q1')).messages).toHaveLength(2);
  });

  it('a damaged decisions.json stops a resolving reply before anything is written', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    await fs.writeFile(projectFiles(dir).decisions, '{broken');
    const before = (await readItems(dir)).values.map((i) => i.id).sort();
    await expect(reply(dir, { threadId: 't-q1', text: 'Done.', smallEdits: [smallEdit], newItems: [newItem], resolve: { decision: 'Go' } })).rejects.toThrow(StoreError);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
    expect((await readItems(dir)).values.map((i) => i.id).sort()).toEqual(before);
    expect((await readThread(dir, 't-q1')).status).toBe('with_claude');
  });
});
