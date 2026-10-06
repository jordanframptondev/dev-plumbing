import type {
  AgentsConfig,
  Anchor,
  ChangesResponse,
  ConfigProblem,
  DiffSegment,
  MockupKitInfo,
  DiscoveryProblem,
  FinalizeRequest,
  FinalizeView,
  ListeningState,
  PlumbingProject,
  ProjectHome,
  ProjectSummary,
  RepoProfile,
  RuleSummary,
  Settings,
  SubmitResponse,
  ThreadDetail,
  TypeEntry,
  TypeItemRow,
  VersionSummary,
} from '@dev-plumbing/core/schemas';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`, body);
  return body as T;
}

const enc = encodeURIComponent;
const send = (method: string, value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });

const proj = (repo: string, id: string) => `/api/projects/${enc(repo)}/${enc(id)}`;
/** One side of a UI item's mockup document. It's an iframe src, so it's a URL, not a request. */
export const mockupUrl = (repo: string, id: string, itemId: string, side: 'after' | 'before') => `${proj(repo, id)}/items/${enc(itemId)}/mockup/${side}`;
/** The mockup an open thread option proposes, before it's accepted. Also an iframe src. */
export const proposalMockupUrl = (repo: string, id: string, threadId: string, optionId: string, side: 'after' | 'before') =>
  `${proj(repo, id)}/threads/${enc(threadId)}/options/${enc(optionId)}/mockup/${side}`;
export type DraftInput = { optionId?: string; note?: string; text?: string };
export type SubmitBody = { scope: 'all' } | { scope: 'thread'; threadId: string };

export type Tab = 'active' | 'finalized' | 'all';
export type ConfigResponse = {
  dir: string;
  settings: Settings;
  agents: AgentsConfig;
  repos: RepoProfile[];
  types: RuleSummary[];
  outputs: string[];
  problems: ConfigProblem[];
  /** Detect again: the repos waiting for it, and when each was last detected (ISO). */
  detect: { pending: string[]; last: Record<string, string> };
};
export type RulesResponse = { types: RuleSummary[]; broken: { file: string; error: string }[]; outputs: string[] };
export type FileResponse = { text: string; hasDefault: boolean };
/** Start finalize: the saved request, whether a Claude window is listening, and what to tell you. */
export type StartFinalizeResponse = { request: FinalizeRequest; listening: ListeningState; message: string };
/** Accept: where the final was copied, and the command to run next. */
export type AcceptFinalResponse = { exportedTo: NonNullable<PlumbingProject['docs']['exportedTo']>; nextCommand: string };

export const api = {
  config: () => request<ConfigResponse>('/api/config'),
  projects: (p: { q: string; tab: Tab; offset: number; limit: number }) =>
    request<{ items: ProjectSummary[]; total: number; problems: DiscoveryProblem[] }>(`/api/projects?${new URLSearchParams({ q: p.q, tab: p.tab, offset: String(p.offset), limit: String(p.limit) })}`),
  projectHome: (repo: string, id: string) => request<ProjectHome>(`/api/projects/${enc(repo)}/${enc(id)}`),
  typeItems: (repo: string, id: string, type: string) => request<{ type: TypeEntry; items: TypeItemRow[] }>(`/api/projects/${enc(repo)}/${enc(id)}/types/${enc(type)}`),
  document: (repo: string, id: string, which: string) => request<{ text: string | null }>(`/api/projects/${enc(repo)}/${enc(id)}/docs/${enc(which)}`),
  open: (body: { target: 'config' } | { target: 'source'; repo: string; id: string }) => request<{ ok: true }>('/api/open', send('POST', body)),
  saveSettings: (value: unknown) => request<{ value: Settings; restartRequired: boolean; loginItemError?: string }>('/api/settings', send('PUT', value)),
  saveAgents: (value: unknown) => request<{ value: AgentsConfig }>('/api/agents', send('PUT', value)),
  saveRepo: (name: string, value: unknown) => request<{ value: RepoProfile }>(`/api/repos/${enc(name)}`, send('PUT', value)),
  detectRepo: (name: string) => request<{ ok: true }>(`/api/repos/${enc(name)}/detect`, send('POST', {})),
  rules: () => request<RulesResponse>('/api/rules'),
  rule: (file: string) => request<FileResponse>(`/api/rules/${enc(file)}`),
  saveRule: (file: string, text: string) => request<{ ok: true }>(`/api/rules/${enc(file)}`, send('PUT', { text })),
  createRule: (id: string, title: string) => request<{ file: string }>('/api/rules', send('POST', { id, title })),
  output: (name: string) => request<FileResponse>(`/api/outputs/${enc(name)}`),
  saveOutput: (name: string, text: string) => request<{ ok: true }>(`/api/outputs/${enc(name)}`, send('PUT', { text })),
  thread: (repo: string, id: string, threadId: string) => request<ThreadDetail>(`${proj(repo, id)}/threads/${enc(threadId)}`),
  saveDraft: (repo: string, id: string, threadId: string, draft: DraftInput | null) =>
    request<{ ok: true }>(`${proj(repo, id)}/threads/${enc(threadId)}/draft`, send('PUT', draft ?? { clear: true })),
  park: (repo: string, id: string, threadId: string, parked: boolean) =>
    request<{ ok: true }>(`${proj(repo, id)}/threads/${enc(threadId)}/park`, send('POST', { parked })),
  submit: (repo: string, id: string, body: SubmitBody) => request<SubmitResponse>(`${proj(repo, id)}/submit`, send('POST', body)),
  addItem: (repo: string, id: string, body: { type: string; title: string; text: string; fields?: Record<string, string>; anchor?: Anchor }) =>
    request<SubmitResponse & { threadId: string }>(`${proj(repo, id)}/items`, send('POST', body)),
  mockupKit: (repo: string, id: string, itemId: string) => request<MockupKitInfo>(`${proj(repo, id)}/items/${enc(itemId)}/mockup-kit`),
  changes: (repo: string, id: string) => request<ChangesResponse>(`${proj(repo, id)}/changes`),
  changeAction: (repo: string, id: string, changeId: string, action: 'undo' | 'apply') =>
    request<{ ok: true }>(`${proj(repo, id)}/changes/${enc(changeId)}/${action}`, send('POST', {})),
  reset: (file: string) => request<{ ok: true; loginItemError?: string }>('/api/reset', send('POST', { file })),
  finalize: (repo: string, id: string) => request<FinalizeView>(`${proj(repo, id)}/finalize`),
  startFinalize: (repo: string, id: string) => request<StartFinalizeResponse>(`${proj(repo, id)}/finalize`, send('POST', {})),
  acceptFinal: (repo: string, id: string, clone: string) => request<AcceptFinalResponse>(`${proj(repo, id)}/finalize/accept`, send('POST', { clone })),
  discardProposal: (repo: string, id: string) => request<{ ok: true }>(`${proj(repo, id)}/finalize/discard`, send('POST', {})),
  versions: (repo: string, id: string) => request<{ versions: VersionSummary[] }>(`${proj(repo, id)}/versions`),
  versionDoc: (repo: string, id: string, n: number, which: 'original' | 'draft') => request<{ text: string | null }>(`${proj(repo, id)}/versions/${n}/${which}`),
  compareVersions: (repo: string, id: string, from: number, to: number, which: 'original' | 'draft') =>
    request<{ segments: DiffSegment[] }>(`${proj(repo, id)}/versions/compare?${new URLSearchParams({ from: String(from), to: String(to), which })}`),
  updateDiff: (repo: string, id: string, n: number) => request<{ segments: DiffSegment[] }>(`${proj(repo, id)}/versions/${n}/update-diff`),
};
