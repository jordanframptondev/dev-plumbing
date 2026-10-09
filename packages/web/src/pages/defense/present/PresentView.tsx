import type { Presenter, PresentStep } from '@dev-plumbing/core/schemas';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { api } from '../../../api/client';
import { buttonClass } from '../../../components/Button';
import { inputClass } from '../../../components/inputClass';
import type { PresentViewProps } from '../DefensePage';
import { BoardView } from './Board';
import { layoutBoard, type Board } from './boardLayout';

type Chapter = Presenter['chapters'][number];
type Drawing = NonNullable<Chapter['drawing']>;
/** A drawing's data as the app has it: still loading, gone (the item, or every table), or there. */
type Source = { state: 'loading' } | { state: 'missing' } | { state: 'ready'; data: unknown };

const OLD = 'This defense was written before Present. Regenerate it to present it.';
const NOTHING = 'Nothing to draw in this chapter.';
const SIDEWAYS = 'Turn your phone sideways, then press Full screen.';
/** While a board loads, it has no steps: its notes come with the drawing, not before it. */
const NO_STEPS: PresentStep[] = [];

/**
 * The classes that differ between the page and full screen, written out whole so Tailwind finds them.
 * - **In the page,** the board takes its chapter's shape (Task 3's `BoardView`), so the step, the caption and the buttons
 *   under it move only between chapters, never between steps. The area is at least the window's height (`min-h-dvh`),
 *   so opening Present can always scroll its top to the top of the window, whatever comes after it on the page.
 * - **In full screen,** the board takes the height that's left. On a short screen (under 500 px tall: a phone held
 *   sideways) it's three rows: the chapters menu, the title and ✕; the board; then the step, the caption (two lines
 *   at most) and the buttons, so nothing needs scrolling. The chapters list sits beside the board only from 1,100 px
 *   wide on a screen taller than that.
 */
const PAGE = {
  frame: 'mt-6 min-h-dvh',
  present: 'grid gap-x-6 gap-y-4 min-[1100px]:grid-cols-[minmax(0,1fr)_184px]',
  chapters: 'min-w-0 min-[1100px]:col-start-2 min-[1100px]:row-start-1',
  menu: 'flex items-center gap-2.5 text-[12px] font-semibold text-ink-3 min-[1100px]:hidden',
  rail: 'hidden min-[1100px]:block',
  column: 'min-w-0 min-[1100px]:col-start-1 min-[1100px]:row-start-1',
  title: 'text-[17px] font-semibold',
  board: 'mt-3',
  step: 'mt-3 text-[12px] text-ink-3',
  caption: 'mt-1 min-h-[2.75em] break-words text-[16px] leading-snug',
  buttons: 'mt-4 flex flex-wrap items-center gap-2',
};
const FULL = {
  frame:
    'fixed inset-0 z-50 flex flex-col overflow-y-auto bg-canvas px-4 pb-6 pt-14 md:px-10 [@media(max-height:500px)]:overflow-hidden [@media(max-height:500px)]:pb-2 [@media(max-height:500px)]:pt-2',
  present:
    'grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-x-6 gap-y-4 [@media(max-height:500px)]:grid-cols-[auto_minmax(0,1fr)_auto] [@media(max-height:500px)]:grid-rows-[auto_minmax(0,1fr)_auto] [@media(max-height:500px)]:gap-x-3 [@media(max-height:500px)]:gap-y-2 [@media(min-width:1100px)_and_(min-height:501px)]:grid-cols-[minmax(0,1fr)_184px] [@media(min-width:1100px)_and_(min-height:501px)]:grid-rows-[minmax(0,1fr)]',
  chapters:
    'min-w-0 [@media(max-height:500px)]:contents [@media(min-width:1100px)_and_(min-height:501px)]:col-start-2 [@media(min-width:1100px)_and_(min-height:501px)]:row-start-1',
  menu: 'flex items-center gap-2.5 text-[12px] font-semibold text-ink-3 [@media(max-height:500px)]:col-start-1 [@media(max-height:500px)]:row-start-1 [@media(min-width:1100px)_and_(min-height:501px)]:hidden',
  rail: 'hidden [@media(min-width:1100px)_and_(min-height:501px)]:block',
  column:
    'flex min-h-0 min-w-0 flex-col [@media(max-height:500px)]:contents [@media(min-width:1100px)_and_(min-height:501px)]:col-start-1 [@media(min-width:1100px)_and_(min-height:501px)]:row-start-1',
  title:
    'text-[17px] font-semibold [@media(max-height:500px)]:col-span-2 [@media(max-height:500px)]:col-start-2 [@media(max-height:500px)]:row-start-1 [@media(max-height:500px)]:self-center [@media(max-height:500px)]:truncate [@media(max-height:500px)]:pr-10 [@media(max-height:500px)]:text-[15px]',
  board: 'mt-3 min-h-[240px] flex-1 [@media(max-height:500px)]:col-span-3 [@media(max-height:500px)]:row-start-2 [@media(max-height:500px)]:mt-0 [@media(max-height:500px)]:min-h-0',
  step: 'mt-3 text-[12px] text-ink-3 [@media(max-height:500px)]:col-start-1 [@media(max-height:500px)]:row-start-3 [@media(max-height:500px)]:mt-0 [@media(max-height:500px)]:self-center [@media(max-height:500px)]:whitespace-nowrap',
  caption:
    'mt-1 min-h-[2.75em] break-words text-[16px] leading-snug [@media(max-height:500px)]:col-start-2 [@media(max-height:500px)]:row-start-3 [@media(max-height:500px)]:mt-0 [@media(max-height:500px)]:line-clamp-2 [@media(max-height:500px)]:min-h-0 [@media(max-height:500px)]:self-center [@media(max-height:500px)]:text-[14px]',
  buttons:
    'mt-4 flex flex-wrap items-center gap-2 [@media(max-height:500px)]:col-start-3 [@media(max-height:500px)]:row-start-3 [@media(max-height:500px)]:mt-0 [@media(max-height:500px)]:flex-nowrap',
};

/** True when a key press is typing into a field, not presenting: the keys are the field's then. */
const typing = (e: KeyboardEvent) => e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]') !== null;

/**
 * While `on`, everything on the page but `ref`'s element is inert: each sibling of it and of each of its ancestors,
 * up to <body> (the project navigation, the mobile bar, the page around Present). So the focus can't leave full
 * screen for a control hidden under it. It takes off exactly the marks it put on.
 */
export function useInertOutside(ref: RefObject<HTMLElement | null>, on: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const marked: Element[] = [];
    for (let node: Element = el; node !== document.body && node.parentElement; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node || sibling.hasAttribute('inert')) continue;
        sibling.setAttribute('inert', '');
        marked.push(sibling);
      }
    }
    return () => {
      for (const m of marked) m.removeAttribute('inert');
    };
  }, [ref, on]);
}

/**
 * The data a chapter draws from, fetched as the rest of the app fetches it, so the caches are shared: a diagram or a
 * flow is its item's (every item's thread is t-<item id>); the tables are every database item that isn't parked, of
 * every type whose screen is the database screen (the project home lists the enabled ones), in item-id order, as
 * core's drawnItems has them.
 */
function useSource(repo: string, project: string, drawing: Chapter['drawing']): Source {
  const itemId = drawing && drawing.kind !== 'tables' ? drawing.itemId : null;
  const threadId = `t-${itemId}`;
  const thread = useQuery({ queryKey: ['thread', repo, project, threadId], queryFn: () => api.thread(repo, project, threadId), enabled: itemId !== null, retry: false });
  const tables = drawing?.kind === 'tables';
  const home = useQuery({ queryKey: ['projectHome', repo, project], queryFn: () => api.projectHome(repo, project), enabled: tables });
  const typeIds = (home.data?.types ?? []).filter((t) => t.screen === 'database').map((t) => t.id);
  const rows = useQueries({
    queries: typeIds.map((typeId) => ({ queryKey: ['typeItems', repo, project, typeId], queryFn: () => api.typeItems(repo, project, typeId), enabled: tables, retry: false })),
  });

  if (!drawing) return { state: 'missing' };
  if (drawing.kind === 'tables') {
    if (home.error || rows.some((r) => r.error) || (home.data && typeIds.length === 0)) return { state: 'missing' };
    if (!home.data || rows.some((r) => !r.data)) return { state: 'loading' };
    const items = rows.flatMap((r) => r.data!.items).filter((r) => r.status !== 'parked' && r.data !== null);
    return { state: 'ready', data: items.sort((a, b) => a.id.localeCompare(b.id)).map((r) => r.data) };
  }
  if (thread.error) return { state: 'missing' };
  if (!thread.data) return { state: 'loading' };
  const screen = drawing.kind === 'diagram' ? 'diagram' : 'flows';
  return thread.data.type.screen === screen ? { state: 'ready', data: thread.data.item.data } : { state: 'missing' };
}

/** The board for a drawing: laid out once per data (a refetch with equal data doesn't lay it out again). */
function useBoard(drawing: Drawing | null, source: Source): { state: 'loading' } | { state: 'drawn'; board: Board | null } {
  const key = source.state === 'ready' ? JSON.stringify([drawing, source.data]) : null;
  const [drawn, setDrawn] = useState<{ key: string; board: Board | null } | null>(null);
  useEffect(() => {
    if (!drawing || key === null || source.state !== 'ready') return;
    let live = true;
    // A layout that fails is as good as nothing to draw: the notes still show.
    layoutBoard(drawing, source.data).then(
      (board) => live && setDrawn({ key, board }),
      () => live && setDrawn({ key, board: null }),
    );
    return () => {
      live = false;
    };
    // `key` stands for the drawing and its data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!drawing || source.state === 'missing') return { state: 'drawn', board: null };
  if (source.state === 'loading' || drawn?.key !== key) return { state: 'loading' };
  return { state: 'drawn', board: drawn.board };
}

function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="block">
      <path d={back ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6 4.5 9.5'} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Present: the defense drawn on a whiteboard, chapter by chapter. Each step adds parts of the chapter's drawing and its
 * marker notes, with a caption to say out loud. ◀ ▶ (or ← →) step, across chapter ends; Home and End go to the
 * chapter's first and last step; Replay draws the chapter again from step 1; Full screen covers the window (and the
 * screen, where the browser can), and Esc or ✕ leaves it. Moving on draws the new parts; going back shows the step at
 * once, and so does everything when you've asked for reduced motion. The page keeps the place, so Study and back
 * keeps it.
 */
export function PresentView(props: PresentViewProps) {
  const presenter = props.view.defense.presenter;
  if (!presenter?.chapters.length) {
    return (
      <p data-testid="present-old" className="mt-6 text-[13px] text-ink-2">
        {OLD}
      </p>
    );
  }
  return <Presenting {...props} presenter={presenter} />;
}

function Presenting({ repo, project, place, onPlace, presenter }: PresentViewProps & { presenter: Presenter }) {
  const chapters = presenter.chapters;
  const c = Math.min(Math.max(place.chapter, 0), chapters.length - 1);
  const chapter = chapters[c]!;
  const steps = chapter.steps;
  const at = Math.min(Math.max(place.step, 0), Math.max(steps.length - 1, 0));
  const reduced = useReducedMotion();
  // How the step on show came: drawn (onwards, a new chapter or Replay) or shown at once (back, Home or End). Coming
  // back to a step past the first (from Study, say) shows it at once: its board is already what was there.
  const [how, setHow] = useState<'draw' | 'still'>(() => (place.step > 0 ? 'still' : 'draw'));
  const [replayKey, setReplayKey] = useState(0);
  const [full, setFull] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const fullButton = useRef<HTMLButtonElement>(null);
  const leaveButton = useRef<HTMLButtonElement>(null);
  // For the browser's full screen, which comes and goes a moment after the overlay: whether the overlay is up, and
  // whether the browser's full screen is the overlay's.
  const overlayUp = useRef(false);
  const browserFull = useRef(false);
  // Set when leaving full screen, so the Full screen button gets the focus back once it's there again.
  const refocus = useRef(false);
  useInertOutside(frame, full);
  const area = useRef<HTMLDivElement>(null);
  // Opening Present (the mode, or the address) brings its top into view once, so the heading, the board, the caption
  // and the buttons are on screen together. Not on a step or a chapter: nothing should move under the pointer then.
  // jsdom has no scrollIntoView.
  useEffect(() => {
    const el = area.current;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  }, []);

  const source = useSource(repo, project, chapter.drawing);
  const drawn = useBoard(chapter.drawing, source);
  const board = drawn.state === 'drawn' ? drawn.board : null;
  const animate = !reduced && how === 'draw';
  const first = c === 0 && at === 0;
  const last = c === chapters.length - 1 && at >= steps.length - 1;
  const cls = full ? FULL : PAGE;

  const go = (chapterAt: number, stepAt: number, next: 'draw' | 'still') => {
    setHow(next);
    onPlace({ chapter: chapterAt, step: stepAt });
  };
  const forward = () => {
    if (at < steps.length - 1) go(c, at + 1, 'draw');
    else if (c < chapters.length - 1) go(c + 1, 0, 'draw');
  };
  const back = () => {
    if (at > 0) go(c, at - 1, 'still');
    else if (c > 0) go(c - 1, Math.max(chapters[c - 1]!.steps.length - 1, 0), 'still');
  };
  const replay = () => {
    setReplayKey((k) => k + 1);
    go(c, 0, 'draw');
  };
  const enter = () => {
    overlayUp.current = true;
    setFull(true);
    // The browser's own full screen too, where it has one (not on an iPhone): it needs this click.
    const el = frame.current;
    if (el && document.fullscreenEnabled && typeof el.requestFullscreen === 'function') el.requestFullscreen().catch(() => undefined);
  };
  const leave = () => {
    overlayUp.current = false;
    refocus.current = true;
    setFull(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  };

  // The keys, while you aren't typing in a field: ← → step, Home and End, Esc leaves full screen. Space and Enter stay
  // with the focused control. In full screen, Tab goes round its own controls: everything else is inert, so past the
  // last one the browser would otherwise take the focus out of the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (full && e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const controls = Array.from(frame.current?.querySelectorAll<HTMLElement>('button, select') ?? []).filter((el) => el.getClientRects().length > 0);
        const [start, end] = [controls[0], controls.at(-1)];
        if (start && end && document.activeElement === (e.shiftKey ? start : end)) {
          e.preventDefault();
          (e.shiftKey ? end : start).focus();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      if (e.key === 'Escape' && full) {
        e.preventDefault();
        leave();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        forward();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Home') {
        e.preventDefault();
        go(c, 0, 'still');
      } else if (e.key === 'End') {
        e.preventDefault();
        go(c, Math.max(steps.length - 1, 0), 'still');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // While it covers the window, the focus is on ✕ and the page under it doesn't scroll. Once it's gone, the focus goes
  // back to Full screen.
  useEffect(() => {
    if (!full) {
      if (refocus.current) fullButton.current?.focus();
      refocus.current = false;
      return;
    }
    leaveButton.current?.focus();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = overflow;
    };
  }, [full]);

  // The browser's full screen follows the overlay. One that arrives after the overlay has gone is left at once; when
  // the browser leaves its own (its Esc), the overlay goes too; and leaving the page leaves it.
  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement) {
        if (document.fullscreenElement !== frame.current) return;
        if (overlayUp.current) browserFull.current = true;
        else document.exitFullscreen().catch(() => undefined);
      } else if (browserFull.current) {
        browserFull.current = false;
        if (overlayUp.current) {
          overlayUp.current = false;
          refocus.current = true;
          setFull(false);
        }
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const step = steps[at];
  return (
    <div
      ref={frame}
      data-testid={full ? 'present-overlay' : undefined}
      role={full ? 'dialog' : undefined}
      aria-modal={full || undefined}
      aria-label={full ? 'Present' : undefined}
      className={cls.frame}
    >
      {full && (
        <button
          ref={leaveButton}
          type="button"
          aria-label="Leave full screen"
          onClick={leave}
          className={buttonClass({ size: 'sm', className: 'absolute right-4 top-4 z-10 [@media(max-height:500px)]:top-2' })}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="block">
            <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        </button>
      )}
      <div ref={area} data-testid="present" className={cls.present}>
        <div data-testid="present-chapters" className={cls.chapters}>
          <label className={cls.menu}>
            Chapters
            <select value={c} onChange={(e) => go(Number(e.target.value), 0, 'draw')} className={`${inputClass} min-w-0 font-normal`}>
              {chapters.map((ch, i) => (
                <option key={ch.id} value={i}>
                  {i + 1}. {ch.title}
                </option>
              ))}
            </select>
          </label>
          <nav aria-label="Chapters" className={cls.rail}>
            <p className="text-[12px] font-semibold text-ink-3">Chapters</p>
            <ol className="mt-1.5 flex flex-col gap-0.5">
              {chapters.map((ch, i) => (
                <li key={ch.id}>
                  <button
                    type="button"
                    aria-current={i === c ? 'step' : undefined}
                    onClick={() => go(i, 0, 'draw')}
                    className={`w-full rounded-[6px] px-2 py-1 text-left text-[13px] focus-visible:outline-2 focus-visible:outline-slate ${i === c ? 'bg-selection font-semibold text-ink' : 'text-ink-2'}`}
                  >
                    {i + 1}. {ch.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <div className={cls.column}>
          <h3 className={cls.title}>
            {c + 1}. {chapter.title}
          </h3>
          <p data-testid="present-landscape-hint" className="mt-1 hidden text-[12.5px] text-ink-3 max-md:portrait:block">
            {SIDEWAYS}
          </p>
          <div className={cls.board}>
            <BoardView
              key={c}
              board={board}
              steps={drawn.state === 'loading' ? NO_STEPS : steps}
              step={at}
              animate={animate}
              replayKey={replayKey}
              message={drawn.state === 'loading' ? 'Drawing…' : chapter.drawing && !board ? NOTHING : null}
              fill={full}
            />
          </div>
          <p data-testid="present-step" className={cls.step}>
            Step {at + 1} of {steps.length}
          </p>
          <p data-testid="present-caption" aria-live="polite" className={cls.caption}>
            {step?.caption}
          </p>
          <div className={cls.buttons}>
            {/* At either end they wait, marked aria-disabled rather than disabled, so a focused one keeps the focus. */}
            <button
              type="button"
              data-testid="present-prev"
              aria-label="Previous step"
              aria-disabled={first || undefined}
              onClick={back}
              className={buttonClass({ size: 'sm', className: 'h-7 w-8 max-md:h-11 max-md:w-11' })}
            >
              <Chevron back />
            </button>
            <button
              type="button"
              data-testid="present-next"
              aria-label="Next step"
              aria-disabled={last || undefined}
              onClick={forward}
              className={buttonClass({ size: 'sm', className: 'h-7 w-8 max-md:h-11 max-md:w-11' })}
            >
              <Chevron />
            </button>
            <button type="button" data-testid="present-replay" onClick={replay} className={buttonClass({ size: 'sm', className: 'h-7' })}>
              Replay
            </button>
            {!full && (
              <button ref={fullButton} type="button" data-testid="present-fullscreen" onClick={enter} className={buttonClass({ size: 'sm', className: 'h-7' })}>
                Full screen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
