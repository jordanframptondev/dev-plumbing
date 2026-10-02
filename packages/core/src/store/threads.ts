import type { ClaudeMessage, Item, Message, OpenOptions, Option, PlumbingType, Thread } from '../schemas';
import { uniqueId } from './importItems';
import { InputError, newId, readItems, readThread, writeItem, writeThread } from './io';
import { slugify } from './open';
import { fieldProblems } from './validate';

/** The options you can answer now: from Claude's last message (system lines aside), unless that message resolved the thread. */
export function latestOpen(thread: Pick<Thread, 'messages'>): { message: ClaudeMessage; options: Option[]; recommended?: string } | null {
  const last = [...thread.messages].reverse().find((m) => m.author !== 'system');
  if (!last || last.author !== 'claude' || last.resolved || !last.options?.length) return null;
  return { message: last, options: last.options, ...(last.recommended ? { recommended: last.recommended } : {}) };
}

/** latestOpen, in the shape the API returns. */
export function openOptions(thread: Pick<Thread, 'messages'>): OpenOptions | null {
  const open = latestOpen(thread);
  return open ? { messageId: open.message.id, options: open.options, ...(open.recommended ? { recommended: open.recommended } : {}) } : null;
}

export function presetLabel(types: PlumbingType[], item: Pick<Item, 'type'>, optionId: string): string | undefined {
  const n = Number(optionId.slice('preset:'.length));
  return Number.isInteger(n) ? types.find((t) => t.id === item.type)?.answerPresets[n] : undefined;
}

const system = (now: Date, text: string): Message => ({ id: newId('m', now), at: now.toISOString(), author: 'system', text });

export async function saveDraft(
  dir: string,
  threadId: string,
  draft: { optionId?: string; note?: string; text?: string } | null,
  now: Date = new Date(),
): Promise<Thread> {
  const thread = await readThread(dir, threadId);
  if (thread.status === 'with_claude') throw new InputError('Claude is working on this thread. Wait for the reply, then answer.');
  const optionId = draft?.optionId?.trim() || undefined;
  const note = draft?.note?.trim() || undefined;
  const text = draft?.text?.trim() || undefined;
  const next: Thread = { ...thread, draft: optionId || note || text ? { ...(optionId ? { optionId } : {}), ...(note ? { note } : {}), ...(text ? { text } : {}), updatedAt: now.toISOString() } : undefined };
  await writeThread(dir, next);
  return next;
}

export async function setParked(dir: string, threadId: string, parked: boolean, now: Date = new Date()): Promise<Thread> {
  const thread = await readThread(dir, threadId);
  if (thread.status === 'with_claude') throw new InputError("Claude is working on this thread, so it can't be parked yet.");
  if (parked && thread.status === 'resolved') throw new InputError('This thread is resolved, so there is nothing to park.');
  if (parked === (thread.status === 'parked')) return thread;
  const lastSpoken = [...thread.messages].reverse().find((m) => m.author !== 'system');
  const status: Thread['status'] = parked ? 'parked' : lastSpoken?.author === 'claude' ? 'your_turn' : 'idle';
  const next: Thread = { ...thread, status, messages: [...thread.messages, system(now, parked ? 'Parked.' : 'Unparked.')] };
  await writeThread(dir, next);
  return next;
}

/** + Question / + Concern / + Idea: a new item whose thread starts with your message as a draft, ready to send. */
export async function addOwnItem(
  dir: string,
  o: { type: PlumbingType; title: string; text: string; fields?: Record<string, string>; now?: Date },
): Promise<{ item: Item; thread: Thread }> {
  const now = o.now ?? new Date();
  const title = o.title.trim();
  const text = o.text.trim();
  if (!title) throw new InputError('Give it a title.');
  if (!text) throw new InputError('Write your message first.');
  const problems = fieldProblems(o.fields, o.type);
  if (problems.length) throw new InputError(problems.join(' '));
  const { values } = await readItems(dir);
  const id = uniqueId(`${o.type.id}-${slugify(title)}`, new Set(values.map((i) => i.id)));
  const item: Item = { id, type: o.type.id, title, summary: title, ...(o.fields ? { fields: o.fields } : {}), threadId: `t-${id}`, createdBy: 'you' };
  const thread: Thread = { id: `t-${id}`, itemId: id, status: 'idle', draft: { text, updatedAt: now.toISOString() }, messages: [] };
  await writeItem(dir, item);
  await writeThread(dir, thread);
  return { item, thread };
}
