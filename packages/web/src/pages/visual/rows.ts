import { parseData, type DataKind, type DisplayStatus, type TypeItemRow, type VisualData } from '@dev-plumbing/core/schemas';
import { useEffect } from 'react';
import type { Tone } from '../../diagram/DiagramView';

/** A screen's rows, sorted by what it can do with them. */
export type ScreenRows<K extends DataKind> = {
  /** Items with data, in row order: drawn when it parses, a DataProblem when it doesn't. */
  shown: ({ row: TypeItemRow; ok: true; data: VisualData[K] } | { row: TypeItemRow; ok: false; problems: string[] })[];
  /** Threads about one part of another item: a box, an element or a step. */
  anchored: TypeItemRow[];
  /** Items with nothing to draw. */
  other: TypeItemRow[];
};

export function splitRows<K extends DataKind>(kind: K, rows: TypeItemRow[]): ScreenRows<K> {
  const out: ScreenRows<K> = { shown: [], anchored: [], other: [] };
  for (const row of rows) {
    if (row.anchor) out.anchored.push(row);
    else if (row.data === null || row.data === undefined) out.other.push(row);
    else {
      const parsed = parseData(kind, row.data);
      out.shown.push(parsed.ok ? { row, ok: true, data: parsed.data } : { row, ok: false, problems: parsed.problems });
    }
  }
  return out;
}

const TONE: Record<DisplayStatus, Tone> = { your_turn: 'seal', draft: 'slate', with_claude: 'slate', resolved: 'moss', parked: 'mist', idle: 'mist' };
const URGENCY: Tone[] = ['seal', 'slate', 'moss', 'mist'];

/** The most urgent status's colour: your turn, then draft or with Claude, then resolved, then parked. */
export function toneOf(statuses: DisplayStatus[]): Tone {
  const tones = new Set(statuses.map((s) => TONE[s]));
  return URGENCY.find((t) => tones.has(t)) ?? 'mist';
}

/** Anchored rows about one item, grouped by the part they're about (anchor.ref). */
export function anchorsOn(anchored: TypeItemRow[], itemId: string, kind: 'node' | 'element' | 'step'): Map<string, TypeItemRow[]> {
  const byRef = new Map<string, TypeItemRow[]>();
  for (const r of anchored) {
    if (r.anchor?.itemId !== itemId || r.anchor.kind !== kind) continue;
    byRef.set(r.anchor.ref, [...(byRef.get(r.anchor.ref) ?? []), r]);
  }
  return byRef;
}

/** One bubble per part: how many threads are about it, in the most urgent one's colour. */
export function bubblesFrom(byRef: Map<string, TypeItemRow[]>): Record<string, { count: number; tone: Tone }> {
  return Object.fromEntries([...byRef].map(([ref, rows]) => [ref, { count: rows.length, tone: toneOf(rows.map((r) => r.status)) }]));
}

/** The DOM id of an item's section, for `?item=`. */
export const itemAnchorId = (itemId: string) => `item-${itemId}`;

/** Scrolls `?item=`'s section into view once it's on the page. */
export function useScrollToItem(item: string | undefined) {
  useEffect(() => {
    if (item) document.getElementById(itemAnchorId(item))?.scrollIntoView?.({ block: 'start' });
  }, [item]);
}
