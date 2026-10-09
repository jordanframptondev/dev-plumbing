import type { ItemVersionChange } from '@dev-plumbing/core/schemas';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VersionChange } from './VersionChange';

afterEach(cleanup);

const NOTHING: ItemVersionChange = { version: 2, since: false, summary: null, body: null, fields: null, drawing: null };
const CHANGED: ItemVersionChange = {
  version: 3,
  since: false,
  summary: [
    { kind: 'removed', text: 'Everyone, or only active subscribers?\n' },
    { kind: 'added', text: 'Only active subscribers, at first.\n' },
  ],
  body: null,
  fields: [
    { kind: 'removed', text: 'blocking: false\n' },
    { kind: 'added', text: 'blocking: true\n' },
  ],
  drawing: [
    { kind: 'same', text: 'System diagram: 2 boxes\n' },
    { kind: 'added', text: '1 box changed\n' },
  ],
};

describe('What v<n> changed', () => {
  it('is folded away, and shows a diff for each part that changed, in order', () => {
    render(<VersionChange change={CHANGED} />);
    const section = screen.getByTestId('version-change') as HTMLDetailsElement;
    expect(section.tagName).toBe('DETAILS');
    expect(section.open).toBe(false);
    expect(within(section).getByText('What v3 changed').tagName).toBe('SUMMARY');
    // Details didn't change, so it isn't there.
    expect(within(section).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Summary', 'Fields', 'Drawing']);
    const summary = within(section).getByRole('region', { name: 'Summary' });
    expect(summary.textContent).toContain('− Everyone, or only active subscribers?');
    expect(summary.textContent).toContain('+ Only active subscribers, at first.');
    const fields = within(section).getByRole('region', { name: 'Fields' });
    expect(fields.textContent).toContain('− blocking: false');
    expect(fields.textContent).toContain('+ blocking: true');
    const drawing = within(section).getByRole('region', { name: 'Drawing' });
    expect(drawing.textContent).toContain('System diagram: 2 boxes');
    expect(drawing.textContent).toContain('+ 1 box changed');
    expect(screen.queryByText('Nothing else changed.')).toBeNull();
  });

  it('says nothing else changed when only the flag was set', () => {
    render(<VersionChange change={NOTHING} />);
    const section = screen.getByTestId('version-change');
    expect(within(section).getByText('What v2 changed')).toBeTruthy();
    expect(within(section).getByText('Nothing else changed.')).toBeTruthy();
    expect(within(section).queryByRole('heading')).toBeNull();
    expect(within(section).queryByTestId('diff')).toBeNull();
  });

  it('says the item changed since before v<n> when the re-import kept no copy of what it did', () => {
    render(<VersionChange change={{ ...CHANGED, since: true }} />);
    const section = screen.getByTestId('version-change');
    expect(within(section).getByText('Changed since before v3').tagName).toBe('SUMMARY');
    expect(within(section).queryByText('What v3 changed')).toBeNull();
  });
});
