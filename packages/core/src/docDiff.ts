import { diffLines } from 'diff';
import { applyMdPatches, type Change, type ChangePreview, type DiffSegment, type FieldChange, type HistoryEntry, type Item, type ItemPatch } from './schemas';

export function diffText(before: string, after: string): DiffSegment[] {
  return diffLines(before, after).map((c) => ({ kind: c.added ? 'added' : c.removed ? 'removed' : 'same', text: c.value }));
}

/**
 * The draft against the original. Each added part names the applied (not undone) changes whose
 * replacement text it contains, or that contain it.
 */
export function diffDocuments(original: string, draft: string, history: HistoryEntry[], threadTitle: (threadId: string) => string = (id) => id): DiffSegment[] {
  const live = history.filter((h) => h.appliedAt && !h.undoneAt);
  return diffText(original, draft).map((segment) => {
    const text = segment.text.trim();
    if (segment.kind !== 'added' || !text) return segment;
    const by = live.filter((h) =>
      h.change.md?.some((p) => {
        const replaced = p.replace.trim();
        return replaced.length > 0 && (text.includes(replaced) || replaced.includes(text));
      }),
    );
    return by.length ? { ...segment, changedBy: by.map((h) => ({ changeId: h.id, threadId: h.threadId, summary: h.summary, threadTitle: threadTitle(h.threadId) })) } : segment;
  });
}

function fieldChanges(item: Item, patch: ItemPatch): FieldChange[] {
  const out: FieldChange[] = [];
  for (const key of ['title', 'summary', 'body'] as const) {
    const after = patch[key];
    if (after !== undefined && after !== item[key]) out.push({ field: key, before: item[key] ?? '', after });
  }
  for (const [field, after] of Object.entries(patch.fields ?? {})) {
    if (item.fields?.[field] !== after) out.push({ field, before: item.fields?.[field] ?? '', after });
  }
  for (const key of ['links', 'codeRefs', 'mdAnchor', 'data'] as const) if (patch[key] !== undefined) out.push({ field: key, before: '', after: 'updated' });
  return out;
}

/** What accepting a change would do: the draft diff, and each item's changed fields. */
export function previewChange(draft: string, items: Item[], change: Change): ChangePreview {
  const problems: string[] = [];
  let md: DiffSegment[] | null = null;
  if (change.md?.length) {
    const r = applyMdPatches(draft, change.md);
    if (r.ok) md = diffText(draft, r.text);
    else problems.push(r.error);
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const itemChanges: ChangePreview['items'] = [];
  for (const c of change.items ?? []) {
    const item = byId.get(c.itemId);
    if (!item) problems.push(`There's no item "${c.itemId}".`);
    else itemChanges.push({ itemId: item.id, title: item.title, changes: fieldChanges(item, c.patch) });
  }
  return { md, items: itemChanges, ...(problems.length ? { problem: problems.join(' ') } : {}) };
}
