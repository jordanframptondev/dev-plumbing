import type { Anchor } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import { AnchorForm } from './AnchorForm';
import { DataProblem } from './DataProblem';
import { ItemDataView } from './ItemDataView';
import { OtherItems } from './OtherItems';
import { row } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('./testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  navigate.mockReset();
});

const withQueries = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('AnchorForm', () => {
  const anchor: Anchor = { itemId: 'architecture-system', kind: 'node', ref: 'job', label: 'Reminder job' };

  it('starts a thread about the box with your message, then opens it', async () => {
    const addItem = vi.spyOn(api, 'addItem').mockResolvedValue({ resolved: 0, sent: 1, skipped: [], listening: null, message: 'Saved.', threadId: 't-architecture-about-reminder-job' });
    withQueries(<AnchorForm repo="acme-app" project="restock" type="architecture" anchor={anchor} onDone={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveProperty('value', 'About Reminder job');
    expect(screen.getByRole('button', { name: 'Add and send' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Your message' }), { target: { value: 'Does it retry a failed send?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add and send' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/p/$repo/$project/th/$thread', params: { repo: 'acme-app', project: 'restock', thread: 't-architecture-about-reminder-job' } }));
    expect(addItem).toHaveBeenCalledWith('acme-app', 'restock', { type: 'architecture', title: 'About Reminder job', text: 'Does it retry a failed send?', anchor });
  });

  it('shows why the service refused, and Cancel closes it', async () => {
    vi.spyOn(api, 'addItem').mockRejectedValue(new Error('Pins start an item of the same plumbing type.'));
    const onDone = vi.fn();
    withQueries(<AnchorForm repo="acme-app" project="restock" type="ui" anchor={anchor} onDone={onDone} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Your message' }), { target: { value: 'Why?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add and send' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Pins start an item of the same plumbing type.');
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDone).toHaveBeenCalled();
  });
});

describe('DataProblem', () => {
  it('says the drawing could not be shown, lists why, and keeps the raw data and the thread', () => {
    render(<DataProblem title="Data flow" problems={['nodes: Expected array, received string']} data={{ kind: 'data_flow', nodes: 'oops' }} threadId="t-architecture-data-flow" repo="acme-app" project="restock" />);
    expect(screen.getByRole('heading', { name: 'Data flow' })).toBeTruthy();
    expect(screen.getByText("This item's drawing couldn't be shown")).toBeTruthy();
    expect(screen.getByText('nodes: Expected array, received string')).toBeTruthy();
    expect(screen.getByText('Raw data')).toBeTruthy();
    expect(screen.getByText(/"nodes": "oops"/).tagName).toBe('PRE');
    expect(screen.getByRole('link', { name: 'Open thread →' }).getAttribute('href')).toBe('/p/acme-app/restock/th/t-architecture-data-flow');
  });

  it('leaves out the title and thread link when not given, as in the thread view', () => {
    render(<DataProblem problems={[]} data={null} repo="acme-app" project="restock" />);
    expect(screen.getByText("This item's drawing couldn't be shown")).toBeTruthy();
    expect(screen.getByText('No data')).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('OtherItems', () => {
  it('lists each item with its status, summary and thread link', () => {
    render(<OtherItems rows={[row(), row({ id: 'architecture-later', threadId: 't-architecture-later', title: 'Later', summary: 'Not drawn yet.', status: 'your_turn' })]} repo="acme-app" project="restock" title="Other items" />);
    const items = screen.getAllByTestId('other-item');
    expect(items.map((a) => a.getAttribute('href'))).toEqual(['/p/acme-app/restock/th/t-architecture-system', '/p/acme-app/restock/th/t-architecture-later']);
    expect(items[1]!.textContent).toContain('Not drawn yet.');
    expect(screen.getByRole('img', { name: 'Your turn' })).toBeTruthy();
    expect(screen.getByText('Other items')).toBeTruthy();
  });

  it('says which version of the plan removed an item', () => {
    render(<OtherItems rows={[row({ status: 'parked', removedIn: 2 }), row({ id: 'architecture-later', threadId: 't-architecture-later', title: 'Later' })]} repo="acme-app" project="restock" />);
    const [removed, kept] = screen.getAllByTestId('other-item');
    expect(removed!.textContent).toContain('Jobs, notifications and tables. · removed from the plan in v2');
    expect(kept!.textContent).not.toContain('removed from the plan');
  });

  it('renders nothing for no rows', () => {
    const { container } = render(<OtherItems rows={[]} repo="acme-app" project="restock" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('ItemDataView', () => {
  const mockup = (after: string) => ({ location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] }, kit: 'web', after });
  const view = (data: unknown) => {
    vi.spyOn(api, 'projectHome').mockResolvedValue({ types: [] } as unknown as Awaited<ReturnType<typeof api.projectHome>>);
    return withQueries(<ItemDataView kind="mockups" data={data} checks={null} repo="acme-app" project="restock" itemId="ui-settings" />);
  };

  it('draws markup that breaks a write rule, as UI changes does, and lists what it breaks', () => {
    view(mockup('<section class="p-4"><img src="https://x"><h2>Restock settings</h2></section>'));
    expect(screen.getByTestId('mockup-frame').getAttribute('src')).toBe('/api/projects/acme-app/restock/items/ui-settings/mockup/after');
    const problems = screen.getByTestId('mockup-problems');
    expect(problems.textContent).toContain('after: a src or srcset points at another site.');
    expect(problems.className).toContain('text-ink-3');
    expect(screen.queryByTestId('data-problem')).toBeNull();
    expect(screen.getByText('/account · apps/web/app/account/page.tsx')).toBeTruthy();
  });

  it('lists no problems for markup that keeps the rules', () => {
    view(mockup('<section class="p-4"><h2>Restock settings</h2></section>'));
    expect(screen.getByTestId('mockup-frame')).toBeTruthy();
    expect(screen.queryByTestId('mockup-problems')).toBeNull();
  });

  it('draws the mockup at phone width on a phone, as UI changes does', () => {
    try {
      vi.stubGlobal('innerWidth', 375);
      view(mockup('<section class="p-4"><h2>Restock settings</h2></section>'));
      expect(screen.getByTestId('mockup-frame').getAttribute('width')).toBe('390');
      cleanup();
      vi.stubGlobal('innerWidth', 1280);
      view(mockup('<section class="p-4"><h2>Restock settings</h2></section>'));
      expect(screen.getByTestId('mockup-frame').getAttribute('width')).toBe('1280');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("says why when there's no markup to draw", () => {
    view({ location: 'nowhere', after: 42 });
    expect(screen.getByTestId('data-problem')).toBeTruthy();
    expect(screen.queryByTestId('mockup-frame')).toBeNull();
  });
});
