import { CONFLICT_REASON, PLAN_CHANGES } from '../planChanges';
import {
  changeState,
  displayStatus,
  type ChecklistEntry,
  type DisplayStatus,
  type FinalizeChecklist,
  type HistoryEntry,
  type Item,
  type PlumbingType,
  type Thread,
} from '../schemas';
import { readHistory, readItems, readThreads } from './io';
import { latestOpen } from './threads';

/** Concern severities that block Finalize until they're resolved. Read from the field, whatever the type. */
const HIGH_SEVERITY = new Set(['critical', 'high']);

/** Why this item's thread blocks Finalize, or null. The first reason that applies wins. */
function blockingReason(item: Item, thread: Thread, status: DisplayStatus, pendingEdit: boolean): string | null {
  if (status === 'with_claude') return 'Claude is working on it.';
  const unresolved = status !== 'resolved';
  if (unresolved && item.type === PLAN_CHANGES) return CONFLICT_REASON;
  if (unresolved && item.fields?.blocking === 'true') return 'Blocking question, not resolved.';
  if (unresolved && HIGH_SEVERITY.has(item.fields?.severity?.trim().toLowerCase() ?? '')) return 'High-severity concern, not resolved.';
  // A proposal is a reply that offers a change. The importer's opening options are the item's first choices, not a proposal.
  const open = latestOpen(thread);
  if (open && !open.message.opening && open.options.some((o) => o.change)) return 'A proposal is waiting for your answer.';
  if (pendingEdit) return 'A small edit is waiting to be applied.';
  return null;
}

/**
 * The Finalize checklist from items, threads and history already read. Items are listed by plumbing type order,
 * then title, and each appears at most once: parked, else blocking, else (unless resolved) on a default, else
 * unreviewed when nobody has answered. Items of disabled types are left out, as the app doesn't show them.
 */
export function checklistFrom(o: { items: Item[]; threads: Thread[]; history: HistoryEntry[]; types: PlumbingType[] }): FinalizeChecklist {
  const threadById = new Map(o.threads.map((t) => [t.id, t]));
  const typeById = new Map(o.types.map((t) => [t.id, t]));
  const pendingEdits = new Set(o.history.filter((h) => h.kind === 'small-edit' && changeState(h) === 'pending').map((h) => h.threadId));
  const order = (i: Item) => typeById.get(i.type)?.order ?? Number.MAX_SAFE_INTEGER;
  const items = o.items.filter((i) => typeById.get(i.type)?.enabled !== false).sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
  const list: FinalizeChecklist = { blocking: [], defaults: [], parked: [], unreviewed: [], canStart: true };
  for (const item of items) {
    const thread = threadById.get(item.threadId);
    if (!thread) continue;
    const entry = (reason: string): ChecklistEntry => ({
      itemId: item.id,
      threadId: thread.id,
      title: item.title,
      typeTitle: typeById.get(item.type)?.title ?? item.type,
      reason,
    });
    const status = displayStatus(thread);
    if (status === 'parked') {
      // An item parked because its part of the plan was removed says so.
      list.parked.push(entry(item.removedIn ? `Removed from the plan in v${item.removedIn}.` : 'Parked.'));
      continue;
    }
    const blocked = blockingReason(item, thread, status, pendingEdits.has(thread.id));
    if (blocked) {
      list.blocking.push(entry(blocked));
      continue;
    }
    if (status === 'resolved') continue;
    const defaultValue = item.fields?.default?.trim();
    if (defaultValue) list.defaults.push({ ...entry('No answer yet; the default will be used.'), defaultValue });
    else if (!thread.messages.some((m) => m.author === 'you')) list.unreviewed.push(entry('Nobody has answered here.'));
  }
  list.canStart = list.blocking.length === 0;
  return list;
}

/** What blocks Finalize, what will use a default, what's parked and what nobody reviewed (spec §10.5, §11). */
export async function finalizeChecklist(dir: string, types: PlumbingType[]): Promise<FinalizeChecklist> {
  const [{ values: items }, { values: threads }, history] = await Promise.all([readItems(dir), readThreads(dir), readHistory(dir)]);
  return checklistFrom({ items, threads, history, types });
}

/** Changes applied, and not undone, after the last final was accepted at `exportedAt`. 0 when there's no final. */
export function changesSinceFinal(history: HistoryEntry[], exportedAt: string | undefined): number {
  if (!exportedAt) return 0;
  return history.filter((h) => changeState(h) === 'applied' && (h.appliedAt ?? '') > exportedAt).length;
}
