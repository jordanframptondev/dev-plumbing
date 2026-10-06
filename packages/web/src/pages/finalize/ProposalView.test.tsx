import type { FinalizeView } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import Markdown from 'react-markdown';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { FinalDone, MARKDOWN_COMPONENTS, ProposalView } from './ProposalView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const AT = '2026-10-03T09:00:00.000Z';
const NEXT = 'writing-plans docs/specs/restock-reminders.final.md';
const EXPORTED = { clone: '~/Source/acme-app', path: 'docs/specs/restock-reminders.final.md', at: AT, assets: ['ui-settings.after.html'] };
const STALE = 'The draft changed since Claude wrote this. Finalize again.';
const MARKDOWN = [
  '# Restock reminders',
  '',
  '## 4. Architecture',
  '',
  '```mermaid',
  'flowchart LR',
  '  n_job["Daily job"] --> n_sms["SMS provider"]',
  '```',
  '',
  '## 6. UI changes',
  '',
  'A restock card on the reminders page. [After mockup](restock-reminders.assets/ui-settings.after.html)',
  '',
  '```ts',
  'const days = 3;',
  '```',
  '',
].join('\n');

const proposal = (over: Partial<NonNullable<FinalizeView['proposal']>> = {}): NonNullable<FinalizeView['proposal']> => ({ markdown: MARKDOWN, stale: false, diff: null, ...over });

function show(over: Partial<ComponentProps<typeof ProposalView>> = {}) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProposalView
        repo="acme-app"
        project="restock"
        proposal={proposal()}
        clones={[{ path: '/Users/you/acme-app', source: true }]}
        name="restock-reminders"
        sourcePath="docs/specs/restock-reminders.md"
        canStart
        blockingCount={0}
        {...over}
      />
    </QueryClientProvider>,
  );
}

describe('ProposalView', () => {
  it('previews the final, with Mermaid as code under a small caption', () => {
    show();
    const preview = screen.getByTestId('proposal-preview');
    const mermaid = within(preview).getAllByTestId('mermaid-block');
    expect(mermaid).toHaveLength(1);
    expect(within(mermaid[0]!).getByText('Mermaid')).toBeTruthy();
    expect(mermaid[0]!.querySelector('code')?.textContent).toContain('flowchart LR');
    // The other code block is a plain one.
    expect(preview.querySelectorAll('pre')).toHaveLength(2);
    // The mockup files are only in the repo copy, so the link is text here.
    expect(within(preview).getByTitle('Opens from the repo copy.').textContent).toBe('After mockup');
    expect(screen.getByRole('heading', { name: 'Preview' })).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('switches to the changes since the last final, when there was one', () => {
    show({ proposal: proposal({ diff: [{ kind: 'removed', text: 'Send by SMS.\n' }, { kind: 'added', text: 'Send by SMS and email.\n' }] }) });
    expect(screen.queryByRole('heading', { name: 'Preview' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Changes since the last final' }));
    expect(screen.queryByTestId('proposal-preview')).toBeNull();
    const diff = screen.getByTestId('proposal-diff');
    expect(diff.textContent).toContain('+ Send by SMS and email.');
    expect(diff.textContent).toContain('− Send by SMS.');
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByTestId('proposal-preview')).toBeTruthy();
  });

  it('copies into the chosen clone, the source first, and shows where the file goes', async () => {
    const accept = vi.spyOn(api, 'acceptFinal').mockResolvedValue({ exportedTo: EXPORTED, nextCommand: NEXT });
    show({ clones: [{ path: '/Users/you/acme-app', source: true }, { path: '/Users/you/acme-app-review', source: false }] });
    const select = screen.getByLabelText('Copy into') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['/Users/you/acme-app (source)', '/Users/you/acme-app-review']);
    expect(select.value).toBe('/Users/you/acme-app');
    const target = screen.getByTestId('accept-target');
    expect(target.textContent).toBe('/Users/you/acme-app/docs/specs/restock-reminders.final.md');
    fireEvent.change(select, { target: { value: '/Users/you/acme-app-review' } });
    expect(target.textContent).toBe('/Users/you/acme-app-review/docs/specs/restock-reminders.final.md');
    fireEvent.click(within(screen.getByTestId('accept-form')).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith('acme-app', 'restock', '/Users/you/acme-app-review'));
  });

  it('shows why Accept was refused', async () => {
    vi.spyOn(api, 'acceptFinal').mockRejectedValue(new Error("/Users/you/acme-app isn't a clone of acme-app."));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect((await screen.findByRole('alert')).textContent).toBe("/Users/you/acme-app isn't a clone of acme-app.");
  });

  it("won't accept a final written for an older draft, and offers Finalize again", async () => {
    const accept = vi.spyOn(api, 'acceptFinal').mockResolvedValue({ exportedTo: EXPORTED, nextCommand: NEXT });
    const start = vi
      .spyOn(api, 'startFinalize')
      .mockResolvedValue({ request: { id: 'f-2', state: 'requested', requestedAt: AT }, listening: 'waiting', message: 'Waiting for Claude to write the final.' });
    show({ proposal: proposal({ stale: true }) });
    expect(screen.getByText(STALE)).toBeTruthy();
    expect(screen.queryByText(/block Finalize/)).toBeNull();
    const acceptButton = screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement;
    expect(acceptButton.disabled).toBe(true);
    fireEvent.click(acceptButton);
    fireEvent.click(screen.getByRole('button', { name: 'Finalize again' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith('acme-app', 'restock'));
    expect(accept).not.toHaveBeenCalled();
  });

  it('turns Finalize again off on a stale final while something blocks Finalize, and says what', () => {
    const start = vi.spyOn(api, 'startFinalize');
    show({ proposal: proposal({ stale: true }), canStart: false, blockingCount: 2 });
    const again = screen.getByRole('button', { name: 'Finalize again' }) as HTMLButtonElement;
    expect(again.disabled).toBe(true);
    expect(screen.getByText('2 items block Finalize')).toBeTruthy();
    fireEvent.click(again);
    expect(start).not.toHaveBeenCalled();
  });

  it('asks before it discards', async () => {
    const discard = vi.spyOn(api, 'discardProposal').mockResolvedValue({ ok: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(discard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(discard).toHaveBeenCalledWith('acme-app', 'restock'));
    expect(confirm).toHaveBeenCalledWith('Discard this final? Finalize again writes a new one.');
  });

  it("says so when none of the project's clones is on this Mac", () => {
    show({ clones: [] });
    expect(screen.getByText('None of the clones this project was opened from is on this Mac.')).toBeTruthy();
    expect(screen.queryByLabelText('Copy into')).toBeNull();
    expect((screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('FinalDone', () => {
  it('says where the final went and how much changed since, and copies the next command', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<FinalDone final={{ exportedTo: EXPORTED, nextCommand: NEXT }} changesSinceFinal={2} planVersionSinceFinal={null} />);
    const done = screen.getByTestId('final-done');
    expect(done.textContent).toContain('Finalized');
    expect(done.textContent).toContain('Copied to ~/Source/acme-app/docs/specs/restock-reminders.final.md');
    expect(done.textContent).toContain('2 changes since the last final.');
    expect(screen.getByRole('heading', { name: 'Next' })).toBeTruthy();
    expect(screen.getByTestId('next-command').textContent).toBe(NEXT);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(NEXT);
  });

  it('says when nothing changed since the last final', () => {
    render(<FinalDone final={{ exportedTo: EXPORTED, nextCommand: NEXT }} changesSinceFinal={0} planVersionSinceFinal={null} />);
    expect(screen.getByTestId('final-done').textContent).toContain('No changes since the last final.');
    expect(screen.queryByTestId('plan-version-since-final')).toBeNull();
  });

  it('says when a newer version of the plan came in since the last final', () => {
    render(<FinalDone final={{ exportedTo: EXPORTED, nextCommand: NEXT }} changesSinceFinal={0} planVersionSinceFinal={2} />);
    expect(screen.getByTestId('plan-version-since-final').textContent).toBe("The plan's v2 came in since the last final.");
  });
});

describe('MARKDOWN_COMPONENTS', () => {
  it('shows a mockup link as text, since the mockup files are only in the repo copy, and keeps other links', () => {
    const markdown = [
      '[After mockup](restock-reminders.assets/ui-settings.after.html)',
      '[Before mockup](docs/specs/restock-reminders.assets/ui-settings.before.html)',
      '[The plan](restock-reminders.md)',
      '[On GitHub](https://github.com/acme/acme-app/blob/main/docs/specs/restock-reminders.assets/ui-settings.after.html)',
    ].join('\n\n');
    render(<Markdown components={MARKDOWN_COMPONENTS}>{markdown}</Markdown>);
    for (const name of ['After mockup', 'Before mockup']) {
      expect(screen.queryByRole('link', { name })).toBeNull();
      expect(screen.getByText(name).getAttribute('title')).toBe('Opens from the repo copy.');
    }
    expect(screen.getByRole('link', { name: 'The plan' }).getAttribute('href')).toBe('restock-reminders.md');
    expect(screen.getByRole('link', { name: 'On GitHub' }).getAttribute('href')).toMatch(/^https:\/\/github\.com\//);
  });
});
