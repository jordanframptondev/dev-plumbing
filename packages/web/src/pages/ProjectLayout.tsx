import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useMatch, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { PageMessage } from '../components/PageMessage';
import { Segmented } from '../components/Segmented';
import { draftsLabel, useSubmit } from '../lib/useSubmit';
import { ProjectHeader } from './ProjectHeader';
import { ProjectNav } from './ProjectNav';

type Mode = 'view' | 'list' | 'defense';
type Tab = 'inbox' | 'plumbing' | 'defense';

export function ProjectLayout() {
  const { repo, project } = useParams({ from: '/p/$repo/$project' });
  const home = useQuery({ queryKey: ['projectHome', repo, project], queryFn: () => api.projectHome(repo, project) });
  const submitAll = useSubmit(repo, project);
  const navigate = useNavigate();
  const onInbox = Boolean(useMatch({ from: '/p/$repo/$project/', shouldThrow: false }));
  const [mode, setMode] = useState<Mode>('view');
  const tab: Tab = mode === 'defense' ? 'defense' : mode === 'list' ? 'plumbing' : onInbox ? 'inbox' : 'plumbing';
  const changeTab = (next: Tab) => {
    if (next === 'inbox') {
      void navigate({ to: '/p/$repo/$project', params: { repo, project } });
      setMode('view');
    } else setMode(next === 'plumbing' ? 'list' : 'defense');
  };

  if (home.error) return <PageMessage title="Couldn't open this plumbing project" body={(home.error as Error).message} />;
  if (!home.data) return <PageMessage title="Loading…" />;
  const d = home.data;
  const drafts = d.summary.counts.drafts;

  return (
    <div className="flex min-h-screen">
      <aside aria-label="Project navigation" className="sticky top-0 hidden h-screen w-[212px] shrink-0 overflow-y-auto border-r-[0.5px] border-separator bg-sidebar px-2 py-3 backdrop-blur-xl md:block">
        <Link to="/" className="mb-2 block px-2 text-[12px] text-slate">
          ‹ All projects
        </Link>
        <ProjectNav home={d} repo={repo} project={project} />
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-28 pt-3 md:px-7 md:pb-8 md:pt-5">
        <Link to="/" className="mb-1 inline-block text-[13px] text-slate md:hidden">
          ‹ Projects
        </Link>
        <ProjectHeader home={d} repo={repo} project={project} submitAll={submitAll} />
        <div className="mt-4 md:hidden">
          <Segmented<Tab>
            label="Project sections"
            value={tab}
            onChange={changeTab}
            options={[
              { value: 'inbox', label: 'Inbox' },
              { value: 'plumbing', label: 'Plumbing' },
              { value: 'defense', label: 'Defense' },
            ]}
          />
        </div>
        {mode === 'list' && (
          <div className="mt-3 md:hidden">
            <ProjectNav home={d} repo={repo} project={project} onNavigate={() => setMode('view')} />
          </div>
        )}
        {mode === 'defense' && <p className="mt-6 text-[13px] text-ink-3 md:hidden">Whiteboard Defense arrives in a later update.</p>}
        <div className={mode === 'view' ? 'mt-4' : 'mt-4 hidden md:block'}>
          <Outlet />
        </div>
      </main>
      <div className="fixed inset-x-0 bottom-0 border-t-[0.5px] border-separator bg-sidebar px-4 pb-6 pt-3 backdrop-blur-xl md:hidden">
        <Button variant="primary" size="lg" className="w-full" disabled={!drafts || submitAll.isPending} onClick={() => submitAll.mutate({ scope: 'all' })}>
          Submit all · {draftsLabel(drafts)}
        </Button>
      </div>
    </div>
  );
}
