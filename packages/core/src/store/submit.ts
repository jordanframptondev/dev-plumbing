import type { Message, Option, PlumbingType, Submission, Thread, YouMessage } from '../schemas';
import { acceptApplied, recordChange } from './changes';
import { addDecision } from './decisions';
import { ConflictError, newId, readItem, readThreads, StoreError, touchProject, writeItem, writeSubmission, writeThread } from './io';
import { latestOpen, presetLabel } from './threads';

export type SubmitResult = { submission: Submission; resolved: string[]; sent: string[]; skipped: { threadId: string; reason: string }[] };
type Outcome = { kind: 'resolved' | 'sent' } | { kind: 'skipped'; reason: string };

const skipped = (reason: string): Outcome => ({ kind: 'skipped', reason });

async function submitThread(dir: string, thread: Thread, scope: 'thread' | 'all', types: PlumbingType[], now: Date): Promise<Outcome> {
  const draft = thread.draft;
  if (!draft || (!draft.optionId && !draft.text?.trim())) return skipped('Nothing to send yet.');
  if (thread.status === 'with_claude') return skipped('Claude is already working on this thread.');
  if (thread.status === 'parked') return skipped('This thread is parked.');

  const at = now.toISOString();
  const item = await readItem(dir, thread.itemId);
  const note = draft.note?.trim() || undefined;
  const you: YouMessage = { id: newId('m', now), at, author: 'you', sentWith: scope };
  let option: Option | undefined;
  if (draft.optionId === 'custom') {
    if (!draft.text?.trim()) return skipped('Write your custom answer first.');
    you.optionId = 'custom';
    you.text = draft.text.trim();
  } else if (draft.optionId?.startsWith('preset:')) {
    const label = presetLabel(types, item, draft.optionId);
    if (!label) return skipped("That answer isn't available any more. Pick another.");
    Object.assign(you, { optionId: draft.optionId, optionLabel: label }, note ? { note } : {});
  } else if (draft.optionId) {
    option = latestOpen(thread)?.options.find((o) => o.id === draft.optionId);
    if (!option) return skipped("That option isn't available any more. Pick another.");
    Object.assign(you, { optionId: option.id, optionLabel: option.label }, note ? { note } : {});
  } else {
    you.text = draft.text!.trim();
  }

  if (item.flags?.length) await writeItem(dir, { ...item, flags: undefined });
  const messages: Message[] = [...thread.messages, you];
  const save = (status: Thread['status'], extra: Message[] = []) => writeThread(dir, { ...thread, draft: undefined, status, messages: [...messages, ...extra] });
  const systemLine = (text: string): Message => ({ id: newId('m', now), at, author: 'system', text });

  if (option?.change) {
    // Sent before with a note and came back unanswered: its change is already in, so don't apply it twice.
    if (!(await acceptApplied(dir, thread.id, option.change))) {
      try {
        await recordChange(dir, { threadId: thread.id, kind: 'accept', summary: `${item.title}: ${option.label}`, change: option.change, apply: true, now });
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
        await save('with_claude', [systemLine(`This change no longer fits the draft, so it wasn't applied. Sent to Claude to redo it. (${e.message})`)]);
        return { kind: 'sent' };
      }
    }
    if (!note) {
      await addDecision(dir, { text: `${item.title}: ${option.label}`, threadId: thread.id, itemIds: [item.id], now });
      await save('resolved', [systemLine('Applied and resolved.')]);
      return { kind: 'resolved' };
    }
  }
  await save('with_claude');
  return { kind: 'sent' };
}

/**
 * Send this thread (scope 'thread') or Submit all (every thread with a draft). The submission, with a copy
 * of every draft, is written first. Plain accepts are applied right away; everything else goes to Claude.
 */
export async function submit(dir: string, o: { scope: 'thread' | 'all'; threadId?: string; types: PlumbingType[]; now?: Date }): Promise<SubmitResult> {
  const now = o.now ?? new Date();
  const { values: threads } = await readThreads(dir);
  const candidates = o.scope === 'thread' ? threads.filter((t) => t.id === o.threadId) : threads.filter((t) => t.draft);
  if (o.scope === 'thread' && candidates.length === 0) throw new StoreError(`Thread ${o.threadId} doesn't exist.`);
  const submission: Submission = {
    id: newId('s', now),
    at: now.toISOString(),
    scope: o.scope,
    drafts: Object.fromEntries(candidates.filter((t) => t.draft).map((t) => [t.id, t.draft!])),
    sent: [],
    resolved: [],
  };
  await writeSubmission(dir, submission);

  let done: Submission;
  const result: Omit<SubmitResult, 'submission'> = { resolved: [], sent: [], skipped: [] };
  try {
    for (const thread of candidates) {
      try {
        const outcome = await submitThread(dir, thread, o.scope, o.types, now);
        if (outcome.kind === 'skipped') result.skipped.push({ threadId: thread.id, reason: outcome.reason });
        else result[outcome.kind].push(thread.id);
      } catch (e) {
        result.skipped.push({ threadId: thread.id, reason: `Couldn't send: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  } finally {
    done = { ...submission, sent: result.sent, resolved: result.resolved, processedAt: now.toISOString() };
    await writeSubmission(dir, done);
  }
  if (result.sent.length || result.resolved.length) await touchProject(dir, now);
  return { submission: done, ...result };
}
