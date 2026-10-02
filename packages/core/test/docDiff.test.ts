import { describe, expect, it } from 'vitest';
import { diffDocuments, diffText, previewChange } from '../src/docDiff';
import type { HistoryEntry } from '../src/schemas';
import { pair } from './fixtures';

const original = '# Restock\n\nLog reminders in a table.\n\nSend by SMS.\n';
const draft = '# Restock\n\nLog one row per send.\n\nSend by SMS and email.\n';
const entry = (id: string, replace: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id,
  at: '2026-10-01T10:00:00.000Z',
  threadId: `t-${id}`,
  kind: 'accept',
  summary: `summary ${id}`,
  change: { md: [{ find: 'x', replace }] },
  appliedAt: '2026-10-01T10:00:00.000Z',
  itemsBefore: {},
  itemsAfter: {},
  ...extra,
});

describe('document diffs', () => {
  it('marks added and removed lines', () => {
    const kinds = diffText(original, draft).map((s) => s.kind);
    expect(kinds).toContain('added');
    expect(kinds).toContain('removed');
    expect(diffText(original, original)).toEqual([{ kind: 'same', text: original }]);
  });

  it('links each added part to the change that wrote it, ignoring undone changes', () => {
    const segments = diffDocuments(original, draft, [
      entry('c1', 'Log one row per send.'),
      entry('c2', 'Send by SMS and email.', { undoneAt: '2026-10-01T11:00:00.000Z' }),
      entry('c3', 'Send by SMS and email.'),
    ], (threadId) => `Title of ${threadId}`);
    const added = segments.filter((s) => s.kind === 'added');
    expect(added.find((s) => s.text.includes('one row per send'))?.changedBy).toEqual([{ changeId: 'c1', threadId: 't-c1', summary: 'summary c1', threadTitle: 'Title of t-c1' }]);
    expect(added.find((s) => s.text.includes('and email'))?.changedBy?.map((c) => c.changeId)).toEqual(['c3']);
  });
});

describe('change previews', () => {
  it('shows the draft diff and item field changes', () => {
    const { item } = pair('q1', { fields: { default: '5 days' } });
    const preview = previewChange(original, [item], {
      md: [{ find: 'Send by SMS.', replace: 'Send by SMS and email.' }],
      items: [{ itemId: 'q1', patch: { summary: 'Both channels.', fields: { default: '3 days' } } }],
    });
    expect(preview.problem).toBeUndefined();
    expect(preview.md?.filter((s) => s.kind !== 'same').map((s) => [s.kind, s.text])).toEqual([
      ['removed', 'Send by SMS.\n'],
      ['added', 'Send by SMS and email.\n'],
    ]);
    expect(preview.items).toEqual([
      { itemId: 'q1', title: 'Question q1', changes: [{ field: 'summary', before: 'A summary.', after: 'Both channels.' }, { field: 'default', before: '5 days', after: '3 days' }] },
    ]);
  });

  it("says when a change doesn't fit", () => {
    expect(previewChange(original, [], { md: [{ find: 'nope', replace: 'x' }], items: [{ itemId: 'ghost', patch: { title: 't' } }] })).toEqual({
      md: null,
      items: [],
      problem: expect.stringMatching(/isn't in the draft.*no item "ghost"/s),
    });
  });
});
