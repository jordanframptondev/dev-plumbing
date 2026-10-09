import type { Leftover, VersionSummary } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { formatUpdated } from '../../lib/time';
import { versionMeta, VersionsBody } from './VersionsPage';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const V1: VersionSummary = { n: 1, at: '2026-10-01T09:00:00.000Z', hash: 'a'.repeat(64), clone: '~/Source/acme-app', branch: 'main', commit: null, current: false };
const V2: VersionSummary = {
  n: 2,
  at: '2026-10-04T09:00:00.000Z',
  hash: 'b'.repeat(64),
  clone: '~/Source/acme-app',
  branch: 'restock',
  commit: '0123456789abcdef0123456789abcdef01234567',
  merge: { clean: 3, conflicts: 1 },
  current: true,
};

function show(versions: VersionSummary[], leftovers: Leftover[] = []) {
  const list = vi.spyOn(api, 'versions').mockResolvedValue({ versions, leftovers });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VersionsBody repo="acme-app" project="restock" />
    </QueryClientProvider>,
  );
  return list;
}

describe('the Versions page', () => {
  it('lists every version, the current one first, with where it came from and what it merged', async () => {
    const list = show([V2, V1]);
    const rows = within(await screen.findByTestId('versions-list')).getAllByTestId('version-row');
    expect(list).toHaveBeenCalledWith('acme-app', 'restock');
    expect(screen.getByRole('heading', { name: 'Versions' })).toBeTruthy();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.getAttribute('href')).toBe('/p/acme-app/restock/versions/2');
    expect(within(rows[0]!).getByText('v2')).toBeTruthy();
    expect(within(rows[0]!).getByText('Current')).toBeTruthy();
    expect(rows[0]!.textContent).toContain(`${formatUpdated(V2.at)} · restock · 0123456 · 3 changes merged · 1 conflict`);
    expect(rows[1]!.getAttribute('href')).toBe('/p/acme-app/restock/versions/1');
    expect(within(rows[1]!).getByText('v1')).toBeTruthy();
    expect(within(rows[1]!).queryByText('Current')).toBeNull();
    // v1 is the import, and a clone with no commit yet shows only its branch.
    expect(rows[1]!.textContent).toContain(`${formatUpdated(V1.at)} · main · Imported`);
  });

  it('counts in the singular', () => {
    expect(versionMeta({ ...V2, commit: null, merge: { clean: 1, conflicts: 0 } })).toBe(`${formatUpdated(V2.at)} · restock · 1 change merged · 0 conflicts`);
  });

  it('says when a version started the draft afresh', () => {
    expect(versionMeta({ ...V2, n: 3, commit: null, merge: { clean: 0, conflicts: 0, fresh: true } })).toBe(`${formatUpdated(V2.at)} · restock · Draft started from v3`);
  });

  it('lists no leftovers when there are none', async () => {
    show([V2, V1]);
    await screen.findByTestId('versions-list');
    expect(screen.queryByText("Left over from updates that didn't finish")).toBeNull();
    expect(screen.queryByTestId('leftovers-list')).toBeNull();
  });

  it('lists the folders updates that did not finish left behind, each with Remove, which asks first', async () => {
    const leftovers: Leftover[] = [
      { name: 'v2.unfinished-20261006100000', version: 2, at: '2026-10-06T10:00:00.000Z' },
      { name: 'v1.unfinished-20261005100000', version: 1, at: '2026-10-05T10:00:00.000Z' },
    ];
    const list = show([V2, V1], leftovers);
    const remove = vi.spyOn(api, 'removeLeftover').mockResolvedValue({ ok: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const section = await screen.findByTestId('leftovers-list');
    expect(within(section).getByRole('heading').textContent).toBe("Left over from updates that didn't finish");
    const rows = within(section).getAllByTestId('leftover-row');
    expect(rows.map((r) => r.textContent)).toEqual([
      `v2.unfinished-20261006100000v2's plan and draft from before the update · set aside ${formatUpdated(leftovers[0]!.at)}Remove`,
      `v1.unfinished-20261005100000v1's plan and draft from before the update · set aside ${formatUpdated(leftovers[1]!.at)}Remove`,
    ]);
    // Remove is never the page's main action.
    expect(within(rows[0]!).getByRole('button', { name: 'Remove' }).className).not.toContain('bg-button');

    // Cancelled: nothing is removed.
    fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Remove' }));
    expect(confirm).toHaveBeenCalledWith("Remove v1.unfinished-20261005100000? It holds your v1 plan and draft from before an update that didn't finish. They're deleted.");
    expect(remove).not.toHaveBeenCalled();

    // Confirmed: it's removed, and the list is read again.
    confirm.mockReturnValue(true);
    list.mockResolvedValue({ versions: [V2, V1], leftovers: [leftovers[0]!] });
    fireEvent.click(within(rows[1]!).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('acme-app', 'restock', 'v1.unfinished-20261005100000'));
    await waitFor(() => expect(screen.getAllByTestId('leftover-row')).toHaveLength(1));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("says why a leftover couldn't be removed", async () => {
    show([V2, V1], [{ name: 'v1.unfinished-20261005100000', version: 1, at: '2026-10-05T10:00:00.000Z' }]);
    vi.spyOn(api, 'removeLeftover').mockRejectedValue(new Error("That folder isn't a leftover from an update."));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText("That folder isn't a leftover from an update.")).toBeTruthy();
  });

  it("says why the list couldn't be read", async () => {
    vi.spyOn(api, 'versions').mockRejectedValue(new Error("There's no plumbing project restock in acme-app."));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <VersionsBody repo="acme-app" project="restock" />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("There's no plumbing project restock in acme-app.")).toBeTruthy();
  });
});
