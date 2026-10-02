import { diffDocuments, previewChange } from '../docDiff';
import { changeState, displayStatus, type ChangePreview, type ChangesResponse, type ListeningState, type PlumbingType, type ThreadDetail } from '../schemas';
import { activeDecisions } from './decisions';
import { readDecisions, readDocText, readHistory, readItem, readItems, readProjectFile, readThread, readThreads } from './io';
import { openOptions } from './threads';

export const NO_WINDOW = 'Saved. No Claude window is listening. Run /dev-plumbing in any clone.';

/** What the app says after Send this thread or Submit all. */
export function submitMessage(r: { resolved: number; sent: number; skipped: { reason: string }[] }, listening: ListeningState): string {
  const parts: string[] = [];
  if (r.resolved) parts.push(`Applied. ${r.resolved} thread${r.resolved === 1 ? '' : 's'} resolved.`);
  if (r.sent) {
    parts.push(
      listening === 'waiting'
        ? 'Sent to Claude.'
        : listening === 'busy'
          ? `Saved. Claude is finishing earlier threads and will pick ${r.sent === 1 ? 'this' : 'these'} up next.`
          : NO_WINDOW,
    );
  }
  if (parts.length) return parts.join(' ');
  return r.skipped[0]?.reason ?? 'Nothing to send yet.';
}

export async function loadThreadDetail(o: { dir: string; threadId: string; types: PlumbingType[] }): Promise<Omit<ThreadDetail, 'listening'>> {
  const thread = await readThread(o.dir, o.threadId);
  const item = await readItem(o.dir, thread.itemId);
  const project = await readProjectFile(o.dir);
  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: items } = await readItems(o.dir);
  const typeOf = (typeId: string) => o.types.find((t) => t.id === typeId);
  const type = typeOf(item.type);
  const refFor = (id: string) => {
    const i = items.find((x) => x.id === id);
    return i ? { title: i.title, threadId: i.threadId, typeTitle: typeOf(i.type)?.title ?? i.type } : null;
  };

  const open = openOptions(thread);
  const previews: Record<string, ChangePreview> = {};
  for (const option of open?.options ?? []) if (option.change) previews[option.id] = previewChange(draft, items, option.change);

  const linkedIds = new Set([...(item.links ?? []), ...items.filter((i) => i.links?.includes(item.id)).map((i) => i.id)]);
  const linked = [...linkedIds].flatMap((id) => {
    const r = refFor(id);
    return r ? [{ itemId: id, threadId: r.threadId, title: r.title, typeTitle: r.typeTitle }] : [];
  });

  const refs: ThreadDetail['refs'] = {};
  const editIds = new Set<string>();
  for (const m of thread.messages) {
    if (m.author !== 'claude') continue;
    for (const id of [...(m.newItemIds ?? []), ...(m.impacts ?? []).map((x) => x.itemId)]) {
      const r = refFor(id);
      if (r) refs[id] = r;
    }
    for (const e of m.smallEdits ?? []) editIds.add(e.changeId);
  }
  const edits: ThreadDetail['edits'] = {};
  for (const h of await readHistory(o.dir)) if (editIds.has(h.id)) edits[h.id] = { state: changeState(h), summary: h.summary };

  return {
    thread: { ...thread, display: displayStatus(thread) },
    item,
    type: { id: item.type, title: type?.title ?? item.type, screen: type?.screen ?? 'list', fields: type?.fields ?? [], answerPresets: type?.answerPresets ?? [] },
    open,
    previews,
    linked,
    refs,
    edits,
    decisions: activeDecisions(await readDecisions(o.dir)).filter((d) => d.itemIds.includes(item.id) || d.threadId === thread.id),
  };
}

/** The Draft's Changes view: the diff against the original, and every recorded change, newest first. */
export async function loadChanges(dir: string): Promise<ChangesResponse> {
  const project = await readProjectFile(dir);
  const [original, draft, history] = await Promise.all([readDocText(dir, project.docs.original), readDocText(dir, project.docs.draft), readHistory(dir)]);
  const { values: threads } = await readThreads(dir);
  const { values: items } = await readItems(dir);
  const titleOf = (threadId: string) => {
    const itemId = threads.find((t) => t.id === threadId)?.itemId;
    return items.find((i) => i.id === itemId)?.title ?? threadId;
  };
  return {
    segments: diffDocuments(original, draft, history, titleOf),
    entries: [...history].reverse().map((h) => ({ id: h.id, at: h.at, kind: h.kind, summary: h.summary, state: changeState(h), threadId: h.threadId, threadTitle: titleOf(h.threadId) })),
  };
}
