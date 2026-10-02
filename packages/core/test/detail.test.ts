import { afterAll, describe, expect, it } from 'vitest';
import { loadChanges, loadThreadDetail, NO_WINDOW, submitMessage } from '../src/store/detail';
import { recordChange } from '../src/store/changes';
import { addDecision } from '../src/store/decisions';
import { loadTypeItems } from '../src/store/projects';
import { readThread, writeThread } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const options = [
  { id: 'per-send', label: 'One row per send', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] } },
  { id: 'per-sub', label: 'One row per subscription' },
];

describe('thread detail', () => {
  it('has the open options, a preview of each change, links, decisions and small edits', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options, recommended: 'per-send', links: ['c1'], title: 'Rows?' }), pair('c1', { type: 'concerns', title: 'Burst of sends' })] });
    const edit = await recordChange(dir, { threadId: 't-q1', kind: 'small-edit', summary: 'Typo', change: { md: [{ find: 'A daily job', replace: 'One daily job' }] }, apply: true });
    const thread = await readThread(dir, 't-q1');
    await writeThread(dir, { ...thread, messages: [...thread.messages, { id: 'm2', at: 'now', author: 'claude', text: 'Also fixed a typo.', options, smallEdits: [{ changeId: edit.id, summary: 'Typo' }], impacts: [{ itemId: 'c1', reason: 'More rows.' }] }] });
    await addDecision(dir, { text: 'Rows are kept 180 days', threadId: 't-c1', itemIds: ['q1'] });

    const d = await loadThreadDetail({ dir, threadId: 't-q1', types: TYPES });
    expect(d.thread.display).toBe('your_turn');
    expect(d.type).toMatchObject({ id: 'questions', title: 'Questions', screen: 'list', fields: ['blocking', 'default'] });
    expect(d.open?.options.map((o) => o.id)).toEqual(['per-send', 'per-sub']);
    expect(d.previews['per-send']?.md?.some((s) => s.kind === 'added' && s.text.includes('Log one row per send.'))).toBe(true);
    expect(d.previews['per-sub']).toBeUndefined();
    expect(d.linked).toEqual([{ itemId: 'c1', threadId: 't-c1', title: 'Burst of sends', typeTitle: 'Concerns' }]);
    expect(d.refs.c1).toEqual({ title: 'Burst of sends', threadId: 't-c1', typeTitle: 'Concerns' });
    expect(d.edits[edit.id]).toEqual({ state: 'applied', summary: 'Typo' });
    expect(d.decisions.map((x) => x.text)).toEqual(['Rows are kept 180 days']);
  });

  it("explains what Submit did, depending on whether a window is listening", () => {
    expect(submitMessage({ resolved: 0, sent: 2, skipped: [] }, null)).toBe(NO_WINDOW);
    expect(submitMessage({ resolved: 0, sent: 2, skipped: [] }, 'waiting')).toBe('Sent to Claude.');
    expect(submitMessage({ resolved: 0, sent: 1, skipped: [] }, 'busy')).toBe('Saved. Claude is finishing earlier threads and will pick this up next.');
    expect(submitMessage({ resolved: 2, sent: 0, skipped: [] }, null)).toBe('Applied. 2 threads resolved.');
    expect(submitMessage({ resolved: 1, sent: 1, skipped: [] }, 'waiting')).toBe('Applied. 1 thread resolved. Sent to Claude.');
    expect(submitMessage({ resolved: 0, sent: 0, skipped: [{ reason: 'This thread is parked.' }] }, null)).toBe('This thread is parked.');
    expect(submitMessage({ resolved: 0, sent: 0, skipped: [] }, null)).toBe('Nothing to send yet.');
  });

  it('lists the Draft changes newest first, with thread titles', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { title: 'Rows?' })] });
    await recordChange(dir, { threadId: 't-q1', kind: 'accept', summary: 'Rows?: per send', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] }, apply: true });
    const c = await loadChanges(dir);
    expect(c.entries).toEqual([expect.objectContaining({ kind: 'accept', state: 'applied', threadId: 't-q1', threadTitle: 'Rows?' })]);
    expect(c.segments.find((s) => s.kind === 'added')?.changedBy?.[0]?.threadTitle).toBe('Rows?');
  });

  it('gives list rows what inline answering needs', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { options, fields: { blocking: 'true', default: 'One row per send' }, draft: { optionId: 'per-sub', updatedAt: 'now' } }), pair('q2', { status: 'resolved' })] });
    await addDecision(dir, { text: 'Both channels', threadId: 't-q2', itemIds: ['q2'] });
    const r = await loadTypeItems({ repo: 'acme', id: 'restock', dir }, TYPES, 'questions');
    expect(r?.type).toMatchObject({ fields: ['blocking', 'default'], addLabel: 'Question' });
    const q1 = r?.items.find((i) => i.id === 'q1');
    expect(q1).toMatchObject({ threadId: 't-q1', status: 'draft', blocking: true, fields: { default: 'One row per send' }, messageCount: 1, draft: { optionId: 'per-sub' }, decision: null, flagged: false });
    expect(q1?.open?.options).toHaveLength(2);
    expect(r?.items.find((i) => i.id === 'q2')?.decision).toBe('Both channels');
  });
});
