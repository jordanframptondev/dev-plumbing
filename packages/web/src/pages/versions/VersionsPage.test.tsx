import type { VersionSummary } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
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

function show(versions: VersionSummary[]) {
  const list = vi.spyOn(api, 'versions').mockResolvedValue({ versions });
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
