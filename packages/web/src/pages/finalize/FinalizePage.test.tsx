import type { ChecklistEntry, FinalizeView, ProjectHome } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api/client';
import { FinalizeBody } from './FinalizePage';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const AT = '2026-10-03T09:00:00.000Z';
const NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';
const entry = (over: Partial<ChecklistEntry> = {}): ChecklistEntry => ({
  itemId: 'questions-channels',
  threadId: 't-questions-channels',
  title: 'Which channels?',
  typeTitle: 'Questions',
  reason: 'Blocking question, not resolved.',
  ...over,
});
const CHANNELS = entry();
const LEAD = entry({ itemId: 'questions-lead', threadId: 't-questions-lead', title: 'How many days before?', reason: 'No answer yet; the default will be used.' });
const SNOOZE = entry({ itemId: 'ideas-snooze', threadId: 't-ideas-snooze', title: 'Let customers snooze a reminder', typeTitle: 'Ideas', reason: 'Parked.' });
const TWICE = entry({ itemId: 'concerns-twice', threadId: 't-concerns-twice', title: 'The job might run twice', typeTitle: 'Concerns', reason: 'Nobody has answered here.' });

/** The Finalize page's data: an empty checklist and no request, overridden as needed. */
function view(over: Partial<FinalizeView> = {}): FinalizeView {
  return {
    checklist: { blocking: [], defaults: [], parked: [], unreviewed: [], canStart: true },
    request: null,
    proposal: null,
    final: null,
    clones: [{ path: '/Users/you/acme-app', source: true }],
    name: 'restock-reminders',
    listening: null,
    changesSinceFinal: 0,
    ...over,
  };
}

/** The parts of the project home the page reads: the plan's path, and each thread's status. */
const HOME = {
  project: { source: { path: 'docs/specs/restock-reminders.md' } },
  inbox: [
    { threadId: 't-questions-channels', status: 'your_turn' },
    { threadId: 't-questions-lead', status: 'draft' },
    { threadId: 't-ideas-snooze', status: 'parked' },
  ],
} as unknown as ProjectHome;

function show(v: FinalizeView) {
  vi.spyOn(api, 'projectHome').mockResolvedValue(HOME);
  const finalize = vi.spyOn(api, 'finalize').mockResolvedValue(v);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FinalizeBody repo="acme-app" project="restock" />
    </QueryClientProvider>,
  );
  return finalize;
}

describe('the Finalize page', () => {
  it('lists what blocks Finalize, what uses its default, what is parked and what nobody reviewed', async () => {
    show(view({ checklist: { blocking: [CHANNELS], defaults: [{ ...LEAD, defaultValue: '3 days' }], parked: [SNOOZE], unreviewed: [TWICE], canStart: false } }));
    const blocking = await screen.findByTestId('checklist-blocking');
    expect(within(blocking).getByRole('heading').textContent).toBe('These block Finalize');
    const link = within(blocking).getByRole('link');
    expect(link.getAttribute('href')).toBe('/p/acme-app/restock/th/t-questions-channels');
    expect(link.textContent).toContain('Which channels?');
    expect(link.textContent).toContain('Blocking question, not resolved.');
    expect(await within(blocking).findByRole('img', { name: 'Your turn' })).toBeTruthy();
    const defaults = screen.getByTestId('checklist-defaults');
    expect(within(defaults).getByRole('heading').textContent).toBe('These will use their default');
    expect(defaults.textContent).toContain('How many days before?');
    expect(defaults.textContent).toContain('Default: 3 days');
    const parked = screen.getByTestId('checklist-parked');
    expect(within(parked).getByRole('heading').textContent).toBe('Parked: left out of the final');
    expect(within(parked).getByRole('img', { name: 'Parked' })).toBeTruthy();
    const unreviewed = screen.getByTestId('checklist-unreviewed');
    expect(within(unreviewed).getByRole('heading').textContent).toBe('Nobody has reviewed these');
    expect(unreviewed.textContent).toContain('The job might run twice');
    expect(unreviewed.textContent).toContain('Nobody has answered here.');
    expect(screen.queryByText('Nothing blocks Finalize.')).toBeNull();
    expect((screen.getByRole('button', { name: 'Start finalize' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('finalize-status')).toBeNull();
  });

  it('says when nothing blocks Finalize, and starts it', async () => {
    const finalize = show(view());
    const start = vi.spyOn(api, 'startFinalize').mockResolvedValue({ request: { id: 'f-1', state: 'requested', requestedAt: AT }, listening: null, message: NO_WINDOW });
    expect(await screen.findByText('Nothing blocks Finalize.')).toBeTruthy();
    expect(screen.getByTestId('finalize-checklist').querySelectorAll('section')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Start finalize' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith('acme-app', 'restock'));
    // The page asks again, so it shows the request the service just saved.
    await waitFor(() => expect(finalize).toHaveBeenCalledTimes(2));
  });

  it('says where the request is, and hides Start finalize while it runs', async () => {
    const requested = { id: 'f-1', state: 'requested' as const, requestedAt: AT };
    const cases: [FinalizeView, string][] = [
      [view({ request: requested, listening: 'waiting' }), 'Waiting for Claude to write the final.'],
      [view({ request: requested, listening: null }), NO_WINDOW],
      [view({ request: { ...requested, state: 'writing', pickedUpAt: AT, pickedUpBy: 'w-1' }, listening: 'busy' }), 'Claude is writing the final.'],
      [view({ request: { ...requested, state: 'writing', pickedUpAt: AT, pickedUpBy: 'w-1' }, listening: null }), NO_WINDOW],
    ];
    for (const [v, text] of cases) {
      show(v);
      expect((await screen.findByTestId('finalize-status')).textContent).toBe(text);
      expect(screen.queryByRole('button', { name: 'Start finalize' })).toBeNull();
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it('says the finalizer gave up, and Try again starts it again', async () => {
    show(view({ request: { id: 'f-1', state: 'failed', requestedAt: AT, failedAt: AT, reason: "The finalizer didn't send a final." } }));
    const start = vi
      .spyOn(api, 'startFinalize')
      .mockResolvedValue({ request: { id: 'f-2', state: 'requested', requestedAt: AT }, listening: 'waiting', message: 'Waiting for Claude to write the final.' });
    expect((await screen.findByTestId('finalize-status')).textContent).toBe("The finalizer didn't send a final.");
    expect(screen.queryByRole('button', { name: 'Start finalize' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith('acme-app', 'restock'));
  });

  it("offers Start finalize when Claude's final can't be read", async () => {
    const proposal = { at: AT, draftHash: 'f'.repeat(64), file: 'docs/final.proposed.md' as const, length: 63, assets: [] };
    show(view({ request: { id: 'f-1', state: 'proposed', requestedAt: AT, pickedUpAt: AT, pickedUpBy: 'w-1', proposal }, proposal: null }));
    expect(((await screen.findByRole('button', { name: 'Start finalize' })) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('finalize-status')).toBeNull();
  });

  it("shows why the service wouldn't start it", async () => {
    show(view());
    vi.spyOn(api, 'startFinalize').mockRejectedValue(new ApiError(409, 'Finalize is blocked:\n- Which channels?: Blocking question, not resolved.', null));
    fireEvent.click(await screen.findByRole('button', { name: 'Start finalize' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Finalize is blocked:\n- Which channels?: Blocking question, not resolved.');
  });

  it('reads Finalize again once there is a final', async () => {
    show(
      view({
        final: {
          exportedTo: { clone: '~/Source/acme-app', path: 'docs/specs/restock-reminders.final.md', at: AT, assets: [] },
          nextCommand: 'writing-plans docs/specs/restock-reminders.final.md',
        },
      }),
    );
    expect(await screen.findByRole('button', { name: 'Finalize again' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start finalize' })).toBeNull();
  });

  it('lets you cancel a request that is under way', async () => {
    show(view({ request: { id: 'f-1', state: 'writing', requestedAt: AT, pickedUpAt: AT, pickedUpBy: 'w-1' }, listening: 'busy' }));
    const discard = vi.spyOn(api, 'discardProposal').mockResolvedValue({ ok: true });
    expect((await screen.findByTestId('finalize-status')).textContent).toBe('Claude is writing the final.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(discard).toHaveBeenCalledWith('acme-app', 'restock'));
  });
});

describe('with a final from Claude', () => {
  it("shows Claude's final to review in place of Start finalize", async () => {
    show(
      view({
        request: {
          id: 'f-1',
          state: 'proposed',
          requestedAt: AT,
          pickedUpAt: AT,
          pickedUpBy: 'w-1',
          proposal: { at: AT, draftHash: 'f'.repeat(64), file: 'docs/final.proposed.md', length: 63, assets: [] },
        },
        proposal: { markdown: '# Restock reminders\n\nRemind customers before an item runs out.\n', stale: false, diff: null },
      }),
    );
    expect((await screen.findByTestId('proposal-preview')).textContent).toContain('Remind customers before an item runs out.');
    expect(screen.getByTestId('accept-target').textContent).toBe('/Users/you/acme-app/docs/specs/restock-reminders.final.md');
    expect(screen.queryByTestId('finalize-status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start finalize' })).toBeNull();
  });

  it("turns off a stale final's Finalize again while something blocks Finalize", async () => {
    show(
      view({
        checklist: { blocking: [CHANNELS], defaults: [], parked: [], unreviewed: [], canStart: false },
        request: {
          id: 'f-1',
          state: 'proposed',
          requestedAt: AT,
          pickedUpAt: AT,
          pickedUpBy: 'w-1',
          proposal: { at: AT, draftHash: 'f'.repeat(64), file: 'docs/final.proposed.md', length: 20, assets: [] },
        },
        proposal: { markdown: '# Restock reminders\n', stale: true, diff: null },
      }),
    );
    const again = (await screen.findByRole('button', { name: 'Finalize again' })) as HTMLButtonElement;
    expect(again.disabled).toBe(true);
    expect(within(screen.getByTestId('proposal')).getByText('1 item blocks Finalize')).toBeTruthy();
  });

  it('shows where the last final went, with Finalize again', async () => {
    show(
      view({
        final: {
          exportedTo: { clone: '~/Source/acme-app', path: 'docs/specs/restock-reminders.final.md', at: AT, assets: [] },
          nextCommand: 'writing-plans docs/specs/restock-reminders.final.md',
        },
        changesSinceFinal: 1,
      }),
    );
    expect((await screen.findByTestId('final-done')).textContent).toContain('1 change since the last final.');
    expect(screen.getByTestId('next-command').textContent).toBe('writing-plans docs/specs/restock-reminders.final.md');
    expect(screen.getByRole('button', { name: 'Finalize again' })).toBeTruthy();
  });
});
