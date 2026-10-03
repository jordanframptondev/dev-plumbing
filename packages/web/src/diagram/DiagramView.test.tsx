import type { DiagramData } from '@dev-plumbing/core/schemas';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagramView } from './DiagramView';
import * as layout from './layout';

// Real layout by default; one test makes it reject.
vi.mock('./layout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./layout')>();
  return { ...actual, layoutDiagram: vi.fn(actual.layoutDiagram) };
});

afterEach(cleanup);

const data: DiagramData = {
  kind: 'system',
  groups: [{ id: 'jobs', label: 'Jobs' }],
  nodes: [
    { id: 'job', label: 'Reminder job', group: 'jobs', status: 'new', codeRef: { path: 'apps/web/lib/reminders.ts', symbol: 'sendRestockReminders' } },
    { id: 'page', label: 'Settings page', status: 'changed', codeRef: { path: 'apps/web/app/missing/page.tsx' } },
    { id: 'sms', label: 'SMS provider', status: 'external' },
  ],
  edges: [
    { id: 'saves', from: 'page', to: 'job', label: 'schedules' },
    { id: 'sends', from: 'job', to: 'sms', style: 'dashed' },
  ],
};

describe('DiagramView', () => {
  it('draws a box per node with its status, lines, checks and bubbles once laid out', async () => {
    const onSelect = vi.fn();
    render(<DiagramView data={data} checks={{ job: true, page: false }} bubbles={{ job: { count: 2, tone: 'seal' } }} onSelect={onSelect} selected="page" />);
    expect(screen.getByText('Drawing…')).toBeTruthy();
    const nodes = await screen.findAllByTestId('diagram-node', {}, { timeout: 10_000 });
    expect(nodes.map((n) => [n.getAttribute('data-node'), n.getAttribute('data-status')])).toEqual([
      ['job', 'new'],
      ['page', 'changed'],
      ['sms', 'external'],
    ]);
    expect(screen.getAllByTestId('diagram-edge').map((e) => e.getAttribute('data-edge'))).toEqual(['saves', 'sends']);
    expect(screen.getAllByTestId('diagram-edge')[1]!.style.strokeDasharray).toBe('4 3');
    expect(screen.getByText('schedules')).toBeTruthy();
    expect(screen.getByText('Jobs')).toBeTruthy();
    expect(nodes[0]!.querySelector('[data-check=found]')?.textContent).toBe(' ✓');
    expect(nodes[1]!.querySelector('[data-check=missing]')?.textContent).toBe(' not found');
    expect(nodes[2]!.querySelector('[data-check]')).toBeNull();
    expect(screen.getByTestId('diagram-bubble').getAttribute('data-count')).toBe('2');
    // §16 colours, through the theme's variables, so dark mode needs nothing extra.
    const stroke = (n: Element) => (n.querySelector('[data-part=box]') as SVGElement).style;
    expect(stroke(nodes[0]!).stroke).toBe('var(--moss)');
    expect(stroke(nodes[1]!).stroke).toBe('var(--slate)');
    expect(stroke(nodes[1]!).strokeWidth).toBe('2');
    expect(stroke(nodes[2]!).strokeDasharray).toBe('4 3');

    fireEvent.click(screen.getByRole('button', { name: 'Reminder job, new' }));
    expect(onSelect).toHaveBeenLastCalledWith('job');
    fireEvent.keyDown(screen.getByRole('button', { name: 'SMS provider, external' }), { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith('sms');
    expect(screen.getByRole('button', { name: 'Settings page, changed' }).getAttribute('aria-pressed')).toBe('true');
    // One finger scrolls the page; two pinch-zoom the drawing.
    expect((document.querySelector('svg') as SVGElement).style.touchAction).toBe('pan-x pan-y pinch-zoom');
    // No legend unless asked for.
    expect(screen.queryByTestId('diagram-legend')).toBeNull();
  }, 15_000);

  it('compact drawings have no buttons, bubbles or selection', async () => {
    render(<DiagramView data={data} bubbles={{ job: { count: 1, tone: 'slate' } }} onSelect={() => {}} selected="job" compact />);
    await screen.findAllByTestId('diagram-node', {}, { timeout: 10_000 });
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.queryByTestId('diagram-bubble')).toBeNull();
    expect((document.querySelector('svg') as SVGElement).style.maxHeight).toBe('360px');
  }, 15_000);

  it('with legend, names each box status under the drawing, with outlined swatches', async () => {
    render(<DiagramView data={data} legend />);
    const legend = await screen.findByTestId('diagram-legend', {}, { timeout: 10_000 });
    expect(legend.textContent).toBe('newchangedunchangedoutside the repo');
    const swatch = (status: string) => (legend.querySelector(`[data-status=${status}] [data-part=swatch]`) as SVGElement).style;
    expect(swatch('new').stroke).toBe('var(--moss)');
    expect(swatch('changed').stroke).toBe('var(--amber)');
    expect(swatch('unchanged').stroke).toBe('var(--mist)');
    expect(swatch('external').strokeDasharray).toBe('3 2');
    for (const s of ['new', 'changed', 'unchanged', 'external']) expect(swatch(s).fill).toBe('none');
  }, 15_000);

  it('is never drawn wider than its layout, so a small diagram keeps its size and sits centred', async () => {
    vi.mocked(layout.layoutDiagram).mockClear();
    render(<DiagramView data={data} />);
    await screen.findAllByTestId('diagram-node', {}, { timeout: 10_000 });
    const laidOut = await vi.mocked(layout.layoutDiagram).mock.results.at(-1)!.value;
    const svg = document.querySelector('figure > svg') as SVGElement;
    expect(laidOut.width).toBeGreaterThan(0);
    expect(svg.style.maxWidth).toBe(`${laidOut.width}px`);
    // It still shrinks to fit a narrow column, and pinch-zooms.
    expect(svg.getAttribute('width')).toBe('100%');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${laidOut.width} ${laidOut.height}`);
    expect(svg.style.touchAction).toBe('pan-x pan-y pinch-zoom');
    expect(svg.classList.contains('mx-auto')).toBe(true);
  }, 15_000);

  it("says the drawing couldn't be shown, with the reason, when the layout fails", async () => {
    vi.mocked(layout.layoutDiagram).mockRejectedValueOnce(new Error('boom'));
    render(<DiagramView data={data} />);
    expect(await screen.findByText("This item's drawing couldn't be shown")).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
    expect(screen.queryByTestId('diagram-node')).toBeNull();
  });
});
