import type { DiagramData, NodeStatus } from '@dev-plumbing/core/schemas';
import type { ELK, ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';

export type Direction = 'RIGHT' | 'DOWN';
export type DiagramLayout = {
  width: number;
  height: number;
  groups: { id: string; label: string; x: number; y: number; w: number; h: number }[];
  nodes: { id: string; label: string; status: NodeStatus; path: string | null; x: number; y: number; w: number; h: number }[];
  edges: { id: string; points: { x: number; y: number }[]; label: string | null; labelX: number; labelY: number; dashed: boolean }[];
};

// ELK needs ids unique across the whole graph, and a group may share an id with a box, so each kind gets a prefix.
const GROUP = 'g:';
const NODE = 'n:';
const EDGE = 'e:';

const ROOT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.spacing.nodeNode': '24',
  'elk.layered.spacing.nodeNodeBetweenLayers': '48',
};
/** Room for the group's label above its boxes. */
const GROUP_OPTIONS = { 'elk.padding': '[top=28,left=16,bottom=16,right=16]' };

/** Wide enough for the label at 12.5 px, between 132 and 240. */
export const nodeWidth = (label: string) => Math.min(240, Math.max(132, label.length * 7 + 32));
/** Boxes with a file reference have a second line for its path. */
export const nodeHeight = (hasPath: boolean) => (hasPath ? 50 : 36);

/** The ELK graph for a diagram: groups hold their boxes, every line sits at the root so ELK routes it across groups. Pure. */
export function toElkGraph(data: DiagramData, direction: Direction): ElkNode {
  const box = (n: DiagramData['nodes'][number]): ElkNode => ({ id: NODE + n.id, width: nodeWidth(n.label), height: nodeHeight(Boolean(n.codeRef)) });
  const groupIds = new Set(data.groups.map((g) => g.id));
  const groups: ElkNode[] = data.groups
    .map((g) => ({ id: GROUP + g.id, layoutOptions: GROUP_OPTIONS, children: data.nodes.filter((n) => n.group === g.id).map(box) }))
    .filter((g) => g.children.length > 0);
  const loose = data.nodes.filter((n) => !n.group || !groupIds.has(n.group)).map(box);
  const nodeIds = new Set(data.nodes.map((n) => n.id));
  const edges: ElkExtendedEdge[] = data.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({
      id: EDGE + e.id,
      sources: [NODE + e.from],
      targets: [NODE + e.to],
      ...(e.label ? { labels: [{ text: e.label, width: e.label.length * 6.5 + 8, height: 14 }] } : {}),
    }));
  return { id: 'root', layoutOptions: { ...ROOT_OPTIONS, 'elk.direction': direction }, children: [...groups, ...loose], edges };
}

type Point = { x: number; y: number };

/** The middle of the longest segment: where a label sits when ELK didn't place one. */
function middleOfLongest(points: Point[]): Point {
  let best = { length: -1, at: points[0] ?? { x: 0, y: 0 } };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length > best.length) best = { length, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
  return best.at;
}

/**
 * Turns ELK's answer into absolute positions. ELK gives each child relative to its parent, and each line
 * relative to its `container` (the group both ends sit in, or the root). Boxes come back in the data's order. Pure.
 */
export function fromElk(graph: ElkNode, data: DiagramData): DiagramLayout {
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const order = new Map(data.nodes.map((n, i) => [n.id, i]));
  const groupLabel = new Map(data.groups.map((g) => [g.id, g.label]));
  const edgeById = new Map(data.edges.map((e) => [e.id, e]));
  const origin = new Map<string, Point>([[graph.id, { x: 0, y: 0 }]]);
  const out: DiagramLayout = { width: graph.width ?? 0, height: graph.height ?? 0, groups: [], nodes: [], edges: [] };
  const elkEdges: { edge: ElkExtendedEdge; declaredIn: string }[] = (graph.edges ?? []).map((edge) => ({ edge, declaredIn: graph.id }));

  const walk = (parent: ElkNode, at: Point) => {
    for (const child of parent.children ?? []) {
      const x = at.x + (child.x ?? 0);
      const y = at.y + (child.y ?? 0);
      const w = child.width ?? 0;
      const h = child.height ?? 0;
      origin.set(child.id, { x, y });
      for (const edge of child.edges ?? []) elkEdges.push({ edge, declaredIn: child.id });
      if (child.id.startsWith(GROUP)) {
        const id = child.id.slice(GROUP.length);
        out.groups.push({ id, label: groupLabel.get(id) ?? id, x, y, w, h });
        walk(child, { x, y });
      } else if (child.id.startsWith(NODE)) {
        const n = nodeById.get(child.id.slice(NODE.length));
        if (n) out.nodes.push({ id: n.id, label: n.label, status: n.status, path: n.codeRef?.path ?? null, x, y, w, h });
      }
    }
  };
  walk(graph, { x: 0, y: 0 });
  out.nodes.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  for (const { edge, declaredIn } of elkEdges) {
    const source = edgeById.get(edge.id.slice(EDGE.length));
    if (!source) continue;
    const o = origin.get(edge.container ?? declaredIn) ?? { x: 0, y: 0 };
    const points = (edge.sections ?? [])
      .flatMap((s) => [s.startPoint, ...(s.bendPoints ?? []), s.endPoint])
      .map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
    const label = edge.labels?.[0];
    const placed = label && label.x !== undefined && label.y !== undefined;
    const at = placed ? { x: o.x + label.x! + (label.width ?? 0) / 2, y: o.y + label.y! + (label.height ?? 0) / 2 } : middleOfLongest(points);
    out.edges.push({ id: source.id, points, label: source.label ?? null, labelX: at.x, labelY: at.y, dashed: source.style === 'dashed' });
  }
  return out;
}

let elk: Promise<ELK> | null = null;

/** Lays a diagram out with ELK. elkjs is loaded on first use, so screens without diagrams never download it. */
export async function layoutDiagram(data: DiagramData, direction: Direction): Promise<DiagramLayout> {
  elk ??= import('elkjs/lib/elk.bundled.js').then(
    ({ default: Elk }) => new Elk(),
    (e: unknown) => {
      elk = null;
      throw e;
    },
  );
  const graph = (await (await elk).layout(toElkGraph(data, direction))) as ElkNode;
  return fromElk(graph, data);
}
