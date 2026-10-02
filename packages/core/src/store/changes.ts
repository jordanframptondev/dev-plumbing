import { applyMdPatches, invertMdPatches, itemSchema, type Change, type HistoryEntry, type Item, type ItemPatch } from '../schemas';
import {
  ConflictError,
  newId,
  readDocText,
  readHistoryEntry,
  readItem,
  readItems,
  readProjectFile,
  touchProject,
  writeDocText,
  writeHistoryEntry,
  writeItem,
} from './io';
import { changeProblems } from './validate';

/** JSON with object keys sorted, so two equal items compare equal whatever order their keys were written in. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );

export const patchItem = (item: Item, patch: ItemPatch): Item => ({
  ...item,
  ...patch,
  ...(patch.fields ? { fields: { ...(item.fields ?? {}), ...patch.fields } } : {}),
});

type Snapshot = { itemsBefore: Record<string, Item>; itemsAfter: Record<string, Item> };
const quiet = () => undefined;

/** Updates the project's timestamp. It's only a timestamp, so a failure here is ignored. */
const touch = (dir: string, now: Date) => touchProject(dir, now).catch(quiet);

/**
 * Applies a change to draft.md and the items. Throws ConflictError, writing nothing, if any part doesn't fit.
 * If a write fails part-way, the draft and items are put back and the error is rethrown. On success, `restore`
 * puts them back, for a caller whose next write fails.
 */
async function write(dir: string, change: Change): Promise<Snapshot & { restore: () => Promise<void> }> {
  const project = await readProjectFile(dir);
  const draft = await readDocText(dir, project.docs.draft);
  const { values: items } = await readItems(dir);
  const problems = changeProblems(change, draft, new Set(items.map((i) => i.id)));
  if (problems.length) throw new ConflictError(problems.join(' '));
  const md = change.md?.length ? applyMdPatches(draft, change.md) : null;
  const itemsBefore: Record<string, Item> = {};
  const itemsAfter: Record<string, Item> = {};
  for (const c of change.items ?? []) {
    const before = itemsAfter[c.itemId] ?? (await readItem(dir, c.itemId));
    if (!(c.itemId in itemsBefore)) itemsBefore[c.itemId] = before;
    itemsAfter[c.itemId] = patchItem(before, c.patch);
  }
  const restore = async () => {
    await writeDocText(dir, project.docs.draft, draft).catch(quiet);
    for (const item of Object.values(itemsBefore)) await writeItem(dir, item).catch(quiet);
  };
  try {
    if (md?.ok) await writeDocText(dir, project.docs.draft, md.text);
    for (const item of Object.values(itemsAfter)) await writeItem(dir, item);
  } catch (error) {
    await restore();
    throw error;
  }
  return { itemsBefore, itemsAfter, restore };
}

export async function recordChange(
  dir: string,
  o: { threadId: string; kind: 'small-edit' | 'accept'; summary: string; change: Change; apply: boolean; now?: Date },
): Promise<HistoryEntry> {
  const now = o.now ?? new Date();
  const entry: HistoryEntry = {
    id: newId('c', now),
    at: now.toISOString(),
    threadId: o.threadId,
    kind: o.kind,
    summary: o.summary,
    change: o.change,
    itemsBefore: {},
    itemsAfter: {},
  };
  if (o.apply) {
    const { restore, ...snapshot } = await write(dir, o.change);
    Object.assign(entry, { appliedAt: entry.at, ...snapshot });
    try {
      await writeHistoryEntry(dir, entry);
    } catch (error) {
      await restore();
      throw error;
    }
    await touch(dir, now);
    return entry;
  }
  await writeHistoryEntry(dir, entry);
  return entry;
}

/** Applies a pending change, or re-applies one that was undone. */
export async function applyPendingChange(dir: string, changeId: string, now: Date = new Date()): Promise<HistoryEntry> {
  const entry = await readHistoryEntry(dir, changeId);
  if (entry.appliedAt && !entry.undoneAt) throw new ConflictError('That change is already applied.');
  const { restore, ...snapshot } = await write(dir, entry.change);
  const updated: HistoryEntry = { ...entry, appliedAt: now.toISOString(), undoneAt: undefined, ...snapshot };
  try {
    await writeHistoryEntry(dir, updated);
  } catch (error) {
    await restore();
    throw error;
  }
  await touch(dir, now);
  return updated;
}

/** Undoes a small edit, as long as nothing changed there since. */
export async function undoChange(dir: string, changeId: string, now: Date = new Date()): Promise<HistoryEntry> {
  const entry = await readHistoryEntry(dir, changeId);
  if (entry.kind !== 'small-edit') throw new ConflictError('Only small edits can be undone.');
  if (!entry.appliedAt || entry.undoneAt) throw new ConflictError("That change isn't applied.");
  const project = await readProjectFile(dir);
  let draftText: string | null = null;
  let currentDraft: string | null = null;
  if (entry.change.md?.length) {
    const inverse = invertMdPatches(entry.change.md);
    if (!inverse.ok) throw new ConflictError(inverse.error);
    currentDraft = await readDocText(dir, project.docs.draft);
    const r = applyMdPatches(currentDraft, inverse.patches);
    if (!r.ok) throw new ConflictError(`The draft has changed there since, so this can't be undone. ${r.error}`);
    draftText = r.text;
  }
  for (const [id, after] of Object.entries(entry.itemsAfter)) {
    const current = await readItem(dir, id);
    if (stable(current) !== stable(after)) throw new ConflictError(`"${current.title}" has changed since, so this can't be undone.`);
  }
  const updated: HistoryEntry = { ...entry, undoneAt: now.toISOString() };
  try {
    if (draftText !== null) await writeDocText(dir, project.docs.draft, draftText);
    for (const before of Object.values(entry.itemsBefore)) await writeItem(dir, itemSchema.parse(before));
    await writeHistoryEntry(dir, updated);
  } catch (error) {
    if (currentDraft !== null) await writeDocText(dir, project.docs.draft, currentDraft).catch(quiet);
    for (const after of Object.values(entry.itemsAfter)) await writeItem(dir, itemSchema.parse(after)).catch(quiet);
    throw error;
  }
  await touch(dir, now);
  return updated;
}
