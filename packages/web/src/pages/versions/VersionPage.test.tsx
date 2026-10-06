import type { DiffSegment, VersionSummary } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { VersionBody } from './VersionPage';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const version = (n: number, over: Partial<VersionSummary> = {}): VersionSummary => ({
  n,
  at: '2026-10-01T09:00:00.000Z',
  hash: String(n).repeat(64),
  clone: '~/Source/acme-app',
  branch: 'main',
  commit: null,
  ...(n > 1 ? { merge: { clean: 1, conflicts: 0 } } : {}),
  current: false,
  ...over,
});
const V1 = version(1);
const V2 = version(2, { current: true });
const PLAN = '# Restock reminders\n\n## Channels\n\nSend by SMS.\n';
const DRAFT = '# Restock reminders\n\n## Channels\n\nSend by SMS and email.\n';
const SEGMENTS: DiffSegment[] = [
  { kind: 'same', text: '# Restock reminders\n\n## Channels\n\n' },
  { kind: 'removed', text: 'Send by SMS.\n' },
  { kind: 'added', text: 'Send by SMS and email.\n' },
];

type Docs = { original: string | null; draft: string | null };

/**
 * Version n's page. Every version's plan and draft are PLAN and DRAFT, and every comparison, and what each update did
 * to the draft, is SEGMENTS, unless given.
 */
function show(n: number, versions: VersionSummary[], o: { docs?: Docs; segments?: DiffSegment[]; updated?: DiffSegment[] } = {}) {
  const docs = o.docs ?? { original: PLAN, draft: DRAFT };
  vi.spyOn(api, 'versions').mockResolvedValue({ versions });
  const doc = vi.spyOn(api, 'versionDoc').mockImplementation(async (_repo, _id, _n, which) => ({ text: docs[which] }));
  const compare = vi.spyOn(api, 'compareVersions').mockResolvedValue({ segments: o.segments ?? SEGMENTS });
  const updateDiff = vi.spyOn(api, 'updateDiff').mockResolvedValue({ segments: o.updated ?? SEGMENTS });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VersionBody repo="acme-app" project="restock" n={n} />
    </QueryClientProvider>,
  );
  return { doc, compare, updateDiff };
}

describe('a version', () => {
  it("shows the version's plan, then its draft", async () => {
    const { doc } = show(1, [V2, V1]);
    expect((await screen.findByTestId('version-doc')).textContent).toContain('Send by SMS.');
    expect(doc).toHaveBeenCalledWith('acme-app', 'restock', 1, 'original');
    expect(screen.getByRole('heading', { name: 'v1' })).toBeTruthy();
    expect(screen.queryByText('Current')).toBeNull();
    expect(screen.getByText(/· main · Imported$/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '‹ Versions' }).getAttribute('href')).toBe('/p/acme-app/restock/versions');
    fireEvent.click(screen.getByRole('tab', { name: 'Draft' }));
    await waitFor(() => expect(screen.getByTestId('version-doc').textContent).toContain('Send by SMS and email.'));
    expect(doc).toHaveBeenCalledWith('acme-app', 'restock', 1, 'draft');
  });

  it('compares an older version with the current one', async () => {
    const { compare } = show(1, [V2, V1]);
    const select = (await screen.findByLabelText('Compare with')) as HTMLSelectElement;
    expect(select.value).toBe('2');
    expect([...select.options].map((o) => o.textContent)).toEqual(['v2 · Current']);
    await waitFor(() => expect(compare).toHaveBeenCalledWith('acme-app', 'restock', 1, 2, 'original'));
    expect(screen.getByText('Changes to the plan from v1 to v2')).toBeTruthy();
    const diff = await screen.findByTestId('version-compare');
    await waitFor(() => expect(diff.textContent).toContain('+ Send by SMS and email.'));
    expect(diff.textContent).toContain('− Send by SMS.');
  });

  it('compares the current version with the one before it, or with any other you pick', async () => {
    const { compare } = show(3, [version(3, { current: true }), version(2), V1]);
    expect(await screen.findByText('Current')).toBeTruthy();
    const select = (await screen.findByLabelText('Compare with')) as HTMLSelectElement;
    expect(select.value).toBe('2');
    expect([...select.options].map((o) => o.textContent)).toEqual(['v2', 'v1']);
    await waitFor(() => expect(compare).toHaveBeenCalledWith('acme-app', 'restock', 2, 3, 'original'));
    fireEvent.change(select, { target: { value: '1' } });
    await waitFor(() => expect(compare).toHaveBeenCalledWith('acme-app', 'restock', 1, 3, 'original'));
    expect(screen.getByText('Changes to the plan from v1 to v3')).toBeTruthy();
  });

  it('shows what the update that brought a version in changed in your draft', async () => {
    const { updateDiff } = show(2, [V2, V1]);
    const diff = await screen.findByTestId('version-update-diff');
    expect(updateDiff).toHaveBeenCalledWith('acme-app', 'restock', 2);
    expect(screen.getByText('What the update changed in your draft')).toBeTruthy();
    await waitFor(() => expect(diff.textContent).toContain('+ Send by SMS and email.'));
    expect(diff.textContent).toContain('− Send by SMS.');
  });

  it("says when an update didn't change your draft, and has nothing to say about v1", async () => {
    show(2, [V2, V1], { updated: [{ kind: 'same', text: DRAFT }] });
    expect(await screen.findByText("The update didn't change your draft.")).toBeTruthy();
    cleanup();
    vi.restoreAllMocks();
    const { updateDiff } = show(1, [V2, V1]);
    expect((await screen.findByTestId('version-doc')).textContent).toContain('Send by SMS.');
    expect(screen.queryByTestId('version-update-diff')).toBeNull();
    expect(updateDiff).not.toHaveBeenCalled();
  });

  it('says when the two plans are the same', async () => {
    show(1, [V2, V1], { segments: [{ kind: 'same', text: PLAN }] });
    expect(await screen.findByText('The two plans are the same.')).toBeTruthy();
  });

  it('has nothing to compare with when there is only one version', async () => {
    const { compare } = show(1, [version(1, { current: true })]);
    expect((await screen.findByTestId('version-doc')).textContent).toContain('Send by SMS.');
    expect(screen.queryByLabelText('Compare with')).toBeNull();
    expect(compare).not.toHaveBeenCalled();
  });

  it("says when a version or its document doesn't exist", async () => {
    show(5, [V2, V1]);
    expect(await screen.findByText("This version doesn't exist.")).toBeTruthy();
    cleanup();
    vi.restoreAllMocks();
    show(1, [V2, V1], { docs: { original: null, draft: null } });
    expect(await screen.findByText('This document is missing.')).toBeTruthy();
    expect(screen.queryByTestId('version-doc')).toBeNull();
  });
});
