import { describe, expect, it } from 'vitest';
import { countThreads, displayStatus, summaryStatus } from './views';

describe('thread status helpers', () => {
  it('shows a your-turn thread with unsent input as a draft', () => {
    expect(displayStatus({ status: 'your_turn', draft: { note: 'x', updatedAt: '' } })).toBe('draft');
    expect(displayStatus({ status: 'with_claude', draft: { note: 'x', updatedAt: '' } })).toBe('with_claude');
    expect(displayStatus({ status: 'resolved' })).toBe('resolved');
  });

  it('counts statuses and leaves idle out of the total', () => {
    expect(countThreads(['your_turn', 'draft', 'with_claude', 'resolved', 'parked', 'idle'])).toEqual({
      yourTurn: 1, drafts: 1, withClaude: 1, resolved: 1, parked: 1, total: 5,
    });
  });

  it('picks the most urgent status for a summary', () => {
    expect(summaryStatus(countThreads(['resolved', 'your_turn']))).toBe('your_turn');
    expect(summaryStatus(countThreads(['resolved', 'parked']))).toBe('resolved');
    expect(summaryStatus(countThreads([]))).toBe('idle');
  });
});
