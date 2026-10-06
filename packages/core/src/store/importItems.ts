import fs from 'node:fs/promises';
import path from 'node:path';
import { dataKindOf, dataProblems, parseData, type CodeRef, type ImportBatch, type Item, type Message, type PlumbingProject, type PlumbingType } from '../schemas';
import { stable } from './changes';
import { activeDecisions } from './decisions';
import { InputError, newId, readDecisions, readDocText, readItems, readProjectFile, readThread, writeItem, writeProjectFile, writeThread } from './io';
import { fieldProblems, itemDataKinds, messageProblems, nothingSaved, optionDataProblems } from './validate';

export const IMPORT_DID_NOT_FINISH = "The importer didn't finish for this plumbing type.";

/** ✓ a reference when its file or folder exists inside the clone and, if a symbol is given, the file contains it. */
export async function verifyCodeRefs(clone: string, refs: { path: string; symbol?: string }[]): Promise<CodeRef[]> {
  const root = path.resolve(clone);
  return Promise.all(
    refs.map(async (ref): Promise<CodeRef> => {
      const abs = path.resolve(root, ref.path);
      const rel = path.relative(root, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel)) return { ...ref, verified: false };
      const stat = await fs.stat(abs).catch(() => null);
      if (!stat) return { ...ref, verified: false };
      if (stat.isDirectory()) return { ...ref, verified: !ref.symbol };
      if (!ref.symbol) return { ...ref, verified: true };
      const text = await fs.readFile(abs, 'utf8').catch(() => '');
      return { ...ref, verified: text.includes(ref.symbol) };
    }),
  );
}

/** `base`, or `base-2`, `base-3`… whichever isn't taken. Adds the result to `taken`. */
export function uniqueId(base: string, taken: Set<string>): string {
  const stem = base.slice(0, 74).replace(/-+$/, '') || 'item';
  let id = stem;
  for (let n = 2; taken.has(id); n++) id = `${stem}-${n}`;
  taken.add(id);
  return id;
}

/** Phase data may list items by batch key, like links. They're written as item ids. */
function phaseWithIds(data: unknown, idFor: Map<string, string>): unknown {
  const parsed = parseData('timeline', data);
  return parsed.ok ? { ...parsed.data, itemIds: parsed.data.itemIds.map((k) => idFor.get(k) ?? k) } : data;
}

/** What an importer writes into an item. A new item needs a title and a summary; a re-sent one may leave out anything. */
type Content = Pick<Item, 'title' | 'summary' | 'body' | 'fields' | 'mdAnchor' | 'codeRefs' | 'links' | 'data'>;
type Given = Partial<Content>;
const CONTENT = ['title', 'summary', 'body', 'fields', 'mdAnchor', 'codeRefs', 'links', 'data'] as const;

/**
 * One content field in a form where equal values compare equal: empty is the same as absent, code references are a
 * set whose ✓ (which comes from the clone rather than the plan) is left out, and an anchor is its heading.
 */
function comparable(key: keyof Content, value: unknown): string {
  if (key === 'codeRefs') return stable(((value as CodeRef[] | undefined) ?? []).map(({ verified: _verified, ...ref }) => stable(ref)).sort());
  if (key === 'mdAnchor') return stable((value as Item['mdAnchor'])?.heading ?? null);
  if (key === 'links') return stable(value ?? []);
  if (key === 'fields') return stable(value ?? {});
  if (key === 'body') return stable(value || null);
  return stable(value ?? null);
}

/** An item as it's written: an empty body, link list or code reference list is left out, as at import. */
const withoutEmpty = (item: Item): Item =>
  Object.fromEntries(
    Object.entries(item).filter(([key, value]) => !((key === 'body' && value === '') || ((key === 'links' || key === 'codeRefs') && Array.isArray(value) && value.length === 0))),
  ) as Item;

const systemLine = (now: Date, text: string): Message => ({ id: newId('m', now), at: now.toISOString(), author: 'system', text });

/**
 * A re-imported item whose key was in the plan before. It becomes { ...old, ...given }: it keeps its id, thread,
 * anchor and flags, and every field the importer left out. It's written only when something changed:
 * - back in the plan after it was removed: removedIn is cleared, and a parked thread is unparked (resolved again when
 *   its decision still stands);
 * - a field the importer gave is different: the item is updated and flagged, its thread says so, and the importer's
 *   question is added only when the thread is idle or waiting for you.
 */
async function reimportItem(dir: string, old: Item, given: Given, opening: Message | null, version: number, now: Date): Promise<void> {
  const back = old.removedIn !== undefined;
  const changed = CONTENT.some((key) => key in given && comparable(key, old[key]) !== comparable(key, given[key]));
  if (!back && !changed) return;
  const thread = await readThread(dir, old.threadId).catch(() => null);
  const { removedIn: _removedIn, ...kept } = old;
  await writeItem(
    dir,
    changed
      ? withoutEmpty({ ...kept, ...given, flags: [...(old.flags ?? []), { reason: `Changed in the plan's v${version}.`, fromThreadId: old.threadId, at: now.toISOString() }] })
      : kept,
  );
  if (!thread) return;
  let status = thread.status;
  const messages = [...thread.messages];
  if (back) {
    if (status === 'parked') {
      // A thread whose answer still stands is resolved again. Any other goes to whoever spoke last.
      const decided = activeDecisions(await readDecisions(dir)).some((d) => d.threadId === thread.id);
      const lastSpoken = [...thread.messages].reverse().find((m) => m.author !== 'system');
      status = decided ? 'resolved' : lastSpoken?.author === 'claude' ? 'your_turn' : 'idle';
    }
    messages.push(systemLine(now, `Back in the plan in v${version}.`));
  }
  if (changed) {
    messages.push(systemLine(now, `Updated from the plan's v${version}.`));
    if (opening && (status === 'idle' || status === 'your_turn')) {
      messages.push(opening);
      status = 'your_turn';
    }
  }
  await writeThread(dir, { ...thread, status, messages });
}

/**
 * An imported item the importer listed in `removed`: the new version took its part of the plan out. It's parked,
 * never deleted, whatever its thread's state, except a thread Claude is working on, whose item is flagged instead.
 */
async function markRemoved(dir: string, item: Item, version: number, now: Date): Promise<void> {
  const text = `Removed from the plan in v${version}.`;
  const thread = await readThread(dir, item.threadId).catch(() => null);
  const withClaude = thread?.status === 'with_claude';
  await writeItem(dir, {
    ...item,
    removedIn: version,
    ...(withClaude ? { flags: [...(item.flags ?? []), { reason: text, fromThreadId: item.threadId, at: now.toISOString() }] } : {}),
  });
  if (thread) await writeThread(dir, { ...thread, status: withClaude ? thread.status : 'parked', messages: [...thread.messages, systemLine(now, text)] });
}

/** The project once its import has finished: Active, or, after a re-import, whatever it was before the update. */
function importDone(project: PlumbingProject, changes: Pick<PlumbingProject, 'importPending' | 'emptyTypes' | 'updatedAt'>): PlumbingProject {
  const { reimporting, importBy: _importBy, ...rest } = project;
  return { ...rest, ...changes, status: reimporting?.from ?? 'active' };
}

/**
 * Records the Claude window that runs this project's importers, while it's importing. Only that window ends the
 * import early (finishImport), or another one once it's gone, so a second window listening on the project can't cut
 * the import short.
 */
export async function claimImport(dir: string, windowId: string): Promise<void> {
  const project = await readProjectFile(dir);
  if (project.status !== 'importing' || project.importBy === windowId) return;
  await writeProjectFile(dir, { ...project, importBy: windowId });
}

/**
 * One importer's batch for one plumbing type. At first import, every item is new. In a re-import (project.reimporting
 * is set), this type's imported items are matched by key: a key that's back keeps its item, id and thread, and is
 * updated only where the importer gave something different; a key in `removed` parks its item as removed from the
 * plan; and an item it doesn't mention is left as it is. Items you or Claude added are never touched. `noChanges` in a
 * re-import means nothing changed for this type, so its items are left as they are.
 */
export async function writeImportBatch(o: {
  dir: string;
  type: PlumbingType;
  /** Every plumbing type, so data can be checked against other items (a flow step's mockupId must be a UI item). */
  types: PlumbingType[];
  batch: ImportBatch;
  clone: string;
  now?: Date;
}): Promise<{ itemIds: string[]; importFinished: boolean }> {
  const now = o.now ?? new Date();
  const at = now.toISOString();
  const project = await readProjectFile(o.dir);
  if (!project.importPending.includes(o.type.id)) {
    throw new InputError(
      project.importPending.length
        ? `${o.type.title} has already been imported. Only the types dp_open listed in importTypes need an importer.`
        : "This plumbing project isn't importing anything right now.",
    );
  }
  const items = o.batch.items ?? [];
  const removed = o.batch.removed ?? [];
  // In a re-import, `removed` may stand in for items: a type whose items all left the plan sends only that.
  if (Boolean(items.length || removed.length) === Boolean(o.batch.noChanges)) {
    throw new InputError('Send either items (at least one) or noChanges with a reason. Not both, and not neither.');
  }

  const reimport = project.reimporting;
  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: existing } = await readItems(o.dir);
  const existingIds = new Set(existing.map((i) => i.id));
  // In a re-import, this type's imported items, by key. The first item with a key wins.
  const imported = reimport ? existing.filter((i) => i.type === o.type.id && i.createdBy === 'import' && i.key !== undefined) : [];
  const previous = new Map<string, Item>();
  for (const i of imported) if (!previous.has(i.key!)) previous.set(i.key!, i);
  const taken = new Set(existingIds);
  const idFor = new Map(items.map((it) => [it.key, previous.get(it.key)?.id ?? uniqueId(`${o.type.id}-${it.key}`, taken)]));
  const kind = dataKindOf(o.type);
  const { kindOfItem, mockupItemIds } = itemDataKinds(existing, o.types);
  const newIds = [...idFor.values()];
  // Option changes are stored as written, so they name items by id. An item's own data may also use keys from this
  // batch, as links do: phase itemIds are swapped for ids when the item is written.
  const changeCtx = {
    itemIds: new Set([...existingIds, ...newIds]),
    mockupItemIds: kind === 'mockups' ? new Set([...mockupItemIds, ...newIds]) : mockupItemIds,
  };
  const dataCtx = { ...changeCtx, itemIds: new Set([...changeCtx.itemIds, ...items.map((it) => it.key)]) };
  const keys = new Set<string>();
  const problems: string[] = [];
  items.forEach((it, i) => {
    const where = `Item ${i + 1} (${it.key})`;
    if (keys.has(it.key)) problems.push(`${where}: the key is used twice.`);
    keys.add(it.key);
    if (!previous.has(it.key) && (!it.title || !it.summary)) problems.push(`${where}: A new item needs a title and a summary.`);
    problems.push(...fieldProblems(it.fields, o.type).map((p) => `${where}: ${p}`));
    problems.push(...dataProblems(kind, it.data, dataCtx).map((p) => `${where}: ${p}`));
    if (it.message) {
      problems.push(...messageProblems(it.message, draft, existingIds).map((p) => `${where}: ${p}`));
      problems.push(...optionDataProblems(it.message.options, kindOfItem, changeCtx).map((p) => `${where}: ${p}`));
    }
  });
  for (const it of items) {
    for (const link of it.links ?? []) {
      if (!keys.has(link) && !existingIds.has(link)) problems.push(`Item ${it.key}: links to "${link}", which isn't a key in this batch or an existing item id.`);
    }
  }
  for (const key of removed) {
    if (!previous.has(key)) problems.push(`removed: "${key}" isn't the key of an item ${o.type.title} imported before.`);
    else if (keys.has(key)) problems.push(`removed: "${key}" is in items too. Send it in one or the other.`);
  }
  if (problems.length) throw nothingSaved(problems, 'call dp_write_items again with the whole batch');

  const itemIds: string[] = [];
  for (const it of items) {
    const id = idFor.get(it.key)!;
    // Only what the importer gave: in a re-import, what it leaves out keeps its current value.
    const given: Given = {
      ...(it.title !== undefined ? { title: it.title } : {}),
      ...(it.summary !== undefined ? { summary: it.summary } : {}),
      ...(it.body !== undefined ? { body: it.body } : {}),
      ...(it.fields !== undefined ? { fields: it.fields } : {}),
      ...(it.mdAnchor !== undefined ? { mdAnchor: it.mdAnchor } : {}),
      ...(it.codeRefs !== undefined ? { codeRefs: await verifyCodeRefs(o.clone, it.codeRefs) } : {}),
      ...(it.links !== undefined ? { links: it.links.map((l) => idFor.get(l) ?? l) } : {}),
      ...(it.data !== undefined ? { data: kind === 'timeline' ? phaseWithIds(it.data, idFor) : it.data } : {}),
    };
    const opening: Message | null = it.message
      ? {
          id: newId('m', now),
          at,
          author: 'claude',
          text: it.message.text,
          opening: true,
          ...(it.message.options ? { options: it.message.options } : {}),
          ...(it.message.recommended ? { recommended: it.message.recommended } : {}),
        }
      : null;
    itemIds.push(id);
    const old = previous.get(it.key);
    if (old && reimport) {
      await reimportItem(o.dir, old, given, opening, reimport.version, now);
      continue;
    }
    const threadId = `t-${id}`;
    await writeItem(o.dir, withoutEmpty({ id, key: it.key, type: o.type.id, ...given, title: it.title!, summary: it.summary!, threadId, createdBy: 'import' }));
    await writeThread(o.dir, { id: threadId, itemId: id, status: opening ? 'your_turn' : 'idle', messages: opening ? [opening] : [] });
  }
  // The items the importer says the new version took out. Any other item it didn't send is left as it is.
  if (reimport) {
    for (const key of new Set(removed)) {
      const item = previous.get(key)!;
      if (item.removedIn === undefined) await markRemoved(o.dir, item, reimport.version, now);
    }
  }

  // An items batch clears an earlier "no changes". In a re-import, "no changes" leaves the type as it is, so it's
  // only recorded for a type that has no items.
  const others = project.emptyTypes.filter((e) => e.type !== o.type.id);
  let emptyTypes = others;
  if (o.batch.noChanges) {
    const leftAlone = reimport !== undefined && existing.some((i) => i.type === o.type.id);
    emptyTypes = leftAlone ? project.emptyTypes : [...others, { type: o.type.id, reason: o.batch.noChanges }];
  }
  const importPending = project.importPending.filter((t) => t !== o.type.id);
  const importFinished = importPending.length === 0;
  const changes = { importPending, emptyTypes, updatedAt: at };
  await writeProjectFile(o.dir, importFinished && project.status === 'importing' ? importDone(project, changes) : { ...project, ...changes });
  return { itemIds, importFinished };
}

/**
 * Ends an import whose importers have all returned. Types that never wrote and have no items are marked "didn't
 * finish" (in a re-import, a type whose importer didn't return keeps its items as they were). The project goes back
 * to Active, or to Finalized after a finalized project's re-import. Only the window that runs the importers
 * (`importBy`) ends it, or another one once that window is no longer alive.
 */
export async function finishImport(dir: string, o: { windowId?: string; isAlive?: (windowId: string) => boolean; now?: Date } = {}): Promise<boolean> {
  const now = o.now ?? new Date();
  const project = await readProjectFile(dir);
  if (project.status !== 'importing') return false;
  const by = project.importBy;
  if (by && o.windowId !== by && (o.isAlive ? o.isAlive(by) : true)) return false;
  const { values: items } = await readItems(dir);
  const missing = project.importPending
    .filter((type) => !project.emptyTypes.some((e) => e.type === type) && !items.some((i) => i.type === type))
    .map((type) => ({ type, reason: IMPORT_DID_NOT_FINISH }));
  await writeProjectFile(dir, importDone(project, { importPending: [], emptyTypes: [...project.emptyTypes, ...missing], updatedAt: now.toISOString() }));
  return true;
}
