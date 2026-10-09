import type { ProjectHome, ThreadDetail, TypeItemRow, WhiteboardView } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../../api/client';
import { row } from '../../visual/testkit';
import { DefenseBody, type DefenseMode } from '../DefensePage';
import { defense, presenter, view } from '../testkit';
import { layoutBoard, type Board } from './boardLayout';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../../visual/testkit')).routerMock(navigate));
// A small board stands in for ELK's layout; shownAt is the real one.
vi.mock('./boardLayout', async (importOriginal) => ({ ...(await importOriginal<typeof import('./boardLayout')>()), layoutBoard: vi.fn() }));
// Whether you've asked for reduced motion, as Motion reads it.
const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('motion/react', async (importOriginal) => ({ ...(await importOriginal<typeof import('motion/react')>()), useReducedMotion: () => reduced.value }));

const SMALL: Board = {
  width: 480,
  height: 120,
  tone: 'ink',
  shapes: [
    { ref: 'edge:sends', kind: 'line', points: [{ x: 160, y: 60 }, { x: 300, y: 60 }], arrow: true, dashed: false, ends: ['node:job', 'node:sms'] },
    { ref: 'node:job', kind: 'box', x: 10, y: 40, w: 150, h: 36, label: 'Reminder job', dashed: false },
    { ref: 'node:sms', kind: 'box', x: 300, y: 40, w: 150, h: 36, label: 'SMS provider', dashed: true },
  ],
};
const DETAIL = { item: { id: 'architecture-system', title: 'System view', data: { kind: 'system' } }, type: { id: 'architecture', title: 'Architecture', screen: 'diagram' } } as unknown as ThreadDetail;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  vi.mocked(layoutBoard).mockResolvedValue(SMALL);
  reduced.value = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(layoutBoard).mockReset();
});

/** The page in Present, so the place is kept the way it is in the app: by the page. */
function show(v: WhiteboardView = view({ defense: defense({ presenter: presenter() }) }), mode: DefenseMode = 'present') {
  vi.spyOn(api, 'whiteboard').mockResolvedValue(v);
  const thread = vi.spyOn(api, 'thread').mockResolvedValue(DETAIL);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = (m: DefenseMode) => (
    <QueryClientProvider client={client}>
      <DefenseBody repo="acme-app" project="restock" mode={m} />
    </QueryClientProvider>
  );
  const { rerender } = render(page(mode));
  return { thread, switchTo: (m: DefenseMode) => rerender(page(m)) };
}

const caption = () => screen.getByTestId('present-caption').textContent;
const stepLine = () => screen.getByTestId('present-step').textContent;
const title = () => within(screen.getByTestId('present')).getByRole('heading').textContent;
const drawn = () => [...new Set(screen.queryAllByTestId('board-shape').map((s) => s.getAttribute('data-ref')))];
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
const previous = () => fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
const key = (k: string, target: Element | Window = window) => fireEvent.keyDown(target, { key: k });
/** Opens Present and goes to System flow's first step, once its board is drawn. */
async function toFlow() {
  await screen.findByTestId('present');
  next();
  await waitFor(() => expect(drawn()).toEqual(['node:job']));
}

describe('Present', () => {
  it("opens on the first chapter's first step, with its caption, the step count and its notes", async () => {
    // jsdom has no scrollIntoView: this one counts its calls.
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: scroll, configurable: true, writable: true });
    show();
    expect(await screen.findByTestId('present')).toBeTruthy();
    // Opening Present brings it into view once, at its top.
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(screen.getByTestId('present'));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    expect(title()).toBe('1. Purpose');
    expect(stepLine()).toBe('Step 1 of 1');
    expect(caption()).toBe('A daily job reminds customers before an item runs out.');
    // Purpose draws nothing: its note is written on the board as a list.
    expect(screen.getByTestId('board-note').textContent).toBe('One job, one table.');
    expect(screen.queryAllByTestId('board-shape')).toHaveLength(0);
    expect(screen.queryByText('Nothing to draw in this chapter.')).toBeNull();
    // Nothing in Present is the page's main action.
    expect(screen.getAllByRole('button').filter((b) => b.className.includes('bg-button'))).toHaveLength(0);
    // ◀ ▶ are big enough to tap on a phone.
    for (const name of ['Previous step', 'Next step']) expect(screen.getByRole('button', { name }).className).toContain('max-md:h-11 max-md:w-11');
    // A step doesn't scroll the page.
    next();
    expect(scroll).toHaveBeenCalledTimes(1);
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('steps on and back across chapter ends, adding the parts each step reveals', async () => {
    const { thread } = show();
    await toFlow();
    expect(thread).toHaveBeenCalledWith('acme-app', 'restock', 't-architecture-system');
    expect(vi.mocked(layoutBoard)).toHaveBeenCalledWith({ kind: 'diagram', itemId: 'architecture-system' }, { kind: 'system' });
    expect(title()).toBe('2. System flow');
    expect([stepLine(), caption()]).toEqual(['Step 1 of 3', 'The job runs every morning.']);
    next();
    // A line brings its two ends with it, and the step's note rings the box it's near.
    expect(drawn()).toEqual(['edge:sends', 'node:job', 'node:sms']);
    expect([stepLine(), caption()]).toEqual(['Step 2 of 3', 'It sends each reminder by SMS.']);
    expect(screen.getByTestId('board-note').getAttribute('data-near')).toBe('node:sms');
    next();
    next();
    expect(title()).toBe('3. Data and source of truth');
    previous();
    expect([title(), stepLine()]).toEqual(['2. System flow', 'Step 3 of 3']);
    previous();
    previous();
    previous();
    expect([title(), stepLine()]).toEqual(['1. Purpose', 'Step 1 of 1']);
    // At the very start ◀ waits, and stays focusable.
    const back = screen.getByRole('button', { name: 'Previous step' });
    expect(back.getAttribute('aria-disabled')).toBe('true');
    previous();
    expect(title()).toBe('1. Purpose');
  });

  it('stops at the last step of the last chapter', async () => {
    show();
    await screen.findByTestId('present');
    fireEvent.change(screen.getByRole('combobox', { name: 'Chapters' }), { target: { value: '6' } });
    expect([title(), stepLine()]).toEqual(['7. Rollback and blast radius', 'Step 1 of 1']);
    expect(screen.getByRole('button', { name: 'Next step' }).getAttribute('aria-disabled')).toBe('true');
    next();
    expect(title()).toBe('7. Rollback and blast radius');
  });

  it('draws what a step adds as you move on, and shows a step at once when you go back', async () => {
    show();
    await toFlow();
    const board = () => screen.getByTestId('board');
    expect(board().getAttribute('data-animate')).toBe('true');
    next();
    expect(board().getAttribute('data-animate')).toBe('true');
    previous();
    expect(board().getAttribute('data-animate')).toBe('false');
    expect(drawn()).toEqual(['node:job']);
  });

  it('Replay draws the chapter again from step 1', async () => {
    show();
    await toFlow();
    next();
    next();
    previous();
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect([title(), stepLine(), caption()]).toEqual(['2. System flow', 'Step 1 of 3', 'The job runs every morning.']);
    expect(drawn()).toEqual(['node:job']);
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('true');
  });

  it('shows everything at once when you have asked for reduced motion', async () => {
    reduced.value = true;
    show();
    await toFlow();
    next();
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('false');
    expect(document.querySelectorAll('[data-testid=board] path[pathLength]')).toHaveLength(0);
  });

  it('works from the keyboard: ← → step, Home and End go to the ends of the chapter', async () => {
    show();
    await screen.findByTestId('present');
    key('ArrowRight');
    await waitFor(() => expect(drawn()).toEqual(['node:job']));
    key('End');
    expect(stepLine()).toBe('Step 3 of 3');
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('false');
    key('Home');
    expect(stepLine()).toBe('Step 1 of 3');
    key('ArrowRight');
    expect(stepLine()).toBe('Step 2 of 3');
    key('ArrowLeft');
    key('ArrowLeft');
    expect(title()).toBe('1. Purpose');
    // A shortcut with Cmd is the browser's.
    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true });
    expect(title()).toBe('1. Purpose');
  });

  it("Present's keys leave fields and focused controls alone", async () => {
    show();
    await screen.findByTestId('present');
    // Arrows in a field are the field's: the chapters menu, the export menu, or any box you type in on the page.
    key('ArrowRight', screen.getByRole('combobox', { name: 'Chapters' }));
    key('ArrowRight', screen.getByLabelText('Export into'));
    const ask = document.body.appendChild(document.createElement('textarea'));
    key('ArrowRight', ask);
    key('End', ask);
    ask.remove();
    expect([title(), stepLine()]).toEqual(['1. Purpose', 'Step 1 of 1']);
    // Space and Enter are a focused button's own: Present takes neither.
    const replay = screen.getByRole('button', { name: 'Replay' });
    replay.focus();
    for (const k of [' ', 'Enter']) {
      const press = createEvent.keyDown(replay, { key: k });
      fireEvent(replay, press);
      expect(press.defaultPrevented).toBe(false);
    }
    expect(title()).toBe('1. Purpose');
    // Esc leaves full screen and gives the focus back to Full screen.
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(screen.getByTestId('present-overlay')).toBeTruthy();
    key('Escape');
    expect(screen.queryByTestId('present-overlay')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Full screen' }));
    // Esc with nothing in full screen does nothing.
    key('Escape');
    expect(title()).toBe('1. Purpose');
  });

  it('Full screen covers the window with the same board and controls, and ✕ leaves it', async () => {
    show();
    await toFlow();
    // In the page the board takes its chapter's shape, so what's under it moves only between chapters.
    expect(screen.getByTestId('board').style.aspectRatio).not.toBe('');
    // Something outside the app, as the project navigation is outside Present.
    const aside = document.body.appendChild(document.createElement('aside'));
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    const overlay = screen.getByTestId('present-overlay');
    expect(overlay.className).toContain('fixed inset-0');
    expect(overlay.className).toContain('bg-canvas');
    expect(overlay.getAttribute('role')).toBe('dialog');
    // Everything but the overlay is inert, so the focus can't leave it: the page around it, and what's outside the app.
    expect(aside.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('[role=tablist]')!.closest('[inert]')).not.toBeNull();
    expect(overlay.closest('[inert]')).toBeNull();
    // The board takes the height that's left; on a short screen the caption keeps to two lines in the bottom row.
    expect(within(overlay).getByTestId('board').parentElement!.className).toContain('flex-1');
    expect(within(overlay).getByTestId('board').className).toContain('h-full');
    expect(within(overlay).getByTestId('board').style.aspectRatio).toBe('');
    expect(overlay.className).toContain('[@media(max-height:500px)]:pt-2');
    expect(within(overlay).getByTestId('present-caption').className).toContain('[@media(max-height:500px)]:line-clamp-2');
    // The Full screen button gives way to ✕, which takes the focus.
    expect(document.activeElement).toBe(within(overlay).getByRole('button', { name: 'Leave full screen' }));
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(within(overlay).getByTestId('board')).toBeTruthy();
    expect(within(overlay).queryByRole('button', { name: 'Full screen' })).toBeNull();
    // The keys still work in it.
    key('ArrowRight');
    expect(within(overlay).getByTestId('present-step').textContent).toBe('Step 2 of 3');
    fireEvent.click(within(overlay).getByRole('button', { name: 'Leave full screen' }));
    expect(screen.queryByTestId('present-overlay')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Full screen' }));
    expect(stepLine()).toBe('Step 2 of 3');
    // The marks come off again.
    expect(aside.hasAttribute('inert')).toBe(false);
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    aside.remove();
  });

  it('lists the chapters beside the board on a wide screen and as a menu above it on a narrow one', async () => {
    show();
    const chapters = await screen.findByTestId('present-chapters');
    const rail = within(chapters).getByRole('navigation', { name: 'Chapters' });
    expect(rail.className).toContain('hidden');
    expect(rail.className).toContain('min-[1100px]:block');
    const menu = within(chapters).getByRole('combobox', { name: 'Chapters' }) as HTMLSelectElement;
    expect(menu.closest('label')!.className).toContain('min-[1100px]:hidden');
    expect([...menu.options].map((o) => o.textContent)).toEqual([
      '1. Purpose',
      '2. System flow',
      '3. Data and source of truth',
      '4. States',
      '5. Security',
      '6. Failure and retries',
      '7. Rollback and blast radius',
    ]);
    expect(within(rail).getAllByRole('button').map((b) => b.textContent)).toEqual([...menu.options].map((o) => o.textContent));
    expect(within(rail).getByRole('button', { name: '1. Purpose' }).getAttribute('aria-current')).toBe('step');
    fireEvent.click(within(rail).getByRole('button', { name: '6. Failure and retries' }));
    expect([title(), stepLine()]).toEqual(['6. Failure and retries', 'Step 1 of 1']);
    expect(menu.value).toBe('5');
    expect(within(rail).getByRole('button', { name: '6. Failure and retries' }).getAttribute('aria-current')).toBe('step');
  });

  it("asks a phone held upright to turn sideways, and says nothing on a wider screen", async () => {
    show();
    const hint = await screen.findByTestId('present-landscape-hint');
    expect(hint.textContent).toBe('Turn your phone sideways, then press Full screen.');
    expect(hint.className).toContain('hidden');
    expect(hint.className).toContain('max-md:portrait:block');
  });

  it('draws the tables from every database item that is not parked, of every database type', async () => {
    // Two types draw on the database screen, as core's drawnItems counts them; the home lists only enabled types.
    const types = [
      { id: 'architecture', screen: 'diagram' },
      { id: 'tables', screen: 'database' },
      { id: 'audit', screen: 'database' },
    ];
    vi.spyOn(api, 'projectHome').mockResolvedValue({ types } as unknown as ProjectHome);
    const rows: Record<string, TypeItemRow[]> = {
      tables: [
        row({ id: 'tables-reminder', data: { model: 'RestockReminder' } }),
        row({ id: 'tables-old', status: 'parked', data: { model: 'OldLog' } }),
        row({ id: 'tables-note', data: null }),
      ],
      audit: [row({ id: 'audit-log', data: { model: 'AuditLog' } })],
    };
    const typeItems = vi.spyOn(api, 'typeItems').mockImplementation(async (_repo, _project, typeId) => ({ type: {} as never, items: rows[typeId] ?? [] }));
    show();
    await screen.findByTestId('present');
    fireEvent.change(screen.getByRole('combobox', { name: 'Chapters' }), { target: { value: '2' } });
    // In item-id order, as core lists them.
    await waitFor(() => expect(vi.mocked(layoutBoard)).toHaveBeenCalledWith({ kind: 'tables' }, [{ model: 'AuditLog' }, { model: 'RestockReminder' }]));
    expect(typeItems).toHaveBeenCalledWith('acme-app', 'restock', 'tables');
    expect(typeItems).toHaveBeenCalledWith('acme-app', 'restock', 'audit');
  });

  it('a stale presenter still draws what it can', async () => {
    // System flow's diagram lost a box after the defense was written: the parts it still has are drawn, the rest skipped.
    const stale = presenter({
      flow: {
        steps: [
          { caption: 'The job runs every morning.', reveal: ['node:job', 'node:gone'], notes: [{ near: 'node:gone', text: 'This box was renamed.', ink: 'seal' }] },
          { caption: 'It sends each reminder by SMS.', reveal: ['edge:gone', 'edge:sends'], notes: [] },
        ],
      },
    });
    show(view({ defense: defense({ presenter: stale }), stale: 'Out of date: the plan changed since this was generated.' }));
    await toFlow();
    // A note near a part that isn't there goes in the list under the board.
    expect(within(screen.getByTestId('board')).getByRole('listitem').textContent).toBe('This box was renamed.');
    next();
    expect(drawn()).toEqual(['edge:sends', 'node:job', 'node:sms']);

    // Its data no longer draws at all: nothing to draw, and the notes still show.
    cleanup();
    vi.mocked(layoutBoard).mockResolvedValue(null);
    show(view({ defense: defense({ presenter: stale }) }));
    await screen.findByTestId('present');
    next();
    expect(await screen.findByText('Nothing to draw in this chapter.')).toBeTruthy();
    expect(within(screen.getByTestId('board')).getByRole('listitem').textContent).toBe('This box was renamed.');
    expect(screen.queryAllByTestId('board-shape')).toHaveLength(0);
    expect(caption()).toBe('The job runs every morning.');

    // The item is gone: the same.
    cleanup();
    vi.mocked(layoutBoard).mockResolvedValue(SMALL);
    show(view({ defense: defense({ presenter: stale }) }));
    vi.spyOn(api, 'thread').mockRejectedValue(new ApiError(404, 'There is no thread t-architecture-system.', null));
    await screen.findByTestId('present');
    next();
    expect(await screen.findByText('Nothing to draw in this chapter.')).toBeTruthy();
    expect(within(screen.getByTestId('board')).getByRole('listitem').textContent).toBe('This box was renamed.');
  });

  it('keeps the chapter and the step when you go to Study and back', async () => {
    const { switchTo } = show();
    await toFlow();
    next();
    switchTo('study');
    expect(await screen.findByTestId('study')).toBeTruthy();
    switchTo('present');
    await screen.findByTestId('present');
    expect([title(), stepLine()]).toEqual(['2. System flow', 'Step 2 of 3']);
    // Back at a step past the first, the board is shown as it was, not partly drawn again.
    await waitFor(() => expect(drawn()).toEqual(['edge:sends', 'node:job', 'node:sms']));
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('false');
  });

  it('says a defense written before Present has nothing to present, and makes Regenerate the main action', async () => {
    show(view({ defense: defense() }));
    expect((await screen.findByTestId('present-old')).textContent).toBe('This defense was written before Present. Regenerate it to present it.');
    expect(screen.queryByTestId('present')).toBeNull();
    const regenerate = screen.getByTestId('defense-generate');
    expect(regenerate.textContent).toBe('Regenerate');
    expect(screen.getAllByRole('button').filter((b) => b.className.includes('bg-button'))).toEqual([regenerate]);
    // A presenter with no chapters reads the same way, page and all.
    cleanup();
    show(view({ defense: defense({ presenter: { chapters: [] } }) }));
    expect(await screen.findByTestId('present-old')).toBeTruthy();
    expect(screen.getAllByRole('button').filter((b) => b.className.includes('bg-button'))).toEqual([screen.getByTestId('defense-generate')]);
  });
});
