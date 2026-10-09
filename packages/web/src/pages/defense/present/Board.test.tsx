import type { PresentStep } from '@dev-plumbing/core/schemas';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BoardView, chapterBoard } from './Board';
import type { Board } from './boardLayout';

// Every animation ends at once, so a test sees each part as it ends up.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

const diagram: Board = {
  width: 420,
  height: 160,
  tone: 'ink',
  shapes: [
    { ref: 'group:jobs', kind: 'group', x: 180, y: 10, w: 220, h: 120, label: 'Jobs', members: ['node:job'] },
    { ref: 'edge:schedules', kind: 'line', points: [{ x: 150, y: 60 }, { x: 200, y: 60 }], label: 'schedules', labelX: 175, labelY: 54, arrow: true, dashed: false, ends: ['node:page', 'node:job'] },
    { ref: 'node:page', kind: 'box', x: 10, y: 40, w: 140, h: 36, label: 'Reminders page', dashed: false },
    { ref: 'node:job', kind: 'box', x: 200, y: 40, w: 140, h: 36, label: 'Reminder job', dashed: false },
  ],
};
const tables: Board = { width: 200, height: 80, tone: 'slate', shapes: [{ ref: 'table:Subscription', kind: 'box', x: 10, y: 10, w: 150, h: 36, label: 'Subscription', dashed: false }] };
type Note = PresentStep['notes'][number];
const say = (reveal: string[], notes: Note[] = []): PresentStep => ({ caption: 'Say this.', reveal, notes });
const twice: Note = { near: 'node:job', text: 'Runs twice? One a day per subscription.', ink: 'seal' };

function show(over: Partial<Parameters<typeof BoardView>[0]> = {}) {
  return render(<BoardView board={diagram} steps={[say(['node:page'])]} step={0} animate={false} replayKey={0} {...over} />);
}
const drawn = () => screen.queryAllByTestId('board-shape').map((s) => s.getAttribute('data-ref'));
const paths = (ref: string) => [...document.querySelectorAll(`[data-testid=board-shape][data-ref="${ref}"] path`)] as SVGPathElement[];
const viewBox = () => document.querySelector('[data-testid=board] svg[viewBox]')!.getAttribute('viewBox');
const noteAt = () => [...document.querySelectorAll('[data-testid=board-note] text')].map((t) => [t.getAttribute('x'), t.getAttribute('y')]);

describe('the board', () => {
  it('draws only the parts on show, each by hand, with its label in the system font', () => {
    show({ steps: [say(['node:page', 'node:job', 'edge:schedules', 'group:jobs'])] });
    expect(drawn()).toEqual(['group:jobs', 'edge:schedules', 'node:page', 'node:job']);
    cleanup();
    show();
    expect(drawn()).toEqual(['node:page']);
    const page = screen.getByTestId('board-shape');
    expect(within(page).getByText('Reminders page').tagName).toBe('text');
    // A rough rectangle, in ink, behind its label.
    expect(paths('node:page')[0]!.getAttribute('d')).toMatch(/^M/);
    expect(paths('node:page')[0]!.style.stroke).toBe('var(--text)');
    expect(screen.queryByText('Reminder job')).toBeNull();
  });

  it('dashes a group, and draws a line with its arrowhead and its label', () => {
    show({ steps: [say(['group:jobs', 'edge:schedules'])] });
    expect(paths('group:jobs')[0]!.style.strokeDasharray).toBe('6 5');
    expect(paths('edge:schedules')).toHaveLength(3);
    expect(screen.getByText('schedules')).toBeTruthy();
    expect(screen.getByText('Jobs')).toBeTruthy();
  });

  it('draws the tables in slate', () => {
    show({ board: tables, steps: [say(['table:Subscription'])] });
    expect(paths('table:Subscription')[0]!.style.stroke).toBe('var(--slate)');
    expect(screen.getByText('Subscription').style.fill).toBe('var(--slate)');
  });

  it('lies on a faint dot grid, an SVG pattern of separator dots every 20 px', () => {
    show();
    const pattern = screen.getByTestId('board-grid');
    expect(pattern.tagName).toBe('pattern');
    expect([pattern.getAttribute('width'), pattern.getAttribute('height'), pattern.getAttribute('patternUnits')]).toEqual(['20', '20', 'userSpaceOnUse']);
    expect((pattern.querySelector('circle') as SVGCircleElement).style.fill).toBe('var(--separator)');
    expect(screen.getByTestId('board').className).toContain('bg-canvas');
  });

  it("rings the part a note is near, in the note's ink, and writes the note beside it", () => {
    show({ steps: [say(['node:page'], [{ near: 'node:page', text: 'Safe to retry.', ink: 'moss' }]), say(['node:job'], [twice])], step: 1 });
    const notes = screen.getAllByTestId('board-note');
    expect(notes.map((n) => [n.getAttribute('data-near'), n.getAttribute('data-ink'), n.textContent])).toEqual([
      ['node:page', 'moss', 'Safe to retry.'],
      ['node:job', 'seal', 'Runs twice? One a day per subscription.'],
    ]);
    const ring = notes[1]!.querySelector('path') as SVGPathElement;
    expect(ring.style.stroke).toBe('var(--seal)');
    expect((notes[1]!.querySelector('text') as SVGTextElement).style.fill).toBe('var(--seal)');
    // Long notes wrap.
    expect(notes[1]!.querySelectorAll('tspan')).toHaveLength(2);
  });

  it("lists at the foot a note for the whole board, and one whose part isn't on show", () => {
    show({ steps: [say(['node:page'], [{ near: '', text: 'One job, one table.', ink: 'ink' }]), say([], [twice])], step: 1 });
    const listed = screen.getAllByRole('listitem');
    expect(listed.map((li) => [li.getAttribute('data-testid'), li.textContent, li.style.color])).toEqual([
      ['board-note', 'One job, one table.', 'var(--text)'],
      ['board-note', 'Runs twice? One a day per subscription.', 'var(--seal)'],
    ]);
    // A step earlier, the second note's place is held but it isn't shown, so the drawing above keeps its size.
    cleanup();
    show({ steps: [say(['node:page'], [{ near: '', text: 'One job, one table.', ink: 'ink' }]), say([], [twice])], step: 0 });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['One job, one table.']);
    expect(screen.getAllByTestId('board-note')).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid=board] li')).toHaveLength(2);
  });

  it('with nothing to draw, says so and lists the notes', () => {
    show({ board: null, steps: [say(['node:job'], [twice])], message: 'Nothing to draw in this chapter.' });
    expect(screen.getByText('Nothing to draw in this chapter.')).toBeTruthy();
    expect(screen.queryAllByTestId('board-shape')).toHaveLength(0);
    expect(screen.getByRole('listitem').textContent).toBe('Runs twice? One a day per subscription.');
  });

  it("draws this step's new parts along their length when it animates, and everything at once when it doesn't", () => {
    const steps = [say(['node:page']), say(['edge:schedules'])];
    show({ steps, step: 1, animate: true });
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('true');
    // Motion draws a path by its length: pathLength 1, and the dashes it moves.
    expect(paths('node:job')[0]!.getAttribute('pathLength')).toBe('1');
    expect(paths('edge:schedules').every((p) => p.getAttribute('pathLength') === '1')).toBe(true);
    // A dashed group fades in instead, and what an earlier step drew stays as it was.
    expect(paths('group:jobs')[0]!.getAttribute('pathLength')).toBeNull();
    expect(paths('node:page')[0]!.getAttribute('pathLength')).toBeNull();
    cleanup();
    show({ steps, step: 1, animate: false });
    expect(screen.getByTestId('board').getAttribute('data-animate')).toBe('false');
    expect(document.querySelectorAll('path[pathLength]')).toHaveLength(0);
  });

  it('keeps one frame for the whole chapter, round what the chapter shows', () => {
    const wide: Board = {
      width: 2600,
      height: 120,
      tone: 'ink',
      shapes: [
        { ref: 'edge:hands', kind: 'line', points: [{ x: 150, y: 58 }, { x: 260, y: 58 }], arrow: true, dashed: false, ends: ['node:a', 'node:b'] },
        { ref: 'node:a', kind: 'box', x: 10, y: 40, w: 140, h: 36, label: 'Reminder job', dashed: false },
        { ref: 'node:b', kind: 'box', x: 260, y: 40, w: 140, h: 36, label: 'Mailer', dashed: false },
        { ref: 'node:z', kind: 'box', x: 2400, y: 40, w: 140, h: 36, label: 'Archive', dashed: false },
      ],
    };
    const steps = [say(['node:a']), say(['edge:hands'], [{ near: 'node:b', text: 'Outside our account.', ink: 'seal' }])];
    show({ board: wide, steps, step: 0 });
    const first = viewBox();
    cleanup();
    show({ board: wide, steps, step: 1 });
    expect(viewBox()).toBe(first);
    // Only what the chapter shows: the far box isn't in the frame, so the two boxes are drawn large.
    const [x, , w, h] = first!.split(' ').map(Number);
    expect(x! + w!).toBeLessThan(2400);
    expect(w).toBeLessThan(700);
    // In the page the board takes the frame's shape, within 220 px and the window less 220; in full screen it fills.
    const figure = screen.getByTestId('board');
    expect([figure.style.aspectRatio, figure.style.minHeight, figure.style.maxHeight]).toEqual([`${w} / ${h}`, '220px', 'calc(100dvh - 220px)']);
    cleanup();
    show({ board: wide, steps, step: 1, fill: true });
    expect(screen.getByTestId('board').className).toContain('h-full');
    expect(screen.getByTestId('board').style.aspectRatio).toBe('');
    // Another chapter, showing another part, has its own frame.
    cleanup();
    show({ board: wide, steps: [say(['node:z'])], step: 0 });
    expect(viewBox()).not.toBe(first);
    expect(Number(viewBox()!.split(' ')[0])).toBeGreaterThan(2000);
  });

  it("keeps a note where it is from its step to the chapter's last", () => {
    // The queue comes in under the page at step 3: the note goes where the queue won't be, and stays there.
    const stacked: Board = { ...diagram, shapes: [...diagram.shapes, { ref: 'node:queue', kind: 'box', x: 10, y: 96, w: 140, h: 36, label: 'Queue', dashed: false }] };
    const steps = [say(['node:page'], [{ near: 'node:page', text: 'Customers set the lead time here.', ink: 'ink' }]), say(['edge:schedules']), say(['node:queue'])];
    show({ board: stacked, steps, step: 0 });
    const at = noteAt();
    expect(at).toHaveLength(1);
    for (const step of [1, 2]) {
      cleanup();
      show({ board: stacked, steps, step });
      expect(noteAt()).toEqual(at);
    }
  });

  it("rings a lane's head, not the middle of its lifeline", () => {
    const flow: Board = {
      width: 560,
      height: 600,
      tone: 'ink',
      shapes: [
        { ref: 'lane:mailer', kind: 'line', points: [{ x: 280, y: 48 }, { x: 280, y: 580 }], arrow: false, dashed: true, ends: [] },
        { ref: 'lane:mailer', kind: 'box', x: 200, y: 16, w: 160, h: 32, label: 'Mailer', dashed: true },
      ],
    };
    const { placed } = chapterBoard(flow, [say(['lane:mailer'], [{ near: 'lane:mailer', text: 'Retries are theirs.', ink: 'seal' }])]);
    expect(placed[0]!.mark).toEqual({ x: 200, y: 16, w: 160, h: 32 });
  });

  it("doesn't write a note over a group's label, and tries the corners before covering anything", () => {
    // Below and to the right of the job are taken, and above it is the group's label: the note goes to its left.
    const crowded: Board = {
      width: 520,
      height: 220,
      tone: 'ink',
      shapes: [
        { ref: 'group:jobs', kind: 'group', x: 0, y: 0, w: 500, h: 200, label: 'Background jobs', members: ['node:job', 'node:queue', 'node:retry'] },
        { ref: 'node:job', kind: 'box', x: 20, y: 40, w: 140, h: 36, label: 'Reminder job', dashed: false },
        { ref: 'node:queue', kind: 'box', x: 20, y: 100, w: 140, h: 36, label: 'Queue', dashed: false },
        { ref: 'node:retry', kind: 'box', x: 180, y: 40, w: 140, h: 36, label: 'Retry', dashed: false },
      ],
    };
    const note: Note = { near: 'node:job', text: 'Runs once a day', ink: 'seal' };
    const { placed } = chapterBoard(crowded, [say(['node:job', 'node:queue', 'node:retry'], [note])]);
    expect(placed[0]!.at.x + placed[0]!.at.w).toBeLessThanOrEqual(0);
    // With the left taken too, the first free corner: below and to the right, clear of the queue and the retry.
    const scheduler = { ref: 'node:scheduler', kind: 'box' as const, x: -200, y: 40, w: 140, h: 36, label: 'Scheduler', dashed: false };
    const fuller: Board = { ...crowded, shapes: [...crowded.shapes, scheduler] };
    const corner = chapterBoard(fuller, [say(['node:job', 'node:queue', 'node:retry', 'node:scheduler'], [note])]).placed[0]!.at;
    expect(corner).toEqual({ x: 164, y: 91, w: 102, h: 16 });
  });

  it('uses only Ink wash tokens: no Tailwind palette colours or gradients', () => {
    show({ steps: [say(['node:page', 'node:job', 'edge:schedules', 'group:jobs'], [twice, { ...twice, near: '' }])] });
    const html = screen.getByTestId('board').outerHTML;
    expect(html).not.toMatch(/\b(?:bg|text|border|fill|stroke)-(?:red|orange|amber|yellow|green|blue|indigo|purple|pink|gray|zinc|neutral|stone|slate)-\d{2,3}\b/);
    expect(html).not.toMatch(/gradient/i);
    // Every colour is a theme variable.
    for (const color of html.match(/(?:fill|stroke|color): [^;"]+/g) ?? []) expect(color).toMatch(/: (?:var\(--[a-z0-9-]+\)|none|transparent)$/);
  });
});
