import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api/client';
import { AskClaude } from './AskClaude';
import { link } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockClear();
});

function show(asked = [link()]) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AskClaude repo="acme-app" project="restock" defenseId="w-1" kind="section" partRef="security" asked={asked} />
    </QueryClientProvider>,
  );
}

describe('Ask Claude about this', () => {
  it('sends your question about the part, then opens its thread', async () => {
    show([]);
    const ask = vi.spyOn(api, 'askAboutDefense').mockResolvedValue({ resolved: 0, sent: 1, skipped: [], listening: 'waiting', message: 'Sent 1 thread to Claude.', threadId: 't-defense-who-signs-off' });
    expect(screen.queryByTestId('ask-question')).toBeNull();
    fireEvent.click(screen.getByTestId('ask-claude'));
    const question = screen.getByLabelText('Your question') as HTMLTextAreaElement;
    expect(question.getAttribute('placeholder')).toBe('What do you want to ask?');
    const send = screen.getByTestId('ask-send') as HTMLButtonElement;
    expect(send.textContent).toBe('Send');
    expect(send.disabled).toBe(true);
    // Send is never the page's main action.
    expect(send.className).not.toContain('bg-button');
    fireEvent.change(question, { target: { value: 'Who signs off on a change to the lead time?' } });
    fireEvent.click(send);
    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', kind: 'section', ref: 'security', question: 'Who signs off on a change to the lead time?' }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/p/$repo/$project/th/$thread', params: { repo: 'acme-app', project: 'restock', thread: 't-defense-who-signs-off' } }));
  });

  it('lists the threads already asked about this part, and only those', () => {
    show([link(), link({ ref: 'summary', threadId: 't-defense-other', title: 'Something else?' })]);
    const thread = screen.getByRole('link', { name: /Who can change it\?/ });
    expect(thread.getAttribute('href')).toBe('/p/acme-app/restock/th/t-defense-who-can-change-it');
    expect(screen.getByRole('img', { name: 'With Claude' })).toBeTruthy();
    expect(screen.queryByText('Something else?')).toBeNull();
  });

  it('says why the question was refused, and Cancel closes the form', async () => {
    show([]);
    vi.spyOn(api, 'askAboutDefense').mockRejectedValue(new ApiError(409, 'The Whiteboard Defense changed since this page loaded. Reload it.', null));
    fireEvent.click(screen.getByTestId('ask-claude'));
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Why?' } });
    fireEvent.click(screen.getByTestId('ask-send'));
    expect((await screen.findByRole('alert')).textContent).toBe('The Whiteboard Defense changed since this page loaded. Reload it.');
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('ask-question')).toBeNull();
    expect(screen.getByTestId('ask-claude')).toBeTruthy();
  });
});
