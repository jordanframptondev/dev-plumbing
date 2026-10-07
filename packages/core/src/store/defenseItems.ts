import { DEFENSE } from '../defenseType';
import {
  BASIS_LABELS,
  DEFENSE_SECTIONS,
  displayStatus,
  SEVERITY_LABELS,
  type DefenseLink,
  type DefenseRef,
  type Item,
  type PlumbingType,
  type Severity,
  type Submission,
  type Thread,
  type WhiteboardDefense,
} from '../schemas';
import { claimAt, defensePartMarkdown } from './defenseMarkdown';
import { uniqueId } from './importItems';
import { ConflictError, InputError, newId, readItems, readThreads, touchProject, writeItem, writeSubmission, writeThread } from './io';
import { slugify } from './open';
import { readDefense } from './whiteboard';

/** Where a part of the defense is sent: a claim marked Unknown or Verify before release to Questions, a release concern to Concerns. */
export const SEND_TARGET = { claim: 'questions', concern: 'concerns' } as const;
/** A release concern's severity, in the Concerns type's own words (low, medium or high). */
export const CONCERN_SEVERITY: Record<Severity, string> = { critical: 'high', high: 'high', medium: 'medium', low: 'low', info: 'low' };

const TARGET_NAME = { questions: 'Questions', concerns: 'Concerns' } as const;
const TITLE_MAX = 120;
const SUMMARY_MAX = 300;
const SENT_LINE = 'Sent from the Whiteboard Defense.';

/** The refusal for a part (a section, claim, question, concern or checklist line) the defense doesn't have. */
export const NO_PART = "That part of the Whiteboard Defense doesn't exist.";

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);
/** A part's text as sent ones are matched: trimmed, each run of whitespace one space. */
const sameText = (text: string) => text.trim().replace(/\s+/g, ' ');
/** An item sent from a defense, which records the part's text: the kind of part and that text, as they're matched. */
const sentKey = (i: Item) => (i.type !== DEFENSE && i.createdBy === 'whiteboard' && i.fromDefense?.text !== undefined ? `${i.fromDefense.kind}:${sameText(i.fromDefense.text)}` : null);

/** The saved defense, when it's the one the page loaded (`defenseId`). Practice checks it the same way. */
export async function currentDefense(dir: string, defenseId: string): Promise<WhiteboardDefense> {
  const defense = await readDefense(dir);
  if (!defense) throw new ConflictError("There's no Whiteboard Defense yet.");
  if (defense.id !== defenseId) throw new ConflictError('The Whiteboard Defense changed since this page loaded. Reload it.');
  return defense;
}

/** What the asked item's list row says it's about. */
function askedSummary(d: WhiteboardDefense, kind: 'section' | 'question' | 'concern', ref: string): string {
  if (kind === 'section') {
    const s = DEFENSE_SECTIONS.find((x) => x.id === ref)!;
    return `About ${s.n}. ${s.title}`;
  }
  if (kind === 'question') return `About the question: ${d.questions.find((q) => q.id === ref)!.q}`;
  const c = d.concerns.find((x) => x.id === ref)!;
  return `About the ${SEVERITY_LABELS[c.severity].toLowerCase()} concern: ${c.text}`;
}

/**
 * "Ask Claude about this": a Defense item about one part of the defense (a section, a question or a release concern),
 * whose body is that part as Markdown, and an idle thread whose draft is your question. The route then sends it with
 * submit({ scope: 'thread' }), so your question is the thread's first message. Each ask makes a new thread.
 */
export async function askAboutDefense(
  dir: string,
  o: { defenseId: string; kind: 'section' | 'question' | 'concern'; ref: string; question: string; now?: Date },
): Promise<{ itemId: string; threadId: string }> {
  const now = o.now ?? new Date();
  const defense = await currentDefense(dir, o.defenseId);
  const { values: items } = await readItems(dir);
  const body = defensePartMarkdown(defense, o.kind, o.ref, { itemTitles: Object.fromEntries(items.map((i) => [i.id, i.title])) });
  if (body === null) throw new InputError(NO_PART);
  const question = o.question.trim();
  if (!question) throw new InputError('Write your message first.');
  const title = clip(question.split('\n')[0].trim(), TITLE_MAX);
  const id = uniqueId(`${DEFENSE}-${slugify(title)}`, new Set(items.map((i) => i.id)));
  const fromDefense: DefenseRef = { id: defense.id, kind: o.kind, ref: o.ref };
  const item: Item = {
    id,
    type: DEFENSE,
    title,
    summary: clip(askedSummary(defense, o.kind, o.ref), SUMMARY_MAX),
    body,
    threadId: `t-${id}`,
    createdBy: 'whiteboard',
    fromDefense,
  };
  const thread: Thread = { id: `t-${id}`, itemId: id, status: 'idle', draft: { text: question, updatedAt: now.toISOString() }, messages: [] };
  await writeItem(dir, item);
  await writeThread(dir, thread);
  return { itemId: id, threadId: thread.id };
}

/**
 * Send to Questions or Send to Concerns: a plumbing item made from a claim marked Unknown or Verify before release, or
 * from a release concern. Its thread starts with Claude, as a Plan changes thread does: a system line, and a submission
 * the service makes, which the next dp_wait hands to a window. With no message from you, the thread agent follows the
 * type's Rules and suggests answers. Each part of a defense can be sent once.
 */
export async function sendFromDefense(
  dir: string,
  o: { defenseId: string; kind: 'claim' | 'concern'; ref: string; types: PlumbingType[]; now?: Date },
): Promise<{ itemId: string; threadId: string; typeId: string; typeTitle: string }> {
  const now = o.now ?? new Date();
  const at = now.toISOString();
  const defense = await currentDefense(dir, o.defenseId);
  let text: string;
  let body: string;
  let fields: Record<string, string> | undefined;
  if (o.kind === 'claim') {
    const found = claimAt(defense, o.ref);
    if (!found) throw new InputError(NO_PART);
    if (found.claim.basis !== 'unknown' && found.claim.basis !== 'verify') {
      throw new InputError('Only a claim marked Unknown or Verify before release can be sent to Questions.');
    }
    text = found.claim.text;
    body = `From the Whiteboard Defense (${found.n}. ${found.section.title}), marked ${BASIS_LABELS[found.claim.basis]}:\n\n${text}`;
  } else {
    const concern = defense.concerns.find((c) => c.id === o.ref);
    if (!concern) throw new InputError(NO_PART);
    text = concern.text;
    body = `From the Whiteboard Defense's release concerns, marked ${SEVERITY_LABELS[concern.severity]}:\n\n${text}`;
    fields = { severity: CONCERN_SEVERITY[concern.severity] };
  }

  const target = SEND_TARGET[o.kind];
  const type = o.types.find((t) => t.id === target && t.enabled);
  if (!type) throw new ConflictError(`There's no enabled ${TARGET_NAME[target]} type to send it to. Turn it on in Plumbing rules.`);
  const { values: items } = await readItems(dir);
  // Sent before: this part of this defense, or, from any defense, a part of the same kind with the same text. A
  // regenerated defense has a new id, but the unknown it still has is the same question.
  const key = `${o.kind}:${sameText(text)}`;
  const sent = (i: Item) => (i.type !== DEFENSE && i.fromDefense?.id === defense.id && i.fromDefense.kind === o.kind && i.fromDefense.ref === o.ref) || sentKey(i) === key;
  if (items.some(sent)) throw new ConflictError(`That's already in ${type.title}.`);

  const title = clip(text.replace(/\s+/g, ' ').trim(), TITLE_MAX);
  const id = uniqueId(`${type.id}-${slugify(title)}`, new Set(items.map((i) => i.id)));
  const item: Item = {
    id,
    type: type.id,
    title,
    summary: clip(text, SUMMARY_MAX),
    body,
    ...(fields ? { fields } : {}),
    threadId: `t-${id}`,
    createdBy: 'whiteboard',
    fromDefense: { id: defense.id, kind: o.kind, ref: o.ref, text },
  };
  const thread: Thread = { id: `t-${id}`, itemId: id, status: 'with_claude', messages: [{ id: newId('m', now), at, author: 'system', text: SENT_LINE }] };
  const submission: Submission = { id: newId('s', now), at, scope: 'all', drafts: {}, sent: [thread.id], resolved: [], processedAt: at };
  await writeItem(dir, item);
  await writeThread(dir, thread);
  await writeSubmission(dir, submission);
  await touchProject(dir, now);
  return { itemId: id, threadId: thread.id, typeId: type.id, typeTitle: type.title };
}

/**
 * The threads made from this defense: `asked` are the Defense threads ("Ask Claude about this"), `sent` the items sent
 * to plumbing. An item sent from an earlier defense is listed when this one still has that part, with the same kind
 * and text, under this defense's ref for it. Other items made from an earlier defense aren't listed. Oldest first.
 */
export async function defenseLinks(dir: string, defense: WhiteboardDefense): Promise<{ asked: DefenseLink[]; sent: DefenseLink[] }> {
  const [{ values: items }, { values: threads }] = await Promise.all([readItems(dir), readThreads(dir)]);
  const threadById = new Map(threads.map((t) => [t.id, t]));
  // A thread starts when it's made: with its system line, or with your question as a draft until it's sent.
  const startedAt = (i: Item) => {
    const thread = threadById.get(i.threadId);
    return thread?.messages[0]?.at ?? thread?.draft?.updatedAt ?? '';
  };
  // The parts this defense can send, by kind and text, each with its ref: the first part with that text wins.
  const partRefs = new Map<string, string>();
  defense.sections.forEach((s) =>
    s.claims.forEach((c, i) => {
      const key = `claim:${sameText(c.text)}`;
      if ((c.basis === 'unknown' || c.basis === 'verify') && !partRefs.has(key)) partRefs.set(key, `${s.id}.${i}`);
    }),
  );
  for (const c of defense.concerns) if (!partRefs.has(`concern:${sameText(c.text)}`)) partRefs.set(`concern:${sameText(c.text)}`, c.id);
  const link = (i: Item, ref = i.fromDefense!.ref): DefenseLink => {
    const thread = threadById.get(i.threadId);
    return {
      kind: i.fromDefense!.kind,
      ref,
      itemId: i.id,
      threadId: i.threadId,
      typeId: i.type,
      title: i.title,
      status: thread ? displayStatus(thread) : 'idle',
    };
  };
  const oldestFirst = (a: Item, b: Item) => startedAt(a).localeCompare(startedAt(b)) || a.id.localeCompare(b.id);
  const made = items.filter((i) => i.fromDefense?.id === defense.id).sort(oldestFirst);
  const earlier = items.filter((i) => i.fromDefense !== undefined && i.fromDefense.id !== defense.id && partRefs.has(sentKey(i) ?? ''));
  const sent = [...made.filter((i) => i.type !== DEFENSE), ...earlier]
    .sort(oldestFirst)
    .map((i) => (i.fromDefense!.id === defense.id ? link(i) : link(i, partRefs.get(sentKey(i)!))));
  return { asked: made.filter((i) => i.type === DEFENSE).map((i) => link(i)), sent };
}
