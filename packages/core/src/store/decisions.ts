import type { Decision } from '../schemas';
import { newId, readDecisions, writeDecisions } from './io';

export const activeDecisions = (decisions: Decision[]): Decision[] => decisions.filter((d) => !d.supersededBy);

/** Adds a decision. Nothing is deleted: the thread's earlier decision is marked superseded by this one. */
export async function addDecision(dir: string, o: { text: string; threadId: string; itemIds: string[]; now?: Date }): Promise<Decision> {
  const now = o.now ?? new Date();
  const decision: Decision = { id: newId('d', now), text: o.text, threadId: o.threadId, itemIds: o.itemIds, at: now.toISOString() };
  const earlier = (await readDecisions(dir)).map((d) => (d.threadId === o.threadId && !d.supersededBy ? { ...d, supersededBy: decision.id } : d));
  await writeDecisions(dir, [...earlier, decision]);
  return decision;
}
