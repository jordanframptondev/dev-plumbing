import { DEFENSE } from '../defenseType';
import type { Decision, Thread } from '../schemas';
import { newId, readDecisions, readItems, writeDecisions } from './io';

export const activeDecisions = (decisions: Decision[]): Decision[] => decisions.filter((d) => !d.supersededBy);

/**
 * The status a parked thread goes back to: your turn when Claude spoke last, idle otherwise. When its item is coming
 * back into the plan (an update had parked it as removed), a thread whose answer still stands, because it has an active
 * decision, is resolved again. A plain unpark doesn't look at decisions: a resolved thread can carry on, and its
 * decision stays active while it does.
 */
export async function statusWhenUnparked(dir: string, thread: Thread, o: { backInPlan: boolean }): Promise<Thread['status']> {
  if (o.backInPlan && activeDecisions(await readDecisions(dir)).some((d) => d.threadId === thread.id)) return 'resolved';
  const lastSpoken = [...thread.messages].reverse().find((m) => m.author !== 'system');
  return lastSpoken?.author === 'claude' ? 'your_turn' : 'idle';
}

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
 * threads' items or the items linked to them (either direction). A decision made in a Defense thread is about the
 * Whiteboard Defense, not the plan, so it goes only with its own thread, never with an item it names or one linked to
 * it. `total` counts every active decision, so the main window knows the rest exist without being sent them.
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
  const defenseThreads = new Set(items.filter((i) => i.type === DEFENSE).map((i) => i.threadId));
  const decisions = active
    .filter((d) => threads.has(d.threadId) || (!defenseThreads.has(d.threadId) && d.itemIds.some((id) => touched.has(id))))
    .map((d) => d.text);
  return { decisions, total: active.length };
}
