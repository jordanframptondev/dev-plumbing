import { describe, expect, it } from 'vitest';
import { applyMdPatches, countOccurrences, invertMdPatches } from './patch';

const draft = 'Log reminders in a table.\n\nReminders go by SMS.\n';

describe('applyMdPatches', () => {
  it('replaces text that appears exactly once', () => {
    expect(applyMdPatches(draft, [{ find: 'by SMS', replace: 'by SMS and email' }])).toEqual({
      ok: true,
      text: 'Log reminders in a table.\n\nReminders go by SMS and email.\n',
    });
  });

  it('applies patches in order, each against the text so far', () => {
    const r = applyMdPatches(draft, [
      { find: 'a table', replace: 'a RestockReminder table' },
      { find: 'RestockReminder table.', replace: 'RestockReminder table (one row per send).' },
    ]);
    expect(r).toEqual({ ok: true, text: 'Log reminders in a RestockReminder table (one row per send).\n\nReminders go by SMS.\n' });
  });

  it('refuses text that is missing or appears more than once', () => {
    expect(applyMdPatches(draft, [{ find: 'by fax', replace: 'x' }])).toEqual({ ok: false, error: expect.stringMatching(/isn't in the draft/) });
    expect(applyMdPatches(draft, [{ find: 'eminders', replace: 'x' }])).toEqual({ ok: false, error: expect.stringMatching(/appears 2 times/) });
  });

  it('treats $ in the replacement as plain text', () => {
    expect(applyMdPatches('cost: X', [{ find: 'X', replace: '$& $1 $$' }])).toEqual({ ok: true, text: 'cost: $& $1 $$' });
  });
});

describe('invertMdPatches', () => {
  it('undoes a set of patches', () => {
    const patches = [
      { find: 'a table', replace: 'a RestockReminder table' },
      { find: 'by SMS', replace: 'by SMS and email' },
    ];
    const forward = applyMdPatches(draft, patches);
    const inverse = invertMdPatches(patches);
    if (!forward.ok || !inverse.ok) throw new Error('expected both to work');
    expect(applyMdPatches(forward.text, inverse.patches)).toEqual({ ok: true, text: draft });
  });

  it("can't invert a patch that deleted text outright", () => {
    expect(invertMdPatches([{ find: 'Reminders go by SMS.\n', replace: '' }])).toEqual({ ok: false, error: expect.stringMatching(/can't be undone/) });
  });
});

it('counts occurrences', () => {
  expect(countOccurrences('a a a', 'a')).toBe(3);
  expect(countOccurrences('abc', '')).toBe(0);
});
