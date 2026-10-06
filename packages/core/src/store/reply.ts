import { importableTypes } from '../planChanges';
import { applyMdPatches, dataKindOf, dataProblems, type ClaudeMessage, type HistoryEntry, type PlumbingType, type ReplyInput, type Thread } from '../schemas';
import { recordChange } from './changes';
import { addDecision } from './decisions';
import { uniqueId, verifyCodeRefs } from './importItems';
import { InputError, newId, readDecisions, readDocText, readItem, readItems, readProjectFile, readThread, StoreError, touchProject, writeItem, writeThread } from './io';
import { slugify } from './open';
import { changeDataProblems, fieldProblems, itemDataKinds, messageProblems, nothingSaved, optionDataProblems } from './validate';

export async function postReply(
  dir: string,
  o: { reply: ReplyInput; types: PlumbingType[]; autoApply: boolean; clone: string; now?: Date },
): Promise<{ messageId: string; edits: HistoryEntry[]; newThreadIds: string[] }> {
  const now = o.now ?? new Date();
  const at = now.toISOString();
  const r = o.reply;
  let thread: Thread;
  try {
    thread = await readThread(dir, r.threadId);
  } catch (e) {
    if (e instanceof StoreError) throw new InputError(`There's no thread "${r.threadId}". Reply only to the threads you were given.`);
    throw e;
  }
  if (thread.status !== 'with_claude') {
    throw new InputError(`Thread ${r.threadId} isn't waiting for Claude (it's ${thread.status.replace('_', ' ')}). Reply only to the threads you were given, once each.`);
  }

  const project = await readProjectFile(dir);
  const draft = await readDocText(dir, project.docs.draft);
  const { values: items } = await readItems(dir);
  const itemIds = new Set(items.map((i) => i.id));
  // The types Claude may add an item of: the enabled ones, but never a built-in one (Plan changes comes from updates).
  const enabled = new Map(importableTypes(o.types).map((t) => [t.id, t]));
  const newItems = r.newItems ?? [];
  // New items' ids are worked out up front, so data in this reply may name them.
  const taken = new Set(itemIds);
  const newIds = newItems.map((n) => uniqueId(`${n.type}-${slugify(n.title)}`, taken));
  const { kindOfItem, mockupItemIds } = itemDataKinds(items, o.types);
  const ctx = {
    itemIds: new Set([...itemIds, ...newIds]),
    mockupItemIds: new Set([...mockupItemIds, ...newIds.filter((_, i) => enabled.get(newItems[i].type)?.screen === 'mockups')]),
  };
  const problems: string[] = [];
  if (r.resolve && r.options) problems.push('Send options or resolve, not both.');
  if (r.recommended && !r.options) problems.push('recommended needs options.');

  // Small edits are checked in order, each against the draft as the ones before it leave it.
  let edited = draft;
  (r.smallEdits ?? []).forEach((e, i) => {
    const where = `Small edit ${i + 1}`;
    if (e.change.md?.some((p) => p.replace === '')) problems.push(`${where}: a small edit can't delete text outright. Keep a few surrounding words in both find and replace.`);
    if (e.change.md?.length) {
      const res = applyMdPatches(edited, e.change.md);
      if (res.ok) edited = res.text;
      else problems.push(`${where}: ${res.error}`);
    }
    for (const c of e.change.items ?? []) if (!itemIds.has(c.itemId)) problems.push(`${where}: there's no item "${c.itemId}".`);
    problems.push(...changeDataProblems(e.change, kindOfItem, ctx).map((p) => `${where}: ${p}`));
  });
  // Options must fit the draft as the user will see it: after the small edits, when those apply straight away.
  const base = o.autoApply ? edited : draft;
  problems.push(...messageProblems(r, base, itemIds));
  problems.push(...optionDataProblems(r.options, kindOfItem, ctx));
  newItems.forEach((n, i) => {
    const where = `New item ${i + 1} (${n.title})`;
    const type = enabled.get(n.type);
    if (!type) {
      problems.push(`${where}: "${n.type}" isn't an enabled plumbing type. Use one of: ${[...enabled.keys()].join(', ')}.`);
      return;
    }
    problems.push(...fieldProblems(n.fields, type).map((p) => `${where}: ${p}`));
    problems.push(...dataProblems(dataKindOf(type), n.data, ctx).map((p) => `${where}: ${p}`));
    problems.push(...messageProblems(n.message, base, itemIds).map((p) => `${where}: ${p}`));
    problems.push(...optionDataProblems(n.message.options, kindOfItem, ctx).map((p) => `${where}: ${p}`));
  });
  for (const imp of r.impacts ?? []) if (!itemIds.has(imp.itemId)) problems.push(`Impacts: there's no item "${imp.itemId}".`);
  for (const id of r.resolve?.itemIds ?? []) if (!itemIds.has(id)) problems.push(`resolve.itemIds: there's no item "${id}".`);
  if (problems.length) throw nothingSaved(problems, 'call dp_reply again');

  // Everything that can fail on a read happens before the first write, so a refused reply leaves nothing behind.
  if (r.resolve) await readDecisions(dir);
  const codeRefs = await Promise.all(newItems.map((n) => (n.codeRefs?.length ? verifyCodeRefs(o.clone, n.codeRefs) : Promise.resolve(undefined))));

  const edits: HistoryEntry[] = [];
  for (const e of r.smallEdits ?? []) {
    edits.push(await recordChange(dir, { threadId: thread.id, kind: 'small-edit', summary: e.summary, change: e.change, apply: o.autoApply, now }));
  }

  const newItemIds: string[] = [];
  for (const [i, n] of newItems.entries()) {
    const id = newIds[i];
    await writeItem(dir, {
      id,
      type: n.type,
      title: n.title,
      summary: n.summary,
      ...(n.body ? { body: n.body } : {}),
      ...(n.fields ? { fields: n.fields } : {}),
      ...(n.mdAnchor ? { mdAnchor: n.mdAnchor } : {}),
      ...(codeRefs[i] ? { codeRefs: codeRefs[i] } : {}),
      ...(n.data !== undefined ? { data: n.data } : {}),
      links: [thread.itemId],
      threadId: `t-${id}`,
      createdBy: 'claude',
    });
    await writeThread(dir, {
      id: `t-${id}`,
      itemId: id,
      status: 'your_turn',
      messages: [
        {
          id: newId('m', now),
          at,
          author: 'claude',
          text: n.message.text,
          ...(n.message.options ? { options: n.message.options } : {}),
          ...(n.message.recommended ? { recommended: n.message.recommended } : {}),
        },
      ],
    });
    newItemIds.push(id);
  }

  for (const imp of r.impacts ?? []) {
    const item = await readItem(dir, imp.itemId);
    await writeItem(dir, { ...item, flags: [...(item.flags ?? []), { reason: imp.reason, fromThreadId: thread.id, at }] });
  }

  const message: ClaudeMessage = {
    id: newId('m', now),
    at,
    author: 'claude',
    text: r.text,
    ...(r.options ? { options: r.options } : {}),
    ...(r.recommended ? { recommended: r.recommended } : {}),
    ...(edits.length ? { smallEdits: edits.map((e) => ({ changeId: e.id, summary: e.summary })) } : {}),
    ...(newItemIds.length ? { newItemIds } : {}),
    ...(r.impacts?.length ? { impacts: r.impacts } : {}),
    ...(r.filesRead?.length ? { filesRead: r.filesRead } : {}),
    ...(r.resolve ? { resolved: true } : {}),
  };
  if (r.resolve) await addDecision(dir, { text: r.resolve.decision, threadId: thread.id, itemIds: r.resolve.itemIds ?? [thread.itemId], now });
  // An update took this item out of the plan while Claude was working on it: once the reply lands, the thread is parked,
  // so the item stays out of the final. The reply, and any decision, are kept.
  const removedIn = items.find((i) => i.id === thread.itemId)?.removedIn;
  const messages = [...thread.messages, message];
  if (removedIn !== undefined) messages.push({ id: newId('m', now), at, author: 'system', text: `Parked, because it was removed from the plan in v${removedIn}.` });
  await writeThread(dir, { ...thread, status: removedIn !== undefined ? 'parked' : r.resolve ? 'resolved' : 'your_turn', messages });
  await touchProject(dir, now);
  return { messageId: message.id, edits, newThreadIds: newItemIds.map((id) => `t-${id}`) };
}
