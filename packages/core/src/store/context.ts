import path from 'node:path';
import { DEFENSE } from '../defenseType';
import { diffText } from '../docDiff';
import { availableTokens } from '../finalExport';
import { PLAN_CHANGES } from '../planChanges';
import {
  dataKindOf,
  dataShapeDoc,
  DEFENSE_SECTIONS,
  displayStatus,
  firstParagraph,
  headingsOf,
  parseData,
  sectionFor,
  type ClaudeMessage,
  type CodeRef,
  type Decision,
  type DefenseSectionId,
  type DisplayStatus,
  type Item,
  type Message,
  type PlumbingType,
  type RepoProfile,
  type Screen,
  type Thread,
  type ThreadStatus,
  type YouMessage,
} from '../schemas';
import { finalizeChecklist } from './checklist';
import { activeDecisions } from './decisions';
import { defenseMarkdown } from './defenseMarkdown';
import { finalName } from './finalize';
import { docPath, projectFiles, readDecisions, readDocText, readItem, readItems, readProjectFile, readThread, readThreads, StoreError } from './io';
import { presetLabel } from './threads';
import { readVersionDoc } from './versions';
import { defenseBasis, defenseDiagramItemIds, readDefense } from './whiteboard';

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
  /** For an item made from the Whiteboard Defense (a Defense thread, or one sent to plumbing): the whole defense as Markdown. Null otherwise. */
  defense: string | null;
  /** The accepted final, which a defense may explain, when the project has one. Read it; never write it. Null otherwise. */
  finalFile: string | null;
};

export type ImportPack = {
  project: { repo: string; id: string; title: string };
  type: { id: string; title: string; screen: Screen; timeline: boolean; fields: string[]; answerPresets: string[]; rules: string; dataShape: string | null };
  draft: string;
  profile: { name: string; schema?: RepoProfile['schema']; conventions: string[]; apps: { name: string; path: string; kitFiles: string[] }[]; planFolders: string[] } | null;
  /**
   * Every item but the Plan changes and Defense ones, which aren't part of the plan. One whose part of the plan was
   * removed says so.
   */
  existingItems: { id: string; type: string; title: string; removed?: true }[];
  /**
   * Set while a new version of the plan is re-imported, null at first import. `changes` is how the plan changed from
   * v`from` to v`to`; `conflicts` are the passages this update left to settle in Plan changes (`ours` is still in the
   * draft, `theirs` isn't yet); `existing` is this type's imported items, by key, so the importer can reuse a key for the
   * same thing.
   */
  reimport: {
    from: number;
    to: number;
    changes: string;
    /** In document order. `heading` is the heading above the passage, or null when there's none. */
    conflicts: { heading: string | null; ours: string; theirs: string }[];
    existing: {
      key: string;
      id: string;
      title: string;
      summary: string;
      body: string | null;
      fields: Record<string, string>;
      mdAnchor: { heading: string } | null;
      hasData: boolean;
      /** The item's drawing as it is now, with what the threads settled in it, or null. */
      data: unknown;
      removed: boolean;
    }[];
  } | null;
};

/** The text subagents follow when writing this type's `data`, or null when its items take none. */
function dataShapeFor(type: PlumbingType | undefined): string | null {
  const kind = type ? dataKindOf(type) : null;
  return kind ? dataShapeDoc(kind) : null;
}

/**
 * Two versions of the plan as a line diff: `+ ` added, `- ` removed and `  ` unchanged, keeping 2 unchanged lines
 * around each change. Each run of lines starts with `@@`. Empty when nothing changed.
 */
function planDiff(before: string, after: string): string {
  const CONTEXT = 2;
  const lf = (text: string) => text.replace(/\r\n/g, '\n');
  const lines: { mark: string; text: string }[] = [];
  for (const segment of diffText(lf(before), lf(after))) {
    const mark = segment.kind === 'added' ? '+' : segment.kind === 'removed' ? '-' : ' ';
    for (const text of segment.text.replace(/\n$/, '').split('\n')) lines.push({ mark, text });
  }
  const shown = lines.map(() => false);
  lines.forEach((line, i) => {
    if (line.mark === ' ') return;
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT); j++) shown[j] = true;
  });
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!shown[i]) return;
    if (i === 0 || !shown[i - 1]) out.push('@@');
    out.push(`${line.mark} ${line.text}`.trimEnd());
  });
  return out.join('\n');
}

/**
 * The passages the update to v`to` left to settle: its Plan changes items (keys `v<to>-<k>`), in the order it made
 * them, which is document order.
 */
function conflictsOf(items: Item[], to: number): NonNullable<ImportPack['reimport']>['conflicts'] {
  const prefix = `v${to}-`;
  const k = (i: Item) => Number(i.key!.slice(prefix.length));
  return items
    .filter((i) => i.type === PLAN_CHANGES && i.key?.startsWith(prefix) && i.conflict !== undefined)
    .sort((a, b) => k(a) - k(b))
    .map((i) => ({ heading: i.mdAnchor?.heading ?? null, ours: i.conflict!.ours, theirs: i.conflict!.theirs }));
}

/** Spec §13.2: what a thread subagent receives. */
export async function threadPack(o: { dir: string; threadId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ThreadPack> {
  const project = await readProjectFile(o.dir);
  const thread = await readThread(o.dir, o.threadId);
  const item = await readItem(o.dir, thread.itemId);
  const draft = await readDocText(o.dir, project.docs.draft);
  const { values: items } = await readItems(o.dir);
  const defenseThreads = new Set(items.filter((i) => i.type === DEFENSE).map((i) => i.threadId));
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
  const defense = item.fromDefense ? await readDefense(o.dir) : null;
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
    // Decisions made in Defense threads are about the Whiteboard Defense, not the plan: only a Defense thread sees them.
    decisions: activeDecisions(await readDecisions(o.dir))
      .filter((d) => item.type === DEFENSE || !defenseThreads.has(d.threadId))
      .map((d) => d.text),
    draftSection: section !== null && item.mdAnchor ? { heading: item.mdAnchor.heading, text: section } : null,
    draftHeadings: headingsOf(draft).map((h) => `${'#'.repeat(h.level)} ${h.text}`),
    draftFile: docPath(o.dir, project.docs.draft),
    conventions: o.profile?.conventions ?? [],
    defense: defense ? defenseMarkdown(defense, { title: project.title, itemTitles: Object.fromEntries(items.map((i) => [i.id, i.title])) }) : null,
    finalFile: project.docs.final ? docPath(o.dir, project.docs.final) : null,
  };
}

/**
 * What an importer receives: the whole draft, its plumbing type's whole rules file and data shape, and the repo profile.
 * In a re-import, also how the plan changed since the last version and this type's imported items.
 */
export async function importPack(o: { dir: string; typeId: string; types: PlumbingType[]; profile?: RepoProfile }): Promise<ImportPack> {
  const type = o.types.find((t) => t.id === o.typeId);
  if (!type) throw new StoreError(`There's no plumbing type "${o.typeId}".`);
  const project = await readProjectFile(o.dir);
  const { values: items } = await readItems(o.dir);
  const p = o.profile;
  const to = project.reimporting?.version;
  const reimport: ImportPack['reimport'] =
    to === undefined
      ? null
      : {
          from: to - 1,
          to,
          changes: planDiff((await readVersionDoc(o.dir, project, to - 1, 'original')) ?? '', (await readVersionDoc(o.dir, project, to, 'original')) ?? ''),
          conflicts: conflictsOf(items, to),
          existing: items.flatMap((i) =>
            i.type === type.id && i.createdBy === 'import' && i.key !== undefined
              ? [
                  {
                    key: i.key,
                    id: i.id,
                    title: i.title,
                    summary: i.summary,
                    body: i.body ?? null,
                    fields: i.fields ?? {},
                    mdAnchor: i.mdAnchor ? { heading: i.mdAnchor.heading } : null,
                    hasData: i.data !== undefined,
                    data: i.data ?? null,
                    removed: i.removedIn !== undefined,
                  },
                ]
              : [],
          ),
        };
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
    existingItems: items.filter((i) => i.type !== PLAN_CHANGES && i.type !== DEFENSE).map((i) => ({ id: i.id, type: i.type, title: i.title, ...(i.removedIn !== undefined ? { removed: true as const } : {}) })),
    reimport,
  };
}

export type FinalizePack = {
  project: { repo: string; id: string; title: string; sourcePath: string; name: string };
  /** outputs/finalize.md: the final's structure and rules. */
  rules: string;
  draft: string;
  /**
   * Every item that goes into the final, in plumbing-type order. Parked items, items of disabled types, Plan changes
   * items (what they settled is already in the draft) and Defense items (questions about the Whiteboard Defense) are
   * left out of the final, so they aren't here.
   */
  items: {
    id: string;
    type: string;
    typeTitle: string;
    title: string;
    summary: string;
    body: string | null;
    fields: Record<string, string>;
    status: DisplayStatus;
    codeRefs: CodeRef[];
    dataSummary: string | null;
  }[];
  /** The active decisions, each with what was chosen, what was turned down, and Claude's reasoning from its thread. */
  decisions: { text: string; itemId: string | null; itemTitle: string | null; chosen: string | null; rejected: string[]; why: string | null }[];
  /** Questions nobody answered: the final uses their default. */
  defaults: { itemId: string; title: string; defaultValue: string }[];
  /** Items Claude raised that are still waiting for an answer, none of them blocking. */
  openItems: { itemId: string; title: string; typeTitle: string }[];
  conventions: string[];
  /** The tokens the finalizer may use for diagrams, flows, schema blocks, migrations and mockup links, one per line. */
  tokens: string[];
  previousFinal: string | null;
};

/** Claude's reasoning for a decision is cut to this many characters. */
const WHY_MAX = 600;
const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DIAGRAM_KIND = { system: 'System diagram', data_flow: 'Data flow diagram' } as const;
const FLOW_KIND = { user: 'User flow', system: 'System flow', both: 'User and system flow' } as const;

/** A short phrase saying what an item's drawing holds, or null when it has none, or none that parses. */
function dataSummary(item: Item, type: PlumbingType | undefined): string | null {
  const kind = type ? dataKindOf(type) : null;
  if (!kind || item.data === undefined) return null;
  if (kind === 'diagram') {
    const d = parseData('diagram', item.data);
    if (!d.ok) return null;
    const groups = d.data.groups.length ? `, ${count(d.data.groups.length, 'group')}` : '';
    return `${DIAGRAM_KIND[d.data.kind]}: ${count(d.data.nodes.length, 'box', 'boxes')}${groups}`;
  }
  if (kind === 'database') {
    const t = parseData('database', item.data);
    return t.ok ? `Table ${t.data.model} (${t.data.change}): ${count(t.data.fields.length, 'field')}` : null;
  }
  if (kind === 'flows') {
    const f = parseData('flows', item.data);
    return f.ok ? `${FLOW_KIND[f.data.kind]}: ${count(f.data.steps.length, 'step')}` : null;
  }
  if (kind === 'mockups') {
    const m = parseData('mockups', item.data);
    if (!m.ok) return null;
    const sides = [m.data.after?.trim() ? 'After' : '', m.data.before?.trim() ? 'Before' : ''].filter(Boolean).join(' and ') || 'no markup';
    return `Mockup for ${[m.data.location.app, m.data.location.route].filter(Boolean).join(' ')}: ${sides}`;
  }
  const p = parseData('timeline', item.data);
  return p.ok ? `Phase ${p.data.order}: ${count(p.data.itemIds.length, 'item')}` : null;
}

/**
 * A decision, read back from its thread up to the moment it was made (a thread can carry on after it):
 * - chosen: the option or preset in your last answer;
 * - rejected: the other options on the Claude message you answered, when you picked one;
 * - why: Claude's last message by then, which is the resolving reply when Claude resolved it.
 */
function decisionDetail(d: Decision, o: { threads: Map<string, Thread>; items: Map<string, Item>; types: PlumbingType[] }): FinalizePack['decisions'][number] {
  const thread = o.threads.get(d.threadId);
  const item = o.items.get(thread?.itemId ?? d.itemIds[0] ?? '');
  const said: Message[] = (thread?.messages ?? []).filter((m) => m.at <= d.at);
  const answer = [...said].reverse().find((m): m is YouMessage => m.author === 'you');
  const asked = answer ? [...said.slice(0, said.indexOf(answer))].reverse().find((m): m is ClaudeMessage => m.author === 'claude' && Boolean(m.options?.length)) : undefined;
  const picked = answer?.optionId;
  const preset = item && picked?.startsWith('preset:') ? presetLabel(o.types, item, picked) : undefined;
  const reasoning = [...said].reverse().find((m): m is ClaudeMessage => m.author === 'claude');
  return {
    text: d.text,
    itemId: item?.id ?? null,
    itemTitle: item?.title ?? null,
    chosen: answer?.optionLabel ?? preset ?? null,
    rejected: picked ? (asked?.options ?? []).filter((op) => op.id !== picked).map((op) => op.label) : [],
    why: reasoning ? clip(reasoning.text, WHY_MAX) : null,
  };
}


/** The items that go into the final, and what the finalizer's and the whiteboard subagent's packs say about them. */
type PlanItems = {
  /** As stored, in plumbing-type order, then by title. */
  items: Item[];
  /** The same items, as the packs list them. */
  listed: FinalizePack['items'];
  decisions: FinalizePack['decisions'];
  defaults: FinalizePack['defaults'];
  openItems: FinalizePack['openItems'];
  /** The ids of the items that block Finalize. */
  blocking: Set<string>;
};

/**
 * The items that go into the final, with their decisions, the defaults that will be used and the items still open.
 * finalizePack and whiteboardPack both read the plan through this, so they always agree on what's in it.
 */
async function planItems(o: { dir: string; types: PlumbingType[] }): Promise<PlanItems> {
  const { values: allItems } = await readItems(o.dir);
  const { values: threads } = await readThreads(o.dir);
  const threadById = new Map(threads.map((t) => [t.id, t]));
  const typeOf = (item: Item) => o.types.find((t) => t.id === item.type);
  const statusOf = (item: Item): DisplayStatus => {
    const thread = threadById.get(item.threadId);
    return thread ? displayStatus(thread) : 'idle';
  };
  const order = (item: Item) => typeOf(item)?.order ?? Number.MAX_SAFE_INTEGER;
  // Parked items and items of disabled plumbing types don't go into the final (saveProposal refuses their tokens).
  // Nor do Plan changes items, since what they settled is already in the draft, or Defense items, which are questions
  // about the Whiteboard Defense. Leaving an item out leaves out the decisions about it too.
  const items = allItems
    .filter((i) => statusOf(i) !== 'parked' && typeOf(i)?.enabled !== false && i.type !== PLAN_CHANGES && i.type !== DEFENSE)
    .sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
  const checklist = await finalizeChecklist(o.dir, o.types);
  const blocking = new Set(checklist.blocking.map((e) => e.itemId));
  const context = { threads: threadById, items: new Map(allItems.map((i) => [i.id, i])), types: o.types };
  // A decision about an item left out of the final is left out with it. One about no item at all stays.
  const inPack = new Set(items.map((i) => i.id));
  return {
    items,
    listed: items.map((i) => ({
      id: i.id,
      type: i.type,
      typeTitle: typeOf(i)?.title ?? i.type,
      title: i.title,
      summary: i.summary,
      body: i.body ?? null,
      fields: i.fields ?? {},
      status: statusOf(i),
      codeRefs: i.codeRefs ?? [],
      dataSummary: dataSummary(i, typeOf(i)),
    })),
    decisions: activeDecisions(await readDecisions(o.dir))
      .map((d) => decisionDetail(d, context))
      .filter((d) => d.itemId === null || inPack.has(d.itemId)),
    defaults: checklist.defaults.map((e) => ({ itemId: e.itemId, title: e.title, defaultValue: e.defaultValue })),
    openItems: items
      .filter((i) => ['your_turn', 'draft'].includes(statusOf(i)) && !blocking.has(i.id))
      .map((i) => ({ itemId: i.id, title: i.title, typeTitle: typeOf(i)?.title ?? i.type })),
    blocking,
  };
}

/**
 * What the finalizer receives: the output rules, the whole draft, every item that goes into the final with a summary of
 * its drawing, the decisions with their why, the defaults that will be used, the items still open, the repo's
 * conventions, the tokens it may place, and the previous final. `rules` is read by the service from the config folder.
 */
export async function finalizePack(o: { dir: string; types: PlumbingType[]; profile?: RepoProfile; rules: string }): Promise<FinalizePack> {
  const project = await readProjectFile(o.dir);
  const plan = await planItems(o);
  return {
    project: { repo: project.repo, id: project.id, title: project.title, sourcePath: project.source.path, name: finalName(project.source.path) },
    rules: o.rules,
    draft: await readDocText(o.dir, project.docs.draft),
    items: plan.listed,
    decisions: plan.decisions,
    defaults: plan.defaults,
    openItems: plan.openItems,
    conventions: o.profile?.conventions ?? [],
    tokens: availableTokens(plan.items, o.types),
    previousFinal: await readDocText(o.dir, project.docs.final ?? 'docs/final.md').catch(() => null),
  };
}

/**
 * What the whiteboard subagent reads. The big texts are files it Reads, not text in the pack, so the pack stays well
 * under the size an MCP tool result may have, whatever the size of the plan.
 */
export type WhiteboardPack = {
  project: { repo: string; id: string; title: string; sourcePath: string; name: string };
  /** outputs/whiteboard-defense.md, or the shipped one when the user's is missing: the framework the defense follows. */
  rulesFile: string;
  /** What the defense explains (defenseBasis): the final while it's current, else the draft, at the plan's current version. */
  basedOn: { doc: 'final' | 'draft'; version: number };
  /** That document. */
  documentFile: string;
  /**
   * finalizePack's items. `file` is the item's own JSON, to Read for anything cut short here. `body` is cut to 800
   * characters. `data`, the drawing, is here only for a diagram, which diagramItemId may name; any other drawing has
   * just its `dataSummary`.
   */
  items: (FinalizePack['items'][number] & { file: string; data: unknown })[];
  decisions: FinalizePack['decisions'];
  /** Questions nobody answered: the plan assumes their default. */
  defaults: FinalizePack['defaults'];
  /** Every item that isn't resolved or parked: the plan's open questions, with where each stands and whether it blocks Finalize. */
  openItems: { itemId: string; title: string; typeTitle: string; status: DisplayStatus; blocking: boolean }[];
  conventions: string[];
  /** The repo profile's sensitive data tags. They raise the level. */
  sensitiveData: string[];
  /** The repo profile's database schema file and its apps, to Read when a section needs them. */
  schema: { type: string; path: string } | null;
  apps: { name: string; path: string }[];
  /** The ten prose sections to fill, in order, with their numbers among the 13. */
  sections: { id: DefenseSectionId; n: number; title: string }[];
  /** The items a section's diagramItemId may name: exactly the ones saveDefense accepts (defenseDiagramItemIds). */
  diagramItemIds: string[];
  /**
   * The saved defense's question texts, and the texts of its claims marked unknown or verify. A regenerate keeps the
   * wording of those that still apply: Practice keeps ratings, and sending matches unknowns, by text. Null with none saved.
   * At most the first 40 questions and 60 unknowns, each cut to 300 characters (ending "…"), so the pack stays small.
   */
  previous: { questions: string[]; unknowns: string[] } | null;
};

/**
 * An item's body in the pack is cut to this many characters, and says where the rest is. 40 items of long bodies then
 * stay under 60,000 characters of JSON, about 16,000 tokens, well inside an MCP tool result.
 */
const BODY_MAX = 800;
const CLIPPED = '… (clipped: Read file for the rest)';
/** The last defense's wording in the pack (`previous`): at most this many questions and unknowns, each cut to PREVIOUS_MAX characters. */
const PREVIOUS_QUESTIONS = 40;
const PREVIOUS_UNKNOWNS = 60;
const PREVIOUS_MAX = 300;
const clipPrevious = (text: string) => (text.length <= PREVIOUS_MAX ? text : `${text.slice(0, PREVIOUS_MAX - 1)}…`);

/**
 * What the whiteboard subagent receives: the framework and the document the defense is based on (as files to Read),
 * every item that goes into the final, the decisions with their why, the defaults, the items still open, the repo's
 * conventions, sensitive data, schema and apps, the sections to fill, the diagrams it may name, and the last defense's
 * wording. `rulesFile` is the rules file the service picked: the user's, or the shipped one.
 */
export async function whiteboardPack(o: { dir: string; types: PlumbingType[]; profile?: RepoProfile; rulesFile: string }): Promise<WhiteboardPack> {
  const project = await readProjectFile(o.dir);
  const plan = await planItems(o);
  const basis = await defenseBasis(o.dir);
  const saved = await readDefense(o.dir);
  const isDiagram = (item: Item) => {
    const type = o.types.find((t) => t.id === item.type);
    return type !== undefined && dataKindOf(type) === 'diagram';
  };
  const clipped = (body: string | null) => (body !== null && body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}${CLIPPED}` : body);
  return {
    project: { repo: project.repo, id: project.id, title: project.title, sourcePath: project.source.path, name: finalName(project.source.path) },
    rulesFile: o.rulesFile,
    basedOn: { doc: basis.doc, version: basis.version },
    documentFile: docPath(o.dir, basis.doc === 'final' && project.docs.final ? project.docs.final : project.docs.draft),
    items: plan.listed.map((entry, k) => {
      const item = plan.items[k];
      return { ...entry, body: clipped(entry.body), file: path.resolve(projectFiles(o.dir).item(item.id)), data: isDiagram(item) ? (item.data ?? null) : null };
    }),
    decisions: plan.decisions,
    defaults: plan.defaults,
    openItems: plan.listed
      .filter((i) => i.status !== 'resolved')
      .map((i) => ({ itemId: i.id, title: i.title, typeTitle: i.typeTitle, status: i.status, blocking: plan.blocking.has(i.id) })),
    conventions: o.profile?.conventions ?? [],
    sensitiveData: o.profile?.sensitiveData ?? [],
    schema: o.profile?.schema ?? null,
    apps: (o.profile?.apps ?? []).map((a) => ({ name: a.name, path: a.path })),
    sections: DEFENSE_SECTIONS.map((s) => ({ id: s.id, n: s.n, title: s.title })),
    diagramItemIds: await defenseDiagramItemIds(o.dir, o.types),
    previous: saved
      ? {
          questions: saved.questions.slice(0, PREVIOUS_QUESTIONS).map((q) => clipPrevious(q.q)),
          unknowns: saved.sections
            .flatMap((s) => s.claims.filter((c) => c.basis === 'unknown' || c.basis === 'verify').map((c) => c.text))
            .slice(0, PREVIOUS_UNKNOWNS)
            .map(clipPrevious),
        }
      : null,
  };
}
