import type { DisplayStatus } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { ReviewedMark } from './ReviewedMark';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const AT = '2026-10-04T09:00:00.000Z';

/** The control for item concerns-twice, with a query client whose invalidations are spied on. */
function show(o: { status?: DisplayStatus; reviewedAt?: string } = {}) {
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  render(
    <QueryClientProvider client={qc}>
      <ReviewedMark repo="acme-app" project="restock" itemId="concerns-twice" status={o.status ?? 'your_turn'} reviewedAt={o.reviewedAt} />
    </QueryClientProvider>,
  );
  return { invalidate };
}

/** Whether the first invalidateQueries call covers this project's queries, and only this project's. */
const coversProject = (invalidate: { mock: { calls: unknown[][] } }) => {
  const predicate = (invalidate.mock.calls[0]?.[0] as { predicate: (q: { queryKey: unknown[] }) => boolean }).predicate;
  return predicate({ queryKey: ['thread', 'acme-app', 'restock', 't-x'] }) && !predicate({ queryKey: ['thread', 'acme-app', 'other', 't-x'] });
};

describe('the reviewed mark on a thread', () => {
  it('reads Mark as reviewed, and marks the item', async () => {
    const set = vi.spyOn(api, 'setReviewed').mockResolvedValue({ ok: true });
    const { invalidate } = show();
    const button = screen.getByRole('button', { name: 'Mark as reviewed' });
    expect(button.className).not.toContain('bg-button');
    fireEvent.click(button);
    await waitFor(() => expect(set).toHaveBeenCalledWith('acme-app', 'restock', 'concerns-twice', true));
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(coversProject(invalidate)).toBe(true);
  });

  it('shows Reviewed with Undo once marked, and Undo clears the mark', async () => {
    const set = vi.spyOn(api, 'setReviewed').mockResolvedValue({ ok: true });
    show({ reviewedAt: AT });
    expect(screen.getByTestId('reviewed-mark').textContent).toBe('✓ Reviewed · Undo');
    expect(screen.queryByRole('button', { name: 'Mark as reviewed' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('acme-app', 'restock', 'concerns-twice', false));
  });

  it('is shown while the thread is open, and not once it is resolved or parked', () => {
    for (const status of ['your_turn', 'draft', 'with_claude', 'idle'] as const) {
      show({ status });
      expect(screen.getByTestId('reviewed-mark')).toBeTruthy();
      cleanup();
    }
    for (const status of ['resolved', 'parked'] as const) {
      show({ status, reviewedAt: AT });
      expect(screen.queryByTestId('reviewed-mark')).toBeNull();
      cleanup();
    }
  });

  it("says why it couldn't mark the item", async () => {
    vi.spyOn(api, 'setReviewed').mockRejectedValue(new ApiError(404, "Item concerns-twice doesn't exist.", null));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as reviewed' }));
    expect((await screen.findByRole('alert')).textContent).toBe("Item concerns-twice doesn't exist.");
  });
});
