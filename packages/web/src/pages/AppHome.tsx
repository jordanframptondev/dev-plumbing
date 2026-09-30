import type { ProjectSummary } from '@dev-plumbing/core/schemas';
import { summaryStatus } from '@dev-plumbing/core/schemas';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { api, type Tab } from '../api/client';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { Segmented } from '../components/Segmented';
import { StatusMark } from '../components/StatusMark';
import { formatUpdated } from '../lib/time';
import { useConfig } from '../lib/useConfig';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const shortClone = (clone: string | null) => (clone ? (clone.split('/').filter(Boolean).pop() ?? clone) : '');

export function AppHome() {
  const { data: config } = useConfig();
  const pageSize = config?.settings.homePageSize ?? 10;
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('active');
  const [pages, setPages] = useState(1);
  const limit = pageSize * pages;
  const projects = useQuery({
    queryKey: ['projects', q, tab, limit],
    queryFn: () => api.projects({ q, tab, offset: 0, limit }),
    placeholderData: keepPreviousData,
    enabled: Boolean(config),
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 md:px-6 md:pt-6">
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPages(1);
        }}
        placeholder="Search plumbing projects"
        aria-label="Search plumbing projects"
        className="w-full rounded-[10px] border-[0.5px] border-separator bg-cell px-3 py-2 text-[14px] text-ink placeholder:text-ink-3 focus:outline-2 focus:outline-slate"
      />
      <header className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[26px] font-bold leading-8 tracking-tight">Plumbing projects</h1>
        <nav className="ml-auto flex gap-4 text-[13px]">
          <Link to="/settings" className="text-slate">Settings</Link>
          <Link to="/rules" className="text-slate">Plumbing rules</Link>
        </nav>
      </header>
      <div className="mt-3 max-w-xs">
        <Segmented
          label="Filter"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPages(1);
          }}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'finalized', label: 'Finalized' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      {projects.error && <p className="mt-6 text-[13px] text-seal">{(projects.error as Error).message}</p>}

      {projects.data?.total === 0 && (
        <p className="mt-10 text-center text-[13px] text-ink-3" data-testid="empty-state">
          {q ? (
            `No plumbing projects match "${q}".`
          ) : tab === 'active' ? (
            'No active plumbing projects.'
          ) : tab === 'finalized' ? (
            'No finalized plumbing projects yet.'
          ) : (
            <>
              No plumbing projects yet. In Claude Code, run <code className="font-mono text-ink-2">/dev-plumbing path/to/plan.md</code>.
            </>
          )}
        </p>
      )}

      {projects.data && projects.data.items.length > 0 && (
        <ul aria-label="Plumbing projects" className="mt-4 overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell">
          {projects.data.items.map((p) => (
            <ProjectRow key={`${p.repo}/${p.id}`} p={p} />
          ))}
        </ul>
      )}

      {projects.data && projects.data.total > projects.data.items.length && (
        <div className="mt-4 flex justify-center">
          <Button onClick={() => setPages((n) => n + 1)}>Load more</Button>
        </div>
      )}
    </div>
  );
}

function ProjectRow({ p }: { p: ProjectSummary }) {
  const c = p.counts;
  const updated = formatUpdated(p.updatedAt);
  return (
    <li className="border-b-[0.5px] border-separator last:border-b-0">
      <Link to="/p/$repo/$project" params={{ repo: p.repo, project: p.id }} className="flex items-start gap-3 px-4 py-3 hover:bg-selection" data-testid="project-row">
        <span className="mt-1.5">
          <StatusMark status={p.status === 'broken' ? 'idle' : summaryStatus(c)} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[14px] font-semibold">{p.title}</span>
            {p.status === 'finalized' && <span className="text-[10.5px] font-semibold text-ink-3">Finalized</span>}
          </div>
          {p.sourcePath && <div className="truncate font-mono text-[11px] text-ink-3">{p.sourcePath}</div>}
          {p.error && <div className="text-[12px] text-seal">Couldn't read this project: {p.error}</div>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
            <span>
              {p.repo}
              {p.branch ? ` · ${shortClone(p.clone)} @ ${p.branch}` : ''}
            </span>
            {c.yourTurn > 0 && <span className="text-seal">{c.yourTurn} need you</span>}
            {c.drafts > 0 && <span>{plural(c.drafts, 'draft')}</span>}
            {c.withClaude > 0 && <span>{c.withClaude} with Claude</span>}
            <span className="text-ink-3 md:hidden">{updated}</span>
          </div>
        </div>
        <div className="hidden w-32 shrink-0 text-right md:block">
          <div className="text-[11.5px] text-ink-3">{updated}</div>
          {c.total > 0 && (
            <div className="mt-1.5">
              <ProgressBar resolved={c.resolved} total={c.total} withClaude={c.withClaude} />
              <div className="mt-1 text-[11px] text-ink-3">
                {c.resolved} / {c.total} resolved
              </div>
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
