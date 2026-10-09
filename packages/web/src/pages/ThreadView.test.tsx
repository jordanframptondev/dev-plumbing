import type { Message, ThreadDetail } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { ThreadView } from './ThreadView';

vi.mock('@tanstack/react-router', async () => ({
  ...(await import('./visual/testkit')).routerMock(vi.fn()),
  useParams: () => ({ repo: 'acme-app', project: 'restock', thread: 't-questions-log' }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const AT = '2026-10-05T09:00:00.000Z';
const ANSWERED: Message[] = [
  { id: 'm-1', at: AT, author: 'claude', text: 'Keep them for 180 days?', opening: true },
  { id: 'y-1', at: AT, author: 'you', text: 'Yes.' },
  { id: 'm-2', at: AT, author: 'claude', text: 'Kept for 180 days.', resolved: true },
];

/** A Questions thread's detail, resolved unless overridden, its item imported at v1. */
function detail(o: { status?: ThreadDetail['thread']['status']; removedIn?: number; messages?: Message[] } = {}): ThreadDetail {
  const status = o.status ?? 'resolved';
  return {
    thread: { id: 't-questions-log', itemId: 'questions-log', status, display: status, messages: o.messages ?? ANSWERED },
    item: {
      id: 'questions-log',
      key: 'log',
      type: 'questions',
      title: 'How long to keep reminder rows?',
      summary: 'Retention for the reminder log.',
      threadId: 't-questions-log',
      createdBy: 'import',
      ...(o.removedIn ? { removedIn: o.removedIn } : {}),
    },
    type: { id: 'questions', title: 'Questions', screen: 'list', timeline: false, fields: [], answerPresets: [] },
    open: null,
    previews: {},
    linked: [],
    refs: {},
    edits: {},
    decisions: [],
    listening: null,
    checks: null,
    anchorParent: null,
    versionChange: null,
  };
}

function show(d: ThreadDetail) {
  vi.spyOn(api, 'thread').mockResolvedValue(d);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThreadView />
    </QueryClientProvider>,
  );
}

describe('a resolved thread', () => {
  it('can be parked when its item was removed from the plan, to keep it out of the final', async () => {
    const park = vi.spyOn(api, 'park').mockResolvedValue({ ok: true });
    vi.spyOn(api, 'saveDraft').mockResolvedValue({ ok: true });
    show(detail({ removedIn: 2 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Park' }));
    await waitFor(() => expect(park).toHaveBeenCalledWith('acme-app', 'restock', 't-questions-log', true));
  });

  it('has no Park while its item is still in the plan', async () => {
    show(detail());
    expect(await screen.findByTestId('thread-status')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Send/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Park' })).toBeNull();
  });
});

describe("Claude's opening question", () => {
  it('says when the plan was imported, or which version a re-import raised it in', async () => {
    show(
      detail({
        status: 'your_turn',
        messages: [
          { id: 'm-1', at: AT, author: 'claude', text: 'Keep them for 180 days?', opening: true },
          { id: 's-1', at: AT, author: 'system', text: "Updated from the plan's v2." },
          { id: 'm-2', at: AT, author: 'claude', text: 'Keep them for 90 days now?', opening: true, raisedIn: 2 },
        ],
      }),
    );
    // Each sits after "Claude ·" in its message's header line.
    expect((await screen.findByText(/· raised when the plan was imported$/)).textContent).toBe('Claude · raised when the plan was imported');
    expect(screen.getByText(/· raised in the plan's v2$/).textContent).toBe("Claude · raised in the plan's v2");
  });
});
