import {
  applyMdPatches,
  dataKindOf,
  dataProblems,
  type Change,
  type DataContext,
  type DataKind,
  type Item,
  type Option,
  type PlumbingType,
} from '../schemas';
import { InputError } from './io';

/** Why a change wouldn't apply to this draft and these items. Empty when it applies cleanly. */
export function changeProblems(change: Change, draft: string, itemIds: Set<string>): string[] {
  const problems: string[] = [];
  if (change.md?.length) {
    const r = applyMdPatches(draft, change.md);
    if (!r.ok) problems.push(r.error);
  }
  for (const c of change.items ?? []) if (!itemIds.has(c.itemId)) problems.push(`There's no item "${c.itemId}".`);
  return problems;
}

/** Problems with a message Claude wants to post: repeated option ids, a recommendation that isn't an option, changes that don't apply. */
export function messageProblems(msg: { options?: Option[]; recommended?: string }, draft: string, itemIds: Set<string>): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const o of msg.options ?? []) {
    if (ids.has(o.id)) problems.push(`Option id "${o.id}" is used twice.`);
    ids.add(o.id);
    if (o.id === 'custom') problems.push('Option id "custom" is reserved for the Custom answer. Pick another id.');
    if (o.change) for (const p of changeProblems(o.change, draft, itemIds)) problems.push(`Option "${o.id}": ${p}`);
  }
  if (msg.recommended && !ids.has(msg.recommended)) problems.push(`recommended is "${msg.recommended}", which isn't one of the option ids.`);
  return problems;
}

/** Item fields must be ones the plumbing type's rules file lists. */
export function fieldProblems(fields: Record<string, string> | undefined, type: PlumbingType): string[] {
  return Object.keys(fields ?? {})
    .filter((f) => !type.fields.includes(f))
    .map((f) => `"${f}" isn't a field of ${type.title}. Allowed: ${type.fields.join(', ') || 'none'}.`);
}

/**
 * What data checks need to know about a project's items. kindOfItem gives an item's data kind (null for plain list
 * items and items whose type is gone), or undefined when there's no such item. mockupItemIds are the UI items.
 */
export function itemDataKinds(items: Item[], types: PlumbingType[]): { kindOfItem: (itemId: string) => DataKind | null | undefined; mockupItemIds: Set<string> } {
  const typeById = new Map(types.map((t) => [t.id, t]));
  const kinds = new Map<string, DataKind | null>();
  for (const i of items) {
    const type = typeById.get(i.type);
    kinds.set(i.id, type ? dataKindOf(type) : null);
  }
  return { kindOfItem: (id) => kinds.get(id), mockupItemIds: new Set(items.filter((i) => kinds.get(i.id) === 'mockups').map((i) => i.id)) };
}

/** Problems with the data a change would write into items. Items that don't exist are left to changeProblems. */
export function changeDataProblems(change: Change, kindOfItem: (itemId: string) => DataKind | null | undefined, ctx: DataContext): string[] {
  const problems: string[] = [];
  for (const c of change.items ?? []) {
    if (c.patch.data === undefined) continue;
    const kind = kindOfItem(c.itemId);
    if (kind === undefined) continue;
    problems.push(...dataProblems(kind, c.patch.data, ctx).map((p) => `Item "${c.itemId}": ${p}`));
  }
  return problems;
}

/** changeDataProblems for every option's change, each prefixed with its option id. */
export function optionDataProblems(options: Option[] | undefined, kindOfItem: (itemId: string) => DataKind | null | undefined, ctx: DataContext): string[] {
  return (options ?? []).flatMap((o) => (o.change ? changeDataProblems(o.change, kindOfItem, ctx).map((p) => `Option "${o.id}": ${p}`) : []));
}

export const nothingSaved = (problems: string[], retry: string) => new InputError(`Nothing was saved. Fix these and ${retry}:\n- ${problems.join('\n- ')}`);
