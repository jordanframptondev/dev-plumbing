import type { Item } from '../schemas';
import { InputError, readItem, readItems, writeItem } from './io';

/** The item without its reviewed mark. */
export function withoutReviewed(item: Item): Item {
  const { reviewedAt: _reviewedAt, ...rest } = item;
  return rest;
}

/**
 * The item with a "May need another look" flag added. A flag means the item may have changed, so its reviewed mark is
 * cleared and it shows up on the Finalize page's "Nobody has reviewed these" again.
 */
export function withFlag(item: Item, flag: NonNullable<Item['flags']>[number]): Item {
  return { ...withoutReviewed(item), flags: [...(item.flags ?? []), flag] };
}

/**
 * Marks an item reviewed, or clears the mark. The mark only takes the item off "Nobody has reviewed these": the thread
 * is left as it is. Written only when it changes, so marking an item again keeps the first time. A missing item is a
 * StoreError.
 */
export async function setReviewed(dir: string, itemId: string, reviewed: boolean, now: Date = new Date()): Promise<void> {
  const item = await readItem(dir, itemId);
  if (reviewed === Boolean(item.reviewedAt)) return;
  await writeItem(dir, reviewed ? { ...item, reviewedAt: now.toISOString() } : withoutReviewed(item));
}

/**
 * Marks several items reviewed at once ("Mark all as reviewed"). Unknown ids are refused, all named, and nothing is
 * marked. Items already marked keep their time. `marked` is how many it newly marked.
 */
export async function markReviewed(dir: string, itemIds: string[], now: Date = new Date()): Promise<{ marked: number }> {
  const { values } = await readItems(dir);
  const byId = new Map(values.map((i) => [i.id, i]));
  const ids = [...new Set(itemIds)];
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length) throw new InputError(`There's no item ${unknown.map((id) => `"${id}"`).join(' or ')}. Nothing was marked.`);
  let marked = 0;
  for (const id of ids) {
    const item = await readItem(dir, id);
    if (item.reviewedAt) continue;
    await writeItem(dir, { ...item, reviewedAt: now.toISOString() });
    marked++;
  }
  return { marked };
}
