import type { Decision } from '../schemas';
import { newId, readDecisions, readItems, writeDecisions } from './io';

export const activeDecisions = (decisions: Decision[]): Decision[] => decisions.filter((d) => !d.supersededBy);

/** Adds a decision. Nothing is deleted: the thread's earlier decision is marked superseded by this one. */
export async function addDecision(dir: string, o: { text: string; threadId: string; itemIds: string[]; now?: Date }): Promise<Decision> {
  const now = o.now ?? new Date();
  const decision: Decision = { id: newId('d', now), text: o.text, threadId: o.threadId, itemIds: o.itemIds, at: now.toISOString() };
  const earlier = (await readDecisions(dir)).map((d) => (d.threadId === o.threadId && !d.supersededBy ? { ...d, supersededBy: decision.id } : d));
  await writeDecisions(dir, [...earlier, decision]);
  return decision;
}

/**
 * The active decisions a submission's threads need: those made in one of the threads, and those about the
 * threads' items or the items linked to them (either direction). `total` counts every active decision, so
 * the main window knows the rest exist without being sent them.
 */
export async function relevantDecisions(dir: string, threadIds: string[]): Promise<{ decisions: string[]; total: number }> {
  const active = activeDecisions(await readDecisions(dir));
  const { values: items } = await readItems(dir);
  const threads = new Set(threadIds);
  const own = new Set(items.filter((i) => threads.has(i.threadId)).map((i) => i.id));
  const touched = new Set(own);
  for (const i of items) {
    if (own.has(i.id)) for (const l of i.links ?? []) touched.add(l);
    else if (i.links?.some((l) => own.has(l))) touched.add(i.id);
  }
  const decisions = active.filter((d) => threads.has(d.threadId) || d.itemIds.some((id) => touched.has(id))).map((d) => d.text);
  return { decisions, total: active.length };
}
