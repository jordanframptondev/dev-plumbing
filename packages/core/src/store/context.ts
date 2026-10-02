import {
  dataKindOf,
  dataShapeDoc,
  firstParagraph,
  headingsOf,
  sectionFor,
  type Item,
  type Message,
  type PlumbingType,
  type RepoProfile,
  type Screen,
  type ThreadStatus,
} from '../schemas';
import { activeDecisions } from './decisions';
import { docPath, readDecisions, readDocText, readItem, readItems, readProjectFile, readThread, StoreError } from './io';

export type ThreadPack = {
  project: { repo: string; id: string; title: string; summary: string };
  /** `dataShape` is how this type's items write `data` (their drawing), or null for plain lists. */
  type: { id: string; title: string; screen: Screen; timeline: boolean; dataShape: string | null; rules: string; fields: string[]; answerPresets: string[] };
  item: Item;
  /** When `item.anchor` is set: the whole item it's about, data included. Null without an anchor, or when that item is gone. */
  anchored: Item | null;
  thread: { id: string; status: ThreadStatus; messages: Message[] };
  linked: { id: string; type: string; title: string; summary: string }[];
  decisions: string[];
  draftSection: { heading: string; text: string } | null;
  draftHeadings: string[];
  /** The whole draft, for patches outside the item's section. Read it; never write it. */
  draftFile: string;
  conventions: string[];
};

export type ImportPack = {
  project: { repo: string; id: string; title: string };
  type: { id: string; title: string; screen: Screen; timeline: boolean; fields: string[]; answerPresets: string[]; rules: string; dataShape: string | null };
  draft: string;
  profile: { name: string; schema?: RepoProfile['schema']; conventions: string[]; apps: { name: string; path: string; kitFiles: string[] }[]; planFolders: string[] } | null;
  existingItems: { id: string; type: string; title: string }[];
};

/** The text subagents follow when writing this type's `data`, or null when its items take none. */
function dataShapeFor(type: PlumbingType | undefined): string | null {
  const kind = type ? dataKindOf(type) : null;
  return kind ? dataShapeDoc(kind) : null;
}

/** Spec §13.2: what a thread subagent receives. */
export async function threadPack(o: { dir: string; threadId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ThreadPack> {
  const project = await readProjectFile(o.dir);
  const thread = await readThread(o.dir, o.threadId);
  const item = await readItem(o.dir, thread.itemId);
  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: items } = await readItems(o.dir);
  const type = o.types.find((t) => t.id === item.type);
  const linkedIds = new Set([...(item.links ?? []), ...items.filter((i) => i.links?.includes(item.id)).map((i) => i.id)]);
  const section = item.mdAnchor ? sectionFor(draft, item.mdAnchor.heading) : null;
  // A pin's item is about one part of another item; the subagent gets that item whole, so it can read the drawing.
  const anchored = item.anchor
    ? await readItem(o.dir, item.anchor.itemId).catch((e: unknown) => {
        if (e instanceof StoreError) return null;
        throw e;
      })
    : null;
  return {
    project: { repo: project.repo, id: project.id, title: project.title, summary: firstParagraph(draft) },
    type: {
      id: item.type,
      title: type?.title ?? item.type,
      screen: type?.screen ?? 'list',
      timeline: type?.timeline ?? false,
      dataShape: dataShapeFor(type),
      rules: type?.sections.Rules ?? '',
      fields: type?.fields ?? [],
      answerPresets: type?.answerPresets ?? [],
    },
    item,
    anchored,
    thread: { id: thread.id, status: thread.status, messages: thread.messages },
    linked: items.filter((i) => linkedIds.has(i.id)).map((i) => ({ id: i.id, type: i.type, title: i.title, summary: i.summary })),
    decisions: activeDecisions(await readDecisions(o.dir)).map((d) => d.text),
    draftSection: section !== null && item.mdAnchor ? { heading: item.mdAnchor.heading, text: section } : null,
    draftHeadings: headingsOf(draft).map((h) => `${'#'.repeat(h.level)} ${h.text}`),
    draftFile: docPath(o.dir, project.docs.draft),
    conventions: o.profile?.conventions ?? [],
  };
}

/** What an importer receives: the whole draft, its plumbing type's whole rules file and data shape, and the repo profile. */
export async function importPack(o: { dir: string; typeId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ImportPack> {
  const type = o.types.find((t) => t.id === o.typeId);
  if (!type) throw new StoreError(`There's no plumbing type "${o.typeId}".`);
  const project = await readProjectFile(o.dir);
  const { values: items } = await readItems(o.dir);
  const p = o.profile;
  return {
    project: { repo: project.repo, id: project.id, title: project.title },
    type: {
      id: type.id,
      title: type.title,
      screen: type.screen,
      timeline: type.timeline,
      fields: type.fields,
      answerPresets: type.answerPresets,
      rules: type.body,
      dataShape: dataShapeFor(type),
    },
    draft: await readDocText(o.dir, project.docs.draft),
    profile: p
      ? {
          name: p.name,
          ...(p.schema ? { schema: p.schema } : {}),
          conventions: p.conventions,
          apps: p.apps.map((a) => ({ name: a.name, path: a.path, kitFiles: a.kitFiles })),
          planFolders: p.planFolders,
        }
      : null,
    existingItems: items.map((i) => ({ id: i.id, type: i.type, title: i.title })),
  };
}
