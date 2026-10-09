import { dataKindOf, displayStatus, drawingParts, parseData, type DrawingOption, type DrawingParts, type Item, type PlumbingType } from '../schemas';
import { readItems, readThreads } from './io';

// The drawings of a plumbing project that Present may draw: every diagram item, the tables of its database items
// (drawn together, as the Database screen's relationship strip), and its system flows. The whiteboard subagent's pack
// lists them (whiteboardPack.drawings), and saveDefense checks a presenter against them.

/** The title of the tables' drawing. */
export const TABLES_TITLE = 'Tables';

/** A drawing of this project, with what revealing each of its parts also puts on the board. */
export type ProjectDrawing = DrawingOption & { brings: DrawingParts['brings'] };

/**
 * The items that draw, by what they draw: items of enabled types, not parked, with a drawing, in id order. The
 * diagram items are the ones a section's diagramItemId may name (defenseDiagramItemIds).
 */
export async function drawnItems(dir: string, types: PlumbingType[]): Promise<{ diagram: Item[]; database: Item[]; flows: Item[] }> {
  const [{ values: items }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const statusByThread = new Map(threads.map((t) => [t.id, displayStatus(t)]));
  const kindOf = new Map(types.filter((t) => t.enabled).map((t) => [t.id, dataKindOf(t)]));
  const drawn = items.filter((i) => i.data !== undefined && statusByThread.get(i.threadId) !== 'parked').sort((a, b) => a.id.localeCompare(b.id));
  const of = (kind: 'diagram' | 'database' | 'flows') => drawn.filter((i) => kindOf.get(i.type) === kind);
  return { diagram: of('diagram'), database: of('database'), flows: of('flows') };
}

/**
 * Every drawing of this project, in this order:
 * - each diagram item, by its title. One whose data doesn't parse is still there, with no parts, as diagramItemId may
 *   still name it;
 * - the tables, titled TABLES_TITLE, when at least one database item's data parses: those tables, drawn together;
 * - each flow of kind system or both that has lanes, by its title. A user flow is a storyboard, not drawn here.
 */
export async function projectDrawings(dir: string, types: PlumbingType[]): Promise<ProjectDrawing[]> {
  const drawn = await drawnItems(dir, types);
  const drawings: ProjectDrawing[] = [];
  for (const item of drawn.diagram) {
    const parsed = parseData('diagram', item.data);
    const { parts, brings } = parsed.ok ? drawingParts({ kind: 'diagram', data: parsed.data }) : { parts: [], brings: {} };
    drawings.push({ drawing: { kind: 'diagram', itemId: item.id }, title: item.title, parts, brings });
  }
  const tables = drawn.database.flatMap((item) => {
    const parsed = parseData('database', item.data);
    return parsed.ok ? [parsed.data] : [];
  });
  if (tables.length) drawings.push({ drawing: { kind: 'tables' }, title: TABLES_TITLE, ...drawingParts({ kind: 'tables', tables }) });
  for (const item of drawn.flows) {
    const parsed = parseData('flows', item.data);
    if (!parsed.ok || parsed.data.kind === 'user' || !parsed.data.lanes?.length) continue;
    drawings.push({ drawing: { kind: 'flow', itemId: item.id }, title: item.title, ...drawingParts({ kind: 'flow', data: parsed.data }) });
  }
  return drawings;
}

/** What the whiteboard subagent may draw: projectDrawings, each with its parts and their labels. */
export async function drawingOptions(dir: string, types: PlumbingType[]): Promise<DrawingOption[]> {
  return (await projectDrawings(dir, types)).map(({ drawing, title, parts }) => ({ drawing, title, parts }));
}
