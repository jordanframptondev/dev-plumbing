import type {
  AgentsConfig,
  ConfigProblem,
  ProjectHome,
  ProjectSummary,
  RepoProfile,
  RuleSummary,
  Settings,
  TypeEntry,
  TypeItemRow,
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

export type Tab = 'active' | 'finalized' | 'all';
export type ConfigResponse = { dir: string; settings: Settings; agents: AgentsConfig; repos: RepoProfile[]; types: RuleSummary[]; outputs: string[]; problems: ConfigProblem[] };
export type RulesResponse = { types: RuleSummary[]; broken: { file: string; error: string }[]; outputs: string[] };
export type FileResponse = { text: string; hasDefault: boolean };

export const api = {
  config: () => request<ConfigResponse>('/api/config'),
  projects: (p: { q: string; tab: Tab; offset: number; limit: number }) =>
    request<{ items: ProjectSummary[]; total: number }>(`/api/projects?${new URLSearchParams({ q: p.q, tab: p.tab, offset: String(p.offset), limit: String(p.limit) })}`),
  projectHome: (repo: string, id: string) => request<ProjectHome>(`/api/projects/${enc(repo)}/${enc(id)}`),
  typeItems: (repo: string, id: string, type: string) => request<{ type: TypeEntry; items: TypeItemRow[] }>(`/api/projects/${enc(repo)}/${enc(id)}/types/${enc(type)}`),
  document: (repo: string, id: string, which: string) => request<{ text: string | null }>(`/api/projects/${enc(repo)}/${enc(id)}/docs/${enc(which)}`),
  open: (body: { target: 'config' } | { target: 'source'; repo: string; id: string }) => request<{ ok: true }>('/api/open', send('POST', body)),
  saveSettings: (value: unknown) => request<{ value: Settings; restartRequired: boolean; loginItemError?: string }>('/api/settings', send('PUT', value)),
  saveAgents: (value: unknown) => request<{ value: AgentsConfig }>('/api/agents', send('PUT', value)),
  saveRepo: (name: string, value: unknown) => request<{ value: RepoProfile }>(`/api/repos/${enc(name)}`, send('PUT', value)),
  rules: () => request<RulesResponse>('/api/rules'),
  rule: (file: string) => request<FileResponse>(`/api/rules/${enc(file)}`),
  saveRule: (file: string, text: string) => request<{ ok: true }>(`/api/rules/${enc(file)}`, send('PUT', { text })),
  createRule: (id: string, title: string) => request<{ file: string }>('/api/rules', send('POST', { id, title })),
  output: (name: string) => request<FileResponse>(`/api/outputs/${enc(name)}`),
  saveOutput: (name: string, text: string) => request<{ ok: true }>(`/api/outputs/${enc(name)}`, send('PUT', { text })),
  reset: (file: string) => request<{ ok: true; loginItemError?: string }>('/api/reset', send('POST', { file })),
};
