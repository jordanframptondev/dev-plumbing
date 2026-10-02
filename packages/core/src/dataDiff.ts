import { parseData, type DataKind, type DiagramData, type FlowData, type MockupData, type PhaseData, type TableDiff, type VisualData } from './schemas';

type Compared = { added: string[]; removed: string[]; changed: string[] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Keys only in `after`, keys only in `before`, and keys in both whose value differs. */
function compare<T>(before: T[], after: T[], key: (x: T) => string, value: (x: T) => unknown): Compared {
  const was = new Map(before.map((x) => [key(x), x]));
  const now = new Map(after.map((x) => [key(x), x]));
  return {
    added: after.map(key).filter((k) => !was.has(k)),
    removed: before.map(key).filter((k) => !now.has(k)),
    changed: after
      .filter((x) => {
        const old = was.get(key(x));
        return old !== undefined && !same(value(old), value(x));
      })
      .map(key),
  };
}

/** "1 box added", "2 boxes removed"… for each non-empty part. */
const counted = (c: Compared, one: string, many: string): string[] =>
  (['added', 'removed', 'changed'] as const).filter((k) => c[k].length).map((k) => `${count(c[k].length, one, many)} ${k}`);

function diagram(a: DiagramData, b: DiagramData): string[] {
  const boxes = compare(a.nodes, b.nodes, (n) => n.id, (n) => [n.label, n.status, n.group ?? null, n.codeRef ?? null]);
  const lines = compare(a.edges, b.edges, (e) => e.id, (e) => [e.from, e.to, e.label ?? null, e.style ?? 'solid']);
  return [...counted(boxes, 'box', 'boxes'), ...counted(lines, 'line', 'lines'), ...(same(a.groups, b.groups) ? [] : ['groups changed'])];
}

function table(a: TableDiff, b: TableDiff): string[] {
  const f = compare(a.fields, b.fields, (x) => x.name, (x) => [x.type, x.change, x.default ?? null, x.note ?? null]);
  const fields = [...f.added.map((n) => `field ${n} added`), ...f.removed.map((n) => `field ${n} removed`), ...f.changed.map((n) => `field ${n} changed`)];
  return [
    ...(a.model === b.model ? [] : [`model renamed to ${b.model}`]),
    ...(a.change === b.change ? [] : [`marked as ${b.change}`]),
    ...fields,
    // A changed field already explains a new schema diff, so it's only named on its own.
    ...(fields.length || a.schemaDiff === b.schemaDiff ? [] : ['schema diff changed']),
    ...(same(a.migration ?? [], b.migration ?? []) ? [] : ['migration notes changed']),
  ];
}

function side(name: 'After' | 'Before', a: string | undefined, b: string | undefined): string[] {
  if (a === b) return [];
  if (a === undefined) return [`${name} mockup added`];
  if (b === undefined) return [`${name} mockup removed`];
  return [`${name} mockup redrawn`];
}

function mockup(a: MockupData, b: MockupData): string[] {
  return [
    ...side('After', a.after, b.after),
    ...side('Before', a.before, b.before),
    ...(same(a.location, b.location) ? [] : ['location changed']),
    ...(a.kit === b.kit ? [] : ['kit changed']),
  ];
}

function flow(a: FlowData, b: FlowData): string[] {
  const byN = (steps: FlowData['steps']) => [...steps].sort((x, y) => x.n - y.n);
  const s = compare(byN(a.steps), byN(b.steps), (x) => String(x.n), (x) => [x.from ?? null, x.to ?? null, x.label, x.mockupId ?? null, x.systemNote ?? null]);
  return [
    ...s.added.map((n) => `step ${n} added`),
    ...s.removed.map((n) => `step ${n} removed`),
    ...s.changed.map((n) => `step ${n} changed`),
    ...(same(a.lanes ?? [], b.lanes ?? []) ? [] : ['lanes changed']),
    ...(a.kind === b.kind ? [] : ['flow kind changed']),
  ];
}

function phase(a: PhaseData, b: PhaseData): string[] {
  return [
    ...(a.order === b.order ? [] : [`now phase ${b.order}`]),
    ...(a.goal === b.goal ? [] : ['goal changed']),
    ...(same(a.doneWhen, b.doneWhen) ? [] : ['done-when changed']),
    ...(same(a.itemIds, b.itemIds) ? [] : ['items changed']),
  ];
}

/** Both sides parsed, then described. Null when either side doesn't parse. */
function summarize<K extends DataKind>(kind: K, before: unknown, after: unknown, describe: (a: VisualData[K], b: VisualData[K]) => string[]): string[] | null {
  const a = parseData(kind, before);
  const b = parseData(kind, after);
  if (!a.ok || !b.ok) return null;
  const out = describe(a.data, b.data);
  return out.length || same(a.data, b.data) ? out : ['details changed'];
}

function byKind(kind: DataKind, before: unknown, after: unknown): string[] | null {
  switch (kind) {
    case 'diagram':
      return summarize(kind, before, after, diagram);
    case 'database':
      return summarize(kind, before, after, table);
    case 'mockups':
      return summarize(kind, before, after, mockup);
    case 'flows':
      return summarize(kind, before, after, flow);
    case 'timeline':
      return summarize(kind, before, after, phase);
  }
}

/**
 * What a data patch changes, as short phrases ("2 boxes added", "field status changed", "After mockup redrawn").
 * Data where there was none is "drawing added"; data that doesn't parse on either side is "drawing replaced".
 */
export function dataChangeSummary(kind: DataKind, before: unknown, after: unknown): string[] {
  if (before === undefined || before === null) return parseData(kind, after).ok ? ['drawing added'] : ['drawing replaced'];
  return byKind(kind, before, after) ?? ['drawing replaced'];
}
