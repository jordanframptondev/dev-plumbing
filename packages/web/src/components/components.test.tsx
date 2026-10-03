import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressBar } from './ProgressBar';
import { Segmented } from './Segmented';
import { StatusMark } from './StatusMark';
import { Switch } from './Switch';

afterEach(cleanup);

describe('StatusMark', () => {
  it('shows the right mark for each status', () => {
    const cases = [
      ['your_turn', 'Your turn'],
      ['draft', 'Draft'],
      ['with_claude', 'With Claude'],
      ['resolved', 'Resolved'],
      ['parked', 'Parked'],
    ] as const;
    for (const [status, label] of cases) {
      const { unmount } = render(<StatusMark status={status} />);
      expect(screen.getByRole('img', { name: label }).getAttribute('data-status')).toBe(status);
      unmount();
    }
  });
  it('uses seal for your turn and moss for resolved', () => {
    render(<StatusMark status="your_turn" />);
    expect(screen.getByRole('img', { name: 'Your turn' }).className).toContain('bg-seal');
    cleanup();
    render(<StatusMark status="resolved" />);
    expect(screen.getByRole('img', { name: 'Resolved' }).className).toContain('text-moss');
  });
});

describe('Segmented', () => {
  it("doesn't pick a disabled option", () => {
    const onChange = vi.fn();
    render(<Segmented label="Version" value="after" onChange={onChange} options={[{ value: 'before', label: 'Before', disabled: true }, { value: 'after', label: 'After' }]} />);
    const before = screen.getByRole('tab', { name: 'Before' }) as HTMLButtonElement;
    expect(before.disabled).toBe(true);
    fireEvent.click(before);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks the selected option and reports changes', () => {
    const onChange = vi.fn();
    render(<Segmented label="Filter" value="a" onChange={onChange} options={[{ value: 'a', label: 'Active' }, { value: 'b', label: 'All' }]} />);
    expect(screen.getByRole('tab', { name: 'Active' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('Switch', () => {
  it('toggles', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Start at login" />);
    fireEvent.click(screen.getByRole('switch', { name: 'Start at login' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('ProgressBar', () => {
  it('reports resolved out of total', () => {
    render(<ProgressBar resolved={3} total={6} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemax')).toBe('6');
  });
});
