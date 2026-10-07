import type { ChangeState, Decision, Option, ThreadDraft } from './loop';
import type { Item, PlanVersion, PlumbingProject, Thread } from './project';
import type { Screen } from './plumbingType';
import type { Anchor, DataKind } from './data';
import type { FinalizeChecklist, FinalizeRequest, FinalizeState } from './finalize';
import type { DefenseRefKind, Rating, WhiteboardDefense, WhiteboardRequest, WhiteboardState } from './whiteboard';

export type ConfigProblem = { file: string; key?: string; message: string };
export type RuleSummary = { file: string; id: string; title: string; order: number; screen: Screen; enabled: boolean };

export type DisplayStatus = 'your_turn' | 'draft' | 'with_claude' | 'resolved' | 'parked' | 'idle';
export type ThreadCounts = { yourTurn: number; drafts: number; withClaude: number; resolved: number; parked: number; total: number };

/** A thread you've typed into but not sent shows as a draft. */
export function displayStatus(thread: Pick<Thread, 'status' | 'draft'>): DisplayStatus {
  if (thread.draft && (thread.status === 'your_turn' || thread.status === 'idle')) return 'draft';
  return thread.status;
}

export function countThreads(statuses: DisplayStatus[]): ThreadCounts {
  const c: ThreadCounts = { yourTurn: 0, drafts: 0, withClaude: 0, resolved: 0, parked: 0, total: 0 };
  for (const s of statuses) {
    if (s === 'idle') continue;
    c.total++;
    if (s === 'your_turn') c.yourTurn++;
    else if (s === 'draft') c.drafts++;
    else if (s === 'with_claude') c.withClaude++;
    else if (s === 'resolved') c.resolved++;
    else c.parked++;
  }
  return c;
}

export function summaryStatus(c: ThreadCounts): DisplayStatus {
  if (c.yourTurn) return 'your_turn';
  if (c.drafts) return 'draft';
  if (c.withClaude) return 'with_claude';
  if (c.total > 0 && c.resolved + c.parked === c.total) return 'resolved';
  return 'idle';
}

/** A Claude window for this project: waiting for a submission, busy answering one, or none. */
export type ListeningState = 'waiting' | 'busy' | null;
export type LiveEvent = { type: 'project'; repo: string; id: string } | { type: 'projects' } | { type: 'config' };

export type ProjectSummary = {
  repo: string;
  id: string;
  title: string;
  sourcePath: string | null;
  clone: string | null;
  branch: string | null;
  status: PlumbingProject['status'] | 'broken';
  updatedAt: string;
  counts: ThreadCounts;
  error?: string;
  listening?: ListeningState;
};

export type TypeEntry = {
  id: string;
  title: string;
  order: number;
  screen: Screen;
  /** A list with a timeline strip (Phases). Its items carry phase data. */
  timeline: boolean;
  emptyMessage: string;
  itemCount: number;
  yourTurn: number;
  drafts: number;
  withClaude: number;
  resolved: number;
  noChanges: { reason: string } | null;
  /** The importer never wrote this type, so the app says "Didn't finish" instead of "No changes". */
  importFailed: boolean;
  fields: string[];
  answerPresets: string[];
  addLabel?: string;
};

export type InboxEntry = {
  threadId: string;
  itemId: string;
  itemTitle: string;
  type: string;
  typeTitle: string;
  status: DisplayStatus;
  blocking: boolean;
  lastMessage: { author: 'you' | 'claude' | 'system'; text: string } | null;
};

export type ProjectHome = {
  summary: ProjectSummary;
  project: PlumbingProject;
  types: TypeEntry[];
  inbox: InboxEntry[];
  documents: { original: boolean; draft: boolean; final: boolean };
  /** The plan version the working original and draft hold, and how many versions there are (1 until an update). */
  version: { current: number; count: number };
  listening?: ListeningState;
  /**
   * For the header's Finalize spec button. `state` is the finalize request's, or null when none is under way.
   * `changesSinceFinal` counts the changes applied since the last Accept (0 with no final). `planVersionSinceFinal` is
   * the newest plan version that came in after the last Accept and changed the draft, or null.
   */
  finalize: { canStart: boolean; blockingCount: number; state: FinalizeState | null; changesSinceFinal: number; planVersionSinceFinal: number | null };
  /**
   * For the header and the navigation's Whiteboard Defense: whether one is saved, whether it's out of date, and the
   * state of the request for a new one, or null when none is waiting, being written or failed.
   */
  defense: { ready: boolean; stale: boolean; state: WhiteboardState | null };
};

/** One version in the Versions list (GET …/versions, newest first). `current` marks the one the working files hold. */
export type VersionSummary = PlanVersion & { current: boolean };

export type OpenOptions = { messageId: string; options: Option[]; recommended?: string };

export type TypeItemRow = {
  id: string; threadId: string; title: string; summary: string; status: DisplayStatus; blocking: boolean;
  fields: Record<string, string>; messageCount: number; latest: { author: 'you' | 'claude' | 'system'; text: string } | null;
  open: OpenOptions | null; draft: ThreadDraft | null; decision: string | null; flagged: boolean;
  /** The item's drawing as stored (raw: screens parse it with parseData), or null when it has none. */
  data: unknown; body: string | null; links: string[]; anchor: Anchor | null;
  createdBy: 'import' | 'claude' | 'you' | 'whiteboard';
  /** Checks against the plan's clone, made when the screen loads. Never stored. */
  checks: DataChecks | null;
  /** Timeline types: each item in data.itemIds that exists, for the phase's links. {} for other types. */
  itemRefs: Record<string, { title: string; threadId: string; typeTitle: string }>;
  /** The plan version whose update removed the item's part of the plan, or null while it's still in the plan. */
  removedIn: number | null;
};

/** A projects folder that couldn't be read while listing plumbing projects. */
export type DiscoveryProblem = { folder: string; message: string };

export type DiffSegment = {
  kind: 'same' | 'added' | 'removed';
  text: string;
  changedBy?: { changeId: string; threadId: string; summary: string; threadTitle: string }[];
};
export type FieldChange = { field: string; before: string; after: string };
export type ChangePreview = {
  md: DiffSegment[] | null;
  /** `data` is set when a patch changes a drawn item's data: what it does, in words, and the proposed data. */
  items: { itemId: string; title: string; changes: FieldChange[]; data?: { kind: DataKind; summary: string[]; after: unknown } }[];
  problem?: string;
};

export type ThreadDetail = {
  thread: Thread & { display: DisplayStatus };
  item: Item;
  type: { id: string; title: string; screen: Screen; timeline: boolean; fields: string[]; answerPresets: string[] };
  open: OpenOptions | null;
  previews: Record<string, ChangePreview>;
  linked: { itemId: string; threadId: string; title: string; typeTitle: string }[];
  refs: Record<string, { title: string; threadId: string; typeTitle: string }>;
  edits: Record<string, { state: ChangeState; summary: string }>;
  decisions: Decision[];
  listening: ListeningState;
  /** The item's checks against the plan's clone, made when the thread loads. Never stored. */
  checks: DataChecks | null;
  /** For a pin ("Ask about this box", + Pin): the item it's on. */
  anchorParent: { itemId: string; threadId: string; title: string; typeId: string } | null;
};
export type SubmitResponse = { resolved: number; sent: number; skipped: { threadId: string; reason: string }[]; listening: ListeningState; message: string };
export type ChangeEntry = { id: string; at: string; kind: 'small-edit' | 'accept'; summary: string; state: ChangeState; threadId: string; threadTitle: string };
export type ChangesResponse = { segments: DiffSegment[]; entries: ChangeEntry[] };

/**
 * What an item's drawing looks like next to the plan's clone, worked out each time it's shown and never stored.
 * diagram: node id -> its file reference was found, for nodes with a codeRef, or why it wasn't checked (no clone).
 * database: warnings against the repo's Prisma schema, or why it wasn't checked.
 */
export type DataChecks =
  | { kind: 'diagram'; checked: true; nodes: Record<string, boolean> }
  | { kind: 'diagram'; checked: false; reason: string; nodes: Record<string, never> }
  | { kind: 'database'; checked: true; file: string; warnings: string[] }
  | { kind: 'database'; checked: false; reason: string; warnings: [] };

/** What a mockup's toolbar says about its design kit: the app it came from, its files, and what was skipped. */
export type MockupKitInfo = { app: string | null; files: string[]; warnings: string[] };

/** The Finalize page: GET /api/projects/:repo/:id/finalize. */
export type FinalizeView = {
  checklist: FinalizeChecklist;
  request: FinalizeRequest | null;
  /**
   * The finalizer's proposal. Stale once the draft, an item or a decision changed after it was written (finalInputsHash).
   * diff is against docs/final.md, when there is one.
   */
  proposal: { markdown: string; stale: boolean; diff: DiffSegment[] | null } | null;
  /** The last accepted final: where it was copied, and the command that turns it into an implementation plan. */
  final: { exportedTo: NonNullable<PlumbingProject['docs']['exportedTo']>; nextCommand: string } | null;
  /** The clones this project was opened from that are still folders on this Mac, the source clone first. */
  clones: { path: string; source: boolean }[];
  /** finalName(source.path): the repo copy is <name>.final.md, with mockups in <name>.assets/. */
  name: string;
  listening: ListeningState;
  changesSinceFinal: number;
  /** The newest plan version that came in after the last final and changed the draft, or null. */
  planVersionSinceFinal: number | null;
};

/** A Defense thread asked about a part of the defense, or an item sent from it to Questions or Concerns. */
export type DefenseLink = { kind: DefenseRefKind; ref: string; itemId: string; threadId: string; typeId: string; title: string; status: DisplayStatus };

/** Practice for the current defense: your ratings and ticks by id, and how ready you are (spec §12). */
export type PracticeView = {
  /** By question id, for the current defense. */
  ratings: Record<string, Rating>;
  /** The checklist ids ticked. */
  ticks: string[];
  /**
   * 0–100: round(100 × the mean of the scores there are): the cards' (could + shaky / 2) / cards and the checklist's
   * ticked / lines. 0 with neither.
   */
  readiness: number;
  counts: { could: number; shaky: number; couldnt: number; unrated: number; ticked: number; checklist: number };
};

/** The Whiteboard Defense page: GET /api/projects/:repo/:id/whiteboard. */
export type WhiteboardView = {
  request: WhiteboardRequest | null;
  defense: WhiteboardDefense | null;
  /** The Out of date line, or null while the defense is current (or there's none). */
  stale: string | null;
  /** Null with no defense. */
  practice: PracticeView | null;
  /** Defense threads about the current defense, oldest first. */
  asked: DefenseLink[];
  /** Questions and Concerns items sent from the current defense. */
  sent: DefenseLink[];
  /** False while the plan is importing, or while a request is requested or writing. */
  canGenerate: boolean;
  /** Why not, in the refusal's exact words. */
  generateRefusal: string | null;
  listening: ListeningState;
  /** The clones this project was opened from that are still folders on this Mac, the source clone first. */
  clones: { path: string; source: boolean }[];
  /** `${dirname(sourcePath)}/${name}.whiteboard-defense.md`, relative to a clone. */
  exportPath: string;
};
export type GenerateWhiteboardResponse = { request: WhiteboardRequest; listening: ListeningState; message: string };
export type AskDefenseResponse = SubmitResponse & { threadId: string };
export type SendFromDefenseResponse = { itemId: string; threadId: string; typeId: string; typeTitle: string; listening: ListeningState; message: string };
