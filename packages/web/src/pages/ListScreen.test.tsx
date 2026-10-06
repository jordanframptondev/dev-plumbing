import type { TypeEntry } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListScreen } from './ListScreen';
import { row } from './visual/testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('./visual/testkit')).routerMock(navigate));

afterEach(cleanup);

const QUESTIONS: TypeEntry = {
  id: 'questions',
  title: 'Questions',
  order: 5,
  screen: 'list',
  timeline: false,
  emptyMessage: 'No open questions.',
  itemCount: 3,
  yourTurn: 0,
  drafts: 0,
  withClaude: 1,
  resolved: 1,
  noChanges: null,
  importFailed: false,
  fields: ['blocking', 'default'],
  answerPresets: [],
  addLabel: 'Question',
};

describe('ListScreen', () => {
  it('says which version of the plan removed an item, parked or still with Claude', () => {
    const items = [
      row({ id: 'questions-log', threadId: 't-questions-log', title: 'How long to keep reminder rows?', status: 'parked', removedIn: 2 }),
      row({ id: 'questions-snooze', threadId: 't-questions-snooze', title: 'Snooze a reminder?', summary: 'A week at most.', status: 'with_claude', flagged: true, removedIn: 3 }),
      row({ id: 'questions-channels', threadId: 't-questions-channels', title: 'Which channels?', status: 'resolved' }),
    ];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ListScreen repo="acme-app" project="restock" data={{ type: QUESTIONS, items }} />
      </QueryClientProvider>,
    );
    const [parked, withClaude, resolved] = screen.getAllByTestId('list-row');
    expect(within(parked!).getByRole('img', { name: 'Parked' })).toBeTruthy();
    expect(within(parked!).getByTestId('removed-from-plan').textContent?.trim()).toBe('· removed from the plan in v2');
    // Claude had this one when its section went, so it's flagged rather than parked, and says so too.
    expect(withClaude!.textContent).toContain('A week at most. · may need another look · removed from the plan in v3');
    expect(within(withClaude!).getByTestId('removed-from-plan').className).toContain('text-ink-3');
    expect(within(resolved!).queryByTestId('removed-from-plan')).toBeNull();
  });
});
