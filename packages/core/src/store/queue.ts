import type { Message, Submission, ThreadDraft, YouMessage } from '../schemas';
import { ConflictError, newId, readItem, readItems, readSubmission, readSubmissions, readThread, writeItem, writeSubmission, writeThread } from './io';

export async function pendingSubmissions(dir: string): Promise<Submission[]> {
  return (await readSubmissions(dir)).filter((s) => s.sent.length > 0 && !s.pickedUpAt && !s.finishedAt);
}

export async function pickUp(dir: string, id: string, windowId: string, now: Date = new Date()): Promise<Submission> {
  const s = await readSubmission(dir, id);
  if (s.pickedUpAt) throw new ConflictError(`Submission ${id} was already picked up.`);
  const next: Submission = { ...s, pickedUpAt: now.toISOString(), pickedUpBy: windowId };
  await writeSubmission(dir, next);
  return next;
}

const draftFrom = (m: YouMessage, at: string): ThreadDraft => ({
  ...(m.optionId ? { optionId: m.optionId } : {}),
  ...(m.note ? { note: m.note } : {}),
  ...(m.text ? { text: m.text } : {}),
  updatedAt: at,
});

/**
 * Ends a submission. Threads Claude didn't answer go back to Your turn with your answer restored as a
 * draft. Conflicts the main window found are noted on every thread involved and flag their items.
 */
export async function finishSubmission(dir: string, id: string, conflicts: { threads: string[]; text: string }[], now: Date = new Date()): Promise<{ returned: string[] }> {
  const s = await readSubmission(dir, id);
  if (s.finishedAt) return { returned: [] };
  const at = now.toISOString();
  const line = (text: string): Message => ({ id: newId('m', now), at, author: 'system', text });
  const returned: string[] = [];
  for (const threadId of s.sent) {
    const thread = await readThread(dir, threadId).catch(() => null);
    if (thread?.status !== 'with_claude') continue;
    const you = [...thread.messages].reverse().find((m): m is YouMessage => m.author === 'you');
    await writeThread(dir, {
      ...thread,
      status: 'your_turn',
      ...(you ? { draft: draftFrom(you, at) } : {}),
      messages: [...thread.messages, line("Claude didn't get to this one. Your answer is back in the box: send it again when you're ready.")],
    });
    returned.push(threadId);
  }
  for (const c of conflicts) {
    for (const threadId of c.threads) {
      const thread = await readThread(dir, threadId).catch(() => null);
      if (!thread) continue;
      await writeThread(dir, { ...thread, messages: [...thread.messages, line(`Might conflict with another answer: ${c.text}`)] });
      const item = await readItem(dir, thread.itemId).catch(() => null);
      const other = c.threads.find((t) => t !== threadId) ?? threadId;
      if (item) await writeItem(dir, { ...item, flags: [...(item.flags ?? []), { reason: c.text, fromThreadId: other, at }] });
    }
  }
  await writeSubmission(dir, { ...s, finishedAt: at });
  return { returned };
}

/** A window that calls dp_wait again without reporting back has finished whatever it picked up before. */
export async function finishWindowSubmissions(dir: string, windowId: string, now: Date = new Date()): Promise<string[]> {
  const mine = (await readSubmissions(dir)).filter((s) => s.pickedUpBy === windowId && !s.finishedAt);
  for (const s of mine) await finishSubmission(dir, s.id, [], now);
  return mine.map((s) => s.id);
}

/** Submissions held by windows that went away go back in the queue, with only the threads still waiting for Claude. */
export async function requeueUnfinished(dir: string, isAlive: (windowId: string) => boolean, now: Date = new Date()): Promise<string[]> {
  const at = now.toISOString();
  const requeued: string[] = [];
  for (const s of await readSubmissions(dir)) {
    if (!s.pickedUpAt || s.finishedAt || (s.pickedUpBy && isAlive(s.pickedUpBy))) continue;
    const still: string[] = [];
    for (const threadId of s.sent) {
      const thread = await readThread(dir, threadId).catch(() => null);
      if (thread?.status === 'with_claude') still.push(threadId);
    }
    if (still.length) {
      await writeSubmission(dir, { ...s, sent: still, pickedUpAt: undefined, pickedUpBy: undefined, requeuedAt: at });
      requeued.push(s.id);
    } else {
      await writeSubmission(dir, { ...s, finishedAt: at });
    }
  }
  return requeued;
}

/** One group per set of threads whose items link to each other (either direction), in the order given. */
export async function groupThreads(dir: string, threadIds: string[], linked: boolean): Promise<string[][]> {
  if (!linked || threadIds.length < 2) return threadIds.map((t) => [t]);
  const itemOf = new Map<string, string>();
  for (const id of threadIds) {
    const thread = await readThread(dir, id).catch(() => null);
    if (thread) itemOf.set(id, thread.itemId);
  }
  const items = new Map((await readItems(dir)).values.map((i) => [i.id, i]));
  const parent = new Map(threadIds.map((t) => [t, t]));
  const find = (t: string): string => {
    let root = t;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(t, root);
    return root;
  };
  for (const [i, a] of threadIds.entries()) {
    for (const b of threadIds.slice(i + 1)) {
      const ia = items.get(itemOf.get(a) ?? '');
      const ib = items.get(itemOf.get(b) ?? '');
      if (ia && ib && (ia.links?.includes(ib.id) || ib.links?.includes(ia.id))) parent.set(find(b), find(a));
    }
  }
  const groups = new Map<string, string[]>();
  for (const t of threadIds) groups.set(find(t), [...(groups.get(find(t)) ?? []), t]);
  return [...groups.values()];
}
