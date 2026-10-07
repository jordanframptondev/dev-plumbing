import type { ProjectHome } from '@dev-plumbing/core/schemas';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectNav } from './ProjectNav';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('./visual/testkit')).routerMock(navigate));

afterEach(cleanup);

const CURRENT: ProjectHome['defense'] = { ready: true, stale: false, state: null };

/**
 * The parts of the project home the navigation reads: no types, the three documents, the plan's version, and the
 * Whiteboard Defense (saved and current unless given).
 */
const home = (version: { current: number; count: number }, defense = CURRENT) =>
  ({
    summary: { counts: { yourTurn: 0 } },
    types: [],
    documents: { original: true, draft: true, final: false },
    version,
    defense,
  }) as unknown as ProjectHome;

const links = () => screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')]);

describe('ProjectNav documents', () => {
  it('lists Original and Draft plainly while the plan has one version', () => {
    render(<ProjectNav home={home({ current: 1, count: 1 })} repo="acme-app" project="restock" />);
    expect(links()).toEqual([
      ['Inbox', '/p/acme-app/restock'],
      ['Original', '/p/acme-app/restock/d/original'],
      ['Draft', '/p/acme-app/restock/d/draft'],
      ['Whiteboard Defense', '/p/acme-app/restock/defense'],
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
      ['Whiteboard Defense', '/p/acme-app/restock/defense'],
    ]);
    // Final isn't written yet, and has no version.
    expect(screen.getByText('Final')).toBeTruthy();
  });
});

describe('ProjectNav review', () => {
  const ONE = { current: 1, count: 1 };
  const defenseLink = () => screen.getByTestId('nav-defense');

  it('says Not yet before a Whiteboard Defense is saved', () => {
    render(<ProjectNav home={home(ONE, { ready: false, stale: false, state: null })} repo="acme-app" project="restock" />);
    expect(defenseLink().getAttribute('href')).toBe('/p/acme-app/restock/defense');
    expect(defenseLink().textContent).toBe('Whiteboard DefenseNot yet');
  });

  it('says Writing… while one is asked for or being written, saved before or not', () => {
    for (const d of [
      { ready: false, stale: false, state: 'requested' as const },
      { ready: true, stale: true, state: 'writing' as const },
    ]) {
      render(<ProjectNav home={home(ONE, d)} repo="acme-app" project="restock" />);
      expect(defenseLink().textContent).toBe('Whiteboard DefenseWriting…');
      cleanup();
    }
  });

  it('says Out of date once the plan changed since it was generated', () => {
    render(<ProjectNav home={home(ONE, { ready: true, stale: true, state: null })} repo="acme-app" project="restock" />);
    expect(defenseLink().textContent).toBe('Whiteboard DefenseOut of date');
    expect(screen.getByText('Out of date').className).toContain('text-ink-3');
  });

  it('says nothing more while it is current', () => {
    render(<ProjectNav home={home(ONE)} repo="acme-app" project="restock" />);
    expect(defenseLink().textContent).toBe('Whiteboard Defense');
  });
});
