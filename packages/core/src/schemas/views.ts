import type { PlumbingProject, Thread } from './project';
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
};

export type TypeItemRow = { id: string; title: string; summary: string; status: DisplayStatus; blocking: boolean };
