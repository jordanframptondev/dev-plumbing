import type { DiagramData, FlowData, TableDiff } from './data';
import type { Drawing } from './whiteboard';

// What Present may draw (spec §12): a diagram item, the project's tables or a system flow. A presenter's steps name the
// parts of a drawing by typed refs, so an id is never ambiguous: node:, edge: and group: for a diagram, table: and
// link: for the tables, lane: and step: for a flow. These are pure, so the web draws a board by the same rules the
// service checks a presenter with. store/drawings.ts reads a project's own drawings.

/** A part of a drawing that a step's `reveal` and a note's `near` may name, with its label. */
export type DrawingPart = { ref: string; label: string };
/** A drawing this project has, for the whiteboard subagent's pack and for checking a presenter. */
export type DrawingOption = { drawing: NonNullable<Drawing>; title: string; parts: DrawingPart[] };
/**
 * A drawing's parts, in drawing order, and what revealing each one also puts on the board (`brings`, by ref): a line
 * its two ends, a flow step the lanes it goes between, and a box the group it's in.
 */
export type DrawingParts = { parts: DrawingPart[]; brings: Record<string, string[]> };

export const refKinds = ['node', 'edge', 'group', 'table', 'link', 'lane', 'step'] as const;
export type RefKind = (typeof refKinds)[number];

/** A part's label is cut to this many characters (ending "…"), so a flow of long steps doesn't swell the pack. */
const LABEL_MAX = 120;
const clipLabel = (label: string) => (label.length <= LABEL_MAX ? label : `${label.slice(0, LABEL_MAX - 1)}…`);

type Field = TableDiff['fields'][number];

const PRISMA_SCALARS = new Set(['String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes']);

/** The model a field points at, or null. Enums look like models, so a field counts as a relation only when its type is
 *  another of the tables, a list (`Order[]`), or comes with a matching foreign key (`customer Customer` + `customerId`). */
export function relationTarget(field: Field, table: TableDiff, models: Set<string>): string | null {
  const written = field.type.trim().split(/\s+/)[0] ?? '';
  const base = written.replace(/\?$/, '').replace(/\[\]$/, '');
  if (!/^[A-Z]\w*$/.test(base) || PRISMA_SCALARS.has(base)) return null;
  if (models.has(base) || written.endsWith('[]')) return base;
  return table.fields.some((f) => f.name === `${field.name}Id`) ? base : null;
}

/**
 * The tables as one diagram, the Database screen's relationship strip: a box per table (removed ones marked), unchanged
 * boxes for the models they point at, and a line per relation. Box ids are model names, and line ids
 * `${model}.${field}`. One table still draws: the Database screen leaves out a strip of fewer than two boxes itself.
 */
export function tablesDrawing(tables: TableDiff[]): DiagramData {
  const models = new Set(tables.map((t) => t.model));
  const nodes = new Map<string, DiagramData['nodes'][number]>();
  for (const t of tables) {
    if (nodes.has(t.model)) continue;
    nodes.set(t.model, { id: t.model, label: t.change === 'removed' ? `${t.model} (removed)` : t.model, status: t.change === 'new' ? 'new' : 'changed' });
  }
  const edges = new Map<string, DiagramData['edges'][number]>();
  const related = new Set<string>();
  for (const t of tables) {
    for (const f of t.fields) {
      if (f.change === 'removed') continue;
      const to = relationTarget(f, t, models);
      if (!to || to === t.model) continue;
      if (!models.has(to)) related.add(to);
      const id = `${t.model}.${f.name}`;
      if (!edges.has(id)) edges.set(id, { id, from: t.model, to, label: f.name });
    }
  }
  for (const m of [...related].sort()) nodes.set(m, { id: m, label: m, status: 'unchanged' });
  return { kind: 'system', groups: [], nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** `node:job` -> { kind: 'node', id: 'job' }. Null when the prefix isn't one of the seven, or nothing follows it. */
export function parseRef(ref: string): { kind: RefKind; id: string } | null {
  const at = ref.indexOf(':');
  if (at < 0) return null;
  const kind = ref.slice(0, at);
  const id = ref.slice(at + 1);
  return (refKinds as readonly string[]).includes(kind) && id ? { kind: kind as RefKind, id } : null;
}

/** One key per drawing: 'diagram:<itemId>', 'tables' or 'flow:<itemId>'. Two drawings are the same when their keys are. */
export function drawingKey(d: NonNullable<Drawing>): string {
  return d.kind === 'tables' ? 'tables' : `${d.kind}:${d.itemId}`;
}

/**
 * A diagram's boxes, then its lines, then its groups that hold a box, as refs: node:/edge: for a diagram, table:/link:
 * for the tables. A group with no boxes is left out: the layout drops it, so revealing it would draw nothing.
 */
function boxesAndLines(d: DiagramData, box: 'node' | 'table', line: 'edge' | 'link'): DrawingParts {
  const labels = new Map(d.nodes.map((n) => [n.id, n.label]));
  const parts: DrawingPart[] = [];
  const brings: Record<string, string[]> = {};
  for (const n of d.nodes) {
    parts.push({ ref: `${box}:${n.id}`, label: clipLabel(n.label) });
    if (n.group !== undefined) brings[`${box}:${n.id}`] = [`group:${n.group}`];
  }
  for (const e of d.edges) {
    // A diagram's line is named by its label, else by its ends; a link by its field and the table it points at.
    const label = line === 'link' ? `${e.id} → ${e.to}` : e.label?.trim() ? e.label : `${labels.get(e.from) ?? e.from} → ${labels.get(e.to) ?? e.to}`;
    parts.push({ ref: `${line}:${e.id}`, label: clipLabel(label) });
    brings[`${line}:${e.id}`] = [`${box}:${e.from}`, `${box}:${e.to}`];
  }
  const held = new Set(d.nodes.flatMap((n) => (n.group === undefined ? [] : [n.group])));
  for (const g of d.groups) if (held.has(g.id)) parts.push({ ref: `group:${g.id}`, label: clipLabel(g.label) });
  return { parts, brings };
}

/**
 * The parts of a drawing, from its data: a diagram's boxes (node:), lines (edge:) and groups (group:); the tables'
 * boxes (table:) and links (link:), drawn as tablesDrawing draws them; a flow's lanes (lane:), then its steps (step:<n>)
 * in step order, each labelled with the lanes it joins ("Job → Mailer: Hands over the reminder"), since the pack
 * doesn't carry a flow's data.
 */
export function drawingParts(source: { kind: 'diagram'; data: DiagramData } | { kind: 'tables'; tables: TableDiff[] } | { kind: 'flow'; data: FlowData }): DrawingParts {
  if (source.kind === 'diagram') return boxesAndLines(source.data, 'node', 'edge');
  if (source.kind === 'tables') return boxesAndLines(tablesDrawing(source.tables), 'table', 'link');
  const lanes = source.data.lanes ?? [];
  const laneIds = new Set(lanes.map((l) => l.id));
  const laneLabel = new Map(lanes.map((l) => [l.id, l.label]));
  const parts: DrawingPart[] = lanes.map((l) => ({ ref: `lane:${l.id}`, label: clipLabel(l.label) }));
  const brings: Record<string, string[]> = {};
  for (const s of [...source.data.steps].sort((a, b) => a.n - b.n)) {
    const from = s.from === undefined ? undefined : laneLabel.get(s.from);
    const to = s.to === undefined ? undefined : laneLabel.get(s.to);
    const joins = from !== undefined && to !== undefined ? `${from} → ${to}: ` : from !== undefined || to !== undefined ? `${from ?? to}: ` : '';
    parts.push({ ref: `step:${s.n}`, label: clipLabel(`${joins}${s.label}`) });
    const ends = [...new Set([s.from, s.to])].filter((id): id is string => id !== undefined && laneIds.has(id));
    if (ends.length) brings[`step:${s.n}`] = ends.map((id) => `lane:${id}`);
  }
  return { parts, brings };
}
