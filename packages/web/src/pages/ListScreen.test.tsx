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

const PLAN_CHANGES: TypeEntry = {
  ...QUESTIONS,
  id: 'plan-changes',
  title: 'Plan changes',
  order: 0,
  emptyMessage: "Nothing in the repo's new version conflicts with your draft.",
  itemCount: 1,
  withClaude: 0,
  fields: [],
  answerPresets: ['Keep my draft', "Take the repo's version"],
  addLabel: undefined,
};

describe('ListScreen', () => {
  it('says when the settled Plan changes call for a re-import, and only then', () => {
    const items = [row({ id: 'plan-changes-v2-1', threadId: 't-plan-changes-v2-1', title: 'Data', status: 'resolved', decision: 'Data: use the merged version' })];
    const show = (catchUpDue?: boolean) =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <ListScreen repo="acme-app" project="restock" data={{ type: PLAN_CHANGES, items }} {...(catchUpDue === undefined ? {} : { catchUpDue })} />
        </QueryClientProvider>,
      );
    show(true);
    const line = screen.getByTestId('catch-up-due');
    expect(line.textContent).toBe('Your Plan changes are settled. Run /dev-plumbing to catch the items up.');
    expect(line.className).toContain('text-ink-2');
    cleanup();
    show(false);
    expect(screen.queryByTestId('catch-up-due')).toBeNull();
    cleanup();
    show();
    expect(screen.queryByTestId('catch-up-due')).toBeNull();
  });
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
