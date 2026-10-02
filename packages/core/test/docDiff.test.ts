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

  it('does not link short added lines to unrelated changes', () => {
    const originalText = '# T\n\nIntro.\n';
    const draftText = '# T\n\nIntro.\nDone.\n';
    const segments = diffDocuments(originalText, draftText, [
      entry('c1', 'All of this is Done. Really.'),
    ]);
    const addedShort = segments.find((s) => s.text === 'Done.\n');
    expect(addedShort?.changedBy).toBeUndefined();
  });

  it('does not link entries without appliedAt', () => {
    const segments = diffDocuments(original, draft, [
      entry('c1', 'Log one row per send.', { appliedAt: undefined as any }),
    ]);
    const added = segments.filter((s) => s.kind === 'added');
    expect(added.some((s) => s.changedBy)).toBe(false);
  });

  it('falls back threadTitle to threadId when not provided', () => {
    const segments = diffDocuments(original, draft, [
      entry('c1', 'Log one row per send.'),
    ]);
    const added = segments.filter((s) => s.kind === 'added');
    const withChangedBy = added.find((s) => s.changedBy?.length);
    expect(withChangedBy?.changedBy?.[0]?.threadTitle).toBe('t-c1');
  });

  it('links block replacement segments when each is at least 12 characters', () => {
    const originalText = 'A\nkeep this line\nB\n';
    const draftText = 'Alpha line one changed\nkeep this line\nBeta line two changed\n';
    const segments = diffDocuments(originalText, draftText, [
      entry('c1', 'Alpha line one changed\nkeep this line\nBeta line two changed'),
    ]);
    const added = segments.filter((s) => s.kind === 'added');
    const alpha = added.find((s) => s.text.includes('Alpha'));
    const beta = added.find((s) => s.text.includes('Beta'));
    expect(alpha?.changedBy?.map((c) => c.changeId)).toEqual(['c1']);
    expect(beta?.changedBy?.map((c) => c.changeId)).toEqual(['c1']);
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

  it('describes a drawing change in words instead of "data: updated"', () => {
    const before = { kind: 'system', groups: [], nodes: [{ id: 'job', label: 'Daily job', status: 'new' }], edges: [] };
    const after = { ...before, nodes: [...before.nodes, { id: 'sms', label: 'SMS sender', status: 'external' }] };
    const { item } = pair('a1', { type: 'architecture', title: 'System view' });
    const drawn = { ...item, data: before };
    const change = { items: [{ itemId: 'a1', patch: { summary: 'With SMS.', data: after } }] };
    const kindOf = (i: { type: string }) => (i.type === 'architecture' ? ('diagram' as const) : null);
    expect(previewChange(original, [drawn], change, kindOf).items).toEqual([
      { itemId: 'a1', title: 'System view', changes: [{ field: 'summary', before: 'A summary.', after: 'With SMS.' }], data: { kind: 'diagram', summary: ['1 box added'], after } },
    ]);
    // Without kindOf, or for an item that isn't drawn, it stays a plain field change.
    expect(previewChange(original, [drawn], change).items[0]?.changes).toContainEqual({ field: 'data', before: '', after: 'updated' });
    expect(previewChange(original, [drawn], change).items[0]?.data).toBeUndefined();
  });
});
