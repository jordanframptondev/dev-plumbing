import type { ProjectHome, TypeEntry } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { TypeView } from './TypeView';
import { row } from './visual/testkit';

const navigate = vi.hoisted(() => vi.fn());
const params = vi.hoisted(() => ({ repo: 'acme-app', project: 'restock', type: 'plan-changes' }));
vi.mock('@tanstack/react-router', async () => ({
  ...(await import('./visual/testkit')).routerMock(navigate),
  useParams: () => params,
  useSearch: () => ({}),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const entry = (id: string, title: string): TypeEntry => ({
  id,
  title,
  order: 0,
  screen: 'list',
  timeline: false,
  emptyMessage: 'Nothing here.',
  itemCount: 1,
  yourTurn: 0,
  drafts: 0,
  withClaude: 0,
  resolved: 1,
  noChanges: null,
  importFailed: false,
  fields: [],
  answerPresets: [],
});

/** TypeView on the given type's list, with the project home saying whether a catch-up is waiting. */
async function show(type: string, title: string, catchUpDue: boolean) {
  params.type = type;
  vi.spyOn(api, 'typeItems').mockResolvedValue({ type: entry(type, title), items: [row({ id: `${type}-1`, threadId: `t-${type}-1`, title: 'Data', status: 'resolved' })] });
  vi.spyOn(api, 'projectHome').mockResolvedValue({ catchUpDue } as unknown as ProjectHome);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TypeView />
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { name: title });
}

describe('TypeView', () => {
  it('says on the Plan changes list that a re-import is waiting, once the project home says so', async () => {
    await show('plan-changes', 'Plan changes', true);
    expect((await screen.findByTestId('catch-up-due')).textContent).toBe('Your Plan changes are settled. Run /dev-plumbing to catch the items up.');
  });

  it('says nothing while no catch-up is waiting, and nothing on any other list', async () => {
    // Each time, the project home has been read before looking: the line still isn't there.
    const homeRead = () => waitFor(() => expect(api.projectHome).toHaveBeenCalled()).then(() => new Promise((r) => setTimeout(r, 20)));
    await show('plan-changes', 'Plan changes', false);
    await homeRead();
    expect(screen.queryByTestId('catch-up-due')).toBeNull();
    cleanup();
    await show('questions', 'Questions', true);
    await homeRead();
    expect(screen.queryByTestId('catch-up-due')).toBeNull();
  });
});
