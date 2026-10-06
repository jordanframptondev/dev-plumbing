import type { ProjectHome } from '@dev-plumbing/core/schemas';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectNav } from './ProjectNav';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('./visual/testkit')).routerMock(navigate));

afterEach(cleanup);

/** The parts of the project home the navigation reads: no types, the three documents, and the plan's version. */
const home = (version: { current: number; count: number }) =>
  ({
    summary: { counts: { yourTurn: 0 } },
    types: [],
    documents: { original: true, draft: true, final: false },
    version,
  }) as unknown as ProjectHome;

const links = () => screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]);

describe('ProjectNav documents', () => {
  it('lists Original and Draft plainly while the plan has one version', () => {
    render(<ProjectNav home={home({ current: 1, count: 1 })} repo="acme-app" project="restock" />);
    expect(links()).toEqual([
      ['Inbox', '/p/acme-app/restock'],
      ['Original', '/p/acme-app/restock/d/original'],
      ['Draft', '/p/acme-app/restock/d/draft'],
    ]);
    expect(screen.queryByText('Versions')).toBeNull();
  });

  it('says which version Original and Draft are, and adds Versions after them, once there is a v2', () => {
    render(<ProjectNav home={home({ current: 2, count: 2 })} repo="acme-app" project="restock" />);
    expect(links()).toEqual([
      ['Inbox', '/p/acme-app/restock'],
      ['Original (v2)', '/p/acme-app/restock/d/original'],
      ['Draft (v2)', '/p/acme-app/restock/d/draft'],
      ['Versions', '/p/acme-app/restock/versions'],
    ]);
    // Final isn't written yet, and has no version.
    expect(screen.getByText('Final')).toBeTruthy();
  });
});
