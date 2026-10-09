import { parseData, tablesDrawing, type DiagramData, type Drawing, type FlowData, type PresentStep } from '@dev-plumbing/core/schemas';
import { layoutDiagram, type DiagramLayout } from '../../../diagram/layout';
import { sequenceLayout } from '../../../diagram/sequenceLayout';

type Point = { x: number; y: number };

/**
 * One drawable shape on the board, keyed by the ref a presenter's `reveal` and `near` name: what to draw, and where a
 * note's marker goes. A ref can have more than one shape (a lane is its head and its lifeline); they show together.
 * A line's `ends` are the refs it joins, which show with it; a group's `members` are its boxes.
 */
export type BoardShape =
  | { ref: string; kind: 'box'; x: number; y: number; w: number; h: number; label: string; dashed: boolean }
  | {
      ref: string;
      kind: 'line';
      points: Point[];
      /** The label's text sits on labelY (its baseline), anchored at labelX by `anchor` (the middle when not given). */
      label?: string;
      labelX?: number;
      labelY?: number;
      anchor?: 'start' | 'middle' | 'end';
      arrow: boolean;
      dashed: boolean;
      ends: string[];
    }
  | { ref: string; kind: 'group'; x: number; y: number; w: number; h: number; label: string; members: string[] };
/** A chapter's drawing, laid out. `tone` is its ink: slate for the tables, ink for the rest (§16's whiteboard). */
export type Board = { width: number; height: number; shapes: BoardShape[]; tone: 'ink' | 'slate' };

/** The ref prefixes of a drawing drawn as boxes and lines (Decision 4). */
type Prefixes = { box: string; line: string; group: string };
const DIAGRAM: Prefixes = { box: 'node:', line: 'edge:', group: 'group:' };
const TABLES: Prefixes = { box: 'table:', line: 'link:', group: 'group:' };

/** Groups first, then lines, then boxes, so boxes are drawn over the lines that reach them. */
function diagramShapes(data: DiagramData, layout: DiagramLayout, p: Prefixes): BoardShape[] {
  const edges = new Map(data.edges.map((e) => [e.id, e]));
  return [
    ...layout.groups.map((g): BoardShape => ({
      ref: p.group + g.id,
      kind: 'group',
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      label: g.label,
      members: data.nodes.filter((n) => n.group === g.id).map((n) => p.box + n.id),
    })),
    ...layout.edges
      .filter((e) => e.points.length >= 2 && edges.has(e.id))
      .map((e): BoardShape => {
        const source = edges.get(e.id)!;
        return {
          ref: p.line + e.id,
          kind: 'line',
          points: e.points,
          // ELK gives the label's middle; the board wants its baseline.
          ...(e.label ? { label: e.label, labelX: e.labelX, labelY: e.labelY + 3.5 } : {}),
          arrow: true,
          dashed: e.dashed,
          ends: [p.box + source.from, p.box + source.to],
        };
      }),
    ...layout.nodes.map((n): BoardShape => ({ ref: p.box + n.id, kind: 'box', x: n.x, y: n.y, w: n.w, h: n.h, label: n.label, dashed: n.status === 'external' })),
  ];
}

/** A system flow as a sequence: each lane's head and lifeline, then each step's arrow, loop or note. */
function flowShapes(flow: FlowData): Board {
  const layout = sequenceLayout(flow);
  const steps = [...flow.steps].sort((a, b) => a.n - b.n);
  const lanes = new Set(layout.lanes.map((l) => l.id));
  const shapes: BoardShape[] = layout.lanes.flatMap((l): BoardShape[] => [
    { ref: `lane:${l.id}`, kind: 'line', points: [{ x: l.x, y: l.lifeTop }, { x: l.x, y: l.lifeBottom }], arrow: false, dashed: true, ends: [] },
    { ref: `lane:${l.id}`, kind: 'box', x: l.x - l.headW / 2, y: l.headY, w: l.headW, h: l.headH, label: l.label, dashed: l.status === 'external' },
  ]);
  layout.steps.forEach((s, k) => {
    const step = steps[k]!;
    const ends = [...new Set([step.from, step.to])].filter((id): id is string => id !== undefined && lanes.has(id)).map((id) => `lane:${id}`);
    const points: Point[] =
      s.shape === 'arrow'
        ? [{ x: s.x1, y: s.y }, { x: s.x2, y: s.y }]
        : s.shape === 'loop'
          ? [{ x: s.x1, y: s.y - 8 }, { x: s.x2, y: s.y - 8 }, { x: s.x2, y: s.y + 8 }, { x: s.x1, y: s.y + 8 }]
          : [];
    shapes.push({ ref: `step:${s.n}`, kind: 'line', points, label: s.label, labelX: s.labelX, labelY: s.labelY, anchor: s.anchor, arrow: s.shape !== 'note', dashed: false, ends });
  });
  return { width: layout.width, height: layout.height, shapes, tone: 'ink' };
}

/**
 * Lays a chapter's drawing out, from its data as the app has it: a diagram item's or a flows item's `data`, or, for
 * the tables, the `data` of every database item that isn't parked. Diagrams and tables use layoutDiagram (ELK, left to
 * right); flows use sequenceLayout. Null when the data doesn't parse, or no longer draws (a flow that's now only a
 * user flow, or no tables left), so the board shows that there's nothing to draw.
 */
export async function layoutBoard(drawing: NonNullable<Drawing>, data: unknown): Promise<Board | null> {
  if (drawing.kind === 'diagram') {
    const parsed = parseData('diagram', data);
    if (!parsed.ok) return null;
    const layout = await layoutDiagram(parsed.data, 'RIGHT');
    return { width: layout.width, height: layout.height, shapes: diagramShapes(parsed.data, layout, DIAGRAM), tone: 'ink' };
  }
  if (drawing.kind === 'tables') {
    const tables = (Array.isArray(data) ? data : []).flatMap((d) => {
      const parsed = parseData('database', d);
      return parsed.ok ? [parsed.data] : [];
    });
    if (!tables.length) return null;
    const strip = tablesDrawing(tables);
    const layout = await layoutDiagram(strip, 'RIGHT');
    return { width: layout.width, height: layout.height, shapes: diagramShapes(strip, layout, TABLES), tone: 'slate' };
  }
  const parsed = parseData('flows', data);
  if (!parsed.ok || parsed.data.kind === 'user' || !parsed.data.lanes?.length) return null;
  return flowShapes(parsed.data);
}

/**
 * What's on the board after `step` (from 0): every ref the steps so far revealed that the board has (a ref the data
 * no longer has is skipped), each shown line's ends, and every group with a box on show.
 */
export function shownAt(board: Board | null, steps: PresentStep[], step: number): Set<string> {
  const shown = new Set<string>();
  if (!board) return shown;
  const refs = new Set(board.shapes.map((s) => s.ref));
  for (const s of steps.slice(0, step + 1)) for (const ref of s.reveal) if (refs.has(ref)) shown.add(ref);
  for (const s of board.shapes) if (s.kind === 'line' && shown.has(s.ref)) for (const end of s.ends) if (refs.has(end)) shown.add(end);
  for (const s of board.shapes) if (s.kind === 'group' && s.members.some((m) => shown.has(m))) shown.add(s.ref);
  return shown;
}
