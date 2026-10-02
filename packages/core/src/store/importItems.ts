import fs from 'node:fs/promises';
import path from 'node:path';
import { dataKindOf, dataProblems, parseData, type CodeRef, type ImportBatch, type Item, type Message, type PlumbingType } from '../schemas';
import { InputError, newId, readDocText, readItems, readProjectFile, writeItem, writeProjectFile, writeThread } from './io';
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
  if (Boolean(items.length) === Boolean(o.batch.noChanges)) {
    throw new InputError('Send either items (at least one) or noChanges with a reason. Not both, and not neither.');
  }

  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: existing } = await readItems(o.dir);
  const existingIds = new Set(existing.map((i) => i.id));
  const taken = new Set(existingIds);
  const idFor = new Map(items.map((it) => [it.key, uniqueId(`${o.type.id}-${it.key}`, taken)]));
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
  if (problems.length) throw nothingSaved(problems, 'call dp_write_items again with the whole batch');

  const itemIds: string[] = [];
  for (const it of items) {
    const id = idFor.get(it.key)!;
    const threadId = `t-${id}`;
    const item: Item = {
      id,
      key: it.key,
      type: o.type.id,
      title: it.title,
      summary: it.summary,
      ...(it.body ? { body: it.body } : {}),
      ...(it.fields ? { fields: it.fields } : {}),
      ...(it.mdAnchor ? { mdAnchor: it.mdAnchor } : {}),
      ...(it.codeRefs?.length ? { codeRefs: await verifyCodeRefs(o.clone, it.codeRefs) } : {}),
      ...(it.links?.length ? { links: it.links.map((l) => idFor.get(l) ?? l) } : {}),
      ...(it.data !== undefined ? { data: kind === 'timeline' ? phaseWithIds(it.data, idFor) : it.data } : {}),
      threadId,
      createdBy: 'import',
    };
    const messages: Message[] = it.message
      ? [
          {
            id: newId('m', now),
            at,
            author: 'claude',
            text: it.message.text,
            opening: true,
            ...(it.message.options ? { options: it.message.options } : {}),
            ...(it.message.recommended ? { recommended: it.message.recommended } : {}),
          },
        ]
      : [];
    await writeItem(o.dir, item);
    await writeThread(o.dir, { id: threadId, itemId: id, status: it.message ? 'your_turn' : 'idle', messages });
    itemIds.push(id);
  }

  const importPending = project.importPending.filter((t) => t !== o.type.id);
  const emptyTypes = o.batch.noChanges
    ? [...project.emptyTypes.filter((e) => e.type !== o.type.id), { type: o.type.id, reason: o.batch.noChanges }]
    : project.emptyTypes;
  const importFinished = importPending.length === 0;
  await writeProjectFile(o.dir, {
    ...project,
    importPending,
    emptyTypes,
    status: importFinished && project.status === 'importing' ? 'active' : project.status,
    updatedAt: at,
  });
  return { itemIds, importFinished };
}

/** Ends an import whose importers have all returned. Types that never wrote are marked "didn't finish". */
export async function finishImport(dir: string, now: Date = new Date()): Promise<boolean> {
  const project = await readProjectFile(dir);
  if (project.status !== 'importing') return false;
  const missing = project.importPending
    .filter((type) => !project.emptyTypes.some((e) => e.type === type))
    .map((type) => ({ type, reason: IMPORT_DID_NOT_FINISH }));
  await writeProjectFile(dir, { ...project, importPending: [], emptyTypes: [...project.emptyTypes, ...missing], status: 'active', updatedAt: now.toISOString() });
  return true;
}
