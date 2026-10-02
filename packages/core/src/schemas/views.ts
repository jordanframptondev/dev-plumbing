import type { ChangeState, Decision, Option, ThreadDraft } from './loop';
import type { Item, PlumbingProject, Thread } from './project';
import type { Screen } from './plumbingType';

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
  emptyMessage: string;
  itemCount: number;
  yourTurn: number;
  drafts: number;
  withClaude: number;
  resolved: number;
  noChanges: { reason: string } | null;
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
  listening?: ListeningState;
};

export type OpenOptions = { messageId: string; options: Option[]; recommended?: string };

export type TypeItemRow = {
  id: string; threadId: string; title: string; summary: string; status: DisplayStatus; blocking: boolean;
  fields: Record<string, string>; messageCount: number; latest: { author: 'you' | 'claude' | 'system'; text: string } | null;
  open: OpenOptions | null; draft: ThreadDraft | null; decision: string | null; flagged: boolean;
};

/** A projects folder that couldn't be read while listing plumbing projects. */
export type DiscoveryProblem = { folder: string; message: string };

export type DiffSegment = {
  kind: 'same' | 'added' | 'removed';
  text: string;
  changedBy?: { changeId: string; threadId: string; summary: string; threadTitle: string }[];
};
export type FieldChange = { field: string; before: string; after: string };
export type ChangePreview = { md: DiffSegment[] | null; items: { itemId: string; title: string; changes: FieldChange[] }[]; problem?: string };

export type ThreadDetail = {
  thread: Thread & { display: DisplayStatus };
  item: Item;
  type: { id: string; title: string; screen: Screen; fields: string[]; answerPresets: string[] };
  open: OpenOptions | null;
  previews: Record<string, ChangePreview>;
  linked: { itemId: string; threadId: string; title: string; typeTitle: string }[];
  refs: Record<string, { title: string; threadId: string; typeTitle: string }>;
  edits: Record<string, { state: ChangeState; summary: string }>;
  decisions: Decision[];
  listening: ListeningState;
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
