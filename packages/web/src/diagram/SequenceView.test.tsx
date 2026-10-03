import type { FlowData } from '@dev-plumbing/core/schemas';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SequenceView } from './SequenceView';

afterEach(cleanup);

const flow: FlowData = {
  kind: 'system',
  lanes: [
    { id: 'job', label: 'Reminder job', status: 'new' },
    { id: 'db', label: 'Database', status: 'unchanged' },
    { id: 'sms', label: 'SMS provider', status: 'external' },
  ],
  steps: [
    { n: 3, from: 'job', to: 'sms', label: 'Send the reminder' },
    { n: 1, from: 'job', to: 'db', label: 'Find subscriptions due soon' },
    { n: 2, from: 'job', to: 'job', label: 'Skip paused customers', systemNote: 'remindersPaused is true' },
    { n: 4, label: 'Wait for tomorrow' },
  ],
};
const stepEl = (n: number) => screen.getAllByTestId('sequence-step').find((s) => s.getAttribute('data-step') === String(n))!;

describe('SequenceView', () => {
  it('draws one column per lane and one numbered row per step, in step order', () => {
    render(<SequenceView flow={flow} />);
    expect(screen.getAllByTestId('sequence-lane').map((l) => l.getAttribute('data-status'))).toEqual(['new', 'unchanged', 'external']);
    expect(screen.getAllByTestId('sequence-step').map((s) => s.getAttribute('data-step'))).toEqual(['1', '2', '3', '4']);
    expect(stepEl(1).textContent).toContain('1. Find subscriptions due soon');
    // 3 lanes of 160 with 24 between, 16 each side; 4 rows of 44 under 68 of headers, 16 below.
    expect(screen.getByTestId('sequence').querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 560 260');
  });

  it('draws a step between lanes as an arrow, a self-step as a loop, and a step without lanes as a note', () => {
    render(<SequenceView flow={flow} />);
    expect([1, 2, 3, 4].map((n) => stepEl(n).getAttribute('data-shape'))).toEqual(['arrow', 'loop', 'arrow', 'note']);
  });

  it('makes steps buttons when they can be selected', () => {
    const onSelect = vi.fn();
    render(<SequenceView flow={flow} onSelect={onSelect} selected={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'Step 1: Find subscriptions due soon' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Step 2: Skip paused customers' }), { key: 'Enter' });
    expect(onSelect.mock.calls).toEqual([[1], [2]]);
    expect(screen.getByRole('button', { name: 'Step 3: Send the reminder' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('has no buttons without onSelect, and shows bubbles with their counts', () => {
    render(<SequenceView flow={flow} bubbles={{ 2: { count: 3, tone: 'seal' } }} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByTestId('sequence-bubble').textContent).toBe('3');
  });

  it('lets one finger scroll the page and two fingers zoom', () => {
    render(<SequenceView flow={flow} />);
    expect(screen.getByTestId('sequence').querySelector('svg')!.style.touchAction).toBe('pan-x pan-y pinch-zoom');
  });
});
