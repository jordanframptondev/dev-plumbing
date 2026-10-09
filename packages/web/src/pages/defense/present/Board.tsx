import type { NoteInk, PresentStep } from '@dev-plumbing/core/schemas';
import { motion } from 'motion/react';
import { useId, useMemo, type CSSProperties } from 'react';
import { shownAt, type Board, type BoardShape } from './boardLayout';
import { roughMarker, roughShape, type RoughPath } from './rough';

/** A note as the board places it: with the step (from 0) that writes it. */
export type BoardNote = PresentStep['notes'][number] & { step: number };

/**
 * §16's whiteboard inks: ink for structure, slate for data, seal for warnings, moss for "this is safe". Through the
 * theme's variables, so dark mode needs nothing extra.
 */
export const INK: Record<NoteInk, string> = { ink: 'var(--text)', slate: 'var(--slate)', seal: 'var(--seal)', moss: 'var(--moss)' };
const TONE: Record<Board['tone'], string> = { ink: 'var(--text)', slate: 'var(--slate)' };

/**
 * Seconds a part takes to draw, and between one new part and the next (Decision 7). A step that brings many parts
 * draws them closer together, so the last one starts within about 2.4 s.
 */
const DRAW = 0.6;
const STAGGER = 0.15;
const STAGGER_ALL = 2.4;
/** Room around what a chapter shows, and the smallest frame, in SVG units. */
const MARGIN = 28;
const MIN_W = 560;
const MIN_H = 220;
/** A note's text: 12.5 px, wrapped at about 34 characters a line. */
const NOTE_SIZE = 12.5;
const NOTE_LINE = 16;
const NOTE_CHARS = 34;
const CHAR_W = 6.8;
const DASH = '6 5';

type Box = { x: number; y: number; w: number; h: number };
/** A note on the board: the part it rings (`mark`), and where its text's box starts (`at`), below its first line. */
export type PlacedNote = { note: BoardNote; key: string; mark: Box; lines: string[]; at: Box };
/** A chapter's board, worked out once for all its steps, so nothing on it moves from one step to the next. */
export type ChapterBoard = {
  /** The notes written beside a part, each where it stays from its own step to the chapter's last. */
  placed: PlacedNote[];
  /** The notes for the list at the board's foot: `near` is "", or names nothing on show at the note's step. */
  listed: BoardNote[];
  /** The viewBox at every step: what the chapter shows by its last step, its rings and its notes, with a margin. */
  frame: Box | null;
};

/** Cuts a label to `chars`, keeping its start. */
const fit = (text: string, chars: number) => (text.length <= chars ? text : `${text.slice(0, Math.max(1, chars - 1))}…`);
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
/** The marker's ellipse round a part, as a box. */
const ringOf = (mark: Box): Box => ({ x: mark.x - 14, y: mark.y - 11, w: mark.w + 28, h: mark.h + 22 });
/** The smallest box round all of `boxes`. */
function union(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Breaks a note into lines of about NOTE_CHARS characters, at spaces. */
function wrap(text: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > NOTE_CHARS) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  return line ? [...lines, line] : lines;
}

/** A group's label as the board writes it (Label below), cut to the group's width. */
const groupLabel = (g: Extract<BoardShape, { kind: 'group' }>) => fit(g.label, Math.floor((g.w - 24) / 6.4));
/** Where a group's label sits, so a note doesn't cover it. */
const groupLabelBox = (g: Extract<BoardShape, { kind: 'group' }>): Box => ({ x: g.x + 12, y: g.y + 4, w: groupLabel(g).length * 6.4, h: 16 });

/** What a note's marker goes round: a box or a group, a line's label, or the middle of a line without one. */
function markOf(s: BoardShape): Box {
  if (s.kind !== 'line') return { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.label && s.labelX !== undefined && s.labelY !== undefined) {
    const w = s.label.length * 6 + 8;
    const x = s.anchor === 'start' ? s.labelX : s.anchor === 'end' ? s.labelX - w : s.labelX - w / 2;
    return { x, y: s.labelY - 12, w, h: 16 };
  }
  const i = Math.max(0, Math.floor((s.points.length - 2) / 2));
  const a = s.points[i] ?? { x: 0, y: 0 };
  const b = s.points[i + 1] ?? a;
  return { x: (a.x + b.x) / 2 - 20, y: (a.y + b.y) / 2 - 10, w: 40, h: 20 };
}

/** Where a shape is on the board: a box's or a group's rectangle; a line's points and its label. Null for nothing. */
function boundsOf(s: BoardShape): Box | null {
  if (s.kind !== 'line') return { x: s.x, y: s.y, w: s.w, h: s.h };
  const boxes: Box[] = s.points.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 }));
  if (s.label && s.labelX !== undefined && s.labelY !== undefined) boxes.push(markOf(s));
  return boxes.length ? union(boxes) : null;
}

/** The shape a note near `ref` rings: its box when it has several shapes (a lane's head, not its lifeline), else its one. */
function shapeFor(board: Board, ref: string): BoardShape | undefined {
  const all = board.shapes.filter((s) => s.ref === ref);
  return all.find((s) => s.kind === 'box') ?? all[0];
}

/**
 * A chapter's board, once for all its steps:
 * - the notes are placed step by step. A note whose `near` is on show at its step rings it, and its text goes below
 *   the ring, or else to its right, above it, to its left or at one of its corners: the first of those that covers
 *   nothing taken, or, when each covers something, the one that covers least. Taken is
 *   what's on the board at that step and everything later steps bring (boxes, line labels and group labels), so a
 *   part that comes later doesn't land on it, and the rings and notes placed before it. Then it stays there for the
 *   rest of the chapter. The other notes (`near` is "", or names nothing on show at their step) go in the list at
 *   the board's foot;
 * - the frame is everything the chapter shows by its last step, with every ring and note it places and a margin, at
 *   least MIN_W by MIN_H, centred. It's the same at every step, so the drawing never moves or changes size, and a
 *   chapter that shows a few parts of a big drawing draws them large. With nothing shown, it frames the whole board.
 */
export function chapterBoard(board: Board | null, steps: PresentStep[]): ChapterBoard {
  const placed: PlacedNote[] = [];
  const listed: BoardNote[] = [];
  const last = shownAt(board, steps, steps.length - 1);
  const taken: Box[] = (board?.shapes ?? []).filter((s) => last.has(s.ref)).map((s) => (s.kind === 'group' ? groupLabelBox(s) : markOf(s)));
  steps.forEach((step, k) => {
    const shown = shownAt(board, steps, k);
    step.notes.forEach((n, i) => {
      const note: BoardNote = { ...n, step: k };
      const shape = board && n.near && shown.has(n.near) ? shapeFor(board, n.near) : undefined;
      if (!shape) {
        listed.push(note);
        return;
      }
      const mark = markOf(shape);
      const ring = ringOf(mark);
      const lines = wrap(n.text);
      const w = Math.max(...lines.map((l) => l.length)) * CHAR_W;
      const h = lines.length * NOTE_LINE;
      const cx = mark.x + mark.w / 2;
      const cy = mark.y + mark.h / 2;
      // Below, right, above, left, then the four corners.
      const spots: Box[] = [
        { x: cx - w / 2, y: ring.y + ring.h + 4, w, h },
        { x: ring.x + ring.w + 6, y: cy - h / 2, w, h },
        { x: cx - w / 2, y: ring.y - 4 - h, w, h },
        { x: ring.x - 6 - w, y: cy - h / 2, w, h },
        { x: ring.x + ring.w - 10, y: ring.y + ring.h + 4, w, h },
        { x: ring.x + ring.w - 10, y: ring.y - 4 - h, w, h },
        { x: ring.x + 10 - w, y: ring.y + ring.h + 4, w, h },
        { x: ring.x + 10 - w, y: ring.y - 4 - h, w, h },
      ];
      const covered = (spot: Box) => taken.reduce((sum, t) => sum + overlapArea(spot, t), 0);
      const at = spots.find((spot) => !taken.some((t) => overlaps(spot, t))) ?? spots.reduce((a, b) => (covered(b) < covered(a) ? b : a));
      taken.push(ring, at);
      placed.push({ note, key: `${k}.${i}`, mark, lines, at });
    });
  });
  if (!board) return { placed, listed, frame: null };
  const boxes = [...board.shapes.filter((s) => last.has(s.ref)).flatMap((s) => boundsOf(s) ?? []), ...placed.flatMap((p) => [ringOf(p.mark), p.at])];
  const u = boxes.length ? union(boxes) : { x: 0, y: 0, w: board.width, h: board.height };
  const w = u.w + MARGIN * 2;
  const h = u.h + MARGIN * 2;
  const W = Math.max(w, MIN_W);
  const H = Math.max(h, MIN_H);
  return { placed, listed, frame: { x: u.x - MARGIN - (W - w) / 2, y: u.y - MARGIN - (H - h) / 2, w: W, h: H } };
}

const strokeStyle = (p: RoughPath, dashed: boolean): CSSProperties => ({
  fill: 'none',
  stroke: p.stroke,
  strokeWidth: p.strokeWidth,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeDasharray: dashed ? DASH : undefined,
});

/** Hand-drawn strokes: drawn along their length when new (a dashed one fades in, since Motion draws with the dashes). */
function Strokes({ paths, dashed, drawn, delay }: { paths: RoughPath[]; dashed: boolean; drawn: boolean; delay: number }) {
  return paths.map((p, k) =>
    drawn ? (
      <motion.path
        key={k}
        d={p.d}
        style={strokeStyle(p, dashed)}
        initial={dashed ? { opacity: 0 } : { pathLength: 0 }}
        animate={dashed ? { opacity: 1 } : { pathLength: 1 }}
        transition={{ duration: DRAW, delay, ease: 'easeInOut' }}
      />
    ) : (
      <path key={k} d={p.d} style={strokeStyle(p, dashed)} />
    ),
  );
}

/** A label in the system font, haloed in the canvas colour so it reads over lines and the dot grid. */
function Label({ shape, color, drawn, delay }: { shape: BoardShape; color: string; drawn: boolean; delay: number }) {
  let at: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; size: number; weight: number; text: string } | null = null;
  if (shape.kind === 'box') at = { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 + 4.5, anchor: 'middle', size: 13, weight: 500, text: fit(shape.label, Math.floor((shape.w - 16) / 7)) };
  else if (shape.kind === 'group') at = { x: shape.x + 12, y: shape.y + 18, anchor: 'start', size: 11.5, weight: 600, text: groupLabel(shape) };
  else if (shape.label && shape.labelX !== undefined && shape.labelY !== undefined) at = { x: shape.labelX, y: shape.labelY, anchor: shape.anchor ?? 'middle', size: 11.5, weight: 400, text: shape.label };
  if (!at) return null;
  const props = {
    x: at.x,
    y: at.y,
    textAnchor: at.anchor,
    style: { fill: color, fontSize: at.size, fontWeight: at.weight, paintOrder: 'stroke', stroke: 'var(--canvas)', strokeWidth: 3, strokeLinejoin: 'round' } as CSSProperties,
  };
  return drawn ? (
    <motion.text {...props} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay }}>
      {at.text}
    </motion.text>
  ) : (
    <text {...props}>{at.text}</text>
  );
}

function ShapeView({ shape, color, drawn, delay }: { shape: BoardShape; color: string; drawn: boolean; delay: number }) {
  const dashed = shape.kind === 'group' || shape.dashed;
  return (
    <g data-testid="board-shape" data-ref={shape.ref} data-kind={shape.kind}>
      {/* A box is the canvas inside, so the lines and dots under it don't show through. */}
      {shape.kind === 'box' && <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={6} style={{ fill: 'var(--canvas)' }} />}
      <Strokes paths={roughShape(shape, color)} dashed={dashed} drawn={drawn} delay={delay} />
      <Label shape={shape} color={color} drawn={drawn} delay={delay + DRAW * 0.6} />
    </g>
  );
}

function NoteView({ placed, drawn, delay }: { placed: PlacedNote; drawn: boolean; delay: number }) {
  const { note, mark, lines, at } = placed;
  const ink = INK[note.ink];
  const text = (
    <>
      {/* Each line but the last keeps its space, so the note reads as one sentence to a screen reader. */}
      {lines.map((line, j) => (
        <tspan key={j} x={at.x} dy={j ? NOTE_LINE : 0}>
          {j < lines.length - 1 ? `${line} ` : line}
        </tspan>
      ))}
    </>
  );
  const textProps = {
    x: at.x,
    y: at.y + NOTE_SIZE - 1,
    style: { fill: ink, fontSize: NOTE_SIZE, fontWeight: 500, paintOrder: 'stroke', stroke: 'var(--canvas)', strokeWidth: 3, strokeLinejoin: 'round' } as CSSProperties,
  };
  return (
    <g data-testid="board-note" data-near={note.near} data-ink={note.ink}>
      <Strokes paths={roughMarker(mark, `note:${placed.key}:${note.near}`, ink)} dashed={false} drawn={drawn} delay={delay} />
      {drawn ? (
        <motion.text {...textProps} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: delay + DRAW / 2 }}>
          {text}
        </motion.text>
      ) : (
        <text {...textProps}>{text}</text>
      )}
    </g>
  );
}

/**
 * The whiteboard: the canvas with a faint dot grid, the chapter's drawing as far as `step` goes, drawn by hand in ink
 * (slate for the tables), and the notes so far in their own inks. When `animate`, the parts this step adds draw
 * themselves one after another and this step's notes fade in; otherwise everything is there at once. A new
 * `replayKey` draws them again. The notes and the frame are worked out once for the chapter (chapterBoard), so moving
 * between steps adds to the board and never moves what's on it. With `fill` (full screen) the board takes the height
 * it's given; in the page it's as tall as the chapter's frame is for its width (aspect-ratio), within 220 px and the
 * window's height less 220, so a wide drawing isn't a thin band in a tall box, and the board's height changes only
 * between chapters. The frame fits inside either way. With no board (a chapter that draws nothing, or a drawing
 * that's gone), the notes are a list, under `message` when there is one. The list holds a place for the chapter's
 * later foot notes, so the drawing above it keeps its size.
 */
export function BoardView({
  board,
  steps,
  step,
  animate,
  replayKey,
  message = null,
  fill = false,
}: {
  board: Board | null;
  /** The chapter's steps. */
  steps: PresentStep[];
  /** The step on show, from 0: its parts and notes are the new ones. */
  step: number;
  animate: boolean;
  replayKey: number;
  message?: string | null;
  /** Full screen: the board takes the height it's given. */
  fill?: boolean;
}) {
  const grid = `dp-grid-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const { placed, listed, frame } = useMemo(() => chapterBoard(board, steps), [board, steps]);
  const color = TONE[board?.tone ?? 'ink'];
  const shown = shownAt(board, steps, step);
  const before = step > 0 ? shownAt(board, steps, step - 1) : new Set<string>();
  // The parts this step adds draw in the board's order, one after another; its notes come once they're done.
  const order = [...new Set((board?.shapes ?? []).filter((s) => shown.has(s.ref) && !before.has(s.ref)).map((s) => s.ref))];
  const stagger = Math.min(STAGGER, STAGGER_ALL / order.length);
  const delayOf = (ref: string) => Math.max(0, order.indexOf(ref)) * stagger;
  const notesAt = order.length * stagger + DRAW / 2;
  // In the page, the chapter's frame sets the board's shape: as wide as the column, as tall as that makes it, between
  // 220 px and the window less 220 (so the caption and the buttons fit under it once Present is in view).
  const size: CSSProperties | undefined = fill
    ? undefined
    : { ...(frame ? { aspectRatio: `${frame.w} / ${frame.h}` } : {}), minHeight: 220, maxHeight: 'calc(100dvh - 220px)' };

  return (
    <figure
      data-testid="board"
      data-animate={animate ? 'true' : 'false'}
      className={`relative m-0 flex flex-col overflow-hidden rounded-[12px] border-[0.5px] border-separator bg-canvas ${fill ? 'h-full' : 'w-full'}`}
      style={size}
    >
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <pattern id={grid} data-testid="board-grid" width={20} height={20} patternUnits="userSpaceOnUse">
            <circle cx={10} cy={10} r={1.1} style={{ fill: 'var(--separator)' }} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${grid})`} />
      </svg>
      {message && <p className="relative px-4 pt-4 text-[13px] text-ink-3">{message}</p>}
      {board && frame && (
        // The default xMidYMid meet fits the frame inside whatever room the board has.
        <svg
          viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
          width="100%"
          className="relative block min-h-0 flex-1"
          style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
        >
          {board.shapes.map((s, i) =>
            shown.has(s.ref) ? <ShapeView key={`${replayKey}:${s.ref}:${i}`} shape={s} color={color} drawn={animate && !before.has(s.ref)} delay={delayOf(s.ref)} /> : null,
          )}
          {placed
            .filter((p) => p.note.step <= step)
            .map((p) => (
              <NoteView key={`${replayKey}:${p.key}`} placed={p} drawn={animate && p.note.step === step} delay={notesAt} />
            ))}
        </svg>
      )}
      {listed.length > 0 && (
        <ul className={`relative flex shrink-0 flex-col gap-1.5 overflow-y-auto px-5 pb-4 pt-4 text-[14px] leading-snug ${board ? 'max-h-[45%]' : ''}`}>
          {listed.map((n, i) =>
            n.step > step ? (
              // A later step's note, kept out of sight: its room is held, so the drawing doesn't shrink when it comes.
              <li key={`${replayKey}:${i}`} aria-hidden="true" className="break-words font-medium" style={{ visibility: 'hidden' }}>
                {n.text}
              </li>
            ) : (
              <motion.li
                key={`${replayKey}:${i}`}
                data-testid="board-note"
                data-near={n.near}
                data-ink={n.ink}
                className="break-words font-medium"
                style={{ color: INK[n.ink] }}
                initial={animate && n.step === step ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: notesAt }}
              >
                {n.text}
              </motion.li>
            ),
          )}
        </ul>
      )}
    </figure>
  );
}
