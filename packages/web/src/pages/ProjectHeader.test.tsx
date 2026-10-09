import type { ProjectHome } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { useSubmit } from '../lib/useSubmit';
import { ProjectHeader } from './ProjectHeader';

vi.mock('@tanstack/react-router', async () => (await import('./visual/testkit')).routerMock(vi.fn()));

afterEach(cleanup);

const FINALIZE_PAGE = '/p/acme-app/restock/finalize';
const EXPORTED = { clone: '~/Source/acme-app', path: 'docs/specs/restock.final.md', at: '2026-10-03T09:00:00.000Z', assets: [] };

/** The parts of the project home the header reads, with Finalize blocked by two items unless overridden. */
function home(o: { finalized?: boolean; canStart?: boolean; importIncomplete?: ProjectHome['importIncomplete'] } = {}): ProjectHome {
  return {
    summary: { counts: { total: 3, resolved: 1, withClaude: 0, drafts: 0 } },
    project: {
      title: 'Restock reminders',
      status: o.finalized ? 'finalized' : 'active',
      source: { path: 'docs/specs/restock.md', clone: '~/Source/acme-app', branch: 'main' },
      docs: { original: 'docs/original.md', draft: 'docs/draft.md', ...(o.finalized ? { exportedTo: EXPORTED } : {}) },
    },
    finalize: { canStart: o.canStart ?? false, blockingCount: 2, state: null, changesSinceFinal: 0 },
    importIncomplete: o.importIncomplete ?? null,
  } as unknown as ProjectHome;
}

function show(h: ProjectHome) {
  const submitAll = { mutate: vi.fn(), isPending: false, data: undefined, error: null } as unknown as ReturnType<typeof useSubmit>;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProjectHeader home={h} repo="acme-app" project="restock" submitAll={submitAll} />
    </QueryClientProvider>,
  );
}

// The header renders Finalize twice, in the desktop buttons and in the phone row; CSS shows one of them.
describe('Finalize spec in the project header', () => {
  it('is off while something blocks it, with the reason as a link to the Finalize page', () => {
    show(home());
    for (const button of screen.getAllByRole('button', { name: 'Finalize spec' })) expect((button as HTMLButtonElement).disabled).toBe(true);
    const reasons = screen.getAllByRole('link', { name: '2 items block Finalize ›' });
    expect(reasons).toHaveLength(2);
    for (const reason of reasons) expect(reason.getAttribute('href')).toBe(FINALIZE_PAGE);
    expect(screen.queryByRole('link', { name: 'Finalize spec' })).toBeNull();
  });

  it('opens the Finalize page when nothing blocks it', () => {
    show(home({ canStart: true }));
    for (const link of screen.getAllByRole('link', { name: 'Finalize spec' })) expect(link.getAttribute('href')).toBe(FINALIZE_PAGE);
    expect(screen.queryByRole('button', { name: 'Finalize spec' })).toBeNull();
    expect(screen.queryByText(/block Finalize/)).toBeNull();
  });

  it('is always a link to Finalize again once the project has a final, even while something blocks', () => {
    show(home({ finalized: true }));
    const links = screen.getAllByRole('link', { name: 'Finalize again' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute('href')).toBe(FINALIZE_PAGE);
    expect(screen.queryByRole('button', { name: 'Finalize again' })).toBeNull();
    expect(screen.queryByText(/block Finalize/)).toBeNull();
  });
});

describe('Whiteboard Defense in the project header', () => {
  it('opens the Whiteboard Defense page, and is never the main action', () => {
    show(home());
    const link = screen.getByRole('link', { name: 'Whiteboard Defense' });
    expect(link.getAttribute('href')).toBe('/p/acme-app/restock/defense');
    expect(link.className).not.toContain('bg-button');
    expect(screen.queryByRole('button', { name: 'Whiteboard Defense' })).toBeNull();
  });
});

describe('a re-import that was ended early, in the project header', () => {
  it('names the version and the types that never came back, and says how to finish it', () => {
    show(home({ importIncomplete: { version: 2, titles: ['Architecture', 'Flows', 'Testing & rollout'], again: false } }));
    expect(screen.getByTestId('import-incomplete').textContent).toBe(
      "The v2 re-import didn't finish for Architecture, Flows and Testing & rollout. Run /dev-plumbing to try again.",
    );
    cleanup();
    show(home({ importIncomplete: { version: 3, titles: ['Architecture'], again: false } }));
    expect(screen.getByTestId('import-incomplete').textContent).toBe("The v3 re-import didn't finish for Architecture. Run /dev-plumbing to try again.");
    // Ended early again after /dev-plumbing tried once more.
    cleanup();
    show(home({ importIncomplete: { version: 3, titles: ['Architecture'], again: true } }));
    expect(screen.getByTestId('import-incomplete').textContent).toBe("The v3 re-import didn't finish again for Architecture. Run /dev-plumbing to try again.");
  });

  it('says nothing otherwise', () => {
    show(home());
    expect(screen.queryByTestId('import-incomplete')).toBeNull();
  });
});
