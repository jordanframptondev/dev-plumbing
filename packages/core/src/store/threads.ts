import { anchorKindFor, dataKindOf, parseData, type Anchor, type ClaudeMessage, type Item, type Message, type OpenOptions, type Option, type PlumbingType, type Thread } from '../schemas';
import { activeDecisions } from './decisions';
import { uniqueId } from './importItems';
import { InputError, newId, readDecisions, readItem, readItems, readThread, writeItem, writeThread } from './io';
import { slugify } from './open';
import { fieldProblems } from './validate';

/**
 * The options you can answer now: those on Claude's last message, unless that message resolved the thread.
 * They stay open after you answer, so an answer Claude never got to can be sent again, until a later Claude
 * message replaces them or the thread is with Claude or resolved.
 */
export function latestOpen(thread: Pick<Thread, 'messages' | 'status'>): { message: ClaudeMessage; options: Option[]; recommended?: string } | null {
  if (thread.status === 'with_claude' || thread.status === 'resolved') return null;
  const last = [...thread.messages].reverse().find((m): m is ClaudeMessage => m.author === 'claude');
  if (!last || last.resolved || !last.options?.length) return null;
  return { message: last, options: last.options, ...(last.recommended ? { recommended: last.recommended } : {}) };
}

/** latestOpen, in the shape the API returns. */
export function openOptions(thread: Pick<Thread, 'messages' | 'status'>): OpenOptions | null {
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

/**
 * Parks or unparks a thread. Unparking an item an update parked as removed from the plan takes it back into the plan:
 * removedIn is cleared, and a thread whose answer still stands (it has an active decision) is resolved again.
 */
export async function setParked(dir: string, threadId: string, parked: boolean, now: Date = new Date()): Promise<Thread> {
  const thread = await readThread(dir, threadId);
  if (thread.status === 'with_claude') throw new InputError("Claude is working on this thread, so it can't be parked yet.");
  if (parked && thread.status === 'resolved') throw new InputError('This thread is resolved, so there is nothing to park.');
  if (parked === (thread.status === 'parked')) return thread;
  const lastSpoken = [...thread.messages].reverse().find((m) => m.author !== 'system');
  let decided = false;
  if (!parked) {
    const item = await readItem(dir, thread.itemId).catch(() => null);
    if (item?.removedIn !== undefined) {
      decided = activeDecisions(await readDecisions(dir)).some((d) => d.threadId === thread.id);
      const { removedIn: _removedIn, ...back } = item;
      await writeItem(dir, back);
    }
  }
  const status: Thread['status'] = parked ? 'parked' : decided ? 'resolved' : lastSpoken?.author === 'claude' ? 'your_turn' : 'idle';
  const next: Thread = { ...thread, status, messages: [...thread.messages, system(now, parked ? 'Parked.' : 'Unparked.')] };
  await writeThread(dir, next);
  return next;
}

/**
 * Why a pin can't go on this item, or null when it can. The item must exist and be of the pin's own type, the
 * type must take this kind of pin, and a box or step must be in the drawing. Element selectors aren't checked,
 * so a pin outlives a redrawn mockup (the screen marks it "Not in this version").
 */
function anchorProblem(anchor: Anchor, type: PlumbingType, items: Item[]): string | null {
  const parent = items.find((i) => i.id === anchor.itemId);
  if (!parent) return `There's no item ${anchor.itemId} to ask about.`;
  if (parent.type !== type.id) return 'Pins start an item of the same plumbing type.';
  if (anchor.kind !== anchorKindFor(dataKindOf(type))) return `${type.title} items can't take a ${anchor.kind} pin.`;
  if (anchor.kind === 'node') {
    const d = parseData('diagram', parent.data);
    if (!d.ok) return `"${parent.title}" has no diagram to ask about.`;
    if (!d.data.nodes.some((n) => n.id === anchor.ref)) return `There's no box "${anchor.ref}" in "${parent.title}".`;
  }
  if (anchor.kind === 'step') {
    const f = parseData('flows', parent.data);
    if (!f.ok) return `"${parent.title}" has no flow to ask about.`;
    if (!f.data.steps.some((s) => String(s.n) === anchor.ref)) return `There's no step ${anchor.ref} in "${parent.title}".`;
  }
  return null;
}

/**
 * + Question / + Concern / + Idea, and pins ("Ask about this box", + Pin, "Ask about this step"): a new item whose
 * thread starts with your message as a draft, ready to send. A pin links to the item it's about, which is left as it is.
 */
export async function addOwnItem(
  dir: string,
  o: { type: PlumbingType; title: string; text: string; fields?: Record<string, string>; anchor?: Anchor; now?: Date },
): Promise<{ item: Item; thread: Thread }> {
  const now = o.now ?? new Date();
  const title = o.title.trim();
  const text = o.text.trim();
  if (!title) throw new InputError('Give it a title.');
  if (!text) throw new InputError('Write your message first.');
  const problems = fieldProblems(o.fields, o.type);
  if (problems.length) throw new InputError(problems.join(' '));
  const { values } = await readItems(dir);
  const pin = o.anchor ? anchorProblem(o.anchor, o.type, values) : null;
  if (pin) throw new InputError(pin);
  const id = uniqueId(`${o.type.id}-${slugify(title)}`, new Set(values.map((i) => i.id)));
  const item: Item = {
    id,
    type: o.type.id,
    title,
    summary: title,
    ...(o.fields ? { fields: o.fields } : {}),
    ...(o.anchor ? { anchor: o.anchor, links: [o.anchor.itemId] } : {}),
    threadId: `t-${id}`,
    createdBy: 'you',
  };
  const thread: Thread = { id: `t-${id}`, itemId: id, status: 'idle', draft: { text, updatedAt: now.toISOString() }, messages: [] };
  await writeItem(dir, item);
  await writeThread(dir, thread);
  return { item, thread };
}
