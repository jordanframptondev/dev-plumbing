import type { TypeItemRow } from '@dev-plumbing/core/schemas';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimelineStrip } from './TimelineStrip';

afterEach(cleanup);

function row(id: string, title: string, data: unknown): TypeItemRow {
  return {
    id,
    threadId: `t-${id}`,
    title,
    summary: '',
    status: 'idle',
    blocking: false,
    fields: {},
    messageCount: 0,
    latest: null,
    open: null,
    draft: null,
    decision: null,
    flagged: false,
    data,
    body: null,
    links: [],
    anchor: null,
    createdBy: 'import',
    checks: null,
    itemRefs: {},
    removedIn: null,
  };
}

const rows = [
  row('phases-send', 'Send reminders', { order: 2, goal: 'Customers get a reminder.', doneWhen: ['The job runs daily', 'Every send is logged'], itemIds: ['questions-who', 'questions-days'] }),
  row('phases-polish', 'Polish', null),
  row('phases-table', 'Build the table', { order: 1, goal: 'Reminders can be stored.', doneWhen: ['The migration runs'], itemIds: ['questions-days'] }),
  row('phases-odd', 'Odd one', { order: 'soon' }),
];

describe('TimelineStrip', () => {
  it('shows phases in order, then items without phase data as Phase ?', () => {
    render(<TimelineStrip rows={rows} selected={null} onSelect={() => {}} />);
    const chips = screen.getAllByTestId('phase-chip').map((c) => c.textContent ?? '');
    expect(chips).toHaveLength(4);
    expect(chips[0]).toContain('Phase 1');
    expect(chips[0]).toContain('Build the table');
    expect(chips[0]).toContain('Done when: 1');
    expect(chips[0]).toContain('1 item');
    expect(chips[1]).toContain('Phase 2');
    expect(chips[1]).toContain('Done when: 2');
    expect(chips[1]).toContain('2 items');
    expect(chips[2]).toContain('Phase ?');
    expect(chips[2]).toContain('Polish');
    expect(chips[2]).toContain('No goal yet');
    expect(chips[3]).toContain('Phase ?');
    expect(chips[3]).toContain('Odd one');
  });

  it('reports the picked phase and marks it', () => {
    const onSelect = vi.fn();
    render(<TimelineStrip rows={rows} selected="phases-send" onSelect={onSelect} />);
    const chips = screen.getAllByTestId('phase-chip');
    fireEvent.click(chips[0]!);
    expect(onSelect).toHaveBeenCalledWith('phases-table');
    expect(chips[1]!.getAttribute('aria-pressed')).toBe('true');
    expect(chips[0]!.getAttribute('aria-pressed')).toBe('false');
  });
});
