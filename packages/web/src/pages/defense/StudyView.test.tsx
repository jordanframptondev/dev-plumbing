import type { DiagramData, ThreadDetail } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api/client';
import { basisClass, severityClass } from './labels';
import { StudyView } from './StudyView';
import { defense, link, practice, withDefense, type DefenseView } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function show(v: DefenseView = withDefense()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StudyView view={v} repo="acme-app" project="restock" />
    </QueryClientProvider>,
  );
}

const part = (id: string) => screen.getByTestId(id);
const sent = (message: string) => ({ itemId: 'questions-who-can-change-the-lead-time', threadId: 't-questions-who-can-change-the-lead-time', typeId: 'questions', typeTitle: 'Questions', listening: null, message });

describe('Study', () => {
  it('shows the 13 sections in order, each with its number', () => {
    show();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
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
    // Contents scrolls to each one.
    expect(part('defense-section-security').id).toBe('defense-section-security');
    expect(part('defense-checklist').id).toBe('defense-checklist');
  });

  it('says how sure each statement is, in its own colour', () => {
    show();
    expect(within(part('defense-section-summary')).getByText('Known').className).toContain('text-ink-3');
    expect(within(part('defense-section-security')).getByText('Inferred').className).toContain('text-ink-2');
    expect(within(part('defense-section-security')).getByText('Unknown').className).toContain('text-amber');
    expect(within(part('defense-section-failure')).getByText('Verify before release').className).toContain('text-seal');
    expect([basisClass('known'), basisClass('inferred'), basisClass('unknown'), basisClass('verify')]).toEqual(['text-ink-3', 'text-ink-2', 'text-amber', 'text-seal']);
  });

  it('labels each release concern by severity, in its own colour', () => {
    show();
    const concerns = part('defense-concerns');
    expect(within(concerns).getByText('High').className).toContain('text-seal');
    expect(within(concerns).getByText('Informational').className).toContain('text-ink-3');
    expect(concerns.textContent).toContain('A double run spams customers.');
    expect(within(concerns).getByText('Verify before release')).toBeTruthy();
    expect(['critical', 'high', 'medium', 'low', 'info'].map((s) => severityClass(s as 'high'))).toEqual(['text-seal', 'text-seal', 'text-amber', 'text-ochre', 'text-ink-3']);
  });

  it('offers Send to Questions only on claims marked Unknown or Verify before release', () => {
    show();
    expect(within(part('defense-section-summary')).queryByTestId('send-to-plumbing')).toBeNull();
    expect(within(part('defense-section-diagram')).queryByTestId('send-to-plumbing')).toBeNull();
    // Security model: an Inferred claim, then an Unknown one.
    const security = within(part('defense-section-security')).getAllByRole('listitem');
    expect(within(security[0]!).queryByTestId('send-to-plumbing')).toBeNull();
    expect(within(security[1]!).getByTestId('send-to-plumbing').textContent).toBe('Send to Questions');
    expect(within(part('defense-section-failure')).getByTestId('send-to-plumbing').textContent).toBe('Send to Questions');
    expect(within(part('defense-section-unknowns')).getByTestId('send-to-plumbing').textContent).toBe('Send to Questions');
    // Every release concern can go to Concerns.
    expect(within(part('defense-concerns')).getAllByTestId('send-to-plumbing').map((b) => b.textContent)).toEqual(['Send to Concerns', 'Send to Concerns']);
  });

  it('sends a claim to Questions, and says Claude will suggest answers', async () => {
    show();
    const send = vi.spyOn(api, 'sendFromDefense').mockResolvedValue(sent('Added to Questions. Claude will suggest answers.'));
    const security = part('defense-section-security');
    fireEvent.click(within(security).getByTestId('send-to-plumbing'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', kind: 'claim', ref: 'security.1' }));
    expect((await within(security).findByRole('status')).textContent).toBe('Added to Questions. Claude will suggest answers.');
    expect((within(security).getByTestId('send-to-plumbing') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends a release concern to Concerns, and says why when it was refused', async () => {
    show();
    const send = vi.spyOn(api, 'sendFromDefense').mockRejectedValue(new ApiError(409, "There's no enabled Concerns type to send it to. Turn it on in Plumbing rules.", null));
    const concerns = part('defense-concerns');
    fireEvent.click(within(concerns).getAllByTestId('send-to-plumbing')[0]!);
    await waitFor(() => expect(send).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', kind: 'concern', ref: 'c1' }));
    expect((await within(concerns).findByRole('alert')).textContent).toBe("There's no enabled Concerns type to send it to. Turn it on in Plumbing rules.");
  });

  it('links a sent claim or concern to its thread in place of Send', () => {
    show(
      withDefense({
        sent: [
          link({ kind: 'claim', ref: 'security.1', itemId: 'questions-lead', threadId: 't-questions-lead', typeId: 'questions', title: 'Who can change the lead time.' }),
          link({ kind: 'concern', ref: 'c1', itemId: 'concerns-double-run', threadId: 't-concerns-double-run', typeId: 'concerns', title: 'A double run spams customers.' }),
        ],
      }),
    );
    const security = part('defense-section-security');
    expect(within(security).queryByTestId('send-to-plumbing')).toBeNull();
    expect(within(security).getByRole('link', { name: 'In Questions ›' }).getAttribute('href')).toBe('/p/acme-app/restock/th/t-questions-lead');
    const concerns = part('defense-concerns');
    expect(within(concerns).getByRole('link', { name: 'In Concerns ›' }).getAttribute('href')).toBe('/p/acme-app/restock/th/t-concerns-double-run');
    // The informational one hasn't been sent.
    expect(within(concerns).getAllByTestId('send-to-plumbing')).toHaveLength(1);
    // Failure analysis's claim is still to send.
    expect(within(part('defense-section-failure')).getByTestId('send-to-plumbing')).toBeTruthy();
  });

  it('lists the threads already asked about a part under it', () => {
    show(
      withDefense({
        asked: [
          link(),
          link({ kind: 'question', ref: 'q1', itemId: 'defense-a-marker', threadId: 't-defense-a-marker', title: 'Is a marker enough?', status: 'your_turn' }),
        ],
      }),
    );
    const security = part('defense-section-security');
    const thread = within(security).getByRole('link', { name: /Who can change it\?/ });
    expect(thread.getAttribute('href')).toBe('/p/acme-app/restock/th/t-defense-who-can-change-it');
    expect(within(thread).getByRole('img', { name: 'With Claude' })).toBeTruthy();
    expect(within(part('defense-section-summary')).queryByRole('link')).toBeNull();
    const questions = part('defense-questions');
    expect(within(questions).getByRole('link', { name: /Is a marker enough\?/ }).getAttribute('href')).toBe('/p/acme-app/restock/th/t-defense-a-marker');
    // Every section, question and concern can be asked about.
    expect(screen.getAllByTestId('ask-claude')).toHaveLength(10 + 3 + 2);
  });

  it('shows the questions with their answers, a table as a table and as cards, and the text diagram', () => {
    show();
    const questions = part('defense-questions');
    expect(questions.textContent).toContain('What happens if the job runs twice?');
    expect(questions.textContent).toContain('Every reminder goes out again, so it needs a sent marker.');
    const data = part('defense-section-data');
    expect(within(data).getByText('Source of truth')).toBeTruthy();
    const table = within(data).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Data', 'Owner']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    // On a phone each row is a card, with the column names beside the values.
    expect(data.querySelectorAll('dl')).toHaveLength(2);
    expect(data.querySelector('dl')?.textContent).toBe('DataRemindersOwnerreminders table');
    expect(within(part('defense-section-diagram')).getByTestId('defense-diagram').textContent).toBe('job --> sms');
  });

  it('draws the diagram item section 2 names, with a link to it', async () => {
    const data: DiagramData = { kind: 'system', groups: [], nodes: [{ id: 'job', label: 'Reminder job', status: 'new' }], edges: [] };
    const detail = {
      item: { id: 'architecture-system', title: 'System view', data },
      type: { id: 'architecture', title: 'Architecture', screen: 'diagram' },
    } as unknown as ThreadDetail;
    const thread = vi.spyOn(api, 'thread').mockResolvedValue(detail);
    const d = defense();
    show(withDefense({ defense: { ...d, sections: d.sections.map((s) => (s.id === 'diagram' ? { ...s, diagramItemId: 'architecture-system' } : s)) } }));
    const drawn = await screen.findByTestId('defense-diagram-item');
    expect(thread).toHaveBeenCalledWith('acme-app', 'restock', 't-architecture-system');
    expect((await within(drawn).findAllByTestId('diagram-node', {}, { timeout: 10_000 })).map((n) => n.getAttribute('data-node'))).toEqual(['job']);
    expect(within(drawn).getByRole('link', { name: 'System view ›' }).getAttribute('href')).toBe('/p/acme-app/restock/t/architecture?item=architecture-system');
  });

  it('shows the checklist with what you ticked in Practice, read-only', () => {
    show(withDefense({ practice: practice({ ticks: ['k2'] }) }));
    const checklist = part('defense-checklist');
    expect(checklist.textContent).toContain('1 of 4 ticked');
    expect(within(checklist).getAllByRole('img', { name: 'Ticked' })).toHaveLength(1);
    expect(within(checklist).getAllByRole('img', { name: 'Not ticked' })).toHaveLength(3);
    expect(within(checklist).queryByRole('checkbox')).toBeNull();
  });

  it('says None. with no release concerns', () => {
    show(withDefense({ defense: defense({ concerns: [] }) }));
    expect(part('defense-concerns').textContent).toBe('11. Release concernsNone.');
  });
});
