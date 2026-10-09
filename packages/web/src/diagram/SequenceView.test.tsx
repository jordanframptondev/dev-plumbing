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

  it('draws each lane and step where it always has', () => {
    render(<SequenceView flow={flow} />);
    const svg = screen.getByTestId('sequence').querySelector('svg')!;
    const attrs = (selector: string, names: string[]) => [...svg.querySelectorAll(selector)].map((el) => names.map((n) => el.getAttribute(n)));
    expect(attrs('[data-testid=sequence-lane] rect', ['x', 'y', 'width', 'height'])).toEqual([
      ['16', '16', '160', '32'],
      ['200', '16', '160', '32'],
      ['384', '16', '160', '32'],
    ]);
    expect(attrs('[data-testid=sequence-lane] line', ['x1', 'y1', 'x2', 'y2'])).toEqual([
      ['96', '48', '96', '244'],
      ['280', '48', '280', '244'],
      ['464', '48', '464', '244'],
    ]);
    expect(attrs('[data-testid=sequence-lane] text', ['x', 'y'])).toEqual([
      ['96', '36'],
      ['280', '36'],
      ['464', '36'],
    ]);
    expect(attrs('[data-testid=sequence-step] path', ['d'])).toEqual([['M96,98 H280'], ['M96,134 h28 v16 h-28'], ['M96,186 H464']]);
    expect([...svg.querySelectorAll('[data-testid=sequence-step] text')].map((t) => [t.getAttribute('x'), t.getAttribute('y'), t.getAttribute('text-anchor'), t.textContent])).toEqual([
      ['188', '86', 'middle', '1. Find subscriptions due soon'],
      ['130', '146', 'start', '2. Skip paused customers'],
      ['280', '174', 'middle', '3. Send the reminder'],
      ['280', '230', 'middle', '4. Wait for tomorrow'],
    ]);
  });

  it('lets one finger scroll the page and two fingers zoom', () => {
    render(<SequenceView flow={flow} />);
    expect(screen.getByTestId('sequence').querySelector('svg')!.style.touchAction).toBe('pan-x pan-y pinch-zoom');
  });
});
