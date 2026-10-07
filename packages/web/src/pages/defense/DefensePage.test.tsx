import type { WhiteboardView } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api/client';
import { formatUpdated } from '../../lib/time';
import { DefenseBody, type DefenseMode } from './DefensePage';
import { AT, defense, EXPORT_PATH, view } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockClear();
});

const NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';
const WRITING = "Claude is writing the Whiteboard Defense. Threads you send now wait until it's done.";
const GAVE_UP = "The whiteboard subagent didn't send a Whiteboard Defense.";
const INTRO = "Claude writes a defense of this plan: how it works, what could fail and what's still unknown. Then you study it and practise explaining it.";
const REQUESTED = { id: 'g-1', state: 'requested' as const, requestedAt: AT };
const PICKED_UP = { ...REQUESTED, state: 'writing' as const, pickedUpAt: AT, pickedUpBy: 'w-1' };
const FAILED = { ...PICKED_UP, state: 'failed' as const, failedAt: AT, reason: GAVE_UP };

function show(v: WhiteboardView, mode: DefenseMode = 'study') {
  const whiteboard = vi.spyOn(api, 'whiteboard').mockResolvedValue(v);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DefenseBody repo="acme-app" project="restock" mode={mode} />
    </QueryClientProvider>,
  );
  return whiteboard;
}

const primaries = () => screen.getAllByRole('button').filter((b) => b.className.includes('bg-button'));

describe('the Whiteboard Defense page', () => {
  it('says what a defense is before there is one, and Generate is the main action', async () => {
    const whiteboard = show(view({ defense: null, practice: null }));
    const generate = vi.spyOn(api, 'generateWhiteboard').mockResolvedValue({ request: REQUESTED, listening: null, message: NO_WINDOW });
    expect(await screen.findByText(INTRO)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Whiteboard Defense' })).toBeTruthy();
    expect(screen.getByText('If you ship it, you should be able to explain it.')).toBeTruthy();
    const button = screen.getByTestId('defense-generate');
    expect(button.textContent).toBe('Generate');
    expect(button.className).toContain('bg-button');
    // Nothing to study, practise or export yet.
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByTestId('defense-meta')).toBeNull();
    expect(screen.queryByTestId('defense-export')).toBeNull();
    expect(screen.queryByTestId('defense-status')).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(generate).toHaveBeenCalledWith('acme-app', 'restock'));
    // The page asks again, so it shows the request the service just saved.
    await waitFor(() => expect(whiteboard).toHaveBeenCalledTimes(2));
  });

  it('says where the request is, and offers Cancel in place of Generate while it runs', async () => {
    const cases: [WhiteboardView, string][] = [
      [view({ defense: null, practice: null, request: REQUESTED, listening: 'waiting', canGenerate: false }), 'Waiting for Claude to write the Whiteboard Defense.'],
      [view({ defense: null, practice: null, request: REQUESTED, listening: null, canGenerate: false }), NO_WINDOW],
      [view({ request: PICKED_UP, listening: 'busy', canGenerate: false }), WRITING],
      [view({ request: PICKED_UP, listening: null, canGenerate: false }), NO_WINDOW],
    ];
    for (const [v, text] of cases) {
      show(v);
      const status = await screen.findByTestId('defense-status');
      expect(status.textContent).toBe(text);
      expect(status.className).toContain('text-ink-2');
      expect(screen.queryByTestId('defense-generate')).toBeNull();
      expect(screen.getByTestId('defense-cancel').textContent).toBe('Cancel');
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('cancels a request that is under way', async () => {
    const whiteboard = show(view({ request: PICKED_UP, listening: 'busy', canGenerate: false }));
    const cancel = vi.spyOn(api, 'cancelWhiteboard').mockResolvedValue({ ok: true });
    fireEvent.click(await screen.findByTestId('defense-cancel'));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('acme-app', 'restock'));
    await waitFor(() => expect(whiteboard).toHaveBeenCalledTimes(2));
  });

  it('says the subagent gave up, and Try again is the main action', async () => {
    show(view({ request: FAILED }));
    const generate = vi.spyOn(api, 'generateWhiteboard').mockResolvedValue({ request: REQUESTED, listening: 'waiting', message: 'Waiting for Claude to write the Whiteboard Defense.' });
    const status = await screen.findByTestId('defense-status');
    expect(status.textContent).toBe(GAVE_UP);
    expect(status.className).toContain('text-seal');
    const button = screen.getByTestId('defense-generate');
    expect(button.textContent).toBe('Try again');
    expect(button.className).toContain('bg-button');
    expect(screen.queryByTestId('defense-cancel')).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(generate).toHaveBeenCalledWith('acme-app', 'restock'));
  });

  it('dismisses a failed request, leaving the defense as it was', async () => {
    const whiteboard = show(view({ request: FAILED }));
    const cancel = vi.spyOn(api, 'cancelWhiteboard').mockResolvedValue({ ok: true });
    const dismiss = await screen.findByTestId('defense-dismiss');
    expect(dismiss.textContent).toBe('Dismiss');
    // Quiet, beside Try again, which stays the main action.
    expect(dismiss.className).not.toContain('bg-button');
    expect(primaries().map((b) => b.textContent)).toEqual(['Try again']);
    fireEvent.click(dismiss);
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('acme-app', 'restock'));
    await waitFor(() => expect(whiteboard).toHaveBeenCalledTimes(2));
    // Nothing to dismiss without a failed request.
    cleanup();
    show(view());
    await screen.findByTestId('defense-generate');
    expect(screen.queryByTestId('defense-dismiss')).toBeNull();
  });

  it('says what the defense is based on and why its level, and Regenerate steps back while it is current', async () => {
    show(view());
    expect((await screen.findByTestId('defense-meta')).textContent).toBe(`Level 2 · Standard · Based on the draft (v1) · Generated ${formatUpdated(AT)}`);
    expect(screen.getByText('It sends messages to customers.')).toBeTruthy();
    expect(screen.getByText('It adds a daily job.')).toBeTruthy();
    expect(screen.queryByTestId('defense-stale')).toBeNull();
    expect(screen.queryByText(INTRO)).toBeNull();
    expect(screen.getByTestId('defense-generate').textContent).toBe('Regenerate');
    // Nothing needs doing, so nothing on the page is the main action.
    expect(primaries()).toHaveLength(0);
  });

  it('names a final it was based on, and its level', async () => {
    show(view({ defense: defense({ level: 3, basedOn: { kind: 'plan', doc: 'final', version: 2, inputsHash: 'f'.repeat(64) } }) }));
    expect((await screen.findByTestId('defense-meta')).textContent).toBe(`Level 3 · High risk · Based on the final (v2) · Generated ${formatUpdated(AT)}`);
  });

  it('says when it is out of date, and makes Regenerate the one main action', async () => {
    show(view({ stale: 'Out of date: the plan changed since this was generated.' }));
    const stale = await screen.findByTestId('defense-stale');
    expect(stale.textContent).toBe('Out of date: the plan changed since this was generated.');
    expect(stale.className).toContain('text-seal');
    expect(primaries().map((b) => b.textContent)).toEqual(['Regenerate']);
  });

  it("won't generate while the plan is importing, and says why", async () => {
    const refusal = "The plan is still importing. Generate the Whiteboard Defense once that's done.";
    show(view({ defense: null, practice: null, canGenerate: false, generateRefusal: refusal }));
    const button = (await screen.findByTestId('defense-generate')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(refusal)).toBeTruthy();
  });

  it("shows why the service wouldn't generate it", async () => {
    show(view({ defense: null, practice: null }));
    vi.spyOn(api, 'generateWhiteboard').mockRejectedValue(new ApiError(409, 'The Whiteboard Defense is already being written.', null));
    fireEvent.click(await screen.findByTestId('defense-generate'));
    expect((await screen.findByRole('alert')).textContent).toBe('The Whiteboard Defense is already being written.');
  });

  it('switches between Study and Practice through the address', async () => {
    show(view());
    const tabs = await screen.findByRole('tablist', { name: 'Whiteboard Defense mode' });
    expect(within(tabs).getByRole('tab', { name: 'Study' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Practice' }));
    expect(navigate).toHaveBeenCalledWith({ to: '/p/$repo/$project/defense', params: { repo: 'acme-app', project: 'restock' }, search: { mode: 'practice' } });
    cleanup();
    show(view(), 'practice');
    expect((await screen.findByRole('tab', { name: 'Practice' })).getAttribute('aria-selected')).toBe('true');
  });

  it('starts Study with the contents, all 13 parts in order', async () => {
    show(view());
    const contents = await screen.findByRole('navigation', { name: 'Contents' });
    const links = within(contents).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual([
      '1. Executive summary',
      '2. Whiteboard diagram',
      '3. System walkthrough',
      '4. Data and state',
      '5. Security model',
      '6. Failure analysis',
      '7. Dependencies and tradeoffs',
      '8. Complexity review',
      '9. Production readiness',
      '10. Questions the engineer should be able to answer',
      '11. Release concerns',
      '12. Unknowns',
      '13. Checklist',
    ]);
    expect(links[4]!.getAttribute('href')).toBe('#defense-section-security');
    expect(links[9]!.getAttribute('href')).toBe('#defense-questions');
    expect(links[12]!.getAttribute('href')).toBe('#defense-checklist');
  });
});

describe('Export .md', () => {
  const CLONES = [
    { path: '/Users/you/acme-app', source: true },
    { path: '/Users/you/acme-app-review', source: false },
  ];

  it('exports into the chosen clone, the source first, and says where it went', async () => {
    show(view({ clones: CLONES }));
    const exportDefense = vi.spyOn(api, 'exportDefense').mockResolvedValue({ exportedTo: { clone: '~/acme-app-review', path: EXPORT_PATH, at: AT } });
    const form = await screen.findByTestId('defense-export');
    const select = within(form).getByLabelText('Export into') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['/Users/you/acme-app (source)', '/Users/you/acme-app-review']);
    expect(select.value).toBe('/Users/you/acme-app');
    const target = within(form).getByTestId('export-target');
    expect(target.textContent).toBe(`/Users/you/acme-app/${EXPORT_PATH}`);
    expect(within(form).queryByText('Replaces the file there.')).toBeNull();
    fireEvent.change(select, { target: { value: '/Users/you/acme-app-review' } });
    expect(target.textContent).toBe(`/Users/you/acme-app-review/${EXPORT_PATH}`);
    const button = within(form).getByRole('button', { name: 'Export .md' });
    expect(button.className).not.toContain('bg-button');
    fireEvent.click(button);
    await waitFor(() => expect(exportDefense).toHaveBeenCalledWith('acme-app', 'restock', '/Users/you/acme-app-review'));
    expect((await within(form).findByTestId('defense-exported')).textContent).toBe(`Exported to ~/acme-app-review/${EXPORT_PATH}.`);
    expect(within(form).getByText('Replaces the file there.')).toBeTruthy();
  });

  it('says where the last export went, and that the next one replaces it', async () => {
    show(view({ defense: defense({ exportedTo: { clone: '~/Source/acme-app', path: EXPORT_PATH, at: AT } }) }));
    expect((await screen.findByTestId('defense-exported')).textContent).toBe(`Exported to ~/Source/acme-app/${EXPORT_PATH}.`);
    expect(screen.getByText('Replaces the file there.')).toBeTruthy();
  });

  it('shows why Export was refused', async () => {
    show(view());
    vi.spyOn(api, 'exportDefense').mockRejectedValue(new ApiError(400, "/Users/you/acme-app isn't a clone of acme-app.", null));
    fireEvent.click(await screen.findByRole('button', { name: 'Export .md' }));
    expect((await screen.findByRole('alert')).textContent).toBe("/Users/you/acme-app isn't a clone of acme-app.");
  });

  it("says so when none of the project's clones is on this Mac", async () => {
    show(view({ clones: [] }));
    expect(await screen.findByText('None of the clones this project was opened from is on this Mac.')).toBeTruthy();
    expect(screen.queryByLabelText('Export into')).toBeNull();
    expect((screen.getByRole('button', { name: 'Export .md' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
